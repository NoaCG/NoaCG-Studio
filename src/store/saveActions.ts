// The SAVE / OPEN actions over the graphics library (docs/SAVED_CONTENT_MODEL.md §2), plus
// the small UI store that sequences their dialogs. templateStore holds the live template and
// the save LINK (`saved`); this module owns the semantics: what Save writes, what opening a
// library graphic loads, and when the "unsaved changes" guard must interpose.
//
// The autosave slot (model/project.ts) is the crash-safety net and is never conflated with
// Save: replacing the WORKING DOCUMENT (open another graphic, create a new project) is the
// only destructive move, so that is the one moment the guard asks. Navigating to Home, a
// control panel, or the video shell never touches the working document and never asks.

import { create } from 'zustand';
import { useTemplateStore } from './templateStore';
import {
  createGraphic,
  graphicById,
  updateGraphic,
  type GraphicDoc,
} from '../model/library';
import { saveProject } from '../model/project';
import { commitDurableWrites } from '../model/durableStore';
import { normalizeThread } from '../model/aiThread';
import { useDocKindStore } from './docKindStore';
import { validateProjectFormat } from '../model/projectFormat';

/** Persist the working slot's save link NOW — the autosave subscription only fires on a
 *  template change, and a Save that changes nothing else must still survive a reload. */
function persistLink(): void {
  const s = useTemplateStore.getState();
  saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
}

/** Where a first save / Save As puts the graphic. Packages are retired (docs/GOALS_ARCHIVE.md
 *  "Student release" step 3): every save is standalone in the flat library, and grouping
 *  happens in a PRODUCTION's own pool. The envelope type stays so every caller keeps one
 *  signature. */
export type SaveDestination = { kind: 'standalone' };

/**
 * Save the working template into its linked library record. Returns 'needs-name' when the
 * document has never been saved — the caller opens the save dialog instead.
 *
 * ASYNC because the durable store confirms a write a moment after taking it
 * (model/durableStore.ts): `commitDurableWrites` waits for that confirmation and CLAIMS any
 * failure, so this still answers 'failed' for a save that did not land — the caller makes the
 * same decision it always did, one await later, rather than being told 'saved' and corrected
 * by a dialog afterwards.
 */
export async function saveCurrentGraphic(opts?: {
  /** Write the record's NAME too. The wizard passes the name in its Finish field, which the
   *  reader may have changed since the record was made: without this the record would keep the
   *  old name while its template carried the new one, so Home, the topbar and the exported
   *  folder would disagree. ONE write, not two - `updateGraphic` sets `template.name` from it. */
  name?: string;
}): Promise<'saved' | 'needs-name' | 'failed'> {
  const s = useTemplateStore.getState();
  if (!s.saved.graphicId) return 'needs-name';
  s.setSaved({ ...s.saved, status: 'saving' });
  // The key is ADDED rather than set to undefined: `updateGraphic` copies the patch with
  // Object.assign, which would write an undefined name straight onto the record.
  const patch = { template: s.template, baseline: s.baseline, aiSpec: s.aiSpec, aiThread: s.aiThread, legibility: s.legibility };
  const { doc, error } = updateGraphic(s.saved.graphicId, opts?.name ? { ...patch, name: opts.name } : patch);
  const failure = error ?? (await commitDurableWrites());
  if (!doc || failure) {
    // The record vanished (deleted on another device): fall back to naming it fresh.
    if (!doc) {
      s.setSaved({ graphicId: null, dirty: true, status: 'idle' });
      return 'needs-name';
    }
    s.setSaved({ ...s.saved, status: 'failed' });
    return 'failed';
  }
  // An unknown catalogue format is not a broken document, so the save lands and reports it.
  const formatIssues = validateProjectFormat(s.template.resolution, s.template.fps);
  s.setSaved({ graphicId: doc.id, dirty: false, status: 'idle', formatIssues });
  persistLink();
  return 'saved';
}

/** First save or Save As: mint a new library record and link the working document to it. */
export async function saveGraphicAs(name: string, _dest: SaveDestination): Promise<{ ok: boolean; error: string | null }> {
  const s = useTemplateStore.getState();
  const { doc, error } = createGraphic(s.template, {
    name,
    packageId: null,
    baseline: s.baseline,
    aiSpec: s.aiSpec,
    aiThread: s.aiThread,
    legibility: s.legibility,
  });
  const failure = error ?? (await commitDurableWrites());
  if (failure) {
    s.setSaved({ ...s.saved, status: 'failed' });
    return { ok: false, error: failure };
  }
  // The working template adopts the saved name so the topbar and the record agree.
  if (doc.template.name !== s.template.name) {
    useTemplateStore.setState({ template: { ...s.template, name: doc.name } });
  }
  // An unknown catalogue format is not a broken document, so the save lands and reports it.
  const workingTemplate = useTemplateStore.getState().template;
  const formatIssues = validateProjectFormat(workingTemplate.resolution, workingTemplate.fps);
  useTemplateStore.getState().setSaved({ graphicId: doc.id, dirty: false, status: 'idle', formatIssues });
  persistLink();
  return { ok: true, error: null };
}

/**
 * Load a library graphic into the editor as the working document. The caller has already
 * cleared the unsaved-changes guard. Applies the doc's ACTIVE control entry (if any) into
 * the sample data, so the active data reaches the editor preview.
 */
export function openGraphicDoc(doc: GraphicDoc): void {
  const store = useTemplateStore.getState();
  store.applyTemplate(doc.template, { resetSampleData: true });
  useDocKindStore.getState().setKind('spx');
  if (doc.baseline) useTemplateStore.setState({ baseline: doc.baseline });
  // The swap cleared the working spec and conversation; a saved AI creation brings its own back.
  useTemplateStore.setState({ aiSpec: doc.aiSpec ?? null, aiThread: normalizeThread(doc.aiThread) });
  useTemplateStore.getState().setLegibility(doc.legibility ?? null);
  const entry = doc.activeEntryId ? doc.entries.find((e) => e.id === doc.activeEntryId) : null;
  if (entry) {
    for (const [field, value] of Object.entries(entry.values)) {
      useTemplateStore.getState().setSampleValue(field, value);
    }
  }
  useTemplateStore.getState().setSaved({ graphicId: doc.id, dirty: false, status: 'idle' });
  persistLink();
}

export function openGraphicById(id: string): boolean {
  const doc = graphicById(id);
  if (!doc) return false;
  openGraphicDoc(doc);
  return true;
}

// ── The save/guard UI store ──────────────────────────────────────────────────────────────────

export interface SaveUiState {
  /** The name-and-destination dialog: first save, or an explicit Save As. `then` runs after a
   *  successful save (the guard's "Save first, then continue" continuation). */
  saveDialog: { mode: 'first' | 'save-as'; then?: () => void } | null;
  /** The unsaved-changes guard: `proceed` performs the destructive switch when confirmed;
   *  `cancel` runs when the user backs out (e.g. a route-driven open rewinds the URL). */
  confirmSwitch: { proceed: () => void; cancel?: () => void } | null;
  openSaveDialog: (mode: 'first' | 'save-as', then?: () => void) => void;
  closeSaveDialog: () => void;
  /** Dismiss the guard without proceeding (runs its `cancel`, if any). */
  closeConfirm: () => void;
  /** Dismiss the guard because the switch happened (never runs `cancel`). */
  settleConfirm: () => void;
  /**
   * Run `proceed` (an action that REPLACES the working document) behind the guard: dirty
   * documents ask first, clean ones switch immediately.
   */
  requestSwitch: (proceed: () => void, cancel?: () => void) => void;
}

export const useSaveUi = create<SaveUiState>((set, get) => ({
  saveDialog: null,
  confirmSwitch: null,
  openSaveDialog: (mode, then) => set({ saveDialog: { mode, then } }),
  closeSaveDialog: () => set({ saveDialog: null }),
  closeConfirm: () => {
    const cancel = get().confirmSwitch?.cancel;
    set({ confirmSwitch: null });
    cancel?.();
  },
  settleConfirm: () => set({ confirmSwitch: null }),
  requestSwitch: (proceed, cancel) => {
    const { saved } = useTemplateStore.getState();
    if (saved.dirty) set({ confirmSwitch: { proceed, cancel } });
    else proceed();
  },
}));
