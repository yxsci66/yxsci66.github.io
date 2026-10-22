import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { contentDirectory } from './lib/content-source';
import { pathToFileURL } from 'node:url';
import { sep } from 'node:path';

const blog = defineCollection({
  loader: glob({ pattern: '**/*.md', base: pathToFileURL(contentDirectory() + sep) }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    featured: z.boolean().default(false),
    legacyPaths: z.array(z.string()).default([]),
    articleId: z.string().optional(),
    slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
    visibility: z.enum(['public', 'unlisted', 'password', 'private']).default('public'),
    commentsEnabled: z.boolean().default(false),
  }),
});
export const collections = { blog };
