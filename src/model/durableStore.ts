// The DURABLE STORE - where the heavy saved documents actually live.
//
// WHY THIS EXISTS. localStorage caps an origin at roughly 5 MB, and a saved graphic is far
// bigger than its code: an uploaded image is a base64 data URL (+33%), localStorage stores
// UTF-16 so every character costs two bytes (x2), and a library record keeps the Reset
// baseline, a second copy of the same template (x2). A 150 KB logo therefore costs ~820 KB of
// the quota, the library fills after about ten graphics, and every save from then on fails.
// That is a real failure the owner hit in use, not a theoretical limit.
//
// IndexedDB replaces localStorage - the same layer (the browser, offline-first, no account),
// with a quota measured in gigabytes rather than megabytes. It does NOT replace the Supabase
// backend, which is the server layer an account unlocks; the product wants both.
//
// THE SHAPE. IndexedDB is asynchronous and localStorage is not, and the whole app reads these
// documents synchronously - from React renders, from module scope (templateStore reads the
// autosaved project as it loads), from the sync engine. So this module keeps a synchronous
// in-memory MIRROR and persists behind it:
//
//   read   - answered from the mirror, synchronously, exactly like localStorage
//   write  - updates the mirror synchronously, then queues a serialized IndexedDB put
//   hydrate- once, before the app mounts (src/main.tsx), so no read ever races the mirror
//
// Every model module keeps the signatures it had. What changes is WHEN a write's success is
// known: not on return, but a moment later. So a refusal cannot come back as that call's return
// value, and it is announced instead - `spx-storage-error`, which App.tsx turns into the same
// "Could not save" dialog and failed save status a synchronous quota error used to produce. Two
// rules keep that honest rather than merely loud:
//
//   - a refused write ROLLS THE MIRROR BACK, so the app never spends the session showing an
//     edit that no reload will reproduce ("the library keeps the last good copy" is true
//     immediately, not only after a refresh);
//   - every write is ATTEMPTED. An earlier refusal never blocks a later save - that is what
//     makes freeing space recover without a reload, and a "the store is full" latch that
//     short-circuits the next write deadlocks exactly the write that would clear it.
//
// The `try { setItem } catch { return 'Browser storage is full...' }` branches in the model
// modules therefore no longer fire against IndexedDB; they remain the live path in the
// degraded localStorage fallback below, where setItem really does throw.
//
// WHAT LIVES HERE, AND WHAT DOES NOT. Only the heavy documents move: the graphics library,
// productions, the working graphic and video slots, the saved videos, looks, and the retired
// packet store (which a legacy migration still reads). Small device preferences - prefs,
// layout, doc kind, brand, AI settings, sync metadata - stay in localStorage: they are
// kilobytes, they are read before hydration by design, and the E2E suite seeds several of
// them through `addInitScript`, which cannot reach IndexedDB.
//
// DEGRADING HONESTLY. A browser with no IndexedDB (private modes, locked-down embedders) or a
// database written by a NEWER build (a higher version number, which `open` rejects) falls back
// to localStorage for everything - the old ~5 MB ceiling, but never a crash and never eaten
// data. An older build reading a migrated profile finds the localStorage keys gone and starts
// empty rather than corrupt; the IndexedDB copy is untouched and returns when the newer build
// does. That is the reason the migration is one-way and marked, not a mirror kept in sync.
//
// ONE LIBRARY PER ACCOUNT. Each account that signs in on this browser keeps its documents under
// its own key names (model/accountScope.ts), and only the library in use is ever loaded into
// the mirror. This is a naming change, not a format change: the signed-out workspace keeps the
// plain names every earlier build wrote, so nothing already saved moves until an account adopts
// it, and DB_VERSION stays where it is. A build from before this change sees only the plain
// names - an account's library is invisible to it, never damaged by it.

import { accountKey, libraryAccount, unscopedKey } from './accountScope';

const DB_NAME = 'noacg-studio';
/** Format version. A breaking change to how records are stored bumps this and migrates in
 *  `upgradeDatabase`; a newer database than this build understands is refused (see above). */
const DB_VERSION = 1;
const STORE = 'kv';
const MIGRATED_KEY = '__migrated-from-localstorage';

/**
 * The keys this store owns. Everything else stays in localStorage. Kept explicit rather than
 * derived from an `spx-gfx-` prefix so moving a key is a deliberate decision with the
 * hydration-order consequence thought through, never a side effect of naming.
 */
export const DURABLE_KEYS = [
  'spx-gfx-graphics', // the graphics library (model/library.ts)
  'spx-gfx-shows', // productions (model/shows.ts)
  'spx-gfx-project', // the working graphic slot (model/project.ts)
  'spx-gfx-video-project', // the working video slot (model/videoProject.ts)
  'spx-gfx-video-saved', // saved videos (model/videoProject.ts)
  'spx-gfx-looks', // brand looks (model/packets.ts)
  'spx-gfx-packets', // the retired package store, still read by library.ts's v1 migration
] as const;

export type DurableKey = (typeof DURABLE_KEYS)[number];

const durableKeySet: ReadonlySet<string> = new Set<string>(DURABLE_KEYS);

// ── Whose library ────────────────────────────────────────────────────────────
//
// Every durable key is stored under the name `model/accountScope.ts` gives it in the library in
// use: the plain name for the signed-out workspace, `<key>@<user id>` for an account's. The rest
// of the app only ever says the plain name, and this module translates at the storage boundary,
// so no model module knows libraries exist. The account is read ONCE, as the module loads: a
// change of account reloads the page (backend/accountLibrary.ts), and the one change made in
// place - `adoptSignedOutLibrary` - updates it itself.
let namespace: string | null = libraryAccount();

/** The name `key` is stored under in the library currently in use. */
function physical(key: string): string {
  return accountKey(key, namespace);
}

// ── State ────────────────────────────────────────────────────────────────────

/** The synchronous mirror. Authoritative once hydrated. */
const mirror = new Map<string, string>();

/** Null until hydration decides. `false` = degraded to localStorage (see the header). */
let db: IDBDatabase | null = null;
let hydrated = false;
let usingIndexedDb = false;

/** Why this session is NOT on IndexedDB (null = it is). Read by the boot-health notice and
 *  the connection check, so a restricted browser fails loudly instead of silently. */
export type DurableDegradeReason = 'no-indexeddb' | 'open-failed' | 'read-failed' | 'timeout';
let degradeReason: DurableDegradeReason | null = null;

/**
 * Hydration's outcome is FINAL the moment it is decided, whichever side decides it first.
 * A wedged IndexedDB backend (an `open` that never fires any event - seen behind corporate
 * site-data policies and AV interception, and the one failure mode `openDatabase` cannot turn
 * into a rejection) would otherwise park the whole boot behind an await that never resolves.
 * So hydration races a timeout, and this latch is what makes the race safe: if the timeout
 * degrades the session to localStorage, a LATE open must be abandoned - were it committed, the
 * app would have already booted from (empty) localStorage, and the first autosave through the
 * suddenly-active mirror would overwrite the saved documents with a blank session.
 */
let settled = false;

/** How long boot waits for IndexedDB before degrading to localStorage. Generous against a slow
 *  disk, small against a person watching a stuck tab. */
const HYDRATE_TIMEOUT_MS = 4000;

/**
 * Writes that have been HANDED TO the database and not yet settled.
 *
 * The transaction is opened SYNCHRONOUSLY inside `setItem` rather than chained behind a
 * promise, and that is a durability decision, not a style one: a promise chain defers the
 * transaction by at least a microtask, and a reload in that window loses the write while the
 * mirror - and therefore the whole app - has already reported it saved. Measured, that window
 * was wide enough for a spec to observe a saved project and find it gone after `page.reload()`.
 *
 * Ordering survives the change because IndexedDB already guarantees it: readwrite transactions
 * over the same object store run in the order they were created. So two saves of one key still
 * land in order, without this module keeping a queue to make it so.
 */
const pending = new Set<Promise<void>>();

/** The newest write queued per key, so a failure knows whether it is still the current one. */
const latestWrite = new Map<string, number>();
let writeSeq = 0;

/**
 * A failure nobody has looked at yet. THE CLAIM PROTOCOL: a caller that cares which save failed
 * - "Adding “Clean Clock” to a production" says far more than "a write failed" - awaits
 * `commitDurableWrites()` and CLAIMS the message, reporting it in its own words. Everything
 * else (autosaves, background writes) leaves it unclaimed, and it is announced generically a
 * tick later. The ordering is what makes this reliable rather than a race: awaiting the pending
 * writes resumes on a MICROTASK, while the announcement is scheduled as a MACROTASK, so a
 * claimer always gets there first.
 */
let unclaimedFailure: { key: string; message: string } | null = null;

/** Hold the failure open for one macrotask so a caller can claim it, then announce what is left. */
function reportError(key: string, message: string): void {
  unclaimedFailure = { key, message };
  setTimeout(() => {
    if (!unclaimedFailure) return;
    const failure = unclaimedFailure;
    unclaimedFailure = null;
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('spx-storage-error', { detail: failure }));
  }, 0);
}

/**
 * Wait for the writes just queued to reach the database, and CLAIM any failure among them.
 * Returns the message when something was refused (the caller reports it in its own words, and
 * no generic announcement follows), or null when everything landed.
 *
 * This is what a surface calls when it would otherwise have branched on a synchronous quota
 * error: write, `await commitDurableWrites()`, and act on the answer - which is the same
 * decision it used to make, one await later.
 */
export async function commitDurableWrites(): Promise<string | null> {
  await flushDurableStore();
  const failure = unclaimedFailure;
  unclaimedFailure = null;
  return failure?.message ?? null;
}

// ── The localStorage fallback (also the pre-hydration path) ──────────────────

function localStorageKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key !== null) keys.push(key);
    }
  } catch {
    // No localStorage, nothing to list.
  }
  return keys;
}

function lsGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string): void {
  // Deliberately NOT caught: the caller's quota branch is the whole point.
  localStorage.setItem(key, value);
}

function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // Nothing to do - the key is already unreachable.
  }
}

// ── IndexedDB plumbing ───────────────────────────────────────────────────────

function upgradeDatabase(target: IDBDatabase): void {
  if (!target.objectStoreNames.contains(STORE)) target.createObjectStore(STORE);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('indexedDB.open failed'));
      return;
    }
    request.onupgradeneeded = () => upgradeDatabase(request.result);
    request.onsuccess = () => resolve(request.result);
    // A VersionError lands here: the profile was written by a newer build, so this one
    // degrades to localStorage rather than downgrading anybody's data.
    request.onerror = () => reject(request.error ?? new Error('indexedDB.open was refused'));
    request.onblocked = () => reject(new Error('indexedDB.open is blocked by another tab'));
  });
}

/** One key's current value, straight from the database - what another tab's write left there. */
function idbReadKey(target: IDBDatabase, key: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const tx = target.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).get(key);
    tx.oncomplete = () => resolve(typeof request.result === 'string' ? request.result : null);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read was aborted'));
  });
}

/** One transaction applying a batch of puts/deletes. Rejects with the transaction's error, so
 *  a quota failure keeps its `QuotaExceededError` name for the caller to recognise. */
function idbWrite(target: IDBDatabase, entries: [string, string | null][]): Promise<void> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try {
      tx = target.transaction(STORE, 'readwrite');
    } catch (e) {
      reject(e instanceof Error ? e : new Error('IndexedDB is unavailable'));
      return;
    }
    const store = tx.objectStore(STORE);
    try {
      for (const [key, value] of entries) {
        if (value === null) store.delete(key);
        else store.put(value, key);
      }
    } catch (e) {
      // A synchronous throw from put() (a quota refusal can surface this way) aborts the
      // whole batch, which is what keeps a multi-key migration all-or-nothing.
      try {
        tx.abort();
      } catch {
        // Already aborting.
      }
      reject(e instanceof Error ? e : new Error('IndexedDB write failed'));
      return;
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write was aborted'));
  });
}

function isQuotaError(e: unknown): boolean {
  return e instanceof Error && (e.name === 'QuotaExceededError' || /quota/i.test(e.message));
}

/** The values of `keys` in one read-only transaction. Only the library in use is read at boot:
 *  another account's documents on the same browser are never loaded into this page. */
function idbReadKeys(target: IDBDatabase, keys: string[]): Promise<Map<string, string>> {
  return new Promise((resolve, reject) => {
    const out = new Map<string, string>();
    const tx = target.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        if (typeof request.result === 'string') out.set(key, request.result);
      };
    }
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB read failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB read was aborted'));
  });
}

// ── Hydration + the one-way move off localStorage ────────────────────────────

let hydration: Promise<void> | null = null;

/**
 * Load the durable documents into the synchronous mirror, moving them out of localStorage the
 * first time. Call ONCE before anything imports a model module that reads at load time
 * (src/main.tsx awaits this before importing App). Idempotent, and it never rejects: a browser
 * that cannot give us IndexedDB degrades to localStorage instead of failing to boot.
 */
export function hydrateDurableStore(): Promise<void> {
  if (!hydration) {
    hydration = (async () => {
      // The race, not a rejection: `openDatabase` can only reject on an event IndexedDB
      // actually fires, and a wedged backend fires none. See `settled` above for why the
      // loser of this race must then stand down entirely.
      await Promise.race([
        runHydration(),
        new Promise<void>((resolve) => setTimeout(resolve, HYDRATE_TIMEOUT_MS)),
      ]);
      if (!settled) finishDegraded('timeout');
    })();
  }
  return hydration;
}

async function runHydration(): Promise<void> {
  if (typeof indexedDB === 'undefined') {
    finishDegraded('no-indexeddb');
    return;
  }
  let opened: IDBDatabase;
  try {
    opened = await openDatabase();
  } catch {
    finishDegraded('open-failed');
    return;
  }
  // Arriving second in the race: the session already runs on localStorage and the app has
  // booted from it. Committing now would hand the mirror to autosave mid-session (see
  // `settled`); abandoning keeps the database exactly as the next healthy boot expects it.
  if (settled) {
    try {
      opened.close();
    } catch {
      // Nothing to release.
    }
    return;
  }
  try {
    const stored = await idbReadKeys(opened, [MIGRATED_KEY, ...DURABLE_KEYS.map(physical)]);
    if (!settled && !stored.has(MIGRATED_KEY)) await migrateFromLocalStorage(opened, stored);
    if (settled) {
      opened.close();
      return;
    }
    // The mirror is keyed by the PLAIN name; `physical` only ever appears at the storage edge.
    for (const key of DURABLE_KEYS) {
      const value = stored.get(physical(key));
      if (typeof value === 'string') mirror.set(key, value);
    }
    db = opened;
    usingIndexedDb = true;
    hydrated = true;
    settled = true;
    // Only on the IndexedDB path: the degraded fallback is localStorage, where the browser's own
    // `storage` event already tells the other tabs, and where there is no mirror to invalidate.
    startCrossTabInvalidation();
  } catch {
    try {
      opened.close();
    } catch {
      // Closing a database that never opened cleanly is not worth reporting.
    }
    finishDegraded('read-failed');
    return;
  }
  // Best-effort: ask the browser not to evict this origin under storage pressure. Ignored
  // where unsupported, and a refusal changes nothing - eviction was already the status quo.
  try {
    void navigator.storage?.persist?.();
  } catch {
    // Not available; nothing to fall back to.
  }
}

/** IndexedDB is unusable here: keep reading and writing localStorage, ceiling and all. */
function finishDegraded(reason: DurableDegradeReason): void {
  if (settled) return;
  settled = true;
  degradeReason = reason;
  db = null;
  usingIndexedDb = false;
  hydrated = true;
}

/**
 * The one-way move. Copy every durable key present in localStorage into IndexedDB in ONE
 * transaction, and only once it has committed remove them from localStorage - so a failure
 * part-way leaves the original data exactly where it was. The marker makes it run once; it is
 * written in the same transaction as the copy, so a marked database always has the data.
 */
async function migrateFromLocalStorage(
  target: IDBDatabase,
  stored: Map<string, string>,
): Promise<void> {
  const moving: [string, string][] = [];
  // Every library's keys move, not only the one in use: a browser that ran on the localStorage
  // fallback can hold several accounts' documents, and the marker below means this runs once.
  // Hence the keys come from localStorage itself rather than from DURABLE_KEYS.
  for (const key of localStorageKeys()) {
    if (!durableKeySet.has(unscopedKey(key))) continue;
    const value = lsGet(key);
    // A key already in IndexedDB wins: it is the newer copy by construction (this build wrote
    // it), and a stale localStorage leftover must never overwrite it. `stored` holds only the
    // library in use, so for any other key this asks the database directly.
    if (value === null || stored.has(key) || (await idbReadKey(target, key)) !== null) continue;
    moving.push([key, value]);
  }
  // Abandoned by the hydration timeout: this session runs on localStorage, so it must stay
  // authoritative - no copy, no marker, and the next healthy boot migrates the then-current
  // values instead of a snapshot from a session that kept editing after it.
  if (settled) return;
  await idbWrite(target, [...moving, [MIGRATED_KEY, new Date().toISOString()]]);
  // The narrow losing case: the timeout fired while the transaction was in flight. The copy
  // and the marker are in the database now, but this session is on localStorage - keep the
  // localStorage originals too (skip the removes), so the session keeps its data. The boot
  // notice already tells the user this session's edits may not survive.
  if (settled) return;
  stored.set(MIGRATED_KEY, 'done');
  for (const [key, value] of moving) {
    stored.set(key, value);
    lsRemove(key);
  }
}

// ── The seam the model modules use ───────────────────────────────────────────

/**
 * localStorage's shape, backed by the durable store. The model modules changed one identifier
 * each; everything about their error handling still works, because `setItem` throws on a
 * refused write exactly as localStorage does.
 */
export const durable = {
  getItem(key: string): string | null {
    if (!durableKeySet.has(key)) return lsGet(key);
    if (!hydrated || !usingIndexedDb) return lsGet(physical(key));
    return mirror.get(key) ?? null;
  },

  setItem(key: string, value: string): void {
    if (!durableKeySet.has(key)) {
      lsSet(key, value);
      return;
    }
    if (!hydrated || !usingIndexedDb) {
      lsSet(physical(key), value);
      return;
    }
    const previous = mirror.get(key) ?? null;
    mirror.set(key, value);
    queueWrite(key, value, previous);
  },

  removeItem(key: string): void {
    if (!durableKeySet.has(key)) {
      lsRemove(key);
      return;
    }
    if (!hydrated || !usingIndexedDb) {
      lsRemove(physical(key));
      return;
    }
    const previous = mirror.get(key) ?? null;
    mirror.delete(key);
    queueWrite(key, null, previous);
  },

  /** Every durable key currently holding a value - what `storageHealth` measures. */
  keys(): string[] {
    if (!hydrated || !usingIndexedDb) return DURABLE_KEYS.filter((k) => lsGet(physical(k)) !== null);
    return [...mirror.keys()];
  },
};

/**
 * Persist one change behind the mirror. `previous` is what the mirror held before the caller
 * overwrote it: a write that is REFUSED must not leave the mirror holding data no reload will
 * ever produce, or the app would spend the rest of the session showing an edit that does not
 * exist - "the library keeps the last good copy" has to be true immediately, not only after a
 * refresh. The rollback is skipped when a NEWER write for the same key has been queued since,
 * because that one owns the mirror now.
 */
function queueWrite(key: string, value: string | null, previous: string | null): void {
  const target = db;
  if (!target) return;
  writeSeq += 1;
  const seq = writeSeq;
  latestWrite.set(key, seq);
  // Opened NOW - see `pending` above for why the transaction must not wait for a microtask.
  const write = idbWrite(target, [[physical(key), value]]).catch((e: unknown) => {
    if (latestWrite.get(key) === seq) {
      if (previous === null) mirror.delete(key);
      else mirror.set(key, previous);
      // The surfaces that just rendered the accepted value have to re-read the real one.
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('spx-data-changed'));
      }
    }
    if (isQuotaError(e)) {
      reportError(
        key,
        'Browser storage is full — delete an old graphic (large fonts/images count) or export and remove one.',
      );
    } else {
      reportError(key, 'Your work could not be saved to browser storage.');
    }
  });
  pending.add(write);
  void write.finally(() => {
    pending.delete(write);
    // Tell the other tabs. AFTER the put has settled, so a tab that re-reads on this message
    // cannot read the value the write was replacing.
    if (latestWrite.get(key) === seq) announceWrite(key);
  });
}

// ── CROSS-TAB INVALIDATION ────────────────────────────────────────────────────
//
// The mirror is PER TAB, and IndexedDB is shared. Without this, a second tab on the same
// production silently loses work: every model mutator here is a read-modify-WHOLE-RECORD write
// (`patchShow` = loadAllShows → mutate → save the lot), so a tab holding a mirror from before
// another tab's write puts that old array straight back. Reproduced 2026-08-21: a table created
// in a second tab was gone from the database after any cue edit in the first, read back from a
// third, fresh tab. Nothing about it was theoretical, and nothing about it needed two PEOPLE -
// one person with two tabs open is enough.
//
// So a landed write ANNOUNCES its key and the other tabs re-read exactly that key. It closes
// the hazard rather than narrowing it to zero: the re-read is asynchronous, so a tab that
// writes in the milliseconds between the message and the re-read landing can still overwrite.
// Removing that last window means writing through the DATABASE rather than the mirror, which
// every synchronous model reader in the app is built against - a much larger change, and a
// separate one. This is the ordinary case, which is a person editing in one tab at a time.
//
// `spx-data-changed` is dispatched after the re-read, because a refreshed mirror nobody re-reads
// leaves every mounted surface showing the value it already had.
const CHANNEL_NAME = 'noacg-durable-writes';
let channel: BroadcastChannel | null = null;

function announceWrite(key: string): void {
  channel?.postMessage({ key });
}

/** Adopt another tab's write. Best-effort by nature: a failed re-read leaves the mirror as it
 *  was, which is exactly where this module started, so it is never worse for having tried. */
async function adoptWrite(key: string): Promise<void> {
  const target = db;
  if (!target || !durableKeySet.has(key)) return;
  try {
    const value = await idbReadKey(target, physical(key));
    if (value === null) mirror.delete(key);
    else mirror.set(key, value);
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('spx-data-changed'));
  } catch {
    /* the mirror keeps what it had */
  }
}

function startCrossTabInvalidation(): void {
  if (channel || typeof BroadcastChannel === 'undefined') return;
  channel = new BroadcastChannel(CHANNEL_NAME);
  channel.onmessage = (event: MessageEvent<{ key?: unknown }>) => {
    const key = event.data?.key;
    if (typeof key === 'string') void adoptWrite(key);
  };
}

// ── Changing hands ───────────────────────────────────────────────────────────

/**
 * The account whose documents this page actually LOADED (null = the signed-out workspace). This,
 * not the stored account name, is what anything sending documents to the cloud must check: the
 * name changes a moment before the reload that brings the documents to match it.
 */
export function libraryInUse(): string | null {
  return namespace;
}

/** Whether `account` already keeps documents on this browser. */
export async function libraryHasDocuments(account: string): Promise<boolean> {
  const keys = DURABLE_KEYS.map((key) => accountKey(key, account));
  if (db && usingIndexedDb) return (await idbReadKeys(db, keys)).size > 0;
  return keys.some((key) => lsGet(key) !== null);
}

/**
 * Make the signed-out workspace `account`'s library, IN PLACE: the documents on screen are
 * renamed to the account's keys and this page carries on with them - the same data, now bound.
 * This is how work made before signing up (or by a build that predates account libraries)
 * becomes the account's. Only valid while the page shows the signed-out workspace and the
 * account has nothing here yet (`libraryHasDocuments`); anything else is a MERGE, which
 * backend/accountLibrary.ts does through the cloud instead. Resolves false when the move was
 * refused, with every document still under its signed-out name.
 */
export async function adoptSignedOutLibrary(account: string): Promise<boolean> {
  if (namespace === account) return true;
  if (namespace !== null) return false;

  if (!db || !usingIndexedDb) {
    // The localStorage fallback: key by key, copy then remove, so the ceiling is never asked for
    // the whole library twice. A refusal puts back whatever had already moved.
    const moved: string[] = [];
    try {
      for (const key of DURABLE_KEYS) {
        const value = lsGet(key);
        if (value === null) continue;
        lsSet(accountKey(key, account), value);
        lsRemove(key);
        moved.push(key);
      }
    } catch {
      for (const key of moved) {
        const value = lsGet(accountKey(key, account));
        if (value === null) continue;
        try {
          lsSet(key, value);
          lsRemove(accountKey(key, account));
        } catch {
          // Left under the account's name - still on this device, found when it signs in.
        }
      }
      return false;
    }
    namespace = account;
    return true;
  }

  // IndexedDB: one transaction writes every document under the account's name and deletes the
  // signed-out one, taken from the MIRROR (the newest value of each). The switch happens in the
  // same synchronous step that creates the transaction, so every write the app makes from here
  // on is queued after it and lands under the new names - nothing can slip in between.
  const target = db;
  const rename = (from: string | null, to: string | null): [string, string | null][] =>
    DURABLE_KEYS.flatMap((key): [string, string | null][] => [
      [accountKey(key, to), mirror.get(key) ?? null],
      [accountKey(key, from), null],
    ]);
  namespace = account;
  const move = idbWrite(target, rename(null, account));
  pending.add(move);
  try {
    await move;
    return true;
  } catch {
    // The transaction moved nothing. Go back to the signed-out names and write the mirror there
    // again, because any write made while it was in flight went to the account's names.
    namespace = null;
    try {
      await idbWrite(target, rename(account, null));
    } catch {
      // Both copies are still on this device; the next healthy boot finds the signed-out one.
    }
    return false;
  } finally {
    pending.delete(move);
  }
}

/**
 * Wait for every queued write to reach the database. The app does not need this - the writes
 * land on their own - but a test that asserts what survives a reload does, and so does a
 * caller that wants to know a save is durable before it reports success.
 */
export async function flushDurableStore(): Promise<void> {
  // A settling write can start another (a rollback never does, but a caller reacting to
  // `spx-data-changed` might), so drain until the set is empty rather than snapshotting once.
  while (pending.size > 0) await Promise.all([...pending]);
}

/** True when the durable documents are actually in IndexedDB (false = the degraded fallback). */
export function isDurableStoreActive(): boolean {
  return hydrated && usingIndexedDb;
}

/**
 * The boot outcome, for the surfaces that say it out loud: the app-level storage notice and
 * the connection check. `degraded` is null on the healthy path; 'timeout' is the one reason
 * where saved documents EXIST but could not be shown (the others mean the browser never had
 * them anywhere else than localStorage to begin with).
 */
export function durableStoreHealth(): { active: boolean; degraded: DurableDegradeReason | null } {
  return { active: hydrated && usingIndexedDb, degraded: degradeReason };
}

/**
 * How much room there is, as the browser reports it. Asynchronous by nature (there is no
 * synchronous quota API), so the storage dialog reads it once when it opens. `null` where the
 * browser will not say, which is a real answer: "we cannot tell you", not "unlimited".
 */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate || typeof estimate.usage !== 'number' || typeof estimate.quota !== 'number') {
      return null;
    }
    return { usage: estimate.usage, quota: estimate.quota };
  } catch {
    return null;
  }
}
