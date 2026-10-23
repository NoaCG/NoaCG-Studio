// covers: api/_lib/dataTick.ts, api/_lib/systemSettings.ts, api/data/?...path?.ts
// covers: src/control/sheetSource.ts, src/control/hostedControl.ts
// covers: src/components/home/SourcesLine.tsx, src/components/home/ProductionPage.tsx
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
//
// PUBLISHED OWNERSHIP AND THE SERVER TICK (data-sources C2; data AC-3 published half, AC-11;
// sheet-data-flow AC-4, AC-5, AC-7), against the real database of the configured stack
// (migration 0097). A Sheet connected AFTER publishing moves the output with no new publish,
// because Connect writes the row's bindings and sources at once. With the page open its reader
// holds the source's lease on the row, and the tick skips it; with the page gone and the lease
// expired, the tick reads it, writes a changed cell once and an unchanged one never; a Pause written
// to the row holds the tick and shows after a reload. While the switch is off the sources line says
// closed-page reading is off.
//
// The tick is driven directly, as the one-minute cron would, through the same handler in this
// process with the stack's own test CRON_SECRET (owner decision A, data-sources C2): the dev server
// carries no cron secret. The Sheet is a stub on both sides: the browser is served it at Google's
// export address, and this process answers the tick's own fetch of that address.

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, SERVICE_ROLE_KEY, signIn, SUPABASE_URL, wipeMyGraphics } from './_helpers';
import dataRoute from '../../api/data/[...path]';

test.skip(!haveCreds || !SERVICE_ROLE_KEY, 'E2E_EMAIL / E2E_PASSWORD / SUPABASE_SERVICE_ROLE_KEY unset - configured-mode spec');

const SECRET = 'local-e2e-cron-secret';
const SHEET = `1NoaCGTickSheet${Date.now()}`;
const LINK = `https://docs.google.com/spreadsheets/d/${SHEET}/edit#gid=0`;
const tab = { csv: 'First line\n' };

const admin = () => createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

/** The tick's switch: on until `until`, or off (no setting). */
async function switchTick(until: Date | null) {
  const db = admin();
  const { error } = until
    ? await db.from('system_settings').upsert({ key: 'data_tick_until', value: { until: until.toISOString() } })
    : await db.from('system_settings').delete().eq('key', 'data_tick_until');
  if (error) throw new Error(error.message);
}

/** GET /api/data/tick as the cron does. */
async function tick(authorization?: string): Promise<{ status: number; body: { on?: boolean; sources?: { source: string; outcome: string }[] } }> {
  const response = await dataRoute.fetch(new Request('http://127.0.0.1/api/data/tick', authorization === undefined ? {} : { headers: { authorization } }));
  return { status: response.status, body: await response.json() };
}

/** The production's update rows for the ticker's lines, oldest first, with their label. */
async function lines(showId: string) {
  const { data, error } = await admin().from('control_events').select('id, graphic, msg').eq('show_id', showId).order('id');
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => row.graphic === 'News Strip' && row.msg?.t === 'update' && 'f0' in (row.msg.data ?? {}))
    .map((row) => ({ text: row.msg.data.f0 as string, src: row.msg.src as string }));
}

async function row(showId: string) {
  const { data, error } = await admin().from('control_shows').select('bindings, sources').eq('id', showId).single();
  if (error) throw new Error(error.message);
  return data as { bindings: Record<string, Record<string, string>>; sources: { id: string; paused?: boolean }[] };
}

/** Let the source's lease lapse now, as a closed page's would. */
async function expireLease(showId: string) {
  const { error } = await admin().from('control_source_reads').update({ lease_until: new Date(Date.now() - 1000).toISOString() }).eq('show_id', showId);
  if (error) throw new Error(error.message);
}

let realFetch: typeof fetch;
test.beforeAll(() => {
  process.env.CRON_SECRET = SECRET;
  process.env.SUPABASE_URL ??= SUPABASE_URL;
  realFetch = globalThis.fetch;
  // The tick's reads of the stub Sheet; every other Sheet address is not found.
  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!url.startsWith('https://docs.google.com/')) return realFetch(input, init);
    return url.includes(`/d/${SHEET}/`) ? new Response(tab.csv, { status: 200 }) : new Response('', { status: 404 });
  };
});
test.afterAll(async () => {
  globalThis.fetch = realFetch;
  await switchTick(null).catch(() => {});
});
test.afterEach(async ({ page }) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await page.context().unrouteAll({ behavior: 'ignoreErrors' });
  await clearPublishedShows(page).catch(() => {});
  await wipeMyGraphics(page).catch(() => {});
});

const leave = (page: Page) => page.goto('about:blank');

test('a Sheet connected after publishing moves the output at once; the tick skips the leased source, reads the expired one once, and holds a Pause from the row', async ({ page }) => {
  test.setTimeout(120_000);
  await switchTick(null);
  await page.context().route(/^https:\/\/docs\.google\.com\/spreadsheets\/d\/[^/]+\/export/, (route) =>
    route.fulfill({ status: 200, contentType: 'text/csv', headers: { 'access-control-allow-origin': '*' }, body: tab.csv }),
  );
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: 'News Strip' });
  const showId = await openProductionWithCurrent(page, `Tick ${Date.now()}`);
  const productionUrl = page.url();

  // Published first, with nothing connected.
  await publishProduction(page);
  await page.keyboard.press('Escape');
  expect((await row(showId)).sources).toEqual([]);

  // Connected after publishing: the row has the binding and the source at once, and the output
  // moves with no new publish.
  await page.getByTestId('cue-connect').click();
  const review = page.getByTestId('cue-connect-menu');
  await review.getByTestId('cue-connect-link').fill(LINK);
  await review.getByTestId('cue-connect-read').click();
  await expect(review.getByTestId('cue-connect-row-f0')).toHaveAttribute('data-status', 'key');
  await review.getByTestId('cue-connect-confirm').click();
  await expect.poll(async () => (await row(showId)).sources.length, { timeout: 15_000 }).toBe(1);
  const sourceId = (await row(showId)).sources[0].id;
  expect((await row(showId)).bindings['News Strip']?.f0).toBe(`sheet.${sourceId}.lines`);
  await expect.poll(async () => (await lines(showId)).map((l) => l.text), { timeout: 20_000 }).toContain('First line');

  // A row published before migration 0097 holds no sources (NULL). If another page has given it
  // sources by the time this page opens, this page's first write leaves them alone.
  {
    const ours = (await row(showId)).sources;
    const theirs = ours.map((s) => ({ ...s, label: 'Set by another page' }));
    const { error } = await admin().from('control_shows').update({ sources: null }).eq('id', showId);
    if (error) throw new Error(error.message);
    // The other page wins the race: the row is written before this page's first write runs.
    let held: (() => void) | null = null;
    // The page's only write of the row on opening is its first sources.
    await page.route(/\/rest\/v1\/control_shows\?/, async (route) => {
      if (route.request().method() !== 'PATCH') return route.continue();
      await new Promise<void>((resolve) => (held = resolve));
      await route.continue();
    });
    await page.reload();
    await expect.poll(() => held !== null, { timeout: 15_000 }).toBe(true);
    const { error: other } = await admin().from('control_shows').update({ sources: theirs }).eq('id', showId);
    if (other) throw new Error(other.message);
    held!();
    await page.waitForTimeout(2_000);
    expect((await row(showId)).sources.map((s) => (s as { label?: string }).label)).toEqual(['Set by another page']);
    await page.unroute(/\/rest\/v1\/control_shows\?/);
  }

  // A row still without sources gets this page's once, and its reader reads under the row's lease.
  {
    const { error } = await admin().from('control_shows').update({ sources: null }).eq('id', showId);
    if (error) throw new Error(error.message);
    await page.reload();
    await expect.poll(async () => (await row(showId)).sources?.map((s) => s.id) ?? [], { timeout: 15_000 }).toEqual([sourceId]);
    await expect(page.getByTestId(`source-line-${sourceId}`).getByTestId('source-status')).toHaveText(/checked \d+ s ago/, { timeout: 15_000 });
  }

  // The switch is off: the line says nothing reads once the page closes. On, it stops saying so.
  const status = page.getByTestId(`source-line-${sourceId}`).getByTestId('source-status');
  await expect(status).toContainText('closed-page reading off', { timeout: 10_000 });
  await switchTick(new Date(Date.now() + 3600_000));
  await expect(status).not.toContainText('closed-page reading off', { timeout: 12_000 });

  // Only the exact Bearer runs the tick; the page holds the lease, so the tick leaves it alone.
  expect((await tick()).status).toBe(401);
  expect((await tick(`Bearer ${SECRET}x`)).status).toBe(401);
  let run = await tick(`Bearer ${SECRET}`);
  expect(run.status).toBe(200);
  expect(run.body.on).toBe(true);
  expect(run.body.sources?.filter((s) => s.source === sourceId) ?? []).toEqual([]);

  // Every page gone and the lease lapsed: the tick reads the changed tab, once.
  await leave(page);
  await expireLease(showId);
  tab.csv = 'First line\nSecond line\n';
  run = await tick(`Bearer ${SECRET}`);
  expect(run.body.sources?.find((s) => s.source === sourceId)?.outcome).toBe('read');
  const second = (await lines(showId)).filter((l) => l.text === 'First line\nSecond line');
  expect(second).toEqual([{ text: 'First line\nSecond line', src: 'sheet' }]);
  run = await tick(`Bearer ${SECRET}`);
  expect(run.body.sources?.find((s) => s.source === sourceId)?.outcome).toBe('unchanged');
  expect((await lines(showId)).filter((l) => l.text === 'First line\nSecond line'), 'a value changed once is written once').toHaveLength(1);

  // The page is back and shows the tick's read; Pause there reaches the row at once.
  await page.goto(productionUrl);
  await expect(status).toHaveText(/checked \d+ s ago/, { timeout: 20_000 });
  await page.getByTestId(`source-line-${sourceId}`).getByTestId('source-pause').click();
  await expect.poll(async () => (await row(showId)).sources[0].paused, { timeout: 10_000 }).toBe(true);

  // With the page gone again, the paused source is not read, whatever the tab says.
  await leave(page);
  await expireLease(showId);
  tab.csv = 'Third line\n';
  run = await tick(`Bearer ${SECRET}`);
  expect(run.body.sources?.filter((s) => s.source === sourceId) ?? []).toEqual([]);
  expect((await lines(showId)).map((l) => l.text)).not.toContain('Third line');

  // A reload shows the Pause the row holds.
  await page.goto(productionUrl);
  await expect(status).toHaveText(/paused$/, { timeout: 20_000 });

  // Resume reaches the row, and so does a Pause that returns to what the page opened with.
  const pause = page.getByTestId(`source-line-${sourceId}`).getByTestId('source-pause');
  await pause.click();
  await expect.poll(async () => (await row(showId)).sources[0].paused ?? false, { timeout: 10_000 }).toBe(false);
  await pause.click();
  await expect.poll(async () => (await row(showId)).sources[0].paused, { timeout: 10_000 }).toBe(true);
  await pause.click();
  await expect.poll(async () => (await row(showId)).sources[0].paused ?? false, { timeout: 10_000 }).toBe(false);

  // Resumed with every page gone, the tick reads it again.
  await leave(page);
  await expireLease(showId);
  tab.csv = 'Fourth line\n';
  run = await tick(`Bearer ${SECRET}`);
  expect(run.body.sources?.find((s) => s.source === sourceId)?.outcome).toBe('read');
  expect((await lines(showId)).map((l) => l.text)).toContain('Fourth line');
  await switchTick(null);
});
