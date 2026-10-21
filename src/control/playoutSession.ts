// ONE PRODUCTION'S PLAYOUT SESSION ON THE PAGE: its key, whether it is alive, and its disposal in
// one place (production-page refactor spec §2, §3).
//
// The key is the production id and nothing else (D2): publishing is a mode change inside one
// session, and opening another production disposes this session and creates the next. Disposal
// flips `alive`, so a fold or an answer that lands afterwards changes nothing, and runs every stop
// registered with `onDispose` once. In-flight requests are not aborted; their answers are ignored
// here and their effect on the server stands (§4.1 R3).
//
// Later phases add parts; every write to them is one synchronous `apply(fold)`, parts set in a
// fixed order (D4). No React and only `.ts` runtime imports, so a Node test drives it as it is.

export interface PlayoutSession {
  /** The production this session belongs to. */
  readonly key: string;
  /** False once disposed: folds are no-ops and nothing may be sent for this session. */
  alive: () => boolean;
  /** Move the session's parts with one fold, in a fixed order. A no-op once disposed. */
  apply: (fold: (parts: SessionParts) => SessionParts) => void;
  /** Run `stop` when the session is disposed (at once if it already is); answers an unregister. */
  onDispose: (stop: () => void) => () => void;
  /** End the session: flip `alive`, then run every registered stop once. */
  dispose: () => void;
}

/** The session's parts, as one fold sees them. */
export type SessionParts = Record<string, never>;

export function createPlayoutSession(productionId: string): PlayoutSession {
  let alive = true;
  const stops = new Set<() => void>();
  return {
    key: productionId,
    alive: () => alive,
    apply: (fold) => {
      if (!alive) return;
      fold({});
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
