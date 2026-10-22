import { expect, test } from '@playwright/test';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const legacy = [
  ['/2021/09/23/日记210923/', '/blog/diary-20210923/'],
  ['/2021/11/07/日记211107/', '/blog/diary-20211107/'],
  ['/2022/06/29/10种快乐/', '/blog/ten-kinds-of-happiness/'],
  ['/2022/06/29/formatting-on-vscode/', '/blog/formatting-on-vscode/'],
  ['/firstblog/', '/blog/first-blog/'],
  ...['2021', '2021/09', '2021/11', '2022', '2022/06'].map(part => [`/archives/${part}/`, '/archives/']),
  ['/archive/', '/archives/'],
  ['/categories/Engineering/', '/categories/engineering/'],
];

test('RSS is valid XML with original dates, summaries and canonical links', async ({ page }) => {
  await page.goto('/rss.xml');
  const feed = await page.evaluate(async () => {
    const source = await (await fetch('/rss.xml')).text();
    const xml = new DOMParser().parseFromString(source, 'application/xml');
    return {
      errors: xml.querySelectorAll('parsererror').length,
      language: xml.querySelector('channel > language')?.textContent,
      items: [...xml.querySelectorAll('item')].map(item => ({
        link: item.querySelector('link')?.textContent,
        date: item.querySelector('pubDate')?.textContent,
        description: item.querySelector('description')?.textContent,
      })),
    };
  });
  expect(feed.errors).toBe(0);
  expect(feed.language).toBe('zh-CN');
  const articleIds = readdirSync(resolve('dist/blog'), { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name);
  expect(feed.items.map(item => new URL(item.link!).pathname).sort()).toEqual(articleIds.map(id => `/blog/${id}/`).sort());
  for (const item of feed.items) {
    expect(item.link).toMatch(/^https:\/\/yxsci66\.github\.io\/blog\/.+\/$/);
    expect(item.description?.length).toBeGreaterThan(0);
    expect(Number.isNaN(Date.parse(item.date!))).toBe(false);
  }
  const originalDates = {
    'diary-20210923': '2021-09-23', 'diary-20211107': '2021-11-07',
    'ten-kinds-of-happiness': '2022-06-29', 'formatting-on-vscode': '2022-06-29', 'first-blog': '2022-06-20',
  };
  for (const [id, date] of Object.entries(originalDates)) {
    expect(feed.items.find(item => item.link?.endsWith(`/blog/${id}/`))?.date).toBe(new Date(date).toUTCString());
  }
});

test('legacy URLs redirect in browser, including Chinese encoded paths and index.html', async ({ page }) => {
  for (const [source, target] of legacy) {
    for (const path of [source, `${source}index.html`, encodeURI(source)]) {
      await page.goto(path);
      if (process.platform === 'win32' && source === '/categories/Engineering/') {
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://yxsci66.github.io${target}`);
      } else {
        await expect(page).toHaveURL(new RegExp(`${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`));
      }
      await expect(page.locator('h1').first()).toBeVisible();
    }
  }
});

test('all built local href/src targets exist and aliases stay out of sitemap', async ({ request }) => {
  const root = resolve('dist');
  const files = readdirSync(root, { recursive: true }).map(String);
  const missing: string[] = [];
  for (const file of files.filter(file => file.endsWith('.html'))) {
    const html = readFileSync(resolve(root, file), 'utf8');
    for (const match of html.replace(/<link[^>]+rel="canonical"[^>]*>/g, '').matchAll(/(?:href|src)="([^"]+)"/g)) {
      const url = new URL(match[1].replaceAll('&amp;', '&'), `https://yxsci66.github.io/${file.replaceAll('\\', '/')}`);
      if (url.origin !== 'https://yxsci66.github.io') continue;
      const path = decodeURIComponent(url.pathname);
      const target = resolve(root, `.${path}`);
      if (!existsSync(target) && !existsSync(resolve(target, 'index.html'))) missing.push(`${file} → ${path}`);
    }
  }
  expect(missing).toEqual([]);
  const sitemap = readFileSync(resolve(root, 'sitemap-0.xml'), 'utf8');
  for (const [source] of legacy) expect(decodeURI(sitemap)).not.toContain(`https://yxsci66.github.io${source}</loc>`);
  expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap: https://yxsci66.github.io/sitemap-index.xml');
  expect(await (await request.get('/googledb06e025310e016e.html')).text()).toContain('google-site-verification: googledb06e025310e016e.html');
  expect(existsSync(resolve(root, 'build-legacy-redirects.json'))).toBe(false);
});
