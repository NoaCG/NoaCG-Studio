import { expect, type Locator, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { addToProductionFromFinish, startNewProject } from './_create';

// THE SVG IMPORT WALK, shared by the offline spec and the live one.
//
// Written once because it is walked twice, and the two runs must not drift: the offline suite
// drives it against the local monitors, the configured suite drives the SAME steps against a
// published production and the real /output renderer. A divergence between them would read as
// "the hosted road is broken" when it was only the walk that differed.
//
// The fixtures are the SHIPPED SAMPLES rather than copies under e2e/fixtures — the files a
// designer is handed are the files the tests walk.

export const SCOREBUG_SVG = fileURLToPath(new URL('../docs/svg-samples/scorebug.svg', import.meta.url));
export const QUIZ_SVG = fileURLToPath(new URL('../docs/svg-samples/quiz-board.svg', import.meta.url));

/** The live-vote board (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). It sits in the EXPORTER CORPUS
 *  rather than beside the two samples above because that is what it is: a file carrying one
 *  exporter's byte idioms, with a sidecar stating what its designer expects
 *  (e2e/fixtures/svg-corpus/README.md). A shipped sample is a file a designer is HANDED, and the
 *  vote board is not offered as one yet. */
export const VOTE_SVG = fileURLToPath(
  new URL('./fixtures/svg-corpus/illustrator-live-vote-band.svg', import.meta.url),
);

/** The FOUR-TEAM score board (docs/backlog/scoreboard-behaviour.md), in the corpus for the vote
 *  band's reason and one of its own: the shipped `scorebug.svg` sample has two teams and names
 *  them Home and Away, which is the shape the score behaviour deliberately does NOT propose for.
 *  A class quiz with four groups is the graphic the 2026-09-12 production actually needs. */
export const SCORE_SVG = fileURLToPath(
  new URL('./fixtures/svg-corpus/illustrator-four-team-scoreboard.svg', import.meta.url),
);

/** The QUESTION TIMER card (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13), in the corpus for the same
 *  reason as the two above. It is the only fixture anywhere that carries a clock a designer
 *  MEANT as a countdown: the shipped `scorebug.svg` draws a match clock, which is a scoreboard
 *  with a clock on it rather than a countdown, and the difference is exactly what
 *  `proposeTimerBinding` has to be able to tell. */
export const TIMER_SVG = fileURLToPath(
  new URL('./fixtures/svg-corpus/illustrator-question-timer-board.svg', import.meta.url),
);

/**
 * TUTORIAL FRAMES, off by default.
 *
 *   NOACG_TUTORIAL_SHOTS=<dir> npx playwright test <spec> -g "<one test title>"
 *
 * A tutorial pack (docs/tutorials/) is a spoken script, an instruction sheet and one picture per
 * step. The pictures are the half that ROTS: a hand-taken folder of screenshots teaches a screen
 * that no longer exists, and a PNG cannot fail a build. So the pack's frames are captured by the
 * walk that already has to pass - if the import road changes shape, the spec goes red and the
 * frames are re-shot from the road as it now is, in the same fix.
 *
 * The step names are the road's, not any one pack's, because every SVG import pack walks the same
 * five wizard steps in the same order. The two beats after the wizard belong to whichever spec
 * drives the production, so those are named there.
 *
 * Deliberately a SECOND switch beside NOACG_SHOTS, which import-svg-behaviour.spec.ts uses for its
 * own review frames: those are numbered by a reviewer's reading order across the whole file and
 * are taken wholesale, where these are one ordered sequence per walk. One directory holding both
 * numbering schemes would read as a broken sequence.
 */
const TUTORIAL_SHOTS = process.env.NOACG_TUTORIAL_SHOTS ?? '';

/**
 * WAIT FOR THE PICTURE, NOT ONLY FOR THE FORM.
 *
 * A shutter fired the instant an assertion passes catches a step whose live preview has not
 * painted yet: the first run of this capture produced a Fields step with an empty preview pane,
 * which is a frame that teaches a broken product. `WizardPreview` stamps `data-doc-rev` on its
 * stage once a rebuilt document has LOADED (the same contract as PreviewFrame's, e2e/_preview.ts),
 * so a step that has a stage waits for one.
 *
 * The pause after it is for the entrance, and it is honest about being a pause: GSAP animates
 * inline styles from rAF, so Playwright's `animations: 'disabled'` does not park it and nothing
 * stamps its end. It is only ever paid on a capture run.
 */
async function settleForCamera(page: Page): Promise<void> {
  await page.evaluate(() => document.fonts.ready).catch(() => {});
  const stage = page.locator('.wz-stage');
  if (await stage.count()) {
    // BOTH HALVES, in this order. `data-doc-pending` is set synchronously the moment the template
    // changes and only `data-doc-rev` says a document has LOADED, so either alone lets a shutter
    // through on a stage that is between two documents - which is an empty preview pane.
    await expect(stage.first()).not.toHaveAttribute('data-doc-pending', '1', { timeout: 20_000 });
    await expect(stage.first()).toHaveAttribute('data-doc-rev', /\d/, { timeout: 20_000 });
  }
  await page.waitForTimeout(1_500);
}

export async function tutorialShot(page: Page, step: string): Promise<void> {
  if (!TUTORIAL_SHOTS) return;
  mkdirSync(TUTORIAL_SHOTS, { recursive: true });
  await settleForCamera(page);
  // `animations: 'disabled'` parks CSS and Web animations at their end state, which is what a
  // settled surface looks like - the same choice scripts/docs-shots.mjs makes for the same reason.
  await page.screenshot({ path: `${TUTORIAL_SHOTS}/${step}.png`, animations: 'disabled' });
}

/**
 * A SECOND FRAME OF A STEP THAT IS TALLER THAN THE WINDOW.
 *
 * The Fields step runs well past the fold - the behaviour picker, the text-fit answers, the
 * pictures and the typefaces are all below it - and a pack whose only frame of that step is its
 * top third teaches somebody to record a screen they have not seen. Scrolling happens ONLY on a
 * capture run, so an ordinary run's scroll position is untouched.
 */
export async function tutorialShotAt(page: Page, step: string, target: Locator): Promise<void> {
  if (!TUTORIAL_SHOTS) return;
  // CENTRED, and never `scrollIntoViewIfNeeded`. The production page keeps its monitors and verb
  // row STICKY over the cue editor, so an element scrolled up behind them still counts as in view
  // and that helper does nothing - measured on the unsent-changes note, which stayed hidden under
  // the monitors in the first two capture runs. Centring clears any sticky band at either end.
  await target.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await tutorialShot(page, step);
}

/** The wizard's own Next. Scoped to the modal because the live walk runs with ADVANCED MODE on,
 *  which puts the editor's `» Next` verb on the page behind it — an unscoped role match then
 *  resolves to two buttons and the walk dies on the first step. */
function wizardNext(page: Page) {
  return page.locator('.wz-modal').getByRole('button', { name: 'Next' });
}

/**
 * Drop a file on the Import door and land on the SVG mapping step.
 *
 * OPENS THE WIZARD IF IT IS NOT ALREADY SHOWING, rather than requiring the caller to have
 * arrived on a surface that happens to auto-open it. A COLD `/app` opens the wizard by itself,
 * which is the offline walk's world; a SIGNED-IN load does not necessarily, because the account
 * syncs and the app can restore a previous project and land in the editor instead. That
 * difference is invisible until it bites: on the local-stack CI run 32795037259 this walk
 * inherited another spec's "Hairline" as the open project and failed on `.wz-modal` never
 * appearing - a message that sends the reader looking for a broken wizard rather than for two
 * specs sharing one account.
 *
 * `startNewProject` is the deterministic opener: it clicks + New graphic and answers the
 * discard-current-work guard when one appears. Wiping the library does NOT substitute for it -
 * the restored project reads "Not saved", so it is not a library row and there is nothing there
 * to delete.
 */
export async function dropSvg(page: Page, fixture: string): Promise<void> {
  const modal = page.locator('.wz-modal');
  // WAIT for the auto-open before deciding, never sample it. `isVisible()` answers about THIS
  // instant and does not retry, so called straight after a navigation it reports false while the
  // wizard is still mounting - on a cold /app that is the normal case, not the exception. The
  // first version of this helper did exactly that and opened a second wizard on every offline
  // run, where `+ New graphic` then matched both the topbar's and the wizard's own copy:
  // "strict mode violation: resolved to 2 elements" (CI run 32807175809).
  const autoOpened = await modal
    .waitFor({ state: 'visible', timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!autoOpened) await startNewProject(page);
  await expect(modal).toBeVisible();
  await tutorialShot(page, 'step-1-import-door');
  await page.locator('[data-entry="import-graphic"]').click();
  await tutorialShot(page, 'step-2-drop-zone');
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fixture);
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await tutorialShot(page, 'step-3-what-it-found');
  await wizardNext(page).click();
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();
  await tutorialShot(page, 'step-4-fields');
}

/**
 * From the mapping step to a production page with the graphic in it as a cue.
 *
 * `production` names a NEW production; pass an existing name and the picker would still mint a
 * second one, which is deliberate — a walk that reused whatever was lying around would inherit
 * another run's cues.
 */
export async function intoProduction(page: Page, graphic: string, production: string): Promise<void> {
  // Waiting on the STEP COUNTER, not on the hash: the live walk arrives signed in and the wizard
  // it opens does not always carry a `#/new/step/…` route, so a URL assertion passes offline and
  // times out against a real backend on the same clicks. The counter is the same in both, and it
  // is also the settle the second click needs — clicking Next twice in a row without one lands
  // the second on a step that has not re-rendered.
  await wizardNext(page).click(); // Animation
  await expect(page.getByTestId('wz-stepcount')).toContainText('4');
  await tutorialShot(page, 'step-5-animation');
  await wizardNext(page).click(); // Finish
  await expect(page.getByTestId('wz-stepcount')).toContainText('5');
  await page.getByTestId('wz-finish-name').fill(graphic);
  await page.getByTestId('wz-finish-production-pick').locator('select').selectOption('new');
  await page.getByTestId('wz-finish-production-name').fill(production);
  // Both boxes FILLED, because the frame's whole job is to show that they are two boxes.
  await tutorialShot(page, 'step-6-finish');
  await addToProductionFromFinish(page);
  // 20 s: landing on the page builds the graphic's document, and the cold Prettier format is the
  // same cost import-graphic.spec.ts documents.
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await tutorialShot(page, 'step-7-production');
}

/**
 * UNTICK ONE TEXT ROW AND ANSWER THE QUESTION IT ASKS.
 *
 * Unticking is two clicks, not one (owner walk, 2026-09-02): the step asks what should happen to
 * the words the layer leaves behind, and the row stays ticked until that is answered - so a bare
 * `uncheck()` fails with "clicking the checkbox did not change its state", which is a true report
 * of a walk that has not finished. `'keep'` is the primary answer and what unticking always used
 * to mean; `'remove'` takes the layer off the artwork.
 *
 * One helper because three specs walk this and every one of them means the same thing by it.
 */
export async function untickTextRow(
  page: Page,
  candidateId: string,
  answer: 'keep' | 'remove' = 'keep',
): Promise<void> {
  await page.getByTestId(`map-svg-row-${candidateId}`).locator('input[type="checkbox"]').click();
  await expect(page.getByTestId('map-svg-off-dialog')).toBeVisible();
  // Portalled out of the wizard, not nested in it (e2e/overlay-layers.spec.ts holds the rule).
  // The wizard's full-screen shell is a stacking context, so a dialog left inside it is pinned
  // below the app's corner notices whatever z-index it carries - which on a hosted deployment
  // means an unanswered consent banner takes this dialog's buttons, the issue #50 failure in
  // the one walk the student release is built on. Asserted here because this is the only
  // helper that opens the dialog, so all three specs that walk it get the guard.
  expect(
    await page.evaluate(() => document.querySelectorAll('.gallery-backdrop.wz-full .gallery-backdrop').length),
    'the off-dialog must be portalled to the body, not nested inside the wizard shell',
  ).toBe(0);
  await page.getByTestId(`map-svg-off-${answer}`).click();
  await expect(page.getByTestId('map-svg-off-dialog')).toBeHidden();
}

/** Tick every detected text layer. Every one of them arrives ticked, so this is a guard rather
 *  than a step of the walk: it keeps the two suites honest if a future default ever changes
 *  under them, without either of them silently binding half a board. */
export async function bindEveryTextLayer(page: Page): Promise<void> {
  const boxes = page.getByTestId('map-svg-fields').locator('input[type="checkbox"]');
  for (const box of await boxes.all()) if (!(await box.isChecked())) await box.check();
}

/**
 * THE LAYER NAME A MAPPING ROW CARRIES, whichever shape that row is.
 *
 * An ordinary row names its layer in an editable Field name box. A row whose layer a bound
 * BEHAVIOUR writes has no such box - it is not a field, so there is nothing to name it with -
 * and states the layer's name in its own sentence instead. Asking for the box on one of those
 * waits out the timeout and then reports a missing element rather than a different kind of row.
 *
 * Here rather than in a spec because three specs read it and the corpus file had already grown
 * two copies: `labels()` and `rowLabelled()` sit two lines apart and only one of them had been
 * taught the second shape.
 */
export async function rowLayerName(row: Locator, candidateId: string): Promise<string> {
  const title = row.locator(`[data-testid="map-svg-title-${candidateId}"]`);
  if (await title.count()) return title.inputValue();
  return (await row.locator(`[data-testid="map-svg-driven-${candidateId}"] strong`).textContent()) ?? '';
}

/** The candidate id of the mapping row for the layer the DESIGNER named, so a test names their
 *  own layer rather than a position in the checklist. */
export async function rowLabelled(page: Page, label: RegExp): Promise<string> {
  const rows = page.getByTestId('map-svg-fields').locator('[data-testid^="map-svg-row-"]');
  for (const row of await rows.all()) {
    const id = ((await row.getAttribute('data-testid')) ?? '').replace('map-svg-row-', '');
    if (label.test(await rowLayerName(row, id))) return id;
  }
  throw new Error(`no mapping row labelled ${label} on this file`);
}
