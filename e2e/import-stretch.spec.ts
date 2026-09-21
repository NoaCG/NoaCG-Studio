import { test, expect, type Page } from '@playwright/test';
import { switchToAdvancedMode } from './_create';
import { awaitPreviewRebuild } from './_preview';
import { framedCardPng, CARD_TEXT_RECT } from './_png';

// The Import Graphic SCALING MODE (docs/IMPORT_MVP.md): fixed (default — the image renders
// exactly as drawn) vs horizontal 9-slice stretch (the plain middle band widens with the
// longest text field, the drawn caps keep their exact shape). Mode and guides live only in
// the created template's own declarations; the runtime ladder is stretch → shrink → clip.

const MARK = {
  x0: CARD_TEXT_RECT.x - 0.02,
  y0: CARD_TEXT_RECT.y - 0.02,
  x1: CARD_TEXT_RECT.x + CARD_TEXT_RECT.width + 0.02,
  y1: CARD_TEXT_RECT.y + CARD_TEXT_RECT.height + 0.02,
};

async function dropCard(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'card.png',
    mimeType: 'image/png',
    buffer: framedCardPng(1000, 600),
  });
  await page.getByRole('button', { name: 'Next →' }).click();
}

/** The artwork surface's box — awaited until the <img> inside has actually laid out
 *  (its data-URL decode is async, and a box read too early points at a collapsed strip). */
async function surfaceBox(page: Page) {
  const surface = page.getByTestId('erase-surface');
  // A prior click may have auto-scrolled the step (Playwright scrolls its target into
  // view), leaving the surface clipped above — bring it back before measuring.
  await surface.scrollIntoViewIfNeeded();
  await expect.poll(async () => (await surface.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  return (await surface.boundingBox())!;
}

/** Erase the fixture's baked-text bar (seeds the f0 field the stretch tests drive). */
async function eraseTextBar(page: Page) {
  await page.getByTestId('baked-yes').click();
  const box = await surfaceBox(page);
  await page.mouse.move(box.x + box.width * MARK.x0, box.y + box.height * MARK.y0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * MARK.x1, box.y + box.height * MARK.y1, { steps: 4 });
  await page.mouse.up();
  await expect(page.getByTestId('erase-done')).toBeVisible();
}

async function createProject(page: Page) {
  await switchToAdvancedMode(page);
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    // 20 s: the modal only closes once applyGenerated's cold Prettier format resolves - the
    // same cold-module cost text-tools.spec.ts's createBareDesign documents in full.
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

/** The created template's stretch guides + validation, via the app's own readers. */
async function stretchState(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { designStretchInfo } = await import('/src/blocks/designLayout.ts');
    const { validateTemplate } = await import('/src/validation/validateTemplate.ts');
    const s = useTemplateStore.getState();
    const v = validateTemplate(s.template);
    return {
      info: designStretchInfo(s.template.html, s.template.css),
      valid: v.ok,
      errors: v.errors,
      // The image ref must be a CSS declaration, never an inline style — the editor's
      // entrance reset clears inline styles, and the artwork has to survive it.
      cssRef: s.template.css.includes('border-image-source'),
      inlineRef: s.template.html.includes('border-image-source'),
    };
  });
}

/** Live metrics from the editor preview iframe (canvas px, transform-free). */
async function boxMetrics(page: Page) {
  return page
    .frameLocator('iframe.preview-frame')
    .locator('.imported-design-box')
    .evaluate((box) => {
      const art = box.querySelector<HTMLElement>('.imported-design-art')!;
      const f0 = box.querySelector<HTMLElement>('#f0');
      return {
        width: Math.round(box.getBoundingClientRect().width),
        // Canvas px: the editor preview pads the viewport (the pasteboard), so measure
        // from the body's edge — inside the document, the body IS the 1920px canvas.
        right: Math.round(
          box.getBoundingClientRect().right - document.body.getBoundingClientRect().left,
        ),
        capLeft: parseFloat(getComputedStyle(art).borderLeftWidth),
        font: f0 ? parseFloat(getComputedStyle(f0).fontSize) : null,
      };
    });
}

async function setSample(page: Page, value: string) {
  await page.evaluate(async (v) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSampleValue('f0', v);
    // The live-edit pair the field rows use: the value lands in the store, the control
    // command pushes it into the running preview's update().
    useTemplateStore.getState().sendControl('update');
  }, value);
}

test('stretch: picking it writes the 9-slice into the created code, and the guides parse back', async ({ page }) => {
  await dropCard(page);
  await page.getByTestId('mode-stretch').click();
  await createProject(page);

  const state = await stretchState(page);
  // No erase: the guides default to the middle third (35% / 65% of the 1000px artwork).
  expect(state.info).toEqual({ left: 350, right: 650 });
  expect(state.cssRef).toBe(true);
  expect(state.inlineRef).toBe(false); // survives the editor's clearProps entrance reset
  expect(state.valid).toBe(true); // the export gate passes
  // The created template is otherwise BARE — the preview's demo line never ships.
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.length;
  });
  expect(fields).toBe(0);
});

test('stretch: the SPX folder package carries the 9-slice with subfolder-correct refs', async ({ page }) => {
  await dropCard(page);
  await page.getByTestId('mode-stretch').click();
  await createProject(page);

  // The packaged css/template.css hops bucket urls to ../ (it ships one level down while
  // assets unpack at the project root); the editor's own css stays root-relative.
  const pkg = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { EXPORT_TARGETS } = await import('/src/export/registry.ts');
    const t = useTemplateStore.getState().template;
    const zip = await EXPORT_TARGETS.find((x) => x.id === 'spx')!.build(t, {
      sampleData: useTemplateStore.getState().sampleData,
    });
    const files = Object.keys(zip.files);
    const css = await zip.files[files.find((f) => f.endsWith('css/template.css'))!].async('string');
    return {
      hasArtFile: files.some((f) => /images\/card/.test(f)),
      artRefHops: /url\(["']?\.\.\/images\//.test(css),
      fontRefHops: /url\(["']?\.\.\/fonts\//.test(css),
      storeStaysRootRelative: /url\("images\//.test(t.css),
    };
  });
  expect(pkg).toEqual({
    hasArtFile: true,
    artRefHops: true,
    fontRefHops: true,
    storeStaysRootRelative: true,
  });
});

test('stretch: a long value grows the design at full type size, and a short one springs back', async ({ page }) => {
  await dropCard(page);
  await eraseTextBar(page);
  await page.getByTestId('mode-stretch').click();
  await createProject(page);

  // Erase + stretch: the guides defaulted to the erased text's edges (the drawn rect).
  const { info } = await stretchState(page);
  expect(Math.abs(info!.left - 160)).toBeLessThan(12);
  expect(Math.abs(info!.right - 570)).toBeLessThan(12);

  // The artwork actually PAINTS after the editor's settle (which clears inline styles —
  // the reason the image ref lives in the CSS rule and never on the element).
  const painted = await page
    .frameLocator('iframe.preview-frame')
    .locator('.imported-design-art')
    .evaluate((el) => getComputedStyle(el).borderImageSource.startsWith('url'));
  expect(painted).toBe(true);

  const rest = await boxMetrics(page);
  // A value long enough to need more room than the design was drawn with, but still short
  // enough to get it — the seeded field is sized from the erased text's own ink, so the
  // headroom before the frame edge is whatever that type size leaves.
  await setSample(page, 'Alexandra Riva');
  await expect.poll(async () => (await boxMetrics(page)).width).toBeGreaterThan(rest.width + 40);
  const grown = await boxMetrics(page);
  expect(grown.font).toBe(rest.font); // the image answered — the type never shrank
  expect(grown.capLeft).toBe(rest.capLeft); // the left cap keeps its exact painted width

  await setSample(page, 'Bo Li');
  await expect.poll(async () => (await boxMetrics(page)).width).toBeLessThan(rest.width + 4);
});

test('stretch: growth caps inside the frame edge, then the text-fit shrink answers the rest', async ({ page }) => {
  await dropCard(page);
  await eraseTextBar(page);
  await page.getByTestId('mode-stretch').click();
  await createProject(page);

  const rest = await boxMetrics(page);
  await setSample(page, 'Alexandra Konstantinopoulos-Virtanen Extraordinaire de la Grande Maison');
  await expect.poll(async () => (await boxMetrics(page)).width).toBeGreaterThan(rest.width + 40);
  const extreme = await boxMetrics(page);
  expect(extreme.right).toBeLessThanOrEqual(Math.round(1920 * 0.96) + 2); // the safe cap
  expect(extreme.font).toBeLessThan(rest.font!); // past the cap, shrink takes over
});

test('stretch: dragging a guide lands in the created code', async ({ page }) => {
  await dropCard(page);
  await page.getByTestId('mode-stretch').click();
  const surface = await surfaceBox(page);
  const guide = (await page.getByTestId('stretch-guide-left').boundingBox())!;
  await page.mouse.move(guide.x + guide.width / 2, surface.y + surface.height / 2);
  await page.mouse.down();
  await page.mouse.move(surface.x + surface.width * 0.2, surface.y + surface.height / 2, { steps: 4 });
  await page.mouse.up();
  await createProject(page);

  const { info } = await stretchState(page);
  expect(Math.abs(info!.left - 200)).toBeLessThan(12); // dragged to 20% of the 1000px artwork
  expect(info!.right).toBe(650); // the other guide stayed put
});

test('fixed default: no stretch markers, and a long value shrinks its text instead', async ({ page }) => {
  await dropCard(page);
  await eraseTextBar(page);
  await createProject(page); // no mode picked — fixed is the default

  const state = await stretchState(page);
  expect(state.info).toBeNull();
  expect(state.cssRef).toBe(false); // the classic <img> artwork, untouched

  const rest = await boxMetrics(page);
  await setSample(page, 'Alexandra Konstantinopoulos-Virtanen');
  await expect.poll(async () => (await boxMetrics(page)).font).toBeLessThan(rest.font!);
  expect((await boxMetrics(page)).width).toBe(rest.width); // the image never grew
});
