// covers: {terms,privacy}.html, src/legal.css, src/site-chrome.css, scripts/site-nav.mjs

import { expect, test } from '@playwright/test';

for (const policy of [
  { path: '/terms', title: 'Terms of Use' },
  { path: '/privacy', title: 'Privacy Policy' },
] as const) {
  for (const [label, width, height] of [['desktop', 1366, 768], ['phone', 390, 844]] as const) {
    test(`${policy.title} is public and fits ${label}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      const response = await page.goto(policy.path);
      expect(response?.ok()).toBe(true);
      await expect(page.getByRole('heading', { level: 1, name: policy.title })).toBeVisible();
      // The site's top bar and footer (scripts/site-nav.mjs), with this page marked in the footer.
      await expect(page.locator('header.top nav a.btn-amber')).toHaveAttribute('href', '/app#/new');
      await expect(page.locator('header.top .wordmark')).toHaveAttribute('href', '/');
      await expect(page.locator('footer.site a[aria-current="page"]')).toHaveAttribute('href', policy.path);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    });
  }
}

test('the policies explain managed AI processing accurately', async ({ page }) => {
  await page.goto('/privacy');
  const policy = page.locator('main');
  await expect(policy).toContainText('pass through Vercel AI Gateway to an eligible model provider');
  await expect(policy).toContainText('zero data retention');
  await expect(policy).toContainText('prohibit prompt training');
  await expect(policy).toContainText('provider still receives the request transiently');
  await expect(policy).toContainText('Custom or bring-your-own-key providers');
});

test('the landing page links both public policies', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
  await expect(page.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
});
