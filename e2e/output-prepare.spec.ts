// AN OUTPUT TAKES A PUBLISH ONE GRAPHIC AT A TIME (docs/work-specs/per-graphic-replacement/spec.md
// AC-1, AC-2, AC-4, AC-5, D2, D4; before it, playout-ready R3 and AC-9): the real /output shell,
// stage and graphic documents over a stood-in backend, as in output-ready.spec.ts. The request that
// starts it rides the production page's Presence entry; here the page's own door for it,
// `__noacgLive.prepare`, hands it in, and `__noacgLive.command` hands in the live commands the
// fast road would bring, because the offline suite has no topic (the configured live-prepare.spec.ts
// walks the real roads).
//
// The last test is landing c's ping (R9, AC-12): a `{t: 'ping'}` row in the log, answered in the
// Presence entry and never handed to the stage.
// covers: src/output/prepare.ts, src/output/swap.ts, src/output/swapPlan.ts, src/output/main.ts, src/output/stage.ts

import { test, expect, type Frame, type Page, type Route } from '@playwright/test';

const BACKEND = 'https://prepare.supabase.test';
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

/** A template that airs: `update` writes its fields, play shows it, stop hides it, and its machine
 *  says which. `body` is what tells one version from another on screen. */
const RUNTIME = `
var on = false;
function update(d) { var f = typeof d === 'string' ? JSON.parse(d) : d; for (var k in f) { var el = document.getElementById(k); if (el) el.textContent = f[k]; } }
function play() { on = true; document.getElementById('root').style.opacity = '1'; }
function stop() { on = false; document.getElementById('root').style.opacity = '0'; }
function noacgMachineState() { return { groups: { main: on ? 'in' : 'off' } }; }
`;
const graphic = (key: string, body = 'v1', js = RUNTIME, resolution = RESOLUTION) => ({
  key,
  html: `<div id="root" style="opacity:0"><span id="f0">-</span><b id="body">${body}</b></div>`,
  css: '',
  js,
  assets: [],
  resolution,
  fps: 50,
  layer: 20,
});
type Spec = ReturnType<typeof graphic>;

/** A published production at version `n`, each graphic stamped with the digest given. */
function production(n: number, graphics: Spec[], digests: Record<string, string>, live: Record<string, unknown> = {}, resolution = RESOLUTION) {
  return {
    id: '00000000-0000-4000-8000-0000000000bb',
    title: 'Prepare Probe',
    output: { v: 1, resolution, graphics, cues: [], ver: { n, at: '2026-10-01T00:00:00.000Z', h: `h${n}`, g: digests } },
    live,
    last_event_id: 0,
  };
}

/** The stood-in backend; `current()` is what the resolve answers at the moment it is asked, and
 *  `tail` the log rows a tail read answers (none by default). */
async function standInBackend(page: Page, current: () => unknown, tail: unknown[] = []): Promise<{ resolves: number }> {
  const seen = { resolves: 0 };
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/rpc/control_output_resolve')) {
      return route.fulfill({
        status: 404,
        headers: { ...CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function' }),
      });
    }
    let body: unknown = [];
    if (path.endsWith('/rpc/control_output_by_slug')) {
      seen.resolves += 1;
      body = [current()];
    }
    if (path.endsWith('/rpc/control_output_tail')) body = tail;
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return seen;
}

type Msg = { t: string; data?: Record<string, string> };
type ReadyWindow = {
  __noacgLive?: {
    ready: () => { n: number; of: number; v: { n: number; h: string } | null; chg?: { s: string; n: number; of: number; air?: number; w?: string[]; is?: { k: string; g?: string }[] } };
    prepare: (prep: { id: string; n: number; h: string }) => void;
    command: (graphic: string, msg: Msg) => void;
    ack: () => { id: string; ms: number | null };
  };
};
const readyOf = (page: Page) => page.evaluate(() => (window as ReadyWindow).__noacgLive?.ready() ?? null);
const prepare = (page: Page, id: string, n: number) =>
  page.evaluate(([id, n]) => (window as ReadyWindow).__noacgLive!.prepare({ id, n, h: `h${n}` }), [id, n] as [string, number]);
/** A command as the fast road would hand it to the renderer. */
const command = (page: Page, key: string, msg: Msg) =>
  page.evaluate(([key, msg]) => (window as ReadyWindow).__noacgLive!.command(key, msg), [key, msg] as [string, Msg]);

/** Every document the page's main frame has loaded: a second one is a reload. */
function documentsOf(page: Page): string[] {
  const documents: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documents.push(frame.url());
  });
  return documents;
}

/** The frame element on air for `key` (not one prepared beside it), marked so a spec can tell
 *  whether it is still the same one. */
const frameEl = (page: Page, key: string) => page.locator(`iframe[title="${key}"]:not([data-prepared])`);
const mark = (page: Page, key: string) => frameEl(page, key).evaluate((el) => el.setAttribute('data-probe', 'before'));
const marked = (page: Page, key: string) => frameEl(page, key).evaluate((el) => el.getAttribute('data-probe'));
/** What the document of `key`'s frame shows: its body, its field and whether it is up. */
async function shows(page: Page, key: string): Promise<{ body: string; f0: string; state: string }> {
  const frame = (await frameEl(page, key).elementHandle())?.contentFrame() as Promise<Frame | null>;
  const doc = await frame;
  if (!doc) return { body: '', f0: '', state: '' };
  return doc.evaluate(() => ({
    body: document.getElementById('body')?.textContent ?? '',
    f0: document.getElementById('f0')?.textContent ?? '',
    state: (window as unknown as { noacgMachineState: () => { groups: { main: string } } }).noacgMachineState().groups.main,
  }));
}

async function boot(page: Page, published: () => unknown, graphics: number) {
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(graphics);
  return documents;
}

test('a change off air swaps in place while another graphic stays on air untouched (AC-1, AC-5)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Scorebug'), graphic('Strap')], { Scorebug: 'a1', Strap: 'b1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 2);
  await command(page, 'Scorebug', { t: 'update', data: { f0: '3-1' } });
  await command(page, 'Scorebug', { t: 'play' });
  await expect.poll(() => shows(page, 'Scorebug')).toEqual({ body: 'v1', f0: '3-1', state: 'in' });
  const plays = await page.locator('body').getAttribute('data-plays');
  await mark(page, 'Scorebug');
  await mark(page, 'Strap');

  published = production(2, [graphic('Scorebug'), graphic('Strap', 'v2')], { Scorebug: 'a1', Strap: 'b2' });
  await prepare(page, 'p1', 2);
  await expect.poll(async () => (await readyOf(page))?.v, { timeout: 30_000 }).toEqual({ n: 2, h: 'h2' });
  expect((await readyOf(page))!.chg).toBeUndefined();
  // The lower third is a new frame with the new body; the scorebug is the same frame, with its data
  // and its machine where they were.
  expect(await marked(page, 'Strap')).toBeNull();
  expect(await marked(page, 'Scorebug')).toBe('before');
  expect(await shows(page, 'Scorebug')).toEqual({ body: 'v1', f0: '3-1', state: 'in' });
  await expect(page.locator('iframe')).toHaveCount(2);
  // Nothing reloaded and nothing replayed an entrance.
  expect(documents).toHaveLength(1);
  expect(await page.locator('body').getAttribute('data-plays')).toBe(plays);
  // The next Take of the lower third airs the new body.
  await command(page, 'Strap', { t: 'update', data: { f0: 'Ada' } });
  await command(page, 'Strap', { t: 'play' });
  await expect.poll(() => shows(page, 'Strap')).toEqual({ body: 'v2', f0: 'Ada', state: 'in' });
});

test('a change on air waits, live content keeps reaching it, and it swaps after its Out (AC-2)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Scorebug')], { Scorebug: 'a1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 1);
  await command(page, 'Scorebug', { t: 'update', data: { f0: '3-1' } });
  await command(page, 'Scorebug', { t: 'play' });
  await expect.poll(() => shows(page, 'Scorebug')).toEqual({ body: 'v1', f0: '3-1', state: 'in' });
  await mark(page, 'Scorebug');

  published = production(2, [graphic('Scorebug', 'v2')], { Scorebug: 'a2' });
  await prepare(page, 'p2', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('waiting');
  expect((await readyOf(page))!.chg).toMatchObject({ s: 'waiting', air: 1, w: ['Scorebug'] });
  expect((await readyOf(page))!.v).toEqual({ n: 1, h: 'h1' });
  // On air it keeps its picture, and an Update still reaches it.
  await command(page, 'Scorebug', { t: 'update', data: { f0: '4-1' } });
  await expect.poll(() => shows(page, 'Scorebug')).toEqual({ body: 'v1', f0: '4-1', state: 'in' });
  expect(await marked(page, 'Scorebug')).toBe('before');
  // Out: it clears, then the new body takes over, holding the values the graphic had.
  await command(page, 'Scorebug', { t: 'stop' });
  await expect.poll(async () => (await readyOf(page))?.v, { timeout: 15_000 }).toEqual({ n: 2, h: 'h2' });
  expect((await readyOf(page))!.chg).toBeUndefined();
  expect(await marked(page, 'Scorebug')).toBeNull();
  expect(await shows(page, 'Scorebug')).toEqual({ body: 'v2', f0: '4-1', state: 'off' });
  await command(page, 'Scorebug', { t: 'play' });
  await expect.poll(() => shows(page, 'Scorebug')).toEqual({ body: 'v2', f0: '4-1', state: 'in' });
  expect(documents).toHaveLength(1);
});

test('a Take that replaces an on-air graphic airs its waiting change at once (AC-2)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Scorebug')], { Scorebug: 'a1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 1);
  await command(page, 'Scorebug', { t: 'play' });
  await expect.poll(async () => (await shows(page, 'Scorebug')).state).toBe('in');
  await mark(page, 'Scorebug');
  published = production(2, [graphic('Scorebug', 'v2')], { Scorebug: 'a2' });
  await prepare(page, 'p3', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('waiting');
  // Another cue on the same graphic: its update, then its play, with no Out between.
  await command(page, 'Scorebug', { t: 'update', data: { f0: 'Second cue' } });
  await command(page, 'Scorebug', { t: 'play' });
  await expect.poll(() => shows(page, 'Scorebug')).toEqual({ body: 'v2', f0: 'Second cue', state: 'in' });
  expect(await marked(page, 'Scorebug')).toBeNull();
  await expect(page.locator('iframe')).toHaveCount(1);
  await expect.poll(async () => (await readyOf(page))?.v).toEqual({ n: 2, h: 'h2' });
  expect(documents).toHaveLength(1);
});

test('a change that fails keeps its old frame and is named; the other changes still swap (AC-4)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Strap'), graphic('Bug')], { Strap: 'b1', Bug: 'c1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 2);
  await mark(page, 'Strap');
  await mark(page, 'Bug');
  published = production(2, [graphic('Strap', 'v2', "throw new Error('boom in v2');"), graphic('Bug', 'v2')], { Strap: 'b2', Bug: 'c2' });
  await prepare(page, 'p4', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('failed');
  const ready = (await readyOf(page))!;
  expect(ready.v).toEqual({ n: 1, h: 'h1' });
  expect(ready.chg).toMatchObject({ s: 'failed', is: [{ k: 'script', g: 'Strap' }], w: [] });
  // The failed change left nothing behind; its graphic keeps the frame it had and stays takeable.
  await expect(page.locator('iframe')).toHaveCount(2);
  expect(await marked(page, 'Strap')).toBe('before');
  await expect.poll(() => marked(page, 'Bug')).toBeNull();
  expect((await shows(page, 'Bug')).body).toBe('v2');
  await command(page, 'Strap', { t: 'play' });
  await expect.poll(() => shows(page, 'Strap')).toMatchObject({ body: 'v1', state: 'in' });
  expect(documents, 'no reload').toHaveLength(1);
});

test('a graphic added mid-show joins at once; a removed one leaves once off air (D4)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Strap'), graphic('Bug')], { Strap: 'b1', Bug: 'c1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 2);
  await command(page, 'Bug', { t: 'play' });
  await expect.poll(async () => (await shows(page, 'Bug')).state).toBe('in');
  published = production(2, [graphic('Strap'), graphic('Ticker')], { Strap: 'b1', Ticker: 'd1' });
  await prepare(page, 'p5', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.w, { timeout: 30_000 }).toEqual(['Bug']);
  await expect(frameEl(page, 'Ticker')).toHaveCount(1);
  await expect.poll(async () => (await readyOf(page))?.n).toBe(3);
  await command(page, 'Ticker', { t: 'play' });
  await expect.poll(async () => (await shows(page, 'Ticker')).state).toBe('in');
  // On air, the removed bug stays up; after its Out it leaves.
  expect((await shows(page, 'Bug')).state).toBe('in');
  await command(page, 'Bug', { t: 'stop' });
  await expect(frameEl(page, 'Bug')).toHaveCount(0, { timeout: 15_000 });
  await expect.poll(async () => (await readyOf(page))?.v).toEqual({ n: 2, h: 'h2' });
  expect((await readyOf(page))!.of).toBe(2);
  expect(documents).toHaveLength(1);
});

test('another resolution still reloads the whole output, and only once nothing is on air (D2)', async ({ page }) => {
  const HD = { width: 1280, height: 720, label: '720p' };
  let published: unknown = production(1, [graphic('Strap')], { Strap: 'b1' });
  await standInBackend(page, () => published);
  const documents = await boot(page, () => published, 1);
  await command(page, 'Strap', { t: 'play' });
  published = production(2, [graphic('Strap', 'v1', RUNTIME, HD)], { Strap: 'b2' }, {}, HD);
  await prepare(page, 'p6', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('waiting');
  expect(documents, 'never reloaded under a graphic on air').toHaveLength(1);
  // A whole-page preparation runs again once air clears, no sooner than PREPARE_EVERY_MS after the last.
  await command(page, 'Strap', { t: 'stop' });
  await expect.poll(() => documents.length, { timeout: 30_000 }).toBe(2);
  await expect.poll(async () => (await readyOf(page))?.v?.n, { timeout: 20_000 }).toBe(2);
});

test('a renderer build deployed since the output loaded reloads it once nothing is on air (D2)', async ({ page }) => {
  let published: unknown = production(1, [graphic('Strap')], { Strap: 'b1' });
  await standInBackend(page, () => published);
  // The output's own URL, fetched by the page itself, now names another script: another build.
  let newBuild = false;
  await page.route('**/output?production=*', async (route) => {
    if (!newBuild || route.request().resourceType() !== 'fetch') return route.fallback();
    const served = await route.fetch();
    const html = (await served.text()).replace('src="/src/output/main.ts"', 'src="/assets/output-NEWBUILD.js"');
    return route.fulfill({ response: served, body: html });
  });
  const documents = await boot(page, () => published, 1);
  await command(page, 'Strap', { t: 'play' });
  newBuild = true;
  published = production(2, [graphic('Strap', 'v2')], { Strap: 'b2' });
  await prepare(page, 'p7', 2);
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('waiting');
  await page.waitForTimeout(1_500);
  expect(documents, 'never reloaded under a graphic on air').toHaveLength(1);
  newBuild = false;
  await command(page, 'Strap', { t: 'stop' });
  await expect.poll(() => documents.length, { timeout: 30_000 }).toBe(2);
});

test('asked to prepare the version it already holds, the output only checks again', async ({ page }) => {
  const v1 = production(1, [graphic('Strap')], { Strap: 'b1' });
  const backend = await standInBackend(page, () => v1);
  const documents = await boot(page, () => v1, 1);
  await prepare(page, 'p8', 1);
  await expect.poll(() => backend.resolves, { timeout: 10_000 }).toBe(2);
  await page.waitForTimeout(1_000);
  expect((await readyOf(page))!.chg).toBeUndefined();
  expect(documents).toHaveLength(1);
});

test('a ping in the log is answered in the Presence entry and never reaches the stage', async ({ page }) => {
  const live = { Strap: { data: { f0: 'x' }, state: { groups: { main: 'in' } }, event: 0 } };
  const v1 = production(1, [graphic('Strap')], { Strap: 'b1' }, live);
  const at = Date.now();
  // The row an old output receives too, here in the boot's tail read: an empty graphic, no command.
  await standInBackend(page, () => v1, [{ id: 7, graphic: '', msg: { t: 'ping', id: 'pingoffline01', at }, created_at: new Date(at).toISOString() }]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const documents = await boot(page, () => v1, 1);
  await expect.poll(() => page.evaluate(() => (window as ReadyWindow).__noacgLive!.ack().id), { timeout: 15_000 }).toBe('pingoffline01');
  const ack = await page.evaluate(() => (window as ReadyWindow).__noacgLive!.ack());
  expect(ack.ms === null || (ack.ms >= 0 && ack.ms < 60_000)).toBe(true);
  // Nothing built for it and nothing broken by it: the graphic on air keeps its one frame, its
  // version and its readiness, and the page did not reload.
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(await readyOf(page)).toMatchObject({ n: 1, of: 1, v: { n: 1, h: 'h1' } });
  expect(errors).toEqual([]);
  expect(documents).toHaveLength(1);
});
