// DOES THIS GRAPHIC SURVIVE THE PICTURE? - the instrument for words that paint no surface.
//
// WHY IT EXISTS (docs/NOACG_PRO_PLAN.md §17.2). The owner's first read of an accepted Pro set
// found `minimalist.ledger` unreadable over a busy mid-tone plate while every gate in the tree
// passed it. The hole is one constant: `BROADCAST_BACKDROP` (model/cssVars.ts) is a single
// near-black card, and every contrast number this repo computes is computed against it. A
// near-white super measures 14:1 there and 1.1:1 over a bright sky, and nothing was asking the
// second question.
//
// **A graphic that paints no surface under its words has no known backdrop by construction.**
// So the honest measurement is not one plate but a RANGE, and what is reported is the worst of
// them - the plate that a real shot will eventually be.
//
// WHAT A SHADOW IS AND IS NOT. A `text-shadow` with a blur paints a halo BEHIND and AROUND the
// glyph; the glyph's own pixels still sit on whatever is behind them, so a blurred shadow cannot
// change the glyph's contrast against the plate. It genuinely helps an edge separate, and it is
// reported as what it is - a halo, not a surface. This is the same distinction the mark
// instrument draws between a mark's own field and the surface under it, and it is the reason
// this file measures the TEXT COLOUR against the plate rather than crediting the shadow with a
// rescue it cannot perform. A ZERO-BLUR shadow is a different construct (an outline, which does
// cover the glyph's edge) and is named separately rather than folded in.
//
// It REPORTS. Nothing here fails a graphic on its own: a super over controlled footage is a real
// composition a designer may choose, and a gate whose false positives are the deliberate choices
// is one authors learn to ignore (the mark-crowding lesson, src/ai/AGENTS.md). What it removes is
// the silence.

import { contrastRatio, parseCssColor, type CssColor } from '../model/cssVars';

/**
 * The plates a graphic is measured against when nothing is known about the picture.
 *
 * Three, because two would hide the middle: broadcast's own worst cases are a blown-out sky and
 * a night exterior, and a mid grey is where a translucent scrim stops helping. They are the same
 * three the evidence page's backdrop switcher draws, so a number here and a picture there are
 * answers to one question.
 */
export const TEST_PLATES: { id: string; label: string; color: CssColor }[] = [
  { id: 'dark', label: 'a night exterior', color: { r: 8, g: 9, b: 12, a: 1, form: 'rgb' } },
  { id: 'mid', label: 'a mid-tone shot', color: { r: 128, g: 128, b: 128, a: 1, form: 'rgb' } },
  { id: 'light', label: 'a blown-out sky', color: { r: 244, g: 246, b: 248, a: 1, form: 'rgb' } },
];

/** WCAG's floors, the same two `runtimeBench` and the type gate already use: large text is
 *  read at 3:1, body text at 4.5:1. "Large" is 24px, or 18.66px when bold. */
const LARGE_TEXT_PX = 24;
const LARGE_BOLD_PX = 18.66;
const FLOOR_LARGE = 3;
const FLOOR_BODY = 4.5;

export interface PlateLegibilityFinding {
  /** The element's own id (`f0`…) where it has one, else a short description. */
  where: string;
  /** The text colour, as painted. */
  ink: string;
  /** The worst plate and the contrast the words reach on it, after the design's own surfaces
   *  are composited over that plate. */
  worst: { plate: string; label: string; ratio: number };
  /** Every plate's ratio, so a reader can see the spread rather than one number. */
  ratios: { plate: string; ratio: number }[];
  /** The floor this size and weight is held to. */
  floor: number;
  /** A shadow that could help an edge separate, described honestly. */
  carrier: 'none' | 'halo' | 'outline';
}

/** Alpha-composite `top` over `under`, both opaque out. The one piece of arithmetic this file
 *  owns; the contrast formula itself stays in `model/cssVars.ts`, where the repo keeps exactly
 *  one copy of it. */
function over(top: CssColor, under: CssColor): CssColor {
  if (top.a >= 1) return top;
  return {
    r: top.r * top.a + under.r * (1 - top.a),
    g: top.g * top.a + under.g * (1 - top.a),
    b: top.b * top.a + under.b * (1 - top.a),
    a: 1,
    form: 'rgb',
  };
}

/**
 * What is actually behind this text, on this plate.
 *
 * NOT a yes/no about whether the design paints a panel - that was the first version of this
 * instrument and it was wrong in a way worth recording. It asked whether an ancestor's background
 * was opaque "enough" (a threshold this file invented), and on the lower-third catalog it called
 * 62 of 90 designs surface-less. `ls29`'s panel is `rgba(10, 12, 16, 0.86)`: plainly a panel, and
 * a tenth of a point under a made-up floor.
 *
 * A translucent panel is not the absence of a surface. It is a surface that lets some of the
 * picture through, and the amount is exactly computable - so every painted ancestor is
 * COMPOSITED, outermost first, over the plate. A design with no painted ancestor at all folds to
 * the plate itself, which is the honest answer for a super.
 */
function backdropOn(el: Element, win: Window, plate: CssColor): CssColor {
  const layers: CssColor[] = [];
  let node: Element | null = el.parentElement;
  while (node && node !== el.ownerDocument.documentElement) {
    const cs = win.getComputedStyle(node);
    const bg = parseCssColor(cs.backgroundColor);
    if (bg && bg.a > 0) layers.push(bg);
    // A background IMAGE is a real surface too, and its stops are the only thing knowable about
    // it from the box. The DARKEST stop is taken: a gradient scrim exists to protect the words,
    // and crediting its lightest end would report the half that is not doing the work.
    const image = cs.backgroundImage;
    if (image && image !== 'none') {
      const stops = [...image.matchAll(/rgba?\([^)]+\)|#[0-9a-f]{3,8}\b/gi)]
        .map((m) => parseCssColor(m[0]))
        .filter((c): c is CssColor => Boolean(c) && (c as CssColor).a > 0);
      if (stops.length) {
        layers.push(stops.reduce((a, b) => (b.r + b.g + b.b < a.r + a.g + a.b ? b : a)));
      }
    }
    node = node.parentElement;
  }
  // Outermost first, so the innermost surface ends up on top - the order the browser paints in.
  return layers.reverse().reduce((under, layer) => over(layer, under), plate);
}

/** What the element's shadow can actually do for it. */
function carrierOf(shadow: string): PlateLegibilityFinding['carrier'] {
  if (!shadow || shadow === 'none') return 'none';
  // `0px 2px 12px rgba(...)` - the third length is the blur. A shadow with no blur sits hard
  // against the glyph and reads as an outline; a blurred one is a halo around it.
  const lengths = [...shadow.matchAll(/(-?[\d.]+)px/g)].map((m) => Number(m[1]));
  const blur = lengths.length >= 3 ? lengths[2] : 0;
  return blur > 1 ? 'halo' : 'outline';
}

/**
 * Every text element that is trusting the picture, with the number it reaches on the worst plate.
 *
 * Returns an empty list for a graphic whose words sit on a surface of its own - which is most of
 * them, and the reason this instrument is cheap to run everywhere.
 */
export function measurePlateLegibility(doc: Document, win: Window): PlateLegibilityFinding[] {
  const out: PlateLegibilityFinding[] = [];
  for (const el of doc.querySelectorAll<HTMLElement>('[id^="f"]')) {
    if (!/^f\d+$/.test(el.id) || el.tagName === 'IMG') continue;
    const cs = win.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || !el.textContent?.trim()) continue;

    const ink = parseCssColor(cs.color);
    if (!ink) continue;
    const size = parseFloat(cs.fontSize) || 0;
    const weight = Number(cs.fontWeight) || 400;
    const large = size >= LARGE_TEXT_PX || (weight >= 700 && size >= LARGE_BOLD_PX);
    const floor = large ? FLOOR_LARGE : FLOOR_BODY;

    // The glyph against what is really behind it ON THAT PLATE - the design's own surfaces
    // composited over the picture, which for a super is the picture itself.
    const ratios = TEST_PLATES.map((plate) => ({
      plate: plate.id,
      label: plate.label,
      ratio: contrastRatio(ink, backdropOn(el, win, plate.color), plate.color),
    }));
    const worst = ratios.reduce((a, b) => (b.ratio < a.ratio ? b : a));
    const best = ratios.reduce((a, b) => (b.ratio > a.ratio ? b : a));
    if (worst.ratio >= floor) continue;
    // IS THE PICTURE WHAT MAKES THE DIFFERENCE? Only then is this instrument the right one to
    // speak. Text that misses the floor on EVERY plate - including the friendliest - is not
    // failing because the shot showed through; it is too close to the design's OWN surface, and
    // that is the ordinary contrast question `runtimeBench` already asks.
    //
    // Measured, and it is why this test exists: `lt49` and `ls18` set a saturated blue on a
    // 94%-opaque panel and read 4.46 / 4.25 / 3.99 - under the 4.5 body floor on all three,
    // barely moving, because an almost-opaque panel hardly lets the plate through at all.
    // Reporting those as "does not separate from the picture" put this instrument's name on
    // somebody else's finding, which is how an instrument loses its meaning.
    if (best.ratio < floor) continue;
    out.push({
      where: el.id,
      ink: cs.color,
      worst: { plate: worst.plate, label: worst.label, ratio: worst.ratio },
      ratios: ratios.map(({ plate, ratio }) => ({ plate, ratio })),
      floor,
      carrier: carrierOf(cs.textShadow),
    });
  }
  return out;
}

/** One sentence per finding, in the words a person would use about a picture. */
export function plateLegibilityMessage(f: PlateLegibilityFinding): string {
  const carrier = f.carrier === 'halo'
    ? ' Its shadow is a blurred halo: it sharpens the edge but paints nothing under the glyph,'
      + ' so it cannot carry this.'
    : f.carrier === 'outline'
      ? ' Its shadow has no blur, so it does outline the glyph - worth looking at before changing anything.'
      : ' It has no shadow at all.';
  return `\`#${f.where}\` sits on the picture with no surface of its own, and reads`
    + ` ${f.worst.ratio}:1 over ${f.worst.label} (floor ${f.floor}).${carrier}`
    + ` Over the three test plates it measures ${f.ratios.map((r) => `${r.plate} ${r.ratio}:1`).join(', ')}.`;
}
