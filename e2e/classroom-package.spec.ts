import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoExistingProduction, intoProduction } from './_svg-import';
import { settleDurableWrites } from './_durable';

// THE CLASSROOM PACKAGE, RUN AS A SHOW (docs/tutorials/classroom-package).
//
// A teacher hands students five files and says "import these, put them in one production, run
// the show". This walks exactly that with the SVGs Illustrator wrote (never copies): every file
// imports, the quiz and the score tracker are recognised from their layer names alone, all five
// land in ONE production on five layers, and each one does on the dashboard what the README
// promises - the intro takes and goes out, the one name tag is retyped for three people, the quiz
// selects, locks and reveals, the score counts up and down and takes a new name, and the credits
// are one field. It fails on any console error, as the operator walk does.
//
// `NOACG_SHOTS=<dir>` writes one frame per beat for a person to look at.

const svg = (name: string) => fileURLToPath(new URL(`../docs/tutorials/classroom-package/SVG/${name}.svg`, import.meta.url));

const SHOTS = process.env.NOACG_SHOTS ?? '';
/** One frame, after `afterMs` for an entrance to settle. Without NOACG_SHOTS it neither waits nor
 *  shoots, so an ordinary run spends nothing on pictures. */
async function shot(page: Page, name: string, afterMs = 0): Promise<void> {
  if (!SHOTS) return;
  if (afterMs) await page.waitForTimeout(afterMs);
  await page.screenshot({ path: `${SHOTS}/classroom-${name}.png` });
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
  await page.getByTestId('select-cue').filter({ hasText: label }).first().click();
}

/** The PROGRAM monitor holds one frame per layer, titled with its graphic's name. */
const air = (page: Page, title: string) => page.frameLocator(`[data-testid="program-stage"] iframe[title="${title}"]`);

/** Import one package file and add it to the show; the first one makes the production. */
async function addGraphic(page: Page, file: string, name: string, first: boolean): Promise<void> {
  await page.goto('/app');
  await dropSvg(page, svg(file));
  // Every text the student named arrives as a field, ticked, labelled with its layer name.
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await shot(page, `${file}-fields`);
  if (first) await intoProduction(page, name, 'Quiz Night');
  else await intoExistingProduction(page, name, 'Quiz Night');
  await settleDurableWrites(page);
}

test('the five classroom graphics import and run from one production', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = watchErrors(page);

  await addGraphic(page, 'show-intro', 'Show intro', true);
  await addGraphic(page, 'name-tag', 'Name tag', false);

  // The quiz and the score tracker are recognised from the names alone.
  await page.goto('/app');
  await dropSvg(page, svg('quiz'));
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  await expect(page.getByTestId('map-svg-quiz-count')).toHaveValue('4');
  await expect(page.getByTestId('map-svg-quiz-locked').locator('option:checked')).toContainText('Locked in');
  await shot(page, 'quiz-fields');
  await intoExistingProduction(page, 'Quiz', 'Quiz Night');
  await settleDurableWrites(page);

  await page.goto('/app');
  await dropSvg(page, svg('score-tracker'));
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('score');
  await shot(page, 'score-tracker-fields');
  await intoExistingProduction(page, 'Score tracker', 'Quiz Night');
  await settleDurableWrites(page);

  await addGraphic(page, 'end-credits', 'End credits', false);

  // ── One production, five cues, five layers. ──
  await expect(page.getByTestId('select-cue')).toHaveCount(5);
  const layers = await page.getByTestId('cue-layer').allTextContents();
  expect(new Set(layers).size, `five graphics on ${layers.join(', ')}`).toBe(5);
  await shot(page, 'rundown');

  // ── Show intro: Take, then Out. ──
  await selectCue(page, 'Show intro');
  await page.getByTestId('verb-take').click();
  await expect(air(page, 'Show intro').locator('#f0')).toHaveText('QUIZ NIGHT');
  await shot(page, 'intro-on-air', 1_500);
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // ── Name tag: one graphic, retyped for the host and both guests. ──
  await selectCue(page, 'Name tag');
  const people = [
    ['Maija Meikäläinen', 'HOST'],
    ['Ville Virtanen', 'GUEST'],
    ['Aino Aalto', 'GUEST'],
  ];
  for (const [i, [name, role]] of people.entries()) {
    await page.getByTestId('cue-field-f0').fill(name);
    await page.getByTestId('cue-field-f1').fill(role);
    await page.getByTestId(i === 0 ? 'verb-take' : 'verb-update').click();
    await expect(air(page, 'Name tag').locator('#f0')).toHaveText(name);
    await expect(air(page, 'Name tag').locator('#f1')).toHaveText(role);
    await shot(page, `name-tag-${i + 1}`, 1_000);
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

  // ── Score tracker: take at 0-0, +1 twice and -1 once for player 1, +1 for player 2, a new name. ──
  await selectCue(page, 'Score tracker');
  await page.getByTestId('verb-take').click();
  const score = air(page, 'Score tracker');
  const plus = (n: number) => page.getByTestId(`cue-action-score${n}`);
  const minus = (n: number) => page.getByTestId(`cue-action-unscore${n}`);
  await plus(1).click();
  await plus(1).click();
  await minus(1).click();
  await plus(2).click();
  await expect(score.locator('#f1')).toHaveText('1');
  await expect(score.locator('#f3')).toHaveText('1');
  await shot(page, 'score-counted');
  await page.getByTestId('cue-field-f0').fill('AINO');
  await page.getByTestId('verb-update').click();
  await expect(score.locator('#f0')).toHaveText('AINO');
  await shot(page, 'score-renamed', 1_000);
  await page.getByTestId('verb-out').click();

  // ── End credits: the Heading, ONE Credits field and the Scroll speed, never a field per name. ──
  await selectCue(page, 'End credits');
  const credits = page.getByTestId('cue-field-f1');
  // The Finnish default is the list drawn in the .ai, line for line, the chiefs last.
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('TEKIJÄT');
  await expect(credits).toHaveValue(/^Juontaja:\nMaija Meikäläinen\nVieraat:\nVille Virtanen\nAino Aalto\nKuvaajat:\n/);
  await expect(credits).toHaveValue(/Ohjaaja:\nAnna Anttila\nTuottaja:\nMika Mäkelä\n\nQuiz Night 2026$/);
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('100');
  await expect(page.getByTestId('cue-field-f3')).toHaveCount(0);
  await shot(page, 'credits-cue');

  // The README's English list, pasted as a student would paste it.
  const readme = readFileSync(fileURLToPath(new URL('../docs/tutorials/classroom-package/README.md', import.meta.url)), 'utf8');
  const english = /```\r?\n([\s\S]*?)\r?\n```/.exec(readme)![1].replace(/\r\n/g, '\n');
  await credits.fill(english);
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
  await expect(names.last()).toHaveText('Quiz Night 2026');
  const titleClass = await titles.first().getAttribute('class');
  expect(titleClass, 'a title row wears the sample title line look').toBeTruthy();
  expect(await names.first().getAttribute('class')).not.toBe(titleClass);

  // The roll: inside the Credits box, bottom to top, in about thirty seconds at Scroll speed 100.
  const last = await roll
    .locator('.imported-design-credits-rows')
    .evaluate(() => (window as unknown as { noacgCreditsLast: { duration: number; boxed: boolean; rows: number } }).noacgCreditsLast);
  console.log(`classroom credits roll: ${last.rows} rows, ${last.duration.toFixed(1)} s`);
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
