import rss from '@astrojs/rss';
import { site } from '../config/site';
import { getPosts, postUrl } from '../lib/posts';

export async function GET() {
  return rss({
    title: site.title,
    description: site.description,
    site: site.url,
    customData: `<language>${site.language}</language>`,
    items: (await getPosts()).map(post => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.pubDate,
      link: postUrl(post),
      categories: post.data.category ? [post.data.category] : [],
    })),
  });
}
