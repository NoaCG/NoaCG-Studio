import { expect, type Page } from '@playwright/test';

/** Existing playback walks choose an explicit destination when first Publish asks.
 * The account default/remembering flow has its own network-owned acceptance spec. */
export async function publishProduction(page: Page, profile: 'browser' | 'casparcg' = 'browser'): Promise<void> {
  await page.getByTestId('production-publish').click();
  const chooser = page.getByTestId('output-profile');
  const started = page.locator('[data-testid="production-status"][data-started="true"]');
  const failed = page.getByTestId('production-note').filter({ hasText: /Publish failed|Publishing needs/ });
  await expect(chooser.or(started).or(failed)).toBeVisible({ timeout: 30_000 });
  expect(await failed.count(), 'publication failed before output setup settled').toBe(0);
  if (await chooser.isVisible()) {
    await chooser.selectOption(profile);
    await page.getByTestId('confirm-output').click();
  }
  await expect(started).toBeVisible({ timeout: 30_000 });
}
