// covers: src/blocks/**, src/components/canvas/**

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { canvasBox, elementPoint } from './_canvas';
import { frameRect } from './_frame';

// The off-canvas pasteboard (plans/happy-marinating-pebble.md): the editor shows a working
// margin around the canvas so content positioned OUTSIDE the canvas is visible and editable.
// These are the acceptance tests — the real animation workflow, code↔canvas sync, and
// preset-authored off-canvas positions — plus the hard invariant that the pad is a pure
// editor-view concept and never enters persisted, canvas-local coordinates.

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
}

/** Parse the live template's animation data in the page. */
async function animData(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
}

/** Select the Name line (#f0) and park the playhead mid-entrance so a canvas drag keys x/y. */
async function selectAndPark(page: Page, t = 0.35) {
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.evaluate((time) => {
    void (async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      s.setPlayhead({ step: 0, t: time });
      s.sendScrub('in', time);
    })();
  }, t);
  await page.waitForTimeout(200);
}

test('the pasteboard is sized by the authored motion, and grows when the motion does', async ({ page }) => {
  // A graphic whose whole reach is readable from px keyframes gets a margin that fits it,
  // instead of the flat third-of-a-frame every template used to be handed. Kicker never pushes
  // a layer more than a few px out; House Wire's marquee is MEASURED motion, whose travel the
  // data cannot carry, so it keeps the honest fallback. Relative, never a hard-coded fraction.
  // How much of the working surface is pasteboard: the overlay spans the padded document, the
  // guides' outline is the true canvas, so their ratio IS the margin — read from the DOM.
  const padRatio = async () => {
    const layer = (await page.getByTestId('canvas-layer').boundingBox())!;
    return layer.width / (await canvasBox(page)).width;
  };

  await createProject(page, 'Kicker');
  const modest = await padRatio();
  await createProject(page, 'House Wire');
  expect(modest).toBeLessThan(await padRatio());

  // Author an entrance that starts with the Name line fully clear of the canvas's left edge:
  // the margin now has something to hold, so it grows — and holds it.
  await createProject(page, 'Kicker');
  // Measured from where the line SETTLES, so the push clears the edge whatever the layout: the
  // rect is doc px, and the pad is what separates the doc origin from the canvas. Read via
  // Playwright's frame-scoped API (CDP, not a page-JS reach) — this iframe carries no
  // allow-same-origin — and passed into the page as a plain value.
  const r = await frameRect(page, '#f0');
  await awaitPreviewRebuild(page, () =>
    page.evaluate(
      async ({ left, width }) => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
        const { setKeyframe } = await import('/src/blocks/animEdit.ts');
        const { computePad } = await import('/src/components/canvas/pasteboard.ts');
        const s = useTemplateStore.getState();
        const data = parseAnimData(s.template.js)!;
        const settledLeft = left - computePad(s.template).padX; // doc px → canvas px
        // Keyed at a MOMENT the scrub can land on exactly: between keyframes the value depends
        // on the step's ease, and this test is about where the pasteboard holds the element,
        // not about easing maths.
        const at = Math.round(data.steps[0].duration * 50) / 100;
        const next = setKeyframe(data, 0, '#f0', 'x', at, -Math.round(settledLeft + width + 120));
        s.applyTemplate({ ...s.template, js: spliceAnimData(s.template.js, next)! });
        return at;
      },
      { left: r.left, width: r.width },
    ),
  );
  const at = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return Math.round(parseAnimData(useTemplateStore.getState().template.js)!.steps[0].duration * 50) / 100;
  });
  expect(await padRatio()).toBeGreaterThan(modest);
  const grown = await canvasBox(page);

  await page.evaluate(async (t: number) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.setPlayhead({ step: 0, t });
    s.sendScrub('in', t);
  }, at);
  await expect
    .poll(async () => (await elementPoint(page, '#f0')).x, { timeout: 5000 })
    .toBeLessThan(grown.x);
});

test('drag an element fully into the pasteboard: negative keyframe, still visible + selectable', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);

  const canvasBefore = await canvasBox(page);
  const start = await elementPoint(page, '#f0');
  // Drag left far enough to cross the canvas edge into the pasteboard: ~520 canvas px, which
  // (at the current scale) lands #f0 well past x = 0.
  const dxCanvas = 520;
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - dxCanvas * start.scale, start.y, { steps: 10 });
  // The release keys x and rebuilds the preview — measure only against the new document.
  // WRAPPER form: the bare form snapshots the revision AFTER the release, so a rebuild that
  // already landed leaves it waiting for a second one that never comes.
  await awaitPreviewRebuild(page, () => page.mouse.up());

  // The keyframe written is CANVAS-LOCAL and negative — the pad never leaks in.
  const data = await animData(page);
  const xs = (data!.steps[0].layers['#f0']?.x ?? []).map((k) => k.value as number);
  expect(Math.min(...xs)).toBeLessThan(-100);

  // The element now renders OUTSIDE the canvas (left of the canvas-bounds left edge)…
  const after = await elementPoint(page, '#f0');
  expect(after.x).toBeLessThan(canvasBefore.x);

  // …and it is still selectable out there in the pasteboard.
  await page.mouse.click(after.x, after.y);
  const sel = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  expect(sel).toBe('#f0');
});

test('the pasteboard pad never enters persisted state; export stays clipped to the canvas', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  const start = await elementPoint(page, '#f0');
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x - 300 * start.scale, start.y, { steps: 8 });
  await page.mouse.up();
  await awaitPreviewRebuild(page);

  const probe = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');
    const { computePad } = await import('/src/components/canvas/pasteboard.ts');
    const tpl = useTemplateStore.getState().template;
    const { padX } = computePad(tpl);
    return {
      padX,
      // The preview/export composition WITHOUT authoring keeps the canvas clip and no pasteboard.
      exportDoc: composeDocument(tpl),
      authoringDoc: composeDocument(tpl, { authoring: { padX, padY: 0 } }),
      // Everything persisted lives in the template — serialize it whole and search for the pad.
      serialized: JSON.stringify(tpl),
    };
  });

  // Sanity: the pad is real (non-zero) so the negative-below tests are meaningful.
  expect(probe.padX).toBeGreaterThan(0);
  // Semantic, not numeric: the persisted template carries no authoring/pad concept at all.
  expect(probe.serialized).not.toContain('pasteboard');
  expect(probe.serialized).not.toContain('padX');
  expect(probe.serialized).not.toContain('spx-authoring-style');
  // The exported/on-air document clips to the true canvas; only the authoring preview opts in.
  expect(probe.exportDoc).toContain('overflow: hidden');
  expect(probe.exportDoc).not.toContain('spx-authoring-style');
  expect(probe.authoringDoc).toContain('spx-authoring-style');
});

test('code ↔ canvas: a negative x written in code renders on the pasteboard and stays selectable', async ({ page }) => {
  await createHairline(page);

  // Author an off-canvas entrance x = -400 for #f0 directly in the template code — the same
  // canvas-local coordinate a preset generator or a hand edit would write.
  // The write rebuilds the preview; the scrub has to reach the NEW document, so it is issued
  // after the rebuild rather than raced against it behind a fixed sleep.
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
      const { setKeyframe } = await import('/src/blocks/animEdit.ts');
      const s = useTemplateStore.getState();
      const data = parseAnimData(s.template.js)!;
      const next = setKeyframe(data, 0, '#f0', 'x', 0, -400);
      s.applyTemplate({ ...s.template, js: spliceAnimData(s.template.js, next)! });
    }),
  );
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.setPlayhead({ step: 0, t: 0 });
    s.sendScrub('in', 0);
  });

  // The value round-trips as the canvas-local -400 (not pad-shifted).
  const data = await animData(page);
  const kf = (data!.steps[0].layers['#f0']?.x ?? []).find((k) => Math.abs((k.value as number) + 400) < 1);
  expect(kf, 'the x = -400 keyframe is in the code').toBeTruthy();

  // At t = 0 the element renders in the pasteboard (left of the canvas) and is selectable.
  // Polled, not slept: the scrub reaches the preview over postMessage.
  const canvas = await canvasBox(page);
  await expect
    .poll(async () => (await elementPoint(page, '#f0')).x, { timeout: 5000 })
    .toBeLessThan(canvas.x);
  const p = await elementPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);
  const sel = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  expect(sel).toBe('#f0');
});

test('preset-authored off-canvas: a slide preset entrance renders + selects on the pasteboard', async ({ page }) => {
  await createHairline(page);

  // Apply the slide preset's entrance to the panel (the layer the slide preset actually
  // animates) through the SAME deterministic generator the Inspector uses (presetApply), then
  // deepen its start so the preset-authored entrance clears the canvas edge — a preset
  // producing a big travel is the same code path, larger value. This proves preset positions
  // outside the canvas render and hit-test, not just manual drags.
  // The box's SETTLED rect, read via Playwright's frame-scoped API (CDP, not a page-JS reach) —
  // this iframe carries no allow-same-origin — and passed into the page as a plain value.
  const box = await frameRect(page, '.lower-third-box');
  let authored: { ok: boolean; entryY?: number } = { ok: false };
  await awaitPreviewRebuild(page, async () => {
    authored = await page.evaluate(
      async ({ boxTop, boxHeight }) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { presetDonor, applyPresetData } = await import('/src/blocks/presetApply.ts');
    const { computePad } = await import('/src/components/canvas/pasteboard.ts');
    const s = useTemplateStore.getState();
    const data = parseAnimData(s.template.js)!;
    const donor = presetDonor(s.template, data, 'slide-up');
    if (!donor) return { ok: false };
    const next = applyPresetData(data, donor, 'in', '.lower-third-box');
    if (!next) return { ok: false };
    // slide-up is a vertical slide: the panel enters on `y`. Compute the push from the box's
    // SETTLED canvas position so its entrance start lands ~120 px below the canvas edge — well
    // off-canvas, inside the bottom pasteboard — regardless of the template layout.
    const ys = next.steps[0].layers['.lower-third-box']?.y;
    if (!ys || !ys.length) return { ok: false };
    const { padY } = computePad(s.template);
    const settledCanvasCenterY = boxTop + boxHeight / 2 - padY; // doc px → canvas px
    ys[0].value = Math.round(s.template.resolution.height + 120 - settledCanvasCenterY);
      s.applyTemplate({ ...s.template, js: spliceAnimData(s.template.js, next)! });
      return { ok: true, entryY: ys[0].value };
      },
      { boxTop: box.top, boxHeight: box.height },
    );
  });
  expect(authored.ok).toBeTruthy();
  expect(authored.entryY as number).toBeGreaterThan(0);

  // Scrub to the entrance start AFTER the rebuild, so the preview seeks to the off-canvas
  // frame (issuing it before the rebuild would be overridden by the settle). A hair past zero:
  // GSAP renders nothing at exactly pause(0) (lazy first render), so 0 would show the settled
  // state instead of the entrance frame.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    s.setPlayhead({ step: 0, t: 0.01 });
    s.sendScrub('in', 0.01);
  });

  // Rendered below the canvas, in the bottom pasteboard, at the preset entrance. Polled
  // rather than slept: the scrub reaches the preview over postMessage.
  const canvas = await canvasBox(page);
  await expect
    .poll(async () => (await elementPoint(page, '.lower-third-box')).y, { timeout: 5000 })
    .toBeGreaterThan(canvas.y + canvas.height);
  const p = await elementPoint(page, '.lower-third-box');
  await page.mouse.click(p.x, p.y);
  const sel = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  expect(sel).toBe('.lower-third-box');
});
