// A FOLDER ON AIR (docs/CLIP_PLAYBACK_PLAN.md §6.6, phase 4): every state a folder's header - or a
// hardware button standing for it (docs/backlog/companion-and-stream-deck.md) - lights, as plain data
// from one function.
//
// It reads what the verbs read and nothing that moves with the clock: the store's OWNERSHIP part
// (./serverState.ts) for the server cues and the page's `liveCue` for the graphics, never the TIMING
// part. So a reading that only moves a clip's position hands the page the same object as before, and
// the page does not re-render twice a second (plan §10, §18 case 15).
//
// Plain functions over plain data that import nothing but types and `.ts` runtime modules, so
// scripts/server-playout.test.mjs runs them in Node without a browser.

import type { PlayoutItem, ShowCue, ShowFolder } from '../model/shows';
import { folderMode, membersByFolder } from '../model/showFolders.ts';
import { effectiveEnd } from './cuePlayback.ts';
import { serverCueLive } from './serverPlayout.ts';
import { slotRun, type ServerOwnership } from './serverState.ts';
import { slotAddress } from './playoutSlots.ts';

export interface FolderAir {
  mode: ShowFolder['mode'];
  /** Every cue of the folder, across the runs of a split one. */
  total: number;
  /** Its cues on air now, in rundown order, by the same rule every row's ON AIR follows. */
  onAir: readonly string[];
  /** Of those, the graphics up on this page only, before the first publish (D12); absent when none. */
  upHere?: number;
  /** `partial`: All together with only part of it up. A One-by-one or Play-through folder with any of
   *  it up is `on`. */
  lit: 'off' | 'on' | 'partial';
  /** Play through: how many files still follow the one on air on its slot. */
  following: number;
  /** Play through: its run never ends by itself - Loop the folder, a last file that loops, or a
   *  single clip taken to loop. */
  looping: boolean;
  /** Play through, while up: where it plays, `2-10`. */
  slot?: string;
  /** Play through: its run stopped when NoaCG Bridge restarted, and what the server had queued
   *  plays by the server's own rule. */
  stopped: boolean;
}

export interface FolderAirInput {
  folders: readonly ShowFolder[];
  cues: readonly ShowCue[];
  items: readonly PlayoutItem[];
  /** The store's OWNERSHIP part. There is deliberately no timing input. */
  ownership: ServerOwnership;
  /** Which cue is on air on each graphic's layer, by graphic name. */
  liveCue: Readonly<Record<string, string>>;
  graphicName: (cue: ShowCue) => string | null;
  /** The production is published, so a graphic's Take reaches air. False, a graphic that is up plays
   *  on this page only and is counted in `upHere`. Absent reads as published. */
  graphicsAir?: boolean;
}

/** Whether one cue is on air: a server cue by what this page has up on the server, a graphic by its
 *  layer's live cue. */
export function cueOnAir(cue: ShowCue, input: Pick<FolderAirInput, 'items' | 'ownership' | 'liveCue' | 'graphicName'>): boolean {
  if (cue.source === 'playout') return serverCueLive(input.ownership.onAir, input.items.find((i) => i.id === cue.sourceId) ?? null, cue);
  const graphic = input.graphicName(cue);
  return !!graphic && input.liveCue[graphic] === cue.id;
}

/** Every folder that reads as present, by id; a folder no cue names has no entry. */
export function folderAir(input: FolderAirInput): Readonly<Record<string, FolderAir>> {
  const out: Record<string, FolderAir> = {};
  const byFolder = membersByFolder(input.cues, input.folders);
  for (const folder of input.folders) {
    const members = byFolder.get(folder.id);
    if (!members || out[folder.id]) continue;
    const onAir = members.filter((c) => cueOnAir(c, input));
    let following = 0;
    let looping = false;
    let slot: string | undefined;
    const mode = folderMode(folder);
    if (mode === 'through') {
      for (const cue of onAir) {
        const item = input.items.find((i) => i.id === cue.sourceId);
        const live = item ? input.ownership.onAir[item.id] : undefined;
        if (!item || item.kind !== 'media' || !live) continue;
        const run = slotRun(input.ownership, live, effectiveEnd(cue, item));
        following = run.following;
        looping = run.loops;
        slot = slotAddress(live.slot);
      }
    }
    const lit = !onAir.length ? 'off' : mode === 'together' && onAir.length < members.length ? 'partial' : 'on';
    const ids = new Set(members.map((c) => c.id));
    const stopped = mode === 'through' && input.ownership.unidentified.some((u) => u.sequenceStopped && !!u.cueId && ids.has(u.cueId));
    const upHere = input.graphicsAir === false ? onAir.filter((c) => c.source !== 'playout').length : 0;
    out[folder.id] = { mode, total: members.length, onAir: onAir.map((c) => c.id), ...(upHere ? { upHere } : {}), lit, following, looping, ...(slot ? { slot } : {}), stopped };
  }
  return out;
}

const cues = (n: number) => `${n} cue${n === 1 ? '' : 's'}`;

/**
 * What a folder's header says about air, in the tag's words and its tooltip's, or null for nothing:
 * `ON AIR`, `2 OF 3 ON AIR` for part of an All-together folder, `2 ON AIR` for a One-by-one folder,
 * and `NOT TAKEN` when the last Take of it put nothing up (`missed` of its cues failed), so a
 * collapsed folder never hides a failure.
 */
export function folderAirWords(air: FolderAir | undefined, missed: number): { tag: string; tone: 'air' | 'part' | 'miss' | 'up'; title: string } | null {
  if (!air) return null;
  const up = air.onAir.length;
  if (!up) return missed ? { tag: 'NOT TAKEN', tone: 'miss', title: 'The last Take of this folder put nothing on air. Each cue says why.' } : null;
  // Before the first publish a graphic plays on this page only (playout-workflow-simplification
  // D12): it is UP, as on its row, and only the server cues that air either way say ON AIR.
  const local = Math.min(air.upHere ?? 0, up);
  if (local) {
    const airs = up - local;
    const tag = airs ? `${airs} ON AIR · ${local} UP` : air.mode === 'together' && up < air.total ? `${up} OF ${air.total} UP` : air.mode === 'manual' ? `${up} UP` : 'UP';
    return { tag, tone: airs ? 'part' : 'up', title: `${cues(local)} up on this page only: the production is not published.` };
  }
  if (air.mode === 'through') {
    const where = air.slot ?? 'its slot';
    const title = air.looping
      ? `Plays through on ${where} and starts over after its last clip, until Out.`
      : air.following
        ? `Plays through on ${where}; ${air.following === 1 ? 'one more clip follows' : `${air.following} more clips follow`}.`
        : `The last clip plays on ${where}.`;
    return { tag: 'ON AIR', tone: 'air', title };
  }
  if (air.mode === 'manual') return { tag: `${up} ON AIR`, tone: 'air', title: `${cues(up)} of this folder ${up === 1 ? 'is' : 'are'} on air. Out takes ${up === 1 ? 'it' : 'them'} off.` };
  if (up < air.total) return { tag: `${up} OF ${air.total} ON AIR`, tone: 'part', title: `${up} of the ${cues(air.total)} of this folder ${up === 1 ? 'is' : 'are'} on air. Out takes ${up === 1 ? 'it' : 'them'} off.` };
  return { tag: 'ON AIR', tone: 'air', title: `All ${cues(air.total)} of this folder are on air.` };
}
