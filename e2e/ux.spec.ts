// covers: src/blocks/**, src/templates/**
// covers: src/components/{fields/**,HostedControlPage.tsx}
// covers: src/components/wizard/**, !src/components/wizard/import/**
// covers: src/components/ExportWindow.tsx
//
// The motion picker mounts in the wizard's Travel box. On 2026-08-23 it grew a direction-arrow
// row sharing that box's class, this spec broke on the ambiguous locator, and it had not been
// planned: the picker matches no directory rule, so the surfaces that mount it name it.
// covers: src/components/MotionPresetPicker.tsx

import { bootstrapGraphic, finishIntoNewEditor, openExportWindow } from './_create';
import { test, expect } from '@playwright/test';
import { mountWorkingDocument } from './_frame';
import { chooseType, pickDesign } from './_browse';

// The UX overhaul's surviving subjects: validation inside Export, and the wizard's motion phase
// control. (The old shell's dock geometry, its Data-panel add row and the code pane's change
// highlight went with that shell; the catalog-line shape gate runs in Node,
// scripts/catalog-line-gate.test.mjs.)

test('export: validation shows inline and gates the download on a broken template', async ({ page }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openExportWindow(page);
  const window = page.getByTestId('export-window');
  await expect(window.locator('.status-ok')).toContainText('valid and ready');
  // Break the runtime: blank the JS, then open the window on the broken graphic (the window
  // reads the working graphic when it opens).
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.applyTemplate({ ...s.template, js: '// gone' });
  });
  await openExportWindow(page);
  await expect(window.locator('.status-bad')).toContainText('must be fixed before export');
  await expect(window.getByRole('button', { name: /Validate & download/ })).toBeDisabled();
});

test('wizard: direction control mixes a different exit preset at create', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await page.getByRole('button', { name: 'Next →' }).click(); // Animation
  // Default direction: one matched style for the entrance AND the exit.
  await expect(page.locator('.wz-step button.active', { hasText: 'In and out' })).toBeVisible();
  // Switch only the exit; the direction hint reflects the mix. The slide family is one
  // card with a direction-of-travel picker — ↓ picks the slide-down exit. Scoped to the
  // TRAVEL box: the universal bank's Slide family draws its own arrows in the same
  // vocabulary (and the same class) further down the step, so a bare `.wz-anim-dirs`
  // matches two ↓ buttons that pick two different things.
  await page.getByRole('button', { name: 'Out only' }).click();
  await page.locator('.wz-anim-travel .wz-anim-dirs button', { hasText: '↓' }).click();
  await expect(page.locator('.wz-step .hint').first()).toContainText('Out Slide down');
  await finishIntoNewEditor(page);
  // Lower thirds create as data blocks: the mix is real keyframe data — the entrance
  // keeps Line reveal's choreography (the accent draws in) while the Out step carries
  // Slide down's exit (the box lifts away: y + opacity keyframes).
  const data = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
  expect(data).not.toBeNull();
  expect(Object.keys(data!.steps[0].layers['.lower-third-accent'] ?? {})).toContain('scaleX');
  const outBox = data!.steps[data!.steps.length - 1].layers['.lower-third-box'] ?? {};
  expect(Object.keys(outBox)).toEqual(expect.arrayContaining(['y', 'opacity']));
  // …and the mixed runtime plays: the created graphic, mounted the way playout composes it.
  const doc = await mountWorkingDocument(page);
  await doc.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect
    .poll(async () => doc.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});
