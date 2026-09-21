// ── WHAT THE MAPPING STEP MEASURES OFF ITS OWN RENDER ───────────────────────────────────────
//
// The step draws the sanitized artwork once, off screen (the `.map-svg-measure` stage in
// MapSvgFieldsStep.tsx), and asks it the questions no amount of reading the file can answer:
// where each layer actually sits once every transform is applied, what colour it is, which
// rectangle a line is drawn inside, how much room the designer left around it. Every function
// here takes that `stage` element and returns plain values; none of them touches the draft,
// renders anything, or holds state.
//
// THEY ARE MIRRORS OF RUNTIME RULES, which is the reason to keep them together and named after
// the rule they mirror. `lineSitsIn` is `svgLinesInside`; `boxFitOf` is `svgAlignOf` plus
// `measureSvgRoom`; `repeatsWithNewContent` reads a shape's drawn size the way `svgLocalBox`
// does. Those originals live as untyped JavaScript inside the emitted runtime string in
// templates/importedDesign/svg.ts, so the two cannot share a line of code - which makes drift
// the standing risk, and one file the reviewer can hold both halves of the only defence.
//
// NO JSX, AND STILL UNDER components/ ON PURPOSE (docs/ARCHITECTURE.md §5). The stage is the
// step's own render and the results go straight back into the step's state, so this is the
// step's controller rather than a transform anything below the UI could call. Moving it down a
// domain would also cost what the capability folder buys: `scripts/e2e-affected.mjs` maps
// src/components/wizard/import/ to the import road's 13 specs, and two compiled invariants
// (`wizard/let-geometry-propose-followers-author-edit`, which names `proposeFollowers` below)
// are scoped to this folder and would stop loading for the code they govern.

import { parseCssColor } from '../../../model/cssVars';
import { transformedBox } from '../../../assets/svgGeometry';
import { PANEL_SAFE, SVG_ALIGN_TOL, SVG_ALIGN_WORD, SVG_LINE_HEIGHT } from '../../../templates/importedDesign/svg';
import { SVG_CANDIDATE_ATTR, type SvgImportResult } from '../../../assets/svgImport';
import type { DesignSvgAlign } from '../../../templates/importedDesign/designTypes';
import type { PreviewBoxOverlay } from '../WizardPreview';
import type { SvgOutlineDraft } from './draft';
import type { FillLayer } from './fieldAutoMap';

/** Is this marker one of the file's TEXT layers? The one place that answers it, because three
 *  rules turn on it and a fourth spelling of it is how the offered set and the committed set
 *  drift apart. */
export function isTextLayer(svg: SvgImportResult | null, id: string): boolean {
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
export function measureBoxes(stage: HTMLElement, ids: string[]): Map<string, FillLayer['box']> {
  return new Map([...measureStage(stage, ids, false)].map(([id, m]) => [id, m.box]));
}

/** Where each layer sits AND what colour it is, for the fill-them-in guess: a green drawing on an
 *  answer row is its correct look, a red one its wrong look. */
export function measureLayers(stage: HTMLElement, ids: string[]): Map<string, Pick<FillLayer, 'box' | 'color'>> {
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
export function proposeFollowers(
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
export function repeatsWithNewContent(stage: HTMLElement, holderIds: string[]): boolean {
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
export function proposeBannerGrowth(stage: HTMLElement, svg: SvgImportResult, onTextIds: string[]): string | null {
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
export function panelsHoldingText(
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
export function panelOfEachLine(
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
export type BoxFit = Pick<PreviewBoxOverlay, 'box' | 'insetX' | 'insetY'> & {
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

export const ALIGN_H = ['start', 'middle', 'end'] as const;
export const ALIGN_V = ['top', 'middle', 'bottom'] as const;

/** How a row's block sits in its box right now: what the author set on the grid, else what the
 *  drawing says. The caret on the preview and the grid's chosen dot both read this, so the two
 *  cannot disagree. */
export function alignOf(declared: DesignSvgAlign | undefined, fit: BoxFit): PreviewBoxOverlay['align'] {
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
export function nudgeOffered(now: PreviewBoxOverlay['align'], fit: BoxFit): boolean {
  if (now.h !== fit.drawn.h || now.v !== fit.drawn.v) return false;
  return Math.max(Math.abs(fit.nudge.x), Math.abs(fit.nudge.y)) >= fit.type / 4;
}

/** "36 px to the right, 9 px up" - the nudge in the reader's own px, an axis left out when it
 *  has nothing to say. */
export function nudgeWords(nudge: { x: number; y: number }): string {
  const parts: string[] = [];
  if (Math.abs(nudge.x) >= 0.5) parts.push(`${Math.round(Math.abs(nudge.x))} px to the ${nudge.x > 0 ? 'right' : 'left'}`);
  if (Math.abs(nudge.y) >= 0.5) parts.push(`${Math.round(Math.abs(nudge.y))} px ${nudge.y > 0 ? 'down' : 'up'}`);
  return parts.join(', ');
}

/**
 * THE BAND OF ITS BOX A LINE OWNS, top to bottom in the line's own frame - the mirror of the
 * runtime's `svgOwnBand`, so the grid's "read from your drawing" answer is the one the template
 * acts on. The box is trimmed to the nearest SHAPE drawn inside it under the line and the nearest
 * over it; a text never trims it, because text under text is a stack whose gap is the leading. A
 * quiz question over its answer rows is centred in the band above them, not at the top of the
 * board.
 */
function ownBandOf(
  textEl: SVGGraphicsElement,
  boxEl: SVGGraphicsElement,
  own: DOMRect,
  box: { x: number; y: number; width: number; height: number },
  centred: boolean,
): { top: number; bottom: number } {
  const band = { top: box.y, bottom: box.y + box.height };
  const root = boxEl.ownerSVGElement;
  const toText = textEl.getScreenCTM();
  if (!root || !toText) return band;
  const panel = boxEl.getBoundingClientRect();
  // Sideways, what the line may fill: its whole box when centred, else where it was drawn.
  const from = centred ? box.x : own.x;
  const to = centred ? box.x + box.width : own.x + own.width;
  let above: { edge: number; text: boolean } | null = null;
  let below: { edge: number; text: boolean } | null = null;
  for (const o of root.querySelectorAll<SVGGraphicsElement>('text, tspan, image, rect, path, polygon, ellipse, circle')) {
    if (o === textEl || o === boxEl || o.contains(textEl) || textEl.contains(o)) continue;
    const r = o.getBoundingClientRect();
    if (!(r.width > 0) || !(r.height > 0)) continue;
    if (r.width * r.height >= panel.width * panel.height) continue; // that IS the panel
    if (r.left < panel.left - 1 || r.right > panel.right + 1 || r.top < panel.top - 1 || r.bottom > panel.bottom + 1) continue;
    const ctm = o.getScreenCTM();
    if (!ctm || !o.getBBox) continue;
    const at = transformedBox(o.getBBox(), toText.inverse().multiply(ctm));
    if (at.x + at.width < from + 1 || at.x > to - 1) continue;
    const text = /^(text|tspan)$/i.test(o.tagName);
    if (at.y >= own.y + own.height - 1) {
      if (!below || at.y < below.edge) below = { edge: at.y, text };
    } else if (at.y + at.height <= own.y + 1) {
      if (!above || at.y + at.height > above.edge) above = { edge: at.y + at.height, text };
    }
  }
  if (below && !below.text && below.edge < band.bottom) band.bottom = below.edge;
  if (above && !above.text && above.edge > band.top) band.top = above.edge;
  return band;
}

export function boxFitOf(
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
  const placed = Math.abs(cx - boxCx) <= box.width * SVG_ALIGN_TOL ? 'centred' : cx < boxCx ? 'left' : 'right';
  // The vertical half is read in the band the line owns, exactly as the runtime reads it.
  const band = ownBandOf(textEl, boxEl, own, box, placed === 'centred');
  const bandH = band.bottom - band.top;
  const boxCy = band.top + bandH / 2;
  const stated = textEl.getAttribute('text-anchor');
  const align = {
    h: (stated === 'middle' || stated === 'end' || stated === 'start' ? SVG_ALIGN_WORD[stated] : placed) as
      'left' | 'centred' | 'right',
    v: (Math.abs(cy - boxCy) <= bandH * SVG_ALIGN_TOL ? 'middle' : cy < boxCy ? 'top' : 'bottom') as
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
      own.y - band.top,
      band.bottom - (own.y + own.height),
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
 * HOW FAR A BOX MAY GET TALLER, AND WHERE THAT LIMIT STANDS (docs/TEXT_BOX_BINDING.md, rung 4).
 *
 * The mirror of `svgGrowCap`, measured here so the reader can SEE the limit and move it. Every
 * margin comes back as a fraction of the frame on the growing axis, which is the unit the rule
 * travels in (`DesignSvgGrowth.cap`) and the unit the preview draws in - the step measures on
 * its own hidden render of the artwork and the preview draws on the running document, and a
 * fraction of the frame is the one thing both canvases agree on whatever either is scaled to.
 *
 * ONLY THE TALLER AXIS, which is a departure from the design and is recorded there. Downwards
 * the runtime has one answer - the side with more room - and downwards is where the owner's
 * "we shouldn't be able to put one page of text" lives. Sideways it chooses between three
 * directions at play time from what the lines inside ask for (`svgGrowDir`), and two of them
 * spend the margin on BOTH sides, so one line drawn on one edge would be a limit the reader can
 * see on one side of the box and not on the other.
 */
export interface GrowCapFit {
  /** Which way out of the box the growth goes: 1 = downward, -1 = upward. `svgGrowDir`'s own
   *  rule for this axis - the side with more room between the box and the frame. */
  dir: 1 | -1;
  /** Where the limit stands today, as a fraction of the frame's height: the margin the growing
   *  edge must leave. The design's own margin mirrored, floored at `min` and - where the design
   *  leaves the box no room at all - clamped at `max`, which is the honest picture of a box that
   *  cannot grow: its limit is its own edge. */
  drawn: number;
  /** The tightest the reader may pull it: the frame's safe margin. */
  min: number;
  /** The loosest: the margin that puts the limit exactly on the box's drawn edge. Past it the
   *  limit would be INSIDE the box as drawn, which is why the drag stops here. */
  max: number;
  /** The design's own answer BEFORE the two ends clamp it: the margin it left on the other
   *  side of the box. `drawn` is this one clamped, and where the two differ the line is not
   *  standing where the design put it, which is a thing the words have to say. */
  mirrored: number;
  /**
   * WHERE THE GROWING EDGE ALREADY REACHES, as a fraction of the frame measured from the edge it
   * grows towards: the far side of the box AND of everything drawn past it, which is what travels
   * when the box grows.
   *
   * THE FOLLOWERS BOUND THE ROOM, NEVER THE LIMIT (`svgMovingBox`, importedDesign/svg.ts, and
   * measured 2026-09-08 on the owner's quiz board: 384 px of room to the panel's own margin and
   * 49 px to the margin its lowest follower has to keep). So the line is drawn where the runtime's
   * cap really is, and the LINE COUNT beside it is arithmetic on this - or the chip would offer
   * lines the apply cannot deliver, which is the same false promise in the reader's own words.
   */
  edge: number;
  /** The frame's height, the height the drawn box already gives its text, and one line at the
   *  size it was drawn - all in the step's own px, so `capLines` divides like with like. `line`
   *  is null where no line inside the box could be measured, and the count is then not offered. */
  frame: number;
  inside: number;
  line: number | null;
}

/** HOW MANY LINES THE BOX HOLDS AT A GIVEN LIMIT, at the size the text was drawn - the owner's
 *  "we shouldn't be able to put one page of text", derived from the cap rather than asked as a
 *  second question. The room the drawn box already has plus whatever the limit adds, over one
 *  drawn line. Never less than one: a box holds the line inside it whatever the arithmetic says
 *  about its margins. */
/** A limit INSIDE THE TWO ENDS the artwork allows. Written beside the measurement that found
 *  them, because everything that reads a cap clamps it: the line the preview draws, the sentence
 *  under the heading, and the value a drag stores. A cap held against an artwork that has since
 *  been re-dropped is the case none of them may draw outside. */
export function capClamped(fit: GrowCapFit, margin: number): number {
  return Math.min(fit.max, Math.max(fit.min, margin));
}

export function capLines(fit: GrowCapFit, margin: number): number | null {
  if (!fit.line || !(fit.line > 0)) return null;
  const growth = Math.max(0, 1 - margin - fit.edge) * fit.frame;
  return Math.max(1, Math.floor((fit.inside + growth) / fit.line));
}

export function growCapOf(
  stage: HTMLElement,
  svg: SvgImportResult,
  boxId: string,
  lineIds: string[],
): GrowCapFit | null {
  const root = stage.querySelector('svg');
  const boxEl = markerEl(stage, boxId);
  if (!root || !boxEl) return null;
  stage.setAttribute('data-reveal', '');
  try {
    const frame = root.getBoundingClientRect();
    const box = boxEl.getBoundingClientRect();
    if (!(frame.height > 0) || !(box.height > 0)) return null;
    const above = box.top - frame.top;
    const below = frame.bottom - box.bottom;
    // `svgGrowDir`, verbatim for this axis: the panel grows towards whichever side of it has
    // more room, so a plate drawn near the bottom of the frame grows UP rather than off it.
    const dir: 1 | -1 = below < above ? -1 : 1;
    const min = PANEL_SAFE;
    // The margin that would put the limit on the box's own drawn edge: the whole gap between
    // that edge and the frame. A box already standing inside the safe margin has no room to
    // grow at all, and gets no line rather than one that cannot move.
    const max = (dir > 0 ? below : above) / frame.height;
    if (!(max > min)) return null;
    const mirrored = (dir > 0 ? above : below) / frame.height;
    // EVERYTHING THAT TRAVELS WITH THE GROWING EDGE, the same guess the runtime makes where no
    // follower list is declared: anything drawn past that edge. Their far side is where the
    // growth starts from, so it is what the line count is measured against.
    let far = dir > 0 ? box.bottom : box.top;
    for (const id of proposeFollowers(stage, svg, boxId, 'y').artwork) {
      const r = markerEl(stage, id)?.getBoundingClientRect();
      if (!r || !(r.width > 0) || !(r.height > 0)) continue;
      far = dir > 0 ? Math.max(far, r.bottom) : Math.min(far, r.top);
    }
    const lines = lineIds
      .map((id) => {
        const fit = boxFitOf(stage, id, boxId);
        const el = markerEl(stage, id) as SVGGraphicsElement | null;
        const m = el?.getScreenCTM?.();
        if (!fit || !m) return null;
        // The line's own units into this stage's px, so the count is arithmetic on one scale.
        const k = Math.hypot(m.a, m.b) || 1;
        return {
          line: fit.type * SVG_LINE_HEIGHT * k,
          inside: Math.max(0, (fit.box.height - 2 * fit.insetY) * k),
        };
      })
      .filter((l): l is { line: number; inside: number } => !!l);
    // THE BIGGEST TYPE IN THE BOX decides the count, because it is what wrapping is bounded by:
    // a box holding a 56 px name over a 30 px role takes fewer lines than the role alone would
    // suggest, and a count that promised the smaller number would promise room that is not there.
    const biggest = lines.reduce<{ line: number; inside: number } | null>(
      (best, l) => (!best || l.line > best.line ? l : best),
      null,
    );
    return {
      dir,
      mirrored,
      drawn: Math.min(Math.max(mirrored, min), max),
      min,
      max,
      edge: (dir > 0 ? far - frame.top : frame.bottom - far) / frame.height,
      frame: frame.height,
      inside: biggest?.inside ?? 0,
      line: biggest?.line ?? null,
    };
  } finally {
    stage.removeAttribute('data-reveal');
  }
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
export function withoutBackplates(
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
export function boxLooksOf(
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
export function measureOutline(
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
