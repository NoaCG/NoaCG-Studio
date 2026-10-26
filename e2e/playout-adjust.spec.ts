// PLACE AND SIZE IN THE BROWSER (docs/work-specs/playout-adjustments/spec.md, phase 1): the halves
// Node cannot prove. The measurement a settled document answers (AC-2's two rectangles for a band,
// AC-3's smallest text against the receipt's numbers), the output stage's frame transform composing
// exactly as control/cueAdjust.ts `composeRect` says with the four rules on the real apply path
// (AC-2, AC-8, AC-10), and the /output renderer booting from a report that carries an appearance
// (AC-9's renderer half), with only the backend stood in for as in output-ready.spec.ts. The arithmetic
// is scripts/cue-adjust.test.mjs; the operator's flow is e2e/production-controls.spec.ts.
// covers: src/preview/settleGraphic.ts, src/preview/measureCue.ts, src/output/stage.ts, src/output/main.ts, src/control/cueAdjust.ts

import { test, expect, type Page, type Route } from '@playwright/test';

type Rect = { x: number; y: number; w: number; h: number };
type Measured = { info: Rect | null; paint: Rect | null; minText: number | null } | null;

/** Measure a catalog design settled with its own field defaults, as the production page does for a
 *  cue PREVIEW has not shown (preview/measureCue.ts). */
async function measureDesign(page: Page, id: string): Promise<Measured> {
  return page.evaluate(async (variant) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { measureCue } = await import('/src/preview/measureCue.ts');
    const { seedValues } = await import('/src/model/shows.ts');
    const template = variantById(variant)!.create({});
    return measureCue(template, seedValues(template.fields));
  }, id);
}

test.describe('the measurement a settled document answers', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/app#/home');
  });

  test('a hugging strap: its information box sits where the receipt measured it, its smallest text too', async ({ page }) => {
    const m = await measureDesign(page, 'lt01');
    expect(m?.info).not.toBeNull();
    // Receipt (evidence/scale-experiment-2026-10-24.md): ink from left 120 to bottom 961, smallest
    // 24. The painted extent is that ink (the hairline included); the information box is the words,
    // which sit to the right of the hairline and never outside the ink.
    expect(Math.abs(m!.paint!.x - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(m!.paint!.y + m!.paint!.h - 961)).toBeLessThanOrEqual(2);
    expect(m!.info!.x).toBeGreaterThanOrEqual(m!.paint!.x);
    expect(m!.info!.y + m!.info!.h).toBeLessThanOrEqual(m!.paint!.y + m!.paint!.h + 1);
    expect(Math.abs(m!.minText! - 24)).toBeLessThanOrEqual(1);
  });

  test('AC-3: qz01 and qz05 report their smallest text within 1 px of the receipt', async ({ page }) => {
    expect(Math.abs((await measureDesign(page, 'qz01'))!.minText! - 22)).toBeLessThanOrEqual(1);
    expect(Math.abs((await measureDesign(page, 'qz05'))!.minText! - 26)).toBeLessThanOrEqual(1);
  });

  test('AC-2: lt63 is a band, read off its painted extent; its words sit inside its edges', async ({ page }) => {
    const m = await measureDesign(page, 'lt63');
    const frame = { width: 1920, height: 1080 };
    const kind = await page.evaluate(async ([measured, size]) => {
      const { geometryLimit } = await import('/src/control/cueAdjust.ts');
      return geometryLimit(measured, size);
    }, [m, frame] as const);
    expect(kind).toBe('spans');
    expect(m!.paint!.x).toBeLessThanOrEqual(1);
    expect(m!.paint!.x + m!.paint!.w).toBeGreaterThanOrEqual(1919);
    // The text is well inside both edges: the band is never moved as though it were text.
    expect(m!.info!.x).toBeGreaterThan(60);
    expect(m!.info!.x + m!.info!.w).toBeLessThan(1860);
  });
});

test('the output stage composes the frame transform as the resolver says, and keeps the four rules', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app#/home');
  const result = await page.evaluate(async () => {
    const { createOutputStage } = await import('/src/output/stage.ts');
    const A = await import('/src/control/cueAdjust.ts');
    document.body.innerHTML = '';
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
    document.body.appendChild(root);
    const RES = { width: 1920, height: 1080, label: '1080p' };
    // A document that records every update it is handed, so the spec can see what reaches it.
    const spec = {
      key: 'Strap',
      html: '<div id="t">x</div>',
      css: '',
      js: 'window.__got = []; window.update = function (d) { window.__got.push(d); };',
      assets: [],
      resolution: RES,
      fps: 50,
      layer: 20,
    };
    const stage = createOutputStage(root, { v: 1, resolution: RES, graphics: [spec], cues: [] }, { fit: () => ({ width: 1920, height: 1080 }) });
    const iframe = root.querySelector('iframe[title="Strap"]') as HTMLIFrameElement;
    // Its document loaded (the stage shows a frame only then), so the commands below reach it.
    for (let i = 0; i < 100 && iframe.style.visibility !== 'visible'; i++) await new Promise((r) => setTimeout(r, 100));
    const read = () => {
      const r = iframe.getBoundingClientRect();
      return { attr: iframe.dataset.appearance ?? null, rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
    };
    // lt01's measured box placed bottom-right at 95 %.
    const m = { info: { x: 120, y: 865, w: 410, h: 96 }, paint: { x: 120, y: 865, w: 410, h: 96 }, minText: 24 };
    const frame = A.resolveFrame(A.effectiveAdjust({ v: 1, place: 'br', scale: 0.95, anchor: 'bl' }, undefined), m, RES, RES)!;
    const look = A.appearanceOf(frame);
    const untouched = read();
    stage.apply('Strap', { t: 'update', data: { f0: 'a' }, appearance: look });
    const applied = read();
    stage.apply('Strap', { t: 'update', data: { f0: 'b' } });
    stage.apply('Strap', { t: 'stop' });
    const kept = read();
    stage.apply('Strap', { t: 'update', data: {}, appearance: look });
    const again = read();
    stage.apply('Strap', { t: 'update', data: {}, appearance: A.IDENTITY });
    const cleared = read();
    const expected = A.composeRect({ x: 0, y: 0, w: 1920, h: 1080 }, frame);
    const box = A.composeRect(m.info, frame);
    return { untouched, applied, kept, again, cleared, expected, look, boxRight: box.x + box.w, boxBottom: box.y + box.h };
  });
  // AC-10: no appearance, no transform, no attribute.
  expect(result.untouched.attr).toBeNull();
  expect(result.untouched.rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  // The frame lands exactly where the resolver's arithmetic puts it: one coordinate system.
  expect(JSON.parse(result.applied.attr!)).toEqual(result.look);
  for (const k of ['x', 'y', 'w', 'h'] as const) expect(Math.abs(result.applied.rect[k] - result.expected[k])).toBeLessThanOrEqual(0.5);
  expect(Math.abs(result.boxRight - 1800)).toBeLessThanOrEqual(1);
  expect(Math.abs(result.boxBottom - 961)).toBeLessThanOrEqual(1);
  // Rule 1: a partial update and a stop keep it. Rule 3: the same one again does not multiply.
  expect(result.kept).toEqual(result.applied);
  expect(result.again).toEqual(result.applied);
  // The identity clears it.
  expect(result.cleared.attr).toBeNull();
  expect(result.cleared.rect).toEqual({ x: 0, y: 0, w: 1920, h: 1080 });
  // Rollback: the document is handed its data only; no graphic ever sees the appearance.
  const doc = page.frames().find((f) => f.parentFrame() === page.mainFrame());
  const got = await doc!.evaluate(() => (window as unknown as { __got: string[] }).__got);
  expect(got).toEqual([JSON.stringify({ f0: 'a' }), JSON.stringify({ f0: 'b' }), '{}', '{}']);
});

// ── The /output renderer boots from its report (AC-9, renderer half) ──────────────────────────────

const BACKEND = 'https://adjust.supabase.test';
const CONFIG_MODULE = `
export function loadBackendConfig() { return { url: ${JSON.stringify(BACKEND)}, anonKey: 'anon-test-key' }; }
export function isBackendConfigured(cfg = loadBackendConfig()) { return Boolean(cfg.url && cfg.anonKey); }
`;
const RESOLUTION = { width: 1920, height: 1080, label: '1080p' };
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
const LOOK = { v: 1, frame: { dx: 1270, dy: 0, s: 0.95, ox: 530, oy: 961 } };

function production(live: Record<string, unknown>) {
  const graphic = (key: string) => ({ key, html: '<div id="t">x</div>', css: '', js: 'window.update = function () {};', assets: [], resolution: RESOLUTION, fps: 50, layer: 20 });
  return {
    id: '00000000-0000-4000-8000-0000000000ad',
    title: 'Adjust Probe',
    output: { v: 1, resolution: RESOLUTION, graphics: [graphic('Strap'), graphic('Bug')], cues: [], ver: { n: 3, at: '2026-10-25T00:00:00.000Z', h: 'abcdef0123456789', g: {} } },
    live,
    last_event_id: 0,
  };
}

async function standInBackend(page: Page, row: unknown): Promise<void> {
  await page.route('**/src/backend/config.ts*', (route) => route.fulfill({ contentType: 'text/javascript', body: CONFIG_MODULE }));
  await page.route(`${BACKEND}/**`, async (route: Route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const path = new URL(req.url()).pathname;
    if (path.endsWith('/rpc/control_output_resolve')) {
      return route.fulfill({ status: 404, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify({ code: 'PGRST202', details: null, hint: null, message: 'Could not find the function' }) });
    }
    const body = path.endsWith('/rpc/control_output_by_slug') ? [row] : [];
    return route.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  });
}

test('the /output renderer restores the appearance its report holds, and only for that graphic', async ({ page }) => {
  await standInBackend(page, production({ Strap: { data: { f0: 'ON AIR' }, state: { groups: { main: 'in' }, appearance: LOOK }, event: 0 } }));
  await page.goto('/output?production=adjust-probe');
  const strap = page.locator('iframe[title="Strap"]');
  await expect(strap).toHaveAttribute('data-appearance', JSON.stringify(LOOK), { timeout: 20_000 });
  expect(await strap.evaluate((el) => (el as HTMLElement).style.transform)).toBe('translate(1270px, 0px) scale(0.95)');
  // The other graphic was never adjusted: no transform, no attribute (AC-10).
  await expect(page.locator('iframe[title="Bug"]')).not.toHaveAttribute('data-appearance', /.*/);
  // A boot is no new Take: nothing played.
  await expect(page.locator('body')).toHaveAttribute('data-plays', '0');
});
