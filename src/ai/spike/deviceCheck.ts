// THE DEVICE-EXISTS instrument - are the two live text lines carried by DISTINGUISHABLE
// geometry, or do they sit as two rows in one plain box?
// (docs/MODEL_VS_HARNESS_STUDY.md §6, level 2 - the per-design idea the spacing and
// proportion instruments cannot see.)
//
// BENCH-ONLY (see exemplars.ts for the deletion condition).
//
// THE DEFECT THIS MEASURES: the frontier reasoning transcript made its "device" decision
// SECOND - the two fields become UNEQUAL SHAPES (a pill kicker over a large-radius bar), and
// everything downstream serves that choice. Our harness teaches contracts and taste criteria
// but never requires a device decision to EXIST, and the safe answer to every contract is a
// correct plain panel. This instrument makes "no device" visible instead of silently passing
// every gate.
//
// WHAT COUNTS, by the study's own list: the two text CONTAINERS must be distinguishable by
// SHAPE, RADIUS, FILL or AXIS - **not font size alone**. Font size is deliberately never read
// as a channel: a bigger primary line is typography every plain box already has, and counting
// it would score 1 on precisely the design this instrument exists to name. The axis channel is
// guarded against the same leak one step deeper: text LENGTH moves a centred line's left edge,
// so axis distinguishes only when the two lines share NO alignment edge at all - left, right
// or centre.
//
// WHAT IT DOES NOT DO. It does not gate, for the same reasons spacingCheck.ts gives: a plain
// box can be the right answer for a quiet public-broadcast brief, and a gate here would be
// novelty theatre. It reports `present`, the channels that distinguish, and the raw numbers,
// beside the frame - the human read stays the verdict.

import { paintsSurface } from '../../validation/surface';
import { paints } from './brand';
import { round2 } from './spacingCheck';

/** Two carriers' pill-ness (corner radius over half the box height, clamped to 1) further
 *  apart than this reads as a deliberate radius contrast - the study's "radius contrast
 *  rectangle-vs-pill reads as intent". */
export const RADIUS_DELTA = 0.25;
/** Two SEPARATE carriers whose heights differ by at least this factor read as unequal shapes
 *  (chip vs bar) even when fill and radius agree. Height rather than width because width is
 *  mostly the text's length - a font-size echo this instrument must not count. */
export const SHAPE_HEIGHT_FACTOR = 1.4;
/** The two lines share NO alignment edge when their nearest shared edge (left, right or
 *  centre) is at least this many TYPE SIZES apart - a deliberate second axis, not a ragged
 *  margin. The unit is the larger of the two lines' own type sizes, spacingCheck's unit. */
export const AXIS_OFFSET_RATIO = 0.5;
/** Boxes overlapping vertically by more than this many px are an overlap lockup (the kicker
 *  breaking the bar's edge) - an axis device however their edges align. */
export const OVERLAP_PX = 2;

export interface DeviceChannel {
  channel: 'fill' | 'radius' | 'shape' | 'axis';
  detail: string;
}

export interface DeviceReport {
  /** True when ANY channel distinguishes the two carriers. A plain box scores false. */
  present: boolean;
  channels: DeviceChannel[];
  /** What carries each line - the nearest self-painted surface, or null when the line sits
   *  bare. `shared` means both lines sit in the SAME box, the plain-panel shape. */
  carriers: { primary: string | null; supporting: string | null; shared: boolean };
  /** Pill-ness per carrier (0 rectangle .. 1 full pill), for the reader. */
  radius: { primary: number; supporting: number } | null;
  /** The nearest shared alignment edge's offset, in type sizes. */
  axisOffset: number | null;
  /** Vertical overlap of the two lines' boxes, px. Negative is the gap between them. */
  overlapPx: number | null;
  notes: string[];
}

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${[...el.classList].join('.')}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

/** A box the viewer sees: a painted surface (surface.ts, the predicate the ticker check and the
 *  runtime bench share, which counts frosted glass such as the catalog's lt08) or an outline
 *  border. Text and shadows are not boxes here - `paints` answers "is this visible at all", this
 *  asks "is this a container". */
function hasSurface(style: CSSStyleDeclaration): boolean {
  if (paintsSurface(style)) return true;
  return (parseFloat(style.borderTopWidth) || 0) > 0 && style.borderTopStyle !== 'none';
}

/** Wider than this a surface is a backdrop, not a carrier - the same cut spacingCheck and
 *  axisCheck make at 90% of 1920. */
const BACKDROP_WIDTH_PX = 1728;

/** The nearest ancestor (the field element itself included) that paints a surface - and when
 *  no ancestor does, the smallest painted surface whose box ENCLOSES the line geometrically.
 *  The fallback is the sibling-overlay idiom `panelMembers` documents: the house catalog draws
 *  some panels as a sibling the text merely sits ON, and an ancestors-only walk read lt08's
 *  panel as "no carrier" on the control run - which would under-report exactly the channel
 *  the instrument exists to see. Null means the line truly sits bare on the frame. */
function carrierOf(el: Element, win: Window): Element | null {
  for (let node: Element | null = el; node && node !== win.document.body; node = node.parentElement) {
    const style = win.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return null;
    if (hasSurface(style)) return node;
  }
  const rect = el.getBoundingClientRect();
  let best: { el: Element; area: number } | null = null;
  for (const candidate of win.document.body.querySelectorAll('*')) {
    if (candidate === el || candidate.contains(el)) continue;
    const style = win.getComputedStyle(candidate);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    if (!hasSurface(style)) continue;
    const box = candidate.getBoundingClientRect();
    if (box.width >= BACKDROP_WIDTH_PX) continue;
    const holds = box.left <= rect.left + 1 && box.right >= rect.right - 1
      && box.top <= rect.top + 1 && box.bottom >= rect.bottom - 1;
    if (!holds) continue;
    const area = box.width * box.height;
    if (!best || area < best.area) best = { el: candidate, area };
  }
  return best?.el ?? null;
}

/** Corner radius as pill-ness: the largest corner over half the box's height, clamped to 1.
 *  A percentage radius resolves through getComputedStyle to px on the rendered box. */
function pillness(el: Element, win: Window): number {
  const style = win.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  if (rect.height < 1) return 0;
  const corners = ['border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius']
    .map((p) => parseFloat(style.getPropertyValue(p)) || 0);
  return Math.min(1, Math.max(...corners) / (rect.height / 2));
}

function visible(el: Element, win: Window): boolean {
  const style = win.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) < 0.05) return false;
  if (!paints(el, style)) return false;
  const rect = el.getBoundingClientRect();
  return rect.width >= 1 && rect.height >= 1;
}

export interface DeviceOptions {
  /** The two live lines, by the field -> DOM convention (`id="fN"`). */
  primaryFieldId?: string;
  supportingFieldId?: string;
}

export function measureDevice(doc: Document, options: DeviceOptions = {}): DeviceReport {
  const report: DeviceReport = {
    present: false, channels: [], carriers: { primary: null, supporting: null, shared: false },
    radius: null, axisOffset: null, overlapPx: null, notes: [],
  };
  const win = doc.defaultView;
  if (!win) return report;

  const primary = doc.getElementById(options.primaryFieldId ?? 'f0');
  const supporting = doc.getElementById(options.supportingFieldId ?? 'f1');
  if (!primary || !supporting) {
    report.notes.push('one of the two live lines is missing from the document');
    return report;
  }
  if (!visible(primary, win) || !visible(supporting, win)) {
    report.notes.push('one of the two live lines does not paint');
    return report;
  }

  const pRect = primary.getBoundingClientRect();
  const sRect = supporting.getBoundingClientRect();
  const typeSize = Math.max(
    parseFloat(win.getComputedStyle(primary).fontSize) || 0,
    parseFloat(win.getComputedStyle(supporting).fontSize) || 0,
  );

  const pCarrier = carrierOf(primary, win);
  const sCarrier = carrierOf(supporting, win);
  report.carriers = {
    primary: pCarrier ? describe(pCarrier) : null,
    supporting: sCarrier ? describe(sCarrier) : null,
    shared: Boolean(pCarrier && pCarrier === sCarrier),
  };

  // ── FILL, RADIUS and SHAPE need two DIFFERENT boxes - a shared carrier is the plain-panel
  // shape and can only be rescued by the axis channel below. "One line boxed, the other bare"
  // is itself the chip-on-nothing device, counted as shape.
  if (pCarrier !== sCarrier) {
    if (!pCarrier || !sCarrier) {
      const boxed = pCarrier ? 'primary' : 'supporting';
      report.channels.push({ channel: 'shape', detail: `only the ${boxed} line is carried in its own box` });
    } else if (pCarrier.contains(sCarrier) || sCarrier.contains(pCarrier)) {
      // A chip INSIDE the shared bar: the inner box is the device, the outer is the panel.
      const inner = pCarrier.contains(sCarrier) ? sCarrier : pCarrier;
      report.channels.push({ channel: 'shape', detail: `${describe(inner)} is its own box inside the other line's carrier` });
      const pPill = round2(pillness(pCarrier, win));
      const sPill = round2(pillness(sCarrier, win));
      report.radius = { primary: pPill, supporting: sPill };
      if (Math.abs(pPill - sPill) >= RADIUS_DELTA) {
        report.channels.push({ channel: 'radius', detail: `pill-ness ${pPill} vs ${sPill}` });
      }
    } else {
      const pStyle = win.getComputedStyle(pCarrier);
      const sStyle = win.getComputedStyle(sCarrier);
      if (pStyle.backgroundColor !== sStyle.backgroundColor
        || pStyle.backgroundImage !== sStyle.backgroundImage) {
        report.channels.push({
          channel: 'fill',
          detail: `${pStyle.backgroundColor} vs ${sStyle.backgroundColor}`,
        });
      }
      const pPill = round2(pillness(pCarrier, win));
      const sPill = round2(pillness(sCarrier, win));
      report.radius = { primary: pPill, supporting: sPill };
      if (Math.abs(pPill - sPill) >= RADIUS_DELTA) {
        report.channels.push({ channel: 'radius', detail: `pill-ness ${pPill} vs ${sPill}` });
      }
      const pH = pCarrier.getBoundingClientRect().height;
      const sH = sCarrier.getBoundingClientRect().height;
      const heightFactor = Math.max(pH, sH) / Math.max(1, Math.min(pH, sH));
      if (heightFactor >= SHAPE_HEIGHT_FACTOR) {
        report.channels.push({
          channel: 'shape',
          detail: `separate boxes, heights ${Math.round(pH)}px vs ${Math.round(sH)}px`,
        });
      }
    }
  }

  // ── AXIS. Two guards keep font size and text length out of this channel: overlap is read
  // off the boxes directly, and the edge test requires that NO alignment edge is shared -
  // a centred pair's left edges differ by construction, but their centres agree.
  const overlap = Math.min(pRect.bottom, sRect.bottom) - Math.max(pRect.top, sRect.top);
  report.overlapPx = round2(overlap);
  if (overlap > OVERLAP_PX) {
    report.channels.push({ channel: 'axis', detail: `the two lines' boxes overlap by ${Math.round(overlap)}px` });
  } else if (typeSize > 0) {
    const nearestSharedEdge = Math.min(
      Math.abs(pRect.left - sRect.left),
      Math.abs(pRect.right - sRect.right),
      Math.abs((pRect.left + pRect.right) / 2 - (sRect.left + sRect.right) / 2),
    );
    report.axisOffset = round2(nearestSharedEdge / typeSize);
    if (report.axisOffset >= AXIS_OFFSET_RATIO) {
      report.channels.push({
        channel: 'axis',
        detail: `no shared alignment edge - nearest is ${report.axisOffset} type sizes off`,
      });
    }
  }

  report.present = report.channels.length > 0;
  return report;
}
