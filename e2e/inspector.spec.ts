import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic, skipOldEditor } from './_create';
import { elementPoint } from './_canvas';

// Timeline v2 Phase 2 — the Inspector column (the shared selection's third consumer) and
// the redo stack. The Inspector is the persistent panel right of the preview: identity +
// resolved property values for the selected layer (read shell; editing arrives with the
// keyframe timeline). Selection must stay synchronized: canvas ↔ timeline ↔ Inspector.

async function createHairline(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
}

/** The Inspector is a tab in the right dock (active by default). Ensure it is docked and the
 *  active tab, so its body shows — the way a user would via the topbar toggle / its tab. */
async function openInspector(page: Page) {
  if ((await page.getByTestId('dock-tab-inspector').count()) === 0) {
    await page.getByTestId('toggle-inspector').click(); // re-dock it if it was closed
  }
  await page.getByTestId('dock-tab-inspector').click(); // make it the active tab
  await expect(page.getByTestId('inspector')).toBeVisible();
}

test('inspector: sits in the right dock, empty until something is selected', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  await expect(page.getByTestId('inspector-empty')).toContainText('Select an element');
  // Geometry: the right dock is a true right column — never covering the centre stage.
  const stage = (await page.locator('.preview-stage').boundingBox())!;
  const insp = (await page.getByTestId('dock-slot-right').boundingBox())!;
  expect(insp.x).toBeGreaterThanOrEqual(stage.x + stage.width - 2);
  // The topbar toggle closes and restores the Inspector.
  await page.getByTestId('toggle-inspector').click();
  await expect(page.getByTestId('dock-tab-inspector')).toHaveCount(0);
  await page.getByTestId('toggle-inspector').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
});

test('inspector: selecting a timeline row shows that layer — selection synced all around', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  // Select the Name line via its timeline row label (the shared-selection handle).
  await page.locator('.timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');
  await expect(page.getByTestId('inspector')).toContainText('#f0');
  // Lower thirds create as data blocks: the animated mask property is ARMED, so it
  // renders as an editable input resolved at the settled state (yPercent ends at 0).
  await expect(page.getByTestId('inspector-input-yPercent')).toHaveValue('0');
  // The same selection washes the timeline row (the existing shared-selection pin).
  await expect(page.locator('.timeline-label[data-part="#f0"]')).toHaveClass(/selected/);
  // The Animations tab reports which steps move this layer.
  await page.getByTestId('inspector').getByRole('button', { name: 'Animations' }).click();
  await expect(page.getByTestId('inspector-animations')).toContainText('Enter');
  await expect(page.getByTestId('inspector-animations')).toContainText('yPercent');
  // Deselecting empties the Inspector again.
  await page.locator('.timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector-empty')).toBeVisible();
});

test('inspector: canvas clicks drive it too (select it to affect it)', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  // Click the Name line on the CANVAS. Pad-agnostic mapping (see e2e/_canvas.ts) — the overlay
  // spans the pasteboard, so derive the point from the DOM rather than assuming overlay=canvas.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toBeVisible();
  const p = await elementPoint(page, '#f0');
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');
});

test('inspector: a new selection reveals it; an explicit close holds until the selection changes', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  // Close the Inspector explicitly (it is open by default in the right dock).
  await page.getByTestId('toggle-inspector').click();
  await expect(page.getByTestId('dock-tab-inspector')).toHaveCount(0);
  // Selecting a layer (timeline row label here — canvas clicks and diamond clicks run
  // through the same store selection) re-reveals it.
  await page.locator('.timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');
  // An explicit close is respected while the selection stays the same.
  await page.getByTestId('toggle-inspector').click();
  await expect(page.getByTestId('dock-tab-inspector')).toHaveCount(0);
  await page.waitForTimeout(250);
  await expect(page.getByTestId('dock-tab-inspector')).toHaveCount(0);
  // A DIFFERENT selection is a new request to inspect — it reveals again.
  await page.locator('.timeline-label[data-part="#f1"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible();
});

test('inspector: the pivot sets the transform-origin, and the runtime honours it', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  await page.locator('.timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');

  // Pick the bottom-left pivot (index 6 = "0% 100%").
  await page.getByTestId('inspector-pivot-6').click();
  await expect(page.locator('[data-testid="inspector-pivot-6"]')).toHaveClass(/active/);

  // The data records a transformOrigin track on #f0…
  const origin = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(useTemplateStore.getState().template.js)!;
    for (const s of d.steps) {
      const k = s.layers['#f0']?.transformOrigin;
      if (k?.length) return String(k[0].value);
    }
    return null;
  });
  expect(origin).toBe('0% 100%');

  // …and the runtime interpreter applies it (the entrance settles #f0's transform-origin to
  // the left edge — the pivot the model previously couldn't express). Wait for the preview to
  // rebuild with the new data before exercising its interpreter.
  await expect
    .poll(async () => {
      const f = page.frames().find((fr) => fr.url().startsWith('about:srcdoc'));
      // The debounced rebuild REPLACES the srcdoc frame mid-poll; a destroyed evaluation
      // context must count as "not yet", not throw (a thrown callback fails expect.poll
      // instead of retrying — the awaitPreviewRebuild rule, in its poll form).
      return f
        ? f.evaluate(() => {
            const w = window as unknown as { NOACG_ANIM?: { steps: { layers: Record<string, Record<string, unknown[]>> }[] } };
            return (w.NOACG_ANIM?.steps ?? []).some((s) => (s.layers['#f0']?.transformOrigin?.length ?? 0) > 0);
          }).catch(() => false)
        : false;
    })
    .toBe(true);
  const frame = page.frames().find((f) => f.url().startsWith('about:srcdoc'))!;
  const applied = await frame.evaluate(() => {
    const w = window as unknown as { gsap: { set: (t: string, v: object) => void }; buildInTimeline: () => { progress: (p: number, s: boolean) => void } };
    w.gsap.set('#f0', { clearProps: 'all' });
    w.buildInTimeline().progress(1, true);
    return getComputedStyle(document.getElementById('f0')!).transformOrigin;
  });
  expect(applied).toMatch(/^0px /); // left-anchored (0%), not the default centre
});

test('inspector: the 3D transform rows arm and key a rotation (docs/PRESET_MODEL_REVIEW.md gap 7)', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  await page.locator('.timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Name');

  // The 3D block is present, grouped and labelled under its own divider.
  await expect(page.getByTestId('inspector-group-3d-transform')).toBeVisible();
  await expect(page.getByTestId('inspector-kf-perspective')).toBeVisible();
  await expect(page.getByTestId('inspector-kf-rotationX')).toBeVisible();
  await expect(page.getByTestId('inspector-kf-z')).toBeVisible();

  // Arm Rotate Y (its diamond) — it stamps the first keyframe at the settled state and the
  // row becomes an editable input.
  await page.getByTestId('inspector-kf-rotationY').click();
  await page.waitForTimeout(700);
  const input = page.getByTestId('inspector-input-rotationY');
  await expect(input).toBeVisible();

  // Set a flip value; the data records a rotationY track on #f0 (an ordinary numeric track).
  await input.fill('45');
  await input.blur();
  await page.waitForTimeout(700);
  const rotY = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData(useTemplateStore.getState().template.js)!;
    for (const s of d.steps) {
      const k = s.layers['#f0']?.rotationY;
      if (k?.length) return k[k.length - 1].value;
    }
    return null;
  });
  expect(rotY).toBe(45);
});

test('redo: Ctrl+Shift+Z restores an undone edit; a new edit clears the redo branch', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  // The speed knob writes the data block's speed field (one undoable apply per pick).
  const speed = async () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      return parseAnimData(useTemplateStore.getState().template.js)?.speed;
    });
  await page.getByTestId('tlv2-speed').selectOption('1.5');
  expect(await speed()).toBe(1.5);
  await page.keyboard.press('Control+z');
  expect(await speed()).toBe(1);
  await page.keyboard.press('Control+Shift+z');
  expect(await speed()).toBe(1.5);
  // Undo again, make a DIFFERENT edit — the redo branch is gone (the classic cut).
  await page.keyboard.press('Control+z');
  await page.getByTestId('tlv2-speed').selectOption('0.75');
  expect(await speed()).toBe(0.75);
  await page.keyboard.press('Control+Shift+z');
  expect(await speed()).toBe(0.75); // no stale redo applied
});

test('inspector: filter rows compose into one filter track without clobbering each other (gap 8)', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  await openInspector(page);
  await page.locator('.timeline-label[data-part="#f0"]').click();

  // The filter block is present, grouped under its own divider.
  await expect(page.getByTestId('inspector-group-filter')).toBeVisible();
  for (const k of ['blur', 'brightness', 'saturate', 'hueRotate', 'glow']) {
    await expect(page.getByTestId(`inspector-kf-${k}`)).toBeVisible();
  }

  const filterTrack = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData } = await import('/src/blocks/animData.ts');
      const d = parseAnimData(useTemplateStore.getState().template.js)!;
      for (const s of d.steps) {
        const k = s.layers['#f0']?.filter;
        if (k?.length) return k.map((x) => String(x.value));
      }
      return null;
    });

  // Arm BLUR and give it a value.
  await page.getByTestId('inspector-kf-blur').click();
  await page.waitForTimeout(700);
  await page.getByTestId('inspector-input-blur').fill('8');
  await page.getByTestId('inspector-input-blur').blur();
  await page.waitForTimeout(700);
  expect((await filterTrack())!.join(' ')).toContain('blur(8px)');

  // Now edit BRIGHTNESS — the thing gap 8 said was impossible. It must COMPOSE with the blur,
  // not replace it: `filter` is one CSS property, so both live in one string.
  await page.getByTestId('inspector-input-brightness').fill('1.6');
  await page.getByTestId('inspector-input-brightness').blur();
  await page.waitForTimeout(700);
  const composed = await filterTrack();
  expect(composed!.every((v) => v.includes('blur(') && v.includes('brightness('))).toBe(true);
  expect(composed!.join(' ')).toContain('blur(8px)');
  expect(composed!.join(' ')).toContain('brightness(1.6)');

  // And the rows read their OWN function back out of the shared string.
  await expect(page.getByTestId('inspector-input-blur')).toHaveValue('8');
  await expect(page.getByTestId('inspector-input-brightness')).toHaveValue('1.6');
});

test('filter track: every keyframe keeps the same shape, so the runtime really interpolates it', async ({ page }) => {
  await createHairline(page);
  // Author a two-filter entrance directly, then prove BOTH numbers move at runtime. This is the
  // invariant the composed track rests on: GSAP matches a filter string's numbers positionally,
  // so keyframes that disagreed on their function list would jump instead of tweening.
  const result = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { setFilterComponent } = await import('/src/blocks/animEdit.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const { composeDocument } = await import('/src/preview/composeDocument.ts');

    const store = useTemplateStore.getState();
    const tpl = store.template;
    let d = parseAnimData(tpl.js)!;
    const SEL = '#f0';
    d = setFilterComponent(d, 0, SEL, 'blur', 12, 0);
    d = setFilterComponent(d, 0, SEL, 'blur', 0, 0.6);
    d = setFilterComponent(d, 0, SEL, 'brightness', 2, 0);
    d = setFilterComponent(d, 0, SEL, 'brightness', 1, 0.6);
    const track = d.steps[0].layers[SEL].filter.map((k) => String(k.value));

    // One shape across the whole track — the interpolable invariant.
    const shape = (s: string) => (s.match(/[a-z-]+\(/g) ?? []).join(',');
    const shapes = [...new Set(track.map(shape))];

    // The editor resolves the in-between too (strings used to STEP — the other half of gap 8).
    const midEditor = String(resolveValue(d, SEL, 'filter', 0, 0.3));

    // The runtime: boot it and read the computed filter mid-tween.
    const js = spliceAnimData(tpl.js, d)!;
    const midRuntime = await new Promise<string>((res) => {
      const f = document.createElement('iframe');
      f.style.cssText = 'position:fixed;left:-9999px;width:1280px;height:720px';
      f.srcdoc = composeDocument({ ...tpl, js });
      f.onload = () => {
        const w = f.contentWindow as unknown as { buildInTimeline: () => gsap.core.Timeline; getComputedStyle: typeof getComputedStyle };
        const el = f.contentDocument!.querySelector(SEL)!;
        const tl = w.buildInTimeline();
        tl.pause();
        tl.seek(0.001);
        tl.seek(0.3);
        const v = w.getComputedStyle(el).filter;
        f.remove();
        res(v);
      };
      document.body.appendChild(f);
    });

    const nums = (s: string) => (s.match(/-?[\d.]+/g) ?? []).map(Number);
    return { track, shapes, midEditor, midRuntime, runtimeNums: nums(midRuntime) };
  });

  expect(result.shapes).toHaveLength(1); // one function list across every keyframe
  expect(result.track.every((v) => v.includes('blur(') && v.includes('brightness('))).toBe(true);

  // Mid-tween, BOTH filters are strictly between their endpoints — they really interpolate,
  // and neither has been frozen or dropped by the other.
  const [blur, brightness] = result.runtimeNums;
  expect(blur).toBeGreaterThan(0);
  expect(blur).toBeLessThan(12);
  expect(brightness).toBeGreaterThan(1);
  expect(brightness).toBeLessThan(2);

  // The editor no longer steps: it reports an in-between too (linear vs the preview's eased
  // curve, which is the documented contract — they agree exactly at keyframe times).
  expect(result.midEditor).toContain('blur(6px)');
  expect(result.midEditor).toContain('brightness(1.5)');
});
