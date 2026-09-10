import { test, expect, type Page } from '@playwright/test';
import { SUPABASE_URL, haveCreds, settleSync, signIn } from './_helpers';
import { startNewProject } from '../_create';

// The wizard door to hosted profile `pro` closed on 2026-09-10. The decision receipt is
// docs/backlog/one-noacg-ai-harness-not-lite-and-pro.md. Tests that drove the removed radio
// were deleted; the configured deployment's server gate remains covered independently here.
//
// WHAT WENT WITH THEM, so the comparison row that reopens the door knows to restore it: the two
// deleted walks were the ONLY end-to-end checks that one reservation pays for a whole generation
// (exactly one reserve, one design call charged to it, one outcome) and that one call makes the
// whole package. They cannot be re-routed by seeding `spx-gfx-ai` either - a stored `pro` now
// migrates to the hosted path on read (src/ai/settings.ts) - so restoring that coverage needs a
// door, not a fixture. Until then the Pro pipeline is code with no end-to-end gate.

/** Open the settings sheet whatever state its automatic setup effect has left it in. */
async function openAiSettings(page: Page): Promise<void> {
  const button = page.getByRole('button', { name: /AI settings/ });
  const sheet = page.getByTestId('ai-settings');
  await expect(button).toBeVisible();
  await expect(async () => {
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/** Sign in, let account sync settle, and open the Create-with-AI step. */
async function openAiStep(page: Page): Promise<void> {
  await signIn(page);
  await settleSync(page);
  const wizard = page.getByTestId('creation-wizard');
  if (!(await wizard.isVisible())) await startNewProject(page);
  await expect(wizard).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible()) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
    await expect(consent).toHaveCount(0);
  }
  await expect(page.getByRole('button', { name: /AI settings/ })).toBeVisible();
}

test.describe('hosted profile pro (configured)', () => {
  test.skip(!SUPABASE_URL, 'set VITE_SUPABASE_URL to run the configured-mode suite');
  test.skip(!haveCreds, 'set E2E_EMAIL / E2E_PASSWORD to run the configured-mode suite');

  test('the pro-status route is REACHED and answers the wire contract', async ({ request }) => {
    // Availability is deliberately not asserted: it depends on deployment configuration,
    // entitlement and allowance. This test proves the independent server gate still exists.
    const response = await request.get('/api/ai/pro-status');
    expect(response.status()).toBe(200);
    const body = await response.json() as Record<string, unknown>;
    expect(body.profile).toBe('pro');
    expect(typeof body.enabled).toBe('boolean');
    expect(typeof body.available).toBe('boolean');
    expect(typeof body.requiresSignIn).toBe('boolean');
    expect(typeof body.maxGenerationCostUsd).toBe('number');
  });

  test('a configured backend does not reopen the closed wizard door', async ({ page }) => {
    test.setTimeout(120_000);
    await page.route('**/api/ai/pro-status', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        profile: 'pro',
        enabled: true,
        available: true,
        requiresSignIn: false,
        maxGenerationCostUsd: 0.15,
      }),
    }));
    await openAiStep(page);
    await openAiSettings(page);
    const sheet = page.getByTestId('ai-settings');
    // Not "the ai-tier testid is gone" - that testid is gone from the tree, so asserting its
    // absence would pass however the door behaved. What is asserted is what a REOPENED door
    // would put on screen: any chooser at all, the Pro panel, or the tier's name.
    await expect(sheet.getByRole('radiogroup')).toHaveCount(0);
    await expect(sheet.getByRole('radio')).toHaveCount(0);
    await expect(sheet).not.toContainText('NoaCG Pro');
    await expect(sheet.getByTestId('ai-pro-settings')).toHaveCount(0);
    await expect(page.getByTestId('pro-package')).toHaveCount(0);
    // And the hosted route on offer is the single unnamed one.
    await expect(sheet.getByTestId('ai-hosted-note')).toBeVisible();
  });
});
