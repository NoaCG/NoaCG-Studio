// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend publishes a production to an output page.
//
// The import build and binding decide what an imported graphic's renderer document holds, and
// this walk is the one that reads it on an isolated output across a disconnect.
// covers: src/templates/importedDesign/svg.ts, src/templates/importedDesign/svgBind.ts
//
// THE UNFAMILIAR-ARTWORK JOURNEY ON AN ISOLATED SOFTWARE OUTPUT (docs/work-specs/jev-svg-import/
// spec.md row 38, AC-26; evidence/phase-38.md). The offline half (`e2e/jev-svg-preparation.spec.ts`,
// "row 38") walks import, the one correction, preview, save, prepare, Take, Update, Out, reopen and
// replacement against the production page's own monitor, and reads package conformance. This half
// publishes the same unfamiliar corpus design (`score-clock-2`) and follows it on the /output page
// in a SEPARATE browser context, the way a playout box loads it: a renderer that shares nothing
// with the operator's page but the hosted log.
//
// Four things are read apart, and each is named where it is read:
//   COMMAND ACCEPTANCE   the operator's page took the press (its activity log, its fields)
//   RENDERER STATE       what the isolated output's graphic document holds
//   VISUAL FIDELITY      the drawn plates on that output keep the source's fills
//   PACKAGE CONFORMANCE  not read here: the offline half validates the OGraf package
// A press accepted while the output is cut off is accepted and NOT yet observed; the output then
// recovers it. No physical studio, competitor or licensed host is involved (row 29 keeps hosted
// recovery, standalone capability and physical acceptance apart, and this walk claims only the first).

import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { publishProduction } from '../_publish';
import { dropSvg, intoProduction } from '../_svg-import';
import { clearPublishedShows, haveCreds, readyOf, signIn, unpublishForCleanup, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

const JOURNEY = fileURLToPath(new URL('../fixtures/jev-svg/dev/score-clock-2.svg', import.meta.url));
/** The drawn plates of `score-clock-2`, in drawing order, as the source file paints them. */
const SOURCE_PAINT = ['rgb(18, 32, 54)', 'rgb(90, 64, 91)', 'rgb(51, 89, 97)', 'rgb(109, 81, 57)'];
const WIRE = { timeout: 30_000 };

/** RENDERER STATE: how visible the imported graphic is on the output, 0 when nothing is mounted. */
async function airOpacity(graphic: FrameLocator): Promise<number> {
  const root = graphic.locator('.imported-design');
  if ((await root.count().catch(() => 0)) === 0) return 0;
  return root.first().evaluate((el) => Number(getComputedStyle(el).opacity)).catch(() => 0);
}

async function openOutput(output: Page, origin: string, slug: string): Promise<FrameLocator> {
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.goto(`${origin}/output?production=${encodeURIComponent(slug)}&debug=1`);
  return output.frameLocator('iframe');
}

test('unfamiliar imported artwork airs on an isolated output, which is cut off and recovers what was accepted meanwhile', async ({ page, browser }, info) => {
  test.setTimeout(240_000);
  await signIn(page);
  await clearPublishedShows(page);

  // The artwork's one material ambiguity is its clock's direction; nothing else is corrected.
  await page.goto('/app');
  await dropSvg(page, JOURNEY);
  await page.getByTestId('map-svg-clock-mode').selectOption('count-up');
  const showName = `SVG journey ${Date.now()}`;
  await intoProduction(page, 'Wrzos v Mech', showName);

  await publishProduction(page);
  const links = page.getByTestId('production-status-panel');
  await expect(links).toBeVisible();
  await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(slug).toBeTruthy();

  // THE ISOLATED OUTPUT: its own context, so its network can be cut without touching the operator.
  const origin = new URL(page.url()).origin;
  const box = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  let output = await box.newPage();
  let graphic = await openOutput(output, origin, slug!);
  const log = page.getByTestId('action-log');

  // PREPARED OFF AIR: a typed name is a draft; the output shows nothing before Take.
  // The output has booted and answers for itself, so "nothing visible" is its reading, not a page
  // that never started.
  await expect.poll(async () => (await readyOf(output)) !== null, WIRE).toBe(true);
  await page.getByTestId('cue-field-f1').fill('Wrzos FC');
  await page.waitForTimeout(1500);
  expect(await airOpacity(graphic), 'RENDERER STATE: nothing on the output before Take').toBeLessThan(0.1);

  // TAKE. Command acceptance, then the output's own document.
  await page.getByTestId('verb-take').click();
  await expect(log).toContainText('Took');
  await expect.poll(() => airOpacity(graphic), WIRE).toBeGreaterThan(0.9);
  await expect(graphic.locator('#f1')).toHaveText('Wrzos FC', WIRE);
  await expect(graphic.locator('#f2')).toHaveText('Mech');
  // VISUAL FIDELITY on the output: every drawn plate keeps the source's fill, in the source's order.
  const paint = await graphic.locator('.imported-design svg rect, .imported-design svg circle').evaluateAll((els) => els.map((el) => getComputedStyle(el).fill));
  expect(paint).toEqual(SOURCE_PAINT);
  await info.attach('output-on-air', { body: await output.screenshot(), contentType: 'image/png' });

  // AN ON-AIR DRAFT stays off the output until the explicit Update.
  await page.getByTestId('cue-field-f2').fill('Mech United');
  // A published production says "on air"; the offline walk's monitor says "on PROGRAM".
  await expect(page.getByTestId('cue-unsent')).toContainText('not on air yet');
  await page.waitForTimeout(1500);
  await expect(graphic.locator('#f2'), 'RENDERER STATE: a draft is not on the output').toHaveText('Mech');
  await page.getByTestId('verb-update').click();
  await expect(graphic.locator('#f2')).toHaveText('Mech United', WIRE);

  // CUT OFF: the output loses its network. A stepper press is accepted by the operator's page while
  // the output cannot hear it; when the network returns the output recovers the accepted value.
  // Scoped to the log's ROWS: the collapsed summary repeats the newest line.
  const updates = page.getByTestId('action-log-row').filter({ hasText: 'Updated' });
  const updatesBefore = await updates.count();
  await box.setOffline(true);
  await page.getByTestId('live-numbers').getByTestId('live-number-f3-up').click();
  await expect(page.getByTestId('cue-field-f3'), 'COMMAND ACCEPTANCE while the output is cut off').toHaveValue('1');
  await expect.poll(() => updates.count(), { message: 'COMMAND ACCEPTANCE: the press is in the log' }).toBeGreaterThan(updatesBefore);
  await page.waitForTimeout(2000);
  const heardWhileOff = ((await graphic.locator('#f3').textContent().catch(() => null)) ?? '').trim();
  await box.setOffline(false);
  await expect(graphic.locator('#f3'), 'RENDERER STATE: recovered after the network returned').toHaveText('1', WIRE);

  // THE OUTPUT GOES AWAY ALTOGETHER (a crashed or restarted playout box): presses are accepted
  // with no output open, and a fresh output boots into the current state, not the first Take.
  await output.close();
  await page.getByTestId('live-numbers').getByTestId('live-number-f4-up').click();
  await expect(page.getByTestId('cue-field-f4'), 'COMMAND ACCEPTANCE with no output open').toHaveValue('1');
  output = await box.newPage();
  graphic = await openOutput(output, origin, slug!);
  await expect.poll(() => airOpacity(graphic), WIRE).toBeGreaterThan(0.9);
  await expect(graphic.locator('#f1')).toHaveText('Wrzos FC', WIRE);
  await expect(graphic.locator('#f2')).toHaveText('Mech United');
  await expect(graphic.locator('#f3')).toHaveText('1');
  await expect(graphic.locator('#f4')).toHaveText('1');
  await info.attach('output-recovered', { body: await output.screenshot(), contentType: 'image/png' });

  // TAKE OUT: accepted, then the output clears.
  await page.getByTestId('verb-out').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect.poll(() => airOpacity(graphic), WIRE).toBeLessThan(0.1);
  info.annotations.push({
    type: 'output-recovery',
    description: `while cut off the output's score read "${heardWhileOff}" (0 means the press waited for the network); it then showed 1, and a rebooted output showed every accepted value`,
  });

  await unpublishForCleanup(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await box.close();
});
