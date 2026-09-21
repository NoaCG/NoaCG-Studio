import { useRouter } from '../../app/router';

/**
 * Open the NEW editor (#/editor-foundation) on the working document.
 *
 * The new editor only mounts when the page URL carries `?editor=foundation` (App.tsx renders
 * Home for the bare route), so the query is written first, in place, without a history entry.
 * This is the default studio's editor door: since the owner's 2026-09-21 ruling no control
 * outside Advanced mode opens the old code editor (AppShell).
 */
export function openNewEditor(): void {
  const url = new URL(window.location.href);
  url.searchParams.set('editor', 'foundation');
  window.history.replaceState(window.history.state, '', url);
  useRouter.getState().navigate({ view: 'editor-foundation' });
}
