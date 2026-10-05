import { useEffect, useState } from 'react';
import { isBackendConfigured } from '../backend/config';
import { getSyncState, onSyncState, syncNow } from '../backend/syncController';
import { getTeamState, subscribeTeamState, refreshTeams } from '../backend/teamProductions';
import { canAuthorAccount, libraryInUse } from '../model/durableStore';
import { exportPendingTeamWork } from '../model/teamOutbox';
import { useAuthUi } from './auth/authUi';

/** Cloud saving is separate from the readiness of a running output. */
export default function AccountSaveNotice() {
  const [sync, setSync] = useState(getSyncState);
  const [teams, setTeams] = useState(getTeamState);
  useEffect(() => onSyncState(setSync), []);
  useEffect(() => subscribeTeamState(() => setTeams(getTeamState())), []);
  if (!isBackendConfigured()) return null;
  const owner = libraryInUse();
  const pending = Object.keys(teams.saving).length > 0;
  if (owner && sync.phase === 'synced' && !pending && !teams.loadError) return null;
  const paused = owner && !canAuthorAccount();
  const label = !owner ? 'Local workspace. This work is not saved to an account.'
    : paused ? 'Account editing paused. Sign in again. Pending work is preserved on this device.'
    : sync.firstPass ? 'Checking cloud revision. Cached work is not yet confirmed.'
    : 'Not saved to cloud. Keep this device’s work until saving is confirmed.';
  const recover = () => {
    if (!owner) return;
    const url = URL.createObjectURL(new Blob([exportPendingTeamWork(owner) ?? '{}'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'noacg-pending-team-work.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <aside className="account-save-notice" role="status" data-testid="account-save-notice">
    <span>{label}</span>
    {owner && <button onClick={() => paused ? useAuthUi.getState().openSignIn('Sign in to resume account editing.', 'resume') : void Promise.all([syncNow(), refreshTeams()])}>{paused ? 'Sign in' : 'Retry cloud save'}</button>}
    {owner && (pending || teams.loadError) && <button onClick={recover}>Export pending team work</button>}
  </aside>;
}
