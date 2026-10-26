// A GRAPHIC'S PLACE AND SIZE ON THIS PRODUCTION'S OUTPUT (docs/work-specs/playout-adjustments/spec.md,
// phase 1): the record a pool graphic and a cue carry, and the one reader every door goes through.
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
}

/** The members a write may set; null removes one. */
export type AdjustPatch = { [K in Exclude<keyof AdjustRecord, 'v'>]?: AdjustRecord[K] | null };

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
  return { status: 'ok', record };
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
