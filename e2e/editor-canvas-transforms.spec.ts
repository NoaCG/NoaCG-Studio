// covers: src/blocks/{baseEdits,editorAnimation,animEdit,animData,edit,designLayout,artworkEdits}.ts, src/components/editorFoundation/**
// covers: src/templates/**, src/model/structure.ts, src/preview/composeDocument.ts
//
// R1.2b.1 canvas transform tools (docs/research/editor-r1-2b-1): the rotation handle, edge scale
// handles and the anchor point (numeric X/Y, Center anchor and the Anchor tool). Every gesture
// writes what the numeric fields write, as one undo; the anchor is a static base value in CSS, and
// typing, Center anchor and the Anchor tool all move only the pivot, never Position (owner,
// 2026-10-01). scripts/canvas-transforms.test.mjs checks the gesture math and the operations
// densely in Node.

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';

type Key = { time: number; value: number | string; ease?: string };
type Step = { name: string; duration: number; ease: string; layers: Record<string, Record<string, Key[]>> };
type Data = { version: number; root: string; speed: number; steps: Step[] };
type Template = { js: string; html: string; css: string; fps: number; fields: { field: string }[] };
type Point = { x: number; y: number };
type Base = { x: number; y: number; scaleX: number; scaleY: number; rotation: number; mode: string; target: string; anchor?: { x: number; y: number } | null };

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
async function dataOf(page: Page, js: string): Promise<Data> { return page.evaluate(async js => (await import('/src/blocks/animData.ts')).parseAnimData(js), js) as Promise<Data>; }
async function data(page: Page) { return dataOf(page, (await source(page)).js); }
async function base(page: Page, selector: string): Promise<Base> {
  return page.evaluate(async selector => (await import('/src/blocks/baseEdits.ts')).baseValues((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template as never, selector), selector) as Promise<Base>;
}
async function editorWith(page: Page, t: Template) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await open(page);
  await evaluateInPage(page, async (t: unknown) => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t as never, { resetSampleData: true });
  }, t);
  await ready(page);
}
async function catalog(page: Page, id: string): Promise<Template> {
  return page.evaluate(async id => (await import('/src/templates/catalog.ts')).variantById(id)!.create({}), id) as unknown as Promise<Template>;
}
/** Hairline (a lower third) with a 300 x 120 rectangle (and, optionally, created
 *  text) drawn on it. Drawing coordinates are its root's, which sits low in the frame: negative y is up. */
async function withRectangle(page: Page, text = false): Promise<Template & { rect: string; text?: string }> {
  await open(page);
  return page.evaluate(async text => {
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    // Hairline, whatever the page last opened, so the drawing space is always the same.
    let template = (await import('/src/templates/catalog.ts')).variantById('lt01')!.create({}) as never as Parameters<typeof createArtwork>[0];
    const a = createArtwork(template, { shape: 'rectangle', x: 700, y: -560, width: 300, height: 120 }); template = a.template;
    if (!text) return { ...template, rect: a.selector };
    const b = createArtwork(template, { shape: 'text', x: 200, y: -620, width: 400, height: 80 });
    return { ...b.template, rect: a.selector, text: b.selector };
  }, text) as Promise<Template & { rect: string; text?: string }>;
}
async function seekFrames(page: Page, frames: number, fps: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(frames / fps)); await ready(page);
}
async function select(page: Page, selector: string) { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).first().click(); await ready(page); }
const undo = async (page: Page) => { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); };
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
/** The layer's rendered bounds in the preview, in composition pixels. */
async function bounds(page: Page, selector: string) {
  return (await preview(page)).locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
}
async function centre(page: Page, css: string): Promise<Point> {
  const b = (await page.locator(css).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}
const anchorPoint = (page: Page) => centre(page, '.ef-selection [data-anchor]');
const knob = (page: Page) => centre(page, '.ef-selection [data-rotate]');
const corner = (page: Page, i: number) => centre(page, `.ef-selection [data-handle="${i}"]`);
const edge = (page: Page, i: number) => centre(page, `.ef-selection [data-edge="${i}"]`);
/** Screen pixels per composition pixel. */
async function fit(page: Page) { return (await page.locator('.ef-artboard').boundingBox())!.width / 1920; }
async function press(page: Page, from: Point, moves: Point[], { shift = false, alt = false, escape = false } = {}) {
  // A handle under the timeline or off the canvas would press something else.
  expect(await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid=foundation-canvas]'), from), 'the press lands on the canvas').toBe(true);
  if (alt) await page.keyboard.down('Alt');
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  if (shift) await page.keyboard.down('Shift');
  for (const p of moves) await page.mouse.move(p.x, p.y);
  if (escape) await page.keyboard.press('Escape');
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
  if (alt) await page.keyboard.up('Alt');
}
/** A straight drag by (dx, dy) screen pixels in eight steps. */
const drag = (page: Page, from: Point, dx: number, dy: number, modifiers: { shift?: boolean; alt?: boolean; escape?: boolean } = {}) =>
  press(page, from, Array.from({ length: 8 }, (_, i) => ({ x: from.x + dx * (i + 1) / 8, y: from.y + dy * (i + 1) / 8 })), modifiers);
/** The rotation knob carried `degrees` round the anchor, clockwise on screen, in small steps. */
async function turn(page: Page, degrees: number, modifiers: { shift?: boolean; escape?: boolean } = {}) {
  const a = await anchorPoint(page), k = await knob(page);
  const r = Math.hypot(k.x - a.x, k.y - a.y), start = Math.atan2(k.y - a.y, k.x - a.x), steps = Math.max(6, Math.ceil(Math.abs(degrees) / 5));
  await press(page, k, Array.from({ length: steps }, (_, i) => {
    const angle = start + degrees * Math.PI / 180 * (i + 1) / steps;
    return { x: a.x + r * Math.cos(angle), y: a.y + r * Math.sin(angle) };
  }), modifiers);
}
async function field(page: Page, scope: string, label: string) { return page.locator(scope).getByRole('textbox', { name: label, exact: true }); }
async function type(page: Page, scope: string, label: string, value: number) {
  const input = await field(page, scope, label);
  await input.fill(String(value)); await input.press('Enter'); await ready(page);
}
const transform = '.ef-animation-properties', anchorSection = '.ef-anchor';
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance + 1e-9;
function expectSame(a: { x: number; y: number; width?: number; height?: number }, b: typeof a, tolerance: number, what: string) {
  for (const k of ['x', 'y', 'width', 'height'] as const) if (a[k] !== undefined) expect(near(a[k]!, b[k]!, tolerance), `${what} ${k}: ${a[k]} vs ${b[k]}`).toBe(true);
}
/** Every cue (its name, length, flags and reveals) and every track and bar of every layer but `except`,
 *  as JSON: what an edit must leave byte for byte. */
const untouched = (d: Data, except: string[]) => JSON.stringify(d.steps.map(s => ({ ...s, layers: Object.entries(s.layers).filter(([k]) => !except.includes(k)),
  spans: Object.entries((s as Step & { spans?: Record<string, unknown> }).spans ?? {}).filter(([k]) => !except.includes(k)) })));
/** An anchor edit writes the anchor and nothing else (owner, 2026-10-01): the script, the markup and
 *  the stylesheet apart from the anchor's declarations stay byte for byte, and so does every Position,
 *  Rotation and Scale value. */
const withoutAnchor = (css: string, target: string) => css.replace(new RegExp(target.replace(/[.#]/g, '\\$&') + '\\s*\\{[^}]*\\}', 'g'),
  rule => rule.replace(/[ \t]*(?:--base-anchor-[xy]|transform-origin)\s*:[^;}]*;?\n?/g, ''));
async function onlyAnchor(page: Page, before: Template, selector: string, placed: Base) {
  const after = await source(page), now = await base(page, selector);
  expect(after.js).toBe(before.js); expect(after.html).toBe(before.html);
  expect(after.css).not.toBe(before.css);
  // Only the base target's own rule may lose or gain these declarations.
  expect(withoutAnchor(after.css, placed.target)).toBe(withoutAnchor(before.css, placed.target));
  expect([now.x, now.y, now.rotation, now.scaleX, now.scaleY]).toEqual([placed.x, placed.y, placed.rotation, placed.scaleX, placed.scaleY]);
}
/** Where a layer turned by `degrees` (and not scaled) moves when only its pivot moves by `by`: (I - R) by. */
function turnShift(degrees: number, by: Point): Point {
  const r = degrees * Math.PI / 180;
  return { x: by.x - (Math.cos(r) * by.x - Math.sin(r) * by.y), y: by.y - (Math.sin(r) * by.x + Math.cos(r) * by.y) };
}
/** A Rotation typed after the anchor moved turns about the new point: the marker stays and every
 *  corner keeps its distance from it. The turn is undone. */
async function turnsAbout(page: Page) {
  const pivot = await anchorPoint(page), before = await Promise.all([0, 1, 2, 3].map(i => corner(page, i)));
  await type(page, transform, 'Rotation', Number(await (await field(page, transform, 'Rotation')).inputValue()) + 25);
  const after = await anchorPoint(page), distance = (p: Point) => Math.hypot(p.x - pivot.x, p.y - pivot.y);
  expect(near(after.x, pivot.x, .6) && near(after.y, pivot.y, .6), `pivot ${JSON.stringify(after)} vs ${JSON.stringify(pivot)}`).toBe(true);
  for (let i = 0; i < 4; i++) {
    const turned = await corner(page, i);
    expect(near(distance(turned), distance(before[i]), .8), `corner ${i}: ${distance(turned)} vs ${distance(before[i])}`).toBe(true);
    expect(Math.hypot(turned.x - before[i].x, turned.y - before[i].y), `corner ${i} turned`).toBeGreaterThan(1);
  }
  await undo(page);
}
const operate = (page: Page, t: Template, operations: unknown[]) => page.evaluate(async ({ t, operations }) => {
  try { return { template: (await import('/src/components/editorFoundation/operations.ts')).applyOperations(t as never, operations as never).template as never as Template }; }
  catch (error) { return { error: String((error as Error).message ?? error) }; }
}, { t, operations }) as Promise<{ template?: Template; error?: string }>;

// ---- Rotation handle ----

test('rotation handle: a created rectangle turns about its anchor, agrees with the field, snaps with Shift and keeps 720', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const t = await withRectangle(page);
  await editorWith(page, t);
  await select(page, t.rect);
  const original = await source(page), steps = await history(page), before = await bounds(page, t.rect);
  // The handle and the marker: the anchor is the box centre by default.
  const a = await anchorPoint(page);
  expect(near(a.x, (await corner(page, 0)).x / 2 + (await corner(page, 2)).x / 2, .6)).toBe(true);
  expect((await knob(page)).y).toBeLessThan((await corner(page, 0)).y);

  // Escape cancels a turn.
  await turn(page, 60, { escape: true }); await ready(page);
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);

  // A quarter turn: base Rotation 90, one undo, the box turned about its centre.
  await turn(page, 90); await ready(page);
  const quarter = await base(page, t.rect);
  expect(near(quarter.rotation, 90, .5), String(quarter.rotation)).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  expect((await source(page)).js).toBe(original.js);
  const turned = await bounds(page, t.rect);
  expect(near(turned.width, before.height, 1)).toBe(true);
  expect(near(turned.x + turned.width / 2, before.x + before.width / 2, .5)).toBe(true);
  expect(near(turned.y + turned.height / 2, before.y + before.height / 2, .5)).toBe(true);
  expect(near(Number(await (await field(page, transform, 'Rotation')).inputValue()), quarter.rotation, .001)).toBe(true);
  // Typing the same value writes the same source.
  const dragged = await source(page);
  await undo(page); expect(await source(page)).toEqual(original);
  await type(page, transform, 'Rotation', quarter.rotation);
  expect((await source(page)).css).toBe(dragged.css);
  await undo(page);

  // Shift lands on a multiple of 15.
  await turn(page, 37, { shift: true }); await ready(page);
  const snapped = (await base(page, t.rect)).rotation;
  expect(snapped % 15, String(snapped)).toBe(0);
  expect(snapped).toBeGreaterThan(0);
  await undo(page);

  // A Shift turn brought back to where it began writes nothing, and the preview shows the source again.
  const k0 = await knob(page), a0 = await anchorPoint(page), r0 = Math.hypot(k0.x - a0.x, k0.y - a0.y), s0 = Math.atan2(k0.y - a0.y, k0.x - a0.x);
  const round = (deg: number) => ({ x: a0.x + r0 * Math.cos(s0 + deg * Math.PI / 180), y: a0.y + r0 * Math.sin(s0 + deg * Math.PI / 180) });
  await press(page, k0, [5, 10, 15, 20, 15, 10, 5, 3].map(round), { shift: true }); await ready(page);
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
  expectSame(await bounds(page, t.rect), before, .5, 'snapped back');

  // Two full turns are 720, not 0, and save and reopen as 720.
  await turn(page, 720, { shift: true }); await ready(page);
  expect((await base(page, t.rect)).rotation).toBe(720);
  expect(Number(await (await field(page, transform, 'Rotation')).inputValue())).toBe(720);
  expectSame(await bounds(page, t.rect), before, .5, 'two turns');
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Rotation handle');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await base(page, t.rect)).rotation).toBe(720);
  expect(errors).toEqual([]);
});

test('rotation handle keys an animated Rotation at the playhead; a raw transform track refuses it', async ({ page }) => {
  await open(page);
  const t = await page.evaluate(async () => {
    const { createArtwork } = await import('/src/blocks/baseEdits.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    let template = (await import('/src/templates/catalog.ts')).variantById('lt01')!.create({}) as never as Parameters<typeof createArtwork>[0];
    const root = parseAnimData(template.js)!.root, made: string[] = [];
    for (let i = 0; i < 2; i++) { const next = createArtwork(template, { shape: 'rectangle', x: 300 + i * 500, y: -560, width: 240, height: 100 }); template = next.template; made.push(next.selector); }
    const layers = {
      [made[0]]: { rotation: [{ time: 0, value: 0 }, { time: 1, value: 40 }], x: [{ time: 0, value: 0 }, { time: 1, value: 30 }] },
      [made[1]]: { transform: [{ time: 0, value: 'translateX(0px)' }, { time: 1, value: 'translateX(80px)' }] },
    };
    return { ...template, fps: 25, js: replaceRegionWithAnimData(template.js, { version: 2, root, speed: 1, steps: [{ name: 'In', duration: 2, ease: 'none', layers }, { name: 'Out', duration: 1, ease: 'none', layers: {} }] })!, made };
  }) as Template & { made: string[] };
  const [keyed, raw] = t.made;
  await editorWith(page, t);
  await seekFrames(page, 10, 25);
  await select(page, keyed);
  const original = await source(page), before = await dataOf(page, original.js), steps = await history(page);
  await turn(page, 30); await ready(page);
  const after = await data(page), track = after.steps[0].layers[keyed].rotation;
  expect(track.map(k => k.time)).toEqual([0, .4, 1]);
  expect(near(Number(track[1].value), 16 + 30, .6), String(track[1].value)).toBe(true);
  expect([track[0], track[2]]).toEqual(before.steps[0].layers[keyed].rotation);
  expect(after.steps[0].layers[keyed].x).toEqual(before.steps[0].layers[keyed].x);
  expect(untouched(after, [keyed])).toBe(untouched(before, [keyed]));
  expect((await source(page)).css).toBe(original.css);
  expect(await history(page)).toBe(steps + 1);
  await undo(page); expect(await source(page)).toEqual(original);
  // A raw transform string would replace a base rotation: the press itself refuses, before any move.
  await select(page, raw);
  const k = await knob(page);
  await page.mouse.move(k.x, k.y); await page.mouse.down();
  await expect(page.locator('.ef-stage-error')).toContainText('raw transform');
  await page.mouse.move(k.x + 30, k.y + 30, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
});

// ---- Edge handles ----

test('unlinked edge handles scale one axis about the opposite side, Shift both, Alt about the anchor; a rotated layer scales along its own sides', async ({ page }) => {
  const t = await withRectangle(page);
  await editorWith(page, t);
  await select(page, t.rect);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  const original = await source(page), steps = await history(page), before = await bounds(page, t.rect), f = await fit(page);
  await expect(page.locator('.ef-selection [data-edge]')).toHaveCount(4);

  // Right side: X only, the left side stays.
  await drag(page, await edge(page, 1), 60, 0); await ready(page);
  let b = await base(page, t.rect), r = await bounds(page, t.rect);
  expect(near(b.scaleX, 1 + 60 / f / 300, .01), String(b.scaleX)).toBe(true);
  expect(b.scaleY).toBe(1);
  expect(near(r.x, before.x, .5)).toBe(true); expect(near(r.height, before.height, .5)).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  await undo(page); expect(await source(page)).toEqual(original);

  // Bottom: Y only, the top stays. Escape first cancels one.
  await drag(page, await edge(page, 2), 0, 30, { escape: true }); await ready(page);
  expect(await source(page)).toEqual(original);
  await drag(page, await edge(page, 2), 0, 30); await ready(page);
  b = await base(page, t.rect); r = await bounds(page, t.rect);
  expect(b.scaleX).toBe(1); expect(near(b.scaleY, 1 + 30 / f / 120, .01)).toBe(true);
  expect(near(r.y, before.y, .5)).toBe(true); expect(near(r.width, before.width, .5)).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  await undo(page);

  // Shift: both axes by the side's ratio.
  await drag(page, await edge(page, 1), 60, 0, { shift: true }); await ready(page);
  b = await base(page, t.rect);
  expect(near(b.scaleX, b.scaleY, 1e-6)).toBe(true); expect(b.scaleX).toBeGreaterThan(1.05);
  expect(await history(page)).toBe(steps + 1);
  await undo(page);

  // Alt: about the anchor (the centre), which is what typing that Scale X writes.
  await drag(page, await edge(page, 1), 60, 0, { alt: true }); await ready(page);
  const alt = await source(page); b = await base(page, t.rect); r = await bounds(page, t.rect);
  expect(near(r.x + r.width / 2, before.x + before.width / 2, .5)).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  await undo(page);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await type(page, transform, 'Scale X %', b.scaleX * 100);
  expect((await source(page)).css).toBe(alt.css);
  await undo(page); await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();

  // Rotated 30 degrees, the right handle still scales the layer's own X and its left side stays.
  await type(page, transform, 'Rotation', 30);
  const left = [await corner(page, 0), await corner(page, 3)];
  const angle = Math.PI / 6;
  await drag(page, await edge(page, 1), 50 * Math.cos(angle), 50 * Math.sin(angle)); await ready(page);
  b = await base(page, t.rect);
  expect(near(b.scaleX, 1 + 50 / f / 300, .01), String(b.scaleX)).toBe(true);
  expect(near(b.scaleY, 1, 1e-6)).toBe(true);
  expect(near((await corner(page, 0)).x, left[0].x, .6)).toBe(true); expect(near((await corner(page, 0)).y, left[0].y, .6)).toBe(true);
  expect(near((await corner(page, 3)).x, left[1].x, .6)).toBe(true); expect(near((await corner(page, 3)).y, left[1].y, .6)).toBe(true);

  // Thin and turned, its centre still moves it: the side handles' reach is measured on its own sides,
  // not on its turned bounds, which are far taller than the 8 px layer.
  await undo(page);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await type(page, transform, 'Scale Y %', 6.667);
  const thin = await base(page, t.rect), count = await history(page);
  await drag(page, await anchorPoint(page), 30, 20); await ready(page);
  const shifted = await base(page, t.rect);
  expect([shifted.scaleX, shifted.scaleY]).toEqual([thin.scaleX, thin.scaleY]);
  expect(Math.hypot(shifted.x - thin.x, shifted.y - thin.y)).toBeGreaterThan(10);
  expect(await history(page)).toBe(count + 1);
});

test('catalog edges: the accent keys scaleX from its side and refuses its top; Frosted Panel keys scale with Shift and refuses one axis', async ({ page }) => {
  await open(page);
  const steps = await catalog(page, 'card26');
  await editorWith(page, steps);
  await seekFrames(page, Math.round(.3 * steps.fps), steps.fps);
  await select(page, '.info-card-accent');
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  let original = await source(page), count = await history(page);
  const accent = (await dataOf(page, original.js)).steps[0].layers['.info-card-accent'].scaleX;
  await drag(page, await edge(page, 1), 4, 0); await ready(page);
  const keyed = (await data(page)).steps[0].layers['.info-card-accent'].scaleX;
  expect(keyed.length).toBe(accent.length + 1);
  expect(keyed.some(k => near(k.time, Math.round(.3 * steps.fps) / steps.fps, 1e-3))).toBe(true);
  expect(await history(page)).toBe(count + 1);
  await undo(page); expect(await source(page)).toEqual(original);
  await drag(page, await edge(page, 0), 0, -20); await ready(page);
  await expect(page.locator('.ef-stage-error')).toContainText('Scale is animated');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(count);

  const frosted = await catalog(page, 'card03');
  await editorWith(page, frosted);
  const frames = Math.round(.28 * frosted.fps), time = frames / frosted.fps;
  await seekFrames(page, frames, frosted.fps);
  await select(page, '.info-card-box');
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  original = await source(page); count = await history(page);
  await drag(page, await edge(page, 1), 30, 0); await ready(page);
  await expect(page.locator('.ef-stage-error')).toContainText('share one');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(count);
  await drag(page, await edge(page, 1), 30, 0, { shift: true }); await ready(page);
  const box = (await data(page)).steps[0].layers['.info-card-box'];
  expect(box.scaleX).toBeUndefined();
  expect(box.scale.some(k => near(k.time, time, 1e-3))).toBe(true);
  expect(await history(page)).toBe(count + 1);
  // Linking the side uses the same shared Scale channel; Shift now requests the refused single axis.
  const linked = await source(page); await undo(page);
  await page.getByRole('checkbox', { name: 'Link proportions' }).check();
  await drag(page, await edge(page, 1), 30, 0); await ready(page);
  expect(await source(page)).toEqual(linked); expect(await history(page)).toBe(count + 1);
  await undo(page);
  await drag(page, await edge(page, 1), 30, 0, { shift: true }); await ready(page);
  await expect(page.locator('.ef-stage-error')).toContainText('share one');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(count);
});

// ---- Anchor point ----

test('anchor point: numeric X/Y, Center anchor and the Anchor tool on a rotated, scaled rectangle', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const t = await withRectangle(page);
  await editorWith(page, t);
  await select(page, t.rect);
  // The rendered default: the box centre, in layer pixels.
  expect(Number(await (await field(page, anchorSection, 'Anchor X')).inputValue())).toBeCloseTo(150, 3);
  expect(Number(await (await field(page, anchorSection, 'Anchor Y')).inputValue())).toBeCloseTo(60, 3);
  const original = await source(page), before = await bounds(page, t.rect);

  // A numeric anchor on an unrotated layer moves nothing; CSS only, one undo.
  let steps = await history(page);
  await type(page, anchorSection, 'Anchor X', 0); await type(page, anchorSection, 'Anchor Y', 0);
  const anchored = await source(page);
  expect(anchored.js).toBe(original.js); expect(anchored.html).toBe(original.html);
  expect(anchored.css).toMatch(/--base-anchor-x:\s*0px/); expect(anchored.css).toMatch(/transform-origin:\s*var\(--base-anchor-x\) var\(--base-anchor-y\)/);
  expect(await history(page)).toBe(steps + 2);
  expectSame(await bounds(page, t.rect), before, .5, 'unrotated');
  expect(near((await anchorPoint(page)).x, (await corner(page, 0)).x, .6)).toBe(true);
  expect(near((await anchorPoint(page)).y, (await corner(page, 0)).y, .6)).toBe(true);

  // Rotated and scaled about the top-left corner: the corner stays where it was.
  const topLeft = await corner(page, 0);
  await type(page, transform, 'Rotation', 30);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await type(page, transform, 'Scale X %', 150); await type(page, transform, 'Scale Y %', 80);
  expect(near((await corner(page, 0)).x, topLeft.x, .6)).toBe(true);
  expect(near((await corner(page, 0)).y, topLeft.y, .6)).toBe(true);

  // Center anchor moves only the pivot (owner, 2026-10-01): the anchor alone in one undo, every
  // Position value as it was, so the turned, scaled rectangle now turns about its centre and moves.
  const posed = await bounds(page, t.rect), turned = await source(page), turnedBase = await base(page, t.rect);
  steps = await history(page);
  await page.getByRole('button', { name: 'Center anchor', exact: true }).click(); await ready(page);
  expect(await history(page)).toBe(steps + 1);
  await onlyAnchor(page, turned, t.rect, turnedBase);
  expect(Number(await (await field(page, anchorSection, 'Anchor X')).inputValue())).toBeCloseTo(150, 2);
  expect(Number(await (await field(page, anchorSection, 'Anchor Y')).inputValue())).toBeCloseTo(60, 2);
  const shifted = await bounds(page, t.rect);
  expect(Math.hypot(shifted.x - posed.x, shifted.y - posed.y), 'the pose moves about the new pivot').toBeGreaterThan(5);
  const corners = [await corner(page, 0), await corner(page, 2)], marker = await anchorPoint(page);
  expect(near(marker.x, (corners[0].x + corners[1].x) / 2, .6)).toBe(true);
  expect(near(marker.y, (corners[0].y + corners[1].y) / 2, .6)).toBe(true);
  await turnsAbout(page);

  // The Anchor tool: the marker follows the pointer and only the anchor changes, in one undo; Escape cancels.
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const centred = await source(page), placed = await base(page, t.rect);
  steps = await history(page);
  await drag(page, marker, 40, -25, { escape: true }); await ready(page);
  expect(await source(page)).toEqual(centred); expect(await history(page)).toBe(steps);
  await drag(page, marker, 40, -25); await ready(page);
  expect(await history(page)).toBe(steps + 1);
  const moved = await anchorPoint(page);
  expect(near(moved.x, marker.x + 40, .6), `marker x ${moved.x} vs ${marker.x + 40}`).toBe(true);
  expect(near(moved.y, marker.y - 25, .6), `marker y ${moved.y} vs ${marker.y - 25}`).toBe(true);
  await onlyAnchor(page, centred, t.rect, placed);
  expect((await base(page, t.rect)).anchor!.x).not.toBeCloseTo(150, 1);
  const dragged = await bounds(page, t.rect);
  expect(Math.hypot(dragged.x - shifted.x, dragged.y - shifted.y), 'the pose moves about the dragged pivot').toBeGreaterThan(1);
  // The corner handles show on Select.
  await page.getByRole('button', { name: 'select tool', exact: true }).click();
  await turnsAbout(page);
  await undo(page); expect(await source(page)).toEqual(centred);

  // The simulator renders the same box as the editor.
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page);
  const editor = await bounds(page, t.rect), redone = await source(page);
  const html = await page.evaluate(async t => (await import('/src/preview/composeDocument.ts')).composeDocument(t as never, { simulate: true }), redone);
  const output = await page.context().newPage();
  await output.setViewportSize({ width: 1920, height: 1080 }); await output.setContent(html);
  // Play, then settle every timeline at its end: the rectangle has no motion of its own.
  await output.evaluate(async () => {
    window.dispatchEvent(new MessageEvent('message', { source: window, data: { type: 'spx-preview-cmd', cmd: 'sim-play', data: '{}' } }));
    await new Promise(r => setTimeout(r, 50));
    const gsap = (window as unknown as { gsap: { globalTimeline: { getChildren(n: boolean, tw: boolean, tl: boolean): { progress(p: number, s?: boolean): void }[] } } }).gsap;
    for (const tl of gsap.globalTimeline.getChildren(false, true, true)) tl.progress(1, true);
  });
  const simulated = await output.locator(t.rect).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  await output.close();
  expectSame(simulated, editor, .5, 'simulator');
  // Saved and reopened, the anchor is still there and still the pivot.
  const kept = await base(page, t.rect);
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Anchor point');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await source(page)).css).toBe(redone.css);
  expect((await base(page, t.rect)).anchor).toEqual(kept.anchor);
  expectSame(await bounds(page, t.rect), editor, .5, 'reopened');
  expect(errors).toEqual([]);
});

test('anchor on animated and placed layers: Frosted Panel moves only its pivot at the playhead; created text anchors its box; refusals', async ({ page }) => {
  // Frosted Panel at 0.28 s: scale and y keyed, x not. The Anchor tool writes the anchor alone: no key,
  // every track and Position value byte-identical, and the marker under the pointer.
  await open(page);
  const frosted = await catalog(page, 'card03');
  await editorWith(page, frosted);
  await seekFrames(page, Math.round(.28 * frosted.fps), frosted.fps);
  await select(page, '.info-card-box');
  let original = await source(page), steps = await history(page);
  const placed = await base(page, '.info-card-box'), from = await anchorPoint(page);
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  await drag(page, from, -80, 30); await ready(page);
  await onlyAnchor(page, original, '.info-card-box', placed);
  expect(await history(page)).toBe(steps + 1);
  const to = await anchorPoint(page);
  expect(near(to.x, from.x - 80, .6) && near(to.y, from.y + 30, .6), `marker ${JSON.stringify(to)} vs ${JSON.stringify(from)}`).toBe(true);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();

  // Created text: the anchor is its box's (the wrapper's), and the box turns about it.
  const t = await withRectangle(page, true);
  await editorWith(page, t);
  await select(page, t.text!);
  const wrapper = (await base(page, t.text!)).target;
  expect(wrapper).not.toBe(t.text);
  original = await source(page);
  await type(page, anchorSection, 'Anchor X', 0); await type(page, anchorSection, 'Anchor Y', 0);
  expect((await source(page)).css).toMatch(new RegExp(wrapper + '\\s*\\{[^}]*transform-origin'));
  const topLeft = await corner(page, 0);
  await turn(page, 45); await ready(page);
  expect(near((await base(page, t.text!)).rotation, 45, .5)).toBe(true);
  expect(near((await corner(page, 0)).x, topLeft.x, .6)).toBe(true); expect(near((await corner(page, 0)).y, topLeft.y, .6)).toBe(true);
  // A Rotation key on placed text with its own anchor would turn the text about another point.
  steps = await history(page); const anchoredText = await source(page);
  await page.getByRole('button', { name: 'Enable Rotation animation', exact: true }).click(); await ready(page);
  await expect(page.locator(transform + ' [role=alert]').first()).toContainText('anchor');
  expect(await source(page)).toEqual(anchoredText); expect(await history(page)).toBe(steps);

  // Refusals through the registry, each leaving the source as it was.
  const refuse = async (template: Template, selector: string, pattern: RegExp) => {
    const result = await operate(page, template, [{ kind: 'base.set', selector, values: { anchorX: 5, anchorY: 5 } }]);
    expect(result.error, selector).toMatch(pattern);
  };
  // Placed text whose text animates Rotation.
  const spinning = await operate(page, original, [{ kind: 'animation.key', selector: t.text, step: 0, property: 'rotation', time: 0, value: 10, action: 'set' }]);
  await refuse(spinning.template!, t.text!, /about the text's own centre/);
  // Another rule owns transform-origin; the graphic's own script sets it.
  await refuse({ ...original, css: original.css + `\nbody ${t.rect} { transform-origin: 0 0; }\n` }, t.rect, /another rule/);
  await refuse({ ...original, js: original.js + `\ngsap.set('${t.rect}', { transformOrigin: '0 0' });\n` }, t.rect, /transformOrigin/);
  expect((await operate(page, original, [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
  expect((await operate(page, original, [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5 } }])).error).toMatch(/both anchor/);
  // A rule inside @media, a later rule of its own selector, a second declaration in its own rule (here
  // the -webkit- alias), the inline style, and a transform-box measuring from another box.
  await refuse({ ...original, css: original.css + `\n@media (min-width: 1px) { ${t.rect} { transform-origin: 0 0; } }\n` }, t.rect, /another rule/);
  await refuse({ ...original, css: original.css + `\n${t.rect} { transform-origin: 0 0; }\n` }, t.rect, /another rule/);
  const ownRule = (extra: string) => ({ ...original, css: original.css.replace(/(#rectangle-1 \{[^}]*background: #8bd5f6;)/, '$1\n  ' + extra) });
  expect(ownRule('x').css).not.toBe(original.css);
  await refuse(ownRule('transform-origin: left top;\n  -webkit-transform-origin: left top;'), t.rect, /more than once/);
  await refuse({ ...original, html: original.html.replace(`id="${t.rect.slice(1)}"`, `id="${t.rect.slice(1)}" style="transform-origin: 0 0"`) }, t.rect, /inline style/);
  await refuse(ownRule('transform-box: content-box;'), t.rect, /another box/);
  expect((await operate(page, ownRule('transform-box: border-box;'), [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
  // The data or a script setting this layer's transformOrigin refuses; another layer's does not.
  const withOrigin = (layer: string) => page.evaluate(async ({ t, layer }) => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const d = parseAnimData(t.js)!;
    d.steps[0].layers[layer] = { ...d.steps[0].layers[layer], transformOrigin: [{ time: 0, value: '0px 0px' }] };
    return { ...t, js: replaceRegionWithAnimData(t.js, d)! };
  }, { t: original, layer }) as Promise<Template>;
  await refuse(await withOrigin(t.rect), t.rect, /transformOrigin/);
  expect((await operate(page, await withOrigin(t.text!), [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
  expect((await operate(page, { ...original, js: original.js + `\ngsap.set('.someone-else', { transformOrigin: '0 0' });\n` }, [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
  // Placed text whose text animates a raw transform: its box's base rotation is the box's own and holds.
  const rawText = await page.evaluate(async ({ t, layer }) => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const d = parseAnimData(t.js)!;
    d.steps[0].layers[layer] = { transform: [{ time: 0, value: 'translateX(0px)' }, { time: 1, value: 'translateX(40px)' }] };
    return { ...t, js: replaceRegionWithAnimData(t.js, d)! };
  }, { t: original, layer: t.text! }) as Template;
  expect((await operate(page, rawText, [{ kind: 'base.set', selector: t.text, values: { rotation: 12 } }])).error).toBeUndefined();
  // An SVG element.
  const svg = JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-svg.json', import.meta.url), 'utf8')) as Template;
  await refuse(svg, '#f0', /SVG/);
  // An imported design's text-fit script sets transformOrigin on placed text only: a rectangle drawn on
  // it takes an anchor.
  const drawn = await page.evaluate(async svg => (await import('/src/blocks/baseEdits.ts')).createArtwork(svg as never, { shape: 'rectangle', x: 40, y: -300, width: 120, height: 60 }), svg) as unknown as { template: Template; selector: string };
  expect((await operate(page, drawn.template, [{ kind: 'base.set', selector: drawn.selector, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
});

test('a layer’s own CSS transform: a side handle scales outside it about the opposite side, and the Anchor tool moves only its pivot', async ({ page }) => {
  const t = await withRectangle(page);
  // A rotation of the rectangle's own CSS, inside the base scale the editor writes (CSS applies
  // rotate, then scale, then transform). Its base Rotation still reads 0.
  await editorWith(page, { ...t, css: t.css.replace(/(#rectangle-1 \{[^}]*background: #8bd5f6;)/, '$1\n  transform: rotate(30deg);') });
  await select(page, t.rect);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  const own = await bounds(page, t.rect), pivot = await edge(page, 3), f = await fit(page), count = await history(page);
  // A base scale acts along the parent's X, so the side handle measures there, about the opposite side.
  await drag(page, await edge(page, 1), 50, 0); await ready(page);
  const b = await base(page, t.rect);
  expect(near(b.scaleX, 1 + 50 / f / (300 * Math.cos(Math.PI / 6)), .01), String(b.scaleX)).toBe(true);
  expect(b.scaleY).toBe(1);
  const kept = await edge(page, 3);
  expect(near(kept.x, pivot.x, .6) && near(kept.y, pivot.y, .6), `pivot ${JSON.stringify(kept)} vs ${JSON.stringify(pivot)}`).toBe(true);
  expect(await history(page)).toBe(count + 1);
  await undo(page);
  // The Anchor tool maps the pointer through the parent, not the layer's turned frame, so the marker
  // follows it; Position stays, and the layer's own CSS rotation now turns about the new point.
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const unturned = await source(page), placed = await base(page, t.rect), from = await anchorPoint(page);
  await drag(page, from, 0, 40); await ready(page);
  const to = await anchorPoint(page);
  expect(near(to.x, from.x, .6) && near(to.y, from.y + 40, .6), `marker ${JSON.stringify(to)} vs ${JSON.stringify(from)}`).toBe(true);
  await onlyAnchor(page, unturned, t.rect, placed);
  const moved = await bounds(page, t.rect), expected = turnShift(30, { x: 0, y: 40 / f });
  expectSame({ x: moved.x - own.x, y: moved.y - own.y }, expected, .5, 'turned by its own CSS about the new pivot');
  expect(await history(page)).toBe(count + 1);
  await page.getByRole('button', { name: 'select tool', exact: true }).click();

  // Keyed, the scale is GSAP's, inside the turn its parse folds in: the side scales the layer's own
  // X along its turned side, and the opposite side's midpoint stays.
  const keyed = await page.evaluate(async t => {
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { replaceRegionWithAnimData } = await import('/src/templates/shared/animRuntime.ts');
    const d = parseAnimData(t.js)!, one = [{ time: 0, value: 1 }, { time: 1, value: 1 }];
    d.speed = 1; d.steps = [{ name: 'In', duration: 2, ease: 'none', layers: { [t.rect]: { scaleX: one, scaleY: one } } }, { name: 'Out', duration: 1, ease: 'none', layers: {} }];
    return { ...t, fps: 25, css: t.css.replace(/(#rectangle-1 \{[^}]*background: #8bd5f6;)/, '$1\n  transform: rotate(30deg);'), js: replaceRegionWithAnimData(t.js, d)! };
  }, t) as Template & { rect: string };
  await editorWith(page, keyed);
  await seekFrames(page, 12, 25);
  await select(page, t.rect);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  const opposite = await edge(page, 3), angle = Math.PI / 6;
  await drag(page, await edge(page, 1), 50 * Math.cos(angle), 50 * Math.sin(angle)); await ready(page);
  const scaled = (await data(page)).steps[0].layers[t.rect].scaleX;
  expect(scaled.map(k => k.time)).toEqual([0, .48, 1]);
  expect(near(Number(scaled[1].value), 1 + 50 / f / 300, .01), String(scaled[1].value)).toBe(true);
  const stays = await edge(page, 3);
  expect(near(stays.x, opposite.x, .6) && near(stays.y, opposite.y, .6), `pivot ${JSON.stringify(stays)} vs ${JSON.stringify(opposite)}`).toBe(true);
});

test('the Anchor tool inside a turned, scaled parent maps the pointer through it: the crosshair stays under the pointer and only the anchor changes', async ({ page }) => {
  const t = await withRectangle(page);
  // The rectangle moves into a wrapper turned 20 degrees and scaled 1.25 about its top-left, placed
  // where the rectangle was. The rectangle itself is unturned, so its own frame is the parent's here.
  const html = t.html.replace(`<div id="${t.rect.slice(1)}" data-gfx></div>`,
    `<div id="turned-parent" style="position: absolute; left: 700px; top: -560px; transform: rotate(20deg) scale(1.25); transform-origin: 0 0"><div id="${t.rect.slice(1)}" data-gfx></div></div>`);
  expect(html).not.toBe(t.html);
  const placed = await operate(page, { ...t, html }, [{ kind: 'base.set', selector: t.rect, values: { x: 0, y: 0 } }]);
  await editorWith(page, placed.template!);
  await select(page, t.rect);
  const original = await source(page), before = await base(page, t.rect), count = await history(page), f = await fit(page);
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const from = await anchorPoint(page);
  await drag(page, from, 30, 24); await ready(page);
  const to = await anchorPoint(page);
  expect(near(to.x, from.x + 30, .6) && near(to.y, from.y + 24, .6), `marker ${JSON.stringify(to)} vs ${JSON.stringify(from)}`).toBe(true);
  await onlyAnchor(page, original, t.rect, before);
  expect(await history(page)).toBe(count + 1);
  // The anchor moved by the pointer's change in the parent's own pixels: turned back 20 degrees and
  // divided by its 1.25 scale, from the rendered default at the box centre.
  const anchor = (await base(page, t.rect)).anchor!, r = -20 * Math.PI / 180;
  const local = { x: (Math.cos(r) * 30 - Math.sin(r) * 24) / f / 1.25, y: (Math.sin(r) * 30 + Math.cos(r) * 24) / f / 1.25 };
  expect(near(anchor.x, 150 + local.x, .5) && near(anchor.y, 60 + local.y, .5), `anchor ${JSON.stringify(anchor)} vs ${JSON.stringify(local)}`).toBe(true);
});

test('Clean Steps: a turned row\'s anchor moves only its pivot, so its whole reveal turns about it; on a Step flag Center anchor writes it too', async ({ page }) => {
  await open(page);
  const steps = await catalog(page, 'card26');
  await editorWith(page, steps);
  const d0 = await data(page), frame = (time: number) => Math.round(time / d0.speed * steps.fps);
  await seekFrames(page, frame(.8), steps.fps);
  await select(page, '#f0');
  await type(page, transform, 'Layout offset X', 0.5); await undo(page);
  // A base rotation: nothing animates the row's rotation or scale, so its own transform never changes.
  await type(page, transform, 'Rotation', 10);
  const turned = await source(page), placed = await base(page, '#f0'), count = await history(page), atReveal = await bounds(page, '#f0');
  await seekFrames(page, frame(1.6), steps.fps);
  const settled = await bounds(page, '#f0');
  await seekFrames(page, frame(.8), steps.fps);
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const from = await anchorPoint(page), f = await fit(page);
  await drag(page, from, -60, 10); await ready(page);
  expect(await history(page)).toBe(count + 1);
  const to = await anchorPoint(page);
  expect(near(to.x, from.x - 60, .6) && near(to.y, from.y + 10, .6), `marker ${JSON.stringify(to)} vs ${JSON.stringify(from)}`).toBe(true);
  await onlyAnchor(page, turned, '#f0', placed);
  // Its 10 degrees now turn about the new point, which moves the whole reveal by one vector.
  const shift = turnShift(10, { x: -60 / f, y: 10 / f }), atPlayhead = await bounds(page, '#f0');
  expectSame({ x: atPlayhead.x - atReveal.x, y: atPlayhead.y - atReveal.y }, shift, .5, 'at the playhead');
  await seekFrames(page, frame(1.6), steps.fps);
  const later = await bounds(page, '#f0');
  expectSame({ x: later.x - settled.x, y: later.y - settled.y }, shift, .5, 'later in the reveal');
  await page.getByRole('button', { name: 'select tool', exact: true }).click();

  // On the Step 2 flag, #f1's bar starts there, so an edit lands on Step 2's start. The anchor is the
  // same on every cue, so Center anchor writes it there too: the anchor alone, in one undo.
  const flag = Math.round(d0.steps[0].duration / d0.speed * steps.fps);
  await seekFrames(page, flag, steps.fps);
  await select(page, '#f1');
  const before = await source(page), at = await history(page), row = await base(page, '#f1');
  await page.getByRole('button', { name: 'Center anchor', exact: true }).click(); await ready(page);
  await expect(page.locator(anchorSection + ' [role=alert]')).toHaveCount(0);
  expect(await history(page)).toBe(at + 1);
  const centred = await source(page), centredRow = await base(page, '#f1');
  expect(centred.js).toBe(before.js); expect(centred.html).toBe(before.html);
  expect([centredRow.x, centredRow.y, centredRow.rotation, centredRow.scaleX, centredRow.scaleY]).toEqual([row.x, row.y, row.rotation, row.scaleX, row.scaleY]);
  expect(centredRow.anchor).not.toBeNull();
});

test('nested SVG: the rotation and edge handles write what the fields write; its anchor refuses beside the control', async ({ page }) => {
  await open(page);
  const svg = JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-svg.json', import.meta.url), 'utf8')) as Template;
  // The text has a transform attribute of its own, inside the CSS rotate and scale the editor writes.
  svg.html = svg.html.replace(/(<text\b[^>]*id="f0"[\s\S]*?<\/text>)/, '<g id="test-parent" transform="translate(100,80) rotate(30) scale(2)">$1</g>').replace(/(<text\b[^>]*?)id="f0"/, '$1id="f0" transform="translate(-20 -40)"');
  expect(svg.html).toMatch(/<text\b[^>]*id="f0" transform="translate\(-20 -40\)"/);
  await editorWith(page, svg);
  await select(page, '#f0');
  // Fault injection held the undo's Archivo reload while the next drag loaded it normally:
  // the old whole-stylesheet replacement failed the opposite-corner assertion below by 16px.
  // Transform edits must keep the loaded face, so fallback metrics cannot replace its bounds.
  const archivo = await (await preview(page)).evaluateHandle(() => Array.from(document.fonts).find(face => face.family === 'Archivo'));
  expect(await archivo.evaluate(face => face?.status)).toBe('loaded');
  const original = await source(page), steps = await history(page);
  await turn(page, 25); await ready(page);
  const turned = await source(page), rotation = (await base(page, '#f0')).rotation;
  expect(near(rotation, 25, .6), String(rotation)).toBe(true);
  expect(await history(page)).toBe(steps + 1);
  await undo(page);
  await type(page, transform, 'Rotation', rotation);
  expect((await source(page)).css).toBe(turned.css);
  await undo(page); expect(await source(page)).toEqual(original);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  // The left side (the right one sits low in this lower third), outward along the text's own X, which
  // its parent turns 30 degrees.
  await drag(page, await edge(page, 3), -20 * Math.cos(Math.PI / 6), -20 * Math.sin(Math.PI / 6), { alt: true }); await ready(page);
  const scaled = await source(page), sx = (await base(page, '#f0')).scaleX;
  expect(sx).not.toBe(1); expect((await base(page, '#f0')).scaleY).toBe(1);
  await undo(page);
  await type(page, transform, 'Scale X %', sx * 100);
  expect((await source(page)).css).toBe(scaled.css);
  await undo(page); expect(await source(page)).toEqual(original);
  // Without Alt the opposite (right) side stays where it is: the pivot and the axes are the parent's.
  const right = [await corner(page, 1), await corner(page, 2)];
  await drag(page, await edge(page, 3), -20 * Math.cos(Math.PI / 6), -20 * Math.sin(Math.PI / 6)); await ready(page);
  expect((await base(page, '#f0')).scaleY).toBe(1); expect((await base(page, '#f0')).scaleX).toBeGreaterThan(1.02);
  for (const [i, p] of [[1, right[0]], [2, right[1]]] as const) {
    const q = await corner(page, i);
    expect(near(q.x, p.x, .6) && near(q.y, p.y, .6), `corner ${i}: ${JSON.stringify(q)} vs ${JSON.stringify(p)}`).toBe(true);
  }
  await undo(page); expect(await source(page)).toEqual(original);
  // The anchor: the reason shows in the Anchor point section and on the canvas; nothing changes.
  await expect(page.locator(anchorSection)).toContainText('SVG');
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const marker = await anchorPoint(page);
  await page.mouse.move(marker.x, marker.y); await page.mouse.down();
  await expect(page.locator('.ef-stage-error')).toContainText('SVG');
  await page.mouse.move(marker.x + 20, marker.y + 20, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
  expect(await archivo.evaluate(face => !!face && document.fonts.has(face) && face.status === 'loaded'), 'transform edits retain the loaded Archivo face').toBe(true);
  await archivo.dispose();
});

// ---- Catalog ----

test('catalog: on every layer with base placement an anchor and a 15 degree Rotation apply or refuse with a kept reason', async ({ page }) => {
  test.setTimeout(240_000);
  await open(page);
  const report = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { baseValues } = await import('/src/blocks/baseEdits.ts');
    const { sequenceAuthoringReason, isArmed, writeChannel, trackOwner } = await import('/src/blocks/editorAnimation.ts');
    const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
    const out = { layers: 0, anchor: 0, rotation: 0, refused: {} as Record<string, number>, wrong: [] as string[] };
    for (const variants of Object.values(CATALOG)) for (const variant of variants ?? []) {
      const t = variant.create({}) as never as { html: string; js: string; css: string; fps: number };
      const view = readTimeline(t as never), d = parseAnimData(t.js);
      for (const part of view.parts) {
        if (part.kind === 'root') continue;
        let base;
        try { base = baseValues(t as never, part.selector); } catch { continue; }
        out.layers++;
        const tries: [string, unknown][] = [['anchor', { kind: 'base.set', selector: part.selector, values: { anchorX: 10, anchorY: 10 } }]];
        let rotation: unknown = { kind: 'base.set', selector: part.selector, values: { rotation: base.rotation + 15 } };
        try {
          const owner = d && !sequenceAuthoringReason(d) ? trackOwner(t as never, d, part.selector) : null;
          if (owner && isArmed(d, owner, 'rotation')) rotation = { kind: 'animation.key', selector: part.selector, step: 0, property: writeChannel(d, owner, 'rotation'), time: 0, value: 15, action: 'set' };
        } catch { /* the registry refuses with the same reason */ }
        tries.push(['rotation', rotation]);
        for (const [kind, operation] of tries) {
          try {
            const next = applyOperations(t as never, [operation as never], false).template;
            if (kind === 'anchor') {
              out.anchor++;
              // A flow line measures its anchor in the design's units, as its Layout offset.
              const origin = base.mode === 'flow' || base.scaled ? /transform-origin: calc\(var\(--base-anchor-x\) \* var\(--scale, 1\)\) calc\(var\(--base-anchor-y\) \* var\(--scale, 1\)\)/ : /transform-origin: var\(--base-anchor-x\) var\(--base-anchor-y\)/;
              if (next.js !== t.js || next.html !== t.html || !/--base-anchor-x:\s*10px/.test(next.css) || !origin.test(next.css)) out.wrong.push(variant.id + ' ' + part.selector + ' anchor');
            } else out.rotation++;
          } catch (error) {
            const label = kind + ': ' + String((error as Error).message).replace(/[#.][\w-]+/g, '<layer>').slice(0, 90);
            out.refused[label] = (out.refused[label] ?? 0) + 1;
          }
        }
      }
    }
    return out;
  });
  console.log(JSON.stringify(report, null, 1));
  expect(report.wrong).toEqual([]);
  // 1878 layers have base placement; an anchor refuses on at most the six the first run found (five
  // whose design's script turns that very element, one SVG), and a Rotation on none.
  expect(report.layers - report.anchor).toBeLessThanOrEqual(6);
  expect(report.rotation).toBe(report.layers);
  for (const reason of Object.keys(report.refused)) expect(reason).toMatch(/^anchor: .*(SVG|transformOrigin|another rule|more than once|inline style|text's own centre)/);
});
