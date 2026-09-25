// The teams UI store - which team dialog is open, if any.
//
// A MODULE STORE rather than props, for the same reason the save dialogs use one: the dialog is
// reached from places that are siblings, not ancestors (Home's production card menu, the
// production page's header, Home's Teams section and the team bands on the productions list), and
// the dialog itself mounts ONCE at App level. Two mount points would put two dialogs on screen.
//
// This store holds no team data. Teams live on the server and are fetched by the dialog when it
// opens, because a team's member list and join code can change from another member's browser -
// caching them here would show a stale code to the one person about to read it out loud.

import { create } from 'zustand';

/**
 * What the dialog was opened ABOUT. From a production (`showId`), it is the share door: pick a team
 * and move the production in, or - for a production already in a team - that team's details. From
 * a team (`teamId` alone), it opens straight on that team's join code and members; there is no
 * production in play, so nothing offers to move one.
 */
interface ShareRequest {
  showId?: string;
  showName?: string;
  teamId?: string;
}

interface TeamsUiState {
  share: ShareRequest | null;
  openShare: (showId: string, showName: string) => void;
  openTeam: (teamId: string) => void;
  closeShare: () => void;
}

export const useTeamsUi = create<TeamsUiState>((set) => ({
  share: null,
  openShare: (showId, showName) => set({ share: { showId, showName } }),
  openTeam: (teamId) => set({ share: { teamId } }),
  closeShare: () => set({ share: null }),
}));
