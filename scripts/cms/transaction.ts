import { randomBytes } from 'node:crypto';
import { requireValue, UUID } from './content.ts';
import type { Visibility } from './content.ts';

export interface LiveArticle { sequence: number; snapshot: string | null; visibility: Visibility; history: string[] }
export interface Candidate { articles: Record<string, LiveArticle>; access: Record<string, string> }
export interface Pending { requestId: string; candidate: Candidate; createdAt: string; releaseSha?: string }
export interface Ledger extends Candidate { version: 1; requests: Record<string, 'pending' | 'completed' | 'failed'>; pending?: Pending; onlineReleaseSha?: string }
export interface Operation { requestId: string; operation: 'publish' | 'withdraw' | 'rotate-password' | 'restore' | 'rebuild'; articleId?: string; expectedSequence?: number; expectedSource?: string; restoreSnapshot?: string }
export interface SavedSource { sourceRevision: string; snapshot?: string; visibility: Visibility }
export interface TransactionHooks { persist(state: Ledger): Promise<void>; createRelease(candidate: Candidate): Promise<string>; deploy(sha: string): Promise<'success' | 'failure'> }
export const emptyState = (): Ledger => ({ version: 1, articles: {}, access: {}, requests: {} });

async function complete(state: Ledger, hooks: TransactionHooks, success: boolean): Promise<void> {
  const pending = state.pending!;
  if (success) {
    state.articles = pending.candidate.articles;
    state.access = pending.candidate.access;
    state.onlineReleaseSha = pending.releaseSha;
  }
  state.requests[pending.requestId] = success ? 'completed' : 'failed';
  delete state.pending;
  await hooks.persist(state);
}

export async function reconcilePending(state: Ledger, hooks: TransactionHooks): Promise<void> {
  if (!state.pending) return;
  if (!state.pending.releaseSha) { await complete(state, hooks, false); return; }
  const result = await hooks.deploy(state.pending.releaseSha);
  await complete(state, hooks, result === 'success');
  requireValue(result === 'success', 'Previous deployment failed; online state retained');
}

export async function runTransaction(state: Ledger, request: Operation, source: SavedSource | undefined, hooks: TransactionHooks): Promise<void> {
  requireValue(!state.pending, 'Reconcile pending deployment first');
  requireValue(/^[a-zA-Z0-9_-]{1,120}$/.test(request.requestId) && !state.requests[request.requestId], 'Duplicate or invalid request');
  const candidate: Candidate = structuredClone({ articles: state.articles, access: state.access });
  if (request.operation !== 'rebuild') {
    const id = request.articleId!;
    requireValue(UUID.test(id), 'Invalid article ID');
    const current = state.articles[id] ?? { sequence: 0, snapshot: null, visibility: 'private', history: [] };
    requireValue(Number.isSafeInteger(request.expectedSequence) && request.expectedSequence === current.sequence, 'Stale operation sequence');
    requireValue(source && request.expectedSource === source.sourceRevision, 'Stale source precondition');
    const next: LiveArticle = structuredClone(current);
    next.sequence += 1;
    switch (request.operation) {
      case 'publish':
        requireValue(source.snapshot, 'Publish requires an immutable snapshot');
        next.snapshot = source.visibility === 'private' ? null : source.snapshot;
        next.visibility = source.visibility;
        if (!next.history.includes(source.snapshot)) next.history.push(source.snapshot);
        if (next.visibility === 'password' && !candidate.access[id]) candidate.access[id] = randomBytes(16).toString('base64url');
        break;
      case 'withdraw': next.snapshot = null; break;
      case 'rotate-password':
        requireValue(next.snapshot && next.visibility === 'password', 'Only a published password article can rotate');
        candidate.access[id] = randomBytes(16).toString('base64url');
        break;
      case 'restore':
        requireValue(request.restoreSnapshot && current.snapshot, 'Restore requires an online article and a previous snapshot');
        requireValue(current.history.includes(request.restoreSnapshot), 'Restore snapshot was never published for this article');
        next.snapshot = request.restoreSnapshot;
        if (!next.history.includes(request.restoreSnapshot)) next.history.push(request.restoreSnapshot);
        break;
    }
    candidate.articles[id] = next;
    // Acceptance consumes the sequence even if build fails, preventing an old queued action replay.
    state.articles[id] = { ...current, sequence: next.sequence };
  }
  state.requests[request.requestId] = 'pending';
  state.pending = { requestId: request.requestId, candidate, createdAt: new Date().toISOString() };
  await hooks.persist(state);
  try {
    const sha = await hooks.createRelease(candidate);
    requireValue(/^[0-9a-f]{40}$/.test(sha), 'Invalid release SHA');
    state.pending.releaseSha = sha;
    // Must persist the SHA before the adapter pushes or dispatches any public deployment.
    await hooks.persist(state);
  } catch (error) {
    await complete(state, hooks, false);
    throw error;
  }
  await reconcilePending(state, hooks);
}
