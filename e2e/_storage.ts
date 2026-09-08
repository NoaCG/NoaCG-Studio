import type { Page } from '@playwright/test';

// MAKING BROWSER STORAGE REFUSE A WRITE.
//
// The saved documents live in IndexedDB (src/model/durableStore.ts), whose quota on a test
// profile is measured in GIGABYTES. The old helper filled localStorage to the last few bytes
// and that is no longer possible in any reasonable time - so these specs now INJECT the
// refusal instead of provoking it.
//
// That is a deliberate step down in fidelity and worth naming: what is still pinned is that a
// refused write is announced, that the library keeps its last good copy, and that freeing room
// recovers - the behaviour the acceptance pass of 2026-08-06 found missing. What is no longer
// pinned is the browser's own quota arithmetic, which is exactly the thing this branch made
// two orders of magnitude less likely to matter.
//
// The switch is armed on `window`, and the wrapper is installed for the whole page: writes go
// through one `IDBObjectStore.prototype.put`, so flipping the flag mid-test needs no reload
// and freeing space is the same flag going back down.

const FLAG = '__noacgStorageFull';

/** Install the refusal switch. Must run BEFORE the first goto (it is an init script). */
export async function armStorageFailure(page: Page): Promise<void> {
  await page.addInitScript(() => {
    // The WHOLE body is guarded: an init script also runs inside the sandboxed preview iframes
    // (allow-scripts with no allow-same-origin), where touching storage APIs can throw - and an
    // uncaught error there lands in the page-error listeners some specs assert empty.
    try {
      if (typeof IDBObjectStore === 'undefined') return;
      const realPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function put(this: IDBObjectStore, ...args: unknown[]) {
        if ((window as unknown as Record<string, unknown>).__noacgStorageFull) {
          const e = new Error('The browser storage quota is exhausted.');
          e.name = 'QuotaExceededError';
          throw e;
        }
        return (realPut as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as typeof IDBObjectStore.prototype.put;
    } catch {
      /* nothing to install here */
    }
  });
}

/** From now on every durable write is refused, as a device with no room left would. */
export async function fillStorage(page: Page): Promise<void> {
  await page.evaluate((flag) => {
    (window as unknown as Record<string, unknown>)[flag] = true;
  }, FLAG);
}

/** Room freed - the next write must land, with no reload. */
export async function freeStorage(page: Page): Promise<void> {
  await page.evaluate((flag) => {
    (window as unknown as Record<string, unknown>)[flag] = false;
  }, FLAG);
}

/**
 * What is ACTUALLY ON DISK for a durable key - read straight out of IndexedDB, past the app
 * entirely.
 *
 * A spec that is about to reload must wait on THIS, not on `loadProject()`. The model reads the
 * durable store's synchronous mirror, which holds a write from the instant it is accepted, while
 * the database has it a moment later - so polling the model proves the app knows, never that a
 * fresh session would. That gap cost a real failure: `ai.spec.ts` watched the autosave slot fill,
 * reloaded, and got the first-visit wizard over an empty studio.
 *
 * Going through the raw database rather than a module export also sidesteps the ghost-instance
 * trap: a dynamic import in an evaluate can resolve a SECOND, unhydrated copy of the store
 * (e2e/AGENTS.md "Gotchas when writing a spec"), whose answer would be an empty and very
 * convincing lie.
 */
export async function durableValue(page: Page, key: string): Promise<string | null> {
  return page.evaluate(
    (k) =>
      new Promise<string | null>((resolve) => {
        let request: IDBOpenDBRequest;
        try {
          request = indexedDB.open('noacg-studio', 1);
        } catch {
          resolve(null);
          return;
        }
        request.onerror = () => resolve(null);
        request.onsuccess = () => {
          const db = request.result;
          try {
            const get = db.transaction('kv', 'readonly').objectStore('kv').get(k);
            get.onsuccess = () => resolve(typeof get.result === 'string' ? get.result : null);
            get.onerror = () => resolve(null);
          } catch {
            resolve(null); // no store yet - nothing has been written
          }
        };
      }),
    key,
  );
}
