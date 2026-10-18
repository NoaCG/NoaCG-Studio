// covers: src/components/editorFoundation/**

import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';
import { editorPreview } from './_frame';

// A command can fail after a healthy load. Startup-error coverage cannot prove that the
// command catch replies to the current request or that the stage reports the failure.
test('a preview command that throws is worn on the stage and Reload preview recovers', async ({ page }) => {
  await bootstrapGraphic(page, 'Hairline');
  await openWorkingGraphicInEditor(page);
  const canvas = page.getByTestId('foundation-canvas');
  await expect(canvas).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  const generation = await canvas.getAttribute('data-generation');

  // Fault injection after readiness: Edit Out must rebuild a segment, so its real command
  // encounters this broken interpreter. No load or application error is injected.
  await editorPreview(page).locator('body').evaluate(() => {
    const w = window as unknown as { buildStepTimeline?: (...args: unknown[]) => unknown };
    if (typeof w.buildStepTimeline !== 'function') throw new Error('Missing interpreter fixture');
    w.buildStepTimeline = () => { throw new Error('command rebuild is broken'); };
  });
  await page.getByRole('button', { name: 'Edit Out', exact: true }).click();
  const error = page.locator('.ef-stage-error');
  await expect(error).toContainText('command rebuild is broken');
  await expect(canvas).toHaveAttribute('data-generation', generation!);

  // The current editor's recovery door rebuilds from unchanged source, discarding the fault.
  await page.getByRole('button', { name: 'Reload preview', exact: true }).click();
  await expect(error).toHaveCount(0);
  await expect.poll(() => canvas.getAttribute('data-generation')).not.toBe(generation);
  await expect(canvas).toHaveAttribute('data-pending', 'false');
  const request = await canvas.getAttribute('data-request');
  await page.getByRole('button', { name: 'Go to beginning', exact: true }).click();
  await expect.poll(() => canvas.getAttribute('data-request')).not.toBe(request);
  await expect(error).toHaveCount(0);
});
