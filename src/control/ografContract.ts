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
//     image path, so it comes back as `text` unless the property says otherwise (`format`,
//     `enum`, or the per-property `v_noacg.kind` hint the exporter writes);
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

/** A schema property's control kind. The honest inversion of the exporter's 3-way collapse. */
function kindForProperty(prop: Json): FieldKind | null {
  const vendor = isRecord(prop.v_noacg) ? prop.v_noacg : null;
  const hinted = typeof vendor?.kind === 'string' ? vendor.kind : null;
  if (hinted && (FIELD_KINDS as readonly string[]).includes(hinted)) return hinted as FieldKind;
  if (Array.isArray(prop.enum) && prop.enum.length) return 'select';
  switch (prop.type) {
    case 'number':
    case 'integer':
      return 'number';
    case 'boolean':
      return 'toggle';
    case 'string':
      if (prop.format === 'color') return 'color';
      if (prop.format === 'uri' || prop.format === 'uri-reference' || prop.contentMediaType) return 'image';
      return 'text';
    default:
      // An object/array/null property has no single-control shape; the standard lets a Graphic
      // declare one, and an operator panel cannot honestly draw it. Listed in `notes`.
      return null;
  }
}

/**
 * Read a manifest's operator surface. `includeHidden` mirrors `fieldDescriptors`' option: the
 * operator panels skip `hidden: true` properties (the spec says they SHOULD NOT label a GUI),
 * the Data panel edits them too.
 */
export function ografContract(manifest: unknown, { includeHidden = false } = {}): OgrafControlContract {
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
    if (prop.hidden === true && !includeHidden) continue;
    const kind = kindForProperty(prop);
    if (!kind) {
      notes.push(`"${key}" declares a ${String(prop.type ?? 'typeless')} property; an operator panel has no control for that shape.`);
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
      descriptor.options = prop.enum.map((v) => ({ label: String(v), value: String(v) }));
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

/** A property's default in the control's natural type: numbers stay numbers, everything else
 *  stringifies the way SPX sample data does (the descriptor contract in model/fieldModel.ts). */
function defaultFor(prop: Json, kind: FieldKind): string | number {
  const d = prop.default;
  if (kind === 'number') return typeof d === 'number' ? d : Number(d) || 0;
  if (kind === 'toggle') return d === true || d === 'true' ? 'true' : 'false';
  if (d === undefined || d === null) return '';
  return typeof d === 'string' ? d : String(d);
}
