import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

function inside(root: string, path: string): boolean { return path.startsWith(`${root}${sep}`); }
function rejectLinks(root: string, file: string): void {
  if (lstatSync(root).isSymbolicLink()) throw new Error('Output roots must not be links');
  let cursor = root;
  for (const part of relative(root, file).split(sep)) {
    cursor = resolve(cursor, part);
    if (existsSync(cursor) && lstatSync(cursor).isSymbolicLink()) throw new Error('Linked output paths are not allowed');
  }
}

/** Only the content collection's explicit public list grants search inclusion. */
export function readPublicPages(directory: string): { url: string; content: string }[] {
  const root = resolve(directory);
  const manifest = resolve(root, 'build-public-index.json');
  rejectLinks(root, manifest);
  const urls: unknown = JSON.parse(readFileSync(manifest, 'utf8'));
  if (!Array.isArray(urls) || urls.length > 10000) throw new Error('Invalid public index manifest');
  const seen = new Set<string>();
  return urls.map(url => {
    if (typeof url !== 'string' || !url.startsWith('/blog/') || !url.endsWith('/') || /[\\?#\x00-\x20]/.test(url)) throw new Error('Invalid public article URL');
    const path = decodeURIComponent(url);
    if (/[\\?#\x00-\x20]/.test(path) || path.split('/').some(segment => segment === '.' || segment === '..')) throw new Error('Unsafe public article path');
    const file = resolve(root, `.${path}`, 'index.html');
    const identity = file.toLowerCase();
    if (!inside(root, file) || seen.has(identity)) throw new Error('Duplicate or unsafe public article path');
    seen.add(identity);
    rejectLinks(root, file);
    const content = readFileSync(file, 'utf8');
    const noindex = /<meta\b(?=[^>]*\bname\s*=\s*["']robots["'])(?=[^>]*\bcontent\s*=\s*["'][^"']*\bnoindex\b)[^>]*>/i.test(content);
    if (!/\bdata-public-post="true"/.test(content) || !/\bdata-pagefind-body(?:[\s=>])/.test(content) || noindex) throw new Error('Public index points at a non-indexable article');
    return { url, content };
  });
}

/** Validate every prepared asset before copying; never overwrite site resources. */
export function copyPreparedAssets(prepared: string, directory: string): void {
  const source = resolve(prepared, 'public');
  const root = resolve(directory);
  if (!existsSync(source) || !lstatSync(source).isDirectory()) throw new Error('Prepared public assets are missing');
  rejectLinks(resolve(prepared), source);
  const pending: { source: string; destination: string }[] = [];
  const seen = new Set<string>();
  function visit(folder: string) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const path = resolve(folder, entry.name);
      if (entry.isSymbolicLink()) throw new Error('Prepared assets cannot contain links');
      if (entry.isDirectory()) { visit(path); continue; }
      if (!entry.isFile()) throw new Error('Prepared assets must be regular files');
      const name = relative(source, path).split(sep).join('/');
      const allowed = /^media\/(?:[\w-]+\/)*[\w.-]+\.(?:jpe?g|png|webp|gif|pdf|txt|zip)$/i.test(name) || /^locked-assets\/[0-9a-f-]{36}\.json$/i.test(name);
      const destination = resolve(root, name);
      if (!allowed || !inside(root, destination) || seen.has(destination.toLowerCase())) throw new Error('Unexpected prepared asset path');
      seen.add(destination.toLowerCase());
      rejectLinks(root, destination);
      if (existsSync(destination)) throw new Error('Prepared asset would overwrite an existing site file');
      pending.push({ source: path, destination });
    }
  }
  visit(source);
  for (const file of pending) {
    mkdirSync(dirname(file.destination), { recursive: true });
    copyFileSync(file.source, file.destination);
  }
}
