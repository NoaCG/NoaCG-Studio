// A TIMER A HIDDEN TAB CANNOT STARVE (docs/work-specs/panel-ownership-lease/spec.md L7).
//
// Chromium throttles a hidden or covered tab's timers, down to once a minute after five minutes, so
// an operator page left behind another window would stop renewing its panel lease and stop beating
// to its panel. A dedicated worker's timer is not throttled that way, and its message wakes the page
// as an ordinary task. Where a worker cannot start, a plain interval stands in.

/** Call `tick` every `ms` until the returned function is called. */
export function workerInterval(ms: number, tick: () => void): () => void {
  try {
    const url = URL.createObjectURL(new Blob([`setInterval(function () { postMessage(0); }, ${Math.max(50, Math.round(ms))});`], { type: 'text/javascript' }));
    const worker = new Worker(url);
    // Not revoked before the worker has run: it fetches its script after this returns.
    let revoked = false;
    const revoke = () => {
      if (!revoked) URL.revokeObjectURL(url);
      revoked = true;
    };
    worker.onmessage = () => {
      revoke();
      tick();
    };
    return () => {
      revoke();
      worker.terminate();
    };
  } catch {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  }
}
