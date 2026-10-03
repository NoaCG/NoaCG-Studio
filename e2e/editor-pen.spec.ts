// covers: src/components/editorFoundation/**, src/blocks/{editorPaths,pathGeometry,baseEdits}.ts
// covers: src/templates/**
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pickDesign } from './_browse';
import type { SpxTemplate } from '../src/model/types';
import { settleDurableWrites } from './_durable';

const ready = async (page: Page) => { await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); };
const source = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const selection = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
async function open(page: Page, fixture = 'catalog') {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async t => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true }), JSON.parse(readFileSync(`docs/research/editor-r1-foundation/fixture-${fixture}.json`, 'utf8')) as SpxTemplate);
  await ready(page);
}
async function screen(page: Page, x: number, y: number) {
  const t = await source(page), box = (await page.locator('.ef-artboard').boundingBox())!;
  return { x: box.x + x / t.resolution.width * box.width, y: box.y + y / t.resolution.height * box.height };
}
async function point(page: Page, x: number, y: number, dx = 0, dy = 0) {
  const p = await screen(page, x, y), q = await screen(page, x + dx, y + dy);
  await page.mouse.move(p.x, p.y); await page.mouse.down();
  if (dx || dy) await page.mouse.move(q.x, q.y, { steps: 5 });
  await page.mouse.up();
}
async function draw(page: Page, closed = true, curves = false) {
  await page.getByRole('button', { name: 'pen tool', exact: true }).click();
  await point(page, 700, 300, curves ? 90 : 0, 0);
  await point(page, 1000, 300, 0, curves ? 90 : 0);
  await point(page, 850, 600);
  if (closed) await point(page, 700, 300); else await page.keyboard.press('Enter');
  await expect.poll(async () => (await selection(page))[0]).toMatch(/^#pen-/);
  await ready(page);
  return (await selection(page))[0];
}
async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }
async function frame(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }

test('baseline probe: existing canvas path capabilities', async ({ page }) => {
  for (const fixture of ['catalog', 'svg', 'f4']) {
    await open(page, fixture);
    console.log(fixture, { pen: await page.getByRole('button', { name: 'pen tool', exact: true }).count(), points: await page.getByRole('button', { name: 'Edit points', exact: true }).count() });
  }
});
for (const fixture of ['catalog', 'svg', 'f4']) test(`${fixture}: triangle creation is one transaction with selection, centered pivot and bar`, async ({ page }) => {
  await open(page, fixture); const before = await source(page);
  const id = await draw(page), t = await source(page);
  expect(t.html).toContain('M '); expect(t.html).toContain(' Z');
  expect(t.fields).toEqual(before.fields); expect(t.assets).toEqual(before.assets);
  await expect(page.locator(`.ef-track[data-selector="${id}"] .ef-bar`).first()).toBeVisible();
  const f = await frame(page);
  const geometry = await f.locator(id).evaluate(el => { const r = el.getBoundingClientRect(), s = getComputedStyle(el); return { width: r.width, height: r.height, origin: s.transformOrigin.split(' ').map(parseFloat), box: [parseFloat(s.width), parseFloat(s.height)], opacity: s.opacity }; });
  expect(geometry.width).toBeGreaterThan(100); expect(geometry.height).toBeGreaterThan(100);
  expect(geometry.origin[0]).toBeCloseTo(geometry.box[0] / 2, 1); expect(geometry.origin[1]).toBeCloseTo(geometry.box[1] / 2, 1);
  expect(geometry.opacity).toBe('1');
  await undo(page); expect(await source(page)).toEqual(before); expect(await selection(page)).toEqual([]);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(t);
});
test('open polyline, Backspace, cancellation and one-point refusal leave source intact', async ({ page }) => {
  await open(page); const before = await source(page);
  for (const exit of ['Escape', 'tool', 'pointer']) {
    await page.getByRole('button', { name: 'pen tool', exact: true }).click(); await point(page, 700, 300); await point(page, 900, 300);
    await expect(page.locator('[data-pen-point]')).toHaveCount(2);
    expect(await source(page)).toEqual(before);
    if (exit === 'tool') await page.getByRole('button', { name: 'select tool', exact: true }).click();
    else if (exit === 'pointer') await page.getByTestId('foundation-canvas').dispatchEvent('pointercancel');
    else await page.keyboard.press('Escape');
    await expect(page.locator('[data-pen-point]')).toHaveCount(0); expect(await source(page)).toEqual(before);
  }
  await page.getByRole('button', { name: 'pen tool', exact: true }).click(); await point(page, 700, 300); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('two'); expect(await source(page)).toEqual(before);
  await point(page, 1000, 300); await point(page, 850, 600); await page.keyboard.press('Backspace');
  await expect(page.locator('[data-pen-point]')).toHaveCount(2); await page.keyboard.press('Enter'); await ready(page);
  const id = (await selection(page))[0], f = await frame(page);
  expect(await f.locator(id + ' path').getAttribute('d')).not.toContain('Z');
  expect(await f.locator(id + ' path').evaluate(el => getComputedStyle(el).fill)).toBe('none');
  await undo(page); expect(await source(page)).toEqual(before);
});
test('curved path, paint, point and handle gestures preserve motion and each undo once', async ({ page }) => {
  await open(page); const id = await draw(page, true, true), before = await source(page);
  expect(before.html).toContain(' C ');
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  const handle = page.locator('[data-pen-handle="0-out"]'); await expect(handle).toBeVisible();
  const box = (await handle.boundingBox())!; await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 40, box.y + 30, { steps: 8 });
  expect(await source(page)).toEqual(before); await page.mouse.up(); await ready(page);
  const edited = await source(page); expect(edited.html).not.toBe(before.html); expect(edited.js).toBe(before.js); expect(edited.css).toBe(before.css);
  await undo(page); expect(await source(page)).toEqual(before);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();
  await page.getByTestId('path-stroke-width').locator('input').fill('9'); await page.getByTestId('path-stroke-width').locator('input').press('Enter'); await ready(page);
  expect(await (await frame(page)).locator(id + ' path').evaluate(el => getComputedStyle(el).strokeWidth)).toBe('9px');
  await undo(page); expect(await source(page)).toEqual(before);
});
test('stale draft cannot commit after another source edit', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'pen tool', exact: true }).click(); await point(page, 700, 300); await point(page, 1000, 400);
  await page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, css: s.template.css + '\n/* other edit */' }); });
  const changed = await source(page); await ready(page); await page.keyboard.press('Enter'); expect(await source(page)).toEqual(changed);
  await expect(page.getByRole('alert')).toContainText('Draw or inspect this path again');
});
test('real template search reaches a created path in Hairline drawing space', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  const id = await draw(page, true, true), f = await frame(page);
  const start = await f.locator(id + ' path').evaluate(el => { const path = el as SVGPathElement, p = path.getPointAtLength(0), m = path.getScreenCTM()!; return { x: m.a * p.x + m.c * p.y + m.e, y: m.b * p.x + m.d * p.y + m.f }; });
  expect(Math.abs(start.x - 700)).toBeLessThan(2); expect(Math.abs(start.y - 300)).toBeLessThan(2);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  await page.screenshot({ path: 'docs/research/editor-r1-2b-4/catalog-path.png', fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 }); await page.screenshot({ path: 'docs/research/editor-r1-2b-4/laptop-path.png', fullPage: true });
  expect(errors).toEqual([]);
});

test('draft playhead change refuses completion without source or history', async ({ page }) => {
  await open(page); const before = await source(page);
  await page.getByRole('button', { name: 'pen tool', exact: true }).click(); await point(page, 700, 300); await point(page, 1000, 500);
  const ruler = page.getByTestId('foundation-ruler'); await ruler.focus(); await ruler.press('ArrowRight');
  await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('playhead moved'); expect(await source(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('zero-scale point inspection is safe and editing refuses a singular parent', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await open(page); const id = await draw(page);
  // An untracked parent supplies a genuinely singular rendered pose, independent of GSAP's layer cache.
  await page.evaluate(async id => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); const node = new RegExp('(<div id="' + id.slice(1) + '"[\\s\\S]*?</svg></div>)'); s.applyTemplate({ ...s.template, html: s.template.html.replace(node, '<div style="position:absolute;scale:0;transform-origin:850px -600px">$1</div>') }); }, id);
  await ready(page); const before = await source(page);
  expect(await (await frame(page)).locator(id).evaluate(el => el.getBoundingClientRect().width)).toBe(0);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click(); await expect(page.locator('[data-pen-point]')).toHaveCount(3);
  const box = (await page.locator('[data-pen-point="0"]').boundingBox())!; await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByRole('alert')).toContainText('singular'); expect(await source(page)).toEqual(before); expect(errors).toEqual([]);
});

test('raster graphic draws a path, supports layer scale/rotation, None paint and canceled edits', async ({ page }) => {
  await open(page);
  await page.evaluate(async () => { const { variantById } = await import('/src/templates/catalog.ts'); const t = variantById('imp01')!.create({ designArt: { path: 'images/art.png', width: 960, height: 270 } }); (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true }); });
  await ready(page); const id = await draw(page), original = await source(page);
  await page.getByRole('button', { name: 'No fill', exact: true }).click(); await ready(page);
  expect(await (await frame(page)).locator(id + ' path').evaluate(el => getComputedStyle(el).fill)).toBe('none'); await undo(page); expect(await source(page)).toEqual(original);
  // Use ordinary registry transforms on this newly created layer, then edit its points through its rendered pose.
  await page.evaluate(async id => { const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(); session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'base.set', selector: id, values: { scaleX: 1.3, scaleY: .8, rotation: 25 } }] }); }, id);
  await ready(page); const transformed = await source(page);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  const marker = page.locator('[data-pen-point="1"]'), box = (await marker.boundingBox())!;
  const matrix = await (await frame(page)).locator(id).evaluate(el => { const style = getComputedStyle(el), m = new DOMMatrix(style.transform); return [m.a, m.b, m.c, m.d]; });
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }, end = { x: start.x + 35, y: start.y + 20 };
  const artboard = (await page.locator('.ef-artboard').boundingBox())!, viewScale = artboard.width / 1920;
  await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 5 }); await page.mouse.up(); await ready(page);
  const delta = await page.evaluate(async ({ id, original }) => { const { inspectPath } = await import('/src/blocks/editorPaths.ts'); const a = inspectPath(original, id)!.geometry!.points[1], b = inspectPath((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template, id)!.geometry!.points[1]; return { x: b.x - a.x, y: b.y - a.y }; }, { id, original: transformed });
  const [a, b, c, d] = matrix, det = a * d - b * c;
  expect(delta.x).toBeCloseTo((d * 35 - c * 20) / det / viewScale, 1); expect(delta.y).toBeCloseTo((-b * 35 + a * 20) / det / viewScale, 1);
  await undo(page); expect(await source(page)).toEqual(transformed);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + 35, box.y + 20, { steps: 5 });
  await page.keyboard.press('Escape'); await page.mouse.up(); expect(await source(page)).toEqual(transformed);
  await undo(page); expect(await source(page)).toEqual(original);
});

test('a horizontal open path can be selected and moved by its visible stroke', async ({ page }) => {
  await open(page); await page.getByRole('button', { name: 'pen tool', exact: true }).click();
  await point(page, 700, 300); await point(page, 1000, 300); await page.keyboard.press('Enter'); await ready(page);
  const id = (await selection(page))[0], before = await source(page);
  await point(page, 1300, 700); expect(await selection(page)).toEqual([]);
  await point(page, 850, 302); expect(await selection(page)).toEqual([id]);
  await point(page, 850, 302, 40, 30); await ready(page); const moved = await source(page);
  expect(moved.html).toBe(before.html); expect(moved.css).not.toBe(before.css);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('edited path remains selectable outside its initial transform frame', async ({ page }) => {
  await open(page); const id = await draw(page);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  await point(page, 1000, 300, 250, -50); await ready(page);
  await page.getByRole('button', { name: 'select tool', exact: true }).click(); await point(page, 1300, 700);
  expect(await selection(page)).toEqual([]); await point(page, 1200, 280);
  expect(await selection(page)).toEqual([id]);
});

test('imported path point and tangent editing maps transformed parents and mints identity once', async ({ page }) => {
  await open(page, 'svg');
  const selector = await page.evaluate(async () => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const t = { ...store.template, html: store.template.html.replace('</svg>', '<g transform="translate(200 20) rotate(18) scale(1.1 .8)"><path data-pen-fixture="true" d="M 0 0 C 20 -20 70 -20 100 0 L 50 80 Z" fill="#f6a623" /></g></svg>') };
    store.applyTemplate(t);
    const doc = new DOMParser().parseFromString(t.html, 'text/html');
    return (await import('/src/model/structure.ts')).getTemplateParts(t.html, t.fields, true).find(p => doc.querySelector(p.selector)?.hasAttribute('data-pen-fixture'))!.selector;
  });
  await ready(page); await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).first().click(); await ready(page);
  const before = await source(page), f = await frame(page);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  const untouched = (await page.locator('[data-pen-point="1"]').boundingBox())!;
  await page.mouse.click(untouched.x + untouched.width / 2, untouched.y + untouched.height / 2); await ready(page);
  expect(await source(page)).toEqual(before); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  for (const which of ['point', 'handle']) {
    const marker = page.locator(which === 'point' ? '[data-pen-point="1"]' : '[data-pen-handle="1-in"]');
    const box = (await marker.boundingBox())!, x = box.x + box.width / 2, y = box.y + box.height / 2;
    const from = await source(page), id = (await selection(page))[0];
    const matrix = await f.locator(id).evaluate(el => { const m = (el as SVGGraphicsElement).getScreenCTM()!; return [m.a, m.b, m.c, m.d, m.e, m.f]; });
    const artboard = (await page.locator('.ef-artboard').boundingBox())!, fit = artboard.width / from.resolution.width;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 35, y - 20, { steps: 8 });
    expect(await source(page)).toEqual(from); await page.mouse.up(); await ready(page);
    const nextId = (await selection(page))[0]; expect(nextId).toMatch(/^#/);
    const coordinates = await page.evaluate(async id => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      return (await import('/src/blocks/editorPaths.ts')).inspectPath(t, id)!.geometry!;
    }, nextId);
    const determinant = matrix[0] * matrix[3] - matrix[1] * matrix[2], dx = 35 / fit, dy = -20 / fit;
    const expected = { x: (which === 'point' ? 100 : 70) + (matrix[3] * dx - matrix[2] * dy) / determinant, y: (which === 'point' ? 0 : -20) + (-matrix[1] * dx + matrix[0] * dy) / determinant };
    const moved = which === 'point' ? coordinates.points[1] : coordinates.points[1].in!;
    expect(Math.abs(moved.x - expected.x)).toBeLessThan(.05); expect(Math.abs(moved.y - expected.y)).toBeLessThan(.05);
    expect((await source(page)).js).toBe(from.js); await undo(page); expect(await source(page)).toEqual(from);
  }
  expect(await source(page)).toEqual(before);
});

test('SVG stroke width reads pixels and refuses relative units without source changes', async ({ page }) => {
  await open(page, 'svg');
  await page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, html: s.template.html.replace('</svg>', '<path id="unit-path" data-gfx d="M 0 0 L 100 0 L 50 80 Z" fill="#f6a623" stroke="#ffffff" STROKE-WIDTH="7px" /></svg>') }); s.setSelectedParts(['#unit-path']); });
  await ready(page); const before = await source(page), input = page.getByTestId('path-stroke-width').locator('input');
  expect(await (await frame(page)).locator('#unit-path').evaluate(el => getComputedStyle(el).strokeWidth)).toBe('7px');
  await expect(input).toHaveValue('7'); await input.fill('9'); await input.press('Enter'); await ready(page);
  expect(await (await frame(page)).locator('#unit-path').evaluate(el => getComputedStyle(el).strokeWidth)).toBe('9px');
  await undo(page); expect(await source(page)).toEqual(before);
  await page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, html: s.template.html.replace('STROKE-WIDTH="7px"', 'STROKE-WIDTH="2em"') }); });
  await ready(page); const relative = await source(page);
  await expect(page.getByTestId('path-width-reason')).toContainText('units'); await expect(page.getByTestId('path-stroke-width')).toHaveCount(0);
  expect(await source(page)).toEqual(relative);
});

test('guards refuse unsupported geometry, driven source, CSS paint, changed topology and lossy motion', async ({ page }) => {
  await open(page); const id = await draw(page);
  const errors = await page.evaluate(async id => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { inspectPath } = await import('/src/blocks/editorPaths.ts');
    const geometry = inspectPath(t, id)!.geometry!, errors: Record<string, string> = {};
    const check = (name: string, template: SpxTemplate, op: unknown) => { try { applyOperations(template, [op as Parameters<typeof applyOperations>[1][number]]); errors[name] = 'DID NOT REFUSE'; } catch (cause) { errors[name] = String(cause); } };
    check('time', t, { kind: 'path.create', geometry, time: -1 });
    check('finite', t, { kind: 'path.create', geometry: { ...geometry, points: [{ x: NaN, y: 0 }, ...geometry.points.slice(1)] }, time: 0 });
    check('missing', t, { kind: 'path.edit', selector: '#f0', geometry });
    check('topology', t, { kind: 'path.edit', selector: id, geometry: { ...geometry, points: geometry.points.slice(1) } });
    check('closed', t, { kind: 'path.edit', selector: id, geometry: { ...geometry, closed: false } });
    check('command', { ...t, html: t.html.replace(/d="M [^"]+"/, 'd="M 0 0 Q 30 0 50 50"') }, { kind: 'path.edit', selector: id, geometry });
    check('driven', { ...t, js: t.js + '\n document.querySelector("' + id + '").setAttribute("d", "M0 0 L1 1");' }, { kind: 'path.edit', selector: id, geometry });
    check('css', { ...t, css: t.css + '\n' + id + ' path { d: path("M0 0 L1 1"); }' }, { kind: 'path.edit', selector: id, geometry });
    check('cssAnimation', { ...t, css: t.css + '\n@keyframes penMorph { to { d: path("M0 0 L20 0 L20 20 Z"); } }\n' + id + ' path { animation: penMorph 1s infinite; }' }, { kind: 'path.edit', selector: id, geometry });
    check('independent', { ...t, css: t.css + '\n' + id + ' path { scale: 2; }' }, { kind: 'path.edit', selector: id, geometry });
    check('embedded', { ...t, html: t.html.replace('<body>', '<body><style>' + id + ' path { d: path("M0 0 L1 1"); }</style>') }, { kind: 'path.edit', selector: id, geometry });
    check('svg', { ...t, html: t.html.replace(' /></svg>', '><animate attributeName="d" /></path></svg>') }, { kind: 'path.edit', selector: id, geometry });
    check('width', t, { kind: 'path.paint', selector: id, values: { width: -1 } });
    check('colour', t, { kind: 'path.paint', selector: id, values: { fill: 'url(#a)' } });
    check('empty', t, { kind: 'path.paint', selector: id, values: {} });
    check('paint', { ...t, css: t.css + '\n' + id + ' path { fill: red; }' }, { kind: 'path.paint', selector: id, values: { fill: '#112233' } });
    const location = (await import('/src/blocks/animData.ts')).locateAnimData(t.js)!;
    const unknown = JSON.parse(t.js.slice(location.start, location.end)); unknown.future = true;
    check('motion', { ...t, js: t.js.slice(0, location.start) + JSON.stringify(unknown) + t.js.slice(location.end) }, { kind: 'path.create', geometry, time: 0 });
    return errors;
  }, id);
  for (const [name, pattern] of Object.entries({ time: /placement time/, finite: /finite/, missing: /single SVG/, topology: /two|topology/, closed: /topology/, command: /M\/L\/C\/Z/, driven: /driven by code/, css: /driven by CSS/, cssAnimation: /driven by CSS/, independent: /independent SVG/, embedded: /driven by CSS/, svg: /SVG animation/, width: /Stroke width/, colour: /hex colour/, empty: /paint change/, paint: /CSS fill/, motion: /preserve exactly/ })) expect(errors[name], name).toMatch(pattern);
  await page.evaluate(async id => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, html: s.template.html.replace(/d="M [^"]+"/, 'd="M0 0 A20 20 0 0 1 50 50"') }); s.setSelectedParts([id]); }, id);
  await expect(page.getByRole('button', { name: 'Edit points', exact: true })).toBeDisabled(); await expect(page.getByTestId('path-reason')).toContainText('Other SVG commands');
});

test('path paint, movement, playhead visibility and save/reopen execute on all export targets', async ({ page }) => {
  await open(page);
  const ruler = page.getByTestId('foundation-ruler'); await ruler.focus(); await ruler.press('Home'); await ruler.press('Shift+ArrowRight');
  await expect(page.getByRole('status').filter({ hasText: '0.40 s' })).toBeVisible();
  await ready(page);
  const id = await draw(page, true, true);
  const f = await frame(page);
  expect(await f.locator(id).evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  await page.getByRole('button', { name: 'Go to beginning', exact: true }).click(); await ready(page);
  await expect.poll(() => f.locator(id).evaluate(el => getComputedStyle(el).visibility)).toBe('hidden');
  await ruler.focus(); await ruler.press('Shift+ArrowRight'); await ready(page);
  await expect.poll(() => f.locator(id).evaluate(el => getComputedStyle(el).visibility)).toBe('visible');
  for (const [field, value] of [['path-fill', '#fa7200'], ['path-stroke', '#123456'], ['path-stroke-width', '8']]) {
    const input = page.getByTestId(field).locator('input:not([type="color"])'); await input.fill(value); await input.press('Enter'); await ready(page);
  }
  const from = await source(page);
  await point(page, 850, 420, 80, 50); await ready(page);
  expect((await source(page)).html).toBe(from.html); expect((await source(page)).css).not.toBe(from.css);
  await undo(page); expect(await source(page)).toEqual(from);
  const edited = await source(page), d = await (await frame(page)).locator(id + ' path').getAttribute('d');
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Pen export proof'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); await page.reload(); await ready(page);
  const reopened = await source(page); expect(reopened.html).toBe(edited.html); expect(reopened.css).toBe(edited.css);
  // This historical fixture upgrades its saved interpreter on reopen. Its authored motion must stay exact.
  const motion = await page.evaluate(async js => { const { parseAnimData } = await import('/src/blocks/animData.ts'); return js.map(parseAnimData); }, [edited.js, reopened.js]);
  expect(motion[1]).toEqual(motion[0]);
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async target => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    const output = await page.context().newPage(), errors: string[] = []; output.on('pageerror', e => errors.push(e.message));
    await output.route('http://pen-output.local/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1), content = files[name];
      return content ? route.fulfill({ status: 200, contentType: /\.m?js$/.test(name) ? 'application/javascript' : /\.html$/.test(name) ? 'text/html' : /\.css$/.test(name) ? 'text/css' : 'application/octet-stream', body: Buffer.from(content, 'base64') }) : route.fulfill({ status: name ? 404 : 200, contentType: 'text/html', body: '<html><body></body></html>' });
    });
    if (target === 'ograf') {
      await output.goto('http://pen-output.local/');
      await output.evaluate(async () => { const mod = await import('http://pen-output.local/graphic.mjs'); customElements.define('pen-graphic', mod.default); const el = document.createElement('pen-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> }; document.body.appendChild(el); await el.load({ data: {} }); await el.playAction({}); });
    } else {
      await output.goto('http://pen-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
      await output.evaluate(() => (window as unknown as { play(): void }).play());
    }
    await expect.poll(() => output.locator(id).evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    expect(await output.locator(id + ' path').getAttribute('d')).toBe(d);
    const paint = await output.locator(id + ' path').evaluate(el => { const s = getComputedStyle(el); return [s.fill, s.stroke, s.strokeWidth, (el as SVGPathElement).getTotalLength()]; });
    expect(paint.slice(0, 3)).toEqual(['rgb(250, 114, 0)', 'rgb(18, 52, 86)', '8px']); expect(paint[3]).toBeGreaterThan(700);
    expect(errors).toEqual([]); await output.close();
  }
});
