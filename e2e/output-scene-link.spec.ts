// AN OBS SCENE'S OWN LINK (docs/work-specs/obs-scenes/spec.md OS1a, AC-1; rules R5 to R8): the real
// /output shell, stage and graphic documents over a stood-in backend, as in output-prepare.spec.ts.
// `&scene=<id>` builds only that scene's graphics, at boot, at a publish it takes and after a reload;
// a graphic moved out of the scene leaves at that publish even on air; commands for any other graphic
// change nothing there and write no report; an unknown scene builds nothing, reads not ready and says
// so in its Presence entry, until a publish names it; OBS's own events are reported. The ordinary
// link of the same production builds every graphic. A publish request comes in through the page's
// own door (`__noacgLive.prepare`) and commands through `__noacgLive.command`, as the fast road
// would bring them, because the offline suite has no topic.
// covers: src/output/sceneScope.ts, src/output/main.ts, src/model/obsScenes.ts

import { test, expect, type Page, type Route } from '@playwright/test';

const BACKEND = 'https://scenes.supabase.test';
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
const RUNTIME = `
var on = false;
function update(d) { var f = typeof d === 'string' ? JSON.parse(d) : d; for (var k in f) { var el = document.getElementById(k); if (el) el.textContent = f[k]; } }
function play() { on = true; document.getElementById('root').style.opacity = '1'; }
function stop() { on = false; document.getElementById('root').style.opacity = '0'; }
function noacgMachineState() { return { groups: { main: on ? 'in' : 'off' } }; }
`;
const KEYS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const graphic = (key: string) => ({
  key,
  html: `<div id="root" style="opacity:0"><span id="f0">-</span></div>`,
  css: '',
  js: RUNTIME,
  assets: [],
  resolution: RESOLUTION,
  fps: 50,
  layer: 20,
});
type Scene = { id: string; name: string; graphics: string[] };
const SCENES: Scene[] = [
  { id: 'scA', name: 'Gameplay', graphics: ['A1', 'A2'] },
  { id: 'scB', name: 'Desk', graphics: ['B1', 'B2'] },
  { id: 'scC', name: 'Break', graphics: ['C1', 'C2'] },
];

/** The production as published at `n`. Scenes are cue metadata: the stamp's `h` does not move. */
function production(n: number, scenes: Scene[] | undefined, resolution = RESOLUTION) {
  return {
    id: '00000000-0000-4000-8000-0000000000cc',
    title: 'Scene Probe',
    output: {
      v: 1,
      resolution,
      graphics: KEYS.map(graphic),
      cues: KEYS.map((k) => ({ id: k.toLowerCase(), graphic: k, label: k, values: { f0: k } })),
      ver: { n, at: '2026-11-12T00:00:00.000Z', h: 'same', g: Object.fromEntries(KEYS.map((k) => [k, `d-${k}`])) },
      ...(scenes ? { scenes } : {}),
    },
    live: {},
    last_event_id: 0,
  };
}

/** The stood-in backend; `current()` is what the resolve answers when asked. Every graphic a
 *  report is written for is recorded. */
async function standInBackend(page: Page, current: () => unknown, tail: unknown[] = []): Promise<{ reported: string[] }> {
  const seen = { reported: [] as string[] };
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
    if (path.endsWith('/rpc/control_output_by_slug')) body = [current()];
    if (path.endsWith('/rpc/control_output_tail')) body = tail;
    if (path.endsWith('/rpc/control_output_report')) {
      const graphic = (req.postDataJSON() as { p_graphic?: string } | null)?.p_graphic;
      if (graphic) seen.reported.push(graphic);
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return seen;
}

type Msg = { t: string; data?: Record<string, string> };
type LiveWindow = {
  __noacgLive?: {
    ready: () => { n: number; of: number; v: { n: number; h: string } | null; is: { k: string; g?: string; d?: string }[] };
    entry: () => { scene?: { id: string; known: boolean; obs?: string; last?: string; seen?: string[] } };
    prepare: (prep: { id: string; n: number; h: string }) => void;
    command: (graphic: string, msg: Msg) => void;
  };
};
const readyOf = (page: Page) => page.evaluate(() => (window as LiveWindow).__noacgLive?.ready() ?? null);
const sceneOf = (page: Page) => page.evaluate(() => (window as LiveWindow).__noacgLive?.entry().scene ?? null);
const prepare = (page: Page, id: string, n: number) =>
  page.evaluate(([id, n]) => (window as LiveWindow).__noacgLive!.prepare({ id, n, h: 'same' }), [id, n] as [string, number]);
const command = (page: Page, key: string, msg: Msg) =>
  page.evaluate(([key, msg]) => (window as LiveWindow).__noacgLive!.command(key, msg), [key, msg] as [string, Msg]);
/** The graphics on the stage, by their frames' titles. */
const built = (page: Page) => page.locator('iframe:not([data-prepared])').evaluateAll((els) => els.map((el) => el.getAttribute('title')).sort());
const stateOf = async (page: Page, key: string) => {
  const doc = await (await page.locator(`iframe[title="${key}"]:not([data-prepared])`).elementHandle())?.contentFrame();
  return doc ? doc.evaluate(() => (window as unknown as { noacgMachineState: () => { groups: { main: string } } }).noacgMachineState().groups.main) : null;
};

test('a scene link builds its scene alone, through a publish and a reload; the ordinary link builds all (AC-1)', async ({ page, browser }) => {
  let published: unknown = production(1, SCENES);
  // The log the boot catches up on: another scene's Take, and this one's. Only this one's is
  // applied and reported here (R6, R7).
  const row = (id: number, graphic: string, msg: Msg) => ({ id, graphic, msg, created_at: '2026-11-12T00:00:00.000Z' });
  const backend = await standInBackend(page, () => published, [
    row(1, 'A1', { t: 'update', data: { f0: 'elsewhere' } }),
    row(2, 'A1', { t: 'play' }),
    row(3, 'B1', { t: 'update', data: { f0: '3-1' } }),
    row(4, 'B1', { t: 'play' }),
  ]);
  await page.goto('/output?production=scene-probe&scene=scB');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  expect(await built(page)).toEqual(['B1', 'B2']);
  expect((await readyOf(page))!.of).toBe(2);
  expect(await sceneOf(page)).toEqual({ id: 'scB', known: true });

  // Its own graphics take their commands; another scene's change nothing here and are never reported.
  await expect.poll(() => stateOf(page, 'B1'), { timeout: 15_000 }).toBe('in');
  await command(page, 'B2', { t: 'play' });
  await command(page, 'A1', { t: 'update', data: { f0: 'elsewhere' } });
  await command(page, 'A1', { t: 'play' });
  await expect.poll(() => stateOf(page, 'B2')).toBe('in');
  await expect.poll(() => backend.reported.includes('B1'), { timeout: 10_000 }).toBe(true);
  expect(await built(page)).toEqual(['B1', 'B2']);
  expect(backend.reported).not.toContain('A1');

  // OBS's own events are reported, unknown before the first.
  await page.evaluate(() => {
    for (const [type, detail] of [
      ['obsSceneChanged', { name: 'Desk' }],
      ['obsSourceVisibleChanged', { visible: true }],
      ['obsSourceActiveChanged', { active: true }],
    ] as const) window.dispatchEvent(new CustomEvent(type, { detail }));
  });
  expect(await sceneOf(page)).toEqual({ id: 'scB', known: true, obs: 'program', last: 'Desk' });

  // B2 moves out of the scene: it leaves at this publish though it is on air here (R6), and its
  // commands are read past from then on. Only the cue metadata moved, so the version is the same one.
  published = production(2, [SCENES[0], { ...SCENES[1], graphics: ['B1'] }, SCENES[2]]);
  await prepare(page, 'p2', 2);
  await expect.poll(() => built(page), { timeout: 30_000 }).toEqual(['B1']);
  expect(await stateOf(page, 'B1')).toBe('in');
  await expect.poll(async () => (await readyOf(page))?.of).toBe(1);

  // A reload builds the same scope again.
  await page.reload();
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  expect(await built(page)).toEqual(['B1']);

  // The ordinary link of the same production builds every graphic, as before (R4).
  const ordinary = await browser.newPage();
  await standInBackend(ordinary, () => published);
  await ordinary.goto('/output?production=scene-probe');
  await expect.poll(async () => (await readyOf(ordinary))?.n, { timeout: 20_000 }).toBe(KEYS.length);
  expect(await built(ordinary)).toEqual(KEYS);
  expect(await sceneOf(ordinary)).toBeNull();
  await ordinary.close();
});

test('an unknown scene builds nothing and reads not ready, until a publish names it (AC-1, R5, R8)', async ({ page }) => {
  let published: unknown = production(1, SCENES);
  await standInBackend(page, () => published);
  await page.goto('/output?production=scene-probe&scene=scD');
  await expect.poll(async () => (await readyOf(page))?.is, { timeout: 20_000 }).toEqual([{ k: 'scene', g: 'Scene link', d: 'scD' }]);
  expect((await readyOf(page))!.of).toBe(0);
  expect(await built(page)).toEqual([]);
  expect(await sceneOf(page)).toEqual({ id: 'scD', known: false });

  // Never the whole production, also when the switch is off and no scene is published.
  published = production(2, undefined);
  await prepare(page, 'p2', 2);
  await page.waitForTimeout(1500);
  expect(await built(page)).toEqual([]);

  // A publish that names it builds its graphics.
  published = production(3, [...SCENES, { id: 'scD', name: 'Late', graphics: ['C2'] }]);
  await prepare(page, 'p3', 3);
  await expect.poll(() => built(page), { timeout: 30_000 }).toEqual(['C2']);
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  expect((await readyOf(page))!.is).toEqual([]);
  expect(await sceneOf(page)).toEqual({ id: 'scD', known: true });
});

test('a publish that needs a reload is not held by a graphic it moved out of the scene (R6)', async ({ page }) => {
  let published: unknown = production(1, SCENES);
  await standInBackend(page, () => published);
  const documents: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documents.push(frame.url());
  });
  await page.goto('/output?production=scene-probe&scene=scB');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  await command(page, 'B2', { t: 'play' });
  await expect.poll(() => stateOf(page, 'B2')).toBe('in');
  // Another stage size takes a whole reload, which waits for air to clear here. B2 leaves the scene
  // in the same publish, so it no longer counts as air on this link, and the reload goes ahead onto
  // the new scope.
  published = production(2, [SCENES[0], { ...SCENES[1], graphics: ['B1'] }, SCENES[2]], { width: 3840, height: 2160, label: '2160p' });
  await prepare(page, 'p2', 2);
  await expect.poll(() => documents.length, { timeout: 30_000 }).toBeGreaterThan(1);
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  expect(await built(page)).toEqual(['B1']);
});

test('Take and Out of one scene graphic change only its scene link, and a reload restores each as on or off (obs-scenes OS1b AC-2, C7, C8)', async ({ browser }) => {
  // A1 is Gameplay's graphic and B1 the Desk's own copy of the same design (OS1b C3): two names on
  // the wire. The log: A1 taken; B1 taken and taken out again; B2 taken.
  const row = (id: number, graphic: string, msg: Msg) => ({ id, graphic, msg, created_at: '2026-11-13T00:00:00.000Z' });
  const tail = [
    row(1, 'A1', { t: 'update', data: { f0: 'on' } }),
    row(2, 'A1', { t: 'play' }),
    row(3, 'B1', { t: 'play' }),
    row(4, 'B1', { t: 'stop' }),
    row(5, 'B2', { t: 'play' }),
  ];
  const open = async (scene: string) => {
    const page = await browser.newPage();
    const backend = await standInBackend(page, () => production(1, SCENES), tail);
    await page.goto(`/output?production=scene-probe&scene=${scene}`);
    await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
    return { page, backend };
  };
  const states = (page: Page, keys: string[]) => Promise.all(keys.map((k) => stateOf(page, k)));
  const game = await open('scA');
  const desk = await open('scB');
  await expect.poll(() => states(game.page, ['A1', 'A2']), { timeout: 15_000 }).toEqual(['in', 'off']);
  await expect.poll(() => states(desk.page, ['B1', 'B2']), { timeout: 15_000 }).toEqual(['off', 'in']);

  // Out of Gameplay's graphic, and a Take of the Desk's copy, each reach their own link alone.
  await command(game.page, 'A1', { t: 'stop' });
  await command(desk.page, 'A1', { t: 'stop' });
  await command(game.page, 'B1', { t: 'play' });
  await command(desk.page, 'B1', { t: 'play' });
  await expect.poll(() => states(game.page, ['A1', 'A2'])).toEqual(['off', 'off']);
  await expect.poll(() => states(desk.page, ['B1', 'B2'])).toEqual(['in', 'in']);
  expect(await built(game.page)).toEqual(['A1', 'A2']);
  expect(desk.backend.reported).not.toContain('A1');
  expect(game.backend.reported).not.toContain('B1');

  // A reload restores what the log says of each, on or off, link by link.
  tail.push(row(6, 'A1', { t: 'stop' }), row(7, 'B1', { t: 'play' }));
  await game.page.reload();
  await desk.page.reload();
  await expect.poll(async () => (await readyOf(game.page))?.n, { timeout: 20_000 }).toBe(2);
  await expect.poll(async () => (await readyOf(desk.page))?.n, { timeout: 20_000 }).toBe(2);
  await expect.poll(() => states(game.page, ['A1', 'A2']), { timeout: 15_000 }).toEqual(['off', 'off']);
  await expect.poll(() => states(desk.page, ['B1', 'B2']), { timeout: 15_000 }).toEqual(['in', 'in']);
  await game.page.close();
  await desk.page.close();
});

test('a scene link opened before its production is published draws after Publish and Take, with no refresh (#2474, obs-scenes OS3 M10)', async ({ page }) => {
  // Open, then publish, then Take: the link stays transparent while nothing resolves, and asks again.
  let published: unknown = null;
  await standInBackend(page, () => published);
  await page.goto('/output?production=scene-probe&scene=scB&debug=1');
  await expect(page.locator('body')).toHaveAttribute('data-unavailable', 'unpublished', { timeout: 20_000 });
  await expect(page.getByTestId('output-unavailable')).toBeVisible();
  expect(await built(page)).toEqual([]);
  published = production(1, SCENES);
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 30_000 }).toBe(2);
  await expect(page.locator('body')).not.toHaveAttribute('data-unavailable');
  await expect(page.getByTestId('output-unavailable')).toHaveCount(0);
  expect(await built(page)).toEqual(['B1', 'B2']);
  await command(page, 'B1', { t: 'play' });
  await expect.poll(() => stateOf(page, 'B1')).toBe('in');
  // The link is called by its scene's name on the operator's panel (OS3 M6).
  expect(await page.evaluate(() => (window as unknown as { __noacgLive: { entry: () => { name?: string } } }).__noacgLive.entry().name)).toBe('Desk');

  // Publish, then open, then Take: as before.
  const later = await page.context().newPage();
  await standInBackend(later, () => published);
  await later.goto('/output?production=scene-probe&scene=scA');
  await expect.poll(async () => (await readyOf(later))?.n, { timeout: 20_000 }).toBe(2);
  await command(later, 'A2', { t: 'play' });
  await expect.poll(() => stateOf(later, 'A2')).toBe('in');
  await later.close();
});

test('a scene link reports every OBS scene it went on program in, a shared source in each (obs-scenes OS3 M5)', async ({ page }) => {
  await standInBackend(page, () => production(1, SCENES));
  await page.goto('/output?production=scene-probe&scene=scA');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  const obs = (type: string, detail: Record<string, unknown>) =>
    page.evaluate(([type, detail]) => window.dispatchEvent(new CustomEvent(type as string, { detail })), [type, detail] as const);
  // Onto program in Gameplay, in OBS's order.
  await obs('obsSourceVisibleChanged', { visible: true });
  await obs('obsSourceActiveChanged', { active: true });
  await obs('obsSceneChanged', { name: 'Gameplay' });
  await expect.poll(async () => (await sceneOf(page))?.seen).toEqual(['Gameplay']);
  // A cut to Replay, which holds the same source (Add Existing): it stays on program, and Replay is
  // ticked once it has stayed.
  await obs('obsSceneChanged', { name: 'Replay' });
  await expect.poll(async () => (await sceneOf(page))?.seen, { timeout: 10_000 }).toEqual(['Gameplay', 'Replay']);
  // A cut away to Desk: the name, then the source leaves program. Never ticked.
  await obs('obsSceneChanged', { name: 'Desk' });
  await obs('obsSourceVisibleChanged', { visible: false });
  await obs('obsSourceActiveChanged', { active: false });
  await page.waitForTimeout(6_000);
  expect(await sceneOf(page)).toEqual({ id: 'scA', known: true, obs: 'hidden', last: 'Replay', seen: ['Gameplay', 'Replay'] });
});
