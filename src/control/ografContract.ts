// THE OGRAF CONTROL CONTRACT: an OGraf v1 manifest read as an operator surface.
//
// The control layer derives every surface from the graphic itself - fields -> inputs, the
// machine's operator events -> buttons, nothing from a category (docs/CONTROL_LAYER.md). For
// a NoaCG template that graphic is the SPX definition + the NOACG_ANIM machine, read by
// `fieldDescriptors` and `eventButtons` in controlModel.ts. An OGraf Graphic states the same
// contract in the open standard's vocabulary: `schema` is the public state model (one property
// per data key), `customActions` are the operator's buttons, `stepCount` says whether » Next
// means anything. This module is the ADAPTER from that vocabulary into the exact shapes the
// five control renderers already consume - `FieldDescriptor` and `ControlButton` - so a Graphic
// NoaCG has never seen gets the operator surface its own manifest describes, through the one
// generator, with no second control system and no category consulted.
//
// It is the INVERSE of the exporter's mapping (export/targets/ograf.ts `dataSchema` +
// `customActions`), and honest about what the standard cannot carry back:
//   - a JSON-schema `string` cannot say whether it was a text line, a line LIST, a colour or an
//     image path; an `enum` makes it a select, else the standard's GDD type (`gddType`) says,
//     then the per-property `v_noacg.kind` hint older exports wrote, then `format`, and a string
//     that says none of these comes back as `text`;
//   - an Action has no section/destructive flag, so those ride the per-action `v_noacg`
//     vendor object the exporter writes (spec: vendor fields are `v_`-prefixed, allowed in
//     every manifest object) and default to "Actions" / false for a stranger's package;
//   - OGraf has no state graph, so there is no legality table: every button is live, which is
//     exactly what `isEventLegal` answers for a graphic that has not reported a state.
//
// Pure. The wire stays `ControlMessage`: `{t:'event', event: <action id>, payload}` IS
// `customAction({id, payload})` - the production page already assembles it that way.

import type { FieldDescriptor, FieldKind } from '../model/fieldModel';
import type { ControlButton } from '../blocks/animMachine';
import type { ControlMessage } from './controlModel';
import type { JsonValue } from '../model/productionData';
import { readOgrafDeclared, readTypedWire, type TypedValues } from '../model/ografTyped.ts';
import type { OgrafStepParams } from './ografSteps';

/** The operator surface one manifest describes. */
export interface OgrafControlContract {
  /** One per `schema.properties` entry, in declaration order (hidden ones skipped unless asked). */
  descriptors: FieldDescriptor[];
  /** One per `customActions[]` entry, in declaration order. */
  buttons: ControlButton[];
  /** The manifest's `stepCount` semantics: does » Next do anything, and how many presses. */
  steps: { count: number; stepped: boolean };
  /** What the adapter could not carry faithfully - shown, never hidden. */
  notes: string[];
}

type Json = Record<string, unknown>;
const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

const FIELD_KINDS: readonly FieldKind[] = ['text', 'lines', 'number', 'color', 'select', 'toggle', 'image'];

/**
 * The control each standard GDD type draws (gdd/gdd-types.json). A plain `file-path` may name any
 * file, so it is a text input: NoaCG's image control lists pictures. `select-multiple` is an
 * array, which no single control here can draw.
 */
const GDD_KINDS: Record<string, FieldKind | null> = {
  'single-line': 'text',
  'multi-line': 'lines',
  'file-path': 'text',
  'file-path/image-path': 'image',
  select: 'select',
  'select-multiple': null,
  'color-rrggbb': 'color',
  'color-rrggbbaa': 'color',
  percentage: 'number',
  'duration-ms': 'number',
};

/**
 * The control a property's `gddType` names, or undefined when it names none. A type this reader
 * does not know falls back down its own prefix, as the standard asks (`file-path/video-path` is a
 * `file-path`), and below the last one to the JSON type.
 */
function gddKind(prop: Json): FieldKind | null | undefined {
  let type = typeof prop.gddType === 'string' ? prop.gddType : '';
  while (type) {
    if (Object.prototype.hasOwnProperty.call(GDD_KINDS, type)) return GDD_KINDS[type];
    type = type.includes('/') ? type.slice(0, type.lastIndexOf('/')) : '';
  }
  return undefined;
}

/**
 * A schema property's control kind: a value list first, then the standard's GDD type, then the
 * `v_noacg.kind` hint an older NoaCG export (or a field no GDD type holds) carries, then what
 * plain JSON Schema says.
 */
function kindForProperty(prop: Json): FieldKind | null {
  // A value list is a select whatever else the property says: a text box would let the operator
  // send a value the graphic does not take.
  if (Array.isArray(prop.enum) && prop.enum.length) return 'select';
  const gdd = gddKind(prop);
  if (gdd !== undefined) return gdd;
  const vendor = isRecord(prop.v_noacg) ? prop.v_noacg : null;
  const hinted = typeof vendor?.kind === 'string' ? vendor.kind : null;
  if (hinted && (FIELD_KINDS as readonly string[]).includes(hinted)) return hinted as FieldKind;
  switch (prop.type) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'toggle';
    case 'string':
      if (prop.format === 'color') return 'color';
      // A URI names a resource, which is not necessarily a picture (E2.1): it stays a text line,
      // and only declared image semantics (the `image-path` GDD type above, an image media type)
      // draw a picture picker.
      if (typeof prop.contentMediaType === 'string' && prop.contentMediaType.startsWith('image/')) return 'image';
      return 'text';
    default:
      // An object/array/null property has no single-control shape; the standard lets a Graphic
      // declare one, and an operator panel cannot honestly draw it. Listed in `notes`.
      return null;
  }
}

/**
 * Read a manifest's operator surface. A `hidden: true` property is still a control: in the pinned
 * standard it means only that its value SHOULD NOT be used to build the Graphic's display name or
 * label in a GUI (Specification.md, `schema`), not that the operator may not set it (E2.1). A
 * surface that hides a control on purpose does so in its own profile (ARRANGE), never here.
 */
export function ografContract(manifest: unknown): OgrafControlContract {
  const notes: string[] = [];
  const descriptors: FieldDescriptor[] = [];
  const buttons: ControlButton[] = [];
  if (!isRecord(manifest)) {
    return { descriptors, buttons, steps: { count: 1, stepped: false }, notes: ['Not a manifest object.'] };
  }

  const schema = isRecord(manifest.schema) ? manifest.schema : null;
  const properties = schema && isRecord(schema.properties) ? schema.properties : {};
  for (const [key, raw] of Object.entries(properties)) {
    const prop = isRecord(raw) ? raw : {};
    const kind = kindForProperty(prop);
    if (!kind) {
      notes.push(`schema.properties.${key}: a ${String(prop.type ?? 'typeless')} property has no single text control; a cue's typed form edits it.`);
      continue;
    }
    const title = typeof prop.title === 'string' && prop.title.length ? prop.title : key;
    const descriptor: FieldDescriptor = {
      key,
      label: title,
      kind,
      defaultValue: defaultFor(prop, kind),
    };
    if (kind === 'select' && Array.isArray(prop.enum)) {
      // A GDD select names each value for the operator in `gddOptions.labels`.
      const labels: Json = isRecord(prop.gddOptions) && isRecord(prop.gddOptions.labels) ? prop.gddOptions.labels : {};
      descriptor.options = prop.enum.map((v) => {
        const label = labels[String(v)];
        return { label: typeof label === 'string' ? label : String(v), value: String(v) };
      });
    }
    if (kind === 'number') {
      if (typeof prop.minimum === 'number') descriptor.min = prop.minimum;
      if (typeof prop.maximum === 'number') descriptor.max = prop.maximum;
      if (typeof prop.multipleOf === 'number' && prop.multipleOf > 0) descriptor.step = prop.multipleOf;
    }
    descriptors.push(descriptor);
  }

  const actions = Array.isArray(manifest.customActions) ? manifest.customActions : [];
  for (const raw of actions) {
    if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id.length) continue;
    const vendor = isRecord(raw.v_noacg) ? raw.v_noacg : null;
    const button: ControlButton = {
      event: raw.id,
      label: typeof raw.name === 'string' && raw.name.length ? raw.name : raw.id,
    };
    if (typeof vendor?.section === 'string' && vendor.section.length) button.section = vendor.section;
    if (vendor?.destructive === true) button.destructive = true;
    // The adjust deltas (a goal's +1) ride the vendor object; the field they move is ALSO a
    // schema property (the exporter writes both), so it is taken OUT of the plain payload keys -
    // one road per field, as the machine's own shape gate requires.
    const adjust: Record<string, number> = {};
    if (isRecord(vendor?.adjust)) {
      for (const [key, delta] of Object.entries(vendor.adjust)) {
        if (key && typeof delta === 'number' && Number.isFinite(delta) && delta !== 0) adjust[key] = delta;
      }
    }
    if (Object.keys(adjust).length) button.adjust = adjust;
    // The SET figures (a score board's "New game") ride the same vendor object, and their fields
    // are schema properties too - so they come out of the plain payload keys for the same reason.
    const set: Record<string, string> = {};
    if (isRecord(vendor?.set)) {
      for (const [key, value] of Object.entries(vendor.set)) {
        if (key && typeof value === 'string' && !(key in adjust)) set[key] = value;
      }
    }
    if (Object.keys(set).length) button.set = set;
    // The ADD and REMOVE lists (a puzzle's Reveal letter) ride the vendor object as list id ->
    // source id; the list is a schema property too, so it comes out of the plain payload keys.
    const listed = new Set<string>([...Object.keys(adjust), ...Object.keys(set)]);
    for (const member of ['add', 'remove'] as const) {
      const map: Record<string, string> = {};
      if (isRecord(vendor?.[member])) {
        for (const [key, source] of Object.entries(vendor[member] as Record<string, unknown>)) {
          if (key && typeof source === 'string' && source && !listed.has(key)) map[key] = source;
        }
      }
      if (Object.keys(map).length) {
        button[member] = map;
        for (const key of Object.keys(map)) listed.add(key);
      }
    }
    // The payload keys are the action schema's properties - the same flat {key: value} map
    // `customAction({id, payload})` takes and `ControlMessage.payload` carries.
    const actionSchema = isRecord(raw.schema) ? raw.schema : null;
    const payloadKeys = (actionSchema && isRecord(actionSchema.properties) ? Object.keys(actionSchema.properties) : [])
      .filter((key) => !listed.has(key));
    if (payloadKeys.length) button.payload = payloadKeys;
    buttons.push(button);
  }
  if (buttons.length) notes.push('OGraf declares no state graph, so every action is offered as live; the Graphic itself decides what a press does.');

  // stepCount semantics (spec §"steps"): 0 = plays in and out by itself; 1/undefined = one step;
  // >1 = that many steps; -1 = dynamic/unknown, which a controller SHOULD still offer step
  // controls for.
  const raw = manifest.stepCount;
  const count = typeof raw === 'number' && Number.isInteger(raw) ? raw : 1;
  const steps = count === -1
    ? { count: -1, stepped: true }
    : { count: Math.max(0, count), stepped: count > 1 };

  return { descriptors, buttons, steps, notes };
}

/**
 * A GRAPHIC'S DECLARED ACTIONS AS ⚡ BUTTONS (E2.1): one per custom action of the OGraf manifest it
 * was imported with (`SpxTemplate.ograf`), named as declared and marked `typed`, so a press sends its
 * arguments in E1's action envelope (control/graphicVerbs.ts) rather than a native payload, and a
 * panel offers it only as E6.1's foreign descriptor. ARRANGE, More and pinning arrange them like any
 * other button and change nothing they do. None for a graphic with no readable declaration.
 */
export function typedActionButtons(ograf: unknown): ControlButton[] {
  const declared = readOgrafDeclared(ograf);
  if (declared.status !== 'ok') return [];
  return declared.description.actions.map((a) => ({ event: a.id, label: a.name, typed: true as const }));
}

/**
 * WHETHER A GRAPHIC'S PAGE CAN RECEIVE A DECLARED ACTION: until E3 mounts a stranger's package and
 * calls its `customAction`, an imported graphic airs as a composed page, which takes an action only
 * through `noacgDispatch` (preview/composeDocument.ts). A page that defines none is offered no ⚡
 * button and no argument form: a press there would read "accepted" and do nothing.
 */
export function receivesTypedActions(js: string): boolean {
  return /\bnoacgDispatch\b/.test(js);
}

/** A graphic's ⚡ buttons: its machine's, then its declared OGraf actions (`typedActionButtons`) when
 *  its page can receive them. The one place both are put together; an action named like a machine
 *  event is left out, so a press never means two things. */
export function graphicButtons(machine: ControlButton[], template: { js: string; ograf?: unknown }): ControlButton[] {
  if (!receivesTypedActions(template.js)) return machine;
  const native = new Set(machine.map((b) => b.event));
  return [...machine, ...typedActionButtons(template.ograf).filter((b) => !native.has(b.event))];
}

/** A property's default in the control's natural type: numbers stay numbers, everything else
 *  stringifies the way SPX sample data does (the descriptor contract in model/fieldModel.ts). */
function defaultFor(prop: Json, kind: FieldKind): string | number {
  const d = prop.default;
  if (kind === 'number') return typeof d === 'number' ? d : Number(d) || 0;
  if (kind === 'toggle') return d === true || d === 'true' ? 'true' : 'false';
  if (d === undefined || d === null) return '';
  return typeof d === 'string' ? d : String(d);
}

/** One call on a Graphic's lifecycle, in the shape the OGraf host document's driver takes
 *  (`src/control/ografHost.ts`): `play(params)`, `stop(params)`, `update(data)`, `custom(id, payload)`. */
export type OgrafLifecycleCall =
  | { call: 'play'; args: [OgrafStepParams] }
  | { call: 'stop'; args: [Record<string, never>] }
  | { call: 'update'; args: [Record<string, string> | TypedValues['values']] }
  | { call: 'custom'; args: [string, Record<string, string> | JsonValue] };

/**
 * The renderer half of the contract: the one ControlMessage every control surface already sends,
 * as the OGraf call it means. Take is `playAction({goto: 0})`, so a replayed or repeated Take
 * lands on the first step instead of advancing; » Next is `playAction({delta: 1})`, which the
 * Graphic resolves against its own `stepCount`; an operator event is `customAction`. A `snap` is
 * NoaCG's machine vocabulary and has no OGraf meaning, so it (like `hello`) maps to nothing.
 * TYPED (E1.2a, E2.1): an update's values envelope is `updateAction(values)` and an event's action
 * envelope is `customAction({id, payload: args})`, each as the JSON it is; an envelope this build
 * cannot read maps to nothing, never to the native strings beside it.
 */
export function ografCallFor(msg: ControlMessage): OgrafLifecycleCall | null {
  switch (msg.t) {
    case 'play':
      return { call: 'play', args: [{ goto: 0 }] };
    case 'next':
      return { call: 'play', args: [{ delta: 1 }] };
    case 'stop':
      return { call: 'stop', args: [{}] };
    case 'update': {
      if (msg.typed === undefined) return { call: 'update', args: [msg.data ?? {}] };
      const typed = readTypedWire(msg);
      return typed && 'values' in typed ? { call: 'update', args: [typed.values] } : null;
    }
    case 'event': {
      if (msg.typed === undefined) return { call: 'custom', args: [msg.event, msg.payload ?? {}] };
      const typed = readTypedWire(msg);
      return typed && 'action' in typed ? { call: 'custom', args: [typed.action, typed.args ?? {}] } : null;
    }
    default:
      return null;
  }
}
