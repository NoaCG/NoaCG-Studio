import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { variantById, variantsFor } from '../../templates/catalog';
import { createBlankTemplate } from '../../templates/blank';
import {
  armTimerClock,
  brandClearPatch,
  brandPatch,
  buildDraftTemplate,
  draftFormatSelection,
  draftName,
  draftResolution,
  formatDraftPatch,
  initialDraft,
  mergeDraft,
  proposeSvgBehaviour,
  proposeSvgExtras,
  type DraftPatch,
  type WizardDraft,
} from './draft';
import { type ProjectBrand } from '../../model/brand';
import { loadLooks } from '../../model/packets';
import { FONTS, fontNameKey } from '../../model/fonts';
import { commitStagedSelection } from '../../ai/preferences';
import { formatTemplate } from '../../format/formatCode';
import { paletteById } from '../../model/wizard';
import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import WizardPreview, { type PreviewBoxOverlay } from './WizardPreview';
import BrandLogo from '../BrandLogo';
import { BetaFeedbackButton } from '../feedback/BetaFeedback';
import EntryStep from './steps/EntryStep';
import {
  ImportStep,
  ImportDesignStep,
  PrepareDesignStep,
  PlaceFieldsStep,
  MapSvgFieldsStep,
} from './import';
import TemplateStep from './steps/TemplateStep';
import BrowseStep, { type BuildMode } from './steps/BrowseStep';
import { defaultFamilyFor, defaultSelectionFor } from './steps/KitPicker';
import KitTray from './KitTray';
import KitLookStep from './steps/KitLookStep';
import KitFinishStep from './steps/KitFinishStep';
import { buildRemaining, kitItemDraft, type KitPlan } from './kitPlan';
import { NO_BROWSE_FILTERS, type BrowseFilters } from '../../templates/search';
import FieldsStep from './steps/FieldsStep';
import StyleStep from './steps/StyleStep';
import AnimationStep from './steps/AnimationStep';
import AiStep from './steps/AiStep';
import VideoStep from './steps/VideoStep';
import BlankStep from './steps/BlankStep';
import FinishStep, {
  aiSummaryRows,
  catalogSummaryRows,
  importedSummaryRows,
  type SummaryStepKey,
} from './steps/FinishStep';
import { importTemplateFile, type ImportedTemplateResult } from '../../model/importTemplate';
import { useExportUi } from '../ExportWindow';
import { useMarkLegibility } from './useMarkLegibility';
import type { SpxTemplate } from '../../model/types';
import { clearSpecDraft, type GenerationSpec } from '../../model/generationSpec';
import type { AiThread } from '../../model/aiThread';
import type { VideoProject } from '../../model/videoTypes';
import { useVideoProjectStore } from '../../store/videoProjectStore';
import { useDocKindStore } from '../../store/docKindStore';
import { useModalGate } from '../spaceKey';
import { useIsMobile } from '../useIsMobile';
import { useRouter, type Route } from '../../app/router';
import NewGraphicButton from '../NewGraphicButton';
import { saveCurrentGraphic, saveGraphicAs } from '../../store/saveActions';
import { graphicById, graphicNameIndex, librarySaveEffect, type LibraryNameEntry } from '../../model/library';
import WizardConfirm, { wizardConfirmOpen } from './WizardConfirm';
import { recordLiteOutcome } from '../../ai/lite/client';
import { DEFAULT_VIDEO_FORMAT, formatProjectSummary } from '../../model/projectFormat';
import { trackEvent } from '../../backend/events';
import { captureLookFromTemplate } from '../../model/packets';
import { saveTemplateSetToProduction } from '../../model/templateSet';
import { addGraphicToShow, createShowNamedChecked, loadShows, setShowLook, type Show } from '../../model/shows';
import { commitDurableWrites } from '../../model/durableStore';
import { raiseStorageAlert } from '../../store/storageAlert';
import type { ProductionDest } from './steps/FinishStep';
import { useAdvancedMode } from '../useAdvancedMode';
import type { TemplatePack } from '../../templates/packs';
import { kitSelection } from '../../templates/kit';
import type { StyleTag } from '../../model/fonts';

// The catalog flow browses ONE faceted step (search + programme + category + refinements —
// docs/TEMPLATE_TAXONOMY_PROPOSAL.md §12) instead of the old Category → Template pair.
// Every catalog-shaped flow ends on FINISH: the graphic is named there, and the wizard's one
// branch is taken — open it in the editor, or go straight to its export packages without the
// editor ever being involved (steps/FinishStep.tsx + components/ExportWindow.tsx).
/**
 * A Finish door whose SAVE failed. Every such door reaches a surface the wizard no longer owns
 * (applyGenerated replaces the route, which closes the wizard), so the report has to come from
 * the app-level dialog - an inline message here would unmount before anyone read it. The
 * outcome line says where the work actually is, which is the part a "storage is full" string
 * alone never answers.
 */
function reportFailedCreateSave(name: string, error: string | null): void {
  raiseStorageAlert({
    action: `Saving “${name}”`,
    error: error ?? 'The graphic could not be saved.',
    outcome:
      'It is still open in the editor — free some room, then press Save. You can still export it from here without saving.',
  });
}

const STEP_TITLES = ['Start', 'Browse', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_IMPORT = ['Start', 'Images', 'Template', 'Fields', 'Style', 'Animation', 'Finish'];
const STEP_TITLES_AI = ['Start', 'Create', 'Finish'];
const STEP_TITLES_VIDEO = ['Start', 'Video'];
const STEP_TITLES_BLANK = ['Start', 'Blank project'];
// Import-graphic mode is a SETUP flow, not a second editor: bring the artwork in, prepare it
// (erase baked-in text, pick how it meets long text), PLACE editable text on it, choose the
// in/out animation, create — and land in the real canvas editor with a graphic that already
// works. Text and Animation are optional stops: Create is available from the Design step on
// (docs/IMPORT_MVP.md).
const STEP_TITLES_DESIGN = ['Start', 'Design', 'Prepare', 'Text', 'Animation', 'Finish'];
// A layered SVG dropped on that same zone has nothing to erase and nothing to place — its
// text layers are already exactly where the designer set them — so its walk swaps
// Prepare/Text for ONE mapping step: which layers the operator can edit
// (docs/SVG_IMPORT_PLAN.md §2). A MODE, not a branch, for the same reason 'file' is one.
const STEP_TITLES_SVG = ['Start', 'Design', 'Fields', 'Animation', 'Finish'];
// A finished template (.html / .zip) dropped on that same zone has nothing to prepare, place
// or animate — it already declares all three — so its walk is two stops: the file, then where
// it goes. A MODE rather than a branch inside design mode, so the rail never offers four steps
// that cannot apply to it.
const STEP_TITLES_FILE = ['Start', 'Template file', 'Finish'];

/** Which walk the wizard is on. Each one has its own step list above. */
type WizardMode = 'template' | 'import' | 'design' | 'svg' | 'file' | 'ai' | 'video' | 'blank';

/** The walks whose created graphic actually carries the draft's palette and typeface — the
 *  BRAND CHOOSER in the footer, and the reasoning, are there. */
const BRAND_MODES: WizardMode[] = ['template', 'import', 'design', 'svg', 'ai'];

/** One entry in the footer's brand chooser: a saved brand, by the name its owner gave it.
 *
 *  It is a shape of its own rather than a `SavedLook` because one entry is NOT a saved record -
 *  a production that carries a captured look and has never chosen a brand is offered its own
 *  look under a synthetic id, so the chooser can show what the graphic is actually being created
 *  in instead of showing None over a preselected look. */
interface BrandChoice {
  id: string;
  name: string;
  brand: ProjectBrand;
}

/** The synthetic entry above. Never a look id, so it can never collide with one. */
const PRODUCTION_LOOK_ID = 'production-look';

/** The active walk's steps, in order. One function so the RAIL and the URL can never disagree
 *  about what step 3 of this mode is called. */
function stepTitlesFor(mode: WizardMode, kitWalk: boolean): string[] {
  return mode === 'ai' ? STEP_TITLES_AI
    : mode === 'video' ? STEP_TITLES_VIDEO
    : mode === 'blank' ? STEP_TITLES_BLANK
    : mode === 'design' ? STEP_TITLES_DESIGN
    : mode === 'svg' ? STEP_TITLES_SVG
    : mode === 'file' ? STEP_TITLES_FILE
    : mode === 'import' ? STEP_TITLES_IMPORT
    : kitWalk ? STEP_TITLES_KIT
    : STEP_TITLES;
}

/** A step's name in the URL: its TITLE, slugged. Never its index — import mode carries an extra
 *  Images step, so index 3 is Fields on one walk and Style on another, and a history entry
 *  written by one mode would mean a different step when another mode read it back. */
function stepSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

/* What each step is FOR, in the reader's words — the second line of every rail entry
   (re-design/handoff.md §2). A title alone says where you are; the sub says what the step
   will ask you. Parallel to the arrays above, index for index, so the two cannot drift.
   The vocabulary follows docs/DESIGN_LANGUAGE.md §0: a family is a TYPEFACE, never a font. */
const STEP_SUBS: Record<string, string[]> = {
  template: ['Choose mode', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
  import: ['Choose mode', 'Add pictures', 'Pick a design', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Name & save'],
  ai: ['Choose mode', 'Describe it', 'Name & save'],
  video: ['Choose mode', 'Brief & format'],
  blank: ['Choose mode', 'Format & name'],
  design: ['Choose mode', 'Your artwork', 'Erase & scale', 'Place fields', 'In & out motion', 'Name & save'],
  svg: ['Choose mode', 'Your artwork', 'Map text layers', 'In & out motion', 'Name & save'],
  file: ['Choose mode', 'Your graphic', 'Name & save'],
};

/* A KIT walks the SAME six steps as one graphic — that is the whole point of folding the two
   doors into one — so it borrows `template`'s rail and changes only the words that would be
   wrong: the step where a design is chosen is where the SHOW is chosen, and the last step
   names a production rather than a graphic. */
const STEP_SUBS_KIT = ['Choose mode', 'Pick the show', 'Operator inputs', 'Colors & typeface', 'In & out motion', 'Where it goes'];
const STEP_TITLES_KIT = ['Start', 'Kit', 'Fields', 'Style', 'Animation', 'Finish'];

/** The AI step's current result, previewed live like any draft. Named because the walk
 *  snapshot below has to hold one too, and two inline copies of this shape would drift. */
type AiResultState = {
  template: SpxTemplate;
  valid: boolean;
  spec?: GenerationSpec | null;
  generationId?: string;
  /** Pipeline provenance — 'pro' marks a Pro-tier result for the activation event. */
  path?: string | null;
  /**
   * The whole PACKAGE this result belongs to, LEADING with `template` (§15.9): a Pro
   * generation renders ONE design language as every graphic type the user asked for, and a
   * set of several is finished into a PRODUCTION rather than opened as one project.
   */
  pack?: SpxTemplate[] | null;
} | null;

/**
 * THE WALK JUST FINISHED — everything needed to step back INTO it (docs/backlog/
 * back-to-the-wizard.md, entry point 1: "the draft is still in memory; this is undo the last
 * screen").
 *
 * The wizard wipes itself on every open ("Fresh wizard every time"), which is right for the
 * door marked "+ New graphic" and wrong for a reader who pressed Back thirty seconds after
 * creating and wanted the animation step. So the walk is snapshotted at the moment a door
 * closes the wizard, and offered back — behind a warning — when the reader returns to a STEP
 * url rather than to the wizard's front page.
 */
interface FinishedWalk {
  draft: WizardDraft;
  mode: WizardMode;
  step: number;
  browseFilters: BrowseFilters;
  aiResult: AiResultState;
  aiThread: AiThread | null;
  importedFile: ImportedTemplateResult | null;
  contextProductionId: string | null;
  brandChoices: BrandChoice[];
  brandId: string | null;
  /** What the walk produced, filled in once the door has finished doing it. */
  made: MadeGraphic | null;
}

/** The graphic a finished walk left behind — what the warning NAMES, and what a second pass
 *  down the same walk must write over rather than duplicate. */
interface MadeGraphic {
  name: string;
  /** The library record, when the door saved one (the editor door does not). */
  graphicId: string | null;
  /** The production it joined, by name, when it joined one. */
  production: string | null;
  /** Where the door LANDED the reader. Declining the walk back returns them exactly there,
   *  rather than to the Home page a plain wizard close would rewind to. Null when the door
   *  kept the wizard open (export), where there is nothing to walk back from. */
  landedOn: Route | null;
}

/**
 * The choose-first creation wizard (replaces the old template gallery). Six steps —
 * Entry → Browse → Fields → Style → Animation → Finish — with a persistent live preview
 * from step 2 on. Creating writes the complete, teachable template code; Finish decides
 * where that lands: the editor (and the live panels) take over, or the graphic is saved
 * and goes straight to its export packages with the editor never opening.
 */
export default function CreationWizard() {
  const open = useTemplateStore((s) => s.galleryOpen);
  // Mounted for the session, rendering null when closed — so the gate keys on `open`, not on
  // mount, or every editor shortcut in the app would be dead from first paint.
  useModalGate(open);
  const closeGallery = useTemplateStore((s) => s.closeGallery);
  // Has the created graphic been touched since the door saved it? The app's own answer, so the
  // walk-back warning promises to write over hand edits only when there are some. A door that
  // saved nothing (the editor one) reads dirty from birth, which is the right answer there too.
  const workingDirty = useTemplateStore((s) => s.saved.dirty);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);

  const isMobile = useIsMobile();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<WizardMode>('template');
  /** A finished template file dropped on the Import graphic step — parsed, never rebuilt. */
  const [importedFile, setImportedFile] = useState<ImportedTemplateResult | null>(null);
  const [importedFileError, setImportedFileError] = useState<string | null>(null);
  const [draft, setDraft] = useState<WizardDraft>(initialDraft);
  // Browse-step facet state lives here (not in the step) so Back returns with the
  // filters intact for the wizard session; a fresh open starts clean.
  const [browseFilters, setBrowseFilters] = useState<BrowseFilters>(NO_BROWSE_FILTERS);
  const [replayKey, setReplayKey] = useState(0);
  // Describe-it mode: the AI's current (validated) result, previewed live like any draft —
  // plus the structured setup it was generated under (saved with the created project).
  const [aiResult, setAiResult] = useState<AiResultState>(null);
  // The Create-with-AI conversation as it stands (talk turns only), reported by AiStep on every
  // change — committed to the created project so the graphic carries the reasoning that made it.
  const [aiThread, setAiThread] = useState<AiThread | null>(null);
  const acceptedAiGeneration = useRef<string | null>(null);
  // THE BRAND CHOOSER (docs/BRAND_PLAN.md §5). `brandChoices` is what the footer offers -
  // every saved brand, plus a production's own captured look when it has one and no brand;
  // `brandId` is which of them is chosen, null being None. The chosen brand is DERIVED rather
  // than held: two states saying which brand is in force is two states that can disagree.
  const [brandChoices, setBrandChoices] = useState<BrandChoice[]>([]);
  const [brandId, setBrandId] = useState<string | null>(null);
  const brand = brandId ? brandChoices.find((b) => b.id === brandId)?.brand ?? null : null;
  // The production this open is FOR (one-shot from pendingProductionId; Finish preselects it).
  const [contextProductionId, setContextProductionId] = useState<string | null>(null);
  // ── BACK INTO THE WALK ──
  // The walk the last door closed the wizard on. A REF, not state: it has to survive the
  // closed wizard's null render, and nothing on screen depends on it until the reader
  // returns.
  const finishedWalk = useRef<FinishedWalk | null>(null);
  // The walk being offered back, which IS on screen — the warning naming what re-entering
  // resets. Null while nothing is being asked.
  const [resumeAsk, setResumeAsk] = useState<FinishedWalk | null>(null);
  /** The graphic this stretch of wizard has ALREADY made — set by the door that made it, and
   *  carried across a walk-back until the wizard is opened fresh. It is what stops a second
   *  pass down the same walk minting a second library record under the same name, whether the
   *  second pass came from a resume or from pressing Export twice without leaving Finish. */
  const madeThisOpen = useRef<MadeGraphic | null>(null);
  const advanced = useAdvancedMode((s) => s.advanced);
  // Prepare step's content-width slider (Import graphic, stretch mode): preview-only demo
  // text pushed into the live preview — never part of the draft or the created template.
  const [stretchDemo, setStretchDemo] = useState<string | null>(null);
  // SVG mapping step: which layer the checklist is pointing at. It lives here rather than in
  // the step because the highlight is drawn on the PREVIEW — the step's one canvas, and the
  // only one carrying the fit runtime (docs/SVG_IMPORT_PLAN.md §6a step 1).
  const [svgHoverId, setSvgHoverId] = useState<string | null>(null);
  // And the BOX that layer lives in, with the room round it and the alignment the file drew -
  // what the preview's box overlay draws (docs/TEXT_BOX_BINDING.md). Held beside the hover for
  // the same reason and measured by the step, which is the one holding the artwork.
  const [svgBoxOverlay, setSvgBoxOverlay] = useState<PreviewBoxOverlay | null>(null);
  // The mapping step's "draw a field" handler while it is armed (plan §6a step 3). The handler
  // itself lives in a REF and only the armed/not-armed answer is state: the step re-reports it
  // on every render (its closure reads the draft, so its identity changes with every keystroke),
  // and holding a FUNCTION in state would make each of those a state change, each a render, each
  // a fresh identity — a loop React stops with "Maximum update depth exceeded". A boolean
  // settles on the second pass.
  const svgDrawRef = useRef<((box: { x: number; y: number; w: number; h: number }) => void) | null>(null);
  const [svgDrawArmed, setSvgDrawArmed] = useState(false);
  const armSvgDraw = useCallback(
    (handler: ((box: { x: number; y: number; w: number; h: number }) => void) | null) => {
      svgDrawRef.current = handler;
      setSvgDrawArmed(!!handler);
    },
    [],
  );
  // Stable, so the canvas never re-installs its listeners for a handler that only looks new.
  const onSvgDraw = useCallback((box: { x: number; y: number; w: number; h: number }) => {
    svgDrawRef.current?.(box);
  }, []);
  // The mapping step's PICK handler, held the same way and for the same reason (plan §6a step 5).
  const svgPickRef = useRef<((candidateId: string, drag: 'x' | 'y' | null) => void) | null>(null);
  const armSvgPick = useCallback(
    (handler: ((candidateId: string, drag: 'x' | 'y' | null) => void) | null) => {
      svgPickRef.current = handler;
    },
    [],
  );
  // Selector -> the marker it carries; the canvas speaks selectors, the step speaks candidates.
  const onSvgPick = useCallback((selector: string, drag: 'x' | 'y' | null) => {
    const id = /="([^"]+)"/.exec(selector)?.[1];
    if (id) svgPickRef.current?.(id, drag);
  }, []);
  // EVERY layer the import inventoried, as selectors the canvas can hit-test. The text layers,
  // the pictures, the outlined-text groups, the rectangles AND the named groups all answer a
  // pointer - which is what makes the artwork the control surface rather than a picture beside
  // the controls. Groups were missing until the owner armed "pick what travels" over a lower
  // third and could only ever hit the fields (2026-08-25 walk): a follower is usually a named
  // LAYER, so the picker has to reach them. The innermost-first tie-break keeps a group from
  // answering for the text or rectangle drawn inside it.
  const svgPickable = useMemo(() => {
    const s = draft.designSvg;
    if (!s) return [];
    // DISTINCT markers, not distinct rows: a picture-filled backplate is offered as a picture
    // AND as the panel that grows, on the one marker (assets/svgImport.ts), and pushing its
    // selector twice would hand the hit-test two identical rects to break its depth tie-break on.
    return [
      ...new Set(
        [...s.candidates, ...s.images, ...s.outlines, ...s.shapes, ...s.groups].map((c) => c.id),
      ),
    ].map((id) => `[${SVG_CANDIDATE_ATTR}="${id}"]`);
  }, [draft.designSvg]);
  // ── THE KIT HALF of the Browse step (one graphic, or the whole set) ──
  // Its picker state lives here, not in the step, for the same reason `browseFilters` does:
  // Back must return to the set exactly as it was left.
  const [buildMode, setBuildMode] = useState<BuildMode>('one');
  const [kitPack, setKitPack] = useState<TemplatePack | null>(null);
  const [kitFamily, setKitFamily] = useState<StyleTag | null>(null);
  const [kitSelected, setKitSelected] = useState<string[]>([]);
  /** The kit under construction — set when Browse's Next is taken in kit mode, null otherwise.
   *  Its presence is what makes every step below behave as one graphic OF A SET. */
  const [kit, setKit] = useState<KitPlan | null>(null);
  /** The production's name on the kit's Finish step (the graphic name field's counterpart). */
  const [kitProductionName, setKitProductionName] = useState('');
  // Saving a kit writes N library records plus a production, so it reports progress and any
  // failure reason inline rather than failing silently.
  const [kitBusy, setKitBusy] = useState(false);
  const [kitError, setKitError] = useState<string | null>(null);
  // The step scroller flags when content hides below the fold (short laptop windows), so the
  // CSS can show a bottom fade cue — without it the overflow is invisible and a first-run
  // user never learns the lower entry cards exist. Scroll + resize + DOM changes all re-check.
  const stepRef = useRef<HTMLDivElement>(null);
  const [stepOverflow, setStepOverflow] = useState(false);
  // ── THE WALK IS THE HISTORY ──
  // Every step the reader reaches gets its own history entry (`#/new/step/<name>`), so browser
  // Back walks the wizard backwards. Before this, the whole wizard was ONE entry: Back from
  // step four of six left for the landing page and threw the walk away, which is the last thing
  // a Back press should mean on the product's primary door.
  //
  // Step 0 deliberately has NO step segment. Its entry is the plain `#/new`, so Back off the
  // front page still LEAVES the wizard — the contract App.tsx's routed-wizard effect keeps.
  const stepTitles = stepTitlesFor(mode, !!kit || buildMode === 'kit');
  const route = useRouter((s) => s.route);
  const stepKey = step > 0 ? stepSlug(stepTitles[step] ?? '') : null;
  /** The step this component last agreed with the URL about. Comparing it to `stepKey` is what
   *  tells the two directions apart: if the WIZARD moved, push the new step; if the URL moved
   *  (Back/Forward), follow it. Without that, following a Back would look like a step change
   *  and immediately push the reader forward again. */
  const syncedStepKey = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      syncedStepKey.current = null;
      return;
    }
    if (route.view !== 'new') return; // a create already navigated away; the wizard is closing
    const urlKey = route.step ?? null;
    const wizardMoved = syncedStepKey.current !== stepKey;
    syncedStepKey.current = stepKey;
    if (urlKey === stepKey) return;
    if (wizardMoved) {
      useRouter.getState().navigate({ view: 'new', design: route.design ?? null, step: stepKey });
    } else {
      // Back/Forward, or a hand-typed URL. An unknown name (a link written by a build whose
      // walk had other steps, or a step this mode does not have) degrades to the front page
      // rather than to a step that means something else here.
      const idx = stepTitles.findIndex((t) => stepSlug(t) === urlKey);
      setStep(idx >= 0 ? idx : 0);
    }
  }, [open, route, stepKey, stepTitles]);

  // Each route/step starts at its own first control. This is especially important on phones:
  // the Video entry sits at the bottom of Entry, and carrying that scrollTop forward used to
  // land Video below its project-format picker.
  useEffect(() => {
    if (stepRef.current) stepRef.current.scrollTop = 0;
  }, [step, mode]);
  useEffect(() => {
    if (!open) return;
    const el = stepRef.current;
    if (!el) return;
    const check = () =>
      setStepOverflow(el.scrollHeight - el.clientHeight - el.scrollTop > 12);
    check();
    el.addEventListener('scroll', check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    const mo = new MutationObserver(check);
    mo.observe(el, { childList: true, subtree: true });
    return () => {
      el.removeEventListener('scroll', check);
      ro.disconnect();
      mo.disconnect();
    };
  }, [open]);

  /** Back to "one graphic". Declared as a plain function (not a hook) so both the open reset
   *  and the ✕ rewind clear the same seven pieces of state — a kit half-cleared is a wizard
   *  whose rail says Browse and whose footer is still building somebody else's show. */
  function resetKit() {
    setBuildMode('one');
    setKitPack(null);
    setKitFamily(null);
    setKitSelected([]);
    setKit(null);
    setKitProductionName('');
    setKitError(null);
  }

  /** Forget the walk that has ended. Declared beside `resetKit` and for the same reason: a
   *  fresh open and the ✕ rewind both mean "this walk is over", and the two refs have to go
   *  together — `madeThisOpen` is what makes the next save write OVER a record instead of
   *  minting one, and `finishedWalk` is what a later browser Back would restore. */
  function forgetWalk() {
    madeThisOpen.current = null;
    finishedWalk.current = null;
  }

  // Fresh wizard every time it opens; reload the brand (it may have just been saved).
  useEffect(() => {
    if (open) {
      const opening = useRouter.getState().route;
      // ── BACK INTO THE WALK, NOT A FRESH ONE ──
      // A re-open onto a STEP url with a finished walk still in memory is the reader coming
      // BACK: browser Back off the production page (or the editor) lands on the step entry the
      // walk itself pushed. The wizard's own "+ New graphic" door goes to the plain `#/new`
      // instead, which is how the two are told apart — and why that door still gets the fresh
      // wizard it promises, discarding the walk on the way.
      const walk = finishedWalk.current;
      if (walk && opening.view === 'new' && opening.step) {
        setDraft(walk.draft);
        setMode(walk.mode);
        setStep(walk.step);
        setBrowseFilters(walk.browseFilters);
        setAiResult(walk.aiResult);
        setAiThread(walk.aiThread);
        setImportedFile(walk.importedFile);
        setImportedFileError(null);
        // A walk that ENDED in a production comes back POINTING at it. The warning promises
        // the copy in that rundown is replaced, and Finish's picker defaults to the first
        // saved production when nothing points it anywhere - the OLDEST one - so without this
        // a second finish would quietly append a copy to a show the reader never named, and
        // leave the stale one where it was.
        const landed = walk.made?.landedOn;
        setContextProductionId(landed?.view === 'production' ? landed.id : walk.contextProductionId);
        // The editor door saves nothing, so the walk recorded no library record. If the reader
        // saved it themselves before coming back, the working document is still linked to that
        // record and this walk should write over it rather than mint a twin under one name.
        const made = walk.made;
        if (made && !made.graphicId) {
          const live = useTemplateStore.getState().saved.graphicId;
          if (live && graphicById(live)?.name === made.name) made.graphicId = live;
        }
        madeThisOpen.current = made;
        setBrandChoices(walk.brandChoices);
        setBrandId(walk.brandId);
        setStretchDemo(null);
        resetKit();
        // The step the walk ENDED on, not the one the history entry happens to name: the
        // reader wants the last screen back (docs/backlog/back-to-the-wizard.md), and leaving
        // the URL on an earlier step would make the rail and the address bar disagree.
        useRouter.getState().replace({
          view: 'new',
          step: stepSlug(stepTitlesFor(walk.mode, false)[walk.step] ?? ''),
        });
        // Nothing is restored silently: re-entering REGENERATES, so the warning naming what
        // that writes over goes up with it.
        setResumeAsk(walk);
        return;
      }
      forgetWalk();
      setResumeAsk(null);
      // A `#/new/step/<name>` OPEN starts on the step the URL names — a reload three steps in,
      // or a link somebody was sent. This reset runs AFTER the route sync above on the same
      // mount, so a hard-coded 0 here silently won and every step link landed on Entry.
      // Resolved against the walk this reset installs (mode 'template', no kit), which is the
      // only walk a cold open can be on; a name that walk does not have degrades to the front
      // page rather than to whatever step happens to sit at some index.
      const named =
        opening.view === 'new' && opening.step
          ? stepTitlesFor('template', false).findIndex((t) => stepSlug(t) === opening.step)
          : -1;
      setStep(named > 0 ? named : 0);
      setMode('template');
      setDraft(initialDraft());
      setBrowseFilters(NO_BROWSE_FILTERS);
      setAiResult(null);
      acceptedAiGeneration.current = null;
      setAiThread(null);
      setStretchDemo(null);
      resetKit();
      // Every saved brand, offered by name. NONE is selected: matching is an explicit act, and
      // a person with no brands sees no chooser at all (docs/BRAND_PLAN.md decision 1). The
      // DEFAULT brand does not preselect itself here either - it is what Home's "Use for new
      // graphics" star means, and the wizard still asks.
      const saved = loadLooks().map((l) => ({ id: l.id, name: l.name, brand: l.brand }));
      setBrandChoices(saved);
      setBrandId(null);
      // PRODUCTION CONTEXT (step 6): opened FOR a production (its page's "+ New graphic"),
      // the wizard pre-applies that production's look — the unified brand its graphics
      // share — and the Finish step preselects it. One-shot, like pendingDesignId.
      const forProduction = useTemplateStore.getState().pendingProductionId;
      useTemplateStore.setState({ pendingProductionId: null });
      setContextProductionId(forProduction);
      if (forProduction) {
        const show = loadShows().find((s) => s.id === forProduction);
        // The REFERENCE wins over the captured copy (model/shows.ts `brandId`): a production
        // that named a brand gets whatever that brand says today, and one that only ever
        // captured a look is offered that look under a synthetic entry, so the chooser names
        // what the graphic is being created in rather than reading None over a preselection.
        const named = show?.brandId ? saved.find((b) => b.id === show.brandId) : undefined;
        const chosen: BrandChoice | null =
          named ?? (show?.look ? { id: PRODUCTION_LOOK_ID, name: `${show.name} (this production's look)`, brand: show.look } : null);
        if (chosen) {
          if (!named) setBrandChoices([chosen, ...saved]);
          setBrandId(chosen.id);
          setDraft((d) => mergeDraft(d, brandPatch(chosen.brand)));
        }
      }
    } else {
      // BACK TO STEP 0 ON CLOSE TOO. This component stays mounted and renders null when it is
      // closed, so a closed wizard still holds the step its last walk ended on. The route sync
      // above would read that stale step at the NEXT open and push it into the URL - so "+ New
      // graphic" after finishing a walk reopened the wizard on Finish instead of on Entry.
      setStep(0);
    }
  }, [open]);

  // A `#/new/<designId>` deep link (docs/PRERENDER.md's template-page CTA) preselects that
  // catalog design and drops straight to Fields — the same patch BrowseStep's onPickVariant
  // applies — WITHOUT creating a project; Finish is still the only door that does. A
  // subscribed selector (not a getState() read in the effect above) because a first-ever
  // visit already opens the wizard by default, before the router's `openGallery(designId)`
  // call reaches the store — `open` never flips false→true in that race, so only a change in
  // `pendingDesignId` itself can trigger this. It clears `pendingDesignId` itself the moment
  // it runs, so it fires exactly once per deep link and never re-applies after the user has
  // moved on.
  const pendingDesignId = useTemplateStore((s) => s.pendingDesignId);
  useEffect(() => {
    if (!open || !pendingDesignId) return;
    const pending = variantById(pendingDesignId);
    useTemplateStore.setState({ pendingDesignId: null });
    // Imported-design designs create BARE through a dedicated setup flow (mode 'design'),
    // never through the Browse pick path — excluded here for the same reason Browse never
    // lists it. An id that fails to resolve at all (missing, retired, or a manually edited
    // URL) leaves the wizard exactly where the reset effect above put it: Entry.
    if (!pending || pending.category === 'imported-design') return;
    setMode('template');
    setDraft(
      mergeDraft(initialDraft(), {
        category: pending.category,
        variantId: pending.id,
        lines: pending.suggestedLines.map((l) => ({ ...l })),
        zone: null,
        logoEnabled: null,
        animation: { presetId: null, outPresetId: null },
        paletteId: null,
        customPalette: null,
        fontId: null,
      }),
    );
    setStep(2);
  }, [open, pendingDesignId]);

  useEffect(() => {
    if (open || !aiResult?.generationId || acceptedAiGeneration.current === aiResult.generationId) return;
    void recordLiteOutcome({
      generationId: aiResult.generationId,
      action: 'discarded',
      discardReason: 'closed',
    }).catch(() => undefined);
  }, [open, aiResult]);

  // Escape does what the ✕ does — rewind to the front page from a working step, leave from the
  // front page itself. Two ways out of one surface that disagreed about where "out" is was the
  // fault; a reader who learns the ✕ rewinds and then loses their draft to the key beside it
  // has been told two different things by the same wizard. `leaveStepRef` keeps the handler off
  // the re-subscribe treadmill: leaveStep closes over the step, so binding it directly would
  // tear the listener down and rebuild it on every draft keystroke.
  const leaveStepRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // A confirmation over the wizard owns Escape while it is up: both listeners sit on
      // `window`, so this is how the two are separated rather than by propagation. The
      // wizard's listener was registered first (it opened first), so it runs first and stands
      // down here before the dialog's own handler closes the dialog.
      if (wizardConfirmOpen()) return;
      if (e.key === 'Escape') leaveStepRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const variant = draft.variantId ? variantById(draft.variantId) : undefined;

  // The live preview always renders the draft as real template code. Design mode's preview
  // may additionally carry the stretch-demo line (preview-only; create() builds without it),
  // and the SVG mapping step's keeps the import-time candidate markers so its checklist can
  // point at a layer in the running document. Both are scoped to the step that needs them, and
  // both modes rebuild without them at create (applyDraftProject) — Create is reachable from
  // any step, so the scoping is what the reader SEES, never what decides what ships.
  const previewTemplate = useMemo(
    () =>
      variant
        ? buildDraftTemplate(variant, draft, {
            stretchDemo: mode === 'design',
            previewMarkers: mode === 'svg' && step === 2,
          })
        : null,
    [variant, draft, mode, step],
  );
  // Can the user's own mark still be seen in the package they picked? Only asked when the draft
  // actually carries one - the check mounts a frame, and a graphic with no logo cannot fail it.
  const markWarning = useMarkLegibility(previewTemplate, Boolean(draft.logoAssetPath));
  const blankPreview = useMemo(
    () => (mode === 'blank' ? createBlankTemplate(draftResolution(draft), draft.fps) : null),
    [mode, draft],
  );

  // The Animation step's index per mode: the one-step Browse flow ends at 4, the import
  // continuation keeps the old six-step shape. Finish always follows it.
  const animStep = mode === 'import' ? 5 : mode === 'svg' ? 3 : 4;
  // AI has no configuring steps of its own — the result IS the configuration — so its
  // Finish sits right after the working step (index 2), not after an animation step it
  // never shows.
  const finishStep = mode === 'ai' || mode === 'file' ? 2 : animStep + 1;
  // On the Animation step the preview demos the full lifecycle (in → hold → out → in)
  // so the exit is actually seen — unless the user is tuning the entrance only.
  const onAnimationStep = step === animStep && mode !== 'ai' && mode !== 'video';
  const demoOut =
    onAnimationStep &&
    !!variant &&
    ['lower-third', 'info-card', 'scoreboard', 'corner-bug', 'imported-design'].includes(variant.category) &&
    draft.animation.direction !== 'in';

  // The productions the Finish step offers - read fresh each time Finish shows (another tab
  // may have made one), never while it doesn't (localStorage churn for nothing). MUST sit
  // above the closed-wizard early return: a hook after it changes the hook count between
  // open and closed renders, which React refuses mid-transition.
  const onFinish = open && step === finishStep;
  const finishProductions: Show[] = useMemo(
    () => (onFinish ? loadShows() : []),
    [onFinish],
  );
  // WHAT THE FINISH STEP HAS TO RE-READ, and why it is not a one-shot snapshot.
  //
  // The step answers one question - what does the name in the field already mean? - and both
  // halves of that answer move with NO render behind them: the library (another tab, or this
  // walk's own door press, both of which announce `spx-data-changed`) and `madeThisOpen`, a ref
  // so it survives the closed wizard's null render. Read once when the step opened, the answer
  // went stale the moment either moved, and the step then said nothing while the save wrote
  // over a record anyway - the exact case the disclosure exists for. Refreshing on the same
  // event Home refreshes on is what closes it (e2e/import-name-collision.spec.ts).
  //
  // The index is the library reduced to names, ids and fields - never the templates - so this
  // stays cheap enough to re-read on every change while the step is on screen.
  const [finishLibrary, setFinishLibrary] = useState<LibraryNameEntry[]>([]);
  /** Re-read it now: after a door press, which moves the library AND the ref together. */
  const rereadFinish = useCallback(() => setFinishLibrary(graphicNameIndex()), []);
  useEffect(() => {
    if (!onFinish) {
      setFinishLibrary([]);
      return;
    }
    rereadFinish();
    window.addEventListener('spx-data-changed', rereadFinish);
    return () => window.removeEventListener('spx-data-changed', rereadFinish);
  }, [onFinish, rereadFinish]);
  const finishMadeId = madeThisOpen.current?.graphicId ?? null;

  if (!open) return null;

  const patch = (p: DraftPatch) => setDraft((d) => mergeDraft(d, p));

  /**
   * The footer chooser's one move. A brand writes exactly four fields and None clears the same
   * four, so switching brands needs no unwinding pass: there is nothing of the previous one
   * left anywhere else on the draft to take back (wizard/draft.ts `brandLogo`).
   */
  const chooseBrand = (nextId: string | null) => {
    const next = nextId ? brandChoices.find((b) => b.id === nextId)?.brand ?? null : null;
    setBrandId(next ? nextId : null);
    patch(next ? brandPatch(next) : brandClearPatch());
  };

  /** What the chooser promises, in the words of the walk it is standing in. The brand's own
   *  notes ride along, because "how should this look" is the thing the name cannot say. */
  const brandTitle = [
    'Colours, typeface, and - where the design has a place for one - this brand\u2019s logo.',
    // IMPORTED ARTWORK KEEPS ITS OWN FILLS (docs/BRAND_PLAN.md §7). Saying so here is the whole
    // point of a per-mode tooltip: the brand reaches the :root variables and the typeface the
    // artwork's TEXT reads, and nothing recolours the drawing.
    mode === 'svg' || mode === 'design'
      ? 'Imported artwork keeps its own colours - a brand reaches its text and its style variables only.'
      : '',
    brand?.notes?.trim() ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  /**
   * The ✕. From any step past Entry it goes BACK TO THE WIZARD'S FRONT PAGE rather than out of
   * the wizard: the reader who is three steps into the wrong mode wants the other door, not the
   * app behind it, and losing the whole surface to correct one wrong turn is the fault this
   * fixes. From Entry itself there is nowhere left to rewind to, so it closes as it always did.
   *
   * The draft is DISCARDED — the mode's own choices are what the reader is leaving — except the
   * PROJECT FORMAT, which is a property of the thing being made and not of the route taken to
   * make it; re-picking 4:5 at 50 fps after every mode change would be the wizard forgetting
   * something the reader already told it. Home stays one click away on the brand lockup, which
   * is the same door on every topbar in the product.
   */
  const leaveStep = () => {
    if (step === 0) {
      closeGallery();
      return;
    }
    setDraft((d) => {
      const fresh = initialDraft();
      return {
        ...fresh,
        aspectId: d.aspectId,
        resolutionId: d.resolutionId,
        fps: d.fps,
        formatTouched: d.formatTouched,
      };
    });
    setMode('template');
    setStep(0);
    setBrowseFilters(NO_BROWSE_FILTERS);
    setAiResult(null);
    setAiThread(null);
    setStretchDemo(null);
    resetKit();
    // THE WALK THIS REWIND DISCARDS IS NOT A WALK TO COME BACK TO. Without this, a graphic
    // built after the rewind under the same default name would write OVER the record the
    // rewound walk had already made — the export door mints one and leaves the wizard open, so
    // it takes no browser navigation to reach.
    forgetWalk();
    // Back to what a fresh open sets. The chooser WRITES the brand into the draft, so leaving a
    // brand selected over a draft that was just cleared would name a look the graphic no longer
    // carries — the chooser and the preview disagreeing about the same fact.
    setBrandId(null);
  };
  // Escape's handler reads this rather than closing over `leaveStep` directly (see below).
  leaveStepRef.current = leaveStep;

  /**
   * "Leave it as it is" on the walk-back warning: put the reader back exactly where the door
   * had landed them, rather than closing the wizard onto Home — they pressed Back, were told
   * what going back would cost, and said no; the surface they were looking at is the one they
   * still want. The walk is KEPT, because a declined offer is not a discarded draft.
   */
  const leaveResume = () => {
    const back = resumeAsk?.made?.landedOn ?? null;
    setResumeAsk(null);
    if (back) useRouter.getState().replace(back);
    else closeGallery();
  };

  // Creating an SPX graphic (any path) lands in the SPX shell; creating/opening a video
  // lands in the video shell. Only the wizard flips the persisted doc-kind switch.
  const toSpxShell = () => useDocKindStore.getState().setKind('spx');

  /** Every create that ENDS IN A WORKSPACE names its route in the same tick. Without this,
   *  the `#/new` route-agreement effect reads a closed-but-still-routed wizard as a ✕ close,
   *  and a default-mode ✕ close rewinds to HOME (docs/GOALS_ARCHIVE.md "Student release" step 4) -
   *  which would swallow the surface the create just promised. */
  const landAt = (view: 'editor' | 'video') => useRouter.getState().replace({ view });

  const createVideo = (project: VideoProject) => {
    useVideoProjectStore.getState().loadProject(project);
    useDocKindStore.getState().setKind('video');
    // ACTIVATION, same as every SPX door: a visitor who made something. The video path used to
    // report nothing at all, so a whole project kind was invisible to the funnel and to the
    // admin overview - which showed as an honest-looking zero rather than as a gap.
    trackEvent('activation', 'video');
    landAt('video');
    closeGallery();
  };

  /**
   * Snapshot the walk before a door acts on it, so the reader can step back into it. Called by
   * the three APPLIERS rather than by each of FinishStep's doors, so a door added to that step
   * later inherits it.
   *
   * The KIT and Pro-PACKAGE endings reach neither applier (`openKitProduction`, `exportKit`,
   * `openAiPackage`, `exportAiPackage` save a SET, not a document), so they still leave the
   * wizard with no way back in. Deliberately out of scope here and recorded in
   * docs/backlog/back-to-the-wizard.md rather than half-wired.
   */
  const rememberWalk = () => {
    finishedWalk.current = {
      draft,
      mode,
      step,
      browseFilters,
      aiResult,
      aiThread,
      importedFile,
      contextProductionId,
      brandChoices,
      brandId,
      made: null,
    };
  };

  /** What the door actually produced, once it has. The warning names it, and a second pass
   *  down the same walk writes over it. */
  const noteMade = (name: string, production: string | null, landedOn: Route | null = null) => {
    const made: MadeGraphic = {
      name,
      graphicId: useTemplateStore.getState().saved.graphicId,
      production,
      landedOn,
    };
    if (finishedWalk.current) finishedWalk.current.made = made;
    madeThisOpen.current = made;
    // A REF the Finish step reads: nothing re-renders on its own, and the step is still on
    // screen after the export door (the production door routes away instead).
    rereadFinish();
  };

  /**
   * Save the built graphic — into the record THIS WALK already made, over the record that
   * already carries this name, or as a new one.
   *
   * A saved graphic's name is its identity. `saveGraphicAs` always mints, so without this the
   * wizard is a duplicate factory: the walk that made "Match Score" and the walk that
   * re-imports the student's second version of it left TWO records under one name, and the
   * production's pool copy — which replaces by name — quietly re-pointed its back-link at the
   * new one, detaching the graphic the cues were prepared against. Measured 2026-09-08 through
   * all four import doors (e2e/import-name-collision.spec.ts). Writing over the record keeps
   * its id, so every production pooling it keeps pointing at the same graphic.
   *
   * It is NOT a silent overwrite: the production door confirms every press, and the Finish
   * step's warning says which of the four things this one does before it happens — both read
   * `librarySaveEffect`, so the sentence and the write cannot disagree.
   *
   * A RENAME mid-walk moves the record THIS WALK MADE onto the new name. It never resolves the
   * new name against the library, because that reaches across to whatever graphic already
   * carries it and overwrites artwork this walk never opened (`librarySaveEffect` carries the
   * reasoning and the measurement). Ending the walk with the ✕ is what says "a different
   * graphic": `forgetWalk` drops the record, and the next save resolves by name again.
   */
  const saveBuiltGraphic = async (name: string): Promise<{ ok: boolean; error: string | null }> => {
    const again = madeThisOpen.current;
    const effect = librarySaveEffect(graphicNameIndex(), name, again?.graphicId ?? null);
    const over = effect.targetId;
    if (over) {
      useTemplateStore.getState().setSaved({ graphicId: over, dirty: true, status: 'idle' });
      const result = await saveCurrentGraphic({ name });
      if (result === 'saved') return { ok: true, error: null };
      // 'needs-name' means the record went between the check above and the write (deleted on
      // another device or tab). Minting is then the right answer, not an error - the work is
      // what matters, and there is no longer anything to write over.
      if (result === 'needs-name') return saveGraphicAs(name, { kind: 'standalone' });
      return {
        ok: false,
        error:
          effect.kind === 'over'
            ? `The graphic could not be saved over the “${name}” already in your library.`
            : `“${name}” could not be saved to your library.`,
      };
    }
    return saveGraphicAs(name, { kind: 'standalone' });
  };

  // Apply a freshly GENERATED template as a new project. Its HTML is tidied through Prettier
  // first (HTML only - the CSS keeps its hand-aligned property comments and the JS animation
  // region stays strict-JSON; see formatTemplate's defaults / docs/FORMATTING.md), so every
  // project starts from one consistent, formatted baseline. Formatting once at birth also keeps
  // later canvas/timeline edits to tight, minimal diffs - the editor's change-highlight stays
  // accurate. Imported templates are NOT routed here: they stay byte-faithful to the user's file.
  const applyGenerated = async (template: SpxTemplate, skipNavigation?: boolean, keepGalleryOpen?: boolean) => {
    const formatted = await formatTemplate(template); // HTML-only by default
    if (!skipNavigation) landAt('editor'); // the seam every editor-ending create flows through
    applyTemplate(formatted, { resetSampleData: true, keepGalleryOpen });
    setActiveTab('html');
    toSpxShell();
  };

  const createBlank = () => {
    void applyGenerated(createBlankTemplate(draftResolution(draft), draft.fps));
  };

  /* ── THE KIT WALK ────────────────────────────────────────────────────────────────────────
     A kit is not a different flow; it is the SAME flow run over a set. Browse's mode switch
     starts it, the ordinary Fields/Style/Animation steps configure whichever graphic is
     current, and only two moments are the kit's own: the LOOK QUESTION after the first graphic
     (wizard/steps/KitLookStep.tsx) and the Finish that names a production instead of a
     graphic. `kit.built` is the record of what has actually been made — the tray reads it, the
     Finish grid renders it, and the save writes exactly it. */

  /** Move the walk onto kit graphic `index`, loading its draft: the shared project format, the
   *  design's own suggested lines, and the pack's curated palette. A graphic reached HERE is
   *  always one the user is about to configure by hand, so it never carries a propagated look -
   *  that is what "take me through each one" means, and the yes path builds without stopping. */
  const openKitGraphic = (plan: KitPlan, index: number) => {
    const item = plan.items[index];
    setKit({ ...plan, current: index });
    setDraft((d) =>
      kitItemDraft(d, item.variant, {
        packPaletteId: plan.pack.paletteId,
        // The footer's chosen BRAND applies to EVERY graphic of the set, not just whichever
        // one was on screen when it was picked. It is also what the production-context open
        // selects by itself, so a kit started from a production's "+ New graphic" arrives in
        // that production's brand.
        brand: brand ? brandPatch(brand) : null,
      }),
    );
    setStep(2);
  };

  /** Browse → the first graphic of the set. The pack's own palette leads (docs/GOALS_ARCHIVE.md
   *  "Student release" step 7: a curated kit names one palette and every graphic is created
   *  with it), and whatever the user does to it from here is what the look question offers to
   *  carry. */
  const startKit = (pack: TemplatePack, family: StyleTag, keys: string[]) => {
    const items = kitSelection(pack, family, keys);
    if (items.length === 0) return;
    const plan: KitPlan = {
      pack,
      family,
      items,
      keys: [...keys],
      current: 0,
      built: items.map(() => null),
      propagate: null,
    };
    setKitProductionName('');
    setKitError(null);
    openKitGraphic(plan, 0);
  };

  /**
   * Leaving the current graphic's last step: build it, record it, and go wherever the plan
   * says next. The build is the ordinary `buildDraftTemplate` every other door calls, so a kit
   * graphic and a hand-made one are the same code by construction.
   */
  const advanceKit = () => {
    if (!kit || !variant || !previewTemplate) return;
    const built = kit.built.map((t, i) => (i === kit.current ? previewTemplate : t));
    const plan = { ...kit, built };
    const last = kit.current === kit.items.length - 1;
    // THE LOOK ALREADY CARRIED, so a return trip to this graphic must carry it again: the
    // whole set is rebuilt from the draft as it now stands (this graphic keeps the fields it
    // was actually given; every other one re-derives). Without this, editing the tone-setting
    // graphic after saying yes would leave the rest wearing the look it used to have.
    if (plan.propagate === true) {
      setKit({ ...plan, built: buildRemaining({ ...plan, built: built.map((t, i) => (i === kit.current ? t : null)) }, draft) });
      setStep(finishStep);
      return;
    }
    // The first graphic always reaches the look question — it is the one that sets the tone,
    // and asking it any later would mean asking about a look two graphics already ignored.
    if (plan.propagate === null || last) {
      setKit(plan);
      setStep(finishStep);
      return;
    }
    openKitGraphic(plan, kit.current + 1);
  };

  /** "Yes, build them now": every remaining graphic, in the first one's look, deterministically
   *  (wizard/kitPlan.ts — the transform is the :root style contract and nothing else). */
  const useKitLookForAll = () => {
    if (!kit) return;
    setKit({ ...kit, propagate: true, built: buildRemaining(kit, draft) });
  };

  /** "No, take me through each one": graphic 2 starts its own Fields step. */
  const walkKitEachOne = () => {
    if (!kit) return;
    openKitGraphic({ ...kit, propagate: false }, kit.current + 1);
  };

  /**
   * The way out of that walk, offered from the tray for as long as unbuilt graphics remain:
   * take the graphic in hand as the tone-setter after all. Everything already configured by
   * hand is KEPT (`buildRemaining` never rebuilds a graphic that has one) - the point is to
   * stop walking, not to discard the walking already done.
   *
   * Answering "no" used to be permanent, because the look question renders only while
   * `propagate` is null. On the 36-graphic Esports kit that made one click cost a hundred-odd
   * steps with no way back.
   */
  const adoptKitLookForRest = () => {
    if (!kit || !variant || !previewTemplate) return;
    const built = kit.built.map((t, i) => (i === kit.current ? previewTemplate : t));
    const plan: KitPlan = { ...kit, built, propagate: true };
    setKit({ ...plan, built: buildRemaining(plan, draft) });
    setStep(finishStep);
  };

  /**
   * SAVE THE WHOLE SET: every graphic to the library, pooled into one new PRODUCTION - the
   * unit that airs (docs/GOALS_ARCHIVE.md "Student release" step 3). The write path and its
   * durable-write claims live in model/templateSet.ts.
   */
  const saveKit = async (dest: ProductionDest): Promise<Show | null> => {
    if (!kit) return null;
    const templates = kit.built.filter((t): t is SpxTemplate => t !== null);
    if (templates.length !== kit.items.length) {
      setKitError('Some graphics in this kit have not been built yet.');
      return null;
    }
    return saveTemplateSet(templates, kit.pack.name, dest, 'kit');
  };

  /**
   * The SET-shaped ending, shared by the catalog kit and a NoaCG Pro package (§15.9).
   *
   * The actual save lives in model/templateSet.ts (`saveTemplateSetToProduction`), shared with
   * the pack importer - two copies would be two chances for one of them to forget the
   * durable-write claim. This wrapper owns only the wizard's busy/error state and the
   * activation event.
   */
  const saveTemplateSet = async (
    templates: SpxTemplate[],
    fallbackName: string,
    dest: ProductionDest,
    activation: 'kit' | 'pro',
  ): Promise<Show | null> => {
    if (!templates.length) return null;
    setKitBusy(true);
    setKitError(null);
    try {
      const target = await saveTemplateSetToProduction(templates, fallbackName, dest);
      trackEvent('activation', activation);
      return target;
    } catch (error) {
      setKitError(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setKitBusy(false);
    }
  };

  /** What the look question is actually offering to carry, in the user's own words — the same
   *  read-back the single-graphic Finish gives, so the offer is not taken blind. */
  const lookSummary = (): string => {
    if (!variant) return 'this look';
    const palette =
      draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : variant.defaultPalette);
    const fontId = draft.fontId ?? variant.defaultFontId;
    const font =
      fontId === 'custom'
        ? draft.customFont?.family ?? 'your imported typeface'
        : FONTS.find((f) => f.id === fontId)?.family ?? 'the design’s typeface';
    return `${palette.name} · ${font}`;
  };

  /** Door 1: save the set, land on the production page. */
  const openKitProduction = (dest: ProductionDest) => {
    void saveKit(dest).then((show) => {
      if (!show) return;
      closeGallery();
      useRouter.getState().navigate({ view: 'production', id: show.id });
    });
  };

  /**
   * Door 2: save the set, then export it as ONE package - without the editor ever opening
   * (src/components/AGENTS.md: export is not a reward for opening the editor). The target
   * picker and the validation gate live on ProductionExportDialog, so the wizard asks for that
   * surface through the store's one-shot `pendingProductionExport` (the `pendingProductionId`
   * idiom) rather than growing a second whole-show export screen that could disagree with it.
   */
  const exportKit = (dest: ProductionDest) => {
    void saveKit(dest).then((show) => {
      if (!show) return;
      useTemplateStore.setState({ pendingProductionExport: show.id });
      closeGallery();
      useRouter.getState().navigate({ view: 'production', id: show.id });
    });
  };

  // The AI graphic's name: the Finish field, else the generated design's own name — the same
  // rule catalog modes apply through draftName, just off the result instead of a variant.
  const aiName = (): string => draft.name.trim() || (aiResult?.template.name ?? '');

  /**
   * THE PRO PACKAGE, when there is one (docs/NOACG_PRO_PLAN.md §15.9).
   *
   * A set of ONE is not a package: a Pro user who unticked everything but the lower third gets
   * exactly the single-graphic ending they have always had, with no production picker and no
   * second door. So the branch is on the SIZE of the set, never on the tier.
   */
  const aiPack = (): SpxTemplate[] | null =>
    aiResult?.pack && aiResult.pack.length > 1 ? aiResult.pack : null;

  /** Door 1: save the whole package, land on the production page. */
  const openAiPackage = (dest: ProductionDest) => {
    const pack = aiPack();
    if (!pack) return;
    // The name the user typed on Finish names the PRODUCTION here rather than one graphic -
    // there is no single graphic for it to name - and each member keeps the name its own
    // composer gave it, which is the design language's name plus what the graphic is.
    void saveTemplateSet(pack, aiName() || pack[0].name, dest, 'pro').then((show) => {
      if (!show) return;
      closeGallery();
      useRouter.getState().navigate({ view: 'production', id: show.id });
    });
  };

  /** Door 2: save the package, then export that production as ONE zip - the kit's own door,
   *  reached the same way (the wizard never grows a second whole-show export screen). */
  const exportAiPackage = (dest: ProductionDest) => {
    const pack = aiPack();
    if (!pack) return;
    void saveTemplateSet(pack, aiName() || pack[0].name, dest, 'pro').then((show) => {
      if (!show) return;
      useTemplateStore.setState({ pendingProductionExport: show.id });
      closeGallery();
      useRouter.getState().navigate({ view: 'production', id: show.id });
    });
  };

  /**
   * Build the AI result as the working project. The AI create path DIFFERS from the catalog
   * one and must keep its steps: commit the staged preference pick (aggregated, subtle; see
   * src/ai/preferences.ts — a no-alternatives run staged nothing), and, AFTER the whole-project
   * swap clears the store's spec, adopt the result's own spec so it rides the autosave slot and
   * the next Save. Returns the applied template (read back post-format) or null. Both Finish
   * doors go through here, so the editor and export endings stay byte-identical.
   */
  const applyAiProject = async (skipNavigation?: boolean, keepGalleryOpen?: boolean): Promise<SpxTemplate | null> => {
    if (!aiResult?.valid) return null;
    rememberWalk();
    if (aiResult.generationId) acceptedAiGeneration.current = aiResult.generationId;
    commitStagedSelection();
    const name = aiName();
    // The Finish name rides the built template, exactly as the catalog path's draftName does,
    // so it reaches the topbar, the Save prefill, and the export slug through one path.
    const template = aiResult.template.name === name ? aiResult.template : { ...aiResult.template, name };
    await applyGenerated(template, skipNavigation, keepGalleryOpen);
    // AFTER the whole-project swap (which clears the store's spec AND conversation), adopt this
    // result's own so both ride the autosave slot + the next Save. Both Finish doors reach here.
    useTemplateStore.getState().setAiSpec(aiResult.spec ?? null);
    useTemplateStore.getState().setAiThread(aiThread);
    useTemplateStore.getState().setLegibility(draft.legibility);
    clearSpecDraft();
    if (aiResult.generationId) {
      void recordLiteOutcome({
        generationId: aiResult.generationId,
        action: 'accepted',
      }).catch(() => undefined);
    }
    // A Pro-tier create keeps its own activation mode - the funnel would otherwise lose
    // the tier the moment the separate Pro card disappeared.
    trackEvent('activation', aiResult.path === 'pro' ? 'pro' : 'ai');
    return useTemplateStore.getState().template;
  };

  /** The AI editor door: create and hand over. Saving stays the user's move. */
  const createFromAi = () => {
    void applyAiProject().then((template) => {
      // Nothing was SAVED here (this door leaves that to the user), so the walk-back warning
      // has only a name to state - which is the honest thing to say about it.
      if (template) noteMade(aiName(), null, { view: 'editor' });
    });
  };

  /** The AI export door: create, SAVE, and go straight to the export window (mirrors
   *  createAndExport, including keeping the wizard open UNDER the window so closing it
   *  returns to the last creation step). The save is not optional — an export-only creation
   *  that vanished would cost the whole AI generation to reproduce. A failed save
   *  deliberately stays in the editor. */
  const createFromAiAndExport = () => {
    void applyAiProject(true, true).then(async (template) => {
      if (!template) return;
      const saved = await saveBuiltGraphic(aiName());
      const s = useTemplateStore.getState();
      if (!saved.ok) reportFailedCreateSave(aiName(), saved.error);
      else noteMade(aiName(), null);
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
    });
  };

  /** The AI production door - the same primary ending as the catalog one (byte-identical
   *  doors doctrine: both route through applyAiProject). */
  const createFromAiAndAddToProduction = (dest: ProductionDest) => {
    void applyAiProject(true, true).then((template) => {
      if (!template) return;
      void addToProduction(dest, aiName());
    });
  };

  /**
   * Build the drafted graphic and make it the working project. BOTH Finish doors go through
   * here — including the export one, which is what keeps the two endings byte-identical: the
   * editor path formats through Prettier (applyGenerated), so an export path that skipped it
   * would ship different HTML for the same choices.
   *
   * Returns the applied template (read back from the store, post-format) or null.
   */
  const applyDraftProject = async (skipNavigation?: boolean, keepGalleryOpen?: boolean): Promise<SpxTemplate | null> => {
    if (!previewTemplate || !variant) return null;
    rememberWalk();
    // The two modes whose preview carries preview-only extras rebuild without them — design's
    // stretch-demo line, and the SVG mapping step's candidate markers. Create is reachable from
    // any step (Skip to finish), so this cannot be left to the step the reader happens to be on.
    // Every other mode's preview is exactly the created code already.
    const previewOnly = mode === 'design' || mode === 'svg';
    await applyGenerated(previewOnly ? buildDraftTemplate(variant, draft) : previewTemplate, skipNavigation, keepGalleryOpen);
    // An imported design creates BARE and hands off to the editor's Data tab — that is
    // where its fields are added, as real placed layers (docs/IMPORT_MVP.md). DEFERRED a
    // tick: in the default studio no editor renders under the wizard, so AppShell mounts on
    // the route change this create just made — and the dock reveal is keyed on
    // panelRevealNonce CHANGING after mount (mount itself never reveals). A same-tick bump
    // lands before the mount and is silently missed.
    if (variant.category === 'imported-design') {
      setTimeout(() => useTemplateStore.getState().setActivePanel('data'), 0);
    }
    // AFTER the whole-project swap (which clears it): the project's legibility settings ride
    // the store exactly like the AI path's aiSpec, so the autosave slot and every Save carry
    // them (an untouched draft normalizes to nothing).
    useTemplateStore.getState().setLegibility(draft.legibility);
    // CREATE WRITES NO BRAND (docs/BRAND_PLAN.md decision 6). It used to overwrite one anonymous
    // record with whatever had just been made, and that is exactly why the footer's old offer
    // read as inert: it proposed a look nobody had chosen, named or seen. A brand is now a thing
    // a person makes on purpose, on Home, and picks from the chooser below.
    // ACTIVATION: the funnel's one quality signal - a visitor who made something. Recorded
    // per create rather than once per visitor, so the analysis can ask both "did they ever"
    // and "how often"; the mode says which door produced it.
    trackEvent('activation', mode);
    return useTemplateStore.getState().template;
  };

  /** The editor door (and the quiet from-any-step shortcut): create and hand over. Saving
   *  stays the user's move, exactly as it always has been. */
  const create = () => {
    void applyDraftProject().then((template) => {
      if (template && variant) noteMade(draftName(variant, draft), null, { view: 'editor' });
    });
  };

  /**
   * The export door: create it, SAVE it, and go straight to the export window — the editor is
   * never revealed. The save is not optional here. This branch exists for someone who is done,
   * and a graphic that was configured, exported and then dropped would be unrecoverable: every
   * wizard choice would have to be made again to get the same package back.
   *
   * On success the wizard closes onto HOME rather than the editor, so shutting the export
   * window leaves the user in the library holding the thing they just made. If the save fails
   * (a full quota is the realistic cause) we deliberately stay in the editor instead: the
   * topbar's failed-save status is visible there and Save can be retried, where Home would
   * just be a library missing the graphic with nothing saying why.
   */
  const createAndExport = () => {
    void applyDraftProject(true, true).then(async (template) => {
      if (!template || !variant) return;
      const saved = await saveBuiltGraphic(draftName(variant, draft));
      // Read AFTER the save: it renames the working template to the record's name, which is
      // what the export slugs the zip and the SPX/CasparCG template folder from.
      const s = useTemplateStore.getState();
      if (!saved.ok) reportFailedCreateSave(draftName(variant, draft), saved.error);
      else noteMade(draftName(variant, draft), null);
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
    });
  };

  /**
   * THE PRIMARY DOOR (docs/GOALS_ARCHIVE.md "Student release" step 6): create it, SAVE it (library
   * record first - never lose the work), pool a copy into the chosen production with its
   * auto-seeded first cue, capture the look onto a production that has none yet, and land on
   * the production page - the road to air.
   *
   * THE EDITOR IS NEVER REVEALED ON THE WAY (owner walk, 2026-09-01: adding an imported graphic
   * to a production flashed the canvas before the rundown appeared). Every caller applies with
   * `skipNavigation` + `keepGalleryOpen`, exactly as the export door does, so the wizard stays
   * over the shell until this routes to the production. That also makes a FAILED save land
   * somewhere better than it used to: the wizard is still open on Finish, with the graphic built,
   * so the door can simply be pressed again.
   */
  const addToProduction = async (dest: ProductionDest, name: string) => {
    const saved = await saveBuiltGraphic(name);
    if (!saved.ok) {
      // NEVER a silent return - swallowing this left the user with no production, no saved
      // graphic and nothing said (the acceptance-pass blocker of 2026-08-06).
      raiseStorageAlert({
        action: `Adding “${name}” to a production`,
        error: saved.error ?? 'The graphic could not be saved.',
        outcome:
          'Your graphic is still open in the wizard, unsaved — free some room, then press “Add to the production” again.',
      });
      return;
    }
    const s = useTemplateStore.getState();
    let created: string | null = null;
    let show: Show | undefined;
    if (dest.kind === 'existing') {
      show = loadShows().find((x) => x.id === dest.id);
    } else {
      const made = createShowNamedChecked(dest.name);
      show = made.show;
      // The durable store confirms a write after the call returns, so every "did that land?"
      // question here is one await (model/durableStore.ts's claim protocol) - claiming the
      // failure is also what keeps THIS message, which names the production, rather than the
      // generic announcement the app makes for an unclaimed one.
      created = made.error ?? (await commitDurableWrites());
    }
    // A picked production deleted mid-wizard (another tab/device): fall back to a NEW one
    // rather than dropping the work on the floor. Unnamed, so `createShowNamedChecked`'s own
    // floor answers - this door used to name it after the GRAPHIC, which is the same defect
    // the empty production box carried (e2e/import-svg.spec.ts, "an unnamed production is not
    // named after the graphic") on a rarer
    // path, and one door must not answer one question two ways.
    if (!show) {
      const made = createShowNamedChecked('');
      show = made.show;
      created = made.error ?? (await commitDurableWrites());
    }
    const target = show;
    if (created) {
      raiseStorageAlert({
        action: `Creating the production “${target.name}”`,
        error: created,
        // Where the reader actually IS: the wizard, still on Finish (the door no longer routes
        // through the editor), so the retry is the door they just pressed - not a trip to Home.
        outcome: `“${name}” is saved in your library. Free some room, then press “Add to the production” again.`,
      });
      return;
    }
    const pooled = addGraphicToShow(target.id, s.template, { graphicId: s.saved.graphicId ?? undefined });
    const pooledError = pooled.error ?? (await commitDurableWrites());
    if (pooledError) {
      raiseStorageAlert({
        action: `Adding “${name}” to “${target.name}”`,
        error: pooledError,
        outcome: `“${name}” is saved in your library. Free some room, then press “Add to the production” again.`,
      });
      return;
    }
    if (!target.look) setShowLook(target.id, captureLookFromTemplate(s.template));
    // The rundown this graphic went into, by name — what the walk-back warning states, and
    // what makes a second pass down the walk replace that copy instead of adding another.
    noteMade(name, target.name, { view: 'production', id: target.id });
    closeGallery();
    useRouter.getState().replace({ view: 'production', id: target.id });
  };

  /* ── A finished template file: the three doors, over the file exactly as written ────────
     BYTE-FAITHFUL, deliberately: `applyTemplate` rather than `applyGenerated`, so nothing
     Prettier-formats somebody else's HTML on the way in. The name is the only edit — it slugs
     the zip and, on the SPX and CasparCG packages, the template FOLDER an operator reads. */
  const importedName = () => draft.name.trim() || importedFile?.template.name || 'Imported graphic';

  const applyImportedFile = (skipNavigation?: boolean, keepGalleryOpen?: boolean): SpxTemplate | null => {
    if (!importedFile) return null;
    rememberWalk();
    const template = { ...importedFile.template, name: importedName() };
    if (!skipNavigation) landAt('editor');
    applyTemplate(template, { resetSampleData: true, keepGalleryOpen });
    setActiveTab('html');
    trackEvent('activation', 'file');
    return useTemplateStore.getState().template;
  };

  const createFromFile = () => {
    if (!applyImportedFile()) return;
    noteMade(importedName(), null, { view: 'editor' });
    // The Export panel carries the validation verdict, which is the one thing an imported
    // file's owner needs to see: what (if anything) stops it being SPX/CasparCG-ready.
    setTimeout(() => useTemplateStore.getState().setActivePanel('export'), 0);
  };

  const createFromFileAndExport = () => {
    if (!applyImportedFile(true, true)) return;
    void (async () => {
      const saved = await saveBuiltGraphic(importedName());
      const s = useTemplateStore.getState();
      if (!saved.ok) reportFailedCreateSave(importedName(), saved.error);
      else noteMade(importedName(), null);
      useExportUi.getState().openExport({
        template: s.template,
        sampleData: s.sampleData,
        graphicId: s.saved.graphicId,
      });
    })();
  };

  const createFromFileAndAddToProduction = (dest: ProductionDest) => {
    if (!applyImportedFile(true, true)) return;
    void addToProduction(dest, importedName());
  };

  const createAndAddToProduction = (dest: ProductionDest) => {
    void applyDraftProject(true, true).then((template) => {
      if (!template || !variant) return;
      void addToProduction(dest, draftName(variant, draft));
    });
  };

  /** Kit mode's Browse step is satisfied by a picked SHOW with at least one graphic ticked,
   *  never by a `draft.variantId` — no single design has been chosen at that point. */
  const kitBrowseReady = !!kitPack && !!kitFamily && kitSelected.length > 0;
  const nextDisabled =
    mode === 'template'
      ? step === 1 && (buildMode === 'kit' ? !kitBrowseReady : !draft.variantId)
      : mode === 'file'
      ? step === 1 && !importedFile
      : (step === 1 &&
          (mode === 'import'
            ? draft.importedImages.length === 0 || !draft.category
            : !draft.category)) ||
        (step === 2 && !draft.variantId);

  // Design mode previews from the moment the artwork lands, through the Prepare step —
  // the user sees the real graphic (and its default entrance) before creating.
  //
  // FINISH ON A PHONE IS THE ONE EXCEPTION. Stacked, the preview claims a fixed 38vh and the
  // step scrolls in what is left — which put BOTH doors below the fold on arrival, on the one
  // step that exists to offer a choice. Every earlier step had already shown the graphic, and
  // the step's own read-back says what was built, so the actions win the room here.
  // The kit's Browse step is a picker over whole SHOWS, not a design grid, so there is no one
  // graphic to preview yet; from Fields on, the preview shows the graphic being configured.
  const showPreview =
    (mode === 'ai' ? (step === 1 || step === finishStep) && !!aiResult
    : mode === 'video' ? false
    : mode === 'blank' ? step === 1
    : mode === 'design' || mode === 'svg' ? step >= 1 && !!previewTemplate
    // A dropped template is previewed as itself: it is the graphic, already finished.
    : mode === 'file' ? step >= 1 && !!importedFile
    : mode === 'template' ? (kit ? step >= 2 && step < finishStep : step >= 1) && !!previewTemplate
    : step >= 2 && !!previewTemplate) && !(isMobile && step === finishStep);
  const stepSubs = mode === 'template' && (kit || buildMode === 'kit') ? STEP_SUBS_KIT : STEP_SUBS[mode];
  // Rail position → step index (1:1 in every mode).
  const stepIndexes = stepTitles.map((_, i) => i);
  const railPos = stepIndexes.indexOf(step);
  /** Is the plan in flight still the one the picker currently describes? Going Back to Browse
   *  and returning UNCHANGED must not throw away graphics that are already built; changing the
   *  show, the look or the contents genuinely is a different kit, and restarts. */
  const kitPlanMatches = (plan: KitPlan): boolean =>
    plan.pack.id === kitPack?.id &&
    plan.family === kitFamily &&
    plan.keys.length === kitSelected.length &&
    plan.keys.every((key) => kitSelected.includes(key));

  /** Forward means something different for a kit at two points: leaving Browse STARTS the set,
   *  and leaving the last configuring step BUILDS the current graphic and lets the plan decide
   *  where the walk goes — the look question, the next graphic, or the production. Everything
   *  in between is an ordinary step. */
  const goToStep = (delta: number) => {
    if (delta > 0 && mode === 'template' && buildMode === 'kit' && step === 1) {
      if (kit && kitPlanMatches(kit)) setStep(2);
      else if (kitPack && kitFamily) startKit(kitPack, kitFamily, kitSelected);
      return;
    }
    if (delta > 0 && kit && step === animStep) {
      advanceKit();
      return;
    }
    setStep(stepIndexes[railPos + delta] ?? step);
  };

  /* Finish's read-back rows are clickable: each goes back to the step it was decided on.
     The row names its decision, not a step NUMBER, because import mode carries an extra
     Images step and every later index shifts by one (animStep above says the same thing). */
  const editSummaryStep = (key: SummaryStepKey) => {
    // SVG mode: the artwork and its format live on step 1, the field mapping on step 2;
    // there is no Look step (the SVG carries its own look).
    if (mode === 'svg') {
      setStep({ design: 1, format: 1, fields: 2, look: 2, motion: animStep }[key]);
      return;
    }
    const browse = mode === 'import' ? 2 : 1;
    setStep({ design: browse, format: browse, fields: browse + 1, look: browse + 2, motion: animStep }[key]);
  };

  // The rail's format read-back. The real CONTROL stays in the step that owns it, so this is
  // a reminder plus the way back: reveal the picker where it already lives, or go to the step
  // that carries it. Duplicating the control would give the same decision two homes — the
  // mistake the AI step's second reference uploader made (src/components/AGENTS.md).
  const formatSummary = formatProjectSummary(draftResolution(draft), draft.fps);
  const revealFormatPicker = () => {
    const picker = document.querySelector<HTMLElement>('.wz-step [data-testid$="-format-aspect"]');
    if (picker) {
      picker.scrollIntoView({ block: 'center', behavior: 'smooth' });
      picker.focus();
      return;
    }
    setStep(stepIndexes[1] ?? step);
  };

  /* The step footer. It belongs to the CENTRE COLUMN, not to the whole sheet: the preview
     beside it carries its own transport, and a footer spanning both put Next under the
     graphic rather than under the form it advances (re-design/handoff.md §2). */
  const wizardFooter = (
    <div className="wz-footer">
      {step > 0 && <button className="wz-back" onClick={() => goToStep(-1)}>← Back</button>}
      {/* OFFERED ONLY WHERE THE BRAND CAN REACH THE GRAPHIC (owner, 2026-09-03: do not offer
          things that do nothing). Three modes have nowhere to put a palette or a typeface, and
          each says so in its own factory: a VIDEO project's fields are prompt, engine, size and
          assets (`createDefaultVideoProject`, model/videoTypes.ts) — no colours, no faces; a
          dropped template FILE is applied byte-faithfully with the name as the only edit; and
          `createBlankTemplate(resolution, fps)` takes no draft at all. Ticking the box in those
          three wrote a palette into the draft that nothing downstream ever read. */}
      {/* WITH NO BRANDS THERE IS NO CONTROL, not a disabled one (docs/BRAND_PLAN.md decision 1):
          an empty chooser is a promise the install cannot keep, and the door to making one is
          Home, not here. */}
      {brandChoices.length > 0 && BRAND_MODES.includes(mode) && (mode === 'import' ? step >= 2 : mode === 'ai' ? step === 1 : step >= 1) && (
        <label className="wz-match" title={brandTitle}>
          Brand
          <select
            className="wz-brand-select"
            data-testid="wz-brand"
            value={brandId ?? ''}
            onChange={(e) => chooseBrand(e.target.value || null)}
          >
            <option value="">None</option>
            {brandChoices.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </label>
      )}
      <div className="spacer" />
      {/* TEMPLATE MODE's quiet shortcut is "Skip to finish" (docs/GOALS_ARCHIVE.md "Student
          release" step 6): remaining steps keep their defaults and the Finish step's
          doors decide where the graphic goes - it no longer creates straight into the
          editor, which default mode does not even surface. It stands down ON Finish,
          whose door cards ARE the actions.
          DESIGN/IMPORT keep the classic "Create project" (create from any step - a
          design needing no erase, fields, or animation choice creates immediately);
          KIT stands down for the same reason as Finish: its own Create IS the action. */}
      {mode === 'template' && step >= 1 && step < finishStep && !kit && buildMode === 'one' && (
        <button
          className="wz-skip"
          disabled={!draft.variantId}
          onClick={() => setStep(finishStep)}
          title="Happy with the defaults? Jump straight to naming it and choosing where it goes"
          data-testid="wz-skip-to-finish"
        >
          Skip to finish
        </button>
      )}
      {/* A KIT's shortcut cannot be "skip to finish": the walk's remaining steps belong to the
          graphic in hand, and past it there may be N more graphics or the look question. So it
          takes the same door Next takes from Animation - accept this graphic as it stands and
          let the plan decide - and says exactly that. */}
      {kit && step >= 2 && step < animStep && (
        <button
          className="wz-skip"
          disabled={!previewTemplate}
          onClick={advanceKit}
          title="Happy with this graphic's defaults? Accept it and move on"
          data-testid="wz-kit-skip"
        >
          Skip ahead
        </button>
      )}
      {(mode === 'design' || mode === 'svg' || mode === 'import') && step < finishStep && (mode === 'import' ? step >= 2 : step >= 1) && (
        <button
          disabled={!previewTemplate}
          onClick={create}
          title={
            mode === 'design' || mode === 'svg'
              ? 'Create the project with everything chosen so far — refine anything later in the editor'
              : 'Create the project now — remaining steps keep their defaults'
          }
        >
          Create project
        </button>
      )}
      {/* AI's Create step advances to Finish once a valid result stands — the two doors
          (open in the editor / export) live there, same as every catalog mode. */}
      {mode === 'ai' && step === 1 && (
        <button
          className="primary wz-next"
          disabled={!aiResult?.valid}
          onClick={() => goToStep(1)}
          title={aiResult && !aiResult.valid ? 'The result has validation errors — refine or regenerate first' : undefined}
        >
          Next →
        </button>
      )}
      {mode !== 'ai' && mode !== 'video' && mode !== 'blank' && step > 0 && step < finishStep && (
        <button className="primary wz-next" disabled={nextDisabled} onClick={() => goToStep(1)}>
          {/* On a kit's last configuring step the button is not moving to another step of this
              graphic - it is finishing this one - so it says which. */}
          {kit && step === animStep
            ? kit.current === kit.items.length - 1 || kit.propagate === null
              ? 'Finish this graphic →'
              : 'Next graphic →'
            : 'Next →'}
        </button>
      )}
    </div>
  );

  // Ordering: imported images put logo-slot designs first; a matched brand puts its
  // style family first (so the package's siblings lead).
  const orderedVariants = [...variantsFor(draft.category)].sort((a, b) => {
    if (draft.importedImages.length > 0) {
      const logo = Number(b.logo !== 'none') - Number(a.logo !== 'none');
      if (logo !== 0) return logo;
    }
    if (brand) {
      return Number(b.styleTag === brand.styleTag) - Number(a.styleTag === brand.styleTag);
    }
    return 0;
  });

  return (
    // No backdrop-click close: the wizard is FULL-SCREEN (docs/GOALS_ARCHIVE.md "Student release"
    // step 4 - `.wz-wizard`), so there is no visible backdrop to click; ✕ and Escape close.
    // `.wz-full` drops the backdrop blur: it composited every frame under a 100% opaque
    // full-screen surface — pure paint cost, and part of the open-transition jank.
    <div className="gallery-backdrop wz-full">
      {/* `.wz-modal` is shared styling — the save dialogs wear it too — so the wizard carries
          `.wz-wizard` (the full-screen override) + its own test id for anything that must
          name THIS dialog and not one of those. */}
      <div className="wz-modal wz-wizard" data-testid="creation-wizard">
        {/* Header: what is being made, how far along, and the way out. The step LIST moved to
            the left rail (re-design/handoff.md §2) — six labelled pills across the top could
            never say what a step was FOR, and they wrapped to four rows on a phone. */}
        <div className="wz-header">
          <div className="wz-title">
            {/* The logo is the SITE ROOT here exactly as it is on the editor's topbar; the
                Home door is the button beside it. Home has to stay one press away from every
                step (✕ only rewinds to the front page), which is why the pair travels
                together rather than the lockup doing both jobs. */}
            <a className="brand brand-home" href="/" title="NoaCG Studio — the front page">
              <BrandLogo size={24} />
            </a>
            <span className="wz-title-sep">·</span>
            <span className="wz-title-step">
              {mode === 'ai' ? 'Create with AI'
                : mode === 'video' ? 'Video with AI'
                : mode === 'design' || mode === 'svg' || mode === 'file' ? 'Import graphic'
                : kit ? `${kit.pack.name} kit`
                : 'New graphic'}
            </span>
            {/* Once a design is chosen it names the thing being built, so the header answers
                "what am I working on" without the reader looking at the preview. */}
            {variant && step < finishStep && <span className="wz-title-doc">· {variant.name}</span>}
          </div>
          {/* THE HOME DOOR, its own control beside the title rather than a job the logo does.
              It sits OUTSIDE `.wz-title` so the brand keeps its "lockup · what you are making"
              reading — inside, its separator ended up between Home and the step name and named
              neither. Home has to stay one press from every step: ✕ only rewinds to the front
              page, so without it a reader three steps in had no way back to their work. */}
          <button
            className="home-btn wz-home"
            data-testid="wz-home"
            title="Home — your graphics, productions, control panels, and videos"
            onClick={() => {
              closeGallery();
              useRouter.getState().navigate({ view: 'home', section: null });
            }}
          >
            Home
          </button>
          {/* The same door every shell mounts, in the shared order (logo -> Home -> + New
              graphic; owner, 2026-08-28: "there's not the new graphic button, which is the
              one we are used to using"). Mid-walk it is a guarded START-OVER - `#/new` through
              requestSwitch rewinds to the front page with the draft kept, so Back returns to
              the step - and on the front page itself it is a no-op (the check lives in the
              component). ✕ stays the door that discards. */}
          <NewGraphicButton
            className="wz-new"
            testid="wz-new-graphic"
            title="Start a new graphic - back to the wizard's front page"
          />
          {/* HOW FAR ALONG — from the SECOND step onward. On Entry there is no answer to give:
              no mode is chosen yet, so the denominator is not even the same number for every
              door (Create with AI is 3 steps, a kit is 2), and "Step 1 / 6" on a screen whose
              whole question is "which of these four" states a walk the reader has not picked.
              The count comes from the ACTIVE MODE's own step list, which is what makes it
              true once it does appear. */}
          {step > 0 && (
            <span className="wz-stepcount" data-testid="wz-stepcount">
              Step <b>{railPos + 1}</b> / {stepTitles.length}
            </span>
          )}

          {/* The feedback door belongs to the HEADER, so it is reachable from the first step
              rather than only from the one at the end - the wizard is the student release's
              own surface, and somebody who gets lost on Browse never reaches Finish to say so.
              Its push is the chain in styles.css (.wz-stepcount ~ .fb-open ~ .gallery-close),
              since the step counter is absent on Entry and this button is absent offline. */}
          <BetaFeedbackButton area="wizard" />

          <button
            className="gallery-close"
            onClick={leaveStep}
            title={step > 0 ? 'Back to the start (discards this draft)' : 'Cancel (keep current project)'}
          >
            ✕
          </button>
        </div>

        {/* Body: step content (+ live preview from step 2). The Text step (design mode, step 3)
            is the one step whose LEFT pane is a WORKING surface — fields are placed and dragged
            on the artwork there — so it takes the room and the preview steps back; every other
            step splits evenly. The SVG mapping step used to claim the same room, from when it
            drew its own canvas; its left pane is a FORM, and taking the preview's width was
            taking it from the one canvas that can answer the step's question. */}
        <div
          className={`wz-body ${showPreview ? 'with-preview' : ''}${
            mode === 'design' && step === 3 ? ' wz-body-working' : ''
          }`}
        >
          {/* The entry is a MENU, not the first committed step of every possible walk. Until
              a card is chosen there is no truthful step list or denominator, so the complete
              rail stands down and its 216px returns to the menu. It appears immediately on
              every chosen path, including the phone's horizontal form of the same rail. */}
          {step > 0 && <nav className="wz-rail" aria-label="Creation steps">
            <div className="wz-dots">
              {stepTitles.map((t, i) => {
                const s = stepIndexes[i];
                const done = s < step;
                return (
                  <button
                    key={t}
                    className={`wz-dot ${s === step ? 'active' : ''} ${done ? 'done' : ''}`}
                    // Backward always. FORWARD jumps unlock in template mode once a design is
                    // picked (docs/GOALS_ARCHIVE.md "Student release" step 6): every later step holds
                    // a tasteful default, so "the template is good enough" must not cost four
                    // Next presses. Other modes keep their sequential walks - their steps
                    // build state a jump would skip.
                    disabled={
                      // A KIT'S LAST RAIL ENTRY IS NOT A JUMP TARGET. Reaching it means the
                      // graphic in hand has been BUILT and the plan has decided what comes
                      // next; a rail click sets the step directly, so allowing it would land
                      // on a Finish with a hole in the set and nothing saying so. Every
                      // earlier entry stays reachable — those are steps of one graphic.
                      kit && s === finishStep && s !== step ? true
                      : s > step
                        ? !(mode === 'template' && !!draft.variantId)
                        : s > (mode === 'template' ? 1 : 2) && !draft.variantId
                    }
                    onClick={() => setStep(s)}
                    title={t}
                  >
                    <span className="wz-dot-num" aria-hidden="true">{done ? '✓' : i + 1}</span>
                    {/* The label is its own element so a PHONE can drop the sub-line and lay
                        the rail out as a horizontal strip of numbered chips. */}
                    <span className="wz-dot-text">
                      <span className="wz-dot-label">{t}</span>
                      <span className="wz-dot-sub">{stepSubs?.[i] ?? ''}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The authored frame, read back where it stays visible for the whole walk. The
                CONTROL itself stays in the step that owns it (the Browse step's picker, the
                AI and blank steps' own) — one control, one home; this is the reminder plus
                the way back to it. */}
            <div className="wz-rail-foot">
              <p className="dlg-caption">Project format</p>
              <p className="wz-rail-format">{formatSummary}</p>
              <button className="wz-rail-change" onClick={revealFormatPicker}>Change ▾</button>
            </div>
          </nav>}

          <div className="wz-main">
          {/* THE KIT TRAY: the second axis of progress (which graphic of the set), above the
              form column, in the rail's own vocabulary. See wizard/KitTray.tsx. */}
          {kit && (
            <KitTray
              plan={kit}
              // Only while walking each graphic separately, on a configuring step, with
              // unbuilt graphics still after this one. On the first graphic the look question
              // is coming at the end of it anyway, and offering the same thing twice on one
              // walk is two doors to one outcome.
              onUseLookForRest={
                kit.propagate === false &&
                step >= 2 &&
                step <= animStep &&
                kit.current < kit.items.length - 1
                  ? adoptKitLookForRest
                  : undefined
              }
            />
          )}
          <div className="wz-step" ref={stepRef} data-overflow={stepOverflow || undefined}>
            {step === 0 && (
              <EntryStep
                onTemplates={() => { setMode('template'); setStep(1); }}
                onImportGraphic={() => {
                  // Entering the flow again starts it: a template file left over from a
                  // previous pass would otherwise re-appear on a walk the user restarted,
                  // with the artwork branch's steps around it.
                  setImportedFile(null);
                  setImportedFileError(null);
                  setMode('design');
                  setStep(1);
                }}
                onAi={() => { setMode('ai'); setStep(1); }}
                onVideo={() => {
                  if (!draft.formatTouched) patch(DEFAULT_VIDEO_FORMAT);
                  setMode('video');
                  setStep(1);
                }}
                onBlank={() => { setMode('blank'); setStep(1); }}
                onHome={(section = null) => {
                  closeGallery();
                  useRouter.getState().navigate({ view: 'home', section });
                }}
              />
            )}
            {step === 1 && mode === 'video' && (
              <VideoStep
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onCreate={createVideo}
                onOpen={createVideo}
              />
            )}
            {step === 1 && mode === 'blank' && (
              <BlankStep draft={draft} onDraft={patch} onCreate={createBlank} />
            )}
            {/* AiStep stays MOUNTED across the Create → Finish move (hidden on Finish), so
                stepping to the doors and back never discards the thread, the three directions,
                or the refinement history — none of which is lifted into the draft. */}
            {mode === 'ai' && (step === 1 || step === finishStep) && (
              <div hidden={step === finishStep}>
                <AiStep
                  format={draftFormatSelection(draft)}
                  onFormat={(selection) => patch(formatDraftPatch(selection))}
                  legibility={draft.legibility}
                  onLegibility={(legibility) => patch({ legibility })}
                  brandPalette={brand ? brand.palette : null}
                  result={aiResult?.template ?? null}
                  onResult={(template, valid, spec, generationId, path, pack) =>
                    setAiResult(template ? { template, valid, spec, generationId, path, pack: pack ?? null } : null)}
                  onThread={setAiThread}
                  onOpenImported={(imported) => {
                    // The byte-faithful path (deliberately NOT applyGenerated/Prettier): the
                    // user's file opens exactly as written, and the Export panel's inline
                    // validation shows what (if anything) needs fixing before it is
                    // SPX/CasparCG/OGraf-ready. applyTemplate closes the wizard.
                    landAt('editor');
                    applyTemplate(imported, { resetSampleData: true });
                    setActiveTab('html');
                    // Deferred a tick for the same reason as the imported-design Data
                    // reveal above: AppShell mounts on this route change, and a same-tick
                    // nonce bump lands before the mount and is missed.
                    setTimeout(() => useTemplateStore.getState().setActivePanel('export'), 0);
                    toSpxShell();
                  }}
                  onUseTemplates={(images) => {
                    // Skip the AI: design AROUND the images with the catalog — the existing
                    // images -> category -> template-picker continuation (logo-slot first).
                    patch({ importedImages: images, logoAssetPath: images[0]?.path ?? null });
                    setMode('import');
                  }}
                />
              </div>
            )}
            {step === 1 && (mode === 'design' || mode === 'svg' || mode === 'file') && (
              <ImportDesignStep
                svg={draft.designSvg}
                onSvg={(result) => {
                  // Fit-to-frame like the raster path: a larger canvas scales DOWN to the
                  // frame (vector — nothing is lost); the viewBox in the markup is untouched,
                  // only the design-space size the box is sized by changes.
                  const res = draftResolution(draft);
                  const fit =
                    result.width > res.width || result.height > res.height
                      ? Math.min(res.width / result.width, res.height / result.height)
                      : 1;
                  // A behaviour PROPOSED from the layer names, never required
                  // (docs/GRAPHIC_BEHAVIOUR_PLAN.md). Hoisted out of the patch because the FIELDS
                  // have to be able to see it: a proposed countdown needs its clock layer bound as
                  // one, which is a choice in the field list rather than in the behaviour's own
                  // pickers (`armTimerClock`, and it is the same call the mapping step's picker
                  // makes). Every other behaviour leaves the fields exactly as they were.
                  const proposed = proposeSvgBehaviour(result);
                  patch({
                    designSvg: {
                      ...result,
                      width: Math.round(result.width * fit),
                      height: Math.round(result.height * fit),
                    },
                    // EVERY detected text starts ON (plan §2, zero clicks). The `f:` prefix
                    // says "this is definitely a field" and names it — it never says "and
                    // nothing else is": one layer exported as `f:Competition` used to turn the
                    // other six off, which reads as detection having missed them. The one
                    // exception is the opposite prefix: `static:` is the designer saying this
                    // text is furniture, so the row is offered UNTICKED with its words left as
                    // drawn (a top ten's ten rank numerals, a bingo grid's numbers).
                    svgFields: armTimerClock(
                      result.candidates.map((c) => ({
                        candidateId: c.id,
                        on: !c.drawing,
                        title: c.label,
                        sample: c.sample,
                        numeric: c.numeric,
                        clock: c.clock,
                        // Text until the user says otherwise — "22:40" may be the time of day.
                        kind: 'text',
                      })),
                      proposed,
                    ),
                    // Pictures start OFF — inside a design they are usually the artwork
                    // itself — unless the layer opted in by name (`f:`).
                    svgImages: result.images.map((c) => ({
                      candidateId: c.id,
                      on: c.marked,
                      title: c.label,
                    })),
                    // Outlined-text suspects start OFF (a logo is a group of paths too) —
                    // unless named `f:`; the mapping step measures their boxes on its own
                    // render, and the generator hides whichever the user ticks (plan §1.A).
                    svgOutlines: result.outlines.map((c) => ({
                      candidateId: c.id,
                      on: c.marked,
                      title: c.label,
                      sample: c.label,
                      box: null,
                      color: null,
                      looksLikeText: null,
                    })),
                    // Every picker in the mapping step is re-pickable, and a file that looks like
                    // nothing in particular proposes nothing at all.
                    svgBehaviour: proposed,
                    // The switches and choices the names declare outright (`show:`, `choice:`).
                    svgExtras: proposeSvgExtras(result),
                    // THE HUG (plan §3) starts OFF here with the widest rectangle proposed;
                    // the mapping step then MEASURES the rendered artwork and turns growth on
                    // by itself where it is unambiguous (GOALS goal 5 - MapSvgFieldsStep
                    // proposeBannerGrowth). The measurement needs layout, which a drop handler
                    // does not have, so the decision lives there rather than here.
                    svgStretch: { on: false, shapeId: result.shapes[0]?.id ?? null },
                    // Bundled faces auto-match by family name; the mapping step offers the
                    // Google fetch or an upload for the rest (plan §4).
                    svgFonts: result.fonts.map((f) => ({
                      family: f.family,
                      lookup: f.lookup,
                      weight: f.weight,
                      // Matched on the LOOKUP name, so Illustrator's "Archivo-Bold" finds the
                      // bundled Archivo it plainly is. The template still declares the face
                      // under `family` — the name the artwork's own CSS asks for.
                      fontId:
                        FONTS.find((b) => fontNameKey(b.family) === fontNameKey(f.lookup))?.id ?? null,
                      customFont: null,
                    })),
                    // A fresh drop replaces any raster state from this walk.
                    designArt: null,
                    importedImages: [],
                    designOriginal: null,
                    designErases: [],
                    designFields: [],
                    category: 'imported-design',
                    variantId: 'svg01',
                    lines: [],
                    zone: null,
                    animation: { presetId: null, outPresetId: null },
                    ...(brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  });
                  // The walk changes shape the moment the file is read: an SVG has nothing
                  // to erase and nothing to place — its one setup step is the mapping.
                  setMode('svg');
                }}
                onClearSvg={() => {
                  patch({ designSvg: null, svgFields: [], svgImages: [], svgOutlines: [], svgBehaviour: null, svgExtras: [], svgStretch: { on: false, shapeId: null }, svgFonts: [], variantId: null, category: null });
                  setMode('design');
                }}
                templateFile={importedFile}
                onTemplateFile={(file) => {
                  setImportedFileError(null);
                  void importTemplateFile(file)
                    .then((result) => {
                      setImportedFile(result);
                      // The walk changes shape the moment the file is read: a template has no
                      // artwork to prepare and no field to place.
                      setMode('file');
                    })
                    .catch((e: unknown) =>
                      setImportedFileError(e instanceof Error ? e.message : String(e)),
                    );
                }}
                onClearTemplate={() => {
                  setImportedFile(null);
                  setImportedFileError(null);
                  setMode('design');
                }}
                fileError={importedFileError}
                art={draft.designArt}
                images={draft.importedImages}
                resolution={draftResolution(draft)}
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onArt={(designArt, importedImages) => {
                  patch({
                    // A raster drop replaces any SVG from this walk (and vice versa above).
                    designSvg: null,
                    svgFields: [],
                    svgImages: [],
                    svgOutlines: [],
                    svgBehaviour: null,
                    svgExtras: [],
                    svgStretch: { on: false, shapeId: null },
                    svgFonts: [],
                    designArt,
                    importedImages,
                    // A fresh drop resets the Prepare step: the pristine pixels become the
                    // erase's source, and any erase from a previous artwork is meaningless.
                    designOriginal: importedImages[0] ?? null,
                    designErases: [],
                    designKeepBakedText: false,
                    designFields: [],
                    category: 'imported-design',
                    // There is no design to choose — the artwork IS it — so the variant is
                    // settled here, and the graphic creates BARE: its text/number/image
                    // fields are added in the editor's Data tab as real placed layers.
                    variantId: 'imp01',
                    lines: [],
                    zone: null,
                    animation: { presetId: null, outPresetId: null },
                    ...(brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  });
                  // A raster drop is the classic prepare/place walk — also the way back from
                  // an SVG drop replaced by a picture.
                  setMode('design');
                }}
                onClear={() =>
                  patch({
                    designArt: null,
                    importedImages: [],
                    variantId: null,
                    designOriginal: null,
                    designErases: [],
                  })
                }
              />
            )}
            {step === 1 && mode === 'import' && (
              <ImportStep
                images={draft.importedImages}
                draft={draft}
                onDraft={patch}
                onImages={(importedImages) =>
                  patch({ importedImages, logoAssetPath: importedImages[0]?.path ?? null })
                }
                onContinue={(category) => {
                  patch({ category });
                  setStep(2);
                }}
              />
            )}
            {step === 1 && mode === 'template' && (
              <BrowseStep
                draft={draft}
                filters={browseFilters}
                onFilters={setBrowseFilters}
                onDraft={patch}
                onPickVariant={(v) =>
                  patch({
                    category: v.category,
                    variantId: v.id,
                    lines: v.suggestedLines.map((l) => ({ ...l })),
                    zone: null,
                    logoEnabled: null, // the logo decision belongs to the picked design
                    animation: { presetId: null, outPresetId: null },
                    // The chosen brand carries its look into every new graphic.
                    ...(brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  })
                }
                onAi={() => { setMode('ai'); setStep(1); }}
                // Ranking context, not a filter: with the footer's brand toggle on, the
                // package's siblings lead the results (proposal §13.3).
                brandFamily={brand ? brand.styleTag : null}
                buildMode={buildMode}
                onBuildMode={setBuildMode}
                kitPack={kitPack}
                kitFamily={kitFamily}
                kitSelected={kitSelected}
                // A new show brings its OWN curated look and its own whole contents - carrying
                // the previous pick across would quietly stop being the kit it was curated as
                // (the same rule the separate kit step held).
                onKitPack={(pack) => {
                  const family = defaultFamilyFor(pack, null);
                  setKitPack(pack);
                  setKitFamily(family);
                  setKitSelected(family ? defaultSelectionFor(pack, family) : []);
                }}
                // A LOOK CHANGE keeps the set: the keys are type ids, and every family the
                // picker offers resolves all of a pack's types. Anything the new look cannot
                // build simply stops being offered, and `kitSelection` drops it.
                onKitFamily={setKitFamily}
                onKitSelected={setKitSelected}
              />
            )}
            {step === 3 && mode === 'design' && draft.designArt && (
              <PlaceFieldsStep
                art={draft.designArt}
                draft={draft}
                onDraft={patch}
                onBackToPrepare={() => setStep(2)}
              />
            )}
            {step === 4 && mode === 'design' && variant && (
              <AnimationStep
                variant={variant}
                template={previewTemplate}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {/* The SVG walk's one setup step: which text layers the operator can edit. */}
            {step === 2 && mode === 'svg' && draft.designSvg && (
              <MapSvgFieldsStep
                draft={draft}
                onDraft={patch}
                onHover={setSvgHoverId}
                onBoxOverlay={setSvgBoxOverlay}
                onArmDraw={armSvgDraw}
                onArmPick={armSvgPick}
              />
            )}
            {step === 3 && mode === 'svg' && variant && (
              <AnimationStep
                variant={variant}
                template={previewTemplate}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {step === 2 && mode === 'design' && draft.designArt && (
              <PrepareDesignStep
                art={draft.designArt}
                resolution={draftResolution(draft)}
                images={draft.importedImages}
                original={draft.designOriginal}
                erases={draft.designErases}
                keepBaked={draft.designKeepBakedText}
                onKeepBaked={(keep) => patch({ designKeepBakedText: keep })}
                onErases={(designErases, importedImages) =>
                  patch({
                    designErases,
                    // Clearing every mark hands the pristine upload back as the artwork.
                    importedImages:
                      importedImages.length > 0
                        ? importedImages
                        : draft.designOriginal
                          ? [draft.designOriginal]
                          : draft.importedImages,
                  })
                }
                onStretch={(stretch) =>
                  patch({ designArt: { ...draft.designArt!, stretch: stretch ?? undefined } })
                }
                onDemoText={setStretchDemo}
              />
            )}
            {step === 2 && mode === 'import' && (
              <TemplateStep
                variants={orderedVariants}
                draft={draft}
                onDraft={patch}
                onPickVariant={(v) =>
                  patch({
                    variantId: v.id,
                    lines: v.suggestedLines.map((l) => ({ ...l })),
                    zone: null,
                    logoEnabled: null, // the logo decision belongs to the picked design
                    // Motion AND the steps decision belong to the picked design too: a
                    // checklist is stepped by construction and a name strap is not, so
                    // switching design re-asks instead of carrying the last answer across.
                    animation: { presetId: null, outPresetId: null, steps: null },
                    // The chosen brand carries its look into every new graphic.
                    ...(brand
                      ? brandPatch(brand)
                      : { paletteId: null, customPalette: null, fontId: null }),
                  })
                }
              />
            )}
            {/* The catalog flow's later steps — one index earlier in the Browse flow;
                design mode has its own step 3/4 above. */}
            {step === (mode === 'template' ? 2 : 3) && (mode === 'template' || mode === 'import') && variant && (
              <FieldsStep variant={variant} draft={draft} onDraft={patch} />
            )}
            {step === (mode === 'template' ? 3 : 4) && (mode === 'template' || mode === 'import') && variant && (
              <StyleStep variant={variant} draft={draft} onDraft={patch} builtCss={previewTemplate?.css ?? null} markWarning={markWarning} />
            )}
            {step === animStep && (mode === 'template' || mode === 'import') && variant && (
              <AnimationStep
                variant={variant}
                template={previewTemplate}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {/* THE KIT'S ENDING, in two moments. The look question comes first and only once
                (there is nothing to ask when the set is a single graphic), then the kit's own
                Finish: name the production, look at everything that was built, pick a door. */}
            {step === finishStep && kit && kit.propagate === null && kit.items.length > 1 && (
              <KitLookStep
                remaining={kit.items.length - 1}
                summary={lookSummary()}
                onUseForAll={useKitLookForAll}
                onWalkEachOne={walkKitEachOne}
              />
            )}
            {step === finishStep && kit && !(kit.propagate === null && kit.items.length > 1) && (
              <KitFinishStep
                name={kitProductionName}
                namePlaceholder={kit.pack.name}
                onName={setKitProductionName}
                built={kit.built.filter((t): t is SpxTemplate => t !== null)}
                oneLook={kit.propagate !== false}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                onOpenProduction={openKitProduction}
                onExport={exportKit}
                busy={kitBusy}
                error={kitError}
              />
            )}
            {/* A finished template file: the same three doors, over code we did not write. */}
            {step === finishStep && mode === 'file' && importedFile && (
              <FinishStep
                name={draft.name}
                namePlaceholder={importedFile.template.name}
                onName={(name) => patch({ name })}
                summary={importedSummaryRows(importedFile)}
                productions={finishProductions}
                libraryIndex={finishLibrary}
                fields={importedFile.template.fields.map((f) => f.field)}
                defaultProductionId={contextProductionId}
                madeId={finishMadeId}
                onAddToProduction={createFromFileAndAddToProduction}
                onOpenEditor={createFromFile}
                showEditorDoor={advanced}
                onExport={createFromFileAndExport}
                busy={false}
              />
            )}
            {/* Finish — shared by every catalog-shaped mode, design included. */}
            {step === finishStep && !kit && mode !== 'ai' && mode !== 'video' && mode !== 'file' && variant && (
              <FinishStep
                name={draft.name}
                namePlaceholder={variant.name}
                onName={(name) => patch({ name })}
                summary={catalogSummaryRows(variant, draft)}
                onEditStep={editSummaryStep}
                productions={finishProductions}
                libraryIndex={finishLibrary}
                fields={(previewTemplate?.fields ?? []).map((f) => f.field)}
                defaultProductionId={contextProductionId}
                madeId={finishMadeId}
                onAddToProduction={createAndAddToProduction}
                onOpenEditor={create}
                showEditorDoor={advanced}
                onExport={createAndExport}
                busy={!previewTemplate}
              />
            )}
            {/* Finish — Create with AI takes the SAME branch: the result is summarised off the
                template itself (no catalog variant behind it), and both doors route through
                applyAiProject so the editor and export endings stay byte-identical. */}
            {/* A Pro PACKAGE finishes as a SET, through the kit's own ending (§15.9): several
                graphics that belong to each other end in one production, not in the editor with
                the other N-1 looking like they were never made. It is the same component the
                catalog kit uses, on purpose - the promise being checked is identical, and the
                thumbnail grid is where it is checkable. */}
            {step === finishStep && mode === 'ai' && aiResult && aiPack() && (
              <KitFinishStep
                name={draft.name}
                namePlaceholder={aiResult.template.name}
                onName={(name) => patch({ name })}
                built={aiPack()!}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                // Always true here, and it is the whole claim: every graphic in a Pro package
                // is composed from ONE design language rather than styled one at a time.
                oneLook
                // A Pro user never chose a "kit" - they asked for a channel's look and got the
                // graphics built in it.
                noun="package"
                onOpenProduction={openAiPackage}
                onExport={exportAiPackage}
                busy={kitBusy || !aiResult.valid}
                error={kitError}
              />
            )}
            {step === finishStep && mode === 'ai' && aiResult && !aiPack() && (
              <FinishStep
                name={draft.name}
                namePlaceholder={aiResult.template.name}
                onName={(name) => patch({ name })}
                summary={aiSummaryRows(aiResult.template, aiResult.valid)}
                productions={finishProductions}
                libraryIndex={finishLibrary}
                fields={aiResult.template.fields.map((f) => f.field)}
                defaultProductionId={contextProductionId}
                madeId={finishMadeId}
                onAddToProduction={createFromAiAndAddToProduction}
                onOpenEditor={createFromAi}
                showEditorDoor={advanced}
                onExport={createFromAiAndExport}
                busy={!aiResult.valid}
              />
            )}
            <div className="wz-step-fade" aria-hidden="true" />
          </div>
          {wizardFooter}
          </div>

          {showPreview &&
            (mode === 'ai' ? aiResult
            : mode === 'blank' ? blankPreview
            : mode === 'file' ? importedFile
            : previewTemplate) && (
            <aside className="wz-side">
              <WizardPreview
                template={
                  mode === 'ai'
                    ? aiResult!.template
                    : mode === 'blank'
                      ? blankPreview!
                      : mode === 'file'
                        ? importedFile!.template
                        : previewTemplate!
                }
                replayKey={replayKey}
                demoOut={demoOut}
                rehearse={onAnimationStep}
                demoText={mode === 'design' ? stretchDemo : null}
                {...(mode === 'svg' && step === 2
                  ? {
                      highlightSelector: svgHoverId ? `[${SVG_CANDIDATE_ATTR}="${svgHoverId}"]` : null,
                      boxOverlay: svgBoxOverlay,
                      // The ARTWORK's own rect is the space a drawn box is reported in — the one
                      // the step turns into design px (plan §6a step 3). Tracked for the whole
                      // step, so the first drag after arming has a rect to measure against.
                      drawIn: '.imported-design-box',
                      drawing: svgDrawArmed,
                      onDraw: onSvgDraw,
                      // Every layer the file offers is pointable (plan §6a step 5). Derived
                      // here because the wizard holds the inventory, and joined as a stable
                      // list so the canvas re-tracks only when the FILE changes.
                      pickable: svgPickable,
                      onPick: onSvgPick,
                    }
                  : {})}
              />
            </aside>
          )}
        </div>
      </div>

      {resumeAsk && (
        <WizardConfirm
          title="Back to the wizard?"
          confirmLabel="Back to the wizard"
          cancelLabel="Leave it as it is"
          onConfirm={() => setResumeAsk(null)}
          onCancel={leaveResume}
          testid="wz-resume-confirm"
        >
          <p className="wz-confirm-lead">
            You are stepping back into the walk that made{' '}
            <strong>{resumeAsk.made?.name ?? 'this graphic'}</strong>.
          </p>
          {/* WHAT RE-ENTERING RESETS, named rather than discovered afterwards (owner, 2026-09-02:
              "there could just be a pop-up window that warns you that if you go back to the
              wizard, these things will be reset"). The wizard REGENERATES from its own answers,
              so it cannot carry hand-written code forward - the honest answer is to say so,
              never a silent overwrite and never a refusal. */}
          <div className="wz-confirm-warn">
            Finishing again rebuilds the graphic from the wizard’s answers, so it writes over
            the one that exists now.
            {workingDirty && ' Anything changed since then, on the canvas or in the code, goes with it.'}
          </div>
          <ul>
            <li>Your answers are all still here. Change what you came back for and finish again.</li>
            {resumeAsk.made?.production ? (
              <li>The copy in “{resumeAsk.made.production}” is replaced. Its cues stay as they are.</li>
            ) : (
              <li>The graphic keeps its place in your library rather than becoming a second copy.</li>
            )}
          </ul>
        </WizardConfirm>
      )}
    </div>
  );
}
