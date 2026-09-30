// THE /output RENDERER'S BOOT UNDER TWO FAULTS THAT USED TO REACH AIR (docs/PLAYOUT_ISOLATION_RESEARCH.md
// §5.6, §16 item 3): the supabase-js chunk failing once while the page boots, and a production
// that is not (or no longer) published. The page is the real /output shell with its real boot
// module, hostedControl and supabase-js; only the backend is stood in for. The offline suite has
// no backend, so the build config is swapped for one naming a host that exists only inside this
// spec, and that host's RPCs are answered here.
// covers: src/output/main.ts, src/backend/supabase.ts, src/control/hostedControl.ts

import { test, expect, type Page, type Route } from '@playwright/test';

const BACKEND = 'https://boot.supabase.test';

/** The build config, swapped: a configured backend, so the renderer takes its hosted path. */
const CONFIG_MODULE = `
export function loadBackendConfig() { return { url: ${JSON.stringify(BACKEND)}, anonKey: 'anon-test-key' }; }
export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
`;

/** supabase-js as the dev server serves it (its pre-bundled dependency). */
const CHUNK = /\/node_modules\/\.vite\/deps\/@supabase_supabase-js\.js/;

const RESOLUTION ={ width: 1920, height: 1080, label: '1080p' };

/** A published production with one graphic that paints nothing until it is taken. */
const PRODUCTION = {
  id: '00000000-0000-4000-8000-000000000001',
  title: 'Boot Probe',
  output: {
    v: 1,
    resolution: RESOLUTION,
    graphics: [
      { key: 'probe', html: '<div class="probe"></div>', css: '', js: '', assets: [], resolution: RESOLUTION, fps: 50, layer: 20 },
    ],
    cues: [],
  },
  live: {},
  last_event_id: 0,
};

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS',
};

/** Answer the stand-in backend. `production` is what the resolve returns (null = unpublished). */
async function standInBackend(page: Page, production: unknown): Promise<{ resolves: number }> {
  const seen = { resolves: 0 };
  await page.route('**/src/backend/config.ts*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }),
  );
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    let body: unknown = null;
    if (path.endsWith('/rpc/control_output_by_slug')) {
      seen.resolves += 1;
      body = production ? [production] : [];
    } else if (path.endsWith('/rpc/control_output_tail')) {
      body = [];
    }
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
  return seen;
}

/** How many pixels of a screenshot are not fully transparent. */
async function coveredPixels(page: Page): Promise<number> {
  // `omitBackground` is what a CasparCG/OBS browser source has: no page background of its own.
  const shot = await page.screenshot({ omitBackground: true });
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let covered = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) covered += 1;
    return covered;
  }, shot.toString('base64'));
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
});

/** Every document the page's main frame has loaded: a second one is a reload. */
function documentsOf(page: Page): string[] {
  const documents: string[] = [];
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) documents.push(frame.url());
  });
  return documents;
}

// CHROMIUM KEEPS A FAILED MODULE FETCH FOR THE LIFE OF THE DOCUMENT (measured 2026-09-30: however
// often the boot asks, the chunk is requested once per document). So the only thing that heals
// this page is a fresh document, and the boot reloads itself; what these tests pin is that it
// does, that nobody has to, and that it never does so onto an error page.

test('the renderer comes up by itself after its supabase-js chunk fails once at boot', async ({ page }) => {
  const backend = await standInBackend(page, PRODUCTION);
  const chunk = { requests: 0 };
  // One 404, the way an old deployment's hashed asset answers after a deploy lands between the
  // page's HTML and this request; then it is served normally.
  await page.route(CHUNK, async (route) => {
    chunk.requests += 1;
    if (chunk.requests === 1) return route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not Found' });
    return route.fallback();
  });
  const documents = documentsOf(page);

  await page.goto('/output?production=boot-probe');
  // The stage is built only after the resolve answered: that is the renderer up.
  await expect(page.locator('body')).toHaveAttribute('data-plays', '0', { timeout: 20_000 });
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(chunk.requests, 'refused once, then served').toBe(2);
  expect(backend.resolves).toBe(1);
  // One reload at most, made by the page. An engine that retried the import in place would
  // need none, which is why this is a bound and not an exact count.
  expect(documents.length, `documents: ${JSON.stringify(documents)}`).toBeLessThanOrEqual(2);
});

test('while the network is down the boot never reloads onto an error page', async ({ page }) => {
  await standInBackend(page, PRODUCTION);
  const documents = documentsOf(page);
  const down = { on: true, probes: 0 };
  await page.route(CHUNK, (route) => (down.on ? route.abort('internetdisconnected') : route.fallback()));
  // The page's own URL, which the boot asks before it reloads: unreachable too. The first
  // navigation goes through; it is what an already-open browser source already has.
  await page.route('**/output?production=*', (route) => {
    if (route.request().isNavigationRequest()) return route.fallback();
    down.probes += 1;
    return down.on ? route.abort('internetdisconnected') : route.fallback();
  });

  await page.goto('/output?production=boot-probe');
  // Twice the boot has reached the point where it would reload, and twice it stayed.
  await expect.poll(() => down.probes, { timeout: 15_000 }).toBeGreaterThanOrEqual(2);
  expect(documents, 'no reload while the page is unreachable').toHaveLength(1);
  expect(await coveredPixels(page), 'pixels painted over the key layer').toBe(0);

  down.on = false;
  await expect(page.locator('body')).toHaveAttribute('data-plays', '0', { timeout: 20_000 });
  expect(documents.length, 'one reload, once the page answered').toBe(2);
});

test.describe('a production that is not published paints nothing on air', () => {
  test('without debug the page stays fully transparent', async ({ page }) => {
    const backend = await standInBackend(page, null);
    await page.goto('/output?production=gone');
    await expect(page.locator('body')).toHaveAttribute('data-unavailable', 'unpublished');
    expect(backend.resolves).toBe(1);
    await expect(page.getByText('Output not available')).toHaveCount(0);
    expect(await coveredPixels(page), 'pixels painted over the key layer').toBe(0);
  });

  test('with debug=1 it says why, over a transparent frame', async ({ page }) => {
    await standInBackend(page, null);
    await page.goto('/output?production=gone&debug=1');
    const card = page.getByTestId('output-unavailable');
    await expect(card).toContainText('Output not available');
    await expect(card).toContainText('unpublished');
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  });

  test('a URL without its token stays transparent too', async ({ page }) => {
    await page.goto('/output');
    await expect(page.locator('body')).toHaveAttribute('data-unavailable', 'no-token');
    expect(await coveredPixels(page)).toBe(0);
  });
});
