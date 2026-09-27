// covers: none - its route lives in src/app/router.ts, which is CORE: a change there runs the full
// suite, or the focus set this spec is in
//
// focus

import { test, expect } from '@playwright/test';

// The prerendered template pages' CTA (scripts/prerender.mjs, docs/PRERENDER.md):
// `/app#/new/<variantId>` must open the EXISTING wizard with that catalog design already
// selected — dropped straight on Fields, never creating a project on its own — so a visitor
// from a `/templates/<slug>` page picks up exactly where the page left off instead of
// re-finding the design in Browse. An id that fails to resolve must degrade to the ordinary
// Entry-step open rather than a broken or stuck wizard.

test('deep link: a valid variant id opens the wizard preselected on Fields', async ({ page }) => {
  await page.goto('/app#/new/lt01');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Landed past Entry/Browse — Fields is the design's own name, proving the preselect (and not
  // just "some design got picked").
  await expect(page.locator('.wz-dot.active')).toHaveText(/Fields/);
  await expect(page.locator('h3', { hasText: 'Hairline' })).toBeVisible();

  // No project exists yet: the wizard is still the only thing on screen, and nothing was
  // written to the library — only Finish's doors create anything.
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  const savedCount = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().length;
  });
  expect(savedCount).toBe(0);

  // The rest of the wizard still works normally from here: Style → Animation → Finish reads
  // back the same design.
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await page.getByRole('button', { name: 'Next →' }).click(); // Animation
  await page.getByRole('button', { name: 'Next →' }).click(); // Finish
  await expect(page.locator('.wz-finish-summary')).toContainText('Hairline');

  // A direct reload of the same URL reaches the identical state (survives refresh).
  await page.reload();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(page.locator('.wz-dot.active')).toHaveText(/Fields/);
  await expect(page.locator('h3', { hasText: 'Hairline' })).toBeVisible();
});

test('deep link: an unknown variant id falls back to the ordinary Entry step', async ({ page }) => {
  await page.goto('/app#/new/not-a-real-variant-id');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();

  // Graceful degradation, not a stuck or broken wizard: the same Entry step a bare #/new opens.
  // Entry is a menu before a creation path exists, so the invalid deep link must not invent
  // step navigation while it falls back.
  await expect(page.locator('.wz-rail')).toHaveCount(0);
  await expect(page.locator('[data-entry="template"]')).toBeVisible();

  const savedCount = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().length;
  });
  expect(savedCount).toBe(0);
});
