// The composed FILTER track (docs/PRESET_MODEL_REVIEW.md gap 8).
//
// `filter` is ONE CSS property holding a LIST of functions — `blur(4px) brightness(1.2)`. Even
// in plain CSS you cannot keyframe its parts independently, and neither do we: the data keeps a
// single `filter` track of composed strings, and this module is the editor's lens onto it. Each
// filter function gets its own Inspector row; writing one row re-composes the whole string,
// preserving the others.
//
// Why a string track and not one numeric track per function: GSAP interpolates a composed filter
// string natively, so the runtime interpreter needs NO special case — it tweens `filter` exactly
// like any other property. That holds ONLY while every keyframe in a step's filter track lists
// the SAME functions in the SAME order (otherwise GSAP can't match them up and swaps discretely),
// which is the invariant `normalizeFilterTrack` exists to keep.

import type { AnimKeyframe } from './animData';

/** One animatable filter function: how it reads as a number, and how it writes as CSS. */
export interface FilterFunc {
  /** The Inspector row / editor-side key. */
  key: string;
  /** The CSS function name. */
  css: string;
  /** The no-op value — what the function contributes when it isn't doing anything. */
  identity: number;
  /** The smallest value CSS accepts; below it the browser drops the whole filter declaration. */
  min?: number;
  /** Render one value as its CSS function call. */
  format: (v: number) => string;
  /** Pull this function's number out of a composed filter string, if present. */
  parse: (filter: string) => number | null;
}

const numberIn = (css: string, filter: string): number | null => {
  // The last number inside `css(...)` — drop-shadow's radius is its third, blur's is its only.
  const call = new RegExp(`${css}\\(([^)]*)\\)`).exec(filter);
  if (!call) return null;
  const nums = call[1].match(/-?[\d.]+/g);
  return nums && nums.length ? Number(nums[nums.length - 1]) : null;
};

/** The editable filter vocabulary, in the FIXED order every composed string is written in. */
export const FILTER_FUNCS: FilterFunc[] = [
  {
    key: 'blur',
    css: 'blur',
    identity: 0,
    min: 0,
    format: (v) => `blur(${v}px)`,
    parse: (f) => numberIn('blur', f),
  },
  {
    key: 'brightness',
    css: 'brightness',
    identity: 1,
    min: 0,
    format: (v) => `brightness(${v})`,
    parse: (f) => numberIn('brightness', f),
  },
  {
    key: 'saturate',
    css: 'saturate',
    identity: 1,
    min: 0,
    format: (v) => `saturate(${v})`,
    parse: (f) => numberIn('saturate', f),
  },
  {
    key: 'hueRotate',
    css: 'hue-rotate',
    identity: 0,
    format: (v) => `hue-rotate(${v}deg)`,
    parse: (f) => numberIn('hue-rotate', f),
  },
  {
    // A glow, expressed as a centred drop-shadow. The colour is deliberately omitted: CSS then
    // uses the element's own `color`, so the glow follows the design (and stays interpolable —
    // one number, no colour to tween).
    key: 'glow',
    css: 'drop-shadow',
    identity: 0,
    min: 0,
    format: (v) => `drop-shadow(0px 0px ${v}px)`,
    parse: (f) => numberIn('drop-shadow', f),
  },
];

export const FILTER_KEYS = FILTER_FUNCS.map((f) => f.key);
const funcFor = (key: string): FilterFunc | undefined => FILTER_FUNCS.find((f) => f.key === key);

/** Read every filter function's value out of a composed string. Absent = its identity. */
export function parseFilter(value: number | string | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  const text = typeof value === 'string' ? value : '';
  for (const f of FILTER_FUNCS) {
    const n = f.parse(text);
    out[f.key] = n === null ? f.identity : n;
  }
  return out;
}

/** Write the given functions back into one composed string, in the canonical order. */
export function composeFilter(parts: Record<string, number>, keys: string[]): string {
  const ordered = FILTER_FUNCS.filter((f) => keys.includes(f.key));
  if (ordered.length === 0) return 'none';
  return ordered.map((f) => f.format(round(parts[f.key] ?? f.identity))).join(' ');
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Which functions a filter track is actually animating: any that appears in a keyframe's string,
 * plus any that is present-but-identity (a `blur(0px)` written on purpose stays written — dropping
 * it would change the string's shape mid-track and break GSAP's interpolation).
 */
export function filterKeysUsed(kfs: AnimKeyframe[]): string[] {
  const keys = new Set<string>();
  for (const kf of kfs) {
    if (typeof kf.value !== 'string') continue;
    for (const f of FILTER_FUNCS) {
      if (new RegExp(`${f.css}\\(`).test(kf.value)) keys.add(f.key);
    }
  }
  return FILTER_KEYS.filter((k) => keys.has(k));
}

/**
 * Rewrite every keyframe of a filter track so they all list the SAME functions in the SAME order.
 * This is the invariant that lets the runtime tween `filter` as a plain string: GSAP matches the
 * numbers positionally, so a track whose keyframes disagree on their function list would jump
 * instead of interpolating. A function missing from a keyframe is filled with its identity — which
 * is exactly what it was contributing anyway.
 */
export function normalizeFilterTrack(kfs: AnimKeyframe[], keys: string[]): AnimKeyframe[] {
  if (keys.length === 0) return kfs;
  return kfs.map((kf) => ({
    ...kf,
    value: composeFilter(parseFilter(kf.value), keys),
  }));
}

/** True when both strings name the same filter functions — the interpolable case. */
export function sameFilterShape(a: string, b: string): boolean {
  const shape = (s: string) => (s.match(/[a-z-]+\(/g) ?? []).join(',');
  return shape(a) === shape(b);
}

/** Set ONE function's value on a composed string, leaving the others as they are. */
export function withFilterComponent(current: number | string | null, key: string, value: number): string {
  const parts = parseFilter(current);
  // A reading taken mid-curve can overshoot (back, elastic): the functions carried along stay in
  // the range CSS accepts, or the new key would drop the whole filter.
  for (const f of FILTER_FUNCS) if (f.min !== undefined) parts[f.key] = Math.max(f.min, parts[f.key]);
  parts[key] = value;
  const keys = new Set(filterKeysUsed([{ time: 0, value: typeof current === 'string' ? current : '' }]));
  keys.add(key);
  return composeFilter(parts, [...keys]);
}

/** Read ONE function's value off a composed string (its identity when the function is absent). */
export function filterComponent(current: number | string | null, key: string): number {
  const f = funcFor(key);
  if (!f) return 0;
  const n = typeof current === 'string' ? f.parse(current) : null;
  return n === null ? f.identity : n;
}
