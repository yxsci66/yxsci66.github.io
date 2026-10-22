import test from 'node:test';
import assert from 'node:assert/strict';
const engine = await import('../scripts/cms/transaction.ts').catch(() => null);
const id = '2438a7ae-9da9-4ef8-bd93-71fc641f112b';
const baseRequest = { requestId: 'run-1', operation: 'publish' as const, articleId: id, expectedSequence: 0, expectedSource: 'source-A' };

test('manual saves are independent of online state; stale and repeated requests cannot publish', async () => {
  assert.ok(engine, 'transaction engine must exist');
  let state = engine.emptyState();
  const hooks = { persist: async (value: any) => { state = structuredClone(value); }, createRelease: async () => 'a'.repeat(40), deploy: async () => 'success' as const };
  await assert.rejects(() => engine.runTransaction(state, { ...baseRequest, expectedSource: 'old' }, { sourceRevision: 'source-A', snapshot: 'snapshot-1', visibility: 'public' }, hooks));
  assert.deepEqual(state.articles, {});
  await engine.runTransaction(state, baseRequest, { sourceRevision: 'source-A', snapshot: 'snapshot-1', visibility: 'public' }, hooks);
  assert.equal(state.articles[id].snapshot, 'snapshot-1');
  await assert.rejects(() => engine.runTransaction(state, baseRequest, { sourceRevision: 'new-draft', snapshot: 'snapshot-2', visibility: 'private' }, hooks));
  assert.equal(state.articles[id].snapshot, 'snapshot-1');
  await assert.rejects(() => engine.runTransaction(state, { ...baseRequest, requestId: 'run-2', expectedSource: 'new-draft' }, { sourceRevision: 'new-draft', snapshot: 'snapshot-2', visibility: 'private' }, hooks));
});

test('interrupted deployment reconciles exact pending release before applying a queued request', async () => {
  assert.ok(engine);
  let state = engine.emptyState();
  const hooks = { persist: async (value: any) => { state = structuredClone(value); }, createRelease: async () => 'b'.repeat(40), deploy: async () => { throw new Error('connection interrupted'); } };
  await assert.rejects(() => engine.runTransaction(state, baseRequest, { sourceRevision: 'source-A', snapshot: 'snapshot-1', visibility: 'public' }, hooks));
  assert.equal(state.pending?.releaseSha, 'b'.repeat(40));
  assert.equal(state.articles[id]?.snapshot, null);
  await engine.reconcilePending(state, { ...hooks, deploy: async () => 'success' as const });
  assert.equal(state.articles[id].snapshot, 'snapshot-1');
  assert.equal(state.pending, undefined);
  assert.equal(state.requests['run-1'], 'completed');
});

test('failed build keeps previous online version and restore/rotation preserve publication access semantics', async () => {
  assert.ok(engine);
  let state = engine.emptyState();
  state.articles[id] = { sequence: 0, snapshot: 'snapshot-older', visibility: 'password', history: ['snapshot-older'] };
  const hooks = { persist: async (value: any) => { state = structuredClone(value); }, createRelease: async () => 'c'.repeat(40), deploy: async () => 'success' as const };
  await engine.runTransaction(state, baseRequest, { sourceRevision: 'source-A', snapshot: 'snapshot-1', visibility: 'password' }, hooks);
  const password = state.access[id];
  assert.match(password, /^[A-Za-z0-9_-]{22}$/);
  const seq = state.articles[id].sequence;
  const next = { ...baseRequest, requestId: 'restore', operation: 'restore' as const, expectedSequence: seq, restoreSnapshot: 'snapshot-older' };
  await engine.runTransaction(state, next, { sourceRevision: 'source-A', snapshot: 'unpublished-draft', visibility: 'public' }, hooks);
  assert.equal(state.articles[id].snapshot, 'snapshot-older');
  assert.equal(state.articles[id].visibility, 'password');
  assert.equal(state.access[id], password);
  await assert.rejects(() => engine.runTransaction(state, { ...next, requestId: 'failed', operation: 'publish', expectedSequence: state.articles[id].sequence }, { sourceRevision: 'source-A', snapshot: 'new', visibility: 'public' }, { ...hooks, createRelease: async () => { throw new Error('build failed'); } }));
  assert.equal(state.articles[id].snapshot, 'snapshot-older');
  assert.equal(state.pending, undefined);
  await engine.runTransaction(state, { ...next, requestId: 'rotate', operation: 'rotate-password', expectedSequence: state.articles[id].sequence }, { sourceRevision: 'source-A', snapshot: 'unpublished-draft', visibility: 'private' }, hooks);
  assert.equal(state.articles[id].snapshot, 'snapshot-older');
  assert.notEqual(state.access[id], password);
});
