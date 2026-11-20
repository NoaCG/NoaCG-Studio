// runs on: dev server - swaps src/backend/config.ts over the network to stand in a backend
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
const probe = (key: string, layer: number, reports = false, slow = false) => ({
  key,
  // `slow`: a picture the stand-in answers late, so the document takes that long to load.
  html: '<div id="v"></div><div id="s">off</div>' + (slow ? `<img src="${BACKEND}/slow.png" alt="">` : ''),
  css: '',
  js: [
    'var steps = 0;',
    "window.update = function (d) { var o = JSON.parse(d); var k = Object.keys(o); if (!k.length) return;",
    "  document.getElementById('v').textContent = k.map(function (n) { return n + '=' + typeof o[n] + ':' + JSON.stringify(o[n]); }).join(' '); };",
    "window.play = function () { steps = 0; document.getElementById('s').textContent = 'step 0'; };",
    "window.next = function () { steps += 1; document.getElementById('s').textContent = 'step ' + steps; };",
    // The frame is sandboxed, so a spec reads what it paints from what it posts: its own off-air
    // opacity and its step, every animation frame.
    ...(reports
      ? ["window.noacgSnap = function () { document.getElementById('s').textContent = 'step 0'; };",
         "(function tick() { parent.postMessage({ type: 'probe-paint', key: " + JSON.stringify(key) + ", op: document.documentElement.style.getPropertyValue('opacity'), s: document.getElementById('s').textContent }, '*'); requestAnimationFrame(tick); })();"]
      : []),
  ].join('\n'),
  assets: [],
  resolution: RESOLUTION,
  fps: 50,
  layer,
});

/** A 1x1 transparent PNG. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

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
async function standInBackend(page: Page, live: Record<string, unknown>, rows: Row[], on: string[], graphics = [probe('Strap', 20), probe('Bug', 30)]): Promise<Backend> {
  const seen: Backend = { reports: [], tails: [] };
  const head = { seq: rows.length ? rows[rows.length - 1].seq : 0, graphics: Object.fromEntries(on.map((g) => [g, { on: true }])) };
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path === '/slow.png') {
      await new Promise((resolve) => setTimeout(resolve, 1_500));
      return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'image/png' }, body: PIXEL });
    }
    const json = (body: unknown) => route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (path.endsWith('/rpc/control_output_resolve')) {
      return json({
        id: '00000000-0000-4000-8000-0000000000e2',
        title: 'Typed Probe',
        output: { v: 1, resolution: RESOLUTION, graphics, cues: [], ver: { n: 4, at, h: 'abcdef0123456789', g: {} } },
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
  expect(report.state).toMatchObject({ typed: TYPED, steps: 2, on: true });
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

test('by row id (protocol 1, no log head), a typed report puts its graphic back on air at its step', async ({ page }) => {
  // A server without the numbered log, or a renderer that fell back to row ids: no head says what is
  // on air, and the Take is older than the report, so the report's own `on` is the only word.
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/rpc/control_output_resolve')) {
      return route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function' }) });
    }
    const body = path.endsWith('/rpc/control_output_by_slug')
      ? [{
          id: '00000000-0000-4000-8000-0000000000e3',
          title: 'Typed Probe',
          output: { v: 1, resolution: RESOLUTION, graphics: [probe('Strap', 20), probe('Bug', 30)], cues: [], ver: { n: 4, at, h: 'abcdef0123456789', g: {} } },
          live: {
            Strap: { data: {}, state: { typed: TYPED, steps: 1, on: true }, event: 10 },
            Bug: { data: {}, state: { typed: envelope({ f0: 'Off' }), steps: 0, on: false }, event: 10 },
          },
          last_event_id: 10,
        }]
      : [];
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  await page.goto('/output?production=typed-probe');
  await expect(doc(page, 'Strap').locator('#v')).toHaveText(SHOWN, { timeout: 30_000 });
  await expect(doc(page, 'Strap').locator('#s')).toHaveText('step 1');
  // A typed graphic its report says was off keeps its values and stays off.
  await expect(doc(page, 'Bug').locator('#v')).toHaveText('f0=string:"Off"');
  await expect(doc(page, 'Bug').locator('#s')).toHaveText('off');
});

/** Every animation frame from the first script on: what the run report says of the Strap's Take
 *  (`ranFor`, G2 section 1) and whether the Strap's own document has painted it on air. */
async function sampleRunAndPaint(page: Page) {
  await page.addInitScript(() => {
    if (window.top !== window) return;
    type Sample = { ran: number | null; onAir: boolean; t: number; held: number; p: number | null; w?: string | 0; b?: string; eb?: string };
    const samples: Sample[] = [];
    (window as unknown as { __samples: Sample[] }).__samples = samples;
    let paint: { op: string; s: string } | null = null;
    window.addEventListener('message', (ev) => {
      if (ev.data && ev.data.type === 'probe-paint' && ev.data.key === 'Strap') paint = { op: ev.data.op, s: ev.data.s };
    });
    const tick = (t: number) => {
      const live = (window as unknown as { __noacgLive?: { entry: () => { ready?: { b?: string; run?: { p: number; h: Record<string, [number]>; w?: string | 0; b?: string } } } } }).__noacgLive;
      const ready = live?.entry().ready;
      const run = ready?.run;
      const frame = document.querySelector('iframe[title="Strap"]');
      const onAir = !!paint && paint.op !== '0' && paint.s === 'step 0' && !!frame && getComputedStyle(frame).visibility !== 'hidden';
      samples.push({ ran: run ? (run.h.Strap ? run.h.Strap[0] - 1 : run.p) : null, onAir, t, held: run ? Object.keys(run.h).length : 0, p: run ? run.p : null, w: run?.w, b: run?.b, eb: ready?.b });
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

type RunSample = { ran: number | null; onAir: boolean; t: number; held: number; p: number | null; w?: string | 0; b?: string; eb?: string };
/** Wait for the picture and the report, then: the report reached the Take no earlier than the
 *  picture (the frame says what it painted by a message, a few frames late on a busy runner;
 *  without the fix the report ran ahead by 0.6 s or more), and the window was really sampled. */
async function expectRunNotBeforePaint(page: Page, take: number) {
  const read = () => page.evaluate(() => (window as unknown as { __samples: RunSample[] }).__samples);
  await expect.poll(async () => (await read()).some((s) => s.onAir), { timeout: 30_000 }).toBe(true);
  await expect.poll(async () => (await read()).at(-1)?.ran ?? null, { timeout: 15_000 }).toBeGreaterThanOrEqual(take);
  const samples = await read();
  const ran = samples.find((s) => s.ran !== null && s.ran >= take);
  const drawn = samples.find((s) => s.onAir);
  expect(ran && drawn, JSON.stringify({ ran, drawn })).toBeTruthy();
  expect(ran!.t, 'the Take was reported run before its picture was on air').toBeGreaterThanOrEqual(drawn!.t - 250);
  expect(samples.filter((s) => s.ran !== null && !s.onAir).length).toBeGreaterThan(10);
}

test('a Take held when the output reloads is not reported run until its graphic is back on air (#2604)', async ({ page }) => {
  // The phase 9 hardware check: a Take no output had run yet, then the output reloaded. The boot
  // replays it off air and comes back once it stands still; the run report it gives the production
  // page must not reach the Take before the picture does, or the light turns green early.
  await sampleRunAndPaint(page);
  const rows = [row(1, 'Strap', { t: 'update', data: { f0: 'Held' } }), row(2, 'Strap', { t: 'play' })];
  await standInBackend(page, {}, rows, ['Strap'], [probe('Strap', 20, true)]);
  await page.goto('/output?production=typed-probe');
  await expectRunNotBeforePaint(page, 2);
});

test('a restarted output says it is settled only once its restored graphic is on air (#2608)', async ({ page }) => {
  // G2 section 4a, M2: the boot carries one mark in its entry and its report, and `w` stays a wait
  // tag until the boot has read what to put back and the Strap is drawn; the page turns green on
  // `w` 0 alone, so a 0 before the picture is the early green this fix removes.
  await sampleRunAndPaint(page);
  const rows = [row(1, 'Strap', { t: 'update', data: { f0: 'Held' } }), row(2, 'Strap', { t: 'play' })];
  await standInBackend(page, {}, rows, ['Strap'], [probe('Strap', 20, true)]);
  await page.goto('/output?production=typed-probe');
  const read = () => page.evaluate(() => (window as unknown as { __samples: RunSample[] }).__samples);
  await expect.poll(async () => (await read()).at(-1)?.w ?? null, { timeout: 30_000 }).toBe(0);
  const samples = (await read()).filter((s) => s.w !== undefined);
  const settled = samples.find((s) => s.w === 0);
  const drawn = samples.find((s) => s.onAir);
  expect(settled && drawn, JSON.stringify({ settled, drawn })).toBeTruthy();
  expect(settled!.t, 'the output said settled before its picture was on air').toBeGreaterThanOrEqual(drawn!.t - 250);
  expect(samples.filter((s) => s.w !== 0).length, 'the wait was really sampled').toBeGreaterThan(10);
  const marks = new Set(samples.flatMap((s) => [s.b, s.eb]));
  expect(marks.size, 'one boot mark in the entry and every report').toBe(1);
});

test('a graphic put back from another output\'s report is not reported run until its frame has drawn it (#2604)', async ({ page }) => {
  // The other half of the hardware case: another output ran the Take and reported it, so the
  // reloaded output restores the graphic from that report (its pose) and replays nothing; its
  // cursor already covers the Take before the frame has drawn anything.
  await sampleRunAndPaint(page);
  const rows = [row(1, 'Strap', { t: 'update', data: { f0: 'Held' } }), row(2, 'Strap', { t: 'play' })];
  const live = { Strap: { data: { f0: 'Held' }, state: { groups: { main: 'in' } }, event: 1002, seq: 2 } };
  await standInBackend(page, live, rows, ['Strap'], [probe('Strap', 20, true, true)]);
  await page.goto('/output?production=typed-probe');
  await expectRunNotBeforePaint(page, 2);
});

test('on a restart of a large production only what is on air waits for its frame (#2604)', async ({ page }) => {
  // Thirteen more graphics, off air, with reports of their data and frames as slow as the Strap's,
  // and rows of their own the boot reads but does not replay (inside their reports): nothing of
  // them is on air, so they do not wait. Past twelve waiting entries the report's cursor would drop
  // to 0 (`listed`), and every owed command would read as not received.
  await sampleRunAndPaint(page);
  const others = Array.from({ length: 13 }, (_, i) => `G${i + 1}`);
  const rows = [row(1, 'Strap', { t: 'update', data: { f0: 'Held' } }), row(2, 'Strap', { t: 'play' })];
  others.forEach((key, i) => rows.push(row(3 + i, key, { t: 'update', data: { f0: key } })));
  const live: Record<string, unknown> = { Strap: { data: { f0: 'Held' }, state: { groups: { main: 'in' } }, event: 1002, seq: 2 } };
  for (const key of others) live[key] = { data: { f0: key }, event: 1015, seq: 15 };
  await standInBackend(page, live, rows, ['Strap'], [probe('Strap', 20, true, true), ...others.map((key, i) => probe(key, 30 + i, false, true))]);
  await page.goto('/output?production=typed-probe');
  await expectRunNotBeforePaint(page, 2);
  const samples = await page.evaluate(() => (window as unknown as { __samples: RunSample[] }).__samples);
  // Once the boot knows what it put back, the Strap alone waits, and the cursor is not lowered.
  const waiting = samples.filter((s) => s.ran !== null && s.ran < 2 && !s.onAir);
  const last = waiting[waiting.length - 1];
  expect(last && last.held, JSON.stringify(waiting.slice(-3))).toBe(1);
  expect(last.p, 'the cursor while the Strap waits').toBeGreaterThanOrEqual(15);
});
