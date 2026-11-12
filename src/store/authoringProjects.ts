import { create } from 'zustand';
import { useTemplateStore, flushPendingProject, syncSampleData, scheduleProjectAutosave } from './templateStore';
import { useSaveUi } from './saveActions';
import { authoringWorkspace, stageAuthoringWorkspace, writeAuthoringWorkspace, workspaceRefusal, workspaceGeneration, bindWorkspaceDocument, workspaceDocumentRetained, loadProject, saveProject, documentReservation, resumeReservation, releaseReservation, isOwnReservation } from '../model/project';
import { readableWorkspace, type AuthoringWorkspace, type AuthoringDocument, type AuthoringProject, type HistoryViews, type DocumentView } from '../model/authoringDocument';
import { captureDurableWrites, commitDurableReceipt, libraryInUse } from '../model/durableStore';
import { uuid } from '../model/id';
import type { SpxTemplate } from '../model/types';
import { sameWorkspaceValue } from '../model/workspaceStage';

export const useAuthoringProjects = create<{ revision: number; busy: boolean; error: string }>(() => ({ revision: 0, busy: false, error: '' }));
let restoring = false;
let pendingCreation: { owner: string | null; name: string; templates: SpxTemplate[]; documents: AuthoringDocument[]; project: AuthoringProject } | null = null;
let views: { id: string; history: HistoryViews; view: DocumentView } | null = null;
export function workspace(): AuthoringWorkspace {
  const value = authoringWorkspace();
  if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
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
  if (!w.documents.some(d => d.id === s.documentId)) return w;
  return { ...w, active: s.documentId, documents: w.documents.map(d => d.id === s.documentId ? snapshot(s, d) : d) };
}
/** Explicit project replacement retains an external working draft before it can leave. */
function departingWorkspace(s: State): AuthoringWorkspace {
  const w = retained(s);
  if (w.active === s.documentId) return w;
  const prior = w.documents.find(d => d.id === s.documentId), document = snapshot(s, prior);
  return { ...w, active: s.documentId, documents: prior ? w.documents.map(d => d.id === s.documentId ? document : d) : [...w.documents, document] };
}
/** Session history is source-owned; clipboard/proposals and gestures are never persisted. */
export function rememberDocumentView(id: string, history: HistoryViews, view: DocumentView) {
  if (useTemplateStore.getState().documentId !== id) return;
  views = { id, history, view };
  if (authoringWorkspace() === undefined || workspaceRefusal()) return;
  const s = useTemplateStore.getState();
  if (s.documentId === id && workspace().documents.some(d => d.id === id)) { stage(retained(s)); scheduleProjectAutosave(); }
}
export function currentAuthoringDocument(): AuthoringDocument | undefined {
  if (workspaceRefusal() || !workspaceDocumentRetained(useTemplateStore.getState().documentId)) return undefined;
  const w = workspace();
  return w.documents.find(d => d.id === useTemplateStore.getState().documentId);
}

bindWorkspaceDocument(useTemplateStore.getState().documentId);
useTemplateStore.subscribe((s, prev) => {
  if (restoring || authoringWorkspace() === undefined || workspaceRefusal()) return;
  const changed = s.baseline !== prev.baseline || s.template !== prev.template || s.history !== prev.history || s.future !== prev.future ||
    s.saved !== prev.saved || s.sampleData !== prev.sampleData || s.aiSpec !== prev.aiSpec || s.aiThread !== prev.aiThread || s.legibility !== prev.legibility;
  if (!changed && s.documentId === prev.documentId) return;
  const w = workspace();
  if (s.documentId !== prev.documentId && w.documents.some(d => d.id === prev.documentId)) {
    // Wizard/open-saved replacements leave the former project draft intact and detach.
    stage({ ...retained(prev, w), active: null });
    bindWorkspaceDocument(s.documentId);
  } else if (w.documents.some(d => d.id === s.documentId)) {
    stage(retained(s, w));
    if ((s.sampleData !== prev.sampleData || s.baseline !== prev.baseline) && s.template === prev.template) scheduleProjectAutosave();
  }
});

async function persist(value: AuthoringWorkspace): Promise<void> {
  const editing = useTemplateStore.getState(), owner = libraryInUse();
  if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
  // Establish a compatibility slot for a first-ever project without destroying a legacy one.
  if (!loadProject()) {
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
  }
  stage(value); // Intent is visible to every slot writer before the first await.
  const captured = captureDurableWrites('spx-gfx-project', () => { flushPendingProject(); writeAuthoringWorkspace(workspace()); });
  const generation = workspaceGeneration();
  const errors = await Promise.all(captured.receipts.map(commitDurableReceipt));
  if (libraryInUse() !== owner) throw new Error('The library changed while saving. This draft was kept.');
  const error = errors.find(Boolean);
  if (error || !captured.receipts.length) throw new Error(error ?? 'The project could not be saved.');
  if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
  const current = useTemplateStore.getState();
  if (!sameEditingContext(editing, current) || workspaceGeneration() !== generation) {
    const latest = workspace();
    const corrected = retained(current, latest);
    stage(corrected);
    const repair = captureDurableWrites('spx-gfx-project', () => writeAuthoringWorkspace(corrected));
    const errors = await Promise.all(repair.receipts.map(commitDurableReceipt));
    throw new Error(errors.find(Boolean) ?? 'The graphic changed while saving. Its newer draft was kept; try again after it settles.');
  }
  useAuthoringProjects.setState(s => ({ revision: s.revision + 1 }));
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
  bindWorkspaceDocument(d.id, d);
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
    const before = useTemplateStore.getState(), w = departingWorkspace(before), d = w.documents.find(d => d.id === id);
    if (!d) throw new Error('That graphic is no longer in this project.');
    // Internal switches lose no work: the departing draft and history are confirmed before
    // replacement. The ordinary unsaved-work guard remains for every external replacement.
    await persist({ ...w, active: id });
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Switch again after it settles.');
    const confirmed = workspace().documents.find(d => d.id === id);
    if (!confirmed) throw new Error('That graphic changed while opening. Its newer workspace was preserved.');
    if (id !== before.documentId) restore(confirmed);
  });
}
export function createAuthoringProject(name: string, templates: SpxTemplate[]): Promise<boolean> {
  return action(async () => {
    const before = useTemplateStore.getState();
    // A legacy/external slot becomes an unfiled draft only after this write confirms.
    const w = loadProject() ? departingWorkspace(before) : retained(before);
    if (!name.trim() || !templates.length) throw new Error('Name the project and select at least one graphic.');
    const retry = pendingCreation?.owner === libraryInUse() && pendingCreation.name === name.trim() && sameWorkspaceValue(pendingCreation.templates, templates) ? pendingCreation : null;
    const docs: AuthoringDocument[] = retry?.documents ?? templates.map(template => ({ id: uuid(), template, baseline: template, history: [], future: [],
      saved: { graphicId: null, dirty: true }, sampleData: syncSampleData(template, {}), aiSpec: null, aiThread: null, legibility: null }));
    const project = retry?.project ?? { id: uuid(), name: name.trim(), documents: docs.map(d => d.id) };
    const plan = retry ?? { owner: libraryInUse(), name: name.trim(), templates, documents: docs, project };
    pendingCreation = plan;
    await persist({ ...w, projects: w.projects.some(p => p.id === project.id) ? w.projects : [...w.projects, project],
      documents: [...w.documents, ...docs.filter(d => !w.documents.some(old => old.id === d.id))], active: docs[0].id });
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Your new project is available on Home.');
    restore(workspace().documents.find(d => d.id === docs[0].id)!);
    if (pendingCreation === plan) pendingCreation = null;
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
    bindWorkspaceDocument(d.id, d);
    if (workspaceRefusal()) throw new Error(workspaceRefusal()!);
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
    if (!w.documents.some(d => d.id === before.documentId)) throw new Error('The current graphic is not retained in a project.');
    await persist(retained(before, w));
    if (!sameEditingContext(before, useTemplateStore.getState())) throw new Error('The graphic changed while saving. Try again after it settles.');
  });
}
