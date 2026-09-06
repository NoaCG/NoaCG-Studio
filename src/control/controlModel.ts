// The modular control-panel engine. ONE generator turns any template's SPX DataFields into
// field descriptors (model/fieldModel.ts) — there is no per-template code. A number field
// becomes a stepper, a textarea a line list, an image field a picker, and so on. The same
// descriptors drive every surface that edits a field: the in-app Data and Control panels
// (through the shared components/fields control), and the standalone controlpanel.html export.

import type { SpxField } from '../model/types';
import type { FieldDescriptor, FieldKind } from '../model/fieldModel';
import { parseAnimData } from '../blocks/animData';
import { deriveMachine, machineControls, type ControlButton } from '../blocks/animMachine';
import { slug } from '../export/slug';

/** Map an SPX ftype to a control kind. The non-data ftypes carry no control at all.
 *  Exported for the OGraf exporter, which records the kind as a per-property vendor hint so
 *  the standard's 3-way type collapse (string/number/boolean) can be undone on the way back
 *  (control/ografContract.ts) - one mapping, read from both directions. */
export function kindForField(f: SpxField): FieldKind | null {
  switch (f.ftype) {
    case 'textfield':
      return 'text';
    case 'textarea':
      return 'lines'; // our data-driven fields are line lists (ticker items, credits, schedule…)
    case 'number':
      return 'number';
    case 'filelist':
      return 'image';
    case 'dropdown':
      return 'select';
    case 'checkbox':
      return 'toggle';
    case 'color':
      return 'color';
    // An input-only value (a countdown's duration). SPX hides it from the operator, but the
    // Data panel still edits it — see includeHidden below.
    case 'hidden':
      return 'text';
    default:
      return null; // instruction, caption, button, divider, spacer
  }
}

/**
 * The descriptors for a template's editable fields.
 *
 * `includeHidden` is what separates the two SPX surfaces: the operator panels (the Control tab
 * and the exported controlpanel.html) show what SPX shows and so skip `hidden` fields, while
 * the Data panel edits them too — a hidden field carries a real input value (a countdown's
 * duration) that has to be testable in the editor.
 */
export function fieldDescriptors(
  fields: SpxField[],
  { includeHidden = false }: { includeHidden?: boolean } = {},
): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const f of fields) {
    if (f.ftype === 'hidden' && !includeHidden) continue;
    const kind = kindForField(f);
    if (!kind) continue;
    out.push({
      key: f.field,
      label: f.title || f.field,
      kind,
      defaultValue: f.value, // the definition default — the per-field Reset target
      options: f.items?.map((it) => ({ label: it.text, value: it.value })),
    });
  }
  return out;
}

// ── Event buttons (Phase 5) ─────────────────────────────────────────────────
// The state machine's side of the panel: every authored operator event renders as a button
// (blocks/animMachine.ts machineControls — labels/sections/payloads come from the machine's
// own `controls` metadata, so the list travels inside the template). Only an EXPLICIT
// machine offers buttons: the derived linear machine's one event is `next`, which the
// lifecycle row already carries.

export type { ControlButton } from '../blocks/animMachine';

/** The event buttons a template's control surfaces render (empty without an explicit machine). */
export function eventButtons(js: string): ControlButton[] {
  const machine = parseAnimData(js)?.machine;
  return machine ? machineControls(machine) : [];
}

/** A number field's value moved by a delta — the ONE arithmetic behind every "+1" a control
 *  surface performs (the ± live-number steppers and an event's `adjust`). Anything that does
 *  not read as an integer counts from 0, so an empty score box bumps to 1, not to NaN. */
export function adjustedValue(current: string | number | undefined, delta: number): string {
  return String((parseInt(String(current ?? ''), 10) || 0) + delta);
}

/** A lines field's non-empty lines, trimmed - the one reading of a list every surface shares. */
function listLines(current: string | number | undefined): string[] {
  return String(current ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

/** A lines field with one value ADDED as its last line - the list twin of `adjustedValue`
 *  (an event's `add`). A value already on the list is not added twice: the list is a set of
 *  lines (a bingo number called once, a letter revealed once), so a second press is a no-op
 *  rather than a duplicate the board would then paint twice. */
export function addedValue(current: string | number | undefined, value: string): string {
  const lines = listLines(current);
  const line = value.trim();
  if (line && !lines.includes(line)) lines.push(line);
  return lines.join('\n');
}

/** A lines field with the LAST line equal to the value taken out (an event's `remove`, the
 *  undo of `addedValue`). A value the list does not hold leaves it as it was. */
export function removedValue(current: string | number | undefined, value: string): string {
  const lines = listLines(current);
  const at = lines.lastIndexOf(value.trim());
  if (at !== -1) lines.splice(at, 1);
  return lines.join('\n');
}

/** The members of the payload family a button may carry - `payload` aside, which rides a field
 *  as it reads and moves nothing. */
type MovingButton = Pick<ControlButton, 'adjust' | 'set' | 'add' | 'remove'>;

/**
 * The field values a button's press carries — THE one rule every surface that fires an event
 * uses, so the production page, the hosted page, the editor's Control tab and the exported
 * panel cannot disagree about what rides (`controlPanelHtml.ts` and
 * `productionControllerHtml.ts` inline the same rule, since those pages ship without this
 * module):
 *
 * - `payload` fields ride at their CURRENT value (the pick, the focused row);
 * - `adjust` fields ride at their current value MOVED by the declared delta (a goal's +1 on
 *   that side's score) - the write rides the event and is applied only if the machine accepts
 *   it, never as a bare update that the guard could not refuse.
 * - `set` fields ride at the figure the control DECLARES (a score board's "New game" putting
 *   every score back to 0). It reads nothing from the surface, which is what lets a reset exist
 *   at all: neither of the two above can say "make it this".
 * - `add` list fields ride with the SOURCE field's current value appended as a line (a puzzle's
 *   "Reveal letter" adding the Guess box to the revealed letters) - the list twin of `adjust`,
 *   and the one member that can say "add this". `remove` is its inverse: the last line equal to
 *   the source comes out. A source that reads empty, or a remove of a line the list does not
 *   hold, leaves the list off the wire, so the press cannot blank a board by mistake.
 *
 * `valueOf` is the surface's own answer for "what does this field read right now" (its staged
 * box, its on-air record); `undefined` means the surface has no value, and a payload field then
 * stays off the wire so the graphic keeps what it has (a bare `''` once wiped a quiz pick), while
 * an adjust field counts from 0 and a list from empty. Returns `undefined` when nothing rides, so
 * a bare event fires bare. The keys of `button.adjust`, `set`, `add` and `remove` (`movedKeys`)
 * are ALSO what the surface must write back into its own field state after sending, the way its
 * live-number stepper does - or the next press would move from the stale value.
 */
export function eventPayload(
  button: Pick<ControlButton, 'payload'> & MovingButton,
  valueOf: (key: string) => string | number | undefined,
): Record<string, string> | undefined {
  const payload: Record<string, string> = {};
  for (const key of button.payload ?? []) {
    const value = valueOf(key);
    if (value !== undefined) payload[key] = String(value);
  }
  for (const [key, delta] of Object.entries(button.adjust ?? {})) {
    payload[key] = adjustedValue(valueOf(key), delta);
  }
  for (const [key, value] of Object.entries(button.set ?? {})) payload[key] = value;
  for (const [key, source] of Object.entries(button.add ?? {})) {
    const line = String(valueOf(source) ?? '').trim();
    if (line) payload[key] = addedValue(valueOf(key), line);
  }
  for (const [key, source] of Object.entries(button.remove ?? {})) {
    const line = String(valueOf(source) ?? '').trim();
    if (!line) continue;
    const current = valueOf(key);
    const next = removedValue(current, line);
    if (next !== listLines(current).join('\n')) payload[key] = next;
  }
  return Object.keys(payload).length > 0 ? payload : undefined;
}

/**
 * The field ids a press MOVES, so the surface writes the new figures back into its own state.
 *
 * One helper because four surfaces do this and every one of them used to spell it
 * `Object.keys(button.adjust ?? {})`. A control family that grows (`set` arrived with the score
 * board's reset, `add` and `remove` with the puzzle's Reveal letter) then leaves each surface to
 * remember on its own, and the one that forgets shows an operator a box still reading the old
 * score while air reads the new one - the exact drift `adjust`'s write-back exists to prevent,
 * arriving by omission instead of by design.
 */
export function movedKeys(button: MovingButton): string[] {
  return [
    ...Object.keys(button.adjust ?? {}),
    ...Object.keys(button.set ?? {}),
    ...Object.keys(button.add ?? {}),
    ...Object.keys(button.remove ?? {}),
  ];
}

/** The field ids a press READS without moving them - the sources an `add` or a `remove` takes
 *  its line from. A surface whose values live in an entry or a cue needs to know these ride
 *  from the same place a payload field would, so the Guess box the operator just typed into is
 *  what the press reveals. */
export function sourceKeys(button: Pick<ControlButton, 'add' | 'remove'>): string[] {
  return [...Object.values(button.add ?? {}), ...Object.values(button.remove ?? {})];
}

/** What a press MOVES, in the OPERATOR'S words ("Score A +1", "Score A to 0", "Guess into
 *  Revealed letters"), for the button hints - `labelOf` resolves a field id to its label, the
 *  way every surface words a payload. Every road is worded here, so a reset's hint says what
 *  it will do rather than nothing. */
export function adjustWords(
  button: MovingButton,
  labelOf: (key: string) => string | undefined,
): string {
  const name = (key: string) => labelOf(key) ?? key;
  return [
    ...Object.entries(button.adjust ?? {}).map(
      ([key, delta]) => `${name(key)} ${delta > 0 ? '+' : ''}${delta}`,
    ),
    ...Object.entries(button.set ?? {}).map(([key, value]) => `${name(key)} to ${value || '(empty)'}`),
    ...Object.entries(button.add ?? {}).map(([key, source]) => `${name(source)} into ${name(key)}`),
    ...Object.entries(button.remove ?? {}).map(([key, source]) => `${name(source)} out of ${name(key)}`),
  ].join(', ');
}

/**
 * The buttons grouped by their author-declared SECTION, in first-seen order, with everything
 * undeclared under "Actions".
 *
 * Shared because it decides what an operator sees: the in-app page grouped and the hosted page
 * rendered one flat wall of buttons, so a quiz's eight actions arrived unsorted on the smallest
 * screen of the three. Grouping is the author's own metadata (`machine.controls`) and belongs to
 * every surface that draws the buttons.
 */
export function controlSections(buttons: ControlButton[]): [string, ControlButton[]][] {
  const sections: [string, ControlButton[]][] = [];
  for (const b of buttons) {
    const key = b.section ?? 'Actions';
    const bucket = sections.find(([s]) => s === key);
    if (bucket) bucket[1].push(b);
    else sections.push([key, [b]]);
  }
  return sections;
}

/** One group's states, for the recovery snap picker: every state is enterable by SNAP by
 *  design (recovery, emergency jumps), so the list is the whole group, worn with the state
 *  NAMES the author gave them. Empty without an explicit machine — same gate as the buttons:
 *  on a plain linear template the picker would only duplicate ▶/»/■. */
export interface MachineStateGroup {
  id: string;
  states: { id: string; name: string }[];
}

/** The machine's groups and states, for surfaces that offer a snap-to-state control. */
export function machineStateGroups(js: string): MachineStateGroup[] {
  const machine = parseAnimData(js)?.machine;
  if (!machine) return [];
  return machine.groups.map((g) => ({
    id: g.id,
    states: g.states.map((s) => ({ id: s.id, name: s.name ?? s.id })),
  }));
}

/**
 * Every state's NAME, by group then by state id — what a surface needs to say where the
 * graphic is in words.
 *
 * Deliberately not `machineStateGroups` above: that one is the SNAP PICKER's list and is
 * empty without an explicit machine on purpose (a plain linear template's picker would only
 * duplicate ▶/»/■). Naming is the opposite question — a lower third's `enter` should read
 * "Enter" exactly as a quiz's `sealed` should read "Locked, choice hidden" — so this falls
 * back to the DERIVED machine, which names its states after the steps. Nothing is fetched:
 * the names travel inside the template's own data block.
 */
export function machineStateNames(js: string): Record<string, Record<string, string>> {
  const data = parseAnimData(js);
  if (!data) return {};
  const machine = data.machine ?? deriveMachine(data);
  const out: Record<string, Record<string, string>> = {};
  for (const group of machine.groups) {
    const names: Record<string, string> = {};
    for (const s of group.states) names[s.id] = s.name ?? s.id;
    out[group.id] = names;
  }
  return out;
}

/**
 * The graphic's current state as one operator-readable line, or null before it has answered.
 *
 * THE STATE CHIP IS THE FACT EVERY GREYED BUTTON IS JUDGED AGAINST, so it is the one string on
 * an operator surface that has to read as English. The runtime reports state IDS
 * (`noacgMachineState()` keys pointers by id), and three surfaces used to print them raw -
 * "sealed", "main:enter · clock:running" - from two hand-rolled copies of this map. Ids are
 * the author's vocabulary; an operator has seen only the names.
 *
 * One group prints its state alone; several prefix the GROUP id, because with a clock and a
 * flag and a walk running at once the name by itself does not say which of them moved.
 */
export function formatMachineState(
  names: Record<string, Record<string, string>>,
  state: { groups?: Record<string, string> } | null | undefined,
): string | null {
  // `state` is whatever the GRAPHIC's own noacgMachineState() returned, and an emitted or
  // imported template may hand-write that function with a shape of its own - the 2026-08-19
  // drive proof found one returning `{ stepsPlayed: 1 }`, which crashed this formatter and
  // painted the whole control page white. A shape this surface does not know reads as "the
  // graphic has not answered", never as a crash.
  if (!state || !state.groups) return null;
  const entries = Object.entries(state.groups);
  if (entries.length === 0) return null;
  return entries
    .map(([groupId, stateId]) => {
      const name = names[groupId]?.[stateId] ?? stateId;
      return entries.length > 1 ? `${groupId}: ${name}` : name;
    })
    .join(' · ');
}

/**
 * THE OVERFLOW WARNING — the second half of the owner's fit ruling (2026-08-23): copy longer
 * than the design can hold is **warned about, never clipped and never allowed to reshape the
 * artwork** (docs/SVG_IMPORT_PLAN.md §3). The first half is the runtime's fit ladder, which
 * fills the panel, wraps into the room the design has, shrinks to the readability floor, and
 * then reports the field through `noacgTextOverflow()`. This is what an operator reads.
 *
 * It has to be the same sentence on every surface where a value is typed
 * (docs/CONTROL_PANEL_PARITY.md §4), so the wording lives here rather than in four components.
 * The exported HTML surfaces carry a baked copy for the reason the state formatter does: they
 * ship without React and cannot import this module.
 *
 * `labels` maps field key -> the operator's own word for it; an unknown key falls back to the
 * key, which is still better than silence.
 */
export const OVERFLOW_FIELD_MARK = 'Too long for the design';

/**
 * The per-field tooltip — WHY it is flagged and what to do.
 *
 * TWO CAUSES, ONE SENTENCE, because they are one fact to the operator: this value is bigger than
 * the artwork somebody drew for it. Copy is the first — the fit ladder filled the panel, wrapped,
 * shrank to the readability floor and still ran past the shape. A LIST is the second: a vote
 * board's Options carry a round with more options than the designer drew rows for, and the rows
 * that did not fit are simply not on the board (templates/importedDesign/pollBehaviour.ts). The
 * answer is the same in both — shorten it — and so is the promise: the design is never reshaped
 * and nothing is silently cut to make the value look like it fitted.
 */
export const OVERFLOW_FIELD_HINT =
  'This value is bigger than the design can hold — copy that could not be made to fit even at ' +
  'the smallest readable size, or a list with more entries than the artwork has room for. ' +
  'Shorten it: the design is never reshaped, and nothing is cut behind your back to hide it.';

/** The summary's two endings, as WORDS rather than as a formatter, so the exported surfaces can
 *  bake them and assemble the same sentence without a second wording to keep in step. */
export const OVERFLOW_NOTE_ONE = 'is too long for the design — shorten it';
export const OVERFLOW_NOTE_MANY = 'values are too long for the design — shorten them';

/** The editor's one-line summary, or null when everything fits. */
export function overflowNote(keys: string[], labels: Record<string, string>): string | null {
  if (keys.length === 0) return null;
  if (keys.length === 1) return `⚠ ${labels[keys[0]] ?? keys[0].toUpperCase()} ${OVERFLOW_NOTE_ONE}`;
  return `⚠ ${keys.length} ${OVERFLOW_NOTE_MANY}`;
}

/** Which states each event fires from, per group — a control surface greys a button the
 *  machine would drop (the same structural guard, precomputed so no graph code ships). */
export function eventLegality(js: string): Record<string, Record<string, string[]>> {
  const machine = parseAnimData(js)?.machine;
  const legal: Record<string, Record<string, string[]>> = {};
  if (!machine) return legal;
  for (const group of machine.groups) {
    for (const t of group.transitions) {
      if (t.trigger !== 'operator' || !t.event) continue;
      const perGroup = (legal[t.event] ??= {});
      (perGroup[group.id] ??= []).push(t.from);
    }
  }
  return legal;
}

/**
 * Would this event fire RIGHT NOW? The structural guard, asked from outside the graphic: an
 * event is legal when some group's current state has an arrow carrying it. `state` null means
 * nothing has reported yet — treat every button as live rather than greying the whole panel
 * out on a graphic that simply has not answered.
 *
 * Every surface that shows event buttons asks THIS, so the editor's strip and a hosted
 * control page can never disagree about what an operator may press. (controlPanelHtml.ts
 * keeps its own inline copy: it ships dependency-free vanilla JS and is the one deliberate
 * second renderer.)
 */
export function isEventLegal(
  legality: Record<string, Record<string, string[]>>,
  event: string,
  state: { groups?: Record<string, string> } | null | undefined,
): boolean {
  // A state without `groups` (a template's own hand-written noacgMachineState) is treated
  // exactly like no answer yet - every button live, the structural guard decides.
  if (!state || !state.groups) return true;
  const groups = state.groups;
  const perGroup = legality[event];
  if (!perGroup) return false;
  return Object.entries(perGroup).some(([groupId, froms]) => froms.includes(groups[groupId]));
}

// ── The control ⇄ graphic message protocol ──────────────────────────────────
// A control panel and the graphic it drives talk over a BroadcastChannel (same browser,
// same origin — local, Era 4). Era 5.3 added a Supabase Realtime transport with the SAME
// message shape, so nothing above the transport changes. Phase 5 adds the machine cues:
// `event` rides the serial queue (noacgDispatch — the payload lands only if the machine
// accepts the event), `snap` enters states instantly (noacgSnap — recovery, emergency
// jumps), and `hello` asks the graphic to answer with its current machine state.

export type ControlMessage =
  | { t: 'update'; data: Record<string, string> }
  | { t: 'play' }
  | { t: 'stop' }
  | { t: 'next' }
  // `at` is WHEN this event happened, in epoch ms — the log row's own server time, which every
  // renderer of a production sees identically. A graphic that runs a clock of its own anchors it
  // to that instant instead of to its local `Date.now()`, so two renderers that receive the same
  // row paint the same second and a replayed row resumes from where it really started rather
  // than from when it was replayed. Optional: a local BroadcastChannel panel has no server time
  // and no second renderer to agree with, and a graphic that ignores it behaves exactly as before.
  | { t: 'event'; event: string; payload?: Record<string, string>; at?: number }
  | { t: 'snap'; snap: Record<string, string> | null }
  | { t: 'hello' };

/** What the graphic sends back on the same channel: its machine state after every handled
 *  message (and on `hello`), so a panel can show the current state and grey illegal buttons —
 *  and `graphic-online` once at boot, so a panel can rebuild a refreshed graphic from its
 *  event log (send the latest data, then snap to the last known state). */
export type ControlReply =
  | { t: 'state'; state: { groups?: Record<string, string> } }
  | { t: 'graphic-online' };

/** The channel name a template's control panel and graphic share (derived from its name). */
export function controlChannelName(templateName: string): string {
  return `spx-control-${slug(templateName)}`;
}
