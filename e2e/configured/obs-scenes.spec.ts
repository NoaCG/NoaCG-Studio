// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot publish, and this walk is a publish.
//
// OBS SCENES AGAINST A REAL BACKEND (docs/work-specs/obs-scenes/spec.md): the journeys that need a
// publish. The offline halves are e2e/playout-folders.spec.ts (the rundown) and
// e2e/output-scene-link.spec.ts (the link).
//
// Making a scene takes its graphics (#2489; D2 and Behaviour "Scenes"): a publish that puts a
// graphic in a scene airs it in that scene's link with no Take pressed, once the link has read that
// publish (a link reads another scene's graphic past until then, OS1a R6). A graphic the operator
// took out stays out at the next publish; one outside every scene is never taken. Which graphics
// join and the wait are scripts/scene-join.test.mjs.
// covers: src/control/sceneJoin.ts, src/model/obsScenes.ts, src/components/home/ProductionPage.tsx
// covers: src/components/home/useProductionPublish.ts, src/control/hostedControl.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import { clearPublishedShows, haveCreds, readyOf, signIn, unpublishForCleanup, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const list = (page: Page) => page.getByTestId('cue-list');
const folder = (page: Page, name: string) => list(page).locator('.pd-folder', { hasText: name });
const row = (page: Page, label: string) => list(page).locator('.pd-cue').filter({ has: page.locator('.pd-cue-label strong', { hasText: new RegExp(`^${label}$`) }) });

/** A graphic's machine state on an output page: 'off' when it is not on air, null while unbuilt. */
async function stateOn(air: Page, key: string): Promise<string | null> {
  const handle = await air.locator(`iframe[title="${key}"]:not([data-prepared])`).elementHandle().catch(() => null);
  const doc = await handle?.contentFrame();
  if (!doc) return null;
  return doc
    .evaluate(() => (window as unknown as { noacgMachineState?: () => { groups: Record<string, string> } }).noacgMachineState?.().groups.main ?? null)
    .catch(() => null);
}

/** Make a folder an OBS scene from its menu, then publish the change from the Playout panel. */
async function makeSceneAndPublish(page: Page, name: string): Promise<void> {
  await folder(page, name).getByTestId('folder-menu').click();
  await page.getByTestId('folder-obs-scene-toggle').click();
  await expect(folder(page, name).getByTestId('folder-obs-scene')).toBeVisible();
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  await panel.getByTestId('panel-publish-changes').click();
  await expect(panel.getByTestId('panel-publish-changes')).toHaveCount(0, { timeout: 90_000 });
  await page.keyboard.press('Escape');
}

test('making an OBS scene takes its graphics on air in its link, and a graphic taken out stays out', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  // Two folders, Gameplay holding Hairline and Desk holding Bug, and a Hand cue in neither; the
  // OBS scenes switch on, no folder a scene yet.
  const { showId, gameplay } = await page.evaluate(async (title) => {
    const m = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { useTemplateStore, flushPendingProject } = await import('/src/store/templateStore.ts');
    const { useRouter } = await import('/src/app/router.ts');
    const { show, error: notCreated } = m.createShowNamedChecked(title);
    if (notCreated) throw new Error(notCreated);
    const id = show.id;
    const { template, saved } = useTemplateStore.getState();
    const added = m.addGraphicToShow(id, template, { graphicId: saved.graphicId });
    if (added.error) throw new Error(added.error);
    for (const name of ['Bug', 'Hand']) m.addGraphicToShow(id, { ...template, name });
    const idOf = (label: string) => m.loadShows().find((s) => s.id === id)!.cues!.find((c) => c.label === label)!.id;
    const a = m.addFolderFromSelection(id, [idOf('Hairline')], 'Gameplay');
    const b = m.addFolderFromSelection(id, [idOf('Bug')], 'Desk');
    if (!a.folderId || !b.folderId) throw new Error(`folders not made: ${a.error ?? b.error}`);
    m.setShowObsScenes(id, true);
    flushPendingProject();
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    useRouter.getState().navigate({ view: 'production', id });
    await new Promise((resolve) => setTimeout(resolve));
    return { showId: id, gameplay: a.folderId };
  }, `Scenes ${Date.now()}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  const outputSlug = await page.evaluate(
    async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? '',
    showId,
  );
  expect(outputSlug).not.toBe('');

  // Gameplay's link is open in OBS before its folder is a scene: it builds nothing yet.
  const anon = await browser.newContext();
  const air = await anon.newPage();
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&scene=${encodeURIComponent(gameplay)}`);
  await expect.poll(async () => (await readyOf(air)) !== null, { timeout: 60_000 }).toBe(true);
  await expect.poll(() => air.evaluate(() => (window as unknown as { __noacgLive: { presence: () => string } }).__noacgLive.presence()), { timeout: 30_000 }).toBe('joined');

  // Making Gameplay a scene and publishing airs Hairline there, with no Take pressed.
  await makeSceneAndPublish(page, 'Gameplay');
  await expect.poll(() => stateOn(air, 'Hairline'), { timeout: 60_000, message: 'the joined graphic is on air in its scene link' }).not.toBeNull();
  await expect.poll(() => stateOn(air, 'Hairline'), { timeout: 30_000 }).not.toBe('off');
  await expect(row(page, 'Hairline')).toHaveClass(/up-here/);
  await expect(row(page, 'Bug')).not.toHaveClass(/up-here/);
  await expect(row(page, 'Hand')).not.toHaveClass(/up-here/);

  // Taken out by hand, it stays out when the next publish makes Desk a scene, which airs Bug.
  await row(page, 'Hairline').getByTestId('select-cue').click();
  await page.getByTestId('verb-out').click();
  await expect(row(page, 'Hairline')).not.toHaveClass(/up-here/);
  await expect.poll(() => stateOn(air, 'Hairline'), { timeout: 30_000 }).toBe('off');
  await makeSceneAndPublish(page, 'Desk');
  await expect(row(page, 'Bug')).toHaveClass(/up-here/, { timeout: 60_000 });
  await expect(row(page, 'Hairline')).not.toHaveClass(/up-here/);
  await expect(row(page, 'Hand')).not.toHaveClass(/up-here/);
  expect(await stateOn(air, 'Hairline')).toBe('off');

  await anon.close();
  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
