import { test, expect, type Locator, type Page, type Route } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { createProject } from './_create';
import { settleDurableWrites } from './_durable';
import { relayServe, routeOrigin } from './_relay';
import { importProofCase } from './_proofCase';

// The production page's GRAPHIC ACTIONS block (docs/PLAYOUT_DASHBOARD.md §8): the machine's
// ⚡ buttons rendered from the metadata that travels inside the template, greyed by the
// structural guard, with the state chip naming what the greying is judged against. All of it
// offline — the verbs drive the local PROGRAM monitor, which is the same renderer the
// published output runs, so what these specs prove is what airs.

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

test('the production page re-asks for machine state, so a change it did not cause still reaches the chip', async ({ page }) => {
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  const chip = page.getByTestId('machine-state-chip');
  await page.getByTestId('verb-take').click();
  await expect(chip).toHaveText('Question');

  // DRIVE THE MACHINE BEHIND THE PAGE'S BACK. The stage posts one `{cmd:'state'}` after each
  // command it applies, so the page's picture of the machine is only ever as fresh as its own
  // last command. Anything that moves the graphic WITHOUT going through this page — a timer
  // arrow firing in the runtime, another operator's device driving the shared log, or simply a
  // reply that lost the race with the entrance it was asking about — leaves the chip stale,
  // and the ⚡ buttons are greyed against that same stale state (`isEventLegal`).
  //
  // The /output renderer has re-asked every second since it shipped (src/output/main.ts); this
  // surface had no poll at all, which is why a state that arrived wrong stayed wrong until the
  // operator pressed something else. Measured as a red quiz-pilot run whose chip read "Off"
  // through eighteen consecutive polls with no correction ever arriving.
  const handle = await page.locator('[data-testid="program-stage"] iframe').elementHandle();
  const frame = await handle!.contentFrame();
  await frame!.evaluate(() => {
    (window as unknown as { noacgDispatch: (e: string, p?: unknown) => void }).noacgDispatch(
      'select',
      { f6: 'B' },
    );
  });

  // Nobody told the page. It has to ask again — and the chip is what says it did.
  await expect(chip).toHaveText('Answer selected', { timeout: 5_000 });
});

test('a Take pressed a moment after the page opens still airs - and stays aired', async ({ page }) => {
  // EVERY OTHER SPEC HERE TAKES INSTANTLY, and that is what hid this: a real operator opens a
  // production, reads the rundown and presses Take seconds later. The local PROGRAM monitor
  // reports its machine state once a second, so by then the page knew the graphic was "off" -
  // and the boot recovery, which was keyed on `liveCue` MOVING rather than on the wire's own
  // answer, treated the operator's own first Take as a page that had opened onto a live
  // production and replayed `snap` to that stale "off". The graphic aired and went straight
  // back off: black monitor, chip reading Off, every action greyed, nothing said. Offline it
  // was every take, because with no wire `liveCue` can only move locally.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  // Past the first state poll - the window the old bug needed.
  await expect(page.getByTestId('machine-state-chip')).toHaveText('not on air');
  await page.waitForTimeout(2_000);
  await page.getByTestId('verb-take').click();

  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('.quiz')).toBeVisible();
  // And it is still there after the next few polls - a graphic that airs and then quietly
  // disappears is the same defect wearing a delay.
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  await expect(page.getByTestId('cue-action-select')).toBeEnabled();
});

test('the selected cue is still identifiable once it is on air, and the editor names which one', async ({
  page,
}) => {
  // OWNER, 2026-09-05: "if you have three graphics on air, you do not know which one you have
  // selected in the queue, so you don't know what graphic you are adjusting."
  //
  // Selection was `border-color` alone, and both tally rules set border-color further down the
  // same stylesheet - so a selected row that was on air was pixel-identical to one that was not.
  // Selection now takes an OUTLINE, which no tally touches, and the two stack. The trap in the
  // other direction is just as easy: give selection a border-color again and it wins, and the
  // row loses its red. Both are asserted here, on one row, at once.
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  const rows = page.locator('.pd-cue');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');

  const selected = rows.first();
  await expect(selected).toHaveClass(/selected/);
  await expect(selected).toHaveClass(/on-air/);

  const paint = await selected.evaluate((el) => {
    const s = getComputedStyle(el);
    return { outline: s.outlineStyle, outlineWidth: s.outlineWidth, border: s.borderColor };
  });
  // The cursor is drawn…
  expect(paint.outline).toBe('solid');
  expect(parseFloat(paint.outlineWidth)).toBeGreaterThan(0);
  // …and the tally is still red, which is the half a border-color fix would silently take away.
  expect(paint.border).toContain('239, 68, 68');

  // Non-visual, for the same reason: a tally colour tells a screen reader nothing.
  await expect(selected.getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  // And the editor says WHICH cue, by its place in the rundown - the only thing that separates
  // two cues of one graphic, which carry the same name and the same tally.
  await expect(page.locator('.pd-editor-kicker')).toHaveText(/ON-AIR CUE · 1/);
});

test('quiz actions on the production page: greying, select/lock, live update keeps the lock, snap recovers the verdict', async ({ page }) => {
  await createProject(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Quiz Night');

  const actions = page.getByTestId('cue-actions');
  const chip = page.getByTestId('machine-state-chip');
  const select = page.getByTestId('cue-action-select');
  const lock = page.getByTestId('cue-action-lock');
  const judge = page.getByTestId('cue-action-judge');
  const program = page.frameLocator('[data-testid="program-stage"] iframe');

  // The block is there, says it acts ON AIR, and every button is dead until a Take — the
  // graphic is not up, so firing anything would be a lie the runtime happens to swallow.
  await expect(actions).toBeVisible();
  await expect(actions).toContainText('act on air');
  await expect(chip).toHaveText('not on air');
  await expect(select).toBeDisabled();
  await expect(select).toHaveAttribute('title', /not on air. Take the cue first/);
  await expect(lock).toBeDisabled();
  await expect(judge).toBeDisabled();

  // TAKE. The machine enters the Question state; the guard opens exactly the arrows that
  // leave it: select, judge, and lock (the hidden-pick flow seals straight from the
  // question) — while revealChoice stays grey, its only arrow leaving `sealed`.
  await page.getByTestId('verb-take').click();
  await expect(chip).toHaveText('Question');
  await expect(select).toBeEnabled();
  await expect(judge).toBeEnabled();
  await expect(lock).toBeEnabled();
  await expect(page.getByTestId('cue-action-revealChoice')).toBeDisabled();

  // The Selected-answer dropdown renders as SEGMENTED buttons (short constrained choice).
  // Pick B in the cue editor, then fire Select — the value rides as the event's payload.
  await page.getByTestId('cue-field-f6-opt-B').click();
  await select.click();
  await expect(chip).toHaveText('Answer selected');
  await expect(lock).toBeEnabled();
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // Lock it in: the chip says so, and select GREYS — no select arrow leaves `locked`, and the
  // panel mirrors the machine's structural guard rather than guessing.
  await lock.click();
  await expect(chip).toHaveText('Locked in');
  await expect(select).toBeDisabled();
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);

  // THE RECOVERY-FIDELITY FIX (tracker G9): a live ✎ Update mid-lock must repaint the board
  // from the machine's state, not wipe the selection and the lock while the chip still says
  // "Locked in".
  await page.getByTestId('cue-field-f0').fill('Still locked after an update?');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('Still locked after an update?');
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // Fire the reveal, then SNAP back to "Locked in" — recovery, no animation. The snap fires
  // only the TARGET state's own call (applyLock); the selection belongs to the suppressed
  // intermediate `selected` state, so the highlighted pick can only come back through the
  // data half that rides with the snap (reset is two operations). Asserting quiz-sel here is
  // what proves that update actually went — a snap alone would leave the lock without a pick.
  await judge.click();
  await expect(chip).toHaveText('Reveal');
  await expect(program.locator('.quiz-correct')).toHaveCount(1);
  await page.getByTestId('machine-snap').selectOption({ label: 'Locked in' });
  await expect(chip).toHaveText('Locked in');
  await expect(program.locator('.quiz-correct')).toHaveCount(0);
  await expect(program.locator('.quiz')).toHaveClass(/quiz-locked/);
  await expect(program.locator('.quiz-option').nth(1)).toHaveClass(/quiz-sel/);

  // And back to start: every group to its initial, the visual half of reset.
  await page.getByTestId('machine-snap').selectOption({ label: '⟲ Back to start (visual reset)' });
  await expect(program.locator('.quiz-option.quiz-sel')).toHaveCount(0);
});

test('scorebug actions group by section and drive the clock; a plain lower third shows no actions block', async ({ page }) => {
  await createProject(page, { name: 'Club Scorebug' });
  await productionFor(page, 'Club Match');

  const actions = page.getByTestId('cue-actions');
  await expect(actions).toBeVisible();
  // The machine's controls carry their own sections ("Clock", "Match") — the panel renders
  // them as labelled groups, not one undifferentiated row.
  await expect(actions.locator('h4', { hasText: 'Clock' })).toBeVisible();
  await expect(actions.locator('h4', { hasText: 'Match' })).toBeVisible();

  await page.getByTestId('verb-take').click();
  const start = page.getByTestId('cue-action-clockStart');
  const stop = page.getByTestId('cue-action-clockStop');
  await expect(start).toBeEnabled();
  await expect(stop).toBeDisabled(); // armed: nothing to stop yet — the guard, mirrored

  await start.click();
  await expect(page.getByTestId('machine-state-chip')).toContainText(/running/i);
  await expect(stop).toBeEnabled();
  await expect(start).toBeDisabled();

  // Full time is destructive (one way only) and marked as such.
  await expect(page.getByTestId('cue-action-final')).toHaveClass(/destructive/);
});

test('a match board reaches every one of its controls from the cockpit: both clock verbs, the interval, the crests', async ({ page }) => {
  test.setTimeout(120_000);
  // The scorebug test above covers Start/Stop. This covers what Phase 4 actually promised an
  // operator: the REST of the surface — reset, the interval pair, and the fields a two-team
  // board carries that a strip does not (a period breakdown, club colours, two crests).
  await createProject(page, { name: 'House Match Board' });
  await productionFor(page, 'Cup Tie');

  const chip = page.getByTestId('machine-state-chip');
  await page.getByTestId('verb-take').click();

  // FOUR parallel groups, not one. The quiz pilot had a single group, so nothing until now had
  // ever rendered a chip naming several at once. It reads the four state NAMES in the machine's
  // order, never the group ids ("clock:", "play:"), which were author words an operator never saw.
  await expect(chip).toHaveText('Enter · At period start · In play · Live');
  // And it must stay on ONE line inside the header rather than reflowing the panel.
  const chipLines = await chip.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { wrap: cs.whiteSpace, height: Math.round(el.getBoundingClientRect().height) };
  });
  expect(chipLines.wrap).toBe('nowrap');
  expect(chipLines.height).toBeLessThan(30);

  // THE CLOCK, all three verbs. Reset is the one the scorebug test never reached, and it is
  // the one that makes a second half possible without reloading the graphic.
  const start = page.getByTestId('cue-action-clockStart');
  const stop = page.getByTestId('cue-action-clockStop');
  const reset = page.getByTestId('cue-action-clockReset');
  await expect(reset).toBeDisabled();            // armed already: nothing to reset back to
  await start.click();
  await expect(chip).toContainText('Clock running');
  await expect(reset).toBeEnabled();
  await stop.click();
  await expect(chip).toContainText('Clock stopped');
  await reset.click();
  await expect(chip).toContainText('At period start');
  await expect(reset).toBeDisabled();            // back where it started, and the guard says so

  // THE INTERVAL PAIR, which is a different group and must move on its own: holding the clock
  // for an injury is not half time, so these are separate facts and separate buttons.
  const interval = page.getByTestId('cue-action-interval');
  const resume = page.getByTestId('cue-action-resumePlay');
  await expect(resume).toBeDisabled();
  await interval.click();
  await expect(chip).toContainText('Interval');
  await expect(interval).toBeDisabled();
  await resume.click();
  await expect(chip).toContainText('In play');

  // THE FIELDS. A match board carries a period breakdown, two club colours and two crests, and
  // every one of them has to be editable from here — the crest pickers in particular were
  // rendering with no options at all, so a logo could be set from the hosted page and not from
  // the cockpit, which is exactly the divergence the dashboard contract forbids.
  await expect(page.getByTestId('cue-field-f6')).toBeVisible();          // period breakdown
  await expect(page.getByTestId('cue-field-f7')).toHaveAttribute('type', 'color');
  await expect(page.getByTestId('cue-field-f8')).toHaveAttribute('type', 'color');
  for (const logo of ['cue-field-f9', 'cue-field-f10']) {
    const picker = page.getByTestId(logo);
    await expect(picker).toBeVisible();
    await expect(picker).toHaveJSProperty('tagName', 'SELECT');
    // A brand-new board has no crest uploaded yet, so the honest state is an empty picker
    // that SAYS where pictures come from. That sentence is the proof the cockpit now passes
    // the graphic's picture list at all: the hint only renders when a list was supplied and
    // came back empty, so before this it could not appear however many crests existed.
    await expect(picker.locator('xpath=../..')).toContainText('add one in the editor');
  }

  // And the scores are steppers now, so a goal is one press rather than a retype.
  const scoreA = page.getByTestId('cue-field-f1');
  await expect(scoreA).toHaveAttribute('type', 'number');
  await scoreA.fill('2');
  await page.getByTestId('verb-update').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f1')).toHaveText('2');
});

test('an audience Q&A cue reveals its answer; switching to a plain cue swaps the actions away honestly', async ({ page }) => {
  // A plain lower third in the library first — the leak check needs a second, machine-less
  // graphic in the same production.
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Plain Strap');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await createProject(page, { name: 'House Q&A' });
  await productionFor(page, 'Town Hall');

  const actions = page.getByTestId('cue-actions');
  const answer = page.getByTestId('cue-action-answer');
  await expect(answer).toBeVisible();
  await expect(answer).toBeDisabled();

  await page.getByTestId('verb-take').click();
  await expect(answer).toBeEnabled();
  await answer.click();
  // The answer is a real waypoint on the walk — the event advances it, and once it has been
  // given there is no arrow to fire it again.
  await expect(answer).toBeDisabled();

  // Add the plain lower third to the SAME production and select its cue: the actions block
  // must disappear (no explicit machine — no fake controls), and come back when the Q&A cue
  // is selected again. Nothing leaks between cues.
  await page.getByTestId('add-graphic-pick').selectOption({ label: 'Plain Strap' });
  await page.getByTestId('add-graphic').click();
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(rows).toHaveCount(2);
  await rows.nth(1).locator('.pd-cue-label').click();
  await expect(actions).toBeHidden();
  await rows.nth(0).locator('.pd-cue-label').click();
  await expect(actions).toBeVisible();
  await expect(page.getByTestId('cue-action-answer')).toBeVisible();
});

test('± LIVE NUMBERS bumps a figure on air without publishing other staged edits', async ({ page }) => {
  // The podium board is the block's reason to exist: game-show points change on every
  // question, and stepper-then-✎-Update was two presses under pressure. The block itself is
  // generic — any graphic with a `number` field gets it — so this walk is also the podium
  // type's playout proof: per-contestant scores, the spotlight machine beside them.
  await createProject(page, { name: 'House Podiums' });
  await productionFor(page, 'Game Night');

  // Off air: the block renders (the template has number fields), every button waits for Take.
  const block = page.getByTestId('live-numbers');
  await expect(block).toBeVisible();
  const up = page.getByTestId('live-number-f2-up');
  await expect(up).toBeDisabled();
  // The spotlight index is an ⚡ payload field, so it gets NO bump pair — it is set by its own
  // action, and a second road to it would air a value without the state that gives it meaning.
  await expect(page.getByTestId('live-number-f9-up')).toHaveCount(0);

  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f2')).toHaveText('0');

  // Stage an edit that must NOT ride the bump: a half-typed name stays staged.
  await page.getByTestId('cue-field-f1').fill('ZO');

  await expect(up).toBeEnabled();
  await up.click();
  await up.click();

  // The bump aired — just that field. The staged name did not.
  await expect(program.locator('#f2')).toHaveText('2');
  await expect(program.locator('#f1')).toHaveText('MAYA');
  // …and the cue kept the new value, so the next ⟳ Take or ✎ Update cannot regress the score.
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('2');

  // ✎ Update still publishes the whole cue — the staged name goes to air the normal way.
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f1')).toHaveText('ZO');
  await expect(program.locator('#f2')).toHaveText('2');

  // The podium machine drives beside it: spotlight podium 2, judged by the structural guard.
  await page.getByTestId('cue-field-f9').fill('2');
  await page.getByTestId('cue-action-spotlight').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('spotlit', { ignoreCase: true });
  await expect(program.locator('.scoreboard-podium-2')).toHaveClass(/scoreboard-podium-spot/);
  // A cleared name collapses its podium — contestant count is content, not a state.
  await page.getByTestId('cue-field-f7').fill('');
  await page.getByTestId('verb-update').click();
  await expect(program.locator('.scoreboard-podium-4')).toHaveClass(/scoreboard-podium-empty/);
});

test('a scoreboard GOAL raises the flag AND moves that side\'s score on the same press', async ({ page }) => {
  // Owner, 2026-08-23, running a match live: "no reason to play the goal animation if the
  // number doesn't change". The scoreboard type's goal controls carry an `adjust` - the press
  // sends the event with that side's score moved by one as its payload, so the flag and the
  // figure land together (or not at all), the cue keeps the new figure, and the next press
  // counts from it. The ± steppers stay the correction road.
  await createProject(page, { name: 'House Score' });
  await productionFor(page, 'Derby');

  const goalA = page.getByTestId('cue-action-goalA');
  const goalB = page.getByTestId('cue-action-goalB');
  await expect(goalA).toBeDisabled(); // off air: nothing to score on yet
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f1')).toHaveText('0');
  await expect(goalA).toBeEnabled();

  // Stage an edit that must NOT ride the goal: a half-typed name stays staged.
  await page.getByTestId('cue-field-f0').fill('HOM');

  await goalA.click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Flag');
  await expect(program.locator('#f1')).toHaveText('1');
  await expect(program.locator('#f0')).toHaveText('HOME'); // the staged name did not air
  // A second goal while the flag is up: still pressable (the self-arrow), counts from 1.
  await expect(goalA).toBeEnabled();
  await goalA.click();
  await expect(program.locator('#f1')).toHaveText('2');
  await expect(program.locator('#f3')).toHaveText('0'); // the other side did not move
  // The cue holds the figure air shows, so a later ✎ Update cannot regress it.
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('2');

  await goalB.click();
  await expect(program.locator('#f3')).toHaveText('1');
  await expect(page.getByTestId('cue-field-f3')).toHaveValue('1');

  // Clear flag takes the marker down and moves nothing.
  await page.getByTestId('cue-action-clearFlag').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('No flag');
  await expect(program.locator('#f1')).toHaveText('2');

  // The correction road: the stepper still exists for a score, and a disallowed goal comes off.
  await page.getByTestId('live-number-f1-down').click();
  await expect(program.locator('#f1')).toHaveText('1');
  // ...and the next goal counts from the corrected figure, not from a stale one.
  await goalA.click();
  await expect(program.locator('#f1')).toHaveText('2');

  // ✎ Update publishes the whole cue: the staged name airs, the scores hold.
  await page.getByTestId('verb-update').click();
  await expect(program.locator('#f0')).toHaveText('HOM');
  await expect(program.locator('#f1')).toHaveText('2');
  await expect(program.locator('#f3')).toHaveText('1');
});

test('± LIVE NUMBERS on the EXPORTED controller: the bump is a partial, carrying that field alone', async ({ page, context }) => {
  test.setTimeout(180_000);
  // The same rule as the test above, on the surface a show drops to when the network dies -
  // the exported local-control package, driven through the bundled relay. It matters MORE
  // here: this is the fallback an operator reaches for under pressure, and it used to
  // republish the cue's whole value set on every stepper press, so a half-typed name went to
  // air riding a goal.
  //
  // The assertion is the WIRE, not the DOM. What an exported operator surface puts on the
  // relay is the contract every receiver (and the log's own recovery replay) reads; a screen
  // that happens to look right can still be shipping the wrong payload, which is exactly how
  // this survived. So the rows are read straight off the in-spec relay and their SHAPE checked.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    // sb22 House Podiums: four scores (number) beside a spotlight index (number, but carried
    // as the ⚡ action's PAYLOAD) - both halves of §7c's derivation in one graphic.
    const tpl = variantById('sb22')!.create({});
    const { doc } = createGraphic(tpl, { name: 'House Podiums' });
    const show = shows.createShowNamed('Game Night');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, fresh0.cues![0].id, { label: 'Round one' });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    // Strip whatever folder the production's own name produced - the package is named after
    // the show, not a hard-coded slug.
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const { serve, rows } = relayServe(files);
  const origin = 'http://podium-host.local';

  // The OBS side: the overlay addressed as the program source. Managed, so it waits for the log.
  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${manifest.graphics[0].file}?stream=program`, { waitUntil: 'load' });

  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  await ctl.locator('.cue', { hasText: 'Round one' }).click();

  // OFF AIR the pair is GREYED, not quietly repurposed (docs/PLAYOUT_DASHBOARD.md §7c): a
  // control that acts on air has nothing to act on until the cue is taken, and a press that
  // silently staged instead looked exactly like a bump that did not work.
  const scoreSteps = ctl.locator('.field', { hasText: /^F2 · / }).locator('button.step');
  await expect(scoreSteps.first()).toBeDisabled();
  await expect(scoreSteps.last()).toBeDisabled();
  await expect(scoreSteps.first()).toHaveAttribute('title', /not on air\. Take it first\./);
  // The exclusion keeps its own meaning: an ⚡ payload field's pair never airs anything, so it
  // stages at all times and greying it would strand the only stepper the field has.
  await expect(ctl.locator('.field', { hasText: /^F9 · / }).locator('button.step').first()).toBeEnabled();

  await ctl.locator('#v-take').click();
  await expect(ctl.locator('.cue').first()).toHaveClass(/on-air/, { timeout: 10_000 });
  await expect(air.locator('#f2')).toHaveText('0', { timeout: 10_000 });
  // …and the take is what enables it, on the controller's own 400 ms log poll.
  await expect(scoreSteps.first()).toBeEnabled({ timeout: 10_000 });

  /** Every PROGRAM `update` this page has sent, newest last. */
  const programUpdates = () =>
    rows.filter((r) => r.stream === 'program' && (r.msg as { t: string }).t === 'update')
      .map((r) => (r.msg as { data: Record<string, string> }).data);

  // Stage an edit that must NOT ride the bump: a half-typed name. Typing STAGES on this
  // surface too - the editor header has always promised "changes push live on ✎ Update".
  const nameRow = ctl.locator('.field', { hasText: /^F1 · / });
  await nameRow.locator('input[type="text"]').fill('ZO');
  await ctl.waitForTimeout(300);
  expect(programUpdates().some((d) => d.f1 === 'ZO')).toBe(false);
  await expect(air.locator('#f1')).toHaveText('MAYA');

  // THE BUMP. One press, one row, one key.
  const scoreRow = ctl.locator('.field', { hasText: /^F2 · / });
  const before = programUpdates().length;
  await scoreRow.locator('button.step', { hasText: '+' }).click();
  await expect.poll(() => programUpdates().length).toBe(before + 1);
  expect(programUpdates()[before]).toEqual({ f2: '1' });
  await scoreRow.locator('button.step', { hasText: '−' }).click();
  await expect.poll(() => programUpdates().length).toBe(before + 2);
  expect(programUpdates()[before + 1]).toEqual({ f2: '0' });

  // The aired board moved and the staged name did not travel with it…
  await expect(scoreRow.locator('input[type="number"]')).toHaveValue('0');
  await expect(air.locator('#f1')).toHaveText('MAYA');
  // …and the cue kept the bumped value, so the next ⟳ Take or ✎ Update cannot regress it.
  await scoreRow.locator('button.step', { hasText: '+' }).click();
  await expect(air.locator('#f2')).toHaveText('1', { timeout: 10_000 });

  // §7c's EXCLUSION: the spotlight index is an ⚡ payload field, so its stepper airs nothing -
  // it is set by its own action, and a second road to it would air a value without the state
  // that gives it meaning. Pressing + there stages, exactly like typing.
  const spotRow = ctl.locator('.field', { hasText: /^F9 · / });
  const beforeSpot = programUpdates().length;
  await spotRow.locator('button.step', { hasText: '+' }).click();
  await ctl.waitForTimeout(400);
  expect(programUpdates().length).toBe(beforeSpot);
  // The ⚡ action is how that number reaches air, carrying the state that explains it.
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Spotlight podium' }).click();
  await expect(air.locator('.scoreboard-podium-1')).toHaveClass(/scoreboard-podium-spot/, { timeout: 10_000 });

  // ✎ Update stays the deliberate other half: the WHOLE value set, staged name included.
  await ctl.locator('#v-update').click();
  await expect(air.locator('#f1')).toHaveText('ZO', { timeout: 10_000 });
  const last = programUpdates()[programUpdates().length - 1];
  expect(last.f1).toBe('ZO');
  expect(Object.keys(last).length).toBeGreaterThan(1);
  expect(last.f2).toBe('1');   // the bump survived the full publish rather than being undone

  await ctl.close();
  await air.close();
});

test('a GOAL on the EXPORTED controller carries the new score as the event\'s payload', async ({ page, context }) => {
  test.setTimeout(180_000);
  // The third renderer of the one-control doctrine (docs/CONTROL_PANEL_PARITY.md): the exported
  // controller ships without controlModel.ts, so it carries its own copy of the adjust rule.
  // Asserted on the WIRE, like the bump above - one row, the event with the moved figure as
  // its payload, and the controller's own box moved with it.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantById('sb03')!.create({});
    const { doc } = createGraphic(tpl, { name: 'House Score' });
    const show = shows.createShowNamed('Derby');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, fresh0.cues![0].id, { label: 'Kick-off' });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  });
  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const { serve, rows } = relayServe(files);
  const origin = 'http://derby-host.local';
  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${manifest.graphics[0].file}?stream=program`, { waitUntil: 'load' });
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f1')).toHaveText('0', { timeout: 10_000 });

  const programEvents = () =>
    rows.filter((r) => r.stream === 'program' && (r.msg as { t: string }).t === 'event')
      .map((r) => r.msg as { event: string; payload?: Record<string, string> });
  const goalA = ctl.locator('#editor-events').getByRole('button', { name: '⚡ Goal A' });
  await goalA.click();
  await expect.poll(() => programEvents().length).toBe(1);
  expect(programEvents()[0]).toEqual({ t: 'event', event: 'goalA', payload: { f1: '1' } });
  await expect(air.locator('#f1')).toHaveText('1', { timeout: 10_000 });
  // The box moved with the press, and the second goal counts from it.
  await expect(ctl.locator('.field', { hasText: /^F1 · / }).locator('input[type="number"]')).toHaveValue('1');
  await goalA.click();
  await expect.poll(() => programEvents().length).toBe(2);
  expect(programEvents()[1].payload).toEqual({ f1: '2' });
  await expect(air.locator('#f1')).toHaveText('2', { timeout: 10_000 });
  // The other side is untouched, and a ⟳ re-take carries the goals rather than regressing them.
  await expect(air.locator('#f3')).toHaveText('0');
  await ctl.locator('#v-update').click();
  await expect(air.locator('#f1')).toHaveText('2', { timeout: 10_000 });

  await ctl.close();
  await air.close();
});

// ── THE MATCH CLOCK ACROSS A RENDERER RELOAD (docs/SPORTS_PACK.md) ────────────────────────────
// A clock is the one value that keeps moving with nobody commanding it, so a log of what was
// SENT cannot rebuild it. The hosted /output renderer has attached a time origin since
// 2026-08-19; the EXPORT door — the rehearsed backup when the network fails — did not, so a
// browser source reloaded mid-match came back at whatever the last Take carried and re-ran from
// there. Visibly wrong, on air, at the moment something has already gone wrong.
//
// These two cover the two exported operator surfaces a package ships. Both assert against REAL
// ELAPSED TIME or the WIRE rather than a fixed string: the clock is supposed to have kept
// running, so the only honest assertion is that it did.

/** Seconds behind the sb09 board's 10:00 start, from its rendered "M:SS". */
function behindStart(text: string): number {
  const [m, s] = text.trim().split(':');
  return 10 * 60 - ((parseInt(m, 10) || 0) * 60 + (parseInt(s, 10) || 0));
}

test('an exported package recovers a running match clock when the renderer reloads', async ({ page, context }) => {
  test.setTimeout(120_000);
  await createProject(page, { name: 'House Match Board' });
  await page.getByTestId('dock-tab-export').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  const zip = await JSZip.loadAsync(readFileSync(await download.path()));
  const files = new Map<string, string>();
  let root = '';
  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    if (!root) root = `${name.split('/')[0]}/`;
    files.set(name.replace(root, ''), await zip.file(name)!.async('string'));
  }
  const graphicFile = [...files.keys()].find((n) => n.endsWith('.html') && n !== 'controlpanel.html')!;
  // A plain static host, NOT the relay: this is the BroadcastChannel pairing (the panel and the
  // graphic in one browser), which is the transport that carries the recovery replay.
  const serve = (route: Route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\//, '') || graphicFile;
    const body = files.get(path);
    if (body == null) return route.fulfill({ status: 404, body: 'nf' });
    const ct = path.endsWith('.css') ? 'text/css' : path.endsWith('.js') ? 'application/javascript' : 'text/html';
    return route.fulfill({ status: 200, contentType: ct, body });
  };
  const origin = 'http://clock-recovery.local';

  const graphic = await context.newPage();
  await graphic.route(`${origin}/**`, serve);
  await graphic.goto(`${origin}/${graphicFile}`, { waitUntil: 'load' });
  const panel = await context.newPage();
  await panel.route(`${origin}/**`, serve);
  await panel.goto(`${origin}/controlpanel.html`, { waitUntil: 'load' });
  await expect(panel.locator('.state-chip')).toBeVisible();

  // Kick off: the board airs at 10:00 and the clock starts counting down.
  await panel.getByRole('button', { name: '▶ Play' }).click();
  await expect(graphic.locator('#f5')).toHaveText('10:00');
  await panel.getByRole('button', { name: '⚡ Start clock' }).click();
  await expect(graphic.locator('#f5')).toHaveText('9:55', { timeout: 20_000 });

  // THE WIRE IS THE CONTRACT. What makes recovery possible is that the value the panel logged
  // carries the instant it was true — a plain "10:00" is a HELD time and rebuilds nothing.
  const logged = await panel.evaluate(() => {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)!;
      if (key.startsWith('noacg-log-')) return JSON.parse(localStorage.getItem(key)!) as { data: Record<string, string> };
    }
    return null;
  });
  expect(logged?.data.f5, 'the logged clock value must carry its time origin').toMatch(/^10:00@\d{13}$/);

  // THE RELOAD. The graphic announces itself, the panel rebuilds it from that log, and what
  // comes back must be the MATCH time — not the value the last Take carried.
  const beforeAt = Date.now();
  const before = behindStart((await graphic.locator('#f5').textContent())!);
  await graphic.reload({ waitUntil: 'load' });
  await expect(graphic.locator('#f5')).not.toHaveText('', { timeout: 10_000 });
  await page.waitForTimeout(3_000);
  const elapsed = (Date.now() - beforeAt) / 1000;
  const after = behindStart((await graphic.locator('#f5').textContent())!);
  // It kept running across the reload: the clock advanced by the wall time that passed, ±1.5 s
  // for the second boundary and the reload itself. Before the fix it came back at 10:00, so
  // `after` went BACKWARDS — the assertion fails by a wide margin rather than by a rounding.
  expect(
    after - before,
    `clock went ${before}s -> ${after}s behind the start over ${elapsed}s of real time`,
  ).toBeGreaterThan(elapsed - 1.5);
  expect(after - before).toBeLessThan(elapsed + 1.5);

  await panel.close();
  await graphic.close();
});

test('the EXPORTED CONTROLLER stamps the clock too: the origin rides the wire before the event', async ({ page, context }) => {
  test.setTimeout(180_000);
  // The same package ships two operator surfaces, and an operator who switches between them must
  // not switch behaviour (docs/CONTROL_PANEL_PARITY.md). The controller drives OBS/vMix through
  // the local relay, so the assertion is the WIRE: a screen that looks right can still be
  // shipping a plain value that rebuilds nothing.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantById('sb09')!.create({});          // House Match Board: f5 counts down from 10:00
    const { doc } = createGraphic(tpl, { name: 'House Match Board' });
    const show = shows.createShowNamed('Cup Tie');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const fresh0 = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, fresh0.cues![0].id, { label: 'Kick-off' });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    return (await buildShowZipFor(fresh, 'html-overlay')).generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const manifest = JSON.parse(files.get('payload.json')!) as { graphics: { file: string }[] };
  const { serve, rows } = relayServe(files);
  const origin = 'http://clock-controller.local';

  const air = await context.newPage();
  await routeOrigin(air, origin, serve);
  await air.goto(`${origin}/${manifest.graphics[0].file}?stream=program`, { waitUntil: 'load' });
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');
  await ctl.locator('.cue', { hasText: 'Kick-off' }).click();
  await ctl.locator('#v-take').click();
  await expect(air.locator('#f5')).toHaveText('10:00', { timeout: 10_000 });

  const before = rows.length;
  await ctl.locator('#editor-events').getByRole('button', { name: '⚡ Start clock' }).click();
  await expect.poll(() => rows.length).toBeGreaterThan(before + 1);
  const sent = rows.slice(before).map((r) => r.msg as { t: string; event?: string; data?: Record<string, string> });
  // ORDER MATTERS: the origin has to be in the document by the time startMatchClock runs, or the
  // runtime mints a local one and the wire's origin is never the one on air.
  expect(sent[0].t).toBe('update');
  expect(sent[0].data!.f5, 'the controller must stamp the clock field').toMatch(/^10:00@\d{13}$/);
  expect(sent[1]).toMatchObject({ t: 'event', event: 'clockStart' });

  // …and it is STAGED into the cue, so the whole value set a later ⟳ TAKE or ✎ Update sends
  // carries the stamped value rather than dragging the running clock back to 10:00.
  const stamped = sent[0].data!.f5;
  const afterEvent = rows.length;
  await ctl.locator('#v-update').click();
  await expect.poll(() => rows.length).toBeGreaterThan(afterEvent);
  const update = rows[rows.length - 1].msg as { t: string; data: Record<string, string> };
  expect(update.data.f5).toBe(stamped);
  // The operator still reads a plain time — the stamp is wire syntax, never something to type past.
  await expect(ctl.locator('.field', { hasText: /^F5 · / }).locator('input[type="text"]')).toHaveValue('10:00');

  await ctl.close();
  await air.close();
});

// ── The desktop scroll model (docs/PLAYOUT_DASHBOARD.md §2) ───────────────────────────────
// Owner report 2026-08-19, from a 1080p monitor: the EDITOR — where scores, names and texts are
// changed mid-show — had its own scrollbar, so operating a graphic with many fields meant
// scrolling a small box inside a page that could not scroll at all. The owner's correction names
// both halves: "I don't mind scrolling the whole page… I also don't want it too small", and "we
// should rather make the preview and program screens a bit smaller… you see what's out all the
// time". So nothing is shrunk to fit, and the monitors stay in view.
//
// Since 2026-09-22 (owner, a real production test: the monitors and the rundown "still move or
// bounce" when the page scrolled under them) the page itself no longer scrolls. It is a fixed
// shell and the CONTROL AREA under the monitors is the one scroller; the editor inside it is
// still content-sized, so a long graphic makes the control area longer, never the editor a
// small box. The cue list keeps its own scroller inside the rail, which does not move either.
// e2e/playout-fixed-panes.spec.ts pins the geometry while a wheel scrolls it.
test.describe('the control area is the one scroller', () => {
  /** The structural half, at the nominal 1080p the report names. */
  test.describe('at 1920x1080', () => {
    test.use({ viewport: { width: 1920, height: 1080 } });

    test('only the control area and the cue list scroll, and the monitors are capped', async ({ page }) => {
      await createProject(page, { name: 'Arena Quiz' });
      await productionFor(page, 'Quiz Night');
      await expect(page.getByTestId('cue-editor')).toBeVisible();

      const overflowOf = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).overflowY);
      // The stage column CAN scroll, as the last resort for a window too short to hold the
      // stage head at all - but at a supported size it has nothing to scroll, which is the
      // half that matters: a column that scrolls is a column whose monitors move.
      expect(await page.locator('.pd-main').evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
      // `hidden` counts as a failure here: it is what clipped the editor's own bottom rows.
      expect(await overflowOf('.pd-editor')).not.toMatch(/auto|scroll/);
      expect(await overflowOf('.pd-activity')).not.toMatch(/auto|scroll/);
      // The two scrollers, both deliberate, and neither hands its wheel on at its end.
      for (const sel of ['[data-testid="control-area"]', '.pd-cues']) {
        expect(await overflowOf(sel)).toMatch(/auto|scroll/);
        expect(await page.locator(sel).evaluate((el) => getComputedStyle(el).overscrollBehaviorY)).toBe('contain');
      }
      // The editor is INSIDE the scroller, which is what "only the control area scrolls" means.
      await expect(page.getByTestId('control-area').getByTestId('cue-editor')).toBeVisible();

      // The monitors give up the height the editor needed, both still 16:9 and still side by
      // side — smaller, never stacked (§3's rule about air staying beside preview).
      //
      // WHAT IS MEASURED IS THE STAGE HEAD, not the monitor grid, and the bound is 40% rather
      // than 32% (both changed 2026-08-21). The head now carries the VERB BAR as well — it used
      // to scroll away under the monitors, which the owner called out — so it, not the
      // monitor block, is what "how much of the screen is permanently spent" means. And the cap
      // itself grew, because the owner read 1920x1080 with the old one and rejected it: "too
      // much empty room at the bottom and the monitors are unnecessarily small".
      const head = await page.locator('.pd-stagehead').boundingBox();
      expect(head!.height).toBeLessThanOrEqual(1080 * 0.4);
      // The verb bar is INSIDE that fixed block, which is the half of the fix a height bound
      // cannot see: a bar that scrolled away would leave this assertion perfectly green.
      await expect(page.locator('.pd-stagehead [data-testid="production-verbs"]')).toBeVisible();
      const pvw = await page.locator('.pd-pvw .pd-frame').boundingBox();
      const pgm = await page.locator('.pd-pgm .pd-frame').boundingBox();
      expect(Math.abs(pvw!.y - pgm!.y)).toBeLessThanOrEqual(2);
      expect(pgm!.x).toBeGreaterThan(pvw!.x + pvw!.width - 2);
      expect(Math.abs(pvw!.width / pvw!.height - 16 / 9)).toBeLessThan(0.05);
      expect(Math.abs(pgm!.width / pgm!.height - 16 / 9)).toBeLessThan(0.05);

      // §3: a horizontal scrollbar on this surface is a layout bug, never an affordance.
      const doc = await page.evaluate(() => ({
        scrollWidth: document.scrollingElement!.scrollWidth,
        clientWidth: document.scrollingElement!.clientWidth,
      }));
      expect(doc.scrollWidth).toBeLessThanOrEqual(doc.clientWidth);
    });
  });

  /** The reported case. A 1080p monitor at the 125% Windows scaling this laptop ships with, less
   *  the browser's own chrome, is 1536x814 CSS px — and THAT is where the eight-field quiz did
   *  not fit: .pd-editor was 178px tall over 240px of content and the document could not scroll
   *  a single pixel. Nominal 1920x1080 hid it, which is why the report was not reproducible
   *  from the numbers alone. */
  test.describe('at a scaled 1080p (1536x814)', () => {
    test.use({ viewport: { width: 1536, height: 814 } });

    test('a graphic with eight fields makes the CONTROL AREA longer, not the editor scrollable', async ({ page }) => {
      await createProject(page, { name: 'Arena Quiz' });
      await productionFor(page, 'Quiz Night');
      const editor = page.getByTestId('cue-editor');
      await expect(editor).toBeVisible();
      expect(await editor.locator('.field-row').count()).toBeGreaterThanOrEqual(8);

      // The editor shows all of itself — the reported defect, gone.
      expect(await editor.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);

      // Now take the height away: a shorter window (or a graphic with more fields than this
      // one) is where the model has to prove itself. The CONTROL AREA grows; the editor still
      // does not, and the document has nothing to scroll at all.
      await page.setViewportSize({ width: 1536, height: 560 });
      expect(await editor.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      const area = page.getByTestId('control-area');
      expect(await area.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
      const doc = await page.evaluate(() => ({
        scrollHeight: document.scrollingElement!.scrollHeight,
        clientHeight: document.scrollingElement!.clientHeight,
      }));
      expect(doc.scrollHeight).toBe(doc.clientHeight);

      // Scrolled to the bottom, preview and program are STILL on screen — "you see what's out
      // all the time" — and so is the rundown the next cue is picked from.
      await area.evaluate((el) => el.scrollTo(0, 10_000));
      await expect.poll(() => area.evaluate((el) => Math.round(el.scrollTop))).toBeGreaterThan(0);
      // THE VERB BAR IS IN THIS LIST since 2026-08-21. It used to scroll away under the
      // monitors, and the owner reading the acceptance pack called that out by name: "it's a bit
      // scary that you scroll the monitors on top of the take buttons… the buttons should be
      // visible". It is what carries TAKE and Out, so it is exactly what §2's rule is about.
      for (const sel of ['.pd-monitors', '.pd-rail', '[data-testid="production-verbs"]']) {
        const box = await page.locator(sel).boundingBox();
        expect(box!.y, `${sel} scrolled away above the fold`).toBeGreaterThanOrEqual(0);
        expect(box!.y + box!.height, `${sel} pushed off the bottom`).toBeLessThanOrEqual(561);
      }
    });
  });

  /**
   * THE MONITORS DO NOT RESIZE WHEN A DIFFERENTLY SHAPED CUE IS SELECTED.
   *
   * Owner, reading the acceptance pack 2026-08-21: "it's also important that the program and
   * preview monitors don't jump between scales depending on what graphic we are looking at."
   * They did. The cap is a grid TRACK WIDTH scaled by `--pd-ar`, and `--pd-ar` was the PREVIEWED
   * graphic's own ratio - so selecting a 9:16 cue narrowed both monitors, which is the rule
   * broken by the very mechanism enforcing the cap. It is the production's stage now, derived
   * the way `buildOutputPayload` derives it (and the way the exported controller always baked
   * it), and a cue of another shape is letterboxed into it.
   *
   * Measured on WIDTH, because that is what the track sets and what visibly moved.
   */
  test('a portrait cue is letterboxed into the production stage, it does not re-size the monitors', async ({ page }) => {
    await page.setViewportSize({ width: 1536, height: 814 });
    await createProject(page, { name: 'Arena Quiz' });
    await productionFor(page, 'Mixed Shapes');

    // A second graphic on the same production, drawn 1080x1920. Built here rather than through
    // the wizard because the SHAPE is the whole subject and the wizard's format picker is
    // covered by its own specs.
    await page.evaluate(async () => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const shows = await import('/src/model/shows.ts');
      const portrait = {
        ...variantById('lt01')!.create({}),
        resolution: { width: 1080, height: 1920, label: '1080x1920' },
      };
      const show = shows.loadShows()[0];
      shows.addGraphicToShow(show.id, portrait, {});
      const fresh = shows.loadShows().find((s) => s.id === show.id)!;
      shows.updateShowCue(show.id, fresh.cues![fresh.cues!.length - 1].id, { label: 'Portrait strap' });
    });
    // A durable write is ACCEPTED synchronously and lands a moment later, so the reload below
    // was aborting it - intermittently, and only the LAST write, which is the rename this test
    // then waits sixty seconds for. Every spec that saves off the UI and reloads owes this
    // (e2e/_durable.ts); this one predates the helper. Measured from the other side on
    // 2026-08-22: without the wait it failed 3 of 3 runs, with it passed 3 of 3.
    await settleDurableWrites(page);
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible();

    const monitorWidth = async () => Math.round((await page.locator('.pd-pvw .pd-frame').boundingBox())!.width);
    await page.locator('.pd-cue').first().click();
    const landscape = await monitorWidth();
    expect(landscape).toBeGreaterThan(0);

    await page.locator('.pd-cue', { hasText: 'Portrait strap' }).first().click();
    await expect(page.getByTestId('cue-label')).toHaveValue('Portrait strap');
    // Same width, to the pixel. Before the fix this narrowed to roughly nine sixteenths of it.
    expect(await monitorWidth()).toBe(landscape);
  });

  /**
   * NO CUE FIELD PAINTS OVER THE FIELD BESIDE IT.
   *
   * Owner report, 2026-08-21, from a wide monitor: "the YLE box is on top of the step one, and
   * F4 Period is also on top of the step one box". `.pd-fields` is `repeat(auto-fit,
   * minmax(<floor>, 1fr))`, and that floor is a HARD track minimum — a control whose own
   * min-content is wider neither widens the track nor shrinks, it simply overflows, and the next
   * column draws on top. A number control is 245px wide at its minimum against a 210px floor, so
   * EVERY number field on the surface was 35px into its neighbour: two scores unreadable on a
   * scoreboard, which is the graphic most likely to have them.
   *
   * Measured as overflow, not as a screenshot: the fields are laid out by a grid whose column
   * count changes with the window, so what has to hold at every width is "no field is wider than
   * its own track", and that is a number the browser already keeps.
   */
  test('a scoreboard cue lays its number fields out without overlapping the fields beside them', async ({ page }) => {
    await createProject(page, { name: 'House Scorebug' });
    await productionFor(page, 'Match Night');
    const editor = page.getByTestId('cue-editor');
    await expect(editor).toBeVisible();
    // The subject: this graphic really does carry the number fields the report is about.
    expect(await editor.locator('.ctl-num').count()).toBeGreaterThan(0);

    // Every supported width, because the track count — and so the track WIDTH — changes with it.
    for (const width of [1366, 1536, 1920, 2560]) {
      await page.setViewportSize({ width, height: 900 });
      const grid = page.locator('.pd-fields');
      const spills = await grid.evaluate((el) =>
        [...el.querySelectorAll('.pd-band-fields > *')]
          .filter((f) => f.scrollWidth > f.clientWidth + 1)
          .map((f) => `${f.textContent?.slice(0, 24)} (${f.scrollWidth} > ${f.clientWidth})`),
      );
      expect(spills, `fields overflow their grid track at ${width}px`).toEqual([]);

      // AND THE FLOOR IS DOING THE WORK, not the wrap backstop behind it. Both keep a field
      // inside its own track, so overflow alone cannot tell a floor that fits from one that
      // silently folds every number control onto three lines. One flex line is a row no taller
      // than its tallest control — measured that way rather than by matching tops, because the
      // step-size label is shorter than the boxes beside it and rides centred within the line.
      const wrapped = await grid.evaluate((el) =>
        [...el.querySelectorAll('.row')]
          .filter((row) => row.querySelector('.ctl-num'))
          .filter((row) => {
            const tallest = Math.max(...[...row.children].map((c) => c.getBoundingClientRect().height));
            return row.getBoundingClientRect().height > tallest + 2;
          })
          .map((row) => row.parentElement?.textContent?.slice(0, 24) ?? '?'),
      );
      expect(wrapped, `number controls wrapped onto a second line at ${width}px`).toEqual([]);
    }
  });

  /**
   * THE VERB BLOCK IS TWO COLUMNS WIDE, AND PACKED RATHER THAN SPREAD.
   *
   * Two owner reads, one shape. First: "they are spaced out vertically… they could be stacked a
   * little bit closer on top of each other" — `align-content: stretch` had nothing to stretch
   * but the GAPS once the window was tall, so the buttons sat on a 75px pitch. The fix for that
   * collapsed the grid to ONE column on a tall window, which drew the second read: "I do not
   * like it when it becomes too thin with just one column… this is a very important space on
   * the screen, so it can't just be one small column that you can miss" (2026-08-22).
   *
   * So the block keeps its two-across shape at every size, TAKE spans the pair, and a tall
   * window spends its slack on button HEIGHT. Three things are pinned, because a screenshot
   * nobody re-reads is what let the thin column ship in the first place:
   *
   *   - the COLUMN COUNT, which is what actually catches the collapse (mutation-tested by
   *     restoring the old one-column rule: it fails here, `Expected: 2 Received: 1`);
   *   - the WIDTH, which catches the other way to end up thin — a block that stays two-up but
   *     has its cap squeezed. It does NOT catch the collapse on its own, because a single
   *     column still stretches to the container's width;
   *   - the PITCH, which is the 2026-08-21 spreading complaint.
   */
  test('on a tall window the verbs are two across beside PROGRAM, packed and not thin', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1000 });
    await createProject(page, { name: 'House Scorebug' });
    await productionFor(page, 'Match Night');
    const verbs = page.locator('.pd-stagehead [data-testid="production-verbs"]');
    await expect(verbs).toBeVisible();

    const boxes = await verbs.evaluate((el) =>
      [...el.querySelectorAll('.pd-verb')].map((b) => {
        const r = b.getBoundingClientRect();
        return {
          take: b.classList.contains('pd-verb-take'),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
        };
      }),
    );
    // TAKE · Re-take · Update · Next · Out. There is no Preview verb here any more.
    expect(boxes.length).toBe(5);

    // TWO COLUMNS: the verbs under TAKE sit at exactly two distinct left edges. This is the
    // assertion the collapse fails on.
    const rest = boxes.filter((b) => !b.take);
    expect(new Set(rest.map((b) => b.x)).size).toBe(2);

    const block = (await verbs.boundingBox())!;
    // And the block is not squeezed thin while still being two-up: two columns of real buttons
    // do not fit under 240px.
    expect(block.width, `the verb block is ${block.width}px wide`).toBeGreaterThan(240);

    const take = boxes.find((b) => b.take)!;
    // TAKE spans the pair: as wide as the block itself, allowing for the grid's own edges.
    expect(take.w).toBeGreaterThanOrEqual(Math.round(block.width) - 2);

    // PACKED: one ROW to the next is a button-height plus the 6px gap. Measured per row (the
    // distinct y values), because two verbs beside each other share one.
    const rows = [...new Set(boxes.map((b) => b.y))].sort((a, b) => a - b);
    for (let i = 1; i < rows.length; i += 1) {
      const above = boxes.find((b) => b.y === rows[i - 1])!;
      const pitch = rows[i] - rows[i - 1];
      expect(pitch, `row ${i} sits ${pitch}px below the one above it`).toBe(above.h + 6);
    }

    // And the block still does not drive the sticky head's height — the monitors do.
    const head = await page.locator('.pd-stagehead').boundingBox();
    const monitors = await page.locator('.pd-monitors').boundingBox();
    expect(head!.height).toBeLessThanOrEqual(monitors!.height + 30);
  });
});

/**
 * THE CUE EDITOR GROUPS A TWO-SIDED BOARD BY SIDE — and leaves everything else alone.
 *
 * Owner, 2026-08-21: "if we have a scoring system then everything that fits one team should be
 * on one row or one column and the other team is in the next row." The grouping is DERIVED from
 * the field titles (control/cueFieldGroups.ts) - the same side tokens the data-row loader
 * already reads - because the owner's next sentence is the constraint: "we have no idea what
 * kinds of graphics we will have in the future."
 *
 * So this spec has two halves, and the second is the one that matters: a graphic the rule is not
 * confident about must render EXACTLY as it always did. A wrong grouping tells an operator two
 * fields are related when they are not, which is worse than no grouping at all.
 */
test.describe('the cue editor groups fields by what they belong to', () => {
  test('a scoreboard reads one team per band, headed by that team’s own name', async ({ page }) => {
    await createProject(page, { name: 'House Scorebug' });
    await productionFor(page, 'Match Night');
    const editor = page.getByTestId('cue-editor');
    await expect(editor).toBeVisible();

    // Three bands: a side each, then what both sides share.
    await expect(editor.locator('.pd-band')).toHaveCount(3);
    const band = (id: string) => editor.getByTestId(`cue-band-${id}`);
    for (const [id, fields] of [
      ['side-A', ['F0 · Team A', 'F1 · Score A', 'F6 · Team A colour']],
      ['side-B', ['F2 · Team B', 'F3 · Score B', 'F7 · Team B colour']],
      ['shared', ['F4 · Period', 'F5 · Clock']],
    ] as const) {
      await expect(band(id).locator('.pd-band-fields > *')).toHaveCount(fields.length);
      for (const f of fields) await expect(band(id)).toContainText(f);
    }

    // THE HEADING IS THE OPERATOR'S OWN WORD for that side - the value of the side's first
    // field - because "ARC" says which half of the board you are editing and "Side A" only says
    // that a split exists. Typing a new name re-heads the band live.
    await expect(band('side-A').getByTestId('cue-band-label-side-A')).toHaveText('HOME');
    await page.getByTestId('cue-field-f0').fill('ARC');
    await expect(band('side-A').getByTestId('cue-band-label-side-A')).toHaveText('ARC');
    // Emptied, it falls back rather than showing a blank heading.
    await page.getByTestId('cue-field-f0').fill('');
    await expect(band('side-A').getByTestId('cue-band-label-side-A')).toHaveText('Side A');

    // The cue's SETTINGS are not content: out of the field grid, under their own rule. This is
    // what stopped "Playout layer" flowing in as a tenth field and landing alone on a second row.
    const meta = page.getByTestId('cue-meta');
    await expect(meta.getByTestId('cue-note')).toBeVisible();
    await expect(meta.getByTestId('graphic-layer')).toBeVisible();
    await expect(editor.locator('.pd-fields').getByTestId('graphic-layer')).toHaveCount(0);
  });

  test('a quiz is NOT grouped: A and B there are a lettered list, not two sides', async ({ page }) => {
    // The trap this pins. A quiz titles its fields "Answer A", "Answer B", "Answer C", "Answer
    // D" - the same tokens a scoreboard uses for two teams. Grouped, it would put Answer A in
    // one band, Answer B in another, and C and D in a third called "Both".
    await createProject(page, { name: 'Arena Quiz' });
    await productionFor(page, 'Quiz Night');
    const editor = page.getByTestId('cue-editor');
    await expect(editor).toBeVisible();

    await expect(editor.locator('.pd-band')).toHaveCount(1);
    await expect(editor.getByTestId('cue-band-all')).toHaveClass(/pd-band-plain/);
    await expect(editor.locator('.pd-band-label')).toHaveCount(0);
    // Every field is still there, in field order - the flat flow, untouched.
    await expect(editor.getByTestId('cue-band-all').locator('.pd-band-fields > *')).toHaveCount(
      await editor.locator('.pd-band-fields > *').count(),
    );

    // WHICH GUARD ACTUALLY REFUSED. The shipped quizzes carry one "Answer A" and one "Answer B",
    // so the two-fields-a-side threshold turns them away before the lettered-list rule is even
    // consulted - and a rule nothing reaches is a rule nobody has tested. This asks the module
    // directly, with the shape that gets PAST the threshold: a poll whose options each carry a
    // colour. Without the lettered-list rule it groups A against B and hides C in "Both".
    const decided = await page.evaluate(async () => {
      const { groupCueFields } = await import('/src/control/cueFieldGroups.ts');
      const lettered = ['Option A', 'Option A colour', 'Option B', 'Option B colour', 'Option C', 'Option C colour']
        .map((label, i) => ({ key: `f${i}`, label }));
      const sided = ['Team A', 'Score A', 'Team B', 'Score B', 'Period'].map((label, i) => ({ key: `f${i}`, label }));
      // Two fields a side, and nothing in common: an A and a B that are not two halves of one
      // thing. The sides of a real board are described by the SAME words.
      const unmirrored = ['Camera A', 'Camera A note', 'Sponsor B', 'Sponsor B url', 'Title']
        .map((label, i) => ({ key: `f${i}`, label }));
      return {
        lettered: groupCueFields(lettered).length,
        sided: groupCueFields(sided).length,
        unmirrored: groupCueFields(unmirrored).length,
      };
    });
    expect(decided.lettered, 'a lettered list must not be split into two sides').toBe(1);
    expect(decided.unmirrored, 'an unrelated A and B must not be drawn as two sides').toBe(1);
    // …and the same call still groups a real board, so this is a rule and not a switched-off one.
    expect(decided.sided).toBe(3);
  });
});

// ── ARRANGE, the production control profile's presentation half ───────────────────────────────
// docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b, AC-5 of docs/work-specs/control-panel-any-graphic.
// The football principle: the operator should understand the show, not the software. A graphic
// declares twelve controls at equal weight and one production presses four of them.
//
// THE LINE THESE CASES GUARD is that ARRANGE is presentation and NOTHING else. A hidden control
// is still guarded by the machine's own table and a renamed one still greys by it, which is why
// the hidden button below is asserted DISABLED and then ENABLED rather than merely present — a
// profile that could change legality would be the behaviour the whole design refuses.

test('the Controls panel arranges the ⚡ block, and deleting the profile puts the generated one back', async ({ page }) => {
  await createProject(page, { name: 'Club Scorebug' });
  await productionFor(page, 'Club Match');

  // The generated panel first, so what the profile changes is measured against it: six controls
  // in the author's two sections, no pinned row and no drawer.
  const actions = page.getByTestId('cue-actions');
  await expect(actions.locator('h4', { hasText: 'Clock' })).toBeVisible();
  await expect(page.getByTestId('cue-actions-pinned')).toHaveCount(0);
  await expect(page.getByTestId('cue-actions-more')).toHaveCount(0);
  await expect(page.getByTestId('cue-action-clockStop')).toHaveText('⚡ Stop clock');

  // AUTHOR IT THROUGH THE PANEL, not through the model: the panel and the block it authors are
  // one feature, and a profile written straight into the record would pass over the half an
  // operator actually touches.
  const panel = page.getByTestId('controls-panel');
  await panel.locator('summary').click();
  await expect(panel.getByTestId('controls-list')).toBeVisible();
  await panel.getByTestId('controls-pin-clockStart').click();
  // Rename AND hide the same control, because the two questions are one: does the word the
  // production chose follow the control into the drawer, and is it still the same control.
  // The name commits on BLUR, not per keystroke: trimming every keystroke made the box refuse a
  // space, so "Stop the clock" could not be typed at all. Pressing Enter is the same commit.
  await panel.getByTestId('controls-name-clockStop').fill('Stop the clock');
  await panel.getByTestId('controls-name-clockStop').press('Enter');
  await panel.getByTestId('controls-hide-clockStop').click();

  // PINNED: above the fold, out of its section, still in the block.
  const pinned = page.getByTestId('cue-actions-pinned');
  await expect(pinned.getByTestId('cue-action-clockStart')).toBeVisible();
  // HIDDEN: behind one collapsed drawer, wearing the production's own word.
  const more = page.getByTestId('cue-actions-more');
  await expect(more.getByTestId('cue-action-clockStop')).toHaveText('⚡ Stop the clock');
  // …and out of the Clock section, rather than drawn twice.
  await expect(actions.locator('.pd-actions-section', { hasText: 'Clock' }).getByTestId('cue-action-clockStop')).toHaveCount(0);

  // STILL GUARDED BY THE SAME TABLE. Stop clock has no arrow out of "armed", so the hidden,
  // renamed button is disabled exactly as the visible one was — and starting the clock enables
  // it. This is the assertion that says ARRANGE moved presentation and not behaviour.
  await page.getByTestId('verb-take').click();
  const hiddenStop = more.getByTestId('cue-action-clockStop');
  await expect(hiddenStop).toBeDisabled();
  await page.getByTestId('cue-action-clockStart').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText(/running/i);
  await expect(hiddenStop).toBeEnabled();

  // DELETE IS ONE ACTION and leaves the COMPLETE generated panel (docs/CONTROL_PANEL_ROAD.md §3).
  await panel.getByTestId('controls-delete-profile').click();
  await expect(page.getByTestId('cue-actions-pinned')).toHaveCount(0);
  await expect(page.getByTestId('cue-actions-more')).toHaveCount(0);
  await expect(actions.locator('.pd-actions-section', { hasText: 'Clock' }).getByTestId('cue-action-clockStop')).toHaveText(
    '⚡ Stop clock',
  );
  // The record goes back to having no profile at all, rather than to an empty one: a production
  // that never had a profile and one whose profile was deleted must be byte-identical, or every
  // surface downstream grows a second "no profile" to recognise.
  const stored = await page.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows().find((s) => s.name === 'Club Match')!;
    return { hasKey: 'profile' in show, profile: show.profile ?? null };
  });
  expect(stored.hasKey, 'delete must remove the key, not leave an empty profile').toBe(false);
  expect(stored.profile).toBeNull();
});

test('the EXPORTED controller carries the arrangement, and a deleted profile exports the generated panel byte for byte', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  // The third deployment (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6e: ARRANGE renders on all three,
  // because it is presentation and the exported page is built from the same generator). It is
  // resolved at GENERATION time rather than re-derived in the package's own JS, so what this
  // asserts is both halves: that the zip carries the arrangement, and that the page draws it.
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const exported = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const { withGraphicArrange } = await import('/src/model/profile.ts');
    // sb08 Club Scorebug: the same clock machine the in-app case above arranges, so the two
    // deployments are measured on ONE graphic rather than on two that happen to agree.
    const tpl = variantById('sb08')!.create({});
    const { doc } = createGraphic(tpl, { name: 'Club Scorebug' });
    const show = shows.createShowNamed('Club Match');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const seeded = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, seeded.cues![0].id, { label: 'Kick off' });

    /** A freshly built package's files, folder prefix stripped (it is named after the show). */
    const packageFor = async (id: string) => {
      const zip = await buildShowZipFor(shows.loadShows().find((s) => s.id === id)!, 'html-overlay');
      const files: Record<string, string> = {};
      for (const n of Object.keys(zip.files)) {
        if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
          files[n.replace(/^[^/]+\//, '')] = await zip.file(n)!.async('string');
        }
      }
      return files;
    };

    // (1) No profile — the panel every profile-less package has always had.
    const generated = (await packageFor(show.id))['controller.html'];

    // (2) With one. The pool graphic's NAME is the key, the same one the bindings and the
    //     published panel use — not the template's, which an import may have renamed.
    const arrange = () =>
      withGraphicArrange(undefined, shows.loadShows().find((s) => s.id === show.id)!.graphics[0].name, {
        clockStart: { pinned: true },
        clockStop: { name: 'Stop the clock', hidden: true },
      });
    shows.setShowProfile(show.id, arrange());
    const withProfile = await packageFor(show.id);

    // (3) Deleted — which must restore (1) exactly, on the surface furthest from the panel that
    //     deleted it. Re-applied afterwards so the loaded package below is the arranged one.
    shows.deleteShowProfile(show.id);
    const restored = (await packageFor(show.id))['controller.html'];
    shows.setShowProfile(show.id, arrange());

    return { generated, arranged: withProfile['controller.html'], restored, files: withProfile };
  });

  // THE ZIP CARRIES IT. The arrangement is baked as data, so a package opened with no network
  // and no NoaCG anywhere near it still shows the production's own panel.
  expect(exported.arranged).toContain('Stop the clock');
  expect(exported.generated).not.toContain('Stop the clock');
  // AND DELETING RESTORES IT BYTE FOR BYTE. Not "renders the same": the same bytes, because the
  // whole promise of the profile is that removing it leaves nothing behind.
  expect(exported.restored).toBe(exported.generated);

  // THE PAGE DRAWS IT. A zip carrying the right data and a page that ignores it look identical
  // from here, which is why the arranged package is actually loaded and read.
  const { serve } = relayServe(new Map(Object.entries(exported.files)));
  const origin = 'http://arranged-host.local';
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await ctl.locator('.cue', { hasText: 'Kick off' }).click();

  // Pinned above the fold, out of its section; hidden behind the one drawer, wearing the
  // production's word; the rest of the generated panel untouched under them.
  await expect(ctl.locator('.events-pinned button', { hasText: 'Start clock' })).toBeVisible();
  const drawer = ctl.locator('.events-more');
  await expect(drawer.locator('summary')).toHaveText('More (1)');
  await expect(drawer.locator('button', { hasText: 'Stop the clock' })).toHaveCount(1);
  await expect(ctl.locator('#editor-events h4', { hasText: 'Match' })).toBeVisible();
  await expect(ctl.locator('#editor-events button', { hasText: 'Full time' })).toBeVisible();
});

// ── COMBINED CONTROLS (AC-6 of docs/work-specs/control-panel-any-graphic) ────────────────────
//
// The proof case's one press: "reveal the performer, then three seconds later the +1s for whoever
// was right" (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6c, first row). The owner made that example
// EVIDENCE for a general capability rather than the workflow being designed around, so what these
// pin is the primitive: several related rows from one press, a delayed follow-up, a per-press
// choice, and a cancel — none of it a programming system.
//
// It is composed here through the UI rather than seeded into the record, because "composed in the
// room's minute" is the claim, and a profile written by a test proves nothing about the panel that
// has to write it on 2026-10-20.
//
// THE ASSERTIONS ARE THE WIRE, the way the ± live-numbers pair above is: the activity feed's own
// rows (one per step, in order) and the figures the PROGRAM monitors are actually showing. A
// button that counts down and sends the wrong payload looks identical from the DOM of the button.

/** Pick one step in the composer and add it. `control` is the combined control's id, or `new` for
 *  the one being made — the panel keys its pickers the same way. */
async function addStep(
  page: Page,
  control: string,
  step: { target: string; action: string; after?: string; ask?: 'on' | 'off' },
): Promise<void> {
  await page.getByTestId(`combine-target-${control}`).selectOption(step.target);
  await page.getByTestId(`combine-action-${control}`).selectOption(step.action);
  if (step.after) await page.getByTestId(`combine-after-${control}`).fill(step.after);
  if (step.ask) await page.getByTestId(`combine-ask-${control}`).selectOption(step.ask);
  await page.getByTestId(`combine-add-step-${control}`).click();
}

/** Take both boards on air and leave the VOTES cue selected, which is where the operator's minute
 *  starts (plan §3c). */
async function bothOnAir(page: Page): Promise<void> {
  const cues = page.getByTestId('cue-list').locator('.pd-cue');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Votes');
  await cues.nth(1).locator('.pd-cue-label').click();
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText('Board');
  await cues.nth(0).locator('.pd-cue-label').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Votes');
}

test('a combined control sends one row per step, waits, and counts the wait down on its button', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await importProofCase(page);

  // ── COMPOSE IT, in the Controls panel under the block it will appear in ──
  await page.getByTestId('controls-panel').locator('summary').click();
  await page.getByTestId('combine-new').click();
  await page.getByTestId('combine-new-name').fill('Reveal + points');
  // Step 1: the reveal, immediately, on the votes board.
  await addStep(page, 'new', { target: 'graphic:Votes board', action: 'reveal' });
  // Steps 2-6: the five +1s on the OTHER board, the first of them three seconds later and every
  // one offered as a tick that starts OFF. The cross-graphic step is the case §6c refused to
  // special-case, and it is composed here exactly as a same-graphic one would be.
  for (const n of [1, 2, 3, 4, 5]) {
    await addStep(page, 'combined-1', {
      target: 'graphic:Totals board',
      action: `plus${n}`,
      after: n === 1 ? '3' : undefined,
      ask: 'off',
    });
  }
  await expect(page.getByTestId('combine-steps-combined-1').locator('li')).toHaveCount(6);
  // The order IS the meaning, so the list says it back in the order it will run.
  await expect(page.getByTestId('combine-step-combined-1-0')).toContainText('Reveal performer');
  await expect(page.getByTestId('combine-step-combined-1-1')).toContainText('after 3 s');
  await page.getByTestId('controls-panel').locator('summary').click();

  // ── IT RENDERS IN THE ⚡ BLOCK, under its own section, and it is GREY ──
  const combined = page.getByTestId('combined-press-combined-1');
  await expect(page.getByTestId('cue-actions-combined').locator('h4')).toHaveText('Combined');
  await expect(combined).toHaveText('⚡ Reveal + points');
  // GREY WHILE THE FIRST STEP IS ILLEGAL (§6b), and it says which step and why. The five later
  // steps are illegal too — the totals board is not up either — and that is deliberately NOT what
  // decides: a walk's later steps are routinely illegal at the moment the first one is pressed.
  await expect(combined).toBeDisabled();
  await expect(combined).toHaveAttribute('title', /first step cannot go.*Votes board.*not on air/);

  // Five ticks, one per panelist, each naming its own panelist rather than reading "+1" five times.
  const asks = page.getByTestId('combined-asks-combined-1').locator('label');
  await expect(asks).toHaveCount(5);
  await expect(asks.first()).toContainText('Panelist 1');

  await bothOnAir(page);
  await expect(combined).toBeEnabled();

  const votes = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="7"]');
  const totals = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="8"]');
  await expect(totals.locator('#f5')).toHaveText('0');
  await expect(totals.locator('#f6')).toHaveText('0');

  // ── TICK TWO OF THE FIVE, AND PRESS ──
  await page.getByTestId('combined-ask-combined-1-1').locator('input').check();
  await page.getByTestId('combined-ask-combined-1-2').locator('input').check();
  await page.getByTestId('action-log').locator('summary').click();
  await combined.click();

  // THE FIRST STEP WENT AT ONCE. The reveal is on the wire before anything waits, which is what
  // makes a combined control usable as the one press an operator makes on the beat.
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Revealed');
  await expect(votes.locator('#f16')).toHaveText('revealed');
  await expect(page.getByTestId('action-log-row').first()).toContainText('Pressed “Reveal performer”');
  // …and nothing else has. The three unticked +1s never go at all; the two ticked ones are still
  // three seconds away.
  await expect(totals.locator('#f5')).toHaveText('0');

  // THE ARMED WAIT IS VISIBLE — the half that keeps this on the right side of the no-second-clock
  // ruling (owner 2026-08-09; plan §6d). The button counts down and wears the on-air accent.
  await expect(combined).toHaveClass(/pd-combined-waiting/);
  // The figure itself, with its unit: a bare number after the control's name reads as part of
  // the name, which is what this said on the surface before it grew the separator.
  await expect(combined).toContainText(/· \ds$/);
  await expect(combined).toHaveAttribute('title', /cancel.*2 steps still to send/);

  // ── THE TAIL, THREE SECONDS LATER ──
  await expect(totals.locator('#f5')).toHaveText('1', { timeout: 8_000 });
  await expect(totals.locator('#f6')).toHaveText('1');
  // The three panelists nobody ticked did not move. The tick is the whole of what one press may
  // vary by, and it is a tick rather than a value.
  await expect(totals.locator('#f7')).toHaveText('0');
  await expect(totals.locator('#f8')).toHaveText('0');
  await expect(totals.locator('#f9')).toHaveText('0');
  // ONE ROW PER STEP, in order, on the one command log. Newest first, so the second +1 leads.
  const rows = page.getByTestId('action-log-row');
  await expect(rows.nth(0)).toContainText('Pressed “Panelist 2 · +1”');
  await expect(rows.nth(1)).toContainText('Pressed “Panelist 1 · +1”');
  await expect(rows.nth(2)).toContainText('Pressed “Reveal performer”');
  // The run is over: the button is a button again.
  await expect(combined).not.toHaveClass(/pd-combined-waiting/);

  // THE CUE KEPT THE FIGURES AIR SHOWS, so the next ⟳ Take or ✎ Update cannot regress them — the
  // same write-back a single ⚡ press does, reached here through a graphic that is not even the
  // one selected.
  await page.getByTestId('cue-list').locator('.pd-cue').nth(1).locator('.pd-cue-label').click();
  await expect(page.getByTestId('cue-field-f5')).toHaveValue('1');
  await expect(page.getByTestId('cue-field-f6')).toHaveValue('1');
  await page.getByTestId('verb-update').click();
  await expect(totals.locator('#f5')).toHaveText('1');

  // ── GREY AGAIN once the first step has no arrow left ──
  await page.getByTestId('cue-list').locator('.pd-cue').nth(0).locator('.pd-cue-label').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Revealed');
  await expect(combined).toBeDisabled();
  await expect(combined).toHaveAttribute('title', /no arrow out of/);
});

test('a press on the countdown cancels the unsent tail, and so does Out', async ({ page }) => {
  test.setTimeout(120_000);
  await importProofCase(page);

  // A two-step control: the reveal now, one +1 five seconds later. Five rather than three so the
  // cancel has room to happen on a loaded machine without racing the wait it is cancelling.
  await page.getByTestId('controls-panel').locator('summary').click();
  await page.getByTestId('combine-new').click();
  await page.getByTestId('combine-new-name').fill('Reveal then point');
  await addStep(page, 'new', { target: 'graphic:Votes board', action: 'reveal' });
  await addStep(page, 'combined-1', { target: 'graphic:Totals board', action: 'plus1', after: '5' });
  await page.getByTestId('controls-panel').locator('summary').click();

  await bothOnAir(page);
  const totals = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="8"]');
  const combined = page.getByTestId('combined-press-combined-1');
  await page.getByTestId('action-log').locator('summary').click();
  await combined.click();
  await expect(combined).toHaveClass(/pd-combined-waiting/);

  // THE COUNTDOWN IS THE CANCEL. One control shows the wait and stops it, rather than a second
  // control beside it — which is what makes an armed wait something an operator can actually
  // stand down under pressure.
  await combined.click();
  await expect(combined).not.toHaveClass(/pd-combined-waiting/);
  await expect(page.getByTestId('action-log-row').first()).toContainText('cancelled, 1 step not sent');

  // …and it stays unsent. The assertion has to outlive the wait it cancelled, or it would pass
  // against a cancel that only hid the countdown.
  await page.waitForTimeout(7_000);
  await expect(totals.locator('#f5')).toHaveText('0');

  // OUT IS THE OTHER STOP (§6b: "any Out ... cancels what has not been sent"). The reveal is spent
  // now, so the control is grey — ⟳ RE-TAKE puts the votes board back at the start of its walk,
  // which is what an operator does between songs anyway. Not ⟳ TAKE: that control is a TOGGLE and
  // would take the live cue straight off air.
  await page.getByTestId('verb-retake').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Votes');
  await combined.click();
  await expect(combined).toHaveClass(/pd-combined-waiting/);
  await page.getByTestId('verb-out').click();
  await expect(combined).not.toHaveClass(/pd-combined-waiting/);
  // The whole feed rather than its first row: the cancel is written the moment the gesture
  // happens and the Out's own command row lands on top of it a beat later, which is the honest
  // order — the tail is stood down before anything goes to the wire, not after a round trip.
  await expect(page.getByTestId('action-log')).toContainText(
    'Out cancelled 1 unsent step of “Reveal then point”',
  );
  await page.waitForTimeout(7_000);
  await expect(totals.locator('#f5')).toHaveText('0');
});

test('a step the machine would drop is dropped alone, and the feed says which', async ({ page }) => {
  test.setTimeout(120_000);
  await importProofCase(page);

  // Reveal now; then, three seconds later, a SECOND reveal beside a +1. By the time the pair
  // fires the votes board is already revealed and has no arrow left, so the machine would drop
  // that row — and the +1 beside it must still land. That is the rule in §6b: a dropped step is
  // dropped ALONE, the rest proceed, and the feed says which one did not apply.
  await page.getByTestId('controls-panel').locator('summary').click();
  await page.getByTestId('combine-new').click();
  await page.getByTestId('combine-new-name').fill('Double reveal');
  await addStep(page, 'new', { target: 'graphic:Votes board', action: 'reveal' });
  await addStep(page, 'combined-1', { target: 'graphic:Votes board', action: 'reveal', after: '3' });
  await addStep(page, 'combined-1', { target: 'graphic:Totals board', action: 'plus1' });
  await page.getByTestId('controls-panel').locator('summary').click();

  await bothOnAir(page);
  const totals = page.frameLocator('[data-testid="program-stage"] iframe[data-layer="8"]');
  await page.getByTestId('action-log').locator('summary').click();
  await page.getByTestId('combined-press-combined-1').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Revealed');

  // The +1 beside the dropped reveal landed.
  await expect(totals.locator('#f5')).toHaveText('1', { timeout: 8_000 });
  // And the feed names the step that did not apply, the control it belongs to, and why — rather
  // than leaving an operator to notice that one of six things quietly did not happen.
  const feed = page.getByTestId('action-log');
  await expect(feed).toContainText('“Double reveal” skipped');
  await expect(feed).toContainText('no arrow out of “Votes board”');
});

test('the EXPORTED controller says where its combined controls run, and carries none of them', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  // §6f, THE ONE PLACE THE PORTABILITY LINE NEEDED DRAWING (owner, 2026-09-15, ALIGN-2026-09-15-3).
  // ARRANGE renders on all three deployments because it is presentation of the graphic's own
  // contract. COMBINE does not cross into this one: a sequencer with delays and ticks, inlined a
  // second time in vanilla JS, is exactly the second production runtime the owner refused. So the
  // package degrades HONESTLY — one line where the Combined section sits on the two hosted
  // surfaces — rather than silently, which is what it did before: the buttons the production had
  // composed were simply not there and nothing said why.
  await page.goto('/app');
  await page.keyboard.press('Escape');

  const exported = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const { withGraphicArrange } = await import('/src/model/profile.ts');
    // sb08 Club Scorebug, the same graphic the arrangement case above exports, so the two halves
    // of §6f are measured on one package rather than on two that happen to agree.
    const tpl = variantById('sb08')!.create({});
    const { doc } = createGraphic(tpl, { name: 'Club Scorebug' });
    const show = shows.createShowNamed('Club Match');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const seeded = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, seeded.cues![0].id, { label: 'Kick off' });
    const graphic = seeded.graphics[0].name;

    /** A freshly built package's files, folder prefix stripped (it is named after the show). */
    const packageFor = async () => {
      const zip = await buildShowZipFor(shows.loadShows().find((s) => s.id === show.id)!, 'html-overlay');
      const files: Record<string, string> = {};
      for (const n of Object.keys(zip.files)) {
        if (!zip.files[n].dir && /\.(html|json)$/.test(n)) {
          files[n.replace(/^[^/]+\//, '')] = await zip.file(n)!.async('string');
        }
      }
      return files;
    };

    // (1) No profile at all.
    const none = (await packageFor())['controller.html'];
    // (2) A profile with an ARRANGE and NO combined control. The flag is about COMBINE, not about
    //     having a profile — a production that only renamed a button must not grow the line.
    shows.setShowProfile(show.id, withGraphicArrange(undefined, graphic, { clockStart: { pinned: true } }));
    const arrangeOnly = (await packageFor())['controller.html'];
    // (3) And one that composed a control: two steps, one of them delayed and offered as a tick.
    shows.setShowProfile(show.id, {
      v: 1,
      arrange: {},
      combine: [
        {
          id: 'c1',
          name: 'Kick off sequence',
          steps: [
            { kind: 'event', graphic, control: 'clockStart' },
            { kind: 'event', graphic, control: 'clockStop', after: 3, ask: { default: true } },
          ],
        },
      ],
    });
    const files = await packageFor();
    return { none, arrangeOnly, files, withCombine: files['controller.html'] };
  });

  // WHETHER, NEVER WHAT. The zip carries one boolean: not the control's name, not its steps, not
  // its timings, and not the profile's `combine` array in any form. A package that carried the
  // sequence and could not run it would be the worse half of both answers.
  expect(exported.withCombine).toContain('"combined":true');
  expect(exported.withCombine).not.toContain('Kick off sequence');
  expect(exported.withCombine).not.toContain('"combine"');
  expect(exported.none).toContain('"combined":false');
  expect(exported.arrangeOnly).toContain('"combined":false');

  // THE PAGE DRAWS IT. A zip carrying the right flag and a page that ignores it look identical
  // from here, which is why the package is actually loaded and read.
  const { serve } = relayServe(new Map(Object.entries(exported.files)));
  const origin = 'http://combine-line-host.local';
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await ctl.locator('.cue', { hasText: 'Kick off' }).click();

  // The line, word for word as §6f writes it, where the Combined section sits on the other two
  // surfaces — so an operator taught on those looks in the right place and is told.
  await expect(ctl.locator('#events-combined')).toHaveText(
    'This production’s combined controls run from its hosted control page',
  );
  // …and nothing else of COMBINE: no button, no countdown, no tick.
  await expect(ctl.locator('#editor-events button', { hasText: 'Kick off sequence' })).toHaveCount(0);
  await expect(ctl.locator('#editor-events input[type="checkbox"]')).toHaveCount(0);
  // The generated panel under it is untouched: this is a degradation of the production's own
  // buttons, never of the graphic's.
  await expect(ctl.locator('#editor-events button', { hasText: 'Start clock' })).toBeVisible();
});

// ── THE TWO SPACE MODES (owner, 2026-09-10, docs/PLAYOUT_DASHBOARD.md §2 "Two Space modes"). ──
//
// A two-cue rundown of one lower third, driven from the keys the way an operator drives it.
// Both modes are pinned on this page; the exported controller has its own copy of the decision
// and is pinned below it; the hosted page reads the same table (hosted-control.spec.ts).

/** A production of two cues on one lower third, named so the rundown reads in order. */
async function twoCueRundown(page: Page): Promise<Locator> {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await productionFor(page, 'Evening News');
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await page.getByTestId('cue-label').fill('Anna');
  await expect(rows.first()).toContainText('Anna');
  await page.getByTestId('add-cue').click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben');
  await expect(rows.nth(1)).toContainText('Ben');
  // The verb keys stand down while a field has focus; the walk below is from the rundown.
  await page.getByTestId('cue-label').blur();
  return rows;
}

test('SPACE previews first: the cursor previews nothing, SPACE stages, SPACE airs, SPACE cuts back to PREVIEW', async ({
  page,
}) => {
  const rows = await twoCueRundown(page);
  const previewWhat = page.getByTestId('preview-what');
  const take = page.getByTestId('verb-take');
  const chip = page.getByTestId('live-cue-chip');
  const mode = page.getByTestId('space-mode');

  // Unchecked is the default, and today's behaviour: Ben was selected by adding him, so he is
  // on PREVIEW.
  await expect(mode).not.toBeChecked();
  await expect(previewWhat).toHaveText('Ben');
  await mode.check();
  await expect(mode).toBeChecked();
  // Switching keeps the picture still: what the operator was looking at stays on PREVIEW.
  await expect(previewWhat).toHaveText('Ben');

  // THE CURSOR IS ONLY A CURSOR. Up to Anna: she is selected, Ben is still on PREVIEW, and the
  // button says what the next press does. (Focus is still on the checkbox after the click; a
  // checkbox is not typing, so the keys stay the verbs' - `typingInto` in playoutKeys.ts.)
  await page.keyboard.press('ArrowUp');
  await expect(rows.nth(0)).toHaveClass(/selected/);
  await expect(rows.nth(0)).not.toHaveClass(/on-pvw/);
  await expect(rows.nth(1)).toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Ben');
  await expect(take).toHaveText(/→ PREVIEW/);
  await expect(page.locator('.pd-editor-kicker')).toHaveText(/SELECTED CUE · 1/);

  // SPACE stages. Nothing airs; the press was a verb, not a second flip of the checkbox.
  await page.keyboard.press('Space');
  await expect(mode).toBeChecked();
  await expect(rows.nth(0)).toHaveClass(/on-pvw/);
  await expect(rows.nth(1)).not.toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Anna');
  await expect(chip).toContainText('nothing on air');
  await expect(take).toHaveText(/⟳ TAKE/);
  await expect(page.locator('.pd-editor-kicker')).toHaveText(/PREVIEW CUE · 1/);

  // SPACE airs, and the cue STAYS on PREVIEW so the next press is the off half of the toggle.
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).toHaveClass(/on-air/);
  await expect(chip).toContainText('Anna');
  await expect(previewWhat).toHaveText('Anna');
  await expect(take).toHaveText(/■ TAKE OFF/);

  // SPACE takes it off and leaves it on PREVIEW.
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).not.toHaveClass(/on-air/);
  await expect(rows.nth(0)).toHaveClass(/on-pvw/);
  await expect(chip).toContainText('nothing on air');

  // THE MIXER CUT from a cue the cursor had left. Anna back on air; Ben staged beside her (she
  // stays up - PREVIEW is a check, not a tally); back to Anna, and SPACE takes her off AND puts
  // her on PREVIEW in Ben's place.
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).toHaveClass(/on-air/);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Space');
  await expect(rows.nth(1)).toHaveClass(/on-pvw/);
  await expect(rows.nth(0)).toHaveClass(/on-air/);
  await expect(previewWhat).toHaveText('Ben');
  await page.keyboard.press('ArrowUp');
  await expect(take).toHaveText(/■ TAKE OFF/);
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).not.toHaveClass(/on-air/);
  await expect(rows.nth(0)).toHaveClass(/on-pvw/);
  await expect(rows.nth(1)).not.toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Anna');
  await expect(chip).toContainText('nothing on air');

  // The habit survives a reload; the PREVIEW does not, because a check of what is about to air
  // is not something to trust from before the page went away.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('space-mode')).toBeChecked();
  await expect(page.getByTestId('preview-what')).toHaveText('nothing in preview');
  await expect(page.locator('.pd-pvw .pd-frame-empty')).toContainText('SPACE on the selected cue');
  await expect(page.getByTestId('verb-take')).toHaveText(/→ PREVIEW/);
});

test('the default SPACE mode is unchanged: selecting previews, SPACE airs, SPACE takes off', async ({ page }) => {
  const rows = await twoCueRundown(page);
  const previewWhat = page.getByTestId('preview-what');
  const take = page.getByTestId('verb-take');
  await expect(page.getByTestId('space-mode')).not.toBeChecked();

  // Walking the rundown IS previewing: the arrow moves the amber tally with the cursor.
  await page.keyboard.press('ArrowUp');
  await expect(rows.nth(0)).toHaveClass(/selected/);
  await expect(rows.nth(0)).toHaveClass(/on-pvw/);
  await expect(rows.nth(1)).not.toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Anna');
  // There is no PREVIEW face in this mode: the first press airs.
  await expect(take).toHaveText(/⟳ TAKE/);
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).toHaveClass(/on-air/);
  await expect(take).toHaveText(/■ TAKE OFF/);
  await page.keyboard.press('Space');
  await expect(rows.nth(0)).not.toHaveClass(/on-air/);
  await expect(rows.nth(0)).toHaveClass(/on-pvw/);

  // The two modes are the same table on every surface - the decision itself, pinned once.
  const table = await page.evaluate(async () => {
    const { spaceAction } = await import('/src/components/playoutKeys.ts');
    const states = [
      { live: false, previewed: false },
      { live: false, previewed: true },
      { live: true, previewed: true },
      { live: true, previewed: false },
    ];
    return {
      take: states.map((s) => spaceAction('take', s)),
      previewThenTake: states.map((s) => spaceAction('preview-then-take', s)),
    };
  });
  expect(table.take).toEqual(['take', 'take', 'take-off', 'take-off']);
  expect(table.previewThenTake).toEqual(['preview', 'take', 'take-off', 'take-off']);
});

test('the EXPORTED controller carries both SPACE modes, read off the relay: preview stream first, then program', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  // The third surface, with its own copy of the decision (docs/CONTROL_PANEL_PARITY.md). Its
  // PREVIEW is a real second stream, so "on PREVIEW" is a row on the wire and the assertions
  // read the wire: which STREAM each `cue` tally row went to, and in what order.
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const b64 = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const shows = await import('/src/model/shows.ts');
    const { buildShowZipFor } = await import('/src/export/showExport.ts');
    const tpl = variantById('lt01')!.create({});
    const { doc } = createGraphic(tpl, { name: 'Hairline' });
    const show = shows.createShowNamed('Evening News');
    shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
    const first = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, first.cues![0].id, { label: 'Anna' });
    shows.addShowCue(show.id, first.graphics[0].id, { label: 'Ben' });
    // A THIRD cue on a SECOND graphic (its own layer), for the cross-graphic half below.
    const tpl2 = variantById('lt02')!.create({});
    const { doc: doc2 } = createGraphic(tpl2, { name: 'Second strap' });
    shows.addGraphicToShow(show.id, tpl2, { graphicId: doc2!.id });
    const withSecond = shows.loadShows().find((s) => s.id === show.id)!;
    shows.updateShowCue(show.id, withSecond.cues![2].id, { label: 'Cara' });
    const fresh = shows.loadShows().find((s) => s.id === show.id)!;
    const zip = await buildShowZipFor(fresh, 'html-overlay');
    return zip.generateAsync({ type: 'base64' });
  });

  const zip = await JSZip.loadAsync(b64, { base64: true });
  const files = new Map<string, string>();
  for (const n of Object.keys(zip.files)) {
    if (!zip.files[n].dir && /\.(html|json)$/.test(n)) files.set(n.replace(/^[^/]+\//, ''), await zip.file(n)!.async('string'));
  }
  const { serve, rows } = relayServe(files);
  const origin = 'http://evening-host.local';
  const ctl = await context.newPage();
  await routeOrigin(ctl, origin, serve);
  await ctl.goto(`${origin}/controller.html`, { waitUntil: 'load' });
  await expect(ctl.locator('#mode')).toContainText('SHOW');

  /** The tally rows so far, as `stream:on|off`, oldest first. Both cues are one graphic, so the
   *  stream and the direction are the whole story. */
  const tallies = () =>
    rows
      .filter((r) => (r.msg as { t: string }).t === 'cue')
      .map((r) => `${r.stream}:${(r.msg as { cue: string | null }).cue === null ? 'off' : 'on'}`);
  const anna = ctl.locator('.cue', { hasText: 'Anna' });
  const ben = ctl.locator('.cue', { hasText: 'Ben' });
  const take = ctl.locator('#v-take');
  const mode = ctl.locator('#space-mode');

  // DEFAULT MODE: the page opens with the first cue selected, and selecting a row previews it.
  await expect(mode).not.toBeChecked();
  await ben.click();
  await expect(ben).toHaveClass(/on-pvw/, { timeout: 10_000 });
  expect(tallies()).toEqual(['preview:on']);
  await expect(take).toHaveText(/⟳ TAKE/);

  // PREVIEW-THEN-TAKE. Selecting Anna sends nothing; the button says the next press previews.
  await mode.check();
  await expect(mode).toBeChecked();
  await anna.click();
  await expect(anna).toHaveClass(/selected/);
  await expect(take).toHaveText(/→ PREVIEW/);
  expect(tallies()).toEqual(['preview:on']);

  // SPACE stages: one preview-stream tally, no program row. The press was a verb, and the
  // checkbox is still checked - it gave the keys back on its own click.
  await ctl.keyboard.press('Space');
  await expect(anna).toHaveClass(/on-pvw/, { timeout: 10_000 });
  await expect(mode).toBeChecked();
  expect(tallies()).toEqual(['preview:on', 'preview:on']);
  await expect(take).toHaveText(/⟳ TAKE/);

  // SPACE airs; SPACE takes off. Both program-stream rows, and PREVIEW keeps the cue.
  await ctl.keyboard.press('Space');
  await expect(anna).toHaveClass(/on-air/, { timeout: 10_000 });
  await expect(take).toHaveText(/■ TAKE OFF/);
  await ctl.keyboard.press('Space');
  await expect(anna).not.toHaveClass(/on-air/, { timeout: 10_000 });
  await expect(anna).toHaveClass(/on-pvw/);
  expect(tallies()).toEqual(['preview:on', 'preview:on', 'program:on', 'program:off']);

  // THE MIXER CUT from a cue the cursor left: Anna on air, Ben staged over her on PREVIEW (same
  // graphic, same layer), back to Anna, SPACE. Program goes off, and Anna returns to PREVIEW
  // with a preview-stream row of her own, because Ben had taken that stream from her.
  await ctl.keyboard.press('Space');
  await expect(anna).toHaveClass(/on-air/, { timeout: 10_000 });
  await ctl.keyboard.press('ArrowDown');
  await expect(ben).toHaveClass(/selected/);
  await ctl.keyboard.press('Space');
  await expect(ben).toHaveClass(/on-pvw/, { timeout: 10_000 });
  await expect(anna).toHaveClass(/on-air/);
  await ctl.keyboard.press('ArrowUp');
  await expect(take).toHaveText(/■ TAKE OFF/);
  await ctl.keyboard.press('Space');
  await expect(anna).not.toHaveClass(/on-air/, { timeout: 10_000 });
  await expect(anna).toHaveClass(/on-pvw/);
  await expect(ben).not.toHaveClass(/on-pvw/);
  expect(tallies().slice(-3)).toEqual(['preview:on', 'program:off', 'preview:on']);

  // THE OWNER'S GESTURE AS FAST AS A HAND MAKES IT: two presses inside this page's 400 ms log
  // poll, on a fresh cue. "On PREVIEW" is held the moment the preview rows are sent, so the
  // second press AIRS. Read back off the poll instead, both presses previewed and nothing aired.
  await ctl.keyboard.press('ArrowDown');
  await expect(ben).toHaveClass(/selected/);
  await ctl.keyboard.press('Space');
  await ctl.keyboard.press('Space');
  await expect(ben).toHaveClass(/on-air/, { timeout: 10_000 });
  expect(tallies().slice(-2)).toEqual(['preview:on', 'program:on']);

  // CROSS-GRAPHIC: staging Cara (a second graphic on its own layer) REPLACES Ben on PREVIEW -
  // the strap leaves the preview stream - and coming back to Ben reads as not previewed, the
  // answer the React pages give from their single staged id.
  const cara = ctl.locator('.cue', { hasText: 'Cara' });
  await ctl.keyboard.press('Space');
  await expect(ben).not.toHaveClass(/on-air/, { timeout: 10_000 });
  await cara.click();
  await ctl.keyboard.press('Space');
  await expect(cara).toHaveClass(/on-pvw/, { timeout: 10_000 });
  await expect(ben).not.toHaveClass(/on-pvw/);
  expect(tallies().slice(-2)).toEqual(['preview:off', 'preview:on']);
  await ben.click();
  await expect(take).toHaveText(/→ PREVIEW/);
});
