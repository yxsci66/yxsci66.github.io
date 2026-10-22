import { expect, test } from '@playwright/test';
import { encryptProtectedArticle, type ProtectedArticle } from '../../src/lib/protected-crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const id = process.env.HARLEN_EDITORIAL_TEST_ID;
const password = 'editorial-browser-fixture-only';
const secret = 'encrypted-browser-canary';

test('CMS entry explains manual save and separate publishing', async ({ page }) => {
  await page.goto('/admin/');
  await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
  await expect(page.getByRole('link', { name: '打开 Pages CMS ↗' })).toHaveAttribute('href', 'https://app.pagescms.org/');
  await expect(page.getByText('yxsci66/harlen-blog-content', { exact: true })).toBeVisible();
  await expect(page.getByText(/保存不会自动发布/)).toBeVisible();
});

test.describe('prepared visibility and encrypted browser fixture', () => {
  test.skip(!id, 'Run against the isolated prepared editorial fixture with HARLEN_EDITORIAL_TEST_ID.');

  test('without JavaScript the password form is inert and native serialization cannot put a password in the URL', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, baseURL });
    const page = await context.newPage();
    try {
      await page.goto(`/locked/${id}/`);
      await expect(page.getByLabel('文章密码')).toBeDisabled();
      await expect(page.getByRole('button', { name: '解锁阅读' })).toBeDisabled();
      await expect(page.getByRole('button', { name: '显示密码' })).toBeDisabled();
      const noScriptNotice = page.locator('.locked-gate noscript > p');
      await expect(noScriptNotice).toHaveText('加密文章需要启用 JavaScript，并使用支持 Web Crypto 的浏览器。');
      await expect(noScriptNotice).toBeVisible();
      // Even if the browser or an extension restores/enables an input before the
      // app starts, native form submission must have no named secret to serialize.
      const serialized = await page.evaluate(() => {
        const form = document.querySelector<HTMLFormElement>('.unlock-form')!;
        const input = form.querySelector<HTMLInputElement>('input')!;
        input.disabled = false; input.value = 'native-submit-secret-canary';
        return [...new FormData(form).entries()];
      });
      expect(serialized).toEqual([]);
      const requests: string[] = [];
      page.on('request', request => requests.push(request.url()));
      const navigation = page.waitForRequest(request => request.isNavigationRequest());
      await page.evaluate(() => document.querySelector<HTMLFormElement>('.unlock-form')!.submit());
      const nativeSubmission = await navigation;
      expect(nativeSubmission.url()).not.toContain('native-submit-secret-canary');
      expect(requests.every(url => !url.includes('native-submit-secret-canary') && !url.includes('password='))).toBe(true);
    } finally { await context.close(); }
  });

  test('public comments use stable article ID rather than its title or URL', async ({ request }) => {
    const html = await (await request.get('/blog/first-blog/')).text();
    expect(html).toContain('data-term="08ff174d-dc2b-4a65-a0c2-1ec88b3249be"');
    expect(html).toContain('data-mapping="specific"');
    expect(html).toContain('data-strict="1"');
  });

  test('mobile wrong password, inert HTML, local assets, long reader relock and pagehide cleanup', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    const article: ProtectedArticle = { version: 1, id: id!, title: secret, description: 'Only decrypted in memory', pubDate: '2026-10-23', category: 'private category', tags: ['private tag'],
      html: `<script>window.editorialInjected=true</script><iframe src="https://forbidden.test/frame"></iframe><img src="https://forbidden.test/pixel" onerror="window.editorialInjected=true"><img src="harlen-asset:photo" alt="local image"><a href="harlen-asset:note">download note</a><a href="javascript:alert(1)">unsafe</a><p style="background:url(https://forbidden.test/css)">safe prose</p>${'<p>Long reading content.</p>'.repeat(80)}`,
      assets: [{ id: 'photo', name: 'photo.png', mime: 'image/png', dataBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j7l8AAAAASUVORK5CYII=' }, { id: 'note', name: 'note.txt', mime: 'text/plain', dataBase64: 'c2VjcmV0' }],
    };
    const envelope = await encryptProtectedArticle(article, password);
    const unexpected: string[] = [];
    page.on('request', request => { if (/forbidden\.test|giscus\.app/.test(request.url())) unexpected.push(request.url()); });
    await page.route(`**/locked-assets/${id}.json`, route => route.fulfill({ json: envelope }));
    await page.addInitScript(() => {
      const urls: string[] = [];
      const revoked: string[] = [];
      const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = blob => { const url = create(blob); urls.push(url); return url; };
      URL.revokeObjectURL = url => { revoked.push(url); revoke(url); };
      Object.assign(window, { editorialURLs: urls, editorialRevoked: revoked });
    });
    await page.goto(`/locked/${id}/`);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
    expect(await page.content()).not.toContain(secret);
    const input = page.getByLabel('文章密码');
    await input.fill('wrong password');
    await page.getByRole('button', { name: '解锁阅读' }).click();
    await expect(page.getByRole('status')).toContainText('未能解锁');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
    await input.fill(password);
    await page.getByRole('button', { name: '显示密码' }).click();
    await expect(input).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: '解锁阅读' }).click();
    await expect(page.getByRole('heading', { name: secret })).toBeVisible();
    await expect(page.getByRole('heading', { name: secret })).toBeFocused();
    await expect(page.locator('.protected-body img')).toHaveCount(1);
    await expect(page.locator('.protected-body img')).toHaveAttribute('src', /^blob:/);
    await expect(page.getByRole('link', { name: 'download note' })).toHaveAttribute('download', 'note.txt');
    await expect(page.locator('.protected-body script, .protected-body iframe, .protected-body [style], .protected-body [onerror]')).toHaveCount(0);
    await expect(page.getByText('unsafe', { exact: true })).not.toHaveAttribute('href', /javascript/);
    expect(unexpected).toEqual([]);
    expect(await page.evaluate(() => ({ local: Object.keys(localStorage), session: Object.keys(sessionStorage), query: location.search, hash: location.hash }))).toEqual({ local: [], session: [], query: '', hash: '' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('button', { name: '结束阅读，重新锁定' }).scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: '重新锁定', exact: true })).toBeInViewport();
    await page.getByRole('button', { name: '结束阅读，重新锁定' }).click();
    await expect(input).toBeFocused();
    await expect(input).toHaveAttribute('type', 'password');
    await expect(page.locator('.protected-body')).toBeEmpty();
    expect(await page.evaluate(() => { const state = window as unknown as { editorialURLs: string[]; editorialRevoked: string[] }; return state.editorialURLs.every(url => state.editorialRevoked.includes(url)); })).toBe(true);
    await input.fill(password); await page.getByRole('button', { name: '解锁阅读' }).click();
    await expect(page.getByRole('heading', { name: secret })).toBeVisible();
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pagehide')));
    await expect(page.locator('.protected-body')).toBeEmpty();
    expect(await page.evaluate(() => { const state = window as unknown as { editorialURLs: string[]; editorialRevoked: string[] }; return state.editorialURLs.every(url => state.editorialRevoked.includes(url)); })).toBe(true);
  });

  test('unlisted/private/password are absent from discovery and generated files contain no private canary', async ({ page }) => {
    await page.goto('/editorial-unlisted-old/');
    await expect(page).toHaveURL(/\/blog\/editorial-unlisted\/$/);
    await expect(page.locator('meta[name=robots]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('[data-pagefind-body], script[src*="giscus.app"], .post-pagination a')).toHaveCount(0);
    await expect(page.locator('.article-meta a, .post-tags a')).toHaveCount(0);
    const sitemap = readFileSync(resolve('dist/sitemap-0.xml'), 'utf8');
    expect(sitemap).not.toContain('/blog/editorial-unlisted/');
    expect(sitemap).not.toContain('/locked/');
    for (const path of ['/', '/blog/', '/archives/', '/tags/', '/categories/', '/rss.xml']) {
      await page.goto(path); expect(await page.content()).not.toContain('unlisteddiscoverycanary20261023');
    }
    for (const file of readdirSync(resolve('dist'), { recursive: true }).map(String)) {
      if (!/\.(?:html|xml|json|js|css)$/.test(file)) continue;
      expect(readFileSync(resolve('dist', file), 'utf8'), file).not.toContain('private-source-canary');
    }
    await page.goto('/search/');
    await page.getByRole('searchbox').fill('unlisteddiscoverycanary20261023');
    await expect(page.locator('pagefind-summary')).toContainText(/0|没有/);
  });
});
