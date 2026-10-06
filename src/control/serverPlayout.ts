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

import type { PlayoutItem, ShowCue, ShowFolder } from '../model/shows';
import type { PlayoutResult } from './playoutLink';
import { MAX_SEQUENCE_ENTRIES, MIN_SEQUENCE_MEMBER_S, type PlayoutAction, type SequenceEntry, type Slot } from './playoutProtocol.ts';
import { compareSlots, slotAddress } from './playoutSlots.ts';
import { folderIdOf, folderMembers, folderMode, liveFolderIds, membersByFolder, throughRefusal } from '../model/showFolders.ts';
import {
  asFolderMember,
  effectiveEnd,
  fileSeconds,
  memberProblem,
  NEEDS,
  outFade,
  playbackBlocker,
  playbackNeeds,
  segmentSeconds,
  takePlayback,
  type ClipEnd,
  type MemberProblem,
  type PlaybackAbility,
} from './cuePlayback.ts';

/** One item up on the server: the cue that put it there and the SLOT it was taken to. */
export interface ServerLive {
  cueId: string;
  slot: Slot;
  /** The Bridge's own id for this playback (./serverState.ts): a reading showing another id, or
   *  none, on this slot means something else plays there now. Absent from a Bridge that gives none. */
  instance?: string;
  /** When this page learned it is up, on its own clock (ms): the clip clock follows the latest. */
  takenAt?: number;
  /** What the Take sent for the clip's end, which the clip clock says: the cue's setting may have
   *  changed since, and applies only at the next Take. Absent after a reload. */
  end?: ClipEnd;
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
  extra: Pick<ServerLive, 'instance' | 'takenAt' | 'end'> = {},
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
 * A clip's take carries how the cue plays it (./cuePlayback.ts `takePlayback`): a cue with no
 * setting of its own sends exactly the action it always sent, and a looping one the old `loop`. Its
 * Out fades when the cue has a fade out. `cue` is the cue whose settings apply: the one taken, and
 * for Out the one on air.
 */
export function serverAction(verb: ServerVerb, item: PlayoutItem, slot: Slot, values: Record<string, string>, cueId?: string, cue?: Pick<ShowCue, 'playback' | 'imageFit'>): PlayoutAction {
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
      ...(item.kind === 'media' && item.mediaKind === 'still' && cue?.imageFit !== 'stretch' ? { imageFit: 'fit' as const } : {}),
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
 * resolved from the rundown as it stands - at the Take, and wherever the choice is made. It never
 * leaves the cue's own folder: from a cue in no folder it does not go into one, and from a cue in a
 * folder it stops at that folder's end. When no clip qualifies, the reason, in the words the editor
 * shows beside the disabled choice.
 */
export function playNextTarget(
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  cueId: string,
  addressOf: (item: PlayoutItem) => string,
  folders: readonly Pick<ShowFolder, 'id'>[] = [],
): PlayNext {
  // A production with no folders has none to stay inside.
  const live = folders.length ? liveFolderIds(cues, folders) : new Set<string>();
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
    if (folderIdOf(c, live) !== folderIdOf(cue, live)) return { ok: false, reason: 'the next clip is in another folder' };
    const problem = memberProblem(c, it, false);
    if (problem) {
      const reason = {
        still: `the next cue on ${address} is a still, which never ends`,
        kind: `the next clip on ${address} is not in the server's list yet, so its kind is not known`,
        length: `the next clip on ${address} has no known length`,
        short: `the next clip is shorter than ${MIN_SEQUENCE_MEMBER_S} seconds`,
      }[problem];
      return { ok: false, reason };
    }
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
  folders: readonly Pick<ShowFolder, 'id'>[] = [],
): { ok: true; members: SequenceMember[] } | { ok: false; reason: string } {
  const cue = cues.find((c) => c.id === cueId);
  const item = cue?.source === 'playout' ? items.find((i) => i.id === cue.sourceId) : undefined;
  if (!cue || !item) return { ok: false, reason: 'the cue is not in the rundown' };
  const members: SequenceMember[] = [{ cue, item }];
  while (effectiveEnd(members[members.length - 1].cue, members[members.length - 1].item) === 'next') {
    const last = members[members.length - 1];
    const t = playNextTarget(cues, items, last.cue.id, addressOf, folders);
    if (!t.ok) {
      if (members.length === 1) return { ok: false, reason: t.reason };
      break;
    }
    members.push({ cue: t.next.cue, item: t.next.item });
  }
  // Every member's kind and length go to the Bridge, which refuses a sequence without them: the
  // followers were checked on the way, and the first is checked here by the same rule.
  const first = members.length > 1 ? memberProblem(cue, item, true) : null;
  if (first === 'kind') return { ok: false, reason: 'this clip is not in the server\'s list yet, so its kind is not known' };
  if (first) return { ok: false, reason: 'this clip has no known length' };
  return { ok: true, members };
}

/**
 * WHY A TAKE OF THIS CUE - OR THIS FOLDER - WOULD NOT GO, or null (docs/CLIP_PLAYBACK_PLAN.md §6.9): a
 * setting of its own or of a clip it plays next that the running Bridge or its server cannot honour,
 * or a Play next whose clips cannot be found in the rundown as it stands. Such a cue is never taken the
 * old way in silence. A folder answers by how it plays (`folderTakeBlocker`), and `graphicOf` names
 * an All-together folder's graphics for it.
 */
export function takeBlocker(
  target: ShowCue | ShowFolder,
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  addressOf: (item: PlayoutItem) => string,
  ability: PlaybackAbility | null,
  folders: readonly ShowFolder[] = [],
  graphicOf: FolderRundown['graphicOf'] = () => null,
): string | null {
  // A folder by what it lacks: every cue names its source, and no folder does. Its mode cannot tell
  // them apart, since a folder record from another build may have none.
  if (!('sourceId' in target)) {
    const blockerOf = (c: ShowCue) => takeBlocker(c, cues, items, addressOf, ability, folders, graphicOf);
    return folderTakeBlocker(target, folderMembers(cues, folders, target.id), { items, addressOf, graphicOf, ability, blockerOf });
  }
  const cue = target;
  const item = cue.source === 'playout' ? items.find((i) => i.id === cue.sourceId) : undefined;
  if (item?.kind !== 'media') return null;
  // A clip of a Play-through folder plays by the folder's rules: from itself to the folder's end.
  const through = throughFolderOf(cue, cues, items, folders);
  if (through) return folderRunBlocker(folderRun(through, cues, items, cue.id), ability);
  if (item.mediaKind === 'still' && cue.imageFit !== 'stretch' && (cue.playback?.trimIn !== undefined || cue.playback?.trimOut !== undefined || effectiveEnd(cue, item) === 'loop')) {
    return 'Picture Fit holds until Out. Clear its trim and Loop setting, or choose Stretch.';
  }
  const own = playbackBlocker(playbackNeeds(cue, item), ability);
  if (own) return own;
  if (effectiveEnd(cue, item) !== 'next') return null;
  const chain = sequenceMembers(cues, items, cue.id, addressOf, folders);
  if (!chain.ok) return `This cue plays the next clip, but ${chain.reason}. Set another ending to take it.`;
  for (const m of chain.members.slice(1)) {
    const blocked = playbackBlocker(playbackNeeds(m.cue, m.item), ability);
    if (blocked) return `${m.cue.label}, which this cue plays next: ${blocked}`;
  }
  return null;
}

/** The sequence action for a chain of members (plan §9): each entry with the playback its own
 *  cue sets, and the last with its own ending. `loop` starts it over after its last (Loop the
 *  folder), and is sent only then: a sequence that ends is the action it always was. */
export function sequenceAction(members: readonly SequenceMember[], slot: Slot, loop = false): Extract<PlayoutAction, { verb: 'sequence' }> {
  const entries: SequenceEntry[] = members.map(({ cue, item }, i) => {
    const { loop: ownLoop, playback } = takePlayback(cue, item);
    const last = i === members.length - 1;
    const p = { ...(last && ownLoop ? { end: 'loop' as const } : {}), ...(playback ?? {}) };
    return {
      item: { kind: 'media', name: item.name },
      cueId: cue.id,
      ...(Object.keys(p).length ? { playback: p } : {}),
      // Known for every member: `sequenceMembers` checked each by the Bridge's own rule.
      media: { kind: item.mediaKind === 'audio' ? 'audio' : 'movie', seconds: fileSeconds(item) as number },
    };
  });
  return { verb: 'sequence', slot, entries, ...(loop ? { loop: true } : {}) };
}

/**
 * THE ACTION FOR AN ENDING CHANGED WHILE THE CLIP PLAYS (docs/backlog/looping-clip-end-change-while-playing.md):
 * the clip on air goes on, never played again, and ends the way its cue now says. `members` is the
 * cue's chain when it now plays next (`sequenceMembers`, the cue first): the files after it go as
 * `then`, each with the playback its own cue sets, exactly as a Take of the chain would send them.
 * Null when there is nothing the Bridge can be told: a still, which never ends, or Play next with no
 * clip after it. Sent only to a Bridge that lists the `ending` feature; without it the change
 * applies at the next Take, as it always did. Never for a clip of a Play-through folder: the folder
 * sets its ending, and its editor offers no At the end to change.
 */
export function endingAction(
  cue: Pick<ShowCue, 'playback'>,
  item: PlayoutItem,
  slot: Slot,
  members?: readonly SequenceMember[],
): Extract<PlayoutAction, { verb: 'ending' }> | null {
  if (item.kind !== 'media' || item.mediaKind === 'still') return null;
  const base = { verb: 'ending' as const, slot, item: { kind: 'media' as const, name: item.name } };
  const end = effectiveEnd(cue, item);
  if (end === 'next') {
    if (!members || members.length < 2) return null;
    return { ...base, then: sequenceAction(members, slot).entries.slice(1) };
  }
  if (end === 'hold') return base;
  const fadeOut = end === 'clear' ? outFade(cue) : undefined;
  return { ...base, playback: { end, ...(fadeOut !== undefined ? { fadeOut } : {}) } };
}

// ── A PLAY-THROUGH FOLDER (docs/CLIP_PLAYBACK_PLAN.md §6.4 to §6.6): one Take plays its clips in order
// on the folder's one slot, as one sequence the Bridge runs. ──

/**
 * The Play-through folder a cue plays in, or none: a folderId that names no folder is in none, and a
 * cue that cannot play through - a still or a graphic an older build or a merge left there - is taken
 * on its own Take as if it were in none. The folder's Take is refused, naming it.
 */
export function throughFolderOf(
  cue: ShowCue,
  cues: readonly Pick<ShowCue, 'id' | 'folderId'>[],
  items: readonly PlayoutItem[],
  folders: readonly ShowFolder[] | undefined,
): ShowFolder | undefined {
  const id = folderIdOf(cue, liveFolderIds(cues, folders));
  const folder = id ? folders?.find((f) => f.id === id) : undefined;
  return folder?.mode === 'through' && !throughRefusal(cue, items) ? folder : undefined;
}

/** A clip's place in a Play-through folder, which decides what its row and its panel say of its end. */
export type ThroughRole = 'middle' | 'last' | 'loop-last' | 'loop-alone';

/** What a Play-through folder says of a clip's end in place of the clip's own choice (plan §6.5), on
 *  its row and in its panel alike. The last clip of a folder that ends says its own. */
export const THROUGH_END: Partial<Record<ThroughRole, { glyph: string; words: string }>> = {
  middle: { glyph: '→', words: 'Plays the next, set by the folder' },
  'loop-last': { glyph: '⟲', words: 'Starts the folder over, set by the folder' },
  'loop-alone': { glyph: '⟲', words: 'Loops until Out, set by the folder' },
};

/**
 * Every clip that plays in a Play-through folder, with the folder and its place in it, in one pass
 * over the rundown - by the rule of `throughFolderOf` - so the rows, the panel and the two-slot
 * check read it without searching the rundown once per cue.
 */
export function throughPlaces(
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  folders: readonly ShowFolder[] | undefined,
): ReadonlyMap<string, { folder: ShowFolder; role: ThroughRole }> {
  const byFolder = membersByFolder(cues, folders);
  const out = new Map<string, { folder: ShowFolder; role: ThroughRole }>();
  const seen = new Set<string>();
  for (const folder of folders ?? []) {
    // A folder id written twice is read once, the first entry winning, as everywhere.
    if (seen.has(folder.id)) continue;
    seen.add(folder.id);
    const members = byFolder.get(folder.id);
    if (folder.mode !== 'through' || !members) continue;
    const loop = folder.end === 'loop';
    members.forEach((c, at) => {
      if (throughRefusal(c, items)) return;
      const role: ThroughRole = members.length === 1 ? (loop ? 'loop-alone' : 'last') : at < members.length - 1 ? 'middle' : loop ? 'loop-last' : 'last';
      out.set(c.id, { folder, role });
    });
  }
  return out;
}

/** What a Take of a Play-through folder plays: its members in play order, each as the folder plays
 *  it, and whether the sequence starts over after the last. */
export interface FolderRun {
  members: SequenceMember[];
  /** Never for a single member: that one loops as a plain Take, through the legacy `loop`. */
  loop: boolean;
}

/** Why a clip cannot join the folder's sequence, as one sentence naming it. */
function memberWords(problem: MemberProblem, m: SequenceMember, loop: boolean): string {
  const label = m.cue.label;
  if (problem === 'still') return `${label} is a still, which never ends.`;
  if (problem === 'kind') return `${label} is not in the server's list yet, so its kind is not known.`;
  if (problem === 'length') return `${label} has no known length.`;
  const seconds = Math.round((segmentSeconds(m.cue, m.item) ?? 0) * 10) / 10;
  return loop
    ? `${label} plays ${seconds} s; in a folder that loops, every clip plays at least ${MIN_SEQUENCE_MEMBER_S} s.`
    : `${label} plays ${seconds} s; in a folder that plays through, every clip after the first plays at least ${MIN_SEQUENCE_MEMBER_S} s.`;
}

/**
 * WHAT A TAKE OF A PLAY-THROUGH FOLDER PLAYS: from `fromCueId` (its first clip when none is named) to
 * its last, on the folder's slot; with Loop the folder, on round to the one before `fromCueId`, so the
 * loop covers every clip whichever was taken. The members are the folder's cues in rundown order,
 * across a split folder's runs. Refused with the reason, naming the clip, when one cannot play through
 * or cannot join a sequence: only a clip or an audio file whose kind and length the server's list has
 * given, and each after the first - every one, when the folder loops - at least two seconds.
 */
export function folderRun(
  folder: Pick<ShowFolder, 'id' | 'end' | 'name'>,
  cues: readonly ShowCue[],
  items: readonly PlayoutItem[],
  fromCueId?: string,
): { ok: true; run: FolderRun } | { ok: false; reason: string } {
  const all = cues.filter((c) => c.folderId === folder.id);
  const at = fromCueId === undefined ? 0 : all.findIndex((c) => c.id === fromCueId);
  if (!all.length || at < 0) return { ok: false, reason: 'the clip is not in the folder' };
  const loop = folder.end === 'loop';
  const order = loop ? [...all.slice(at), ...all.slice(0, at)] : all.slice(at);
  if (order.length > MAX_SEQUENCE_ENTRIES) {
    return { ok: false, reason: `${folder.name} holds ${order.length} clips; a folder that plays through plays at most ${MAX_SEQUENCE_ENTRIES}.` };
  }
  const members: SequenceMember[] = [];
  for (let i = 0; i < order.length; i++) {
    const c = order[i];
    const refused = throughRefusal(c, items);
    if (refused) return { ok: false, reason: refused };
    const item = items.find((x) => x.id === c.sourceId)!;
    // One clip that loops is a plain looping Take; every other clip plays as the folder plays it.
    const cue = order.length === 1 && loop ? { ...c, playback: { ...c.playback, end: 'loop' as const } } : asFolderMember(c, item, !loop && i === order.length - 1);
    members.push({ cue, item });
  }
  if (members.length > 1) {
    for (let i = 0; i < members.length; i++) {
      const problem = memberProblem(members[i].cue, members[i].item, i === 0 && !loop);
      if (problem) return { ok: false, reason: memberWords(problem, members[i], loop) };
    }
  }
  return { ok: true, run: { members, loop: loop && members.length > 1 } };
}

/**
 * Why a Take of a Play-through folder would not go with this Bridge and server, or null - judged on
 * the members as the folder plays them, so a clip before the last that is set to Clear asks nothing
 * of a server that cannot clear. A folder carrying a setting nobody here can honour is never taken the
 * old way in silence (plan §6.9).
 */
export function folderRunBlocker(r: ReturnType<typeof folderRun>, ability: PlaybackAbility | null): string | null {
  if (!r.ok) return r.reason;
  const { members, loop } = r.run;
  if (members.length > 1) {
    // Playing through first: without the sequence at all, the loop's sentence would be the wrong fix.
    const own = playbackBlocker([NEEDS.through], ability, 'This folder') ?? (loop ? playbackBlocker([NEEDS.folderLoop], ability, 'This folder') : null);
    if (own) return own;
  }
  for (const m of members) {
    const blocked = playbackBlocker(playbackNeeds(m.cue, m.item), ability);
    if (blocked) return members.length > 1 ? `${m.cue.label}, which this folder plays: ${blocked}` : blocked;
  }
  return null;
}

// ── ALL TOGETHER (docs/CLIP_PLAYBACK_PLAN.md §6.6): one Take starts every cue of the folder - its
// server cues one after another, one take action each, exactly what a Take of that cue alone sends,
// then its graphics through the web. Everything that would refuse it is found before anything is
// sent; after that a failure never stops the rest, and nothing is retried. ──

/** A graphic cue of a folder: its pool graphic's name (liveCue's key) and its graphicLayer. */
export interface GraphicMember {
  cue: ShowCue;
  graphic: string;
  layer: number;
}

/** The rundown as the folder rules read it, with the page's own lookups handed in. */
export interface FolderRundown {
  items: readonly PlayoutItem[];
  /** slotAddress(itemSlot(settings, item)): the addressOf the page hands playNextTarget. */
  addressOf: (item: PlayoutItem) => string;
  /** A graphic cue's pool graphic, or null when it is gone. */
  graphicOf: (cue: ShowCue) => { name: string; layer: number } | null;
  ability: PlaybackAbility | null;
  /** The page's own Take check for one cue (takeBlocker), Play next's folder limit included. */
  blockerOf: (cue: ShowCue) => string | null;
}

export type TogetherPlan =
  | { ok: true; server: readonly SequenceMember[]; graphics: readonly GraphicMember[] }
  | { ok: false; reason: string };

/** The first two positions of a list that clash, earliest first, or null: what a folder's Take names. */
function firstPair(list: readonly unknown[], clash: (i: number, j: number) => boolean): [number, number] | null {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (clash(i, j)) return [i, j];
  return null;
}

/** Why a folder with a server cue cannot be taken for want of NoaCG Bridge, or null. */
function bridgeGate(first: ShowCue | undefined, ability: PlaybackAbility | null): string | null {
  if (!first) return null;
  if (!ability) return 'Asking NoaCG Bridge what it can play…';
  if (ability.state !== 'ok') return `${first.label} plays on the playout server, and NoaCG Bridge is not connected.`;
  return null;
}

/**
 * WHAT AN ALL-TOGETHER TAKE SENDS, or why it cannot go - found before anything is sent, the first
 * problem in this order, as one sentence naming the cue: a file or graphic that is gone; two server
 * cues on one slot; two cues of one graphic; two graphics on one layer; a server cue while NoaCG
 * Bridge is not there; any server cue's own Take check. A server cue set to Play next finds no clip
 * inside the folder to play, so it blocks with that check's own reason.
 */
export function togetherPlan(members: readonly ShowCue[], r: FolderRundown): TogetherPlan {
  const server: SequenceMember[] = [];
  const graphics: GraphicMember[] = [];
  for (const cue of members) {
    if (cue.source === 'playout') {
      const item = r.items.find((i) => i.id === cue.sourceId);
      if (!item) return { ok: false, reason: `${cue.label} plays a file this production no longer lists.` };
      server.push({ cue, item });
    } else {
      const g = r.graphicOf(cue);
      if (!g) return { ok: false, reason: `${cue.label} points at a graphic this production no longer has.` };
      graphics.push({ cue, graphic: g.name, layer: g.layer });
    }
  }
  const addresses = server.map((m) => r.addressOf(m.item));
  const sameSlot = firstPair(server, (i, j) => addresses[i] === addresses[j]);
  if (sameSlot) {
    const [a, b] = sameSlot;
    return { ok: false, reason: `${server[a].cue.label} and ${server[b].cue.label} both play on ${addresses[a]}, which holds one thing at a time. Move one of them to another layer to take this folder.` };
  }
  const sameGraphic = firstPair(graphics, (i, j) => graphics[i].graphic === graphics[j].graphic);
  if (sameGraphic) {
    const [a, b] = sameGraphic.map((i) => graphics[i]);
    return { ok: false, reason: `${a.cue.label} and ${b.cue.label} are both cues of ${a.graphic}, which shows one cue at a time. Keep one of them in this folder.` };
  }
  const sameLayer = firstPair(graphics, (i, j) => graphics[i].layer === graphics[j].layer);
  if (sameLayer) {
    const [a, b] = sameLayer.map((i) => graphics[i]);
    return { ok: false, reason: `${a.cue.label} and ${b.cue.label} both air on layer ${a.layer}. Give one of their graphics another layer to take this folder.` };
  }
  const gate = bridgeGate(server[0]?.cue, r.ability);
  if (gate) return { ok: false, reason: gate };
  for (const m of server) {
    const blocked = r.blockerOf(m.cue);
    if (blocked) return { ok: false, reason: `${m.cue.label}: ${blocked}` };
    // Never sent as a Hold: every cue of this folder starts at once, so there is nothing to play next.
    if (m.item.kind === 'media' && effectiveEnd(m.cue, m.item) === 'next') {
      return { ok: false, reason: `${m.cue.label}: This cue plays the next clip, and every cue of this folder starts at once. Set another ending to take it.` };
    }
  }
  return { ok: true, server, graphics };
}

/**
 * Why a Take of this folder would not go, or null. One by one steps, each press one cue's own Take,
 * judged on that cue at the press (./folderStep.ts); All together by its plan; Play through by its
 * run, and neither while NoaCG Bridge is not there to send it to.
 */
export function folderTakeBlocker(folder: Pick<ShowFolder, 'id' | 'mode' | 'end' | 'name'>, members: readonly ShowCue[], r: FolderRundown): string | null {
  // Read as it is drawn: a mode this build does not know is One by one here too.
  const mode = folderMode(folder);
  if (mode === 'manual') return null;
  if (mode === 'together') {
    const plan = togetherPlan(members, r);
    return plan.ok ? null : plan.reason;
  }
  return bridgeGate(members[0], r.ability) ?? folderRunBlocker(folderRun(folder, members, r.items), r.ability);
}

/** What one member's send came to: whether it is on air, and the note line's sentence for it. */
export interface MemberTake {
  ok: boolean;
  note: string;
}

export interface MemberResult extends MemberTake {
  cueId: string;
  label: string;
  /** False when the folder was taken off before this member's turn came. */
  sent: boolean;
}

/** How a run reaches air, handed in by the page: its own verbs, one member at a time. */
export interface TogetherSend {
  server: (m: SequenceMember) => Promise<MemberTake>;
  graphic: (g: GraphicMember) => Promise<MemberTake>;
  /** Take back off a member whose take landed after Out or All out stopped the run. */
  off: (m: SequenceMember | GraphicMember) => Promise<void>;
  /** Out or All out has been pressed since the run began. */
  stopped: () => boolean;
}

/**
 * THE RUN: the server cues one after another, each awaited, then the graphics, all started at once so
 * that on a published production they land together rather than a round trip apart (docs/
 * CLIP_PLAYBACK_PLAN.md §20.1). A refusal never stops the rest and nothing is retried. Once Out or
 * All out is pressed, nothing more is sent, and a member whose take lands after it is taken back off,
 * so nothing airs after either. The results come back in rundown order.
 */
export async function runTogether(plan: Extract<TogetherPlan, { ok: true }>, send: TogetherSend): Promise<MemberResult[]> {
  const one = async (member: SequenceMember | GraphicMember, go: () => Promise<MemberTake>): Promise<MemberResult> => {
    const { cue } = member;
    if (send.stopped()) return { cueId: cue.id, label: cue.label, ok: false, sent: false, note: `${cue.label} was not sent: the folder was taken off first.` };
    const r = await go();
    if (r.ok && send.stopped()) await send.off(member);
    return { ...r, cueId: cue.id, label: cue.label, sent: true };
  };
  const results: MemberResult[] = [];
  for (const m of plan.server) results.push(await one(m, () => send.server(m)));
  results.push(...(await Promise.all(plan.graphics.map((g) => one(g, () => send.graphic(g))))));
  return results;
}

/** The note line after an All-together Take: `✓ Take: Opening, 3 of 3 on air`, or the count and
 *  every member's own sentence where one did not go, or went with a warning. */
export function togetherNote(folderName: string, results: readonly MemberResult[]): string {
  const up = results.filter((r) => r.ok).length;
  const said = results.filter((r) => !r.ok || !r.note.startsWith('✓'));
  if (!said.length) return `✓ Take: ${folderName}, ${up} of ${results.length} on air`;
  const sentence = (note: string) => (/[.!?…]$/.test(note) ? note : `${note}.`);
  return [`Take: ${folderName}, ${up} of ${results.length} on air.`, ...said.map((r) => sentence(r.note))].join(' ');
}

/**
 * WHICH FILE THE CLOCK FOLLOWS after an All-together Take: the longest (plan §6.4). Each server member
 * is ranked, least preferred first - a clip or audio file with a known length over anything else, one
 * that ends over one that loops, the longer played segment, a movie over audio, the earlier row - and
 * the page stamps each member's take with the press time plus its rank, so the clock follows the
 * most preferred one still up without flickering from member to member as they land.
 */
export function clockRank(server: readonly SequenceMember[]): ReadonlyMap<string, number> {
  const key = ({ cue, item }: SequenceMember, row: number) => {
    const seconds = item.kind === 'media' && item.mediaKind !== 'still' ? segmentSeconds(cue, item) : undefined;
    return [seconds ? 1 : 0, item.kind === 'media' && effectiveEnd(cue, item) !== 'loop' ? 1 : 0, seconds ?? 0, item.mediaKind === 'audio' ? 0 : 1, -row];
  };
  const ranked = server.map((m, row) => ({ id: m.cue.id, k: key(m, row) }));
  ranked.sort((a, b) => {
    for (let i = 0; i < a.k.length; i++) if (a.k[i] !== b.k[i]) return a.k[i] - b.k[i];
    return 0;
  });
  return new Map(ranked.map((r, rank) => [r.id, rank]));
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
  loop,
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
  /** The sequence starts over after its last clip (a Play-through folder's Loop the folder). */
  loop?: boolean;
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
      ? sequenceAction(sequence, slot, loop)
      : serverAction(verb, item, slot, values(), verb === 'take' ? cue.id : undefined, cut ? undefined : cue);
  const result = await act(action);
  if (result.state !== 'ok') return { ok: false, note: `${label} did not reach the playout server: ${result.detail}`, accepted };
  took(verb, slot, result);
  // On air, and part of it did not go through (a Clear at the end the server refused): said as the
  // one untrue thing a tick would otherwise hide.
  if (result.warning) return { ok: true, note: `${label}: ${item.name} is on ${slotAddress(slot)}, but ${result.warning}`, accepted };
  return { ok: true, note: `✓ ${label}: ${item.name} on ${slotAddress(slot)}`, accepted };
}
