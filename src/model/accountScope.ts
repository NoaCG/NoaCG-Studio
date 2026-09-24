// WHOSE LIBRARY THIS BROWSER IS SHOWING.
//
// The saved documents on a device - graphics, productions, looks, videos, the working slots -
// used to be ONE library per browser, whoever was signed in. Sign out of one account, sign in
// to another, and the second account was shown the first one's work; worse, its first sync
// pass pushed that work into the second account's cloud. Graphics are account-bound, so the
// library is now bound too: every account that signs in on this browser gets its OWN set of
// storage keys, and the one in use is named by `spx-gfx-account`.
//
//   absent         - the signed-out workspace. Its keys are the plain names (`spx-gfx-graphics`),
//                    which is where every document written before this existed already lives,
//                    and the only workspace an offline build ever has.
//   <user id>      - that account's library: the same names with `@<user id>` appended.
//
// This module only NAMES the keys; it moves nothing. `model/durableStore.ts` applies it to the
// heavy documents and `backend/accountLibrary.ts` decides when the account changes. It imports
// nothing, so the durable store can depend on it without a cycle.

/** localStorage key naming the account whose library is in use (absent = signed-out workspace). */
export const LIBRARY_ACCOUNT_KEY = 'spx-gfx-account';

/**
 * The SMALL per-account records that stay in localStorage (the durable store owns the heavy
 * ones), moved to an account when it adopts the signed-out workspace. Device preferences -
 * layout, the editor switches, the CasparCG connection - are deliberately absent: they belong
 * to the machine, not the account. Everything here is something another person at the same
 * computer must not see or use:
 *
 *   spx-gfx-sync                  the sync bookmark and its pending debts
 *   spx-gfx-brand                 the retired anonymous brand, which still syncs as a singleton
 *   spx-gfx-default-brand         the default-brand pointer, naming a look in this library
 *   spx-gfx-remote-cap            the secret that pairs a graphic with its remote control panel
 *   spx-gfx-ai-spec-draft         the Create-with-AI setup draft (the user's own words)
 *   spx-gfx-ai                    which AI providers this account has keys for
 *   spx-gfx-ai-notice             the AI notice this person accepted
 *   spx-gfx-ai-preferences        which AI directions this person has picked
 *   spx-gfx-ai-telemetry          this person's AI runs and their cost
 *   spx-gfx-ai-reference-recency  the references this person's recent generations used
 *
 * The render job's resume record (`noacg-render-job`) is per account too, in sessionStorage.
 */
export const ACCOUNT_LOCAL_KEYS = [
  'spx-gfx-sync',
  'spx-gfx-brand',
  'spx-gfx-default-brand',
  'spx-gfx-remote-cap',
  'spx-gfx-ai-spec-draft',
  'spx-gfx-ai',
  'spx-gfx-ai-notice',
  'spx-gfx-ai-preferences',
  'spx-gfx-ai-telemetry',
  'spx-gfx-ai-reference-recency',
] as const;

/**
 * Read ONCE per page and then only changed by `setLibraryAccount`. Another tab changing the
 * stored value must not re-point this page's keys while its documents are still the old
 * library's - that tab's change reloads this one instead (backend/accountLibrary.ts).
 */
let current: string | null = readStoredAccount();

function readStoredAccount(): string | null {
  try {
    const value = localStorage.getItem(LIBRARY_ACCOUNT_KEY);
    return value ? value : null;
  } catch {
    return null;
  }
}

/** The account whose library this page uses, or null for the signed-out workspace. */
export function libraryAccount(): string | null {
  return current;
}

/** Record which account's library is in use. Null returns to the signed-out workspace. */
export function setLibraryAccount(account: string | null): void {
  current = account;
  try {
    if (account) localStorage.setItem(LIBRARY_ACCOUNT_KEY, account);
    else localStorage.removeItem(LIBRARY_ACCOUNT_KEY);
  } catch {
    // A browser that refuses localStorage entirely has no library to scope either.
  }
}

/** The storage key `key` has in `account`'s library (the plain key for the signed-out one). */
export function accountKey(key: string, account: string | null = libraryAccount()): string {
  return account ? `${key}@${account}` : key;
}

/** The plain name of a possibly account-scoped key: `spx-gfx-shows@abc` → `spx-gfx-shows`. */
export function unscopedKey(key: string): string {
  const at = key.indexOf('@');
  return at < 0 ? key : key.slice(0, at);
}

/**
 * Hand the signed-out workspace's small records to `account` - the localStorage half of an
 * adoption (the durable store moves the heavy half). A record the account already has is left
 * alone: it is the account's own, and the signed-out copy never overwrites it.
 */
export function moveSignedOutLocalKeys(account: string): void {
  for (const key of ACCOUNT_LOCAL_KEYS) {
    try {
      const value = localStorage.getItem(key);
      if (value === null) continue;
      const target = accountKey(key, account);
      if (localStorage.getItem(target) === null) localStorage.setItem(target, value);
      localStorage.removeItem(key);
    } catch {
      // Kilobytes at most; a refusal leaves the record in the signed-out workspace, unshared.
    }
  }
}
