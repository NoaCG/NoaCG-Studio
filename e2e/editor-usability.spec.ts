// covers: src/components/editorFoundation/**
// covers: src/blocks/{baseEdits,designLayout,artworkEdits,artworkLayers,svgIdentity,editorAnimation,editorOut,animData,animEdit}.ts
// covers: src/model/structure.ts, src/templates/shared/animRuntime.ts
// covers: src/components/wizard/{CreationWizard,steps/FinishStep}.tsx

import { test, expect, type Page } from '@playwright/test';
import { pickDesign } from './_browse';
import { settleDurableWrites } from './_durable';
import { parkFocusOffControls, holdKeyRepeats } from './_keys';

async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function selected(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts); }
async function frames(page: Page, count = 12) {
  await page.evaluate(count => new Promise<void>(resolve => { let n = 0; function tick() { if (++n === count) resolve(); else requestAnimationFrame(tick); } requestAnimationFrame(tick); }), count);
}
async function clock(page: Page) { return Number((await page.getByTestId('foundation-clock').textContent())!.split(' ')[0]); }
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function open(page: Page, name: string) {
  await page.goto('/app#/new'); await page.locator('[data-entry="template"]').click(); await pickDesign(page, name);
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await ready(page);
}
async function geometry(page: Page, selector: string) {
  return (await preview(page)).locator(selector).evaluate(el => { const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; });
}
async function saveReopen(page: Page) {
  const before = await source(page);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Usability proof'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible(); await ready(page);
  const after = await source(page);
  for (const key of ['html', 'css', 'js', 'fields', 'layers'] as const) expect(after[key]).toEqual(before[key]);
}

for (const name of ['Hairline', 'House Quiz']) for (const width of [1920, 1366, 1093]) {
  test('B02 B04 B13 usable authoring ' + name + ' ' + width, async ({ page }, info) => {
    await page.setViewportSize({ width, height: width === 1920 ? 1080 : width === 1366 ? 768 : 614 });
    const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
    await open(page, name);
    const original = await source(page);
    const boundary = await clock(page);
    await page.getByRole('button', { name: 'Go to beginning' }).click();
    await frames(page, 6);
    // Hairline draws its accent before its delayed text entrance.
    const pose = async () => (await preview(page)).locator(name === 'Hairline' ? '.lower-third-accent' : '.quiz-box').evaluate(el => {
      const s = getComputedStyle(el); return [s.transform, s.opacity, s.clipPath];
    });
    const initialPose = await pose();
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect.poll(() => clock(page)).toBeGreaterThan(.3);
    await page.getByRole('button', { name: 'Pause', exact: true }).click();
    const parked = await clock(page); await frames(page);
    expect(await clock(page)).toBe(parked);
    await expect.poll(pose).not.toEqual(initialPose);
    await page.getByTestId('foundation-canvas').focus(); await page.keyboard.press('Space');
    await expect.poll(() => clock(page)).toBeGreaterThan(parked);
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    expect(await clock(page)).toBeCloseTo(boundary, 2); await frames(page); expect(await clock(page)).toBeCloseTo(boundary, 2);
    expect(await source(page)).toEqual(original);
    await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
    // Space-drag and real auto-repeat must leave playback quiet.
    const canvas = page.getByTestId('foundation-canvas'); const box = (await canvas.boundingBox())!;
    await canvas.focus(); const transform = await page.locator('.ef-artboard').getAttribute('style');
    await page.keyboard.down('Space'); await page.mouse.move(box.x + 20, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 40, box.y + 35); await page.mouse.up(); await page.keyboard.up('Space');
    expect(await page.locator('.ef-artboard').getAttribute('style')).not.toBe(transform);
    await frames(page); expect(await clock(page)).toBeCloseTo(boundary, 2);
    await canvas.focus(); await holdKeyRepeats(page, 4); await page.keyboard.up('Space'); await frames(page);
    expect(await clock(page)).toBeCloseTo(boundary, 2);
    await page.getByRole('button', { name: 'Fit', exact: true }).click();
    const project = page.getByRole('button', { name: /^Project/ });
    await expect(page.getByRole('complementary', { name: 'Project', exact: true })).toBeHidden();
    await project.click(); await expect(project).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('complementary', { name: 'Project', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close Project' }).click(); await expect(project).toHaveAttribute('aria-expanded', 'false');
    const board = (await page.locator('.ef-artboard').boundingBox())!;
    await page.getByRole('button', { name: 'rectangle tool' }).click(); await page.mouse.click(board.x + board.width * .8, board.y + board.height * .15); await ready(page);
    const row = page.locator('.ef-track[data-selector="#rectangle-1"]');
    await expect(row).toHaveClass(/is-selected/);
    const rb = (await row.boundingBox())!, scroll = (await page.locator('.ef-track-scroll').boundingBox())!;
    expect(rb.y).toBeGreaterThanOrEqual(scroll.y); expect(rb.y + rb.height).toBeLessThanOrEqual(scroll.y + scroll.height + 1);
    await row.locator('.ef-layer').click();
    await page.getByRole('button', { name: 'Send backward', exact: true }).click(); await ready(page);
    await expect(page.getByRole('alert')).toHaveCount(0);
    const created = await source(page);
    await page.getByRole('button', { name: 'select tool', exact: true }).click();
    // Start on blank panel padding in Quiz, outside artwork in Hairline.
    await canvas.focus(); await page.keyboard.press('Escape');
    const panel = name === 'House Quiz' ? await geometry(page, '.quiz-box') : { x: 0, y: 0, width: 1920, height: 1080 };
    const scale = board.width / 1920;
    const start = { x: board.x + (panel.x + 12) * scale, y: board.y + (panel.y + 12) * scale };
    const end = { x: board.x + (panel.x + panel.width - 12) * scale, y: board.y + (panel.y + panel.height - 12) * scale };
    await page.mouse.move(start.x, start.y); await page.mouse.down(); await page.mouse.move(end.x, end.y, { steps: 12 });
    await page.screenshot({ path: info.outputPath('marquee.png') }); await page.mouse.up();
    expect((await selected(page)).length).toBeGreaterThan(1);
    expect(await selected(page)).toContain('#f0');
    expect(await page.evaluate(() => String(window.getSelection()))).toBe('');
    const target = (await page.locator('.ef-selection rect').filter({ visible: true }).first().boundingBox())!;
    const center = { x: target.x + target.width / 2, y: target.y + target.height / 2 };
    const beforeMove = await geometry(page, '#f0');
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 20, center.y + 8, { steps: 10 });
    await page.keyboard.press('Escape'); await page.mouse.up(); await ready(page);
    expect(await source(page)).toEqual(created);
    await expect.poll(async () => (await geometry(page, '#f0')).x).toBeCloseTo(beforeMove.x, 1);
    await page.mouse.move(center.x, center.y); await page.mouse.down(); await page.mouse.move(center.x + 20, center.y + 8, { steps: 10 }); await page.mouse.up(); await ready(page);
    await expect.poll(async () => (await geometry(page, '#f0')).x).toBeCloseTo(beforeMove.x + 20 / scale, 1);
    const moved = await source(page); expect(moved.js).toBe(original.js); expect(moved.fields).toEqual(original.fields);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(created);
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(moved);
    await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
    const fontSize = page.getByRole('textbox', { name: 'Font size', exact: true });
    await fontSize.fill('41'); await fontSize.fill('42');
    await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).toBe('42px');
    expect(await source(page)).toEqual(moved);
    await fontSize.press('Escape'); await ready(page); expect(await source(page)).toEqual(moved);
    await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).not.toBe('42px');
    await fontSize.fill('42'); await fontSize.press('Enter'); await ready(page);
    const styled = await source(page);
    expect(styled.css).not.toBe(moved.css);
    await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(moved);
    await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(styled);
    await expect(page.getByRole('button', { name: 'Apply appearance' })).toHaveCount(0);
    await fontSize.fill(''); await fontSize.press('Tab'); expect(await source(page)).toEqual(styled);
    const text = page.getByRole('textbox', { name: 'Artwork text', exact: true });
    await text.fill('Reliable text'); await text.press('Space'); expect(await clock(page)).toBeCloseTo(boundary, 2);
    await page.getByRole('button', { name: 'Apply text', exact: true }).click();
    await expect((await preview(page)).locator('#f0')).toHaveText('Reliable text');
    await page.screenshot({ path: info.outputPath('workspace.png') });
    await saveReopen(page);
    await page.getByRole('button', { name: 'Go to beginning' }).click(); await parkFocusOffControls(page); await page.keyboard.press('Space');
    await expect.poll(() => clock(page)).toBeGreaterThan(.08);
    expect(errors).toEqual([]);
  });
}

test('B11 losing pointer capture cancels Space panning without playback', async ({ page }) => {
  await open(page, 'Hairline');
  const canvas = page.getByTestId('foundation-canvas'), board = page.locator('.ef-artboard');
  const bounds = (await canvas.boundingBox())!, initial = await board.getAttribute('style');
  const parked = await clock(page), original = await source(page);
  await canvas.focus(); await page.keyboard.down('Space');
  await page.mouse.move(bounds.x + 20, bounds.y + 20); await page.mouse.down();
  await page.mouse.move(bounds.x + 40, bounds.y + 40);
  expect(await board.getAttribute('style')).not.toBe(initial);
  // Fault-inject capture loss while the pointer is down, rather than depending
  // on a window-switch race. Later movement must not keep the abandoned pan alive.
  expect(await canvas.evaluate(el => el.hasPointerCapture(1))).toBe(true);
  await canvas.evaluate(el => el.releasePointerCapture(1));
  await page.mouse.move(bounds.x + 60, bounds.y + 60); await frames(page, 3);
  expect(await board.getAttribute('style')).toBe(initial);
  await page.mouse.up(); await page.keyboard.up('Space'); await frames(page, 6);
  expect(await clock(page)).toBe(parked); expect(await source(page)).toEqual(original);
});

test('B04 appearance drafts survive focus changes and refuse invalid/stale input', async ({ page }) => {
  await open(page, 'Hairline');
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  const initial = await source(page);
  const size = page.getByRole('textbox', { name: 'Font size', exact: true });
  const colour = page.locator('.ef-appearance-field .grow');
  await size.fill('45'); await colour.fill('#112233'); await colour.press('Enter'); await ready(page);
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).color])).toEqual(['45px', 'rgb(17, 34, 51)']);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page);
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).toBe('45px');
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(initial);
  const opacity = page.getByRole('spinbutton', { name: /Opacity %/ });
  await opacity.fill('50');
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).opacity)).toBe('0.5');
  expect(await source(page)).toEqual(initial);
  await opacity.fill(''); await opacity.press('Tab'); expect(await source(page)).toEqual(initial);
  await opacity.fill('140'); await opacity.press('Enter'); expect(await source(page)).toEqual(initial);
  await colour.fill('#123'); await colour.press('Tab'); expect(await source(page)).toEqual(initial);
  await size.fill('2001'); await size.press('Tab'); expect(await source(page)).toEqual(initial);
  await size.fill('51');
  await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    s.applyTemplate({ ...s.template, css: s.template.css + '\n/* external revision */' });
  });
  await ready(page); await size.press('Enter');
  const external = await source(page); expect(external.css).toBe(initial.css + '\n/* external revision */');
  await size.fill('49');
  await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSelectedParts(['#f1']));
  await frames(page); expect(await selected(page)).toEqual(['#f1']); expect(await source(page)).toEqual(external);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await size.fill('47'); await page.locator('.ef-track[data-selector="#f1"] .ef-layer').click(); await ready(page);
  await expect.poll(async () => (await preview(page)).locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).toBe('47px');
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(external);
  // A modal and a focused numeric field must not start playback behind themselves.
  const parked = await clock(page);
  await opacity.focus(); await page.keyboard.press('Space');
  await frames(page, 6); expect(await clock(page)).toBe(parked);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').press('Space');
  await frames(page, 6); expect(await clock(page)).toBe(parked);
  await expect(page.getByRole('button', { name: 'Pause', exact: true })).toHaveCount(0);
});

test('B02 Quiz whole selection, modifier selection and pointer cancellation preserve source', async ({ page }) => {
  await open(page, 'House Quiz'); const initial = await source(page);
  const board = (await page.locator('.ef-artboard').boundingBox())!;
  await page.mouse.move(board.x - 8, board.y - 8); await page.mouse.down();
  await page.mouse.move(board.x + board.width + 8, board.y + board.height + 8, { steps: 10 }); await page.mouse.up();
  expect(await selected(page)).toContain('.quiz-box');
  const panel = await geometry(page, '.quiz-box'), scale = board.width / 1920;
  const x = board.x + (panel.x + panel.width / 2) * scale, y = board.y + (panel.y + 12) * scale;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 24, y + 12, { steps: 8 });
  await page.getByTestId('foundation-canvas').dispatchEvent('pointercancel'); await page.mouse.up(); await ready(page);
  expect(await source(page)).toEqual(initial);
  await expect.poll(async () => (await geometry(page, '.quiz-box')).x).toBeCloseTo(panel.x, 1);
  // The second gesture starts only after the correlated cancel pose is visible.
  await expect.poll(async () => Number(await page.locator('.ef-selection rect').first().getAttribute('x'))).toBeCloseTo(panel.x, 1);
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + 24, y + 12, { steps: 8 }); await page.mouse.up(); await ready(page);
  await expect.poll(async () => (await geometry(page, '.quiz-box')).x).toBeCloseTo(panel.x + 24 / scale, 1);
  expect((await source(page)).js).toBe(initial.js);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(initial);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await page.locator('.ef-track[data-selector=".quiz-option-1"] .ef-layer').click({ modifiers: ['Control'] });
  expect((await selected(page)).length).toBe(2);
  await page.locator('.ef-track[data-selector=".quiz-option-2"] .ef-layer').click({ modifiers: ['Shift'] });
  expect((await selected(page)).length).toBe(3);
});
