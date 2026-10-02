// THE PRODUCTION CONTROL PROFILE — how ONE production arranges the controls its graphics already
// declare (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6; the shape was reserved in
// docs/CONTROL_PANEL_ROAD.md §3 on 2026-08-28 and confirmed by the owner on 2026-09-03).
//
// THE LINE THIS FILE HOLDS. A profile may arrange, hide, rename, section and pin controls the
// graphics already expose. It may NEVER invent an event or change what a press does: a hidden
// control is still guarded by its machine, and a renamed one still greys by the same table.
//
// COMBINED CONTROLS WERE REMOVED on 2026-10-02 (owner ruling, after a production count found none
// in use). The format's second primitive, `combine` (named presses made of ordered steps), is no
// longer read, written or validated. A stored v1 profile that still carries a `combine` list is
// read without error and the list is ignored: an arrangement write or a publish (both canonical)
// drops it, while a sync or team merge that copies the record as-is may still carry it.
// One press airing several cues is a folder's "All together" (docs/PLAYOUT_DASHBOARD.md §2i).
//
// WHY IT LIVES ON THE SHOW rather than on the template: a library graphic is shared by many
// productions, and one show's taste must not churn a shared document or ride into its exports.
// `Show.bindings` set that precedent and this follows it exactly — production-scoped taste over
// graphic-owned contract, pinned onto `control_shows` at publish (migration 0058), and older
// builds read past it.
//
// TWO READERS OF THE SAME BYTES, with opposite jobs, and the split is deliberate:
//
//   `readShowProfile`  DEGRADES. It drops what it cannot use and never throws, because a
//                      production mid-programme must render what it can rather than stop.
//   `validateShowProfile` REFUSES. It reads the RAW value and reports every problem, because an
//                      authoring surface must not let a broken profile be saved in the first
//                      place. It cannot be built on the parse: the parse has already dropped the
//                      unknown key it would have to report.
//
// THIS MODULE IMPORTS NOTHING AT RUNTIME, and must stay that way. `scripts/control-profile.test.mjs`
// transpiles this one file with a single `ts.transpileModule` call (the `productionData.ts`
// pattern), so a runtime import would leave the format with no unit tests at all. Everything the
// validator needs to know about a production arrives as an argument (`ProfilePool`).

/**
 * The profile's OWN format stamp, beside `Show.version` rather than inside it. `Show.profile` is
 * an additive-optional field, and an additive optional field never bumps the record's version
 * (root `AGENTS.md` rule 6) — so the profile carries its own, and a later breaking change to the
 * profile's shape migrates HERE without touching every show that has no profile at all.
 *
 * Removing `combine` did not bump it: an older build reads a profile with no `combine` key as one
 * with an empty list, so the change is invisible to every build that might still open the record.
 */
export const PROFILE_VERSION = 1;

// ── ARRANGE ──────────────────────────────────────────────────────────────────────────────────

/**
 * How one production presents ONE declared control. Presentation over declared capability, and
 * nothing else: a HIDDEN control's event is still guarded by the machine, and a RENAMED one still
 * greys by the same table. Delete the profile and the generated panel is what remains.
 *
 * Every field is optional and an absent field means "as the graphic declared it", so an entry
 * that says nothing is dropped rather than stored (see `serializeShowProfile`).
 */
export interface ArrangeEntry {
  /** Position in its section. Lower first; controls with no `order` follow in declared order. */
  order?: number;
  /** The section heading this control sits under, overriding the machine's own `section`. */
  section?: string;
  /** The name the OPERATOR reads. Absent = the control's declared label. */
  name?: string;
  /**
   * Out of the panel's flow. Still legal, still guarded — just not in the way.
   *
   * Every surface puts these behind ONE collapsed "More" rather than dropping them, and that is
   * the deliberate reading of "hidden": a production hiding a control is saying "not in my way",
   * which is not the same as saying it is gone. The machine still accepts the event, so an
   * operator who turns out to need it mid-show reaches it in one click instead of going back to
   * the authoring panel — which on the hosted page means going back to a laptop they may not
   * have. `hidden` beats `pinned` where a hand-edited profile carries both.
   */
  hidden?: boolean;
  /** Above the fold, in the handful this show actually uses (the football principle: the
   *  operator should understand football, not the graphics software). */
  pinned?: boolean;
}

/**
 * ARRANGE: pool-graphic name -> control id -> presentation.
 *
 * The control id is the machine button's `event` name (`blocks/animMachine.ts` `ControlButton`).
 */
export type ProfileArrange = Record<string, Record<string, ArrangeEntry>>;

/** A production's whole profile. */
export interface ShowProfile {
  v: typeof PROFILE_VERSION;
  arrange: ProfileArrange;
}

/** A profile that changes nothing. Serializes to the same bytes every time, so an untouched
 *  profile is one shape to read rather than two. */
export function emptyProfile(): ShowProfile {
  return { v: PROFILE_VERSION, arrange: {} };
}

// ── Reading (the degrading half) ─────────────────────────────────────────────────────────────

/**
 * What a stored value turned out to be.
 *
 * `read-only` is the case the root version invariant exists for: a profile a NEWER build wrote.
 * Its bytes are handed back verbatim so that writing the record out again cannot destroy them,
 * and every editing surface must refuse to change it. Dropping it instead would be the quiet
 * data loss the invariant names — an older build opening a show once would erase a profile it
 * simply did not understand.
 */
export type ProfileRead =
  | { status: 'ok'; profile: ShowProfile }
  | { status: 'read-only'; version: number; raw: unknown }
  | { status: 'none' };

/**
 * THE MIGRATE-ON-READ GUARD. Never throws, whatever it is handed — a renderer on air must not be
 * stopped by a malformed profile, and `readLiveCue` in `control/hostedControl.ts` degrades the
 * same way for the same reason.
 *
 * It DROPS rather than refuses: an unknown key, a wrongly typed field, and a removed `combine`
 * list all disappear, and what is left renders. `validateShowProfile` is the half that reports
 * problems (today only its unit test calls it; the Controls panel writes through
 * `withGraphicArrange`, which cannot produce an unknown key).
 */
export function readShowProfile(value: unknown): ProfileRead {
  if (!isObject(value)) return { status: 'none' };
  const v = (value as { v?: unknown }).v;
  // No usable version stamp is garbage rather than a future format: there are no bytes here
  // worth preserving, and calling it read-only would make a stray `{}` un-authorable forever.
  if (typeof v !== 'number' || !Number.isFinite(v)) return { status: 'none' };
  // v1 is the FIRST version, so anything that is not 1 was written by a build this one does not
  // know. When v2 arrives its migration step goes here, above this line, and only versions past
  // the newest one this build understands fall through to read-only.
  if (v !== PROFILE_VERSION) return { status: 'read-only', version: v, raw: value };
  return { status: 'ok', profile: { v: PROFILE_VERSION, arrange: readArrange((value as { arrange?: unknown }).arrange) } };
}

function readArrange(value: unknown): ProfileArrange {
  if (!isObject(value)) return {};
  const out: ProfileArrange = {};
  for (const [graphic, controls] of Object.entries(value)) {
    if (!graphic || !isObject(controls)) continue;
    const kept: Record<string, ArrangeEntry> = {};
    for (const [control, raw] of Object.entries(controls)) {
      if (!control || !isObject(raw)) continue;
      const entry = readArrangeEntry(raw);
      // An entry that says nothing is not stored: "as the graphic declared it" is an ABSENCE,
      // so an empty entry and a missing one must not be two ways to mean one thing.
      if (Object.keys(entry).length > 0) put(kept, control, entry);
    }
    if (Object.keys(kept).length > 0) put(out, graphic, kept);
  }
  return out;
}

function readArrangeEntry(raw: Record<string, unknown>): ArrangeEntry {
  const entry: ArrangeEntry = {};
  if (typeof raw.order === 'number' && Number.isFinite(raw.order)) entry.order = raw.order;
  if (typeof raw.section === 'string' && raw.section) entry.section = raw.section;
  if (typeof raw.name === 'string' && raw.name) entry.name = raw.name;
  if (raw.hidden === true) entry.hidden = true;
  if (raw.pinned === true) entry.pinned = true;
  return entry;
}

/**
 * THE PROFILE A SURFACE MAY RENDER FROM, whatever it was handed: the published column
 * (`control_shows.profile`, migration 0058), a `Show.profile` off the record, or bytes read back
 * from an export.
 *
 * BOTH "no profile" and "a profile this build cannot read" answer null, and that is the honest
 * degradation rather than a shortcut: a surface may render only a profile it fully understands,
 * and falling back to the generated panel is exactly what deleting a profile does — so an operator
 * meeting a profile from a newer build gets a panel that works rather than one that is wrong.
 *
 * EVERY RENDERER ASKS THIS, and none of them reads `show.profile` straight. Two used to: the
 * in-app production page arranged its ⚡ block from the raw value and the exporter BAKED the raw
 * value into a package, so a newer build's profile — read-only at both write doors and correctly
 * ignored on the hosted page — still ordered, renamed and hid buttons on the other two. One show
 * rendering two different panels on two surfaces is the exact case this function exists to
 * prevent, and it prevents it only where it is called.
 *
 * It lives HERE rather than beside the publish call because it is a question about the format, and
 * because `hostedControl.ts` is not a leaf module — a test that reached the normalizer through it
 * would drag the whole Supabase and asset graph in behind it.
 */
export function readPublishedProfile(value: unknown): ShowProfile | null {
  const read = readShowProfile(value);
  return read.status === 'ok' ? read.profile : null;
}

// ── Serializing (the canonical half) ─────────────────────────────────────────────────────────

/**
 * THE CANONICAL FORM. Two profiles that mean the same thing produce the same
 * `JSON.stringify(serializeShowProfile(p))`, byte for byte — which is what lets a test compare
 * profiles as text, a sync layer see "unchanged" as unchanged, and a reviewer read a diff that
 * only shows what an operator actually did.
 *
 * CANONICAL IS ORDERED NORMALIZATION. Dropping is `readShowProfile`'s job and happens here by
 * CALLING it — an empty entry, a `hidden: false`, a removed `combine` list. This function then
 * only puts what survived into one fixed key order (JavaScript preserves string-key insertion
 * order, so building the object in order is what fixes the bytes) with names sorted. One reader
 * deciding what a valid profile is means serializing and reading back can never disagree.
 *
 * This is what a save path writes and what `publishControlShow` pins.
 */
export function serializeShowProfile(profile: ShowProfile): ShowProfile {
  const read = readShowProfile(profile);
  // A `ShowProfile` is v1 by its type, so anything else is a caller handing over something it
  // said was a profile and was not. An empty canonical profile is the answer that cannot lie.
  if (read.status !== 'ok') return emptyProfile();
  return { v: PROFILE_VERSION, arrange: orderArrange(read.profile.arrange) };
}

/**
 * THE BYTES A PUBLISH PINS (`control_shows.profile`) for whatever the record holds: the canonical
 * form when this build reads it, so a removed `combine` list never reaches the column; the raw
 * bytes when a newer build wrote it, which this build must not rewrite; and `{}`, the column's
 * own default, for no profile.
 */
export function profileForPublish(value: unknown): unknown {
  const read = readShowProfile(value);
  if (read.status === 'ok') return serializeShowProfile(read.profile);
  return read.status === 'read-only' ? read.raw : {};
}

function orderArrange(arrange: ProfileArrange): ProfileArrange {
  const out: ProfileArrange = {};
  for (const graphic of Object.keys(arrange).sort()) {
    const controls = arrange[graphic];
    const kept: Record<string, ArrangeEntry> = {};
    for (const control of Object.keys(controls).sort()) put(kept, control, orderEntry(controls[control]));
    put(out, graphic, kept);
  }
  return out;
}

/** The five presentation keys in one order. Reading has already dropped the absent ones. */
function orderEntry(entry: ArrangeEntry): ArrangeEntry {
  const out: ArrangeEntry = {};
  if (entry.order !== undefined) out.order = entry.order;
  if (entry.section !== undefined) out.section = entry.section;
  if (entry.name !== undefined) out.name = entry.name;
  if (entry.hidden !== undefined) out.hidden = entry.hidden;
  if (entry.pinned !== undefined) out.pinned = entry.pinned;
  return out;
}

/**
 * A profile with ONE graphic's arrangement replaced, canonical.
 *
 * The one door an authoring surface needs for ARRANGE, and it lives here rather than in that
 * surface for the reason `own()` and `put()` below exist: a pool graphic's name is somebody's
 * typed text, so the obvious `{ ...profile.arrange, [graphic]: entries }` sets the PROTOTYPE for
 * a production with a graphic called `__proto__` and the entry silently vanishes. One door means
 * one place that knows.
 *
 * An EMPTY map removes the graphic's key entirely rather than storing `{}`. "As the graphic
 * declared it" is an absence everywhere else in this format, and two shapes meaning one thing is
 * what makes a diff lie about what an operator did.
 *
 * It takes `undefined` for "this production has no profile yet", so a surface authoring the first
 * arrangement does not have to mint an empty profile of its own.
 */
export function withGraphicArrange(
  profile: ShowProfile | undefined,
  graphic: string,
  entries: Record<string, ArrangeEntry>,
): ShowProfile {
  const read = readShowProfile(profile);
  const base = read.status === 'ok' ? read.profile : emptyProfile();
  const arrange: ProfileArrange = {};
  for (const [name, existing] of Object.entries(base.arrange)) {
    if (name !== graphic) put(arrange, name, existing);
  }
  if (Object.keys(entries).length > 0) put(arrange, graphic, entries);
  // Canonical on the way out, so the caller cannot store two spellings of one arrangement — and
  // so an entry that says nothing, a `hidden: false`, and a graphic whose every entry was
  // cleared all disappear by the format's own rules rather than by the surface remembering to.
  return serializeShowProfile({ v: PROFILE_VERSION, arrange });
}

// ── Validating (the refusing half) ───────────────────────────────────────────────────────────

/**
 * What the production can offer, as the caller already knows it. Passed IN rather than imported,
 * which is what keeps this module dependency-free and its unit test a single transpile.
 */
export interface ProfilePool {
  /** Pool graphic name -> the control ids that graphic DECLARES, i.e.
   *  `machineControls(machine).map((b) => b.event)`. */
  controls: Record<string, string[]>;
}

export interface ProfileFinding {
  level: 'error' | 'warning';
  /** Where it is, for the authoring surface to point at: `arrange["Totals board"].reveal`. */
  where: string;
  message: string;
}

const ARRANGE_KEYS: readonly string[] = ['order', 'section', 'name', 'hidden', 'pinned'];

/**
 * THE STRICT READER. It takes the RAW stored value, never a parsed profile — that is the point:
 * `readShowProfile` has already dropped the unknown key this has to report, so validating the
 * parse could only ever say "fine".
 *
 * An ARRANGE entry that matches nothing is a WARNING rather than an error, because it is inert
 * presentation and a renamed graphic must degrade rather than break a production mid-show. A
 * legacy `combine` list is not reported at all: it is ignored on read, so it can do no harm.
 */
export function validateShowProfile(value: unknown, pool: ProfilePool): ProfileFinding[] {
  const findings: ProfileFinding[] = [];
  const error = (where: string, message: string) => findings.push({ level: 'error', where, message });
  const warn = (where: string, message: string) => findings.push({ level: 'warning', where, message });

  if (!isObject(value)) {
    error('profile', 'This is not a control profile — a profile is an object carrying `v` and `arrange`.');
    return findings;
  }
  const row = value as { v?: unknown; arrange?: unknown };
  if (typeof row.v !== 'number' || !Number.isFinite(row.v)) {
    error('profile.v', 'The profile carries no version stamp, so nothing can say which shape it is in.');
    return findings;
  }
  if (row.v !== PROFILE_VERSION) {
    // The cause is only knowable in one direction. A HIGHER version was written by a newer build;
    // a lower or fractional one is a corrupted record or a hand edit, and telling that operator to
    // go and find a newer build would point them at the wrong thing entirely.
    const why =
      Number.isInteger(row.v) && row.v > PROFILE_VERSION
        ? 'It was written by a newer build, so it is read-only here and must not be edited.'
        : 'No build ever wrote that version, so the record is damaged. It is read-only here rather than repaired, because a guess about what it meant could destroy it.';
    error('profile.v', `This profile is version ${row.v} and this build understands version ${PROFILE_VERSION}. ${why}`);
    return findings;
  }

  validateArrange(row.arrange, pool, error, warn);
  return findings;
}

type Report = (where: string, message: string) => void;

function validateArrange(value: unknown, pool: ProfilePool, error: Report, warn: Report): void {
  if (value === undefined) return;
  if (!isObject(value)) {
    error('arrange', '`arrange` must be an object of pool-graphic name -> control id -> presentation.');
    return;
  }
  for (const [graphic, controls] of Object.entries(value)) {
    const at = `arrange[${JSON.stringify(graphic)}]`;
    const declared = declaredControls(pool, graphic);
    if (!declared) {
      warn(at, `No graphic named "${graphic}" is in this production. Its arrangement is ignored, and the panel falls back to what the machine generates.`);
    }
    if (!isObject(controls)) {
      error(at, 'Each graphic\'s arrangement must be an object of control id -> presentation.');
      continue;
    }
    for (const [control, entry] of Object.entries(controls)) {
      const here = `${at}.${control}`;
      if (declared && !declared.includes(control)) {
        warn(here, `"${graphic}" declares no control called "${control}". The entry is ignored, and that control keeps whatever the machine gave it.`);
      }
      validateArrangeEntry(entry, here, error);
    }
  }
}

function validateArrangeEntry(value: unknown, at: string, error: Report): void {
  if (!isObject(value)) {
    error(at, 'An arrangement entry must be an object of order, section, name, hidden and pinned.');
    return;
  }
  const entry = value as Record<string, unknown>;
  for (const key of Object.keys(entry)) {
    // A key nobody declared is a capability smuggled past the format, so it is refused by name.
    if (!ARRANGE_KEYS.includes(key)) {
      error(`${at}.${key}`, `An arrangement carries only order, section, name, hidden and pinned. "${key}" is not one of them.`);
    }
  }
  if (entry.order !== undefined && (typeof entry.order !== 'number' || !Number.isFinite(entry.order))) {
    error(`${at}.order`, '`order` must be a number.');
  }
  if (entry.section !== undefined && typeof entry.section !== 'string') error(`${at}.section`, '`section` must be a name.');
  if (entry.name !== undefined && typeof entry.name !== 'string') error(`${at}.name`, '`name` must be a name.');
  if (entry.hidden !== undefined && typeof entry.hidden !== 'boolean') error(`${at}.hidden`, '`hidden` is on or off.');
  if (entry.pinned !== undefined && typeof entry.pinned !== 'boolean') error(`${at}.pinned`, '`pinned` is on or off.');
}

// ── The small shared guards ──────────────────────────────────────────────────────────────────

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Read a key a USER named, without inheriting `Object.prototype`'s members.
 *
 * Every key in this format is somebody's typed name - a graphic, a control id - so a plain
 * `map[name]` answers a FUNCTION for a graphic called `constructor` or `toString`. Measured: that
 * made `validateShowProfile` throw instead of reporting findings, so an authoring surface crashed
 * rather than refusing.
 */
function own<T>(map: Record<string, T> | undefined, key: string): T | undefined {
  if (!map || !Object.prototype.hasOwnProperty.call(map, key)) return undefined;
  return map[key];
}

/**
 * Add a key to a map being built, without `__proto__` setting the prototype instead of a key -
 * the write-side twin of `own`, and the reason a graphic named `__proto__` cannot vanish.
 *
 * EXPORTED because the surfaces that AUTHOR a profile build these maps before this module ever
 * sees them: the Controls panel assembles a whole graphic's entries key by key, and a bare
 * `map[control] = entry` there loses a control called `__proto__` with no error at all, which
 * reads as a panel reporting a save that stored nothing. One guard, wherever a user-named key is
 * written.
 */
export function put<T>(map: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(map, key, { value, enumerable: true, writable: true, configurable: true });
}

/** The control ids a pool graphic declares, or undefined when the production has no such
 *  graphic - which is a WARNING for an arrangement. */
function declaredControls(pool: ProfilePool, graphic: string): string[] | undefined {
  const declared = own(pool.controls, graphic);
  return Array.isArray(declared) ? declared : undefined;
}
