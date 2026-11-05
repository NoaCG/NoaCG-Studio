// covers: src/control/airState.ts, src/control/outputRecovery.ts, src/output/main.ts, src/output/stage.ts
// covers: src/preview/composeDocument.ts
//
// HELD CREDITS AFTER A RELOAD, ON A PUBLISHED PRODUCTION (#2075). A styled credits roll on air
// keeps the list its Take took while a newer one waits for the next Take. The output's report
// banks that held list with the pose, so:
//
//  1. a DASHBOARD RELOAD rebuilds PROGRAM with the list on air, not the newest one, and PROGRAM
//     still says a newer list waits; and
//  2. an OUTPUT REBOOT recovers the same list, with the newest waiting.
//
// Before #2075 both rebuilt the take from the newest data, so PROGRAM showed the corrected names
// while the output still rolled the old ones. Only this run has a real published output and its
// report: `e2e/imported-credits-live-data.spec.ts` proves the graphic's answer and the rebuild
// recipe on a blank page.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dropSvg, intoProduction } from '../_svg-import';
import { settleDurableWrites } from '../_durable';
import { haveCreds, signIn, wipeMyGraphics, unpublishForCleanup } from './_helpers';

const ABOVE_CREDITS_SVG = fileURLToPath(new URL('../fixtures/jev-svg/dev/credits-1.svg', import.meta.url));
const TAKEN = ['Research', 'Nia Vale', 'Tomas Fen', 'Sound', 'Ari Moss'];
const NEWER = 'Camera:\nJonas Berg\nIda Lake\nDirector:\nAlex Rivera';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a held credits list survives a dashboard reload and an output reboot, with the newer list still waiting (#2075)', async ({ page, context }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });

  // Role-above styled credits, rolled, as the wizard saves them.
  await page.goto('/app');
  await dropSvg(page, ABOVE_CREDITS_SVG);
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  const picker = page.getByTestId('map-svg-recipe-credits');
  const role = await picker.locator('option').evaluateAll((options) =>
    (options as HTMLOptionElement[]).map((o) => o.value).filter(Boolean)[1]);
  await picker.selectOption(role);
  await expect(page.getByTestId('map-svg-credits-preview')).toHaveAttribute('data-layout', 'role-above');
  await page.getByTestId('map-svg-credits-playback').selectOption('roll');
  const showName = `Held credits ${Date.now()}`;
  await intoProduction(page, 'Credits', showName);

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  await expect(links).toBeVisible();
  await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();
  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug).toBeTruthy();

  const output = await context.newPage();
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);
  const outRows = output.frameLocator('iframe').locator('.imported-design-credits-row');
  const program = () => page.frameLocator('[data-testid="program-stage"] iframe');
  const programRows = () => program().locator('.imported-design-credits-row');
  const programWaits = () => program().locator('.imported-design-credits-roll').evaluate(() => (window as unknown as { noacgCreditsWaiting: boolean }).noacgCreditsWaiting);
  const fate = page.getByTestId('cue-unsent');

  // Take the drawn list, then send a newer one: both stages keep the list taken; it waits.
  await page.getByTestId('verb-take').click();
  await expect(programRows()).toHaveText(TAKEN);
  await expect(outRows).toHaveText(TAKEN, { timeout: 30_000 });
  await page.getByTestId('cue-field-f1').fill(NEWER);
  await page.getByTestId('verb-update').click();
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take');
  await expect(outRows).toHaveText(TAKEN);
  // The output's report banks the held list before the reload reads it (one report per change).
  await expect.poll(async () => page.evaluate(async (slug) => {
    const { controlOutputResolve } = await import('/src/control/hostedControl.ts');
    const answer = await controlOutputResolve(slug);
    const live = (answer.ok ? (answer.value as { live?: Record<string, { state?: { held?: unknown } }> } | null)?.live : null) ?? {};
    return Object.values(live).some((r) => !!r?.state?.held);
  }, outputSlug!), { timeout: 30_000, message: 'the report banks the held list' }).toBe(true);

  // 1. DASHBOARD RELOAD: PROGRAM rebuilds with the list on air, and says a newer one waits.
  await settleDurableWrites(page);
  await page.reload();
  await expect(programRows()).toHaveText(TAKEN, { timeout: 30_000 });
  await expect.poll(programWaits, { timeout: 20_000 }).toBe(true);
  await expect(fate).toHaveText('New list shows on the next ⟳ Re-take', { timeout: 20_000 });
  await page.screenshot({ path: 'test-results/signed-in/held-credits-1-dashboard-reloaded.png' });

  // 2. OUTPUT REBOOT: the output recovers the list it held, the newer one still waiting.
  await output.reload();
  await expect(outRows).toHaveText(TAKEN, { timeout: 30_000 });
  await expect.poll(() => output.frameLocator('iframe').locator('.imported-design-credits-roll').evaluate(() => (window as unknown as { noacgCreditsWaiting: boolean }).noacgCreditsWaiting), { timeout: 20_000 }).toBe(true);
  await output.screenshot({ path: 'test-results/signed-in/held-credits-2-output-rebooted.png' });

  // The next Take airs the newer list on both.
  await page.getByTestId('verb-retake').click();
  await expect(programRows()).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera']);
  await expect(outRows).toHaveText(['Camera', 'Jonas Berg', 'Ida Lake', 'Director', 'Alex Rivera'], { timeout: 30_000 });

  await page.getByTestId('verb-out').click();
  await unpublishForCleanup(page);
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
  await output.close();
});
