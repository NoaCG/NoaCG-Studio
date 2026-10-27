// THE TYPED FORM (docs/work-specs/playout-ograf-controls/spec.md, E2.1): a foreign OGraf Graphic's
// declared schema read as an operator form, over E1's typed model (model/ografTyped.ts).
//
// The form is GENERATED from the descriptor tree, never designed: a scalar leaf is one control drawn
// by the one field control (components/fields/FieldControl.tsx) through a descriptor made here; an
// object is a group of its properties; a list is its items with Add and remove; a node E1 does not
// carry keeps its value and says why at its exact path. Every edit writes the typed value it means
// (a number stays a number, an enum value keeps its own type and identity), never text read back.
//
// Drafts are kept as they are, valid or not: `typedErrorsByPath` says what is wrong where, and only
// the action that would send it (Take and ✎ Update for the values, one press for an action's
// arguments) refuses. Defaults are the schema's and apply when a value is MADE (`typedSeed`), never
// when a form reopens.
//
// `hidden` means what the pinned standard says (Specification.md, `schema`): its value is left out of
// the Graphic's display name or label, so the form still offers it and `typedSummary` skips it.
//
// Pure: no DOM, so Node tests read it (scripts/ograf-form.test.mjs). Every walk visits each node once.

import type { FieldDescriptor, FieldValue } from '../model/fieldModel';
import type { JsonValue } from '../model/productionData';
import { canonicalJson, typedValuesOf, validateTyped, type TypedNode } from '../model/ografTyped.ts';
import { put } from '../model/profile.ts';

/** Where a value sits: object keys and list indices from the root. */
export type TypedPath = readonly (string | number)[];

const isRecord = (v: unknown): v is { [key: string]: JsonValue } => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

/** The path as E1's validation writes it (`teams[0].score`, '' for the root). */
export function pathKey(path: TypedPath): string {
  let out = '';
  for (const step of path) out = typeof step === 'number' ? `${out}[${step}]` : out ? `${out}.${step}` : step;
  return out;
}

/** The descriptor at `path` (a list index steps into its items), or undefined. */
export function typedNodeAt(node: TypedNode, path: TypedPath): TypedNode | undefined {
  let at: TypedNode | undefined = node;
  for (const step of path) {
    if (!at) return undefined;
    at = typeof step === 'number' ? at.items : at.properties?.find((p) => p.key === step)?.node;
  }
  return at;
}

/** Whether the value at `path` may be absent: an object's property its schema does not require.
 *  The root and a list's items may not. */
export function typedOptionalAt(node: TypedNode, path: TypedPath): boolean {
  const last = path[path.length - 1];
  if (typeof last !== 'string') return false;
  const parent = typedNodeAt(node, path.slice(0, -1));
  const prop = parent?.properties?.find((p) => p.key === last);
  return !!prop && !prop.required;
}

/** The value at `path`, or undefined when nothing is there. */
export function getAt(value: JsonValue | undefined, path: TypedPath): JsonValue | undefined {
  let at: JsonValue | undefined = value;
  for (const step of path) {
    if (typeof step === 'number') at = Array.isArray(at) ? at[step] : undefined;
    else at = isRecord(at) && own(at, step) ? at[step] : undefined;
    if (at === undefined) return undefined;
  }
  return at;
}

/** A shallow copy of a container, own keys kept whatever their name. */
function copy(value: JsonValue | undefined, asList: boolean): JsonValue[] | { [key: string]: JsonValue } {
  if (asList) return Array.isArray(value) ? value.slice() : [];
  const out: { [key: string]: JsonValue } = {};
  if (isRecord(value)) for (const key of Object.keys(value)) put(out, key, value[key]);
  return out;
}

/**
 * `root` with `value` at `path`, copied along the path only; `undefined` removes the value there
 * (an object's key, a list's item). A container missing on the way is made of the step's kind.
 */
export function setAt(root: JsonValue | undefined, path: TypedPath, value: JsonValue | undefined): JsonValue | undefined {
  if (path.length === 0) return value;
  const [step, ...rest] = path;
  const out = copy(root, typeof step === 'number');
  if (Array.isArray(out)) {
    const index = step as number;
    const next = setAt(out[index], rest, value);
    if (next === undefined) {
      if (rest.length === 0) out.splice(index, 1);
    } else out[index] = next;
    return out;
  }
  const key = step as string;
  const next = setAt(own(out, key) ? out[key] : undefined, rest, value);
  if (next === undefined) {
    if (rest.length === 0) delete out[key];
  } else put(out, key, next);
  return out;
}

/** Each failing value path's reasons (E1's validation), for the form to mark where they are. */
export function typedErrorsByPath(node: TypedNode, value: unknown): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const e of validateTyped(node, value)) {
    const list = out.get(e.at);
    if (list) list.push(e.reason);
    else out.set(e.at, [e.reason]);
  }
  return out;
}

/** The operator's word for a node: its declared title, else its key. */
export function typedLabel(node: TypedNode, key: string): string {
  return node.title || key;
}

/** One scalar leaf as the field control draws it: its descriptor, what it shows for a value, and
 *  the typed value an edit means. */
export interface TypedLeaf {
  descriptor: FieldDescriptor;
  show: (value: JsonValue | undefined) => FieldValue;
  read: (edited: FieldValue) => JsonValue;
}

/** A string GDD type the field control draws as a list of lines. */
const LINES = new Set(['multi-line']);

/**
 * THE LEAF CONTROL for a scalar node, or null for a container or a node E1 does not carry. An enum is
 * a select whose option values are the declared values' INDICES, so `1`, `1.0`, `"1"` and `true` stay
 * apart and the edit gives back the declared value itself. A value outside the list is shown as its
 * own option, marked, and never replaced. A URI (a `file-path`) is a text line; only an image path
 * draws the picture picker. A colour with alpha is a text line (the picker has no alpha).
 */
export function typedLeaf(node: TypedNode, key: string, label = typedLabel(node, key)): TypedLeaf | null {
  const base = { key, label };
  if (node.enum) {
    const values = node.enum;
    const options = values.map((v, i) => ({ value: String(i), label: node.labels?.[i] ?? String(v) }));
    const indexOf = (v: JsonValue | undefined) => values.findIndex((x) => x === v);
    return {
      descriptor: { ...base, kind: 'select', defaultValue: node.default === undefined ? '' : String(indexOf(node.default)), options },
      show: (v) => (v === undefined ? '' : indexOf(v) >= 0 ? String(indexOf(v)) : 'other'),
      read: (edited) => values[Number(edited)] ?? null,
    };
  }
  switch (node.type) {
    case 'string': {
      const image = node.asset && /^file-path\/image-path(\/|$)/.test(node.gddType ?? '');
      const kind = image ? 'image' : node.colour === 'rrggbb' ? 'color' : LINES.has(node.gddType ?? '') ? 'lines' : 'text';
      return {
        descriptor: { ...base, kind, defaultValue: typeof node.default === 'string' ? node.default : '' },
        show: (v) => (typeof v === 'string' ? v : v === undefined ? '' : JSON.stringify(v)),
        read: (edited) => String(edited),
      };
    }
    case 'number':
    case 'integer': {
      // No min or max on the descriptor: the field control clamps to them, which would replace a
      // draft out of range with another number. The schema's bounds are judged where it is marked.
      const d: FieldDescriptor = { ...base, kind: 'number', defaultValue: typeof node.default === 'number' ? node.default : '' };
      const step = node.multipleOf ?? (node.type === 'integer' ? 1 : undefined);
      if (step !== undefined) d.step = step;
      return {
        descriptor: d,
        show: (v) => (typeof v === 'number' ? v : v === undefined ? '' : String(v)),
        read: (edited) => (typeof edited === 'number' ? edited : Number(edited)),
      };
    }
    case 'boolean':
      return {
        descriptor: { ...base, kind: 'toggle', defaultValue: node.default === true ? '1' : '0' },
        // Absent, it shows what the Graphic applies: its declared default.
        show: (v) => ((v === undefined ? node.default : v) === true ? '1' : '0'),
        read: (edited) => edited === '1' || edited === 'true' || edited === 1,
      };
    default:
      return null;
  }
}

/** How many of a list's items a form draws before it says how many more there are: a hostile or
 *  huge list never draws ten thousand rows. */
export const TYPED_FORM_ITEMS_SHOWN = 50;

/**
 * THE DISPLAY NAME a rundown row reads for a typed cue: its first two top-level words (a string, a
 * number, an enum's label), skipping every `hidden` property as the pinned standard asks. Empty when
 * there is none, and the row falls back to the graphic's name.
 */
export function typedSummary(fields: TypedNode, values: { [key: string]: JsonValue }): string {
  const words: string[] = [];
  for (const { key, node } of fields.properties ?? []) {
    if (words.length >= 2) break;
    if (node.hidden || !own(values, key)) continue;
    const v = values[key];
    const at = node.enum ? node.enum.findIndex((x) => x === v) : -1;
    const word = at >= 0 && node.labels?.[at] ? node.labels[at] : typeof v === 'string' || typeof v === 'number' ? String(v) : '';
    const line = word.split('\n')[0].replace(/\s+/g, ' ').trim();
    if (line) words.push(line);
  }
  return words.join(' · ');
}

/**
 * A TYPED CUE'S UNSENT VALUES: the top-level keys whose value differs from the envelope its layer
 * last aired (control/airState.ts `typedAired`), compared as canonical JSON, so the editor and the
 * rundown say "not on air yet" for a typed edit as they do for a native one. A bound key is not the
 * cue's value (the tree's goes with ✎ Update), and a layer that aired no envelope here is not judged.
 */
export function typedUnsent(typed: unknown, aired: unknown, bound: Readonly<Record<string, string>>): string[] {
  const mine = typedValuesOf(typed);
  const shown = typedValuesOf(aired);
  if (!mine || !shown) return [];
  const keys = new Set([...Object.keys(mine.values), ...Object.keys(shown.values)]);
  const text = (v: JsonValue | undefined) => (v === undefined ? '' : canonicalJson(v));
  return [...keys].filter((k) => !bound[k] && text(own(mine.values, k) ? mine.values[k] : undefined) !== text(own(shown.values, k) ? shown.values[k] : undefined)).sort();
}
