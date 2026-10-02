// covers: src/blocks/{artworkEdits,designLayout,edit,baseEdits}.ts, src/components/editorFoundation/**, src/templates/shared/textFit.ts
// covers: src/model/fonts.ts, src/preview/composeDocument.ts
//
// R1.2b.2 typography and fit (docs/research/editor-r1-2b-2): weight, alignment, line and letter
// spacing and what a long value does (Shrink to fit, Wrap, Run on) on created and imported text,
// each one undo; on a text box the side handles resize the box and the corners scale (owner,
// 2026-10-02). Catalog lines keep alignment and fit with their design, SVG text with its import's
// fit ladder. scripts/typography.test.mjs checks the pure parts in Node.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';

type Template = { js: string; html: string; css: string; fps: number; fields: { field: string }[] };
type Point = { x: number; y: number };
type Box = { left: number; right: number; top: number; bottom: number; width: number; height: number };
type Base = { x: number; y: number; scaleX: number; scaleY: number; rotation: number; mode: string; target: string };

async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
}
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
}
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template) as Promise<Template>; }
async function history(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length); }
async function base(page: Page, selector: string): Promise<Base> {
  return page.evaluate(async selector => (await import('/src/blocks/baseEdits.ts')).baseValues((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template as never, selector), selector) as Promise<Base>;
}
async function slot(page: Page, wrapper: string) {
  return page.evaluate(async wrapper => (await import('/src/blocks/designLayout.ts')).slotSize((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.css, wrapper.slice(1)), wrapper);
}
async function editorWith(page: Page, t: Template) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, t);
  await ready(page);
}
/** Hairline (a lower third) with created point text and a created 400 x 120 text box. Drawing
 *  coordinates are its root's, which sits low in the frame: negative y is up. */
async function withText(page: Page): Promise<Template & { point: string; box: string }> {
  await open(page);
  return page.evaluate(async () => {
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    let template = (await import('/src/templates/catalog.ts')).variantById('lt01')!.create({}) as never as Parameters<typeof createArtwork>[0];
    const a = createArtwork(template, { shape: 'text', x: 200, y: -640, width: 400, height: 80 }); template = a.template;
    const b = createArtwork(template, { shape: 'text', x: 900, y: -560, width: 400, height: 120, box: true });
    return { ...b.template, point: a.selector, box: b.selector };
  }) as Promise<Template & { point: string; box: string }>;
}
async function select(page: Page, selector: string) { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).first().click(); await ready(page); }
const undo = async (page: Page) => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); };
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
/** An element's rendered box in the preview, in composition pixels. */
async function rect(page: Page, selector: string): Promise<Box> {
  return (await preview(page)).locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; });
}
/** The text's rendered rows: the line boxes of its characters, merged by row. */
async function rows(page: Page, selector: string): Promise<Box[]> {
  return (await preview(page)).locator(selector).evaluate(el => {
    const range = document.createRange(); range.selectNodeContents(el);
    const lines: { left: number; right: number; top: number; bottom: number }[] = [];
    for (const r of range.getClientRects()) {
      if (r.width <= 0) continue;
      const line = lines.find(l => Math.abs(l.top - r.top) < 2);
      if (line) { line.left = Math.min(line.left, r.left); line.right = Math.max(line.right, r.right); } else lines.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    return lines.sort((a, b) => a.top - b.top).map(l => ({ ...l, width: l.right - l.left, height: l.bottom - l.top }));
  });
}
async function computed(page: Page, selector: string, property: string) {
  return (await preview(page)).locator(selector).evaluate((el, property) => getComputedStyle(el).getPropertyValue(property), property);
}
async function centre(page: Page, css: string): Promise<Point> {
  const b = (await page.locator(css).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const edge = (page: Page, i: number) => centre(page, `.ef-selection [data-edge="${i}"]`);
const corner = (page: Page, i: number) => centre(page, `.ef-selection [data-handle="${i}"]`);
/** Screen pixels per composition pixel. */
async function fit(page: Page) { return (await page.locator('.ef-artboard').boundingBox())!.width / 1920; }
async function drag(page: Page, from: Point, dx: number, dy: number, { escape = false } = {}) {
  // A handle under the timeline or off the canvas would press something else.
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid=foundation-canvas]'), from), 'the press lands on the canvas').toBe(true);
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + dx * i / 8, from.y + dy * i / 8);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up(); await ready(page);
}
const inspector = (page: Page) => page.locator('.ef-inspector');
const choose = async (page: Page, label: string, value: string) => { await inspector(page).getByRole('combobox', { name: label, exact: true }).selectOption(value); await ready(page); };
async function number(page: Page, label: string, value: number) {
  const input = inspector(page).getByRole('spinbutton', { name: label, exact: true });
  await input.fill(String(value)); await input.press('Enter'); await ready(page);
}
async function setText(page: Page, text: string) {
  await page.getByLabel('Artwork text').fill(text);
  await page.getByRole('button', { name: 'Apply text', exact: true }).click(); await ready(page);
}
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance + 1e-9;
const ruleOf = (css: string, selector: string) => (css.match(new RegExp(selector.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g')) ?? []).join('\n');
const operate = (page: Page, t: Template, operations: unknown[]) => page.evaluate(async ({ t, operations }) => {
  try { return { template: (await import('/src/components/editorFoundation/operations.ts')).applyOperations(t as never, operations as never).template as never as Template }; }
  catch (error) { return { error: String((error as Error).message ?? error) }; }
}, { t, operations }) as Promise<{ template?: Template; error?: string }>;
const LONG = 'Dr. Maximiliane Alexandra Featherstonehaugh-Worthington III';

// ---- The type controls ----

test('weight lists the font’s own weights and writes the line’s rule; one undo each, with a preview', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.point);
  const weight = inspector(page).getByRole('combobox', { name: 'Weight', exact: true });
  // Hairline's text is Inter, bundled from 400 to 800.
  await expect(weight.locator('option')).toHaveText(['Regular', 'Medium', 'Semibold', 'Bold', 'Extra bold']);
  const original = await source(page), steps = await history(page), before = await rect(page, t.point);
  await choose(page, 'Weight', '700');
  const bold = await source(page);
  expect(bold.js).toBe(original.js); expect(bold.html).toBe(original.html);
  expect(ruleOf(bold.css, t.point)).toMatch(/font-weight:\s*700/);
  expect(await history(page)).toBe(steps + 1);
  expect(await computed(page, t.point, 'font-weight')).toBe('700');
  await expect(weight).toHaveValue('700');
  expect((await rect(page, t.point)).width).toBeGreaterThan(before.width + 2);
  await undo(page); expect(await source(page)).toEqual(original);
  // A font with one weight offers only that one.
  await inspector(page).getByRole('combobox', { name: 'Font', exact: true }).selectOption({ label: 'Bebas Neue' }); await ready(page);
  await expect(weight.locator('option')).toHaveText(['Regular']);
  // A weight the font does not draw, written elsewhere, still shows as it is.
  const heavy = await operate(page, original, [{ kind: 'style.set', selector: t.point, values: { weight: 900 } }]);
  await evaluateInPage(page, async (t: unknown) => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never), heavy.template);
  await ready(page);
  await expect(weight).toHaveValue('900');
  await expect(weight.locator('option')).toHaveText(['Regular', 'Medium', 'Semibold', 'Bold', 'Extra bold', '900']);
  expect(errors).toEqual([]);
});

test('alignment: point text keeps its X as the aligned edge, a text box aligns its rows inside it', async ({ page }) => {
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.point);
  const wrapper = (await base(page, t.point)).target;
  const x = (await rect(page, wrapper)).left, steps = await history(page);
  await choose(page, 'Alignment', 'center');
  let r = await rect(page, wrapper);
  expect(near((r.left + r.right) / 2, x, .5), `centre ${(r.left + r.right) / 2} vs ${x}`).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  await setText(page, LONG);
  r = await rect(page, wrapper);
  expect(near((r.left + r.right) / 2, x, .5), `long centre ${(r.left + r.right) / 2} vs ${x}`).toBe(true);
  await choose(page, 'Alignment', 'right');
  r = await rect(page, wrapper);
  expect(near(r.right, x, .5), `right ${r.right} vs ${x}`).toBe(true);
  await expect(inspector(page).getByRole('combobox', { name: 'Alignment', exact: true })).toHaveValue('right');

  // A text box: the box stays, every row centres inside it.
  await select(page, t.box);
  const boxWrapper = (await base(page, t.box)).target;
  await setText(page, 'A longer operator headline that wraps onto several readable rows');
  const frame = await rect(page, boxWrapper);
  await choose(page, 'Alignment', 'center');
  expect(await rect(page, boxWrapper)).toEqual(frame);
  const centred = await rows(page, t.box);
  expect(centred.length).toBeGreaterThan(1);
  for (const row of centred) expect(near((row.left + row.right) / 2, (frame.left + frame.right) / 2, .75), `row ${JSON.stringify(row)} in ${JSON.stringify(frame)}`).toBe(true);
  expect(ruleOf((await source(page)).css, boxWrapper)).toMatch(/text-align:\s*center/);
  await expect(inspector(page).getByRole('combobox', { name: 'Alignment', exact: true })).toHaveValue('center');
});

test('line and letter spacing write the line’s rule and space the rendered text', async ({ page }) => {
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.box);
  await setText(page, 'A longer operator headline that wraps onto several readable rows');
  const steps = await history(page);
  await number(page, 'Line spacing', 1.4);
  expect(await history(page)).toBe(steps + 1);
  const spaced = await rows(page, t.box);
  expect(spaced.length).toBeGreaterThan(2);
  expect(near(spaced[1].top - spaced[0].top, 1.4 * 48, .5), `pitch ${spaced[1].top - spaced[0].top}`).toBe(true);
  expect(ruleOf((await source(page)).css, t.box)).toMatch(/line-height:\s*1\.4/);
  // Selected again, the field reads the spacing the preview renders.
  await select(page, t.point); await select(page, t.box);
  await expect(inspector(page).getByRole('spinbutton', { name: 'Line spacing', exact: true })).toHaveValue('1.4');

  await select(page, t.point);
  const before = await rect(page, t.point), characters = 'New text'.length;
  await number(page, 'Letter spacing', 2);
  const after = await rect(page, t.point);
  expect(near(after.width - before.width, 2 * characters, characters), `${after.width - before.width}`).toBe(true);
  expect(ruleOf((await source(page)).css, t.point)).toMatch(/letter-spacing:\s*2px/);
  await select(page, t.box); await select(page, t.point);
  await expect(inspector(page).getByRole('spinbutton', { name: 'Letter spacing', exact: true })).toHaveValue('2');
  await undo(page);
  expect(near((await rect(page, t.point)).width, before.width, .5)).toBe(true);
});

test('long text: Shrink to fit, Wrap and Run on answer a 61-character value, each one undo', async ({ page }) => {
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.point);
  await setText(page, LONG);
  const longLine = await rect(page, t.point);
  expect(longLine.width).toBeGreaterThan(900);
  const longText = inspector(page).getByRole('combobox', { name: 'Long text', exact: true });
  await expect(longText).toHaveValue('overflow');
  await expect(longText.locator('option')).toHaveText(['Shrink to fit', 'Wrap', 'Run on']);
  // Run on has no width to edit.
  await expect(inspector(page).getByRole('spinbutton', { name: 'Width', exact: true })).toHaveCount(0);

  let steps = await history(page);
  await choose(page, 'Long text', 'shrink');
  expect(await history(page)).toBe(steps + 1);
  await number(page, 'Width', 800);
  await expect.poll(async () => (await rect(page, t.point)).width).toBeLessThanOrEqual(800.5);
  expect((await rows(page, t.point)).length).toBe(1);
  expect(parseFloat(await computed(page, t.point, 'font-size'))).toBeGreaterThanOrEqual(48 * .55 - .01);
  const shrunk = await source(page);
  expect(shrunk.js.split('function fitPlacedText').length - 1).toBe(1);
  expect(shrunk.html).toMatch(new RegExp(`id="${t.point.slice(1)}"[^>]*data-fit="shrink"`));
  // Point text given a width is a slot: a Width, no Height, and the registry refuses one.
  await expect(inspector(page).getByRole('spinbutton', { name: 'Height', exact: true })).toHaveCount(0);
  expect((await operate(page, shrunk, [{ kind: 'style.set', selector: t.point, values: { height: 50 } }])).error).toMatch(/no box height/);
  for (const values of [{ weight: 450.5 }, { weight: 0 }, { lineHeight: 9 }, { letterSpacing: 9999 }, { fit: 'squash' }, { align: 'justify' }, { width: 0 }]) {
    expect((await operate(page, shrunk, [{ kind: 'style.set', selector: t.point, values }])).error, JSON.stringify(values)).toBeTruthy();
  }

  steps = await history(page);
  await choose(page, 'Long text', 'wrap');
  expect(await history(page)).toBe(steps + 1);
  await expect.poll(async () => (await rows(page, t.point)).length).toBeGreaterThan(1);
  for (const row of await rows(page, t.point)) expect(row.width).toBeLessThanOrEqual(800.5);
  expect(await computed(page, t.point, 'font-size')).toBe('48px');

  await choose(page, 'Long text', 'overflow');
  await expect.poll(async () => (await rect(page, t.point)).width).toBeGreaterThan(900);
  expect((await rows(page, t.point)).length).toBe(1);
  // Choosing Shrink again reuses the runtime already in the script.
  await choose(page, 'Long text', 'shrink');
  expect((await source(page)).js.split('function fitPlacedText').length - 1).toBe(1);
  await undo(page); await undo(page); await undo(page);
  expect((await source(page)).js).toBe(shrunk.js);
});

// ---- The text box on the canvas ----

test('a text box resizes from its sides without stretching its letters; its corners and point text still scale', async ({ page }) => {
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.box);
  const wrapper = (await base(page, t.box)).target, f = await fit(page);
  await expect(inspector(page).getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue('400');
  await expect(inspector(page).getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue('120');
  const original = await source(page), steps = await history(page), start = await rect(page, wrapper);
  // Escape cancels.
  await drag(page, await edge(page, 1), 100, 0, { escape: true });
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
  // The right side: wider by the pointer's move, the left side and the letters stay.
  await drag(page, await edge(page, 1), 100, 0);
  expect(await history(page)).toBe(steps + 1);
  let size = (await slot(page, wrapper))!;
  expect(near(size.width, 400 + 100 / f, .5), `width ${size.width}`).toBe(true);
  expect(size.height).toBe(120);
  let now = await rect(page, wrapper), b = await base(page, t.box);
  expect(near(now.left, start.left, .5) && near(now.top, start.top, .5)).toBe(true);
  expect([b.scaleX, b.scaleY]).toEqual([1, 1]);
  expect(await computed(page, t.box, 'font-size')).toBe('48px');
  // The left side: the right side stays.
  const right = now.right;
  await drag(page, await edge(page, 3), -60, 0);
  size = (await slot(page, wrapper))!;
  expect(near(size.width, 400 + 160 / f, .75), `width ${size.width}`).toBe(true);
  now = await rect(page, wrapper);
  expect(near(now.right, right, .5), `right ${now.right} vs ${right}`).toBe(true);
  // The bottom side: only the height.
  await drag(page, await edge(page, 2), 0, 40);
  const tall = (await slot(page, wrapper))!;
  expect(near(tall.height, 120 + 40 / f, .5), `height ${tall.height}`).toBe(true);
  expect(tall.width).toBe(size.width);
  await expect(inspector(page).getByRole('spinbutton', { name: 'Height', exact: true })).toHaveValue(String(Math.round(tall.height * 1000) / 1000));

  // Turned 30 degrees, the right side still widens it along its own sides; the left side's midpoint stays.
  await page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Rotation', exact: true }).fill('30');
  await page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Rotation', exact: true }).press('Enter'); await ready(page);
  const kept = await edge(page, 3), angle = Math.PI / 6, widthBefore = (await slot(page, wrapper))!.width;
  await drag(page, await edge(page, 1), 50 * Math.cos(angle), 50 * Math.sin(angle));
  expect(near((await slot(page, wrapper))!.width, widthBefore + 50 / f, .75)).toBe(true);
  const stays = await edge(page, 3);
  expect(near(stays.x, kept.x, .6) && near(stays.y, kept.y, .6), `left side ${JSON.stringify(stays)} vs ${JSON.stringify(kept)}`).toBe(true);
  b = await base(page, t.box);
  expect([b.scaleX, b.scaleY]).toEqual([1, 1]);

  // A corner still scales the whole box.
  const sized = (await slot(page, wrapper))!;
  await drag(page, await corner(page, 2), 30, 30);
  b = await base(page, t.box);
  expect(b.scaleX).not.toBe(1);
  expect(await slot(page, wrapper)).toEqual(sized);

  // Point text's side handles scale it, as before.
  await select(page, t.point);
  await drag(page, await edge(page, 1), 40, 0);
  expect((await base(page, t.point)).scaleX).toBeGreaterThan(1);
  // So does a box set to Run on.
  await select(page, t.box);
  await choose(page, 'Long text', 'overflow');
  const scaled = (await base(page, t.box)).scaleX;
  await drag(page, await edge(page, 1), 40, 0);
  expect((await base(page, t.box)).scaleX).toBeGreaterThan(scaled);

  // A box whose text animates a raw transform cannot take a scale, but resizing is not scaling.
  const moving = await page.evaluate(async ({ t, layer }) => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const d = parseAnimData(t.js)!;
    d.steps[0].layers[layer] = { transform: [{ time: 0, value: 'translateX(0px)' }, { time: 1, value: 'translateX(40px)' }] };
    return { ...t, js: replaceRegionWithAnimData(t.js, d)! };
  }, { t, layer: t.box }) as Template;
  await editorWith(page, moving);
  await select(page, t.box);
  await drag(page, await edge(page, 1), 60, 0);
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  expect(near((await slot(page, wrapper))!.width, 400 + 60 / f, .5)).toBe(true);
});

// ---- Catalog lines, SVG text and the registry's refusals ----

test('catalog lines and SVG text take weight and spacing; alignment and fit stay with the design or the import', async ({ page }) => {
  await open(page);
  const hairline = await page.evaluate(async () => (await import('/src/templates/catalog.ts')).variantById('lt01')!.create({})) as unknown as Template;
  await editorWith(page, hairline);
  await select(page, '#f0');
  await expect(inspector(page).getByRole('combobox', { name: 'Alignment', exact: true })).toHaveCount(0);
  await expect(inspector(page).getByRole('combobox', { name: 'Long text', exact: true })).toHaveCount(0);
  await expect(inspector(page).getByTestId('artwork-type-reason')).toContainText('design');
  const original = await source(page);
  await choose(page, 'Weight', '800');
  await number(page, 'Line spacing', 1.3);
  await number(page, 'Letter spacing', 1);
  const styled = await source(page);
  expect(styled.js).toBe(original.js); expect(styled.html).toBe(original.html);
  const rule = ruleOf(styled.css, '#f0');
  expect(rule).toMatch(/font-weight:\s*800/); expect(rule).toMatch(/line-height:\s*1\.3/); expect(rule).toMatch(/letter-spacing:/);
  expect(await computed(page, '#f0', 'font-weight')).toBe('800');

  const svg = JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-svg.json', import.meta.url), 'utf8')) as Template;
  await editorWith(page, svg);
  await select(page, '#f0');
  for (const label of ['Alignment', 'Long text']) await expect(inspector(page).getByRole('combobox', { name: label, exact: true })).toHaveCount(0);
  await expect(inspector(page).getByRole('spinbutton', { name: 'Line spacing', exact: true })).toHaveCount(0);
  await expect(inspector(page).getByTestId('artwork-type-reason')).toContainText('fit');
  await choose(page, 'Weight', '700');
  await number(page, 'Letter spacing', 1.5);
  const svgStyled = await source(page);
  expect(ruleOf(svgStyled.css, '#f0')).toMatch(/font-weight:\s*700/);
  expect(ruleOf(svgStyled.css, '#f0')).toMatch(/letter-spacing:\s*1\.5px/);
  expect(await computed(page, '#f0', 'font-weight')).toBe('700');

  // The registry refuses what the inspector does not offer, leaving the source as it was.
  for (const [template, values, reason] of [
    [hairline, { align: 'center' }, /design/], [hairline, { fit: 'shrink' }, /design/],
    [svg, { align: 'center' }, /fit/], [svg, { fit: 'wrap' }, /fit/], [svg, { lineHeight: 1.2 }, /own element|line spacing/i],
  ] as const) expect((await operate(page, template, [{ kind: 'style.set', selector: '#f0', values }])).error, JSON.stringify(values)).toMatch(reason);
});

test('typed type survives save and reopen, and the simulator fits the long value as the editor does', async ({ page }) => {
  const t = await withText(page);
  await editorWith(page, t);
  await select(page, t.point);
  await setText(page, LONG);
  await choose(page, 'Weight', '700');
  await choose(page, 'Alignment', 'center');
  await choose(page, 'Long text', 'shrink');
  await number(page, 'Width', 800);
  await expect.poll(async () => (await rect(page, t.point)).width).toBeLessThanOrEqual(800.5);
  const edited = await source(page), size = await computed(page, t.point, 'font-size');
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Typography');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  // Saving names the graphic; everything it draws and runs is as it was.
  const reopened = await source(page);
  expect([reopened.html, reopened.css, reopened.js, reopened.fields]).toEqual([edited.html, edited.css, edited.js, edited.fields]);
  await select(page, t.point);
  await expect(inspector(page).getByRole('combobox', { name: 'Weight', exact: true })).toHaveValue('700');
  await expect(inspector(page).getByRole('combobox', { name: 'Alignment', exact: true })).toHaveValue('center');
  await expect(inspector(page).getByRole('combobox', { name: 'Long text', exact: true })).toHaveValue('shrink');
  await expect(inspector(page).getByRole('spinbutton', { name: 'Width', exact: true })).toHaveValue('800');

  const html = await page.evaluate(async t => (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true }), edited);
  const output = await page.context().newPage();
  await output.setViewportSize({ width: 1920, height: 1080 }); await output.setContent(html);
  await output.evaluate(async () => { await document.fonts.ready; window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-play', data: '{}' } })); await new Promise(r => setTimeout(r, 300)); });
  const simulated = await output.locator(t.point).evaluate(el => ({ width: el.getBoundingClientRect().width, size: getComputedStyle(el).fontSize, weight: getComputedStyle(el).fontWeight }));
  await output.close();
  // The output fits the value itself: inside the slot, smaller than the design size, never below
  // its floor. (The size it settles on follows the glyph widths that page measures.)
  expect(simulated.width).toBeLessThanOrEqual(800.5);
  expect(simulated.weight).toBe('700');
  expect(parseFloat(simulated.size)).toBeLessThan(48);
  expect(parseFloat(simulated.size)).toBeGreaterThanOrEqual(48 * .55 - .01);
  expect(parseFloat(size)).toBeLessThan(48);
});
