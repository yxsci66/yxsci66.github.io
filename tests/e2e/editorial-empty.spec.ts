import { expect, test } from '@playwright/test';

test('zero-public production has explicit empty search and a genuinely empty Pagefind index', async ({ page, request }) => {
  test.skip(process.env.HARLEN_EDITORIAL_EMPTY !== '1', 'Requires isolated zero-public prepared build.');
  await page.goto('/search/');
  await expect(page.getByText('暂时没有公开文章可供搜索。')).toBeVisible();
  await expect(page.locator('pagefind-input, script[src*="pagefind-component"]')).toHaveCount(0);
  const entries = await (await request.get('/pagefind/pagefind-entry.json')).json();
  expect(Object.values(entries.languages).every(language => (language as { page_count: number }).page_count === 0)).toBe(true);
  expect(await (await request.get('/rss.xml')).text()).not.toContain('<item>');
  expect(await (await request.get('/sitemap-0.xml')).text()).not.toContain('/blog/editorial-unlisted/');
});
