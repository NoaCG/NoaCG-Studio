// THE BRIDGE WATCH: everything the production page asks NoaCG Bridge on its own, as one lifecycle
// (docs/BRIDGE.md, docs/CLIP_PLAYBACK_PLAN.md §6.7, docs/work-specs/studio-day-playout D17, AC-7).
// Whether the server answers, the studio setup the Bridge keeps, what the NoaCG output's slot
// holds, whether the rundown's server files are there, what an older clip is, and what each
// channel the rundown uses holds. Every request here only reads, apart from the studio sync, which
// writes the Bridge's own setup file; nothing in here can air or clear anything.
//
// Moved out of ProductionPage with its requests, intervals and answers unchanged (production-page
// refactor, phase 6), where it was five polls in seven effects, each with its own dependency list.
// Here each poll has one explicit key, and the status is read from the `bridge` part rather than
// from a render, so a poll keyed on an answering Bridge starts once per answer, never once for the
// render that cleared the status and again for the one that filled it (the double-run note the page
// kept beside the status poll). The keys:
//
//   status        the target (Bridge, token, server), Check again
//   studio setup  once per start, and again when the Bridge answers while a change is pending
//   output slot   published, CasparCG on, answering, readable, output slug, production, target,
//                 the slot rev (Put on air, Take off)
//   server files  answering, the rundown's file key (null when it has no server cue)
//   older clips   answering, the production and the settings rev, once each (`learntFacts`)
//   server state  readable, has server items, the settings rev
//
// Check again restarts the status, which clears it, so every poll waiting on an answer starts again
// with the next one: the file check needs no key of its own for it (the page's effect had one, which
// asked the server's lists once more for a render that dropped the answer).
//
// THE OUTPUT COMES BACK BY ITSELF (issue #1657, owner 2026-10-24): an output this page loaded, seen
// on its slot and then read empty (a CasparCG restart wipes every layer) is loaded again onto the
// same slot, as a Bridge restart already recovers. Only after the server or the Bridge stopped
// answering since the slot last held ours, so another browser's Unload or a client's CLEAR is left
// alone. Never a slot another production or client took,
// which still asks; never after Unload or once the slot stops being watched (unpublished, CasparCG
// switched off); at most RELOAD_AFTER_READS.length tries, spaced by empty readings, then the part
// says it failed and Load is the operator's. What airs after a reload follows the command log, as
// for any output loaded fresh.
//
// "LOADED HERE" IS THIS BROWSER'S, NOT THE PAGE'S (#2245): each Load is kept per production in this
// browser's storage with its own stamp (`io.loadedOutput` / `io.keepLoaded`), and read fresh at every
// decision, so a page reloaded, or left and opened again, after the Load still brings it back, and an
// Unload in any tab disarms them all. A page arms for a Load only once it has seen the output on
// that slot itself (`seenAt`), or, opened during an outage, from the note a tab that had seen it
// wrote (`seen`, #2249). A reading that gives the slot up (another production, another
// client's clip or CLEAR) forgets that Load only while it is still the one kept, so a stale tab never
// erases a newer Load; Unload, unpublish and CasparCG off forget it outright. Of the tabs armed for a
// production, one holds its lock (`io.lead`) and alone reloads and counts the tries; the others
// watch, and one takes over if it closes.
//
// WHAT IS KEPT WHERE. In the browser's record (`LoadedOutput`, shared by its tabs): the Load and its
// stamp (`at`), the last outage any tab saw (`outageAt`), the tries made for it and why the last
// failed (`tries`, `reason`), and the Bridge's link to the server when ours was last found there
// (`link`, #2252), so a slot emptied under another link is a restart no poll saw. Each slot reading
// carries the outage noted and the link kept when it went out, which decides what it may conclude
// without comparing clocks between tabs: an empty one sent during an outage, or under another link
// than the one kept, never reads as a CLEAR, and one finding ours ends the recovery only for the
// outage it was sent during. In the page: the Load it has seen on the slot (`seenAt`), when its last reading of
// ours went out (`oursAt`), its own outage flag (used only while storage refuses writes, with
// `local`), the lock (`lead`), and a reload it has out (`reloads`, `sending`, `handOver`).
//
// The Bridge, the studio's settings, the page's storage and the browser's timers and visibility come
// in through `io`, the page's rundown and stores through `adapters`. Runtime imports carry `.ts` so
// Node resolves them (scripts/bridge-watch.test.mjs); everything else is a type.

import type { PlayoutItem, PlayoutMediaKind, ShowCue, ShowFolder } from '../model/shows';
import type { PlayoutResult, PlayoutSettings, StudioSync } from './playoutLink';
import type { CasparSlot, ItemKind, ListItem, SlotState, StateReply } from './playoutProtocol';
import type { BridgePart, PlayoutSession } from './playoutSession';
import type { SlotReading, StatusCheck } from './playoutStatus';
import type { ServerPlayoutStore } from './serverPlayoutStore';
import { folderMode } from '../model/showFolders.ts';
import { mediaKindOf } from './cuePlayback.ts';
import { slotHolds } from './prepareLive.ts';
import { casparOutputTarget } from './playoutStatus.ts';
import { applyReading } from './serverState.ts';
import { pollServerState } from './serverStatePoll.ts';

/** How often the output's slot is read while it may be read. */
export const SLOT_READ_MS = 10_000;

/** When each reload of a lost output is tried, in empty readings since the try before it: the
 *  first at once, then after two readings (the one straight after the try and one 10 s on), then
 *  after six. A server still failing after the last one is the operator's to Load. */
export const RELOAD_AFTER_READS = [0, 2, 6] as const;

/** A kept Load younger than this is not given up by a page that has not seen it on its slot yet:
 *  the slot may not show a fresh load at once. Two slot readings. */
export const FRESH_LOAD_MS = 2 * SLOT_READ_MS;

export interface BridgeWatchIo {
  /** The studio's settings as they stand now. */
  loadSettings: () => PlayoutSettings;
  /** Enough filled in to ask a Bridge at all (control/playoutLink.ts `playoutConfigured`). */
  configured: (settings: PlayoutSettings) => boolean;
  /** Whether this Bridge and server can say what is playing (playoutLink.ts `stateReadable`). */
  readable: (status: PlayoutResult | null) => boolean;
  /** The Bridge's word on the server, every few seconds; answers the unsubscribe. */
  subscribeTargetStatus: (settings: PlayoutSettings, onStatus: (result: PlayoutResult) => void) => () => void;
  readState: (settings: PlayoutSettings, channel: number) => Promise<{ result: PlayoutResult; reply?: StateReply }>;
  listLibrary: (settings: PlayoutSettings, kind: ItemKind) => Promise<{ result: PlayoutResult; items?: ListItem[] }>;
  syncStudio: () => Promise<StudioSync>;
  /** This production was seen on its CasparCG slot at `target` (model/readyMemory.ts). */
  rememberOutput: (showId: string, target: string) => void;
  /** The Load of this production's output this browser keeps, or null (model/readyMemory.ts
   *  `casparLoaded`, #2245); and keeping or forgetting one: whether storage took it. */
  loadedOutput: (showId: string) => LoadedOutput | null;
  keepLoaded: (showId: string, next: LoadedOutput | null) => boolean;
  /** Ask for `key` among this browser's tabs: held by one at a time, the next asker's once released. */
  lead: (key: string) => Lead;
  /** Run `run` every `ms`; answers the stop. */
  every: (ms: number, run: () => void) => () => void;
  /** Run `run` whenever the tab comes back into view; answers the stop. */
  onVisible: (run: () => void) => () => void;
  /** The wall clock, ms: the same in every tab of the browser. */
  now: () => number;
  /** Run `run` whenever the tab goes out of view; answers the stop. */
  onHidden: (run: () => void) => () => void;
  /** The tab is out of view now. */
  hidden: () => boolean;
}

/** A Load this browser made: the slot (control/playoutStatus.ts `casparOutputTarget`), its stamp,
 *  and when a tab last saw the server or the Bridge stop answering, so a tab that missed it (a
 *  background tab the browser slows) still knows. */
export interface LoadedOutput {
  target: string;
  at: number;
  outageAt?: number;
  /** That outage was noted by a tab that had seen this Load on its slot, so the output was there
   *  when the server went: a page opened during the outage arms on it (#2249). */
  seen?: true;
  /** Reloads tried since that outage, by whichever tab led: three in all, not three per tab. */
  tries?: number;
  /** Why the last try did not bring it back, for the failed state in any tab. */
  reason?: string;
  /** The Bridge's link to the server (#2252) when a tab last found the output on its slot. A
   *  reading under another link comes after the connection was lost, which a CasparCG restart
   *  does, so an empty slot then is a restart even if no poll of any tab saw the server gone. */
  link?: string;
}

/** What the page kept when a slot read went out (the Load's stamp, and the outage noted then),
 *  and when it went out. */
interface Before {
  at: number | undefined;
  outageAt: number | undefined;
  link: string | undefined;
  issued: number;
}

export interface Lead {
  held: () => boolean;
  release: () => void;
  /** Another tab of the browser is waiting for it (#2251). */
  waiting: () => Promise<boolean>;
}

export interface BridgeWatchAdapters {
  /** The rundown as the page holds it now, read when a channel or a reading needs it. */
  rundown: () => { cues: readonly ShowCue[]; playoutItems: readonly PlayoutItem[]; folders: readonly ShowFolder[] };
  /** Where an item and a Play-through folder play (control/playoutLink.ts). */
  slots: {
    itemSlot: (settings: PlayoutSettings, item: { channel?: number; layer: number }) => CasparSlot;
    folderSlot: (settings: PlayoutSettings, folder: Pick<ShowFolder, 'slot'>) => CasparSlot;
  };
  /** The server's ownership and timing, which each reading folds into. */
  serverPlayout: Pick<ServerPlayoutStore, 'ownership' | 'apply'>;
  /** The Bridge's studio setup changed this browser's: the page re-reads its settings. */
  settingsChanged: () => void;
  /** The server's list filled in facts an older clip was missing (model/shows.ts `fillPlayoutItemFacts`). */
  learnt: (showId: string, facts: Map<string, { mediaKind?: PlayoutMediaKind; frames?: number; fps?: number }>) => void;
  /** Load this production's output on its slot again, as Load does, unless an output action is
   *  already out: the Bridge's answer, or null when nothing was sent. The watch decides whether. */
  reload: () => Promise<PlayoutResult | null>;
}

/** What the page knows at a render, handed over after each one. */
export interface BridgeInputs {
  /** Where the status is asked (Bridge, token, server), or null when nothing may be: CasparCG off
   *  for this production, or no Bridge set up in this browser. */
  target: string | null;
  hostedSlug: string | null;
  casparOn: boolean;
  outputSlug: string | null;
  showId: string | null;
  /** The output's slot as the settings name it (control/playoutStatus.ts `casparOutputTarget`). */
  casparTarget: string;
  /** The rundown's server files as a key (production, target, items, references), or null when
   *  it has no server cue. */
  serverFiles: string | null;
  /** The rundown's server items: the older clips' facts, and whether the server's state is worth
   *  reading at all. */
  playoutItems: readonly PlayoutItem[];
  /** Bumped by Check again. */
  checkAgain: number;
  /** Bumped when the studio's settings changed (the Playout settings dialog, a studio sync). */
  settingsRev: number;
  /** Bumped by Put on air and Take off. */
  slotRev: number;
}

export interface BridgeWatch {
  /** The page rendered: restart each poll whose key moved. */
  update: (inputs: BridgeInputs) => void;
  /** An output action finished: a slot read already out says nothing about the slot now. */
  slotActed: () => void;
  /** An output action landed on `target` (control/playoutStatus.ts `casparOutputTarget`): Load
   *  (`true`) makes the output there this page's to bring back, Unload (`false`) gives it up. */
  slotOwned: (loaded: boolean, target: string) => void;
  /** Read the server's state now: after an action. */
  wake: () => void;
  stop: () => void;
}

/** Nothing at all on the layer: what a restarted server answers. A clip, a still, a colour or
 *  another page there is somebody's, and a reload never covers it. */
function isVacant(layer: SlotState | null): boolean {
  return !layer || layer.producer === 'empty';
}

/** One poll and its key: a new key stops the run before and starts the next, as an effect's
 *  dependency list did. */
function keyed() {
  let key: string | undefined;
  let stop: (() => void) | void;
  return {
    run: (next: string, start: () => (() => void) | void) => {
      if (next === key) return;
      stop?.();
      key = next;
      stop = start();
    },
    end: () => {
      stop?.();
      stop = undefined;
      key = undefined;
    },
  };
}

/** Move the `bridge` part by `change`; a change that changes nothing keeps the part as it is, so
 *  the page does not render for it. */
export function writeBridge(session: PlayoutSession, change: Partial<BridgePart>) {
  session.apply((parts) => {
    const bridge = parts.bridge;
    const same = (Object.keys(change) as (keyof BridgePart)[]).every((k) => Object.is(bridge[k], change[k]));
    return same ? parts : { ...parts, bridge: { ...bridge, ...change } };
  });
}

export function startBridgeWatch(session: PlayoutSession, io: BridgeWatchIo, adapters: BridgeWatchAdapters): BridgeWatch {
  let alive = true;
  let inputs: BridgeInputs | null = null;
  let studioAsked = false;
  /** Bumped by an output action, so a slot read that was out before it is dropped. */
  let slotActions = 0;
  let wakeState: (() => void) | null = null;
  /** The production the page names; and the page's own word on the Load while storage cannot hold
   *  it (before the page names a production, or storage refused the write), as before #2245. */
  let showId: string | null = null;
  let local: LoadedOutput | null | undefined;
  /** The Load this browser keeps (#1657, #2245), read fresh: another tab may have changed it. */
  const memory = (): LoadedOutput | null => (local !== undefined ? local : showId ? io.loadedOutput(showId) : null);
  const keep = (next: LoadedOutput | null) => {
    local = showId && io.keepLoaded(showId, next) ? undefined : next;
  };
  /** The stamp of the Load this page has seen on its slot: armed for that Load only. */
  let seenAt: number | null = null;
  const armedFor = (target: string) => {
    const m = memory();
    return !!m && m.target === target && m.at === seenAt;
  };
  /** Of this browser's armed tabs, the one that reloads. */
  let lead: Lead | null = null;
  const dropLead = () => {
    lead?.release();
    lead = null;
  };
  const followLead = (target: string) => {
    if (armedFor(target) && showId) lead ??= io.lead(`noacg-caspar-reload ${showId}`);
    else dropLead();
  };
  // A tab going out of view hands the lead to a tab in view, if one is waiting: the browser slows a
  // background tab's polls, so it would see a restart late.
  // A reload already sent finishes first, so the next lead never sends a second one beside it: on
  // going out of view, and on the page going away (`stop`) alike.
  let handOver = false;
  let sending: Promise<void> | null = null;
  const handLeadOver = () => {
    handOver = false;
    if (!lead || !inputs) return;
    dropLead();
    followLead(inputs.casparTarget);
  };
  /** A lead out of view with nothing out lets a waiting tab lead (#2251): the lock goes to the tab
   *  that asked first, and one that went into the background before another tab opened would keep
   *  it, so the reload would wait for its slowed polls. Asked at each of its readings that needs
   *  nothing done. The browser cannot say whether the waiting tab is in view, so two background
   *  tabs may pass the lock back and forth; harmless, as one tab holds it at a time and a reload in
   *  flight is never handed over. */
  let offering = false;
  const offerLead = () => {
    const held = lead;
    if (!held?.held() || !io.hidden() || reloads.inFlight || offering) return;
    offering = true;
    void held.waiting().then(
      (others) => {
        offering = false;
        if (others && alive && lead === held && io.hidden() && !reloads.inFlight) handLeadOver();
      },
      () => {
        offering = false;
      },
    );
  };
  const stopHidden = io.onHidden(() => {
    if (reloads.inFlight) handOver = true;
    else handLeadOver();
  });
  /** The server or the Bridge stopped answering, or the slot could not be read, since the slot last
   *  held ours: only then is an empty slot a restart, not another browser's Unload or a client's
   *  CLEAR (#1657). */
  let outageSinceOurs = false;
  /** When the last read that found ours on the slot went out, or the page opened: an outage another
   *  tab noted after it counts here too. */
  let oursAt = io.now();
  const snapshot = (): Before => {
    const m = memory();
    return { at: m?.at, outageAt: m?.outageAt, link: m?.link, issued: io.now() };
  };
  /** Since the slot last held ours; a note in the same millisecond counts (wall clocks tie). */
  const noted = (m: LoadedOutput | null) => m?.outageAt !== undefined && m.outageAt >= oursAt;
  const sawOutage = () => {
    outageSinceOurs = true;
    // A page opened during an outage another tab saw goes on from that tab's note, never a newer one.
    armFromNote();
    const m = memory();
    if (!m) return;
    const seen = m.at === seenAt;
    if (!noted(m)) keep({ ...m, outageAt: io.now(), ...(seen ? { seen: true } : { seen: undefined }) });
    // Another tab noted it first without having seen the output: the note keeps its time, which
    // the readings out compare against.
    else if (seen && !m.seen) keep({ ...m, seen: true });
  };
  /** A page opened during an outage a tab that saw the output noted (an F5 while the header says
   *  CasparCG is not answering) arms for that Load as if it had seen it, from the note on (#2249):
   *  no looser than what the tab that wrote it follows. Before the server first answered this page,
   *  or, once it has, only while a recovery is under way (a try made since that outage, #2253): a
   *  page opened while everything answers may otherwise find the slot cleared since the note, and a
   *  recovery that ended clears its tries. Armed with the tries spent, it says the recovery failed. */
  const armFromNote = () => {
    const m = memory();
    if (seenAt !== null || !m?.seen || m.outageAt === undefined || m.target !== inputs?.casparTarget) return;
    if (answered && !m.tries) return;
    seenAt = m.at;
    oursAt = Math.min(oursAt, m.outageAt);
    // Asked now, while the server is still down: the browser grants a lock a moment later, and the
    // first empty reading must find it held.
    followLead(m.target);
  };
  /** A reading sent while an outage was noted, or one under another link than the one kept when it
   *  went out (#2252): what it found may be from before the recovery, so an empty one never reads
   *  as a CLEAR. Decided by what the reading carried, not by clock order. */
  const sentDuringOutage = (before: Before, link: string | undefined) => before.outageAt !== undefined || (link !== undefined && before.link !== undefined && link !== before.link);
  /** The Bridge's connection to the server was lost since a tab last found ours there (#2252): the
   *  reading names another link than the one kept, and the one kept did not move while it was out.
   *  A Bridge from before #2252 names none, and says nothing here. */
  const restarted = (before: Before, link: string | undefined) => link !== undefined && before.link !== undefined && link !== before.link && memory()?.link === before.link;
  /** An outage since the slot last held ours. The browser's note decides while storage holds the
   *  Load: a tab that saw the outage but not the recovery another tab saw must not keep its own
   *  word on it, or a later CLEAR would read as a restart. This tab's own word only while storage
   *  refuses the write. */
  const outage = (m: LoadedOutput | null) => (local !== undefined ? outageSinceOurs : noted(m));
  /** The last slot start was published with CasparCG on, so a start without either is a change. */
  let watched = false;
  /** The status has answered `ok` since the page opened. */
  let answered = false;
  /** The reloads of a lost output: tries made, empty readings since the last, one in flight. */
  let reloads = { tries: 0, emptyReads: 0, inFlight: false, detail: '' };
  const resetReloads = () => {
    reloads = { tries: 0, emptyReads: 0, inFlight: false, detail: '' };
    writeBridge(session, { slotReload: null });
  };
  const status = keyed();
  const pending = keyed();
  const slot = keyed();
  const files = keyed();
  const state = keyed();

  // THE SERVER'S STATUS, re-asked every few seconds while a Bridge is set up and CasparCG is on:
  // what the header shows, and what every other poll here waits on. Cleared at each restart.
  const startStatus = (target: string | null) => {
    writeBridge(session, { status: null });
    if (target === null) return;
    let live = true;
    const off = io.subscribeTargetStatus(io.loadSettings(), (result) => {
      if (!live) return;
      if (result.state !== 'ok') sawOutage();
      else answered = true;
      writeBridge(session, { status: result });
      follow();
    });
    return () => {
      live = false;
      off();
    };
  };

  // WHAT THE NOACG OUTPUT'S SLOT HOLDS: this production's output, another's, or nothing. Read every
  // 10 s with the settings of the start, never two reads at once; an unchanged reading keeps the
  // part as it is. A Bridge too old to say reads as `unreadable`, never as a fault.
  const startSlot = (i: BridgeInputs, answers: boolean, readable: boolean) => {
    const settings = io.loadSettings();
    if (!i.hostedSlug || !i.casparOn || !answers || !io.configured(settings)) {
      // Unpublished or switched off since it was watched: the slot is no longer this page's to bring
      // back. A server that stopped answering keeps it, which is the restart this waits out.
      if (watched && (!i.hostedSlug || !i.casparOn)) {
        keep(null);
        resetReloads();
        followLead(i.casparTarget);
      }
      watched = !!i.hostedSlug && i.casparOn;
      writeBridge(session, { outputSlot: undefined });
      return;
    }
    watched = true;
    if (!readable) {
      writeBridge(session, { outputSlot: { holds: 'unreadable' } });
      return;
    }
    let live = true;
    let reading = false;
    const actionRev = slotActions;
    const settle = (next: SlotReading | undefined, vacant: boolean, before: Before, link?: string) => {
      if (next?.holds === 'ours' && i.showId) {
        io.rememberOutput(i.showId, i.casparTarget);
        writeBridge(session, { slotSeenOurs: true });
      }
      const prev = session.bridge.get().outputSlot;
      writeBridge(session, { outputSlot: prev && next && prev.holds === next.holds && prev.detail === next.detail ? prev : next });
      if (next) bringBack(next, i.casparTarget, vacant, before, link);
    };
    const read = () => {
      if (reading) return; // a slow Bridge: never stack reads
      reading = true;
      const before = snapshot();
      io.readState(settings, settings.channel)
        .then(
          (r) => {
            if (!live || actionRev !== slotActions) return;
            // A refused read is a fault the status names, never "Checking…" for ever.
            const layer = r.reply?.slots.filter((s) => s.layer === settings.layer)[0] ?? null;
            settle(
              r.reply
                ? { holds: slotHolds(layer, i.outputSlug) }
                : { holds: 'failed', detail: r.result.detail },
              !!r.reply && isVacant(layer),
              before,
              r.reply?.link,
            );
          },
          () => {
            if (!live) return;
            sawOutage();
            settle(undefined, false, before);
          },
        )
        .finally(() => {
          reading = false;
        });
    };
    read();
    const stopEvery = io.every(SLOT_READ_MS, read);
    return () => {
      live = false;
      stopEvery();
    };
  };

  // A LOST OUTPUT, LOADED AGAIN (#1657): each reading of the slot decides. Ours again ends the
  // tries; another production's ends them too, and the slot is no longer this page's to take back.
  /** What any reading of the slot says about owning it, the watch's own and the one right before a
   *  reload alike: true when the layer is vacant and a reload may be weighed. */
  const observe = (reading: SlotReading, vacant: boolean, before: Before, link: string | undefined): boolean => {
    if (reading.holds === 'failed') sawOutage();
    // Emptied on another link: the server restarted, whether or not a poll saw it gone.
    if (reading.holds === 'empty' && vacant && restarted(before, link)) sawOutage();
    if (reading.holds === 'ours') {
      outageSinceOurs = false;
      oursAt = Math.max(oursAt, before.issued);
      const m = memory();
      seenAt = m?.at ?? null;
      // Back on its slot after the outage noted for it: the browser's recovery is over. Only a read
      // sent while that outage was noted says so; one sent before it is from before the restart.
      // The link it was found under, for every tab of the browser (#2252): only from a reading sent
      // while the kept one was what it is now, so one from before another tab's recovery never
      // puts an older link back.
      const nextLink = m && link !== undefined && m.link === before.link ? link : m?.link;
      if (m && (m.outageAt !== undefined ? m.outageAt === before.outageAt : m.tries)) keep({ target: m.target, at: m.at, ...(nextLink !== undefined ? { link: nextLink } : {}) });
      else if (m && nextLink !== m.link) keep({ ...m, link: nextLink });
      if (reloads.tries || session.bridge.get().slotReload) resetReloads();
      return false;
    }
    // Another production, or anything else another client put there (a clip, a still, a page that is
    // not NoaCG's, all of which `slotHolds` calls empty): the slot is theirs now.
    if (reading.holds === 'other' || (reading.holds === 'empty' && !vacant)) {
      // Only the Load kept when the read went out: a newer one landed after it is not given up.
      if (before.at !== undefined && memory()?.at === before.at) keep(null);
      if (reloads.tries || session.bridge.get().slotReload) resetReloads();
      return false;
    }
    return reading.holds === 'empty';
  };
  const bringBack = (reading: SlotReading, target: string, vacant: boolean, before: Before, link: string | undefined) => {
    const lost = observe(reading, vacant, before, link);
    // A kept Load this page never saw, on a slot read empty while everything answers: it was taken
    // off while no page of this browser watched (a CLEAR, another browser's Unload), so forget it,
    // or another browser's later Load would arm it. Not a Load still fresh, one in a recovery another
    // tab is making, nor a newer one than the read knew.
    const kept = memory();
    if (lost && kept && !outage(kept) && !sentDuringOutage(before, link) && kept.outageAt === undefined && kept.at !== seenAt && kept.at === before.at && io.now() - kept.at > FRESH_LOAD_MS) keep(null);
    // A recovery under way when this page opened goes on from here (#2253).
    if (lost) armFromNote();
    followLead(target);
    // Nothing to bring back: a lead out of view may hand over now, before it is needed.
    if (!lost) offerLead();
    // Only the slot it was loaded on, and a Load this page saw there: a slot the settings moved to,
    // or a newer Load not seen yet, is not this page's to fill.
    if (!lost || !armedFor(target) || reloads.inFlight) return;
    // Emptied while everything answered: someone took it off on purpose, and a later outage must
    // not bring it back.
    const now = memory();
    if (!outage(now)) {
      // A reading sent before another tab saw the output back says nothing about the slot now.
      if (sentDuringOutage(before, link)) return;
      keep(null);
      followLead(target);
      return;
    }
    // Another tab of this browser reloads it.
    if (!lead?.held()) return;
    // The tries any tab of the browser made since the outage: a tab taking the lead over goes on
    // from there.
    const tries = memory()?.tries ?? 0;
    if (tries >= RELOAD_AFTER_READS.length) {
      // Out of tries: said once, and Load is the operator's.
      // The last try's reason, whichever tab of the browser made it.
      const detail = memory()?.reason ?? reloads.detail;
      if (session.bridge.get().slotReload?.state !== 'failed') writeBridge(session, { slotReload: { state: 'failed', detail } });
      return;
    }
    if (tries > 0) reloads.emptyReads += 1;
    if (reloads.emptyReads < RELOAD_AFTER_READS[tries]) return;
    const run = reloads;
    run.inFlight = true;
    writeBridge(session, { slotReload: { state: 'reloading' } });
    // The Load and the outage this try is for: a try that lands after a newer Load, or after the
    // recovery, is not counted against them.
    const sentFor = snapshot();
    sending = reloadOnce(run, target).then(
      (result) => done(run, result, sentFor),
      (e: unknown) => done(run, { state: 'bridge', detail: e instanceof Error ? e.message : String(e) }, sentFor),
    );
  };
  /** One reload, decided here and sent by the page: only while this run is still the one, the
   *  settings still name the slot it was loaded on, no output action landed meanwhile, and the slot,
   *  read once more, still reads empty. A page gone, a slot moved or an operator's own Load in the
   *  read's time sends nothing. */
  const reloadOnce = async (run: typeof reloads, target: string): Promise<PlayoutResult | null> => {
    const settings = io.loadSettings();
    const actionRev = slotActions;
    const wanted = () => alive && run === reloads && armedFor(target) && actionRev === slotActions && casparOutputTarget(io.loadSettings()) === target;
    if (!wanted()) return null;
    const before = snapshot();
    // A read that fails sends nothing and is not a try: the next reading decides again.
    const read = await io.readState(settings, settings.channel).catch(() => null);
    if (!wanted() || !read?.reply) return null;
    const layer = read.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null;
    // Back already (another browser's reload) or somebody else's now: this reading counts as any.
    if (!observe({ holds: slotHolds(layer, inputs?.outputSlug ?? null) }, isVacant(layer), before, read.reply.link)) return null;
    return adapters.reload();
  };
  const done = (run: typeof reloads, result: PlayoutResult | null, sentFor: Before) => {
    if (run !== reloads) return;
    run.inFlight = false;
    // A sent load is one of the browser's three tries, also when this page has gone meanwhile: the
    // tab taking the lock over goes on from it.
    if (result) {
      run.tries += 1;
      const m = memory();
      // Why it did not bring it back, for the failed state in any tab: the Bridge's sentence, or a
      // load that went through and still left the slot empty.
      if (m && m.at === sentFor.at && m.outageAt === sentFor.outageAt) keep({ ...m, tries: (m.tries ?? 0) + 1, reason: result.state === 'ok' ? '' : result.detail });
    }
    if (!alive) return;
    if (handOver) handLeadOver();
    // Nothing sent (the slot changed under it, or the operator's own Load is out): not a try, and
    // before the first nothing is reloading.
    if (!result) {
      if (!run.tries) writeBridge(session, { slotReload: null });
      return;
    }
    run.emptyReads = 0;
    // Why the last try did not bring it back, for the failed state: the Bridge's sentence, or a
    // load that went through and still left the slot empty.
    run.detail = result.state === 'ok' ? '' : result.detail;
  };

  // WHETHER THE RUNDOWN'S SERVER FILES ARE THERE: the server's lists, once per key while the Bridge
  // answers. Read-only listing; never a playback action.
  const startFiles = (key: string) => {
    let live = true;
    writeBridge(session, { serverFiles: null });
    void (async () => {
      const settings = io.loadSettings();
      const requirements = JSON.parse(key) as { items: Pick<PlayoutItem, 'id' | 'kind' | 'name'>[]; refs: string[] };
      const kinds = [...new Set(requirements.items.map(i => i.kind))];
      const lists = await Promise.all(kinds.map(async kind => ({ kind, ...await io.listLibrary(settings, kind) })));
      if (!live) return;
      const unavailable = lists.find(l => !l.items);
      const missing = requirements.items.filter(i => !lists.find(l => l.kind === i.kind)?.items?.some(f => f.name.toLowerCase() === i.name.toLowerCase()));
      const orphan = requirements.refs.some(id => !requirements.items.some(i => i.id === id));
      const check: StatusCheck | null = unavailable ? { key: 'files', tone: 'warn', short: 'Server files unavailable', label: 'CasparCG file list unavailable', advice: unavailable.result.detail }
        : missing.length || orphan ? { key: 'files', tone: 'bad', short: 'Server files missing', label: `Unavailable CasparCG files: ${missing.map(i => i.name).join(', ')}${orphan ? ' (cue has no file definition)' : ''}`, advice: 'Copy the required pictures and videos to the server manually, then Check Readiness again.' } : null;
      writeBridge(session, { serverFiles: { key, check } });
    })();
    return () => {
      live = false;
    };
  };

  // WHAT AN OLDER CLIP IS (docs/CLIP_PLAYBACK_PLAN.md §7, §18 case 5): a clip saved before its kind
  // was kept, or its length, learns both from the server's list, once per production and settings
  // rev. Only a missing fact is filled, and the answer is the production's whenever it lands.
  const learnFacts = (i: BridgeInputs) => {
    if (!i.showId) return;
    const key = `${i.showId} ${i.settingsRev}`;
    if (session.bridge.get().learntFacts === key) return;
    // A still has no length to learn.
    const missing = i.playoutItems.filter((m) => m.kind === 'media' && (!m.mediaKind || (m.mediaKind !== 'still' && !(m.frames && m.fps))));
    if (!missing.length) return;
    writeBridge(session, { learntFacts: key });
    const showId = i.showId;
    void (async () => {
      const { items } = await io.listLibrary(io.loadSettings(), 'media');
      if (!items) return;
      const byName = new Map(items.map((x) => [x.name.toLowerCase(), x] as const));
      const facts = new Map<string, { mediaKind?: PlayoutMediaKind; frames?: number; fps?: number }>();
      for (const m of missing) {
        const found = byName.get(m.name.toLowerCase());
        if (found) facts.set(m.id, { ...mediaKindOf(found.kind), frames: found.frames, fps: found.fps });
      }
      if (facts.size) adapters.learnt(showId, facts);
    })();
  };

  // THE SERVER'S TRUTH (docs/CLIP_PLAYBACK_PLAN.md §6.7): what each channel the rundown uses holds,
  // twice a second while something is up there, every few seconds otherwise, and at once when the
  // tab comes back into view, each reading folded into the server store.
  const startState = () => {
    /** Each Play-through folder's slot: it plays there, not on its clips' own slots, so a reload in
     *  the middle of one has to read it even when no item of the rundown uses that channel. */
    const folderSlots = (settings: PlayoutSettings) =>
      adapters.rundown().folders.filter((f) => folderMode(f) === 'through').map((f) => adapters.slots.folderSlot(settings, f));
    const poll = pollServerState({
      read: (channel) => io.readState(io.loadSettings(), channel),
      channels: () => {
        const settings = io.loadSettings();
        const channels = new Set(adapters.rundown().playoutItems.map((i) => adapters.slots.itemSlot(settings, i).channel));
        for (const s of folderSlots(settings)) channels.add(s.channel);
        for (const l of Object.values(adapters.serverPlayout.ownership.get().onAir)) if (l.slot.adapter === 'casparcg') channels.add(l.slot.channel);
        return [...channels].sort((a, b) => a - b);
      },
      busy: () => {
        const own = adapters.serverPlayout.ownership.get();
        return Object.keys(own.onAir).length > 0 || own.unidentified.length > 0;
      },
      onReading: (channel, reply, receivedAt) => {
        const settings = io.loadSettings();
        const { cues, playoutItems: items } = adapters.rundown();
        adapters.serverPlayout.apply((parts) =>
          applyReading(parts, reply, { channel, now: receivedAt, cues, items, slotOf: (i) => adapters.slots.itemSlot(settings, i), alsoSlots: folderSlots(settings) }),
        );
      },
    });
    wakeState = poll.wake;
    const stopVisible = io.onVisible(poll.wake);
    return () => {
      poll.stop();
      wakeState = null;
      stopVisible();
    };
  };

  /** Every poll that waits on the status, in the page's old order, with the status as it is now. */
  const follow = () => {
    const i = inputs;
    if (!alive || !i) return;
    const now = session.bridge.get().status;
    const answers = now?.state === 'ok';
    const readable = io.readable(now);
    slot.run(JSON.stringify([i.hostedSlug, i.casparOn, answers, readable, i.outputSlug, i.slotRev, i.showId, i.casparTarget]), () => startSlot(i, answers, readable));
    // The file key is already a string; '' while there is nothing to check.
    const filesKey = answers ? (i.serverFiles ?? '') : '';
    files.run(filesKey, () => (filesKey ? startFiles(filesKey) : undefined));
    // A SETUP CHANGE MADE WHILE THE BRIDGE WAS AWAY goes to it as soon as it answers again (D17).
    pending.run(String(answers), () => {
      if (answers && io.loadSettings().studioPending) void io.syncStudio();
    });
    if (answers) learnFacts(i);
    const reads = readable && i.playoutItems.length > 0;
    state.run(JSON.stringify([reads, i.settingsRev]), () => (reads ? startState() : undefined));
  };

  return {
    update: (next) => {
      if (!alive) return;
      inputs = next;
      // WHAT THIS BROWSER LOADED (#2245) is read for the production the page names. A Load or
      // Unload that landed before it named one is the newer word, and is kept for it.
      if (next.showId !== showId) {
        dropLead();
        seenAt = null;
        const was = showId;
        showId = next.showId;
        // Only a Load that landed before the page named any production is carried to it.
        if (was !== null) local = undefined;
        else if (showId && local !== undefined) keep(local);
      }
      status.run(JSON.stringify([next.target, next.checkAgain]), () => startStatus(next.target));
      // THE STUDIO SETUP THE BRIDGE KEEPS, read once as the page opens, so a channel, output slot
      // or New media channel another browser set is the one this page plays to. Not guarded by
      // the start that asked: the settings it writes are the page's whichever start asks.
      if (!studioAsked) {
        studioAsked = true;
        if (io.configured(io.loadSettings())) {
          void io.syncStudio().then((done) => {
            if (done.changed) adapters.settingsChanged();
          });
        }
      }
      follow();
    },
    slotActed: () => {
      slotActions += 1;
    },
    slotOwned: (loaded, target) => {
      // The operator's own Load or Unload starts afresh, with a new stamp; a reload's own load, still
      // in flight, is not one, and keeps the Load it brings back.
      if (!loaded || !reloads.inFlight) {
        keep(loaded ? { target, at: io.now() + Math.random() } : null);
        resetReloads();
        seenAt = null;
        followLead(target);
      }
    },
    wake: () => wakeState?.(),
    stop: () => {
      if (!alive) return;
      alive = false;
      const held = lead;
      lead = null;
      if (reloads.inFlight && sending) void sending.finally(() => held?.release());
      else held?.release();
      stopHidden();
      for (const poll of [status, slot, files, pending, state]) poll.end();
    },
  };
}
