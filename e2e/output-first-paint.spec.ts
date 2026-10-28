// A FOREIGN OGraf package on the stage (docs/OGRAF_ECOSYSTEM.md §3): the isolated player, the
// host document it loads, the ControlMessage -> OGraf call mapping, and the benign and hostile
// fixtures. The one spec that proves the boundary, and output-first-paint because the stage
// module is what the published graphics load through as well.
// covers: {src/preview/composeDocument.ts,src/output/{stage.ts,foreignOgraf.ts},src/control/ograf{Host.ts,Contract.ts},e2e/fixtures/foreign-ograf/**}

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
import { st01 } from '/src/templates/competition/results/st01.ts';
import { rs01 } from '/src/templates/competition/results/rs01.ts';
import { br01 } from '/src/templates/competition/results/br01.ts';
import { tt01 } from '/src/templates/competition/results/tt01.ts';

const q = new URLSearchParams(location.search);
const variants = { lt01, st01, rs01, br01, tt01 };
// ?designs=st01,lt01 names each graphic's design; without it, n copies of lt01.
const keys = q.get('designs') ? q.get('designs').split(',') : Array.from({ length: Number(q.get('n') || 1) }, () => 'lt01');
const graphics = [];
let design;
keys.forEach((id, i) => {
  design = variants[id].create();
  graphics.push({
    key: q.get('designs') ? id : 'lt' + i,
    html: design.html,
    css: design.css,
    js: design.js,
    assets: [],
    resolution: design.resolution,
    fps: design.fps,
    layer: 20 + i,
  });
});
// A moment of nothing first, the way the real boot waits on its resolve.
await new Promise((r) => setTimeout(r, Number(q.get('delay') || 250)));
const stage = createOutputStage(document.body, { v: 1, resolution: design.resolution, graphics, cues: [] });
window.__stage = stage;
window.__airWhenSettled = airWhenSettled;
// Read HERE, in the same turn the stage was built, because a frame's own load can fire before
// anything outside this page gets to look at it.
window.__visibilityAtBirth = getComputedStyle(document.querySelector('iframe')).visibility;
window.__stageReady = true;
`;

/** Serve the REAL /output document with its boot module swapped for the harness. The caller
 *  asserts on `swapped` AFTER navigating: an assertion thrown inside a route handler leaves the
 *  navigation unanswered, so the run reports a timeout instead of what actually went wrong. */
async function mountHarness(page: Page): Promise<{ swapped: boolean }> {
  const result = { swapped: false };
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
    // every assertion below would be about a page with no stage on it. The page is served
    // either way, so the test can say that in a sentence instead of timing out.
    result.swapped = html.includes('/first-paint/boot.js');
    await route.fulfill({ contentType: 'text/html', body: html });
  });
  return result;
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
  /** Set by the beforeEach and read after the first navigation of every test. */
  let harness: { swapped: boolean };

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    harness = await mountHarness(page);
  });

  test.afterEach(() => {
    expect(harness.swapped, 'the /output shell still loads its boot module the way this spec swaps').toBe(true);
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
    // document that stands still here is one that will play its entrance on air later. The
    // playhead is not monotonic - GSAP drops a timeline from its global one the moment it
    // finishes - so the question is whether ANY reading beat the first, not whether the last
    // one did; a shorter entrance than this design's must not read as a frozen document.
    const readings = [await motionOf(page, 'lt0')];
    for (let i = 0; i < 4; i++) {
      await page.waitForTimeout(150);
      readings.push(await motionOf(page, 'lt0'));
    }
    expect(Math.max(...readings), `playhead readings off air: ${readings.join(', ')}`).toBeGreaterThan(readings[0]);

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
    await page.goto('/first-paint/output');
    // The reading the harness took as the frame was created, before its srcdoc could have
    // loaded: an unloaded frame holds a document with no color-scheme of its own, which
    // Chromium paints as an opaque white canvas inside this dark-scheme page. Taking it from
    // out here would race the load, which fires a few milliseconds later.
    await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady);
    const atBirth = await page.evaluate(() => (window as unknown as { __visibilityAtBirth: string }).__visibilityAtBirth);
    expect(atBirth).toBe('hidden');
    await expect
      .poll(async () => page.evaluate(() => getComputedStyle(document.querySelector('iframe')!).visibility))
      .toBe('visible');
  });
});

/**
 * A BOARD TAKEN AGAIN AFTER AN OUT (#1618). The output renderer plays the graphic's own play()
 * in a document that stays loaded between cues, so whatever an Out wrote inline is still there
 * at the next Take. A results board's rows cascade animates the rows and never their container,
 * and the Out fades that container (`.results-board-body`) to opacity 0: the second Take showed
 * the frame and header with no rows, on CasparCG and OBS alike, while the editor's monitor (which
 * resets the graphic before each play) showed them. Read here on the shipped stage, inside each
 * board's own frame, for the four board types.
 */
test.describe('the /output shell, a graphic taken again', () => {
  let harness: { swapped: boolean };

  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 270 });
    harness = await mountHarness(page);
  });

  test.afterEach(() => {
    expect(harness.swapped, 'the /output shell still loads its boot module the way this spec swaps').toBe(true);
  });

  /** The board's rows as they draw: the lowest opacity on the path from each row up to the body,
   *  the rows' container's transform (the Out also leaves it shifted 16 px down), and the opacity
   *  of the container and of the graphic's root, which say where an Out has got to. */
  async function rowsShown(page: Page): Promise<{ rows: number; minOpacity: number; transform: string; body: number; root: number }> {
    // The board's own document: the one frame holding a results board (the other is lt01's).
    const frames = page.frames().filter((f) => f !== page.mainFrame());
    const has = await Promise.all(frames.map((f) => f.evaluate(() => !!document.querySelector('.results-board-body')).catch(() => false)));
    const frame = frames[has.indexOf(true)];
    if (!frame) return { rows: 0, minOpacity: 0, transform: 'no board frame', body: -1, root: -1 };
    return frame.evaluate(() => {
      const body = document.querySelector('.results-board-body') as HTMLElement | null;
      const rows = body ? Array.from(body.children) as HTMLElement[] : [];
      let minOpacity = 1;
      for (const row of rows) {
        for (let el: HTMLElement | null = row; el && el !== document.body; el = el.parentElement) {
          minOpacity = Math.min(minOpacity, Number(getComputedStyle(el).opacity));
        }
      }
      const root = document.querySelector('.results-board');
      return {
        rows: rows.length,
        minOpacity,
        transform: body ? getComputedStyle(body).transform : 'no body',
        body: body ? Number(getComputedStyle(body).opacity) : -1,
        root: root ? Number(getComputedStyle(root).opacity) : -1,
      };
    });
  }

  for (const board of ['st01', 'rs01', 'br01', 'tt01']) {
    test(`${board}: Take, Out, Take again shows the rows: after an Update, during the Out, with another graphic on air`, async ({ page }) => {
      test.setTimeout(60_000);
      await page.goto(`/first-paint/output?designs=${board},lt01`);
      await page.waitForFunction(() => (window as unknown as { __stageReady?: boolean }).__stageReady);
      const apply = (graphic: string, msg: unknown) =>
        page.evaluate(([g, m]) => (window as unknown as { __stage: { apply(g: string, m: unknown): void } }).__stage.apply(g as string, m), [graphic, msg] as const);
      const settled = async (label: string) => {
        await expect
          .poll(async () => (await rowsShown(page)).minOpacity, { message: `${board}, ${label}: the rows are drawn`, timeout: 8_000 })
          .toBe(1);
        const shown = await rowsShown(page);
        expect(shown.rows, `${board}, ${label}: the board has rows`).toBeGreaterThan(0);
        expect(['none', 'matrix(1, 0, 0, 1, 0, 0)'], `${board}, ${label}: the rows' container is at rest`).toContain(shown.transform);
      };
      // An Out is over once the graphic's root is hidden again.
      const out = async () => {
        await apply(board, { t: 'stop' });
        await expect.poll(async () => (await rowsShown(page)).root, { message: `${board}: the Out ends`, timeout: 8_000 }).toBe(0);
      };

      await apply(board, { t: 'play' });
      await settled('first Take');

      // Plain Take, Out, Take.
      await out();
      await apply(board, { t: 'play' });
      await settled('second Take');

      // An Update before the Out.
      await apply(board, { t: 'update', data: { f0: 'Updated title' } });
      await out();
      await apply(board, { t: 'play' });
      await settled('Take after an Update and an Out');

      // A Take pressed while the Out is still running.
      await apply(board, { t: 'stop' });
      await expect
        .poll(async () => { const s = await rowsShown(page); return s.body < 1 && s.root > 0; }, { message: `${board}: the Out is under way`, intervals: [10], timeout: 8_000 })
        .toBe(true);
      await apply(board, { t: 'play' });
      await settled('Take during the Out');

      // Another graphic on air across the Out and the Take.
      await apply('lt01', { t: 'play' });
      await out();
      await apply(board, { t: 'play' });
      await settled('Take with another graphic on air');
      // The rows hold: still drawn well after the entrance would have finished.
      await page.waitForTimeout(2_000);
      expect((await rowsShown(page)).minOpacity, `${board}: the rows stay drawn`).toBe(1);
    });
  }
});
