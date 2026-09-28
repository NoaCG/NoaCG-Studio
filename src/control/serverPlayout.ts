// SERVER PLAYOUT: what a cue over the playout server's own library sends, and what the page
// believes is up on the server because of it (docs/BRIDGE.md §5).
//
// A server cue is one command through NoaCG Bridge - a template is CG-added with its values as
// JSON, a clip is played - and never a row in the command log: nothing renders it, the /output
// page would have nothing to do with it, and a phone cannot reach the operator's Bridge.
//
// PLAIN FUNCTIONS OVER PLAIN DATA, moved out of ProductionPage with their behaviour unchanged
// (docs/CLIP_PLAYBACK_PLAN.md §16, phase 0). The one call that leaves the machine, the Bridge's
// `act`, is handed in rather than imported, and this file imports nothing but types and
// ./playoutSlots.ts, so every rule here runs in Node without a browser (plan §10). Keep it that
// way: the page's store (./serverPlayoutStore) and the link (./playoutLink) stay out of it. The
// `.ts` on the one runtime import is what lets Node resolve it.

import type { PlayoutItem, ShowCue } from '../model/shows';
import type { PlayoutResult } from './playoutLink';
import type { PlayoutAction, SequenceEntry, Slot } from './playoutProtocol';
import { compareSlots, slotAddress } from './playoutSlots.ts';
import { effectiveEnd, fileSeconds, MIN_SEQUENCE_MEMBER_S, outFade, segmentSeconds, takePlayback } from '../model/cuePlayback.ts';

/** One item up on the server: the cue that put it there and the SLOT it was taken to. */
export interface ServerLive {
  cueId: string;
  slot: Slot;
  /** The Bridge's own id for this playback (./serverState.ts): a reading showing another id, or
   *  none, on this slot means something else plays there now. Absent from a Bridge that gives none. */
  instance?: string;
  /** When this page learned it is up, on its own clock (ms): the clip clock follows the latest. */
  takenAt?: number;
}

/**
 * What this page believes is up on the PLAYOUT SERVER, by playout item id. It moves on an accepted
 * command, so the row says ON AIR from that moment and a refused one never marks it - and, where
 * the Bridge can read the server, on what the server reports (./serverState.ts `applyReading`).
 *
 * The slot is remembered rather than re-derived because the item's channel and layer stay
 * editable while it is on air: Out, Update and All out must reach where the cue IS, not where its
 * editor now points, or a channel changed mid-show would strand the clip on air.
 */
export type ServerOnAir = Readonly<Record<string, ServerLive>>;

export type ServerVerb = 'take' | 'update' | 'next' | 'out' | 'pause' | 'resume';

/** Whether THIS cue is what the page last put up on its item. */
export function serverCueLive(onAir: ServerOnAir, item: PlayoutItem | null, cue: ShowCue | null): boolean {
  return !!item && !!cue && onAir[item.id]?.cueId === cue.id;
}

/** One slot holds one thing: a take REPLACES whatever another item of this rundown had up on the
 *  same channel and layer, on the server and so here too - two clips on 2-10 do not both stay ON
 *  AIR. */
export function withTaken(
  onAir: ServerOnAir,
  itemId: string,
  cueId: string,
  slot: Slot,
  extra: Pick<ServerLive, 'instance' | 'takenAt'> = {},
): ServerOnAir {
  const next: Record<string, ServerLive> = {};
  for (const [id, l] of Object.entries(onAir)) if (slotAddress(l.slot) !== slotAddress(slot)) next[id] = l;
  return { ...next, [itemId]: { cueId, slot, ...extra } };
}

/** Forget that an item is up on the server: its Out was accepted, or nothing of it is left. */
export function withoutItem(onAir: ServerOnAir, itemId: string): ServerOnAir {
  const next = { ...onAir };
  delete next[itemId];
  return next;
}

/** A server cue this page has up, as PROGRAM's header names it and All out takes it off. */
export interface ServerLayer {
  slot: Slot;
  cue: ShowCue;
  label: string;
}

/** The server cues this page has put up, by channel and then front to back - named on the
 *  PROGRAM header and cleared by All out, but never drawn: they play on the server, not in a
 *  browser. Each carries the slot it was TAKEN to, whichever channel that is. */
export function serverLayers(onAir: ServerOnAir, items: PlayoutItem[], cues: ShowCue[]): ServerLayer[] {
  return items
    .map((item) => ({ item, live: onAir[item.id] ?? null }))
    .map((l) => ({ ...l, cue: l.live ? (cues.find((c) => c.id === l.live!.cueId) ?? null) : null }))
    .filter((l): l is { item: PlayoutItem; live: ServerLive; cue: ShowCue } => !!l.cue)
    .map((l) => ({ slot: l.live.slot, cue: l.cue, label: l.cue.label }))
    .sort((a, b) => compareSlots(a.slot, b.slot));
}

/**
 * The one action a verb sends. The action carries no page state, so the same object is what a
 * log row would carry later. A take names its cue, which the Bridge keeps with what it started
 * so a reading can say which cue is up after a reload (docs/CLIP_PLAYBACK_PLAN.md §6.7).
 *
 * A clip's take carries how the cue plays it (model/cuePlayback.ts `takePlayback`): a cue with no
 * setting of its own sends exactly the action it always sent, and a looping one the old `loop`. Its
 * Out fades when the cue has a fade out. `cue` is the cue whose settings apply: the one taken, and
 * for Out the one on air.
 */
export function serverAction(verb: ServerVerb, item: PlayoutItem, slot: Slot, values: Record<string, string>, cueId?: string, cue?: Pick<ShowCue, 'playback'>): PlayoutAction {
  const itemRef = { kind: item.kind, name: item.name };
  if (verb === 'take') {
    const media = item.kind === 'media' ? takePlayback(cue ?? {}, item) : { loop: false };
    return {
      verb,
      item: itemRef,
      slot,
      ...(item.kind === 'template' ? { data: values } : {}),
      // A looping clip is CasparCG's own `PLAY … LOOP`: the server repeats it until Out.
      ...(media.loop ? { loop: true } : {}),
      ...(cueId ? { cueId } : {}),
      ...('playback' in media && media.playback ? { playback: media.playback } : {}),
    };
  }
  if (verb === 'update') return { verb, slot, data: values };
  const fade = verb === 'out' && item.kind === 'media' ? outFade(cue) : undefined;
  return { verb, slot, item: itemRef, ...(fade !== undefined ? { fadeOut: fade } : {}) } as PlayoutAction;
}

/** The clip after this one that plays next on its slot, found in the rundown as it stands now. */
export interface NextClip {
  cue: ShowCue;
  item: PlayoutItem;
  /** Its place in the rundown, 1-based. */
  cueNo: number;
  /** What was looked past on the way, for the sentence: `2 graphics`, `STING on 2-5`. */
  skipped: string;
}

export type PlayNext = { ok: true; next: NextClip } | { ok: false; reason: string };

const count = (n: number, one: string, many: string) => `${n === 1 ? 'a' : n} ${n === 1 ? one : many}`;

/**
 * PLAY NEXT'S TARGET (docs/CLIP_PLAYBACK_PLAN.md §6.6): the next clip or audio cue after this one
 * that plays on the same slot, looking past graphics and anything on another slot (owner, Q3),
 * resolved from the rundown as it stands - at the Take, and wherever the choice is made. When no
 * clip qualifies, the reason, in the words the editor shows beside the disabled choice.
 */
export function playNextTarget(
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  cueId: string,
  addressOf: (item: PlayoutItem) => string,
): PlayNext {
  const at = cues.findIndex((c) => c.id === cueId);
  const cue = cues[at];
  const item = cue?.source === 'playout' ? items.find((i) => i.id === cue.sourceId) : undefined;
  if (!cue || !item || item.kind !== 'media') return { ok: false, reason: 'only a clip or an audio file plays the next one' };
  if (item.mediaKind === 'still') return { ok: false, reason: 'a still never ends, so nothing plays after it' };
  const address = addressOf(item);
  let graphics = 0;
  const elsewhere: { label: string; address: string }[] = [];
  for (let i = at + 1; i < cues.length; i++) {
    const c = cues[i];
    const it = c.source === 'playout' ? items.find((x) => x.id === c.sourceId) : undefined;
    if (!it || it.kind !== 'media') {
      graphics += 1;
      continue;
    }
    const there = addressOf(it);
    if (there !== address) {
      elsewhere.push({ label: c.label, address: there });
      continue;
    }
    if (it.mediaKind === 'still') return { ok: false, reason: `the next cue on ${address} is a still, which never ends` };
    if (!it.mediaKind) return { ok: false, reason: `the next clip on ${address} is not in the server's list yet, so its kind is not known` };
    const length = segmentSeconds(c, it);
    if (length === undefined) return { ok: false, reason: `the next clip on ${address} has no known length` };
    if (length < MIN_SEQUENCE_MEMBER_S) return { ok: false, reason: `the next clip is shorter than ${MIN_SEQUENCE_MEMBER_S} seconds` };
    const parts = [
      ...(graphics ? [count(graphics, 'graphic', 'graphics')] : []),
      ...(elsewhere.length ? [elsewhere.length === 1 ? `${elsewhere[0].label} on ${elsewhere[0].address}` : `${elsewhere.length} cues on other layers`] : []),
    ];
    return { ok: true, next: { cue: c, item: it, cueNo: i + 1, skipped: parts.join(' and ') } };
  }
  return { ok: false, reason: `no clip after this one plays on ${address}` };
}

/** `STUDIO_BG (cue 5, after 2 graphics)` - where Play next's choice is made (plan §6.6). */
export function nextClipWords(next: NextClip): string {
  return `${next.cue.label} (cue ${next.cueNo}${next.skipped ? `, after ${next.skipped}` : ''})`;
}

/** One member of a sequence, as the rundown gives it. */
export interface SequenceMember {
  cue: ShowCue;
  item: PlayoutItem;
}

/**
 * The clips a Take of this cue plays one after another: the cue, its Play next target, that
 * clip's own target while it too says Play next, and so on. Stopped at a member whose own target
 * cannot be found, which then plays by Hold; the TAKEN cue's own must be found, or the Take says
 * why. A single member means no sequence: the cue does not play next.
 */
export function sequenceMembers(
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  cueId: string,
  addressOf: (item: PlayoutItem) => string,
): { ok: true; members: SequenceMember[] } | { ok: false; reason: string } {
  const cue = cues.find((c) => c.id === cueId);
  const item = cue?.source === 'playout' ? items.find((i) => i.id === cue.sourceId) : undefined;
  if (!cue || !item) return { ok: false, reason: 'the cue is not in the rundown' };
  const members: SequenceMember[] = [{ cue, item }];
  while (effectiveEnd(members[members.length - 1].cue, members[members.length - 1].item) === 'next') {
    const last = members[members.length - 1];
    const t = playNextTarget(cues, items, last.cue.id, addressOf);
    if (!t.ok) {
      if (members.length === 1) return { ok: false, reason: t.reason };
      break;
    }
    members.push({ cue: t.next.cue, item: t.next.item });
  }
  if (members.length > 1) {
    // Every member's kind and length go to the Bridge, which refuses a sequence without them.
    if (!item.mediaKind) return { ok: false, reason: 'this clip is not in the server\'s list yet, so its kind is not known' };
    if (fileSeconds(item) === undefined) return { ok: false, reason: 'this clip has no known length' };
  }
  return { ok: true, members };
}

/** The sequence action for a chain of members (plan §9): each entry with the playback its own
 *  cue sets, and the last with its own ending. */
export function sequenceAction(members: readonly SequenceMember[], slot: Slot): Extract<PlayoutAction, { verb: 'sequence' }> {
  const entries: SequenceEntry[] = members.map(({ cue, item }, i) => {
    const { loop, playback } = takePlayback(cue, item);
    const last = i === members.length - 1;
    const p = { ...(last && loop ? { end: 'loop' as const } : {}), ...(playback ?? {}) };
    return {
      item: { kind: 'media', name: item.name },
      cueId: cue.id,
      ...(Object.keys(p).length ? { playback: p } : {}),
      media: { kind: item.mediaKind === 'audio' ? 'audio' : 'movie', seconds: fileSeconds(item) ?? 0 },
    };
  });
  return { verb: 'sequence', slot, entries };
}

/** One action the Bridge accepted, with what it said about the slot afterwards. */
export interface AcceptedVerb {
  verb: ServerVerb;
  slot: Slot;
  generation?: number;
  /** The Bridge session that counted `generation`. */
  session?: string;
  instance?: string;
}

/** What one verb came to: whether it reached the server, the note line's sentence, and every
 *  action the Bridge accepted on the way, in order - what the page folds into its store
 *  (./serverState.ts `applyAccepted`). A refused action is never in it. */
export interface ServerVerbOutcome {
  ok: boolean;
  note: string;
  accepted: AcceptedVerb[];
}

/**
 * ONE VERB ON THE PLAYOUT SERVER (docs/BRIDGE.md §5).
 *
 * The outcome is reported as itself: a server that refused, a file that is gone, a Bridge that is
 * not running each get their own sentence in the note line, and nothing marks the row ON AIR on
 * anything but an accepted take.
 *
 * `live` is what the map held for this item when the verb was pressed, and `slotNow` where the
 * item is set to play now: a take goes where the cue is set to play now, and every later verb goes
 * where the take WENT. `values` is read after any move-off below, at the moment the action is
 * built, as it always was.
 */
export async function runServerVerb({
  verb,
  cue,
  item,
  label,
  live,
  slotNow,
  values,
  act,
  sequence,
  cut,
}: {
  verb: ServerVerb;
  cue: ShowCue;
  item: PlayoutItem;
  label: string;
  live: ServerLive | undefined;
  slotNow: Slot;
  values: () => Record<string, string>;
  act: (action: PlayoutAction) => Promise<PlayoutResult>;
  /** A Take of a cue that plays next: the clips it plays one after another, the cue first
   *  (`sequenceMembers`). The Bridge runs them (docs/CLIP_PLAYBACK_PLAN.md §6.10). */
  sequence?: readonly SequenceMember[];
  /** Out as a cut whatever the cue's fade out says: All out, the panic control. */
  cut?: boolean;
}): Promise<ServerVerbOutcome> {
  const slot = verb !== 'take' && live ? live.slot : slotNow;
  const accepted: AcceptedVerb[] = [];
  const took = (v: ServerVerb, at: Slot, r: PlayoutResult) =>
    accepted.push({
      verb: v,
      slot: at,
      ...(r.generation !== undefined ? { generation: r.generation } : {}),
      ...(r.session ? { session: r.session } : {}),
      ...(r.instance ? { instance: r.instance } : {}),
    });
  // A RE-TAKE after the cue was moved to another channel or layer: its first copy is still up
  // where it went, and nothing else knows it is there. Take that one off first, so the move is a
  // move and not a second copy stranded on the old slot.
  if (verb === 'take' && live && slotAddress(live.slot) !== slotAddress(slot)) {
    const off = await act(serverAction('out', item, live.slot, {}));
    if (off.state !== 'ok') {
      return {
        ok: false,
        note: `${label} did not reach the playout server: ${item.name} is still on ${slotAddress(live.slot)} - ${off.detail}`,
        accepted,
      };
    }
    // Accepted: nothing of this item is up anywhere now, whatever the take below comes to - a row
    // still saying ON AIR after a refused take would be the one thing on the page that is not true.
    took('out', live.slot, off);
  }
  const action =
    verb === 'take' && sequence && sequence.length > 1
      ? sequenceAction(sequence, slot)
      : serverAction(verb, item, slot, values(), verb === 'take' ? cue.id : undefined, cut ? undefined : cue);
  const result = await act(action);
  if (result.state !== 'ok') return { ok: false, note: `${label} did not reach the playout server: ${result.detail}`, accepted };
  took(verb, slot, result);
  // On air, and part of it did not go through (a Clear at the end the server refused): said as the
  // one untrue thing a tick would otherwise hide.
  if (result.warning) return { ok: true, note: `${label}: ${item.name} is on ${slotAddress(slot)}, but ${result.warning}`, accepted };
  return { ok: true, note: `✓ ${label}: ${item.name} on ${slotAddress(slot)}`, accepted };
}
