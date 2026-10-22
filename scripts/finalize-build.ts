import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync, readdirSync } from 'node:fs';
import { resolve, dirname, relative, sep } from 'node:path';
import type { Redirect } from '../src/lib/redirects.ts';
import { copyPreparedAssets } from './site-output.ts';

const root = resolve('dist');
if (process.env.HARLEN_PRODUCTION === '1' && !process.env.HARLEN_CONTENT_ROOT) throw new Error('Production requires prepared content');
if (process.env.HARLEN_CONTENT_ROOT) copyPreparedAssets(process.env.HARLEN_CONTENT_ROOT, root);
const manifest = resolve(root, 'build-legacy-redirects.json');
const redirects = JSON.parse(readFileSync(manifest, 'utf8')) as Redirect[];
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));

// NTFS normally folds case. Do not overwrite the real lowercase category page.
function exactFile(path: string): boolean {
  let directory = root;
  for (const name of relative(root, path).split(sep)) {
    if (!existsSync(directory) || !readdirSync(directory).includes(name)) return false;
    directory = resolve(directory, name);
  }
  return true;
}

for (const { from, to } of redirects) {
  const output = resolve(root, `.${from}`, 'index.html');
  const target = resolve(root, `.${to}`, 'index.html');
  if (!output.startsWith(`${root}${sep}`) || !existsSync(target)) throw new Error(`Invalid redirect target: ${from} → ${to}`);
  if (existsSync(output)) {
    if (!exactFile(output) && from.toLowerCase() === to.toLowerCase()) {
      console.warn(`Case-insensitive filesystem: ${from} already resolves to ${to}; Linux CI emits the redirect.`);
      continue;
    }
    throw new Error(`Legacy alias conflicts with an existing route: ${from}`);
  }
  mkdirSync(dirname(output), { recursive: true });
  const url = escape(new URL(to, 'https://yxsci66.github.io').href);
  writeFileSync(output, `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${escape(to)}"><link rel="canonical" href="${url}"><meta name="viewport" content="width=device-width,initial-scale=1"><title>文章已迁移</title></head><body data-pagefind-ignore><p>此页面已迁移至 <a href="${escape(to)}">新地址</a>。</p></body></html>`, 'utf8');
}
unlinkSync(manifest);
console.log(`Validated ${redirects.length} static legacy redirects.`);
