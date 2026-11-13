// THE LIVE DOCK (docs/work-specs/obs-scenes/spec.md OS6, rules K3, K6 and K7): which scenes the dock
// shows, its one health line, and the break deadline it writes. The dock itself is a layout of the
// production page (K1), so everything that airs stays the page's; this module only reads. Pure:
// scripts/live-dock.test.mjs runs it in Node.

import { isSourcePath } from '../model/productionData';
import { localTimeZone, resolveClockTarget } from './clockTarget';
import type { ObsPosition } from './obsSceneRows';
import type { ReadyTone } from './readiness';

// ── K3: which scenes it shows ──────────────────────────────────────────────────────────────────

export interface DockScenes {
  /** `program`: the scenes on program; `picked`: none is, so the operator's pick. */
  mode: 'program' | 'picked';
  /** The scene ids shown, in rundown order. */
  ids: string[];
  /** The pick as it stands (the first scene until changed, or when the pick is gone). */
  picked: string;
}

/**
 * The scenes on program (any instance of their link, OS3 M4), in the scenes' order; while none is,
 * the operator's pick, or the first scene. Null without scenes.
 */
export function dockScenes(
  scenes: readonly { id: string }[],
  rows: readonly { id: string; obs: ObsPosition | null }[],
  pick: string | null,
): DockScenes | null {
  if (scenes.length === 0) return null;
  const onProgram = new Set(rows.filter((r) => r.obs === 'program').map((r) => r.id));
  const picked = pick !== null && scenes.some((s) => s.id === pick) ? pick : scenes[0].id;
  const program = scenes.filter((s) => onProgram.has(s.id)).map((s) => s.id);
  return program.length > 0 ? { mode: 'program', ids: program, picked } : { mode: 'picked', ids: [picked], picked };
}

// ── K6: the health line ────────────────────────────────────────────────────────────────────────

const TONE_RANK: Record<ReadyTone, number> = { ok: 0, idle: 1, warn: 2, bad: 3 };

/** The OS3 rows folded into one line, toned as the worst row. Null without rows. */
export function sceneHealth(rows: readonly { name: string; tone: ReadyTone; state: string }[]): { tone: ReadyTone; words: string; title: string } | null {
  if (rows.length === 0) return null;
  const title = rows.map((r) => `${r.name}: ${r.state}`).join('\n');
  const ready = rows.filter((r) => r.tone === 'ok').length;
  if (ready === rows.length) return { tone: 'ok', words: rows.length === 1 ? 'The scene is ready' : `All ${rows.length} scenes ready`, title };
  const worst = rows.reduce((w, r) => (TONE_RANK[r.tone] > TONE_RANK[w.tone] ? r : w));
  return { tone: worst.tone, words: `${ready} of ${rows.length} ready · ${worst.name}: ${worst.state}`, title };
}

// ── K7: the break deadline ─────────────────────────────────────────────────────────────────────

/**
 * The start-time field a design's clock reads (templates/shared/clock.ts `clockTargetSeconds`), from
 * the code it emits; null for a design whose clock counts a duration only.
 */
export function startTimeField(js: string): string | null {
  return /function clockTargetSeconds\(\)\s*\{\s*var text = clockFieldText\('([A-Za-z0-9_-]+)'\)/.exec(js)?.[1] ?? null;
}

export interface DeadlinePath {
  path: string;
  /** The graphics whose start time it feeds, in pool order. */
  graphics: string[];
}

/** The data paths bound to a countdown's start-time field, in pool order, one per path. A path a
 *  source writes is left out: its next read would overwrite the dock's value. */
export function deadlinePaths(
  graphics: readonly { name: string; template: { js: string } }[],
  bindings: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined,
  sourceIds: readonly string[] = [],
): DeadlinePath[] {
  const byPath = new Map<string, string[]>();
  for (const g of graphics) {
    const field = startTimeField(g.template.js);
    const path = field ? bindings?.[g.name]?.[field] : undefined;
    if (!path || sourceIds.some((id) => isSourcePath(id, path))) continue;
    byPath.set(path, [...(byPath.get(path) ?? []), g.name]);
  }
  return [...byPath].map(([path, names]) => ({ path, graphics: names }));
}

const two = (n: number) => String(n).padStart(2, '0');

/**
 * An instant as an ISO date and time with an offset (OS4 R7), seconds included: `offset` is minutes
 * east of UTC, as `-Date#getTimezoneOffset()` gives it.
 */
export function deadlineText(at: number, offset: number): string {
  const wall = new Date(Math.floor(at / 1000) * 1000 + offset * 60_000);
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  return (
    `${wall.getUTCFullYear()}-${two(wall.getUTCMonth() + 1)}-${two(wall.getUTCDate())}` +
    `T${two(wall.getUTCHours())}:${two(wall.getUTCMinutes())}:${two(wall.getUTCSeconds())}` +
    `${sign}${two(Math.floor(abs / 60))}:${two(abs % 60)}`
  );
}

/** This computer's offset at an instant, in minutes east of UTC. */
const localOffset = (at: number): number => -new Date(at).getTimezoneOffset();

/** "In N min": now plus N minutes, to the whole second, so a second press is a new value from now. */
export function deadlineIn(now: number, minutes: number): string {
  const at = Math.floor(now / 1000) * 1000 + minutes * 60_000;
  return deadlineText(at, localOffset(at));
}

/** "Set": the next time a local HH:MM comes round in `zone`, today if still ahead, else tomorrow
 *  (clockTarget.ts T1); in a repeated hour its next occurrence. Null for a value that is not a time
 *  of day, or a time the zone skips that day (T4). */
export function deadlineAtLocal(hhmm: string, now: number, zone: string = localTimeZone()): string | null {
  const text = hhmm.trim();
  if (!/^\d{1,2}:\d{2}$/.test(text)) return null;
  const r = resolveClockTarget({ time: text, zone, fold: 'earlier' }, now);
  return r.kind === 'resolved' ? `${r.date}T${r.time}:00${r.offset}` : null;
}

/** A held deadline value read back: its instant, or null for anything that is not a whole ISO date
 *  and time with its offset (the clock reads an `HH:MM` value its own way). */
export function deadlineOf(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  // The clock's own reading (templates/shared/clock.ts `clockDeadlineAt`): an impossible date or
  // hour is no deadline there, so it is none here either.
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.exec(value.trim());
  if (!m) return null;
  const [y, mo, d, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (mo < 1 || mo > 12 || d < 1 || d > days || h > 23 || mi > 59 || s > 59) return null;
  const at = Date.parse(m[0]);
  return Number.isFinite(at) ? at : null;
}
