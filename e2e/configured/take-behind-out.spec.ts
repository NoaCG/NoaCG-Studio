// covers: src/control/{hostedControl,seqSend}.ts, src/components/home/ProductionPage.tsx
//
// A TAKE PRESSED BEHIND AN OUT STANDS, AND ALL OUT CLEARS IT (issue #914).
//
// Seen on hosted staging: an Out was still on its way when the Take of the same graphic was
// pressed. The Take waited for the Out's answer (one send in flight per graphic, seqSend.ts), and
// when that answer came the page marked the graphic off over the Take already on its monitor. The
// Take then aired, while the page's own list said nothing was on, so an All out pressed in that
// moment cleared nothing and the graphic stayed on air.
//
// Only a real backend can show it: the order the two presses commit in and the server's head are
// the database's. The hold is in the browser, on the answers only: each request reaches the server
// and commits at once, and the page hears back later, as a slow venue link would make it.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, signIn, unpublishForCleanup, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD and the service key unset - configured-mode spec');

/** How long each answer is held: under the page's 1.5 s attempt deadline (failedSends.ts), so
 *  neither send is abandoned and both are answers that arrive late. */
const OUT_ANSWER_MS = 900;
const TAKE_ANSWER_MS = 1200;

test('a Take pressed while the Out is on its way stays on air here, and All out then clears it', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await openProductionWithCurrent(page, `Take behind Out ${Date.now()}`);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const links = page.getByTestId('production-status-panel');
  if (await links.isVisible()) await page.getByTestId('production-status').click();
  await expect(links).toBeHidden();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const headOn = async () => {
    const { data } = await admin.from('control_heads').select('graphics').eq('show_id', showId).single();
    const graphics = (data?.graphics ?? {}) as Record<string, { on?: boolean }>;
    return Object.values(graphics).some((g) => g?.on === true);
  };
  const chip = page.getByTestId('live-cue-chip');

  await page.getByTestId('verb-take').click();
  await expect(chip).toContainText('on air:');
  await expect.poll(headOn, { timeout: 20_000 }).toBe(true);

  // THE HOLD: the next Out's answer, then the next Take's. All out goes straight through.
  let hold: 'stop' | 'play' | null = 'stop';
  let takeCommitted!: () => void;
  const takeIn = new Promise<void>((resolve) => (takeCommitted = resolve));
  await page.route('**/rest/v1/rpc/control_send_seq', async (route) => {
    const body = route.request().postDataJSON() as { p_items?: { msg?: { t?: string } }[]; p_sender?: { all_out?: boolean } } | null;
    const kinds = (body?.p_items ?? []).map((item) => item.msg?.t);
    if (body?.p_sender?.all_out || !hold || !kinds.includes(hold)) return route.continue();
    const held = hold;
    hold = held === 'stop' ? 'play' : null;
    const response = await route.fetch();
    if (held === 'play') takeCommitted();
    await new Promise((resolve) => setTimeout(resolve, held === 'stop' ? OUT_ANSWER_MS : TAKE_ANSWER_MS));
    await route.fulfill({ response }).catch(() => {});
  });

  await page.getByTestId('verb-out').click();
  await expect(chip).toContainText('nothing on air');
  // Pressed while the Out's answer is held: the Take waits for it, and is on this monitor already.
  await page.getByTestId('verb-take').click();
  await expect(chip).toContainText('on air:');

  // The Out has answered (the Take only leaves after it) and the Take has committed; its answer is
  // still held. The page still says the Take is up, which is what air shows.
  await takeIn;
  await expect.poll(headOn, { timeout: 5_000 }).toBe(true);
  await page.waitForTimeout(150);
  await expect(chip).toContainText('on air:');

  // ALL OUT, in that moment. Before the fix it was judged against "nothing up here, the head says
  // off" and sent nothing, and the Take stayed on air.
  await page.getByTestId('verb-out-all').click();
  await expect.poll(headOn, { timeout: 20_000 }).toBe(false);
  await expect(chip).toContainText('nothing on air', { timeout: 10_000 });
  // The Take's late answer does not put it back on this page.
  await page.waitForTimeout(TAKE_ANSWER_MS + 500);
  await expect(chip).toContainText('nothing on air');
  expect(await headOn()).toBe(false);

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
