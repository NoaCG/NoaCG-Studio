// A LOAD INSTRUMENT, not a suite spec (#2655): Takes and Outs pressed while the LOCAL stack's
// database is starved, as hosted staging was in its slow spells (phase-9-load-diagnosis.md).
// Local only: it throttles the local database container with docker, so it refuses any backend
// that is not 127.0.0.1.
//
//   npx playwright test --config=playwright.instrument.config.ts e2e/instruments/take-window.ts
//
// Each press goes through the page's own send (`sendControlVerb`) with an id the instrument mints,
// so the log can be counted per press afterwards: landed once, never, or more than once.

import { test, expect, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';
import { publishProduction } from '../_publish';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn, wipeMyGraphics } from '../configured/_helpers';

const URL_OK = /^http:\/\/127\.0\.0\.1:/.test(process.env.VITE_SUPABASE_URL ?? '');
test.skip(!haveCreds || !URL_OK, 'local stack only: VITE_SUPABASE_URL must be 127.0.0.1');

const PRESSES = Number(process.env.TW_PRESSES ?? 30);
const EVERY_MS = Number(process.env.TW_EVERY_MS ?? 1500);
const CPUS = process.env.TW_CPUS ?? '0.1';
const BURNERS = Number(process.env.TW_BURNERS ?? 6);

const db = () => execSync(`docker ps --filter name=supabase_db_ --format '{{.Names}}'`).toString().trim().split('\n')[0];
const psql = (sql: string) => execSync(`docker exec -i ${db()} psql -U postgres -d postgres -tAc ${JSON.stringify(sql)}`).toString().trim();

function slow(on: boolean): void {
  const name = db();
  if (on) {
    execSync(`docker update --cpus ${CPUS} ${name}`);
    for (let i = 0; i < BURNERS; i += 1) {
      execSync(`docker exec -d ${name} psql -U postgres -d postgres -c "select count(*) from generate_series(1, 2000000000)"`);
    }
  } else {
    psql(`select pg_cancel_backend(pid) from pg_stat_activity where query like 'select count(*) from generate_series(1, 2000000000)%' and pid <> pg_backend_pid()`);
    execSync(`docker update --cpus 0 ${name}`);
  }
}

test('Takes and Outs on a starved database: landed once, never, or twice', async ({ page }) => {
  test.setTimeout(900_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await bootstrapGraphic(page, { name: 'House Scorebug' });
  const showName = `Take Window ${Date.now()}`;
  await openProductionWithCurrent(page, showName);
  await publishProduction(page);
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
  const hosted = await page.evaluate(async (name) => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? '';
  }, showName);
  expect(hosted).toBeTruthy();
  const showId = psql(`select id from public.control_shows where slug = '${hosted}'`);

  // One warm press so the page has its road and epoch before the load.
  await press(page, hosted, 'W0', 'play', 'warm');

  slow(true);
  const started = Date.now();
  const outcomes: Promise<{ oid: string; ok: boolean; ms: number; note: string }>[] = [];
  try {
    for (let i = 0; i < PRESSES; i += 1) {
      const graphic = `G${i % 10}`;
      const t = Math.floor(i / 10) % 2 === 0 ? 'play' : 'stop';
      outcomes.push(press(page, hosted, graphic, t, `p${i}`));
      await page.waitForTimeout(EVERY_MS);
    }
    // Every press either settles or is still being sent; give the slow spell its full length.
    await page.waitForTimeout(Number(process.env.TW_SPELL_MS ?? 20_000));
  } finally {
    slow(false);
  }
  const settled = await Promise.race([
    Promise.all(outcomes),
    new Promise<null>((r) => setTimeout(() => r(null), 60_000)),
  ]);
  await page.waitForTimeout(10_000);
  const rows = new Map(
    psql(`select msg->>'oid', count(*) from public.control_events where show_id = '${showId}' and msg ? 'oid' group by 1`)
      .split('\n')
      .filter(Boolean)
      .map((line) => line.split('|') as [string, string]),
  );
  const list = settled ?? [];
  const ids = Array.from({ length: PRESSES }, (_, i) => `p${i}`);
  const counts = ids.map((id) => Number(rows.get(oidOf(id, list)) ?? 0));
  const ms = list.map((o) => o.ms).sort((a, b) => a - b);
  const report = {
    presses: PRESSES,
    allSettledInTime: settled !== null,
    pageSaidFailed: list.filter((o) => !o.ok).length,
    neverLanded: counts.filter((c) => c === 0).length,
    landedTwice: counts.filter((c) => c > 1).length,
    settleP50: ms[Math.floor(ms.length / 2)] ?? null,
    settleP95: ms[Math.floor(ms.length * 0.95)] ?? null,
    settleMax: ms[ms.length - 1] ?? null,
    notes: [...new Set(list.filter((o) => !o.ok).map((o) => o.note))],
    seconds: Math.round((Date.now() - started) / 1000),
  };
  console.log(`TAKE-WINDOW ${JSON.stringify(report)}`);
  await test.info().attach('take-window.json', { body: JSON.stringify(report, null, 2), contentType: 'application/json' });
  expect(report.landedTwice, 'no press may land twice').toBe(0);

  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});

/** The minted id of press `id`, as the page sent it. */
const oidOf = (id: string, list: { oid: string }[]) => list.find((o) => o.oid.endsWith(`-${id}`))?.oid ?? `none-${id}`;

function press(page: Page, slug: string, graphic: string, t: 'play' | 'stop', id: string) {
  return page.evaluate(
    async ({ slug, graphic, t, id }) => {
      const { sendControlVerb } = await __noacgImport('/src/control/hostedControl.ts');
      const oid = `${crypto.randomUUID()}-${id}`;
      const at = Date.now();
      const items = t === 'play'
        ? [{ graphic, msg: { t: 'update' as const, data: { n: id }, oid } }, { graphic, msg: { t: 'play' as const } }]
        : [{ graphic, msg: { t: 'stop' as const, oid } }];
      try {
        await sendControlVerb({ slug, showId: null, items });
        return { oid, ok: true, ms: Date.now() - at, note: '' };
      } catch (e) {
        return { oid, ok: false, ms: Date.now() - at, note: (e as Error).message.slice(0, 120) };
      }
    },
    { slug, graphic, t, id },
  );
}
