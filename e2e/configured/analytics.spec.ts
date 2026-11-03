// covers: src/backend/events.ts, src/components/AnalyticsConsentBanner.tsx, api/events.ts, api/_lib/funnelEvents.ts

import { expect, test, type Page } from '@playwright/test';

const configured = Boolean(process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY);

async function analyticsStorage(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(
    Object.entries(localStorage).filter(([key]) =>
      key.startsWith('noacg.funnel') || key.startsWith('noacg.analytics'),
    ),
  ));
}

test.beforeEach(async ({ page }) => {
  test.skip(!configured, 'Configured backend variables are required.');
  await page.route('**/api/events', (route) => route.fulfill({ status: 204 }));
  await page.route('https://example.supabase.co/**', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: '{}',
  }));
});

test('analytics remains empty until acceptance and withdrawal erases local and server history', async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.unroute('**/api/events');
  await page.route('**/api/events', async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({ status: 204 });
  });

  await page.goto('/app?utm_source=should-not-be-collected');
  await expect(page.getByTestId('analytics-consent')).toBeVisible();
  expect(bodies).toEqual([]);
  expect(await analyticsStorage(page)).toEqual({});

  await page.getByTestId('analytics-consent').getByRole('button', { name: 'Allow' }).click();
  await expect(page.getByTestId('analytics-consent')).toHaveCount(0);
  await expect.poll(() => bodies.length).toBe(1);
  expect(bodies[0]?.event).toBe('visit');
  expect(bodies[0]?.visitorId).toMatch(/^[0-9a-f-]{36}$/);
  expect(bodies[0]).not.toHaveProperty('source');
  expect(bodies[0]).not.toHaveProperty('referrerHost');
  expect(await analyticsStorage(page)).toMatchObject({
    'noacg.analytics.consent': 'accepted-v1',
  });

  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await page.getByTestId('home-settings').click();
  await page.getByTestId('settings-nav-privacy').click();
  const toggle = page.getByTestId('analytics-toggle');
  await expect(toggle).toBeChecked();
  await toggle.uncheck();

  await expect.poll(() => bodies.some((body) => body.action === 'withdraw')).toBe(true);
  expect(await analyticsStorage(page)).toEqual({ 'noacg.analytics.consent': 'declined-v1' });

  await page.reload();
  await expect(page.getByTestId('analytics-consent')).toHaveCount(0);
  expect(bodies.filter((body) => body.event === 'visit')).toHaveLength(1);
});

test('declining sends nothing and the phone prompt stays fully reachable', async ({ page }) => {
  const bodies: Array<Record<string, unknown>> = [];
  await page.unroute('**/api/events');
  await page.route('**/api/events', async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}') as Record<string, unknown>);
    await route.fulfill({ status: 204 });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app');

  const banner = page.getByTestId('analytics-consent');
  await expect(banner).toBeVisible();
  const box = await banner.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  expect(box!.y + box!.height).toBeLessThanOrEqual(844);
  await expect(banner.getByRole('button', { name: 'No thanks' })).toBeVisible();
  await expect(banner.getByRole('button', { name: 'Allow' })).toBeVisible();

  await banner.getByRole('button', { name: 'No thanks' }).click();
  expect(bodies).toEqual([]);
  expect(await analyticsStorage(page)).toEqual({ 'noacg.analytics.consent': 'declined-v1' });

  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await page.getByTestId('home-settings').click();
  await page.getByTestId('settings-nav-privacy').click();
  const contentBox = await page.locator('.settings-content').boundingBox();
  expect(contentBox).not.toBeNull();
  expect(contentBox!.width).toBeGreaterThanOrEqual(350);
  await expect(page.locator("[data-section='privacy'] .dlg-caption")).toBeVisible();
  await expect(page.getByTestId('analytics-toggle')).not.toBeChecked();
});

test('Global Privacy Control overrides the prompt and any collection', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, value: true });
  });
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/events')) requests.push(request.url());
  });
  await page.goto('/app');
  await expect(page.getByTestId('analytics-consent')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await analyticsStorage(page)).toEqual({});
});
