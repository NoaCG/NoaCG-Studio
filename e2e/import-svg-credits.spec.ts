// The credits roll on imported artwork (docs/END_CREDITS.md): its recipe, the roll engine, the
// parser it shares with the catalog rolls, the fields list that turns the sample into one box,
// and its fixture. The SVG examples walk rides along: its credits are the list the default
// pace was set by (about thirty seconds), rolled from Illustrator's own output.
// covers: src/templates/{behaviours/credits.ts,importedDesign/{creditsRoll,creditsArtwork,artworkFields,svg,svgBind}.ts,endCredits/shared.ts}
// covers: e2e/fixtures/{credits-roll,credits-artwork}.svg
// covers: src/components/wizard/import/{draft.ts,BehaviourSection.tsx}
// covers: src/components/wizard/draft/template.ts, src/blocks/motionPresets.ts
// covers: src/components/home/CueActions.tsx

import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
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
