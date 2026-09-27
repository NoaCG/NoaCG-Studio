// covers: src/templates/importedDesign/designTypes.ts, src/components/wizard/import/**
// covers: src/assets/**
//
// The Import Graphic flow's Prepare and Text steps are driven from the wizard; mapped from
// nowhere until 2026-08, these specs ran only at night and auto-placement broke one unseen.
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type Page, type Route } from '@playwright/test';
import { lowerThirdPng } from './_png';

// The Import Graphic AI assistant (docs/AI_PLATFORM_PLAN.md §6) - stub-backed, offline:
// the task endpoints are mocked at the network level, the proposal panel runs its REAL
// normalize + apply pipeline into draft.designFields. Proposal-only doctrine: the manual
// flow must be identical with the flag off, and the panel must not exist at all then
// (the mutation guard - a button rendered without the server flag fails this file).

const STATUS = {
  task: 'imported-graphic-analysis',
  enabled: true,
  available: true,
  requiresSignIn: false,
  limits: { maxImages: 1, maxWidth: 1920, maxHeight: 1080, instructionChars: 500 },
  allowance: { dailySuccessesRemaining: 10, monthlySuccessesRemaining: 100 },
};

const ANALYSIS = {
  analysisId: '22222222-2222-4222-8222-222222222222',
  analysis: {
    version: 1,
    graphicType: 'lower-third',
    graphicTypeConfidence: 0.92,
    canvas: { aspect: 1.7778 },
    regions: [
      {
        kind: 'text',
        bbox: { x: 0.06, y: 0.78, w: 0.3, h: 0.06 },
        confidence: 0.9,
        role: 'person-name',
        suggestedTitle: 'Name',
        sampleText: 'Alexandra Riva',
        align: 'left',
        typography: {
          classification: 'sans',
          matchQuality: 'similar-available',
          suggestedFontId: 'archivo',
          approxWeight: 700,
          fontSizeNorm: 0.04,
          color: '#ffffff',
        },
      },
      {
        // Hesitant suggestion: arrives UNCHECKED (confidence below the pre-check bar).
        kind: 'text',
        bbox: { x: 0.06, y: 0.86, w: 0.24, h: 0.04 },
        confidence: 0.45,
        role: 'person-role',
        suggestedTitle: 'Role',
        sampleText: 'Correspondent',
      },
      // Noted but never proposed as a field.
      { kind: 'logo', bbox: { x: 0.85, y: 0.8, w: 0.1, h: 0.12 }, confidence: 0.8 },
      // Below the confidence floor: dropped by the normalizer.
      { kind: 'text', bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.03 }, confidence: 0.1 },
    ],
    animation: { presetId: 'design-slide', direction: 'both', speed: 1 },
    warnings: ['The small print may be a sponsor lockup - unverified.'],
  },
  usage: { inputTokens: 1400, outputTokens: 260, totalTokens: 1660 },
  expiresAt: '2099-01-01T00:00:00.000Z',
};

async function openTextStep(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'lower-third.png',
    mimeType: 'image/png',
    buffer: lowerThirdPng(1920, 1080),
  });
  await expect(page.locator('.asset-card')).toContainText('1920 × 1080');
  await page.getByRole('button', { name: 'Next →' }).click(); // Design -> Prepare
  await page.getByRole('button', { name: 'Next →' }).click(); // Prepare -> Text
  await expect(page.getByTestId('place-stage')).toBeVisible();
}

test('analysis proposes fields; the user reviews, applies, and the outcome is recorded', async ({ page }) => {
  test.setTimeout(60_000);
  const outcomes: Array<Record<string, unknown>> = [];
  await page.route('/api/ai/tasks/import-analysis-status', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STATUS) }));
  await page.route('/api/ai/tasks/import-analysis', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANALYSIS) }));
  await page.route('/api/ai/tasks/import-analysis-outcome', async (route: Route) => {
    outcomes.push(route.request().postDataJSON() as Record<string, unknown>);
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{"recorded":true}' });
  });

  await openTextStep(page);
  // What the step placed for itself before any AI ran. The Text step measures the artwork's
  // empty panel and seeds fields from it (assets/suggestFields.ts), so an accepted proposal
  // ADDS to that rather than arriving on an empty canvas - and this test is about the
  // proposal, so it counts the delta instead of pinning a total that belongs to the free
  // measurement.
  const placedBefore = await page.locator('.place-field').count();
  await page.getByTestId('import-analyze').click();

  // The vision upload leaves the machine, so the disclosure notice gates the first run.
  await expect(page.getByTestId('ai-consent')).toBeVisible();
  await page.getByTestId('ai-consent-accept').click();

  // Two text proposals (the logo and the below-floor region never become fields); the
  // confident one arrives checked, the hesitant one asks for the user's eye.
  const rows = page.getByTestId('import-analysis-field');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText('Alexandra Riva');
  await expect(rows.nth(0).locator('input')).toBeChecked();
  await expect(rows.nth(1)).toContainText('Correspondent');
  await expect(rows.nth(1).locator('input')).not.toBeChecked();
  await expect(page.getByTestId('import-analysis-animation')).toBeVisible();
  await expect(page.getByText('sponsor lockup')).toBeVisible();

  await page.getByTestId('import-analysis-apply').click();

  // The accepted suggestion is now an ordinary draft field on the placement canvas -
  // the same DesignFieldSpec the manual tools write.
  await expect(page.locator('.place-field')).toHaveCount(placedBefore + 1);
  await expect(page.locator('.place-field').last()).toContainText('Alexandra Riva');
  await expect.poll(() => outcomes.length).toBe(1);
  expect(outcomes[0]).toMatchObject({
    analysisId: ANALYSIS.analysisId,
    action: 'accepted',
    acceptedRegions: 2, // one field + the animation suggestion
  });
});

test('with the server task off, the assistant does not exist and the manual flow is untouched', async ({ page }) => {
  await page.route('/api/ai/tasks/import-analysis-status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ...STATUS, enabled: false, available: false, reason: 'disabled' }),
    }));
  let analysisCalls = 0;
  await page.route('/api/ai/tasks/import-analysis', async (route) => {
    analysisCalls += 1;
    await route.abort();
  });

  await openTextStep(page);
  // The mutation guard: no button, no panel, no consent dialog, no request - the manual
  // placement tools stand alone exactly as before the feature existed.
  await expect(page.getByTestId('import-analyze')).toHaveCount(0);
  await expect(page.getByTestId('import-analysis-panel')).toHaveCount(0);
  await expect(page.getByTestId('ai-consent')).toHaveCount(0);
  await expect(page.getByTestId('tool-text')).toBeVisible();
  expect(analysisCalls).toBe(0);
});

test('an offline build (status endpoint missing) shows no analysis UI at all', async ({ page }) => {
  // No routes mocked: the dev server answers 404 for /api in the offline suite.
  await openTextStep(page);
  await expect(page.getByTestId('import-analyze')).toHaveCount(0);
  await expect(page.getByTestId('import-analysis-panel')).toHaveCount(0);
});
