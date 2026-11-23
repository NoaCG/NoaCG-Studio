// WHAT AN OSC CUE'S LAST SEND CAME TO, ON ITS RUNDOWN ROW (docs/work-specs/osc-control-cues/spec.md
// D9, owner request of 2026-11-23: "you don't get any feedback when you press Take").
//
// An OSC cue never goes on air, so nothing on the monitors answers its Take. Its row does instead:
// every send of the cue, by whatever route (Take, a folder's Take or step, Play now, Companion,
// Out, All out, Send test), goes through the page's one `controlTake`, which runs it through
// `send` here. The row then wears the outcome with its time, and flashes once when it lands:
//
//   SENDING          the request is with the Bridge
//   SENT 14:02:31    the Bridge handed the datagram to the network (UDP has no receipt)
//   NOT SENT         refused before or by the Bridge; the reason is the tag's title
//   UNCERTAIN        no answer came after the request left; check the desk
//   OUT WAITING      sent, and its On Out message goes at Out or All out
//
// Marks live for the page's lifetime only: a reload starts clean, as the send ids do. No React, so
// a Node test imports it (scripts/osc-marks.test.mjs).

import { storePart, type StorePart } from './storePart.ts';

export type OscMarkState = 'sending' | 'sent' | 'refused' | 'uncertain';

export interface OscMark {
  which: 'take' | 'out';
  state: OscMarkState;
  /** Wall-clock time of the press, then of the answer. */
  at: number;
  /** Which send of this cue it is: an answer settles only its own. */
  seq: number;
  note?: string;
  /** The answer just landed: the row flashes, until `OSC_FLASH_MS` later. */
  fresh?: true;
}

/** What one send came to, as the page's `controlTake` answers it. */
export interface OscSendDone {
  ok: boolean;
  note: string;
  uncertain?: true;
}

export interface OscMarks {
  part: StorePart<Readonly<Record<string, OscMark>>>;
  /** Run one send of a cue and mark it: sending at once, then what it came to. */
  send: <T extends OscSendDone>(cueId: string, which: 'take' | 'out', run: () => Promise<T>) => Promise<T>;
}

export function createOscMarks(now: () => number = Date.now, later: (run: () => void, ms: number) => void = (run, ms) => void setTimeout(run, ms)): OscMarks {
  const part = storePart<Readonly<Record<string, OscMark>>>({});
  let seq = 0;
  /** Mark an answer fresh, and stale again once its flash is over. */
  const land = (cueId: string, n: number, mark: OscMark) => {
    part.set((marks) => settle(marks, cueId, n, { ...mark, fresh: true }));
    // Only this send's flash ends: a newer send's mark carries its own timer.
    later(() => part.set((marks) => (marks[cueId]?.seq === n && marks[cueId].fresh ? { ...marks, [cueId]: mark } : marks)), OSC_FLASH_MS);
  };
  return {
    part,
    send: async (cueId, which, run) => {
      const n = (seq += 1);
      part.set((marks) => ({ ...marks, [cueId]: { which, state: 'sending', at: now(), seq: n } }));
      let done;
      try {
        done = await run();
      } catch (e) {
        land(cueId, n, { which, state: 'refused', at: now(), seq: n, note: e instanceof Error ? e.message : String(e) });
        throw e;
      }
      const state: OscMarkState = done.ok ? 'sent' : done.uncertain ? 'uncertain' : 'refused';
      land(cueId, n, { which, state, at: now(), seq: n, ...(done.ok ? {} : { note: done.note }) });
      return done;
    },
  };
}

/** Fold an answer into the marks, only into the send it answers. */
function settle(marks: Readonly<Record<string, OscMark>>, cueId: string, seq: number, mark: OscMark): Readonly<Record<string, OscMark>> {
  return marks[cueId]?.seq === seq ? { ...marks, [cueId]: mark } : marks;
}

/** `14:02:31`, in this computer's time. */
export function clockText(ms: number): string {
  const d = new Date(ms);
  return [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, '0')).join(':');
}

export interface OscTag {
  text: string;
  tone: 'sending' | 'sent' | 'warn' | 'owed';
  title: string;
  testid: string;
}

/** How long after an answer its row flashes. */
export const OSC_FLASH_MS = 1500;

/** The row's tags: the last send's outcome, or OUT WAITING when its On Out is owed. A sent Take
 *  that owes its On Out says so in one tag, its time in the title, since the rundown is narrow. */
export function oscTags(mark: OscMark | undefined, owesOut: boolean): OscTag[] {
  const tags: OscTag[] = [];
  if (owesOut && (!mark || (mark.which === 'take' && mark.state === 'sent'))) {
    const sent = mark ? `Sent at ${clockText(mark.at)}. ` : '';
    return [{ text: 'OUT WAITING', tone: 'owed', title: `${sent}Its On Out message is sent at Out or All out.`, testid: 'cue-osc-owed' }];
  }
  if (mark) {
    const out = mark.which === 'out' ? 'OUT ' : '';
    const time = clockText(mark.at);
    if (mark.state === 'sending') tags.push({ text: `${out}SENDING`, tone: 'sending', title: 'Sending to the device', testid: 'cue-osc-sending' });
    else if (mark.state === 'sent') {
      tags.push({
        text: `${out}SENT ${time}`,
        tone: 'sent',
        title: `Sent at ${time}. OSC has no reply: if the device did nothing, check its address, port and network.`,
        testid: 'cue-osc-sent',
      });
    } else if (mark.state === 'uncertain') {
      tags.push({ text: `${out}UNCERTAIN`, tone: 'warn', title: `${time}: ${mark.note ?? 'Send uncertain. Check the desk.'}`, testid: 'cue-osc-uncertain' });
    } else tags.push({ text: `${out}NOT SENT`, tone: 'warn', title: `${time}: ${mark.note ?? 'Not sent.'}`, testid: 'cue-osc-refused' });
  }
  if (owesOut) tags.push({ text: 'OUT WAITING', tone: 'owed', title: 'Its On Out message is sent at Out or All out.', testid: 'cue-osc-owed' });
  return tags;
}

/** The row flashes for a send that just landed: its tone, or null. */
export function oscFlash(mark: OscMark | undefined): 'sent' | 'warn' | null {
  if (!mark?.fresh) return null;
  return mark.state === 'sent' ? 'sent' : 'warn';
}
