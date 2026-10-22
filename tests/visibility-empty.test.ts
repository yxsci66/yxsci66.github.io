import assert from 'node:assert/strict';
import test from 'node:test';
import { createRedirects } from '../src/lib/redirects.ts';

test('zero public posts never emit a redirect into a nonexistent engineering taxonomy', () => {
  assert.equal(createRedirects([]).some(route => route.to.startsWith('/categories/')), false);
  assert.equal(createRedirects([{ id: 'entry', data: { legacyPaths: [], category: 'engineering' } }]).some(route => route.from === '/categories/Engineering/'), true);
});

test('unlisted articles retain legacy URLs without creating hidden taxonomy aliases', () => {
  const routes = createRedirects([{ id: 'entry', data: { legacyPaths: ['/old-entry/'], category: 'engineering', visibility: 'unlisted' } }]);
  assert.deepEqual(routes.find(route => route.from === '/old-entry/'), { from: '/old-entry/', to: '/blog/entry/' });
  assert.equal(routes.some(route => route.to.startsWith('/categories/')), false);
});
