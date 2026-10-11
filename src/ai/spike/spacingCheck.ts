// THE SPACING instrument - panel padding and inter-element gaps, measured as RATIOS OF TYPE
// SIZE (docs/DESIGN_PRINCIPLES.md §4 proportion, §9 white space).
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// THE DEFECT THIS MEASURES is the one the owner's blind reads keep naming, in their words:
// "too much space beneath ... we need a taste check for how much padding and margin the text
// and the banner should have"; "the name text too close to the line and it's too tight ... too
// big for the banner so it looks crammed"; "a bit too much space between the logo and the
// text"; "the text is on top of the line. It's all crammed in". Across two rounds, every failed
// or repair-needed item names proportion, white space or alignment and almost nothing else.
// Alignment already has an instrument (axisCheck.ts). This is the other two.
//
// WHY RATIOS AND NOT PIXELS. A 24px gap is generous beside 16px text and cramped beside 64px
// text, and every graphic here carries a --scale knob plus a --type-scale knob that move them
// independently. An absolute threshold would therefore measure the knobs rather than the
// design. The unit is the PRIMARY TYPE SIZE - the largest painted text in the composition -
// because that is what a viewer's eye normalises against, and because it is what "proportion"
// means: size relationships between parts, not sizes.
//
// WHAT IT DOES NOT DO. It does not gate. It reports numbers and named findings beside the
// frame, exactly as the axis instrument and the rendered mark gate do, and the §0.2 human read
// stays the verdict. Two reasons, both learned here: a spacing judgement flips on the brief's
// world (the same plate was praised on two briefs and called broken on a third), and a gate
// that fails a deliberate full-bleed composition would be teaching designs to be timid.

import { paintsSurface } from '../../validation/surface';
import { paints } from './brand';

/** A painted child closer to its panel edge than this many TYPE SIZES reads as cramped.
 *  Calibrated against the 90 hand-authored catalog lower thirds - see the calibration script. */
export const PADDING_FLOOR_RATIO = 0.28;
/** Opposite sides differing by more than this FACTOR read as lopsided rather than composed -
 *  the "too much space beneath" note. Only applied when both sides carry real padding: a
 *  deliberate bleed (one side at ~0) is a composition, not an imbalance. */
export const PADDING_SKEW_FACTOR = 2.6;
/** Below this, a side is a BLEED - the design is running to the edge on purpose, so it is
 *  excluded from both the floor and the skew test rather than counted as the tightest side. */
export const BLEED_RATIO = 0.06;
/** Total horizontal padding at or below this many type sizes means the panel HUGS its content,
 *  so its left/right balance is a real spacing decision. Above it the panel is a BAND whose
 *  width was chosen, and its unused side is composition rather than padding. */
export const HUG_TOTAL_RATIO = 4;
/** Consecutive text lines closer than this many of the SMALLER line's type sizes are crowded.
 *
 *  ZERO on purpose: only an actual OVERLAP counts. Line-height supplies the leading INSIDE each
 *  box, so adjacent text boxes touching at exactly 0 is ordinary typography, not crowding - the
 *  catalog sweep found lt12 and lt06 shipping at 0 and neither has ever been complained about.
 *  A floor above zero flags correct designs; the gap ratio is still REPORTED for every pair, so
 *  a human comparing two candidates can see who is tighter without the instrument pretending
 *  that tighter is wrong. */
export const LINE_GAP_FLOOR_RATIO = 0;
/** …and further apart than this have stopped reading as one block. */
export const LINE_GAP_CEILING_RATIO = 1.4;
/** A text line closer than this many of its own type sizes to one of the design's rules or
 *  accents is crowding it. Set under the catalog's own tightest shipped pairing. */
export const RULE_GAP_FLOOR_RATIO = 0.12;
/** At or under this the text is TOUCHING the rule on purpose, which is a composition the
 *  catalog ships (lt39). Crowding lives strictly between this and the floor above. */
export const RULE_CONTACT_RATIO = 0.02;
/**
 * The mark's gap to the nearest text, in TYPE SIZES: below is crowded, above is adrift.
 *
 * THE UNIT USED TO BE THE MARK'S OWN HEIGHT, and that is what this pair of numbers changed
 * (2026-08-15). The brand manual's clear space is a quarter of a mark's height, so a
 * mark-height unit looked like the principled choice - but a lower third's mark is not a
 * free-standing mark, it is a member of a lockup, and expressing its clear space in its own
 * height DIVIDES A DESIGN BY ITS OWN GENEROSITY. Measured over the 24 mark-capable lower thirds
 * (`scripts/spike-mark-clearance-sweep.mjs`), that produced pairs no reader can defend: ls18
 * was called crowded at **22px** of clear space while lt08 passed at exactly 22px, and ls25 was
 * called crowded at **30px** while lt15 passed at 26px. In both pairs the flagged design has
 * the same or a LARGER gap and a much taller mark (135px and 130px against 75px and 84px). The
 * two designs the old unit flagged are the two that give their mark the most room.
 *
 * THE FIX IS THE UNIT THIS FILE ALREADY USES EVERYWHERE ELSE. Its own header states why:
 * the primary type size is what a viewer's eye normalises against, and it is what "proportion"
 * means. In type sizes the same 24 designs run 0.41 to 1.61 and neither flagged design is an
 * outlier - ls18 is 8th of 24 at 0.51 and ls25 is 13th at 0.70, dead middle. The unit also
 * clusters far more tightly: p95/p05 is 2.9x in type sizes against 4.3x in mark heights, and a
 * distribution that spreads over four-fold has no floor to put under it.
 *
 * NOTHING IS LOST BY DROPPING THE MARK'S HEIGHT, because the other instrument still asks about
 * it. `proportionCheck`'s `mark-oversized` measures the mark's height against the type size
 * (ceiling 3.2, calibrated on the BORDER box), so a design cannot dodge this floor by growing
 * its mark: it hits that ceiling instead. Two questions, two boxes, two instruments - and this
 * one is now asking only about the GAP.
 *
 * THE NUMBERS ARE READ OFF THE CATALOG, never chosen (the `spike-spacing-calibrate.mjs`
 * discipline, and the same rule PADDING_FLOOR_RATIO and RULE_GAP_FLOOR_RATIO already follow):
 *
 * - **Floor 0.35** sits under the catalog's own tightest shipped pairing, lt08 at 0.41, with
 *   ~15% of margin and inside a real gap - the next reading up is 0.45. Phase A's composer
 *   renders 0.48 seated and 0.72 with a painted mark band, so it clears by 1.4x and 2.1x.
 * - **Ceiling 2.1** carries the same ~1.3x headroom over the catalog's widest shipped lockup
 *   (lt54 at 1.61) that the old 1.6 ceiling carried over its own widest reading (1.2).
 *
 * The GAP is still measured from the mark's INK rather than its border box - see
 * `markContentRect`. That question is about where the clear space is drawn and is untouched by
 * which unit it is reported in.
 */
export const MARK_GAP_FLOOR_RATIO = 0.35;
export const MARK_GAP_CEILING_RATIO = 2.1;
/** An element spanning nearly the whole frame is a backdrop, not a composition member. */
const BACKDROP_WIDTH_PX = 1728; // 90% of 1920, the same cut axisCheck makes
/** How far past its panel a member may paint before it counts as ESCAPING. Sub-pixel layout,
 *  a border and an italic's overhang all put a glyph box a hair outside its box legitimately;
 *  1px is the same slack every containment test in this file already carries. */
const ESCAPE_TOLERANCE_PX = 1;

export interface SpacingFinding {
  /** The audit's code vocabulary: padding-tight, padding-lopsided, text-escapes-panel,
   *  lines-crowded, lines-adrift, text-over-rule, text-crowds-rule, mark-crowded, mark-adrift. */
  code: string;
  /** Human-readable, with the numbers that produced it. */
  detail: string;
}

/** One member painting outside the panel it belongs to, per side. */
export interface SpacingEscape {
  desc: string;
  side: 'left' | 'right' | 'top' | 'bottom';
  px: number;
  isText: boolean;
}

export interface SpacingReport {
  /** The panel the measurements are relative to, when one was found. */
  panel: string | null;
  /** The primary type size in px - the unit everything below is expressed in. */
  typeSizePx: number | null;
  /** Padding per side, in TYPE SIZES, rounded to 2dp. Null when no panel was found.
   *  NEGATIVE where the panel's own content paints outside it - see `escapes`. */
  padding: { top: number; right: number; bottom: number; left: number } | null;
  /** Every member painting past the panel's edge, in px. Empty is the normal case. */
  escapes: SpacingEscape[];
  /** Gaps between consecutive stacked text lines, in type sizes. */
  lineGaps: number[];
  /** The mark's gap to the nearest text, in TYPE SIZES, when a mark is present - the same unit
   *  as `padding` above, for the reason MARK_GAP_FLOOR_RATIO gives. Measured off the mark's INK
   *  - see `markContentRect` for why the border box answered the wrong question. */
  markGap: number | null;
  findings: SpacingFinding[];
}

export interface Painted {
  el: Element;
  desc: string;
  rect: { left: number; right: number; top: number; bottom: number };
  fontSizePx: number;
  isText: boolean;
  hasSurface: boolean;
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

function hasOwnText(el: Element): boolean {
  for (const node of el.childNodes) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim()) return true;
  }
  return false;
}

/**
 * The rect a viewer actually SEES: the element's own box, cut down by every ancestor that
 * clips.
 *
 * `getBoundingClientRect` reports the LAYOUT box, which is not what paints. A house template
 * wraps each field in `.PREFIX-mask { overflow: hidden }`, so a line too long for its mask lays
 * out past it and is painted cut off - and every measurement below would otherwise read the
 * part of it that does not exist. This matters most for the overflow finding: "the text is on
 * the picture" and "the text is cut off" are different defects, and only the visual rect can
 * tell them apart.
 */
function visualRect(el: Element, win: Window): { left: number; right: number; top: number; bottom: number } {
  const r = el.getBoundingClientRect();
  const box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  for (let a = el.parentElement; a; a = a.parentElement) {
    const s = win.getComputedStyle(a);
    // `hidden`, `clip`, `auto` and `scroll` all cut; only `visible` lets a child paint outside.
    const clipsX = s.overflowX !== 'visible';
    const clipsY = s.overflowY !== 'visible';
    if (!clipsX && !clipsY) continue;
    const ar = a.getBoundingClientRect();
    if (clipsX) {
      box.left = Math.max(box.left, ar.left);
      box.right = Math.min(box.right, ar.right);
    }
    if (clipsY) {
      box.top = Math.max(box.top, ar.top);
      box.bottom = Math.min(box.bottom, ar.bottom);
    }
  }
  return box;
}

export function collectPainted(doc: Document): Painted[] {
  const win = doc.defaultView;
  if (!win) return [];
  const out: Painted[] = [];
  for (const el of doc.body.querySelectorAll('*')) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    if (!paints(el, style)) continue;
    const rect = visualRect(el, win);
    // An element clipped away entirely paints nothing, so it is not a composition member.
    if (rect.right - rect.left < 1 || rect.bottom - rect.top < 1) continue;
    out.push({
      el,
      desc: describe(el),
      rect,
      fontSizePx: parseFloat(style.fontSize) || 0,
      isText: hasOwnText(el) && el.tagName !== 'IMG',
      hasSurface: paintsSurface(style),
    });
  }
  return out;
}

/** Geometric containment, with the 1px slack every check here uses. */
function encloses(a: Painted, b: Painted): boolean {
  return a !== b && a.rect.left <= b.rect.left + 1 && a.rect.right >= b.rect.right - 1
    && a.rect.top <= b.rect.top + 1 && a.rect.bottom >= b.rect.bottom - 1;
}

/**
 * THE PANEL'S OWN CONTENT - including whatever ESCAPED it.
 *
 * THE BUG THIS EXISTS TO CLOSE (docs/NOACG_PRO_PLAN.md §15.6, first item). Membership used to
 * be geometric containment alone, so a name hanging off the edge of its panel was not the
 * panel's content at all: it was dropped from the union, the remaining children were measured
 * against the far edge, and the WORST overflow in the round reported the ROOMIEST padding. An
 * instrument that reads a defect as its opposite is worse than no instrument, and Phase A's own
 * numbers would have inherited the blindness.
 *
 * Membership is therefore answered by the DOM as well as by geometry: an element is the panel's
 * content when the panel CONTAINS it in the document, whatever it does with the space, or when
 * it happens to sit inside the panel's box (the sibling-overlay idiom, which is how the rule
 * read before and is why no catalog number moves for a design whose content stays home).
 */
export function panelMembers(items: Painted[], panel: Painted): Painted[] {
  return items.filter((p) => p !== panel && (encloses(panel, p) || panel.el.contains(p.el)));
}

/**
 * THE PANEL is the innermost surface that holds the composition.
 *
 * Not simply the largest background: a full-frame scrim would win that and every measurement
 * would then be relative to the frame, which is a different question. Take the SMALLEST
 * painted surface that still holds at least two other painted elements - that is the thing
 * a viewer reads as "the box", and on a house-contract graphic it resolves to the `-box`
 * element without needing to know the prefix.
 *
 * "Holds" is `panelMembers`, not geometry alone, for the reason that function gives: a box
 * whose content escaped it is still that content's box. Counting geometrically would make the
 * panel VANISH exactly when the overflow is worst - two children off the edge and the design
 * has no measurable panel at all - which is the same blindness one step earlier. For a design
 * whose content stays inside, the two counts are the same set and nothing moves.
 */
export function findPanel(items: Painted[]): Painted | null {
  const candidates = items
    .filter((p) => p.hasSurface && (p.rect.right - p.rect.left) < BACKDROP_WIDTH_PX)
    .filter((p) => panelMembers(items, p).length >= 2)
    .sort((a, b) => (a.rect.right - a.rect.left) * (a.rect.bottom - a.rect.top)
      - (b.rect.right - b.rect.left) * (b.rect.bottom - b.rect.top));
  return candidates[0] ?? null;
}

/** The unit: the largest painted text in the composition. */
export function primaryTypeSize(items: Painted[]): number | null {
  const sizes = items.filter((p) => p.isText && p.fontSizePx > 0).map((p) => p.fontSizePx);
  return sizes.length ? Math.max(...sizes) : null;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Each side of the panel against the BOUNDING BOX of the content it holds, in type sizes.
 *  A side is negative when that content paints outside the panel on that side. */
function paddingRatios(
  panel: Painted, members: Painted[], typeSize: number,
): { top: number; right: number; bottom: number; left: number } {
  const union = {
    left: Math.min(...members.map((p) => p.rect.left)),
    right: Math.max(...members.map((p) => p.rect.right)),
    top: Math.min(...members.map((p) => p.rect.top)),
    bottom: Math.max(...members.map((p) => p.rect.bottom)),
  };
  return {
    top: round2((union.top - panel.rect.top) / typeSize),
    right: round2((panel.rect.right - union.right) / typeSize),
    bottom: round2((panel.rect.bottom - union.bottom) / typeSize),
    left: round2((union.left - panel.rect.left) / typeSize),
  };
}

/**
 * THE MARK'S INK, not the well it sits in - the visual rect inset by the element's own padding
 * and border.
 *
 * THE FALSE POSITIVES THIS EXISTS TO CLOSE, and they were the good designs. `mark-crowded` fired
 * on lt07 (0.22), lt41 (0.24) and ls10 (0.20) against a 0.25 floor, and all three are among the
 * designs that carry a crest BEST: each draws the mark inside a well and expresses the brand
 * manual's clear space as the image's OWN PADDING. `getBoundingClientRect` reports the border
 * box, so that clear space was inside the thing being measured - the instrument counted the gap
 * from the outside of the space to the text, which is by definition nearly zero, and then called
 * the design cramped for it. Measured over the 24 mark-capable lower thirds
 * (`scripts/spike-mark-clearance-sweep.mjs`), the ink box moves those three to 0.36, 0.39 and
 * 0.42 and leaves every other reading alone.
 *
 * AN INSTRUMENT WHOSE FALSE POSITIVES ARE THE GOOD DESIGNS IS ONE AUTHORS LEARN TO IGNORE, which
 * is worse than no instrument - the same argument this file already makes for the deliberate
 * bleed and for `LINE_GAP_FLOOR_RATIO` sitting at zero.
 *
 * THE UNIT IS NO LONGER THE MARK AT ALL. When this was written the gap was divided by the ink's
 * own height, so both halves of the ratio had to move together. The unit is now the primary type
 * size (MARK_GAP_FLOOR_RATIO says why), which leaves this function with exactly one job: say
 * where the mark's clear space ENDS. The reading it fixes is unchanged - a design expressing that
 * clear space as the image's own padding had it counted as zero either way.
 *
 * DELIBERATELY NOT SHARED WITH `proportionCheck`. Its `mark-oversized` finding asks how much ROOM
 * a mark takes in the composition, and a padded well takes all of it - the border box is the right
 * answer there, and `MARK_SCALE_CEILING` is calibrated on it. Two questions, two boxes.
 *
 * IT IS SHARED WITH `tasteCheck`, and by the same test: its rules 1, 2 and 5 all ask where the
 * mark's INK sits - inside its well, beside an accent, across a row - which is this box's exact
 * question. Exported rather than copied, because a second implementation of "where does the
 * clear space end" is how two instruments come to disagree about one mark.
 *
 * `getComputedStyle` is read while the document is still attached, which is the only time it
 * answers: a live `CSSStyleDeclaration` EMPTIES the moment its iframe leaves the DOM, and every
 * length silently parses as 0 - an inset of nothing, reported as a measurement.
 */
export function markContentRect(mark: Painted, win: Window): Painted['rect'] {
  const style = win.getComputedStyle(mark.el);
  const inset = (side: 'left' | 'right' | 'top' | 'bottom'): number =>
    (parseFloat(style.getPropertyValue(`padding-${side}`)) || 0)
    + (parseFloat(style.getPropertyValue(`border-${side}-width`)) || 0);
  const ink = {
    left: mark.rect.left + inset('left'),
    right: mark.rect.right - inset('right'),
    top: mark.rect.top + inset('top'),
    bottom: mark.rect.bottom - inset('bottom'),
  };
  // A padding wider than whatever a clip left of the box would INVERT the rect and make every
  // gap below meaningless. Fall back to what paints rather than report an impossible mark.
  if (ink.right - ink.left < 1 || ink.bottom - ink.top < 1) return mark.rect;
  return ink;
}

export interface SpacingOptions {
  paddingFloorRatio?: number;
  paddingSkewFactor?: number;
  bleedRatio?: number;
  lineGapFloorRatio?: number;
  lineGapCeilingRatio?: number;
  ruleGapFloorRatio?: number;
  markGapFloorRatio?: number;
  markGapCeilingRatio?: number;
  /** The brand mark's field id, when the graphic carries one. */
  markFieldId?: string | null;
}

export function measureSpacing(doc: Document, options: SpacingOptions = {}): SpacingReport {
  const floor = options.paddingFloorRatio ?? PADDING_FLOOR_RATIO;
  const skew = options.paddingSkewFactor ?? PADDING_SKEW_FACTOR;
  const bleed = options.bleedRatio ?? BLEED_RATIO;
  const lineFloor = options.lineGapFloorRatio ?? LINE_GAP_FLOOR_RATIO;
  const lineCeiling = options.lineGapCeilingRatio ?? LINE_GAP_CEILING_RATIO;
  const ruleFloor = options.ruleGapFloorRatio ?? RULE_GAP_FLOOR_RATIO;
  const markFloor = options.markGapFloorRatio ?? MARK_GAP_FLOOR_RATIO;
  const markCeiling = options.markGapCeilingRatio ?? MARK_GAP_CEILING_RATIO;

  const report: SpacingReport = {
    panel: null, typeSizePx: null, padding: null, escapes: [], lineGaps: [], markGap: null, findings: [],
  };

  const items = collectPainted(doc);
  const typeSize = primaryTypeSize(items);
  if (!typeSize) return report;
  report.typeSizePx = round2(typeSize);

  // ── Panel padding ───────────────────────────────────────────────────────────────────
  const panel = findPanel(items);
  if (panel) {
    report.panel = panel.desc;
    const inside = panelMembers(items, panel);
    // ── What ESCAPED, named ──────────────────────────────────────────────────────────
    //
    // Reported per element rather than inferred from a negative padding number, because the
    // useful sentence is "this line paints 152px outside its panel on the right", and because a
    // side can be bled into deliberately AND overflowed by something else.
    //
    // ONLY TEXT RAISES A FINDING, AND ONLY TEXT WIDENS THE PADDING UNION. A decorative member
    // running past the panel is one of the most ordinary shapes in broadcast - an accent that
    // carries on past the strap - and this file's own rule is that an instrument which fails a
    // deliberate composition teaches designs to be timid. It is still RECORDED, so the number is
    // there for a human comparing two candidates. What the owner's blind read named is LIVE TEXT
    // ending up on the picture, and that is the thing this counts.
    const bleeding = new Set<Painted>();
    for (const member of inside) {
      for (const [side, over] of [
        ['left', panel.rect.left - member.rect.left],
        ['right', member.rect.right - panel.rect.right],
        ['top', panel.rect.top - member.rect.top],
        ['bottom', member.rect.bottom - panel.rect.bottom],
      ] as const) {
        if (over <= ESCAPE_TOLERANCE_PX) continue;
        report.escapes.push({ desc: member.desc, side, px: round2(over), isText: member.isText });
        if (!member.isText) { bleeding.add(member); continue; }
        report.findings.push({
          code: 'text-escapes-panel',
          detail: `${member.desc} paints ${round2(over)}px past its panel's ${side} edge`
            + ' - live text is sitting on the picture rather than in its box',
        });
      }
    }

    // A panel holding nothing but bleeding decoration has no padding to speak of; the escapes
    // above are the whole report for it.
    const measured = inside.filter((p) => !bleeding.has(p));
    const pad = measured.length ? paddingRatios(panel, measured, typeSize) : null;
    if (pad) {
      report.padding = pad;

      // A side under the bleed ratio is deliberate contact with the edge, not tightness.
      const tight = Object.entries(pad).filter(([, v]) => v >= bleed && v < floor);
      if (tight.length) {
        report.findings.push({
          code: 'padding-tight',
          detail: `${tight.map(([s, v]) => `${s} ${v}`).join(', ')} type sizes `
            + `(floor ${floor}) - the content is crammed against its panel`,
        });
      }
      // VERTICAL skew always; HORIZONTAL only when the panel hugs its content.
      //
      // The catalog taught this: lt55 and ls15 carry a fixed-width BAND with left-aligned text,
      // so their right "padding" is 6.7 and 6.9 type sizes of empty band. Read as padding that
      // is a 10x imbalance; read as design it is a strap that runs to a chosen width, which is
      // one of the most ordinary shapes in broadcast. Unused band is not a spacing error, and a
      // check that says otherwise would be telling every full-width design to shrink. The
      // owner's actual complaint - "too much space beneath" - is vertical, where a panel really
      // is expected to sit evenly on its own content.
      const hugsHorizontally = pad.left + pad.right <= HUG_TOTAL_RATIO;
      const axes: (readonly ['top', 'bottom'] | readonly ['left', 'right'])[] = hugsHorizontally
        ? [['top', 'bottom'], ['left', 'right']]
        : [['top', 'bottom']];
      for (const [a, b] of axes) {
        const va = pad[a];
        const vb = pad[b];
        if (va < bleed || vb < bleed) continue;
        const [hi, lo] = va >= vb ? [va, vb] : [vb, va];
        if (lo > 0 && hi / lo > skew) {
          report.findings.push({
            code: 'padding-lopsided',
            detail: `${a} ${va} vs ${b} ${vb} type sizes (${round2(hi / lo)}x, limit ${skew}x)`
              + ' - the panel is not centred on its own content',
          });
        }
      }
    }
  }

  // ── Gaps between stacked text lines ─────────────────────────────────────────────────
  const lines = items.filter((p) => p.isText && p.fontSizePx > 0)
    .sort((a, b) => a.rect.top - b.rect.top);
  for (let i = 1; i < lines.length; i += 1) {
    const above = lines[i - 1];
    const below = lines[i];
    // Only consecutive lines that actually stack (their x-ranges overlap) form a block.
    const overlapX = Math.min(above.rect.right, below.rect.right) - Math.max(above.rect.left, below.rect.left);
    if (overlapX <= 0) continue;
    const gapPx = below.rect.top - above.rect.bottom;
    const unit = Math.min(above.fontSizePx, below.fontSizePx);
    const ratio = round2(gapPx / unit);
    report.lineGaps.push(ratio);
    if (gapPx < 0) {
      report.findings.push({
        code: 'lines-crowded',
        detail: `${above.desc} and ${below.desc} OVERLAP by ${round2(-gapPx)}px - text on top of text`,
      });
    } else if (ratio < lineFloor) {
      report.findings.push({
        code: 'lines-crowded',
        detail: `${above.desc} to ${below.desc} gap ${ratio} type sizes (floor ${lineFloor})`,
      });
    } else if (ratio > lineCeiling) {
      report.findings.push({
        code: 'lines-adrift',
        detail: `${above.desc} to ${below.desc} gap ${ratio} type sizes (ceiling ${lineCeiling})`
          + ' - the lines have stopped reading as one block',
      });
    }
  }

  // ── Text against the design's own RULES and accents ─────────────────────────────────
  //
  // THIS is what the owner's notes are actually about. "The name text too close to the line and
  // it's too tight", "the text is on top of the line" - the "line" is the accent rule, not a
  // sibling text line, and the first version of this instrument only ever paired text with
  // text, so it could not have seen either complaint. A rule is a non-text painted element that
  // does not CONTAIN the text (its panel does, and a panel is not a collision).
  const rules = items.filter((p) => !p.isText && p.el.tagName !== 'IMG' && p !== panel);
  for (const line of lines) {
    for (const rule of rules) {
      const contains = rule.rect.left <= line.rect.left + 1 && rule.rect.right >= line.rect.right - 1
        && rule.rect.top <= line.rect.top + 1 && rule.rect.bottom >= line.rect.bottom - 1;
      if (contains) continue;
      const dx = Math.max(rule.rect.left - line.rect.right, line.rect.left - rule.rect.right, 0);
      const dy = Math.max(rule.rect.top - line.rect.bottom, line.rect.top - rule.rect.bottom, 0);
      if (dx > 0 && dy > 0) continue;          // diagonal neighbours never collide
      // TOUCHING IS NOT OVERLAPPING. lt39 bolts its name to a solid accent block on purpose -
      // zero gap, by design, and the first version called it text sitting ON the rule. Overlap
      // has to be a real intersection on BOTH axes, so measure the intersection rather than
      // inferring it from a zero distance.
      const ox = Math.min(line.rect.right, rule.rect.right) - Math.max(line.rect.left, rule.rect.left);
      const oy = Math.min(line.rect.bottom, rule.rect.bottom) - Math.max(line.rect.top, rule.rect.top);
      const overlapping = ox > 1 && oy > 1;
      const gapPx = Math.max(dx, dy);
      const ratio = round2(gapPx / line.fontSizePx);
      if (overlapping) {
        report.findings.push({
          code: 'text-over-rule',
          detail: `${line.desc} sits ON ${rule.desc} - text over the design's own rule`,
        });
      } else if (ratio > RULE_CONTACT_RATIO && ratio < ruleFloor) {
        // A BAND, not a floor - the same shape axisCheck's text near-miss already uses, and for
        // the same reason. Zero gap is deliberate contact (lt39 bolts its name to a solid accent
        // block and ships that way); the defect is text sitting NEAR a rule without touching it,
        // which is what "too close to the line and it's too tight" describes.
        report.findings.push({
          code: 'text-crowds-rule',
          detail: `${line.desc} sits ${ratio} type sizes from ${rule.desc}`
            + ` (crowding band ${RULE_CONTACT_RATIO}-${ruleFloor}; touching is a composition)`,
        });
      }
    }
  }

  // ── The mark's gap to the text it stands beside ─────────────────────────────────────
  if (options.markFieldId) {
    const win = doc.defaultView;
    const mark = items.find((p) => p.el.id === options.markFieldId);
    const text = items.filter((p) => p.isText);
    if (win && mark && text.length) {
      const ink = markContentRect(mark, win);
      const markH = ink.bottom - ink.top;
      const gaps = text.map((t) => {
        const dx = Math.max(ink.left - t.rect.right, t.rect.left - ink.right, 0);
        const dy = Math.max(ink.top - t.rect.bottom, t.rect.top - ink.bottom, 0);
        return Math.max(dx, dy) || Math.min(dx, dy);
      });
      const nearest = Math.min(...gaps);
      const ratio = round2(nearest / typeSize);
      report.markGap = ratio;
      // ALL THREE RAW NUMBERS RIDE ALONG, because a ratio alone cannot say which of several
      // things happened, and the mark's height is the one that used to be MISREAD as the answer
      // (see MARK_GAP_FLOOR_RATIO). It is no longer the unit, but it is still the fact a reader
      // wants next: `22px from 43px type, mark 135px` says at a glance that this is a tall mark
      // with an ordinary gap, which is exactly what the old reading got backwards.
      const px = `${Math.round(nearest)}px from ${Math.round(typeSize)}px type, mark ${Math.round(markH)}px`;
      if (ratio < markFloor) {
        report.findings.push({
          code: 'mark-crowded',
          detail: `the mark sits ${ratio} type sizes from the nearest text `
            + `(${px}; clear space floor ${markFloor})`,
        });
      } else if (ratio > markCeiling) {
        report.findings.push({
          code: 'mark-adrift',
          detail: `the mark sits ${ratio} type sizes from the nearest text `
            + `(${px}; ceiling ${markCeiling}) - it has stopped belonging to the lockup`,
        });
      }
    }
  }

  return report;
}
