// THE PLAYOUT SERVER'S STATE ON THE PAGE, in two parts that change at two speeds
// (docs/CLIP_PLAYBACK_PLAN.md §10, "two kinds of server state").
//
//   OWNERSHIP  what this page put up, and on which slot (./serverPlayout `ServerOnAir`). It moves
//              only when an action is accepted - and, once the Bridge reports the server's own
//              state, when the server switches by itself. It is what the verbs, All out and the
//              rundown's ON AIR read.
//   TIMING     where each clip is in its segment, by slot address. The Bridge will read it twice
//              a second (plan §6.7, phase 2); nothing writes it before then.
//
// Each part is its own subscription, so a consumer re-renders only for the part it reads: the
// clip clock and the rows' remaining time will subscribe to TIMING, and nothing that decides what
// a verb may do ever will. A page that re-rendered twice a second would retype every field it
// holds (plan §18, case 15).
//
// No React in here: a surface reads a part with `useSyncExternalStore(part.subscribe, part.get)`.
// Kept plain so a Node test can import it, and one store is made per page, so it lives exactly as
// long as the state it replaced.

import type { ServerOnAir } from './serverPlayout';

/** One independently subscribed value. `get` and `subscribe` keep their identity for the part's
 *  whole life, which `useSyncExternalStore` needs. */
export interface StorePart<T> {
  get: () => T;
  /** Replace the value, or move it with an updater. Listeners hear only an actual change. */
  set: (next: T | ((prev: T) => T)) => void;
  subscribe: (listener: () => void) => () => void;
}

export function storePart<T>(initial: T): StorePart<T> {
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

/** Where one clip is in the segment on air, as the Bridge last read it off the server. */
export interface SlotTiming {
  /** Seconds into the segment. */
  position: number;
  /** The segment's length in seconds. */
  length: number;
  paused: boolean;
  /** When the Bridge read it, on the Bridge's own clock (ms). */
  observedAt: number;
}

/** TIMING, keyed by slot address (`2-10`). */
export type ServerTiming = Readonly<Record<string, SlotTiming>>;

export interface ServerPlayoutStore {
  ownership: StorePart<ServerOnAir>;
  timing: StorePart<ServerTiming>;
}

export function createServerPlayoutStore(): ServerPlayoutStore {
  return {
    ownership: storePart<ServerOnAir>({}),
    timing: storePart<ServerTiming>({}),
  };
}
