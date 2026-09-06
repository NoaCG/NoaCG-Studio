import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import { zoneDecls } from '../../templates/shared/base';
import { nextFieldId, setCssDeclaration, setFieldDefault } from '../../blocks/edit';
import { getCssVariable, setCssVariable } from '../../model/cssVars';
import type { Zone9 } from '../../model/wizard';
import type { SpxTemplate } from '../../model/types';
import { detectPrefix, getTemplateParts, type TemplatePart } from '../../model/structure';
import { parseAnimData, type AnimData } from '../../blocks/animData';
import { lensRead, lensWrite, scrubPhase } from '../../blocks/timelineLens';
import { writeAnimData } from '../../templates/shared/animRuntime';
import { setKeyframe } from '../../blocks/animEdit';
import { activationStep } from '../../blocks/animEval';
import { changePartPress } from '../../blocks/stepAssign';
import { createStepFromLayer } from '../../blocks/layerTimeline';
import { useInsertTemplateUi } from '../InsertTemplateDialog';
import { addPlacedLine, designBoxInfo, lineFit, lineFontSize, placedLines, placeLine, placementCss, setLineFit, setLineFontSize, setSlotSize, slotSize, type LinePlacement } from '../../blocks/designLayout';
import { insertImageElement, insertVideoElement } from '../../blocks/assetOps';
import { insertLottieElement } from '../../blocks/lottieInsert';
import { probeAsset } from '../../assets/assetInfo';
import { MAX_VIDEO_ASSET_BYTES, fileToDataUrl, isImageAsset, isLottieAsset, isVideoAsset, uniqueAssetPath } from '../../assets/assetUtils';
import { importImageFile } from '../../assets/imageImport';
import { ASSET_DRAG_TYPE } from '../AssetsPanel';
import CanvasSelection, { type CanvasRect } from './CanvasSelection';
import { partLocked } from './partLocks';
import { editorShortcutsLive } from '../spaceKey';
import { phaseIdOf } from '../timeline/StepTimeline';
import {
  postCanvasCmd,
  queryCanvas,
  CANVAS_RECTS_TYPE,
  type CanvasRect as TrackedRect,
  type CanvasRectsMessage,
} from '../../preview/canvasControlProtocol';
import { useIsMobile } from '../useIsMobile';

interface Props {
  iframeRef: RefObject<HTMLIFrameElement | null>;
  /** On-screen size of the overlay, in CSS pixels. In pasteboard mode this is the padded
   *  document (canvas + pad); the overlay is congruent with the iframe viewport. */
  width: number;
  height: number;
  /** Pasteboard margin, in canvas px (0 = no pasteboard). The overlay and the iframe both span
   *  the padded document, so the coordinate origin is the pasteboard corner ("doc px"); pad is
   *  the constant offset from doc px to canvas-logical px (see the coordinate-space note below). */
  padX?: number;
  padY?: number;
}

interface DragState {
  /** Pointer start, in screen px. */
  startX: number;
  startY: number;
  /** Current pointer delta, in screen px. */
  dx: number;
  dy: number;
  /** Past the threshold — the ghost + zone grid show and release commits. */
  active: boolean;
  /** The graphic root's rect at drag start, in DOC px (the iframe's internal space, which in
   *  pasteboard mode is offset from canvas by pad — converted with docToCanvas at commit). */
  root: { left: number; top: number; width: number; height: number };
}

interface EditState {
  field: string;
  multiline: boolean;
  value: string;
  /** The text element's rect in CANVAS px (scaled to screen px at render time). */
  rect: { left: number; top: number; width: number; height: number };
  /** True for a field the TEXT TOOL just created: committing empty (or Escape) removes the
   *  field again — an empty text object is noise, exactly as in any design application. */
  fresh?: boolean;
  /** The element's text when the edit opened — restored on cancel, because typing mirrors
   *  live into the preview element (the type-on-canvas behaviour). */
  origText?: string;
}

/** A position-keyframe drag on the SELECTED layer(s) — data-block templates. The drag
 *  itself arms: live GSAP x/y preview while dragging, and release commits ONE undoable
 *  apply writing every dragged layer's x+y keyframes at the playhead. Layers contained
 *  in another dragged layer are excluded (the parent's transform carries them). */
interface LayerDrag {
  /** The layers moving together, each with its GSAP x/y at drag start (canvas px). */
  layers: { selector: string; baseX: number; baseY: number }[];
  /** Pointer start, in screen px. */
  startX: number;
  startY: number;
  /** Current pointer delta, in canvas px. */
  dx: number;
  dy: number;
  /** Past the threshold — the layers follow live and release commits keyframes. */
  active: boolean;
}

/** A PLACEMENT drag on selected placed text lines (an imported design's fields): the line's
 *  position is a design decision written in its wrapper's CSS rule, so the drag re-places it
 *  there — live inline left/top preview, ONE undoable CSS patch on release. Never keyframes:
 *  moving a field independently of the artwork it was drawn into is exactly what whole-unit
 *  motion exists to prevent (docs/IMPORT_MVP.md). */
interface PlaceDrag {
  lines: { selector: string; wrapperId: string; baseX: number; baseY: number; scaled: boolean }[];
  /** The computed --scale at drag start (doc px per design px). */
  scaleVar: number;
  /** Pointer start, in screen px. */
  startX: number;
  startY: number;
  /** Current pointer delta, in DESIGN px (the units the CSS rule holds). */
  dx: number;
  dy: number;
  active: boolean;
}

/** A placed field's corner SIZE drag — a DESIGN decision written in its own rules, so the
 *  handle previews it live and commits ONE CSS patch, never a scale keyframe (that would be
 *  motion). Two kinds: 'font' resizes a text line's `#fN` font-size; 'slot' resizes an image
 *  slot's wrapper box (width/height, aspect preserved). */
interface LineSizeDrag {
  kind: 'font' | 'slot' | 'area';
  /** The field element id ('f0') and its positioned wrapper ('fw0'). */
  fieldId: string;
  wrapperId: string;
  /** At drag start, in design px: the font size, or the slot's width (+ baseH height). */
  base: number;
  baseH: number;
  scaled: boolean;
  startX: number; // pointer start, screen px
  startY: number;
  /** The element's on-screen size at drag start — the diagonal-drag reference. */
  refSize: number;
  value: number;
  valueH: number;
  active: boolean;
}

/** A keyboard-nudge burst on the selected layers: each arrow press moves them 1 px (Shift =
 *  10). Placed fields preview through the placement drag's inline left/top channel and commit
 *  placeLine CSS; keyframed layers preview through GSAP x/y and commit position keyframes at
 *  the playhead (the drag's semantics, key by key). The whole burst lands as ONE undoable
 *  apply once the keys go quiet. */
interface NudgeBurst {
  lines: { wrapperId: string; baseX: number; baseY: number; scaled: boolean }[];
  /** Selected non-placed layers, moved on the keyframe channel (GSAP x/y at burst start).
   *  Bases start at 0 and are filled in once the async GSAP-property query resolves (see
   *  `startNudgeBurst`) — a burst that commits before the query answers just moves nothing on
   *  the keyframe channel yet, which self-corrects the moment it lands (same-tab postMessage
   *  resolves long before an OS key-repeat's next tick in practice). */
  keyed: { selector: string; baseX: number; baseY: number }[];
  dx: number;
  dy: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** W2 — a corner scale-handle drag: live --scale preview, one patch on release. */
interface ScaleDrag {
  startX: number;
  startY: number;
  origScale: number;
  /** The root's size at drag start, in screen px (the drag's scaling reference). */
  rootWidth: number;
  rootHeight: number;
  value: number;
}

/** A selected LAYER's scale- or rotate-handle drag (data-block templates): live GSAP preview
 *  on the layer, then one scale/rotation keyframe committed at the playhead on release —
 *  pivoting around the layer's transform-origin (the Inspector pivot). */
interface LayerTransformDrag {
  kind: 'scale' | 'rotate';
  selector: string;
  /** baseScale (unitless) or baseRotation (deg) at drag start. */
  base: number;
  startX: number; // pointer start, screen px
  startY: number;
  /** scale: the layer's size (screen px) — the diagonal-drag reference. */
  refSize: number;
  /** rotate: the layer centre in screen px, and the pointer's initial angle (deg). */
  centerX: number;
  centerY: number;
  startAngle: number;
  value: number;
  active: boolean;
}

// A real drag, not a shaky click (screen px).
const DRAG_THRESHOLD = 4;
// The area-text tool's starter content: enough lorem ipsum to show typography, wrapping,
// and the box's bounds the moment the drag releases (the operator's value replaces it).
const AREA_TEXT_PLACEHOLDER =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
// Sanity bounds for the drag, not a design limit — the Style panel accepts any typed
// value. Generous on purpose: the graphic's own max-width keeps huge scales inside the
// safe area, and 0.25 stops a wild drag from collapsing the graphic to nothing.
const SCALE_MIN = 0.25;
const SCALE_MAX = 4;

/**
 * The direct-manipulation layer over the preview (Era 6 — no modes): hover shows what's
 * grabbable (hand cursor on the graphic, text cursor on editable text), dragging the graphic
 * re-anchors it (nearest 9-zone + residual nudge — the SAME zoneDecls patch the Style panel
 * writes), and double-clicking a text line edits it in place (live sample value + the field's
 * SPX-definition default). Every gesture commits as ONE undoable applyTemplate and then jumps
 * the code editor to the changed tab, where the patched lines are highlighted — canvas editing
 * always shows the code it wrote. Broadcast templates take no pointer input of their own, so
 * this layer never competes with the graphic.
 *
 * On top of the gestures sits the SELECTION model: a click (below the drag threshold)
 * selects the innermost TemplatePart under the point — outline + a chip speaking the
 * registry's `part.label` — clicking the selected part again climbs to its container
 * (panel → whole graphic), and empty canvas or Escape deselects. Selection is editor UI
 * state ONLY: it never writes a byte into the template.
 *
 * The template rendered here can be AI-generated or imported code, so this iframe carries no
 * `allow-same-origin` (composeDocument's `canvasControl` option instead — see
 * preview/canvasControlProtocol.ts for the full protocol design). Every rect this layer used to
 * read via `contentDocument.querySelector(...).getBoundingClientRect()` now comes from a
 * continuous rect-push cache (`rectsRef`) the document reports every animation frame; the
 * handful of reads a rect can't answer (a GSAP-resolved transform value, an element's live text)
 * go through `queryCanvas`, a small correlated request/reply that only ever fires at gesture
 * start or on a double-click — never per pointermove. Every live-preview WRITE (a drag's inline
 * style, a GSAP `.set()`, the `--scale` override, the type-on-canvas mirror) is a fire-and-forget
 * `postCanvasCmd`. Nothing about the gesture MODEL changed — only where a read or write actually
 * executes.
 */
export default function CanvasInteraction({ iframeRef, width, height, padX = 0, padY = 0 }: Props) {
  const template = useTemplateStore((s) => s.template);
  const applyTemplate = useTemplateStore((s) => s.applyTemplate);
  const setActiveTab = useTemplateStore((s) => s.setActiveTab);
  const setSampleValue = useTemplateStore((s) => s.setSampleValue);
  const sampleData = useTemplateStore((s) => s.sampleData);
  const requestReplay = useTemplateStore((s) => s.requestReplay);
  const playhead = useTemplateStore((s) => s.playhead);
  const sendScrub = useTemplateStore((s) => s.sendScrub);
  const setCanvasGestureActive = useTemplateStore((s) => s.setCanvasGestureActive);
  const canvasTool = useTemplateStore((s) => s.canvasTool);
  const setCanvasTool = useTemplateStore((s) => s.setCanvasTool);
  const undo = useTemplateStore((s) => s.undo);

  // Phones and narrow windows: the chip drops its affordance hints there (they describe
  // pointer/keyboard gestures a touch screen doesn't have) — same breakpoint as the layout.
  const isMobile = useIsMobile();

  const [drag, setDrag] = useState<DragState | null>(null);
  const [layerDrag, setLayerDrag] = useState<LayerDrag | null>(null);
  const layerDragRef = useRef<LayerDrag | null>(null);
  layerDragRef.current = layerDrag;
  /** Guards the async GSAP-baseline query that corrects a layer drag's bases in place — a
   *  NEWER drag (or the same one released and restarted) invalidates any in-flight correction
   *  from an older one. */
  const layerDragSeqRef = useRef(0);
  const [placeDrag, setPlaceDrag] = useState<PlaceDrag | null>(null);
  const placeDragRef = useRef<PlaceDrag | null>(null);
  placeDragRef.current = placeDrag;
  /** A lasso in flight: start + current corner, in doc px (matched against part rects, which
   *  are also doc px — a pure hit-test space, no logical conversion needed). */
  const [lasso, setLasso] = useState<{ x0: number; y0: number; x1: number; y1: number; active: boolean; additive: boolean } | null>(null);
  const lassoRef = useRef<typeof lasso>(null);
  lassoRef.current = lasso;
  /** The AREA TEXT tool's rectangle in flight (doc px) — released, it becomes a wrapping
   *  placed text box of that width. */
  const [areaDraft, setAreaDraft] = useState<{ x0: number; y0: number; x1: number; y1: number; active: boolean } | null>(null);
  const areaDraftRef = useRef<typeof areaDraft>(null);
  areaDraftRef.current = areaDraft;
  /** The TEXT tool's pressed-down point (doc px) — the click that places point text. */
  const textPressRef = useRef<{ x: number; y: number } | null>(null);
  /** The placed field this press GRABBED outright (selected + started dragging in one
   *  gesture), so the release knows not to climb out of a selection it just made. */
  const promotedRef = useRef<string | null>(null);
  const [editing, setEditing] = useState<EditState | null>(null);
  // The root's rect (doc px) while the pointer is over it — anchors the scale handle. Rendered
  // via × scale into the doc-space overlay, so no logical conversion is needed.
  const [hoverRect, setHoverRect] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [scaleDrag, setScaleDrag] = useState<ScaleDrag | null>(null);
  const scaleDragRef = useRef<ScaleDrag | null>(null);
  scaleDragRef.current = scaleDrag;
  const [layerTf, setLayerTf] = useState<LayerTransformDrag | null>(null);
  const layerTfRef = useRef<LayerTransformDrag | null>(null);
  layerTfRef.current = layerTf;
  /** Guards the async GSAP-baseline query that corrects a layer-transform drag's base in
   *  place (see `layerDragSeqRef`'s comment — the identical hazard). */
  const layerTfSeqRef = useRef(0);
  const [lineSize, setLineSize] = useState<LineSizeDrag | null>(null);
  const lineSizeRef = useRef<LineSizeDrag | null>(null);
  lineSizeRef.current = lineSize;
  /** A keyboard-nudge burst in flight (refs only — the live preview is inline CSS). */
  const nudgeRef = useRef<NudgeBurst | null>(null);
  const dragRef = useRef<DragState | null>(null);
  dragRef.current = drag;
  // Mirror of `editing` so blur-after-Escape can't commit a cancelled edit (the blur handler
  // would otherwise close over the pre-Escape state).
  const editingRef = useRef<EditState | null>(null);
  editingRef.current = editing;
  const editInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Publish "a gesture is live" to the store: the Inspector's deferred auto-open (AppShell)
  // must never resize the workspace while the pointer is mid-gesture or the inline editor is
  // open — the canvas (and the edit overlay anchored to it) would shift under the user.
  useEffect(() => {
    setCanvasGestureActive(Boolean(drag || layerDrag || placeDrag || scaleDrag || layerTf || lineSize || editing || lasso || areaDraft));
  }, [drag, layerDrag, placeDrag, scaleDrag, layerTf, lineSize, editing, lasso, areaDraft, setCanvasGestureActive]);

  // ── Selection model (editor UI state only — never written into the template).
  // The selectors live in the STORE so the timeline highlights the same elements
  // (shared selection); everything derived from them stays local to this layer.
  // Multi-selection follows the interaction model (docs/TIMELINE_INTERACTION_MODEL.md):
  // plain click replaces, shift-click toggles, a drag on EMPTY canvas lassos. ──
  const selected = useTemplateStore((s) => s.selectedPart);
  const selectedParts = useTemplateStore((s) => s.selectedParts);
  const setSelected = useTemplateStore((s) => s.setSelectedPart);
  const setSelectedParts = useTemplateStore((s) => s.setSelectedParts);
  const toggleSelectedPart = useTemplateStore((s) => s.toggleSelectedPart);
  const partLocks = useTemplateStore((s) => s.partLocks);
  const setPartLock = useTemplateStore((s) => s.setPartLock);
  /** The selected elements' live rects in DOC px (from the rect-push cache below; rendered via
   *  × scale into the doc-space overlay); the PRIMARY (first selected) carries the chip, the
   *  rest get plain outlines. */
  const [selRect, setSelRect] = useState<CanvasRect | null>(null);
  const [extraRects, setExtraRects] = useState<CanvasRect[]>([]);
  // The canvas CONTEXT MENU (right-click): screen px within the overlay. One action for
  // now — "Add template graphic…" — the same insert flow the Assets panel's button opens.
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  const openInsertTemplate = useInsertTemplateUi((s) => s.openDialog);
  useEffect(() => {
    if (!ctxMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCtxMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu]);
  /** The innermost part under the pointer — the "what would a click select" preview. */
  const [hoverPart, setHoverPart] = useState<{ selector: string; label: string; rect: CanvasRect } | null>(null);

  const res = template.resolution;
  // Coordinate spaces (docs/happy-marinating-pebble.md, invariant #3):
  //   • client px  — screen/event coordinates.
  //   • doc px     — the pasteboard document: the iframe viewport and this overlay share it,
  //                  origin at the pasteboard corner. ALL hit-testing runs here, because an
  //                  element's getBoundingClientRect() inside the iframe is in doc px too.
  //   • canvas px  — logical template coordinates (0,0 = canvas top-left). Everything PERSISTED
  //                  (keyframes, zone insets, inspector) is canvas px; doc px = canvas px + pad.
  // `scale` is screen px per doc px (numerically fit × zoom); when padX = 0 doc px ≡ canvas px
  // and this is exactly the pre-pasteboard behaviour.
  const scale = width / (res.width + 2 * padX);
  /** doc px → canvas-logical px (used only at write/display boundaries). */
  const docToCanvas = (p: { x: number; y: number }) => ({ x: p.x - padX, y: p.y - padY });
  // The structure contract: every generated template has one root `.{prefix}` holding a
  // `.{prefix}-box` — the same detection every live panel uses (model/structure.ts).
  const prefix = detectPrefix(template.html) ?? 'lower-third';
  const rootSelector = `.${prefix}`;

  // The template's addressable parts — THE shared element-identity contract
  // (model/structure.ts). Selection and hover only ever name elements through it.
  const parts = useMemo(() => getTemplateParts(template.html, template.fields), [template.html, template.fields]);
  const selectedPart = useMemo(
    () => (selected ? parts.find((p) => p.selector === selected) ?? null : null),
    [selected, parts],
  );

  // A structural fact from the template's OWN markup — parsed once here, independent of the
  // live iframe (whose DOM this layer no longer reaches into). Used only to answer "is A an
  // ancestor of B", which never changes with a live GSAP transform, so it needs no iframe read.
  const structureDoc = useMemo(() => new DOMParser().parseFromString(template.html, 'text/html'), [template.html]);
  const containsSelector = useCallback(
    (outerSel: string, innerSel: string): boolean => {
      if (outerSel === innerSel) return false;
      try {
        const outer = structureDoc.querySelector(outerSel);
        const inner = structureDoc.querySelector(innerSel);
        return !!(outer && inner && outer.contains(inner));
      } catch {
        return false;
      }
    },
    [structureDoc],
  );

  // ── "Appears on press" from the chip — the SAME control the timeline offers, under the
  //    same conditions (steps on, part eligible), writing the same patch (blocks/stepAssign.ts
  //    changePartPress). The code stays the one truth. A press is the middle steps' `reveals`;
  //    a legacy region has no editable press chain at all (Phase 8 — it is read-only). ──
  // THROUGH THE LENS, like the timeline and the Inspector (blocks/timelineLens.ts). The canvas
  // keyframes at the playhead, and the playhead belongs to whichever timeline is OPEN — so
  // reading the raw document here meant that, with a branch state's timeline on screen, a
  // canvas drag wrote its x/y into the default path's step instead. The strip showed the
  // branch, the keyframe landed on the walk, and nothing said so.
  const timelineTarget = useTemplateStore((s) => s.timelineTarget);
  const nativeDoc = useMemo(() => parseAnimData(template.js), [template.js]);
  const dataModel = useMemo(
    () => (nativeDoc ? lensRead(nativeDoc, timelineTarget) : null),
    [nativeDoc, timelineTarget],
  );
  /** Fold an edited projection back into the document and emit the new js (null = no change). */
  const projectedJs = (doc: SpxTemplate, next: AnimData): string | null => {
    const base = parseAnimData(doc.js);
    const folded = base ? lensWrite(base, timelineTarget, next) : next;
    return folded ? writeAnimData(doc.js, folded) : null;
  };
  const presses = useMemo(
    () => (dataModel ? dataModel.steps.slice(1, -1).map((s) => s.reveals ?? []) : null),
    [dataModel],
  );
  /** The middle steps' NAMES, so the control speaks the timeline/states vocabulary
   *  ("appears in 'Logo In'"), not an invented press numbering. */
  const stepNames = useMemo(
    () => (dataModel ? dataModel.steps.slice(1, -1).map((s) => s.name) : null),
    [dataModel],
  );
  const firstLine = parts.find((p) => p.kind === 'line')?.selector;
  // Eligible on ANY editable data block — including a template that has no middle steps
  // yet: "appears in a new step" is what CREATES the first one (setLayerActivation mints
  // the step), which is how a freshly dropped logo becomes the graphic's next step in one
  // click, right where it landed.
  const pressEligible =
    !!presses &&
    !!selectedPart &&
    (selectedPart.kind === 'line' ||
      selectedPart.kind === 'image' ||
      selectedPart.kind === 'accent' ||
      selectedPart.kind === 'block') &&
    selectedPart.selector !== firstLine;
  /** Which press the selected part is on (-1 = appears with ▶ Play). */
  const selectedPress = pressEligible
    ? presses!.findIndex((targets) => targets.includes(selectedPart!.selector))
    : -1;

  // ── Placed lines (blocks/designLayout.ts): text whose position is a DESIGN decision
  //    written in its wrapper's CSS rule — the imported-design shape. Dragging one of these
  //    re-places it (patches the rule) instead of keying motion; the gate is the code
  //    carrying that rule, never the template's category. ──
  const placed = useMemo(() => placedLines(template.html, template.css), [template.html, template.css]);

  // ── The TEXT TOOLS (the stage toolbar's T / area-text switch): click places point text,
  //    a drag draws a wrapping text box. Both create a REAL placed field — the exact
  //    transform the Data tab's add runs (blocks/designLayout.ts addPlacedLine), so the new
  //    text is an SPX DataField, a registry layer, a timeline row, and an Inspector subject
  //    from its first moment. The gate is the placed-design shape, code-derived as always. ──
  const designInfo = useMemo(() => designBoxInfo(template.html, template.css), [template.html, template.css]);
  const toolArmed = designInfo ? canvasTool : 'select';
  // A code edit can take the design shape away mid-session — disarm rather than dangle.
  useEffect(() => {
    if (!designInfo && canvasTool !== 'select') setCanvasTool('select');
  }, [designInfo, canvasTool, setCanvasTool]);

  // ── Canvas position keyframing (the interaction model, amendment 3): with a parked
  //    playhead, dragging any SELECTED non-root layer moves the whole selection and
  //    writes each layer's x/y keyframes at that moment — the drag itself arms, no
  //    Inspector setup needed. The root keeps the zone drag (a graphic's home position
  //    is a design decision, not motion), a PLACED line keeps the placement drag (same
  //    reason, per element), unselected layers don't drag on their own, and legacy-region
  //    templates never reach this path (no data block to key into). ──
  const kfSelectors = useMemo(() => {
    if (!dataModel) return [];
    return selectedParts.filter(
      (sel) => !placed[sel] && parts.find((p) => p.selector === sel)?.kind !== 'root',
    );
  }, [dataModel, selectedParts, parts, placed]);
  const kfDraggable = kfSelectors.length > 0;

  /** Where the drag's keyframes land: the parked playhead, else the layer's settled
   *  state (the end of its activation step) — the same target the Inspector stamps. */
  const keyframePlace = (selector: string): { step: number; tRel: number } | null => {
    if (!dataModel) return null;
    const speed = dataModel.speed || 1;
    if (playhead) return { step: playhead.step, tRel: Math.round(playhead.t * speed * 1000) / 1000 };
    const step = activationStep(dataModel, selector);
    return { step, tRel: dataModel.steps[step].duration };
  };

  const win = useCallback((): Window | null => iframeRef.current?.contentWindow ?? null, [iframeRef]);

  // ── The rect-push cache (preview/canvasControlProtocol.ts): every hit-test and measurement
  //    below reads THIS instead of the iframe's DOM directly. `rectsRef` is a ref (not state) —
  //    it updates every animation frame, and re-rendering on every one of those would be pure
  //    waste; only the pieces of UI that must react (selRect/extraRects) get their own state,
  //    set from inside the same listener. ──
  const rectsRef = useRef<Record<string, TrackedRect | null>>({});

  /** The rect standing for a part: its own tracked rect, or — for a placed field whose element
   *  is hidden (an EMPTY image slot) — its wrapper's, so the slot stays selectable/outlined/
   *  draggable while it shows only its dashed placeholder. Mirrors the former `partScreenEl`. */
  const rectOf = useCallback(
    (selector: string): TrackedRect | null => {
      const own = rectsRef.current[selector];
      if (own) return own;
      const pl = placed[selector];
      return pl ? rectsRef.current[`#${pl.wrapperId}`] ?? null : null;
    },
    [placed],
  );

  // What to TRACK: every registered part, every field (textFieldAt), every placed line's
  // wrapper (the hidden-element fallback above), and the design box (designSpace) — the full
  // set of selectors any gesture below might ever need a rect for. Re-sent whenever the set
  // actually changes (a template edit adds/removes parts, fields, or placed lines).
  const trackedSelectors = useMemo(() => {
    const set = new Set<string>();
    set.add(rootSelector);
    for (const p of parts) set.add(p.selector);
    for (const f of template.fields) set.add(`#${f.field}`);
    for (const pl of Object.values(placed)) set.add(`#${pl.wrapperId}`);
    if (designInfo) set.add(`.${designInfo.prefix}-box`);
    return Array.from(set);
  }, [rootSelector, parts, template.fields, placed, designInfo]);
  // Kept in a ref (not just closed over) so the on-load handler below always re-sends the
  // CURRENT list — its own effect registers once (`[iframeRef]`, since `iframeRef` is stable)
  // and must not carry a stale first-render closure across every later reload.
  const trackedSelectorsRef = useRef<string[]>(trackedSelectors);
  trackedSelectorsRef.current = trackedSelectors;
  const sentTrackRef = useRef<string>('');
  useEffect(() => {
    const key = JSON.stringify(trackedSelectors);
    if (key === sentTrackRef.current) return;
    sentTrackRef.current = key;
    postCanvasCmd(win(), { cmd: 'track', selectors: trackedSelectors });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackedSelectors]);
  // Re-assert on load too — a fresh document's script starts with an empty tracked list, and a
  // reload whose selector SET happens not to have changed (e.g. a CSS-only edit) would otherwise
  // never resend it (the effect above only fires when the list's CONTENT changes).
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const onLoad = () => postCanvasCmd(win(), { cmd: 'track', selectors: trackedSelectorsRef.current });
    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iframeRef]);

  const near = (a: CanvasRect | null, b: CanvasRect | null) =>
    !!a && !!b &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5;

  useEffect(() => {
    const onMessage = (ev: MessageEvent) => {
      if (ev.source !== iframeRef.current?.contentWindow) return;
      const msg = ev.data as CanvasRectsMessage | undefined;
      if (!msg || msg.type !== CANVAS_RECTS_TYPE) return;
      rectsRef.current = msg.rects;
      if (selectedParts.length === 0) return;
      const rects = selectedParts.map((sel) => {
        const r = rectOf(sel);
        return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
      });
      setSelRect((prev) => (near(prev, rects[0]) ? prev : rects[0]));
      const extras = rects.slice(1).filter((r): r is CanvasRect => r !== null);
      setExtraRects((prev) =>
        prev.length === extras.length && prev.every((p, i) => near(p, extras[i])) ? prev : extras,
      );
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [iframeRef, selectedParts, rectOf]);

  // Selection cleared → the rects clear too (no rect-push message will do it for us, since we
  // only recompute selRect/extraRects when a push arrives).
  useEffect(() => {
    if (selectedParts.length === 0) {
      setSelRect(null);
      setExtraRects((prev) => (prev.length ? [] : prev));
    }
  }, [selectedParts]);

  /** Put the dragged layers back where the drag found them (Escape / cancelled gesture). */
  const resetLayerDrag = (ld: LayerDrag) => {
    for (const layer of ld.layers) {
      postCanvasCmd(win(), { cmd: 'gsap-set', selector: layer.selector, vars: { x: layer.baseX, y: layer.baseY } });
    }
  };

  /** Commit a layer drag: ONE undoable apply writing every dragged layer's x and y
   *  keyframes at the playhead (the same animEdit + spliceAnimData path the Inspector
   *  and the step timeline edit through), then re-park the preview after the rebuild. */
  const commitLayerDrag = (ld: LayerDrag) => {
    if (!dataModel) return;
    let next = dataModel;
    for (const layer of ld.layers) {
      const at = keyframePlace(layer.selector);
      if (!at) continue;
      const x = Math.round((layer.baseX + ld.dx) * 100) / 100;
      const y = Math.round((layer.baseY + ld.dy) * 100) / 100;
      next = setKeyframe(setKeyframe(next, at.step, layer.selector, 'x', at.tRel, x), at.step, layer.selector, 'y', at.tRel, y);
    }
    const js = projectedJs(template, next);
    if (!js || js === template.js) return;
    applyTemplate({ ...template, js });
    const place = playhead;
    if (place) setTimeout(() => sendScrub(scrubPhase(timelineTarget, phaseIdOf(dataModel, place.step)), place.t), 650);
  };

  /** Clear the placement drag's inline left/top previews — the stylesheet position returns. */
  const resetPlaceDrag = (pd: PlaceDrag) => {
    for (const line of pd.lines) {
      postCanvasCmd(win(), { cmd: 'set-style', selector: `#${line.wrapperId}`, props: { left: '', top: '' } });
    }
  };

  /** Commit a placement drag: ONE undoable apply patching every dragged line's wrapper rule
   *  (blocks/designLayout.ts placeLine — the same left/top the Text step wrote at create).
   *  The inline previews stay: they already show the committed values, and the rebuild's
   *  fresh document replaces them moments later. */
  const commitPlaceDrag = (pd: PlaceDrag) => {
    let next = template;
    for (const line of pd.lines) {
      next = placeLine(next, line.wrapperId, Math.round(line.baseX + pd.dx), Math.round(line.baseY + pd.dy), line.scaled);
    }
    if (next.css === template.css) return;
    applyTemplate(next);
    setActiveTab('css');
  };

  /** The design box's on-screen origin and the authored --scale (doc px per design px) — the
   *  space the placement rules are written in. `--scale` is read off the template's OWN CSS
   *  (getCssVariable), not the live DOM: the only thing that ever overrides it inline is the
   *  scale-corner drag, which can never be active at the same time as a placement/text-tool
   *  gesture (only one drag is ever in flight), so the authored value is always the live one
   *  here. Null until the rect-push cache holds the box (i.e. the document has loaded). */
  const designSpace = () => {
    if (!designInfo) return null;
    const r = rectOf(`.${designInfo.prefix}-box`);
    if (!r) return null;
    const scaleVar = parseFloat(getCssVariable(template.css, 'scale') ?? '') || 1;
    return { left: r.left, top: r.top, scaleVar };
  };

  /** The tool-created field's operator label ("Text 3" for f2) — renamed any time in the
   *  Inspector's Style tab; the number just keeps siblings apart in the Data panel. */
  const toolFieldTitle = () => `Text ${parseInt(nextFieldId(template.fields).slice(1), 10) + 1}`;

  /** The T tool's click: a new placed line born EMPTY at the point, with the inline editor
   *  open on it immediately — type, and the text grows from the insertion point. The field
   *  is the Data tab's add (addPlacedLine), so it is a real DataField + layer from birth. */
  const createPointText = (p: { x: number; y: number }) => {
    const space = designSpace();
    if (!space) return;
    const at = { x: (p.x - space.left) / space.scaleVar, y: (p.y - space.top) / space.scaleVar };
    const added = addPlacedLine(template, { title: toolFieldTitle(), ftype: 'textfield', at, text: '' });
    if (!added) return;
    let next = added.template;
    // The click is the text's insertion point (the Illustrator feel): the line's box shifts
    // up by its own height so the glyphs land where the cursor clicked, not hang below it.
    const pl = placedLines(next.html, next.css)[`#${added.fieldId}`];
    const font = lineFontSize(next.css, added.fieldId);
    if (pl && font) next = placeLine(next, pl.wrapperId, pl.x, Math.round(pl.y - font.value), pl.scaled);
    applyTemplate(next);
    setSelected(`#${added.fieldId}`);
    setActiveTab('html');
    setCanvasTool('select');
    // Open the editor at the spot the text will render. The rect comes from the placement
    // (not a measurement) because the element itself only arrives with the debounced rebuild.
    const h = (font?.value ?? 24) * space.scaleVar * 1.2;
    setEditing({
      field: added.fieldId,
      multiline: false,
      value: '',
      rect: { left: p.x, top: p.y - h, width: 40, height: h },
      fresh: true,
      origText: '',
    });
  };

  /** The area tool's release: the dragged rectangle becomes a WRAPPING text box — a placed
   *  line whose fit is 'wrap' with the rectangle's width as its slot — pre-filled with
   *  lorem ipsum so typography, wrapping, and the bounds show immediately. */
  const commitAreaText = (a: { x0: number; y0: number; x1: number; y1: number }) => {
    const space = designSpace();
    if (!space) return;
    const at = {
      x: (Math.min(a.x0, a.x1) - space.left) / space.scaleVar,
      y: (Math.min(a.y0, a.y1) - space.top) / space.scaleVar,
    };
    const w = Math.abs(a.x1 - a.x0) / space.scaleVar;
    if (w < 24) return; // too small to hold text — an abandoned drag, create nothing
    const added = addPlacedLine(template, {
      title: toolFieldTitle(),
      ftype: 'textfield',
      at,
      text: AREA_TEXT_PLACEHOLDER,
    });
    if (!added) return;
    const next = setLineFit(added.template, added.fieldId, { mode: 'wrap', maxWidth: Math.round(w) });
    applyTemplate(next ?? added.template);
    setSelected(`#${added.fieldId}`);
    setActiveTab('html');
    setCanvasTool('select');
  };

  const changePress = (toPress: number) => {
    if (!selectedPart || !dataModel) return;
    // "In a new step »" goes through the composed layer-timeline transform so the fresh
    // step is NAMED after the layer ("Logo In") — the same one the Inspector and the
    // states graph use. Moves between existing steps keep the plain press patch.
    if (toPress >= (presses?.length ?? 0)) {
      const next = createStepFromLayer(template, parts, selectedPart.selector);
      if (!next) return;
      applyTemplate(next); // one undoable apply
      requestReplay();
      return;
    }
    const change = changePartPress(template, parts, selectedPart.selector, selectedPress, toPress);
    if (!change) return;
    applyTemplate({ ...template, ...change.patch }); // one undoable apply — same as the gutter
    requestReplay();
  };
  // ── The DESIGN UNIT of an imported design: the artwork and the box that holds it together
  //    with the text placed on it. They are not layers you size on their own — the artwork's
  //    size IS the composition's size, and every placed field's left/top/font-size is written
  //    as `calc(Npx * var(--scale))` against it. So their corner handle is the DESIGN scale
  //    handle (one :root --scale patch, the same write the Style panel's size knob makes),
  //    which moves artwork and fields as one; a scale KEYFRAME on the artwork alone would
  //    leave every field behind and break the layout the user imported. Motion is untouched:
  //    the Inspector's Properties tab still keyframes the artwork's scale like any layer.
  //    Code-derived as always (designInfo), so catalog templates keep the layer handles. ──
  const designUnit = useMemo(
    () => (designInfo ? [`.${designInfo.prefix}-art`, `.${designInfo.prefix}-box`] : []),
    [designInfo],
  );
  const designUnitSelected = !!selectedPart && designUnit.includes(selectedPart.selector);

  /** Is this part LOCKED for canvas gestures? (components/canvas/partLocks.ts owns the meaning and
   *  the defaults, so this layer and the Inspector's toggle can never disagree.) */
  const isLocked = useCallback(
    (selector: string) => partLocked(selector, partLocks, designInfo?.prefix ?? null),
    [partLocks, designInfo],
  );

  /** The selected part whose lock the chip offers as a padlock, or null. Only the imported
   *  ARTWORK for now: it is the one part with a non-obvious default, and the one a user has
   *  to be able to unlock to animate it as a layer of its own. Every other part is unlocked
   *  and has nothing to say about it, so its chip stays a plain label. */
  const lockToggleFor =
    designInfo && selectedPart?.selector === `.${designInfo.prefix}-art` && !isMobile
      ? selectedPart.selector
      : null;

  // The corner scale handle anchors to the hovered root — or to the selection while the
  // WHOLE GRAPHIC (or an imported design's own unit) is selected, so the chip's one existing
  // root action stays reachable.
  const handleRect = hoverRect ?? (selectedPart?.kind === 'root' || designUnitSelected ? selRect : null);

  // A single selected NON-ROOT layer on a data-block template gets scale + rotate handles on
  // its selection box; dragging them keys scale/rotation at the playhead (pivoting around the
  // layer's transform-origin — the Inspector pivot). The root keeps its own --scale handle.
  // A PLACED line is the exception: its corner handle resizes the TEXT (a design decision in
  // its `#fN` rule), so the keyframe handles step aside for it — same doctrine as its drag —
  // and so does an imported design's own unit (above), whose corner scales the composition.
  const layerTfSel =
    dataModel &&
    selectedParts.length === 1 &&
    selectedPart &&
    selectedPart.kind !== 'root' &&
    !placed[selectedPart.selector] &&
    !designUnitSelected &&
    !isLocked(selectedPart.selector)
      ? selectedPart.selector
      : null;

  // The single selected PLACED field the corner size handle can edit (code-derived, like the
  // placement drag's gate): a text line resizes its font-size; an image slot (no font-size
  // rule) resizes its wrapper box.
  const lineSizeSel = useMemo(() => {
    if (selectedParts.length !== 1 || !selectedPart) return null;
    if (isLocked(selectedPart.selector)) return null; // locked: selectable, never resizable
    const pl = placed[selectedPart.selector];
    if (!pl) return null;
    const fieldId = selectedPart.selector.slice(1);
    const font = lineFontSize(template.css, fieldId);
    if (font) {
      // An AREA text line (fit mode 'wrap') resizes its BOX from the corner — the text
      // rewraps to the new width, the Illustrator area-text gesture; its font-size stays
      // an Inspector control. Point/shrink lines keep the font-size handle.
      const fit = lineFit(template.html, template.css, fieldId);
      if (fit?.mode === 'wrap' && fit.maxWidth != null) {
        return { kind: 'area' as const, fieldId, wrapperId: pl.wrapperId, base: fit.maxWidth, baseH: 0, scaled: fit.scaled };
      }
      return { kind: 'font' as const, fieldId, wrapperId: pl.wrapperId, base: font.value, baseH: 0, scaled: font.scaled };
    }
    const slot = slotSize(template.css, pl.wrapperId);
    if (slot) {
      return { kind: 'slot' as const, fieldId, wrapperId: pl.wrapperId, base: slot.width, baseH: slot.height, scaled: slot.scaled };
    }
    return null;
  }, [selectedParts, selectedPart, placed, template.html, template.css, isLocked]);

  /** Clear a size drag's inline previews — the stylesheet values return. */
  const clearLineSizePreview = useCallback(
    (d: LineSizeDrag) => {
      if (d.kind === 'font') {
        postCanvasCmd(win(), { cmd: 'set-style', selector: `#${d.fieldId}`, props: { fontSize: '' } });
      } else if (d.kind === 'area') {
        postCanvasCmd(win(), { cmd: 'set-style', selector: `#${d.wrapperId}`, props: { maxWidth: '' } });
      } else {
        postCanvasCmd(win(), { cmd: 'set-style', selector: `#${d.wrapperId}`, props: { width: '', height: '' } });
      }
    },
    [win],
  );

  /** Pointer event → doc px. The overlay's top-left is the pasteboard corner, and iframe
   *  element rects are in the same doc space, so this is the one space hit-testing uses.
   *  Convert to canvas-logical px with `docToCanvas` only where a persisted/logical value is
   *  needed. */
  const clientToDoc = (e: React.PointerEvent | React.MouseEvent) => {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: (e.clientX - box.left) / scale, y: (e.clientY - box.top) / scale };
  };

  const inRect = (p: { x: number; y: number }, r: { left: number; top: number; width: number; height: number }) =>
    p.x >= r.left && p.x <= r.left + r.width && p.y >= r.top && p.y <= r.top + r.height;

  /** The VISIBLE editable text element under the point (hidden #fN source divs excluded, image
   *  fields excluded by ftype — both app-side facts, no DOM read needed). */
  const textFieldAt = (p: { x: number; y: number }) => {
    for (const f of template.fields) {
      if (f.ftype === 'filelist') continue; // images have their own field UX (Data panel)
      const r = rectOf(`#${f.field}`);
      if (!r) continue; // not rendered — a hidden source div (credits/tickers/timers/quiz)
      if (inRect(p, r)) return { field: f.field, ftype: f.ftype, rect: r };
    }
    return null;
  };

  /** Registered parts under a canvas point, innermost first. Rect-containment + a depth/area
   *  tie-break — the SAME fallback algorithm the pre-conversion code used only for templates
   *  that opt out of pointer hit-testing (`pointer-events: none`), now used universally: a rect
   *  carries no paint-order information, so the true `elementFromPoint` stacking order this used
   *  to try first is no longer available without a per-pointermove round trip. `depth` rides
   *  with each pushed rect for exactly this tie-break, computed by the document since only it
   *  can walk `parentElement`. */
  const partChainAt = (p: { x: number; y: number }): { part: TemplatePart; rect: TrackedRect }[] => {
    const hits: { part: TemplatePart; rect: TrackedRect }[] = [];
    for (const part of parts) {
      const r = rectOf(part.selector);
      if (r && inRect(p, r)) hits.push({ part, rect: r });
    }
    return hits.sort((a, b) => {
      const byDepth = b.rect.depth - a.rect.depth;
      if (byDepth !== 0) return byDepth;
      return a.rect.width * a.rect.height - b.rect.width * b.rect.height; // ties: the smaller wins
    });
  };

  /** A click selects the innermost part under the point; clicking the SELECTED part again
   *  climbs to its container (panel → whole graphic); empty canvas deselects. Shift-click
   *  (additive) toggles the innermost part's membership instead — no climbing. */
  const selectAt = (p: { x: number; y: number }, additive = false) => {
    const chain = partChainAt(p);
    if (chain.length === 0) {
      if (!additive) setSelected(null);
      return;
    }
    if (additive) {
      toggleSelectedPart(chain[0].part.selector);
      return;
    }
    const climb = chain[0].part.selector === selected && selectedParts.length === 1 && chain.length > 1;
    setSelected(chain[climb ? 1 : 0].part.selector);
  };

  // Focus the inline editor as soon as it opens.
  useEffect(() => {
    if (editing) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editing?.field]); // eslint-disable-line react-hooks/exhaustive-deps

  // Type-on-canvas: every keystroke mirrors into the preview element live, so the canvas
  // shows the text exactly as it is written (wrapping included, for an area box). Commit
  // makes it real code; cancelEdit restores the template's own text.
  useEffect(() => {
    if (!editing) return;
    postCanvasCmd(win(), { cmd: 'set-text', selector: `#${editing.field}`, text: editing.value });
  }, [editing?.value]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tool lifecycle keys: Escape disarms back to Select; T arms the type tool (the classic
  // key), guarded so typing anywhere never trips it. Placed-design templates only — the
  // same gate as the toolbar buttons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editingRef.current) return; // the inline editor owns its keys
      if (!editorShortcutsLive(e.target)) return;
      if (e.key === 'Escape' && canvasTool !== 'select') {
        // CLAIM it. The deselect handler below reads canvasTool to know it should stand down,
        // but this line is about to change that value — so whichever of the two listeners runs
        // second would read 'select' and deselect as well. Both guards together make the split
        // hold in EITHER order: run first and preventDefault stops it, run second and it still
        // sees the armed tool. Neither depends on who subscribed when.
        e.preventDefault();
        setCanvasTool('select');
        setAreaDraft(null);
        textPressRef.current = null;
        return;
      }
      if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey && !e.altKey && designInfo) {
        e.preventDefault();
        setCanvasTool('text');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canvasTool, designInfo, setCanvasTool]);

  // Escape cancels an active drag (standard direct-manipulation behavior). A layer drag
  // also puts the layer back where the drag found it (the live GSAP preview moved it);
  // a placement drag clears its inline previews so the stylesheet position returns.
  useEffect(() => {
    if (!drag && !layerDrag && !placeDrag && !lasso) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setDrag(null);
      setLasso(null);
      const ld = layerDragRef.current;
      if (ld) {
        resetLayerDrag(ld);
        setLayerDrag(null);
      }
      const pd = placeDragRef.current;
      if (pd) {
        resetPlaceDrag(pd);
        setPlaceDrag(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drag, layerDrag, placeDrag, lasso]); // eslint-disable-line react-hooks/exhaustive-deps

  // A code edit can remove selected elements — the selection follows the registry.
  useEffect(() => {
    if (selectedParts.length === 0) return;
    const alive = selectedParts.filter((sel) => parts.some((p) => p.selector === sel));
    if (alive.length !== selectedParts.length) setSelectedParts(alive);
  }, [parts, selectedParts, setSelectedParts]);

  // Escape deselects — but never steals the key from a drag, the inline editor (both own
  // their Escape), or a focused form field / Monaco.
  useEffect(() => {
    if (!selected) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (layerTfRef.current) {
        // Spring the layer back to where the drag found it, keep it selected. Refs only, so
        // this Escape effect needs no extra deps.
        const d = layerTfRef.current;
        postCanvasCmd(win(), { cmd: 'gsap-set', selector: d.selector, vars: d.kind === 'scale' ? { scale: d.base } : { rotation: d.base } });
        setLayerTf(null);
        return;
      }
      if (lineSizeRef.current) {
        // Spring the field back to its stylesheet size, keep it selected.
        clearLineSizePreview(lineSizeRef.current);
        setLineSize(null);
        return;
      }
      if (nudgeRef.current) {
        // Cancel a pending keyboard-nudge burst: clear the previews, commit nothing.
        const b = nudgeRef.current;
        if (b.timer) clearTimeout(b.timer);
        nudgeRef.current = null;
        for (const line of b.lines) {
          postCanvasCmd(win(), { cmd: 'set-style', selector: `#${line.wrapperId}`, props: { left: '', top: '' } });
        }
        for (const k of b.keyed) {
          postCanvasCmd(win(), { cmd: 'gsap-set', selector: k.selector, vars: { x: k.baseX, y: k.baseY } });
        }
        return;
      }
      if (dragRef.current || editingRef.current || scaleDragRef.current || layerDragRef.current || placeDragRef.current || lassoRef.current) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, .monaco-editor')) return;
      // An armed text tool claims Escape for its own disarm — the selection survives it. Two
      // guards, because the tool handler SETS canvasTool: if it ran first this reads 'select'
      // and only defaultPrevented catches it; if it runs second only the tool check does.
      if (e.defaultPrevented) return;
      if (useTemplateStore.getState().canvasTool !== 'select') return;
      setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, setSelected, iframeRef, clearLineSizePreview, win]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (editing) return; // the editor overlay handles its own events
    // A pressed context menu closes on the next press anywhere else (its items swallow
    // their own events); the right button never starts a gesture — it belongs to the menu.
    setCtxMenu(null);
    if (e.button === 2) return;
    promotedRef.current = null;
    const p = clientToDoc(e);
    // An armed TEXT TOOL claims the pointer outright — selection, drags, and the lasso all
    // wait until the tool disarms (Escape, the toolbar, or the creation itself).
    if (toolArmed === 'text') {
      e.currentTarget.setPointerCapture(e.pointerId);
      textPressRef.current = p;
      return;
    }
    if (toolArmed === 'area-text') {
      e.currentTarget.setPointerCapture(e.pointerId);
      setAreaDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, active: false });
      return;
    }
    // DIRECT MANIPULATION on a PLACED field: a press on the visible topmost field grabs THAT
    // field, with no select-then-drag round trip — the rule every graphics editor follows.
    // The press selects it and starts its placement drag in one motion.
    //
    // Scoped to placed fields on purpose. Their drag is a DESIGN decision written into their
    // own CSS rule, so grabbing one by mistake costs a nudge and one undo. A keyframe layer's
    // drag WRITES MOTION at the playhead, which is why the interaction model
    // (docs/TIMELINE_INTERACTION_MODEL.md, amendment 3) makes selection the deliberate step
    // there — that stays exactly as it was, on every template.
    //
    // LOCKED parts are skipped, so an imported design's artwork never swallows the press meant
    // for the text drawn on top of it, and a press on BARE artwork still falls through to the
    // root's zone drag (which moves the whole graphic). Shift-click stays a selection gesture,
    // and pressing an already-selected field keeps the multi-selection drag as it was.
    const topHit =
      toolArmed === 'select' && !e.shiftKey
        ? partChainAt(p).find((c) => !isLocked(c.part.selector)) ?? null
        : null;
    const promoted =
      topHit && placed[topHit.part.selector] && !selectedParts.includes(topHit.part.selector)
        ? topHit.part.selector
        : null;
    /** What this press moves: the freshly grabbed element, else the standing selection —
     *  minus anything locked, which a selection may well contain. */
    const moveSel = (promoted ? [promoted] : selectedParts).filter((sel) => !isLocked(sel));

    // The placement drag claims a pointer down ON a PLACED line (its wrapper — the positioned
    // element). Placed lines under the press move together; the delta converts to design px
    // through the computed --scale, since that is what the rule holds.
    const placedSel = moveSel
      .map((sel) => ({ sel, place: placed[sel] as LinePlacement | undefined }))
      .filter((x): x is { sel: string; place: LinePlacement } => !!x.place);
    if (placedSel.length > 0) {
      const els = placedSel
        .map((x) => ({ ...x, rect: rectOf(`#${x.place.wrapperId}`) }))
        .filter((x): x is { sel: string; place: LinePlacement; rect: TrackedRect } => !!x.rect);
      if (els.some((x) => inRect(p, x.rect))) {
        e.currentTarget.setPointerCapture(e.pointerId);
        if (promoted) {
          // Grabbed in one gesture: select it now, and remember that the release must not
          // then CLIMB out of it (clicking the already-selected part is what climbs).
          setSelected(promoted);
          promotedRef.current = promoted;
        }
        const scaleVar = parseFloat(getCssVariable(template.css, 'scale') ?? '') || 1;
        setPlaceDrag({
          lines: els.map((x) => ({
            selector: x.sel,
            wrapperId: x.place.wrapperId,
            baseX: x.place.x,
            baseY: x.place.y,
            scaled: x.place.scaled,
          })),
          scaleVar,
          startX: e.clientX,
          startY: e.clientY,
          dx: 0,
          dy: 0,
          active: false,
        });
        return;
      }
    }
    // The keyframe drag claims next: a pointer down ON a non-root layer moves it (and, when
    // it was already selected, the whole selection — works outside the root too, since block
    // parts live there).
    const kfSel = kfSelectors.filter((sel) => !isLocked(sel));
    if (kfSel.length > 0) {
      const hitEls = kfSel
        .map((sel) => ({ sel, rect: rectOf(sel) }))
        .filter((x): x is { sel: string; rect: TrackedRect } => !!x.rect);
      if (hitEls.some((x) => inRect(p, x.rect))) {
        e.currentTarget.setPointerCapture(e.pointerId);
        // Layers contained in another dragged layer ride along on the parent's
        // transform — keying them too would move them twice. A structural fact from the
        // template's own markup (containsSelector), not the live DOM.
        const top = hitEls.filter((x) => !hitEls.some((o) => o !== x && containsSelector(o.sel, x.sel)));
        const startX = e.clientX;
        const startY = e.clientY;
        // The drag state is created SYNCHRONOUSLY (bases at 0, corrected below once the query
        // resolves) — never only inside the `.then()`. A fast click (pointerdown immediately
        // followed by pointerup, as Playwright's `.click()` does) can otherwise complete before
        // the async baseline query answers, leaving `onPointerUp` unable to find and clear a
        // drag that doesn't exist yet — and once the query DOES resolve, it would set the drag
        // state AFTER the gesture already ended, with nothing left to ever clear it again
        // (stuck for the rest of the session, e.g. blocking Escape's deselect guard).
        const seq = ++layerDragSeqRef.current;
        setLayerDrag({
          layers: top.map((x) => ({ selector: x.sel, baseX: 0, baseY: 0 })),
          startX,
          startY,
          dx: 0,
          dy: 0,
          active: false,
        });
        void queryCanvas(
          win(),
          top.flatMap((x) => [
            { kind: 'gsap-prop' as const, selector: x.sel, prop: 'x' },
            { kind: 'gsap-prop' as const, selector: x.sel, prop: 'y' },
          ]),
        ).then((values) => {
          if (layerDragSeqRef.current !== seq) return; // superseded/released/cancelled meanwhile
          setLayerDrag((cur) =>
            cur
              ? {
                  ...cur,
                  layers: top.map((x, i) => ({
                    selector: x.sel,
                    baseX: Number(values[i * 2] ?? 0),
                    baseY: Number(values[i * 2 + 1] ?? 0),
                  })),
                }
              : cur,
          );
        });
        return;
      }
    }
    const rr = rectOf(rootSelector);
    if (!rr) return;
    // A LOCKED root keeps its selection and its handles but gives up the zone drag, so the
    // press draws a marquee straight over the graphic — which is the point of locking it
    // while placing fields on top.
    if (!inRect(p, rr) || isLocked(rootSelector)) {
      // EMPTY canvas: a drag lassos (shift keeps the existing selection); a plain
      // click still selects/deselects on release (below the threshold → selectAt).
      e.currentTarget.setPointerCapture(e.pointerId);
      setLasso({ x0: p.x, y0: p.y, x1: p.x, y1: p.y, active: false, additive: e.shiftKey });
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({
      startX: e.clientX,
      startY: e.clientY,
      dx: 0,
      dy: 0,
      active: false,
      root: { left: rr.left, top: rr.top, width: rr.width, height: rr.height },
    });
  };

  /** Lasso release: select every rendered non-root part whose rect intersects the
   *  marquee (the root spans the whole graphic — including it would make any marquee a
   *  whole-graphic selection). Shift adds the hits to the existing selection. */
  const commitLasso = (ls: { x0: number; y0: number; x1: number; y1: number; additive: boolean }) => {
    const left = Math.min(ls.x0, ls.x1);
    const top = Math.min(ls.y0, ls.y1);
    const right = Math.max(ls.x0, ls.x1);
    const bottom = Math.max(ls.y0, ls.y1);
    const hits: string[] = [];
    for (const part of parts) {
      if (part.kind === 'root') continue;
      if (isLocked(part.selector)) continue; // a locked part takes no gesture, marquee included
      const pr = rectOf(part.selector);
      if (!pr) continue;
      if (pr.left < right && pr.left + pr.width > left && pr.top < bottom && pr.top + pr.height > top) {
        hits.push(part.selector);
      }
    }
    setSelectedParts(ls.additive ? [...selectedParts, ...hits.filter((h) => !selectedParts.includes(h))] : hits);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ad = areaDraftRef.current;
    if (ad) {
      const p = clientToDoc(e);
      const active = ad.active || Math.hypot((p.x - ad.x0) * scale, (p.y - ad.y0) * scale) > DRAG_THRESHOLD;
      setAreaDraft({ ...ad, x1: p.x, y1: p.y, active });
      return;
    }
    if (toolArmed !== 'select') {
      // The T tool needs no move feedback (the cursor says what a press will do), and the
      // hover naming would only distract from placing text.
      if (hoverPart) setHoverPart(null);
      return;
    }
    const ls = lassoRef.current;
    if (ls) {
      const p = clientToDoc(e);
      const active =
        ls.active || Math.hypot((p.x - ls.x0) * scale, (p.y - ls.y0) * scale) > DRAG_THRESHOLD;
      setLasso({ ...ls, x1: p.x, y1: p.y, active });
      return;
    }
    const pd = placeDragRef.current;
    if (pd) {
      // The placed lines follow the pointer live, through the SAME CSS channel the commit
      // writes (an inline left/top in the rule's own idiom) — never a transform, so what
      // the drag shows is exactly what the patched stylesheet will render.
      const dx = (e.clientX - pd.startX) / scale / pd.scaleVar;
      const dy = (e.clientY - pd.startY) / scale / pd.scaleVar;
      const active = pd.active || Math.hypot(e.clientX - pd.startX, e.clientY - pd.startY) > DRAG_THRESHOLD;
      setPlaceDrag({ ...pd, dx, dy, active });
      if (active) {
        for (const line of pd.lines) {
          postCanvasCmd(win(), {
            cmd: 'set-style',
            selector: `#${line.wrapperId}`,
            props: { left: placementCss(line.baseX + dx, line.scaled), top: placementCss(line.baseY + dy, line.scaled) },
          });
        }
      }
      return;
    }
    const ld = layerDragRef.current;
    if (ld) {
      // The selected layers follow the pointer live (a GSAP x/y set on the preview —
      // the same channels the keyframes will drive; the commit lands on release).
      const dx = (e.clientX - ld.startX) / scale;
      const dy = (e.clientY - ld.startY) / scale;
      const active = ld.active || Math.hypot(e.clientX - ld.startX, e.clientY - ld.startY) > DRAG_THRESHOLD;
      setLayerDrag({ ...ld, dx, dy, active });
      if (active) {
        for (const layer of ld.layers) {
          postCanvasCmd(win(), { cmd: 'gsap-set', selector: layer.selector, vars: { x: layer.baseX + dx, y: layer.baseY + dy } });
        }
      }
      return;
    }
    const d = dragRef.current;
    if (d) {
      const dx = e.clientX - d.startX;
      const dy = e.clientY - d.startY;
      setDrag({ ...d, dx, dy, active: d.active || Math.hypot(dx, dy) > DRAG_THRESHOLD });
      return;
    }
    if (editing || scaleDragRef.current) return;
    // Hover affordance: the corner scale handle, anchored to the root while the pointer is
    // over it. The CURSOR deliberately stays the arrow — the standard editor convention is
    // that the pointer names the gesture in progress, not the one that would be possible.
    // A hand over everything movable said "hand" over the entire graphic and taught nothing;
    // what a click will select is shown by the hover outline and its name chip instead.
    const p = clientToDoc(e);
    const r = rectOf(rootSelector);
    if (r && inRect(p, r)) {
      setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
    } else {
      // Keep the handle reachable: it sits just OUTSIDE the root's corner, so don't clear
      // the rect while the pointer is within its small halo.
      if (hoverRect) {
        const halo = 18 / scale; // handle size in canvas px
        const nearHandle =
          p.x >= hoverRect.left + hoverRect.width - halo && p.x <= hoverRect.left + hoverRect.width + halo &&
          p.y >= hoverRect.top + hoverRect.height - halo && p.y <= hoverRect.top + hoverRect.height + halo;
        if (!nearHandle) setHoverRect(null);
      }
    }
    // Hover naming: the innermost registered part under the pointer — a preview of what a
    // click would select. Runs outside the root rect too (block parts can live there).
    const top = partChainAt(p)[0] ?? null;
    setHoverPart((prev) => {
      if (!top) return prev === null ? prev : null;
      const tr = top.rect;
      if (
        prev &&
        prev.selector === top.part.selector &&
        Math.abs(prev.rect.left - tr.left) < 0.5 &&
        Math.abs(prev.rect.top - tr.top) < 0.5 &&
        Math.abs(prev.rect.width - tr.width) < 0.5 &&
        Math.abs(prev.rect.height - tr.height) < 0.5
      ) {
        return prev;
      }
      return {
        selector: top.part.selector,
        label: top.part.label,
        rect: { left: tr.left, top: tr.top, width: tr.width, height: tr.height },
      };
    });
  };

  // ── W2: the corner scale handle → one --scale patch (the Style panel's size knob) ──
  const currentScale = () => {
    const v = parseFloat(getCssVariable(template.css, 'scale') ?? '');
    return Number.isFinite(v) ? v : 1;
  };

  const startScaleDrag = (e: React.PointerEvent) => {
    if (!handleRect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const orig = currentScale();
    setScaleDrag({
      startX: e.clientX,
      startY: e.clientY,
      origScale: orig,
      rootWidth: handleRect.width * scale,
      rootHeight: handleRect.height * scale,
      value: orig,
    });
  };

  const moveScaleDrag = (e: React.PointerEvent) => {
    const d = scaleDragRef.current;
    if (!d) return;
    e.stopPropagation();
    // Corner-drag growth: horizontal AND vertical movement count, proportionally to the
    // root's size at drag start — dragging along the box's diagonal tracks the pointer.
    const gesture = e.clientX - d.startX + (e.clientY - d.startY);
    const factor = 1 + gesture / Math.max(80, d.rootWidth + d.rootHeight);
    const value = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, d.origScale * factor)) * 100) / 100;
    setScaleDrag({ ...d, value });
    // Live preview: an inline :root override on the preview document (the rebuild clears it).
    postCanvasCmd(win(), { cmd: 'set-scale-var', value });
    // The handle follows the graphic's REAL corner while it grows/shrinks (the rect cache
    // catches up within a frame of the command above).
    const r = rectOf(rootSelector);
    if (r) setHoverRect({ left: r.left, top: r.top, width: r.width, height: r.height });
  };

  const endScaleDrag = (e: React.PointerEvent) => {
    const d = scaleDragRef.current;
    setScaleDrag(null);
    if (!d) return;
    e.stopPropagation();
    postCanvasCmd(win(), { cmd: 'set-scale-var', value: null });
    if (d.value === d.origScale) return;
    // The SAME write the Style panel's size control makes (the :root --scale variable),
    // committed as one undoable apply; the editor highlights it and jumps to it.
    applyTemplate({ ...template, css: setCssVariable(template.css, 'scale', String(d.value)) });
    setActiveTab('css');
  };

  // ── The selected layer's scale + rotate handles (data-block templates). Live GSAP preview
  //    on the layer; release keys scale/rotation at the playhead — the same animEdit +
  //    spliceAnimData path everything else edits through, pivoting around the layer's
  //    transform-origin (GSAP honours the element's current transformOrigin). ──
  const resetLayerTf = (d: LayerTransformDrag) => {
    postCanvasCmd(win(), { cmd: 'gsap-set', selector: d.selector, vars: d.kind === 'scale' ? { scale: d.base } : { rotation: d.base } });
  };
  const cancelLayerTf = () => {
    const d = layerTfRef.current;
    if (d) resetLayerTf(d);
    setLayerTf(null);
  };
  const startLayerTf = (e: React.PointerEvent, kind: 'scale' | 'rotate') => {
    if (!layerTfSel || !selRect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    // The layer centre in SCREEN px (the overlay's own screen origin + the rect centre) — a
    // read of the APP's own DOM (the `.canvas-layer` wrapper this component renders), not the
    // iframe's, so it stays synchronous.
    const layerBox = (e.currentTarget as HTMLElement).closest('.canvas-layer')?.getBoundingClientRect();
    const cx = (layerBox?.left ?? 0) + (selRect.left + selRect.width / 2) * scale;
    const cy = (layerBox?.top ?? 0) + (selRect.top + selRect.height / 2) * scale;
    const startX = e.clientX;
    const startY = e.clientY;
    const sel = layerTfSel;
    // The drag state is created SYNCHRONOUSLY (a fallback base, corrected below once the query
    // resolves) — see the identical note on the keyframe-drag's baseline query in
    // onPointerDown: a fast click can complete before this answers, and a drag object created
    // only inside `.then()` would then be set AFTER the gesture already ended, with nothing
    // left to ever clear it (stuck for the rest of the session, e.g. blocking Escape).
    const fallbackBase = kind === 'scale' ? 1 : 0;
    const seq = ++layerTfSeqRef.current;
    setLayerTf({
      kind,
      selector: sel,
      base: fallbackBase,
      startX,
      startY,
      refSize: (selRect.width + selRect.height) * scale,
      centerX: cx,
      centerY: cy,
      startAngle: (Math.atan2(startY - cy, startX - cx) * 180) / Math.PI,
      value: fallbackBase,
      active: false,
    });
    void queryCanvas(win(), [{ kind: 'gsap-prop', selector: sel, prop: kind === 'scale' ? 'scaleX' : 'rotation' }]).then(([raw]) => {
      if (layerTfSeqRef.current !== seq) return; // superseded/released/cancelled meanwhile
      const n = Number(raw);
      const base = Number.isFinite(n) ? n : fallbackBase;
      setLayerTf((cur) => (cur ? { ...cur, base, value: base } : cur));
    });
  };
  const moveLayerTf = (e: React.PointerEvent) => {
    const d = layerTfRef.current;
    if (!d) return;
    e.stopPropagation();
    let value: number;
    if (d.kind === 'scale') {
      // Diagonal corner drag, proportional to the layer's size at start.
      const gesture = e.clientX - d.startX + (e.clientY - d.startY);
      const factor = 1 + gesture / Math.max(80, d.refSize);
      value = Math.round(Math.min(SCALE_MAX, Math.max(SCALE_MIN, d.base * factor)) * 100) / 100;
      postCanvasCmd(win(), { cmd: 'gsap-set', selector: d.selector, vars: { scale: value } });
    } else {
      const angle = (Math.atan2(e.clientY - d.centerY, e.clientX - d.centerX) * 180) / Math.PI;
      value = Math.round((d.base + (angle - d.startAngle)) * 10) / 10;
      postCanvasCmd(win(), { cmd: 'gsap-set', selector: d.selector, vars: { rotation: value } });
    }
    const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
    setLayerTf({ ...d, value, active });
  };
  const endLayerTf = (e: React.PointerEvent) => {
    const d = layerTfRef.current;
    setLayerTf(null);
    if (!d) return;
    e.stopPropagation();
    if (!d.active || !dataModel || Math.abs(d.value - d.base) < 0.001) return;
    const at = keyframePlace(d.selector);
    if (!at) return;
    const next = setKeyframe(dataModel, at.step, d.selector, d.kind === 'scale' ? 'scale' : 'rotation', at.tRel, d.value);
    const js = projectedJs(template, next);
    if (!js || js === template.js) return;
    applyTemplate({ ...template, js });
    const place = playhead;
    if (place) setTimeout(() => sendScrub(scrubPhase(timelineTarget, phaseIdOf(dataModel, place.step)), place.t), 650);
  };

  // ── The selected placed field's SIZE handle: live preview through the same CSS channel
  //    the commit writes, then ONE patch on release — setLineFontSize for a text line,
  //    setSlotSize for an image slot. A placed field's size is a design decision in its own
  //    rules — same doctrine as the placement drag, never a scale keyframe. ──
  const startLineSize = (e: React.PointerEvent) => {
    if (!lineSizeSel || !selRect) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setLineSize({
      kind: lineSizeSel.kind,
      fieldId: lineSizeSel.fieldId,
      wrapperId: lineSizeSel.wrapperId,
      base: lineSizeSel.base,
      baseH: lineSizeSel.baseH,
      scaled: lineSizeSel.scaled,
      startX: e.clientX,
      startY: e.clientY,
      refSize: (selRect.width + selRect.height) * scale,
      value: lineSizeSel.base,
      valueH: lineSizeSel.baseH,
      active: false,
    });
  };
  const moveLineSize = (e: React.PointerEvent) => {
    const d = lineSizeRef.current;
    if (!d) return;
    e.stopPropagation();
    // Diagonal corner drag, proportional to the element's on-screen size at start.
    const gesture = e.clientX - d.startX + (e.clientY - d.startY);
    const factor = 1 + gesture / Math.max(60, d.refSize);
    let value: number;
    let valueH = 0;
    if (d.kind === 'font') {
      value = Math.min(400, Math.max(6, Math.round(d.base * factor)));
      postCanvasCmd(win(), { cmd: 'set-style', selector: `#${d.fieldId}`, props: { fontSize: placementCss(value, d.scaled) } });
    } else if (d.kind === 'area') {
      // The area box's WIDTH follows the drag; the text rewraps against it live.
      value = Math.min(4000, Math.max(24, Math.round(d.base * factor)));
      postCanvasCmd(win(), { cmd: 'set-style', selector: `#${d.wrapperId}`, props: { maxWidth: placementCss(value, d.scaled) } });
    } else {
      // The slot keeps its aspect: width drives, height follows the same factor.
      value = Math.min(2000, Math.max(12, Math.round(d.base * factor)));
      valueH = Math.max(12, Math.round(d.baseH * (value / d.base)));
      postCanvasCmd(win(), {
        cmd: 'set-style',
        selector: `#${d.wrapperId}`,
        props: { width: placementCss(value, d.scaled), height: placementCss(valueH, d.scaled) },
      });
    }
    const active = d.active || Math.hypot(e.clientX - d.startX, e.clientY - d.startY) > DRAG_THRESHOLD;
    setLineSize({ ...d, value, valueH, active });
  };
  const endLineSize = (e: React.PointerEvent) => {
    const d = lineSizeRef.current;
    setLineSize(null);
    if (!d) return;
    e.stopPropagation();
    if (!d.active || (d.value === d.base && (d.kind === 'font' || d.valueH === d.baseH))) {
      clearLineSizePreview(d);
      return;
    }
    // The inline preview already shows the committed size; the rebuild replaces it shortly.
    applyTemplate(
      d.kind === 'font'
        ? setLineFontSize(template, d.fieldId, d.value, d.scaled)
        : d.kind === 'area'
          ? setLineFit(template, d.fieldId, { maxWidth: d.value }) ?? template
          : setSlotSize(template, d.wrapperId, d.value, d.valueH, d.scaled),
    );
    setActiveTab('css');
  };

  // ── Keyboard nudging: arrows move every selected layer by 1 px (Shift = 10). A placed
  //    field moves as PLACEMENT (design px, inline left/top preview, placeLine CSS); every
  //    other selected non-root layer moves on the KEYFRAME channel (canvas px, GSAP x/y
  //    preview, x+y keyframes at the playhead — the drag's semantics, key by key). The whole
  //    burst commits as ONE undoable apply once the keys go quiet, so holding an arrow never
  //    floods the history. Esc cancels the pending burst. ──
  const commitNudge = () => {
    const burst = nudgeRef.current;
    nudgeRef.current = null;
    if (!burst) return;
    if (burst.timer) clearTimeout(burst.timer);
    if (burst.dx === 0 && burst.dy === 0) return;
    // Read the store at commit time — the burst outlives this render.
    const s = useTemplateStore.getState();
    let next = s.template;
    for (const line of burst.lines) {
      next = placeLine(next, line.wrapperId, Math.round(line.baseX + burst.dx), Math.round(line.baseY + burst.dy), line.scaled);
    }
    let keyed = false;
    if (burst.keyed.length > 0) {
      const burstDoc = parseAnimData(next.js);
      const model = burstDoc ? lensRead(burstDoc, timelineTarget) : null;
      if (model) {
        const speed = model.speed || 1;
        let nd = model;
        for (const k of burst.keyed) {
          const at = s.playhead
            ? { step: s.playhead.step, tRel: Math.round(s.playhead.t * speed * 1000) / 1000 }
            : { step: activationStep(model, k.selector), tRel: model.steps[activationStep(model, k.selector)].duration };
          const x = Math.round((k.baseX + burst.dx) * 100) / 100;
          const y = Math.round((k.baseY + burst.dy) * 100) / 100;
          nd = setKeyframe(setKeyframe(nd, at.step, k.selector, 'x', at.tRel, x), at.step, k.selector, 'y', at.tRel, y);
        }
        const js = projectedJs(next, nd);
        if (js && js !== next.js) {
          next = { ...next, js };
          keyed = true;
        }
      }
    }
    if (next.css === s.template.css && next.js === s.template.js) return;
    s.applyTemplate(next);
    s.setActiveTab(keyed && next.css === s.template.css ? 'js' : 'css');
    if (keyed && s.playhead) {
      const doc = parseAnimData(s.template.js);
      const model = doc ? lensRead(doc, timelineTarget) : null;
      const place = s.playhead;
      if (model) {
        const phase = scrubPhase(timelineTarget, phaseIdOf(model, place.step));
        setTimeout(() => useTemplateStore.getState().sendScrub(phase, place.t), 650);
      }
    }
  };

  /** Preview the burst's current delta: placed lines through inline left/top, keyed layers
   *  through GSAP x/y — both fire-and-forget commands. Called on every key of the burst. */
  const applyNudgePreview = (burst: NudgeBurst) => {
    for (const line of burst.lines) {
      postCanvasCmd(win(), {
        cmd: 'set-style',
        selector: `#${line.wrapperId}`,
        props: { left: placementCss(line.baseX + burst.dx, line.scaled), top: placementCss(line.baseY + burst.dy, line.scaled) },
      });
    }
    for (const k of burst.keyed) {
      postCanvasCmd(win(), { cmd: 'gsap-set', selector: k.selector, vars: { x: k.baseX + burst.dx, y: k.baseY + burst.dy } });
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.key.startsWith('Arrow')) return;
      if (e.defaultPrevented) return; // the timeline's keyframe-set nudge already claimed it
      if (!editorShortcutsLive(e.target)) return; // never move a layer behind an open dialog
      if (
        editingRef.current || dragRef.current || placeDragRef.current || layerDragRef.current ||
        lassoRef.current || scaleDragRef.current || layerTfRef.current || lineSizeRef.current
      ) {
        return;
      }
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, .monaco-editor')) return;
      const placedTargets = selectedParts
        .map((sel) => placed[sel])
        .filter((p): p is LinePlacement => !!p);
      // The keyframe-channel targets mirror the drag: selected, not placed, not the root —
      // and layers contained in another nudged layer ride along on the parent's transform.
      const keyedEls = kfSelectors
        .map((sel) => ({ sel, rect: rectOf(sel) }))
        .filter((x): x is { sel: string; rect: TrackedRect } => !!x.rect);
      const keyedTop = keyedEls.filter((x) => !keyedEls.some((o) => o !== x && containsSelector(o.sel, x.sel)));
      if (placedTargets.length === 0 && keyedTop.length === 0) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      let burst = nudgeRef.current;
      if (!burst) {
        // Bases for placed lines come from parsed CSS (app-side, synchronous); bases for keyed
        // layers need the live GSAP-resolved x/y, which only the document can answer — start at
        // 0 and correct in place once the query resolves (see the NudgeBurst comment: an
        // extremely low-risk race, since same-tab postMessage resolves long before an OS
        // key-repeat's next tick in practice).
        const keyedSelectors = keyedTop.map((x) => x.sel);
        burst = {
          lines: placedTargets.map((p) => ({ wrapperId: p.wrapperId, baseX: p.x, baseY: p.y, scaled: p.scaled })),
          keyed: keyedSelectors.map((sel) => ({ selector: sel, baseX: 0, baseY: 0 })),
          dx: 0,
          dy: 0,
          timer: null,
        };
        nudgeRef.current = burst;
        if (keyedSelectors.length > 0) {
          const thisBurst = burst;
          void queryCanvas(
            win(),
            keyedSelectors.flatMap((sel) => [
              { kind: 'gsap-prop' as const, selector: sel, prop: 'x' },
              { kind: 'gsap-prop' as const, selector: sel, prop: 'y' },
            ]),
          ).then((values) => {
            if (nudgeRef.current !== thisBurst) return; // committed/cancelled meanwhile
            thisBurst.keyed = keyedSelectors.map((sel, i) => ({
              selector: sel,
              baseX: Number(values[i * 2] ?? 0),
              baseY: Number(values[i * 2 + 1] ?? 0),
            }));
            applyNudgePreview(thisBurst);
          });
        }
      }
      burst.dx += dx;
      burst.dy += dy;
      applyNudgePreview(burst);
      if (burst.timer) clearTimeout(burst.timer);
      burst.timer = setTimeout(commitNudge, 450);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParts, placed, kfSelectors]);

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // The text tools resolve on release: the T tool's click places point text where the
    // press landed; the area tool's drag becomes a wrapping text box.
    const tp = textPressRef.current;
    if (tp) {
      textPressRef.current = null;
      createPointText(tp);
      return;
    }
    const ad = areaDraftRef.current;
    if (ad) {
      setAreaDraft(null);
      if (ad.active) commitAreaText(ad);
      return;
    }
    const ls = lassoRef.current;
    if (ls) {
      setLasso(null);
      if (!ls.active) {
        // A click on empty canvas (below the threshold) deselects — or shift-toggles
        // an outside-the-root part under the point.
        if (!editingRef.current) selectAt(clientToDoc(e), e.shiftKey);
        return;
      }
      commitLasso(ls);
      return;
    }
    const pd = placeDragRef.current;
    if (pd) {
      setPlaceDrag(null);
      if (!pd.active) {
        // A click stays a click — the selection still climbs through containers. Unless the
        // press GRABBED this field (it was not selected before): that click already made its
        // selection, and climbing straight out of it would undo the grab.
        if (!editingRef.current && !promotedRef.current) selectAt(clientToDoc(e), e.shiftKey);
        return;
      }
      commitPlaceDrag(pd);
      return;
    }
    const ld = layerDragRef.current;
    if (ld) {
      setLayerDrag(null);
      if (!ld.active) {
        // A click stays a click — the selection still climbs through containers.
        if (!editingRef.current) selectAt(clientToDoc(e), e.shiftKey);
        return;
      }
      commitLayerDrag(ld);
      return;
    }
    const d = dragRef.current;
    setDrag(null);
    if (!d || !d.active) {
      // A click (below the drag threshold) is not a move — it updates the SELECTION.
      if (!editingRef.current) selectAt(clientToDoc(e), e.shiftKey);
      return;
    }

    // The dragged root position, converted from doc (pasteboard) px to canvas-logical px: the
    // zone decision and the zoneDecls inset solve below are all defined against the canvas
    // origin, so the pad comes off here (the one place this drag needs a logical coordinate).
    // The root can now land partly or fully in the pasteboard; the nudge captures that offset.
    const dragged = docToCanvas({ x: d.root.left + d.dx / scale, y: d.root.top + d.dy / scale });
    const left = dragged.x;
    const top = dragged.y;
    const centerX = left + d.root.width / 2;
    const centerY = top + d.root.height / 2;

    // Nearest anchor: which third of the frame the root's center landed in.
    const h = centerX < res.width / 3 ? 'left' : centerX > (res.width * 2) / 3 ? 'right' : 'center';
    const v = centerY < res.height / 3 ? 'top' : centerY > (res.height * 2) / 3 ? 'bottom' : 'mid';
    const zone = `${v}-${h}` as Zone9;

    // Residual nudge: solve zoneDecls' equations backwards for the dragged position.
    const hInset = Math.round(res.width * 0.0625);
    const topInset = Math.round(res.height * 0.08);
    const bottomInset = Math.round(res.height * 0.11);
    const nudge = {
      x: Math.round(
        h === 'left' ? left - hInset
        : h === 'right' ? hInset - (res.width - (left + d.root.width))
        : centerX - res.width / 2,
      ),
      y: Math.round(
        v === 'top' ? top - topInset
        : v === 'bottom' ? bottomInset - (res.height - (top + d.root.height))
        : centerY - res.height / 2,
      ),
    };

    // The SAME patch the Style panel writes: every zone declaration onto the root rule
    // (including the explicit auto/none resets, so the previous anchor is fully overridden).
    let css = template.css;
    for (const decl of zoneDecls(zone, nudge, res)) {
      css = setCssDeclaration(css, rootSelector, decl.prop, decl.value);
    }
    // One undoable apply — the editor highlights the patched root rule and jumps to it.
    applyTemplate({ ...template, css });
    setActiveTab('css');
  };

  const onDoubleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (editing || toolArmed !== 'select') return;
    const p = clientToDoc(e);
    const hit = textFieldAt(p);
    if (!hit) return;
    // Selection follows the edited field when it's a registered part (the second click
    // that got us here may have climbed to the panel meanwhile).
    const part = parts.find((pt) => pt.selector === `#${hit.field}`);
    if (part) setSelected(part.selector);
    // A double-click is low-frequency, so a round trip for the element's LIVE text (it can
    // differ from sample data — a static default rendered straight in the markup) costs
    // nothing observable, unlike the per-pointermove hit-test this never needed to become.
    void queryCanvas(win(), [{ kind: 'text', selector: `#${hit.field}` }]).then(([text]) => {
      const origText = typeof text === 'string' ? text : '';
      setEditing({
        field: hit.field,
        multiline: hit.ftype === 'textarea',
        value: sampleData[hit.field] ?? origText,
        rect: { left: hit.rect.left, top: hit.rect.top, width: hit.rect.width, height: hit.rect.height },
        origText,
      });
    });
  };

  /** Make the edited value real code: definition default + static text + live sample. */
  const commitValue = (ed: EditState) => {
    applyTemplate(setFieldDefault(template, ed.field, ed.value)); // definition + static text
    setSampleValue(ed.field, ed.value); // the live operator value follows the edit
    setActiveTab('html'); // the edit lives in the markup — show it highlighted
  };

  /** Commit the inline edit (undoable). A tool-created field committed EMPTY is removed
   *  again — an empty text object is noise, as in any design application. */
  const commitEdit = () => {
    const ed = editingRef.current;
    editingRef.current = null;
    setEditing(null);
    if (!ed) return;
    if (ed.fresh && ed.value.trim() === '') {
      undo(); // one undo of the creation apply — the field never existed
      return;
    }
    if (!ed.fresh && (sampleData[ed.field] ?? '') === ed.value) return; // nothing changed
    commitValue(ed);
  };

  const cancelEdit = () => {
    const ed = editingRef.current;
    editingRef.current = null;
    setEditing(null);
    if (!ed) return;
    if (ed.fresh) {
      // Escape on just-typed point text COMMITS (the Illustrator behaviour) — only an
      // empty object is discarded with its creation.
      if (ed.value.trim() === '') undo();
      else commitValue(ed);
      return;
    }
    // Typing mirrored live into the preview element; put the template's own text back.
    if (ed.origText !== undefined) postCanvasCmd(win(), { cmd: 'set-text', selector: `#${ed.field}`, text: ed.origText });
  };

  // Ghost rect (screen px) while an ACTIVE drag is under way.
  // The one cursor the canvas sets for itself: MOVE, while something is actually being
  // moved. Handles carry their own resize cursors, an armed tool its own, panning the hand.
  const moving = !!(drag?.active || layerDrag?.active || placeDrag?.active);

  const ghost = drag?.active
    ? {
        left: drag.root.left * scale + drag.dx,
        top: drag.root.top * scale + drag.dy,
        width: drag.root.width * scale,
        height: drag.root.height * scale,
      }
    : null;
  // Which zone cell the ghost's center is over (for the highlight).
  const cell = ghost
    ? {
        col: Math.min(2, Math.max(0, Math.floor(((ghost.left + ghost.width / 2) / width) * 3))),
        row: Math.min(2, Math.max(0, Math.floor(((ghost.top + ghost.height / 2) / height) * 3))),
      }
    : null;

  // ── Asset drop: drag a row from the Assets panel (or an image file straight from the
  //    OS) onto the canvas → ONE undoable apply inserts a commented, positioned <img>
  //    (blocks/assetOps.ts insertImageElement). The overlay rect is live, so zoom/pan need
  //    no extra math — the same conversion every gesture uses. ──
  const onAssetDragOver = (e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(ASSET_DRAG_TYPE) || e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  };
  const onAssetDrop = (e: React.DragEvent) => {
    const assetPath = e.dataTransfer.getData(ASSET_DRAG_TYPE);
    const osFiles = Array.from(e.dataTransfer.files ?? []).filter(
      (f) => isImageAsset(f.name) || (isVideoAsset(f.name) && f.size <= MAX_VIDEO_ASSET_BYTES),
    );
    if (!assetPath && osFiles.length === 0) return;
    e.preventDefault();
    // Capture everything synchronously — the probe below is async.
    const overlay = e.currentTarget.getBoundingClientRect();
    const point = docToCanvas({ x: (e.clientX - overlay.left) / scale, y: (e.clientY - overlay.top) / scale });

    const place = async () => {
      if (assetPath) {
        const asset = template.assets.find((a) => a.path === assetPath);
        if (!asset) return;
        const insert = isImageAsset(assetPath)
          ? insertImageElement
          : isLottieAsset(assetPath)
            ? insertLottieElement
            : isVideoAsset(assetPath)
              ? insertVideoElement
              : null;
        if (!insert) return; // fonts/other: no canvas placement
        const info = await probeAsset(asset);
        const { template: next, selector } = insert(template, {
          assetPath,
          x: point.x,
          y: point.y,
          naturalW: info.width ?? 300,
          naturalH: info.height ?? 300,
        });
        applyTemplate(next);
        setSelected(selector);
        setActiveTab('html');
        return;
      }
      // OS files: import + place composed into ONE apply, so one undo removes both.
      let next = template;
      let lastSelector: string | null = null;
      for (const [i, file] of osFiles.entries()) {
        // Same door policy as the Assets panel: an image larger than the frame is shrunk to
        // fit it before it becomes a data URL in the saved template.
        const data = isImageAsset(file.name)
          ? (await importImageFile(file, Math.max(template.resolution.width, template.resolution.height))).data
          : await fileToDataUrl(file);
        const asset = { path: uniqueAssetPath(file.name, next.assets), data };
        next = { ...next, assets: [...next.assets, asset] };
        const info = await probeAsset(asset);
        const placed = (isVideoAsset(asset.path) ? insertVideoElement : insertImageElement)(next, {
          assetPath: asset.path,
          x: point.x + i * 24, // stagger a multi-file drop so the images don't pile up
          y: point.y + i * 24,
          naturalW: info.width ?? 300,
          naturalH: info.height ?? 300,
        });
        next = placed.template;
        lastSelector = placed.selector;
      }
      applyTemplate(next);
      if (lastSelector) setSelected(lastSelector);
      setActiveTab('html');
    };
    void place();
  };

  return (
    <div
      className={`canvas-layer${ghost || moving ? ' moving' : ''}${toolArmed !== 'select' ? ` tool-${toolArmed}` : ''}`}
      style={{ width, height }}
      data-testid="canvas-layer"
      onDragOver={onAssetDragOver}
      onDrop={onAssetDrop}
      onContextMenu={(e) => {
        e.preventDefault(); // the canvas offers its own menu, not the browser's
        const rect = e.currentTarget.getBoundingClientRect();
        setCtxMenu({
          x: Math.min(e.clientX - rect.left, Math.max(0, width - 200)),
          y: Math.min(e.clientY - rect.top, Math.max(0, height - 40)),
        });
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        setDrag(null);
        setLasso(null);
        setAreaDraft(null);
        textPressRef.current = null;
        const ld = layerDragRef.current;
        if (ld) {
          resetLayerDrag(ld);
          setLayerDrag(null);
        }
        const pd = placeDragRef.current;
        if (pd) {
          resetPlaceDrag(pd);
          setPlaceDrag(null);
        }
      }}
      onPointerLeave={() => setHoverPart(null)}
      onDoubleClick={onDoubleClick}
    >
      {/* Selection outline + naming chip, and the hover preview — editor UI state only
          (the chip's press control is the one action that writes code, via the same
          patch the timeline gutter writes). An armed text tool hides them: the canvas
          belongs to placing text until the tool disarms. */}
      {!ghost && !editing && toolArmed === 'select' && (
        <CanvasSelection
          scale={scale}
          width={width}
          selection={
            selectedPart && selRect
              ? {
                  rect: selRect,
                  label: selectedPart.label,
                  // The chip surfaces only actions that ALREADY exist where they apply
                  // (the press control replaces the passive hint when both would show).
                  // On a phone every one of these lines would advertise a desktop gesture —
                  // double-click, arrow keys, the corner handle — so the chip shows just the
                  // name there: less guidance beats an instruction the device can't follow.
                  // The padlock states the lock in its own words, so the chip drops the hint
                  // beside it rather than ellipsizing both into halves of a sentence.
                  hint: pressEligible || isMobile || lockToggleFor
                    ? undefined
                    : isLocked(selectedPart.selector)
                      ? 'Locked — unlock it to move or resize it here'
                      : placed[selectedPart.selector]
                      ? 'Double-click edits · drag places · arrows nudge'
                      : kfDraggable && selectedPart.kind === 'line'
                        ? 'Double-click edits · drag or arrows move'
                        : kfDraggable && selectedPart.kind !== 'root'
                          ? 'Drag or arrows key its position'
                          : selectedPart.kind === 'line'
                            ? 'Double-click to edit'
                            : selectedPart.kind === 'root'
                              ? 'Corner handle resizes'
                              : undefined,
                  action: pressEligible || lockToggleFor ? (
                    <>
                    {lockToggleFor && (
                    <button
                      className={`canvas-lock${isLocked(lockToggleFor) ? ' locked' : ''}`}
                      onClick={() => setPartLock(lockToggleFor, !isLocked(lockToggleFor))}
                      title={
                        isLocked(lockToggleFor)
                          ? 'Locked: canvas drags pass through to whatever sits on top of it. Click to unlock.'
                          : 'Unlocked: it takes canvas drags. Click to lock it out of the way.'
                      }
                      data-testid="canvas-lock"
                    >
                      {isLocked(lockToggleFor) ? '🔒 Locked' : '🔓 Unlocked'}
                    </button>
                    )}
                    {pressEligible && (
                    <select
                      className="canvas-appears"
                      value={selectedPress}
                      onChange={(e) => changePress(Number(e.target.value))}
                      title="When this part appears — with ▶ Play, or revealed by a press of » Next (the timeline gutter's control, from the canvas)"
                      data-testid="canvas-appears"
                    >
                      <option value={-1}>appears with ▶ Play</option>
                      {presses!.map((_, k) => (
                        <option key={k} value={k}>{`appears in “${stepNames![k] ?? `Step ${k + 2}`}”`}</option>
                      ))}
                      {/* The last press's only part moving to "a new press" would re-create
                          the same press — the gutter hides the option; so does the chip. */}
                      {!(
                        selectedPress === presses!.length - 1 &&
                        selectedPress >= 0 &&
                        presses![selectedPress].length === 1
                      ) && <option value={presses!.length}>appears in a new step »</option>}
                    </select>
                    )}
                    </>
                  ) : undefined,
                }
              : null
          }
          hover={
            !scaleDrag && !layerDrag?.active && !placeDrag?.active && !lasso?.active && hoverPart && hoverPart.selector !== selected
              ? { rect: hoverPart.rect, label: hoverPart.label }
              : null
          }
        />
      )}

      {/* Secondary selection outlines (multi-selection) — plain outlines, no chips;
          the primary (first selected) carries the chip above. */}
      {!ghost &&
        !editing &&
        toolArmed === 'select' &&
        extraRects.map((r, i) => (
          <div
            key={i}
            className="canvas-selection-outline secondary"
            data-testid="canvas-selection-extra"
            style={{ left: r.left * scale, top: r.top * scale, width: r.width * scale, height: r.height * scale }}
          />
        ))}

      {/* The context menu (right-click): swallows its own pointer input so the gesture
          layer never sees the click that picks an item. */}
      {ctxMenu && (
        <div
          className="canvas-context-menu"
          data-testid="canvas-context-menu"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onPointerDown={(e) => e.stopPropagation()}
          onContextMenu={(e) => e.preventDefault()}
        >
          <button
            onClick={() => {
              setCtxMenu(null);
              openInsertTemplate();
            }}
            title="Insert a graphic from the template catalog into this project — it joins the canvas, timeline, and states without replacing anything"
            data-testid="canvas-ctx-insert-template"
          >
            ✚ Add template graphic…
          </button>
        </div>
      )}

      {/* The area-text tool's rectangle — released, it becomes a wrapping text box. */}
      {areaDraft?.active && (
        <>
          <div
            className="canvas-area-draft"
            data-testid="canvas-area-draft"
            style={{
              left: Math.min(areaDraft.x0, areaDraft.x1) * scale,
              top: Math.min(areaDraft.y0, areaDraft.y1) * scale,
              width: Math.abs(areaDraft.x1 - areaDraft.x0) * scale,
              height: Math.abs(areaDraft.y1 - areaDraft.y0) * scale,
            }}
          />
          <div className="move-hint">Release for a text box · Esc cancels</div>
        </>
      )}

      {/* The lasso marquee — a drag on empty canvas selecting what it touches. */}
      {lasso?.active && (
        <div
          className="canvas-lasso"
          data-testid="canvas-lasso"
          style={{
            left: Math.min(lasso.x0, lasso.x1) * scale,
            top: Math.min(lasso.y0, lasso.y1) * scale,
            width: Math.abs(lasso.x1 - lasso.x0) * scale,
            height: Math.abs(lasso.y1 - lasso.y0) * scale,
          }}
        />
      )}

      {/* W2 — the corner scale handle: shows while hovering the graphic (and stays while
          the whole graphic is selected); drag = --scale. */}
      {handleRect && !ghost && !editing && toolArmed === 'select' && (
        <div
          className={`scale-handle${scaleDrag ? ' dragging' : ''}`}
          data-testid="scale-handle"
          style={{
            left: (handleRect.left + handleRect.width) * scale - 5,
            top: (handleRect.top + handleRect.height) * scale - 5,
          }}
          title="Drag to resize (writes the --scale variable, like the Style panel's size)"
          onPointerDown={startScaleDrag}
          onPointerMove={moveScaleDrag}
          onPointerUp={endScaleDrag}
          onPointerCancel={() => { setScaleDrag(null); postCanvasCmd(win(), { cmd: 'set-scale-var', value: null }); }}
        />
      )}
      {scaleDrag && (
        <div className="move-hint">×{scaleDrag.value.toFixed(2)} — release to apply</div>
      )}

      {/* The selected layer's scale (corner) + rotate (top) handles — key scale/rotation at
          the playhead, pivoting around the Inspector pivot. Data-block, single-layer only. */}
      {layerTfSel && selRect && !ghost && !editing && !layerDrag?.active && !placeDrag?.active && toolArmed === 'select' && (
        <>
          <div
            className={`layer-scale-handle${layerTf?.kind === 'scale' ? ' dragging' : ''}`}
            data-testid="layer-scale-handle"
            style={{ left: (selRect.left + selRect.width) * scale - 6, top: (selRect.top + selRect.height) * scale - 6 }}
            title="Drag to scale — keys the scale at the playhead (pivots around the Inspector pivot)"
            onPointerDown={(e) => startLayerTf(e, 'scale')}
            onPointerMove={moveLayerTf}
            onPointerUp={endLayerTf}
            onPointerCancel={cancelLayerTf}
          />
          <div
            className={`layer-rotate-handle${layerTf?.kind === 'rotate' ? ' dragging' : ''}`}
            data-testid="layer-rotate-handle"
            style={{ left: (selRect.left + selRect.width / 2) * scale - 7, top: selRect.top * scale - 24 }}
            title="Drag to rotate — keys the rotation at the playhead"
            onPointerDown={(e) => startLayerTf(e, 'rotate')}
            onPointerMove={moveLayerTf}
            onPointerUp={endLayerTf}
            onPointerCancel={cancelLayerTf}
          />
        </>
      )}
      {layerTf?.active && (
        <div className="move-hint">
          {layerTf.kind === 'scale' ? `×${layerTf.value.toFixed(2)}` : `${Math.round(layerTf.value)}°`}
          {' '}— release to key at the playhead · Esc cancels
        </div>
      )}

      {/* A single selected PLACED field's corner handle resizes its DESIGN — a text line's
          font-size, or an image slot's box — in its own CSS rules, never a scale keyframe. */}
      {lineSizeSel && selRect && !ghost && !editing && !placeDrag?.active && toolArmed === 'select' && (
        <div
          className={`layer-scale-handle${lineSize ? ' dragging' : ''}`}
          data-testid="line-size-handle"
          style={{ left: (selRect.left + selRect.width) * scale - 6, top: (selRect.top + selRect.height) * scale - 6 }}
          title={
            lineSizeSel.kind === 'font'
              ? "Drag to resize the text — writes this line's font-size in the CSS"
              : lineSizeSel.kind === 'area'
                ? 'Drag to resize the text box — the text rewraps to the new width'
                : "Drag to resize the slot — writes its box size in the CSS"
          }
          onPointerDown={startLineSize}
          onPointerMove={moveLineSize}
          onPointerUp={endLineSize}
          onPointerCancel={() => {
            const d = lineSizeRef.current;
            if (d) clearLineSizePreview(d);
            setLineSize(null);
          }}
        />
      )}
      {lineSize?.active && (
        <div className="move-hint">
          {lineSize.kind === 'font'
            ? `${lineSize.value}px`
            : lineSize.kind === 'area'
              ? `${lineSize.value}px wide`
              : `${lineSize.value} × ${lineSize.valueH}px`}
          {' '}— release to resize · Esc cancels
        </div>
      )}

      {/* The placement drag's hint: live design-px position, committed into the CSS rule. */}
      {placeDrag?.active && placeDrag.lines.length > 0 && (
        <div className="move-hint">
          {placeDrag.lines.length > 1 ? `${placeDrag.lines.length} fields · ` : ''}
          x {Math.round(placeDrag.lines[0].baseX + placeDrag.dx)} · y{' '}
          {Math.round(placeDrag.lines[0].baseY + placeDrag.dy)} — release to place · Esc cancels
        </div>
      )}

      {/* The position-keyframe drag's hint: live x/y, committed at the playhead. */}
      {layerDrag?.active && layerDrag.layers.length > 0 && (
        <div className="move-hint">
          {layerDrag.layers.length > 1 ? `${layerDrag.layers.length} layers · ` : ''}
          x {Math.round(layerDrag.layers[0].baseX + layerDrag.dx)} · y{' '}
          {Math.round(layerDrag.layers[0].baseY + layerDrag.dy)} — release to key position at the playhead · Esc
          cancels
        </div>
      )}

      {/* The 9-zone grid + ghost — only while a real drag is under way. */}
      {ghost && (
        <>
          <div className="move-grid" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <div key={i} className={`move-cell${cell && cell.row * 3 + cell.col === i ? ' target' : ''}`} />
            ))}
          </div>
          <div className="move-ghost" style={ghost} />
          <div className="move-hint">Release to place · Esc cancels</div>
        </>
      )}

      {/* The inline text editor — positioned over the text element it edits. */}
      {editing && (
        <div className="inline-edit" style={{
          left: editing.rect.left * scale - 6,
          top: editing.rect.top * scale - 6,
          minWidth: Math.max(160, editing.rect.width * scale + 12),
        }}>
          {editing.multiline ? (
            <textarea
              ref={(el) => { editInputRef.current = el; }}
              data-testid="inline-editor"
              rows={4}
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit();
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commitEdit();
              }}
            />
          ) : (
            <input
              ref={(el) => { editInputRef.current = el; }}
              data-testid="inline-editor"
              value={editing.value}
              onChange={(e) => setEditing({ ...editing, value: e.target.value })}
              onBlur={commitEdit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') cancelEdit();
                if (e.key === 'Enter') commitEdit();
              }}
            />
          )}
        </div>
      )}
    </div>
  );
}
