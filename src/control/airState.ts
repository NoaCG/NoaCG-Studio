// WHAT THIS PAGE BELIEVES IS ON AIR, as pure folds over the session's `air` part (production-page
// refactor spec §2, §4.1; docs/CLOUD_PLAYOUT.md).
//
// The `air` part (./playoutSession.ts) holds the per-layer ON AIR marker (`liveCue`), how many
// times it was written here (`moves`), what each graphic was last sent (`aired`), the PROGRAM
// monitor's clock memory, and the boot facts the wire's resolve left. Every write to it is one of
// these folds, applied through `session.apply`, so the page keeps no copy of its own that could
// disagree. They are the rules that decide a wrong PROGRAM indicator, a missed Out, a double Take
// after a reconnect or a replayed command on reload, which is why they live here and run in Node:
//
// - `moveLiveCue`: the one marker write. Every call counts as a move, moved or not, because the
//   boot resolve's seed is skipped when anything wrote the marker while it was in flight.
// - `claimAndApply`: a command from any road (this page's own send, the broadcast, the durable
//   row) applies once, on the id its press minted (./commandRoads.ts `createAppliedOnce`).
// - `seedFromResolve`: the resolve's picture replaces the marker only if no move happened since
//   the request (THE MOVES GUARD), and the rows after the reports replay only if no command did.
// - `programItems`: the match and speaking clocks' decisions around a command, against the
//   monitor's own receive instant (./matchClockWire.ts).
// - `restoreItems`: what rebuilds a fresh PROGRAM stage from the marker, the reports and the rows.
//
// The `log` part's two folds are here too: the action log is what the same commands left.
// No React and only `.ts` runtime imports, so a Node test drives it as it is.

import type { ControlEventRow, ControlSendItem, LiveReportMap } from './hostedControl';
import type { AppliedOnce } from './commandRoads';
import type { LogEntry } from './eventLog';
import type { AirPart, LogPart } from './playoutSession';
import { withLiveCue, type LiveCueMap } from './liveCue.ts';
import {
  clockRowEffect,
  clockValueAfterUpdate,
  plainClockValue,
  speakingClockRowEffect,
  type ClockSpec,
  type SpeakingClockPair,
} from './matchClockWire.ts';
import { airedAfter, type AiredMap, type ReplayItem } from './outputRecovery.ts';
import { lookAfter, reportedLook, type AppliedLooks } from './cueAdjust.ts';
import { typedValuesOf, type TypedValues } from '../model/ografTyped.ts';

/** The clocks each graphic's published markup carries, by the name the wire uses. A graphic
 *  carries one kind or the other, never both. */
export interface ClockSpecs {
  clocks: ReadonlyMap<string, ClockSpec>;
  pairs: ReadonlyMap<string, SpeakingClockPair>;
}

/** Write the ON AIR marker: a new map, or a fold over the one standing. Counted even when nothing
 *  moved, as the page's own setter always counted it (`seedFromResolve` reads the count). */
export function moveLiveCue(air: AirPart, next: LiveCueMap | ((map: LiveCueMap) => LiveCueMap)): AirPart {
  const liveCue = typeof next === 'function' ? next(air.liveCue) : next;
  return { ...air, liveCue, moves: air.moves + 1 };
}

/** What these commands leave on air, MERGED into what was (`airedAfter`): an update may be partial
 *  (a ± bump carries one field on purpose), an accepted event's payload counts, a stop forgets the
 *  graphic. The same part when nothing changed. */
export function rememberAired(air: AirPart, items: readonly ControlSendItem[]): AirPart {
  const aired = items.reduce<AiredMap>((next, item) => airedAfter(next, item.graphic, item.msg), air.aired);
  // The place and size each graphic holds applied, by the same commands (./cueAdjust.ts rules 1, 3).
  const was = air.looks ?? {};
  const looks = items.reduce<AppliedLooks>((next, item) => lookAfter(next, item.graphic, item.msg), was);
  const typedWas = air.typedAired ?? {};
  const typedAired = items.reduce<Record<string, TypedValues>>((next, item) => typedAfter(next, item.graphic, item.msg), typedWas);
  if (aired === air.aired && looks === was && typedAired === typedWas) return air;
  return { ...air, aired, ...(looks === was ? {} : { looks }), ...(typedAired === typedWas ? {} : { typedAired }) };
}

/** The resolved bound values the page's own dispatch sends (./productionDataSession.ts), without
 *  the graphics airing typed data (E1.2a): what they air was last applied to them, and their bound
 *  values go with ✎ Update in their envelope, never as this text. */
export function withoutTypedAir<T extends Record<string, unknown>>(resolved: T, typedAired: Readonly<Record<string, unknown>>): T {
  const typed = Object.keys(typedAired);
  return typed.length ? (Object.fromEntries(Object.entries(resolved).filter(([g]) => !typed.includes(g))) as T) : resolved;
}

/**
 * The typed envelope a graphic airs after one command (E1.2a), by the output's own rule
 * (model/ografTyped.ts `typedOutputGate`): a values update airs its envelope; a data road's native
 * update (`src`) leaves it; an operator's native update replaces it; an Out ends it.
 */
export function typedAfter(prev: Record<string, TypedValues>, graphic: string, msg: ControlSendItem['msg']): Record<string, TypedValues> {
  if (msg.t === 'update') {
    const envelope = 'typed' in msg ? typedValuesOf(msg.typed) : null;
    if (envelope) return { ...prev, [graphic]: envelope };
    if ((msg as { src?: unknown }).src !== undefined || !(graphic in prev)) return prev;
  } else if (msg.t !== 'stop' || !(graphic in prev)) return prev;
  const next = { ...prev };
  delete next[graphic];
  return next;
}

/**
 * THE COMMANDS FOR THE PROGRAM MONITOR, with each clock's value written around its verb in the
 * order `clockRowEffect` fixes: the origin BEFORE a start, so the runtime adopts it instead of
 * minting one; the banked time AFTER a hold or a reset. The monitor tracks the clock field as the
 * renderer's merged data does, and a plain resend of the cue's own time never erases the origin.
 * `now` is the monitor's receive instant, standing in for a row's server time when it has none.
 */
export function programItems(air: AirPart, items: readonly ReplayItem[], specs: ClockSpecs, now: number): { air: AirPart; out: ControlSendItem[] } {
  const out: ControlSendItem[] = [];
  let clocks = air.clocks;
  let speaking = air.speaking;
  /** The item with its clock write before or after it, as the effect says. */
  const around = (item: ControlSendItem, clockItem: ControlSendItem, when: 'before' | 'after') => {
    if (when === 'before') out.push(clockItem);
    out.push(item);
    if (when === 'after') out.push(clockItem);
  };
  for (const item of items) {
    const msg = item.msg;
    // An update writes the fields, and an accepted event's payload rides the same field paths.
    const carried = msg.t === 'update' ? msg.data : msg.t === 'event' ? msg.payload : undefined;
    const pair = specs.pairs.get(item.graphic);
    if (pair) {
      // A debate board's two clocks: one clock verb settles one field, a `switch` settles both.
      const held = { ...(speaking[item.graphic] ?? {}) };
      let moved = false;
      for (const field of [pair.fieldA, pair.fieldB]) {
        const value = carried?.[field];
        if (value !== undefined) {
          held[field] = clockValueAfterUpdate(held[field], value);
          moved = true;
        }
      }
      // The allowance and the penalty size ride the wire plain and are read back as themselves.
      for (const field of [pair.allowanceField, pair.penaltyField]) {
        const value = field ? carried?.[field] : undefined;
        if (field && value !== undefined) {
          held[field] = value;
          moved = true;
        }
      }
      // The monitor is sent what is held, not what the row carried (src/output/main.ts's rule).
      let staged: ControlSendItem = item;
      if (msg.t === 'update' && msg.data) {
        const forwarded = { ...msg.data };
        for (const field of [pair.fieldA, pair.fieldB]) {
          if (forwarded[field] !== undefined) forwarded[field] = held[field];
        }
        staged = { graphic: item.graphic, msg: { ...msg, data: forwarded } };
      }
      const effect = speakingClockRowEffect({ msg, created_at: item.created_at }, pair, held, now);
      if (effect || moved) speaking = { ...speaking, [item.graphic]: effect ? { ...held, ...effect.values } : held };
      if (effect) around(staged, { graphic: item.graphic, msg: { t: 'update', data: effect.values } }, effect.when);
      else out.push(staged);
      continue;
    }
    const clock = specs.clocks.get(item.graphic);
    if (!clock) {
      out.push(item);
      continue;
    }
    const value = carried?.[clock.field];
    if (value !== undefined) clocks = { ...clocks, [item.graphic]: clockValueAfterUpdate(clocks[item.graphic], value) };
    if (msg.t === 'stop' && item.graphic in clocks) clocks = without(clocks, item.graphic);
    const effect = clockRowEffect({ msg, created_at: item.created_at }, clock, clocks[item.graphic], now);
    if (!effect) {
      out.push(item);
      continue;
    }
    clocks = { ...clocks, [item.graphic]: effect.value };
    around(item, { graphic: item.graphic, msg: { t: 'update', data: { [clock.field]: effect.value } } }, effect.when);
  }
  return { air: clocks === air.clocks && speaking === air.speaking ? air : { ...air, clocks, speaking }, out };
}

/**
 * A COMMAND FROM ANY ROAD, applied once: this page's own send (`applyHere`), the database's
 * broadcast and the durable row all arrive here, and `applied` keeps the first and drops the echo
 * (a second `play` re-runs an entrance). A cue marker moves the ON AIR marker on the same road as
 * the picture; typing, a renderer's report and a ping are not commands for the stage; everything
 * else is remembered as aired and goes to PROGRAM, and the monitor has then moved past the boot
 * replay. `out` is what the stage is handed.
 */
export function claimAndApply(
  air: AirPart,
  items: readonly { graphic: string; msg: ControlEventRow['msg'] }[],
  applied: AppliedOnce,
  specs: ClockSpecs,
  now: number,
): { air: AirPart; out: ControlSendItem[] } {
  let next = air;
  const program: ReplayItem[] = [];
  for (const item of items) {
    if (!applied.claim(item.msg)) continue;
    const msg = item.msg;
    if (msg.t === 'cue') next = moveLiveCue(next, (m) => withLiveCue(m, item.graphic, msg.cue));
    else if (msg.t !== 'staged' && msg.t !== 'live' && msg.t !== 'ping') program.push({ graphic: item.graphic, msg });
  }
  // A marker never touches what was aired, so the commands are remembered together, in order.
  if (program.length > 0) next = { ...rememberAired(next, program), bootReplay: null, commands: next.commands + program.length };
  return programItems(next, program, specs, now);
}

/** What the resolve's round trip read when it was asked: the marker's moves and the commands
 *  applied, so its answer can tell it is older than the screen. */
export interface AirAtRequest {
  moves: number;
  commands: number;
}

export function airAtRequest(air: AirPart): AirAtRequest {
  return { moves: air.moves, commands: air.commands };
}

/** The renderers' last reports from the resolve, which a fresh stage is rebuilt from. */
export function withReports(air: AirPart, live: LiveReportMap): AirPart {
  return { ...air, reports: live };
}

/** The boot's replay is no longer what air holds: a newer report arrived, or the wire restarted. */
export function forgetBootReplay(air: AirPart): AirPart {
  return air.bootReplay === null ? air : { ...air, bootReplay: null };
}

/**
 * THE RESOLVE'S SEED, guarded (§4.1 R3). The seed is a wholesale replace, so it is skipped
 * outright when the marker moved while the read was in flight (THE MOVES GUARD): the wire's map is
 * a snapshot, and a layer this operator took off meanwhile would come back on air, or a Take made
 * meanwhile would read as nothing on air with Out greyed. The rows after the reports replay only
 * if no command was applied since the request; a newer command is newer than they are.
 *
 * Seeded, `aired` takes what air shows for each live layer: the renderer's report, else the live
 * cue's values in the rundown, then the rows after the report. A clock's reported value carries its
 * origin stamp, which goes to the monitor's clock memory while the baseline keeps the plain time.
 * `bootLive` is the wire's own answer, the one thing the boot recovery is keyed on.
 */
export function seedFromResolve(
  air: AirPart,
  resolved: { liveCue: LiveCueMap; live: LiveReportMap },
  sinceReports: readonly ReplayItem[],
  at: AirAtRequest,
  cues: readonly { id: string; values: Record<string, string> }[],
  specs: ClockSpecs,
): AirPart {
  if (air.moves !== at.moves) return air;
  const replay = air.commands === at.commands ? [...sinceReports] : [];
  const seed: AiredMap = {};
  let clocks = air.clocks;
  let speaking = air.speaking;
  for (const [graphic, cueId] of Object.entries(resolved.liveCue)) {
    if (!cueId) continue;
    const reported = resolved.live[graphic]?.data;
    const base = reported && Object.keys(reported).length > 0 ? reported : cues.find((c) => c.id === cueId)?.values;
    const values = {
      ...replay.reduce<AiredMap>((aired, item) => (item.graphic === graphic ? airedAfter(aired, graphic, item.msg) : aired), base ? { [graphic]: base } : {})[graphic],
    };
    const clock = specs.clocks.get(graphic);
    const pair = specs.pairs.get(graphic);
    // The wire values come from the report (stamped), not from a replayed plain resend.
    const wire = (field: string) => base?.[field] ?? values[field];
    if (clock && values[clock.field] !== undefined) {
      clocks = { ...clocks, [graphic]: wire(clock.field) };
      values[clock.field] = plainClockValue(values[clock.field]);
    }
    if (pair && values[pair.fieldA] !== undefined && values[pair.fieldB] !== undefined) {
      speaking = { ...speaking, [graphic]: { [pair.fieldA]: wire(pair.fieldA), [pair.fieldB]: wire(pair.fieldB) } };
      values[pair.fieldA] = plainClockValue(values[pair.fieldA]);
      values[pair.fieldB] = plainClockValue(values[pair.fieldB]);
    }
    if (Object.keys(values).length > 0) seed[graphic] = values;
  }
  // What each renderer reports it holds applied of place and size, then the rows after the reports.
  // A command applied here while the read was out is newer than every report: the looks stay.
  let looks: AppliedLooks = { ...(air.looks ?? {}) };
  // A report is the renderer's word for its graphic: no appearance in it clears an older entry.
  if (air.commands === at.commands) for (const [graphic, report] of Object.entries(resolved.live)) {
    const look = reportedLook(report);
    if (look) looks = { ...looks, [graphic]: look };
    else if (graphic in looks) {
      const { [graphic]: _cleared, ...rest } = looks;
      looks = rest;
    }
  }
  looks = replay.reduce<AppliedLooks>((next, item) => lookAfter(next, item.graphic, item.msg), looks);
  return {
    ...moveLiveCue(air, resolved.liveCue),
    aired: { ...air.aired, ...seed },
    looks,
    clocks,
    speaking,
    bootReplay: replay,
    bootLive: resolved.liveCue,
  };
}

/**
 * WHAT REBUILDS A FRESH PROGRAM STAGE: each live layer replayed with the full recipe - data, snap
 * to the state, data again - never a bare play(), which left the monitor at the entrance while air
 * sat mid-sequence. At boot, air is the report plus the rows after it, rebuilt as the renderer
 * rebuilds itself (the clocks move on from the reported values, so their memory is dropped first);
 * a layer nothing reported, or a stage after this page applied a command, is rebuilt from what was
 * aired, with the clocks' wire values over the plain ones. The items go through `programItems`.
 */
export function restoreItems(
  air: AirPart,
  machineStates: Readonly<Record<string, { groups?: Record<string, string> } | null | undefined>>,
  specs: ClockSpecs,
): { air: AirPart; items: ReplayItem[] } {
  let clocks = air.clocks;
  let speaking = air.speaking;
  const all: ReplayItem[] = [];
  for (const [graphic, cueId] of Object.entries(air.liveCue)) {
    if (!cueId) continue;
    const report = air.reports?.[graphic] ?? null;
    const rows = report ? (air.bootReplay ?? []).filter((item) => item.graphic === graphic) : [];
    const replaying = rows.length > 0;
    if (replaying) {
      if (graphic in clocks) clocks = without(clocks, graphic);
      if (graphic in speaking) speaking = without(speaking, graphic);
    }
    const base = replaying ? report?.data : (air.aired[graphic] ?? report?.data);
    const clock = specs.clocks.get(graphic);
    const stamped = clock ? clocks[graphic] : undefined;
    let data = base && stamped !== undefined ? { ...base, [clock!.field]: stamped } : base;
    const pair = specs.pairs.get(graphic);
    const held = pair ? speaking[graphic] : undefined;
    if (base && pair && held) data = { ...base, ...held };
    const groups = replaying ? report?.state?.groups : machineStates[graphic]?.groups;
    // Its place and size go with the first data write (rule 4: what was applied, never what is
    // prepared): the report's while its rows replay, else what this page aired.
    // (`looks` was seeded from the reports, so an entry cleared since is cleared, not the report's.)
    const look = replaying ? reportedLook(report) : air.looks?.[graphic];
    const items: ReplayItem[] = [];
    // A graphic this page aired typed data on is rebuilt with that envelope, never its empty native
    // data (E1.2a); a report never banks typed values, so a replay is not this page's to fill.
    const typed = replaying ? undefined : air.typedAired?.[graphic];
    if (typed) {
      items.push({ graphic, msg: { t: 'update', data: {}, typed, ...(look ? { appearance: look } : {}) } });
      if (groups) items.push({ graphic, msg: { t: 'snap', snap: groups } });
      else items.push({ graphic, msg: { t: 'play' } });
      all.push(...items);
      continue;
    }
    if (data || look) items.push({ graphic, msg: { t: 'update', data: data ?? {}, ...(look ? { appearance: look } : {}) } });
    if (groups) items.push({ graphic, msg: { t: 'snap', snap: groups } });
    // Without a state the graphic plays in, unless the replayed rows carry its entrance.
    else if (!rows.some((item) => item.msg.t === 'play')) items.push({ graphic, msg: { t: 'play' } });
    if (data) items.push({ graphic, msg: { t: 'update', data } });
    all.push(...items, ...rows);
  }
  return { air: clocks === air.clocks && speaking === air.speaking ? air : { ...air, clocks, speaking }, items: all };
}

// ── The `log` part: the action log's lines, from the wire and from this page alone. `append` is
// ./eventLog.ts `appendLogEntries` (its order and its limit), passed in because that module cannot
// be loaded in Node. ──

/** How the action log takes new lines. */
export type AppendLog = (current: LogEntry[], incoming: LogEntry[]) => LogEntry[];

/** Lines the wire wrote (the history at the resolve, then each row). */
export function logged(log: LogPart, entries: readonly LogEntry[], append: AppendLog): LogPart {
  return { ...log, entries: append(log.entries, [...entries]) };
}

/** Lines only this page wrote (an unpublished send, a timed cue, a note): each takes the next
 *  local id, counting down from -1 so it can never meet a row's. */
export function loggedHere(log: LogPart, lines: readonly ((id: number) => LogEntry | null)[], append: AppendLog): LogPart {
  let localId = log.localId;
  const entries: LogEntry[] = [];
  for (const line of lines) {
    localId -= 1;
    const entry = line(localId);
    if (entry) entries.push(entry);
  }
  return { localId, entries: append(log.entries, entries) };
}

function without<T>(map: Readonly<Record<string, T>>, key: string): Record<string, T> {
  const next = { ...map };
  delete next[key];
  return next;
}
