// covers: src/components/home/ProductionPage.tsx, src/control/{hostedControl,seqSend}.ts
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
//
// A TAKE STILL ON ITS WAY WHEN THE OPERATOR OPENS ANOTHER PRODUCTION (production-page refactor,
// phase 1; docs/work-specs/production-page-refactor/spec.md §3 and §5.3, "production change and
// disposal while work is pending").
//
// The page stays mounted when the route moves to another production, so a send that answers after
// the switch answers into a page now showing something else. Its answer must not touch the new
// production's air (spec §4.1 R3: a stale local update is ignored), and the command itself stands:
// it was accepted by the server for the production it was pressed on. The hold is on the answer
// only: the Take's request commits at once and the page hears back after the switch.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, watchLogReads, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

/** How long the Take's answer is held: under the page's 1.5 s attempt deadline (failedSends.ts). */
const ANSWER_MS = 900;

test('a Take answered after a switch to another production stands there and leaves the new one alone', async ({ page }) => {
  test.setTimeout(240_000);
  const logReady = watchLogReads(page);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const stamp = Date.now();
  const first = await openProductionWithCurrent(page, `Switch from ${stamp}`);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();
  const slug = await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.id === id)?.hostedSlug ?? null;
  }, first);
  expect(slug, 'publishing mints a control slug').toBeTruthy();

  // The second production, with the same graphic: its layer name collides with the first's.
  const second = await page.evaluate(async (name) => {
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { show, error } = createShowNamedChecked(name);
    if (error) throw new Error(error);
    const { template, saved } = useTemplateStore.getState();
    addGraphicToShow(show.id, template, { graphicId: saved.graphicId });
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    return show.id;
  }, `Switch to ${stamp}`);

  // Publishing enables Take before the initial resolve has established its numbered session.
  // Wait for its log read, or the Take can use control_send_many and miss the hold below.
  await logReady();

  // THE HOLD: the Take's request goes through at once; its answer comes back late.
  let takesSeen = 0;
  let answered!: () => void;
  const answerBack = new Promise<void>((resolve) => (answered = resolve));
  await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!(body?.p_items ?? []).some((item) => item.msg?.t === 'play')) return route.continue();
    takesSeen += 1;
    try {
      const response = await route.fetch();
      await new Promise((resolve) => setTimeout(resolve, ANSWER_MS));
      await route.fulfill({ response }).catch(() => {});
    } finally {
      answered();
    }
  });

  await page.getByTestId('verb-take').click();
  await expect.poll(() => takesSeen, { message: 'the Take went to the server' }).toBe(1);
  // Switch while the answer is held.
  await page.evaluate(async (id) => {
    const { useRouter } = await import('/src/app/router.ts');
    useRouter.getState().navigate({ view: 'production', id });
    await new Promise((resolve) => setTimeout(resolve));
  }, second);
  await expect(page.locator('.pd-name')).toHaveText(`Switch to ${stamp}`);
  await answerBack;
  await page.waitForTimeout(1_000);

  // The new production: nothing on air, nothing played on its PROGRAM.
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '0');
  // The first production: the Take stood on its log.
  const plays = await page.evaluate(async (slug) => {
    const { hostedControlTail } = await import('/src/control/hostedControl.ts');
    const rows = await hostedControlTail(slug, 0);
    return rows.filter((row) => (row.msg as { t?: string }).t === 'play').length;
  }, slug as string);
  expect(plays, 'the first production log holds the Take').toBe(1);

});
