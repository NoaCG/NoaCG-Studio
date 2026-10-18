// covers: src/blocks/**
// covers: src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}, src/assets/**

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';

// The Assets panel's usage marks: a row says whether the graphic actually uses its file, and a
// second placement of the same file is a new element rather than a duplicate asset. (The old
// canvas chip's "appears …" and the old Inspector's Appears/Disappears rows went with that
// editor; the new editor's placements and step edits are editor-images's and editor-steps's.)

// A valid 1×1 fully opaque black RGBA PNG - the image path needs real decodable bytes.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
  'base64',
);

async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
}

const source = (page: Page) =>
  page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { html: t.html, fields: t.fields.length, assets: t.assets.length };
  });

test('the Assets panel marks which assets the graphic actually uses, per row', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  await page.getByRole('button', { name: 'image tool' }).click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
  await page.getByTestId('assets-import-input').setInputFiles({ name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG });
  const row = page.locator('[data-testid="asset-row"][data-path="images/team-logo.png"]');
  await expect(row).toBeVisible();
  // Imported but not placed: no usage mark.
  await expect(row.getByTestId('asset-used')).toHaveCount(0);

  const before = await source(page);
  await row.click();
  await page.getByRole('button', { name: 'Place image', exact: true }).click();
  await ready(page);
  // Placing it marks the row.
  await expect(row.getByTestId('asset-used')).toBeVisible();
  const placed = await source(page);
  expect(placed.html).not.toBe(before.html);
  expect(placed.fields).toBe(before.fields + 1);

  // A second placement from the same file is a NEW element, not a duplicate asset.
  await row.click();
  await page.getByRole('button', { name: 'Place image', exact: true }).click();
  await ready(page);
  const twice = await source(page);
  expect(twice.fields).toBe(placed.fields + 1);
  expect(twice.assets).toBe(placed.assets);
  await expect(page.getByTestId('asset-row')).toHaveCount(1);
});
