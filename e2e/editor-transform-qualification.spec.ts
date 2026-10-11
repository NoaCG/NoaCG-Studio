// covers: src/components/editorFoundation/**
// Bounded #910 reproduction. Canvas/typography and CLI specs retain wider regression coverage.
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';
type Point = { x: number; y: number };
const source = (p: Page) => p.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const history = (p: Page) => p.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().history.length);
const base = (p: Page, s: string) => p.evaluate(async s => (await import('/src/blocks/baseEdits.ts')).baseValues((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template, s), s);
async function ready(p: Page) {
  await expect(p.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect.poll(() => p.evaluate(async () => {
    const v = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view(), c = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(c.getAttribute('data-pose-time')) - v.time) < .00001 && c.getAttribute('data-pose-cue') === String(v.cue ?? 'arriving');
  })).toBe(true);
}
async function setup(p: Page, box = false) {
  await p.goto('/app?editor=foundation#/editor-foundation'); await expect(p.getByTestId('editor-foundation')).toBeVisible();
  const s = await evaluateInPage(p, async (box: boolean) => {
    const t = (await import('/src/templates/catalog.ts')).variantById('lt01')!.create({});
    const a = (await import('/src/blocks/baseEdits.ts')).createArtwork(t, { shape: box ? 'text' : 'rectangle', x: 700, y: -560, width: 400, height: 160, box });
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(a.template, { resetSampleData: true }); return a.selector;
  }, box);
  await ready(p); await p.locator(`.ef-track[data-selector="${s}"] .ef-layer`).first().click(); await ready(p); return s;
}
async function point(p: Page, a: string): Promise<Point> { const r = (await p.locator('.ef-selection ' + a).boundingBox())!; return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }
async function drag(p: Page, from: Point, dx: number, dy: number, cancel?: 'escape' | 'pointer', shift = false) {
  expect(await p.evaluate(q => !!document.elementFromPoint(q.x, q.y)?.closest('[data-testid=foundation-canvas]'), from), 'handle is reachable').toBe(true);
  await p.mouse.move(from.x, from.y); await p.mouse.down(); if (shift) await p.keyboard.down('Shift');
  await p.mouse.move(from.x + dx, from.y + dy, { steps: 8 });
  if (cancel === 'escape') await p.keyboard.press('Escape');
  if (cancel === 'pointer') await p.getByTestId('foundation-canvas').dispatchEvent('pointercancel');
  await p.mouse.up(); if (shift) await p.keyboard.up('Shift'); await ready(p);
}
async function type(p: Page, name: string, n: number) { const f = p.locator('.ef-animation-properties').getByRole('textbox', { name, exact: true }); await f.fill(String(n)); await f.press('Enter'); await ready(p); }
async function undo(p: Page) { await p.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(p); }
async function frame(p: Page) { return (await (await p.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
const near = (a: Point, b: Point) => expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(.8);
async function turn(p: Page, degrees: number) {
  const a = await point(p, '[data-anchor]'), k = await point(p, '[data-rotate]'), start = Math.atan2(k.y - a.y, k.x - a.x), r = Math.hypot(k.x - a.x, k.y - a.y);
  await p.mouse.move(k.x, k.y); await p.mouse.down();
  for (let i = 1; i <= 12; i++) { const angle = start + degrees * Math.PI / 180 * i / 12; await p.mouse.move(a.x + r * Math.cos(angle), a.y + r * Math.sin(angle)); }
  await p.mouse.up(); await ready(p);
}
test('linked scale preserves unequal axes for typing, corners and sides; Shift inverts and cancel is exact', async ({ page: p }) => {
  await p.setViewportSize({ width: 1920, height: 1080 }); const s = await setup(p), link = p.getByRole('checkbox', { name: 'Link proportions' });
  await link.uncheck(); await type(p, 'Scale X %', 150); await type(p, 'Scale Y %', 75); await link.check();
  await type(p, 'Scale X %', 180); expect((await base(p, s)).scaleY).toBe(.9);
  const initial = await source(p), count = await history(p);
  await drag(p, await point(p, '[data-handle="2"]'), 40, 15); let b = await base(p, s);
  expect(b.scaleX / b.scaleY).toBeCloseTo(2, 5); expect(b.scaleX).toBeGreaterThan(1.8); await undo(p); expect(await source(p)).toEqual(initial);
  const kept = await point(p, '[data-edge="3"]'); await drag(p, await point(p, '[data-edge="1"]'), 40, 0); b = await base(p, s);
  writeFileSync(test.info().outputPath('linked-side.json'), JSON.stringify(b, null, 2));
  expect(b.scaleX / b.scaleY, 'linked side preserves the ratio used by typing and corners').toBeCloseTo(2, 5);
  near(await point(p, '[data-edge="3"]'), kept); expect(await history(p)).toBe(count + 1);
  const completed = await source(p); await undo(p); expect(await source(p)).toEqual(initial);
  await p.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(p); expect(await source(p)).toEqual(completed); await undo(p);
  for (const cancel of ['escape', 'pointer'] as const) { await drag(p, await point(p, '[data-edge="1"]'), 40, 0, cancel); expect(await source(p)).toEqual(initial); expect(await history(p)).toBe(count); }
  await drag(p, await point(p, '[data-edge="1"]'), 40, 0, undefined, true); b = await base(p, s); expect(b.scaleY).toBe(.9); expect(b.scaleX).toBeGreaterThan(1.8); await undo(p);
  await link.uncheck(); await drag(p, await point(p, '[data-edge="1"]'), 40, 0); expect((await base(p, s)).scaleY).toBe(.9); await undo(p);
  await drag(p, await point(p, '[data-edge="1"]'), 40, 0, undefined, true); b = await base(p, s); expect(b.scaleX / b.scaleY).toBeCloseTo(2, 5);
  await undo(p); await type(p, 'Scale X %', 0); const zero = await source(p), zeroCount = await history(p);
  await drag(p, await point(p, '[data-edge="1"]'), 20, 0);
  await expect(p.locator('.ef-stage-error')).toContainText('zero scale axis');
  expect(await source(p)).toEqual(zero); expect(await history(p)).toBe(zeroCount);
  await type(p, 'Scale X %', 180); await link.check(); await type(p, 'Rotation', 30);
  const opposite = await point(p, '[data-edge="3"]');
  await drag(p, await point(p, '[data-edge="1"]'), 40 * Math.cos(Math.PI / 6), 20);
  b = await base(p, s); expect(b.scaleX / b.scaleY).toBeCloseTo(2, 5); near(await point(p, '[data-edge="3"]'), opposite);
  expect((await source(p)).html).toBe(initial.html); expect((await source(p)).js).toBe(initial.js);
});
for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'zoom-proxy']] as const) test('text-box side versus corner and rotation reopen ' + label, async ({ page: p }) => {
  test.setTimeout(120_000); const errors: string[] = []; p.on('pageerror', e => errors.push(e.message));
  await p.setViewportSize({ width, height }); const s = await setup(p, true);
  if (label === 'zoom-proxy') { await p.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('2'); await ready(p); }
  const initial = await source(p), original = await base(p, s), count = await history(p), f = await frame(p), font = await f.locator(s).evaluate(el => getComputedStyle(el).fontSize), left = await point(p, '[data-edge="3"]');
  await drag(p, await point(p, '[data-edge="1"]'), 35, 0); const resized = await base(p, s); expect([resized.scaleX, resized.scaleY]).toEqual([1, 1]);
  expect(await f.locator(s).evaluate(el => getComputedStyle(el).fontSize)).toBe(font); near(await point(p, '[data-edge="3"]'), left); expect(await history(p)).toBe(count + 1);
  const size = p.getByTestId('artwork-box-width'); expect(Number(await size.inputValue())).toBeGreaterThan(400); await undo(p); expect(await source(p)).toEqual(initial);
  await drag(p, await point(p, '[data-handle="2"]'), 25, 10); const scaled = await base(p, s); expect(scaled.scaleX).toBeGreaterThan(1); expect(scaled.scaleX).toBeCloseTo(scaled.scaleY, 5); expect(Number(await size.inputValue())).toBe(400);
  await type(p, 'Rotation', 30); const before = await source(p); await turn(p, 30); const rotated = await base(p, s); expect(rotated.rotation).toBeCloseTo(60, 0);
  const after = await source(p); await undo(p); expect(await source(p)).toEqual(before); await type(p, 'Rotation', rotated.rotation); expect((await source(p)).css).toBe(after.css);
  const completed = await source(p); expect(completed.html).toBe(initial.html); expect(completed.js).toBe(initial.js); expect(completed.fields).toEqual(initial.fields);
  await p.getByTestId('save-graphic').click(); await p.getByTestId('save-name').fill('Transform ' + label); await p.getByTestId('save-confirm').click(); await expect(p.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(p); await p.reload(); await ready(p); expect(await source(p)).toEqual({ ...completed, name: 'Transform ' + label });
  await p.locator(`.ef-track[data-selector="${s}"] .ef-layer`).first().click(); await ready(p);
  if (label === 'zoom-proxy') { await p.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('2'); await ready(p); }
  const live = await frame(p), style = await live.addStyleTag({ content: '*{will-change:auto !important}' }), settle = () => live.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await settle(); await style.evaluate(el => el.remove()); await settle(); await p.screenshot({ path: test.info().outputPath(label + '.png') });
  writeFileSync(test.info().outputPath(label + '.json'), JSON.stringify({ width, height, original, resized, scaled, rotated, errors }, null, 2)); expect(errors).toEqual([]);
});

