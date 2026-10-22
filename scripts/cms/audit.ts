import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { PublishedInput } from './content.ts';
const MANIFEST = 'release-manifest.json';
const allowedExtensions = new Set(['.html','.css','.js','.json','.xml','.txt','.svg','.png','.jpg','.jpeg','.webp','.gif','.ico','.avif','.woff','.woff2','.ttf','.webmanifest','.pdf','.zip']);
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function check(condition: unknown): asserts condition { if (!condition) throw new Error('Unsafe or inconsistent static release'); }
async function scan(root: string, forbidden: string[] = [], forbiddenHashes: string[] = []): Promise<Record<string, string>> {
  const files: Record<string, string> = {};
  let total = 0;
  async function walk(relative = ''): Promise<void> {
    for (const entry of await readdir(path.join(root, relative), { withFileTypes: true })) {
      const item = relative ? `${relative}/${entry.name}` : entry.name;
      check(!entry.name.startsWith('.') && !/[\\\x00-\x1f]/.test(entry.name));
      check(!/^(?:access|manage|releases|ledger|posts|scripts|src|node_modules)(?:\/|$)/.test(item));
      check(!['build-public-index.json', 'build-legacy-redirects.json', '.env'].includes(entry.name));
      const info = await lstat(path.join(root, item));
      check(!info.isSymbolicLink());
      if (info.isDirectory()) { await walk(item); continue; }
      const searchAsset = /^pagefind\/(?:[a-zA-Z0-9_.-]+\/)*[a-zA-Z0-9_.-]+\.(?:pf_meta|pf_fragment|pf_index|pagefind)$/.test(item);
      check(info.isFile() && info.nlink === 1 && info.size <= 64 * 1024 * 1024 && (allowedExtensions.has(path.extname(item).toLowerCase()) || searchAsset));
      if (item === MANIFEST) continue;
      total += info.size;
      check(total <= 512 * 1024 * 1024 && Object.keys(files).length < 10000);
      const bytes = await readFile(path.join(root, item));
      for (const secret of forbidden) if (secret.length > 0) check(!bytes.includes(Buffer.from(secret)));
      const hash = sha256(bytes);
      check(!forbiddenHashes.includes(hash));
      files[item] = hash;
    }
  }
  await walk();
  check(files['index.html']);
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => Buffer.compare(Buffer.from(a), Buffer.from(b))));
}
export async function sealOutput(root: string, forbidden: string[] = [], forbiddenHashes: string[] = []): Promise<void> {
  const files = await scan(root, forbidden, forbiddenHashes);
  await writeFile(path.join(root, MANIFEST), JSON.stringify({ version: 1, files }), 'utf8');
}
export async function verifyOutput(root: string): Promise<void> {
  const info = await lstat(path.join(root, MANIFEST));
  check(info.isFile() && !info.isSymbolicLink() && info.size < 4 * 1024 * 1024);
  const manifest = JSON.parse(await readFile(path.join(root, MANIFEST), 'utf8'));
  check(manifest.version === 1 && manifest.files && typeof manifest.files === 'object' && !Array.isArray(manifest.files));
  const actual = await scan(root);
  const files = Object.keys(actual);
  check(files.length === Object.keys(manifest.files).length);
  for (const file of files) check(Object.hasOwn(manifest.files, file) && manifest.files[file] === actual[file]);
}
export function publicationAuditPolicy(inputs: PublishedInput[], access: Record<string, string>, currentMediaHashes: string[]): { forbidden: string[]; forbiddenHashes: string[] } {
  const publicHashes = new Set(inputs.filter((input) => ['public','unlisted'].includes(input.visibility)).flatMap((input) => input.snapshot.media.map((asset) => asset.sha256)));
  const forbiddenHashes = new Set(currentMediaHashes.filter((hash) => !publicHashes.has(hash)));
  for (const input of inputs.filter((item) => item.visibility === 'password')) for (const media of input.snapshot.media) forbiddenHashes.add(media.sha256);
  // Metadata can legitimately collide with public words. Snapshot allowlisting controls its export;
  // random access secrets and nonpublic raw-media hashes are strict global rejection values.
  return { forbidden: Object.values(access).filter(Boolean), forbiddenHashes: [...forbiddenHashes] };
}
