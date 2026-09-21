import { test, expect, type Page } from '@playwright/test';
import { dropSvg, intoExistingProduction, intoProduction, QUIZ_SVG, SCOREBUG_SVG } from '../_svg-import';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE OPERATOR WALK ON THE PUBLISHED ROAD - the half of e2e/dashboard-operator-walk.spec.ts an
// offline build cannot reach.
//
// Unpublished, nothing leaves the laptop and a reload honestly comes back to "nothing on air".
// Published, air lives on the server, so the questions change: does a page that reloads
// mid-show come back WITH the show, and do two operator screens - the production dashboard and
// the hosted control page open in two tabs, the way a class splits the quiz and the score
// between two students - agree about what is on air after each other's presses?
//
// One production, an imported quiz board and an imported scoreboard, and every press a student
// makes on the night, spread across the three screens on purpose.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

/** Every console error and uncaught exception a page raises, for the closing assertion. */
function watchErrors(page: Page, name: string, into: string[]): void {
  page.on('console', (m) => {
    if (m.type() === 'error') into.push(`[${name}] ${m.text()}`);
  });
  page.on('pageerror', (e) => into.push(`[${name}] pageerror: ${e.message}`));
}

/** One hosted control page, opened cold from the capability address. */
async function openHosted(page: Page, slug: string): Promise<void> {
  await page.goto(`/app?control=${encodeURIComponent(slug)}`);
  await expect(page.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
}

async function hostedSelect(page: Page, label: string | RegExp): Promise<void> {
  await page.getByTestId('hosted-select-cue').filter({ hasText: label }).first().click();
}

const WIRE = { timeout: 30_000 };

test('a published quiz and scoreboard run across the dashboard and two hosted tabs, through a reload of each', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  const errors: string[] = [];
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);

  // ── The show: an imported quiz and an imported scoreboard in one production. ──
  const showName = `Hosted Walk ${Date.now()}`;
  await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await intoProduction(page, 'Quiz board', showName);
  await page.goto('/app');
  await dropSvg(page, SCOREBUG_SVG);
  await intoExistingProduction(page, 'Team score', showName);
  await expect(page.getByTestId('select-cue')).toHaveCount(2);

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', WIRE);
  await page.getByTestId('production-links-toggle').click();
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();
  watchErrors(page, 'dashboard', errors);

  const a = await context.newPage();
  const b = await context.newPage();
  watchErrors(a, 'hosted A', errors);
  watchErrors(b, 'hosted B', errors);
  await openHosted(a, slug!);
  await openHosted(b, slug!);

  // ── Tab A runs the quiz: key C, pick B, take, select, lock. ──
  await hostedSelect(a, 'Quiz board');
  await a.getByTestId('hosted-field-f5-opt-C').click();
  await a.getByTestId('hosted-field-f6-opt-B').click();
  await a.getByTestId('hosted-take-cue').click();
  await expect(a.getByTestId('hosted-live-chip')).toContainText('Quiz board', WIRE);
  await expect(b.getByTestId('hosted-live-chip')).toContainText('Quiz board', WIRE);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Quiz board', WIRE);
  await a.getByRole('button', { name: /Select answer/ }).click();
  await a.getByRole('button', { name: /Lock it in/ }).click();
  // NO RENDERER IS OPEN YET, which is a class rehearsing before OBS is up. The chip reads the
  // page's own PROGRAM monitor then; it used to read renderer reports alone and stayed empty.
  await expect(a.getByTestId('hosted-state-chip')).toContainText('Locked', WIRE);

  // ── Now the real renderer, as OBS loads it LATE. Its boot replays the take, the pick and the
  // lock in one burst, and the lock used to be lost there: the events ran before the entrance
  // (composeDocument's live-control queue, and the burst case in dashboard-operator-walk). ──
  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();
  const output = await context.newPage();
  watchErrors(output, 'output', errors);
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const air = output.frameLocator('iframe[title="Quiz board"]');
  await expect(air.locator('[data-noacg-role~="locked"]')).toHaveClass(/imported-design-on/, WIRE);
  await expect(air.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/);

  // ── Tab B runs the score beside it: take, +1 twice, -1 once. ──
  await hostedSelect(b, 'Team score');
  await b.getByTestId('hosted-take-cue').click();
  await expect(b.getByTestId('hosted-live-chip')).toContainText('Team score', WIRE);
  await b.getByTestId('hosted-live-number-f1-up').click();
  await b.getByTestId('hosted-live-number-f1-up').click();
  await b.getByTestId('hosted-live-number-f2-down').click();
  const scoreOnDashboard = page.frameLocator('[data-testid="program-stage"] iframe[title="Team score"]');
  await expect(scoreOnDashboard.locator('#f1')).toHaveText('4', WIRE);
  await expect(scoreOnDashboard.locator('#f2')).toHaveText('0', WIRE);
  // The quiz is still up on every screen: the score's take went to its own layer.
  await expect(a.getByTestId('hosted-live-chip')).toContainText('Quiz board');
  await expect(a.getByTestId('hosted-live-chip')).toContainText('Team score', WIRE);

  // ── Tab A RELOADS mid-lock and reveals: the page comes back knowing where the quiz is. ──
  await a.reload();
  await expect(a.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  await expect(a.getByTestId('hosted-live-chip')).toContainText('Quiz board', WIRE);
  await expect(a.getByTestId('hosted-live-chip')).toContainText('Team score', WIRE);
  await hostedSelect(a, 'Quiz board');
  await expect(a.getByTestId('hosted-state-chip')).toContainText('Locked', WIRE);

  // …AND STAYS LOCKED. The reloaded page's PROGRAM monitor rebuilds from the renderer's last
  // report, and the chip reads that monitor too. It used to replay a bare play(), so a second
  // after the reload the monitor answered with the ENTRANCE state, the chip dropped "Locked" and
  // Reveal correct greyed. The wait outlasts the monitor's first state reply.
  await a.waitForTimeout(3_000);
  await expect(a.getByTestId('hosted-state-chip')).toContainText('Locked');
  await expect(a.getByRole('button', { name: /Reveal correct/ })).toBeEnabled();

  // ── Reveal from the reloaded tab: the VERDICT lights on air, and on the key tab A picked. ──
  // Configured run 35633742370 logged this press everywhere and lit nothing on C: the Take above
  // was pressed straight after picking key C, inside the shared buffer's round trip, so it aired
  // the cue's stored key A and the reveal lit A. The page now lays its own unconfirmed staged
  // edits over the buffer (src/components/control/ownStaged.ts).
  await a.getByRole('button', { name: /Reveal correct/ }).click();
  await expect(air.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, WIRE);
  await expect(air.locator('[data-noacg-role~="answer.correct/A"]')).not.toHaveClass(/imported-design-on/);
  // Every screen agrees: the dashboard's PROGRAM monitor and tab B's.
  const quizOnDashboard = page.frameLocator('[data-testid="program-stage"] iframe[title="Quiz board"]');
  await expect(quizOnDashboard.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, WIRE);
  const quizOnB = b.frameLocator('[data-testid="hosted-program-stage"] iframe[title="Quiz board"]');
  await expect(quizOnB.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, WIRE);

  // ── The DASHBOARD reloads: a published production comes back with EVERY on-air state - both
  // layers, the score's figure, and the quiz still revealed on C, not replayed from its entrance. ──
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('live-cue-chip')).toContainText('Quiz board', WIRE);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Team score', WIRE);
  await expect(scoreOnDashboard.locator('#f1')).toHaveText('4', WIRE);
  await expect(scoreOnDashboard.locator('#f2')).toHaveText('0', WIRE);
  await expect(quizOnDashboard.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, WIRE);
  await expect(quizOnDashboard.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(/imported-design-on/, WIRE);
  // …and it stays that way past the monitor's first state reply, which is what used to undo a
  // recovery that replayed the entrance.
  await page.waitForTimeout(3_000);
  await expect(quizOnDashboard.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/);

  // ── Tab B presses after all of that, and the figure moves from where it is, not from 2. ──
  await b.getByTestId('hosted-live-number-f1-up').click();
  await expect(scoreOnDashboard.locator('#f1')).toHaveText('5', WIRE);

  // ── OUT from the two tabs; every screen agrees nothing is on air, and stays agreeing. ──
  await hostedSelect(b, 'Team score');
  await b.getByTestId('hosted-out-cue').click();
  await hostedSelect(a, 'Quiz board');
  await a.getByTestId('hosted-out-cue').click();
  for (const p of [a, b]) await expect(p.getByTestId('hosted-live-chip')).toContainText('nothing on air', WIRE);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air', WIRE);
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  expect(errors).toEqual([]);

  await a.close();
  await output.close();
  await b.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
