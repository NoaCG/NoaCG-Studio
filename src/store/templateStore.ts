// Central app state (zustand). The template is the source of truth; editing the HTML
// re-parses the SPXGCTemplateDefinition so fields stay in sync with the visible code.

import { create } from 'zustand';
import { createDefaultTemplate } from '../templates/defaultTemplate';
import { parseDefinition } from '../model/spxDefinition';
import type { AssetFile, SpxTemplate } from '../model/types';
import { DATA_FTYPES } from '../model/types';
import type { ValidationResult } from '../validation/validateTemplate';
import { loadProject, saveProject } from '../model/project';
import type { GenerationSpec } from '../model/generationSpec';
import { normalizeThread, type AiThread } from '../model/aiThread';
import { normalizeLegibility, type ProjectLegibility } from '../model/designRules';
import { hasCurrentVideoProject } from '../model/videoProject';
import { PATH_TARGET, type TimelineTarget } from '../blocks/timelineLens';
import type { EditorTab } from '../blocks/registry';

export type { EditorTab } from '../blocks/registry';
export type PreviewBg = 'checkerboard' | 'black' | 'video';
/** The panels the MOBILE tab strip switches between (SidePanel.tsx), and the ids the
 *  desktop docks accept as a "reveal this panel" signal. A subset of model/layout.ts's
 *  PanelId — `code` is not a tab (mobile mounts it on demand under the panels). */
export type SidePanel = 'inspector' | 'data' | 'control' | 'style' | 'assets' | 'ai' | 'export';

/** A live playout action the Control panel asks the simulator to run on the preview.
 *  'event' dispatches a state-machine operator event (noacgDispatch) and 'snap' jumps
 *  the machine to states instantly (noacgSnap) — both no-ops on templates without the
 *  machine runtime. */
export type PlayoutAction = 'update' | 'play' | 'stop' | 'next' | 'event' | 'snap';

/** The armed canvas tool (the stage toolbar's tool switch): 'select' is the always-on
 *  gesture layer; 'text' places point text on click; 'area-text' drags out a bounded,
 *  wrapping text box. Both text tools create REAL SPX data fields (placed lines). */
export type CanvasTool = 'select' | 'text' | 'area-text';

/** What the cursor is currently on in the code editor (drives the hover explanations). */
export interface EditorContext {
  tab: EditorTab;
  token: string;
  line: string;
}

/** The lines the last panel/AI apply changed, per tab — the editor highlights them. */
export interface LastChange {
  ranges: Partial<Record<EditorTab, { start: number; end: number }>>;
  /** Bumped per apply so an identical follow-up change still re-triggers the highlight. */
  nonce: number;
}

/**
 * Cheap per-tab line diff: trim the common prefix and suffix lines, report the changed
 * span in the NEW text. Good enough for the targeted patches panels and AI produce.
 */
function changedRange(before: string, after: string): { start: number; end: number } | null {
  if (before === after) return null;
  const a = before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) {
    endA--;
    endB--;
  }
  // Monaco lines are 1-based; a pure deletion still highlights the seam line.
  return { start: start + 1, end: Math.max(endB + 1, start + 1) };
}

/** Diff all three files of a template apply into a LastChange (null when nothing changed). */
function diffTemplates(before: SpxTemplate, after: SpxTemplate, nonce: number): LastChange | null {
  const ranges: LastChange['ranges'] = {};
  const html = changedRange(before.html, after.html);
  const css = changedRange(before.css, after.css);
  const js = changedRange(before.js, after.js);
  if (html) ranges.html = html;
  if (css) ranges.css = css;
  if (js) ranges.js = js;
  return Object.keys(ranges).length ? { ranges, nonce } : null;
}

interface TemplateState {
  template: SpxTemplate;
  activeTab: EditorTab;
  previewBg: PreviewBg;
  activePanel: SidePanel;
  /** Bumped on EVERY setActivePanel call, so a reveal request fires even when the requested
   *  panel is already the stored value (e.g. revealing the default 'data' tab). The docks
   *  key their reveal effect on this, not on the panel id changing. */
  panelRevealNonce: number;
  /** Runtime test values keyed by field id (f0, f1...). Fed to update(). */
  sampleData: Record<string, string>;
  validation: ValidationResult | null;
  /** Latest runtime error reported by the live preview iframe, if any. */
  previewError: string | null;
  /** What the code-editor cursor is currently on (drives the Learn panel). */
  editorContext: EditorContext | null;
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
  /** The lines the last apply changed (drives the editor's change highlight). */
  lastChange: LastChange | null;
  /** Bumped by panels after an apply to make the playout simulator replay the graphic. */
  replayNonce: number;
  /** The Control panel's latest live command (executed immediately by the simulator).
   *  `event`/`payload` ride an 'event' action; `snap` rides a 'snap' action ({group: state}
   *  assignments; null = every group to its initial — the visual reset). */
  controlCommand: {
    action: PlayoutAction;
    nonce: number;
    event?: string;
    payload?: Record<string, string>;
    snap?: Record<string, string> | null;
  } | null;
  /** The timeline view's scrub position (Era 6) — the simulator seeks the live preview.
   *  Phase: 'in' | 'out' | 'step-N' (a Continue segment, N is the 2-based step number). */
  scrubCommand: { phase: string; time: number; nonce: number } | null;
  /** The selected element (Era 6 shared selection): a TemplatePart selector, or null.
   *  Canvas and timeline highlight the SAME element through this. Editor UI state only —
   *  it is never written into the template and takes no history snapshot.
   *  With multi-selection this is the PRIMARY (first) of selectedParts — every selection
   *  setter keeps the two in sync so single-selection consumers just work. */
  selectedPart: string | null;
  /** The FULL selection, ordered; selectedPart === selectedParts[0] ?? null. The
   *  interaction-model contract (docs/TIMELINE_INTERACTION_MODEL.md): plain click
   *  replaces, shift-click toggles, empty-canvas drag lassos. UI state only. */
  selectedParts: string[];
  /** EXPLICIT canvas locks, by TemplatePart selector. A locked part takes no direct-
   *  manipulation gesture — it can't be dragged, resized, or lassoed — but stays selectable
   *  by click, from the timeline, and fully editable everywhere else. Only entries the user
   *  toggled live here; a part with no entry follows the canvas's own default (an imported
   *  design's artwork starts locked, so dragging the text on top of it moves the TEXT).
   *  Editor UI state only — no history, never written into the template. */
  partLocks: Record<string, boolean>;
  /** The step timeline's parked playhead (step index + local time in effective seconds).
   *  The Inspector stamps keyframes here. UI state only — no history, never in code. */
  playhead: { step: number; t: number } | null;
  /** Which of the two KEY-CLAIMING surfaces the user is working in. Set by a pointerdown on
   *  the stage or on the timeline strip; panels and dialogs deliberately leave it alone, so
   *  clicking the Inspector keeps whichever of the two you were last in. It decides who owns
   *  Space (see components/spaceKey.ts) — pan on the canvas, play on the timeline. Defaults
   *  to 'canvas': the stage is the subject of a fresh editor. UI state only — no history. */
  activeSurface: 'canvas' | 'timeline';
  /** Whether the pointer is over the preview stage. Half of the Space predicate, so it lives
   *  here rather than in a PreviewFrame ref — the timeline has to read it too. Written on
   *  enter/leave; read through getState(), never subscribed, so it costs no renders. */
  pointerOverStage: boolean;
  /** How many modal surfaces are mounted (see spaceKey.ts useModalGate). Counted rather than
   *  flagged so nested/stacked modals close correctly, and so a modal that unmounts can never
   *  leave the gate stuck open. Every global editor shortcut stands down while it is > 0 — a
   *  keystroke aimed at a dialog must never edit the document behind it. UI state only. */
  modalCount: number;
  /** True while a canvas gesture is in flight (inline edit, root/layer/scale drag). The
   *  Inspector's deferred auto-open skips while this is set — a workspace resize would move
   *  the canvas under the pointer mid-gesture. UI state only — no history. */
  canvasGestureActive: boolean;
  /** The armed canvas tool (see CanvasTool). UI state only — no history; creating a text
   *  field with a tool commits through applyTemplate like every other edit. */
  canvasTool: CanvasTool;
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

  setActiveTab: (tab: EditorTab) => void;
  setPreviewBg: (bg: PreviewBg) => void;
  setActivePanel: (panel: SidePanel) => void;

  setHtml: (html: string) => void;
  setCss: (css: string) => void;
  setJs: (js: string) => void;
  /** A deterministic panel patch to the CSS: updates + highlights, no history snapshot. */
  patchCss: (css: string) => void;

  /** Replace the whole template (used by the panels, AI, and the wizard). */
  applyTemplate: (template: SpxTemplate, opts?: { resetSampleData?: boolean; keepGalleryOpen?: boolean }) => void;
  /** Restore the template from before the last apply. No-op when history is empty. */
  undo: () => void;
  /** Re-apply the last undone snapshot. No-op when nothing was undone (or a new edit
   *  happened since — new edits clear the redo stack). */
  redo: () => void;
  /** Ask the playout simulator to replay the graphic (used after Motion applies). */
  requestReplay: () => void;
  /** Drive the live preview from the Control panel (update/play/stop/next), immediately. */
  sendControl: (action: PlayoutAction) => void;
  /** Dispatch a state-machine operator event on the preview, with an optional flat
   *  {field: value} payload applied only if the machine accepts the event. */
  sendEvent: (event: string, payload?: Record<string, string>) => void;
  /** Snap the preview's machine to states instantly ({group: state}; null = all initial). */
  sendSnap: (assignments: Record<string, string> | null) => void;
  /** The preview's live machine pointers ({group: state}), or null before the graphic has
   *  reported. The simulator owns the iframe and polls it ONCE; every surface that shows
   *  operator event buttons reads this to grey what the machine would drop, so the editor's
   *  strip, the Control panel and a hosted control page all mirror the same structural guard.
   *  Editor UI state - never persisted, never written into the template. */
  machineGroups: Record<string, string> | null;
  setMachineGroups: (groups: Record<string, string> | null) => void;
  /** WHICH timeline the step surface is editing (blocks/timelineLens.ts): the default path,
   *  or one branch state's own inline timeline. It lives here rather than in the dock because
   *  the INSPECTOR resolves values and stamps keyframes against the same projection - a
   *  component-local target would have it editing the entrance while the timeline showed a
   *  branch. UI state, no history; reset to the path on a whole-project swap. */
  timelineTarget: TimelineTarget;
  setTimelineTarget: (target: TimelineTarget) => void;
  /** Seek the live preview's in/out/step timeline to a time (the timeline view's scrubber). */
  sendScrub: (phase: string, time: number) => void;
  /** Select ONE element by its TemplatePart selector (null deselects) — replaces the
   *  whole selection; see selectedPart/selectedParts. */
  setSelectedPart: (selector: string | null) => void;
  /** Replace the whole selection (the lasso's setter; [] clears). */
  setSelectedParts: (selectors: string[]) => void;
  /** Shift-click: add the selector to the selection, or remove it when present. */
  toggleSelectedPart: (selector: string) => void;
  /** Lock or unlock a part for canvas gestures (see partLocks). */
  setPartLock: (selector: string, locked: boolean) => void;
  /** Park the step timeline's playhead (see playhead). */
  setActiveSurface: (surface: 'canvas' | 'timeline') => void;
  setPointerOverStage: (over: boolean) => void;
  /** Balanced pair — always through useModalGate, never called by hand. */
  pushModal: () => void;
  popModal: () => void;
  setPlayhead: (playhead: { step: number; t: number } | null) => void;
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
  /** Mark a canvas gesture as started/ended (see canvasGestureActive). */
  setCanvasGestureActive: (active: boolean) => void;
  /** Arm a canvas tool (see canvasTool). */
  setCanvasTool: (tool: CanvasTool) => void;
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
  setEditorContext: (ctx: EditorContext | null) => void;
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

// Restore the last autosaved working project (Era 5.2b) so a reload doesn't lose it; fall back to
// a fresh blank on first-ever load. Whether the wizard opens on top follows from this: a restored
// project means a returning user, who lands straight back in their work (galleryOpen below).
const initialProject = loadProject();
const initialTemplate = initialProject?.template ?? createDefaultTemplate();
// The pristine state Reset returns to: the saved baseline if we have one, else the loaded
// template (so Reset on a pre-baseline project at least returns to how it opened).
const initialBaseline = initialProject?.baseline ?? initialTemplate;

export const useTemplateStore = create<TemplateState>((set, get) => ({
  template: initialTemplate,
  baseline: initialBaseline,
  activeTab: 'html',
  previewBg: 'checkerboard',
  activePanel: 'data',
  panelRevealNonce: 0,
  sampleData: syncSampleData(initialTemplate, {}),
  validation: null,
  previewError: null,
  editorContext: null,
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
  lastChange: null,
  replayNonce: 0,
  controlCommand: null,
  scrubCommand: null,
  selectedPart: null,
  selectedParts: [],
  partLocks: {},
  activeSurface: 'canvas',
  pointerOverStage: false,
  modalCount: 0,
  playhead: null,
  machineGroups: null,
  timelineTarget: PATH_TARGET,
  canvasGestureActive: false,
  canvasTool: 'select',
  saved: {
    graphicId: initialProject?.graphicId ?? null,
    dirty: initialProject?.dirty ?? false,
    status: 'idle',
  },
  aiSpec: initialProject?.aiSpec ?? null,
  aiThread: normalizeThread(initialProject?.aiThread),
  legibility: normalizeLegibility(initialProject?.legibility) ?? null,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setPreviewBg: (bg) => set({ previewBg: bg }),
  setActivePanel: (panel) =>
    set((s) => ({ activePanel: panel, panelRevealNonce: s.panelRevealNonce + 1 })),

  // A deterministic CSS patch from the Style panel: highlight what changed (no history
  // snapshot — color drags fire dozens of these per second).
  patchCss: (css) =>
    set((s) => {
      const next = { ...s.template, css };
      return {
        template: next,
        validation: null,
        future: [],
        lastChange: diffTemplates(s.template, next, (s.lastChange?.nonce ?? 0) + 1),
      };
    }),

  // Manual typing clears the change highlight — the user is editing, not reviewing.
  setHtml: (html) =>
    set((s) => {
      const template = withParsedFields({ ...s.template, html });
      return { template, sampleData: syncSampleData(template, s.sampleData), validation: null, future: [], lastChange: null };
    }),
  setCss: (css) => set((s) => ({ template: { ...s.template, css }, validation: null, future: [], lastChange: null })),
  setJs: (js) => set((s) => ({ template: { ...s.template, js }, validation: null, future: [], lastChange: null })),

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
        // Canvas locks belong to the project being edited: part selectors repeat across
        // projects (every imported design has an `.imported-design-art`), so a whole-project
        // swap must not carry the last graphic's unlocked artwork into the new one.
        partLocks: opts?.resetSampleData ? {} : s.partLocks,
        // Same reason: the previous graphic's machine pointers would grey the new graphic's
        // event buttons against a state it was never in, until the next poll corrected it.
        machineGroups: opts?.resetSampleData ? null : s.machineGroups,
        // The branch a previous graphic had open cannot exist in the new one.
        timelineTarget: opts?.resetSampleData ? PATH_TARGET : s.timelineTarget,
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
        // Highlight what changed in the editor — but not for whole-project swaps
        // (a new project changes everything; a highlight would just be noise).
        lastChange: opts?.resetSampleData
          ? null
          : diffTemplates(s.template, synced, (s.lastChange?.nonce ?? 0) + 1),
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
        lastChange: null,
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
        lastChange: null,
      };
    }),

  requestReplay: () => set((s) => ({ replayNonce: s.replayNonce + 1 })),

  sendControl: (action) => set((s) => ({ controlCommand: { action, nonce: (s.controlCommand?.nonce ?? 0) + 1 } })),

  sendEvent: (event, payload) =>
    set((s) => ({ controlCommand: { action: 'event', event, payload, nonce: (s.controlCommand?.nonce ?? 0) + 1 } })),

  sendSnap: (assignments) =>
    set((s) => ({ controlCommand: { action: 'snap', snap: assignments, nonce: (s.controlCommand?.nonce ?? 0) + 1 } })),

  // The poll runs every 500 ms; keep the previous object when nothing moved so subscribers
  // re-render on a real state change, not on the tick.
  setMachineGroups: (groups) =>
    set((s) => (JSON.stringify(s.machineGroups) === JSON.stringify(groups) ? {} : { machineGroups: groups })),

  setTimelineTarget: (timelineTarget) => set({ timelineTarget, playhead: null }),

  sendScrub: (phase, time) => set((s) => ({ scrubCommand: { phase, time, nonce: (s.scrubCommand?.nonce ?? 0) + 1 } })),

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

  setPartLock: (selector, locked) =>
    set((s) => ({ partLocks: { ...s.partLocks, [selector]: locked } })),

  setActiveSurface: (activeSurface) => set({ activeSurface }),

  setPointerOverStage: (pointerOverStage) => set({ pointerOverStage }),

  pushModal: () => set((s) => ({ modalCount: s.modalCount + 1 })),
  popModal: () => set((s) => ({ modalCount: Math.max(0, s.modalCount - 1) })),

  setPlayhead: (playhead) => set({ playhead }),

  setSaved: (saved) => set({ saved }),

  setAiSpec: (aiSpec) => set({ aiSpec }),
  setAiThread: (aiThread) => set({ aiThread }),
  setLegibility: (legibility) => set({ legibility: normalizeLegibility(legibility) ?? null }),

  setCanvasGestureActive: (canvasGestureActive) => set({ canvasGestureActive }),

  setCanvasTool: (canvasTool) => set({ canvasTool }),

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
  // an asset add must not re-parse the definition, close the gallery, or repaint the
  // change highlight. Undo/redo restore whole-template snapshots, so assets travel free.
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
  setEditorContext: (editorContext) => set({ editorContext }),
  setGuide: (key, value) => set((s) => ({ guides: { ...s.guides, [key]: value } })),

  openGallery: (designId) => set({ galleryOpen: true, pendingDesignId: designId ?? null }),
  closeGallery: () => set({ galleryOpen: false }),
}));

// Autosave the working project (debounced) whenever the template actually changes, so a reload
// restores it instead of a blank default. Covers every mutation that touches the template — panels,
// AI, wizard, and manual edits — in one place. Local only for now; cloud sync of this single
// 'project' record lands with the singleton work.
//
// The same subscription flips the save link DIRTY: any template change means the working
// document has drifted from its library record. saveActions' open/save paths set the link
// AFTER their applyTemplate returns, so their state wins over this generic marking.
let projectSaveTimer: ReturnType<typeof setTimeout> | null = null;
useTemplateStore.subscribe((state, prev) => {
  // The legibility settings are part of the SAVED document (GraphicDoc.legibility), not a
  // view preference, so a change to them drifts the working document exactly as a template
  // edit does. Without this the editor's Viewing control looked like it worked and lost the
  // choice on reload — the wizard's copy only ever persisted because creating a project
  // changes the template in the same breath.
  if (state.template === prev.template && state.legibility === prev.legibility) return;
  if (!state.saved.dirty) {
    useTemplateStore.setState((s) => ({ saved: { ...s.saved, dirty: true } }));
  }
  if (projectSaveTimer) clearTimeout(projectSaveTimer);
  projectSaveTimer = setTimeout(() => {
    const s = useTemplateStore.getState();
    saveProject(s.template, s.baseline, { graphicId: s.saved.graphicId, dirty: s.saved.dirty }, s.aiSpec, s.aiThread, s.legibility);
  }, 800);
});
