/** Rendered composition bounds, never persisted scene data. */
export interface ArtworkBounds { selector: string; x: number; y: number; width: number; height: number }
export type Arrangement = { kind: 'align'; axis: 'x' | 'y'; edge: 'start' | 'center' | 'end' } | { kind: 'distribute'; axis: 'x' | 'y' };
export interface ArtworkDelta { selector: string; x: number; y: number }

/** Alignment and equal-gap distribution in one coordinate system. Endpoints stay fixed. */
export function arrangementDeltas(parts: ArtworkBounds[], command: Arrangement, canvas?: { width: number; height: number }): ArtworkDelta[] {
  if (parts.length < (command.kind === 'distribute' ? 3 : canvas ? 1 : 2)) throw new Error(command.kind === 'distribute' ? 'Select at least three independent artwork layers to distribute.' : 'Select at least two layers, or align one layer to Canvas.');
  if (new Set(parts.map(p => p.selector)).size !== parts.length || parts.some(p => !p.selector || ![p.x, p.y, p.width, p.height].every(Number.isFinite) || p.width < 0 || p.height < 0)) throw new Error('The selected artwork has no exact rendered bounds.');
  if (canvas && (![canvas.width, canvas.height].every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0)) throw new Error('The canvas dimensions are invalid.');
  const axis = command.axis, size = axis === 'x' ? 'width' : 'height';
  const deltas = new Map(parts.map(p => [p.selector, 0]));
  if (command.kind === 'align') {
    const start = canvas ? 0 : Math.min(...parts.map(p => p[axis]));
    const end = canvas ? canvas[size] : Math.max(...parts.map(p => p[axis] + p[size]));
    const fraction = command.edge === 'start' ? 0 : command.edge === 'center' ? .5 : 1;
    const at = start + fraction * (end - start);
    parts.forEach(p => deltas.set(p.selector, at - p[axis] - fraction * p[size]));
  } else {
    const sorted = [...parts].sort((a, b) => a[axis] - b[axis]);
    const first = sorted[0], last = sorted.reduce((outer, p) => p[axis] + p[size] >= outer[axis] + outer[size] ? p : outer);
    if (first === last) throw new Error('One layer spans both outer edges. Select distinct outer layers to distribute with fixed endpoints.');
    const gap = (last[axis] + last[size] - first[axis] - sorted.reduce((sum, p) => sum + p[size], 0)) / (sorted.length - 1);
    let at = first[axis] + first[size] + gap;
    sorted.filter(p => p !== first && p !== last).forEach(p => { deltas.set(p.selector, at - p[axis]); at += p[size] + gap; });
  }
  return parts.map(p => ({ selector: p.selector, x: axis === 'x' ? deltas.get(p.selector)! : 0, y: axis === 'y' ? deltas.get(p.selector)! : 0 }));
}
