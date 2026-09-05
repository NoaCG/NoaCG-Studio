import { test, expect, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { settleDurableWrites } from './_durable';
import { addToProductionFromFinish, startNewProject } from './_create';
import { untickTextRow } from './_svg-import';

// THE STUDENT REHEARSAL, WALKED BY MACHINE (docs/GOALS.md NOW, step 3).
//
// `import-svg-behaviour.spec.ts` walks the two September cases on the SHIPPED SAMPLES — files
// drawn for the feature, with the layer names docs/SVG_AUTHORING.md §5b suggests. This spec
// walks the same road on artwork a STUDENT drew: an Illustrator export with the dialog left on
// its defaults, layers named the way the drawing reads to them, and none of NoaCG's conventions
// honoured. The two fixtures live in the corpus
// (e2e/fixtures/svg-corpus/student-illustrator-*.svg), each with the sidecar stating what its
// designer expects.
//
// Three things this spec holds that the sample walk structurally cannot:
//
//  1. **A LAYER SWITCHED OFF IN ILLUSTRATOR IS NOT AN OPERATOR FIELD.** With the export dialog
//     on its default styling, a hidden layer arrives as `class="st10"` beside a
//     `.st10{display:none;}` rule — never as an attribute — so both fixtures carry the shape the
//     samples do not. Before 2026-08-28 the goal flash's MAALI! and the quiz's LUKITTU badge
//     were both offered as editable text, ticked on, and the quiz's took `f0`.
//  2. **THE STEP SAYS WHAT THE ARTWORK ALREADY EARNED.** A scoreboard needs no behaviour at all
//     — its number layers become ± steppers with no per-template code — and the step used to
//     answer that with "Nothing. It comes on and off.", which reads as "there is no scoreboard
//     here". That is the owner's finding from his own attempt, and it was the WORDS, not the
//     offer.
//  3. **THE PICKERS WORK WITH NO PROPOSAL.** `proposeQuizBinding` matches `Answer A` and
//     `A selected`; "Option 1" and "Pick 1" match neither, so this file arrives with the
//     accelerator silent and the whole binding is made by hand — the road §5b promises in bold
//     and nothing until now measured.
//
// **ONE TEST MAKES BOTH GRAPHICS**, and that is not tidiness: a Playwright context has its own
// storage, so a second test cannot see the first one's production. The September show is one
// production holding both graphics, so the walk has to be one context too.

const SCOREBOARD = fileURLToPath(
  new URL('./fixtures/svg-corpus/student-illustrator-scoreboard.svg', import.meta.url),
);
const QUIZ = fileURLToPath(new URL('./fixtures/svg-corpus/student-illustrator-quiz.svg', import.meta.url));

/** The wizard's own Next — scoped to the modal, for the reason `_svg-import.ts` states. */
function wizardNext(page: Page) {
  return page.locator('.wz-modal').getByRole('button', { name: 'Next' });
}

/**
 * Drop a corpus fixture on the Import door and land on the mapping step, returning what the
 * DOOR said about the file — the card is gone by the time the mapping step is up.
 */
async function dropStudentSvg(page: Page, fixture: string): Promise<string> {
  const modal = page.locator('.wz-modal');
  const autoOpened = await modal
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!autoOpened) await startNewProject(page);
  await expect(modal).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fixture);
  const card = page.getByTestId('import-svg-card');
  await expect(card).toBeVisible();
  const said = (await card.innerText()).replace(/\s+/g, ' ');
  await wizardNext(page).click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  return said;
}

/**
 * From the mapping step to a production page.
 *
 * `production` is a NAME for a new one, or `{ existing: name }` to join one already made — which
 * is how the second graphic reaches the first one's show.
 */
async function intoShow(
  page: Page,
  graphic: string,
  production: string | { existing: string },
): Promise<void> {
  await wizardNext(page).click(); // Animation
  await expect(page.getByTestId('wz-stepcount')).toContainText('4');
  await wizardNext(page).click(); // Finish
  await expect(page.getByTestId('wz-stepcount')).toContainText('5');
  await page.getByTestId('wz-finish-name').fill(graphic);
  const pick = page.getByTestId('wz-finish-production-pick').locator('select');
  if (typeof production === 'string') {
    await pick.selectOption('new');
    await page.getByTestId('wz-finish-production-name').fill(production);
  } else {
    // The existing show. The picker labels it with its graphic count ("Friday Show (1 graphic)"),
    // so the option is found by its VALUE — the show's id — read off the rendered label.
    const value = await pick
      .locator('option')
      .filter({ hasText: new RegExp(`^${production.existing} \\(`) })
      .first()
      .getAttribute('value');
    expect(value).toBeTruthy();
    await pick.selectOption(value!);
  }
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
}

/** Select a cue by the name it was created under, so a two-graphic rundown is unambiguous. */
async function selectCue(page: Page, graphic: string): Promise<void> {
  await page.getByTestId('cue-list').getByText(graphic, { exact: false }).first().click();
  await expect(page.getByTestId('cue-label')).toHaveValue(graphic);
}

test('the rehearsal: a student draws a scoreboard and a quiz, both run from one production, and it survives a reload', async ({
  page,
}) => {
  test.slow(); // two full wizard walks, two builds and a reload in one context

  // ── THE SCOREBOARD ────────────────────────────────────────────────────────────────────────
  await page.goto('/app');
  const door = await dropStudentSvg(page, SCOREBOARD);

  // THE HIDDEN LAYER. Six text nodes are drawn; the sixth is the MAALI! inside the switched-off
  // goal flash, and an operator field for text nobody can see is exactly what
  // docs/SVG_AUTHORING.md §3 promises never to hand over.
  expect(door).toContain('5 text layers found');
  await expect(page.getByTestId('map-svg-fields')).toContainText('5 of 5');
  const titles = page.getByTestId('map-svg-fields').locator('input[data-testid^="map-svg-title-"]');
  await expect(titles).toHaveCount(5);
  // The two club-name texts carry no id at all, so their label is the group around them — which
  // is what makes an unnamed layer still readable on a control page.
  await expect(titles.nth(0)).toHaveValue('Home');
  await expect(titles.nth(4)).toHaveValue('Period');
  for (const i of [0, 1, 2, 3, 4]) await expect(titles.nth(i)).not.toHaveValue('Goal');

  // WHAT IT DOES, answered honestly. The offer is unchanged — a scoreboard genuinely needs no
  // machine — but the step now names what the artwork already gives the operator.
  const behaviour = page.getByTestId('map-svg-behaviour');
  await expect(behaviour).toContainText('2 numbers, each with + and −');
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('none');
  await expect(behaviour.locator('option[value="none"]')).toContainText('already get + and −');

  await intoShow(page, 'Floorball scorebug', 'Friday Show');
  await settleDurableWrites(page);

  // The two figures arrived as NUMBER fields, so every control surface draws them as steppers
  // with nothing in this template asking for it (src/control/controlModel.ts).
  const live = page.getByTestId('live-numbers');
  await expect(live).toContainText('Home goals');
  await expect(live).toContainText('Away goals');

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  // +1, +1, −1 from the LIVE controls. The scores are f1 and f2 (f0 is the home club name).
  await live.getByTestId('live-number-f1-up').click();
  await live.getByTestId('live-number-f1-up').click();
  await live.getByTestId('live-number-f2-up').click();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2'); // drawn as 0
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('1');
  await live.getByTestId('live-number-f2-down').click();
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('0');

  // A bump is a PARTIAL update carrying one field, so the entrance never replays.
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Played in' })).toHaveCount(1);

  // ── THE QUIZ, INTO THE SAME SHOW ──────────────────────────────────────────────────────────
  await page.waitForTimeout(300); // let the cue draft's idle flush before leaving the page
  await settleDurableWrites(page);
  await page.goto('/app');
  await dropStudentSvg(page, QUIZ);

  // The LUKITTU badge is inside a switched-off layer, so the five bindable rows are the question
  // and the four options — and nothing else took f0.
  await expect(page.getByTestId('map-svg-fields')).toContainText('5 of 5');
  const qTitles = page.getByTestId('map-svg-fields').locator('input[data-testid^="map-svg-title-"]');
  await expect(qTitles.nth(0)).toHaveValue('Question text');
  await expect(qTitles.nth(4)).toHaveValue('Option 4');

  // NO PROPOSAL. "Option 1" is not "Answer A", so `proposeQuizBinding` returns null and the step
  // opens with the behaviour off. This is the road a student who never read the authoring page
  // walks, and it has to be walkable.
  const kind = page.getByTestId('map-svg-behaviour-kind');
  await expect(kind).toHaveValue('none');
  await kind.selectOption('quiz');

  // FOUR ANSWERS, each pointed at a text layer and at the three drawings the student made. Every
  // one of these is a picker: no layer was named anything in particular.
  await page.getByTestId('map-svg-quiz-question').selectOption({ label: 'Question text' });
  await page.getByTestId('map-svg-quiz-count').selectOption('4');
  for (const at of [0, 1, 2, 3]) {
    await page.getByTestId(`map-svg-quiz-answer-${at}`).selectOption({ label: `Option ${at + 1}` });
    // The drawn states report themselves as hidden, which is how the reader tells a moment from
    // the base artwork in a list of fifteen groups.
    await page.getByTestId(`map-svg-quiz-selected-${at}`).selectOption({ label: `Pick ${at + 1} (hidden)` });
    await page.getByTestId(`map-svg-quiz-correct-${at}`).selectOption({ label: `Right ${at + 1} (hidden)` });
    await page.getByTestId(`map-svg-quiz-wrong-${at}`).selectOption({ label: `Wrong ${at + 1} (hidden)` });
  }
  await page.getByTestId('map-svg-quiz-locked').selectOption({ label: 'Locked (hidden)' });
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);

  await intoShow(page, 'Tunturi quiz', { existing: 'Friday Show' });
  await settleDurableWrites(page);

  // BOTH GRAPHICS ARE IN ONE SHOW — which is what the September production is.
  const rundown = page.getByTestId('production-page');
  await expect(rundown).toContainText('Floorball scorebug');
  await expect(rundown).toContainText('Tunturi quiz');

  // Joining a show does not select the new cue — the operator picks the graphic they are about
  // to run, which on a two-cue rundown is the whole point of having one.
  await selectCue(page, 'Tunturi quiz');

  // The buttons are the MACHINE's, generated from the arcs, with nothing declared per template.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Select answer');
  await expect(actions).toContainText('Lock it in');
  await expect(actions).toContainText('Reveal correct');

  // The answer key and the contestant's pick, then to air.
  await page.getByTestId('cue-field-f5-opt-A').click(); // Halti is the right answer
  await page.getByTestId('cue-field-f6-opt-B').click(); // the contestant said Saana
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  // SCOPED BY TITLE: the PROGRAM monitor stacks one iframe per live LAYER, and the scorebug is
  // still on air under the quiz — which is what a two-graphic show looks like.
  const air = page.frameLocator('[data-testid="program-stage"] iframe[title="Tunturi quiz"]');
  await expect(air.locator('.imported-design-look.imported-design-on')).toHaveCount(0); // the entrance is not a verdict

  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(air.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(air.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/);
  // The pick stays up through the lock — two states showing, which is the moment itself.
  await expect(air.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(air.locator('[data-noacg-role~="answer.correct/A"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('[data-noacg-role~="answer.wrong/B"]')).toHaveClass(/imported-design-on/);

  // NOT ONE OPERATOR ACTION NEEDED THE CODE. The editor never opened, and this page has no code
  // view to open.
  await expect(page.locator('.monaco-editor')).toHaveCount(0);

  // ── THE RELOAD, MID-RUN ───────────────────────────────────────────────────────────────────
  // A cue edit flushes into the Show record on a 300 ms idle, so the wait is for the debounce
  // and then the disk. This is the school laptop that gets closed between periods.
  await page.waitForTimeout(300);
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });

  // BOTH CUES CAME BACK, with the figures the operator typed and the answer key they set.
  await expect(page.getByTestId('production-page')).toContainText('Floorball scorebug');
  await selectCue(page, 'Floorball scorebug');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('0');

  // **LIVENESS IS NOT DATA, and offline it does not survive the reload** — the steppers are
  // disabled and SAY WHY, rather than acting on a graphic that is not on air. There is no
  // shared command log in an offline build to restore it from; the hosted road is the one that
  // repaints a live layer on boot, and `e2e/configured/hosted-control-recovery.spec.ts` is
  // where that is pinned. What matters here is that the recovery is honest and the operator's
  // work is intact.
  const upAgain = page.getByTestId('live-numbers').getByTestId('live-number-f1-up');
  await expect(upAgain).toBeDisabled();
  await expect(upAgain).toHaveAttribute('title', /not on air — Take the cue first/);

  // …so the operator takes it again and carries on from the score that was stored.
  await page.getByTestId('verb-take').click();
  await expect(upAgain).toBeEnabled();
  await upAgain.click();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('3');

  // And the quiz still runs its whole arc after the reload.
  await selectCue(page, 'Tunturi quiz');
  await page.getByTestId('verb-take').click();
  const air2 = page.frameLocator('[data-testid="program-stage"] iframe[title="Tunturi quiz"]');
  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(air2.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);

  // **THE DIRECT REVEAL IS NOT REACHABLE, AND THE BUTTON SAYS SO.** `ANSWER_BOARD_MACHINE` draws
  // `judge` only from `locked` (templates/types/answerBoard.ts), so a reveal with no lock is not
  // an arc this graphic has — and the guard is STRUCTURAL, so the button greys rather than the
  // press doing nothing. That is the honest state of the thing docs/GOALS.md's north star names
  // as the open question ("the next producer wants no lock at all, just an immediate reveal"):
  // it is a machine the author would have to CHANGE, which is the custom-machine road the owner
  // opened on 2026-08-27 as direction to build after the student release. Asserting the greying
  // is what keeps this a measurement rather than a wish.
  await expect(page.getByRole('button', { name: /Reveal correct/ })).toBeDisabled();
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(page.getByRole('button', { name: /Reveal correct/ })).toBeEnabled();
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(air2.locator('[data-noacg-role~="answer.correct/A"]')).toHaveClass(/imported-design-on/);
});

test('a half-made quiz binding says what is missing instead of silently coming on and off', async ({
  page,
}) => {
  // THE SILENT DROP. `svgBehaviourOption` refuses a binding whose question or answers are not
  // ticked rows — a half-made behaviour would put buttons on the control page acting on fields
  // that are not there. It used to refuse without a word, so a reader picked Quiz, walked on, and
  // got a graphic that comes on and off with nothing anywhere saying why. This is the
  // `missingParts` pattern applied to the wizard: one function decides, and the step reads its
  // answer out (draft.ts `quizBindingGaps`).
  await page.goto('/app');
  await dropStudentSvg(page, QUIZ);

  await page.getByTestId('map-svg-behaviour-kind').selectOption('quiz');
  await page.getByTestId('map-svg-quiz-question').selectOption({ label: 'Question text' });
  await page.getByTestId('map-svg-quiz-answer-0').selectOption({ label: 'Option 1' });
  await page.getByTestId('map-svg-quiz-answer-1').selectOption({ label: 'Option 2' });
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);

  // Untick the row answer B points at, keeping its words as drawn. The binding is now unusable,
  // and it says so.
  await untickTextRow(page, 't2');
  const missing = page.getByTestId('map-svg-behaviour-missing');
  await expect(missing).toBeVisible();
  await expect(missing).toContainText('one answer layer');
  await expect(page.getByTestId('map-svg-behaviour')).toContainText('a quiz, once you say');

  // Put it back and the warning goes with it.
  await page.getByTestId('map-svg-row-t2').locator('input[type="checkbox"]').check();
  await expect(missing).toHaveCount(0);
});
