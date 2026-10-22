import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

type ContentEnvironment = { HARLEN_CONTENT_ROOT?: string; HARLEN_PRODUCTION?: string };
export interface ProtectedRoute { id: string; payloadUrl: string }

export function contentDirectory(env: ContentEnvironment = process.env): string {
  const root = env.HARLEN_CONTENT_ROOT;
  if (!root) {
    if (env.HARLEN_PRODUCTION === '1') throw new Error('Production requires complete prepared content inputs.');
    return resolve('src/content/blog');
  }
  for (const [name, directory] of [['posts', true], ['public', true], ['protected.json', false]] as const) {
    const path = resolve(root, name);
    if (!existsSync(path) || statSync(path).isDirectory() !== directory) throw new Error('Incomplete prepared content inputs.');
  }
  return resolve(root, 'posts');
}

export function readProtectedRoutes(env: ContentEnvironment = process.env): ProtectedRoute[] {
  if (!env.HARLEN_CONTENT_ROOT) {
    if (env.HARLEN_PRODUCTION === '1') throw new Error('Production requires prepared protected inputs.');
    return [];
  }
  const entries: unknown = JSON.parse(readFileSync(resolve(env.HARLEN_CONTENT_ROOT, 'protected.json'), 'utf8'));
  if (!Array.isArray(entries)) throw new Error('Invalid protected routes.');
  const ids = new Set<string>();
  return entries.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object') throw new Error('Invalid protected route.');
    const route = entry as Record<string, unknown>;
    if (Object.keys(route).sort().join(',') !== 'id,payloadUrl' || typeof route.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(route.id)
      || route.payloadUrl !== `/locked-assets/${route.id}.json` || ids.has(route.id)) throw new Error('Invalid protected route.');
    ids.add(route.id);
    return { id: route.id, payloadUrl: route.payloadUrl as string };
  });
}
