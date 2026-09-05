import { test, expect, type BrowserContext, type Page, type Route } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import nodePath from 'node:path';
import JSZip from 'jszip';
import { settleDurableWrites } from './_durable';
import { relayServe, routeOrigin } from './_relay';
import {
  bindEveryTextLayer,
  dropSvg,
  intoProduction,
  rowLabelled,
  QUIZ_SVG,
  SCORE_SVG,
  SCOREBUG_SVG,
  TIMER_SVG,
  VOTE_SVG,
} from './_svg-import';
import { openWorkspace } from './_workspace';

// IMPORTED ARTWORK THAT BEHAVES (docs/GRAPHIC_BEHAVIOUR_PLAN.md).
//
// The two September cases, each walked the way a person walks it: drop the SVG on the Import
// door, map it, add it to a production, and drive it from the operator's own controls.
//
//  1. THE PLAIN SCOREBOARD needs no behaviour at all, and this spec exists partly to keep that
//     true. A numeric SVG layer becomes an `ftype: number` field, and every control surface
//     renders a number field as a ± stepper with no per-template code (src/control/controlModel.ts).
//     The assertions below are therefore about the GENERIC pipeline: the stepper reaches the live
//     cue, a bump is a partial single-field update (so the entrance never replays), and the
//     figure survives a reload. That road did not go away when the score BEHAVIOUR shipped
//     (case 4) - it is still what a board with no behaviour bound gets, and it is still the
//     typed-correction road on a board that has one.
//  2. THE QUIZ is the pilot. Its machine and its buttons are the catalog answer board's, reused;
//     what is new is that the drawn STATES are the designer's own layers, shown and hidden by
//     the machine. The assertions reach inside the on-air renderer and read which of those
//     layers is actually lit.
//  3. THE LIVE VOTE is the third behaviour (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12) and the first one
//     that reaches OUTSIDE the graphic: the counts come from the audience plane, which has
//     counted votes since Phase 6 and had nowhere to put them on artwork somebody drew. The walk
//     is therefore the whole join — drop, bind, open a vote, drive votes through the offline
//     provider's simulator, stage the counts, take the cue, and read the bars in the renderer.
//  4. THE SCORE TRACKER is the fourth (docs/backlog/scoreboard-behaviour.md), and it is the other
//     half of what 2026-09-12 needs. What is new about it is the OPERATOR'S three verbs rather
//     than the paint: one press adds a point AND plays the designer's flash, one takes both back,
//     one starts a new game. So its walk drives all three from the dashboard and reads both the
//     figures and the drawn layers in the renderer - a scoreboard that says the wrong number is
//     the only failure this graphic can really have.
//
// The first two fixtures are the SHIPPED SAMPLES (docs/svg-samples/) rather than copies: the
// files a designer is handed are the files the tests walk, so the two cannot drift. The vote
// board and the four-team score board are corpus fixtures (e2e/fixtures/svg-corpus/), because
// neither is offered as a sample.


/**
 * FRAMES FOR A HUMAN, off by default.
 *
 * `NOACG_SHOTS=<dir> npx playwright test import-svg-behaviour` writes one PNG per beat of the
 * walk there. A green assertion says the class is on the right layer; it does not say the board
 * LOOKS right, and this pilot's whole question is what a state looks like on somebody else's
 * artwork — so the frames exist to be looked at, and the suite stays fast when nobody is.
 */
const SHOTS = process.env.NOACG_SHOTS ?? '';
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false });
}

/** The offline walk starts from a cold /app; the live one arrives already signed in, which is
 *  why the shared helper does not navigate. */
async function openImportDoor(page: Page, fixture: string) {
  await page.goto('/app');
  await dropSvg(page, fixture);
}


test('imported scoreboard: a numeric layer is a ± stepper that acts on air, and survives a reload', async ({ page }) => {
  await openImportDoor(page, SCOREBUG_SVG);

  await bindEveryTextLayer(page);
  await expect(page.getByTestId('map-svg-fields')).toContainText('7 of 7');

  await shot(page, '1-scoreboard-mapping');
  await intoProduction(page, 'Match scorebug', 'Saturday Match');
  await settleDurableWrites(page);

  // The scores arrived as NUMBER fields, so the panel offers them as steppers — the generic
  // control model doing it, with nothing in this template asking for it.
  const live = page.getByTestId('live-numbers');
  await expect(live).toContainText('Home score');
  await expect(live).toContainText('Away score');

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  // Two up, one down, from the LIVE controls.
  const homePlus = live.getByTestId('live-number-f1-up');
  const awayMinus = live.getByTestId('live-number-f2-down');
  await homePlus.click();
  await homePlus.click();
  await awayMinus.click();

  const home = page.getByTestId('cue-field-f1');
  const away = page.getByTestId('cue-field-f2');
  await shot(page, '2-scoreboard-bumped');
  await expect(home).toHaveValue('4'); // drawn as 2
  await expect(away).toHaveValue('0'); // drawn as 1

  // THE ENTRANCE MUST NOT REPLAY. A bump is a partial update carrying one field, so the log
  // records updates and nothing else — one "Played in" for the take, and no second one.
  // Scoped to the ROWS: the collapsed summary repeats the newest line, so an unscoped text
  // match counts the latest entry twice.
  const log = page.getByTestId('action-log-row');
  await expect(log.filter({ hasText: 'Updated 1 field' })).toHaveCount(3);
  await expect(log.filter({ hasText: 'Played in' })).toHaveCount(1);

  // And the figures are the production's, not the session's. A bump edits the cue DRAFT, which
  // flushes into the Show record on a 300 ms idle (ProductionPage `editDraft`) — so the wait is
  // for the debounce first and the disk second, exactly as production-persistence.spec.ts does.
  // Reloading inside that window is what a dropped laptop does, and the score would be the
  // aired one rather than the stored one.
  await page.waitForTimeout(300);
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('4');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('0');
});

test('imported score board: four teams are proposed, and one press adds a point and plays the flash', async ({ page }) => {
  // TWO OR MORE TEAMS, DISCOVERED FROM THE ARTWORK (owner, 2026-09-03: "a simple score tracker
  // with two or more teams"). Every scoreboard this suite walked before this one had two, so
  // nothing measured whether four rows survive the door - and four is the shape the 2026-09-12
  // production actually needs, because it is a class quiz with four groups rather than a match.
  test.slow(); // the import, a production, a take, and eight presses read in the renderer
  await openImportDoor(page, SCORE_SVG);

  // THE PROPOSAL (draft.ts proposeScoreBinding). A designer who named layers the way
  // docs/SVG_AUTHORING.md section 5b tells them to opens this step with every picker filled. It
  // is an accelerator, never a gate - each of these is a select the author can change.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('score');
  await expect(page.getByTestId('map-svg-score-count')).toHaveValue('4');
  for (const at of [0, 1, 2, 3]) {
    const n = at + 1;
    await expect(page.getByTestId(`map-svg-score-name-${at}`).locator('option:checked')).toHaveText(`Team ${n}`);
    await expect(page.getByTestId(`map-svg-score-figure-${at}`).locator('option:checked')).toHaveText(`Score ${n}`);
    // The flashes are switched off in the file, which is how a reader tells a moment from base
    // artwork in a list of groups.
    await expect(page.getByTestId(`map-svg-score-flash-${at}`).locator('option:checked')).toHaveText(
      `Flash ${n} (hidden)`,
    );
  }
  await expect(page.getByTestId('map-svg-score-final').locator('option:checked')).toHaveText('Full time (hidden)');

  // NOTHING IS TAKEN AWAY FROM THE OPERATOR, which is the difference from the vote board. A
  // team's name and its figure are things somebody TYPES and bumps, so all nine layers stay
  // fields - and the step must not claim otherwise.
  await expect(page.getByTestId('map-svg-poll-driven')).toHaveCount(0);
  await expect(page.getByTestId('map-svg-fields')).toContainText('9 of 9');

  await shot(page, '15-score-mapping');
  await intoProduction(page, 'Class quiz board', 'Friday Quiz');
  await settleDurableWrites(page);

  // THE BUTTONS ARE THE MACHINE'S, and the SECTION is the designer's own word for that team -
  // the survey's label finding (docs/SCORE_CONTROL_SURVEY.md §5): every product writes the signed
  // amount on the key and lets the column say whose it is.
  const actions = page.getByTestId('cue-actions');
  for (const n of [1, 2, 3, 4]) await expect(actions).toContainText(`Team ${n}`);
  await expect(actions).toContainText('New game');
  await expect(actions).toContainText('Full time');
  await expect(actions).toContainText('Clear flash');

  // …and the SCORES ARE STILL ± STEPPERS beside them. That is the survey's second correction
  // road - typing the true score, for when the operator has lost track rather than fumbled - and
  // it exists here for free precisely because the behaviour did NOT take the fields over.
  await expect(page.getByTestId('live-numbers')).toContainText('Score 1');

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const flashOn = (n: number) => expect(air.locator(`[data-noacg-role~="team.flash/${n}"]`)).toHaveClass(/imported-design-on/);
  const flashOff = (n: number) => expect(air.locator(`[data-noacg-role~="team.flash/${n}"]`)).not.toHaveClass(/imported-design-on/);

  // Nothing is lit on arrival: every drawn state starts hidden and the entrance is not a verdict.
  for (const n of [1, 2, 3, 4]) await flashOff(n);
  await expect(air.locator('[data-noacg-role~="final"]')).not.toHaveClass(/imported-design-on/);

  // ── ONE PRESS IS A POINT AND A MOMENT ───────────────────────────────────────────────────────
  //
  // The figure rides the SAME press as the flash (`adjust`), so the machine applies both together
  // or neither - the owner's 2026-08-23 ruling, "no reason to play the goal animation if the
  // number doesn't change", reaching artwork somebody else drew. Read in three places, because
  // any two of them can agree while the third is the one the audience sees: the operator's own
  // box, the drawn figure on air, and the drawn moment.
  await page.getByTestId('cue-action-score1').click();
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('1');
  await expect(air.locator('#f2')).toHaveText('1');
  await flashOn(1);
  await shot(page, '16-score-team-one');

  // WHICH ROW FLASHED IS DATA, NOT A STATE (scoreBehaviour.ts). There is one Flash state and the
  // row is read from the figure that moved, so a point for team three moves the flash to three -
  // a machine with a state per team would have needed four near-identical states, which
  // docs/STATE_MACHINE_SCHEMA.md forbids in as many words.
  await page.getByTestId('cue-action-score3').click();
  await expect(page.getByTestId('cue-field-f6')).toHaveValue('1');
  await flashOn(3);
  await flashOff(1);

  // A second point while the flash is still up is the SELF-TRANSITION: it replays the moment and
  // bumps again, rather than being dropped by the guard.
  await page.getByTestId('cue-action-score3').click();
  await expect(page.getByTestId('cue-field-f6')).toHaveValue('2');
  await flashOn(3);

  // ── THE CORRECTION TAKES THE FLASH DOWN WITH THE POINT ──────────────────────────────────────
  //
  // Operators mis-press, and a press that should not have happened has to leave nothing of itself
  // behind - the point AND the moment - or the operator is left pressing a second button to
  // finish undoing the first.
  await page.getByTestId('cue-action-unscore3').click();
  await expect(page.getByTestId('cue-field-f6')).toHaveValue('1');
  await expect(air.locator('#f6')).toHaveText('1');
  for (const n of [1, 2, 3, 4]) await flashOff(n);
  await shot(page, '17-score-corrected');

  // Full time is the match's own end, and it is the designer's own plate.
  await page.getByTestId('cue-action-final').click();
  await expect(air.locator('[data-noacg-role~="final"]')).toHaveClass(/imported-design-on/);
  await shot(page, '18-score-full-time');

  // ── NEW GAME IS ONE PRESS, AND IT REACHES THE CUE ───────────────────────────────────────────
  //
  // This is what `MachineControl.set` was added for. `payload` rides a field at whatever it
  // reads and `adjust` rides it moved by a delta; neither can say "make it zero". Written instead
  // as a runtime call it would have zeroed the graphic and left the operator's boxes reading 1
  // and 1 - so the next ✎ Update would put the old score straight back on air. Both halves are
  // asserted for exactly that reason: the boxes AND the renderer.
  await page.getByTestId('cue-action-newGame').click();
  for (const f of ['f2', 'f4', 'f6', 'f8']) await expect(page.getByTestId(`cue-field-${f}`)).toHaveValue('0');
  await expect(air.locator('#f2')).toHaveText('0');
  await expect(air.locator('#f6')).toHaveText('0');
  // …and the board is live again, with nothing left of the last game.
  await expect(air.locator('[data-noacg-role~="final"]')).not.toHaveClass(/imported-design-on/);
  for (const n of [1, 2, 3, 4]) await flashOff(n);
  await shot(page, '19-score-new-game');

  // THE FIGURES ARE THE PRODUCTION'S, NOT THE SESSION'S - the same debounce-then-disk wait the
  // stepper walk above makes, because a press that only aired would be lost by a dropped laptop.
  await page.getByTestId('cue-action-score2').click();
  await expect(page.getByTestId('cue-field-f4')).toHaveValue('1');
  await page.waitForTimeout(300);
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('cue-field-f4')).toHaveValue('1');
});

test('imported score board: NEW GAME zeroes the scores on the EXPORTED controller too', async ({ page, context }) => {
  test.setTimeout(180_000);
  // PARITY IS THE POINT (docs/CONTROL_PANEL_PARITY.md §4). The exported controller ships without
  // controlModel.ts, so it carries its OWN copy of the payload rule - and `set` is the third
  // member of that rule, added for this graphic. A reset that works in the cockpit and not in the
  // package is a reset a class loses on the night the network dies, which is exactly when they
  // are operating from the package.
  //
  // Asserted on the WIRE and on the controller's own box, the way the catalog board's `adjust` is
  // (e2e/production-controls.spec.ts): one row, the event carrying every score at zero, and the
  // number boxes moved with it so a later ⟳ TAKE cannot put the old game back.
  await openImportDoor(page, SCORE_SVG);
  await intoProduction(page, 'Class quiz board', 'Package Night');
  await settleDurableWrites(page);

  const b64 = await page.evaluate(async (production) => {
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const fresh = shows.loadShows().find((s) => s.name === production)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  }, 'Package Night');

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
      files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
    }
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const { serve, rows } = relayServe(files);
  const origin = 'http://package-night.local';

  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${manifest.graphics[0].file}?stream=program`, { waitUntil: 'load' });
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await ctl.locator('.cue').first().click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });

  const programEvents = () =>
    rows
      .filter((r) => r.stream === 'program' && (r.msg as { t: string }).t === 'event')
      .map((r) => r.msg as { event: string; payload?: Record<string, string> });

  // Two points on two different teams, so the reset has something real to undo.
  const events = ctl.locator('#editor-events');
  await events.getByRole('button', { name: '⚡ +1' }).first().click();
  await expect(air.locator('#f2')).toHaveText('1', { timeout: 10_000 });
  await events.getByRole('button', { name: '⚡ +1' }).nth(2).click();
  await expect(air.locator('#f6')).toHaveText('1', { timeout: 10_000 });

  await events.getByRole('button', { name: '⚡ New game' }).click();
  const reset = programEvents()[programEvents().length - 1];
  expect(reset.event).toBe('newGame');
  // EVERY score rides, not only the two that moved: the wire says what the board should read, so
  // a renderer that missed an earlier press still lands on the same game.
  expect(reset.payload).toEqual({ f2: '0', f4: '0', f6: '0', f8: '0' });
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });
  await expect(air.locator('#f6')).toHaveText('0', { timeout: 10_000 });

  // …and the controller's own boxes moved with it, which is the half a runtime-only reset loses:
  // a ⟳ re-take must not put the old score back.
  await ctl.locator('#v-update').click();
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });
  await expect(air.locator('#f6')).toHaveText('0', { timeout: 10_000 });

  // THE THIRD OPERATOR SURFACE IS DRIVEN BY ITS OWN WALK, below ("the CasparCG package's
  // standalone panel drives the imported score board"). It was withdrawn when this test was
  // written, because the panel never paired: the CasparCG package did not contain one, which
  // read as a pairing defect on imported artwork and was neither
  // (docs/backlog/exported-panel-does-not-pair-with-an-imported-design.md).

  await ctl.close();
  await air.close();
});

test('imported quiz: drawn layers are proposed from their names, and the operator drives select → lock → reveal', async ({ page }) => {
  await openImportDoor(page, QUIZ_SVG);

  // THE PROPOSAL (draft.ts proposeQuizBinding): a designer who named layers the obvious way
  // opens this step with every picker already filled. It is an accelerator, never a gate —
  // each of these is a select the author can change.
  const behaviour = page.getByTestId('map-svg-behaviour');
  await expect(behaviour).toBeVisible();
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  await expect(page.getByTestId('map-svg-quiz-count')).toHaveValue('4');
  for (const [at, letter] of ['A', 'B', 'C', 'D'].entries()) {
    await expect(page.getByTestId(`map-svg-quiz-answer-${at}`)).toContainText(`Answer ${letter}`);
    // The drawn states, matched by letter and state word off the layer NAMES.
    for (const state of ['selected', 'correct', 'wrong']) {
      const picker = page.getByTestId(`map-svg-quiz-${state}-${at}`);
      await expect(picker.locator('option:checked')).toContainText(`${letter} ${state === 'selected' ? 'selected' : state}`);
    }
  }
  await expect(page.getByTestId('map-svg-quiz-locked').locator('option:checked')).toContainText('Locked in');

  await shot(page, '3-quiz-mapping');
  await intoProduction(page, 'Olympics quiz', 'Quiz Night');
  await settleDurableWrites(page);

  // THE BUTTONS ARE THE MACHINE'S. Nothing here is declared per template: every operator event
  // an arrow carries became a button, and the audience event — whose branch this pilot drops —
  // is simply absent rather than dead.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Select answer');
  await expect(actions).toContainText('Lock it in');
  await expect(actions).toContainText('Reveal correct');
  await expect(actions).not.toContainText('audience');

  // Set the answer key and the pick, then take it to air.
  // Few enough options that the control model renders a segmented picker rather than a select.
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  // The PROGRAM renderer is what the audience sees. `frameLocator` reaches into it through CDP
  // even though the iframe carries no allow-same-origin (see e2e/_frame.ts).
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const lit = () => air.locator('.imported-design-look.imported-design-on');

  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(lit()).toHaveCount(1);
  await expect(air.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await shot(page, '4-quiz-selected');

  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(air.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/);
  // The pick stays up through the lock — two states showing, which is the moment itself.
  await expect(air.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await shot(page, '5-quiz-locked');

  await page.getByRole('button', { name: /Reveal correct/ }).click();
  // C is the key: its row lights, the other three take the wrong treatment.
  await expect(air.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);
  for (const row of ['A', 'B', 'D']) {
    await expect(air.locator(`[data-noacg-role~="answer.wrong/${row}"]`)).toHaveClass(/imported-design-on/);
  }
  await expect(air.locator('[data-noacg-role~="answer.correct/A"]')).not.toHaveClass(/imported-design-on/);
  await shot(page, '6-quiz-revealed');
});

test('the proposal reads evidence, not order: answer rows with bars are a vote, and a heading is not a row', async ({ page }, testInfo) => {
  // TWO FILED DEFECTS OF THE MODULE-ERA DETECTOR (docs/backlog/, 2026-09-05), both from the same
  // shape - each behaviour carried its own regexes and an order-sensitive dispatcher chose the
  // first that answered. `Answer 1` rows always read as a QUIZ because the quiz was asked first,
  // even beside three bars nothing but a vote has; and a heading called `Options` was read as
  // option S, so the audience's first option overwrote the heading on air. One tokenizer and one
  // scorer over every recipe's words (templates/behaviours/naming.ts) is the fix, and this is
  // the file that would have caught both.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <g id="Board"><rect x="0" y="700" width="1920" height="380" fill="#111"/></g>
  <text id="Options" data-name="Options" x="120" y="760" font-family="Arial" font-size="30" fill="#fff">OPTIONS</text>
  <text id="Answer_x20_1" data-name="Answer 1" x="120" y="820" font-family="Arial" font-size="30" fill="#fff">Keep the crest</text>
  <text id="Answer_x20_2" data-name="Answer 2" x="120" y="880" font-family="Arial" font-size="30" fill="#fff">New crest</text>
  <text id="Answer_x20_3" data-name="Answer 3" x="120" y="940" font-family="Arial" font-size="30" fill="#fff">Ask the members</text>
  <g id="Rails">
    <rect id="Bar_x20_1" data-name="Bar 1" x="560" y="800" width="1000" height="36" fill="#f6a623"/>
    <rect id="Bar_x20_2" data-name="Bar 2" x="560" y="860" width="1000" height="36" fill="#f6a623"/>
    <rect id="Bar_x20_3" data-name="Bar 3" x="560" y="920" width="1000" height="36" fill="#f6a623"/>
  </g>
</svg>`;
  const file = testInfo.outputPath('answers-with-bars.svg');
  writeFileSync(file, svg);
  await openImportDoor(page, file);

  // A vote, with exactly the three rows the designer drew - the heading is not a fourth.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('poll');
  await expect(page.getByTestId('map-svg-poll-count')).toHaveValue('3');
  for (const at of [0, 1, 2]) {
    await expect(page.getByTestId(`map-svg-poll-label-${at}`).locator('option:checked')).toHaveText(`Answer ${at + 1}`);
    await expect(page.getByTestId(`map-svg-poll-bar-${at}`).locator('option:checked')).toHaveText(`Bar ${at + 1}`);
  }
  // …and the heading stays an ordinary field the operator can retype.
  await expect(page.getByTestId('map-svg-fields')).toContainText('1 of 4');
});

test('switches and a choice: hidden layers named show: and choice: get their own buttons, beside a quiz', async ({ page }, testInfo) => {
  // THE UNIVERSAL FLOOR (docs/SVG_BEHAVIOUR_PLAN.md §7c). An award card's winner name, a sponsor
  // tag, a status bug's three looks - none of these is a behaviour anybody writes a recipe for,
  // and all of them are a hidden layer that is either up or not. Two prefixes make them arrive
  // bound; every hidden layer no recipe claimed is offered the same two answers in the step. And
  // it is the first COMPOSITION: a switch and a choice beside a quiz are three parallel groups
  // and disjoint role sets on one graphic, which the machine always allowed and the binding never
  // did.
  test.slow();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <g id="Board"><rect x="0" y="600" width="1920" height="480" fill="#111"/></g>
  <text id="Question" data-name="Question" x="120" y="700" font-family="Arial" font-size="40" fill="#fff">Which is the capital?</text>
  <text id="Answer_x20_A" data-name="Answer A" x="120" y="800" font-family="Arial" font-size="32" fill="#fff">Helsinki</text>
  <text id="Answer_x20_B" data-name="Answer B" x="120" y="880" font-family="Arial" font-size="32" fill="#fff">Turku</text>
  <g id="A_x20_selected" data-name="A selected" display="none"><rect x="100" y="770" width="600" height="44" fill="#f6a623"/></g>
  <g id="B_x20_selected" data-name="B selected" display="none"><rect x="100" y="850" width="600" height="44" fill="#f6a623"/></g>
  <g id="show_x3A_Sponsor" data-name="show:Sponsor" display="none"><rect x="1500" y="640" width="300" height="80" fill="#2a6"/></g>
  <g id="choice_x3A_Status_x2F_Live" data-name="choice:Status/Live" display="none"><rect x="1500" y="900" width="200" height="60" fill="#c33"/></g>
  <g id="choice_x3A_Status_x2F_Replay" data-name="choice:Status/Replay" display="none"><rect x="1500" y="900" width="200" height="60" fill="#36c"/></g>
</svg>`;
  const file = testInfo.outputPath('quiz-with-extras.svg');
  writeFileSync(file, svg);
  await openImportDoor(page, file);

  // The quiz is proposed from its words; the three prefixed layers arrive as a switch and a
  // choice, and the step names them the operator's way.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  const extras = page.getByTestId('map-svg-extras');
  await expect(extras).toBeVisible();
  await expect(extras).toContainText('1 switch · 1 choice');
  const rows = extras.locator('[data-testid^="map-svg-extra-use-"]');
  await expect(rows).toHaveCount(3);
  await expect(extras.locator('input[value="Sponsor"]')).toHaveCount(1);
  await expect(extras.locator('input[value="Status"]')).toHaveCount(2);

  await intoProduction(page, 'Capital quiz', 'Quiz Night');
  await settleDurableWrites(page);

  // THREE BUTTON SETS ON ONE PAGE: the quiz's arc, the switch's pair, the choice's options.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Select answer');
  await expect(actions).toContainText('Show Sponsor');
  await expect(actions).toContainText('Hide Sponsor');
  await expect(actions).toContainText('Live');
  await expect(actions).toContainText('Replay');

  await page.getByTestId('cue-field-f4-opt-A').click(); // the pick
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const lit = (token: string) => expect(air.locator(`[data-noacg-role~="${token}"]`)).toHaveClass(/imported-design-on/);
  const dark = (token: string) => expect(air.locator(`[data-noacg-role~="${token}"]`)).not.toHaveClass(/imported-design-on/);

  // Nothing is lit on arrival.
  await dark('switch.sponsor.on');
  await dark('choice.status.option/LIVE');

  // The switch: its own group, its own reported field, and the layer follows the press.
  await page.getByRole('button', { name: /Show Sponsor/ }).click();
  await lit('switch.sponsor.on');
  await expect(page.getByRole('button', { name: /Show Sponsor/ })).toBeDisabled();
  await page.getByRole('button', { name: /Hide Sponsor/ }).click();
  await dark('switch.sponsor.on');

  // The choice: one shows at a time, and the current option's button is greyed.
  await actions.getByRole('button', { name: /Live$/ }).click();
  await lit('choice.status.option/LIVE');
  await dark('choice.status.option/REPLAY');
  await actions.getByRole('button', { name: /Replay$/ }).click();
  await lit('choice.status.option/REPLAY');
  await dark('choice.status.option/LIVE');

  // …and the quiz still selects beside them: composition changed nothing about the arc.
  await page.getByRole('button', { name: /Select answer/ }).click();
  await lit('answer.selected/A');
  await lit('choice.status.option/REPLAY');
  await shot(page, '26-quiz-with-switch-and-choice');
});

test('an undrawn quiz moment wears NoaCG’s own look, and a drawn one replaces it', async ({ page }) => {
  // THE MOMENT LADDER (docs/SVG_STATES_FROM_ARTWORK.md, ratified 2026-09-03). The owner imported a
  // quiz board with nothing hidden, pressed every button, and watched the Program monitor not
  // change by one pixel - the machine was flawless and invisible. Rung 1 is the fix: a moment the
  // designer did not draw is painted by NoaCG, one neutral look per kind, built by the shipped
  // runtime from the row's own geometry so it is the same on every road. This is that board.
  test.slow();
  const PLAIN = fileURLToPath(new URL('./fixtures/svg-corpus/illustrator-quiz-board-multiline.svg', import.meta.url));
  await openImportDoor(page, PLAIN);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  // Every moment picker says what will happen when nothing is drawn, rather than "not drawn".
  await expect(page.getByTestId('map-svg-quiz-selected-0').locator('option:checked')).toContainText('NoaCG');
  await expect(page.getByTestId('map-svg-quiz-locked').locator('option:checked')).toContainText('NoaCG');

  await intoProduction(page, 'Plain quiz', 'Quiz Night');
  await settleDurableWrites(page);
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const made = (token: string) => air.locator(`[data-noacg-default="${token}"]`);

  // Nothing is painted until a state says so.
  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(made('answer.selected/B')).toHaveClass(/imported-design-on/);
  // The default rings the row's own panel, drawn in the artwork's units: a real box, not a dot.
  const ring = await made('answer.selected/B').locator('rect').first().evaluate((el) => ({
    w: Number(el.getAttribute('width')),
    h: Number(el.getAttribute('height')),
  }));
  expect(ring.w).toBeGreaterThan(200);
  expect(ring.h).toBeGreaterThan(20);
  await expect(made('answer.selected/A')).not.toHaveClass(/imported-design-on/);

  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(made('locked')).toHaveClass(/imported-design-on/);
  await expect(made('locked').locator('text')).toHaveText('LOCKED IN');

  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(made('answer.correct/C')).toHaveClass(/imported-design-on/);
  await expect(made('answer.wrong/A')).toHaveClass(/imported-design-on/);
  await expect(made('answer.wrong/B')).toHaveClass(/imported-design-on/);
  await expect(made('answer.correct/A')).not.toHaveClass(/imported-design-on/);
  await shot(page, '27-quiz-default-looks');
});

test('the quiz\u2019s first option: no lock, and Reveal correct works straight from a pick', async ({ page }) => {
  // "WHAT IF I DON'T WANT TO BE ABLE TO LOCK IT?" (owner, 2026-08-22) - the north star's own
  // example of the next producer changing the logic. A recipe OPTION is a structural variant an
  // expert authored (docs/SVG_BEHAVIOUR_PLAN.md §7e): one checkbox adds the arrow from the pick
  // to the reveal, and the structural guard reads the new graph. Nothing else moves.
  await openImportDoor(page, QUIZ_SVG);
  const lock = page.getByTestId('map-svg-option-lock');
  await expect(lock).toBeChecked();
  await lock.uncheck();
  await intoProduction(page, 'Direct reveal quiz', 'Quiz Night');
  await settleDurableWrites(page);
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  await page.getByRole('button', { name: /Select answer/ }).click();
  // Legal from the pick, with no lock in between - and the lock is still there for a show that
  // wants it.
  await expect(page.getByRole('button', { name: /Reveal correct/ })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Lock it in/ })).toBeEnabled();
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(air.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);
});

test('a meter: the bar the designer drew fills toward the target as the figure goes up', async ({ page }, testInfo) => {
  // THE SURVEY'S "progress bar toward a target" (docs/BEHAVIOUR_SURVEY.md §3) on artwork somebody
  // drew: a bar at its full length and two owned figures, no machine at all - a meter changes
  // because its DATA changes. The recipe is held generically by the wizard (kind 'recipe'), which
  // is the shape every rowless recipe after it takes.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">
  <rect x="0" y="900" width="1920" height="180" fill="#111"/>
  <text id="Title" data-name="Title" x="120" y="960" font-family="Arial" font-size="40" fill="#fff">Raised so far</text>
  <rect id="Track" data-name="Track" x="120" y="1000" width="1000" height="30" fill="#333"/>
  <rect id="Progress_x20_bar" data-name="Progress bar" x="120" y="1000" width="1000" height="30" fill="#2a6"/>
  <text id="Percent" data-name="Percent" x="1160" y="1024" font-family="Arial" font-size="28" fill="#fff">0%</text>
</svg>`;
  const file = testInfo.outputPath('meter.svg');
  writeFileSync(file, svg);
  await openImportDoor(page, file);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('meter');
  await expect(page.getByTestId('map-svg-recipe-bar').locator('option:checked')).toHaveText('Progress bar');
  await intoProduction(page, 'Fundraiser meter', 'Telethon');
  await settleDurableWrites(page);

  // The two figures are ± steppers with nothing declared; the percent layer is the vote's, and is
  // no longer a field the operator types.
  const live = page.getByTestId('live-numbers');
  await expect(live).toContainText('Current');
  await expect(live).toContainText('Target');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const width = async () => Math.round(Number(await air.locator('[data-noacg-role~="bar"]').getAttribute('width')));
  await expect.poll(width).toBe(0);
  await page.getByTestId('cue-field-f1').fill('25');
  await page.getByTestId('verb-update').click();
  await expect.poll(width, { timeout: 10_000 }).toBe(250);
  await expect(air.locator('[data-noacg-role~="percent"]')).toHaveText('25%');
  await page.getByTestId('cue-field-f2').fill('50');
  await page.getByTestId('verb-update').click();
  await expect.poll(width, { timeout: 10_000 }).toBe(500);
  await expect(air.locator('[data-noacg-role~="percent"]')).toHaveText('50%');
});

test('an alert takes itself off air after its hold', async ({ page }) => {
  // The owner's alert story ("plays, holds briefly, self-outs") as one timer arrow from the
  // entrance to the exit on artwork somebody drew - the catalog transition's own shape, chosen
  // from the picker on a graphic whose names propose nothing.
  await openImportDoor(page, SCOREBUG_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('alert');
  await expect(page.getByTestId('map-svg-behaviour')).toContainText('takes itself off');
  await intoProduction(page, 'Goal flash', 'Match');
  await settleDurableWrites(page);
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(air.locator('.imported-design')).not.toHaveCSS('opacity', '0');
  // Eight seconds of hold, then the exit plays with nobody pressing anything.
  await expect(air.locator('.imported-design')).toHaveCSS('opacity', '0', { timeout: 20_000 });
});

test('imported vote board: a real audience round moves the bars the designer drew', async ({ page }) => {
  // THE JOIN (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). Every piece under this shipped separately —
  // the audience plane counts votes (Phase 6), the catalog has a live-vote arc, the importer
  // binds behaviour to artwork — and the one thing that did not exist was the join between them,
  // so a poll only worked on a board WE drew. What is pinned here is that join, end to end.
  test.slow(); // the import, a production, a second tab for the audience workspace, and a take
  await openImportDoor(page, VOTE_SVG);

  // THE PROPOSAL, as for the quiz: a designer who named layers the obvious way opens this step
  // with every picker filled. It is an accelerator — each of these is a select they can change,
  // and a file naming nothing proposes nothing.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('poll');
  await expect(page.getByTestId('map-svg-poll-count')).toHaveValue('3');
  for (const at of [0, 1, 2]) {
    const n = at + 1;
    await expect(page.getByTestId(`map-svg-poll-label-${at}`).locator('option:checked')).toHaveText(`Option ${n}`);
    await expect(page.getByTestId(`map-svg-poll-bar-${at}`).locator('option:checked')).toHaveText(`Bar ${n}`);
    await expect(page.getByTestId(`map-svg-poll-value-${at}`).locator('option:checked')).toHaveText(`Percent ${n}`);
    // The winner marks are switched off in the file, which is how a reader tells a moment from
    // base artwork in a list of groups.
    await expect(page.getByTestId(`map-svg-poll-winner-${at}`).locator('option:checked')).toHaveText(
      `Winner ${n} (hidden)`,
    );
  }
  await expect(page.getByTestId('map-svg-poll-badge').locator('option:checked')).toHaveText('Vote badge');
  await expect(page.getByTestId('map-svg-poll-total').locator('option:checked')).toHaveText('Total votes');

  // A LAYER THE VOTE DRIVES STOPS BEING A FIELD, and the step says so ON THE ROW rather than
  // letting the reader discover a field missing from the control page. Two writers on one node is
  // a graphic whose operator watches their own typing be overwritten.
  await expect(page.getByTestId('map-svg-poll-driven')).toContainText('8 of the layers');

  // …AND THE ROW OFFERS NO BOX TO TYPE IN (owner walk, 2026-09-03). He selected a percentage,
  // watched it highlight in the preview, typed, and nothing happened - because the layer is
  // dropped from the field list, so the name and the sample he typed reached nothing at all. A
  // control that cannot change the graphic in front of you must not be offered.
  const percent = await rowLabelled(page, /Percent 1/);
  await expect(page.getByTestId(`map-svg-sample-${percent}`)).toHaveCount(0);
  await expect(page.getByTestId(`map-svg-title-${percent}`)).toHaveCount(0);
  await expect(page.getByTestId(`map-svg-driven-${percent}`)).toContainText('filled by the vote');

  // …AND ITS TICK CANNOT TAKE THE LAYER OFF THE ARTWORK. Unticking with "remove" stamps the class
  // that hides a layer while the vote goes on writing into it, so the counts land inside
  // something nobody can see and no gap reports it - and with the two text boxes gone from this
  // row, the tick is the only control left on it. The picker below is the honest way out.
  await expect(page.locator(`[data-testid="map-svg-row-${percent}"] input[type="checkbox"]`)).toBeDisabled();
  await expect(
    page.locator(`[data-testid="map-svg-row-${await rowLabelled(page, /Badge text/)}"] input[type="checkbox"]`),
  ).toBeEnabled();

  // The badge text is NOT driven - the designer's own words on the pill, which an operator may
  // well retype - so its boxes are exactly where they were.
  const badge = await rowLabelled(page, /Badge text/);
  await expect(page.getByTestId(`map-svg-sample-${badge}`)).toHaveValue('VOTE NOW');
  await expect(page.getByTestId('map-svg-fields')).toContainText('1 of 9');

  await shot(page, '10-vote-mapping');
  await intoProduction(page, 'Members vote', 'Club AGM');
  await settleDurableWrites(page);

  // THE BUTTONS ARE THE CATALOG LIVE VOTE'S, compiled from the arc this board carries — and the
  // catalog's automatic 20-second window is deliberately NOT one of its arrows here, because a
  // real audience votes over minutes and an arrow nobody drew must not close the vote under the
  // operator.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Close voting');
  await expect(actions).toContainText('Show result');
  await expect(actions).toContainText('Call the winner');

  // ── The vote itself, from the audience workspace ────────────────────────────────────────────
  const audience = await openWorkspace(page, 'audience');
  await audience.getByTestId('audience-round-question').fill('Which way should the club vote?');
  await audience.getByTestId('audience-round-options').fill('Keep the crest\nNew crest\nPut it to members');
  await audience.getByTestId('audience-round-open').click();
  await expect(audience.getByTestId('audience-round-live')).toHaveText('Which way should the club vote?');

  // Votes arrive. The simulator is the LOCAL provider's, present exactly where simulating is
  // meaningful — which is what lets this whole walk run with no backend.
  await audience.getByTestId('audience-simulate-votes').click();
  await expect(audience.getByTestId('audience-tally-0')).toHaveText('2', { timeout: 10_000 });

  // THE PERCENTAGES WAIT FOR SHOW RESULT UNLESS THIS PRODUCTION SAYS OTHERWISE — off, and the
  // checkbox that turns it on (owner ruling, 2026-08-30: *"Usually people will use it just to
  // show the results… we should give that possibility to those who want it"*). OFF BY DEFAULT IS
  // AS MUCH THE CONTRACT AS ON-BY-CHOICE, so it is asserted before anything is ticked.
  await expect(audience.getByTestId('audience-live-figures')).not.toBeChecked();

  // STAGING WRITES A CUE AND STOPS. That is the structural half of "nothing viewer-written airs
  // without an operator": the counts are ordinary field values on an ordinary cue, and the board
  // this one found is the imported one — matched by the field TITLES the behaviour owns.
  await audience.getByTestId('audience-round-stage').click();
  await expect(audience.getByTestId('audience-note')).toContainText('Take it');
  const staged = await audience.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const cue = loadShows()[0].cues?.find((c) => c.label.startsWith('Vote —'));
    return cue ? cue.values : null;
  });
  expect(Object.values(staged ?? {})).toContain('Keep the crest | 2\nNew crest | 1\nPut it to members | 1');
  // …and the live-figures field is written on EVERY stage, not only when it is on: a production
  // that unticks the box mid-round has to be able to take the percentages back off air, which a
  // value written in one direction only cannot say. Empty is the board's own default.
  expect(staged?.f5).toBe('');
  await settleDurableWrites(audience);

  // Back on the rundown — the cue was written from the other tab, so this one re-reads it.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await page.locator('.pd-cue', { hasText: 'Vote —' }).getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');

  const air = page.frameLocator('[data-testid="program-stage"] iframe');

  // THE ROUND'S OWN WORDING IS ON THE DESIGNER'S LAYERS. Nothing was typed into a field for this:
  // the options came from the round, through the wire, into the layers the pickers named.
  await expect(air.locator('[data-noacg-role~="option/1"]')).toHaveText('Keep the crest');
  await expect(air.locator('[data-noacg-role~="option/3"]')).toHaveText('Put it to members');
  await expect(air.locator('[data-noacg-role~="question"]')).toHaveText('Which way should the club vote?');

  // …AND THE BAR MOVED, WITHOUT A TRANSITION. Data never causes a state change, so the growth
  // happens inside the state the board is already in: 2 of 4 votes is half the length the
  // designer drew, and the drawn length is what 100% means on this board.
  await expect
    .poll(async () => Math.round(Number(await air.locator('[data-noacg-role~="bar/1"]').getAttribute('width'))), { timeout: 10_000 })
    .toBe(500);
  await expect
    .poll(async () => Math.round(Number(await air.locator('[data-noacg-role~="bar/2"]').getAttribute('width'))))
    .toBe(250);

  // The badge is up because the vote is open, and the figures are NOT — they are the result's
  // beat, exactly as on a catalog vote board.
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('[data-noacg-role~="percent/1"]')).not.toHaveClass(/imported-design-on/);
  await shot(page, '11-vote-open');

  // ── THE BADGE FILLS ITS PILL, AND NO LENGTH CAN STRAND IT (owner walk, 2026-09-03) ──────────
  //
  // *"I made it even longer and updated it, the whole badge disappeared. Now I made the badge
  // text shorter, and it doesn't reappear, so I broke the graphic now."* What he was watching is
  // the sideways room a CENTRED line gets: both gaps beside a centred word are half the leftover
  // by construction, so mirroring them handed this line back its own 142 units inside a 260-unit
  // pill. One extra word cost it a quarter of its size; two floored it at 55% and squeezed it
  // into the same 142 units, which on air is a smear rather than a badge (svg.ts, svgAlignOf).
  //
  // Driven from the CUE EDITOR because that is where he typed, and read off the PROGRAM stage
  // because that is what aired. The badge text is the one artwork layer the vote does not write.
  const badgeText = page.getByTestId('cue-field-f0');
  const badgeSize = async () =>
    Number(await air.locator('#f0').evaluate((el) => parseFloat(getComputedStyle(el).fontSize)));

  // The baseline is TYPED rather than inherited: this cue was written by the audience round, which
  // fills the vote's own five fields and says nothing about the badge, so what f0 holds here is
  // whatever that path left. Sending the drawn words makes the size below the design's own.
  await badgeText.fill('VOTE NOW');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('#f0')).toHaveText('VOTE NOW');
  const drawnSize = await badgeSize();
  expect(drawnSize).toBeGreaterThan(0);

  // A longer phrase the pill genuinely holds keeps the size the designer chose.
  await badgeText.fill('PLEASE VOTE');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('#f0')).toHaveText('PLEASE VOTE');
  expect(await badgeSize()).toBe(drawnSize);

  // Past what the pill can hold, every rung below is exactly where it was: it floors, it is
  // squeezed INTO the pill rather than painted over the artwork, it is reported to the operator,
  // and the badge itself is still on air. Hiding a layer is not one of the ladder's rungs.
  await badgeText.fill('PLEASE CAST YOUR VOTE RIGHT NOW EVERYBODY IN THIS ROOM');
  await page.getByTestId('verb-update').click();
  await expect(page.getByTestId('cue-overflow')).toContainText('too long for the design');
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('#f0')).toBeVisible();

  // AND IT COMES BACK. The one thing that made this destructive rather than merely ugly is that
  // he could see no way out of it short of re-importing the file.
  await badgeText.fill('VOTE NOW');
  await page.getByTestId('verb-update').click();
  await expect(page.getByTestId('cue-overflow')).toHaveCount(0);
  await expect(air.locator('#f0')).toHaveText('VOTE NOW');
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);
  expect(await badgeSize()).toBe(drawnSize);

  // EVERYTHING A FOREIGN CONTROLLER NEEDS IS IN A FIELD. Over the OGraf Server API a graphic's
  // action responses carry a step and a status string and nothing of the graphic's own state, so
  // machine state does not cross that boundary and fields are the only thing that does
  // (docs/OGRAF_STATE_IN_FIELDS.md). The counts ride the Options field; whether the vote is still
  // running rides a field of its OWN. Editing that ONE FIELD closes the board's VOTE NOW badge,
  // with no event dispatched.
  // Update, not Take: typing into a live cue edits the draft, and the operator sends it. That is
  // the ordinary field road, which is the point — nothing about this is a poll mechanism.
  const count = page.getByTestId('cue-field-f3');
  const status = page.getByTestId('cue-field-f4');
  await expect(count).toHaveValue(/voting open/);
  await expect(status).toHaveValue('open');

  // ── ONE FIELD, ONE FACT ─────────────────────────────────────────────────────────────────────
  //
  // THE COUNT LINE IS COPY A HUMAN READS, AND NOTHING OBEYS ITS WORDING. The status used to ride
  // INSIDE it — the dashboard wrote "4 votes · voting closed" and the graphic's runtime pattern-
  // matched the word back out — so a station writing its own language, or an operator rewording
  // the line while rehearsing, got a board saying VOTE NOW straight through a closed vote, on
  // air, with nothing anywhere reporting the fault (docs/OGRAF_STATE_IN_FIELDS.md R7). Both
  // halves of this pair fail on that shape: the reworded line must not move the badge, and the
  // token must close the vote while the sentence beside it says the opposite in Finnish.
  await count.fill('4 ääntä · äänestys suljettu');
  await page.getByTestId('verb-update').click();
  // The line has to LAND before "the badge did not move" means anything: the badge is already lit,
  // so asserting it alone would pass just as well if the update never reached the renderer at
  // all. The total is the designer's own layer, written from this very field, so waiting on it is
  // what makes the badge assertion below a real one.
  await expect(air.locator('[data-noacg-role~="total"]')).toHaveText('4 ääntä · äänestys suljettu');
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);

  await status.selectOption({ value: 'closed' });
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="badge"]')).not.toHaveClass(/imported-design-on/);

  // …and it follows the data rather than latching: the machine is still in the voting state, so
  // a controller that puts the vote back on gets its badge back. Pressing Close voting is the
  // sticky one, because that leaves the state.
  await status.selectOption({ value: 'open' });
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);

  // THE OLD SENTENCE STILL CLOSES A BOARD THAT STATES NOTHING ELSE. A board saved or exported
  // before the status field existed carries only the count line, and a board that suddenly
  // ignored its own status line would be a worse failure than the one above — so an unstated
  // status falls back to reading the line, exactly as it always did.
  await status.selectOption({ value: '' });
  await count.fill('4 votes · voting closed');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="badge"]')).not.toHaveClass(/imported-design-on/);

  await count.fill('4 votes · voting open');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);

  // ── THE FIGURES, LIVE OR HELD ───────────────────────────────────────────────────────────────
  //
  // The owner's ruling of 2026-08-30: most shows put a vote board up to REVEAL a result, so the
  // percentages are the result's beat and the board stays a question until the operator answers
  // it — and a show that wants the numbers moving on air ticks one checkbox. Both directions are
  // pinned, because "off by default" is the half a future change is most likely to lose.
  //
  // It rides a FIELD, exactly like the status above and for the same wire reason: machine state
  // does not cross the OGraf boundary and fields do. So this is an ordinary field update, which
  // is also the point — a data write, firing no transition, with the board still in `voting`.
  const figures = page.getByTestId('cue-field-f5');
  await expect(figures).toHaveValue('');
  await expect(air.locator('[data-noacg-role~="percent/1"]')).not.toHaveClass(/imported-design-on/);
  await figures.selectOption({ value: 'live' });
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="percent/1"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('[data-noacg-role~="percent/1"]')).toHaveText('50%');
  // The vote is still open and still says so — turning the figures on is not the result.
  await expect(air.locator('[data-noacg-role~="badge"]')).toHaveClass(/imported-design-on/);
  await shot(page, '11b-vote-live-figures');

  // …and it follows the field back off, so a production can change its mind without a reload.
  await figures.selectOption({ value: '' });
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="percent/1"]')).not.toHaveClass(/imported-design-on/);

  // Closing takes the badge and nothing else: a closed vote still shows what came in.
  await page.getByRole('button', { name: /Close voting/ }).click();
  await expect(air.locator('[data-noacg-role~="badge"]')).not.toHaveClass(/imported-design-on/);
  await expect.poll(async () => Math.round(Number(await air.locator('[data-noacg-role~="bar/1"]').getAttribute('width')))).toBe(500);

  await page.getByRole('button', { name: /Show result/ }).click();
  await expect(air.locator('[data-noacg-role~="percent/1"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('[data-noacg-role~="percent/1"]')).toHaveText('50%');
  await expect(air.locator('[data-noacg-role~="percent/2"]')).toHaveText('25%');
  await shot(page, '12-vote-result');

  // The winner is the designer's own arrow, and only the leader gets it — a tie would get none.
  await page.getByRole('button', { name: /Call the winner/ }).click();
  await expect(air.locator('[data-noacg-role~="winner/1"]')).toHaveClass(/imported-design-on/);
  await expect(air.locator('[data-noacg-role~="winner/2"]')).not.toHaveClass(/imported-design-on/);
  await shot(page, '13-vote-called');

  // ── THE ROUND THAT DOES NOT FIT THE BOARD ───────────────────────────────────────────────────
  //
  // A student draws three rows and the show runs a five-option round. Every figure the board
  // paints is still TRUE — each row's share of the WHOLE vote, which is why three bars visibly
  // fail to fill the board — but the row that WON can be one the designer never drew, and the
  // board used to say nothing about that. It aired as a plausible three-way dead heat on a vote
  // that was a landslide, and the winner mark simply never appeared, with no explanation anywhere.
  //
  // Two things answer it and neither invents artwork. The winner is never called on a row that
  // was not drawn — silence beats a mark on the best of the rows that happened to fit. And the
  // OPERATOR is told, through the channel that already exists for a value the design cannot hold
  // (`noacgTextOverflow()`), naming the field that overflowed: Options.
  //
  // Asserted from the CALLED state on purpose: the winner has already been called on this board,
  // so what is being pinned is the repaint — the same data write that brings the bigger round in
  // is what has to take the now-wrong mark back off.
  await count.fill('13 votes · voting open');
  await page
    .getByTestId('cue-field-f2')
    .fill('Keep the crest | 1\nNew crest | 1\nPut it to members | 1\nAsk the committee | 1\nAbolish the crest | 9');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="percent/1"]')).toHaveText('7.7%');   // its true share of all 13 votes
  // "Abolish the crest" took 9 of the 13 and is not on this board, so NO row is marked.
  for (const row of [1, 2, 3]) {
    await expect(air.locator(`[data-noacg-role~="winner/${row}"]`)).not.toHaveClass(/imported-design-on/);
  }
  await expect(page.getByTestId('cue-overflow')).toContainText('Options', { timeout: 15_000 });
  await expect(page.getByTestId('cue-overflow')).toContainText('too long for the design');
  await shot(page, '14-vote-overflow');

  // The warning is a REPORT, not a latch: a round that fits again clears it, and the winner —
  // now a row the designer did draw — is marked exactly as before.
  await page.getByTestId('cue-field-f2').fill('Keep the crest | 1\nNew crest | 1\nPut it to members | 9');
  await count.fill('11 votes · voting open');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('[data-noacg-role~="winner/3"]')).toHaveClass(/imported-design-on/);
  await expect(page.getByTestId('cue-overflow')).toBeHidden({ timeout: 15_000 });
});

test('imported countdown: the take starts it, and the operator holds, resumes and resets it', async ({ page }) => {
  // THE FIFTH BEHAVIOUR (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13), and the first one whose paint is
  // driven by NEITHER the machine nor update(): the seconds change on a runtime tick, four times a
  // second, with nothing else happening. So the assertions below reach into the on-air renderer
  // and read the clock itself, not just the classes - a countdown that says the wrong time is the
  // only failure this graphic can really have.
  test.slow(); // the import, a production, a take, and a count that has to be watched go down
  await openImportDoor(page, TIMER_SVG);

  // THE PROPOSAL, as for the other three. A designer who named layers the way
  // docs/SVG_AUTHORING.md section 5b tells them to opens this step with every picker filled.
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('timer');
  await expect(page.getByTestId('map-svg-timer-bar').locator('option:checked')).toHaveText('Timer bar');
  // The three moments are switched off in the file, which is how a reader tells a moment from base
  // artwork in a list of groups.
  await expect(page.getByTestId('map-svg-timer-warning').locator('option:checked')).toHaveText('Warning (hidden)');
  await expect(page.getByTestId('map-svg-timer-paused').locator('option:checked')).toHaveText('Paused (hidden)');
  await expect(page.getByTestId('map-svg-timer-expired').locator('option:checked')).toHaveText('Time up (hidden)');

  // THE CLOCK IS ARMED BY THE PROPOSAL ITSELF (draft.ts `armTimerClock`), and this is the
  // assertion that keeps the two doors honest. The one thing a countdown cannot run without is a
  // layer bound as a COUNTDOWN, and that choice lives in the field list rather than in the
  // behaviour's own pickers - so a proposal that filled in four drawings and left the clock as
  // plain text would open the step on a binding that reports a gap the instant it appears.
  const clock = await rowLabelled(page, /^Clock$/);
  await expect(page.getByTestId(`map-svg-kind-${clock}`)).toHaveValue('countdown');
  await expect(page.getByTestId('map-svg-behaviour-missing')).toHaveCount(0);

  // NOTHING IS TAKEN AWAY FROM THE OPERATOR - the difference from the vote board. The kicker and
  // the note are still theirs to type; the clock layer is the readout, so its own field is the
  // LENGTH in minutes rather than the text (svg.ts), which is why it is a number field.
  await expect(page.getByTestId('map-svg-poll-driven')).toHaveCount(0);
  await expect(page.getByTestId('map-svg-fields')).toContainText('3 of 3');

  await shot(page, '20-timer-mapping');
  await intoProduction(page, 'Question timer', 'Friday Quiz');
  await settleDurableWrites(page);

  // THE BUTTONS ARE THE MACHINE'S: one Start covering both "go again" and "go from the top", a
  // Pause, and a Reset. `docs/BEHAVIOUR_SURVEY.md` is where that trio comes from - ten of the
  // seventeen products it reads ship a timer, and this is what they agree on.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toContainText('Start');
  await expect(actions).toContainText('Pause');
  await expect(actions).toContainText('Reset');

  // …and the LENGTH is an ordinary number field beside them, so an operator can correct it on air
  // with the same stepper every other number gets. That is the whole reason the clock stayed the
  // artwork's own field rather than becoming a behaviour-owned holder.
  await expect(page.getByTestId('live-numbers')).toContainText('Clock (minutes)');
  // Five minutes, converted from the "5:00" the designer DREW (assets/svgImport clockSampleMinutes)
  // rather than typed by anybody.
  await expect(page.getByTestId(`cue-field-f1`)).toHaveValue('5');

  // ── THE TAKE STARTS THE COUNT ───────────────────────────────────────────────────────────────
  //
  // The owner ruling this behaviour was built to (docs/OWNER_RULINGS.md,
  // operator-stories-2026-08-27): "duration set beforehand, starts on TAKE". Read off the RENDERER
  // rather than off the machine, because the clock is the one thing here no state can vouch for.
  const air = page.frameLocator('[data-testid="program-stage"] iframe');
  const readout = air.locator('.imported-design-clock');
  const lit = (role: string) => expect(air.locator(`[data-noacg-role~="${role}"]`)).toHaveClass(/imported-design-on/);
  const dark = (role: string) => expect(air.locator(`[data-noacg-role~="${role}"]`)).not.toHaveClass(/imported-design-on/);

  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('action-log')).toContainText('Took');
  // Nothing is lit on arrival: the entrance is not a verdict, and every drawn state starts hidden.
  await dark('paused');
  await dark('warning');
  await dark('expired');
  // It is COUNTING - the readout has left 5:00 on its own, with no press and no update().
  await expect(readout).not.toHaveText('5:00', { timeout: 4000 });

  // AND THE BAR THE DESIGNER DREW IS DRAINING WITH IT. This is the L4 half - the layer with no
  // separate looks, drawn at its FULL length and interpolated - reaching a second behaviour after
  // the vote board. Read as a real width off the renderer rather than as a class, because a bar
  // is the one drawn layer whose whole meaning is a number: the designer drew it 520 wide, so 520
  // is the whole count and anything less is time spent.
  // POLLED, never sampled once: `renderClock` writes the digits synchronously and only SCHEDULES
  // the bar's tween, which first touches the attribute on the next animation frame - so a single
  // read taken right after the readout assertion can still catch the drawn 520.
  const barWidth = async () => Number(await air.locator('[data-noacg-role~="bar"]').getAttribute('width'));
  await expect.poll(barWidth).toBeLessThan(520);
  const drainedTo = await barWidth();
  await page.waitForTimeout(1200);
  await expect.poll(barWidth).toBeLessThan(drainedTo);
  await shot(page, '21-timer-running');

  // ── PAUSE HOLDS IT, AND THE DESIGNER'S OWN MARK SAYS SO ─────────────────────────────────────
  //
  // The held mark is the one thing here that IS a state: the operator pressed a button. Both
  // halves are read, because either could be right while the other is wrong - the mark could show
  // over a clock still running, or the clock could stop with nothing on screen saying why.
  await page.getByTestId('cue-action-pause').click();
  await lit('paused');
  const heldAt = await readout.textContent();
  await page.waitForTimeout(1500);
  await expect(readout).toHaveText(heldAt ?? '');
  await shot(page, '22-timer-held');

  // Start again from where it was held - NOT from the top. `resumeClock` re-anchors the deadline
  // to the remaining time, which is the whole difference between a pause and a stop.
  await page.getByTestId('cue-action-start').click();
  await dark('paused');
  await expect(readout).not.toHaveText(heldAt ?? '', { timeout: 4000 });

  // ── RESET PUTS IT BACK TO THE TOP, AND STOPS IT THERE ───────────────────────────────────────
  //
  // This is why `armed` had to be a third state rather than a second way into `running`: an
  // event's effect is the destination state's calls, so Start and Reset landing in one state would
  // necessarily do the same thing. Held for a second and re-read, because "back at 5:00" would
  // also be true for one frame of a clock that had restarted and was counting down again.
  await page.getByTestId('cue-action-reset').click();
  await expect(readout).toHaveText('5:00');
  await page.waitForTimeout(1500);
  await expect(readout).toHaveText('5:00');
  await dark('paused');
  // The bar is full again, and it is the FULL length the designer drew rather than the length of
  // whatever the last pass left. That is the one thing a remembered measurement can get wrong:
  // re-reading the drawn length after a pass would let a drained bar become the new 100%, so a
  // board that ever ran down could never fill again.
  await expect.poll(barWidth).toBe(520);
  await shot(page, '23-timer-armed');

  // ── THE LAST STRETCH AND THE TIME-UP PLATE ARE DATA, NOT STATES ──────────────────────────────
  //
  // Nothing in the model could enter them honestly: an authored timer edge is a fixed `after`
  // armed when its state is entered, so it could not follow a count the operator pauses or resets.
  // They are painted from the clock's own hook instead, which is this behaviour's one finding.
  // Proved by shortening the count rather than by waiting five minutes: the LENGTH is data, so
  // typing a new one re-arms the clock with no transition firing at all (the 2026-08-29 owner
  // walk, in templates/shared/clock.ts).
  //
  // 0.15 minutes is nine seconds - inside the shipped ten-second warning threshold from its very
  // first tick, which is exactly the case the default was chosen against (timerBehaviour.ts).
  await page.getByTestId('cue-field-f1').fill('0.15');
  await page.getByTestId('verb-update').click();
  await page.getByTestId('cue-action-start').click();
  await lit('warning');
  await dark('expired');
  // AND THE CLOCK IS STILL READABLE THROUGH IT. Found by looking at a frame rather than by an
  // assertion: the first version of this artwork drew the red panel ABOVE the text with its own
  // copy of "5:00" inside it, so every class assertion here passed while the board on air showed a
  // frozen five minutes over a clock counting down underneath. A last-stretch look whose whole
  // job is to make you watch the seconds must not be the thing hiding them
  // (docs/SVG_AUTHORING.md section 5b, "put the words last").
  await expect(readout).toHaveText(/^0:0\d$/);
  await shot(page, '24-timer-warning');

  // …and at zero it HOLDS at 0:00 until it is taken out, which is the second half of the same
  // owner ruling. The plate comes up and the warning goes, because they are one decision made in
  // one place rather than two conditions that could both be true.
  await expect(readout).toHaveText('0:00', { timeout: 15_000 });
  await lit('expired');
  await dark('warning');
  await shot(page, '25-timer-up');

  // …AND AN UNRELATED UPDATE DOES NOT UN-FINISH IT. This is the half the owner ruling is really
  // about ("HOLDS at 0:00 until taken out"), and the shared clock runtime does not hold it alone:
  // reaching zero calls stopClock(), which clears `clockPaused` as well as the interval, so the
  // next clockDataUpdated() takes its "not counting, not paused" branch and re-derives the full
  // length from the field - whatever the operator actually changed. Correcting a caption while the
  // board holds at 0:00 used to put the whole count back on screen with nothing having restarted.
  // The behaviour refuses to repaint that (timerBehaviour.ts `timerRanOut`); the runtime defect
  // itself reaches every catalog countdown and is filed separately.
  await page.getByTestId('cue-field-f2').fill('Kiitos');
  await page.getByTestId('verb-update').click();
  await expect(air.locator('#f2')).toHaveText('Kiitos');
  await lit('expired');
  await expect.poll(barWidth).toBe(0);

  // A NEW LENGTH, though, IS a different count - which is the shared runtime's own intent, read
  // off the total this behaviour is already handed rather than off a second signal.
  await page.getByTestId('cue-field-f1').fill('2');
  await page.getByTestId('verb-update').click();
  await dark('expired');
});

test('imported countdown: changing your mind puts the clock layer back to plain text', async ({ page }) => {
  // THE ARMING HAS TO BE SYMMETRIC OR IT IS A TRAP, and nothing downstream would catch it: whether
  // a layer ticks is read off the ROW, never off the behaviour (`draftToOptions`, then
  // `countdownIndex` in importedDesign/svg.ts). So a designer who picks Countdown to see what it
  // offers and then changes their mind used to ship a graphic whose clock counted down on air and
  // whose text field had silently become a length in minutes.
  await openImportDoor(page, TIMER_SVG);
  const clock = await rowLabelled(page, /^Clock$/);
  const kind = page.getByTestId(`map-svg-kind-${clock}`);

  // The proposal armed it (draft.ts `armTimerClock`).
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('timer');
  await expect(kind).toHaveValue('countdown');

  // Backing out puts it back, and the step stops claiming a countdown is coming.
  await page.getByTestId('map-svg-behaviour-kind').selectOption('none');
  await expect(kind).toHaveValue('text');
  await expect(page.getByTestId('map-svg-timer-bar')).toHaveCount(0);

  // AN ANSWER THE AUTHOR GAVE THEMSELVES IS NEVER TAKEN AWAY, which is the other half of the rule
  // and the reason the arming leaves a mark rather than being re-derived. Set the row by hand,
  // pick the behaviour, leave it again: their choice is still there.
  await kind.selectOption('countdown');
  await page.getByTestId('map-svg-behaviour-kind').selectOption('timer');
  await expect(kind).toHaveValue('countdown');
  await page.getByTestId('map-svg-behaviour-kind').selectOption('none');
  await expect(kind).toHaveValue('countdown');
});

test('imported quiz: the behaviour survives the export and runs standalone from a file', async ({ page }, testInfo) => {
  // EXPORT IS WHERE AN IMPORTED GRAPHIC STOPS BEING OURS. Everything above runs inside the app;
  // this asserts the same board works as a folder on a playout machine, with no NoaCG around it.
  // Driven over file:// on purpose — the trap this catches is a reference that silently resolves
  // in the dev server and dangles on disk (docs/VERIFICATION.md).
  await openImportDoor(page, QUIZ_SVG);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });

  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'CasparCG export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));

  // The graphic's own HTML, whatever the package called the folder.
  const htmlPath = Object.keys(zip.files).find((n) => n.endsWith('.html') && !n.includes('controlpanel'))!;
  expect(htmlPath).toBeTruthy();
  const html = await zip.file(htmlPath)!.async('string');

  // THE DRAWN LOOKS TRAVELLED: the designer's layers, our role stamps, the rules that hide
  // them, the table that says when each shows and the runtime that reads it — all inside the
  // one file (docs/SVG_BEHAVIOUR_PLAN.md §5).
  for (const token of ['answer.selected/A', 'answer.selected/B', 'answer.selected/C', 'answer.selected/D', 'answer.correct/C', 'answer.wrong/A', 'locked']) {
    expect(html).toContain(`data-noacg-role="${token}"`);
  }
  expect(html).toContain('.imported-design-look');
  expect(html).toContain('var NOACG_BEHAVIOUR = ');
  expect(html).toContain('function noacgRepaint(');
  // THE MACHINE TRAVELLED: it lives in the template's own data block, so the arcs and their
  // operator events are in the file rather than in a registry the playout machine cannot ask.
  expect(html).toContain('"machine"');
  for (const event of ['select', 'lock', 'judge']) expect(html).toContain(`"event": "${event}"`);

  // Unpack the whole package and run the graphic the way CasparCG does: as a local file.
  const dir = testInfo.outputPath('caspar');
  for (const [name, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const target = nodePath.join(dir, name);
    mkdirSync(nodePath.dirname(target), { recursive: true });
    writeFileSync(target, await entry.async('nodebuffer'));
  }
  // Listening BEFORE the navigation, or the check could never fire — which is the shape of a
  // guard that passes for the wrong reason.
  const missing: string[] = [];
  page.on('requestfailed', (r) => missing.push(r.url()));
  await page.goto(pathToFileURL(nodePath.join(dir, htmlPath)).href);

  const lit = () => page.locator('.imported-design-look.imported-design-on');
  await page.evaluate(() => {
    const w = window as unknown as { play?: () => void; update?: (d: string) => void };
    w.play?.();
    w.update?.(JSON.stringify({ f5: 'C', f6: 'B' }));
  });
  // Nothing is lit until a state says so — the entrance is not a verdict.
  await expect(lit()).toHaveCount(0);

  const fire = (event: string) =>
    page.evaluate((e) => {
      (window as unknown as { noacgDispatch?: (n: string) => void }).noacgDispatch?.(e);
    }, event);

  await fire('select');
  await expect(page.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await fire('lock');
  await expect(page.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/);
  await fire('judge');
  await expect(page.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);
  await expect(page.locator('[data-noacg-role~="answer.wrong/A"]')).toHaveClass(/imported-design-on/);
  await shot(page, '7-quiz-exported-standalone');

  // Nothing reached for the network or for a file the package does not carry.
  expect(missing).toEqual([]);
});

test('imported board: copy the design cannot hold is WARNED about on the cue editor, never clipped', async ({ page }) => {
  // THE SECOND HALF OF THE OWNER'S FIT RULING (2026-08-23, docs/SVG_IMPORT_PLAN.md §3): a value
  // longer than the design was drawn for fills the panel, wraps into the room the artwork has
  // and shrinks to the readability floor - and past that it is WARNED ABOUT, never cut and never
  // allowed to reshape the artwork. The ladder shipped with only the first half built: the
  // runtime knew (noacgTextOverflow()) and no operator surface read it, so a too-long title
  // floored at 55% and ran off the board with nothing said before air.
  //
  // The warning is measured on the CUE EDITOR because that is where the value is typed. It comes
  // from the PREVIEW monitor's own report - the rendered graphic is the only thing that can
  // answer whether copy fits, which is why no source check stands in for this.
  await openImportDoor(page, QUIZ_SVG);
  await intoProduction(page, 'Overflow quiz', 'Warning Night');
  await settleDurableWrites(page);

  const question = page.getByTestId('cue-field-f0');
  const note = page.getByTestId('cue-overflow');

  // A question the board holds says nothing. The guard has to be verified quiet before it is
  // verified loud, or "it warns" would also be true of a surface that always warns.
  await question.fill('Which city hosted the first modern Olympics?');
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId('cue-field-over-f0')).toHaveCount(0);

  // …and one no size can hold does. 400 characters is the value the ladder floors at 55% of the
  // drawn size (e2e/import-svg.spec.ts measures that end of it); here the claim is that the
  // operator is TOLD, in the box they are typing into and once at the top of the editor.
  await question.fill('A'.repeat(400));
  await expect(note).toContainText('too long for the design');
  await expect(note).toContainText('Question');
  await expect(page.getByTestId('cue-field-over-f0')).toBeVisible();
  await shot(page, '8-overflow-warned');

  // The copy is whole in the graphic - warned about, not trimmed to make the warning go away.
  const air = page.frameLocator('[data-testid="production-preview"] iframe');
  await expect(air.locator('#f0')).toHaveText('A'.repeat(400));

  // Shortening it clears the warning, so it tracks the value rather than latching on the cue.
  await question.fill('Which city?');
  await expect(note).toHaveCount(0);
  await expect(page.getByTestId('cue-field-over-f0')).toHaveCount(0);
});

test('imported board: the EXPORTED CONTROLLER carries the same warning, in the same words', async ({ page, context }) => {
  test.setTimeout(180_000);
  // PARITY IS THE POINT (docs/CONTROL_PANEL_PARITY.md §4): a warning only the in-app cockpit
  // shows is a warning a class operating from the exported package never sees, and the package
  // is the surface a show drops to when the network dies. This page ships without React, so its
  // copy of the sentence is BAKED from the same constants (controlModel.ts) rather than written
  // again - and only a driven controller can prove the baked half actually paints.
  //
  // It reads its own PREVIEW monitor: those frames are ordinary same-origin pages the controller
  // built, so the answer comes from the running graphic exactly as it does in the app.
  await openImportDoor(page, QUIZ_SVG);
  await intoProduction(page, 'Overflow quiz', 'Relay Night');
  await page.getByTestId('cue-field-f0').fill('A'.repeat(400));
  await expect(page.getByTestId('cue-overflow')).toContainText('too long for the design');
  await settleDurableWrites(page);

  const b64 = await page.evaluate(async (production) => {
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const fresh = shows.loadShows().find((s) => s.name === production)!;
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  }, 'Relay Night');

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    // The package folder is named after the production, not a fixed slug. Text files only -
    // the relay helper serves strings, and a single-file overlay carries its assets inline.
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
      files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
    }
  }
  const { serve } = relayServe(files);
  const origin = 'http://relay-overflow.local';

  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });

  // Nothing is on PREVIEW yet, so nothing is claimed. Quiet before loud, here too.
  await expect(ctl.locator('#ed-over')).toBeHidden();

  await ctl.locator('.cue').first().click();
  await ctl.locator('#v-preview').click();
  await expect(ctl.frameLocator('#stage-pvw iframe').locator('#f0')).toHaveText('A'.repeat(400), {
    timeout: 10_000,
  });

  // …and once the graphic is up with the copy it cannot hold, the operator is told - by the
  // summary and by the box, the same two places the app says it.
  await expect(ctl.locator('#ed-over')).toContainText('too long for the design', { timeout: 10_000 });
  await expect(ctl.locator('.field-over .over-mark')).toBeVisible();
  await shot(ctl, '9-overflow-warned-controller');
});

// ── The fallback surface: the CasparCG package's own standalone panel ──────────────────────
//
// THE DAY THE PLAYOUT MACHINE IS NOT THERE. A class that has exported its board for CasparCG has
// one folder and a browser, and `controlpanel.html` is the only operator surface left in it - no
// app, no rundown, no network. Both graphics the 2026-09-12 production runs are imported SVG
// boards, so this is where they land if the room's setup fails.
//
// It could not work at all until 2026-09-04: the CasparCG target wrote four files and none of
// them was a control panel, so the panel a student went looking for was not in the zip. Measured
// as "an imported design's panel does not pair", which it was not - the same target failed a
// catalog graphic identically, and the same imported board paired immediately out of the SPX
// package (docs/backlog/exported-panel-does-not-pair-with-an-imported-design.md).
//
// Both boards are walked, because "it pairs" is not the claim - the claim is that every verb the
// student needs arrives at the graphic. A test that only proves pairing proves the class can see
// a panel, not that they can use it.

/** Export the open project as a CasparCG package and open the graphic and its bundled panel on
 *  one fake origin - the same recipe `e2e/control.spec.ts` uses for the SPX package, which is
 *  what makes the two comparable. */
async function casparPackageOnAir(
  page: Page,
  context: BrowserContext,
  origin: string,
): Promise<{ air: Page; panel: Page }> {
  await page.getByTestId('dock-tab-export').click();
  await page.locator('.issue', { hasText: 'CasparCG export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const graphicFile = [...files.keys()].find((n) => n.endsWith('.html') && n !== 'controlpanel.html')!;
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '') || graphicFile;
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'not in the package' });
    return route.fulfill({ status: 200, contentType: 'text/html', body });
  };

  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${graphicFile}`, { waitUntil: 'load' });
  const panel = await context.newPage();
  await routeOrigin(panel, origin, serve);
  await panel.goto(`${origin}/controlpanel.html`, { waitUntil: 'load' });

  // PAIRED, and said so by the panel's own footer rather than by us. The two symptoms the
  // original repro recorded were the ABSENCE of these elements, so they are asserted by presence
  // and by content - `toBeHidden` would not do, because it also passes for an element that is
  // not in the document at all, which is exactly what a 404 body has.
  await expect(panel.locator('#status')).toContainText('connected', { timeout: 20_000 });
  await expect(panel.locator('.state-chip').first()).toBeVisible();
  // The "nothing is answering" banner exists on this page and is NOT showing. Read after the
  // panel's own 2500 ms grace period, or the check would pass simply by being early.
  await expect(panel.locator('#nolisten')).toHaveCount(1);
  await panel.waitForTimeout(3000);
  await expect(panel.locator('#nolisten')).not.toBeVisible();
  return { air, panel };
}

test('CasparCG package: the standalone panel drives the imported SCORE board, reset included', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openImportDoor(page, SCORE_SVG);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });

  const { air, panel } = await casparPackageOnAir(page, context, 'http://caspar-score.local');
  const events = panel.locator('.events');
  const plusTeam1 = events.getByRole('button', { name: '⚡ +1' }).first();
  const minusTeam1 = events.getByRole('button', { name: '⚡ −1' }).first();
  // Team 1's figure on the panel and on the artwork - the same number in two places, which is
  // the whole point of the score behaviour owning no fields of its own.
  const boxTeam1 = panel.locator('.field[data-key="f2"] input.num-input');

  await panel.getByRole('button', { name: '▶ Play' }).click();

  // +1 twice, −1 once: the figure lands on the graphic AND in the operator's own box.
  await plusTeam1.click();
  await plusTeam1.click();
  await expect(air.locator('#f2')).toHaveText('2', { timeout: 10_000 });
  await expect(boxTeam1).toHaveValue('2');
  await minusTeam1.click();
  await expect(air.locator('#f2')).toHaveText('1', { timeout: 10_000 });

  // A second team, so New game has more than one figure to undo.
  await events.getByRole('button', { name: '⚡ +1' }).nth(1).click();
  await expect(air.locator('#f4')).toHaveText('1', { timeout: 10_000 });

  // NEW GAME - `MachineControl.set`, and the reason this walk exists at all. The standalone panel
  // ships without controlModel.ts and carries its own copy of the payload rule, so this is the
  // third and last surface where `set` had never been driven.
  await events.getByRole('button', { name: '⚡ New game' }).click();
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });
  await expect(air.locator('#f4')).toHaveText('0', { timeout: 10_000 });
  // The panel's own boxes moved with it. Without this half a later ⟳ Take re-sends the finished
  // game and puts the old score straight back on air.
  await expect(boxTeam1).toHaveValue('0');
  await panel.getByRole('button', { name: '⟳ Take' }).click();
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });

  await panel.close();
  await air.close();
});

test('CasparCG package: the standalone panel drives the imported QUIZ board through lock and reveal', async ({ page, context }) => {
  test.setTimeout(180_000);
  await openImportDoor(page, QUIZ_SVG);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });

  const { air, panel } = await casparPackageOnAir(page, context, 'http://caspar-quiz.local');
  const select = panel.getByRole('button', { name: '⚡ Select answer' });
  const lock = panel.getByRole('button', { name: '⚡ Lock it in' });

  // The structural guard travelled with the package: before Play nothing machine-side is legal.
  await expect(select).toBeDisabled();
  await expect(lock).toBeDisabled();

  // The answer the question is marked against, set before the round starts - a data write, which
  // never causes a transition and so can be made from anywhere.
  await panel.locator('.field', { hasText: 'Correct answer' })
    .getByRole('button', { name: 'C', exact: true }).click();

  await panel.getByRole('button', { name: '▶ Play' }).click();
  await expect(select).toBeEnabled();

  // The contestant's pick, chosen on the panel and read off the DRAWN layer in the graphic -
  // the designer's own marker, lit by the machine.
  await panel.locator('.field', { hasText: 'Selected answer' })
    .getByRole('button', { name: 'C', exact: true }).click();
  await select.click();
  await expect(air.locator('[data-noacg-role~="answer.selected/C"]')).toHaveClass(/imported-design-on/, { timeout: 10_000 });

  await lock.click();
  await expect(air.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/, { timeout: 10_000 });
  // …and the pick is structurally final. `select` has no arrow out of `locked`, and neither does
  // `revealChoice` - its only arrow leaves the hidden-pick `sealed` state, which this round never
  // entered. The guard is the graph, mirrored as greying, and it travelled in the package.
  await expect(select).toBeDisabled();
  await expect(panel.getByRole('button', { name: '⚡ Reveal choice' })).toBeDisabled();

  // The reveal, which is what a quiz is for: the designer's own correct-answer marker lights.
  await panel.getByRole('button', { name: '⚡ Reveal correct' }).click();
  await expect(air.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, { timeout: 10_000 });

  await panel.close();
  await air.close();
});
