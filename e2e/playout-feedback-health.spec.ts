// Relevant Bridge health and operator words with a locally published fixture. The configured
// sibling proves real Presence/publishing; this one always runs without backend credentials.
// covers: src/control/{playoutStatus,prepareLive,prepareBridge}.ts, src/model/readyMemory.ts
// covers: src/components/home/{ProductionPage,ProductionLinks,PlayoutStatusControl}.tsx, src/components/control/PrepareForLive.tsx
// covers: src/components/{PlayoutSettingsDialog,PlayoutSettingsPanel}.tsx
// focus

import { test, expect } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { fakeBridge, seedSettings } from './_fakeBridge';

test('browser output history ignores an unused Bridge, while CasparCG activity survives a disconnect and reload', async ({ page }) => {
  // Fault-inject the window before React cleans up the old slot effect, and mark when the old
  // reply reaches the guard. Assert its observable memory effect, not timing or repeat counts.
  await page.route('**/src/components/home/ProductionPage.tsx*', async (route) => {
    const response = await route.fetch();
    let body = await response.text();
    const guard = 'if (!alive || actionRev !== slotActionRev.current)';
    expect(body).toContain(guard);
    expect(body).toContain('setSlotRev((n) => n + 1);');
    body = body.replace('setSlotRev((n) => n + 1);', 'setTimeout(() => setSlotRev((n) => n + 1), 1000);');
    body = body.replace(guard, `window.__healthSlotReplies = (window.__healthSlotReplies || 0) + 1; ${process.env.HEALTH_MUTATE_STALE_SLOT ? 'if (!alive)' : guard}`);
    await route.fulfill({ response, body });
  });
  // READY memory is enabled only for a configured production. Stand in the backend on the
  // network like output-ready.spec.ts; no remote project or authenticated data is involved.
  const backend = 'https://health.supabase.test';
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: `
    export function loadBackendConfig() { return { url: '${backend}', anonKey: 'anon-test-key' }; }
    export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
  ` }));
  await page.route(`${backend}/**`, (route) => route.fulfill({
    status: route.request().method() === 'OPTIONS' ? 204 : 200,
    headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'content-type': 'application/json' },
    body: route.request().method() === 'OPTIONS' ? undefined : '[]',
  }));
  await seedSettings(page);
  const bridge = await fakeBridge(page, { missing: true });
  await page.goto('/app');
  await awaitDurableReady(page);
  const id = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow, setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    const { saveReadyMemory } = await import('/src/model/readyMemory.ts');
    const { doc, error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'Guest Strap' });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed('Evening News');
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    setShowHostedSlug(show.id, 'demo-slug');
    setShowOutputSlug(show.id, 'demo-output');
    saveReadyMemory(show.id, { outputs: [{ id: 'browser', name: 'OBS main', seen: Date.now() }], stamp: null });
    return show.id;
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await page.reload();
  const status = page.getByTestId('production-status');
  await expect(page.getByTestId('production-page')).toBeVisible();
  await status.click();
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('status-check-bridge')).toHaveCount(0);
  await expect(panel.getByTestId('status-check-slot')).toHaveCount(0);
  await expect(status).not.toHaveAttribute('data-tone', 'bad');
  await expect(panel.getByTestId('status-check-production')).toContainText('Published changes are available to outputs');
  await expect(panel.getByTestId('publish-guarantees')).toContainText('check changed graphics and assets automatically');
  await expect(panel.getByTestId('prepare-for-live-button')).toHaveText('Check readiness');
  await expect(panel.getByTestId('prepare-for-live')).toContainText('tests command delivery');
  await expect(panel.getByTestId('playout-panel-setup')).not.toHaveAttribute('open');
  await page.screenshot({ path: test.info().outputPath('browser-health-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: test.info().outputPath('browser-health-phone.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 768 });

  bridge.missing = false;
  await panel.getByTestId('caspar-put-on-air').click();
  await expect(panel.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  bridge.missing = true;
  await panel.getByTestId('playout-check-again').click();
  await expect(status).toContainText('Bridge not running');
  await page.reload();
  await expect(status).toContainText('Bridge not running');
  bridge.missing = false;
  await status.click();
  await panel.getByTestId('playout-check-again').click();
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  let releaseState!: () => void;
  const stateHeld = new Promise<void>((resolve) => { releaseState = resolve; });
  let capturedState = false;
  bridge.stateGate = () => { capturedState = true; return stateHeld; };
  await panel.getByTestId('playout-check-again').click();
  await expect.poll(() => capturedState).toBe(true);
  const repliesBefore = await page.evaluate(() => (window as unknown as { __healthSlotReplies?: number }).__healthSlotReplies ?? 0);
  await panel.getByTestId('caspar-take-off-air').click();
  await expect(panel.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  bridge.stateGate = () => {};
  releaseState();
  await expect.poll(() => page.evaluate(() => (window as unknown as { __healthSlotReplies?: number }).__healthSlotReplies ?? 0)).toBeGreaterThan(repliesBefore);
  expect(await page.evaluate(async (showId) => (await import('/src/model/readyMemory.ts')).loadReadyMemory(showId).casparOutput, id), 'an older slot reply must not restore intent after Take off').toBeUndefined();
  await expect(panel.getByTestId('status-check-bridge')).toHaveCount(0);
  // The settings dialog's existing action proves the same intent, without waiting for /state.
  await panel.getByTestId('playout-panel-setup').locator('summary').click();
  await panel.getByTestId('playout-settings-open').click();
  await page.getByTestId('playout-put-on-air').click();
  await expect(page.getByTestId('playout-result')).toHaveAttribute('data-state', 'ok');
  bridge.missing = true;
  await page.getByTestId('playout-settings-close').click();
  await page.reload();
  await expect(status).toContainText('Bridge not running');
  bridge.missing = false;
  await status.click();
  await panel.getByTestId('playout-check-again').click();
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  await panel.getByTestId('caspar-take-off-air').click();
  await expect(panel.getByTestId('status-check-bridge')).toHaveCount(0);
  // OBS graphics with server media still require Bridge, but never an unused graphics slot.
  await page.evaluate(async (showId) => {
    const { addPlayoutItem } = await import('/src/model/shows.ts');
    addPlayoutItem(showId, { adapter: 'casparcg', kind: 'media', name: 'OPENER', channel: 2, layer: 10 });
  }, id);
  await expect(panel.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  await expect(panel.getByTestId('status-check-slot')).toHaveCount(0);
  bridge.missing = true;
  await panel.getByTestId('playout-check-again').click();
  await expect(status).toContainText('Bridge not running');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
