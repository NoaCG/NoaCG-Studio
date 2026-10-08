import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * The wizard's own confirmation dialog — one shape for every moment the wizard stops and
 * states what is about to happen.
 *
 * It exists because of an inconsistency the owner walked into (2026-09-02): pressing "Export it"
 * opens a window and asks something, while "Add to the production" left the wizard for a rundown
 * chosen in a dropdown he had not checked. Two doors sitting side by side, one ceremonious and one silent, teach the reader
 * that neither is final — so the quiet one is pressed by mistake. This is the ceremony the
 * loud door already had, in the SHARED DIALOG ANATOMY (src/styles/wizard-and-dialogs.css)
 * every other dialog in the product wears: header row with a hard-right ✕, a body, then one
 * footer row with the secondary left and the primary right.
 *
 * The wizard is full-screen, so this renders its own backdrop ABOVE it (`.wz-over`).
 */

/**
 * How many wizard confirmations are on screen. The wizard binds Escape to "rewind a step",
 * and a dialog over it must eat that key rather than share it — both listeners sit on
 * `window`, so stopPropagation cannot separate them. The wizard's own handler was registered
 * first (it opened first), so it runs first, reads this, and stands down.
 */
let openConfirms = 0;
export const wizardConfirmOpen = (): boolean => openConfirms > 0;

interface Props {
  /** The question, short enough to stay on one line — the header does not wrap. */
  title: string;
  /** What is about to happen, and to what. The destination goes HERE, never in the title. */
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  cancelLabel: string;
  /** Backdrop click, ✕ and Escape all mean this — the three ways out agree. */
  onCancel: () => void;
  /** `<testid>`, `<testid>-go` and `<testid>-cancel` are the three handles specs use. */
  testid: string;
  /** The primary stays visible but cannot be pressed (a sheet whose checks have not passed). */
  confirmDisabled?: boolean;
}

export default function WizardConfirm({
  title,
  children,
  confirmLabel,
  onConfirm,
  cancelLabel,
  onCancel,
  testid,
  confirmDisabled = false,
}: Props) {
  const pressedOnBackdrop = useRef(false);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    openConfirms += 1;
    return () => {
      openConfirms -= 1;
    };
  }, []);

  // The primary takes focus, so Enter answers the question the dialog asked and Tab starts
  // inside it rather than on whatever the wizard had focused underneath. A primary that opens
  // disabled (a sheet still to be filled in) cannot hold focus, so the body's first control does.
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!confirmDisabled) confirmRef.current?.focus();
    else bodyRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    // On open only: re-focusing whenever the primary enables would pull focus out of a field.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  // PORTALLED TO THE BODY, so the two moments that raise this dialog look identical. One is
  // rendered from inside `.wz-wizard`, which steps its own type up a notch for the student
  // reading it full-screen (18px header → 20px, 13px buttons → 15px); the other is rendered
  // beside it. Left in place, the same dialog would have arrived in two sizes depending on
  // which step asked the question — the exact drift the shared anatomy exists to stop.
  return createPortal(
    // A click only closes when the press STARTED on the backdrop: a text selection dragged out
    // of the body and released here arrives as a click on the common ancestor otherwise. Same
    // guard the wizard and the export window carry.
    <div
      className="gallery-backdrop wz-over"
      onMouseDown={(e) => {
        pressedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && pressedOnBackdrop.current) onCancel();
        pressedOnBackdrop.current = false;
      }}
    >
      <div
        className="wz-modal wz-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-testid={testid}
      >
        <div className="wz-header">
          <h2>{title}</h2>
          <button className="gallery-close" onClick={onCancel} title="Close">
            ✕
          </button>
        </div>
        <div className="wz-confirm-body" ref={bodyRef}>{children}</div>
        <div className="dlg-foot">
          <button onClick={onCancel} data-testid={`${testid}-cancel`}>
            {cancelLabel}
          </button>
          <div className="spacer" />
          <button className="primary" onClick={onConfirm} data-testid={`${testid}-go`} ref={confirmRef} disabled={confirmDisabled}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
