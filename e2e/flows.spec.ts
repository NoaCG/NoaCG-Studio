import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { enableAdvancedMode, switchToAdvancedMode } from './_create';
import { pickDesign } from './_browse';

// Core UI flows for the choose-first creation wizard + live panels.

/** Walk the wizard entry → category → variant selection. These flows end in the EDITOR, so
 *  they run in Advanced mode (docs/GOALS_ARCHIVE.md "Student release" step 4). */
async function toVariantStep(page: Page, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, variantName);
}

/** Create into the editor from wherever the walk stands: Skip to finish (remaining steps
 *  keep their defaults - step 6's shortcut) then the Advanced editor door. */
async function createFromCurrentStep(page: Page) {
  // Wait out the rebuild here: the default document behind the wizard also binds #f0, so an
  // assertion (or Play) racing the debounced rebuild would run against the old document.
  await awaitPreviewRebuild(page, async () => {
    await page.getByTestId('wz-skip-to-finish').click();
    await page.getByTestId('wz-finish-editor').click();
    // 20 s: the modal only closes once applyGenerated's cold Prettier format resolves - the
    // same cold-module cost text-tools.spec.ts's createBareDesign documents in full.
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

function previewFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

test('wizard: create a lower third with defaults', async ({ page }) => {
  await toVariantStep(page, 'Hairline');
  // Live preview appears once a variant is chosen.
  await expect(page.locator('.wz-preview iframe')).toBeVisible();
  await createFromCurrentStep(page);

  await expect(page.locator('.topbar .tpl-name')).toHaveText('Hairline');
  // The generated template renders and binds its first field.
  const frame = previewFrame(page);
  await expect(frame.locator('#f0')).toHaveText('Alexandra Riva');
  // Play runs the entrance (root becomes visible).
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame.locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('wizard: field titles flow into the Data panel', async ({ page }) => {
  await toVariantStep(page, 'Underline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  const rows = page.locator('.wz-line-row');
  await rows.first().locator('input').first().fill('Guest name');
  await createFromCurrentStep(page);

  await page.getByTestId('dock-tab-data').click();
  await expect(page.locator('.panel-body')).toContainText('Guest name');
});

test('wizard: steps mode reveals lines on Next', async ({ page }) => {
  // Three suggested lines, and line MASKS - both are what this test needs, since it asserts
  // that line 2 waits behind its mask until Next reveals it. It used to name lt10 "Soft Stack",
  // retired in 12206f5c as a rendered duplicate; lt22 "Stack Three" carries the same shape
  // (maxLines 3, three suggested lines, lineMasks), so the walk is unchanged.
  await toVariantStep(page, 'Stack Three');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await page.getByRole('button', { name: 'Next →' }).click(); // Animation
  await page.locator('.wz-step input[type="checkbox"]').check();
  await createFromCurrentStep(page);

  const frame = previewFrame(page);
  await page.getByRole('button', { name: '▶ Play' }).click();
  // Line 2 waits behind its mask (translated down) until Next reveals it.
  const before = await frame.locator('#f1').evaluate((el) => getComputedStyle(el).transform);
  await page.getByRole('button', { name: '» Next' }).click();
  await expect
    .poll(async () => frame.locator('#f1').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
});

test('reset: the topbar button restores the original state, undoably', async ({ page }) => {
  await toVariantStep(page, 'Hairline');
  await createFromCurrentStep(page);

  // Creating the project captured the pristine baseline. Observe through the live preview:
  // the accent's original tint. Tolerate the transient "context destroyed" while the preview
  // iframe rebuilds (reset/undo swap the whole document) — poll simply retries.
  const accent = () =>
    previewFrame(page)
      .locator('.lower-third-accent')
      .evaluate((el) => getComputedStyle(el).backgroundColor)
      .catch(() => '');
  await expect.poll(accent).not.toBe('');
  const original = await accent();

  // Edit the accent via the Style panel — the preview retints.
  await page.getByTestId('dock-tab-style').click();
  await page.getByTestId('style-var-accent').locator('input.grow').fill('#ff2d78');
  await expect.poll(accent).toBe('rgb(255, 45, 120)');

  // Reset is a two-step inline confirm (arm, then confirm) — no blocking dialog.
  const reset = page.getByTestId('reset-project');
  await reset.click();
  await expect(reset).toHaveText(/Confirm reset/);
  await reset.click();
  await expect(reset).toHaveText('↺ Reset'); // disarmed

  // The preview returns to the original accent — the graphic is restored.
  await expect.poll(accent).toBe(original);

  // The reset is one undoable apply — undo brings the edit back.
  await page.keyboard.press('Control+z');
  await expect.poll(accent).toBe('rgb(255, 45, 120)');
});

test('import graphics: image lands in the logo slot', async ({ page }) => {
  await page.goto('/app');
  // Images enter through "Create with AI"; the catalog continuation designs around them.
  await page.locator('[data-entry="ai"]').click();
  // A valid 1×1 fully opaque black RGBA PNG.
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'team-logo.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  // A dropped picture is now a CARD carrying what it is for (src/model/imagePurpose.ts). This
  // 1×1 PNG is OPAQUE and tiny, so size - not transparency - is what makes it a mark; that is
  // the catalog escape's input below, which only ever takes as-is assets.
  await expect(page.getByTestId('ai-upload')).toHaveCount(1);
  await expect(page.getByTestId('ai-upload')).toHaveAttribute('data-purpose', 'asset');
  await page.getByRole('button', { name: /Design around these with a catalog template/ }).click();
  await expect(page.locator('.asset-card')).toHaveCount(1);
  await page.getByRole('button', { name: /Continue with 1 image/ }).click();

  // Logo-slot designs come first. WHICH one leads is the catalog's business (the sort is
  // stable, so it is simply the first logo-capable lower third in browse order) — this spec
  // guards the ORDERING RULE, so it asks the catalog rather than naming a design and going
  // red every time the pack grows one.
  const firstWithLogo = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const vs = variantsFor('lower-third') as { name: string; logo: string }[];
    return vs.find((v) => v.logo !== 'none')!.name;
  });
  await expect(page.locator('.wz-variant').first()).toContainText(firstWithLogo);

  // Number Badge is the design this test drives: its slot is hand-authored, so a working
  // image here proves the whole path (upload -> asset -> field -> <img> src).
  await page.locator('.wz-variant', { hasText: 'Number Badge' }).click();
  // The catalog continuation is mode IMPORT, which keeps the classic footer create (the
  // skip-to-finish shortcut is template mode's - createFromCurrentStep would wait forever).
  await switchToAdvancedMode(page);
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });

  const logo = previewFrame(page).locator('.lower-third-logo');
  await expect(logo).toBeVisible();
  await expect
    .poll(async () => logo.evaluate((el: HTMLImageElement) => el.src.startsWith('data:image/png')))
    .toBe(true);
});

test('style panel: accent retints the live preview', async ({ page }) => {
  await toVariantStep(page, 'Hairline');
  await createFromCurrentStep(page);

  await page.getByTestId('dock-tab-style').click();
  const accentRow = page.getByTestId('style-var-accent');
  // Wait out the debounced rebuild BEFORE reading inside the iframe: evaluating against a
  // document that is being replaced throws "execution context was destroyed", and a thrown
  // callback fails expect.poll outright instead of retrying.
  await awaitPreviewRebuild(page, () => accentRow.locator('input.grow').fill('#ff2d78'));
  await expect
    .poll(async () =>
      previewFrame(page).locator('.lower-third-accent').evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    .toBe('rgb(255, 45, 120)');
});


test('export: downloads a plug-and-play SPX zip', async ({ page }) => {
  await toVariantStep(page, 'Hairline');
  await createFromCurrentStep(page);
  await page.getByTestId('dock-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

// (The Blocks tab was retired in the UX overhaul — element inserts go through AI, and
// adding data fields lives in the Data panel; see e2e/ux.spec.ts.)
