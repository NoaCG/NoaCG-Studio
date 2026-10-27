// WHAT A LIVE PRESS CAME TO, ON ITS BUTTON (docs/work-specs/playout-ograf-controls/spec.md, E2.2,
// AC-3). A ⚡ press, from the selected graphic's block or a pinned one, marks its button while it
// is out and with what it came to, for the instance it was pressed on:
//
//   …  sending      the press is out; nothing is known yet
//   ✓  sent         the outputs' road took it (the server, or this page's PROGRAM unpublished):
//                   the last confirmed press. Never "on air" and never "done": what the Graphic
//                   did with it is its own, and no monitor's picture is proof of it
//   ?  unheard      taken, but no output is reporting, so nothing may have aired it
//   ?  unknown      no answer came; it may still land
//   ✕  refused      refused before or by the server, the sentence on the note line
//   ✕  failed       it did not go
//
// A mark belongs to the cue live on the layer when it was pressed. Once another cue holds that
// layer (a Take, an Out, a replacement), the mark is not shown: its answer is the old instance's,
// and neither a pending nor a confirmed press of it may read as the new one's. A later press of the
// same button replaces its mark, and an answer for an older press never overwrites a newer one.
//
// Pure, so Node tests import it (scripts/press-feedback.test.mjs).

import type { PressDone } from './panelActions';

export type PressState = 'sending' | 'sent' | 'unheard' | 'unknown' | 'refused' | 'failed';

export interface PressMark {
  state: PressState;
  /** The cue live on the layer at the press, or null when none was held there. */
  cue: string | null;
  /** Which press of this button it is: an answer settles only its own. */
  seq: number;
  note?: string;
}

/** Each state's icon and the words a hover, a screen reader and a narrow panel's title carry. */
export const PRESS_SAYS: Record<PressState, { icon: string; says: string }> = {
  sending: { icon: '…', says: 'Sending' },
  sent: { icon: '✓', says: 'Sent' },
  unheard: { icon: '?', says: 'Sent, but no output is reporting' },
  unknown: { icon: '?', says: 'No answer; it may still land' },
  refused: { icon: '✕', says: 'Refused' },
  failed: { icon: '✕', says: 'Not sent' },
};

/** The key a button's mark is kept under. */
export const pressKey = (graphic: string, event: string) => `${graphic}\u0000${event}`;

/** A press as it leaves: sending, on the instance it was pressed on. */
export const pressSending = (cue: string | null, seq: number): PressMark => ({ state: 'sending', cue, seq });

/** What the press came to. `heard`: something that could air it was reporting when it settled. */
export function pressSettled(mark: PressMark, done: PressDone, heard: boolean): PressMark {
  const state: PressState =
    done.outcome === 'accepted' ? (heard ? 'sent' : 'unheard') : done.outcome === 'unknown' ? 'unknown' : done.outcome === 'refused' ? 'refused' : 'failed';
  return { ...mark, state, ...(done.note ? { note: done.note } : {}) };
}

/** Fold an answer into the kept marks: only into the press it answers. */
export function settleMark(marks: Readonly<Record<string, PressMark>>, key: string, seq: number, done: PressDone, heard: boolean): Record<string, PressMark> {
  const mark = marks[key];
  if (!mark || mark.seq !== seq) return marks as Record<string, PressMark>;
  return { ...marks, [key]: pressSettled(mark, done, heard) };
}

/** The mark to draw on a button now: none once another cue holds the layer. */
export function shownMark(mark: PressMark | undefined, onLayer: string | null): PressMark | null {
  return mark && mark.cue === onLayer ? mark : null;
}

/** The button's title with what its last press came to. */
export function markTitle(title: string, mark: PressMark | null): string {
  if (!mark) return title;
  const says = PRESS_SAYS[mark.state].says;
  return `${says}${mark.note ? `: ${mark.note}` : ''}. ${title}`;
}
