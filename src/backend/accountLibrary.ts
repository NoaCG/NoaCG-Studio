// Signing in opens the account library. Anonymous work stays separate; export/import is
// the explicit transfer. Expiry preserves the account view and pauses editing.
import { LIBRARY_ACCOUNT_KEY, setLibraryAccount } from '../model/accountScope';
import { flushDurableStore, libraryInUse, revokeCueRecoveryForSwitch } from '../model/durableStore';

export type LibraryBinding = 'ready' | 'reloading' | 'failed';
// The switch starts before the library account changes: a cue recovery still waiting on storage
// must not land in the library being left (#2573). The general flush below saves everything else.
async function reloadOntoLibrary(change?: () => void): Promise<'reloading'> {
  const resume = revokeCueRecoveryForSwitch();
  try {
    change?.();
    window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
    await flushDurableStore();
    window.location.reload();
    return 'reloading';
  } catch (error) {
    resume();
    throw error;
  }
}
export async function bindLibraryToAccount(account: string): Promise<LibraryBinding> {
  if (libraryInUse() === account) return 'ready';
  try {
    return await reloadOntoLibrary(() => setLibraryAccount(account));
  } catch {
    return 'failed';
  }
}
export async function releaseLibrary(): Promise<void> {
  if (libraryInUse() === null) return;
  await reloadOntoLibrary(() => setLibraryAccount(null));
}
export function followLibraryChangesInOtherTabs(): void {
  window.addEventListener('storage', event => {
    if (event.key === LIBRARY_ACCOUNT_KEY) void reloadOntoLibrary();
  });
}
