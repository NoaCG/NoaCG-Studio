// A GRAPHIC'S PLACE, SIZE, TYPE AND COLOUR ON THIS PRODUCTION'S OUTPUT
// (docs/work-specs/playout-adjustments/spec.md, phases 1 and 2): the record a pool graphic and a cue
// carry, and the one reader every door goes through.
//
// The record stores INTENT: a place preset, nudges in production px, a scale, and the anchor zone
// derived once when the record is first written. It never stores a measured box (that is the
// session's, control/adjustGeometry.ts) and never touches the template: the output applies the
// result as a transform on the frame NoaCG owns (control/cueAdjust.ts resolves it).
//
// ADDITIVE OPTIONAL on `ShowCue` and `SavedGraphic`, with its own `v`. A record written by a later
// build (`v` above this one's) is kept as it is and refused for editing, the way a later
// `ShowProfile` is; members this build does not know are ignored on read and kept on write.
//
// Pure, no imports: Node tests load it as it is.

/** A nine-point zone of the frame: top, middle or bottom, then left, centre or right. */
export type Zone9 = 'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br';

export const ZONES: readonly Zone9[] = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];

/** The version this build writes and reads. */
export const ADJUST_V = 1;

/** One scope's adjustment. Every member is optional: absent inherits from the wider scope. */
export interface AdjustRecord {
  v: 1;
  /** Place preset, resolved against the measured box when sent. */
  place?: Zone9;
  /** Nudges in production-frame px, added after the preset. */
  x?: number;
  y?: number;
  /** Scale factor about the pivot. */
  scale?: number;
  /** The pivot's zone, derived once when the record is first written and kept. */
  anchor?: Zone9;
  /** `:root` variables by name without dashes ({@link STYLE_VARS}), phase 2. An empty value is
   *  "as designed" at this scope: it masks what a wider scope sets, so a cue can keep the design's
   *  accent while its graphic's other cues take another. */
  vars?: Record<string, string>;
  /** The face `--font-heading` names, by identity only: a bundled id, or an imported face by family
   *  and the asset path a pool graphic of the production ships it at. Never bytes. 'designed' is
   *  "as designed" at this scope, as an empty variable is. */
  font?: FontRef | 'designed';
  /** This scope keeps its own style out of a production look (phase 3); written with the "as
   *  designed" masks and removed with them. */
  keepStyle?: true;
}

/** A face by identity. */
export type FontRef = { fontId: string } | { family: string; assetPath: string };

/** The style variables a record may set: the contract colours, the heading weight, and the shape
 *  tokens (model/themeTokens.ts `TOKEN_VARS`) other than the derived `font-numeric`. `font-heading`
 *  is never one: it follows `font`. */
export const STYLE_VARS: readonly string[] = [
  'accent', 'text-color', 'text-dim', 'panel-bg', 'display-weight',
  'panel-blur', 'panel-radius', 'panel-shadow', 'panel-keyline', 'accent-weight', 'accent-glow',
  'accent-ink', 'font-label', 'label-tracking', 'label-color', 'display-tracking',
];

/** The members a write may set; null removes one. `vars` merges key by key, a null value removing
 *  that key. */
export type AdjustPatch = {
  [K in Exclude<keyof AdjustRecord, 'v' | 'vars'>]?: AdjustRecord[K] | null;
} & { vars?: Record<string, string | null> | null };

/** What a stored record is, as this build reads it. */
export type AdjustRead =
  | { status: 'none' }
  | { status: 'ok'; record: AdjustRecord }
  | { status: 'read-only' };

/** The wording every door answers for a later version's record. */
export const ADJUST_READ_ONLY = 'This graphic’s place and size were set by a later version of NoaCG, so they are read-only here.';

export const SCALE_MIN = 0.25;
export const SCALE_MAX = 4;
/** A nudge never moves a frame further than this (production px), so a frame always keeps part of
 *  itself on the stage (Chromium throttles a frame moved wholly off-screen). */
export const NUDGE_MAX = 4000;

const isZone = (z: unknown): z is Zone9 => typeof z === 'string' && (ZONES as readonly string[]).includes(z);
const num = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);

/** Read a stored record: absent, this version's (known members only, each checked), or a later one. */
export function readAdjust(raw: unknown): AdjustRead {
  if (raw === undefined || raw === null) return { status: 'none' };
  if (typeof raw !== 'object') return { status: 'none' };
  const r = raw as Record<string, unknown>;
  if (num(r.v) && r.v > ADJUST_V) return { status: 'read-only' };
  if (r.v !== ADJUST_V) return { status: 'none' };
  const record: AdjustRecord = { v: 1 };
  if (isZone(r.place)) record.place = r.place;
  if (num(r.x)) record.x = clampNudge(r.x);
  if (num(r.y)) record.y = clampNudge(r.y);
  if (num(r.scale) && r.scale > 0) record.scale = clampScale(r.scale);
  if (isZone(r.anchor)) record.anchor = r.anchor;
  const vars = readVars(r.vars);
  if (vars) record.vars = vars;
  const font = readFont(r.font);
  if (font) record.font = font;
  if (r.keepStyle === true) record.keepStyle = true;
  return { status: 'ok', record };
}

/** A style value this build applies: a short CSS value that cannot leave its declaration or fetch
 *  anything (`url(`, `image-set(`, `image(`, `src(`). */
export function styleValue(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 200 && !/[;{}<>\\]|url\(|image-set\(|image\(|src\(|@import|\/\*/i.test(v);
}

function readVars(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (STYLE_VARS.includes(k) && styleValue(v)) out[k] = v.trim();
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

const FAMILY_RE = /^[^"'\\;{}<>]{1,80}$/;
const ASSET_RE = /^fonts\/[\w./-]+\.(?:woff2|woff|ttf|otf)$/i;

/** A face reference this build can resolve, or 'designed', or undefined. */
export function readFont(raw: unknown): FontRef | 'designed' | undefined {
  if (raw === 'designed') return 'designed';
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  if (typeof r.fontId === 'string' && /^[a-z0-9-]{1,40}$/.test(r.fontId)) return { fontId: r.fontId };
  if (typeof r.family === 'string' && FAMILY_RE.test(r.family) && typeof r.assetPath === 'string' && ASSET_RE.test(r.assetPath) && !r.assetPath.includes('..')) {
    return { family: r.family.trim(), assetPath: r.assetPath };
  }
  return undefined;
}

export const clampScale = (s: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, Math.round(s * 1000) / 1000));
export const clampNudge = (n: number) => Math.min(NUDGE_MAX, Math.max(-NUDGE_MAX, Math.round(n)));

/**
 * A stored record with `patch` written over it: the raw record's other members kept (a member
 * this build does not know stays as it was), each patched member checked, a null removing one.
 * Answers the record to store, or undefined when nothing is left at this scope. Refuses
 * (answers the wording) a later version's record.
 */
export function patchAdjust(raw: unknown, patch: AdjustPatch): Record<string, unknown> | undefined | string {
  const read = readAdjust(raw);
  if (read.status === 'read-only') return ADJUST_READ_ONLY;
  const base: Record<string, unknown> = read.status === 'ok' && raw && typeof raw === 'object' ? { ...(raw as Record<string, unknown>) } : {};
  for (const [key, value] of Object.entries(patch) as [keyof AdjustPatch, unknown][]) {
    if (value === null || value === undefined) {
      if (value === null) delete base[key];
      continue;
    }
    if ((key === 'place' || key === 'anchor') && isZone(value)) base[key] = value;
    else if ((key === 'x' || key === 'y') && num(value)) base[key] = clampNudge(value);
    else if (key === 'scale' && num(value) && value > 0) base[key] = clampScale(value);
    else if (key === 'font' && readFont(value)) base.font = readFont(value);
    else if (key === 'keepStyle' && value === true) base.keepStyle = true;
    else if (key === 'vars' && typeof value === 'object') {
      const vars: Record<string, unknown> = { ...((base.vars && typeof base.vars === 'object' ? base.vars : {}) as Record<string, unknown>) };
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (v === null) delete vars[k];
        else if (STYLE_VARS.includes(k) && styleValue(v)) vars[k] = v.trim();
      }
      if (Object.keys(vars).length > 0) base.vars = vars;
      else delete base.vars;
    }
  }
  // Identity members are still members: x 0 written at this scope overrides an inherited x.
  base.v = ADJUST_V;
  return Object.keys(base).some((k) => k !== 'v') ? base : undefined;
}

/** A member's value as the fold sees it (cue over graphic, identity after): what a step adds to. */
export function foldedMember(graphicRaw: unknown, cueRaw: unknown, key: 'x' | 'y' | 'scale'): number {
  const read = (raw: unknown) => {
    const r = readAdjust(raw);
    return r.status === 'ok' ? r.record[key] : undefined;
  };
  return read(cueRaw) ?? read(graphicRaw) ?? (key === 'scale' ? 1 : 0);
}

/** A STEP as a patch: each member added to its folded value (the cue's, else the graphic's, else
 *  identity), with `patch` riding along. One rule for the production page and the hosted page. */
export function stepPatch(graphicRaw: unknown, cueRaw: unknown, step: { x?: number; y?: number; scale?: number }, patch: AdjustPatch = {}): AdjustPatch {
  const next: AdjustPatch = { ...patch };
  for (const key of ['x', 'y', 'scale'] as const) {
    const by = step[key];
    if (by) next[key] = Math.round((foldedMember(graphicRaw, cueRaw, key) + by) * 1000) / 1000;
  }
  return next;
}

/** "USE FOR ALL" on the records: the members a cue's exception sets, to write onto its graphic's
 *  default (the cue's record then goes); null when the cue has none; the wording when either scope
 *  holds a later version's record. */
export function promotedMembers(graphicRaw: unknown, cueRaw: unknown): AdjustPatch | null | string {
  const own = readAdjust(cueRaw);
  if (own.status === 'read-only' || readAdjust(graphicRaw).status === 'read-only') return ADJUST_READ_ONLY;
  if (own.status !== 'ok') return null;
  const { v: _v, ...members } = own.record;
  return members;
}

