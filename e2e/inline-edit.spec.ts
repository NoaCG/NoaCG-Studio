// covers: src/components/canvas/**

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { elementPoint } from './_canvas';

// Era 6 — inline text editing (docs/WYSIWYG_PLAN.md W3): double-click a text line in the
// preview, type, Enter. The edit updates the LIVE value (preview + Data panel) AND the
// field's default in the SPX definition — one undoable template patch. Undo reverts the
// CODE (definition + static text); the live sample value is operator state and stays.

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
}

/** Screen position of the center of a preview element (pad-agnostic — see e2e/_canvas.ts). */
async function screenPointOf(page: Page, selector: string): Promise<{ x: number; y: number }> {
  const p = await elementPoint(page, selector);
  return { x: p.x, y: p.y };
}

/** The field's DEFAULT in the SPX definition, read from the live preview document. */
async function definitionDefault(page: Page, field: string): Promise<string> {
  return page.frameLocator('iframe.preview-frame').locator('body').evaluate((_el, f) => {
    const def = (window as unknown as { SPXGCTemplateDefinition?: { DataFields: { field: string; value?: string }[] } })
      .SPXGCTemplateDefinition;
    return def?.DataFields.find((d) => d.field === f)?.value ?? '';
  }, field);
}

test('double-click edits text in place: live value + definition default, undoable', async ({ page }) => {
  await createHairline(page);
  // The settled design view makes the name visible and double-clickable.
  await expect
    .poll(async () => page.frameLocator('iframe.preview-frame').locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  const p = await screenPointOf(page, '#f0');
  await page.mouse.dblclick(p.x, p.y);
  const editor = page.getByTestId('inline-editor');
  await expect(editor).toBeVisible();
  await expect(editor).toHaveValue('Alexandra Riva');

  await editor.fill('Inline Name');
  await editor.press('Enter');

  // Live everywhere: the preview text, the Data panel value, and the definition default.
  await awaitPreviewRebuild(page);
  await expect(page.frameLocator('iframe.preview-frame').locator('#f0')).toHaveText('Inline Name');
  await page.getByTestId('dock-tab-data').click();
  await expect(page.locator('.panel-body input').first()).toHaveValue('Inline Name');
  expect(await definitionDefault(page, 'f0')).toBe('Inline Name');

  // Undo reverts the template patch (the definition default returns to the wizard text).
  await page.keyboard.press('Control+z');
  await awaitPreviewRebuild(page);
  expect(await definitionDefault(page, 'f0')).toBe('Alexandra Riva');
});

test('Escape cancels an inline edit without changes', async ({ page }) => {
  await createHairline(page);
  await expect
    .poll(async () => page.frameLocator('iframe.preview-frame').locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  const p = await screenPointOf(page, '#f0');
  await page.mouse.dblclick(p.x, p.y);
  const editor = page.getByTestId('inline-editor');
  await expect(editor).toBeVisible();
  await editor.fill('Discarded');
  await editor.press('Escape');
  await expect(editor).toHaveCount(0);

  await page.waitForTimeout(650); // KEEP as a sleep: this asserts nothing changes, so no rebuild ever comes
  expect(await definitionDefault(page, 'f0')).toBe('Alexandra Riva');
  await expect(page.frameLocator('iframe.preview-frame').locator('#f0')).toHaveText('Alexandra Riva');
});
