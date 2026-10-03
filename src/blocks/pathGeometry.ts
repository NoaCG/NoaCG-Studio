/** Original, bounded SVG geometry. These values are transient; only path data is saved. */
export interface PathPosition { x: number; y: number }
export interface PathPoint extends PathPosition { in?: PathPosition; out?: PathPosition }
export interface PathGeometry { points: PathPoint[]; closed: boolean }
const finitePoint = (p: PathPosition) => p && [p.x, p.y].every(n => Number.isFinite(n) && Math.abs(n) <= 100000);
const equal = (a: PathPosition, b: PathPosition) => a.x === b.x && a.y === b.y;
const round = (n: number) => Math.round(n * 1000) / 1000;
export function validatePath(path: PathGeometry, draft = false) {
  if (typeof path.closed !== 'boolean' || !Array.isArray(path.points) || path.points.length > 512 || path.points.length < (draft ? 1 : path.closed ? 3 : 2)) throw new Error('A path needs at least two points, or three to close, and at most 512.');
  if (path.points.some(p => !finitePoint(p) || p.in && !finitePoint(p.in) || p.out && !finitePoint(p.out))) throw new Error('Use finite path coordinates within 100,000 pixels.');
}
export function parsePath(source: string): PathGeometry {
  const tokens = source.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g) ?? [];
  if (!source.trim() || source.replace(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?/g, '').replace(/[\s,]/g, '')) throw new Error('This path has unsupported SVG syntax. Its source is preserved.');
  const path: PathGeometry = { points: [], closed: false };
  let index = 0, command = '', cursor: PathPosition = { x: 0, y: 0 };
  const position = (relative: boolean) => {
    const a = tokens[index++], b = tokens[index++];
    if (a === undefined || b === undefined || !Number.isFinite(Number(a)) || !Number.isFinite(Number(b))) throw new Error('This path has incomplete or nonfinite coordinates.');
    return { x: Number(a) + (relative ? cursor.x : 0), y: Number(b) + (relative ? cursor.y : 0) };
  };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index])) command = tokens[index++];
    if (!/^[mMlLcCzZ]$/.test(command)) throw new Error('Point editing supports one M/L/C/Z path. Other SVG commands retain their source.');
    if (path.closed) throw new Error('Point editing supports one subpath only.');
    const upper = command.toUpperCase(), relative = command !== upper;
    if (upper === 'Z') { path.closed = true; continue; }
    if (upper === 'M' && path.points.length) throw new Error('Point editing supports one subpath only.');
    if (upper !== 'M' && !path.points.length) throw new Error('Start a path with M.');
    if (upper === 'C') {
      const out = position(relative), incoming = position(relative), end = position(relative), prev = path.points[path.points.length - 1];
      if (!equal(out, prev)) prev.out = out;
      path.points.push({ ...end, ...!equal(incoming, end) ? { in: incoming } : {} }); cursor = end;
    } else {
      cursor = position(relative); path.points.push({ ...cursor });
      if (upper === 'M') command = relative ? 'l' : 'L';
    }
  }
  if (path.closed && path.points.length > 1 && equal(path.points[0], path.points[path.points.length - 1])) {
    const end = path.points.pop()!; if (end.in) path.points[0].in = end.in;
  }
  validatePath(path);
  return path;
}
export function pathSource(path: PathGeometry, draft = false): string {
  validatePath(path, draft);
  const p = (v: PathPosition) => round(v.x) + ' ' + round(v.y);
  let source = 'M ' + p(path.points[0]);
  for (let i = 1; i < path.points.length + Number(path.closed); i++) {
    const a = path.points[i - 1], b = path.points[i % path.points.length];
    if (a.out || b.in) source += ' C ' + p(a.out ?? a) + ' ' + p(b.in ?? b) + ' ' + p(b);
    else if (i < path.points.length) source += ' L ' + p(b);
  }
  return source + (path.closed ? ' Z' : '');
}
export function movePathPoint(path: PathGeometry, index: number, kind: 'point' | 'in' | 'out', to: PathPosition): PathGeometry {
  validatePath(path);
  if (!Number.isInteger(index) || !path.points[index] || !['point', 'in', 'out'].includes(kind) || !finitePoint(to)) throw new Error('Choose a valid point or tangent and finite coordinates.');
  const from = path.points[index], next = { ...from };
  if (kind === 'point') {
    next.x = to.x; next.y = to.y;
    for (const side of ['in', 'out'] as const) if (from[side]) next[side] = { x: from[side]!.x + to.x - from.x, y: from[side]!.y + to.y - from.y };
  } else next[kind] = { ...to };
  const result = { ...path, points: path.points.map((point, i) => i === index ? next : point) };
  validatePath(result); return result;
}
/** Composition <-> path user coordinates, including the entire rendered parent chain. */
export function mapPoint(matrix: readonly number[], point: PathPosition, inverse = false): PathPosition {
  if (matrix.length !== 6 || matrix.some(n => !Number.isFinite(n))) throw new Error('The path coordinate mapping is unavailable.');
  const [a, b, c, d, e, f] = matrix, determinant = a * d - b * c;
  if (inverse && Math.abs(determinant) < 1e-8) throw new Error('This path transform is singular. Restore a nonzero scale first.');
  return inverse ? { x: (d * (point.x - e) - c * (point.y - f)) / determinant, y: (-b * (point.x - e) + a * (point.y - f)) / determinant }
    : { x: a * point.x + c * point.y + e, y: b * point.x + d * point.y + f };
}
/** Exact cubic extrema, rather than tangent bounds, center the initial transform frame. */
export function pathBounds(path: PathGeometry) {
  validatePath(path);
  const xs = path.points.map(p => p.x), ys = path.points.map(p => p.y);
  for (let i = 1; i < path.points.length + Number(path.closed); i++) {
    const a = path.points[i - 1], b = path.points[i % path.points.length];
    for (const [axis, values] of [['x', xs], ['y', ys]] as const) {
      const p0 = a[axis], p1 = (a.out ?? a)[axis], p2 = (b.in ?? b)[axis], p3 = b[axis];
      const A = -p0 + 3 * p1 - 3 * p2 + p3, B = 2 * (p0 - 2 * p1 + p2), C = p1 - p0, disc = B * B - 4 * A * C;
      const roots = Math.abs(A) < 1e-10 ? Math.abs(B) < 1e-10 ? [] : [-C / B] : disc < 0 ? [] : [(-B + Math.sqrt(disc)) / (2 * A), (-B - Math.sqrt(disc)) / (2 * A)];
      for (const t of roots) if (t > 0 && t < 1) values.push((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t * t * p2 + t ** 3 * p3);
    }
  }
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) };
}
