// covers: src/blocks/**, src/components/canvas/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { elementPoint } from './_canvas';

// Canvas position keyframing (the interaction model, amendment 3): with a parked
// playhead, dragging a SELECTED non-root layer on a data-block template writes/updates
// its x and y keyframes at that moment — the drag itself arms, ONE undoable apply per
// gesture, and a multi-selection drags together with each layer keying its own pair.
// The classic gestures survive underneath: with nothing selected, a drag starting on
// the graphic re-anchors the ROOT via the zone patch, and Escape cancels cleanly.

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

async function historyLen(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().history.length;
  });
}

/** An element's center in PAGE coordinates plus the screen→canvas scale. Pad-agnostic: maps
 *  the element's doc-px rect through the overlay origin and derives the scale from the DOM,
 *  so it works whether the pasteboard is on or off (see e2e/_canvas.ts). */
async function centerOf(page: Page, selector: string) {
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator(selector)).toBeVisible();
  return elementPoint(page, selector);
}

/** Select the Name line via its row label and park the playhead mid-Enter. */
async function selectAndPark(page: Page) {
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  // Zoom out so the clip midpoint sits inside the narrowed scroll viewport.
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();
  const clip = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  await page.mouse.click(clip.x + clip.width * 0.5, clip.y + 40);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().playhead?.t ?? -1;
      }),
    )
    .toBeGreaterThan(0.2);
}

test('dragging a selected layer keys x/y at the playhead — the drag itself arms', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  const playheadBefore = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead;
  });
  const before = await historyLen(page);

  // No Inspector arming, no setup: drag the Name line 80 px right and 30 px down.
  const c = await centerOf(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 80, c.y + 30, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  // The drag CREATED both position tracks at the playhead's moment.
  const data = await animData(page);
  const tracks = data!.steps[0].layers['#f0'];
  expect(tracks.x).toHaveLength(1);
  expect(tracks.y).toHaveLength(1);
  expect(Number(tracks.x[0].value)).toBeCloseTo(80 / c.scale, 0);
  expect(Number(tracks.y[0].value)).toBeCloseTo(30 / c.scale, 0);
  expect(Math.abs(tracks.x[0].time - playheadBefore!.t)).toBeLessThan(0.02);

  // ONE undoable apply for the whole gesture; the playhead stayed parked; undo clears both.
  expect(await historyLen(page)).toBe(before + 1);
  const playheadAfter = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead;
  });
  expect(playheadAfter).toEqual(playheadBefore);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const d = await animData(page);
      const t = d!.steps[0].layers['#f0'];
      return (t.x?.length ?? 0) + (t.y?.length ?? 0);
    })
    .toBe(0);
});

test('a multi-selection drags together — every layer keys its own pair, one apply', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f1"]').click({ modifiers: ['Shift'] });
  const before = await historyLen(page);

  const c = await centerOf(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 60, c.y - 20, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  const data = await animData(page);
  for (const key of ['#f0', '#f1']) {
    const tracks = data!.steps[0].layers[key];
    expect(Number(tracks.x[0].value)).toBeCloseTo(60 / c.scale, 0);
    expect(Number(tracks.y[0].value)).toBeCloseTo(-20 / c.scale, 0);
  }
  expect(await historyLen(page)).toBe(before + 1); // the whole group is one undo step
});

test('arrow keys nudge a selected layer — x/y keyframes at the playhead, one apply per burst', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  const playhead = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead;
  });
  const before = await historyLen(page);

  // The same channel the drag writes, key by key: 1 canvas px per press, Shift = 10.
  //
  // The three presses are dispatched in ONE page task on purpose. Coalescing is time-based -
  // the burst commits 450 ms after the LAST press - and three separate driver round-trips are
  // not guaranteed to land inside that window on a saturated machine. A stall between two of
  // them splits one burst into two commits, and the history assertion below then fails for a
  // reason that has nothing to do with the behaviour under test (the final x/y are identical
  // either way, since each burst re-reads its base from the live element). Measured gaps are
  // 2-3 ms idle and up to ~73 ms at eight workers, but a full suite run has exceeded the
  // window. These events drive the same window keydown listener with the same values -
  // verified identical - so the test keeps its subject and drops the timing assumption.
  // Real key DELIVERY is asserted at the end of this test, where no burst timing is involved.
  await page.evaluate(() => {
    const send = (key: string, shiftKey = false) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    send('ArrowRight');
    send('ArrowRight');
    send('ArrowDown', true);
  });

  // The burst commits once the keys go quiet — one undoable apply for all three presses.
  await expect
    .poll(async () => {
      const d = await animData(page);
      return d!.steps[0].layers['#f0']?.x?.length ?? 0;
    })
    .toBe(1);
  const data = await animData(page);
  const tracks = data!.steps[0].layers['#f0'];
  expect(Number(tracks.x[0].value)).toBeCloseTo(2, 0);
  expect(Number(tracks.y[0].value)).toBeCloseTo(10, 0);
  expect(Math.abs(tracks.x[0].time - playhead!.t)).toBeLessThan(0.02);
  expect(await historyLen(page)).toBe(before + 1);

  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const d = await animData(page);
      const t = d!.steps[0].layers['#f0'];
      return (t?.x?.length ?? 0) + (t?.y?.length ?? 0);
    })
    .toBe(0);
});

test('a real arrow key press reaches the nudge handler', async ({ page }) => {
  // The burst test above dispatches its presses in one page task to keep the coalescing
  // window out of the harness's hands, so genuine key delivery is asserted here instead:
  // ONE press is one burst, which needs no timing assumption at all.
  await createHairline(page);
  await selectAndPark(page);
  const before = await historyLen(page);
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => Number((await animData(page))!.steps[0].layers['#f0']?.x?.[0]?.value ?? 0))
    .toBeCloseTo(1, 0);
  expect(await historyLen(page)).toBe(before + 1);
});

test('with nothing selected, the drag still re-anchors the root (zone patch)', async ({ page }) => {
  await createHairline(page);
  const jsBefore = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  const c = await centerOf(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 150, c.y - 120, { steps: 8 });
  await page.mouse.up();
  await awaitPreviewRebuild(page);

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    return { js: s.template.js, cssChanged: !!s.lastChange?.ranges.css };
  });
  expect(after.js).toBe(jsBefore); // no keyframes — the gesture was a root move
  expect(after.cssChanged).toBe(true);
});

test('Escape cancels a layer drag — nothing written, the layers spring back', async ({ page }) => {
  await createHairline(page);
  await selectAndPark(page);
  const before = await historyLen(page);
  const jsBefore = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });

  const c = await centerOf(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 90, c.y + 40, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(400);

  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.js;
  });
  expect(after).toBe(jsBefore);
  expect(await historyLen(page)).toBe(before);
  // The live GSAP preview was reset — the layer's x is back where the drag found it.
  const x = await page
    .frameLocator('iframe.preview-frame')
    .locator('#f0')
    .evaluate((el) => Number((window as unknown as { gsap: { getProperty: (t: Element, p: string) => number } }).gsap.getProperty(el, 'x')));
  expect(Math.abs(x)).toBeLessThan(1);
});
