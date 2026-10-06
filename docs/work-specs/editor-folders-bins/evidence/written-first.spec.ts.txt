// covers: src/components/AssetsPanel.tsx, src/components/editorFoundation/**, src/blocks/editorOrganization.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SpxTemplate } from '../src/model/types';
import type { EditorOperation } from '../src/components/editorFoundation/operations';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';

const ready = async (page: Page) => expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
const source = (page: Page) => evaluateInPage(page, async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const selection = (page: Page) => evaluateInPage(page, async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
async function execute(page: Page, operations: unknown[]) {
  const result = await evaluateInPage(page, async operations => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    return session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: operations as EditorOperation[] });
  }, operations);
  await ready(page); return result;
}
async function open(page: Page) {
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await evaluateInPage(page, async t => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(t, { resetSampleData: true }), JSON.parse(readFileSync('docs/research/editor-r1-foundation/fixture-catalog.json', 'utf8')) as SpxTemplate);
  await ready(page);
  return (await execute(page, [
    { kind: 'layer.create', geometry: { shape: 'rectangle', x: 220, y: -390, width: 100, height: 80 } },
    { kind: 'layer.create', geometry: { shape: 'ellipse', x: 370, y: -340, width: 130, height: 60 } },
    { kind: 'layer.create', geometry: { shape: 'rectangle', x: 600, y: -240, width: 70, height: 100 } },
  ])).changedTargets;
}
async function select(page: Page, ids: string[]) {
  await evaluateInPage(page, async ids => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSelectedParts(ids), ids);
}
async function history(page: Page, redo = false) { await page.getByRole('button', { name: redo ? 'Redo' : 'Undo', exact: true }).click(); await ready(page); }
async function folder(page: Page, ids: string[], name: string) {
  await select(page, ids); await page.getByRole('button', { name: 'New layer folder', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Folder name', exact: true });
  await input.fill(name); await input.press('Enter'); await ready(page);
  return page.getByRole('button', { name: 'Folder ' + name, exact: true });
}
const artwork = (t: SpxTemplate) => ({ ...t, html: t.html.replace(/<!-- NOACG_ORGANIZATION [\s\S]*? -->\r?\n?/g, '') });

test('baseline existing groups navigate locally without changing source', async ({ page }) => {
  const ids = await open(page); await select(page, ids.slice(0, 2));
  await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  const grouped = await source(page);
  await page.getByRole('button', { name: 'Enter group', exact: true }).click();
  await expect(page.getByTestId('foundation-parent-bar')).toBeVisible();
  await page.getByRole('navigation', { name: 'Group breadcrumbs' }).getByRole('button', { name: 'Composition', exact: true }).click();
  expect(await source(page)).toEqual(grouped);
});

test('folders organize, rename, collapse, nest and release with exact artwork and history', async ({ page }) => {
  const ids = await open(page), before = await source(page);
  const row = await folder(page, ids.slice(0, 2), 'Accents');
  expect(artwork(await source(page))).toEqual(before);
  await select(page, [ids[0]]);
  await page.getByRole('button', { name: 'Collapse folder Accents', exact: true }).click();
  await expect(page.locator(`.ef-track[data-selector="${ids[0]}"]`)).toHaveCount(0);
  expect(await selection(page)).toEqual([ids[0]]);
  await page.getByRole('button', { name: 'Expand folder Accents', exact: true }).click();
  await row.dblclick(); const input = page.getByRole('textbox', { name: 'Folder name' });
  await input.fill('Cancelled'); await input.press('Escape'); await expect(row).toBeVisible();
  await row.focus(); await row.press('Enter'); await input.fill('Badge'); await input.press('Enter');
  const renamed = await source(page); await history(page); await expect(row).toBeVisible(); await history(page, true); expect(await source(page)).toEqual(renamed);
  await folder(page, [ids[2]], 'Other');
  await page.getByRole('button', { name: 'Folder Other', exact: true }).click();
  await page.getByRole('combobox', { name: 'Move to layer folder' }).selectOption({ label: 'Badge' });
  await expect(page.locator('.ef-folder-row[data-depth="1"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Remove layer folder' }).click();
  await expect(page.getByRole('button', { name: 'Folder Other', exact: true })).toHaveCount(0);
  expect(artwork(await source(page))).toEqual(before);
});

test('folders coexist with groups and root return is visible', async ({ page }) => {
  const ids = await open(page); await select(page, ids.slice(0, 2));
  await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  const group = (await selection(page))[0]; await folder(page, [group, ids[2]], 'Identity');
  await select(page, [group]); await page.getByRole('button', { name: 'Enter group', exact: true }).click();
  await folder(page, ids.slice(0, 2), 'Members');
  await expect(page.getByTestId('foundation-parent-bar')).toBeVisible();
  await expect(page.getByTestId('foundation-local-ruler')).toContainText('Group local time');
  await page.getByRole('button', { name: 'Back to Composition', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Folder Identity', exact: true })).toBeVisible();
  expect(await selection(page)).toEqual([group]);
});

test('bins persist empty, rename and move references in one exact undo', async ({ page }) => {
  await open(page);
  await execute(page, [{ kind: 'asset.import', assets: [{ path: 'images/mark.svg', data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PHJlY3Qgd2lkdGg9IjIwIiBoZWlnaHQ9IjIwIiBmaWxsPSJyZWQiLz48L3N2Zz4=' }] }]);
  await page.getByRole('button', { name: /^Project/ }).click();
  await page.getByRole('button', { name: 'New asset bin', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Bin name', exact: true }); await input.fill('Sponsors'); await input.press('Enter');
  await page.locator('.asset-row').filter({ hasText: 'mark.svg' }).click();
  await page.getByRole('combobox', { name: 'Asset bin' }).selectOption('Sponsors'); await ready(page);
  const moved = await source(page); expect(moved.assets[0].path).toBe('images/Sponsors/mark.svg');
  await page.getByRole('button', { name: 'Bin Sponsors', exact: true }).dblclick();
  await input.fill('Partners'); await input.press('Enter'); await ready(page);
  expect((await source(page)).assets[0].path).toBe('images/Partners/mark.svg');
  await history(page); expect(await source(page)).toEqual(moved); await history(page, true);
  await page.getByRole('button', { name: 'Collapse bin Partners', exact: true }).click();
  await expect(page.locator('.asset-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Expand bin Partners', exact: true }).click();
  await page.getByRole('combobox', { name: 'Asset bin' }).selectOption(''); await ready(page);
  await expect(page.getByRole('button', { name: 'Bin Partners', exact: true })).toBeVisible();
  const saved = await source(page); await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Folders and bins'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await source(page)).html).toBe(saved.html);
});

test('organization refuses stale revisions, mixed scopes, cycles and partial batches', async ({ page }) => {
  const ids = await open(page);
  await page.getByRole('button', { name: 'New layer folder', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Folder name' }); await input.fill('Stale');
  await execute(page, [{ kind: 'base.set', selector: ids[2], values: { x: 610 } }]);
  const before = await source(page); await input.press('Enter');
  await expect(page.getByRole('alert')).toContainText('changed'); expect(await source(page)).toEqual(before);
  const result = await evaluateInPage(page, async ids => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(); const before = s.port.read(), selected = s.port.view().selectedParts, undo = s.canUndo();
    const run = (operations: unknown[]) => { try { s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: operations as EditorOperation[] }); return ''; } catch (error) { return String(error); } };
    const refusal = run([{ kind: 'folder.create', name: 'Transient', scope: null, members: [ids[0]] }, { kind: 'folder.move', members: ['folder:missing'], folder: null }]);
    return { refusal, unchanged: before === s.port.read(), selected: JSON.stringify(selected) === JSON.stringify(s.port.view().selectedParts), undo: undo === s.canUndo() };
  }, ids);
  expect(result.refusal).not.toBe(''); expect(result.unchanged && result.selected && result.undo).toBe(true);
});

test('real template task uses folders, groups and bins, reopens and executes every export', async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1920, height: 1080 }); await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click(); await pickDesign(page, 'Hairline');
  await page.getByTestId('wz-skip-to-finish').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  const ids: string[] = [];
  for (const [x, y] of [[300, 280], [480, 330]]) {
    await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
    const t = await source(page), box = (await page.locator('.ef-artboard').boundingBox())!;
    const screen = (x: number, y: number) => ({ x: box.x + x / t.resolution.width * box.width, y: box.y + y / t.resolution.height * box.height });
    const a = screen(x, y), b = screen(x + 110, y + 70);
    await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await ready(page); ids.push((await selection(page))[0]);
  }
  await select(page, ids); await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  const group = (await selection(page))[0];
  await folder(page, [group], 'Brand accents'); await select(page, [group]);
  await page.getByRole('textbox', { name: 'Rotation', exact: true }).fill('12'); await page.getByRole('textbox', { name: 'Rotation', exact: true }).press('Enter'); await ready(page);
  await page.getByRole('button', { name: 'Enter group', exact: true }).click(); await folder(page, ids, 'Plates');
  await page.getByRole('button', { name: /^Project/ }).click();
  await page.getByTestId('assets-import-input').setInputFiles({ name: 'sponsor.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="red"/></svg>') });
  await expect(page.locator('.asset-row')).toHaveCount(1);
  await page.getByRole('button', { name: 'New asset bin', exact: true }).click();
  const bin = page.getByRole('textbox', { name: 'Bin name', exact: true }); await bin.fill('Sponsors'); await bin.press('Enter');
  await page.locator('.asset-row').click(); await page.getByRole('combobox', { name: 'Asset bin' }).selectOption('Sponsors'); await ready(page);
  await page.getByRole('button', { name: 'Back to Composition', exact: true }).click();
  await page.getByRole('button', { name: 'Place image', exact: true }).click();
  await expect.poll(() => selection(page)).not.toEqual([group]); await ready(page);
  const image = (await selection(page))[0]; await folder(page, [image], 'Sponsor');
  await page.getByRole('button', { name: 'Close Project', exact: true }).click();
  for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'laptop-125']] as const) {
    await page.setViewportSize({ width, height }); await select(page, [group]); await page.getByRole('button', { name: 'Enter group', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Back to Composition', exact: true })).toBeVisible();
    expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
    await page.screenshot({ path: 'docs/research/editor-r1-2b-7/' + label + '.png', fullPage: true });
    await page.getByRole('button', { name: 'Back to Composition', exact: true }).click();
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
  const beforeSave = await source(page);
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Organized Hairline'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); await page.reload(); await ready(page);
  expect((await source(page)).html).toBe(beforeSave.html); expect((await source(page)).assets).toEqual(beforeSave.assets);
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  const poses = await Promise.all([...ids, image].map(id => frame.locator(id).evaluate(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })));
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await evaluateInPage(page, async target => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    const output = await page.context().newPage(); output.on('pageerror', error => errors.push(error.message)); await output.setViewportSize({ width: 1920, height: 1080 });
    await output.route('http://organization-output.local/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1), content = files[name];
      return content ? route.fulfill({ status: 200, contentType: /\.m?js$/.test(name) ? 'application/javascript' : /\.html$/.test(name) ? 'text/html' : /\.css$/.test(name) ? 'text/css' : /\.svg$/.test(name) ? 'image/svg+xml' : 'application/octet-stream', body: Buffer.from(content, 'base64') }) : route.fulfill({ status: name ? 404 : 200, contentType: 'text/html', body: '<html><body></body></html>' });
    });
    if (target === 'ograf') {
      await output.goto('http://organization-output.local/');
      await output.evaluate(async () => { document.body.style.margin = '0'; const mod = await import('http://organization-output.local/graphic.mjs'); customElements.define('organized-graphic', mod.default); const el = document.createElement('organized-graphic') as HTMLElement & { load(p: unknown): Promise<unknown>; playAction(p: unknown): Promise<unknown> }; document.body.appendChild(el); await el.load({ data: {} }); await el.playAction({}); });
    } else { await output.goto('http://organization-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel'))); await output.evaluate(() => (window as unknown as { play(): void }).play()); }
    for (const [i, id] of [...ids, image].entries()) await expect.poll(() => output.locator(id).evaluate((el, pose) => { const r = el.getBoundingClientRect(); return Math.max(...[r.x, r.y, r.width, r.height].map((n, i) => Math.abs(n - pose[i]))); }, poses[i])).toBeLessThan(.05);
    await expect.poll(() => output.locator(image).evaluate(el => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth)).toBe(20);
    await output.close();
  }
  expect(errors).toEqual([]);
});
