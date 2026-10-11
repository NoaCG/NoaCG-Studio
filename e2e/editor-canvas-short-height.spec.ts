// covers: src/components/editorFoundation/foundation.css
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { open, source, inspection, ready, capture, selected, select, row, undo } from './_layerProperty';

async function bounds(page: Page) {
  return page.evaluate(() => ({
    width: innerWidth, height: innerHeight,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    panels: Object.fromEntries(['.ef-viewport', '.ef-inspector', '.ef-timeline'].map(selector => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return [selector, { x: r.x, y: r.y, width: r.width, height: r.height }];
    })),
  }));
}

test('short desktop layout recovers canvas while ordinary laptop and phone keep their panels', async ({ page }, info) => {
  await page.setViewportSize({ width: 1920, height: 1080 }); await open(page);
  const original = await source(page), history = (await inspection(page)).history, receipts = [];
  // CSS layout regressions only. The separate headed probe proves real browser zoom.
  for (const [label, width, height] of [['desktop', 1920, 1080], ['laptop', 1366, 768], ['short', 1093, 545], ['short-minimum', 901, 540], ['phone', 390, 844]] as const) {
    await page.setViewportSize({ width, height }); await ready(page);
    await expect.poll(async () => (await bounds(page)).panels['.ef-viewport'].height).toBeGreaterThanOrEqual(label === 'phone' ? 250 : 180);
    const b = await bounds(page); receipts.push({ label, ...b });
    expect(b.overflow).toBeLessThanOrEqual(0);
    if (label.startsWith('short')) expect(b.panels['.ef-timeline'].height).toBeCloseTo(180, 0);
    else expect(b.panels['.ef-timeline'].height).toBeGreaterThanOrEqual(240);
    if (label !== 'phone') expect(b.panels['.ef-inspector'].width).toBeCloseTo(280, 0);
    for (const control of [page.getByTestId('open-home'), page.getByRole('button', { name: 'Composition', exact: true }), page.getByRole('button', { name: 'select tool', exact: true }), page.getByRole('slider', { name: 'Playhead', exact: true })]) {
      await control.scrollIntoViewIfNeeded(); await expect(control).toBeInViewport();
    }
    await page.getByTestId('foundation-canvas').scrollIntoViewIfNeeded();
    await capture(page, info.outputPath(label + '.png'));
    expect(await source(page)).toEqual(original); expect((await inspection(page)).history).toEqual(history);
  }
  await page.setViewportSize({ width: 1093, height: 545 }); await ready(page);
  await page.getByRole('combobox', { name: 'Canvas zoom' }).selectOption('2');
  const viewport = (await page.getByTestId('foundation-canvas').boundingBox())!;
  await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
  await page.mouse.down({ button: 'middle' }); await page.mouse.move(viewport.x + viewport.width / 2 + 23, viewport.y + viewport.height / 2 + 17); await page.mouse.up({ button: 'middle' });
  const pan = () => page.locator('.ef-artboard').evaluate(el => (el as HTMLElement).style.transform.split(' translate(-50%')[0]);
  expect(await pan()).toBe('translate(23px, 17px)');
  for (const size of [{ width: 1366, height: 768 }, { width: 1093, height: 545 }]) {
    await page.setViewportSize(size); await ready(page);
    await expect(page.getByRole('combobox', { name: 'Canvas zoom' })).toHaveValue('2'); expect(await pan()).toBe('translate(23px, 17px)');
    expect(await source(page)).toEqual(original); expect((await inspection(page)).history).toEqual(history);
  }
  writeFileSync(info.outputPath('layout.json'), JSON.stringify(receipts, null, 2));
});

test('compact canvas exposes movement resize and rotation and retains group navigation', async ({ page }, info) => {
  await page.setViewportSize({ width: 1093, height: 545 }); await open(page);
  const shapes = [];
  for (const offset of [0, .45]) {
    await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
    const art = (await page.locator('.ef-artboard').boundingBox())!;
    await page.mouse.move(art.x + art.width * (.15 + offset), art.y + art.height * .35); await page.mouse.down();
    await page.mouse.move(art.x + art.width * (.4 + offset), art.y + art.height * .65, { steps: 8 }); await page.mouse.up(); await ready(page);
    shapes.push((await selected(page))[0]);
  }
  await page.getByRole('button', { name: 'select tool', exact: true }).click(); await select(page, shapes[1]);
  const before = await source(page), history = (await inspection(page)).history;
  for (const selector of ['[data-handle="2"]', '[data-rotate]', '[data-anchor]']) {
    const handle = page.locator('.ef-selection ' + selector); await expect(handle).toBeInViewport({ ratio: 1 });
    const h = (await handle.boundingBox())!;
    expect(await page.evaluate(p => !!document.elementFromPoint(p.x, p.y)?.closest('[data-testid=foundation-canvas]'), { x: h.x + h.width / 2, y: h.y + h.height / 2 })).toBe(true);
  }
  // Each real pointer gesture commits once; undo and Escape restore the exact source.
  for (const selector of ['[data-anchor]', '[data-handle="2"]', '[data-rotate]']) {
    const h = (await page.locator('.ef-selection ' + selector).boundingBox())!;
    const start = { x: h.x + h.width / 2, y: h.y + h.height / 2 };
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 12, start.y + 8, { steps: 8 }); await page.mouse.up(); await ready(page);
    expect(await source(page)).not.toEqual(before); expect((await inspection(page)).history.undo).toBe(history.undo + 1);
    await undo(page); expect(await source(page)).toEqual(before);
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(start.x + 12, start.y + 8, { steps: 8 }); await page.keyboard.press('Escape'); await page.mouse.up(); await ready(page);
    expect(await source(page)).toEqual(before); expect((await inspection(page)).history.undo).toBe(history.undo);
  }
  await row(page, shapes[0]).locator('.ef-layer').click({ modifiers: ['Control'] }); await ready(page);
  await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  const grouped = await source(page); await page.getByRole('button', { name: 'Enter group', exact: true }).click(); await ready(page);
  await expect(page.getByRole('button', { name: 'Back to Composition', exact: true })).toBeInViewport();
  expect((await bounds(page)).panels['.ef-viewport'].height).toBeGreaterThanOrEqual(180);
  expect((await bounds(page)).panels['.ef-timeline'].height).toBeCloseTo(180, 0);
  await capture(page, info.outputPath('group.png'));
  await page.getByRole('button', { name: 'Back to Composition', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(grouped);
});
