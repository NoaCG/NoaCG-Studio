// covers: src/model/compositionPlacement.ts, src/preview/composeDocument.ts
// covers: src/components/editorFoundation/**
// covers: src/blocks/{compositionSource,compositionEdits,baseEdits,designLayout,artworkEdits,artworkLayers,svgIdentity,editorAnimation,editorOut,animData,animEdit}.ts
// covers: src/model/structure.ts, src/templates/shared/{animRuntime,easeRuntime}.ts
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx

import { test, expect, type Page } from '@playwright/test';
import { seek as seekGraphic } from './_layerProperty';
import { installGraphicBody } from './_graphicBody';
import { readFileSync, writeFileSync } from 'node:fs';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';
import { settleDurableWrites } from './_durable';
import type { SpxTemplate } from '../src/model/types';
import { dropSvg, boxGrow } from './_svg-import';
import { fileURLToPath } from 'node:url';
import { upgradeSvgFitRuntime } from '../src/assets/svgFitUpgrade';

const fixture = (name: string) => JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-' + name + '.json', import.meta.url), 'utf8')) as SpxTemplate;
async function source(page: Page) { return page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function saveThroughDialog(page: Page, name: string) {
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill(name);
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(page.locator('.ef-document-name')).toHaveText(name);
  await ready(page);
}
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function seed(page: Page, name = 'catalog', nested = false) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async ({ template, nested }) => {
    if (nested) template.html = template.html.replace(/(<text\b[^>]*id="f0"[\s\S]*?<\/text>)/,
      '<g id="test-parent" transform="translate(100,80) rotate(30) scale(2)">$1</g>');
    template.html += '\n<!-- preservation sentinel -->'; template.js += '\n// preservation sentinel';
    (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
    // Answer from a later task: the editor re-renders on that write (rule e2e/async-whose-last-act-starts-work).
    await new Promise((resolve) => setTimeout(resolve));
  }, { template: fixture(name), nested });
  await ready(page);
  await expect((await preview(page)).locator('#f0')).toBeAttached();
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await expect(page.locator('.ef-selection rect')).toHaveCount(1);
}
async function currentHairline(page: Page) {
  await page.goto('/app#/new'); await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
}
async function numeric(page: Page, label: string, value: number) {
  label = 'Base ' + label;
  const summary = page.getByText('Edit base values (preserve motion)', { exact: true });
  const details = page.locator('.ef-inspector details').filter({ has: summary });
  await details.evaluate(el => { (el as HTMLDetailsElement).open = true; });
  await details.getByRole('textbox', { name: label, exact: true }).fill(String(value));
  await details.getByRole('textbox', { name: label, exact: true }).press('Enter');
  await ready(page);
}
async function rect(page: Page, selector: string) {
  return (await preview(page)).locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

test('B04 basic artwork text and appearance controls are available', async ({ page }) => {
  await seed(page);
  await expect(page.getByRole('textbox', { name: 'Artwork text', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Font', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Font size', exact: true })).toBeVisible();
});

test('B04 basic opacity preserves motion and survives history and reopening', async ({ page }) => {
  await seed(page);
  const original = await source(page);
  await page.getByRole('spinbutton', { name: /Opacity %/ }).fill('60');
  await page.getByRole('spinbutton', { name: /Opacity %/ }).press('Enter');
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).opacity)).toBe('0.6');
  expect((await source(page)).js).toBe(original.js);
  const changed = await source(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(changed);
  await saveThroughDialog(page, 'Translucent title');
  await page.reload(); await ready(page);
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).opacity)).toBe('0.6');
  const refused = await page.evaluate(async () => {
    const { applyOperations } = await __noacgImport('/src/components/editorFoundation/operations.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const template = useTemplateStore.getState().template;
    try { applyOperations(template, [{ kind: 'style.set', selector: '.lower-third-box', values: { opacity: .5 } }]); return ''; }
    catch (error) { return String(error); }
  });
  expect(refused).toContain('animated');
});

for (const name of ['catalog', 'svg']) test('B04 artwork content, appearance and structure on ' + name, async ({ page }) => {
  await seed(page, name);
  const initial = await source(page);
  await page.evaluate(async () => {
    (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().setSampleValue('f0', 'Operator sample stays');
    await new Promise((resolve) => setTimeout(resolve));
  });
  const text = page.getByRole('textbox', { name: 'Artwork text', exact: true });
  await text.fill('Evening report');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await preview(page)).locator('#f0')).toHaveText('Evening report');
  expect((await source(page)).js).toBe(initial.js);
  expect(await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData.f0)).toBe('Operator sample stays');
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Archivo' });
  await page.getByRole('textbox', { name: 'Font size', exact: true }).fill('42');
  await page.locator('.ef-appearance-field .grow').fill('#22aa77');
  await page.locator('.ef-appearance-field .grow').press('Enter');
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => {
    const css = getComputedStyle(el); return [css.fontFamily.includes('Archivo'), css.fontSize, el.namespaceURI?.includes('svg') ? css.fill : css.color];
  })).toEqual([true, '42px', 'rgb(34, 170, 119)']);
  const styled = await source(page);
  const selected = (await page.locator('.ef-selection rect').boundingBox())!;
  await page.mouse.dblclick(selected.x + selected.width / 2, selected.y + selected.height / 2);
  await expect(page.locator('.ef-inline-text textarea')).toBeFocused();
  await page.locator('.ef-inline-text textarea').fill('Canceled');
  await page.locator('.ef-inline-text textarea').press('Escape');
  expect(await source(page)).toEqual(styled);
  await page.mouse.dblclick(selected.x + selected.width / 2, selected.y + selected.height / 2);
  await page.locator('.ef-inline-text textarea').fill('Late edition');
  await page.locator('.ef-inline-text').getByRole('button', { name: 'Apply text' }).click();
  await expect((await preview(page)).locator('#f0')).toHaveText('Late edition');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(styled);
  await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
  await ready(page);
  const duplicated = await source(page), newField = duplicated.fields.at(-1)!;
  expect(newField.field).not.toBe('f0'); expect(newField.value).toBe('Evening report');
  await expect((await preview(page)).locator('#' + newField.field)).toHaveText('Evening report');
  await expect(page.locator('.ef-track[data-selector="#' + newField.field + '"]')).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: 'Send backward' }).click(); await ready(page);
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate((el, id) => !!(el.compareDocumentPosition(el.ownerDocument.getElementById(id)!) & Node.DOCUMENT_POSITION_PRECEDING), newField.field)).toBe(true);
  await page.getByRole('button', { name: 'Delete', exact: true }).click(); await ready(page);
  expect((await source(page)).fields).toEqual(styled.fields);
  await expect((await preview(page)).locator('#' + newField.field)).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  await expect((await preview(page)).locator('#' + newField.field)).toHaveText('Evening report');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  await expect((await preview(page)).locator('#' + newField.field)).toHaveCount(0);
});

test('B02 multi-object drag, marquee and cancel share one undo transaction', async ({ page }) => {
  await seed(page);
  await page.locator('.ef-track[data-selector="#f1"] .ef-layer').click({ modifiers: ['Control'] });
  await expect(page.locator('.ef-selection rect')).toHaveCount(2);
  const original = await source(page), a = await rect(page, '#f0'), b = await rect(page, '#f1');
  const selected = (await page.locator('.ef-selection rect').first().boundingBox())!;
  const board = (await page.locator('.ef-artboard').boundingBox())!;
  const factor = board.width / original.resolution.width;
  const start = { x: selected.x + selected.width / 2, y: selected.y + selected.height / 2 };
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 12, { steps: 12 });
  await page.keyboard.press('Escape'); await page.mouse.up(); await ready(page);
  expect(await source(page)).toEqual(original);
  await expect(page.locator('.ef-selection rect')).toHaveCount(2);
  // Cancellation restores source synchronously and rendered geometry on the correlated reply.
  await expect.poll(async () => (await page.locator('.ef-selection rect').first().boundingBox())!.x).toBeCloseTo(selected.x, 1);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x + 30, start.y + 12, { steps: 12 }); await page.mouse.up();
  await expect.poll(async () => (await rect(page, '#f0')).x - a.x).toBeCloseTo(30 / factor, 1);
  await expect.poll(async () => (await rect(page, '#f1')).x - b.x).toBeCloseTo(30 / factor, 1);
  const changed = await source(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(changed);
  // Start in empty stage space and fully enclose the composition.
  await page.mouse.move(board.x - 5, board.y - 5); await page.mouse.down();
  await page.mouse.move(board.x + board.width + 5, board.y + board.height + 5, { steps: 8 }); await page.mouse.up();
  await expect(page.locator('.ef-track[data-selector="#f0"]')).toHaveClass(/is-selected/);
  await expect(page.locator('.ef-track[data-selector="#f1"]')).toHaveClass(/is-selected/);
  expect(await source(page)).toEqual(changed);
});

test('B04 solid fill and reference-sensitive refusal preserve source atomically', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'rectangle tool' }).click();
  const board = (await page.locator('.ef-artboard').boundingBox())!;
  await page.mouse.click(board.x + board.width / 2, board.y + board.height / 3); await ready(page);
  await page.locator('.ef-appearance-field .grow').fill('#ee7722');
  await page.locator('.ef-appearance-field .grow').press('Enter');
  await expect.poll(async () => (await preview(page)).locator('#rectangle-1').evaluate(el => getComputedStyle(el).backgroundColor)).toBe('rgb(238, 119, 34)');
  await page.evaluate(async () => {
    const store = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.applyTemplate({ ...store.template, js: store.template.js + '\nfunction customReference() { return document.getElementById("rectangle-1"); }' });
    await new Promise((resolve) => setTimeout(resolve));
  });
  await ready(page);
  const before = await source(page);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('custom behavior');
  expect(await source(page)).toEqual(before);
});

test('B04 duplicate retains CSS cascade and delete removes rules before an ID can be reused', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const { applyOperations } = await __noacgImport('/src/components/editorFoundation/operations.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const original = useTemplateStore.getState().template;
    const template = { ...original, css: original.css + '\n#f0, #f1 { color: #112233; }\n#f1 { color: #778899; }' };
    const duplicate = applyOperations(template, [{ kind: 'layer.duplicate', selector: '#f0' }]);
    const id = duplicate.changedTargets[0];
    const removed = applyOperations(duplicate.template, [{ kind: 'layer.delete', selector: id }]).template;
    const sheet = new CSSStyleSheet(); sheet.replaceSync(duplicate.template.css);
    const rules = [...sheet.cssRules].filter(r => r instanceof CSSStyleRule).map(r => ({ selector: (r as CSSStyleRule).selectorText, color: (r as CSSStyleRule).style.color }));
    let refused = false;
    try { applyOperations(template, [{ kind: 'text.set', selector: '#f0', text: 'Must not land' }, { kind: 'style.set', selector: '#f1', values: { fontSize: -1 } }]); } catch { refused = true; }
    return { id, rules, removedCss: removed.css, refused, originalUnchanged: useTemplateStore.getState().template === original };
  });
  expect(result.rules.filter(r => r.selector.includes('#f1')).at(-1)?.color).toBe('rgb(119, 136, 153)');
  expect(result.rules.find(r => r.selector === result.id && r.color)?.color).toBe('rgb(17, 34, 51)');
  expect(result.removedCss).not.toContain(result.id + ' ');
  expect(result.refused && result.originalUnchanged).toBe(true);
});

test('B03 multi-object SVG drag maps the same screen delta through different parents', async ({ page }) => {
  await seed(page, 'svg', true);
  await page.locator('.ef-track[data-selector="#f1"] .ef-layer').click({ modifiers: ['Shift'] });
  await expect(page.locator('.ef-selection rect')).toHaveCount(2);
  const before = await source(page), a = await rect(page, '#f0'), b = await rect(page, '#f1');
  const stage = (await page.locator('.ef-artboard').boundingBox())!, factor = stage.width / before.resolution.width;
  const selected = (await page.locator('.ef-selection rect').first().boundingBox())!;
  const x = selected.x + selected.width / 2, y = selected.y + selected.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 12, y + 8, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => (await rect(page, '#f0')).x - a.x).toBeCloseTo(12 / factor, 1);
  await expect.poll(async () => (await rect(page, '#f1')).x - b.x).toBeCloseTo(12 / factor, 1);
  await expect.poll(async () => (await rect(page, '#f0')).y - a.y).toBeCloseTo(8 / factor, 1);
  await expect.poll(async () => (await rect(page, '#f1')).y - b.y).toBeCloseTo(8 / factor, 1);
  expect((await source(page)).js).toBe(before.js);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(before);
});

test('D03 flow offset preserves siblings, exact motion, cancellation, atomic history and saved source', async ({ page }) => {
  await seed(page);
  const original = await source(page), a = await rect(page, '#f0'), sibling = await rect(page, '#f1');
  await numeric(page, 'Layout offset X', 40);
  await expect.poll(async () => (await rect(page, '#f0')).x - a.x).toBeCloseTo(40, 1);
  expect(await rect(page, '#f1')).toEqual(sibling);
  expect((await source(page)).js).toBe(original.js);
  expect((await source(page)).html).toBe(original.html);
  const moved = await source(page);
  const box = (await page.locator('.ef-selection rect').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 45, box.y + box.height / 2 + 12, { steps: 8 });
  expect(await source(page)).toEqual(moved);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect.poll(() => rect(page, '#f0')).toEqual({ ...a, x: a.x + 40 });
  expect(await source(page)).toEqual(moved);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(moved);
  await saveThroughDialog(page, 'R1.1a saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await source(page)).css).toBe(moved.css);
});

test('D03 SVG parent inverse mapping and numeric/canvas agreement', async ({ page }) => {
  await seed(page, 'svg', true);
  const original = await source(page);
  const a = await rect(page, '#f0');
  const x = Number(await page.getByRole('textbox', { name: 'Position X', exact: true }).inputValue());
  const y = Number(await page.getByRole('textbox', { name: 'Position Y', exact: true }).inputValue());
  await numeric(page, 'Position X', x + 20); await numeric(page, 'Position Y', y - 10);
  // The imported design's CSS scale is 1; transformed parent maps the local vector.
  await expect.poll(async () => (await rect(page, '#f0')).x - a.x).toBeCloseTo(44.641016, 1);
  await expect.poll(async () => (await rect(page, '#f0')).y - a.y).toBeCloseTo(2.679492, 1);
  const expected = await rect(page, '#f0');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  const box = (await page.locator('.ef-selection rect').boundingBox())!;
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  const fit = stage.width / 1920;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 44.641016 * fit, box.y + box.height / 2 + 2.679492 * fit, { steps: 8 });
  await page.mouse.up(); await ready(page);
  await expect.poll(async () => (await rect(page, '#f0')).x).toBeCloseTo(expected.x, 1);
  expect((await source(page)).js).toBe(original.js);
  expect((await source(page)).html).toBe(original.html);
});

test('D03 base layout and an existing animation channel remain independent', async ({ page }) => {
  await seed(page, 'f4');
  const original = await source(page), before = await rect(page, '#f0');
  await numeric(page, 'Layout offset X', 40);
  const base = await source(page);
  expect(base.js).toBe(original.js);
  await page.evaluate(async () => {
    const { activeEditorSession } = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const { parseAnimData } = await __noacgImport('/src/blocks/animData.ts');
    const session = activeEditorSession(), data = parseAnimData(session.port.read().js)!;
    const last = data.steps[0].layers['#f0'].x.at(-1)!;
    // Existing R1.0 registry operation; no key-authoring UI is added by this slice.
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(),
      operations: [{ kind: 'key.set', selector: '#f0', step: 0, property: 'x', time: last.time, value: Number(last.value) + 20 }] });
  });
  await ready(page);
  await expect.poll(async () => (await rect(page, '#f0')).x - before.x).toBeCloseTo(60, 1);
  const keyed = await source(page);
  expect(keyed.css).toBe(base.css);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(base);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(original);
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); }
  expect(await source(page)).toEqual(keyed);
});

test('B04 tools create real text fields, shapes, selection and bars; box reflows; undo removes the whole addition', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await seed(page);
  const initial = await source(page);
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  for (const tool of ['rectangle', 'ellipse', 'text']) {
    await page.getByRole('button', { name: tool + ' tool', exact: true }).click();
    const x = stage.x + stage.width * .5, y = stage.y + stage.height * .5;
    await page.mouse.move(x, y); await page.mouse.down();
    if (tool !== 'text') await page.keyboard.down('Shift');
    await page.mouse.move(x + 80, y + 45, { steps: 6 }); await page.mouse.up(); await page.keyboard.up('Shift');
    await ready(page);
    await expect(page.locator('.ef-track.is-selected')).toHaveCount(1);
    await expect(page.locator('.ef-selection rect')).toHaveCount(1);
    if (tool !== 'text') {
      const bounds = await rect(page, '#' + tool + '-1');
      expect(bounds.width).toBeCloseTo(bounds.height, 1);
    }
    // A real panel entrance can leave clip-path:inset(0) on its box. A nonzero DOM
    // rectangle alone cannot prove the newly drawn artwork is actually paintable.
    const selector = tool === 'text' ? '#' + (await source(page)).fields.at(-1)!.field : '#' + tool + '-1';
    expect(await (await preview(page)).locator(selector).evaluate(el => {
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        if (getComputedStyle(parent).clipPath !== 'none') return parent.className;
      }
      return '';
    })).toBe('');
  }
  const result = await source(page);
  const field = result.fields.at(-1)!;
  expect(result.fields.length).toBe(initial.fields.length + 1);
  expect(result.js).toBe(initial.js);
  const textBox = await rect(page, '#fw' + field.field.slice(1));
  const row = await page.locator('.ef-track.is-selected').boundingBox();
  const trackScroll = await page.locator('.ef-track-scroll').boundingBox();
  expect(row!.y + row!.height).toBeLessThanOrEqual(trackScroll!.y + trackScroll!.height + 1);
  expect(row!.y).toBeGreaterThanOrEqual(trackScroll!.y);
  expect(Number(await page.locator('.ef-selection rect').getAttribute('width'))).toBeCloseTo(textBox.width, 1);
  expect(Number(await page.locator('.ef-selection rect').getAttribute('height'))).toBeCloseTo(textBox.height, 1);
  const frame = await preview(page);
  await frame.evaluate(({ id }) => (window as unknown as { update(s: string): void }).update(JSON.stringify({ [id]: 'A longer operator headline that wraps onto several readable lines' })), { id: field.field });
  await expect(frame.locator('#' + field.field)).toContainText('longer operator');
  const before = await rect(page, '#' + field.field);
  // The box's Width sits beside Long text in the type section (R1.2b.2).
  const boxWidth = page.locator('.ef-inspector').getByRole('spinbutton', { name: 'Width', exact: true });
  await boxWidth.fill('120'); await boxWidth.press('Enter'); await ready(page);
  await expect.poll(async () => (await rect(page, '#' + field.field)).height).toBeGreaterThan(before.height);
  const glyphSize = await frame.locator('#' + field.field).evaluate(el => getComputedStyle(el).fontSize);
  expect(glyphSize).toBe('48px');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect((await source(page)).fields).toEqual(initial.fields);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  expect((await source(page)).fields).toEqual(result.fields);
});

for (const name of ['Hairline', 'House Quiz', 'House Countdown', 'Illustrator', 'Stretch']) {
  test('B01 identical final document through both Finish routes: ' + name, async ({ browser }) => {
    const documents: SpxTemplate[] = [];
    const carried: { assets: string; samples: Record<string, string> }[] = [];
    for (const edit of [true, false]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('/app#/new');
      if (name === 'Illustrator' || name === 'Stretch') {
        await dropSvg(page, fileURLToPath(new URL(name === 'Illustrator' ? './fixtures/illustrator-lower-third.svg' : '../docs/svg-samples/quiz-board.svg', import.meta.url)));
        if (name === 'Stretch') await boxGrow(page).selectOption('grow-y');
        await page.locator('.wz-next').click();
        await expect(page.getByTestId('wz-stepcount')).toContainText('4');
        await page.locator('.wz-next').click();
      } else {
        await page.locator('[data-entry="template"]').click(); await pickDesign(page, name);
        await page.getByTestId('wz-skip-to-finish').click();
      }
      await page.getByTestId('wz-finish-name').fill('Same final artwork');
      if (edit) {
        await page.getByTestId('wz-finish-edit-artwork').click();
        await expect(page.getByTestId('editor-foundation')).toBeVisible(); await ready(page);
        expect(await page.evaluate(async () => (await __noacgImport('/src/model/shows.ts')).loadShows().length)).toBe(0);
      } else {
        await addToProductionFromFinish(page);
        await expect(page.getByTestId('production-page')).toBeVisible();
      }
      documents.push(await source(page));
      carried.push(await page.evaluate(async () => {
        const state = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
        return { assets: await (await __noacgImport('/src/components/editorFoundation/PreviewController.ts')).assetDigest(state.template), samples: state.sampleData };
      }));
      await context.close();
    }
    expect(carried[0]).toEqual(carried[1]);
    for (const key of ['name', 'html', 'css', 'js', 'fields', 'layers', 'settings', 'resolution'] as const) {
      expect(documents[0][key], name + ': ' + key).toEqual(documents[1][key]);
    }
    if (name === 'Stretch') expect(documents[0].js).toContain('NOACG_LAYOUT');
  });
}

test('B03 linked/unlinked, negative and zero scale, Shift/Alt pivot and singular refusal', async ({ page }) => {
  await seed(page, 'svg');
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  await page.mouse.click(stage.x + stage.width * .5, stage.y + stage.height * .5); await ready(page);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();
  const original = await rect(page, '#rectangle-1');
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await numeric(page, 'Scale X %', -150);
  await numeric(page, 'Scale Y %', 80);
  expect((await rect(page, '#rectangle-1')).width).toBeCloseTo(original.width * 1.5, 1);
  expect((await rect(page, '#rectangle-1')).height).toBeCloseTo(original.height * .8, 1);
  await numeric(page, 'Scale X %', 0);
  expect((await rect(page, '#rectangle-1')).width).toBe(0);
  await numeric(page, 'Scale X %', 100); await numeric(page, 'Scale Y %', 100);
  await page.getByRole('checkbox', { name: 'Link proportions' }).check();
  const before = await rect(page, '#rectangle-1');
  const handle = (await page.locator('[data-handle="2"]').boundingBox())!;
  await page.keyboard.down('Alt'); await page.keyboard.down('Shift');
  await page.mouse.move(handle.x + 4.5, handle.y + 4.5); await page.mouse.down();
  await page.mouse.move(handle.x + 24.5, handle.y + 12.5, { steps: 8 }); await page.mouse.up();
  await page.keyboard.up('Shift'); await page.keyboard.up('Alt'); await ready(page);
  const after = await rect(page, '#rectangle-1');
  expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 1);
  expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 1);
  expect(after.width / before.width).not.toBeCloseTo(after.height / before.height, 1);
  expect(await page.evaluate(async () => {
    try { (await __noacgImport('/src/components/editorFoundation/useArtworkGesture.ts')).inverseDelta([0, 0, 0, 1], { x: 5, y: 0 }); return ''; }
    catch (e) { return String(e); }
  })).toContain('singular');
});

for (const name of ['catalog', 'svg']) test('B04 edited ' + name + ' survives save/reopen and SPX/CasparCG/OGraf export', async ({ page }) => {
  await seed(page, name);
  const initial = await source(page);
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Nightly news');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await preview(page)).locator('#f0')).toHaveText('Nightly news');
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption('oswald');
  await page.getByRole('textbox', { name: 'Font size', exact: true }).fill('40');
  await page.locator('.ef-appearance-field .grow').fill('#eeaa44');
  await page.locator('.ef-appearance-field .grow').press('Enter');
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).toBe('40px');
  await numeric(page, name === 'catalog' ? 'Layout offset X' : 'Position X', 40);
  await numeric(page, 'Scale X %', 150);
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  for (const [i, tool] of ['rectangle', 'ellipse'].entries()) {
    await page.getByRole('button', { name: tool + ' tool', exact: true }).click();
    await page.mouse.click(stage.x + stage.width * (.25 + i * .15), stage.y + stage.height * .5); await ready(page);
  }
  await page.getByRole('button', { name: 'text tool', exact: true }).click();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2); await ready(page);
  const edited = await source(page), field = edited.fields.at(-1)!.field;
  expect(edited.js).toBe(initial.js);
  // Save through the user surface: a CDP-awaited save promise can be collected when
  // the renamed preview reloads, even though the save and main page both survive.
  const url = page.url();
  await saveThroughDialog(page, 'Export proof');
  await expect(page).toHaveURL(url);
  await settleDurableWrites(page); await page.reload(); await ready(page);
  const reopened = await source(page);
  expect(reopened.html).toBe(edited.html); expect(reopened.css).toBe(edited.css);
  // Saving upgrades a known legacy interpreter, and the SVG fit an older import carried (this
  // fixture predates #2355). Artwork edits, animation data and all other source must still
  // round-trip without changes.
  const preserved = await page.evaluate(async ({ before, after }) => {
    const { losslessAnimData } = await __noacgImport('/src/blocks/animData.ts');
    const { ANIMATION_MARK_OPEN: open, ANIMATION_MARK_CLOSE: close } = await __noacgImport('/src/templates/lowerThirds/animPresets.ts');
    const { ANIM_INTERPRETER_JS } = await __noacgImport('/src/templates/shared/animRuntime.ts');
    const surrounding = (js: string) => [js.slice(0, js.indexOf(open)), js.slice(js.indexOf(close) + close.length)];
    return {
      before: losslessAnimData(before), after: losslessAnimData(after),
      surroundingBefore: surrounding(before), surroundingAfter: surrounding(after),
      current: after.replace(/\r\n/g, '\n').includes(ANIM_INTERPRETER_JS.replace(/\r\n/g, '\n')),
    };
  }, { before: upgradeSvgFitRuntime(initial.js), after: reopened.js });
  expect(preserved.before).not.toBeNull();
  expect(preserved.after).toEqual(preserved.before);
  expect(preserved.surroundingAfter).toEqual(preserved.surroundingBefore);
  expect(preserved.current).toBe(true);
  const root = await page.evaluate(async () => (await __noacgImport('/src/blocks/baseEdits.ts')).creationParent((await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  const relative = (element: Element, root: string) => {
    // In the OGraf package the root is inside the Graphic, read through its body.
    const graphic = element.ownerDocument.querySelector('edited-graphic');
    const a = element.getBoundingClientRect(), b = (graphic ? graphicBody(graphic) : element.ownerDocument).querySelector(root)!.getBoundingClientRect();
    return { x: a.x - b.x, y: a.y - b.y, width: a.width, height: a.height };
  };
  const expected = await (await preview(page)).locator('#f0').evaluate(relative, root);
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async ({ target }) => {
      const t = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await __noacgImport('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, { target });
    const view = await page.context().newPage();
    await view.route('http://edited-output.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      const manifest = JSON.parse(Buffer.from(files[Object.keys(files).find(n => n.endsWith('.ograf.json'))!], 'base64').toString());
      expect(manifest.schema.properties[field]).toBeTruthy();
      await installGraphicBody(view);
      await view.goto('http://edited-output.local/');
      await view.evaluate(async ({ field }) => {
        const mod = await import('http://edited-output.local/graphic.mjs');
        customElements.define('edited-graphic', mod.default);
        const el = document.createElement('edited-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; updateAction(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
        document.body.appendChild(el); await el.load({ data: {} });
        await el.updateAction({ data: { [field]: 'Exported operator text' } }); await el.playAction({});
      }, { field });
    } else {
      await view.goto('http://edited-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
      await view.evaluate(({ field }) => {
        const host = window as unknown as { update(s: string): void; play(): void };
        host.update(JSON.stringify({ [field]: 'Exported operator text' })); host.play();
      }, { field });
    }
    await expect(view.locator('#' + field)).toHaveText('Exported operator text');
    await expect(view.locator('#f0')).toHaveText('Nightly news');
    expect(await view.locator('#f0').evaluate(el => getComputedStyle(el).fontFamily)).toContain('Oswald');
    // Settle against the editor's measured held pose, not a sleep or source-property presence.
    await view.evaluate(() => document.fonts.ready);
    await expect.poll(() => view.locator('#f0').evaluate(relative, root).then(p => p.x), { message: name + ' ' + target + ' horizontal geometry' }).toBeCloseTo(expected.x, 1);
    await expect.poll(() => view.locator('#f0').evaluate(relative, root).then(p => p.y)).toBeCloseTo(expected.y, 1);
    await expect.poll(() => view.locator('#f0').evaluate(relative, root).then(p => p.width)).toBeCloseTo(expected.width, 1);
    for (const shape of ['rectangle', 'ellipse']) {
      const bounds = await view.locator('#' + shape + '-1').evaluate(relative, root);
      expect(bounds.width).toBeCloseTo(120, 1); expect(bounds.height).toBeCloseTo(120, 1);
    }
    expect(await view.locator('#fw' + field.slice(1)).evaluate(el => getComputedStyle(el).position)).toBe('absolute');
    const property = name === 'catalog' ? '--layout-x' : '--base-x';
    expect(await view.locator('#f0').evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), property)).not.toBe('');
    await view.close();
  }
});

test('B04 point text and canceled creation; base scale agrees with handles at zoom', async ({ page }) => {
  await seed(page, 'svg');
  const initial = await source(page);
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  await page.mouse.move(stage.x + 100, stage.y + 100); await page.mouse.down();
  await page.mouse.move(stage.x + 180, stage.y + 150); await page.keyboard.press('Escape'); await page.mouse.up();
  expect(await source(page)).toEqual(initial);
  await page.getByRole('button', { name: 'text tool', exact: true }).click();
  await page.mouse.click(stage.x + stage.width / 2, stage.y + stage.height / 2); await ready(page);
  expect((await source(page)).fields.length).toBe(initial.fields.length + 1);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();
  await numeric(page, 'Scale X %', 150);
  await expect(page.getByRole('textbox', { name: 'Base Scale Y %', exact: true })).toHaveValue('150');
  const scaled = await source(page);
  expect(scaled.html.match(/<svg[\s\S]*?<\/svg>/)?.[0]).toBe(initial.html.match(/<svg[\s\S]*?<\/svg>/)?.[0]);
  await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('1.5');
  const handle = (await page.locator('[data-handle="2"]').boundingBox())!;
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
  await page.mouse.move(handle.x + 25, handle.y + 15, { steps: 6 }); await page.mouse.up(); await ready(page);
  expect((await source(page)).css).not.toBe(scaled.css);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await source(page)).toEqual(scaled);
});

test('B01 optional Finish Edit consumes final catalog result and creates no production', async ({ page }) => {
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-name').fill('Refine artwork');
  await page.getByTestId('wz-finish-edit-artwork').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await ready(page);
  expect((await source(page)).name).toBe('Refine artwork');
  expect(await page.evaluate(async () => (await __noacgImport('/src/model/shows.ts')).loadShows().length)).toBe(0);
  expect(await page.evaluate(async () => (await __noacgImport('/src/model/library.ts')).loadGraphics().length)).toBe(0);
});

test('B01 direct production remains primary', async ({ page }) => {
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await addToProductionFromFinish(page);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
});

test('B03 base scaling preserves an animated catalog line through reload', async ({ page }) => {
  await seed(page);
  const before = await rect(page, '#f0');
  await numeric(page, 'Scale X %', 150);
  await expect.poll(async () => (await rect(page, '#f0')).width).toBeCloseTo(before.width * 1.5, 1);
  await saveThroughDialog(page, 'Scale proof');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  await expect.poll(async () => (await rect(page, '#f0')).width).toBeCloseTo(before.width * 1.5, 1);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await numeric(page, 'Scale X %', 200);
  await expect.poll(async () => (await rect(page, '#f0')).width).toBeCloseTo(before.width * 2, 1);
});

test('D03 refuses competing flow constraints and independent transforms without rewriting source', async ({ page }) => {
  await seed(page);
  const result = await page.evaluate(async () => {
    const original = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { applyOperations } = await __noacgImport('/src/components/editorFoundation/operations.ts');
    return ['position:absolute;right:0', 'display:inline', 'scale:2'].map(rule => {
      const template = { ...original, css: original.css + '\n.lower-third-name { ' + rule + ' }' };
      try { applyOperations(template, [{ kind: 'base.set', selector: '#f0', values: { x: 40 } }]); return ''; }
      catch (error) { return String(error); }
    });
  });
  for (const refusal of result) expect(refusal).toMatch(/placement|position|display|scale|inset/i);
});

test('B03 refuses conflicting animated scale ownership without changing motion', async ({ page }) => {
  await seed(page);
  const refusal = await page.evaluate(async () => {
    const original = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { parseAnimData, spliceAnimData } = await __noacgImport('/src/blocks/animData.ts');
    const animation = parseAnimData(original.js)!;
    animation.steps[0].layers['#f0'].scaleX = [{ time: 0, value: 0 }, { time: 1, value: 1 }];
    const template = { ...original, js: spliceAnimData(original.js, animation)! };
    try {
      (await __noacgImport('/src/blocks/baseEdits.ts')).editBase(template, '#f0', { scaleX: 1.5 });
      return '';
    } catch (error) { return String(error); }
  });
  expect(refusal).toMatch(/scale.*animated|animated.*scale/i);
});

test('E5F whole graphic controls preserve motion, source and durable history', async ({ page }, info) => {
  // Use the current real creation path, rather than upgrading the retained old fixture.
  await currentHairline(page); await page.locator('.ef-track[data-selector=".lower-third"] .ef-layer').click();
  await expect(page.getByRole('textbox', { name: 'Graphic position X', exact: true })).toBeVisible();
  const initial = await source(page);
  const field = (label: string) => page.getByRole('textbox', { name: 'Graphic ' + label, exact: true });
  const set = async (label: string, value: number) => { await field(label).fill(String(value)); await field(label).press('Enter'); await ready(page); };
  const poses = async () => {
    const result = [];
    for (const time of [.16, .56, 1]) { await seekGraphic(page, time); result.push(await Promise.all(['#f0', '#f1', '.lower-third-box'].map(selector => rect(page, selector)))); }
    return result;
  };
  const before = await poses();
  await set('position X', 120); await set('position Y', -30); await set('scale %', 80);
  const changed = await source(page);
  expect({ ...changed, css: initial.css }).toEqual(initial);
  const after = await poses();
  for (let pose = 0; pose < before.length; pose++) for (let layer = 0; layer < before[pose].length; layer++) {
    const a = after[pose][layer], b = before[pose][layer];
    expect(a.x).toBeCloseTo(120 + b.x * .8, 1); expect(a.y).toBeCloseTo(-30 + b.y * .8, 1);
    expect(a.width).toBeCloseTo(b.width * .8, 1); expect(a.height).toBeCloseTo(b.height * .8, 1);
  }
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect((await source(page)).css).toContain('scale: 1;');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(changed);
  await saveThroughDialog(page, 'Whole composition'); await settleDurableWrites(page); const saved = await source(page);
  await page.reload(); await ready(page); expect(await source(page)).toEqual(saved);
  await page.locator('.ef-track[data-selector=".lower-third"] .ef-layer').click();
  await expect(field('position X')).toHaveValue('120'); await expect(field('scale %')).toHaveValue('80');
  await set('position X', -80); await set('position Y', 90); await set('scale %', 125);
  const enlarged = await poses(), enlargedSource = await source(page);
  for (let pose = 0; pose < before.length; pose++) for (let layer = 0; layer < before[pose].length; layer++) {
    const a = enlarged[pose][layer], b = before[pose][layer];
    expect(a.x).toBeCloseTo(-80 + b.x * 1.25, 1); expect(a.y).toBeCloseTo(90 + b.y * 1.25, 1);
    expect(a.width).toBeCloseTo(b.width * 1.25, 1); expect(a.height).toBeCloseTo(b.height * 1.25, 1);
  }
  await page.getByRole('button', { name: 'Reset graphic placement', exact: true }).click(); await ready(page);
  expect((await source(page)).css).toBe(initial.css);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(enlargedSource);
  await set('position X', 120); await set('position Y', -30); await set('scale %', 80); expect((await source(page)).css).toBe(saved.css);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Moved composition');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await preview(page)).locator('#f0')).toHaveText('Moved composition');
  // Draw inside the transformed composition, then compare actual output with the pointer's box.
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  const stage = (await page.locator('.ef-artboard').boundingBox())!;
  const start = { x: stage.x + stage.width * .35, y: stage.y + stage.height * .35 };
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 70, start.y + 40, { steps: 6 }); await page.mouse.up(); await ready(page);
  const drawn = await rect(page, '#rectangle-1'); const t = await source(page);
  expect(drawn.x).toBeCloseTo(t.resolution.width * .35, 0); expect(drawn.y).toBeCloseTo(t.resolution.height * .35, 0);
  expect(drawn.width).toBeCloseTo(70 / stage.width * t.resolution.width, 0); expect(drawn.height).toBeCloseTo(40 / stage.height * t.resolution.height, 0);
  await page.locator('.ef-track[data-selector=".lower-third"] .ef-layer').click();
  await expect(field('scale %')).toHaveValue('80');
  await page.screenshot({ path: info.outputPath('whole-graphic.png') });
});

// Capability checks run in a blank browser: no second scene model or imported source repair.
test('E5F whole graphic draft resets on same-ID session replacement', async ({ page }) => {
  await currentHairline(page); await page.locator('.ef-track[data-selector=".lower-third"] .ef-layer').click();
  const field = page.getByRole('textbox', { name: 'Graphic position X', exact: true });
  const before = await page.evaluate(async () => {
    const state = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    const session = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return { id: state.documentId, template: state.template, history: state.history, instance: session.instanceId, revision: session.version() };
  });
  await field.focus(); await field.fill('377');
  const replacement = await page.evaluate(async () => {
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const state = useTemplateStore.getState();
    // The real adapter owns the replacement; no source/history/identity mutation is needed.
    useTemplateStore.setState({ baseline: { ...state.baseline } });
    await new Promise(resolve => setTimeout(resolve));
    const session = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return { id: useTemplateStore.getState().documentId, instance: session.instanceId, revision: session.version() };
  });
  expect(replacement.id).toBe(before.id); expect(replacement.instance).not.toBe(before.instance); expect(replacement.revision).toEqual(before.revision);
  await expect(field).toHaveValue('0'); await field.focus(); await field.press('Enter'); await page.getByRole('tab', { name: 'Properties', exact: true }).click();
  const after = await page.evaluate(async () => { const state = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState(); return { id: state.documentId, template: state.template, history: state.history }; });
  expect(after).toEqual({ id: before.id, template: before.template, history: before.history });
});

test('E5F unsupported whole graphic sources refuse without mutation', async ({ page }) => {
  await currentHairline(page);
  const results = await page.evaluate(async (original) => {
    const template = original;
    const { editComposition, compositionValues } = await __noacgImport('/src/blocks/compositionEdits.ts');
    const variants = [
      ...['\r', '\u2028', '\u2029'].map(separator => ({ ...template, js: template.js.replace(/^[^\n]*\n/, '// title' + separator + 'document.querySelector("body").style.transform="none";\n') })),
      { ...template, css: template.css + '\nbody { overflow: hidden !important; }' },
      { ...template, css: template.css + '\nhtml body { overflow-x: hidden !important; }' },
      { ...template, css: template.css + '\n@media(min-width:99999px) { body { overflow-y: hidden !important; } }' },
      { ...template, css: template.css + '\nbody { all: initial; }' },
      { ...template, html: template.html.replace('<body>', '<body style="overflow:hidden!important">') },
      { ...template, html: template.html.replace('<body>', '<body style="font-family:serif">') },
      { ...template, html: template.html.replace('</head>', '<style>body{font-family:serif}</style></head>') },
      { ...template, css: template.css.replace('html, body {', '@media(min-width:1px) {html, body {').replace('font-family: var(--font-heading);', 'font-family: var(--font-heading); }') },
      { ...template, js: template.js.replace('var fields =', 'document.querySelector(\'body\').style.transform = \'none\'; var fields =') },
      { ...template, html: template.html.replace('</head>', '<script src="custom.js"></script></head>') },
      { ...template, html: template.html.replace('</head>', '<link rel="stylesheet" href="custom.css"></head>') },
      { ...template, html: template.html.replace('window.SPXGCTemplateDefinition =', 'document.body.remove(); window.SPXGCTemplateDefinition =') },
      { ...template, html: template.html.replace('</head>', '<base href="https://invalid.test"></head>') },
      { ...template, css: template.css + '\nbody { display: contents; }' },
      { ...template, css: template.css + '\nbody { margin-left: 3px; }' },
      { ...template, css: template.css + '\n@media(min-width:1px) { body { width: 99px; } }' },
      { ...template, js: template.js.replace('function noacgMachineState()', 'function changedRuntime()') },
      { ...template, css: template.css + '\nbody { transform: rotate(5deg); }' },
      { ...template, js: template.js + '\nfunction custom() { return document.body; }' },
      { ...template, css: template.css + '\n#f0 { position: fixed; }' },
      { ...template, html: template.html.replace('<body>', '<body><div>').replace('</body>', '</div></body>') },
    ];
    const refused = variants.map(t => { const before = JSON.stringify(t); try { editComposition(t, { scale: .5 }); return { reason: '', same: false }; } catch (cause) { return { reason: String(cause), same: before === JSON.stringify(t) }; } });
    const changed = editComposition(template, { x: 123, y: -45, scale: .75 });
    const reset = editComposition(changed, { x: 0, y: 0, scale: 1 });
    return { refused, values: compositionValues(changed), resetEqual: JSON.stringify(reset) === JSON.stringify(template) };
  }, await source(page));
  for (const result of results.refused) { expect(result.reason).toContain('source is preserved'); expect(result.same).toBe(true); }
  expect(results.values).toEqual({ x: 123, y: -45, scale: .75 }); expect(results.resetEqual).toBe(true);
});

for (const target of ['spx', 'casparcg', 'html-overlay', 'ograf']) test('E5F whole graphic export motion parity: ' + target, async ({ page }) => {
  await currentHairline(page);
  const built = await page.evaluate(async ({ original, target }) => {
    const { editComposition } = await __noacgImport('/src/blocks/compositionEdits.ts');
    const { losslessAnimData } = await __noacgImport('/src/blocks/animData.ts');
    const { composeDocument } = await __noacgImport('/src/preview/composeDocument.ts');
    const t = { ...original,
      html: original.html.replace('</body>', '<div id="left-edge" data-gfx></div><div id="right-edge" data-gfx></div></body>'),
      css: original.css + '\n#left-edge,#right-edge { position:absolute;top:300px;width:100px;height:80px;background:rgb(231,57,71); }\n#left-edge{left:-50px}#right-edge{left:2300px}' }, changed = editComposition(t, { x: 120, y: -30, scale: .8 });
    const exporter = (await __noacgImport('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!;
    const zip = await exporter.build(changed), untransformed = await exporter.build(t);
    const files = async (archive: typeof zip) => Object.fromEntries(await Promise.all(Object.keys(archive.files).filter(n => !archive.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await archive.file(n)!.async('base64')])));
    const pasteboardTemplate = { ...changed, css: changed.css + '\n#left-edge{clip-path:inset(0 0 0 20px)}' };
    const pasteboard = target === 'spx' ? composeDocument(pasteboardTemplate, { simulate: false, authoring: { padX: 200, padY: 100 } }) : '';
    const framed = target === 'spx' ? composeDocument(pasteboardTemplate, { simulate: false }) : '';
    return { framed, pasteboard, baselineFiles: await files(untransformed), unembeddedBaseline: target === 'spx' ? composeDocument(t, { simulate: false }) : '', duration: losslessAnimData(t.js)!.steps[0].duration / losslessAnimData(t.js)!.speed,
      files: Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')]))),
      resolution: changed.resolution };
  }, { original: await source(page), target });
  const baseline = await page.context().newPage(), output = await page.context().newPage();
  for (const view of [baseline, output]) await view.setViewportSize({ width: built.resolution.width, height: built.resolution.height });
  const mount = async (view: Page, files: Record<string, string>) => {
    await view.route('http://whole-output.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await installGraphicBody(view); await view.goto('http://whole-output.local/');
      await view.evaluate(async () => {
        document.body.style.margin = '0';
        const mod = await import('http://whole-output.local/graphic.mjs'); customElements.define('whole-graphic', mod.default);
        const element = document.createElement('whole-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {} });
      });
    } else await view.goto('http://whole-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  };
  await mount(baseline, built.baselineFiles); await mount(output, built.files);
  const poses = async (view: Page, ograf: boolean) => view.evaluate(async ({ ograf, duration }) => {
    await document.fonts.ready;
    type Timeline = { duration(): number; pause(): Timeline; time(time: number, suppress: boolean): void };
    const win = window as unknown as { play(): void; gsap: { globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): Timeline[] } } };
    const element = document.querySelector('whole-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown> };
    if (ograf) await element.playAction({}); else win.play();
    const timeline = win.gsap.globalTimeline.getChildren(false, false, true).filter(t => Math.abs(t.duration() - duration) < .0001).pop();
    if (!timeline) throw Error('Missing actual entrance timeline');
    timeline.pause();
    const body = ograf ? graphicBody(element) : document;
    return [.2, .65, 1].map(fraction => {
      timeline.time(duration * fraction, true);
      return ['#f0', '#f1', '.lower-third-box'].map(selector => {
        const node = body.querySelector(selector)!, rect = node.getBoundingClientRect(), style = getComputedStyle(node);
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, opacity: style.opacity, clip: style.clipPath };
      });
    });
  }, { ograf, duration: built.duration });
  const before = await poses(baseline, target === 'ograf'), after = await poses(output, target === 'ograf');
  for (let pose = 0; pose < before.length; pose++) for (let layer = 0; layer < before[pose].length; layer++) {
    const a = after[pose][layer], b = before[pose][layer];
    expect(a.x, target + ' x').toBeCloseTo(120 + b.x * .8, 1); expect(a.y, target + ' y').toBeCloseTo(-30 + b.y * .8, 1);
    expect(a.width, target + ' width').toBeCloseTo(b.width * .8, 1); expect(a.height, target + ' height').toBeCloseTo(b.height * .8, 1);
    expect(a.opacity).toBe(b.opacity); expect(a.clip).toBe(b.clip);
  }
  if (target === 'spx') {
    const raw = await page.context().newPage(); await raw.setViewportSize({ width: built.resolution.width, height: built.resolution.height }); await raw.setContent(built.unembeddedBaseline);
    const unembedded = await poses(raw, false);
    const control = { unembedded, packagedUntransformed: before, packagedTransformed: after };
    writeFileSync(test.info().outputPath('untransformed-font-control.json'), JSON.stringify(control, null, 2));
    await test.info().attach('untransformed-font-control', { body: JSON.stringify(control), contentType: 'application/json' });
    await raw.close();
  }
  // The frame stays fixed while artwork formerly outside it can move into view.
  await output.setViewportSize({ width: built.resolution.width + 100, height: built.resolution.height });
  await output.evaluate(async () => {
    const style = document.createElement('style'); style.textContent = '*{will-change:auto!important}'; document.head.appendChild(style);
    const frames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    await frames(); style.remove(); await frames();
  });
  const screenshot = await output.screenshot({ omitBackground: true });
  const pixels = await output.evaluate(async b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)); const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
    return [[90, 220], [140, 250], [1970, 220]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
  }, screenshot.toString('base64'));
  writeFileSync(test.info().outputPath('fixed-frame-paint.png'), screenshot);
  await test.info().attach('fixed-frame-paint', { body: screenshot, contentType: 'image/png' });
  expect(pixels).toEqual([[231, 57, 71, 255], [231, 57, 71, 255], [0, 0, 0, 0]]);
  await output.setViewportSize({ width: built.resolution.width, height: built.resolution.height });
  expect(output.viewportSize()).toEqual({ width: built.resolution.width, height: built.resolution.height });
  if (target === 'spx') {
    const pasteboard = await page.context().newPage(); await pasteboard.setViewportSize({ width: built.resolution.width + 400, height: built.resolution.height + 200 }); await pasteboard.setContent(built.pasteboard);
    await pasteboard.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const shot = await pasteboard.screenshot({ omitBackground: true }); writeFileSync(test.info().outputPath('pasteboard-paint.png'), shot);
    const paint = await pasteboard.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return [[285, 320], [305, 320], [2170, 320]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, shot.toString('base64'));
    expect(paint).toEqual([[0, 0, 0, 0], [231, 57, 71, 255], [231, 57, 71, 255]]);
    const framed = await page.context().newPage(); await framed.setViewportSize({ width: built.resolution.width + 100, height: built.resolution.height }); await framed.setContent(built.framed);
    const frameShot = await framed.screenshot({ omitBackground: true }); writeFileSync(test.info().outputPath('same-source-framed-paint.png'), frameShot);
    const framePaint = await framed.evaluate(async b64 => {
      const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0)), bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height), context = canvas.getContext('2d')!; context.drawImage(bitmap, 0, 0);
      return [[85, 220], [105, 220], [1970, 220]].map(([x, y]) => [...context.getImageData(x, y, 1, 1).data]);
    }, frameShot.toString('base64'));
    expect(framePaint.slice(0, 2)).toEqual(paint.slice(0, 2)); expect(framePaint[2]).toEqual([0, 0, 0, 0]);
    await framed.close(); await pasteboard.close();
  }
  await baseline.close(); await output.close();
});
