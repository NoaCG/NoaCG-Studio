import { test, expect } from '@playwright/test';
import { createProject } from '../_create';
import { appliedIn, receiverHost } from '../_receiverHost';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// THE COLD BOOT ON THE RELAY PLANE, against a real control log (docs/CLOUD_PLAYOUT.md §3).
//
// The cue is taken BEFORE the graphic exists, and the graphic is loaded afterwards - a browser
// source pasted into OBS once the production is already up, which is the ordinary order in a
// control room. The receiver seeded its cursor with `last_event_id`, the log HEAD, which is a
// claim about the RENDERER ("everything up to here is already on air") made here about a log
// nothing had ever followed. So the take was dropped for good: no report to rebuild from, no row
// left to replay, a dark layer until an operator happened to send another command. The `/output`
// renderer had exactly this bug and it is fixed; `control/outputRecovery.ts` now owns the rule
// for both planes.
//
// WHAT THE OFFLINE WALK CANNOT ANSWER, and this one does: whether the REAL resolve answers the
// shapes the rule reads. `live` is empty for a production nothing has ever reported,
// `last_event_id` is the head, and the tail RPC really does hand back rows from 0 - three facts
// about a server function, asserted here by driving the generated block against it.
//
// The block hard-codes `https://<ref>.supabase.co`, which a local stack cannot be, so its RPC
// calls are PROXIED to the stack verbatim rather than mocked: the request the graphic actually
// makes is the request the database actually answers. The socket is left unjoined on purpose -
// this walk is about the boot, and it doubles as proof the boot no longer depends on it.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const RECEIVER_ORIGIN = 'https://localstack.supabase.co';

test('an exported graphic loaded after the take airs it, from the real log', async ({ page, context, request }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
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
  await createProject(page, { name: 'House Scorebug' });

  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  const showName = `Relay Cold Boot ${Date.now()}`;
  await section.getByPlaceholder('New production name').fill(showName);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();

  // The capability this graphic will hold, the name it answers to in the log, and the backend it
  // is really talking to - all read from the app rather than from env, so the spec cannot address
  // a different stack than the one the take lands in.
  const wire = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { loadBackendConfig } = await import('/src/backend/config.ts');
    const show = loadShows().find((s) => s.name === name);
    const cfg = loadBackendConfig();
    return {
      slug: show?.hostedSlug ?? null,
      graphic: show?.graphics[0]?.name ?? null,
      url: cfg.url,
      key: cfg.anonKey,
    };
  }, showName);
  expect(wire.slug, 'publishing must mint a hosted control slug').toBeTruthy();
  expect(wire.graphic, 'the production must carry its graphic').toBeTruthy();

  // ── TAKE, with no graphic anywhere. ──
  await page.getByTestId('verb-take').click();
  // Wait for the SERVER to hold it rather than for the button to look pressed: `live_cue` is
  // mirrored onto the production row by the send RPC itself (migration 0031), so a non-empty map
  // is proof the take's rows are in the log - the precondition this whole spec is about.
  await expect
    .poll(
      async () =>
        page.evaluate(async (slug) => {
          const { controlShowBySlug } = await import('/src/control/hostedControl.ts');
          const show = await controlShowBySlug(slug!);
          return Object.keys(show?.liveCue ?? {}).length;
        }, wire.slug),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);

  // THE SHAPE THE RULE READS, straight off the real resolve: the head has moved, and nothing has
  // ever reported. Asserted rather than assumed - if either were untrue the walk below would pass
  // for the wrong reason.
  const resolved = await page.evaluate(
    async ({ url, key, slug }) => {
      const res = await fetch(url + '/rest/v1/rpc/control_show_by_slug', {
        method: 'POST',
        headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_slug: slug }),
      });
      const rows = (await res.json()) as { last_event_id: number; live: Record<string, unknown> }[];
      return { head: rows[0]?.last_event_id ?? 0, reported: Object.keys(rows[0]?.live ?? {}) };
    },
    { url: wire.url, key: wire.key, slug: wire.slug },
  );
  expect(resolved.head, 'the take must have moved the log head').toBeGreaterThan(0);
  expect(resolved.reported, 'nothing may have reported yet — that is the case under test').toEqual([]);

  // ── Only NOW does the graphic load. Everything it must show is already history. ──
  const block = await page.evaluate(
    async ({ key, slug, graphic }) => {
      const { hostedReceiverBlock } = await import('/src/control/hostedReceiver.ts');
      return hostedReceiverBlock({ ref: 'localstack', key, slug: slug!, graphic: graphic! });
    },
    { key: wire.key, slug: wire.slug, graphic: wire.graphic },
  );

  const rpcCalls: string[] = [];
  const board = await context.newPage();
  board.on('console', (m) => console.log('[graphic]', m.type(), m.text()));
  board.on('pageerror', (e) => console.log('[graphic pageerror]', e.message));
  await board.routeWebSocket(/supabase\.co\/realtime/, () => {
    /* opened, never joined: the boot must not depend on the socket */
  });
  // PROXIED, not mocked: the exact request the generated block makes, answered by the real stack.
  await board.route(RECEIVER_ORIGIN + '/rest/v1/rpc/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() as string;
    rpcCalls.push(name);
    const answer = await request.post(wire.url + '/rest/v1/rpc/' + name, {
      headers: {
        apikey: wire.key,
        Authorization: 'Bearer ' + wire.key,
        'Content-Type': 'application/json',
      },
      data: route.request().postDataJSON() as Record<string, unknown>,
    });
    await route.fulfill({
      status: answer.status(),
      contentType: 'application/json',
      body: await answer.text(),
    });
  });
  await board.route('http://relay-cold-boot.local/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: receiverHost(block) }),
  );

  await board.goto('http://relay-cold-boot.local/board.html', { waitUntil: 'load' });

  // A take is `update` + `play` + `cue`; the `cue` row is status and never reaches a graphic. So
  // the board must show the cue's data AND be on air, in log order. Seeded from the head this
  // read [] for the whole airing.
  await expect.poll(() => appliedIn(board), { timeout: 60_000 }).toContain('play');
  const applied = await appliedIn(board);
  expect(applied.filter((a) => a === 'play'), 'one take, one entrance').toHaveLength(1);
  expect(applied.indexOf('play'), 'the data lands before the entrance').toBeGreaterThan(0);
  expect(rpcCalls, 'the boot resolved and then read the log').toContain('control_show_by_slug');
  expect(rpcCalls).toContain('control_tail');

  // ── THE BOARD COMES DOWN HERE, AND ITS ROUTES COME DOWN WITH IT ─────────────────────────────
  //
  // It has answered everything it was opened for, and leaving it alive through the cleanup below
  // is what made this spec red. The board keeps FOLLOWING for as long as it exists: it polls the
  // log every 30 s (`CONTROL_POLL_MS`) and reports itself after each apply, and every one of
  // those requests enters the route handler above, which proxies it through the `request`
  // fixture. The cleanup is several seconds of real clicks, and Playwright disposes `request`
  // when the test ends - so a proxied call still in flight at that moment dies with "Request
  // context disposed", and reds a test whose assertions have all already passed.
  //
  // ONLY THE HOSTED TIER EVER SAW IT, which is exactly what that tier is for. The proxied POST
  // takes about a millisecond against a local stack and ~163 ms from a runner to hosted staging -
  // both measured on the same commit, 2026-09-06 - so the window a callback can be caught in is
  // over a hundred times wider there. `ffba7006` was green on configured-suite and red here
  // (issue #57, run 34018756952), which is the split this suite exists to produce.
  //
  // `unrouteAll` and not `close()` alone: it WAITS for the handlers already running and swallows
  // their errors, and closing the page cannot do that half.
  await board.unrouteAll({ behavior: 'ignoreErrors' });
  await board.close();

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
});
