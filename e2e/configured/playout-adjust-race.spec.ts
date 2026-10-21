// covers: src/components/home/ProductionPage.tsx, src/control/{hostedControl,seqSend,productionDataApi}.ts
//
// TWO ⚡ ADJUST PRESSES INSIDE ONE ROUND TRIP MOVE A SHARED VALUE TWICE (production-page refactor,
// phase 1, S1; docs/work-specs/production-page-refactor/spec.md §1.3).
//
// A scoreboard's Goal carries `adjust: { f1: 1 }`. With f1 bound to a path in the production's
// tree, the press counts from the tree, sends the event, and only once the send has answered
// writes the new figure (`fireEvent`: "the shared value moves only if the event went"). A second
// Goal pressed while the first send is still out used to count from the same tree and write the
// same figure, so two goals moved the score by one. A Goal and a + on the ± stepper of the same score
// lost a count the same way.
//
// Only a real backend shows it: the tree a published production follows is the server's, written
// through `control_data_patch_by_slug`. The hold is on `control_send_seq` in the browser: the first
// event's request waits a moment before it goes, as a slow venue link would make it, and the second
// press lands inside that wait. The hold stays under the page's 1.5 s attempt deadline
// (failedSends.ts), so nothing is abandoned and both events are ordinary late answers.

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

const GRAPHIC = 'House Score';
const PATH = 'match.home.score';
/** The longest the first event's request is held if the walk never lets it go: short of the page's
 *  1.5 s attempt deadline (failedSends.ts), so nothing is abandoned and resent. */
const HOLD_MS = 1_000;

/** A published production with House Score on air, its home score bound to PATH and seeded at 2.
 *  Hands back the server's figure, PROGRAM's frame and a hold on the event sends. */
async function scoreOnAir(page: Page, name: string) {
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: GRAPHIC });
  const showId = await openProductionWithCurrent(page, `${name} ${Date.now()}`);

  // The binding travels with the publish, so it goes on the record first, through the model's door.
  await page.evaluate(
    async ({ showId, GRAPHIC, PATH }) => {
      const { setFieldBindings } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      setFieldBindings(showId, [{ graphic: GRAPHIC, fieldId: 'f1', path: PATH }]);
      await commitDurableWrites();
    },
    { showId, GRAPHIC, PATH },
  );

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');

  // The starting score goes in as a feed's would, with the production's own data key.
  const key = await page.evaluate(async (showId) => {
    const { productionDataKey, patchProductionData } = await import('/src/control/productionDataApi.ts');
    const key = await productionDataKey(showId);
    if (key) await patchProductionData(key, { match: { home: { score: 2 } } });
    return key;
  }, showId);
  expect(key, 'publishing must mint a data key').toBeTruthy();
  const serverScore = () =>
    page.evaluate(async (key) => {
      const { fetchProductionData } = await import('/src/control/productionDataApi.ts');
      const state = await fetchProductionData(key);
      return Number((state?.data as { match?: { home?: { score?: unknown } } } | undefined)?.match?.home?.score);
    }, key as string);

  // The page re-reads the tree when the feed's row comes round the log. Taken before that, the
  // Take would carry the tree it held, which is a different race from the one walked here.
  await expect(page.getByTestId('cue-bound-f1').locator('input')).toHaveValue('2', { timeout: 20_000 });
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('on air:');
  const program = page.frameLocator('[data-testid="program-stage"] iframe').first();
  await expect(program.locator('#f1')).toHaveText('2', { timeout: 20_000 });

  // THE HOLD: the first event request waits until the walk lets it go (`events.release`), or
  // HOLD_MS at most; the ones after it go straight through. Counted, so a walk can say the next
  // press really landed while the first was out.
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  const events = { seen: 0, inFlight: 0, release };
  await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[] } | null;
    if (!(body?.p_items ?? []).some((item) => item.msg?.t === 'event')) return route.continue();
    events.seen += 1;
    if (events.seen > 1) return route.continue();
    events.inFlight += 1;
    await Promise.race([released, new Promise((resolve) => setTimeout(resolve, HOLD_MS))]);
    events.inFlight -= 1;
    await route.continue().catch(() => {});
  });
  return { serverScore, program, events };
}

test('two Goal presses inside one round trip move the bound score by two', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, program, events } = await scoreOnAir(page, 'Adjust race');

  const goal = page.getByTestId('cue-action-goalA');
  await goal.click();
  await expect.poll(() => events.seen, { message: 'the first Goal reached the wire', intervals: [20] }).toBe(1);
  expect(events.inFlight, 'the first event is still on its way').toBe(1);
  await goal.click();
  expect(events.inFlight, 'the second Goal was pressed inside the first one round trip').toBe(1);
  events.release();

  // Both events go (one send in flight per graphic, so the second follows the first).
  await expect.poll(() => events.seen, { timeout: 10_000 }).toBe(2);
  // Two goals: the shared figure moves by two, on the server and on air.
  await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after two Goal presses' }).toBe(4);
  await expect(program.locator('#f1')).toHaveText('4', { timeout: 20_000 });
});

test('a Goal and a + on the same bound score inside one round trip both count', async ({ page }) => {
  test.setTimeout(240_000);
  const { serverScore, program, events } = await scoreOnAir(page, 'Adjust and bump');

  await page.getByTestId('cue-action-goalA').click();
  await expect.poll(() => events.seen, { message: 'the Goal reached the wire', intervals: [20] }).toBe(1);
  expect(events.inFlight, 'the Goal event is still on its way').toBe(1);
  // The ± stepper moves the same shared value with no event of its own.
  await page.getByTestId('live-number-f1-up').click();
  expect(events.inFlight, 'the + was pressed inside the Goal round trip').toBe(1);
  events.release();

  await expect.poll(serverScore, { timeout: 20_000, message: 'the server tree after a Goal and a +' }).toBe(4);
  await expect(program.locator('#f1')).toHaveText('4', { timeout: 20_000 });
});
