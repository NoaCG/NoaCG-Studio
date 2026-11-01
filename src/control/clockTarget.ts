// A CLOCK COUNTING DOWN TO A SET TIME (docs/work-specs/jev-svg-import/spec.md "Clock", AC-9).
//
// An imported clock in target-time mode counts down to one fixed instant: 7 pm tonight, or
// 2026-11-14 19:00 in Helsinki. This module turns what a person types (a time, an optional date,
// a zone) into that instant and its stored form; the graphic counts it on the match clock's own
// stamped countdown, so nothing downstream learns a second clock format.
//
// THE RULES (phase-10 notes, T1-T6):
//
//   T1  A bare time is the NEXT occurrence of that wall time in the zone: today if it is still
//       ahead, otherwise tomorrow. The answer says it was proposed, so a surface can confirm the
//       date and zone it chose.
//   T2  An explicit date is exactly that day. A past one stays expired: it never rolls forward.
//   T3  Midnight is the start of a day ("00:00", "12 am"); a bare midnight is the next one.
//   T4  A wall time the zone skips (a DST gap) has no instant, and one it repeats (a DST fold)
//       has two: neither resolves until the caller picks. A gap asks for another time; a fold
//       offers both instants and resolves with `fold: 'earlier' | 'later'`.
//   T5  The instant is the truth. It is stored as an RFC 9557 string with its zone
//       (`2026-11-14T19:00:00+02:00[Europe/Helsinki]`), and the wall time is never re-read.
//   T6  The graphic counts it as the match clock's existing stamped countdown: the seconds left
//       at a fixed origin, `"R@origin"` (templates/behaviours/clock.ts `clockTargetStart`). Every
//       reader paints R minus the seconds since the origin, so any resend, replay or reload reads
//       the same second, it reaches 0:00 on the instant, and a past instant shows 0:00.
//   T7  On the wire it is a fixed instant (control/matchClockWire.ts `fixedInstant`): no Take
//       restarts it, no Out holds it, and a Take or Update carrying any other value is answered
//       with the graphic's own start.
//
// Pure: the caller injects `now` and the zone, so every case is testable without a clock.

/** What a person typed. `date` is YYYY-MM-DD in the zone; `zone` an IANA name. */
export interface ClockTargetInput {
  time: string;
  date?: string;
  zone: string;
  /** Which of a DST fold's two instants: the first (summer time) or the second. */
  fold?: 'earlier' | 'later';
}

/** A wall time read in a zone. */
export interface Wall {
  date: string;
  time: string;
  zone: string;
}

export type ClockTargetResolution =
  | (Wall & {
      kind: 'resolved';
      /** The instant, epoch ms. */
      at: number;
      /** The zone's offset at that instant, `+02:00`. */
      offset: string;
      /** True when the date was proposed from a bare time (T1), never typed. */
      proposed: boolean;
      /** True when the instant is not after `now` (T2): it shows 0:00 and stays there. */
      expired: boolean;
    })
  | (Wall & { kind: 'gap' })
  | (Wall & { kind: 'fold'; earlier: number; later: number })
  | { kind: 'invalid'; reason: 'time' | 'date' | 'zone' };

const DAY = 86_400_000;

/** "19:00" · "7 pm" · "7:30pm" · "12 am" -> minutes after midnight, or null. */
export function parseTargetTime(raw: string): number | null {
  const text = String(raw ?? '').trim().toLowerCase().replace(/\./g, '');
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (!m) return null;
  let hours = Number(m[1]);
  const minutes = m[2] === undefined ? 0 : Number(m[2]);
  if (minutes > 59) return null;
  if (m[3]) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (m[3] === 'pm' ? 12 : 0);
  } else if (m[2] === undefined || hours > 23) {
    return null; // a bare "7" is not a time of day, and "24:00" is tomorrow's midnight
  }
  return hours * 60 + minutes;
}

/** "2026-11-14" -> [2026, 11, 14], or null for anything that is not a real calendar day. */
function parseDate(raw: string): [number, number, number] | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(raw ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d ? [y, mo, d] : null;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** The zone's formatter, or null for a name the runtime does not know. */
function zoneFormat(zone: string): Intl.DateTimeFormat | null {
  if (formatters.has(zone)) return formatters.get(zone)!;
  try {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(zone, f);
    return f;
  } catch {
    return null;
  }
}

/** The zone's wall clock at `at`, as if it were UTC: the offset is this minus `at`. */
function wallAsUtc(f: Intl.DateTimeFormat, at: number): number {
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(at)) if (part.type !== 'literal') p[part.type] = Number(part.value);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
}

function offsetAt(f: Intl.DateTimeFormat, at: number): number {
  const second = Math.floor(at / 1000) * 1000;
  return wallAsUtc(f, second) - second;
}

/** Every instant whose wall time in the zone is `wall` (UTC-read): none in a gap, two in a fold. */
function instantsOf(f: Intl.DateTimeFormat, wall: number): number[] {
  // Offsets either side of the wall time cover any one transition near it.
  const offsets = new Set([offsetAt(f, wall - DAY), offsetAt(f, wall), offsetAt(f, wall + DAY)]);
  const found = [...offsets].map((o) => wall - o).filter((at) => offsetAt(f, at) === wall - at);
  return [...new Set(found)].sort((a, b) => a - b);
}

function isoDate(wall: number): string {
  return new Date(wall).toISOString().slice(0, 10);
}

function isoTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function isoOffset(ms: number): string {
  const sign = ms < 0 ? '-' : '+';
  const total = Math.abs(Math.round(ms / 60_000));
  return `${sign}${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Resolve what a person typed to one instant, or say why it has none yet (T1-T4). */
export function resolveClockTarget(input: ClockTargetInput, now: number): ClockTargetResolution {
  const f = zoneFormat(input.zone);
  if (!f) return { kind: 'invalid', reason: 'zone' };
  const minutes = parseTargetTime(input.time);
  if (minutes === null) return { kind: 'invalid', reason: 'time' };
  const proposed = !input.date?.trim();
  let day: number;
  if (proposed) {
    const today = wallAsUtc(f, now);
    day = Date.UTC(new Date(today).getUTCFullYear(), new Date(today).getUTCMonth(), new Date(today).getUTCDate());
    // T1: tomorrow when today's has gone. A wall time the zone skips today is still today's.
    const todays = instantsOf(f, day + minutes * 60_000);
    if (todays.length > 0 && todays[todays.length - 1] <= now) day += DAY;
  } else {
    const ymd = parseDate(input.date!);
    if (!ymd) return { kind: 'invalid', reason: 'date' };
    day = Date.UTC(ymd[0], ymd[1] - 1, ymd[2]);
  }
  const wall = day + minutes * 60_000;
  const where: Wall = { date: isoDate(day), time: isoTime(minutes), zone: input.zone };
  // T1 on a fold day: a proposal is the next occurrence, so a repeat already gone is no choice.
  const instants = instantsOf(f, wall).filter((at, _, all) => !proposed || all.length < 2 || at > now);
  if (instants.length === 0) return { ...where, kind: 'gap' };
  if (instants.length > 1 && !input.fold) return { ...where, kind: 'fold', earlier: instants[0], later: instants[instants.length - 1] };
  const at = input.fold === 'later' ? instants[instants.length - 1] : instants[0];
  // The stored form keeps whole-minute offsets (T5); a historic local mean time has none.
  if ((wall - at) % 60_000 !== 0) return { kind: 'invalid', reason: 'date' };
  return { ...where, kind: 'resolved', at, offset: isoOffset(wall - at), proposed, expired: at <= now };
}

/** T5: the stored form, `2026-11-14T19:00:00+02:00[Europe/Helsinki]`. */
export function formatClockTarget(r: Extract<ClockTargetResolution, { kind: 'resolved' }>): string {
  return `${r.date}T${r.time}:00${r.offset}[${r.zone}]`;
}

/** The stored form's wall parts, as a person typed them: `{ date, time, zone }`, or null. */
export function splitClockTarget(raw: string | null | undefined): Wall | null {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}):00[+-]\d{2}:\d{2}\[([^\]]+)\]$/.exec(String(raw ?? '').trim());
  return m && parseClockTarget(raw) ? { date: m[1], time: m[2], zone: m[3] } : null;
}

/** The stored form read back: its instant and zone, or null. The offset fixes the instant (T5). */
export function parseClockTarget(raw: string | null | undefined): { at: number; zone: string } | null {
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2})\[([^\]]+)\]$/.exec(String(raw ?? '').trim());
  if (!m || !zoneFormat(m[2])) return null;
  const at = Date.parse(m[1]);
  return Number.isFinite(at) ? { at, zone: m[2] } : null;
}
