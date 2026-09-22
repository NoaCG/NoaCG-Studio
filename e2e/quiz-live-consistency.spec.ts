import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createProject } from './_create';
import { dropSvg, intoProduction } from './_svg-import';

// THE QUIZ ON AIR, THE SAME WAY ON EVERY BOARD (owner production test, 2026-09-22).
//
// Three findings from one evening with the Arcade quiz and the docs example quiz:
//
// 1. A correct answer changed while the graphic was live did not always reach air. Measured on
//    all fifteen catalog quizzes and the imported docs quiz: a key corrected in the cue editor and
//    then revealed lit the OLD key, because Reveal carried nothing and only Update sent the cue's
//    values. Reveal now carries the answer key the way Select carries the pick, declared once per
//    control list (types/answerBoard.ts, types/quizShow.ts), so every board gets it.
// 2. Selecting, locking and revealing felt slower than a normal graphic. Offline the press reaches
//    the monitor in 20-70 ms, like an Update, so the lag was the PUBLISHED road: every machine
//    event took the durable round trip, 350 ms to a second, while a Take rode the fast road at
//    about 90 ms. Only a clock needs the row's server time, so a clock-free graphic's events now
//    ride fast (hostedControl.ts, SLOW_AFTER_EVENT_MS). The rule is pinned below; the road itself
//    can only run against a backend (e2e/configured/playout-both-roads.spec.ts).
// 3. The boards use two answer models, and this spec says which is which, so a board that drifts
//    from its family fails here rather than in front of an audience.

const DOCS_QUIZ = fileURLToPath(new URL('../public/docs/examples/quiz.svg', import.meta.url));
const CATALOG = ['qz01', 'qz02', 'qz03', 'qz04', 'qz05', 'qz06', 'qz07', 'qz08', 'qz09', 'qz10', 'qz11', 'qz12', 'qz13', 'qz14', 'qz15'];

/** Create the current editor graphic's production and land on its page. */
async function productionFor(page: Page, name: string): Promise<void> {
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill(name);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await expect(section.locator('.status-ok')).toContainText('is in the production');
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

/** The ⚡ buttons the production page renders for the selected cue, by event id. */
async function actionEvents(page: Page): Promise<string[]> {
  return page
    .locator('[data-testid^="cue-action-"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!.replace('cue-action-', '')));
}

/** A catalog quiz's name, its two letter fields, and the key it ships with. */
async function quizMeta(page: Page, id: string) {
  return page.evaluate(async (vid) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const variant = variantById(vid)!;
    const fields = variant.create({}).fields;
    const byTitle = (title: string) => fields.find((f) => f.title === title)!;
    return {
      name: variant.name,
      correct: byTitle('Correct answer').field,
      selected: byTitle('Selected answer').field,
      key: byTitle('Correct answer').value,
    };
  }, id);
}

/** Row index of a letter: A is row 0. */
const row = (letter: string) => letter.charCodeAt(0) - 65;

// The two answer models. The SHOW boards (qz13-qz15, types/quizShow.ts) pick in one press per
// letter and have no lock; every other board, and the imported quiz, picks with a letter in the
// cue plus Select answer, and locks. Arcade is a show board, so it matches Sticker and Showtime.
const SHOW_CONTROLS = ['pickA', 'pickB', 'pickC', 'pickD', 'clearPick', 'judge'];
const BOARD_CONTROLS = ['select', 'lock', 'revealChoice', 'judge', 'audience'];
const IMPORTED_CONTROLS = ['select', 'lock', 'revealChoice', 'judge'];

for (const id of CATALOG) {
  test(`${id}: a correct answer changed on air reaches PROGRAM with Reveal, and again with Update`, async ({ page }) => {
    await page.goto('/');
    const meta = await quizMeta(page, id);
    await createProject(page, { name: meta.name });
    await productionFor(page, `Live key ${id}`);
    const program = page.frameLocator('[data-testid="program-stage"] iframe');
    const show = ['qz13', 'qz14', 'qz15'].includes(id);
    expect(await actionEvents(page)).toEqual(show ? SHOW_CONTROLS : BOARD_CONTROLS);

    await page.getByTestId('verb-take').click();
    await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
    // The contestant picks B, on the board's own model.
    if (show) {
      await page.getByTestId('cue-action-pickB').click();
    } else {
      await page.getByTestId(`cue-field-${meta.selected}-opt-B`).click();
      await page.getByTestId('cue-action-select').click();
      await page.getByTestId('cue-action-lock').click();
    }
    await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

    // The key is corrected in the cue, and NOT sent with Update: the Reveal is what carries it.
    const other = meta.key === 'A' ? 'B' : 'A';
    await page.getByTestId(`cue-field-${meta.correct}-opt-${other}`).click();
    await expect(page.getByTestId('cue-action-judge')).toHaveAttribute('title', /Correct answer/);
    await page.getByTestId('cue-action-judge').click();
    await expect(page.getByTestId('machine-state-chip')).toHaveText(/Reveal/);
    await expect(program.locator('.quiz-option').nth(row(other))).toHaveClass(/quiz-correct/);
    await expect(program.locator('.quiz-option.quiz-correct')).toHaveCount(1);

    // And AFTER the reveal a correction still lands, through Update, on the same verdict.
    await page.getByTestId(`cue-field-${meta.correct}-opt-${meta.key}`).click();
    await page.getByTestId('verb-update').click();
    await expect(program.locator('.quiz-option').nth(row(meta.key))).toHaveClass(/quiz-correct/);
    await expect(program.locator('.quiz-option.quiz-correct')).toHaveCount(1);
  });
}

test('the docs example quiz: a correct answer changed on air reaches PROGRAM with Reveal, and again with Update', async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto('/app');
  await dropSvg(page, DOCS_QUIZ);
  await intoProduction(page, 'Docs quiz', 'Docs quiz night');
  expect(await actionEvents(page)).toEqual(IMPORTED_CONTROLS);
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  const look = (name: string) => program.locator(`[data-noacg-role~="${name}"]`);
  // The mapped quiz's two letter pickers, in the order the recipe declares them: the key, the pick.
  const [correct, selected] = await page
    .locator('[data-testid^="cue-field-"][role="radiogroup"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')!));
  const key = (await page.locator(`[data-testid="${correct}"] [aria-pressed="true"]`).textContent())!.trim();
  const other = key === 'A' ? 'B' : 'A';

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  await page.getByTestId(`${selected}-opt-C`).click();
  await page.getByTestId('cue-action-select').click();
  await page.getByTestId('cue-action-lock').click();
  await page.getByTestId(`${correct}-opt-${other}`).click();
  await page.getByTestId('cue-action-judge').click();
  await expect(look(`answer.correct/${other}`)).toHaveClass(/imported-design-on/);
  await expect(look(`answer.correct/${key}`)).not.toHaveClass(/imported-design-on/);

  await page.getByTestId(`${correct}-opt-${key}`).click();
  await page.getByTestId('verb-update').click();
  await expect(look(`answer.correct/${key}`)).toHaveClass(/imported-design-on/);
  await expect(look(`answer.correct/${other}`)).not.toHaveClass(/imported-design-on/);
});

test('a clock-free graphic sends its events on the fast road, and a clock keeps the slow one', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { clockSpecFromHtml, eventsNeedServerTime, speakingClocksFromHtml } = await import('/src/control/matchClockWire.ts');
    const { sendControlVerb } = await import('/src/control/hostedControl.ts');

    // The loose test must cover every graphic the renderer treats as a clock, and no quiz.
    const missed: string[] = [];
    const quizzes: string[] = [];
    let clocks = 0;
    for (const variant of Object.values(CATALOG).flat()) {
      const template = variant.create({});
      const clock = !!clockSpecFromHtml(template.html) || !!speakingClocksFromHtml(template.html);
      if (clock) clocks += 1;
      if (clock && !eventsNeedServerTime(template)) missed.push(variant.id);
      if (variant.category === 'quiz' && eventsNeedServerTime(template)) quizzes.push(variant.id);
    }

    // The sender's rule, read off what it applies to its OWN monitor before the round trip. With
    // no backend the send itself does nothing, so this is the rule alone.
    const here = async (fastEvents: ((graphic: string) => boolean) | undefined, showId: string) => {
      const applied: string[] = [];
      const items = [
        { graphic: 'Quiz', msg: { t: 'event' as const, event: 'judge', payload: { f5: 'C' } } },
        { graphic: 'Quiz', msg: { t: 'update' as const, data: { f0: 'Next question' } } },
      ];
      await sendControlVerb({ slug: 'offline', showId, items, fastEvents, applyHere: (fast) => applied.push(...fast.map((i) => i.msg.t)) });
      return applied;
    };
    return {
      missed,
      quizzes,
      clocks,
      clockFree: await here(() => true, 'show-a'),
      clock: await here(() => false, 'show-b'),
      unsaid: await here(undefined, 'show-c'),
    };
  });
  expect(result.clocks).toBeGreaterThan(3); // the sweep is reaching the clock designs
  expect(result.missed).toEqual([]);
  expect(result.quizzes).toEqual([]);
  // A clock-free event rides with the update behind it, in order.
  expect(result.clockFree).toEqual(['event', 'update']);
  // A clock's event goes slow, and holds its graphic's next command back with it.
  expect(result.clock).toEqual([]);
  // A sender that does not say keeps every event slow, which is what every event did before.
  expect(result.unsaid).toEqual([]);
});
