import { test, expect, type Page } from '@playwright/test';
import { dropSvg, intoExistingProduction, intoProduction, QUIZ_SVG, SCOREBUG_SVG } from '../_svg-import';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE OPERATOR WALK ON THE PUBLISHED ROAD - the half of e2e/dashboard-operator-walk.spec.ts an
// offline build cannot reach.
//
// Unpublished, nothing leaves the laptop and a reload honestly comes back to "nothing on air".
// Published, air lives on the server, so the questions change: does a dashboard that reloads
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
  await expect(a.getByTestId('hosted-state-chip')).toContainText('Locked', WIRE);

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
  await a.getByRole('button', { name: /Reveal correct/ }).click();
  const quizOnDashboard = page.frameLocator('[data-testid="program-stage"] iframe[title="Quiz board"]');
  await expect(quizOnDashboard.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(/imported-design-on/, WIRE);

  // ── The DASHBOARD reloads: a published production comes back on air, not empty. ──
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('live-cue-chip')).toContainText('Quiz board', WIRE);
  await expect(page.getByTestId('live-cue-chip')).toContainText('Team score', WIRE);
  await expect(scoreOnDashboard.locator('#f1')).toHaveText('4', WIRE);

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
  await b.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
