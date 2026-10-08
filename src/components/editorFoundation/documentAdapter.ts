import { useTemplateStore } from '../../store/templateStore';
import { EditorSession } from './session';
import { readTimeline } from './timelineView';

let active: { baseline: object; session: EditorSession; time: number; cue?: number } | null = null;
/** R1.0 binds the existing working slot. R1.4a replaces this binding with independent
 * GraphicDoc ports; registry, selection and protocol already require document identity. */
export function activeEditorSession(): EditorSession {
  const state = useTemplateStore.getState();
  if (active?.baseline === state.baseline) return active.session;
  active?.session.dispose();
  const openingTime = readTimeline(state.template).segments[0]?.duration ?? 0;
  const binding = { baseline: state.baseline, time: openingTime, cue: undefined as number | undefined, session: null as unknown as EditorSession };
  const session = new EditorSession(state.saved.graphicId ?? 'draft:' + crypto.randomUUID(), {
    read: () => useTemplateStore.getState().template,
    view: () => ({ selectedParts: [...useTemplateStore.getState().selectedParts], time: binding.time, cue: binding.cue, sampleData: { ...useTemplateStore.getState().sampleData } }),
    restore: view => {
      binding.time = view.time;
      binding.cue = view.cue;
      useTemplateStore.getState().setSelectedParts(view.selectedParts);
      for (const [field, value] of Object.entries(view.sampleData ?? {})) {
        if (field in useTemplateStore.getState().sampleData) useTemplateStore.getState().setSampleValue(field, value);
      }
    },
    apply: template => {
      const before = useTemplateStore.getState();
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
    undo: () => useTemplateStore.getState().undo(),
    redo: () => useTemplateStore.getState().redo(),
    subscribe: listener => useTemplateStore.subscribe(listener),
  });
  binding.session = session;
  active = binding;
  return session;
}
export function setSessionTime(time: number, cue?: number) { if (active) { active.time = time; active.cue = cue; active.session.observeView(); } }
