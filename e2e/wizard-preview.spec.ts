import { test, expect, type CDPSession, type Page, type FrameLocator } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { chooseType, pickDesign } from './_browse';
import { dropSvg } from './_svg-import';

// The wizard's live preview must FEEL live: every choice lands in the composed iframe,
// rapid changes settle on the LAST choice, and the lifecycle demo on the Animation step
// never strands the preview hidden after a mid-demo change (a stop() timer scheduled
// against the previous document must not blank the fresh one).

async function openWizardTo(page: Page, step: 'fields' | 'style' | 'animation') {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  const hops = { fields: 1, style: 2, animation: 3 }[step];
  for (let i = 0; i < hops; i++) await page.getByRole('button', { name: 'Next →' }).click();
}

function preview(page: Page): FrameLocator {
  return page.frameLocator('.wz-side iframe');
}

/** The graphic root inside the preview — visible only after the entrance played. */
function root(page: Page) {
  return preview(page).locator('.lower-third');
}

// These readers run inside the wizard's live iframe, which the debounced rebuild replaces
// wholesale (srcdoc). A read caught mid-swap throws "execution context destroyed" — return
// null instead so an expect.poll retries against the fresh document rather than aborting.
//
// ONLY that class of error. A bare `catch { return null }` turns a mistake in the reader itself
// into a poll that quietly never satisfies, and then reports a timeout instead of naming the
// fault: `expect.poll(reader)` calls the reader with NO arguments, so one written to take
// `page` threw a TypeError on every attempt for fifteen seconds and blamed the product.
const isMidSwap = (err: unknown): boolean =>
  /execution context (?:was )?destroyed|Target (?:page |)closed|frame (?:was )?detached|not attached/i.test(
    String((err as { message?: string })?.message ?? err),
  );

async function rootOpacity(page: Page): Promise<string | null> {
  try {
    return await root(page).evaluate((el) => getComputedStyle(el).opacity);
  } catch (err) {
    if (!isMidSwap(err)) throw err;
    return null;
  }
}

async function previewVar(page: Page, prop: string): Promise<string | null> {
  try {
    return await preview(page)
      .locator(':root')
      .evaluate((el, p) => getComputedStyle(el).getPropertyValue(p).trim(), prop);
  } catch (err) {
    if (!isMidSwap(err)) throw err;
    return null;
  }
}

test('style step: rapid palette clicks settle on the LAST palette, entrance replayed', async ({ page }) => {
  await openWizardTo(page, 'style');
  // Click through several palettes quickly; the debounced rebuild must coalesce
  // to the final choice and the entrance must still play (no blank preview).
  for (const name of ['Mint', 'Royal', 'Frost', 'Inferno']) {
    await page.locator('.wz-palette', { hasText: name }).click();
    await page.waitForTimeout(80);
  }
  const inferno = await page.evaluate(async () => {
    const { paletteById } = await import('/src/model/wizard.ts');
    return paletteById('inferno').accent;
  });
  await expect.poll(() => previewVar(page, '--accent')).toBe(inferno);
  await expect.poll(() => rootOpacity(page)).toBe('1');
});

test('style step: font and size choices land in the rebuilt preview', async ({ page }) => {
  await openWizardTo(page, 'style');
  // Typeface sits behind a disclosure now (re-design/handoff.md §2d) — the collapsed row
  // names the face in use, and the picker opens on ask. Same idiom as Size & position below.
  await page.getByTestId('wz-typeface').locator('summary').click();
  await page.getByTestId('font-select').first().selectOption({ label: 'Space Grotesk' });
  await expect.poll(() => previewVar(page, '--font-heading')).toContain('Space Grotesk');
  // A growth-set face flows through the same path: the first serif the catalog ever had
  // (docs/GOALS_ARCHIVE.md "Student release" step 5) - pick it via search, land it in the build.
  await page.getByTestId('font-select').first().selectOption({ label: 'Playfair Display' });
  await expect.poll(() => previewVar(page, '--font-heading')).toContain('Playfair Display');
  await page.getByTestId('font-select').first().selectOption({ label: 'Space Grotesk' });
  await expect.poll(() => previewVar(page, '--font-heading')).toContain('Space Grotesk');
  // Size and position are TUNING and sit behind a disclosure too. The PALETTE is what this
  // step now leads with alone: every other decision here has a good per-design default and a
  // collapsed row naming it. Open it to reach the knobs (see components/CLAUDE.md).
  await page.getByTestId('wz-size-position').locator('summary').click();
  // Graphic size L scales the WHOLE graphic (the --scale contract), not just the text.
  // 1.25 / 1.2 are StyleStep's SIZES/TYPE_SIZES ladders (widened with the corpus review).
  await page.locator('.panel-section', { hasText: 'Graphic size' }).getByRole('button', { name: 'L', exact: true }).click();
  await expect.poll(() => previewVar(page, '--scale')).toBe('1.25');
  // Text size L scales ONLY the type (the --type-scale contract): the name line's
  // font grows while the graphic's --scale stays where the size knob put it.
  const fontPx = () =>
    preview(page).locator('#f0').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const before = await fontPx();
  await page.locator('.panel-section', { hasText: 'Text size' }).getByRole('button', { name: 'L', exact: true }).click();
  await expect.poll(() => previewVar(page, '--type-scale')).toBe('1.2');
  expect(await fontPx()).toBeCloseTo(before * 1.2, 0);
  await expect.poll(() => previewVar(page, '--scale')).toBe('1.25');
  await expect.poll(() => rootOpacity(page)).toBe('1');
});

test('fields step: quick typing settles into the preview text', async ({ page }) => {
  await openWizardTo(page, 'fields');
  const sample = page.locator('.wz-line-row input').nth(1); // line 1's sample text
  await sample.fill('Dana Meridian');
  await expect(preview(page).locator('#f0')).toHaveText('Dana Meridian', { timeout: 5000 });
  await expect.poll(() => rootOpacity(page)).toBe('1');
});

test('zoom to graphic: the preview reframes onto a small graphic and back', async ({ page }) => {
  // A corner bug is ~150px of a 1920px canvas — the case the zoom exists for.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'corner logos');
  await pickDesign(page, 'Glass Mark');

  const iframe = page.locator('.wz-side iframe');
  const scaleOf = async () =>
    Number(((await iframe.getAttribute('style'))!.match(/scale\(([\d.]+)\)/) ?? [])[1]);

  // Wait for the debounced srcdoc + the stage fit, then record the full-canvas scale.
  await expect.poll(scaleOf).toBeGreaterThan(0.2);
  const fullCanvas = await scaleOf();

  const zoomBtn = page.getByRole('button', { name: 'Zoom to graphic' });
  await expect(zoomBtn).toBeEnabled();
  await zoomBtn.click();
  // The reframed view is dramatically closer than the full canvas, and off-centered
  // toward the graphic (the content translate appears in the transform).
  await expect.poll(scaleOf).toBeGreaterThan(fullCanvas * 2);
  expect(await iframe.getAttribute('style')).toMatch(/scale\([\d.]+\) translate\(-?\d/);

  // Toggling back restores the whole-canvas fit.
  await page.getByRole('button', { name: 'Whole canvas' }).click();
  await expect.poll(scaleOf).toBeCloseTo(fullCanvas, 2);
});

test('animation step: the lifecycle demo runs on the GRAPHIC’s clock, not a fixed beat', async ({ page }) => {
  // WHY THE SPEED KNOB LOOKED DEAD ON A FADE (owner, 2026-08-26; GOALS goal 6). Both controls
  // reach the render — measured, the emitted NOACG_ANIM carries speed 0.6/1/1.8, the built
  // entrance lasts 1.333/0.800/0.444s, and a fade's four offered curves produce four different
  // opacity ramps. What hid all of it was this demo loop: stop at 1700ms and replay at 2800ms
  // whatever the graphic did, so every setting played inside ONE fixed 2.8s beat — and the
  // faster the setting, the LONGER the graphic then sat still (367ms of hold at Slower against
  // 1256ms at Faster: the cadence moved the wrong way). A slide survived it because travel is a
  // second cue; a fade has no second cue, which is why it was the one that read as broken.
  //
  // So the beat is derived from the template's own durations. Measured here as the property
  // that makes the knob visible: Slower's cycle is materially longer than Faster's.
  await openWizardTo(page, 'animation');
  const speed = (label: string) =>
    page.locator('.panel-section', { hasText: 'Speed' }).getByRole('button', { name: label, exact: true }).first();

  // Sampled INSIDE the document at animation rate: the off-air window is under a second at the
  // fast setting, which an expect.poll with a growing interval can step straight over.
  const cycleMs = async () => {
    await expect.poll(() => rootOpacity(page), { timeout: 8000 }).toBe('1');
    return root(page).evaluate(
      (el) =>
        new Promise<number>((res) => {
          const t0 = performance.now();
          let left: number | null = null;
          const tick = () => {
            const on = getComputedStyle(el).opacity === '1';
            if (left === null && !on) left = performance.now() - t0;
            // The whole cycle: on air, off air, and back on again.
            if (left !== null && on) return res(performance.now() - t0);
            if (performance.now() - t0 > 7000) return res(-1);
            requestAnimationFrame(tick);
          };
          tick();
        }),
    );
  };

  await speed('Faster').click();
  await page.waitForTimeout(900); // past the srcdoc debounce, so the reading is the new document's
  const fast = await cycleMs();

  await speed('Slower').click();
  await page.waitForTimeout(900);
  const slow = await cycleMs();
  expect(fast).toBeGreaterThan(0);
  expect(slow).toBeGreaterThan(0);

  // A ±80% speed step now changes the loop's own rhythm by most of a second. The old fixed pair
  // made this difference ZERO by construction, which no assertion on the emitted data could see.
  expect(slow).toBeGreaterThan(fast + 400);
});

test('animation step: a mid-demo preset change never leaves the preview hidden', async ({ page }) => {
  await openWizardTo(page, 'animation');
  // The lifecycle demo is running (in, then out, then in again — on the graphic's own clock).
  // Change the preset right around the exit so a stale stop()/play() timer would target the
  // rebuilt document if it survived the rebuild.
  await page.waitForTimeout(1500);
  await page.locator('.wz-anim', { hasText: 'Mask wipe' }).click();
  // Wait past the full demo cycle of the NEW document, then the graphic must be on air.
  await page.waitForTimeout(4500);
  await expect.poll(() => rootOpacity(page), { timeout: 5000 }).toBe('1');
});

test('template cards frame onto the graphic, not the empty canvas around it', async ({ page }) => {
  // A lower third occupies a band of a 1920x1080 frame, so a card that scaled the whole canvas
  // was mostly empty and the designs were hard to tell apart at picking size. Each card now
  // measures its graphic and frames onto it (MiniPreview) — the same reframe "Zoom to graphic"
  // performs. Assert the framing is real (zoomed past the whole-canvas fit) and that the
  // graphic sits INSIDE its card rather than being cropped by the zoom.
  await page.goto('/app');
  // MiniPreview's iframe carries no allow-same-origin (it renders unvetted designs), so its
  // settled box arrives over postMessage rather than a contentDocument read — the listener must
  // be live before any card mounts, since postMessage is a one-shot event, not readable state.
  await page.evaluate(() => {
    (window as unknown as { __miniBoxes: Map<MessageEventSource, unknown> }).__miniBoxes =
      new Map();
    window.addEventListener('message', (ev) => {
      const data = ev.data as { type?: string } | undefined;
      if (data?.type === 'spx-preview-box' && ev.source) {
        (
          window as unknown as { __miniBoxes: Map<MessageEventSource, unknown> }
        ).__miniBoxes.set(ev.source, ev.data);
      }
    });
  });
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await expect(page.locator('.wz-variant').first()).toBeVisible();

  const framing = await page.evaluate(async () => {
    // MiniPreview mounts its iframe only once the card scrolls into view — bring the
    // measured cards on-screen first, then let them settle + measure.
    const cards = [...document.querySelectorAll('.wz-variant')].slice(0, 5);
    cards[0]?.scrollIntoView();
    await new Promise((r) => setTimeout(r, 2500));
    const boxes = (window as unknown as { __miniBoxes: Map<Window, { x: number; y: number; w: number; h: number }> })
      .__miniBoxes;
    const out: { zoom: number; insideL: boolean; insideR: boolean }[] = [];
    cards.forEach((card) => {
      const mini = card.querySelector('.wz-mini')!.getBoundingClientRect();
      const f = card.querySelector('iframe') as HTMLIFrameElement | null;
      const inner = f?.contentWindow ? boxes.get(f.contentWindow) : undefined;
      if (!f || !inner) return;
      const fr = f.getBoundingClientRect();
      const scale = fr.width / f.offsetWidth;         // rendered scale of the canvas
      const fit = mini.width / f.offsetWidth;          // the whole-canvas fit it replaces
      const gx = fr.left + inner.x * scale;
      out.push({
        zoom: scale / fit,
        insideL: gx >= mini.left - 1,
        insideR: gx + inner.w * scale <= mini.right + 1,
      });
    });
    return out;
  });

  expect(framing.length).toBeGreaterThanOrEqual(4);
  for (const f of framing) {
    expect(f.zoom).toBeGreaterThan(1.5); // genuinely reframed, not the old whole-canvas scale
    expect(f.insideL && f.insideR).toBe(true); // and the zoom never crops the design away
  }
});

// ── MEASURED MOTION IN THE PREVIEW (preview/settleGraphic.ts, blocks/animData.ts
// `hasMeasuredMotion`). A credit roll's entrance is not an entrance: it is eighteen seconds of
// travel that starts with every name below the frame. Played from zero on the Fields step it
// answers "what does this design look like" with an empty box for the first second and a half,
// and is not recognisably a credit roll until about twelve. So off the Animation step a graphic
// with measured motion SETTLES, and ▶ Replay is what plays it.

/** How much of the credits viewport the travelling track actually covers, 0-100. */
async function trackCoverage(page: Page): Promise<number | null> {
  try {
    return await preview(page)
      .locator('.credits-box')
      .evaluate((box) => {
        const track = box.ownerDocument.querySelector('#credits-track');
        if (!track) return 0;
        const b = box.getBoundingClientRect();
        const t = track.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(b.bottom, t.bottom) - Math.max(b.top, t.top));
        return b.height > 0 ? Math.round((overlap / b.height) * 100) : 0;
      });
  } catch (err) {
    if (!isMidSwap(err)) throw err;
    return null; // caught mid-swap: let expect.poll retry against the fresh document
  }
}

test('a credit roll is SETTLED in the preview, and Replay is what plays it', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Credits & thanks');
  await pickDesign(page, 'Classic Roll');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields

  // Settled: the names are ON SCREEN as soon as the step renders, not on their way there.
  await expect.poll(() => trackCoverage(page), { timeout: 15_000 }).toBeGreaterThan(30);

  // …and the settle is a first frame, never a trap: Replay still runs the roll from the
  // bottom, so the step where somebody wants to watch it has lost nothing.
  await page.getByRole('button', { name: '▶ Replay' }).click();
  await expect.poll(() => trackCoverage(page), { timeout: 8_000 }).toBeLessThan(30);
});


// ── THE STAGE NEVER GOES BLANK ACROSS A STEP CHANGE (docs/handoffs/2026-09-21-e-demo-rehearsal.md).
// Walked as a student on the live site, the wizard preview went dark for three to five seconds
// after every step change of the SVG import road: the rebuilt document replaced the old one the
// moment it was committed, and the artwork came back only once the new frame had parsed its
// 280 KB of inlined fonts and GSAP, waited for the fonts and started its entrance. A student
// reads that as "my artwork is gone". WizardPreview now holds the outgoing frame on the stage
// until the new document reports its first frame ("THE AFTERIMAGE").
//
// Measured the way a student sees it - by what is PAINTED on the stage - rather than by anything
// inside either document. The stage's own background is flat, so "ink" is the share of pixels
// that is not that background.

/** The docs' own quiz example - the file the students download and walk. */
const QUIZ_EXAMPLE_SVG = fileURLToPath(new URL('../public/docs/examples/quiz.svg', import.meta.url));

/**
 * The CPU slowdown the step changes run under. The blank this test guards is the new document's
 * LOAD, and on a developer's machine that load is short enough to hide inside the entrance's own
 * fade. Twelve times slower stretches it to about a second and a half, the shape of what the
 * student walk met on a school laptop, so the blank is plain here and not only in front of the
 * students.
 */
const CPU_SLOWDOWN = 12;

/**
 * The share of `crop` painted in anything but the stage background, 0 to 1, for each image.
 * `crop` is in CSS px and `cssWidth` is how many CSS px the image spans, because a screencast
 * frame may be scaled. Decoded in the page (a canvas), so the spec needs no image dependency.
 */
async function inkShares(
  page: Page,
  images: { b64: string; mime: string; cssWidth: number; crop: { x: number; y: number; w: number; h: number } }[],
): Promise<number[]> {
  return page.evaluate(async (list) => {
    const out: number[] = [];
    for (const { b64, mime, cssWidth, crop: css } of list) {
      const img = new Image();
      img.src = `data:${mime};base64,${b64}`;
      await img.decode();
      const k = img.width / cssWidth;
      const crop = { x: css.x * k, y: css.y * k, w: css.w * k, h: css.h * k };
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(crop.w));
      canvas.height = Math.max(1, Math.round(crop.h));
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      const d = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      // The background is the most common colour: the stage is flat. Quantised to 8 levels a
      // channel, so JPEG noise does not split it. Every fourth pixel is plenty for a share.
      const hist = new Map<number, number>();
      for (let i = 0; i < d.length; i += 16) {
        const key = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
        hist.set(key, (hist.get(key) ?? 0) + 1);
      }
      let bg = 0;
      let most = 0;
      for (const [key, n] of hist) if (n > most) { most = n; bg = key; }
      const [br, bgc, bb] = [((bg >> 10) & 31) * 8 + 4, ((bg >> 5) & 31) * 8 + 4, (bg & 31) * 8 + 4];
      let ink = 0;
      let total = 0;
      for (let i = 0; i < d.length; i += 16) {
        total += 1;
        if (Math.abs(d[i] - br) + Math.abs(d[i + 1] - bgc) + Math.abs(d[i + 2] - bb) > 36) ink += 1;
      }
      out.push(ink / total);
    }
    return out;
  }, images);
}

/** The stage's box, two px in from every edge (past its own hairline border). */
async function stageClip(page: Page) {
  const box = await page.locator('.wz-stage').boundingBox();
  if (!box || box.width < 8 || box.height < 8) return null;
  return { x: box.x + 2, y: box.y + 2, width: box.width - 4, height: box.height - 4 };
}

/**
 * THREE PERCENT is "the artwork is there". The imported document keeps a thin dashed
 * safe-margin guide on the stage whatever the graphic does (about half a percent of the pixels),
 * and the quiz board itself is about a fifth of them. The guide alone is not the artwork.
 */
const INK = 0.03;

/** Whether the stage shows the artwork right now, by screenshot. Null with no stage yet. */
async function stageHasInk(page: Page): Promise<boolean | null> {
  const clip = await stageClip(page);
  if (!clip) return null;
  const png = await page.screenshot({ clip });
  const [share] = await inkShares(page, [
    { b64: png.toString('base64'), mime: 'image/png', cssWidth: clip.width, crop: { x: 0, y: 0, w: clip.width, h: clip.height } },
  ]);
  return share > INK;
}

/** The stage's rebuild stamps (WizardPreview's load handler): the revision, and whether one is owed. */
async function docStamp(page: Page): Promise<{ rev: string | null; pending: boolean }> {
  return page.locator('.wz-stage').evaluate((el: HTMLElement) => ({
    rev: el.dataset.docRev ?? null,
    pending: el.dataset.docPending === '1',
  }));
}

/**
 * Wait until no rebuild is owed and none has landed for a second. The import road commits more
 * than one document on its way in, and a measurement taken while a late one is still landing
 * reads THAT document's entrance instead of the step change it meant to.
 */
async function quiet(page: Page) {
  let last = await docStamp(page);
  let since = Date.now();
  await expect
    .poll(
      async () => {
        const now = await docStamp(page);
        if (now.rev !== last.rev || now.pending !== last.pending) {
          last = now;
          since = Date.now();
        }
        return !now.pending && Date.now() - since >= 1000;
      },
      { timeout: 30_000 },
    )
    .toBe(true);
}

/**
 * Run `action` (a step change) throttled, and FILM the page while the rebuilt document lands:
 * the compositor's own screencast, which sends a frame for every paint however busy the page's
 * main thread is. A screenshot loop cannot do this - under the slowdown one screenshot takes
 * longer than the whole entrance, and the samples step straight over the blank.
 *
 * Returns the FIRST blank window in ms (from the first painted frame with no artwork to the next
 * frame with it), how many frames were filmed, and the timeline for the log. The first window
 * is the one the reader sees on a step change: the Animation step's lifecycle demo takes the
 * graphic off air on purpose a little later, and that is not a blank.
 */
async function blankAcross(
  page: Page,
  cdp: CDPSession,
  action: () => Promise<void>,
): Promise<{ blankMs: number; frames: number; timeline: string }> {
  const clip = await stageClip(page);
  if (!clip) throw new Error('no stage to film');
  const revBefore = (await docStamp(page)).rev;
  const shots: { t: number; b64: string; deviceWidth: number }[] = [];
  const onFrame = (f: { data: string; sessionId: number; metadata: { timestamp?: number; deviceWidth: number } }) => {
    // The frame's own paint time where it reads as wall-clock seconds, else its arrival.
    const painted = (f.metadata.timestamp ?? 0) * 1000;
    const t = Math.abs(painted - Date.now()) < 60_000 ? painted : Date.now();
    shots.push({ t, b64: f.data, deviceWidth: f.metadata.deviceWidth });
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  };
  cdp.on('Page.screencastFrame', onFrame);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_SLOWDOWN });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70 });
  // The screencast opens on the current picture; the step change is timed from after it.
  await expect.poll(() => shots.length, { timeout: 10_000 }).toBeGreaterThan(0);
  const t0 = Date.now();
  await action();
  // Film until the new document has landed and had time to run its entrance.
  let landedAt: number | null = null;
  while (Date.now() - t0 < 25_000) {
    const { rev, pending } = await docStamp(page);
    if (landedAt === null && rev !== revBefore && !pending) landedAt = Date.now();
    if (landedAt !== null && Date.now() - landedAt >= 3000) break;
    await page.waitForTimeout(100);
  }
  // The film's end, for a blank that never came back: the screencast sends nothing while the
  // picture stands still, so the last frame's own time would measure that blank as zero.
  const stoppedAt = Date.now();
  await cdp.send('Page.stopScreencast');
  cdp.off('Page.screencastFrame', onFrame);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });

  const shares = await inkShares(
    page,
    shots.map((s) => ({
      b64: s.b64,
      mime: 'image/jpeg',
      cssWidth: s.deviceWidth,
      crop: { x: clip.x, y: clip.y, w: clip.width, h: clip.height },
    })),
  );
  const lines: string[] = [];
  let blankFrom: number | null = null;
  let blankMs = 0;
  for (let i = 0; i < shots.length; i++) {
    const at = Math.round(shots[i].t - t0);
    const ink = shares[i] > INK;
    lines.push(`${at}ms ${(shares[i] * 100).toFixed(1)}% ${ink ? 'ink' : 'BLANK'}`);
    if (at < 0) continue; // the picture before the step change
    if (!ink && blankFrom === null) blankFrom = at;
    if (ink && blankFrom !== null && blankMs === 0) blankMs = Math.max(1, at - blankFrom);
  }
  if (blankFrom !== null && blankMs === 0) blankMs = stoppedAt - t0 - blankFrom; // never came back
  return { blankMs, frames: shots.length, timeline: lines.join('\n') };
}

test('the preview keeps the artwork on the stage across a step change', async ({ page }) => {
  // The demo laptop's screen, and the road the students walk: the docs' quiz example, imported.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto('/app');
  await dropSvg(page, QUIZ_EXAMPLE_SVG);
  await quiet(page);
  await expect.poll(() => stageHasInk(page), { timeout: 20_000 }).toBe(true);
  // THE DETECTOR'S OWN CONTROL: the exit takes the board off, and it must read as blank; Replay
  // brings it back. A detector that cannot tell the two apart measures nothing.
  await page.getByRole('button', { name: '■ Out' }).click();
  await expect.poll(() => stageHasInk(page), { timeout: 8_000 }).toBe(false);
  await page.getByRole('button', { name: '▶ Replay' }).click();
  await expect.poll(() => stageHasInk(page), { timeout: 8_000 }).toBe(true);
  await quiet(page);

  const cdp = await page.context().newCDPSession(page);

  // Fields to Animation: the document is rebuilt without the mapping step's markers and its
  // rect channel, so this is a real rebuild and not a re-render.
  const forward = await blankAcross(page, cdp, () => page.locator('.wz-footer button.wz-next').click());
  console.log(`[preview-first-frame] Fields -> Animation: blank ${forward.blankMs} ms, ${forward.frames} frames\n${forward.timeline}`);
  await expect(page.getByTestId('wz-stepcount')).toContainText('4');
  await quiet(page);

  // And back again, which rebuilds it WITH them.
  const back = await blankAcross(page, cdp, () => page.locator('.wz-footer button.wz-back').click());
  console.log(`[preview-first-frame] Animation -> Fields: blank ${back.blankMs} ms, ${back.frames} frames\n${back.timeline}`);
  await expect(page.getByTestId('map-svg-fields')).toBeVisible();

  // Enough painted frames that the fades the film shows were running.
  expect(forward.frames, 'frames filmed across Fields -> Animation').toBeGreaterThan(10);
  expect(back.frames, 'frames filmed across Animation -> Fields').toBeGreaterThan(10);
  // MEASURED 2026-09-22, 12x slowdown, two runs each. BEFORE the afterimage (the old frame
  // dropped on commit): blank 1519 and 1214 ms after Fields -> Animation, 1151 and 1196 ms after
  // Animation -> Fields, the stage at 0.5% ink (the guide alone) until the new document had
  // loaded. AFTER: 41, 42, 52 and 46 ms. What is left is the entrance's own first frames, which
  // start from nothing on purpose and ramp through the 3% line in two or three frames, exactly
  // as they did before. The limit sits between the two with room for a slower machine; the
  // afterimage itself is held however long the load takes.
  expect(forward.blankMs, 'blank after Fields -> Animation').toBeLessThan(400);
  expect(back.blankMs, 'blank after Animation -> Fields').toBeLessThan(400);
});
