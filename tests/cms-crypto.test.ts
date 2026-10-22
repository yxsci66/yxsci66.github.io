import test from 'node:test';
import assert from 'node:assert/strict';

const cryptoModule = await import('../src/lib/protected-crypto.ts').catch(() => null);
const id = '2438a7ae-9da9-4ef8-bd93-71fc641f112b';
const article = { version: 1 as const, id, title: 'Private canary title', description: 'secret', html: '<p>Hello</p>', tags: ['hidden'], pubDate: '2026-10-23', assets: [{ id: 'file-1', name: 'memo.txt', mime: 'text/plain', dataBase64: 'aGVsbG8=' }] };

test('protected article encrypts all metadata and decrypts only for its ID and password', async () => {
  assert.ok(cryptoModule, 'protected crypto module must exist');
  const envelope = await cryptoModule.encryptProtectedArticle(article, 'independent-test-password');
  assert.equal(JSON.stringify(envelope).includes('canary'), false);
  assert.deepEqual(await cryptoModule.decryptProtectedArticle(envelope, 'independent-test-password', id), article);
  await assert.rejects(() => cryptoModule.decryptProtectedArticle(envelope, 'wrong', id));
  await assert.rejects(() => cryptoModule.decryptProtectedArticle(envelope, 'independent-test-password', 'e9aaf193-7c0c-4329-91fe-cbfc17bca464'));
  await assert.rejects(() => cryptoModule.decryptProtectedArticle({ ...envelope, ciphertext: envelope.ciphertext.slice(0, -4) + 'AAAA' }, 'independent-test-password', id));
});

test('envelope rejects dangerous KDF parameters before derivation and rejects malformed article assets', async () => {
  assert.ok(cryptoModule);
  const envelope = await cryptoModule.encryptProtectedArticle(article, 'password');
  await assert.rejects(() => cryptoModule.decryptProtectedArticle({ ...envelope, kdf: { ...envelope.kdf, iterations: 1 } } as never, 'password', id));
  await assert.rejects(() => cryptoModule.encryptProtectedArticle({ ...article, assets: [article.assets[0], article.assets[0]] }, 'password'));
  await assert.rejects(() => cryptoModule.encryptProtectedArticle({ ...article, assets: [{ ...article.assets[0], dataBase64: '!!!!' }] }, 'password'));
  await assert.rejects(() => cryptoModule.encryptProtectedArticle({ ...article, assets: [{ ...article.assets[0], mime: 'text/html' }] }, 'password'));
});

test('rotation produces independent salt and old passwords cannot decrypt the rotated envelope', async () => {
  assert.ok(cryptoModule);
  const first = await cryptoModule.encryptProtectedArticle(article, 'one');
  const second = await cryptoModule.encryptProtectedArticle(article, 'two');
  assert.notEqual(first.kdf.salt, second.kdf.salt);
  await assert.rejects(() => cryptoModule.decryptProtectedArticle(second, 'one', id));
  assert.equal((await cryptoModule.decryptProtectedArticle(second, 'two', id)).title, article.title);
});

test('large valid attachments do not overflow the base64 validator stack', async () => {
  assert.ok(cryptoModule);
  const large = { ...article, assets: [{ ...article.assets[0], dataBase64: Buffer.alloc(10 * 1024 * 1024, 65).toString('base64') }] };
  const envelope = await cryptoModule.encryptProtectedArticle(large, 'password');
  assert.equal((await cryptoModule.decryptProtectedArticle(envelope, 'password', id)).assets[0].dataBase64.length, 13981016);
});
