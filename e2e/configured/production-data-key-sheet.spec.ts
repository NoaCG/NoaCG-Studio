// covers: src/control/sheetSource.ts, src/control/productionDataSession.ts
// covers: src/components/home/CueEditor.tsx, src/components/home/ProductionPage.tsx
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
//
// A CONNECTED SHEET LIST ON A PUBLISHED PRODUCTION (data-sources C1b; sheet-data-flow AC-1, AC-6;
// data-sources AC-1's database half). Published, the browser reader writes through the operator's
// door on the control slug (`control_data_patch_by_slug`), the server resolves the binding and
// appends the update rows itself, and the page dispatches nothing of its own. The walk reads the
// command log: a changed tab is one update row with the ticker's lines, an unchanged read adds no
// row, and an emptied tab is an update row carrying "" (the `""` conformance case, end to end:
// 0096's merge and `production_data_format('""')` on the real database).
//
// The Sheet is a stub the browser is served at Google's export address: configured-suite.yml
// carries no Google key, and the reader builds that address itself from the stored id and tab.

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

const LINK = 'https://docs.google.com/spreadsheets/d/1NoaCGStubSheet0000000000/edit#gid=0';

async function updates(page: Page, slug: string) {
  return page.evaluate(async (slug) => {
    const { hostedControlTail } = await import('/src/control/hostedControl.ts');
    const rows = await hostedControlTail(slug, 0);
    return rows
      .filter((row) => (row.msg as { t?: string }).t === 'update')
      .map((row) => ({ id: row.id, graphic: row.graphic, data: (row.msg as { data?: Record<string, string> }).data ?? {} }));
  }, slug);
}

test('a connected Sheet list on a published production follows the tab through the operator door, "" included', async ({ page }) => {
  test.setTimeout(240_000);
  const tab = { csv: 'First line\n' };
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv }),
  );
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'News Strip' });
  const showId = await openProductionWithCurrent(page, `Sheet key ${Date.now()}`);

  // Connect the ticker's lines to the tab, unpublished, in one confirmation.
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(LINK);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  await review.getByTestId('cue-connect-confirm').click();
  await expect(page.getByTestId('cue-bound-f0')).toContainText('Sheet:');

  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  await page.keyboard.press('Escape');
  const slug = await page.evaluate(async (showId) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((s) => s.id === showId)?.hostedSlug ?? null;
  }, showId);
  expect(slug, 'publishing mints a control slug').toBeTruthy();

  // Published, the reader writes the server's tree: the first read there is written in full.
  const lines = (rows: Awaited<ReturnType<typeof updates>>) => rows.filter((r) => r.graphic === 'News Strip' && 'f0' in r.data).map((r) => r.data.f0);
  await expect.poll(async () => lines(await updates(page, slug!)), { timeout: 30_000 }).toContain('First line');

  tab.csv = 'First line\nSecond line\n';
  await expect.poll(async () => lines(await updates(page, slug!)), { timeout: 20_000 }).toContain('First line\nSecond line');
  await expect(page.getByTestId('cue-bound-f0').locator('textarea')).toHaveValue('First line\nSecond line');
  // Unchanged reads add no row: a value changed once is written once.
  const count = lines(await updates(page, slug!)).length;
  await page.waitForTimeout(11_000);
  expect(lines(await updates(page, slug!)).length).toBe(count);

  // An emptied tab writes "", which the server turns into an update row that clears the field.
  tab.csv = '';
  await expect.poll(async () => lines(await updates(page, slug!)).at(-1), { timeout: 20_000 }).toBe('');
});
