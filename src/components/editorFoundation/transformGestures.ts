/**
 * The pure geometry of the canvas transform tools (R1.2b.1, docs/research/editor-r1-2b-1): the rotation
 * handle's unwrapped angle, the scale handles' ratios in a layer's own axes, and the Position change
 * that keeps a scale's pivot in place. Points are composition pixels as the preview reports
 * them; a `Linear` is the 2x2 part of a matrix, [a, b, c, d] as in DOMMatrix (x' = a x + c y).
 */
export type Point = { x: number; y: number };
export type Linear = [number, number, number, number];

export const apply = ([a, b, c, d]: Linear, p: Point): Point => ({ x: a * p.x + c * p.y, y: b * p.x + d * p.y });
export function invert([a, b, c, d]: Linear, singular = 'This layer or its parent has a zero scale, so a pointer cannot be mapped into it. Restore a nonzero scale first.'): Linear {
  const det = a * d - b * c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) throw new Error(singular);
  return [d / det, -b / det, -c / det, a / det];
}
export const multiply = ([a, b, c, d]: Linear, [e, f, g, h]: Linear): Linear => [a * e + c * f, b * e + d * f, a * g + c * h, b * g + d * h];
const minus = (p: Point, q: Point): Point => ({ x: p.x - q.x, y: p.y - q.y });

/** A layer's own frame on screen, from its rendered corners (top-left, top-right, bottom-right,
 *  bottom-left) and the box they were measured on: composition pixels per layer pixel. */
export function localFrame(corners: Point[], box: [number, number]): Linear {
  const [w, h] = box;
  if (!(w > 0 && h > 0) || corners.length < 4) throw new Error('This layer has no area to transform. Restore its size first.');
  return [(corners[1].x - corners[0].x) / w, (corners[1].y - corners[0].y) / w, (corners[3].x - corners[0].x) / h, (corners[3].y - corners[0].y) / h];
}
/** The middle of a box from its corners: the midpoint of a diagonal. */
export const centreOf = (c: Point[]): Point => ({ x: (c[0].x + c[2].x) / 2, y: (c[0].y + c[2].y) / 2 });
/** The midpoints of a box's sides from its corners: top, right, bottom, left. */
export const edgePoints = (c: Point[]): Point[] => [0, 1, 2, 3].map(i => ({ x: (c[i].x + c[(i + 1) % 4].x) / 2, y: (c[i].y + c[(i + 1) % 4].y) / 2 }));

/** Where the rotation handle sits: `distance` outside the middle of the top side, away from the centre. */
export function rotationKnob(c: Point[], distance: number): { from: Point; at: Point } {
  const from = edgePoints(c)[0], centre = centreOf(c);
  let out = minus(from, centre);
  // A box without height has its top on its centre: point away from the side's direction instead.
  if (Math.hypot(out.x, out.y) < 1e-6) out = { x: c[1].y - c[0].y, y: c[0].x - c[1].x };
  const length = Math.hypot(out.x, out.y) || 1;
  return { from, at: { x: from.x + out.x / length * distance, y: from.y + out.y / length * distance } };
}

/** The angle the pointer swept round `pivot` from `from` to `to`, in degrees in (-180, 180], read in
 *  the parent's coordinates (where a layer's rotation is measured), so a mirrored or unevenly scaled
 *  parent turns the layer the way the pointer goes. Summing sweeps never wraps: two turns are 720. */
export function sweep(parent: Linear, pivot: Point, from: Point, to: Point): number {
  const inverse = invert(parent), a = apply(inverse, minus(from, pivot)), b = apply(inverse, minus(to, pivot));
  if (Math.hypot(a.x, a.y) < 1e-9 || Math.hypot(b.x, b.y) < 1e-9) return 0;
  let degrees = (Math.atan2(b.y, b.x) - Math.atan2(a.y, a.x)) * 180 / Math.PI;
  if (degrees > 180) degrees -= 360;
  if (degrees <= -180) degrees += 360;
  return degrees;
}
/** Shift's rotation: the nearest multiple of `step` degrees. */
export const snapRotation = (value: number, step = 15) => Math.round(value / step) * step || 0;

/**
 * The scale ratios a handle drag asks for, measured in the layer's own axes (`local`, from
 * `localFrame`), so a rotated layer scales along its own sides. `axes` names what the handle moves: a
 * corner both, a side one. `linked` gives both axes the larger change: a corner's linked proportions, a
 * side's Shift (its other axis is unchanged, so its own ratio wins). A handle on the pivot's own line
 * leaves that axis alone.
 */
export function handleRatios(local: Linear, handle: Point, pivot: Point, delta: Point, axes: 'x' | 'y' | 'xy', linked: boolean): Point {
  const inverse = invert(local), start = apply(inverse, minus(handle, pivot)), change = apply(inverse, delta);
  const ratio = (from: number, by: number) => Math.abs(from) < .001 ? 1 : (from + by) / from;
  let x = axes === 'y' ? 1 : ratio(start.x, change.x), y = axes === 'x' ? 1 : ratio(start.y, change.y);
  if (linked) x = y = Math.abs(x - 1) >= Math.abs(y - 1) ? x : y;
  return { x, y };
}
/**
 * The Position change, in the parent's units (`parent` maps them to composition pixels), that keeps
 * `pivot` where it is while the layer scales by `ratios` about its anchor: the pivot would move by
 * L (I - D) L^-1 (pivot - anchor) on screen, and Position takes it back.
 */
export function pivotShift(parent: Linear, local: Linear, ratios: Point, pivot: Point, anchor: Point): Point {
  const u = apply(invert(local), minus(pivot, anchor));
  return apply(invert(parent), apply(local, { x: (1 - ratios.x) * u.x, y: (1 - ratios.y) * u.y }));
}
/** A layer's own rotation and scale as one linear map (CSS and GSAP both rotate after scaling). */
export function ownLinear(rotation: number, scaleX: number, scaleY: number): Linear {
  const r = rotation * Math.PI / 180, cos = Math.cos(r), sin = Math.sin(r);
  return [cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY];
}
