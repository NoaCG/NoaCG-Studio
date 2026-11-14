// covers: src/components/editorFoundation/{ProjectPanel,ProjectStarter,documentAdapter,session,operations}.{ts,tsx}
// covers: src/components/editorFoundation/projects.css, src/components/home/sections/ProjectsSection.tsx
// covers: src/model/{project,authoringDocument,brandApplication,projectInstallation}.ts
// covers: src/store/{authoringProjects,templateStore,saveActions}.ts, src/control/projectInstallation.ts
// focus
import { test, expect, type Page, type Locator } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { decodePng, findPixelsNear } from '../scripts/png-decode.mjs';
import { seedAuthoringProject, editProjectText, flushAuthoringProject } from './_authoringProject';
import { awaitDurableReady } from './_durable';
import { armStorageFailure, fillStorage, freeStorage, durableValue } from './_storage';
import { install as installHeldWrite, arm as armHeldWrite, releasable as heldWriteReady, release as releaseHeldWrite } from './_saveMatrix';

// These are distinct user flows: ownership/history, explicit brand revision, and safe installation.
// The transition oracle is the stated E4 Rules, with fixed expected sources and record counts.
test('project documents keep independent draft undo/redo through switching, reload and Home reopen', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const original = await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  const sameDocumentStillOpen = await page.evaluate(async id => {
    const D = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const old = D.activeEditorSession().port;
    await (await __noacgImport('/src/store/authoringProjects.ts')).openProjectDocument(id);
    D.activeEditorSession();
    try { old.restore({ selectedParts: [], time: 99 }); return ''; } catch (e) { return String(e); }
  }, ids[0]);
  expect(sameDocumentStillOpen).toBe(''); // Reopening the same live binding is idempotent; switching below closes it.
  await editProjectText(page, 'North coast news');
  await page.getByRole('button', { name: /^Project/ }).first().click();
  await page.evaluate(async () => { (window as unknown as { oldDocumentPort: unknown }).oldDocumentPort = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port; });
  await page.locator(`[data-document="${ids[1]}"]`).click();
  await expect(page.locator(`[data-document="${ids[1]}"]`)).toHaveAttribute('aria-current', 'page');
  const stalePort = await page.evaluate(async () => {
    let error = '';
    try { (window as unknown as { oldDocumentPort: { restore(view: unknown): void } }).oldDocumentPort.restore({ selectedParts: ['#f0'], time: 99, sampleData: { f0: 'Stale previous document' } }); } catch (e) { error = String(e); }
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { error, selected: s.selectedParts, sample: s.sampleData.f0 };
  });
  expect(stalePort.error).toContain('closed'); expect(stalePort.selected).toEqual([]); expect(stalePort.sample).not.toBe('Stale previous document');
  await editProjectText(page, 'Evening edition');
  await page.locator(`[data-document="${ids[0]}"]`).click();
  await expect(page.locator(`[data-document="${ids[0]}"]`)).toHaveAttribute('aria-current', 'page');
  const changed = await page.evaluate(async () => {
    const { activeEditorSession } = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const s = activeEditorSession(), edited = s.port.read(); s.undo(); const undone = s.port.read(); s.redo();
    return { edited, undone, redone: s.port.read() };
  });
  expect(changed.undone).toEqual(original); expect(changed.redone).toEqual(changed.edited);
  await page.evaluate(async () => {
    const store = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.setSelectedParts(['#f0']); store.setSampleValue('f0', 'Independent rehearsal sample');
    (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).setSessionTime(.42);
  });
  await flushAuthoringProject(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await page.evaluate(async () => {
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { selected: s.selectedParts, sample: s.sampleData.f0, time: (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view().time };
  })).toEqual({ selected: ['#f0'], sample: 'Independent rehearsal sample', time: .42 });
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('home-projects')).toContainText('E4 show');
  await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Intro/ }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorSession } = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const s = activeEditorSession(), edited = s.port.read(), undo = s.canUndo(); s.undo();
    return { edited: edited.html, undone: s.port.read().html, undo };
  });
  expect(result.edited).toContain('Evening edition'); expect(result.undo).toBe(true); expect(result.undone).not.toContain('Evening edition');
});

test('brand source and visible-logo receipt undo together; reapply keeps role, logo bytes and untouched documents', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const results = await page.evaluate(async ids => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const { activeEditorSession } = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const { setCssVariable, getCssVariable } = await __noacgImport('/src/model/cssVars.ts');
    const { useTemplateStore } = await __noacgImport('/src/store/templateStore.ts');
    const { brandSlotField } = await __noacgImport('/src/model/packets.ts');
    const untouched = structuredClone(P.workspace().documents[2]);
    if (!await P.openProjectDocument(ids[1])) throw new Error(P.useAuthoringProjects.getState().error);
    const a = { id: 'brand-a', name: 'Channel A', updatedAt: '2026-11-12T00:00:00Z', brand: { styleTag: 'minimal' as const, fontId: 'oswald', customFont: null,
      palette: { id: 'custom', name: 'A', styleTags: ['minimal' as const], accent: '#11aa44', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' },
      logo: { path: 'images/e4-logo.svg', data: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMCAxMCI+PHJlY3Qgd2lkdGg9IjEwIiBoZWlnaHQ9IjEwIiBmaWxsPSJyZWQiLz48L3N2Zz4=' } } };
    const apply = (look: typeof a) => { const s = activeEditorSession(); s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'brand.apply', look }] }); };
    const before = useTemplateStore.getState().template;
    apply(a); const branded = useTemplateStore.getState().template;
    const b = { ...a, id: 'brand-b', brand: { ...a.brand, palette: { ...a.brand.palette, accent: '#3344ee' } } };
    apply(b); activeEditorSession().undo(); const undoB = useTemplateStore.getState().template;
    activeEditorSession().undo(); const undone = useTemplateStore.getState().template;
    activeEditorSession().redo(); const redone = useTemplateStore.getState().template;
    const local = { ...redone, css: setCssVariable(redone.css, 'text-color', '#fedd00'), assets: redone.assets.map(asset => asset.path === a.brand.logo.path ? { ...asset, data: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="blue"/></svg>') } : asset) };
    useTemplateStore.getState().applyTemplate(local);
    apply(b); const reapplied = useTemplateStore.getState().template;
    return { before, branded, undoB, undone, redone, reapply: { text: getCssVariable(reapplied.css, 'text-color'), accent: getCssVariable(reapplied.css, 'accent'),
      markChanged: local.assets.find(asset => asset.path === a.brand.logo.path)?.data !== a.brand.logo.data,
      markKept: reapplied.assets.find(a => a.path === local.brandApplication?.logo?.path)?.data === local.assets.find(a => a.path === local.brandApplication?.logo?.path)?.data,
      slot: brandSlotField(reapplied)?.value }, untouched: P.workspace().documents[2], expectedUntouched: untouched };
  }, ids);
  expect(results.undone).toEqual(results.before); expect(results.redone).toEqual(results.branded); expect(results.undoB).toEqual(results.branded);
  expect(results.branded.assets.some(a => a.path === 'images/e4-logo.svg')).toBe(true);
  expect(results.reapply).toMatchObject({ text: '#fedd00', accent: '#3344ee', markChanged: true, markKept: true, slot: 'images/e4-logo.svg' });
  expect(results.untouched).toEqual(results.expectedUntouched);
});

test('a refused document switch keeps the current draft; project rename/removal keeps all documents', async ({ page }) => {
  await armStorageFailure(page);
  const ids = await seedAuthoringProject(page);
  await editProjectText(page, 'Keep the unsaved source'); await flushAuthoringProject(page);
  await fillStorage(page);
  const refused = await page.evaluate(async id => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const result = await P.openProjectDocument(id);
    return { result, current: (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().documentId, error: P.useAuthoringProjects.getState().error };
  }, ids[1]);
  expect(refused.result).toBe(false); expect(refused.current).toBe(ids[0]); expect(refused.error).toContain('storage');
  await expect(page.locator('.ef-status [role="alert"]')).toContainText('storage');
  await freeStorage(page);
  const before = await page.evaluate(async () => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const snapshot = structuredClone(P.workspace()); const id = snapshot.projects[0].id;
    if (!await P.renameAuthoringProject(id, 'Renamed E4')) throw new Error(P.useAuthoringProjects.getState().error);
    if (!await P.removeAuthoringProject(id)) throw new Error(P.useAuthoringProjects.getState().error);
    return snapshot.documents;
  });
  await flushAuthoringProject(page); await page.goto('/app#/home'); await awaitDurableReady(page);
  await expect(page.getByTestId('home-projects')).toContainText('Unfiled drafts');
  const after = await page.evaluate(async () => (await __noacgImport('/src/store/authoringProjects.ts')).workspace());
  expect(after.projects).toEqual([]); expect(after.documents).toEqual(before);
  expect((await durableValue(page, 'spx-gfx-project'))).toContain('Keep the unsaved source');
});

test('selected graphics install independently into two rundowns, retry once and preserve newer edits on rollback', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const result = await page.evaluate(async ids => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const A = await __noacgImport('/src/store/saveActions.ts');
    const S = await __noacgImport('/src/model/shows.ts');
    const D = await __noacgImport('/src/model/durableStore.ts');
    const I = await __noacgImport('/src/control/projectInstallation.ts');
    const libraryIds = [];
    for (const id of ids) { if (!await P.openProjectDocument(id)) throw new Error(P.useAuthoringProjects.getState().error); const save = await A.saveGraphicAs((await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template.name, { kind: 'standalone' }); if (!save.ok) throw new Error(save.error!); libraryIds.push(save.graphicId!); }
    const first = S.createShowNamedChecked('E4 rehearsal A').show, second = S.createShowNamedChecked('E4 rehearsal B').show;
    await D.commitDurableWrites();
    const a = await I.installProjectGraphics(first.id, libraryIds.slice(0, 2));
    const aBeforeRetry = structuredClone(S.loadShows().find(s => s.id === first.id)!);
    await I.retryProjectInstallation(a.id);
    const aAfterRetry = structuredClone(S.loadShows().find(s => s.id === first.id)!);
    const b = await I.installProjectGraphics(second.id, [libraryIds[1], libraryIds[2]]);
    const bBefore = structuredClone(S.loadShows().find(s => s.id === second.id)!);
    // The library master edit is outside both installed source snapshots.
    const L = await __noacgImport('/src/model/library.ts'); const master = L.graphicById(libraryIds[1])!;
    L.updateGraphic(master.id, { template: { ...master.template, css: master.template.css + '\n/* later master edit */' } });
    await D.commitDurableWrites();
    const independent = S.loadShows().find(s => s.id === second.id)!.graphics.every(g => !g.template.css.includes('later master edit'));
    const newer = { ...S.loadShows().find(s => s.id === first.id)!, name: 'Newer operator edit' };
    S.upsertShow(newer); await D.commitDurableWrites();
    let conflict = ''; try { await I.retryProjectInstallation(a.id, true); } catch (e) { conflict = String(e); }
    const kept = S.loadShows().find(s => s.id === first.id)!;
    await I.retryProjectInstallation(b.id, true);
    return { aBeforeRetry, aAfterRetry, bBefore, independent, conflict, kept, bRolledBack: S.loadShows().find(s => s.id === second.id)!, firstId: first.id, secondId: second.id };
  }, ids);
  expect(result.aAfterRetry).toEqual(result.aBeforeRetry); expect(result.aAfterRetry.graphics).toHaveLength(2); expect(result.aAfterRetry.cues).toHaveLength(2);
  expect(result.bBefore.graphics.map(g => g.name)).toEqual(['E4 Intro', 'E4 Mark']);
  expect(result.independent).toBe(true); expect(result.conflict).toContain('newer production edits'); expect(result.kept.name).toBe('Newer operator edit'); expect(result.kept.graphics).toHaveLength(2);
  expect(result.bRolledBack.graphics).toEqual([]); expect(result.bRolledBack.cues ?? []).toEqual([]);
});


test('legacy installation normalizes only supported selected rows and refuses genuine format or metadata changes', async ({ page }) => {
  await seedAuthoringProject(page, ['lt01']);
  const result = await page.evaluate(async () => {
    const A = await __noacgImport('/src/store/saveActions.ts'), D = await __noacgImport('/src/model/durableStore.ts');
    const S = await __noacgImport('/src/model/shows.ts'), I = await __noacgImport('/src/control/projectInstallation.ts');
    const M = await __noacgImport('/src/model/projectInstallation.ts'), L = await __noacgImport('/src/model/library.ts');
    const saved = await A.saveGraphicAs('Legacy installation source', { kind: 'standalone' });
    if (!saved.ok) throw new Error(saved.error!);
    (await __noacgImport('/src/store/templateStore.ts')).flushPendingProject(); await D.commitDurableWrites();
    const unrelated = [{ id: 'unrelated-legacy', name: 'Keep raw legacy', graphics: [] },
      { id: 'unrelated-future', name: 'Keep future bytes', version: 99, graphics: [], metadata: { future: true } }];
    const disk = () => new Promise<string>((resolve, reject) => {
      const open = indexedDB.open('noacg-studio', 1);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => { const db = open.result, get = db.transaction('kv', 'readonly').objectStore('kv').get('spx-gfx-shows');
        get.onsuccess = () => { resolve(get.result as string); db.close(); }; get.onerror = () => { reject(get.error); db.close(); }; };
    });
    const seed = async (row: unknown) => { const raw = JSON.stringify([row, ...unrelated]); D.durable.setItem('spx-gfx-shows', raw); await D.commitDurableWrites(); return raw; };
    let installed = 0, refused = 0;
    for (const version of [undefined, 2]) for (const updatedAt of [undefined, '2026-01-01T00:00:00.000Z']) {
      const row = { id: 'legacy-target', name: 'Legacy target', graphics: [], version, updatedAt, metadata: { preserve: ['unknown', 'nested'] } };
      const raw = await seed(row), normalized = S.loadShows().find(s => s.id === row.id)!;
      if (await disk() !== raw || normalized.version !== 2 || normalized.updatedAt !== (updatedAt ?? '1970-01-01T00:00:00.000Z')) throw new Error('Supported read normalization changed storage or identity.');
      const plan = await I.installProjectGraphics(row.id, [saved.graphicId!]);
      const after = await disk(); await I.retryProjectInstallation(plan.id);
      if (plan.status !== 'confirmed' || await disk() !== after) throw new Error('Legacy installation/retry changed its stable target.');
      const rows = JSON.parse(after);
      if (JSON.stringify(rows.slice(1)) !== JSON.stringify(unrelated) || JSON.stringify(rows[0].metadata) !== JSON.stringify(row.metadata) || rows[0].graphics.length !== 1 || rows[0].cues.length !== 1) throw new Error('Installation changed unrelated rows, metadata or copy count.');
      installed++;
    }
    const raw = { id: 'legacy-target', name: 'Target', version: 2 as const, updatedAt: '2026-01-01T00:00:00.000Z', graphics: [], metadata: { preserve: true } };
    await seed(raw);
    const plan = M.planProjectInstallation(S.loadShows().find(s => s.id === raw.id)!, [L.graphicById(saved.graphicId!)!]);
    const reject = async (row: unknown, rollback = false) => {
      const before = await seed(row), answer = await M.reconcileProjectTarget(rollback ? M.planProjectRollback(plan) : plan, rollback);
      if (answer.status !== 'refused' || await disk() !== before) throw new Error('An unsupported or genuinely changed target was accepted or overwritten.');
      refused++;
    };
    for (const version of [1, 99, '2', null]) await reject({ ...plan.before, version });
    for (const updatedAt of [null, false, 0, '', '2026-02-01T00:00:00.000Z']) await reject({ ...plan.before, updatedAt });
    for (const row of [{ ...plan.before, metadata: { preserve: false } }, { ...plan.before, metadata: undefined }, { ...plan.before, added: { future: true } }]) await reject(row);
    await reject({ ...plan.after, version: 99 });
    await reject({ ...plan.after, version: 99 }, true);
    return { installed, refused };
  });
  expect(result).toEqual({ installed: 4, refused: 14 });
});

test('Home starts three chosen registry graphics and a created brand without code', async ({ page }, info) => {
  await page.goto('/app#/home');
  const wizard = page.getByTestId('creation-wizard');
  await expect(page.getByTestId('home-page')).toBeVisible();
  if (await wizard.isVisible()) await wizard.locator('.gallery-close').click();
  await page.getByTestId('home-projects').getByRole('button', { name: 'New project', exact: true }).click();
  const starter = page.getByTestId('project-starter');
  await expect(starter).toBeVisible();
  await starter.getByLabel('Project name', { exact: true }).fill('Harbour bulletin');
  await starter.getByLabel('Starter collection', { exact: true }).selectOption('newsroom');
  await starter.getByRole('button', { name: 'New brand', exact: true }).click();
  await starter.getByLabel('Brand name', { exact: true }).fill('Harbour TV');
  await starter.getByLabel('Accent value', { exact: true }).fill('#16bb99');
  await starter.getByLabel('Typeface', { exact: true }).selectOption('oswald');
  await starter.getByLabel('Brand logo', { exact: true }).setInputFiles({ name: 'harbour.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#16bb99"/><path d="M8 8v16m16-16v16M8 16h16" stroke="white" stroke-width="4"/></svg>') });
  await starter.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(starter.getByLabel('Project brand', { exact: true }).locator('option:checked')).toHaveText('Harbour TV');
  await expect(starter.getByRole('checkbox', { checked: true })).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('starter-branded-three.png') });
  await starter.getByRole('button', { name: 'Create project · 3', exact: true }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const created = await page.evaluate(async () => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const w = P.workspace(), project = w.projects.find(p => p.name === 'Harbour bulletin')!;
    return project.documents.map(id => w.documents.find(d => d.id === id)!);
  });
  expect(created).toHaveLength(3);
  expect(created.every(d => d.template.css.includes('#16bb99') && d.template.css.includes('Oswald') && !!d.template.brandApplication)).toBe(true);
  expect(created.some(d => d.template.assets.some(a => a.path === 'images/harbour.svg'))).toBe(true);
  await page.getByRole('button', { name: /^Project/ }).first().click();
  await expect(page.locator('[data-document]')).toHaveCount(3);
  await page.screenshot({ path: info.outputPath('project-three-graphics.png') });
});

for (const crash of ['target-refused', 'confirmation-refused'] as const) test(`interrupted install ${crash} reconciles after reload with the same graphic/cue ids`, async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const setup = await page.evaluate(async id => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    await P.openProjectDocument(id);
    const A = await __noacgImport('/src/store/saveActions.ts');
    const saved = await A.saveGraphicAs('Recovery lower third', { kind: 'standalone' });
    if (!saved.ok) throw new Error(saved.error!);
    const show = (await __noacgImport('/src/model/shows.ts')).createShowNamedChecked('Interrupted install').show;
    (await __noacgImport('/src/store/templateStore.ts')).flushPendingProject();
    const error = await (await __noacgImport('/src/model/durableStore.ts')).commitDurableWrites(); if (error) throw new Error(error);
    return { graphicId: saved.graphicId!, showId: show.id };
  }, ids[0]);
  const interrupted = await page.evaluate(async ({ crash, setup }) => {
    const key = crash === 'target-refused' ? 'spx-gfx-shows' : 'spx-gfx-project';
    const failAt = crash === 'target-refused' ? 1 : 2;
    const real = IDBObjectStore.prototype.put; let matching = 0;
    IDBObjectStore.prototype.put = function(value, storeKey) {
      if (storeKey === key && ++matching === failAt) { IDBObjectStore.prototype.put = real; throw new DOMException('E4 interrupted storage write', 'QuotaExceededError'); }
      return real.call(this, value, storeKey!);
    };
    let error = '';
    try { await (await __noacgImport('/src/control/projectInstallation.ts')).installProjectGraphics(setup.showId, [setup.graphicId]); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.put = real; }
    const w = (await __noacgImport('/src/store/authoringProjects.ts')).workspace();
    const plan = w.installations![0];
    return { error, plan, show: (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === setup.showId)! };
  }, { crash, setup });
  expect(interrupted.error).not.toBe(''); expect(interrupted.plan.status).toBe('prepared');
  expect(interrupted.show.graphics).toHaveLength(crash === 'target-refused' ? 0 : 1);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const recovered = await page.evaluate(async id => {
    await (await __noacgImport('/src/control/projectInstallation.ts')).retryProjectInstallation(id);
    const P = (await __noacgImport('/src/store/authoringProjects.ts')).workspace().installations![0];
    return { plan: P, show: (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === P.target)! };
  }, interrupted.plan.id);
  expect(recovered.plan.status).toBe('confirmed'); expect(recovered.show).toEqual(interrupted.plan.after);
  expect(recovered.show.graphics).toHaveLength(1); expect(recovered.show.cues).toHaveLength(1);
});

for (const crash of ['intent-refused', 'target-refused', 'confirmation-refused'] as const) test(`interrupted rollback ${crash} keeps its direction and exact revision after reload`, async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const installed = await page.evaluate(async id => {
    const P = await __noacgImport('/src/store/authoringProjects.ts'); await P.openProjectDocument(id);
    const saved = await (await __noacgImport('/src/store/saveActions.ts')).saveGraphicAs('Inverse recovery', { kind: 'standalone' });
    if (!saved.ok) throw new Error(saved.error!);
    const show = (await __noacgImport('/src/model/shows.ts')).createShowNamedChecked('Inverse recovery').show;
    (await __noacgImport('/src/store/templateStore.ts')).flushPendingProject();
    await (await __noacgImport('/src/model/durableStore.ts')).commitDurableWrites();
    return (await __noacgImport('/src/control/projectInstallation.ts')).installProjectGraphics(show.id, [saved.graphicId!]);
  }, ids[0]);
  const interrupted = await page.evaluate(async ({ crash, id }) => {
    const key = crash === 'target-refused' ? 'spx-gfx-shows' : 'spx-gfx-project';
    const failAt = crash === 'confirmation-refused' ? 2 : 1;
    const real = IDBObjectStore.prototype.put; let matching = 0, error = '';
    IDBObjectStore.prototype.put = function(value, storeKey) {
      if (storeKey === key && ++matching === failAt) { IDBObjectStore.prototype.put = real; throw new DOMException('E4 inverse storage refusal', 'QuotaExceededError'); }
      return real.call(this, value, storeKey!);
    };
    try { await (await __noacgImport('/src/control/projectInstallation.ts')).retryProjectInstallation(id, true); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.put = real; }
    const target = (await __noacgImport('/src/store/authoringProjects.ts')).workspace().installations!.find(p => p.id === id)!.target;
    return { error, show: (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === target)! };
  }, { crash, id: installed.id });
  expect(interrupted.error).not.toBe('');
  expect(interrupted.show.graphics).toHaveLength(crash === 'confirmation-refused' ? 0 : 1);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const pending = await page.evaluate(async id => (await __noacgImport('/src/store/authoringProjects.ts')).workspace().installations!.find(p => p.id === id)!, installed.id);
  expect(pending.status).toBe('confirmed');
  if (crash === 'intent-refused') expect(pending.rollback).toBeUndefined();
  else {
    expect(pending.rollback!.updatedAt > installed.after.updatedAt).toBe(true);
    expect({ ...pending.rollback, updatedAt: installed.before.updatedAt }).toEqual(installed.before);
    await page.getByRole('button', { name: /^Project/ }).first().click();
    await page.getByText('Installations', { exact: true }).click();
    const row = page.locator(`[data-installation="${installed.id}"]`);
    await row.getByRole('button', { name: 'Retry rollback', exact: true }).click();
    await expect(row).toContainText('rolled-back');
  }
  const recovered = await page.evaluate(async ({ id, needsIntent }) => {
    const I = await __noacgImport('/src/control/projectInstallation.ts');
    if (needsIntent) await I.retryProjectInstallation(id, true);
    const first = await I.retryProjectInstallation(id), second = await I.retryProjectInstallation(id);
    return { first, second, show: (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === first.target)! };
  }, { id: installed.id, needsIntent: crash === 'intent-refused' });
  expect(recovered.first.status).toBe('rolled-back'); expect(recovered.second).toEqual(recovered.first);
  expect(recovered.show).toEqual(recovered.first.rollback);
  if (pending.rollback) expect(recovered.show).toEqual(pending.rollback);
  expect(recovered.show.graphics).toEqual(installed.before.graphics); expect(recovered.show.cues).toEqual(installed.before.cues);
  const newer = await page.evaluate(async id => {
    const S = await __noacgImport('/src/model/shows.ts'), P = await __noacgImport('/src/store/authoringProjects.ts');
    const plan = P.workspace().installations!.find(p => p.id === id)!;
    S.upsertShow({ ...S.loadShows().find(s => s.id === plan.target)!, name: 'Later operator edit' });
    await (await __noacgImport('/src/model/durableStore.ts')).commitDurableWrites();
    const before = S.loadShows().find(s => s.id === plan.target)!; let error = '';
    try { await (await __noacgImport('/src/control/projectInstallation.ts')).retryProjectInstallation(id); } catch (e) { error = String(e); }
    return { before, after: S.loadShows().find(s => s.id === plan.target)!, error };
  }, installed.id);
  expect(newer.error).toContain('newer production edits'); expect(newer.after).toEqual(newer.before);
});

test('legacy adoption is additive and refusal preserves its source; unknown workspace stays read-only', async ({ page }) => {
  await armStorageFailure(page);
  await page.goto('/app#/home'); await awaitDurableReady(page);
  const legacy = await page.evaluate(async () => {
    const { variantsFor } = await __noacgImport('/src/templates/catalog.ts');
    const S = await __noacgImport('/src/store/templateStore.ts');
    S.useTemplateStore.getState().applyTemplate({ ...variantsFor('lower-third')[0].create({}), name: 'Legacy source' }, { resetSampleData: true });
    S.flushPendingProject(); await (await __noacgImport('/src/model/durableStore.ts')).commitDurableWrites();
    return S.useTemplateStore.getState().template;
  });
  const originalDisk = await durableValue(page, 'spx-gfx-project');
  await fillStorage(page);
  const refused = await page.evaluate(async () => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const t = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return P.createAuthoringProject('New show', [{ ...t, name: 'Intro' }]);
  });
  expect(refused).toBe(false); expect(await durableValue(page, 'spx-gfx-project')).toBe(originalDisk);
  await freeStorage(page);
  const adopted = await page.evaluate(async () => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const t = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    if (!await P.createAuthoringProject('New show', [{ ...t, name: 'Intro' }])) throw new Error(P.useAuthoringProjects.getState().error);
    return P.workspace();
  });
  expect(adopted.documents.find(d => d.template.name === 'Legacy source')?.template).toEqual(legacy);
  expect(adopted.documents).toHaveLength(2);
  expect(adopted.documents.find(d => d.template.name === 'Legacy source')!.history.length).toBe(0);
  const unknown = await page.evaluate(async () => {
    const M = await __noacgImport('/src/model/project.ts'), D = await __noacgImport('/src/model/durableStore.ts');
    const current = M.loadProject()!;
    M.stageAuthoringWorkspace(undefined);
    const future = { ...current, workspace: { v: 99, opaque: 'future source' } };
    D.durable.setItem('spx-gfx-project', JSON.stringify(future)); await D.commitDurableWrites();
    const exact = D.durable.getItem('spx-gfx-project');
    M.saveProject(current.template); M.upsertProject(current); M.clearProject();
    return { exact, after: D.durable.getItem('spx-gfx-project'), refusal: M.workspaceRefusal() };
  });
  expect(unknown.refusal).toContain('newer'); expect(unknown.after).toBe(unknown.exact);
});

test('a refused explicit save keeps the library and draft; pending save cannot switch document or duplicate on retry', async ({ page }) => {
  await armStorageFailure(page);
  const ids = await seedAuthoringProject(page);
  const initial = await page.evaluate(async () => {
    const A = await __noacgImport('/src/store/saveActions.ts');
    const result = await A.saveGraphicAs('Durable master', { kind: 'standalone' });
    if (!result.ok) throw new Error(result.error!);
    return (await __noacgImport('/src/model/library.ts')).graphicById(result.graphicId!)!;
  });
  await editProjectText(page, 'Newer unsaved edition'); await flushAuthoringProject(page);
  await fillStorage(page);
  const failed = await page.evaluate(async id => {
    const A = await __noacgImport('/src/store/saveActions.ts'), P = await __noacgImport('/src/store/authoringProjects.ts');
    const saving = A.saveCurrentGraphic();
    const switched = await P.openProjectDocument(id);
    const result = await saving;
    return { result, switched, state: (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template,
      library: (await __noacgImport('/src/model/library.ts')).loadGraphics() };
  }, ids[1]);
  expect(failed.result).toBe('failed'); expect(failed.switched).toBe(false); expect(failed.state.html).toContain('Newer unsaved edition');
  expect(failed.library).toEqual([initial]);
  await freeStorage(page);
  const retried = await page.evaluate(async () => {
    const result = await (await __noacgImport('/src/store/saveActions.ts')).saveCurrentGraphic();
    return { result, library: (await __noacgImport('/src/model/library.ts')).loadGraphics() };
  });
  expect(retried.result).toBe('saved'); expect(retried.library).toHaveLength(1); expect(retried.library[0].id).toBe(initial.id);
  expect(retried.library[0].template.html).toContain('Newer unsaved edition');
});

async function paintedNextRow(row: Locator, path: string, preview = false) {
  await expect(row).toHaveText('Post your question in the chat');
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
  await expect(row).toHaveCSS('color', 'rgb(255, 255, 255)');
  const image = decodePng(await row.screenshot({ path, omitBackground: true }));
  let painted = findPixelsNear(image, [255, 255, 255], 0);
  if (preview) {
    // The scaled operator stage antialiases white glyphs over its dark background.
    // Compare opaque neutral glyphs with this capture's dark background; exports demand exact white.
    const background = image.pixel(0, 0);
    let count = 0;
    for (let y = 0; y < image.height; y++) for (let x = 0; x < image.width; x++) {
      const [r, g, b, a] = image.pixel(x, y);
      if (a === 255 && r === g && g === b && r > Math.max(...background.slice(0, 3))) count++;
    }
    painted = { ...painted, count };
  }
  expect(painted.count, 'Next paints the newly revealed authored row').toBeGreaterThan(0);
  return painted;
}

test('saved project reaches operator data In/Next/Out and exports bundled receiving fixtures', async ({ page, context }, info) => {
  const fixture = JSON.parse(readFileSync('e2e/fixtures/editor-projects/receiving.json', 'utf8'));
  const logo = readFileSync('e2e/fixtures/editor-projects/harbour.svg').toString('base64');
  const ids = await seedAuthoringProject(page, fixture.variants);
  const prepared = await page.evaluate(async ({ ids, fixture, logo }) => {
    const P = await __noacgImport('/src/store/authoringProjects.ts'), A = await __noacgImport('/src/store/saveActions.ts');
    const S = await __noacgImport('/src/model/shows.ts'), D = await __noacgImport('/src/model/durableStore.ts');
    const { createLook } = await __noacgImport('/src/model/packets.ts');
    if (!await P.openProjectDocument(ids[1])) throw new Error(P.useAuthoringProjects.getState().error);
    const look = createLook('Harbour receiving', { styleTag: 'minimal', fontId: fixture.fontId, customFont: null,
      palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: fixture.accent, text: '#ffffff', textDim: '#b8c4d6', panel: '#112233' },
      logo: { path: 'images/harbour.svg', data: 'data:image/svg+xml;base64,' + logo } });
    const session = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [
      { kind: 'text.set', selector: '#f0', text: fixture.heading }, { kind: 'brand.apply', look },
    ] });
    const saved = await A.saveGraphicAs(fixture.name, { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
    const doc = (await __noacgImport('/src/model/library.ts')).graphicById(saved.graphicId!)!;
    const outputs = [];
    for (const target of (await __noacgImport('/src/export/registry.ts')).EXPORT_TARGETS.filter(t => fixture.expected.targets.includes(t.id))) {
      const zip = await target.build(doc.template, { sampleData: { f0: fixture.heading } });
      outputs.push({ id: target.id, base64: await zip.generateAsync({ type: 'base64' }) });
    }
    const show = S.createShowNamedChecked('E4 operator rehearsal').show; await D.commitDurableWrites();
    await (await __noacgImport('/src/control/projectInstallation.ts')).installProjectGraphics(show.id, [doc.id]);
    (await __noacgImport('/src/app/router.ts')).useRouter.getState().navigate({ view: 'production', id: show.id });
    await new Promise(resolve => setTimeout(resolve));
    return { outputs, source: doc.template, showId: show.id };
  }, { ids, fixture, logo });
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('cue-field-f0').fill(fixture.operatorHeading);
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe');
  await expect(program.locator('#f0')).toHaveText(fixture.operatorHeading);
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '1');
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
  await page.getByTestId('verb-next').click();
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(2);
  await expect(program.locator('.info-card-box')).toHaveCSS('opacity', '1');
  await expect(program.locator('.info-card-box')).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
  const operatorNext = await paintedNextRow(program.locator('#f1'), info.outputPath('operator-next-row.png'), true);
  await page.getByTestId('verb-out').click();
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgMachineState(): { groups: { main: string } } }).noacgMachineState().groups.main)).toBe('off');
  await expect(program.locator('.info-card')).toHaveCSS('opacity', '0');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '2');
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
  await page.evaluate(async () => {
    const L = await __noacgImport('/src/model/library.ts'), C = await __noacgImport('/src/model/cssVars.ts');
    const master = L.loadGraphics().find(g => g.name === 'E4 Receiving Steps')!;
    L.updateGraphic(master.id, { template: { ...master.template, css: C.setCssVariable(master.template.css, 'accent', '#ff0000') } });
    await (await __noacgImport('/src/model/durableStore.ts')).commitDurableWrites();
  });
  await expect(program.locator('#f0')).toHaveText(fixture.operatorHeading);
  expect(await program.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe(fixture.accent);
  await page.screenshot({ path: info.outputPath('operator-rehearsal.png') });
  const manifest: Record<string, unknown> = { sourceCanonicalSha256: createHash('sha256').update(JSON.stringify(prepared.source)).digest('hex'), sourceFileSha256: createHash('sha256').update(JSON.stringify(prepared.source, null, 2) + '\n').digest('hex'),
    fixture, operator: { data: fixture.operatorHeading, states: [1, 2, 'off', 1], entrances: 2, paintedNext: operatorNext }, packages: [], browserOnly: true };
  writeFileSync(info.outputPath('source.json'), JSON.stringify(prepared.source, null, 2) + '\n');
  const gsap = readFileSync('src/assets/gsap.min.js');
  for (const output of prepared.outputs) {
    const bytes = Buffer.from(output.base64, 'base64');
    writeFileSync(info.outputPath(`${output.id}.zip`), bytes);
    const zip = await JSZip.loadAsync(bytes), files = Object.keys(zip.files).filter(name => !zip.files[name].dir).sort();
    const fonts = files.filter(name => /\.woff2$/.test(name));
    if (output.id === 'spx' || output.id === 'ograf') {
      expect(fonts.length).toBeGreaterThan(0); expect(files.some(name => name.endsWith('/images/harbour.svg'))).toBe(true);
      const runtime = files.find(name => name.endsWith('/gsap.min.js'))!;
      expect(await zip.file(runtime)!.async('nodebuffer')).toEqual(gsap);
    }
    const root = files[0].split('/')[0], main = `${root}/${root}.html`;
    let runtimeReceipt: unknown = null;
    if (output.id === 'casparcg' || output.id === 'spx' || output.id === 'html-overlay') {
      const receiver = await context.newPage();
      await receiver.setViewportSize({ width: fixture.expected.resolution[0], height: fixture.expected.resolution[1] });
      await receiver.bringToFront();
      const missing: string[] = [];
      await receiver.route('http://e4-receiver.invalid/**', async route => {
        const file = decodeURIComponent(new URL(route.request().url()).pathname.slice(1));
        // A standalone static receiver intentionally has no optional local relay.
        if (file === 'relay/ping') { await route.fulfill({ status: 404, body: '' }); return; }
        if (!zip.file(file)) { missing.push(file); await route.fulfill({ status: 404, body: '' }); return; }
        const type = file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.woff2') ? 'font/woff2' : 'text/html';
        await route.fulfill({ contentType: type, body: await zip.file(file)!.async('nodebuffer') });
      });
      try {
        await receiver.goto(`http://e4-receiver.invalid/${main}`);
        await receiver.evaluate(async heading => {
          await document.fonts.ready;
          const w = window as unknown as { update(data: string): void; play(): void };
          w.update(JSON.stringify({ f0: heading })); w.play();
        }, fixture.heading);
        await expect(receiver.locator('#f0')).toHaveText(fixture.heading);
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
        await expect(receiver.locator('.info-card')).toHaveCSS('opacity', '1');
        await expect.poll(() => receiver.locator('img').first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
        const assets = await receiver.evaluate(() => ({ font: getComputedStyle(document.querySelector('#f0')!).fontFamily,
          logo: [...document.images].find(img => img.src.includes('harbour') || img.src.startsWith('data:image/svg+xml'))?.naturalWidth ?? 0,
          rect: (() => { const r = document.querySelector('#f0')!.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; })() }));
        expect(assets.font).toContain('Oswald'); expect(assets.logo).toBe(fixture.expected.logoNaturalWidth);
        await receiver.evaluate(() => (window as unknown as { next(): void }).next());
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(2);
        await expect(receiver.locator('.info-card-box')).toHaveCSS('opacity', '1');
        await expect(receiver.locator('.info-card-box')).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
        const paintedNext = await paintedNextRow(receiver.locator('#f1'), info.outputPath(`${output.id}-next-row.png`));
        await receiver.evaluate(() => (window as unknown as { stop(): void }).stop());
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgMachineState(): { groups: { main: string } } }).noacgMachineState().groups.main)).toBe('off');
        await expect(receiver.locator('.info-card')).toHaveCSS('opacity', '0');
        await receiver.evaluate(() => (window as unknown as { play(): void }).play());
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
        await expect(receiver.locator('.info-card')).toHaveCSS('opacity', '1');
        await expect(receiver.locator('.info-card-box')).toHaveCSS('opacity', '1');
        await expect(receiver.locator('.info-card-box')).toHaveCSS('clip-path', 'inset(0px 0% 0px 0px)');
        await expect(receiver.locator('#f0')).toBeVisible();
        await expect(receiver.locator('#f0')).toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');
        await expect(receiver.locator('#f0')).toHaveText(fixture.heading);
        await expect.poll(() => receiver.locator('img').first().evaluate(img => (img as HTMLImageElement).naturalWidth)).toBe(fixture.expected.logoNaturalWidth);
        // Existing capture contract: fence composited paint only AFTER visible output settles.
        const paint = await receiver.addStyleTag({ content: '* { will-change: auto !important; }' });
        await receiver.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        await paint.evaluate(el => el.remove());
        await receiver.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
        writeFileSync(info.outputPath(`${output.id}-paint-state.json`), JSON.stringify(await receiver.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, visibility: document.visibilityState,
          nodes: ['html', 'body', '.info-card', '.info-card-box', '.info-card-accent', '#f0', '#f5'].map(selector => { const el = document.querySelector(selector)!, css = getComputedStyle(el), rect = el.getBoundingClientRect();
            return { selector, rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, opacity: css.opacity, visibility: css.visibility, display: css.display, transform: css.transform, clip: css.clipPath, color: css.color, background: css.backgroundColor }; }) })), null, 2));
        const paintedFrame = decodePng(await receiver.screenshot({ path: info.outputPath(`${output.id}-replay.png`) }));
        expect([paintedFrame.width, paintedFrame.height]).toEqual(fixture.expected.resolution);
        const painted = findPixelsNear(paintedFrame, [22, 187, 153], 0);
        expect(painted.count, 'the receiving frame paints the authored green artwork').toBeGreaterThan(0);
        expect(missing.filter(path => !path.endsWith('favicon.ico'))).toEqual([]);
        runtimeReceipt = { optionalRelay: '404; standalone static server', data: fixture.heading, states: [1, 2, 'off', 1], assets, missing, painted, paintedNext };
      } finally { await receiver.close(); }
    } else {
      expect(files.some(name => name.endsWith('.ograf.json'))).toBe(true);
    }
    (manifest.packages as unknown[]).push({ target: output.id, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), files, runtime: runtimeReceipt });
  }
  writeFileSync(info.outputPath('receiving-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
});


for (const door of ['api', 'document', 'brand', 'save', 'create'] as const) test(`external draft is durably retained through project ${door}`, async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const external = await page.evaluate(async () => {
    const S = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore;
    const s = S.getState(); s.applyTemplate({ ...s.template, name: 'External harbour draft' }, { resetSampleData: true });
    const look = (await __noacgImport('/src/model/packets.ts')).createLook('Batch brand', { styleTag: 'minimal', fontId: 'inter', customFont: null,
      palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: '#16bb99', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' } });
    return { id: S.getState().documentId, look: look.id };
  });
  await editProjectText(page, 'External source must survive');
  await flushAuthoringProject(page);
  const before = await page.evaluate(async () => {
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { template: s.template, history: s.history, saved: { graphicId: s.saved.graphicId, dirty: s.saved.dirty } };
  });
  if (door === 'api' || door === 'create') await page.evaluate(async ({ id, door }) => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    const ok = door === 'api' ? await P.openProjectDocument(id) : await P.createAuthoringProject('Second project', [P.workspace().documents[0].template]);
    if (!ok) throw new Error(P.useAuthoringProjects.getState().error);
  }, { id: ids[1], door });
  else {
    await page.getByRole('button', { name: /^Project/ }).first().click();
    if (door === 'document') await page.locator(`[data-document="${ids[1]}"]`).click();
    else {
      await page.locator(`[data-document="${ids[1]}"]`).locator('..').getByRole('checkbox').check();
      if (door === 'brand') { await page.getByLabel('Brand for selected graphics').selectOption(external.look); await page.getByRole('button', { name: 'Apply brand', exact: true }).click(); }
      else await page.getByRole('button', { name: 'Save selected', exact: true }).click();
      await expect(page.getByTestId('project-note')).toContainText(door === 'brand' ? 'Brand applied' : 'graphics saved');
      expect(await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().documentId)).toBe(external.id);
    }
  }
  await flushAuthoringProject(page);
  const kept = await page.evaluate(async id => (await __noacgImport('/src/store/authoringProjects.ts')).workspace().documents.find(d => d.id === id), external.id);
  expect(kept).toBeDefined(); expect(kept!.template).toEqual(before.template); expect(kept!.history).toEqual(before.history); expect(kept!.saved).toEqual(before.saved);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await page.evaluate(async id => {
    const P = await __noacgImport('/src/store/authoringProjects.ts');
    if (!await P.openProjectDocument(id)) throw new Error(P.useAuthoringProjects.getState().error);
    const s = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const draft = s.port.read(); s.undo(); const undo = s.port.read(); s.redo();
    return { draft, undo, redo: s.port.read() };
  }, external.id);
  expect(reopened.draft).toEqual(before.template); expect(reopened.undo.html).not.toContain('External source must survive'); expect(reopened.redo).toEqual(before.template);
});

test('refused external retention and cancelled Home/starter switches keep the unfiled working source', async ({ page }) => {
  await armStorageFailure(page);
  const ids = await seedAuthoringProject(page);
  const externalId = await page.evaluate(async () => {
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    s.applyTemplate({ ...s.template, name: 'External refusal' }, { resetSampleData: true });
    return (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().documentId;
  });
  await editProjectText(page, 'Refused external must stay open'); await flushAuthoringProject(page);
  await fillStorage(page);
  const result = await page.evaluate(async id => {
    const P = await __noacgImport('/src/store/authoringProjects.ts'); const ok = await P.openProjectDocument(id);
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { ok, id: s.documentId, html: s.template.html };
  }, ids[0]);
  expect(result.ok).toBe(false); expect(result.id).toBe(externalId); expect(result.html).toContain('Refused external must stay open');
  await freeStorage(page);
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-cancel').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().documentId)).toBe(externalId);
  await page.getByRole('button', { name: /^Project/ }).first().click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByTestId('project-starter')).toBeVisible();
  await page.getByTestId('project-starter').getByRole('button', { name: /^Create project/ }).click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-cancel').click();
  const cancelled = await page.evaluate(async () => {
    const s = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { id: s.documentId, html: s.template.html, projects: (await __noacgImport('/src/store/authoringProjects.ts')).workspace().projects.length };
  });
  expect(cancelled.id).toBe(externalId); expect(cancelled.html).toContain('Refused external must stay open'); expect(cancelled.projects).toBe(1);
  await page.getByRole('button', { name: 'Close new project', exact: true }).click();
});

test('library Save As and same-private-id baseline changes retire old ports before binding refresh', async ({ page }) => {
  await seedAuthoringProject(page);
  const result = await page.evaluate(async () => {
    const S = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore;
    const D = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const A = await __noacgImport('/src/store/saveActions.ts');
    const s = S.getState(); s.applyTemplate({ ...s.template, name: 'External ownership' }, { resetSampleData: true });
    const privateId = S.getState().documentId, initial = D.activeEditorSession();
    const closed = (port: typeof initial.port) => { try { port.restore({ selectedParts: [], time: 99 }); return ''; } catch (e) { return String(e); } };
    const first = await A.saveGraphicAs('Ownership first', { kind: 'standalone' });
    if (!first.ok) throw new Error(first.error!);
    const initialClosed = closed(initial.port), firstSession = D.activeEditorSession();
    const firstOwner = { public: firstSession.documentId, instance: firstSession.instanceId, private: S.getState().documentId, graphic: S.getState().saved.graphicId };
    const second = await A.saveGraphicAs('Ownership second', { kind: 'standalone' });
    if (!second.ok) throw new Error(second.error!);
    const firstClosed = closed(firstSession.port), secondSession = D.activeEditorSession();
    const secondOwner = { public: secondSession.documentId, instance: secondSession.instanceId, private: S.getState().documentId, graphic: S.getState().saved.graphicId };
    const source = secondSession.port.read();
    S.setState({ baseline: structuredClone(S.getState().baseline) });
    const baselineClosed = closed(secondSession.port); // No call to activeEditorSession yet.
    const refreshed = D.activeEditorSession();
    const baselineOwner = { public: refreshed.documentId, instance: refreshed.instanceId, private: S.getState().documentId, graphic: S.getState().saved.graphicId };
    return { privateId, initialClosed, firstClosed, baselineClosed, first: first.graphicId, second: second.graphicId,
      firstOwner, secondOwner, baselineOwner, sourceKept: JSON.stringify(refreshed.port.read()) === JSON.stringify(source) };
  });
  for (const closed of [result.initialClosed, result.firstClosed, result.baselineClosed]) expect(closed).toContain('closed');
  expect(result.firstOwner.public).toBe(result.first); expect(result.secondOwner.public).toBe(result.second); expect(result.first).not.toBe(result.second);
  expect(result.firstOwner.private).toBe(result.privateId); expect(result.secondOwner.private).toBe(result.privateId); expect(result.baselineOwner.private).toBe(result.privateId);
  expect(result.firstOwner.instance).not.toBe(result.secondOwner.instance); expect(result.secondOwner.instance).not.toBe(result.baselineOwner.instance);
  expect(result.baselineOwner.public).toBe(result.second); expect(result.baselineOwner.graphic).toBe(result.second); expect(result.sourceKept).toBe(true);
});

test('two retained drafts sharing a saved library link keep distinct public workspace ownership', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const result = await page.evaluate(async firstId => {
    const P = await __noacgImport('/src/store/authoringProjects.ts'), A = await __noacgImport('/src/store/saveActions.ts');
    const D = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts');
    const saved = await A.saveGraphicAs('Shared master identity', { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
    A.openGraphicById(saved.graphicId!);
    const secondId = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().documentId;
    if (!await P.keepCurrentInProject(P.workspace().projects[0].id)) throw new Error(P.useAuthoringProjects.getState().error);
    const secondPublic = D.activeEditorSession().documentId;
    if (!await P.openProjectDocument(firstId)) throw new Error(P.useAuthoringProjects.getState().error);
    const firstPublic = D.activeEditorSession().documentId;
    const links = P.workspace().documents.filter(d => d.id === firstId || d.id === secondId).map(d => d.saved.graphicId);
    return { firstId, secondId, firstPublic, secondPublic, links, graphic: saved.graphicId };
  }, ids[0]);
  expect(result.firstPublic).toBe(result.firstId); expect(result.secondPublic).toBe(result.secondId); expect(result.firstPublic).not.toBe(result.secondPublic);
  expect(result.links).toEqual([result.graphic, result.graphic]);
});

test('brand reapplication renders retained numeric and custom font bytes through undo redo and repeated application', async ({ page }) => {
  await seedAuthoringProject(page);
  const saira = 'data:font/woff2;base64,' + readFileSync('public/fonts/saira.woff2').toString('base64');
  const inter = 'data:font/woff2;base64,' + readFileSync('public/fonts/inter.woff2').toString('base64');
  const numeric = await page.evaluate(async () => {
    const D = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts'), F = await __noacgImport('/src/model/fonts.ts'), C = await __noacgImport('/src/model/cssVars.ts');
    const S = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore;
    const palette = { id: 'custom', name: 'Harbour', styleTags: ['minimal' as const], accent: '#16bb99', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' };
    const a = { id: 'render-a', name: 'A', updatedAt: '2026-11-12T00:00:00Z', brand: { styleTag: 'minimal' as const, palette, fontId: 'oswald', customFont: null } };
    const apply = (look: typeof a) => { const s = D.activeEditorSession(); s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'brand.apply', look }] }); };
    apply(a); const source = S.getState().template, anton = F.fontById('anton');
    const probe = '<span id="e4-number" style="position:absolute;left:40px;top:40px;display:inline-block;width:auto;font-family:var(--font-numeric);font-size:60px;font-weight:400;font-variant-numeric:tabular-nums;letter-spacing:0">0</span><span id="e4-heading" style="position:absolute;left:40px;top:140px;display:inline-block;width:auto;font-family:var(--font-heading);font-size:60px;font-weight:400;letter-spacing:0">HarbourWWW111</span><span id="e4-label" style="position:absolute;left:40px;top:240px;display:inline-block;width:auto;font-family:var(--font-label);font-size:60px;font-weight:400;letter-spacing:0">HarbourWWW111</span>';
    let css = F.ensureFontFace(C.setCssVariable(C.setCssVariable(source.css, 'font-heading', F.fontStack(anton)), 'font-numeric', F.numericFontStack(anton)), anton);
    if (C.getCssVariable(css, 'font-label') === null) css = css.replace(/:root\s*\{/, ':root { --font-label: "Inter", Arial, sans-serif;');
    const local = { ...source, css, html: source.html + probe }; S.getState().applyTemplate(local);
    const b = { ...a, id: 'render-b', brand: { ...a.brand, fontId: 'inter' } }; apply(b);
    const session = D.activeEditorSession(), next = session.port.read(); session.undo(); const undo = JSON.stringify(session.port.read()) === JSON.stringify(local); session.redo();
    const redo = JSON.stringify(session.port.read()) === JSON.stringify(next); apply(b);
    const repeated = JSON.stringify(session.port.read()) === JSON.stringify(next);
    return { undo, redo, repeated, numeric: C.getCssVariable(next.css, 'font-numeric'), expected: F.numericFontStack(anton) };
  });
  expect(numeric).toMatchObject({ undo: true, redo: true, repeated: true }); expect(numeric.numeric).toBe(numeric.expected);
  const frame = page.frameLocator('iframe[title="Foundation graphic preview"]');
  await expect(frame.locator('#e4-number')).toBeVisible(); await expect(frame.locator('#e4-number')).toHaveCSS('font-family', /Saira/);
  const widths = await frame.locator('#e4-number').evaluate(async (el, data) => {
    const face = await new FontFace('E4 expected Saira', `url(${data})`, { weight: '100 900' }).load(); document.fonts.add(face); await document.fonts.ready;
    const expected = el.cloneNode(true) as HTMLElement; expected.removeAttribute('id'); expected.style.fontFamily = 'E4 expected Saira'; el.after(expected);
    const got = [], want = [];
    for (let d = 0; d <= 9; d++) { el.textContent = expected.textContent = String(d); got.push(el.getBoundingClientRect().width); want.push(expected.getBoundingClientRect().width); }
    expected.remove(); return { got, want };
  }, saira);
  expect(Math.max(...widths.got) - Math.min(...widths.got)).toBeLessThanOrEqual(.5);
  widths.got.forEach((value, i) => expect(Math.abs(value - widths.want[i])).toBeLessThanOrEqual(.5));
  const custom = await page.evaluate(async ({ saira, inter }) => {
    const D = await __noacgImport('/src/components/editorFoundation/documentAdapter.ts'), F = await __noacgImport('/src/model/fonts.ts'), C = await __noacgImport('/src/model/cssVars.ts');
    const S = (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore, source = S.getState().template;
    const localFont = { family: 'Harbour Face', format: 'woff2' as const, asset: { path: 'fonts/brand.woff2', data: saira } };
    const local = { ...source, css: C.setCssVariable(C.setCssVariable(F.customFontFaceCss(localFont) + '\n' + source.css, 'font-heading', F.customFontStack(localFont)), 'font-numeric', F.numericFontStack(localFont)), assets: [...source.assets, localFont.asset] };
    S.getState().applyTemplate(local);
    const look = { id: 'render-c', name: 'C', updatedAt: '2026-11-12T00:00:00Z', brand: { styleTag: 'minimal' as const, fontId: null,
      palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal' as const], accent: '#16bb99', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' },
      customFont: { ...localFont, asset: { ...localFont.asset, data: inter } }, tokens: { 'font-label': F.customFontStack(localFont) } } };
    const apply = () => { const s = D.activeEditorSession(); s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'brand.apply', look }] }); };
    apply(); const session = D.activeEditorSession(), next = session.port.read(); session.undo(); const undo = JSON.stringify(session.port.read()) === JSON.stringify(local); session.redo();
    const redo = JSON.stringify(session.port.read()) === JSON.stringify(next); apply();
    return { undo, redo, repeated: JSON.stringify(session.port.read()) === JSON.stringify(next), kept: next.assets.some(a => a.path === localFont.asset.path && a.data === saira),
      incoming: next.assets.some(a => a.path !== localFont.asset.path && a.data === inter), heading: C.getCssVariable(next.css, 'font-heading'), label: C.getCssVariable(next.css, 'font-label') };
  }, { saira, inter });
  expect(custom).toMatchObject({ undo: true, redo: true, repeated: true, kept: true, incoming: true }); expect(custom.heading).toContain('Harbour Face'); expect(custom.label).toContain('Harbour Face Brand');
  await expect(frame.locator('#e4-heading')).toHaveCSS('font-family', /Harbour Face/); await expect(frame.locator('#e4-label')).toHaveCSS('font-family', /Harbour Face Brand/);
  for (const [id, data, family] of [['e4-heading', saira, 'E4 expected local'], ['e4-label', inter, 'E4 expected incoming']]) {
    const delta = await frame.locator('#' + id).evaluate(async (el, { data, family }) => {
      const face = await new FontFace(family, `url(${data})`, { weight: '100 900' }).load(); document.fonts.add(face); await document.fonts.ready;
      const expected = el.cloneNode(true) as HTMLElement; expected.removeAttribute('id'); expected.style.fontFamily = family; el.after(expected);
      const delta = Math.abs(el.getBoundingClientRect().width - expected.getBoundingClientRect().width); expected.remove(); return delta;
    }, { data, family });
    expect(delta).toBeLessThanOrEqual(.5);
  }
});

test('old commands refuse Save As and baseline replacement before any caller refreshes the binding', async ({ page }) => {
  type Fixture = {
    S: typeof import('/src/store/templateStore.ts'); D: typeof import('/src/components/editorFoundation/documentAdapter.ts');
    A: typeof import('/src/store/saveActions.ts'); C: typeof import('/src/components/editorFoundation/commandAdapter.ts');
    outcome?: { done: boolean; ok: boolean; graphic: string | null; privateId: string; portClosed: boolean; commandCode: string; oldSessionId: string; sourceKept: boolean; error?: string };
  };
  await seedAuthoringProject(page);
  await page.evaluate(async () => {
    const [S, D, A, C] = await Promise.all([__noacgImport('/src/store/templateStore.ts'), __noacgImport('/src/components/editorFoundation/documentAdapter.ts'), __noacgImport('/src/store/saveActions.ts'), __noacgImport('/src/components/editorFoundation/commandAdapter.ts')]);
    (window as unknown as { ownershipFixture: Fixture }).ownershipFixture = { S, D, A, C };
  });
  const privateId = await page.evaluate(() => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, s = w.S.useTemplateStore.getState();
    s.applyTemplate({ ...s.template, name: 'Command ownership' }, { resetSampleData: true });
    return w.S.useTemplateStore.getState().documentId;
  });
  const commandOwner = () => page.evaluate(() => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture;
    try { const i = w.C.activeEditorCommands().inspect(); return i.ok ? i.expected.documentId : 'closed'; } catch { return 'closed'; }
  });
  await expect.poll(commandOwner).toBe(privateId);
  const group = await page.evaluate(() => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, session = w.D.activeEditorSession();
    const make = (x: number) => session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'layer.create', geometry: { shape: 'rectangle', x, y: 300, width: 80, height: 90 } }] }).changedTargets[0];
    const members = [make(500), make(600)];
    const group = session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'group.create', selectors: members, box: { x: 500, y: 300, width: 180, height: 90 } }] }).changedTargets[0];
    w.S.useTemplateStore.getState().setSelectedParts([group]); return group;
  });
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await page.getByRole('button', { name: 'Enter group', exact: true }).click();
  await expect(page.locator('.ef-group-breadcrumbs button')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Canvas zoom', exact: true }).selectOption('2');
  const canvasBox = (await page.getByTestId('foundation-canvas').boundingBox())!;
  await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
  await page.mouse.down({ button: 'middle' }); await page.mouse.move(canvasBox.x + canvasBox.width / 2 + 45, canvasBox.y + canvasBox.height / 2 + 25); await page.mouse.up({ button: 'middle' });
  await page.getByTestId('foundation-ruler').focus(); await page.getByTestId('foundation-ruler').press('ArrowRight');
  const clock = await page.getByTestId('foundation-ruler').getAttribute('aria-valuenow');
  const artboard = await page.locator('.ef-artboard').getAttribute('style');
  await page.evaluate(() => { (window as unknown as { retainedViewFrame: Element | null }).retainedViewFrame = document.querySelector('iframe[title="Foundation graphic preview"]'); });
  const sameView = async () => {
    expect(await page.evaluate(() => (window as unknown as { retainedViewFrame: Element | null }).retainedViewFrame === document.querySelector('iframe[title="Foundation graphic preview"]'))).toBe(true);
    await expect(page.getByRole('combobox', { name: 'Canvas zoom', exact: true })).toHaveValue('2');
    await expect(page.getByTestId('foundation-ruler')).toHaveAttribute('aria-valuenow', clock!);
    await expect(page.locator('.ef-group-breadcrumbs button')).toHaveCount(2);
    expect(await page.locator('.ef-artboard').getAttribute('style')).toBe(artboard);
    expect(group).not.toBe('');
  };
  let lastGraphic = '';
  for (const name of ['Command first save', 'Command Save As']) {
    await page.evaluate(name => {
      const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, c = w.C.activeEditorCommands(), i = c.inspect();
      if (!i.ok) throw new Error(i.refusal.message);
      const old = c.session.port, source = old.read(), artwork = (s: typeof source) => JSON.stringify({ html: s.html, css: s.css, js: s.js, assets: s.assets });
      w.outcome = undefined;
      void w.A.saveGraphicAs(name, { kind: 'standalone' }).then(saved => {
        let portClosed = false; try { old.restore({ selectedParts: [], time: 99 }); } catch { portClosed = true; }
        const refused = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
        const state = w.S.useTemplateStore.getState();
        w.outcome = { done: true, ok: saved.ok, graphic: saved.graphicId ?? null, privateId: state.documentId,
          portClosed, commandCode: refused.ok ? 'accepted' : refused.refusal.code, oldSessionId: i.expected.sessionId, sourceKept: artwork(state.template) === artwork(source), error: saved.error };
      }).catch(error => { w.outcome = { done: true, ok: false, graphic: null, privateId: '', portClosed: false, commandCode: '', oldSessionId: '', sourceKept: false, error: String(error) }; });
    }, name);
    await expect.poll(() => page.evaluate(() => (window as unknown as { ownershipFixture: Fixture }).ownershipFixture.outcome?.done ?? false)).toBe(true);
    const result = await page.evaluate(() => (window as unknown as { ownershipFixture: Fixture }).ownershipFixture.outcome!);
    expect(result).toMatchObject({ ok: true, privateId, portClosed: true, commandCode: 'session_closed', sourceKept: true });
    expect(result.graphic).not.toBe(lastGraphic); lastGraphic = result.graphic!;
    await expect.poll(commandOwner).toBe(lastGraphic);
    await sameView();
    const stale = await page.evaluate(oldSessionId => {
      const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, c = w.C.activeEditorCommands(), i = c.inspect();
      if (!i.ok) throw new Error(i.refusal.message);
      const before = JSON.stringify(w.S.useTemplateStore.getState().template);
      const refused = c.apply({ expected: { ...i.expected, sessionId: oldSessionId }, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
      return { code: refused.ok ? 'accepted' : refused.refusal.code, sourceKept: before === JSON.stringify(w.S.useTemplateStore.getState().template), receiverChanged: i.expected.sessionId !== oldSessionId };
    }, result.oldSessionId);
    expect(stale).toEqual({ code: 'stale_context', sourceKept: true, receiverChanged: true });
  }
  const baseline = await page.evaluate(() => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, c = w.C.activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw new Error(i.refusal.message);
    const old = c.session.port, before = JSON.stringify(old.read()), state = w.S.useTemplateStore.getState();
    w.S.useTemplateStore.setState({ baseline: structuredClone(state.baseline) });
    let closed = false; try { old.restore({ selectedParts: [], time: 99 }); } catch { closed = true; }
    const refused = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    return { closed, code: refused.ok ? 'accepted' : refused.refusal.code, sourceKept: JSON.stringify(w.S.useTemplateStore.getState().template) === before, privateId: w.S.useTemplateStore.getState().documentId, oldSessionId: i.expected.sessionId };
  });
  expect(baseline).toMatchObject({ closed: true, code: 'session_closed', sourceKept: true, privateId });
  await expect.poll(commandOwner).toBe(lastGraphic);
  const staleBaseline = await page.evaluate(oldSessionId => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, c = w.C.activeEditorCommands(), i = c.inspect();
    if (!i.ok) throw new Error(i.refusal.message);
    const before = JSON.stringify(w.S.useTemplateStore.getState().template);
    const refused = c.apply({ expected: { ...i.expected, sessionId: oldSessionId }, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    return { code: refused.ok ? 'accepted' : refused.refusal.code, sourceKept: before === JSON.stringify(w.S.useTemplateStore.getState().template), receiverChanged: i.expected.sessionId !== oldSessionId };
  }, baseline.oldSessionId);
  expect(staleBaseline).toEqual({ code: 'stale_context', sourceKept: true, receiverChanged: true });
  await sameView();
  const reopened = await page.evaluate(id => {
    const w = (window as unknown as { ownershipFixture: Fixture }).ownershipFixture, old = w.D.activeEditorSession(), instance = old.instanceId;
    w.A.openGraphicById(id);
    let closed = false; try { old.port.restore({ selectedParts: [], time: 99 }); } catch { closed = true; }
    return { closed, instance, privateId: w.S.useTemplateStore.getState().documentId };
  }, lastGraphic);
  expect(reopened.closed).toBe(true); expect(reopened.privateId).not.toBe(privateId);
  await expect.poll(() => page.evaluate(() => (window as unknown as { ownershipFixture: Fixture }).ownershipFixture.C.activeEditorCommands().session.instanceId)).not.toBe(reopened.instance);
  expect(await page.evaluate(() => (window as unknown as { retainedViewFrame: Element | null }).retainedViewFrame === document.querySelector('iframe[title="Foundation graphic preview"]'))).toBe(false);
  await expect(page.getByRole('combobox', { name: 'Canvas zoom', exact: true })).toHaveValue('1');
  await expect(page.locator('.ef-group-breadcrumbs button')).toHaveCount(1);
  expect(await page.getByTestId('foundation-ruler').getAttribute('aria-valuenow')).not.toBe(clock);
});

for (const draft of ['pen', 'inline', 'pointer', 'image'] as const) test(`same-private baseline rebind discards pending ${draft} work without changing source`, async ({ page }) => {
  await seedAuthoringProject(page);
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await page.evaluate(async () => {
    const [S, D] = await Promise.all([__noacgImport('/src/store/templateStore.ts'), __noacgImport('/src/components/editorFoundation/documentAdapter.ts')]);
    (window as unknown as { transientOwner: { S: typeof S; D: typeof D } }).transientOwner = { S, D };
  });
  const canvas = page.getByTestId('foundation-canvas'), box = (await canvas.boundingBox())!;
  if (draft === 'pen') {
    await page.getByRole('button', { name: 'pen tool', exact: true }).click();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await expect(page.locator('[data-pen-point]')).toHaveCount(1);
  } else if (draft === 'inline') {
    await page.locator('.ef-track[data-selector="#f0"] .ef-layer').first().click();
    const text = (await page.locator('.ef-selection rect').first().boundingBox())!;
    await page.mouse.dblclick(text.x + text.width / 2, text.y + text.height / 2);
    await expect(page.locator('.ef-inline-text textarea')).toBeVisible();
    await page.locator('.ef-inline-text textarea').fill('Retired inline draft');
  } else if (draft === 'pointer') {
    await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40);
  } else {
    const data = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32; canvas.getContext('2d')!.fillRect(0, 0, 32, 32); return canvas.toDataURL().split(',')[1]; });
    await page.evaluate(() => {
      const host = window as unknown as { releaseRead: () => void; readFinished: boolean }; host.readFinished = false;
      const read = FileReader.prototype.readAsDataURL, decode = HTMLImageElement.prototype.decode;
      FileReader.prototype.readAsDataURL = function(blob) { FileReader.prototype.readAsDataURL = read; host.releaseRead = read.bind(this, blob); };
      HTMLImageElement.prototype.decode = async function() { await decode.call(this); host.readFinished = true; HTMLImageElement.prototype.decode = decode; };
    });
    await page.getByTestId('image-add-input').setInputFiles({ name: 'retired.png', mimeType: 'image/png', buffer: Buffer.from(data, 'base64') });
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseRead?: unknown }).releaseRead)).toBe('function');
  }
  const retired = await page.evaluate(() => {
    const w = (window as unknown as { transientOwner: { S: typeof import('/src/store/templateStore.ts'); D: typeof import('/src/components/editorFoundation/documentAdapter.ts') } }).transientOwner;
    const old = w.D.activeEditorSession(), state = w.S.useTemplateStore.getState(), before = state.template;
    w.S.useTemplateStore.setState({ baseline: structuredClone(state.baseline) });
    let closed = false; try { old.port.restore({ selectedParts: [], time: 99 }); } catch { closed = true; }
    return { closed, before, privateId: state.documentId, instance: old.instanceId };
  });
  expect(retired.closed).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as { transientOwner: { D: typeof import('/src/components/editorFoundation/documentAdapter.ts') } }).transientOwner.D.activeEditorSession().instanceId)).not.toBe(retired.instance);
  await expect(canvas).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('[data-pen-point]')).toHaveCount(0); await expect(page.locator('.ef-inline-text textarea')).toHaveCount(0);
  if (draft === 'pointer') await page.mouse.up();
  if (draft === 'pen') { await canvas.focus(); await page.keyboard.press('Enter'); }
  if (draft === 'image') {
    await page.evaluate(() => (window as unknown as { releaseRead: () => void }).releaseRead());
    await expect.poll(() => page.evaluate(() => (window as unknown as { readFinished: boolean }).readFinished)).toBe(true);
    await expect(page.getByRole('button', { name: 'Add image file…', exact: true })).toBeEnabled();
  }
  const kept = await page.evaluate(() => { const state = (window as unknown as { transientOwner: { S: typeof import('/src/store/templateStore.ts') } }).transientOwner.S.useTemplateStore.getState(); return { id: state.documentId, source: state.template }; });
  expect(kept.id).toBe(retired.privateId); expect(kept.source).toEqual(retired.before);
});

type SerialWorkspace = {
  P: typeof import('/src/store/authoringProjects.ts'); M: typeof import('/src/model/project.ts');
  D: typeof import('/src/model/durableStore.ts'); S: typeof import('/src/store/templateStore.ts');
  A: typeof import('/src/store/saveActions.ts'); I: typeof import('/src/control/projectInstallation.ts');
  Sh: typeof import('/src/model/shows.ts'); R: typeof import('/src/app/router.ts'); E: typeof import('/src/components/editorFoundation/documentAdapter.ts'); done?: boolean; ok?: boolean; error?: string; linkDone?: boolean; linkOk?: boolean; linkError?: string | null;
};
async function prepareSerialWorkspace(page: Page) {
  await page.evaluate(async () => {
    const [P, M, D, S, A, I, Sh, R, E] = await Promise.all([__noacgImport('/src/store/authoringProjects.ts'), __noacgImport('/src/model/project.ts'),
      __noacgImport('/src/model/durableStore.ts'), __noacgImport('/src/store/templateStore.ts'), __noacgImport('/src/store/saveActions.ts'),
      __noacgImport('/src/control/projectInstallation.ts'), __noacgImport('/src/model/shows.ts'), __noacgImport('/src/app/router.ts'), __noacgImport('/src/components/editorFoundation/documentAdapter.ts')]);
    (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace = { P, M, D, S, A, I, Sh, R, E };
  });
}
async function parkWorkspaceOnHome(page: Page) {
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    h.done = false; h.error = undefined;
    void h.P.retainCurrentProjectDraft().then(ok => {
      if (!ok) throw new Error(h.P.useAuthoringProjects.getState().error);
      h.R.useRouter.getState().navigate({ view: 'home' }); h.done = true;
    }).catch(error => { h.error = String(error); h.done = true; });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.error)).toBeUndefined();
  await expect(page.getByTestId('home-page')).toBeVisible();
}

test('serial tab return preserves adopted projects document bundles and journal in a third fresh page', async ({ page, context }) => {
  const ids = await seedAuthoringProject(page); await editProjectText(page, 'A first retained source'); await flushAuthoringProject(page);
  await prepareSerialWorkspace(page); await parkWorkspaceOnHome(page);
  const b = await context.newPage(); await b.goto('/app#/home'); await awaitDurableReady(b); await prepareSerialWorkspace(b);
  await b.getByTestId('home-projects').getByRole('button', { name: /^E4 Intro/ }).click();
  await expect(b.getByTestId('editor-foundation')).toBeVisible(); await editProjectText(b, 'B retained second source');
  await b.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void (async () => {
      const saved = await h.A.saveGraphicAs('B saved intro', { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
      const show = h.Sh.createShowNamedChecked('B serial installation').show; await h.D.commitDurableWrites();
      await h.I.installProjectGraphics(show.id, [saved.graphicId!]);
      if (!await h.P.createAuthoringProject('B adopted project', [{ ...h.S.useTemplateStore.getState().template, name: 'B additional source' }])) throw new Error(h.P.useAuthoringProjects.getState().error);
      h.S.flushPendingProject(); await h.D.commitDurableWrites();
    })().then(() => { h.done = true; }).catch(error => { h.error = String(error); h.done = true; });
  });
  await expect.poll(() => b.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  expect(await b.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.error)).toBeUndefined();
  await parkWorkspaceOnHome(b); // Exactly one authoring editor was active at a time.
  const adopted = await b.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.workspace())) as import('../src/model/authoringDocument').AuthoringWorkspace);
  expect(adopted.projects).toHaveLength(2); expect(adopted.installations).toHaveLength(1);
  await expect.poll(() => page.evaluate(() => {
    const w = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.M.loadProject()?.workspace;
    return { projects: w?.projects.length, receipts: w?.installations?.length, changed: w?.documents.some(d => d.template.html.includes('B retained second source')) };
  }), { message: 'A must adopt the actual durable mirror before it resumes' }).toEqual({ projects: 2, receipts: 1, changed: true });
  await page.bringToFront();
  await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await editProjectText(page, 'A resumed source'); await flushAuthoringProject(page);
  await parkWorkspaceOnHome(page);
  const authored = await page.evaluate(id => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.workspace().documents.find(d => d.id === id))), ids[0]);
  const c = await context.newPage(); await c.goto('/app#/home'); await awaitDurableReady(c); await prepareSerialWorkspace(c);
  const persisted = await c.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.M.loadProject()!.workspace)) as import('../src/model/authoringDocument').AuthoringWorkspace);
  expect(persisted.projects).toEqual(adopted.projects); expect(persisted.installations).toEqual(adopted.installations);
  expect(persisted.documents.find(d => d.id === ids[0])).toEqual(authored);
  expect(authored.template.html).toContain('A resumed source'); expect(authored.history.some((t: { html: string }) => t.html.includes('A first retained source'))).toBe(true);
  for (const document of adopted.documents.filter(d => d.id !== ids[0])) expect(persisted.documents.find(d => d.id === document.id)).toEqual(document);
});

test('adopted v99 remains byte-identical despite a populated older staged workspace and all slot writers', async ({ page, context }) => {
  await seedAuthoringProject(page); await flushAuthoringProject(page); await prepareSerialWorkspace(page); await parkWorkspaceOnHome(page);
  const previous = await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, w = h.P.workspace();
    h.M.stageAuthoringWorkspace(w); return h.M.loadProject()!;
  });
  const b = await context.newPage(); await b.goto('/app#/home'); await awaitDurableReady(b); await prepareSerialWorkspace(b);
  await b.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    h.D.durable.setItem('spx-gfx-project', JSON.stringify({ ...h.M.loadProject()!, workspace: { v: 99, opaque: 'Future documents and receipts' } }));
    void h.D.commitDurableWrites().then(error => { if (error) h.error = error; h.done = true; });
  });
  await expect.poll(() => b.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  expect(await b.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.error)).toBeUndefined();
  const exact = await b.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.D.durable.getItem('spx-gfx-project'));
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.M.loadProject()?.workspace?.v)).toBe(99);
  const refused = await page.evaluate(previous => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const staged = h.M.authoringWorkspace()?.v; h.M.saveProject(previous.template); h.M.upsertProject(previous); h.M.clearProject();
    let explicit = ''; try { h.M.writeAuthoringWorkspace(previous.workspace!); } catch (error) { explicit = String(error); }
    const superseded = h.M.graphicSuperseded('not-authorized');
    return { staged, explicit, superseded, refusal: h.M.workspaceRefusal(), raw: h.D.durable.getItem('spx-gfx-project') };
  }, previous);
  expect(refused.staged).toBe(1); expect(refused.explicit).toContain('newer'); expect(refused.refusal).toContain('newer'); expect(refused.superseded).toBe(false); expect(refused.raw).toBe(exact);
  await expect(page.getByTestId('home-projects').getByRole('alert')).toContainText('newer');
  const c = await context.newPage(); await c.goto('/app#/home'); await awaitDurableReady(c); await prepareSerialWorkspace(c);
  expect(await c.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.D.durable.getItem('spx-gfx-project'))).toBe(exact);
  await expect(c.getByTestId('home-projects').getByRole('alert')).toContainText('newer');
});

for (const operation of ['project', 'install', 'rollback'] as const) test(`held ${operation} receipt preserves later view sample history and source through an ordinary slot write`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  const prepared = await page.evaluate(async operation => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const saved = await h.A.saveGraphicAs('Interleaving master', { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
    const show = h.Sh.createShowNamedChecked('Interleaving target').show; await h.D.commitDurableWrites();
    const installed = operation === 'rollback' ? await h.I.installProjectGraphics(show.id, [saved.graphicId!]) : undefined;
    h.S.flushPendingProject(); await h.D.commitDurableWrites();
    return { graphic: saved.graphicId!, show: show.id, project: h.P.workspace().projects[0].id, installation: installed?.id };
  }, operation);
  await installHeldWrite(page); await armHeldWrite(page, 'I', 'hold');
  await page.evaluate(({ operation, prepared }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false; h.ok = undefined; h.error = undefined;
    const writing = operation === 'project' ? h.P.renameAuthoringProject(prepared.project, 'Held project rename') : operation === 'install'
      ? h.I.installProjectGraphics(prepared.show, [prepared.graphic]) : h.I.retryProjectInstallation(prepared.installation!, true);
    void writing.then(result => { h.ok = typeof result === 'boolean' ? result : true; h.done = true; }).catch(error => { h.error = String(error); h.done = true; });
  }, { operation, prepared });
  await heldWriteReady(page);
  const intent = await page.evaluate(({ operation, id }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const receipt = h.P.workspace().installations?.find(p => p.target === id);
    return { receipt, count: h.Sh.loadShows().find(s => s.id === id)!.graphics.length, name: operation === 'project' ? h.P.workspace().projects[0].name : undefined };
  }, { operation, id: prepared.show });
  if (operation === 'project') expect(intent.name).toBe('Held project rename');
  else { expect(intent.receipt).toBeDefined(); expect(intent.count).toBe(operation === 'install' ? 0 : 1); if (operation === 'rollback') expect(intent.receipt!.rollback).toBeDefined(); }
  const expected = await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, session = h.E.activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'text.set', selector: '#f0', text: 'Later source during held receipt' }] });
    session.undo(); session.redo(); h.S.useTemplateStore.getState().setSampleValue('f0', 'Later sample during held receipt'); h.E.setSessionTime(.37, 0);
    h.S.flushPendingProject();
    const doc = h.P.workspace().documents.find(d => d.id === h.S.useTemplateStore.getState().documentId)!;
    const newest = h.D.lastDurableWrite('spx-gfx-project')!;
    return { doc: JSON.parse(JSON.stringify(doc)), submitted: JSON.parse(newest.value!).workspace, generation: h.M.workspaceGeneration() };
  });
  expect(expected.doc.template.html).toContain('Later source during held receipt'); expect(expected.doc.sampleData.f0).toBe('Later sample during held receipt');
  expect(expected.doc.view.time).toBe(.37); expect(expected.doc.view.cue).toBe(0); expect(expected.doc.history.length).toBeGreaterThan(0);
  if (intent.receipt) expect(expected.submitted.installations.find((p: { id: string }) => p.id === intent.receipt!.id)).toEqual(intent.receipt);
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.linkDone = false;
    void h.A.saveGraphicAs('Interleaving final link', { kind: 'standalone' }).then(saved => { h.linkOk = saved.ok; h.linkError = saved.error; h.linkDone = true; });
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.A.useSaveUi.getState().inFlight)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.linkDone)).toBe(false);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().saved.graphicId)).toBe(prepared.graphic);
  await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  if (operation === 'project') {
    expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.ok)).toBe(false);
    await expect(page.getByTestId('project-note')).toContainText('changed while saving');
  } else {
    expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.error)).toBeUndefined();
    expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.ok)).toBe(true);
  }
  await flushAuthoringProject(page);
  const after = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.workspace())) as import('../src/model/authoringDocument').AuthoringWorkspace);
  const kept = after.documents.find(d => d.id === ids[0])!;
  expect(kept.template.html).toBe(expected.doc.template.html); expect(kept.history).toEqual(expected.doc.history);
  expect(kept.sampleData).toEqual(expected.doc.sampleData); expect(kept.view?.time).toBe(.37); expect(kept.view?.cue).toBe(0);
  if (operation === 'project') expect(after.projects[0].name).toBe('Held project rename');
  else {
    const receipt = after.installations!.find(p => p.id === intent.receipt!.id)!;
    expect(receipt.status).toBe(operation === 'install' ? 'confirmed' : 'rolled-back'); expect(receipt.before).toEqual(intent.receipt!.before); expect(receipt.after).toEqual(intent.receipt!.after);
    if (operation === 'rollback') expect(receipt.rollback).toEqual(intent.receipt!.rollback);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.linkDone)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.linkError)).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.linkOk)).toBe(true);
  await flushAuthoringProject(page);
  const linked = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.workspace())) as import('../src/model/authoringDocument').AuthoringWorkspace);
  expect(linked.documents.find(d => d.id === ids[0])!.saved.graphicId).not.toBe(prepared.graphic);
  expect(linked.installations).toEqual(after.installations);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible(); await prepareSerialWorkspace(page);
  const reloaded = await page.evaluate(() => JSON.parse(JSON.stringify((window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.M.loadProject()!.workspace)) as import('../src/model/authoringDocument').AuthoringWorkspace);
  expect(reloaded.documents).toEqual(linked.documents); expect(reloaded.projects).toEqual(linked.projects); expect(reloaded.installations).toEqual(linked.installations);
});

test('same-private adopted revision refuses an old writer until explicit reload and rejects old packets', async ({ page, context }) => {
  const ids = await seedAuthoringProject(page); await editProjectText(page, 'A confirmed older revision'); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  const old = await page.evaluate(async () => {
    const C = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts'), c = C.activeEditorCommands(), inspected = c.inspect();
    if (!inspected.ok) throw new Error(inspected.refusal.message);
    return { expected: inspected.expected, privateId: (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().documentId };
  });
  await parkWorkspaceOnHome(page);
  const b = await context.newPage(); await b.goto('/app#/home'); await awaitDurableReady(b); await prepareSerialWorkspace(b);
  await b.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
  await expect(b.getByTestId('editor-foundation')).toBeVisible(); await editProjectText(b, 'B adopted newer same UUID'); await flushAuthoringProject(b); await parkWorkspaceOnHome(b); await flushAuthoringProject(b);
  await expect.poll(() => page.evaluate(id => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.M.loadProject()?.workspace?.documents.find(d => d.id === id)?.template.html, ids[0])).toContain('B adopted newer same UUID');
  const refused = await page.evaluate(async id => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, raw = h.D.durable.getItem('spx-gfx-project');
    const ok = await h.P.openProjectDocument(id);
    return { ok, error: h.P.useAuthoringProjects.getState().error, source: h.S.useTemplateStore.getState().template.html,
      privateId: h.S.useTemplateStore.getState().documentId, unchanged: raw === h.D.durable.getItem('spx-gfx-project') };
  }, ids[0]);
  expect(refused).toMatchObject({ ok: false, privateId: old.privateId, unchanged: true });
  expect(refused.error).toContain('changed in another tab'); expect(refused.source).toContain('A confirmed older revision');
  await expect(page.getByTestId('home-projects').getByRole('alert')).toContainText('changed in another tab');
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const loaded = await page.evaluate(async oldSession => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, C = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const c = C.activeEditorCommands(), inspected = c.inspect(); if (!inspected.ok) throw new Error(inspected.refusal.message);
    const before = JSON.stringify(h.S.useTemplateStore.getState().template);
    const reply = c.apply({ expected: { ...inspected.expected, sessionId: oldSession }, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 20, y: 20, width: 40, height: 40 } } }] });
    return { privateId: h.S.useTemplateStore.getState().documentId, publicId: c.session.documentId, instance: inspected.expected.sessionId,
      source: h.S.useTemplateStore.getState().template.html, code: reply.ok ? 'accepted' : reply.refusal.code, unchanged: before === JSON.stringify(h.S.useTemplateStore.getState().template) };
  }, old.expected.sessionId);
  expect(loaded.privateId).toBe(old.privateId); expect(loaded.publicId).toBe(old.expected.documentId); expect(loaded.instance).not.toBe(old.expected.sessionId);
  expect(loaded.source).toContain('B adopted newer same UUID'); expect(loaded.code).toBe('stale_context'); expect(loaded.unchanged).toBe(true);
});

for (const destination of ['pristine', 'reserved', 'new-project'] as const) test(`refused mint link cannot cross into ${destination} destination on reload or Save`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  const before = await page.evaluate(async ({ ids, destination }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    if (destination === 'reserved') {
      if (!await h.P.openProjectDocument(ids[1])) throw new Error(h.P.useAuthoringProjects.getState().error);
      h.S.flushPendingProject(); await h.D.commitDurableWrites();
      if (!await h.P.openProjectDocument(ids[0])) throw new Error(h.P.useAuthoringProjects.getState().error);
    }
    h.S.flushPendingProject(); await h.D.commitDurableWrites();
    const b = h.P.workspace().documents.find(d => d.id === ids[1])!;
    return { b, source: h.S.useTemplateStore.getState().template };
  }, { ids, destination });
  await installHeldWrite(page); await armHeldWrite(page, 'K', 'refuse');
  const departing = await page.evaluate(async () => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const saved = await h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' });
    const L = await __noacgImport('/src/model/library.ts');
    return { saved, record: L.graphicById(saved.graphicId!)!.template };
  });
  expect(departing.saved.ok).toBe(false);
  await page.evaluate(({ ids, destination }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    h.done = false;
    const operation = destination === 'new-project' ? h.P.createAuthoringProject('Following show', [h.P.workspace().documents.find(d => d.id === ids[1])!.template]) : h.P.openProjectDocument(ids[1]);
    void operation.then(ok => { h.ok = ok; h.error = h.P.useAuthoringProjects.getState().error; h.done = true; });
  }, { ids, destination });
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const selected = await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, slot = h.M.loadProject()!;
    return { ok: h.ok, error: h.error, active: slot.workspace!.active!, document: slot.workspace!.documents.find(d => d.id === slot.workspace!.active)!,
      outer: { template: slot.template, graphicId: slot.graphicId, reservedGraphicId: slot.reservedGraphicId, mintingReserved: slot.mintingReserved } };
  });
  expect(selected.ok, selected.error).toBe(true); expect(selected.document.saved.graphicId).toBeNull();
  expect(selected.outer.template).toEqual(before.b.template); expect(selected.outer.graphicId).toBeNull();
  expect(selected.outer.reservedGraphicId).toBe(selected.document.reservedGraphicId); expect(selected.outer.mintingReserved).toBe(selected.document.mintingReserved);
  expect(selected.outer.reservedGraphicId).not.toBe(departing.saved.graphicId);
  if (destination === 'reserved') expect(selected.document.reservedGraphicId).toBe(before.b.reservedGraphicId);
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  const boot = await page.evaluate(() => { const s = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState(); return { id: s.documentId, template: s.template, saved: s.saved }; });
  expect(boot.id).toBe(selected.active); expect(boot.template).toEqual(before.b.template); expect(boot.saved.graphicId).toBeNull();
  const ownSave = await page.evaluate(async () => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const saved = await h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' });
    return saved;
  });
  expect(ownSave.ok, ownSave.error ?? '').toBe(true); expect(ownSave.graphicId).not.toBe(departing.saved.graphicId);
  if (destination === 'reserved') expect(ownSave.graphicId).toBe(before.b.reservedGraphicId);
  const returned = await page.evaluate(async ({ id, graphic }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, L = await __noacgImport('/src/model/library.ts');
    if (!await h.P.openProjectDocument(id)) throw new Error(h.P.useAuthoringProjects.getState().error);
    const link = h.S.useTemplateStore.getState().saved.graphicId, saved = await h.A.saveCurrentGraphic();
    return { link, saved, record: L.graphicById(graphic)!.template, count: L.loadGraphics().length };
  }, { id: ids[0], graphic: departing.saved.graphicId! });
  expect(returned).toEqual({ link: departing.saved.graphicId, saved: 'saved', record: departing.record, count: 2 });
});

for (const outcome of ['confirmed', 'refused', 'changed', 'view', 'late-view'] as const) test(`project Discard ${outcome} keeps complete owner bundles through reload and Home reopen`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  const master = await page.evaluate(async () => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const saved = await h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' });
    if (!saved.ok) throw new Error(saved.error!);
    const show = h.Sh.createShowNamedChecked('Discard preservation rehearsal').show; await h.D.commitDurableWrites();
    const installation = await h.I.installProjectGraphics(show.id, [saved.graphicId!]);
    return { id: saved.graphicId!, template: h.S.useTemplateStore.getState().template, installation: installation.id };
  });
  await editProjectText(page, 'Draft to discard'); await flushAuthoringProject(page);
  const before = await page.evaluate(id => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.workspace().documents.find(d => d.id === id)!, ids[0]);
  await installHeldWrite(page);
  if (outcome !== 'confirmed') await armHeldWrite(page, 'D', outcome === 'refused' ? 'refuse' : outcome === 'late-view' ? 'late' : 'hold');
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; });
  });
  if (outcome === 'changed' || outcome === 'view' || outcome === 'late-view') {
    await heldWriteReady(page);
    if (outcome === 'changed') await editProjectText(page, 'Later edit during discard');
    else await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.E.setSessionTime(.42, 0));
    await releaseHeldWrite(page);
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const after = await page.evaluate(async ({ id, outcome, installation }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    // A real unrelated installation receipt must not revive a refused staged replacement.
    await h.I.retryProjectInstallation(installation);
    await h.D.commitDurableWrites();
    const s = h.S.useTemplateStore.getState();
    return { error: h.error, privateId: s.documentId, source: s.template, bundle: h.P.workspace().documents.find(d => d.id === id)!,
      other: h.P.workspace().documents.find(d => d.id !== id)!, active: h.P.workspace().active, outcome };
  }, { id: ids[0], outcome, installation: master.installation });
  if (outcome === 'confirmed') {
    expect(after.error).toBeUndefined(); expect(after.privateId).not.toBe(ids[0]); expect(after.active).toBeNull();
    expect(after.bundle.template).toEqual(master.template); expect(after.bundle.history).toEqual([]); expect(after.bundle.future).toEqual([]);
    expect(after.bundle.saved).toEqual({ graphicId: master.id, dirty: false }); expect(after.bundle.view).toBeUndefined(); expect(after.bundle.views).toBeUndefined();
  } else {
    expect(after.error).toBeTruthy(); expect(after.privateId).toBe(ids[0]);
    if (outcome === 'refused') expect(after.bundle).toEqual(before);
    else if (outcome === 'view' || outcome === 'late-view') { expect(after.bundle.template).toEqual(before.template); expect(after.bundle.history).toEqual(before.history); expect(after.bundle.view?.time).toBe(.42); }
    else { expect(after.bundle.template.html).toContain('Later edit during discard'); expect(after.bundle.history.length).toBeGreaterThan(before.history.length); }
  }
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    h.R.useRouter.getState().navigate({ view: 'home' });
  });
  await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await page.evaluate(() => { const s = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState(); return { template: s.template, history: s.history, future: s.future, link: s.saved.graphicId, time: (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.E.activeEditorSession().port.view().time }; });
  if (outcome === 'view' || outcome === 'late-view') expect(reopened.time).toBe(.42);
  expect(reopened.template).toEqual(after.bundle.template); expect(reopened.history).toEqual(after.bundle.history); expect(reopened.future).toEqual(after.bundle.future); expect(reopened.link).toBe(master.id);
});

test('a landed mint stays with its dormant private owner across a different selected document and reopen', async ({ page }) => {
  const ids = await seedAuthoringProject(page); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  await installHeldWrite(page); await armHeldWrite(page, 'L', 'hold');
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    void h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' });
  });
  await heldWriteReady(page);
  const selected = await page.evaluate(async ids => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, L = await __noacgImport('/src/model/library.ts');
    const before = h.P.workspace(), a = before.documents.find(d => d.id === ids[0])!, b = before.documents.find(d => d.id === ids[1])!;
    const writes = h.D.captureDurableWrites('spx-gfx-project', () => {
      h.M.writeAuthoringWorkspace({ ...before, active: ids[1] });
      const s = h.S.useTemplateStore.getState();
      h.M.saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility, h.S.captureProjectDocument(s));
    });
    const errors = await Promise.all(writes.receipts.map(h.D.commitDurableReceipt));
    const slot = h.M.loadProject()!;
    return { a, b, receipts: writes.receipts.length, errors, record: L.graphicById(a.reservedGraphicId!)!.template,
      active: slot.workspace!.active, storedA: slot.workspace!.documents.find(d => d.id === ids[0])!, outerReservation: slot.reservedGraphicId, outerSource: slot.template };
  }, ids);
  expect(selected.receipts).toBe(2); expect(selected.errors).toEqual([null, null]); expect(selected.active).toBe(ids[1]);
  expect(selected.a.saved.graphicId).toBeNull(); expect(selected.a.mintingReserved).toBe(true); expect(selected.storedA).toEqual(selected.a);
  expect(selected.outerSource).toEqual(selected.b.template); expect(selected.outerReservation).toBe(selected.b.reservedGraphicId);
  // The library transaction landed; only its answer was held. Reload simulates the lost answer.
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().saved.graphicId)).toBeNull();
  const recovered = await page.evaluate(async id => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, L = await __noacgImport('/src/model/library.ts');
    if (!await h.P.openProjectDocument(id)) throw new Error(h.P.useAuthoringProjects.getState().error);
    const s = h.S.useTemplateStore.getState(), link = s.saved.graphicId, source = s.template;
    const saved = await h.A.saveCurrentGraphic();
    return { link, source, saved, count: L.loadGraphics().length, record: L.graphicById(link!)!.template };
  }, ids[0]);
  expect(recovered.link).toBe(selected.a.reservedGraphicId); expect(recovered.source).toEqual(selected.a.template);
  expect(recovered.saved).toBe('saved'); expect(recovered.count).toBe(1); expect(recovered.record).toEqual(selected.record);
});

test('boot of an older readable workspace clears every absent active optional field rather than borrowing the outer slot', async ({ page }) => {
  const ids = await seedAuthoringProject(page); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  const expected = await page.evaluate(async ids => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, slot = h.M.loadProject()!;
    const w = slot.workspace!, b = w.documents.find(d => d.id === ids[1])!;
    const { aiSpec: _spec, aiThread: _thread, legibility: _legibility, reservedGraphicId: _reservation, mintingReserved: _mint, ...absent } = b;
    // Replay a supported older-v1 envelope from before coherent projection; no model calls.
    h.D.durable.setItem('spx-gfx-project', JSON.stringify({ ...slot, aiSpec: { version: 1, category: 'title', fields: [], styleNotes: 'Departing source' },
      aiThread: { version: 1, messages: [{ role: 'user', text: 'Departing source' }] }, legibility: { viewing: { profile: 'custom', note: 'Departing viewing' }, floors: 'safe' },
      mintingReserved: true, workspace: { ...w, active: ids[1], documents: w.documents.map(d => d.id === ids[1] ? absent : d) } }));
    await h.D.commitDurableWrites(); return absent;
  }, ids);
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  const boot = await page.evaluate(() => { const s = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState();
    return { id: s.documentId, template: s.template, baseline: s.baseline, history: s.history, future: s.future, aiSpec: s.aiSpec, aiThread: s.aiThread, legibility: s.legibility, saved: s.saved.graphicId }; });
  expect(boot).toEqual({ id: ids[1], template: expected.template, baseline: expected.baseline, history: expected.history, future: expected.future,
    aiSpec: null, aiThread: null, legibility: null, saved: null });
});

for (const adopted of ['future', 'newer'] as const) test(`an adopted ${adopted} envelope while Discard waits keeps the live owner and exact adopted bytes`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await editProjectText(page, 'Keep this draft for export'); await flushAuthoringProject(page); await prepareSerialWorkspace(page);
  const before = await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().template);
  await installHeldWrite(page); await armHeldWrite(page, 'D', 'hold');
  await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; });
  });
  await heldWriteReady(page);
  const future = await page.evaluate(async adopted => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, slot = h.M.loadProject()!;
    const w = slot.workspace!;
    const workspace = adopted === 'future' ? { v: 99, future: 'Keep these exact adopted bytes' } : { ...w,
      documents: w.documents.map(d => d.id === h.S.useTemplateStore.getState().documentId ? { ...d, template: { ...d.template, css: d.template.css + '\n/* Newer adopted source */' } } : d) };
    const raw = JSON.stringify({ ...slot, workspace });
    const captured = h.D.captureDurableWrites('spx-gfx-project', () => h.D.durable.setItem('spx-gfx-project', raw));
    const errors = await Promise.all(captured.receipts.map(h.D.commitDurableReceipt));
    return { raw, errors };
  }, adopted);
  expect(future.errors).toEqual([null]); await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const refused = await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, s = h.S.useTemplateStore.getState();
    return { error: h.error, source: s.template, id: s.documentId, raw: h.D.durable.getItem('spx-gfx-project'), refusal: h.M.workspaceRefusal() };
  });
  const message = adopted === 'future' ? 'newer or unreadable' : 'changed in another tab';
  expect(refused.error).toContain(message); expect(refused.refusal).toContain(message);
  expect(refused.id).toBe(ids[0]); expect(refused.source).toEqual(before); expect(refused.raw).toBe(future.raw);
});

// Selection is an independent view action: no later seek or edit may flush it for these cases.
for (const route of ['switch', 'autosave', 'home', 'save', 'save-as'] as const) test(`selection-only ${route} retains the exact owner source history and current view`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  if (route === 'save' || route === 'save-as') {
    const saved = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      return h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' }); });
    expect(saved.ok).toBe(true);
  }
  if (route === 'switch') {
    // Establish the visited owner's ordinary source-writer reservation before the view-only oracle.
    for (const id of [ids[1], ids[0]]) expect(await page.evaluate(id =>
      (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.P.openProjectDocument(id), id)).toBe(true);
  }
  await editProjectText(page, 'Selection-independent history'); await flushAuthoringProject(page);
  const before = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), workspace: h.P.workspace(), view: h.E.activeEditorSession().port.view() }; });
  await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().setSelectedParts(['#f0']));
  if (route === 'switch') {
    for (const id of [ids[1], ids[0]]) {
      await page.evaluate(id => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
        void h.P.openProjectDocument(id).then(ok => { h.ok = ok; h.done = true; }); }, id);
      await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
      expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.ok)).toBe(true);
    }
  } else if (route === 'home') {
    await parkWorkspaceOnHome(page);
    await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
    await expect(page.getByTestId('editor-foundation')).toBeVisible();
  } else if (route === 'autosave') {
    // Observe the ordinary debounce's durable output, rather than manually flushing it.
    await expect.poll(() => page.evaluate(id => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      return h.M.loadProject()?.workspace?.documents.find(d => d.id === id)?.view?.selectedParts; }, ids[0])).toEqual(['#f0']);
  } else {
    const saved = await page.evaluate(route => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      return route === 'save' ? h.A.saveCurrentGraphic() : h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' }); }, route);
    if (route === 'save') expect(saved).toBe('saved'); else expect(saved).toMatchObject({ ok: true });
  }
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  const after = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const s = h.S.useTemplateStore.getState(); return { document: h.S.captureProjectDocument(s, false), workspace: h.P.workspace(), view: h.E.activeEditorSession().port.view() }; });
  expect(after.document.id).toBe(ids[0]);
  expect(after.document.template).toEqual(route === 'save-as' ? { ...before.document.template, name: 'E4 Lower third 2' } : before.document.template);
  expect(after.document.baseline).toEqual(before.document.baseline); expect(after.document.history).toEqual(before.document.history); expect(after.document.future).toEqual(before.document.future);
  expect(after.document.views).toEqual(before.document.views); expect(after.document.sampleData).toEqual(before.document.sampleData);
  expect(after.view).toEqual({ ...before.view, selectedParts: ['#f0'] });
  expect(after.workspace.projects).toEqual(before.workspace.projects); expect(after.workspace.installations).toEqual(before.workspace.installations);
  expect(after.workspace.documents.filter(d => d.id !== ids[0])).toEqual(before.workspace.documents.filter(d => d.id !== ids[0]));
  if (route !== 'save-as') expect(after.document.reservedGraphicId).toBe(before.document.reservedGraphicId);
  if (route !== 'save-as' && route !== 'save') expect(after.document.saved).toEqual(before.document.saved);
});

for (const wait of ['replacement', 'failed-replacement', 'preliminary', 'queued', 'equal-view'] as const) test(`selection-only Discard ${wait} preserves the complete live owner through reload`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  if (wait === 'queued') {
    const saved = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      return h.A.saveGraphicAs(h.S.useTemplateStore.getState().template.name, { kind: 'standalone' }); });
    expect(saved.ok).toBe(true);
  }
  await editProjectText(page, 'Keep selection while waiting'); await flushAuthoringProject(page);
  const before = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), workspace: h.P.workspace(), view: h.E.activeEditorSession().port.view() }; });
  await installHeldWrite(page);
  await armHeldWrite(page, wait === 'preliminary' ? 'I' : wait === 'queued' ? 'L' : 'D', wait === 'failed-replacement' ? 'late' : 'hold');
  if (wait === 'preliminary') {
    await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      const s = h.S.useTemplateStore.getState(); h.M.saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility, h.S.captureProjectDocument(s)); });
    await heldWriteReady(page);
  }
  if (wait === 'queued') {
    await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      void h.A.saveCurrentGraphic().then(result => { h.linkOk = result === 'saved'; }); });
    await heldWriteReady(page);
  }
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; }); });
  if (wait !== 'preliminary' && wait !== 'queued') await heldWriteReady(page);
  const changed = await page.evaluate(wait => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const s = h.S.useTemplateStore.getState(), session = h.E.activeEditorSession(), old = session.commandState(), generation = h.M.workspaceGeneration();
    if (wait === 'equal-view') {
      s.setSelectedParts([...s.selectedParts]);
      h.S.useTemplateStore.setState({ sampleData: Object.fromEntries(Object.entries(s.sampleData).reverse()) });
      h.E.setSessionTime(session.port.view().time, session.port.view().cue); session.observeView(); session.commandState();
    } else { s.setSelectedPart('#f0'); s.toggleSelectedPart('#f0'); s.setSelectedParts(['#f0']); }
    return { old, next: session.commandState(), generation, nextGeneration: h.M.workspaceGeneration() }; }, wait);
  if (wait === 'equal-view') { expect(changed.next.contextToken).toBe(changed.old.contextToken); expect(changed.nextGeneration).toBe(changed.generation); }
  else { expect(changed.next.contextToken).not.toBe(changed.old.contextToken); expect(changed.nextGeneration).toBeGreaterThan(changed.generation); }
  await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const after = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { error: h.error, privateId: h.S.useTemplateStore.getState().documentId, document: h.P.workspace().documents[0], workspace: h.P.workspace() }; });
  if (wait === 'equal-view') { expect(after.error).toBeUndefined(); expect(after.privateId).not.toBe(ids[0]); expect(after.document.history).toEqual([]); }
  else {
    expect(after.error).toBeTruthy(); expect(after.privateId).toBe(ids[0]);
    expect(after.document.template).toEqual(before.document.template); expect(after.document.baseline).toEqual(before.document.baseline);
    expect(after.document.history).toEqual(before.document.history); expect(after.document.future).toEqual(before.document.future); expect(after.document.views).toEqual(before.document.views);
    expect(after.document.view).toEqual({ ...before.view, selectedParts: ['#f0'] });
    expect(after.workspace.projects).toEqual(before.workspace.projects); expect(after.workspace.installations).toEqual(before.workspace.installations);
    expect(after.workspace.documents.slice(1)).toEqual(before.workspace.documents.slice(1));
    await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
    const boot = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      const s = h.S.useTemplateStore.getState(); return { id: s.documentId, source: s.template, history: s.history, selected: s.selectedParts, view: h.E.activeEditorSession().port.view() }; });
    expect(boot).toEqual({ id: ids[0], source: before.document.template, history: before.document.history, selected: ['#f0'], view: { ...before.view, selectedParts: ['#f0'] } });
  }
});


for (const route of ['switch', 'home'] as const) test(`equivalent samples during held project ${route} preserve the submitted bundle and continuation`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  await editProjectText(page, 'Equivalent samples keep this source'); await flushAuthoringProject(page);
  await installHeldWrite(page); await armHeldWrite(page, 'I', 'hold');
  await page.evaluate(({ route, id }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void (route === 'switch' ? h.P.openProjectDocument(id) : h.P.retainCurrentProjectDraft()).then(ok => { h.ok = ok; h.done = true; });
  }, { route, id: ids[1] });
  await heldWriteReady(page);
  const observed = await page.evaluate(() => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const before = h.P.workspace(), generation = h.M.workspaceGeneration(), session = h.E.activeEditorSession(), token = session.commandState().contextToken;
    const s = h.S.useTemplateStore.getState();
    h.S.useTemplateStore.setState({ sampleData: Object.fromEntries(Object.entries(s.sampleData).reverse()) });
    return { before, after: h.P.workspace(), generation, afterGeneration: h.M.workspaceGeneration(), token, afterToken: session.commandState().contextToken, done: h.done };
  });
  expect(observed.after).toEqual(observed.before); expect(observed.afterGeneration).toBe(observed.generation);
  expect(observed.afterToken).toBe(observed.token); expect(observed.done).toBe(false);
  await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.ok)).toBe(true);
  const result = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { workspace: h.P.workspace(), id: h.S.useTemplateStore.getState().documentId, error: h.P.useAuthoringProjects.getState().error }; });
  expect(result.workspace).toEqual(observed.before); expect(result.id).toBe(route === 'switch' ? ids[1] : ids[0]); expect(result.error).toBe('');
});

for (const mode of ['preliminary-failure', 'correction-failure', 'correction-newer'] as const) test(`view correction after ${mode} retains the original failure and current owner`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  await editProjectText(page, 'Correction keeps this complete source'); await flushAuthoringProject(page);
  const before = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), view: h.E.activeEditorSession().port.view() }; });
  await installHeldWrite(page); await armHeldWrite(page, mode === 'preliminary-failure' ? 'I' : 'D', 'late');
  if (mode === 'preliminary-failure') {
    await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      const s = h.S.useTemplateStore.getState(); h.M.saveProject(s.template, s.baseline, s.saved, s.aiSpec, s.aiThread, s.legibility, h.S.captureProjectDocument(s)); });
    await heldWriteReady(page);
  }
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; }); });
  if (mode !== 'preliminary-failure') await heldWriteReady(page);
  await page.evaluate(mode => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.S.useTemplateStore.getState().setSelectedParts(['#f0']);
    if (mode === 'preliminary-failure') return;
    const host = window as unknown as { correctionPut?: boolean; releaseCorrection?: () => void };
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60; const stack = String(new Error().stack); Error.stackTraceLimit = limit;
      if (String(key) !== 'spx-gfx-project' || !stack.includes('keepChangedDiscard')) return put.call(this, value, key);
      IDBObjectStore.prototype.put = put; host.correctionPut = true;
      if (mode === 'correction-failure') throw new DOMException('Correction storage quota', 'QuotaExceededError');
      const request = put.call(this, value, key), tx = this.transaction;
      Object.defineProperty(tx, 'oncomplete', { configurable: true, set(handler: (event: Event) => void) {
        tx.addEventListener('complete', event => { host.releaseCorrection = () => handler.call(tx, event); }, { once: true });
      } });
      return request;
    };
  }, mode);
  await releaseHeldWrite(page);
  if (mode === 'correction-newer') {
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseCorrection?: unknown }).releaseCorrection)).toBe('function');
    expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(false);
    await page.evaluate(() => {
      const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      h.S.useTemplateStore.getState().setSelectedParts(['#f1']);
      (window as unknown as { releaseCorrection: () => void }).releaseCorrection();
    });
  }
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const after = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { error: h.error, document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), view: h.E.activeEditorSession().port.view(),
      corrected: (window as unknown as { correctionPut?: boolean }).correctionPut }; });
  expect(after.error).toContain('Your work could not be saved to browser storage.');
  if (mode === 'correction-failure') { expect(after.corrected).toBe(true); expect(after.error).toContain('Browser storage is full'); }
  if (mode === 'correction-newer') expect(after.error).toContain('latest changes are still open and could not be confirmed');
  const selectedParts = mode === 'correction-newer' ? ['#f1'] : ['#f0'];
  expect(after.document).toEqual({ ...before.document, view: { ...before.view, selectedParts } });
  expect(after.view).toEqual({ ...before.view, selectedParts });
  if (mode === 'preliminary-failure') {
    await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
    const boot = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
      return { id: h.S.useTemplateStore.getState().documentId, view: h.E.activeEditorSession().port.view() }; });
    expect(boot).toEqual({ id: ids[0], view: { ...before.view, selectedParts } });
  }
});


// Same-owner drain ordering is retained from October; this additionally pins the whole
// newer bundle and the confirmation boundary of its restoring write.
test('same-owner Discard drain writes clean then confirms the complete newer draft before refusing', async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  await editProjectText(page, 'Click-time draft'); await flushAuthoringProject(page);
  await installHeldWrite(page); await armHeldWrite(page, 'I', 'hold');
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const s = h.S.useTemplateStore.getState(); h.M.saveProject(s.template, s.baseline, s.saved, s.aiSpec, s.aiThread, s.legibility, h.S.captureProjectDocument(s)); });
  await heldWriteReady(page);
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; }); });
  await editProjectText(page, 'Newer source during drain');
  const newer = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    h.S.useTemplateStore.getState().addAsset({ path: 'images/newer.svg', data: 'data:image/svg+xml;base64,PHN2Zy8+' });
    h.S.useTemplateStore.getState().setSelectedParts(['#f0']); h.S.useTemplateStore.getState().setSampleValue('f0', 'Newer operator sample'); h.E.setSessionTime(.42, 0);
    return { document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), view: h.E.activeEditorSession().port.view(), workspace: h.P.workspace() }; });
  await armHeldWrite(page, 'D', 'hold'); await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => window.matrix.releases.filter(Boolean).length)).toBe(2);
  const clean = JSON.parse((await durableValue(page, 'spx-gfx-project'))!);
  expect(clean.dirty).toBe(false); expect(clean.workspace.documents.find((d: { id: string }) => d.id === ids[0]).history).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.S.useTemplateStore.getState().template)).toEqual(newer.document.template);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60; const stack = String(new Error().stack); Error.stackTraceLimit = limit;
      if (String(key) !== 'spx-gfx-project' || !stack.includes('keepChangedDiscard')) return put.call(this, value, key);
      IDBObjectStore.prototype.put = put;
      const host = window as unknown as { correction: unknown; releaseCorrection?: () => void }; host.correction = JSON.parse(String(value));
      const request = put.call(this, value, key), tx = this.transaction;
      Object.defineProperty(tx, 'oncomplete', { configurable: true, set(handler: (event: Event) => void) {
        tx.addEventListener('complete', event => { host.releaseCorrection = () => handler.call(tx, event); }, { once: true });
      } }); return request;
    };
  });
  await page.evaluate(() => window.matrix.releases[1]());
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseCorrection?: unknown }).releaseCorrection)).toBe('function');
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(false);
  const correcting = await page.evaluate(() => (window as unknown as { correction: { dirty: boolean; workspace: { documents: unknown[] } } }).correction);
  expect(correcting.dirty).toBe(true); expect(correcting.workspace.documents[0]).toEqual(newer.document);
  await page.evaluate(() => (window as unknown as { releaseCorrection: () => void }).releaseCorrection());
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.error)).toContain('changed while discarding');
  await expect(page.getByTestId('editor-foundation')).toBeVisible(); await expect(page.getByTestId('home-page')).toHaveCount(0);
  await page.reload(); await awaitDurableReady(page); await prepareSerialWorkspace(page);
  const boot = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { document: h.S.captureProjectDocument(h.S.useTemplateStore.getState(), false), view: h.E.activeEditorSession().port.view(), workspace: h.P.workspace() }; });
  expect(boot.document).toEqual(newer.document); expect(boot.view).toEqual(newer.view);
  expect(boot.workspace.projects).toEqual(newer.workspace.projects); expect(boot.workspace.documents.slice(1)).toEqual(newer.workspace.documents.slice(1));
});

for (const retirement of ['private-away-back', 'baseline-away-back', 'public-away-back', 'account', 'removed'] as const) test(`Discard drain refuses retired ${retirement} authority without submitting a replacement`, async ({ page }) => {
  const ids = await seedAuthoringProject(page); await prepareSerialWorkspace(page);
  await editProjectText(page, 'Retirement must preserve source'); await flushAuthoringProject(page);
  await installHeldWrite(page); await armHeldWrite(page, 'I', 'hold');
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    const s = h.S.useTemplateStore.getState(); h.M.saveProject(s.template, s.baseline, s.saved, s.aiSpec, s.aiThread, s.legibility, h.S.captureProjectDocument(s)); });
  await heldWriteReady(page);
  await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace; h.done = false;
    void h.A.discardCurrentGraphic().then(error => { h.error = error ?? undefined; h.done = true; }); });
  const before = await page.evaluate(async ({ retirement, id }) => {
    const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace, state = h.S.useTemplateStore.getState();
    const host = window as unknown as { discardSubmissions: number }; host.discardSubmissions = 0;
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      const limit = Error.stackTraceLimit; Error.stackTraceLimit = 60; const stack = String(new Error().stack); Error.stackTraceLimit = limit;
      if (String(key).startsWith('spx-gfx-project') && (stack.includes('discardDraft') || stack.includes('keepChangedDiscard'))) host.discardSubmissions++;
      return put.call(this, value, key);
    };
    if (retirement === 'private-away-back') { h.S.useTemplateStore.setState({ documentId: crypto.randomUUID() }); h.S.useTemplateStore.setState({ documentId: state.documentId }); }
    if (retirement === 'baseline-away-back') { h.S.useTemplateStore.setState({ baseline: structuredClone(state.baseline) }); h.S.useTemplateStore.setState({ baseline: state.baseline }); }
    if (retirement === 'public-away-back') { h.S.useTemplateStore.setState({ saved: { ...state.saved, graphicId: 'retired-public-id' } }); h.S.useTemplateStore.setState({ saved: state.saved }); }
    if (retirement === 'account' && !await h.D.adoptSignedOutLibrary(crypto.randomUUID())) throw new Error('Isolated browser account adoption failed.');
    if (retirement === 'removed') { const w = h.P.workspace(); h.M.stageAuthoringWorkspace({ ...w, active: null, documents: w.documents.filter(d => d.id !== id), projects: w.projects.map(p => ({ ...p, documents: p.documents.filter(d => d !== id) })) }); }
    return { id: h.S.useTemplateStore.getState().documentId, template: h.S.useTemplateStore.getState().template };
  }, { retirement, id: ids[0] });
  await releaseHeldWrite(page);
  await expect.poll(() => page.evaluate(() => (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace.done)).toBe(true);
  const after = await page.evaluate(() => { const h = (window as unknown as { serialWorkspace: SerialWorkspace }).serialWorkspace;
    return { error: h.error, id: h.S.useTemplateStore.getState().documentId, template: h.S.useTemplateStore.getState().template,
      submissions: (window as unknown as { discardSubmissions: number }).discardSubmissions }; });
  expect(after.error).toBeTruthy(); expect(after.submissions).toBe(0); expect(after.id).toBe(before.id); expect(after.template).toEqual(before.template);
});
