// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
// focus
//
// Restricted-network resilience (docs/GOALS.md "the SVG road"): the boot watchdog and the
// inline connection check live in app.html, the hydration timeout in the durable store, and
// the app-level notice in its own component - a change to any of them must run the spec
// that boots with the network or the storage broken. src/model and src/main are CORE, so
// for them this line documents the pairing; for app.html (otherwise unmapped, so it
// escalated by accident) and the notice component it IS the mapping. flows rides along on
// app.html because that file frames every /app load.
// durableStore also owns CROSS-TAB safety: its mirror is per-tab and every model mutator is a
// read-modify-WHOLE-RECORD write, so a change here can silently reintroduce one tab eating
// another tab's work (docs/INTERACTIVE_PLAYOUT_PLAN.md, and cross-tab.spec.ts's own header).
// covers: {app.html,src/model/durableStore.ts,src/main.tsx,src/components/StorageHealthNotice.tsx}
// covers: src/backend/syncController.ts

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// CROSS-TAB SAFETY for the durable store (model/durableStore.ts).
//
// The store answers reads from a synchronous in-memory MIRROR, because the whole app reads
// saved documents synchronously. IndexedDB behind it is shared by every tab; the mirror is not.
// And every model mutator is a read-modify-WHOLE-RECORD write - `patchShow` is
// loadAllShows → mutate → save the lot - so a tab holding a mirror from before another tab's
// write puts that old record straight back, and the other tab's work is gone from the database.
//
// That needed no second PERSON and no new feature: one operator with the production open twice
// is enough, which is ordinary. Found 2026-08-21 while looking at whether the Data and Audience
// workspaces could open in their own browser tab (docs/INTERACTIVE_PLAYOUT_PLAN.md) - they could
// not, because the change would have made this the default path rather than an unlucky one.
//
// THE READ-BACK IS FROM A THIRD, FRESH TAB. Reading it in the first tab proves nothing: its
// mirror never saw the second tab's write, so it reports the loss whether or not the database
// suffered one. The first version of this probe made exactly that mistake and looked conclusive.

async function productionFor(page: Page, name: string): Promise<void> {
  await openProductionWithCurrent(page, name);
}

test('a second tab’s work survives the first tab’s next write', async ({ page, context }) => {
  await bootstrapGraphic(page, { name: 'Arena Quiz' });
  await productionFor(page, 'Two Tabs');
  await settleDurableWrites(page);
  const productionUrl = page.url();

  // Tab B authors a table on the Data workspace.
  const b = await context.newPage();
  await b.goto(`${productionUrl}/data`);
  await expect(b.getByTestId('production-data')).toBeVisible();
  await b.getByTestId('add-dataset').click();
  await expect(b.locator('.pd-dataset')).toHaveCount(1);
  await settleDurableWrites(b);

  // Tab A hears of that write and re-reads it - asynchronously, so a write it makes in the few
  // milliseconds before the re-read lands still puts the old record back (durableStore.ts says
  // so; closing that window is docs/backlog/a-tab-that-writes-before-it-adopts-loses-the-other-tabs-work.md).
  // A spec acting at machine speed hit it on a cold CI runner (run 37118664889) - a person
  // switching tabs does not - so wait for the adoption here. Without the invalidation this
  // wait never ends, so it still guards what the spec is for.
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const { loadShows } = await import('/src/model/shows.ts');
          return (loadShows()[0].datasets ?? []).length;
        }),
      { message: 'the first tab never adopted the second tab’s table' },
    )
    .toBe(1);

  // Tab A - which was open the whole time and never showed that table - writes to the same
  // production through the ordinary model path.
  await page.evaluate(async () => {
    const { loadShows, updateShowCue } = await import('/src/model/shows.ts');
    const show = loadShows()[0];
    updateShowCue(show.id, show.cues![0].id, { label: 'Renamed in the first tab' });
  });
  await settleDurableWrites(page);

  const c = await context.newPage();
  await c.goto(productionUrl);
  await expect(c.getByTestId('production-page')).toBeVisible();
  const survived = await c.evaluate(async () => {
    const { loadShows } = await import('/src/model/shows.ts');
    const show = loadShows()[0];
    return { tables: (show.datasets ?? []).length, cue: show.cues?.[0]?.label ?? null };
  });

  // BOTH writes are in the database. Before the invalidation, `tables` came back 0.
  expect(survived.tables, 'the second tab’s table was overwritten by the first tab').toBe(1);
  expect(survived.cue).toBe('Renamed in the first tab');
});

// ONE LIBRARY SYNC PASS PER CHANGE (backend/syncController.ts). A tab that adopts another tab's
// write raises `spx-data-changed` like any change, so its surfaces re-read. When the writer runs
// library sync itself, the adopted change is marked and the adopting tab's sync skips it: the
// writer's pass pushes it. When the writer does NOT sync (a production or control page opened on
// its own), the change stays unmarked, or nobody would push it. A tab's own change is never
// marked. The pass count itself needs a signed-in account and is measured in
// e2e/configured/sync-one-pass-per-edit.spec.ts.
test('an adopted write is left to the writer’s sync only when the writer syncs', async ({ page, context }) => {
  await page.goto('/app');
  await awaitDurableReady(page);
  const b = await context.newPage();
  await b.goto('/app');
  await awaitDurableReady(b);

  // What each tab's sync would decide for every change it hears.
  type Heard = 'own' | 'left-to-writer' | 'push-here';
  const listen = (p: Page) =>
    p.evaluate(async () => {
      const { changeSyncedElsewhere } = await import('/src/model/durableStore.ts');
      const heard: string[] = [];
      (window as unknown as { __heard: string[] }).__heard = heard;
      window.addEventListener('spx-data-changed', (e) => {
        const adopted = (e as CustomEvent).detail != null;
        heard.push(!adopted ? 'own' : changeSyncedElsewhere(e) ? 'left-to-writer' : 'push-here');
      });
    });
  const heard = (p: Page) => p.evaluate(() => (window as unknown as { __heard: Heard[] }).__heard.splice(0));
  const addLook = (p: Page, name: string) =>
    p.evaluate(async (lookName) => {
      const { createLook } = await import('/src/model/packets.ts');
      createLook(lookName, {
        styleTag: 'minimal',
        palette: { id: 'captured', name: 'Captured', styleTags: ['minimal'], accent: '#22aa66', text: '#ffffff', textDim: 'rgba(255,255,255,0.7)', panel: 'rgba(12,14,18,0.92)' },
        fontId: null,
        customFont: null,
      });
    }, name);
  await listen(page);
  await listen(b);

  // The first tab runs library sync (offline it never starts, so say what startAutoSync says).
  await page.evaluate(async () => {
    const { markOwnWritesSynced } = await import('/src/model/durableStore.ts');
    markOwnWritesSynced();
  });

  await addLook(page, 'Written where sync runs');
  await settleDurableWrites(page);
  await expect.poll(() => heard(b)).toContain('left-to-writer');
  expect(await heard(page), 'the writer’s own change is unmarked, so its sync runs').toContain('own');

  await addLook(b, 'Written where sync does not run');
  await settleDurableWrites(b);
  await expect
    .poll(() => heard(page), { message: 'a write from a tab without sync is pushed by the tab that adopts it' })
    .toContain('push-here');
});

