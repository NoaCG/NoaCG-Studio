import { useEffect, useRef, useState } from 'react';
import { useTemplateStore } from '../../store/templateStore';
import {
  saveCurrentGraphic,
  saveGraphicAs,
  discardCurrentGraphic,
  useSaveUi,
} from '../../store/saveActions';
import { useModalGate } from '../spaceKey';
import { useAuthState } from '../auth/useAuthState';
import { getSyncState, onSyncState } from '../../backend/syncController';

/**
 * The two save-flow dialogs (docs/SAVED_CONTENT_MODEL.md §2), mounted ONCE in App.tsx - OUTSIDE
 * the wizard, so the guard paints over it. The wizard's full-screen shell is a stacking context,
 * so a guard rendered inside it could not rise above the app's corner notices whatever z-index it
 * carried; out here it wins on the layer scale (src/styles/base.css). Per-shell mounts left the
 * shells without one (the control page, the production dashboard, the video shell) with a guard
 * that could be requested but never rendered.
 *
 * - SAVE DIALOG (first save / Save As): name the graphic. Every save is standalone in the
 *   flat library (packages retired - docs/GOALS_ARCHIVE.md "Student release" step 3); grouping for
 *   air happens in a PRODUCTION's own pool.
 * - UNSAVED-CHANGES GUARD: shown before leaving the editor or replacing the working document
 *   (opening another graphic, creating a new project, the wizard's mid-walk start-over).
 *   Save first, discard, or cancel.
 */
const SAVE_FAILED = 'Could not save. Your changes are still open. Try again.';

export default function SaveDialogs() {
  const saveDialog = useSaveUi((s) => s.saveDialog);
  const confirmSwitch = useSaveUi((s) => s.confirmSwitch);
  useModalGate(!!saveDialog || !!confirmSwitch);
  return (
    <>
      {saveDialog && <SaveDialog />}
      {confirmSwitch && <ConfirmSwitchDialog />}
    </>
  );
}

function SaveDialog() {
  const dialog = useSaveUi((s) => s.saveDialog)!;
  const closeDialog = useSaveUi((s) => s.closeSaveDialog);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const close = () => { if (!busyRef.current) closeDialog(); };
  const template = useTemplateStore((s) => s.template);
  // WHERE THE GRAPHIC GOES, said at the one moment the question has a consequence. The topbar
  // states which account state the studio is in, and the owner's worry (2026-09-10: "we need to
  // have a clear indication when we are logged in and when we are not") is the student who never
  // reads it, works a session on a lab machine and finds nothing on the next one. A save is the
  // moment that student is looking, so the sentence below names the destination in each state:
  // the account, or this computer only. A fact and no button - the door stays where it always
  // is. Offline there is no other place work could go, so the sentence stays as it was; and
  // while the stored session is still being read, claiming either would be a guess.
  //
  // The signed-in clause is a claim about SYNC, not about the session, so it reads the sync
  // phase: a session whose sync is in error (a suspended account, a refused push) must not be
  // told its work follows it anywhere. In that state the sentence falls back to the plain one
  // and the topbar's "Sync error" chip is the thing that says why.
  const { backendConfigured, status } = useAuthState();
  const [sync, setSync] = useState(getSyncState());
  useEffect(() => onSyncState(setSync), []);
  const where = !backendConfigured || status === 'loading'
    ? ''
    : status === 'signed-out'
      ? ', on this computer only'
      : sync.phase === 'synced' || sync.phase === 'syncing'
        ? ' and follow you to any computer you sign in on'
        : '';

  const [name, setName] = useState(dialog.mode === 'save-as' ? `${template.name} copy` : template.name);
  const [error, setError] = useState<string | null>(null);
  // Backdrop click-to-close must only fire on a genuine outside click — not when a text
  // selection drag STARTED in the name field and released over the backdrop (which routes the
  // release's `click` to the backdrop, the nearest common ancestor, discarding the typed name).
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) closeDialog();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [closeDialog]);

  // The record a refused attempt already minted: only its link write failed, so the retry
  // writes into it rather than minting a second (#1367).
  const minted = useRef<string | null>(null);
  const attempt = async (chosen: string) => {
    const { saved, template: now } = useTemplateStore.getState();
    if (minted.current && saved.graphicId === minted.current) {
      // A new name is adopted by the draft too, as the first attempt adopted its own.
      if (now.name !== chosen) useTemplateStore.setState({ template: { ...now, name: chosen } });
      const r = await saveCurrentGraphic({ name: chosen });
      if (r !== 'needs-name') return { ok: r === 'saved', error: r === 'saved' ? null : SAVE_FAILED };
    }
    const res = await saveGraphicAs(chosen, { kind: 'standalone' });
    minted.current = res.graphicId ?? null;
    return res;
  };

  const confirm = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    void attempt(name.trim() || template.name).then((res) => {
      if (!res.ok) {
        setError(res.error);
        return;
      }
      closeDialog();
      // The continuation goes back through the guard, which asks again only if an edit
      // arrived while the save waited: the record holds the source it wrote, not that edit.
      if (dialog.then) useSaveUi.getState().requestSwitch(dialog.then);
    }).finally(() => { busyRef.current = false; setBusy(false); });
  };

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) close();
        pressedOnBackdrop.current = false;
      }}
    >
      <div className="wz-modal save-dialog" role="dialog" aria-modal="true" aria-label="Save graphic" data-testid="save-dialog">
        <div className="wz-header">
          <h2>{dialog.mode === 'save-as' ? 'Save a copy' : 'Save graphic'}</h2>
          <button className="gallery-close" onClick={close} title="Cancel" disabled={busy}>✕</button>
        </div>
        <div className="save-dialog-body">
          <label className="save-field">
            <span>Name</span>
            <input
              autoFocus
              disabled={busy}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirm(); }}
              placeholder="e.g. Presenter lower third"
              data-testid="save-name"
            />
          </label>
          <p className="hint" data-testid="save-where">
            Saved graphics live in your library on Home{where}. To run several together on air,
            add them to a <strong>production</strong>. Its page holds the rundown and the links.
          </p>
          {error && <p className="status-bad">{error}</p>}
          <div className="dlg-foot dlg-foot--inline">
            <button onClick={close} disabled={busy}>Cancel</button>
            <div className="spacer" />
            <button className="primary" onClick={confirm} disabled={busy} data-testid="save-confirm">{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfirmSwitchDialog() {
  const confirm = useSaveUi((s) => s.confirmSwitch)!;
  const cancelConfirm = useSaveUi((s) => s.closeConfirm);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const closeConfirm = () => { if (!busyRef.current) cancelConfirm(); };
  const settleConfirm = useSaveUi((s) => s.settleConfirm);
  const openSaveDialog = useSaveUi((s) => s.openSaveDialog);
  const graphicId = useTemplateStore((s) => s.saved.graphicId);
  const name = useTemplateStore((s) => s.template.name);
  // Same guard as the save dialog: a press that began inside the dialog and released on the
  // backdrop must not be read as an outside click (see SaveDialog).
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busyRef.current) cancelConfirm();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cancelConfirm]);

  const saveThen = () => {
    if (busyRef.current) return;
    const proceed = confirm.proceed;
    if (graphicId) {
      busyRef.current = true;
      setBusy(true);
      void saveCurrentGraphic().then((r) => {
        if (r === 'failed') { setError(SAVE_FAILED); return; }
        // Saved, but an edit accepted during the wait is not in that copy (#1359).
        if (r === 'saved' && useTemplateStore.getState().saved.dirty) {
          setError('The graphic changed while saving. Your newer changes are still open. Try again.');
          return;
        }
        settleConfirm();
        if (r === 'needs-name') openSaveDialog('first', proceed);
        else proceed();
      }).finally(() => { busyRef.current = false; setBusy(false); });
    } else {
      // Never saved: settle the guard and hand the continuation to the save dialog.
      settleConfirm();
      openSaveDialog('first', proceed);
    }
  };

  const discard = () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    const proceed = confirm.proceed;
    void discardCurrentGraphic().then(failure => {
      if (failure) { setError(failure); return; }
      settleConfirm();
      proceed();
    }).finally(() => { busyRef.current = false; setBusy(false); });
  };

  // A WIZARD WALK left mid-way is what is at risk (saveActions `heldWalk`): it has no library to
  // be saved into, so the safe answer is going back into it rather than saving. Either answer
  // then meets the working-document guard on its own, since both open the wizard.
  // The walk is dropped by the fresh open itself, so backing out of a second dialog keeps it held.
  const walk = confirm.resume;
  const thenGuard = (next: () => void) => () => {
    settleConfirm();
    useSaveUi.getState().requestSwitch(next, confirm.cancel);
  };
  const title = walk ? 'Graphic in progress' : 'Unsaved changes';

  return (
    <div
      className="gallery-backdrop"
      onMouseDown={(e) => { pressedOnBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) closeConfirm();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal save-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid="confirm-switch"
      >
        <div className="wz-header">
          <h2>{title}</h2>
          <button className="gallery-close" onClick={closeConfirm} title="Cancel" disabled={busy}>✕</button>
        </div>
        <div className="save-dialog-body">
          <p>
            {walk
              ? 'You left a graphic unfinished in the wizard.'
              : `“${name}” has unsaved changes. Save them before continuing?`}
          </p>
          {error && <p className="status-bad" role="alert">{error}</p>}
          <div className="dlg-foot dlg-foot--inline">
            <button onClick={closeConfirm} disabled={busy} data-testid="switch-cancel">Cancel</button>
            <div className="spacer" />
            {walk ? (
              <>
                <button onClick={thenGuard(confirm.proceed)} data-testid="switch-discard">Discard and start new</button>
                <button className="primary" onClick={thenGuard(walk)} data-testid="switch-resume">Continue</button>
              </>
            ) : (
              <>
                <button onClick={discard} disabled={busy} data-testid="switch-discard">Discard changes</button>
                <button className="primary" onClick={saveThen} disabled={busy} data-testid="switch-save">
                  {busy ? 'Please wait…' : graphicId ? 'Save & continue' : 'Save first…'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
