// covers: src/backend/events.ts, api/{events.ts,_lib/funnelEvents*}
// covers: src/components/{AnalyticsConsentBanner,SettingsDialog}.tsx
// covers: supabase/migrations/0037_funnel_opt_in_retention.sql
// focus

import { expect, test } from '@playwright/test';

test('offline builds have no analytics prompt, storage, or Settings surface', async ({ page }) => {
  const eventRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/events')) eventRequests.push(request.url());
  });

  await page.goto('/app');
  await expect(page.getByTestId('analytics-consent')).toHaveCount(0);
  expect(eventRequests).toEqual([]);
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) =>
    key.startsWith('noacg.funnel') || key.startsWith('noacg.analytics'),
  ))).toEqual([]);

  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings-nav-privacy')).toHaveCount(0);
  await expect(page.getByTestId('analytics-toggle')).toHaveCount(0);
});
