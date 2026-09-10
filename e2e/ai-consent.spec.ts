import { expect, test, type Route } from '@playwright/test';
import { createProject } from './_create';

// Create with AI is disclosed through the public Terms and Privacy pages linked during
// account creation. Its first generation is deliberately direct: no interruptive notice and
// no legacy acceptance record. The OFFLINE STUB also remains notice-free.

const LITE_STATUS = {
  profile: 'lite',
  enabled: true,
  available: true,
  requiresSignIn: false,
  supportedCategories: ['lower-third'],
  limits: {
    promptCharacters: 2000,
    conversationTurns: 6,
    conversationCharacters: 6000,
    fields: 2,
    logos: 0,
    logoBytes: 2_000_000,
  },
  allowance: {
    dailyStartsRemaining: 6,
    monthlyStartsRemaining: 30,
    dailySuccessesRemaining: 3,
    monthlySuccessesRemaining: 20,
  },
};

test('Create with AI sends the first remote generation without an interruptive notice', async ({ page }) => {
  test.setTimeout(60_000);
  let generationCalls = 0;
  await page.route('/api/ai/lite/status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(LITE_STATUS),
  }));
  await page.route('/api/ai/lite/generations', async (route: Route) => {
    generationCalls += 1;
    await route.abort();
  });

  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="ai"]').click();
  await expect(page.getByRole('heading', { name: /Create with AI/ })).toBeVisible();
  await page.locator('.wz-step textarea').fill('A clean news lower third for a reporter.');
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  // The aborted route proves the request left immediately. No consent UI or local acceptance
  // record may be recreated as a replacement warning surface.
  await expect.poll(() => generationCalls).toBeGreaterThan(0);
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('spx-gfx-ai-notice'))).toBeNull();
});

test('the offline stub generates without ever showing the notice', async ({ page }) => {
  // No spx-gfx-ai seed and no backend: the AI panel runs the deterministic stub, and the
  // disclosure dialog must NOT appear - nothing leaves the machine.
  await createProject(page);
  await page.getByTestId('dock-tab-ai').click();
  await expect(page.getByText(/offline stub/)).toBeVisible();
  const panel = page.locator('.panel-body', { has: page.getByRole('heading', { name: 'AI assistant' }) });
  await panel.locator('textarea').fill('make a fullscreen title');
  await panel.getByRole('button', { name: 'Generate', exact: true }).click();

  // The stub proposes a change with no consent dialog anywhere in the flow.
  await expect(panel.getByText('Proposed change')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
});
