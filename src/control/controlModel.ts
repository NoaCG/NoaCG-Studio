// The modular control-panel engine. ONE generator turns any template's SPX DataFields into
// field descriptors (model/fieldModel.ts) — there is no per-template code. A number field
// becomes a stepper, a textarea a line list, an image field a picker, and so on. The same
// descriptors drive every surface that edits a field: the in-app Data and Control panels
// (through the shared components/fields control), and the standalone controlpanel.html export.

import type { SpxField } from '../model/types';
import type { FieldDescriptor, FieldKind } from '../model/fieldModel';
import { parseAnimData } from '../blocks/animData';
import { deriveMachine, machineControls, type ControlButton } from '../blocks/animMachine';
import { slug } from '../model/slug';
import { readPublishedProfile } from '../model/profile';
import { splitBoundWrites, type PressVerb, type TreeWrite } from '../model/productionData';

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

/**
 * WHICH KIND OF MOVE a press makes on one field, for the tree's benefit.
 *
 * A bound field's press writes production data rather than the field (plan §2.9), and the tree
 * is JSON: `retypeLeaf` keeps whatever type the leaf already had, but a path that does not exist
 * yet has no type to keep and the VERB is the only honest answer. An `adjust` is arithmetic and
 * starts a number; an `add`/`remove` is a list and starts an array; a `set` writes the figure the
 * control declares and starts a string.
 */
export function pressVerb(button: MovingButton, key: string): PressVerb {
  if (button.adjust && key in button.adjust) return 'adjust';
  if ((button.add && key in button.add) || (button.remove && key in button.remove)) return 'list';
  return 'set';
}

/** Everything one press of an event button produces, once the production's BINDINGS are applied. */
export interface PressSend {
  /** What rides the event. `undefined` fires it bare, which is what a press whose every moved
   *  field is bound does: those figures arrive as the tree's own update rows instead. */
  payload: Record<string, string> | undefined;
  /** The UNBOUND fields the press moved - what the surface writes back into its own state (the
   *  in-app cue, the hosted staging buffer) so the next press does not count from a stale one. */
  fields: Record<string, string>;
  /** The BOUND fields it moved, as writes of the SHARED value. Nothing here touches a cue. */
  tree: TreeWrite[];
}

/**
 * WHAT ONE PRESS CARRIES, SPLIT BY WHETHER THE PRODUCTION HAS BOUND THE FIELD.
 *
 * `eventPayload` above answers "what rides" for a surface with no production behind it - the
 * editor's Control tab, the exported panel. A DASHBOARD has a production, and a production can
 * say that a field is not this graphic's to carry at all: it is one shared value several graphics
 * follow (docs/PRODUCTION_DATA_PLAN.md §2.9). Three surfaces then have to agree on the same three
 * answers - what still rides, what is written back locally, what moves the tree - and they had
 * three copies of it, which is the shape `combineSend.ts`'s own header calls out as how two
 * surfaces come to disagree on air.
 *
 * `valueOf` stays the SURFACE's answer to "what does this field read right now", because that
 * genuinely differs: a bound field reads the tree, a moved unbound one reads the wire, one the
 * press only reads is the cue's. `bound` is field id -> production-data path, empty for the
 * productions that have bound nothing - and then every answer here is what it was before shared
 * values existed.
 */
export function pressSend(
  button: ControlButton,
  bound: Record<string, string>,
  valueOf: (key: string) => string | number | undefined,
): PressSend {
  const isBound = (key: string) => Object.prototype.hasOwnProperty.call(bound, key) && !!bound[key];
  const payload = eventPayload(button, valueOf);
  // Only what actually rode: an `add` whose source box was empty moves nothing, and writing an
  // empty string back for it would wipe the list the press left alone.
  const moved = Object.fromEntries(
    movedKeys(button)
      .filter((key) => payload?.[key] !== undefined)
      .map((key) => [key, payload![key]]),
  );
  const { fields, tree } = splitBoundWrites(moved, bound, (key) => pressVerb(button, key));
  const rides = Object.fromEntries(Object.entries(payload ?? {}).filter(([key]) => !isBound(key)));
  return { payload: Object.keys(rides).length > 0 ? rides : undefined, fields, tree };
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
 *  it will do rather than nothing.
 *
 *  A FIELD WITH NO OPERATOR WORD IS NOT DESCRIBED, and the empty string is a real answer. A
 *  `set` onto a HIDDEN holder is the graphic's own bookkeeping - the reported field a foreign
 *  host writes (`cli/skill/noacg-graphic/references/contract.md` §5c) is exactly this - and the
 *  operator neither sees it nor types into it, so `labelOf` has nothing for it. Printing the raw
 *  key instead put `moves f16 to revealed with it` on the proof case's own Reveal button, which
 *  is the one thing docs/PLAYOUT_DASHBOARD.md §7b says a hint must never do. Every graphic the
 *  skill teaches an agent to build carries such a holder, so this is the common case rather than
 *  an edge one. Callers treat '' as "nothing worth saying" and fall through to the payload
 *  wording, which is what the operator actually needed: *carrying this cue's Correct*. */
export function adjustWords(
  button: MovingButton,
  labelOf: (key: string) => string | undefined,
): string {
  // `add`/`remove` move a line INTO or OUT OF a list, and the list is the half the operator
  // recognises - so the destination decides whether there is a sentence at all. An unnameable
  // SOURCE (a hidden holder, which the contract allows as a word source) becomes "a line":
  // dropping the whole phrase would take the nameable list down with it.
  const listPhrase = (key: string, source: string, joiner: string) => {
    const list = labelOf(key);
    return list ? [`${labelOf(source) ?? 'a line'} ${joiner} ${list}`] : [];
  };
  return [
    ...Object.entries(button.adjust ?? {}).flatMap(([key, delta]) => {
      const label = labelOf(key);
      return label ? [`${label} ${delta > 0 ? '+' : ''}${delta}`] : [];
    }),
    ...Object.entries(button.set ?? {}).flatMap(([key, value]) => {
      const label = labelOf(key);
      return label ? [`${label} to ${value || '(empty)'}`] : [];
    }),
    ...Object.entries(button.add ?? {}).flatMap(([key, source]) => listPhrase(key, source, 'into')),
    ...Object.entries(button.remove ?? {}).flatMap(([key, source]) => listPhrase(key, source, 'out of')),
  ].join(', ');
}

// ── ARRANGE: how the controls a graphic declares are GROUPED AND ORDERED for an operator ─────
//
// Two things decide this, and one function answers both. The AUTHOR's own `machine.controls`
// metadata gives every button a section and a declared order; that half is shared because the
// in-app page grouped and the hosted page rendered one flat wall, so a quiz's eight actions
// arrived unsorted on the smallest screen of the three. The PRODUCTION's profile then arranges
// what the author declared (model/profile.ts, docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b).
//
// It is PRESENTATION and nothing else: the declaration travels through untouched, so a hidden
// control is still guarded by the same `isEventLegal` table and a renamed one still greys by it.
// `arrangeControls(buttons, undefined)` is the generated panel, which is what deleting a profile
// has to leave behind on all three deployments.

/** One control as a production PRESENTS it. */
export interface ArrangedControl {
  /** The DECLARATION, untouched. Legality, payload, adjust and destructive are all read from
   *  here, which is what makes the profile unable to change what a press does. */
  button: ControlButton;
  /** The word the operator reads: the profile's `name`, else the control's declared label. */
  label: string;
}

/** The controls of one graphic, split the three ways a surface draws them. */
export interface ArrangedControls {
  /** Above the fold, flat and unsectioned — the handful this show actually uses (the football
   *  principle: the operator should understand football, not the graphics software). A pinned
   *  control is LIFTED out of its section rather than repeated in it. */
  pinned: ArrangedControl[];
  /** The rest, grouped by the section each control ends up in, in first-seen order, with
   *  everything the author left undeclared under "Actions". */
  sections: [string, ArrangedControl[]][];
  /** The hidden ones. They are out of the panel's flow, and every surface puts them behind a
   *  COLLAPSED "More" rather than dropping them: hiding a control is a production saying "not
   *  in my way", and an operator who needs one mid-show must not have to open the authoring
   *  panel to reach it. Empty for a production that hid nothing. */
  more: ArrangedControl[];
}

/** One control's presentation, as ARRANGE stores it (`model/profile.ts` `ArrangeEntry`). Spelled
 *  out here rather than imported so this module keeps its own list of what it reads. */
export interface ArrangeRead {
  order?: number;
  section?: string;
  name?: string;
  hidden?: boolean;
  pinned?: boolean;
}

/**
 * One pool graphic's arrangement out of a production's profile, or undefined when there is none.
 *
 * IT TAKES THE PROFILE AS STORED and applies the version gate itself, which is the whole reason
 * every surface goes through here. `readPublishedProfile` answers null both for "no profile" and
 * for "a profile a newer build wrote", and a surface that reaches into `show.profile.arrange`
 * directly skips that: a v2 profile is read-only at both write doors and correctly ignored on the
 * hosted page, but it would still order, rename and hide buttons wherever it was read raw — and
 * one show rendering two different panels on two surfaces is exactly what the gate exists to
 * prevent. Passing an already-read profile costs nothing; reading twice is idempotent.
 *
 * A pool graphic's NAME is then somebody's typed text, so a bare `arrange[name]` answers a
 * function for a graphic called `constructor` — `model/profile.ts` `own()` exists for exactly
 * this and says what it measured.
 */
export function arrangeFor(
  profile: unknown,
  graphic: string | null | undefined,
): Record<string, ArrangeRead> | undefined {
  const arrange = readPublishedProfile(profile)?.arrange;
  if (!arrange || !graphic || !Object.prototype.hasOwnProperty.call(arrange, graphic)) return undefined;
  return arrange[graphic];
}

/**
 * THE ONE ARRANGEMENT RULE, which all three dashboard deployments call.
 *
 * `arrange` is the profile's entry map for ONE pool graphic (control id -> presentation), or
 * undefined for "no profile" — and undefined must give the generated panel back unchanged,
 * because that is what deleting a profile means on every surface.
 *
 * ORDER, precisely: a control carrying `order` sorts before one that does not, ties and the
 * unordered rest keeping their DECLARED order. That is the reading the format states ("lower
 * first; controls with no `order` follow in declared order") and it is what makes dragging one
 * control to the top a one-key change rather than a renumbering of the whole list.
 *
 * HIDDEN beats PINNED, because the two disagree only through a hand-edited profile and "not in
 * my way" is the safer of the two to honour. The authoring panel clears the pin when it hides.
 */
export function arrangeControls(
  buttons: ControlButton[],
  arrange: Record<string, ArrangeRead> | undefined,
): ArrangedControls {
  // A control id is somebody's typed event name, so the lookup must not answer a function for a
  // control called `constructor` — the same guard `model/profile.ts` `own()` exists for.
  const entryFor = (event: string): ArrangeRead =>
    arrange && Object.prototype.hasOwnProperty.call(arrange, event) ? arrange[event] ?? {} : {};

  const resolved = buttons.map((button, declaredAt) => {
    const entry = entryFor(button.event);
    return {
      button,
      label: entry.name || button.label,
      section: entry.section || button.section || 'Actions',
      hidden: entry.hidden === true,
      pinned: entry.hidden !== true && entry.pinned === true,
      order: entry.order,
      declaredAt,
    };
  });

  // One sort for every bucket below, so pinned, sectioned and hidden controls all read in the
  // same order the production dragged them into. A control with no `order` sorts as if it had an
  // infinite one, which puts every numbered control first and leaves the rest — all equal, all
  // infinite — in declared order on the tie.
  resolved.sort((a, b) => {
    const ao = a.order ?? Infinity;
    const bo = b.order ?? Infinity;
    return ao === bo ? a.declaredAt - b.declaredAt : ao - bo;
  });

  const pinned: ArrangedControl[] = [];
  const more: ArrangedControl[] = [];
  const sections: [string, ArrangedControl[]][] = [];
  for (const r of resolved) {
    const control: ArrangedControl = { button: r.button, label: r.label };
    if (r.hidden) {
      more.push(control);
      continue;
    }
    if (r.pinned) {
      pinned.push(control);
      continue;
    }
    const bucket = sections.find(([s]) => s === r.section);
    if (bucket) bucket[1].push(control);
    else sections.push([r.section, [control]]);
  }
  return { pinned, sections, more };
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
 * Several groups print their NAMES in the machine's own order, joined by a dot, and never the
 * group ids. The ids were printed as prefixes once ("main: On air · flag: No flag · result:
 * Live") so an operator could tell which group moved, but an id is the same author vocabulary
 * this function exists to hide: the demo walk of 2026-09-21 read the score tracker's chip as
 * machine words beside the quiz's plain "Reveal". A state name already says what it is about
 * ("No flag", "Final", "Clock running"), so the names carry the line on their own.
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
  return entries.map(([groupId, stateId]) => names[groupId]?.[stateId] ?? stateId).join(' · ');
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

/** The tooltip on a button `isEventLegal` greys out, in the operator's words. It names the
 *  BUTTON, never the machine's event id: "revealChoice has no arrow out of the current state"
 *  told a student nothing at the Friday rehearsal (2026-09-21). */
export function illegalEventTitle(label: string): string {
  return `${label} does nothing from where the graphic is now, so it is greyed out`;
}

/**
 * The machine a template's JS answers to, parsed once per distinct JS. The production dashboard
 * asks `canAdvance` and `movedStateNames` on every render, and it re-renders every second for
 * its clock, so re-parsing the same data block each time would be pure waste. A handful of
 * graphics are ever open at once; the cap only stops an editing session from growing it forever.
 */
const machineCache = new Map<string, ReturnType<typeof deriveMachine> | null>();
function machineOf(js: string): ReturnType<typeof deriveMachine> | null {
  if (machineCache.has(js)) return machineCache.get(js) ?? null;
  const data = parseAnimData(js);
  const machine = data ? deriveMachine(data) : null;
  if (machineCache.size >= 32) machineCache.delete(machineCache.keys().next().value as string);
  machineCache.set(js, machine);
  return machine;
}

/**
 * The names of every state the live graphic has MOVED INTO since its entrance: the main group
 * anywhere but its first waypoint, and any parallel group anywhere but its initial state. Empty
 * while the graphic still stands where a Take leaves it, and empty for one that has not reported.
 *
 * WHY: ✎ Update sends values and never moves a state - fixing a team name must not undo a
 * scoreboard's Final - so after a quiz's reveal, typing the next question and pressing Update
 * aired the new words under the old verdict (the demo walk of 2026-09-21). Update stays data
 * only; what changed is that the surface now says which states Update will keep, in the
 * author's names, so the operator can pick ⟳ Re-take instead. Type-agnostic by construction: it
 * reads the machine, never the kind of graphic.
 */
export function movedStateNames(
  js: string,
  names: Record<string, Record<string, string>>,
  state: { groups?: Record<string, string> } | null | undefined,
): string[] {
  if (!state || !state.groups) return [];
  const machine = machineOf(js);
  if (!machine) return [];
  const moved: string[] = [];
  machine.groups.forEach((group, index) => {
    const cur = state.groups?.[group.id];
    if (cur === undefined) return;
    const rest = index === 0 ? (group.defaultPath ?? [])[0] ?? group.initial : group.initial;
    // The main group OFF air is not a move either: nothing is up for Update to keep.
    if (cur === rest || (index === 0 && cur === group.initial)) return;
    moved.push(names[group.id]?.[cur] ?? cur);
  });
  return moved;
}

/**
 * Would a NEXT press (SPX Continue) move the graphic RIGHT NOW? The same question
 * `isEventLegal` answers for a named event, asked of the one verb that has no event name.
 *
 * It mirrors the runtime's own walk (`noacgProcessNext`, templates/shared/animRuntime.ts), on
 * the machine the graphic answers to - the authored one, or the one derived from its steps:
 *
 *   on the default path, Next enters the following waypoint - except the EXIT, which it enters
 *   only along an arrow the author drew (the classic contract: Next never takes a graphic off
 *   air, Out does);
 *   off the path (a branch such as a quiz's `locked`), Next fires only an authored `next` arrow;
 *   off air, Next does nothing - Take is how a graphic enters.
 *
 * WHY THE DASHBOARD ASKS: a quiz on its Reveal has only Out left on its path, so Next did
 * nothing while the log still wrote "Next step" - an operator reads that as a broken button
 * (the demo walk of 2026-09-21). Greying it, with the reason in the title, says the true thing.
 * `state` null (nothing reported yet) reads as legal, exactly as `isEventLegal` does.
 */
export function canAdvance(js: string, state: { groups?: Record<string, string> } | null | undefined): boolean {
  if (!state || !state.groups) return true;
  const main = machineOf(js)?.groups[0];
  if (!main) return true;
  const cur = state.groups[main.id];
  if (cur === undefined) return true;
  const path = main.defaultPath ?? [];
  const at = path.indexOf(cur);
  const operator = (t: { trigger: string; from: string }) => t.trigger === 'operator' && t.from === cur;
  if (at < 0) {
    if (cur === main.initial) return false;
    return main.transitions.some((t) => operator(t) && t.event === 'next');
  }
  if (at + 1 >= path.length) return false;
  if (at + 1 < path.length - 1) return true;
  return main.transitions.some((t) => operator(t) && t.to === path[at + 1]);
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
