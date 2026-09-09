import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { parseCssColor } from '../../../model/cssVars';
import { uuid } from '../../../model/id';
import type { DraftPatch, WizardDraft } from '../draft/core';
import type { DesignSvgAlign } from '../../../templates/importedDesign/designTypes';
import type {
  DesignFieldSpec,
  SvgFollowerDraft,
  SvgFieldDraft,
  SvgFontDraft,
  SvgImageDraft,
  SvgOutlineDraft,
  SvgBehaviourDraft,
  SvgExtraDraft,
  SvgPollDraft,
  SvgQuizDraft,
  SvgRecipeDraft,
  SvgRecipeRow,
  SvgScoreDraft,
  SvgStretchMode,
  SvgTimerDraft,
} from './draft';
import {
  armTimerClock,
  behaviourBindingGaps,
  disarmTimerClock,
  emptyPollRow,
  emptyRecipeRow,
  emptyScoreRow,
  emptyTimerDraft,
  extraLayerName,
  pollDrivenLayers,
  scoreDrawnPool,
} from './draft';
import { transformedBox } from '../../../assets/svgGeometry';
import { SVG_ALIGN_TOL, SVG_ALIGN_WORD, SVG_LINE_HEIGHT } from '../../../templates/importedDesign/svg';
import type { PreviewBoxOverlay } from '../WizardPreview';
import { SCORE_MAX_ROWS } from '../../../templates/behaviours/score';
import { BEHAVIOUR_WORDS, rolesOf, type RecipeRole } from '../../../templates/behaviours/recipe';
import {
  artworkInk as inkOfArtwork,
  clearFill,
  fillGap,
  nameHint,
  pickersOf,
  proposeFill,
  recipeIdOf,
  rowKeysOf,
  withFill,
  type FillLayer,
  type FillPick,
} from './fieldAutoMap';
import { BEHAVIOUR_RECIPES, recipeById } from '../../../templates/behaviours/registry';
import { SVG_CANDIDATE_ATTR, type SvgImportResult } from '../../../assets/svgImport';
import { extOf, fileToDataUrl } from '../../../assets/assetUtils';
import {
  FONTS,
  fontNameKey,
  fontAssetPath,
  fontFormatForExt,
  registerAndMeasureFont,
  type CustomFont,
} from '../../../model/fonts';
import { fetchGoogleFont, loadGoogleFontIndex } from '../../../model/googleFonts';
import SectionHead from '../SectionHead';
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

/** Is this marker one of the file's TEXT layers? The one place that answers it, because three
 *  rules turn on it and a fourth spelling of it is how the offered set and the committed set
 *  drift apart. */
function isTextLayer(svg: SvgImportResult | null, id: string): boolean {
  return !!svg?.candidates.some((c) => c.id === id);
}

/** One layer's element on the step's own render, by the marker every measurement here speaks.
 *  Written once because three of them ask the same question of the same stage. */
function markerEl(stage: HTMLElement, id: string): Element | null {
  return stage.querySelector(`[${SVG_CANDIDATE_ATTR}="${id}"]`);
}

/** The largest painted shape's fill inside a layer - the colour a reader would say it is. */
function dominantFill(el: Element): string | null {
  let best: { area: number; fill: string } | null = null;
  for (const node of el.querySelectorAll('rect, path, circle, ellipse, polygon, text')) {
    const fill = getComputedStyle(node).fill;
    if (!fill || fill === 'none' || fill.startsWith('url(')) continue;
    const r = node.getBoundingClientRect();
    const area = r.width * r.height;
    if (!best || area > best.area) best = { area, fill };
  }
  return best?.fill ?? null;
}

/**
 * WHERE EACH LAYER SITS, and what colour it is, for the two readers in fieldAutoMap.ts.
 *
 * Read off the step's own render with every hiding LIFTED for the duration of the read: a drawn
 * moment is hidden as exported, and a hidden element has no box. The lift is a stylesheet rule
 * keyed on `data-reveal` (mapSvgFields.css), so an Illustrator class-hidden layer is measured
 * exactly like an inline-hidden one; the attribute is gone again before anything can paint.
 *
 * The two doors below differ only in whether they ask for the COLOUR, because that half costs
 * enough to be worth asking for: `dominantFill` walks every painted node under every layer
 * through `getComputedStyle`. The boxes are read once per FILE, so the notice can leave the
 * artwork's own plates out of what it counts; the colour is read on the PRESS that fills the
 * boxes in, which is the only thing that reads it. One reveal and one walk either way.
 */
function measureStage(stage: HTMLElement, ids: string[], colours: boolean): Map<string, Pick<FillLayer, 'box' | 'color'>> {
  const out = new Map<string, Pick<FillLayer, 'box' | 'color'>>();
  const root = stage.querySelector('svg');
  if (!root) return out;
  stage.setAttribute('data-reveal', '');
  try {
    const svgRect = root.getBoundingClientRect();
    for (const id of ids) {
      const el = markerEl(stage, id);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const box =
        r.width > 0 && r.height > 0
          ? { top: r.top - svgRect.top, bottom: r.bottom - svgRect.top, left: r.left - svgRect.left, right: r.right - svgRect.left }
          : null;
      out.set(id, { box, color: colours ? dominantFill(el) : null });
    }
  } finally {
    stage.removeAttribute('data-reveal');
  }
  return out;
}

/** Just where each layer sits, for the unmatched count's ink. */
function measureBoxes(stage: HTMLElement, ids: string[]): Map<string, FillLayer['box']> {
  return new Map([...measureStage(stage, ids, false)].map(([id, m]) => [id, m.box]));
}

/** Where each layer sits AND what colour it is, for the fill-them-in guess: a green drawing on an
 *  answer row is its correct look, a red one its wrong look. */
function measureLayers(stage: HTMLElement, ids: string[]): Map<string, Pick<FillLayer, 'box' | 'color'>> {
  return measureStage(stage, ids, true);
}

/**
 * WHAT GEOMETRY PROPOSES TRAVELS with a growing element (docs/SVG_IMPORT_PLAN.md §6c).
 *
 * The same guess the runtime makes - anything drawn past the growing edge - but made HERE, on
 * the step's own rendered artwork, so the reader can see it and change it. That is the whole
 * ruling: sideways the guess is usually right, downwards it is not, because "below the panel"
 * holds things that should move, things that should stretch and things pinned to the frame that
 * must stay, and no measurement separates those.
 *
 * An OUTERMOST-first rule keeps the set honest: when a named group and something inside it both
 * qualify, only the group is proposed - the runtime moves whole layers, and offering both would
 * let a reader tick one thing twice.
 *
 * A TRAVELLER THE READER CHOOSES ABOUT IS ARTWORK, never a text layer (owner walk, 2026-09-01).
 * His words on finding his own fields in this list: "I can select text fields under what travels
 * with it, which makes the concept even harder to understand because I would not expect text
 * itself to be stretched." So the two answers are SPLIT rather than the text simply dropped:
 * `artwork` is the list with a control on every row, and `text` is stated in one line and never
 * asked about, because "stretch this line" is not a question anyone can answer about a line the
 * fit ladder already sizes.
 *
 * BOTH still ship. A declared list REPLACES the runtime's own derivation outright
 * (`svgFollowersOf` returns early on a non-empty one), so returning only the artwork would mean
 * that the moment a reader touched one row, a caption drawn below the panel silently stopped
 * moving and the grown panel printed over it. The step commits the union; it only asks about
 * half of it.
 */
function proposeFollowers(
  stage: HTMLElement,
  svg: SvgImportResult,
  growId: string,
  axis: 'x' | 'y',
): { artwork: string[]; text: string[] } {
  const grow = markerEl(stage, growId);
  if (!grow) return { artwork: [], text: [] };
  const gr = grow.getBoundingClientRect();
  const edge = axis === 'y' ? gr.bottom : gr.right;
  const hits: { id: string; el: Element }[] = [];
  // DEDUPED, because an id may now sit in two inventories: a picture-filled backplate is offered
  // both as a picture and as a panel that grows, on the one marker (assets/svgImport.ts). Left
  // as a plain concatenation it would be measured twice and proposed as two follower rows for
  // the same element.
  const seen = new Set<string>();
  for (const c of [...svg.groups, ...svg.shapes, ...svg.candidates, ...svg.images, ...svg.outlines]) {
    if (c.id === growId || seen.has(c.id)) continue;
    seen.add(c.id);
    const el = markerEl(stage, c.id);
    if (!el || el.contains(grow) || grow.contains(el)) continue;
    const r = el.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if ((axis === 'y' ? r.top : r.left) >= edge - 0.5) hits.push({ id: c.id, el });
  }
  const kept = hits.filter((h) => !hits.some((o) => o !== h && o.el.contains(h.el))).map((h) => h.id);
  const isText = (id: string) => isTextLayer(svg, id);
  return { artwork: kept.filter((id) => !isText(id)), text: kept.filter(isText) };
}

/**
 * HOW MUCH OF THE FRAME MAKES A SHAPE THE BOARD'S OWN BACKPLATE rather than a box on it.
 *
 * Written once because two measurements ask it - whether a shape can be one of a repeated ROW,
 * and whether it can HEAD a group in the checklist - and a shape that is a backplate to one and a
 * row to the other would put a graphic in two states at once. The thing a full-frame plate is a
 * plate FOR is the graphic, not a row of it.
 *
 * A THIRD MEASUREMENT ASKS A VERSION OF THIS AND DELIBERATELY DOES NOT USE IT: the unmatched
 * count's `isPlate` (fieldAutoMap.ts) measures a plate against the artwork's INK rather than the
 * frame, at 0.95. The two are not interchangeable and the newer one is the better measured -
 * `scripts/svg-plate-share-spike.mjs` walks 77 files and finds that a frame rule at 0.7 misses 75
 * of their 132 plates, every strap and bug drawn small inside a 1920x1080 artboard among them.
 * This one keeps the frame on purpose. Both its readers ask about a shape's standing IN THE
 * FRAME - may it repeat as a row, may it head the checklist - and both were tuned against
 * `full-frame-offering.spec.ts` and the shipped samples at this number. Moving them onto the ink
 * would change the checklist's grouping and the growth proposal on every lower third in the
 * catalog, which is a measurement of its own and nobody has made it
 * (docs/backlog/one-rule-for-what-a-backplate-is.md).
 */
const BACKPLATE_SHARE_OF_FRAME = 0.7;

/**
 * IS THIS A GRAPHIC THE AUDIENCE SEES AGAIN WITH DIFFERENT CONTENT?
 *
 * The doctrine's third rule (docs/TEXT_BOX_BINDING.md, owner 2026-09-02): *"When we have a
 * graphic that comes up many times in a row, like in a quiz question where the question changes
 * or a poll result or something, then the text part where the question is - that box can't change
 * for every different graphic, because it might look weird if it changes all the time."* And, of
 * the quiz specifically: *"it should not grow, because a quiz page should be the same for each
 * question. It can't live depending on how long the text is."*
 *
 * The axis is not the graphic's shape and it is emphatically not its CATEGORY
 * (docs/backlog/growth-rule-geometry-and-purpose.md, owner 2026-08-30) - it is whether the same
 * artwork comes back with new copy in it. What says so on the artwork itself is a REPEATED ROW:
 * two or more plates of the same size, standing apart from each other, each holding its own
 * editable line. That is what a quiz board, a poll board and a scoreboard look like, and it is
 * what a lower third does not: a strap draws ONE band, and stacks its lines inside it.
 *
 * Three conditions, and each one is a case that reads as a repeat and is not:
 *  - SAME SIZE, within a tenth, MEASURED IN EACH SHAPE'S OWN FRAME. Hand-drawn plates are never
 *    identical, so an exact match would find nothing; and every plate on the owner's board carries
 *    its own rotation, so the screen rectangle is not the plate. Four plates all drawn 76 x 520
 *    have screen rectangles 114, 171, 131 and 111 units tall - the same rule the runtime states
 *    for the same reason (`svgLocalBox`, importedDesign/svg.ts), and read off those the board is
 *    a repeat only by an accident of which two rotations happen to be closest.
 *  - APART FROM EACH OTHER, by how much of the smaller one the two share. A filled plate and the
 *    hand-drawn outline tracing it are the same rectangle twice - the owner's own board draws
 *    every plate that way - and a plate inside a backplate is furniture, not a sibling. Rows in a
 *    set barely touch, and an overlap test survives rotation where a corner comparison does not.
 *  - EACH HOLDING A LINE, asked through `panelsHoldingText` - the same predicate the shape picker
 *    offers from, so what the artwork says here and what the reader is offered cannot drift. It
 *    counts a replaced OUTLINE group and a line the reader drew as well as a drawn one, which
 *    matters: a quiz board whose answers were exported as outlines is still a quiz board.
 *
 * A backplate is left out by area - it holds every line on the board, and the thing it is a
 * plate FOR is the graphic, not a row of it.
 */
function repeatsWithNewContent(stage: HTMLElement, holderIds: string[]): boolean {
  const root = stage.querySelector('svg');
  if (!root) return false;
  const frame = root.getBoundingClientRect();
  if (!(frame.width > 0) || !(frame.height > 0)) return false;
  const rows = holderIds
    .map((id) => {
      const el = markerEl(stage, id);
      const box = el?.getBoundingClientRect();
      if (!el || !box || !(box.width > 0) || !(box.height > 0)) return null;
      // The shape's DRAWN size: its own untransformed box, scaled by whatever uniform scale the
      // stage renders at. `getBBox` ignores every transform above it, which is exactly what a
      // rotation is - so this is the rectangle the designer drew, whichever way they turned it.
      const own = (el as SVGGraphicsElement).getBBox?.();
      const ctm = (el as SVGGraphicsElement).getScreenCTM?.();
      const k = ctm ? Math.hypot(ctm.a, ctm.b) : 1;
      if (!own || !(own.width > 0) || !(own.height > 0)) return null;
      return { box, w: own.width * k, h: own.height * k };
    })
    .filter((r): r is { box: DOMRect; w: number; h: number } => !!r)
    // Not the board's own backplate: a shape covering most of the frame holds every line there
    // is, so it would pair with any other such shape and say "repeat" about a single graphic.
    .filter((r) => r.box.width * r.box.height < frame.width * frame.height * BACKPLATE_SHARE_OF_FRAME);
  const apart = (a: DOMRect, b: DOMRect) => {
    const over =
      Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
      Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
    return over < Math.min(a.width * a.height, b.width * b.height) * 0.25;
  };
  const alike = (a: number, b: number) => Math.abs(a - b) <= Math.max(a, b) * 0.1;
  return rows.some((a) =>
    rows.some((b) => b !== a && apart(a.box, b.box) && alike(a.w, b.w) && alike(a.h, b.h)),
  );
}

/**
 * THE ORDINARY LOWER THIRD WORKS WITH NOTHING CHOSEN (owner 2026-08-25; docs/GOALS.md NOW
 * goal 5). "Of course that text should be able to become longer and the background should
 * grow with it" - so where the artwork says so unambiguously, growth defaults ON and nobody
 * is asked. This measures that, on the step's rendered artwork, and answers with the banner's
 * candidate id or null.
 *
 * What counts as unambiguous - every condition is a case that would otherwise mis-grow:
 *  - a RECTANGLE wider than tall (a banner strip; a chip or a card is not one), with room to
 *    grow before the frame's safe margin (a full-frame backplate has none, and it is also the
 *    thing that must never resize);
 *  - holding at least one STACKED bound line - one that has its own baseline to itself. A pair
 *    sharing a baseline (an exporter's usual shape for a strap's place and its time) is not an
 *    argument either way: widening the panel gives those two nothing, because each is bounded by
 *    the other, and the runtime now measures exactly that (svg.ts `svgFitNeighbour`). It used to
 *    veto the whole file, which is why the shipped Illustrator lower third - three stacked lines
 *    above one such pair - defaulted to shrinking (owner, 2026-08-26). A graphic whose lines are
 *    ALL side by side still refuses: that is a composed row, a scorebug, and it declares a stage.
 *  - those stacked lines every one START-anchored (an end- or middle-anchored line is composed
 *    against a point growth would move away from - the scorebug's score figures, a centred clock);
 *
 * Deliberately NOT measured: the artboard, or the panel's size against it. The 2026-08-23
 * ruling stands - the shipped lower third is a full-frame artboard and the shipped scorebug a
 * small floating object, so any size-against-frame rule mislabels one of them. A quiz
 * BEHAVIOUR also refuses the default (checked by the caller): a board that selects and
 * reveals declares a stage.
 *
 * WHICH shape, not WHETHER it grows. A graphic that comes up again keeps a fixed box
 * (`repeatsWithNewContent`), and the caller applies that to the LADDER while still taking the
 * shape from here - so a reader who overrides "stays as drawn" gets the plate their text is in
 * rather than the widest rectangle on the board.
 */
function proposeBannerGrowth(stage: HTMLElement, svg: SvgImportResult, onTextIds: string[]): string | null {
  if (onTextIds.length === 0) return null;
  const root = stage.querySelector('svg');
  if (!root) return null;
  const frame = root.getBoundingClientRect();
  if (!(frame.width > 0)) return null;
  const el = (id: string) => markerEl(stage, id);
  const lines = onTextIds.flatMap((id) => {
    const node = el(id);
    if (!node) return [];
    const r = node.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) return [];
    return [{ r, anchor: getComputedStyle(node).textAnchor || 'start' }];
  });
  const tol = 2;
  for (const s of svg.shapes) {
    // Widest first, which the inventory already is: the banner is the widest rectangle on it.
    const node = el(s.id);
    if (!node) continue;
    const sr = node.getBoundingClientRect();
    if (!(sr.width > 0) || !(sr.height > 0) || sr.width / sr.height < 1.5) continue;
    if (sr.right > frame.left + frame.width * 0.94) continue;
    const inside = lines.filter(
      (l) =>
        l.r.left >= sr.left - tol &&
        l.r.right <= sr.right + tol &&
        l.r.top >= sr.top - tol &&
        l.r.bottom <= sr.bottom + tol,
    );
    if (inside.length === 0) continue;
    // The lines that have a baseline TO THEMSELVES. Those are the ones a wider panel actually
    // helps, so they are the ones the question is asked about.
    const stacked = inside.filter(
      (a) =>
        !inside.some((b) => {
          if (b === a) return false;
          const overlap = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
          return overlap > Math.min(a.r.height, b.r.height) * 0.5;
        }),
    );
    if (stacked.length === 0) continue;
    if (stacked.some((l) => l.anchor !== 'start')) continue;
    return s.id;
  }
  return null;
}

/**
 * WHICH RECTANGLES COULD ACTUALLY BE THE ONE THAT GROWS (owner walk, 2026-09-01).
 *
 * His words, on the shipped Inkscape lower third: "Which panel grows? is confusing when the
 * graphic appears to contain only one relevant panel. If an option is not meaningful for a
 * particular imported SVG, ideally do not show it." That file draws two rectangles - the dark
 * bar and a 10px amber tab down its edge - so the picker offered a choice between the panel and
 * a hairline that can never grow.
 *
 * It cannot grow, and that is measurable rather than a matter of taste: growth is driven by the
 * bound lines INSIDE the element, so a rectangle holding none is granted zero every time
 * (`growOneRule` returns before it applies anything, importedDesign/svg.ts). The predicate here
 * is deliberately the runtime's own `svgLinesInside` - a line whose left edge starts inside the
 * shape, on rows the shape spans - so what the step offers and what the graphic can do are the
 * same set rather than two guesses that drift. THE LINES ARE OF BOTH KINDS for the same reason:
 * `svgFitNodes` walks the drawn `<text>` AND every placed line (an outlined-glyph stand-in, a
 * field the reader drew), so counting only the drawn ones would call a real panel a no-op.
 *
 * Where NOTHING holds a line (copy drawn outside every rectangle) this answers empty and the
 * caller falls back to offering all of them: refusing to ask is only better than asking when
 * there is one true answer.
 */
function panelsHoldingText(
  stage: HTMLElement,
  svg: SvgImportResult,
  /** The layers the artwork itself draws that are bound: ON text rows, and ON outline rows
   *  (a ticked glyph group is replaced by a placed line in the same spot, and the ladder walks
   *  placed lines exactly like drawn ones - `svgFitNodes`). */
  markerIds: string[],
  /** Lines the reader ADDED, which exist nowhere in the markup: design-px boxes to convert. */
  placed: { x: number; y: number; fontSize: number }[],
): string[] {
  const root = stage.querySelector('svg')?.getBoundingClientRect();
  const boxes = markerIds
    .map((id) => markerEl(stage, id)?.getBoundingClientRect())
    .filter((r): r is DOMRect => !!r && r.width > 0 && r.height > 0)
    .map((r) => ({ top: r.top, bottom: r.bottom, left: r.left }));
  // A drawn field is held in DESIGN px and the stage renders at whatever width it was given, so
  // the one number that converts them is the rendered root's own scale.
  if (root && root.width > 0) {
    const k = root.width / svg.width;
    for (const f of placed) {
      boxes.push({
        top: root.top + f.y * k,
        bottom: root.top + (f.y + f.fontSize) * k,
        left: root.left + f.x * k,
      });
    }
  }
  if (boxes.length === 0) return [];
  return svg.shapes
    .filter((s) => {
      const box = markerEl(stage, s.id)?.getBoundingClientRect();
      if (!box || !(box.width > 0) || !(box.height > 0)) return false;
      return boxes.some((r) => lineSitsIn(r, box));
    })
    .map((s) => s.id);
}

/** Is this line held by that shape? The runtime's own containment test (`svgLinesInside`,
 *  importedDesign/svg.ts) - the rows the shape spans, entered from inside its left edge - and
 *  the ONE place the step spells it, because two spellings of it is how the shapes offered as
 *  growable and the plates named per layer drift into two different answers. */
function lineSitsIn(line: { top: number; bottom: number; left: number }, box: DOMRect): boolean {
  return line.top < box.bottom && line.bottom > box.top && line.left >= box.left - 1 && line.left < box.right;
}

/**
 * WHICH PLATE EACH BOUND LINE SITS ON, so the step can offer that line its own too-long answer
 * (owner walk, 2026-09-03: "What if you want it to react differently between the question and
 * the answer?").
 *
 * `lineSitsIn` read the other way round - once per line rather than once per shape - so the
 * shapes the growth picker offers and the plates these rows name are one answer rather than two.
 *
 * THE SMALLEST HOLDER WINS. A full-frame backplate contains every line on the board, and
 * answering with it would put a quiz question and its four answers on one plate and make the
 * whole feature a no-op. The innermost rectangle is the box the designer drew AROUND that line,
 * which is what "the box it lives in" has meant since docs/TEXT_BOX_BINDING.md.
 *
 * A line inside no rectangle is absent from the answer: it has no plate to grow, so its ladder
 * is wrap-then-shrink whatever anybody picks, and offering it a control would be offering one
 * that does nothing.
 */
function panelOfEachLine(
  stage: HTMLElement,
  svg: SvgImportResult,
  markerIds: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  const plates = svg.shapes
    .map((s) => ({ id: s.id, box: markerEl(stage, s.id)?.getBoundingClientRect() }))
    .filter((s): s is { id: string; box: DOMRect } => !!s.box && s.box.width > 0 && s.box.height > 0);
  for (const id of markerIds) {
    const r = markerEl(stage, id)?.getBoundingClientRect();
    if (!r || !(r.width > 0) || !(r.height > 0)) continue;
    let best: { id: string; area: number } | null = null;
    for (const plate of plates) {
      if (!lineSitsIn(r, plate.box)) continue;
      const area = plate.box.width * plate.box.height;
      if (!best || area < best.area) best = { id: plate.id, area };
    }
    if (best) out[id] = best.id;
  }
  return out;
}

/**
 * THE ROOM ROUND A LINE, AND HOW THE DESIGNER ALIGNED IT, IN THE LINE'S OWN FRAME.
 *
 * What the preview overlay draws (docs/TEXT_BOX_BINDING.md, "the preview overlay"): the dashed
 * inside line sits at these insets, the two figures ARE these numbers, and the caret carries
 * these words. Measured here, on the step's own render, because they are facts about the
 * DRAWING - the room the designer left and the way they placed the block in it - rather than
 * about whatever value happens to be on air in the preview this second
 * (`wizard/make-mapsvgfieldsstep-mapping-step-mode-over`).
 *
 * IN THE LINE'S OWN COORDINATES, never the screen's, and never the box's either. This is the
 * runtime's own frame: `svgAlignOf` maps the plate INTO the line's system through `svgLocalBox`
 * (importedDesign/svg.ts), takes the axis-aligned extent of the quad that comes out, and
 * measures the margins and the centring against that. Text and plate almost always carry the
 * same rotation - the designer turned them together - and then that extent IS the plate, turned;
 * where they differ, the extent is the room the ladder actually gets, because the reading
 * direction is the direction a longer value fills. Doing it in the BOX's frame instead puts the
 * two frames a quarter turn apart on this fixture's own question plate - a portrait rectangle
 * rotated 88.68 degrees under level text - and the measurements are then about different axes:
 * built that way, the bounds drawn round the question came out turned 88.68 degrees off the
 * words they were meant to hug.
 *
 * So `box` comes back in the LINE's units and the preview draws it with the LINE's matrix.
 * `getBBox` leaves out every transform and the mapping between two elements is a ratio of their
 * two matrices, so a uniform page scale cancels: the numbers measured on this hidden stage are
 * the same numbers on the preview's canvas, which is what lets one canvas measure and the other
 * draw without the two being able to disagree.
 *
 * MIRRORED, because that is what the room IS: the runtime keeps the margin the designer left on
 * the tighter side and keeps it on both, so a line drawn hard against one edge is not told it
 * has the whole of the other side to fill. Clamped at zero for a line drawn past its own box,
 * which is artwork rather than an error.
 *
 * EXCEPT ON AN AXIS THE BLOCK IS CENTRED ON, where the gap the designer left is not a margin at
 * all - it is half the centring, and mirroring it hands the line back its own drawn size while
 * the box around it goes unread. `svgAlignOf` and `measureSvgRoom` both replace it there with a
 * TYPOGRAPHIC margin - half the drawn type sideways, half a line vertically - and so does this,
 * with the same two numbers, or the picture would show the owner's question with no room left in
 * a plate the ladder will happily give it two more lines of. Only where the composition really
 * is centring: a line drawn against the top of its box was composed against that edge, and the
 * space above it is margin exactly as it looks.
 *
 * THE ALIGNMENT IS THE RUNTIME'S RULE, read here: a stated `text-anchor` is believed, otherwise
 * the block is centred when its centre sits within `SVG_ALIGN_TOL` of the box's centre and
 * aligned to the side it was drawn nearer. The tolerance is imported rather than repeated, so
 * the word the overlay shows and the anchor the template emits cannot drift apart.
 */
/**
 * What the step measured about a line and its box: the overlay's own fields, plus what the
 * alignment control needs - the alignment READ OFF THE DRAWING (kept apart from `align`, which
 * the row swaps a declared answer into) and the nudge the file recorded.
 */
type BoxFit = Pick<PreviewBoxOverlay, 'box' | 'insetX' | 'insetY'> & {
  /** How the designer aligned the block, in the reader's words. The grid's "read from your
   *  drawing" answer, and the one the runtime derives when nobody declares otherwise. The
   *  overlay's own `align` is this or the row's declared answer (`alignOf`). */
  drawn: PreviewBoxOverlay['align'];
  /** The offset from where the block was drawn to where its anchor snaps it, in the line's own
   *  units - x rightwards, y downwards - and zero on an axis that does not snap. The runtime
   *  measures the same two numbers (`svgAlignOf`, `align.nudge` and `align.nudgeY`); the step
   *  only reads them out, to say what the checkbox hands back. */
  nudge: { x: number; y: number };
  /** The drawn type size, in the same units: the yardstick a nudge worth offering is measured
   *  against. */
  type: number;
};

const ALIGN_H = ['start', 'middle', 'end'] as const;
const ALIGN_V = ['top', 'middle', 'bottom'] as const;

/** How a row's block sits in its box right now: what the author set on the grid, else what the
 *  drawing says. The caret on the preview and the grid's chosen dot both read this, so the two
 *  cannot disagree. */
function alignOf(declared: DesignSvgAlign | undefined, fit: BoxFit): PreviewBoxOverlay['align'] {
  return declared ? { h: SVG_ALIGN_WORD[declared.h], v: declared.v } : fit.drawn;
}

/**
 * IS THE NUDGE WORTH HANDING BACK. Nothing hand-placed sits exactly on a centre, so nearly every
 * centred line records an offset of a unit or two, and a checkbox offering that back on every row
 * would be noise about the hand's wobble rather than about a composition. A quarter of the drawn
 * type is the smallest offset that reads as one: on the owner's board the question's 41 px
 * sideways and 12 px up both clear it at a drawn 36, and a scorebug's figures a couple of units
 * off their band's middle do not. Offered only while the alignment (`now`) is the drawn one on
 * both axes, because the offset was measured from THAT anchor - moved to another edge, there is
 * nothing of the designer's to keep.
 */
function nudgeOffered(now: PreviewBoxOverlay['align'], fit: BoxFit): boolean {
  if (now.h !== fit.drawn.h || now.v !== fit.drawn.v) return false;
  return Math.max(Math.abs(fit.nudge.x), Math.abs(fit.nudge.y)) >= fit.type / 4;
}

/** "36 px to the right, 9 px up" - the nudge in the reader's own px, an axis left out when it
 *  has nothing to say. */
function nudgeWords(nudge: { x: number; y: number }): string {
  const parts: string[] = [];
  if (Math.abs(nudge.x) >= 0.5) parts.push(`${Math.round(Math.abs(nudge.x))} px to the ${nudge.x > 0 ? 'right' : 'left'}`);
  if (Math.abs(nudge.y) >= 0.5) parts.push(`${Math.round(Math.abs(nudge.y))} px ${nudge.y > 0 ? 'down' : 'up'}`);
  return parts.join(', ');
}

function boxFitOf(
  stage: HTMLElement,
  textId: string,
  boxId: string,
): BoxFit | null {
  const textEl = markerEl(stage, textId) as SVGGraphicsElement | null;
  const boxEl = markerEl(stage, boxId) as SVGGraphicsElement | null;
  if (!textEl?.getBBox || !textEl.getScreenCTM || !boxEl?.getBBox || !boxEl.getScreenCTM) return null;
  const toText = textEl.getScreenCTM();
  const fromBox = boxEl.getScreenCTM();
  if (!toText || !fromBox) return null;
  const own = textEl.getBBox();
  const drawn = boxEl.getBBox();
  if (!(own.width > 0) || !(own.height > 0) || !(drawn.width > 0) || !(drawn.height > 0)) return null;
  // The plate's four corners, moved into the line's space and taken as their extent - the one
  // spelling of that in the repo (assets/svgGeometry.ts), and the same answer `svgLocalBox`
  // reaches in the runtime.
  const box = transformedBox(drawn, toText.inverse().multiply(fromBox));
  const cx = own.x + own.width / 2;
  const cy = own.y + own.height / 2;
  const boxCx = box.x + box.width / 2;
  const boxCy = box.y + box.height / 2;
  const placed = Math.abs(cx - boxCx) <= box.width * SVG_ALIGN_TOL ? 'centred' : cx < boxCx ? 'left' : 'right';
  const stated = textEl.getAttribute('text-anchor');
  const align = {
    h: (stated === 'middle' || stated === 'end' || stated === 'start' ? SVG_ALIGN_WORD[stated] : placed) as
      'left' | 'centred' | 'right',
    v: (Math.abs(cy - boxCy) <= box.height * SVG_ALIGN_TOL ? 'middle' : cy < boxCy ? 'top' : 'bottom') as
      'top' | 'middle' | 'bottom',
  };
  // Half the drawn type, in the artwork's own units. `font-size` inside an SVG computes in user
  // units - the viewBox scale is a transform above it, not part of the computed value - so this
  // is comparable with the bbox numbers above, on this stage and on the preview's canvas alike.
  // The block's own height stands in where the file styles the type some other way, which is the
  // runtime's own fallback.
  const type = parseFloat(getComputedStyle(textEl).fontSize) || own.height;
  /** The margin kept on one axis: the tighter of the two gaps, and no wider than the typographic
   *  one where that axis is centring rather than margin. `cap` is null on an axis where the gap
   *  really is a margin, and the mirror is the whole answer. */
  const keep = (before: number, after: number, cap: number | null) =>
    Math.max(0, cap === null ? Math.min(before, after) : Math.min(before, after, cap));
  return {
    box,
    insetX: keep(own.x - box.x, box.x + box.width - (own.x + own.width), align.h === 'centred' ? type * 0.5 : null),
    insetY: keep(
      own.y - box.y,
      box.y + box.height - (own.y + own.height),
      align.v === 'top' ? null : (type * SVG_LINE_HEIGHT) / 2,
    ),
    drawn: align,
    // The runtime's own two rules: sideways there is a snap only for a line both DRAWN and read
    // as centred (a stated middle composed elsewhere stays where it was drawn), and downwards
    // for any middle line. On the owner's board: 41 px to the left and 12 px up, in the line's
    // own frame.
    nudge: {
      x: align.h === 'centred' && placed === 'centred' ? cx - boxCx : 0,
      y: align.v === 'middle' ? cy - boxCy : 0,
    },
    type,
  };
}

/**
 * PLAIN COLOUR WORDS, for naming a box a reader is looking at.
 *
 * Sixteen words and nothing between them: a swatch is already on screen carrying the exact
 * colour, so this only has to be close enough that "the tan plate" and "the blue plate" pick out
 * different shapes on a board. Nearest by straight RGB distance, which is coarse and entirely
 * sufficient at this resolution - a perceptual space would change no answer on any real artwork
 * and would need explaining to whoever edits the list next.
 */
const COLOUR_WORDS: [string, number, number, number][] = [
  ['black', 0x11, 0x11, 0x11], ['grey', 0x88, 0x88, 0x88], ['white', 0xfa, 0xfa, 0xfa],
  ['cream', 0xef, 0xe6, 0xc8], ['tan', 0xd2, 0xb4, 0x8c], ['brown', 0x8b, 0x5a, 0x2b],
  ['red', 0xd0, 0x32, 0x2d], ['orange', 0xef, 0x8a, 0x22], ['amber', 0xf5, 0xbf, 0x3f],
  ['yellow', 0xf2, 0xe5, 0x4b], ['pale green', 0xc5, 0xe1, 0xa5], ['green', 0x3f, 0xa5, 0x50],
  ['teal', 0x2b, 0x9c, 0x9c], ['pale blue', 0xa9, 0xd2, 0xe6], ['blue', 0x2f, 0x6f, 0xd0],
  ['navy', 0x1b, 0x2b, 0x5a], ['purple', 0x7e, 0x4b, 0xc0], ['pink', 0xe8, 0x8f, 0xba],
];

/**
 * The nearest plain word for a computed fill, or null where the fill is not one visible colour.
 *
 * `parseCssColor` does the reading, alpha included: a gradient, a pattern and `none` all answer
 * null, and so does a fully transparent shape - a swatch nobody can see should not be described
 * as black.
 */
function colourWord(fill: string): string | null {
  const c = parseCssColor(fill);
  if (!c || c.a === 0) return null;
  let best: { word: string; d: number } | null = null;
  for (const [word, r, g, b] of COLOUR_WORDS) {
    const d = (c.r - r) ** 2 + (c.g - g) ** 2 + (c.b - b) ** 2;
    if (!best || d < best.d) best = { word, d };
  }
  return best?.word ?? null;
}

/**
 * IS THIS LAYER NAME SOMETHING A READER WOULD RECOGNISE, or the designer's private shorthand?
 *
 * The owner's own board names its question plate `q bg`, and a row headed "q bg" tells a student
 * nothing at all - which is the whole reason the box gets named by its COLOUR instead
 * (docs/TEXT_BOX_BINDING.md, "the grouping IS the binding"). A designer who wrote "Question
 * plate" must keep seeing that, so this refuses only two things: the labels the importer itself
 * minted when the layer had no name, and a name with no word long enough to read as a word.
 */
function isReadableBoxName(label: string): boolean {
  const trimmed = label.trim();
  if (trimmed === '' || /^(Panel|Rectangle)\s+\d+$/.test(trimmed)) return false;
  return /[A-Za-z]{4,}/.test(trimmed);
}

/** What a box is called in the list: the designer's own name where they gave one, otherwise its
 *  colour and what it is. Capitalised because it heads a row. */
function boxName(label: string, fill: string): string {
  if (isReadableBoxName(label)) return label.trim();
  const word = colourWord(fill);
  return word ? `${word[0].toUpperCase()}${word.slice(1)} plate` : 'Plate';
}

/**
 * THE BOARD'S OWN BACKPLATE IS NOT A BOX, so grouping by it says nothing.
 *
 * A shape covering most of the frame holds every line there is, and heading the whole checklist
 * with it - "Black plate", over all seven rows - is a heading, not a grouping. The thing that
 * plate is a plate FOR is the graphic, not a row of it: the same sentence
 * `repeatsWithNewContent` already acts on, through the one `BACKPLATE_SHARE_OF_FRAME`.
 *
 * Dropping these leaves their lines in the "On the artwork" group, which is the honest answer -
 * a line whose only box is the whole frame has no box to grow.
 */
function withoutBackplates(
  stage: HTMLElement,
  boxOfLine: Record<string, string>,
): Record<string, string> {
  const frame = stage.querySelector('svg')?.getBoundingClientRect();
  if (!frame || !(frame.width > 0) || !(frame.height > 0)) return boxOfLine;
  const limit = frame.width * frame.height * BACKPLATE_SHARE_OF_FRAME;
  const out: Record<string, string> = {};
  for (const [lineId, boxId] of Object.entries(boxOfLine)) {
    const box = markerEl(stage, boxId)?.getBoundingClientRect();
    if (box && box.width * box.height >= limit) continue;
    out[lineId] = boxId;
  }
  return out;
}

/**
 * WHAT EACH BOX LOOKS LIKE, measured off the rendered stage.
 *
 * The fill is read from the LAID-OUT element rather than the markup because a fill arrives by
 * class as often as by attribute (every Illustrator export writes `.cls-10 { fill: #c69c6d }`),
 * and `getComputedStyle` is the one reading that is right for all of them. Measured here beside
 * the containment for the same reason that lives here: two spellings of what a box is is how the
 * grouping and the growth picker drift into two different answers.
 */
function boxLooksOf(
  stage: HTMLElement,
  svg: SvgImportResult,
  boxIds: string[],
): Record<string, { fill: string; name: string }> {
  const out: Record<string, { fill: string; name: string }> = {};
  for (const id of new Set(boxIds)) {
    const el = markerEl(stage, id);
    if (!el) continue;
    const fill = getComputedStyle(el).fill || '';
    const label = svg.shapes.find((s) => s.id === id)?.label ?? '';
    out[id] = { fill, name: boxName(label, fill) };
  }
  return out;
}

/** The four rungs of the too-long ladder, as the select spells them (draft.ts owns the type -
 *  a per-plate override is stored as one of these). */
type StretchMode = SvgStretchMode;

const STRETCH_AXIS: Record<Exclude<StretchMode, 'shrink'>, 'x' | 'y' | 'xy'> = {
  'grow-x': 'x',
  'grow-xy': 'xy',
  'grow-y': 'y',
};

/**
 * EVERY OPTION NAMES THE PANEL, because the panel is the only thing that differs (2026-09-05).
 *
 * Two of these used to name the TEXT - "the text wraps onto more lines", "the text gets smaller" -
 * and both were false as descriptions of a choice. The ladder is one order for all four (fill the
 * room, grow where allowed, wrap into what is there, shrink, squeeze), so the text wraps under
 * every option and shrinks under every option; what the reader is actually choosing is how much
 * room the panel is allowed to offer it first.
 *
 * Measured on the owner's own board, one question at three lengths, all four options each time:
 * at 147 and 295 characters the four give IDENTICAL text - same size, same line count - and only
 * the panel's width differs. So a reader switching between "the text gets smaller" and "the text
 * wraps onto more lines" watched the text do exactly the same thing and reasonably concluded the
 * control was dead (owner, 2026-09-05: "I can change how the text should react, but nothing
 * happens in the preview"). The rungs only diverge on copy no panel could hold - at 591 characters
 * they finally do, correctly and four different ways.
 *
 * The section's own prose has always said the true thing - "Text that still does not fit gets
 * smaller, whatever you pick" - so only the labels were lying.
 */
const STRETCH_SUMMARY: Record<StretchMode, string> = {
  'grow-x': 'the panel gets wider',
  'grow-xy': 'the panel gets wider, then taller',
  'grow-y': 'the panel gets taller',
  shrink: 'the panel stays the size you drew',
};

/** THE LADDER, IN THE OWNER'S ORDER (2026-08-26): "first I want it to get wider, and then it
 *  should go to the next line. And the last thing is to shrink" - shrink last "because that
 *  changes the design more". The runtime already runs in that order, so the list IS the order.
 *  One array because the graphic-wide picker and every per-layer one offer the same four rungs,
 *  and two spellings of one ladder is how the two drift apart. */
const STRETCH_OPTIONS: { value: StretchMode; label: string }[] = [
  { value: 'grow-x', label: 'The panel gets wider' },
  { value: 'grow-xy', label: 'The panel gets wider, then taller' },
  { value: 'grow-y', label: 'The panel gets taller' },
  { value: 'shrink', label: 'The panel stays the size you drew' },
];

/* WHICH WAY IT WIDENS IS THE ARTWORK'S ANSWER, not a fixed one (svg.ts `svgGrowDir`): a panel
   holding start-anchored text widens to the right, because that is the only side those lines
   gain from, and one holding centred text widens from its middle so the composition survives.
   Saying "to the right" was true of the runtime until 2026-09-04 and is no longer. */
const STRETCH_HINT: Record<Exclude<StretchMode, 'shrink'>, string> = {
  'grow-x': 'It widens the way you composed it, and the type stays the size you drew.',
  'grow-xy': 'It widens first. Once it reaches the margin it gets taller and the text wraps.',
  'grow-y': 'It gets taller and the text wraps into the new height.',
};

/** WHAT THE READER WILL SEE HAPPEN to the chosen shape, in the words of the result rather than
 *  of our model (owner walk, 2026-09-01: "Which panel grows?" named a concept, not a picture).
 *  The picker's label carries the FIRST visible move only - `STRETCH_HINT`, one line below it,
 *  is where the rest of the ladder is spelled out, and a label that repeated it would be a
 *  question longer than its own answer. */
const GROW_RESULT: Record<Exclude<StretchMode, 'shrink'>, string> = {
  'grow-x': 'gets wider',
  'grow-xy': 'gets wider',
  'grow-y': 'gets taller',
};

/** The published weight closest to the one the file's own name asked for. */
function nearestWeight(weights: number[], want: number): number {
  return weights.reduce((best, w) => (Math.abs(w - want) < Math.abs(best - want) ? w : best), weights[0] ?? want);
}

/** The bundled face's own family name, for a row that matched one under a different spelling. */
function bundledName(fontId: string): string {
  return FONTS.find((b) => b.id === fontId)?.family ?? fontId;
}

/** The two empty choices every behaviour picker offers, written once. One string rather than
 *  fifteen literals: the quiz and the vote ask the same two questions of the same inventory, and
 *  a picker whose empty option read differently from its neighbour's would look like it meant
 *  something different. */
const NOT_DRAWN = '— not drawn —';
/** The quiz's moments fall back to NoaCG's own neutral look (docs/SVG_STATES_FROM_ARTWORK.md, the
 *  ladder's rung 1); every other behaviour's undrawn moment shows nothing extra. */
const DEFAULT_LOOK = 'Not drawn: NoaCG’s own look';
const PICK_A_LAYER = '— pick a text layer —';

/** The four recipes the wizard holds in shapes of their own (draft.ts); every other one is the
 *  generic draft and is listed from the registry. */
const LEGACY_RECIPES = new Set(['quiz', 'score', 'countdown', 'vote']);

/** How many answer rows a quiz board may carry, and the least it can carry. Written once
 *  because the SEED reads off the artwork now (one question, the rest answers) and a seed the
 *  count picker could not display would open the section on a value nobody can get back to. */
const MIN_QUIZ_ANSWERS = 2;
const MAX_QUIZ_ANSWERS = 6;
const QUIZ_ANSWER_COUNTS = Array.from(
  { length: MAX_QUIZ_ANSWERS - MIN_QUIZ_ANSWERS + 1 },
  (_, i) => MIN_QUIZ_ANSWERS + i,
);

/** A picker's label is the ROLE'S OWN WORD (words.json), so the box, the docs' table and the
 *  name hint under the box all say the same thing - the vocabulary ruling in
 *  docs/SVG_STATES_FROM_ARTWORK.md §7: the operator's word and the designer's word are one word. */
function roleLabel(recipeId: string, roleId: string): string {
  const label = rolesOf(recipeId).find((r) => r.id === roleId)?.label ?? roleId;
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** THE LINE UNDER A PICKER (docs/backlog/the-mapping-step-should-explain-and-offer-to-do-it.md,
 *  ask 1): under an EMPTY box, the layer name that would have filled it, read off the matcher;
 *  under a box the fill-them-in press chose, why it chose that layer. Nothing under a box the
 *  reader filled or the drop matched - those need no explaining. */
function NameHint({ hint, filled, testid }: { hint: string | null; filled?: string; testid: string }) {
  if (filled) {
    return (
      <span className="map-svg-name-hint filled" data-testid={`${testid}-why`}>
        filled: {filled}
      </span>
    );
  }
  if (!hint) return null;
  return (
    <span className="map-svg-name-hint" data-testid={`${testid}-hint`}>
      {hint}
    </span>
  );
}

/** What a behaviour is CALLED and what it DOES, in the section summary's two voices - read from
 *  the one word list every recipe declares itself in (templates/behaviours/words.json). */
function behaviourNoun(b: SvgBehaviourDraft): string {
  const words = BEHAVIOUR_WORDS[recipeIdOf(b)];
  return words ? `a ${words.name.toLowerCase().replace(/^the /, '')}` : recipeIdOf(b);
}
function behaviourSummaryLine(b: SvgBehaviourDraft): string {
  const words = BEHAVIOUR_WORDS[recipeIdOf(b)];
  return words ? `${behaviourNoun(b)}: ${words.verbs}` : recipeIdOf(b);
}

/** A recipe's OPTIONS as checkboxes - the first customization rung (docs/SVG_BEHAVIOUR_PLAN.md
 *  §7e): each is a structural variant an expert authored, so ticking one adds or removes arrows
 *  and nothing else. */
function RecipeOptions({
  recipeId,
  values,
  onChange,
}: {
  recipeId: string;
  values: Record<string, boolean>;
  onChange: (values: Record<string, boolean>) => void;
}) {
  const options = recipeById(recipeId)?.options ?? [];
  if (options.length === 0) return null;
  return (
    <div className="map-svg-row" data-testid="map-svg-options">
      {options.map((o) => (
        <label key={o.key} className="save-field" title={o.hint}>
          <input
            type="checkbox"
            checked={values[o.key] ?? o.default}
            onChange={(e) => onChange({ ...values, [o.key]: e.target.checked })}
            data-testid={`map-svg-option-${o.key}`}
          />
          <span>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

/**
 * ONE PICKER OVER THE DRAWN LAYERS - a labelled select of every group and rectangle in the file,
 * with "not drawn" first because leaving a moment out is a valid board.
 *
 * The countdown asks this same question four times over the same inventory, differing only in the
 * label and where the answer goes, so it is one component rather than four near-identical blocks
 * of markup. The quiz's and the score board's own pickers are NOT folded in here: theirs sit
 * inside per-row layouts and read the field list as well, so a shared component would have to grow
 * a shape for each of them, which is the abstraction-on-a-sample-of-two this whole area is written
 * to avoid (docs/GRAPHIC_BEHAVIOUR_PLAN.md §6).
 */
function DrawnPicker({
  label,
  value,
  drawn,
  onPick,
  onHover,
  testid,
  hint,
}: {
  label: string;
  value: string;
  drawn: { id: string; label: string; hidden?: boolean }[];
  onPick: (id: string) => void;
  onHover: (id: string | null) => void;
  testid: string;
  /** The line under the box (NameHint). */
  hint?: ReactNode;
}) {
  return (
    <label className="save-field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onPick(e.target.value)}
        onFocus={() => onHover(value || null)}
        data-testid={testid}
      >
        <option value="">{NOT_DRAWN}</option>
        {drawn.map((g) => (
          <option key={g.id} value={g.id}>
            {g.label}
            {g.hidden ? ' (hidden)' : ''}
          </option>
        ))}
      </select>
      {hint}
    </label>
  );
}

/** Does this row belong with the text-shaped ones? An unmeasured row (null) does — it has not
 *  been judged, and demoting it would bury a row for a reason nobody can see. A row the reader
 *  already ticked does too, whatever the measurement thought. */
function rowIsTexty(f: SvgOutlineDraft): boolean {
  return f.on || f.looksLikeText !== false;
}

/**
 * Measure one outlined-text group on the step's rendered artwork (docs/SVG_IMPORT_PLAN.md
 * §1.A): its box in DESIGN px, the cap-top-to-baseline run, and its fill. `k` maps the
 * rendered SVG's px to design px (the artwork's own space, what addPlacedLine speaks).
 *
 * Outlines carry no type, but the glyph SHAPES still say where the text sat: most glyphs of
 * a line sit ON the baseline, so the most populated cluster of shape bottoms is the baseline
 * (ties go to the top line of a multi-line object), and the tallest shape on that line is
 * its cap/ascender top. That run is what a font size derives from (~0.72 em) — the same
 * reasoning the raster erase uses (draft.ts withEraseSeedFields), measured here from vector
 * shapes instead of ink pixels. A group of fewer than two shapes (or one whose children
 * cannot be measured) falls back to ~78% of the box height, between a caps-only run (0.72)
 * and one with descenders (0.94).
 */
function measureOutline(
  stage: HTMLElement,
  svgRect: DOMRect,
  k: number,
  candidateId: string,
): Pick<SvgOutlineDraft, 'box' | 'color' | 'looksLikeText'> | null {
  const el = markerEl(stage, candidateId);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (!(r.width > 0) || !(r.height > 0)) return null;
  const glyphs = Array.from(el.children).map((c) => c.getBoundingClientRect()).filter((g) => g.height > 0);

  let baseline: number | null = null;
  let lineTop = r.top;
  let onBaseline = 0;
  if (glyphs.length >= 2) {
    // Cluster the bottoms: values within `tol` of each other are one baseline. A descender
    // drops ~0.2 em below the baseline and a second line sits a full line below, so a
    // tolerance of a tenth of the box height separates both without splitting a baseline.
    const tol = r.height * 0.1;
    const bottoms = glyphs.map((g) => g.bottom).sort((a, b) => a - b);
    const clusters: number[][] = [];
    for (const b of bottoms) {
      const last = clusters[clusters.length - 1];
      if (last && b - last[0] <= tol) last.push(b);
      else clusters.push([b]);
    }
    // Most members wins; a tie goes to the earlier (higher) cluster — the first line.
    const best = clusters.reduce((a, c) => (c.length > a.length ? c : a), clusters[0]);
    baseline = best[Math.floor(best.length / 2)];
    // The shapes ON that line: the ones whose vertical span reaches the baseline (a
    // descender glyph straddles it; a hyphen floats above and is rightly left out).
    const bl = baseline;
    const onLine = glyphs.filter((g) => g.top < bl - tol && g.bottom > bl - tol);
    onBaseline = onLine.length;
    if (onLine.length > 0) lineTop = Math.min(...onLine.map((g) => g.top));
  }
  const capHeight = baseline !== null && baseline - lineTop > 0 ? baseline - lineTop : r.height * 0.78;

  // The shapes' own colour, so the stand-in arrives in it. A stroked-only or unfilled
  // outline has nothing to read; the design default serves then.
  const first = el.children[0];
  const fill = first ? getComputedStyle(first).fill : '';
  const color = fill && fill !== 'none' && !fill.startsWith('url(') ? fill : null;

  // DOES IT READ AS A LINE OF TYPE? The markup cannot say — a logo, an icon and a word are all
  // "a group of paths" — but the measured shapes can. A word is several glyphs, most of them
  // standing ON one baseline, in a box wider than it is tall. An icon is two or three shapes
  // nested inside each other with nothing in common. This only RANKS the rows (and badges the
  // rest); nothing is hidden, because the one file where a two-letter logotype really was text
  // is exactly the file this would otherwise silently lose.
  const looksLikeText = glyphs.length >= 3 && onBaseline / glyphs.length >= 0.6 && r.width / r.height >= 1.5;

  return {
    box: {
      x: Math.round((r.left - svgRect.left) * k),
      y: Math.round((lineTop - svgRect.top) * k),
      width: Math.round(r.width * k),
      height: Math.round(r.height * k),
      capHeight: Math.round(capHeight * k),
    },
    color,
    looksLikeText,
  };
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
export default function MapSvgFieldsStep({ draft, onDraft, onHover, onBoxOverlay, onArmDraw, onArmPick }: Props) {
  const svg = draft.designSvg;
  const stageRef = useRef<HTMLDivElement>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The text row whose UNTICK is waiting on "what should we do?" (owner walk, 2026-09-02).
  // The row stays ticked while it is open, so cancelling costs nothing and leaves no half state.
  const [askOff, setAskOff] = useState<string | null>(null);
  // ESCAPE CLOSES THE QUESTION, NOT THE WIZARD. CreationWizard binds Escape on `window` to rewind
  // to the front page, which for a reader with this dialog open would throw away the import they
  // are configuring - the opposite of "a mis-click costs nothing". A CAPTURE listener on the same
  // target runs before that bubble one, so stopping the event here is what keeps the ✕ and the
  // key beside it saying the same thing. Only while the dialog is open; the rewind is untouched
  // everywhere else.
  useEffect(() => {
    if (!askOff) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      setAskOff(null);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [askOff]);
  const [drawArmed, setDrawArmed] = useState(false);
  // While armed, a pick on the artwork adds or drops a FOLLOWER instead of binding a field
  // (plan §6c). Two meanings for one gesture need a mode, and the mode is a visible button
  // rather than a modifier key nobody would find.
  const [followArmed, setFollowArmed] = useState(false);
  const [fontBusy, setFontBusy] = useState<string | null>(null);
  const [fontError, setFontError] = useState<string | null>(null);
  // THE LAST FILL-THEM-IN PRESS: the binding as it was before, and every pick with its reason.
  // Held here rather than in the draft because it is an EXPLANATION of the draft, not part of
  // it: Undo puts `before` back, and a pick is marked under its box only while the box still
  // holds what the fill chose - change the box and the mark goes with it, with no bookkeeping.
  const [fill, setFill] = useState<{ before: SvgBehaviourDraft; picks: FillPick[] } | null>(null);
  const uploadFor = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
  const stretchMode: StretchMode = !draft.svgStretch.on
    ? 'shrink'
    : draft.svgStretch.axis === 'y'
      ? 'grow-y'
      : draft.svgStretch.axis === 'xy'
        ? 'grow-xy'
        : 'grow-x';

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
  /** Bound line -> the plate it sits on, for the per-layer answers below. */
  const [panelOfLine, setPanelOfLine] = useState<Record<string, string>>({});
  /** Text row -> the box the CHECKLIST groups it under: the plate it sits on, minus the board's
   *  own backplate, which is a heading over everything rather than a grouping of anything. */
  const [boxOfRow, setBoxOfRow] = useState<Record<string, string>>({});
  /** Plate -> its swatch colour and the name the checklist heads it with. */
  const [boxLooks, setBoxLooks] = useState<Record<string, { fill: string; name: string }>>({});
  /** Text row -> its box, the room round it and the alignment it was drawn with, all in the
   *  LINE's own units (`boxFitOf`). What the preview overlay draws while that row is hovered. */
  const [boxFits, setBoxFits] = useState<Record<string, BoxFit>>({});
  /** Whether the per-layer answers are showing. Closed on arrival, always: the graphic-wide
   *  picker is the whole control for almost everybody. */
  const [perPanelOpen, setPerPanelOpen] = useState(false);
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!svg || !stage) {
      setPanelIds([]);
      setPanelOfLine({});
      setBoxOfRow({});
      setBoxLooks({});
      setBoxFits({});
      return;
    }
    setPanelIds(panelsHoldingText(stage, svg, boundMarkerIds, placedLines));
    const ofLine = panelOfEachLine(stage, svg, allMarkerIds);
    setPanelOfLine(ofLine);
    const grouped = withoutBackplates(stage, ofLine);
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

  /** The shapes the picker offers. The measurement where it found any, every shape where it
   *  found none, and ALWAYS whatever is currently chosen - a shape picked by dragging on the
   *  artwork is a real answer even when it holds no line, and dropping it out of its own picker
   *  would show a control set to something it does not list. */
  const growOptions = !svg
    ? []
    : (panelIds.length > 0 ? svg.shapes.filter((s) => panelIds.includes(s.id)) : svg.shapes).concat(
        draft.svgStretch.shapeId && panelIds.length > 0 && !panelIds.includes(draft.svgStretch.shapeId)
          ? svg.shapes.filter((s) => s.id === draft.svgStretch.shapeId)
          : [],
      );
  /** The one shape, when there is only one: no question is asked, and the step says so instead.
   *  Only where the MEASUREMENT found it - the all-shapes fallback below means nothing was
   *  measured, and a single shape there has not earned the sentence's claim about it. */
  const soleGrower = growOptions.length === 1 && panelIds.length > 0 ? growOptions[0] : null;

  // ── ONE PLATE MAY ANSWER DIFFERENTLY FROM ANOTHER (owner walk, 2026-09-03) ──
  // His question was about a quiz board: the question and the answers sit on different plates
  // and he wants them to behave differently. GROUPED BY PLATE, not listed per field: growth is
  // something a rectangle does for whatever text sits inside it, so four answers sharing one
  // plate are one row naming all four rather than four rows that would silently fight. That is
  // also what keeps the list two or three rows long on a real board instead of twenty.
  const perPanel = draft.svgStretch.perPanel ?? {};
  const perPanelRows = useMemo(() => {
    const byPanel = new Map<string, { panelId: string; titles: string[] }>();
    const line = (candidateId: string, title: string) => {
      const panelId = panelOfLine[candidateId];
      if (!panelId) return;
      const row = byPanel.get(panelId) ?? { panelId, titles: [] };
      row.titles.push(title.trim() || 'Text');
      byPanel.set(panelId, row);
    };
    for (const f of draft.svgFields) if (f.on) line(f.candidateId, f.title);
    // A ticked outline row is replaced by a placed line in the same spot and the ladder walks
    // it exactly like a drawn one, so it gets the same answer and the same row.
    for (const f of draft.svgOutlines) if (f.on && f.box) line(f.candidateId, f.title);
    return [...byPanel.values()];
  }, [draft.svgFields, draft.svgOutlines, panelOfLine]);
  const perPanelSet = perPanelRows.filter((r) => perPanel[r.panelId] != null).length;

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
  /** One box holding every line is not a grouping, it is a heading over the whole list - so the
   *  headings only appear once the artwork actually has more than one place to put text. */
  const showBoxGroups = fieldGroups.length > 1;
  /** Give one plate its own answer, or hand it back to the graphic-wide one. Touching this is
   *  AUTHORING, like every other growth control: the measured default stops re-deriving. */
  const setPanelMode = (panelId: string, mode: StretchMode | null) => {
    const next = { ...perPanel };
    if (mode == null) delete next[panelId];
    else next[panelId] = mode;
    onDraft({
      svgStretch: {
        ...draft.svgStretch,
        authored: true,
        // Emptied back out rather than left as `{}`, so a reader who sets an override and takes
        // it off again emits exactly the bytes they started with.
        perPanel: Object.keys(next).length > 0 ? next : undefined,
      },
    });
  };

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
        // TURNING ONE OFF ASKS THE SAME QUESTION HERE AS ON THE ROW (owner walk, 2026-09-02).
        // The canvas and the checklist are two views of one decision, so a pick that switches a
        // layer off has to mean what unticking means - otherwise pointing at the artwork is the
        // door that silently picks an answer for you.
        if (text.on) {
          setAskOff(candidateId);
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

  // WHICH FAMILIES GOOGLE ACTUALLY HAS. The index is a local module (no network), so the step
  // can answer this before anyone clicks: offering "Get from Google Fonts" for a licensed face
  // like Gotham is offering a button whose only outcome is an error. Loaded once, lazily, and
  // only for a file that names an unresolved family — a graphic whose fonts all matched pays
  // nothing for a 50 KB list of names.
  const [googleFamilies, setGoogleFamilies] = useState<Set<string> | null>(null);
  const needsGoogleIndex = draft.svgFonts.some((f) => !f.fontId && !f.customFont);
  useEffect(() => {
    if (!needsGoogleIndex || googleFamilies) return;
    let live = true;
    void loadGoogleFontIndex().then((all) => {
      if (live) setGoogleFamilies(new Set(all.map((g) => fontNameKey(g.family))));
    });
    return () => {
      live = false;
    };
  }, [needsGoogleIndex, googleFamilies]);

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

  /** The row whose untick is waiting on an answer, and the layer it names. */
  const asked = askOff ? draft.svgFields.find((f) => f.candidateId === askOff) ?? null : null;
  const answerOff = (whenOff: 'keep' | 'remove') => {
    if (askOff) patchField(askOff, { on: false, whenOff });
    setAskOff(null);
  };

  const patchImage = (candidateId: string, patch: Partial<SvgImageDraft>) =>
    onDraft({
      svgImages: draft.svgImages.map((f) => (f.candidateId === candidateId ? { ...f, ...patch } : f)),
    });

  const patchOutline = (candidateId: string, patch: Partial<SvgOutlineDraft>) =>
    onDraft({
      svgOutlines: draft.svgOutlines.map((f) => (f.candidateId === candidateId ? { ...f, ...patch } : f)),
    });

  // THE QUIZ's pickers work on the rows that are ON — an answer has to be a real field before it
  // can be an answer, and the list re-reads itself as rows are ticked. THE POLL's do not, and
  // that difference is the behaviour's own (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12): a vote's
  // question, options and figures come from the round rather than from an operator's typing, so
  // its layers are display targets picked out of every text layer the artwork has.
  const onFields = draft.svgFields.filter((f) => f.on);
  const textLayers = draft.designSvg?.candidates ?? [];
  const behaviour = draft.svgBehaviour;
  const quiz = behaviour?.kind === 'quiz' ? behaviour : null;
  const poll = behaviour?.kind === 'poll' ? behaviour : null;
  // THE SCORE BOARD'S PICKERS WORK ON THE ROWS THAT ARE ON, like the quiz's and unlike the poll's:
  // a team's name and figure are things the OPERATOR types and bumps, so each has to be a real
  // field before it can be a row (docs/backlog/scoreboard-behaviour.md).
  const score = behaviour?.kind === 'score' ? behaviour : null;
  // THE COUNTDOWN'S PICKERS ARE ALL DRAWN LAYERS, so none of them reads the field rows at all: the
  // clock itself is chosen one section up, by setting a clock-shaped row's kind to Countdown, and
  // asking a second time here would be a second answer to one question
  // (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13).
  const timer = behaviour?.kind === 'timer' ? behaviour : null;
  // ANY OTHER RECIPE WITHOUT ROWS - the meter, the alert - is held generically and its pickers are
  // read off the recipe's own roles, so a recipe added tomorrow needs no new block here.
  const generic = behaviour?.kind === 'recipe' ? behaviour : null;
  const genericRecipe = generic ? recipeById(generic.recipe) : null;
  const genericRoles = genericRecipe?.roles ?? [];
  const genericRows = generic?.rows ?? null;
  const patchGeneric = (patch: Partial<SvgRecipeDraft>) => {
    if (generic) onDraft({ svgBehaviour: { ...generic, ...patch } });
  };
  const patchGenericRow = (at: number, patch: Partial<SvgRecipeRow>) =>
    patchGeneric({ rows: (genericRows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove a row of a generic recipe, keeping every other row's picks beside it. */
  const setGenericRowCount = (want: number) => {
    if (!genericRows) return;
    const rows = [...genericRows];
    while (rows.length < want) rows.push(emptyRecipeRow());
    patchGeneric({ rows: rows.slice(0, want) });
  };
  // ONE POOL FOR THE PICKER AND THE PROPOSAL (draft.ts `scoreDrawnPool`). A moment drawn as a
  // single rectangle - a coloured bar behind a team's row is the ordinary shape of a point flash -
  // is proposable, so it has to be selectable, or the row shows "not drawn" for a layer it really
  // is bound to and touching the select loses that binding.
  const scoreDrawn = scoreDrawnPool(draft.designSvg ?? { groups: [], shapes: [] });

  const patchQuiz = (patch: Partial<SvgQuizDraft>) => {
    if (quiz) onDraft({ svgBehaviour: { ...quiz, ...patch } });
  };
  const patchQuizRow = (at: number, patch: Partial<SvgQuizDraft['rows'][number]>) =>
    patchQuiz({ rows: (quiz?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove an answer row, keeping its drawn states beside it. */
  const setAnswerCount = (want: number) => {
    if (!quiz) return;
    const n = Math.min(Math.max(want, MIN_QUIZ_ANSWERS), MAX_QUIZ_ANSWERS);
    const answers = [...quiz.answers];
    const rows = [...quiz.rows];
    while (answers.length < n) {
      answers.push('');
      rows.push({ selected: '', correct: '', wrong: '' });
    }
    patchQuiz({ answers: answers.slice(0, n), rows: rows.slice(0, n) });
  };

  const patchPoll = (patch: Partial<SvgPollDraft>) => {
    if (poll) onDraft({ svgBehaviour: { ...poll, ...patch } });
  };
  /** The text layers the VOTE drives, so they stop being operator fields. `draftToOptions` drops
   *  them from the field list; this is the same set, read out, so nobody has to discover it by
   *  noticing a field went missing. */
  const pollDriven = pollDrivenLayers(draft.svgBehaviour);
  const pollDrivenNames = draft.svgFields
    .filter((f) => f.on && pollDriven.has(f.candidateId))
    .map((f) => f.title.trim() || 'Text');
  const patchPollRow = (at: number, patch: Partial<SvgPollDraft['rows'][number]>) =>
    patchPoll({ rows: (poll?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove an option row, keeping its bar and figure beside it. */
  const setOptionCount = (n: number) => {
    if (!poll) return;
    const rows = [...poll.rows];
    while (rows.length < n) rows.push(emptyPollRow());
    patchPoll({ rows: rows.slice(0, n) });
  };

  const patchScore = (patch: Partial<SvgScoreDraft>) => {
    if (score) onDraft({ svgBehaviour: { ...score, ...patch } });
  };
  const patchScoreRow = (at: number, patch: Partial<SvgScoreDraft['rows'][number]>) =>
    patchScore({ rows: (score?.rows ?? []).map((r, i) => (i === at ? { ...r, ...patch } : r)) });
  /** Add or remove a team row, keeping its flash beside it. */
  const setTeamCount = (n: number) => {
    if (!score) return;
    const rows = [...score.rows];
    while (rows.length < n) rows.push(emptyScoreRow());
    patchScore({ rows: rows.slice(0, n) });
  };

  const patchTimer = (patch: Partial<SvgTimerDraft>) => {
    if (timer) onDraft({ svgBehaviour: { ...timer, ...patch } });
  };

  /** What the artwork ALREADY gives the operator, and what the binding still owes — both read
   *  out so the "What it does" section can be true rather than merely short. */
  const numberFields = onFields.filter((f) => f.numeric && f.kind !== 'countdown');
  const steppers =
    numberFields.length === 0
      ? ''
      : numberFields.length === 1
        ? 'one number, with + and −'
        : `${numberFields.length} numbers, each with + and −`;
  const behaviourGaps = behaviourBindingGaps(draft);

  // ── THE STEP EXPLAINS ITSELF, AND OFFERS TO DO THE REST (fieldAutoMap.ts) ──
  // The inventories the fill may draw on are EXACTLY what the pickers below offer, for the same
  // reason `scoreDrawnPool` gives: a guess that picks something a box cannot show is a binding
  // the reader cannot correct. The quiz's and the score board's text is the ticked rows; the
  // vote's and any generic recipe's is every text layer; the quiz's drawings are groups only.
  const recipeId = behaviour ? recipeIdOf(behaviour) : null;
  const fillText: FillLayer[] =
    quiz || score
      ? onFields.map((f) => ({ id: f.candidateId, label: f.title, numeric: f.numeric }))
      : textLayers.map((c) => ({ id: c.id, label: c.label, numeric: c.numeric }));
  const fillDrawn: FillLayer[] = quiz
    ? (draft.designSvg?.groups ?? []).map((g) => ({ id: g.id, label: g.label, hidden: g.hidden }))
    : scoreDrawn.map((g) => ({ id: g.id, label: g.label, hidden: g.hidden }));
  // A hidden group already declared a switch or a choice is in use, whatever the pickers say.
  const fillTaken = draft.svgExtras.map((e) => e.candidateId);
  const fillPickers = behaviour ? pickersOf(behaviour, fillText) : [];
  /** Each row's key as the hints and the fill speak it - the key the row's own layer carries. */
  const rowKeyAt = behaviour ? rowKeysOf(behaviour, fillText) : [];
  /** A layer with the box the artwork was measured at, so the count can tell the board's own
   *  plate from something drawn on it. Before the measurement lands every box is absent, which
   *  is the count this notice had before geometry reached it. */
  const withBox = (l: FillLayer): FillLayer => ({ ...l, box: layerBoxes.get(l.id) ?? null });
  const gap =
    behaviour && recipeId
      ? fillGap(recipeId, fillPickers, fillText.map(withBox), fillDrawn.map(withBox), fillTaken, artworkInk)
      : { empty: 0, spare: 0 };
  // The fill's marks belong to the recipe they were made on; a change of behaviour orphans
  // them, and an orphaned mark would explain a box that no longer exists.
  const fillShown = fill && behaviour && recipeIdOf(fill.before) === recipeId ? fill : null;
  /** The reason under a box, while the box still holds what the fill chose. */
  const filledWhy = (role: string, key: string | undefined, value: string): string | undefined =>
    fillShown?.picks.find((p) => p.role === role && p.key === key && p.candidateId === value)?.reason;
  const hintFor = (role: string, key: string | undefined, value: string, testid: string) => (
    <NameHint hint={!value && recipeId ? nameHint(recipeId, role, key) : null} filled={filledWhy(role, key, value)} testid={testid} />
  );
  /** One picker of a generic recipe, whichever pool its role reads from. Shared by the
   *  graphic-level and the per-row boxes so the two cannot offer different inventories. */
  const genericPicker = (role: RecipeRole, value: string, key: string | undefined, testid: string, set: (id: string) => void) =>
    role.kind === 'field' ? (
      <label className="save-field" key={testid}>
        <span>{role.label}</span>
        <select value={value} onChange={(e) => set(e.target.value)} onFocus={() => setHoverId(value || null)} data-testid={testid}>
          <option value="">{PICK_A_LAYER}</option>
          {onFields.map((f) => (
            <option key={f.candidateId} value={f.candidateId}>
              {f.title}
            </option>
          ))}
        </select>
        {hintFor(role.id, key, value, testid)}
      </label>
    ) : role.pool === 'text' ? (
      <label className="save-field" key={testid}>
        <span>{role.label}</span>
        <select value={value} onChange={(e) => set(e.target.value)} onFocus={() => setHoverId(value || null)} data-testid={testid}>
          <option value="">{NOT_DRAWN}</option>
          {textLayers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        {hintFor(role.id, key, value, testid)}
      </label>
    ) : (
      <DrawnPicker key={testid} label={role.label} value={value} drawn={scoreDrawn} onPick={set} onHover={setHoverId} testid={testid} hint={hintFor(role.id, key, value, testid)} />
    );
  const fillThemIn = () => {
    if (!behaviour || !recipeId) return;
    const stage = stageRef.current;
    const measured = stage
      ? measureLayers(stage, [...fillText, ...fillDrawn].map((l) => l.id))
      : new Map<string, Pick<FillLayer, 'box' | 'color'>>();
    const withGeometry = (l: FillLayer): FillLayer => ({ ...l, ...(measured.get(l.id) ?? {}) });
    // The ink is the step's own standing measurement of EVERY candidate, never this press's:
    // the press reads only what the two pools offer, and a picture or an outlined title is ink
    // a reader sees.
    const picks = proposeFill(
      recipeId,
      fillPickers,
      fillText.map(withGeometry),
      fillDrawn.map(withGeometry),
      fillTaken,
      artworkInk,
    );
    setFill({ before: behaviour, picks });
    if (picks.length > 0) onDraft({ svgBehaviour: withFill(behaviour, picks, fillText) });
  };
  // UNDO EMPTIES THE BOXES THE FILL FILLED and nothing else: a box the reader changed since, a
  // row they added, an option they ticked all stay - the press is taken back, not the minutes
  // after it.
  const undoFill = () => {
    if (behaviour && fillShown && fillShown.picks.length > 0) onDraft({ svgBehaviour: clearFill(behaviour, fillShown.picks, fillText) });
    setFill(null);
  };

  // THE SWITCHES AND CHOICES (docs/SVG_BEHAVIOUR_PLAN.md §7c): every hidden group the behaviour
  // above did not claim is offered the same two answers. A hidden layer is a moment the designer
  // drew; the recipe's pickers take the ones it has words for, and this is the road for every
  // other one - an award's winner name, a sponsor tag, a map's highlight.
  const claimed = new Set<string>();
  if (behaviour) {
    const collect = (value: unknown) => {
      if (typeof value === 'string') claimed.add(value);
      else if (Array.isArray(value)) value.forEach(collect);
      else if (value && typeof value === 'object') Object.values(value).forEach(collect);
    };
    collect(behaviour);
  }
  const hiddenUnclaimed = (draft.designSvg?.groups ?? []).filter((g) => g.hidden && !claimed.has(g.id));
  const extraOf = (id: string): SvgExtraDraft | undefined => draft.svgExtras.find((e) => e.candidateId === id);
  const patchExtra = (g: { id: string; label: string }, patch: Omit<Partial<SvgExtraDraft>, 'use'> & { use?: SvgExtraDraft['use'] | '' }) => {
    const rest = draft.svgExtras.filter((e) => e.candidateId !== g.id);
    if (patch.use === '') return onDraft({ svgExtras: rest });
    const current = extraOf(g.id) ?? { candidateId: g.id, use: 'switch' as const, name: extraLayerName(g.label) };
    const { use, ...fields } = patch;
    const next: SvgExtraDraft = { ...current, ...fields, ...(use ? { use } : {}) };
    if (next.use === 'choice' && !next.group) next.group = 'Choice';
    if (next.use === 'switch') delete next.group;
    onDraft({ svgExtras: [...rest, next] });
  };
  const extraCounts = (() => {
    const switches = draft.svgExtras.filter((e) => e.use === 'switch' && hiddenUnclaimed.some((g) => g.id === e.candidateId)).length;
    const choiceNames = new Set(draft.svgExtras.filter((e) => e.use === 'choice' && hiddenUnclaimed.some((g) => g.id === e.candidateId)).map((e) => e.group ?? ''));
    const parts = [
      switches > 0 ? `${switches} ${switches === 1 ? 'switch' : 'switches'}` : '',
      choiceNames.size > 0 ? `${choiceNames.size} ${choiceNames.size === 1 ? 'choice' : 'choices'}` : '',
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : 'none - the hidden layers stay as drawn';
  })();

  const patchFont = (family: string, patch: Partial<SvgFontDraft>) =>
    onDraft({
      svgFonts: draft.svgFonts.map((f) => (f.family === family ? { ...f, ...patch } : f)),
    });

  /** Fetch one family from Google Fonts, embedded like an upload (model/googleFonts.ts).
   *  Google is asked for the LOOKUP name and the weight the file's own name implied — asking
   *  it for Illustrator's "Archivo-Bold" only ever returns "no such family". The @font-face
   *  must then declare the name the SVG references, so the fetched face is re-labelled to it. */
  const fetchFont = async (row: SvgFontDraft) => {
    const family = row.family;
    setFontBusy(family);
    setFontError(null);
    try {
      // Ask the local family index for the LIBRARY'S OWN spelling first: the lookup name is
      // reconstructed from a PostScript name, and no rule can know that "JetBrainsMono" is
      // "JetBrains Mono" rather than "Jet Brains Mono". Compared on identity alone
      // (model/fonts.ts fontNameKey), so every spelling of one family lands on it. The weight is
      // then clamped to one the family actually publishes — Google answers 400 for a weight it
      // does not have, which would quietly return the wrong cut of the right face.
      const index = await loadGoogleFontIndex();
      const known = index.find((g) => fontNameKey(g.family) === fontNameKey(row.lookup));
      const weight = row.weight !== null && known ? nearestWeight(known.weights, row.weight) : row.weight;
      const font = await fetchGoogleFont(known?.family ?? row.lookup, weight ?? undefined);
      patchFont(family, { customFont: font.family === family ? font : { ...font, family } });
    } catch (e) {
      setFontError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontBusy(null);
    }
  };

  /** Upload a licensed font file for one family. The family name is the SVG's, never the
   *  file name's — the @font-face has to answer the name the artwork asks for. */
  const uploadFont = async (family: string, file: File | undefined) => {
    if (!file) return;
    const ext = extOf(file.name);
    if (!['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      setFontError('A font file is .woff2, .woff, .ttf or .otf.');
      return;
    }
    setFontBusy(family);
    setFontError(null);
    try {
      const data = await fileToDataUrl(file);
      const tabularFigures = await registerAndMeasureFont(family, data);
      const font: CustomFont = {
        family,
        format: fontFormatForExt(ext),
        asset: { path: fontAssetPath(file.name), data },
        tabularFigures,
      };
      patchFont(family, { customFont: font });
    } catch (e) {
      setFontError(e instanceof Error ? e.message : String(e));
    } finally {
      setFontBusy(null);
    }
  };

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
                 read aloud, the swatch would be a second copy of it. */
              <p className="map-svg-box-head" data-testid={`map-svg-box-head-${group.fields[0].candidateId}`}>
                {group.boxId && (
                  <span
                    className="map-svg-swatch"
                    style={{ background: boxLooks[group.boxId]?.fill || 'transparent' }}
                    aria-hidden="true"
                  />
                )}
                <strong>{group.label}</strong>
                {/* The lines are listed directly underneath, so counting them for the reader is
                    noise on a board where every plate holds exactly one. The leftover group is
                    the one that has something to say, because "no box" is not visible on the
                    artwork the way a plate is. */}
                {/* TRUE OF BOTH WAYS A LINE ENDS UP HERE: nothing drawn under it at all, and
                    nothing under it but the board's own backplate. Either way there is no box
                    around it that could grow, which is the consequence the reader needs. */}
                {!group.boxId && <span>no box of their own, so nothing grows around them</span>}
              </p>
            )}
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
                onChange={(e) =>
                  e.target.checked
                    ? patchField(f.candidateId, { on: true, whenOff: undefined })
                    : setAskOff(f.candidateId)
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
                  <label className="save-field grow">
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
                          1366x768). On the scorebug at 1280 the widest answer takes the column
                          from 52 px to 111 and the two text boxes from 165 to 135, which the
                          budget survives - but the CLOCK row, which also carries the countdown
                          picker, then wrapped a label and grew from 56 px to 68. The guard in
                          mapSvgFields.css (a row label never wraps) is what buys it back: every
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
              {/* WHAT THE ANSWER DID, said on the row that carries it. An off row used to read
                  the same whichever answer was given, so the dialog's decision was invisible a
                  second after it was made - and the removal is the one nobody can see on the
                  preview, because the words are simply gone. */}
              {!f.on && (
                <span className="map-svg-off-note" data-testid={`map-svg-off-${f.candidateId}`}>
                  {f.whenOff === 'remove' ? 'taken off the artwork' : 'stays as drawn'}
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
      {(textLayers.length > 0 || (draft.designSvg?.groups.length ?? 0) > 0) && (
        <div className="panel-section" data-testid="map-svg-behaviour">
          <SectionHead
            title="What it does"
            summary={
              behaviour
                ? behaviourGaps.length > 0
                  ? `${behaviourNoun(behaviour)}, once you say ${behaviourGaps[0]}`
                  : behaviourSummaryLine(behaviour)
                : steppers || 'it just comes on and off'
            }
            testid="map-svg-why-behaviour"
          >
            {/* THE LIST BELOW ALREADY SAYS WHAT EACH ONE DOES, one line each, so a paragraph
                naming all three again was the step reading itself out loud (owner walk,
                2026-09-03: "it needs to be shorter and just what it does"). */}
            <p>Pick one and the operator gets real buttons on the control page for it.</p>
            <p>
              Your artwork does not change. You say which drawn layer shows at each moment. Leave
              a quiz moment undrawn and NoaCG paints its own neutral look for it; every other
              behaviour shows nothing extra there, and still works.
            </p>
            {/* SAY WHAT THE ARTWORK ALREADY EARNED. A scoreboard is the case that made this
                necessary: a layer holding a plain figure becomes a number field and every control
                surface draws one as a ± stepper. The step offered "Nothing. It comes on and off.",
                the reader read the whole list as "there is no scoreboard here", and nothing
                anywhere said their scores were already drivable. It used to end "that is the whole
                of a scoreboard", which stopped being true the day the score tracker shipped: the
                steppers are still a real road, and they play nothing and reset nothing. */}
            {numberFields.length > 0 && (
              <p data-testid="map-svg-behaviour-steppers">
                {numberFields.length === 1 ? 'One layer holds' : `${numberFields.length} layers hold`}{' '}
                a plain figure ({numberFields.map((f) => f.title).join(', ')}), so the operator
                already gets a + and a − for {numberFields.length === 1 ? 'it' : 'each'}, with no
                behaviour chosen. The score tracker adds the flash you drew and a reset between
                games.
              </p>
            )}
          </SectionHead>
          <label className="save-field">
            <span>Behaviour</span>
            <select
              value={behaviour ? (behaviour.kind === 'recipe' ? behaviour.recipe : behaviour.kind) : 'none'}
              onChange={(e) => {
                const want = e.target.value;
                // LEAVING THE COUNTDOWN PUTS BACK THE CLOCK ROW IT ARMED, and nothing else
                // (draft.ts `disarmTimerClock`). Nothing downstream reads the BEHAVIOUR to decide
                // whether a layer ticks - it reads the ROW - so an arming left behind would ship a
                // graphic counting down on air under an author who had changed their mind.
                const svgFields = want === 'timer' ? draft.svgFields : disarmTimerClock(draft.svgFields);
                if (want === 'none') return onDraft({ svgBehaviour: null, svgFields });
                if (want === 'quiz') {
                  // ONE QUESTION, AND THE REST ARE ANSWERS (owner walk, 2026-09-03: "it defaults
                  // to two answers when you can clearly identify five text boxes, where one is
                  // the question. It should just default to four answers"). The count is read
                  // off the ticked text rows instead of being fixed at two, so a five-row board
                  // opens with four answers already bound. Asking a reader to add the rows their
                  // own artwork draws is asking a question the file answered.
                  // Bounded by the count picker's own range, so the seed is always a value that
                  // select can show, and never below the two the behaviour needs.
                  const seeded = Math.min(
                    Math.max(onFields.length - 1, MIN_QUIZ_ANSWERS),
                    MAX_QUIZ_ANSWERS,
                  );
                  return onDraft({
                    svgBehaviour: quiz ?? {
                      kind: 'quiz',
                      question: onFields[0]?.candidateId ?? '',
                      answers: Array.from({ length: seeded }, (_, i) => onFields[i + 1]?.candidateId ?? ''),
                      rows: Array.from({ length: seeded }, () => ({ selected: '', correct: '', wrong: '' })),
                      locked: '',
                    },
                    svgFields,
                  });
                }
                if (want === 'timer') {
                  // NOTHING IS GUESSED ABOUT THE DRAWINGS - the pickers are the road, and the
                  // proposal is the only shortcut. What the seed DOES do is bind the clock, using
                  // the same rule the drop applies to a PROPOSED timer (`armTimerClock`): a reader
                  // who picks "Countdown" and is then told to go back up the page and change a
                  // row's kind has been given homework by the step that asked the question.
                  const seeded = timer ?? emptyTimerDraft();
                  return onDraft({ svgBehaviour: seeded, svgFields: armTimerClock(svgFields, seeded) });
                }
                if (want === 'score') {
                  // Two empty team rows, for the poll's reason: the pickers are the road, and
                  // guessing which of somebody's fifteen layers is team one would put a team's
                  // points on the wrong figure without saying so.
                  return onDraft({ svgBehaviour: score ?? { kind: 'score', rows: [emptyScoreRow(), emptyScoreRow()], final: '' }, svgFields });
                }
                const wanted = recipeById(want);
                if (wanted && !wanted.instanced) {
                  // Any other recipe is held generically. A recipe with rows opens on its minimum,
                  // every picker empty, for the poll's reason: guessing which of somebody's
                  // fifteen layers is row one would bind the wrong drawing without saying so.
                  const seeded: SvgRecipeDraft = {
                    kind: 'recipe',
                    recipe: want,
                    layers: {},
                    ...(wanted.rows ? { rows: Array.from({ length: wanted.rows.min }, emptyRecipeRow) } : {}),
                    options: {},
                  };
                  return onDraft({ svgBehaviour: generic?.recipe === want ? generic : seeded, svgFields });
                }
                // A fresh vote starts with two empty option rows and nothing else picked. Empty
                // rather than seeded from the first layers in the file: a poll's layers are
                // display targets, and guessing which of somebody's fifteen layers is option one
                // would put the count on the wrong drawing without saying so.
                onDraft({ svgBehaviour: poll ?? { kind: 'poll', question: '', rows: [emptyPollRow(), emptyPollRow()], total: '', badge: '' }, svgFields });
              }}
              data-testid="map-svg-behaviour-kind"
            >
              <option value="none">
                {numberFields.length > 0
                  ? 'Nothing extra. The number layers already get + and −.'
                  : 'Nothing. It comes on and off.'}
              </option>
              <option value="quiz">Quiz. Select an answer, lock it in, reveal it.</option>
              <option value="poll">Live vote. The room votes; the bars move; you show the result.</option>
              <option value="score">Score tracker. A point per press, per team, and a new game.</option>
              <option value="timer">Countdown. It starts on air; you hold it, let it go, reset it.</option>
              {/* Every other recipe, from the registry: a recipe added tomorrow is offered here
                  with no new line, in the words its declaration carries. */}
              {BEHAVIOUR_RECIPES.filter((r) => !r.instanced && !LEGACY_RECIPES.has(r.id)).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}. {r.description}
                </option>
              ))}
            </select>
          </label>
          {/* A binding that will be DROPPED says so here rather than at create time. Same rule
              as `svgBehaviourOption`'s, read from one function, so the sentence cannot drift
              from the decision. */}
          {behaviourGaps.length > 0 && (
            <p className="map-svg-note" data-testid="map-svg-behaviour-missing">
              Still to say: {behaviourGaps.join(', ')}. Until then this graphic just comes on and
              off.
            </p>
          )}
          {/* A LOT DID NOT MATCH (backlog ask 2). THREE is the line: one or two empty boxes are
              what the line under each box already answers, three with unused layers in the file
              is where clicking through starts being the chore the owner named, and the file
              having layers nothing is using is what says the names, not the drawing, are what
              fell short. A board with nothing drawn shows nothing here: its boxes are empty
              because there is nothing to put in them, which is a valid board. */}
          {behaviour && !fillShown && gap.empty >= 3 && gap.spare > 0 && (
            <p className="map-svg-note" data-testid="map-svg-unmatched">
              {gap.empty} boxes below are still empty, and the file has {gap.spare}{' '}
              {gap.spare === 1 ? 'layer' : 'layers'} nothing is using. Their names did not say what
              they are. Name them as the line under each box says and drop the file again, pick
              them by hand, or press Fill them in and check what it chose.
            </p>
          )}
          {/* ONE PRESS FOR THE REST (backlog ask 3). What it chose is shown under each box and
              can be undone as one step, because a silent fill is worse than sixteen boxes. */}
          {behaviour && (fillShown || (gap.empty > 0 && gap.spare > 0)) && (
            <div className="map-svg-fill" data-testid="map-svg-fill">
              {fillShown ? (
                <>
                  <span className="hint" data-testid="map-svg-fill-result">
                    {fillShown.picks.length === 0
                      ? 'Nothing filled: no unused layer sits where an empty box would need it. Pick them by hand.'
                      : `Filled ${fillShown.picks.length} ${fillShown.picks.length === 1 ? 'box' : 'boxes'} from the names and from where each layer sits. The line under each says why; check them.`}
                  </span>
                  <button type="button" onClick={undoFill} data-testid="map-svg-fill-undo">
                    {fillShown.picks.length === 0 ? 'OK' : 'Undo'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={fillThemIn} data-testid="map-svg-fill-button">
                  Fill them in
                </button>
              )}
            </div>
          )}
          {poll && (
            <>
              {/* WHERE THE NUMBERS COME FROM, said once and plainly. A reader who has just picked
                  "Live vote" is owed the shape of the thing: the counts are not typed, and
                  nothing a viewer sends reaches air on its own. */}
              <p className="hint" data-testid="map-svg-poll-how">
                Open a vote from the production’s Audience tab and the room votes at your join
                link. The counts land on this graphic as an ordinary cue, which you still Take,
                so nothing a viewer sends can reach air by itself.
              </p>
              {/* A field that will VANISH says so here rather than being noticed missing on the
                  control page — the same "say what the thing has and what it lacks" rule
                  `missingParts` follows on the catalog side. The NAMES are not repeated here: each
                  of those rows now says it on itself, in place of the boxes it used to offer. */}
              {pollDrivenNames.length > 0 && (
                <p className="map-svg-note" data-testid="map-svg-poll-driven">
                  The vote writes {pollDrivenNames.length} of the layers you ticked above, so there
                  is nothing to type into {pollDrivenNames.length === 1 ? 'it' : 'them'}. Those rows
                  are marked, and they fill from the round you open on the production’s Audience
                  tab. Everything else stays a field.
                </p>
              )}
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Question</span>
                  <select
                    value={poll.question}
                    onChange={(e) => patchPoll({ question: e.target.value })}
                    onFocus={() => setHoverId(poll.question || null)}
                    data-testid="map-svg-poll-question"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {textLayers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {hintFor('question', undefined, poll.question, 'map-svg-poll-question')}
                </label>
                <label className="save-field">
                  <span>Options</span>
                  <select
                    value={String(poll.rows.length)}
                    onChange={(e) => setOptionCount(Number(e.target.value))}
                    data-testid="map-svg-poll-count"
                  >
                    {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                      <option key={n} value={n}>
                        {n} options
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Per option: the layer holding its wording, the bar whose length is its share, the
                figure beside it, and a winner mark if you drew one. The bar is measured at the
                length you drew it, and that length is 100%.
              </p>
              {/* The row layout is the quiz's, reused rather than restated: a marker, one wide
                  picker and a group of three that wraps as one. Same shape, same problem. */}
              {poll.rows.map((row, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-poll-row-${at}`}>
                  <span className="map-svg-quiz-letter">{at + 1}</span>
                  <label className="save-field grow">
                    <span>Option text</span>
                    <select
                      value={row.label}
                      onChange={(e) => patchPollRow(at, { label: e.target.value })}
                      onFocus={() => setHoverId(row.label || null)}
                      data-testid={`map-svg-poll-label-${at}`}
                    >
                      <option value="">{NOT_DRAWN}</option>
                      {textLayers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                    {hintFor('option', rowKeyAt[at], row.label, `map-svg-poll-label-${at}`)}
                  </label>
                  <div className="map-svg-quiz-states">
                    <label className="save-field">
                      <span>Bar</span>
                      <select
                        value={row.bar}
                        onChange={(e) => patchPollRow(at, { bar: e.target.value })}
                        onFocus={() => setHoverId(row.bar || null)}
                        data-testid={`map-svg-poll-bar-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {(draft.designSvg?.shapes ?? []).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                        {(draft.designSvg?.groups ?? []).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('bar', rowKeyAt[at], row.bar, `map-svg-poll-bar-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Figure</span>
                      <select
                        value={row.value}
                        onChange={(e) => patchPollRow(at, { value: e.target.value })}
                        onFocus={() => setHoverId(row.value || null)}
                        data-testid={`map-svg-poll-value-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {textLayers.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      {hintFor('percent', rowKeyAt[at], row.value, `map-svg-poll-value-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Winner</span>
                      <select
                        value={row.winner}
                        onChange={(e) => patchPollRow(at, { winner: e.target.value })}
                        onFocus={() => setHoverId(row.winner || null)}
                        data-testid={`map-svg-poll-winner-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {(draft.designSvg?.groups ?? []).map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('winner', rowKeyAt[at], row.winner, `map-svg-poll-winner-${at}`)}
                    </label>
                  </div>
                </div>
              ))}
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Vote count</span>
                  <select
                    value={poll.total}
                    onChange={(e) => patchPoll({ total: e.target.value })}
                    onFocus={() => setHoverId(poll.total || null)}
                    data-testid="map-svg-poll-total"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {textLayers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  {hintFor('total', undefined, poll.total, 'map-svg-poll-total')}
                </label>
                <label className="save-field grow">
                  <span>VOTE NOW badge</span>
                  <select
                    value={poll.badge}
                    onChange={(e) => patchPoll({ badge: e.target.value })}
                    onFocus={() => setHoverId(poll.badge || null)}
                    data-testid="map-svg-poll-badge"
                  >
                    <option value="">{NOT_DRAWN}</option>
                    {(draft.designSvg?.groups ?? []).map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.label}
                        {g.hidden ? ' (hidden)' : ''}
                      </option>
                    ))}
                  </select>
                  {hintFor('badge', undefined, poll.badge, 'map-svg-poll-badge')}
                </label>
              </div>
            </>
          )}
          {score && (
            <>
              {/* WHAT THE OPERATOR WILL GET, said once and plainly - a reader who has just picked
                  "Score tracker" is owed the shape of the thing before they fill in five pickers.
                  The verbs are the surveyed ones (docs/SCORE_CONTROL_SURVEY.md). */}
              <p className="hint" data-testid="map-svg-score-how">
                Each team gets a +1 and a −1 button on the control page. The +1 plays that team’s
                flash if you drew one; the −1 takes the point and the flash back. “New game” puts
                every score to zero.
              </p>
              <div className="map-svg-row">
                <label className="save-field">
                  <span>Teams</span>
                  <select
                    value={String(score.rows.length)}
                    onChange={(e) => setTeamCount(Number(e.target.value))}
                    data-testid="map-svg-score-count"
                  >
                    {Array.from({ length: SCORE_MAX_ROWS - 1 }, (_, i) => i + 2).map((n) => (
                      <option key={n} value={n}>
                        {n} teams
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Per team: its name layer, its score layer, and the flash you drew for a point if
                you drew one. The score layer has to hold a plain figure.
              </p>
              {score.rows.map((row, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-score-row-${at}`}>
                  <span className="map-svg-quiz-letter">{at + 1}</span>
                  <label className="save-field grow">
                    <span>Team name</span>
                    <select
                      value={row.name}
                      onChange={(e) => patchScoreRow(at, { name: e.target.value })}
                      onFocus={() => setHoverId(row.name || null)}
                      data-testid={`map-svg-score-name-${at}`}
                    >
                      <option value="">{PICK_A_LAYER}</option>
                      {onFields.map((f) => (
                        <option key={f.candidateId} value={f.candidateId}>
                          {f.title}
                        </option>
                      ))}
                    </select>
                    {hintFor('team', rowKeyAt[at], row.name, `map-svg-score-name-${at}`)}
                  </label>
                  <div className="map-svg-quiz-states">
                    <label className="save-field">
                      <span>Score</span>
                      <select
                        value={row.score}
                        onChange={(e) => patchScoreRow(at, { score: e.target.value })}
                        onFocus={() => setHoverId(row.score || null)}
                        data-testid={`map-svg-score-figure-${at}`}
                      >
                        <option value="">{PICK_A_LAYER}</option>
                        {onFields.map((f) => (
                          <option key={f.candidateId} value={f.candidateId}>
                            {f.title}
                            {f.numeric ? '' : ' (not a number)'}
                          </option>
                        ))}
                      </select>
                      {hintFor('score', rowKeyAt[at], row.score, `map-svg-score-figure-${at}`)}
                    </label>
                    <label className="save-field">
                      <span>Flash</span>
                      <select
                        value={row.flash}
                        onChange={(e) => patchScoreRow(at, { flash: e.target.value })}
                        onFocus={() => setHoverId(row.flash || null)}
                        data-testid={`map-svg-score-flash-${at}`}
                      >
                        <option value="">{NOT_DRAWN}</option>
                        {scoreDrawn.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor('team.flash', rowKeyAt[at], row.flash, `map-svg-score-flash-${at}`)}
                    </label>
                  </div>
                </div>
              ))}
              <label className="save-field">
                <span>Full time</span>
                <select
                  value={score.final}
                  onChange={(e) => patchScore({ final: e.target.value })}
                  onFocus={() => setHoverId(score.final || null)}
                  data-testid="map-svg-score-final"
                >
                  <option value="">{NOT_DRAWN}</option>
                  {scoreDrawn.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                      {g.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
                {hintFor('final', undefined, score.final, 'map-svg-score-final')}
              </label>
            </>
          )}
          {timer && (
            <>
              {/* WHAT THE OPERATOR WILL GET, said once and plainly, exactly as the score board's
                  and the vote's sections say it. The verbs are the surveyed ones
                  (docs/BEHAVIOUR_SURVEY.md); "starts on air" is the owner ruling this behaviour
                  was built to (docs/OWNER_RULINGS.md, operator-stories-2026-08-27). */}
              <p className="hint" data-testid="map-svg-timer-how">
                The count starts when you Take the graphic, and holds at 0:00 until you take it
                out. The control page gets Start, Pause and Reset, and the length in minutes is a
                field you can correct on air.
              </p>
              <p className="hint">
                Every layer below is optional. Leave one out and nothing extra shows, and the
                clock still starts, holds and resets.
              </p>
              <DrawnPicker
                label={roleLabel('countdown', 'bar')}
                value={timer.bar}
                drawn={scoreDrawn}
                onPick={(bar) => patchTimer({ bar })}
                onHover={setHoverId}
                testid="map-svg-timer-bar"
                hint={hintFor('bar', undefined, timer.bar, 'map-svg-timer-bar')}
              />
              {/* THE ONE SENTENCE A DESIGNER HAS TO READ. A bar is the layer with no separate
                  looks - it has one length per second left - so it is drawn at the extreme and
                  interpolated, which is the vote board's L4 model reaching a second behaviour
                  (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). Drawn half-length it would read as half
                  the time from the first frame. */}
              <p className="hint" data-testid="map-svg-timer-bar-note">
                Draw the bar at its FULL length. That length is the whole count, and NoaCG
                shortens it as the time goes.
              </p>
              <DrawnPicker
                label={roleLabel('countdown', 'warning')}
                value={timer.warning}
                drawn={scoreDrawn}
                onPick={(warning) => patchTimer({ warning })}
                onHover={setHoverId}
                testid="map-svg-timer-warning"
                hint={hintFor('warning', undefined, timer.warning, 'map-svg-timer-warning')}
              />
              <DrawnPicker
                label={roleLabel('countdown', 'paused')}
                value={timer.paused}
                drawn={scoreDrawn}
                onPick={(paused) => patchTimer({ paused })}
                onHover={setHoverId}
                testid="map-svg-timer-paused"
                hint={hintFor('paused', undefined, timer.paused, 'map-svg-timer-paused')}
              />
              <DrawnPicker
                label={roleLabel('countdown', 'expired')}
                value={timer.expired}
                drawn={scoreDrawn}
                onPick={(expired) => patchTimer({ expired })}
                onHover={setHoverId}
                testid="map-svg-timer-expired"
                hint={hintFor('expired', undefined, timer.expired, 'map-svg-timer-expired')}
              />
            </>
          )}
          {generic && (
            <>
              <p className="hint" data-testid="map-svg-recipe-how">
                {behaviourSummaryLine(generic)}. The operator gets {BEHAVIOUR_WORDS[generic.recipe]?.buttons ?? 'its buttons'}.
              </p>
              {/* GRAPHIC-LEVEL ROLES, one picker each, read off the declaration: a field role
                  from the ticked rows (it becomes what the operator types), a written text
                  role from every text layer, a drawing from the drawn pool. */}
              {genericRoles
                .filter((role) => !role.perRow && !role.countdown)
                .map((role) => {
                  const value = (role.kind === 'field' ? generic.fields?.[role.id] : generic.layers[role.id]) ?? '';
                  const testid = `map-svg-recipe-${role.id}`;
                  const set = (id: string) =>
                    role.kind === 'field'
                      ? patchGeneric({ fields: { ...(generic.fields ?? {}), [role.id]: id } })
                      : patchGeneric({ layers: { ...generic.layers, [role.id]: id } });
                  return genericPicker(role, value, undefined, testid, set);
                })}
              {genericRows && genericRecipe?.rows && (
                <>
                  <label className="save-field">
                    <span>{genericRecipe.rows.role.charAt(0).toUpperCase() + genericRecipe.rows.role.slice(1)} rows</span>
                    <select
                      value={String(genericRows.length)}
                      onChange={(e) => setGenericRowCount(Number(e.target.value))}
                      data-testid="map-svg-recipe-count"
                    >
                      {Array.from({ length: genericRecipe.rows.max - genericRecipe.rows.min + 1 }, (_, i) => genericRecipe.rows!.min + i).map((n) => (
                        <option key={n} value={n}>
                          {n} rows
                        </option>
                      ))}
                    </select>
                  </label>
                  {genericRows.map((row, at) => (
                    <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-recipe-row-${at}`}>
                      <span className="map-svg-quiz-letter">{rowKeyAt[at] ?? at + 1}</span>
                      <div className="map-svg-quiz-states">
                        {genericRoles
                          .filter((role) => role.perRow)
                          .map((role) => {
                            const value = (role.kind === 'field' ? row.fields[role.id] : row.layers[role.id]) ?? '';
                            const testid = `map-svg-recipe-${role.id}-${at}`;
                            const set = (id: string) =>
                              patchGenericRow(at, role.kind === 'field' ? { fields: { ...row.fields, [role.id]: id } } : { layers: { ...row.layers, [role.id]: id } });
                            return genericPicker(role, value, rowKeyAt[at], testid, set);
                          })}
                      </div>
                    </div>
                  ))}
                </>
              )}
              <RecipeOptions recipeId={generic.recipe} values={generic.options} onChange={(options) => patchGeneric({ options })} />
            </>
          )}
          {quiz && (
            <>
              <RecipeOptions recipeId="quiz" values={quiz.options ?? {}} onChange={(options) => patchQuiz({ options })} />
              <div className="map-svg-row hinted">
                <label className="save-field grow">
                  <span>Question</span>
                  <select
                    value={quiz.question}
                    onChange={(e) => patchQuiz({ question: e.target.value })}
                    data-testid="map-svg-quiz-question"
                  >
                    <option value="">{PICK_A_LAYER}</option>
                    {onFields.map((f) => (
                      <option key={f.candidateId} value={f.candidateId}>
                        {f.title}
                      </option>
                    ))}
                  </select>
                  {hintFor('question', undefined, quiz.question, 'map-svg-quiz-question')}
                </label>
                <label className="save-field">
                  <span>Answers</span>
                  <select
                    value={String(quiz.answers.length)}
                    onChange={(e) => setAnswerCount(Number(e.target.value))}
                    data-testid="map-svg-quiz-count"
                  >
                    {QUIZ_ANSWER_COUNTS.map((n) => (
                      <option key={n} value={n}>
                        {n} answers
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="hint">
                Each answer needs its text layer. The selected, correct and wrong drawings are
                yours to leave out.
              </p>
              {quiz.answers.map((answerId, at) => (
                <div className="map-svg-quiz-row" key={at} data-testid={`map-svg-quiz-row-${at}`}>
                  <span className="map-svg-quiz-letter">{String.fromCharCode(65 + at)}</span>
                  <label className="save-field grow">
                    <span>Answer text</span>
                    <select
                      value={answerId}
                      onChange={(e) =>
                        patchQuiz({
                          answers: quiz.answers.map((a, i) => (i === at ? e.target.value : a)),
                        })
                      }
                      data-testid={`map-svg-quiz-answer-${at}`}
                    >
                      <option value="">{PICK_A_LAYER}</option>
                      {onFields.map((f) => (
                        <option key={f.candidateId} value={f.candidateId}>
                          {f.title}
                        </option>
                      ))}
                    </select>
                    {hintFor('answer', rowKeyAt[at], answerId, `map-svg-quiz-answer-${at}`)}
                  </label>
                  {/* The three drawn states travel together: they either sit beside the answer
                      or take their own line as a set of three. Individually wrapped, the
                      narrow column left "Wrong" alone under the other two. */}
                  <div className="map-svg-quiz-states">
                  {(['selected', 'correct', 'wrong'] as const).map((state) => (
                    <label className="save-field" key={state}>
                      <span>{roleLabel('quiz', `answer.${state}`)}</span>
                      <select
                        value={quiz.rows[at]?.[state] ?? ''}
                        onChange={(e) => patchQuizRow(at, { [state]: e.target.value })}
                        onFocus={() => setHoverId(quiz.rows[at]?.[state] || null)}
                        data-testid={`map-svg-quiz-${state}-${at}`}
                      >
                        <option value="">{DEFAULT_LOOK}</option>
                        {draft.designSvg?.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.label}
                            {g.hidden ? ' (hidden)' : ''}
                          </option>
                        ))}
                      </select>
                      {hintFor(`answer.${state}`, rowKeyAt[at], quiz.rows[at]?.[state] ?? '', `map-svg-quiz-${state}-${at}`)}
                    </label>
                  ))}
                  </div>
                </div>
              ))}
              <label className="save-field">
                <span>Locked in</span>
                <select
                  value={quiz.locked}
                  onChange={(e) => patchQuiz({ locked: e.target.value })}
                  data-testid="map-svg-quiz-locked"
                >
                  <option value="">{DEFAULT_LOOK}</option>
                  {draft.designSvg?.groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.label}
                      {g.hidden ? ' (hidden)' : ''}
                    </option>
                  ))}
                </select>
                {hintFor('locked', undefined, quiz.locked, 'map-svg-quiz-locked')}
              </label>
            </>
          )}
        </div>
      )}

      {hiddenUnclaimed.length > 0 && (
        <div className="panel-section" data-testid="map-svg-extras">
          <SectionHead title="Switches and choices" summary={extraCounts} testid="map-svg-why-extras">
            <p>
              A hidden layer can be a SWITCH the operator shows and hides, or one option of a
              CHOICE, where one layer of the set shows at a time. Each gets its own buttons on the
              control page. Name a layer <code>show:Sponsor</code> or <code>choice:Status/Live</code>{' '}
              in your design app and it arrives set; otherwise pick here.
            </p>
          </SectionHead>
          {hiddenUnclaimed.map((g) => {
            const extra = extraOf(g.id);
            return (
              <div className="map-svg-row" key={g.id} data-testid={`map-svg-extra-${g.id}`}>
                <label className="save-field grow">
                  <span>Hidden layer</span>
                  <input
                    value={extra?.name ?? extraLayerName(g.label)}
                    disabled={!extra}
                    onChange={(e) => patchExtra(g, { name: e.target.value })}
                    onFocus={() => setHoverId(g.id)}
                    data-testid={`map-svg-extra-name-${g.id}`}
                    aria-label={`What the operator calls ${g.label}`}
                  />
                </label>
                <label className="save-field">
                  <span>Use</span>
                  <select
                    value={extra?.use ?? ''}
                    onChange={(e) => patchExtra(g, { use: e.target.value as SvgExtraDraft['use'] | '' })}
                    onFocus={() => setHoverId(g.id)}
                    data-testid={`map-svg-extra-use-${g.id}`}
                  >
                    <option value="">Leave as drawn</option>
                    <option value="switch">A switch: Show / Hide</option>
                    <option value="choice">One option of a choice</option>
                  </select>
                </label>
                {extra?.use === 'choice' && (
                  <label className="save-field">
                    <span>Choice</span>
                    <input
                      value={extra.group ?? ''}
                      onChange={(e) => patchExtra(g, { group: e.target.value })}
                      data-testid={`map-svg-extra-group-${g.id}`}
                      aria-label={`Which choice ${g.label} belongs to`}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </div>
      )}
      {svg.candidates.length > 0 && svg.shapes.length > 0 && (
        /* THE HUG (docs/SVG_IMPORT_PLAN.md §3, GOALS goal 5). A lower third's banner should be
           as wide as the name on it; a quiz board and a scorebug declare a stage and must not
           move. Where the artwork answers that unambiguously the default is already right (the
           measuring effect above); where it does not, shrink stands and this asks. */
        <div className="panel-section" data-testid="map-svg-stretch">
          <SectionHead
            title="When the text is too long"
            summary={
              !draft.svgStretch.on
                ? STRETCH_SUMMARY.shrink
                : `${STRETCH_SUMMARY[stretchMode]}${draft.svgStretch.authored ? '' : ' — read from your artwork'}`
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
              not fit. What you are choosing here is the panel.
            </p>
            <p>
              We read your artwork and picked one. Change it here, or drag a rectangle on the
              preview.
            </p>
          </SectionHead>
          <label className="save-field">
            <span>Too-long text</span>
            {/* The rungs and their order live in `STRETCH_OPTIONS`, shared with the per-layer
                pickers below. The combination is a real choice rather than a fourth thing to
                explain (owner, 2026-08-26: "There are many graphics that we do not want to
                scale ... we should let the customer choose whatever they want."). */}
            <select
              value={stretchMode}
              onChange={(e) => {
                const mode = e.target.value as StretchMode;
                onDraft({
                  svgStretch: {
                    ...draft.svgStretch,
                    on: mode !== 'shrink',
                    // Touching the select is AUTHORING: the measured default never overwrites
                    // an answer a person gave (the effect above skips authored state).
                    authored: true,
                    // Turning it on with nothing picked takes the proposal rather than
                    // leaving a switch that is on and does nothing.
                    shapeId: draft.svgStretch.shapeId ?? growOptions[0]?.id ?? svg.shapes[0]?.id ?? null,
                    axis: mode === 'shrink' ? (draft.svgStretch.axis ?? 'x') : STRETCH_AXIS[mode],
                  },
                });
              }}
              data-testid="map-svg-stretch-mode"
            >
              {STRETCH_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          {/* NO QUESTION WHERE THERE IS ONE ANSWER (owner walk, 2026-09-01). One candidate is
              stated, not asked: the shape is NAMED, hovering the line lights it up on the artwork
              exactly as hovering the picker did, and the reason it is the only one is said out
              loud - so a missing control never reads as a missing feature. What will visibly
              happen to it is the next line's job (`STRETCH_HINT`), whose "It" this gives an
              antecedent to. */}
          {draft.svgStretch.on && stretchMode !== 'shrink' && soleGrower && (
            <p
              className="hint map-svg-grow-one"
              onMouseEnter={() => setHoverId(soleGrower.id)}
              onMouseLeave={() => setHoverId((h) => (h === soleGrower.id ? null : h))}
              data-testid="map-svg-stretch-only"
            >
              <strong>{soleGrower.label}</strong> is the shape that grows. It is the only one your
              text sits in.
            </p>
          )}
          {draft.svgStretch.on && !soleGrower && (
            <label
              className="save-field"
              onMouseEnter={() => setHoverId(draft.svgStretch.shapeId)}
              onMouseLeave={() => setHoverId((h) => (h === draft.svgStretch.shapeId ? null : h))}
            >
              {/* NAMED BY THE VISIBLE RESULT, never by our model. "Which panel grows" asked about
                  a concept the reader has no word for; this asks about the thing they drew and
                  the thing they will watch happen to it. */}
              {/* `stretchMode` is 'shrink' exactly when growth is OFF, and this block only
                  renders while it is on - so the ladder always has a visible result to name. */}
              <span>Which shape {GROW_RESULT[stretchMode as Exclude<StretchMode, 'shrink'>]}</span>
              <select
                value={draft.svgStretch.shapeId ?? ''}
                // SPREAD, never rebuild. Written as a fresh object this dropped the AXIS the
                // reader had just chosen - picking the panel silently sent a "grows taller"
                // graphic back to growing sideways - and it would drop their declared
                // followers with it. Changing the panel also invalidates that set: it was
                // measured against a different element, so it goes back to being proposed.
                onChange={(e) =>
                  onDraft({
                    svgStretch: {
                      ...draft.svgStretch,
                      on: true,
                      authored: true,
                      shapeId: e.target.value || null,
                      followers: null,
                    },
                  })
                }
                data-testid="map-svg-stretch-shape"
              >
                {/* Only the shapes a bound line actually sits in (`growOptions`): the rest are
                    granted nothing by the runtime, so offering them is offering a control with
                    no effect - the defect the owner named on the shipped Inkscape lower third. */}
                {growOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label} — {Math.round(s.width)} × {Math.round(s.height)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {draft.svgStretch.on && stretchMode !== 'shrink' && (
            <p className="hint">{STRETCH_HINT[stretchMode]}</p>
          )}
          {/* THE ANSWER ABOVE IS THE DEFAULT, NOT THE ONLY ANSWER (owner walk, 2026-09-03: "What
              if you want it to react differently between the question and the answer? What's our
              solution for that?").
              CLOSED UNTIL SOMEBODY WANTS IT. A row per layer, always shown, would turn a
              two-click step into a twenty-click one for every reader who does not care - and
              most do not, which is why the graphic-wide picker exists at all. So this is one
              line, and it says what opening it gets you.
              OFFERED ONLY WHERE THERE IS A CHOICE: with one plate under all the text there is
              nothing to differentiate, and the picker above already IS that plate's answer. */}
          {perPanelRows.length > 1 && (
            <div className="map-svg-per-panel">
              <button
                type="button"
                className="map-svg-per-panel-toggle"
                aria-expanded={perPanelOpen}
                onClick={() => setPerPanelOpen((o) => !o)}
                data-testid="map-svg-per-panel-toggle"
              >
                {perPanelSet === 0
                  ? 'Give one part of the graphic its own answer'
                  : `${perPanelSet} part${perPanelSet === 1 ? '' : 's'} answer${perPanelSet === 1 ? 's' : ''} differently`}
              </button>
              {perPanelOpen && (
                <div className="map-svg-per-panel-rows" data-testid="map-svg-per-panel-rows">
                  {perPanelRows.map((row) => (
                    <label
                      className="save-field"
                      key={row.panelId}
                      onMouseEnter={() => setHoverId(row.panelId)}
                      onMouseLeave={() => setHoverId((h) => (h === row.panelId ? null : h))}
                    >
                      {/* NAMED BY THE LAYERS, KEYED BY THE PLATE. The reader thinks in the text
                          they typed; the runtime grows the rectangle behind it. Lines sharing a
                          plate are named together on one row, so a shared answer is visible
                          rather than a surprise. */}
                      <span>{row.titles.join(', ')}</span>
                      <select
                        value={perPanel[row.panelId] ?? ''}
                        onChange={(e) =>
                          setPanelMode(row.panelId, (e.target.value || null) as StretchMode | null)
                        }
                        data-testid={`map-svg-per-panel-${row.panelId}`}
                      >
                        <option value="">Same as above</option>
                        {STRETCH_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}
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

      {draft.svgFonts.length > 0 && (
        <div className="panel-section" data-testid="map-svg-fonts">
          <SectionHead
            title="Typefaces"
            summary={`${draft.svgFonts.filter((f) => f.fontId || f.customFont).length} of ${draft.svgFonts.length} embedded in the template`}
            testid="map-svg-why-fonts"
          >
            <p>
              An SVG carries the typeface NAME, not the font file. A typeface we can find gets
              embedded in the template, so the graphic looks the same on every playout machine.
              One we cannot find falls back to whatever that machine has, so the row warns.
            </p>
          </SectionHead>
          {draft.svgFonts.map((f) => (
            <div className="map-svg-font" key={f.family} data-testid={`map-svg-font-${f.family}`}>
              <strong className="map-svg-font-name">{f.family}</strong>
              {f.fontId ? (
                <span className="status-ok" data-testid={`map-svg-font-ok-${f.family}`}>
                  {/* When the file asks for a PostScript name ("Archivo-Bold"), name the face it
                      actually matched — otherwise the row claims a match for a family the reader
                      cannot see anywhere in their design. */}
                  ✓ Bundled with NoaCG
                  {bundledName(f.fontId) !== f.family ? ` (${bundledName(f.fontId)})` : ''}
                </span>
              ) : f.customFont ? (
                <span className="status-ok">✓ Embedded in the template</span>
              ) : (
                <>
                  <span className="status-warn" data-testid={`map-svg-font-warn-${f.family}`}>
                    Not embedded. Playout will substitute another face unless that machine has
                    this one installed.
                  </span>
                  <span className="map-svg-font-actions">
                    {/* The Google door is offered only for a family Google HAS. A licensed face
                        (Gotham, a foundry's own) is not on that list, and a button whose only
                        outcome is an error reads as the product being broken rather than as the
                        font being private. Until the index has loaded the button stands. */}
                    {googleFamilies && !googleFamilies.has(fontNameKey(f.lookup)) ? (
                      <span className="muted" data-testid={`map-svg-font-nogoogle-${f.family}`}>
                        Not on Google Fonts — upload the file
                      </span>
                    ) : (
                      <button
                        disabled={fontBusy !== null}
                        onClick={() => void fetchFont(f)}
                        title="Downloads the family from Google Fonts and embeds it in the template. The download shows your IP address to Google."
                        data-testid={`map-svg-font-google-${f.family}`}
                      >
                        {fontBusy === f.family ? 'Fetching…' : 'Get from Google Fonts'}
                      </button>
                    )}
                    <button
                      disabled={fontBusy !== null}
                      onClick={() => {
                        uploadFor.current = f.family;
                        fileInput.current?.click();
                      }}
                    >
                      Upload font file…
                    </button>
                  </span>
                </>
              )}
            </div>
          ))}
          {fontError && <p className="status-bad">✗ {fontError}</p>}
          <input
            ref={fileInput}
            type="file"
            accept=".woff2,.woff,.ttf,.otf"
            style={{ display: 'none' }}
            onChange={(e) => {
              const family = uploadFor.current;
              uploadFor.current = null;
              if (family) void uploadFont(family, e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}

      {/* WHAT SHOULD WE DO WITH THE WORDS? (owner walk, 2026-09-02.)
          Unticking used to mean one thing silently - the layer stays exactly as drawn and the
          operator cannot retype it - which he read as neither of the two things he might have
          meant. So the step asks, and KEEPING is the primary: he was explicit that removal must
          never be automatic, "what if it's there for a reason anyway?" Closing the dialog leaves
          the row ticked, so a mis-click costs nothing.

          The app's dialog anatomy (src/styles/AGENTS.md): a `.wz-modal` in a `.gallery-backdrop`,
          one header row with the ✕ hard right, and a `.dlg-foot` whose primary sits right. */}
      {asked && createPortal(
        /* PORTALLED TO THE BODY, for the reason WizardConfirm.tsx gives: a dialog raised over
           the full-screen wizard has to beat the wizard's own shell rather than sit inside it.
           Nested, it could not - `.gallery-backdrop.wz-full` is a positioned, z-indexed box and
           so a stacking context, which clamps everything inside it below the corner notices at
           the root however high this dialog's own z-index goes. That is precisely the issue #50
           failure (a notice taking a dialog's click), surviving inside the one walk that
           matters most: a student mapping their own artwork's text layers.

           Clicking the backdrop closes it, like every other dialog in the app - and the click
           must not reach the row underneath, which would re-open the question it just closed.
           Portalling does not change that: React events bubble through the React tree, not the
           DOM one, so the step's own handlers still see what they saw before. */
        <div
          className="gallery-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setAskOff(null);
          }}
        >
          <div
            className="wz-modal map-svg-off-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="map-svg-off-title"
            data-testid="map-svg-off-dialog"
          >
            <div className="wz-header">
              <h2 id="map-svg-off-title">What should happen to these words?</h2>
              <button className="gallery-close" onClick={() => setAskOff(null)} title="Close">✕</button>
            </div>
            <div className="map-svg-off-body">
              <p>
                <strong>“{asked.sample.trim() || asked.title.trim() || 'This layer'}”</strong> stops
                being a field the operator can retype. It is still your artwork, so it is your
                call what happens to it.
              </p>
              <p className="hint">
                Keep it and the words air exactly as you drew them, every time. Remove it and the
                layer comes off the graphic - the shapes stay in the file, hidden by one line of
                CSS, so nothing you exported is thrown away.
              </p>
            </div>
            <div className="dlg-foot">
              <button onClick={() => answerOff('remove')} data-testid="map-svg-off-remove">
                Remove the text
              </button>
              {/* `.dlg-foot .spacer` is the scoped push the anatomy provides (src/styles/AGENTS.md). */}
              <div className="spacer" />
              <button className="primary" onClick={() => answerOff('keep')} data-testid="map-svg-off-keep">
                Keep it as drawn
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
