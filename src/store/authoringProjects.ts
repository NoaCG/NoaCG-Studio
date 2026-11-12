import { create } from 'zustand';
import { useTemplateStore, flushPendingProject, syncSampleData, scheduleProjectAutosave } from './templateStore';
import { useSaveUi } from './saveActions';
import { authoringWorkspace, stageAuthoringWorkspace, writeAuthoringWorkspace, workspaceRefusal, loadProject, saveProject, documentReservation, resumeReservation, releaseReservation, isOwnReservation } from '../model/project';
import { readableWorkspace, type AuthoringWorkspace, type AuthoringDocument, type HistoryViews, type DocumentView } from '../model/authoringDocument';
import { captureDurableWrites, commitDurableReceipt } from '../model/durableStore';
import { uuid } from '../model/id';
import type { SpxTemplate } from '../model/types';

export const useAuthoringProjects = create<{ revision: number; busy: boolean; error: string }>(() => ({ revision: 0, busy: false, error: '' }));
let restoring = false;
let views: { id: string; history: HistoryViews; view: DocumentView } | null = null;
export function workspace(): AuthoringWorkspace {
  const value = authoringWorkspace();
  if (value !== undefined && !readableWorkspace(value)) throw new Error(workspaceRefusal()!);
  return value ?? { v: 1, projects: [], documents: [], active: null };
}
function stage(value: AuthoringWorkspace) {
  stageAuthoringWorkspace(value);
  useAuthoringProjects.setState(s => ({ revision: s.revision + 1 }));
}
type State = ReturnType<typeof useTemplateStore.getState>;
function snapshot(s: State, previous?: AuthoringDocument): AuthoringDocument {
  return { id: s.documentId, template: s.template, baseline: s.baseline, history: s.history, future: s.future,
    sampleData: s.sampleData, saved: { graphicId: s.saved.graphicId, dirty: s.saved.dirty },
    aiSpec: s.aiSpec, aiThread: s.aiThread, legibility: s.legibility, ...documentReservation(s.baseline),
    views: views?.id === s.documentId ? views.history : previous?.views,
    view: views?.id === s.documentId ? views.view : previous?.view };
}
function retained(s: State, w = workspace()): AuthoringWorkspace {
  if (w.active !== s.documentId) return w;
  return { ...w, documents: w.documents.map(d => d.id === s.documentId ? snapshot(s, d) : d) };
}
/** Session history is source-owned; clipboard/proposals and gestures are never persisted. */
export function rememberDocumentView(id: string, history: HistoryViews, view: DocumentView) {
  if (useTemplateStore.getState().documentId !== id) return;
  views = { id, history, view };
  if (authoringWorkspace() === undefined || workspaceRefusal()) return;
  const s = useTemplateStore.getState();
  if (s.documentId === id && workspace().active === id) { stage(retained(s)); scheduleProjectAutosave(); }
}
export function currentAuthoringDocument(): AuthoringDocument | undefined {
  if (workspaceRefusal()) return undefined;
  const w = workspace();
  return w.documents.find(d => d.id === w.active && d.id === useTemplateStore.getState().documentId);
}

useTemplateStore.subscribe((s, prev) => {
  if (restoring || authoringWorkspace() === undefined || workspaceRefusal()) return;
  const changed = s.template !== prev.template || s.history !== prev.history || s.future !== prev.future ||
    s.saved !== prev.saved || s.sampleData !== prev.sampleData || s.aiSpec !== prev.aiSpec || s.aiThread !== prev.aiThread || s.legibility !== prev.legibility;
  if (!changed && s.documentId === prev.documentId) return;
  const w = workspace();
  if (s.documentId !== prev.documentId && w.active === prev.documentId) {
    // Wizard/open-saved replacements leave the former project draft intact and detach.
    stage({ ...retained(prev, w), active: null });
  } else if (w.active === s.documentId) {
    stage(retained(s, w));
    if (s.sampleData !== prev.sampleData && s.template === prev.template) scheduleProjectAutosave();
  }
});

async function persist(value: AuthoringWorkspace): Promise<void> {
  const editing = useTemplateStore.getState();
  if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
  // Establish a compatibility slot for a first-ever project without destroying a legacy one.
  if (!loadProject()) {
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
  }
  const captured = captureDurableWrites('spx-gfx-project', () => { flushPendingProject(); writeAuthoringWorkspace(value); });
  const errors = await Promise.all(captured.receipts.map(commitDurableReceipt));
  const error = errors.find(Boolean);
  if (error || !captured.receipts.length) throw new Error(error ?? 'The project could not be saved.');
  const current = useTemplateStore.getState();
  if (!sameEditingContext(editing, current)) {
    const corrected = { ...value, active: value.documents.some(d => d.id === current.documentId) ? current.documentId : null,
      documents: value.documents.map(d => d.id === current.documentId ? snapshot(current, d) : d) };
    stage(corrected);
    const repair = captureDurableWrites('spx-gfx-project', () => writeAuthoringWorkspace(corrected));
    const errors = await Promise.all(repair.receipts.map(commitDurableReceipt));
    throw new Error(errors.find(Boolean) ?? 'The graphic changed while saving. Its newer draft was kept; try again after it settles.');
  }
  stage(value);
}
async function action(run: () => Promise<void>): Promise<boolean> {
  if (useAuthoringProjects.getState().busy || useSaveUi.getState().inFlight) {
    useAuthoringProjects.setState({ error: 'Wait for the current save to finish.' }); return false;
  }
  useAuthoringProjects.setState({ busy: true, error: '' });
  try { await run(); return true; }
  catch (e) { useAuthoringProjects.setState({ error: e instanceof Error ? e.message : String(e) }); return false; }
  finally { useAuthoringProjects.setState({ busy: false }); }
}
function sameEditingContext(a: State, b: State) {
  return a.documentId === b.documentId && a.template === b.template && a.baseline === b.baseline && a.saved === b.saved &&
    a.history === b.history && a.future === b.future && a.sampleData === b.sampleData && a.aiSpec === b.aiSpec && a.aiThread === b.aiThread && a.legibility === b.legibility;
}
function restore(d: AuthoringDocument) {
  restoring = true;
  try {
    releaseReservation();
    if (isOwnReservation(d.reservedGraphicId)) resumeReservation(d.reservedGraphicId!, d.baseline);
    views = d.views && d.view ? { id: d.id, history: d.views, view: d.view } : null;
    useTemplateStore.setState({ documentId: d.id, template: d.template, baseline: d.baseline, history: d.history, future: d.future,
      sampleData: d.sampleData, selectedParts: d.view?.selectedParts ?? [], selectedPart: d.view?.selectedParts[0] ?? null,
      saved: { ...d.saved, status: 'idle' }, aiSpec: d.aiSpec ?? null, aiThread: d.aiThread ?? null,
      legibility: d.legibility ?? null, validation: null, previewError: null, galleryOpen: false });
  } finally { restoring = false; }
}
export function openProjectDocument(id: string): Promise<boolean> {
  return action(async () => {
    const before = useTemplateStore.getState(), w = retained(before), d = w.documents.find(d => d.id === id);
    if (!d) throw new Error('That graphic is no longer in this project.');
    // Internal switches lose no work: the departing draft and history are confirmed before
    // replacement. The ordinary unsaved-work guard remains for every external replacement.
    await persist({ ...w, active: id });
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Switch again after it settles.');
    restore(d);
  });
}
export function createAuthoringProject(name: string, templates: SpxTemplate[]): Promise<boolean> {
  return action(async () => {
    const before = useTemplateStore.getState();
    let w = retained(before);
    // Adoption preserves the legacy slot as an unfiled document, even when a new
    // starter project is the first workspace action. It is never silently replaced.
    if (loadProject() && !w.documents.some(d => d.id === before.documentId)) w = { ...w, documents: [...w.documents, snapshot(before)] };
    if (!name.trim() || !templates.length) throw new Error('Name the project and select at least one graphic.');
    const docs: AuthoringDocument[] = templates.map(template => ({ id: uuid(), template, baseline: template, history: [], future: [],
      saved: { graphicId: null, dirty: true }, sampleData: syncSampleData(template, {}), aiSpec: null, aiThread: null, legibility: null }));
    const project = { id: uuid(), name: name.trim(), documents: docs.map(d => d.id) };
    await persist({ ...w, projects: [...w.projects, project], documents: [...w.documents, ...docs], active: docs[0].id });
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Your new project is available on Home.');
    restore(docs[0]);
  });
}
/** Explicitly adopt the current legacy slot; no old source or library record is removed. */
export function keepCurrentInProject(projectId: string): Promise<boolean> {
  return action(async () => {
    const s = useTemplateStore.getState(), w = retained(s), p = w.projects.find(p => p.id === projectId);
    if (!p) throw new Error('That project no longer exists.');
    const existing = w.documents.find(d => d.id === s.documentId);
    const d = snapshot(s, existing);
    await persist({ ...w, active: d.id, projects: w.projects.map(p => p.id === projectId ? { ...p, documents: [...new Set([...p.documents, d.id])] } : p),
      documents: existing ? w.documents.map(old => old.id === d.id ? d : old) : [...w.documents, d] });
  });
}
export function renameAuthoringProject(id: string, name: string): Promise<boolean> {
  return action(async () => {
    if (!name.trim()) throw new Error('Enter a project name.');
    const w = retained(useTemplateStore.getState());
    await persist({ ...w, projects: w.projects.map(p => p.id === id ? { ...p, name: name.trim() } : p) });
  });
}
export function removeAuthoringProject(id: string): Promise<boolean> {
  return action(async () => {
    const w = retained(useTemplateStore.getState());
    await persist({ ...w, projects: w.projects.filter(p => p.id !== id) });
  });
}

/** Leaving for Home does not discard a retained project's confirmed draft. */
export function retainCurrentProjectDraft(): Promise<boolean> {
  return action(async () => {
    const before = useTemplateStore.getState(), w = workspace();
    if (w.active !== before.documentId) throw new Error('The current graphic is not retained in a project.');
    await persist(retained(before, w));
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Try again after it settles.');
  });
}
