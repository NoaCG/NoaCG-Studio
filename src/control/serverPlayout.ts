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
import type { PlayoutAction, Slot } from './playoutProtocol';
import { compareSlots, slotAddress } from './playoutSlots.ts';

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

/** The one action a verb sends. The action carries no page state, so the same object is what a
 *  log row would carry later. A take names its cue, which the Bridge keeps with what it started
 *  so a reading can say which cue is up after a reload (docs/CLIP_PLAYBACK_PLAN.md §6.7). */
export function serverAction(verb: ServerVerb, item: PlayoutItem, slot: Slot, values: Record<string, string>, cueId?: string): PlayoutAction {
  const itemRef = { kind: item.kind, name: item.name };
  return verb === 'take'
    ? {
        verb,
        item: itemRef,
        slot,
        ...(item.kind === 'template' ? { data: values } : {}),
        // A looping clip is CasparCG's own `PLAY … LOOP`: the server repeats it until Out.
        ...(item.kind === 'media' && item.loop ? { loop: true } : {}),
        ...(cueId ? { cueId } : {}),
      }
    : verb === 'update'
      ? { verb, slot, data: values }
      : { verb, slot, item: itemRef };
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
}: {
  verb: ServerVerb;
  cue: ShowCue;
  item: PlayoutItem;
  label: string;
  live: ServerLive | undefined;
  slotNow: Slot;
  values: () => Record<string, string>;
  act: (action: PlayoutAction) => Promise<PlayoutResult>;
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
  const result = await act(serverAction(verb, item, slot, values(), verb === 'take' ? cue.id : undefined));
  if (result.state !== 'ok') return { ok: false, note: `${label} did not reach the playout server: ${result.detail}`, accepted };
  took(verb, slot, result);
  return { ok: true, note: `✓ ${label}: ${item.name} on ${slotAddress(slot)}`, accepted };
}
