// The credits roll on imported artwork (docs/END_CREDITS.md): its recipe, the roll engine, the
// parser it shares with the catalog rolls, the fields list that turns the sample into one box,
// and its fixture. The SVG examples walk rides along: its credits are the list the default
// pace was set by (about thirty seconds), rolled from Illustrator's own output.
// covers: src/templates/{behaviours/credits.ts,importedDesign/{creditsRoll,creditsArtwork,artworkFields,svg,svgBind}.ts,endCredits/shared.ts}
// covers: e2e/fixtures/{credits-roll,credits-artwork}.svg, e2e/fixtures/jev-svg/dev/{credits-1,credits-2}.svg
// covers: src/components/wizard/import/{draft.ts,BehaviourSection.tsx}
// covers: src/components/wizard/draft/template.ts, src/blocks/motionPresets.ts
// covers: src/components/home/CueActions.tsx
// covers: src/templates/behaviours/recipe.ts, src/templates/importedDesign/behaviour.ts

import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync, writeFileSync } from 'node:fs';
import JSZip from 'jszip';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { openProductionWithCurrent } from './_create';
import { dropSvg, intoProduction } from './_svg-import';

// THE CREDITS ROLL ON IMPORTED ARTWORK (docs/END_CREDITS.md, "The same field on an imported SVG").
//
// The owner's standing rule is that a credit list is ONE pasted field, never a field per name,
// because nobody knows in advance how many names a show has. Until this landed an imported SVG had
// no credits behaviour at all, which is why every agent drew one field per name. This walk pins
// what replaced that, the way a student meets it: a text layer named Credits, a plate named
// Credits box, dropped on the Import door, mapped, put in a production, taken.
//
//  1. THE PROPOSAL. The names bind the recipe: the Fields step opens on Credits roll, with the
//     Credits text and the Credits box already picked.
//  2. THE FIELD. The operator gets one multi-line box holding the sample's lines, and Scroll
//     speed beside it - nothing else, and never a field per name.
//  3. THE ROLL. On Take the whole list rolls from below the box to above it at a constant pace,
//     and the pace is the one the docs promise: the list's own leading times the authored lines
//     a second, so about thirty lines pass in about thirty seconds.
//  4. THE TWO LOOKS. Every title row carries the sample's title class and every name row the
//     name look, read off the drawing - the one styling idea a student has to repeat.
//  5. THE FORMAT. A new paste in parseCredits' format ("Title: Name" inline, a tab from a
//     spreadsheet, a blank line for a new section) rebuilds the rows on Update, and Scroll speed
//     retimes the next take.
//  6. NO BOX, WHOLE FRAME. With the Credits box unpicked the roll runs through the artwork's
//     own frame instead.
//  7. THE EXPORT carries the engine and the shared parser, so the package rolls on its own.

const CREDITS_SVG = fileURLToPath(new URL('./fixtures/credits-roll.svg', import.meta.url));
const ARTWORK_CREDITS_SVG = fileURLToPath(new URL('./fixtures/credits-artwork.svg', import.meta.url));
const BESIDE_CREDITS_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/credits-2.svg', import.meta.url));
const ABOVE_CREDITS_SVG = fileURLToPath(new URL('./fixtures/jev-svg/dev/credits-1.svg', import.meta.url));

test('artwork credits measure after Drop, Rise and Pop and cancel a take waiting for fonts', async ({ page }) => {
  // Exercise the compiled template on a blank page: the motion picker changes entrance length
  // after SVG assembly, so measuring at the original call time can leave the last line on air.
  await page.goto('/app');
  const documents = await page.evaluate(async (source) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
    const { initialDraft, mergeDraft } = await import('/src/components/wizard/draft/core.ts');
    const { withUniversalMotion } = await import('/src/components/wizard/draft/template.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const imported = importSvgMarkup(source);
    const fields = imported.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
    const template = IMPORTED_SVG.create({
      designSvg: {
        markup: imported.markup, width: imported.width, height: imported.height,
        fields, images: [], outlines: [], fonts: [],
        behaviour: {
          kind: 'recipe', recipe: 'credits', layers: {},
          fields: { credits: fields.findIndex((f) => f.title === 'Programme text') },
          options: { artwork: true },
        },
      },
    });
    return (['drop', 'rise', 'pop'] as const).map((motion) => ({
      motion,
      html: composeDocument(withUniversalMotion(template, mergeDraft(initialDraft(), {
        animation: { motionIn: motion, motionOut: 'fade' },
      }), IMPORTED_SVG)),
    }));
  }, readFileSync(ARTWORK_CREDITS_SVG, 'utf8'));

  for (const { motion, html } of documents) {
    await page.goto('about:blank');
    await page.setContent(html);
    // Static authoring previews seek with callbacks suppressed, so the original drawing must
    // remain visible before Take. Playback itself hides it until entrance/fonts are ready.
    await expect(page.locator('.imported-design-credits')).toHaveCSS('visibility', 'visible');
    await page.evaluate(() => (window as unknown as { play(): void }).play());
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${motion}: the roll starts after its entrance`).toBe(true);
    await expect.poll(() => page.locator('.imported-design-box').evaluate((el) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return Math.max(Math.abs(matrix.a - 1), Math.abs(matrix.d - 1), Math.abs(matrix.e), Math.abs(matrix.f));
    }), `${motion}: the entrance has settled`).toBeLessThan(0.0001);
    const geometry = await page.locator('.imported-design-credits').evaluate((el) => {
      const w = window as unknown as { noacgCreditsTween: { pause(): void; progress(value: number): void }; noacgCreditsLast: unknown };
      const frame = document.body.getBoundingClientRect();
      w.noacgCreditsTween.pause();
      w.noacgCreditsTween.progress(0);
      const start = el.getBoundingClientRect().top;
      w.noacgCreditsTween.progress(1);
      const end = el.getBoundingClientRect().bottom;
      return { start, end, frameTop: frame.top, frameBottom: frame.bottom, transform: el.getAttribute('transform'), measured: w.noacgCreditsLast };
    });
    expect(Math.abs(geometry.start - geometry.frameBottom), `${motion}: the first glyph starts at the output's bottom: ${JSON.stringify(geometry)}`).toBeLessThan(0.5);
    expect(Math.abs(geometry.end - geometry.frameTop), `${motion}: the final glyph clears the output's top: ${JSON.stringify(geometry)}`).toBeLessThan(0.5);
    expect(geometry.transform).toBe('translate(820 85)');
    await expect(page.locator('.imported-design-credits tspan').last()).toHaveText('See you next time');
    await expect(page.locator('.imported-design-credits-rows')).toHaveCount(0);
  }

  // Hold the actual fonts-ready promise, then stop while that take is pending. Releasing it
  // must not resurrect the cancelled roll. The extra animation frame drains the real callback.
  await page.evaluate(() => {
    const w = window as unknown as {
      play(): void; stop(): void;
      creditsFontsRead: boolean; releaseCreditsFonts(): void;
    };
    w.stop();
    w.creditsFontsRead = false;
    const pending = new Promise<void>((resolve) => { w.releaseCreditsFonts = resolve; });
    Object.defineProperty(document.fonts, 'ready', { configurable: true, get() {
      w.creditsFontsRead = true;
      return pending;
    } });
    w.play();
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { creditsFontsRead: boolean }).creditsFontsRead)).toBe(true);
  // The entrance delay has fired and begin() is now subscribed to the unresolved font promise.
  await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsStart: unknown }).noacgCreditsStart)).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBeNull();
  const pendingGeneration = await page.evaluate(() => (window as unknown as { noacgCreditsGeneration: number }).noacgCreditsGeneration);
  await page.evaluate(() => (window as unknown as { stop(): void }).stop());
  await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsGeneration: number }).noacgCreditsGeneration)).toBeGreaterThan(pendingGeneration);
  const cancelled = await page.evaluate(async () => {
    const w = window as unknown as { releaseCreditsFonts(): void; noacgCreditsTween: unknown };
    w.releaseCreditsFonts();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    return { tween: w.noacgCreditsTween, visible: document.querySelector('.imported-design-credits-travel')!.hasAttribute('data-noacg-rolling') };
  });
  expect(cancelled).toEqual({ tween: null, visible: false });
});

test('imported artwork credits preserve the complete design and roll off the whole frame', async ({ page }, testInfo) => {
  await page.goto('/app');
  const expectedRuns = await page.evaluate(async (source) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const parsed = new DOMParser().parseFromString(importSvgMarkup(source).markup, 'image/svg+xml');
    return Array.from(parsed.querySelectorAll('text tspan')).map((run) => ({
      text: run.textContent,
      attributes: Array.from(run.attributes).filter((a) => !a.name.startsWith('data-noacg-')).map((a) => [a.name, a.value]).sort(),
    }));
  }, readFileSync(ARTWORK_CREDITS_SVG, 'utf8'));
  await dropSvg(page, ARTWORK_CREDITS_SVG);
  // A single Illustrator text object needs no special layer name or second binding step.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('none');
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  await expect(page.getByTestId('map-svg-recipe-credits').locator('option:checked')).toHaveText('Programme text');
  // The preview reads the one composed text as the list it is, in its own order.
  const preview = page.getByTestId('map-svg-credits-preview');
  await expect(preview).toHaveAttribute('data-layout', 'list');
  await expect(preview.locator('[data-credit]').first()).toHaveText('NIGHT SKY');
  // Fixed artwork credits keep their rows' wording: every row of the text scrolls as artwork.
  const artworkRows = page.locator('[data-testid^="map-svg-driven-"]');
  await expect(artworkRows.first()).toContainText('scrolls as artwork');
  await expect(artworkRows.filter({ hasText: 'sets the look' })).toHaveCount(0);
  expect(await artworkRows.count()).toBe(await artworkRows.filter({ hasText: /, scrolls as artwork$/ }).count());
  await intoProduction(page, 'Night sky credits', 'Night sky');
  await settleDurableWrites(page);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  // The old importer reconstructed a role/name list and hid the original drawing. This is the
  // defect: taking original artwork must paint its own glyph runs rather than replacement rows.
  await expect(air.locator('.imported-design-credits-rows')).toHaveCount(0);
  await expect(air.locator('.imported-design-credits')).toHaveCSS('visibility', 'visible');
  await expect(page.getByTestId('cue-field-f0')).toHaveCount(0);
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('100');
  const text = air.locator('.imported-design-credits');
  const paintedRuns = () => text.evaluate((el) => Array.from(el.querySelectorAll('tspan')).map((run) => ({
    text: run.textContent,
    attributes: Array.from(run.attributes).filter((a) => !a.name.startsWith('data-noacg-')).map((a) => [a.name, a.value]).sort(),
  })));
  expect(await paintedRuns()).toEqual(expectedRuns);
  await expect(text).toHaveAttribute('transform', 'translate(820 85)');
  await expect(text.locator('tspan').last()).toHaveText('See you next time');
  await expect.poll(() => text.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);

  const pose = (progress: number) => text.evaluate((el, at) => {
    const w = window as unknown as {
      noacgCreditsTween: { pause(): void; progress(value: number): void };
      noacgCreditsLast: { artwork: boolean; startY: number; endY: number; duration: number; distance: number; boxed: boolean };
    };
    w.noacgCreditsTween.pause();
    w.noacgCreditsTween.progress(at);
    const frame = el.ownerSVGElement!.getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    return { top: bounds.top, bottom: bounds.bottom, frameTop: frame.top, frameBottom: frame.bottom, roll: w.noacgCreditsLast };
  }, progress);
  const start = await pose(0);
  expect(start.roll.artwork).toBe(true);
  expect(start.roll.boxed).toBe(false);
  expect(start.roll.startY).toBeGreaterThan(start.roll.endY);
  expect(start.roll.duration).toBeGreaterThan(0);
  expect(start.top).toBeGreaterThanOrEqual(start.frameBottom - 0.5);
  // The source's last line starts below the artboard. It must still enter, and finally leave.
  const middle = await pose(0.5);
  await testInfo.attach('Original credits midway through the frame', { body: await page.screenshot(), contentType: 'image/png' });
  expect(middle.bottom).toBeGreaterThan(middle.frameTop);
  expect(middle.top).toBeLessThan(middle.frameBottom);
  const end = await pose(1);
  expect(end.bottom).toBeLessThanOrEqual(end.frameTop + 0.5);
  expect(middle.top).toBeCloseTo((start.top + end.top) / 2, 1);
  expect(await paintedRuns()).toEqual(expectedRuns);

  await page.getByTestId('verb-out').click();
  await page.getByTestId('verb-take').click();
  await expect.poll(() => text.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  const replay = await pose(0);
  expect(replay.top).toBeCloseTo(start.top, 1);
  await pose(0.4);
  await page.getByTestId('verb-out').click();
  await expect.poll(() => text.evaluate(() => (window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBeNull();

  // The downloadable browser overlay must carry the same artwork and engine without the app.
  const b64 = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const production = loadShows().find((s) => s.name === 'Night sky')!;
    return (await buildShowZipFor(production, 'html-overlay')).generateAsync({ type: 'base64' });
  });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const payload = Object.keys(zip.files).find((name) => /(^|\/)payload\.json$/.test(name))!;
  const manifest = JSON.parse(await zip.file(payload)!.async('string')) as { graphics: { file: string }[] };
  const html = await zip.file(`${payload.replace(/payload\.json$/, '')}${manifest.graphics[0].file}`)!.async('string');
  expect(html).not.toMatch(/<script[^>]+src="https?:/i);
  const overlay = await page.context().newPage();
  const errors: string[] = [];
  overlay.on('pageerror', (error) => errors.push(error.message));
  await overlay.setContent(html);
  await expect.poll(() => overlay.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  await expect(overlay.locator('.imported-design-credits-rows')).toHaveCount(0);
  await expect(overlay.locator('.imported-design-credits tspan').last()).toHaveText('See you next time');
  const finished = await overlay.locator('.imported-design-credits').evaluate((el) => {
    const w = window as unknown as { noacgCreditsTween: { pause(): void; progress(value: number): void } };
    w.noacgCreditsTween.pause();
    w.noacgCreditsTween.progress(1);
    return { bottom: el.getBoundingClientRect().bottom, top: el.ownerSVGElement!.getBoundingClientRect().top };
  });
  expect(finished.bottom).toBeLessThanOrEqual(finished.top + 0.5);
  expect(errors).toEqual([]);
  await overlay.close();
});

/**
 * FRAMES FOR A HUMAN, off by default - the same switch import-svg-behaviour.spec.ts has.
 * `NOACG_SHOTS=<dir>` writes one PNG per beat of the roll there: a green assertion says a title
 * row carries the sample's class, and only a picture says the roll LOOKS like the sample. With
 * the switch off nothing waits and the suite stays fast.
 */
const SHOTS = process.env.NOACG_SHOTS ?? '';
async function shot(page: Page, name: string, afterMs = 0) {
  if (!SHOTS) return;
  if (afterMs > 0) await page.waitForTimeout(afterMs);
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** The rows of the default list in the fixture: nine titles, twelve names and the closing line.
 *  A group with one name still renders as a title row and a name row - the sample's shape. */
const DEFAULT_ROWS = 22;
const DEFAULT_TITLES = 9;
/** The sample's own leading between names, in artwork units (the fixture draws it at 52). */
const SAMPLE_STEP = 52;
/** creditsRoll.ts CREDITS_LINES_PER_SECOND - the authored pace at Scroll speed 100. */
const LINES_PER_SECOND = 1.75;

interface LastRoll {
  startY: number;
  endY: number;
  distance: number;
  duration: number;
  rows: number;
  step: number;
  boxed: boolean;
}

/** What the last take measured, read out of the renderer's own record. */
async function lastRoll(air: FrameLocator): Promise<LastRoll> {
  await expect
    .poll(() => air.locator('.imported-design-credits-rows').evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast))
    .toBe(true);
  return air.locator('.imported-design-credits-rows').evaluate(() => (window as unknown as { noacgCreditsLast: LastRoll }).noacgCreditsLast);
}

/** The roll's window on air - the inner viewport the rows are clipped to. */
async function rollWindow(air: FrameLocator): Promise<{ y: number; height: number }> {
  return air.locator('.imported-design-credits-window').evaluate((el) => ({
    y: parseFloat(el.getAttribute('y') ?? 'NaN'),
    height: parseFloat(el.getAttribute('height') ?? 'NaN'),
  }));
}

/** Rebuild an existing saved design without the new artwork option. Fresh imports no longer
 *  offer this editable parser, but a saved graphic's fields, playback and export must survive. */
async function openLegacyProduction(page: Page, graphic: string, production: string, boxed = true) {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible({ timeout: 30_000 });
  await awaitDurableReady(page);
  await page.evaluate(async ({ source, graphicName, useBox }) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
    const { formatTemplate } = await import('/src/format/formatCode.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { useDocKindStore } = await import('/src/store/docKindStore.ts');
    const imported = importSvgMarkup(source);
    const fields = imported.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
    const box = imported.shapes.find((s) => s.label === 'Credits box');
    if (!box) throw new Error('The legacy fixture must contain its original Credits box');
    const template = IMPORTED_SVG.create({
      designSvg: {
        markup: imported.markup, width: imported.width, height: imported.height, fields,
        images: [], outlines: [],
        fonts: imported.fonts.map((f) => ({ family: f.family, fontId: 'oswald', ...(f.weight ? { weight: f.weight } : {}) })),
        behaviour: {
          kind: 'recipe', recipe: 'credits',
          fields: { credits: fields.findIndex((f) => f.title === 'Credits') },
          layers: useBox ? { box: box.id } : {},
        },
      },
    });
    useTemplateStore.getState().applyTemplate(await formatTemplate({ ...template, name: graphicName }), { resetSampleData: true });
    useDocKindStore.getState().setKind('spx');
  }, { source: readFileSync(CREDITS_SVG, 'utf8'), graphicName: graphic, useBox: boxed });
  await openProductionWithCurrent(page, production);
}

test('the Credits preview reads roles and names off a role-beside drawing', async ({ page }) => {
  // AC-23 (jev-svg-import row 18): the list the Credits layer declares, read by the shipped
  // parser, as headings, roles and their names, laid out as the drawing sets them.
  await page.goto('/app');
  await dropSvg(page, BESIDE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  // The first role layer, Réalisation: the title drawn above it is not part of the list.
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  const preview = page.getByTestId('map-svg-credits-preview');
  await expect(preview).toHaveAttribute('data-layout', 'role-beside');
  await expect(preview.locator('[data-credit="role"]')).toHaveText(['Réalisation', 'Image']);
  await expect(preview.locator('[data-credit="name"]')).toHaveText(['Léa Orme', 'Noé Rivage', 'Émilie Lac']);
  // Beside: a role shares its line with its first name; a second name stays in the name column.
  const top = (text: string) => preview.getByText(text, { exact: true }).evaluate((el) => Math.round(el.getBoundingClientRect().top));
  expect(await top('Image')).toBe(await top('Noé Rivage'));
  expect(await top('Émilie Lac')).toBeGreaterThan(await top('Noé Rivage'));
  // No JSON, no field per person: the step still holds the one Credits picker.
  await expect(preview).not.toContainText('{');
  await expect(page.locator('[data-testid^="map-svg-recipe-credits"]')).toHaveCount(1);

  // Either column could be the roles here, so the author gets the one question (row 20), read
  // as drawn until answered: the left column.
  await expect(page.getByTestId('map-svg-credits-roles')).toHaveValue('first');
  await expect(page.getByTestId('map-svg-credits-roles').locator('option:checked')).toHaveText('Left');
  // Role beside renders in its own styling (row 20): the other drawn layers set the looks.
  await expect(page.locator('[data-testid^="map-svg-driven-"]')).toHaveText([
    /, sets the look of every name in Credits$/,
    /, sets the look of every role in Credits$/,
    /, sets the look of every name in Credits$/,
    /, sets the look of every name in Credits$/,
  ]);
});

/** Each row on air read in the roll's own group, so the roll's travel is set aside and the
 *  drawing's units remain: its first character, the end of its advance, and its look. */
function creditRowsAtRest(air: FrameLocator) {
  return air.locator('.imported-design-credits-row').evaluateAll((els) => els.map((el) => {
    const t = el as SVGTextElement;
    const roll = el.closest('.imported-design-credits-roll') as SVGGElement;
    const m = roll.getScreenCTM()!.inverse().multiply(t.getScreenCTM()!);
    const p = t.getStartPositionOfChar(0);
    const at = (x: number, y: number) => ({ x: Math.round((m.a * x + m.c * y + m.e) * 100) / 100, y: Math.round((m.b * x + m.d * y + m.f) * 100) / 100 });
    const cs = getComputedStyle(el);
    return { kind: el.getAttribute('data-noacg-credits'), text: el.textContent, x: at(p.x, p.y).x, y: at(p.x, p.y).y, fill: cs.fill, size: cs.fontSize };
  }));
}

test('role-beside credits roll in their two drawn columns, from a name layer picked as Credits', async ({ page }) => {
  // jev-svg-import row 20 (AC-13): role beside in the drawn layers' own styling. A role and its
  // first name share a line, later names stay in the name column, each column on its drawn edge.
  await page.goto('/app');
  await dropSvg(page, BESIDE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  // The first role, then a NAME layer on its line, Léa Orme: the same block is read for both, and
  // the binding follows the pick (one read for another pick is never saved).
  const [title, first, name] = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
  // The title gives no credits either way, so it falls back and nothing is asked.
  await picker.selectOption(title);
  await expect(page.getByTestId('map-svg-credits-fallback')).toHaveText(/^Fixed artwork: .+/);
  await expect(page.getByTestId('map-svg-credits-roles')).toHaveCount(0);
  await picker.selectOption(first);
  const preview = page.getByTestId('map-svg-credits-preview');
  await expect(preview).toHaveAttribute('data-layout', 'role-beside');
  await picker.selectOption(name);
  await expect(preview).toHaveAttribute('data-layout', 'role-beside');
  await expect(preview.locator('[data-credit="role"]')).toHaveText(['Réalisation', 'Image']);
  await expect(page.getByTestId('map-svg-credits-fallback')).toHaveCount(0);
  await intoProduction(page, 'Équipe credits', 'Équipe night');
  await settleDurableWrites(page);

  const credits = page.getByTestId('cue-field-f1');
  await expect(credits).toHaveValue('Réalisation:\nLéa Orme\nImage:\nNoé Rivage\nÉmilie Lac');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('ÉQUIPE');
  await expect(page.getByTestId('cue-field-f3')).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Réalisation', 'Léa Orme', 'Image', 'Noé Rivage', 'Émilie Lac']);
  await expect(air.locator('[data-noacg-credit]')).toHaveText(['Réalisation', 'Léa Orme', 'Image', 'Noé Rivage', 'Émilie Lac']);
  await expect.poll(() => air.locator('.imported-design-credits-roll').evaluate(() =>
    !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  // Where and how credits-2 draws them: roles from 90 in pale green 26, names from 440 in white 32.
  const role = ['rgb(191, 228, 206)', '26px'];
  const nm = ['rgb(255, 255, 255)', '32px'];
  expect((await creditRowsAtRest(air)).map((r) => [r.kind, r.x, r.y, r.fill, r.size])).toEqual([
    ['role', 90, 195, ...role], ['name', 440, 195, ...nm], ['role', 90, 365, ...role], ['name', 440, 365, ...nm], ['name', 440, 420, ...nm],
  ]);

  // A new list on Update: several names per role, a role with none, the drawn steps kept.
  await credits.fill('Son:\nAri Moss\nIda Lake\nJun Harbor\nMontage:\nMusique:\nSol Reed');
  await page.getByTestId('verb-update').click();
  await expect(rows).toHaveText(['Son', 'Ari Moss', 'Ida Lake', 'Jun Harbor', 'Montage', 'Musique', 'Sol Reed']);
  expect((await creditRowsAtRest(air)).map((r) => [r.kind, r.x, r.y])).toEqual([
    ['role', 90, 195], ['name', 440, 195], ['name', 440, 250], ['name', 440, 305], ['role', 90, 475], ['role', 90, 645], ['name', 440, 645],
  ]);
});

/** Names drawn on the left and their roles on the right, so either column could be the roles. */
const NAMES_LEFT_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600" font-family="sans-serif" fill="#fff">
  <rect width="1000" height="600" fill="#1d2433" />
  <text x="100" y="150" font-size="40">Alex Rivera</text>
  <text x="600" y="150" font-size="24" fill="#ffcc00">Director</text>
  <text x="100" y="205" font-size="40">Ida Lake</text>
  <text x="100" y="320" font-size="40">Ari Moss</text>
  <text x="600" y="320" font-size="24" fill="#ffcc00">Sound</text>
</svg>`;

test('the one column choice fixes names drawn left of their roles: preview, saved import and live graphic', async ({ page }, testInfo) => {
  // Owner decision 2026-11-02: show "Which column contains the roles?" only where the columns are
  // ambiguous; the answer updates the preview, is saved with the import and drives the graphic.
  const file = testInfo.outputPath('credits-names-left.svg');
  writeFileSync(file, NAMES_LEFT_SVG);
  await page.goto('/app');
  await dropSvg(page, file);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const first = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[0]);
  await picker.selectOption(first);
  const preview = page.getByTestId('map-svg-credits-preview');
  // Read as drawn, the left column is taken for the roles: the names would roll as roles.
  await expect(preview.locator('[data-credit="role"]')).toHaveText(['Alex Rivera', 'Ida Lake', 'Ari Moss']);
  const roles = page.getByTestId('map-svg-credits-roles');
  await roles.selectOption({ label: 'Right' });
  await expect(preview.locator('[data-credit="role"]')).toHaveText(['Director', 'Sound']);
  await expect(preview.locator('[data-credit="name"]')).toHaveText(['Alex Rivera', 'Ida Lake', 'Ari Moss']);
  await intoProduction(page, 'Names left credits', 'Names left night');
  await settleDurableWrites(page);

  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Director:\nAlex Rivera\nIda Lake\nSound:\nAri Moss');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(air.locator('.imported-design-credits-row')).toHaveText(['Director', 'Alex Rivera', 'Ida Lake', 'Sound', 'Ari Moss']);
  // Roles in their drawn gold column at 600, names in white at 100, each role beside its name.
  const gold = 'rgb(255, 204, 0)';
  const white = 'rgb(255, 255, 255)';
  expect((await creditRowsAtRest(air)).map((r) => [r.kind, r.x, r.y, r.fill])).toEqual([
    ['role', 600, 150, gold], ['name', 100, 150, white], ['name', 100, 205, white], ['role', 600, 320, gold], ['name', 100, 320, white],
  ]);
});

test('credits that cannot be styled say why they stay fixed artwork, in one line', async ({ page }) => {
  // Owner direction 2026-11-02: where a design falls back to artwork, say plainly why.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const values = await picker.locator('option').evaluateAll((options) => (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
  await picker.selectOption(values[1]);
  const fallback = page.getByTestId('map-svg-credits-fallback');
  await expect(page.locator('[data-testid^="map-svg-driven-"]').first()).toHaveText(/, sets the look of every name in Credits$/);
  await expect(fallback).toHaveCount(0);
  // The title is a look of its own, so picking it gives no roles and names: it says so, and its
  // row scrolls as artwork.
  await picker.selectOption(values[0]);
  await expect(fallback).toHaveText(/^Fixed artwork: .+/);
  await expect(page.locator('[data-testid^="map-svg-driven-"]').first()).toHaveText(/, scrolls as artwork$/);
});

test('credits that can be styled can be kept as fixed artwork, and then the whole drawing scrolls', async ({ page }) => {
  // #1958, owner direction 2026-11-02: fixed artwork is a deliberate choice next to the default
  // editable credits, said plainly. Kept as artwork, every drawn role and name scrolls as one.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const values = await picker.locator('option').evaluateAll((options) => (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean));
  await picker.selectOption(values[1]);
  const engine = page.getByTestId('map-svg-credits-engine');
  const fixedLine = page.getByTestId('map-svg-credits-fixed');
  // Editable credits stay the default.
  await expect(engine).toHaveValue('editable');
  await expect(fixedLine).toHaveCount(0);
  await engine.selectOption('artwork');
  await expect(fixedLine).toHaveText('The text stays part of the artwork and cannot be edited on the production page.');
  await expect(page.getByTestId('map-svg-credits-fallback')).toHaveCount(0);
  // Every role and name layer, the picked one included, scrolls as artwork.
  await expect(page.locator('[data-testid^="map-svg-driven-"]')).toHaveText(Array(5).fill(/, scrolls as artwork$/));
  // A pick that cannot be styled (the title) has no choice, and takes the answer with it.
  await picker.selectOption(values[0]);
  await expect(engine).toHaveCount(0);
  await picker.selectOption(values[1]);
  await expect(engine).toHaveValue('editable');
  await engine.selectOption('artwork');
  await intoProduction(page, 'Research artwork', 'Research artwork night');
  await settleDurableWrites(page);
  // Nothing of the block is offered to type; the title drawn above stays the one text field.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('PRODUCTION');
  for (let i = 1; i <= 5; i++) await expect(page.getByTestId(`cue-field-f${i}`)).toHaveCount(0);

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const block = air.locator('.imported-design-credits');
  await expect(block).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  await expect.poll(() => block.first().evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  // Halfway through, every drawn layer has travelled the same distance from where it was drawn.
  const moved = await block.first().evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: { pause(): void; progress(value: number): void } };
    const texts = [...document.querySelectorAll('.imported-design-credits')];
    const travels = texts.map((t) => t.parentElement!);
    w.noacgCreditsTween.pause();
    w.noacgCreditsTween.progress(0.5);
    const mid = texts.map((t) => t.getBoundingClientRect().top);
    const transforms = travels.map((g) => g.getAttribute('transform'));
    travels.forEach((g) => g.removeAttribute('transform'));
    const rest = texts.map((t) => t.getBoundingClientRect().top);
    travels.forEach((g, i) => g.setAttribute('transform', transforms[i]!));
    return mid.map((m, i) => m - rest[i]);
  });
  expect(Math.abs(moved[0]), `the block moved: ${moved.join(', ')}`).toBeGreaterThan(10);
  for (const m of moved) expect(Math.abs(m - moved[0]), `one block: ${moved.join(', ')}`).toBeLessThan(0.5);
});

test('role-above credits drawn as separate layers roll in those layers\' own styling', async ({ page }) => {
  // jev-svg-import row 19 (AC-13): roles and names drawn as their own text layers are the source.
  // The graphic keeps ONE list field; every role row is a copy of the first drawn role, every
  // name row of the first drawn name, spaced as drawn, and the drawn layers stay in the file.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  // The first role layer, Research: PRODUCTION drawn above it stays artwork.
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  const preview = page.getByTestId('map-svg-credits-preview');
  await expect(preview).toHaveAttribute('data-layout', 'role-above');
  await expect(preview.locator('[data-credit="role"]')).toHaveText(['Research', 'Sound']);
  // Role above is never ambiguous, so there is nothing to choose.
  await expect(page.getByTestId('map-svg-credits-roles')).toHaveCount(0);
  // The other drawn layers are not fields of their own: their rows say what they become.
  const sourceRows = page.locator('[data-testid^="map-svg-driven-"]');
  await expect(sourceRows).toHaveText([
    /, sets the look of every name in Credits$/,
    /, sets the look of every name in Credits$/,
    /, sets the look of every role in Credits$/,
    /, sets the look of every name in Credits$/,
  ]);
  await expect(page.locator('[data-testid^="map-svg-row-"] input[type="checkbox"]:disabled')).toHaveCount(4);
  await intoProduction(page, 'Research credits', 'Research night');
  await settleDurableWrites(page);

  // ONE list field holding the drawn list, the title, Scroll speed: never a field per name.
  const credits = page.getByTestId('cue-field-f1');
  await expect(credits).toHaveValue('Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('PRODUCTION');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('100');
  await expect(page.getByTestId('cue-field-f3')).toHaveCount(0);

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  // The drawn layers are the source: kept, laid out, never painted.
  const sources = air.locator('[data-noacg-credit]');
  await expect(sources).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  for (let i = 0; i < 5; i++) await expect(sources.nth(i)).toHaveCSS('visibility', 'hidden');
  await expect(air.locator('#role0')).toHaveText('Research');
  // Each row is drawn in its source's look, where its source was drawn: read in the roll's own
  // group, so the roll's travel is set aside and the drawing's units remain.
  const atRest = () => rows.evaluateAll((els) => els.map((el) => {
    const roll = el.closest('.imported-design-credits-roll') as SVGGElement;
    const m = roll.getScreenCTM()!.inverse().multiply((el as SVGTextElement).getScreenCTM()!);
    const p = (el as SVGTextElement).getStartPositionOfChar(0);
    const cs = getComputedStyle(el);
    return { kind: el.getAttribute('data-noacg-credits'), y: Math.round((m.b * p.x + m.d * p.y + m.f) * 100) / 100, fill: cs.fill, size: cs.fontSize };
  }));
  await expect.poll(() => air.locator('.imported-design-credits-roll').evaluate(() =>
    !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween)).toBe(true);
  const drawn = await atRest();
  expect(drawn.map((r) => r.y)).toEqual([175, 240, 295, 445, 510]);
  expect(drawn.map((r) => [r.kind, r.fill, r.size])).toEqual([
    ['role', 'rgb(237, 188, 113)', '25px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
    ['role', 'rgb(237, 188, 113)', '25px'],
    ['name', 'rgb(255, 255, 255)', '35px'],
  ]);
  const roll = await air.locator('.imported-design-credits-roll').evaluate(() => (window as unknown as { noacgCreditsLast: { step: number; rows: number } }).noacgCreditsLast);
  expect(roll.step).toBe(55);
  expect(roll.rows).toBe(5);

  // A new list on Update: repeated roles, several names, the drawn spacing kept.
  await credits.fill('Research:\nIda Lake\nSol Reed\nJun Harbor\nSound:\nMia Holt\nResearch:\nOla Berg');
  await page.getByTestId('verb-update').click();
  await expect(rows).toHaveText(['Research', 'Ida Lake', 'Sol Reed', 'Jun Harbor', 'Sound', 'Mia Holt', 'Research', 'Ola Berg']);
  const again = await atRest();
  expect(again.map((r) => r.y)).toEqual([175, 240, 295, 350, 500, 565, 715, 780]);
  await expect(sources).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
});

test('role-above credits chosen to hold still air as one still page, and a list too long for it says so before the take', async ({ page }) => {
  // jev-svg-import row 22 (AC-13): "Plays as: Hold still" saves the styled binding as a still
  // page, with no Scroll speed to offer. A list too long for the page even at the floor is named
  // too long on its field before the take, and on Take the page is not shown. A fitting list
  // stands where the rows were drawn.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', 'role-above');
  const playback = page.getByTestId('map-svg-credits-playback');
  await expect(playback).toHaveValue('roll');
  await expect(playback.locator('option')).toHaveText(['Roll', 'Hold still', 'Cards']);
  await playback.selectOption('static');
  // The one class of list a still page cannot show is named where the choice is made.
  await expect(page.getByTestId('map-svg-credits-still')).toHaveText('A list too long for the page is not shown, and its field says so.');
  await intoProduction(page, 'Research page', 'Research still');
  await settleDurableWrites(page);

  // One list field and the drawn title; a still page has no Scroll speed.
  const credits = page.getByTestId('cue-field-f1');
  await expect(credits).toHaveValue('Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('PRODUCTION');
  await expect(page.getByTestId('cue-field-f2')).toHaveCount(0);

  // Two hundred names cannot stand on one page even at the floor: before any take, the field
  // says so in words.
  const tooLong = ['Research:', ...Array.from({ length: 200 }, (_, i) => `Name Number ${i + 1}`)].join('\n');
  await credits.fill(tooLong);
  await expect(page.getByTestId('cue-field-over-f1')).toBeVisible();
  await expect(page.getByTestId('cue-overflow')).toContainText('too long for the design');
  // On Take the page is not shown: nothing clipped, nothing rolling.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const state = () => air.locator('.imported-design-credits-roll').evaluate((roll) => {
    const w = window as unknown as { noacgCreditsTween: unknown; noacgCreditsLast: { still?: boolean; refused?: boolean } | null };
    return { tween: w.noacgCreditsTween, last: w.noacgCreditsLast, moved: getComputedStyle(roll).transform, shown: getComputedStyle(roll.querySelector('.imported-design-credits-rows')!).visibility };
  });
  await expect.poll(async () => (await state()).last).toEqual({ still: true, rows: 201, scale: 0.3, refused: true });
  expect(await state()).toMatchObject({ tween: null, moved: 'none', shown: 'hidden' });
  await expect(page.getByTestId('cue-field-over-f1')).toBeVisible();

  // The drawn list again, on Update: the page shows, still, where the rows were drawn.
  await credits.fill('Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  await page.getByTestId('verb-update').click();
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss']);
  await expect.poll(async () => (await state()).shown).toBe('visible');
  expect(await state()).toMatchObject({ tween: null, moved: 'none' });
  expect((await creditRowsAtRest(air)).map((r) => [r.kind, r.y])).toEqual([['role', 175], ['name', 240], ['name', 295], ['role', 445], ['name', 510]]);
  await expect(page.getByTestId('cue-field-over-f1')).toHaveCount(0);
});

test('role-above credits chosen to play as cards change on Next card, and a card too long says so before the take', async ({ page }) => {
  // jev-svg-import row 23 (AC-13): "Plays as: Cards" with no seconds saves cards that wait for
  // the operator's Next card. The graphic offers a blank Card time in place of Scroll speed, and
  // a Next card press. A card too long even at the floor is named on its field before the take.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  const playback = page.getByTestId('map-svg-credits-playback');
  await expect(playback.locator('option')).toHaveText(['Roll', 'Hold still', 'Cards']);
  await playback.selectOption('cards');
  await expect(page.getByTestId('map-svg-credits-cards')).toHaveText('A blank line starts a new card. A card too long for the page is not shown, and its field says so.');
  await expect(page.getByTestId('map-svg-credits-advance')).toHaveValue('');
  await expect(page.getByTestId('map-svg-credits-advance-hint')).toHaveText('Blank waits for Next card; playout systems without custom actions need a card time.');
  await intoProduction(page, 'Research cards', 'Research cards');
  await settleDurableWrites(page);

  // One list field, the drawn title and a blank Card time; no Scroll speed.
  const credits = page.getByTestId('cue-field-f1');
  await expect(credits).toHaveValue('Research:\nNia Vale\nTomas Fen\nSound:\nAri Moss');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('');
  await expect(page.getByText('F2 · Card time (s)')).toBeVisible();
  await expect(page.getByText('Scroll speed (%)')).toHaveCount(0);

  // A second card too long even at the floor: the field says so before any take.
  await credits.fill(['Research:', 'Nia Vale', '', 'Cast:', ...Array.from({ length: 200 }, (_, i) => `Name Number ${i + 1}`)].join('\n'));
  await expect(page.getByTestId('cue-field-over-f1')).toBeVisible();
  await expect(page.getByTestId('cue-overflow')).toContainText('too long for the design');

  // Two cards that fit: Take shows the first, Next card the second.
  await credits.fill('Research:\nNia Vale\nTomas Fen\n\nSound:\nAri Moss');
  await expect(page.getByTestId('cue-field-over-f1')).toHaveCount(0);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Research', 'Nia Vale', 'Tomas Fen']);
  await page.getByTestId('cue-actions').getByRole('button', { name: /Next card$/ }).click();
  await expect(rows).toHaveText(['Sound', 'Ari Moss']);
  expect((await creditRowsAtRest(air)).map((r) => [r.kind, r.y])).toEqual([['role', 175], ['name', 240]]);
});

// jev-svg-import row 21 (AC-13): continuous roll playback, built on a blank page the way the
// wizard saves each binding, with the entrance the motion picker sets. `styled` reads the drawn
// role and name layers from the first role down (rows 19 and 20); `block` keeps the same drawing
// as fixed artwork, every one of those layers scrolling (#1962).
type RollBuild = { layout: string; motion: string; engine: string | null; js: string; html: string };
function buildRolls(page: Page, source: string, roleWord: string, as: 'styled' | 'block', face: boolean, playback: 'roll' | 'static' | 'cards' = 'roll', advance?: number): Promise<RollBuild[]> {
  return page.evaluate(async ({ source, roleWord, as, face, playback, advance }) => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const { IMPORTED_SVG } = await import('/src/templates/importedDesign/svg.ts');
    const C = await import('/src/templates/importedDesign/creditsRoll.ts');
    const { initialDraft, mergeDraft } = await import('/src/components/wizard/draft/core.ts');
    const { withUniversalMotion } = await import('/src/components/wizard/draft/template.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const imp = importSvgMarkup(source);
    const content = imp.candidates.find((c) => c.sample === roleWord)!.id;
    const host = document.createElement('div');
    host.innerHTML = imp.markup;
    document.body.appendChild(host);
    const preview = C.creditsPreview(host.firstElementChild!, imp.candidates.map((c) => c.id), content);
    host.remove();
    if (!preview.styled) throw new Error(`${roleWord} does not read as styled credits`);
    const block = preview.anchors.map((a) => a.candidateId);
    const all = imp.candidates.map((c) => ({ candidateId: c.id, title: c.label, sample: c.sample, numeric: c.numeric }));
    const fields = as === 'styled' ? all.filter((f) => !block.includes(f.candidateId) || f.candidateId === content) : all;
    const credits = fields.findIndex((f) => f.candidateId === content);
    const svg = {
      markup: imp.markup, width: imp.width, height: imp.height, fields, images: [], outlines: [],
      fonts: face ? [{ family: 'Anton', fontId: 'anton' }] : [],
      behaviour: as === 'styled'
        ? { kind: 'recipe' as const, recipe: 'credits', layers: {}, fields: { credits }, credits: { v: 1 as const, layout: preview.layout, playback, ...(advance === undefined ? {} : { advance }), anchors: preview.anchors } }
        : { kind: 'recipe' as const, recipe: 'credits', layers: {}, fields: { credits }, options: { artwork: true }, artworkLayers: block.filter((id) => id !== content) },
    };
    const template = IMPORTED_SVG.create({ designSvg: svg });
    return (['drop', 'rise', 'pop'] as const).map((motion) => ({
      layout: preview.layout, motion, engine: C.creditsEngine(svg), js: template.js,
      html: composeDocument(withUniversalMotion(template, mergeDraft(initialDraft(), { animation: { motionIn: motion, motionOut: 'fade' } }), IMPORTED_SVG)),
    }));
  }, { source, roleWord, as, face, playback, advance });
}

/** Where the moving credits stand on screen at the start and at the end of the take, against the
 *  artwork's frame: the styled rows as one group, or every layer of the fixed block. */
function rollPoses(page: Page) {
  return page.evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: { pause(): void; progress(value?: number): number }; noacgCreditsLast: { distance: number } };
    const rows = document.querySelector('.imported-design-credits-rows');
    const moving = rows ? [rows] : [...document.querySelectorAll('.imported-design-credits')];
    const extent = () => {
      const boxes = moving.map((el) => el.getBoundingClientRect());
      return { top: Math.min(...boxes.map((b) => b.top)), bottom: Math.max(...boxes.map((b) => b.bottom)) };
    };
    // The styled roll runs through the artwork's frame (no Credits box is drawn); the fixed
    // artwork through the whole output, as its engine measures it.
    const frame = (rows ? document.querySelector('.imported-design-art')! : document.body).getBoundingClientRect();
    w.noacgCreditsTween.pause();
    w.noacgCreditsTween.progress(0);
    const start = extent();
    w.noacgCreditsTween.progress(0.5);
    const middle = extent();
    w.noacgCreditsTween.progress(1);
    const end = extent();
    return { start, middle, end, frameTop: frame.top, frameBottom: frame.bottom, distance: w.noacgCreditsLast.distance, layers: moving.length };
  });
}

test('styled credits, role above and role beside, enter and leave the whole frame, measure again when their faces land, and replay alike', async ({ page }) => {
  await page.goto('/app');
  // The design ships its own face (Anton), held back until the take has measured in a fallback.
  const ABOVE = readFileSync(ABOVE_CREDITS_SVG, 'utf8').replace('font-family="sans-serif"', 'font-family="Anton"');
  const BESIDE = readFileSync(BESIDE_CREDITS_SVG, 'utf8').replace(/font-family="[^"]*"/, 'font-family="Anton"');
  const builds = [...await buildRolls(page, ABOVE, 'Research', 'styled', true), ...await buildRolls(page, BESIDE, 'Réalisation', 'styled', true)];
  expect(builds.map((b) => [b.layout, b.engine])).toEqual([...Array(3).fill(['role-above', 'styled']), ...Array(3).fill(['role-beside', 'styled'])]);
  for (const b of builds) expect(b.js).toContain('function creditsSettle(tween)');
  // Every request for the face is held until released, each with its own resolver.
  const held: (() => void)[] = [];
  const asked: string[] = [];
  await page.route('**/fonts/anton*.woff2*', async (route) => {
    asked.push(route.request().url());
    await new Promise<void>((resolve) => { held.push(resolve); });
    await route.fulfill({ body: readFileSync('public/fonts/anton.woff2'), contentType: 'font/woff2' });
  });
  const release = () => { for (const resolve of held.splice(0)) resolve(); };
  for (const [i, b] of builds.entries()) {
    const at = `${b.layout} after ${b.motion}`;
    await page.goto('/robots.txt');
    // A fresh url per document, so the face is fetched (and held) every time.
    // Not waiting for load, which waits for the held face.
    await page.setContent(b.html.replace(/fonts\/anton(-latin-ext)?\.woff2/g, `fonts/anton$1.woff2?take=${i}`), { waitUntil: 'domcontentloaded' });
    await expect.poll(() => page.evaluate(() => document.fonts.status), `${at}: the face is on its way`).toBe('loading');
    await page.evaluate(() => (window as unknown as { play(): void }).play());
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${at}: the roll starts`).toBe(true);
    const early = await page.evaluate(async () => {
      const w = window as unknown as { noacgCreditsTween: { progress(): number }; noacgCreditsLast: { distance: number } };
      await new Promise((r) => setTimeout(r, 300));
      return { distance: w.noacgCreditsLast.distance, reached: w.noacgCreditsTween.progress(), fonts: document.fonts.status };
    });
    expect(early.fonts, `${at}: measured before the face landed`).toBe('loading');
    // This document's own request is held, so releasing frees it rather than an older one.
    await expect.poll(() => asked.some((url) => url.includes(`take=${i}`)) && held.length > 0, `${at}: the face's request is held`).toBe(true);
    release();
    await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsLast: { distance: number } }).noacgCreditsLast.distance), `${at}: measured again in the face`).not.toBe(early.distance);
    // It carried on from where it was rather than starting again.
    const reached = await page.evaluate(() => (window as unknown as { noacgCreditsTween: { progress(): number } }).noacgCreditsTween.progress());
    expect(reached, `${at}: the roll kept its progress`).toBeGreaterThanOrEqual(early.reached);
    const settled = await rollPoses(page);
    const say = `${at}: ${JSON.stringify(settled)}`;
    // The defect sides: a row already showing at the start, or still showing at the end.
    expect(settled.start.top, say).toBeGreaterThanOrEqual(settled.frameBottom - 0.5);
    expect(settled.start.top, say).toBeLessThan(settled.frameBottom + 0.5);
    expect(settled.end.bottom, say).toBeLessThanOrEqual(settled.frameTop + 0.5);
    expect(settled.end.bottom, say).toBeGreaterThan(settled.frameTop - 0.5);
    expect(settled.middle.top, say).toBeCloseTo((settled.start.top + settled.end.top) / 2, 0);
    // Out, and the same take again: the same roll.
    await page.evaluate(() => (window as unknown as { stop(): void }).stop());
    await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${at}: Out stops the roll`).toBeNull();
    await page.evaluate(() => (window as unknown as { play(): void }).play());
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${at}: the replay starts`).toBe(true);
    const replay = await rollPoses(page);
    expect(Math.abs(replay.distance - settled.distance), `${at}: the replay measures the same roll: ${JSON.stringify(replay)}`).toBeLessThan(1);
    expect(Math.abs(replay.start.top - replay.frameBottom), `${at}: replay start`).toBeLessThan(0.5);
    expect(Math.abs(replay.end.bottom - replay.frameTop), `${at}: replay end`).toBeLessThan(0.5);
  }
});

// jev-svg-import row 22 (AC-13): a still page. The rows stand where the drawing put them and
// nothing moves them; a list too tall for the window shrinks as a whole (type and spacing, each
// column on its drawn edge), and one too tall at the 30% floor is not shown and is reported.
type StillRow = { kind: string | null; text: string | null; x: number; y: number; left: number; right: number; top: number; bottom: number; size: number };
type StillPage = { rows: StillRow[]; last: { still: boolean; rows: number; scale: number; refused: boolean } | null; tween: unknown; moved: string; shown: string; over: string[]; field: string; frame: { width: number; height: number } };
function stillPage(page: Page): Promise<StillPage> {
  return page.evaluate(() => {
    const w = window as unknown as { noacgCreditsTween: unknown; noacgCreditsLast: StillPage['last']; noacgTextOverflow(): string[] | null; noacgFieldFor(role: string, key: null): string };
    const art = (document.querySelector('[data-noacg-credit]') as SVGGraphicsElement).ownerSVGElement!;
    const roll = document.querySelector('.imported-design-credits-roll') as SVGGElement;
    const round = (n: number) => Math.round(n * 100) / 100;
    const rows = [...document.querySelectorAll('.imported-design-credits-row')].map((el) => {
      const t = el as SVGTextElement;
      const m = art.getScreenCTM()!.inverse().multiply(t.getScreenCTM()!);
      const at = (x: number, y: number) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f });
      const p = at(t.getStartPositionOfChar(0).x, t.getStartPositionOfChar(0).y);
      const b = t.getBBox();
      const a = at(b.x, b.y);
      const z = at(b.x + b.width, b.y + b.height);
      return { kind: el.getAttribute('data-noacg-credits'), text: el.textContent, x: round(p.x), y: round(p.y), left: round(a.x), right: round(z.x), top: round(a.y), bottom: round(z.y), size: parseFloat(getComputedStyle(el).fontSize) };
    });
    const vb = art.viewBox.baseVal;
    return {
      rows, last: w.noacgCreditsLast, tween: w.noacgCreditsTween,
      moved: getComputedStyle(roll).transform + ' ' + (roll.getAttribute('transform') ?? ''),
      shown: getComputedStyle(document.querySelector('.imported-design-credits-rows')!).visibility,
      over: w.noacgTextOverflow() ?? [], field: w.noacgFieldFor('credits', null), frame: { width: vb.width, height: vb.height },
    };
  });
}

/** Write a new list and take again, as an operator's Update then Take. */
async function retake(page: Page, field: string, list: string) {
  await page.evaluate(({ field, list }) => {
    const w = window as unknown as { update(data: Record<string, string>): void; play(): void; noacgCreditsLast: unknown };
    w.update({ [field]: list });
    w.noacgCreditsLast = null;
    w.play();
  }, { field, list });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast), 'the take showed the page').toBe(true);
  return stillPage(page);
}

test('styled credits held still, role above and role beside: no travel, the whole list shrinks to fit, and a list past the floor is refused and reported', async ({ page }) => {
  await page.goto('/app');
  const layouts = [
    // credits-1: centred on 400 in an 800 frame, names 55 apart; the drawn page is the rows below.
    { source: readFileSync(ABOVE_CREDITS_SVG, 'utf8'), role: 'Research', drawn: [['role', 175], ['name', 240], ['name', 295], ['role', 445], ['name', 510]], edges: { role: 400, name: 400 }, head: 'Research:', smaller: 12, reported: 30 },
    // credits-2: roles from 90 and names from 440 in a 1100 by 540 frame.
    { source: readFileSync(BESIDE_CREDITS_SVG, 'utf8'), role: 'Réalisation', drawn: [['role', 195], ['name', 195], ['role', 365], ['name', 365], ['name', 420]], edges: { role: 90, name: 440 }, head: 'Son:', smaller: 8, reported: 15 },
  ];
  for (const layout of layouts) {
    const builds = await buildRolls(page, layout.source, layout.role, 'styled', false, 'static');
    for (const b of builds) {
      const at = `${b.layout} after ${b.motion}`;
      expect(b.engine, at).toBe('styled');
      // A still page carries no roll: no travel, no pace.
      expect(b.js, at).not.toContain('gsap.fromTo(roll');
      await page.goto('/robots.txt');
      await page.setContent(b.html);
      await page.evaluate(() => (window as unknown as { play(): void }).play());
      await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast), `${at}: taken`).toBe(true);
      const taken = await stillPage(page);
      const say = `${at}: ${JSON.stringify(taken)}`;
      expect(taken.last, say).toEqual({ still: true, rows: 5, scale: 1, refused: false });
      expect(taken.tween, say).toBeNull();
      expect(taken.moved, say).toBe('none ');
      // Where the drawing put each row, in its drawn size, on its column's edge.
      expect(taken.rows.map((r) => [r.kind, Math.round(r.y)]), say).toEqual(layout.drawn);
      for (const r of taken.rows) {
        const edge = b.layout === 'role-above' ? (r.left + r.right) / 2 : r.x;
        expect(Math.abs(edge - layout.edges[r.kind as 'role' | 'name']), `${say}: ${r.text}'s edge`).toBeLessThan(0.6);
      }
      // A moment later, after the entrance: the same rows in the same places.
      await page.waitForTimeout(700);
      const later = await stillPage(page);
      expect(later.rows, `${at}: held still`).toEqual(taken.rows);
      expect(later.tween, `${at}: still no roll`).toBeNull();
    }
    const b = builds[0];
    await page.goto('/robots.txt');
    await page.setContent(b.html);
    await page.evaluate(() => (window as unknown as { play(): void }).play());
    await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast)).toBe(true);
    const { field, frame } = await stillPage(page);
    const names = (n: number) => [layout.head, ...Array.from({ length: n }, (_, i) => `Name Number ${i + 1}`)].join('\n');
    // The room runs from the first drawn role down to half a drawn line (55) above the frame's
    // bottom: the page's last ink must not pass it (clipped), and must reach it (room unspent).
    const limit = frame.height - 27.5;
    const firstY = layout.drawn[0][1] as number;
    // Three names fit as drawn; the other two lists shrink, the second past the report line.
    for (const [n, reported] of [[3, false], [layout.smaller, false], [layout.reported, true]] as const) {
      const shown = await retake(page, field, names(n));
      const say = `${b.layout}, ${n} names: ${JSON.stringify({ ...shown, rows: shown.rows.slice(-2) })}`;
      expect(shown.last?.refused, say).toBe(false);
      expect(shown.shown, say).toBe('visible');
      expect(shown.rows.length, say).toBe(n + 1);
      expect(shown.rows.map((r) => r.text), say).toEqual(names(n).split('\n').map((t) => t.replace(/:$/, '')));
      const bottom = Math.max(...shown.rows.map((r) => r.bottom));
      expect(bottom, say).toBeLessThanOrEqual(limit + 0.5);
      if (shown.last!.scale < 1) expect(bottom, say).toBeGreaterThan(limit - 2);
      // The first role stays where it was drawn, and every row keeps its column's edge.
      expect(Math.abs(shown.rows[0].y - firstY), say).toBeLessThan(0.6);
      for (const r of shown.rows) {
        const edge = b.layout === 'role-above' ? (r.left + r.right) / 2 : r.x;
        expect(Math.abs(edge - layout.edges[r.kind as 'role' | 'name']), `${say}: ${r.text}'s edge`).toBeLessThan(0.6);
      }
      // Type and spacing shrink together, and past 55% the Credits field is reported.
      expect(shown.last!.scale, say).toBeGreaterThanOrEqual(0.3);
      expect(shown.over.includes(field), say).toBe(reported);
      if (reported) expect(shown.last!.scale, say).toBeLessThan(0.55);
    }
    expect((await retake(page, field, names(3))).last!.scale, `${b.layout}: three names fit as drawn`).toBe(1);
    // Past the floor: not clipped, not rolled, not shown; the Credits field says it is too long.
    const refused = await retake(page, field, names(200));
    const say = `${b.layout}, 200 names: ${JSON.stringify({ ...refused, rows: refused.rows.length })}`;
    expect(refused.last?.refused, say).toBe(true);
    expect(refused.shown, say).toBe('hidden');
    expect(refused.over, say).toContain(field);
    expect(refused.tween, say).toBeNull();
    // Shortened again, the page comes back and the report clears.
    const back = await retake(page, field, names(3));
    expect([back.shown, back.over, back.last?.refused], `${b.layout}: shortened again`).toEqual(['visible', [], false]);
  }
});

test('a still page measured before its face lands is fitted again when the face arrives', async ({ page }) => {
  // credits-1 in Anton, held back until the take has fitted the page in a fallback face.
  await page.goto('/app');
  const ABOVE = readFileSync(ABOVE_CREDITS_SVG, 'utf8').replace('font-family="sans-serif"', 'font-family="Anton"');
  const [b] = await buildRolls(page, ABOVE, 'Research', 'styled', true, 'static');
  const held: (() => void)[] = [];
  await page.route('**/fonts/anton*.woff2*', async (route) => {
    await new Promise<void>((resolve) => { held.push(resolve); });
    await route.fulfill({ body: readFileSync('public/fonts/anton.woff2'), contentType: 'font/woff2' });
  });
  await page.goto('/robots.txt');
  await page.setContent(b.html, { waitUntil: 'domcontentloaded' });
  await expect.poll(() => page.evaluate(() => document.fonts.status), 'the face is on its way').toBe('loading');
  const field = await page.evaluate(() => (window as unknown as { noacgFieldFor(role: string, key: null): string }).noacgFieldFor('credits', null));
  const list = ['Research:', ...Array.from({ length: 12 }, (_, i) => `Name Number ${i + 1}`)].join('\n');
  await page.evaluate(({ field, list }) => {
    const w = window as unknown as { update(data: Record<string, string>): void; play(): void };
    w.update({ [field]: list });
    w.play();
  }, { field, list });
  await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast)).toBe(true);
  const early = await page.evaluate(() => ({ fonts: document.fonts.status, sizes: [...document.querySelectorAll('.imported-design-credits-row')].map((el) => (el as SVGTextElement).getComputedTextLength()) }));
  expect(early.fonts, 'fitted before the face landed').toBe('loading');
  await expect.poll(() => held.length > 0, 'the face request is held').toBe(true);
  for (const resolve of held.splice(0)) resolve();
  await expect.poll(() => page.evaluate(() => document.fonts.status)).toBe('loaded');
  // Fitted again in the face: the same rule as any still page, read in the face's own metrics.
  await expect.poll(async () => {
    const shown = await stillPage(page);
    const bottom = Math.max(...shown.rows.map((r) => r.bottom));
    return { refitted: shown.last!.scale < 1 && bottom <= 772.5 + 0.5 && bottom > 772.5 - 2, widths: shown.rows.length };
  }, 'fitted again in the face').toEqual({ refitted: true, widths: 13 });
  const late = await page.evaluate(() => [...document.querySelectorAll('.imported-design-credits-row')].map((el) => (el as SVGTextElement).getComputedTextLength()));
  expect(late, 'the rows are now set in the face').not.toEqual(early.sizes);
});

// jev-svg-import row 23 (AC-13): cards. The list is dealt into cards that each hold still as a
// still page does: a blank line starts a card, a role and its names stay on one card whole, and a
// group too long for one card is fitted or refused on a card of its own. A card changes on the
// card time, or on Next card; the last one holds until Out, and a take starts from the first.
type CardsState = { card: number; shown: number; cards: { rows: number; scale: number; refused: boolean }[]; tween: boolean; opacity: string; visibility: string; over: string[]; field: string; rows: StillRow[] };
async function cardsState(page: Page): Promise<CardsState> {
  const still = await stillPage(page);
  const more = await page.evaluate(() => {
    const w = window as unknown as { noacgCreditsLast: { card: number; shown: number; cards: CardsState['cards'] }; noacgCreditsTween: unknown };
    const face = document.querySelector('.imported-design-credits-roll') as SVGGElement;
    return { ...w.noacgCreditsLast, tween: !!w.noacgCreditsTween, opacity: getComputedStyle(face).opacity };
  });
  return { ...more, visibility: still.shown, over: still.over, field: still.field, rows: still.rows };
}
const names = (head: string, n: number, from = 1) => [head, ...Array.from({ length: n }, (_, i) => `Name ${i + from}`)];
const cardsDispatch = (page: Page, call: 'play' | 'stop' | 'next') => page.evaluate((call) => {
  const w = window as unknown as { play(): void; stop(): void; noacgDispatch(event: string): void };
  if (call === 'next') w.noacgDispatch('nextCard');
  else w[call]();
}, call);

const CARD_LAYOUTS = [
  // credits-1: roles at 175 and names 65 then 55 below, the next role 150 after a group; the room
  // ends half a drawn line above the 800 frame's bottom.
  { source: readFileSync(ABOVE_CREDITS_SVG, 'utf8'), role: 'Research', top: 175, limit: 772.5, perCard: 2, cast: 30 },
  // credits-2: a role and its first name on one line at 195, the next role 170 after a group's
  // last line; 540 tall, so one group of three names fills a card.
  { source: readFileSync(BESIDE_CREDITS_SVG, 'utf8'), role: 'Réalisation', top: 195, limit: 512.5, perCard: 1, cast: 15 },
];
for (const layout of CARD_LAYOUTS) {
  test(`styled credits as cards, ${layout.role === 'Research' ? 'role above' : 'role beside'}: page boundaries, whole groups, long cards, ordering, both advances and replay`, async ({ page }) => {
    await page.goto('/app');
    const [onNext] = await buildRolls(page, layout.source, layout.role, 'styled', false, 'cards');
    const [timed] = await buildRolls(page, layout.source, layout.role, 'styled', false, 'cards', 2);
    const at = onNext.layout;
    expect([onNext.engine, timed.engine], at).toEqual(['styled', 'styled']);
    expect(onNext.js, at).not.toContain('gsap.fromTo(roll');
    await page.goto('/robots.txt');
    await page.setContent(onNext.html);
    const { field } = await stillPage(page);
    const write = (list: string[]) => page.evaluate(({ field, list }) => (window as unknown as { update(d: Record<string, string>): void }).update({ [field]: list }), { field, list: list.join('\n') });

    // PAGE BOUNDARIES: a blank line starts a new card; within one, whole groups fill each card.
    const groups = [0, 1, 2, 3, 4].map((g) => names(`Role ${g + 1}:`, 3, 3 * g + 1));
    const list = [...groups[0], '', ...groups.slice(1).flat()];
    await write(list);
    const rest = await cardsState(page);
    const expected = [groups[0]];
    for (let g = 1; g < groups.length; g += layout.perCard) expected.push(groups.slice(g, g + layout.perCard).flat());
    expect(rest.cards.map((c) => c.rows), `${at}: dealt ${JSON.stringify(rest.cards)}`).toEqual(expected.map((c) => c.length));
    // Off air the first card is shown.
    expect([rest.card, rest.shown, rest.tween], at).toEqual([-1, 0, false]);
    await cardsDispatch(page, 'play');
    const seen: string[][] = [];
    for (let k = 0; k < expected.length; k++) {
      await expect.poll(async () => (await cardsState(page)).shown, `${at}: card ${k}`).toBe(k);
      await expect.poll(async () => (await cardsState(page)).opacity, `${at}: card ${k} faded in`).toBe('1');
      const card = await cardsState(page);
      const say = `${at}, card ${k}: ${JSON.stringify({ ...card, rows: card.rows.map((r) => [r.text, r.y, r.bottom]) })}`;
      // ROLE AND NAMES: every role on the card is followed by all its names; the first row stands
      // where the first role is drawn, at the drawn size, and nothing passes the card's room.
      expect(card.rows.map((r) => r.text), say).toEqual(expected[k].map((t) => t.replace(/:$/, '')));
      expect(card.rows.map((r) => r.kind), say).toEqual(expected[k].map((t) => (t.endsWith(':') ? 'role' : 'name')));
      expect(Math.abs(card.rows[0].y - layout.top), say).toBeLessThan(0.6);
      expect(Math.max(...card.rows.map((r) => r.bottom)), say).toBeLessThanOrEqual(layout.limit + 0.5);
      expect([card.cards[k].scale, card.cards[k].refused, card.visibility], say).toEqual([1, false, 'visible']);
      seen.push(card.rows.map((r) => r.text!));
      // MANUAL ADVANCE: with no card time, a card waits for Next card.
      if (k === 0) {
        await page.waitForTimeout(2500);
        expect((await cardsState(page)).shown, `${at}: no card time, no change`).toBe(0);
      }
      await cardsDispatch(page, 'next');
    }
    // ORDERING: the cards, in order, are the list without its blank line.
    expect(seen.flat(), at).toEqual(list.filter(Boolean).map((t) => t.replace(/:$/, '')));
    // The last card holds: Next does nothing more.
    await page.waitForTimeout(1200);
    expect([(await cardsState(page)).shown, (await cardsState(page)).tween], `${at}: the last card holds`).toEqual([expected.length - 1, false]);
    // REPLAY: a take starts from the first card, Out from a card that is not the last takes the
    // cards off air, Next off air does nothing, and the next take starts from the first card.
    await cardsDispatch(page, 'play');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: a take starts on the first card`).toBe(0);
    await cardsDispatch(page, 'next');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: the second card`).toBe(1);
    await cardsDispatch(page, 'stop');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: Out`).toBe(-1);
    await cardsDispatch(page, 'next');
    await page.waitForTimeout(1200);
    expect([(await cardsState(page)).card, (await cardsState(page)).tween], `${at}: Next off air`).toEqual([-1, false]);
    await cardsDispatch(page, 'play');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: the replay starts on the first card`).toBe(0);
    expect((await cardsState(page)).rows.map((r) => r.text), at).toEqual(seen[0]);

    // LONG CARDS: a group too long for one card is a card of its own, shrunk as a whole and
    // reported past 55%, before any take; past the floor it is not shown, and reported.
    // (credits-2's shorter frame holds fewer names at the floor.)
    const long = [...groups[0], '', ...names('Cast:', layout.cast)];
    await write(long);
    const dealt = await cardsState(page);
    const sayLong = `${at}, long: ${JSON.stringify(dealt.cards)}`;
    expect(dealt.cards.map((c) => c.rows), sayLong).toEqual([4, layout.cast + 1]);
    expect(dealt.cards.map((c) => c.refused), sayLong).toEqual([false, false]);
    expect(dealt.cards[0].scale, sayLong).toBe(1);
    expect(dealt.cards[1].scale, sayLong).toBeLessThan(0.55);
    expect(dealt.cards[1].scale, sayLong).toBeGreaterThanOrEqual(0.3);
    expect(dealt.over, `${sayLong}: reported before it is shown`).toContain(field);
    await cardsDispatch(page, 'next');
    await expect.poll(async () => (await cardsState(page)).shown, `${at}: the long card`).toBe(1);
    const shrunk = await cardsState(page);
    const bottom = Math.max(...shrunk.rows.map((r) => r.bottom));
    expect(bottom, `${at}: the long card fills its room and does not pass it`).toBeLessThanOrEqual(layout.limit + 0.5);
    expect(bottom, `${at}: the long card fills its room`).toBeGreaterThan(layout.limit - 2);
    await write([...groups[0], '', ...names('Cast:', 200)]);
    const refused = await cardsState(page);
    expect([refused.cards[1].refused, refused.visibility, refused.over.includes(field)], `${at}: refused`).toEqual([true, 'hidden', true]);
    await write(list);
    expect((await cardsState(page)).over, `${at}: the report clears`).toEqual([]);

    // AUTOMATIC ADVANCE: the author's two seconds per card, and Next still skips ahead.
    await page.goto('/robots.txt');
    await page.setContent(timed.html);
    await write(list);
    await cardsDispatch(page, 'play');
    const started = Date.now();
    await expect.poll(async () => (await cardsState(page)).shown, { message: `${at}: timed`, timeout: 6000 }).toBe(1);
    const held = Date.now() - started;
    expect(held, `${at}: the first card held its two seconds`).toBeGreaterThanOrEqual(1900);
    await cardsDispatch(page, 'next');
    await expect.poll(async () => (await cardsState(page)).shown, `${at}: Next skips ahead`).toBe(2);
    // Its hold starts again; the last card has none.
    await expect.poll(async () => (await cardsState(page)).tween, `${at}: the hold after Next`).toBe(expected.length - 1 > 2);

    // A NEW CARD TIME applies to the hold under way, counted from when that hold started: 8 at
    // 1.5 s, then 4 at 3 s, turns at 4 s (counted from the change at 1.5 s it would be 5.5 s).
    const time = await page.evaluate(() => (window as unknown as { noacgFieldFor(role: string, key: null): string }).noacgFieldFor('cardTime', null));
    const setTime = (seconds: string) => page.evaluate(({ time, seconds }) => (window as unknown as { update(d: Record<string, string>): void }).update({ [time]: seconds }), { time, seconds });
    await cardsDispatch(page, 'play');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: taken again`).toBe(0);
    const taken = Date.now();
    await page.waitForTimeout(1500);
    await setTime('8');
    await page.waitForTimeout(1500);
    await setTime('4');
    await expect.poll(async () => (await cardsState(page)).shown, { message: `${at}: the changed time`, timeout: 8000 }).toBe(1);
    const turned = Date.now() - taken;
    expect(turned, `${at}: turned after the new time, counted from the hold's start`).toBeGreaterThanOrEqual(3900);
    expect(turned, `${at}: not counted from the first change`).toBeLessThan(5000);

    // OUT DURING A CHANGE: nothing half-faded is left for the next look at the graphic off air.
    await cardsDispatch(page, 'next');
    await expect.poll(async () => Number((await cardsState(page)).opacity), `${at}: the change is fading`).toBeLessThan(0.9);
    await cardsDispatch(page, 'stop');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: Out mid-change`).toBe(-1);
    await write(list);
    expect([(await cardsState(page)).shown, (await cardsState(page)).opacity], `${at}: off air after a cut-short change`).toEqual([0, '1']);

    // A LIST THAT GROWS ON AIR: the only card holds with no timer, then gains cards and starts its hold.
    await setTime('2');
    await write(groups[0]);
    await cardsDispatch(page, 'play');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: one card`).toBe(0);
    await page.waitForTimeout(2500);
    expect([(await cardsState(page)).shown, (await cardsState(page)).tween], `${at}: the only card holds`).toEqual([0, false]);
    await write(list);
    await expect.poll(async () => (await cardsState(page)).shown, { message: `${at}: grown, it turns`, timeout: 5000 }).toBe(1);

    // SHRUNK TO THE LAST, THEN GROWN: the card on air becomes the last (no hold), its old hold's
    // time passes, and grown again it starts a hold and turns.
    await write([...groups[0], '', ...groups[1]]);
    await page.waitForTimeout(2500);
    expect([(await cardsState(page)).shown, (await cardsState(page)).tween], `${at}: now the last card`).toEqual([1, false]);
    await write(list);
    await expect.poll(async () => (await cardsState(page)).shown, { message: `${at}: grown again, it turns`, timeout: 5000 }).toBe(2);

    // SHRUNK DURING A CHANGE: the change lands on a card that is still dealt, never on an empty one.
    await setTime('');
    await write([...groups[0], '', ...groups[1]]);
    await cardsDispatch(page, 'play');
    await expect.poll(async () => (await cardsState(page)).card, `${at}: taken, Next only`).toBe(0);
    await cardsDispatch(page, 'next');
    await expect.poll(async () => Number((await cardsState(page)).opacity), `${at}: fading to the second card`).toBeLessThan(0.9);
    await write(groups[0]);
    await expect.poll(async () => (await cardsState(page)).opacity, `${at}: the change ends`).toBe('1');
    const landed = await cardsState(page);
    expect([landed.card, landed.shown, landed.visibility, landed.rows.map((r) => r.text)], `${at}: landed on a dealt card`).toEqual([0, 0, 'visible', groups[0].map((t) => t.replace(/:$/, ''))]);
  });
}

test('fixed-artwork credits drawn as separate layers enter and leave the whole frame as one block after Drop, Rise and Pop', async ({ page }) => {
  // #1962 kept as artwork: every drawn role and name moves the same distance, the block's top
  // starting at the frame's bottom and its bottom leaving at the frame's top, on every replay.
  await page.goto('/app');
  const builds = [
    ...await buildRolls(page, readFileSync(ABOVE_CREDITS_SVG, 'utf8'), 'Research', 'block', false),
    ...await buildRolls(page, readFileSync(BESIDE_CREDITS_SVG, 'utf8'), 'Réalisation', 'block', false),
  ];
  expect(builds.map((b) => b.engine)).toEqual(Array(6).fill('artwork'));
  for (const b of builds) {
    const at = `${b.layout} block after ${b.motion}`;
    await page.goto('about:blank');
    await page.setContent(b.html);
    for (const take of ['first', 'replay']) {
      await page.evaluate(() => (window as unknown as { play(): void }).play());
      await expect.poll(() => page.evaluate(() => !!(window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${at}, ${take}: the roll starts after its entrance`).toBe(true);
      const pose = await rollPoses(page);
      const say = `${at}, ${take}: ${JSON.stringify(pose)}`;
      expect(pose.layers, say).toBe(5);
      expect(Math.abs(pose.start.top - pose.frameBottom), say).toBeLessThan(0.5);
      expect(Math.abs(pose.end.bottom - pose.frameTop), say).toBeLessThan(0.5);
      const travel = await page.evaluate(() => {
        const w = window as unknown as { noacgCreditsTween: { progress(value: number): void } };
        const texts = [...document.querySelectorAll('.imported-design-credits')];
        w.noacgCreditsTween.progress(0);
        const from = texts.map((t) => t.getBoundingClientRect().top);
        w.noacgCreditsTween.progress(1);
        return texts.map((t, i) => t.getBoundingClientRect().top - from[i]);
      });
      for (const d of travel) expect(Math.abs(d - travel[0]), `${at}, ${take}: one block: ${travel.join(', ')}`).toBeLessThan(0.5);
      await page.evaluate(() => (window as unknown as { stop(): void }).stop());
      await expect.poll(() => page.evaluate(() => (window as unknown as { noacgCreditsTween: unknown }).noacgCreditsTween), `${at}, ${take}: Out stops the roll`).toBeNull();
    }
  }
});

test('a source layer drawn with its own inline opacity, in a group of its own, rolls at both opacities multiplied (#1937)', async ({ page }) => {
  // The import moves every inline style onto a class (svgImport.ts `hoistInlineStyles`), and the
  // roll's own row rule outranks a class, so the copies never carry an inline value that beats it.
  await page.goto('/app');
  const source = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="600" viewBox="0 0 1000 600" font-family="sans-serif" fill="#fff">
  <rect width="1000" height="600" fill="#1d2433" />
  <g opacity="0.5"><text x="100" y="150" font-size="24" fill="#ffcc00" style="opacity:0.8;text-decoration:underline">Director</text></g>
  <text x="100" y="205" font-size="40">Alex Rivera</text>
  <text x="100" y="260" font-size="40">Ida Lake</text>
  <g opacity="0.5"><text x="100" y="380" font-size="24" fill="#ffcc00" style="opacity:0.8;text-decoration:underline">Sound</text></g>
  <text x="100" y="435" font-size="40">Ari Moss</text>
</svg>`;
  const [built] = await buildRolls(page, source, 'Director', 'styled', false);
  expect(built.engine).toBe('styled');
  await page.goto('about:blank');
  await page.setContent(built.html);
  const rows = page.locator('.imported-design-credits-row');
  await expect(rows).toHaveText(['Director', 'Alex Rivera', 'Ida Lake', 'Sound', 'Ari Moss']);
  const looks = await rows.evaluateAll((els) => els.map((el) => {
    const cs = getComputedStyle(el);
    return [el.getAttribute('data-noacg-credits'), cs.opacity, cs.textDecorationLine];
  }));
  expect(looks).toEqual([
    ['role', '0.4', 'underline'], ['name', '1', 'none'], ['name', '1', 'none'], ['role', '0.4', 'underline'], ['name', '1', 'none'],
  ]);
});

test('imported credits: one pasted list rolls through the Credits box in the sample\'s two looks', async ({ page }) => {
  test.slow(); // an import, a production, two takes and a paste, read in the renderer
  await openLegacyProduction(page, 'End credits', 'Friday Show');
  await settleDurableWrites(page);

  // ONE FIELD, holding the sample line for line - the drawn breaks are the format, so they
  // survive where an ordinary block's would join with a space. Scroll speed sits beside it at
  // the catalog's 100, and it is a number, so the panel offers it as a stepper too.
  const credits = page.getByTestId('cue-field-f1');
  await expect(credits).toHaveValue(/^Host:\nMaija Meikäläinen\nGuests:\nVille Virtanen\nAino Aalto\n/);
  await expect(credits).toHaveValue(/Brain Battle 2026$/);
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('100');
  await expect(page.getByTestId('live-numbers')).toContainText('Scroll speed');
  // Never a field per name: the heading, the list, the speed, and no fourth box.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('END CREDITS');
  await expect(page.getByTestId('cue-field-f3')).toHaveCount(0);

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const rows = air.locator('.imported-design-credits-rows tspan');
  await expect(rows).toHaveCount(DEFAULT_ROWS);

  // THE TWO LOOKS. A title row wears the sample's title run's class; a name row wears what the
  // line under it wore - here nothing of its own, so the text's own look. The kerned name
  // ("V" + "ille Virtanen", two runs on one baseline in the file) arrived as one line.
  const titles = air.locator('.imported-design-credits-rows tspan[data-noacg-credits="title"]');
  await expect(titles).toHaveCount(DEFAULT_TITLES);
  await expect(titles.first()).toHaveText('Host:');
  await expect(titles.first()).toHaveClass('st2');
  const names = air.locator('.imported-design-credits-rows tspan[data-noacg-credits="name"]');
  await expect(names).toHaveCount(DEFAULT_ROWS - DEFAULT_TITLES);
  await expect(names.first()).toHaveText('Maija Meikäläinen');
  await expect(names.first()).not.toHaveAttribute('class', /st2/);
  await expect(names.nth(1)).toHaveText('Ville Virtanen');
  // The sample is laid out and never painted; the rows stand where it was drawn.
  await expect(air.locator('.imported-design-credits')).toHaveCSS('visibility', 'hidden');

  // THE ROLL runs inside the box: the window is the plate's own rectangle, and the list travels
  // its whole length plus the window, at the sample's leading times the authored pace.
  const first = await lastRoll(air);
  expect(first.boxed).toBe(true);
  expect(first.rows).toBe(DEFAULT_ROWS);
  expect(first.step).toBeCloseTo(SAMPLE_STEP, 0);
  expect(first.startY).toBeGreaterThan(first.endY);
  expect(first.distance).toBeGreaterThan(800); // the box is 800 tall; the list adds its own height
  expect(first.duration).toBeCloseTo(first.distance / (first.step * LINES_PER_SECOND), 1);
  // About thirty lines in about thirty seconds is what Scroll speed 100 means; this list is
  // shorter, so it is through sooner.
  expect(first.duration).toBeGreaterThan(18);
  expect(first.duration).toBeLessThan(32);
  expect(await rollWindow(air)).toEqual({ y: 150, height: 800 });
  // …and it is moving: a constant-speed tween, already under way.
  await expect
    .poll(() => air.locator('.imported-design-credits-rows').evaluate(() => (window as unknown as { noacgCreditsTween: { progress(): number } }).noacgCreditsTween.progress()))
    .toBeGreaterThan(0.02);
  await shot(page, 'credits-1-rolling-early', 2_000);
  await shot(page, 'credits-2-rolling-mid', 8_000);

  // THE FORMAT, on a fresh paste: inline, a spreadsheet tab, a blank line for a new section.
  // Update rebuilds the rows in place, and the new speed reaches the roll already running: twice
  // the pace from that frame, carried on from where the list was rather than restarted.
  // `onRoot` is why a timeScale cannot jump the list: GSAP's root timeline holds a child's
  // playhead still across the change. Nested in a step timeline it would need what the catalog
  // roll does (creditsApplySpeed), so the spec pins where the take lives.
  const running = () => air.locator('.imported-design-credits-rows').evaluate(() => {
    const w = window as unknown as {
      noacgCreditsTween: { progress(): number; timeScale(): number; parent: unknown };
      gsap: { globalTimeline: unknown };
    };
    const tween = w.noacgCreditsTween;
    return { progress: tween.progress(), timeScale: tween.timeScale(), onRoot: tween.parent === w.gsap.globalTimeline };
  });
  const beforeUpdate = await running();
  expect(beforeUpdate.onRoot).toBe(true);
  await credits.fill('Director: Alex Rivera\nCamera:\nJonas Berg\nLena Fors\n\nProducer\tSam Chen');
  await page.getByTestId('cue-field-f2').fill('200');
  await page.getByTestId('verb-update').click();
  await expect(rows).toHaveCount(7);
  await expect.poll(async () => (await running()).timeScale).toBe(2);
  expect((await running()).progress).toBeGreaterThan(beforeUpdate.progress);
  await expect(titles).toHaveText(['Director:', 'Camera:', 'Producer:']);
  await expect(names).toHaveText(['Alex Rivera', 'Jonas Berg', 'Lena Fors', 'Sam Chen']);
  await shot(page, 'credits-3-new-paste', 500);

  await page.getByTestId('verb-out').click();
  await page.getByTestId('verb-take').click();
  await expect.poll(async () => (await lastRoll(air)).rows).toBe(7);
  const second = await lastRoll(air);
  // Twice the speed halves the time for the same travel.
  expect(second.duration).toBeCloseTo(second.distance / (second.step * LINES_PER_SECOND * 2), 1);
  expect(second.distance).toBeLessThan(first.distance);

  // THE EXPORT ROLLS ON ITS OWN: the package carries the engine and the parser it shares with
  // the catalog rolls, and nothing that reaches for the network.
  const b64 = await page.evaluate(async (production) => {
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const fresh = shows.loadShows().find((s) => s.name === production)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  }, 'Friday Show');
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const payload = Object.keys(zip.files).find((n) => /(^|\/)payload\.json$/.test(n))!;
  const manifest = JSON.parse(await zip.file(payload)!.async('string')) as { graphics: { file: string }[] };
  const folder = payload.replace(/payload\.json$/, '');
  const html = await zip.file(`${folder}${manifest.graphics[0].file}`)!.async('string');
  expect(html).toContain('function noacgCreditsRoll()');
  expect(html).toContain('function parseCredits(text, escape)');
  expect(html).not.toMatch(/<script[^>]+src="https?:/i);
});

test('imported credits: with no Credits box the roll runs through the whole frame', async ({ page }) => {
  test.slow();
  // A legacy design with no selected plate still uses the whole frame.
  await openLegacyProduction(page, 'Frame credits', 'Frame Show', false);
  await settleDurableWrites(page);

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const roll = await lastRoll(air);
  expect(roll.boxed).toBe(false);
  expect(roll.rows).toBe(DEFAULT_ROWS);
  expect(await rollWindow(air)).toEqual({ y: 0, height: 1080 });
  await shot(page, 'credits-4-whole-frame', 6_000);
  // A taller window is a longer travel at the same pace.
  expect(roll.distance).toBeGreaterThan(1080);
  expect(roll.duration).toBeCloseTo(roll.distance / (roll.step * LINES_PER_SECOND), 1);
});
