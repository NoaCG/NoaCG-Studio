// TEXT BOXES THE AUTHOR DREW (owner, 2026-11-23). Where a file has no shape to hold a line - a
// ticket whose paper and stub are one picture - the Fields step lets the author draw the room
// the line gets. Each drawn box becomes ONE unpainted rectangle in the artwork's root user space:
// the fit measures a line in it and a growth rule can widen it like any drawn plate, while the
// fit's and the growth's own searches for drawn things skip it by its attribute, so a box nobody
// can see never pens, caps or stretches anything (runtime/svgFit.js `SVG_DRAWN_RECT`).
//
// Kernel-level and DOM-only, because three readers need the same rectangle: the bind pass that
// builds the graphic, the Fields step's own measuring render, and the step's preview.

export const SVG_AREA_ATTR = 'data-noacg-area';

/** One drawn box, in FRACTIONS of the artwork - the unit the preview's marquee reports and the
 *  one no zoom or viewBox can make two canvases disagree about. */
export interface SvgArea {
  /** Its candidate id ("aN"), so a field and a growth rule name it the way they name a shape. */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The root's user-space rectangle: its viewBox, else its declared size. */
function userSpaceOf(root: Element): { x: number; y: number; w: number; h: number } | null {
  const vb = (root.getAttribute('viewBox') ?? '').trim().split(/[\s,]+/).map(Number);
  if (vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) return { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
  const w = parseFloat(root.getAttribute('width') ?? '');
  const h = parseFloat(root.getAttribute('height') ?? '');
  return w > 0 && h > 0 ? { x: 0, y: 0, w, h } : null;
}

const round = (n: number) => Math.round(n * 100) / 100;

/** Append each area to the root as its unpainted rectangle, marked with `markerAttr` (the
 *  candidate marker) so everything that finds a shape by its id finds this one. Idempotent: an
 *  area already present is moved to its new place rather than added twice. */
export function injectSvgAreas(root: Element, areas: readonly SvgArea[], markerAttr: string): void {
  const space = userSpaceOf(root);
  if (!space) return;
  const ns = 'http://www.w3.org/2000/svg';
  for (const a of areas) {
    let rect = root.querySelector(`[${SVG_AREA_ATTR}][${markerAttr}="${a.id}"]`);
    if (!rect) {
      rect = root.ownerDocument.createElementNS(ns, 'rect');
      rect.setAttribute(markerAttr, a.id);
      rect.setAttribute(SVG_AREA_ATTR, '');
      rect.setAttribute('fill', 'none');
      rect.setAttribute('stroke', 'none');
      rect.setAttribute('pointer-events', 'none');
      root.appendChild(rect);
    }
    rect.setAttribute('x', String(round(space.x + a.x * space.w)));
    rect.setAttribute('y', String(round(space.y + a.y * space.h)));
    rect.setAttribute('width', String(round(a.w * space.w)));
    rect.setAttribute('height', String(round(a.h * space.h)));
  }
}

/** The markup with its areas in place, for a canvas that renders the file as a string. */
export function svgMarkupWithAreas(markup: string, areas: readonly SvgArea[] | undefined, markerAttr: string): string {
  if (!areas?.length) return markup;
  const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') return markup;
  injectSvgAreas(root, areas, markerAttr);
  return new XMLSerializer().serializeToString(root);
}
