import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeProtectedAssets } from '../src/lib/protected-assets.ts';

test('protected media only creates supported inert blobs with unique ids and bounded raw size', () => {
  const image = { id: 'photo', name: 'photo.png', mime: 'image/png', dataBase64: 'AQID' };
  assert.equal(decodeProtectedAssets([image]).get('photo')?.blob.size, 3);
  for (const assets of [[{ ...image, mime: 'image/svg+xml' }], [{ ...image, mime: 'text/html' }], [{ ...image, name: 'execute.html', mime: 'text/plain' }], [image, image], [{ ...image, id: '../photo' }], [{ ...image, dataBase64: 'not base64' }]]) {
    assert.throws(() => decodeProtectedAssets(assets), /asset/i);
  }
  assert.throws(() => decodeProtectedAssets([{ ...image, dataBase64: 'AAAA'.repeat(Math.ceil(10 * 1024 * 1024 / 3) + 1) }]), /asset/i);
});
