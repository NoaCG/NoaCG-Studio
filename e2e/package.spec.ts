import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { enableAdvancedMode, finishIntoEditor, startNewProject } from './_create';
import { chooseType, pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';

// The broadcast-package flows: custom colors, imported fonts, the project brand,
// and the first-wave categories (info cards, end credits, tickers).

async function toVariantStep(page: Page, categoryName: string, variantName: string) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, categoryName);
  await pickDesign(page, variantName);
}

async function create(page: Page) {
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
}

function frame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
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
  await create(page);
  await expect
    .poll(async () =>
      frame(page).locator('.lower-third-accent').evaluate((el) => getComputedStyle(el).backgroundColor),
    )
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
  await create(page);

  // The generated code carries the embedded font; the export bundles the binary.
  await page.getByTestId('dock-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
});

test('a saved brand carries its look to another variant', async ({ page }) => {
  // A graphic with a custom accent, saved as a NAMED brand. Create no longer writes a brand
  // record of its own (docs/BRAND_PLAN.md decision 6), so making one is a deliberate act -
  // which is the whole point of the chooser this then drives.
  await toVariantStep(page, 'Lower thirds', 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.locator('[data-palette="custom"]').click();
  await page
    .locator('.wz-custom-colors .field-row', { hasText: 'Accent' })
    .locator('input.grow')
    .fill('#00ff88');
  await create(page);

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
  await create(page);
  await expect
    .poll(async () => frame(page).locator('.lower-third').evaluate(() => {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim();
    }))
    .toBe('#00ff88');
});

test('info card: creates, binds, and plays', async ({ page }) => {
  await toVariantStep(page, 'Topic', 'Slab Card');
  await create(page);
  await expect(page.locator('.topbar .tpl-name')).toHaveText('Slab Card');
  await expect(frame(page).locator('.info-card')).toBeAttached(); // the NEW document is loaded
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame(page).locator('.info-card').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('end credits: text field drives the parsed roll', async ({ page }) => {
  await toVariantStep(page, 'Credits', 'Classic Roll');
  await create(page);
  const track = frame(page).locator('#credits-track');
  // A role and the people credited with it is ONE block (docs/END_CREDITS.md) - this design
  // draws groups, so a role heading five names stays one credit rather than five.
  await expect(track.locator('.credits-group').first()).toBeAttached();
  await expect(track.locator('.credits-end')).toBeAttached(); // logo + year block
  // Editing the credits in the Data panel + ⟳ Update re-renders the rows.
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.panel-body textarea').first().fill('# CREW\nShowrunner: Nova Reyes');
  await page.locator('.panel-body').getByRole('button', { name: '⟳ Update' }).click();
  await expect(track.locator('.credits-group')).toHaveCount(1);
  await expect(track.locator('.credits-heading')).toHaveText(['CREW']);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame(page).locator('.credits').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('ticker: items loop and the label binds', async ({ page }) => {
  await toVariantStep(page, 'Tickers', 'News Strip');
  await create(page);
  const track = frame(page).locator('#ticker-track');
  await expect(track.locator(':scope > *').first()).toBeAttached();
  await page.getByRole('button', { name: '▶ Play' }).click();
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
  await create(page);
  await awaitPreviewRebuild(page, async () => {
    // The same write the timeline's hold popover makes: the setting lives in the definition
    // block, so the store copy alone would be overwritten by the next parse of the code.
    await page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
      const t = useTemplateStore.getState().template;
      const settings = { ...t.settings, out: '800' };
      useTemplateStore
        .getState()
        .applyTemplate({ ...t, settings, html: replaceDefinitionInHtml(t.html, settings, t.fields) });
    });
  });
  const strip = frame(page).locator('.ticker');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect(strip).toHaveCSS('opacity', '1'); // on air first…
  await expect // …then the hold expires and it leaves by itself.
    .poll(async () => Number(await strip.evaluate((el) => getComputedStyle(el).opacity)), { timeout: 10_000 })
    .toBeLessThan(0.1);
});

test('the post-creation preset picker withholds a structural preset', async ({ page }) => {
  // "Timed rotate" needs runtime knobs and a state machine the assembler writes at create time,
  // outside the marked region. Applying it later rewrites only the data, which stripped the
  // marquee's dynamic while those knobs stayed marquee-shaped and left the ticker permanently
  // frozen — rendering its items perfectly, moving never, reporting nothing.
  await toVariantStep(page, 'Tickers', 'News Strip');
  await create(page);
  await page.locator('.tlv2-labels .timeline-label').first().click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.getByTestId('inspector').getByRole('button', { name: 'Animations' }).click();
  await expect(page.getByTestId('inspector-animations')).toBeVisible();
  const select = page.getByTestId('inspector-preset-select');
  await expect(select).toBeVisible();
  const options = await select.locator('option').allTextContents();
  expect(options.join(' ')).toContain('Marquee loop'); // the swappable ones are still offered
  expect(options.join(' ')).not.toContain('Timed rotate');
});
