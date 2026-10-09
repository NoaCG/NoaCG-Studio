// THE TICKER-MARGIN instrument - a crawl band runs FULL-BLEED or carries EQUAL side margins,
// never one margin (owner rule, docs/NOACG_PRO_PLAN.md §22.1 escape class 7: X-21 "overflows
// on the right and not on the left: a ticker goes full-bleed or carries equal margins both
// sides", X-45's off-centre box).
//
// Lived in src/ai/spike/ while it was bench-only; moved here in R4 (docs/DESIGN_RULES_PLAN.md
// §5) so the product validator and the spike runners measure through the SAME code. In the
// LOOP it is a statable, measurable, BLOCKING rule: unlike the calibrated spacing thresholds
// this is binary geometry, so it blocks on the ticker type without calibration - the same
// argument that makes a collision block everywhere. On PRODUCT surfaces it lands as a
// warning, like every R4 check (the ratified severity policy: hard where the machine
// decides, warning where a human does).
//
// WHAT COUNTS AS THE BAND: the widest painted surface spanning at least half the frame, by the
// predicate the runtime bench and the device check share (surface.ts), so a glass panel counts.
// A ticker without such a band has no band to measure, and this instrument stays silent - the
// overflow and paint instruments own that failure.

import { paintsSurface } from './surface';

export interface TickerMarginReport {
  band: string | null;
  leftPx: number | null;
  rightPx: number | null;
  findings: { code: string; detail: string }[];
}

/** Insets at or under this are full-bleed contact with the edge. */
export const FULL_BLEED_TOLERANCE_PX = 2;
/** Side margins may differ by at most this before the band reads as off-centre. */
export const MARGIN_EQUALITY_TOLERANCE_PX = 4;

function describe(el: Element): string {
  const id = el.id ? `#${el.id}` : '';
  const cls = el.classList.length ? `.${el.classList[0]}` : '';
  return `${el.tagName.toLowerCase()}${id}${cls}`;
}

export function measureTickerMargins(doc: Document): TickerMarginReport {
  const report: TickerMarginReport = { band: null, leftPx: null, rightPx: null, findings: [] };
  const win = doc.defaultView;
  if (!win || !doc.body) return report;
  const frameWidth = doc.documentElement.clientWidth || 1920;

  let band: { el: Element; rect: DOMRect } | null = null;
  for (const el of doc.body.querySelectorAll('*')) {
    const style = win.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (parseFloat(style.opacity) < 0.05) continue;
    if (!paintsSurface(style)) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < frameWidth / 2 || rect.height < 8) continue;
    if (!band || rect.width > band.rect.width) band = { el, rect };
  }
  if (!band) return report;

  const left = band.rect.left;
  const right = frameWidth - band.rect.right;
  report.band = describe(band.el);
  report.leftPx = Math.round(left * 10) / 10;
  report.rightPx = Math.round(right * 10) / 10;

  const fullBleed = left <= FULL_BLEED_TOLERANCE_PX && right <= FULL_BLEED_TOLERANCE_PX;
  const equal = Math.abs(left - right) <= MARGIN_EQUALITY_TOLERANCE_PX;
  const oneSideOverflow = (left < -FULL_BLEED_TOLERANCE_PX) !== (right < -FULL_BLEED_TOLERANCE_PX);
  if (!fullBleed && (!equal || oneSideOverflow)) {
    // One-side overflow is the X-21 shape even when the raw difference squeaks under the
    // tolerance - a band hanging past one edge while stopping short of the other.
    report.findings.push({
      code: 'ticker-margins-uneven',
      detail: `the band (${report.band}) sits ${Math.round(left)}px from the left edge and`
        + ` ${Math.round(right)}px from the right - a ticker runs full-bleed or carries EQUAL`
        + ' margins both sides, never one margin',
    });
  }
  return report;
}
