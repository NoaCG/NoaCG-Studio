import { useRouter } from '../../app/router';

/**
 * Open the NEW editor (#/editor-foundation) on the working document.
 *
 * The new editor only mounts when the page URL carries `?editor=foundation` (App.tsx renders
 * Home for the bare route), so the query is written first, in place, without a history entry.
 * This is the studio's one editor door: no control opens the old code editor (AppShell) any
 * more (owner, 2026-09-21 and 2026-09-24).
 *
 * `replace` swaps the current history entry instead of pushing one. The wizard's "Edit this
 * graphic" uses it, so Back from the editor does not land on the wizard route it just left.
 */
export function openNewEditor({ replace = false }: { replace?: boolean } = {}): void {
  const url = new URL(window.location.href);
  url.searchParams.set('editor', 'foundation');
  window.history.replaceState(window.history.state, '', url);
  const router = useRouter.getState();
  if (replace) router.replace({ view: 'editor-foundation' });
  else router.navigate({ view: 'editor-foundation' });
}
