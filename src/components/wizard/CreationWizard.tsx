import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { CatalogLoading, lazyStep, useCatalog } from '../catalogOnDemand';
import {
  brandClearPatch,
  brandOrClearPatch,
  brandPatch,
  buildDraftTemplate,
  draftFormatSelection,
  draftName,
  draftResolution,
  formatDraftPatch,
  initialDraft,
  mergeDraft,
  type DraftPatch,
  type WizardDraft,
} from './draft';
import { type ProjectBrand } from '../../model/brand';
import { loadLooks } from '../../model/packets';
import { FONTS } from '../../model/fonts';
import { commitStagedSelection } from '../../ai/preferences';
import { formatTemplate } from '../../format/formatCode';
import { paletteById } from '../../model/wizard';
import { SVG_CANDIDATE_ATTR } from '../../assets/svgImport';
import WizardPreview, { type PreviewBoxOverlay, type PreviewGrowCap } from './WizardPreview';
import BrandLogo from '../BrandLogo';
import { BetaFeedbackButton } from '../feedback/BetaFeedback';
import AuthStatus from '../auth/AuthStatus';
import EntryStep from './steps/EntryStep';
import {
  ImportStep,
  ImportDesignStep,
  PrepareDesignStep,
  PlaceFieldsStep,
  MapSvgFieldsStep,
  artDropPatch,
  clearSvgPatch,
  svgDropPatch,
  templateFileDropped,
} from './import';
import TemplateStep from './steps/TemplateStep';
import type { BuildMode } from './steps/BrowseStep';
import KitTray from './KitTray';
import KitFinishStep from './steps/KitFinishStep';
import {
  applyStyleToKit,
  buildKit,
  commitKitGraphic,
  defaultSelectionFor,
  kitKeys,
  rebrandKit,
  reconcileKit,
  type KitPlan,
} from './kitPlan';
import { NO_BROWSE_FILTERS, type BrowseFilters } from '../../templates/browseFilters';
import { IMPORTED_VARIANTS } from '../../templates/importedDesign/variants';
import StyleStep from './steps/StyleStep';
import AnimationStep from './steps/AnimationStep';
import VideoStep from './steps/VideoStep';
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
import { openNewEditor } from '../editorFoundation/openNewEditor';
import NewGraphicButton from '../NewGraphicButton';
import { saveCurrentGraphic, saveGraphicAs, useSaveUi } from '../../store/saveActions';
import { graphicById, graphicNameIndex, librarySaveEffect, type LibraryNameEntry } from '../../model/library';
import WizardConfirm, { wizardConfirmOpen } from './WizardConfirm';
import { recordLiteOutcome } from '../../ai/lite/client';
import { DEFAULT_VIDEO_FORMAT, formatProjectSummary } from '../../model/projectFormat';
import { trackEvent } from '../../backend/events';
import { captureLookFromTemplate } from '../../model/packets';
import { saveTemplateSetToProduction } from '../../model/templateSet';
import { createShowNamedChecked, loadShows, setShowLook, type Show } from '../../model/shows';
import { addReadyGraphicToShow as addGraphicToShow } from '../../control/productionAdmission';
import { publishGate } from '../../validation/publishGate';
import { commitDurableWrites } from '../../model/durableStore';
import { raiseStorageAlert } from '../../store/storageAlert';
import type { ProductionDest } from './steps/FinishStep';
import type { TemplatePack } from '../../templates/packs';
import {
  canProceed,
  needsCatalogOn,
  offersBrand,
  offersSkip,
  previewOn,
  railIndex,
  railJump,
  slugIndex,
  stepAfter,
  stepIndex,
  summaryStep,
  walkOf,
  type WizardMode,
} from './shell/walks';
import { makeDoors } from './shell/doors';

// The steps that list or build on catalog designs load with the catalog, never with the wizard:
// the Entry step must open without it (components/catalogOnDemand.tsx).
const BrowseStep = lazyStep(() => import('./steps/BrowseStep'));
const FieldsStep = lazyStep(() => import('./steps/FieldsStep'));
const AiStep = lazyStep(() => import('./steps/AiStep'));

/** What the doors (shell/doors.ts) reach in the studio beyond the walk: stores, writes, routes. */
const STUDIO_DOOR_IO = {
  built: () => {
    const s = useTemplateStore.getState();
    return { template: s.template, graphicId: s.saved.graphicId };
  },
  openExport: () => {
    const s = useTemplateStore.getState();
    useExportUi.getState().openExport({ template: s.template, sampleData: s.sampleData, graphicId: s.saved.graphicId });
  },
  openEditor: () => openNewEditor({ replace: true }),
  requestProductionExport: (showId: string) => useTemplateStore.setState({ pendingProductionExport: showId }),
  navigate: (route: Route) => useRouter.getState().navigate(route),
  replace: (route: Route) => useRouter.getState().replace(route),
  raiseStorageAlert, publishGate, loadShows, createShowNamedChecked, commitDurableWrites, addGraphicToShow,
  setShowLook, captureLookFromTemplate, saveTemplateSetToProduction, trackEvent,
};

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
 * THE WALK JUST FINISHED — everything needed to step back INTO it (
 * https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/back-to-the-wizard.md, entry point 1: "the draft is still in memory; this is undo the last
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
  // ── A WALK LEFT MID-WAY ──
  // Every close the wizard makes ITSELF (a door that made something, ✕ on the front page, a
  // declined walk-back) goes through this wrapper, so a close it did not make is the reader
  // LEAVING: a Home door (which calls the store's own close on purpose) or browser Back. Such
  // a walk is held, and the guard asks before a door opens the wizard fresh over it
  // (saveActions `heldWalk`).
  const closedByWizard = useRef(false);
  const leaveGallery = useTemplateStore((s) => s.closeGallery);
  const closeGallery = useCallback(() => {
    closedByWizard.current = true;
    leaveGallery();
  }, [leaveGallery]);
  /** The draft this walk started from, so "has work" means the reader changed something. */
  const startDraft = useRef<WizardDraft | null>(null);
  /** The furthest step this walk reached: where Continue returns. Not the step at close, which
   *  browser Back has already rewound through every step to the front page. */
  const lastStep = useRef(0);
  // Has the created graphic been touched since the door saved it? The app's own answer, so the
  // walk-back warning promises to write over hand edits only when there are some. A door that
  // saved nothing (the editor one) reads dirty from birth, which is the right answer there too.
  const workingDirty = useTemplateStore((s) => s.saved.dirty);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);

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
  /** The brand in force, for the deep link below. A link can land in the same commit as the open,
   *  before the brand that open chose has rendered, so the open writes its choice here at once. */
  const brandInForce = useRef<ProjectBrand | null>(null);
  brandInForce.current = brand;
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
  /** True while the entry's New production waits for its durable write, so a second press in
   *  that window does not mint a second "Untitled production". */
  const creatingProduction = useRef(false);
  /** The same for Finish's "Add to the production", from the press until it lands or fails. */
  const addingToProduction = useRef(false);
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
  // HOW FAR EACH GROWING BOX MAY REACH - one draggable line per box (docs/TEXT_BOX_BINDING.md,
  // rung 4). Measured and worded by the step, drawn on the preview, and moved back through the
  // handler beside it, which is held in a REF for the reason the draw handler is: its closure
  // reads the draft, so it is a fresh function on every keystroke.
  const [svgGrowCaps, setSvgGrowCaps] = useState<PreviewGrowCap[]>([]);
  const svgCapRef = useRef<((id: string, margin: number) => void) | null>(null);
  const armSvgCap = useCallback((handler: ((id: string, margin: number) => void) | null) => {
    svgCapRef.current = handler;
  }, []);
  const onSvgCapDrag = useCallback((id: string, margin: number) => {
    svgCapRef.current?.(id, margin);
  }, []);
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
  const [kitSelected, setKitSelected] = useState<string[]>([]);
  /** The kit under construction — set when Browse's Next is taken in kit mode, null otherwise.
   *  Its presence is what makes every step below behave as one graphic OF A SET. */
  const [kit, setKit] = useState<KitPlan | null>(null);
  /** The two questions a kit asks before acting: switching to another kit over an edited one,
   *  and applying the open graphic's Style to the rest. Both answer in `WizardConfirm`. */
  const [kitSwitchAsk, setKitSwitchAsk] = useState(false);
  const [kitApplyAsk, setKitApplyAsk] = useState(false);
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
  const walkSpec = walkOf(mode, !!kit || buildMode === 'kit');
  const stepId = walkSpec.steps[step]?.id ?? null;
  const route = useRouter((s) => s.route);
  const stepKey = step > 0 ? walkSpec.slugs[step] ?? '' : null;
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
      const idx = slugIndex(walkSpec, urlKey);
      setStep(idx >= 0 ? idx : 0);
    }
  }, [open, route, stepKey, walkSpec]);

  // Each route/step starts at its own first control. This is especially important on phones:
  // the Video entry sits at the bottom of Entry, and carrying that scrollTop forward used to
  // land Video below its project-format picker.
  useEffect(() => {
    if (stepRef.current) stepRef.current.scrollTop = 0;
  }, [step, mode]);
  // A new mode is a new walk, with other steps, and it starts on the step the mode changed on.
  // A dropped file turns the design walk into the file walk without moving the reader, so a
  // reset to 0 there sent Continue back to Entry with the file out of sight.
  const lastMode = useRef(mode);
  useEffect(() => {
    if (mode !== lastMode.current) {
      lastMode.current = mode;
      lastStep.current = step;
    } else if (open && step > lastStep.current) lastStep.current = step;
  }, [open, mode, step]);
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
    setKitSelected([]);
    setKit(null);
    setKitSwitchAsk(false);
    setKitApplyAsk(false);
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

  /** Has the reader done anything in this walk that a fresh open would wipe? The same rule as
   *  the working document's guard (saveActions `hasUnsavedWork`): compared with what the walk
   *  started from. The project format alone is not work - ✕ keeps it over a discarded draft,
   *  and it is one select to set again. */
  const walkHasWork = () => {
    // A door already made something of it (the export door keeps the wizard open).
    if (madeThisOpen.current) return false;
    if (aiResult || importedFile || kit || kitPack) return true;
    const base = startDraft.current ?? initialDraft();
    const { aspectId, resolutionId, fps, formatTouched } = base;
    return JSON.stringify({ ...draft, aspectId, resolutionId, fps, formatTouched }) !== JSON.stringify(base);
  };
  // Read by the open effect through a ref, as `leaveStepRef` is, so that effect keeps its
  // `[open]` dependencies rather than re-running on every keystroke.
  const walkHasWorkRef = useRef(walkHasWork);
  walkHasWorkRef.current = walkHasWork;

  // Fresh wizard every time it opens; reload the brand (it may have just been saved).
  useEffect(() => {
    if (open) {
      const opening = useRouter.getState().route;
      // ── BACK INTO A WALK THE READER LEFT ── The guard's Continue (saveActions `heldWalk`):
      // everything is still in state, because a closed wizard renders null rather than
      // unmounting, so only the step it was left on is put back.
      closedByWizard.current = false;
      const { resumeWalk } = useSaveUi.getState();
      useSaveUi.setState({ heldWalk: false, resumeWalk: false });
      if (resumeWalk) {
        setStep(lastStep.current);
        return;
      }
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
        brandInForce.current = walk.brandChoices.find((b) => b.id === walk.brandId)?.brand ?? null;
        setStretchDemo(null);
        resetKit();
        // The step the walk ENDED on, not the one the history entry happens to name: the
        // reader wants the last screen back (https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/back-to-the-wizard.md), and leaving
        // the URL on an earlier step would make the rail and the address bar disagree.
        useRouter.getState().replace({
          view: 'new',
          step: walkOf(walk.mode, false).slugs[walk.step] ?? '',
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
          ? slugIndex(walkOf('template', false), opening.step)
          : -1;
      setStep(named > 0 ? named : 0);
      lastStep.current = 0;
      setMode('template');
      let start = initialDraft();
      setBrowseFilters(NO_BROWSE_FILTERS);
      setAiResult(null);
      acceptedAiGeneration.current = null;
      setAiThread(null);
      // A dropped template file is this walk's material like the draft: kept, it held an empty
      // walk (`walkHasWork` counts it) and the guard asked about nothing.
      setImportedFile(null);
      setImportedFileError(null);
      setStretchDemo(null);
      resetKit();
      // Every saved brand, offered by name. NONE is selected: matching is an explicit act, and
      // a person with no brands sees no chooser at all (docs/BRAND_PLAN.md decision 1). The
      // DEFAULT brand does not preselect itself here either - it is what Home's "Use for new
      // graphics" star means, and the wizard still asks.
      const saved = loadLooks().map((l) => ({ id: l.id, name: l.name, brand: l.brand }));
      setBrandChoices(saved);
      setBrandId(null);
      brandInForce.current = null;
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
          brandInForce.current = chosen.brand;
          start = mergeDraft(start, brandPatch(chosen.brand));
        }
      }
      setDraft(start);
      startDraft.current = start;
    } else {
      // Left with work in it (see `closedByWizard`)? Then hold it.
      const left = !closedByWizard.current;
      closedByWizard.current = false;
      useSaveUi.setState({ heldWalk: left && walkHasWorkRef.current() });
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
  // The catalog loads once a step lists designs, the draft names a catalog design, or a deep
  // link does (which holds Entry until it resolves, so nothing done there is overwritten). The AI
  // step (lazy, so it brings its own), the import doors (their own variants resolve without it)
  // and video never wait for it. Until it arrives the step area shows CatalogLoading.
  const importedVariant = IMPORTED_VARIANTS.find((v) => v.id === draft.variantId);
  const needsCatalog =
    needsCatalogOn(walkSpec, step) || Boolean(pendingDesignId) || (step > 0 && Boolean(draft.variantId) && !importedVariant);
  const catalog = useCatalog(open && needsCatalog);
  useEffect(() => {
    if (!open || !pendingDesignId || !catalog) return;
    const pending = catalog.variantById(pendingDesignId);
    useTemplateStore.setState({ pendingDesignId: null });
    // Imported-design designs create BARE through a dedicated setup flow (mode 'design'),
    // never through the Browse pick path — excluded here for the same reason Browse never
    // lists it. An id that fails to resolve at all (missing, retired, or a manually edited
    // URL) leaves the wizard exactly where the reset effect above put it: Entry.
    if (!pending || pending.category === 'imported-design') return;
    setMode('template');
    // The link chose this design, not the reader in this walk: it is where the walk starts.
    startDraft.current = mergeDraft(initialDraft(), {
      category: pending.category,
      variantId: pending.id,
      lines: pending.suggestedLines.map((l) => ({ ...l })),
      zone: null,
      logoEnabled: null,
      animation: { presetId: null, outPresetId: null, steps: null },
      // The brand in force carries its look, as on the Browse pick: the chooser keeps naming it,
      // so a draft without it had the chooser and the preview disagreeing.
      ...brandOrClearPatch(brandInForce.current),
    });
    setDraft(startDraft.current);
    setStep(stepIndex(walkOf('template', false), 'fields'));
  }, [open, pendingDesignId, catalog]);

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

  const variant = importedVariant ?? (draft.variantId && catalog ? catalog.variantById(draft.variantId) : undefined);

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
            previewMarkers: mode === 'svg' && walkOf('svg', false).steps[step]?.id === 'map',
          })
        : null,
    [variant, draft, mode, step],
  );
  // Can the user's own mark still be seen in the package they picked? Only asked when the draft
  // actually carries one - the check mounts a frame, and a graphic with no logo cannot fail it.
  const markWarning = useMarkLegibility(previewTemplate, Boolean(draft.logoAssetPath));

  const { animStep, finishStep } = walkSpec;
  // On the Animation step the preview demos the full lifecycle (in → hold → out → in)
  // so the exit is actually seen — unless the user is tuning the entrance only.
  const onAnimationStep = stepId === 'animation';
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
    // THE BRAND REACHES EVERY GRAPHIC OF A KIT, not only the one on screen: the set is built
    // up front, so every graphic's answers take it and are rebuilt - and None hands each one
    // back the kit's own palette rather than no palette at all (wizard/kitPlan.ts).
    if (kit && buildMode === 'kit') {
      const plan = rebrandKit(committedKit(kit), next ? brandPatch(next) : null);
      setKit(plan);
      setDraft(plan.drafts[plan.current]);
      return;
    }
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
    // A rewind is a fresh start: what it keeps (the format) is not work, and nor is a brand the
    // open had pre-applied, which it drops.
    startDraft.current = null;
    lastStep.current = 0;
    setBrowseFilters(NO_BROWSE_FILTERS);
    setAiResult(null);
    setAiThread(null);
    // The dropped file goes with the walk, as on a fresh open.
    setImportedFile(null);
    setImportedFileError(null);
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

  const createVideo = (project: VideoProject) => {
    useVideoProjectStore.getState().loadProject(project);
    useDocKindStore.getState().setKind('video');
    // ACTIVATION, same as every SPX door: a visitor who made something. The video path used to
    // report nothing at all, so a whole project kind was invisible to the funnel and to the
    // admin overview - which showed as an honest-looking zero rather than as a gap.
    trackEvent('activation', 'video');
    // The route is named in the SAME tick as the close. Without it the `#/new` route-agreement
    // effect in App.tsx reads a closed-but-still-routed wizard as a ✕ close and rewinds to Home,
    // which would swallow the workspace the create just promised.
    useRouter.getState().replace({ view: 'video' });
    closeGallery();
  };

  /**
   * Snapshot the walk before a door acts on it, so the reader can step back into it. Called by
   * the three APPLIERS rather than by each of FinishStep's doors, so a door added to that step
   * later inherits it.
   *
   * The KIT and Pro-PACKAGE endings reach no applier (the set doors, `openSet` and `exportSet`,
   * save a SET, not a document), so they still leave the
   * wizard with no way back in. Deliberately out of scope here and recorded in
   * https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/back-to-the-wizard.md rather than half-wired.
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

  /** Every ending of the walk (shell/doors.ts), each taking the mode's applier below. */
  const doors = makeDoors({
    ...STUDIO_DOOR_IO,
    saveBuiltGraphic,
    noteMade,
    closeGallery,
    productionPress: addingToProduction,
    setSetBusy: setKitBusy,
    setSetError: setKitError,
  });

  // Apply a freshly GENERATED template as a new project. Its HTML is tidied through Prettier
  // first (HTML only - the CSS keeps its hand-aligned property comments and the JS animation
  // region stays strict-JSON; see formatTemplate's defaults / docs/FORMATTING.md), so every
  // project starts from one consistent, formatted baseline. Formatting once at birth also keeps
  // later canvas/timeline edits to tight, minimal diffs - the editor's change-highlight stays
  // accurate. Imported templates are NOT routed here: they stay byte-faithful to the user's file.
  //
  // THE WIZARD STAYS OPEN over whatever is under it, and every door routes away by itself: the
  // production door to the rundown, the export door opens the export window OVER the wizard,
  // and "Edit this graphic" goes to the new editor. Nothing lands in the old code editor.
  const applyGenerated = async (template: SpxTemplate) => {
    const formatted = await formatTemplate(template); // HTML-only by default
    applyTemplate(formatted, { resetSampleData: true, keepGalleryOpen: true });
    toSpxShell();
  };

  /* ── THE KIT ─────────────────────────────────────────────────────────────────────────────
     A kit is BUILT when it starts: leaving the Kit step creates every ticked graphic in the
     kit's Style and lands on the kit's Finish step, which is its HUB - every graphic laid out,
     any of them one click from editing, and the production doors below. Editing is not a walk:
     the ordinary Fields/Style/Animation steps configure whichever graphic is open, the tray
     jumps between graphics on the same step, and each graphic keeps its own answers
     (wizard/kitPlan.ts). `kit.built` is always the whole set - the tray, the hub and the save
     all read it. */

  /** Is this one of the steps that edit the open kit graphic? */
  const isKitEditStep = (s: number) => s >= 2 && s <= animStep;

  /** The kit with the open graphic's answers recorded - what every move away from it keeps. */
  const committedKit = (plan: KitPlan): KitPlan =>
    isKitEditStep(step) ? commitKitGraphic(plan, draft) : plan;

  /**
   * THE ONE WAY A KIT CHANGES STEP. Leaving the editing steps records the graphic in hand first,
   * so the hub, the Kit step and the save always see it as it was left.
   */
  const moveKitTo = (target: number) => {
    // FORWARD FROM THE KIT STEP means the picker's answer, whichever control was used: a rail
    // click has to build or re-shape the set exactly as Next does, or ticks made there are
    // silently dropped. And a kit left for ONE graphic is over - its tray and hub would
    // otherwise stay wrapped around a design that is not part of it.
    if (step === 1 && target > 1) {
      if (buildMode === 'one') {
        setKit(null);
        setStep(target);
      } else {
        buildFromKitStep(target);
      }
      return;
    }
    if (kit && isKitEditStep(step) && !isKitEditStep(target)) setKit(commitKitGraphic(kit, draft));
    setStep(target);
  };

  /** Open kit graphic `index` on `target` (Fields by default, or the step already on screen when
   *  the tray jumps), recording the one being left. */
  const openKitGraphic = (index: number, target: number = 2) => {
    if (!kit) return;
    const plan = committedKit(kit);
    setKit({ ...plan, current: index });
    setDraft(plan.drafts[index]);
    setStep(target);
  };

  /** The footer brand as a draft patch, for graphics being built now. */
  const brandFields = (): DraftPatch | null => (brand ? brandPatch(brand) : null);

  /**
   * Kit step → the hub, with the whole set built. The same kit coming back from the Kit step
   * keeps every graphic it still holds exactly as edited (`reconcileKit`); a different kit starts
   * over. The kit's palette leads each graphic it is drawn for, and the footer brand outranks it.
   * The kit module is already loaded by the Kit step that asks for this, so the await is a tick.
   */
  const buildKitAndOpenHub = async (pack: TemplatePack, keys: string[], target: number = finishStep) => {
    const { kitSelection } = await import('../../templates/kit');
    const items = kitSelection(pack, keys);
    if (items.length === 0) return;
    let plan: KitPlan;
    if (kit && kit.pack.id === pack.id) {
      plan = reconcileKit(kit, items, draft, brandFields());
    } else {
      plan = buildKit(pack, items, draft, brandFields());
      setKitProductionName('');
    }
    setKitError(null);
    setKit(plan);
    // The draft in hand is always the open graphic's, so a rail click into Fields from the hub
    // opens a real graphic rather than whatever the Kit step left behind.
    setDraft(plan.drafts[plan.current]);
    setStep(target);
  };

  /** Leave the Kit step forward to `target`. Switching to ANOTHER kit discards the edited one,
   *  so that is asked first (and the answer lands on the hub). */
  const buildFromKitStep = (target: number = finishStep) => {
    if (!kitPack) return;
    if (kit && kit.pack.id !== kitPack.id && kit.edited) setKitSwitchAsk(true);
    else void buildKitAndOpenHub(kitPack, kitSelected, target);
  };

  /** "Apply this Style to all", once confirmed: the open graphic's Style reaches every other
   *  graphic in the kit through the `:root` contract (wizard/kitPlan.ts `applyStyleToKit`). */
  const applyKitStyle = () => {
    setKitApplyAsk(false);
    if (!kit) return;
    setKit(applyStyleToKit(committedKit(kit), draft));
  };

  /**
   * SAVE THE WHOLE SET: every graphic to the library, pooled into one new PRODUCTION - the
   * unit that airs (docs/GOALS_ARCHIVE.md "Student release" step 3). The doors' `saveSet` gates
   * every member first; the write path and its durable-write claims live in model/templateSet.ts.
   */
  const saveKit = async (dest: ProductionDest): Promise<Show | null> => {
    if (!kit) return null;
    return doors.saveSet(committedKit(kit).built, kit.pack.name, dest, 'kit');
  };

  /** What "Apply this Style to all" is actually offering to carry, in the user's own words -
   *  the same read-back the single-graphic Finish gives, so the offer is not taken blind. */
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

  /** Save the whole package, through the kit's own set doors. The name the user typed on Finish
   *  names the PRODUCTION here rather than one graphic - there is no single graphic for it to
   *  name - and each member keeps the name its own composer gave it. */
  const saveAiPack = async (dest: ProductionDest): Promise<Show | null> => {
    const pack = aiPack();
    return pack ? doors.saveSet(pack, aiName() || pack[0].name, dest, 'pro') : null;
  };

  /**
   * Build the AI result as the working project. The AI create path DIFFERS from the catalog
   * one and must keep its steps: commit the staged preference pick (aggregated, subtle; see
   * src/ai/preferences.ts — a no-alternatives run staged nothing), and, AFTER the whole-project
   * swap clears the store's spec, adopt the result's own spec so it rides the autosave slot and
   * the next Save. Returns the applied template (read back post-format) or null. Both Finish
   * doors go through here, so the editor and export endings stay byte-identical.
   */
  const applyAiProject = async (): Promise<SpxTemplate | null> => {
    if (!aiResult?.valid) return null;
    rememberWalk();
    if (aiResult.generationId) acceptedAiGeneration.current = aiResult.generationId;
    commitStagedSelection();
    const name = aiName();
    // The Finish name rides the built template, exactly as the catalog path's draftName does,
    // so it reaches the topbar, the Save prefill, and the export slug through one path.
    const template = aiResult.template.name === name ? aiResult.template : { ...aiResult.template, name };
    await applyGenerated(template);
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

  /**
   * Build the drafted graphic and make it the working project. BOTH Finish doors go through
   * here — including the export one, which is what keeps the two endings byte-identical: the
   * editor path formats through Prettier (applyGenerated), so an export path that skipped it
   * would ship different HTML for the same choices.
   *
   * Returns the applied template (read back from the store, post-format) or null.
   */
  const applyDraftProject = async (): Promise<SpxTemplate | null> => {
    if (!previewTemplate || !variant) return null;
    rememberWalk();
    // The two modes whose preview carries preview-only extras rebuild without them — design's
    // stretch-demo line, and the SVG mapping step's candidate markers. Create is reachable from
    // any step (Skip to finish), so this cannot be left to the step the reader happens to be on.
    // Every other mode's preview is exactly the created code already.
    const previewOnly = mode === 'design' || mode === 'svg';
    await applyGenerated(previewOnly ? buildDraftTemplate(variant, draft) : previewTemplate);
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

  /** The catalog walk's name for what it built, read once the applier has built it. */
  const catalogName = () => (variant ? draftName(variant, draft) : '');

  /* ── A finished template file: its applier, over the file exactly as written ────────────
     BYTE-FAITHFUL, deliberately: `applyTemplate` rather than `applyGenerated`, so nothing
     Prettier-formats somebody else's HTML on the way in. The name is the only edit — it slugs
     the zip and, on the SPX and CasparCG packages, the template FOLDER an operator reads. */
  const importedName = () => draft.name.trim() || importedFile?.template.name || 'Imported graphic';

  const applyImportedFile = (): SpxTemplate | null => {
    if (!importedFile) return null;
    rememberWalk();
    const template = { ...importedFile.template, name: importedName() };
    applyTemplate(template, { resetSampleData: true, keepGalleryOpen: true });
    trackEvent('activation', 'file');
    return useTemplateStore.getState().template;
  };

  /** Kit mode's Browse step is satisfied by a picked SHOW with at least one graphic ticked,
   *  never by a `draft.variantId` — no single design has been chosen at that point. */
  const kitBrowseReady = !!kitPack && kitSelected.length > 0;
  /** Browse showing the Community packs shelf: each card's Install is the step's only action,
   *  so the footer's Next and brand chooser stand down (a brand cannot reach a pack whose
   *  design is fixed), and the rail offers no forward jump. */
  const onShelf = (stepId === 'browse' || stepId === 'kit') && buildMode === 'community';
  const nextDisabled = !canProceed(walkSpec, step, {
    buildMode,
    kitBrowseReady,
    designPicked: !!draft.variantId,
    category: !!draft.category,
    images: draft.importedImages.length,
    file: !!importedFile,
  });

  // The graphic the preview shows: the AI's result, a dropped template as itself (it is the
  // graphic, already finished), or the draft built as real template code.
  const previewGraphic =
    mode === 'ai' ? aiResult?.template ?? null : mode === 'file' ? importedFile?.template ?? null : previewTemplate;
  // FINISH ON A PHONE IS THE ONE EXCEPTION. Stacked, the preview claims a fixed 38vh and the
  // step scrolls in what is left — which put BOTH doors below the fold on arrival, on the one
  // step that exists to offer a choice. Every earlier step had already shown the graphic, and
  // the step's own read-back says what was built, so the actions win the room here.
  const showPreview =
    previewOn(walkSpec, step, !!kit) && !!previewGraphic && !(isMobile && step === finishStep) && !onShelf;
  const railPos = railIndex(walkSpec, step);
  /** Forward and Back mean something different for a kit at three points. Leaving the Kit step
   *  BUILDS the set and opens the hub; Back from a graphic's first editing step and Next from
   *  its last both return to the hub, because a kit is edited graphic by graphic in any order,
   *  not walked. Everything in between is an ordinary step of the open graphic. */
  const goToStep = (delta: number) => {
    if (delta > 0 && mode === 'template' && buildMode === 'kit' && step === 1) {
      buildFromKitStep();
      return;
    }
    if (kit && ((delta < 0 && step === 2) || (delta > 0 && step === animStep))) {
      moveKitTo(finishStep);
      return;
    }
    // Back from the hub is the Kit step: the contents are what a user goes back to change.
    if (kit && delta < 0 && step === finishStep) {
      moveKitTo(1);
      return;
    }
    const target = stepAfter(walkSpec, step, delta);
    if (kit) moveKitTo(target);
    else setStep(target);
  };

  /* Finish's read-back rows are clickable: each goes back to the step it was decided on, by the
     decision it names (the walk table's `summary`), never by a step number. */
  const editSummaryStep = (key: SummaryStepKey) => {
    const target = summaryStep(walkSpec, key);
    if (target !== null) setStep(target);
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
    // The walk's first working step. A kit graphic is recorded on the way off it, as on every
    // other move (`moveKitTo`).
    const target = 1;
    if (kit) moveKitTo(target);
    else setStep(target);
  };

  /* The step footer. It belongs to the CENTRE COLUMN, not to the whole sheet: the preview
     beside it carries its own transport, and a footer spanning both put Next under the
     graphic rather than under the form it advances (re-design/handoff.md §2). */
  const wizardFooter = (
    <div className="wz-footer">
      {step > 0 && (
        <button className="wz-back" onClick={() => goToStep(-1)}>
          {/* A kit's first editing step goes back to the hub, and says so. */}
          {kit && step === 2 ? '← All graphics' : '← Back'}
        </button>
      )}
      {/* OFFERED ONLY WHERE THE BRAND CAN REACH THE GRAPHIC (owner, 2026-09-03: do not offer
          things that do nothing). Two modes have nowhere to put a palette or a typeface, and
          each says so in its own factory: a VIDEO project's fields are prompt, engine, size and
          assets (`createDefaultVideoProject`, model/videoTypes.ts), with no colours and no faces;
          and a dropped template FILE is applied byte-faithfully with the name as the only edit.
          Ticking the box in either wrote a palette into the draft that nothing downstream ever
          read. */}
      {/* WITH NO BRANDS THERE IS NO CONTROL, not a disabled one (docs/BRAND_PLAN.md decision 1):
          an empty chooser is a promise the install cannot keep, and the door to making one is
          Home, not here. */}
      {brandChoices.length > 0 && offersBrand(walkSpec, step) && !onShelf && (
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
          doors decide where the graphic goes. It stands down ON Finish, whose door cards
          ARE the actions.
          DESIGN/SVG/IMPORT take the same shortcut from the step their walk first has a
          graphic on. There is no straight-to-code "Create project" any more: no wizard
          control opens the old code editor (owner, 2026-09-21 and 2026-09-24).
          KIT stands down for the same reason as Finish: its own Create IS the action. */}
      {offersSkip(walkSpec, step, buildMode) && (
        <button
          className="wz-skip"
          disabled={mode === 'template' ? !draft.variantId : !previewTemplate}
          onClick={() => setStep(finishStep)}
          title="Happy with the defaults? Jump straight to naming it and choosing where it goes"
          data-testid="wz-skip-to-finish"
        >
          Skip to finish
        </button>
      )}
      {/* AI's Create step advances to Finish once a valid result stands. Its doors live
          there, same as every catalog mode. */}
      {stepId === 'create' && (
        <button
          className="primary wz-next"
          disabled={!aiResult?.valid}
          onClick={() => goToStep(1)}
          title={aiResult && !aiResult.valid ? 'The result has validation errors. Refine or regenerate it first.' : undefined}
        >
          Next →
        </button>
      )}
      {mode !== 'ai' && mode !== 'video' && step > 0 && step < finishStep && !onShelf && (
        <button className="primary wz-next" disabled={nextDisabled} onClick={() => goToStep(1)}>
          {/* A kit's buttons say where they go: the Kit step builds the set, and the last
              editing step is done with this graphic and returns to all of them. */}
          {mode === 'template' && buildMode === 'kit' && step === 1 && kitPack
            ? kit && kit.pack.id === kitPack.id
              ? 'Back to the kit →'
              : `Build ${kitSelected.length} graphic${kitSelected.length === 1 ? '' : 's'} →`
            : kit && step === animStep
            ? 'Done →'
            : 'Next →'}
        </button>
      )}
    </div>
  );

  // Ordering: imported images put logo-slot designs first; a matched brand puts its
  // style family first (so the package's siblings lead).
  const orderedVariants = [...(catalog?.variantsFor(draft.category) ?? [])].sort((a, b) => {
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
          {/* THE SHELL NAV, the same group Home's topbar wears (owner, 2026-09-28): logo, Home,
              + New graphic, in the same positions to the pixel, so moving between Home and the
              wizard never moves a door. The page you stand on is marked current and is NOT a
              button - here that is + New graphic on the front page (Entry). The logo is the SITE
              ROOT; Home has to stay one press from every step (✕ only rewinds to the front
              page). Mid-walk + New graphic is a guarded START-OVER - `#/new` through
              requestSwitch rewinds to the front page with the draft kept, so Back returns to the
              step; ✕ stays the door that discards. */}
          <nav className="shell-nav" aria-label="Studio">
            <a className="brand brand-home" href="/" title="NoaCG Studio front page">
              <BrandLogo size={24} />
            </a>
            <span className="divider-dot" aria-hidden="true">·</span>
            <button
              className="shell-door wz-home"
              data-testid="wz-home"
              title="Home: your graphics, productions, control panels and videos"
              onClick={() => {
                leaveGallery();
                useRouter.getState().navigate({ view: 'home', section: null });
              }}
            >
              Home
            </button>
            <NewGraphicButton
              className="shell-door wz-new"
              testid="wz-new-graphic"
              title="Start a new graphic - back to the wizard's front page"
              current={step === 0}
            />
          </nav>
          {/* WHAT IS BEING MADE, once a card has said: the crumb continues from the current
              door (+ New graphic › Create with AI › the design). On Entry nothing is chosen
              yet and the current door already says "New graphic", so the crumb stands down. */}
          {step > 0 && (
            <div className="wz-title">
              <span className="wz-title-sep" aria-hidden="true">›</span>
              <span className="wz-title-step">
                {mode === 'ai' ? 'Create with AI'
                  : mode === 'video' ? 'Video with AI'
                  : mode === 'design' || mode === 'svg' || mode === 'file' ? 'Import graphics'
                  : kit ? `${kit.pack.name} kit`
                  : 'Start from a template'}
              </span>
              {/* Once a design is chosen it names the thing being built, so the header answers
                  "what am I working on" without the reader looking at the preview. */}
              {variant && step < finishStep && <span className="wz-title-doc">· {variant.name}</span>}
            </div>
          )}
          {/* HOW FAR ALONG — from the SECOND step onward. On Entry there is no answer to give:
              no mode is chosen yet, so the denominator is not even the same number for every
              door (Create with AI is 3 steps, a kit is 2), and "Step 1 / 6" on a screen whose
              whole question is "which of these four" states a walk the reader has not picked.
              The count comes from the ACTIVE MODE's own step list, which is what makes it
              true once it does appear. */}
          {step > 0 && (
            <span className="wz-stepcount" data-testid="wz-stepcount">
              Step <b>{railPos + 1}</b> / {walkSpec.steps.length}
            </span>
          )}

          {/* The feedback door belongs to the HEADER, so it is reachable from the first step
              rather than only from the one at the end - the wizard is the student release's
              own surface, and somebody who gets lost on Browse never reaches Finish to say so.
              Its push is the chain in styles.css (.wz-stepcount ~ .fb-open ~ .gallery-close),
              since the step counter is absent on Entry and this button is absent offline. */}
          <BetaFeedbackButton area="wizard" />

          {/* THE ACCOUNT, the same control every other bar carries. The wizard is where the
              landing's "Start creating" puts a first-time visitor, full screen over the studio,
              so without it a signed-out reader had no way to sign in or make an account and no
              word that they were signed out at all. It renders nothing offline. */}
          <AuthStatus />

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
            stepId === 'text' ? ' wz-body-working' : ''
          }`}
        >
          {/* The entry is a MENU, not the first committed step of every possible walk. Until
              a card is chosen there is no truthful step list or denominator, so the complete
              rail stands down and its 216px returns to the menu. It appears immediately on
              every chosen path, including the phone's horizontal form of the same rail. */}
          {step > 0 && <nav className="wz-rail" aria-label="Creation steps">
            <div className="wz-dots">
              {walkSpec.steps.map(({ title: t, sub }, s) => {
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
                    disabled={!railJump(walkSpec, step, s, { onShelf, kitBuilt: !!kit, designPicked: !!draft.variantId })}
                    onClick={() => (kit ? moveKitTo(s) : setStep(s))}
                    title={t}
                  >
                    <span className="wz-dot-num" aria-hidden="true">{done ? '✓' : s + 1}</span>
                    {/* The label is its own element so a PHONE can drop the sub-line and lay
                        the rail out as a horizontal strip of numbered chips. */}
                    <span className="wz-dot-text">
                      <span className="wz-dot-label">{t}</span>
                      <span className="wz-dot-sub">{sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>

            {/* The authored frame, read back where it stays visible for the whole walk. The
                CONTROL itself stays in the step that owns it (the Browse step's picker, the
                AI step's own): one control, one home; this is the reminder plus
                the way back to it. A community pack carries its own frame, so on the shelf
                there is nothing to read back and no picker to go back to. */}
            {!onShelf && <div className="wz-rail-foot">
              <p className="dlg-caption">Project format</p>
              <p className="wz-rail-format">{formatSummary}</p>
              <button className="wz-rail-change" onClick={revealFormatPicker}>Change ▾</button>
            </div>}
          </nav>}

          <div className="wz-main">
          {/* THE KIT TRAY: which graphic of the set is open, and the door to any other. Shown
              on the editing steps; the hub lays the whole set out itself. See KitTray.tsx. */}
          {kit && isKitEditStep(step) && (
            <KitTray
              plan={kit}
              onOpen={(index) => openKitGraphic(index, step)}
              onHub={() => moveKitTo(finishStep)}
              onApplyStyle={kit.items.length > 1 ? () => setKitApplyAsk(true) : undefined}
            />
          )}
          <div className="wz-step" ref={stepRef} data-overflow={stepOverflow || undefined}>
            {/* A step that builds on catalog designs waits for them here (see needsCatalog). */}
            {needsCatalog && !catalog ? <CatalogLoading /> : <>
            {stepId === 'start' && (
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
                onHome={(section = null) => {
                  leaveGallery();
                  useRouter.getState().navigate({ view: 'home', section });
                }}
                onOpenPlayout={(productionId) => {
                  // EntryStep picks the production (the one it names on the card), so the
                  // press opens exactly what the card said it would.
                  closeGallery();
                  useRouter.getState().navigate(
                    productionId ? { view: 'production', id: productionId } : { view: 'home', section: 'productions' },
                  );
                }}
                onNewProduction={async () => {
                  // The same create Home's "New production" card runs, unnamed, so it takes the
                  // model's own "Untitled production" floor, and it waits for the durable write
                  // like every other create path so the production survives a reload. A failed
                  // write says so and lands on the list, which shows what is actually saved.
                  if (creatingProduction.current) return;
                  creatingProduction.current = true;
                  const { show, error: written } = createShowNamedChecked('');
                  const error = written ?? (await commitDurableWrites());
                  creatingProduction.current = false;
                  if (error) {
                    raiseStorageAlert({
                      action: `Creating the production “${show.name}”`,
                      error,
                      outcome: 'Nothing was added. Free some room, then press “New production” again.',
                    });
                  }
                  closeGallery();
                  useRouter.getState().navigate(
                    error ? { view: 'home', section: 'productions' } : { view: 'production', id: show.id },
                  );
                }}
              />
            )}
            {stepId === 'video' && (
              <VideoStep
                format={draftFormatSelection(draft)}
                onFormat={(selection) => patch(formatDraftPatch(selection))}
                onCreate={createVideo}
                onOpen={createVideo}
              />
            )}
            {/* AiStep stays MOUNTED across the Create → Finish move (hidden on Finish), so
                stepping to the doors and back never discards the thread, the three directions,
                or the refinement history — none of which is lifted into the draft. */}
            {mode === 'ai' && (stepId === 'create' || stepId === 'finish') && (
              <div hidden={stepId === 'finish'}>
                <Suspense fallback={<CatalogLoading />}>
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
                    // THERE IS NO CODE EDITOR TO OPEN (owner, 2026-09-21 and 2026-09-24), so the
                    // file takes the Import graphic card's road instead: `file` mode's Finish,
                    // whose doors apply it exactly as written. The reader has already confirmed
                    // its project format on this card, so the detection is certain.
                    setImportedFile({
                      template: imported,
                      detection: { resolution: imported.resolution, fps: imported.fps, certain: true, messages: [] },
                    });
                    setImportedFileError(null);
                    setMode('file');
                    setStep(stepIndex(walkOf('file', false), 'finish'));
                  }}
                  onUseTemplates={(images) => {
                    // Skip the AI: design AROUND the images with the catalog — the existing
                    // images -> category -> template-picker continuation (logo-slot first).
                    patch({ importedImages: images, logoAssetPath: images[0]?.path ?? null });
                    setMode('import');
                  }}
                />
                </Suspense>
              </div>
            )}
            {(stepId === 'artwork' || stepId === 'file') && (
              <ImportDesignStep
                svg={draft.designSvg}
                onSvg={(result) => {
                  patch({
                    ...svgDropPatch(result, { resolution: draftResolution(draft), previous: draft }),
                    ...brandOrClearPatch(brand),
                  });
                  // The walk changes shape the moment the file is read: an SVG has nothing
                  // to erase and nothing to place — its one setup step is the mapping.
                  setMode('svg');
                }}
                onClearSvg={() => {
                  patch(clearSvgPatch(draft));
                  setMode('design');
                }}
                templateFile={importedFile}
                onTemplateFile={(file) => {
                  setImportedFileError(null);
                  void templateFileDropped(file, { importTemplateFile }).then((read) => {
                    if (!read.ok) {
                      setImportedFileError(read.error);
                      return;
                    }
                    setImportedFile(read.file);
                    // The walk changes shape the moment the file is read: a template has no
                    // artwork to prepare and no field to place.
                    setMode('file');
                  });
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
                  patch({ ...artDropPatch(designArt, importedImages), ...brandOrClearPatch(brand) });
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
            {stepId === 'images' && (
              <ImportStep
                images={draft.importedImages}
                draft={draft}
                onDraft={patch}
                onImages={(importedImages) =>
                  patch({ importedImages, logoAssetPath: importedImages[0]?.path ?? null })
                }
                onContinue={(category) => {
                  patch({ category });
                  setStep(stepIndex(walkSpec, 'template'));
                }}
              />
            )}
            {(stepId === 'browse' || stepId === 'kit') && (
              <Suspense fallback={<CatalogLoading />}>
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
                    // Motion and the steps decision too, as on the images walk's Template step.
                    animation: { presetId: null, outPresetId: null, steps: null },
                    // The chosen brand carries its look into every new graphic.
                    ...brandOrClearPatch(brand),
                  })
                }
                onAi={() => { setMode('ai'); setStep(1); }}
                // Ranking context, not a filter: with the footer's brand toggle on, the
                // package's siblings lead the results (proposal §13.3).
                brandFamily={brand ? brand.styleTag : null}
                buildMode={buildMode}
                onBuildMode={setBuildMode}
                kitPack={kitPack}
                kitSelected={kitSelected}
                // A new kit brings its OWN starter. Picking the kit that is already built
                // brings back the contents it was built with, not the starter again.
                onKitPack={(pack) => {
                  setKitPack(pack);
                  setKitSelected(kit && kit.pack.id === pack.id ? kitKeys(kit) : defaultSelectionFor(pack));
                }}
                onKitSelected={setKitSelected}
                // A community pack installs as a ready production with no editing step, so
                // the wizard closes and the production opens, as a kit's first door does.
                onPackInstalled={(show) => {
                  closeGallery();
                  useRouter.getState().navigate({ view: 'production', id: show.id });
                }}
              />
              </Suspense>
            )}
            {stepId === 'text' && draft.designArt && (
              <PlaceFieldsStep
                art={draft.designArt}
                draft={draft}
                onDraft={patch}
                onBackToPrepare={() => setStep(stepIndex(walkSpec, 'prepare'))}
              />
            )}
            {/* The SVG walk's one setup step: which text layers the operator can edit. */}
            {stepId === 'map' && draft.designSvg && (
              <MapSvgFieldsStep
                draft={draft}
                onDraft={patch}
                onHover={setSvgHoverId}
                onBoxOverlay={setSvgBoxOverlay}
                onGrowCaps={setSvgGrowCaps}
                onArmCap={armSvgCap}
                onArmDraw={armSvgDraw}
                onArmPick={armSvgPick}
              />
            )}
            {stepId === 'prepare' && draft.designArt && (
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
            {stepId === 'template' && (
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
                    ...brandOrClearPatch(brand),
                  })
                }
              />
            )}
            {/* The catalog walks' later steps; Animation is every animated walk's. */}
            {stepId === 'fields' && variant && (
              <Suspense fallback={<CatalogLoading />}><FieldsStep variant={variant} draft={draft} onDraft={patch} /></Suspense>
            )}
            {stepId === 'style' && variant && (
              <StyleStep variant={variant} draft={draft} onDraft={patch} builtCss={previewTemplate?.css ?? null} markWarning={markWarning} />
            )}
            {stepId === 'animation' && variant && (
              <AnimationStep
                variant={variant}
                template={previewTemplate}
                draft={draft}
                onDraft={patch}
                onReplay={() => setReplayKey((k) => k + 1)}
              />
            )}
            {/* THE KIT'S HUB: every graphic of the set, each one click from editing, the way
                back to its contents, and the production doors. */}
            {stepId === 'finish' && kit && (
              <KitFinishStep
                name={kitProductionName}
                namePlaceholder={kit.pack.name}
                onName={setKitProductionName}
                built={kit.built}
                onOpen={(index) => openKitGraphic(index)}
                onEditContents={() => moveKitTo(1)}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                onOpenProduction={(dest) => void doors.openSet(saveKit, dest)}
                onExport={(dest) => void doors.exportSet(saveKit, dest)}
                busy={kitBusy}
                error={kitError}
              />
            )}
            {/* A finished template file: the same three doors, over code we did not write. */}
            {stepId === 'finish' && mode === 'file' && importedFile && (
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
                onAddToProduction={(dest) => void doors.addToProduction(applyImportedFile, dest, importedName)}
                onEditArtwork={() => void doors.editArtwork(applyImportedFile)}
                onExport={() => void doors.export(applyImportedFile, importedName)}
                busy={false}
              />
            )}
            {/* Finish — shared by every catalog-shaped mode, design included. */}
            {stepId === 'finish' && !kit && mode !== 'ai' && mode !== 'file' && variant && (
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
                onAddToProduction={(dest) => void doors.addToProduction(applyDraftProject, dest, catalogName)}
                onEditArtwork={() => void doors.editArtwork(applyDraftProject)}
                onExport={() => void doors.export(applyDraftProject, catalogName)}
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
            {stepId === 'finish' && mode === 'ai' && aiResult && aiPack() && (
              <KitFinishStep
                name={draft.name}
                namePlaceholder={aiResult.template.name}
                onName={(name) => patch({ name })}
                built={aiPack()!}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                // A Pro user never chose a "kit" - they asked for a channel's look and got the
                // graphics built in it.
                noun="package"
                onOpenProduction={(dest) => void doors.openSet(saveAiPack, dest)}
                onExport={(dest) => void doors.exportSet(saveAiPack, dest)}
                busy={kitBusy || !aiResult.valid}
                error={kitError}
              />
            )}
            {stepId === 'finish' && mode === 'ai' && aiResult && !aiPack() && (
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
                onAddToProduction={(dest) => void doors.addToProduction(applyAiProject, dest, aiName)}
                onExport={() => void doors.export(applyAiProject, aiName)}
                busy={!aiResult.valid}
              />
            )}
            </>}
            <div className="wz-step-fade" aria-hidden="true" />
          </div>
          {wizardFooter}
          </div>

          {showPreview && previewGraphic && (
            <aside className="wz-side">
              <WizardPreview
                template={previewGraphic}
                replayKey={replayKey}
                demoOut={demoOut}
                rehearse={onAnimationStep}
                demoText={mode === 'design' ? stretchDemo : null}
                {...(stepId === 'map'
                  ? {
                      highlightSelector: svgHoverId ? `[${SVG_CANDIDATE_ATTR}="${svgHoverId}"]` : null,
                      boxOverlay: svgBoxOverlay,
                      // The growth limits, and the artwork they are fractions OF. The rule's own
                      // cap is measured against the artwork's frame (`svgGrowCap`), so the line
                      // has to be drawn against exactly that element and no other.
                      growCaps: svgGrowCaps,
                      capIn: '.imported-design-art',
                      onCapDrag: onSvgCapDrag,
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

      {kitSwitchAsk && kit && kitPack && (
        <WizardConfirm
          title={`Start the ${kitPack.name} kit?`}
          confirmLabel={`Start ${kitPack.name}`}
          cancelLabel={`Keep ${kit.pack.name}`}
          onConfirm={() => {
            setKitSwitchAsk(false);
            void buildKitAndOpenHub(kitPack, kitSelected);
          }}
          onCancel={() => {
            // Keeping the edited kit puts the picker back on it, as it was built.
            setKitSwitchAsk(false);
            setKitPack(kit.pack);
            setKitSelected(kitKeys(kit));
          }}
          testid="kit-switch-confirm"
        >
          <p className="wz-confirm-lead">
            You have edited graphics in the <strong>{kit.pack.name}</strong> kit.
          </p>
          <div className="wz-confirm-warn">
            Starting {kitPack.name} builds a new set of graphics, and the {kit.pack.name} edits are
            not kept.
          </div>
        </WizardConfirm>
      )}

      {kitApplyAsk && kit && (
        <WizardConfirm
          title="Apply this Style to the whole kit?"
          confirmLabel={`Apply to ${kit.items.length - 1} graphic${kit.items.length === 2 ? '' : 's'}`}
          cancelLabel="Not now"
          onConfirm={applyKitStyle}
          onCancel={() => setKitApplyAsk(false)}
          testid="kit-apply-confirm"
        >
          <p className="wz-confirm-lead">
            The other {kit.items.length - 1} graphic{kit.items.length === 2 ? '' : 's'} in{' '}
            <strong>{kit.pack.name}</strong> take this one's Style: <strong>{lookSummary()}</strong>.
          </p>
          <ul>
            <li>Their colours, typeface, sizes and motion change to match.</li>
            <li>Their text and placement stay as they are.</li>
            <li>You can still change any graphic on its own afterwards.</li>
          </ul>
        </WizardConfirm>
      )}

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
