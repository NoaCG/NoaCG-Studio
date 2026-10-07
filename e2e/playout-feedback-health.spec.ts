// Relevant Bridge health and operator words with a locally published fixture. The configured
// sibling proves real Presence/publishing; this one always runs without backend credentials.
// covers: src/control/{playoutStatus,prepareLive,prepareBridge,readiness}.ts, src/model/{readyMemory,outputSetup}.ts
// covers: src/components/home/{ProductionPage,PlayoutPanel,PlayoutStatusControl,ProductionSetupMenu}.tsx, src/components/control/PrepareForLive.tsx
// covers: src/components/{PlayoutSettingsDialog,PlayoutSettingsPanel}.tsx
// focus

import { test, expect } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { fakeBridge, seedSettings } from './_fakeBridge';

test('a browser production ignores a paired Bridge and old outputs, while CasparCG switched on survives a disconnect and reload', async ({ page, request }) => {
  test.setTimeout(120_000);
  // Fault-inject the window before React cleans up the old slot effect, and mark when the old
  // reply reaches the guard. Assert its observable memory effect, not timing or repeat counts.
  // Prepare Vite's transformed module once, before navigation, and fulfill from memory on every
  // reload. Re-fetching it inside the route exposed the health assertions to a pooled Node
  // connection resetting (CI run 37163639314). The setup fetch still fails on any error.
  const response = await request.get('/src/components/home/ProductionPage.tsx', { headers: { Connection: 'close' } });
  await expect(response).toBeOK();
  let body = await response.text();
  await response.dispose();
  const guard = 'if (!alive || actionRev !== slotActionRev.current)';
  expect(body).toContain(guard);
  expect(body).toContain('setSlotRev((n) => n + 1);');
  body = body.replace('setSlotRev((n) => n + 1);', 'setTimeout(() => setSlotRev((n) => n + 1), 1000);');
  body = body.replace(guard, `window.__healthSlotReplies = (window.__healthSlotReplies || 0) + 1; ${process.env.HEALTH_MUTATE_STALE_SLOT ? 'if (!alive)' : guard}`);
  await page.route('**/src/components/home/ProductionPage.tsx*', (route) => route.fulfill({ contentType: 'text/javascript', body }));
  // READY memory is enabled only for a configured production. Stand in the backend on the
  // network like output-ready.spec.ts; no remote project or authenticated data is involved.
  const backend = 'https://health.supabase.test';
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export function loadBackendConfig() { return { url: '${backend}', anonKey: 'anon-test-key' }; }
    export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
  ` }));
  let publishedFixture: unknown = null;
  await page.route(`${backend}/**`, (route) => route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 200,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' },
    body: route.request().method() === 'OPTIONS' ? undefined : new URL(route.request().url()).pathname.endsWith('/rpc/control_show_resolve') ? JSON.stringify(publishedFixture) : '[]',
  }));
  await seedSettings(page);
  const bridge = await fakeBridge(page, { missing: true });
  // Seed after the shell boot has settled, so its first-visit wizard cannot rewrite a later hash navigation.
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await awaitDurableReady(page);
  const fixture = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow, setShowHostedSlug, setShowOutputSlug, loadShows, upsertShow } = await import('/src/model/shows.ts');
    const { saveReadyMemory } = await import('/src/model/readyMemory.ts');
    const { buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { stampPayload } = await import('/src/control/payloadVersion.ts');
    const { doc, error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'Guest Strap' });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed('Evening News');
    // This fixture predates output setup and has no recorded CasparCG activity, so its CasparCG
    // switch reads off (model/outputSetup.ts `casparSwitch`); it remembers an OBS from before.
    const legacy = loadShows().find(s => s.id === show.id)!;
    delete legacy.outputSetup;
    upsertShow(legacy);
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    setShowHostedSlug(show.id, 'demo-slug');
    setShowOutputSlug(show.id, 'demo-output');
    saveReadyMemory(show.id, { outputs: [{ id: 'browser', name: 'OBS main', seen: Date.now() }], stamp: null });
    const current = loadShows().find(s => s.id === show.id)!;
    const output = await buildOutputPayload(current);
    output.ver = await stampPayload(output, null);
    return { id: show.id, title: show.name, output, live: {}, staged: {}, last_event_id: 0 };
  });
  publishedFixture = fixture;
  const id = fixture.id;
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.reload();
  const status = page.getByTestId('production-status');
  await expect(page.getByTestId('production-page')).toBeVisible();
  await status.click();
  const panel = page.getByTestId('production-status-panel');
  // A legacy production with no CasparCG activity has CasparCG switched off, so the paired Bridge,
  // which is not running, is neither shown nor judged (playout-workflow-simplification AC-4).
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await expect(panel.getByTestId('caspar-slot')).toHaveCount(0);
  // The OBS this browser remembers from an earlier session is not expected today (D4): published
  // with nothing reporting is a quiet grey "Not connected", never red and never "lost" (AC-2).
  await expect(status).toHaveAttribute('data-tone', 'idle');
  await expect(status).toHaveText(/Not connected/);
  await expect(panel.getByTestId('ready-output')).toHaveCount(0);
  await expect(panel.getByTestId('playout-no-outputs')).toBeVisible();
  // Readiness lives in the output rows now and "Check now" re-runs prepare and ping; the readiness
  // checklist, the publish guarantees and the output setup section are gone (AC-3, D5).
  await expect(panel.getByTestId('playout-check-now')).toHaveText('Check now');
  for (const gone of ['prepare-for-live', 'prepare-for-live-button', 'publish-guarantees', 'status-check-production', 'playout-panel-setup', 'production-output-setup']) {
    await expect(page.getByTestId(gone), gone).toHaveCount(0);
  }
  await page.screenshot({ path: test.info().outputPath('browser-health-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('browser-health-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });

  // CasparCG switched on: the Bridge and the output slot appear, and Load puts this production's
  // renderer on the slot. The header's one action slot offers the same Load (D1).
  bridge.missing = false;
  if (!(await panel.isVisible())) await status.click();
  await panel.getByTestId('caspar-switch').click();
  await expect(panel.getByTestId('caspar-switch')).toBeChecked();
  const bridgeRow = panel.getByTestId('caspar-bridge');
  const slot = panel.getByTestId('caspar-slot');
  await expect(bridgeRow).toHaveAttribute('data-tone', 'ok');
  await expect(bridgeRow).toContainText('Bridge connected');
  await expect(slot).toContainText('Output slot 1-20');
  await expect(slot).toContainText('Empty');
  await expect(page.getByTestId('playout-action-slot').getByTestId('caspar-load')).toHaveText('Load on 1-20');
  expect(bridge.actions).toEqual([]);
  await slot.getByTestId('caspar-put-on-air').click();
  await expect(slot.getByTestId('caspar-take-off-air')).toBeVisible();
  await expect(slot).toContainText(/Loading…|Loaded/);
  expect(bridge.actions).toHaveLength(1);
  expect(bridge.actions[0]).toMatchObject({ verb: 'take', item: { kind: 'url', name: expect.stringContaining('/output?production=demo-output') }, slot: { channel: 1, layer: 20 } });
  await expect(page.getByTestId('playout-action-slot').getByTestId('caspar-load')).toHaveCount(0);

  // The Bridge goes away: red with the reason, on the header and the Bridge row, and still red
  // after a reload, because the switch is the production's own.
  bridge.missing = true;
  await expect(status).toContainText('Bridge not running', { timeout: 15_000 });
  await expect(status).toHaveAttribute('data-tone', 'bad');
  await expect(bridgeRow).toHaveAttribute('data-tone', 'bad');
  await expect(bridgeRow).toContainText('NoaCG Bridge is not running');
  await expect(bridgeRow).not.toContainText(/\bv\d+\b/);
  await page.reload();
  await expect(status).toContainText('Bridge not running');
  bridge.missing = false;
  await status.click();
  await expect(bridgeRow).toHaveAttribute('data-tone', 'ok', { timeout: 15_000 });
  await expect(slot.getByTestId('caspar-take-off-air')).toBeVisible();

  // A slot read captured before Unload must not answer for after it: Unload on purpose is not a
  // lost slot, and the older reply must not restore the CasparCG memory.
  let releaseState!: () => void;
  const stateHeld = new Promise<void>((resolve) => { releaseState = resolve; });
  let capturedState = false;
  bridge.stateGate = () => { capturedState = true; return stateHeld; };
  // The slot is read every 10 s; wait for the next read and hold its reply.
  await expect.poll(() => capturedState, { timeout: 15_000 }).toBe(true);
  const repliesBefore = await page.evaluate(() => (window as unknown as { __healthSlotReplies?: number }).__healthSlotReplies ?? 0);
  await slot.getByTestId('caspar-take-off-air').click();
  await expect.poll(() => bridge.actions.filter((a) => a.verb === 'out').length).toBe(1);
  bridge.stateGate = () => {};
  releaseState();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __healthSlotReplies?: number }).__healthSlotReplies ?? 0)).toBeGreaterThan(repliesBefore);
  expect(await page.evaluate(async (showId) => (await import('/src/model/readyMemory.ts')).loadReadyMemory(showId).casparOutput, id), 'an older slot reply must not restore intent after Unload').toBeUndefined();
  await expect(slot).toContainText('Empty');
  await expect(slot).toHaveAttribute('data-tone', 'idle');
  await expect(status).not.toHaveAttribute('data-tone', 'bad');
  await expect(status).not.toContainText('Not on 1-20');

  // Playout settings' own Put on air proves the same intent, without waiting for the slot poll: the
  // slot is read again at once and holds this production.
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-playout-settings').click();
  await page.getByTestId('playout-put-on-air').click();
  await expect(page.getByTestId('playout-result')).toHaveAttribute('data-state', 'ok');
  bridge.missing = true;
  await page.getByTestId('playout-settings-close').click();
  await page.reload();
  await expect(status).toContainText('Bridge not running');
  bridge.missing = false;
  await status.click();
  await expect(bridgeRow).toHaveAttribute('data-tone', 'ok', { timeout: 15_000 });
  await expect(slot.getByTestId('caspar-take-off-air')).toBeVisible();
  await slot.getByTestId('caspar-take-off-air').click();
  await expect(slot).toContainText('Empty');

  // Unload leaves CasparCG switched on; the switch is what makes the Bridge irrelevant again
  // (AC-4), and with it off a missing Bridge is not a fault.
  await panel.getByTestId('caspar-switch').click();
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await expect(bridgeRow).toHaveCount(0);
  await expect(slot).toHaveCount(0);
  bridge.missing = true;
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(status).not.toHaveAttribute('data-tone', 'bad');
  await expect(status).not.toContainText('Bridge');

  // A server cue does not override the switch the operator set: with CasparCG off it is not
  // takeable even with the Bridge answering, and the Bridge is still not judged (AC-4). Switching
  // CasparCG on is what makes it takeable, so the switch is what held it.
  bridge.missing = false;
  const sent = bridge.actions.length;
  const cueId = await page.evaluate(async (showId) => {
    const { addPlayoutItem } = await import('/src/model/shows.ts');
    return addPlayoutItem(showId, { adapter: 'casparcg', kind: 'media', name: 'OPENER', channel: 2, layer: 10 }).cueId;
  }, id);
  await page.getByTestId(`cue-${cueId}`).getByTestId('select-cue').click();
  const take = page.getByTestId('verb-take');
  await expect(take).toBeDisabled();
  await status.click();
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await expect(status).not.toHaveAttribute('data-tone', 'bad');
  await panel.getByTestId('caspar-switch').click();
  await expect(take).toBeEnabled({ timeout: 15_000 });
  await panel.getByTestId('caspar-switch').click();
  await expect(take).toBeDisabled();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  expect(bridge.actions).toHaveLength(sent);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
