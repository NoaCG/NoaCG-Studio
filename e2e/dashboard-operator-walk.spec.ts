import { test, expect, type Page } from '@playwright/test';
import { dropSvg, intoExistingProduction, intoProduction, QUIZ_SVG, SCOREBUG_SVG } from './_svg-import';
import { settleDurableWrites } from './_durable';

// THE OPERATOR WALK (docs/GOALS.md NOW item 3: "the playout dashboard has to work flawlessly").
//
// One production holding the two graphics a class quiz is run with - an IMPORTED quiz board and
// an IMPORTED scoreboard - driven from the dashboard through every press the student makes on
// the night: take, the quiz's select, lock and reveal, the score's +1 and -1, a typed update,
// the next question, and out. Then the same production through a reload and a cold boot, which
// is what a laptop that sleeps or a browser that crashes mid-show does.
//
// Every other spec proves one of these presses on its own. What only a WALK finds is the state
// one press leaves for the next one: a lock that survives into the next question, a take on one
// layer that clears the other, a reload that brings the dashboard back with air and screen
// disagreeing. And it fails on ANY console error, because a student reads a red console as
// "it is broken" and so does the owner.

/** Every console error and uncaught exception the page (and its monitor frames) raise. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

/** Select the rundown row whose label carries `label`. */
async function selectCue(page: Page, label: string | RegExp): Promise<void> {
  await page.getByTestId('select-cue').filter({ hasText: label }).first().click();
}

/** Frames for a person to look at, off by default: `NOACG_SHOTS=<dir>` writes one per beat. */
const SHOTS = process.env.NOACG_SHOTS ?? '';
async function shot(page: Page, name: string): Promise<void> {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/walk-${name}.png` });
}

/**
 * What one layer of the PROGRAM monitor is actually PAINTING: the computed opacity of the
 * graphic's root (the exit ends by setting it to 0) and its machine's main state. Read inside the
 * layer's own document, because the header and the tally only say what the page believes.
 */
async function programPicture(page: Page, title: string): Promise<{ opacity: string; main: string } | null> {
  const handle = await page.locator(`[data-testid="program-stage"] iframe[title="${title}"]`).elementHandle();
  const frame = await handle?.contentFrame();
  if (!frame) return null;
  return (await frame.evaluate(`(() => {
    const root = document.querySelector(NOACG_ANIM.root);
    const state = window.noacgMachineState ? window.noacgMachineState() : null;
    return { opacity: root ? getComputedStyle(root).opacity : 'no root', main: state && state.groups ? state.groups.main : 'none' };
  })()`)) as { opacity: string; main: string };
}

/** The PROGRAM monitor holds one frame per layer, titled with its graphic's name. */
const quiz = (page: Page) => page.frameLocator('[data-testid="program-stage"] iframe[title="Quiz board"]');
const score = (page: Page) => page.frameLocator('[data-testid="program-stage"] iframe[title="Team score"]');

test('an imported quiz and scoreboard run from one dashboard through every press, a reload and a cold boot', async ({
  page,
  context,
}) => {
  test.setTimeout(180_000);
  const errors = watchErrors(page);

  // ── Build the show: the quiz first, then the scoreboard into the SAME production. ──
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await intoProduction(page, 'Quiz board', 'Friday Quiz');
  await settleDurableWrites(page);
  await page.goto('/app');
  await dropSvg(page, SCOREBUG_SVG);
  await intoExistingProduction(page, 'Team score', 'Friday Quiz');
  await settleDurableWrites(page);

  const rundown = page.getByTestId('select-cue');
  await expect(rundown).toHaveCount(2);

  // The two graphics must be on DIFFERENT layers, or taking the score takes the quiz off air.
  const layers = await page.getByTestId('cue-layer').allTextContents();
  expect(new Set(layers).size, `both graphics on ${layers.join(' and ')}`).toBe(2);

  // ── The quiz: key C, take, the contestant picks B, lock, reveal. ──
  await selectCue(page, 'Quiz board');
  await page.getByTestId('cue-field-f5-opt-C').click();
  await page.getByTestId('cue-field-f6-opt-B').click();
  await page.getByTestId('verb-take').click();
  const chip = page.getByTestId('machine-state-chip');
  await expect(chip).toHaveText('Question');
  // Reveal choice belongs to the hidden-pick road (docs.html #quiz-run), so it is grey here, and
  // its title says so in the operator's words rather than the machine's event id.
  const revealChoice = page.getByTestId('cue-action-revealChoice');
  await expect(revealChoice).toBeDisabled();
  await expect(revealChoice).toHaveAttribute('title', 'Reveal choice does nothing from where the graphic is now, so it is greyed out');

  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(quiz(page).locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await expect(quiz(page).locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/);
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(quiz(page).locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);

  // ── The scoreboard: take it BESIDE the quiz, +1 twice, -1 once, then a typed name. ──
  await selectCue(page, 'Team score');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('Quiz board');
  await expect(page.getByTestId('live-cue-chip')).toContainText('Team score');
  const live = page.getByTestId('live-numbers');
  await live.getByTestId('live-number-f1-up').click();
  await live.getByTestId('live-number-f1-up').click();
  await live.getByTestId('live-number-f2-down').click();
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('4');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('0');
  await expect(score(page).locator('#f1')).toHaveText('4');
  await expect(score(page).locator('#f2')).toHaveText('0');
  await page.getByTestId('cue-field-f0').fill('Ilves');
  await expect(page.getByTestId('cue-unsent')).toContainText('not on air yet');
  await page.getByTestId('verb-update').click();
  await expect(score(page).locator('#f0')).toHaveText('Ilves');
  // PREVIEW shows the selected cue as a Take would air it, so it follows every figure too.
  const preview = page.frameLocator('[data-testid="production-preview"] iframe');
  await expect(preview.locator('#f0')).toHaveText('Ilves');
  await expect(preview.locator('#f1')).toHaveText('4');
  await shot(page, '1-both-on-air');
  // The quiz's verdict is still up while the score moved: a take on one layer leaves the other.
  await expect(quiz(page).locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);

  // ── RELOAD mid-show. ──
  // UNPUBLISHED, nothing ever left this machine (ProductionPage `runVerb`), so a reload has
  // nothing on air to come back to and the honest dashboard says so. What must survive is the
  // show itself: every figure the operator moved and every value they typed. The published
  // half, where air outlives the page, is e2e/configured/dashboard-hosted-walk.spec.ts.
  await page.waitForTimeout(400);
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  // The activity log starts empty too, for the same reason, and says so in plain words rather
  // than looking like the night's presses were lost (Friday rehearsal, 2026-09-21).
  await page.getByTestId('action-log').locator('summary').click();
  await expect(page.getByTestId('action-log-row')).toHaveCount(0);
  await expect(page.getByTestId('action-log-empty')).toHaveText(
    /not published, so the list starts empty each time the page opens/,
  );
  await shot(page, '2-after-reload');
  await selectCue(page, 'Team score');
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('4');
  await expect(page.getByTestId('cue-field-f2')).toHaveValue('0');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('Ilves');
  await page.getByTestId('verb-take').click();
  await expect(score(page).locator('#f1')).toHaveText('4');
  await expect(score(page).locator('#f0')).toHaveText('Ilves');
  await selectCue(page, 'Quiz board');
  await expect(page.getByTestId('cue-field-f5-opt-C')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('verb-take').click();
  await expect(chip).toHaveText('Question');
  await page.getByRole('button', { name: /Select answer/ }).click();
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(chip).toHaveText(/Reveal/);
  // Only Out is left on the quiz's path, so » Next greys and its title says why - it used to
  // stay live, do nothing on air, and still log "Next step".
  await expect(page.getByTestId('verb-next')).toBeDisabled();
  await expect(page.getByTestId('verb-next')).toHaveAttribute('title', /last step/);
  // ✎ Update is data only, so new words typed over a reveal would air under the old verdict.
  // The note names the state Update keeps and points at Re-take.
  await page.getByTestId('cue-field-f0').fill('Which planet is the largest?');
  await expect(page.getByTestId('cue-unsent')).toContainText('Update keeps Reveal on air');
  await expect(page.getByTestId('verb-update')).toHaveAttribute('title', 'Sends the values. Stays on Reveal.');

  // ── NEXT QUESTION: a copy of the quiz cue, a new key, taken over the revealed one. ──
  await page.getByTestId('cue-menu').first().click();
  await page.getByRole('menuitem', { name: 'Duplicate' }).click();
  await expect(rundown).toHaveCount(3);
  await page.getByTestId('cue-field-f5-opt-A').click();
  await page.getByTestId('verb-take').click();
  // A fresh question: no verdict, no lock, no pick carried over from the last one.
  await expect(chip).toHaveText('Question');
  await expect(quiz(page).locator('.imported-design-look.imported-design-on')).toHaveCount(0);
  await page.getByTestId('cue-field-f6-opt-D').click();
  await page.getByRole('button', { name: /Select answer/ }).click();
  await expect(quiz(page).locator('[data-noacg-role~="answer.selected/D"]')).toHaveClass(/imported-design-on/);
  await page.getByRole('button', { name: /Lock it in/ }).click();
  await page.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(quiz(page).locator('[data-noacg-role~="answer.correct/A"]')).toHaveClass(/imported-design-on/);
  await expect(quiz(page).locator('[data-noacg-role~="answer.wrong/D"]')).toHaveClass(/imported-design-on/);
  await shot(page, '3-next-question-revealed');
  // The score never left.
  await expect(score(page).locator('#f1')).toHaveText('4');

  // ── COLD BOOT: the tab is gone, and a new one opens the production from its address. ──
  await page.waitForTimeout(400);
  await settleDurableWrites(page);
  const url = page.url();
  await page.close();
  const cold = await context.newPage();
  const coldErrors = watchErrors(cold);
  await cold.goto(url);
  await expect(cold.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(cold.getByTestId('select-cue')).toHaveCount(3);
  await expect(cold.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await selectCue(cold, 'Team score');
  await expect(cold.getByTestId('cue-field-f1')).toHaveValue('4');
  await cold.getByTestId('verb-take').click();
  await selectCue(cold, /Quiz board copy/);
  await cold.getByTestId('verb-take').click();
  await expect(cold.getByTestId('machine-state-chip')).toHaveText('Question');
  await expect(quiz(cold).locator('.imported-design-look.imported-design-on')).toHaveCount(0);

  // ── OUT, one layer at a time, then nothing is stuck on air. ──
  await selectCue(cold, 'Team score');
  await cold.getByTestId('verb-out').click();
  await expect(cold.getByTestId('live-cue-chip')).not.toContainText('Team score');
  // THE PICTURE LEAVES TOO, not only the header. The demo rehearsal of 2026-09-21 reported the
  // monitor still painting a graphic after Out while the header said nothing was on air, so each
  // Out is read off the monitor's own document: its root faded to nothing and its machine off.
  await expect.poll(() => programPicture(cold, 'Team score')).toEqual({ opacity: '0', main: 'off' });
  await expect.poll(() => programPicture(cold, 'Quiz board')).toEqual({ opacity: '1', main: 'question' });
  await selectCue(cold, /Quiz board copy/);
  await cold.getByTestId('verb-out').click();
  await expect(cold.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect.poll(() => programPicture(cold, 'Quiz board')).toEqual({ opacity: '0', main: 'off' });
  await cold.waitForTimeout(1_500);
  await expect(cold.getByTestId('live-cue-chip')).toContainText('nothing on air');
  expect(await programPicture(cold, 'Quiz board')).toEqual({ opacity: '0', main: 'off' });

  expect([...errors, ...coldErrors]).toEqual([]);
});

test('a burst of commands runs in order even while the entrance waits for its fonts', async ({ page }) => {
  // THE LATE RENDERER. A renderer that opens after the operator has taken, selected and locked
  // replays those rows in one burst (src/output/main.ts catch-up). 'play' waits for the fonts
  // and used to let the two events behind it run first, against a machine that was still off,
  // so both were dropped and the board came up on the question with no lock. Configured run
  // 35628443262 found it on the real renderer; this pins the document half offline, with a
  // font that takes two seconds to answer so the wait is certain rather than a race.
  await page.route('**/slow-font.woff2', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    await route.fulfill({ status: 404, body: '' });
  });
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await intoProduction(page, 'Quiz board', 'Burst');
  const after = await page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { postPreviewCmd } = await import('/src/preview/previewProtocol.ts');
    const graphic = loadGraphics().find((g) => g.name === 'Quiz board')!;
    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:absolute;left:-9999px;width:1920px;height:1080px';
    document.body.appendChild(frame);
    await new Promise((resolve) => {
      frame.onload = resolve;
      frame.srcdoc = composeDocument(graphic.template, { liveControl: true });
    });
    const doc = frame.contentDocument!;
    const slow = new FontFace('Slow', 'url(/slow-font.woff2)');
    doc.fonts.add(slow);
    void slow.load().catch(() => undefined);
    const win = frame.contentWindow!;
    postPreviewCmd(win, { cmd: 'update', data: JSON.stringify({ f5: 'C', f6: 'B' }) });
    postPreviewCmd(win, { cmd: 'play' });
    postPreviewCmd(win, { cmd: 'dispatch', event: 'select', payload: { f6: 'B' } });
    postPreviewCmd(win, { cmd: 'dispatch', event: 'lock' });
    await new Promise((resolve) => setTimeout(resolve, 3_500));
    const state = (win as unknown as { noacgMachineState(): { groups: Record<string, string> } }).noacgMachineState();
    return {
      main: state.groups.main,
      locked: doc.querySelector('[data-noacg-role~="locked"]')?.getAttribute('class') ?? '',
      picked: doc.querySelector('[data-noacg-role~="answer.selected/B"]')?.getAttribute('class') ?? '',
    };
  });
  expect(after.main).toBe('locked');
  expect(after.locked).toContain('imported-design-on');
  expect(after.picked).toContain('imported-design-on');
});
