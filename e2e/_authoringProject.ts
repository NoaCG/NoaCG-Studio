import { expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

export async function seedAuthoringProject(page: Page, variants = ['lt01', 'card01', 'bug04']) {
  await page.goto('/app#/home');
  await awaitDurableReady(page);
  const wizard = page.getByTestId('creation-wizard');
  if (await wizard.isVisible()) await wizard.locator('.gallery-close').click();
  const ids = await page.evaluate(async variants => {
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await __noacgImport('/src/components/wizard/draft.ts');
    const { createAuthoringProject, workspace, useAuthoringProjects } = await __noacgImport('/src/store/authoringProjects.ts');
    const templates = variants.map((id, i) => {
      const v = variantById(id)!;
      const template = buildDraftTemplate(v, mergeDraft(initialDraft(), { variantId: id, category: v.category,
        lines: v.suggestedLines.map(l => ({ ...l })), logoEnabled: true }));
      return { ...template, name: ['E4 Lower third', 'E4 Intro', 'E4 Mark'][i] };
    });
    if (!await createAuthoringProject('E4 show', templates)) throw new Error(useAuthoringProjects.getState().error);
    (await __noacgImport('/src/components/editorFoundation/openNewEditor.ts')).openNewEditor();
    await new Promise(resolve => setTimeout(resolve));
    return workspace().projects.find(p => p.name === 'E4 show')!.documents;
  }, variants);
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  return ids;
}
export async function flushAuthoringProject(page: Page) {
  await page.evaluate(async () => { (await __noacgImport('/src/store/templateStore.ts')).flushPendingProject(); });
  await settleDurableWrites(page);
}
export async function editProjectText(page: Page, text: string) {
  await page.evaluate(async text => {
    const s = (await __noacgImport('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    s.execute({ documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'text.set', selector: '#f0', text }] });
  }, text);
}
