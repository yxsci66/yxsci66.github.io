import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { copyPreparedAssets, readPublicPages } from '../scripts/site-output.ts';
import { prepareStatic } from '../scripts/prepare-static.ts';

const cache = resolve('.cache');
mkdirSync(cache, { recursive: true });
function fixture(run: (dir: string) => void) {
  const dir = mkdtempSync(join(cache, 'output-test-'));
  try { run(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function put(root: string, path: string, body: string) {
  const dest = resolve(root, path);
  mkdirSync(resolve(dest, '..'), { recursive: true });
  writeFileSync(dest, body);
}
const article = '<html lang="zh-CN"><article data-public-post="true"><div data-pagefind-body>visible</div></article></html>';

test('search uses only the generated public allowlist, including zero-public sites', () => fixture(root => {
  put(root, 'build-public-index.json', '["/blog/public/"]');
  put(root, 'blog/public/index.html', article);
  put(root, 'blog/unlisted/index.html', article.replace('visible', 'private-index-canary'));
  assert.deepEqual(readPublicPages(root).map(p => p.url), ['/blog/public/']);
  put(root, 'build-public-index.json', '[]');
  assert.deepEqual(readPublicPages(root), []);
}));
test('search rejects missing manifests, duplicate URLs and unsafe paths', () => fixture(root => {
  assert.throws(() => readPublicPages(root));
  for (const data of [['/blog/../secret/'], ['/blog/a/', '/blog/a/'], ['https://example.com/blog/a/'], ['/blog/%2e%2e/secret/'], ['/blog/a/?x=1']]) {
    put(root, 'build-public-index.json', JSON.stringify(data));
    assert.throws(() => readPublicPages(root));
  }
}));
test('search fails closed when a listed page is marked noindex', () => fixture(root => {
  put(root, 'build-public-index.json', '["/blog/public/"]');
  put(root, 'blog/public/index.html', article.replace('<html lang="zh-CN">', '<html><meta name="robots" content="noindex">'));
  assert.throws(() => readPublicPages(root));
}));
test('prepared assets copy only allowed media and encrypted payloads without collisions', () => fixture(root => {
  const input = join(root, 'input'); const output = join(root, 'dist');
  put(input, 'public/media/example.txt', 'attachment');
  put(input, 'public/locked-assets/11111111-1111-4111-8111-111111111111.json', '{}');
  mkdirSync(output);
  copyPreparedAssets(input, output);
  assert.equal(readFileSync(join(output, 'media/example.txt'), 'utf8'), 'attachment');
  assert.throws(() => copyPreparedAssets(input, output));
}));
test('unsafe prepared output is rejected before any file is copied', () => fixture(root => {
  const input = join(root, 'input'); const output = join(root, 'dist');
  put(input, 'public/media/good.txt', 'good');
  put(input, 'public/media/executable.html', '<script>bad()</script>');
  mkdirSync(output);
  assert.throws(() => copyPreparedAssets(input, output));
  assert.equal(existsSync(join(output, 'media/good.txt')), false);
}));

test('prepared builds exclude source article media and replace stale generated files', () => fixture(root => {
  for (const name of ['images/avatar.jpg', 'images/favicon.ico', 'robots.txt', 'googledb06e025310e016e.html']) put(root, `public/${name}`, 'generic');
  put(root, 'public/images/candy.webp', 'withdrawn-original-image');
  put(root, '.cache/static-public/images/stale.webp', 'previous-build');
  prepareStatic(root);
  assert.equal(existsSync(join(root, '.cache/static-public/images/candy.webp')), false);
  assert.equal(existsSync(join(root, '.cache/static-public/images/stale.webp')), false);
  assert.equal(readFileSync(join(root, '.cache/static-public/images/avatar.jpg'), 'utf8'), 'generic');
}));
