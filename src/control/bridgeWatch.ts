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
  /** Run `run` every `ms`; answers the stop. */
  every: (ms: number, run: () => void) => () => void;
  /** Run `run` whenever the tab comes back into view; answers the stop. */
  onVisible: (run: () => void) => () => void;
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
  /** Where this page loaded the output and has not unloaded it since (#1657), or null; and whether
   *  the slot has held it since that load. */
  let loadedHere: string | null = null;
  let seenSinceLoad = false;
  /** The server or the Bridge stopped answering, or the slot could not be read, since the slot last
   *  held ours: only then is an empty slot a restart, not another browser's Unload or a client's
   *  CLEAR (#1657). */
  let outageSinceOurs = false;
  /** The last slot start was published with CasparCG on, so a start without either is a change. */
  let watched = false;
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
      if (result.state !== 'ok') outageSinceOurs = true;
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
        loadedHere = null;
        resetReloads();
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
    const settle = (next: SlotReading | undefined, vacant = false) => {
      if (next?.holds === 'ours' && i.showId) {
        io.rememberOutput(i.showId, i.casparTarget);
        writeBridge(session, { slotSeenOurs: true });
      }
      const prev = session.bridge.get().outputSlot;
      writeBridge(session, { outputSlot: prev && next && prev.holds === next.holds && prev.detail === next.detail ? prev : next });
      if (next) bringBack(next, i.casparTarget, vacant);
    };
    const read = () => {
      if (reading) return; // a slow Bridge: never stack reads
      reading = true;
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
            );
          },
          () => {
            if (!live) return;
            outageSinceOurs = true;
            settle(undefined);
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
  const bringBack = (reading: SlotReading, target: string, vacant: boolean) => {
    if (reading.holds === 'failed') outageSinceOurs = true;
    if (reading.holds === 'ours') {
      outageSinceOurs = false;
      seenSinceLoad = true;
      if (reloads.tries || session.bridge.get().slotReload) resetReloads();
      return;
    }
    // Another production, or anything else another client put there (a clip, a still, a page that is
    // not NoaCG's, all of which `slotHolds` calls empty): the slot is theirs now.
    if (reading.holds === 'other' || (reading.holds === 'empty' && !vacant)) {
      loadedHere = null;
      if (reloads.tries || session.bridge.get().slotReload) resetReloads();
      return;
    }
    // Only the slot it was loaded on: a slot the settings moved to is not this page's to fill.
    if (reading.holds !== 'empty' || loadedHere !== target || !seenSinceLoad || reloads.inFlight) return;
    // Emptied while everything answered: someone took it off on purpose, and a later outage must
    // not bring it back.
    if (!outageSinceOurs) {
      loadedHere = null;
      return;
    }
    if (reloads.tries >= RELOAD_AFTER_READS.length) {
      // Out of tries: said once, and Load is the operator's.
      if (session.bridge.get().slotReload?.state !== 'failed') writeBridge(session, { slotReload: { state: 'failed', detail: reloads.detail } });
      return;
    }
    if (reloads.tries > 0) reloads.emptyReads += 1;
    if (reloads.emptyReads < RELOAD_AFTER_READS[reloads.tries]) return;
    const run = reloads;
    run.inFlight = true;
    writeBridge(session, { slotReload: { state: 'reloading' } });
    void reloadOnce(run, target).then(
      (result) => done(run, result),
      (e: unknown) => done(run, { state: 'bridge', detail: e instanceof Error ? e.message : String(e) }),
    );
  };
  /** One reload, decided here and sent by the page: only while this run is still the one, the
   *  settings still name the slot it was loaded on, no output action landed meanwhile, and the slot,
   *  read once more, still reads empty. A page gone, a slot moved or an operator's own Load in the
   *  read's time sends nothing. */
  const reloadOnce = async (run: typeof reloads, target: string): Promise<PlayoutResult | null> => {
    const settings = io.loadSettings();
    const actionRev = slotActions;
    const wanted = () => alive && run === reloads && loadedHere === target && actionRev === slotActions && casparOutputTarget(io.loadSettings()) === target;
    if (!wanted()) return null;
    // A read that fails sends nothing and is not a try: the next reading decides again.
    const read = await io.readState(settings, settings.channel).catch(() => null);
    if (!wanted() || !read?.reply) return null;
    const layer = read.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null;
    if (!isVacant(layer)) {
      // Back already (another browser's reload), or somebody else's now: then it is theirs, as for
      // any reading.
      if (slotHolds(layer, inputs?.outputSlug ?? null) !== 'ours') loadedHere = null;
      return null;
    }
    return adapters.reload();
  };
  const done = (run: typeof reloads, result: PlayoutResult | null) => {
    if (!alive || run !== reloads) return;
    run.inFlight = false;
    // Nothing sent (the slot changed under it, or the operator's own Load is out): not a try, and
    // before the first nothing is reloading.
    if (!result) {
      if (!run.tries) writeBridge(session, { slotReload: null });
      return;
    }
    run.tries += 1;
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
      loadedHere = loaded ? target : null;
      // The operator's own Load or Unload starts afresh; a reload's own load, still in flight, is
      // not one.
      if (!loaded || !reloads.inFlight) {
        resetReloads();
        seenSinceLoad = false;
      }
    },
    wake: () => wakeState?.(),
    stop: () => {
      if (!alive) return;
      alive = false;
      for (const poll of [status, slot, files, pending, state]) poll.end();
    },
  };
}
