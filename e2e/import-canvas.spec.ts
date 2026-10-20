// covers: src/templates/importedDesign/designTypes.ts, src/components/wizard/import/**
// covers: src/blocks/designLayout.ts, src/components/{editorFoundation/EditorFoundation,wizard/steps/FinishStep}.tsx
// covers: src/assets/**
//
// The Import Graphic flow's Prepare and Text steps are driven from the wizard; mapped from
// nowhere until 2026-08, these specs ran only at night and auto-placement broke one unseen.
// covers: src/components/wizard/**, !src/components/wizard/import/**

import { test, expect, type Page } from '@playwright/test';
import { finishIntoNewEditor } from './_create';
import { framedCardPng, CARD_TEXT_RECT } from './_png';
import { editorPreview } from './_frame';

// An imported design's fields (docs/IMPORT_MVP.md): the artwork and the fields placed on it are
// ONE composition, kept together as design-layout CSS, and the Prepare step's erase seeds the
// first fields from the ink it measured.

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
  const rendered = await editorPreview(page)
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
  await finishIntoNewEditor(page);

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
  await finishIntoNewEditor(page);

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
  await finishIntoNewEditor(page);

  // Give the field the SAME string, so the two ink boxes are comparable.
  await page.evaluate(async (text) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSampleValue('f0', text);
    await new Promise((resolve) => setTimeout(resolve));
  }, TYPESET.text);
  await expect(editorPreview(page).locator('#f0')).toHaveText(TYPESET.text);

  // Where the replacement's glyphs actually render, in the artwork's own pixels. Measured
  // through the font's metrics rather than the element box: the box is the em, the ink is
  // what a reader sees, and the ink is what has to land back on the original.
  const shown = await editorPreview(page)
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
  await finishIntoNewEditor(page);

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
  await finishIntoNewEditor(page);

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
  await finishIntoNewEditor(page);

  const shown = await editorPreview(page)
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
