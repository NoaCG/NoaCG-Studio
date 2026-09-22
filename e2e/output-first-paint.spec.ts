import { test, expect, type Page } from '@playwright/test';

/**
 * WHAT A BROWSER SOURCE SEES WHILE THE OUTPUT PAGE LOADS (docs/CLOUD_PLAYOUT.md §3).
 *
 * The owner loaded a published production's `/output` URL as an HTML source in CasparCG Client
 * on 2026-09-22 and the whole output flashed as it loaded. The cause was the boot catch-up: the
 * renderer replays every command it missed and used to hide the stage behind `opacity: 0` while
 * that ran. Chromium throttles the rendering of an iframe its embedder has made invisible, and
 * every graphic is a sandboxed frame, so the replay crawled at about 1 Hz off air and then
 * finished its entrances and exits ON AIR the moment the stage came back. It is now the
 * DOCUMENTS that go off air (`offair`, previewProtocol.ts) - they keep their frame rate and the
 * replay is over before anything returns.
 *
 * These tests pin the three properties air depends on, on the real /output shell: nothing paints
 * before a cue, a graphic taken off air keeps running, and a replay that ends with the graphic
 * off leaves nothing on screen. The backend half (resolve, log, recovery) is
 * `e2e/configured/output-cold-boot.spec.ts`; this file replaces only the boot module, so the
 * page, the stage and the composed documents under test are the shipped ones.
 */

/** The renderer's boot, replaced: the same stage, built from a real catalog design. */
const HARNESS = `
import { createOutputStage } from '/src/output/stage.ts';
import { airWhenSettled } from '/src/output/catchUp.ts';
import { lt01 } from '/src/templates/lowerThirds/lt01.ts';

const q = new URLSearchParams(location.search);
const design = lt01.create();
const graphics = [];
for (let i = 0; i < Number(q.get('n') || 1); i++) {
  graphics.push({
    key: 'lt' + i,
    html: design.html,
    css: design.css,
    js: design.js,
    assets: [],
    resolution: design.resolution,
    fps: design.fps,
    layer: 20 + i,
  });
}
// A moment of nothing first, the way the real boot waits on its resolve.
await new Promise((r) => setTimeout(r, Number(q.get('delay') || 250)));
const stage = createOutputStage(document.body, { v: 1, resolution: design.resolution, graphics, cues: [] });
window.__stage = stage;
window.__airWhenSettled = airWhenSettled;
window.__stageReady = true;
`;

/** Serve the REAL /output document with its boot module swapped for the harness. */
async function mountHarness(page: Page): Promise<void> {
  await page.route('**/first-paint/boot.js*', (route) =>
    route.fulfill({ contentType: 'text/javascript', body: HARNESS }),
  );
  await page.route('**/first-paint/output*', async (route) => {
    const real = await route.fetch({ url: new URL('/output?production=probe', route.request().url()).toString() });
    const html = (await real.text()).replace(
      /<script type="module" src="\/src\/output\/main\.ts[^"]*"><\/script>/,
      '<script type="module" src="/first-paint/boot.js"></script>',
    );
    // If the shell stops loading its boot module this way, the swap is silently a no-op and
    // every assertion below would be about a page with no stage on it.
    expect(html).toContain('/first-paint/boot.js');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
}

/** How many pixels of a screenshot are not fully transparent, and the brightest alpha in it. */
async function painted(page: Page, shot: Buffer): Promise<{ covered: number; maxAlpha: number }> {
  return page.evaluate(async (b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    let covered = 0;
    let maxAlpha = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) covered += 1;
      if (data[i] > maxAlpha) maxAlpha = data[i];
    }
    return { covered, maxAlpha };
  }, shot.toString('base64'));
}

/** A graphic's animation playhead as the stage last heard it (stage.motion). */
async function motionOf(page: Page, graphic: string): Promise<number> {
  return page.evaluate((key) => {
    const stage = (window as unknown as { __stage: { requestState(g: string): void; motion: Map<string, number> } }).__stage;
    stage.requestState(key);
    return stage.motion.get(key) ?? -1;
  }, graphic);
}

test.describe('the /output shell on load', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    await mountHarness(page);
  });

  test('paints nothing at all from navigation until a cue is taken', async ({ page }) => {
    const frames: { at: number; covered: number }[] = [];
    const startedAt = Date.now();
    await page.goto('/first-paint/output?n=3', { waitUntil: 'commit' });
    // Every frame this browser will give us for the next two seconds: the page load, the stage
    // being built, three documents being composed and loaded. `omitBackground` is what a
    // CasparCG/OBS browser source has - no page background of its own to hide behind.
    while (Date.now() - startedAt < 2000) {
      const shot = await page.screenshot({ omitBackground: true, animations: 'allow' });
      frames.push({ at: Date.now() - startedAt, ...(await painted(page, shot)) });
    }
    const lit = frames.filter((f) => f.covered > 0);
    expect(lit, `frames with anything on them: ${JSON.stringify(lit.slice(0, 5))}`).toEqual([]);
    expect(frames.length).toBeGreaterThan(10);

    // …and the capture can see a graphic, so the emptiness above is the page's, not the test's.
    await page.evaluate(() => (window as unknown as { __stage: { apply(g: string, m: unknown): void } }).__stage.apply('lt0', { t: 'play' }));
    await expect
      .poll(async () => (await painted(page, await page.screenshot({ omitBackground: true }))).covered, { timeout: 10_000 })
      .toBeGreaterThan(0);
  });

  test('a graphic taken off air keeps running, and shows nothing while it does', async ({ page }) => {
    await page.goto('/first-paint/output');
    await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady);
    await page.evaluate(() => {
      const stage = (window as unknown as { __stage: { setVisible(v: boolean): void; apply(g: string, m: unknown): void } }).__stage;
      stage.setVisible(false);
      stage.apply('lt0', { t: 'play' });
    });

    // THE PROPERTY THE FLASH WAS MADE OF. Off air, the entrance must still be running: a
    // document that stands still here is one that will play its entrance on air later.
    const first = await motionOf(page, 'lt0');
    await page.waitForTimeout(500);
    const second = await motionOf(page, 'lt0');
    await page.waitForTimeout(500);
    const third = await motionOf(page, 'lt0');
    expect(third, `playhead readings off air: ${first}, ${second}, ${third}`).toBeGreaterThan(first);

    // …and none of it reached the screen.
    const offAir = await painted(page, await page.screenshot({ omitBackground: true, animations: 'allow' }));
    expect(offAir).toEqual({ covered: 0, maxAlpha: 0 });

    // The stage itself is NOT hidden - that is what throttled the documents. Each document is
    // what goes transparent, so the frames keep being composited.
    //
    // This assertion is STRUCTURAL on purpose, and it is the one that fails against the old
    // code (checked 2026-09-22 by putting the stage opacity back). Headless Chromium here keeps
    // ticking a hidden frame, so the reading above passes either way; the throttling is real on
    // CasparCG's CEF, where it was measured. Do not "simplify" this into the pixel checks.
    const stageOpacity = await page.evaluate(() => {
      const el = document.querySelector('iframe')?.parentElement as HTMLElement;
      return getComputedStyle(el).opacity;
    });
    expect(stageOpacity).toBe('1');
  });

  test('a replay that ends with the graphic off leaves the output clean when it comes back', async ({ page }) => {
    await page.goto('/first-paint/output?n=2');
    await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady);
    // The shape of a cold boot's catch-up: everything the log holds, played off air.
    await page.evaluate(() => {
      const stage = (window as unknown as {
        __stage: { setVisible(v: boolean): void; apply(g: string, m: unknown): void; graphics: string[] };
      }).__stage;
      stage.setVisible(false);
      for (let pass = 0; pass < 2; pass++) {
        for (const graphic of stage.graphics) {
          stage.apply(graphic, { t: 'play' });
          stage.apply(graphic, { t: 'stop' });
        }
      }
    });
    // …and the renderer's own walk decides when that replay is over and puts the stage back on
    // air. It is the shipped one (src/output/catchUp.ts), not an imitation of it, which is the
    // whole point of this test.
    const ending = await page.evaluate(() => {
      const w = window as unknown as { __stage: unknown; __airWhenSettled: (s: unknown) => Promise<string> };
      return w.__airWhenSettled(w.__stage);
    });
    expect(ending, 'the replay stood still rather than running out the cap').toBe('settled');

    // Back on air, and the replay left nothing behind: no graphic, no tail of an exit.
    for (let i = 0; i < 6; i++) {
      const shot = await painted(page, await page.screenshot({ omitBackground: true, animations: 'allow' }));
      expect(shot, `frame ${i} after coming back on air`).toEqual({ covered: 0, maxAlpha: 0 });
    }
  });

  test('a graphic frame is invisible until its own document has loaded', async ({ page }) => {
    await page.goto('/first-paint/output?delay=1500');
    // Read the frame the moment the stage exists, before its srcdoc can have loaded: an
    // unloaded frame holds a document with no color-scheme of its own, which Chromium paints as
    // an opaque white canvas inside this dark-scheme page.
    const atBirth = await page.evaluate(async () => {
      while (!(window as unknown as { __stageReady?: boolean }).__stageReady) await new Promise((r) => setTimeout(r, 5));
      const frame = document.querySelector('iframe') as HTMLIFrameElement;
      return { visibility: getComputedStyle(frame).visibility, loaded: false };
    });
    expect(atBirth.visibility).toBe('hidden');
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('iframe')!).visibility))
      .toBe('visible');
  });
});
