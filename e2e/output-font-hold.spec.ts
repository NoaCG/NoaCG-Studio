// A FONT HOST THAT NEVER ANSWERS CANNOT KEEP A GRAPHIC OFF AIR (docs/PLAYOUT_ISOLATION_RESEARCH.md
// §5.2, §16 item 12). The stage releases a frame whose `load` a font request holds back, and the
// output's debug line says what it is waiting for.
// covers: src/output/stage.ts, src/output/main.ts, src/preview/{composeDocument,previewProtocol}.ts

import { test, expect, type Page, type Route } from '@playwright/test';

/**
 * WHY THIS EXISTS. Bundled fonts are fetched from `/fonts/*` by every graphic's frame when the
 * output opens. A web font requested during a frame's first layout holds back that frame's
 * `load`, and the stage used to keep every frame hidden, with its commands queued, until `load`.
 * Measured on 2026-09-29 with font requests that never answer: 35 s after opening, no graphic
 * frame had loaded, the output counted every Take and showed nothing. A frame that is parsed but
 * still not loaded FRAME_HOLD_CAP_MS later now releases itself onto its fallback faces.
 *
 * The page is the real /output shell with only its boot module swapped (the same technique as
 * output-first-paint.spec.ts), so the stage and the composed documents are the shipped ones. The
 * shell is served from a ROOT path so each srcdoc frame resolves `fonts/<file>` to `/fonts/<file>`
 * exactly as it does on `/output`.
 */
const HARNESS = `
import { createOutputStage, heldLine } from '/src/output/stage.ts';
import { lt01 } from '/src/templates/lowerThirds/lt01.ts';

const design = lt01.create();
const graphics = ['lt0', 'lt1'].map((key, i) => ({
  key,
  html: design.html,
  css: design.css,
  js: design.js,
  assets: [],
  resolution: design.resolution,
  fps: design.fps,
  layer: 20 + i,
}));
const stage = createOutputStage(document.body, { v: 1, resolution: design.resolution, graphics, cues: [] });
window.__stage = stage;
window.__heldLine = () => heldLine(stage.held);
window.__openedAt = performance.now();
// A Take on the first graphic the moment the output exists: the operator does not wait for fonts.
stage.apply('lt0', { t: 'play' });
`;

async function openOutput(page: Page): Promise<void> {
  let swapped = false;
  await page.route('**/font-hold/boot.js*', (route) => route.fulfill({ contentType: 'text/javascript', body: HARNESS }));
  await page.route('**/font-hold-output*', async (route) => {
    const real = await route.fetch({ url: new URL('/output?production=probe', route.request().url()).toString() });
    const html = (await real.text()).replace(
      /<script type="module" src="\/src\/output\/main\.ts[^"]*"><\/script>/,
      '<script type="module" src="/font-hold/boot.js"></script>',
    );
    swapped = html.includes('/font-hold/boot.js');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  // Not 'load': a child frame's load holds back its parent's, and a hung font is exactly that.
  await page.goto('/font-hold-output', { waitUntil: 'domcontentloaded' });
  expect(swapped, 'the /output shell still loads its boot module the way this spec swaps').toBe(true);
  await page.waitForFunction(() => (window as unknown as { __stage?: unknown }).__stage);
}

/**
 * How many pixels of the output are not fully transparent: what a browser source would air.
 * Captured over CDP, because `page.screenshot` waits for every frame's fonts first and so never
 * returns while a font request hangs, which is the whole subject here.
 */
async function covered(page: Page): Promise<number> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await cdp.detach();
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) n += 1;
    return n;
  }, data);
}

/** Since the stage was built, in ms, on the page's own clock. */
const sinceOpen = (page: Page) =>
  page.evaluate(() => performance.now() - (window as unknown as { __openedAt: number }).__openedAt);
const line = (page: Page) => page.evaluate(() => (window as unknown as { __heldLine: () => string | null }).__heldLine());
/** The bundled faces a graphic's document has finished loading. */
const loadedFaces = (page: Page, graphic: string) =>
  page
    .frameLocator(`iframe[title="${graphic}"]`)
    .locator('html')
    .evaluate(() => {
      const out: string[] = [];
      document.fonts.forEach((f) => {
        if (f.status === 'loaded') out.push(f.family.replace(/^["']|["']$/g, ''));
      });
      return out;
    });

test.describe('a font host on the output', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
  });

  test('that never answers: every graphic still airs, on a fallback face, and the debug line says why', async ({ page }) => {
    test.setTimeout(60_000);
    // Hold every font request until the test lets go of it: a request that never answers.
    const hung: Route[] = [];
    await page.route('**/fonts/**', (route) => {
      hung.push(route);
    });
    await openOutput(page);

    // The Take issued as the output opened is on air within the bound: the cap after the frame
    // was parsed, plus the time it took to parse.
    await expect.poll(() => covered(page), { timeout: 8_000 }).toBeGreaterThan(0);
    const airedAt = await sinceOpen(page);
    expect(airedAt, 'ms from opening to the first graphic on air').toBeLessThan(6_000);
    expect(hung.length, 'the frames did ask for their fonts').toBeGreaterThan(0);

    // A Take on the second graphic now runs at once, like on a healthy output.
    const before = await covered(page);
    await page.evaluate(() => (window as unknown as { __stage: { apply(g: string, m: unknown): void } }).__stage.apply('lt1', { t: 'play' }));
    await expect.poll(() => covered(page), { timeout: 3_000 }).toBeGreaterThan(before);

    // Both frames report what holds them, which is what the output's debug line prints.
    // One entry per graphic, in the order the frames reported.
    const entries = async () => ((await line(page)) ?? '').split('; ').sort();
    await expect.poll(entries).toEqual([
      'lt0 released on a fallback face, still waiting for Inter',
      'lt1 released on a fallback face, still waiting for Inter',
    ]);

    // The font host finally answers. The graphics stay on air, and the line records that the
    // font was late rather than forgetting it happened.
    for (const route of hung.splice(0)) {
      const real = await route.fetch();
      await route.fulfill({ response: real });
    }
    await expect.poll(entries).toEqual([
      'lt0 released on a fallback face (Inter was late)',
      'lt1 released on a fallback face (Inter was late)',
    ]);
    expect(await covered(page)).toBeGreaterThan(0);
  });

  test('that answers within the cap: nothing is released early and the first Take shows the real face', async ({ page }) => {
    // Slow, not broken: a second late, well inside the cap.
    await page.route('**/fonts/**', async (route) => {
      await new Promise((r) => setTimeout(r, 1_000));
      await route.fulfill({ response: await route.fetch() });
    });
    await openOutput(page);
    await expect.poll(() => covered(page), { timeout: 8_000 }).toBeGreaterThan(0);
    // The moment it aired, its font was already in place: no fallback text on air.
    expect(await loadedFaces(page, 'lt0')).toContain('Inter');
    expect(await line(page)).toBeNull();
  });
});
