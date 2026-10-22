import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  site: 'https://yxsci66.github.io',
  output: 'static',
  publicDir: process.env.HARLEN_CONTENT_ROOT ? './.cache/static-public' : './public',
  trailingSlash: 'always',
  integrations: [sitemap({ filter: (page) => {
    const pathname = decodeURIComponent(new URL(page).pathname);
    if (pathname.startsWith('/locked/') || pathname === '/admin/') return false;
    if (!pathname.startsWith('/blog/') || pathname === '/blog/') return true;
    const html = resolve('dist', `.${pathname}`, 'index.html');
    // Route visibility is decided by the server's content model and rendered as
    // noindex. Missing output is excluded rather than accidentally discovered.
    return existsSync(html) && !/<meta\s+name="robots"\s+content="noindex"/.test(readFileSync(html, 'utf8'));
  } })],
  markdown: { shikiConfig: { theme: 'github-light' } },
});
