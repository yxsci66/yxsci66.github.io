import { getPosts, postUrl } from '../lib/posts';

// Build-only authorization list. The search builder removes it before export.
export async function GET() {
  return new Response(JSON.stringify((await getPosts()).map(postUrl)));
}
