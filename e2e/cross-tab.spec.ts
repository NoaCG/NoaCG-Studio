import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { settleDurableWrites } from './_durable';

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
