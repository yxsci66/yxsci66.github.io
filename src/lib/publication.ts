export function selectPublishedPosts<T extends { data: { draft: boolean; pubDate: Date } }>(posts: readonly T[]): T[] {
  return posts.filter((post) => !post.data.draft).sort((a, b) => b.data.pubDate.getTime() - a.data.pubDate.getTime());
}
