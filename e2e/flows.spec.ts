// covers: app.html
// covers: src/components/wizard/**, !src/components/wizard/import/**
// focus

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { chooseNoacgAgent } from './_ai-step';
import { finishIntoNewEditor } from './_create';
import { mountWorkingDocument, updateWorkingDocument } from './_frame';
import { pickDesign } from './_browse';

// Core flows of the choose-first creation wizard: what a walk's answers make of the created
// graphic. Each flow leaves the wizard through a Finish door, which builds the graphic into
// the working document, and reads that document off the store or mounted the way playout
// composes it. (The old editor's topbar, Data panel and Style panel flows went with that
// editor; the defaults create and the SPX download are wizard-finish's and exports's.)

/** Walk the wizard entry → category → variant selection. */
async function toVariantStep(page: Page, variantName: string) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, variantName);
}

/** The created graphic mounted the way playout composes it, fed the store's sample data. */
async function mountCreated(page: Page): Promise<FrameLocator> {
  const doc = await mountWorkingDocument(page);
  const sample = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().sampleData as Record<string, string>;
  });
  await updateWorkingDocument(doc, sample);
  return doc;
}

function runtime(doc: FrameLocator, verb: 'play' | 'next'): Promise<void> {
  return doc.locator('body').evaluate((_, v) => {
    (window as unknown as Record<string, () => void>)[v]();
  }, verb);
}

test('wizard: field titles flow into the created graphic', async ({ page }) => {
  await toVariantStep(page, 'Underline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  const rows = page.locator('.wz-line-row');
  await rows.first().locator('input').first().fill('Guest name');
  await finishIntoNewEditor(page);

  const titles = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.map((f) => f.title);
  });
  expect(titles).toContain('Guest name');
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
  await finishIntoNewEditor(page);

  const doc = await mountCreated(page);
  await runtime(doc, 'play');
  // Line 2 waits behind its mask (translated down) until Next reveals it.
  const before = await doc.locator('#f1').evaluate((el) => getComputedStyle(el).transform);
  await runtime(doc, 'next');
  await expect
    .poll(async () => doc.locator('#f1').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe(before);
});

test('import graphics: image lands in the logo slot', async ({ page }) => {
  await page.goto('/app');
  // Images enter through "Create with AI"; the catalog continuation designs around them.
  await page.locator('[data-entry="ai"]').click();
  await chooseNoacgAgent(page);
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
  // The catalog continuation is mode IMPORT, which walks the footer to Finish (no skip-to-finish
  // shortcut); the export door there builds the graphic into the working document before it
  // opens the window.
  const exportDoor = page.getByTestId('wz-finish-export');
  for (let presses = 0; !(await exportDoor.isVisible()); presses++) {
    if (presses >= 6) throw new Error('the import continuation never reached Finish');
    await page.locator('.wz-footer button.wz-next').click();
  }
  await exportDoor.click();
  await expect(page.getByTestId('export-window')).toBeVisible();

  const doc = await mountCreated(page);
  const logo = doc.locator('.lower-third-logo');
  await expect(logo).toBeVisible();
  await expect
    .poll(async () => logo.evaluate((el: HTMLImageElement) => el.src.startsWith('data:image/png')))
    .toBe(true);
});
