import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { createSnapshot, parseArticle, preparePublished, requireValue } from './content.ts';
import type { PublishedInput } from './content.ts';
import { git, listPrivateMediaHashes, loadSnapshot, persistCheckpoint, readLedger, refreshCheckout, scanSources, storeSnapshot, syncIndexes, writeJson } from './repository.ts';
import { reconcilePending, runTransaction } from './transaction.ts';
import type { Candidate, SavedSource } from './transaction.ts';
import { PublicPublisher, buildSite } from './github.ts';
import { publicationAuditPolicy, sealOutput } from './audit.ts';
import { parseControl } from './control.ts';

const codeRoot = fileURLToPath(new URL('../../', import.meta.url));
const privateRoot = path.resolve(process.env.HARLEN_PRIVATE_ROOT ?? process.argv[3] ?? '');
const command = process.argv[2];
requireValue(process.env.HARLEN_PRIVATE_ROOT || process.argv[3], 'HARLEN_PRIVATE_ROOT is required');
if (command === 'sync' || command === 'request') refreshCheckout(privateRoot);
const state = await readLedger(privateRoot);
async function inputsFor(candidate: Candidate): Promise<PublishedInput[]> {
  const result: PublishedInput[] = [];
  for (const [id, record] of Object.entries(candidate.articles)) if (record.snapshot) result.push({ snapshot: await loadSnapshot(privateRoot, id, record.snapshot), visibility: record.visibility, ...(record.visibility === 'password' ? { password: candidate.access[id] } : {}) });
  return result;
}
if (command === 'prepare') {
  requireValue(process.argv[4], 'New output directory required');
  await preparePublished(await inputsFor(state), path.resolve(process.argv[4]));
  console.log('Published snapshots prepared; no deployment performed.');
} else if (command === 'sync') {
  await persistCheckpoint(privateRoot, state);
  console.log('Saved drafts indexed; live snapshots unchanged.');
} else if (command === 'request') {
  requireValue(process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY === 'yxsci66/harlen-blog-content' && process.env.GITHUB_REF === 'refs/heads/main', 'Publication runs only in the private main workflow');
  requireValue(process.env.PUBLISH_TOKEN, 'Scoped PUBLISH_TOKEN required');
  const publisher = new PublicPublisher('yxsci66/yxsci66.github.io', process.env.PUBLISH_TOKEN);
  const hooks = {
    persist: async () => persistCheckpoint(privateRoot, state),
    createRelease: async (candidate: Candidate) => {
      const scratch = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? os.tmpdir(), 'harlen-prepared-'));
      const prepared = path.join(scratch, 'content');
      const inputs = await inputsFor(candidate);
      await preparePublished(inputs, prepared);
      buildSite(codeRoot, prepared);
      const policy = publicationAuditPolicy(inputs, candidate.access, await listPrivateMediaHashes(privateRoot));
      await sealOutput(path.join(codeRoot, 'dist'), policy.forbidden, policy.forbiddenHashes);
      return publisher.createRelease(path.join(codeRoot, 'dist'));
    },
    deploy: (sha: string) => publisher.deploy(sha),
  };
  await reconcilePending(state, hooks);
  // A pending operation may have been deployed successfully even if this rerun's request has expired.
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH!, 'utf8'));
  const payload = JSON.parse(event.inputs?.payload ?? 'null');
  const request = parseControl(payload);
  git(privateRoot, ['diff','--exit-code','HEAD','--','posts','media']);
  const source = request.articleId ? (await scanSources(privateRoot)).find((item) => item.id === request.articleId) : undefined;
  let saved: SavedSource | undefined;
  if (source) {
    const metadata = parseArticle(source.raw, false).metadata;
    saved = { sourceRevision: source.sourceRevision, visibility: metadata.visibility as SavedSource['visibility'] };
    if (request.operation === 'publish') {
      const firstSnapshot = state.articles[source.id]?.history[0];
      const established = firstSnapshot ? await loadSnapshot(privateRoot, source.id, firstSnapshot) : undefined;
      const snapshot = await createSnapshot(source.raw, privateRoot, established);
      await storeSnapshot(privateRoot, snapshot);
      saved.snapshot = snapshot.hash;
    }
    if (request.operation === 'restore') await loadSnapshot(privateRoot, source.id, request.restoreSnapshot!);
  }
  await runTransaction(state, request, saved, hooks);
  console.log('Exact public deployment confirmed and private online state reconciled.');
} else if (command === 'sync-local') {
  await syncIndexes(privateRoot, state, false);
  await mkdir(path.join(privateRoot, 'ledger'), { recursive: true });
  await writeJson(path.join(privateRoot, 'ledger', 'state.json'), state);
} else throw new Error('Unknown CMS command');
