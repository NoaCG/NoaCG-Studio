// Signing in opens the account library. Anonymous work stays separate; export/import is
// the explicit transfer. Expiry preserves the account view and pauses editing.
import { LIBRARY_ACCOUNT_KEY, setLibraryAccount } from '../model/accountScope';
import { flushDurableStore, libraryInUse } from '../model/durableStore';

export type LibraryBinding = 'ready' | 'reloading' | 'failed';
async function reloadOntoLibrary(): Promise<'reloading'> {
  window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
  await flushDurableStore();
  window.location.reload();
  return 'reloading';
}
export async function bindLibraryToAccount(account: string): Promise<LibraryBinding> {
  if (libraryInUse() === account) return 'ready';
  try {
    setLibraryAccount(account);
    return await reloadOntoLibrary();
  } catch {
    return 'failed';
  }
}
export async function releaseLibrary(): Promise<void> {
  if (libraryInUse() === null) return;
  setLibraryAccount(null);
  await reloadOntoLibrary();
}
export function followLibraryChangesInOtherTabs(): void {
  window.addEventListener('storage', event => {
    if (event.key === LIBRARY_ACCOUNT_KEY) void reloadOntoLibrary();
  });
}
