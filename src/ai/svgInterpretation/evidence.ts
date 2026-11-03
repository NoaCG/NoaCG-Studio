// The bounded EVIDENCE a decision model may read about one imported SVG
// (docs/work-specs/jev-svg-import/spec.md, "AI route and data policy", row 32, AC-6 and AC-7).
//
// Default evidence is an inventory: layer ids, names, hierarchy, geometry and the SHAPE of text
// (characters and lines). The artwork's actual words go only with the explicit include-text
// choice, exactly `true`. A rendered preview is never part of this object.
//
// Two halves, so the policy is testable without a browser:
//
//   - `readSvgLayers` (browser only) walks a MOUNTED, already sanitized SVG and reports what the
//     reader marked (`data-noacg-candidate`), the groups above it, and each layer's box in the
//     artwork's own units.
//   - `buildSvgEvidence` (pure) bounds that reading to the server's policy: the shape checked by
//     `svgEvidenceRefusal` in api/_lib/aiSvgInterpretationProfile.ts, whose limits are restated
//     here because the browser tree cannot import the server one. scripts/jev-svg-eval.test.mjs
//     runs every output of this function through the server check, so the two cannot drift.
//
// Layer ids are the READER'S markers (`t0`, `s1`, `g2`) or `n<k>` for an unmarked group: ids this
// code makes, never the artwork's own `id`, so a question may name them without carrying anything
// the artwork says (questions.ts). The artwork's own name travels as `name`, a value in `state`.

export type SvgEvidenceLayerKind = 'text' | 'image' | 'shape' | 'group';

export interface SvgEvidenceLayer {
  id: string;
  kind: SvgEvidenceLayerKind;
  name?: string;
  parent?: string;
  box: [number, number, number, number];
  chars?: number;
  lines?: number;
  text?: string;
}

export interface SvgDecisionEvidence {
  sourceRevision: string;
  canvas: { width: number; height: number };
  layers: SvgEvidenceLayer[];
}

/** What a reader saw of one layer, before any policy. */
export interface SvgLayerReading {
  id: string;
  kind: SvgEvidenceLayerKind;
  /** The artwork's own layer name (`data-name`, else `id`), if any. */
  name?: string | null;
  parent?: string | null;
  box: [number, number, number, number];
  /** Text layers: the words as drawn. Kept out of the evidence unless the user chose to send them. */
  sample?: string;
  lines?: number;
  /** Zero-based child-index path from the root (`0/1/3`), for reconciling labelled anchors. */
  path: string;
}

/** The server's bounds (api/_lib/aiSvgInterpretationProfile.ts `SVG_DECISION_LIMITS`). */
export const SVG_EVIDENCE_LIMITS = {
  layers: 300,
  idChars: 64,
  nameChars: 64,
  textChars: 200,
  depth: 16,
} as const;

/** Reader-made layer ids only: what a question may name. */
export const EVIDENCE_LAYER_ID = /^[a-z][0-9]{1,4}$/;

const UNPLAIN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;

/** One plain line within `max` characters, or undefined when nothing is left. */
function plainLine(value: string | null | undefined, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const line = value.replace(UNPLAIN, ' ').replace(/\s+/g, ' ').trim();
  if (!line) return undefined;
  return [...line].slice(0, max).join('');
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * The evidence that may leave the server, built from a reading. Text layers come first so a
 * crowded artwork keeps every editable candidate inside the layer bound; a parent that did not
 * survive the bound, or sits deeper than the depth limit, is dropped rather than left dangling.
 */
export function buildSvgEvidence(
  reading: { sourceRevision: string; width: number; height: number; layers: readonly SvgLayerReading[] },
  consent: { includeText: boolean },
): SvgDecisionEvidence {
  const valid = reading.layers.filter((l) => EVIDENCE_LAYER_ID.test(l.id) && l.box.every(Number.isFinite));
  const order = [...valid.filter((l) => l.kind === 'text'), ...valid.filter((l) => l.kind !== 'text')];
  const kept = order.slice(0, SVG_EVIDENCE_LIMITS.layers);
  const keptIds = new Set(kept.map((l) => l.id));
  const groups = new Set(kept.filter((l) => l.kind === 'group').map((l) => l.id));
  const parentOf = new Map(kept.map((l) => [l.id, l.parent && groups.has(l.parent) ? l.parent : undefined]));
  const depth = (id: string) => {
    let n = 0;
    for (let at = parentOf.get(id); at !== undefined && n <= SVG_EVIDENCE_LIMITS.depth + 1; at = parentOf.get(at)) n++;
    return n;
  };
  // Back in document order: the reading's own order is the hierarchy's.
  const layers = valid.filter((l) => keptIds.has(l.id)).map((l): SvgEvidenceLayer => {
    const out: SvgEvidenceLayer = { id: l.id, kind: l.kind, box: l.box.map(round) as SvgEvidenceLayer['box'] };
    const name = plainLine(l.name, SVG_EVIDENCE_LIMITS.nameChars);
    if (name) out.name = name;
    const parent = parentOf.get(l.id);
    if (parent !== undefined && depth(l.id) <= SVG_EVIDENCE_LIMITS.depth) out.parent = parent;
    if (l.kind === 'text') {
      const sample = l.sample ?? '';
      out.chars = [...sample].length;
      out.lines = Math.max(1, Math.trunc(l.lines ?? 1));
      const text = consent.includeText === true ? plainLine(sample, SVG_EVIDENCE_LIMITS.textChars) : undefined;
      if (text) out.text = text;
    }
    return out;
  });
  return {
    sourceRevision: reading.sourceRevision,
    canvas: { width: reading.width, height: reading.height },
    layers,
  };
}

const KIND_OF: Readonly<Record<string, SvgEvidenceLayerKind>> = { t: 'text', i: 'image', s: 'shape', g: 'group', o: 'group' };

/**
 * Read a mounted, sanitized SVG (the reader's markup, rendered so boxes exist). Browser only.
 * Every marked layer, and every `<g>` above one, in document order. A shape painted with a
 * picture carries an `i` marker and reads as an image.
 */
export function readSvgLayers(root: SVGSVGElement, attr = 'data-noacg-candidate'): SvgLayerReading[] {
  const top: Element = root;
  const marked = [...root.querySelectorAll(`[${attr}]`)];
  const wanted = new Set<Element>(marked);
  for (const el of marked) {
    for (let up = el.parentElement; up && up !== top; up = up.parentElement) {
      if (up.tagName.toLowerCase() === 'g') wanted.add(up);
    }
  }
  const ids = new Map<Element, string>();
  let unnamed = 0;
  const all = [...root.querySelectorAll('*')].filter((el) => wanted.has(el));
  for (const el of all) {
    const marker = el.getAttribute(attr);
    ids.set(el, marker && EVIDENCE_LAYER_ID.test(marker) ? marker : `n${unnamed++}`);
  }
  const toRoot = root.getScreenCTM()?.inverse();
  const pathOf = (el: Element) => {
    const out: number[] = [];
    for (let n: Element | null = el; n && n !== root; n = n.parentElement) {
      out.unshift([...(n.parentElement?.children ?? [])].indexOf(n));
    }
    return ['0', ...out].join('/');
  };
  return all.map((el) => {
    const id = ids.get(el) as string;
    const marker = el.getAttribute(attr);
    const kind: SvgEvidenceLayerKind = marker ? (KIND_OF[marker[0]] ?? 'group') : 'group';
    let parent: string | null = null;
    for (let up = el.parentElement; up && up !== top; up = up.parentElement) {
      if (ids.has(up)) { parent = ids.get(up) as string; break; }
    }
    let box: [number, number, number, number] = [0, 0, 0, 0];
    const graphic = el as SVGGraphicsElement;
    if (typeof graphic.getBBox === 'function' && toRoot) {
      try {
        const b = graphic.getBBox();
        const m = toRoot.multiply(graphic.getScreenCTM() ?? new DOMMatrix());
        const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
          .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
        const xs = pts.map((p) => p.x);
        const ys = pts.map((p) => p.y);
        box = [Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)];
      } catch {
        // An element with no layout (display:none) keeps the empty box.
      }
    }
    const reading: SvgLayerReading = { id, kind, name: el.getAttribute('data-name') ?? el.getAttribute('id'), parent, box, path: pathOf(el) };
    if (kind === 'text') {
      reading.sample = el.textContent ?? '';
      const rows = new Set([...el.querySelectorAll('tspan')].map((t) => t.getAttribute('y') ?? t.getAttribute('dy')).filter(Boolean));
      reading.lines = Math.max(1, rows.size);
    }
    return reading;
  });
}
