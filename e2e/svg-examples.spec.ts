// The credits roll on imported artwork (docs/END_CREDITS.md): its recipe, the roll engine, the
// parser it shares with the catalog rolls, the fields list that turns the sample into one box,
// and its fixture. The examples walk rides along: its credits are the list the default pace was
// set by (about thirty seconds), rolled from Illustrator's own output.
// covers: src/templates/{behaviours/credits.ts,importedDesign/{creditsRoll,artworkFields}.ts,endCredits/shared.ts}
// covers: e2e/fixtures/credits-roll.svg
//
// The SVG examples are the other road through real Illustrator output, and the only files
// anywhere carrying Illustrator 30's look-wrapped lines (svgImport.ts `unwrapLookWrappers`).
// covers: src/assets/svgImport.ts
//
// THE SVG EXAMPLES (docs/tutorials/svg-examples/) are a fixture set for the same reason: this spec
// imports their SVG/ files, so the ignore in scripts/e2e-affected.mjs carves the folder out.
// downloads.spec.ts rides along because it checks the committed zip still holds these files.
// covers: docs/tutorials/svg-examples/**

import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoExistingProduction, intoProduction } from './_svg-import';
import { settleDurableWrites } from './_durable';

// THE SVG EXAMPLES, RUN AS A SHOW (docs/tutorials/svg-examples, offered at /downloads#svg-examples).
//
// Somebody downloads the seven examples and does what the README says: import each one, put them
// in one production, run the show. This walks exactly that with the SVGs Illustrator wrote (never
// copies): every file imports, the quiz, the scoreboard and the countdown are recognised from
// their layer names alone with every moment found, all seven land in ONE production on seven
// layers, and each one does on the dashboard what the README promises - the title takes and goes
// out, the one lower third is retyped for three people, the quiz selects, locks and reveals, the
// score counts up and down and takes a new name, the countdown counts and holds, the ticker takes
// a new line, and the credits are one field that rolls. It fails on any console error, as the
// operator walk does.
//
// `NOACG_SHOTS=<dir>` writes one frame per beat for a person to look at.

const svg = (name: string) => fileURLToPath(new URL(`../docs/tutorials/svg-examples/SVG/${name}.svg`, import.meta.url));
const SHOW = 'The Weekly Show';

const SHOTS = process.env.NOACG_SHOTS ?? '';
/** One frame, after `afterMs` for an entrance to settle. Without NOACG_SHOTS it neither waits nor
 *  shoots, so an ordinary run spends nothing on pictures. */
async function shot(page: Page, name: string, afterMs = 0): Promise<void> {
  if (!SHOTS) return;
  if (afterMs) await page.waitForTimeout(afterMs);
  await page.screenshot({ path: `${SHOTS}/svg-examples-${name}.png` });
}

function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function selectCue(page: Page, label: string): Promise<void> {
  // By the row's NAME: a one-line row also shows its cue's first words, which can name another
  // graphic ("The Weekly Show" on a title).
  await page.getByTestId('select-cue').filter({ has: page.locator('strong', { hasText: label }) }).first().click();
}

/** The PROGRAM monitor holds one frame per layer, titled with its graphic's name. */
const air = (page: Page, title: string) => page.frameLocator(`[data-testid="program-stage"] iframe[title="${title}"]`);

/** Import one example and add it to the show; the first one makes the production. */
async function addGraphic(page: Page, file: string, name: string, first: boolean): Promise<void> {
  await page.goto('/app');
  await dropSvg(page, svg(file));
  // Every text named in the file arrives as a field, ticked, labelled with its layer name.
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await shot(page, `${file}-fields`);
  if (first) await intoProduction(page, name, SHOW);
  else await intoExistingProduction(page, name, SHOW);
  await settleDurableWrites(page);
}


test('the seven SVG examples import with their fields and moments and run from one production', async ({ page }) => {
  test.setTimeout(360_000);
  const errors = watchErrors(page);

  await addGraphic(page, 'title', 'Title', true);
  await addGraphic(page, 'lower-third', 'Lower third', false);

  // The quiz, the scoreboard and the countdown are recognised from the names alone, every
  // drawn moment bound to its picker.
  await page.goto('/app');
  await dropSvg(page, svg('quiz'));
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  await expect(page.getByTestId('map-svg-quiz-count')).toHaveValue('4');
  await expect(page.getByTestId('map-svg-quiz-locked').locator('option:checked')).toContainText('Locked in');
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
  await shot(page, 'quiz-fields');
  await intoExistingProduction(page, 'Quiz', SHOW);
  await settleDurableWrites(page);

  await page.goto('/app');
  await dropSvg(page, svg('scoreboard'));
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('score');
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
  await shot(page, 'scoreboard-fields');
  await intoExistingProduction(page, 'Scoreboard', SHOW);
  await settleDurableWrites(page);

  await page.goto('/app');
  await dropSvg(page, svg('countdown'));
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('timer');
  await expect(page.getByTestId('map-svg-timer-bar').locator('option:checked')).toHaveText('Timer bar');
  await expect(page.getByTestId('map-svg-timer-warning').locator('option:checked')).toHaveText('Warning (hidden)');
  await expect(page.getByTestId('map-svg-timer-paused').locator('option:checked')).toHaveText('Paused (hidden)');
  await expect(page.getByTestId('map-svg-timer-expired').locator('option:checked')).toHaveText('Time up (hidden)');
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
  await shot(page, 'countdown-fields');
  await intoExistingProduction(page, 'Countdown', SHOW);
  await settleDurableWrites(page);

  await addGraphic(page, 'ticker', 'Ticker', false);
  await addGraphic(page, 'end-credits', 'End credits', false);

  // ── One production, seven cues, seven layers. ──
  await expect(page.getByTestId('select-cue')).toHaveCount(7);
  const layers = await page.getByTestId('cue-layer').allTextContents();
  expect(new Set(layers).size, `seven graphics on ${layers.join(', ')}`).toBe(7);
  await shot(page, 'rundown');

  // ── Title: Take, then Out. ──
  await selectCue(page, 'Title');
  await page.getByTestId('verb-take').click();
  await expect(air(page, 'Title').locator('#f0')).toHaveText('THE WEEKLY SHOW');
  await shot(page, 'title-on-air', 1_500);
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // ── Lower third: one graphic, retyped for the host and both guests. ──
  await selectCue(page, 'Lower third');
  const people = [
    ['Maija Meikäläinen', 'HOST'],
    ['Ville Virtanen', 'GUEST'],
    ['Aino Aalto', 'GUEST'],
  ];
  for (const [i, [name, role]] of people.entries()) {
    await page.getByTestId('cue-field-f0').fill(name);
    await page.getByTestId('cue-field-f1').fill(role);
    await page.getByTestId(i === 0 ? 'verb-take' : 'verb-update').click();
    await expect(air(page, 'Lower third').locator('#f0')).toHaveText(name);
    await expect(air(page, 'Lower third').locator('#f1')).toHaveText(role);
    await shot(page, `lower-third-${i + 1}`, 1_000);
  }
  await page.getByTestId('verb-out').click();

  // ── Quiz: key B, take, the contestant picks B, lock, reveal. ──
  await selectCue(page, 'Quiz');
  await page.getByTestId('cue-field-f5-opt-B').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  const quiz = air(page, 'Quiz');
  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(quiz.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await shot(page, 'quiz-selected');
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(quiz.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/);
  await shot(page, 'quiz-locked');
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(quiz.locator('[data-noacg-role~="answer.correct/B"]')).toHaveClass(/imported-design-on/);
  for (const row of ['A', 'C', 'D']) {
    await expect(quiz.locator(`[data-noacg-role~="answer.wrong/${row}"]`)).toHaveClass(/imported-design-on/);
  }
  await shot(page, 'quiz-revealed');
  await page.getByTestId('verb-out').click();

  // ── Scoreboard: take at 0-0, +1 twice and -1 once for team 1, +1 for team 2, a new name. ──
  await selectCue(page, 'Scoreboard');
  await page.getByTestId('verb-take').click();
  const score = air(page, 'Scoreboard');
  const plus = (n: number) => page.getByTestId(`cue-action-score${n}`);
  const minus = (n: number) => page.getByTestId(`cue-action-unscore${n}`);
  await plus(1).click();
  await expect(score.locator('[data-noacg-role~="team.flash/1"]')).toHaveClass(/imported-design-on/);
  await plus(1).click();
  await minus(1).click();
  await plus(2).click();
  await expect(score.locator('#f1')).toHaveText('1');
  await expect(score.locator('#f3')).toHaveText('1');
  await shot(page, 'score-counted');
  await page.getByTestId('cue-field-f0').fill('HOSTS');
  await page.getByTestId('verb-update').click();
  await expect(score.locator('#f0')).toHaveText('HOSTS');
  await shot(page, 'score-renamed', 1_000);
  await page.getByTestId('verb-out').click();

  // ── Countdown: the length is the 05:00 drawn in the file; the take starts it, Pause holds it. ──
  await selectCue(page, 'Countdown');
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Start');
  await expect(actions).toContainText('Pause');
  await expect(actions).toContainText('Reset');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('5');
  await page.getByTestId('verb-take').click();
  const clock = air(page, 'Countdown');
  const readout = clock.locator('.imported-design-clock');
  await expect(readout).not.toHaveText('5:00', { timeout: 4_000 });
  await page.getByTestId('cue-action-pause').click();
  await expect(clock.locator('[data-noacg-role~="paused"]')).toHaveClass(/imported-design-on/);
  const heldAt = await readout.textContent();
  await page.waitForTimeout(1_500);
  await expect(readout).toHaveText(heldAt ?? '');
  await shot(page, 'countdown-held');
  await page.getByTestId('cue-action-reset').click();
  await expect(readout).toHaveText('5:00');
  await page.getByTestId('verb-out').click();

  // ── Ticker: the Kicker and the Story are the two fields; Update changes the line on air. ──
  await selectCue(page, 'Ticker');
  await page.getByTestId('verb-take').click();
  const ticker = air(page, 'Ticker');
  await expect(ticker.locator('#f0')).toHaveText('NEWS');
  await expect(ticker.locator('#f1')).toHaveText('Doors open at 18:00 in the main hall');
  await page.getByTestId('cue-field-f1').fill('The second half starts at 20:15');
  await page.getByTestId('verb-update').click();
  await expect(ticker.locator('#f1')).toHaveText('The second half starts at 20:15');
  await shot(page, 'ticker-updated', 1_000);
  await page.getByTestId('verb-out').click();

  // ── End credits: the Heading, ONE Credits field and the Scroll speed, never a field per name. ──
  await selectCue(page, 'End credits');
  const credits = page.getByTestId('cue-field-f1');
  // The default is the list drawn in the .ai, line for line, the director and the producer last,
  // and the gap before the closing line arrives as an empty line.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('CREDITS');
  await expect(credits).toHaveValue(/^Host:\nMaija Meikäläinen\nGuests:\nVille Virtanen\nAino Aalto\nCamera:\n/);
  await expect(credits).toHaveValue(/Director:\nAnna Anttila\nProducer:\nMika Mäkelä\n\nThe Weekly Show 2026$/);
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('100');
  await expect(page.getByTestId('cue-field-f3')).toHaveCount(0);
  await shot(page, 'credits-cue');

  await page.getByTestId('verb-take').click();
  const roll = air(page, 'End credits');
  const titles = roll.locator('.imported-design-credits-rows tspan[data-noacg-credits="title"]');
  const names = roll.locator('.imported-design-credits-rows tspan[data-noacg-credits="name"]');
  // Fourteen titles, each in the sample's title look; seventeen names and the closing line.
  await expect(titles).toHaveCount(14);
  await expect(titles.first()).toHaveText('Host:');
  await expect(titles.last()).toHaveText('Producer:');
  await expect(names).toHaveCount(18);
  await expect(names.first()).toHaveText('Maija Meikäläinen');
  await expect(names.last()).toHaveText('The Weekly Show 2026');
  const titleClass = await titles.first().getAttribute('class');
  expect(titleClass, 'a title row wears the sample title line look').toBeTruthy();
  expect(await names.first().getAttribute('class')).not.toBe(titleClass);

  // The roll: inside the Credits box, bottom to top, in about thirty seconds at Scroll speed 100.
  const last = await roll
    .locator('.imported-design-credits-rows')
    .evaluate(() => (window as unknown as { noacgCreditsLast: { duration: number; boxed: boolean; rows: number } }).noacgCreditsLast);
  console.log(`svg examples credits roll: ${last.rows} rows, ${last.duration.toFixed(1)} s`);
  expect(last.boxed).toBe(true);
  expect(last.rows).toBe(32);
  expect(last.duration).toBeGreaterThan(26);
  expect(last.duration).toBeLessThan(34);
  const progress = () =>
    roll
      .locator('.imported-design-credits-rows')
      .evaluate(() => (window as unknown as { noacgCreditsTween: { progress(): number } }).noacgCreditsTween.progress());
  await shot(page, 'credits-rolling-early', 4_000);
  await shot(page, 'credits-rolling-mid', 10_000);
  // Rolled to the end: the tween finishes and the box is empty again.
  await expect.poll(progress, { timeout: 40_000 }).toBe(1);
  await shot(page, 'credits-rolled-out');
  await page.getByTestId('verb-out').click();

  expect(errors).toEqual([]);
});
