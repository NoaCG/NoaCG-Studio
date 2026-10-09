// covers: src/components/editorFoundation/**, src/components/AssetsPanel.tsx
// covers: src/blocks/{editorImages,assetOps,baseEdits,designLayout,edit}.ts, src/assets/{fileImport,imageImport,assetUtils}.ts
// covers: src/templates/**
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { pickDesign } from './_browse';
import type { SpxTemplate } from '../src/model/types';
import { settleDurableWrites } from './_durable';

async function ready(page: Page) { await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false'); }
async function source(page: Page) { return page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template); }
async function open(page: Page, fixture?: string) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  if (fixture) await page.evaluate(async t => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true }), JSON.parse(readFileSync(`docs/research/editor-r1-foundation/fixture-${fixture}.json`, 'utf8')) as SpxTemplate);
  await ready(page);
}
async function picture(page: Page, name = 'logo.png', color = 'red', w = 240, h = 120) {
  const data = await page.evaluate(({ color, w, h }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d')!.fillStyle = color; c.getContext('2d')!.fillRect(0, 0, w, h); return c.toDataURL('image/png').split(',')[1]; }, { color, w, h });
  return { name, mimeType: 'image/png', buffer: Buffer.from(data, 'base64') };
}
async function select(page: Page, selector: string) { await page.locator(`.ef-track[data-selector="${selector}"] .ef-layer`).first().click(); await ready(page); }
async function undo(page: Page) { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); }
async function preview(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }

test('Image opens Assets; atomic import, byte deduplication, collisions, rename and safe delete each undo', async ({ page }) => {
  await open(page, 'catalog');
  const original = await source(page);
  await page.getByRole('button', { name: 'image tool' }).click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
  const first = await picture(page), second = await picture(page, 'logo.png', 'blue');
  await page.getByTestId('assets-import-input').setInputFiles([first, first, second]);
  await expect.poll(async () => (await source(page)).assets.length).toBe(original.assets.length + 2);
  expect((await source(page)).html).toBe(original.html);
  await undo(page); expect(await source(page)).toEqual(original);
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const paths = (await source(page)).assets.filter(a => !original.assets.some(b => b.path === a.path)).map(a => a.path);
  expect(paths[0]).not.toBe(paths[1]);
  const beforeInvalid = await source(page);
  await page.getByTestId('assets-import-input').setInputFiles([first, { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('broken') }]);
  await expect(page.getByRole('alert')).toContainText(/decode|image/i);
  expect(await source(page)).toEqual(beforeInvalid);
  await page.locator(`[data-testid=asset-row][data-path="${paths[0]}"]`).click();
  await page.getByRole('button', { name: 'Place image', exact: true }).click();
  await ready(page);
  const placed = await source(page);
  expect(placed.html).not.toBe(beforeInvalid.html);
  await page.getByRole('button', { name: /Remove/ }).click();
  await expect(page.getByRole('alert')).toContainText(/used|referenced/i);
  expect(await source(page)).toEqual(placed);
  await page.getByRole('button', { name: /logo.png.*✎/ }).click();
  await page.locator('.asset-rename').fill('sponsor'); await page.locator('.asset-rename').press('Enter');
  await expect.poll(async () => (await source(page)).html.includes('images/sponsor.png')).toBe(true);
  await ready(page);
  await expect.poll(async () => (await (await preview(page)).locator('#' + placed.fields.at(-1)!.field).evaluate(el => (el as HTMLImageElement).naturalWidth))).toBe(240);
  await undo(page); expect(await source(page)).toEqual(placed);
  await undo(page); expect(await source(page)).toEqual(beforeInvalid);
  await page.locator(`[data-testid=asset-row][data-path="${paths[1]}"]`).click();
  await page.getByRole('button', { name: /Remove/ }).click();
  await expect.poll(async () => (await source(page)).assets.some(a => a.path === paths[1])).toBe(false);
  await undo(page); expect(await source(page)).toEqual(beforeInvalid);
});

for (const kind of ['catalog', 'svg', 'f4']) test(`${kind}: file chooser creates and replaces an image, fit and undo preserve source`, async ({ page }) => {
  await open(page, kind);
  const original = await source(page);
  await page.getByTestId('image-add-input').setInputFiles(await picture(page));
  await ready(page);
  await expect.poll(async () => (await source(page)).assets.length).toBe(original.assets.length + 1);
  const selector = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts[0]);
  await select(page, selector);
  const added = await source(page);
  const frame = await preview(page);
  const box = await frame.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return [r.width, r.height]; });
  expect(box[0]).toBeGreaterThan(0); expect(box[1]).toBeGreaterThan(0);
  expect(await frame.locator(selector).evaluate(el => {
    for (let node: Element | null = el; node; node = node.parentElement) {
      const style = getComputedStyle(node); if (style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    return true;
  })).toBe(true);
  await page.getByTestId('image-replace-input').setInputFiles(await picture(page, 'portrait.png', 'blue', 80, 240));
  await expect.poll(async () => (await source(page)).assets.length).toBe(added.assets.length + 1);
  await ready(page);
  await expect.poll(() => frame.locator(selector).evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(80);
  expect(await frame.locator(selector).evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
  const replaced = await source(page);
  expect(replaced.js).toBe(added.js);
  await undo(page); expect(await source(page)).toEqual(added);
  await expect.poll(() => frame.locator(selector).evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(240);
  await undo(page); expect(await source(page)).toEqual(original);
});

test('catalog opened through template search offers image creation', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click();
  await page.getByTestId('wz-finish-edit-artwork').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await ready(page);
  await expect(page.getByRole('button', { name: 'image tool' })).toBeVisible();
  const initial = await source(page);
  await page.getByTestId('image-add-input').setInputFiles(await picture(page, 'sponsor.png', '#24caa5', 480, 240));
  await expect.poll(async () => (await source(page)).fields.length).toBe(initial.fields.length + 1); await ready(page);
  const selector = '#' + (await source(page)).fields.at(-1)!.field;
  await select(page, selector);
  await page.getByText('Edit base values (preserve motion)', { exact: true }).click();
  const x = page.getByRole('textbox', { name: /^Base (Position|Layout offset) X$/ });
  await x.fill('720'); await x.press('Enter');
  await expect.poll(async () => (await source(page)).css.includes('720px')).toBe(true); await ready(page);
  await page.getByTestId('image-replace-input').setInputFiles(await picture(page, 'portrait.png', '#fc8d36', 80, 240));
  await expect.poll(async () => (await (await preview(page)).locator(selector).evaluate(el => (el as HTMLImageElement).naturalWidth))).toBe(80);
  await undo(page);
  await expect.poll(async () => (await (await preview(page)).locator(selector).evaluate(el => (el as HTMLImageElement).naturalWidth))).toBe(480);
  await page.getByRole('button', { name: 'image tool' }).click();
  await page.locator('[data-testid=asset-row][data-path="images/sponsor.png"]').click();
  await page.locator('.ef-inspector').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({ path: test.info().outputPath('catalog-created-image.png'), fullPage: true });
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.screenshot({ path: test.info().outputPath('laptop-assets.png'), fullPage: true });
  expect(await page.getByRole('alert').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('OS drop and chooser produce the same source; asset drag and a drop over an image always add layers', async ({ page, context }) => {
  await open(page, 'catalog');
  const original = await source(page), file = await picture(page);
  await page.getByTestId('image-add-input').setInputFiles(file);
  await expect.poll(async () => (await source(page)).assets.length).toBe(1); await ready(page);
  const chosen = await source(page);
  const dropped = await context.newPage(); await open(dropped, 'catalog');
  const stage = (await dropped.locator('.ef-artboard').boundingBox())!, x = stage.x + stage.width / 2, y = stage.y + stage.height / 2;
  expect(await dropped.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest('[data-testid=foundation-canvas]'), { x, y })).toBe(true);
  const drop = async () => dropped.getByTestId('foundation-canvas').evaluate((el, payload) => {
    const dt = new DataTransfer(); dt.items.add(new File([Uint8Array.from(atob(payload.data), c => c.charCodeAt(0))], 'logo.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: payload.x, clientY: payload.y }));
  }, { data: file.buffer.toString('base64'), x, y });
  await drop(); await expect.poll(async () => (await source(dropped)).assets.length).toBe(1); await ready(dropped);
  const first = await source(dropped);
  expect(first.html).toBe(chosen.html); expect(first.js).toBe(chosen.js); expect(first.assets).toEqual(chosen.assets);
  // DragEvent coordinates are integer screen pixels; Fit can turn that rounding into
  // several composition pixels. Apart from placement the source must be identical.
  const withoutPosition = (css: string) => css.replace(/(left|top):\s*-?[\d.]+px/g, '$1: POSITION');
  expect(withoutPosition(first.css)).toBe(withoutPosition(chosen.css));
  const field = first.fields.at(-1)!.field;
  const measured = await (await preview(dropped)).locator('#' + field).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const fit = stage.width / 1920;
  expect(Math.abs(measured.x - 960)).toBeLessThanOrEqual(1 / fit + .5); expect(Math.abs(measured.y - 540)).toBeLessThanOrEqual(1 / fit + .5);
  const pivot = await (await preview(dropped)).locator('#fw' + field.slice(1)).evaluate(el => { const r = el.getBoundingClientRect(), o = getComputedStyle(el).transformOrigin.split(' ').map(parseFloat); return [o[0] - r.width / 2, o[1] - r.height / 2]; });
  expect(pivot.every(n => Math.abs(n) < .1)).toBe(true);
  await drop(); await expect.poll(async () => (await source(dropped)).fields.length).toBe(first.fields.length + 1); await ready(dropped);
  expect((await source(dropped)).assets).toEqual(first.assets); expect((await source(dropped)).fields.find(f => f.field === field)).toEqual(first.fields.at(-1));
  await undo(dropped); expect(await source(dropped)).toEqual(first);
  await dropped.getByTestId('foundation-canvas').evaluate((el, payload) => { const dt = new DataTransfer(); dt.setData('application/x-noacg-asset', payload.path); el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientX: payload.x, clientY: payload.y })); }, { path: first.assets[0].path, x, y });
  await expect.poll(async () => (await source(dropped)).fields.length).toBe(first.fields.length + 1); await ready(dropped);
  await undo(dropped); expect(await source(dropped)).toEqual(first);
  await undo(dropped); expect(await source(dropped)).toEqual(original);
  await dropped.close();
});

for (const kind of ['catalog-logo', 'svg', 'raster']) test(`${kind}: replace existing artwork with aspect-preserving fit`, async ({ page }) => {
  await open(page, kind === 'svg' ? 'svg' : 'catalog');
  if (kind !== 'svg') await page.evaluate(async kind => {
    const catalog = await import('/src/templates/catalog.ts');
    const template = kind === 'catalog-logo' ? catalog.variantsFor('corner-bug').find(v => v.logo !== 'none')!.create({}) : catalog.variantById('imp01')!.create({ designArt: { path: 'images/art.png', width: 960, height: 270 } });
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
  }, kind);
  const selector = kind === 'svg' ? '#Crest' : kind === 'raster' ? '.imported-design-art' : '#f1';
  if (kind === 'raster') {
    const file = await picture(page, 'art.png', 'red', 960, 270);
    await page.evaluate(async data => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, assets: [{ path: 'images/art.png', data: 'data:image/png;base64,' + data }] }); }, file.buffer.toString('base64'));
  }
  await ready(page); await select(page, selector);
  const before = await source(page), frame = await preview(page);
  // A catalog logo is empty until its first operator value; its slot still has a box.
  await page.getByTestId('image-replace-input').setInputFiles(await picture(page, 'portrait.png', 'blue', 80, 240));
  await expect.poll(async () => (await source(page)).assets.length).toBe(before.assets.length + 1); await ready(page);
  if (kind === 'svg') expect(await frame.locator(selector).getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');
  else expect(await frame.locator(selector).evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
  expect((await source(page)).js).toBe(before.js);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('guards refuse unsupported sources, invalid geometry, missing assets and preserve unknown motion', async ({ page }) => {
  await open(page, 'catalog');
  const result = await page.evaluate(async () => {
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { placeGraphicImage, imageCapability } = await import('/src/blocks/editorImages.ts');
    const { locateAnimData } = await import('/src/blocks/animData.ts');
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    const t = { ...s.template, assets: [{ path: 'images/a.png', data: 'data:image/png;base64,AA==' }] };
    const errors: Record<string, string> = {}; let name = '';
    const check = (fn: () => unknown) => { try { fn(); errors[name] = 'DID NOT REFUSE'; } catch (e) { errors[name] = String(e); } };
    name = 'element';
    check(() => applyOperations(t, [{ kind: 'image.replace', selector: '#f0', assetPath: 'images/a.png' }]));
    name = 'missing'; check(() => placeGraphicImage(t, 'images/missing.png', { x: 0, y: 0, width: 20, height: 20 }, 0));
    name = 'geometry';
    check(() => placeGraphicImage(t, 'images/a.png', { x: NaN, y: 0, width: 20, height: 20 }, 0));
    name = 'timeline'; check(() => placeGraphicImage({ ...t, js: '' }, 'images/a.png', { x: 0, y: 0, width: 20, height: 20 }, 0));
    const custom = placeGraphicImage(t, 'images/a.png', { x: 0, y: 0, width: 20, height: 20 }, 0);
    const withSrcset = { ...custom.template, html: custom.template.html.replace('<img id=', '<img srcset="images/a.png 2x" id=') };
    errors.srcset = imageCapability(withSrcset, custom.selector).reason;
    const imageField = custom.selector.slice(1);
    errors.field = imageCapability({ ...custom.template, fields: custom.template.fields.map(f => f.field === imageField ? { ...f, ftype: 'textfield' as const } : f) }, custom.selector).reason;
    errors.driven = imageCapability({ ...custom.template, fields: [], js: custom.template.js + '\ndocument.getElementById("' + imageField + '").src = "elsewhere.png";' }, custom.selector).reason;
    const location = locateAnimData(t.js)!;
    const literal = JSON.parse(t.js.slice(location.start, location.end)); literal.futureMotion = true;
    name = 'unknown'; check(() => placeGraphicImage({ ...t, js: t.js.slice(0, location.start) + JSON.stringify(literal) + t.js.slice(location.end) }, 'images/a.png', { x: 0, y: 0, width: 20, height: 20 }, 0));
    name = 'box'; check(() => applyOperations(custom.template, [{ kind: 'image.replace', selector: custom.selector, assetPath: 'images/a.png', box: { width: 0, height: 20 } }]));
    return errors;
  });
  for (const [key, pattern] of Object.entries({ element: /not a replaceable/, missing: /image asset/, geometry: /positive finite/, timeline: /timeline/, srcset: /responsive/, field: /field type/, driven: /driven by code/, unknown: /preserve exactly/, box: /box to render/ })) expect(result[key], key).toMatch(pattern);
});

test('Escape, failed reads and stale revisions discard a whole file batch', async ({ page }) => {
  await open(page, 'catalog');
  const file = await picture(page);
  for (const mode of ['escape', 'stale', 'failed']) {
    const before = await source(page);
    await page.evaluate(() => {
      const host = window as unknown as { releaseRead: () => void; readFinished: boolean };
      host.readFinished = false;
      const original = FileReader.prototype.readAsDataURL, decode = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = async function () { await decode.call(this); host.readFinished = true; HTMLImageElement.prototype.decode = decode; };
      FileReader.prototype.readAsDataURL = function (blob) { FileReader.prototype.readAsDataURL = original; host.releaseRead = original.bind(this, blob); };
    });
    await page.getByTestId('image-add-input').setInputFiles(file);
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseRead?: unknown }).releaseRead)).toBe('function');
    if (mode === 'escape') await page.keyboard.press('Escape');
    if (mode === 'stale') await page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, css: s.template.css + '\n/* another edit */' }); });
    const expected = await source(page);
    if (mode === 'failed') {
      await page.evaluate(() => { const host = window as unknown as { releaseRead: () => void }; host.releaseRead = () => {}; });
      // A separate reader failure must also roll back a valid earlier file in the batch.
      await page.getByTestId('image-add-input').setInputFiles([file, { name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('bad') }]);
      await expect(page.getByRole('alert')).toContainText('decoded');
    } else {
      await page.evaluate(() => (window as unknown as { releaseRead: () => void }).releaseRead());
      await expect.poll(() => page.evaluate(() => (window as unknown as { readFinished: boolean }).readFinished)).toBe(true);
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
      if (mode === 'stale') await expect(page.getByRole('alert')).toContainText('changed');
    }
    expect(await source(page)).toEqual(expected);
    if (mode !== 'stale') expect(expected).toEqual(before);
  }
});

test('file validation guards refuse invalid resource batches and failed reads', async ({ page }) => {
  await open(page, 'catalog');
  const errors = await page.evaluate(async () => {
    const { readAssetFiles, imageSize } = await import('/src/assets/fileImport.ts');
    const resolution = { width: 1920, height: 1080 }, errors: Record<string, string> = {};
    const check = async (name: string, fn: () => Promise<unknown>) => { try { await fn(); errors[name] = 'DID NOT REFUSE'; } catch (error) { errors[name] = String(error); } };
    const file = new File(['{"v":"1","layers":[],"w":100,"h":100}'], 'art.json');
    await check('empty', () => readAssetFiles([], resolution));
    await check('batch', () => readAssetFiles(Array.from({ length: 101 }, () => file), resolution));
    await check('imageOnly', () => readAssetFiles([file], resolution, true));
    await check('format', () => readAssetFiles([new File(['hello'], 'text.txt')], resolution));
    await check('video', () => readAssetFiles([new File([new Uint8Array(3 * 1024 * 1024 + 1)], 'huge.mp4')], resolution));
    await check('lottie', () => readAssetFiles([new File(['{}'], 'bad.json')], resolution));
    await check('font', () => readAssetFiles([new File(['broken'], 'bad.woff2')], resolution));
    await check('decode', () => readAssetFiles([new File(['broken'], 'bad.png')], resolution));
    const original = FileReader.prototype.readAsDataURL;
    FileReader.prototype.readAsDataURL = function () { this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>); };
    await check('read', () => readAssetFiles([file], resolution));
    FileReader.prototype.readAsDataURL = original;
    const OriginalImage = window.Image;
    window.Image = class { src = ''; naturalWidth = 0; naturalHeight = 0; async decode() {} } as unknown as typeof Image;
    await check('zero', () => imageSize('data:image/png;base64,AA=='));
    window.Image = class { src = ''; naturalWidth = 20; naturalHeight = 20; async decode() { throw new Error('decode failed'); } } as unknown as typeof Image;
    await check('decodePromise', () => imageSize('data:image/png;base64,AA=='));
    window.Image = OriginalImage;
    return errors;
  });
  for (const [key, pattern] of Object.entries({ empty: /between/, batch: /between/, imageOnly: /choose an image/, format: /unsupported/, video: /3 MB/, lottie: /not a Lottie/, font: /font could not/, decode: /decoded/, read: /null/, zero: /decoded/, decodePromise: /decoded/ })) expect(errors[key], key).toMatch(pattern);
});

test('SVG, font and Lottie resource import stays separate from placement and binds SVG extension', async ({ page }) => {
  await open(page, 'catalog'); const before = await source(page);
  await page.getByRole('button', { name: 'image tool' }).click();
  await page.getByTestId('assets-import-input').setInputFiles([
    { name: 'mark.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="90" height="180"><rect width="90" height="180" fill="cyan"/></svg>') },
    { name: 'brand.woff2', mimeType: 'font/woff2', buffer: readFileSync('public/fonts/space-grotesk.woff2') },
    { name: 'motion.json', mimeType: 'application/json', buffer: Buffer.from('{"v":"5.7","w":100,"h":100,"layers":[],"ip":0,"op":25,"fr":25}') },
  ]);
  await expect.poll(async () => (await source(page)).assets.length).toBe(before.assets.length + 3);
  expect((await source(page)).html).toBe(before.html);
  await page.locator('[data-path="fonts/brand.woff2"][data-testid=asset-row]').click();
  expect(await page.getByRole('button', { name: 'Place image', exact: true }).count()).toBe(0);
  await page.locator('[data-path="images/mark.svg"][data-testid=asset-row]').click();
  await page.getByRole('button', { name: 'Place image', exact: true }).click();
  await expect.poll(async () => (await source(page)).fields.length).toBe(before.fields.length + 1); await ready(page);
  expect((await source(page)).fields.at(-1)!.extension).toBe('svg');
  const field = (await source(page)).fields.at(-1)!.field;
  await expect.poll(async () => (await (await preview(page)).locator('#' + field).evaluate(el => (el as HTMLImageElement).naturalWidth))).toBe(90);
  await undo(page); await undo(page); expect(await source(page)).toEqual(before);
});

test('Escape also cancels existing-asset placement and replacement after decode begins', async ({ page }) => {
  await open(page, 'catalog');
  await page.getByTestId('image-add-input').setInputFiles(await picture(page));
  await expect.poll(async () => (await source(page)).assets.length).toBe(1); await ready(page);
  const field = (await source(page)).fields.at(-1)!.field; await select(page, '#' + field);
  await page.getByRole('button', { name: 'image tool' }).click();
  await page.getByTestId('assets-import-input').setInputFiles(await picture(page, 'blue.png', 'blue', 80, 240));
  await expect.poll(async () => (await source(page)).assets.length).toBe(2);
  await page.locator('[data-path="images/blue.png"][data-testid=asset-row]').click();
  for (const button of ['Place image', 'Replace selected image']) {
    const before = await source(page);
    await page.evaluate(() => {
      const host = window as unknown as { releaseDecode?: () => void; decodeDone: boolean };
      delete host.releaseDecode; host.decodeDone = false;
      const original = HTMLImageElement.prototype.decode;
      HTMLImageElement.prototype.decode = function () {
        HTMLImageElement.prototype.decode = original;
        return new Promise<void>(resolve => { host.releaseDecode = async () => { await original.call(this); host.decodeDone = true; resolve(); }; });
      };
    });
    await page.getByRole('button', { name: button, exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseDecode: unknown }).releaseDecode)).toBe('function');
    await page.keyboard.press('Escape');
    await page.evaluate(() => (window as unknown as { releaseDecode: () => void }).releaseDecode());
    await expect.poll(() => page.evaluate(() => (window as unknown as { decodeDone: boolean }).decodeDone)).toBe(true);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(await source(page)).toEqual(before);
  }
});

test('a canvas drop waits for pending drawing-space measurement instead of discarding the gesture', async ({ page }) => {
  await open(page, 'catalog'); const file = await picture(page);
  await page.evaluate(async () => {
    const { PreviewController } = await import('/src/components/editorFoundation/PreviewController.ts');
    const original = PreviewController.prototype.load;
    PreviewController.prototype.load = function (...args) {
      PreviewController.prototype.load = original;
      return new Promise<void>((resolve, reject) => {
        (window as unknown as { releasePreview: () => void }).releasePreview = () => { void original.apply(this, args).then(resolve, reject); };
      });
    };
    const state = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    state.applyTemplate({ ...state.template, css: state.template.css + '\n/* held preview measurement */' });
  });
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releasePreview: unknown }).releasePreview)).toBe('function');
  const before = await source(page), stage = (await page.locator('.ef-artboard').boundingBox())!;
  await page.getByTestId('foundation-canvas').evaluate((el, payload) => {
    const data = new DataTransfer(); data.items.add(new File([Uint8Array.from(atob(payload.bytes), c => c.charCodeAt(0))], 'logo.png', { type: 'image/png' }));
    el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data, clientX: payload.x, clientY: payload.y }));
  }, { bytes: file.buffer.toString('base64'), x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 });
  expect(await source(page)).toEqual(before);
  await page.evaluate(() => (window as unknown as { releasePreview: () => void }).releasePreview());
  await expect.poll(async () => (await source(page)).assets.length).toBe(before.assets.length + 1); await ready(page);
  await undo(page); expect(await source(page)).toEqual(before);
});

test('saved image and its binding reopen and execute in SPX, CasparCG and OGraf', async ({ page }) => {
  await open(page, 'catalog');
  await page.getByTestId('image-add-input').setInputFiles(await picture(page));
  await expect.poll(async () => (await source(page)).assets.length).toBe(1); await ready(page);
  const edited = await source(page), field = edited.fields.at(-1)!.field;
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Image export proof');
  await page.getByTestId('save-confirm').click(); await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await settleDurableWrites(page); await page.reload(); await ready(page);
  const reopened = await source(page);
  expect(reopened.html).toBe(edited.html); expect(reopened.css).toBe(edited.css); expect(reopened.assets).toEqual(edited.assets); expect(reopened.fields).toEqual(edited.fields);
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async target => {
      const template = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(template);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    // CasparCG is a single-file package, embedding the bytes instead of external assets.
    if (target === 'casparcg') expect(Buffer.from(files[Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel'))!], 'base64').toString()).toContain(edited.assets[0].data);
    else expect(files['images/logo.png']).toBeTruthy();
    const view = await page.context().newPage();
    await view.route('http://image-output.local/**', route => {
      const file = new URL(route.request().url()).pathname.slice(1);
      const content = files[file];
      return content ? route.fulfill({ status: 200, contentType: /\.m?js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.png$/.test(file) ? 'image/png' : /\.css$/.test(file) ? 'text/css' : 'application/octet-stream', body: Buffer.from(content, 'base64') }) : route.fulfill({ status: file ? 404 : 200, contentType: 'text/html', body: '<html><body></body></html>' });
    });
    if (target === 'ograf') {
      const manifest = JSON.parse(Buffer.from(files[Object.keys(files).find(n => n.endsWith('.ograf.json'))!], 'base64').toString());
      expect(manifest.schema.properties[field]).toBeTruthy();
      await view.goto('http://image-output.local/');
      await view.evaluate(async ({ field }) => {
        const mod = await import('http://image-output.local/graphic.mjs'); customElements.define('image-graphic', mod.default);
        const el = document.createElement('image-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; updateAction(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> };
        document.body.appendChild(el); await el.load({ data: {} }); await el.updateAction({ data: { [field]: 'images/logo.png' } }); await el.playAction({});
      }, { field });
    } else {
      await view.goto('http://image-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
      // The single-file CasparCG picker sends embedded bytes; folder packages send paths.
      await view.evaluate(({ field, value }) => { const host = window as unknown as { update(s: string): void; play(): void }; host.update(JSON.stringify({ [field]: value })); host.play(); }, { field, value: target === 'casparcg' ? edited.assets[0].data as string : 'images/logo.png' });
    }
    await expect.poll(() => view.locator('#' + field).evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(240);
    expect(await view.locator('#' + field).evaluate(el => getComputedStyle(el).objectFit)).toBe('contain');
    await view.close();
  }
});
