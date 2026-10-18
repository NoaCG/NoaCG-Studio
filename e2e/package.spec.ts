// covers: src/export/**, src/components/{ExportSurface.tsx,PlayoutCompatibility.tsx}
// focus
//
// This spec CREATES catalog variants and asserts on the markup they emit (Classic Roll's parsed
// roll), so a design's markup changing under it is a real templates dependency; unmapped, a renamed
// credits row got past a local affected run and red-mained CI on 2026-08-26.
// covers: src/templates/**
// covers: src/components/{editorFoundation/EditorFoundation,wizard/steps/FinishStep}.tsx, src/components/ExportWindow.tsx

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import { finishIntoNewEditor, openExportWindow, startNewProject } from './_create';
import { settleDurableWrites } from './_durable';
import { mountWorkingDocument, updateWorkingDocument } from './_frame';
import { chooseType, pickDesign } from './_browse';

// The broadcast-package flows: custom colors, imported fonts, the project brand,
// and the first-wave categories (info cards, end credits, tickers).

async function toVariantStep(page: Page, categoryName: string, variantName: string) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, categoryName);
  await pickDesign(page, variantName);
}

/** Finish into the new editor, then mount the created graphic the way playout composes it: the
 *  document the assertions read, with its own play() and update(). */
async function create(page: Page): Promise<FrameLocator> {
  await finishIntoNewEditor(page);
  return mountWorkingDocument(page);
}

/** play() on the mounted document, the way playout starts it. */
async function play(doc: FrameLocator): Promise<void> {
  await doc.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
}

// No localStorage cleanup needed: Playwright gives every test a fresh browser context,
// so the project brand never leaks between specs. (Do NOT clear it via addInitScript —
// that script also runs inside the same-origin preview iframe and would delete the brand
// the moment the preview rebuilds.)

test('custom colors: a hex typed in the wizard lands in the generated :root', async ({ page }) => {
  await toVariantStep(page, 'Lower thirds', 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await page.locator('[data-palette="custom"]').click();
  const accentRow = page.locator('.wz-custom-colors .field-row', { hasText: 'Accent' });
  await accentRow.locator('input.grow').fill('#ff2d78');
  const doc = await create(page);
  await expect
    .poll(async () => doc.locator('.lower-third-accent').evaluate((el) => getComputedStyle(el).backgroundColor))
    .toBe('rgb(255, 45, 120)');
});

test('imported font: embedded, applied, and bundled into the export', async ({ page }) => {
  await toVariantStep(page, 'Lower thirds', 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click(); // Style

  // Import a real font file (reuse a bundled woff2 as the "user file").
  const buf = await page.evaluate(async () => {
    const res = await fetch('/fonts/bebas-neue.woff2');
    return Array.from(new Uint8Array(await res.arrayBuffer()));
  });
  await page.locator('.wz-step input[type="file"]').first().setInputFiles({
    name: 'My-Brand-Font.woff2',
    mimeType: 'font/woff2',
    buffer: Buffer.from(buf),
  });
  // The upload lands as the picker's "(Your typeface)" option and is selected at once.
  await expect(page.getByTestId('font-select').first()).toHaveValue('custom');
  await expect(
    page.getByTestId('font-select').first().locator('option[value="custom"]'),
  ).toHaveText('My Brand Font (Your typeface)');
  const doc = await create(page);

  // The generated code carries the embedded font: its own @font-face naming the uploaded file
  // the way the export ships it, and the family applied to the graphic's text.
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('font-family: "My Brand Font"');
  expect(css).toContain('fonts/My-Brand-Font.woff2');
  await expect
    .poll(async () =>
      doc.locator('body').evaluate(() =>
        Array.from(document.querySelectorAll('*')).some((el) => getComputedStyle(el).fontFamily.includes('My Brand Font')),
      ),
    )
    .toBe(true);

  // The export bundles the binary beside the HTML, under the path the CSS asks for.
  await openExportWindow(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  const files = Object.keys((await JSZip.loadAsync(await readFile(await download.path()))).files);
  expect(files.some((f) => f.endsWith('fonts/My-Brand-Font.woff2'))).toBe(true);
});

test('a saved brand carries its look to another variant', async ({ page }) => {
  // A graphic with a custom accent, saved as a NAMED brand. Create no longer writes a brand
  // record of its own (docs/BRAND_PLAN.md decision 6), so making one is a deliberate act -
  // which is the whole point of the chooser this then drives. The CAPTURE half is this case's
  // own: wizard-brand.spec.ts seeds its brands as literals and pins only the apply.
  await toVariantStep(page, 'Lower thirds', 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.locator('[data-palette="custom"]').click();
  await page
    .locator('.wz-custom-colors .field-row', { hasText: 'Accent' })
    .locator('input.grow')
    .fill('#00ff88');
  await finishIntoNewEditor(page);

  await page.evaluate(async () => {
    const { createLook, captureLookFromTemplate } = await import('/src/model/packets.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    createLook('Channel green', captureLookFromTemplate(useTemplateStore.getState().template));
  });
  await settleDurableWrites(page);

  // Second creation, different family: the brand's accent applies through the chooser.
  await startNewProject(page);
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Frosted Card');
  // None until somebody chooses - carrying a look over is explicit, as the old toggle was.
  const brand = page.getByTestId('wz-brand');
  await expect(brand).toHaveValue('');
  await brand.selectOption({ label: 'Channel green' });
  const doc = await create(page);
  await expect
    .poll(async () =>
      doc.locator('body').evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()),
    )
    .toBe('#00ff88');
});

test('info card: creates, binds, and plays', async ({ page }) => {
  await toVariantStep(page, 'Topic', 'Slab Card');
  const doc = await create(page);
  const name = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.name;
  });
  expect(name).toBe('Slab Card');
  await expect(doc.locator('.info-card')).toBeAttached(); // the NEW document is loaded
  await play(doc);
  await expect
    .poll(async () => doc.locator('.info-card').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('end credits: text field drives the parsed roll', async ({ page }) => {
  await toVariantStep(page, 'Credits', 'Classic Roll');
  const doc = await create(page);
  const track = doc.locator('#credits-track');
  // A role and the people credited with it is ONE block (docs/END_CREDITS.md) - this design
  // draws groups, so a role heading five names stays one credit rather than five.
  await expect(track.locator('.credits-group').first()).toBeAttached();
  await expect(track.locator('.credits-end')).toBeAttached(); // logo + year block
  // A new value for the credits field, through update() the way the desk sends one, re-renders
  // the rows.
  await updateWorkingDocument(doc, { f0: '# CREW\nShowrunner: Nova Reyes' });
  await expect(track.locator('.credits-group')).toHaveCount(1);
  await expect(track.locator('.credits-heading')).toHaveText(['CREW']);
  await play(doc);
  await expect
    .poll(async () => doc.locator('.credits').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('ticker: items loop and the label binds', async ({ page }) => {
  await toVariantStep(page, 'Tickers', 'News Strip');
  const doc = await create(page);
  const track = doc.locator('#ticker-track');
  await expect(track.locator(':scope > *').first()).toBeAttached();
  await play(doc);
  // The marquee is actually moving: the track's transform changes over time.
  // (The strip fades in first, so poll until the track tween has visibly progressed.)
  const t1 = await track.evaluate((el) => getComputedStyle(el).transform);
  await expect
    .poll(async () => track.evaluate((el) => getComputedStyle(el).transform), { timeout: 6000 })
    .not.toBe(t1);
});

test('ticker: an endless marquee still honours its timed hold', async ({ page }) => {
  // GSAP reports an endless entrance (repeat: -1) as a ~1e10 s duration, and the auto-out timer
  // used to be scheduled at that duration + the hold. As a setTimeout delay that is 1e13 ms —
  // past the 32-bit argument, so it wrapped to roughly 15 days and the exit never came. The
  // SPX `out` hold was silently dead on every endless graphic.
  await toVariantStep(page, 'Tickers', 'News Strip');
  await finishIntoNewEditor(page);
  // The same write the hold control makes: the setting lives in the definition block, so the
  // store copy alone would be overwritten by the next parse of the code. The document is
  // mounted from the template that carries it.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const t = useTemplateStore.getState().template;
    const settings = { ...t.settings, out: '800' };
    useTemplateStore
      .getState()
      .applyTemplate({ ...t, settings, html: replaceDefinitionInHtml(t.html, settings, t.fields) });
  });
  // The hold is the SIMULATOR's to keep: on air the host (SPX, the overlay export) schedules the
  // exit, and in the studio the editor's simulator does, so this document is composed with the
  // simulator and played through its own command, the way the editor's Play drives it.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    document.querySelectorAll('iframe.held-document').forEach((f) => f.remove());
    const f = document.createElement('iframe');
    f.className = 'held-document';
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1920px;height:1080px;';
    document.body.appendChild(f);
    await new Promise((res) => {
      f.onload = res;
      f.srcdoc = composeDocument(useTemplateStore.getState().template, { simulate: true });
    });
  });
  const strip = page.frameLocator('iframe.held-document').locator('.ticker');
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { postPreviewCmd } = await import('/src/preview/previewProtocol.ts');
    const f = document.querySelector('iframe.held-document') as HTMLIFrameElement;
    const data = JSON.stringify(useTemplateStore.getState().sampleData ?? {});
    postPreviewCmd(f.contentWindow, { cmd: 'sim-play', data });
  });
  await expect(strip).toHaveCSS('opacity', '1'); // on air first…
  await expect // …then the hold expires and it leaves by itself.
    .poll(async () => Number(await strip.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 10_000 })
    .toBeLessThan(0.1);
});

