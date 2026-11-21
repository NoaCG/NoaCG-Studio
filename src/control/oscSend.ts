// ONE OSC CUE'S SEND, AS PLAIN DATA (docs/work-specs/osc-control-cues/spec.md D1, D2, D7, D9).
//
// What a Take of an OSC cue sends, why it would not, and the sentence the operator reads after.
// The page carries it out through the paired NoaCG Bridge (control/playoutLink.ts `sendOsc`); this
// module decides and words, and runs in Node (scripts/osc-send.test.mjs).
//
// The values sent are the cue's as they stand at the press. Nothing here retries: a press is one
// send id, and the Bridge answers a repeat of that id without sending again.

import type { OscDestination } from '../model/controlCue.ts';
import { controlReadOnly, oscMessageProblem, readControl } from '../model/controlCue.ts';
import type { ShowCue } from '../model/shows';
import type { OscRequestWire } from './playoutProtocol';

/** Why this OSC cue cannot be taken now, or null. `paired` is whether this browser holds a Bridge
 *  pairing: without one nothing is asked of any local address, and the cue says how to fix it. */
export function oscBlocker(cue: Pick<ShowCue, 'label' | 'source' | 'control'>, destinations: readonly OscDestination[] | undefined, paired: boolean): string | null {
  if (controlReadOnly(cue)) return `${cue.label} was saved by a newer version of NoaCG, so it cannot be sent here.`;
  const control = readControl(cue.control);
  if (!control) return `${cue.label} has no OSC message.`;
  const dest = (destinations ?? []).find((d) => d.id === control.destinationId);
  if (!dest) return control.destinationId ? `${cue.label} sends to a device this production no longer has. Choose a destination.` : `${cue.label} has no destination. Choose one.`;
  if (!control.address.trim()) return `${cue.label} has no OSC address.`;
  const problem = oscMessageProblem(control);
  if (problem) return `${cue.label}: ${problem}`;
  if (!paired) return 'Connect NoaCG Bridge in Playout settings to send OSC cues.';
  return null;
}

/** The request one press sends, or why it cannot. `sendId` is the press's own identity. */
export function oscRequest(
  cue: Pick<ShowCue, 'id' | 'label' | 'source' | 'control'>,
  destinations: readonly OscDestination[] | undefined,
  sendId: string,
): { ok: true; request: OscRequestWire; destination: OscDestination } | { ok: false; reason: string } {
  const blocked = oscBlocker(cue, destinations, true);
  if (blocked) return { ok: false, reason: blocked };
  const control = readControl(cue.control)!;
  const destination = (destinations ?? []).find((d) => d.id === control.destinationId)!;
  return {
    ok: true,
    destination,
    request: {
      sendId,
      host: destination.host.trim(),
      port: destination.port,
      address: control.address.trim(),
      args: control.args.map((a) => ({ type: a.type, value: a.value })),
    },
  };
}

/** Mints one send id per deliberate press, unique to this page load: a reload is a new page, and a
 *  press after it a new press. */
export function sendIds(session: string): (cueId: string) => string {
  let n = 0;
  return (cueId) => `${session}:${++n}:${cueId}`;
}

export type OscOutcome =
  | { state: 'sent'; to: string; repeat: boolean }
  | { state: 'refused' | 'uncertain' | 'no-bridge'; detail: string };

/** The note line after a send. "Sent" says only that it left; the cue's help says the rest. */
export function oscNote(label: string, destination: string, outcome: OscOutcome): string {
  if (outcome.state === 'sent') return `✓ ${label}: OSC sent to ${destination}`;
  if (outcome.state === 'uncertain') return `${label}: ${outcome.detail}`;
  return `${label} was not sent: ${outcome.detail}`;
}

/** The rundown row's dim summary for an OSC cue: where it sends and what, as an operator reads it -
 *  `Lighting desk  /zeros/cue/go "0" "5"`. */
export function oscRowSummary(cue: Pick<ShowCue, 'source' | 'control'>, destinations: readonly OscDestination[] | undefined): string {
  if (controlReadOnly(cue)) return 'OSC cue from a newer version';
  const control = readControl(cue.control);
  if (!control) return 'OSC cue';
  const dest = (destinations ?? []).find((d) => d.id === control.destinationId);
  const args = control.args.map((a) => (a.type === 's' ? `"${a.value}"` : a.value)).join(' ');
  return [dest ? dest.name : 'no destination', control.address.trim() || 'no address', args].filter(Boolean).join('  ');
}
