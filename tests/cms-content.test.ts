import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
const cms = await import('../scripts/cms/content.ts').catch(() => null);
const id = '2438a7ae-9da9-4ef8-bd93-71fc641f112b';
const raw = (visibility = 'public', body = 'Visible text') => `---\narticleId: ${id}\nslug: old-slug\ntitle: Original title\ndescription: Description\npubDate: 2022-06-20\nvisibility: ${visibility}\ntags: [life]\ncommentsEnabled: true\n---\n${body}\n`;
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'cms-')); await mkdir(path.join(root, 'media')); return root; }

test('immutable snapshots pin media and prepared inputs only export explicit live snapshots', async () => {
  assert.ok(cms, 'content implementation must exist');
  const root = await fixture();
  await writeFile(path.join(root, 'media', 'memo.txt'), 'original attachment');
  const snapshot = await cms.createSnapshot(raw('unlisted', '[memo](/media/memo.txt)'), root);
  await writeFile(path.join(root, 'media', 'memo.txt'), 'unpublished replacement');
  const output = path.join(root, 'output');
  await cms.preparePublished([{ snapshot, visibility: 'unlisted' }], output);
  assert.equal(await readFile(path.join(output, 'public', 'media', 'memo.txt'), 'utf8'), 'original attachment');
  assert.match(await readFile(path.join(output, 'posts', 'old-slug.md'), 'utf8'), /visibility: unlisted/);
  assert.deepEqual(JSON.parse(await readFile(path.join(output, 'protected.json'), 'utf8')), []);
  const empty = path.join(root, 'empty');
  await cms.preparePublished([{ snapshot, visibility: 'private' }], empty);
  assert.deepEqual(await readdir(path.join(empty, 'posts')), []);
  assert.deepEqual(await readdir(path.join(empty, 'public')), []);
});

test('protected metadata and all media become encrypted assets and scripts are removed', async () => {
  assert.ok(cms);
  const root = await fixture();
  await writeFile(path.join(root, 'media', 'memo.txt'), 'SECRET_ATTACHMENT_CANARY');
  const snapshot = await cms.createSnapshot(raw('password', '[memo](/media/memo.txt) <script>SECRET_SCRIPT</script>'), root);
  const output = path.join(root, 'encrypted');
  await cms.preparePublished([{ snapshot, visibility: 'password', password: 'random-unique-test-password' }], output);
  const serialized = await readFile(path.join(output, 'public', 'locked-assets', `${id}.json`), 'utf8');
  assert.equal(serialized.includes('Original title'), false);
  const { decryptProtectedArticle } = await import('../src/lib/protected-crypto.ts');
  const article = await decryptProtectedArticle(JSON.parse(serialized), 'random-unique-test-password', id);
  assert.match(article.html, /harlen-asset:/);
  assert.doesNotMatch(article.html, /script|SECRET_SCRIPT|\/media\//);
  assert.equal(Buffer.from(article.assets[0].dataBase64, 'base64').toString(), 'SECRET_ATTACHMENT_CANARY');
  assert.deepEqual(await readdir(path.join(output, 'posts')), []);
});

test('protected export rejects missing/external media, executable attachments and public shared bytes', async () => {
  assert.ok(cms);
  const root = await fixture();
  await assert.rejects(() => cms.createSnapshot(raw('password', '![](https://tracker.invalid/a.png)'), root));
  await assert.rejects(() => cms.createSnapshot(raw('password', '[missing](/media/missing.pdf)'), root));
  await writeFile(path.join(root, 'media', 'evil.html'), '<script>alert(1)</script>');
  await assert.rejects(() => cms.createSnapshot(raw('password', '[evil](/media/evil.html)'), root));
  await writeFile(path.join(root, 'media', 'memo.txt'), 'same private bytes');
  const snapshot = await cms.createSnapshot(raw('password', '[file](/media/memo.txt)'), root);
  const publicSnap = structuredClone(snapshot); publicSnap.article.id = 'e9aaf193-7c0c-4329-91fe-cbfc17bca464'; publicSnap.article.slug = 'other';
  await assert.rejects(() => cms.preparePublished([{ snapshot, visibility: 'password', password: 'secret' }, { snapshot: publicSnap, visibility: 'public' }], path.join(root, 'unsafe')));
});
test('restoring a public snapshot as password content revalidates external attachment references', async () => {
  assert.ok(cms);
  const root = await fixture();
  const snapshot = await cms.createSnapshot(raw('public', '[external PDF](https://example.invalid/public.pdf)'), root);
  await assert.rejects(() => cms.preparePublished([{ snapshot, visibility: 'password', password: 'new-secret' }], path.join(root, 'restored')));
});
test('publishing an untagged article permits no tags but cannot change an established URL identity', async () => {
  assert.ok(cms);
  const root = await fixture();
  const snapshot = await cms.createSnapshot(raw().replace('tags: [life]\n', ''), root);
  assert.deepEqual(snapshot.article.metadata.tags, []);
  await assert.rejects(() => cms.createSnapshot(raw().replace('slug: old-slug', 'slug: renamed'), root, snapshot));
});
test('export audit media inventory permits a repository without any remaining media directory', async () => {
  const repository = await import('../scripts/cms/repository.ts');
  assert.equal(typeof repository.listPrivateMediaHashes, 'function');
  const root = await mkdtemp(path.join(os.tmpdir(), 'cms-empty-'));
  assert.deepEqual(await repository.listPrivateMediaHashes(root), []);
});
