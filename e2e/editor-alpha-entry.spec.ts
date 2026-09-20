import { test, expect } from '@playwright/test';

test('phone-preview keeps a useful canvas width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const canvas = await page.getByTestId('foundation-canvas').boundingBox();
  expect(canvas!.width).toBeGreaterThanOrEqual(380);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

for (const [name, width, height] of [['desktop', 1366, 768], ['phone', 390, 844], ['landscape', 844, 390]] as const) {
  test('wizard alpha shortcut and return work on ' + name, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height });
    await page.goto('/app#/new');
    const link = page.getByRole('link', { name: 'Open editor Alpha', exact: true });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/app?editor=foundation#/editor-foundation');
    const linkBox = (await link.boundingBox())!;
    expect(linkBox.y + linkBox.height).toBeLessThanOrEqual(height);
    if (name === 'desktop') {
      expect(await page.locator('.wz-step').evaluate(el => el.scrollHeight - el.clientHeight)).toBe(0);
      await page.screenshot({ path: testInfo.outputPath('entry.png') });
    }
    const source = await page.evaluate(async () =>
      (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
    await link.click();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
    await expect(page.locator('.wz-modal')).toBeHidden();
    await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
    await expect(page.locator('.ef-stage-error')).toHaveCount(0);
    expect(await page.evaluate(async () =>
      (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template)).toEqual(source);
    if (name !== 'desktop') {
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
      await expect(page.getByTestId('foundation-canvas')).toBeInViewport();
      expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThanOrEqual(250);
      const ruler = page.getByRole('slider', { name: 'Playhead' });
      await ruler.scrollIntoViewIfNeeded();
      const box = (await ruler.boundingBox())!;
      await page.mouse.click(box.x + box.width * .2, box.y + 20);
      expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeGreaterThan(0);
      // Capture the settled graphic after exercising the scrub, just before its Out cue.
      const out = await page.locator('.ef-out').evaluate(el => parseFloat((el as HTMLElement).style.left) / 100);
      await page.mouse.click(box.x + box.width * out - .01, box.y + 20);
      await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
      await page.getByTestId('foundation-canvas').scrollIntoViewIfNeeded();
      const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
      const style = await frame.addStyleTag({ content: '*{will-change:auto !important}' });
      await frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await style.evaluate(el => el.remove());
      await frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      await page.screenshot({ path: testInfo.outputPath(name + '.png'), fullPage: true });
    }
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
    await page.goBack();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
  });
}
