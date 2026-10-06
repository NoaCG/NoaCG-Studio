import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const notice = useRef<HTMLElement>(null);
  useEffect(() => onSyncState(setSync), []);
  useEffect(() => subscribeTeamState(() => setTeams(getTeamState())), []);
  const owner = libraryInUse();
  const pending = Object.keys(teams.saving).length > 0;
  const paused = owner && !canAuthorAccount();
  // Ordinary saving belongs in the header. Keep recovery visible only when action is needed.
  const failed = sync.phase === 'error' || Object.values(teams.saving).includes('failed') || !!teams.loadError;
  const visible = isBackendConfigured() && !!owner && (paused || failed);
  // Reserve the actual wrapped height, including the bottom margins. The notice stays outside
  // the authoring gate, so recovery remains reachable, without covering a wizard or consent key.
  useLayoutEffect(() => {
    const element = notice.current;
    if (!visible || !element) return;
    const reserve = () => document.documentElement.style.setProperty('--account-notice-height', `${Math.ceil(element.getBoundingClientRect().height) + 16}px`);
    reserve();
    const observer = new ResizeObserver(reserve);
    observer.observe(element);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--account-notice-height');
    };
  }, [visible]);
  if (!visible) return null;
  const label = paused ? 'Account editing paused. Sign in again. Pending work is preserved on this device.'
    : 'Not saved to cloud. Pending work stays on this device.';
  const recover = () => {
    if (!owner) return;
    const url = URL.createObjectURL(new Blob([exportPendingTeamWork(owner) ?? '{}'], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = 'noacg-pending-team-work.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <aside ref={notice} className="account-save-notice" role="status" data-testid="account-save-notice">
    <span>{label}</span>
    {owner && <button onClick={() => paused ? useAuthUi.getState().openSignIn('Sign in to resume account editing.', 'resume') : void Promise.all([syncNow(), refreshTeams()])}>{paused ? 'Sign in' : 'Retry cloud save'}</button>}
    {owner && (pending || teams.loadError) && <button onClick={recover}>Export pending team work</button>}
  </aside>;
}
