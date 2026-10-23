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
// The Bridge, the studio's settings, the page's storage and the browser's timers and visibility come
// in through `io`, the page's rundown and stores through `adapters`. Runtime imports carry `.ts` so
// Node resolves them (scripts/bridge-watch.test.mjs); everything else is a type.

import type { PlayoutItem, PlayoutMediaKind, ShowCue, ShowFolder } from '../model/shows';
import type { PlayoutResult, PlayoutSettings, StudioSync } from './playoutLink';
import type { CasparSlot, ItemKind, ListItem, StateReply } from './playoutProtocol';
import type { BridgePart, PlayoutSession } from './playoutSession';
import type { SlotReading, StatusCheck } from './playoutStatus';
import type { ServerPlayoutStore } from './serverPlayoutStore';
import { folderMode } from '../model/showFolders.ts';
import { mediaKindOf } from './cuePlayback.ts';
import { slotHolds } from './prepareLive.ts';
import { applyReading } from './serverState.ts';
import { pollServerState } from './serverStatePoll.ts';

/** How often the output's slot is read while it may be read. */
export const SLOT_READ_MS = 10_000;

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
  /** Read the server's state now: after an action. */
  wake: () => void;
  stop: () => void;
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
function write(session: PlayoutSession, change: Partial<BridgePart>) {
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
  const status = keyed();
  const pending = keyed();
  const slot = keyed();
  const files = keyed();
  const state = keyed();

  // THE SERVER'S STATUS, re-asked every few seconds while a Bridge is set up and CasparCG is on:
  // what the header shows, and what every other poll here waits on. Cleared at each restart.
  const startStatus = (target: string | null) => () => {
    write(session, { status: null });
    if (target === null) return;
    let live = true;
    const off = io.subscribeTargetStatus(io.loadSettings(), (result) => {
      if (!live) return;
      write(session, { status: result });
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
  const startSlot = (i: BridgeInputs, answers: boolean, readable: boolean) => () => {
    const settings = io.loadSettings();
    if (!i.hostedSlug || !i.casparOn || !answers || !io.configured(settings)) {
      write(session, { outputSlot: undefined });
      return;
    }
    if (!readable) {
      write(session, { outputSlot: { holds: 'unreadable' } });
      return;
    }
    let live = true;
    let reading = false;
    const actionRev = slotActions;
    const settle = (next: SlotReading | undefined) => {
      if (next?.holds === 'ours' && i.showId) {
        io.rememberOutput(i.showId, i.casparTarget);
        write(session, { slotSeenOurs: true });
      }
      const prev = session.bridge.get().outputSlot;
      write(session, { outputSlot: prev && next && prev.holds === next.holds && prev.detail === next.detail ? prev : next });
    };
    const read = () => {
      if (reading) return; // a slow Bridge: never stack reads
      reading = true;
      io.readState(settings, settings.channel)
        .then(
          (r) => {
            if (!live || actionRev !== slotActions) return;
            // A refused read is a fault the status names, never "Checking…" for ever.
            settle(
              r.reply
                ? { holds: slotHolds(r.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null, i.outputSlug) }
                : { holds: 'failed', detail: r.result.detail },
            );
          },
          () => live && settle(undefined),
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

  // WHETHER THE RUNDOWN'S SERVER FILES ARE THERE: the server's lists, once per key while the Bridge
  // answers. Read-only listing; never a playback action.
  const startFiles = (key: string) => () => {
    let live = true;
    write(session, { serverFiles: null });
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
      write(session, { serverFiles: { key, check } });
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
    // A still has no length to learn.
    const missing = i.playoutItems.filter((m) => m.kind === 'media' && (!m.mediaKind || (m.mediaKind !== 'still' && !(m.frames && m.fps))));
    const key = `${i.showId} ${i.settingsRev}`;
    if (!missing.length || session.bridge.get().learntFacts === key) return;
    write(session, { learntFacts: key });
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
    slot.run(JSON.stringify([i.hostedSlug, i.casparOn, answers, readable, i.outputSlug, i.slotRev, i.showId, i.casparTarget]), startSlot(i, answers, readable));
    files.run(JSON.stringify(answers && i.serverFiles), () => (answers && i.serverFiles !== null ? startFiles(i.serverFiles)() : undefined));
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
      status.run(JSON.stringify([next.target, next.checkAgain]), startStatus(next.target));
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
    wake: () => wakeState?.(),
    stop: () => {
      if (!alive) return;
      alive = false;
      for (const poll of [status, slot, files, pending, state]) poll.end();
    },
  };
}
