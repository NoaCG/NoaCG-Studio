// TYPED OGRAF DATA THROUGH AN OUTPUT'S RELOAD (docs/work-specs/playout-ograf-contract/spec.md,
// E1.2b: AC-2's output replay, baseline and renderer part, AC-3's mixed-version output part). The
// real /output shell with its real boot, stage and graphic documents on the numbered log
// (protocol 2); only the backend is stood in for, as in output-ready.spec.ts. Each graphic's own
// update() writes what it was sent, value by value with its JSON type, so what is read here is
// what the renderer's browser host received and painted, never a mock of it.
// covers: src/output/main.ts, src/output/stage.ts, src/control/outputRecovery.ts, src/model/ografTyped.ts

import { test, expect, type Page, type Route } from '@playwright/test';
import { OGRAF_STANDARD } from '../src/model/ografTyped';

const BACKEND = 'https://typed.supabase.test';
const CONFIG_MODULE = `
export function loadBackendConfig() { return { url: ${JSON.stringify(BACKEND)}, anonKey: 'anon-test-key' }; }
export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
`;
const RESOLUTION = { width: 1920, height: 1080, label: '1080p' };
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};
const EPOCH = '00000000-0000-4000-8000-0000000000e1';
const LOOK = { v: 1, frame: { dx: 1270, dy: 0, s: 0.95, ox: 530, oy: 961 } };

/** A graphic with no state machine: update() writes each value as `name=type:json`, play and next
 *  count its entrance and steps, so its document shows the data and the step it holds. */
const probe = (key: string, layer: number) => ({
  key,
  html: '<div id="v"></div><div id="s">off</div>',
  css: '',
  js: [
    'var steps = 0;',
    "window.update = function (d) { var o = JSON.parse(d); var k = Object.keys(o); if (!k.length) return;",
    "  document.getElementById('v').textContent = k.map(function (n) { return n + '=' + typeof o[n] + ':' + JSON.stringify(o[n]); }).join(' '); };",
    "window.play = function () { steps = 0; document.getElementById('s').textContent = 'step 0'; };",
    "window.next = function () { steps += 1; document.getElementById('s').textContent = 'step ' + steps; };",
  ].join('\n'),
  assets: [],
  resolution: RESOLUTION,
  fps: 50,
  layer,
});

const envelope = (values: Record<string, unknown>, v = 1) => ({ v, kind: 'values', standard: OGRAF_STANDARD.commit, schema: 'schema-hash', values });
const TYPED = envelope({ f0: 'Anna', f1: 2, f2: true, f3: { team: ['A', 'B'] } });
const SHOWN = 'f0=string:"Anna" f1=number:2 f2=boolean:true f3=object:{"team":["A","B"]}';

type Row = { id: number; seq: number; graphic: string; msg: Record<string, unknown>; created_at: string };
const at = '2026-10-27T10:00:00.000Z';
const row = (seq: number, graphic: string, msg: Record<string, unknown>): Row => ({ id: 1000 + seq, seq, graphic, msg, created_at: at });

interface Backend {
  /** Every report the output wrote, in order. */
  reports: { graphic: string; data: unknown; state: Record<string, unknown> | null; seq: number }[];
  /** Every tail read, by its `after`. */
  tails: number[];
}

/** The stand-in backend: the numbered resolve with `live`, the numbered tail over `rows`, and the
 *  head saying which graphics are on air. */
async function standInBackend(page: Page, live: Record<string, unknown>, rows: Row[], on: string[]): Promise<Backend> {
  const seen: Backend = { reports: [], tails: [] };
  const head = { seq: rows.length ? rows[rows.length - 1].seq : 0, graphics: Object.fromEntries(on.map((g) => [g, { on: true }])) };
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    const json = (body: unknown) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (path.endsWith('/rpc/control_output_resolve')) {
      return json({
        id: '00000000-0000-4000-8000-0000000000e2',
        title: 'Typed Probe',
        output: { v: 1, resolution: RESOLUTION, graphics: [probe('Strap', 20), probe('Bug', 30)], cues: [], ver: { n: 4, at, h: 'abcdef0123456789', g: {} } },
        live,
        last_event_id: 0,
        epoch: EPOCH,
        legacy: false,
      });
    }
    if (path.endsWith('/rpc/control_output_tail_seq')) {
      const after = Number((req.postDataJSON() as { p_after?: number }).p_after ?? 0);
      seen.tails.push(after);
      return json({ epoch: EPOCH, rows: rows.filter((r) => r.seq > after).slice(0, 500), head });
    }
    if (path.endsWith('/rpc/control_output_report_seq')) {
      const b = req.postDataJSON() as { p_graphic: string; p_data: unknown; p_state: Record<string, unknown> | null; p_seq: number };
      seen.reports.push({ graphic: b.p_graphic, data: b.p_data, state: b.p_state, seq: b.p_seq });
      return json(null);
    }
    return json([]);
  });
  return seen;
}

const doc = (page: Page, key: string) => page.frameLocator(`iframe[title="${key}"]`);
type LiveWindow = { __noacgLive?: { ready: () => unknown } };
const readyOf = (page: Page) => page.evaluate(() => JSON.stringify((window as LiveWindow).__noacgLive?.ready() ?? null));

test('a typed graphic no report banks comes back with its values, types and step from below a long log, and then banks them', async ({ page }) => {
  // Issue #1762: the Strap's first Take ever was typed (seq 1-3), on an output that never reported
  // typed data, and the Bug reported after 1200 rows of its own: the boot follows from the Bug's
  // report, three tail pages above the Take, so only the log below it holds the Strap's values.
  const rows: Row[] = [
    row(1, 'Strap', { t: 'update', data: {}, typed: TYPED }),
    row(2, 'Strap', { t: 'play' }),
    row(3, 'Strap', { t: 'next' }),
  ];
  for (let seq = 4; seq <= 1203; seq += 1) rows.push(row(seq, 'Bug', { t: 'update', data: { f0: `bug ${seq}` } }));
  rows.push(row(1204, 'Strap', { t: 'next' }));
  const backend = await standInBackend(page, { Bug: { data: { f0: 'bug 1203' }, event: 2203, seq: 1203 } }, rows, ['Strap', 'Bug']);

  await page.goto('/output?production=typed-probe');
  await expect(doc(page, 'Strap').locator('#v')).toHaveText(SHOWN, { timeout: 30_000 });
  await expect(doc(page, 'Strap').locator('#s')).toHaveText('step 2');
  await expect(doc(page, 'Bug').locator('#v')).toHaveText('f0=string:"bug 1203"');
  // The log below the reports was read for it, page by page up to the Bug's report.
  expect(backend.tails).toEqual(expect.arrayContaining([0, 500, 1000]));

  // And it reports now: its envelope as it came and its steps, with no native data.
  await expect.poll(() => backend.reports.find((r) => r.graphic === 'Strap') ?? null, { timeout: 15_000 }).not.toBeNull();
  const report = backend.reports.find((r) => r.graphic === 'Strap')!;
  expect(report.data).toEqual({});
  expect(report.state).toMatchObject({ typed: TYPED, steps: 2 });
  expect(report.seq).toBe(1204);
});

test('a typed report is the baseline: its envelope, steps and place come back exactly, the rows after it on top, a native graphic beside it as before', async ({ page }) => {
  const live = {
    Strap: { data: {}, state: { appearance: LOOK, typed: TYPED, steps: 2 }, event: 1010, seq: 10 },
    Bug: { data: { f0: 'NATIVE' }, state: { appearance: LOOK }, event: 1010, seq: 10 },
  };
  const rows = [
    // Before the reports: neither replays.
    row(8, 'Strap', { t: 'update', data: {}, typed: envelope({ f0: 'Older', f1: 1, f2: false, f3: {} }) }),
    row(9, 'Bug', { t: 'update', data: { f0: 'OLDER' } }),
    // After them.
    row(11, 'Strap', { t: 'next' }),
  ];
  const backend = await standInBackend(page, live, rows, ['Strap', 'Bug']);
  await page.goto('/output?production=typed-probe');

  await expect(doc(page, 'Strap').locator('#v')).toHaveText(SHOWN, { timeout: 30_000 });
  await expect(doc(page, 'Strap').locator('#s')).toHaveText('step 3');
  // Every graphic on air has a report: nothing below them is read.
  expect(backend.tails.every((after) => after >= 10), JSON.stringify(backend.tails)).toBe(true);
  await expect(doc(page, 'Bug').locator('#v')).toHaveText('f0=string:"NATIVE"');
  // Rule 4: the place each report says was applied, typed and native alike.
  for (const key of ['Strap', 'Bug']) await expect(page.locator(`iframe[title="${key}"]`)).toHaveAttribute('data-appearance', JSON.stringify(LOOK));
  // A boot is no new Take: the entrance is the recovery's own, not a counted play.
  await expect(page.locator('body')).toHaveAttribute('data-plays', '0');
});

test('an envelope this output cannot read is refused with its reason, last good stays on air, and native graphics keep airing', async ({ page }) => {
  // The mixed-version case seen from the output: an envelope of a later version is what an older
  // output meets from a newer page. Here it is a row after a good typed baseline, and a report
  // banking one on a graphic of its own.
  const live = {
    Strap: { data: {}, state: { typed: TYPED, steps: 0 }, event: 1010, seq: 10 },
    Bug: { data: {}, state: { typed: envelope({ f0: 'Later' }, 2), steps: 0 }, event: 1010, seq: 10 },
  };
  const rows = [
    row(11, 'Strap', { t: 'update', data: {}, typed: envelope({ f0: 'Newer' }, 2) }),
    row(12, 'Strap', { t: 'next' }),
    row(13, 'Bug', { t: 'stop' }),
    row(14, 'Bug', { t: 'update', data: { f0: 'NATIVE AGAIN' } }),
    row(15, 'Bug', { t: 'play' }),
  ];
  await standInBackend(page, live, rows, ['Strap', 'Bug']);
  await page.goto('/output?production=typed-probe');

  // The Bug's later envelope was refused and held; its native Take then aired.
  await expect(doc(page, 'Bug').locator('#v')).toHaveText('f0=string:"NATIVE AGAIN"', { timeout: 30_000 });
  await expect(doc(page, 'Bug').locator('#s')).toHaveText('step 0');
  // The Strap keeps its last good values, and its refused Take's entrance never ran over them.
  await expect(doc(page, 'Strap').locator('#v')).toHaveText(SHOWN);
  await expect(doc(page, 'Strap').locator('#s')).toHaveText('step 0');
  await expect.poll(() => readyOf(page), { timeout: 15_000 }).toContain('cannot read this command');
  expect(await readyOf(page)).toContain('Strap');
  await expect(page.locator('body')).toHaveAttribute('data-plays', '1');
});
