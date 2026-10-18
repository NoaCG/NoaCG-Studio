import { useEffect } from 'react';
import { useTemplateStore } from '../store/templateStore';

// Who owns a keystroke, in ONE place: a typing field, a modal surface, or the editor's own
// shortcuts. Every surface asks the same question here and gets the same answer, so there is
// nothing to order between listeners and nothing to leak.

/** The activatable controls Space belongs to — Space is the button key, and taking it would
 *  make the editor unusable without a mouse. Enter is not a substitute: a keyboard user reaches
 *  for Space on a focused button, and silence there reads as a broken control. */
const ACTIVATABLE = 'button, [role="button"], a[href], summary';

/** Fields that eat every key while focused: Space types a space, Delete deletes a character. */
const TYPING = 'input, textarea, select, [contenteditable="true"], .monaco-editor';

const focusIn = (sel: string, el: Element | null = document.activeElement) =>
  el instanceof HTMLElement && !!el.closest(sel);

/** True while the caret is in a text field, a select, or the code editor. */
export const typingFocus = (target?: EventTarget | null) =>
  focusIn(TYPING, target instanceof HTMLElement ? target : document.activeElement);

/** True while a modal surface is mounted. */
export const modalOpen = () => useTemplateStore.getState().modalCount > 0;

/**
 * Does a global editor shortcut get to act at all? False while a modal is up (a keystroke aimed
 * at a dialog must never edit the document behind it) or while the user is typing.
 */
export function editorShortcutsLive(target?: EventTarget | null): boolean {
  return !modalOpen() && !typingFocus(target);
}

/** True while focus sits on something Space/Enter would activate. */
export const activatableFocus = () => focusIn(ACTIVATABLE);

/**
 * Every modal surface calls this. Counted rather than flagged so stacked modals close correctly,
 * and so unmounting can never leave the gate stuck open — which a hand-set flag eventually does.
 *
 * `open` is REQUIRED for a surface that stays mounted and returns null when closed (the wizard
 * and the sign-in dialog both do). Keying the gate on mount alone would hold it down for the
 * whole session and silently disable every editor shortcut in the app.
 */
export function useModalGate(open = true): void {
  const push = useTemplateStore((s) => s.pushModal);
  const pop = useTemplateStore((s) => s.popModal);
  useEffect(() => {
    if (!open) return;
    push();
    return pop;
  }, [open, push, pop]);
}
