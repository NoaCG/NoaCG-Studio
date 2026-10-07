import { useCallback, useEffect, useRef, useState } from 'react';
import { canAuthorAccount } from '../../model/durableStore';

/**
 * ONE EDIT, ONE WRITE — where the text a person is typing lives until the edit is over.
 *
 * A text box CONTROLLED by something persisted and shared - a production's live data tree, a show
 * record - costs a write per `input` event, which is a write per CHARACTER. On a published
 * production that is one HTTP PATCH per character against an ingest budget of 25 per 5 s, so
 * retyping an eleven-character team name spent half the budget and then started being refused -
 * and the refusal handler pulls the server's older tree back in, which lands in the box still
 * being typed into. A path box is worse in kind: it persists every PREFIX of the path.
 *
 * So a keystroke stops here. An edit is committed when it is OVER, and it is over on blur, on
 * Enter, after {@link EDIT_SETTLE_MS} of quiet, or when the component goes away - the last two are
 * what an operator who types the new score and turns back to the desk relies on.
 *
 * THE RULE FOR A BOX BEING TYPED INTO (the revert hazard): while a box holds an uncommitted edit,
 * nothing the store says changes what that box shows. A feed tick, a second operator and a page's
 * own recovery after a refused write all move the store, and all of them land mid-word otherwise.
 * The edit wins its own key when it commits, and everything else keeps whatever arrived meanwhile,
 * because the commit writes ONE key rather than the whole store it was typed against. Mark a box
 * in this state with `data-dirty` so the state is on screen and assertable, not a claim about
 * internals.
 *
 * ONE edit at a time, deliberately: only one box can hold the caret, so a second key means the
 * first edit is finished. Taking a new box over lands the old one rather than dropping it.
 *
 * WHAT THIS DOES NOT PROMISE: when the commit is a network call, one started as the tab is being
 * torn down is a fetch the browser is free to cancel. The settle timer is what makes that rare;
 * the unload doors below are the last net, not a guarantee.
 *
 * WHERE ELSE THIS BELONGS. Two surfaces in this directory still write once per keystroke and are
 * the same failure: the dataset cells on the Data workspace (`ProductionDataWorkspace`, which goes
 * through `patchShow` - a whole load-mutate-save of the shows store per character) and the
 * broadcast rows on the Audience workspace (a backend round trip per character). The cue draft in
 * `ProductionPage` is a fourth copy of this idea at 300 ms, without the unload doors or the
 * stale-closure guard. Rewiring any of them changes what reaches air, so each is its own change -
 * but they call this, they do not copy it.
 */
export const EDIT_SETTLE_MS = 500;

type PendingEdit = { key: string; text: string };

export type DeferredEdits = {
  /** What a box shows: its uncommitted edit if it has one, otherwise the stored text. */
  text: (key: string, stored: string) => string;
  /** Whether a box holds an edit nothing has been told about yet. */
  dirty: (key: string) => boolean;
  /** A keystroke. Schedules the commit rather than making it. */
  type: (key: string, text: string) => void;
  /** Land whatever is in the box now - blur, Enter, or anywhere the edit is plainly over. */
  flush: () => void;
};

/** Closing commits must capture text synchronously before account pause or teardown. */
export function useDeferredEdits(commit: (key: string, text: string, closing: boolean) => void): DeferredEdits {
  const [edit, setEdit] = useState<PendingEdit | null>(null);
  // The ref, not the state, is what the timer and the unload listeners read: they are registered
  // once and would otherwise hold the first render's `edit` for ever. `type` and `flush` are the
  // only two things that change an edit, and each writes the ref itself - there is deliberately
  // no render-phase mirror, which would suggest the ref follows the state on its own.
  const editRef = useRef<PendingEdit | null>(null);
  // The commit runs LATER than the keystroke that scheduled it, so it must never be the closure
  // that keystroke captured: that one holds the store as it was before whatever arrived in
  // between, and writing it back is the very revert this exists to stop. A ref repointed on every
  // render is how the commit stays the current one.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopTimer = () => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const flush = useCallback((closing = false) => {
    stopTimer();
    const pending = editRef.current;
    if (!pending) return;
    if (!canAuthorAccount()) return;
    // Cleared BEFORE the commit, so the box goes back to reading the store in the same render the
    // commit's write lands in and never blinks through the old value.
    editRef.current = null;
    setEdit(null);
    commitRef.current(pending.key, pending.text, closing);
  }, []);
  const flushCurrent = useCallback(() => flush(), [flush]);

  const type = useCallback(
    (key: string, text: string) => {
      if (!canAuthorAccount()) return;
      window.dispatchEvent(new CustomEvent('spx-account-edit-pending'));
      // A different box: land the edit that one holds before this one takes over. Clicking away
      // blurs first in practice; this is what makes it not matter if something ever does not.
      if (editRef.current && editRef.current.key !== key) flush();
      const next = { key, text };
      editRef.current = next;
      setEdit(next);
      stopTimer();
      timer.current = setTimeout(() => flush(), EDIT_SETTLE_MS);
    },
    [flush],
  );

  useEffect(() => {
    // LEAVING WITH A BOX STILL DIRTY commits it, through three doors that answer different
    // departures: the component being replaced (the cleanup), the document being hidden -
    // switching browser tab, or the OS taking the window - and the document being torn down.
    // `visibilitychange` is there because it fires while the page is still alive and able to
    // finish work, which `pagehide` cannot promise.
    const onHidden = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    const closing = () => flush(true);
    const requested = () => flush();
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', closing);
    window.addEventListener('noacg-account-authoring-pausing', closing);
    window.addEventListener('noacg-account-authoring-flush', requested);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', closing);
      window.removeEventListener('noacg-account-authoring-pausing', closing);
      window.removeEventListener('noacg-account-authoring-flush', requested);
      closing();
    };
  }, [flush]);

  return {
    text: (key, stored) => (edit && edit.key === key ? edit.text : stored),
    dirty: (key) => !!edit && edit.key === key,
    type,
    flush: flushCurrent,
  };
}
