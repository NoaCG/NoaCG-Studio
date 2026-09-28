// THE SERVER'S TRUTH ON THE PAGE (docs/CLIP_PLAYBACK_PLAN.md §6.4 and §6.7, phase 2): what a
// `/state` reading and an accepted action do to the two parts of the store, and the clip clock read
// back out of them.
//
// PLAIN FUNCTIONS OVER PLAIN DATA, like ./serverPlayout.ts beside it and for the same reason: a
// Node test imports this file without a browser (scripts/server-playout.test.mjs), and a later
// bridge to a hardware panel (docs/backlog/companion-and-stream-deck.md) reads the same answers the
// page draws. Nothing here keeps a timer and nothing here sends: a reading only ever changes what
// the page BELIEVES, never what airs.
//
// THE TWO PARTS (./serverPlayoutStore.ts):
//   OWNERSHIP  what the verbs read: which cue is up on which slot, and the facts that change only
//              on an action or a switch - the last accepted generation per slot, a cue whose slot
//              was taken over on the server, what stands on a rundown slot that no cue here put
//              there, and what waits to play next. A reading that changes none of it hands back the
//              SAME object, which is what keeps a reading from re-rendering the page.
//   TIMING     where each slot's clip is, from the last reading or the take's own estimate. Only
//              the clip clock and the rows' remaining times read it.

import type { PlayoutItem, ShowCue } from '../model/shows';
import type { CasparSlot, Slot, SlotState, StateReply } from './playoutProtocol';
import type { AcceptedVerb, ServerLive, ServerOnAir } from './serverPlayout';
import { withoutItem, withTaken } from './serverPlayout.ts';
import { slotAddress } from './playoutSlots.ts';

/** Something on a rundown slot that no cue of this page can be matched to. */
export interface UnidentifiedItem {
  slot: CasparSlot;
  file?: string;
  producer: SlotState['producer'];
}

/** A slot's generation as of the last action this page saw accepted, and the Bridge session that
 *  counted it: a restarted Bridge counts from zero again, so the number compares only with
 *  readings from that same session. */
export interface AcceptedGeneration {
  generation: number;
  session?: string;
}

export interface ServerOwnership {
  onAir: ServerOnAir;
  /** The last accepted generation per slot, by slot address. */
  generations: Readonly<Record<string, AcceptedGeneration>>;
  /** Cues that were up until the slot changed under them on the server, by item id. */
  replaced: Readonly<Record<string, { cueId: string; slot: Slot; file?: string }>>;
  unidentified: readonly UnidentifiedItem[];
  /** What waits to play next on a slot (`LOADBG`), by slot address. */
  queued: Readonly<Record<string, { file: string; auto: boolean }>>;
}

export const NO_OWNERSHIP: ServerOwnership = { onAir: {}, generations: {}, replaced: {}, unidentified: [], queued: {} };

/** Where one slot's clip stands, and when that was true on THIS page's clock. */
export interface SlotTiming {
  /** What the server says plays there; absent on the page's own estimate. A still is `still`. */
  producer?: SlotState['producer'];
  file?: string;
  segment?: { start: number; length: number };
  /** Seconds into the segment at `at`. */
  position?: number;
  paused: boolean;
  loop: boolean;
  /** `performance.now()` on this page when the position was true. */
  at: number;
  /** When a holding clip reached its end, on this page's clock: HOLDING counts up from here. */
  endedAt?: number;
  /** `server`: the Bridge read it off the server. `estimate`: this page counted from its own Take,
   *  because the Bridge cannot read the server or has not answered since. */
  source: 'server' | 'estimate';
  /** An estimate a reading is expected to replace at once: not called `estimated` until it is
   *  older than a reading may be. */
  provisional?: boolean;
}

/** TIMING, keyed by slot address (`2-10`). */
export type ServerTiming = Readonly<Record<string, SlotTiming>>;

/** A reading older than this is no longer the server's word: the clock says `estimated`. */
export const STALE_MS = 3000;

export interface ServerParts {
  ownership: ServerOwnership;
  timing: ServerTiming;
}

function same(a: unknown, b: unknown): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/** The ownership part, re-using every piece that did not change, and the whole object when none did. */
function settle(prev: ServerOwnership, next: ServerOwnership): ServerOwnership {
  const merged: ServerOwnership = {
    onAir: same(prev.onAir, next.onAir) ? prev.onAir : next.onAir,
    generations: same(prev.generations, next.generations) ? prev.generations : next.generations,
    replaced: same(prev.replaced, next.replaced) ? prev.replaced : next.replaced,
    unidentified: same(prev.unidentified, next.unidentified) ? prev.unidentified : next.unidentified,
    queued: same(prev.queued, next.queued) ? prev.queued : next.queued,
  };
  return (Object.keys(merged) as (keyof ServerOwnership)[]).every((k) => merged[k] === prev[k]) ? prev : merged;
}

/**
 * Whether a file the server reports is the item of this name. A clip reads back the way PLAY named
 * it, with its extension on 2.3 and without on 2.5, and a still by its path (`media\giorno.jpg`),
 * so case, the slashes' direction and the extension do not count. The Bridge's `playsItem`
 * (cli/src/playout/slots.ts) compares the same way.
 */
export function namesItem(itemName: string, reported: string): boolean {
  const norm = (s: string) => s.replace(/\\/g, '/').replace(/\.[a-z0-9]+$/i, '').toLowerCase();
  const want = norm(itemName);
  const got = norm(reported);
  return got === want || got.endsWith(`/${want}`);
}

/** Nothing plays in a slot that is gone, stopped (`empty`) or holds the transparent colour. */
function holdsSomething(s: SlotState | undefined): s is SlotState {
  return !!s && s.producer !== 'empty' && s.producer !== 'colour';
}

/** The timing a reading gives a slot, carrying a hold's start across readings. */
function timingOf(s: SlotState, prev: SlotTiming | undefined, now: number): SlotTiming {
  const t: SlotTiming = {
    producer: s.producer,
    ...(s.file ? { file: s.file } : {}),
    ...(s.segment ? { segment: s.segment, position: s.position ?? 0 } : {}),
    paused: s.paused,
    loop: s.loop,
    at: now,
    source: 'server',
  };
  if (s.segment && !s.loop && (s.position ?? 0) >= s.segment.length - 0.001) {
    const sameClip = !!prev && prev.file === t.file && same(prev.segment, t.segment);
    t.endedAt =
      sameClip && prev.endedAt !== undefined
        ? prev.endedAt
        : // It ended between two readings: when the one before said it would.
          sameClip && prev.segment && prev.position !== undefined && !prev.paused
          ? Math.min(now, prev.at + (prev.segment.length - prev.position) * 1000)
          : now;
  }
  return t;
}

export interface ReadingContext {
  /** The channel the reading is of. */
  channel: number;
  /** When it landed, on this page's clock. */
  now: number;
  cues: readonly ShowCue[];
  items: readonly PlayoutItem[];
  /** Where each rundown item plays now: the slots whose content this page reports on. */
  slotOf: (item: PlayoutItem) => CasparSlot;
}

/**
 * ONE `/state` READING, folded into both parts.
 *
 * - A slot whose reading is OLDER than the last action this page saw accepted there is ignored
 *   whole (plan §18, case 14): an answer that was on its way before a Take never overrules it.
 * - A slot this page has up stays up while it holds the instance the Bridge gave the Take. Empty or
 *   stopped, the clip went off air on the server (somebody's STOP or CLEAR): the cue leaves ON AIR,
 *   so Out and All out stop offering it. Holding another instance, or none from the same Bridge, it
 *   was REPLACED on the server, and its row says so. An instance from a Bridge that has since
 *   restarted cannot be told from somebody else's, so that slot becomes unidentified.
 * - An instance this Bridge started for a cue of this rundown names that cue EXACTLY, wherever the
 *   rundown now says its item plays: after a reload, after another tab of this production took it,
 *   or when this page's own Take shows up in a reading before the Take's answer does. Anything else
 *   on a rundown slot is UNIDENTIFIED, never guessed from its file name.
 */
export function applyReading(parts: ServerParts, reply: StateReply, ctx: ReadingContext): ServerParts {
  const { channel, now } = ctx;
  const { ownership, timing } = parts;
  const onChannel = (address: string) => address.startsWith(`${channel}-`);
  const byLayer = new Map(reply.slots.map((s) => [s.layer, s] as const));
  const addr = (layer: number) => `${channel}-${layer}`;
  const fresh = (layer: number) => {
    const accepted = ownership.generations[addr(layer)];
    // Counted by another Bridge process (it restarted since): the numbers say nothing about order.
    if (!accepted || (accepted.session && accepted.session !== reply.session)) return true;
    return (byLayer.get(layer)?.generation ?? 0) >= accepted.generation;
  };
  const ownSession = (instance?: string) => !!instance && instance.startsWith(`${reply.session}.`);
  /** The cue of this rundown, and its item, that this Bridge says it started in a slot. */
  const ownCue = (s: SlotState) => {
    const cue = ownSession(s.instance) && s.cueId ? ctx.cues.find((c) => c.id === s.cueId) : undefined;
    const item = cue ? ctx.items.find((i) => i.id === cue.sourceId) : undefined;
    return cue && item ? { cue, item } : undefined;
  };

  const onAir: Record<string, ServerLive> = { ...ownership.onAir };
  const replaced: Record<string, { cueId: string; slot: Slot; file?: string }> = { ...ownership.replaced };
  const unidentified: UnidentifiedItem[] = ownership.unidentified.filter((u) => u.slot.channel !== channel);
  const queued: Record<string, { file: string; auto: boolean }> = Object.fromEntries(Object.entries(ownership.queued).filter(([a]) => !onChannel(a)));
  const nextTiming: Record<string, SlotTiming> = Object.fromEntries(Object.entries(timing).filter(([a]) => !onChannel(a)));

  // The layers this page speaks for on this channel: each rundown item's slot, and wherever
  // something of its own is up.
  const layers = new Set<number>();
  for (const item of ctx.items) {
    const s = ctx.slotOf(item);
    if (s.channel === channel) layers.add(s.layer);
  }
  for (const live of Object.values(ownership.onAir)) {
    if (live.slot.adapter === 'casparcg' && live.slot.channel === channel) layers.add(live.slot.layer);
  }
  // And wherever this Bridge says a cue of this rundown plays: a cue moved to another layer while
  // it was up is still up on the old one, and after a reload nothing else remembers that layer.
  for (const s of reply.slots) if (ownCue(s)) layers.add(s.layer);

  for (const layer of layers) {
    const a = addr(layer);
    const slot: CasparSlot = { adapter: 'casparcg', channel, layer };
    if (!fresh(layer)) {
      // From before the last action here: everything the page knew about this slot stands.
      if (timing[a]) nextTiming[a] = timing[a];
      if (ownership.queued[a]) queued[a] = ownership.queued[a];
      unidentified.push(...ownership.unidentified.filter((u) => slotAddress(u.slot) === a));
      continue;
    }
    const s = byLayer.get(layer);
    if (s?.queued) queued[a] = s.queued;
    const mine = Object.entries(onAir).find(([, l]) => slotAddress(l.slot) === a);
    if (mine?.[1].instance && s?.instance === mine[1].instance && (s.arriving || !holdsSomething(s))) {
      // Just taken, and not on the layer yet: the server answers PLAY before the clip is there,
      // and meanwhile the layer shows what it held before. The Bridge still vouches for the take,
      // so it stays up and the take's own count stands until the clip's first real reading.
      if (timing[a]) nextTiming[a] = timing[a];
      continue;
    }
    if (!holdsSomething(s)) {
      // Off air on the server: whatever was up leaves ON AIR, and a note that the slot was replaced
      // has nothing left to say.
      if (mine) delete onAir[mine[0]];
      for (const [id, r] of Object.entries(replaced)) if (slotAddress(r.slot) === a) delete replaced[id];
      continue;
    }
    nextTiming[a] = timingOf(s, timing[a], now);
    const withFile = s.file ? { file: s.file } : {};
    // Still the take this page knows (or one from a Bridge that gives no instances): nothing moves.
    if (mine && (!mine[1].instance || s.instance === mine[1].instance)) continue;
    if (mine) delete onAir[mine[0]];
    const own = ownCue(s);
    if (own) {
      onAir[own.item.id] = { cueId: own.cue.id, slot, instance: s.instance, takenAt: now };
      for (const [id, r] of Object.entries(replaced)) if (id === own.item.id || slotAddress(r.slot) === a) delete replaced[id];
      continue;
    }
    if (mine) {
      const [itemId, live] = mine;
      if (ownSession(live.instance)) replaced[itemId] = { cueId: live.cueId, slot: live.slot, ...withFile };
      else unidentified.push({ slot, producer: s.producer, ...withFile });
      continue;
    }
    // Its row already says the slot was replaced; a second line would say it twice.
    if (Object.values(replaced).some((r) => slotAddress(r.slot) === a)) continue;
    unidentified.push({ slot, producer: s.producer, ...withFile });
  }

  unidentified.sort((x, y) => x.slot.channel - y.slot.channel || x.slot.layer - y.slot.layer);
  return {
    ownership: settle(ownership, { onAir, generations: ownership.generations, replaced, unidentified, queued }),
    timing: nextTiming,
  };
}

/**
 * One action the Bridge accepted (./serverPlayout.ts `runServerVerb`), folded into both parts: a
 * take starts the clip's own count at once - from its length in the server's list - so the clock
 * is there before the first reading lands, and an Out ends it.
 */
export function applyAccepted(
  parts: ServerParts,
  a: AcceptedVerb & {
    itemId: string;
    cueId: string;
    /** The item's length in seconds, from the server's list; unknown for a template or a still. */
    length?: number;
    loop?: boolean;
    now: number;
    /** The Bridge reads the server: the take's estimate stands only until its first reading. */
    readable: boolean;
  },
): ServerParts {
  const { ownership, timing } = parts;
  const at = slotAddress(a.slot);
  const generations =
    a.generation === undefined
      ? ownership.generations
      : { ...ownership.generations, [at]: { generation: a.generation, ...(a.session ? { session: a.session } : {}) } };
  let onAir: ServerOnAir = ownership.onAir;
  const replaced = { ...ownership.replaced };
  let unidentified = ownership.unidentified;
  const nextTiming: Record<string, SlotTiming> = { ...timing };
  if (a.verb === 'take') {
    onAir = withTaken(onAir, a.itemId, a.cueId, a.slot, { ...(a.instance ? { instance: a.instance } : {}), takenAt: a.now });
    delete replaced[a.itemId];
    for (const [id, r] of Object.entries(replaced)) if (slotAddress(r.slot) === at) delete replaced[id];
    unidentified = unidentified.filter((u) => slotAddress(u.slot) !== at);
    nextTiming[at] = {
      ...(a.length && a.length > 0 ? { segment: { start: 0, length: a.length }, position: 0 } : {}),
      paused: false,
      loop: !!a.loop,
      at: a.now,
      source: 'estimate',
      ...(a.readable ? { provisional: true } : {}),
    };
  } else if (a.verb === 'out') {
    onAir = withoutItem(onAir, a.itemId);
    delete nextTiming[at];
  } else if ((a.verb === 'pause' || a.verb === 'resume') && nextTiming[at]) {
    const t = nextTiming[at];
    const position = positionAt(t, a.now);
    nextTiming[at] = { ...t, ...(position === undefined ? {} : { position }), paused: a.verb === 'pause', at: a.now };
  }
  return {
    ownership: settle(ownership, { onAir, generations, replaced, unidentified, queued: ownership.queued }),
    timing: nextTiming,
  };
}

/** Seconds into the segment at `now`, counted on from the reading. */
export function positionAt(t: SlotTiming, now: number): number | undefined {
  if (!t.segment || t.position === undefined) return undefined;
  const p = t.position + (t.paused ? 0 : Math.max(0, now - t.at) / 1000);
  if (t.loop) return t.segment.length > 0 ? p % t.segment.length : p;
  return p;
}

/** Seconds left in the segment at `now` (never below 0), or null when its length is unknown. */
export function remainingAt(t: SlotTiming | undefined, now: number): number | null {
  const p = t ? positionAt(t, now) : undefined;
  if (!t?.segment || p === undefined) return null;
  return Math.max(0, t.segment.length - p);
}

/** Whether the time shown for a slot is the page's own count rather than the server's word. */
export function isEstimated(t: SlotTiming | undefined, now: number): boolean {
  if (!t || !t.segment) return true;
  if (t.source === 'estimate' && !t.provisional) return true;
  return now - t.at > STALE_MS;
}

/** The last ten seconds, and the last five (plan §6.4). */
export const WARN_S = 10;
export const FINAL_S = 5;

/** THE CLIP CLOCK'S ANSWER (plan §6.4), as data: what the clock draws, and what a hardware button
 *  would light. */
export interface ClipClock {
  slot: string;
  itemId: string;
  cueId: string;
  label: string;
  file: string;
  /** What happens at the end: in phase 2 a clip holds its last frame or loops. */
  end: 'hold' | 'loop';
  phase: 'counting' | 'warning' | 'final' | 'holding' | 'paused' | 'looping';
  /** Seconds left in the segment; null when neither the server nor the list gave a length. */
  remaining: number | null;
  /** Seconds since a holding clip reached its end. */
  over: number;
  estimated: boolean;
}

type Followed = { itemId: string; live: ServerLive; item: PlayoutItem };

/** The media item taken LAST among the ones still up that `pick` accepts. */
function latest(ownership: ServerOwnership, items: readonly PlayoutItem[], pick: (item: PlayoutItem, live: ServerLive) => boolean): Followed | null {
  let best: Followed | null = null;
  for (const [itemId, live] of Object.entries(ownership.onAir)) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.kind !== 'media' || !pick(item, live)) continue;
    if (!best || (live.takenAt ?? 0) >= (best.live.takenAt ?? 0)) best = { itemId, live, item };
  }
  return best;
}

/**
 * The server picture PROGRAM shows under the graphics: the clip, audio file or still the operator
 * took LAST among the ones still up. Ownership alone decides it, so PROGRAM does not read the
 * timing part.
 */
export function followedClip(ownership: ServerOwnership, items: readonly PlayoutItem[]): Followed | null {
  return latest(ownership, items, () => true);
}

/**
 * Whether an item on air gets the clip clock: a clip or an audio file, never a still, which has no
 * end to count to (plan §4, §6.4). The server's own reading says which; before one lands, a length
 * in the server's list does - a still lists no length, or a single frame.
 */
export function hasClock(item: PlayoutItem, t: SlotTiming | undefined): boolean {
  if (item.kind !== 'media') return false;
  if (t?.producer) return t.producer === 'video';
  return !!item.frames && !!item.fps && item.frames > 1 && item.fps > 0;
}

/** The one clip the clock follows: the clip or audio file taken LAST among the ones still up
 *  ("one clock, one clip"). Null when none is. */
export function clockedClip(ownership: ServerOwnership, timing: ServerTiming, items: readonly PlayoutItem[]): Followed | null {
  return latest(ownership, items, (item, live) => hasClock(item, timing[slotAddress(live.slot)]));
}

/** What the clip clock shows for the followed clip at `now`; null when no server clip is up. */
export function clipClock(
  ownership: ServerOwnership,
  timing: ServerTiming,
  items: readonly PlayoutItem[],
  cues: readonly ShowCue[],
  now: number,
): ClipClock | null {
  const best = clockedClip(ownership, timing, items);
  if (!best) return null;
  const slot = slotAddress(best.live.slot);
  const t = timing[slot];
  const loop = t ? t.loop : !!best.item.loop;
  const remaining = remainingAt(t, now);
  const p = t ? positionAt(t, now) : undefined;
  const over =
    !loop && t?.segment && p !== undefined
      ? t.endedAt !== undefined
        ? Math.max(0, (now - t.endedAt) / 1000)
        : Math.max(0, p - t.segment.length)
      : 0;
  // PAUSED first: a paused loop has to say so as plainly as a paused clip does.
  const phase: ClipClock['phase'] = t?.paused
    ? 'paused'
    : loop
      ? 'looping'
      : remaining !== null && remaining <= 0
        ? 'holding'
        : remaining !== null && remaining <= FINAL_S
          ? 'final'
          : remaining !== null && remaining <= WARN_S
            ? 'warning'
            : 'counting';
  const cueId = best.live.cueId;
  return {
    slot,
    itemId: best.itemId,
    cueId,
    label: cues.find((c) => c.id === cueId)?.label ?? best.item.name,
    file: best.item.name,
    end: loop ? 'loop' : 'hold',
    phase,
    remaining,
    over,
    estimated: isEstimated(t, now),
  };
}

/** `m:ss`, or `h:mm:ss` from an hour. A countdown shows the second it is IN, so it reaches 0:00
 *  exactly at the end: 9.2 s left reads 0:10. `down` rounds the other way, for a count up. */
export function clockText(seconds: number, round: 'up' | 'down' = 'up'): string {
  const s = Math.max(0, round === 'up' ? Math.ceil(seconds - 1e-6) : Math.floor(seconds + 1e-6));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
