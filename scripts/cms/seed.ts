/** One-time migration. Writes private implementation files only; never stages or commits. */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import matter from 'gray-matter';
import { createSnapshot, requireValue } from './content.ts';
import { emptyState } from './transaction.ts';
import { storeSnapshot, syncIndexes, writeJson } from './repository.ts';
const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
const privateRoot = path.resolve(process.argv[2] ?? '');
requireValue(process.argv[2], 'Private repository path required');
try { await stat(path.join(privateRoot, 'ledger', 'state.json')); throw new Error('Ledger exists; migration refuses to overwrite'); }
catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await mkdir(path.join(privateRoot, 'posts'), { recursive: true });
await mkdir(path.join(privateRoot, 'media'), { recursive: true });
await copyFile(path.join(codeRoot, 'public','images','candy.webp'), path.join(privateRoot, 'media','candy.webp'));
const state = emptyState();
const mapping: Record<string, string> = {};
for (const filename of (await readdir(path.join(codeRoot, 'src/content/blog'))).filter((name) => name.endsWith('.md')).sort()) {
  const parsed = matter(await readFile(path.join(codeRoot, 'src/content/blog', filename), 'utf8'));
  const id = randomUUID();
  const slug = filename.slice(0, -3);
  const body = parsed.content.replaceAll('/images/candy.webp', '/media/candy.webp');
  const metadata = { ...parsed.data, articleId: id, slug, visibility: 'public', commentsEnabled: true };
  const raw = matter.stringify(body, metadata);
  await writeFile(path.join(privateRoot, 'posts', `${id}.md`), raw, 'utf8');
  const snapshot = await createSnapshot(raw, privateRoot);
  await storeSnapshot(privateRoot, snapshot);
  state.articles[id] = { sequence: 0, snapshot: snapshot.hash, visibility: 'public', history: [snapshot.hash] };
  mapping[slug] = id;
}
await writeJson(path.join(privateRoot, 'ledger','state.json'), state);
await writeJson(path.join(privateRoot, 'ledger','migration-map.json'), mapping);
await syncIndexes(privateRoot, state, false);
console.log(`Migrated ${Object.keys(mapping).length} existing public articles; no Git or deployment operations performed.`);
