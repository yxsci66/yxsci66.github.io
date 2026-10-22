/** Versioned Web Crypto format shared by the private publisher and browser reader. */
export interface ProtectedAsset { id: string; name: string; mime: string; dataBase64: string }
export interface ProtectedArticle { version: 1; id: string; title: string; description: string; html: string; tags: string[]; category?: string; pubDate: string; updatedDate?: string; assets: ProtectedAsset[] }
export interface ProtectedEnvelope { version: 1; kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: 600000; salt: string }; cipher: { name: 'AES-GCM'; iv: string }; ciphertext: string }

const MAX_MEDIA = 10 * 1024 * 1024;
const MAX_PLAINTEXT = 20 * 1024 * 1024;
const MAX_CIPHERTEXT = MAX_PLAINTEXT + 16;
const encoder = new TextEncoder();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedMime = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'application/zip']);

function check(ok: unknown, message = 'Invalid protected content'): asserts ok { if (!ok) throw new Error(message); }
function base64(bytes: Uint8Array): string {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(binary);
}
function decode(value: unknown, maxBytes: number): Uint8Array<ArrayBuffer> {
  check(typeof value === 'string' && value.length <= Math.ceil(maxBytes / 3) * 4 && value.length % 4 === 0 && /^[A-Za-z0-9+/]*={0,2}$/.test(value));
  const binary = atob(value);
  check(binary.length <= maxBytes);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  check(base64(bytes) === value);
  return bytes;
}
function validateArticle(value: unknown, expectedId: string): asserts value is ProtectedArticle {
  check(value && typeof value === 'object');
  const article = value as ProtectedArticle;
  check(article.version === 1 && uuid.test(article.id) && article.id === expectedId);
  for (const key of ['title', 'description', 'html', 'pubDate'] as const) check(typeof article[key] === 'string');
  check(article.title.length > 0 && article.title.length <= 1000 && article.description.length <= 20000 && article.html.length <= 2 * 1024 * 1024);
  check(!Number.isNaN(Date.parse(article.pubDate)) && (article.updatedDate === undefined || (typeof article.updatedDate === 'string' && !Number.isNaN(Date.parse(article.updatedDate)))));
  check(article.category === undefined || typeof article.category === 'string');
  check(Array.isArray(article.tags) && article.tags.length <= 100 && article.tags.every((tag) => typeof tag === 'string' && tag.length <= 1000));
  check(Array.isArray(article.assets) && article.assets.length <= 100);
  const ids = new Set<string>();
  let size = 0;
  for (const asset of article.assets) {
    check(asset && typeof asset === 'object' && typeof asset.id === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(asset.id) && !ids.has(asset.id));
    ids.add(asset.id);
    check(typeof asset.name === 'string' && asset.name.length > 0 && asset.name.length <= 255 && !/[\x00-\x1f/\\]/.test(asset.name) && allowedMime.has(asset.mime));
    size += decode(asset.dataBase64, MAX_MEDIA).length;
    check(size <= MAX_MEDIA, 'Protected media exceeds 10 MiB');
  }
}
async function derive(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  check(typeof password === 'string' && password.length > 0 && password.length <= 1024, 'Invalid password');
  const material = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
const aad = (id: string) => encoder.encode(`harlen-world:protected:v1:${id}`);

export async function encryptProtectedArticle(article: ProtectedArticle, password: string): Promise<ProtectedEnvelope> {
  validateArticle(article, article.id);
  const plaintext = encoder.encode(JSON.stringify(article));
  check(plaintext.length <= MAX_PLAINTEXT, 'Protected article exceeds size limit');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await derive(password, salt);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(article.id), tagLength: 128 }, key, plaintext);
  return { version: 1, kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: 600000, salt: base64(salt) }, cipher: { name: 'AES-GCM', iv: base64(iv) }, ciphertext: base64(new Uint8Array(ciphertext)) };
}

export async function decryptProtectedArticle(envelope: ProtectedEnvelope, password: string, expectedId: string): Promise<ProtectedArticle> {
  check(uuid.test(expectedId) && envelope && envelope.version === 1);
  check(envelope.kdf?.name === 'PBKDF2' && envelope.kdf.hash === 'SHA-256' && envelope.kdf.iterations === 600000 && envelope.cipher?.name === 'AES-GCM');
  const salt = decode(envelope.kdf.salt, 16);
  const iv = decode(envelope.cipher.iv, 12);
  const ciphertext = decode(envelope.ciphertext, MAX_CIPHERTEXT);
  check(salt.length === 16 && iv.length === 12 && ciphertext.length >= 16);
  const key = await derive(password, salt);
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(expectedId), tagLength: 128 }, key, ciphertext);
  check(plaintext.byteLength <= MAX_PLAINTEXT);
  const article: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
  validateArticle(article, expectedId);
  return article;
}
