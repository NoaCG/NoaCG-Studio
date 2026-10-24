// ONE PRODUCTION'S PLAYOUT SESSION ON THE PAGE: its key, whether it is alive, and its disposal in
// one place (production-page refactor spec §2, §3).
//
// The key is the production id and nothing else (D2): publishing is a mode change inside one
// session, and opening another production disposes this session and creates the next. Disposal
// flips `alive`, so a fold or an answer that lands afterwards changes nothing, and runs every stop
// registered with `onDispose` once. In-flight requests are not aborted; their answers are ignored
// here and their effect on the server stands (§4.1 R3).
//
// Its parts are store parts (./storePart.ts), each its own subscription: `data` holds the
// production's live tree (./productionDataSession.ts writes it), `bridge` what NoaCG Bridge last said
// (./bridgeWatch.ts writes it), `arms` the timed cues' countdowns (./cueArmEngine.ts and, published,
// ./cueArmWire.ts write it), `folders` what the folders remember and which are still being sent
// (./folderPlayout.ts writes it), `air` what this page believes is on air and `log` the action log's
// lines (./airState.ts holds every fold that writes them; ./sessionWire.ts follows the wire into
// them), and `draft` the cue being typed (./cueDraft.ts writes it).
// Every write is one synchronous `apply(fold)`, parts set in a fixed order (D4). No React and only
// `.ts` runtime imports, so a Node test drives it as it is.

import type { AppliedOnce } from './commandRoads';
import type { CueArms } from './cueAuto';
import type { LogEntry } from './eventLog';
import type { LiveReportMap } from './hostedControl';
import type { LiveCueMap } from './liveCue';
import type { AiredMap, ReplayItem } from './outputRecovery';
import type { JsonObject } from '../model/productionData';
import type { PlayoutResult } from './playoutLink';
import type { SlotReading, StatusCheck } from './playoutStatus';
import { createAppliedOnce } from './commandRoads.ts';
import { storePart, type StorePart } from './storePart.ts';
import type { SelectionAir } from './selectionAir';

/** The production's live tree as this page holds it (./productionDataSession.ts says the rules). */
export interface DataPart {
  liveData: JsonObject;
  /** The production's data key: a string when published and read, null when there is none to
   *  read (unpublished, no backend, or the read failed), undefined while it is being read. */
  dataKey: string | null | undefined;
  /** Whether a published production's tree has been read from the server yet. */
  treeRead: boolean;
}

export const NO_DATA: DataPart = { liveData: {}, dataKey: undefined, treeRead: false };

/** What NoaCG Bridge last said for this production (./bridgeWatch.ts asks it). */
export interface BridgePart {
  /** The Bridge's last word on the playout server, null until it answers: what the editor shows
   *  beside a server cue, and what disables its Take. */
  status: PlayoutResult | null;
  /** What the NoaCG output's slot on the server holds, undefined until read. */
  outputSlot: SlotReading | undefined;
  /** The rundown's server files checked, under the key they were checked for; null while checking. */
  serverFiles: { key: string; check: StatusCheck | null } | null;
  /** This session saw this production on its CasparCG slot: losing it after that is red, while a
   *  slot that was never loaded today is only a Load waiting to be pressed. Unload clears it. */
  slotSeenOurs: boolean;
  /** The production and settings rev whose older clips last asked the server what they are. */
  learntFacts: string | null;
}

export const NO_BRIDGE: BridgePart = { status: null, outputSlot: undefined, serverFiles: null, slotSeenOurs: false, learntFacts: null };

/** What the folders remember on this page (./folderPlayout.ts says the rules). Page memory: never saved, never shared. */
export interface FoldersPart {
  /** WHERE EACH ONE-BY-ONE FOLDER'S STEP STANDS (docs/CLIP_PLAYBACK_PLAN.md §20.1): its cue taken
   *  last in this page, by any route, or null once it went back to the top. A folder with no entry
   *  reads its step off the air (./folderStep.ts). */
  folderSteps: Readonly<Record<string, string | null>>;
  /** Why each cue of the last folder Take did not go on air, by cue id - until that cue is taken,
   *  the folder is taken again, or it is taken off. */
  takeMisses: Readonly<Record<string, string>>;
  /** Folders whose Take or step is still being sent: a folder still being sent counts as up, so Out
   *  and SPACE can stop it even before anything of it has landed. */
  sending: ReadonlySet<string>;
}

export const NO_FOLDERS: FoldersPart = { folderSteps: {}, takeMisses: {}, sending: new Set() };

/** What this page believes is on air (./airState.ts says the rules; only its folds write it). */
export interface AirPart {
  /** Which cue is on air on each layer, keyed by graphic name: what PROGRAM's marker, Out, Update
   *  and Next read. */
  liveCue: LiveCueMap;
  /** How many times the marker was written here, moved or not: the resolve's seed is skipped when
   *  this moved while its round trip was in flight. */
  moves: number;
  /** What each graphic was last sent, by field: what rebuilds PROGRAM and what "not on air yet"
   *  is judged against. */
  aired: AiredMap;
  /** The match clock field's value on the wire per graphic, stamped with its origin: the monitor's
   *  copy of the renderer's merged data, kept apart from `aired` (a stamped value never equals the
   *  cue's plain one). */
  clocks: Readonly<Record<string, string>>;
  /** The same per field for a debate board's two clocks. */
  speaking: Readonly<Record<string, Record<string, string>>>;
  /** Commands applied to PROGRAM here, so a boot read can tell it is older. */
  commands: number;
  /** The renderers' last reports from the resolve, null until it answered. */
  reports: LiveReportMap | null;
  /** The rows after each report at the resolve, until a newer report or command; then null. */
  bootReplay: ReplayItem[] | null;
  /** What the wire said was live when it resolved, null until it seeded: the boot recovery's key,
   *  never written by anything this operator does. */
  bootLive: LiveCueMap | null;
}

export const NO_AIR: AirPart = { liveCue: {}, moves: 0, aired: {}, clocks: {}, speaking: {}, commands: 0, reports: null, bootReplay: null, bootLive: null };

/** The action log as this page shows it (./eventLog.ts), and the last id a line written here took. */
export interface LogPart {
  entries: LogEntry[];
  localId: number;
}

export const NO_LOG: LogPart = { entries: [], localId: 0 };

/** The selected cue's unsaved edits, by its id (./cueDraft.ts says the rules): what the editor
 *  shows, and what Take and Update air once the save they wait for answers. */
export interface DraftPart {
  cueId: string;
  label: string;
  note: string;
  values: Record<string, string>;
}

export interface PlayoutSession {
  /** The production this session belongs to. */
  readonly key: string;
  /** False once disposed: folds are no-ops and nothing may be sent for this session. */
  alive: () => boolean;
  /** The live tree. */
  data: StorePart<DataPart>;
  /** What NoaCG Bridge last said. */
  bridge: StorePart<BridgePart>;
  /** The timed cues' countdowns, one per graphic layer (./cueAuto.ts). */
  arms: StorePart<CueArms>;
  /** What the folders remember: their steps, their last Take's misses, which are being sent. */
  folders: StorePart<FoldersPart>;
  /** What this page believes is on air. */
  air: StorePart<AirPart>;
  /** The action log's lines. */
  log: StorePart<LogPart>;
  /** The cue being typed, null when nothing is. */
  draft: StorePart<DraftPart | null>;
  /** The live candidates this page aired, per layer: written only by ./selectionAir.ts's folds,
   *  outside `apply` since no other fold reads them. */
  selections: StorePart<SelectionAir>;
  /** The commands applied here, by the id their press minted, on whichever road came first. */
  readonly applied: AppliedOnce;
  /** Move the session's parts with one fold, in a fixed order. A no-op once disposed. */
  apply: (fold: (parts: SessionParts) => SessionParts) => void;
  /** Run `stop` when the session is disposed (at once if it already is); answers an unregister. */
  onDispose: (stop: () => void) => () => void;
  /** End the session: flip `alive`, then run every registered stop once. */
  dispose: () => void;
}

/** The session's parts, as one fold sees them. */
export interface SessionParts {
  data: DataPart;
  bridge: BridgePart;
  arms: CueArms;
  folders: FoldersPart;
  air: AirPart;
  log: LogPart;
  draft: DraftPart | null;
}

export function createPlayoutSession(productionId: string): PlayoutSession {
  let alive = true;
  const stops = new Set<() => void>();
  const data = storePart<DataPart>(NO_DATA);
  const bridge = storePart<BridgePart>(NO_BRIDGE);
  const arms = storePart<CueArms>({});
  const folders = storePart<FoldersPart>(NO_FOLDERS);
  const air = storePart<AirPart>(NO_AIR);
  const log = storePart<LogPart>(NO_LOG);
  const draft = storePart<DraftPart | null>(null);
  const selections = storePart<SelectionAir>({});
  return {
    key: productionId,
    alive: () => alive,
    data,
    bridge,
    arms,
    folders,
    air,
    log,
    draft,
    selections,
    applied: createAppliedOnce(),
    apply: (fold) => {
      if (!alive) return;
      const next = fold({ data: data.get(), bridge: bridge.get(), arms: arms.get(), folders: folders.get(), air: air.get(), log: log.get(), draft: draft.get() });
      // The fixed order: later parts are set after `data`, as D4 lists them.
      data.set(next.data);
      bridge.set(next.bridge);
      arms.set(next.arms);
      folders.set(next.folders);
      air.set(next.air);
      log.set(next.log);
      draft.set(next.draft);
    },
    onDispose: (stop) => {
      if (!alive) {
        stop();
        return () => {};
      }
      stops.add(stop);
      return () => {
        stops.delete(stop);
      };
    },
    dispose: () => {
      if (!alive) return;
      alive = false;
      for (const stop of [...stops]) stop();
      stops.clear();
    },
  };
}
