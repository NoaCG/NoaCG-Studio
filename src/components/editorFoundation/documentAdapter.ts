import { currentAuthoringDocument, rememberDocumentView } from '../../store/authoringProjects';
import { useTemplateStore } from '../../store/templateStore';
import { EditorSession } from './session';
import { readTimeline } from './timelineView';

let active: { id: string; baseline: object; session: EditorSession; publicId: string; closed: boolean; time: number; cue?: number } | null = null;
/** Each retained draft restores its own history; every switch closes the previous session. */
export function activeEditorSession(): EditorSession {
  const state = useTemplateStore.getState();
  const document = currentAuthoringDocument();
  const publicId = document?.id ?? state.saved.graphicId ?? state.documentId;
  if (active && !active.closed && active.id === state.documentId && active.baseline === state.baseline && active.publicId === publicId) return active.session;
  const previousView = active?.id === state.documentId ? { time: active.time, cue: active.cue } : undefined;
  if (active) { active.closed = true; active.session.dispose(); }
  const openingTime = readTimeline(state.template).segments[0]?.duration ?? 0;
  const binding = { id: state.documentId, publicId, closed: false, baseline: state.baseline, time: previousView?.time ?? document?.view?.time ?? openingTime, cue: previousView ? previousView.cue : document?.view?.cue, session: null as unknown as EditorSession };
  const owns = (next: ReturnType<typeof useTemplateStore.getState>) => !binding.closed && next.documentId === binding.id && next.baseline === binding.baseline &&
    (currentAuthoringDocument()?.id ?? next.saved.graphicId ?? next.documentId) === binding.publicId;
  const read = () => {
    const next = useTemplateStore.getState();
    if (!owns(next)) { binding.closed = true; throw new Error('This document session is closed.'); }
    return next;
  };
  // Keep the public library identity compatible outside a retained authoring draft.
  // Binding ownership remains the independent authoring UUID, even for a same-ID reopen.
  const session = new EditorSession(publicId, {
    read: () => read().template,
    view: () => ({ selectedParts: [...read().selectedParts], time: binding.time, cue: binding.cue, sampleData: { ...useTemplateStore.getState().sampleData } }),
    restore: view => {
      read();
      binding.time = view.time;
      binding.cue = view.cue;
      useTemplateStore.getState().restoreEditorView(view.selectedParts, view.sampleData);
    },
    apply: template => {
      const before = read();
      before.applyTemplate(template);
      // Image replacement is an explicit choice. Asset moves also carry live operator paths.
      for (const field of template.fields.filter(f => f.ftype === 'filelist')) {
        const old = before.template.fields.find(f => f.field === field.field);
        const sample = before.sampleData[field.field];
        const index = before.template.assets.findIndex(a => a.path === sample);
        const oldAsset = before.template.assets[index], moved = template.assets[index];
        if (old && old.value !== field.value) before.setSampleValue(field.field, String(field.value));
        else if (oldAsset && moved?.data === oldAsset.data && moved.path !== oldAsset.path && !template.assets.some(a => a.path === oldAsset.path)) before.setSampleValue(field.field, moved.path);
      }
    },
    undo: () => read().undo(),
    redo: () => read().redo(),
    subscribe: listener => useTemplateStore.subscribe(s => { if (owns(s)) listener(); else { binding.closed = true; binding.session.dispose(); } }),
  }, { past: state.history, future: state.future, views: document?.views },
    () => {
      if (owns(useTemplateStore.getState())) rememberDocumentView(binding.id, session.historyViews(), session.port.view());
    });
  binding.session = session;
  active = binding;
  return session;
}
export function setSessionTime(time: number, cue?: number) {
  const state = useTemplateStore.getState();
  if (!active || active.closed || active.id !== state.documentId || active.baseline !== state.baseline ||
    active.publicId !== (currentAuthoringDocument()?.id ?? state.saved.graphicId ?? state.documentId)) return;
  active.time = time; active.cue = cue; active.session.observeView();
}
