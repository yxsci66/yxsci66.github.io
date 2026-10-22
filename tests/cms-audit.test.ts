import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const audit = await import('../scripts/cms/audit.ts').catch(() => null);
async function fixture() { const root = await mkdtemp(path.join(os.tmpdir(), 'cms-audit-')); await writeFile(path.join(root, 'index.html'), '<p>public</p>'); return root; }
test('safe release manifest authenticates every output byte and rejects private canaries', async () => {
  assert.ok(audit, 'export audit must exist');
  const root = await fixture();
  await audit.sealOutput(root, ['PRIVATE_CANARY_5921']);
  await audit.verifyOutput(root);
  await writeFile(path.join(root, 'index.html'), 'tampered');
  await assert.rejects(() => audit.verifyOutput(root));
  await writeFile(path.join(root, 'index.html'), 'PRIVATE_CANARY_5921');
  await assert.rejects(() => audit.sealOutput(root, ['PRIVATE_CANARY_5921']));
});
test('release export refuses source/configuration files and temporary discovery manifests', async () => {
  assert.ok(audit);
  for (const file of ['private.md', 'build-public-index.json', 'build-legacy-redirects.json', '.env', 'manage/password.json']) {
    const root = await fixture();
    await mkdir(path.dirname(path.join(root, file)), { recursive: true });
    await writeFile(path.join(root, file), 'secret');
    await assert.rejects(() => audit.sealOutput(root));
  }
});
test('real Pagefind generated search files pass only under the search asset directory', async () => {
  assert.ok(audit);
  const { createIndex } = await import('pagefind');
  const { index } = await createIndex();
  assert.ok(index);
  await index.addHTMLFile({ url: '/blog/public/', content: '<html lang="zh"><body><p>公开搜索文章</p></body></html>' });
  const { files } = await index.getFiles();
  const root = await fixture();
  for (const file of files) {
    const full = path.join(root, 'pagefind', file.path);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, file.content);
  }
  await audit.sealOutput(root);
  await audit.verifyOutput(root);
  await writeFile(path.join(root, 'unsafe.pf_index'), 'not a search asset');
  await assert.rejects(() => audit.sealOutput(root));
  await index.deleteIndex();
});
test('a private draft sharing public metadata does not block publication; real passwords remain forbidden', async () => {
  assert.ok(audit);
  assert.equal(typeof audit.publicationAuditPolicy, 'function');
  const policy = audit.publicationAuditPolicy([
    { visibility: 'public', snapshot: { article: { metadata: { title: 'Same shared title', description: 'Shared description' } }, media: [] } },
    { visibility: 'private', snapshot: { article: { metadata: { title: 'Same shared title', description: 'Shared description' } }, media: [] } },
  ] as never, { id: 'generatedPasswordSecret22' }, []);
  const root = await fixture();
  await writeFile(path.join(root, 'index.html'), '<h1>Same shared title</h1><p>Shared description</p>');
  await audit.sealOutput(root, policy.forbidden, policy.forbiddenHashes);
  await writeFile(path.join(root, 'index.html'), 'generatedPasswordSecret22');
  await assert.rejects(() => audit.sealOutput(root, policy.forbidden, policy.forbiddenHashes));
});
test('public artifact verification removes only the validated manifest when requested', async () => {
  assert.ok(audit);
  const root = await fixture();
  await audit.sealOutput(root);
  execFileSync(process.execPath, ['--experimental-strip-types', fileURLToPath(new URL('../scripts/cms/audit-cli.ts', import.meta.url)), root, '--strip-manifest']);
  await assert.rejects(() => readFile(path.join(root, 'release-manifest.json')));
  assert.equal(await readFile(path.join(root, 'index.html'), 'utf8'), '<p>public</p>');
});
test('manifest verification accepts reordered keys including Chinese paths', async () => {
  assert.ok(audit);
  const root = await fixture();
  await writeFile(path.join(root, '中文.html'), '<p>中文</p>');
  await writeFile(path.join(root, 'alpha.html'), '<p>alpha</p>');
  await audit.sealOutput(root);
  const file = path.join(root, 'release-manifest.json');
  const manifest = JSON.parse(await readFile(file, 'utf8'));
  manifest.files = Object.fromEntries(Object.entries(manifest.files).reverse());
  await writeFile(file, JSON.stringify(manifest));
  await audit.verifyOutput(root);
});
test('order-independent manifest verification still rejects extra, missing and changed hashes', async () => {
  assert.ok(audit);
  for (const change of ['extra', 'missing', 'hash']) {
    const root = await fixture();
    await audit.sealOutput(root);
    const file = path.join(root, 'release-manifest.json');
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (change === 'extra') manifest.files['extra.html'] = '0'.repeat(64);
    if (change === 'missing') delete manifest.files['index.html'];
    if (change === 'hash') manifest.files['index.html'] = '0'.repeat(64);
    await writeFile(file, JSON.stringify(manifest));
    await assert.rejects(() => audit.verifyOutput(root));
  }
});
