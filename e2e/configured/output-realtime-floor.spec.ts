import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE FLOOR UNDER REALTIME (docs/CLOUD_PLAYOUT.md §3): a renderer whose Realtime channel never
// joins still catches up, and says so.
//
// Every recovery the follow discipline performs is triggered by something the SOCKET does — a row
// arriving with a hole in front of it, or a `SUBSCRIBED` after a reconnect. A channel that opens
// and is never joined does neither: it never closes, so nothing reconnects, and it never delivers,
// so no row can expose a gap. The renderer then held whatever its boot catch-up had fetched and
// aired nothing else for the rest of the show, silently — the same on-air ending as the cold-boot
// bug next door, reached from the one direction the discipline did not cover. It is not exotic: a
// venue proxy that passes the WebSocket upgrade and drops the frames, a Realtime incident, or a
// CasparCG CEF all land here.
//
// THIS CANNOT BE PINNED OFFLINE. An offline build resolves no production, follows no log and
// opens no channel, so the mechanism is absent rather than untested. The equivalent for the RELAY
// receiver — which is plain generated JS talking to two addresses — IS pinned offline, in
// `e2e/hosted-control.spec.ts`; this file is the app's own renderer, on the real wire.
//
// The socket is intercepted rather than the server stopped: Realtime must stay up for the
// operator page in the same run, and "joined and silent" is precisely the failure being pinned.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a renderer whose realtime channel never joins still airs a take, and says it is polling', async ({ page, context }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  // A prior FAILED run can leave its published production behind, and the account SYNCS shows.
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
  await bootstrapGraphic(page, { name: 'House Scorebug' });

  const showName = `Realtime Floor ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; its own toggle closes it (never Escape — quiz-output.spec.ts
  // says why, and the Escape route was a flake of its own).
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  const outputSlug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.name === name)?.outputSlug ?? null;
  }, showName);
  expect(outputSlug, 'publishing must mint an output slug').toBeTruthy();

  // ── The renderer, with its Realtime channel intercepted: the socket opens and is never
  //    joined, so no log row ever arrives on it and no reconnect is ever triggered. ──
  const output = await context.newPage();
  output.on('console', (m) => console.log('[output]', m.type(), m.text()));
  output.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await output.routeWebSocket(/\/realtime\/v1\/websocket/, () => {
    /* opened, never joined, never speaks — the whole subject */
  });
  await output.goto(`/output?production=${encodeURIComponent(outputSlug!)}&debug=1`);

  const debug = output.locator('pre');
  const graphic = output.frameLocator('iframe');
  // BOOT FIRST, and prove it: `realtime:` appears the moment the follow is set up, which is after
  // the resolve, the stage and the boot catch-up. Everything asserted below therefore happened
  // after this renderer was fully up — the take cannot be recovered by the cold-boot path.
  await expect(debug).toContainText('realtime:', { timeout: 60_000 });
  await expect
    .poll(async () => graphic.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)), {
      timeout: 30_000,
    })
    .toBeLessThan(0.1);

  // THE DIAGNOSIS. A renderer running on the poll instead of the stream looks exactly like a quiet
  // show from every seat, so it must say so rather than be retried in silence.
  await expect(debug).toContainText('NOT JOINED', { timeout: 60_000 });
  await expect(debug).toContainText('polling every');

  // ── The take. Nothing on the socket will ever mention it. ──
  await page.getByTestId('verb-take').click();

  // One poll interval is 30 s (CONTROL_POLL_MS), so this is the floor being exercised end to end.
  // The opacity poll is the wire proof: the team names sit in the markup either way, so asserting
  // on text would pass over a board that never played.
  await expect
    .poll(async () => graphic.locator('.scoreboard').evaluate((el) => Number(getComputedStyle(el).opacity)), {
      timeout: 120_000,
    })
    .toBeGreaterThan(0.9);
  await output.screenshot({ path: 'test-results/signed-in/realtime-floor-take-without-realtime.png' });

  // Out, unpublish, and leave the throwaway account clean.
  await page.getByTestId('verb-out').click();
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
  await output.close();
});
