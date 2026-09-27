// covers: src/export/**, src/components/{ExportSurface.tsx,PlayoutCompatibility.tsx}
// covers: src/backend/**
// focus

import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { showCode } from './_code';
import { chooseType, pickDesign } from './_browse';

// Era 1: self-hosted Monaco — the editor must work with every CDN unreachable.

test('the editor loads and works with all CDNs blocked', async ({ page }) => {
  const cdnHits: string[] = [];
  // Kill anything that isn't the dev server — a CDN dependency would surface as a hang.
  await page.route(/^https?:\/\/(?!127\.0\.0\.1(?::|\/))/, (route) => {
    cdnHits.push(route.request().url());
    return route.abort();
  });

  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
  });

  // Monaco rendered from the bundle and is interactive — opened from the topbar, since the
  // pane ships closed, and the point here is that its chunk comes from the bundle, not a CDN.
  await showCode(page);
  await expect(page.locator('.editor-host .monaco-editor')).toBeVisible();
  await expect(page.locator('.editor-host .view-line').first()).toContainText('DOCTYPE');
  await page.locator('.editor-host .monaco-editor').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('<!-- offline edit -->');
  const html = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.html;
  });
  expect(html).toContain('<!-- offline edit -->');

  // Nothing even TRIED to reach a CDN for the editor.
  expect(cdnHits.filter((u) => /jsdelivr|unpkg|cdnjs/.test(u))).toEqual([]);
});
