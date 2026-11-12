// covers: src/model/{project,authoringDocument,brandApplication,projectInstallation}.ts
// covers: src/store/{templateStore,saveActions,authoringProjects}.ts
// covers: src/components/editorFoundation/{documentAdapter,session,ProjectPanel,ProjectStarter}.{ts,tsx}
// covers: src/components/home/{HomePage,sections/ProjectsSection}.tsx, src/control/projectInstallation.ts
import { createHash, randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { mintAccount, signInOnHome, settleSync, SERVICE_ROLE_KEY, SUPABASE_URL } from '../configured/_helpers';
import { seedAuthoringProject, editProjectText, flushAuthoringProject } from '../_authoringProject';

// No hosted tenant is accepted for this qualification: users, documents and publications
// below belong only to the disposable Actions stack, whose unchanged guards prove auth.
test('real isolated auth persists project drafts/history and independent installed copies into a fresh browser', async ({ page, browser, baseURL }, info) => {
  expect(SERVICE_ROLE_KEY).not.toBe('');
  expect(process.env.E4_PROJECTS_SOURCE).toMatch(/^[a-f0-9]{40}$/);
  expect(process.env.E4_PROJECTS_RECEIPT).not.toBe('');
  expect(['127.0.0.1', 'localhost']).toContain(new URL(SUPABASE_URL).hostname);
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const nonce = randomUUID(), email = `e4-${nonce}@noacg.local`, password = `E4-${nonce}-fixture`;
  const uid = await mintAccount(admin, email, password);
  let second: Awaited<ReturnType<typeof browser.newContext>> | undefined;
  let receipt: Record<string, unknown> | undefined;
  try {
    await signInOnHome(page, email, password);
    const ids = await seedAuthoringProject(page);
    await editProjectText(page, 'Authenticated harbour draft');
    const prepared = await page.evaluate(async ids => {
      const P = await import('/src/store/authoringProjects.ts'), A = await import('/src/store/saveActions.ts');
      const S = await import('/src/model/shows.ts'), D = await import('/src/model/durableStore.ts');
      const I = await import('/src/control/projectInstallation.ts');
      const { createLook } = await import('/src/model/packets.ts');
      const look = createLook('Isolated harbour', { styleTag: 'minimal', fontId: 'oswald', customFont: null,
        palette: { id: 'custom', name: 'Harbour', styleTags: ['minimal'], accent: '#16bb99', text: '#ffffff', textDim: '#bbbbcc', panel: '#112233' },
        logo: { path: 'images/isolated.svg', data: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="#16bb99"/></svg>') } });
      const graphicIds = [];
      for (const id of ids) {
        if (!await P.openProjectDocument(id)) throw new Error(P.useAuthoringProjects.getState().error);
        if (id === ids[0]) {
          const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
          session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'brand.apply', look }] });
        }
        const result = await A.saveGraphicAs((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.name, { kind: 'standalone' });
        if (!result.ok) throw new Error(result.error!); graphicIds.push(result.graphicId!);
      }
      const a = S.createShowNamedChecked('Authenticated A').show, b = S.createShowNamedChecked('Authenticated B').show;
      await D.commitDurableWrites();
      await I.installProjectGraphics(a.id, graphicIds.slice(0, 2));
      await I.installProjectGraphics(b.id, graphicIds.slice(1));
      const beforeCopies = [a.id, b.id].map(id => S.loadShows().find(s => s.id === id)!);
      if (!await P.openProjectDocument(ids[0])) throw new Error(P.useAuthoringProjects.getState().error);
      return { graphicIds, showIds: [a.id, b.id], beforeCopies };
    }, ids);
    // A later master edit must leave both already-installed copies byte-for-byte intact.
    await editProjectText(page, 'Second authenticated master');
    const expectation = await page.evaluate(async () => {
      const A = await import('/src/store/saveActions.ts');
      if (await A.saveCurrentGraphic() !== 'saved') throw new Error('Master save failed.');
      const P = await import('/src/store/authoringProjects.ts');
      const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
      s.undo(); const undo = s.port.read(); s.redo();
      const documents = structuredClone(P.workspace().documents);
      (await import('/src/store/templateStore.ts')).flushPendingProject();
      await (await import('/src/model/durableStore.ts')).commitDurableWrites();
      return { documents, undo: undo.html, current: s.port.read().html };
    });
    expect(expectation.undo).toContain('Authenticated harbour draft'); expect(expectation.current).toContain('Second authenticated master');
    await flushAuthoringProject(page);
    await page.evaluate(async () => { await (await import('/src/backend/syncController.ts')).syncNow(); });
    await settleSync(page);
    const stored = await admin.from('documents').select('id,kind,body').eq('user_id', uid);
    expect(stored.error).toBeNull();
    expect(stored.data!.filter(r => r.kind === 'graphic')).toHaveLength(3);
    expect(stored.data!.filter(r => r.kind === 'show')).toHaveLength(2);
    const projectRow = stored.data!.find(r => r.kind === 'project')!;
    expect(projectRow.body.workspace.projects[0].documents).toEqual(ids);
    expect(projectRow.body.workspace.documents[0].history.length).toBeGreaterThan(0);
    // The first authoring page closes BEFORE the fresh context signs into this account.
    await page.close();
    second = await browser.newContext({ baseURL });
    const reopened = await second.newPage();
    await signInOnHome(reopened, email, password);
    await expect(reopened.getByTestId('home-projects')).toContainText('E4 show');
    await reopened.getByTestId('home-projects').getByRole('button', { name: /^E4 Lower third/ }).click();
    await expect(reopened.getByTestId('editor-foundation')).toBeVisible();
    const fresh = await reopened.evaluate(async ({ ids, showIds }) => {
      const P = await import('/src/store/authoringProjects.ts'), S = await import('/src/model/shows.ts');
      const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
      const source = s.port.read(), canUndo = s.canUndo(); s.undo(); const undo = s.port.read(); s.redo();
      return { source, undo, redone: s.port.read(), canUndo, projects: P.workspace().projects,
        drafts: P.workspace().documents.filter(d => ids.includes(d.id)).map(d => ({ id: d.id, template: d.template, history: d.history, future: d.future })),
        copies: showIds.map(id => S.loadShows().find(s => s.id === id)!) };
    }, { ids, showIds: prepared.showIds });
    const permission = await reopened.evaluate(async () => {
      const sb = (await (await import('/src/backend/supabase.ts')).getSupabase())!;
      const user = await sb.auth.getUser();
      const other = await sb.from('documents').select('id').neq('user_id', user.data.user!.id);
      return { user: user.data.user!.id, otherRows: other.data, error: other.error?.message ?? null };
    });
    expect(permission.user).toBe(uid); expect(permission.error).toBeNull(); expect(permission.otherRows).toEqual([]);
    expect(fresh.canUndo).toBe(true); expect(fresh.source.html).toContain('Second authenticated master');
    expect(fresh.undo.html).toContain('Authenticated harbour draft'); expect(fresh.redone).toEqual(fresh.source);
    expect(fresh.projects[0].documents).toEqual(ids);
    expect(fresh.copies).toEqual(prepared.beforeCopies);
    for (const document of expectation.documents) {
      const got = fresh.drafts.find(d => d.id === document.id)!;
      expect(got.template).toEqual(document.template); expect(got.history).toEqual(document.history); expect(got.future).toEqual(document.future);
    }
    receipt = {
      source: process.env.E4_PROJECTS_SOURCE, isolated: true, firstPageClosedBeforeFreshContext: true,
      documentIds: ids, graphicIds: prepared.graphicIds, productionIds: prepared.showIds,
      projectRow: projectRow.id, cloudKinds: stored.data!.map(r => r.kind).sort(), historyRestored: true,
      sourceSha256: createHash('sha256').update(JSON.stringify(fresh.source)).digest('hex'), independentCopies: true,
    };
  } finally {
    await second?.close();
    if (!page.isClosed()) await page.close();
    const removed = await admin.auth.admin.deleteUser(uid);
    expect(removed.error).toBeNull();
  }
  expect(receipt).toBeDefined();
  const body = JSON.stringify({ ...receipt, accountDeleted: true }, null, 2) + '\n';
  writeFileSync(process.env.E4_PROJECTS_RECEIPT!, body);
  await info.attach('isolated-persistence-receipt', { contentType: 'application/json', body: Buffer.from(body) });
});
