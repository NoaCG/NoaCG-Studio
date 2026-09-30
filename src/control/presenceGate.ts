// THE PAGE'S PRESENCE BUDGET: every Presence call a page makes (a track or an untrack) passes this
// one gate, which lets through at most one call per PRESENCE_CALL_INTERVAL_MS.
//
// WHY. Supabase Realtime allows 5 Presence calls per client per 30 seconds on every plan, and
// closes a client that goes over with `{"message":"Client presence rate limit exceeded"}` and a
// phx_close (https://supabase.com/docs/guides/realtime/limits). Step 1 shipped the output
// re-announcing every 5 s - six calls in 30 s - and the measurement harness saw the live channel
// closed 25 to 27 s after every join on both preview branches: the output dropped out of the health
// line for 15 s of every 40. One call per 10 s is at most three in any 30 s, which leaves two for
// the join a rejoin costs and for whatever the server counts that this page cannot see.
//
// WHY PER PAGE AND NOT PER CHANNEL. The limit is per Realtime CLIENT, and a page has one
// (backend/supabase.ts `getSupabase`). The production page reopens its channel when the route moves
// to another production, and a gate per channel would reset the budget exactly when a burst is most
// likely. So the gate is a module singleton (`pagePresenceGate` in livePath.ts), and a channel only
// ever asks it.
//
// HOW. A request carries a KEY (one per channel) and a CALL. Requests coalesce: a later request
// for the same key replaces the earlier one, so a burst of state changes costs one call carrying
// the latest state. The call runs at once when the gate has been quiet for a whole interval - which
// is what makes the first announce on a join immediate - and otherwise when the interval is up. A
// call returns whether it actually spoke to the server; one that found nothing to send spends no
// budget. An untrack spends budget exactly like a track: none is sent today, and one added later
// must be requested here too.
//
// Plain TypeScript with no imports, so scripts/presence-gate.test.mjs runs it in Node.

/** At most one Presence call per this many milliseconds, per page: three in any 30 s. */
export const PRESENCE_CALL_INTERVAL_MS = 10_000;

export interface PresenceGate {
  /** Ask for a Presence call. The newest request per key wins; `call` returns true when it spoke
   *  to the server, which is what spends the budget. */
  request(key: string, call: () => boolean): void;
  /** Forget a key's pending request (its channel closed). */
  cancel(key: string): void;
}

export function createPresenceGate(
  opts: {
    intervalMs?: number;
    now?: () => number;
    setTimer?: (run: () => void, ms: number) => unknown;
    clearTimer?: (timer: unknown) => void;
  } = {},
): PresenceGate {
  const interval = opts.intervalMs ?? PRESENCE_CALL_INTERVAL_MS;
  const now = opts.now ?? (() => Date.now());
  const setTimer = opts.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = opts.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  // Insertion-ordered, so two channels on one page take turns rather than one starving the other.
  const pending = new Map<string, () => boolean>();
  let lastCallAt = -Infinity;
  let timer: unknown = null;

  const schedule = () => {
    if (timer !== null || pending.size === 0) return;
    const wait = lastCallAt + interval - now();
    if (wait <= 0) fire();
    else timer = setTimer(fire, wait);
  };
  const fire = () => {
    timer = null;
    // Take requests in turn until one actually calls; a request with nothing to send is free.
    for (const [key, call] of pending) {
      pending.delete(key);
      if (call()) {
        lastCallAt = now();
        break;
      }
    }
    schedule();
  };

  return {
    request(key, call) {
      pending.set(key, call);
      schedule();
    },
    cancel(key) {
      pending.delete(key);
      if (pending.size === 0 && timer !== null) {
        clearTimer(timer);
        timer = null;
      }
    },
  };
}
