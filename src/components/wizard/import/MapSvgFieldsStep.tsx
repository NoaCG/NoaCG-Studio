import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { uuid } from '../../../model/id';
import type { DraftPatch, WizardDraft } from '../draft/core';
import type {
  DesignFieldSpec,
  SvgFollowerDraft,
  SvgFieldDraft,
  SvgImageDraft,
  SvgOutlineDraft,
  SvgStretchMode,
} from './draft';
import {
  modeOfAxis,
  pollDrivenLayers,
} from './draft';
import { SVG_ALIGN_WORD } from '../../../templates/importedDesign/svg';
import type { PreviewBoxOverlay, PreviewGrowCap } from '../WizardPreview';
import {
  artworkInk as inkOfArtwork,
  type FillLayer,
} from './fieldAutoMap';
import { SVG_CANDIDATE_ATTR } from '../../../assets/svgImport';
import FontsSection from './FontsSection';
import BehaviourSection from './BehaviourSection';
import SectionHead from '../SectionHead';
import {
  isTextLayer,
  measureBoxes,
  proposeFollowers,
  repeatsWithNewContent,
  proposeBannerGrowth,
  panelsHoldingText,
  panelOfEachLine,
  type BoxFit,
  ALIGN_H,
  ALIGN_V,
  alignOf,
  nudgeOffered,
  nudgeWords,
  boxFitOf,
  capClamped,
  capLines,
  growCapOf,
  type GrowCapFit,
  withoutBackplates,
  boxLooksOf,
  measureOutline,
} from './stageMeasure';
import './mapSvgFields.css';

interface Props {
  draft: WizardDraft;
  onDraft: (patch: DraftPatch) => void;
  /** Which layer the checklist is pointing at, for the PREVIEW's highlight (the step's one
   *  canvas — CreationWizard owns the state because the canvas is beside the step, not in it). */
  onHover: (candidateId: string | null) => void;
  /**
   * TEXT AND ITS BOX, on the preview (docs/TEXT_BOX_BINDING.md, "the preview overlay"). Reported
   * beside the hover rather than folded into it because the two are different statements: the
   * hover says WHICH layer a row names, and this says which box that layer lives in, how much
   * room the designer left round it and how they aligned it. Null while nothing is hovered, and
   * for a line with no box of its own - text on the artwork has no room to show.
   */
  onBoxOverlay: (overlay: PreviewBoxOverlay | null) => void;
  /**
   * HOW FAR EACH GROWING BOX MAY REACH (docs/TEXT_BOX_BINDING.md, rung 4): one line per box that
   * grows, drawn on the preview. Measured and WORDED here, because both answers are facts about
   * the drawing - where the limit stands and how many lines it buys at the size the text was
   * drawn - and the canvas draws what it is handed.
   */
  onGrowCaps: (caps: PreviewGrowCap[]) => void;
  /**
   * And the handler that takes one back when the reader moves it, armed the way the draw and
   * pick handlers are and for the same reason: its closure reads the draft, so it is a fresh
   * function on every keystroke and holding it in the wizard's STATE would loop.
   */
  onArmCap: (handler: ((boxId: string, margin: number) => void) | null) => void;
  /**
   * ADD A FIELD BY DRAWING ONE (docs/SVG_IMPORT_PLAN.md §6a step 3). Arming reports a HANDLER
   * rather than a flag: the preview gives back a box in fractions of the artwork's rect, and
   * the only code that can turn that into design px is this step, which is the one holding the
   * SVG. Null disarms. CreationWizard just hands the handler to the canvas.
   */
  onArmDraw: (handler: ((box: { x: number; y: number; w: number; h: number }) => void) | null) => void;
  /**
   * THE CANVAS AS A CONTROL SURFACE (docs/SVG_IMPORT_PLAN.md §6a step 5). Reported the same way
   * as the draw handler and for the same reason: the canvas answers WHICH layer was picked, and
   * only this step knows what picking one means. `drag` is the direction of a click-drag, which
   * is how a rectangle is told which way to grow without hunting for a second control.
   */
  onArmPick: (handler: ((candidateId: string, drag: 'x' | 'y' | null) => void) | null) => void;
}

/** The four rungs of the too-long ladder, as the select spells them (draft.ts owns the type -
 *  a per-plate override is stored as one of these). */
type StretchMode = SvgStretchMode;

const STRETCH_AXIS: Record<Exclude<StretchMode, 'shrink'>, 'x' | 'y' | 'xy'> = {
  'grow-x': 'x',
  'grow-xy': 'xy',
  'grow-y': 'y',
};

/** THE LADDER, IN THE OWNER'S ORDER (2026-08-26): "first I want it to get wider, and then it
 *  should go to the next line. And the last thing is to shrink" - shrink last "because that
 *  changes the design more". The runtime already runs in that order, so this list IS the order,
 *  and every box's select offers it. The WORDS are below. */
const STRETCH_ORDER: StretchMode[] = ['grow-x', 'grow-xy', 'grow-y', 'shrink'];

/**
 * THE FOUR RUNGS, SAID AS THE BOX (docs/TEXT_BOX_BINDING.md, rung 4). The select sits on the
 * heading row that already names the shape, so "The panel gets wider" would name a second thing
 * beside the first: the row IS the shape, and the option is what happens to it.
 *
 * EVERY OPTION NAMES THE BOX, because the box is the only thing that differs (2026-09-05). Two
 * of these used to name the TEXT - "the text wraps onto more lines", "the text gets smaller" -
 * and both were false as descriptions of a choice. The ladder is one order for all four (fill
 * the room, grow where allowed, wrap into what is there, shrink, squeeze), so the text wraps
 * under every option and shrinks under every option; what the reader is choosing is how much
 * room the box is allowed to offer it first.
 *
 * Measured on the owner's own board, one question at three lengths, all four options each time:
 * at 147 and 295 characters the four give IDENTICAL text - same size, same line count - and only
 * the panel's width differs. So a reader switching between "the text gets smaller" and "the text
 * wraps onto more lines" watched the text do exactly the same thing and reasonably concluded the
 * control was dead (owner, 2026-09-05: "I can change how the text should react, but nothing
 * happens in the preview"). The rungs only diverge on copy no panel could hold - at 591
 * characters they finally do, correctly and four different ways.
 */
const BOX_GROW_LABEL: Record<StretchMode, string> = {
  'grow-x': 'gets wider',
  'grow-xy': 'gets wider, then taller',
  'grow-y': 'gets taller',
  shrink: 'stays as drawn',
};

/* WHICH WAY IT WIDENS IS THE ARTWORK'S ANSWER, not a fixed one (svg.ts `svgGrowDir`): a panel
   holding start-anchored text widens to the right, because that is the only side those lines
   gain from, and one holding centred text widens from its middle so the composition survives.
   Saying "to the right" was true of the runtime until 2026-09-04 and is no longer. */
const STRETCH_HINT: Record<Exclude<StretchMode, 'shrink'>, string> = {
  'grow-x': 'It widens the way you composed it, and the type stays the size you drew.',
  'grow-xy': 'It widens first. Once it reaches the margin it gets taller and the text wraps.',
  'grow-y': 'It gets taller and the text wraps into the new height.',
};



/** Does this row belong with the text-shaped ones? An unmeasured row (null) does — it has not
 *  been judged, and demoting it would bury a row for a reason nobody can see. A row the reader
 *  already ticked does too, whatever the measurement thought. */
function rowIsTexty(f: SvgOutlineDraft): boolean {
  return f.on || f.looksLikeText !== false;
}


/**
 * "Import graphic" (SVG), the mapping step — which text layers become operator fields
 * (docs/SVG_IMPORT_PLAN.md §2).
 *
 * No renaming ritual: every detected text layer is offered, labels prefilled from the layer
 * names, ALL ON by default (or only the `f:`-prefixed ones when the file opted in by name) —
 * the graphic should work with zero clicks. The checklist and the artwork are one surface:
 * hovering a row highlights the exact text it binds, because "which layer is this" is the
 * only question the step really has to answer.
 *
 * ONE CANVAS, AND IT IS THE PREVIEW (docs/SVG_IMPORT_PLAN.md §6a step 1). This step used to
 * draw the sanitized markup beside the preview and answer the same question twice — and only
 * the preview could answer it, because only the preview runs the emitted fit: a value the
 * ladder had already wrapped and shrunk showed here as clipped and running off the artwork,
 * at three times the area of the truthful picture next to it. So the markup is still RENDERED
 * (measureOutline reads `getBoundingClientRect`, which is zero inside a `display: none`
 * subtree) but off screen, and the hover highlight moved onto the preview through the rect
 * channel the editor canvas already uses (`preview/canvasControlProtocol.ts`) — the wizard
 * preview iframe deliberately carries no allow-same-origin, so nothing reaches into it.
 */
export default function MapSvgFieldsStep({
  draft,
  onDraft,
  onHover,
  onBoxOverlay,
  onGrowCaps,
  onArmCap,
  onArmDraw,
  onArmPick,
}: Props) {
  const svg = draft.designSvg;
  const stageRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [drawArmed, setDrawArmed] = useState(false);
  // While armed, a pick on the artwork adds or drops a FOLLOWER instead of binding a field
  // (plan §6c). Two meanings for one gesture need a mode, and the mode is a visible button
  // rather than a modifier key nobody would find.
  const [followArmed, setFollowArmed] = useState(false);

  // The hover highlight is drawn on the PREVIEW, so the hovered layer is reported up rather
  // than measured here — and reported as a candidate id, because that marker is what the
  // preview's markup keeps (WizardOptions.previewMarkers). Cleared when the step unmounts:
  // an outline left lit over a graphic nobody is choosing layers for any more is a lie.
  useEffect(() => {
    onHover(hoverId);
  }, [hoverId, onHover]);
  useEffect(() => () => onHover(null), [onHover]);

  // ── ADD A FIELD WHERE THE FILE DREW NOTHING (docs/SVG_IMPORT_PLAN.md §6a step 3) ──
  // The imported SVG is a STAGE, not immutable artwork: a show needs a line the designer never
  // drew, and the honest answer is to draw it on the artwork rather than to send the reader to
  // the editor for it. The box arrives as fractions of the artwork's own rect, so this is where
  // it becomes DESIGN px — the space addPlacedLine speaks.
  const placeDrawnField = useCallback(
    (box: { x: number; y: number; w: number; h: number }) => {
      if (!svg) return;
      const w = box.w * svg.width;
      const h = box.h * svg.height;
      // A CLICK is a drag of no size, and a 2px field is nobody's intention — read it as
      // "put a field here" and give it a field-shaped box at that point instead.
      const tap = w < svg.width * 0.02 || h < svg.height * 0.02;
      const width = Math.max(64, Math.round(tap ? svg.width * 0.3 : w));
      // The drawn box IS the type's em box (line-height 1 below), which is what makes the
      // field land where the reader drew it rather than a guess away from it.
      const fontSize = Math.max(10, Math.min(Math.round(tap ? svg.height * 0.06 : h), Math.round(svg.height * 0.5)));
      // The first "Text n" nobody is using. Counting the list would re-issue a name the moment
      // one is removed, and two operator inputs labelled the same is a control page nobody can
      // read - the labels ARE the field names on every surface.
      const taken = new Set(draft.designFields.map((f) => f.title));
      let n = 1;
      while (taken.has(`Text ${n}`)) n += 1;
      const title = `Text ${n}`;
      onDraft({
        designFields: [
          ...draft.designFields,
          {
            id: uuid(),
            title,
            text: title,
            x: Math.round(box.x * svg.width),
            y: Math.round(box.y * svg.height),
            kind: 'area',
            width,
            // ONE FIT (plan §6b): a placed line on an SVG design is measured by the ladder,
            // which reads `data-fit="shrink"`. A wrapping line would be the one field the
            // operator's too-long warning cannot see.
            fit: 'shrink',
            fontId: null,
            fontSize,
            weight: null,
            // The design's own text token — there is no artwork behind a field nobody drew to
            // sample a colour from, and the project's colour is the honest default.
            color: 'var(--text-color)',
            // The reader drew where the text STARTS. A centre rule belongs to a field standing
            // in for something already drawn (the outlined-text seed), not to a fresh one.
            align: 'left',
            lineHeight: 1,
            letterSpacing: null,
          },
        ],
      });
      setDrawArmed(false);
    },
    [svg, draft.designFields, onDraft],
  );

  // Arming IS reporting the handler; disarming is reporting null, and so is leaving the step —
  // a canvas still armed for a graphic nobody is mapping any more would swallow the next drag.
  useEffect(() => {
    onArmDraw(drawArmed ? placeDrawnField : null);
  }, [drawArmed, placeDrawnField, onArmDraw]);
  useEffect(() => () => onArmDraw(null), [onArmDraw]);

  // ── WHAT TRAVELS WITH THE GROWING ELEMENT (docs/SVG_IMPORT_PLAN.md §6c) ──
  // Geometry PROPOSES and the author edits. The proposal is measured on this step's own
  // rendered artwork, so what the reader sees listed is what the runtime would have guessed;
  // touching it MATERIALIZES the whole set into the draft, and from then on the list is the
  // answer rather than a preview of one.
  const [proposed, setProposed] = useState<{ artwork: string[]; text: string[] }>({
    artwork: [],
    text: [],
  });
  const growId = draft.svgStretch.on ? draft.svgStretch.shapeId : null;
  // The FOLLOWER proposal is a sideways measurement whenever the panel widens at all — the
  // combination's declared set rides its sideways row (draft.ts `svgGrowthOptions`), and its
  // downward row derives its own.
  const growAxis = draft.svgStretch.axis === 'y' ? 'y' : 'x';

  // EVERY BOUND LINE, of both kinds, and every line the reader DREW - the one statement of
  // "what has to fit in this artwork", read by the two measurements that ask it (which shapes
  // are worth offering as the one that grows, and whether the board draws a repeated row).
  // Written once because two spellings of one set is how the two answers drift apart, and
  // memoized on the answer rather than rebuilt per render so neither effect re-runs on every
  // keystroke. The drawn rows and the ticked outline rows are markers in the artwork; a drawn
  // field is its own geometry.
  const boundLineKey = [
    ...draft.svgFields.filter((f) => f.on).map((f) => f.candidateId),
    ...draft.svgOutlines.filter((f) => f.on && f.box).map((f) => f.candidateId),
  ].join('|');
  const boundMarkerIds = useMemo(
    () => (boundLineKey ? boundLineKey.split('|') : []),
    [boundLineKey],
  );
  // AND EVERY TEXT ROW, ticked or not, for the checklist's grouping. Which box a line sits in is
  // a fact about where it was DRAWN, so an unticked row keeps its place in the list rather than
  // jumping to "On the artwork" and back as somebody works down the checkboxes.
  const allLineKey = [
    ...draft.svgFields.map((f) => f.candidateId),
    ...draft.svgOutlines.filter((f) => f.box).map((f) => f.candidateId),
  ].join('|');
  const allMarkerIds = useMemo(() => (allLineKey ? allLineKey.split('|') : []), [allLineKey]);
  const placedLines = useMemo(
    () => draft.designFields.map((f) => ({ x: f.x, y: f.y, fontSize: f.fontSize ?? 0 })),
    [draft.designFields],
  );

  // ── GROWTH DEFAULTS ON WHERE THE ARTWORK IS UNAMBIGUOUS (docs/GOALS.md NOW goal 5) ──
  // Measured on the step's own render, and only while the author has not touched a growth
  // control: an authored answer is never recomputed, while the proposal follows the rows (a
  // banner whose only line was unticked stops proposing) and stands down the moment a
  // behaviour is attached - a quiz board is a stage. The no-patch-when-equal guard is what
  // keeps this from re-running itself forever.
  useEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage || draft.svgStretch.authored) return;
    const onIds = draft.svgFields.filter((f) => f.on).map((f) => f.candidateId);
    // WHICH shape a longer value would grow, asked WHATEVER the graphic turns out to be: a quiz
    // board's banner is still its question's plate. Answering null the moment a behaviour was
    // attached left the proposal at `svg.shapes[0]` - the board's own BACKPLATE, since the
    // inventory is widest-first - and a reader who then overrode the ladder grew that instead of
    // the plate their question sits in.
    const banner = proposeBannerGrowth(stage, svg, onIds);
    // The shapes a line actually sits in, MEASURED HERE rather than read off `panelIds` below.
    // That state is filled by a LAYOUT effect, so in the commit that first renders the artwork
    // this one would see it still empty, propose growth, and correct itself on the next pass - a
    // control that flickers through an answer nobody chose, and a draft patch to go with it. The
    // function is a pure measurement; calling it twice in a commit costs a walk of the shapes.
    const holders = panelsHoldingText(stage, svg, boundMarkerIds, placedLines);
    // A GRAPHIC THE AUDIENCE SEES AGAIN KEEPS A FIXED BOX (owner, 2026-09-02; the doctrine's
    // rule 3 in docs/TEXT_BOX_BINDING.md). The two halves are asked separately on purpose:
    // WHICH shape is a banner is geometry, and WHETHER it may grow is what the graphic is for.
    // The artwork answers the second on its own (a repeated row), and an attached BEHAVIOUR
    // answers it outright - a board that selects and reveals declares a stage.
    const grows = !!banner && !draft.svgBehaviour && !repeatsWithNewContent(stage, holders);
    const cur = draft.svgStretch;
    // THE MEASURED DEFAULT IS THE WHOLE LADDER, not its first rung (owner walk, 2026-08-29).
    // The order is ratified - wider, then onto a new line, and smaller LAST because it changes
    // the design most - so a default of 'x' alone skips the wrap rung and lands a long name
    // straight on the one rung that was meant to come last. 'xy' is both rows on the one panel;
    // where the artwork has no room to grow taller the runtime grants zero and the graphic
    // behaves exactly as 'x' did.
    const want = grows
      ? { on: true, shapeId: banner, axis: 'xy' as const }
      : { on: false, shapeId: banner ?? svg.shapes[0]?.id ?? null };
    const settled =
      cur.on === want.on && cur.shapeId === want.shapeId && (!want.on || (cur.axis ?? 'x') === 'xy');
    if (settled) return;
    onDraft({ svgStretch: want });
  }, [svg, draft.svgFields, boundMarkerIds, placedLines, draft.svgBehaviour, draft.svgStretch, onDraft]);
  useEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage || !growId) {
      setProposed({ artwork: [], text: [] });
      return;
    }
    setProposed(proposeFollowers(stage, svg, growId, growAxis));
  }, [svg, growId, growAxis]);

  // ── WHICH SHAPES ARE WORTH OFFERING AS THE ONE THAT GROWS (owner walk, 2026-09-01) ──
  // A LAYOUT effect, not an ordinary one: the picker's presence depends on this measurement, so
  // measuring after paint would show the question for one frame and then take it away - which is
  // worse than either answer. The stage is rendered off screen in this same tree, so it is laid
  // out by the time this runs.
  const [panelIds, setPanelIds] = useState<string[]>([]);
  /** Text row -> the box the CHECKLIST groups it under: the plate it sits on, minus the board's
   *  own backplate, which is a heading over everything rather than a grouping of anything. */
  const [boxOfRow, setBoxOfRow] = useState<Record<string, string>>({});
  /** Plate -> its swatch colour and the name the checklist heads it with. */
  const [boxLooks, setBoxLooks] = useState<Record<string, { fill: string; name: string }>>({});
  /** Text row -> its box, the room round it and the alignment it was drawn with, all in the
   *  LINE's own units (`boxFitOf`). What the preview overlay draws while that row is hovered. */
  const [boxFits, setBoxFits] = useState<Record<string, BoxFit>>({});
  /** Box -> how far it may grow and how far it may be told to grow (`growCapOf`). Measured for
   *  the boxes that CAN get taller and nothing else, so a board where nothing grows measures
   *  nothing at all. */
  const [capFits, setCapFits] = useState<Record<string, GrowCapFit>>({});
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage) {
      setPanelIds([]);
      setBoxOfRow({});
      setBoxLooks({});
      setBoxFits({});
      return;
    }
    setPanelIds(panelsHoldingText(stage, svg, boundMarkerIds, placedLines));
    const grouped = withoutBackplates(stage, panelOfEachLine(stage, svg, allMarkerIds));
    setBoxOfRow(grouped);
    setBoxLooks(boxLooksOf(stage, svg, Object.values(grouped)));
    const fits: Record<string, BoxFit> = {};
    for (const [lineId, boxId] of Object.entries(grouped)) {
      const fit = boxFitOf(stage, lineId, boxId);
      if (fit) fits[lineId] = fit;
    }
    setBoxFits(fits);
  }, [svg, boundMarkerIds, allMarkerIds, placedLines]);

  // ── WHERE EVERY LAYER SITS, FOR THE UNMATCHED COUNT (fieldAutoMap.ts, `isPlate`) ──
  // The notice says how many layers nothing is using, and without geometry it counts the board's
  // own backplate as one of them. A layer's box is a fact about the ARTWORK and not about which
  // rows are ticked, so it is measured once per file over every candidate the importer found and
  // read back by id below.
  //
  // A LAYOUT effect, for the reason the grouping above is one: the count is a NUMBER on screen,
  // and measuring after paint would print the inflated one for a frame and then correct it.
  //
  // It re-runs when a FONT lands, because `uploadFont` below registers the face under the very
  // family the artwork asks for - so the stage's text stops being laid out in the fallback and
  // the ink moves under a number the reader is looking at.
  const [layerBoxes, setLayerBoxes] = useState<Map<string, FillLayer['box']>>(new Map());
  const fontKey = draft.svgFonts.map((f) => `${f.family}:${f.customFont?.asset.path ?? f.fontId ?? ''}`).join('|');
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage) {
      setLayerBoxes(new Map());
      return;
    }
    // Deduped for `proposeFollowers`' reason: one id may sit in two inventories, because a
    // picture-filled backplate is offered both as a picture and as a panel that grows.
    const ids = [...new Set([...svg.groups, ...svg.shapes, ...svg.candidates, ...svg.images, ...svg.outlines].map((c) => c.id))];
    setLayerBoxes(measureBoxes(stage, ids));
  }, [svg, fontKey]);
  /** The artwork the plate rule is measured against, from every box the step could read. */
  const artworkInk = useMemo(() => inkOfArtwork([...layerBoxes.values()]), [layerBoxes]);

  // TEXT AND ITS BOX, for the hovered row. Only a row that HAS a box and that the step could
  // measure gets one: a line sitting straight on the artwork has no room to draw and nothing to
  // be aligned in, and the plain outline is the whole truthful answer there.
  // THE CARET SAYS WHAT THE GRID SAYS. The insets stay the drawing's own - a margin the designer
  // left is a margin whichever edge the block is sent to, and the runtime keeps exactly that one
  // on a declared anchor - but the word under the block is the row's current answer.
  // Keyed on the hovered row's DECLARED answer rather than on the field list, which is a fresh
  // array on every keystroke in a Text box: a patch copies the row and keeps its `align` object,
  // so the overlay is re-sent when the grid is clicked and not while the reader types.
  const hoveredAlign = hoverId ? draft.svgFields.find((f) => f.candidateId === hoverId)?.align : undefined;
  useEffect(() => {
    const boxId = hoverId ? boxOfRow[hoverId] : undefined;
    const fit = hoverId ? boxFits[hoverId] : undefined;
    onBoxOverlay(
      boxId && fit
        ? {
            selector: `[${SVG_CANDIDATE_ATTR}="${boxId}"]`,
            box: fit.box,
            insetX: fit.insetX,
            insetY: fit.insetY,
            align: alignOf(hoveredAlign, fit),
          }
        : null,
    );
  }, [hoverId, boxOfRow, boxFits, onBoxOverlay, hoveredAlign]);
  useEffect(() => () => onBoxOverlay(null), [onBoxOverlay]);

  // ── GROWTH IS CHOSEN PER BOX (docs/TEXT_BOX_BINDING.md, rung 4) ──
  // The owner's question, on his own quiz board: "What if you want it to react differently
  // between the question and the answer?" The answer is that the BOX says it, on the heading
  // row that already names it - so the shape is never asked for, because the row is the shape.
  //
  // KEYED BY THE PLATE, because growth is something a rectangle does for whatever text sits
  // inside it: two lines sharing one plate cannot be given opposite answers, and a map keyed by
  // layer would let a reader ask for that and then silently pick one.
  //
  // WHAT THE DRAFT HOLDS DID NOT MOVE. `svgStretch` still carries one box in `shapeId` and the
  // rest in `perPanel`, and the emitter still writes one row per box per axis (draft.ts
  // `svgGrowthOptions`) - so no persisted shape changed and no import emits different bytes for
  // the same answers. The one box in `shapeId` is now simply THE BOX THAT CARRIES THE DECLARED
  // FOLLOWERS, which is the only thing the format attaches to a single rule, and the reader
  // never sees the distinction.
  const perPanel = draft.svgStretch.perPanel ?? {};
  /** WHAT ONE BOX DOES WITH A LONG VALUE, as the draft stands: its own answer where it has one,
   *  else the carrier's answer where this is the carrier, else it stays as drawn. */
  const modeOfBox = (boxId: string): StretchMode =>
    perPanel[boxId] ??
    (draft.svgStretch.on && draft.svgStretch.shapeId === boxId
      ? modeOfAxis(draft.svgStretch.axis)
      : 'shrink');
  /** Give one box its answer. Touching this is AUTHORING, like every other growth control: the
   *  measured default stops re-deriving from that moment on.
   *
   *  THE CARRIER FOLLOWS THE READER. A box told to grow while no box is growing takes the
   *  carrier slot, so its travellers are the ones the "What else moves" list shows and emits;
   *  a second box growing beside it is an ordinary per-box row and derives its own at play time,
   *  which is what the runtime has always done for a rule with no declared list. */
  const setBoxMode = (boxId: string, mode: StretchMode) => {
    const cur = draft.svgStretch;
    const carrier = cur.on ? cur.shapeId : null;
    const rest = { ...perPanel };
    // The box's own answer is rewritten from scratch either way, so a box that used to be an
    // override and is now the carrier is never both.
    delete rest[boxId];
    // Emptied back out rather than left as `{}`, so a reader who sets an answer and puts it back
    // emits exactly the bytes they started with.
    const clean = (map: Record<string, StretchMode>) =>
      Object.keys(map).length > 0 ? map : undefined;
    if (mode === 'shrink') {
      onDraft({
        svgStretch: {
          ...cur,
          authored: true,
          ...(carrier === boxId ? { on: false } : {}),
          perPanel: clean(rest),
        },
      });
      return;
    }
    if (carrier === null || carrier === boxId) {
      onDraft({
        svgStretch: {
          ...cur,
          authored: true,
          on: true,
          shapeId: boxId,
          axis: STRETCH_AXIS[mode],
          // A set measured against ANOTHER box is not this box's set, so taking the slot hands
          // the travellers back to the geometry; staying on the same box keeps what the reader
          // declared, exactly as changing the axis alone always did.
          ...(carrier === boxId ? {} : { followers: null }),
          perPanel: clean(rest),
        },
      });
      return;
    }
    onDraft({
      svgStretch: { ...cur, authored: true, perPanel: clean({ ...rest, [boxId]: mode }) },
    });
  };

  // ── THE CHECKLIST, GROUPED BY THE BOX EACH LINE SITS IN ──
  // "Every text field lives in a box: the shape drawn under it", and THE GROUPING IS THE BINDING
  // (docs/TEXT_BOX_BINDING.md, step 2). The step already decided which box holds which line -
  // `panelOfEachLine` is what the per-box growth answers are keyed on - and until now it decided
  // it silently. A reader could not see that the question and its four answers were understood as
  // five separate boxes rather than one board, which is the first thing that has to be true
  // before any per-box answer means anything.
  //
  // ORDERED BY WHERE EACH BOX FIRST APPEARS, and document order kept inside it, so a board reads
  // top-to-bottom the way it is drawn. Text inside no shape comes last under its own heading: it
  // has no box to grow, and saying so is more useful than heading it with a shape it is not in.
  const fieldGroups = useMemo(() => {
    type Group = { boxId: string | null; label: string; fields: SvgFieldDraft[] };
    // A GROUP IS A RUN OF CONSECUTIVE ROWS, never every row sharing a box gathered together.
    // Document order is the order the reader drew in and the order they scan in, and a checklist
    // that quietly re-sorts it is worse than one that repeats a heading: measured twice on the
    // corpus, where collecting rows by box moved a question BELOW its own four answers on the
    // Affinity board (whose backplate is 73% of the frame, so the question is loose while the
    // answers are not) and swapped the two lines of the Inkscape bumper. So the box a row is in
    // is shown, and where a row sits is never touched.
    const groups: Group[] = [];
    for (const f of draft.svgFields) {
      const boxId = boxOfRow[f.candidateId] ?? null;
      const last = groups[groups.length - 1];
      if (last && last.boxId === boxId) last.fields.push(f);
      else groups.push({ boxId, label: '', fields: [f] });
    }
    // NUMBERED WHERE THE NAME REPEATS, and only there. A quiz board draws four answer plates in
    // one colour, so four headings reading "Orange plate" name nothing - while a board with one
    // orange plate should not be told it is orange plate 1 of 1. Numbered per BOX rather than per
    // run, so a box a reader returns to keeps the number it had.
    const nameOf = (g: Group) => (g.boxId ? boxLooks[g.boxId]?.name ?? 'Plate' : 'On the artwork');
    const boxesPerName = new Map<string, Set<string>>();
    for (const g of groups) {
      if (!g.boxId) continue;
      const set = boxesPerName.get(nameOf(g)) ?? new Set<string>();
      set.add(g.boxId);
      boxesPerName.set(nameOf(g), set);
    }
    const numberOf = new Map<string, number>();
    const used = new Map<string, number>();
    for (const g of groups) {
      if (!g.boxId || (boxesPerName.get(nameOf(g))?.size ?? 0) < 2) continue;
      if (numberOf.has(g.boxId)) continue;
      const n = (used.get(nameOf(g)) ?? 0) + 1;
      used.set(nameOf(g), n);
      numberOf.set(g.boxId, n);
    }
    for (const g of groups) {
      const n = g.boxId ? numberOf.get(g.boxId) : undefined;
      g.label = n === undefined ? nameOf(g) : `${nameOf(g)} ${n}`;
    }
    return groups;
  }, [draft.svgFields, boxOfRow, boxLooks]);
  /** ONE BOX HOLDING EVERY LINE IS NOT A GROUPING - but it is still the thing that grows, and
   *  the heading is now where its answer lives. So a heading appears wherever there is more than
   *  one place to put text, AND on the single box a lower third draws, whose hug would otherwise
   *  have no control at all. Text inside no shape still gets no heading of its own on a file
   *  with one group: there is nothing to say about it and nothing to set. */
  const showBoxGroups = fieldGroups.length > 1 || !!fieldGroups[0]?.boxId;

  // ── HOW FAR A GROWING BOX MAY REACH (docs/TEXT_BOX_BINDING.md, rung 4) ──
  // The limit is a line on the preview the reader can move, and every value it can reach is a
  // value the growth can keep: the two ends are the frame's safe margin and the box's own drawn
  // edge, so a wrong answer is UNREACHABLE rather than warned about.
  //
  // Offered on the boxes that may get TALLER and on no others, which is a departure from the
  // design's own text and is recorded there: downwards the runtime has one answer for which way
  // a box grows, and downwards is where "we shouldn't be able to put one page of text" lives.
  /** Every box that grows, in the checklist's own order, with the name the reader sees it under.
   *  One entry per box even where its rows are split across two runs. */
  const growingBoxes: { boxId: string; label: string; mode: Exclude<StretchMode, 'shrink'> }[] = [];
  const capBoxes: string[] = [];
  for (const g of fieldGroups) {
    if (!g.boxId || growingBoxes.some((b) => b.boxId === g.boxId)) continue;
    const mode = modeOfBox(g.boxId);
    if (mode === 'shrink') continue;
    growingBoxes.push({ boxId: g.boxId, label: g.label, mode });
    // ONLY A BOX THAT MAY GET TALLER CARRIES A LINE (see above).
    if (mode === 'grow-y' || mode === 'grow-xy') capBoxes.push(g.boxId);
  }
  // AND ANY BOX THIS CHECKLIST CANNOT HEAD. A plate whose only editable text is a replaced
  // OUTLINE row has no heading here - those rows are their own section - and a drag on the
  // artwork still turns growth on for any shape. Naming it in the section's summary is what
  // keeps the guardrail true ("a box that stays as drawn moves nothing" needs the list of the
  // ones that do not), even where there is no heading to put its select on.
  for (const boxId of [
    ...Object.keys(perPanel),
    ...(draft.svgStretch.on && draft.svgStretch.shapeId ? [draft.svgStretch.shapeId] : []),
  ]) {
    if (growingBoxes.some((b) => b.boxId === boxId)) continue;
    const mode = modeOfBox(boxId);
    if (mode === 'shrink') continue;
    growingBoxes.push({
      boxId,
      label: svg?.shapes.find((s) => s.id === boxId)?.label ?? 'A shape',
      mode,
    });
  }
  const capKey = capBoxes.join('|');
  // A LAYOUT effect, like every other measurement on this step: the sentence under the heading
  // carries a NUMBER, and measuring after paint would print one answer for a frame and correct
  // it. Re-run when a font lands, because the line count is arithmetic on the drawn type.
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage || !capKey) {
      setCapFits({});
      return;
    }
    const fits: Record<string, GrowCapFit> = {};
    for (const boxId of capKey.split('|')) {
      const lines = Object.keys(boxOfRow).filter((lineId) => boxOfRow[lineId] === boxId);
      const fit = growCapOf(stage, svg, boxId, lines);
      if (fit) fits[boxId] = fit;
    }
    setCapFits(fits);
  }, [svg, capKey, boxOfRow, fontKey]);

  /** The layer's own name and its drawn size, for the heading's tooltip. The name shown is the
   *  reader's ("Tan plate"), which is the right one to read and the wrong one to check a file
   *  against; the SIZE is the one number that says the geometry was read where the shape is
   *  PAINTED rather than off its attributes - the owner's question plate is a portrait rectangle
   *  turned 88.68 degrees, drawn 231 x 1233 and painted 1238 x 259. */
  const boxTitle = (boxId: string | null) => {
    const shape = boxId ? svg?.shapes.find((s) => s.id === boxId) : null;
    return shape
      ? `${shape.label}, ${Math.round(shape.width)} × ${Math.round(shape.height)} px as drawn`
      : undefined;
  };

  /** WHERE THE LIMIT STANDS AND WHAT IT BUYS, in the reader's own words and the artwork's own px.
   *  Two pieces rather than one sentence, because the row under the heading and the chip on the
   *  preview say it at different lengths and must not be able to disagree about the FACTS. */
  /** IS THE LINE SOMEWHERE THE DESIGN DID NOT PUT IT - because the reader moved it, or because
   *  the design's own mirrored margin does not fit between the two ends and was clamped to one of
   *  them. Either way "the same margin as the top" would be describing a line that is not there. */
  const capMoved = (boxId: string, fit: GrowCapFit, margin: number) =>
    capsSet?.[boxId]?.y != null || Math.abs(margin - fit.mirrored) > 0.0005;
  const capWords = (fit: GrowCapFit, margin: number, moved: boolean) => ({
    where: moved
      ? `${Math.round(margin * (svg?.height ?? 0))} px ${fit.dir > 0 ? 'above the bottom' : 'below the top'} of the frame`
      : `the same margin as the ${fit.dir > 0 ? 'top' : 'bottom'}`,
    lines: capLines(fit, margin),
  });
  const capsSet = draft.svgStretch.caps;
  /** Where one box's limit stands right now: the reader's own answer where they moved it, else
   *  the design's. Clamped on the way out, so a cap stored against an artwork that has since
   *  been re-dropped can never draw a line outside the two ends. */
  const capMargin = (boxId: string, fit: GrowCapFit) =>
    capClamped(fit, capsSet?.[boxId]?.y ?? fit.drawn);
  // THE NAME THE CHECKLIST SHOWS, not the box's own: a board with two plates of one colour heads
  // them "Board 1" and "Board 2", and a line on the canvas calling itself "Board" would be a
  // limit the reader cannot match to a row.
  //
  // As JSON rather than as a delimited string, which is not fussiness: written with a NUL between
  // the two halves, git read the whole FILE as binary - `git ls-files --eol` said `i/-text`, grep
  // answered "Binary file matches", and the diff a reviewer reads came out as 1819 added lines
  // instead of the 343 that changed.
  const capLabels = JSON.stringify(growingBoxes.map((b) => [b.boxId, b.label]));
  /** HOW FAR THIS BOX MAY GET, said once under its heading in the same words the line on the
   *  preview carries. The line is the control; this is what it says, for a reader whose eyes are
   *  on the checklist. Null for a box with no limit to show, which is every box that stays as
   *  drawn. */
  const capSentence = (boxId: string | null, key: string) => {
    const fit = boxId ? capFits[boxId] : undefined;
    if (!boxId || !fit) return null;
    const margin = capMargin(boxId, fit);
    const w = capWords(fit, margin, capMoved(boxId, fit, margin));
    return (
      <p className="hint map-svg-box-cap" data-testid={`map-svg-box-cap-${key}`}>
        Stops at {w.where}
        {w.lines ? `, room for ${w.lines} line${w.lines === 1 ? '' : 's'} at the size you drew` : ''}.{' '}
        <span className="map-svg-box-cap-how">Drag the line on the preview.</span>
      </p>
    );
  };

  const growCaps = useMemo<PreviewGrowCap[]>(() => {
    const labels = new Map(JSON.parse(capLabels) as [string, string][]);
    const out: PreviewGrowCap[] = [];
    for (const boxId of capKey ? capKey.split('|') : []) {
      const fit = capFits[boxId];
      if (!fit) continue;
      const margin = capClamped(fit, capsSet?.[boxId]?.y ?? fit.drawn);
      const w = capWords(fit, margin, capMoved(boxId, fit, margin));
      const label = labels.get(boxId) ?? 'This box';
      out.push({
        id: boxId,
        label,
        dir: fit.dir,
        margin,
        min: fit.min,
        max: fit.max,
        // NAMED, because two boxes may carry a line each and a limit that does not say whose it
        // is is a limit the reader has to guess at.
        note: `${label}: stops at ${w.where}${w.lines ? `, room for ${w.lines} line${w.lines === 1 ? '' : 's'}` : ''}`,
      });
    }
    return out;
    // `capWords` is a pure reading of `svg` and the fit, both of which are dependencies here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [capKey, capLabels, capFits, capsSet, svg]);
  useEffect(() => {
    onGrowCaps(growCaps);
  }, [growCaps, onGrowCaps]);
  useEffect(() => () => onGrowCaps([]), [onGrowCaps]);

  /** A limit the reader moved on the preview. Clamped HERE as well as on the canvas: the step
   *  measured the two ends, so it is the step that owns them, and a stored cap is never a value
   *  the growth could not keep. */
  const setCap = useCallback(
    (boxId: string, margin: number) => {
      const fit = capFits[boxId];
      if (!fit) return;
      const m = capClamped(fit, margin);
      const caps = { ...(draft.svgStretch.caps ?? {}) };
      // PUTTING THE LINE BACK WHERE THE DESIGN HAD IT TAKES THE CAP AWAY, so a reader who drags
      // it out and back emits exactly the bytes they started with rather than a rule saying in
      // numbers what the artwork already said.
      if (Math.abs(m - fit.drawn) < 0.0005) delete caps[boxId];
      // Rounded to a tenth of a percent of the frame, because this number lands in generated
      // code a person reads and 0.081 says everything 0.0812345 says.
      else caps[boxId] = { ...caps[boxId], y: Math.round(m * 1000) / 1000 };
      onDraft({
        svgStretch: {
          ...draft.svgStretch,
          authored: true,
          caps: Object.keys(caps).length > 0 ? caps : undefined,
        },
      });
    },
    [capFits, draft.svgStretch, onDraft],
  );
  useEffect(() => {
    onArmCap(setCap);
  }, [setCap, onArmCap]);
  useEffect(() => () => onArmCap(null), [onArmCap]);

  /** The ARTWORK set as it stands: the author's own list once they have touched it, else the
   *  proposal. Text is filtered back out of a materialized list - it rides in the draft so the
   *  graphic keeps behaving, but it is never a row with a control on it. */
  const declaredFollowers: SvgFollowerDraft[] = (
    draft.svgStretch.followers ??
    proposed.artwork.map((candidateId) => ({ candidateId, mode: 'move' as const }))
  ).filter((f) => !isTextLayer(svg, f.candidateId));

  /** Every follower edit commits the whole set, so an untouched proposal never half-materializes.
   *  It also marks the growth AUTHORED: a reader editing what travels has adopted the rule.
   *  THE TEXT LINES RIDE ALONG, unasked about: a declared list replaces the runtime's derivation
   *  outright, so committing only the artwork would stop a caption drawn past the edge from
   *  moving the moment anybody touched a row. */
  const proposedText = proposed.text;
  const setFollowers = (next: SvgFollowerDraft[]) =>
    onDraft({
      svgStretch: {
        ...draft.svgStretch,
        authored: true,
        followers: [
          ...next,
          ...proposedText.map((candidateId) => ({ candidateId, mode: 'move' as const })),
        ],
      },
    });

  const labelOfCandidate = (id: string): string => {
    const all = svg
      ? [...svg.groups, ...svg.shapes, ...svg.candidates, ...svg.images, ...svg.outlines]
      : [];
    return all.find((c) => c.id === id)?.label ?? id;
  };

  // ── PICKING A LAYER ON THE ARTWORK (docs/SVG_IMPORT_PLAN.md §6a step 5) ──
  // The checklist and the canvas are two views of one decision, and pointing at the thing itself
  // is the one that needs no reading. What a pick MEANS depends on what was picked - a text layer
  // becomes a field, a rectangle becomes the panel that grows - so the canvas reports which layer
  // and this decides, exactly as it does for a drawn box.
  const pickLayer = useCallback(
    (candidateId: string, drag: 'x' | 'y' | null) => {
      // DECLARING FOLLOWERS takes the gesture while it is armed: the same pick that would
      // otherwise bind a field instead says "this travels" (plan §6c). The growing element
      // itself is never its own follower, and NEITHER IS A TEXT LAYER (owner walk, 2026-09-01):
      // a traveller the reader chooses about is artwork riding a moving edge. Arming is a MODE,
      // so a pick that lands on text does NOTHING rather than falling through to the binding
      // toggle - a missed click un-ticking a field the reader had already named and sampled is a
      // destructive answer to a gesture that meant something else entirely.
      if (followArmed) {
        if (candidateId === draft.svgStretch.shapeId) return;
        if (isTextLayer(svg, candidateId)) return;
        const set = declaredFollowers;
        const already = set.some((f) => f.candidateId === candidateId);
        onDraft({
          svgStretch: {
            ...draft.svgStretch,
            authored: true,
            // The same union `setFollowers` commits: the text lines the geometry found ride
            // along unasked, or a declared list would stop them travelling.
            followers: [
              ...(already
                ? set.filter((f) => f.candidateId !== candidateId)
                : [...set, { candidateId, mode: 'move' as const }]),
              ...proposedText.map((id) => ({ candidateId: id, mode: 'move' as const })),
            ],
          },
        });
        return;
      }
      // A DRAG ON A SHAPE ALWAYS MEANS GROWTH, and it is the whole disambiguation one element
      // holding two roles needs. A picture-filled backplate is offered as a picture AND as the
      // panel that grows (assets/svgImport.ts), and the binding kinds are checked first - so a
      // plain click on it would toggle the picture and the panel could never be picked on the
      // artwork at all. A drag is not a click: it already carries an AXIS, which is a thing only
      // growth has any use for. Written against `svg.shapes` rather than against the dual role,
      // because for every other shape this is exactly what happened anyway.
      if (drag && svg?.shapes.some((s) => s.id === candidateId)) {
        onDraft({
          svgStretch: { on: true, authored: true, shapeId: candidateId, axis: drag },
        });
        return;
      }
      const text = draft.svgFields.find((f) => f.candidateId === candidateId);
      if (text) {
        // The canvas and the checklist are two views of one decision, so a pick that switches a
        // layer off means exactly what unticking the row means: the words stay as drawn.
        if (text.on) {
          onDraft({
            svgFields: draft.svgFields.map((f) => (f.candidateId === candidateId ? { ...f, on: false, whenOff: 'keep' } : f)),
          });
          return;
        }
        onDraft({
          svgFields: draft.svgFields.map((f) =>
            f.candidateId === candidateId ? { ...f, on: true, whenOff: undefined } : f,
          ),
        });
        return;
      }
      const picture = draft.svgImages.find((f) => f.candidateId === candidateId);
      if (picture) {
        onDraft({
          svgImages: draft.svgImages.map((f) =>
            f.candidateId === candidateId ? { ...f, on: !f.on } : f,
          ),
        });
        return;
      }
      const outline = draft.svgOutlines.find((f) => f.candidateId === candidateId);
      if (outline) {
        // Only a MEASURED group can be replaced - the same rule its checkbox keeps, since the
        // stand-in needs the box. Picking an unmeasurable one does nothing rather than pretending.
        if (outline.box) {
          onDraft({
            svgOutlines: draft.svgOutlines.map((f) =>
              f.candidateId === candidateId ? { ...f, on: !f.on } : f,
            ),
          });
        }
        return;
      }
      // A RECTANGLE is the panel that grows, and a DRAG says which way. Picking the one that is
      // already growing, with no direction, turns it off again - the gesture is its own undo.
      if (!svg?.shapes.some((s) => s.id === candidateId)) return;
      const isPanel = draft.svgStretch.on && draft.svgStretch.shapeId === candidateId;
      if (isPanel && !drag) {
        onDraft({ svgStretch: { ...draft.svgStretch, authored: true, on: false } });
        return;
      }
      onDraft({
        svgStretch: {
          on: true,
          authored: true,
          shapeId: candidateId,
          axis: drag ?? (isPanel ? draft.svgStretch.axis : undefined) ?? 'x',
        },
      });
    },
    [
      draft.svgFields,
      draft.svgImages,
      draft.svgOutlines,
      draft.svgStretch,
      svg,
      onDraft,
      followArmed,
      declaredFollowers,
      proposedText,
    ],
  );

  useEffect(() => {
    onArmPick(pickLayer);
  }, [pickLayer, onArmPick]);
  useEffect(() => () => onArmPick(null), [onArmPick]);

  const patchAdded = (id: string, patch: Partial<DesignFieldSpec>) =>
    onDraft({ designFields: draft.designFields.map((f) => (f.id === id ? { ...f, ...patch } : f)) });
  const removeAdded = (id: string) =>
    onDraft({ designFields: draft.designFields.filter((f) => f.id !== id) });


  // Measure every outlined-text suspect once the artwork is rendered (the draft keeps the
  // boxes, so a return visit measures nothing — and the create path reads them from there,
  // where no layout exists). The whole batch lands in ONE patch.
  const outlines = draft.svgOutlines;
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !svg || outlines.every((o) => o.box)) return;
    const root = stage.querySelector('svg');
    if (!root) return;
    const svgRect = root.getBoundingClientRect();
    if (!(svgRect.width > 0)) return;
    const k = svg.width / svgRect.width;
    let changed = false;
    const measured = outlines.map((o) => {
      if (o.box) return o;
      const m = measureOutline(stage, svgRect, k, o.candidateId);
      if (!m) return o;
      changed = true;
      return { ...o, ...m };
    });
    // A group that cannot be measured stays unmeasured (and unreplaceable) without
    // re-patching forever: no change, no patch, no re-run.
    if (changed) onDraft({ svgOutlines: measured });
  }, [outlines, onDraft, svg]);

  // THE SAMPLE IS THE ARTWORK'S TEXT — and the artwork that says so is the PREVIEW. Editing a
  // row rebuilds the draft template, so the value lands the way `update()` writes it on air,
  // through the emitted fit: a long name that the ladder wraps and shrinks is SHOWN wrapped
  // and shrunk, which is the only honest answer to "will this fit". This step therefore
  // repaints nothing itself; the offscreen render stays exactly as the designer drew it, which
  // is what measureOutline needs it for.

  if (!svg) return null;

  // Text-shaped groups first, everything else after — a STABLE sort, so within each half the
  // rows still read in the order the file draws them. A row a ticked group put ON stays with
  // the text-shaped ones: the reader already answered for it.
  const rankedOutlines = draft.svgOutlines
    .map((f, i) => ({ f, i }))
    .sort((a, b) => Number(rowIsTexty(b.f)) - Number(rowIsTexty(a.f)) || a.i - b.i)
    .map(({ f }) => f);

  const patchField = (candidateId: string, patch: Partial<SvgFieldDraft>) =>
    onDraft({
      svgFields: draft.svgFields.map((f) => (f.candidateId === candidateId ? { ...f, ...patch } : f)),
    });


  const patchImage = (candidateId: string, patch: Partial<SvgImageDraft>) =>
    onDraft({
      svgImages: draft.svgImages.map((f) => (f.candidateId === candidateId ? { ...f, ...patch } : f)),
    });

  const patchOutline = (candidateId: string, patch: Partial<SvgOutlineDraft>) =>
    onDraft({
      svgOutlines: draft.svgOutlines.map((f) => (f.candidateId === candidateId ? { ...f, ...patch } : f)),
    });

  // THE POLL writes its own layers, so they are display targets rather than operator fields;
  // the checklist below and the behaviour section both read that set, and the section reads
  // every text layer the file draws whether its row is ticked or not.
  const textLayers = draft.designSvg?.candidates ?? [];
  const pollDriven = pollDrivenLayers(draft.svgBehaviour);


  // WHAT THE OPERATOR CAN ACTUALLY TYPE INTO, which is not the same as what is ticked: a layer
  // the vote writes is dropped from the field list by `draftToOptions`, so counting it here would
  // promise fields the graphic does not have.
  const onCount = draft.svgFields.filter((f) => f.on && !pollDriven.has(f.candidateId)).length;
  // …and the same filter here, for the same reason: a driven layer is not a field, so it cannot
  // be the graphic's one countdown either. Counted, it would grey the choice out on every row
  // that genuinely could be one.
  const countdownTaken = draft.svgFields.some(
    (f) => f.on && f.kind === 'countdown' && !pollDriven.has(f.candidateId),
  );

  return (
    <div className="map-svg">
      {/* THE OFFSCREEN RENDER. Not a canvas any more — the preview beside the step is the one
          canvas (see the component note) — but `measureOutline` needs the artwork LAID OUT,
          and `getBoundingClientRect()` is all zeroes inside a `display: none` subtree. So it
          renders off screen at the artwork's own width, which also makes the measurement
          exact: k is 1, with no rounding from a fitted-down box. Hidden from assistive tech
          and untabbable; nothing here is for reading. */}
      <div className="map-svg-measure" aria-hidden="true">
        <div
          className="map-svg-stage"
          ref={stageRef}
          data-testid="map-svg-stage"
          style={{ width: svg.width }}
          // The markup is our own sanitizer's output (script/handlers/foreignObject already
          // removed at import — assets/svgImport.ts), never raw user input.
          dangerouslySetInnerHTML={{ __html: svg.markup }}
        />
      </div>
      {/* ONE LINE PER THING (docs/GOALS.md NOW goal 4): what is automatically visible is one
          line, and the rest of every section sits behind its ⓘ — which also says WHY the
          section exists at all, the half the owner asked for by name. */}
      <div className="map-svg-lead">
        <h3>Choose what the operator can change</h3>
        {svg.candidates.length > 0 ? (
          <p className="hint">Tick what can be retyped. Hover a row to see it in the preview.</p>
        ) : (
          <p className="hint">
            No text layers in this file. Your artwork still ships exactly as drawn. Two ways
            forward below.
          </p>
        )}
      </div>

      {svg.candidates.length === 0 ? (
        /* The honest outlined-text answer (plan §2): nothing here is bindable, and saying why
           teaches the fix. The graphic still imports pixel-exact as a fixed graphic. */
        <div className="panel-section" data-testid="map-svg-outlined">
          <h3>This SVG has no text layers</h3>
          <p className="hint">
            The text was turned into shapes on export, so there is nothing to type into. It
            still airs fine as a <strong>fixed graphic</strong>.
          </p>
          <p className="hint">
            To get editable text, export again keeping text as text. Illustrator:{' '}
            <strong>File → Export → SVG, Fonts set to “SVG”</strong>. Figma: turn off “Outline
            text”. Then drop the new file on the previous step.
          </p>
          {draft.svgOutlines.length > 0 && (
            <p className="hint">
              Or keep this file. Tick a group of shapes below that <em>was</em> text and a live
              field takes its place: same spot, same size, same colour, your typeface.
            </p>
          )}
        </div>
      ) : (
        <div className="panel-section" data-testid="map-svg-fields">
          <SectionHead
            title="Editable text"
            summary={`${onCount} of ${draft.svgFields.length} editable on air`}
            testid="map-svg-why-fields"
          >
            <p>
              A ticked layer becomes a field the operator retypes live, in the type you drew.
              Untick one and its words stay part of the artwork.
            </p>
            {/* THE KEY TO THE NINE DOTS - one SENTENCE on the paragraph that already covers
                what a row's controls do, not a paragraph of its own. Each row now states its own
                answer in words beside the word Aligned; what a row cannot afford to repeat seven
                times is what that answer is FOR. It is said here because the ⓘ notes on this step
                have a pinned LENGTH ceiling (e2e/import-svg.spec.ts, "the step says what a
                control does, in a few lines" - this body is exactly two paragraphs, and the owner
                on 2026-08-26: "it needs to be shorter and just what it does"). Tying it to the
                Text box is also the cheapest demonstration there is: type a long value and the
                anchored edge is the one that visibly does not move. */}
            <p>
              The Text box is live. Type a long value and the preview shows what airs, growing
              from whichever edge Aligned names.
            </p>
          </SectionHead>
          {fieldGroups.map((group) => (
          <div
            /* KEYED ON THE GROUP'S FIRST ROW, not on its box: a group is a RUN, so one box can
               head two of them on a file that interleaves, and keying on the box id then hands
               React two children with the same key. The first row's candidate id is unique per
               group and stable across renders, where an index is not. */
            key={group.fields[0].candidateId}
            className={showBoxGroups ? 'map-svg-box-group' : undefined}
            data-testid={`map-svg-box-${group.fields[0].candidateId}`}
          >
            {showBoxGroups && (
              /* THE HEADING IS THE CLAIM: "these lines live in this shape". The swatch carries
                 the shape's own fill, which is the cheapest trust device there is - a reader who
                 has never heard the word binding still checks a colour against the picture beside
                 them in under a second. `aria-hidden` because the NAME already says the colour;
                 read aloud, the swatch would be a second copy of it. AFTER the name and round,
                 because a square at the start of the line, in the column the rows' checkboxes
                 occupy, read as a checkbox that could not be ticked (owner, 2026-09-21). */
              <p
                className="map-svg-box-head"
                data-testid={`map-svg-box-head-${group.fields[0].candidateId}`}
                title={boxTitle(group.boxId)}
              >
                <strong>{group.label}</strong>
                {group.boxId && (
                  <span
                    className="map-svg-swatch"
                    style={{ background: boxLooks[group.boxId]?.fill || 'transparent' }}
                    aria-hidden="true"
                  />
                )}
                {/* The lines are listed directly underneath, so counting them for the reader is
                    noise on a board where every plate holds exactly one. The leftover group is
                    the one that has something to say, because "no box" is not visible on the
                    artwork the way a plate is. */}
                {/* TRUE OF BOTH WAYS A LINE ENDS UP HERE: nothing drawn under it at all, and
                    nothing under it but the board's own backplate. Either way there is no box
                    around it that could grow, which is the consequence the reader needs. */}
                {!group.boxId && <span>no box of their own, so nothing grows around them</span>}
                {/* WHAT THIS BOX DOES WITH A LONG VALUE (docs/TEXT_BOX_BINDING.md, rung 4), on
                    the row that already names it - so one plate may grow while its neighbours
                    stay, and the shape is never asked for, because the row IS the shape.
                    OFFERED WHERE IT CAN DO SOMETHING: a box with no ticked line in it grows for
                    nobody, and the runtime would grant it nothing
                    (`wizard/offer-control-can-change-graphic-front`). A box already carrying an
                    answer keeps its control whatever the measurement says, or unticking a row
                    would take away the control holding the answer.
                    The WHY is on the tooltip rather than in a line per box - the same place the
                    alignment grid's words went, and for the same measured reason: this step has
                    a rows-on-screen budget and a sentence per heading costs a row per box. */}
                {group.boxId && (panelIds.includes(group.boxId) || modeOfBox(group.boxId) !== 'shrink') && (
                  <select
                    className="map-svg-box-grow"
                    value={modeOfBox(group.boxId)}
                    aria-label={`What ${group.label} does when the text is too long`}
                    title={
                      `What ${group.label} does when someone types more than you drew room for.` +
                      ' The text wraps and gets smaller whatever you pick; this is how much room it gets first.' +
                      (modeOfBox(group.boxId) === 'shrink'
                        ? ''
                        : ` ${STRETCH_HINT[modeOfBox(group.boxId) as Exclude<StretchMode, 'shrink'>]}`) +
                      (draft.svgStretch.authored ? '' : ' Read from your artwork.')
                    }
                    onChange={(e) => setBoxMode(group.boxId!, e.target.value as StretchMode)}
                    data-testid={`map-svg-box-grow-${group.fields[0].candidateId}`}
                  >
                    {STRETCH_ORDER.map((mode) => (
                      <option key={mode} value={mode}>
                        {BOX_GROW_LABEL[mode]}
                      </option>
                    ))}
                  </select>
                )}
              </p>
            )}
            {showBoxGroups && capSentence(group.boxId, group.fields[0].candidateId)}
            {group.fields.map((f) => {
            // A LAYER THE VOTE WRITES IS NOT A FIELD, so this row does not offer the two boxes
            // that would pretend it is (owner walk, 2026-09-03: he selected a percentage, watched
            // it highlight in the preview, typed, and nothing happened). `draftToOptions` drops
            // these layers from the field list, so a name and a sample typed here reach nothing at
            // all - and a control that cannot change the graphic in front of you must not be
            // offered (docs/backlog/offer-nothing-that-cannot-work.md). The row stays, because the
            // reader still needs to see that their layer was recognised and by what.
            const driven = f.on && pollDriven.has(f.candidateId);
            /** The box this line sits in and what was measured about it - absent for a line on
             *  the bare artwork, which then gets no alignment control. A COUNTDOWN row gets none
             *  either: its layer becomes the clock display and never carries the field id a
             *  declaration would name, so a grid there could not change the graphic. */
            const fit = f.kind === 'countdown' ? undefined : boxFits[f.candidateId];
            /** How this row's block sits in its box right now - declared, else drawn. */
            const now = fit ? alignOf(f.align, fit) : undefined;
            return (
            <Fragment key={f.candidateId}>
            <div
              className={`map-svg-row ${f.on ? '' : 'off'}`}
              onMouseEnter={() => setHoverId(f.candidateId)}
              onMouseLeave={() => setHoverId((h) => (h === f.candidateId ? null : h))}
              data-testid={`map-svg-row-${f.candidateId}`}
            >
              <input
                type="checkbox"
                checked={f.on}
                /* AND A DRIVEN ROW CANNOT BE UNTICKED HERE. Unticking with "take it off the
                   artwork" stamps the layer with the class that hides it while the vote goes on
                   writing into it, so the counts arrive and land inside a layer nobody can see,
                   and nothing reports it. The honest control for taking a layer out of a vote is
                   the picker below, which unbinds it and hands this row its boxes back.
                   GREYED rather than gone, which is the exception to "hide what cannot work":
                   this one is not inert, it is harmful, and it still carries the fact that the
                   layer is part of the graphic - which is the whole of what the row is for. */
                disabled={driven}
                /* UNTICKING ASKS NOTHING (owner, 2026-09-21: ticking or unticking a field shows
                   no warning). It means the one safe thing, the words stay as drawn, and the row
                   says so with the other answer one press away. A dialog used to ask which
                   (owner walk, 2026-09-02); a student on a deadline read it as an error. */
                onChange={(e) =>
                  e.target.checked
                    ? patchField(f.candidateId, { on: true, whenOff: undefined })
                    : patchField(f.candidateId, { on: false, whenOff: 'keep' })
                }
                title={
                  driven
                    ? 'The vote writes this layer. To take it out, set its picker below to “not drawn”.'
                    : f.on
                      ? 'On. This layer is an operator field.'
                      : f.whenOff === 'remove'
                        ? 'Off. This text has been taken off the artwork.'
                        : 'Off. This text stays as drawn.'
                }
              />
              {driven ? (
                /* SHORT, because it is on EIGHT ROWS of his board. The reason lives once, in the
                   section's own note; a row only has to say which layer this is and that the
                   vote fills it, or the checklist becomes eight copies of one paragraph - which
                   is the reading problem he raised about this step in the same walk. */
                <p className="map-svg-driven grow" data-testid={`map-svg-driven-${f.candidateId}`}>
                  <strong>{f.title.trim() || 'This layer'}</strong>, filled by the vote
                </p>
              ) : (
                <>
                  <label className="save-field grow">
                    <span>Field name</span>
                    <input
                      value={f.title}
                      disabled={!f.on}
                      onChange={(e) => patchField(f.candidateId, { title: e.target.value })}
                      data-testid={`map-svg-title-${f.candidateId}`}
                    />
                  </label>
                  <label className="save-field grow map-svg-sample">
                    <span>Text{f.numeric ? ' (number)' : ''}</span>
                    <input
                      value={f.sample}
                      disabled={!f.on}
                      onChange={(e) => patchField(f.candidateId, { sample: e.target.value })}
                      data-testid={`map-svg-sample-${f.candidateId}`}
                    />
                  </label>
                  {fit && now && (
                    /* HOW THE BLOCK SITS IN ITS BOX (docs/TEXT_BOX_BINDING.md, "Alignment"): the
                       nine-dot reference-point grid every Illustrator user has already used, one
                       click setting both axes. IN THE ROW rather than in a strip under it, because
                       the step has a measured height budget and a strip's summary line would cost
                       a row per row; a 3x3 of dots is no taller than the text box beside it. The
                       ringed dot is the answer READ FROM THE DRAWING; a solid dot is one the reader
                       set, and clicking the drawn dot hands the row back to the drawing. Only on a
                       row whose line has a box - text on the artwork has nothing to be aligned in
                       (`wizard/offer-control-can-change-graphic-front`). */
                    <div className="save-field map-svg-align" data-testid={`map-svg-align-${f.candidateId}`}>
                      {/* THE ANSWER IN WORDS, beside the heading, which is what every other
                          group on this step does ("2 of 2 editable on air", "the panel gets
                          wider, then taller - read from your artwork") and what this one alone
                          did not: nine unlabelled dots, their answers reachable only by hovering
                          one cell at a time (e2e/import-svg.spec.ts, "every alignment grid
                          writes its own answer beside the heading").
                          MEASURED before it was written, because the step has an exact
                          rows-on-screen budget (e2e/import-svg.spec.ts, 7 rows at 1280x720 and
                          1366x768). On the scorebug at 1280 the answer takes the column from
                          52 px to 112 and the two text boxes from 165 to 135, which the budget
                          survives - but the CLOCK row, which also carries the countdown picker,
                          then wrapped a label and grew from 56 px to 68. The guard in
                          mapSvgFields.css (a row LABEL never wraps) is what buys it back: every
                          row stays 54 px, the last one still ends at 609, and all seven arrive
                          whole at both sizes. */}
                      <span>
                        Aligned <span className="map-svg-align-now">{now.h}, {now.v}</span>
                      </span>
                      <div className="map-svg-align-grid" role="radiogroup" aria-label="How the text sits in its box">
                        {ALIGN_V.map((v) =>
                          ALIGN_H.map((h) => {
                            const chosen = now.h === SVG_ALIGN_WORD[h] && now.v === v;
                            const drawn = fit.drawn.h === SVG_ALIGN_WORD[h] && fit.drawn.v === v;
                            return (
                              <button
                                key={`${h}-${v}`}
                                type="button"
                                role="radio"
                                aria-checked={chosen}
                                className={chosen && f.align ? 'set' : undefined}
                                disabled={!f.on}
                                /* The words ride the DOT, because a child's title is the one
                                   the pointer sees: on the grid itself they would show only in
                                   the gaps between dots. */
                                title={`${SVG_ALIGN_WORD[h]}, ${v}${
                                  drawn ? ' - read from your drawing' : chosen ? ' - set by you' : ''
                                }`}
                                onFocus={() => setHoverId(f.candidateId)}
                                onClick={() =>
                                  patchField(f.candidateId, {
                                    // The drawn dot IS "read from your drawing", so it clears the
                                    // declaration rather than restating it - and a nudge kept on the
                                    // drawn anchor survives only there.
                                    align: drawn ? undefined : { h, v },
                                    keepNudge: drawn ? f.keepNudge : undefined,
                                  })
                                }
                                data-testid={`map-svg-align-${f.candidateId}-${h}-${v}`}
                              />
                            );
                          }),
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
              {f.clock && !driven && (
                /* A clock-shaped layer ("10:00") can be a COUNTDOWN: the node becomes the
                   ticking display and the operator sets the length in minutes. One per
                   graphic - the shared clock runtime drives one display - so once a row
                   has it, the others keep the choice but greyed. Never assumed: "22:40"
                   is just as likely the time of day drawn into a news strap. */
                <label className="save-field">
                  <span>Binds as</span>
                  <select
                    value={f.kind}
                    disabled={!f.on || (f.kind !== 'countdown' && countdownTaken)}
                    onChange={(e) => patchField(f.candidateId, { kind: e.target.value as SvgFieldDraft['kind'] })}
                    title={
                      f.kind !== 'countdown' && countdownTaken
                        ? 'Another layer is already the countdown. A graphic has one clock.'
                        : 'Text: the operator types what shows. Countdown: the operator sets minutes and this layer counts down on air.'
                    }
                    data-testid={`map-svg-kind-${f.candidateId}`}
                  >
                    {/* ONE WORD, because a select is as wide as its longest option and never
                        gives that width back: at "Countdown (operator sets minutes)" the two text
                        boxes beside it on a clock row were squeezed to 34 and 29 px once the
                        alignment grid joined the row, and at "Countdown (minutes)" their labels
                        still wrapped. The title above says who sets the minutes, and the field
                        the choice makes is titled "(minutes)" wherever the operator sees it. */}
                    <option value="text">Text</option>
                    <option value="countdown">Countdown</option>
                  </select>
                </label>
              )}
              {/* WHAT AN OFF ROW DOES, said on the row that carries it, with the other answer
                  beside it. Keeping the words is the default; taking the layer off the artwork
                  is a press here, and the removal is the one nobody can see on the preview,
                  because the words are simply gone - so the row is where it has to be read. The
                  shapes stay in the file either way, hidden by one line of CSS. */}
              {!f.on && (
                <span className="map-svg-off-note">
                  <span data-testid={`map-svg-off-${f.candidateId}`}>
                    {f.whenOff === 'remove' ? 'taken off the artwork' : 'stays as drawn'}
                  </span>
                  {f.whenOff === 'remove' ? (
                    <button
                      type="button"
                      className="map-svg-off-swap"
                      onClick={() => patchField(f.candidateId, { whenOff: 'keep' })}
                      data-testid={`map-svg-off-keep-${f.candidateId}`}
                    >
                      keep it as drawn
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="map-svg-off-swap"
                      onClick={() => patchField(f.candidateId, { whenOff: 'remove' })}
                      data-testid={`map-svg-off-remove-${f.candidateId}`}
                    >
                      take it off the artwork
                    </button>
                  )}
                </span>
              )}
              {/* WHY THIS ROW IS NOT CALLED WHAT THE LAYER IS CALLED. A text layer named after
                  its own words is Figma's default naming, so the label came from the group
                  around it - right for a Figma board, and baffling for a designer who named a
                  slot after its placeholder on purpose
                  (docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md). The row
                  says which happened rather than leaving them to guess; the field name is
                  theirs to retype either way. */}
              {textLayers.find((c) => c.id === f.candidateId)?.namedByGroup && (
                <span className="map-svg-off-note" data-testid={`map-svg-named-by-group-${f.candidateId}`}>
                  named after its own text, so the group&rsquo;s name was used
                </span>
              )}
            </div>
            {/* THE NUDGE THE FILE RECORDED, handed back on request (owner, 2026-09-02: "what if
                you want to have the text a little bit to the right, and it would fit the
                design?"). Snapping onto the anchor is the default he ruled for, so the line is on
                screen only where the drawing actually has an offset worth the name
                (`nudgeOffered`) - nothing about it appears on a board drawn on the centres. Under
                the row rather than in it: the row never wraps, so its countdown picker cannot
                either. Hovering it keeps the row's box on the preview, so ticking it is watched. */}
            {fit && now && !driven && nudgeOffered(now, fit) && (
              <label
                className="map-svg-nudge"
                data-testid={`map-svg-nudge-${f.candidateId}`}
                onMouseEnter={() => setHoverId(f.candidateId)}
                onMouseLeave={() => setHoverId((h) => (h === f.candidateId ? null : h))}
              >
                <input
                  type="checkbox"
                  checked={!!f.keepNudge}
                  disabled={!f.on}
                  onFocus={() => setHoverId(f.candidateId)}
                  onChange={(e) => patchField(f.candidateId, { keepNudge: e.target.checked || undefined })}
                />
                <span>keep the nudge you drew: {nudgeWords(fit.nudge)}</span>
              </label>
            )}
            </Fragment>
            );
          })}
          </div>
          ))}
        </div>
      )}

      {/* FIELDS THE FILE NEVER DREW (docs/SVG_IMPORT_PLAN.md §6a step 3). The imported SVG is
          a fixed STAGE, not immutable artwork: the show needs a line the designer did not draw,
          and the reader should be able to put it there without opening the editor. Offered on
          every file WITH text layers — an artwork with every layer bound may still be missing a
          caption. NOT offered on an all-outlined file (owner walk 2026-08-28, the backlog's
          outline-fallback ruling): there the only place a drawn box lands is ON TOP of the
          outlined type, with nothing removing the shapes underneath, and the honest door for
          that file is re-export — or an outline row, which hides the shapes it replaces.
          DIRECTLY UNDER THE CHECKLIST, and that placement is the point: this is the other half
          of "which fields does this graphic have", so it belongs beside the layers it extends
          rather than after the questions about behaviour and growth. Measured at 1366x768, a
          seven-layer scorebug put it 553px below the fold when it sat last, which is where a
          reader who has never been told it exists would never find it. */}
      {svg.candidates.length > 0 && (
      <div className="panel-section" data-testid="map-svg-added">
        <SectionHead
          title="Add a field"
          summary={
            draft.designFields.length === 0 ? 'nothing added' : `${draft.designFields.length} added`
          }
          testid="map-svg-why-added"
        >
          <p>
            A show sometimes needs a line the file never drew. Press the button and draw a box
            on the preview. A real editable field lands there, and the artwork underneath is
            untouched.
          </p>
        </SectionHead>
        <button
          className={drawArmed ? 'active' : ''}
          onClick={() => setDrawArmed((a) => !a)}
          data-testid="map-svg-add-field"
        >
          {drawArmed ? '✕ Cancel, or draw a box on the preview' : '＋ Draw a field on the artwork'}
        </button>
        {draft.designFields.map((f) => (
          <div className="map-svg-row" key={f.id} data-testid={`map-svg-added-${f.id}`}>
            <label className="save-field grow">
              <span>Field name</span>
              <input
                value={f.title}
                onChange={(e) => patchAdded(f.id, { title: e.target.value })}
                data-testid={`map-svg-added-title-${f.id}`}
              />
            </label>
            <label className="save-field grow">
              <span>Text</span>
              <input
                value={f.text}
                onChange={(e) => patchAdded(f.id, { text: e.target.value })}
                data-testid={`map-svg-added-sample-${f.id}`}
              />
            </label>
            <button
              onClick={() => removeAdded(f.id)}
              title="Remove this field. The artwork is untouched either way."
              data-testid={`map-svg-added-remove-${f.id}`}
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      )}

      {/* THE BEHAVIOUR (docs/GRAPHIC_BEHAVIOUR_PLAN.md). Offered once there are enough text
          rows for a question and two answers — below that there is nothing to bind, and the
          section would only be a puzzle. Everything here is a picker: no layer has to be
          named anything, and nobody edits XML. */}
      <BehaviourSection
        draft={draft}
        onDraft={onDraft}
        textLayers={textLayers}
        pollDriven={pollDriven}
        stageRef={stageRef}
        layerBoxes={layerBoxes}
        artworkInk={artworkInk}
        setHoverId={setHoverId}
      />
      {svg.candidates.length > 0 && svg.shapes.length > 0 && (
        /* THE HUG (docs/SVG_IMPORT_PLAN.md §3, GOALS goal 5). A lower third's banner should be
           as wide as the name on it; a quiz board and a scorebug declare a stage and must not
           move. Where the artwork answers that unambiguously the default is already right (the
           measuring effect above); where it does not, shrink stands.
           THE CHOICE ITSELF MOVED ONTO THE BOXES (docs/TEXT_BOX_BINDING.md, rung 4): what is
           left here is the ⓘ that explains the ladder, what travels with a growing edge, and
           one line saying which boxes grow. */
        <div className="panel-section" data-testid="map-svg-stretch">
          <SectionHead
            title="When the text is too long"
            summary={
              (growingBoxes.length === 0
                ? 'every box stays the size you drew'
                : growingBoxes.length === 1
                  ? `${growingBoxes[0].label} ${BOX_GROW_LABEL[growingBoxes[0].mode]}`
                  : `${growingBoxes.length} boxes grow`) +
              (draft.svgStretch.authored ? '' : ' — read from your artwork')
            }
            testid="map-svg-why-stretch"
          >
            {/* ONE LINE PER THING, AND THE ⓘ IS THE WHY (owner walk, 2026-09-03: "it needs to
                be shorter and just what it does ... No one wants to read more than a few lines").
                This was four paragraphs about banners, boards, margins and last resorts. Three
                short sentences answer the only questions a reader has here: what does it do,
                where did this answer come from, and what stays true whatever I pick. */}
            <p>Someone will type more than you drew room for. This says how much room it gets.</p>
            <p>
              The text wraps onto more lines whatever you pick, and gets smaller if it still does
              not fit. What you are choosing is how much room the box gives it first.
            </p>
            <p>
              Each box says it on its own row above, so one can grow while its neighbours stay.
              We read your artwork and answered for you.
            </p>
          </SectionHead>
          {/* WHICH BOXES GROW, said once. The ANSWERS live on the heading rows in the
              checklist above (docs/TEXT_BOX_BINDING.md, rung 4), because the row is the shape -
              so this section no longer asks which shape, and what is left of it is the two
              things that are true of the graphic rather than of one box: what travels with a
              growing edge, and the guardrail. A graphic where nothing grows says so, which is
              the guardrail stated: a box that stays as drawn moves nothing. */}
          <p className="hint" data-testid="map-svg-grow-summary">
            {growingBoxes.length === 0
              ? 'Every box stays the size you drew, so nothing on this graphic moves.'
              : growingBoxes.length === 1
                ? `${growingBoxes[0].label} ${BOX_GROW_LABEL[growingBoxes[0].mode]}. Every other box stays the size you drew.`
                : `${growingBoxes.map((g) => g.label).join(', ')} grow. Every other box stays the size you drew.`}
          </p>
          {/* TEXT PAST THE EDGE TRAVELS, AND IS STATED RATHER THAN ASKED ABOUT (owner walk,
              2026-09-01). It still moves - it has to, or the grown panel prints over it - but
              "should this line stretch?" is not a question anyone can answer about a line the
              too-long rule already sizes, and being asked it is what made the whole section
              unreadable. So it is one sentence with no control on it. */}
          {draft.svgStretch.on && proposedText.length > 0 && (
            <p className="hint" data-testid="map-svg-travelling-text">
              {proposedText.map((id) => labelOfCandidate(id)).join(', ')}{' '}
              {proposedText.length === 1 ? 'is' : 'are'} drawn beyond{' '}
              {labelOfCandidate(draft.svgStretch.shapeId ?? '')}, so{' '}
              {proposedText.length === 1 ? 'it moves' : 'they move'} with it.
            </p>
          )}
          {/* WHAT TRAVELS (docs/SVG_IMPORT_PLAN.md §6c). Geometry proposes and the author edits,
              and the reason is the ruling itself: sideways "anything past the edge" is usually
              right, downwards it is not - below a panel sit things that should move, things that
              should stretch, and things pinned to the frame that must stay, and no measurement
              tells them apart. So the guess is shown rather than trusted.
              SHOWN ONLY WHERE THERE IS SOMETHING TO DECIDE (GOALS goal 5 - the owner could not
              understand being asked this on an ordinary lower third, and on one the honest
              answer is that nothing needs to move): the section exists when the growth would
              actually carry layers, or when the author has engaged with growth themselves. On
              the measured default with nothing past the growing edge it does not render, and
              the runtime derives at play time exactly as it always has.
              AUTHORING GROWTH IS NO LONGER ENOUGH TO SHOW IT (owner walk, 2026-09-01). Dragging a
              rectangle on the artwork used to open an empty list with a pick button on it, on a
              graphic where nothing is drawn past the edge - a section whose whole content was a
              control that could only ever add a mistake. It renders when there is something the
              growth would actually carry, or a set the author already declared. */}
          {draft.svgStretch.on &&
            (declaredFollowers.length > 0 || draft.svgStretch.followers != null) && (
            <div className="map-svg-followers" data-testid="map-svg-followers">
              {/* NAMED BY WHAT HAPPENS ON SCREEN (owner walk, 2026-09-01: "What travels with it
                  is also too abstract. The explanation needs to say concretely what selecting an
                  element changes and give an example."). "Travels" was a word for our transform;
                  "moves" is a thing you watch happen. The DIRECTION lives in the ⓘ rather than in
                  the title: this head is a sub-list, indented and set at 0.85rem, and anything
                  longer than about fifteen characters wraps to a second line THROUGH the summary
                  beside it - the summary lands between the title's two lines, which reads as a
                  broken row. The ⓘ leads with the picture rather than with the rule. */}
              <SectionHead
                title="What else moves"
                summary={
                  (declaredFollowers.length === 0
                    ? 'nothing moves'
                    : `${declaredFollowers.length} layer${declaredFollowers.length === 1 ? '' : 's'}`) +
                  (draft.svgStretch.followers ? '' : ' — read from your artwork')
                }
                testid="map-svg-why-followers"
              >
                {/* THE PICTURE, THEN THE ONE THING TO DO ABOUT IT. The third paragraph explained
                    why text is not on the list and where the list came from - the model, not the
                    outcome (owner walk, 2026-09-03). The list's own summary already says it was
                    read from the artwork, and the line above the list already says text moves. */}
                <p>
                  {growAxis === 'y'
                    ? 'When the board grows 40 px taller, every layer listed here drops 40 px, so the gap you drew stays the gap on air.'
                    : 'When the banner grows 120 px wider, every layer listed here shifts 120 px right, so the gap you drew stays the gap on air.'}
                </p>
                {/* WHAT ✕ DOES IS "OFF THE LIST", never "pinned". A layer drawn to the panel's
                    own two edges grows with it whether or not it is listed, so promising that ✕
                    freezes anything would be false for exactly the layer a reader is most likely
                    to click on by hand. */}
                <p>
                  ✕ takes a layer off the list, and it stays where you drew it.{' '}
                  {growAxis === 'y'
                    ? 'A stripe drawn down the board’s whole height'
                    : 'A rule drawn across the banner’s whole width'}{' '}
                  is the exception: it belongs to the panel, so it grows with it either way.
                </p>
              </SectionHead>
              <button
                className={followArmed ? 'active' : ''}
                onClick={() => setFollowArmed((a) => !a)}
                data-testid="map-svg-followers-pick"
              >
                {followArmed ? '✕ Done adding' : '＋ Add one by clicking it on the artwork'}
              </button>
              {declaredFollowers.map((f) => (
                <div
                  className="map-svg-row"
                  key={f.candidateId}
                  onMouseEnter={() => setHoverId(f.candidateId)}
                  onMouseLeave={() => setHoverId((h) => (h === f.candidateId ? null : h))}
                  data-testid={`map-svg-follower-${f.candidateId}`}
                >
                  {/* THE ROW STATES WHAT HAPPENS; IT DOES NOT ASK (owner, 2026-09-05: "when the
                      question becomes long and the box gets bigger, everything else should just
                      move out of the way").
                      This row used to carry a second answer - "Grows by the same amount" - beside
                      the first. Measured across the whole corpus before it was taken out
                      (docs/TEXT_BOX_BINDING.md, "What travels is not a question"), the question was
                      asked on 79 rows and the second answer was right on none of them, because the
                      two sets cannot overlap: a row here is a layer drawn PAST the growing edge,
                      and a layer that must stretch is one drawn TO BOTH of the panel's edges. Those
                      the runtime finds and grows itself (svgCollectSpanners), so the one artwork
                      that needs stretching never needed the control. */}
                  <span className="grow">{labelOfCandidate(f.candidateId)}</span>
                  {/* STATED FROM THE ROW'S OWN VALUE, never as a constant. Nothing the wizard
                      writes is 'grow' any more, but the draft can still hold one (draft.ts says
                      which readers need it), and a statement that ignores what it is describing
                      is worse than the picker it replaced - it would read "moves" beside a layer
                      the emitted graphic stretches. */}
                  <span className="map-svg-follower-note">
                    {f.mode === 'grow' ? 'Grows by the same amount' : 'Moves out of the way'}
                  </span>
                  <button
                    onClick={() =>
                      setFollowers(declaredFollowers.filter((o) => o.candidateId !== f.candidateId))
                    }
                    title="Take this one off the list"
                    data-testid={`map-svg-follower-drop-${f.candidateId}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {draft.svgImages.length > 0 && (
        <div className="panel-section" data-testid="map-svg-images">
          <SectionHead
            title="Pictures"
            summary={`${draft.svgImages.filter((f) => f.on).length} of ${draft.svgImages.length} swappable on air`}
            testid="map-svg-why-images"
          >
            <p>
              Tick a picture and the operator can swap it on air: a guest photo, a crest. They
              start off, because a picture inside a design is usually the artwork itself. An
              empty swap field keeps the picture you drew.
            </p>
          </SectionHead>
          {draft.svgImages.map((f) => (
            <div
              key={f.candidateId}
              className={`map-svg-row ${f.on ? '' : 'off'}`}
              onMouseEnter={() => setHoverId(f.candidateId)}
              onMouseLeave={() => setHoverId((h) => (h === f.candidateId ? null : h))}
              data-testid={`map-svg-image-${f.candidateId}`}
            >
              <input
                type="checkbox"
                checked={f.on}
                onChange={(e) => patchImage(f.candidateId, { on: e.target.checked })}
                title={f.on ? 'On. The operator can swap this picture.' : 'Off. This picture stays as drawn.'}
              />
              <label className="save-field grow">
                <span>Field name</span>
                <input
                  value={f.title}
                  disabled={!f.on}
                  onChange={(e) => patchImage(f.candidateId, { title: e.target.value })}
                  data-testid={`map-svg-image-title-${f.candidateId}`}
                />
              </label>
            </div>
          ))}
        </div>
      )}

      {draft.svgOutlines.length > 0 && (
        /* The overlay road for OUTLINED text (plan §1.A): groups of glyph-shaped paths,
           offered OFF — a logo is a group of paths too, and only the user can tell which
           shapes were type. Hover shows which. A ticked group is hidden at create and a
           placed HTML field (the raster flow's exact field machinery) stands in for it. */
        <div className="panel-section" data-testid="map-svg-outlines">
          <SectionHead
            title="Outlined text"
            summary={`${draft.svgOutlines.filter((f) => f.on).length} of ${draft.svgOutlines.length} replaced by live text`}
            testid="map-svg-why-outlines"
          >
            <p>
              Some shapes look like text that was turned into outlines on export: letters that
              became drawings. Tick a group that really was text and a live field replaces it,
              same spot, same size, same colour, your typeface. Hover a row to see which shapes
              it means.
              {draft.svgOutlines.some((f) => f.looksLikeText === false) && (
                <> The ones that read as a line of type are first.</>
              )}
            </p>
          </SectionHead>
          {/* RANKED, never filtered. A Figma export can carry dozens of icon groups, each of
              them "a group of paths" exactly like outlined copy is, and the one row that IS the
              headline should not be the twentieth. The measurement (measureOutline) does the
              ranking; an unranked row keeps its place in document order. */}
          {rankedOutlines.map((f) => (
            <div
              key={f.candidateId}
              className={`map-svg-row ${f.on ? '' : 'off'}`}
              onMouseEnter={() => setHoverId(f.candidateId)}
              onMouseLeave={() => setHoverId((h) => (h === f.candidateId ? null : h))}
              data-testid={`map-svg-outline-${f.candidateId}`}
            >
              <input
                type="checkbox"
                checked={f.on}
                disabled={!f.box}
                onChange={(e) => patchOutline(f.candidateId, { on: e.target.checked })}
                title={
                  !f.box
                    ? 'These shapes could not be measured, so no field can take their place'
                    : f.on
                      ? 'On. These shapes are hidden and a text field stands in for them.'
                      : 'Off. These shapes stay as drawn.'
                }
              />
              <label className="save-field grow">
                <span>Field name</span>
                <input
                  value={f.title}
                  disabled={!f.on}
                  onChange={(e) => patchOutline(f.candidateId, { title: e.target.value })}
                  data-testid={`map-svg-outline-title-${f.candidateId}`}
                />
              </label>
              <label className="save-field grow">
                <span>Text</span>
                <input
                  value={f.sample}
                  disabled={!f.on}
                  onChange={(e) => patchOutline(f.candidateId, { sample: e.target.value })}
                  data-testid={`map-svg-outline-sample-${f.candidateId}`}
                />
              </label>
              {f.looksLikeText === false && (
                <span className="muted" data-testid={`map-svg-outline-artwork-${f.candidateId}`}>
                  looks like artwork
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {draft.svgFonts.length > 0 && <FontsSection fonts={draft.svgFonts} onDraft={onDraft} />}

    </div>
  );
}
