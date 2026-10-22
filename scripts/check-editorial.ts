import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve, sep } from 'node:path';
import { encryptProtectedArticle } from '../src/lib/protected-crypto.ts';

const workspace = resolve('.');
const cache = resolve('.cache');
mkdirSync(cache, { recursive: true });
const fixture = mkdtempSync(resolve(cache, 'editorial-check-'));
const id = '52de671f-f57b-449c-8a5d-090380c48043';
const baseEnv = { ...process.env };
for (const key of ['SITE_URL', 'HARLEN_CONTENT_ROOT', 'HARLEN_PRODUCTION', 'HARLEN_EDITORIAL_TEST_ID', 'HARLEN_EDITORIAL_EMPTY']) delete baseEnv[key];
const temp = resolve(cache, 'tmp');
mkdirSync(temp, { recursive: true });
Object.assign(baseEnv, { TEMP: temp, TMP: temp, TMPDIR: temp, PLAYWRIGHT_BROWSERS_PATH: baseEnv.PLAYWRIGHT_BROWSERS_PATH || resolve(cache, 'ms-playwright') });
assert.ok(process.env.npm_execpath, 'Run this script with pnpm test:editorial');
function run(args: string[], extra: Record<string, string> = {}) {
  const result = spawnSync(process.execPath, [process.env.npm_execpath!, ...args], { cwd: workspace, env: { ...baseEnv, ...extra }, stdio: 'inherit' });
  assert.equal(result.status, 0, `Editorial verification failed: ${args.join(' ')}`);
}
function post(visibility: string, marker: string) {
  return `---\ntitle: ${marker}\ndescription: ${marker}\npubDate: 2026-10-23\ncategory: ${marker}\ntags: [${marker}]\nvisibility: ${visibility}\ncommentsEnabled: true\n${visibility === 'unlisted' ? 'legacyPaths: [/editorial-unlisted-old/]\n' : ''}---\n${marker}\n`;
}
try {
  const mixed = resolve(fixture, 'mixed'), empty = resolve(fixture, 'empty');
  for (const root of [mixed, empty]) {
    mkdirSync(resolve(root, 'posts'), { recursive: true });
    mkdirSync(resolve(root, 'public'), { recursive: true });
    writeFileSync(resolve(root, 'posts/editorial-unlisted.md'), post('unlisted', 'unlisteddiscoverycanary20261023'), 'utf8');
  }
  for (const file of readdirSync(resolve(workspace, 'src/content/blog'))) {
    if (!file.endsWith('.md')) continue;
    let body = readFileSync(resolve(workspace, 'src/content/blog', file), 'utf8').replaceAll('/images/candy.webp', '/media/candy.webp');
    if (file === 'first-blog.md') body = body.replace(/^---\r?\n/, '---\narticleId: 08ff174d-dc2b-4a65-a0c2-1ec88b3249be\ncommentsEnabled: true\n');
    writeFileSync(resolve(mixed, 'posts', file), body, 'utf8');
  }
  mkdirSync(resolve(mixed, 'public/media'));
  cpSync(resolve(workspace, 'public/images/candy.webp'), resolve(mixed, 'public/media/candy.webp'));
  writeFileSync(resolve(mixed, 'posts/editorial-private.md'), post('private', 'private-source-canary'), 'utf8');
  writeFileSync(resolve(mixed, 'posts/editorial-password.md'), post('password', 'password-source-canary'), 'utf8');
  writeFileSync(resolve(mixed, 'protected.json'), JSON.stringify([{ id, payloadUrl: `/locked-assets/${id}.json` }]), 'utf8');
  mkdirSync(resolve(mixed, 'public/locked-assets'));
  const payload = await encryptProtectedArticle({ version: 1, id, title: 'Encrypted fixture', description: '', pubDate: '2026-10-23', tags: [], html: '<p>Fixture</p>', assets: [] }, 'editorial-fixture-password');
  writeFileSync(resolve(mixed, `public/locked-assets/${id}.json`), JSON.stringify(payload), 'utf8');
  writeFileSync(resolve(empty, 'protected.json'), '[]', 'utf8');
  run(['build'], { HARLEN_PRODUCTION: '1', HARLEN_CONTENT_ROOT: mixed });
  run(['exec', 'playwright', 'test', 'tests/e2e/editorial.spec.ts'], { HARLEN_EDITORIAL_TEST_ID: id });
  run(['build'], { HARLEN_PRODUCTION: '1', HARLEN_CONTENT_ROOT: empty });
  run(['exec', 'playwright', 'test', 'tests/e2e/editorial-empty.spec.ts'], { HARLEN_EDITORIAL_EMPTY: '1' });
  console.log('Prepared publication isolation and protected mobile reading verified.');
} finally {
  // mkdtemp created this exact, bounded directory; it contains no links.
  if (fixture.startsWith(`${cache}${sep}editorial-check-`)) rmSync(fixture, { recursive: true, force: true });
  // Leave a normal development preview after both success and failure.
  run(['build']);
}
