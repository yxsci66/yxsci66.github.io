import { getCollection, type CollectionEntry } from 'astro:content';
import { selectPublishedPosts } from './publication';

export type Post = CollectionEntry<'blog'>;

export async function getPosts(): Promise<Post[]> {
  return selectPublishedPosts(await getCollection('blog'));
}

export function postUrl(post: Pick<Post, 'id'>): string {
  return `/blog/${post.id}/`;
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Shanghai',
  }).format(date);
}
