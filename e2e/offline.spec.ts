// covers: src/components/editorFoundation/**, src/components/wizard/**, !src/components/wizard/import/**
// focus

import { test, expect } from '@playwright/test';
import { finishIntoNewEditor } from './_create';
import { pickDesign } from './_browse';
import { editorPreview } from './_frame';

test('the editor loads and edits a graphic with all third-party hosts blocked', async ({ page }) => {
  const attempted: string[] = [];
  await page.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, route => {
    attempted.push(route.request().url());
    return route.abort();
  });
  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  await finishIntoNewEditor(page);
  const canvas = page.getByTestId('foundation-canvas');
  await expect(canvas).toHaveAttribute('data-pending', 'false');
  const source = () => page.evaluate(async () =>
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  const before = await source();
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  const x = stage.x + stage.width * .5, y = stage.y + stage.height * .5;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 45, { steps: 6 });
  await page.mouse.up();
  await expect(editorPreview(page).locator('#rectangle-1')).toBeVisible();
  await expect.poll(async () => (await source()).html).toContain('rectangle-1');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(source).toEqual(before);
  expect(attempted).toEqual([]);
});
