export type Visibility = 'public' | 'unlisted' | 'password' | 'private';
interface PublicationData { draft?: boolean; pubDate: Date; visibility?: string; commentsEnabled?: boolean }

export function selectPublishedPosts<T extends { data: PublicationData }>(posts: readonly T[]): T[] {
  return posts.filter(({ data }) => !data.draft && (data.visibility ?? 'public') === 'public')
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

export function selectRoutablePosts<T extends { data: PublicationData }>(posts: readonly T[]): T[] {
  return posts.filter(({ data }) => !data.draft && ['public', 'unlisted'].includes(data.visibility ?? 'public'))
    .sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}

export function commentsAllowed(data: Pick<PublicationData, 'visibility' | 'commentsEnabled' | 'draft'>): boolean {
  return !data.draft && (data.visibility ?? 'public') === 'public' && data.commentsEnabled === true;
}
