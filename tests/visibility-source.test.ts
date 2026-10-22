import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { contentDirectory, readProtectedRoutes } from '../src/lib/content-source.ts';
mkdirSync(resolve('.cache'), { recursive: true });

test('production fails closed without complete prepared inputs; development uses legacy fixtures', () => {
  assert.match(contentDirectory({}), /src[\\/]content[\\/]blog$/);
  assert.throws(() => contentDirectory({ HARLEN_PRODUCTION: '1' }), /prepared/i);
  const root = mkdtempSync(resolve('.cache', 'visibility-'));
  try {
    assert.throws(() => contentDirectory({ HARLEN_PRODUCTION: '1', HARLEN_CONTENT_ROOT: root }), /prepared/i);
    mkdirSync(resolve(root, 'posts'));
    mkdirSync(resolve(root, 'public'));
    writeFileSync(resolve(root, 'protected.json'), '[]', 'utf8');
    assert.equal(contentDirectory({ HARLEN_PRODUCTION: '1', HARLEN_CONTENT_ROOT: root }), resolve(root, 'posts'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('locked route manifest accepts UUID and exact local payload only, rejects metadata and traversal', () => {
  const root = mkdtempSync(resolve('.cache', 'visibility-'));
  const id = '52de671f-f57b-449c-8a5d-090380c48043';
  try {
    const entry = { id, payloadUrl: `/locked-assets/${id}.json` };
    writeFileSync(resolve(root, 'protected.json'), JSON.stringify([entry]), 'utf8');
    assert.deepEqual(readProtectedRoutes({ HARLEN_CONTENT_ROOT: root }), [entry]);
    for (const invalid of [{ ...entry, title: 'secret' }, { ...entry, payloadUrl: 'https://external.test/a' }, { ...entry, id: '../secret' }]) {
      writeFileSync(resolve(root, 'protected.json'), JSON.stringify([invalid]), 'utf8');
      assert.throws(() => readProtectedRoutes({ HARLEN_CONTENT_ROOT: root }), /protected/i);
    }
    writeFileSync(resolve(root, 'protected.json'), JSON.stringify([entry, entry]), 'utf8');
    assert.throws(() => readProtectedRoutes({ HARLEN_CONTENT_ROOT: root }), /protected/i);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
