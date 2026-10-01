// AN OUTPUT PREPARES A NEWER VERSION (Phase 6 Step 3 landing b, docs/work-specs/playout-ready/spec.md
// R3, AC-9): the real /output shell, stage and graphic documents over a stood-in backend, as in
// output-ready.spec.ts. The request that starts it rides the production page's Presence entry;
// here the page's own door for it, `__noacgLive.prepare`, hands it in, because the offline suite
// has no topic to announce on (the configured live-prepare.spec.ts walks the real road).
//
// The last test is landing c's ping (R9, AC-12): a `{t: 'ping'}` row in the log, answered in the
// Presence entry and never handed to the stage.
// covers: src/output/prepare.ts, src/output/main.ts, src/output/stage.ts

import { test, expect, type Page, type Route } from '@playwright/test';

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

const graphic = (key: string, js = '') => ({ key, html: '<div id="t"></div>', css: '', js, assets: [], resolution: RESOLUTION, fps: 50, layer: 20 });

/** A published production at version `n`, its graphics stamped with the digests given. */
function production(n: number, h: string, graphics: ReturnType<typeof graphic>[], digests: Record<string, string>, live: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-0000000000bb',
    title: 'Prepare Probe',
    output: { v: 1, resolution: RESOLUTION, graphics, cues: [], ver: { n, at: '2026-10-01T00:00:00.000Z', h, g: digests } },
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

type ReadyWindow = {
  __noacgLive?: {
    ready: () => { n: number; of: number; v: { n: number; h: string } | null; chg?: { s: string; n: number; of: number; is?: { k: string; g?: string }[] } };
    prepare: (prep: { id: string; n: number; h: string }) => void;
    ack: () => { id: string; ms: number | null };
  };
};
const readyOf = (page: Page) => page.evaluate(() => (window as ReadyWindow).__noacgLive?.ready() ?? null);

/** Every document the page's main frame has loaded: a second one is a reload. */
function documentsOf(page: Page): string[] {
  const documents: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documents.push(frame.url());
  });
  return documents;
}

test('a change that fails to prepare leaves the output on the version it runs, and says which', async ({ page }) => {
  const v1 = production(1, 'h1', [graphic('Strap')], { Strap: 'aa' });
  const v2 = production(2, 'h2', [graphic('Strap'), graphic('Frost Quiz', "throw new Error('boom in v2');")], { Strap: 'aa', 'Frost Quiz': 'bb' });
  let published: unknown = v1;
  await standInBackend(page, () => published);
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  published = v2;
  await page.evaluate(() => (window as ReadyWindow).__noacgLive!.prepare({ id: 'p1', n: 2, h: 'h2' }));
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('failed');
  const ready = (await readyOf(page))!;
  expect(ready.v).toEqual({ n: 1, h: 'h1' });
  expect(ready.chg).toMatchObject({ s: 'failed', of: 1, n: 1, is: [{ k: 'script', g: 'Frost Quiz' }] });
  // Only the changed graphic was built beside the running ones, and the running stage is intact.
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(documents, 'no reload').toHaveLength(1);
});

test('every change prepared and nothing on air: the output reloads onto the new version by itself', async ({ page }) => {
  const v1 = production(1, 'h1', [graphic('Strap')], { Strap: 'aa' });
  const v2 = production(2, 'h2', [graphic('Strap'), graphic('Bug')], { Strap: 'aa', Bug: 'cc' });
  let published: unknown = v1;
  await standInBackend(page, () => published);
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  published = v2;
  await page.evaluate(() => (window as ReadyWindow).__noacgLive!.prepare({ id: 'p2', n: 2, h: 'h2' }));
  await expect.poll(() => documents.length, { timeout: 30_000 }).toBe(2);
  await expect.poll(async () => (await readyOf(page))?.v?.n, { timeout: 20_000 }).toBe(2);
  expect((await readyOf(page))!.n).toBe(2);
  // Handed the same request again after the reload, it does nothing: it acts on a request once.
  await page.evaluate(() => (window as ReadyWindow).__noacgLive!.prepare({ id: 'p2', n: 2, h: 'h2' }));
  await page.waitForTimeout(1_000);
  expect(documents).toHaveLength(2);
});

test('with a graphic on air the output keeps its version and says how many are on air', async ({ page }) => {
  const live = { Strap: { data: { f0: 'x' }, state: { groups: { main: 'in' } }, event: 0 } };
  const v1 = production(1, 'h1', [graphic('Strap')], { Strap: 'aa' }, live);
  const v2 = production(2, 'h2', [graphic('Strap'), graphic('Bug')], { Strap: 'aa', Bug: 'cc' }, live);
  let published: unknown = v1;
  await standInBackend(page, () => published);
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  published = v2;
  await page.evaluate(() => (window as ReadyWindow).__noacgLive!.prepare({ id: 'p3', n: 2, h: 'h2' }));
  await expect.poll(async () => (await readyOf(page))?.chg?.s, { timeout: 30_000 }).toBe('waiting');
  expect((await readyOf(page))!.chg).toMatchObject({ s: 'waiting', air: 1 });
  expect(documents, 'never reloaded under a graphic on air').toHaveLength(1);
});

test('asked to prepare the version it already holds, the output only checks again', async ({ page }) => {
  const v1 = production(1, 'h1', [graphic('Strap')], { Strap: 'aa' });
  const backend = await standInBackend(page, () => v1);
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  await page.evaluate(() => (window as ReadyWindow).__noacgLive!.prepare({ id: 'p4', n: 1, h: 'h1' }));
  await expect.poll(() => backend.resolves, { timeout: 10_000 }).toBe(2);
  await page.waitForTimeout(1_000);
  expect((await readyOf(page))!.chg).toBeUndefined();
  expect(documents).toHaveLength(1);
});

test('a ping in the log is answered in the Presence entry and never reaches the stage', async ({ page }) => {
  const live = { Strap: { data: { f0: 'x' }, state: { groups: { main: 'in' } }, event: 0 } };
  const v1 = production(1, 'h1', [graphic('Strap')], { Strap: 'aa' }, live);
  const at = Date.now();
  // The row an old output receives too, here in the boot's tail read: an empty graphic, no command.
  await standInBackend(page, () => v1, [{ id: 7, graphic: '', msg: { t: 'ping', id: 'pingoffline01', at }, created_at: new Date(at).toISOString() }]);
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const documents = documentsOf(page);
  await page.goto('/output?production=prepare-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
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
