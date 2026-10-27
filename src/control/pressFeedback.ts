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
// The marks are a store part (`createPressMarks`), as the page's other playout state is: every ⚡
// press, from a block or a panel key, goes through `press`, and the part drops a mark as soon as
// the session's `air` part puts another cue (or none) on its graphic's layer, so a cue taken off
// and taken again starts clean. No React, so Node tests import it (scripts/press-feedback.test.mjs).

import type { PressDone } from './panelActions';
import { storePart, type StorePart } from './storePart.ts';

export type PressState = 'sending' | 'sent' | 'unheard' | 'unknown' | 'refused' | 'failed';

export interface PressMark {
  state: PressState;
  graphic: string;
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
export const pressSending = (graphic: string, cue: string | null, seq: number): PressMark => ({ state: 'sending', graphic, cue, seq });

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

/** Only the marks of the instance each layer holds now. The same object when none is dropped. */
export function pruneMarks(marks: Readonly<Record<string, PressMark>>, liveCue: Readonly<Record<string, string>>): Record<string, PressMark> {
  const kept = Object.entries(marks).filter(([, m]) => m.cue === (liveCue[m.graphic] ?? null));
  return kept.length === Object.keys(marks).length ? (marks as Record<string, PressMark>) : Object.fromEntries(kept);
}

export interface PressMarks {
  part: StorePart<Record<string, PressMark>>;
  /** Run one ⚡ press and mark it: sending at once, then what it came to (a press that threw is
   *  failed). `cue` is the cue on the layer at the press; `heard` is read when it settles. */
  press: (graphic: string, event: string, cue: string | null, run: () => Promise<PressDone>, heard: () => boolean) => Promise<PressDone>;
  /** Drop every mark whose instance is no longer the one on its layer. */
  prune: (liveCue: Readonly<Record<string, string>>) => void;
  /** Prune on every move of the session's `air` part; answers how to stop. */
  follow: () => () => void;
}

/** The marks of one session, following its `air` part (`follow`) when one is given. */
export function createPressMarks(air?: Pick<StorePart<{ liveCue: Readonly<Record<string, string>> }>, 'get' | 'subscribe'>): PressMarks {
  const part = storePart<Record<string, PressMark>>({});
  let seq = 0;
  return {
    part,
    press: async (graphic, event, cue, run, heard) => {
      const key = pressKey(graphic, event);
      const n = (seq += 1);
      part.set((marks) => ({ ...marks, [key]: pressSending(graphic, cue, n) }));
      let done: PressDone;
      try {
        done = await run();
      } catch (e) {
        done = { outcome: 'failed', note: e instanceof Error ? e.message : String(e) };
      }
      part.set((marks) => settleMark(marks, key, n, done, heard()));
      return done;
    },
    prune: (liveCue) => part.set((marks) => pruneMarks(marks, liveCue)),
    follow: () => (air ? air.subscribe(() => part.set((marks) => pruneMarks(marks, air.get().liveCue))) : () => {}),
  };
}
