import { useTemplateStore } from '../../store/templateStore';
import { EditorSession } from './session';
import { readTimeline } from './timelineView';

let active: { baseline: object; session: EditorSession; time: number } | null = null;
/** R1.0 binds the existing working slot. R1.4a replaces this binding with independent
 * GraphicDoc ports; registry, selection and protocol already require document identity. */
export function activeEditorSession(): EditorSession {
  const state = useTemplateStore.getState();
  if (active?.baseline === state.baseline) return active.session;
  active?.session.dispose();
  const openingTime = readTimeline(state.template).segments[0]?.duration ?? 0;
  const binding = { baseline: state.baseline, time: openingTime, session: null as unknown as EditorSession };
  const session = new EditorSession(state.saved.graphicId ?? 'draft:' + crypto.randomUUID(), {
    read: () => useTemplateStore.getState().template,
    view: () => ({ selectedParts: [...useTemplateStore.getState().selectedParts], time: binding.time }),
    restore: view => {
      binding.time = view.time;
      useTemplateStore.getState().setSelectedParts(view.selectedParts);
    },
    apply: template => useTemplateStore.getState().applyTemplate(template),
    undo: () => useTemplateStore.getState().undo(),
    redo: () => useTemplateStore.getState().redo(),
    subscribe: listener => useTemplateStore.subscribe(listener),
  });
  binding.session = session;
  active = binding;
  return session;
}
export function setSessionTime(time: number) { if (active) active.time = time; }
