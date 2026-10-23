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
// ./cueArmWire.ts write it), and later phases add the rest.
// Every write is one synchronous `apply(fold)`, parts set in a fixed order (D4). No React and only
// `.ts` runtime imports, so a Node test drives it as it is.

import type { CueArms } from './cueAuto';
import type { JsonObject } from '../model/productionData';
import type { PlayoutResult } from './playoutLink';
import type { SlotReading, StatusCheck } from './playoutStatus';
import { storePart, type StorePart } from './storePart.ts';

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
}

export function createPlayoutSession(productionId: string): PlayoutSession {
  let alive = true;
  const stops = new Set<() => void>();
  const data = storePart<DataPart>(NO_DATA);
  const bridge = storePart<BridgePart>(NO_BRIDGE);
  const arms = storePart<CueArms>({});
  return {
    key: productionId,
    alive: () => alive,
    data,
    bridge,
    arms,
    apply: (fold) => {
      if (!alive) return;
      const next = fold({ data: data.get(), bridge: bridge.get(), arms: arms.get() });
      // The fixed order: later parts are set after `data`, as D4 lists them.
      data.set(next.data);
      bridge.set(next.bridge);
      arms.set(next.arms);
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
