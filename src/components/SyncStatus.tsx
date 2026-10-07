import { useCallback, useEffect, useRef, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { getSyncState, onSyncState, startAutoSync, syncNow, type SyncState } from '../backend/syncController';
import { libraryInUse } from '../model/durableStore';
import { useAuthUi } from './auth/authUi';
import LibMenu from './home/LibMenu';

/** What the dot says: green is confirmed in the cloud, yellow is waiting or wrong, grey is a
 *  device-only workspace with no account to sync to. */
type Tone = 'ok' | 'warn' | 'local';

/** One reading of the sync state: the dot, the one-line answer, its detail, and the one action
 *  that helps. Every surface that mounts the control reads the same words. */
function describe(state: SyncState): { tone: Tone; summary: string; detail: string; action: 'sync' | 'sign-in' | 'resume' } {
  const owner = !!libraryInUse();
  if (owner && state.firstPass && (state.phase === 'syncing' || state.phase === 'pending')) {
    return { tone: 'warn', summary: 'Checking cloud revision', detail: state.detail ?? 'Cached work is not yet confirmed in the cloud.', action: 'sync' };
  }
  switch (state.phase) {
    case 'synced': {
      const at = state.verifiedAt ? ` at ${new Date(state.verifiedAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}` : '';
      const conflicts = state.last?.conflicts ? ` ${state.last.conflicts} conflicting edits were kept as copies.` : '';
      return { tone: 'ok', summary: 'Saved to cloud', detail: `Confirmed${at}. Team productions show their own save state.${conflicts}`, action: 'sync' };
    }
    case 'syncing':
      return { tone: 'warn', summary: 'Saving to cloud', detail: state.detail ?? 'Changes on this device are being saved.', action: 'sync' };
    case 'pending':
      // The controller's own pending words restate the summary; the one extra fact worth saying is offline.
      return { tone: 'warn', summary: 'Not saved to cloud yet', detail: typeof navigator !== 'undefined' && !navigator.onLine ? 'Offline. Changes stay on this device until you reconnect.' : 'Changes on this device are waiting to be saved.', action: 'sync' };
    case 'error':
      return { tone: 'warn', summary: 'Not saved to cloud', detail: state.detail ?? 'Cloud save failed. Pending changes stay on this device.', action: 'sync' };
    case 'offline':
      return owner
        ? { tone: 'warn', summary: 'Not saved to cloud', detail: 'Sign in to resume. Pending work stays on this device.', action: 'resume' }
        : { tone: 'local', summary: 'Saved on this device only', detail: 'Sign in to keep your work in the cloud and on your other devices.', action: 'sign-in' };
  }
}

/**
 * The cloud-sync control in every top bar (Home, the editor, the video shell, a personal
 * production's header). Renders nothing in an offline build. When a backend is configured it
 * starts auto-sync and shows a fixed-width "Sync" with a dot (green saved, yellow waiting or a
 * problem, grey device-only); the button's accessible name carries the full state, and a press
 * opens the details with the one action that helps (Sync now, or Sign in). A save failure also
 * raises AccountSaveNotice, so the yellow dot is never the only place a failure shows.
 *
 * `compact` is accepted for the production header's call site and no longer changes anything:
 * the control is compact everywhere.
 */
export default function SyncStatus(_props: { compact?: boolean } = {}) {
  const [state, setState] = useState<SyncState>(getSyncState());
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!isBackendConfigured()) return;
    startAutoSync();
    return onSyncState(setState);
  }, []);

  // Unconfigured builds stay offline. Configured anonymous work is explicitly local.
  if (!isBackendConfigured()) return null;

  const { tone, summary, detail, action } = describe(state);
  const act = () => {
    setOpen(false);
    if (action === 'resume') useAuthUi.getState().openSignIn('Sign in to resume account editing. Pending work is preserved.', 'resume');
    else if (action === 'sign-in') useAuthUi.getState().openSignIn();
    else {
      // The panel holding the focused button is about to unmount: hand focus back to the trigger.
      host.current?.querySelector<HTMLButtonElement>('.sync-status')?.focus();
      void syncNow();
    }
  };

  return (
    <div ref={host} className="lib-menu-host">
      <button
        className={`sync-status sync-${state.phase}`}
        data-tone={tone}
        aria-label={`Sync: ${summary}`}
        aria-expanded={open}
        title={summary}
        onClick={() => setOpen((o) => !o)}
        data-testid="sync-status"
      >
        <span className="sync-dot" data-tone={tone} aria-hidden="true" />
        Sync
      </button>
      <LibMenu open={open} onClose={close} className="sync-panel" role="group" testid="sync-panel">
        <strong className="sync-panel-summary">
          <span className="sync-dot" data-tone={tone} aria-hidden="true" />
          {summary}
        </strong>
        <p className="hint" data-testid="sync-detail">{detail}</p>
        <button className="sync-panel-action" onClick={act} disabled={state.phase === 'syncing'} data-testid="sync-action">
          {action === 'sync' ? 'Sync now' : 'Sign in'}
        </button>
      </LibMenu>
    </div>
  );
}
