// covers: src/components/AssetsPanel.tsx, src/components/editorFoundation/**, src/blocks/editorOrganization.ts, src/model/editorOrganization.ts, src/blocks/assetOps.ts, src/assets/assetUtils.ts, src/assets/assetInfo.ts
import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { SpxTemplate } from '../src/model/types';
import type { EditorOperation } from '../src/components/editorFoundation/operations';
import { evaluateInPage } from './_evaluate';
import { settleDurableWrites } from './_durable';
import { pickDesign } from './_browse';
import { holdKeyRepeats } from './_keys';

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
  await page.locator('.asset-row').click();
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

test('nested bin renames refuse occupied moving paths without changing source or history', async ({ page }) => {
  await open(page);
  await execute(page, [{ kind: 'asset.import', assets: [{ path: 'images/A/C/red.svg', data: 'data:image/svg+xml;base64,PHN2Zy8+' }, { path: 'images/A/B/C/red.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }, { kind: 'bin.create', dir: 'images/A' }]);
  const result = await evaluateInPage(page, async () => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const before = s.port.read(), revision = s.version(), canUndo = s.canUndo(), view = JSON.stringify(s.port.view()); let refusal = '';
    try { s.execute({ documentId: s.documentId, expected: revision, transactionId: crypto.randomUUID(), operations: [{ kind: 'bin.rename', from: 'images/A', to: 'images/A/B' }] }); } catch (cause) { refusal = String(cause); }
    return { refusal, unchanged: s.port.read() === before && JSON.stringify(s.version()) === JSON.stringify(revision) && JSON.stringify(s.port.view()) === view && s.canUndo() === canUndo };
  });
  expect(result.refusal).toContain('collide'); expect(result.unchanged).toBe(true);
});

test('asset moves preserve folder labels and retain emptied inferred bins in one history receipt', async ({ page }) => {
  const ids = await open(page), label = 'images/First/red.svg';
  await execute(page, [{ kind: 'asset.import', assets: [{ path: label, data: 'data:image/svg+xml;base64,PHN2Zy8+' }] }, { kind: 'bin.create', dir: 'images/Second' }]);
  await folder(page, [ids[0]], label);
  await page.getByRole('button', { name: /^Project/ }).click(); await page.locator('.asset-row').click();
  const before = await source(page); await page.getByRole('combobox', { name: 'Asset bin' }).selectOption('Second'); await ready(page);
  const moved = await source(page), organization = await evaluateInPage(page, async () => (await import('/src/model/editorOrganization.ts')).readOrganization((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  expect({ label: organization.folders[0].name, retained: organization.bins.includes('images/First') }).toEqual({ label, retained: true });
  expect(moved.assets[0].path).toBe('images/Second/red.svg'); expect(moved.assets[0].data).toBe(before.assets[0].data);
  await history(page); expect(await source(page)).toEqual(before); await history(page, true); expect(await source(page)).toEqual(moved);
  await expect(page.getByRole('button', { name: 'Bin First', exact: true })).toBeVisible();
  await execute(page, [{ kind: 'asset.delete', path: moved.assets[0].path }]);
  const deleted = await source(page);
  expect(deleted.assets).toEqual([]);
  expect(await evaluateInPage(page, async () => (await import('/src/model/editorOrganization.ts')).readOrganization((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template).folders[0].name)).toBe(label);
  await expect(page.getByRole('button', { name: 'Bin Second', exact: true })).toBeVisible();
  await history(page); expect(await source(page)).toEqual(moved); await history(page, true); expect(await source(page)).toEqual(deleted);
});

test('folder guards refuse mixed group scopes and cycles; inline keys and names preserve artwork', async ({ page }) => {
  const ids = await open(page);
  await folder(page, ids.slice(0, 2), 'A'); await folder(page, [ids[2]], 'B');
  const before = await source(page);
  const verdicts = await evaluateInPage(page, async ids => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const { readOrganization } = await import('/src/model/editorOrganization.ts'); const [a, b] = readOrganization(s.port.read()).folders;
    const run = (operations: unknown[]) => { try { s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: operations as EditorOperation[] }); return ''; } catch (error) { return String(error); } };
    const move = run([{ kind: 'folder.move', members: [b.id], folder: a.id }]);
    const moved = s.port.read(); const cycle = run([{ kind: 'folder.move', members: [a.id], folder: b.id }]);
    const cycleExact = moved === s.port.read(); s.undo();
    const grouped = s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'group.create', selectors: ids.slice(0, 2), box: { x: 220, y: -390, width: 280, height: 110 } }] });
    const current = s.port.read(); const mixed = run([{ kind: 'folder.create', scope: null, name: 'Mixed', members: [ids[0], ids[2]] }]);
    const mixedExact = current === s.port.read(); s.undo();
    return { move, cycle, cycleExact, mixed, mixedExact, grouped: grouped.changedTargets.length };
  }, ids);
  expect(verdicts.move).toBe(''); expect(verdicts.cycle).toContain('contain'); expect(verdicts.cycleExact).toBe(true);
  expect(verdicts.mixed).toContain('same group'); expect(verdicts.mixedExact).toBe(true); expect(await source(page)).toEqual(before);
  const row = page.getByRole('button', { name: 'Folder A', exact: true }); await row.dblclick();
  const input = page.getByRole('textbox', { name: 'Folder name' }), clock = await page.getByTestId('foundation-clock').textContent();
  await holdKeyRepeats(page, 3, 'ArrowRight', 'ArrowRight'); await input.press('Delete'); await input.press('Space'); await input.press('Escape');
  expect(await source(page)).toEqual(before); expect(await page.getByTestId('foundation-clock').textContent()).toBe(clock);
  await row.dblclick(); await input.fill('Plate --> <dark>'); await input.press('Enter'); await ready(page);
  expect(artwork(await source(page))).toEqual(artwork(before));
  await expect(page.getByRole('button', { name: 'Folder Plate --> <dark>', exact: true })).toBeVisible();
});

test('grouping and exact ungroup retain outer and local folder membership', async ({ page }) => {
  const ids = await open(page); await folder(page, ids, 'Outer');
  await select(page, ids.slice(0, 2)); await page.getByRole('button', { name: 'Group selection', exact: true }).click(); await ready(page);
  const group = (await selection(page))[0], grouped = await source(page);
  await page.getByRole('button', { name: 'Enter group', exact: true }).click(); await folder(page, ids.slice(0, 2), 'Local');
  await page.getByRole('button', { name: 'Back to Composition', exact: true }).click(); await select(page, [group]);
  await page.getByRole('button', { name: 'Ungroup selection', exact: true }).click(); await ready(page);
  await expect(page.getByRole('button', { name: 'Folder Local', exact: true })).toBeVisible();
  await expect(page.locator(`.ef-track[data-selector="${ids[0]}"]`)).toHaveCount(1);
  const folders = await evaluateInPage(page, async () => (await import('/src/model/editorOrganization.ts')).readOrganization((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template).folders);
  expect(folders.find(folder => folder.name === 'Local')?.scope).toBeNull();
  expect(folders.find(folder => folder.name === 'Local')?.parent).toBe(folders.find(folder => folder.name === 'Outer')?.id);
  expect(folders.find(folder => folder.name === 'Outer')?.members).toEqual([ids[2]]);
  await history(page); await history(page); expect(await source(page)).toEqual(grouped);
});

test('bin rename retains field defaults, live samples, bytes and rejects collisions and stale asset revisions', async ({ page }) => {
  await open(page);
  const data = (color: string) => 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20"><rect width="20" height="20" fill="' + color + '"/></svg>').toString('base64');
  await execute(page, [{ kind: 'asset.import', assets: [{ path: 'images/First/red.svg', data: data('red') }, { path: 'images/Second/blue.svg', data: data('blue') }] }, { kind: 'image.place', assetPath: 'images/First/red.svg', geometry: { x: 250, y: -250, width: 40, height: 40 }, time: .1 }]);
  const before = await source(page);
  const refusal = await evaluateInPage(page, async () => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(), before = s.port.read();
    let message = ''; try { s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'bin.rename', from: 'images/First', to: 'images/Second' }] }); } catch (cause) { message = String(cause); }
    return { message, exact: before === s.port.read() };
  });
  expect(refusal.message).toContain('already exists'); expect(refusal.exact).toBe(true);
  await execute(page, [{ kind: 'bin.rename', from: 'images/First', to: 'images/Brand' }]);
  const renamed = await source(page), field = renamed.fields.find(field => field.value === 'images/Brand/red.svg')!;
  expect(field).toBeTruthy(); expect(renamed.assets.map(asset => asset.data)).toEqual(before.assets.map(asset => asset.data));
  expect(await evaluateInPage(page, async name => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData[name], field.field)).toBe('images/Brand/red.svg');
  await history(page); expect(await source(page)).toEqual(before); await history(page, true); expect(await source(page)).toEqual(renamed);
  await page.getByRole('button', { name: /^Project/ }).click(); await page.getByRole('button', { name: 'Bin Brand', exact: true }).dblclick();
  const input = page.getByRole('textbox', { name: 'Bin name' }); await input.fill('Stale');
  await execute(page, [{ kind: 'asset.import', assets: [{ path: 'images/new.svg', data: data('green') }] }]);
  const current = await source(page); await input.press('Enter'); await expect(page.getByRole('alert')).toContainText('changed'); expect(await source(page)).toEqual(current);
});

test('folder ordering changes editor order only; unknown metadata remains read-only', async ({ page }) => {
  const ids = await open(page), original = await source(page); await folder(page, [ids[0]], 'One'); await folder(page, [ids[1]], 'Two');
  await page.getByRole('button', { name: 'Move folder up', exact: true }).click();
  await expect(page.locator('.ef-folder-row .ef-layer')).toHaveText([/TwoFolder$/, /OneFolder$/]);
  expect(artwork(await source(page))).toEqual(original);
  await history(page); await expect(page.locator('.ef-folder-row .ef-layer')).toHaveText([/OneFolder$/, /TwoFolder$/]);
  await evaluateInPage(page, async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, html: s.template.html.replace('"version":1', '"version":99') }); });
  await expect(page.getByRole('button', { name: 'New layer folder' })).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('unsupported organization metadata');
});

test('folder creation undo and redo restore the atomic artwork selection', async ({ page }) => {
  const ids = await open(page); await select(page, ids.slice(0, 2));
  await folder(page, ids.slice(0, 2), 'Selection'); expect(await selection(page)).toEqual([]);
  await history(page); expect(await selection(page)).toEqual(ids.slice(0, 2));
  await history(page, true); expect(await selection(page)).toEqual([]);
});

test('unsupported organization metadata disables asset bin moves and preserves source', async ({ page }) => {
  await open(page);
  await execute(page, [{ kind: 'asset.import', assets: [{ path: 'images/logo.svg', data: 'data:image/svg+xml;base64,PHN2Zy8+' }, { path: 'images/Target/other.svg', data: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' }] }, { kind: 'bin.create', dir: 'images/Empty' }]);
  await page.getByRole('button', { name: /^Project/ }).click(); await page.locator('.asset-row').filter({ hasText: 'logo.svg' }).click();
  await evaluateInPage(page, async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); s.applyTemplate({ ...s.template, html: s.template.html.replace('"version":1', '"version":99') }); });
  const before = await source(page);
  await expect(page.getByRole('combobox', { name: 'Asset bin' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'New asset bin', exact: true })).toBeDisabled();
  const transfer = await page.evaluateHandle(() => { const data = new DataTransfer(); data.setData('application/x-noacg-asset', 'images/logo.svg'); return data; });
  await page.locator('.asset-folder').filter({ has: page.getByRole('button', { name: 'Bin Target', exact: true }) }).dispatchEvent('drop', { dataTransfer: transfer });
  await expect(page.getByRole('alert').filter({ hasText: '✗' })).toContainText('unsupported');
  expect(await source(page)).toEqual(before);
});

for (const saved of [false, true]) for (const kind of ['folder', 'bin'] as const) test(kind + ' drafts cannot cross a document switch' + (saved ? ' with the same saved identity' : ''), async ({ page }) => {
  await open(page);
  if (saved) {
    await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Draft ownership'); await page.getByTestId('save-confirm').click();
    await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); await page.reload(); await ready(page);
  }
  const fixture = await source(page);
  const openingId = await evaluateInPage(page, async () => (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().documentId);
  const swap = async () => {
    await evaluateInPage(page, async ({ t, saved }) => {
      const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
      if (saved) (await import('/src/store/saveActions.ts')).openGraphicById(s.saved.graphicId!);
      else s.applyTemplate(t, { resetSampleData: true });
    }, { t: fixture, saved });
    await ready(page);
  };
  if (kind === 'bin') await page.getByRole('button', { name: /^Project/ }).click();
  await page.getByRole('button', { name: kind === 'folder' ? 'New layer folder' : 'New asset bin', exact: true }).click();
  const name = kind === 'folder' ? 'Folder name' : 'Bin name';
  await page.getByRole('textbox', { name }).fill('Old document'); await swap();
  const nextId = await evaluateInPage(page, async () => (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().documentId);
  if (saved) expect(nextId).toBe(openingId); else expect(nextId).not.toBe(openingId);
  await expect(page.getByRole('textbox', { name })).toHaveCount(0);
  expect(await source(page)).toEqual(fixture);
});

for (const kind of ['unknown', 'collision'] as const) test(kind + ' organization edits refuse atomically', async ({ page }) => {
  const ids = await open(page);
  await folder(page, [ids[0]], 'Parent'); await folder(page, [ids[1]], 'Same');
  await page.getByRole('combobox', { name: 'Move to layer folder' }).selectOption({ label: 'Parent' });
  await folder(page, [ids[2]], 'Same');
  const verdict = await evaluateInPage(page, async kind => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const { readOrganization } = await import('/src/model/editorOrganization.ts');
    const parent = readOrganization(s.port.read()).folders.find(folder => folder.name === 'Parent')!;
    const before = s.port.read(), view = JSON.stringify(s.port.view()), undo = s.canUndo();
    const run = (operations: unknown[]) => { try { s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: operations as EditorOperation[] }); return ''; } catch (cause) { return String(cause); } };
    const refusal = run(kind === 'unknown' ? [{ kind: 'folder.rename', id: parent.id, name: 'Changed' }, { kind: 'folder.future' }]
      : [{ kind: 'folder.remove', id: parent.id }]);
    return { refusal, exact: before === s.port.read() && view === JSON.stringify(s.port.view()) && undo === s.canUndo() };
  }, kind);
  expect(verdict.refusal).toContain(kind === 'unknown' ? 'Unknown' : 'already exists'); expect(verdict.exact).toBe(true);
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
  for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'laptop-125']] as const) {
    await page.setViewportSize({ width, height });
    const project = page.getByRole('complementary', { name: 'Project', exact: true });
    await project.evaluate(el => { el.scrollLeft = 0; });
    const dock = (await project.boundingBox())!, move = (await page.getByRole('combobox', { name: 'Asset bin' }).boundingBox())!;
    expect(move.x).toBeGreaterThanOrEqual(dock.x); expect(move.x + move.width).toBeLessThanOrEqual(dock.x + dock.width);
    const sponsorBin = page.getByRole('button', { name: 'Bin Sponsors', exact: true });
    await sponsorBin.scrollIntoViewIfNeeded(); await expect(sponsorBin).toBeInViewport();
    expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
    await page.screenshot({ path: 'docs/research/editor-r1-2b-7/' + label + '-bins.png', fullPage: true });
  }
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
