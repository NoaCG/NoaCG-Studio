import { test, expect, type Page } from '@playwright/test';
import { SUPABASE_URL, haveCreds, settleSync, signIn } from './_helpers';
import { startNewProject } from '../_create';

// The wizard door to hosted profile `pro` closed on 2026-09-10. The decision receipt is
// docs/backlog/one-noacg-ai-harness-not-lite-and-pro.md. Tests that drove the removed radio
// were deleted; the configured deployment's server gate remains covered independently here.

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
    await expect(sheet.getByTestId('ai-tier')).toHaveCount(0);
    await expect(sheet).not.toContainText('NoaCG Pro');
    await expect(sheet.getByTestId('ai-pro-settings')).toHaveCount(0);
  });
});
