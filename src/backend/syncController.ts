// The sync controller (Era 5.2): the stateful glue between the app and the pure sync engine. Holds
// the provider instances, guards that sync only runs when a backend is configured AND the user is
// signed in, debounces pushes after local edits, serializes overlapping runs, and publishes a
// status other UI can subscribe to. Everything no-ops in offline mode, so the offline app is
// untouched.

import { isBackendConfigured } from './config';
import { consumeDeliberateSignOut, getSignedInUserId, subscribeAuth } from './auth';
import { bindLibraryToAccount, followLibraryChangesInOtherTabs } from './accountLibrary';
import { canAuthorAccount, changeSyncedElsewhere, commitDurableWrites, libraryInUse, markOwnWritesSynced, setAccountAuthoringEnabled } from '../model/durableStore';
import { LocalStorageProvider } from './storage';
import { SupabaseProvider } from './supabaseProvider';
import { libraryHasArrived, runSync, type SyncResult } from './sync';
import type { StoredRecord } from './storage';
import { purgeOldTombstones } from '../model/packets';
import { purgeOldShowTombstones } from '../model/shows';
import { purgeOldVideoTombstones } from '../model/videoProject';
import { purgeOldGraphicTombstones } from '../model/library';

export type SyncPhase = 'offline' | 'pending' | 'syncing' | 'synced' | 'error';

/** What a pass is about to pull, in the things Home lists. A tombstone brings nothing to look at,
 *  so it is not counted. */
export interface IncomingCounts {
  graphics: number;
  productions: number;
  videos: number;
}

export interface SyncState {
  phase: SyncPhase;
  detail?: string;
  last?: SyncResult;
  /** On 'syncing' and 'error': this library's first pass on this browser has not landed yet (it
   *  never finished one, or the one it finished could not write its pulls), so what the account
   *  keeps in the cloud may not be here. A browser that has none of it reads
   *  exactly like an empty account, which is why Home asks (docs/SAVED_CONTENT_MODEL.md §3). */
  firstPass?: boolean;
  /** On a first pass, once the cloud has been listed: how much is on its way. */
  incoming?: IncomingCounts;
  verifiedAt?: string;
}

function countIncoming(records: StoredRecord[]): IncomingCounts {
  const counts: IncomingCounts = { graphics: 0, productions: 0, videos: 0 };
  for (const r of records) {
    if (r.deleted) continue;
    if (r.kind === 'graphic') counts.graphics += 1;
    else if (r.kind === 'show') counts.productions += 1;
    else if (r.kind === 'video') counts.videos += 1;
  }
  return counts;
}

const local = new LocalStorageProvider();
// Writes only into the account whose library this page loaded (see SupabaseProvider).
const remote = new SupabaseProvider({ onlyInto: libraryInUse });

let state: SyncState = { phase: 'offline' };
const listeners = new Set<(s: SyncState) => void>();

function setState(next: SyncState): void {
  state = next;
  listeners.forEach((fn) => fn(next));
}

export function getSyncState(): SyncState {
  return state;
}

export function onSyncState(cb: (s: SyncState) => void): () => void {
  listeners.add(cb);
  cb(state);
  return () => {
    listeners.delete(cb);
  };
}

/** Sync can run only with a configured backend, a live session, AND the signed-in account's own
 *  library in use (backend/accountLibrary.ts). The last one is the guard that keeps a library
 *  from ever being pushed into somebody else's cloud - a debounced push can fire in the moment
 *  between a new sign-in and the page reloading onto that account's library. */
async function canSync(): Promise<boolean> {
  if (!isBackendConfigured()) return false;
  const user = await getSignedInUserId();
  return user !== null && user === libraryInUse();
}

let running = false;
let queued = false;
let revision = 0;
let sessionEpoch = 0;
let checkedThisPage = false;


/**
 * Callers who asked for a sync WHILE ONE WAS ALREADY RUNNING, waiting to be told that a pass
 * covering their call has finished. They are answered by the pass that starts AFTER them (the
 * coalesced one `queued` asks for), never by the one that was already in flight.
 *
 * THE DISTINCTION IS THE WHOLE POINT, and skipping it cost R2.4 on production. A pass lists the
 * cloud once, near its start; a record created after that list is not in it. `await syncNow()`
 * used to return an already-resolved promise in this branch, so a caller that meant "pull, then
 * look again" looked again having pulled nothing. The deep link `noacg save` prints is exactly
 * that caller: the studio boots, its sign-in pass is already running, the graphic was saved a
 * second ago, and the re-check after the "sync" missed it and redirected to Home. It arrived
 * about five seconds later, with the URL long since rewritten.
 */
let waiting: Array<() => void> = [];

/** Answer every waiter. Called when a pass finishes and when no pass can run at all — a waiter
 *  that hangs is worse than one told "nothing came", because its caller waits forever. */
function answer(list: Array<() => void>): void {
  for (const resolve of list) resolve();
}

/**
 * Run a sync now (guarded, serialized). Safe to call anytime; no-ops when it can't sync.
 *
 * RESOLVES WHEN A PASS THAT COULD SEE THE CALLER'S DATA HAS COMPLETED - which is the promise
 * every caller already assumed it was making. See `waiting` above for what that costs when it
 * is not true.
 */
export async function syncNow(): Promise<void> {
  if (!(await canSync())) {
    if (libraryInUse()) setAccountAuthoringEnabled(false);
    setState({ phase: 'offline', firstPass: !!libraryInUse() && !checkedThisPage, detail: libraryInUse() ? 'Account session unavailable. Editing is paused; pending work is preserved. Sign in again.' : 'Local workspace. Work here is not saved to an account.' });
    // RELEASING THE WAITERS HERE IS ONLY HONEST WHEN NOTHING IS COMING. This branch is reached
    // by any caller at any moment - a debounced push, a boot pass fired while the session is
    // still being read - and a pass that is running or queued will still answer them. Releasing
    // on somebody else's "I cannot sync" told a deep-link lookup the cloud had answered when
    // nothing had been asked yet, and it went to Home while its record was seconds away.
    // If sync really is over, the queued pass reaches this branch with both flags down and
    // releases them then, so nobody waits forever either.
    //
    // ONE WINDOW REMAINS, deliberately: the re-dispatch below clears `queued` and then awaits
    // `canSync()` inside the new call, and a third caller arriving inside that await sees both
    // flags down. Closing it needs the pass chain to be one object rather than two booleans,
    // which is a change to make when something needs it. A caller that acts on a release must
    // therefore check that a pass really did run - `backend/graphicWhenSynced.ts` reads the
    // phase for exactly this reason, and anything new here should do the same.
    if (!running && !queued) {
      answer(waiting);
      waiting = [];
    }
    return;
  }
  if (running) {
    queued = true; // coalesce: one more pass after the current finishes
    return new Promise<void>((resolve) => {
      waiting.push(resolve);
    });
  }
  running = true;
  if (debounce) clearTimeout(debounce);
  debounce = null;
  const startedRevision = revision;
  const epoch = sessionEpoch;
  // Everyone who asked DURING the previous pass is answered when this one finishes; everyone
  // who asks during THIS pass goes into the fresh list and waits for the next.
  const answered = waiting;
  waiting = [];
  const firstPass = !checkedThisPage || !libraryHasArrived();
  setState({ phase: 'syncing', firstPass });
  try {
    // Manual checks can arrive before autosave. Confirm the working revision first.
    window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
    const storageError = await commitDurableWrites();
    if (storageError) throw new Error(storageError);
    // Sync's own pull-writes dispatch 'spx-data-changed' too; that's fine — runSync is idempotent,
    // so the extra pass they schedule finds nothing to do. Not suppressing them means a genuine
    // user edit that lands DURING a sync is never swallowed and gets its own follow-up pass.
    const result = await runSync(
      local,
      remote,
      firstPass ? (plan) => setState({ phase: 'syncing', firstPass: true, incoming: countIncoming(plan.toLocal) }) : undefined,
    );
    if (epoch !== sessionEpoch) return;
    // Coordinated tombstone purge: drop deletes older than the grace period from BOTH sides (same
    // cutoff), so a purged tombstone can't be re-pulled. 90 days is generous; a device offline
    // longer than that could resurrect a delete — an acceptable edge for a beta. Best-effort.
    try {
      const cutoff = new Date(Date.now() - 90 * 86_400_000).toISOString();
      await remote.purgeTombstones(cutoff);
      purgeOldTombstones(cutoff);
      purgeOldShowTombstones(cutoff);
      purgeOldVideoTombstones(cutoff);
      purgeOldGraphicTombstones(cutoff);
    } catch {
      // Never fail a sync on cleanup.
    }
    if (epoch !== sessionEpoch) return;
    if (result.failures.length > 0) {
      // The pass completed and the bookmark advanced, but some records could not be applied —
      // surface them (SyncStatus shows the detail in its panel). They retry next pass.
      const shown = result.failures.slice(0, 3).map((f) => `${f.kind} "${f.name}": ${f.message}`);
      const extra = result.failures.length > shown.length ? '; …' : '';
      setState({
        phase: 'error',
        detail: `${result.failures.length} record${result.failures.length === 1 ? '' : 's'} failed to sync — ${shown.join('; ')}${extra}`,
        last: result,
        // A first pass whose pulls the store refused has not brought the library either.
        firstPass,
      });
    } else {
      checkedThisPage = true;
      if (startedRevision !== revision) {
        queued = true;
        setState({ phase: 'pending', last: result, detail: 'The current revision has not been confirmed in the cloud.' });
      } else setState({ phase: 'synced', last: result, verifiedAt: new Date().toISOString() });
    }
  } catch (e) {
    // A pass that throws never moved the bookmark, so a first pass is still owed.
    if (epoch === sessionEpoch) setState({ phase: 'error', detail: e instanceof Error ? e.message : String(e), firstPass });
  } finally {
    running = false;
    answer(answered);
    if (queued) {
      queued = false;
      // Through syncNow, not the body directly: the session can have ended while this pass ran,
      // and that early return is also what releases the waiters this pass did not answer.
      void syncNow();
    }
  }
}

// ONE PASS PER CHANGE, NOT ONE PER OPEN TAB. Every tab of the browser hears every library write:
// the tab that made it directly, and each other tab when it adopts the write from IndexedDB
// (model/durableStore.ts). Each used to run its own full pass, so two tabs doubled the lists one
// edit cost, and on 2026-09-29 that list load ran into statement timeouts and a database restart
// that failed every Take in the window. The pass reads the whole shared library, so ONE tab's pass
// pushes everybody's writes: the tab that made the change owns it, and an adopted change only
// refreshes the screen. Two exceptions keep every write pushed: a write from a tab that does not
// run sync at all (a production or control page opened on its own) is not marked, so the syncing
// tabs still push it; and a tab closing before its pass ran hands the pass on (`handOverOnClose`).
// A tab that is killed rather than closed hands nothing on: its write waits in IndexedDB for the
// next pass any tab runs, as it always did with one tab open.
const DEBOUNCE_MS = 2500;
let debounce: ReturnType<typeof setTimeout> | null = null;
function scheduleSync(event?: Event): void {
  revision++;
  if (libraryInUse()) setState({ phase: 'pending', firstPass: !checkedThisPage, detail: 'Not saved to cloud. Changes on this device are awaiting confirmation.' });
  if (event && changeSyncedElsewhere(event)) return;
  if (debounce) clearTimeout(debounce);
  debounce = setTimeout(() => {
    debounce = null;
    void syncNow();
  }, DEBOUNCE_MS);
}

/** A tab that goes away with a pass still owed (debounced, running or queued) asks the other tabs
 *  of this browser to run one. They share its library through IndexedDB, and `syncNow` still
 *  checks each receiver's own account, so the message carries nothing. ONE of them takes it: the
 *  first to ask holds a Web Lock through the debounce and its pass, and the others find it held.
 *  Without Web Locks each schedules one. Without BroadcastChannel the durable store has no
 *  cross-tab adoption either, so every tab already syncs its own writes. */
function handOverOnClose(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  const owed = new BroadcastChannel('noacg-sync-owed');
  owed.onmessage = () => {
    if (!navigator.locks) {
      scheduleSync();
      return;
    }
    void navigator.locks.request('noacg-sync-handover', { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_MS));
      await syncNow();
    });
  };
  window.addEventListener('pagehide', () => {
    if (debounce || running || queued) owed.postMessage('owed');
  });
}

let started = false;

/** Begin auto-sync: a pass whenever a session arrives, then a debounced push after every local
 *  data change. No-op in offline mode (never even attaches the listener). Idempotent.
 *
 *  SIGNING IN IS A SYNC TRIGGER. The app mounts signed out — its own session is read
 *  asynchronously, and a fresh browser has none at all — so the pass this used to fire at mount
 *  always found `canSync()` false and parked the status at 'offline'. Nothing then re-ran it: a
 *  user who signed in and made no edit saw no status chip, pushed nothing, and (on a new machine,
 *  the reason to sign in at all) pulled none of their work back. Sign-OUT is the mirror: the
 *  status must fall back to 'offline' rather than leave a stale "Synced" claiming an account the
 *  session no longer has. Only a CHANGE of account acts — a token refresh is not a reason to
 *  re-sync. */
export function startAutoSync(): void {
  if (started || typeof window === 'undefined' || !isBackendConfigured()) return;
  started = true;
  setAccountAuthoringEnabled(false);
  if (libraryInUse()) setState({ phase: 'syncing', firstPass: true, detail: 'Checking the account session and cloud revision. Cached work is not yet confirmed.' });
  window.addEventListener('spx-data-changed', scheduleSync);
  window.addEventListener('spx-account-edit-pending', scheduleSync);
  markOwnWritesSynced();
  handOverOnClose();
  followLibraryChangesInOtherTabs();
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => setState({ phase: 'pending', firstPass: !checkedThisPage, detail: 'Offline. This revision is not confirmed saved to cloud.' }));
  window.addEventListener('focus', () => { if (!running) void syncNow(); });
  // Tracked by ACCOUNT, not by signed-in-ness: a different account signing in over a live
  // session is a change of library even though "signed in" never went false in between.
  let lastUser: string | null | undefined;
  let expiry: ReturnType<typeof setTimeout> | undefined;
  subscribeAuth((auth) => {
    const user = auth.status === 'signed-in' ? (auth.user?.id ?? null) : null;
    clearTimeout(expiry);
    if (user && auth.expiresAt) expiry = setTimeout(() => {
      setAccountAuthoringEnabled(false);
      sessionEpoch++;
      setState({ phase: 'offline', detail: 'Account session expired. Sign in again. Pending work is preserved.' });
      window.dispatchEvent(new CustomEvent('spx-session-expired'));
    }, Math.max(0, auth.expiresAt - Date.now()));
    if (user === lastUser) {
      if (user && user === libraryInUse() && !canAuthorAccount() && (!auth.expiresAt || auth.expiresAt > Date.now())) {
        setAccountAuthoringEnabled(true);
        void syncNow();
      }
      return;
    }
    sessionEpoch++;
    if (user) checkedThisPage = false;
    setAccountAuthoringEnabled(false);
    const hadSession = !!lastUser;
    lastUser = user;
    if (user) {
      // The library on screen becomes this account's first (accountLibrary.ts); sync follows only
      // when it already is. A switch reloads the page, and the reloaded page syncs.
      void bindLibraryToAccount(user).then((binding) => {
        if (user !== lastUser) return;
        if (binding === 'ready') { setAccountAuthoringEnabled(true); void syncNow(); }
        else if (binding === 'failed') {
          setState({
            phase: 'error',
            detail: 'The account workspace could not be opened. Pending work is preserved; reload to try again.',
          });
        }
      });
      return;
    }
    setState({ phase: 'offline', firstPass: !!libraryInUse() && !checkedThisPage, detail: libraryInUse() ? 'Account session unavailable. Editing is paused; pending work is preserved. Sign in again.' : 'Local workspace. Work here is not saved to an account.' });
    // A session that DIES (refresh token expired or revoked) used to end here silently: the
    // chip fell to 'offline' and nothing said why, so sync just stopped. Surface it — unless
    // the user pressed Sign out themselves, which is the same transition and not a problem.
    // AccountSaveNotice supplies a persistent notice without opening a modal over transport.
    if (hadSession && !consumeDeliberateSignOut()) {
      window.dispatchEvent(new CustomEvent('spx-session-expired'));
    }
  });
}
