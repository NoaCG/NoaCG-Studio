// covers: src/components/editorFoundation/{ProjectPanel,ProjectStarter,documentAdapter,session,operations}.{ts,tsx}
// covers: src/components/editorFoundation/projects.css, src/components/home/sections/ProjectsSection.tsx
// covers: src/model/{project,authoringDocument,brandApplication,projectInstallation}.ts
// covers: src/store/{authoringProjects,templateStore,saveActions}.ts, src/control/projectInstallation.ts
// focus
import { test, expect } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { seedAuthoringProject, editProjectText, flushAuthoringProject } from './_authoringProject';
import { awaitDurableReady } from './_durable';
import { armStorageFailure, fillStorage, freeStorage, durableValue } from './_storage';

// These are distinct user flows: ownership/history, explicit brand revision, and safe installation.
// The transition oracle is the stated E4 Rules, with fixed expected sources and record counts.
test('project documents keep independent draft undo/redo through switching, reload and Home reopen', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const original = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  const sameDocumentStillOpen = await page.evaluate(async id => {
    const D = await import('/src/components/editorFoundation/documentAdapter.ts');
    const old = D.activeEditorSession().port;
    await (await import('/src/store/authoringProjects.ts')).openProjectDocument(id);
    D.activeEditorSession();
    try { old.restore({ selectedParts: [], time: 99 }); return ''; } catch (e) { return String(e); }
  }, ids[0]);
  expect(sameDocumentStillOpen).toBe(''); // Reopening the same live binding is idempotent; switching below closes it.
  await editProjectText(page, 'North coast news');
  await page.getByRole('button', { name: /^Project/ }).first().click();
  await page.evaluate(async () => { (window as unknown as { oldDocumentPort: unknown }).oldDocumentPort = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port; });
  await page.locator(`[data-document="${ids[1]}"]`).click();
  const stalePort = await page.evaluate(async () => {
    let error = '';
    try { (window as unknown as { oldDocumentPort: { restore(view: unknown): void } }).oldDocumentPort.restore({ selectedParts: ['#f0'], time: 99, sampleData: { f0: 'Stale previous document' } }); } catch (e) { error = String(e); }
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { error, selected: s.selectedParts, sample: s.sampleData.f0 };
  });
  expect(stalePort.error).toContain('closed'); expect(stalePort.selected).toEqual([]); expect(stalePort.sample).not.toBe('Stale previous document');
  await editProjectText(page, 'Evening edition');
  await page.locator(`[data-document="${ids[0]}"]`).click();
  const changed = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const s = activeEditorSession(), edited = s.port.read(); s.undo(); const undone = s.port.read(); s.redo();
    return { edited, undone, redone: s.port.read() };
  });
  expect(changed.undone).toEqual(original); expect(changed.redone).toEqual(changed.edited);
  await page.evaluate(async () => {
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    store.setSelectedParts(['#f0']); store.setSampleValue('f0', 'Independent rehearsal sample');
    (await import('/src/components/editorFoundation/documentAdapter.ts')).setSessionTime(.42);
  });
  await flushAuthoringProject(page);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { selected: s.selectedParts, sample: s.sampleData.f0, time: (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view().time };
  })).toEqual({ selected: ['#f0'], sample: 'Independent rehearsal sample', time: .42 });
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('home-projects')).toContainText('E4 show');
  await page.getByTestId('home-projects').getByRole('button', { name: /^E4 Intro/ }).click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const s = activeEditorSession(), edited = s.port.read(), undo = s.canUndo(); s.undo();
    return { edited: edited.html, undone: s.port.read().html, undo };
  });
  expect(result.edited).toContain('Evening edition'); expect(result.undo).toBe(true); expect(result.undone).not.toContain('Evening edition');
});

test('brand source and visible-logo receipt undo together; reapply keeps role, logo bytes and untouched documents', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const results = await page.evaluate(async ids => {
    const P = await import('/src/store/authoringProjects.ts');
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { setCssVariable, getCssVariable } = await import('/src/model/cssVars.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { brandSlotField } = await import('/src/model/packets.ts');
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
    const P = await import('/src/store/authoringProjects.ts');
    const result = await P.openProjectDocument(id);
    return { result, current: (await import('/src/store/templateStore.ts')).useTemplateStore.getState().documentId, error: P.useAuthoringProjects.getState().error };
  }, ids[1]);
  expect(refused.result).toBe(false); expect(refused.current).toBe(ids[0]); expect(refused.error).toContain('storage');
  await expect(page.locator('.ef-status [role="alert"]')).toContainText('storage');
  await freeStorage(page);
  const before = await page.evaluate(async () => {
    const P = await import('/src/store/authoringProjects.ts');
    const snapshot = structuredClone(P.workspace()); const id = snapshot.projects[0].id;
    if (!await P.renameAuthoringProject(id, 'Renamed E4')) throw new Error(P.useAuthoringProjects.getState().error);
    if (!await P.removeAuthoringProject(id)) throw new Error(P.useAuthoringProjects.getState().error);
    return snapshot.documents;
  });
  await flushAuthoringProject(page); await page.goto('/app#/home'); await awaitDurableReady(page);
  await expect(page.getByTestId('home-projects')).toContainText('Unfiled drafts');
  const after = await page.evaluate(async () => (await import('/src/store/authoringProjects.ts')).workspace());
  expect(after.projects).toEqual([]); expect(after.documents).toEqual(before);
  expect((await durableValue(page, 'spx-gfx-project'))).toContain('Keep the unsaved source');
});

test('selected graphics install independently into two rundowns, retry once and preserve newer edits on rollback', async ({ page }) => {
  const ids = await seedAuthoringProject(page);
  const result = await page.evaluate(async ids => {
    const P = await import('/src/store/authoringProjects.ts');
    const A = await import('/src/store/saveActions.ts');
    const S = await import('/src/model/shows.ts');
    const D = await import('/src/model/durableStore.ts');
    const I = await import('/src/control/projectInstallation.ts');
    const libraryIds = [];
    for (const id of ids) { if (!await P.openProjectDocument(id)) throw new Error(P.useAuthoringProjects.getState().error); const save = await A.saveGraphicAs((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.name, { kind: 'standalone' }); if (!save.ok) throw new Error(save.error!); libraryIds.push(save.graphicId!); }
    const first = S.createShowNamedChecked('E4 rehearsal A').show, second = S.createShowNamedChecked('E4 rehearsal B').show;
    await D.commitDurableWrites();
    const a = await I.installProjectGraphics(first.id, libraryIds.slice(0, 2));
    const aBeforeRetry = structuredClone(S.loadShows().find(s => s.id === first.id)!);
    await I.retryProjectInstallation(a.id);
    const aAfterRetry = structuredClone(S.loadShows().find(s => s.id === first.id)!);
    const b = await I.installProjectGraphics(second.id, [libraryIds[1], libraryIds[2]]);
    const bBefore = structuredClone(S.loadShows().find(s => s.id === second.id)!);
    // The library master edit is outside both installed source snapshots.
    const L = await import('/src/model/library.ts'); const master = L.graphicById(libraryIds[1])!;
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
    const P = await import('/src/store/authoringProjects.ts');
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
    const P = await import('/src/store/authoringProjects.ts');
    await P.openProjectDocument(id);
    const A = await import('/src/store/saveActions.ts');
    const saved = await A.saveGraphicAs('Recovery lower third', { kind: 'standalone' });
    if (!saved.ok) throw new Error(saved.error!);
    const show = (await import('/src/model/shows.ts')).createShowNamedChecked('Interrupted install').show;
    (await import('/src/store/templateStore.ts')).flushPendingProject();
    const error = await (await import('/src/model/durableStore.ts')).commitDurableWrites(); if (error) throw new Error(error);
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
    try { await (await import('/src/control/projectInstallation.ts')).installProjectGraphics(setup.showId, [setup.graphicId]); } catch (e) { error = String(e); }
    finally { IDBObjectStore.prototype.put = real; }
    const w = (await import('/src/store/authoringProjects.ts')).workspace();
    const plan = w.installations![0];
    return { error, plan, show: (await import('/src/model/shows.ts')).loadShows().find(s => s.id === setup.showId)! };
  }, { crash, setup });
  expect(interrupted.error).not.toBe(''); expect(interrupted.plan.status).toBe('prepared');
  expect(interrupted.show.graphics).toHaveLength(crash === 'target-refused' ? 0 : 1);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const recovered = await page.evaluate(async id => {
    await (await import('/src/control/projectInstallation.ts')).retryProjectInstallation(id);
    const P = (await import('/src/store/authoringProjects.ts')).workspace().installations![0];
    return { plan: P, show: (await import('/src/model/shows.ts')).loadShows().find(s => s.id === P.target)! };
  }, interrupted.plan.id);
  expect(recovered.plan.status).toBe('confirmed'); expect(recovered.show).toEqual(interrupted.plan.after);
  expect(recovered.show.graphics).toHaveLength(1); expect(recovered.show.cues).toHaveLength(1);
});

test('legacy adoption is additive and refusal preserves its source; unknown workspace stays read-only', async ({ page }) => {
  await armStorageFailure(page);
  await page.goto('/app#/home'); await awaitDurableReady(page);
  const legacy = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const S = await import('/src/store/templateStore.ts');
    S.useTemplateStore.getState().applyTemplate({ ...variantsFor('lower-third')[0].create({}), name: 'Legacy source' }, { resetSampleData: true });
    S.flushPendingProject(); await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    return S.useTemplateStore.getState().template;
  });
  const originalDisk = await durableValue(page, 'spx-gfx-project');
  await fillStorage(page);
  const refused = await page.evaluate(async () => {
    const P = await import('/src/store/authoringProjects.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return P.createAuthoringProject('New show', [{ ...t, name: 'Intro' }]);
  });
  expect(refused).toBe(false); expect(await durableValue(page, 'spx-gfx-project')).toBe(originalDisk);
  await freeStorage(page);
  const adopted = await page.evaluate(async () => {
    const P = await import('/src/store/authoringProjects.ts');
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    if (!await P.createAuthoringProject('New show', [{ ...t, name: 'Intro' }])) throw new Error(P.useAuthoringProjects.getState().error);
    return P.workspace();
  });
  expect(adopted.documents.find(d => d.template.name === 'Legacy source')?.template).toEqual(legacy);
  expect(adopted.documents).toHaveLength(2);
  expect(adopted.documents.find(d => d.template.name === 'Legacy source')!.history.length).toBe(0);
  const unknown = await page.evaluate(async () => {
    const M = await import('/src/model/project.ts'), D = await import('/src/model/durableStore.ts');
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
    const A = await import('/src/store/saveActions.ts');
    const result = await A.saveGraphicAs('Durable master', { kind: 'standalone' });
    if (!result.ok) throw new Error(result.error!);
    return (await import('/src/model/library.ts')).graphicById(result.graphicId!)!;
  });
  await editProjectText(page, 'Newer unsaved edition'); await flushAuthoringProject(page);
  await fillStorage(page);
  const failed = await page.evaluate(async id => {
    const A = await import('/src/store/saveActions.ts'), P = await import('/src/store/authoringProjects.ts');
    const saving = A.saveCurrentGraphic();
    const switched = await P.openProjectDocument(id);
    const result = await saving;
    return { result, switched, state: (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template,
      library: (await import('/src/model/library.ts')).loadGraphics() };
  }, ids[1]);
  expect(failed.result).toBe('failed'); expect(failed.switched).toBe(false); expect(failed.state.html).toContain('Newer unsaved edition');
  expect(failed.library).toEqual([initial]);
  await freeStorage(page);
  const retried = await page.evaluate(async () => {
    const result = await (await import('/src/store/saveActions.ts')).saveCurrentGraphic();
    return { result, library: (await import('/src/model/library.ts')).loadGraphics() };
  });
  expect(retried.result).toBe('saved'); expect(retried.library).toHaveLength(1); expect(retried.library[0].id).toBe(initial.id);
  expect(retried.library[0].template.html).toContain('Newer unsaved edition');
});

test('saved project reaches operator data In/Next/Out and exports bundled receiving fixtures', async ({ page, context }, info) => {
  const fixture = JSON.parse(readFileSync('e2e/fixtures/editor-projects/receiving.json', 'utf8'));
  const logo = readFileSync('e2e/fixtures/editor-projects/harbour.svg').toString('base64');
  const ids = await seedAuthoringProject(page, fixture.variants);
  const prepared = await page.evaluate(async ({ ids, fixture, logo }) => {
    const P = await import('/src/store/authoringProjects.ts'), A = await import('/src/store/saveActions.ts');
    const S = await import('/src/model/shows.ts'), D = await import('/src/model/durableStore.ts');
    const { createLook } = await import('/src/model/packets.ts');
    if (!await P.openProjectDocument(ids[1])) throw new Error(P.useAuthoringProjects.getState().error);
    const look = createLook('Harbour receiving', { styleTag: 'minimal', fontId: fixture.fontId, customFont: null,
      palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: fixture.accent, text: '#ffffff', textDim: '#b8c4d6', panel: '#112233' },
      logo: { path: 'images/harbour.svg', data: 'data:image/svg+xml;base64,' + logo } });
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [
      { kind: 'text.set', selector: '#f0', text: fixture.heading }, { kind: 'brand.apply', look },
    ] });
    const saved = await A.saveGraphicAs(fixture.name, { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
    const doc = (await import('/src/model/library.ts')).graphicById(saved.graphicId!)!;
    const outputs = [];
    for (const target of (await import('/src/export/registry.ts')).EXPORT_TARGETS.filter(t => fixture.expected.targets.includes(t.id))) {
      const zip = await target.build(doc.template, { sampleData: { f0: fixture.heading } });
      outputs.push({ id: target.id, base64: await zip.generateAsync({ type: 'base64' }) });
    }
    const show = S.createShowNamedChecked('E4 operator rehearsal').show; await D.commitDurableWrites();
    await (await import('/src/control/projectInstallation.ts')).installProjectGraphics(show.id, [doc.id]);
    (await import('/src/app/router.ts')).useRouter.getState().navigate({ view: 'production', id: show.id });
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
  await page.getByTestId('verb-out').click();
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgMachineState(): { groups: { main: string } } }).noacgMachineState().groups.main)).toBe('off');
  await expect(program.locator('.info-card')).toHaveCSS('opacity', '0');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('program-stage')).toHaveAttribute('data-plays', '2');
  await expect.poll(() => program.locator('body').evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
  await page.evaluate(async () => {
    const L = await import('/src/model/library.ts'), C = await import('/src/model/cssVars.ts');
    const master = L.loadGraphics().find(g => g.name === 'E4 Receiving Steps')!;
    L.updateGraphic(master.id, { template: { ...master.template, css: C.setCssVariable(master.template.css, 'accent', '#ff0000') } });
    await (await import('/src/model/durableStore.ts')).commitDurableWrites();
  });
  await expect(program.locator('#f0')).toHaveText(fixture.operatorHeading);
  expect(await program.locator('html').evaluate(el => getComputedStyle(el).getPropertyValue('--accent').trim())).toBe(fixture.accent);
  await page.screenshot({ path: info.outputPath('operator-rehearsal.png') });
  const manifest: Record<string, unknown> = { sourceCanonicalSha256: createHash('sha256').update(JSON.stringify(prepared.source)).digest('hex'), sourceFileSha256: createHash('sha256').update(JSON.stringify(prepared.source, null, 2) + '\n').digest('hex'),
    fixture, operator: { data: fixture.operatorHeading, states: [1, 2, 'off', 1], entrances: 2 }, packages: [], browserOnly: true };
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
        await receiver.evaluate(() => (window as unknown as { stop(): void }).stop());
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgMachineState(): { groups: { main: string } } }).noacgMachineState().groups.main)).toBe('off');
        await expect(receiver.locator('.info-card')).toHaveCSS('opacity', '0');
        await receiver.evaluate(() => (window as unknown as { play(): void }).play());
        await expect.poll(() => receiver.evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)).toBe(1);
        await receiver.screenshot({ path: info.outputPath(`${output.id}-replay.png`) });
        expect(missing.filter(path => !path.endsWith('favicon.ico'))).toEqual([]);
        runtimeReceipt = { optionalRelay: '404; standalone static server', data: fixture.heading, states: [1, 2, 'off', 1], assets, missing };
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
    const S = (await import('/src/store/templateStore.ts')).useTemplateStore;
    const s = S.getState(); s.applyTemplate({ ...s.template, name: 'External harbour draft' }, { resetSampleData: true });
    const look = (await import('/src/model/packets.ts')).createLook('Batch brand', { styleTag: 'minimal', fontId: 'inter', customFont: null,
      palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: '#16bb99', text: '#ffffff', textDim: '#aaaabb', panel: '#112233' } });
    return { id: S.getState().documentId, look: look.id };
  });
  await editProjectText(page, 'External source must survive');
  await flushAuthoringProject(page);
  const before = await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { template: s.template, history: s.history, saved: { graphicId: s.saved.graphicId, dirty: s.saved.dirty } };
  });
  if (door === 'api' || door === 'create') await page.evaluate(async ({ id, door }) => {
    const P = await import('/src/store/authoringProjects.ts');
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
      expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().documentId)).toBe(external.id);
    }
  }
  await flushAuthoringProject(page);
  const kept = await page.evaluate(async id => (await import('/src/store/authoringProjects.ts')).workspace().documents.find(d => d.id === id), external.id);
  expect(kept).toBeDefined(); expect(kept!.template).toEqual(before.template); expect(kept!.history).toEqual(before.history); expect(kept!.saved).toEqual(before.saved);
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await page.evaluate(async id => {
    const P = await import('/src/store/authoringProjects.ts');
    if (!await P.openProjectDocument(id)) throw new Error(P.useAuthoringProjects.getState().error);
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const draft = s.port.read(); s.undo(); const undo = s.port.read(); s.redo();
    return { draft, undo, redo: s.port.read() };
  }, external.id);
  expect(reopened.draft).toEqual(before.template); expect(reopened.undo.html).not.toContain('External source must survive'); expect(reopened.redo).toEqual(before.template);
});

test('refused external retention and cancelled Home/starter switches keep the unfiled working source', async ({ page }) => {
  await armStorageFailure(page);
  const ids = await seedAuthoringProject(page);
  const externalId = await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    s.applyTemplate({ ...s.template, name: 'External refusal' }, { resetSampleData: true });
    return (await import('/src/store/templateStore.ts')).useTemplateStore.getState().documentId;
  });
  await editProjectText(page, 'Refused external must stay open'); await flushAuthoringProject(page);
  await fillStorage(page);
  const result = await page.evaluate(async id => {
    const P = await import('/src/store/authoringProjects.ts'); const ok = await P.openProjectDocument(id);
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { ok, id: s.documentId, html: s.template.html };
  }, ids[0]);
  expect(result.ok).toBe(false); expect(result.id).toBe(externalId); expect(result.html).toContain('Refused external must stay open');
  await freeStorage(page);
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-cancel').click();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().documentId)).toBe(externalId);
  await page.getByRole('button', { name: /^Project/ }).first().click();
  await page.getByRole('button', { name: 'New project', exact: true }).click();
  await expect(page.getByTestId('project-starter')).toBeVisible();
  await page.getByTestId('project-starter').getByRole('button', { name: /^Create project/ }).click();
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await page.getByTestId('switch-cancel').click();
  const cancelled = await page.evaluate(async () => {
    const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
    return { id: s.documentId, html: s.template.html, projects: (await import('/src/store/authoringProjects.ts')).workspace().projects.length };
  });
  expect(cancelled.id).toBe(externalId); expect(cancelled.html).toContain('Refused external must stay open'); expect(cancelled.projects).toBe(1);
  await page.getByRole('button', { name: 'Close new project', exact: true }).click();
});

test('library Save As and same-private-id baseline changes retire old ports before binding refresh', async ({ page }) => {
  await seedAuthoringProject(page);
  const result = await page.evaluate(async () => {
    const S = (await import('/src/store/templateStore.ts')).useTemplateStore;
    const D = await import('/src/components/editorFoundation/documentAdapter.ts');
    const A = await import('/src/store/saveActions.ts');
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
    const P = await import('/src/store/authoringProjects.ts'), A = await import('/src/store/saveActions.ts');
    const D = await import('/src/components/editorFoundation/documentAdapter.ts');
    const saved = await A.saveGraphicAs('Shared master identity', { kind: 'standalone' }); if (!saved.ok) throw new Error(saved.error!);
    A.openGraphicById(saved.graphicId!);
    const secondId = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().documentId;
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
    const D = await import('/src/components/editorFoundation/documentAdapter.ts'), F = await import('/src/model/fonts.ts'), C = await import('/src/model/cssVars.ts');
    const S = (await import('/src/store/templateStore.ts')).useTemplateStore;
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
    const D = await import('/src/components/editorFoundation/documentAdapter.ts'), F = await import('/src/model/fonts.ts'), C = await import('/src/model/cssVars.ts');
    const S = (await import('/src/store/templateStore.ts')).useTemplateStore, source = S.getState().template;
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
    const [S, D, A, C] = await Promise.all([import('/src/store/templateStore.ts'), import('/src/components/editorFoundation/documentAdapter.ts'), import('/src/store/saveActions.ts'), import('/src/components/editorFoundation/commandAdapter.ts')]);
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
});
