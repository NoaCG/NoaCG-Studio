// The credits roll on imported artwork (docs/END_CREDITS.md): its recipe, the roll engine, the
// parser it shares with the catalog rolls, the fields list that turns the sample into one box,
// and its fixture. The examples walk rides along: its credits are the list the default pace was
// set by (about thirty seconds), rolled from Illustrator's own output.
// covers: src/templates/{behaviours/credits.ts,importedDesign/{creditsRoll,artworkFields,svg}.ts,endCredits/shared.ts}
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
// covers: public/docs/examples/svg-examples/**
// covers: src/components/home/CueActions.tsx

import { test, expect, type FrameLocator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
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
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  const quiz = air(page, 'Quiz');
  await page.getByTestId('cue-pick-select-B').click();
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

  // The new credits sample scrolls its Illustrator artwork, with only speed exposed on air.
  await selectCue(page, 'End credits');
  await expect(page.getByTestId('cue-field-f0')).toHaveCount(0);
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('100');
  await expect(page.getByTestId('cue-field-f2')).toHaveCount(0);
  await shot(page, 'credits-cue');

  await page.getByTestId('verb-take').click();
  const roll = air(page, 'End credits');
  const artwork = roll.locator('.imported-design-credits');
  await expect(artwork).toContainText('THE WEEKLY SHOW');
  await expect(artwork).toContainText('Maija Meikäläinen');
  await expect(artwork).toContainText('The Weekly Show 2026');
  await expect(roll.locator('.imported-design-credits-rows')).toHaveCount(0);
  expect(await artwork.evaluate((el) => (el as unknown as SVGGraphicsElement).getBBox().height)).toBeGreaterThan(1080);
  await expect.poll(() => artwork.evaluate(() => !!(window as unknown as { noacgCreditsLast: unknown }).noacgCreditsLast)).toBe(true);
  const last = await artwork.evaluate(() => (window as unknown as { noacgCreditsLast: { artwork: boolean; startY: number; endY: number; duration: number; boxed: boolean } }).noacgCreditsLast);
  expect(last.artwork).toBe(true);
  expect(last.boxed).toBe(false);
  expect(last.startY).toBeGreaterThan(last.endY);
  expect(last.duration).toBeGreaterThan(10);
  expect(last.duration).toBeLessThan(60);
  const progress = () =>
    artwork.evaluate(() => (window as unknown as { noacgCreditsTween: { progress(): number } }).noacgCreditsTween.progress());
  await shot(page, 'credits-rolling-early', 4_000);
  await shot(page, 'credits-rolling-mid', 10_000);
  // The entire original text has left the top, including the paragraphs below the artboard.
  await expect.poll(progress, { timeout: 65_000 }).toBe(1);
  expect(await artwork.evaluate((el) => {
    const frame = el.closest('svg')!.getBoundingClientRect();
    return el.getBoundingClientRect().bottom - frame.top;
  })).toBeLessThanOrEqual(1);
  await shot(page, 'credits-rolled-out');
  await page.getByTestId('verb-out').click();

  expect(errors).toEqual([]);
});

// Every advertised behavior also runs through its own imported Illustrator export.
interface Example { slug: string; name: string; recipe: string | null }
const examples = JSON.parse(readFileSync(new URL('../docs/tutorials/svg-examples/examples.json', import.meta.url), 'utf8')) as Example[];
const selection: Record<string, string> = { vote: 'poll', countdown: 'timer' };
const role = (air: FrameLocator, name: string) => air.locator(`[data-noacg-role~="${name}"]`);
async function fieldLayer(air: FrameLocator, name: string, row: string) {
  const id = await air.locator('svg').first().evaluate((_, pick) =>
    (window as unknown as { noacgFieldFor(role: string, key: string): string | null }).noacgFieldFor(pick.name, pick.row), { name, row });
  expect(id, `${name}/${row} binds an artwork field`).toMatch(/^f\d+$/);
  return air.locator(`[id="${id}"]`);
}

async function fill(page: Page, air: FrameLocator, title: string, value: string) {
  const field = await air.locator('svg').first().evaluate((_, name) => {
    const definition = (window as unknown as { SPXGCTemplateDefinition: { DataFields: { field: string; title: string }[] } }).SPXGCTemplateDefinition;
    return definition.DataFields.find((entry) => entry.title === name)?.field;
  }, title);
  expect(field, `the operator has a ${title} field`).toBeTruthy();
  await page.getByTestId(`cue-field-${field}`).fill(value);
}

test('the advertised behavior inventory equals the live import registry', async ({ page, request }) => {
  await page.goto('/app');
  const registered = await page.evaluate(async () => (await import('/src/templates/behaviours/registry.ts')).BEHAVIOUR_RECIPES.map((entry) => entry.id));
  expect(examples.flatMap((entry) => entry.recipe ? [entry.recipe] : []).sort()).toEqual(registered.sort());
  for (const entry of examples) {
    const response = await request.get(`/docs/examples/svg-examples/${entry.slug}.svg`);
    expect(response.status(), entry.slug).toBe(200);
    expect((await response.text()).replace(/\r\n/g, '\n')).toBe(readFileSync(new URL(`../docs/tutorials/svg-examples/SVG/${entry.slug}.svg`, import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
  }
});

for (const example of examples.filter((entry) => entry.recipe)) {
  test(`${example.name}: its Illustrator export imports and its controls change the output`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/app');
    await dropSvg(page, fileURLToPath(new URL(`../docs/tutorials/svg-examples/SVG/${example.slug}.svg`, import.meta.url)));
    if (example.recipe === 'alert') await page.getByTestId('map-svg-behaviour-kind').selectOption('alert');
    if (example.recipe === 'switch' || example.recipe === 'choice') {
      const extras = page.getByTestId('map-svg-extras');
      await expect(extras).toBeVisible();
      await expect(extras.locator(example.recipe === 'switch' ? 'input[value="Sponsor"]' : 'input[value="Status"]')).toHaveCount(example.recipe === 'switch' ? 1 : 3);
    } else {
      await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue(selection[example.recipe!] ?? example.recipe!);
      await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);
    }
    if (example.recipe === 'credits') {
      await expect(page.locator('.wz-stage').first()).not.toHaveAttribute('data-doc-pending', '1');
      await expect(page.locator('.wz-stage').first()).toHaveAttribute('data-doc-rev', /\d/);
      await testInfo.attach('Credits import fields', { body: await page.screenshot(), contentType: 'image/png' });
    }
    await intoProduction(page, example.name, `${example.name} qualification`);
    await settleDurableWrites(page);
    await page.getByTestId('verb-take').click();
    const air = page.frameLocator('[data-testid="program-stage"] iframe');
    await expect(air.locator('svg').first()).toBeVisible();

    switch (example.recipe) {
      case 'quiz':
        await page.getByTestId('cue-pick-select-B').click();
        await expect(role(air, 'answer.selected/B')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-lock').click();
        await expect(role(air, 'locked')).toHaveClass(/imported-design-on/);
        break;
      case 'score':
        await page.getByTestId('cue-action-score1').click();
        await expect(await fieldLayer(air, 'score', '1')).toHaveText('1');
        break;
      case 'countdown':
        await page.getByTestId('cue-action-pause').click();
        await expect(role(air, 'paused')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-start').click();
        await expect(role(air, 'paused')).not.toHaveClass(/imported-design-on/);
        break;
      case 'ranking': {
        const competitor = await fieldLayer(air, 'competitor', '3');
        const leader = await fieldLayer(air, 'competitor', '1');
        const before = await competitor.evaluate((el) => el.getBoundingClientRect().top);
        const firstPlace = await leader.evaluate((el) => el.getBoundingClientRect().top);
        expect(before).toBeGreaterThan(firstPlace + 1);
        await fill(page, air, 'Points 3', '99');
        await page.getByTestId('verb-update').click();
        await expect.poll(() => competitor.evaluate((el) => el.getBoundingClientRect().top)).toBeCloseTo(firstPlace, 0);
        break;
      }
      case 'vote':
        await fill(page, air, 'Options', 'Coast | 3\nForest | 1\nCity | 0');
        await page.getByTestId('verb-update').click();
        await page.getByTestId('cue-action-result').click();
        await expect(role(air, 'percent/1')).toHaveText('75%');
        break;
      case 'meter':
        await fill(page, air, 'Current', '25');
        await fill(page, air, 'Target', '100');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'percent')).toHaveText('25%');
        break;
      case 'alert':
        await expect(air.locator('.imported-design')).not.toHaveCSS('opacity', '0');
        await expect(air.locator('.imported-design')).toHaveCSS('opacity', '0', { timeout: 20_000 });
        break;
      case 'survey':
        await fill(page, air, 'Answers', 'Clothes | 40\nToothbrush | 30\nCamera | 20');
        await page.getByTestId('verb-update').click();
        await page.getByTestId('cue-action-reveal1').click();
        await expect(role(air, 'answer/1')).toHaveText('Clothes');
        await expect(role(air, 'answer/1')).toHaveClass(/imported-design-on/);
        await expect(role(air, 'total')).toHaveText('40');
        break;
      case 'list':
        await fill(page, air, 'Entries', 'Coast\nForest\nCity');
        await page.getByTestId('verb-update').click();
        await page.getByTestId('verb-next').click();
        await expect(role(air, 'item/3')).toHaveText('City');
        await expect(role(air, 'item/3')).toHaveClass(/imported-design-on/);
        break;
      case 'lineup':
        await page.getByTestId('cue-action-nextGuest').click();
        await expect(role(air, 'guest.now/1')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-nextGuest').click();
        await expect(role(air, 'guest.done/1')).toHaveClass(/imported-design-on/);
        await expect(role(air, 'guest.now/2')).toHaveClass(/imported-design-on/);
        break;
      case 'puzzle':
        await fill(page, air, 'Puzzle', 'BROADCAST');
        await fill(page, air, 'Guess', 'B');
        await page.getByTestId('verb-update').click();
        await page.getByTestId('cue-action-revealLetter').click();
        await expect(role(air, 'tile/1')).toHaveText('B');
        await expect(role(air, 'tile/1')).toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-solve').click();
        await expect(role(air, 'tile/2')).toHaveClass(/imported-design-on/);
        break;
      case 'reveal':
        await fill(page, air, 'The reveal', '2400');
        await page.getByTestId('verb-update').click();
        await expect(role(air, 'secret')).not.toHaveClass(/imported-design-on/);
        await page.getByTestId('cue-action-reveal').click();
        await expect(role(air, 'secret')).toHaveText('2400');
        await expect(role(air, 'secret')).toHaveClass(/imported-design-on/);
        break;
      case 'bingo':
        await fill(page, air, 'Number to call', '7');
        await page.getByTestId('verb-update').click();
        await page.getByTestId('cue-action-call').click();
        await expect(role(air, 'called/7')).toHaveClass(/imported-design-on/);
        await expect(role(air, 'latest')).toHaveText('7');
        break;
      case 'credits':
        await expect(air.locator('.imported-design-credits')).toContainText('The Weekly Show 2026');
        await expect.poll(() => air.locator('.imported-design-credits').evaluate(() => (window as unknown as { noacgCreditsTween?: { progress(): number } }).noacgCreditsTween?.progress() ?? 0)).toBeGreaterThan(0);
        break;
      case 'switch':
        await page.getByRole('button', { name: /Show Sponsor/ }).click();
        await expect(air.locator('[data-noacg-role*="switch.sponsor"]')).toHaveClass(/imported-design-on/);
        await page.getByRole('button', { name: /Hide Sponsor/ }).click();
        await expect(air.locator('[data-noacg-role*="switch.sponsor"]')).not.toHaveClass(/imported-design-on/);
        break;
      case 'choice':
        await page.getByRole('button', { name: /Replay/ }).click();
        await expect(role(air, 'choice.status.option/REPLAY')).toHaveClass(/imported-design-on/);
        break;
    }
    if (example.recipe !== 'alert') await page.getByTestId('verb-out').click();
    expect(errors).toEqual([]);
  });
}
