// Starts and stops the team-productions controller (backend/teamProductions.ts) with the session.
//
// Mounted ONCE in App.tsx, beside the team dialogs, because the list has to be fetched whatever
// surface the session starts on: somebody who opens a teammate's production link cold lands on the
// production page, never on Home, and that page needs the team's record to exist. It renders
// nothing. Offline and signed out `useTeamsAvailable()` is false, so no fetch is ever made and no
// Supabase chunk is loaded on its account.

import { useEffect } from 'react';
import { startTeamSync, stopTeamSync } from '../../backend/teamProductions';
import { useAuthState } from '../auth/useAuthState';
import { useTeamsAvailable } from './useTeamsAvailable';

export default function TeamSync() {
  const available = useTeamsAvailable();
  const { user } = useAuthState();
  const userId = available ? user?.id ?? null : null;
  useEffect(() => {
    if (!userId) {
      stopTeamSync();
      return;
    }
    startTeamSync(userId);
  }, [userId]);
  // Unmounting is the app going away; stop so a hot reload in development does not leave a second
  // poll running beside the new one.
  useEffect(() => () => stopTeamSync(), []);
  return null;
}
