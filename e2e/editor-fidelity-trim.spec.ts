// covers: src/components/editorFoundation/**
// covers: src/blocks/{baseEdits,designLayout,artworkEdits,artworkLayers,svgIdentity,editorAnimation,editorOut,animData,animEdit}.ts
// covers: src/model/structure.ts, src/templates/shared/{animRuntime,easeRuntime}.ts
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx, e2e/fixtures/interpreter-pre-g01.js
// covers: docs/research/editor-r1-1d/baseline/**, src/templates/importedDesign/svg.ts, src/templates/importedDesign/runtime/**
// covers: src/blocks/behaviourKeys.ts

import { test, expect, type Page } from '@playwright/test';
import { installGraphicBody } from './_graphicBody';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bindEveryTextLayer, dropSvg, QUIZ_SVG } from './_svg-import';
import { finishIntoNewEditor } from './_create';
import { settleDurableWrites } from './_durable';
import type { EditorOperation } from '../src/components/editorFoundation/operations';

// The recorded wizard baseline is committed evidence and is only read here. This run's pictures
// and measurements go to the test's own output folder (ignored), never into docs/.
const baseline = 'docs/research/editor-r1-1d/baseline';
const out = (name: string) => test.info().outputPath(name);
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
}
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function data(page: Page) { return page.evaluate(async () => (await import('/src/blocks/animData.ts')).parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!); }
async function execute(page: Page, operations: EditorOperation[]) {
  await page.evaluate(async operations => { const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(); session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations }); }, operations); await ready(page);
}
/** One `animation.key` set through the editor's session: '' when accepted, else the refusal. */
async function tryKey(page: Page, key: { selector: string; property: string; value: number; time?: number; step?: number }) {
  const message = await page.evaluate(async ({ selector, property, value, time, step }) => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    try { session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'animation.key', selector, step, property, time, value, action: 'set' }] as never }); return ''; } catch (e) { return String(e); }
  }, { step: 0, time: .4, ...key });
  if (!message) await ready(page);
  return message;
}
const LOOK = 'This graphic shows and hides this layer on air. It takes no keys; its look is preserved.';
/** The ownership rule's answer for each (layer, channel) of the working graphic (#1982). */
async function ownership(page: Page, asks: [string, string][]) {
  return page.evaluate(async asks => {
    const { keyAuthoringReason } = await import('/src/blocks/editorAnimation.ts'), { parseAnimData } = await import('/src/blocks/animData.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return asks.map(([selector, channel]) => keyAuthoringReason(t, parseAnimData(t.js), selector, channel));
  }, asks);
}
/** A layer's tracks in the cue that opens a package's animation data. */
async function packagedKeys(page: Page, target: string, selector: string) {
  return page.evaluate(async ({ target, selector }) => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(e => e.id === target)!.build(t);
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    for (const name of Object.keys(zip.files)) {
      if (zip.files[name].dir || !/\.(m?js|html)$/.test(name)) continue;
      const text = await zip.file(name)!.async('string');
      // OGraf's module carries the graphic's sources as string constants.
      for (const js of [text, ...[...text.matchAll(/^const [A-Z_]+ = (".*");$/gm)].map(m => JSON.parse(m[1]) as string)]) {
        const data = js.includes('var NOACG_ANIM') ? parseAnimData(js) : null;
        if (data) return data.steps[0].layers[selector];
      }
    }
    return null;
  }, { target, selector });
}
async function select(page: Page, selector: string) { await page.locator('.ef-track[data-selector=' + JSON.stringify(selector) + '] .ef-layer').click(); await ready(page); }
async function seek(page: Page, time: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' }), fps = (await source(page)).fps, frames = Math.round(time * fps);
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / fps)); await ready(page);
}
async function number(page: Page, label: string, value: number) { const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: label, exact: true }); await input.fill(String(value)); await input.press('Enter'); await ready(page); await expect(page.getByRole('alert')).toHaveCount(0); }
async function imported(page: Page) {
  await page.goto('/app#/new');
  await dropSvg(page, fileURLToPath(new URL('./fixtures/fidelity-nested.svg', import.meta.url)));
  await expect(page.getByTestId('map-svg-font-warn-Arial')).toContainText('Not embedded');
  await page.locator('.wz-next').click(); await page.getByRole('button', { name: /^Fade Dissolves/ }).click();
  await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home'); await ruler.press('Shift+ArrowRight'); await ready(page);
}

test('actual wizard exposes nested artwork and independent trim handles', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await imported(page);
  const original = await source(page);
  // The baseline was recorded before G01 changed the emitted interpreter. Everything else must
  // match byte for byte; the interpreter must be exactly the recorded one's upgrade.
  const interpreter = await page.evaluate(async () => (await import('/src/templates/shared/animRuntime.ts')).ANIM_INTERPRETER_JS);
  const recorded = readFileSync(new URL('./fixtures/interpreter-pre-g01.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const ext of ['html', 'css', 'js'] as const) {
    expect(original[ext].replace(/\r\n/g, '\n')).toBe(readFileSync(baseline + '/wizard.' + ext, 'utf8').replace(/\r\n/g, '\n').replace(recorded, () => interpreter));
  }
  await page.screenshot({ path: out('wizard.png') });
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  await frame.locator('svg.imported-design-art').screenshot({ path: out('artwork.png') });
  const layers = page.locator('.ef-track .ef-layer');
  await expect.soft(layers.filter({ hasText: 'Clipped card' })).toHaveCount(1);
  await expect.soft(layers.filter({ hasText: 'Unnamed badge' })).toHaveCount(1);
  await expect.soft(page.getByRole('button', { name: /^Trim start / }).first()).toBeVisible();
  expect((await source(page)).html).toBe(original.html);
  const raster = await page.context().newPage(); await raster.setViewportSize({ width: 1920, height: 1080 });
  await raster.setContent('<style>body{margin:0}</style>' + readFileSync(new URL('./fixtures/fidelity-nested.svg', import.meta.url), 'utf8'));
  await raster.evaluate(() => document.fonts.ready);
  const sourceText = await raster.locator('svg text').evaluate(el => ({ font: getComputedStyle(el).font, box: (() => { const b = (el as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(), html: el.outerHTML }));
  await raster.locator('svg').screenshot({ path: out('source-raster.png') });
  const html = await page.evaluate(async () => (await import('/src/export/selfContained.ts')).composeSelfContainedHtml((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  await raster.setContent(html); await raster.evaluate(() => {
    const w = window as unknown as { buildInTimeline(): { pause(): void; progress(p: number, silent: boolean): void } };
    const timeline = w.buildInTimeline(); timeline.pause(); timeline.progress(1, true);
  });
  await raster.evaluate(() => document.fonts.ready);
  const importedText = await raster.locator('svg text').evaluate(el => ({ font: getComputedStyle(el).font, box: (() => { const b = (el as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(), html: el.outerHTML }));
  writeFileSync(out('text-geometry.json'), JSON.stringify({ sourceText, importedText }, null, 2));
  // Record the existing import limitation: runtime snaps this text, while the rotated
  // layout has no measured fit/nudge control in Fields. Editor edits preserve this result.
  // Arial may resolve to a different host font; compare each host with its own source raster.
  expect(importedText.box.x).toBe(sourceText.box.x);
  expect(importedText.box.width).toBe(sourceText.box.width);
  expect(importedText.box.height).toBe(sourceText.box.height);
  await raster.locator('svg').screenshot({ path: out('wizard-raster.png') });
  await raster.close();
});

test('wizard group transforms compose with child keys and preserve source and executable packages', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await imported(page); await seek(page, .8);
  const original = await source(page);
  const pose = async (selector: string) => (await preview(page)).locator(selector).evaluate(el => { const m = (el as SVGGraphicsElement).getScreenCTM()!; return [m.a, m.b, m.c, m.d, m.e, m.f]; });
  const sibling = await pose('#sibling'), parent = await pose('#parent');
  await select(page, '#card'); await number(page, 'Position X', 20); await number(page, 'Position Y', -10);
  const card = await pose('#card');
  // Parent translate(100,80), rotate(30), scale(2): local (20,-10) maps through exactly this matrix.
  expect(card[4] - parent[4]).toBeCloseTo(parent[0] * 20 + parent[2] * -10, 1);
  expect(card[5] - parent[5]).toBeCloseTo(parent[1] * 20 + parent[3] * -10, 1);
  await number(page, 'Scale X %', 110); await number(page, 'Rotation', 15);
  expect(await pose('#sibling')).toEqual(sibling);
  await select(page, '#f0');
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Morning report'); await page.getByRole('button', { name: 'Apply text', exact: true }).click(); await ready(page);
  await page.getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Archivo' }); await ready(page);
  const font = page.getByRole('textbox', { name: 'Font size', exact: true }); await font.fill('20'); await font.press('Enter'); await ready(page);
  const colour = page.locator('.ef-appearance-field .grow'); await colour.fill('#ffeecc'); await colour.press('Enter'); await ready(page);
  await seek(page, 0);
  for (const name of ['Position X', 'Opacity']) { await page.getByRole('button', { name: 'Enable ' + name + ' animation', exact: true }).click(); await ready(page); }
  await number(page, 'Position X', -22);
  const opacity = page.getByRole('spinbutton', { name: 'Opacity %', exact: true }); await opacity.fill('0'); await opacity.press('Enter'); await ready(page);
  await seek(page, .6); await number(page, 'Position X', 58); await opacity.fill('100'); await opacity.press('Enter'); await ready(page);
  const keyed = await data(page);
  await execute(page, [{ kind: 'layer.trim', selector: '#f0', step: 0, interval: 0, edge: 'start', time: .2 }, { kind: 'layer.trim', selector: '#f0', step: 0, interval: 0, edge: 'end', time: .7 }]);
  expect((await data(page)).steps.map(s => s.layers)).toEqual(keyed.steps.map(s => s.layers));
  const edited = await source(page);
  const preservation = await page.evaluate(({ original, edited }) => {
    const before = new DOMParser().parseFromString(original.html, 'text/html'), after = new DOMParser().parseFromString(edited.html, 'text/html');
    return ['defs', '#parent', '#card', '#sibling', '#logo', '#outlined', 'svg'].map(selector => {
      const a = before.querySelector(selector)!, b = after.querySelector(selector)!;
      return selector === '#parent' || selector === '#card' || selector === 'svg' ? [...a.attributes].every(attr => b.getAttribute(attr.name) === attr.value) : a.isEqualNode(b);
    });
  }, { original, edited });
  expect(preservation.every(Boolean)).toBe(true);
  expect(edited.assets).toEqual(original.assets); expect(edited.fields[0].field).toBe(original.fields[0].field);
  const samples = [];
  for (const time of [0, .2, .4, .6, .76, .8, .4, .12]) {
    await seek(page, time);
    samples.push({ time, pose: await (await preview(page)).locator('#f0').evaluate(el => { const s = getComputedStyle(el), m = (el as SVGGraphicsElement).getScreenCTM()!; return { visibility: s.visibility, opacity: Number(s.opacity), matrix: [m.a,m.b,m.c,m.d,m.e,m.f], text: el.textContent }; }) });
  }
  await seek(page, .6); await page.screenshot({ path: out('child-animation.png') });
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async target => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    const output = await page.context().newPage(); await output.setViewportSize({ width: 1920, height: 1080 });
    await output.route('http://fidelity-output.local/**', route => {
      const path = new URL(route.request().url()).pathname.slice(1), body = files[path];
      return route.fulfill({ status: body == null ? 404 : 200, body: body == null ? '' : Buffer.from(body, 'base64'), contentType: /\.(m?js)$/.test(path) ? 'application/javascript' : path.endsWith('.css') ? 'text/css' : path.endsWith('.woff2') ? 'font/woff2' : 'text/html', headers: { 'access-control-allow-origin': '*' } });
    });
    if (target === 'ograf') {
      await installGraphicBody(output);
      await output.goto('http://fidelity-output.local/');
      await output.evaluate(async () => {
        document.body.style.margin = '0';
        const mod = await import('http://fidelity-output.local/graphic.mjs'); customElements.define('fidelity-graphic', mod.default);
        const element = document.createElement('fidelity-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
        document.body.appendChild(element); await element.load({ data: {}, renderType: 'realtime', renderCharacteristics: {} }); await element.playAction({});
      });
    } else await output.goto('http://fidelity-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
    await output.evaluate(() => document.fonts.ready);
    for (const sample of samples) {
      const actual = await output.evaluate(({ time, target }) => {
        type Timeline = { duration(): number; pause(): void; time(t: number, silent: boolean): void; render(t: number, silent: boolean, force: boolean): void };
        const host = window as unknown as { buildStepTimeline(i: number): Timeline; gsap: { globalTimeline: { clear(): void; getChildren(n: boolean, tw: boolean, tl: boolean): Timeline[] } } };
        if (target !== 'ograf') host.gsap.globalTimeline.clear();
        const timeline = target === 'ograf' ? host.gsap.globalTimeline.getChildren(false, false, true).find(t => Math.abs(t.duration() - .8) < .001)! : host.buildStepTimeline(0);
        timeline.pause(); timeline.time(time, true); if (time === 0) timeline.render(0, true, true);
        const el = (target === 'ograf' ? graphicBody(document.querySelector('fidelity-graphic')!) : document).querySelector('#f0')!, s = getComputedStyle(el), m = (el as SVGGraphicsElement).getScreenCTM()!;
        return { visibility: s.visibility, opacity: Number(s.opacity), matrix: [m.a,m.b,m.c,m.d,m.e,m.f], text: el.textContent };
      }, { time: sample.time, target });
      expect(actual.visibility, target + ':' + sample.time).toBe(sample.pose.visibility); expect(actual.opacity).toBeCloseTo(sample.pose.opacity, 3); expect(actual.text).toBe(sample.pose.text);
      actual.matrix.forEach((n, i) => expect(n, target + ':' + sample.time + ' matrix ' + i).toBeCloseTo(sample.pose.matrix[i], 1));
    }
    await output.close();
  }
});

for (const width of [1920, 1366, 1093]) test('wizard nested identity, trim and history ' + width, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1920 ? 1080 : width === 1366 ? 768 : 614 });
  await imported(page); await seek(page, .8);
  const original = await source(page);
  const badge = (await page.locator('.ef-track').filter({ hasText: 'Unnamed badge' }).getAttribute('data-selector'))!;
  expect(badge).toContain('nth-of-type'); await select(page, badge);
  const beforeRect = await (await preview(page)).locator(badge).boundingBox();
  const box = (await page.locator('.ef-selection rect').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 24, box.y + box.height / 2 + 10, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up(); await ready(page);
  await expect(page.locator('.ef-track[data-selector=' + JSON.stringify(badge) + '] .ef-layer')).toHaveAttribute('aria-pressed', 'true');
  expect((await source(page)).html).toBe(original.html); expect((await source(page)).css).toBe(original.css);
  expect(await (await preview(page)).locator(badge).boundingBox()).toEqual(beforeRect);
  await number(page, 'Position X', 32);
  const moved = await source(page);
  expect(moved.html.replace(' id="artwork-1"', '')).toBe(original.html);
  await expect(page.locator('.ef-track[data-selector="#artwork-1"] .ef-layer')).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).html).toBe(original.html);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).html).toBe(moved.html);
  const keys = (await data(page)).steps.map(step => step.layers);
  const row = page.locator('.ef-track[data-selector="#artwork-1"]');
  const trim = row.getByRole('button', { name: /^Trim start / }).first();
  await trim.focus(); await trim.press('Shift+ArrowRight'); await ready(page);
  expect((await data(page)).steps[0].spans!['#artwork-1'][0].start).toBe(.4);
  expect((await data(page)).steps.map(step => step.layers)).toEqual(keys);
  const trimmed = await source(page), trimBox = (await trim.boundingBox())!;
  await page.mouse.move(trimBox.x + 4, trimBox.y + 8); await page.mouse.down(); await page.mouse.move(trimBox.x + 35, trimBox.y + 8); await page.keyboard.press('Escape'); await page.mouse.up();
  expect((await source(page)).js).toBe(trimmed.js);
  await trim.focus(); await trim.press('Shift+ArrowRight'); await expect(page.getByRole('alert')).toContainText('at least one frame'); expect((await source(page)).js).toBe(trimmed.js);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(moved.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(trimmed.js);
  await page.screenshot({ path: out('nested-' + width + '.png') });
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Nested fidelity ' + width); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); const saved = await source(page);
  await page.reload(); await ready(page); expect((await source(page)).html).toBe(saved.html); expect((await source(page)).js).toBe(saved.js);
});

test('trim retains disjoint keys and inherited motion at effective FPS, with atomic refusals', async ({ page }) => {
  await imported(page);
  const result = await page.evaluate(async () => {
    const template = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const { resolveValue } = await import('/src/blocks/animEval.ts');
    const rows = [];
    for (const speed of [.5, 1, 2]) for (const fps of [25, 30]) {
      const d = parseAnimData(template.js)!; d.speed = speed;
      d.steps[0].duration = 3; d.steps[0].layers['#card'] = { x: [{ time: .2, value: -80 }, { time: 1.8, value: 0 }] };
      d.steps[0].spans = { '#card': [{ start: .1, end: 1 }, { start: 1.5, end: 2.8 }] };
      const input = { ...template, fps, js: spliceAnimData(template.js, d)! };
      const output = applyOperations(input, [{ kind: 'layer.trim', selector: '#card', step: 0, interval: 0, edge: 'start', time: .1 + speed / fps }]).template;
      const after = parseAnimData(output.js)!;
      const moved = parseAnimData(applyOperations(output, [{ kind: 'layer.move', selector: '#card', step: 0, delta: .1 }]).template.js)!;
      const errors = [-1, 1, 1.6].map(time => { try { applyOperations(input, [{ kind: 'base.set', selector: '#card', values: { scaleX: 2 } }, { kind: 'layer.trim', selector: '#card', step: 0, interval: 0, edge: 'start', time }]); return ''; } catch (e) { return String(e); } });
      rows.push({ delta: after.steps[0].spans!['#card'][0].start - .1, expected: speed / fps, sameKeys: JSON.stringify(after.steps.map(s => s.layers)) === JSON.stringify(d.steps.map(s => s.layers)), second: after.steps[0].spans!['#card'][1], inherited: resolveValue(after, '#card', 'x', 1, 0), bodyTimes: moved.steps[0].layers['#card'].x.map(k => k.time), errors, sameHtml: output.html === input.html, sameCss: output.css === input.css });
    }
    const empty = parseAnimData(template.js)!; empty.steps[1] = { name: 'Out', duration: 0, ease: 'none', layers: {} };
    const emptyResult = applyOperations({ ...template, js: spliceAnimData(template.js, empty)! }, [{ kind: 'layer.trim', selector: '#card', step: 0, interval: 0, edge: 'start', time: .2 }]);
    return { rows, empty: parseAnimData(emptyResult.template.js)?.steps[1] };
  });
  for (const row of result.rows) { expect(row.delta).toBeCloseTo(row.expected, 3); expect(row.sameKeys && row.sameHtml && row.sameCss).toBe(true); expect(row.second).toEqual({ start: 1.5, end: 2.8 }); expect(row.inherited).toBe(0); expect(row.bodyTimes).toEqual([.3, 1.9]); expect(row.errors.every(Boolean)).toBe(true); }
  expect(result.empty?.spans!['#card']).toEqual([]);
});

test('unnamed and duplicate identities are minted atomically and never during drafts', async ({ page }) => {
  await imported(page);
  const result = await page.evaluate(async () => {
    const original = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { getTemplateParts } = await import('/src/model/structure.ts');
    const { baseValues } = await import('/src/blocks/baseEdits.ts');
    const input = { ...original, html: original.html.replace('<circle ', '<circle id="duplicate" ').replace('<path ', '<path id="duplicate" ').replace('<defs>', '<defs><path id="artwork-1" d="M0 0"/>') };
    const parts = getTemplateParts(input.html, input.fields, true), doc = new DOMParser().parseFromString(input.html, 'text/html');
    const target = parts.find(p => doc.querySelector(p.selector)?.tagName.toLowerCase() === 'circle')!.selector;
    const op = { kind: 'base.set' as const, selector: target, values: { x: 40 } };
    const draft = applyOperations(input, [op], false), committed = applyOperations(input, [op]);
    let error = '';
    try { applyOperations(input, [op, { kind: 'base.set', selector: '#sibling', values: { x: NaN } }]); } catch (e) { error = String(e); }
    const after = new DOMParser().parseFromString(committed.template.html, 'text/html');
    const noOp = applyOperations(input, [{ ...op, values: { x: baseValues(input, target).x } }]);
    let referenceError = '';
    try { applyOperations({ ...input, css: input.css + '\n#duplicate { opacity: .8 }' }, [op]); } catch (e) { referenceError = String(e); }
    const attributeErrors = ['[id="duplicate"]', '[id=duplicate]', '#d\\75 plicate'].map(selector => { try { applyOperations({ ...input, css: input.css + '\n' + selector + ' { fill: red }' }, [op]); return ''; } catch (e) { return String(e); } });
    const escapedInput = { ...input, html: input.html.replaceAll('id="duplicate"', 'id="bad:id"'), css: input.css + '\n#bad\\:id { fill: red }' };
    let escapedError = ''; try { applyOperations(escapedInput, [op]); } catch (e) { escapedError = String(e); }
    let unnamedError = ''; try { applyOperations({ ...original, css: original.css + '\n[id] { fill: red }' }, [op]); } catch (e) { unnamedError = String(e); }
    const reservedCss = applyOperations({ ...original, css: original.css + '\n#artwork\\2d 1 { fill: red }' }, [op]);
    const dangling = applyOperations({ ...input, html: input.html.replace('<defs>', '<defs><use href="#artwork-2"/>') }, [op]);
    const hidden = getTemplateParts(original.html.replace('</svg>', '<g style="display:none"><circle id="hidden-child" r="10"/></g></svg>'), original.fields, true);
    return { draftHtml: draft.template.html === input.html, id: committed.identities![target], duplicateCount: after.querySelectorAll('#duplicate').length, count: after.querySelectorAll('#artwork-2').length, preserved: committed.template.html.replace('id="artwork-2"', 'id="duplicate"') === input.html, error, referenceError, attributeErrors, escapedError, unnamedError, reservedCssId: reservedCss.identities![target], unchanged: noOp.template.html === input.html, fields: committed.template.fields === input.fields, danglingId: dangling.identities![target], hiddenOffered: hidden.some(p => p.selector === '#hidden-child') };
  });
  expect(result).toMatchObject({ draftHtml: true, id: '#artwork-2', duplicateCount: 1, count: 1, preserved: true, unchanged: true, fields: true });
  expect(result.error).toContain('finite'); expect(result.referenceError).toContain('references');
  expect(result.danglingId).toBe('#artwork-3'); expect(result.hiddenOffered).toBe(false);
  for (const error of [...result.attributeErrors, result.escapedError]) expect.soft(error).toContain('references');
  expect.soft(result.unnamedError).toContain('references'); expect.soft(result.reservedCssId).toBe('#artwork-2');
});

test('scrolled trim handles cannot intercept the sticky ruler', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 }); await imported(page); await select(page, '#f0');
  const ruler = page.getByRole('slider', { name: 'Playhead' }), box = (await ruler.boundingBox())!;
  const percent = await page.locator('.ef-out').evaluate(el => parseFloat((el as HTMLElement).style.left));
  const point = { x: box.x + box.width * percent / 100 - .01, y: box.y + 20 };
  const intercept = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.ef-trim')?.getAttribute('aria-label') ?? null, point);
  expect.soft(intercept).toBeNull();
  await page.mouse.click(point.x, point.y); await ready(page);
  await expect(page.locator('.ef-track[data-selector="#f0"] .ef-layer')).toHaveAttribute('aria-pressed', 'true');
  expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(.8, 3);
});

test('rotation-only edits refresh an already sampled SVG pose', async ({ page }) => {
  await imported(page); await select(page, '#logo');
  const angle = () => page.frameLocator('iframe[title="Foundation graphic preview"]').locator('#logo').evaluate(el => {
    const m = (el as SVGGraphicsElement).getScreenCTM()!; return Math.atan2(m.b, m.a) * 180 / Math.PI;
  });
  await execute(page, [{ kind: 'base.set', selector: '#logo', values: { rotation: 15 } }]);
  await seek(page, .4); await seek(page, .8); const before = await angle();
  await execute(page, [{ kind: 'base.set', selector: '#logo', values: { rotation: 45 } }]);
  expect(await angle() - before).toBeCloseTo(30, 3);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  expect(await angle()).toBeCloseTo(before, 3);
});

test('completed pointer trims keep clipped keys while the body moves them in one transaction', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await imported(page); await select(page, '#card');
  await page.evaluate(() => {
    const samples: { ms: number; x: number }[] = [];
    (window as unknown as { trimFeedback: typeof samples }).trimFeedback = samples;
    document.addEventListener('pointermove', event => {
      const element = (event.target as Element).closest('.ef-trim'); if (!element || !event.buttons) return;
      const start = performance.now(); requestAnimationFrame(() => requestAnimationFrame(() => samples.push({ ms: performance.now() - start, x: element.getBoundingClientRect().x })));
    }, true);
  });
  await execute(page, [{ kind: 'animation.key', selector: '#card', step: 0, property: 'x', time: .2, value: -80, action: 'set' }, { kind: 'animation.key', selector: '#card', step: 0, property: 'x', time: .6, value: 0, action: 'set' }]);
  const original = await source(page), keys = (await data(page)).steps[0].layers['#card'];
  const row = page.locator('.ef-track[data-selector="#card"]'), lane = (await row.locator('.ef-track-lane').boundingBox())!;
  const gesture = async (label: string, delta: number) => {
    const control = row.getByRole('button', { name: label, exact: true }).first(), box = (await control.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + 6); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + delta * lane.width / 2, box.y + 6, { steps: 12 }); await page.mouse.up(); await ready(page);
  };
  await gesture('Trim start Clipped card span', .28);
  const trimmedStart = await source(page); expect((await data(page)).steps[0].spans!['#card']).toEqual([{ start: .28, end: .8 }]);
  expect((await data(page)).steps[0].layers['#card']).toEqual(keys);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(original.js);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(trimmedStart.js);
  await gesture('Trim end Clipped card span', -.32);
  const trimmed = await source(page); expect((await data(page)).steps[0].spans!['#card']).toEqual([{ start: .28, end: .48 }]); expect((await data(page)).steps[0].layers['#card']).toEqual(keys);
  await gesture('Move Clipped card span', .04);
  expect((await data(page)).steps[0].spans!['#card']).toEqual([{ start: .32, end: .52 }]);
  expect((await data(page)).steps[0].layers['#card'].x.map(k => k.time)).toEqual([.24, .64]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(trimmed.js);
  const feedback = await page.evaluate(() => (window as unknown as { trimFeedback: { ms: number; x: number }[] }).trimFeedback);
  expect(feedback.length).toBeGreaterThan(10); expect(new Set(feedback.map(s => s.x)).size).toBeGreaterThan(5);
  writeFileSync(out('trim-feedback.json'), JSON.stringify({ method: 'Pointer event to handle geometry after two animation frames, allowing the React commit to paint. Dev server, 1920x1080; not photon timing.', samples: feedback }, null, 2));
});

test('nominated logo edits preserve image bytes and nested group canvas movement agrees with numbers', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await imported(page); await seek(page, .8);
  const original = await source(page);
  await select(page, '#logo'); await number(page, 'Position X', 220); await number(page, 'Position Y', 50);
  await number(page, 'Scale X %', 80); await number(page, 'Rotation', -10);
  const opacity = page.getByRole('spinbutton', { name: 'Opacity %', exact: true }); await opacity.fill('65'); await opacity.press('Enter'); await ready(page);
  expect((await source(page)).html).toBe(original.html); expect((await source(page)).assets).toEqual(original.assets);
  expect(await (await preview(page)).locator('#logo').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(.65);
  const badge = (await page.locator('.ef-track').filter({ hasText: 'Unnamed badge' }).getAttribute('data-selector'))!;
  await select(page, badge);
  const before = await source(page);
  const pose = async (selector: string) => (await preview(page)).locator(selector).evaluate(el => { const m = (el as SVGGraphicsElement).getScreenCTM()!; return [m.e, m.f]; });
  await number(page, 'Position X', 32); await number(page, 'Position Y', 2);
  const expected = await pose('#artwork-1');
  for (let i = 0; i < 2; i++) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }
  expect((await source(page)).html).toBe(before.html);
  const box = (await page.locator('.ef-selection rect').boundingBox())!, stage = (await page.locator('.ef-artboard').boundingBox())!, fit = stage.width / 1920;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 44.641016 * fit, box.y + box.height / 2 + 2.679492 * fit, { steps: 10 }); await page.mouse.up(); await ready(page);
  const moved = await source(page); expect(moved.html.replace(' id="artwork-1"', '')).toBe(before.html);
  (await pose('#artwork-1')).forEach((n, i) => expect(n).toBeCloseTo(expected[i], 1));
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).css).toBe(before.css); expect((await source(page)).html).toBe(before.html);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect((await source(page)).css).toBe(moved.css);
  await page.screenshot({ path: out('logo-and-group.png') });
});

// AC-15, row 26 (docs/work-specs/jev-svg-import/evidence/phase-26.md). The wizard's mapping step is
// the import's preparation; the nested headline is #f0 inside #card inside the transformed #parent.
test('a nested imported field stays a field and an animation target, with its timing and ease, through save and reopen', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await imported(page); await seek(page, 0);
  const prepared = await source(page);
  expect(prepared.fields.map(f => [f.field, f.title])).toEqual([['f0', 'Headline']]);
  expect(await page.evaluate(html => !!new DOMParser().parseFromString(html, 'text/html').querySelector('#parent > #card > #f0'), prepared.html)).toBe(true);
  await execute(page, [
    { kind: 'animation.key', selector: '#f0', step: 0, property: 'x', time: 0, value: -30, action: 'set' },
    { kind: 'animation.key', selector: '#f0', step: 0, property: 'x', time: .6, value: 40, action: 'set' },
  ]);
  await execute(page, [{ kind: 'key.ease', keys: [0, .6].map(time => ({ step: 0, selector: '#f0', property: 'x', time })), preset: 'easyEase' }]);
  const keyed = (await data(page)).steps[0].layers['#f0'];
  expect(keyed.x.map(k => [k.time, k.value])).toEqual([[0, -30], [.6, 40]]);
  expect(keyed.x[1].ease).toMatch(/^cubic/);
  await select(page, '#f0'); await seek(page, .6);
  const positionX = page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true });
  const shown = await positionX.inputValue();
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Nested field motion'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); const saved = await source(page);
  expect(saved.html).toBe(prepared.html); expect(saved.fields).toEqual(prepared.fields);

  await page.reload(); await ready(page);
  const reopened = await source(page);
  for (const ext of ['html', 'css', 'js'] as const) expect(reopened[ext]).toBe(saved[ext]);
  expect(reopened.fields).toEqual(saved.fields);
  expect((await data(page)).steps[0].layers['#f0']).toEqual(keyed);
  // Still a target: the reopened row selects, reads its keyed value and takes a new key.
  await select(page, '#f0'); await seek(page, .6);
  await expect(positionX).toHaveValue(shown);
  await seek(page, .4); await number(page, 'Position X', 10);
  expect((await data(page)).steps[0].layers['#f0'].x.map(k => k.time)).toEqual([0, .4, .6]);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect((await source(page)).js).toBe(saved.js);
  // Still a field: the text editor writes the nested node, and the operator's update() does too.
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Night report'); await page.getByRole('button', { name: 'Apply text', exact: true }).click(); await ready(page);
  expect((await source(page)).fields).toEqual([{ ...saved.fields[0], value: 'Night report' }]);
  expect((await source(page)).js).toBe(saved.js);
  const edited = await source(page);
  expect(await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('#parent > #card > #f0')?.textContent, edited.html)).toBe('Night report');
  const expected = await page.evaluate(async () => {
    const { resolveValue } = await import('/src/blocks/animEval.ts'); const { parseAnimData } = await import('/src/blocks/animData.ts');
    const d = parseAnimData((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)!;
    return [0, .15, .3, .45, .6].map(time => resolveValue(d, '#f0', 'x', 0, time)!);
  });
  // The ease is applied: a quarter of the way in, an Easy Ease is well short of the linear value.
  expect(Math.abs(expected[1] - (-30 + 70 / 4))).toBeGreaterThan(5);
  const html = await page.evaluate(async template => (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(template), edited);
  const output = await page.context().newPage(); await output.setContent(html);
  const played = await output.evaluate(() => {
    type Timeline = { pause(): void; time(t: number, silent: boolean): void; render(t: number, silent: boolean, force: boolean): void };
    const w = window as unknown as { buildStepTimeline(i: number): Timeline; update(data: string): void; gsap: { globalTimeline: { clear(): void }; getProperty(t: string, p: string): number } };
    w.update(JSON.stringify({ f0: 'Live words' }));
    const text = document.querySelector('#parent #card #f0')!.textContent;
    w.gsap.globalTimeline.clear(); const timeline = w.buildStepTimeline(0); timeline.pause();
    return { text, x: [0, .15, .3, .45, .6].map(time => { timeline.time(time, true); if (time === 0) timeline.render(0, true, true); return Number(w.gsap.getProperty('#f0', 'x')); }) };
  });
  expect(played.text).toBe('Live words');
  played.x.forEach((x, i) => expect(x, 'x at sample ' + i + ': ' + JSON.stringify({ played: played.x, expected })).toBeCloseTo(expected[i], 1));
  await output.close();
});

// AC-15, row 26, and #1982 (docs/research/editor-behaviour-keys): on a behaviour graphic the
// recipe owns its moments. The drawn flash and final layers are painted by class, are offered as
// no row and take no key (K4); the nested score is a field the recipe only writes text into, so
// it takes keys (K6) while the machine, its calls and the paint table stay byte for byte (K7). On
// air the key plays and the flash still paints (K8); save, reopen and the packages keep the key.
test('a nested field on a behaviour graphic takes keys, a drawn look refuses them, and the recipe keeps its paint, through save, reopen, air and packages', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/app');
  await dropSvg(page, fileURLToPath(new URL('./fixtures/svg-corpus/illustrator-four-team-scoreboard.svg', import.meta.url)));
  await bindEveryTextLayer(page);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('score');
  await finishIntoNewEditor(page); await ready(page);
  const prepared = await source(page), before = await data(page);
  const scoreField = prepared.fields.find(f => f.field === 'f2')!;
  expect([scoreField.title, scoreField.ftype]).toEqual(['Score 1', 'number']);
  const looks = ['#Flash_x20_1', '#Flash_x20_2', '#Flash_x20_3', '#Flash_x20_4', '#Full_x20_time'];
  const rows = await page.locator('.ef-track').evaluateAll(els => els.map(e => e.getAttribute('data-selector')));
  expect(rows).toEqual(expect.arrayContaining(['#Row_x20_1', '#f1', '#f2']));
  for (const look of looks) expect(rows).not.toContain(look);
  // K4: a look takes no key on any property, and the refusal changes nothing. The editor offers
  // no look as a layer at all; the ownership rule names it too, on the real document.
  for (const property of ['x', 'opacity'] as const) expect(await tryKey(page, { selector: '#Flash_x20_1', property, value: .5 })).not.toBe('');
  expect(await source(page)).toEqual(prepared);
  expect(await ownership(page, [['#Flash_x20_1', 'opacity'], ['#Flash_x20_1', 'x'], ['#Full_x20_time', 'scaleX'], ['#f2', 'x'], ['#f2', 'opacity'], ['#Row_x20_1', 'x']]))
    .toEqual([LOOK, LOOK, LOOK, null, null, null]);
  // A base placement edit is still the layer's own and leaves the animation data alone.
  const baseX = await page.evaluate(async template => (await import('/src/blocks/baseEdits.ts')).baseValues(template, '#f2').x, prepared);
  await execute(page, [{ kind: 'base.set', selector: '#f2', values: { x: baseX + 12 } }]);
  expect((await source(page)).js).toBe(prepared.js); expect((await source(page)).fields).toEqual(prepared.fields);
  // K6: the nested score takes keys from the panel's own controls.
  await select(page, '#f2');
  await expect(page.getByText(/state-machine ownership|shows and hides/)).toHaveCount(0);
  await seek(page, 0); await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  const shownX = Number(await page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true }).inputValue());
  await seek(page, .4); await number(page, 'Position X', shownX + 20);
  const keyed = await data(page), track = keyed.steps[0].layers['#f2'].x;
  expect(track.map(key => key.time)).toEqual([0, .4]); expect(track[1].value - track[0].value).toBeCloseTo(20, 3);
  // K7: only the user's track changed; the machine, the calls and the paint table did not.
  expect({ ...keyed, steps: keyed.steps.map(s => ({ ...s, layers: { ...s.layers, '#f2': undefined } })) })
    .toEqual({ ...before, steps: before.steps.map(s => ({ ...s, layers: { ...s.layers, '#f2': undefined } })) });
  const table = (js: string) => js.slice(js.indexOf('var NOACG_BEHAVIOUR'), js.indexOf('};', js.indexOf('var NOACG_BEHAVIOUR')));
  expect(table((await source(page)).js)).toBe(table(prepared.js));
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Nested score'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); const saved = await source(page);

  await page.reload(); await ready(page);
  const reopened = await source(page);
  for (const ext of ['html', 'css', 'js'] as const) expect(reopened[ext]).toBe(saved[ext]);
  expect(reopened.fields).toEqual(prepared.fields);
  expect((await data(page)).steps).toEqual(keyed.steps);
  expect((await page.locator('.ef-track').evaluateAll(els => els.map(e => e.getAttribute('data-selector'))))).toEqual(rows);
  expect(await tryKey(page, { selector: '#Flash_x20_2', property: 'scaleX', value: 1.2 })).not.toBe(''); expect((await source(page)).js).toBe(saved.js);
  expect(await ownership(page, [['#Flash_x20_2', 'scaleX'], ['#f2', 'x']])).toEqual([LOOK, null]);
  // The packages carry the key in their animation data.
  for (const target of ['spx', 'ograf']) expect(await packagedKeys(page, target, '#f2')).toEqual(keyed.steps[0].layers['#f2']);
  const compose = (template: typeof prepared) => page.evaluate(async template => (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(template), template);
  const output = await page.context().newPage();
  // Where #f2 stands in artwork units, read through the artwork's own scale.
  const standing = () => output.evaluate(() => { const art = (document.querySelector('svg.imported-design-art') as SVGGraphicsElement).getScreenCTM()!; return (document.querySelector('#f2') as SVGGraphicsElement).getScreenCTM()!.e / art.a; });
  await output.setContent(await compose(reopened));
  const on = 'imported-design-on';
  const flash = () => output.locator('[data-noacg-role~="team.flash/1"]');
  const w = (fn: string, ...args: unknown[]) => output.evaluate(({ fn, args }) => { (window as unknown as Record<string, (...a: unknown[]) => unknown>)[fn](...args); }, { fn, args });
  await w('update', JSON.stringify({ f2: '3' })); await w('play');
  await expect(output.locator('#Row_x20_1 > #f2')).toHaveText('3');
  await expect(flash()).not.toHaveClass(new RegExp(on));
  // K8: the key plays on air, where the editor shows it at the end of the cue.
  const inEditor = async (time: number) => { await seek(page, time); return (await preview(page)).evaluate(() => { const art = (document.querySelector('svg.imported-design-art') as SVGGraphicsElement).getScreenCTM()!; return ((document.querySelector('#f2') as SVGGraphicsElement).getScreenCTM()!.e - art.e) / art.a; }); };
  const shown = await inEditor(.8);
  expect(shown - await inEditor(0)).toBeCloseTo(20, 1);
  const relative = () => output.evaluate(() => { const art = (document.querySelector('svg.imported-design-art') as SVGGraphicsElement).getScreenCTM()!; return ((document.querySelector('#f2') as SVGGraphicsElement).getScreenCTM()!.e - art.e) / art.a; });
  await expect.poll(relative).toBeCloseTo(shown, 1);
  const placedAt = await standing();
  // The cue sends +1 as the adjusted value (the control's `adjust`), as the production page does.
  await w('noacgDispatch', 'score1', { f2: '4' });
  await expect(output.locator('#f2')).toHaveText('4');
  await expect(flash()).toHaveClass(new RegExp(on));
  await expect(output.locator('[data-noacg-role~="team.flash/2"]')).not.toHaveClass(new RegExp(on));
  // The keyed pose is the user's; the paint never moved it.
  expect(await standing()).toBeCloseTo(placedAt, 3);
  await output.close();
});

// #1982: a quiz's answers take keys on the walk's own cues, and its drawn moments do not (K4, K6).
// A key on Reveal replays when the operator's Reveal arrow enters that cue, after the pick and the
// lock (K8). The credits roll keeps its whole sequence (K2): every key is refused, by name.
test('a quiz takes keys on its answers and its cues, its drawn moments refuse them, and credits keep the whole roll', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/app');
  await dropSvg(page, QUIZ_SVG);
  await expect(page.getByTestId('map-svg-behaviour-kind')).toHaveValue('quiz');
  await finishIntoNewEditor(page); await ready(page);
  const prepared = await source(page);
  const lookId = await page.evaluate(html => new DOMParser().parseFromString(html, 'text/html').querySelector('[data-noacg-role~="answer.selected/B"]')!.id, prepared.html);
  expect(await tryKey(page, { selector: '#' + lookId, property: 'opacity', value: .5 })).not.toBe('');
  expect(await source(page)).toEqual(prepared);
  expect(await ownership(page, [['#' + lookId, 'opacity'], ['#f1', 'x'], ['#f0', 'rotation']])).toEqual([LOOK, null, null]);
  const steps = (await data(page)).steps;
  expect(steps.map(s => s.name)).toEqual(['Question', 'Reveal', 'Out']);
  expect(await tryKey(page, { selector: '#f1', property: 'x', time: 0, value: 0 })).toBe('');
  expect(await tryKey(page, { selector: '#f1', property: 'x', time: .4, value: 15 })).toBe('');
  expect(await tryKey(page, { selector: '#f1', property: 'x', step: 1, time: .45, value: 30 })).toBe('');
  const keyed = await data(page);
  expect([keyed.steps[0].layers['#f1'].x.length, keyed.steps[1].layers['#f1'].x.length]).toEqual([2, 1]);
  const output = await page.context().newPage();
  await output.setContent(await page.evaluate(async template => (await import('/src/export/selfContained.ts')).composeSelfContainedHtml(template), await source(page)));
  const x = () => output.evaluate(() => Number((window as unknown as { gsap: { getProperty(t: string, p: string): number } }).gsap.getProperty('#f1', 'x')));
  const w = (fn: string, ...args: unknown[]) => output.evaluate(({ fn, args }) => { (window as unknown as Record<string, (...a: unknown[]) => unknown>)[fn](...args); }, { fn, args });
  const on = /imported-design-on/;
  await w('play'); await expect.poll(x).toBeCloseTo(15, 1);
  await w('noacgDispatch', 'select', { f6: 'B' });
  await expect(output.locator('[data-noacg-role~="answer.selected/B"]')).toHaveClass(on);
  await w('noacgDispatch', 'lock');
  await expect(output.locator('[data-noacg-role~="locked"]')).toHaveClass(on);
  expect(await x()).toBeCloseTo(15, 1);
  await w('noacgDispatch', 'judge', { f5: 'C' });
  await expect(output.locator('[data-noacg-role~="answer.correct/C"]')).toHaveClass(on);
  await expect.poll(x).toBeCloseTo(30, 1);
  await output.close();

  await page.goto('/app');
  await dropSvg(page, fileURLToPath(new URL('./fixtures/credits-artwork.svg', import.meta.url)));
  await page.getByTestId('map-svg-behaviour-kind').selectOption('credits');
  await finishIntoNewEditor(page); await ready(page);
  const credits = await source(page);
  const layers = (await page.locator('.ef-track').evaluateAll(els => els.map(e => e.getAttribute('data-selector')!))).filter(s => s.startsWith('#'));
  expect(layers.length).toBeGreaterThan(0);
  for (const selector of layers.slice(0, 3)) expect(await tryKey(page, { selector, property: 'opacity', value: .5 })).toContain('credits roll measures');
  expect(await source(page)).toEqual(credits);
  await select(page, layers[0]); await expect(page.getByText(/credits roll measures this artwork/)).toBeVisible();
});
