// Small persisted user preferences (this browser's localStorage — not synced; they are
// device-level workflow defaults, not project data). Kept intentionally tiny: every entry
// must be a genuine default someone sets once, not hidden app state.

import type { CommentVisibility } from '../editor/commentVisibility';

const PREFS_KEY = 'spx-gfx-prefs';

/**
 * THE FORMAT VERSION, stamped as `v` on every record this build writes (the root versioning
 * invariant).
 *
 *   1  never stamped: every record written before the stamp existed. It could carry
 *      `advancedMode`, the switch that put the old code editor's doors back.
 *   2  `advancedMode` is gone. The old editor has no door at all any more, so a stored `true`
 *      must not survive, least of all on a shared classroom computer where one person ticking it
 *      once used to send every later student into that editor.
 *
 * A record from a NEWER build (a higher number) is read as the defaults and never written over
 * (see `readPrefs`).
 */
export const PREFS_VERSION = 2;

export interface UserPrefs {
  /** The export target preselected in the Export tab (also updated on every manual pick). */
  defaultExportTarget: string;
  /** The preview timeline strip's collapsed state. null = auto (expanded desktop, collapsed mobile). */
  timelineCollapsed: boolean | null;
  /** Last-used video/image render settings (Export tab). null = the panel's defaults. */
  renderSettings: { format: string; scale: number; fps: number | null; durationSec: number } | null;
  /** How the code editors render comments — a VIEW preference; the code itself never changes. */
  commentVisibility: CommentVisibility;
  /** How the graphics library is laid out: cards you can SEE, or a dense table you can scan.
   *  Per device and remembered, because which one is right depends on the library's size and
   *  on the screen, not on the graphic (re-design/handoff.md §5b/§5c). */
  libraryView: 'grid' | 'list';
  /** What SPACE does on the playout dashboard (docs/PLAYOUT_DASHBOARD.md §2f). 'take' is the
   *  toggle the dashboard has always had; 'preview-then-take' previews first. An operator's
   *  habit, so it lives here with the other device-level defaults, never on the production.
   *  Read live via components/playoutKeys useSpaceMode; the exported controller keeps its own
   *  copy on the relay's origin. */
  spaceMode: SpaceMode;
}

/** The two SPACE modes. One word with a safe default; `control/spaceMode.ts` normalises it. */
export type SpaceMode = 'take' | 'preview-then-take';

const DEFAULTS: UserPrefs = {
  defaultExportTarget: '', // empty = the registry's first target
  timelineCollapsed: null,
  renderSettings: null,
  commentVisibility: 'normal',
  // Grid by default: a graphic is a picture, and the thing that identifies it is what it
  // looks like, not its name.
  libraryView: 'grid',
  spaceMode: 'take',
};

/** What the stored record turned out to be. `writable` is false only for a newer build's record. */
interface PrefsRead {
  prefs: UserPrefs;
  writable: boolean;
  /** True when the stored record was an older version and has just been migrated. */
  migrated: boolean;
}

/**
 * THE MIGRATE-ON-READ GUARD. Never throws: a corrupt or missing record is the defaults.
 *
 * - No stamp is version 1 (so is a stamp no build ever wrote at or below this one). It is
 *   migrated by dropping `advancedMode`, and everything else it holds keeps its value. Only a
 *   record that actually carried the retired key is reported as migrated, so reading never
 *   writes a browser's defaults back for nothing.
 * - `v: 2` is this build's own format.
 * - A HIGHER number came from a newer build. Its values may mean something different there, so
 *   this build reads the defaults and refuses to write, which keeps the newer record intact for
 *   the build that wrote it.
 */
function readPrefs(): PrefsRead {
  let stored: unknown;
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (raw === null) return { prefs: { ...DEFAULTS }, writable: true, migrated: false }; // nothing saved yet
    stored = JSON.parse(raw);
  } catch {
    return { prefs: { ...DEFAULTS }, writable: true, migrated: false }; // corrupt or unreadable storage
  }
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
    return { prefs: { ...DEFAULTS }, writable: true, migrated: false };
  }
  const { v, ...rest } = stored as Record<string, unknown> & { v?: unknown };
  if (typeof v === 'number' && v > PREFS_VERSION) {
    return { prefs: { ...DEFAULTS }, writable: false, migrated: false };
  }
  if (v === PREFS_VERSION) {
    return { prefs: { ...DEFAULTS, ...(rest as Partial<UserPrefs>) }, writable: true, migrated: false };
  }
  // Version 1 -> 2: the retired Advanced mode switch is dropped, whatever it said.
  const kept: Record<string, unknown> = { ...rest };
  const migrated = 'advancedMode' in kept;
  delete kept.advancedMode;
  return { prefs: { ...DEFAULTS, ...(kept as Partial<UserPrefs>) }, writable: true, migrated };
}

/** Write the whole record in the current format. Storage errors are swallowed (see savePrefs). */
function writePrefs(prefs: UserPrefs): void {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ v: PREFS_VERSION, ...prefs }));
  } catch {
    // Storage full or unavailable. A preference is a CONVENIENCE - the remembered export
    // target, a panel's visibility - and losing one costs a click; throwing costs the whole
    // app, because this is called from render-adjacent paths with no error boundary above
    // them. Measured 2026-08-06: with the quota exhausted, opening the export window threw
    // here and unmounted the entire React tree, so the "storage is full" dialog that had just
    // been raised went down with it.
  }
}

export function loadPrefs(): UserPrefs {
  const read = readPrefs();
  // A migrated record is written back the first time it is read, so a retired value such as
  // `advancedMode: true` leaves the browser now rather than at the next preference change.
  if (read.migrated) writePrefs(read.prefs);
  return read.prefs;
}

export function savePrefs(patch: Partial<UserPrefs>): void {
  const read = readPrefs();
  if (!read.writable) return; // a newer build's record: read-only here
  writePrefs({ ...read.prefs, ...patch });
}
