// THE OUTPUT'S OWN READY ANSWER (Phase 6 Step 3, docs/work-specs/playout-ready/spec.md AC-1 to
// AC-3): the real /output shell with its real boot, stage and graphic documents; only the backend is
// stood in for, as in output-boot-resilience.spec.ts. What the operator pages make of the answer is
// control/readiness.ts (scripts/readiness.test.mjs) and the configured live-ready.spec.ts.
// covers: src/output/main.ts, src/output/stage.ts, src/preview/composeDocument.ts, src/control/readiness.ts

import { test, expect, type Page, type Route } from '@playwright/test';

const BACKEND = 'https://ready.supabase.test';
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

/** A graphic whose `update` writes field f0 into the page, so a spec can read what it was sent. */
const echo = (key: string, extra = '') => ({
  key,
  html: `<div id="t">default</div>${extra}`,
  css: '',
  js: "window.update = function (d) { var v = JSON.parse(d).f0; if (v !== undefined) document.getElementById('t').textContent = v; };",
  assets: [],
  resolution: RESOLUTION,
  fps: 50,
  layer: 20,
});

function production(over: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-0000000000aa',
    title: 'Ready Probe',
    output: {
      v: 1,
      resolution: RESOLUTION,
      graphics: [echo('Strap'), { ...echo('Frost Quiz'), js: "throw new Error('boom while loading');" }],
      cues: [
        { id: 'c1', graphic: 'Strap', label: 'First', values: { f0: 'WARM FROM CUE 1' } },
        { id: 'c2', graphic: 'Strap', label: 'Second', values: { f0: 'second cue' } },
      ],
      ver: { n: 7, at: '2026-10-01T00:00:00.000Z', h: 'abcdef0123456789', g: {} },
    },
    live: {},
    last_event_id: 0,
    ...over,
  };
}

/** Answer the stand-in backend: the resolve returns `row`, the tail nothing. */
async function standInBackend(page: Page, row: unknown): Promise<void> {
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
    const body = path.endsWith('/rpc/control_output_by_slug') ? [row] : [];
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
}

type ReadyWindow = { __noacgLive?: { ready: () => { n: number; of: number; v: unknown; is: { k: string; g?: string; d?: string }[] } } };
const readyOf = (page: Page) => page.evaluate(() => (window as ReadyWindow).__noacgLive?.ready() ?? null);

test('an output counts its graphics, names the one that threw while loading, and says so on its debug line', async ({ page }) => {
  await standInBackend(page, production());
  await page.goto('/output?production=ready-probe&debug=1');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  const ready = (await readyOf(page))!;
  expect(ready.of).toBe(2);
  expect(ready.v).toEqual({ n: 7, h: 'abcdef0123456789' });
  expect(ready.is).toEqual([{ k: 'script', g: 'Frost Quiz', d: expect.stringContaining('boom while loading') }]);
  await expect(page.locator('pre')).toContainText('ready: Not ready: Frost Quiz (script error) (v7)');
});

test('the warm pass hands an untouched graphic its first cue, off air, and nothing else', async ({ page }) => {
  await standInBackend(page, production());
  await page.goto('/output?production=ready-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  const strap = page.frameLocator('iframe[title="Strap"]').locator('#t');
  await expect(strap).toHaveText('WARM FROM CUE 1');
  // Off air: nothing was played.
  await expect(page.locator('body')).toHaveAttribute('data-plays', '0');
});

test('a graphic recovered from its report is never warmed over', async ({ page }) => {
  await standInBackend(
    page,
    production({ live: { Strap: { data: { f0: 'ON AIR NOW' }, state: { groups: { main: 'in' } }, event: 0 } } }),
  );
  await page.goto('/output?production=ready-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(2);
  const strap = page.frameLocator('iframe[title="Strap"]').locator('#t');
  await expect(strap).toHaveText('ON AIR NOW');
  // Still after the check answered: the warm pass for this graphic was a check only.
  await page.waitForTimeout(500);
  await expect(strap).toHaveText('ON AIR NOW');
});

test('an image that does not load names its graphic and file', async ({ page }) => {
  const withImage = production();
  withImage.output.graphics = [echo('Strap', '<img src="no-such-picture.png" alt="">')];
  await standInBackend(page, withImage);
  await page.goto('/output?production=ready-probe');
  await expect.poll(async () => (await readyOf(page))?.n, { timeout: 20_000 }).toBe(1);
  expect((await readyOf(page))!.is).toContainEqual({ k: 'image', g: 'Strap', d: 'no-such-picture.png' });
});
