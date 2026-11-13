// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// THE READINESS RUN (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/spec.md AC-8, AC-9,
// AC-11), since docs/work-specs/playout-workflow-simplification behind Check now, Publish changes
// and Publish: it publishes what changed, asks every output to prepare over the production page's
// Presence entry, pings the command path, and ends in a stamp both surfaces show. Its result reads
// in the Playout panel's output rows ("110 ms") and "Checked 14:02". Nothing is locked meanwhile.
// The output's own preparation (changes built beside the running graphics, the reload) is the
// offline e2e/output-prepare.spec.ts; the words are scripts/prepare-live.test.mjs.
// The command path ping (landing c, AC-12) is said on each output's line once the outputs settle.
// covers: src/components/control/PrepareForLive.tsx, src/control/prepareLive.ts, src/output/prepare.ts, src/components/home/ProductionPage.tsx, src/components/home/PlayoutPanel.tsx, supabase/migrations/0072_command_ping.sql
// covers: src/components/home/CueEditor.tsx
// A graphic edited in the library counts as an unpublished change (docs/work-specs/studio-day-playout AC-5).
// covers: src/components/home/usePublishDrift.ts
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
//
// OBS scenes (docs/work-specs/obs-scenes/spec.md, #2489): a publish that makes a scene, or adds a
// graphic to one, airs it in that scene's link with no Take pressed, once the link has read that
// publish (a link reads another scene's graphic past until then, OS1a R6). A graphic the operator
// took out stays out at the next publish; one outside every scene is never taken. Which graphics
// join and the wait are scripts/scene-join.test.mjs; the offline halves are
// e2e/playout-folders.spec.ts and e2e/output-scene-link.spec.ts.
// covers: src/control/sceneJoin.ts, src/model/obsScenes.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import { clearPublishedShows, haveCreds, readyOf, signIn, wipeMyGraphics, unpublishForCleanup, type ReadyWindow } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

const shot = (name: string) => (process.env.READY_SHOTS ? `${process.env.READY_SHOTS}/prepare-${name}.png` : test.info().outputPath(`${name}.png`));


/** Open the READY panel if it is shut. */
async function openPanel(page: Page, testId: string): Promise<void> {
  const line = page.getByTestId(testId);
  if ((await line.getAttribute('aria-expanded')) !== 'true') await line.click();
  await expect(page.getByTestId(`${testId}-panel`)).toBeVisible();
}

test('the readiness run publishes what changed, checks every output and ends in a stamp both surfaces show', async ({ page, browser }) => {
  test.setTimeout(360_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  // A House Scorebug left in the synced test account by a run that died would make the library
  // name match below ambiguous, and the AC-5 step would fail for a reason that is not the product.
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  // In the LIBRARY too, and added from its record, as a graphic saved and added from Home is: the
  // production's copy links to it, so the AC-5 step's library edit is offered as Update
  // (live-publishing W2: the copy is the only truth).
  const showId = await page.evaluate(async (name) => {
    const { createGraphic } = await __noacgImport('/src/model/library.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const { createShowNamedChecked, addGraphicToShow } = await __noacgImport('/src/model/shows.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const { useRouter } = await __noacgImport('/src/app/router.ts');
    const { template } = useTemplateStore.getState();
    const { doc, error: notSaved } = createGraphic(template, { name: template.name });
    if (notSaved || !doc) throw new Error(notSaved ?? 'not saved');
    const { show, error: notCreated } = createShowNamedChecked(name);
    if (notCreated) throw new Error(notCreated);
    const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    const failure = error ?? (await commitDurableWrites());
    if (failure) throw new Error(failure);
    useRouter.getState().navigate({ view: 'production', id: show.id });
    await new Promise((resolve) => setTimeout(resolve));
    return show.id;
  }, `Prepare ${Date.now()}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.getByTestId('production-status').click();
  const { outputSlug } = (await page.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const s = loadShows().find((x) => x.id === id);
    return { outputSlug: s?.outputSlug ?? '' };
  }, showId)) as { outputSlug: string };

  const anon = await browser.newContext();
  const air = await anon.newPage();
  await air.goto(`/output?production=${encodeURIComponent(outputSlug)}&destination=browser&name=${encodeURIComponent('Desk A')}&debug=1`);
  await expect(air.locator('pre')).toContainText('realtime: following', { timeout: 60_000 });
  const presence = () => air.evaluate(() => (window as ReadyWindow).__noacgLive!.presence());
  await expect.poll(presence, { timeout: 30_000 }).not.toBe('joining');
  test.skip((await presence()) !== 'joined', 'this server has no live topic (migration 0068): Prepare for Live rides Presence');
  await expect.poll(async () => (await readyOf(air))?.n, { timeout: 30_000 }).toBe(1);
  let reloads = 0;
  air.on('domcontentloaded', () => { reloads++; });
  const desk = page.getByTestId('production-status');
  await expect(desk).toHaveAttribute('data-source', 'ready', { timeout: 30_000 });

  // ── AC-8: nothing unpublished, so the panel offers Check now, not a publish. ──
  await page.setViewportSize({ width: 1920, height: 1080 });
  await openPanel(page, 'production-status');
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('panel-publish-changes')).toHaveCount(0);
  await panel.getByTestId('playout-check-now').click();
  const checked = panel.getByTestId('playout-checked');
  await expect(checked).toHaveText(/^Checked \d\d:\d\d$/, { timeout: 90_000 });
  const deskRow = panel.getByTestId('ready-output').filter({ hasText: 'Desk A' });
  await expect(deskRow).toBeVisible();
  // ── AC-12: one ping through the command path, answered by the output (migration 0072), said on
  //    the output's own row. ──
  await expect(deskRow.getByTestId('ready-path')).toHaveText(/^(\d+ ms|Commands reach it)$/, { timeout: 30_000 });
  const stampOf = () =>
    page.evaluate(async (id) => (await __noacgImport('/src/model/readyMemory.ts')).loadReadyMemory(id).stamp, showId);
  const first = await stampOf();
  expect(first?.v.n).toBe(1);
  test.info().annotations.push({ type: 'stamp', description: JSON.stringify(first) });
  await page.screenshot({ path: shot('desk-1920-checked') });


  // Cue fields change metadata, not prepared assets: no header action, the panel offers Publish
  // changes, and the output adopts the new version without navigating.
  const metadataReloads = reloads;
  await page.keyboard.press('Escape');
  const teamA = page.getByTestId('cue-field-f0');
  await teamA.fill('PREPARED');
  await teamA.blur();
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
  await openPanel(page, 'production-status');
  // Check now stays: it checks the version already published and publishes nothing (D5).
  const checkedBefore = (await stampOf())?.at ?? 0;
  await panel.getByTestId('playout-check-now').click();
  await expect.poll(async () => (await stampOf())?.at ?? 0, { timeout: 90_000 }).toBeGreaterThan(checkedBefore);
  expect((await stampOf())?.v.n, 'Check now must not publish the edit').toBe(1);
  await expect(panel.getByTestId('panel-publish-changes')).toBeVisible();
  await panel.getByTestId('panel-publish-changes').click();
  // The panel shuts on any click outside it (a Take, say), here while the run is still publishing;
  // the run goes on to its stamp regardless.
  await page.getByTestId('production-status').click();
  await expect(panel).toHaveCount(0);
  await expect.poll(async () => (await stampOf())?.v.n ?? 0, { timeout: 90_000 }).toBe(2);
  await expect.poll(async () => (await readyOf(air))?.v?.n, { timeout: 30_000 }).toBe(2);
  expect(reloads, 'cue metadata must not reload the output').toBe(metadataReloads);

  // ── The graphic edited in the LIBRARY, as the editor's save does. The production's copy is the
  //    only truth (live-publishing W2): nothing changes for the outputs and the header asks for no
  //    publish; the cue editor says "Newer design in library", and its Update takes the design into
  //    the copy, which is a change the outputs draw, so Publish changes moves the output onto it
  //    (docs/work-specs/studio-day-playout AC-5). ──
  const readUpdatedAt = () =>
    page.evaluate(async (id) => (await __noacgImport('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.updatedAt ?? '', showId);
  const recordBefore = await readUpdatedAt();
  const edited = await page.evaluate(async (id) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const { loadGraphics, resolveSavedGraphicDoc, updateGraphic } = await __noacgImport('/src/model/library.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const pooled = loadShows().find((s) => s.id === id)?.graphics[0];
    const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
    if (!doc) return false;
    const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* edited in the library */` } });
    return !error && !(await commitDurableWrites());
  }, showId);
  expect(edited, 'the production names its graphic in the library').toBe(true);
  await expect(page.getByTestId('newer-design')).toContainText('Newer design in library', { timeout: 15_000 });
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
  expect(await readUpdatedAt()).toBe(recordBefore);
  expect((await stampOf())?.v.n, 'a library edit publishes nothing').toBe(2);
  await page.getByTestId('design-update').click();
  await expect(page.getByTestId('newer-design')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await readyOf(air))?.v?.n ?? 0, { timeout: 90_000 }).toBe(3);
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0, { timeout: 30_000 });

  // ── An output seen this session that goes is LOST, in red, by name. ──
  await air.close();
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-tone', 'bad', { timeout: 60_000 });
  await expect(page.getByTestId('production-status')).toContainText('Desk A lost');
  await openPanel(page, 'production-status');
  await expect(panel.getByTestId('ready-output').filter({ hasText: 'Desk A' }).getByTestId('ready-state')).toHaveText('Lost');
  await page.screenshot({ path: shot('desk-1920-lost') });

  await unpublishForCleanup(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'false', { timeout: 20_000 });
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await anon.close();
});

// ── OBS scenes ──

const list = (page: Page) => page.getByTestId('cue-list');
const folder = (page: Page, name: string) => list(page).locator('.pd-folder', { hasText: name });
/** A rundown row that is up: `on-air` once the production is published, `up-here` before. */
const LIVE = /(^| )(on-air|up-here)( |$)/;
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

test('OBS scenes (#2489): making a scene takes its graphics on air in its link, and a graphic taken out stays out', async ({ page, browser }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  // Two folders, Gameplay holding Hairline and Desk holding Bug, and a Hand cue in neither; the
  // OBS scenes switch on, no folder a scene yet.
  const { showId, gameplay } = await page.evaluate(async (title) => {
    const m = await __noacgImport('/src/model/shows.ts');
    const { commitDurableWrites } = await __noacgImport('/src/model/durableStore.ts');
    const { useTemplateStore, flushPendingProject } = await __noacgImport('/src/store/templateStore.ts');
    const { useRouter } = await __noacgImport('/src/app/router.ts');
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
    async (id) => (await __noacgImport('/src/model/shows.ts')).loadShows().find((s) => s.id === id)?.outputSlug ?? '',
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
  await expect(row(page, 'Hairline')).toHaveClass(LIVE);
  await expect(row(page, 'Bug')).not.toHaveClass(LIVE);
  await expect(row(page, 'Hand')).not.toHaveClass(LIVE);

  // Taken out by hand, it stays out when the next publish makes Desk a scene, which airs Bug.
  await row(page, 'Hairline').getByTestId('select-cue').click();
  await page.getByTestId('verb-out').click();
  await expect(row(page, 'Hairline')).not.toHaveClass(LIVE);
  await expect.poll(() => stateOn(air, 'Hairline'), { timeout: 30_000 }).toBe('off');
  await makeSceneAndPublish(page, 'Desk');
  await expect(row(page, 'Bug')).toHaveClass(LIVE, { timeout: 60_000 });
  await expect(row(page, 'Hairline')).not.toHaveClass(LIVE);
  await expect(row(page, 'Hand')).not.toHaveClass(LIVE);
  expect(await stateOn(air, 'Hairline')).toBe('off');

  await anon.close();
  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
