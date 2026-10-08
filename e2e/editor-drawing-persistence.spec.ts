// covers: src/components/editorFoundation/**
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SpxTemplate } from '../src/model/types';

const canvas = (page: Page) => page.getByTestId('foundation-canvas');
const source = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const selection = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
const tool = (page: Page, name: string) => page.getByRole('button', { name: name + ' tool', exact: true });
async function frame(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function ready(page: Page) {
  await expect(canvas(page)).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async t => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true });
    await new Promise(resolve => setTimeout(resolve));
  }, JSON.parse(readFileSync('docs/research/editor-r1-foundation/fixture-catalog.json', 'utf8')) as SpxTemplate);
  await ready(page);
  await expect((await frame(page)).locator('#f0')).toBeAttached();
}
async function point(page: Page, x: number, y: number, dx = 0, dy = 0, shift = false) {
  const t = await source(page), box = (await page.locator('.ef-artboard').boundingBox())!;
  const screen = (x: number, y: number) => ({ x: box.x + x / t.resolution.width * box.width, y: box.y + y / t.resolution.height * box.height });
  const from = screen(x, y), to = screen(x + dx, y + dy);
  if (shift) await page.keyboard.down('Shift');
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  if (dx || dy) await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  if (shift) await page.keyboard.up('Shift');
}
async function retains(page: Page, name: string) {
  await expect(canvas(page)).toHaveAttribute('data-tool', name);
  await expect(tool(page, name)).toHaveAttribute('aria-pressed', 'true');
}
async function history(page: Page, redo = false) {
  await page.getByRole('button', { name: redo ? 'Redo' : 'Undo', exact: true }).click();
  await ready(page);
}
async function checkHistory(page: Page, snapshots: SpxTemplate[], name: string) {
  for (const snapshot of snapshots.slice(0, -1).reverse()) { await history(page); expect(await source(page)).toEqual(snapshot); await retains(page, name); }
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  for (const snapshot of snapshots.slice(1)) { await history(page, true); expect(await source(page)).toEqual(snapshot); await retains(page, name); }
}
for (const name of ['rectangle', 'ellipse', 'text']) test(`${name}: select once and create three objects with one undo each`, async ({ page }) => {
  await open(page); const before = await source(page), snapshots = [before], ids: string[] = [];
  await tool(page, name).click();
  for (let i = 0; i < 3; i++) {
    await point(page, 700 + i * 260, 300, i === 2 ? 0 : 140, i === 2 ? 0 : 80, i === 1);
    await retains(page, name); await ready(page);
    const id = (await selection(page))[0]; expect(id).toMatch(/^#/); expect(ids).not.toContain(id); ids.push(id);
    await expect((await frame(page)).locator(id)).toBeVisible();
    await expect(page.locator(`.ef-track[data-selector="${id}"] .ef-bar`).first()).toBeVisible();
    const t = await source(page); snapshots.push(t);
    expect(t.assets).toEqual(before.assets); expect(t.js).toBe(before.js);
    expect(t.fields.length).toBe(before.fields.length + (name === 'text' ? i + 1 : 0));
    if (name === 'text') expect(t.fields.at(-1)!.value).toBe('Text');
    const bounds = await (await frame(page)).locator(id).evaluate(el => { const r = el.getBoundingClientRect(); return { width: r.width, height: r.height }; });
    if (name !== 'text' && i >= 1) expect(bounds.width).toBeCloseTo(bounds.height, 1);
    if (name !== 'text' && i === 2) expect(bounds.width).toBeCloseTo(120, 1);
  }
  await checkHistory(page, snapshots, name);
  await tool(page, 'select').click(); await retains(page, 'select');
});
test('pen: select once and finish successive open, closed and curved paths', async ({ page }) => {
  await open(page); const before = await source(page), snapshots = [before], ids: string[] = [];
  await tool(page, 'pen').click();
  for (let i = 0; i < 3; i++) {
    const x = 600 + i * 320;
    await point(page, x, 300, i === 2 ? 70 : 0, 0);
    await point(page, x + 220, 300, 0, i === 2 ? 70 : 0);
    await point(page, x + 110, 540);
    if (i === 1) await point(page, x, 300); else await page.keyboard.press('Enter');
    await retains(page, 'pen'); await ready(page);
    await expect(page.locator('[data-pen-point]')).toHaveCount(0);
    const id = (await selection(page))[0]; expect(id).toMatch(/^#pen-/); expect(ids).not.toContain(id); ids.push(id);
    const d = await (await frame(page)).locator(id + ' path').getAttribute('d');
    expect(d!.includes(' Z')).toBe(i === 1); expect(d!.includes(' C ')).toBe(i === 2);
    const t = await source(page); snapshots.push(t); expect(t.fields).toEqual(before.fields); expect(t.assets).toEqual(before.assets);
  }
  await checkHistory(page, snapshots, 'pen');
});
test('pen draft cancellation retains the tool and exact completed source/history', async ({ page }) => {
  await open(page); const before = await source(page);
  await tool(page, 'pen').click(); await point(page, 600, 300); await point(page, 800, 400); await page.keyboard.press('Enter'); await ready(page);
  const completed = await source(page), selected = await selection(page);
  for (const exit of ['Escape', 'pointer']) {
    await point(page, 1100, 300); await point(page, 1300, 500);
    expect(await source(page)).toEqual(completed);
    if (exit === 'Escape') await page.keyboard.press('Escape'); else await canvas(page).dispatchEvent('pointercancel');
    await retains(page, 'pen'); await expect(page.locator('[data-pen-point]')).toHaveCount(0);
    expect(await source(page)).toEqual(completed); expect(await selection(page)).toEqual(selected);
  }
  await history(page); expect(await source(page)).toEqual(before);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
for (const name of ['rectangle', 'ellipse', 'text']) test(name + ': Escape, pointer loss and explicit tool choice discard only the draft', async ({ page }) => {
  await open(page); await tool(page, name).click(); await point(page, 600, 300, 120, 70); await ready(page);
  const completed = await source(page), selected = await selection(page);
  for (const exit of ['Escape', 'pointercancel', 'lostpointercapture', 'tool']) {
    const t = await source(page), box = (await page.locator('.ef-artboard').boundingBox())!;
    const x = box.x + 1100 / t.resolution.width * box.width, y = box.y + 300 / t.resolution.height * box.height;
    await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 60, y + 40);
    expect(await source(page)).toEqual(completed);
    if (exit === 'Escape') await page.keyboard.press('Escape');
    else if (exit === 'tool') await tool(page, 'select').dispatchEvent('click');
    else await canvas(page).dispatchEvent(exit);
    await page.mouse.up(); await retains(page, exit === 'tool' ? 'select' : name);
    expect(await source(page)).toEqual(completed); expect(await selection(page)).toEqual(selected);
  }
  await history(page); await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
test('point editing cancels a construction draft and Escape returns to whole-layer Select', async ({ page }) => {
  await open(page); await tool(page, 'pen').click();
  await point(page, 600, 300, 50, 0); await point(page, 800, 300); await page.keyboard.press('Enter'); await ready(page);
  const original = await source(page), id = (await selection(page))[0];
  await point(page, 1100, 700); await point(page, 1300, 800);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  await expect(page.locator('[data-pen-point]')).toHaveCount(2);
  const marker = page.locator('[data-pen-point="1"]'), box = (await marker.boundingBox())!;
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 20); await page.keyboard.press('Escape'); await page.mouse.up();
  await retains(page, 'select'); expect(await source(page)).toEqual(original);
  await page.getByRole('button', { name: 'Edit points', exact: true }).click();
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 30, y + 20); await page.mouse.up(); await ready(page);
  expect((await source(page)).html).not.toBe(original.html); expect(await selection(page)).toEqual([id]);
  await history(page); expect(await source(page)).toEqual(original);
  await tool(page, 'rectangle').click(); await retains(page, 'rectangle');
  await expect(page.locator('[data-pen-point]')).toHaveCount(0);
});
test('group entry cancels Pen and switches to Select; returning to Composition stays coherent', async ({ page }) => {
  await open(page); await tool(page, 'rectangle').click();
  const ids: string[] = [];
  for (const x of [600, 900]) { await point(page, x, 300, 120, 90); await ready(page); ids.push((await selection(page))[0]); }
  const group = await page.evaluate(async ids => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const result = s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'group.create', selectors: ids, box: { x: 600, y: 300, width: 420, height: 90 } }] });
    await new Promise(resolve => setTimeout(resolve)); return result.changedTargets[0];
  }, ids);
  await ready(page); const grouped = await source(page);
  await tool(page, 'pen').click(); await point(page, 1300, 400); await point(page, 1500, 600);
  await page.locator(`.ef-track[data-selector="${group}"] .ef-enter-group`).click();
  await retains(page, 'select'); await expect(tool(page, 'pen')).toBeDisabled();
  expect(await source(page)).toEqual(grouped); await expect(page.locator('[data-pen-point]')).toHaveCount(0);
  await point(page, 1450, 650); expect(await source(page)).toEqual(grouped);
  await page.getByRole('button', { name: 'Back to Composition', exact: true }).click();
  await retains(page, 'select'); await expect(tool(page, 'pen')).toBeEnabled(); expect(await source(page)).toEqual(grouped);
  await tool(page, 'pen').click(); await point(page, 1300, 400); await point(page, 1500, 600); await page.keyboard.press('Enter'); await ready(page);
  await history(page); expect(await source(page)).toEqual(grouped);
});
for (const change of ['source', 'assets', 'playhead', 'document']) test('Pen draft guard: ' + change + ' creates no orphan source or history', async ({ page }) => {
  await open(page); const before = await source(page);
  await tool(page, 'pen').click(); await point(page, 600, 300); await point(page, 800, 500);
  if (change === 'playhead') { await page.getByTestId('foundation-ruler').focus(); await page.keyboard.press('ArrowLeft'); }
  else await page.evaluate(async change => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(), t = s.template;
    s.applyTemplate(change === 'assets' ? { ...t, assets: [...t.assets, { path: 'guard.txt', data: new Blob(['guard']) }] } : { ...t, css: t.css + '\n/* external ' + change + ' */' }, { resetSampleData: change === 'document' });
    await new Promise(resolve => setTimeout(resolve));
  }, change);
  const expected = await source(page);
  await canvas(page).focus(); await page.keyboard.press('Enter');
  expect(await source(page)).toEqual(expected); await expect(page.locator('[data-pen-point]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
  await retains(page, change === 'document' ? 'select' : 'pen');
  if (change === 'playhead') expect(expected).toEqual(before);
});
