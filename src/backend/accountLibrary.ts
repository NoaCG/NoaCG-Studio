// BINDING THE BROWSER'S LIBRARY TO THE SIGNED-IN ACCOUNT.
//
// Every account keeps its own local library on this browser (model/accountScope.ts names the
// keys, model/durableStore.ts stores them). This module decides WHICH library the page shows,
// and it is the only thing that changes it. Sync runs only once the library in use is the
// signed-in account's own (syncController `canSync`), so one account's documents can never be
// pushed into another's cloud.
//
// What happens when somebody signs in, by what the page is showing at that moment:
//
//   that account's library      - nothing; sync carries on.
//   the signed-out workspace,   - ADOPT: the work made before signing in becomes the account's,
//   account new to this browser   renamed in place with no reload. This is the sign-up path
//                                 (make something first, create an account after) and how a
//                                 library saved by an earlier build finds its owner.
//   the signed-out workspace,   - MERGE THROUGH THE CLOUD: the signed-out graphics, productions,
//   account already here          looks and videos are uploaded to the account, then the page
//                                 reloads onto the account's library and its first sync pulls
//                                 them in. The signed-out working slot stays behind, so an
//                                 unsaved draft is never overwritten either way.
//   ANOTHER account's library   - SWITCH: that library stays on this device under its owner's
//                                 name, and the page reloads onto the signed-in account's.
//
// Signing OUT (the user's own act) returns the page to the signed-out workspace, so the next
// person at the computer does not see the account's work. A session that merely EXPIRES keeps
// the library on screen - the work in progress is the reason not to snatch it away - and the
// switch above still protects it if somebody else then signs in.

import { LIBRARY_ACCOUNT_KEY, moveSignedOutLocalKeys, setLibraryAccount } from '../model/accountScope';
import { adoptSignedOutLibrary, flushDurableStore, libraryHasDocuments, libraryInUse } from '../model/durableStore';
import { purgeOldGraphicTombstones } from '../model/library';
import { purgeOldShowTombstones } from '../model/shows';
import { purgeOldTombstones } from '../model/packets';
import { purgeOldVideoTombstones } from '../model/videoProject';
import { LocalStorageProvider, type StoredRecord, type SyncKind } from './storage';
import { SupabaseProvider } from './supabaseProvider';

export type LibraryBinding = 'ready' | 'reloading' | 'failed';

/** The kinds a merge carries. The working slots and the retired brand are singletons: the
 *  account's own win, and the signed-out ones stay in the signed-out workspace. */
const MERGED_KINDS: SyncKind[] = ['graphic', 'show', 'look', 'video'];

/** Past every real timestamp, so a purge with it drops every tombstone. */
const END_OF_TIME = '9999-12-31T23:59:59.999Z';

/** Reload onto the library `setLibraryAccount` now names, once every queued write has landed. */
async function reloadOntoLibrary(): Promise<'reloading'> {
  await flushDurableStore();
  window.location.reload();
  return 'reloading';
}

/**
 * Make the page show `account`'s library, doing whichever of the moves in the header applies.
 * 'ready' means the library in use is the account's and sync may run; 'reloading' means the
 * page is about to reload onto it; 'failed' means the signed-out work could not be handed over
 * and nothing was synced.
 */
export async function bindLibraryToAccount(account: string): Promise<LibraryBinding> {
  const current = libraryInUse();
  if (current === account) return 'ready';

  if (current !== null) {
    setLibraryAccount(account);
    return reloadOntoLibrary();
  }

  if (!(await libraryHasDocuments(account))) {
    if (!(await adoptSignedOutLibrary(account))) return 'failed';
    moveSignedOutLocalKeys(account);
    setLibraryAccount(account);
    return 'ready';
  }

  await uploadSignedOutWork();
  setLibraryAccount(account);
  return reloadOntoLibrary();
}

/**
 * The merge's first half: push the signed-out library records to the signed-in account's cloud
 * and take each one that arrived out of the signed-out workspace. A record the cloud already
 * holds a same-or-newer copy of is simply taken out; one the cloud refuses, or that fails to
 * send, STAYS in the signed-out workspace - nothing is ever deleted on the strength of a
 * failed upload.
 */
async function uploadSignedOutWork(): Promise<void> {
  const local = new LocalStorageProvider();
  const remote = new SupabaseProvider();
  for (const kind of MERGED_KINDS) {
    let cloud: StoredRecord[];
    try {
      cloud = await remote.list(kind);
    } catch {
      continue; // Unreachable right now: this kind waits in the signed-out workspace.
    }
    const cloudUpdatedAt = new Map(cloud.map((r) => [r.id, r.updatedAt]));
    for (const record of await local.list(kind)) {
      if (record.deleted) continue;
      const theirs = cloudUpdatedAt.get(record.id);
      try {
        if (theirs === undefined || record.updatedAt > theirs) await remote.put(record);
      } catch {
        continue; // Refused (another account's id) or not sent: it stays where it is.
      }
      await local.remove(kind, record.id);
    }
  }
  // `remove` leaves tombstones, which the signed-out workspace (it never syncs) has no use for.
  purgeOldGraphicTombstones(END_OF_TIME);
  purgeOldShowTombstones(END_OF_TIME);
  purgeOldTombstones(END_OF_TIME);
  purgeOldVideoTombstones(END_OF_TIME);
}

/**
 * The user signed out: return the page to the signed-out workspace. The account's library
 * stays on this device under its own name, with its sync bookmark, and is back the moment the
 * account signs in again.
 */
export async function releaseLibrary(): Promise<void> {
  if (libraryInUse() === null) return;
  setLibraryAccount(null);
  await reloadOntoLibrary();
}

/** Another tab changed which library is in use: this one reloads onto it rather than keep
 *  writing the previous library's documents from its stale mirror. */
export function followLibraryChangesInOtherTabs(): void {
  window.addEventListener('storage', (event) => {
    if (event.key === LIBRARY_ACCOUNT_KEY) window.location.reload();
  });
}
