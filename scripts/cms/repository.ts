import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, readdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { digest, parseArticle, readSafe, requireValue, UUID } from './content.ts';
import type { Snapshot } from './content.ts';
import type { Ledger } from './transaction.ts';

export function git(root: string, args: string[], env = process.env): string {
  try { return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore','pipe','pipe'], env, maxBuffer: 80 * 1024 * 1024 }).trim(); }
  catch { throw new Error(`Git operation failed (${args[0]}); private details withheld`); }
}
export async function writeJson(file: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', 'utf8');
  await rename(temporary, file);
}
export async function readLedger(root: string): Promise<Ledger> {
  const state = JSON.parse(await readFile(path.join(root, 'ledger', 'state.json'), 'utf8')) as Ledger;
  requireValue(state.version === 1 && state.articles && state.requests && state.access, 'Invalid publication ledger');
  for (const [id, record] of Object.entries(state.articles)) {
    requireValue(UUID.test(id) && Number.isSafeInteger(record.sequence) && record.sequence >= 0 && Array.isArray(record.history), 'Invalid ledger article');
    requireValue(['public','unlisted','password','private'].includes(record.visibility), 'Invalid ledger visibility');
  }
  return state;
}
export const snapshotPath = (root: string, id: string, hash: string): string => {
  requireValue(UUID.test(id) && /^[0-9a-f]{64}$/.test(hash), 'Invalid snapshot reference');
  return path.join(root, 'releases', 'articles', id, `${hash}.json`);
};
export async function storeSnapshot(root: string, snapshot: Snapshot): Promise<void> {
  const file = snapshotPath(root, snapshot.article.id, snapshot.hash);
  await mkdir(path.dirname(file), { recursive: true });
  const text = JSON.stringify(snapshot);
  try { await writeFile(file, text, { encoding: 'utf8', flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; requireValue(await readFile(file, 'utf8') === text, 'Immutable snapshot collision'); }
}
export async function loadSnapshot(root: string, id: string, hash: string): Promise<Snapshot> {
  const snapshot = JSON.parse(await readFile(snapshotPath(root, id, hash), 'utf8')) as Snapshot;
  requireValue(snapshot.version === 1 && snapshot.article.id === id && snapshot.hash === hash && digest(JSON.stringify({ article: snapshot.article, media: snapshot.media })) === hash, 'Snapshot integrity mismatch');
  for (const media of snapshot.media) requireValue(digest(Buffer.from(media.dataBase64, 'base64')) === media.sha256, 'Immutable media integrity mismatch');
  return snapshot;
}
export interface SourceRecord { id: string; raw: string; sourceBlob: string; sourceRevision: string; title: string }
export async function scanSources(root: string, authoritative = true): Promise<SourceRecord[]> {
  const mediaRevision = authoritative ? (() => {
    const entry = git(root, ['ls-tree','HEAD','--','media']);
    if (!entry) return digest('empty-media');
    requireValue(/^040000 tree [0-9a-f]{40}\tmedia$/.test(entry), 'Media root must be a tracked directory');
    return entry.split(' ')[2].split('\t')[0];
  })() : digest('seed');
  const sources: SourceRecord[] = [];
  for (const file of (await readdir(path.join(root, 'posts'))).sort()) {
    requireValue(/^[0-9a-f-]{36}\.md$/.test(file), 'Posts must use immutable UUID filenames');
    const relative = `posts/${file}`;
    const raw = authoritative ? execFileSync('git', ['show', `HEAD:${relative}`], { cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }) : await readFile(path.join(root, relative), 'utf8');
    const article = parseArticle(raw, false);
    requireValue(file === `${article.id}.md` && !sources.some((record) => record.id === article.id), 'Duplicate or mismatched article identity');
    const sourceBlob = createHash('sha1').update(`blob ${Buffer.byteLength(raw)}\0`).update(raw).digest('hex');
    sources.push({ id: article.id, raw, sourceBlob, sourceRevision: digest(`${sourceBlob}:${mediaRevision}`), title: String(article.metadata.title ?? '') });
  }
  return sources;
}
export async function listPrivateMediaHashes(root: string): Promise<string[]> {
  const hashes: string[] = [];
  try { const info = await lstat(path.join(root,'media')); requireValue(info.isDirectory() && !info.isSymbolicLink(), 'Unsafe private media directory'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []; throw error; }
  async function walk(relative: string): Promise<void> {
    for (const item of await readdir(path.join(root,relative), { withFileTypes: true })) {
      if (item.name.startsWith('.')) continue;
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) await walk(name);
      else hashes.push(digest(await readSafe(root,name)));
    }
  }
  await walk('media');
  return hashes;
}
export async function syncIndexes(root: string, state: Ledger, authoritative = true): Promise<void> {
  for (const source of await scanSources(root, authoritative)) {
    const live = state.articles[source.id];
    await writeJson(path.join(root, 'manage', `${source.id}.json`), {
      articleId: source.id, title: source.title.slice(0, 500), sourceBlob: source.sourceBlob, sourceRevision: source.sourceRevision,
      sequence: live?.sequence ?? 0, online: Boolean(live?.snapshot), publishedVisibility: live?.visibility ?? 'private',
      currentSnapshot: live?.snapshot ?? '', snapshots: (live?.history ?? []).slice(-20), onlineReleaseSha: state.onlineReleaseSha ?? '',
      pending: state.pending?.candidate.articles[source.id]?.sequence !== undefined,
    });
    await writeJson(path.join(root, 'access', `${source.id}.json`), { articleId: source.id, title: source.title, frontendPassword: state.access[source.id] ?? '', online: Boolean(live?.snapshot), visibility: live?.visibility ?? 'private' });
  }
}
export async function persistCheckpoint(root: string, state: Ledger): Promise<void> {
  const commit = async () => {
    await writeJson(path.join(root, 'ledger', 'state.json'), state);
    await syncIndexes(root, state);
    git(root, ['add', '--', 'ledger', 'manage', 'access', 'releases']);
    if (git(root, ['diff', '--cached', '--name-only'])) git(root, ['-c','user.name=Harlen editorial','-c','user.email=editorial@users.noreply.github.com','commit','-m','chore: editorial checkpoint [skip ci]']);
  };
  await commit();
  for (let attempt = 0; attempt < 5; attempt++) {
    git(root, ['fetch','origin','refs/heads/main']);
    const remote = git(root, ['rev-parse','FETCH_HEAD']);
    const base = git(root, ['merge-base','HEAD',remote]);
    const concurrent = git(root, ['diff','--name-only',base,remote]).split('\n').filter(Boolean);
    requireValue(concurrent.every((file) => /^(?:posts|media)\//.test(file) || file === '.pages.yml'), 'Concurrent edits outside CMS source require manual reconciliation');
    if (git(root, ['rev-parse','HEAD']) !== remote) {
      try { git(root, ['-c','user.name=Harlen editorial','-c','user.email=editorial@users.noreply.github.com','rebase',remote]); }
      catch (error) { try { git(root, ['rebase','--abort']); } catch { /* No rebase may have started. */ } throw error; }
      // CMS may save while build/deploy runs. Retain those commits and index the newest saved source.
      await commit();
    }
    try { git(root, ['push','origin','HEAD:refs/heads/main']); return; }
    catch (error) { if (attempt === 4) throw error; }
  }
}
export function refreshCheckout(root: string): void {
  git(root, ['fetch','origin','refs/heads/main']);
  git(root, ['merge','--ff-only','FETCH_HEAD']);
}
