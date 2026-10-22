import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPublishedPosts, selectRoutablePosts, commentsAllowed } from '../src/lib/publication.ts';
import { validCommentsConfig } from '../src/config/comments.ts';

const posts = ['public', 'unlisted', 'password', 'private'].map((visibility, index) => ({
  id: visibility, data: { visibility, commentsEnabled: true, draft: false, pubDate: new Date(2026, 0, index + 1) },
}));

test('every discovery consumer receives only public articles, including legacy defaults', () => {
  const legacy = { id: 'legacy', data: { draft: false, pubDate: new Date('2020-01-01') } };
  assert.deepEqual(selectPublishedPosts([...posts, legacy]).map(post => post.id), ['public', 'legacy']);
  assert.deepEqual(selectPublishedPosts(posts.filter(post => post.id !== 'public')), []);
});

test('readable routes include unlisted, never password/private or drafts', () => {
  assert.deepEqual(selectRoutablePosts([...posts, { ...posts[0], id: 'draft', data: { ...posts[0].data, draft: true } }]).map(post => post.id), ['unlisted', 'public']);
});

test('comments require explicit opt-in and public visibility', () => {
  assert.deepEqual(posts.map(post => commentsAllowed(post.data)), [true, false, false, false]);
  assert.equal(commentsAllowed({ visibility: 'public', commentsEnabled: false }), false);
  assert.equal(commentsAllowed({ visibility: 'public' }), false);
  assert.equal(commentsAllowed({ visibility: 'public', commentsEnabled: true, draft: true }), false);
});

test('incomplete or malformed giscus identifiers never enable comments', () => {
  const valid = { repo: 'owner/blog', repoId: 'R_example', category: 'Announcements', categoryId: 'DIC_example' };
  assert.equal(validCommentsConfig(valid), true);
  for (const field of ['repo', 'repoId', 'category', 'categoryId']) assert.equal(validCommentsConfig({ ...valid, [field]: '' }), false);
  assert.equal(validCommentsConfig({ ...valid, repo: 'https://example.test/repo' }), false);
});
