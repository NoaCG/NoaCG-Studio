// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE ONE PLAYOUT STATUS (docs/work-specs/studio-day-playout AC-7 to AC-10). The production page
// answers "will a Take air?" in one control: grey offline, amber for attention, green on air and
// ready, red when something that should work is broken, always with words beside the colour, and a
// panel that names the check behind it. Every publish also asks the outputs to load the new
// version. None of it exists offline: there is nothing to start, no output to report and no
// version to move to.
//
// NoaCG Bridge and CasparCG are FAKED at the network layer (as e2e/bridge-connect.spec.ts does),
// because what the status reads from them is one `/state` answer: what the output's slot holds.
// The real-server walk of the same states is docs/work-specs/studio-day-playout/evidence/landing-2.md.
// covers: src/control/playoutStatus.ts, src/components/home/PlayoutStatusControl.tsx, src/components/home/ProductionLinks.tsx, src/components/home/PlayoutMonitors.tsx

import { test, expect, type Page, type Route } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { SERVICE_ROLE_KEY, SUPABASE_URL, clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const BRIDGE = 'http://127.0.0.1:8899';

type ReadyWindow = {
  __noacgLive?: {
    presence: () => string;
    ready: () => { n: number; of: number; v: { n: number; h: string } | null; is: { k: string; g?: string; d?: string }[] };
  };
};
const readyOf = (air: Page) => air.evaluate(() => (window as ReadyWindow).__noacgLive?.ready() ?? null);

/** Add a catalog graphic to a production through the same model call the rundown's "+ Add" makes. */
async function addCatalogGraphic(page: Page, showId: string, name: string): Promise<void> {
  await page.evaluate(
    async ([id, wanted]) => {
      const { CATALOG } = await import('/src/templates/catalog.ts');
      const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
      const { formatTemplate } = await import('/src/format/formatCode.ts');
      const { addGraphicToShow } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const variant = Object.values(CATALOG).flat().find((v) => v.name === wanted);
      if (!variant) throw new Error(`no catalog variant ${wanted}`);
      const draft = mergeDraft(initialDraft(), {
        variantId: variant.id,
        lines: variant.suggestedLines.map((l) => ({ ...l })),
        zone: null,
        logoEnabled: null,
        animation: { presetId: null, outPresetId: null },
        paletteId: null,
        customPalette: null,
        fontId: null,
      });
      const { error } = addGraphicToShow(id, await formatTemplate(buildDraftTemplate(variant, draft)), {});
      const failure = error ?? (await commitDurableWrites());
      if (failure) throw new Error(failure);
    },
    [showId, name] as const,
  );
}

/**
 * A NoaCG Bridge 0.7 in front of CasparCG 2.5, as far as the status can see it: it answers, it can
 * read a channel's state, and the output's slot 1-20 holds whatever `slot` says. Put on air (a `take`
 * of a URL) and Take off (`out`) change it as the real server would.
 */
async function fakeStudio(page: Page) {
  const studio = { slot: { producer: 'empty' } as { producer: string; file?: string }, actions: [] as { verb: string }[] };
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' };
  const json = (route: Route, body: unknown) => route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  await page.route(`${BRIDGE}/**`, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/health') return json(route, { ok: true, agent: 'noacg-bridge', v: 2, version: '0.7.0', adapters: ['casparcg'], features: ['state', 'playback', 'sequence', 'servers'] });
    const body = JSON.parse(request.postData() || '{}') as { channel?: number; action?: { verb: string; item?: { name: string } } };
    if (path === '/status') return json(route, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK', capabilities: ['state'] });
    if (path === '/state') {
      const slots = body.channel === 1 ? [{ layer: 20, generation: 0, paused: false, loop: false, ...studio.slot }] : [];
      return json(route, { ok: true, v: 2, channel: body.channel ?? 1, session: 's1', observedAt: Date.now(), slots });
    }
    if (path === '/act' && body.action) {
      studio.actions.push(body.action);
      if (body.action.verb === 'take') studio.slot = { producer: 'html', file: body.action.item?.name ?? '' };
      if (body.action.verb === 'out') studio.slot = { producer: 'empty' };
      return json(route, { ok: true, v: 2, raw: '202 PLAY OK', generation: 1, session: 's1' });
    }
    return json(route, { ok: true, v: 2, items: [], servers: [] });
  });
  return studio;
}

test('the playout status: grey offline, amber with no output, red when the slot is wrong, green on air, and every publish prepares', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showId = await openProductionWithCurrent(page, `Status ${Date.now()}`);
  const status = page.getByTestId('production-status');
  const monitor = page.getByTestId('program-monitor');

  // ── Not started: grey, "Offline", Start beside it, and the monitor does not call itself on air. ──
  await expect(status).toHaveAttribute('data-started', 'false');
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(status).toContainText('Offline');
  await expect(page.getByTestId('production-publish')).toBeVisible();
  await expect(monitor).toHaveAttribute('data-live', 'false');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PREVIEW · NOT LIVE');

  // ── Started with nothing to air it: amber "No output connected", and the panel says why. ──
  await page.getByTestId('production-publish').click();
  await expect(status).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PROGRAM · ON AIR');
  await expect(monitor).toHaveAttribute('data-live', 'true');
  await expect(status).toHaveAttribute('data-tone', 'warn');
  await expect(status).toContainText('No output connected');
  const panel = page.getByTestId('production-status-panel');
  await expect(panel, 'publishing opens the Playout panel').toBeVisible();
  await expect(panel.getByTestId('status-check-outputs')).toHaveAttribute('data-tone', 'warn');
  await expect(panel.getByTestId('production-links')).toBeVisible();
  await page.keyboard.press('Escape');
  const { outputSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return { outputSlug: loadShows().find((x) => x.id === id)?.outputSlug ?? '' };
  }, showId)) as { outputSlug: string };
  expect(outputSlug).toBeTruthy();

  // ── A paired Bridge whose server shows nothing on the output's slot: red, and Put on air is the
  //    press that is due. ──
  const studio = await fakeStudio(page);
  await page.evaluate((bridge) => {
    localStorage.setItem(
      'spx-gfx-caspar',
      JSON.stringify({ agentUrl: bridge, agentToken: 'e2e-token', host: '127.0.0.1', amcpPort: 5250, channel: 1, layer: 20, v: 1 }),
    );
  }, BRIDGE);
  // A reload, not a goto: the page is already on this URL, so a goto would only move the hash.
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(status).toHaveAttribute('data-tone', 'bad', { timeout: 30_000 });
  await expect(status).toContainText('Output not on air');
  await status.click();
  await expect(panel.getByTestId('status-check-slot')).toHaveAttribute('data-tone', 'bad');
  await expect(panel.getByTestId('status-check-slot')).toContainText('Nothing on 1-20');
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  await expect(panel.getByTestId('caspar-put-on-air')).toHaveClass(/primary/);

  // ── Another production on that slot: red, by name. ──
  studio.slot = { producer: 'html', file: 'https://noacg.studio/output?production=someone-else&name=CasparCG%201-20' };
  await panel.getByTestId('playout-check-again').click();
  await expect(status).toHaveAttribute('data-tone', 'bad');
  await expect(status).toContainText('Another production on 1-20', { timeout: 20_000 });
  await expect(panel.getByTestId('status-check-slot')).toContainText('Channel 1 shows another production on 1-20');

  // ── Put on air: green at once, without waiting for the next 10 s read. ──
  await panel.getByTestId('caspar-put-on-air').click();
  await expect(panel.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  expect(studio.slot.file).toContain(`production=${encodeURIComponent(outputSlug)}`);
  await expect(status).toHaveAttribute('data-tone', 'ok', { timeout: 5_000 });
  await expect(status).toContainText('Ready · on air 1-20');
  await expect(panel.getByTestId('caspar-put-on-air')).not.toHaveClass(/primary/);

  // ── Take off: red again, as quickly. ──
  await panel.getByTestId('caspar-take-off-air').click();
  await expect(status).toHaveAttribute('data-tone', 'bad', { timeout: 5_000 });
  await expect(status).toContainText('Output not on air');
  await page.keyboard.press('Escape');
  expect(studio.actions.map((a) => a.verb)).toEqual(['take', 'out']);

  // ── An output elsewhere (OBS, say) reports READY: the empty slot is no longer a fault, and the
  //    status is green on the outputs' own word. ──
  const anon = await browser.newContext();
  const air = await anon.newPage();
  air.on('pageerror', (e) => console.log('[output pageerror]', e.message));
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): READY rides Presence');
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 30_000 }).toBe(1);
  // Fonts the host could not fetch are this host's truth: READY then reads amber, and so does the
  // status. Everything below reads either.
  const fontsOk = ((await readyOf(air))?.is ?? []).every((i) => i.k !== 'font');
  const settled = fontsOk ? 'ok' : 'warn';
  await expect(status).toHaveAttribute('data-outputs', '1', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', settled, { timeout: 30_000 });
  if (fontsOk) await expect(status).toContainText('Ready · 1 output');

  // ── AC-10: a change is amber until published, and the publish moves the open output onto the
  //    new version BY ITSELF: this spec never reloads it. The output builds the new version beside
  //    the running one, checks it, and reloads onto it because nothing is on air (src/output/
  //    prepare.ts). Without the publish's prepare request it would stay behind on v1 until a person
  //    reloaded it, which is what the studio day met. ──
  await addCatalogGraphic(page, showId, 'Hairline');
  await expect(status).toHaveAttribute('data-tone', 'warn', { timeout: 30_000 });
  await expect(status).toContainText('Unpublished changes');
  await status.click();
  await panel.getByTestId('production-republish').click();
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  await expect
    .poll(async () => {
      const { data } = await admin.from('control_shows').select('output').eq('id', showId).single();
      return (data?.output as { ver?: { n: number } }).ver?.n;
    }, { timeout: 30_000 })
    .toBe(2);
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 90_000, message: 'the output moved onto v2 by itself' }).toBe(2);
  await expect(status).toHaveAttribute('data-tone', settled, { timeout: 30_000 });
  await expect(status).not.toContainText('Unpublished');

  // ── Unpublished again: grey and offline, whatever the outputs last said. ──
  if (!(await panel.isVisible())) await status.click();
  await panel.getByTestId('production-unpublish').click();
  await expect(status).toHaveAttribute('data-started', 'false', { timeout: 30_000 });
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(page.getByTestId('program-monitor-name')).toHaveText('PREVIEW · NOT LIVE');

  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await anon.close();
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
