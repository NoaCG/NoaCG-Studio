// Central app state (zustand). The template is the source of truth; editing the HTML
// re-parses the SPXGCTemplateDefinition so fields stay in sync with the visible code.

import { create } from 'zustand';
import { canAuthorAccount } from '../model/durableStore';
import { createDefaultTemplate } from '../templates/defaultTemplate';
import { parseDefinition } from '../model/spxDefinition';
import type { AssetFile, SpxTemplate } from '../model/types';
import { DATA_FTYPES } from '../model/types';
import type { ValidationResult } from '../validation/validateTemplate';
import { isOwnReservation, linkAfterLoss, loadProject, onGraphicSuperseded, resumeReservation, saveProject } from '../model/project';
import { graphicById } from '../model/library';
import type { GenerationSpec } from '../model/generationSpec';
import { normalizeThread, type AiThread } from '../model/aiThread';
import { normalizeLegibility, type ProjectLegibility } from '../model/designRules';
import { hasCurrentVideoProject } from '../model/videoProject';
import { prepareOutRuntime } from '../blocks/animMigration';

export type PreviewBg = 'checkerboard' | 'black' | 'video';

interface TemplateState {
  template: SpxTemplate;
  previewBg: PreviewBg;
  /** Runtime test values keyed by field id (f0, f1...). Fed to update(). */
  sampleData: Record<string, string>;
  validation: ValidationResult | null;
  /** Latest runtime error reported by the live preview iframe, if any. */
  previewError: string | null;
  /** Preview canvas guides: broadcast safe areas and a rule-of-thirds grid. */
  guides: { safeAreas: boolean; grid: boolean };
  /** Whether the template gallery / new-project screen is open. */
  galleryOpen: boolean;
  /** A catalog variant id the wizard should preselect on this open (a `#/new/<id>` deep
   *  link, docs/PRERENDER.md) — consumed by CreationWizard's open effect, then cleared by
   *  the next openGallery() call (every other call site passes none). */
  pendingDesignId: string | null;
  /** The production this wizard open is FOR (the production page's "+ New graphic",
   *  docs/GOALS_ARCHIVE.md "Student release" step 6): its look pre-applies to the draft and the
   *  Finish step preselects it. Same one-shot lifecycle as pendingDesignId — set right
   *  before navigating to `#/new`, consumed and cleared by the wizard's open effect. */
  pendingProductionId: string | null;
  /** A production whose EXPORT dialog should open the moment its page mounts — the kit
   *  wizard's "Export the kit (.zip)" door (docs/GOALS.md "Kits, not one graphic at a time").
   *  Same one-shot lifecycle as pendingProductionId: set right before navigating to the
   *  production, consumed and cleared by ProductionPage. The wizard asks for the EXISTING
   *  export surface rather than growing a second whole-show export screen, so the target
   *  picker and the validation gate can never disagree with the production page's own. */
  pendingProductionExport: string | null;
  /** Snapshots taken before each panel / AI / gallery apply, for one-click undo. */
  history: SpxTemplate[];
  /** Undone snapshots, for redo. Any NEW edit clears it (the classic undo-tree cut). */
  future: SpxTemplate[];
  /** The pristine template as this project was first created / imported / opened — the
   *  target of resetToBaseline(). Captured on every whole-project swap (resetSampleData). */
  baseline: SpxTemplate;
  /** The primary editor selection: a TemplatePart selector, or null.
   *  The current editor shares the ordered selection with its tools. UI state only —
   *  it is never written into the template and takes no history snapshot.
   *  With multi-selection this is the PRIMARY (first) of selectedParts — every selection
   *  setter keeps the two in sync so single-selection consumers just work. */
  selectedPart: string | null;
  /** The FULL selection, ordered; selectedPart === selectedParts[0] ?? null. The
   *  interaction-model contract (docs/EDITOR_REBUILD_PLAN.md): plain click
   *  replaces, shift-click toggles, empty-canvas drag lassos. UI state only. */
  selectedParts: string[];
  /** How many modal surfaces are mounted (see spaceKey.ts useModalGate). Counted rather than
   *  flagged so nested/stacked modals close correctly, and so a modal that unmounts can never
   *  leave the gate stuck open. Every global editor shortcut stands down while it is > 0 — a
   *  keystroke aimed at a dialog must never edit the document behind it. UI state only. */
  modalCount: number;
  /** The SAVE LINK (docs/SAVED_CONTENT_MODEL.md): which library graphic this working document
   *  IS (null = never saved), whether it changed since the last Save, and the Save button's
   *  live status. `dirty` flips on in the template subscription below and off in
   *  store/saveActions.ts; both halves persist with the autosave slot so a reload keeps an
   *  honest badge. */
  saved: {
    graphicId: string | null;
    dirty: boolean;
    status: 'idle' | 'saving' | 'failed';
    /** The project-format issues the last save carried (model/projectFormat.ts
     *  validateProjectFormat). Empty or absent = the format is one the catalogue offers.
     *  In-memory only; it is never persisted, so it is not a format version bump. */
    formatIssues?: string[];
  };
  setPreviewBg: (bg: PreviewBg) => void;

  setHtml: (html: string) => void;
  setCss: (css: string) => void;
  setJs: (js: string) => void;

  /** Replace the whole template (used by the panels, AI, and the wizard). */
  applyTemplate: (template: SpxTemplate, opts?: { resetSampleData?: boolean; keepGalleryOpen?: boolean }) => void;
  /** Restore the template from before the last apply. No-op when history is empty. */
  undo: () => void;
  /** Re-apply the last undone snapshot. No-op when nothing was undone (or a new edit
   *  happened since — new edits clear the redo stack). */
  redo: () => void;
  /** Select ONE element by its TemplatePart selector (null deselects) — replaces the
   *  whole selection; see selectedPart/selectedParts. */
  setSelectedPart: (selector: string | null) => void;
  /** Replace the whole selection (the lasso's setter; [] clears). */
  setSelectedParts: (selectors: string[]) => void;
  /** Shift-click: add the selector to the selection, or remove it when present. */
  toggleSelectedPart: (selector: string) => void;
  /** Balanced pair — always through useModalGate, never called by hand. */
  pushModal: () => void;
  popModal: () => void;
  /** Set the save link/status wholesale (store/saveActions.ts owns the semantics). */
  setSaved: (saved: TemplateState['saved']) => void;
  /** The AI generation spec this project was created from (null = not an AI creation).
   *  Persists with the working slot and the saved GraphicDoc; cleared by a whole-project
   *  swap unless the new document brings its own. */
  aiSpec: GenerationSpec | null;
  setAiSpec: (aiSpec: GenerationSpec | null) => void;
  /** The Create-with-AI conversation this project was created from (null = not carried).
   *  Rides the same rails as aiSpec — the autosave slot (SavedProject.aiThread) and every
   *  Save (GraphicDoc.aiThread) — and is cleared by a whole-project swap unless the new
   *  document brings its own. */
  aiThread: AiThread | null;
  setAiThread: (aiThread: AiThread | null) => void;
  /** The project's legibility settings (model/designRules.ts ProjectLegibility; null = the
   *  defaults: TV viewing, standard floors). Rides the same rails as aiSpec — the autosave
   *  slot and every Save — and is cleared by a whole-project swap unless the new document
   *  brings its own. */
  legibility: ProjectLegibility | null;
  setLegibility: (legibility: ProjectLegibility | null) => void;
  resetToDefault: () => void;
  /** Restore this project to its pristine baseline (see baseline) as ONE undoable apply,
   *  and reset sample data to the baseline's field defaults. */
  resetToBaseline: () => void;

  setSampleValue: (field: string, value: string) => void;
  resetSampleData: () => void;

  /** Add an uploaded asset (image/font/Lottie) to the template. One undo step. */
  addAsset: (asset: AssetFile) => void;
  /** Add several uploaded assets as ONE undo step (a multi-file import must not eat
   *  one history slot per file — the history cap is 30). */
  addAssets: (assets: AssetFile[]) => void;
  /** Remove an asset by its relative path. One undo step. */
  removeAsset: (path: string) => void;

  setValidation: (result: ValidationResult | null) => void;
  setPreviewError: (error: string | null) => void;
  setGuide: (key: 'safeAreas' | 'grid', value: boolean) => void;

  /** Open the wizard. `designId` (a `#/new/<id>` deep link) is preselected by CreationWizard's
   *  open effect if it resolves to a catalog variant; omitted (or invalid) opens at Entry as
   *  always. */
  openGallery: (designId?: string | null) => void;
  closeGallery: () => void;
}

/** Build the sample-data map from a template's fields, preserving existing edited values. */
/** The data-carrying fields' values: whatever `existing` already holds, else the definition's
 *  own default. EXPORTED because the export surface needs the identical answer for a graphic
 *  that is NOT the open project — a saved record off a Home card, or a template the wizard
 *  just built — so what a target bakes in never depends on which door the export came through. */
export function syncSampleData(template: SpxTemplate, existing: Record<string, string>): Record<string, string> {
  const next: Record<string, string> = {};
  for (const field of template.fields) {
    if (!DATA_FTYPES.includes(field.ftype)) continue;
    next[field.field] = field.field in existing ? existing[field.field] : field.value;
  }
  return next;
}

/** Re-parse fields/settings from the template HTML (the definition is the source of truth). */
function withParsedFields(template: SpxTemplate): SpxTemplate {
  const parsed = parseDefinition(template.html);
  if (!parsed) return template;
  return { ...template, fields: parsed.fields, settings: parsed.settings };
}

/** Would minting `draft` give `record`'s template? A mint prepares the Out step and writes the
 *  name it was given; nothing else of the source changes. */
function sameSource(draft: SpxTemplate, record: SpxTemplate): boolean {
  return JSON.stringify({ ...draft, name: record.name, js: prepareOutRuntime(draft.js) }) === JSON.stringify(record);
}

// Restore the last autosaved working project (Era 5.2b) so a reload doesn't lose it; fall back to
// a fresh blank on first-ever load. Whether the wizard opens on top follows from this: a restored
// project means a returning user, who lands straight back in their work (galleryOpen below).
const initialProject = loadProject();
// A first Save reserves its record's id in the slot before minting it. When the link write that
// followed was refused, the record exists while the slot still reads unlinked, so the reserved id
// links it back and the next Save writes into it rather than minting a duplicate (#1383). It
// reads unsaved, as the refused save left it: the slot never said the link landed.
// The record is trusted only as this draft's own: the slot was written by the save minting it
// (`mintingReserved`), or it holds exactly the source that record was minted with. Any other
// draft naming it (another tab's, an older build's) asks for a name, so its Save cannot
// overwrite a graphic it never saved (#1402).
// Only THIS device's reservation counts at all. The slot syncs, so it can name a reservation
// another device made, whose record this device has not learnt of yet; resumed, this device's
// Save minted that record's id too (#1443). Not resumed, the first write takes a fresh one.
const slotReservation = initialProject?.reservedGraphicId;
const reservedId = isOwnReservation(slotReservation) ? slotReservation : undefined;
const reservedRecord = reservedId && reservedId !== initialProject?.graphicId ? graphicById(reservedId) : null;
const relinked = !!reservedRecord && (initialProject?.mintingReserved === true || sameSource(initialProject!.template, reservedRecord.template));
const initialGraphicId = relinked ? reservedId! : initialProject?.graphicId ?? null;
const initialTemplate = initialProject?.template ?? createDefaultTemplate();
// The pristine state Reset returns to: the saved baseline if we have one, else the loaded
// template (so Reset on a pre-baseline project at least returns to how it opened).
const initialBaseline = initialProject?.baseline ?? initialTemplate;
// Not relinked, the reservation is still this document's next mint: keep it. An id a record
// already holds is not; the first write drops it for a fresh one (model/project.ts).
if (reservedId && !relinked) resumeReservation(reservedId, initialBaseline);

export const useTemplateStore = create<TemplateState>((rawSet, get) => {
  const set = (patch: Partial<TemplateState> | ((state: TemplateState) => Partial<TemplateState>)) => rawSet(state => {
    const next = typeof patch === 'function' ? patch(state) : patch;
    if (!canAuthorAccount() && ['template', 'sampleData', 'aiSpec', 'aiThread', 'legibility'].some(key => key in next)) return {};
    return next;
  });
  return {
  template: initialTemplate,
  baseline: initialBaseline,
  previewBg: 'checkerboard',
  sampleData: syncSampleData(initialTemplate, {}),
  validation: null,
  previewError: null,
  guides: { safeAreas: false, grid: false },
  // Show the template chooser only when there is no work to return to: a first-ever visit
  // starts at the wizard; a returning user's reload (or a bookmarked #/graphic link) lands
  // straight in the restored project - SPX or video, whichever shell owns the reload.
  // "+ New graphic" and the #/new route still open it on demand.
  galleryOpen: !initialProject && !hasCurrentVideoProject(),
  pendingDesignId: null,
  pendingProductionId: null,
  pendingProductionExport: null,
  history: [],
  future: [],
  selectedPart: null,
  selectedParts: [],
  modalCount: 0,
  saved: {
    graphicId: initialGraphicId,
    dirty: relinked || (initialProject?.dirty ?? false),
    status: 'idle',
  },
  aiSpec: initialProject?.aiSpec ?? null,
  aiThread: normalizeThread(initialProject?.aiThread),
  legibility: normalizeLegibility(initialProject?.legibility) ?? null,
  setPreviewBg: (bg) => set({ previewBg: bg }),

  // Source edits preserve sample values and clear the redo branch.
  setHtml: (html) =>
    set((s) => {
      const template = withParsedFields({ ...s.template, html });
      return { template, sampleData: syncSampleData(template, s.sampleData), validation: null, future: [] };
    }),
  setCss: (css) => set((s) => ({ template: { ...s.template, css }, validation: null, future: [] })),
  setJs: (js) => set((s) => ({ template: { ...s.template, js }, validation: null, future: [] })),

  applyTemplate: (template, opts) =>
    set((s) => {
      const synced = withParsedFields(template);
      return {
        template: synced,
        // A whole-project swap (wizard create, community import, opening a saved graphic)
        // establishes the new pristine baseline that Reset returns to.
        baseline: opts?.resetSampleData ? synced : s.baseline,
        // In-place edits (panels, AI) keep typed sample values; creating a NEW project
        // must not leak the previous template's values into matching field ids.
        sampleData: syncSampleData(synced, opts?.resetSampleData ? {} : s.sampleData),
        // A whole-project swap severs the save link — a freshly created project must never
        // inherit the previous document's library id (Save would overwrite that graphic).
        // Opening a SAVED graphic re-links right after (store/saveActions.ts openGraphicDoc).
        saved: opts?.resetSampleData ? { graphicId: null, dirty: true, status: 'idle' as const } : s.saved,
        // The previous project's generation spec cannot describe the new document — the AI
        // create path (and openGraphicDoc) set the right one just after the swap.
        aiSpec: opts?.resetSampleData ? null : s.aiSpec,
        // Same as aiSpec: a new document cannot carry the previous one's conversation — the AI
        // create path and openGraphicDoc set the right thread just after the swap.
        aiThread: opts?.resetSampleData ? null : s.aiThread,
        // Same again: the create paths and openGraphicDoc set the new document's own.
        legibility: opts?.resetSampleData ? null : s.legibility,
        validation: null,
        galleryOpen: opts?.keepGalleryOpen ? s.galleryOpen : false,
        // Snapshot the pre-apply template so the action can be undone; a fresh edit
        // discards whatever was undone before it (the redo branch is gone).
        history: [...s.history, s.template].slice(-30),
        future: [],
      };
    }),

  undo: () =>
    set((s) => {
      if (s.history.length === 0) return {};
      const prev = s.history[s.history.length - 1];
      return {
        template: prev,
        sampleData: syncSampleData(prev, s.sampleData),
        validation: null,
        history: s.history.slice(0, -1),
        future: [...s.future, s.template].slice(-30),
      };
    }),

  redo: () =>
    set((s) => {
      if (s.future.length === 0) return {};
      const next = s.future[s.future.length - 1];
      return {
        template: next,
        sampleData: syncSampleData(next, s.sampleData),
        validation: null,
        history: [...s.history, s.template].slice(-30),
        future: s.future.slice(0, -1),
      };
    }),

  setSelectedPart: (selectedPart) =>
    set({ selectedPart, selectedParts: selectedPart ? [selectedPart] : [] }),

  setSelectedParts: (selectedParts) =>
    set({ selectedParts, selectedPart: selectedParts[0] ?? null }),

  toggleSelectedPart: (selector) =>
    set((s) => {
      const selectedParts = s.selectedParts.includes(selector)
        ? s.selectedParts.filter((x) => x !== selector)
        : [...s.selectedParts, selector];
      return { selectedParts, selectedPart: selectedParts[0] ?? null };
    }),

  pushModal: () => set((s) => ({ modalCount: s.modalCount + 1 })),
  popModal: () => set((s) => ({ modalCount: Math.max(0, s.modalCount - 1) })),

  setSaved: (saved) => set({ saved }),

  setAiSpec: (aiSpec) => set({ aiSpec }),
  setAiThread: (aiThread) => set({ aiThread }),
  setLegibility: (legibility) => set({ legibility: normalizeLegibility(legibility) ?? null }),

  resetToDefault: () =>
    set(() => {
      const template = createDefaultTemplate();
      return { template, sampleData: syncSampleData(template, {}), validation: null };
    }),

  // Restore the pristine baseline through the normal apply path so it is ONE undoable
  // action; resetSampleData:true also returns the fields to the baseline's defaults. It
  // does not overwrite the baseline (applyTemplate captures a NEW baseline, but restoring
  // the same template leaves it unchanged).
  resetToBaseline: () => get().applyTemplate(get().baseline, { resetSampleData: true }),

  setSampleValue: (field, value) => set((s) => ({ sampleData: { ...s.sampleData, [field]: value } })),
  resetSampleData: () => set((s) => ({ sampleData: syncSampleData(s.template, {}) })),

  // Asset edits snapshot history in place rather than routing through applyTemplate —
  // an asset add must not re-parse the definition or close the gallery.
  // Undo/redo restore whole-template snapshots, so assets travel free.
  addAsset: (asset) => get().addAssets([asset]),
  addAssets: (assets) =>
    set((s) => {
      if (assets.length === 0) return {};
      let next = s.template.assets;
      for (const asset of assets) next = [...next.filter((a) => a.path !== asset.path), asset];
      return {
        template: { ...s.template, assets: next },
        validation: null,
        history: [...s.history, s.template].slice(-30),
        future: [],
      };
    }),
  removeAsset: (path) =>
    set((s) => ({
      template: { ...s.template, assets: s.template.assets.filter((a) => a.path !== path) },
      validation: null,
      history: [...s.history, s.template].slice(-30),
      future: [],
    })),

  setValidation: (validation) => set({ validation }),
  setPreviewError: (previewError) => set({ previewError }),
  setGuide: (key, value) => set((s) => ({ guides: { ...s.guides, [key]: value } })),

  openGallery: (designId) => set({ galleryOpen: true, pendingDesignId: designId ?? null }),
  closeGallery: () => set({ galleryOpen: false }),
  };
});

// Autosave the working project (debounced) whenever the template actually changes, so a reload
// restores it instead of a blank default. Covers every mutation that touches the template — panels,
// AI, wizard, and manual edits — in one place. The durable project slot also participates
// in account sync through model/project.ts.
//
// The same subscription flips the save link DIRTY: any template change means the working
// document has drifted from its library record. saveActions' open/save paths set the link
// AFTER their applyTemplate returns, so their state wins over this generic marking.
let projectSaveTimer: ReturnType<typeof setTimeout> | null = null;
export function flushPendingProject() {
  if (!projectSaveTimer) return;
  clearTimeout(projectSaveTimer);
  projectSaveTimer = null;
  const s = useTemplateStore.getState();
  saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
}
if (typeof window !== 'undefined') {
  window.addEventListener('noacg-account-authoring-pausing', flushPendingProject);
  window.addEventListener('noacg-account-authoring-flush', flushPendingProject);
}
// A record this draft is linked to lost a sync conflict: another device's version holds its id
// now (model/project.ts `graphicSuperseded`). The draft links to the "(conflicted copy)" that
// holds its saved work, clean when it holds exactly that (#1466), never to the winner (#1443).
onGraphicSuperseded((lost, copy) => {
  const s = useTemplateStore.getState();
  if (s.saved.graphicId && lost.includes(s.saved.graphicId)) useTemplateStore.setState({ saved: { ...s.saved, ...linkAfterLoss(s, copy) } });
});
useTemplateStore.subscribe((state, prev) => {
  // The legibility settings are part of the SAVED document (GraphicDoc.legibility), not a
  // view preference, so a change to them drifts the working document exactly as a template
  // edit does. Without this the editor's Viewing control looked like it worked and lost the
  // choice on reload — the wizard's copy only ever persisted because creating a project
  // changes the template in the same breath.
  // Rehearsal samples are view state, not part of the saved working document.
  if (state.template === prev.template && state.legibility === prev.legibility && state.aiSpec === prev.aiSpec && state.aiThread === prev.aiThread) return;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-account-edit-pending'));
  if (!state.saved.dirty) {
    useTemplateStore.setState((s) => ({ saved: { ...s.saved, dirty: true } }));
  }
  if (projectSaveTimer) clearTimeout(projectSaveTimer);
  projectSaveTimer = setTimeout(() => {
    projectSaveTimer = null;
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
  }, 800);
});
