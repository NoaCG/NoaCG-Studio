import { test, expect, type Page } from '@playwright/test';
import { switchToAdvancedMode, skipOldEditor } from './_create';
import { awaitPreviewRebuild } from './_preview';
import { framedCardPng, CARD_TEXT_RECT } from './_png';

// The Import Graphic PREPARE step (docs/IMPORT_MVP.md): erasing baked-in text from the
// artwork, deterministically and offline. The user drags a box over the text; the engine
// finds the type inside it, samples the background around each piece, rebuilds it where a
// flat colour or a fitted linear gradient explains the samples (FLAT_BG_TOLERANCE), refuses
// honestly where neither does, and the erase always re-runs from the ORIGINAL pixels so
// adjusting can never compound fills.

async function dropCard(page: Page, buffer: Buffer, name = 'card.png') {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer,
  });
}

/** Design step -> Prepare step, and open the erase surface. */
async function toEraseSurface(page: Page) {
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('baked-yes').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
}

/** Drag a rectangle on the erase surface, in fractions of the displayed artwork. The box
 *  is polled until the <img> inside has laid out — its data-URL decode is async, and a box
 *  read too early points at a collapsed strip (the drag would land on the header). */
async function drawRect(page: Page, fx0: number, fy0: number, fx1: number, fy1: number) {
  const surface = page.getByTestId('erase-surface');
  await expect.poll(async () => (await surface.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps: 4 });
  await page.mouse.up();
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

/**
 * Create from wherever the walk stands and land in the NEW editor: skip to Finish (unless the
 * walk is already there) and press "Edit this graphic", which applies the imported graphic to
 * the working document. For the tests that read only the created template; the ones that read
 * the old editor's preview or panels still call createProject above, which skips.
 */
async function createIntoNewEditor(page: Page) {
  const edit = page.getByTestId('wz-finish-edit-artwork');
  if (!(await edit.isVisible())) await page.getByTestId('wz-skip-to-finish').click();
  await edit.click();
  // 20 s: the modal closes once the cold Prettier format behind the create resolves.
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}

/** One pixel of the created template's artwork asset, at fractions of its SOURCE size. */
async function assetPixel(page: Page, fx: number, fy: number) {
  return page.evaluate(
    async ({ fx, fy }) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const asset = useTemplateStore.getState().template.assets[0];
      const img = new Image();
      await new Promise((res, rej) => {
        img.onload = res;
        img.onerror = rej;
        img.src = asset.data as string;
      });
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const x = Math.round(img.naturalWidth * fx);
      const y = Math.round(img.naturalHeight * fy);
      const d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3], width: img.naturalWidth, height: img.naturalHeight };
    },
    { fx, fy },
  );
}

// The centre of the fixture's baked-text bar, and a rect that covers the bar with margin.
const TEXT_CENTER = {
  x: CARD_TEXT_RECT.x + CARD_TEXT_RECT.width / 2,
  y: CARD_TEXT_RECT.y + CARD_TEXT_RECT.height / 2,
};
const MARK = {
  x0: CARD_TEXT_RECT.x - 0.02,
  y0: CARD_TEXT_RECT.y - 0.02,
  x1: CARD_TEXT_RECT.x + CARD_TEXT_RECT.width + 0.02,
  y1: CARD_TEXT_RECT.y + CARD_TEXT_RECT.height + 0.02,
};

test('erase: a flat background flat-fills cleanly, and the created asset carries the fill', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);

  // The verdict: flat background, erased cleanly (no warning path).
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);

  await createProject(page);

  // The created template's artwork has the text bar REPLACED by the background colour.
  const px = await assetPixel(page, TEXT_CENTER.x, TEXT_CENTER.y);
  expect(px.r).toBeGreaterThan(200); // was the near-black bar (24,26,30)
  expect(px.a).toBe(255);
});

test('erase: a 2x retina export is erased in SOURCE pixels', async ({ page }) => {
  // 3840x2160 is scaled down to fit the 1920x1080 frame for DISPLAY — the file keeps every
  // pixel, and the erase must land in the file's own coordinates.
  await dropCard(page, framedCardPng(3840, 2160));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');

  await createProject(page);

  const px = await assetPixel(page, TEXT_CENTER.x, TEXT_CENTER.y);
  expect(px.width).toBe(3840); // full resolution kept
  expect(px.r).toBeGreaterThan(200); // …and cleaned at that resolution
});

test('erase: a smooth gradient background is REBUILT per pixel, not averaged', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600, { background: 'gradient' }));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);

  // The ramp is a plane the linear fit reconstructs — clean verdict, no warning.
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);

  await createProject(page);

  // The fill FOLLOWS the ramp: a pixel near the bar's left edge must be darker than one
  // near its right edge by about the ramp's own slope — a mean fill would paint both the
  // same and fail this in both directions.
  const leftX = CARD_TEXT_RECT.x + 0.03;
  const rightX = CARD_TEXT_RECT.x + CARD_TEXT_RECT.width - 0.03;
  const left = await assetPixel(page, leftX, TEXT_CENTER.y);
  const right = await assetPixel(page, rightX, TEXT_CENTER.y);
  const ramp = (fx: number) => Math.round(190 + fx * 60); // the generator's own formula
  expect(Math.abs(left.r - ramp(leftX))).toBeLessThanOrEqual(6);
  expect(Math.abs(right.r - ramp(rightX))).toBeLessThanOrEqual(6);
  expect(right.r - left.r).toBeGreaterThan(10);
});

test('erase: a busy background is refused honestly, with continue-anyway available', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600, { background: 'noise' }));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);

  // The warning names the deviation and recommends re-exporting; nothing applied yet.
  await expect(page.getByTestId('erase-warning')).toContainText("isn't flat");
  await expect(page.getByTestId('erase-done')).toHaveCount(0);

  // "Use it anyway" applies the average fill the preview showed.
  await page.getByTestId('erase-continue-anyway').click();
  await expect(page.getByTestId('erase-done')).toBeVisible();

  await createProject(page);
  const px = await assetPixel(page, TEXT_CENTER.x, TEXT_CENTER.y);
  expect(px.r).toBeGreaterThan(150); // the dark bar was filled (with the sampled mean)
});

test('erase: dropping one mark replays the rest from the original — fills never compound', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600));
  await toEraseSurface(page);

  // Two marks: the text bar, and the blob standing in for cap-side artwork. Marks ACCUMULATE
  // — a design usually has more than one piece of baked-in text.
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(1);
  await drawRect(page, 0.7, 0.28, 0.88, 0.7);
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(2);

  // Dropping the FIRST one cannot un-fill pixels in place — the artwork is rebuilt from the
  // untouched upload with only the survivor applied. So the bar comes back dark while the
  // blob stays erased, which is exactly what "fills never compound" means.
  await page.getByTestId('erase-remove-0').click();
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(1);
  await createProject(page);

  const bar = await assetPixel(page, TEXT_CENTER.x, TEXT_CENTER.y);
  expect(bar.r).toBeLessThan(60); // back
  const blob = await assetPixel(page, 0.79, 0.49);
  expect(blob.r).toBeGreaterThan(150); // still erased
});

test('erase: the erased region seeds the first text field, placed and sized from the mark', async ({ page }) => {
  skipOldEditor();
  await dropCard(page, framedCardPng(1000, 600));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-done')).toContainText('A text field will sit');
  await createIntoNewEditor(page);

  // The field exists on the design, showing its sample where the baked text was.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText('Name');

  // …as a real placed line built from the INK the erase measured — the bar at
  // CARD_TEXT_RECT — not from the looser rectangle the pointer drew around it. Design px =
  // source px here (the artwork is smaller than the frame). Everything through the same
  // reader modules the app uses.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, lineFit, lineFontSize, lineTextStyle } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return {
      placed: placedLines(s.template.html, s.template.css)['#f0'],
      fit: lineFit(s.template.html, s.template.css, 'f0'),
      font: lineFontSize(s.template.css, 'f0'),
      color: lineTextStyle(s.template.html, s.template.css, 'f0')?.color,
      style: lineTextStyle(s.template.html, s.template.css, 'f0'),
      titles: s.template.fields.map((f) => f.title),
    };
  });
  expect(state.titles).toEqual(['Name']);
  // The field contrasts against its own sampled fill: dark ink on this light card (the
  // palette's white default would be invisible on it).
  expect(state.color).toBe('#16181c');
  // The bar the fixture drew, in the 1000×600 image's own pixels: x 180..550, y 252..330.
  const bar = {
    x: Math.round(1000 * CARD_TEXT_RECT.x),
    y: Math.round(600 * CARD_TEXT_RECT.y),
    width: Math.round(1000 * CARD_TEXT_RECT.width),
    height: Math.round(600 * CARD_TEXT_RECT.height),
  };
  // Left-set text (its middle is well left of the artwork's), anchored on its own left edge.
  expect(state.style!.align).toBe('left');
  expect(Math.abs(state.placed!.x - bar.x)).toBeLessThan(6);
  expect(state.fit!.mode).toBe('shrink');
  // Its size: cap-top to baseline is about 72% of an em, so the em is that over 0.72. (A
  // solid bar has no descenders to find, so its whole height reads as the cap.)
  const font = Math.round(bar.height / 0.72);
  // The slot is the room the ORIGINAL text had — its ink plus the side bearings type
  // occupies beyond what it paints — so a long value shrinks where it did.
  expect(Math.abs((state.fit!.maxWidth ?? 0) - (bar.width + font * 0.12))).toBeLessThan(10);
  expect(Math.abs((state.font!.value ?? 0) - font)).toBeLessThan(8);
  // …and the box starts a tenth of an em above the ink, so the glyphs land back on it.
  expect(Math.abs(state.placed!.y - (bar.y - font * 0.1))).toBeLessThan(8);
});

test('erase: on a 2x export the seeded field maps to design pixels', async ({ page }) => {
  await dropCard(page, framedCardPng(3840, 2160));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-done')).toBeVisible();
  await createIntoNewEditor(page);

  // The measured ink starts at 0.18 × 3840 ≈ 691 SOURCE px; the design shows the art
  // frame-sized at 1920, so every placed number is HALVED — the erase and its measurement
  // stay in source px, the field lands in design px.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, lineFontSize } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return {
      placed: placedLines(s.template.html, s.template.css)['#f0'],
      font: lineFontSize(s.template.css, 'f0'),
    };
  });
  const k = 1920 / 3840;
  const bar = {
    x: Math.round(3840 * CARD_TEXT_RECT.x) * k,
    y: Math.round(2160 * CARD_TEXT_RECT.y) * k,
    height: Math.round(2160 * CARD_TEXT_RECT.height) * k,
  };
  const font = Math.round(bar.height / 0.72);
  expect(Math.abs(state.placed!.x - bar.x)).toBeLessThan(8);
  expect(Math.abs(state.placed!.y - (bar.y - font * 0.1))).toBeLessThan(10);
  expect(Math.abs((state.font!.value ?? 0) - font)).toBeLessThan(10);
});

test('erase: while a non-flat fill is pending, compare shows the original and discard keeps the text', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600, { background: 'noise' }));
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-warning')).toBeVisible();

  // The decision is visual - the proposed fill is on the canvas - so the original must be
  // one held press away WHILE deciding, not only after accepting.
  const img = page.getByTestId('erase-surface').locator('img');
  const pendingSrc = await img.getAttribute('src');
  const compare = page.getByTestId('erase-compare-pending');
  const box = (await compare.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(async () => (await img.getAttribute('src')) !== pendingSrc).toBe(true);
  await page.mouse.up();
  await expect.poll(async () => img.getAttribute('src')).toBe(pendingSrc);

  // Discarding says what it means: the baked words stay in the artwork.
  await page.getByRole('button', { name: 'Discard and keep the text' }).click();
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);
  await expect(page.getByTestId('erase-done')).toHaveCount(0);
});

/** A card whose ONE marked region holds TWO LINES of real typeset text - one over the flat
 *  card, one over a radial-gradient pool (smooth, so it is not mistaken for type; nonplanar,
 *  so no fitted plane explains it). What a partly-decorated design looks like to the erase:
 *  a PARTIAL success it must report per area, not as one verdict. */
async function mixedCardPng(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
    await face.load();
    document.fonts.add(face);
    const c = document.createElement('canvas');
    c.width = 1000;
    c.height = 600;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f2f3f5';
    g.fillRect(0, 0, 1000, 600);
    // The radial pool behind the SECOND line - a bowl no linear fit reconstructs.
    const pool = g.createRadialGradient(680, 380, 0, 680, 380, 200);
    pool.addColorStop(0, '#6a7284');
    pool.addColorStop(1, '#f2f3f5');
    g.fillStyle = pool;
    g.fillRect(480, 180, 400, 400);
    g.fillStyle = '#16181c';
    g.textBaseline = 'top';
    g.font = '700 44px Inter';
    g.fillText('Alexandra Riva', 140, 230); // line 1: over the flat card
    g.font = '400 40px Inter';
    g.fillText('Correspondent', 520, 350); // line 2: over the pool
    return c.toDataURL('image/png').split(',')[1];
  });
  return Buffer.from(base64, 'base64');
}

test('erase: a mixed-background mark says WHICH text areas took the average fill, before and after', async ({ page }) => {
  // ONE goto: the fixture typesets with the app's own bundled font, so it needs the page -
  // and a second navigation would land on Home instead of the auto-opened wizard.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const buffer = await mixedCardPng(page);
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'mixed.png',
    mimeType: 'image/png',
    buffer,
  });
  await page.getByRole('button', { name: 'Next →' }).click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
  // Real typeset lines usually earn the scan's own box; this test draws its own mark over
  // BOTH lines, so dismiss the offer when it is there and open the surface when it is not.
  const dismiss = page.getByTestId('erase-proposal-dismiss');
  const bakedYes = page.getByTestId('baked-yes');
  await expect(dismiss.or(bakedYes)).toBeVisible();
  if (await dismiss.count()) await dismiss.click();
  else await bakedYes.click();
  await drawRect(page, 0.1, 0.34, 0.86, 0.7);

  // Before applying: the warning already counts areas (1 of 2 not flat).
  await expect(page.getByTestId('erase-warning')).toContainText('1 of 2 text areas');
  await page.getByTestId('erase-continue-anyway').click();

  // After applying: the mark's own row keeps that truth instead of flattening it to
  // "average fill" - the flat bar WAS rebuilt cleanly, and the row says which half was not.
  await expect(page.getByTestId('erase-marks').locator('li')).toContainText(
    'average fill in 1 of 2 areas',
  );
});

test('erase: the cleaned PNG is downloadable', async ({ page }) => {
  await dropCard(page, framedCardPng(1000, 600), 'my-card.png');
  await toEraseSurface(page);
  await drawRect(page, MARK.x0, MARK.y0, MARK.x1, MARK.y1);
  await expect(page.getByTestId('erase-done')).toBeVisible();

  const downloadP = page.waitForEvent('download');
  await page.getByTestId('erase-download').click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toBe('my-card-clean.png');
});
