import { enableAdvancedMode, finishIntoEditor } from './_create';
import { test, expect, type Page, type FrameLocator } from '@playwright/test';
import { awaitPreviewRebuild } from './_preview';
import { showCode } from './_code';
import { chooseType, pickDesign } from './_browse';

// The UX overhaul: preview-over-tabs layout, validation inside Export, motion phase
// control + auto-replay (on the timeline strip — the Motion tab is retired), add-field
// in Data, and the editor's change highlighting.

async function createHairline(page: Page) {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
}

function frame(page: Page): FrameLocator {
  return page.frameLocator('iframe.preview-frame');
}

test('layout: code dock left ONCE OPENED, canvas + timeline in the centre, tool tabs right', async ({ page }) => {
  await createHairline(page);
  // The code pane ships CLOSED (model/layout.ts); opened, it takes the left of the centre.
  await showCode(page);
  const editor = await page.locator('.editor-host').boundingBox();
  const stage = await page.locator('.preview-stage').boundingBox();
  const rightTabs = await page.locator('[data-testid="dock-right"] .dock-tabs').boundingBox();
  expect(editor && stage && rightTabs).toBeTruthy();
  // Code on the left of the centre stage…
  expect(editor!.x + editor!.width).toBeLessThanOrEqual(stage!.x + 2);
  // …and the tool tabs are a dock to the RIGHT of the stage.
  expect(rightTabs!.x).toBeGreaterThanOrEqual(stage!.x + stage!.width - 4);
  // The right dock holds the Inspector plus the focused tool panels — Blocks/Learn/Validate
  // are gone; Content = design values, Rehearse = the in-editor operator view; Motion lives on
  // the timeline, not in a tab.
  await expect(page.locator('[data-testid="dock-right"] .dock-tab-label')).toHaveText([
    'Inspector', 'Content', 'Rehearse', 'Style', 'Assets', 'AI', 'Export',
  ]);
});

test('export: validation shows inline and gates the download on a broken template', async ({ page }) => {
  await createHairline(page);
  await page.getByTestId('dock-tab-export').click();
  await expect(page.locator('.panel-body .status-ok')).toContainText('valid and ready');
  // Break the runtime: blank the JS in the editor (the pane ships closed — open it first).
  await showCode(page);
  await page.locator('.tabs .tab', { hasText: 'JS' }).click();
  await page.locator('.editor-host .monaco-editor').click();
  await page.keyboard.press('Control+a');
  await page.keyboard.type('// gone');
  await expect(page.locator('.panel-body .status-bad')).toContainText('must be fixed before export');
  await expect(page.getByRole('button', { name: /Validate & download/ })).toBeDisabled();
});


test('data: add-field lands as a REAL line on a catalog template, in the assembler\'s own idiom', async ({ page }) => {
  await createHairline(page);
  await page.getByTestId('dock-tab-data').click();
  await page.getByPlaceholder(/Label the operator sees/).fill('Sponsor');
  await awaitPreviewRebuild(page, () => page.getByRole('button', { name: '+ Add' }).click());
  // The field landed in the definition (f2 after the two lines)…
  const html = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template.html;
  });
  expect(html).toContain('"title": "Sponsor"');
  // …and — the part the definition-only add used to skip — as a REAL element in the
  // standard line idiom, so update() has somewhere to write. It renders in the preview and
  // arrives selected, like any wizard-made line (that selection reveals the Inspector, which
  // is why the Data panel is re-opened before its row is asserted).
  expect(html).toMatch(/<span id="f2" class="lower-third-[a-z]+">Sponsor<\/span>/);
  await expect(frame(page).locator('#f2')).toHaveText('Sponsor');
  const selected = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().selectedPart;
  });
  expect(selected).toBe('#f2');
  await page.getByTestId('dock-tab-data').click();
  await expect(page.locator('.field-row', { hasText: 'Sponsor' })).toBeVisible();
  // …and for someone with the code pane open, it switched to HTML and highlighted the change.
  await showCode(page);
  await expect(page.locator('.tabs .tab.active')).toHaveText('HTML');
  await expect(page.locator('.editor-host .changed-line').first()).toBeVisible();
});

test('data: the catalog-line add is gated on the standard line SHAPE, never the category', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const result = await page.evaluate(async () => {
    const { variantById } = await import('/src/templates/catalog.ts');
    const { addCatalogLine } = await import('/src/blocks/edit.ts');
    const tryAdd = (id: string) =>
      addCatalogLine(variantById(id)!.create({}), { title: 'Extra', ftype: 'textfield' }) !== null;
    return {
      lowerThird: tryAdd('lt01'),
      infoCard: tryAdd('card01'),
      // Fixed contracts and data-driven categories fail the shape gate - the Data panel
      // then REFUSES the add with the reason (a definition-only field nothing shows is the
      // silent on-air no-op this gate exists to end): a scoreboard's cells are a grid
      // ({p}-team / {p}-score, not the line ladder), a quiz's rows are their own shape, a
      // ticker's lines live in one hidden textarea source.
      scoreboard: tryAdd('sb01'),
      quiz: tryAdd('qz01'),
      ticker: tryAdd('tk01'),
    };
  });
  expect(result).toEqual({ lowerThird: true, infoCard: true, scoreboard: false, quiz: false, ticker: false });
});

test('wizard: direction control mixes a different exit preset at create', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, 'Lower thirds');
  await pickDesign(page, 'Hairline');
  await page.getByRole('button', { name: 'Next →' }).click(); // Fields
  await page.getByRole('button', { name: 'Next →' }).click(); // Style
  await page.getByRole('button', { name: 'Next →' }).click(); // Animation
  // Default direction: one matched style for the entrance AND the exit.
  await expect(page.locator('.wz-step button.active', { hasText: 'In and out' })).toBeVisible();
  // Switch only the exit; the direction hint reflects the mix. The slide family is one
  // card with a direction-of-travel picker — ↓ picks the slide-down exit. Scoped to the
  // TRAVEL box: the universal bank's Slide family draws its own arrows in the same
  // vocabulary (and the same class) further down the step, so a bare `.wz-anim-dirs`
  // matches two ↓ buttons that pick two different things.
  await page.getByRole('button', { name: 'Out only' }).click();
  await page.locator('.wz-anim-travel .wz-anim-dirs button', { hasText: '↓' }).click();
  await expect(page.locator('.wz-step .hint').first()).toContainText('Out Slide down');
  await awaitPreviewRebuild(page, async () => {
    await finishIntoEditor(page);
    await expect(page.locator('.wz-modal')).toBeHidden();
  });
  // Lower thirds create as data blocks: the mix is real keyframe data — the entrance
  // keeps Line reveal's choreography (the accent draws in) while the Out step carries
  // Slide down's exit (the box lifts away: y + opacity keyframes).
  const data = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    return parseAnimData(useTemplateStore.getState().template.js);
  });
  expect(data).not.toBeNull();
  expect(Object.keys(data!.steps[0].layers['.lower-third-accent'] ?? {})).toContain('scaleX');
  const outBox = data!.steps[data!.steps.length - 1].layers['.lower-third-box'] ?? {};
  expect(Object.keys(outBox)).toEqual(expect.arrayContaining(['y', 'opacity']));
  // …and the mixed runtime already rebuilt above — play it.
  await page.getByRole('button', { name: '▶ Play' }).click();
  await expect
    .poll(async () => frame(page).locator('.lower-third').evaluate((el) => getComputedStyle(el).opacity))
    .toBe('1');
});

test('style: a color change highlights the changed CSS lines', async ({ page }) => {
  await createHairline(page);
  await showCode(page); // the highlight below lives in the code pane, which ships closed
  await page.getByTestId('dock-tab-style').click();
  const accentRow = page.getByTestId('style-var-accent');
  await accentRow.locator('input[type="color"]').evaluate((el) => {
    const input = el as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(input, '#ff0066');
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect(page.locator('.editor-host .changed-line').first()).toBeVisible({ timeout: 5000 });
});
