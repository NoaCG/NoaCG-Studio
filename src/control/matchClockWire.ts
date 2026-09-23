// CLOCKS ON THE WIRE (docs/CLOUD_PLAYOUT.md §3, docs/SPORTS_PACK.md).
//
// Two halves, one doctrine. The first is the MATCH CLOCK — one clock, started and stopped by the
// operator. The second, at the bottom of this file, is the debate board's pair of SPEAKING
// CLOCKS, which alternate; it reuses every primitive here and adds no new idea, only a second
// shape. What follows is the match clock's story, and it is the story of both.
//
// A match clock is the one piece of a graphic whose truth is a moving number, and a moving
// number cannot be recovered from a snapshot of the commands that moved it. Until 2026-08-19 it
// was not recovered at all: every renderer kept its own counter and incremented it once a
// second, so a browser source RELOADED at 67 minutes came back at 0:00, two renderers started a
// second apart stayed a second apart for the whole match, and a renderer in a background tab
// (Chromium throttles those timers to roughly one a minute) simply fell behind.
//
// THE FIX IS A TIME ORIGIN, and this module is the wire half of it: the clock's value carries
// the instant it was true, appended as `"45:00@1755600000000"`. The template runtime
// (templates/shared/matchClock.ts) paints `value ± elapsed` from that, so
//
//   - two renderers reading the same string paint the same second, whenever they read it;
//   - a re-send is idempotent, which matters because every Take and ✎ Update re-sends the cue's
//     whole value set — a raw counter snapshot pulled the clock backwards on every score bump;
//   - a renderer that boots into the middle of a match derives the right time from the value
//     alone, with no history to replay and no second message to wait for.
//
// **The stamp is DERIVED, never invented.** It is the `clockStart` row's own server time, which
// every renderer sees identically and which a boot-time replay of the log reconstructs exactly —
// so there is no authority to elect and nothing to keep in sync. A locally-authored row (an
// offline production's own commands) has no server time and falls back to the local clock,
// which is correct there because that log has exactly one renderer.
//
// Everything here is pure string work over the PUBLISHED html, so no design has to declare
// anything: the clock element is the one the template contract already names
// (`.<prefix>-clock`), and its field id and count direction are read off it.

import type { ControlEventRow } from './hostedControl';

/** What a published graphic's clock IS, read from its own markup. */
export interface ClockSpec {
  /** The field id the clock element carries (`f5`), i.e. the key its value rides under. */
  field: string;
  /** `data-count="down"` — a design decision, never an operator one. */
  countsDown: boolean;
  /** The clock's value before the wire has said anything: `data-start`, else the element's own
   *  initial text. Mirrors the runtime's `initMatchClock`. */
  seed: string;
  /** What `resetMatchClock` returns to — `data-start`, else ZERO, which is what the runtime
   *  actually does. It is deliberately not `seed`: at reset time the element's text is the
   *  RUNNING time, so falling back to it would reset a clock to wherever it had got to. The two
   *  differ only on a clock element with no `data-start`, which the scoreboard emitter never
   *  produces (it always writes the attribute and the text together). */
  resetTo: string;
}

/**
 * Read the clock out of a published graphic's html, or null for a graphic with no clock (which
 * is most of them). Uses DOMParser rather than a regex: attribute order is not something a
 * generated template promises, and a clock silently missed here is a clock that quietly stops
 * recovering.
 */
export function clockSpecFromHtml(html: string): ClockSpec | null {
  if (!html || html.indexOf('-clock') === -1) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  } catch {
    return null;
  }
  const el = [...doc.body.querySelectorAll<HTMLElement>('[class]')].find((node) =>
    [...node.classList].some((c) => c.endsWith('-clock')),
  );
  if (!el || !el.id) return null;                  // a readout with no field id is not on the wire
  const dataStart = el.getAttribute('data-start');
  return {
    field: el.id,
    countsDown: el.getAttribute('data-count') === 'down',
    seed: dataStart || (el.textContent ?? '').trim(),
    resetTo: dataStart || '0',
  };
}

/** The value without its origin stamp — what a person reads, and what a held clock sends. */
export function plainClockValue(raw: string | undefined | null): string {
  const text = String(raw ?? '').trim();
  const at = text.indexOf('@');
  return at === -1 ? text : text.slice(0, at).trim();
}

/** The origin stamp in epoch ms, or null for a held value. A stamp that is not a number reads
 *  as absent: a broken stamp must degrade to a held clock showing the right time. */
export function clockOriginOf(raw: string | undefined | null): number | null {
  const text = String(raw ?? '');
  const at = text.indexOf('@');
  if (at === -1) return null;
  const stamp = Number.parseInt(text.slice(at + 1), 10);
  return Number.isFinite(stamp) && stamp > 0 ? stamp : null;
}

/** "45:00" -> 2700 · "90" -> 90. The template's own parser, kept identical on purpose. */
export function clockSeconds(raw: string | undefined | null): number {
  const parts = plainClockValue(raw).split(':');
  const mins = Number.parseInt(parts[0], 10) || 0;
  if (parts.length < 2) return Math.max(0, mins);
  return Math.max(0, mins * 60 + (Number.parseInt(parts[1], 10) || 0));
}

/** 2700 -> "45:00". Minutes are never zero-padded (broadcast reads "7:05"); seconds always are. */
export function formatClock(total: number): string {
  const safe = total < 0 ? 0 : total;
  const s = safe % 60;
  return `${Math.floor(safe / 60)}:${s < 10 ? `0${s}` : s}`;
}

/**
 * What the clock field's held value becomes when an `update` row writes it.
 *
 * THE ORIGIN MUST SURVIVE A RESEND. Every Take and ✎ Update sends the cue's WHOLE value set, and
 * a cue stores a PLAIN time — so five minutes into a match, a score bump re-sends `"10:00"` over
 * a held `"10:00@1755600000000"`. Merging that blindly threw the origin away: the next clockStop
 * banked the seed instead of the running time, and a renderer booting from the report came back
 * at the seed too — both of them the very things the origin was added to prevent.
 *
 * The rule is the one the runtime already states: what distinguishes a CORRECTION from a resend
 * is that the value the wire carries CHANGED. It is compared against the held value's plain half
 * precisely because the origin write is ours, not the operator's — the operator's `"10:00"` has
 * not changed just because we stamped it.
 *
 * The honest limit, unchanged from the runtime's: an operator cannot re-apply the time the clock
 * already started from. No control surface can express that anyway (the field holds that text, so
 * there is no edit to send), and returning to a known value is `clockReset`'s job.
 */
export function clockValueAfterUpdate(held: string | undefined, incoming: string): string {
  if (clockOriginOf(incoming) !== null) return incoming;         // a stamped value always wins
  if (held === undefined || clockOriginOf(held) === null) return incoming;
  return plainClockValue(held) === plainClockValue(incoming) ? held : incoming;
}

/** What a clock reads at `now`: the held value, or the origin value plus the seconds since. */
export function clockValueAt(raw: string | undefined | null, countsDown: boolean, now: number): string {
  const origin = clockOriginOf(raw);
  const base = clockSeconds(raw);
  if (origin === null) return formatClock(base);
  const elapsed = Math.max(0, Math.floor((now - origin) / 1000));
  return formatClock(countsDown ? Math.max(0, base - elapsed) : base + elapsed);
}

/** Start the clock from where it stands: the value it reads at `at`, stamped with `at`. */
export function startedClockValue(raw: string | undefined | null, countsDown: boolean, at: number): string {
  return `${clockValueAt(raw, countsDown, at)}@${at}`;
}

/** Hold the clock where it stands at `at` — the derived time, banked as a plain value. */
export function heldClockValue(raw: string | undefined | null, countsDown: boolean, at: number): string {
  return clockValueAt(raw, countsDown, at);
}

/** When a row was written, for stamping. Server rows carry `created_at` and every renderer reads
 *  the same one; a locally-authored row has none and there is only one renderer to agree with. */
export function rowInstant(createdAt: string | undefined, fallback: number): number {
  if (!createdAt) return fallback;
  const at = Date.parse(createdAt);
  return Number.isFinite(at) ? at : fallback;
}

/** What one log row does to the clock. */
export interface ClockEffect {
  /** The clock field's value after this row. */
  value: string;
  /**
   * WHEN the renderer must write it, relative to forwarding the row itself.
   *
   * `before` for a START: the shared origin has to be in the document by the time
   * `startMatchClock` runs, or the runtime mints a LOCAL one and this renderer's clock ends up
   * anchored a network hop away from every other renderer's — which is the drift the origin
   * exists to remove.
   *
   * `after` for a hold or a reset: the value being banked is what the graphic has just settled
   * on, so it follows the event that settled it.
   */
  when: 'before' | 'after';
}

/**
 * THE ONE PLACE A LOG ROW IS READ AS A CLOCK MOVE. Pure on purpose: the renderer that uses it
 * (`output/main.ts`) only runs against a live backend, so a decision left inside its boot
 * closure could not be driven by any offline spec — and this is the live-broadcast half of the
 * fix, where "which event stamps what, and in which order" is exactly where a bug would hide.
 *
 * `held` is the clock field's CURRENT value on the wire — normally whatever the last Take or ✎
 * Update carried, which is why a start resumes from where the clock stands rather than from the
 * design's seed. Absent (nothing has been sent for this graphic yet), the design's own seed
 * stands in. `now` is only the fallback instant for a locally-authored row; a server row's own
 * `created_at` always wins, because that is the value every renderer agrees on.
 *
 * Returns null for every row that does not move the clock — which is nearly all of them.
 */
export function clockRowEffect(
  row: Pick<ControlEventRow, 'msg' | 'created_at'>,
  clock: ClockSpec,
  held: string | undefined,
  now: number,
): ClockEffect | null {
  if (row.msg.t !== 'event') return null;
  const at = rowInstant(row.created_at, now);
  const from = held ?? clock.seed;
  switch (row.msg.event) {
    case 'clockStart':
      return { value: startedClockValue(from, clock.countsDown, at), when: 'before' };
    case 'clockStop':
      return { value: heldClockValue(from, clock.countsDown, at), when: 'after' };
    // Reset banks `resetTo` — what the RUNTIME returns to — rather than what the element happens
    // to read, because the two must record the same number or a reboot after a reset would
    // recover a different time from the one on air.
    case 'clockReset':
      return { value: clock.resetTo, when: 'after' };
    default:
      return null;
  }
}

// ═══ THE SPEAKING CLOCKS ON THE WIRE (docs/CLOUD_PLAYOUT.md §3, types/speakingTimer.ts) ═══
//
// A debate board runs TWO clocks and exactly one of them at a time, so everything above applies
// twice — and the hard part is not the arithmetic, it is "which one is running". That is the
// floor group's pointer, which is MACHINE state, and the wire must not learn to read machine
// graphs to find it.
//
// IT DOES NOT HAVE TO. **The stamp IS the pointer.** The invariant this half keeps is a property
// of the wire's own values, not of any state graph:
//
//     at most one of the two clock fields carries an origin stamp, and that one is running.
//
// From there every verb is arithmetic over a PAIR: `switch` banks the stamped clock as a plain
// time and stamps the other one; with neither stamped it stamps the first, because somebody has
// to open. `penalty` docks whichever clock is stamped. `reset` returns both to the allowance,
// plain. Going off air banks the stamped one. No state id is named here and no edge is read: the
// alternation lives in the two values themselves.
//
// It agrees with the machine because both describe the same two-sided board — the floor group's
// `armed | speakerA | speakerB` under `switch` is the same three-way alternation as
// `neither | a | b` under a moving stamp — and because the DESIGN'S OWN ENGINE
// (`scoreboards/debateFloor.ts`) already decides it that way: `debateStart(side)` holds whoever
// was running and picks the other up from its own number. If that engine ever stops alternating,
// this stops being right, which is why the two are pinned by one spec rather than by a comment.
//
// THE STAMP DOES NOT COME OFF AT ZERO. A speaker who runs out keeps the floor — the engine keeps
// `debateActive` set with the timer stopped — so dropping the stamp there would hand the next
// `switch` to the wrong side. `speakingSecondsAt` floors at zero instead, and a stamped "00:00"
// reads 00:00 however long it is left there.

/**
 * A published debate board's two clocks, read off its own markup.
 *
 * Unlike the match clock there is no pre-existing class contract to read (`.<prefix>-clock` is
 * the SINGLE clock's name, and a board answering to it would be mistaken for one), so the design
 * DECLARES its clocks with one attribute vocabulary: `data-speaking="a" | "b" | "allowance" |
 * "penalty"`. One word to grep for, one reader, and nothing about the type registry or the
 * machine reaches in here.
 */
export interface SpeakingClockPair {
  /** The field ids the two clocks ride under. `a` is whoever opens when nobody has the floor. */
  fieldA: string;
  fieldB: string;
  /** Each clock's value before the wire has said anything — the element's own initial text. */
  seedA: string;
  seedB: string;
  /** The field holding the per-speaker allowance both clocks reset TO, and its initial text.
   *  The field wins wherever the wire carries one: the chair can retype the allowance. */
  allowanceField: string | null;
  allowanceSeed: string;
  /** The field holding one penalty's size in whole seconds, and its initial text. */
  penaltyField: string | null;
  penaltySeed: string;
}

/** What a board with no readable allowance falls back to — the engine's own default. */
const SPEAKING_ALLOWANCE_FALLBACK = 300;
/** …and its default penalty, for the same reason. */
const SPEAKING_PENALTY_FALLBACK = 10;

/**
 * Read the two speaking clocks out of a published graphic's html, or null for the graphics that
 * have none — which is nearly all of them. DOMParser rather than a regex, for the reason the
 * match clock's reader gives: attribute order is not something a generated template promises,
 * and a clock silently missed here is a clock that quietly stops recovering.
 *
 * A board declaring only one side is refused whole: half a pair cannot alternate, and guessing
 * the other half would put a wrong number on air rather than none.
 */
export function speakingClocksFromHtml(html: string): SpeakingClockPair | null {
  if (!html || html.indexOf('data-speaking') === -1) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  } catch {
    return null;
  }
  const byRole = new Map<string, HTMLElement>();
  for (const node of doc.body.querySelectorAll<HTMLElement>('[data-speaking]')) {
    const role = node.getAttribute('data-speaking') ?? '';
    if (role && !byRole.has(role)) byRole.set(role, node);
  }
  const a = byRole.get('a');
  const b = byRole.get('b');
  if (!a?.id || !b?.id) return null;             // a readout with no field id is not on the wire
  const text = (el: HTMLElement | undefined): string => (el?.textContent ?? '').trim();
  const allowance = byRole.get('allowance');
  const penalty = byRole.get('penalty');
  return {
    fieldA: a.id,
    fieldB: b.id,
    seedA: text(a),
    seedB: text(b),
    allowanceField: allowance?.id || null,
    allowanceSeed: text(allowance),
    penaltyField: penalty?.id || null,
    penaltySeed: text(penalty),
  };
}

/** "05:00" — both halves padded, which is what a debate board paints and what the engine's own
 *  `debateFormat` writes. (The match clock's `formatClock` leaves the minutes unpadded, because
 *  broadcast reads a match time as "7:05"; a speaking clock reads "07:05".) */
export function formatSpeakingClock(total: number): string {
  const safe = total < 0 ? 0 : total;
  const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));
  return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`;
}

/** How many seconds a speaking clock has left at `now`: its plain value, less the time since its
 *  origin. A speaking clock only ever counts DOWN, and never past zero. */
export function speakingSecondsAt(raw: string | undefined | null, now: number): number {
  const base = clockSeconds(raw);
  const origin = clockOriginOf(raw);
  if (origin === null) return base;
  return Math.max(0, base - Math.max(0, Math.floor((now - origin) / 1000)));
}

/** What a speaking clock READS at `now` — a plain time, whether or not it was stamped. */
export function speakingClockAt(raw: string | undefined | null, now: number): string {
  return formatSpeakingClock(speakingSecondsAt(raw, now));
}

/** Which side holds the floor, according to the wire alone: the stamped one. `a` settles a tie
 *  the invariant forbids, so the answer never depends on which field was read first. */
export function runningSpeakingSide(
  clocks: SpeakingClockPair,
  held: Record<string, string> | undefined,
): 'a' | 'b' | null {
  if (clockOriginOf(held?.[clocks.fieldA]) !== null) return 'a';
  if (clockOriginOf(held?.[clocks.fieldB]) !== null) return 'b';
  return null;
}

/** What one log row does to the two clocks: the field values it settles, and whether they must be
 *  written before or after the row itself. The two `when`s mean what the match clock's mean. */
export interface SpeakingClockEffect {
  values: Record<string, string>;
  when: 'before' | 'after';
}

/**
 * THE ONE PLACE A LOG ROW IS READ AS A MOVE OF A DEBATE'S TWO CLOCKS. Pure for the reason the
 * match clock's is: the renderer that uses it only runs against a live backend, so a decision
 * left inside its boot closure could be driven by no offline spec at all.
 *
 * `held` is the graphic's whole merged value set, because three of its fields matter here — the
 * two clocks, the allowance and the penalty size — and every one of them can be retyped
 * mid-debate. Each falls back to the design's own seed only until the wire has said something.
 *
 * Returns null for every row that does not move a clock, which is nearly all of them.
 */
export function speakingClockRowEffect(
  row: Pick<ControlEventRow, 'msg' | 'created_at'>,
  clocks: SpeakingClockPair,
  held: Record<string, string> | undefined,
  now: number,
): SpeakingClockEffect | null {
  const at = rowInstant(row.created_at, now);
  const fieldOf = (side: 'a' | 'b'): string => (side === 'a' ? clocks.fieldA : clocks.fieldB);
  const valueOf = (side: 'a' | 'b'): string =>
    held?.[fieldOf(side)] ?? (side === 'a' ? clocks.seedA : clocks.seedB);
  const running = runningSpeakingSide(clocks, held);

  // Off air nobody holds the floor: the engine's `holdClocks` freezes the running clock where it
  // stands, so the wire banks the same number. Without this a board taken down mid-speech keeps
  // its stamp, and a renderer booting an hour later paints a clock that "ran" while off air.
  if (row.msg.t === 'stop') {
    if (!running) return null;
    return { values: { [fieldOf(running)]: speakingClockAt(valueOf(running), at) }, when: 'after' };
  }
  if (row.msg.t !== 'event') return null;

  switch (row.msg.event) {
    case 'switch': {
      // The outgoing clock stops exactly where it was; the incoming one picks up from its OWN
      // number — the whole point of two clocks is that an interrupted speaker keeps the time.
      // BEFORE the event, so the stamp is in the document by the time the machine's
      // `runSpeakerA`/`runSpeakerB` reads the element, exactly as a match clock's start is.
      const next: 'a' | 'b' = running === 'a' ? 'b' : 'a';
      const values: Record<string, string> = {};
      if (running) values[fieldOf(running)] = speakingClockAt(valueOf(running), at);
      values[fieldOf(next)] = `${speakingClockAt(valueOf(next), at)}@${at}`;
      return { values, when: 'before' };
    }
    case 'penalty': {
      // A penalty is a deduction, not a stoppage: the docked clock keeps running, just shorter,
      // so it is re-stamped at the same instant. With nobody speaking there is nothing to dock,
      // which is what the engine's `applyPenalty` also does. AFTER, because the engine docks it
      // too — writing first would dock it twice.
      if (!running) return null;
      const cost = Number.parseInt(held?.[clocks.penaltyField ?? ''] ?? clocks.penaltySeed, 10)
        || SPEAKING_PENALTY_FALLBACK;
      const left = Math.max(0, speakingSecondsAt(valueOf(running), at) - cost);
      return { values: { [fieldOf(running)]: `${formatSpeakingClock(left)}@${at}` }, when: 'after' };
    }
    case 'reset': {
      // Both back to the allowance, neither running — and the allowance is the one the chair has
      // on screen, not the design's seed, because the figure the audience reads is the figure
      // Reset promised them.
      const full = clockSeconds(held?.[clocks.allowanceField ?? ''] ?? clocks.allowanceSeed)
        || SPEAKING_ALLOWANCE_FALLBACK;
      const value = formatSpeakingClock(full);
      return { values: { [clocks.fieldA]: value, [clocks.fieldB]: value }, when: 'after' };
    }
    default:
      return null;
  }
}

/**
 * Does a graphic's machine EVENT need the database's own instant to be right on air?
 *
 * Only a graphic that runs a clock does. The renderer anchors a match clock's origin and a
 * debate board's speaking clocks to the event row's `created_at`, which is the one instant every
 * renderer of a production shares, and the fast road (control/commandRoads.ts) carries no server
 * time. Every other graphic ignores the instant, so its events can ride the fast road like a Take
 * does - which is what makes a quiz's Select, Lock and Reveal paint as quickly as an Update.
 *
 * DELIBERATELY A LOOSE TEST. It is a substring search rather than the two parsers above, so that
 * anything that merely LOOKS like a clock (a `-clock` class, a `data-speaking` attribute, a script
 * reading `noacgEventAt`) stays on the slow road. Missing a clock here would put a laptop's clock
 * skew on air; flagging a graphic that has none costs it only the old half-second.
 */
export function eventsNeedServerTime(template: { html: string; js: string }): boolean {
  return /-clock|data-speaking/.test(template.html) || /noacgEventAt/.test(template.js);
}

/** The graphics of a PUBLISHED payload whose events may ride the fast road, by wire name - the
 *  one derivation both sending surfaces use, so the dashboard and the hosted page can never
 *  disagree about which graphic needs the server's instant. */
export function fastEventGraphics(graphics: { key: string; html: string; js: string }[]): Set<string> {
  return new Set(graphics.filter((g) => !eventsNeedServerTime(g)).map((g) => g.key));
}
