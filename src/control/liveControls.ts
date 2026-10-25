// PINNED LIVE CONTROLS (docs/work-specs/pinned-live-controls/spec.md): which graphics' live controls
// an operator surface draws, the selection a press on one of them acts with, and the one-press pick
// rule. Pure, so the production page, the hosted control page and a Node test read one answer
// (scripts/live-controls.test.mjs). The press itself is control/graphicVerbs.ts's, through the one
// dispatcher: a pinned block only hands it a selection built for its own graphic.
//
// Runtime imports carry `.ts` so Node resolves them; everything else is a type.

import type { ShowCue } from '../model/shows';
import type { FieldDescriptor } from '../model/fieldModel';
import type { ControlButton } from './controlModel';
import type { LiveCueMap } from './liveCue';
import type { VerbSelection } from './graphicVerbs';

/** D5: a pick group draws at most this many option buttons; above it the control stays one
 *  button reading the field. */
export const PICK_CAP = 8;

/** A one-press pick: the field the event carries and one button per option. */
export interface PickGroup {
  field: string;
  options: { label: string; value: string }[];
}

/**
 * THE SELECTION A PINNED BLOCK PRESSES WITH: its graphic, and the cue live on that graphic's layer
 * as both the air cue and the edited one. Never the page's selection, so a press here cannot act
 * on the selected cue. Off air, the layer is not live and every verb sends nothing.
 */
export function liveSelection(graphic: string, cues: readonly ShowCue[], liveCue: LiveCueMap): VerbSelection {
  const id = Object.prototype.hasOwnProperty.call(liveCue, graphic) ? (liveCue[graphic] ?? null) : null;
  const cue = id ? (cues.find((c) => c.id === id && c.source !== 'playout') ?? null) : null;
  return {
    selectedCue: cue,
    selectedGraphic: graphic,
    selectedLayerLive: !!id,
    selectedPlayoutLive: false,
    editingCue: cue,
    editingIsLive: !!cue,
    airCue: cue,
  };
}

/** One block of the LIVE region. */
export interface LiveBlock {
  graphic: string;
  pinned: boolean;
  /** The selected cue's graphic: the block that presses with the page's own selection. */
  selected: boolean;
}

/**
 * THE LIVE REGION'S BLOCKS, in order (D2): every pinned graphic still in the pool, in pin order,
 * then the selected cue's graphic unless it is pinned, in which case its pinned block is marked as
 * the selected one and nothing is drawn twice. A pin naming no pool graphic draws nothing (D7) and
 * is returned in `dropped`. With no pins it is today's one block.
 */
export function liveBlocks(pinned: readonly string[], pool: readonly string[], selected: string | null): { blocks: LiveBlock[]; dropped: string[] } {
  const inPool = new Set(pool);
  const blocks: LiveBlock[] = [];
  const dropped: string[] = [];
  for (const graphic of pinned) {
    if (!inPool.has(graphic)) dropped.push(graphic);
    else if (!blocks.some((b) => b.graphic === graphic)) blocks.push({ graphic, pinned: true, selected: graphic === selected });
  }
  if (selected && !blocks.some((b) => b.graphic === selected)) blocks.push({ graphic: selected, pinned: false, selected: true });
  return { blocks, dropped };
}

const moves = (b: ControlButton) => [b.adjust, b.set, b.add, b.remove].some((m) => m && Object.keys(m).length > 0);

/**
 * THE ONE-PRESS PICK RULE (spec "The control model"): an event OFF the machine's default path whose
 * payload names exactly one `select` field with at most `PICK_CAP` options, and whose field no
 * control already `set`s, is drawn as one button per option. A default-path event's payload is
 * preparation (the quiz's Correct answer rides `judge`, which Continue walks), so it is never a
 * pick. `pathEvents` is the declaration's default path (controlModel `continueEvents`).
 */
export function pickOptions(button: ControlButton, descriptors: readonly FieldDescriptor[], pathEvents: ReadonlySet<string>, allButtons: readonly ControlButton[]): PickGroup | null {
  if (pathEvents.has(button.event) || moves(button)) return null;
  if (button.payload?.length !== 1) return null;
  const field = button.payload[0];
  const d = descriptors.find((x) => x.key === field);
  if (!d || d.kind !== 'select') return null;
  // An option with no value is "no pick" (the dropdown's "—"), which is not a choice to press.
  const options = (d.options ?? []).filter((o) => String(o.value) !== '');
  if (options.length === 0 || options.length > PICK_CAP) return null;
  if (allButtons.some((b) => b.set && Object.prototype.hasOwnProperty.call(b.set, field))) return null;
  return { field, options: options.map((o) => ({ label: o.label || String(o.value), value: String(o.value) })) };
}

/** A pick option's press: the event with its field SET to the option, the shape a `set` press has,
 *  so it rides one send and is written back only once accepted. */
export function pickButton(button: ControlButton, group: PickGroup, value: string): ControlButton {
  const { payload: _payload, ...rest } = button;
  return { ...rest, set: { [group.field]: value } };
}

/** The ± LIVE NUMBERS of a graphic: operator-visible number fields that no ⚡ event carries as
 *  payload (that field is set by its own action) and that no live candidate supplies. */
export function liveNumberFields(descriptors: readonly FieldDescriptor[], buttons: readonly ControlButton[], candidate: readonly string[] = []): FieldDescriptor[] {
  const payloadKeys = new Set(buttons.flatMap((b) => b.payload ?? []));
  return descriptors.filter((d) => d.kind === 'number' && !payloadKeys.has(d.key) && !candidate.includes(d.key));
}

/** The fields a pick group owns, which leave the cue editor's boxes for ▸ Advanced (D8). */
export function pickFields(buttons: readonly ControlButton[], descriptors: readonly FieldDescriptor[], pathEvents: ReadonlySet<string>): Set<string> {
  return new Set(buttons.flatMap((b) => pickOptions(b, descriptors, pathEvents, buttons)?.field ?? []));
}
