import test from 'node:test';
import assert from 'node:assert/strict';
const control = await import('../scripts/cms/control.ts').catch(() => null);
const id = '2438a7ae-9da9-4ef8-bd93-71fc641f112b';
const payload = () => ({ action: { name: 'publish' }, source: 'pages-cms', repository: { owner: 'yxsci66', repo: 'harlen-blog-content', ref: 'main' }, triggeredAt: new Date().toISOString(), triggeredBy: { githubUsername: 'yxsci66' }, context: { type: 'entry', name: 'manage', path: `manage/${id}.json`, data: { content: { articleId: id, sequence: 2, sourceRevision: 'a'.repeat(64), body: 'UNTRUSTED_BODY' } } }, inputs: {} });
test('control requests bind owner, managed ID, saved precondition and never accept CMS body as source', () => {
  assert.ok(control, 'control parser must exist');
  const request = control.parseControl(payload());
  assert.equal(request.articleId, id);
  assert.equal(request.expectedSequence, 2);
  assert.equal(JSON.stringify(request).includes('UNTRUSTED_BODY'), false);
  const wrongPath = payload(); wrongPath.context.path = `posts/${id}.md`;
  assert.throws(() => control.parseControl(wrongPath));
  const stale = payload(); stale.triggeredAt = '2020-01-01T00:00:00Z';
  assert.throws(() => control.parseControl(stale));
  const stranger = payload(); stranger.triggeredBy.githubUsername = 'stranger';
  assert.throws(() => control.parseControl(stranger));
});
test('repository rebuild accepts the actual Pages CMS repo context without any article content', () => {
  assert.ok(control);
  const root = { ...payload(), action: { name: 'rebuild' }, context: { type: 'repo' } };
  assert.equal(control.parseControl(root).operation, 'rebuild');
});
