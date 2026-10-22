export interface Redirect { from: string; to: string }
interface LegacyPost { id: string; data: { legacyPaths: string[]; category?: string; visibility?: string } }
export function createRedirects(posts: LegacyPost[]): Redirect[] {
  const redirects: Redirect[] = [
    ...['2021', '2021/09', '2021/11', '2022', '2022/06'].map(part => ({ from: `/archives/${part}/`, to: '/archives/' })),
    { from: '/archive/', to: '/archives/' },
    ...(posts.some(post => post.data.category === 'engineering' && (post.data.visibility ?? 'public') === 'public') ? [{ from: '/categories/Engineering/', to: '/categories/engineering/' }] : []),
    ...posts.flatMap(post => post.data.legacyPaths.map(from => ({ from, to: `/blog/${post.id}/` }))),
  ];
  const seen = new Set<string>();
  return redirects.map(({ from, to }) => {
    if (!from.startsWith('/') || from.startsWith('//') || /[\\?#\u0000-\u001f]|%2f|%5c/i.test(from)) throw new Error(`Invalid legacy path: ${from}`);
    const decoded = decodeURIComponent(from);
    if (decoded.split('/').some(segment => segment === '.' || segment === '..') || /[\\?#\u0000-\u001f]/.test(decoded)) throw new Error(`Invalid legacy path: ${from}`);
    const normalized = decoded.replace(/index\.html$/, '').replace(/\/$/, '') + '/';
    if (normalized === '/' || seen.has(normalized)) throw new Error(`Duplicate or root legacy path: ${from}`);
    seen.add(normalized);
    return { from: normalized, to };
  });
}
