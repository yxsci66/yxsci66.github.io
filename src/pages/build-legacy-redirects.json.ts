import { getPosts } from '../lib/posts';
import { createRedirects } from '../lib/redirects';

// Build-only handoff; finalize-build removes this endpoint before publication.
export async function GET() {
  return new Response(JSON.stringify(createRedirects(await getPosts())));
}
