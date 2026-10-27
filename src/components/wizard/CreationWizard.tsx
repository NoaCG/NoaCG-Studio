import { Suspense, useCallback, useEffect, useMemo, useReducer, useRef, useState, type SetStateAction } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { CatalogLoading, lazyStep, useCatalog } from '../catalogOnDemand';
import {
  brandOrClearPatch,
  buildDraftTemplate,
  draftFormatSelection,
  draftName,
  draftResolution,
  formatDraftPatch,
  type DraftPatch,
} from './draft';
import { commitStagedSelection } from '../../ai/preferences';
import { formatTemplate } from '../../format/formatCode';
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
import KitTray from './template/KitTray';
import KitFinishStep from './steps/KitFinishStep';
import type { BrowseFilters } from '../../templates/browseFilters';
import type { AiThread } from '../../model/aiThread';
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
import { importDroppedTemplate, isForeignGraphic } from './templateFile';
import { useExportUi } from '../ExportWindow';
import { useMarkLegibility } from './useMarkLegibility';
import type { SpxTemplate } from '../../model/types';
import { clearSpecDraft } from '../../model/generationSpec';
import type { VideoProject } from '../../model/videoTypes';
import { useVideoProjectStore } from '../../store/videoProjectStore';
import { useDocKindStore } from '../../store/docKindStore';
import { useModalGate } from '../spaceKey';
import { useIsMobile } from '../useIsMobile';
import { useRouter, type Route } from '../../app/router';
import { openNewEditor } from '../editorFoundation/openNewEditor';
import NewGraphicButton from '../NewGraphicButton';
import { saveCurrentGraphic, saveGraphicAs } from '../../store/saveActions';
import { graphicNameIndex, librarySaveEffect, type LibraryNameEntry } from '../../model/library';
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
import {
  canProceed,
  isShelf,
  needsCatalogOn,
  offersBrand,
  offersSkip,
  previewOn,
  railIndex,
  railJump,
  slugIndex,
  stepIndex,
  summaryStep,
  walkOf,
} from './shell/walks';
import { makeDoors } from './shell/doors';
import {
  activeKit,
  brandOf,
  emptyWalk,
  noteMade,
  reduce,
  rememberWalk,
  saveBuiltGraphic,
  type FinishedWalk,
  type LibraryIo,
  type WalkMemory,
} from './shell/walkState';
import { useWalkLifecycle } from './shell/useWalkLifecycle';
import { useKit } from './template/useKit';
import KitConfirms from './template/KitConfirms';

// The steps that list or build on catalog designs load with the catalog, never with the wizard:
// the Entry step must open without it (components/catalogOnDemand.tsx).
const BrowseStep = lazyStep(() => import('./steps/BrowseStep'));
const FieldsStep = lazyStep(() => import('./steps/FieldsStep'));
const AiStep = lazyStep(() => import('./ai/AiStep'));

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

/** The library as the walk's save sees it (shell/walkState.ts `saveBuiltGraphic`). */
const LIBRARY_IO: LibraryIo = {
  index: graphicNameIndex,
  effect: librarySaveEffect,
  linkTo: (id) => useTemplateStore.getState().setSaved({ graphicId: id, dirty: true, status: 'idle' }),
  saveCurrent: (name) => saveCurrentGraphic({ name }),
  saveAs: (name) => saveGraphicAs(name, { kind: 'standalone' }),
};

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
  // Has the created graphic been touched since the door saved it? The app's own answer, so the
  // walk-back warning promises to write over hand edits only when there are some. A door that
  // saved nothing (the editor one) reads dirty from birth, which is the right answer there too.
  const workingDirty = useTemplateStore((s) => s.saved.dirty);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);

  const isMobile = useIsMobile();
  // THE WALK: one record, one reducer (shell/walkState.ts), every open, rewind, restore and close
  // one of its tested transitions. The brand in force and the kit acting are DERIVED from it.
  const [walk, dispatch] = useReducer(reduce, undefined, emptyWalk);
  const { draft, mode, step, browseFilters, aiResult, aiThread, importedFile, importedFileError } = walk;
  const { contextProductionId, brandChoices, brandId, buildMode } = walk;
  const kit = activeKit(walk);
  const brand = brandOf(walk);
  // Stable, as the steps hold them in effects and as functional updates (BrowseStep's chips).
  const onFilters = useCallback((update: SetStateAction<BrowseFilters>) => dispatch({ type: 'filters', update }), []);
  const onThread = useCallback((thread: AiThread | null) => dispatch({ type: 'ai', thread }), []);
  const [replayKey, setReplayKey] = useState(0);
  const acceptedAiGeneration = useRef<string | null>(null);
  // A generation answers only into the walk it started in (#1165): an intent that resets the
  // screen (the ✕'s rewind, a fresh open, a restore) aborts this, so a late answer is dropped.
  // Home and Continue reset nothing, so an answer after Home still lands in the held walk.
  const [aiWalk, setAiWalk] = useState(() => new AbortController());
  // ── BACK INTO THE WALK ──
  // The walk the last door closed the wizard on, and the graphic this stretch of wizard made. A
  // REF, not state: it has to survive the closed wizard's null render, and the save reads it
  // across awaits, where a value captured at render would be stale under a second press.
  const memory = useRef<WalkMemory>({ finished: null, made: null });
  // The walk being offered back, which IS on screen — the warning naming what re-entering
  // resets. Null while nothing is being asked.
  const [resumeAsk, setResumeAsk] = useState<FinishedWalk | null>(null);
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
  // THE KIT (template/useKit.ts): its moves, its tray, hub and questions, its transient UI.
  const kitOps = useKit({ state: walk, dispatch, walk: walkSpec, brand });
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
      dispatch({ type: 'go', step: idx >= 0 ? idx : 0 });
    }
  }, [open, route, stepKey, walkSpec]);

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

  // A `#/new/<designId>` deep link's one-shot design: the catalog has to load for it.
  const pendingDesignId = useTemplateStore((s) => s.pendingDesignId);
  // The catalog loads once a step lists designs, the draft names a catalog design, or a deep
  // link does (which holds Entry until it resolves, so nothing done there is overwritten). The AI
  // step (lazy, so it brings its own), the import doors (their own variants resolve without it)
  // and video never wait for it. Until it arrives the step area shows CatalogLoading.
  const importedVariant = IMPORTED_VARIANTS.find((v) => v.id === draft.variantId);
  const needsCatalog =
    needsCatalogOn(walkSpec, step) || Boolean(pendingDesignId) || (step > 0 && Boolean(draft.variantId) && !importedVariant);
  const catalog = useCatalog(open && needsCatalog);
  // Fresh wizard every time it opens, the walk back into a finished one, Continue, and the close:
  // what each does is the walk's (shell/walkState.ts `transition`), the IO the hook's.
  const { rewind } = useWalkLifecycle({
    open,
    state: walk,
    dispatch,
    memory,
    closedByWizard,
    catalog,
    pendingDesignId,
    resetScreen: () => {
      setStretchDemo(null);
      kitOps.resetScreen();
      aiWalk.abort();
      setAiWalk(new AbortController());
    },
    clearAcceptedAi: () => { acceptedAiGeneration.current = null; },
    setResumeAsk,
  });

  useEffect(() => {
    if (open || !aiResult?.generationId || acceptedAiGeneration.current === aiResult.generationId) return;
    void recordLiteOutcome({ generationId: aiResult.generationId, action: 'discarded', discardReason: 'closed' }).catch(() => undefined);
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

  const { finishStep } = walkSpec;
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
  // walk's own door press, both of which announce `spx-data-changed`) and the made record, a ref
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
  const finishMadeId = memory.current.made?.graphicId ?? null;

  if (!open) return null;

  const patch = (p: DraftPatch) => dispatch({ type: 'patch', patch: p });
  const go = (target: number) => dispatch({ type: 'go', step: target });

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
    if (step === 0) closeGallery();
    else rewind();
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
   * save a SET, not a document), so they still leave the wizard with no way back in.
   * Deliberately out of scope here and recorded in
   * https://github.com/NoaCG/NoaCG-Studio/blob/745c6f2dcd9ce5e82cc6655c652e08f0568800fd/docs/backlog/back-to-the-wizard.md rather than half-wired.
   */
  const remember = () => rememberWalk(memory.current, walk);

  /** Every ending of the walk (shell/doors.ts), each taking the mode's applier below. */
  const doors = makeDoors({
    ...STUDIO_DOOR_IO,
    saveBuiltGraphic: (name) => saveBuiltGraphic(memory.current, name, LIBRARY_IO),
    // The record's id is read from the store, so only once the save has linked it.
    noteMade: (name, production, landedOn = null) => {
      noteMade(memory.current, { name, graphicId: useTemplateStore.getState().saved.graphicId, production, landedOn });
      // A REF the Finish step reads: nothing re-renders on its own, and the step is still on
      // screen after the export door (the production door routes away instead).
      rereadFinish();
    },
    closeGallery,
    productionPress: addingToProduction,
    setSetBusy: kitOps.setBusy,
    setSetError: kitOps.setError,
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
    remember();
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
   * Build the drafted graphic and make it the working project. EVERY Finish door goes through
   * here — including the export one, which is what keeps the two endings byte-identical: the
   * editor path formats through Prettier (applyGenerated), so an export path that skipped it
   * would ship different HTML for the same choices.
   *
   * Returns the applied template (read back from the store, post-format) or null.
   */
  const applyDraftProject = async (): Promise<SpxTemplate | null> => {
    if (!previewTemplate || !variant) return null;
    remember();
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
    remember();
    const template = { ...importedFile.template, name: importedName() };
    applyTemplate(template, { resetSampleData: true, keepGalleryOpen: true });
    trackEvent('activation', 'file');
    return useTemplateStore.getState().template;
  };

  /** A shelf (Browse's Community packs): each card's Install is the step's only action, so the
   *  footer's Next and brand chooser stand down (a brand cannot reach a pack whose design is
   *  fixed), and the rail offers no forward jump. */
  const onShelf = isShelf(walkSpec, step, walk);
  const nextDisabled = !canProceed(walkSpec, step, walk);

  // The graphic the preview shows: the AI's result, a dropped template as itself (it is the
  // graphic, already finished), or the draft built as real template code.
  const previewGraphic =
    mode === 'ai' ? aiResult?.template ?? null : mode === 'file' ? (isForeignGraphic(importedFile?.template) ? null : importedFile?.template ?? null) : previewTemplate;
  // FINISH ON A PHONE IS THE ONE EXCEPTION. Stacked, the preview claims a fixed 38vh and the
  // step scrolls in what is left — which put BOTH doors below the fold on arrival, on the one
  // step that exists to offer a choice. Every earlier step had already shown the graphic, and
  // the step's own read-back says what was built, so the actions win the room here.
  const showPreview =
    previewOn(walkSpec, step, walk) && !!previewGraphic && !(isMobile && step === finishStep) && !onShelf;
  const railPos = railIndex(walkSpec, step);
  /* Finish's read-back rows are clickable: each goes back to the step it was decided on, by the
     decision it names (the walk table's `summary`), never by a step number. */
  const editSummaryStep = (key: SummaryStepKey) => {
    const target = summaryStep(walkSpec, key);
    if (target !== null) go(target);
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
    // other move.
    kitOps.moveTo(1);
  };

  /* The step footer. It belongs to the CENTRE COLUMN, not to the whole sheet: the preview
     beside it carries its own transport, and a footer spanning both put Next under the
     graphic rather than under the form it advances (re-design/handoff.md §2). */
  const wizardFooter = (
    <div className="wz-footer">
      {step > 0 && (
        <button className="wz-back" onClick={() => kitOps.stepBy(-1)}>
          {/* A kit's first editing step goes back to the hub, and says so. */}
          {kitOps.backLabel ?? '← Back'}
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
            onChange={(e) => dispatch({ type: 'chooseBrand', id: e.target.value || null })}
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
      {offersSkip(walkSpec, step, walk) && (
        <button
          className="wz-skip"
          disabled={mode === 'template' ? !draft.variantId : !previewTemplate}
          onClick={() => go(finishStep)}
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
          onClick={() => kitOps.stepBy(1)}
          title={aiResult && !aiResult.valid ? 'The result has validation errors. Refine or regenerate it first.' : undefined}
        >
          Next →
        </button>
      )}
      {mode !== 'ai' && mode !== 'video' && step > 0 && step < finishStep && !onShelf && (
        <button className="primary wz-next" disabled={nextDisabled} onClick={() => kitOps.stepBy(1)}>
          {/* A kit's buttons say where they go: the Kit step builds the set, and the last
              editing step is done with this graphic and returns to all of them. */}
          {kitOps.nextLabel ?? 'Next →'}
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
                    disabled={!railJump(walkSpec, step, s, walk)}
                    onClick={() => kitOps.moveTo(s)}
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
          {kitOps.tray && <KitTray {...kitOps.tray} />}
          <div className="wz-step" ref={stepRef} data-overflow={stepOverflow || undefined}>
            {/* A step that builds on catalog designs waits for them here (see needsCatalog). */}
            {needsCatalog && !catalog ? <CatalogLoading /> : <>
            {stepId === 'start' && (
              <EntryStep
                onTemplates={() => dispatch({ type: 'walk', mode: 'template', step: 1 })}
                onImportGraphic={() => {
                  // Entering the flow again starts it: a template file left over from a
                  // previous pass would otherwise re-appear on a walk the user restarted,
                  // with the artwork branch's steps around it.
                  dispatch({ type: 'file', file: null, error: null });
                  dispatch({ type: 'walk', mode: 'design', step: 1 });
                }}
                onAi={() => dispatch({ type: 'walk', mode: 'ai', step: 1 })}
                onVideo={() => {
                  if (!draft.formatTouched) patch(DEFAULT_VIDEO_FORMAT);
                  dispatch({ type: 'walk', mode: 'video', step: 1 });
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
                  onResult={(template, valid, spec, generationId, path, pack) => aiWalk.signal.aborted ||
                    dispatch({ type: 'ai', result: template ? { template, valid, spec, generationId, path, pack: pack ?? null } : null })}
                  onThread={onThread}
                  onOpenImported={(imported) => {
                    // THERE IS NO CODE EDITOR TO OPEN (owner, 2026-09-21 and 2026-09-24), so the
                    // file takes the Import graphic card's road instead: `file` mode's Finish,
                    // whose doors apply it exactly as written. The reader has already confirmed
                    // its project format on this card, so the detection is certain.
                    dispatch({
                      type: 'file',
                      file: {
                        template: imported,
                        detection: { resolution: imported.resolution, fps: imported.fps, certain: true, messages: [] },
                      },
                      error: null,
                    });
                    dispatch({ type: 'walk', mode: 'file', step: stepIndex(walkOf('file', false), 'finish') });
                  }}
                  onUseTemplates={(images) => {
                    // Skip the AI: design AROUND the images with the catalog — the existing
                    // images -> category -> template-picker continuation (logo-slot first).
                    patch({ importedImages: images, logoAssetPath: images[0]?.path ?? null });
                    dispatch({ type: 'walk', mode: 'import' });
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
                  dispatch({ type: 'walk', mode: 'svg' });
                }}
                onClearSvg={() => {
                  patch(clearSvgPatch(draft));
                  dispatch({ type: 'walk', mode: 'design' });
                }}
                templateFile={importedFile}
                onTemplateFile={(file) => {
                  dispatch({ type: 'file', error: null });
                  void templateFileDropped(file, { importTemplateFile: importDroppedTemplate }).then((read) => {
                    if (!read.ok) {
                      dispatch({ type: 'file', error: read.error });
                      return;
                    }
                    dispatch({ type: 'file', file: read.file });
                    // The walk changes shape the moment the file is read: a template has no
                    // artwork to prepare and no field to place.
                    dispatch({ type: 'walk', mode: 'file' });
                  });
                }}
                onClearTemplate={() => {
                  dispatch({ type: 'file', file: null, error: null });
                  dispatch({ type: 'walk', mode: 'design' });
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
                  dispatch({ type: 'walk', mode: 'design' });
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
                  go(stepIndex(walkSpec, 'template'));
                }}
              />
            )}
            {(stepId === 'browse' || stepId === 'kit') && (
              <Suspense fallback={<CatalogLoading />}>
              <BrowseStep
                draft={draft}
                filters={browseFilters}
                onFilters={onFilters}
                onDraft={patch}
                // One pick patch for Browse, the images walk's Template step and a deep link
                // (walkState.ts `pickPatch`).
                onPickVariant={(v) => dispatch({ type: 'pickDesign', variant: v })}
                onAi={() => dispatch({ type: 'walk', mode: 'ai', step: 1 })}
                // Ranking context, not a filter: with the footer's brand toggle on, the
                // package's siblings lead the results (proposal §13.3).
                brandFamily={brand ? brand.styleTag : null}
                {...kitOps.picker}
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
                onBackToPrepare={() => go(stepIndex(walkSpec, 'prepare'))}
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
                // The same pick as Browse and a deep link (walkState.ts `pickPatch`): the logo,
                // motion and steps decisions belong to the picked design, the brand carries.
                onPickVariant={(v) => dispatch({ type: 'pickDesign', variant: v })}
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
            {stepId === 'finish' && kitOps.hub && (
              <KitFinishStep
                {...kitOps.hub}
                productions={finishProductions}
                defaultProductionId={contextProductionId}
                onOpenProduction={(dest) => void doors.openSet(kitOps.save(doors.saveSet), dest)}
                onExport={(dest) => void doors.exportSet(kitOps.save(doors.saveSet), dest)}
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
                fields={importedFile.template.fields.map((f) => f.field)} packageOnly={isForeignGraphic(importedFile.template)}
                defaultProductionId={contextProductionId}
                madeId={finishMadeId}
                onAddToProduction={(dest) => void doors.addToProduction(applyImportedFile, dest, importedName)}
                onEditArtwork={isForeignGraphic(importedFile.template) ? undefined : () => void doors.editArtwork(applyImportedFile)}
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
                busy={kitOps.busy || !aiResult.valid}
                error={kitOps.error}
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

      <KitConfirms kit={kitOps} draft={draft} variant={variant} />

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
