import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { getSyncState, onSyncState, startAutoSync, syncNow, type SyncState } from '../backend/syncController';
import { libraryInUse } from '../model/durableStore';
import { useAuthUi } from './auth/authUi';

/**
 * Topbar cloud-sync indicator (Era 5.2). Renders nothing in offline mode. When a backend is
 * configured it kicks off auto-sync and shows the live status; click to force a sync now.
 */
export default function SyncStatus() {
  const [state, setState] = useState<SyncState>(getSyncState());

  useEffect(() => {
    if (!isBackendConfigured()) return;
    startAutoSync();
    return onSyncState(setState);
  }, []);

  // Unconfigured builds stay offline. Configured anonymous work is explicitly local.
  if (!isBackendConfigured()) return null;

  const label =
    state.phase === 'syncing'
      ? state.firstPass ? 'Checking cloud revision…' : 'Not saved to cloud · saving…'
      : state.phase === 'synced'
        ? 'Personal library saved to cloud'
        : libraryInUse() ? 'Not saved to cloud' : 'Local workspace';
  const title =
    state.phase === 'error'
      ? state.detail ?? 'Cloud save failed. Pending changes remain on this device.'
      : state.phase === 'synced' && state.last
        ? `Personal library confirmed at ${state.verifiedAt ?? ''}. Team productions have their own save status.${state.last.conflicts ? ` ${state.last.conflicts} conflicts preserved as copies.` : ''}`
        : state.detail ?? 'The current revision has not been confirmed in the cloud. Click to retry.';

  return (
    <button
      className={`sync-status sync-${state.phase}`}
      title={title}
      onClick={() => state.phase === 'offline' && libraryInUse() ? useAuthUi.getState().openSignIn('Sign in to resume account editing. Pending work is preserved.', 'resume') : void syncNow()}
      disabled={state.phase === 'syncing'}
    >
      <span className="sync-dot" />
      {label}
    </button>
  );
}
