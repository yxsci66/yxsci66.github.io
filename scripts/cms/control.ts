import { digest, requireValue, UUID } from './content.ts';
import type { Operation } from './transaction.ts';
export function parseControl(payload: any): Operation {
  requireValue(payload?.source === 'pages-cms' && payload.repository?.owner === 'yxsci66' && payload.repository?.repo === 'harlen-blog-content' && payload.repository?.ref === 'main', 'Unexpected control repository');
  requireValue(payload.triggeredBy?.githubUsername?.toLowerCase() === 'yxsci66', 'Only the repository owner can publish');
  const timestamp = Date.parse(payload.triggeredAt);
  requireValue(Number.isFinite(timestamp) && timestamp <= Date.now() + 5 * 60 * 1000 && timestamp >= Date.now() - 24 * 60 * 60 * 1000, 'Expired control request');
  const operation = payload.action?.name;
  requireValue(['publish','withdraw','rotate-password','restore','rebuild'].includes(operation), 'Unknown editorial action');
  const requestId = digest(JSON.stringify(payload));
  if (operation === 'rebuild') { requireValue(payload.context?.type === 'repo', 'Rebuild must use repository action'); return { requestId, operation }; }
  const record = payload.context?.data?.content;
  const id = record?.articleId;
  requireValue(typeof id === 'string' && UUID.test(id) && payload.context.type === 'entry' && payload.context.name === 'manage' && payload.context.path === `manage/${id}.json`, 'Action must target a management record');
  requireValue(Number.isSafeInteger(record.sequence) && record.sequence >= 0 && /^[0-9a-f]{64}$/.test(record.sourceRevision), 'Missing source precondition');
  const restoreSnapshot = payload.inputs?.snapshot;
  if (operation === 'restore') requireValue(typeof restoreSnapshot === 'string' && /^[0-9a-f]{64}$/.test(restoreSnapshot), 'Invalid restore snapshot');
  return { requestId, operation, articleId: id, expectedSequence: record.sequence, expectedSource: record.sourceRevision, ...(operation === 'restore' ? { restoreSnapshot } : {}) };
}
