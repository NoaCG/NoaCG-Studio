// CONTROL CUES AND THE ONE CUE-KIND READER (docs/work-specs/osc-control-cues/spec.md D2-D4).
//
// A rundown cue is one of three kinds. A GRAPHIC cue drives a pool graphic (`source` absent,
// `sourceId` = SavedGraphic.id). A SERVER cue drives an item in the playout server's own library
// (`source: 'playout'`, `sourceId` = PlayoutItem.id). A CONTROL cue sends one message to an external
// device (`source: 'control'`, `sourceId` = '', the message in `control`); it never goes on air.
//
// Read the kind only through `cueKind`. Most of the code once read "not a server cue" as "a
// graphic", so a control cue would have slipped into graphic handling; scripts/control-cue.test.mjs
// fails on any raw `.source === 'playout'` comparison outside this file.
//
// Any `source` this build does not know reads as `control`: a cue from a later build is then
// neither a graphic nor a server file, so nothing tries to air it as one. Pure and importing
// nothing at runtime, so Node runs it.

export type CueKind = 'graphic' | 'server' | 'control';

/** What a cue is. Absent `source` = graphic, `playout` = server, anything else = control. */
export function cueKind(cue: { source?: unknown }): CueKind {
  const source = cue.source;
  if (source === undefined) return 'graphic';
  return source === 'playout' ? 'server' : 'control';
}

/** The argument types an OSC message carries in this version: string, int32, float32. */
export type OscArgType = 's' | 'i' | 'f';

export interface OscArg {
  type: OscArgType;
  /** As typed in the editor; checked and converted at send time. */
  value: string;
}

/** Version 1 of a cue's control record: one OSC message to one production destination. */
export interface OscControlV1 {
  v: 1;
  kind: 'osc';
  /** An `OscDestination.id` of the same production; '' while none is chosen. */
  destinationId: string;
  address: string;
  args: OscArg[];
}

export type ControlRecord = OscControlV1;

/** One device an OSC cue can send to, saved with the production and shared by its team. */
export interface OscDestination {
  id: string;
  name: string;
  host: string;
  port: number;
}

const ARG_TYPES = new Set<string>(['s', 'i', 'f']);

function isArg(raw: unknown): raw is OscArg {
  if (!raw || typeof raw !== 'object') return false;
  const a = raw as Record<string, unknown>;
  return typeof a.type === 'string' && ARG_TYPES.has(a.type) && typeof a.value === 'string';
}

/** The control record this build reads, or null when it is absent or one this build cannot read. */
export function readControl(raw: unknown): ControlRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  if (c.v !== 1 || c.kind !== 'osc') return null;
  if (typeof c.destinationId !== 'string' || typeof c.address !== 'string') return null;
  if (!Array.isArray(c.args) || !c.args.every(isArg)) return null;
  return c as unknown as OscControlV1;
}

/** Whether a control cue is one this build cannot read: the whole cue is then read-only and never
 *  sends. A graphic or server cue is never read-only for this reason. */
export function controlReadOnly(cue: { source?: unknown; control?: unknown }): boolean {
  return cueKind(cue) === 'control' && readControl(cue.control) === null;
}

/** A graphic cue (and not missing). Use where the code means "a cue over a pool graphic". */
export function isGraphicCue<T extends { source?: unknown }>(cue: T | null | undefined): cue is T & { source?: undefined } {
  return !!cue && cueKind(cue) === 'graphic';
}

/** A server cue (and not missing). Use where the code means "a cue over a playout server item". */
export function isServerCue<T extends { source?: unknown }>(cue: T | null | undefined): cue is T & { source: 'playout' } {
  return !!cue && cueKind(cue) === 'server';
}

/** A control cue (and not missing): a one-shot message that never goes on air. */
export function isControlCue<T extends { source?: unknown }>(cue: T | null | undefined): cue is T & { source: string } {
  return !!cue && cueKind(cue) === 'control';
}

/** Why this build refuses to send a control cue (rollout release 1, spec D4): it reads, keeps and
 *  shows OSC cues but cannot send them yet. */
export const OSC_NOT_YET = (label: string): string => `${label} is an OSC cue, which this version of NoaCG cannot send yet.`;

// ── The write gate ───────────────────────────────────────────────────────────────────────────

/** What a write must not change, by cue id: a readable control cue's message, or the whole of a
 *  control cue this build cannot read. */
export interface ControlKept {
  cues: Map<string, { bytes: string; whole: boolean }>;
  held: Set<string>;
  ids: Set<string>;
}

type ControlRecordLike = { cues?: readonly ({ id: string; source?: unknown; control?: unknown })[] };

export function controlKeep(show: ControlRecordLike): ControlKept | null {
  const cues = new Map<string, { bytes: string; whole: boolean }>();
  const held = new Set<string>();
  for (const cue of show.cues ?? []) {
    if (cue.control === undefined && !isControlCue(cue)) continue;
    const whole = controlReadOnly(cue);
    cues.set(cue.id, { bytes: JSON.stringify(whole ? cue : (cue.control ?? null)), whole });
    if (!whole) held.add(JSON.stringify(cue.control ?? null));
  }
  return cues.size ? { cues, held, ids: new Set((show.cues ?? []).map((c) => c.id)) } : null;
}

export const CONTROL_KEPT = 'This production has OSC cues this version cannot change, so the edit was not saved.';

/**
 * THE CONTROL GATE AT THE WRITE DOORS (docs/work-specs/osc-control-cues/spec.md D2, D4; the pattern
 * of ./ografTyped.ts `typedFrozen`): model/shows.ts `patchShowChecked` (both of its writes) and
 * ./rundownHistory.ts `replaceRundown` ask it. A write is refused whole when it would change any byte
 * of a control cue this build cannot read, or remove one; change a readable control cue's message
 * other than through its writer (`write`, cue id to the exact bytes it writes); or give a cue a
 * control record it did not have, unless an undo brings it back (`restored`) or it is a copy of a
 * message this record already holds.
 */
export function controlFrozen(
  before: ControlKept | null,
  after: ControlRecordLike,
  restored: ReadonlySet<string> = new Set(),
  write: ReadonlyMap<string, string> = new Map(),
): string | null {
  const now = new Map((after.cues ?? []).map((c) => [c.id, c] as const));
  for (const [id, bytes] of write) {
    const cue = now.get(id);
    if (!cue || before?.cues.get(id)?.whole || JSON.stringify(cue.control ?? null) !== bytes) return CONTROL_KEPT;
  }
  for (const [id, kept] of before?.cues ?? []) {
    if (write.has(id)) continue;
    const cue = now.get(id);
    if (!cue) {
      if (kept.whole) return CONTROL_KEPT;
      continue;
    }
    if (JSON.stringify(kept.whole ? cue : (cue.control ?? null)) !== kept.bytes) return CONTROL_KEPT;
  }
  for (const cue of after.cues ?? []) {
    if (cue.control === undefined && !isControlCue(cue)) continue;
    if (before?.cues.has(cue.id) || restored.has(cue.id) || write.has(cue.id)) continue;
    if (before?.ids.has(cue.id) || controlReadOnly(cue) || !before?.held.has(JSON.stringify(cue.control ?? null))) return CONTROL_KEPT;
  }
  return null;
}
