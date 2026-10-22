import { createHash } from 'node:crypto';
import { lstat, mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { encryptProtectedArticle } from '../../src/lib/protected-crypto.ts';
import type { ProtectedArticle, ProtectedAsset } from '../../src/lib/protected-crypto.ts';

export type Visibility = 'public' | 'unlisted' | 'password' | 'private';
export interface ArticleSource { id: string; slug: string; metadata: Record<string, unknown>; body: string }
export interface Snapshot { version: 1; hash: string; article: ArticleSource; media: { url: string; mime: string; sha256: string; dataBase64: string }[] }
export interface PublishedInput { snapshot: Snapshot; visibility: Visibility; password?: string }
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const digest = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
export function requireValue(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const mimeTypes: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.pdf': 'application/pdf', '.txt': 'text/plain', '.zip': 'application/zip' };
export function safeRelative(value: string): string {
  requireValue(typeof value === 'string' && value.length > 0 && !/[\\\x00-\x1f?#%:]/.test(value), 'Invalid relative path');
  requireValue(!value.startsWith('/') && !value.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.')), 'Unsafe path');
  return value;
}
export async function readSafe(root: string, relative: string): Promise<Buffer> {
  safeRelative(relative);
  const base = await realpath(root);
  const full = path.join(base, relative);
  const resolved = await realpath(full);
  requireValue(resolved.startsWith(base + path.sep), 'Path escaped root');
  let current = base;
  for (const segment of relative.split('/')) {
    current = path.join(current, segment);
    requireValue(!(await lstat(current)).isSymbolicLink(), 'Symlink is not allowed');
  }
  requireValue((await lstat(full)).isFile(), 'Media must be a regular file');
  return readFile(full);
}
export function parseArticle(raw: string, validate = true): ArticleSource {
  const parsed = matter(raw);
  const meta = parsed.data;
  if (meta.tags === undefined || meta.tags === null) meta.tags = [];
  const id = String(meta.articleId ?? '');
  requireValue(UUID.test(id), 'Invalid article ID');
  if (validate) {
    requireValue(typeof meta.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(meta.slug), 'Invalid stable slug');
    for (const field of ['title', 'description']) requireValue(typeof meta[field] === 'string' && meta[field].trim().length > 0, `Missing ${field}`);
    requireValue(!Number.isNaN(Date.parse(String(meta.pubDate))), 'Invalid publication date');
    requireValue(['public', 'unlisted', 'password', 'private'].includes(String(meta.visibility)), 'Invalid visibility');
    requireValue(meta.draft !== true, 'Draft cannot be published');
    requireValue(Array.isArray(meta.tags) && meta.tags.every((tag: unknown) => typeof tag === 'string'), 'Invalid tags');
    requireValue(typeof meta.commentsEnabled === 'boolean', 'Missing comment preference');
    requireValue(parsed.content.trim().length > 0, 'Article body is empty');
  }
  return { id, slug: String(meta.slug ?? ''), metadata: meta, body: parsed.content };
}
function mediaReferences(body: string, protectedMode: boolean): string[] {
  const urls = new Set<string>();
  const observe = (url: string | undefined, isImage: boolean) => {
    if (!url) return;
    const clean = url.split(/[?#]/)[0];
    const extension = path.posix.extname(clean).toLowerCase();
    const media = isImage || clean.startsWith('/media/') || clean.startsWith('/images/') || Boolean(mimeTypes[extension]);
    if (!media) {
      if (protectedMode && extension && !/^https?:\/\//.test(clean)) throw new Error('Unsupported protected attachment');
      return;
    }
    if (/^(?:https?:|data:|\/\/)/i.test(url)) { requireValue(!protectedMode, 'External protected media is forbidden'); return; }
    requireValue(!/[?#%]/.test(url) && (url.startsWith('/media/') || url.startsWith('/images/')), 'Media must use a private media path');
    requireValue(Boolean(mimeTypes[extension]), 'Unsupported media type');
    safeRelative(url.slice(1));
    urls.add(url);
  };
  marked.walkTokens(marked.lexer(body), (token) => { if (token.type === 'image' || token.type === 'link') observe(token.href as string, token.type === 'image'); });
  sanitizeHtml(marked.parse(body, { async: false }) as string, {
    allowedTags: false, allowedAttributes: false,
    transformTags: { '*': (tagName, attribs) => {
      if (['video', 'audio', 'source', 'iframe', 'object', 'embed'].includes(tagName) && protectedMode) throw new Error('Unsupported protected embed');
      if (tagName === 'img') observe(attribs.src, true);
      if (tagName === 'img' && attribs.srcset && protectedMode) throw new Error('Protected srcset is not supported');
      if (tagName === 'a') observe(attribs.href, false);
      return { tagName, attribs };
    } },
    allowVulnerableTags: true,
  });
  return [...urls].sort();
}
function validateMedia(bytes: Buffer, mime: string): void {
  const head = bytes.subarray(0, 12);
  const valid = mime === 'text/plain' ? !bytes.includes(0) && !/^\s*(?:<!doctype\s+html|<html|<script)/i.test(bytes.toString('utf8'))
    : mime === 'image/png' ? head.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    : mime === 'image/jpeg' ? head[0] === 255 && head[1] === 216 && head[2] === 255
    : mime === 'image/gif' ? /^GIF8[79]a/.test(head.toString())
    : mime === 'image/webp' ? head.subarray(0, 4).toString() === 'RIFF' && head.subarray(8, 12).toString() === 'WEBP'
    : mime === 'application/pdf' ? head.subarray(0, 5).toString() === '%PDF-'
    : mime === 'application/zip' ? head[0] === 80 && head[1] === 75 && [3,5,7].includes(head[2]) : false;
  requireValue(valid, 'Media signature does not match its extension');
}
export async function createSnapshot(raw: string, privateRoot: string, established?: Snapshot): Promise<Snapshot> {
  const article = parseArticle(raw);
  if (established) requireValue(established.article.id === article.id && established.article.slug === article.slug, 'Published article identity and slug are immutable');
  const media: Snapshot['media'] = [];
  let total = 0;
  for (const url of mediaReferences(article.body, article.metadata.visibility === 'password')) {
    const local = url.startsWith('/images/') ? `media/legacy${url}` : url.slice(1);
    const bytes = await readSafe(privateRoot, local);
    total += bytes.length;
    requireValue(total <= (article.metadata.visibility === 'password' ? 10 : 50) * 1024 * 1024, 'Referenced media exceeds limit');
    const mime = mimeTypes[path.posix.extname(url).toLowerCase()];
    validateMedia(bytes, mime);
    media.push({ url, mime, sha256: digest(bytes), dataBase64: bytes.toString('base64') });
  }
  const hash = digest(JSON.stringify({ article, media }));
  return { version: 1, hash, article, media };
}
export function renderProtected(snapshot: Snapshot): ProtectedArticle {
  const { article } = snapshot;
  // Restore retains current visibility; never rely on the historical snapshot's visibility policy.
  const references = mediaReferences(article.body, true);
  for (const url of references) requireValue(snapshot.media.some((media) => media.url === url), 'Protected attachment is not pinned in the snapshot');
  const assets: ProtectedAsset[] = [];
  const byUrl = new Map<string, string>();
  for (const item of snapshot.media) {
    const id = `asset-${item.sha256}`;
    if (!assets.some((asset) => asset.id === id)) assets.push({ id, name: path.posix.basename(item.url), mime: item.mime, dataBase64: item.dataBase64 });
    byUrl.set(item.url, id);
  }
  const html = sanitizeHtml(marked.parse(article.body, { async: false }) as string, {
    allowedTags: ['p','br','h1','h2','h3','h4','h5','h6','ul','ol','li','blockquote','pre','code','strong','em','del','s','sub','sup','hr','table','thead','tbody','tr','th','td','a','img'],
    allowedAttributes: { a: ['href','title','rel'], img: ['src','alt','title'], code: ['class'] },
    allowedSchemes: ['https', 'http', 'mailto', 'harlen-asset'], allowedSchemesByTag: { img: ['harlen-asset'] }, allowProtocolRelative: false,
    transformTags: { '*': (tagName, attribs) => {
      const field = tagName === 'img' ? 'src' : tagName === 'a' ? 'href' : null;
      if (field && byUrl.has(attribs[field])) attribs[field] = `harlen-asset:${byUrl.get(attribs[field])}`;
      if (tagName === 'img') requireValue(attribs.src?.startsWith('harlen-asset:'), 'Unresolved protected image');
      if (tagName === 'a') attribs.rel = 'noopener noreferrer';
      return { tagName, attribs };
    } },
  });
  const meta = article.metadata;
  return { version: 1, id: article.id, title: String(meta.title), description: String(meta.description), html, tags: meta.tags as string[], ...(meta.category ? { category: String(meta.category) } : {}), pubDate: dateString(meta.pubDate), ...(meta.updatedDate ? { updatedDate: dateString(meta.updatedDate) } : {}), assets };
}
function dateString(value: unknown): string { return value instanceof Date ? value.toISOString().slice(0, 10) : String(value); }
export async function preparePublished(inputs: PublishedInput[], outputRoot: string): Promise<void> {
  // Output must be newly created: reusing a stale directory could leak a withdrawn article.
  await mkdir(outputRoot, { recursive: false });
  await mkdir(path.join(outputRoot, 'posts'));
  await mkdir(path.join(outputRoot, 'public'));
  const publicHashes = new Set(inputs.filter((input) => ['public','unlisted'].includes(input.visibility)).flatMap((input) => input.snapshot.media.map((asset) => asset.sha256)));
  const protectedIndex: { id: string; payloadUrl: string }[] = [];
  const ids = new Set<string>();
  const slugs = new Set<string>();
  const exported = new Map<string, string>();
  for (const input of inputs) {
    const { snapshot, visibility } = input;
    const { article } = snapshot;
    requireValue(!ids.has(article.id), 'Duplicate article ID'); ids.add(article.id);
    if (visibility === 'private') continue;
    if (visibility === 'password') {
      requireValue(input.password, 'Missing private password record');
      for (const media of snapshot.media) requireValue(!publicHashes.has(media.sha256), 'Protected media also exported publicly');
      const envelope = await encryptProtectedArticle(renderProtected(snapshot), input.password);
      const relative = `locked-assets/${article.id}.json`;
      await mkdir(path.join(outputRoot, 'public', 'locked-assets'), { recursive: true });
      await writeFile(path.join(outputRoot, 'public', relative), JSON.stringify(envelope), 'utf8');
      protectedIndex.push({ id: article.id, payloadUrl: `/${relative}` });
    } else {
      requireValue(!slugs.has(article.slug), 'Duplicate published slug'); slugs.add(article.slug);
      const metadata = { ...article.metadata, articleId: article.id, visibility, commentsEnabled: visibility === 'public' && article.metadata.commentsEnabled === true, pubDate: dateString(article.metadata.pubDate), ...(article.metadata.updatedDate ? { updatedDate: dateString(article.metadata.updatedDate) } : {}) };
      await writeFile(path.join(outputRoot, 'posts', `${article.slug}.md`), matter.stringify(article.body, metadata), 'utf8');
      for (const media of snapshot.media) {
        const relative = safeRelative(media.url.slice(1));
        requireValue(!exported.has(relative) || exported.get(relative) === media.sha256, 'Media URL collision between snapshots');
        exported.set(relative, media.sha256);
        const target = path.join(outputRoot, 'public', relative);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, Buffer.from(media.dataBase64, 'base64'));
      }
    }
  }
  await writeFile(path.join(outputRoot, 'protected.json'), JSON.stringify(protectedIndex), 'utf8');
}
