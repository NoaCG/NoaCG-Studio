// runs on: dev server - opens the /e2e/fixtures page that imports the component by its /src URL
// covers: src/components/canvas/CanvasGuides.tsx, e2e/fixtures/canvas-guides.html

import { expect, test } from '@playwright/test';

test('canvas guides keep a valid outline during subpixel layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  await page.goto('/e2e/fixtures/canvas-guides.html');
  const tinyOutline = page.locator('#tiny').getByTestId('canvas-bounds');
  await expect(tinyOutline).toHaveCount(1);
  expect(errors).toEqual([]);
  await expect(tinyOutline).toHaveAttribute('width', '0');
  await expect(tinyOutline).toHaveAttribute('height', '0');

  const guides = page.locator('#normal .canvas-guides');
  const outline = guides.getByTestId('canvas-bounds');
  await expect(outline).toHaveAttribute('x', '40.5');
  await expect(outline).toHaveAttribute('y', '30.5');
  await expect(outline).toHaveAttribute('width', '399');
  await expect(outline).toHaveAttribute('height', '199');
  await expect(guides.locator('path')).toHaveAttribute('fill-rule', 'evenodd');
  await expect(guides.locator('g rect')).toHaveCount(2);
  await expect(guides.locator('g rect').nth(0)).toHaveAttribute('width', '372');
  await expect(guides.locator('g rect').nth(1)).toHaveAttribute('width', '360');
  await expect(guides.locator('line')).toHaveCount(6);
});
