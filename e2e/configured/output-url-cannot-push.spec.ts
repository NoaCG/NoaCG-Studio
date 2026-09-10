import { test, expect, type Page } from '@playwright/test';
import { createProject } from '../_create';
import { haveCreds, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';

// A READ-ONLY LINK MUST NOT BE ABLE TO MOVE A PICTURE.
//
// Publishing a production mints two capabilities (migration 0029). The control slug OPERATES the
// show; the output slug only RENDERS it - it resolves the published payload, reads the log tail,
// reports what it applied and says it is alive, and it deliberately resolves neither the control
// slug nor the panel nor the staged buffer, "so an output URL pasted into CasparCG/OBS cannot
// operate the show". That sentence is the promise this file holds the product to.
//
// The output URL is handed around a room. It goes into the venue's playout machine, into an OBS
// browser source, into a chat message to whoever is running the screen. Anyone who has ever been
// given one keeps it. So the question is not whether somebody would attack the show on purpose -
// it is that a link with no authority to operate must not acquire any, because the damage is a
// graphic playing or disappearing on every screen during a live programme.
//
// WHAT THE ATTACKER HERE KNOWS, and it is exactly what the output URL gives them: the output
// slug. From it, `control_output_by_slug` answers with the show's UUID and its published payload,
// so the show id and every graphic key are derivable - by design, because the renderer needs both.
// That makes the show id a poor secret and a fine ADDRESS, which is the distinction this walk
// exists to keep true: knowing where the commands travel must not confer the right to put one
// there.
//
// It pushes on every road a command can travel, over the socket AND over Realtime's REST
// broadcast endpoint, on the public topic and on the private one, and then the walk asks the only
// question that matters: DID THE GRAPHIC PLAY? Air answers with its own count.
//
// THE REAL TAKE COMES FIRST, and again at the end. Without them this spec would pass against a
// renderer that had simply stopped listening, which is the failure mode a security test most
// often degrades into: the first take gives the count a MEASURED baseline rather than a zero read
// off an overlay that has not printed anything yet, and the second proves the road the forged
// command could not use is still open to whoever may use it.
//
// THE PLAY IS THE DETECTOR, and it stands for every verb. A forged `stop` is at least as bad as a
// forged `play` - taking the show off air mid-programme - and it is in the batch below, but only
// an entrance leaves a count behind. It needs no assertion of its own: both verbs arrive through
// one handler on one road (`onCommand` into `applyCommand`), so a road that cannot carry a play
// cannot carry a stop either.
//
// THE RENDERER IS ANONYMOUS, in a context of its own with no session. That is what a browser
// source in OBS or the venue's playout machine is, and the command topic's read policy names
// `anon` and `authenticated` separately (migration 0056) - opened on the signed-in context, this
// walk would exercise the half no renderer ever uses.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** Publish nothing behind us (the account is shared with the rest of the live suite, and a
 *  published production keeps its reserved addresses — migration 0040). */
async function clearPublishedShows(page: Page): Promise<void> {
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
}

/** The renderer's count of DURABLE rows applied, off the `&debug=1` overlay. A broadcast has no
 *  row id and can never move it, so this number is the log's own answer to "was it recorded?" */
async function lastRow(air: Page): Promise<number> {
  const text = await air.locator('pre').textContent();
  const m = /last row: (\d+)/.exec(text ?? '');
  return m ? Number(m[1]) : 0;
}

test('an output URL can render the show and cannot push a command onto it', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  await clearPublishedShows(page);

  // A scorebug, for the reason playout-both-roads.spec.ts uses one: its entrance is plain and
  // unconditional, so the only thing that can move `data-plays` is a `play` reaching a stage.
  await createProject(page, { name: 'House Scorebug' });

  const showName = `Read Only ${Date.now()}`;
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
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

  const slugs = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const s = loadShows().find((x) => x.name === name);
    return { hosted: s?.hostedSlug ?? null, output: s?.outputSlug ?? null };
  }, showName);
  expect(slugs.output, 'publishing must mint an output slug').toBeTruthy();

  // ── AIR, in an anonymous context, following live before anything is pressed. ───────────────
  const venue = await browser.newContext();
  const air = await venue.newPage();
  air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await air.goto(`/output?production=${encodeURIComponent(slugs.output as string)}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime:', { timeout: 60_000 });
  const airPlays = () => air.evaluate(() => document.body.getAttribute('data-plays'));
  await expect.poll(airPlays, { timeout: 30_000 }).toBe('0');

  // ── ONE REAL TAKE, so both baselines below are measured rather than assumed. ────────────────
  //
  // `last row` is only printed once a durable row has been applied, so on a freshly published
  // production it is absent and reads as 0 - a "before" that would look identical to a broken
  // overlay. One press makes it a number this walk has watched move.
  await page.getByTestId('verb-take').click();
  await expect.poll(airPlays, { timeout: 60_000 }).toBe('1');
  const rowsBefore = await lastRow(air);
  expect(rowsBefore, 'the renderer never reported applying a durable row').toBeGreaterThan(0);

  // ── THE HOLDER OF THE READ-ONLY LINK. ──────────────────────────────────────────────────────
  //
  // Its own browser context: no session, no localStorage, no memory of this production. All it
  // has is the output slug and the publishable key every visitor to the site holds.
  //
  // ASSERTED, NOT ASSUMED: with either of these empty, all four REST pushes below are refused for
  // a missing key or a 404 rather than by the absent insert policy, every assertion still holds,
  // and the walk reports a boundary it never touched.
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY ?? '';
  expect(SUPABASE_URL, 'no VITE_SUPABASE_URL - the REST half of this attack cannot be aimed').toBeTruthy();
  expect(anonKey, 'no VITE_SUPABASE_ANON_KEY - the REST half would be refused for the wrong reason').toBeTruthy();
  const stranger = await browser.newContext();
  const attacker = await stranger.newPage();
  await attacker.goto('/output?production=none');

  const push = await attacker.evaluate(
    async ({ outputSlug, url, key }) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      if (!sb) return { error: 'no backend client in the attacking page' };
      // Everything the output capability answers - the show id and the payload, so the forged
      // command can name a graphic that really exists on this stage.
      const resolved = await sb.rpc('control_output_by_slug', { p_output_slug: outputSlug });
      const row = (resolved.data as { id: string; output: { graphics: { key: string }[] } }[] | null)?.[0];
      if (!row) return { error: `the output slug resolved to nothing: ${resolved.error?.message ?? 'no row'}` };
      const showId = row.id;
      const graphic = row.output?.graphics?.[0]?.key;
      if (!graphic) return { error: 'the published payload named no graphic' };

      // A play AND a stop: a stranger putting a graphic on air and a stranger taking the show off
      // it are the same wire and the same handler, and the second is the one a live programme
      // would notice most.
      const frame = (attempt: string) => ({
        items: [
          { graphic, msg: { t: 'play', oid: `forged-play-${attempt}-${Date.now()}` } },
          { graphic, msg: { t: 'stop', oid: `forged-stop-${attempt}-${Date.now()}` } },
        ],
      });

      // EVERY TOPIC REACHABLE FROM THE SHOW ID, public and private. `control-<id>` is the channel
      // the log follower has always joined; `cmd-<id>` is the private command topic. A road added
      // later belongs in this list - a fast road nobody attacks here is a fast road nobody has
      // proved is closed.
      const topics = [`control-${showId}`, `cmd-${showId}`];
      const sent: { topic: string; private: boolean; status: string }[] = [];
      for (const topic of topics) {
        for (const isPrivate of [false, true]) {
          const channel = sb.channel(topic, { config: { private: isPrivate } });
          const joined = await new Promise<string>((resolve) => {
            const done = setTimeout(() => resolve('never joined'), 10_000);
            channel.subscribe((status: string) => {
              if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                clearTimeout(done);
                resolve(status);
              }
            });
          });
          // Sent whatever the join said: on a channel that never joined, supabase-js posts the
          // frame to the broadcast REST endpoint instead of queueing it, and that fallback is
          // itself one of the roads being tested here.
          const status = await channel.send({ type: 'broadcast', event: 'cmd', payload: frame(`${topic}-${isPrivate}`) });
          sent.push({ topic, private: isPrivate, status: `${joined} -> ${String(status)}` });
          await sb.removeChannel(channel);
        }
      }

      // …AND THE REST ENDPOINT DIRECTLY, with `private` set by hand. The SDK only reaches it as a
      // fallback; an attacker reaches it first, and it is the one road where a missing check
      // would let a forged private message in without ever joining a channel.
      for (const topic of topics) {
        for (const isPrivate of [false, true]) {
          const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key, Authorization: `Bearer ${key}` },
            body: JSON.stringify({
              messages: [{ topic, event: 'cmd', payload: frame(`rest-${topic}-${isPrivate}`), private: isPrivate }],
            }),
          });
          sent.push({ topic, private: isPrivate, status: `REST ${res.status}` });
        }
      }
      return { showId, graphic, sent };
    },
    { outputSlug: slugs.output as string, url: SUPABASE_URL, key: anonKey },
  );
  console.log('[read-only push attempts]', JSON.stringify(push, null, 2));
  expect(push.error, 'the attack could not even be attempted, so nothing was proved').toBeUndefined();

  // ── THE CLAIM. Nothing played, and nothing was recorded. ───────────────────────────────────
  //
  // Five seconds is fifty times the fast road's measured 97 ms
  // (docs/backlog/playout-lag-when-working-the-queue.md), so a forged command that was going to
  // land has landed by now.
  await air.waitForTimeout(5_000);
  expect(await airPlays(), 'a holder of the output URL made the graphic play').toBe('1');
  expect(await lastRow(air), 'a forged command reached the durable log').toBe(rowsBefore);

  // ── AND THE ROAD IS OPEN TO WHOEVER MAY USE IT. ────────────────────────────────────────────
  //
  // The half that stops this walk passing against a renderer that was not listening at all.
  // Re-take rather than Take: the cue is already up, and this asks for its entrance again.
  await page.getByTestId('verb-retake').click();
  await expect.poll(airPlays, { timeout: 60_000 }).toBe('2');

  await attacker.close();
  await stranger.close();
  await air.close();
  await venue.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
