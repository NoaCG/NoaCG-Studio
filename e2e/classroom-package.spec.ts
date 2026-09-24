import { test, expect, type Page } from '@playwright/test';
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
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/classroom-${name}.png` });
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
  await page.waitForTimeout(1_500);
  await shot(page, 'intro-on-air');
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
    await page.waitForTimeout(1_000);
    await shot(page, `name-tag-${i + 1}`);
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
  await page.waitForTimeout(1_000);
  await shot(page, 'score-renamed');
  await page.getByTestId('verb-out').click();

  // ── End credits: the Heading and ONE Credits field, never a field per name. ──
  await selectCue(page, 'End credits');
  await expect(page.locator('[data-testid^="cue-field-"]')).toHaveCount(2);
  await shot(page, 'credits-cue');

  expect(errors).toEqual([]);
});
