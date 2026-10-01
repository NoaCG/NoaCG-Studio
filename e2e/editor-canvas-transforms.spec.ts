// covers: src/blocks/{baseEdits,editorAnimation,animEdit,animData,edit}.ts, src/components/editorFoundation/**
// covers: src/templates/**, src/model/structure.ts, src/preview/composeDocument.ts
//
// R1.2b.1 canvas transform tools (docs/research/editor-r1-2b-1): the rotation handle, edge scale
// handles and the anchor point (numeric X/Y, Center anchor and the Anchor tool). Every gesture
// writes what the numeric fields write, as one undo; the anchor is a static base value in CSS and
// its compensated edits keep the pose at the playhead. scripts/canvas-transforms.test.mjs checks
// the gesture math and the operations densely in Node.

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
/** Every track of every layer but `except`, per cue, as JSON: what an edit must leave byte for byte. */
const untouched = (d: Data, except: string[]) => JSON.stringify(d.steps.map(s => Object.entries(s.layers).filter(([k]) => !except.includes(k))));
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

test('edge handles scale one axis about the opposite side, Shift both, Alt about the anchor; a rotated layer scales along its own sides', async ({ page }) => {
  const t = await withRectangle(page);
  await editorWith(page, t);
  await select(page, t.rect);
  await page.getByRole('checkbox', { name: 'Link proportions' }).check();
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
  await undo(page);

  // Shift: both axes by the side's ratio.
  await drag(page, await edge(page, 1), 60, 0, { shift: true }); await ready(page);
  b = await base(page, t.rect);
  expect(near(b.scaleX, b.scaleY, 1e-6)).toBe(true); expect(b.scaleX).toBeGreaterThan(1.05);
  await undo(page);

  // Alt: about the anchor (the centre), which is what typing that Scale X writes.
  await drag(page, await edge(page, 1), 60, 0, { alt: true }); await ready(page);
  const alt = await source(page); b = await base(page, t.rect); r = await bounds(page, t.rect);
  expect(near(r.x + r.width / 2, before.x + before.width / 2, .5)).toBe(true);
  await undo(page);
  await page.getByRole('checkbox', { name: 'Link proportions' }).uncheck();
  await type(page, transform, 'Scale X %', Math.round(b.scaleX * 100000) / 1000);
  expect((await source(page)).css).toBe(alt.css);
  await undo(page); await page.getByRole('checkbox', { name: 'Link proportions' }).check();

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
});

test('catalog edges: the accent keys scaleX from its side and refuses its top; Frosted Panel keys scale with Shift and refuses one axis', async ({ page }) => {
  await open(page);
  const steps = await catalog(page, 'card26');
  await editorWith(page, steps);
  await seekFrames(page, Math.round(.3 * steps.fps), steps.fps);
  await select(page, '.info-card-accent');
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
  original = await source(page); count = await history(page);
  await drag(page, await edge(page, 1), 30, 0); await ready(page);
  await expect(page.locator('.ef-stage-error')).toContainText('share one');
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(count);
  await drag(page, await edge(page, 1), 30, 0, { shift: true }); await ready(page);
  const box = (await data(page)).steps[0].layers['.info-card-box'];
  expect(box.scaleX).toBeUndefined();
  expect(box.scale.some(k => near(k.time, time, 1e-3))).toBe(true);
  expect(await history(page)).toBe(count + 1);
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

  // Center anchor keeps the pose and reads the box centre.
  const posed = await bounds(page, t.rect), corners = [await corner(page, 0), await corner(page, 2)];
  steps = await history(page);
  await page.getByRole('button', { name: 'Center anchor', exact: true }).click(); await ready(page);
  expect(await history(page)).toBe(steps + 1);
  expectSame(await bounds(page, t.rect), posed, .5, 'centred');
  expect(Number(await (await field(page, anchorSection, 'Anchor X')).inputValue())).toBeCloseTo(150, 2);
  expect(Number(await (await field(page, anchorSection, 'Anchor Y')).inputValue())).toBeCloseTo(60, 2);
  const marker = await anchorPoint(page);
  expect(near(marker.x, (corners[0].x + corners[1].x) / 2, .6)).toBe(true);
  expect(near(marker.y, (corners[0].y + corners[1].y) / 2, .6)).toBe(true);

  // The Anchor tool: the marker follows the pointer, the pose stays, anchor and Position in one undo.
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const centred = await source(page), placed = await base(page, t.rect);
  steps = await history(page);
  await drag(page, marker, 40, -25, { escape: true }); await ready(page);
  expect(await source(page)).toEqual(centred); expect(await history(page)).toBe(steps);
  await drag(page, marker, 40, -25); await ready(page);
  expect(await history(page)).toBe(steps + 1);
  const moved = await anchorPoint(page);
  expect(near(moved.x, marker.x + 40, .6)).toBe(true); expect(near(moved.y, marker.y - 25, .6)).toBe(true);
  expectSame(await bounds(page, t.rect), posed, .5, 'anchor tool');
  // The compensation is base Position (nothing here is animated); the anchor moved with it.
  const after = await base(page, t.rect), edited = await source(page);
  expect(Math.abs(after.x - placed.x) + Math.abs(after.y - placed.y)).toBeGreaterThan(1);
  expect(after.anchor!.x).not.toBeCloseTo(150, 1);
  expect(edited.js).toBe(original.js);
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
  expect(errors).toEqual([]);
});

test('anchor on animated and placed layers: Frosted Panel keys y at the playhead; created text anchors its box; refusals', async ({ page }) => {
  // Frosted Panel at 0.28 s: scale and y keyed, x not. The pose there stays.
  await open(page);
  const frosted = await catalog(page, 'card03');
  await editorWith(page, frosted);
  const frames = Math.round(.28 * frosted.fps), time = frames / frosted.fps;
  await seekFrames(page, frames, frosted.fps);
  await select(page, '.info-card-box');
  let original = await source(page), steps = await history(page);
  const before = await dataOf(page, original.js), posed = await bounds(page, '.info-card-box');
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  await drag(page, await anchorPoint(page), -80, 30); await ready(page);
  const after = await data(page), box = after.steps[0].layers['.info-card-box'];
  expect(box.y.some(k => near(k.time, time * after.speed, 1e-3))).toBe(true);
  expect(box.scale).toEqual(before.steps[0].layers['.info-card-box'].scale);
  expect(untouched(after, ['.info-card-box'])).toBe(untouched(before, ['.info-card-box']));
  expect((await source(page)).css).toMatch(/--base-anchor-x/); expect((await source(page)).css).toMatch(/--layout-x/);
  expect(await history(page)).toBe(steps + 1);
  expectSame(await bounds(page, '.info-card-box'), posed, .5, 'Frosted Panel at the playhead');
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
  await refuse(spinning.template!, t.text!, /anchor|pivot/i);
  // Another rule owns transform-origin; the graphic's own script sets it.
  await refuse({ ...original, css: original.css + `\nbody ${t.rect} { transform-origin: 0 0; }\n` }, t.rect, /another rule/);
  await refuse({ ...original, js: original.js + `\ngsap.set('${t.rect}', { transformOrigin: '0 0' });\n` }, t.rect, /transformOrigin/);
  expect((await operate(page, original, [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5, anchorY: 5 } }])).error).toBeUndefined();
  expect((await operate(page, original, [{ kind: 'base.set', selector: t.rect, values: { anchorX: 5 } }])).error).toMatch(/both anchor/);
  // An SVG element.
  const svg = JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-svg.json', import.meta.url), 'utf8')) as Template;
  await refuse(svg, '#f0', /SVG/);
});

test('nested SVG: the rotation and edge handles write what the fields write; its anchor refuses beside the control', async ({ page }) => {
  await open(page);
  const svg = JSON.parse(readFileSync(new URL('../docs/research/editor-r1-foundation/fixture-svg.json', import.meta.url), 'utf8')) as Template;
  svg.html = svg.html.replace(/(<text\b[^>]*id="f0"[\s\S]*?<\/text>)/, '<g id="test-parent" transform="translate(100,80) rotate(30) scale(2)">$1</g>');
  await editorWith(page, svg);
  await select(page, '#f0');
  const original = await source(page), steps = await history(page);
  await turn(page, 25); await ready(page);
  const turned = await source(page), rotation = (await base(page, '#f0')).rotation;
  expect(rotation).toBeGreaterThan(10);
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
  await type(page, transform, 'Scale X %', Math.round(sx * 100000) / 1000);
  expect((await source(page)).css).toBe(scaled.css);
  await undo(page); expect(await source(page)).toEqual(original);
  // The anchor: the reason shows in the Anchor point section and on the canvas; nothing changes.
  await expect(page.locator(anchorSection)).toContainText('SVG');
  await page.getByRole('button', { name: 'anchor tool', exact: true }).click();
  const marker = await anchorPoint(page);
  await page.mouse.move(marker.x, marker.y); await page.mouse.down();
  await expect(page.locator('.ef-stage-error')).toContainText('SVG');
  await page.mouse.move(marker.x + 20, marker.y + 20, { steps: 4 }); await page.mouse.up(); await ready(page);
  expect(await source(page)).toEqual(original); expect(await history(page)).toBe(steps);
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
  expect(report.anchor).toBeGreaterThan(report.layers * .8);
  expect(report.rotation).toBeGreaterThan(report.layers * .8);
  for (const reason of Object.keys(report.refused)) expect(reason).toMatch(/^(anchor|rotation): .*(SVG|another rule|transformOrigin|pivot|Rotation is animated|raw transform|several layers|two selectors)/);
});
