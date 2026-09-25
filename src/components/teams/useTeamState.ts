// The team surfaces' view of backend/teamProductions.ts: which teams this account is in, who is in
// them, and each team production's head and save state. One external store read through
// `useSyncExternalStore`, so Home, the production page and the dialogs all render the same answer
// from the same fetch rather than each asking the server for its own.
//
// Reading it is NOT the gate. Offline and signed out the controller never starts and this returns
// the empty state, but a surface still asks `useTeamsAvailable()` before drawing anything - the
// rule components/teams/AGENTS.md is built around.

import { useSyncExternalStore } from 'react';
import { getTeamState, subscribeTeamState, type TeamState } from '../../backend/teamProductions';

export function useTeamState(): TeamState {
  return useSyncExternalStore(subscribeTeamState, getTeamState, getTeamState);
}
