// covers: src/components/editorFoundation/**
// covers: src/blocks/{baseEdits,designLayout,artworkEdits,artworkLayers,svgIdentity,editorAnimation,editorOut,animData,animEdit}.ts
// covers: src/model/structure.ts, src/templates/shared/{animRuntime,easeRuntime}.ts
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx

import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';

test('Quiz source-controlled animation is preserved and explains the base editing path', async ({ page }) => {
  await page.goto('/app#/new'); await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'House Quiz');
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  const before = await source(page);
  await select(page, '#f0');
  await expect(page.locator('.ef-inspector')).toContainText('Canvas edits base placement');
  expect((await source(page)).js).toBe(before.js);
});

async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function seek(page: Page, time: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  const before = Number(await ruler.getAttribute('aria-valuenow'));
  // Exact public ruler click for times that aren't a ten-frame multiple.
  const extent = await page.evaluate(async () => Math.max(2, (await import('/src/components/editorFoundation/timelineView.ts')).readTimeline((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template).duration * 1.15));
  const box = (await ruler.boundingBox())!;
  const request = await page.getByTestId('foundation-canvas').getAttribute('data-request');
  await page.mouse.click(box.x + time / extent * box.width, box.y + 20);
  if (Math.abs(before - time) > .00001) await expect.poll(() => page.getByTestId('foundation-canvas').getAttribute('data-request')).not.toBe(request);
  await ready(page);
}
async function setup(page: Page, spans: boolean | 'entrance' = false) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const selectors = await page.evaluate(async spans => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    let template = useTemplateStore.getState().template;
    template = { ...template, fps: 25, html: template.html + '<!-- preserve artwork -->',
      js: replaceRegionWithAnimData(template.js, { version: 2, root: parseAnimData(template.js)!.root, speed: 1, steps: [{ name: 'In', duration: 3, ease: 'none', layers: {} }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] })! + '\n// preserve user code' };
    const text = createArtwork(template, { shape: 'text', x: -600, y: -400, width: 320, height: 64 });
    const box = createArtwork(text.template, { shape: 'rectangle', x: -350, y: -220, width: 200, height: 100 });
    template = box.template;
    if (spans) {
      const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
      const data = parseAnimData(template.js)!;
      data.steps[0].spans = spans === 'entrance' ? { [text.selector]: [{ start: 0, end: 2.4 }], [box.selector]: [{ start: 0, end: 2.4 }] } : { [box.selector]: [{ start: .4, end: 1.4 }, { start: 1.8, end: 2.4 }] };
      if (spans !== 'entrance') data.steps[0].layers[box.selector] = { x: [{ time: .4, value: 0 }, { time: 1.4, value: 300 }] };
      template = { ...template, js: spliceAnimData(template.js, data)! };
    }
    useTemplateStore.getState().applyTemplate(template);
    useTemplateStore.getState().setSelectedParts([text.selector]);
    return [text.selector, box.selector];
  }, spans);
  await ready(page);
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Animation title');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click(); await ready(page);
  return selectors;
}
async function data(page: Page) { return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!); }
async function select(page: Page, selector: string) { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).click(); await ready(page); }
async function number(page: Page, label: string, value: string) {
  const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: label, exact: true });
  await input.fill(value); await input.press('Enter'); await ready(page);
}

for (const width of [1920, 1366, 1093]) test('text and box second keys, cancel, history and reopen ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1920 ? 1080 : width === 1366 ? 768 : 614 });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message)); page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const selectors = await setup(page, 'entrance'); await seek(page, 0);
  const original = await source(page);
  await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('0.5');
  const scale = (await page.locator('.ef-artboard').boundingBox())!.width / 1920;
  const dx = 700 * scale, dy = 20 * scale;
  for (const selector of selectors) {
    await select(page, selector);
    expect(await (await preview(page)).locator(selector).evaluate(el => el.getBoundingClientRect().right)).toBeLessThan(0);
    for (const name of ['Position X', 'Opacity']) { await page.getByRole('button', { name: 'Enable ' + name + ' animation', exact: true }).click(); await ready(page); }
    const tracks = (await data(page)).steps[0].layers[selector];
    expect(tracks.x).toHaveLength(1); expect(tracks.opacity).toHaveLength(1); expect(tracks.x[0].time).toBe(0);
  }
  await seek(page, 1);
  for (const selector of selectors) {
    await select(page, selector);
    const before = await source(page), startKeys = (await data(page)).steps[0].layers[selector];
    const bounds = (await page.locator('.ef-selection rect').boundingBox())!;
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 12 });
    await page.keyboard.press('Escape'); await page.mouse.up(); await ready(page);
    expect(await source(page)).toEqual(before);
    await expect.poll(async () => { const b = await page.locator('.ef-selection rect').boundingBox(); return b && [b.x, b.y]; }).toEqual([bounds.x, bounds.y]);
    await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
    await page.mouse.move(bounds.x + bounds.width / 2 + dx, bounds.y + bounds.height / 2 + dy, { steps: 12 }); await page.mouse.up(); await ready(page);
    const moved = await source(page), tracks = (await data(page)).steps[0].layers[selector];
    expect(tracks.x).toHaveLength(2); expect(tracks.x[0]).toEqual(startKeys.x[0]); expect(tracks.x[1].time).toBeCloseTo(1, 2);
    expect(tracks.y).toBeUndefined(); // separated unarmed axis edits only its base
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(before);
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(moved);
    const opacity = page.getByRole('spinbutton', { name: 'Opacity %', exact: true });
    await opacity.fill('35'); await opacity.press('Escape'); expect(await source(page)).toEqual(moved);
    await opacity.fill('75'); await opacity.press('Enter'); await ready(page);
    expect((await data(page)).steps[0].layers[selector].opacity).toHaveLength(2);
  }
  // Move the imported box's body, carrying its two property tracks by ten frames.
  const beforeBar = await source(page), keys = (await data(page)).steps[0].layers[selectors[1]];
  const bar = page.locator(`.ef-track[data-selector="${selectors[1]}"] .ef-bar`).first();
  const lane = (await bar.locator('..').boundingBox())!, barBounds = (await bar.boundingBox())!;
  const shift = lane.width * .4 / 4.6;
  await page.mouse.move(barBounds.x + 18, barBounds.y + 5); await page.mouse.down(); await page.mouse.move(barBounds.x + 18 + shift, barBounds.y + 5, { steps: 8 }); await page.mouse.up(); await ready(page);
  expect((await data(page)).steps[0].layers[selectors[1]].x.map(k => k.time)).toEqual(keys.x.map(k => k.time + .4));
  const authored = await source(page);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(beforeBar);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(authored);
  expect(authored.html).toBe(original.html); expect(authored.js).toContain('// preserve user code');
  await seek(page, .5);
  const mid = await (await preview(page)).locator(selectors[1]).evaluate(el => [getComputedStyle(el).transform, getComputedStyle(el).opacity]);
  await seek(page, 1); await seek(page, 0); await seek(page, .5);
  expect(await (await preview(page)).locator(selectors[1]).evaluate(el => [getComputedStyle(el).transform, getComputedStyle(el).opacity])).toEqual(mid);
  await seek(page, 0); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(async () => Number(await page.getByRole('slider', { name: 'Playhead' }).getAttribute('aria-valuenow'))).toBeGreaterThan(.3);
  await page.getByRole('button', { name: 'Pause', exact: true }).click(); expect(await source(page)).toEqual(authored);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('R1.1b text and box'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  for (const key of ['html', 'css', 'js'] as const) expect((await source(page))[key]).toBe(saved[key]);
  await select(page, selectors[1]); await seek(page, 1.4);
  for (const selector of selectors) {
    const bounds = await (await preview(page)).locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom }; });
    expect(bounds.x).toBeGreaterThan(0); expect(bounds.y).toBeGreaterThan(0); expect(bounds.right).toBeLessThan(1920); expect(bounds.bottom).toBeLessThan(1080);
  }
  await page.screenshot({ path: test.info().outputPath(`keys-${width}.png`) });
  expect(errors).toEqual([]);
});

test('nonzero first key, diamond last removal, interpolated disable and exact undo', async ({ page }) => {
  const [selector] = await setup(page); await seek(page, .8);
  await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  await number(page, 'Position X', '250');
  expect((await data(page)).steps[0].layers[selector].x).toHaveLength(1);
  const initialX = await (await preview(page)).locator(selector).evaluate(el => el.getBoundingClientRect().x);
  const armed = await source(page);
  await seek(page, 0); expect(await (await preview(page)).locator(selector).evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(initialX);
  await seek(page, .8); await page.getByRole('button', { name: 'Remove Position X key', exact: true }).click(); await ready(page);
  expect((await data(page)).steps[0].layers[selector]).toBeUndefined();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(armed);
  await seek(page, 1.6); await number(page, 'Position X', '500');
  await seek(page, 1.2);
  const before = await source(page), x = await (await preview(page)).locator(selector).evaluate(el => el.getBoundingClientRect().x);
  await page.getByRole('button', { name: 'Disable Position X animation', exact: true }).click(); await ready(page);
  expect(await (await preview(page)).locator(selector).evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(x, 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(before);
});

test('nested SVG armed parent-coordinate drag and explicit base offset preserve motion', async ({ page }) => {
  await setup(page);
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const store = useTemplateStore.getState();
    store.applyTemplate({ ...store.template, fields: [], layers: [], html: '<div class="fixture"><svg width="1920" height="1080"><g transform="translate(100,80) rotate(30) scale(2)"><rect id="nested" x="120" y="120" width="200" height="100" fill="#eeb844" data-gfx /></g></svg></div>', css: 'body{margin:0}',
      js: emitAnimRegion({ version: 2, root: '.fixture', speed: 1, steps: [{ name: 'In', duration: 3, ease: 'none', layers: {} }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] }) });
    store.setSelectedParts(['#nested']);
  });
  await ready(page); await seek(page, 0);
  await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  await seek(page, 1);
  const bounds = (await page.locator('.ef-selection rect').boundingBox())!;
  const board = (await page.locator('.ef-artboard').boundingBox())!, scale = board.width / 1920;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 44.641016 * scale, bounds.y + bounds.height / 2 + 2.679492 * scale, { steps: 10 }); await page.mouse.up(); await ready(page);
  const motion = (await data(page)).steps[0].layers['#nested'];
  expect(motion.x[1].value).toBeCloseTo(20, 1); expect(motion.y).toBeUndefined();
  const before = await source(page), pose = await (await preview(page)).locator('#nested').evaluate(el => el.getBoundingClientRect().x);
  const details = page.locator('.ef-inspector details'); await details.locator('summary').click();
  const input = details.getByRole('textbox', { name: 'Base Position X', exact: true });
  const value = Number(await input.inputValue()); await input.fill(String(value + 40)); await input.press('Enter'); await ready(page);
  expect((await source(page)).js).toBe(before.js);
  expect(await (await preview(page)).locator('#nested').evaluate(el => el.getBoundingClientRect().x)).toBeCloseTo(pose + 69.282032, 1);
});

test('bar movement carries disjoint spans and keys, cancel and refusal are atomic', async ({ page }) => {
  const [, selector] = await setup(page, true); await select(page, selector);
  const before = await source(page), initial = await data(page);
  const bar = page.locator(`.ef-track[data-selector="${selector}"] .ef-bar`).first();
  await bar.focus(); await bar.press('ArrowRight'); await ready(page);
  const changed = await data(page);
  expect(changed.steps[0].spans![selector]).toEqual([{ start: .44, end: 1.44 }, { start: 1.84, end: 2.44 }]);
  expect(changed.steps[0].layers[selector].x.map(k => k.time)).toEqual([.44, 1.44]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(before);
  await bar.focus(); const bounds = (await bar.boundingBox())!;
  await page.mouse.move(bounds.x + 12, bounds.y + 5); await page.mouse.down(); await page.mouse.move(bounds.x + 70, bounds.y + 5); await page.keyboard.press('Escape'); await page.mouse.up(); expect(await source(page)).toEqual(before);
  await bar.focus(); for (let i = 0; i < 3; i++) await bar.press('Shift+ArrowLeft');
  await expect(page.getByRole('alert')).toContainText('before In starts');
  expect((await data(page)).steps[0].layers[selector].x.map(k => k.time)).toEqual(initial.steps[0].layers[selector].x.map(k => Math.round((k.time - .4) * 1000) / 1000));
  for (const [time, visible] of [[0, true], [1.1, false], [1.5, true], [2.1, false], [.5, true]] as const) {
    await seek(page, time);
    expect(await (await preview(page)).locator(selector).evaluate(el => getComputedStyle(el).visibility === 'visible')).toBe(visible);
  }
});

test('numeric animation controls are available on a created layer', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    const store = useTemplateStore.getState();
    const result = createArtwork(store.template, { shape: 'rectangle', x: 100, y: 100, width: 200, height: 100 });
    store.applyTemplate(result.template);
    store.setSelectedParts([result.selector]);
  });
  await expect(page.getByRole('button', { name: 'Enable Position X animation', exact: true })).toBeVisible();
});

test('armed scale handles key both axes in one transaction and stale numeric drafts refuse', async ({ page }) => {
  const [, selector] = await setup(page); await select(page, selector); await seek(page, 0);
  for (const axis of ['X', 'Y']) { await page.getByRole('button', { name: `Enable Scale ${axis} animation`, exact: true }).click(); await ready(page); }
  await seek(page, 1);
  const before = await source(page), handle = page.locator('.ef-selection circle').last(), box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 15, box.y + box.height / 2 + 15, { steps: 8 }); await page.mouse.up(); await ready(page);
  const tracks = (await data(page)).steps[0].layers[selector];
  expect(tracks.scaleX).toHaveLength(2); expect(tracks.scaleY).toHaveLength(2);
  expect(tracks.scaleX[1].value).not.toBe(1); expect(tracks.scaleX[1].value).toBe(tracks.scaleY[1].value);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(before);
  const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true });
  await input.fill('123');
  await page.evaluate(async () => (await import('/src/components/editorFoundation/documentAdapter.ts')).setSessionTime(1.5));
  await input.press('Enter'); await expect(page.getByRole('alert')).toContainText('playhead moved'); expect(await source(page)).toEqual(before);
});

test('mixed multi-selection keys only armed channels and commits one undo', async ({ page }) => {
  const [text, box] = await setup(page); await seek(page, 0);
  await select(page, text); await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  await seek(page, 1);
  await page.locator(`.ef-track[data-selector="${box}"] .ef-layer`).click({ modifiers: ['Control'] });
  const before = await source(page), bounds = await (await preview(page)).locator(text).evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
  const board = (await page.locator('.ef-artboard').boundingBox())!, scale = board.width / 1920;
  const x = board.x + bounds.x * scale + bounds.width * scale / 2, y = board.y + bounds.y * scale + bounds.height * scale / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60 * scale, y + 15 * scale, { steps: 10 }); await page.mouse.up(); await ready(page);
  const tracks = (await data(page)).steps[0].layers;
  expect(tracks[text].x).toHaveLength(2); expect(tracks[text].y).toBeUndefined(); expect(tracks[box]).toBeUndefined();
  expect((await source(page)).css).not.toBe(before.css);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(before);
});

test('explicit visibility preserves keyed opacity at a hold and resolves cue-side ownership', async ({ page }) => {
  const [held, revealed] = await setup(page);
  await page.evaluate(async ({ held, revealed }) => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const store = useTemplateStore.getState(), data = parseAnimData(store.template.js)!;
    data.steps[0].hides = [held]; data.steps[0].spans = { [held]: [{ start: 0, end: 3 }], [revealed]: [] };
    data.steps[0].layers[held] = { opacity: [{ time: 0, value: .6 }] };
    data.steps[1].spans = { [held]: [{ start: 0, end: 1 }], [revealed]: [{ start: 0, end: 1 }] };
    store.applyTemplate({ ...store.template, js: writeAnimData(store.template.js, data)! });
  }, { held, revealed }); await ready(page); await seek(page, 3);
  expect(await (await preview(page)).locator(held).evaluate(el => getComputedStyle(el).opacity)).toBe('0.6');
  expect(await (await preview(page)).locator(revealed).evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  const positions = await page.evaluate(async ({ held, revealed }) => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { authoringPosition } = await import('/src/components/editorFoundation/animationAuthoring.ts');
    return [authoringPosition(t, held, 3), authoringPosition(t, revealed, 3)];
  }, { held, revealed });
  expect(positions).toEqual([{ step: 0, time: 3 }, { step: 1, time: 0 }]);
  await seek(page, 3.1); expect(await (await preview(page)).locator(revealed).evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  await seek(page, 3); expect(await (await preview(page)).locator(revealed).evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
});

test('stored frames, source preservation, inheritance and atomic refusal', async ({ page }) => {
  const [, selector] = await setup(page, true);
  const result = await page.evaluate(async selector => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const { moveLayerSpan } = await import('/src/blocks/animEdit.ts');
    const template = useTemplateStore.getState().template;
    const results = [];
    for (const speed of [.5, 1, 2]) for (const fps of [25, 30]) {
      const data = parseAnimData(template.js)!; data.speed = speed;
      const input = { ...template, fps, js: spliceAnimData(template.js, data)! };
      const output = applyOperations(input, [{ kind: 'layer.move', selector, step: 0, delta: speed / fps }]).template;
      const after = parseAnimData(output.js)!;
      results.push({ speed, fps, delta: after.steps[0].layers[selector].x[0].time - .4,
        offsets: after.steps[0].layers[selector].x[1].time - after.steps[0].layers[selector].x[0].time,
        inherited: resolveValue(after, selector, 'x', 1, 0), preserved: output.html === input.html && output.css === input.css && output.js.endsWith('// preserve user code') });
    }
    const refusals = [];
    const quantized = moveLayerSpan(parseAnimData(template.js)!, 0, selector, .0005).steps[0].layers[selector].x;
    for (const mutation of ['unknown', 'loop', 'machine', 'bad-span', 'legacy-hide']) {
      const data = parseAnimData(template.js)!;
      if (mutation === 'unknown') Object.assign(data.steps[0], { future: 'retain me' });
      if (mutation === 'loop') data.steps[0].loops = { [selector]: { x: { repeat: -1 } } };
      if (mutation === 'machine') Object.assign(data, { machine: { groups: [] } });
      if (mutation === 'bad-span') data.steps[0].spans![selector][0].start = -1;
      if (mutation === 'legacy-hide') { delete data.steps[1].spans; data.steps[1].hides = [selector]; }
      const location = (await import('/src/blocks/animData.ts')).locateAnimData(template.js)!;
      const input = { ...template, js: template.js.slice(0, location.start) + JSON.stringify(data) + template.js.slice(location.end) };
      let message = '';
      try { applyOperations(input, [{ kind: 'base.set', selector, values: { x: 123 } }, { kind: 'layer.move', selector, step: 0, delta: .1 }]); } catch (error) { message = String(error); }
      refusals.push({ message, source: input.js.includes(mutation === 'unknown' ? 'retain me' : 'NOACG_ANIM'), unchanged: input.css === template.css });
    }
    return { results, refusals, quantized: quantized.map(key => key.time) };
  }, selector);
  for (const row of result.results) { expect(row.delta).toBeCloseTo(row.speed / row.fps, 3); expect(row.offsets).toBeCloseTo(1, 3); expect(row.inherited).toBe(300); expect(row.preserved).toBe(true); }
  for (const row of result.refusals) { expect(row.message).not.toBe(''); expect(row.source && row.unchanged).toBe(true); }
  expect(result.quantized).toEqual([.401, 1.401]);
});

test('known legacy interpreter upgrades for spans while customized source refuses', async ({ page }) => {
  await setup(page);
  const result = await page.evaluate(async () => {
    const { ANIM_INTERPRETER_JS, writeAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { ANIM_INTERPRETER_PRE_OUT_JS } = await import('/src/templates/shared/animRuntimeLegacy.ts');
    const legacy = ANIM_INTERPRETER_PRE_OUT_JS.replace(/\/\/ Visibility is independent of opacity\.[\s\S]*?\n}\n\n/, '')
      .replace(/ {2}Object\.keys\(step\.spans \|\| \{\}\)\.forEach[\s\S]*?\n {2}}\);\n/, '')
      .replace(/^ +if \(step(?:s\[0\])?\.spans[^\n]+\n/gm, '');
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(legacy)))).map(n => n.toString(16).padStart(2, '0')).join('');
    const input = t.js.replace(ANIM_INTERPRETER_JS, legacy), data = parseAnimData(input)!;
    const unchanged = writeAnimData(input, data) === input;
    data.steps[0].spans = { '#f2': [{ start: .2, end: 2 }] };
    const upgraded = writeAnimData(input, data);
    const refused = writeAnimData(input.replace('var noacgStepsPlayed = 0;', 'var noacgStepsPlayed = 2;'), data);
    return { hash, unchanged, upgraded: upgraded?.includes(ANIM_INTERPRETER_JS), preserved: upgraded?.endsWith('// preserve user code'), refused };
  });
  // The hash is the actual interpreter at merged PR #467, not a second implementation.
  expect(result.hash).toBe('c8f005f1cc0e5a88a2afb861da7f96ac1fff52e270701045b20ef2eae42141d2');
  expect(result.unchanged && result.upgraded && result.preserved).toBe(true); expect(result.refused).toBeNull();
});

test('visibility intervals and numeric poses match executable SPX, CasparCG and OGraf packages', async ({ page }) => {
  const [, selector] = await setup(page, true);
  const samples: { time: number; visible: string; opacity: string; transform: string }[] = [];
  for (const time of [0, .4, .8, 1.5, 1.8, 2.5, .6]) {
    await seek(page, time);
    samples.push({ time, ...await (await preview(page)).locator(selector).evaluate(el => ({ visible: getComputedStyle(el).visibility, opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })) });
  }
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async target => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    const output = await page.context().newPage();
    await output.route('http://keys-output.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await output.goto('http://keys-output.local/');
      await output.evaluate(async () => {
        const mod = await import('http://keys-output.local/graphic.mjs');
        customElements.define('keys-graphic', mod.default);
        const element = document.createElement('keys-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} });
        await element.playAction({});
      });
    } else await output.goto('http://keys-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
    for (const sample of samples) {
      const actual = await output.evaluate(({ selector, time, target }) => {
        type Timeline = { duration(): number; pause(): void; time(t: number, silent: boolean): void; render(t: number, silent: boolean, force: boolean): void };
        const host = window as unknown as { buildStepTimeline(i: number): Timeline; gsap: { globalTimeline: { clear(): void; getChildren(nested: boolean, tweens: boolean, timelines: boolean): Timeline[] } } };
        if (target !== 'ograf') host.gsap.globalTimeline.clear();
        const timeline = target === 'ograf' ? host.gsap.globalTimeline.getChildren(false, false, true).find(t => t.duration() === 3)! : host.buildStepTimeline(0);
        timeline.pause(); timeline.time(time, true); if (time === 0) timeline.render(0, true, true);
        const style = getComputedStyle(document.querySelector(selector)!);
        return { visible: style.visibility, opacity: style.opacity, transform: style.transform };
      }, { selector, time: sample.time, target });
      expect(actual, target + ' at ' + sample.time).toEqual({ visible: sample.visible, opacity: sample.opacity, transform: sample.transform });
    }
    await output.close();
  }
});
