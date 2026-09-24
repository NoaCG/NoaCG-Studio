import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { settleDurableWrites } from './_durable';
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

async function openImportDoor(page: Page) {
  await page.goto('/app');
  await dropSvg(page, CREDITS_SVG);
  // THE PROPOSAL (naming.ts): "Credits" is the recipe's own evidence, and the box is its plate.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('credits');
  await expect(page.getByTestId('map-svg-recipe-credits').locator('option:checked')).toHaveText('Credits');
  await expect(page.getByTestId('map-svg-recipe-box').locator('option:checked')).toHaveText('Credits box');
}

test('imported credits: one pasted list rolls through the Credits box in the sample\'s two looks', async ({ page }) => {
  test.slow(); // an import, a production, two takes and a paste, read in the renderer
  await openImportDoor(page);
  await intoProduction(page, 'End credits', 'Friday Show');
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
  // Update rebuilds the rows in place; the speed applies from the next take.
  await credits.fill('Director: Alex Rivera\nCamera:\nJonas Berg\nLena Fors\n\nProducer\tSam Chen');
  await page.getByTestId('cue-field-f2').fill('200');
  await page.getByTestId('verb-update').click();
  await expect(rows).toHaveCount(7);
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
  await openImportDoor(page);
  // The plate is optional. Unpick it and the window is the artwork's own frame.
  await page.getByTestId('map-svg-recipe-box').selectOption('');
  await intoProduction(page, 'Frame credits', 'Frame Show');
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
