// covers: src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}, src/assets/**
//
// The mark PROBE is read by the Lite legibility gate and by Pro's mark-field trigger, and the
// trigger rests entirely on `inkSpread` separating one ink from several.
// covers: src/assets/assetInfo.ts

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';

// The Assets panel, mounted by the new editor's Project panel and opened by its image tool: the
// derived info section. (Its imports, removals, folder moves and placements are editor-images's
// and editor-folders-bins's; the old dock's tab strip, mobile strip and layout migration went
// with the old editor.)

// A valid 1×1 fully opaque black RGBA PNG - these tests exercise assets, not decode recovery.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
  'base64',
);

/** Hairline in the new editor, with the Assets panel open through the image tool. */
async function openAssetsPanel(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openWorkingGraphicInEditor(page);
  await page.getByRole('button', { name: 'image tool' }).click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
}

test('the info section derives name, format, dimensions, size, alpha, and usage', async ({ page }) => {
  await openAssetsPanel(page);

  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  // Selecting the new row opens its info section, which fills in as the probe lands.
  await page.locator('[data-testid="asset-row"][data-path="images/team-logo.png"]').click();
  const info = page.getByTestId('asset-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('team-logo.png');
  await expect(info).toContainText('image/png');
  await expect(info).toContainText('1 × 1 px');
  await expect(info.locator('.asset-fact', { hasText: 'Transparency' })).toContainText(/yes|no/);
  await expect(info).toContainText('not referenced');
});
