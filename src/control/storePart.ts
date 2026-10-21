// ONE INDEPENDENTLY SUBSCRIBED VALUE: the part primitive of the page's stores.
//
// Lifted unchanged from ./serverPlayoutStore.ts (production-page refactor D1), where it first
// held the server's OWNERSHIP and TIMING apart, so the playout session's parts are the same proven
// thing. No React and no imports: a surface reads a part with `useSyncExternalStore(part.subscribe,
// part.get)` (components/home/useStorePart.ts), and a Node test imports this file as it is.

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
