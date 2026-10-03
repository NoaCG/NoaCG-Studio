// covers: src/components/editorFoundation/**
// covers: src/templates/**
import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
test('record existing image surfaces by graphic kind', async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  for (const kind of ['catalog', 'svg', 'f4', 'raster', 'created', 'catalog-logo']) {
    const baseKind = ['raster', 'created', 'catalog-logo'].includes(kind) ? 'catalog' : kind;
    let template = JSON.parse(readFileSync(`docs/research/editor-r1-foundation/fixture-${baseKind}.json`, 'utf8'));
    if (kind === 'raster') template = await page.evaluate(async () => (await import('/src/templates/catalog.ts')).variantById('imp01')!.create({ designArt: { path: '', width: 960, height: 270 } }));
    if (kind === 'created') template = await page.evaluate(async t => (await import('/src/blocks/baseEdits.ts')).createArtwork(t, { shape: 'rectangle', x: 300, y: -500, width: 240, height: 120 }).template, template);
    if (kind === 'catalog-logo') template = await page.evaluate(async () => (await import('/src/templates/catalog.ts')).variantsFor('corner-bug').find(v => v.logo !== 'none')!.create({}));
    await page.evaluate(async template => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(template, { resetSampleData: true }), template);
    await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
    await page.getByRole('button', { name: /^Project / }).click();
    console.log(JSON.stringify({ kind, imageTool: await page.getByRole('button', { name: 'image tool' }).count(), importInput: await page.locator('input[type=file]').count(), assets: await page.getByTestId('assets-panel').count(), files: template.assets.map((a: {path:string}) => a.path), imageParts: await page.evaluate(async () => { const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template; return (await import('/src/model/structure.ts')).getTemplateParts(t.html, t.fields, true).filter(p => p.kind === 'image'); }) }));
    await page.getByRole('button', { name: 'Close Project' }).click();
    const imageSelector = await page.evaluate(async () => { const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template; return (await import('/src/model/structure.ts')).getTemplateParts(t.html, t.fields, true).find(p => p.kind === 'image')?.selector; });
    if (imageSelector) {
      await page.locator(`.ef-track[data-selector="${imageSelector}"] .ef-layer`).first().click();
      console.log(JSON.stringify({ kind, imageSelector, replaceControls: await page.getByRole('button', { name: /Replace image|Replace logo/ }).count() }));
    }
    await page.getByTestId('foundation-canvas').evaluate(el => { const dt = new DataTransfer(); dt.items.add(new File(['invalid image'], 'probe.png', { type: 'image/png' })); el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: 800, clientY: 400 })); });
    expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.assets.length)).toBe(template.assets.length);
  }
});
