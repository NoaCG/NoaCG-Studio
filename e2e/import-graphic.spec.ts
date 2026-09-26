import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { lowerThirdPng } from './_png';
import { elementPoint } from './_canvas';
import { previewFrame } from './_frame';
import { addToProductionFromFinish, switchToAdvancedMode } from './_create';

// The Import Graphic workflow, end to end (docs/IMPORT_MVP.md): a flat PNG design becomes
// a working SPX template with editable text fields and per-layer animation.
//
// The wizard is a SETUP flow, not a second editor: bring the artwork in, create, and land
// in the real canvas editor with the Data tab open. Fields are added there (real placed
// layers, fully wired), styled through the Inspector's Style tab, and animated through its
// Animations tab — so the spec walks the USER'S path: entry card, drop, create, add fields,
// drag, style, animate, export.

async function dropDesign(page: Page, width = 1920, height = 1080) {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'lower-third.png',
    mimeType: 'image/png',
    buffer: lowerThirdPng(width, height),
  });
}

/** Create the imported design (bare — no fields yet) and land in the editor. */
async function createBare(page: Page) {
  await switchToAdvancedMode(page);
  await awaitPreviewRebuild(page, async () => {
    await page.getByRole('button', { name: 'Create project' }).click();
    // 20 s: the modal only closes once applyGenerated's cold Prettier format resolves — the
    // same cold-module cost text-tools.spec.ts's createBareDesign documents in full.
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

/** Add a field through the Data panel's add row (the real UI path). */
async function addFieldViaDataTab(page: Page, title: string, ftype?: string) {
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.field-add-row input').fill(title);
  if (ftype) await page.locator('.field-add-row select').selectOption(ftype);
  await awaitPreviewRebuild(page, () =>
    page.getByRole('button', { name: '+ Add' }).click(),
  );
}

/** The standard fixture most tests use: created design + Name (f0) and Title (f1) fields. */
async function createImported(page: Page) {
  await dropDesign(page);
  await createBare(page);
  await addFieldViaDataTab(page, 'Name');
  await addFieldViaDataTab(page, 'Title');
}

/**
 * Drop several files at once, the way a browser delivers them.
 *
 * The step's file input has no `multiple`, so `setInputFiles` cannot reach this path at all:
 * only a real drag carries more than one file, which is why this builds a DataTransfer and
 * dispatches the drop itself. The PNGs are drawn here rather than imported as fixtures because
 * the test is about how many files arrived and what was said, never about their pixels.
 */
async function dropFiles(page: Page, names: string[]) {
  await page.evaluate(async (fileNames) => {
    const transfer = new DataTransfer();
    for (const name of fileNames) {
      if (name.endsWith('.svg')) {
        transfer.items.add(
          new File(
            ['<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"></svg>'],
            name,
            { type: 'image/svg+xml' },
          ),
        );
        continue;
      }
      // Anything that is not artwork at all - the readme swept up with the boards.
      if (name.endsWith('.txt')) {
        transfer.items.add(new File(['not artwork'], name, { type: 'text/plain' }));
        continue;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1920;
      canvas.height = 1080;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#3a5f8a';
      context.fillRect(0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      transfer.items.add(new File([blob!], name, { type: 'image/png' }));
    }
    document
      .querySelector('.wz-drop')!
      .dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, names);
}

// SEVERAL PICTURES AT ONCE (docs/backlog/dropping-several-files-at-once.md). One is imported and
// the rest are dropped on the floor, which is fine as a rule and was a defect as behaviour: the
// step used to read as a complete success. What is guarded here is the SENTENCE, because the
// import itself never changed - a green import is exactly what made the old bug invisible.
test('import graphic: a multi-file drop names the design used and every design skipped', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();

  await dropFiles(page, ['board-a.png', 'board-b.png', 'board-c.png', 'board-d.png', 'board-e.png']);

  // The first raster still wins, exactly as before, and the notice accounts for the other four.
  await expect(page.locator('.asset-card')).toContainText('board-a.png');
  const notice = page.getByTestId('import-multi-drop-notice');
  await expect(notice).toContainText('Used board-a.png');
  for (const skipped of ['board-b.png', 'board-c.png', 'board-d.png', 'board-e.png']) {
    await expect(notice).toContainText(skipped);
  }
  // Every picture was equally usable, so there is no ranking to explain and none is offered.
  await expect(notice).not.toContainText('because');

  // MIXED KINDS ARE THE CASE THE USER CANNOT WORK OUT ALONE: two kinds of design file arrived and
  // the SVG outranked the raster whichever way round they were dragged, so the notice says why.
  await dropFiles(page, ['the-one-i-want.png', 'artwork.svg']);
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await expect(notice).toContainText('Used artwork.svg');
  await expect(notice).toContainText('the-one-i-want.png');
  await expect(notice).toContainText('the better import');

  // A FILE THIS STEP CANNOT READ IS NAMED, BUT NOT INVITED BACK. "Bring the others in one at a
  // time - each becomes its own graphic" is true of another picture and false of a readme, and
  // sending someone off to drag in a file that errors out is its own small lie.
  await dropFiles(page, ['design.png', 'notes.txt']);
  await expect(notice).toContainText('notes.txt is not a design file');
  await expect(notice).not.toContainText('each becomes its own graphic');

  // The ordinary one-file drop keeps its uncluttered path and clears the earlier explanation.
  await page.getByRole('button', { name: '✕ Use a different design' }).click();
  await dropFiles(page, ['board-only.png']);
  await expect(page.locator('.asset-card')).toContainText('board-only.png');
  await expect(notice).toHaveCount(0);
});

test('import graphic: the wizard is a setup flow — create lands in the editor, Data tab open', async ({ page }) => {
  await dropDesign(page);

  // The artwork is MEASURED, not assumed — the flow states what it found — and the live
  // preview shows the real graphic already on the Design step.
  await expect(page.locator('.asset-card')).toContainText('1920 × 1080');
  await expect(page.locator('.wz-step')).toContainText('Frame-sized');
  await expect(page.locator('.wz-side')).toBeVisible();

  // Six rail stops — Start, Design, then the optional Prepare (erase baked-in text, scaling
  // mode), Text (place the fields), Animation, and Finish (name it, then editor or export)
  // — with Create available already on the Design step: the FAST PATH for a design that
  // needs no preparation, which is what the rest of this test walks.
  await expect(page.locator('.wz-dots .wz-dot')).toHaveCount(6);
  await expect(page.locator('.wz-dots .wz-dot').last()).toHaveText(/Finish/);
  await expect(page.getByRole('button', { name: 'Next →' })).toHaveCount(1);

  // Creating HERE (never visiting Prepare) must yield exactly the bare fixed-mode
  // template it always did — the assertions below pin that fast path.
  await createBare(page);

  // The handoff: the artwork renders as the graphic itself, the template is BARE (fields
  // come next, from the Data tab), and the Data tab is the active panel of its dock.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.imported-design-art')).toBeVisible();
  await expect(frame.locator('#f0')).toHaveCount(0);
  await expect(
    page.locator('.dock-tab.active [data-testid="dock-tab-data"]'),
  ).toBeVisible();
  await expect(page.locator('.panel-body')).toContainText('No fields on your design yet');

  // No dead controls: an imported design sizes each line from its own rule and reads no
  // --type-scale, so the var is not declared — which keeps the Style panel's global "Text
  // size" knob (keyed on the var's presence) from appearing as a control that does nothing.
  const css = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css;
  });
  expect(css).not.toContain('--type-scale');
  await page.getByTestId('dock-tab-style').click();
  await expect(page.locator('.panel-body')).toContainText('Size');
  // The knob is a SECTION HEADING, so ask for the heading. A bare panel-wide substring search
  // also matched the legibility floors' "Minimum text size" legend beside it - a different
  // control, correctly present, that made this read as a regression it was not.
  await expect(page.locator('.panel-body h3', { hasText: 'Text size' })).toHaveCount(0);
});

test('import graphic: fields added from the Data tab are real placed layers — the wizard step, replaced', async ({ page }) => {
  await dropDesign(page);
  await createBare(page);
  await addFieldViaDataTab(page, 'Guest name');
  await addFieldViaDataTab(page, 'Guest title');

  // Visible elements in the preview, showing their sample text…
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText('Guest name');
  await expect(frame.locator('#f1')).toHaveText('Guest title');

  // …placed lines + real SPX DataFields + synced sample values, the newest selected.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return {
      placed: placedLines(s.template.html, s.template.css),
      titles: s.template.fields.map((f) => f.title),
      samples: [s.sampleData['f0'], s.sampleData['f1']],
      selected: s.selectedPart,
    };
  });
  expect(state.placed['#f0']).toBeTruthy();
  expect(state.placed['#f1']).toBeTruthy();
  expect(state.placed['#f0']!.scaled).toBe(true); // the assembler's calc(--scale) idiom
  expect(state.titles).toEqual(['Guest name', 'Guest title']);
  expect(state.samples).toEqual(['Guest name', 'Guest title']);
  expect(state.selected).toBe('#f1');

  // …and timeline rows like any layer (the registry named them from the field titles).
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toContainText('Guest name');
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f1"]')).toContainText('Guest title');
});

test('import graphic: the imported design animates — whole unit in, whole unit out', async ({ page }) => {
  await createImported(page);

  // The timeline dock reads the template's OWN code, so a real editable strip means the
  // imported design carries a NOACG_ANIM data block (an import used to get no strip at all).
  await expect(page.locator('.tlv2-ruler')).toBeVisible();

  // The design unit's row speaks the user's word: this box is their artwork, not a "Panel".
  await expect(
    page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-box"]'),
  ).toContainText('Design');

  const frame = page.frameLocator('iframe.preview-frame');
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame.locator('.imported-design').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');

  // ONE UNIT by default: GSAP writes inline styles onto the targets it animates. The box is
  // animated, so it gets them; a field must not be touched on its own — that is exactly what
  // would tear a flat design away from artwork drawn around it.
  await expect
    .poll(async () => frame.locator('.imported-design-box').evaluate((el) => el.getAttribute('style') ?? ''))
    .not.toBe('');
  expect(await frame.locator('#f0').evaluate((el) => el.getAttribute('style') ?? '')).toBe('');

  // The whole graphic leaves together on Stop.
  await page.getByRole('button', { name: '■ Stop' }).click();
  await expect
    .poll(async () => frame.locator('.imported-design').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('0');
});

test('import graphic: a cropped design is placed as an object, not stretched', async ({ page }) => {
  await dropDesign(page, 900, 260);
  await expect(page.locator('.asset-card')).toContainText('900 × 260');
  await expect(page.locator('.wz-step')).toContainText('Smaller than');
  await createBare(page);

  // A floating design keeps its own size and sits in the default zone as an object.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.imported-design-art')).toBeVisible();
  const width = await frame
    .locator('.imported-design-box')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(900);
});

test('import graphic: a 2× export is shown frame-sized, not pushed off the frame', async ({ page }) => {
  // A retina/2x export of a 1080p design is one of the likeliest files to be dropped here.
  // At natural size only its top-left quadrant would fit the frame — a lower third drawn in
  // its bottom half would be entirely off-screen, an invisible graphic.
  await dropDesign(page, 3840, 2160);
  await expect(page.locator('.asset-card')).toContainText('3840 × 2160');
  await expect(page.locator('.wz-step')).toContainText('2× export');
  await createBare(page);

  // The design unit is exactly the frame's width: edge to edge, as drawn (--scale is 1 here).
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('.imported-design-art')).toBeVisible();
  const width = await frame
    .locator('.imported-design-box')
    .evaluate((el) => el.getBoundingClientRect().width);
  expect(Math.round(width)).toBe(1920);
});

/** The current template's #fw0 rule position + #f0 font/tracks + history length. */
async function placementState(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, lineFontSize } = await import('/src/blocks/designLayout.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const s = useTemplateStore.getState();
    const data = parseAnimData(s.template.js);
    return {
      place: placedLines(s.template.html, s.template.css)['#f0'] ?? null,
      font: lineFontSize(s.template.css, 'f0'),
      f0Tracks: Object.keys(data?.steps[0].layers['#f0'] ?? {}),
      history: s.history.length,
    };
  });
}

test('import graphic: dragging a field places it in the CSS — never a keyframe', async ({ page }) => {
  await createImported(page);

  // Select the Name field via its timeline row (the shared selection), like any layer.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  const before = await placementState(page);
  expect(before.place).not.toBeNull();

  // Drag the field 120 px right and 60 px up on screen.
  const c = await elementPoint(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 120, c.y - 60, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(800);

  // The wrapper's CSS rule moved by the drag (screen px → design px through the doc scale;
  // --scale is 1 at 1080p size M, so canvas px are design px here)...
  const after = await placementState(page);
  expect(after.place!.x).toBeCloseTo(before.place!.x + 120 / c.scale, -1);
  expect(after.place!.y).toBeCloseTo(before.place!.y - 60 / c.scale, -1);
  expect(after.place!.scaled).toBe(true); // the rule keeps its calc(--scale) idiom

  // ...and the drag wrote NO motion: the field's keyframe tracks are exactly what they were.
  expect(after.f0Tracks).toEqual(before.f0Tracks);

  // ONE undoable apply; undo restores the original placement.
  expect(after.history).toBe(before.history + 1);
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await placementState(page)).place!.x).toBe(before.place!.x);
});

test('import graphic: Escape cancels a placement drag without touching the code', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  const before = await placementState(page);

  const c = await elementPoint(page, '#f0');
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + 100, c.y + 40, { steps: 6 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await page.waitForTimeout(300);

  const after = await placementState(page);
  expect(after.place).toEqual(before.place);
  expect(after.history).toBe(before.history);
  // The live preview sprang back too (the inline override was cleared).
  const inline = await page
    .frameLocator('iframe.preview-frame')
    .locator('#fw0')
    .evaluate((el) => (el as HTMLElement).style.left);
  expect(inline).toBe('');
});

test('import graphic: an added field is live — sample data drives it with no manual wiring', async ({ page }) => {
  await createImported(page);
  await addFieldViaDataTab(page, 'Sponsor');
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f2')).toHaveText('Sponsor');

  // Type a new sample value in the Data panel and push it through update() — the shared
  // runtime binds fields by id, so the added field needs zero manual JS wiring. (The add
  // selected the new layer, which auto-revealed the Inspector in this dock — reopen Data.)
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.panel-body .field-row', { hasText: 'Sponsor' }).locator('input').fill('ACME Broadcast');
  await page.getByTestId('dock-body-right').getByRole('button', { name: '⟳ Update' }).click();
  await expect(frame.locator('#f2')).toHaveText('ACME Broadcast');

  // The definition carries the field, so SPX gets the same control: the export validates.
  await page.getByTestId('dock-tab-export').click();
  await expect(page.locator('.panel-body')).not.toContainText('✗');
});

test('import graphic: adding an image field creates a placed slot on the design', async ({ page }) => {
  await createImported(page);
  await addFieldViaDataTab(page, 'Logo', 'filelist');

  // The slot is real everywhere at once: a filelist DataField + a placed, sized wrapper.
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, slotSize } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    const place = placedLines(s.template.html, s.template.css)['#f2'] ?? null;
    return {
      place,
      slot: place ? slotSize(s.template.css, place.wrapperId) : null,
      field: s.template.fields.find((f) => f.field === 'f2') ?? null,
      selected: s.selectedPart,
    };
  });
  expect(state.place).not.toBeNull();
  expect(state.slot).toEqual({ width: 120, height: 120, scaled: true });
  expect(state.field?.ftype).toBe('filelist');
  expect(state.field?.assetfolder).toBe('./images/');
  expect(state.selected).toBe('#f2');

  // Empty slot: the img hides, the dashed wrapper shows — and the slot stays selectable
  // (the wrapper stands in for the hidden element). The add already selected the new layer
  // (clicking its row again would toggle-deselect), so its row and resize handle are live.
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f2')).toBeHidden();
  await expect(frame.locator('#fw2')).toBeVisible();
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f2"]')).toContainText('Logo');
  const handle = page.getByTestId('line-size-handle');
  await expect(handle).toBeVisible();

  // The corner handle resizes the slot's BOX in the CSS (aspect preserved, one apply).
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 60, { steps: 6 });
  await page.mouse.up();
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        const { slotSize } = await import('/src/blocks/designLayout.ts');
        const s = slotSize(useTemplateStore.getState().template.css, 'fw2');
        return s && s.width === s.height ? s.width : -1; // square slot keeps its aspect
      }),
    )
    .toBeGreaterThan(120);

  // Choosing an image fills the slot through update() — no manual wiring. (addAsset
  // triggers a preview rebuild; the settle then pushes the sample value into the slot.)
  await awaitPreviewRebuild(page, () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const c = document.createElement('canvas');
      c.width = 8;
      c.height = 8;
      const ctx = c.getContext('2d')!;
      ctx.fillStyle = '#f5a623';
      ctx.fillRect(0, 0, 8, 8);
      const s = useTemplateStore.getState();
      s.addAsset({ path: 'images/logo.png', data: c.toDataURL('image/png') });
      s.setSampleValue('f2', 'images/logo.png');
    }),
  );
  await expect(frame.locator('#f2')).toBeVisible();
});

test('import graphic: arrow keys nudge a selected field — one placement apply per burst', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  const before = await placementState(page);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Shift+ArrowUp');

  // The burst commits once the keys go quiet — one undoable apply for all four presses.
  await expect.poll(async () => (await placementState(page)).place?.x).toBe(before.place!.x + 3);
  const after = await placementState(page);
  expect(after.place!.y).toBe(before.place!.y - 10); // Shift = 10 design px
  expect(after.place!.scaled).toBe(true);
  expect(after.f0Tracks).toEqual(before.f0Tracks); // placement, never motion
  expect(after.history).toBe(before.history + 1);

  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await placementState(page)).place!.x).toBe(before.place!.x);
});

test('import graphic: the corner handle resizes a field\'s text in the CSS', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  const handle = page.getByTestId('line-size-handle');
  await expect(handle).toBeVisible();
  // The keyframe transform handles step aside for a placed line: its corner is a DESIGN
  // decision (font-size in its own rule), exactly like its drag.
  await expect(page.getByTestId('layer-scale-handle')).toHaveCount(0);
  await expect(page.getByTestId('layer-rotate-handle')).toHaveCount(0);

  const before = await placementState(page);
  expect(before.font).not.toBeNull();
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 60, { steps: 6 });
  await page.mouse.up();

  await expect.poll(async () => (await placementState(page)).font!.value).toBeGreaterThan(before.font!.value);
  const after = await placementState(page);
  expect(after.font!.scaled).toBe(true); // the rule keeps its calc(--scale) idiom
  expect(after.history).toBe(before.history + 1);
  expect(after.f0Tracks).toEqual(before.f0Tracks); // design, never a scale keyframe
});

test('import graphic: the Inspector Style tab restyles a selected placed field', async ({ page }) => {
  await createImported(page);

  // Select the Name field; the Style tab is offered for placed fields only.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.getByTestId('inspector-tab-style').click();
  await expect(page.getByTestId('inspector-style')).toBeVisible();

  // Size commits on Enter; weight/font/anchor commit on choice; color patches live.
  await page.getByTestId('inspector-style-size').fill('48');
  await page.getByTestId('inspector-style-size').press('Enter');
  await page.getByTestId('inspector-style-weight').selectOption('700');
  await page.getByTestId('inspector-style-align-center').click();
  await page.getByTestId('inspector-style-font').selectOption('bebas-neue');
  await page.getByTestId('inspector-style-color-text').fill('#f5a623');
  await page.getByTestId('inspector-style-spacing').fill('2');
  await awaitPreviewRebuild(page, () =>
    page.getByTestId('inspector-style-spacing').press('Enter'),
  );

  // Every edit landed as a declaration in the field's OWN rules, in the scale idiom, and
  // the picked bundled font ships as a real @font-face (offline-first, export-ready).
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const css = useTemplateStore.getState().template.css;
    return {
      rule: css.match(/#f0 \{[^}]*\}/)?.[0] ?? '',
      wrapperTransform: css.match(/#fw0 \{[^}]*\}/)?.[0]?.match(/transform:[^;]*/)?.[0] ?? '',
      fontFaces: (css.match(/Bundled open-source font/g) || []).length,
    };
  });
  expect(state.rule).toContain('font-size: calc(48px * var(--scale))');
  expect(state.rule).toContain('font-weight: 700');
  expect(state.rule).toContain('"Bebas Neue"');
  expect(state.rule).toContain('color: #f5a623');
  expect(state.rule).toContain('letter-spacing: calc(2px * var(--scale))');
  expect(state.wrapperTransform).toContain('translateX(-50%)');
  expect(state.fontFaces).toBe(2); // the heading face + the line's own

  // The canvas/preview shows it (--scale is 1 at 1080p, so 48 design px are 48 px).
  const frame = page.frameLocator('iframe.preview-frame');
  await expect
    .poll(async () =>
      frame.locator('#f0').evaluate((el) => {
        const cs = getComputedStyle(el);
        return { size: cs.fontSize, color: cs.color, family: cs.fontFamily };
      }),
    )
    .toEqual({ size: '48px', color: 'rgb(245, 166, 35)', family: '"Bebas Neue", "Arial Narrow", Arial, sans-serif' });

  // Discrete style edits are ordinary undoable applies.
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () =>
      page.evaluate(async () => {
        const { useTemplateStore } = await import('/src/store/templateStore.ts');
        return useTemplateStore.getState().template.css.includes('letter-spacing: calc(2px');
      }),
    )
    .toBe(false);

  // The Style tab is a placed-field surface: the artwork layer doesn't offer it.
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Artwork');
  await expect(page.getByTestId('inspector-tab-style')).toHaveCount(0);
});

test('import graphic: the Style tab\'s Content rows rename and retext a field', async ({ page }) => {
  await createImported(page);
  await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.getByTestId('inspector-tab-style').click();

  // Label: the DataField's operator-facing title — the timeline row (registry-named from
  // the field) and the SPX definition both follow; the element id never changes.
  await page.getByTestId('inspector-style-label').fill('Guest name');
  await page.getByTestId('inspector-style-label').press('Enter');
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toContainText('Guest name');

  // Text: the canvas inline editor's pattern — sample value + definition default together,
  // so the preview shows it immediately and SPX starts from it.
  await page.getByTestId('inspector-style-text-value').fill('Alexandra Riva');
  await awaitPreviewRebuild(page, () =>
    page.getByTestId('inspector-style-text-value').press('Enter'),
  );
  await expect(page.frameLocator('iframe.preview-frame').locator('#f0')).toHaveText('Alexandra Riva');

  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const s = useTemplateStore.getState();
    const f0 = s.template.fields.find((f) => f.field === 'f0');
    return { title: f0?.title, value: f0?.value, sample: s.sampleData['f0'] };
  });
  expect(state.title).toBe('Guest name');
  expect(state.value).toBe('Alexandra Riva');
  expect(state.sample).toBe('Alexandra Riva');
});

// ── Fit: a long operator value has to stay inside the room the design gives the line.
//    Placed lines used to be uncapped and nowrap, so a long name ran clean off the
//    artwork (templates/shared/textFit.ts). ──

/** Select f0, open the Style tab, and set its fit through the real controls. Selecting is
 *  conditional: clicking the row of the ALREADY-selected layer toggles it back off. */
async function setSlot(page: Page, mode: 'shrink' | 'wrap' | 'overflow', width?: number) {
  const selected = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  if (selected !== '#f0') {
    await page.locator('.tlv2-labels .timeline-label[data-part="#f0"]').click();
  }
  // Reveal the Inspector explicitly: it shares the right dock with Data, so a previous
  // measurement left Data active, and an unchanged selection re-reveals nothing.
  await page.getByTestId('dock-tab-inspector').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await page.getByTestId('inspector-tab-style').click();
  await awaitPreviewRebuild(page, () => page.getByTestId(`inspector-style-fit-${mode}`).click());
  if (width !== undefined) {
    await page.getByTestId('inspector-style-fit-width').fill(String(width));
    await awaitPreviewRebuild(page, () =>
      page.getByTestId('inspector-style-fit-width').press('Enter'),
    );
  }
}

/** Push a value through update() and measure the line against its slot in the preview. */
async function measureLine(page: Page, value: string) {
  await page.getByTestId('dock-tab-data').click();
  await page.locator('.panel-body .field-row').first().locator('input').fill(value);
  await page.getByTestId('dock-body-right').getByRole('button', { name: '⟳ Update' }).click();
  const frame = page.frameLocator('iframe.preview-frame');
  await expect(frame.locator('#f0')).toHaveText(value);
  return previewFrame(page)
    .locator('body')
    .evaluate(() => {
      const line = document.getElementById('f0')!;
      const slot = document.getElementById('fw0')!;
      const fontSize = parseFloat(getComputedStyle(line).fontSize);
      return {
        lineWidth: line.getBoundingClientRect().width,
        slotWidth: slot.getBoundingClientRect().width,
        fontSize,
        // Rows as a RATIO of the line's own type size, not its computed line-height —
        // `line-height: normal` computes to the string "normal", which parses to NaN. One
        // row of text is ~1.2x its font-size; two rows are ~2.4x.
        rowRatio: line.getBoundingClientRect().height / fontSize,
      };
    });
}

/** A single row of text sits well under 1.8x its own type size; more rows sit above it. */
const ONE_ROW = 1.8;

const LONG_NAME = 'Bartholomew Fitzgerald-Wellington III';

test('import graphic: a new field is born with a slot, so a long value cannot run off the design', async ({ page }) => {
  await dropDesign(page);
  await createBare(page);
  await addFieldViaDataTab(page, 'Name');

  // The add emits the whole fit contract: the wrapper's slot, the shrink marker on the
  // line, and the design-owned runtime (with the shared update()'s hook calling it).
  const state = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { lineFit } = await import('/src/blocks/designLayout.ts');
    const t = useTemplateStore.getState().template;
    return {
      fit: lineFit(t.html, t.css, 'f0'),
      marked: /<span id="f0"[^>]*data-fit="shrink"/.test(t.html),
      runtime: t.js.includes('function fitPlacedText'),
      hook: t.js.includes('typeof fitPlacedText'),
    };
  });
  expect(state.fit?.mode).toBe('shrink');
  expect(state.fit!.maxWidth!).toBeGreaterThan(0);
  expect(state.marked).toBe(true);
  expect(state.runtime).toBe(true);
  expect(state.hook).toBe(true);
});

test('import graphic: a long name shrinks to stay inside its slot, and a short one springs back', async ({ page }) => {
  await createImported(page);
  await setSlot(page, 'shrink', 420);

  const design = await measureLine(page, 'Ada Lovelace');
  expect(design.lineWidth).toBeLessThan(420); // comfortably inside — nothing to do

  // The value that used to run off the artwork now fits the slot exactly, on ONE row:
  // the design's own size comes down instead of the text reflowing into the artwork.
  const long = await measureLine(page, LONG_NAME);
  expect(long.lineWidth).toBeLessThanOrEqual(421);
  expect(long.fontSize).toBeLessThan(design.fontSize);
  expect(long.rowRatio).toBeLessThan(ONE_ROW);

  // …and the fit never compounds: a short value returns to the design's own size.
  const back = await measureLine(page, 'Ada Lovelace');
  expect(back.fontSize).toBeCloseTo(design.fontSize, 1);
});

test('import graphic: wrap flows a long value onto more rows, Free lets it run', async ({ page }) => {
  await createImported(page);
  await setSlot(page, 'shrink', 420);
  const shrunk = await measureLine(page, LONG_NAME);

  // Wrap keeps the design's type size and uses more rows inside the same slot.
  await setSlot(page, 'wrap');
  const wrapped = await measureLine(page, LONG_NAME);
  expect(wrapped.fontSize).toBeGreaterThan(shrunk.fontSize);
  expect(wrapped.lineWidth).toBeLessThanOrEqual(421);
  expect(wrapped.rowRatio).toBeGreaterThan(ONE_ROW);

  // Free removes the slot entirely — the original, uncapped behaviour, still available
  // for a line whose length the designer controls.
  await setSlot(page, 'overflow');
  const free = await measureLine(page, LONG_NAME);
  expect(free.lineWidth).toBeGreaterThan(430);
  expect(free.rowRatio).toBeLessThan(ONE_ROW);
  const fit = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { lineFit } = await import('/src/blocks/designLayout.ts');
    const t = useTemplateStore.getState().template;
    return lineFit(t.html, t.css, 'f0');
  });
  expect(fit).toEqual({ mode: 'overflow', maxWidth: null, scaled: true, stretch: false });
});

test('import graphic: the artwork and a field animate as separate layers from the Inspector', async ({ page }) => {
  await createImported(page);

  // The PNG is its own registry layer, and Animations is the Inspector's DEFAULT view here.
  await page.locator('.tlv2-labels .timeline-label[data-part=".imported-design-art"]').click();
  await expect(page.getByTestId('inspector')).toBeVisible({ timeout: 3000 });
  await expect(page.getByTestId('inspector-part-label')).toHaveText('Artwork');
  await expect(page.getByTestId('inspector-animations')).toBeVisible();

  // Give the artwork its own entrance…
  await page.getByTestId('inspector-preset-select').selectOption('design-slide');
  await awaitPreviewRebuild(page, () => page.getByTestId('inspector-preset-apply').click());

  // …and a field a different one, independently.
  await page.locator('.tlv2-labels .timeline-label[data-part="#f1"]').click();
  await page.getByTestId('inspector-preset-select').selectOption('design-pop');
  await awaitPreviewRebuild(page, () => page.getByTestId('inspector-preset-apply').click());

  const tracks = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const data = parseAnimData(useTemplateStore.getState().template.js);
    const layers = data?.steps[0].layers ?? {};
    return {
      art: Object.keys(layers['.imported-design-art'] ?? {}).sort(),
      f1: Object.keys(layers['#f1'] ?? {}).sort(),
    };
  });
  expect(tracks.art).toEqual(expect.arrayContaining(['opacity', 'y'])); // Slide up
  expect(tracks.f1).toEqual(expect.arrayContaining(['opacity', 'scale'])); // Pop
});

test('import graphic: the exported SPX package validates', async ({ page }) => {
  await createImported(page);
  await page.getByTestId('dock-tab-export').click();
  // Export is gated on zero validation errors; the panel says so inline.
  await expect(page.locator('.panel-body')).not.toContainText('✗');
});

test('the Text step places fields in the artwork’s empty panel by itself', async ({ page }) => {
  // An empty backplate is the common import: a strap drawn to hold words, exported with the
  // words left out. assets/suggestFields.ts measures that panel (no model call, no network),
  // so the step opens with Name and Title already inside it — the manual tools stay exactly
  // where they were for artwork it cannot read.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-stage')).toBeVisible();

  await expect(page.getByTestId('place-field-Name')).toBeVisible();
  await expect(page.getByTestId('place-field-Title')).toBeVisible();
  await expect(page.getByTestId('suggest-note')).toBeVisible();

  // And they land INSIDE the panel: lowerThirdPng draws its opaque block across 6–53% of the
  // width and 70–86% of the height, so a field outside that range is on transparent nothing.
  const stage = (await page.getByTestId('place-stage').boundingBox())!;
  for (const title of ['Name', 'Title']) {
    const box = (await page.getByTestId(`place-field-${title}`).boundingBox())!;
    const left = (box.x - stage.x) / stage.width;
    const top = (box.y - stage.y) / stage.height;
    const bottom = (box.y + box.height - stage.y) / stage.height;
    expect(left, `${title} left`).toBeGreaterThanOrEqual(0.06);
    expect(left, `${title} left`).toBeLessThan(0.53);
    expect(top, `${title} top`).toBeGreaterThanOrEqual(0.70);
    expect(bottom, `${title} bottom`).toBeLessThanOrEqual(0.87);
  }
});

test('the Text step gives the placement canvas more room than the passive preview', async ({ page }) => {
  // You PLACE fields on the left canvas; the right pane only shows the result. The working
  // surface used to be the smaller of the two (a fixed 520px against a ~700px preview), so
  // text was positioned on a downscaled picture of the artwork.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  await expect(page.getByTestId('place-stage')).toBeVisible();
  const working = (await page.getByTestId('place-stage').boundingBox())!;
  const preview = (await page.locator('.wz-stage').boundingBox())!;
  expect(working.width).toBeGreaterThan(preview.width);
  expect(working.width).toBeGreaterThan(700); // and it actually grew, not just won by shrinking the preview
});

/** A finished SPX template as a file — what a student who already has the graphic brings. */
const FINISHED_TEMPLATE = `<!doctype html>
<html><head><meta charset="utf-8"><title>Studio strap</title>
<style>
  body { margin: 0; background: transparent; }
  #root { position: absolute; left: 120px; top: 760px; width: 900px; height: 190px;
          background: #12203a; color: #fff; font: 700 54px/1 sans-serif; padding: 24px; box-sizing: border-box; }
</style>
<script>
  window.SPXGCTemplateDefinition = { description: 'Studio strap', DataFields: [
    { field: 'f0', ftype: 'textfield', title: 'Name', value: 'Alexandra Riva' },
    { field: 'f1', ftype: 'textfield', title: 'Title', value: 'Correspondent' } ] };
  function update(data) {}
  function play() {}
  function stop() {}
  function next() {}
</script></head>
<body><div id="root"><span id="f0">Alexandra Riva</span><span id="f1">Correspondent</span></div></body></html>`;

test('import graphic: a finished .html template comes in as itself, fields and all', async ({ page }) => {
  // "I already have this graphic" is the same errand as "I already have this picture", so the
  // same drop zone takes both and the FILE decides the walk. A template has nothing to erase,
  // place or animate — it declares all three — so its rail is two stops, not six.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });

  // What it FOUND — led by the operator fields, which are what make it usable on air rather
  // than a picture that plays.
  await expect(page.getByTestId('import-template-card')).toContainText('Studio strap');
  await expect(page.getByTestId('import-template-fields')).toContainText('Name, Title');
  await expect(page.locator('.wz-dots .wz-dot')).toHaveCount(3);

  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();
  await expect(page.getByTestId('wz-finish-export')).toBeVisible();
  // The editor is never the way out of an import: the default studio hides that door.
  await expect(page.getByTestId('wz-finish-editor')).toHaveCount(0);
  await expect(page.locator('.wz-finish-summary')).toContainText('Kept exactly as written');
});

test('import graphic: the production door goes straight to the rundown, never through the editor', async ({ page }) => {
  // The owner watched the canvas flash past on the way to the rundown (walk, 2026-09-01). It was
  // a real route, not a paint: the create applied with no `skipNavigation`, so it replaced the
  // route with the editor's and the production replace landed a beat later, mounting the whole
  // editor shell in between.
  //
  // Asserted on the ROUTES WRITTEN, because that is the thing that was wrong and the thing a
  // screenshot cannot catch. `routeHash({ view: 'editor' })` is the empty hash, so an editor
  // route shows up here as a bare pathname.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('wz-finish-production-go')).toBeVisible();

  await page.evaluate(() => {
    const w = window as unknown as { __routes: string[] };
    w.__routes = [];
    const orig = history.replaceState.bind(history);
    history.replaceState = (a, b, url) => {
      w.__routes.push(String(url));
      return orig(a, b, url ?? null);
    };
  });
  await addToProductionFromFinish(page);

  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('creation-wizard')).toBeHidden();
  const routes = await page.evaluate(() => (window as unknown as { __routes: string[] }).__routes);
  // Exactly one route was written, and it is the production's. Before the fix this read
  // ["/app", "#/production/…"] - the editor, then the rundown.
  expect(routes).toHaveLength(1);
  expect(routes[0]).toMatch(/^#\/production\//);
});

test('import graphic: the imported template exports as the code that was dropped', async ({ page }) => {
  await page.goto('/app');
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'studio-strap.html',
    mimeType: 'text/html',
    buffer: Buffer.from(FINISHED_TEMPLATE, 'utf8'),
  });
  await page.locator('.wz-next').click();
  await page.getByTestId('wz-finish-name').fill('Studio strap A');
  await page.getByTestId('wz-finish-export').click();

  // The export door saves first, so the working project IS the imported file — its own markup,
  // its own fields, under the name that slugs the package.
  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    return { name: t.name, fields: t.fields.map((f) => f.title), root: t.html.includes('id="root"') };
  });
  expect(built).toMatchObject({ name: 'Studio strap A', fields: ['Name', 'Title'], root: true });
});

test('the Text step places a picture slot the operator fills from the control panel', async ({ page }) => {
  // A crest, a headshot, a sponsor mark: the design reserves the box, the operator brings the
  // file. It has to be reachable WITHOUT the editor, like every other field on this step.
  await dropDesign(page);
  await page.waitForTimeout(800);
  await page.locator('.wz-next').click(); // Prepare
  await page.locator('.wz-next').click(); // Text
  const stage = page.getByTestId('place-stage');
  await expect(stage).toBeVisible();

  await page.getByTestId('tool-image').click();
  const box = (await stage.boundingBox())!;
  const x = box.x + box.width * 0.34;
  const y = box.y + box.height * 0.73;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y + 55, { steps: 6 });
  await page.mouse.up();

  // Named, sized, and typography-free: what an operator supplies here is a FILE.
  await expect(page.getByTestId('place-field-Logo')).toBeVisible();
  await expect(page.getByTestId('field-slot-width')).toBeVisible();
  await expect(page.getByTestId('field-size')).toHaveCount(0);

  await switchToAdvancedMode(page);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 30_000 });

  // A real SPX image field (filelist), a real <img> in the design, and a placed, sized box.
  const built = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const t = useTemplateStore.getState().template;
    const logo = t.fields.find((f) => f.title === 'Logo');
    // Built with concatenation, not a template literal: `\s` and `\{` are NOT escapes inside
    // one, so an inlined pattern silently becomes `#fw2s*{…` and matches nothing.
    const wrapper = logo
      ? t.css.match(new RegExp('#fw' + logo.field.slice(1) + '\\s*\\{[^}]*\\}'))?.[0] ?? ''
      : '';
    return {
      ftype: logo?.ftype ?? null,
      img: logo ? new RegExp('<img[^>]*id="' + logo.field + '"').test(t.html) : false,
      sized: /width:\s*calc\(\d+px/.test(wrapper) && /height:\s*calc\(\d+px/.test(wrapper),
    };
  });
  expect(built).toEqual({ ftype: 'filelist', img: true, sized: true });
});

test('import graphic: full-frame artwork with no transparency says it will cover the picture', async ({ page }) => {
  // The commonest export mistake: the lower third saved with its mock-up background (or a
  // frame of footage) still behind it. On air that covers the live picture completely. It is
  // stated, never blocked — a full-screen card is a real graphic with the same pixels.
  await page.goto('/app');
  await page.locator('[data-entry="import-graphic"]').click();
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const g = canvas.getContext('2d')!;
    g.fillStyle = '#0b0f16';
    g.fillRect(0, 0, 1920, 1080); // opaque, edge to edge
    g.fillStyle = '#161d2a';
    g.fillRect(120, 760, 900, 190);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob!], 'flattened.png', { type: 'image/png' }));
    const input = document.querySelector('.wz-drop input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.getByTestId('import-opaque-warning')).toBeVisible();

  // The same design exported properly — a strap on transparency — says nothing.
  await page.locator('.wz-drop').click({ position: { x: 10, y: 10 } });
  await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1920;
    canvas.height = 1080;
    const g = canvas.getContext('2d')!;
    g.clearRect(0, 0, 1920, 1080);
    g.fillStyle = '#161d2a';
    g.fillRect(120, 760, 900, 190);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    const dt = new DataTransfer();
    dt.items.add(new File([blob!], 'strap.png', { type: 'image/png' }));
    const input = document.querySelector('.wz-drop input[type=file]') as HTMLInputElement;
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.asset-card')).toContainText('strap.png');
  await expect(page.getByTestId('import-opaque-warning')).toHaveCount(0);
});

// ── The Prepare step's OPENING PROPOSAL ──────────────────────────────────────────────────
//
// The erase is the workhorse of this flow (docs/IMPORT_MVP.md's audit: it answers 9 of the 10
// designs, where the empty-panel detector answers none of the baked ones), but it only ran if
// the student thought to drag a box. `assets/eraseRegion.ts proposeEraseRect` scans the
// artwork and opens with the rectangle drawn, deterministically and with no model call.

const STRAP = { x: 120, y: 760, w: 940, h: 190 };
/** The second baked block: a score bug at the top of the frame, on its own panel. */
const SCORE = { x: 120, y: 120, w: 560, h: 120 };

/**
 * A strap with REAL typeset words baked into the file — what a student sends when nobody told
 * them to export the design without its text. It returns the artwork AND the true box of the
 * painted glyphs, scanned off the canvas: the proposal is checked against the words as they
 * landed, not against the coordinates the fixture asked for.
 *
 * With `score`, a SECOND baked block is drawn far above the strap — a design carrying two
 * separate pieces of text, which is what a real scoreboard is. The scan offers one region at a
 * time, so the second block's ink box is returned alongside the first.
 */
async function bakedStrap(page: Page, opts: { score?: boolean } = {}) {
  return page.evaluate(
    async ({ s, sc, withScore }) => {
      const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
      await face.load();
      document.fonts.add(face);
      const c = document.createElement('canvas');
      c.width = 1920;
      c.height = 1080;
      const g = c.getContext('2d')!;
      g.fillStyle = '#101b2e';
      g.fillRect(s.x, s.y, s.w, s.h);
      g.fillStyle = '#f6a623';
      g.fillRect(s.x, s.y, 14, s.h); // the accent bar: furniture the erase must not swallow
      g.fillStyle = '#ffffff';
      g.textBaseline = 'top';
      g.font = '700 56px Inter';
      g.fillText('Alexandra Riva', 170, 800);
      g.font = '400 31px Inter';
      g.fillText('Correspondent', 170, 870);
      if (withScore) {
        g.fillStyle = '#101b2e';
        g.fillRect(sc.x, sc.y, sc.w, sc.h);
        g.fillStyle = '#ffffff';
        g.font = '700 48px Inter';
        g.fillText('ARS 2 - 1 CHE', 150, 155);
      }
      const d = g.getImageData(0, 0, 1920, 1080).data;
      /** The true box of the white glyphs inside one zone, as they actually landed. */
      const inkIn = (z: { x: number; y: number; w: number; h: number }) => {
        const ink = { left: 1e9, right: -1, top: 1e9, bottom: -1 };
        for (let y = z.y; y < z.y + z.h; y++) {
          for (let x = z.x; x < z.x + z.w; x++) {
            const p = (y * 1920 + x) * 4;
            if (d[p] > 200 && d[p + 1] > 200 && d[p + 2] > 200) {
              if (x < ink.left) ink.left = x;
              if (x > ink.right) ink.right = x;
              if (y < ink.top) ink.top = y;
              if (y > ink.bottom) ink.bottom = y;
            }
          }
        }
        return ink;
      };
      return {
        base64: c.toDataURL('image/png').split(',')[1],
        ink: inkIn(s),
        scoreInk: withScore ? inkIn(sc) : null,
      };
    },
    { s: STRAP, sc: SCORE, withScore: Boolean(opts.score) },
  );
}

/** Drop artwork built in the page, and walk Design -> Prepare. */
async function toPrepare(page: Page, base64: string, name = 'strap.png') {
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name,
    mimeType: 'image/png',
    buffer: Buffer.from(base64, 'base64'),
  });
  await expect(page.locator('.asset-card')).toContainText('1920 × 1080');
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
}

/** The proposal rectangle in the ARTWORK's own pixels, read back off its rendered box. */
async function proposedRect(page: Page) {
  const surface = (await page.getByTestId('erase-surface').boundingBox())!;
  const box = (await page.getByTestId('erase-proposal-rect').boundingBox())!;
  const k = 1920 / surface.width;
  return {
    x: (box.x - surface.x) * k,
    y: (box.y - surface.y) * k,
    width: box.width * k,
    height: box.height * k,
  };
}

test('the Prepare step opens with the baked-in text already boxed', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);

  // The question "does it have baked-in text?" is answered by measuring, so it is not asked.
  await expect(page.getByTestId('erase-proposal')).toContainText('2 lines');
  await expect(page.getByTestId('baked-yes')).toHaveCount(0);

  // The box covers every painted glyph — and stays inside the strap, so the ring that decides
  // the fill has real background to sample and the amber accent bar is not swallowed with it.
  const rect = await proposedRect(page);
  expect(rect.x).toBeLessThanOrEqual(art.ink.left);
  expect(rect.x + rect.width).toBeGreaterThanOrEqual(art.ink.right);
  expect(rect.y).toBeLessThanOrEqual(art.ink.top);
  expect(rect.y + rect.height).toBeGreaterThanOrEqual(art.ink.bottom);
  expect(rect.x).toBeGreaterThan(STRAP.x + 14);
  expect(rect.y).toBeGreaterThan(STRAP.y);
  expect(rect.y + rect.height).toBeLessThan(STRAP.y + STRAP.h);

  // Accepting it is the ordinary erase: flat fill, a field per measured line.
  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-done')).toContainText('2 text fields');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);
  // …and the scan re-runs on the CLEANED artwork, which now holds no words to offer.
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
});

test('a design with two baked blocks offers them one at a time until nothing is left', async ({
  page,
}) => {
  // Every other fixture bakes exactly ONE block, so the branch that serves a real scoreboard —
  // "accepting this rectangle re-runs the scan, which offers the next" — has never executed.
  // This design carries a strap AND a score bug: two separate pieces of text, erased in two
  // rounds, and the scan says nothing only once both are gone.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page, { score: true });
  await toPrepare(page, art.base64, 'scoreboard.png');

  /** Does the offered rectangle cover this zone's ink, and stay inside the zone's panel? */
  const covers = (
    rect: { x: number; y: number; width: number; height: number },
    ink: { left: number; right: number; top: number; bottom: number },
    zone: { x: number; y: number; w: number; h: number },
  ) =>
    rect.x <= ink.left &&
    rect.x + rect.width >= ink.right &&
    rect.y <= ink.top &&
    rect.y + rect.height >= ink.bottom &&
    rect.x >= zone.x &&
    rect.x + rect.width <= zone.x + zone.w &&
    rect.y >= zone.y &&
    rect.y + rect.height <= zone.y + zone.h;

  // ROUND ONE. Whichever block the scan ranks strongest, it offers ONE of them — never a box
  // spanning both, which is what a scan guessing at all of them at once would draw.
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
  const first = await proposedRect(page);
  const firstIsStrap = covers(first, art.ink, STRAP);
  expect(firstIsStrap || covers(first, art.scoreInk!, SCORE)).toBe(true);

  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(1);

  // ROUND TWO: the scan re-ran on the CLEANED artwork and found the OTHER block.
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
  const second = await proposedRect(page);
  expect(
    firstIsStrap ? covers(second, art.scoreInk!, SCORE) : covers(second, art.ink, STRAP),
  ).toBe(true);

  await page.getByTestId('erase-proposal-accept').click();
  await expect(page.getByTestId('erase-marks').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('erase-done')).toContainText('erased cleanly');
  await expect(page.getByTestId('erase-warning')).toHaveCount(0);

  // Both regions kept their own measured lines: the strap's name over its title is two, the
  // score bug is one — so three fields, not one per rectangle and not two for the pair.
  const marks = page.getByTestId('erase-marks').locator('li');
  await expect(marks.filter({ hasText: '2 lines' })).toHaveCount(1);
  await expect(marks.filter({ hasText: '1 line' })).toHaveCount(1);
  await expect(page.getByTestId('erase-done')).toContainText('3 text fields');

  // …and the loop STOPS: the cleaned artwork holds no words, so nothing more is offered.
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
});

test('the proposed box is dragged and resized before it is accepted', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  const before = await proposedRect(page);

  // The corner grip resizes from its own edges: the far edges hold still.
  const grip = (await page.getByTestId('erase-proposal-grip-se').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  const resized = await proposedRect(page);
  expect(resized.width).toBeGreaterThan(before.width + 40);
  expect(resized.height).toBeGreaterThan(before.height + 10);
  expect(Math.abs(resized.x - before.x)).toBeLessThan(3);
  expect(Math.abs(resized.y - before.y)).toBeLessThan(3);

  // The body drags the whole box, keeping its size.
  const body = (await page.getByTestId('erase-proposal-rect').boundingBox())!;
  await page.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await page.mouse.down();
  await page.mouse.move(body.x + body.width / 2 + 18, body.y + body.height / 2, { steps: 4 });
  await page.mouse.up();
  const dragged = await proposedRect(page);
  expect(dragged.x).toBeGreaterThan(resized.x + 40);
  expect(Math.abs(dragged.width - resized.width)).toBeLessThan(3);

  // Nothing has been filled by any of this — it is an offer until it is accepted.
  await expect(page.getByTestId('erase-done')).toHaveCount(0);
  await page.getByTestId('erase-proposal-dismiss').click();
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
  await expect(page.getByTestId('erase-done')).toHaveCount(0);
});

test('a proposal against the artwork edge still has grips you can grab', async ({ page }) => {
  // MOST professional lower thirds have no panel at all (the corpus's §4 finding), so their
  // baked words sit against the artwork's own edge and the proposal is drawn clamped to it.
  // Every other fixture here boxes text in the MIDDLE of a panel, so the edge case — where the
  // grips straddle the surface's own boundary and `.wz-prep-surface` clips its overflow — is
  // only ever exercised by driving one. It is driven rather than asserted on, because a
  // clipped element still reports its full box to `boundingBox` and still passes
  // `toBeVisible`: whether the press LANDS is the only honest question.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const base64 = await page.evaluate(async () => {
    const face = new FontFace('Inter', 'url(/fonts/inter.woff2)');
    await face.load();
    document.fonts.add(face);
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 1920, 1080); // panel-less: nothing but the words, on transparency
    g.fillStyle = '#ffffff';
    g.textBaseline = 'top';
    g.font = '700 56px Inter';
    g.fillText('Alexandra Riva', 2, 2);
    return c.toDataURL('image/png').split(',')[1];
  });
  await toPrepare(page, base64, 'edge.png');

  // Clamped to the artwork's own edges. The few source px of slack are the surface's 1px
  // border: `proposedRect` measures against the surface's BORDER box while the overlay is
  // placed against its padding box, and one screen px is three source px at this scale.
  const before = await proposedRect(page);
  expect(before.x).toBeLessThan(10);
  expect(before.y).toBeLessThan(10);

  // A box drawn tight around one line of type is only about a dozen SCREEN px tall, so the
  // vertical drag is small on purpose: a bigger one collapses the box onto its minimum size,
  // where the clamp — not the grip — decides the result and the test proves nothing.
  const grip = (await page.getByTestId('erase-proposal-grip-nw').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 24, grip.y + grip.height / 2 + 4, { steps: 4 });
  await page.mouse.up();

  // The press landed on the grip, so the box resized from its own corner: the far edges held.
  const after = await proposedRect(page);
  expect(after.x).toBeGreaterThan(before.x + 40);
  expect(after.y).toBeGreaterThan(before.y + 8);
  expect(Math.abs(after.x + after.width - (before.x + before.width))).toBeLessThan(6);
  expect(Math.abs(after.y + after.height - (before.y + before.height))).toBeLessThan(6);
});

test('artwork with no baked-in text is offered nothing, and names the rule that refused', async ({ page }) => {
  // The SAME strap exported the way students are told to: with the words left out. A design
  // made of solid shapes carries two stroke edges per shape per row and never reaches the
  // bar, so the honest answer is an empty canvas — a box drawn on the wrong thing costs the
  // student more than one they simply drag themselves.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const base64 = await page.evaluate(async (s) => {
    const c = document.createElement('canvas');
    c.width = 1920;
    c.height = 1080;
    const g = c.getContext('2d')!;
    g.fillStyle = '#101b2e';
    g.fillRect(s.x, s.y, s.w, s.h);
    g.fillStyle = '#f6a623';
    g.fillRect(s.x, s.y, 14, s.h);
    return c.toDataURL('image/png').split(',')[1];
  }, STRAP);
  await toPrepare(page, base64, 'clean.png');

  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await expect(page.getByTestId('erase-proposal-rect')).toHaveCount(0);
  await expect(page.getByTestId('erase-scan-refusal')).toContainText('stroke edges');
  // The manual path is untouched: the question is still asked, and answering it still works.
  await page.getByTestId('baked-yes').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
});

test('detected text walked past unerased follows to the Text step as an honest note', async ({ page }) => {
  // The wizard never blocks Next, so ignoring the proposal must not silently drop the fact:
  // fields placed now would sit ON TOP of the baked words, and nothing said so (the broadcaster-demo
  // complaint "the text is not being removed" was exactly this walk).
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  await page.locator('.wz-next').click();
  const note = page.getByTestId('placefields-baked-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('still part of the artwork');

  // Its door goes back to Prepare, where the proposal still stands.
  await page.getByTestId('placefields-baked-back').click();
  await expect(page.getByTestId('erase-proposal')).toBeVisible();
});

test('"it is meant to be there" is an answer the wizard remembers', async ({ page }) => {
  // A wordmark or a deliberate slogan LOOKS like baked text to the scan. Declaring it
  // intentional must silence the note AND stop Prepare re-proposing on every return - an
  // answer that lasts one render is a nag, not a question.
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  const art = await bakedStrap(page);
  await toPrepare(page, art.base64);
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  await page.locator('.wz-next').click();
  await page.getByTestId('placefields-baked-keep').click();
  await expect(page.getByTestId('placefields-baked-note')).toHaveCount(0);

  // Back on Prepare: no auto-reopened proposal - the quiet "nothing to erase" state, with
  // its own way to change the answer.
  await page.locator('.wz-back').click();
  await expect(page.getByTestId('erase-surface')).toBeVisible();
  await expect(page.getByTestId('erase-proposal')).toHaveCount(0);
  await page.getByTestId('baked-yes').click();
  await expect(page.getByTestId('erase-proposal')).toBeVisible();

  // And forward again: changing the answer back re-arms the note.
  await page.locator('.wz-next').click();
  await expect(page.getByTestId('placefields-baked-note')).toBeVisible();
});
