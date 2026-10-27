// PLACE AND SIZE IN THE BROWSER (docs/work-specs/playout-adjustments/spec.md, phase 1): the halves
// Node cannot prove. The measurement a settled document answers (AC-2's two rectangles for a band,
// AC-3's smallest text against the receipt's numbers), the output stage's frame transform composing
// exactly as control/cueAdjust.ts `composeRect` says with the four rules on the real apply path
// (AC-2, AC-8, AC-10), and the /output renderer booting from a report that carries an appearance
// (AC-9's renderer half), with only the backend stood in for as in output-ready.spec.ts. The arithmetic
// is scripts/cue-adjust.test.mjs; the operator's flow is e2e/production-controls.spec.ts.
// covers: src/preview/settleGraphic.ts, src/components/home/measureCue.ts, src/output/stage.ts, src/output/main.ts, src/control/cueAdjust.ts, src/control/cueStyle.ts, src/preview/composeDocument.ts

import { test, expect, type Page, type Route } from '@playwright/test';

type Rect = { x: number; y: number; w: number; h: number };
type Measured = { info: Rect | null; paint: Rect | null; minText: number | null } | null;

/** Measure a catalog design settled with its own field defaults, as the production page does for a
 *  cue PREVIEW has not shown (components/home/measureCue.ts). */
async function measureDesign(page: Page, id: string): Promise<Measured> {
  return page.evaluate(async (variant) => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { measureCue } = await import('/src/components/home/measureCue.ts');
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

  test('SVG artwork is measured by what it draws, not by a full-frame artboard around it', async ({ page }) => {
    const m = await page.evaluate(async () => {
      const { measureCue } = await import('/src/components/home/measureCue.ts');
      const { DEFAULT_SETTINGS } = await import('/src/model/types.ts');
      const html = '<div><svg width="1920" height="1080" viewBox="0 0 1920 1080">' +
        '<defs><rect id="unused" x="0" y="0" width="1920" height="1080" fill="#000"/></defs>' +
        '<rect x="0" y="0" width="1920" height="1080" fill="none"/>' +
        '<rect x="100" y="900" width="400" height="80" fill="#c00"/></svg></div>';
      return measureCue(
        { name: 'Art', type: 'blank', resolution: { width: 1920, height: 1080, label: '1080p' }, fps: 50, html, css: 'body{margin:0}', js: '', fields: [], settings: DEFAULT_SETTINGS, assets: [], layers: [] },
        {},
      );
    });
    expect(m?.paint).toEqual({ x: 100, y: 900, w: 400, h: 80 });
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

/**
 * TYPE AND COLOUR THROUGH THE STAGE (phase 2; AC-5 and AC-6's document half). The style an
 * appearance carries goes into the graphic's own document (control/cueStyle.ts, the composed
 * document's `style` command), so these read inside the frame: the face Chromium really used for
 * a name with Nordic and Central-European letters (its per-node platform-font report), the weight
 * and colour the root variables give, the refit through the template's own update(), the
 * reserves a staged design calibrated, and the latest-request guard.
 */
const NAME = 'Åsa Öberg-Ærø Šimon Žáková A\u030A';

async function styledStage(page: Page, imported = false, design = 'lt01') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app#/home');
  await page.evaluate(async ({ imported, design }) => {
    const { createOutputStage } = await import('/src/output/stage.ts');
    const { variantById } = await import('/src/templates/catalog.ts');
    const assets: { path: string; data: string }[] = [];
    if (imported) {
      const bytes = new Uint8Array(await (await fetch('/fonts/anton.woff2')).arrayBuffer());
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      assets.push({ path: 'fonts/brand-import.woff2', data: `data:font/woff2;base64,${btoa(bin)}` });
    }
    const t = variantById(design)!.create({});
    document.body.innerHTML = '';
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px';
    document.body.appendChild(root);
    const RES = { width: 1920, height: 1080, label: '1080p' };
    const spec = { key: 'L3', html: t.html, css: t.css, js: t.js, assets, resolution: RES, fps: 50, layer: 20 };
    const w = window as unknown as Record<string, unknown>;
    w.__stage = createOutputStage(root, { v: 1, resolution: RES, graphics: [spec], cues: [] }, { fit: () => ({ width: 1920, height: 1080 }) });
    w.__restyled = [];
    w.__refit = [];
    window.addEventListener('message', (ev) => {
      if ((ev.data as { type?: string })?.type !== 'spx-preview-restyled') return;
      (w.__restyled as number[]).push((ev.data as { seq: number }).seq);
      w.__restyledAt = performance.now();
      (w.__refit as boolean[]).push((ev.data as { refit: boolean }).refit);
    });
    const iframe = root.querySelector('iframe[title="L3"]') as HTMLIFrameElement;
    for (let i = 0; i < 100 && iframe.style.visibility !== 'visible'; i++) await new Promise((r) => setTimeout(r, 100));
  }, { imported, design });
  return page.frameLocator('iframe[title="L3"]');
}

/** Send a fold's resolved style to the stage as Take sends it. */
async function sendStyle(page: Page, record: unknown, imported: { family: string; assetPath: string }[] = []) {
  await page.evaluate(async ({ record, imported, name }) => {
    const A = await import('/src/control/cueAdjust.ts');
    const St = await import('/src/control/cueStyle.ts');
    const style = St.resolveStyle(A.effectiveAdjust(record, undefined), imported);
    const stage = (window as unknown as { __stage: { apply: (g: string, m: unknown) => void } }).__stage;
    stage.apply('L3', { t: 'update', data: { f0: name }, appearance: A.appearanceOf(null, style) });
  }, { record, imported, name: NAME });
}

/** The fonts Chromium drew the name line with, by the frame's own DOM. */
async function platformFonts(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1, pierce: true });
  const find = (n: { nodeName: string; contentDocument?: unknown; children?: unknown[]; nodeId: number }, pred: (n: never) => boolean): number | null => {
    if (pred(n as never)) return n.nodeId;
    for (const c of [...((n.children as never[]) ?? []), ...(n.contentDocument ? [n.contentDocument as never] : [])]) {
      const hit = find(c, pred);
      if (hit) return hit;
    }
    return null;
  };
  const frameDoc = find(root as never, (n: { nodeName: string; frameId?: string; documentURL?: string; nodeType?: number }) => n.nodeName === '#document' && n !== (root as never));
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: frameDoc!, selector: '#f0' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await cdp.detach();
  return fonts.map((f) => ({ family: f.familyName, custom: f.isCustomFont, glyphs: f.glyphCount }));
}

test('a chosen face reaches the document through the stage: every glyph of the name in it, at its weight', async ({ page }) => {
  const doc = await styledStage(page);
  const before = await doc.locator('#f0').evaluate((el) => getComputedStyle(el).fontFamily);
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' }, vars: { 'display-weight': '700', accent: '#ff7a00' } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled)).toEqual([1]);
  const seen = await doc.locator('html').evaluate((html) => {
    const f0 = document.getElementById('f0')!;
    const draw = (font: string) => {
      const c = document.createElement('canvas');
      c.width = 1400;
      c.height = 90;
      const ctx = c.getContext('2d')!;
      ctx.font = font;
      ctx.fillText(f0.textContent ?? '', 4, 70);
      return c.toDataURL();
    };
    return {
      root: { accent: html.style.getPropertyValue('--accent'), weight: html.style.getPropertyValue('--display-weight') },
      text: f0.textContent,
      family: getComputedStyle(f0).fontFamily,
      weightIfPainted: getComputedStyle(f0).fontWeight,
      fallbackDiffers: draw('700 48px "Archivo", Arial, sans-serif') !== draw('700 48px Arial, sans-serif'),
    };
  });
  expect(seen.root).toEqual({ accent: '#ff7a00', weight: '700' });
  expect(seen.text).toBe(NAME);
  expect(before).not.toContain('Archivo');
  expect(seen.family).toContain('Archivo');
  expect(seen.fallbackDiffers, 'the fallback stack draws the name differently, so its use would show').toBe(true);
  const fonts = await platformFonts(page);
  expect(fonts.length).toBeGreaterThan(0);
  // Every letter is shaped in the face: the report counts at least one glyph per visible letter
  // (the decomposed Å among them). Spaces and the joined mark are left free, since where the line
  // wraps decides whether they are shaped.
  const letters = [...new Intl.Segmenter().segment(NAME)].filter((g) => g.segment.trim()).length;
  expect(fonts.reduce((n, f) => n + f.glyphs, 0), `every letter in the face: ${JSON.stringify(fonts)}`).toBeGreaterThanOrEqual(letters);
  expect(seen.weightIfPainted, 'the chosen weight, which the variable face draws').toBe('700');
  expect(fonts.filter((f) => !f.custom), 'no glyph of the name from a system face').toEqual([]);
  expect(fonts.every((f) => f.family.startsWith('Archivo')), `the face is Archivo: ${JSON.stringify(fonts)}`).toBe(true);
  expect(new Set(fonts.map((f) => f.family.replace(/\s+(Regular|Bold|Variable).*$/i, ''))).size, `one family: ${JSON.stringify(fonts)}`).toBe(1);
  // A colour alone moves no text: it is applied and answers no refit, so PREVIEW does not settle
  // again for nothing.
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' }, vars: { 'display-weight': '700', accent: '#00a3ff' } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __refit: boolean[] }).__refit)).toEqual([true, false]);
  expect(await doc.locator('html').evaluate((h) => h.style.getPropertyValue('--accent'))).toBe('#00a3ff');
  // Taken off: an identity puts the design back.
  await page.evaluate(async () => {
    const A = await import('/src/control/cueAdjust.ts');
    (window as unknown as { __stage: { apply: (g: string, m: unknown) => void } }).__stage.apply('L3', { t: 'update', data: {}, appearance: A.IDENTITY });
  });
  await expect.poll(() => doc.locator('html').evaluate((h) => h.style.getPropertyValue('--font-heading'))).toBe('');
});

test('the latest request wins: a slow face that loads after a newer choice does nothing', async ({ page }) => {
  // Archivo's file answers late; Inter's at once.
  await page.route('**/fonts/archivo*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 1_500));
    await route.continue();
  });
  const doc = await styledStage(page);
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' } });
  await sendStyle(page, { v: 1, font: { fontId: 'inter' } });
  // Long enough for Archivo to have arrived.
  await page.waitForTimeout(2_500);
  expect(await doc.locator('html').evaluate((h) => h.style.getPropertyValue('--font-heading'))).toContain('Inter');
  expect(await page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled), 'only the newer style refitted').toEqual([2]);
});

test('a refit a colour change overtook is still done: the face it waited for is the one now loading', async ({ page }) => {
  // Archivo's file answers 3 s late. The colour-only style that overtakes the face keeps its
  // declaration, so it must wait for the face already loading, then refit.
  await page.route('**/fonts/archivo*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });
  await styledStage(page);
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' } });
  const sent = await page.evaluate(() => performance.now());
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' }, vars: { accent: '#ff7a00' } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled), { timeout: 10_000 }).toEqual([2]);
  expect(await page.evaluate(() => (window as unknown as { __refit: boolean[] }).__refit), 'the newer, colour-only style carries the refit the face owed').toEqual([true]);
  const waited = (await page.evaluate(() => (window as unknown as { __restyledAt: number }).__restyledAt)) - sent;
  expect(waited, `the refit waited for the face (${Math.round(waited)} ms after the colour)`).toBeGreaterThan(2_000);
});

test('a design that fits in update() is given its values again when its face arrives after the hold', async ({ page }) => {
  // lt01 fits on update(), not on document.fonts.ready. Archivo answers 3 s late, past the 400 ms
  // the queue holds, so the Update the style rides fits the fallback: the late refit sends the
  // same values again.
  await page.route('**/fonts/archivo*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });
  const doc = await styledStage(page);
  await doc.locator('html').evaluate(() => {
    const w = window as unknown as { update: (d: string) => void; __updates: string[] };
    const own = w.update;
    w.__updates = [];
    w.update = (d: string) => { w.__updates.push(d); own(d); };
  });
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled), { timeout: 10_000 }).toEqual([1]);
  const updates = await doc.locator('html').evaluate(() => (window as unknown as { __updates: string[] }).__updates);
  expect(updates.length, JSON.stringify(updates)).toBe(2);
  expect(updates[1], 'the same values, once the face is in').toBe(updates[0]);
});

test('the late refit keeps what an accepted event wrote while the face was loading', async ({ page }) => {
  // A Reveal's payload lands in the fields through the template's own noacgApplyPayload after the
  // Update that rode the style, so a refit of the Update's values alone would put the old name back.
  await page.route('**/fonts/archivo*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 3_000));
    await route.continue();
  });
  const doc = await styledStage(page);
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' } });
  await expect(doc.locator('#f0')).toHaveText(NAME);
  expect(await doc.locator('html').evaluate(() => {
    const w = window as unknown as { noacgApplyPayload?: (p: Record<string, string>) => void };
    if (typeof w.noacgApplyPayload !== 'function') return false;
    w.noacgApplyPayload({ f0: 'Corrected Name' });
    return true;
  }), 'the design applies event payloads').toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled), { timeout: 10_000 }).toEqual([1]);
  await expect(doc.locator('#f0'), 'the refit replays the field as the event left it').toHaveText('Corrected Name');
});

test('an appearance-only update (a send to on-air graphics) refits with the values on air, never with an empty object', async ({ page }) => {
  // Phase 3's bulk send carries the look and empty data, so a half-typed name never airs: the
  // document refits with the values it took last, never with the empty object. The face answers
  // past the 400 ms hold, so the empty update runs before the refit does.
  await page.route('**/fonts/archivo*.woff2', async (route) => {
    await new Promise((r) => setTimeout(r, 1_500));
    await route.continue();
  });
  const doc = await styledStage(page);
  await page.evaluate((name) => {
    (window as unknown as { __stage: { apply: (g: string, m: unknown) => void } }).__stage.apply('L3', { t: 'update', data: { f0: name } });
  }, NAME);
  await expect(doc.locator('#f0')).toHaveText(NAME);
  await doc.locator('html').evaluate(() => {
    const w = window as unknown as { update: (d: string) => void; __updates: string[] };
    const own = w.update;
    w.__updates = [];
    w.update = (d: string) => { w.__updates.push(d); own(d); };
  });
  await page.evaluate(async () => {
    const A = await import('/src/control/cueAdjust.ts');
    const St = await import('/src/control/cueStyle.ts');
    const style = St.resolveStyle(A.effectiveAdjust({ v: 1, font: { fontId: 'archivo' }, vars: { accent: '#ff7a00' } }, undefined), []);
    (window as unknown as { __stage: { apply: (g: string, m: unknown) => void } }).__stage.apply('L3', { t: 'update', data: {}, appearance: A.appearanceOf(null, style) });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled), { timeout: 10_000 }).toEqual([1]);
  expect(await doc.locator('html').evaluate((h) => h.style.getPropertyValue('--accent'))).toBe('#ff7a00');
  const updates = await doc.locator('html').evaluate(() => (window as unknown as { __updates: string[] }).__updates);
  expect(updates.filter((u) => u !== '{}'), 'one refit, with the values on air').toEqual([JSON.stringify({ f0: NAME })]);
  await expect(doc.locator('#f0')).toHaveText(NAME);
});

test('a staged design keeps the reserves it calibrated when its face changes', async ({ page }) => {
  // card80's font-ready callback is the staged runtime's one-time calibration: run again it takes
  // every line for a new row and keeps one row of each multi-row reserve. A face change refits
  // through update() against the reserves the design measured instead.
  const doc = await styledStage(page, false, 'card80');
  const rooms = () => doc.locator('html').evaluate(() => [...document.querySelectorAll('[data-stage-room]')].map((el) => el.getAttribute('data-stage-room')));
  const before = await rooms();
  expect(before.length, 'the design calibrated its staged lines').toBeGreaterThan(0);
  await sendStyle(page, { v: 1, font: { fontId: 'archivo' } });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __refit: boolean[] }).__refit)).toEqual([true]);
  expect(await doc.locator('html').evaluate((h) => h.style.getPropertyValue('--font-heading'))).toContain('Archivo');
  expect(await rooms(), 'every reserve as the design calibrated it').toEqual(before);
});

test('an imported face reaches the document by its asset path, and draws the name from its own file', async ({ page }) => {
  const doc = await styledStage(page, true);
  await sendStyle(page, { v: 1, font: { family: 'Brand Import', assetPath: 'fonts/brand-import.woff2' } }, [{ family: 'Brand Import', assetPath: 'fonts/brand-import.woff2' }]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled)).toEqual([1]);
  await doc.locator('#f0').evaluate((el) => (el.textContent = 'JAKE MORRISON'));
  expect(await doc.locator('#f0').evaluate((el) => getComputedStyle(el).fontFamily)).toContain('Brand Import');
  const fonts = await platformFonts(page);
  expect(fonts.filter((f) => !f.custom), JSON.stringify(fonts)).toEqual([]);
  // A colour-only Update keeps the loaded face itself: declared again, it would be a new face that
  // draws the fallback until it loads, a flash on air for a large imported file.
  const brandFaces = () => doc.locator('html').evaluate(() => {
    const out: { marked: boolean; status: string }[] = [];
    document.fonts.forEach((f) => { if (f.family.replace(/"/g, '') === 'Brand Import') out.push({ marked: !!(f as unknown as { __kept?: boolean }).__kept, status: f.status }); });
    return out;
  });
  await doc.locator('html').evaluate(() => document.fonts.forEach((f) => { if (f.family.replace(/"/g, '') === 'Brand Import') (f as unknown as { __kept?: boolean }).__kept = true; }));
  await sendStyle(page, { v: 1, font: { family: 'Brand Import', assetPath: 'fonts/brand-import.woff2' }, vars: { accent: '#00a3ff' } }, [{ family: 'Brand Import', assetPath: 'fonts/brand-import.woff2' }]);
  await expect.poll(() => page.evaluate(() => (window as unknown as { __restyled: number[] }).__restyled)).toEqual([1, 2]);
  expect(await brandFaces(), 'the same loaded face, never declared again').toEqual([{ marked: true, status: 'loaded' }]);
});
