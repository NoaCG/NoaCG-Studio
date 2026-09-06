import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { lowerThirdPng, framedCardPng, CARD_TEXT_RECT } from './_png';
import { elementPoint } from './_canvas';
import { holdKeyRepeats, parkFocusOffControls, stampTimeline, timelineState } from './_keys';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';

// Canvas usability on an imported design (docs/IMPORT_MVP.md): the artwork and the fields
// placed on it are ONE composition — scaling keeps them together as design-layout CSS — and
// the canvas behaves like the editors people already know: space-drag pans, a press on the
// visible topmost element moves THAT element, and the locked artwork never steals the gesture.

async function dropDesign(page: Page, file = { name: 'lower-third.png', mimeType: 'image/png' }) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    ...file,
    buffer: lowerThirdPng(1920, 1080),
  });
}

async function createBare(page: Page) {
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    // 20 s: the modal only closes once applyGenerated's cold Prettier format resolves - the
    // same cold-module cost text-tools.spec.ts's createBareDesign documents in full.
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

async function addFieldViaDataTab(page: Page, title: string) {
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.field-add-row input').fill(title);
  await awaitPreviewRebuild(page, () => page.getByRole('button', { name: '+ Add' }).click());
}

async function createImported(page: Page) {
  await dropDesign(page);
  await createBare(page);
  await addFieldViaDataTab(page, 'Name');
}

/** The composition's geometry, measured in the live preview: the artwork's box, the field's
 *  position and size RELATIVE to it, plus the code facts a grouped scale must respect. */
async function composition(page: Page) {
  const inFrame = await page.frameLocator('iframe.preview-frame').locator('.imported-design-art').evaluate((art) => {
    const doc = art.ownerDocument;
    const a = art.getBoundingClientRect();
    const f = doc.getElementById('f0')!.getBoundingClientRect();
    return {
      artW: a.width,
      artH: a.height,
      // Where the text sits inside the artwork, as a FRACTION of it — the thing a grouped
      // scale must hold constant.
      relX: (f.left - a.left) / a.width,
      relY: (f.top - a.top) / a.height,
      relFont: parseFloat(getComputedStyle(doc.getElementById('f0')!).fontSize) / a.width,
      scaleVar: parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--scale')) || 1,
    };
  });
  const inCode = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { getCssVariable } = await import('/src/model/cssVars.ts');
    const s = useTemplateStore.getState();
    const data = parseAnimData(s.template.js);
    const tracksOf = (sel: string) =>
      (data?.steps ?? []).flatMap((step) => Object.keys(step.layers[sel] ?? {}));
    return {
      cssScale: parseFloat(getCssVariable(s.template.css, 'scale') ?? '1'),
      artTracks: tracksOf('.imported-design-art'),
      boxTracks: tracksOf('.imported-design-box'),
      history: s.history.length,
    };
  });
  return { ...inFrame, ...inCode };
}

/** Drag a handle by (dx, dy) screen px. */
async function dragHandle(page: Page, testId: string, dx: number, dy: number) {
  const box = (await page.getByTestId(testId).boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, { steps: 8 });
  await page.mouse.up();
}

test('import graphic: scaling the design scales the artwork and its fields together', async ({ page }) => {
  await createImported(page);

  // Select the artwork from the timeline (the layer list), like any layer.
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });

  // The artwork is not a layer you can scale on its own: the design unit's corner handle is
  // the DESIGN scale handle, so the keyframe scale/rotate handles step aside for it.
  await expect(page.getByTestId('layer-scale-handle')).toHaveCount(0);
  await expect(page.getByTestId('layer-rotate-handle')).toHaveCount(0);
  await expect(page.getByTestId('scale-handle')).toBeVisible();

  const before = await composition(page);
  await dragHandle(page, 'scale-handle', 120, 68);
  await awaitPreviewRebuild(page);

  const after = await composition(page);
  expect(after.artW).toBeGreaterThan(before.artW * 1.05);
  // The composition survived: the field kept its place ON the artwork and its relative size.
  expect(after.relX).toBeCloseTo(before.relX, 2);
  expect(after.relY).toBeCloseTo(before.relY, 2);
  expect(after.relFont).toBeCloseTo(before.relFont, 3);
  // …and it is DESIGN layout, not motion: one --scale patch, zero keyframes.
  expect(after.cssScale).toBeGreaterThan(before.cssScale);
  expect(after.artTracks).toEqual(before.artTracks);
  expect(after.boxTracks).toEqual(before.boxTracks);
  expect(after.history).toBe(before.history + 1);

  // Fields stay independently editable after a grouped scale: the field's own corner handle
  // is back the moment it is selected.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('line-size-handle')).toBeVisible();
});

/** What a gesture wrote: the field's placement, the artwork's motion, the root's anchor. */
async function writes(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines } = await import('/src/blocks/designLayout.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const s = useTemplateStore.getState();
    const data = parseAnimData(s.template.js);
    const tracksOf = (sel: string) =>
      (data?.steps ?? []).flatMap((step) => Object.keys(step.layers[sel] ?? {})).sort();
    const root = s.template.css.match(/\.imported-design\s*\{([^}]*)\}/)?.[1] ?? '';
    return {
      place: placedLines(s.template.html, s.template.css)['#f0'] ?? null,
      artTracks: tracksOf('.imported-design-art'),
      rootRule: root.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').trim(),
      selected: s.selectedParts,
    };
  });
}

/** A press-and-drag straight from a point in the preview — no selection click first. */
async function dragFrom(page: Page, selector: string, at: [number, number], by: [number, number]) {
  const c = await elementPoint(page, selector, at[0], at[1]);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + by[0], c.y + by[1], { steps: 8 });
  await page.mouse.up();
  return c.scale;
}

test('import graphic: dragging visible text moves the TEXT, not the artwork under it', async ({ page }) => {
  await createImported(page);
  // Start from nothing selected (a field arrives selected, so Escape clears it): the press
  // itself has to do both jobs.
  await page.keyboard.press('Escape');
  const before = await writes(page);
  expect(before.selected).toEqual([]);

  const scale = await dragFrom(page, '#f0', [0.5, 0.5], [110, -70]);
  await awaitPreviewRebuild(page);

  const after = await writes(page);
  // One gesture selected the text AND placed it — no select-then-drag round trip.
  expect(after.selected).toEqual(['#f0']);
  expect(after.place!.x).toBeCloseTo(before.place!.x + 110 / scale, -1);
  expect(after.place!.y).toBeCloseTo(before.place!.y - 70 / scale, -1);
  // The artwork under the text was NOT dragged, and the graphic did not re-anchor.
  expect(after.artTracks).toEqual(before.artTracks);
  expect(after.rootRule).toBe(before.rootRule);
});

test('import graphic: the locked artwork never captures a drag — bare artwork moves the graphic', async ({ page }) => {
  await createImported(page);

  // The artwork is locked by default: selecting it says so, and it offers no move handles.
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await expect(page.getByTestId('canvas-lock')).toContainText('Locked');
  await expect(page.getByTestId('layer-scale-handle')).toHaveCount(0);

  const before = await writes(page);
  // Drag from BARE artwork, well clear of the text.
  await dragFrom(page, '.imported-design-art', [0.82, 0.2], [-60, 90]);
  await awaitPreviewRebuild(page);

  const after = await writes(page);
  expect(after.artTracks).toEqual(before.artTracks); // no motion keyed on the locked artwork
  expect(after.place).toEqual(before.place); // and the text stayed put
  expect(after.rootRule).not.toBe(before.rootRule); // the WHOLE graphic re-anchored instead
});

test('import graphic: unlocking the artwork gives it back its own layer gestures', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await page.getByTestId('canvas-lock').click();
  await expect(page.getByTestId('canvas-lock')).toContainText('Unlocked');

  const before = await writes(page);
  await dragFrom(page, '.imported-design-art', [0.82, 0.2], [-60, 90]);
  await awaitPreviewRebuild(page);

  const after = await writes(page);
  // Now it moves as its own layer — position keyframes, the channel every layer uses.
  expect(after.artTracks).toContain('x');
  expect(after.artTracks).toContain('y');
  expect(after.rootRule).toBe(before.rootRule); // the graphic itself did not re-anchor
});

/** The canvas world's pan translation, in screen px. */
async function panOf(page: Page) {
  const t = await page.locator('.canvas-world').evaluate((el) => (el as HTMLElement).style.transform);
  const m = t.match(/translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/);
  return { x: parseFloat(m?.[1] ?? '0'), y: parseFloat(m?.[2] ?? '0') };
}

test('canvas: holding Space pans the view and moves nothing in the document', async ({ page }) => {
  await createImported(page);
  await page.keyboard.press('Escape');
  const before = await writes(page);
  expect(await panOf(page)).toEqual({ x: 0, y: 0 });

  // Press straight on the TEXT — with Space held the canvas pans instead of placing it.
  const c = await elementPoint(page, '#f0', 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Space');
  await expect(page.getByTestId('preview-stage')).toHaveClass(/ panning/);
  await page.mouse.down();
  await page.mouse.move(c.x - 90, c.y + 55, { steps: 8 });
  await expect(page.getByTestId('preview-stage')).toHaveClass(/panning-active/);
  await page.mouse.up();

  expect(await panOf(page)).toEqual({ x: -90, y: 55 });
  const after = await writes(page);
  expect(after.place).toEqual(before.place); // the view moved, the document did not
  expect(after.rootRule).toBe(before.rootRule);
  expect(after.selected).toEqual([]);

  // Releasing Space restores the previous tool and its cursor.
  await page.keyboard.up('Space');
  await expect(page.getByTestId('preview-stage')).not.toHaveClass(/panning/);
});

test('canvas: an armed Space-pan does not also play the graphic', async ({ page }) => {
  await createImported(page);
  await page.keyboard.press('Escape');
  // Adding the field left the Data tab's "+ Add" focused, and a focused button owns Space —
  // so who answers the presses below would otherwise depend on a timer this test knows nothing
  // about (see parkFocusOffControls).
  await parkFocusOffControls(page);

  // The pan class alone would not catch a regression here: a play tween touches none of the
  // things the pan test above asserts, so this watches the running timeline itself.
  const atRest = await stampTimeline(page);

  const c = await elementPoint(page, '#f0', 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Space');
  await expect(page.getByTestId('preview-stage')).toHaveClass(/ panning/);

  // AUTO-REPEAT is the real gesture: a pan lasts far longer than the OS repeat delay, and the
  // repeats are separate keydowns. A design where the pan CLAIMS the key only covers the first
  // one, which is how this bug survived its first fix — both sides must re-answer every repeat.
  await holdKeyRepeats(page, 8);
  expect(await timelineState(page)).toBe(atRest);
  await page.keyboard.up('Space');

  // The same key off the stage still IS Play — the rule narrows Space, it does not take it.
  await page.mouse.move(4, 4);
  await page.keyboard.press(' ');
  await expect.poll(() => timelineState(page)).toBe('fresh');
});

test('canvas: Space follows the ACTIVE SURFACE - timeline plays even over the stage', async ({ page }) => {
  await createImported(page);
  await page.keyboard.press('Escape');
  await parkFocusOffControls(page); // the surface owns Space here, not a leftover focused button

  // Working in the timeline hands Space back to Play. The pointer is then parked over the
  // stage — under the old pointer-only rule that alone would have armed the pan.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await stampTimeline(page);
  const c = await elementPoint(page, '#f0', 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  await page.keyboard.press(' ');
  await expect(page.getByTestId('preview-stage')).not.toHaveClass(/panning/);
  await expect.poll(() => timelineState(page)).toBe('fresh');

  // A press on the stage takes it back, and Space pans again.
  await page.mouse.click(c.x, c.y);
  await stampTimeline(page);
  await page.keyboard.down('Space');
  await expect(page.getByTestId('preview-stage')).toHaveClass(/ panning/);
  await holdKeyRepeats(page, 6);
  // The claim is that the HELD key started no new run - so the assertion is "not fresh", not
  // "parked". A run releases itself on completion now, so by the time the hold is over the
  // earlier play has usually ended and reads as 'none'; pinning the exact resting state would
  // make this spec fail on how long the entrance happens to take, which is not its subject.
  expect(await timelineState(page)).not.toBe('fresh');
  await page.keyboard.up('Space');
});

test('canvas: Space only pans over the stage, and never while typing', async ({ page }) => {
  await createImported(page);

  // Typing a field value: Space is a space, not a pan (and not Play).
  await page.getByTestId('dock-tab-data').click();
  const input = page.locator('.field-add-row input');
  await input.fill('Sponsor name');
  await expect(page.getByTestId('preview-stage')).not.toHaveClass(/panning/);
  await expect(input).toHaveValue('Sponsor name');

  // Pointer off the stage: Space stays the timeline's Play key.
  await page.mouse.move(4, 4);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await page.keyboard.down('Space');
  await expect(page.getByTestId('preview-stage')).not.toHaveClass(/panning/);
  await page.keyboard.up('Space');
  expect(await panOf(page)).toEqual({ x: 0, y: 0 });
});

test('canvas: the cursor names the gesture in progress, not one that is merely possible', async ({ page }) => {
  await createImported(page);
  const layer = page.getByTestId('canvas-layer');
  const cursorNow = () => layer.evaluate((el) => getComputedStyle(el).cursor);

  // Hovering movable text is a plain arrow — selection, not a promise of a drag.
  const c = await elementPoint(page, '#f0', 0.5, 0.5);
  await page.mouse.move(c.x, c.y);
  expect(['auto', 'default']).toContain(await cursorNow());

  // Mid-drag it reads as a move…
  await page.mouse.down();
  await page.mouse.move(c.x + 40, c.y + 10, { steps: 4 });
  expect(await cursorNow()).toBe('move');
  await page.mouse.up();
  await awaitPreviewRebuild(page);
  expect(['auto', 'default']).toContain(await cursorNow());

  // …a resize handle as a resize…
  await expect(page.getByTestId('line-size-handle')).toHaveCSS('cursor', 'nwse-resize');

  // …an armed type tool as text, and panning as the hand — the only hand on the canvas.
  await page.getByTestId('tool-text').click();
  expect(await cursorNow()).toBe('text');
  await page.getByTestId('tool-select').click();
  await page.mouse.move(c.x, c.y);
  await page.keyboard.down('Space');
  expect(await cursorNow()).toBe('grab');
  await page.keyboard.up('Space');
});

// ── The Prepare step's replacement field: it should land ON the text it replaced ──────────
//
// The rectangle the user draws is a loose lasso — you box text in with air around it — so
// every one of these cases draws it deliberately off-centre and larger than the text. What
// the seeded field matches is the INK the erase measured, not that rectangle.

const CENTRED_TEXT = { x: 0.35, y: 0.4, width: 0.3, height: 0.1 };

async function dropCard(page: Page, buffer: Buffer) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'card.png',
    mimeType: 'image/png',
    buffer,
  });
}

/** Design step -> Prepare, open the erase surface, and drag a rect over it (image fractions).
 *
 *  Two steps are conditional because the Prepare step now SCANS for baked-in text and opens
 *  with a box already drawn when it finds any (eraseRegion.ts proposeEraseRect): on artwork it
 *  reads — the REAL typeset fixture below — the yes/no question is answered by measuring and
 *  never asked, and the proposal has to be dismissed before these cases drag their own
 *  deliberately-off-centre lasso. The bar fixtures carry no stroke edges, so they take neither
 *  branch and behave exactly as before. */
async function eraseRect(page: Page, fx0: number, fy0: number, fx1: number, fy1: number) {
  await page.getByRole('button', { name: 'Next →' }).click();
  const ask = page.getByTestId('baked-yes');
  if (await ask.count()) await ask.click();
  const proposed = page.getByTestId('erase-proposal-dismiss');
  if (await proposed.count()) await proposed.click();
  const surface = page.getByTestId('erase-surface');
  await expect(surface).toBeVisible();
  await expect.poll(async () => (await surface.boundingBox())?.height ?? 0).toBeGreaterThan(100);
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('erase-download')).toBeVisible();
}

/** The seeded field as the design sees it: its own rules, and where it actually renders
 *  inside the artwork (as fractions of the artwork, the space the source rect was given in). */
async function seededField(page: Page) {
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { lineTextStyle } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return {
      style: lineTextStyle(s.template.html, s.template.css, 'f0'),
      lineHeightPinned: /#f0\s*\{[^}]*line-height:\s*1\b/.test(s.template.css),
    };
  });
  const rendered = await page
    .frameLocator('iframe.preview-frame')
    .locator('.imported-design-art')
    .evaluate((art) => {
      const a = art.getBoundingClientRect();
      const f = art.ownerDocument.getElementById('f0')!.getBoundingClientRect();
      return {
        left: (f.left - a.left) / a.width,
        right: (f.right - a.left) / a.width,
        centre: (f.left + f.width / 2 - a.left) / a.width,
        top: (f.top - a.top) / a.height,
        height: f.height / a.height,
      };
    });
  return { ...css, rendered };
}

test('import graphic: centred baked text seeds a CENTRED field on the same centre line', async ({ page }) => {
  await dropCard(page, framedCardPng(1600, 900, { textRect: CENTRED_TEXT }));
  // A lasso with far more air on the left than the right: its own centre is nowhere near
  // the text's, so matching the text can only come from measuring the ink.
  await eraseRect(page, 0.18, 0.34, 0.69, 0.56);
  await createBare(page);

  const f = await seededField(page);
  expect(f.style!.align).toBe('center');
  expect(f.lineHeightPinned).toBe(true);

  const textCentre = CENTRED_TEXT.x + CENTRED_TEXT.width / 2;
  // The replacement sits on the erased text's own centre line…
  expect(f.rendered.centre).toBeCloseTo(textCentre, 2);
  // …at its height, and starting at its top (line-height 1 puts the glyphs just under it).
  expect(f.rendered.height).toBeGreaterThan(CENTRED_TEXT.height * 0.9);
  expect(f.rendered.height).toBeLessThan(CENTRED_TEXT.height * 1.6);
  expect(Math.abs(f.rendered.top - CENTRED_TEXT.y)).toBeLessThan(CENTRED_TEXT.height * 0.35);
  // The slot is the room the original text had, not the room the lasso had.
  expect(f.style!.fontSize!.value).toBeGreaterThan(0);
});

test('import graphic: left-set baked text seeds a LEFT-anchored field on its left edge', async ({ page }) => {
  await dropCard(page, framedCardPng(1600, 900));
  // Again a loose lasso — generous on every side of the bar at CARD_TEXT_RECT.
  await eraseRect(page, 0.12, 0.35, 0.62, 0.6);
  await createBare(page);

  const f = await seededField(page);
  expect(f.style!.align).toBe('left');
  // It starts where the erased text started, and is about as wide as the text was.
  expect(f.rendered.left).toBeCloseTo(CARD_TEXT_RECT.x, 2);
  expect(Math.abs(f.rendered.top - CARD_TEXT_RECT.y)).toBeLessThan(CARD_TEXT_RECT.height * 0.35);
  expect(f.style!.fontSize!.value).toBeGreaterThan(0);
});

test('import graphic: a JPEG or WebP design imports exactly like a PNG', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();

  // Encode the fixture in the browser, so these are real JPEG/WebP bytes, not a PNG wearing
  // another MIME type — the point is that the pipeline decodes the format, not that it
  // trusts a label.
  for (const mime of ['image/jpeg', 'image/webp']) {
    const encoded = await page.evaluate((m) => {
      const c = document.createElement('canvas');
      c.width = 1280;
      c.height = 720;
      const g = c.getContext('2d')!;
      g.fillStyle = '#f2f2ec';
      g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = '#18191e';
      g.fillRect(120, 470, 620, 90);
      const url = c.toDataURL(m, 0.95);
      return { mime: url.slice(5, url.indexOf(';')), base64: url.split(',')[1] };
    }, mime);
    expect(encoded.mime).toBe(mime); // the browser really produced this format

    await page.locator('[data-entry="import-graphic"]').click();
    await page.locator('.wz-drop input[type="file"]').setInputFiles({
      name: `design.${mime === 'image/jpeg' ? 'jpg' : 'webp'}`,
      mimeType: mime,
      buffer: Buffer.from(encoded.base64, 'base64'),
    });

    // Measured and accepted, with no format complaint anywhere on the step.
    await expect(page.locator('.asset-card')).toContainText('1280 × 720');
    await expect(page.locator('.wz-step')).not.toContainText('not an image');
    await page.getByRole('button', { name: '← Back' }).click();
  }
});

test('import graphic: a scaled design still previews, validates, and exports', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await dragHandle(page, 'scale-handle', 130, 74);
  await awaitPreviewRebuild(page);
  const scaled = await composition(page);
  expect(scaled.cssScale).toBeGreaterThan(1);

  // The preview still runs the graphic: play it and the field holds its sample text on the
  // artwork (the composition survived the scale at RUNTIME, not just in the stylesheet).
  await page.getByRole('button', { name: '▶ Play' }).click();
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText('Name');
  await expect(frame.locator('.imported-design-art')).toBeVisible();

  // And it exports: validation passes and the package carries the artwork plus the scale.
  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'SPX export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const css = await zip.file(Object.keys(zip.files).find((n) => n.endsWith('.css'))!)!.async('string');
  expect(css).toContain(`--scale: ${scaled.cssScale}`);
  expect(Object.keys(zip.files).some((n) => /\.png$/.test(n))).toBe(true);
});

// ── The seeded field's numbers, checked against REAL glyphs ───────────────────────────────
//
// Every other erase fixture paints a solid bar, where the measured ink height IS the bar. Real
// type is not a bar: its ink runs from cap top to baseline (plus descenders), a fraction of the
// em the designer actually set. So the two constants the seed rests on — a font size of ink
// ÷ 0.78, and a box top a tenth of an em above the ink — are only meaningful against text that
// was really typeset. This draws some, in the same bundled face the template will use (so the
// test measures the HEURISTIC, not a font mismatch), erases it, and asks what came back.

// Weight 400 because that is what the seeded field emits: recovering a WEIGHT from flattened
// pixels is not something this claims to do, so the fixture doesn't smuggle that question in.
const TYPESET = { text: 'Alexandra Riva', fontPx: 96, weight: 400, penX: 210, baseline: 620 };

test('import graphic: the seed recovers the size and position of REAL typeset text', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();

  // Paint the artwork with actual glyphs, and record where their ink truly landed.
  const source = await page.evaluate(async (s) => {
    const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
    await face.load();
    document.fonts.add(face);
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#15171b';
    g.font = `${s.weight} ${s.fontPx}px Inter`;
    g.textBaseline = 'alphabetic';
    g.fillText(s.text, s.penX, s.baseline);
    const m = g.measureText(s.text);
    return {
      base64: c.toDataURL('image/png').split(',')[1],
      ink: {
        left: s.penX - m.actualBoundingBoxLeft,
        right: s.penX + m.actualBoundingBoxRight,
        top: s.baseline - m.actualBoundingBoxAscent,
        bottom: s.baseline + m.actualBoundingBoxDescent,
      },
    };
  }, TYPESET);

  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'typeset.png',
    mimeType: 'image/png',
    buffer: Buffer.from(source.base64, 'base64'),
  });
  // A deliberately loose lasso: well outside the glyphs on every side.
  await eraseRect(page, 0.09, 0.55, 0.66, 0.76);
  await createBare(page);

  // Give the field the SAME string, so the two ink boxes are comparable.
  await page.evaluate(async (text) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSampleValue('f0', text);
    useTemplateStore.getState().sendControl('update');
  }, TYPESET.text);

  // Where the replacement's glyphs actually render, in the artwork's own pixels. Measured
  // through the font's metrics rather than the element box: the box is the em, the ink is
  // what a reader sees, and the ink is what has to land back on the original.
  const shown = await page
    .frameLocator('iframe.preview-frame')
    .locator('#f0')
    .evaluate(async (el, text) => {
      const doc = el.ownerDocument;
      await doc.fonts.ready;
      const art = doc.querySelector('.imported-design-art')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      const g = doc.createElement('canvas').getContext('2d')!;
      g.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const m = g.measureText(text);
      const size = parseFloat(cs.fontSize);
      // line-height: 1 → the box is one em tall, so the baseline sits half the leading
      // plus the ascent below its top.
      const baseline = r.top + (size - (m.fontBoundingBoxAscent + m.fontBoundingBoxDescent)) / 2 + m.fontBoundingBoxAscent;
      return {
        fontPx: size,
        left: r.left - m.actualBoundingBoxLeft - art.left,
        top: baseline - m.actualBoundingBoxAscent - art.top,
        bottom: baseline + m.actualBoundingBoxDescent - art.top,
      };
    }, TYPESET.text);

  // The artwork is smaller than the frame, so design px are source px — compare directly.
  const sourceInkHeight = source.ink.bottom - source.ink.top;
  // The SEED itself, before the fit runtime has a say: cap-height ÷ 0.72 against type whose
  // cap runs 0.68–0.76 em, so it can never be exact — close enough to tweak, not retype.
  const seeded = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { lineFontSize } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return lineFontSize(s.template.css, 'f0')!.value;
  });
  expect(Math.abs(seeded - TYPESET.fontPx) / TYPESET.fontPx).toBeLessThan(0.08);

  // And what the reader sees: the replacement's ink lands ON the ink that was erased.
  expect(Math.abs(shown.fontPx - TYPESET.fontPx) / TYPESET.fontPx).toBeLessThan(0.08);
  expect(Math.abs(shown.left - source.ink.left)).toBeLessThan(6);
  expect(Math.abs(shown.top - source.ink.top)).toBeLessThan(sourceInkHeight * 0.08);
  expect(Math.abs(shown.bottom - source.ink.bottom)).toBeLessThan(sourceInkHeight * 0.08);
});

test('canvas: any part can be locked from the Inspector, and the rotate handle is not a hand', async ({ page }) => {
  await createImported(page);

  // The Inspector's lock is the GENERAL home for the lock; the artwork's chip padlock is the
  // on-canvas shortcut where the default is surprising. Both read the same state.
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await expect(page.getByTestId('inspector-lock')).toContainText('Locked');
  await expect(page.getByTestId('canvas-lock')).toContainText('Locked');
  await page.getByTestId('inspector-lock').click();
  await expect(page.getByTestId('canvas-lock')).toContainText('Unlocked'); // the chip agreed

  // Locking the WHOLE GRAPHIC gives up its zone drag, so a press over it marquees instead of
  // moving it — which is the point of locking it while placing fields on top. (Selected
  // through the store: on a full-bleed design the root has no timeline row and a canvas click
  // just alternates artwork/design unit, so there is no pointer route to it.)
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSelectedPart('.imported-design');
  });
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Whole graphic');
  await expect(page.getByTestId('inspector-lock')).toContainText('Unlocked');
  await page.getByTestId('inspector-lock').click();
  const before = await writes(page);
  const c = await elementPoint(page, '.imported-design-art', 0.82, 0.2);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x - 70, c.y + 80, { steps: 6 });
  await expect(page.getByTestId('canvas-lasso')).toBeVisible();
  await page.mouse.up();
  expect((await writes(page)).rootRule).toBe(before.rootRule); // the graphic did not move

  // The rotate handle carries a real rotate cursor, not the hand that belongs to panning.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await page.getByTestId('inspector-lock').click(); // f0 locked → no handles at all
  await expect(page.getByTestId('line-size-handle')).toHaveCount(0);
  await page.getByTestId('inspector-lock').click();
  const rotate = page.getByTestId('layer-rotate-handle');
  const cursor = await page.locator('.layer-scale-handle, .canvas-layer').first().evaluate(() => {
    const probe = document.createElement('div');
    probe.className = 'layer-rotate-handle';
    document.body.appendChild(probe);
    const c = getComputedStyle(probe).cursor;
    probe.remove();
    return c;
  });
  expect(cursor).not.toContain('grab');
  expect(cursor).toContain('url(');
  // …and that cursor image really decodes — a malformed data URI would silently fall back.
  const decoded = await page.evaluate(async (css: string) => {
    // The SVG is written without a single parenthesis, so the LAST ')' is url()'s own —
    // everything after it is the hotspot and the fallback keyword.
    const url = css.slice(css.indexOf('url(') + 4, css.lastIndexOf(')')).replace(/^["']|["']$/g, '');
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    return img.naturalWidth;
  }, cursor);
  expect(decoded).toBeGreaterThan(0);
  await expect(rotate).toHaveCount(0); // a placed field keeps its design handle, not rotate
});

/** Every seeded field: its title, its placement and its type size. */
async function seededFields(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, lineTextStyle } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    const placed = placedLines(s.template.html, s.template.css);
    return s.template.fields.map((f) => ({
      id: f.field,
      title: f.title,
      x: placed[`#${f.field}`]?.x ?? null,
      y: placed[`#${f.field}`]?.y ?? null,
      align: lineTextStyle(s.template.html, s.template.css, f.field)?.align ?? null,
      fontSize: lineTextStyle(s.template.html, s.template.css, f.field)?.fontSize?.value ?? null,
    }));
  });
}

test('import graphic: each marked region seeds its own field', async ({ page }) => {
  // Two separate pieces of baked text, at different sizes — a name over a strapline.
  await dropCard(page, framedCardPng(1600, 900, { textRect: { x: 0.12, y: 0.55, width: 0.4, height: 0.09 } }));
  await eraseRect(page, 0.08, 0.5, 0.58, 0.68);
  // The second mark ADDS; it does not replace.
  const surface = page.getByTestId('erase-surface');
  const box = (await surface.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.08, box.y + box.height * 0.72);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.84, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(2);
  await createBare(page);

  // Only ONE of the marks held ink (the fixture paints a single bar), so the region with no
  // text still contributes a field — the user marked it, so they meant something to go there.
  const fields = await seededFields(page);
  expect(fields.map((f) => f.title)).toEqual(['Name', 'Title']);
  expect(fields[0].y).not.toBe(fields[1].y); // each landed on its own region
  expect(fields.every((f) => f.x !== null)).toBe(true);
});

test('import graphic: one region holding two lines seeds a field per line', async ({ page }) => {
  // A name and a title inside ONE marked box — the shape of every lower third — drawn as two
  // bars of different width and height, with a clear gap between them.
  const built = await page.evaluate(async () => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#15171b';
    g.fillRect(200, 520, 620, 84); // the "name"
    g.fillRect(200, 650, 380, 44); // the "title", narrower and smaller
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'two-lines.png',
    mimeType: 'image/png',
    buffer: Buffer.from(built, 'base64'),
  });
  // ONE loose box around BOTH.
  await eraseRect(page, 0.08, 0.53, 0.58, 0.82);
  await expect(page.getByTestId('erase-marks')).toContainText('2 lines');
  await createBare(page);

  const fields = await seededFields(page);
  expect(fields.map((f) => f.title)).toEqual(['Name', 'Title']);
  // Each line kept its OWN geometry: the title sits lower and is set smaller. A single field
  // over the whole region would have averaged both away.
  expect(fields[1].y!).toBeGreaterThan(fields[0].y!);
  expect(fields[1].fontSize!).toBeLessThan(fields[0].fontSize! * 0.8);
  // …and its own left edge and alignment, not the taller line's.
  expect(fields[0].x).toBeCloseTo(200, -1);
  expect(fields[1].x).toBeCloseTo(200, -1);
  expect(fields.map((f) => f.align)).toEqual(['left', 'left']);
});

test('import graphic: a region marked over a graphic seeds text that FITS it', async ({ page }) => {
  // Not every marked region held a line of type — a user marks a logo or an illustration to
  // put editable text there. Its ink is as tall as it is wide, and cap height read off that
  // is type the width could never hold: the fit runtime floors its shrink and then clips, so
  // the field would open showing a fragment of its own name.
  const built = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 1600;
    c.height = 900;
    const g = c.getContext('2d')!;
    g.fillStyle = '#f4f4ef';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#15171b';
    g.fillRect(1150, 300, 260, 260); // a square block — a logo, not a line of text
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'block.png',
    mimeType: 'image/png',
    buffer: Buffer.from(built, 'base64'),
  });
  await eraseRect(page, 0.68, 0.29, 0.92, 0.66);
  await createBare(page);

  const shown = await page
    .frameLocator('iframe.preview-frame')
    .locator('#f0')
    .evaluate((el) => ({
      text: el.textContent,
      overflows: el.scrollWidth > (el.parentElement as HTMLElement).clientWidth + 1,
      fontPx: parseFloat(getComputedStyle(el).fontSize),
    }));
  expect(shown.text).toBe('Name'); // its whole name, not a fragment of it
  expect(shown.overflows).toBe(false);
  expect(shown.fontPx).toBeLessThan(260); // nowhere near the block's own height
});

test('canvas: Escape disarms the text tool WITHOUT throwing away the selection', async ({ page }) => {
  await createImported(page);

  // Both the tool-disarm and the deselect listener want Escape, and they are siblings on
  // `window` — so which one subscribed last used to decide whether the selection survived.
  // Arming the tool BEFORE selecting is the order that lost it.
  await page.keyboard.press('Escape'); // a new field arrives selected; start from nothing
  await page.getByTestId('tool-text').click();
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedParts.length;
  });
  expect(before).toBeGreaterThan(0);

  await page.keyboard.press('Escape');

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    return { tool: s.canvasTool, selected: s.selectedParts.length };
  });
  expect(after.tool).toBe('select'); // the tool was put away…
  expect(after.selected).toBe(before); // …and the selection came through it
});
