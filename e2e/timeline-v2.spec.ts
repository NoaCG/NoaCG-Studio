// covers: src/blocks/**, src/templates/**
// covers: src/components/timeline/{StepTimeline.tsx,LegacyTimeline.tsx,Inspector.tsx,PlayoutSimulator.tsx}
// covers: src/components/timeline/MachineGraph.tsx

import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { createProject } from './_create';
import { timelineProgress, timelineState } from './_keys';

// Timeline v2 Phase 3 — the read-first step timeline behind the dock toggle: step clips
// with cue markers on a time ruler, a click/drag playhead that scrubs the real preview
// without creating history, layer rows with aggregate keyframe diamonds, zoom.

async function createHairline(page: Page, steps = false) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline', steps });
  // Lower thirds create AS data blocks — the step timeline is their native surface.
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
}

test('v2: step clips on a ruler with cue markers — steps are the clips', async ({ page }) => {
  await createHairline(page, true); // Hairline + step reveal: Enter · Step 2 · Out
  await expect(page.getByTestId('tlv2-clip-0')).toContainText('▶');
  await expect(page.getByTestId('tlv2-clip-0')).toContainText('Enter');
  await expect(page.getByTestId('tlv2-clip-1')).toContainText('»');
  await expect(page.getByTestId('tlv2-clip-1')).toContainText('Step 2');
  await expect(page.getByTestId('tlv2-clip-2')).toContainText('■');
  await expect(page.getByTestId('tlv2-clip-2')).toContainText('Out');
  // The hold break sits between the last content step and Out.
  const hold = (await page.getByTestId('tlv2-hold').boundingBox())!;
  const step2 = (await page.getByTestId('tlv2-clip-1').boundingBox())!;
  const out = (await page.getByTestId('tlv2-clip-2').boundingBox())!;
  expect(hold.x).toBeGreaterThanOrEqual(step2.x + step2.width - 2);
  expect(out.x).toBeGreaterThanOrEqual(hold.x + hold.width - 2);
  // Layer rows carry aggregate keyframe diamonds (the Name line animates in Enter).
  expect(await page.getByTestId('tlv2-kf-f0').count()).toBeGreaterThanOrEqual(2);
});

test('v2: clicking the timeline moves the playhead and scrubs the preview — no history', async ({ page }) => {
  await createHairline(page);
  const frame = page.frameLocator('iframe.preview-frame');
  const historyLen = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().history.length;
    });
  const before = await historyLen();
  // Click at the very start of the entrance clip: the graphic parks near its FROM state.
  const clip = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  await page.mouse.click(clip.x + 2, clip.y + 40); // inside the rows area under the clip
  await expect
    .poll(async () => frame.locator('#f0').evaluate((el) => getComputedStyle(el).transform))
    .not.toBe('none'); // the mask offset (yPercent 110) is applied — mid-scrub truth
  // …and the playhead followed the click.
  const head = (await page.getByTestId('tlv2-playhead').boundingBox())!;
  expect(Math.abs(head.x - (clip.x + 2))).toBeLessThan(6);
  // Scrubbing and playhead moves never write history.
  expect(await historyLen()).toBe(before);
  await expect(page.getByTestId('tlv2-time')).toContainText('s');
});

test('v2: zoom scales the clips; row labels drive the shared selection', async ({ page }) => {
  await createHairline(page);
  const width = async () => (await page.getByTestId('tlv2-canvas').boundingBox())!.width;
  const before = await width();
  await page.getByTestId('tlv2-zoom-in').click();
  await page.getByTestId('tlv2-zoom-in').click();
  expect(await width()).toBeGreaterThan(before * 1.4);
  // The label column is the same shared-selection handle as the classic strip.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toHaveClass(/selected/);
  const selected = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  expect(selected).toBe('#f0');
});

/** Parse the live template's animation data in the page (null when not a data block). */
async function animData(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
}

test('v2 keyframes: convert, arm at the playhead, auto-key, interpolate — the ratified workflow', async ({ page }) => {
  await createHairline(page);
  // "use keyframes" rewrites the region as the data block + interpreter — one undoable apply.
  let data = await animData(page);
  expect(data).not.toBeNull();
  expect(data!.steps[0].name).toBe('Enter');
  // The chips are gone — a data template's editing surface IS the step timeline.
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);

  // Open the Inspector, select the Name line, park the playhead early in Enter.
  // The Inspector is open by default in the right dock — no toggle needed.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  // Zoom out so the WHOLE Enter clip fits the narrowed scroll viewport (Inspector open,
  // editing-scale labels) — later clicks at 70% must land on the ribbon, not past its edge.
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();
  const clip = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  await page.mouse.click(clip.x + 8, clip.y + 40);

  // Arm Position X: ◇ stamps the first keyframe at the playhead with the current value.
  await page.getByTestId('inspector-kf-x').click();
  await page.waitForTimeout(300);
  data = await animData(page);
  const track1 = data!.steps[0].layers['#f0'].x;
  expect(track1).toHaveLength(1);

  // Move the playhead later (70% into the clip — the tail can sit past the scroll edge
  // when the Inspector narrows the column), then change the ARMED value: auto-key
  // creates a second keyframe at the new playhead. Park via the RULER band: a rows
  // click at this x would land on the Panel track's settle diamond and select it.
  await page.mouse.click(clip.x + clip.width * 0.7, clip.y - 10);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().playhead?.t ?? -1;
      }),
    )
    .toBeGreaterThan(0.4);
  await page.getByTestId('inspector-input-x').fill('-50');
  await page.getByTestId('inspector-input-x').press('Enter');
  await page.waitForTimeout(700);
  data = await animData(page);
  const track2 = data!.steps[0].layers['#f0'].x;
  expect(track2).toHaveLength(2);
  expect(track2.some((k: { value: number | string }) => k.value === -50)).toBe(true);
  // The re-parked preview shows the interpolated truth at the playhead: the matrix's
  // translate-x sits at (or a scrub-float hair before) the keyed -50.
  await expect
    .poll(
      async () =>
        page
          .frameLocator('iframe.preview-frame')
          .locator('#f0')
          .evaluate((el) => Number(getComputedStyle(el).transform.match(/-?[\d.]+/g)?.[4] ?? 0)),
      { timeout: 4000 },
    )
    .toBeLessThan(-40);
});

test('v2 keyframes: dragging a diamond retimes it; Delete removes it; undo restores', async ({ page }) => {
  await createHairline(page);
  const times = async () => {
    const data = await animData(page);
    return data!.steps[0].layers['#f0'].yPercent.map((k: { time: number }) => k.time);
  };
  const before = await times();
  expect(before).toHaveLength(2);

  // Drag the SECOND Enter diamond (the settle keyframe) further right.
  const diamond = page.getByTestId('tlv2-kf-f0').nth(1);
  const bb = (await diamond.boundingBox())!;
  await page.mouse.move(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + bb.width / 2 + 45, bb.y + bb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const after = await times();
  expect(after[1]).toBeGreaterThan(before[1]);

  // Undo restores the original timing (one apply per drag).
  await page.keyboard.press('Control+z');
  expect(await times()).toEqual(before);

  // Click a diamond (no drag) to select it, Delete removes every keyframe at that moment.
  await page.getByTestId('tlv2-kf-f0').first().click();
  await page.keyboard.press('Delete');
  await page.waitForTimeout(400);
  expect(await times()).toHaveLength(1);
  await page.keyboard.press('Control+z');
  expect(await times()).toEqual(before);
});

test('v2 presets: In and Out apply independently; applying a preset cleanly swaps the targeted motion', async ({ page }) => {
  test.setTimeout(60_000);
  await createHairline(page);
  // The Inspector is open by default in the right dock — no toggle needed.

  // Give #f0 a MANUAL rotation keyframe. Ratified interaction model: applying a preset is a
  // CLEAN SWAP of the targeted layer's motion in that direction, so this rotation is replaced
  // by the preset's #f0 entrance (it does not blend or survive).
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await page.getByTestId('inspector-kf-rotation').click();
  await page.waitForTimeout(400);

  // Select the WHOLE GRAPHIC and apply Pop spring to the In only.
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSelectedPart('.lower-third');
  });
  await page.getByTestId('inspector').getByRole('button', { name: 'Animations' }).click();
  await page.getByTestId('inspector-preset-select').selectOption('pop-spring');
  await page.getByTestId('inspector-preset-in').click();
  await page.getByTestId('inspector-preset-apply').click();
  await awaitPreviewRebuild(page);
  let data = await animData(page);
  // Pop spring's entrance landed (the box scales in)…
  expect(Object.keys(data!.steps[0].layers['.lower-third-box'])).toContain('scale');
  // …the exit is untouched (line-reveal's yPercent drop, no scale)…
  expect(data!.steps[1].layers['.lower-third-box']?.scale).toBeUndefined();
  // …and #f0's motion is now the preset's entrance — the manual rotation was cleanly swapped out.
  expect(data!.steps[0].layers['#f0'].rotation).toBeUndefined();
  expect(Object.keys(data!.steps[0].layers['#f0']).length).toBeGreaterThan(0);

  // Apply Blur to the Out only — the In keeps Pop spring.
  await page.getByTestId('inspector-preset-select').selectOption('blur-in');
  await page.getByTestId('inspector-preset-out').click();
  await page.getByTestId('inspector-preset-apply').click();
  await awaitPreviewRebuild(page);
  data = await animData(page);
  expect(Object.keys(data!.steps[1].layers['.lower-third-box'])).toContain('filter'); // blur exit
  expect(Object.keys(data!.steps[0].layers['.lower-third-box'])).toContain('scale'); // pop entrance kept
  expect(data!.steps[0].layers['.lower-third-box'].filter).toBeUndefined(); // no blur leak into In
});

test('v2 presets: a single layer takes a preset into ITS activation step (In is layer-relative)', async ({ page }) => {
  await createHairline(page, true); // #f1 reveals on press 1 (step index 1)
  // The Inspector is open by default in the right dock — no toggle needed.
  // Select the revealed Title line and apply a preset to its In.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f1"]').click();
  await page.getByTestId('inspector').getByRole('button', { name: 'Animations' }).click();
  await page.getByTestId('inspector-preset-select').selectOption('blur-in');
  await page.getByTestId('inspector-preset-in').click();
  await page.getByTestId('inspector-preset-apply').click();
  await awaitPreviewRebuild(page);
  const data = await animData(page);
  // Blur-in's LINE choreography (a y + opacity rise — the blur filter is the box's move)
  // landed in STEP 2, the layer's reveal step — not the entrance. The layer still reveals
  // there, but its entrance motion is now the preset's: a clean swap replaces the reveal
  // channel's default mask (yPercent) with blur-in's y + opacity rise.
  expect(data!.steps[1].reveals).toContain('#f1');
  expect(Object.keys(data!.steps[1].layers['#f1'])).toEqual(
    expect.arrayContaining(['y', 'opacity']),
  );
  expect(data!.steps[1].layers['#f1']?.yPercent).toBeUndefined();
  expect(data!.steps[0].layers['#f1']?.y).toBeUndefined();
  expect(data!.steps[0].layers['#f1']?.opacity).toBeUndefined();
});

test('v2: the canvas chip moves a layer between presses on a data template', async ({ page }) => {
  await createHairline(page, true);
  // Select the revealed line, then send it back to ▶ Play via the chip's appears-on menu
  // (the same changePartPress contract, now routed through the data mutator).
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setSelectedPart('#f1');
  });
  const appears = page.getByTestId('canvas-appears');
  await expect(appears).toBeVisible();
  await appears.selectOption('-1');
  await awaitPreviewRebuild(page);
  const data = await animData(page);
  // Back with ▶ Play: the press is gone, the entrance animates the line again, and the
  // SPX definition follows the shorter chain.
  expect(data!.steps).toHaveLength(2);
  expect(Object.keys(data!.steps[0].layers)).toContain('#f1');
  const steps = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.settings.steps;
  });
  expect(steps).toBe('1');
});

test('v2 clips: right-edge resize preserves keyframe timing; Alt-drag stretches it', async ({ page }) => {
  await createHairline(page);
  const enter = async () => {
    const data = await animData(page);
    return {
      duration: data!.steps[0].duration,
      times: data!.steps[0].layers['#f0'].yPercent.map((k: { time: number }) => k.time),
    };
  };
  const before = await enter();

  // Default drag: the step gets LONGER, keyframes stay put (settled air at the end).
  const handle = page.getByTestId('tlv2-clip-handle-0');
  let bb = (await handle.boundingBox())!;
  await page.mouse.move(bb.x + 3, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + 3 + 60, bb.y + bb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const extended = await enter();
  expect(extended.duration).toBeGreaterThan(before.duration);
  expect(extended.times).toEqual(before.times);

  // Shrinking clamps at the step's LAST keyframe across every layer — motion never
  // silently truncates (Hairline's second line settles later than the first).
  const lastKf = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(useTemplateStore.getState().template.js)!;
    let last = 0;
    for (const tracks of Object.values(d.steps[0].layers))
      for (const kfs of Object.values(tracks as Record<string, { time: number }[]>))
        for (const kf of kfs) last = Math.max(last, kf.time);
    return last;
  });
  bb = (await page.getByTestId('tlv2-clip-handle-0').boundingBox())!;
  await page.mouse.move(bb.x + 3, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + 3 - 500, bb.y + bb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(400);
  const clamped = await enter();
  expect(clamped.duration).toBeCloseTo(lastKf, 2);

  // Alt-drag stretches: duration AND keyframe times scale together.
  bb = (await page.getByTestId('tlv2-clip-handle-0').boundingBox())!;
  await page.keyboard.down('Alt');
  await page.mouse.move(bb.x + 3, bb.y + bb.height / 2);
  await page.mouse.down();
  await page.mouse.move(bb.x + 3 + 80, bb.y + bb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  await page.waitForTimeout(400);
  const stretched = await enter();
  expect(stretched.duration).toBeGreaterThan(clamped.duration);
  expect(Math.max(...stretched.times)).toBeGreaterThan(Math.max(...clamped.times));
});

test('v2 clips: context menu duplicates, renames, deletes; the definition follows', async ({ page }) => {
  test.setTimeout(60_000);
  await createHairline(page, true); // Enter · Step 2 (reveals #f1) · Out
  const stepsSetting = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().template.settings.steps;
    });
  expect(await stepsSetting()).toBe('2');

  // Duplicate the reveal step: its keyframes copy, its reveals do NOT (a layer activates
  // once), and the SPX steps count follows the longer chain.
  await page.getByTestId('tlv2-clip-1').click({ button: 'right' });
  await page.getByTestId('tlv2-menu-duplicate').click();
  await page.waitForTimeout(400);
  let data = await animData(page);
  expect(data!.steps).toHaveLength(4);
  expect(Object.keys(data!.steps[2].layers)).toContain('#f1'); // copied keyframes
  expect(data!.steps[2].reveals ?? []).toHaveLength(0); // reveals cleared
  expect(await stepsSetting()).toBe('3');

  // Rename the duplicate.
  await page.getByTestId('tlv2-clip-2').click({ button: 'right' });
  await page.getByTestId('tlv2-menu-rename').click();
  await page.getByTestId('tlv2-rename-input').fill('Answer B');
  await page.getByTestId('tlv2-rename-input').press('Enter');
  await page.waitForTimeout(400);
  await expect(page.getByTestId('tlv2-clip-2')).toContainText('Answer B');

  // Delete the ORIGINAL reveal press: #f1 returns to ▶ Play with an entrance of its own.
  await page.getByTestId('tlv2-clip-1').click({ button: 'right' });
  await page.getByTestId('tlv2-menu-delete').click();
  await page.waitForTimeout(400);
  data = await animData(page);
  expect(data!.steps).toHaveLength(3);
  expect(Object.keys(data!.steps[0].layers)).toContain('#f1');
  expect(await stepsSetting()).toBe('2');

  // Undo restores the deleted press (structural edits are one apply each).
  await page.keyboard.press('Control+z');
  data = await animData(page);
  expect(data!.steps).toHaveLength(4);
});

test('v2 clips: »+ adds an authoring step; the hold popover edits how the graphic leaves', async ({ page }) => {
  await createHairline(page);

  // »+ adds an empty content step before Out (an authoring target), definition synced.
  await page.getByTestId('tlv2-add-step').click();
  await page.waitForTimeout(400);
  const data = await animData(page);
  expect(data!.steps).toHaveLength(3);
  expect(data!.steps[1].name).toBe('Step 2');
  await expect(page.getByTestId('tlv2-clip-1')).toContainText('Step 2');

  // The hold popover writes the SPX out setting; auto-out widens the hold to real time.
  const holdBefore = (await page.getByTestId('tlv2-hold').boundingBox())!;
  await page.getByTestId('tlv2-hold').click();
  await page.getByTestId('tlv2-out-mode').selectOption('auto');
  await page.waitForTimeout(500);
  const out = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.settings.out;
  });
  expect(out).toBe('5000');
  const holdAfter = (await page.getByTestId('tlv2-hold').boundingBox())!;
  expect(holdAfter.width).toBeGreaterThan(holdBefore.width + 40);
});

test('v2: Space plays; arrows nudge the selected keyframe on the grid', async ({ page }) => {
  await createHairline(page);
  // Space = ▶ Play (never while typing): the simulator owns a fresh running timeline.
  await page.keyboard.press(' ');
  await expect.poll(() => timelineState(page)).not.toBe('none');
  // Select a diamond and nudge it right one grid step (0.05 s).
  const times = async () => {
    const data = await animData(page);
    return data!.steps[0].layers['#f0'].yPercent.map((k: { time: number }) => k.time);
  };
  const before = await times();
  await page.getByTestId('tlv2-kf-f0').first().click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(400);
  const after = await times();
  expect(Math.min(...after)).toBeCloseTo(Math.min(...before) + 0.05, 2);

  // …and the CANVAS nudge stood down. Clicking a diamond usually leaves its layer selected
  // too, so both arrow handlers are armed at once and only one may act — asserting the
  // keyframe moved says nothing about whether the layer ALSO got x/y keyframes written at the
  // playhead, which is exactly the shape of bug this handshake exists to prevent.
  const layer = (await animData(page))!.steps[0].layers['#f0'];
  expect(layer.x).toBeUndefined();
  expect(layer.y).toBeUndefined();
});

test('v2: a finished run reports itself FINISHED — the strip returns to idle', async ({ page }) => {
  await createHairline(page);
  // The document pushes its playhead every frame (composeDocument's `simulate` script), and that
  // push is the only thing the strip's live-follow believes. `__activeTl` used to be released
  // solely by the NEXT play or stop, so an entrance that had ended kept pushing active=true
  // forever: measured 2026-08-27, still `active=true phase=in t=1.34 dur=1.34` four seconds
  // after a 1.34 s entrance. Everything downstream of that push was then stuck - the strip never
  // came back to idle, and the branch that parks the playhead at the settled entrance end was
  // dead after the first play.
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect.poll(() => timelineState(page), { timeout: 4000 }).not.toBe('none');
  await expect.poll(() => timelineState(page), { timeout: 8000 }).toBe('none');

  // …and releasing the run is NOT the same as tearing it down: the graphic keeps the pose the
  // entrance left it in. A release implemented as a kill-and-reset would pass the idle assertion
  // above and leave the canvas blank, which is the more expensive bug of the two.
  const root = page.frameLocator('iframe.preview-frame').locator('body > div').first();
  await expect(root).toBeVisible();
  expect(await root.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeGreaterThan(0.9);

  // The EXIT releases itself too - and releasing it must not let the design view settle the
  // graphic back on. The settle is guarded by "is anything running", so a run that now ends is a
  // guard that now opens: if anything re-settled after a Stop, a graphic the operator took off
  // air would quietly come back on the canvas, which is a worse fault than the one being fixed.
  await page.getByRole('button', { name: '■ Stop' }).click();
  // WAIT FOR THE EXIT TO START before waiting for it to end. Idle is the state on BOTH sides of a
  // run, so polling straight for 'none' answers instantly from the idle that preceded the click -
  // measured: the assertion below then read opacity 1 on a graphic that was mid-exit and perfectly
  // healthy. The entrance half above has the same two-step for the same reason.
  await expect.poll(() => timelineState(page), { timeout: 4000 }).not.toBe('none');
  await expect.poll(() => timelineState(page), { timeout: 8000 }).toBe('none');
  await page.waitForTimeout(400); // slack AFTER the settled state, where a stray settle would land
  expect(await root.evaluate((el) => Number(getComputedStyle(el).opacity))).toBeLessThan(0.1);
});

test('v2 polish: the playhead cap drags; the view follows playback when zoomed in', async ({ page }) => {
  await createHairline(page);
  // Zoom far in so the ribbon outgrows its viewport, then Play: the scroll follows.
  for (let i = 0; i < 6; i++) await page.getByTestId('tlv2-zoom-in').click();
  const scrollLeft = () => page.locator('.tlv2-scroll').evaluate((el) => el.scrollLeft);
  expect(await scrollLeft()).toBe(0);
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect.poll(scrollLeft, { timeout: 4000 }).toBeGreaterThan(50);

  // The cap is a real grab handle: dragging it scrubs (and never writes history).
  const historyLen = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().history.length;
    });
  const before = await historyLen();
  const cap = (await page.getByTestId('tlv2-playhead-cap').boundingBox())!;
  await page.mouse.move(cap.x + cap.width / 2, cap.y + 4);
  await page.mouse.down();
  await page.mouse.move(cap.x + cap.width / 2 - 80, cap.y + 4, { steps: 6 });
  await page.mouse.up();
  const parked = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead;
  });
  expect(parked).not.toBeNull();
  expect(await historyLen()).toBe(before);
});

test('v2 polish: keyframe and step eases from the menus; ◀ ▶ jumps; label scrubbing', async ({ page }) => {
  test.setTimeout(60_000);
  await createHairline(page);
  // The Inspector is open by default in the right dock — no toggle needed.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();

  // Right-clicking a diamond opens its ease menu — the curve INTO that keyframe.
  await page.getByTestId('tlv2-kf-f0').first().click({ button: 'right' });
  await page.getByTestId('tlv2-kf-ease').selectOption('back.out(1.6)');
  await page.waitForTimeout(400);
  let data = await animData(page);
  const eased = data!.steps[0].layers['#f0'].yPercent.find((k: { ease?: string }) => k.ease === 'back.out(1.6)');
  expect(eased).toBeTruthy();

  // The clip menu carries the step's DEFAULT ease.
  await page.getByTestId('tlv2-clip-0').click({ button: 'right' });
  await page.getByTestId('tlv2-menu-ease').selectOption('power2.out');
  await page.waitForTimeout(400);
  data = await animData(page);
  expect(data!.steps[0].ease).toBe('power2.out');

  // ◀ jumps the playhead to the property's previous keyframe.
  const clip = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  await page.mouse.click(clip.x + clip.width * 0.65, clip.y - 10); // park mid-step via the ruler — the rows carry a Panel diamond near this x
  await page.getByTestId('inspector-prev-yPercent').click();
  const speed = data!.speed || 1;
  const kfTimes = data!.steps[0].layers['#f0'].yPercent.map((k: { time: number }) => k.time / speed);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().playhead?.t ?? -1;
      }),
    )
    .toBeCloseTo(Math.max(...kfTimes.filter((t: number) => t < 0.6)), 1);

  // Dragging the LABEL scrubs the armed value and keys it at the playhead on release.
  const label = page.locator('.inspector-row-label.scrubbable', { hasText: 'Y (mask %)' });
  const lb = (await label.boundingBox())!;
  await page.mouse.move(lb.x + 10, lb.y + lb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lb.x + 10 + 40, lb.y + lb.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(500);
  data = await animData(page);
  const values = data!.steps[0].layers['#f0'].yPercent.map((k: { value: number | string }) => k.value);
  expect(values.some((v: number | string) => v === 40 || v === 150)).toBe(true); // 0+40 or 110+40
});

test('v2 layer blocks: the existence span renders; its left edge drags the activation', async ({ page }) => {
  await createHairline(page, true); // Enter · Step 2 (reveals the Title) · Out
  // The Name exists from ▶ Play: its block starts at the ribbon origin.
  const b0 = (await page.getByTestId('tlv2-block-f0').boundingBox())!;
  const clip0 = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  expect(Math.abs(b0.x - clip0.x)).toBeLessThan(4);
  // The Title appears on the press: its block starts where Step 2 starts.
  const b1 = (await page.getByTestId('tlv2-block-f1').boundingBox())!;
  const clip1 = (await page.getByTestId('tlv2-clip-1').boundingBox())!;
  expect(Math.abs(b1.x - clip1.x)).toBeLessThan(4);

  // Drag the Title block's edge to the ribbon origin: it now appears with ▶ Play, and
  // the emptied press disappears — the same activation move the canvas chip makes.
  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().history.length;
  });
  const edge = (await page.getByTestId('tlv2-block-edge-f1').boundingBox())!;
  await page.mouse.move(edge.x + 3, edge.y + edge.height / 2);
  await page.mouse.down();
  await page.mouse.move(clip0.x + 2, edge.y + edge.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  const data = await animData(page);
  expect(data!.steps).toHaveLength(2);
  expect(Object.keys(data!.steps[0].layers)).toContain('#f1');
  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().history.length;
  });
  expect(after).toBe(before + 1); // one undoable apply, same as the chip
});

test('v2 layer blocks: the right edge sets an early exit (hides) and upgrades the interpreter', async ({ page }) => {
  await createHairline(page, true); // Enter · Step 2 · Out (3 steps)
  // Fit the whole ribbon so the Name's right-edge handle (at Out) is reachable, not clipped.
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();
  // The Name exists from ▶ Play through Out — drag its right edge (the early-exit handle)
  // left onto the middle step so the layer LEAVES in Step 2.
  const handle = page.getByTestId('tlv2-block-hide-f0');
  await expect(handle).toBeVisible();
  const clip1 = (await page.getByTestId('tlv2-clip-1').boundingBox())!; // the middle step (Step 2)
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(clip1.x + clip1.width / 2, box.y + box.height / 2, { steps: 10 });
  await page.mouse.move(clip1.x + clip1.width - 2, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(700);

  // The middle step records the early exit…
  const data = await animData(page);
  expect(data!.steps[1].hides).toContain('#f0');
  // …and the interpreter was re-emitted so the exit actually plays on air.
  const js = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js);
  expect(js).toContain('step.hides');
});

test('v2 keyframe sets: shift-click, group nudge, delete, copy/paste at the playhead', async ({ page }) => {
  await createHairline(page);
  // Open the Inspector up front so the auto-open never resizes the stage mid-test.
  // The Inspector is open by default in the right dock — no toggle needed.
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();

  const times = async () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const d = parseAnimData(useTemplateStore.getState().template.js)!;
      return (d.steps[0].layers['#f0']?.yPercent ?? []).map((k: { time: number }) => k.time);
    });
  const original = await times();
  expect(original).toHaveLength(2);

  // Build the set: click the first diamond, shift-click the second.
  const kfs = page.getByTestId('tlv2-kf-f0');
  await kfs.first().click();
  await kfs.nth(1).click({ modifiers: ['Shift'] });

  // ← → nudge the WHOLE set together, one undoable apply.
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(700);
  let now = await times();
  expect(now[0]).toBeCloseTo(original[0] + 0.05, 2);
  expect(now[1]).toBeCloseTo(original[1] + 0.05, 2);

  // Copy the set, then Delete removes BOTH moments in one apply.
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Delete');
  await page.waitForTimeout(700);
  expect(await times()).toHaveLength(0);

  // Park the playhead near the entrance start and paste: the group lands with its
  // earliest keyframe at the playhead, internal spacing preserved.
  const clip = (await page.getByTestId('tlv2-clip-0').boundingBox())!;
  await page.mouse.click(clip.x + 8, clip.y + 40);
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().playhead?.t ?? -1;
      }),
    )
    .toBeGreaterThanOrEqual(0);
  const playhead = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().playhead!;
  });
  await page.keyboard.press('Control+v');
  await page.waitForTimeout(700);
  now = await times();
  expect(now).toHaveLength(2);
  expect(now[0]).toBeCloseTo(playhead.t, 1);
  expect(now[1] - now[0]).toBeCloseTo(original[1] - original[0], 2);
});

test('v2 keyframe lasso: a marquee over the rows selects diamonds; Ctrl/Cmd+D duplicates them', async ({ page }) => {
  await createHairline(page);
  // The Inspector is open by default in the right dock — no toggle needed.
  await page.getByTestId('tlv2-zoom-out').click();
  await page.getByTestId('tlv2-zoom-out').click();

  const canvas = (await page.getByTestId('tlv2-canvas').boundingBox())!;
  // The #f0 diamonds, screen-space centres, left-to-right.
  const boxes = (
    await page.getByTestId('tlv2-kf-f0').evaluateAll((els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }),
    )
  ).sort((a, b) => a.x - b.x);
  expect(boxes.length).toBeGreaterThanOrEqual(2);
  // The widest gap is the hold between the entrance and the out keyframes; box the entrance
  // group (everything left of the gap) with an amber marquee.
  let gapIdx = 1;
  let gap = -1;
  for (let i = 1; i < boxes.length; i++) {
    if (boxes[i].x - boxes[i - 1].x > gap) {
      gap = boxes[i].x - boxes[i - 1].x;
      gapIdx = i;
    }
  }
  const rowY = boxes[0].y;
  const rightBound = (boxes[gapIdx - 1].x + boxes[gapIdx].x) / 2; // inside the empty hold gap

  await page.mouse.move(rightBound, rowY - 6);
  await page.mouse.down(); // starts on empty space, so the canvas lassos rather than scrubs
  await page.mouse.move((rightBound + canvas.x) / 2, rowY, { steps: 6 });
  await page.mouse.move(canvas.x + 3, rowY + 6, { steps: 6 });
  await page.mouse.up();

  // The marquee selected the entrance diamonds (gapIdx of them) — the same amber highlight
  // a canvas lasso gives.
  const selected = await page.locator('[data-testid="tlv2-kf-f0"].selected').count();
  expect(selected).toBe(gapIdx);

  // Ctrl/Cmd+D duplicates the selected set — new diamonds appear on the row.
  const before = await page.getByTestId('tlv2-kf-f0').count();
  await page.keyboard.press('Control+d');
  await page.waitForTimeout(700);
  expect(await page.getByTestId('tlv2-kf-f0').count()).toBeGreaterThan(before);
});

test('v2 property rows: a layer expands into per-property sub-rows with their own diamonds', async ({ page }) => {
  await createHairline(page);
  // The Name line animates yPercent — its caret expands one sub-row for that track.
  await page.getByTestId('tlv2-expand-f0').click();
  const propRow = page.locator('[data-proprow="#f0::yPercent"]');
  await expect(propRow).toBeVisible();
  await expect(propRow).toHaveText('Y (mask %)');
  // The sub-row carries the track's own diamonds (two keyframes in Enter).
  const propKfs = page.getByTestId('tlv2-kf-f0-yPercent');
  expect(await propKfs.count()).toBeGreaterThanOrEqual(2);

  // Dragging a sub-row diamond retimes ONLY that property's keyframe.
  const times = async () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const d = parseAnimData(useTemplateStore.getState().template.js)!;
      return d.steps[0].layers['#f0'].yPercent.map((k: { time: number }) => k.time);
    });
  const before = await times();
  const kf = (await propKfs.first().boundingBox())!;
  await page.mouse.move(kf.x + kf.width / 2, kf.y + kf.height / 2);
  await page.mouse.down();
  await page.mouse.move(kf.x + kf.width / 2 + 40, kf.y + kf.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  const after = await times();
  expect(after[0]).toBeGreaterThan(before[0]);
  expect(after[1]).toBe(before[1]); // the other keyframe of the SAME track held

  // Collapse hides the sub-rows again.
  await page.getByTestId('tlv2-expand-f0').click();
  await expect(propRow).toHaveCount(0);
});

test('v2: corner bugs create as data blocks — the step timeline is their native surface', async ({ page }) => {
  await createProject(page, { category: 'Bugs & corner logos', name: 'Glass Mark' });
  // The step timeline outright — no classic strip, no convert chips.
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);
  // A bug is a two-step playout: Enter on ▶, Out on ■ (bugs don't step by default).
  let data = await animData(page);
  expect(data!.steps).toHaveLength(2);
  // »+ still offers an authoring press (the v2 model is generic — a press that reveals
  // nothing until the user assigns something is the user's call); the SPX steps setting
  // stays derived from the data.
  await page.getByTestId('tlv2-add-step').click();
  await awaitPreviewRebuild(page);
  data = await animData(page);
  expect(data!.steps).toHaveLength(3);
  const steps = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.settings.steps;
  });
  expect(steps).toBe('2');
});

test('v2: scoreboards create as data blocks — the score pop keeps working around the region', async ({ page }) => {
  await createProject(page, { category: 'Scoreboards', name: 'Match Strip' });
  // The step timeline outright; scoreboards never step (Enter + Out only).
  await expect(page.getByTestId('timeline-v2')).toBeVisible();
  await expect(page.getByTestId('timeline-v2-convert')).toHaveCount(0);
  const data = await animData(page);
  expect(data!.steps).toHaveLength(2);
  // The scoreboard-owned runtime OUTSIDE the region survived the conversion verbatim.
  // Drive the REAL SPX contract (the editor's simulator owns the builders directly and
  // never sets onAir): play(), then update() with a changed score — the pop scales the
  // mask up briefly, exactly as before the flip.
  const frame = page.frameLocator('iframe.preview-frame');
  await frame.locator('body').evaluate(() => (window as unknown as { play: () => void }).play());
  await expect
    .poll(async () => frame.locator('.scoreboard').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
  // The pop is a 0.4 s spring from 1.35 back to 1, so polling for it from OUTSIDE the page is
  // a race: one slow round-trip and the sampling starts after it is over, reading a settled 1
  // forever. Sample from inside the page instead and report the PEAK - the assertion then
  // means "the score popped" rather than "the runner happened to look in time".
  const peakScale = await frame.locator('body').evaluate(async () => {
    const el = document.getElementById('f1')!.parentElement!;
    const read = () => {
      const m = getComputedStyle(el).transform.match(/matrix\(([\d.]+)/);
      return m ? Number(m[1]) : 1;
    };
    (window as unknown as { update: (d: string) => void }).update(JSON.stringify({ f1: '7' }));
    let peak = read();
    for (let i = 0; i < 60; i++) {
      peak = Math.max(peak, read());
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    return peak;
  });
  expect(peakScale).toBeGreaterThan(1.05);
});


// ── Read-only, code-owned motion on the timeline ──
// Three things in the animation data are NOT keyframes you can grab: a `loops` repeat (a
// property of a TRACK, not a moment on it), a §3b `calls` lifecycle hook (a side effect with no
// duration), and a `dynamics` measured segment (a builder that reads the DOM — pinned in
// e2e/anim-engine.spec.ts). Each is SURFACED, so the timeline never silently hides motion, and
// each is READ-ONLY, so it never implies an affordance it doesn't have. Starting Soon carries
// both a loop and lifecycle calls.

test('v2 read-only glyphs: a looping track shows a repeat tail, and lifecycle calls get their own row', async ({ page }) => {
  // Named, not just the category: the holding tile now carries static boards too (hold-still),
  // and this test is about the ENDLESS yoyo, so it has to pick a design that actually loops.
  await createProject(page, { category: 'Holding', name: 'Quiet Hold' });
  await expect(page.getByTestId('timeline-v2')).toBeVisible();

  // The ambient breath is an endless yoyo — the tail says so, and carries no diamonds.
  const loop = page.getByTestId('tlv2-loop-starting-soon-pulse');
  await expect(loop).toBeVisible();
  await expect(loop).toContainText('↻∞');
  await expect(loop).toContainText('⇄');
  await expect(loop.locator('.tlv2-diamond')).toHaveCount(0);

  // The countdown's lifecycle calls sit on their own row, named, one per firing moment.
  await expect(page.getByTestId('tlv2-call-startClock')).toContainText('startClock()');
  await expect(page.getByTestId('tlv2-call-stopClock')).toContainText('stopClock()');
  await expect(page.locator('.tlv2-call .tlv2-diamond')).toHaveCount(0);

  // The tail begins at the looping track's LAST keyframe — it annotates the pass, it doesn't
  // invent one — and it runs to the end of the drawn timeline, because it never stops.
  const geometry = await page.evaluate(() => {
    const bar = document.querySelector('[data-testid="tlv2-loop-starting-soon-pulse"]')!.getBoundingClientRect();
    const canvas = document.querySelector('.tlv2-canvas')!.getBoundingClientRect();
    const diamonds = [...document.querySelectorAll('[data-testid="tlv2-kf-starting-soon-pulse"]')].map(
      (d) => d.getBoundingClientRect().x + d.getBoundingClientRect().width / 2,
    );
    return {
      startsAtLastKeyframe: Math.abs(bar.x - Math.max(...diamonds)) <= 2,
      reachesTheEnd: Math.abs(bar.x + bar.width - (canvas.x + canvas.width)) <= 6,
      staysInsideTheCanvas: bar.x + bar.width <= canvas.x + canvas.width + 1,
    };
  });
  expect(geometry).toEqual({ startsAtLastKeyframe: true, reachesTheEnd: true, staysInsideTheCanvas: true });
});

test('v2 read-only glyphs: a finite repeat ends where it really ends, and is capped when it fits', async ({ page }) => {
  await createHairline(page);
  // Author a two-pass loop that finishes well inside a long step. The tail must CLOSE with a
  // cap exactly at the loop's true end — which is the point of deriving it from the data
  // instead of guessing a width. (Endless loops run off the end; covered above.)
  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const store = useTemplateStore.getState();
    const tpl = store.template;
    const d = parseAnimData(tpl.js)!;
    const step = d.steps[0];
    step.duration = 6;
    step.layers['#f0'] = { scale: [{ time: 0, value: 1 }, { time: 1, value: 1.1 }] };
    step.loops = { '#f0': { scale: { repeat: 1, repeatDelay: 0.5 } } };
    store.applyTemplate({ ...tpl, js: spliceAnimData(tpl.js, d)! }, { resetSampleData: true });
    await new Promise((r) => setTimeout(r, 900));

    const bar = document.querySelector('[data-testid="tlv2-loop-f0"]') as HTMLElement | null;
    if (!bar) return { missing: true };
    const clip = document.querySelector('[data-testid="tlv2-clip-0"]')!.getBoundingClientRect();
    const b = bar.getBoundingClientRect();
    const pxPerSec = clip.width / 6; // the step spans 6s at speed 1
    // GSAP: repeat 1 = one EXTRA pass. pass = 1s, delay = 0.5s → the loop ends at 1 + 1.5 = 2.5s.
    const expectedEnd = clip.x + 2.5 * pxPerSec;
    return {
      label: bar.textContent,
      capped: !bar.classList.contains('endless'),
      endsAtTheLoopsTrueEnd: Math.abs(b.x + b.width - expectedEnd) <= 2,
    };
  });
  expect(result).toEqual({ label: '↻×2', capped: true, endsAtTheLoopsTrueEnd: true });
});

test('v2: the quiz Continue is a real step — its reveal is a lifecycle call, and the SPX steps setting is derived', async ({ page }) => {
  await createProject(page, { category: 'quiz' });

  // Quiz creates as a data block: the step timeline, not the classic strip.
  await expect(page.getByTestId('timeline-v2')).toBeVisible();

  // The operator's Continue IS the middle step. Its content is a lifecycle call, because
  // WHICH row lights up comes from the operator's f5 at play time and cannot be keyframed.
  await expect(page.getByTestId('tlv2-clip-1')).toContainText('»');
  await expect(page.getByTestId('tlv2-clip-1')).toContainText('Reveal');
  await expect(page.getByTestId('tlv2-call-revealAnswer')).toContainText('revealAnswer()');

  // The four answers each have their own identity and their own start time — the entrance
  // walks them in, which is a stagger, which the model can only hold as per-row keyframes.
  const starts = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(useTemplateStore.getState().template.js)!;
    return [1, 2, 3, 4].map((n) => d.steps[0].layers[`.quiz-option-${n}`].x[0].time);
  });
  expect(starts).toEqual([0.6, 0.7, 0.8, 0.9]);

  // The regression this migration exists to prevent: SPX's `steps` is DERIVED from the data
  // (three steps → one Continue press between Play and Stop → steps '2'), so an ordinary
  // timeline edit must leave it alone. While the reveal lived only in next(), the data held
  // two steps, and the first edit rewrote `steps` to '1' — SPX would stop sending Continue
  // and the reveal would never fire on air.
  const stepsSetting = async () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      return useTemplateStore.getState().template.settings.steps;
  });
  expect(await stepsSetting()).toBe('2');
  const beforeEdit = await timelineProgress(page);
  await page.getByTestId('tlv2-clip-0').click({ button: 'right' });
  await awaitPreviewRebuild(page, () => page.getByTestId('tlv2-menu-ease').selectOption('power2.out'));
  expect(await stepsSetting()).toBe('2');

  // And it still plays: Continue runs the step, the step fires the call, the answer lands.
  // The edit restores the current playhead with a scrub after the rebuilt preview is ready.
  // Wait for that distinct run before starting playback, so the restore cannot replace Play.
  let editedRunId = beforeEdit.runId;
  await expect
    .poll(async () => {
      const sample = await timelineProgress(page);
      if (sample.active && sample.runId !== beforeEdit.runId) editedRunId = sample.runId;
      return editedRunId !== beforeEdit.runId;
    }, { timeout: 20_000 })
    .toBe(true);
  await page.getByRole('button', { name: '▶ Play' }).click();
  // Let the entrance FINISH before Continue - pressing Next mid-entrance is a different test.
  //
  // This used to chase the clock to its last frame, because the simulator retained its timeline
  // handle after completion and "inactive" therefore meant nothing. It releases the run on
  // completion now (preview/simulatorRuntime.ts), so going inactive IS the completion signal -
  // and the old poll became unsatisfiable the moment it was: a frame with `time >= duration` now
  // exists only in the ~20 ms before the release, so the poll had to win a race it usually lost
  // and then had nothing left to sample. The signal it wanted is the one that now exists.
  //
  // Accumulated in one poll rather than split in two, because idle is the state on BOTH sides of
  // a run: "not active" alone would answer instantly from the idle that preceded the click.
  let sawEntranceRunning = false;
  await expect
    .poll(async () => {
      const sample = await timelineProgress(page);
      if (sample.active && sample.runId !== editedRunId && sample.phase === 'in') sawEntranceRunning = true;
      return sawEntranceRunning && !sample.active;
    }, { timeout: 20_000 })
    .toBe(true);
  await page.getByRole('button', { name: '» Next' }).click();
  const preview = page.frameLocator('iframe.preview-frame');
  await expect(preview.locator('.quiz-option.quiz-correct')).toHaveCount(1);
  await expect(preview.locator('.quiz-correct #f2')).toHaveText('Mars'); // f5 default 'B'
});
