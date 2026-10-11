import { expect, type Page, type Locator } from '@playwright/test';
import type { SpxTemplate } from '../src/model/types';
import { settleDurableWrites } from './_durable';

export const source = (page: Page): Promise<SpxTemplate> => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
export const selected = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
export const inspection = (page: Page) => page.evaluate(async () => {
  const result = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect();
  if (!result.ok) throw Error(result.refusal.message); return result;
});
export const row = (page: Page, selector: string) => page.locator(`.ef-track:not(.ef-property-track)[data-selector="${selector}"]`);
export const number = (page: Page, name: string | RegExp) => page.locator('.ef-animation-properties').getByRole('textbox', { name, exact: typeof name === 'string' });
export async function frame(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
export async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const node = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(node.getAttribute('data-pose-time')) - view.time) < .00001 && node.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
export async function open(page: Page) {
  await page.goto('/app?editor=foundation#/new'); await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type=file]').setInputFiles('e2e/fixtures/cli-round-trip/riverlight.zip');
  await expect(page.getByTestId('import-template-card')).toContainText('Riverlight');
  await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  await seek(page, 1);
}
export async function seek(page: Page, time: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead', exact: true }), frames = Math.round(time * (await source(page)).fps);
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(frames / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < frames % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(time)); await ready(page);
}
export async function select(page: Page, selector: string) { await row(page, selector).locator('.ef-layer').click(); await ready(page); }
export async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }
export async function redo(page: Page) { await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); }
export async function scrub(page: Page, field: Locator, distance: number, modifier?: 'Shift' | 'Control', cancel?: 'Escape' | 'pointercancel', preview?: () => Promise<void>) {
  await field.scrollIntoViewIfNeeded(); const box = (await field.boundingBox())!;
  if (modifier) await page.keyboard.down(modifier);
  await page.mouse.move(box.x + 16, box.y + box.height / 2); await page.mouse.down();
  await page.mouse.move(box.x + 16 + distance, box.y + box.height / 2, { steps: 8 });
  const during = await field.inputValue(); await preview?.();
  if (cancel === 'Escape') await page.keyboard.press('Escape');
  if (cancel === 'pointercancel') await field.locator('..').dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse' });
  await page.mouse.up(); if (modifier) await page.keyboard.up(modifier);
  await ready(page); return during;
}
export async function draw(page: Page, x: number) {
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  const box = (await page.locator('.ef-artboard').boundingBox())!;
  await page.mouse.move(box.x + box.width * x, box.y + box.height * .25); await page.mouse.down();
  await page.mouse.move(box.x + box.width * (x + .12), box.y + box.height * .36, { steps: 8 }); await page.mouse.up();
  const selector = (await selected(page))[0];
  await expect((await frame(page)).locator(selector)).toHaveCount(1); await ready(page); expect(await selected(page)).toHaveLength(1);
  return selector;
}
export async function point(page: Page, selector: string) {
  const art = (await page.locator('.ef-artboard').boundingBox())!, t = await source(page);
  const rect = await (await frame(page)).locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  return { x: art.x + rect.x / t.resolution.width * art.width, y: art.y + rect.y / t.resolution.height * art.height };
}
export async function capture(page: Page, path: string) {
  const f = await frame(page), style = await f.addStyleTag({ content: '*{will-change:auto!important}' });
  const settle = () => f.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await settle(); await style.evaluate(el => el.remove()); await settle(); await page.screenshot({ path });
}
export async function saveReopen(page: Page, name: string) {
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill(name); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page); expect(await source(page)).toEqual(saved); return saved;
}
