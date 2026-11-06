// THE RELOAD LOCK AMONG A BROWSER'S TABS (#2245, #2250): the Bridge watch's `io.lead`
// (control/bridgeWatch.ts) over Web Locks, so of the tabs armed for a production one alone reloads
// its CasparCG output. Without Web Locks (an insecure origin) every tab holds it, as before #2245.

import type { Lead } from './bridgeWatch';

/** Ask for `key` and hold it until `release`. A grant that arrives after `release` (the browser
 *  granted it, then the watch let go before the grant ran) lets go at once: otherwise this tab
 *  would keep the lock until it closes, and no other tab could lead. */
export function webLockLead(locks: LockManager | undefined, key: string): Lead {
  if (!locks) return { held: () => true, release: () => {} };
  let held = false;
  let released = false;
  let free = () => {};
  const asked = new AbortController();
  locks
    .request(key, { signal: asked.signal }, () => {
      if (released) return undefined;
      held = true;
      return new Promise<void>((resolve) => {
        free = resolve;
      });
    })
    .catch(() => {}); // released before it was granted
  return {
    held: () => held,
    release: () => {
      released = true;
      asked.abort();
      held = false;
      free();
    },
  };
}
