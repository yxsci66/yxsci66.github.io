import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedirects } from '../src/lib/redirects.ts';

test('old Chinese and index.html aliases normalize to a single static directory', () => {
  assert.deepEqual(createRedirects([{ id: 'entry', data: { legacyPaths: ['/日记/index.html'] } }]).at(-1), { from: '/日记/', to: '/blog/entry/' });
});

test('duplicate aliases and unsafe paths fail rather than overwriting routes', () => {
  assert.throws(() => createRedirects([{ id: 'a', data: { legacyPaths: ['/same/', '/same/index.html'] } }]), /Duplicate/);
  for (const path of ['/../escape/', '//external.test/', '/a?b=1', '/a%2fb/']) {
    assert.throws(() => createRedirects([{ id: 'a', data: { legacyPaths: [path] } }]), /Invalid/);
  }
});
