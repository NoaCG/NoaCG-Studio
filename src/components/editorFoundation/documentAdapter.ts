import { currentAuthoringDocument, rememberDocumentView } from '../../store/authoringProjects';
import { useTemplateStore } from '../../store/templateStore';
import { EditorSession } from './session';
import { readTimeline } from './timelineView';

let active: { id: string; baseline: object; session: EditorSession; closed: boolean; time: number; cue?: number } | null = null;
/** Each retained draft restores its own history; every switch closes the previous session. */
export function activeEditorSession(): EditorSession {
  const state = useTemplateStore.getState();
  if (active?.id === state.documentId && active?.baseline === state.baseline) return active.session;
  if (active) { active.closed = true; active.session.dispose(); }
  const document = currentAuthoringDocument();
  const openingTime = readTimeline(state.template).segments[0]?.duration ?? 0;
  const binding = { id: state.documentId, closed: false, baseline: state.baseline, time: document?.view?.time ?? openingTime, cue: document?.view?.cue, session: null as unknown as EditorSession };
  const read = () => {
    const next = useTemplateStore.getState();
    if (binding.closed || next.documentId !== binding.id) throw new Error('This document session is closed.');
    return next;
  };
  const session = new EditorSession(binding.id, {
    read: () => read().template,
    view: () => ({ selectedParts: [...read().selectedParts], time: binding.time, cue: binding.cue, sampleData: { ...useTemplateStore.getState().sampleData } }),
    restore: view => {
      read();
      binding.time = view.time;
      binding.cue = view.cue;
      useTemplateStore.getState().setSelectedParts(view.selectedParts);
      for (const [field, value] of Object.entries(view.sampleData ?? {})) {
        if (field in useTemplateStore.getState().sampleData) useTemplateStore.getState().setSampleValue(field, value);
      }
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
    subscribe: listener => useTemplateStore.subscribe(s => { if (s.documentId === binding.id) listener(); }),
  }, document ? { past: state.history, future: state.future, views: document.views } : undefined,
    () => rememberDocumentView(binding.id, session.historyViews(), session.port.view()));
  binding.session = session;
  active = binding;
  return session;
}
export function setSessionTime(time: number, cue?: number) { if (active?.id === useTemplateStore.getState().documentId) { active.time = time; active.cue = cue; active.session.observeView(); rememberDocumentView(active.id, active.session.historyViews(), active.session.port.view()); } }
