// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// OBS SCENE MONITORING (docs/work-specs/obs-scenes/spec.md OS3, AC-6; rules M2 to M8). Real scene
// links on the production's live topic, each a page that sends OBS's own browser source events, and
// the production page's one row per scene: not loaded, loaded and connected, unknown before any OBS
// event, preview, program, the walk-through tick, loaded twice, not answering after the page goes
// away, and the question before switching OBS scenes off while a link is loaded (#2454). Simulated
// events are not hardware proof: the owner confirms the rows in OBS (OS7).
// covers: src/control/obsSceneRows.ts, src/components/home/PlayoutPanel.tsx, src/output/sceneScope.ts, src/output/main.ts, src/control/livePath.ts

import { publishProduction } from '../_publish';
import { test, expect, type Browser, type Page } from '@playwright/test';
import { addCatalogGraphic, bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, readyOf, signIn, type ReadyWindow, unpublishForCleanup } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

/** A scene link in a browser of its own, signed out as in a studio. */
async function openLink(browser: Browser, url: string): Promise<Page> {
  const air = await (await browser.newContext()).newPage();
  air.on('pageerror', (e) => console.log('[scene link pageerror]', e.message));
  await air.goto(url);
  await expect.poll(() => air.evaluate(() => (window as ReadyWindow).__noacgLive?.presence() ?? 'joining'), { timeout: 60_000 }).toBe('joined');
  await expect.poll(async () => (await readyOf(air))?.n, { timeout: 60_000 }).toBeGreaterThan(0);
  return air;
}

const obs = (air: Page, type: string, detail: Record<string, unknown>) =>
  air.evaluate(([type, detail]) => window.dispatchEvent(new CustomEvent(type as string, { detail })), [type, detail] as const);

test('OBS scene rows: loaded, connected, unknown, preview, program, seen, loaded twice, not answering, and a question before switching off', async ({ page, browser }) => {
  test.setTimeout(420_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'Scene Strap' });
  const showId = await openProductionWithCurrent(page, `Scenes ${Date.now()}`);
  await addCatalogGraphic(page, showId, 'Hairline');
  // Two scenes, one graphic each, the switch on: the record's own writers, then a fresh page.
  const scenes = await page.evaluate(async (id) => {
    const m = await import('/src/model/shows.ts');
    const cues = m.loadShows().find((s) => s.id === id)!.cues!;
    const a = m.addFolderFromSelection(id, [cues[0].id], 'Gameplay').folderId!;
    const b = m.addFolderFromSelection(id, [cues[1].id], 'Desk').folderId!;
    m.setFolderObsScene(id, a, true);
    m.setFolderObsScene(id, b, true);
    m.setShowObsScenes(id, true);
    const failure = await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    if (failure) throw new Error(failure);
    return { a, b };
  }, showId);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  const outputSlug = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? '', showId);
  expect(outputSlug).toBeTruthy();
  const link = (scene: string) => `/output?production=${encodeURIComponent(outputSlug)}&scene=${encodeURIComponent(scene)}`;

  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  const row = (scene: string) => panel.locator(`[data-testid="obs-scene-row"][data-scene="${scene}"]`);
  const state = (scene: string) => row(scene).getByTestId('obs-scene-state');
  // Nothing loaded: grey, and nothing ticked (which is not an error).
  await expect(state(scenes.a)).toHaveText('Not loaded', { timeout: 30_000 });
  await expect(state(scenes.b)).toHaveText('Not loaded');
  await expect(row(scenes.a).getByTestId('obs-scene-seen')).toHaveText('Not yet seen');

  // Gameplay's link loads: ready and connected, OBS unknown until its first event. An entry changes at
  // most once per 10 s (the Presence budget), so each reading may take that long.
  const gameplay = await openLink(browser, link(scenes.a));
  await expect(state(scenes.a)).toHaveText('Ready, connected', { timeout: 45_000 });
  await expect(row(scenes.a)).toHaveAttribute('data-tone', 'ok');
  await expect(row(scenes.a).getByTestId('obs-scene-obs')).toHaveText('OBS: unknown');
  // It is the scene's row that speaks for it, not a line in the Outputs list.
  await expect(panel.getByTestId('ready-output')).toHaveCount(0);
  // Preview, then program in the OBS scene "Gameplay": the walk-through ticks it.
  await obs(gameplay, 'obsSourceVisibleChanged', { visible: true });
  await expect(row(scenes.a).getByTestId('obs-scene-obs')).toHaveText('Preview', { timeout: 45_000 });
  await obs(gameplay, 'obsSourceActiveChanged', { active: true });
  await obs(gameplay, 'obsSceneChanged', { name: 'Gameplay' });
  await expect(row(scenes.a).getByTestId('obs-scene-obs')).toHaveText('Program', { timeout: 45_000 });
  await expect(row(scenes.a).getByTestId('obs-scene-seen')).toHaveText('Seen in OBS scene “Gameplay”', { timeout: 45_000 });

  // The same link in a second browser source: loaded twice, amber. Closed again: one.
  const twice = await openLink(browser, link(scenes.a));
  await expect(state(scenes.a)).toHaveText('Loaded twice', { timeout: 45_000 });
  await expect(row(scenes.a)).toHaveAttribute('data-tone', 'warn');
  await twice.context().close();
  await expect(state(scenes.a)).toHaveText('Ready, connected', { timeout: 60_000 });

  // Switching OBS scenes off while a link is loaded asks first, naming how many go empty; Cancel
  // keeps it on (#2454).
  await panel.getByTestId('obs-scenes-switch').click();
  await expect(panel.getByTestId('obs-scenes-off-ask')).toContainText('1 OBS scene goes empty at the next publish');
  await panel.getByTestId('obs-scenes-off-cancel').click();
  await expect(panel.getByTestId('obs-scenes-switch')).toBeChecked();
  await expect(panel.getByTestId('obs-scene-row')).toHaveCount(2);

  // The page goes away: stale presence reads not answering, red after 15 s; the tick stays.
  await gameplay.context().close();
  await expect(state(scenes.a)).toHaveText(/^Not answering/, { timeout: 60_000 });
  await expect(row(scenes.a)).toHaveAttribute('data-tone', 'bad', { timeout: 30_000 });
  await expect(row(scenes.a).getByTestId('obs-scene-seen')).toHaveText('Seen in OBS scene “Gameplay”');
  await expect(state(scenes.b)).toHaveText('Not loaded');

  // With nothing loaded, switching off asks nothing.
  await panel.getByTestId('obs-scenes-switch').click();
  await expect(panel.getByTestId('obs-scenes-off-ask')).toHaveCount(0);
  await expect(panel.getByTestId('obs-scenes-switch')).not.toBeChecked();
  await expect(panel.getByTestId('obs-scene-row')).toHaveCount(0);

  await page.keyboard.press('Escape');
  await unpublishForCleanup(page);
});
