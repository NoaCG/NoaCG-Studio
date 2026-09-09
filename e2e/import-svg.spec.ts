import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { awaitPreviewRebuild } from './_preview';
import { elementPoint } from './_canvas';
import { settleDurableWrites } from './_durable';
import { previewFrame } from './_frame';
import { dropSvg as dropSvg2, intoProduction, untickTextRow, QUIZ_SVG, SCOREBUG_SVG } from './_svg-import';

// The SVG import road, door to export (docs/SVG_IMPORT_PLAN.md P1): a layered
// Illustrator-shaped SVG dropped on the Import door becomes a playable template whose text
// layers are operator fields — the artwork inlined VERBATIM, the typography the designer's.
//
// The fixture (e2e/fixtures/illustrator-lower-third.svg) is deliberately Illustrator-shaped:
// layer names as ids with `_x20_` escapes and the uniquify suffix, data-name carrying the
// original spelling (including a DUPLICATE layer name), one multi-tspan text block, a
// class-based <style>, and two font families — one bundled (Archivo), one not (Neue Machina).

const FIXTURE = fileURLToPath(new URL('fixtures/illustrator-lower-third.svg', import.meta.url));

async function dropSvg(page: Page) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(FIXTURE);
}

/** Drop inline SVG markup as a file (the sanitizer and outlined-text cases author their own). */
async function dropSvgMarkup(page: Page, markup: string, name = 'design.svg') {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(markup),
  });
}

/** Create from wherever the walk stands and land in the editor. */
async function createProject(page: Page) {
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    // 20 s: the modal closes once applyGenerated's cold Prettier format resolves (the same
    // cold-module cost import-graphic.spec.ts documents).
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

test('svg import: the drop is recognised, inventoried, and swaps the walk to the SVG rail', async ({ page }) => {
  await dropSvg(page);

  // The card states what was found — size, text layers, typefaces.
  const card = page.getByTestId('import-svg-card');
  await expect(card).toContainText('960 × 270');
  await expect(page.getByTestId('import-svg-layers')).toContainText('4 text layers');
  await expect(page.getByTestId('import-svg-fonts')).toContainText('Archivo');
  await expect(page.getByTestId('import-svg-fonts')).toContainText('Neue Machina');

  // The rail changed shape: no Prepare, no Place — one mapping step.
  await expect(page.locator('.wz-dot-label')).toHaveText(['Start', 'Design', 'Fields', 'Animation', 'Finish']);

  // The live preview mounts from the drop on — the real template, artwork inlined.
  await expect(page.locator('.wz-side iframe')).toBeVisible();
});

// The export advice has to be AT the drop, not only in /docs (owner, 2026-08-29: "people are
// not going to go into the documentation to get this information"), and ABOVE it (owner walk,
// 2026-09-01: he dragged a file in and continued, never seeing the section that sat under the
// zone). This pins the shape ruled for it - a compact question, one line of summary, the per-app
// menu path behind a press - its POSITION above the drop zone, and that it is still there once an
// SVG is in, which is when "no text layers, re-export" needs it most.
test('svg import: the export rules lead the drop step, above the zone', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();

  const head = page.getByTestId('import-svg-export-why');
  await expect(head).toBeVisible();
  // Asked as a question, in the words someone would ask it in, with the one-line summary beside
  // it (GOALS goal 4).
  await expect(head).toContainText('Need help exporting SVG?');
  await expect(head).toContainText('named layers, live text, one artboard');

  // ABOVE THE DROP ZONE. Geometry, not order in the DOM: the whole defect was that nothing below
  // the target of the gesture gets read.
  const helpBox = (await head.boundingBox())!;
  const dropBox = (await page.locator('.wz-drop').boundingBox())!;
  expect(helpBox.y + helpBox.height).toBeLessThanOrEqual(dropBox.y);

  // Closed by default: nothing on the step reads as a wall of text before it is asked for.
  await expect(page.getByTestId('import-svg-export-why-body')).toBeHidden();

  await head.click();
  const body = page.getByTestId('import-svg-export-why-body');
  await expect(body).toContainText('Name your layers');
  await expect(body).toContainText('Export As');
  await expect(body).toContainText('Outline text');
  await expect(body).toContainText('Plain SVG');

  // Still offered once the file is in: a file with no live text is exactly the person who
  // needs the Illustrator setting named.
  await page.locator('.wz-drop input[type="file"]').setInputFiles(FIXTURE);
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await expect(page.getByTestId('import-svg-export-why')).toBeVisible();
});

test('svg import: mapping — labels from layer names, all on by default, edits carried to the template', async ({ page }) => {
  await dropSvg(page);
  await page.locator('.wz-next').click();

  // Labels prefill from the layer names: data-name beats the uniquified id ("Title"), an
  // Illustrator-escaped id decodes, a tspan uses its own id, and an unnamed tspan falls back
  // to the nearest named ancestor — here the DUPLICATED "Text Layer" group name.
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Name');
  await expect(page.getByTestId('map-svg-title-t1')).toHaveValue('Title');
  await expect(page.getByTestId('map-svg-title-t2')).toHaveValue('Location');
  await expect(page.getByTestId('map-svg-title-t3')).toHaveValue('Text Layer');
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Alexandra Riva');

  // No naming ritual: every detected text is ON.
  for (const id of ['t0', 't1', 't2', 't3']) {
    await expect(page.getByTestId(`map-svg-row-${id}`).locator('input[type=checkbox]')).toBeChecked();
  }

  // Hovering a row highlights the exact text it binds — on the PREVIEW, the step's one canvas.
  await page.getByTestId('map-svg-row-t1').hover();
  await expect(page.getByTestId('wz-preview-highlight')).toBeVisible();

  // The typefaces resolve honestly: the bundled match ships, the unknown face warns.
  await expect(page.getByTestId('map-svg-font-Archivo')).toContainText('Bundled');
  await expect(page.getByTestId('map-svg-font-warn-Neue Machina')).toBeVisible();

  // Edit the mapping: drop the clock layer, rename + retype the location.
  await untickTextRow(page, 't3');
  await page.getByTestId('map-svg-title-t2').fill('City');
  await page.getByTestId('map-svg-sample-t2').fill('Tampere');

  await createProject(page);

  // The created template: three fields (the clock stayed as drawn), the edited label and
  // sample carried, ids bound in place inside the verbatim SVG.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields.map((f) => `${f.field}:${f.title}`),
      html: t.html,
      css: t.css,
    };
  });
  expect(state.fields).toEqual(['f0:Name', 'f1:Title', 'f2:City']);
  // Bound in place: the SVG's own text nodes carry the ids; the markers are gone; the
  // artwork itself (the backplate the designer drew) survives verbatim.
  expect(state.html).toContain('<svg');
  expect(state.html).toMatch(/<text[^>]*id="f0"/);
  expect(state.html).toMatch(/<tspan[^>]*id="f2"/);
  expect(state.html).not.toContain('data-noacg-candidate');
  expect(state.html).toContain('<rect x="40" y="60" width="880" height="150" rx="10" fill="#10131a"');
  // The clock tspan kept its text and gained no id.
  expect(state.html).toContain('>22:40</tspan>');
  // Fonts: the bundled match ships as @font-face; the unresolved family is stated, not hidden.
  expect(state.css).toContain('fonts/archivo');
  expect(state.css).toContain('UNRESOLVED FONT');
  expect(state.css).toContain('Neue Machina');

  // The graphic actually renders the mapped values, and update() drives the SVG's own nodes.
  const frame = previewFrame(page);
  await expect(frame.locator('#f2')).toHaveText('Tampere');
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.panel-body .field-row', { hasText: 'Name' }).locator('input').first().fill('Miriam Holm');
  await page.getByTestId('dock-body-right').getByRole('button', { name: '⟳ Update' }).click();
  await expect(frame.locator('#f0')).toHaveText('Miriam Holm');
});

test('svg import: overflow-only text fit — a long value shrinks, a short one stays exact', async ({ page }) => {
  await dropSvg(page);
  await createProject(page);

  const frame = previewFrame(page);
  const name = frame.locator('#f0');
  await expect(name).toHaveText('Alexandra Riva');
  // The design's own text is untouched: nothing is applied to a value that fits.
  const drawnSize = await name.evaluate((el) => getComputedStyle(el).fontSize);

  // A much longer name overflows the budget — and the answer is a SMALLER line of the
  // designer's own type, never a squeezed one: condensing to the drawn width distorted
  // tracking and glyph shapes, so one extra letter visibly broke the typeface.
  await page.getByTestId('dock-tab-data').click();
  const nameInput = page.locator('.panel-body .field-row', { hasText: 'Name' }).locator('input').first();
  const pushUpdate = () => page.getByTestId('dock-body-right').getByRole('button', { name: '⟳ Update' }).click();
  await nameInput.fill('Alexandra Konstantinopolous-Riva de la Vega');
  await pushUpdate();
  const fitted = await name.evaluate((el) => {
    const node = el as unknown as SVGTextContentElement;
    return {
      size: parseFloat(getComputedStyle(node).fontSize),
      length: node.getComputedTextLength(),
      textLength: node.getAttribute('textLength'),
    };
  });
  expect(fitted.size).toBeLessThan(parseFloat(drawnSize));
  expect(fitted.textLength).toBeNull();
  // …and it fits THE ROOM THE DESIGN GIVES IT — the panel it was drawn in, not the width of the
  // designer's own words, which would leave most of a banner empty and shrink anyway.
  const room = await name.evaluate(
    () => (window as unknown as { svgFitRoom: Record<string, { width: number }> }).svgFitRoom.f0.width,
  );
  expect(fitted.length).toBeLessThanOrEqual(room + 1);

  // Back to a short value: the fit steps away and the typography is the designer's again.
  await nameInput.fill('Riva');
  await pushUpdate();
  await expect(name).toHaveCSS('font-size', drawnSize);
});

test('svg import: sanitizer — script, handlers, foreignObject, SMIL and network refs never reach the template', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <script>alert('never')</script>
      <foreignObject x="0" y="0" width="100" height="100"><div>html</div></foreignObject>
      <rect x="0" y="0" width="400" height="200" fill="#111" onload="alert('never')"/>
      <image href="https://evil.example/logo.png" x="0" y="0" width="50" height="50"/>
      <text id="Headline" x="20" y="100" font-size="30" fill="#fff">Breaking
        <animate attributeName="opacity" values="0;1" dur="1s" repeatCount="indefinite"/>
      </text>
    </svg>`,
  );

  // The import says what it removed rather than silently altering the file.
  const card = page.getByTestId('import-svg-card');
  await expect(card).toContainText('Script code inside the SVG was removed');
  await expect(card).toContainText('foreignObject block was removed');
  await expect(card).toContainText('SVG-native (SMIL) animation was removed');
  await expect(card).toContainText('References to files on the internet were removed');

  await createProject(page);

  const verdict = await page.evaluate(async () => {
    const [{ useTemplateStore }, { validateTemplate }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    const v = validateTemplate(t);
    return { html: t.html, ok: v.ok, errors: v.errors.map((e) => e.rule) };
  });
  const svgMarkup = verdict.html.match(/<svg[\s\S]*?<\/svg>/i)![0];
  expect(svgMarkup).not.toContain('<script');
  expect(svgMarkup).not.toContain('foreignObject');
  expect(svgMarkup).not.toContain('onload');
  expect(svgMarkup).not.toContain('evil.example');
  expect(svgMarkup).not.toContain('<animate');
  // …and the export gate agrees (its own SVG checks re-verify what the importer stripped).
  expect(verdict.errors).toEqual([]);
  expect(verdict.ok).toBe(true);
});

test('svg import: outlined text gets the honest answer, and still imports as a fixed graphic', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <path d="M10 10 L390 10 L390 190 L10 190 Z" fill="#161a22"/>
      <path d="M40 90 l40 0 l0 30 l-40 0 Z" fill="#fff"/>
    </svg>`,
    'outlined.svg',
  );

  await expect(page.getByTestId('import-svg-nolayers')).toContainText('turned into outlines');
  await page.locator('.wz-next').click();

  // The mapping step names the fix — re-export with real text — rather than a dead checklist.
  const honest = page.getByTestId('map-svg-outlined');
  await expect(honest).toContainText('no text layers');
  await expect(honest).toContainText('export again keeping text as text');
  await expect(honest).toContainText('fixed graphic');

  // A fixed graphic is still a playable import.
  await createProject(page);
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.length;
  });
  expect(fields).toBe(0);
});

test('svg import: bound text and top-level groups are registry parts — selectable and animatable', async ({ page }) => {
  await dropSvg(page);
  await createProject(page);

  // The part registry (model/structure.ts) names the SVG's own layers: the bound text nodes
  // as lines (channel 'rise' — SVG text has no mask to slide in), and the top-level named
  // groups as blocks, labelled with the same words the mapping step used (data-name over the
  // decoded id — both "Text Layer" groups carry their duplicated design name honestly).
  const parts = await page.evaluate(async () => {
    const [{ getTemplateParts }, { useTemplateStore }] = await Promise.all([
      import('/src/model/structure.ts'),
      import('/src/store/templateStore.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    return getTemplateParts(t.html, t.fields).map((p) => `${p.selector}|${p.kind}|${p.label}|${p.channel}`);
  });
  expect(parts).toContain('#f0|line|Name|rise');
  expect(parts).toContain('#f2|line|Location|rise');
  expect(parts).toContain('#Backplate|block|Backplate|rise');
  expect(parts).toContain('#Details|block|Text Layer|rise');
  // The whole-unit parts are still there — the design presets animate the box, as before.
  expect(parts).toContain('.imported-design-box|panel|Design|rise');
  expect(parts).toContain('.imported-design-art|image|Artwork|rise');

  // A canvas click on the text selects THAT layer (the innermost part wins over the groups
  // and the artwork around it), and the chip speaks the field's name.
  const point = await elementPoint(page, '#f0');
  await page.mouse.click(point.x, point.y);
  await expect(page.getByTestId('selection-chip')).toContainText('Name');

  // Its timeline row exists too — per-layer motion (the P2 stagger) has a real target.
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toBeVisible();
});

test('svg import: a picture layer binds as a filelist field — swap by value, empty restores the artwork', async ({ page }) => {
  await dropSvg(page);
  await page.locator('.wz-next').click();

  // Pictures are offered OFF by default — inside a design they are usually the artwork.
  const row = page.getByTestId('map-svg-image-i0');
  await expect(page.getByTestId('map-svg-image-title-i0')).toHaveValue('Crest');
  await expect(row.locator('input[type=checkbox]')).not.toBeChecked();
  await row.locator('input[type=checkbox]').check();

  await createProject(page);

  // The picture field lands AFTER the text fields, as a real SPX filelist.
  const field = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    const f = t.fields[4];
    return { ...f, bound: /<image[^>]*id="f4"/.test(t.html) };
  });
  expect(field.ftype).toBe('filelist');
  expect(field.title).toBe('Crest');
  expect(field.bound).toBe(true);

  // update() swaps the node's href; an empty value restores the picture the designer drew.
  const frame = previewFrame(page);
  // A 1×1 green pixel — any PNG that is NOT the one the fixture draws, so the swap is visible.
  const SWAPPED = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  await frame.locator('body').evaluate((_, swapped) => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f4: swapped }));
  }, SWAPPED);
  await expect(frame.locator('#f4')).toHaveAttribute('href', SWAPPED);
  await frame.locator('body').evaluate(() => {
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f4: '' }));
  });
  // Back to the fixture's own pixel — the transparent one every placeholder in the repo uses.
  await expect(frame.locator('#f4')).toHaveAttribute('href', /^data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNg/);
});

test('svg import: the f: layer-name prefix names a field without switching the others off', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="f_x3A_Name" x="20" y="80" font-size="30" fill="#fff">Alexandra Riva</text>
      <text id="Watermark" x="20" y="180" font-size="10" fill="#666">station ident</text>
    </svg>`,
    'prefixed.svg',
  );
  await page.locator('.wz-next').click();

  // The prefix names the field (it is stripped from the label) and guarantees it is on. It is
  // NOT a filter: one layer exported as `f:Name` used to turn every unmarked text OFF, which
  // read as detection having missed them — the owner's first walk found six of seven rows
  // unticked on a scorebug whose only marked layer was the competition strap. Unticking one
  // row costs a click; finding six that were never offered costs the feature.
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Name');
  await expect(page.getByTestId('map-svg-row-t0').locator('input[type=checkbox]')).toBeChecked();
  await expect(page.getByTestId('map-svg-row-t1').locator('input[type=checkbox]')).toBeChecked();
});

test('svg import: the static: prefix says a text layer is DRAWING, and its words stay drawn', async ({ page }) => {
  // The opposite of `f:`, and the answer to the numerals trap: a top ten's ranks and a bingo
  // grid's numbers are furniture a student typed, and every one of them used to arrive as a
  // ticked field to untick, two clicks each
  // (docs/backlog/decorative-numerals-arrive-as-fields.md). The row is still OFFERED - unticked,
  // words kept - because the one numeral that really is a field is then a single click away.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200">
      <text id="static_x3A_Rank" data-name="static:Rank" x="20" y="60" font-size="30" fill="#8a8f98">10.</text>
      <text id="Item" x="90" y="60" font-size="30" fill="#fff">The buzzer is a kazoo</text>
    </svg>`,
    'ranked.svg',
  );
  await page.locator('.wz-next').click();

  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Rank');
  await expect(page.getByTestId('map-svg-row-t0').locator('input[type=checkbox]')).not.toBeChecked();
  await expect(page.getByTestId('map-svg-off-t0')).toHaveText('stays as drawn');
  await expect(page.getByTestId('map-svg-row-t1').locator('input[type=checkbox]')).toBeChecked();

  await createProject(page);

  // ONE field, and the numeral is still on the artwork: drawn, unbound, its words intact.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { fields: t.fields.map((f) => `${f.field}:${f.title}`), html: t.html };
  });
  expect(state.fields).toEqual(['f0:Item']);
  // Matched across the formatter's line breaks: the emitted template is Prettier-printed, so a
  // <text> with several attributes has its words on their own line.
  expect(state.html).toMatch(/<text\b[^>]*data-name="static:Rank"[^>]*>\s*10\.\s*<\/text>/);
  expect(state.html).not.toMatch(/<text[^>]*id="f1"/);
});

test('svg import: a layer named after its own words keeps that name unless the group names it alone', async ({ page }) => {
  // Figma auto-names every text layer after the words in it, so climbing to the group above is
  // right there - and wrong for a designer who deliberately named a slot after its placeholder
  // (docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md). The evidence is how
  // many text layers the group holds: exactly one, and the group's name is that layer's name;
  // several, and a group of slots cannot be the name of one of them.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300">
      <g id="Answer A"><text id="Amsterdam" x="20" y="60" font-size="30" fill="#fff">Amsterdam</text></g>
      <g id="Words">
        <text id="Champion" x="20" y="140" font-size="30" fill="#fff">Champion</text>
        <text id="Runner_x20_up" data-name="Runner up" x="20" y="220" font-size="30" fill="#fff">Espoo Eagles</text>
      </g>
    </svg>`,
    'own-copy.svg',
  );
  await page.locator('.wz-next').click();

  // The Figma shape: the wrapper holds this text and nothing else, so its name is the label -
  // and the row says out loud why it is not called "Amsterdam".
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Answer A');
  await expect(page.getByTestId('map-svg-named-by-group-t0')).toBeVisible();

  // The bracket shape: "Words" holds two slots, so "Champion" keeps the name its author typed.
  await expect(page.getByTestId('map-svg-title-t1')).toHaveValue('Champion');
  await expect(page.getByTestId('map-svg-named-by-group-t1')).toHaveCount(0);

  // Untouched by any of it: a layer whose name is not its own words.
  await expect(page.getByTestId('map-svg-title-t2')).toHaveValue('Runner up');
});

test('svg import: kerning a Figma text layer does not turn its wrapper into a group of many', async ({ page }) => {
  // The evidence is TEXT LAYERS, not candidate rows, and one <text> can raise several rows: two
  // labels far apart on one baseline are two fields (see the kerned-headline case above). Counting
  // rows would read this wrapper as holding two layers, refuse the climb, and label both boxes
  // "HelsinkiLive" - the very Figma defect the climb exists to prevent, brought back by kerning.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
      <g id="Venue"><text id="HelsinkiLive" font-size="24" fill="#fff"><tspan x="40" y="120">Helsinki</tspan><tspan x="300" y="120">Live</tspan></text></g>
    </svg>`,
    'kerned-figma.svg',
  );
  await page.locator('.wz-next').click();

  // Two rows out of one text layer, and the group still names them both.
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Helsinki');
  await expect(page.getByTestId('map-svg-sample-t1')).toHaveValue('Live');
  // The <text> is named after its own words (Figma's default), so the wrapper names it - and it
  // is ONE layer however many runs the kerning left, so the wrapper's name still wins.
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Venue');
  await expect(page.getByTestId('map-svg-title-t1')).toHaveValue('Venue 2');
  await expect(page.getByTestId('map-svg-named-by-group-t0')).toBeVisible();
});

test('svg import: an Inkscape file is labelled by its layer names, not its serial ids', async ({ page }) => {
  // Illustrator and Figma write the layer's NAME into `id`; Inkscape writes a serial number
  // there ("text123") and keeps the name in `inkscape:label`. Read the id first and every row
  // reads "text123" — the one word the designer chose, on the layer ABOVE, never surfaces.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape" viewBox="0 0 400 200">
      <g inkscape:groupmode="layer" id="layer1" inkscape:label="Presenter name">
        <text id="text123" x="20" y="80" font-size="30" fill="#fff"><tspan id="tspan124" x="20" y="80">Alexandra Riva</tspan></text>
      </g>
      <g inkscape:groupmode="layer" id="layer2" inkscape:label="Role">
        <text id="text125" x="20" y="140" font-size="18" fill="#b7bcc4">Chief Correspondent</text>
      </g>
    </svg>`,
    'inkscape.svg',
  );
  await page.locator('.wz-next').click();

  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Presenter name');
  await expect(page.getByTestId('map-svg-title-t1')).toHaveValue('Role');
});

test('svg import: text a designer switched off, or parked in a symbol, is never offered as a field', async ({ page }) => {
  // Two ways a file carries copy nobody can see: a HIDDEN layer (a draft the designer turned
  // off, exported as display:none) and a DEFINITION (<symbol>/<defs>, which paints only where
  // a <use> copies it — so binding the original by id is not a promise this import can keep).
  // Both used to arrive as operator fields for invisible text.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <defs><symbol id="Badge"><text id="In_x20_symbol" x="0" y="0">Never shown</text></symbol></defs>
      <g id="Old_x20_draft" style="display:none"><text id="Draft_x20_copy" x="20" y="40">Draft copy</text></g>
      <g id="Retired" display="none"><text id="Retired_x20_line" x="20" y="60">Retired line</text></g>
      <use href="#Badge" x="300" y="20"/>
      <text id="Headline" x="20" y="120" font-size="30" fill="#fff">Alexandra Riva</text>
    </svg>`,
    'hidden-layers.svg',
  );

  await expect(page.getByTestId('import-svg-layers')).toContainText('1 text layer');
  // The symbol's text is DRAWN by the <use> below it, so the file says why it is not a field —
  // silence there reads as a layer the import simply missed.
  await expect(page.getByTestId('import-svg-card')).toContainText('reusable symbol');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Headline');
  await expect(page.getByTestId('map-svg-row-t1')).toHaveCount(0);
});

test('svg import: a kerned headline is ONE field, and two labels on one baseline are two', async ({ page }) => {
  // A <tspan> means two different things. Illustrator writes one per LINE for a multi-line
  // block, and one per KERNED RUN whenever the type carries tracking - several on one baseline.
  // The run reading turned this headline into three fields ("A" / "lexandra" / " Riva"); the
  // baseline reading merged the two placed labels below it into one. The gap tells them apart.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
      <text id="Headline" font-size="48" fill="#fff"><tspan x="40" y="120">A</tspan><tspan x="78" y="120">lexandra</tspan><tspan x="240" y="120"> Riva</tspan></text>
      <text id="Footnote" font-size="18" fill="#b7bcc4"><tspan x="40" y="200">Helsinki</tspan><tspan x="300" y="200">Live</tspan></text>
    </svg>`,
    'kerned.svg',
  );

  await expect(page.getByTestId('import-svg-layers')).toContainText('3 text layers');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Alexandra Riva');
  await expect(page.getByTestId('map-svg-sample-t1')).toHaveValue('Helsinki');
  await expect(page.getByTestId('map-svg-sample-t2')).toHaveValue('Live');
  await expect(page.getByTestId('map-svg-row-t3')).toHaveCount(0);

  // AND THE MERGED FIELD KEEPS ITS PLACE. Illustrator put the position on the RUNS, so the
  // <text> this field binds had no x and no y of its own: the first write replaced the runs
  // and the headline snapped to the SVG origin, off the panel — a field that changed nothing
  // anybody could see. The run's position is hoisted onto the text at import.
  const headline = page.getByTestId('map-svg-stage').locator('[data-noacg-candidate="t0"]');
  await expect(headline).toHaveAttribute('x', '40');
  await expect(headline).toHaveAttribute('y', '120');
  // Judged where the reader judges it — in the preview, running the real update(). Measured
  // AGAINST THE FOOTNOTE drawn at the same x, so the entrance animation (which moves the whole
  // box) cancels out and what is left is the headline's own place inside the artwork.
  const offsetFromFootnote = async () => {
    const frame = page.frameLocator('.wz-side iframe');
    const [a, b] = await Promise.all([frame.locator('#f0').boundingBox(), frame.locator('#f1').boundingBox()]);
    return { x: a!.x - b!.x, y: a!.y - b!.y };
  };
  await expect(page.frameLocator('.wz-side iframe').locator('#f0')).toHaveText('Alexandra Riva');
  const drawnAt = await offsetFromFootnote();
  await page.getByTestId('map-svg-sample-t0').fill('Mika Virtanen');
  await expect(page.frameLocator('.wz-side iframe').locator('#f0')).toHaveText('Mika Virtanen');
  await expect.poll(async () => Math.abs((await offsetFromFootnote()).x - drawnAt.x)).toBeLessThan(1);
  // The baseline is the same; the box top can differ by a glyph's ascender between two words.
  expect(Math.abs((await offsetFromFootnote()).y - drawnAt.y)).toBeLessThan(4);
});

// ── ONE SEMANTIC ITEM, ONE FIELD (owner, 2026-09-01) ────────────────────────────────────
// The owner imported this board and got THREE question fields, one per visual line: "a semantic
// text item such as a question should normally remain one field, with NoaCG handling wrapping,
// resizing or layout adaptation". The file is the Illustrator idiom for it - one <text> whose
// question was typed with two hard returns, so the export wrote three tspans on the same x with
// the leading baked into y. Kerned runs, which are byte-identical apart from y NOT varying, are
// the case right above this one and still read as one line.
const MULTILINE_QUIZ = readFileSync(
  fileURLToPath(new URL('fixtures/svg-corpus/illustrator-quiz-board-multiline.svg', import.meta.url)),
  'utf8',
);

test('svg import: a question typed with hard returns is ONE field that NoaCG wraps', async ({ page }) => {
  await dropSvgMarkup(page, MULTILINE_QUIZ, 'quiz-board-multiline.svg');
  await expect(page.getByTestId('import-svg-layers')).toContainText('5 text layers');
  await page.locator('.wz-next').click();

  // One row for the question, holding the whole of it - the two Returns are spaces, because a
  // break is where the words happened to fall at the size the design app was showing.
  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Question');
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue(
    'Which Finnish city hosted the 1952 Summer Olympics, and in which month did they open?',
  );
  await expect(page.getByTestId('map-svg-row-t5')).toHaveCount(0);
  await createProject(page);

  const state = await previewFrame(page)
    .locator('#f0')
    .evaluate((el) => {
      const w = window as unknown as {
        update: (json: string) => void;
        svgFitSizes: Record<string, number>;
        noacgTextOverflow: () => string[];
      };
      // Everything in SCREEN px, so the block and the card behind it are in one space: a <text>
      // carrying its position in a transform answers getBBox() in a space of its own.
      const read = () => {
        const kids = el.children;
        const parts: string[] = [];
        for (let i = 0; i < kids.length; i++) parts.push(kids[i].textContent ?? '');
        const box = el.getBoundingClientRect();
        const card = document.getElementById('Question_x20_card')!.getBoundingClientRect();
        return {
          lines: kids.length || 1,
          value: kids.length ? parts.join(' ') : el.textContent,
          size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
          fills: box.width / card.width,
          inside: box.bottom <= card.bottom + 0.5 && box.right <= card.right + 0.5,
          over: w.noacgTextOverflow(),
        };
      };
      const drawn = read();
      w.update(JSON.stringify({ f0: 'Which city hosted the 1952 Olympics?' }));
      return { drawn, short: read() };
    });

  // AS DRAWN: the whole question is still on the board, wrapped by the runtime into the room the
  // card gives it, AT THE SIZE THE DESIGNER SET, and inside the card on both axes. Shrinking is
  // the rung after wrapping, so a question that had to get smaller to fit a card it was drawn
  // inside means the room, not the copy, was measured wrong.
  expect(state.drawn.value).toBe(
    'Which Finnish city hosted the 1952 Summer Olympics, and in which month did they open?',
  );
  expect(state.drawn.lines).toBeGreaterThan(1);
  expect(state.drawn.size).toBe(52);
  expect(state.drawn.over).toEqual([]);
  expect(state.drawn.inside).toBe(true);
  // AND IT FILLS THE CARD: a block that wrapped early sits in a narrow column with the card
  // empty beside it, which is what the operator sees as a question wasting its area.
  expect(state.drawn.fills).toBeGreaterThan(0.8);

  // AND ONE OPERATOR WRITE REPLACES THE WHOLE QUESTION - the failure the three fields were:
  // typing into one of them left the other two lines of the old question on air.
  expect(state.short.value).toBe('Which city hosted the 1952 Olympics?');
  expect(state.short.lines).toBe(1);
});

// ── AN INKSCAPE FILE KEEPS ITS TYPE (measured 2026-09-01) ───────────────────────────────
// Inkscape puts EVERY declaration inline - `style="font-size:56px;font-family:Archivo;fill:…"`
// on each <text>, and nothing in a <style> block - which two things downstream then destroyed:
//
//   - a graphic resets by clearing its inline styles (`noacgResetGraphic`, clearProps 'all'),
//     so the moment the editor parked this design its three layers, drawn at 56, 30 and 22px,
//     all painted at the browser's default 16 in the fallback face;
//   - and `xml:space="preserve"`, which Inkscape writes on every text it has ever saved, made
//     the emitted template's own INDENTATION into text the ladder measured: a 22px strap
//     reported 624 units of drawn width against its real 152, and the 56px name reported more
//     than the panel is wide - so nothing contained it, it measured no room, the panel grew to
//     its cap at rest and the name shrank to the floor.
//
// The exporter sweep had passed this file as clean, because nothing had ever looked at the type
// it rendered. Both fixes are at the import: declarations move onto classes, and the idle
// attribute is dropped where it is doing nothing.
test('svg import: an Inkscape design keeps the type it was drawn in', async ({ page }) => {
  const svg = readFileSync(
    fileURLToPath(new URL('fixtures/svg-corpus/inkscape-lower-third-layers.svg', import.meta.url)),
    'utf8',
  );
  await dropSvgMarkup(page, svg, 'inkscape-lower-third.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  const state = await previewFrame(page)
    .locator('#f0')
    .evaluate(() => {
      const w = window as unknown as {
        update: (json: string) => void;
        refitSvgText: () => void;
        noacgTextOverflow: () => string[];
      };
      const read = (id: string) => {
        const n = document.getElementById(id)!;
        const css = getComputedStyle(n);
        return {
          size: Math.round(parseFloat(css.fontSize) * 10) / 10,
          family: css.fontFamily.replace(/["']/g, '').split(',')[0],
          fill: css.fill,
          lines: n.children.length || 1,
          width: Math.round((n as unknown as SVGTextContentElement).getComputedTextLength()),
          moved: n.getAttribute('transform'),
        };
      };
      const panel = () => Math.round(document.getElementById('rect234')!.getBoundingClientRect().height);
      const rest = { z: read('f0'), f1: read('f1'), f2: read('f2'), panel: panel(), over: w.noacgTextOverflow() };
      w.update(JSON.stringify({ f2: 'OPPILAS-TV JA OPISKELIJARADIO HELSINGIN YLIOPISTOSTA' }));
      const widened = { strap: read('f2'), panel: panel() };
      w.update(
        JSON.stringify({
          f2: 'OPPILAS-TV JA OPISKELIJARADIO HELSINGIN YLIOPISTOSTA JOKA ARKIPAIVA AAMUSTA ILTAAN LAHETYKSESSA JA VERKOSSA KAIKILLE KUUNTELIJOILLE YMPARI MAAN',
        }),
      );
      return { rest: { ...rest, f0: rest.z }, widened, wrapped: read('f2'), over: w.noacgTextOverflow() };
    });

  // The type is the designer's, after the editor has parked the graphic - which is a snap, and a
  // snap clears every inline style on the artwork.
  expect(state.rest.f0).toMatchObject({ size: 56, family: 'Archivo' });
  expect(state.rest.f1).toMatchObject({ size: 30, family: 'Inter' });
  expect(state.rest.f2).toMatchObject({ size: 22, family: 'Inter' });
  expect(state.rest.f0.fill).toBe('rgb(255, 255, 255)');

  // AND THE DESIGN IS AT REST: a name that measures its own indentation is wider than the panel
  // it sits in, which made the panel grow to its cap and the name shrink before anybody typed.
  expect(state.rest.f0.width).toBeLessThan(500);
  expect(state.rest.panel).toBe(190);
  expect(state.rest.f0.moved).toBeNull();
  expect(state.rest.over).toEqual([]);

  // THE BOTTOM LINE ANSWERS THE LADDER LIKE ANY OTHER, in the ratified order. The owner read it
  // as "the third field does not wrap": it does not, for as long as widening the panel is still
  // answering the value, because widening comes first and shrinking comes last. Past the width
  // the frame's margin allows, it wraps - at the size the designer drew, and it is not reported
  // as too long.
  expect(state.widened.strap).toMatchObject({ size: 22, lines: 1 });
  expect(state.widened.panel).toBe(190);
  expect(state.wrapped.size).toBe(22);
  expect(state.wrapped.lines).toBeGreaterThan(1);
  expect(state.over).toEqual([]);
});

test('svg import: a wrapping block keeps the LEADING the designer set', async ({ page }) => {
  // The runtime repaints a block the first time the ladder runs, so whatever step it paints at
  // IS the design from then on. Painted at a constant 1.2em it would be a design nobody drew:
  // this card's standfirst is 30px type on 50px steps, which a constant tightens to 36 - the
  // lines close up and the block's foot lifts off the place it was drawn in.
  const svg = readFileSync(
    fileURLToPath(new URL('../docs/svg-samples/info-card.svg', import.meta.url)),
    'utf8',
  );
  await dropSvgMarkup(page, svg, 'info-card.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-title-t2')).toHaveValue('Body');
  await createProject(page);

  const step = await previewFrame(page)
    .locator('#f2')
    .evaluate((el) => {
      const kids = el.children;
      return {
        lines: kids.length,
        dy: kids.length > 1 ? parseFloat(kids[1].getAttribute('dy') ?? '0') : 0,
        size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
      };
    });
  expect(step.size).toBe(30);
  expect(step.lines).toBeGreaterThan(1);
  expect(step.dy).toBeCloseTo(50, 0);
});

test('svg import: layer names that repeat are numbered, so no two fields read the same', async ({ page }) => {
  // A layer name is a designer's private note; it becomes an OPERATOR'S label. Three rows
  // reading "Name" is a control page nobody can use without clicking each one.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240">
      <g id="Name"><text x="20" y="60" font-size="24" fill="#fff">Alexandra Riva</text></g>
      <g id="Name" data-name="Name"><text x="20" y="110" font-size="24" fill="#fff">Jonas Berg</text></g>
      <g id="Role"><text x="20" y="160" font-size="18" fill="#b7bcc4">Correspondent</text></g>
    </svg>`,
    'repeated-names.svg',
  );
  await page.locator('.wz-next').click();

  await expect(page.getByTestId('map-svg-title-t0')).toHaveValue('Name');
  await expect(page.getByTestId('map-svg-title-t1')).toHaveValue('Name 2');
  // A name that appears once is left exactly as the designer wrote it.
  await expect(page.getByTestId('map-svg-title-t2')).toHaveValue('Role');
});

test('svg import: text on a path binds the path run, and keeps its curve when an operator types', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <defs><path id="curve" d="M20 150 Q200 40 380 150"/></defs>
      <text id="Arc" font-size="24" fill="#fff"><textPath href="#curve">Around the bend</textPath></text>
    </svg>`,
    'text-on-path.svg',
  );
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Around the bend');
  await createProject(page);

  // The field id is on the <textPath>, not the <text>: update() writes textContent, and writing
  // it on the <text> would REPLACE the textPath element — the first typed word would straighten
  // the curve the designer drew. The check is the live document, after an update.
  const shape = await page.evaluate(async () => {
    const [{ useTemplateStore }, { validateTemplate }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    const doc = new DOMParser().parseFromString(t.html, 'text/html');
    const bound = doc.getElementById('f0');
    return {
      tag: bound?.tagName.toLowerCase() ?? null,
      href: bound?.getAttribute('href') ?? null,
      errors: validateTemplate(t).errors.map((e) => e.rule),
    };
  });
  expect(shape.tag).toBe('textpath');
  expect(shape.href).toBe('#curve');
  // …and the export gate reads that binding as bound (rule 'svg-binding' checks the id exists).
  expect(shape.errors).toEqual([]);
});

test('svg import: a wrapped source line becomes one clean sample, unless the file preserved it', async ({ page }) => {
  // A pretty-printed export wraps a long line across several SOURCE lines. The renderer
  // collapses that whitespace and nothing on screen shows it — but the raw text becomes the
  // FIELD'S DEFAULT VALUE, where a run of newlines and indentation is real.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Body" x="20" y="80" font-size="20" fill="#fff">
        Breaking news from
        the capital
      </text>
      <text id="Spaced" xml:space="preserve" x="20" y="140" font-size="20" fill="#fff">A   B</text>
    </svg>`,
    'wrapped-source.svg',
  );
  await page.locator('.wz-next').click();

  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('Breaking news from the capital');
  // …and a file that asked for its spacing to be literal keeps it.
  await expect(page.getByTestId('map-svg-sample-t1')).toHaveValue('A   B');
});

test('svg import: a PostScript font name finds the bundled face, and ships under its own name', async ({ page }) => {
  // Illustrator writes PostScript names, so a file set in Archivo Bold asks for "Archivo-Bold".
  // Matched literally that finds nothing, and the graphic goes to air in a substitute face.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Name" x="20" y="90" font-size="34" font-family="Archivo-Bold" fill="#fff">Alexandra Riva</text>
      <text id="Role" x="20" y="140" font-size="20" font-family="JetBrainsMono-Regular" fill="#b7bcc4">Correspondent</text>
    </svg>`,
    'postscript-fonts.svg',
  );
  await page.locator('.wz-next').click();

  // Both rows resolve, and each says WHICH bundled face it is — the design never mentions
  // "Archivo" anywhere, so a bare tick would be a claim the reader cannot check.
  await expect(page.getByTestId('map-svg-font-ok-Archivo-Bold')).toContainText('(Archivo)');
  await expect(page.getByTestId('map-svg-font-ok-JetBrainsMono-Regular')).toContainText('(JetBrains Mono)');
  await expect(page.getByTestId('map-svg-font-warn-Archivo-Bold')).toHaveCount(0);

  await createProject(page);

  // The @font-face is declared under the name the ARTWORK asks for, over the bundled file: a
  // face declared as "Archivo" answers nothing in an SVG whose own CSS says "Archivo-Bold".
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).toContain('font-family: "Archivo-Bold"');
  expect(css).toContain('fonts/archivo.woff2');
  expect(css).toContain('font-family: "JetBrainsMono-Regular"');
  expect(css).not.toContain('UNRESOLVED');
});

test('svg import: the Google door is offered only for a family Google actually has', async ({ page }) => {
  // A licensed face is not on Google, so the button's only outcome there is an error — which
  // reads as the product being broken rather than as the font being private. The family list is
  // a local module, so the step can answer before anyone clicks.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Name" x="20" y="90" font-size="34" font-family="Gotham" fill="#fff">Alexandra Riva</text>
      <text id="Role" x="20" y="140" font-size="20" font-family="Lato" fill="#b7bcc4">Correspondent</text>
    </svg>`,
    'licensed-font.svg',
  );
  await page.locator('.wz-next').click();

  await expect(page.getByTestId('map-svg-font-nogoogle-Gotham')).toBeVisible();
  await expect(page.getByTestId('map-svg-font-google-Gotham')).toHaveCount(0);
  // Lato IS on Google, so its row keeps the door.
  await expect(page.getByTestId('map-svg-font-google-Lato')).toBeVisible();
});

test('svg import: the last screen before Create names a typeface that will not travel', async ({ page }) => {
  // The one way a pixel-exact import stops being pixel-exact is a family that ships with
  // nothing. It is never a blocker - the designer may know the playout machine has it - but it
  // was stated only on the mapping step, which "Next" walks straight past.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Name" x="20" y="90" font-size="34" font-family="Archivo" fill="#fff">Alexandra Riva</text>
      <text id="Role" x="20" y="140" font-size="20" font-family="Gotham-Book" fill="#b7bcc4">Correspondent</text>
    </svg>`,
    'one-missing-font.svg',
  );
  await page.locator('.wz-next').click();
  await page.locator('.wz-next').click();
  await page.locator('.wz-next').click();

  const summary = page.locator('.wz-finish-summary');
  await expect(summary).toContainText('Typefaces');
  await expect(summary).toContainText('1 embedded');
  await expect(summary).toContainText('Gotham-Book');
});

test('svg import: outline rows are ranked — a word of glyphs leads, an icon is badged artwork', async ({ page }) => {
  // "A group of paths" describes outlined copy AND every icon in the file, so a Figma export
  // can bury the one row that is the headline under a dozen crests. The measured shapes tell
  // them apart: a word is several glyphs standing on one baseline in a wide box.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
      <g id="Crest" fill="#fff"><path d="M20 20h60v60H20z"/><path d="M35 35h30v30H35z"/></g>
      <g id="Headline" fill="#fff">
        <path d="M100 120 h20 v80 h-20 Z M100 120 h60 v18 h-60 Z"/>
        <path d="M180 120 h20 v80 h-20 Z"/>
        <path d="M240 120 h20 v80 h-20 Z M300 120 h20 v80 h-20 Z M220 120 l20 0 l60 80 l-20 0 Z"/>
        <path d="M360 120 h20 v80 h-20 Z M360 120 h60 v18 h-60 Z"/>
        <path d="M440 120 h20 v80 h-20 Z M440 182 h50 v18 h-50 Z"/>
      </g>
    </svg>`,
    'ranked-outlines.svg',
  );
  await page.locator('.wz-next').click();

  // The word's row leads, whatever the drawing order was.
  const rows = page.locator('[data-testid^="map-svg-outline-o"]');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toHaveAttribute('data-testid', 'map-svg-outline-o1');

  // The icon is still offered — a two-letter logotype really can be text — but it says what it
  // measured as, so the reader can skip it.
  await expect(page.getByTestId('map-svg-outline-artwork-o0')).toBeVisible();
  await expect(page.getByTestId('map-svg-outline-artwork-o1')).toHaveCount(0);
});

test('svg import: Inkscape flowed text is called out, since no browser draws it', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <flowRoot id="flowRoot10"><flowRegion><rect x="20" y="20" width="200" height="60"/></flowRegion><flowPara id="flowPara12">Paragraph copy</flowPara></flowRoot>
      <text id="Headline" x="20" y="120" font-size="30" fill="#fff">Alexandra Riva</text>
    </svg>`,
    'flowed.svg',
  );

  // The copy is already missing from the picture before we look at it, so the card says so and
  // names the fix rather than leaving a designer hunting for a lost paragraph.
  await expect(page.getByTestId('import-svg-card')).toContainText('flowed text');
  await expect(page.getByTestId('import-svg-card')).toContainText('Convert to Text');
});

test('svg import: the export door ships the bound SVG unchanged through the gate', async ({ page }) => {
  await dropSvg(page);
  // Straight to Finish (Next through mapping and animation — the defaults are the promise).
  await page.locator('.wz-next').click();
  await page.locator('.wz-next').click();
  await page.locator('.wz-next').click();

  // The read-back names the fields; the export door saves and opens the window over the wizard.
  await expect(page.locator('.wz-summary, .wz-step')).toContainText('4 editable text layers');
  await page.getByTestId('wz-finish-export').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await expect(win.locator('input[name="export-target"]')).toHaveCount(6);
  await expect(win.locator('.status-ok')).toContainText('valid and ready to export');

  // The SPX package carries the inline SVG — no asset-path question, single-file targets
  // stay single-file.
  const spxFiles = await page.evaluate(async () => {
    const [{ EXPORT_TARGETS }, { loadAllGraphics }] = await Promise.all([
      import('/src/export/registry.ts'),
      import('/src/model/library.ts'),
    ]);
    const spx = EXPORT_TARGETS.find((t) => t.id === 'spx')!;
    const graphic = loadAllGraphics()[0];
    const zip = await spx.build(graphic.template, { sampleData: {} });
    const html = await zip.files[Object.keys(zip.files).find((f) => f.endsWith('.html'))!].async('string');
    return { files: Object.keys(zip.files), svgInline: html.includes('<svg'), bound: /id="f0"/.test(html) };
  });
  expect(spxFiles.svgInline).toBe(true);
  expect(spxFiles.bound).toBe(true);
});

test('svg import: outlined text — a glyph-shaped group becomes a placed live field over its own box', async ({ page }) => {
  // A file whose type was converted to outlines: a backplate group, one group of six glyph
  // shapes on a shared baseline (one with a descender) named "Name", and a two-path mark.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <g id="Backplate">
        <rect x="10" y="10" width="380" height="180" fill="#161a22"/>
        <rect x="10" y="10" width="6" height="180" fill="#f6a623"/>
      </g>
      <g id="Name">
        <path d="M60 80 h20 v40 h-20 Z" fill="#ffffff"/>
        <path d="M85 80 h20 v40 h-20 Z" fill="#ffffff"/>
        <path d="M110 80 h20 v40 h-20 Z" fill="#ffffff"/>
        <path d="M135 80 h20 v50 h-20 Z" fill="#ffffff"/>
        <path d="M160 80 h20 v40 h-20 Z" fill="#ffffff"/>
        <path d="M185 80 h20 v40 h-20 Z" fill="#ffffff"/>
      </g>
      <g id="Mark">
        <path d="M320 40 l30 0 l0 30 l-30 0 Z" fill="#f6a623"/>
        <path d="M330 50 l10 0 l0 10 l-10 0 Z" fill="#161a22"/>
      </g>
    </svg>`,
    'outlined-name.svg',
  );
  await page.locator('.wz-next').click();

  // The honest answer still stands — and now names the third road.
  await expect(page.getByTestId('map-svg-outlined')).toContainText('Tick a group of shapes');
  // Every glyph-shaped group is offered, OFF, labelled from its layer name; the backplate's
  // rects are furniture, never letters, so it is not on the list.
  const rows = page.getByTestId('map-svg-outlines');
  await expect(rows).toContainText('0 of 2 replaced');
  await expect(page.getByTestId('map-svg-outline-title-o0')).toHaveValue('Name');
  await expect(page.getByTestId('map-svg-outline-title-o1')).toHaveValue('Mark');
  const tick = page.getByTestId('map-svg-outline-o0').locator('input[type=checkbox]');
  await expect(tick).not.toBeChecked();
  await expect(tick).toBeEnabled(); // measured on the step's own render
  await page.getByTestId('map-svg-outline-o0').hover();
  await expect(page.getByTestId('wz-preview-highlight')).toBeVisible();
  await tick.check();
  await page.getByTestId('map-svg-outline-sample-o0').fill('Ada');
  // Ticked, the shapes are hidden and the live stand-in wears the row's marker instead — so
  // exactly one node answers the hover, and it is the one that actually airs.
  await page.getByTestId('map-svg-outline-o0').hover();
  await expect(page.getByTestId('wz-preview-highlight')).toBeVisible();

  await createProject(page);

  const state = await page.evaluate(async () => {
    const [{ useTemplateStore }, { getTemplateParts }, { validateTemplate }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/model/structure.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields.map((f) => `${f.field}:${f.ftype}:${f.title}:${f.value}`),
      html: t.html,
      css: t.css,
      js: t.js,
      parts: getTemplateParts(t.html, t.fields).map((p) => `${p.selector}|${p.kind}`),
      valid: validateTemplate(t).ok,
    };
  });
  // One real placed field, through the raster flow's own transform: mask wrapper + span
  // in the design unit (AFTER the inlined svg, never inside it), shrink-fit by default.
  expect(state.fields).toEqual(['f0:textfield:Name:Ada']);
  const svgEnd = state.html.lastIndexOf('</svg>');
  expect(state.html.slice(svgEnd)).toMatch(/<div class="imported-design-mask" id="fw0"\s*>\s*<span id="f0" data-fit="shrink"\s*>\s*Ada\s*<\/span>/);
  expect(state.html.slice(0, svgEnd)).not.toContain('imported-design-mask');
  // The outlined group is hidden — in the file, not deleted — by the class + the one rule.
  expect(state.html).toMatch(/<g id="Name" class="imported-design-outlined"\s*>/);
  expect(state.css).toContain('.imported-design-outlined {\n  display: none;');
  // …and the field sits where the shapes were: their left edge, cap top a tenth of an em up,
  // sized from the measured cap height (40 design px / 0.72 ≈ 56), in the shapes' own fill.
  expect(state.css).toMatch(/#fw0 \{\n {2}position: absolute;\n {2}left: calc\(60px \* var\(--scale\)\);[^}]*top: calc\(74px \* var\(--scale\)\);/);
  expect(state.css).toMatch(/#f0 \{[^}]*font-size: calc\(56px \* var\(--scale\)\);[^}]*color: rgb\(255, 255, 255\);/);
  // ONE FIT (docs/SVG_IMPORT_PLAN.md §6b): the ladder measures the placed line too, so the
  // placed-text runtime is not emitted at all and update() calls one hook, not two.
  expect(state.js).toContain('function fitSvgText');
  expect(state.js).not.toContain('function fitPlacedText');
  expect(state.js).toMatch(/typeof fitSvgText === 'function'\) fitSvgText\(\)/);
  expect(state.js).not.toContain('typeof fitPlacedText');
  // A hidden group is not a layer: no registry part, no phantom timeline row. The mark is.
  expect(state.parts).not.toContain('#Name|block');
  expect(state.parts).toContain('#Mark|block');
  expect(state.parts).toContain('#f0|line');
  expect(state.valid).toBe(true);

  // On screen: the live text shows, the shapes it replaced do not.
  const frame = previewFrame(page);
  await expect(frame.locator('#f0')).toHaveText('Ada');
  await expect(frame.locator('#f0')).toBeVisible();
  await expect(frame.locator('#Name')).toBeHidden();
});

test('svg import: the layer stagger preset walks the artwork’s own top-level layers, as per-layer data', async ({ page }) => {
  await dropSvg(page);
  await page.locator('.wz-next').click();
  await page.locator('.wz-next').click();
  // Only the SVG variant offers it — its groups are the layers.
  await page.locator('.wz-anim', { hasText: 'Layer stagger' }).click();
  await createProject(page);

  const data = await page.evaluate(async () => {
    const [{ useTemplateStore }, { parseAnimData }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/blocks/animData.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    const d = parseAnimData(t.js)!;
    const at = (step: number, sel: string) => d.steps[step].layers[sel]?.opacity?.map((k) => k.time) ?? null;
    return {
      enter: { box: at(0, '.imported-design-box'), back: at(0, '#Backplate'), text: at(0, '#Text_x20_Layer'), details: at(0, '#Details') },
      out: { back: at(d.steps.length - 1, '#Backplate'), details: at(d.steps.length - 1, '#Details') },
    };
  });
  // Every named top-level group has its own track (the keyframe model has no stagger field,
  // so the stagger survives ONLY as per-layer offsets); they start a beat apart, in file
  // order on the way in and reversed on the way out.
  expect(data.enter.box).not.toBeNull();
  expect(data.enter.back![0]).toBeLessThan(data.enter.text![0]);
  expect(data.enter.text![0]).toBeLessThan(data.enter.details![0]);
  expect(data.out.details![0]).toBeLessThan(data.out.back![0]);
});

test('svg import: a clock-shaped layer can bind as a countdown — the node ticks, the operator sets minutes', async ({ page }) => {
  await dropSvg(page);
  await page.locator('.wz-next').click();

  // Only the clock-shaped layer ("22:40", t3) offers the choice; it starts as text.
  await expect(page.getByTestId('map-svg-kind-t0')).toHaveCount(0);
  const kind = page.getByTestId('map-svg-kind-t3');
  await expect(kind).toHaveValue('text');
  await kind.selectOption('countdown');

  await createProject(page);

  const state = await page.evaluate(async () => {
    const [{ useTemplateStore }, { parseAnimData }, { validateTemplate }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/blocks/animData.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    const d = parseAnimData(t.js)!;
    return {
      field: t.fields[3],
      html: t.html,
      css: t.css,
      js: t.js,
      enterCalls: d.steps[0].calls?.map((c) => c.call) ?? [],
      outCalls: d.steps[d.steps.length - 1].calls?.map((c) => c.call) ?? [],
      valid: validateTemplate(t).ok,
    };
  });
  // The field is the count's LENGTH in minutes (the drawn "22:40" read as M:SS), held in a
  // hidden data source; the drawn layer is the display — class, not id, so update() can
  // never write "22.67" over the ticking readout.
  expect(state.field).toMatchObject({ field: 'f3', ftype: 'number', title: 'Text Layer (minutes)', value: '22.67' });
  expect(state.html).toMatch(/<div id="f3" class="noacg-data-source"\s*>\s*22\.67\s*<\/div>/);
  expect(state.html).toMatch(/<tspan[^>]*class="imported-design-clock"[^>]*>22:40<\/tspan>/);
  expect(state.html).not.toMatch(/<tspan[^>]*id="f3"/);
  expect(state.css).toContain('.noacg-data-source {');
  // The shared clock runtime rides outside the region, and the data calls it at the edges.
  expect(state.js).toContain('function startClock()');
  expect(state.enterCalls).toEqual(['startClock']);
  expect(state.outCalls).toEqual(['stopClock']);
  expect(state.valid).toBe(true);

  // Idle, the display shows the full length — the designer's own readout, round-tripped.
  const frame = previewFrame(page);
  await expect(frame.locator('.imported-design-clock')).toHaveText('22:40');
  // Playing starts the count: within a couple of seconds the readout has moved.
  await page.getByRole('button', { name: /^▶ Play$/ }).click();
  await expect(frame.locator('.imported-design-clock')).not.toHaveText('22:40', { timeout: 5_000 });
});

// ── THE MAPPING STEP'S HEIGHT BUDGET ──
// The step exists to answer one question — which text becomes an operator field — and the
// artwork above the checklist used to eat the whole scrollport on a short laptop window: the
// rows were real, ticked and working, and three graphics were imported without anybody
// noticing they were there. Geometry, not visibility: a row clipped away by a scrolling
// ancestor still reports `toBeVisible()`, which is exactly how it shipped.
//
// The artwork has since left the step entirely (plan §6a step 1 — the preview is the one
// canvas), so the budget got easier and the numbers below are re-measured, not inherited: the
// scorebug's seven rows all fit on a 768-tall window — and since the one-line-per-thing pass
// (GOALS goal 4, 2026-08-26: the lead shrank to one line and the section paragraphs moved
// behind their ⓘ) all seven fit on a 720-tall one too, where six did. Three fitted before the
// artwork moved, at either size. Exact on purpose: a copy change that costs a row should fail
// here, and one that buys a row should have to say so.
for (const [width, height, rowsExpected] of [[1366, 768, 7], [1280, 720, 7]] as const) {
  test(`svg import: the mapping step's checklist is on screen at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/app');
    await expect(page.locator('.wz-modal')).toBeVisible();
    await page.locator('[data-entry="import-graphic"]').click();
    await page.locator('.wz-drop input[type="file"]').setInputFiles(SCOREBUG_SVG);
    await expect(page.getByTestId('import-svg-card')).toBeVisible();
    await page.locator('.wz-modal').getByRole('button', { name: 'Next' }).click();
    await expect(page.getByTestId('map-svg-fields')).toBeVisible();

    const fold = await page.evaluate(() => {
      const port = document.querySelector('.wz-step')!.getBoundingClientRect();
      const rows = Array.from(
        document.querySelectorAll<HTMLElement>('[data-testid="map-svg-fields"] .map-svg-row'),
      ).map((r) => r.getBoundingClientRect());
      return {
        heading: document.querySelector('[data-testid="map-svg-fields"] h3')!.getBoundingClientRect().bottom,
        portBottom: port.bottom,
        firstRowBottom: rows[0].bottom,
        rowsOnScreen: rows.filter((r) => r.bottom <= port.bottom + 0.5).length,
        rowCount: rows.length,
      };
    });
    // The heading that says what the step is for, and the first row under it, are both in the
    // scrollport on arrival — nothing about the job is discovered by scrolling.
    expect(fold.heading).toBeLessThan(fold.portBottom);
    expect(fold.firstRowBottom).toBeLessThanOrEqual(fold.portBottom + 0.5);
    // With the artwork gone from the step, the checklist arrives whole (or all but its last
    // row on the shortest laptop) instead of the three rows the sticky band could afford.
    expect(fold.rowCount).toBe(7);
    expect(fold.rowsOnScreen).toBe(rowsExpected);

    // Every detected layer arrives ticked. The scorebug exports one layer as `f:Competition`,
    // which used to switch the other six off.
    const boxes = page.getByTestId('map-svg-fields').locator('input[type=checkbox]');
    expect(await boxes.count()).toBeGreaterThan(1);
    for (const box of await boxes.all()) await expect(box).toBeChecked();

    // THE ONE CANVAS. The step's own render of the markup is still there — measureOutline
    // needs the artwork laid out — but it is OFF SCREEN, and the preview is what the reader
    // judges the import on. Two canvases answering the same question differently is the
    // defect this step's road opens with (plan §6a step 1).
    // The frame arrives a debounce after the step does (WizardPreview commits its srcdoc at
    // 220 ms), so wait for it rather than reading a null out of the evaluate.
    await expect(page.locator('.wz-stage iframe')).toBeVisible();
    const canvases = await page.evaluate(() => {
      const port = document.querySelector('.wz-step')!.getBoundingClientRect();
      const inline = document.querySelector('[data-testid="map-svg-stage"]')!.getBoundingClientRect();
      const frame = document.querySelector('.wz-stage iframe')!.getBoundingClientRect();
      return {
        inlineOnScreen: inline.right > port.left && inline.left < port.right,
        inlineRendered: inline.width > 0 && inline.height > 0,
        previewArea: Math.round(frame.width * frame.height),
      };
    });
    expect(canvases.inlineOnScreen).toBe(false);
    expect(canvases.inlineRendered).toBe(true);
    // And the truthful canvas is no longer the small one: it used to be 260x146 beside a
    // 464x261 render that could not run the fit.
    expect(canvases.previewArea).toBeGreaterThan(464 * 261);
  });
}

test('svg import: the text-fit budget is the DRAWN text, whenever the first value arrives', async ({ page }) => {
  // The fit condenses an operator value that is wider than the text the designer drew. What
  // "the designer drew" means used to be "whatever was on screen the first time we measured",
  // and a playout renderer replays its control log the moment the page exists — so on air the
  // budget was often the OPERATOR'S value, which can never overflow itself. The same file then
  // squished in the editor and ran clean past the artwork on air. The drawn text is remembered
  // before update() can be called, and re-measured (not re-taken) when the real face lands.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 300">
      <text id="Presenter" x="40" y="120" font-size="48" fill="#fff">Ada</text>
    </svg>`,
    'budget.svg',
  );
  await page.locator('.wz-next').click();
  await createProject(page);

  const frame = previewFrame(page);
  const fitted = await frame.locator('#f0').evaluate((el) => {
    const w = window as unknown as {
      update: (json: string) => void;
      refitSvgText: () => void;
      svgFitDrawn: Record<string, string>;
      svgFitWidths: Record<string, number>;
      svgFitRoom: Record<string, { width: number }>;
      svgFitSizes: Record<string, number>;
    };
    w.update(JSON.stringify({ f0: 'An extremely long presenter name' }));
    w.refitSvgText(); // what document.fonts.ready fires once the real face has loaded
    const node = el as unknown as SVGTextContentElement;
    return {
      drawn: w.svgFitDrawn.f0,
      budget: w.svgFitWidths.f0,
      room: w.svgFitRoom.f0.width,
      drawnSize: w.svgFitSizes.f0,
      size: parseFloat(getComputedStyle(node).fontSize),
      length: node.getComputedTextLength(),
    };
  });

  // The drawn text is still Ada's — three characters, nothing like the value now on screen — so
  // the long value is fitted against the design rather than against itself. With no shape drawn
  // behind this line there is no room to fill, so the drawn width IS the budget, and a value far
  // past it shrinks until the readability floor stops it.
  expect(fitted.drawn).toBe('Ada');
  expect(fitted.budget).toBeCloseTo(fitted.room, 1);
  expect(fitted.size).toBeLessThan(fitted.drawnSize);
  // Bounded by the HARD floor (30%), not the reporting one (55%): a placed line has no height to
  // wrap into, so size is the only rung it has, and since 2026-09-05 it spends it rather than
  // condensing the glyphs past legibility.
  expect(fitted.size).toBeGreaterThanOrEqual(fitted.drawnSize * 0.3 - 0.1);
});

// ── THE FIT LADDER (owner-ruled 2026-08-23) ──────────────────────────────────────────────
// Fill the panel, then wrap inside the height the design already has, then shrink to the
// readability floor, then report it. The artwork is never reshaped to make copy fit.
//
// The fixture is shaped like the shipped lower third: a wide panel with a short name drawn into
// it, so the empty banner beside the name is the thing under test.
const LADDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Panel" x="140" y="760" width="1040" height="190" rx="8" fill="#0d1017"/>
  <text id="Name" x="190" y="840" font-size="56" fill="#ffffff">Ada</text>
  <text id="Role" x="190" y="892" font-size="30" fill="#b7bcc4">Correspondent</text>
</svg>`;

test('svg import: a value fills the panel it was drawn in before any of it shrinks', async ({ page }) => {
  // The budget used to be the width of the text the DESIGNER typed, so a name drawn 3 characters
  // wide inside a 1040px banner began shrinking at its own fourth character while most of the
  // panel stood empty. The budget is the ROOM: out to a right margin mirroring the left one.
  await dropSvgMarkup(page, LADDER_SVG, 'ladder.svg');
  await page.locator('.wz-next').click();
  // This test pins the SHRINK ladder, and a banner-shaped file now defaults to growing
  // (GOALS goal 5) - so the shrink path is chosen explicitly, as an author would.
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await createProject(page);

  const frame = previewFrame(page);
  const read = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      const w = window as unknown as {
        update: (json: string) => void;
        svgFitWidths: Record<string, number>;
        svgFitRoom: Record<string, { width: number; height: number }>;
        noacgTextOverflow: () => string[];
      };
      w.update(JSON.stringify({ f0: v }));
      const panel = document.getElementById('Panel')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        drawnBudget: w.svgFitWidths.f0,
        room: w.svgFitRoom.f0.width,
        size: parseFloat(getComputedStyle(el).fontSize),
        gapRight: panel.right - box.right,
        overflowing: w.noacgTextOverflow(),
      };
    }, value);

  const drawn = await read('Ada');
  // The room is the panel's, and it is far more than the three characters drawn into it.
  expect(drawn.room).toBeGreaterThan(drawn.drawnBudget * 2);

  // A value several times the drawn one still airs at FULL SIZE, because the banner holds it.
  const filling = await read('Alexandra Riva');
  expect(filling.size).toBe(drawn.size);
  expect(filling.overflowing).toEqual([]);

  // Past the room it shrinks - and having shrunk, it reaches the far margin instead of stopping
  // at the width of the designer's own three characters.
  const long = await read('Alexandra Konstantinopolous-Riva de la Vega y Santa Maria');
  expect(long.size).toBeLessThan(drawn.size);
  expect(long.gapRight).toBeLessThan(drawn.gapRight / 4);
});

test('svg import: copy too long for any size floors instead of vanishing, and says so', async ({ page }) => {
  // Unfloored, the shrink drove a 400-character value to 3.7px - which reads on air as the text
  // having disappeared. It stops at 55% of the drawn size, the same floor the raster import
  // keeps, and reports the field rather than clipping the copy or reshaping the artwork.
  await dropSvgMarkup(page, LADDER_SVG, 'ladder.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink'); // the shrink ladder is under test
  await createProject(page);

  const state = await previewFrame(page).locator('#f0').evaluate((el) => {
    const w = window as unknown as {
      update: (json: string) => void;
      svgFitSizes: Record<string, number>;
      noacgTextOverflow: () => string[];
    };
    w.update(JSON.stringify({ f0: 'A'.repeat(400) }));
    return {
      drawnSize: w.svgFitSizes.f0,
      size: parseFloat(getComputedStyle(el).fontSize),
      text: el.textContent,
      overflowing: w.noacgTextOverflow(),
    };
  });

  // TWO FLOORS since 2026-09-05: 55% is where the value is REPORTED as too long, and the type
  // keeps shrinking past it to 30% rather than being condensed into a texture (owner: "if it
  // becomes too small, then that's the user's own fault, but the text should never... get so
  // dense that it's impossible to read"). So the size is BOUNDED here, not pinned: below the
  // reporting floor, above the hard one.
  expect(state.size).toBeLessThan(state.drawnSize * 0.55);
  expect(state.size).toBeGreaterThanOrEqual(state.drawnSize * 0.3 - 0.01);
  expect(state.text).toHaveLength(400); // the copy is whole - never trimmed to fit
  expect(state.overflowing).toEqual(['f0']);
});

// ── THE LADDER ON THE ARCHETYPAL LOWER THIRD (owner walk, 2026-08-29) ───────────────────
// The file the owner walked twice: an Illustrator premium lower third - a rounded-rectangle
// PATH plate with a gradient and a drop-shadow filter, an accent rail down its left edge, and
// three stacked lines whose positions live in a transform matrix rather than in x/y.
//
// He watched a long name make the panel LONGER and then get SMALLER, and never once go onto a
// second line. Three things were wrong underneath, and each is a rung of the ratified order
// (docs/SVG_IMPORT_PLAN.md §3 - wider, then wrap, then smaller, shrink LAST):
//   - vertical growth mirrored the inset from the frame's TOP onto the bottom, which for a
//     graphic drawn 130px above the frame's bottom edge and 760 below its top put the ceiling
//     ABOVE the panel's own bottom. Every lower third measured zero room, so the wrap rung had
//     nowhere to go and the ladder fell through to the one rung meant to come last;
//   - a wrapped line was painted as tspans with no x, so it staircased out of the panel on
//     exactly the files that carry their position in a transform (every Illustrator export);
//   - and the room downward had no margin rule at all, so a wrapped block sat hard against the
//     line beneath it.
const GRADIENT_LOWER_THIRD = readFileSync(
  fileURLToPath(new URL('fixtures/svg-corpus/effects-gradient-shadow-lower-third.svg', import.meta.url)),
  'utf8',
);

/** Everything one value settles on, read off the live graphic: the plate, the name's block and
 *  the role drawn under it. */
async function ladderState(page: Page, value: string) {
  return previewFrame(page)
    .locator('#f0')
    .evaluate((el, v) => {
      const w = window as unknown as {
        update: (json: string) => void;
        refitSvgText: () => void;
        svgFitSizes: Record<string, number>;
        noacgTextOverflow: () => string[];
      };
      w.update(JSON.stringify({ f0: v }));
      const plate = document.querySelector('[data-noacg-el~="g0"]')!.getBoundingClientRect();
      const accent = document.getElementById('Accent')!.getBoundingClientRect();
      const name = el.getBoundingClientRect();
      const role = document.getElementById('f1')!.getBoundingClientRect();
      return {
        size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
        drawnSize: w.svgFitSizes.f0,
        lines: el.children.length || 1,
        plateLeft: Math.round(plate.left),
        plateRight: Math.round(plate.right),
        plateTop: Math.round(plate.top),
        plateBottom: Math.round(plate.bottom),
        accentTop: Math.round(accent.top),
        accentBottom: Math.round(accent.bottom),
        nameTop: Math.round(name.top),
        nameBottom: Math.round(name.bottom),
        nameLeft: Math.round(name.left),
        nameRight: Math.round(name.right),
        roleTop: Math.round(role.top),
        over: w.noacgTextOverflow(),
      };
    }, value);
}

test('svg import: a lower third climbs the ladder in order — wider, then onto a new line, and only then smaller', async ({
  page,
}) => {
  await dropSvgMarkup(page, GRADIENT_LOWER_THIRD, 'gradient-lower-third.svg');
  await page.locator('.wz-next').click();
  // THE MEASURED DEFAULT IS THE WHOLE LADDER, not its first rung: the owner walked this file
  // without touching the dropdown, and 'the panel gets wider' alone skips the wrap rung.
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('grow-xy');
  await createProject(page);

  const drawn = await ladderState(page, 'Alexandra Riva');
  expect(drawn.lines).toBe(1);
  expect(drawn.size).toBe(drawn.drawnSize);

  // RUNG ONE - the panel gets wider, at the size the designer drew.
  const wider = await ladderState(page, 'Alexandra Konstantinopolous-Riva de la Vega');
  expect(wider.plateRight).toBeGreaterThan(drawn.plateRight);
  expect(wider.size).toBe(drawn.size);
  expect(wider.lines).toBe(1);

  // RUNG TWO - past the width its own margin allows, the name goes onto a SECOND LINE, still at
  // the size the designer drew, and the panel finds the height by growing UPWARDS: the edge the
  // lower third is composed against never moves, and neither does the role drawn under it.
  const wrapped = await ladderState(
    page,
    'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen',
  );
  expect(wrapped.lines).toBe(2);
  expect(wrapped.size).toBe(drawn.size);
  expect(wrapped.over).toEqual([]);
  expect(wrapped.plateTop).toBeLessThan(drawn.plateTop);
  expect(wrapped.plateBottom).toBe(drawn.plateBottom);
  expect(wrapped.roleTop).toBe(drawn.roleTop);
  // The accent rail is drawn to the plate's own two edges, so it grows with it rather than
  // leaving the gained strip bare.
  expect(wrapped.accentTop).toBe(wrapped.plateTop);
  expect(wrapped.accentBottom).toBe(wrapped.plateBottom);

  // RUNG THREE - and only a value no width and no line count can hold gets smaller. One
  // unbreakable word is the honest case: there is nowhere to wrap it, so both rungs above are
  // genuinely spent before the type moves, and past the floor it is reported.
  const floored = await ladderState(page, 'A'.repeat(400));
  expect(floored.size).toBeLessThan(drawn.size);
  expect(floored.over).toEqual(['f0']);

  // A short value again puts the artwork back exactly as drawn.
  const back = await ladderState(page, 'Alexandra Riva');
  expect(back).toEqual(drawn);
});

test('svg import: a growing lower third keeps the space the designer drew around its text', async ({ page }) => {
  // "The panel doesn't have a safe space" (owner, 2026-08-29). Sideways the room already
  // mirrored the designer's left inset; downwards there was no margin rule at all, so a wrapped
  // block ran to the panel's own edge and sat on the line below it. Both margins are measured
  // off the rest pose the designer drew - never a constant - so they hold at every rung.
  await dropSvgMarkup(page, GRADIENT_LOWER_THIRD, 'gradient-lower-third.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  const drawn = await ladderState(page, 'Alexandra Riva');
  const drawnInsetLeft = drawn.nameLeft - drawn.plateLeft;
  const drawnTopPad = drawn.nameTop - drawn.plateTop;
  const drawnGapUnder = drawn.roleTop - drawn.nameBottom;
  expect(drawnInsetLeft).toBeGreaterThan(0);
  expect(drawnTopPad).toBeGreaterThan(0);
  expect(drawnGapUnder).toBeGreaterThan(0);

  // WIDENED: the name stops the drawn left inset short of the plate's new right edge, rather
  // than running out to it.
  const wider = await ladderState(page, 'Alexandra Konstantinopolous-Riva de la Vega');
  expect(wider.plateRight - wider.nameRight).toBeGreaterThanOrEqual(drawnInsetLeft - 2);

  // WRAPPED: the block keeps the whole gap the designer drew above the role, and the plate keeps
  // its own top padding above the name it just grew for.
  const wrapped = await ladderState(
    page,
    'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen',
  );
  expect(wrapped.lines).toBe(2);
  expect(wrapped.roleTop - wrapped.nameBottom).toBeGreaterThanOrEqual(drawnGapUnder - 1);
  expect(wrapped.nameTop - wrapped.plateTop).toBeGreaterThanOrEqual(drawnTopPad - 1);
});

// ── A CENTRED LINE'S SIDE GAPS ARE CENTRING, NOT MARGIN (owner walk, 2026-09-03) ─────────
// The twin of "a value fills the panel it was drawn in before any of it shrinks", which was
// built for a line drawn against the LEFT of its plate and mirrored the inset it found there.
// Mirroring is the wrong reading for a line the designer CENTRED: both gaps are then exactly
// half the leftover, so the mirror hands the line back its own drawn width and the plate around
// it is invisible to the ladder. His VOTE NOW badge - 260 units of pill, 142 units of word -
// measured 143 units of room, so "PLEASE VOTE" cost it a quarter of its size and anything
// longer floored at 55% and was squeezed into the same 143 units: an illegible smear he read,
// correctly, as the badge having disappeared. *"It shrank it down, and it doesn't fill the
// whole shape. It could."*
//
// This is the sideways half of the argument already settled downwards on 2026-09-02: the space
// above a centred line is not margin either, and the room there became symmetric about the
// middle with half a line's leading kept from each edge. Same rule, other axis.
const CENTRED_PLATE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Plate" x="660" y="460" width="600" height="160" rx="80" fill="#0d1017"/>
  <text id="Badge" transform="translate(960 540)" text-anchor="middle" font-size="48" fill="#ffffff">LIVE</text>
</svg>`;

test('svg import: a word CENTRED in its plate gets the plate as its room, not its own width', async ({
  page,
}) => {
  await dropSvgMarkup(page, CENTRED_PLATE_SVG, 'centred-plate.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  const read = async (value: string) =>
    previewFrame(page)
      .locator('#f0')
      .evaluate((el, v) => {
        const w = window as unknown as {
          update: (json: string) => void;
          svgFitRoom: Record<string, { width: number }>;
          svgFitSizes: Record<string, number>;
          svgFitWidths: Record<string, number>;
          noacgTextOverflow: () => string[];
        };
        w.update(JSON.stringify({ f0: v }));
        const node = el as unknown as SVGTextContentElement;
        const painted = (node.firstElementChild ?? node) as SVGTextContentElement;
        const squeezed = painted.getAttribute('textLength');
        // The glyphs' OWN advance at the settled size, which is what the legibility floor is a
        // fraction of. `getComputedTextLength()` reports the adjusted width while textLength is
        // set, so it is taken off, measured, and put straight back.
        painted.removeAttribute('textLength');
        const natural = painted.getComputedTextLength();
        if (squeezed !== null) painted.setAttribute('textLength', squeezed);
        return {
          room: w.svgFitRoom.f0.width,
          drawnWidth: w.svgFitWidths.f0,
          drawnSize: w.svgFitSizes.f0,
          size: parseFloat(getComputedStyle(node).fontSize),
          squeezed,
          natural,
          over: w.noacgTextOverflow(),
        };
      }, value);

  // THE ROOM IS THE PLATE. The word is drawn about 110 units wide in a 600-unit pill, so the
  // ladder must see most of those 600 - not the 110 the mirror used to hand back. A typographic
  // margin is kept from each edge (half the drawn type), which is the only quantity in the file
  // that means anything when the drawn gaps are centring.
  const drawn = await read('LIVE');
  expect(drawn.drawnWidth).toBeLessThan(200);
  expect(drawn.room).toBeGreaterThan(500);
  expect(drawn.room).toBeLessThan(600); // never outside the plate
  expect(drawn.size).toBe(drawn.drawnSize);

  // …so a value three times the drawn word still paints at the size the designer chose, because
  // the plate genuinely holds it. This is the assertion that fails on the old rule: it shrank.
  const longer = await read('VOTE NOW');
  expect(longer.size).toBe(longer.drawnSize);
  expect(longer.over).toEqual([]);
  expect(longer.squeezed).toBeNull();

  // And the rule still stops at the plate: copy no size can hold floors, is squeezed towards the
  // room rather than painted over the artwork, and is reported - every rung below this one is
  // exactly where it was. One long word, so the wrap rung has nothing to spend first.
  //
  // 120 A's is ONE unbreakable word, so the wrap rung has nothing to spend and the ladder is
  // down to size. Two floors since 2026-09-05: it is REPORTED at 55% and keeps shrinking to a
  // hard 30%, because scaling keeps a letterform its own shape where condensing turns words into
  // a texture - the smear the owner photographed.
  const absurd = await read('A'.repeat(120));
  expect(absurd.over).toEqual(['f0']);
  expect(absurd.size).toBeLessThan(absurd.drawnSize * 0.55);
  expect(absurd.size).toBeGreaterThanOrEqual(absurd.drawnSize * 0.3 - 0.01);
  // And if the last rung fired at all, it never condensed past legibility.
  if (absurd.squeezed !== null) {
    expect(Number(absurd.squeezed) / absurd.natural).toBeGreaterThanOrEqual(0.7 - 0.001);
  }

  // …and shortening it takes every rung back off, so no rung can strand the graphic.
  const back = await read('LIVE');
  expect(back.size).toBe(back.drawnSize);
  expect(back.squeezed).toBeNull();
  expect(back.over).toEqual([]);
});

test('svg import: a wrapped value is re-fitted as the words the operator typed', async ({ page }) => {
  // A wrapped line lives as tspans, and reading it back through textContent concatenates them
  // with nothing between - so the second pass (the one document.fonts.ready fires) fitted
  // "AlexandraKonstantinopolous" and settled somewhere the first pass never would.
  await dropSvgMarkup(page, GRADIENT_LOWER_THIRD, 'gradient-lower-third.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  const state = await previewFrame(page)
    .locator('#f0')
    .evaluate((el) => {
      const w = window as unknown as { update: (j: string) => void; refitSvgText: () => void };
      w.update(
        JSON.stringify({ f0: 'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen' }),
      );
      const first = { lines: el.children.length, text: el.textContent };
      w.refitSvgText();
      const kids = el.children;
      const words = [];
      for (let i = 0; i < kids.length; i++) words.push(kids[i].textContent);
      return { first, again: { lines: kids.length, joined: words.join(' ') } };
    });

  expect(state.first.lines).toBeGreaterThan(1);
  expect(state.again.lines).toBe(state.first.lines);
  expect(state.again.joined).toBe(
    'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Carmen',
  );
});

// ── ONE FITTING SYSTEM (docs/SVG_IMPORT_PLAN.md §6b) ─────────────────────────────────────
// An imported SVG used to carry TWO fit runtimes: the ladder for the layers the designer drew,
// and the raster import's `fitPlacedText` for the HTML lines placed on the artwork afterwards -
// which had no room measurement, no height check and NO OVERFLOW REPORT. So the operator's
// too-long warning covered the drawn text and went silent on an outlined-text field, which is
// exactly the kind of field the road ahead adds more of.
//
// The fixture is the outlined export the fallback exists for: a backplate and one group of glyph
// shapes named "Name", which the mapping step replaces with a live field.
const OUTLINED_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
  <g id="Backplate"><rect x="10" y="10" width="380" height="180" rx="8" fill="#161a22"/></g>
  <g id="Name">
    <path d="M60 80 h20 v40 h-20 Z" fill="#ffffff"/>
    <path d="M85 80 h20 v40 h-20 Z" fill="#ffffff"/>
    <path d="M110 80 h20 v40 h-20 Z" fill="#ffffff"/>
    <path d="M135 80 h20 v50 h-20 Z" fill="#ffffff"/>
    <path d="M160 80 h20 v40 h-20 Z" fill="#ffffff"/>
    <path d="M185 80 h20 v40 h-20 Z" fill="#ffffff"/>
  </g>
</svg>`;

/** Drop the outlined file and replace its one glyph group with a live field, sampled `sample`. */
async function replaceOutline(page: Page, sample: string) {
  await dropSvgMarkup(page, OUTLINED_SVG, 'outlined.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-outline-o0').locator('input[type=checkbox]').check();
  await page.getByTestId('map-svg-outline-sample-o0').fill(sample);
}

test('svg import: an outlined-text field is measured by the SAME ladder, against its own slot', async ({ page }) => {
  await replaceOutline(page, 'Ada');
  await createProject(page);

  const frame = previewFrame(page);
  const read = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      const w = window as unknown as {
        update: (json: string) => void;
        svgFitWidths: Record<string, number>;
        svgFitRoom: Record<string, { width: number; height: number }>;
        svgFitSizes: Record<string, number>;
        noacgTextOverflow: () => string[];
      };
      w.update(JSON.stringify({ f0: v }));
      return {
        drawnWidth: w.svgFitWidths.f0,
        room: w.svgFitRoom.f0,
        drawnSize: w.svgFitSizes.f0,
        size: parseFloat(getComputedStyle(el).fontSize),
        text: el.textContent,
        overflowing: w.noacgTextOverflow(),
      };
    }, value);

  // THE ROOM RULE. The placed line has no shape behind it - the group it stands in for is
  // hidden - so its room is its own SLOT, the width measured from that group's box. It is not
  // the width of the sample typed into it, which is the defect the drawn lines were cured of.
  const drawn = await read('Ada');
  expect(drawn.room.width).toBeGreaterThan(drawn.drawnWidth);
  // A slot is a WIDTH: nothing under a placed line was drawn for it, so it never wraps.
  expect(drawn.room.height).toBe(0);
  expect(drawn.size).toBe(drawn.drawnSize);
  expect(drawn.overflowing).toEqual([]);

  // Past the slot it shrinks - and past the REPORTING floor (55%) it is reported, which is the
  // half a placed line never had. The copy stays whole: warned about, never cut. The size keeps
  // going to the hard floor because a slot is a width alone - there is no line to wrap onto and
  // no panel to grow, so shrinking is the only rung left before condensing, which since
  // 2026-09-05 may never go past legibility.
  const long = await read('A'.repeat(400));
  expect(long.size).toBeLessThan(long.drawnSize * 0.55);
  expect(long.size).toBeGreaterThanOrEqual(long.drawnSize * 0.3 - 0.01);
  expect(long.text).toHaveLength(400);
  expect(long.overflowing).toEqual(['f0']);
});

test('svg import: the operator is WARNED about an outlined-text field that cannot hold its copy', async ({ page }) => {
  // THE PROOF OF THE MERGE. The warning has always ridden `noacgTextOverflow()`, and every
  // surface where a value is typed reads it (docs/SVG_IMPORT_PLAN.md §3, "THE OVERFLOW
  // WARNING") - so a field whose fit could not report went silent on all five of them at once.
  // Measured on the cue editor because that is where the value is typed, and against the
  // PREVIEW monitor's own answer: only the rendered graphic can say whether copy fits, which is
  // why no source check stands in for this.
  await replaceOutline(page, 'Ada');
  await intoProduction(page, 'Outlined name', 'Warning Night');
  await settleDurableWrites(page);

  const name = page.getByTestId('cue-field-f0');
  const note = page.getByTestId('cue-overflow');

  // Quiet first, or "it warns" would also be true of a surface that always warns.
  await name.fill('Ada');
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId('cue-field-over-f0')).toHaveCount(0);

  await name.fill('A'.repeat(400));
  await expect(note).toContainText('too long for the design');
  await expect(note).toContainText('Name');
  await expect(page.getByTestId('cue-field-over-f0')).toBeVisible();

  // …and it tracks the value rather than latching on the cue.
  await name.fill('Ada');
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId('cue-field-over-f0')).toHaveCount(0);
});

// ── ADD A FIELD WHERE THE FILE DREW NOTHING (docs/SVG_IMPORT_PLAN.md §6a step 3) ──────────
// The imported SVG is a fixed STAGE, not immutable artwork. The mapping step used to be a pure
// BINDING form, which assumes the file contains a layer for everything the show needs; it does
// not, and the answer is to draw the missing line ON the artwork rather than to send a reader
// who has never opened the editor into it.
//
// Full-frame on purpose: with the artwork covering the canvas, a fraction of the draw surface
// IS that fraction of the design, so the assertions below can say where the field landed.
const STAGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect x="0" y="0" width="1920" height="1080" fill="#0d1017"/>
  <text id="Headline" x="160" y="300" font-size="72" fill="#ffffff">Tonight</text>
</svg>`;

/** Drag a box over the preview, in fractions of the canvas. */
async function drawField(page: Page, from: [number, number], to: [number, number]) {
  const surface = page.getByTestId('wz-preview-draw');
  const b = (await surface.boundingBox())!;
  await page.mouse.move(b.x + b.width * from[0], b.y + b.height * from[1]);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 8 });
  await expect(page.getByTestId('wz-preview-marquee')).toBeVisible();
  await page.mouse.up();
}

test('svg import: a field drawn on the artwork becomes a real field, where it was drawn', async ({ page }) => {
  // THE ARMED STEP MUST NOT SPIN. The step re-reports its drop handler on every render, because
  // the closure reads the draft — so holding that FUNCTION in the wizard's state made each
  // report a state change, each a render, each a fresh identity, and React stopped the wizard
  // with "Maximum update depth exceeded" while the tool was armed. Every assertion below still
  // passed through it, which is exactly why the loop needs an assertion of its own.
  const loops: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && /Maximum update depth/.test(m.text())) loops.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (/Maximum update depth/.test(e.message)) loops.push(e.message);
  });

  await dropSvgMarkup(page, STAGE_SVG, 'stage.svg');
  await page.locator('.wz-next').click();

  // Nothing is armed until the reader says so — the canvas is for reading the graphic, and a
  // stray drag on it must not mint a field.
  await expect(page.getByTestId('map-svg-added')).toContainText('nothing added');
  await expect(page.getByTestId('wz-preview-draw')).toHaveCount(0);

  await page.getByTestId('map-svg-add-field').click();
  await expect(page.getByTestId('wz-preview-draw')).toBeVisible();
  // From (25%, 50%) to (55%, 56%) of a 1920x1080 stage: x 480, y 540, 576 wide, ~65 tall.
  await drawField(page, [0.25, 0.5], [0.55, 0.56]);

  // One row, and the tool disarms itself: drawing a field is one gesture, not a mode the
  // reader has to remember to leave.
  // THE MESSAGE IS THE POINT. This assertion red-mained main for ~7h on 2026-08-24 (issue #40)
  // and then went green with no fix, because the only thing it could say was that some text was
  // missing. The marquee above proves the drag happened, so a failure HERE means the drop was
  // swallowed between mouseup and the row - which is one specific bug, worth naming.
  await expect(
    page.getByTestId('map-svg-added'),
    'the drag was made (the marquee showed) but no field arrived - the drop was swallowed',
  ).toContainText('1 added');
  await expect(page.getByTestId('wz-preview-draw')).toHaveCount(0);
  await page.locator('[data-testid^="map-svg-added-title-"]').fill('Subtitle');
  await page.locator('[data-testid^="map-svg-added-sample-"]').fill('Live from the studio');
  // Typing is what drove the loop hardest — every keystroke is a new draft and a new closure.
  expect(loops).toEqual([]);

  await createProject(page);

  const state = await page.evaluate(async () => {
    const [{ useTemplateStore }, { getTemplateParts }, { validateTemplate }] = await Promise.all([
      import('/src/store/templateStore.ts'),
      import('/src/model/structure.ts'),
      import('/src/validation/validateTemplate.ts'),
    ]);
    const t = useTemplateStore.getState().template;
    return {
      fields: t.fields.map((f) => `${f.field}:${f.ftype}:${f.title}:${f.value}`),
      html: t.html,
      css: t.css,
      js: t.js,
      parts: getTemplateParts(t.html, t.fields).map((p) => `${p.selector}|${p.kind}`),
      valid: validateTemplate(t).ok,
    };
  });

  // A REAL field, after the artwork's own bound layer — the drawn line is an ordinary placed
  // line, emitted AFTER `</svg>` like every other one, and it validates like any template.
  expect(state.fields).toEqual([
    'f0:textfield:Headline:Tonight',
    'f1:textfield:Subtitle:Live from the studio',
  ]);
  const svgEnd = state.html.lastIndexOf('</svg>');
  expect(state.html.slice(svgEnd)).toMatch(
    /<div class="imported-design-mask" id="fw1"\s*>\s*<span id="f1" data-fit="shrink"\s*>\s*Live from the studio\s*<\/span>/,
  );
  expect(state.parts).toContain('#f1|line');
  expect(state.valid).toBe(true);

  // …WHERE IT WAS DRAWN. The box is the type's own em box (line-height 1), so the numbers the
  // reader dragged are the numbers in the rule rather than a guess away from them.
  const left = Number(/#fw1 \{[^}]*left: calc\((\d+)px/.exec(state.css)![1]);
  const top = Number(/#fw1 \{[^}]*top: calc\((\d+)px/.exec(state.css)![1]);
  const maxWidth = Number(/#fw1 \{[^}]*max-width: calc\((\d+)px/.exec(state.css)![1]);
  const fontSize = Number(/#f1 \{[^}]*font-size: calc\((\d+)px/.exec(state.css)![1]);
  expect(Math.abs(left - 480)).toBeLessThan(14);
  expect(Math.abs(top - 540)).toBeLessThan(14);
  expect(Math.abs(maxWidth - 576)).toBeLessThan(20);
  expect(Math.abs(fontSize - 65)).toBeLessThan(14);

  // ONE FIT (plan §6b): the drawn field is a `shrink` line, so the LADDER measures it and the
  // operator's too-long warning can see it. A wrapping line would be the one field it cannot.
  expect(state.js).toContain('function fitSvgText');
  expect(state.js).not.toContain('function fitPlacedText');
  expect(state.css).toMatch(/#f1 \{[^}]*white-space: nowrap;/);

  const reported = await previewFrame(page).locator('#f1').evaluate((el) => {
    const w = window as unknown as {
      update: (json: string) => void;
      svgFitRoom: Record<string, { width: number; height: number }>;
      noacgTextOverflow: () => string[];
    };
    w.update(JSON.stringify({ f1: 'A'.repeat(400) }));
    return { room: w.svgFitRoom.f1, size: parseFloat(getComputedStyle(el).fontSize), over: w.noacgTextOverflow() };
  });
  // Its room is the slot it was DRAWN with, and it does not wrap — the room rule for a placed
  // line, now reached through a field nobody had drawn before.
  expect(reported.room.height).toBe(0);
  expect(reported.room.width).toBeGreaterThan(0);
  expect(reported.over).toEqual(['f1']);
});

// WHY THERE IS NO SPEC HERE FOR THE HELD DROP (WizardPreview's onDrawUp).
// A drop made before the artwork has reported its box used to be discarded silently, and is now
// HELD until there is a rect to place it in. That path is real - it is what red-mained main for
// ~7h on 2026-08-24 (issue #40) - but it is not reachable from a spec, and the attempt to write
// one was reverted rather than left in place reading like a guard:
//
//   - The unmeasured window opens when a rebuild clears the rect map and closes when the new
//     document reports one. Nothing a spec can do holds it open, and it is short enough that
//     `toHaveAttribute` sampled `data-measured` 18 times across 7s on CI without once seeing it.
//   - Even having caught it, the drag itself (down, move, up) outlives the window, so the mouseup
//     that does the discarding lands after the rect has arrived and the path is never exercised.
//     Asserting harder does not fix that; it only moves the flake somewhere less honest.
//
// It is verified by FAULT INJECTION instead, which is deterministic and costs one run: delay the
// `setRects` call in WizardPreview's CANVAS_RECTS_TYPE listener by a few seconds, and the test
// above fails at `toContainText` in exactly the shape CI produced - same assertion, same line,
// same column. `data-measured` on the draw surface exists for that procedure, and for anyone
// reading the DOM to work out why a drag seemed to do nothing. e2e/AGENTS.md carries the trap.
test('svg import: a drawn field can be renamed and removed, and cancelling draws nothing', async ({ page }) => {
  await dropSvgMarkup(page, STAGE_SVG, 'stage.svg');
  await page.locator('.wz-next').click();

  // Arming and then changing your mind leaves the artwork exactly as it was.
  await page.getByTestId('map-svg-add-field').click();
  await expect(page.getByTestId('wz-preview-draw')).toBeVisible();
  await page.getByTestId('map-svg-add-field').click();
  await expect(page.getByTestId('wz-preview-draw')).toHaveCount(0);
  await expect(page.getByTestId('map-svg-added')).toContainText('nothing added');

  await page.getByTestId('map-svg-add-field').click();
  await drawField(page, [0.2, 0.7], [0.5, 0.76]);
  await expect(page.getByTestId('map-svg-added')).toContainText('1 added');

  // A CLICK is a drag of no size. It reads as "put a field here", not as a two-pixel field
  // nobody could see or select.
  await page.getByTestId('map-svg-add-field').click();
  const surface = page.getByTestId('wz-preview-draw');
  const b = (await surface.boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.3, b.y + b.height * 0.3);
  await page.mouse.down();
  await page.mouse.up();
  await expect(page.getByTestId('map-svg-added')).toContainText('2 added');

  // Removing one takes it off the artwork too — nothing about the file changed either way.
  const removes = page.locator('[data-testid^="map-svg-added-remove-"]');
  await expect(removes).toHaveCount(2);
  await removes.first().click();
  await expect(page.getByTestId('map-svg-added')).toContainText('1 added');

  await createProject(page);
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.map((f) => `${f.field}:${f.title}`);
  });
  // The clicked one survived, sized from the design rather than from the gesture — and it kept
  // the name it was given, which the next add would not have re-issued.
  expect(fields).toEqual(['f0:Headline', 'f1:Text 2']);
});

// ── VERTICAL GROWTH (docs/SVG_IMPORT_PLAN.md §6c) ────────────────────────────────────────
// A panel with room beneath it can get TALLER so a long value wraps into new height, instead of
// shrinking inside the height it was drawn at. The board below is drawn small on a tall frame,
// so the growth has somewhere to go and the caption underneath has to travel with it.
// The board is drawn for ONE line - tight enough that a second one does not fit inside the
// height the designer gave it, which is exactly when growing down is the answer.
const GROW_DOWN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Board" x="300" y="200" width="1200" height="110" rx="8" fill="#0d1017"/>
  <text id="Question" x="340" y="260" font-size="44" fill="#ffffff">Which city?</text>
  <rect id="Footer" x="300" y="340" width="1200" height="60" rx="8" fill="#f6a623"/>
</svg>`;

test('svg import: a panel told to grow taller wraps into the new height instead of shrinking', async ({ page }) => {
  await dropSvgMarkup(page, GROW_DOWN_SVG, 'grow-down.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');
  await createProject(page);

  const frame = previewFrame(page);
  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      (window as unknown as { update: (json: string) => void }).update(JSON.stringify({ f0: v }));
      const board = document.querySelector('rect[data-noacg-el~="g0"]')!;
      const footer = document.getElementById('Footer')!;
      const art = document.querySelector('.imported-design-art')!.getBoundingClientRect();
      return {
        boardHeight: Math.round(parseFloat(board.getAttribute('height')!)),
        boardBottom: Math.round(board.getBoundingClientRect().bottom),
        footerTop: Math.round(footer.getBoundingClientRect().top),
        frameBottom: Math.round(art.bottom),
        frameHeight: art.height,
        size: parseFloat(getComputedStyle(el).fontSize),
        lines: el.children.length,
        over: (window as unknown as { noacgTextOverflow: () => string[] }).noacgTextOverflow(),
      };
    }, value);

  const rest = await run('Which city?');
  expect(rest.boardHeight).toBe(110);

  // A value the drawn board already holds does not move it - the design's own space first.
  const fits = await run('Which city hosted?');
  expect(fits.boardHeight).toBe(110);
  expect(fits.size).toBe(rest.size);

  // Past that, the board gets TALLER and the value WRAPS at full size. Shrinking is what this
  // rule exists to avoid: the type stays as drawn and the panel finds the room.
  const long = await run('Which city hosted the first modern Olympic Games of the modern era?');
  expect(long.boardHeight).toBeGreaterThan(rest.boardHeight);
  expect(long.lines).toBeGreaterThan(1);
  expect(long.size).toBe(rest.size);
  expect(long.over).toEqual([]);
  // …and the caption drawn below it travelled, keeping the gap the designer left.
  expect(long.footerTop - rest.footerTop).toBeCloseTo(long.boardBottom - rest.boardBottom, 0);

  // Growing off the frame is not a fit: the board stops at the safe margin and the rest of the
  // ladder answers what the cap could not give.
  const huge = await run('Which city hosted the first modern Olympic Games '.repeat(60));
  expect(huge.boardBottom).toBeLessThanOrEqual(huge.frameBottom - huge.frameHeight * 0.04 + 1);
  expect(huge.size).toBeLessThan(rest.size);

  // And a short value again puts the artwork back exactly as drawn.
  const back = await run('Which city?');
  expect(back.boardHeight).toBe(110);
  expect(back.footerTop).toBe(rest.footerTop);
});

test('svg import: growing downwards settles on ONE geometry, whatever order the values arrive in', async ({ page }) => {
  // THE OWNER'S ACCEPTANCE CRITERION (plan §6c). Wrap and grow are circular - the line count
  // depends on the size, the available height on the growth, the growth on the line count - and
  // the fit runs INSIDE the template, so the same values must settle on the same geometry in the
  // editor, in an exported package and under SPX. That is only true if the fit is a function of
  // the VALUE and the DESIGN, never of whatever the artwork happens to look like right now.
  //
  // Measured here as the two properties that make it so: running it twice changes nothing, and
  // the answer does not depend on what was on screen before.
  await dropSvgMarkup(page, GROW_DOWN_SVG, 'grow-down.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');
  await createProject(page);

  const LONG = 'Which city hosted the first modern Olympic Games of the modern era?';
  const geometry = async (values: string[]) =>
    previewFrame(page)
      .locator('#f0')
      .evaluate((el, vs) => {
        const w = window as unknown as {
          update: (json: string) => void;
          refitSvgText: () => void;
          noacgTextOverflow: () => string[];
        };
        for (const v of vs) w.update(JSON.stringify({ f0: v }));
        const read = () => ({
          board: Math.round(parseFloat(document.querySelector('rect[data-noacg-el~="g0"]')!.getAttribute('height')!)),
          footer: Math.round(document.getElementById('Footer')!.getBoundingClientRect().top),
          size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100,
          lines: el.children.length,
          over: w.noacgTextOverflow().join(','),
        });
        const first = read();
        w.refitSvgText(); // the same pass the webfonts fire — running it twice must change nothing
        return { first, again: read() };
      }, values);

  // IDEMPOTENT: a second pass over a settled graphic moves nothing.
  const direct = await geometry([LONG]);
  expect(direct.again).toEqual(direct.first);
  expect(direct.first.lines).toBeGreaterThan(1);

  // ORDER-INDEPENDENT: the same value reached through a short one, a longer one, and an
  // enormous one settles on exactly the geometry it reaches directly. The trap the ladder
  // already paid for once is a budget taken from the first value that happened to arrive.
  const viaShort = await geometry(['Hi', LONG]);
  const viaHuge = await geometry(['Which city hosted the first modern Olympics '.repeat(12), LONG]);
  expect(viaShort.first).toEqual(direct.first);
  expect(viaHuge.first).toEqual(direct.first);
});

// ── THE CANVAS AS A CONTROL SURFACE (docs/SVG_IMPORT_PLAN.md §6a step 5) ─────────────────
// The checklist and the artwork are two views of one decision, and pointing at the thing itself
// is the view that needs no reading. The preview iframe carries no allow-same-origin, so nothing
// reaches in to ask what is under a pointer: every offered layer is TRACKED and the hit-test runs
// on the app side against the pushed rects.
//
// The fixture has one text layer, one rectangle a banner would grow, and a mark beyond it.
const PICK_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Banner" x="140" y="760" width="600" height="190" rx="8" fill="#0d1017"/>
  <text id="Name" x="190" y="860" font-size="56" fill="#ffffff">Ada</text>
</svg>`;

/**
 * Wait until the canvas can actually ANSWER a pointer.
 *
 * The preview commits its document on a debounce, and the rects only start arriving on the
 * document's own animation frame after it has been told what to track. A pointer that lands
 * before that first push finds nothing under it - and a mouse move is a one-shot, so the test
 * would sit there pointing at a canvas that had gone live a moment too late. Proving one layer
 * is pointable is proving the channel is live.
 */
async function awaitPickable(page: Page, at: [number, number]) {
  await expect(page.frameLocator('.wz-side iframe').locator('#f0')).toHaveText('Ada');
  const b = (await page.getByTestId('wz-preview-pick').boundingBox())!;
  await expect(async () => {
    await page.mouse.move(b.x + b.width * at[0], b.y + b.height * at[1]);
    await expect(page.getByTestId('wz-preview-highlight')).toBeVisible({ timeout: 400 });
  }).toPass({ timeout: 15_000 });
}

/** Click (or drag from) a point on the preview, in fractions of the canvas. */
async function pickOnCanvas(page: Page, at: [number, number], to?: [number, number]) {
  const surface = page.getByTestId('wz-preview-pick');
  const b = (await surface.boundingBox())!;
  await page.mouse.move(b.x + b.width * at[0], b.y + b.height * at[1]);
  await page.mouse.down();
  if (to) await page.mouse.move(b.x + b.width * to[0], b.y + b.height * to[1], { steps: 8 });
  await page.mouse.up();
}

test('svg import: pointing at the artwork highlights the layer under the pointer', async ({ page }) => {
  await dropSvgMarkup(page, PICK_SVG, 'pick.svg');
  await page.locator('.wz-next').click();

  // The canvas is pointable as soon as the step opens - it is the step's one canvas, not a mode
  // to switch into. Over the name, the INNERMOST thing wins: the text sits on the banner, and a
  // reader pointing at it means the text, not the panel it happens to be drawn on.
  await expect(page.getByTestId('wz-preview-pick')).toBeVisible();
  await awaitPickable(page, [0.11, 0.79]);

  // …and empty artwork outlines nothing, so the box means "this layer" rather than "somewhere".
  const b = (await page.getByTestId('wz-preview-pick').boundingBox())!;
  await page.mouse.move(b.x + b.width * 0.05, b.y + b.height * 0.05);
  await expect(page.getByTestId('wz-preview-highlight')).toHaveCount(0);
});

test('svg import: clicking a text layer binds it, and clicking it again lets it go', async ({ page }) => {
  await dropSvgMarkup(page, PICK_SVG, 'pick.svg');
  await page.locator('.wz-next').click();

  // Every detected text layer arrives ON, so the first click is the one that turns it OFF -
  // which is the honest way round to test a toggle that starts ticked.
  const tick = page.getByTestId('map-svg-row-t0').locator('input[type=checkbox]');
  await expect(tick).toBeChecked();
  await expect(page.getByTestId('map-svg-fields')).toContainText('1 of 1');
  await awaitPickable(page, [0.11, 0.79]);

  // Turning one OFF asks what should happen to the words, exactly as the checkbox does - the
  // canvas is the same control, so it must not be the door that answers for you.
  await pickOnCanvas(page, [0.11, 0.79]);
  await page.getByTestId('map-svg-off-keep').click();
  await expect(tick).not.toBeChecked();
  await expect(page.getByTestId('map-svg-fields')).toContainText('0 of 1');

  // …and back again, so the canvas is the same control as the checkbox rather than a one-way
  // door. Turning one back ON asks nothing: it undoes both answers.
  await pickOnCanvas(page, [0.11, 0.79]);
  await expect(tick).toBeChecked();
});

test('svg import: dragging a rectangle makes it the growing panel, and says which way', async ({ page }) => {
  await dropSvgMarkup(page, PICK_SVG, 'pick.svg');
  await page.locator('.wz-next').click();

  // A banner with its name drawn inside it arrives already growing (GOALS goal 5), read from
  // the artwork - the whole ladder, since the measured default is no longer only its first rung
  // (owner walk 2026-08-29). The gestures below still own the answer.
  const mode = page.getByTestId('map-svg-stretch-mode');
  const only = page.getByTestId('map-svg-stretch-only');
  await expect(mode).toHaveValue('grow-xy');
  // ONE rectangle holds the name, so there is no question and no picker - the shape is named
  // instead (owner walk, 2026-09-01).
  await expect(page.getByTestId('map-svg-stretch-shape')).toHaveCount(0);
  await expect(only).toContainText('Banner');
  await awaitPickable(page, [0.11, 0.79]);

  // A drag ACROSS the banner says "grow this one, sideways" in one gesture - the relationship
  // stops being dropdown-authored, which is the whole of step 5.
  await pickOnCanvas(page, [0.25, 0.85], [0.36, 0.85]);
  await expect(mode).toHaveValue('grow-x');
  await expect(only).toContainText('Banner');

  // A drag DOWN the same rectangle changes the direction without touching the picker.
  await pickOnCanvas(page, [0.25, 0.80], [0.25, 0.93]);
  await expect(mode).toHaveValue('grow-y');
  await expect(only).toContainText('Banner');

  // Clicking the panel that is already growing, with no direction, turns it off again: the
  // gesture is its own undo, so nothing here is a one-way door either.
  await pickOnCanvas(page, [0.25, 0.85]);
  await expect(mode).toHaveValue('shrink');
});

// ── FOLLOWERS ARE DECLARED, GEOMETRY ONLY PROPOSES (docs/SVG_IMPORT_PLAN.md §6c) ──────────
// Sideways, "anything drawn past the growing edge" is a fair guess. Downwards it is not: below a
// panel sit things that should move, things that should stretch, and things pinned to the frame
// that must stay, and no measurement separates them. So the guess is SHOWN and the author edits
// it - and the moment they do, the whole set becomes theirs and is emitted as data.
//
// The board grows down; the caption below it should travel and the footer pinned to the frame
// bottom should not - which is exactly the distinction geometry cannot make.
const FOLLOWERS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Board" x="300" y="200" width="1200" height="110" rx="8" fill="#0d1017"/>
  <text id="Question" x="340" y="260" font-size="44" fill="#ffffff">Which city?</text>
  <rect id="Caption" x="300" y="340" width="1200" height="60" rx="8" fill="#f6a623"/>
  <rect id="Strap" x="0" y="1000" width="1000" height="60" fill="#20242c"/>
</svg>`;
// Shape ids are ranked WIDEST FIRST, not by document order: s0 Board (1200), s1 Caption (1200,
// tied and second in the file), s2 Strap (1000).

test('svg import: the followers of a growing panel are proposed, then become the author’s own', async ({ page }) => {
  await dropSvgMarkup(page, FOLLOWERS_SVG, 'followers.svg');
  await page.locator('.wz-next').click();

  // No list until there is something to DECIDE (GOALS goal 5): this board arrives growing
  // sideways by the measured default, but nothing is drawn past its right edge, so the
  // follower question would be a control with no effect - and it does not render.
  await expect(page.getByTestId('map-svg-followers')).toHaveCount(0);
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');
  // The board is the only rectangle the question is drawn inside, so it is already the grower
  // and there is no picker to press (owner walk, 2026-09-01).
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Board');

  // THE PROPOSAL, measured off the artwork: everything drawn below the board. It says so - the
  // reader must be able to tell a guess from their own answer.
  const list = page.getByTestId('map-svg-followers');
  await expect(list).toContainText('read from your artwork');
  await expect(page.getByTestId('map-svg-follower-s1')).toBeVisible(); // the caption
  await expect(page.getByTestId('map-svg-follower-s2')).toBeVisible(); // the frame-bottom strap

  // …and the strap is exactly the thing geometry got wrong: it is pinned to the frame, so the
  // author drops it. That first edit MATERIALIZES the set, and the list stops calling itself a
  // proposal.
  await page.getByTestId('map-svg-follower-drop-s2').click();
  await expect(page.getByTestId('map-svg-follower-s2')).toHaveCount(0);
  await expect(list).not.toContainText('read from your artwork');
  // DROPPING IS THE WHOLE EDIT. The row used to carry a second question - move or grow - and it
  // is gone (owner, 2026-09-05; measured across the corpus, its second answer was right on none
  // of the 79 rows that asked it). What travels is still the author's; how it travels is not a
  // question any more.
  await expect(page.getByTestId('map-svg-follower-s1')).toContainText('Moves out of the way');
  await expect(page.getByTestId('map-svg-follower-s1').locator('select')).toHaveCount(0);

  await createProject(page);

  const js = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  // WHAT THE READER SAW IS WHAT SHIPPED: one rule, growing down, with exactly the follower they
  // kept and the behaviour they chose - and the strap is nowhere in the table.
  const table = /var NOACG_LAYOUT = \{[\s\S]*?\n\};/.exec(js)![0];
  expect(table).toContain('version: 1');
  expect(table).toContain("axis: 'y'");
  expect(table).toMatch(/followers: \[\{ el: 'g0f0', mode: 'move' \}\]/);
  // One follower, not two - the dropped strap left no row behind.
  expect(table.match(/mode: '/g)).toHaveLength(1);
});

// TWO rectangles, each with a line of its own drawn inside it - the only shape that raises the
// "which one grows?" question at all, now that a rectangle holding no bound line is never offered
// (it is granted zero by the runtime, so choosing it does nothing). Widest first, tied and in
// document order: s0 Board, s1 Caption. The frame-bottom strap holds no text, so it is neither a
// candidate nor an option.
const TWO_PANEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Board" x="300" y="200" width="1200" height="110" rx="8" fill="#0d1017"/>
  <text id="Question" x="340" y="270" font-size="44" fill="#ffffff">Which city?</text>
  <rect id="Caption" x="300" y="340" width="1200" height="70" rx="8" fill="#f6a623"/>
  <text id="Answer" x="340" y="392" font-size="34" fill="#101010">Helsinki</text>
  <rect id="Strap" x="0" y="1000" width="1000" height="60" fill="#20242c"/>
</svg>`;

test('svg import: picking WHICH shape grows does not quietly change which WAY', async ({ page }) => {
  // A real defect, found by the test above rather than by reading the code: the panel picker
  // rebuilt the whole answer as a fresh object, so choosing a panel dropped the direction the
  // reader had just chosen and sent a "grows taller" graphic back to growing sideways - with
  // nothing on screen to say it had happened. Two controls, one of them silently resetting the
  // other, is the kind of thing only a walk catches.
  await dropSvgMarkup(page, TWO_PANEL_SVG, 'two-panel.svg');
  await page.locator('.wz-next').click();

  const mode = page.getByTestId('map-svg-stretch-mode');
  await mode.selectOption('grow-y');
  await expect(page.getByTestId('map-svg-stretch')).toContainText('the panel gets taller');

  // The picker is here because there really are two answers, and it offers exactly those two -
  // never the strap, which holds no line and could only ever be a no-op. Its label names what
  // the reader will watch happen rather than our model of it.
  const shape = page.getByTestId('map-svg-stretch-shape');
  await expect(shape.locator('option')).toHaveText(['Board — 1200 × 110', 'Caption — 1200 × 70']);
  await expect(page.getByTestId('map-svg-stretch')).toContainText('Which shape gets taller');

  // Pick a DIFFERENT panel, then the original one back. Neither may touch the direction.
  await page.getByTestId('map-svg-stretch-shape').selectOption('s1');
  await expect(mode).toHaveValue('grow-y');
  await page.getByTestId('map-svg-stretch-shape').selectOption('s0');
  await expect(mode).toHaveValue('grow-y');
  await expect(page.getByTestId('map-svg-stretch')).toContainText('the panel gets taller');

  // …and the follower set goes back to being a PROPOSAL, because the one that was there was
  // measured against a different element and would be stale rows about the wrong panel.
  await expect(page.getByTestId('map-svg-followers')).toContainText('read from your artwork');
});

test('svg import: an untouched proposal is left to the runtime, not frozen into the graphic', async ({ page }) => {
  // A reader who never opens the follower list has expressed no opinion, so the graphic ships
  // WITHOUT a follower table and the runtime derives the set the way the hug always has. Writing
  // the proposal down instead would freeze a design-time guess into every future playout.
  await dropSvgMarkup(page, FOLLOWERS_SVG, 'followers.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-x');
  await createProject(page);

  const js = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  const table = /var NOACG_LAYOUT = \{[\s\S]*?\n\};/.exec(js)![0];
  expect(table).toContain("axis: 'x'");
  expect(table).not.toContain('followers:');
  // …and the comment above the row says which of the two it is, in the file the user can read.
  expect(table).toContain('drawn past its moving edge travels with it');
});

// ── A TRAVELLER IS ARTWORK, AND A QUESTION WITH ONE ANSWER IS NOT ASKED ────────────────────
// Both from the owner's walk of 2026-09-01, and both the same defect: a control that cannot
// apply to the graphic in front of you. "Which panel grows? is confusing when the graphic
// appears to contain only one relevant panel. If an option is not meaningful for a particular
// imported SVG, ideally do not show it." / "I can select text fields under what travels with
// it, which makes the concept even harder to understand because I would not expect text itself
// to be stretched."
//
// A board that grows DOWN, with a caption rectangle and a line of copy both drawn below it. The
// caption travels; the copy is answered by the fit ladder and is never on the list.
const TEXT_BELOW_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Board" x="300" y="200" width="1200" height="110" rx="8" fill="#0d1017"/>
  <text id="Question" x="340" y="270" font-size="44" fill="#ffffff">Which city?</text>
  <rect id="Caption" x="300" y="340" width="1200" height="70" rx="8" fill="#f6a623"/>
  <text id="Footnote" x="340" y="470" font-size="26" fill="#7f8792">Source: the almanac</text>
</svg>`;

test('svg import: only artwork travels — a text layer is never offered as one', async ({ page }) => {
  await dropSvgMarkup(page, TEXT_BELOW_SVG, 'text-below.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');

  // The caption rectangle is below the board and travels. The footnote is below it too, and is
  // NOT a row: growing the board does move it, but the too-long rule already owns every bound
  // line's size, and being asked whether a line should "stretch" is what made the concept
  // unreadable. So it is STATED, with no control on it.
  await expect(page.getByTestId('map-svg-follower-s1')).toBeVisible();
  const rows = page.getByTestId('map-svg-followers').locator('.map-svg-row');
  await expect(rows).toHaveCount(1);
  await expect(page.getByTestId('map-svg-followers')).not.toContainText('Footnote');
  await expect(page.getByTestId('map-svg-travelling-text')).toContainText(
    'Footnote is drawn beyond Board, so it moves with it',
  );

  // The section is named and explained by what the reader will watch happen, with a real number
  // in it - never by our word for the transform.
  await expect(page.getByTestId('map-svg-followers')).toContainText('What else moves');
  // THE ROW STATES ITS ANSWER; IT DOES NOT ASK FOR ONE (owner, 2026-09-05: "everything else
  // should just move out of the way"). Measured over the whole SVG corpus before the second
  // option came out, it was asked on 79 rows and was right on none of them: a row here is a layer
  // drawn PAST the growing edge, and a layer that must stretch is one drawn TO BOTH of the
  // panel's edges, which the runtime grows by itself.
  await expect(page.getByTestId('map-svg-follower-s1')).toContainText('Moves out of the way');
  await expect(page.getByTestId('map-svg-followers').locator('select')).toHaveCount(0);
  await page.getByTestId('map-svg-why-followers').click();
  const why = page.getByTestId('map-svg-why-followers-body');
  await expect(why).toContainText('40 px');
  await expect(why).toContainText('takes a layer off the list');
  // …and it names the road that replaced the option rather than pretending stretching never
  // happens: furniture drawn across the panel grows with it, listed or not. The "either way" is
  // load-bearing - a reader who adds that rail by hand and then drops it still gets a growing
  // rail, so a ✕ that promised to freeze anything would be false exactly there.
  await expect(why).toContainText('grows with it either way');
  // SHORT ENOUGH THAT SOMEBODY READS IT (owner walk, 2026-09-03: "it needs to be shorter and
  // just what it does ... No one wants to read more than a few lines"). Two paragraphs: the
  // picture, and the one thing there is to do about it. The third said where the list came from
  // and why text is not on it - both of which the summary beside the title and the line above the
  // list already say, so it was the step explaining itself twice.
  await expect(why.locator('p')).toHaveCount(2);

  // AND THE FOOTNOTE STILL SHIPS AS A TRAVELLER. A declared list replaces the runtime's own
  // derivation outright, so committing only the artwork rows would have quietly stopped the
  // footnote moving the moment the reader touched one - and the grown board would print over it.
  // Dropping the caption is the sharpest version of that: the reader has emptied the only list
  // they were shown, and the line nobody asked them about is still in the table.
  await page.getByTestId('map-svg-follower-drop-s1').click();
  await expect(page.getByTestId('map-svg-followers').locator('.map-svg-row')).toHaveCount(0);
  await createProject(page);
  const table = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return /var NOACG_LAYOUT = \{[\s\S]*?\n\};/.exec(useTemplateStore.getState().template.js)![0];
  });
  expect(table).toContain("axis: 'y'");
  // One row, and it is the text line - the caption the reader dropped left nothing behind.
  expect(table).toMatch(/followers: \[\{ el: 'g0f0', mode: 'move' \}\]/);
  expect(table.match(/mode: '/g)).toHaveLength(1);
});

test('svg import: authoring growth alone does not open an empty travel list', async ({ page }) => {
  // The owner dragged a rectangle on an ordinary lower third and got a section whose entire
  // content was a button for adding a mistake: nothing is drawn past the banner's edge, so there
  // is nothing that could travel. Engaging with growth is no longer enough to render it.
  await dropSvgMarkup(page, PICK_SVG, 'pick.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-followers')).toHaveCount(0);

  const mode = page.getByTestId('map-svg-stretch-mode');
  await mode.selectOption('grow-x');
  await expect(mode).toHaveValue('grow-x'); // authored, by hand
  await expect(page.getByTestId('map-svg-followers')).toHaveCount(0);

  await mode.selectOption('grow-y');
  await expect(page.getByTestId('map-svg-followers')).toHaveCount(0);
});

test('svg import: a value wraps inside the height the design drew, and never past it', async ({ page }) => {
  // Wrapping is allowed only into room the artwork already has: the panel's own height, down to
  // whatever is drawn below the line. How many lines that is depends on the SIZE - a 190px panel
  // holds one 56px line and three 30px ones - so the ladder re-asks as it shrinks.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
      <rect id="Board" x="360" y="240" width="1200" height="300" rx="8" fill="#0d1017"/>
      <text id="Question" x="404" y="312" font-size="44" fill="#ffffff">Which city?</text>
    </svg>`,
    'wrap.svg',
  );
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink'); // the wrap-then-shrink ladder is under test
  await createProject(page);

  const wrapped = await previewFrame(page).locator('#f0').evaluate((el) => {
    const w = window as unknown as { update: (json: string) => void; svgFitSizes: Record<string, number> };
    w.update(
      JSON.stringify({
        f0: 'Which Finnish city hosted the Summer Olympic Games in the year nineteen fifty two, and which country topped the medal table',
      }),
    );
    const board = document.getElementById('Board')!.getBoundingClientRect();
    const box = el.getBoundingClientRect();
    return {
      lines: el.children.length,
      texts: Array.from(el.children).map((c) => c.textContent ?? ''),
      insideBoard: box.bottom <= board.bottom + 0.5,
      size: parseFloat(getComputedStyle(el).fontSize),
      drawnSize: w.svgFitSizes.f0,
    };
  });

  // More than one line, every line carrying words, and the whole block still inside the shape
  // it was drawn in - the artwork does not grow to hold the copy.
  expect(wrapped.lines).toBeGreaterThan(1);
  expect(wrapped.texts.every((t) => t.trim().length > 0)).toBe(true);
  expect(wrapped.insideBoard).toBe(true);
  // And it wrapped rather than shrinking all the way: bigger than the floor it would have hit.
  expect(wrapped.size).toBeGreaterThan(wrapped.drawnSize * 0.55);
});

test('svg import: a line with another drawn right below it stays on one line', async ({ page }) => {
  // The room is measured, not assumed: the name in a two-line strap has the role directly under
  // it, so there is nowhere to wrap into and it shrinks instead. Wrapping there would print the
  // second line straight through somebody else's layer.
  await dropSvgMarkup(page, LADDER_SVG, 'ladder.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink'); // the room measurement is under test
  await createProject(page);

  const state = await previewFrame(page).locator('#f0').evaluate((el) => {
    const w = window as unknown as { update: (json: string) => void };
    w.update(JSON.stringify({ f0: 'Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Mar' }));
    const role = document.getElementById('f1')!.getBoundingClientRect();
    return { lines: el.children.length, bottom: el.getBoundingClientRect().bottom, roleTop: role.top };
  });

  // No tspans: one plain line, and it stays clear of the layer below. A second line would have
  // printed straight through the role - which is the artwork being rewritten to fit copy.
  expect(state.lines).toBe(0);
  expect(state.bottom).toBeLessThanOrEqual(state.roleTop + 0.5);
});

// THE HUG (docs/SVG_IMPORT_PLAN.md §3 + GOALS goal 5): a lower third's banner is as wide as
// the name on it — and where the artwork says so unambiguously (one banner-shaped rectangle,
// stacked start-anchored text inside it, room before the safe margin), the mapping step now
// reads that off the render and turns growth ON with nothing chosen. Where it is ambiguous
// (side-by-side text on one plate, non-start anchors, a quiz behaviour, a full-frame
// backplate) the default stays shrink and the step asks, exactly as before.
const HUG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <g id="Panel">
    <rect x="140" y="760" width="600" height="190" rx="8" fill="#0d1017"/>
    <rect x="140" y="760" width="10" height="190" fill="#f6a623"/>
  </g>
  <text id="Name" x="190" y="860" font-size="56" fill="#ffffff">Ada</text>
  <rect id="Logo" x="800" y="780" width="90" height="90" fill="#ffffff"/>
</svg>`;

test('svg import: an ordinary lower third arrives already growing, read from the artwork', async ({ page }) => {
  await dropSvgMarkup(page, HUG_SVG, 'hug.svg');
  await page.locator('.wz-next').click();

  // The banner holds its one start-anchored name and has most of the frame to grow into, so
  // the measured default is the whole ladder on the widest rectangle - and the summary SAYS it
  // was read from the artwork, so a proposal is never mistaken for something the reader chose.
  const mode = page.getByTestId('map-svg-stretch-mode');
  await expect(mode).toHaveValue('grow-xy');
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Panel');
  await expect(page.getByTestId('map-svg-stretch')).toContainText('read from your artwork');

  // Nothing PAST the growing edge needs a decision here… the Logo is past it, so the follower
  // list shows (proposed). The ordinary case with an empty proposal renders no list at all -
  // pinned in the followers block above.
  await expect(page.getByTestId('map-svg-followers')).toContainText('read from your artwork');

  // An authored answer replaces the measurement and stops advertising itself as one.
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await expect(mode).toHaveValue('shrink');
  await expect(page.getByTestId('map-svg-stretch')).not.toContainText('read from your artwork');
  // Nothing to pick while the answer is "shrink" — a shape picker for a graphic that never
  // resizes is a control with no effect.
  await expect(page.getByTestId('map-svg-stretch-shape')).toHaveCount(0);

  // …and turning growth back on asks nothing either. THE LOGO AND THE ACCENT RAIL ARE NOT
  // OFFERED (owner walk, 2026-09-01: "if an option is not meaningful for a particular imported
  // SVG, ideally do not show it"): neither holds a bound line, so the runtime would grant either
  // of them exactly zero. One candidate, so the plate is named instead of picked.
  await mode.selectOption('grow-x');
  await expect(page.getByTestId('map-svg-stretch-shape')).toHaveCount(0);
  const only = page.getByTestId('map-svg-stretch-only');
  await expect(only).toContainText('Panel');
  await expect(only).toContainText('the only one your text sits in');
  // The line is not a note ABOUT the shape - it POINTS at it on the artwork, exactly as hovering
  // the picker used to.
  await expect(page.getByTestId('wz-preview-highlight')).toHaveCount(0);
  await only.hover();
  await expect(page.getByTestId('wz-preview-highlight')).toBeVisible();
});

test('svg import: with NOTHING chosen, a long name grows the banner instead of shrinking', async ({ page }) => {
  // GOALS goal 5, the owner's bar verbatim: "of course that text should be able to become
  // longer and the background should grow with it. I don't know why we need to choose them."
  // So this walk touches NO growth control at all - drop, next, create - and the created
  // graphic must still hug.
  await dropSvgMarkup(page, HUG_SVG, 'hug.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await createProject(page);

  const frame = previewFrame(page);
  const grown = await frame.locator('#f0').evaluate((el) => {
    const w = window as unknown as { update: (json: string) => void };
    const panel = document.querySelector('rect[data-noacg-el~="g0"]')!;
    const before = parseFloat(panel.getAttribute('width')!);
    w.update(JSON.stringify({ f0: 'Alexandra Konstantinopolous-Riva' }));
    return {
      before,
      after: parseFloat(panel.getAttribute('width')!),
      size: parseFloat(getComputedStyle(el).fontSize),
    };
  });
  expect(grown.before).toBe(600);
  expect(grown.after).toBeGreaterThan(600);
  // …and the type stayed the size the designer drew it, which is what growing is FOR.
  expect(grown.size).toBeCloseTo(56, 0);
});

test('svg import: a scorebug and a quiz board still default to shrink - growth is refused', async ({ page }) => {
  // The other half of goal 5: the default must be right on the graphics that must NOT move.
  // The shipped scorebug sample is side-by-side text with end/middle anchors on one plate -
  // every one of those refuses the measured default - and the quiz board proposes a BEHAVIOUR,
  // which declares a stage.
  await page.goto('/app');
  await dropSvg2(page, SCOREBUG_SVG);
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('shrink');
  await expect(page.getByTestId('map-svg-followers')).toHaveCount(0);

  await page.goto('/app');
  await dropSvg2(page, QUIZ_SVG);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('shrink');
});

test('svg import: a hugging panel grows with its text, and what is beyond it travels', async ({ page }) => {
  await dropSvgMarkup(page, HUG_SVG, 'hug.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-x');
  await createProject(page);

  const frame = previewFrame(page);
  // ONE stamp per participant is the whole markup edit; the emitted NOACG_LAYOUT table says
  // what each stamp does, and the runtime loops that table (docs/SVG_IMPORT_PLAN.md §6c).
  await expect(frame.locator('rect[data-noacg-el~="g0"]')).toHaveAttribute('width', '600');

  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      (window as unknown as { update: (json: string) => void }).update(JSON.stringify({ f0: v }));
      const panel = document.querySelector('rect[data-noacg-el~="g0"]')!;
      const logo = document.getElementById('Logo')!;
      return {
        panelWidth: Math.round(parseFloat(panel.getAttribute('width')!)),
        logoLeft: Math.round(logo.getBoundingClientRect().left),
        panelRight: Math.round(panel.getBoundingClientRect().right),
        frameRight: Math.round(document.querySelector('.imported-design-art')!.getBoundingClientRect().right),
        frameWidth: document.querySelector('.imported-design-art')!.getBoundingClientRect().width,
        size: parseFloat(getComputedStyle(el).fontSize),
        lines: el.children.length,
      };
    }, value);

  const rest = await run('Ada');
  expect(rest.panelWidth).toBe(600);

  // A value the panel can already hold does NOT grow it: the design's own space is spent first,
  // which is what stops a banner from widening at the fourth character of a three-letter name.
  const fits = await run('Alexandra');
  expect(fits.panelWidth).toBe(600);
  expect(fits.size).toBe(rest.size);

  // Past that room the panel widens instead of shrinking the type — the whole point of the hug —
  // and the logo drawn past the panel's right edge travels with it, keeping the gap as drawn.
  const longer = await run('Alexandra Konstantinopolous-Riva');
  expect(longer.panelWidth).toBeGreaterThan(rest.panelWidth);
  expect(longer.size).toBe(rest.size);
  expect(longer.logoLeft - rest.logoLeft).toBeGreaterThan(0);
  expect(longer.logoLeft - rest.logoLeft).toBeCloseTo(longer.panelRight - rest.panelRight, 0);

  // A name nothing could hold: the panel stops at the frame's safe margin, and what the cap
  // could not give is answered by the rest of the ladder - this panel has clear room below the
  // line, so the value wraps into it rather than shrinking. Growing off the screen is not a fit.
  const huge = await run('Alexandra Konstantinopolous-Riva de la Vega y Santa Maria del Mar y Consuelo de la Santisima Trinidad');
  expect(huge.panelRight).toBeLessThanOrEqual(huge.frameRight - huge.frameWidth * 0.04 + 1);
  expect(huge.lines > 1 || huge.size < rest.size).toBe(true);

  // And a short value again puts the artwork back exactly as drawn.
  const back = await run('Ada');
  expect(back.panelWidth).toBe(600);
  expect(back.logoLeft).toBe(rest.logoLeft);
  expect(back.size).toBe(rest.size);
});

// ── THE LADDER, AS THE OWNER RULED IT (2026-08-26) ────────────────────────────────────────
// He imported the shipped Illustrator lower third, got "shrinks to fit", and said what the
// order should be: "first I want it to get wider ... and then it should go to the next line.
// And the last thing is to shrink", shrink last "because that changes the design more". Three
// more findings came out of the same walk and each is measured below.
const ILLUSTRATOR_SVG = fileURLToPath(new URL('../docs/svg-samples/illustrator-export.svg', import.meta.url));

/** A board with real room BOTH ways: a margin to widen into and clear artwork below to wrap
 *  into, which is the one shape that can show a combination doing two things. */
const BOTH_WAYS_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect id="Board" x="300" y="200" width="900" height="110" rx="8" fill="#0d1017"/>
  <text id="Question" x="340" y="260" font-size="44" fill="#ffffff">Which city?</text>
  <rect id="Footer" x="300" y="340" width="900" height="60" rx="8" fill="#f6a623"/>
</svg>`;

test('svg import: the shipped Illustrator lower third arrives growing, not shrinking', async ({ page }) => {
  // THE BUG THE OWNER HIT. Location (x=200) and Slot (x=700) share one baseline, and the
  // side-by-side test used to refuse the WHOLE file on that pair - so a banner with three
  // stacked lines above it defaulted to shrinking. A pair sharing a baseline constrains THOSE
  // TWO lines and says nothing about the rest.
  await page.goto('/app');
  await dropSvg2(page, ILLUSTRATOR_SVG);
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('grow-xy');
  await expect(page.getByTestId('map-svg-stretch')).toContainText('read from your artwork');

  // The list is the ladder, in that order, with shrink last - never first.
  await expect(page.getByTestId('map-svg-stretch-mode').locator('option')).toHaveText([
    'The panel gets wider',
    'The panel gets wider, then taller',
    'The panel gets taller',
    'The panel stays the size you drew',
  ]);
});

test('svg import: growth is symmetrical and a line stops at whatever is drawn beside it', async ({ page }) => {
  await page.goto('/app');
  await dropSvg2(page, ILLUSTRATOR_SVG);
  // The WIDTH cap is what this pins, so the width-only rung is chosen as an author would: under
  // the measured default the value below reaches the cap and then WRAPS, and the residual gap
  // asserted at the end would be a wrapped line's slack rather than the mirrored inset.
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-x');
  await createProject(page);

  const frame = previewFrame(page);
  const run = (values: Record<string, string>) =>
    frame.locator('#f0').evaluate((_el, vals) => {
      (window as unknown as { update: (json: string) => void }).update(JSON.stringify(vals));
      const art = document.querySelector('.imported-design-art')!.getBoundingClientRect();
      const panel = document.querySelector('rect[data-noacg-el~="g0"]')!.getBoundingClientRect();
      const at = (id: string) => {
        const r = document.getElementById(id)!.getBoundingClientRect();
        return { left: +(r.left - art.left).toFixed(1), right: +(r.right - art.left).toFixed(1) };
      };
      return {
        frameWidth: art.width,
        panelLeft: +(panel.left - art.left).toFixed(1),
        panelRight: +(panel.right - art.left).toFixed(1),
        name: at('f0'),
        location: at('f2'),
        slot: at('f3'),
      };
    }, values);

  const rest = await run({ f0: 'Alexandra Riva', f2: 'HELSINKI' });
  expect(rest.panelLeft).toBe(150);
  expect(rest.panelRight).toBe(1150);

  // THE CAP IS THE DESIGN'S OWN MARGIN, MIRRORED. "We cannot have templates outgrow the
  // screen" - and the flat 4% that used to bound this let the banner run to 1843 on a 1920
  // frame, 73px past the 150px margin the designer left on the left. It now stops at exactly
  // frame - inset, and the name keeps that same margin inside it.
  const huge = await run({ f0: 'Bartholomew Featherstonehaugh-Wintersgill of the Northern Reaches and Well Beyond That Too' });
  expect(huge.panelRight).toBeCloseTo(huge.frameWidth - rest.panelLeft, 0);
  expect(huge.name.right).toBeLessThanOrEqual(huge.panelRight);
  // …and the residual gap is the mirrored inset itself, not slack: growth is spent, not wasted.
  //
  // Bounded on BOTH sides but not pinned to a single number, because only one side of it is a
  // guarantee. The panel edge is exact and font-free (it is the cap, asserted above). Where the
  // TEXT lands inside it is not: the size search stops as soon as the block fits its budget
  // rather than landing on it, so the last step can leave a pixel unspent, and how much depends
  // on the face's own metrics - this measured 50 on Windows and 51 on CI's Linux fonts, and
  // pinning it to ±0.5 failed the shard while nothing was wrong. What must never happen is the
  // gap coming out SMALLER than the inset: that is the text eating the margin it is mirroring,
  // which is the whole defect this asserts against.
  const drawnInset = rest.name.left - rest.panelLeft;
  const grownGap = huge.panelRight - huge.name.right;
  expect(grownGap).toBeGreaterThanOrEqual(drawnInset - 0.5);
  expect(grownGap).toBeLessThan(drawnInset + 3);

  // NEIGHBOURS DO NOT OVERLAP. A long Location used to run to 860 straight through the 19:30
  // Slot drawn at 700, because its room was measured out to the panel's edge. Its room is now
  // bounded by what is drawn beside it - and because widening the panel would give it nothing,
  // it does not drive the growth either.
  const long = await run({ f0: 'Alexandra Riva', f2: 'HELSINKI METROPOLITAN AREA SOUTH AND EAST DISTRICT' });
  expect(long.location.right).toBeLessThan(long.slot.left);
  expect(long.panelRight).toBe(rest.panelRight);
});

test('svg import: past the floor a value is squeezed inside its room, never painted outside it', async ({ page }) => {
  // "Nothing may ever paint outside the panel" (owner, 2026-08-26). The ladder used to stop at
  // the 55% legibility floor and REPORT the value as too long, which left it running 127px past
  // the banner and across whatever was drawn beside it. The floor still holds the type size; the
  // floored block is then squeezed to its budget, and it is still reported.
  await page.goto('/app');
  await dropSvg2(page, ILLUSTRATOR_SVG);
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await createProject(page);

  const frame = previewFrame(page);
  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      const w = window as unknown as { update: (s: string) => void; noacgTextOverflow: () => string[] };
      w.update(JSON.stringify({ f0: v }));
      const art = document.querySelector('.imported-design-art')!.getBoundingClientRect();
      const panel = document.querySelector('rect')!.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return {
        right: +(r.right - art.left).toFixed(1),
        panelRight: +(panel.right - art.left).toFixed(1),
        size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 100) / 100,
        squeezed: el.getAttribute('textLength') ?? el.children[0]?.getAttribute('textLength') ?? null,
        over: w.noacgTextOverflow(),
      };
    }, value);

  const rest = await run('Alexandra Riva');
  expect(rest.squeezed).toBeNull();
  expect(rest.over).toEqual([]);

  const huge = await run('Bartholomew Featherstonehaugh-Wintersgill of the Northern Reaches and Well Beyond That Too');
  // Past the REPORTING floor (55% of the drawn 54px) and still inside the panel - which is now
  // bought by shrinking rather than by condensing. The old rule stopped the type at 55% and spent
  // everything past it on `textLength`; since 2026-09-05 the type keeps scaling down to a hard 30%
  // floor first, because scaling leaves a letterform its own shape and condensing does not.
  expect(huge.size).toBeLessThan(54 * 0.55);
  expect(huge.size).toBeGreaterThanOrEqual(54 * 0.3 - 0.01);
  // Nothing paints outside the panel (owner, 2026-08-26) - the older ruling, kept for every value
  // a plate can still hold at SOME size, which after this change is almost all of them.
  expect(huge.right).toBeLessThanOrEqual(huge.panelRight);
  expect(huge.over).toEqual(['f0']);

  // The squeeze is not a state the graphic gets stuck in: a value that fits comes back exact.
  const back = await run('Alexandra Riva');
  expect(back.squeezed).toBeNull();
  expect(back.size).toBe(rest.size);
  expect(back.right).toBe(rest.right);
  expect(back.over).toEqual([]);
});

test('svg import: the squeeze stops at the legibility floor rather than smearing the words', async ({
  page,
}) => {
  // THE SCREENSHOT (owner, 2026-09-05). He typed his quiz question into itself until it was many
  // times its room, and the board aired a line of grey texture: `textLength` condenses to whatever
  // number it is handed, and it was handed the room. His ruling:
  //
  //   "the text should always be readable, and if it becomes too small, then that's the user's own
  //    fault, but the text should never grow on top of each other or get so dense that it's
  //    impossible to read, like in this screenshot."
  //
  // So the condensing stops at 70% of the glyphs' own advance. The value then stands wider than
  // its room - which is the older ruling (2026-08-26, nothing paints outside the panel) giving
  // way, and only ever on values no legible rendering could have contained.
  await page.goto('/app');
  await dropSvg2(page, ILLUSTRATOR_SVG);
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await createProject(page);

  const ratio = await previewFrame(page)
    .locator('#f0')
    .evaluate((el, v) => {
      const w = window as unknown as { update: (s: string) => void; noacgTextOverflow: () => string[] };
      w.update(JSON.stringify({ f0: v }));
      const painted = (el.firstElementChild ?? el) as unknown as SVGTextContentElement;
      const asked = painted.getAttribute('textLength');
      painted.removeAttribute('textLength');
      const natural = painted.getComputedTextLength();
      if (asked !== null) painted.setAttribute('textLength', asked);
      return { condensed: asked === null ? 1 : Number(asked) / natural, over: w.noacgTextOverflow() };
    }, 'Which city hosts the 2032 Olympics? '.repeat(12));

  // Never below the floor - the whole point - and never condensed further than it needs to be.
  expect(ratio.condensed).toBeGreaterThanOrEqual(0.7 - 0.001);
  expect(ratio.condensed).toBeLessThanOrEqual(1);
  // Still honestly reported, so the operator's warning is what tells them to shorten it.
  expect(ratio.over).toEqual(['f0']);
});

test('svg import: wider THEN wrap is one choice, and it is two rows on one panel', async ({ page }) => {
  // The owner accepted the three options and then said a real graphic sometimes wants a
  // COMBINATION: "we should let the customer choose whatever they want, that's the most
  // important thing." It needs no new format - the runtime already spends width before the fit
  // and height after it, so "both" is two ordinary rows naming one element.
  await dropSvgMarkup(page, BOTH_WAYS_SVG, 'both-ways.svg');
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-xy');
  await createProject(page);

  const js = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  const table = /var NOACG_LAYOUT = \{[\s\S]*?\n\};/.exec(js)![0];
  expect(table).toContain("axis: 'x'");
  expect(table).toContain("axis: 'y'");

  const frame = previewFrame(page);
  // ONE element, TWO stamps. A single-valued attribute would let the second row erase the first.
  await expect(frame.locator('#Board')).toHaveAttribute('data-noacg-el', 'g0 g1');

  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      (window as unknown as { update: (s: string) => void }).update(JSON.stringify({ f0: v }));
      const board = document.getElementById('Board')!;
      const art = document.querySelector('.imported-design-art')!.getBoundingClientRect();
      const bb = board.getBoundingClientRect();
      return {
        width: Math.round(parseFloat(board.getAttribute('width')!)),
        height: Math.round(parseFloat(board.getAttribute('height')!)),
        right: Math.round(bb.right - art.left),
        bottom: Math.round(bb.bottom - art.top),
        footTop: Math.round(document.getElementById('Footer')!.getBoundingClientRect().top - art.top),
        lines: el.children.length,
        size: parseFloat(getComputedStyle(el).fontSize),
      };
    }, value);

  const rest = await run('Which city?');
  expect(rest.width).toBe(900);
  expect(rest.height).toBe(110);

  // WIDER FIRST. A value that only needs a little more room widens the board and stays on one
  // line at the drawn size - the wrap rung is not reached.
  const wider = await run('Which city hosted the very first modern games?');
  expect(wider.width).toBeGreaterThan(900);
  expect(wider.lines).toBeLessThan(2);
  expect(wider.size).toBe(rest.size);

  // THEN WRAP. Past the mirrored margin the board stops widening and the value takes the height
  // below instead - still at the size the designer drew, because shrinking is the last rung.
  const wrapped = await run('Which city hosted the first modern Olympic Games '.repeat(12));
  expect(wrapped.right).toBe(1920 - 300); // the 300px left inset, mirrored
  expect(wrapped.lines).toBeGreaterThan(1);
  expect(wrapped.size).toBe(rest.size);
  expect(wrapped.bottom).toBeLessThanOrEqual(1080 - 200); // and the top inset, mirrored downwards
  expect(wrapped.footTop - rest.footTop).toBeCloseTo(wrapped.bottom - rest.bottom, 0);

  // Both rows rest together: a short value puts the artwork back exactly as drawn. Two rows on
  // one element is where that could break - a follower captured after the first row had already
  // moved it would record the moved pose as its resting one.
  const back = await run('Which city?');
  expect(back.width).toBe(900);
  expect(back.height).toBe(110);
  expect(back.footTop).toBe(rest.footTop);
});

test('svg import: retyping a sample repaints the PREVIEW, not a second canvas', async ({ page }) => {
  // A real value has to be tryable on this step — it is where lengths are decided — and the
  // canvas that answers is the PREVIEW, because it is the only one running the emitted fit
  // (plan §6a step 1). The step's own render of the markup stays off screen and stays exactly
  // as the designer drew it: it exists for measureOutline, and a second painted canvas is what
  // was showing values as clipped that the ladder had already made fit.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Presenter" x="20" y="80" font-size="30" fill="#fff">Alexandra Riva</text>
    </svg>`,
    'repaint.svg',
  );
  await page.locator('.wz-next').click();

  const drawn = page.getByTestId('map-svg-stage').locator('[data-noacg-candidate="t0"]');
  const live = page.frameLocator('.wz-side iframe').locator('#f0');
  await expect(drawn).toHaveText('Alexandra Riva');
  await expect(live).toHaveText('Alexandra Riva');

  await page.getByTestId('map-svg-sample-t0').fill('Zephyrine');
  await expect(live).toHaveText('Zephyrine');
  await expect(drawn).toHaveText('Alexandra Riva');

  // Switched off and answered "keep", the layer is not a field any more and the graphic keeps
  // the drawn text.
  await untickTextRow(page, 't0');
  await expect(page.frameLocator('.wz-side iframe').locator('[data-noacg-candidate="t0"]')).toHaveText(
    'Alexandra Riva',
  );
  await expect(drawn).toHaveText('Alexandra Riva');
});

test('svg import: hovering a checklist row highlights that layer in the preview', async ({ page }) => {
  // "Which layer is this" is the only question the step really has to answer, and it is now
  // answered on the one canvas (plan §6a step 1): the preview keeps the import-time candidate
  // markers, composeDocument's canvasControl channel pushes the tracked layer's rect every
  // frame, and the highlight rides a layer wearing the frame's own transform. Nothing reaches
  // into the iframe — it carries no allow-same-origin, like every other preview surface.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Home" x="20" y="60" font-size="30" fill="#fff">Rovers</text>
      <text id="Away" x="20" y="150" font-size="30" fill="#fff">City</text>
    </svg>`,
    'hover.svg',
  );
  await page.locator('.wz-next').click();
  await expect(page.frameLocator('.wz-side iframe').locator('#f1')).toHaveText('City');

  const highlight = page.getByTestId('wz-preview-highlight');
  await expect(highlight).toHaveCount(0);

  // The lower layer: the box lands over it, not over the one above.
  await page.getByTestId('map-svg-row-t1').hover();
  await expect(highlight).toBeVisible();
  const over = async (fieldId: string) => {
    const [hl, target] = await Promise.all([
      highlight.boundingBox(),
      page.frameLocator('.wz-side iframe').locator(fieldId).boundingBox(),
    ]);
    if (!hl || !target) return false;
    const cx = target.x + target.width / 2;
    const cy = target.y + target.height / 2;
    return cx > hl.x && cx < hl.x + hl.width && cy > hl.y && cy < hl.y + hl.height;
  };
  expect(await over('#f1')).toBe(true);
  expect(await over('#f0')).toBe(false);

  // And it follows the hover to the other row rather than staying where it was.
  await page.getByTestId('map-svg-row-t0').hover();
  await expect.poll(() => over('#f0')).toBe(true);
  expect(await over('#f1')).toBe(false);

  // Off the list, nothing is lit.
  await page.getByTestId('map-svg-fields').locator('h3').hover();
  await expect(highlight).toHaveCount(0);
});

// ── THE ILLUSTRATOR PANEL IS A PATH (owner walk 2026-08-28, sweep finding 4) ─────────────
// "Draw the panel as a rectangle" is unfollowable in Illustrator: a rounded rectangle exports
// as a <path> (Illustrator never writes rx), so the archetypal premium lower third fell out of
// the growth inventory, the ladder's every option degraded to shrink, and the dropdown read as
// dead. A path whose data reads as a rectangle now qualifies exactly like a <rect>; the runtime
// grows it by shifting the far half of its points, which keeps the drawn corner radii.
const PATH_PANEL_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <style type="text/css">
    .name{font-size:56px;fill:#ffffff;}
    .role{font-size:30px;fill:#b7bcc4;}
    .strap{font-size:22px;fill:#7f8792;letter-spacing:2;}
  </style>
  <g id="Plate">
    <path fill="#141a25" d="M148,760h1024c4.4,0,8,3.6,8,8v174c0,4.4-3.6,8-8,8H148c-4.4,0-8-3.6-8-8V768C140,763.6,143.6,760,148,760z"/>
  </g>
  <rect id="Accent" x="140" y="760" width="10" height="190" fill="#f6a623"/>
  <text id="Name" class="name" transform="matrix(1 0 0 1 190 840)">Alexandra Riva</text>
  <text id="Role" class="role" transform="matrix(1 0 0 1 190 892)">Chief Correspondent</text>
  <text id="Strap" class="strap" transform="matrix(1 0 0 1 190 932)">THE LONG WAY NORTH</text>
</svg>`;

test('svg import: a rounded-rectangle PATH is the panel that grows, and the ladder options differ', async ({ page }) => {
  await dropSvgMarkup(page, PATH_PANEL_SVG, 'path-panel.svg');
  await page.locator('.wz-next').click();

  // The measured default reads the path as the banner: the whole ladder, on the Plate. The 10px
  // accent rail holds none of the three lines, so it is not an option and no question is asked -
  // the Plate is named instead.
  const mode = page.getByTestId('map-svg-stretch-mode');
  await expect(mode).toHaveValue('grow-xy');
  await expect(page.getByTestId('map-svg-stretch-shape')).toHaveCount(0);
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Plate');

  await createProject(page);
  const frame = previewFrame(page);
  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      (window as unknown as { update: (s: string) => void }).update(JSON.stringify({ f0: v }));
      const plate = document.querySelector('.imported-design-art path') as SVGPathElement;
      const bb = plate.getBBox();
      return {
        panelWidth: Math.round(bb.width),
        curves: /[Cc]/.test(plate.getAttribute('d') ?? ''),
        size: parseFloat(getComputedStyle(el).fontSize),
      };
    }, value);

  const rest = await run('Alexandra Riva');
  expect(rest.panelWidth).toBe(1040);
  expect(rest.size).toBe(56);

  // The defect on the owner's walk: this value shrank while "panel gets wider" was chosen.
  // Now the panel widens, the type stays the size the designer drew, and the corner curves
  // are still in the data - the radii are the designer's, not a scale artifact.
  const long = await run('Alexandra-Wilhelmina von Rothenburg-Askainen');
  expect(long.panelWidth).toBeGreaterThan(1200);
  expect(long.size).toBe(56);
  expect(long.curves).toBe(true);

  // And it rests: a short value puts the drawn data back verbatim.
  const back = await run('Alexandra Riva');
  expect(back.panelWidth).toBe(1040);
});

test('svg import: the tracking the designer set survives the import untouched', async ({ page }) => {
  // Illustrator writes Character-panel tracking as UNITLESS letter-spacing ('letter-spacing:2'),
  // which a standalone .svg renders as 2px - and which the HTML CSS parser silently drops once
  // the SVG is inlined into the template, tightening type the designer spaced on purpose. The
  // import normalizes the number to px; nothing else about the declaration changes. NEVER alter
  // tracking (owner, 2026-08-28) - the ladder's own explicit rungs are the only sanctioned
  // type changes.
  await dropSvgMarkup(page, PATH_PANEL_SVG, 'path-panel.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  const spacing = await previewFrame(page)
    .locator('#f2')
    .evaluate((el) => getComputedStyle(el).letterSpacing);
  expect(spacing).toBe('2px');
});

// ── AN END CAP BOUNDS THE TEXT AND TRAVELS WITH THE PANEL (owner walk 2026-08-28) ────────
// A banner may carry decorative furniture at its far end - a gradient end-cap, a closing bar.
// Text must stay BETWEEN the caps, never on top of them; and because the cap is the panel's own
// furniture, it rides the growing edge instead of penning the line the way a neighbouring label
// would (a penned line never grows its panel, a capped one still does).
test('svg import: text stays off a decorative end-cap, and the cap travels when the panel grows', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
      <g id="Plate">
        <path fill="#141a25" d="M148,760h1024c4.4,0,8,3.6,8,8v174c0,4.4-3.6,8-8,8H148c-4.4,0-8-3.6-8-8V768C140,763.6,143.6,760,148,760z"/>
      </g>
      <rect id="Endcap" x="1156" y="760" width="24" height="190" fill="#f6a623"/>
      <text id="Name" x="190" y="840" font-size="56" fill="#ffffff">Ada</text>
      <text id="Role" x="190" y="892" font-size="30" fill="#b7bcc4">Correspondent</text>
    </svg>`,
    'end-cap.svg',
  );
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('grow-xy');
  // The cap's own behaviour is a WIDTH story, so it is pinned on the width-only rung.
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-x');
  await createProject(page);

  const frame = previewFrame(page);
  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      const w = window as unknown as {
        update: (s: string) => void;
        svgFitRoom: Record<string, { width: number; penned: boolean }>;
      };
      w.update(JSON.stringify({ f0: v }));
      const cap = document.getElementById('Endcap')!.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      return {
        penned: w.svgFitRoom.f0.penned,
        gapToCap: cap.left - box.right,
        size: parseFloat(getComputedStyle(el).fontSize),
        capMoved: document.getElementById('Endcap')!.getAttribute('transform'),
      };
    }, value);

  // At rest the cap bounds the room without penning the line - the room is the panel's, less
  // the cap, so growth is still this line's to drive.
  const rest = await run('Ada');
  expect(rest.penned).toBe(false);
  expect(rest.capMoved).toBeNull();

  // A long value grows the panel; the cap rides the moving edge and the text still ends a
  // margin short of it, at the size the designer drew. Only the small side of the gap is a
  // guarantee (e2e/AGENTS.md: the fit stops as soon as the block fits, so slack varies).
  const long = await run('Alexandra-Wilhelmina von Rothenburg');
  expect(long.size).toBe(56);
  expect(long.capMoved).toContain('translate(');
  expect(long.gapToCap).toBeGreaterThan(0);
});

test('svg import: a rail spanning the panel still stretches after the reader edits what travels', async ({ page }) => {
  // WHY THIS EXISTS. The per-follower "Moves out of the way / Grows by the same amount" picker is
  // gone (owner 2026-09-05, settled on the corpus 2026-09-06 - docs/TEXT_BOX_BINDING.md, "What
  // travels is not a question"), because a row in that list can never be a layer that should
  // stretch. What DOES stretch is furniture drawn to the panel's own two edges, and the runtime
  // finds it itself - but it only looked while the rule carried NO declared follower list. So the
  // moment a reader dropped one row, the rail on their own lower third silently stopped growing
  // with its plate, and after the picker went there was no control left to bring it back.
  //
  // A board with an amber rail down its full height, a caption below it, and a strap pinned to
  // the frame bottom that geometry wrongly proposes - so dropping the strap is an ordinary edit
  // that leaves a real declared list behind.
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
      <rect id="Board" x="300" y="200" width="1200" height="120" rx="8" fill="#0d1017"/>
      <rect id="Rail" x="300" y="200" width="12" height="120" fill="#f6a623"/>
      <text id="Question" x="340" y="272" font-size="44" fill="#ffffff">Which city?</text>
      <rect id="Caption" x="300" y="360" width="1200" height="60" rx="8" fill="#20242c"/>
      <rect id="Strap" x="0" y="1000" width="1000" height="60" fill="#20242c"/>
    </svg>`,
    'rail.svg',
  );
  await page.locator('.wz-next').click();
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');
  await expect(page.getByTestId('map-svg-stretch-only')).toContainText('Board');

  // The rail is never a row: it is not drawn past the growing edge, it is drawn ACROSS the panel.
  await expect(page.getByTestId('map-svg-followers')).not.toContainText('Rail');
  await page.getByTestId('map-svg-follower-drop-s2').click(); // the frame-bottom strap
  await expect(page.getByTestId('map-svg-followers')).not.toContainText('read from your artwork');
  await createProject(page);

  const frame = previewFrame(page);
  const run = (value: string) =>
    frame.locator('#f0').evaluate((el, v) => {
      const w = window as unknown as { update: (s: string) => void };
      w.update(JSON.stringify({ f0: v }));
      return {
        board: document.getElementById('Board')!.getBoundingClientRect().height,
        rail: document.getElementById('Rail')!.getBoundingClientRect().height,
        captionMoved: document.getElementById('Caption')!.getAttribute('transform'),
      };
    }, value);

  const rest = await run('Which city?');
  expect(rest.captionMoved).toBeNull();

  // A value long enough to wrap makes the board taller. The rail grows with it, by the same
  // amount, so the strip the board gained is not left bare - and the caption the reader kept on
  // the list still travels.
  const long = await run(
    'Which of these famous chess openings begins one e four, e five, two knight f three?',
  );
  expect(long.board).toBeGreaterThan(rest.board + 1);
  expect(long.rail - rest.rail).toBeCloseTo(long.board - rest.board, 0);
  expect(long.captionMoved).toContain('translate(');
});

test('svg import: an all-outlined file does not offer drawing text over the drawn type', async ({ page }) => {
  // The backlog's outline-fallback ruling (2026-08-28): on a file with no text layers, a drawn
  // box could only land ON TOP of the outlined type, with nothing removing the shapes under it.
  // Until an erase road exists the honest door is re-export, so the draw-a-field offer stands
  // down; a file WITH text layers keeps it (pinned by the add-a-field cases above).
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <path d="M10 10 L390 10 L390 190 L10 190 Z" fill="#161a22"/>
      <path d="M40 90 l40 0 l0 30 l-40 0 Z" fill="#fff"/>
    </svg>`,
    'outlined.svg',
  );
  await expect(page.getByTestId('import-svg-nolayers')).toContainText('re-export');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-outlined')).toBeVisible();
  await expect(page.getByTestId('map-svg-added')).toHaveCount(0);
});

// The owner's own board, drawn 2026-09-02 and walked the same day: every plate is a portrait
// rectangle plus a rotation, because he tilted the composition deliberately. Read without their
// transforms, those rectangles are not where the shapes are - which is how the growth default
// came to name an ANSWER plate and drag two of the four answers with it, while the question
// shrank to 62% of the size it was drawn at inside a plate with room to spare.
const OWNER_QUIZ = fileURLToPath(
  new URL('fixtures/svg-corpus/illustrator-owner-quiz-board-rotated.svg', import.meta.url),
);

test('svg import: a rotated panel is measured where it is PAINTED, so the right plate grows', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();

  // A BOARD THE AUDIENCE SEES AGAIN KEEPS A FIXED BOX, so nothing grows unasked (the doctrine's
  // rule 3, owner 2026-09-02: "a quiz page should be the same for each question"). The picker
  // that names the shape only exists once somebody asks for growth, so the rest of this test -
  // which is about WHICH shape, a different question - turns it on first.
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('shrink');
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');

  // The picker prints each shape's size. The question's plate is a WIDE BAND - 1238 x 259 - and
  // reading its attributes alone said 231 x 1233, the portrait rectangle it was before the
  // rotation. Every "x" here is the shape list's own separator.
  const shapes = page.getByTestId('map-svg-stretch-shape');
  await expect(shapes).toContainText('q bg');
  const labels = await shapes.locator('option').allTextContents();
  const question = labels.find((l) => l.startsWith('q bg')) ?? '';
  expect(question).toContain('1238');
  expect(question).toContain('259');
  expect(question).not.toContain('1233');

  // And the consequence: the shape offered to grow is the question's own plate, not one of the
  // answer plates that only led the list because they were measured un-rotated.
  await expect(shapes).toHaveValue(
    await shapes.locator('option', { hasText: 'q bg' }).getAttribute('value') ?? '',
  );

  // The question then survives a real value at the size it was drawn at, rather than shrinking -
  // measured under the DEFAULT, which is the board keeping every box exactly as drawn. The plate
  // has the room without growing, which is what makes the fixed box affordable here.
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await createProject(page);
  const drawn = await previewFrame(page)
    .locator('#f0')
    .evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const after = await previewFrame(page)
    .locator('#f0')
    .evaluate((el) => {
      (window as unknown as { update: (s: string) => void }).update(
        JSON.stringify({
          f0: 'Which of these players has held the world championship title for the longest unbroken run?',
        }),
      );
      return parseFloat(getComputedStyle(el).fontSize);
    });
  expect(drawn).toBeGreaterThan(0);
  expect(after).toBe(drawn);
});

test('svg import: a line centred in its box keeps its size, its centre and its neighbours', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await createProject(page);

  // Three lengths through the same board: one line, two, three. The question is drawn in the
  // vertical middle of a plate 259 units tall, so all three have room at the size it was drawn
  // at - and before the alignment model the second one shrank to 62% on a single line, because a
  // block could only ever grow DOWNWARD and the plate's top gap was being mirrored as a margin.
  const measure = (value: string) =>
    previewFrame(page)
      .locator('#f0')
      .evaluate((el, v) => {
        const w = window as unknown as {
          update: (s: string) => void;
          svgFitContainer: (n: Element) => Element | null;
          svgLocalBox: (p: Element | null, t: Element) => { cx: number; cy: number } | null;
        };
        w.update(JSON.stringify({ f0: v }));
        const text = el as unknown as SVGGraphicsElement;
        const bb = text.getBBox();
        const box = w.svgLocalBox(w.svgFitContainer(el), el);
        const doc = el.ownerDocument;
        const root = doc.querySelector('svg')!.getBoundingClientRect();
        const answerTop = (id: string) => {
          const r = doc.getElementById(id)!.getBoundingClientRect();
          return Math.round(((r.top - root.top) / root.height) * 700);
        };
        return {
          size: parseFloat(getComputedStyle(el).fontSize),
          lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
          offCentreX: Math.round(bb.x + bb.width / 2 - (box?.cx ?? 0)),
          offCentreY: Math.round(bb.y + bb.height / 2 - (box?.cy ?? 0)),
          answers: ['f1', 'f2', 'f3', 'f4'].map(answerTop),
        };
      }, value);

  const short = await measure('Who is best?');
  const long = await measure(
    'Which of these players has held the world championship title for the longest unbroken run?',
  );
  const longest = await measure(
    'Which of these grandmasters has held the undisputed world championship title for the longest unbroken run across the entire modern era of the game?',
  );

  // It wraps rather than shrinking: more lines as the value grows, one size - the drawn one.
  // The COUNTS moved on 2026-09-05, when a centred line stopped being handed its own drawn width
  // as its room: each line may now use the plate's width, so the longest question needs two lines
  // where it used to need three. That is the ratified order spending its first rung properly
  // (fill the room, THEN wrap), and it is what the size assertions below have always been for.
  expect([short.lines, long.lines, longest.lines]).toEqual([1, 2, 2]);
  expect(long.size).toBe(short.size);
  expect(longest.size).toBe(short.size);

  // Centred on the plate on BOTH axes (owner, 2026-09-02: "by default a centered text should
  // snap both vertically and horizontally"), and holding that centre rather than sliding down as
  // it gains lines. Before the vertical snap the block sat 9 units above the plate's true middle
  // at every length - constant, but a position nobody chose.
  // Within a unit of the centre, not exactly on it: these are rounded measurements of a block
  // whose own ink box is not symmetric, so a rounding boundary is not a defect. What the rule
  // also promises is that the number does not MOVE as the value grows, which is the second
  // pair of assertions.
  for (const state of [short, long, longest]) {
    expect(Math.abs(state.offCentreX)).toBeLessThanOrEqual(1);
    expect(Math.abs(state.offCentreY)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(long.offCentreY - short.offCentreY)).toBeLessThanOrEqual(1);
  expect(Math.abs(longest.offCentreY - short.offCentreY)).toBeLessThanOrEqual(1);
  expect(Math.abs(longest.offCentreX - short.offCentreX)).toBeLessThanOrEqual(1);

  // And nothing else on the board moves, because the plate never has to grow to hold the question.
  expect(long.answers).toEqual(short.answers);
  expect(longest.answers).toEqual(short.answers);
});

// THE SURFACE THE OWNER ACTUALLY WALKS. The test above proves the fit in the EDITOR, through
// update() - and on 2026-09-02 a walk of the same board in the WIZARD reported the opposite
// (a short question hard left of the plate, a long one running off the board on one line) and
// filed both as reproduced defects. Neither reproduces: measured here at four lengths, through
// the step's own Text box, with the preview settled, the block is on the plate's centre every
// time and a 147-character question wraps to three lines at the size it was drawn at.
//
// So this test exists for the gap rather than for the rule: the wizard preview is a different
// document, built by a different path, and nothing was measuring it. A claim about it can now
// only be filed against a measurement.
test('svg import: the question is centred and wraps in the WIZARD preview too, at every length', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();

  // The question's own row, found by the words the file draws rather than by a marker id - the
  // ids are minted per import and say nothing to a reader of this test.
  const rows = await page.locator('[data-testid^="map-svg-sample-"]').all();
  let question = rows[0];
  for (const row of rows) if ((await row.inputValue()).startsWith('Question 1')) question = row;

  const frame = page.frameLocator('.wz-side iframe');
  const stage = page.locator('.wz-side .wz-stage');
  const measure = async (value: string) => {
    await question.fill(value);
    // Wait out the debounced rebuild on the stage's own stamp, never a sleep (e2e/AGENTS.md):
    // pending is set the moment the template changes and cleared when the new document has
    // LOADED. The entrance may still be running, which is fine here - everything measured below
    // is in the artwork's own units, which no transform above it can move.
    await expect(stage).not.toHaveAttribute('data-doc-pending', '1', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-doc-rev', /\d/, { timeout: 20_000 });
    return frame.locator('#f0').evaluate((el) => {
      const w = window as unknown as {
        svgFitContainer: (n: Element) => Element | null;
        svgLocalBox: (p: Element | null, t: Element) => { cx: number; cy: number } | null;
      };
      const bb = (el as unknown as SVGGraphicsElement).getBBox();
      const box = w.svgLocalBox(w.svgFitContainer(el), el);
      return {
        size: parseFloat(getComputedStyle(el).fontSize),
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        offCentreX: Math.round(bb.x + bb.width / 2 - (box?.cx ?? 0)),
        offCentreY: Math.round(bb.y + bb.height / 2 - (box?.cy ?? 0)),
      };
    });
  };

  const short = await measure('Who won?');
  // Close to the length he drew, which is where the centring used to look right by coincidence.
  const medium = await measure('Which of these players has held the title longest?');
  const long = await measure(
    'Which of these grandmasters has held the undisputed world championship title for the longest unbroken run across the entire modern era of the game?',
  );

  // Two on the longest since 2026-09-05, for the reason the editor-side twin of this test states:
  // a centred line's room is the plate rather than its own drawn width, so each line holds more.
  expect([short.lines, medium.lines, long.lines]).toEqual([1, 1, 2]);
  for (const state of [medium, long]) expect(state.size).toBe(short.size);
  for (const state of [short, medium, long]) {
    expect(Math.abs(state.offCentreX)).toBeLessThanOrEqual(1);
    expect(Math.abs(state.offCentreY)).toBeLessThanOrEqual(1);
  }
});

// ── THE OPTION DOES WHAT IT SAYS, WHATEVER YOU DID BEFORE IT (owner, 2026-09-05) ──
// "It would be really nice if the text just does exactly what the option tells it to do and
// nothing else." And the standard he set for the step around it: "when I just mess around and
// change a lot of things, it breaks. And it should be allowed to test and try to mess with it,
// and it shouldn't break."
//
// Every existing test here sets the controls once and asserts once, which is exactly the shape
// that cannot see this class of fault: a result that depends on the ORDER of the changes passes
// any test that only ever takes one route to a setting. So this one walks the four modes twice,
// in two different orders, and asserts the same mode gives the same answer both times.
test('svg import: the too-long mode answers the same however the reader got there', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();

  const rows = await page.locator('[data-testid^="map-svg-sample-"]').all();
  let question = rows[0];
  for (const row of rows) if ((await row.inputValue()).startsWith('Question 1')) question = row;
  const LONG =
    'Which of these grandmasters has held the undisputed world championship title for the longest unbroken run across the entire modern era of the game?';
  await question.fill(LONG);

  const frame = page.frameLocator('.wz-side iframe');
  const stage = page.locator('.wz-side .wz-stage');
  const mode = page.getByTestId('map-svg-stretch-mode');
  const settle = async () => {
    await expect(stage).not.toHaveAttribute('data-doc-pending', '1', { timeout: 20_000 });
    await expect(stage).toHaveAttribute('data-doc-rev', /\d/, { timeout: 20_000 });
    // AND THE FACE HAS TO HAVE ARRIVED, because the fit runs TWICE and only the second pass is
    // measured against the type the design is actually drawn in. `svg.ts` ends its fit block with
    // `document.fonts.ready.then(refitSvgText)`: the first pass runs at DOMContentLoaded against
    // whatever face is resolved by then, and the second re-measures once the real one has loaded.
    // The two attributes above say the DOCUMENT was rebuilt, which is a different claim, so a
    // measurement taken here could land between the passes.
    //
    // WHAT THAT COST: on 2026-09-06 this test failed with `wide.w` and `fixed.w` both 1238 - the
    // plate had not grown AT ALL under grow-x, because in a fallback face the 140 W's fit after
    // shrinking and nothing ever needed to widen. Green on main and green again on a re-run of the
    // same sha half an hour later, so it read as a regression in whichever branch met it
    // (docs/backlog/a-panel-growth-check-passes-and-fails-on-identical-code.md). The 2026-09-05
    // occurrence, with the same two numbers, was treated as a wrapping problem instead.
    //
    // The runtime registers its `.then` at load, so by the time this one resolves `refitSvgText`
    // has already run - the extra macrotask is only insurance for a browser that orders them
    // otherwise.
    await frame.locator('#f0').evaluate(async (el) => {
      const fonts = el.ownerDocument.fonts;
      if (!fonts) return;
      await fonts.ready;
      await new Promise((done) => setTimeout(done, 0));
    });
  };

  // WHICH shape is the question's plate, decided ONCE, while the question is short enough to sit
  // inside it. `svgFitContainer` answers by containment, so asked about an already-wrapped block
  // that has outgrown its plate it correctly answers "nothing holds this" - true, and useless as
  // a way to watch the plate. (It cost an hour: a probe that asked it every time reported the
  // plate had VANISHED under two of the four modes, which is a fact about the question and not
  // about the artwork.) The index is stable because nothing here adds or removes shapes.
  await settle();
  const plateIndex = await frame.locator('#f0').evaluate((el) => {
    const w = window as unknown as { svgFitContainer: (n: Element) => Element | null };
    const art = el.ownerDocument.querySelector('.imported-design-art')!;
    const shapes = Array.from(art.querySelectorAll('rect, path, polygon, ellipse, circle'));
    return shapes.indexOf(w.svgFitContainer(el) as Element);
  });
  expect(plateIndex).toBeGreaterThanOrEqual(0);

  /** Pick a mode, wait for the rebuilt document, and read what the words and the plate did. */
  const apply = async (value: string) => {
    await mode.selectOption(value);
    await settle();
    return frame.locator('#f0').evaluate((el, idx) => {
      const art = el.ownerDocument.querySelector('.imported-design-art')!;
      const plate = art.querySelectorAll('rect, path, polygon, ellipse, circle')[idx];
      const p = plate.getBoundingClientRect();
      const t = (el as unknown as SVGGraphicsElement).getBoundingClientRect();
      return {
        size: Math.round(parseFloat(getComputedStyle(el).fontSize) * 10) / 10,
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        w: Math.round(p.width),
        h: Math.round(p.height),
        // How far the words stand OUTSIDE the plate they were drawn in, on the worst edge.
        spill: Math.round(Math.max(0, p.top - t.top, t.bottom - p.bottom, p.left - t.left, t.right - p.right)),
      };
    }, plateIndex);
  };

  // FIRST WALK, in the order the dropdown lists them.
  const first: Record<string, Awaited<ReturnType<typeof apply>>> = {};
  for (const m of ['grow-x', 'grow-xy', 'grow-y', 'shrink']) first[m] = await apply(m);

  // SECOND WALK, backwards, with a detour through each one - the "messing around" he described.
  const second: Record<string, Awaited<ReturnType<typeof apply>>> = {};
  for (const m of ['shrink', 'grow-y', 'grow-xy', 'grow-x']) second[m] = await apply(m);

  // THE CONTRACT: a mode is a description of what happens, not a step in a sequence.
  for (const m of ['grow-x', 'grow-xy', 'grow-y', 'shrink']) {
    expect(second[m], `${m} answered differently the second time round`).toEqual(first[m]);
  }

  // AND EACH OPTION DOES WHAT ITS LABEL SAYS - on copy long enough for the rungs to diverge.
  // Every label names the PANEL since 2026-09-05, because the panel is the only thing that
  // differs: the text wraps under all four and shrinks under all four. Measured on this board at
  // 147 and 295 characters, the four give byte-identical text, which is why two labels that named
  // the TEXT read as a control that did nothing.
  // WIDTH IS ASKED WITH A WORD THAT CANNOT WRAP. A value with spaces in it makes this
  // platform-dependent: on Windows metrics the question needed the extra width, on CI's Linux
  // fonts the same words wrapped inside the drawn plate and the panel never grew - the assertion
  // below came back 1238 against an expected >1246 and took main red (2026-09-05). One long
  // unbreakable token removes the question of where a space falls: wrapping cannot help it, so
  // width is the only rung that can, on any machine's fonts.
  //
  // THAT WAS NOT THE WHOLE CAUSE. The identical pair of numbers came back on 2026-09-06, past
  // that fix, because the measurement could be taken between the fit's two passes - so `settle()`
  // now waits for the face as well. Both halves are needed: this line decides that growth is the
  // only rung available, and the wait decides that the growth is measured in the real type.
  await question.fill('W'.repeat(140));
  const wide = await apply('grow-x');
  const both = await apply('grow-xy');
  let fixed = await apply('shrink');

  // WHAT THE TYPE ACTUALLY WAS, read before the assertions so a failure carries its own
  // diagnosis instead of costing an afternoon of archaeology. Every earlier occurrence of this
  // failure reported two plate widths and nothing about the face they were measured in, which is
  // the one fact that separates "the panel is broken" from "the panel was measured too early".
  const face = await frame.locator('#f0').evaluate((el) => ({
    family: getComputedStyle(el).fontFamily,
    status: el.ownerDocument.fonts ? el.ownerDocument.fonts.status : 'unsupported',
    textW: Math.round(el.getBoundingClientRect().width),
  }));
  const measured =
    `plate ${fixed.w}px under shrink, ${wide.w}px under grow-x; ` +
    `the words measure ${face.textW}px in ${face.family} (fonts ${face.status})`;

  const ROTATION_SLACK = 8;
  // This board's plates are drawn as portrait rects on a -88.68° rotation, so growing one along
  // its own axis moves its SCREEN rectangle a little on the other axis too - measured 262 against
  // 259. That is the rotation, not the panel getting taller, and an equality here would be an
  // assertion tighter than the thing it asserts (e2e/AGENTS.md).
  // Equal widths here mean the plate never grew, which is a different fault from growing too
  // little - so the message says which one happened and in what type.
  expect(wide.w, `grow-x did not widen the plate: ${measured}`).toBeGreaterThan(fixed.w + ROTATION_SLACK);
  expect(Math.abs(wide.h - fixed.h), `grow-x made the plate taller: ${measured}`).toBeLessThan(ROTATION_SLACK);
  expect(both.w, `grow-xy did not widen the plate: ${measured}`).toBeGreaterThan(fixed.w + ROTATION_SLACK);

  // HEIGHT IS ASKED WITH WORDS, because wrapping is the whole point of a taller panel.
  await question.fill([LONG, LONG, LONG, LONG].join(' '));
  const tall = await apply('grow-y');
  fixed = await apply('shrink');
  expect(Math.abs(tall.w - fixed.w)).toBeLessThan(ROTATION_SLACK); // taller, never wider

  // NOTHING STANDS OUTSIDE THE PLATE IT WAS DRAWN IN. The option that keeps its panel height
  // honours that by shrinking, which is the ladder's last rung doing its job.
  expect(fixed.spill).toBe(0);

  // AND THE OPTION THAT PROMISES A TALLER PANEL DELIVERS ONE. Until 2026-09-08 these two lines
  // pinned the opposite: the plate stayed at the 259px it was drawn at while the fit wrapped to
  // eight lines at full size, and the words stood ~40px outside it. Two readings disagreed about
  // the same panel - the offer measured the question plate's own room to the frame (384px) while
  // the four answer plates that travel with it had 49px, and the apply measured a CENTRED block's
  // overflow as if it were composed against the top of its box, so it asked for nothing at all.
  // Measured here: 285px against a drawn 259, seven lines at 29.2px, nothing outside the plate.
  const heights =
    `plate ${fixed.h}px under shrink, ${tall.h}px under grow-y; ` +
    `grow-y wrapped to ${tall.lines} lines at ${tall.size}px and spilled ${tall.spill}px`;
  expect(tall.h, `grow-y did not make the plate taller: ${heights}`).toBeGreaterThan(
    fixed.h + ROTATION_SLACK,
  );
  expect(tall.spill, `grow-y left words outside the plate: ${heights}`).toBe(0);
});

// A GRAPHIC THE AUDIENCE SEES AGAIN KEEPS A FIXED BOX (owner, 2026-09-02, docs/TEXT_BOX_BINDING.md
// "THE FIT DOCTRINE" rule 3): "a quiz page should be the same for each question. It can't live
// depending on how long the text is." The board says so itself, before anybody picks a behaviour
// on the step: four answer plates of one size, standing apart, each holding its own line.
//
// Not a rule about the CATEGORY (owner, 2026-08-30) - a lower third with one band still grows,
// which the corpus gate measures on nine files that do.
test('svg import: a board that draws a repeated row keeps every box as drawn', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('shrink');
  // Stated in the reader's own words on the section head, not only in the control.
  // The summary names the PANEL since 2026-09-05 - it is the only thing the choice moves.
  await expect(page.getByTestId('map-svg-stretch')).toContainText('the panel stays the size you drew');

  // And a fixed box still holds a real question: the plate was drawn with the room, which is why
  // it can afford to stay the size it is. The four answers do not move, because nothing grew.
  await createProject(page);
  const state = await previewFrame(page)
    .locator('#f0')
    .evaluate((el) => {
      const w = window as unknown as { update: (s: string) => void };
      const doc = el.ownerDocument;
      const root = doc.querySelector('svg')!.getBoundingClientRect();
      const tops = () =>
        ['f1', 'f2', 'f3', 'f4'].map((id) =>
          Math.round(((doc.getElementById(id)!.getBoundingClientRect().top - root.top) / root.height) * 700),
        );
      const before = tops();
      w.update(
        JSON.stringify({
          f0: 'Which of these grandmasters has held the undisputed world championship title for the longest unbroken run across the entire modern era of the game?',
        }),
      );
      return {
        size: parseFloat(getComputedStyle(el).fontSize),
        lines: el.querySelectorAll('tspan[data-noacg-line]').length || 1,
        before,
        after: tops(),
      };
    });
  // Two lines since 2026-09-05: a centred question's room is the plate it is drawn in rather than
  // the width of the words the designer typed. The claim this test makes is the SECOND assertion -
  // that nothing below the question moved - and that is untouched either way.
  expect(state.lines).toBe(2);
  expect(state.after).toEqual(state.before);
});

// UNTICKING A TEXT LAYER ASKS WHAT TO DO WITH THE WORDS (owner walk, 2026-09-02: "the logical
// thing here is to have a prompt that asks, what should we do?"). It used to mean one thing
// silently - the layer stays as drawn and cannot be retyped - and removal must never be the
// automatic answer: "what if it's there for a reason anyway?"
test('svg import: unticking a text layer asks what to do, and keeps the words by default', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  const rows = await page.locator('[data-testid^="map-svg-sample-"]').all();
  let question = rows[0];
  for (const row of rows) if ((await row.inputValue()).startsWith('Question 1')) question = row;
  const id = (await question.getAttribute('data-testid'))!.replace('map-svg-sample-', '');
  const box = page.getByTestId(`map-svg-row-${id}`).locator('input[type="checkbox"]');

  // Closing the question leaves the row exactly as it was: a mis-click costs nothing.
  await box.click();
  const dialog = page.getByTestId('map-svg-off-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('What should happen to these words?');
  await dialog.locator('.gallery-close').click();
  await expect(dialog).toBeHidden();
  await expect(box).toBeChecked();

  // AND ESCAPE CLOSES THE DIALOG, NOT THE WIZARD. The wizard binds Escape on `window` to rewind
  // to the front page, so without a capture handler of its own this dialog's Esc would throw the
  // whole import away - the opposite of what the ✕ beside it does.
  await box.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await expect(box).toBeChecked();

  // Keeping is the primary answer, and it says so on the row afterwards.
  await box.click();
  await page.getByTestId('map-svg-off-keep').click();
  await expect(box).not.toBeChecked();
  await expect(page.getByTestId(`map-svg-off-${id}`)).toHaveText('stays as drawn');

  // Ticking it back on clears the answer with it - no half state to reason about.
  await box.check();
  await expect(page.getByTestId(`map-svg-off-${id}`)).toHaveCount(0);

  // Removing takes the layer off the built graphic. The shapes are still in the file: one CSS
  // rule hides them, which is what makes this reversible in the editor rather than destructive.
  await box.click();
  await page.getByTestId('map-svg-off-remove').click();
  await expect(page.getByTestId(`map-svg-off-${id}`)).toHaveText('taken off the artwork');
  await createProject(page);
  await expect(previewFrame(page).locator('.imported-design-removed')).toHaveCount(1);
  const shown = await previewFrame(page)
    .locator('.imported-design-removed')
    .evaluate((el) => getComputedStyle(el).display);
  expect(shown).toBe('none');
});

// THE ANSWER COUNT IS READ OFF THE BOARD (owner walk, 2026-09-03, on this exact file): "it
// defaults to two answers when you can clearly identify five text boxes, where one is the
// question. It should just default to four answers."
//
// His board draws five text layers and none of them is NAMED "Answer A", so the named-layer
// shortcut (draft.ts `proposeQuizBinding`) never fires and this is the hand-attached path -
// which is the one he walked. One question, and the rest are answers.
test('svg import: a five-layer quiz board opens with four answers, not two', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  // Five text layers on the board, which is the whole premise of his finding.
  await expect(page.locator('[data-testid^="map-svg-sample-"]')).toHaveCount(5);

  await page.getByTestId('map-svg-behaviour-kind').selectOption('quiz');
  await expect(page.getByTestId('map-svg-quiz-count')).toHaveValue('4');
  await expect(page.locator('[data-testid^="map-svg-quiz-row-"]')).toHaveCount(4);

  // AND THE FOUR ROWS ARE BOUND, not four empty pickers to fill in. Every answer names a layer,
  // and no two name the same one - a seed that bound one layer four times would show a count of
  // four while meaning nothing.
  const bound: string[] = [];
  for (let i = 0; i < 4; i++) {
    bound.push(await page.getByTestId(`map-svg-quiz-answer-${i}`).inputValue());
  }
  expect(bound.every((v) => v !== '')).toBe(true);
  expect(new Set(bound).size).toBe(4);
  // The question is the layer the answers are not, so the binding is complete on arrival.
  const question = await page.getByTestId('map-svg-quiz-question').inputValue();
  expect(question).not.toBe('');
  expect(bound).not.toContain(question);
  await expect(page.getByTestId('map-svg-why-behaviour')).not.toContainText('once you say');
});

// THE TOO-LONG ANSWER IS PER PART OF THE ARTWORK, NOT PER GRAPHIC (owner walk, 2026-09-03):
// "What if you want it to react differently between the question and the answer? What's our
// solution for that?"
//
// The graphic-wide picker is the default and stays the whole control for anyone who does not
// care - the override list is CLOSED on arrival and offered as one line. Measured on his board,
// which defaults to shrink because it draws a repeated row, so an emitted rule can only have
// come from the override.
test('svg import: one plate can answer the too-long question on its own', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-stretch-mode')).toHaveValue('shrink');

  // CLOSED UNTIL ASKED FOR. A row per layer on arrival is a twenty-click step for a reader who
  // wanted one dropdown.
  const toggle = page.getByTestId('map-svg-per-panel-toggle');
  await expect(toggle).toHaveText('Give one part of the graphic its own answer');
  await expect(page.getByTestId('map-svg-per-panel-rows')).toHaveCount(0);
  await toggle.click();

  const rows = page.getByTestId('map-svg-per-panel-rows').locator('.save-field');
  // One row per PLATE: the question's, and one for each of the four answer plates. Never one per
  // field - a plate holding two lines cannot grow two ways, so they share a row and say so.
  await expect(rows).toHaveCount(5);

  // The question's plate, named the way the shape picker names it ("q bg"). Read off that
  // picker rather than guessed, so this test breaks when the marker minting changes rather than
  // when a label is reworded. The picker only exists while growth is on, so it is turned on to
  // ask and put straight back - the graphic-wide answer under test here is "the text gets
  // smaller".
  await page.getByTestId('map-svg-stretch-mode').selectOption('grow-y');
  const plate = await page
    .getByTestId('map-svg-stretch-shape')
    .locator('option', { hasText: 'q bg' })
    .getAttribute('value');
  await page.getByTestId('map-svg-stretch-mode').selectOption('shrink');
  await page.getByTestId(`map-svg-per-panel-${plate}`).selectOption('grow-x');
  // The line now says how many parts differ, so the answer survives closing the list.
  await expect(toggle).toHaveText('1 part answers differently');

  await createProject(page);
  const table = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return /var NOACG_LAYOUT = \{[\s\S]*?\n\};/.exec(useTemplateStore.getState().template.js)![0];
  });
  // EXACTLY ONE RULE, ON THE QUESTION'S PLATE. The graphic-wide answer is still "the text gets
  // smaller", so every other plate on the board is left alone - which is the half of his
  // question that is easy to get wrong by growing everything the moment anything grows.
  expect(table.match(/axis: '/g)).toHaveLength(1);
  expect(table).toContain("axis: 'x'");
  // A row names its element by a positional `data-noacg-el` stamp, so the only place the
  // generated code says WHICH plate is the comment above it - and it has to name the plate the
  // step named. Illustrator writes the layer name on the group and leaves the rect inside it
  // anonymous, which used to emit `// "Layer" grows wider` on this very file.
  expect(table).toContain('"q_bg" grows wider');

  // AND THE GRAPHIC DOES IT. The question's plate widens for a long value; an answer plate,
  // which nobody overrode, holds the width it was drawn at.
  const widths = (value?: string) =>
    previewFrame(page)
      .locator('#f0')
      .evaluate((el, v) => {
        if (v != null) {
          (window as unknown as { update: (s: string) => void }).update(JSON.stringify({ f0: v }));
        }
        const box = (sel: string) => {
          const n = el.ownerDocument.querySelector(sel) as SVGGraphicsElement | null;
          return n ? Math.round(n.getBoundingClientRect().width) : 0;
        };
        return { question: box('#q_bg'), answer: box('#a1_bg') };
      }, value);

  const drawn = await widths();
  expect(drawn.question).toBeGreaterThan(0);
  const grown = await widths(
    'Which of these grandmasters has held the undisputed world championship title for the longest unbroken run across the entire modern era of the game?',
  );
  expect(grown.question).toBeGreaterThan(drawn.question);
  expect(grown.answer).toBe(drawn.answer);
});

// THE STEP READS AT READING LENGTH (owner walk, 2026-09-03: "the whole import page right now is
// difficult to read ... it should read so a kid could understand what's happening", and "No one
// wants to read more than a few lines").
//
// A LINE COUNT rather than the sentences themselves: the words will keep changing and a test
// spelling them out would only make every future edit a two-file edit. What must not come back
// is the LENGTH - the too-long section ran to four paragraphs of banners, boards, margins and
// last resorts, and the behaviour box named all three behaviours the list under it already
// names one by one.
test('svg import: the step says what a control does, in a few lines', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();

  await page.getByTestId('map-svg-why-stretch').click();
  const stretch = page.getByTestId('map-svg-why-stretch-body');
  await expect(stretch.locator('p')).toHaveCount(3);
  // The one promise that has to survive every rewrite, because it is what the ladder actually
  // does whichever rung is picked (owner, 2026-08-26: shrink is last).
  await expect(stretch).toContainText('gets smaller');

  await page.getByTestId('map-svg-why-behaviour').click();
  const behaviour = page.getByTestId('map-svg-why-behaviour-body');
  await expect(behaviour.locator('p')).toHaveCount(2);
  // The list below already spells each behaviour out, one line each, so the ⓘ must not read it
  // back. Naming one of them here is how that regression shows up.
  await expect(behaviour).not.toContainText('live vote');

  await page.getByTestId('map-svg-why-fields').click();
  await expect(page.getByTestId('map-svg-why-fields-body').locator('p')).toHaveCount(2);
});

// ── THE GROUPING IS THE BINDING (docs/TEXT_BOX_BINDING.md step 2) ──
// "Every text field lives in a box: the shape drawn under it." The step has decided which box
// holds which line since the per-box growth answers were added, and it decided it SILENTLY: the
// checklist was one flat list, so a reader could not see that their question and its four answers
// had been read as five separate boxes rather than one board. That is the fact every per-box
// answer rests on, and the owner walked straight past it because nothing on screen claimed it.
//
// Shown with no new control: a heading per box, its swatch in the shape's own fill, and the rows
// indented under it.
test('svg import: the checklist groups each line under the box it was drawn in', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();

  // FIVE BOXES on a board that draws five plates - the question's and one per answer - and not
  // one heading over the whole list. The board is the case the whole feature exists for.
  const heads = page.getByTestId('map-svg-fields').locator('.map-svg-box-head');
  await expect(heads).toHaveCount(5);

  // NAMED BY COLOUR AND KIND, because the designer's own layer names here are `q bg` and friends
  // - a private shorthand that tells a student nothing. The question's plate is the tan one, and
  // the four answer plates are one colour, so they are numbered rather than four identical rows.
  await expect(heads.nth(0)).toContainText('Tan plate');
  for (let i = 1; i <= 4; i += 1) await expect(heads.nth(i)).toContainText(`Orange plate ${i}`);

  // AND THE SWATCH CARRIES THE SHAPE'S OWN FILL, which is what makes the heading checkable
  // against the artwork beside it rather than a claim the reader has to take on trust.
  const fills = await heads.locator('.map-svg-swatch').evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).backgroundColor));
  expect(fills[0]).toBe('rgb(198, 156, 109)'); // #c69c6d, the tan question plate
  expect(new Set(fills.slice(1)).size).toBe(1); // the four answers share one orange
  expect(fills[1]).not.toBe(fills[0]);

  // The question row sits INSIDE the tan plate's group rather than merely after its heading -
  // an ordering that happened to look right is the failure this whole step is about.
  const tan = page.getByTestId('map-svg-fields').locator('.map-svg-box-group').first();
  await expect(tan.locator('.map-svg-row')).toHaveCount(1);
  const tanRowId = ((await tan.locator('.map-svg-row').first().getAttribute('data-testid')) ?? '')
    .replace('map-svg-row-', '');
  await expect(page.getByTestId(`map-svg-sample-${tanRowId}`)).toHaveValue(/Question 1/);
});

// ── TEXT AND ITS BOX, ON THE ARTWORK (docs/TEXT_BOX_BINDING.md step 2, the preview overlay) ──
// The checklist SAYS which box a line lives in; this is the same sentence drawn on the canvas, so
// a reader can check it against the artwork instead of taking the list's word for it. It replaces
// an axis-aligned amber rectangle, which on this board - every plate tilted a few degrees on
// purpose - drew a box around the wrong thing: a rectangle big enough to contain a tilted plate
// contains a good deal that is not the plate.
test('svg import: hovering a line draws its box, its room and its alignment on the artwork', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  // The overlay is drawn on the PREVIEW, which commits its document on a debounce and starts
  // answering with rects and frames on that document's own animation frame.
  const frame = page.frameLocator('.wz-side iframe');
  await expect(frame.locator('#f0')).toContainText('Question 1');

  const groupRow = async (n: number) =>
    ((await page
      .getByTestId('map-svg-fields')
      .locator('.map-svg-box-group')
      .nth(n)
      .locator('.map-svg-row')
      .first()
      .getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
  await page.getByTestId(`map-svg-row-${await groupRow(0)}`).hover();

  // THE BOX IS PAINTED BY THE SHAPE ITSELF, through the canvas channel's 'mark' command - one
  // shape, the tan question plate, wearing a filter that washes its own pixels amber. Nothing is
  // drawn around it from the app side, which is what makes the rotation free: the wash is the
  // plate, whichever way it was turned and whatever outline it was given.
  const lit = frame.locator('.noacg-canvas-lit');
  await expect(lit).toHaveCount(1);
  const shape = await lit.evaluate((el) => ({
    fill: getComputedStyle(el).fill,
    filter: getComputedStyle(el).filter,
  }));
  expect(shape.fill).toBe('rgb(198, 156, 109)'); // #c69c6d, the question's own plate
  expect(shape.filter).toContain('url(');

  // THE TWO FIGURES, in the artwork's own px: the room at the sides and the room above.
  await expect(page.getByTestId('wz-preview-inside')).toBeVisible();
  await expect(page.getByTestId('wz-preview-inset-x')).toHaveText(/^\d+$/);
  await expect(page.getByTestId('wz-preview-inset-y')).toHaveText(/^\d+$/);

  // THE ALIGNMENT CARET, with the word. He centred the question in its plate on both axes, and
  // that is what the file says - docs/TEXT_BOX_BINDING.md's own table for this fixture.
  await expect(page.getByTestId('wz-preview-caret')).toContainText('centred, middle');

  // ── AND NOW AN ANSWER, WHICH IS WHERE THE ROTATION SHOWS ──
  // The question's own text was drawn level inside a plate rotated 88.68 degrees, so the room
  // round it - measured in the LINE's frame, the frame the ladder fits in - is level too. Each
  // answer was drawn ON its plate's angle, so its room and its bounds are drawn on that angle.
  await page.getByTestId(`map-svg-row-${await groupRow(1)}`).hover();
  await expect(page.getByTestId('wz-preview-inside')).toBeVisible();
  const turn = (testid: string) =>
    page.getByTestId(testid).evaluate((el) => Math.abs(new DOMMatrix(getComputedStyle(el).transform).b));
  // A non-zero `b` in the resolved matrix is the whole fix in one number: the rectangle this
  // replaces could only ever be square to the screen.
  expect(await turn('wz-preview-inside')).toBeGreaterThan(0.01);
  expect(await turn('wz-preview-highlight')).toBeGreaterThan(0.01);

  // THE GAP IS THE ROOM THAT IS LEFT, so the block stands inside the dashed line rather than on
  // it - this answer was drawn short in a plate with room to its right.
  const [inside, bounds] = await Promise.all([
    page.getByTestId('wz-preview-inside').boundingBox(),
    page.getByTestId('wz-preview-highlight').boundingBox(),
  ]);
  expect(inside!.width * inside!.height).toBeGreaterThan(bounds!.width * bounds!.height);

  // …and the word says how it was drawn. The two rows together are the reason alignment and
  // growth are per box rather than per graphic.
  await expect(page.getByTestId('wz-preview-caret')).toContainText('left,');
  await expect(frame.locator('.noacg-canvas-lit')).toHaveCount(1);

  // Off the list, the artwork is left alone: nothing lit, nothing drawn.
  await page.getByTestId('map-svg-fields').locator('h3').hover();
  await expect(frame.locator('.noacg-canvas-lit')).toHaveCount(0);
  await expect(page.getByTestId('wz-preview-inside')).toHaveCount(0);
});

// A LINE WITH NO BOX HAS NO ROOM TO SHOW. Text sitting straight on the artwork is not inside
// anything, so there is nothing to tint, no insets to mirror and nothing to be aligned in - and
// the honest answer is the plain outline the step has always drawn, not an invented box.
test('svg import: a line with no box under it gets the outline and nothing else', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Home" x="20" y="60" font-size="30" fill="#fff">Rovers</text>
      <text id="Away" x="20" y="150" font-size="30" fill="#fff">City</text>
    </svg>`,
    'nobox.svg',
  );
  await page.locator('.wz-next').click();
  await expect(page.frameLocator('.wz-side iframe').locator('#f1')).toHaveText('City');

  await page.getByTestId('map-svg-row-t0').hover();
  await expect(page.getByTestId('wz-preview-highlight')).toBeVisible();
  await expect(page.getByTestId('wz-preview-inside')).toHaveCount(0);
  await expect(page.getByTestId('wz-preview-caret')).toHaveCount(0);
  await expect(page.frameLocator('.wz-side iframe').locator('.noacg-canvas-lit')).toHaveCount(0);
});

// ── THE ALIGNMENT CONTROL (docs/TEXT_BOX_BINDING.md step 3) ──
// The row's nine-dot grid sets both axes with one click, the caret on the preview says the same
// words, and the checkbox under the grid hands back the nudge the file recorded. The runtime is
// read INSIDE the preview document for every claim, because that is where the answer is spent:
// a grid that changed the draft and not the graphic would have changed nothing.
test('svg import: the nine-dot grid sets how a line sits in its box, and the nudge checkbox hands back what was drawn', async ({
  page,
}) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  const frame = page.frameLocator('.wz-side iframe');
  await expect(frame.locator('#f0')).toContainText('Question 1');

  type Align = { h: string; v: string; derived: boolean; anchor?: number; nudge?: number; snapY?: number; nudgeY?: number };
  type Layout = { lines?: { el: string; h?: string; v?: string; nudge?: boolean }[] };
  /** The runtime's own answer for the question, and where its block stands, in the artwork's units. */
  const runtime = () =>
    frame.locator('#f0').evaluate((el) => {
      const w = el.ownerDocument.defaultView as unknown as { svgFitAlign: Record<string, Align>; NOACG_LAYOUT?: Layout };
      const bb = (el as unknown as SVGGraphicsElement).getBBox();
      return {
        align: w.svgFitAlign.f0,
        lines: w.NOACG_LAYOUT?.lines ?? null,
        anchor: el.getAttribute('text-anchor'),
        cx: bb.x + bb.width / 2,
        cy: bb.y + bb.height / 2,
      };
    });
  /** Act, then wait out the debounced rebuild on the stage's own stamps (the idiom the other
   *  wizard walks in this file use): pending is set the moment the template changes and cleared
   *  when the new document has LOADED, and its fit runs on that document's DOMContentLoaded. */
  const stage = page.locator('.wz-side .wz-stage');
  const rebuilt = async (action: () => Promise<unknown>) => {
    const before = await stage.getAttribute('data-doc-rev');
    await action();
    await expect(stage).not.toHaveAttribute('data-doc-rev', before ?? '', { timeout: 20_000 });
    await expect(stage).not.toHaveAttribute('data-doc-pending', '1', { timeout: 20_000 });
    await expect(frame.locator('#f0')).toContainText('Question 1');
  };

  const row = page.getByTestId('map-svg-row-t0');
  const dot = (h: string, v: string) => page.getByTestId(`map-svg-align-t0-${h}-${v}`);

  // READ FROM THE DRAWING. He centred the question on both axes; the drawn dot is the ringed
  // one, nothing is declared, and the runtime derived the same two words.
  await row.hover();
  await expect(page.getByTestId('wz-preview-caret')).toContainText('centred, middle');
  await expect(dot('middle', 'middle')).toHaveAttribute('aria-checked', 'true');
  await expect(dot('middle', 'middle')).not.toHaveClass(/set/);
  await expect(dot('middle', 'middle')).toHaveAttribute('title', 'centred, middle - read from your drawing');
  const drawn = await runtime();
  expect(drawn.align).toMatchObject({ h: 'middle', v: 'middle', derived: true });
  expect(drawn.lines).toBeNull();

  // THE NUDGE THE FILE RECORDED, in words. The question was composed off its plate's centre -
  // 36 px sideways by the drawn insets, a dozen up - and the snap moved it on. The sentence says
  // what the checkbox would hand back, in the artwork's own px, and the runtime holds the same
  // two numbers (align.nudge, align.nudgeY): the step measures on its own render, so the two
  // agree to the units a fallback face costs, never to the sign or the tens.
  const nudgeLine = page.getByTestId('map-svg-nudge-t0');
  await expect(nudgeLine).toContainText(/keep the nudge you drew: (\d+) px to the left, (\d+) px up/);
  const [, said, saidUp] = /(\d+) px to the left, (\d+) px up/.exec((await nudgeLine.textContent())!)!;
  expect(Math.abs(Number(said) + drawn.align.nudge!)).toBeLessThanOrEqual(3);
  expect(Math.abs(Number(saidUp) + drawn.align.nudgeY!)).toBeLessThanOrEqual(4);

  // ONE CLICK, BOTH AXES. The caret changes its words, the dot fills, the document is rebuilt
  // with the declaration in its own table, and the runtime anchors the block on the plate's
  // left inside edge and lifts it to the top: the block's centre moves left of where it stood,
  // and up.
  await rebuilt(() => dot('start', 'top').click());
  await row.hover();
  await expect(page.getByTestId('wz-preview-caret')).toContainText('left, top');
  await expect(dot('start', 'top')).toHaveAttribute('aria-checked', 'true');
  await expect(dot('start', 'top')).toHaveClass(/set/);
  await expect(dot('middle', 'middle')).toHaveAttribute('aria-checked', 'false');
  await expect(dot('start', 'top')).toHaveAttribute('title', 'left, top - set by you');
  await expect(dot('middle', 'middle')).toHaveAttribute('title', 'centred, middle - read from your drawing');
  // Declared away from the drawn anchor, the nudge has nothing of the designer's to keep.
  await expect(nudgeLine).toHaveCount(0);
  const leftTop = await runtime();
  expect(leftTop.lines).toEqual([{ el: 'f0', h: 'start', v: 'top' }]);
  expect(leftTop.align).toMatchObject({ h: 'start', v: 'top', derived: false });
  expect(leftTop.anchor).toBe('start');
  expect(leftTop.cx).toBeLessThan(drawn.cx - 100);
  expect(leftTop.cy).toBeLessThan(drawn.cy - 20);

  // AND THE OPPOSITE CORNER, to show it is the grid and not a coincidence of the first click.
  await rebuilt(() => dot('end', 'bottom').click());
  const rightBottom = await runtime();
  expect(rightBottom.lines).toEqual([{ el: 'f0', h: 'end', v: 'bottom' }]);
  expect(rightBottom.anchor).toBe('end');
  expect(rightBottom.cx).toBeGreaterThan(drawn.cx + 100);
  expect(rightBottom.cy).toBeGreaterThan(drawn.cy + 20);

  // THE DRAWN DOT HANDS THE ROW BACK TO THE DRAWING: no declaration, no table, the derived
  // answer again - and the nudge line is back, because the anchor is the one it was measured
  // from.
  await rebuilt(() => dot('middle', 'middle').click());
  await expect(dot('middle', 'middle')).not.toHaveClass(/set/);
  const back = await runtime();
  expect(back.lines).toBeNull();
  expect(back.align.derived).toBe(true);
  expect(Math.abs(back.cx - drawn.cx)).toBeLessThan(0.5);
  await expect(nudgeLine).toBeVisible();

  // KEEP THE NUDGE. The table carries only the flag, the runtime moves the anchor by the offset
  // it measured, and the block stands where he drew it: the snapped centre plus the nudge,
  // sideways and up. The word under the block is still "centred": the offset rides the anchor.
  await rebuilt(() => nudgeLine.locator('input').check());
  const kept = await runtime();
  expect(kept.lines).toEqual([{ el: 'f0', nudge: true }]);
  expect(Math.abs(kept.cx - (drawn.cx + drawn.align.nudge!))).toBeLessThan(0.5);
  expect(Math.abs(kept.cy - (drawn.cy + drawn.align.nudgeY!))).toBeLessThan(1);
  await row.hover();
  await expect(page.getByTestId('wz-preview-caret')).toContainText('centred, middle');
});

// A LINE WITH NO BOX GETS NO GRID. There is nothing to align it in, so the control is absent
// rather than greyed (`wizard/offer-control-can-change-graphic-front`).
test('svg import: a line with no box under it offers no alignment grid', async ({ page }) => {
  await dropSvgMarkup(
    page,
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 200">
      <text id="Home" x="20" y="60" font-size="30" fill="#fff">Rovers</text>
    </svg>`,
    'nobox.svg',
  );
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('map-svg-row-t0')).toBeVisible();
  await expect(page.getByTestId('map-svg-align-t0')).toHaveCount(0);
});

// A ROW KEEPS ITS BOX WHEN IT IS UNTICKED. Which box a line sits in is a fact about where it was
// DRAWN, not about whether the operator may retype it - so the measurement runs over every text
// row rather than the bound ones. Read the other way the list would reshuffle under the reader's
// cursor as they worked down the checkboxes, which is the one thing a checklist must not do.
test('svg import: unticking a line leaves it in its own box', async ({ page }) => {
  await dropSvgMarkup(page, readFileSync(OWNER_QUIZ, 'utf8'), 'owner-quiz-board.svg');
  await page.locator('.wz-next').click();
  const heads = page.getByTestId('map-svg-fields').locator('.map-svg-box-head');
  await expect(heads).toHaveCount(5);
  const before = await heads.allTextContents();

  const firstId = ((await page.getByTestId('map-svg-fields').locator('.map-svg-row').first()
    .getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
  await untickTextRow(page, firstId);

  await expect(heads).toHaveCount(5);
  expect(await heads.allTextContents()).toEqual(before);
  await expect(
    page.getByTestId('map-svg-fields').locator('.map-svg-box-group').first().locator('.map-svg-row'),
  ).toHaveCount(1);
});

// A BACKPLATE IS NOT A BOX. A shape covering most of the frame holds every line there is, so
// heading the whole checklist with it is a heading rather than a grouping - the same sentence
// `repeatsWithNewContent` already acts on, at the same 0.7 of the frame. The Inkscape bumper is
// the case: one full-bleed rectangle behind a headline and a subtitle. Grouping by it would have
// filed both lines under "Black plate" and told the reader nothing, and grouping by it PARTLY -
// one line inside, one not - reordered the checklist away from the order the file draws in.
test('svg import: a full-frame backplate does not become a box to group by', async ({ page }) => {
  await page.goto('/app');
  await dropSvg2(page, fileURLToPath(
    new URL('fixtures/svg-corpus/inkscape-text-on-path-bumper.svg', import.meta.url),
  ));
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();

  // No headings at all, and the two rows stand in the order the file draws them.
  await expect(page.getByTestId('map-svg-fields').locator('.map-svg-box-head')).toHaveCount(0);
  const rows = page.getByTestId('map-svg-fields').locator('[data-testid^="map-svg-row-"]');
  await expect(rows).toHaveCount(2);
  await expect(page.getByTestId('map-svg-sample-t0')).toHaveValue('CHAMPIONS');

});

// The other side of the same rule: the scorebug's plates are 2.5% of the SAME 1920x1080 frame, so
// they are boxes and the file groups into two. The rule is about a shape's size against the
// artwork, never about how many shapes a file happens to draw.
test('svg import: plates well inside the frame are boxes, and group the checklist', async ({ page }) => {
  await page.goto('/app');
  await dropSvg2(page, SCOREBUG_SVG);
  const heads = page.getByTestId('map-svg-fields').locator('.map-svg-box-head');
  await expect(heads).toHaveCount(2);
  await expect(heads.nth(0)).toContainText('plate');
  await expect(heads.nth(1)).toContainText('plate');
});

// AND THE CHECKLIST NEVER RE-SORTS ITSELF. A group is a run of consecutive rows, so showing which
// box a row is in cannot move it: the Affinity board's backplate is 73% of the frame, which makes
// its question loose while its four answers sit on plates of their own. Collected by box, the
// question would be filed after all four answers it is asked above.
test('svg import: grouping never moves a row out of the order the file draws it in', async ({ page }) => {
  await page.goto('/app');
  await dropSvg2(page, fileURLToPath(
    new URL('fixtures/svg-corpus/origin-shifted-quiz-board.svg', import.meta.url),
  ));
  const rows = page.getByTestId('map-svg-fields').locator('[data-testid^="map-svg-row-"]');
  await expect(rows).toHaveCount(5);
  const names = await rows.locator('[data-testid^="map-svg-title-"]').evaluateAll((els) =>
    els.map((el) => (el as HTMLInputElement).value));
  expect(names).toEqual(['Question', 'Answer A', 'Answer B', 'Answer C', 'Answer D']);

  // The question heads the list under its own group, which says it has no box rather than naming
  // the whole-board plate it happens to sit on.
  const heads = page.getByTestId('map-svg-fields').locator('.map-svg-box-head');
  await expect(heads.first()).toContainText('On the artwork');
  await expect(heads.first()).toContainText('no box of their own');
});
