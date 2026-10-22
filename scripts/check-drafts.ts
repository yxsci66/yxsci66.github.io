import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve, extname, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';

const workspace = resolve('.');
const cache = resolve('.cache');
const temp = resolve(cache, 'tmp');
mkdirSync(temp, { recursive: true });
for (const variable of ['TEMP', 'TMP', 'TMPDIR']) process.env[variable] = temp;
process.env.PLAYWRIGHT_BROWSERS_PATH ||= resolve(cache, 'ms-playwright');
const fixture = mkdtempSync(resolve(cache, 'draft-check-'));
const marker = 'privatecanaryoctober';
try {
  for (const path of ['src', 'public', 'scripts', 'astro.config.mjs', 'tsconfig.json', 'package.json']) cpSync(resolve(workspace, path), resolve(fixture, path), { recursive: true });
  symlinkSync(resolve(workspace, 'node_modules'), resolve(fixture, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  writeFileSync(resolve(fixture, 'src/content/blog/private-draft-canary.md'), `---\ntitle: ${marker}\ndescription: ${marker}\npubDate: 2099-01-01\ndraft: true\nfeatured: true\ncategory: ${marker}\ntags: [${marker}]\nlegacyPaths: [/private-draft-alias/]\n---\n${marker}\n`, 'utf8');
  const build = spawnSync(process.execPath, [process.env.npm_execpath!, 'build'], { cwd: fixture, env: process.env, encoding: 'utf8' });
  assert.equal(build.status, 0, build.stdout + build.stderr);
  const dist = resolve(fixture, 'dist');
  for (const path of ['blog/private-draft-canary/index.html', 'private-draft-alias/index.html', `tags/${marker}/index.html`, `categories/${marker}/index.html`]) assert.equal(existsSync(resolve(dist, path)), false, `Draft route leaked: ${path}`);
  for (const file of readdirSync(dist, { recursive: true }).map(String).filter(file => /\.(html|xml)$/.test(file))) {
    assert.equal(readFileSync(resolve(dist, file), 'utf8').includes(marker), false, `Draft text leaked: ${file}`);
  }
  assert.ok(readFileSync(resolve(dist, 'rss.xml'), 'utf8').includes('diary-20210923'));
  const server = createServer((request, response) => {
    const path = resolve(dist, `.${decodeURIComponent(new URL(request.url!, 'http://localhost').pathname)}`);
    if (!path.startsWith(`${dist}${sep}`) && path !== dist) { response.writeHead(403).end(); return; }
    const file = extname(path) ? path : resolve(path, 'index.html');
    if (!existsSync(file)) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', ({ '.js': 'text/javascript', '.wasm': 'application/wasm', '.html': 'text/html' } as Record<string, string>)[extname(file)] || 'application/octet-stream');
    response.end(readFileSync(file));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const channel = process.env.PLAYWRIGHT_CHANNEL || (!process.env.CI && process.platform === 'win32' && existsSync('C:/Program Files/Google/Chrome/Application/chrome.exe') ? 'chrome' : undefined);
  let browser;
  try {
    browser = await chromium.launch({ channel });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}/`);
    const results = await page.evaluate(async (query) => {
      // Pagefind is produced by the real fixture build, rather than mocked.
      const moduleUrl = '/pagefind/pagefind.js';
      const search = await import(/* @vite-ignore */ moduleUrl);
      return { draft: (await search.search(query)).results.length, public: (await search.search('vscode')).results.length };
    }, marker);
    assert.equal(results.draft, 0, 'Draft leaked into Pagefind');
    assert.ok(results.public > 0, 'Published article missing from Pagefind');
  } finally {
    await browser?.close();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
  console.log('Isolated draft build: pages, taxonomy, RSS, sitemap, aliases and live Pagefind search exclude drafts.');
} finally {
  if (fixture.startsWith(`${cache}${sep}`)) rmSync(fixture, { recursive: true, force: true });
}
