import { expect, type Page } from '@playwright/test';

/**
 * Publish the open production from its header (docs/work-specs/playout-workflow-simplification
 * AC-5). There is no output chooser: a `casparcg` walk switches CasparCG on in the Playout panel
 * first, which is what makes Publish load the renderer onto its slot.
 */
export async function publishProduction(page: Page, profile: 'browser' | 'casparcg' = 'browser'): Promise<void> {
  if (profile === 'casparcg') await setCasparSwitch(page, true);
  await page.getByTestId('production-publish').click();
  const started = page.locator('[data-testid="production-status"][data-started="true"]');
  const failed = page.getByTestId('production-note').filter({ hasText: /Publish failed|Publishing needs/ });
  await expect(started.or(failed)).toBeVisible({ timeout: 30_000 });
  expect(await failed.count(), 'publication failed').toBe(0);
}

/** Set the production's CasparCG switch in the Playout panel, opening and closing the panel. */
export async function setCasparSwitch(page: Page, on: boolean): Promise<void> {
  const panel = page.getByTestId('production-status-panel');
  const wasOpen = await panel.isVisible();
  if (!wasOpen) await page.getByTestId('production-status').click();
  const toggle = panel.getByTestId('caspar-switch');
  if ((await toggle.isChecked()) !== on) await toggle.click();
  await expect(toggle).toBeChecked({ checked: on });
  if (wasOpen) return;
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
}
