import { test, expect, type Page } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dropSvg } from './_svg-import';
import { settleDurableWrites } from './_durable';
import type { EditorOperation } from '../src/components/editorFoundation/operations';

const evidence = 'docs/research/editor-r1-1d';
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
  mkdirSync(evidence + '/baseline', { recursive: true });
  for (const ext of ['html', 'css', 'js'] as const) {
    const path = evidence + '/baseline/wizard.' + ext;
    if (existsSync(path)) expect(original[ext].replace(/\r\n/g, '\n')).toBe(readFileSync(path, 'utf8').replace(/\r\n/g, '\n')); else writeFileSync(path, original[ext]);
  }
  if (!existsSync(evidence + '/baseline/wizard.png')) await page.screenshot({ path: evidence + '/baseline/wizard.png' });
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  if (!existsSync(evidence + '/baseline/artwork.png')) await frame.locator('svg.imported-design-art').screenshot({ path: evidence + '/baseline/artwork.png' });
  const layers = page.locator('.ef-track .ef-layer');
  await expect.soft(layers.filter({ hasText: 'Clipped card' })).toHaveCount(1);
  await expect.soft(layers.filter({ hasText: 'Unnamed badge' })).toHaveCount(1);
  await expect.soft(page.getByRole('button', { name: /^Trim start / }).first()).toBeVisible();
  expect((await source(page)).html).toBe(original.html);
  const raster = await page.context().newPage(); await raster.setViewportSize({ width: 1920, height: 1080 });
  await raster.setContent('<style>body{margin:0}</style>' + readFileSync(new URL('./fixtures/fidelity-nested.svg', import.meta.url), 'utf8'));
  await raster.evaluate(() => document.fonts.ready);
  const sourceText = await raster.locator('svg text').evaluate(el => ({ font: getComputedStyle(el).font, box: (() => { const b = (el as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(), html: el.outerHTML }));
  await raster.locator('svg').screenshot({ path: evidence + '/baseline/source-raster.png' });
  const html = await page.evaluate(async () => (await import('/src/export/selfContained.ts')).composeSelfContainedHtml((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  await raster.setContent(html); await raster.evaluate(() => {
    const w = window as unknown as { buildInTimeline(): { pause(): void; progress(p: number, silent: boolean): void } };
    const timeline = w.buildInTimeline(); timeline.pause(); timeline.progress(1, true);
  });
  await raster.evaluate(() => document.fonts.ready);
  const importedText = await raster.locator('svg text').evaluate(el => ({ font: getComputedStyle(el).font, box: (() => { const b = (el as SVGGraphicsElement).getBBox(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })(), html: el.outerHTML }));
  writeFileSync(evidence + '/baseline/text-geometry.json', JSON.stringify({ sourceText, importedText }, null, 2));
  // Record the existing import limitation: runtime snaps this text, while the rotated
  // layout has no measured fit/nudge control in Fields. Editor edits preserve this result.
  // Arial may resolve to a different host font; compare each host with its own source raster.
  expect(importedText.box.x).toBe(sourceText.box.x);
  expect(importedText.box.width).toBe(sourceText.box.width);
  expect(importedText.box.height).toBe(sourceText.box.height);
  await raster.locator('svg').screenshot({ path: evidence + '/baseline/wizard-raster.png' });
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
  mkdirSync(evidence + '/built', { recursive: true }); await seek(page, .6); await page.screenshot({ path: evidence + '/built/child-animation.png' });
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
        const el = document.querySelector('#f0')!, s = getComputedStyle(el), m = (el as SVGGraphicsElement).getScreenCTM()!;
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
  mkdirSync(evidence + '/built', { recursive: true }); await page.screenshot({ path: evidence + '/built/nested-' + width + '.png' });
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
  writeFileSync(evidence + '/built/trim-feedback.json', JSON.stringify({ method: 'Pointer event to handle geometry after two animation frames, allowing the React commit to paint. Dev server, 1920x1080; not photon timing.', samples: feedback }, null, 2));
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
  await page.screenshot({ path: evidence + '/built/logo-and-group.png' });
});
