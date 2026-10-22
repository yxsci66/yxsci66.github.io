import assert from 'node:assert/strict';
import test from 'node:test';
import { selectPublishedPosts } from '../src/lib/publication.ts';

test('公开内容排除草稿并按日期倒序，不改变输入数组', () => {
  const posts = [
    { id: 'older', data: { pubDate: new Date('2021-09-23'), draft: false } },
    { id: 'private', data: { pubDate: new Date('2026-10-22'), draft: true } },
    { id: 'newer', data: { pubDate: new Date('2022-06-29'), draft: false } },
  ];
  assert.deepEqual(selectPublishedPosts(posts).map((post) => post.id), ['newer', 'older']);
  assert.deepEqual(posts.map((post) => post.id), ['older', 'private', 'newer']);
});

test('同一天的文章排序稳定，保持原有先后顺序', () => {
  const posts = ['a', 'b'].map((id) => ({ id, data: { pubDate: new Date('2022-06-29'), draft: false } }));
  assert.deepEqual(selectPublishedPosts(posts).map((post) => post.id), ['a', 'b']);
});
