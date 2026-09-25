import { test, expect, type Page } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { lowerThirdPng } from './_png';
import { elementPoint } from './_canvas';
import { enableAdvancedMode, createProject } from './_create';
import { durableValue } from './_storage';

// The canvas TEXT TOOLS (the stage toolbar's T / area-text switch, placed designs): the T
// tool clicks point text onto the artwork and types it directly on the canvas; the area
// tool drags out a wrapping lorem-filled text box. Both create REAL fields through the
// exact transform the Data tab's add runs (blocks/designLayout.ts addPlacedLine), so every
// created text is an SPX DataField, a registry layer, a timeline row, and an Inspector
// subject with the next free fN id — never a second text-object system.

async function createBareDesign(page: Page) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles({
    name: 'lower-third.png',
    mimeType: 'image/png',
    buffer: lowerThirdPng(1920, 1080),
  });
  await awaitPreviewRebuild(page, async () => {
    // DESIGN MODE keeps the footer's "Create project" (create from any step); the
    // skip-to-finish shortcut is template mode's.
    await page.getByRole('button', { name: 'Create project' }).click();
    // 20 s: Create fires applyGenerated, which formats the new template through Prettier -
    // five lazy dynamic imports (standalone + the html/postcss/babel/estree plugins), cold on
    // this page's first create. The modal only closes once that resolves, so the default 7 s
    // expect budget was timing a cold module load as if it were a render. Same cost, same
    // fix, as video-project.spec.ts's blank-create wait.
    await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 20_000 });
  });
}

/** The template's field/placement/fit state, read through the same modules the app uses. */
async function fieldState(page: Page) {
  return page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { placedLines, lineFit } = await import('/src/blocks/designLayout.ts');
    const s = useTemplateStore.getState();
    return {
      fields: s.template.fields.map((f) => ({ field: f.field, title: f.title, value: f.value })),
      placed: placedLines(s.template.html, s.template.css),
      fits: Object.fromEntries(
        s.template.fields.map((f) => [f.field, lineFit(s.template.html, s.template.css, f.field)]),
      ),
      sampleData: s.sampleData,
      selected: s.selectedPart,
      tool: s.canvasTool,
    };
  });
}

test('T tool: click places point text, typing lands on the canvas, Enter commits a real f0', async ({ page }) => {
  await createBareDesign(page);

  // Arm the tool — the canvas takes the text cursor and the toolbar shows the armed state.
  await page.getByTestId('tool-text').click();
  await expect(page.getByTestId('tool-text')).toHaveClass(/active/);
  await expect(page.getByTestId('canvas-layer')).toHaveClass(/tool-text/);

  // Click a known spot on the artwork (25% across, 50% down = design px 480, 540).
  const p = await elementPoint(page, '.imported-design-box', 0.25, 0.5);
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.click(p.x, p.y);
    // The field exists immediately and the inline editor is open on it — type straight away.
    await expect(page.getByTestId('inline-editor')).toBeVisible();
  });

  // Typing shows on the CANVAS while the edit is still open (type-on-canvas, not a form).
  await page.keyboard.type('Hello world');
  await expect(page.frameLocator('iframe.preview-frame').locator('#f0')).toHaveText('Hello world');

  await awaitPreviewRebuild(page, () => page.keyboard.press('Enter'));

  const s = await fieldState(page);
  expect(s.fields).toEqual([{ field: 'f0', title: 'Text 1', value: 'Hello world' }]);
  expect(s.sampleData['f0']).toBe('Hello world');
  expect(s.selected).toBe('#f0');
  expect(s.tool).toBe('select'); // the tool disarms after creating (the Figma-style exit)
  // Placed where the click landed: x at the click, y one line-height above it (the click is
  // the text's insertion point, so the glyphs land on it instead of hanging below).
  const place = s.placed['#f0']!;
  expect(place).toBeTruthy();
  expect(Math.abs(place.x - 480)).toBeLessThanOrEqual(3);
  expect(Math.abs(place.y - (540 - 31))).toBeLessThanOrEqual(4); // 31 = the default line size
  // A real registry layer: the timeline row speaks the field's title.
  await expect(page.locator('.tlv2-labels .timeline-label[data-part="#f0"]')).toContainText('Text 1');
  // The desktop chip advertises the placed-field gestures that genuinely exist here.
  await expect(page.getByTestId('selection-chip')).toContainText('Double-click edits · drag places · arrows nudge');
});

test('T tool: Escape (or committing empty) removes the just-created field again', async ({ page }) => {
  await createBareDesign(page);

  await page.getByTestId('tool-text').click();
  const p = await elementPoint(page, '.imported-design-box', 0.3, 0.4);
  await page.mouse.click(p.x, p.y);
  await expect(page.getByTestId('inline-editor')).toBeVisible();

  // Nothing typed — Escape discards the empty text object with its creation.
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('inline-editor')).toBeHidden();
  const s = await fieldState(page);
  expect(s.fields).toEqual([]);
  expect(s.tool).toBe('select');
});

test('T tool: ids continue the existing sequence — a Data-tab f0 makes the tool text f1', async ({ page }) => {
  await createBareDesign(page);

  // First field through the Data tab's add (the panel is the active tab after create).
  await page.locator('.field-add-row input').fill('Name');
  await awaitPreviewRebuild(page, () => page.getByRole('button', { name: '+ Add' }).click());

  await page.getByTestId('tool-text').click();
  const p = await elementPoint(page, '.imported-design-box', 0.5, 0.3);
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('inline-editor')).toBeVisible();
  });
  await page.keyboard.type('Second');
  await awaitPreviewRebuild(page, () => page.keyboard.press('Enter'));

  const s = await fieldState(page);
  expect(s.fields.map((f) => f.field)).toEqual(['f0', 'f1']);
  expect(s.fields[1]).toEqual({ field: 'f1', title: 'Text 2', value: 'Second' });
  expect(s.placed['#f0']).toBeTruthy(); // the Data-tab line is untouched
  expect(s.placed['#f1']).toBeTruthy();
});

test('area tool: a drag becomes a wrapping lorem text box of the dragged width', async ({ page }) => {
  await createBareDesign(page);

  await page.getByTestId('tool-area-text').click();
  await expect(page.getByTestId('canvas-layer')).toHaveClass(/tool-area-text/);

  // Drag from 10%,30% to 40%,50% of the artwork = a 576-design-px-wide box at 192, 324.
  const a = await elementPoint(page, '.imported-design-box', 0.1, 0.3);
  const b = await elementPoint(page, '.imported-design-box', 0.4, 0.5);
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await expect(page.getByTestId('canvas-area-draft')).toBeVisible();
    await page.mouse.up();
  });

  const s = await fieldState(page);
  expect(s.fields).toHaveLength(1);
  expect(s.fields[0].field).toBe('f0');
  expect(s.fields[0].value).toContain('Lorem ipsum'); // typography visible immediately
  expect(s.selected).toBe('#f0');
  expect(s.tool).toBe('select');
  const place = s.placed['#f0']!;
  expect(Math.abs(place.x - 192)).toBeLessThanOrEqual(3);
  expect(Math.abs(place.y - 324)).toBeLessThanOrEqual(3);
  const fit = s.fits['f0']!;
  expect(fit.mode).toBe('wrap');
  expect(Math.abs((fit.maxWidth ?? 0) - 576)).toBeLessThanOrEqual(5);

  // It genuinely wraps: multiple rows inside the drawn width, not one long line.
  const el = page.frameLocator('iframe.preview-frame').locator('#f0');
  await expect(el).toContainText('Lorem ipsum');
  const box = await el.evaluate((n) => {
    const r = n.getBoundingClientRect();
    return { width: r.width, height: r.height, fontSize: parseFloat(getComputedStyle(n).fontSize) };
  });
  expect(box.width).toBeLessThanOrEqual(578);
  expect(box.height).toBeGreaterThan(box.fontSize * 2); // at least two wrapped rows
});

test('area tool: the corner handle resizes the box and the text rewraps to it', async ({ page }) => {
  await createBareDesign(page);

  await page.getByTestId('tool-area-text').click();
  const a = await elementPoint(page, '.imported-design-box', 0.1, 0.3);
  const b = await elementPoint(page, '.imported-design-box', 0.35, 0.5);
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 6 });
    await page.mouse.up();
  });
  const before = (await fieldState(page)).fits['f0']!;

  // Let the deferred Inspector reveal settle before measuring screen positions (the Style
  // tab appearing doubles as proof the created field is a placed-field Inspector subject).
  await expect(page.getByTestId('inspector-tab-style')).toBeVisible();

  // The selected area box swaps the font-size handle for a WIDTH handle (the area gesture).
  const handle = page.getByTestId('line-size-handle');
  await expect(handle).toBeVisible();
  const hb = (await handle.boundingBox())!;
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.move(hb.x + 5, hb.y + 5);
    await page.mouse.down();
    await page.mouse.move(hb.x + 90, hb.y + 5, { steps: 5 });
    await page.mouse.up();
  });

  const after = (await fieldState(page)).fits['f0']!;
  expect(after.mode).toBe('wrap');
  expect(after.maxWidth!).toBeGreaterThan(before.maxWidth!);
  // Font size was NOT touched — the handle resized the box, not the type.
  const rule = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.css.match(/#f0 \{[^}]*\}/)?.[0] ?? '';
  });
  expect(rule).toContain('font-size: calc(31px * var(--scale))');
});

test('text tools: Escape disarms back to Select and the canvas gestures return', async ({ page }) => {
  await createBareDesign(page);

  await page.getByTestId('tool-area-text').click();
  await expect(page.getByTestId('canvas-layer')).toHaveClass(/tool-area-text/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('canvas-layer')).not.toHaveClass(/tool-area-text/);
  await expect(page.getByTestId('tool-select')).toHaveClass(/active/);

  // T arms the type tool from the keyboard (the classic key) — but never while typing.
  await page.keyboard.press('t');
  await expect(page.getByTestId('canvas-layer')).toHaveClass(/tool-text/);
  await page.keyboard.press('Escape');
  await page.locator('.field-add-row input').click();
  await page.keyboard.press('t');
  await expect(page.getByTestId('canvas-layer')).not.toHaveClass(/tool-text/);
  const s = await fieldState(page);
  expect(s.fields).toEqual([]); // nothing was created by any of this
});

test('tool-created text survives a reload as a real field of the saved project', async ({ page }) => {
  await createBareDesign(page);

  await page.getByTestId('tool-text').click();
  const p = await elementPoint(page, '.imported-design-box', 0.2, 0.6);
  await awaitPreviewRebuild(page, async () => {
    await page.mouse.click(p.x, p.y);
    await expect(page.getByTestId('inline-editor')).toBeVisible();
  });
  await page.keyboard.type('Persistent');
  await awaitPreviewRebuild(page, () => page.keyboard.press('Enter'));

  // The project autosaves on an 800 ms debounce — wait for the write, then reload.
  await expect
    // The DURABLE copy, not the app's own read: a reload restores what the database holds
    // (e2e/_storage.ts durableValue).
    .poll(async () => (await durableValue(page, 'spx-gfx-project'))?.includes('Persistent') ?? false)
    .toBe(true);
  await page.reload();
  // The restored project opens directly — no wizard over a returning user's work.
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.wz-modal')).toBeHidden();
  const fields = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.fields.map((f) => ({ field: f.field, value: f.value }));
  });
  expect(fields).toEqual([{ field: 'f0', value: 'Persistent' }]);
});

test('the text tools are a placed-design surface: a catalog template offers no toolbar switch', async ({ page }) => {
  await createProject(page, 'Hairline');
  await expect(page.getByTestId('tool-switch')).toHaveCount(0);
});
