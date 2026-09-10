import { test, expect, type Page } from '@playwright/test';

// NoaCG Pro - the pipeline as an execution TIER of the ONE Create-with-AI step
// (docs/NOACG_PRO_PLAN.md §7): no separate wizard card, the tier is chosen under
// ⚙ AI settings, and the brief/fields/uploads workflow is the shared one.
//
// **THE TIER IS OFFERED ONLY WHERE IT CAN ACTUALLY RUN** (owner, 2026-08-14): the server says
// hosted Pro is available AND the deployment carries the backend that route is metered
// through. A NoaCG tier runs on NoaCG's own service or it is not offered - it never asks a
// customer for a key to reach our own models. The offline suite is by definition the second
// half of that condition being false, so these specs pin the ABSENCE of the door, including
// the case that matters most: a status endpoint answering "available" is NOT enough on its
// own, or the AND would be an OR that nothing noticed.
//
// That absence is also why nothing here walks the wizard into Pro. What is NOT covered
// offline, and is stated rather than quietly lost: the wizard walk through a hosted Pro
// generation and the allowance read-back, both of which need a backend-configured deployment
// (e2e/configured/pro-wizard.spec.ts).
//
// **THIS FILE IS THE DOOR, NOT THE PIPELINE.** It used to carry nine more tests driving the
// concept-and-reconstruct engine through its offline stub; that engine was retired by Phase A
// (docs/NOACG_PRO_PLAN.md §16) and deleted on 2026-08-15, and what a Pro graphic IS now is
// pinned by `e2e/pro-language.spec.ts` against the composer the product runs. Two specs, two
// questions: whether the tier is offered, and what it produces.

/** Answer /api/ai/pro-status as a deployment that offers hosted Pro. */
async function withHostedPro(page: Page, allowance = { daily: 3, monthly: 10 }) {
  await page.route('**/api/ai/pro-status', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      profile: 'pro',
      enabled: true,
      available: true,
      requiresSignIn: false,
      maxGenerationCostUsd: 0.15,
      allowance: {
        dailyStartsRemaining: allowance.daily,
        monthlyStartsRemaining: allowance.monthly,
        dailySuccessesRemaining: 2,
        monthlySuccessesRemaining: 8,
      },
    }),
  }));
}

async function openAiSettings(page: Page) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  // There is no separate Pro entry card - Create with AI is the one AI door.
  await expect(page.locator('[data-entry="pro"]')).toHaveCount(0);
  await page.locator('[data-entry="ai"]').click();
  const button = page.getByRole('button', { name: /AI settings/ });
  const sheet = page.getByTestId('ai-settings');
  await expect(async () => {
    if (!(await sheet.isVisible())) await button.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

test('pro: a status endpoint saying "available" is not enough on a build that cannot run it', async ({ page }) => {
  // The AND rule, from the side that is easy to get wrong: hosted Pro reserves and settles per
  // account, so a deployment with no backend cannot run it however the status answers. If this
  // ever passes as a visible tier, the two conditions have quietly become one.
  await withHostedPro(page);
  await openAiSettings(page);
  const sheet = page.getByTestId('ai-settings');
  await expect(sheet.getByTestId('ai-tier')).toHaveCount(0);
  await expect(sheet).not.toContainText('NoaCG Pro');
  await expect(sheet.getByTestId('ai-pro-settings')).toHaveCount(0);
});

test('pro: with no hosted route at all, the tier is absent and nothing asks for a key', async ({ page }) => {
  await openAiSettings(page);
  const sheet = page.getByTestId('ai-settings');
  await expect(sheet.getByTestId('ai-tier')).toHaveCount(0);
  await expect(sheet).not.toContainText('NoaCG Pro');
  // ABSENT, not greyed: a tier listed as unavailable still advertises itself. And the panel
  // that remains never asks for a key to reach NoaCG's own models - the only key surface here
  // belongs to the bring-your-own-key tier, for the user's own provider.
  await expect(sheet).not.toContainText(/gateway/i);
  await expect(sheet.getByTestId('ai-pro-settings')).toHaveCount(0);
});

