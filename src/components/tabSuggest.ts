// TAB TAKES THE SUGGESTION (owner request of 2026-11-23: "you press Tab, and the default text
// becomes a real text"). A text box whose grey placeholder is a value the operator may want, not
// an instruction, carries it in `data-suggest`. In that box, empty, Tab types the suggestion in
// and keeps the caret there; the next Tab moves on as always.
//
// Opt-in, because most placeholders say what to type ("Search graphics…", "e.g. after the intro")
// and an example address typed in by a keystroke would send to a device nobody has. A box gets the
// attribute only where its placeholder is a default or a sensible first value.
//
// One listener for the whole document, installed once at boot (main.tsx). It types through the
// element's own value setter and an `input` event, so React's onChange sees an ordinary edit.

/** The attribute a box carries its suggestion in. */
export const SUGGEST = 'data-suggest';

/** The text Tab would type into this element now, or null. */
export function tabSuggestion(el: EventTarget | null): string | null {
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return null;
  if (el.readOnly || el.disabled || el.value !== '') return null;
  const suggestion = el.getAttribute(SUGGEST);
  return suggestion ? suggestion : null;
}

/** Type `text` into a React-controlled box as if the user had. */
function typeInto(el: HTMLInputElement | HTMLTextAreaElement, text: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  // A number box has no selection range to set.
  try {
    el.setSelectionRange(text.length, text.length);
  } catch {
    // Nothing to place.
  }
}

export function installTabSuggest(doc: Document = document): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || e.isComposing || e.defaultPrevented) return;
    const suggestion = tabSuggestion(e.target);
    if (suggestion === null) return;
    e.preventDefault();
    typeInto(e.target as HTMLInputElement | HTMLTextAreaElement, suggestion);
  };
  doc.addEventListener('keydown', onKey, true);
  return () => doc.removeEventListener('keydown', onKey, true);
}
