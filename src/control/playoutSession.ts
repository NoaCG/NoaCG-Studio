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
// production's live tree (./productionDataSession.ts writes it), and later phases add the rest.
// Every write is one synchronous `apply(fold)`, parts set in a fixed order (D4). No React and only
// `.ts` runtime imports, so a Node test drives it as it is.

import type { JsonObject } from '../model/productionData';
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

export interface PlayoutSession {
  /** The production this session belongs to. */
  readonly key: string;
  /** False once disposed: folds are no-ops and nothing may be sent for this session. */
  alive: () => boolean;
  /** The live tree. */
  data: StorePart<DataPart>;
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
}

export function createPlayoutSession(productionId: string): PlayoutSession {
  let alive = true;
  const stops = new Set<() => void>();
  const data = storePart<DataPart>(NO_DATA);
  return {
    key: productionId,
    alive: () => alive,
    data,
    apply: (fold) => {
      if (!alive) return;
      const next = fold({ data: data.get() });
      // The fixed order: later parts are set after `data`, as D4 lists them.
      data.set(next.data);
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
