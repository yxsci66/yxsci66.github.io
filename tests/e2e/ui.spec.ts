import { expect, test } from '@playwright/test';

test('reader can discover an article and browse its taxonomy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: "Harlen's World", exact: true })).toBeVisible();
  await expect(page.getByText('重度文青，搬砖码农', { exact: true }).first()).toBeVisible();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '文章', exact: true }).click();
  await expect(page.getByRole('heading', { name: '文章', exact: true })).toBeVisible();
  await page.locator('.post-list h2 a').first().click();
  await expect(page.locator('article [data-pagefind-body]')).toBeVisible();
  await expect(page.locator('article time').first()).toBeVisible();
  await page.goto('/tags/');
  await expect(page.getByRole('heading', { name: '标签', exact: true })).toBeVisible();
  await page.locator('.taxonomy-list a').first().click();
  await expect(page.locator('.post-list article')).not.toHaveCount(0);
});

test('mobile menu supports keyboard navigation without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: /导航/ });
  await menu.focus();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('navigation', { name: '主导航' }).getByRole('link', { name: '关于', exact: true }).click();
  await expect(page.getByRole('heading', { name: '关于我', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('article code can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/blog/');
  const links = await page.locator('.post-list h2 a').evaluateAll(nodes => nodes.map(node => (node as HTMLAnchorElement).pathname));
  for (const link of links) {
    await page.goto(link);
    const button = page.getByRole('button', { name: '复制代码' }).first();
    if (await button.count()) {
      await button.click();
      await expect(button).toHaveText('已复制');
      const copied = await page.evaluate(() => navigator.clipboard.readText());
      const original = await page.locator('.prose pre code').first().textContent();
      expect(copied.replace(/\r\n/g, '\n')).toBe(original?.replace(/\r\n/g, '\n'));
      return;
    }
  }
  throw new Error('Migrated articles should include their original code blocks');
});

test('search finds Chinese and English article text and reports no matches', async ({ page }) => {
  await page.goto('/search/');
  const input = page.getByRole('searchbox');
  await input.fill('快乐');
  await expect(page.locator('pagefind-results').getByRole('link', { name: '10种快乐', exact: true })).toBeVisible();
  await input.fill('vscode');
  const result = page.locator('pagefind-results').getByRole('link', { name: 'formatting on vscode', exact: true });
  await expect(result).toBeVisible();
  await result.click();
  await expect(page.getByRole('heading', { name: 'formatting on vscode', exact: true })).toBeVisible();
  await page.goto('/search/');
  await page.getByRole('searchbox').fill('zzzxxyy987654321');
  await expect(page.locator('pagefind-summary')).toContainText('未找到');
  await expect(page.locator('pagefind-results').getByRole('link')).toHaveCount(0);
});

test('404 stays out of search indexes and offers a working route home', async ({ page }) => {
  await page.goto('/404.html');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
  await expect(page.locator('meta[property="og:url"]')).toHaveCount(0);
  await page.getByRole('link', { name: '回到首页 →', exact: true }).click();
  await expect(page.getByRole('heading', { name: "Harlen's World", exact: true })).toBeVisible();
});
