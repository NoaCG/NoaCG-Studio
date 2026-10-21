// covers: src/components/home/ProductionPage.tsx, src/control/productionDataApi.ts
// covers: src/components/home/CueEditor.tsx
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
//
// A PUBLISHED PRODUCTION OPENED COLD DOES NOT PUSH ITS LOCAL TREE WHILE ITS DATA KEY IS UNREAD
// (production-page refactor, phase 1; docs/work-specs/production-page-refactor/spec.md §5.3,
// "published data: no local dispatch; the key resolves before any dispatch").
//
// Published, the server owns the tree and writes the update rows itself, each carrying `src`.
// Unpublished, the page dispatches the tree's changes as plain `update` rows. Which world the page
// is in is answered by the data key's read, and until it answers (`dataKey === undefined`) the page
// must not guess: guessing "unpublished" airs whatever the LOCAL tree last held. The walk leaves a
// stale local tree on this machine, holds the key's read, moves the server's tree as a feed would,
// and reads the log: no row without `src` at any point, and the feed's rows after the release.
//
// The held window has something to send only if the tree moves on a page whose key is unread: a
// published page holds an empty tree until its key and the server's tree are read. An edit on the
// Data workspace does it, since that tab takes an unread key as unpublished and holds the edit.
// Mutation-tested: removing the guard, or reading `undefined` as unpublished, fails this walk.

import { publishProduction } from '../_publish';
import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { openWorkspace } from '../_workspace';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

// Cleanup runs whatever the walk's outcome: the account is shared by the whole configured suite.
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

const GRAPHIC = 'House Score';
const PATH = 'match.home.score';

test('while the data key is unread, the page appends no update of its own; the feed rows carry src', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: GRAPHIC });
  const showId = await openProductionWithCurrent(page, `Key dispatch ${Date.now()}`);
  await page.evaluate(
    async ({ showId, GRAPHIC, PATH }) => {
      const { setFieldBindings } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      setFieldBindings(showId, [{ graphic: GRAPHIC, fieldId: 'f1', path: PATH }]);
      await commitDurableWrites();
    },
    { showId, GRAPHIC, PATH },
  );
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });

  const { key, slug } = await page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { productionDataKey, patchProductionData } = await import('/src/control/productionDataApi.ts');
    const key = await productionDataKey(showId);
    if (key) await patchProductionData(key, { match: { home: { score: 1 } } });
    return { key, slug: loadShows().find((s) => s.id === showId)?.hostedSlug ?? null };
  }, showId);
  expect(key, 'publishing mints a data key').toBeTruthy();
  expect(slug, 'publishing mints a control slug').toBeTruthy();
  const updates = () =>
    page.evaluate(async (slug) => {
      const { hostedControlTail } = await import('/src/control/hostedControl.ts');
      const rows = await hostedControlTail(slug, 0);
      return rows
        .filter((row) => (row.msg as { t?: string }).t === 'update')
        .map((row) => ({ id: row.id, src: (row.msg as { src?: string }).src ?? null, data: (row.msg as { data?: Record<string, string> }).data ?? {} }));
    }, slug as string);
  const before = await updates();
  const afterId = before.length ? before[before.length - 1].id : 0;

  // A STALE LOCAL TREE on this machine, which is what an unpublished page would dispatch.
  await page.evaluate(
    async ({ showId }) => {
      const { saveLiveData } = await import('/src/model/productionState.ts');
      saveLiveData(showId, { match: { home: { score: 77 } } });
    },
    { showId },
  );

  // THE HOLD: the reloaded page's read of its data key waits.
  let keyReads = 0;
  let release!: () => void;
  const released = new Promise<void>((resolve) => (release = resolve));
  // On the CONTEXT, so the Data workspace's own tab, opened below, waits for its key as well.
  await page.context().route(/\/rest\/v1\/control_shows\?[^#]*select=data_key/, async (route) => {
    keyReads += 1;
    await released;
    await route.continue().catch(() => {});
  });
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => keyReads, { message: 'the page asked for its data key' }).toBeGreaterThan(0);

  // The operator edits the tree on the Data workspace while its key is unread there too. That
  // tab holds the edit as its tree (`setLiveData` takes an unread key as unpublished), so its
  // bindings resolve to a value, and only the dispatch guard keeps it off the log.
  const data = await openWorkspace(page, 'data');
  await expect.poll(() => keyReads, { message: 'the Data tab asked for its data key' }).toBeGreaterThan(1);
  await data.getByTestId('data-new-path').fill(PATH);
  await data.getByTestId('data-new-value').fill('5');
  await data.getByTestId('data-add').click();
  await expect(data.getByTestId(`data-row-${PATH}`)).toBeVisible();

  // The feed moves the tree while the key is still unread here.
  await page.evaluate(async (key) => {
    const { patchProductionData } = await import('/src/control/productionDataApi.ts');
    await patchProductionData(key, { match: { home: { score: 2 } } });
  }, key as string);
  await page.waitForTimeout(2_000);
  const held = (await updates()).filter((row) => row.id > afterId);
  expect(held.filter((row) => row.src === null), 'no update row of the page own while the key is unread').toEqual([]);
  expect(held.some((row) => row.src !== null), 'the feed row is on the log').toBe(true);

  release();
  await data.close();
  // The key and the server's tree are read: the bound box shows the feed's figure.
  const bound = page.getByTestId('cue-bound-f1').locator('input');
  await expect(bound).toHaveValue('2', { timeout: 20_000 });
  await page.evaluate(async (key) => {
    const { patchProductionData } = await import('/src/control/productionDataApi.ts');
    await patchProductionData(key, { match: { home: { score: 3 } } });
  }, key as string);
  await expect(bound).toHaveValue('3', { timeout: 20_000 });
  await page.waitForTimeout(2_000);
  const all = (await updates()).filter((row) => row.id > afterId);
  expect(all.filter((row) => row.src === null), 'no update row of the page own after the key resolved either').toEqual([]);
  expect(all.filter((row) => row.src !== null).length, 'both feed moves are on the log').toBeGreaterThanOrEqual(2);
  const figures = all.flatMap((row) => Object.values(row.data)).map(String);
  expect(figures, 'the stale local figure never reached the log').not.toContain('77');
  expect(figures, 'the edit made while the key was unread never reached the log as the page own').not.toContain('5');

});
