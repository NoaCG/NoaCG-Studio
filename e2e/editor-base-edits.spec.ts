import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pickDesign } from './_browse';
import { addToProductionFromFinish } from './_create';
import { settleDurableWrites } from './_durable';
import type { SpxTemplate } from '../src/model/types';
import { dropSvg, boxGrow } from './_svg-import';
import { fileURLToPath } from 'node:url';

const fixture = (name: string) => JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-' + name + '.json', import.meta.url), 'utf8')) as SpxTemplate;
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
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
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
  }, { template: fixture(name), nested });
  await ready(page);
  await expect((await preview(page)).locator('#f0')).toBeAttached();
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await expect(page.locator('.ef-selection rect')).toHaveCount(1);
}
async function numeric(page: Page, label: string, value: number) {
  await page.getByRole('textbox', { name: label, exact: true }).fill(String(value));
  await page.getByRole('textbox', { name: label, exact: true }).press('Enter');
  await ready(page);
}
async function rect(page: Page, selector: string) {
  return (await preview(page)).locator(selector).evaluate(el => {
    const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
}

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
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
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
  await numeric(page, 'Box width', 120);
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
        expect(await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().length)).toBe(0);
      } else {
        await addToProductionFromFinish(page);
        await expect(page.getByTestId('production-page')).toBeVisible();
      }
      documents.push(await source(page));
      carried.push(await page.evaluate(async () => {
        const state = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
        return { assets: await (await import('/src/components/editorFoundation/PreviewController.ts')).assetDigest(state.template), samples: state.sampleData };
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
    try { (await import('/src/components/editorFoundation/useArtworkGesture.ts')).inverseDelta([0, 0, 0, 1], { x: 5, y: 0 }); return ''; }
    catch (e) { return String(e); }
  })).toContain('singular');
});

for (const name of ['catalog', 'svg']) test('B04 edited ' + name + ' survives save/reopen and SPX/CasparCG/OGraf export', async ({ page }) => {
  await seed(page, name);
  const initial = await source(page);
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
  // Save through the user surface: a CDP-awaited save promise can be collected when
  // the renamed preview reloads, even though the save and main page both survive.
  const url = page.url();
  await saveThroughDialog(page, 'Export proof');
  await expect(page).toHaveURL(url);
  await settleDurableWrites(page); await page.reload(); await ready(page);
  const reopened = await source(page);
  expect(reopened.html).toBe(edited.html); expect(reopened.css).toBe(edited.css); expect(reopened.js).toBe(initial.js);
  const root = await page.evaluate(async () => (await import('/src/blocks/baseEdits.ts')).creationParent((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  const relative = (element: Element, root: string) => {
    const a = element.getBoundingClientRect(), b = element.ownerDocument.querySelector(root)!.getBoundingClientRect();
    return { x: a.x - b.x, y: a.y - b.y, width: a.width, height: a.height };
  };
  const expected = await (await preview(page)).locator('#f0').evaluate(relative, root);
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async ({ target }) => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
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
  await numeric(page, 'Scale X %', 150);
  await expect(page.getByRole('textbox', { name: 'Scale Y %', exact: true })).toHaveValue('150');
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
  expect(await page.evaluate(async () => (await import('/src/model/shows.ts')).loadShows().length)).toBe(0);
  expect(await page.evaluate(async () => (await import('/src/model/library.ts')).loadGraphics().length)).toBe(0);
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
    const original = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
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
    const original = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const animation = parseAnimData(original.js)!;
    animation.steps[0].layers['#f0'].scaleX = [{ time: 0, value: 0 }, { time: 1, value: 1 }];
    const template = { ...original, js: spliceAnimData(original.js, animation)! };
    try {
      (await import('/src/blocks/baseEdits.ts')).editBase(template, '#f0', { scaleX: 1.5 });
      return '';
    } catch (error) { return String(error); }
  });
  expect(refusal).toMatch(/scale.*animated|animated.*scale/i);
});
