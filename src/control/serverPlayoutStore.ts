// THE PLAYOUT SERVER'S STATE ON THE PAGE, in two parts that change at two speeds
// (docs/CLIP_PLAYBACK_PLAN.md §10, "two kinds of server state").
//
//   OWNERSHIP  which cue is up on which slot (./serverPlayout `ServerOnAir`), and what else the
//              server says that changes only on an action or a switch: the last accepted
//              generation per slot, a cue replaced on the server, an unidentified item, what waits
//              to play next (./serverState `ServerOwnership`). It is what the verbs, All out and the
//              rundown's ON AIR read.
//   TIMING     where each slot's clip is in its segment, by slot address, from the Bridge's reading
//              twice a second or the page's own count from its Take (./serverState `SlotTiming`).
//
// Each part is its own subscription, so a consumer re-renders only for the part it reads: the
// clip clock and the rows' remaining times subscribe to TIMING, and nothing that decides what a
// verb may do ever does. A page that re-rendered twice a second would retype every field it holds
// (plan §18, case 15).
//
// Both parts are plain data, so everything a hardware panel would light - on air, the clip's
// remaining time, HOLDING, PAUSED, the 10 and 5 second warnings, NEXT ON SERVER - is read from here
// through ./serverState's functions, never from inside a component
// (https://github.com/NoaCG/NoaCG-Studio/issues/809).
//
// No React in here: a surface reads a part with `useSyncExternalStore(part.subscribe, part.get)`.
// Kept plain so a Node test can import it, and one store is made per page, so it lives exactly as
// long as the state it replaced.

import { NO_OWNERSHIP, type ServerOwnership, type ServerParts, type ServerTiming } from './serverState.ts';

export type { ServerOwnership, ServerTiming };

/** One independently subscribed value. `get` and `subscribe` keep their identity for the part's
 *  whole life, which `useSyncExternalStore` needs. */
export interface StorePart<T> {
  get: () => T;
  /** Replace the value, or move it with an updater. Listeners hear only an actual change. */
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

function storePart<T>(initial: T): StorePart<T> {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next) => {
      const moved = typeof next === 'function' ? (next as (prev: T) => T)(value) : next;
      if (Object.is(moved, value)) return;
      value = moved;
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export interface ServerPlayoutStore {
  ownership: StorePart<ServerOwnership>;
  timing: StorePart<ServerTiming>;
  /** Move both parts at once with one of ./serverState's folds. Each part's listeners hear only
   *  its own change, so a reading that moved only the clock reaches only the clock. */
  apply: (fold: (parts: ServerParts) => ServerParts) => void;
}

export function createServerPlayoutStore(): ServerPlayoutStore {
  const ownership = storePart<ServerOwnership>(NO_OWNERSHIP);
  const timing = storePart<ServerTiming>({});
  return {
    ownership,
    timing,
    apply: (fold) => {
      const next = fold({ ownership: ownership.get(), timing: timing.get() });
      timing.set(next.timing);
      ownership.set(next.ownership);
    },
  };
}
