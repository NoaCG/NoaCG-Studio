// HARDWARE PANELS, THE PAGE'S PURE HALF (docs/work-specs/hardware-panel-control/protocol.md §6 and
// §8): what the answering operator page tells a panel, and how it judges a press before running it.
// No I/O here; panelRelay.ts carries it over the wire.
//
// A relayed press runs through the page's own dispatcher exactly as a key does, so everything that
// greys a button refuses it too. This file adds the two checks only a REMOTE key needs, because a
// panel's key was drawn from a state that may have moved on by the time its press arrives: the
// press id it has already run (a retry), and a target or toggle direction that no longer holds.

import type { ClipClock } from './serverState';
import type { SpaceAction } from './spaceMode';
import type { ShowCue } from '../model/shows';
import { folderName, type RundownRow } from '../model/rundownRows.ts';

export const PANEL_PROTOCOL = 1;

/** The verbs a panel may press (spec D5); the editing verbs stay on the keyboard. */
export const PANEL_VERBS = [
  'take',
  'retake',
  'update',
  'next',
  'out',
  'select-prev',
  'select-next',
  'pause',
  'resume',
  'pause-toggle',
  'all-out',
  'select-cue',
  'take-cue',
  'trigger-cue',
] as const;
export type PanelVerb = (typeof PANEL_VERBS)[number];
/** The verbs whose enabled state is one flag; `select-cue` and `take-cue` are answered per row. */
export type SharedPanelVerb = Exclude<PanelVerb, 'select-cue' | 'take-cue' | 'trigger-cue'>;
export const SHARED_PANEL_VERBS = PANEL_VERBS.filter((v): v is SharedPanelVerb => v !== 'select-cue' && v !== 'take-cue' && v !== 'trigger-cue');

export interface PanelRow {
  id: string;
  label: string;
  kind: 'cue' | 'folder';
  source: 'graphic' | 'server' | null;
  folder?: string;
}

export interface PanelClip {
  cue: string;
  label: string;
  phase: 'counting' | 'holding' | 'paused' | 'looping';
  /** The page's clock, in ms; null when unknown. */
  start: number | null;
  end: number | null;
  /** Seconds left at `at`; null when unknown. */
  remaining: number | null;
  estimated: boolean;
  next: string | null;
}

/** WHAT THE PAGE SHOWS NOW, as a panel needs it: built by each page from its own state. */
export interface PanelSnapshot {
  title: string;
  selected: string | null;
  space: SpaceAction | 'from-the-top' | null;
  live: string[];
  allowed: Record<SharedPanelVerb, boolean>;
  blocked: string[];
  clip: PanelClip | null;
  bridge: 'ok' | 'down' | 'off';
  rows: PanelRow[];
}

/**
 * The production page's rundown as a panel's rows: each row as it is drawn, and under a collapsed
 * folder's header the cues it hides, so a preset key made for one of them keeps working while the
 * folder is shut. A folder row is there to be selected; its `take-cue` is always refused.
 */
export function rundownPanelRows(rows: readonly RundownRow[]): PanelRow[] {
  const cueRow = (cue: ShowCue, folder: string | null): PanelRow => ({
    id: cue.id,
    label: cue.label,
    kind: 'cue',
    source: cue.source === 'playout' ? 'server' : 'graphic',
    ...(folder ? { folder } : {}),
  });
  const out: PanelRow[] = [];
  for (const row of rows) {
    if (row.kind === 'cue') {
      out.push(cueRow(row.cue, row.folderId));
      continue;
    }
    out.push({ id: row.id, label: folderName(row.folder), kind: 'folder', source: null });
    if (row.folder.collapsed === true) for (const cue of row.runCues) out.push(cueRow(cue, row.folder.id));
  }
  return out;
}

/** At most this many rows go to a panel: they become preset keys, and nobody drags a hundred. */
export const PANEL_ROWS_MAX = 100;

/** Warning and final thresholds, from the clip clock itself (serverState.ts WARN_S, FINAL_S). */
export const PANEL_WARN: [number, number] = [10, 5];

/**
 * The clip clock as start and end in this page's clock, so the panel counts down itself and needs
 * no message a second (protocol §7.4). With a clip following, the warnings are on TO STUDIO, so the
 * end sent is the sequence's.
 */
export function panelClip(clock: ClipClock | null, now: number): PanelClip | null {
  if (!clock) return null;
  const counted = clock.toStudio !== undefined ? clock.toStudio : clock.remaining;
  const phase: PanelClip['phase'] =
    clock.phase === 'paused' || clock.phase === 'looping' || clock.phase === 'holding' ? clock.phase : 'counting';
  const end =
    phase === 'holding'
      ? now - clock.over * 1000
      : phase === 'paused' || counted == null
        ? null
        : now + counted * 1000;
  return {
    cue: clock.cueId,
    label: clock.label,
    phase,
    start: null,
    end: end === null ? null : Math.round(end),
    remaining: counted == null ? null : Math.max(0, counted),
    estimated: clock.estimated,
    next: clock.next?.label ?? null,
  };
}

/** A clip end that moved less than this between two renders is the same end (render jitter). */
const END_JITTER_MS = 250;

/** Whether a panel would see a difference: everything but the clock's own drift. */
export function snapshotChanged(prev: PanelSnapshot | null, next: PanelSnapshot): boolean {
  if (!prev) return true;
  const strip = (s: PanelSnapshot) => JSON.stringify({ ...s, rows: undefined, clip: s.clip ? { ...s.clip, end: null, remaining: null } : null });
  if (strip(prev) !== strip(next)) return true;
  const a = prev.clip;
  const b = next.clip;
  if (!a || !b) return false;
  if ((a.end === null) !== (b.end === null)) return true;
  if (a.end !== null && b.end !== null && Math.abs(a.end - b.end) >= END_JITTER_MS) return true;
  // A paused clip's frozen time is part of what it shows.
  return a.phase === 'paused' && a.remaining !== b.remaining;
}

export function rowsChanged(prev: readonly PanelRow[] | null, next: readonly PanelRow[]): boolean {
  // The production page hands the same rows until its rundown changes: no need to compare them.
  if (prev === next) return false;
  return !prev || JSON.stringify(prev.slice(0, PANEL_ROWS_MAX)) !== JSON.stringify(next.slice(0, PANEL_ROWS_MAX));
}

export interface PanelMeta {
  ver: number;
  rowsVer: number;
  page: string;
  claim: number;
  where: 'production' | 'control';
  label: string;
  at: number;
}

/** The `state` message (protocol §8). */
export function wireState(s: PanelSnapshot, m: PanelMeta) {
  return {
    v: PANEL_PROTOCOL,
    ver: m.ver,
    rowsVer: m.rowsVer,
    page: m.page,
    claim: m.claim,
    where: m.where,
    label: m.label,
    title: s.title,
    at: m.at,
    selected: s.selected,
    space: s.space,
    live: s.live,
    allowed: s.allowed,
    blocked: s.blocked,
    clip: s.clip,
    warn: PANEL_WARN,
    bridge: s.bridge,
  };
}

/** The `rows` message. */
export function wireRows(rows: readonly PanelRow[], rowsVer: number) {
  return { v: PANEL_PROTOCOL, rowsVer, rows: rows.slice(0, PANEL_ROWS_MAX), more: rows.length > PANEL_ROWS_MAX };
}

// ── A RELAYED PRESS ──────────────────────────────────────────────────────────────────────────────

export interface PanelPress {
  verb: PanelVerb;
  target: string;
  seen: number;
  pressId: string;
  claim: number;
  panel: { id: string; label: string };
}

/** Read a `press` payload from the press topic, or null when it is not one this page understands. */
export function readPress(p: unknown): PanelPress | null {
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const panel = (o.panel ?? {}) as Record<string, unknown>;
  if (!(PANEL_VERBS as readonly unknown[]).includes(o.verb)) return null;
  if (typeof o.target !== 'string' || typeof o.seen !== 'number' || typeof o.press_id !== 'string' || typeof o.claim !== 'number') return null;
  return {
    verb: o.verb as PanelVerb,
    target: o.target,
    seen: o.seen,
    pressId: o.press_id,
    claim: o.claim,
    panel: { id: typeof panel.id === 'string' ? panel.id : '', label: typeof panel.label === 'string' ? panel.label : 'A panel' },
  };
}

/** `invalid`: a graphic action's arguments do not fit its declared schema (control/panelActions.ts). */
export type PressOutcome = 'ran' | 'duplicate' | 'stale' | 'not-allowed' | 'not-here' | 'invalid';

export interface PressVerdict {
  outcome: PressOutcome;
  note?: string;
}

/** The last published values, by version, for judging a press against the one its key showed. */
export class VersionRing<T> {
  readonly #size: number;
  readonly #by = new Map<number, T>();
  constructor(size = 64) {
    this.#size = size;
  }
  put(ver: number, value: T): void {
    this.#by.set(ver, value);
    while (this.#by.size > this.#size) this.#by.delete(this.#by.keys().next().value as number);
  }
  get(ver: number): T | undefined {
    return this.#by.get(ver);
  }
}

/** The last published states (protocol §6.2 step 4). */
export class SnapshotRing extends VersionRing<PanelSnapshot> {}

/** The press ids this page has handled lately, with what it answered (protocol §6.2 step 2). */
export class PressMemory {
  readonly #size: number;
  readonly #ttlMs: number;
  readonly #by = new Map<string, { verdict: PressVerdict; at: number }>();
  constructor(size = 256, ttlMs = 10 * 60_000) {
    this.#size = size;
    this.#ttlMs = ttlMs;
  }
  get(id: string, now: number): PressVerdict | null {
    const hit = this.#by.get(id);
    return hit && now - hit.at < this.#ttlMs ? hit.verdict : null;
  }
  remember(id: string, verdict: PressVerdict, now: number): void {
    this.#by.delete(id);
    this.#by.set(id, { verdict, at: now });
    while (this.#by.size > this.#size) this.#by.delete(this.#by.keys().next().value as string);
  }
}

/** The longest a press that came ahead of its turn waits for the presses before it. Measured on
 *  hosted runs (issue #2109): the later of two presses 50 ms apart arrived up to 293 ms ahead. A
 *  press waits only when one before it has not arrived, and well inside the 1.5 s a module waits
 *  for its answer. */
export const PRESS_HOLD_MS = 500;

/** The gap behind every press that runs. The page judges and runs a press from what it last drew
 *  (`usePanelAnswer` reads its closures through refs), so a press run sooner would be judged against
 *  a page that has not drawn the press before it, however the two arrived (issues #2109, #2144).
 *  50 ms is what an operator's quick pair has anyway. */
export const PRESS_DRAW_MS = 50;

/** At most this many panels' counts are kept: a module start is a new panel. */
const ORDERED_PANELS_MAX = 64;

interface OrderedPanel {
  /** The number whose turn it is. */
  next: number;
  held: Map<number, () => void>;
  /** The bound running for what is held, and the number it gave up to when it ran out. */
  giveUp: (() => void) | null;
  givenUpTo: number;
}

/**
 * ONE PANEL'S PRESSES RUN IN THE ORDER THEY WERE PRESSED (protocol §6.2). Each press is its own
 * relay call and broadcast, so two quick ones can arrive reversed (issue #2109). The press id has
 * always numbered them, `<instance>:<n>` counting up per module start, so no module needs an update.
 *
 * A press in its turn runs in the task that heard it, unless another press, from any panel, ran in
 * the PRESS_DRAW_MS before it: then it waits out the rest of that gap, so the page has drawn that
 * press first (issue #2144). A press on its own never waits, and needs no timer. One ahead of its
 * turn is held until the presses before it arrive. PRESS_HOLD_MS after a press was first held with
 * none in its turn, everything held goes, in order, and the presses that never came are given up
 * on. A press after its turn, a late one or a repeat, runs at once: its id decides whether it has
 * an effect (PressMemory), so a +1 arriving late still adds its point. The first press this page
 * hears from a panel sets the count and never waits for the ones before it, since a module may have
 * pressed long before this page opened.
 */
export class PressOrder {
  /** Call `fn` once after `ms`; returns the cancel. */
  readonly #after: (ms: number, fn: () => void) => () => void;
  readonly #now: () => number;
  readonly #panels = new Map<string, OrderedPanel>();
  /** When a press last ran, and the timer that lets go what waits for the page to draw it. */
  #ranAt = -Infinity;
  #drawing: (() => void) | null = null;
  /** The panels with a press in its turn waiting for the gap, in the order they started waiting: each
   *  gap lets go the first, so one busy panel cannot keep another waiting. */
  readonly #waiting = new Set<OrderedPanel>();
  constructor(after: (ms: number, fn: () => void) => () => void, now: () => number = () => Date.now()) {
    this.#after = after;
    this.#now = now;
  }

  /** A press was heard: `run` is called exactly once, in its turn, unless this order stops first. */
  arrive(pressId: string, run: () => void): void {
    const id = /^(.+):(\d+)$/.exec(pressId);
    if (!id) {
      this.#run(run);
      return;
    }
    const n = Number(id[2]);
    const panel = this.#panels.get(id[1]) ?? this.#met(id[1], n);
    if (n < panel.next) {
      this.#run(run);
      return;
    }
    // A second copy of a held press: the first answers for both.
    if (panel.held.has(n)) return;
    panel.held.set(n, run);
    this.#pump(panel);
  }

  /** Nothing held runs any more, and no timer is left. */
  stop(): void {
    for (const panel of this.#panels.values()) {
      panel.giveUp?.();
      panel.held.clear();
    }
    this.#panels.clear();
    this.#waiting.clear();
    this.#drawing?.();
    this.#drawing = null;
  }

  #met(instance: string, n: number): OrderedPanel {
    if (this.#panels.size >= ORDERED_PANELS_MAX) {
      for (const [other, known] of this.#panels) {
        if (known.held.size === 0) {
          this.#panels.delete(other);
          break;
        }
      }
    }
    const panel: OrderedPanel = { next: n, held: new Map(), giveUp: null, givenUpTo: 0 };
    this.#panels.set(instance, panel);
    return panel;
  }

  #run(run: () => void): void {
    this.#ranAt = this.#now();
    run();
  }

  #pump(panel: OrderedPanel): void {
    const { held } = panel;
    if (held.size === 0) return;
    const lowest = Math.min(...held.keys());
    if (lowest <= panel.givenUpTo) panel.next = lowest;
    const run = held.get(panel.next);
    if (!run) {
      panel.giveUp ??= this.#after(PRESS_HOLD_MS, () => {
        panel.giveUp = null;
        panel.givenUpTo = Math.max(...held.keys());
        this.#pump(panel);
      });
      return;
    }
    // The page may not have drawn the press that ran last: wait out the rest of its gap. A clock
    // that went back says nothing, so it does not hold a press.
    const since = this.#now() - this.#ranAt;
    if (this.#drawing || (since >= 0 && since < PRESS_DRAW_MS)) {
      this.#waiting.add(panel);
      this.#drawing ??= this.#after(PRESS_DRAW_MS - since, () => this.#drawn());
      return;
    }
    held.delete(panel.next);
    panel.next++;
    if (held.size === 0) {
      panel.giveUp?.();
      panel.giveUp = null;
    }
    this.#ranAt = this.#now();
    // The gap for the presses behind it, this panel's and any other's, armed before it runs, so one
    // that throws cannot strand them.
    this.#pump(panel);
    if (this.#waiting.size > 0) this.#drawing ??= this.#after(PRESS_DRAW_MS, () => this.#drawn());
    run();
  }

  /** The gap is over, whatever the clock says now: the panel that has waited longest goes first,
   *  and one with more to run waits again behind the others. */
  #drawn(): void {
    this.#drawing = null;
    this.#ranAt = -Infinity;
    for (const panel of [...this.#waiting]) {
      this.#waiting.delete(panel);
      this.#pump(panel);
      if (this.#drawing) return;
    }
  }
}

const SELECTED_ROW_VERBS: readonly PanelVerb[] = ['take', 'retake', 'update', 'next', 'out', 'pause', 'resume'];

const VERB_WORDS: Record<PanelVerb, string> = {
  take: 'Take',
  retake: 'Re-take',
  update: 'Update',
  next: 'Next',
  out: 'Out',
  'select-prev': 'Previous cue',
  'select-next': 'Next cue',
  pause: 'Pause',
  resume: 'Resume',
  'pause-toggle': 'Pause or resume',
  'all-out': 'All out',
  'select-cue': 'Select a cue',
  'take-cue': 'Take a cue now',
  'trigger-cue': 'Play now, keep selection',
};

export function verbWords(verb: PanelVerb): string {
  return VERB_WORDS[verb];
}

/**
 * Judge a press against what the page shows now and what its key showed (protocol §6.2, steps 3 to
 * 5). Null means run it. A duplicate id is the caller's (PressMemory), and the claim is checked
 * before this is ever asked.
 */
export function judgePress(
  press: PanelPress,
  now: PanelSnapshot,
  then: PanelSnapshot | undefined,
  runs: ReadonlySet<PanelVerb>,
): PressVerdict | null {
  const { verb, target } = press;
  if (!runs.has(verb)) return { outcome: 'not-here', note: `${verbWords(verb)} is not on this page` };
  const isRow = (id: string) => now.rows.some((r) => r.id === id);
  if (SELECTED_ROW_VERBS.includes(verb) && target !== (now.selected ?? '')) {
    return { outcome: 'stale', note: 'the selection moved' };
  }
  if (verb === 'take' && (!then || then.space !== now.space)) {
    return { outcome: 'stale', note: then ? 'what Take does changed' : 'the key was drawn too long ago' };
  }
  if ((verb === 'select-cue' || verb === 'take-cue' || verb === 'trigger-cue') && !isRow(target)) {
    return { outcome: 'stale', note: 'that cue is no longer in the rundown' };
  }
  if (verb === 'take-cue' && (!then || then.live.includes(target) !== now.live.includes(target))) {
    return { outcome: 'stale', note: then ? 'that cue went on or off air since' : 'the key was drawn too long ago' };
  }
  if (verb === 'trigger-cue' && (!then || !then.rows.some(r => r.id === target && r.kind === 'cue') || !now.rows.some(r => r.id === target && r.kind === 'cue'))) {
    return { outcome: 'stale', note: 'that cue key is no longer current' };
  }
  if (verb === 'pause-toggle') {
    const was = then?.clip;
    const is = now.clip;
    if (!then || (was?.cue ?? '') !== (is?.cue ?? '') || (was?.phase === 'paused') !== (is?.phase === 'paused')) {
      return { outcome: 'stale', note: 'the clip changed since' };
    }
  }
  if (verb === 'take-cue' || verb === 'trigger-cue' ? now.blocked.includes(target) : verb !== 'select-cue' && !now.allowed[verb]) {
    return { outcome: 'not-allowed', note: `${verbWords(verb)} is not allowed right now` };
  }
  return null;
}
