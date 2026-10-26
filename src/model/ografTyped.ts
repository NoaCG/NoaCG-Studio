// TYPED OGRAF DATA (docs/work-specs/playout-ograf-contract/spec.md): the reading side (E1.1) and
// the writing side (E1.2a).
//
// A foreign OGraf Graphic declares its data and its custom actions' arguments as GDD schemas:
// nested objects, arrays, numbers, booleans and typed enums. The native wire carries strings
// (`ControlMessage` `data`), so typed values travel in this module's own versioned envelope,
// beside the native members and never inside them:
//
//   - THE PINNED STANDARD (`OGRAF_STANDARD`): one EBU revision for schema, prose and TypeScript.
//     Every descriptor and envelope names it, and nothing here mixes definitions of two revisions.
//   - DESCRIPTORS (`describeOgraf`): a manifest's `schema` and each action's `schema` read into a
//     typed tree. A keyword or feature this reader does not carry becomes a note at its exact
//     schema path and an `unsupported` node whose value is kept as it is, never a guessed widget.
//   - VALIDATION (`validateTyped`, `validateActionArgs`): a value against its descriptor, every
//     failure at its value path. Null is never a GDD value, so null and missing stay distinct.
//   - THE ENVELOPE (`readTypedEnvelope`) on `ShowCue.typed`, its own `v`. A later version, another
//     revision or a malformed one is read-only: refused, its bytes kept.
//   - THE READ GATE: the write doors (`typedKeep`, `typedFrozen`, asked by model/shows.ts and
//     ./rundownHistory.ts), the page's live presses (`typedSendRefusal`) and the output
//     (`readTypedWire`, `typedOutputGate`). An envelope this build cannot read is refused on air
//     with a reason, and every write keeps its bytes.
//   - MIGRATION (`migrateToTyped`, `nativeOf`): a cue's native strings read through its schema into
//     typed values and back, losslessly or not at all, with a deterministic receipt.
//   - THE WRITER (E1.2a, below the migration): the graphic's declaration (`readOgrafDeclared`), the
//     one write that turns a cue's typed data on or off (model/shows.ts `setCueTyped`, allowed by
//     the door for that cue and those bytes only), the send (`typedForSend`: the cue's values with
//     its bound fields' typed values over them, validated whole before anything is dispatched),
//     and the outputs' capability (`TYPED_READER`, `typedOutputsRefusal`): a page sends an envelope
//     only while every output it can see says it reads one.
//
// Every bound below keeps reading outside input linear: each schema node and each value node is
// visited once, depth and count are capped, and no pattern from a package is ever run.
//
// Pure (model layer): no DOM, so the output renderer, Node and the api's source route share it.
// Runtime imports carry `.js`, as the functions' emit needs (control/sourceMapping.ts imports it).

import { contentHash } from './contentHash.ts';
import type { JsonValue } from './productionData';

/** THE PINNED STANDARD: the EBU OGraf revision every descriptor and envelope is read against. The
 *  seven schema files are the bytes `src/export/targets/ografSchema.ts` was transcribed from
 *  (scripts/ograf-schema-baseline.json records the same hashes); the prose and the TypeScript
 *  definitions are the same commit's. */
export const OGRAF_STANDARD = {
  spec: 'v1',
  repository: 'https://github.com/ebu/ograf',
  commit: 'c821671195a077be13bbb96989d4220eea157b99',
  /** sha256 of each file at that commit, by its path under `v1/`. */
  files: {
    'specification/json-schemas/graphics/schema.json': 'f9bba3e2c26d5ab0e8de29d342b535024d7a6d6c89583143f247a71708ddd1b8',
    'specification/json-schemas/lib/action.json': 'f83db0ad6aadfb5ca590ef89bf6f64f04f9e55ec5a1b0e8c7e96271e470942fa',
    'specification/json-schemas/gdd/object.json': '58b42a14ead4c4147f9e8dd4bfe304f0ba4210272963383a28ea9ea83f491689',
    'specification/json-schemas/gdd/basic-types.json': 'f8e30b149b33d3d1d697654dcc873fa21a7b45a98bc99ee7bcbf00a1f06c5663',
    'specification/json-schemas/gdd/gdd-types.json': 'a8efad17c0a05b6443d229242cbe642b40aa3ab89b56b52d1c9352546e1978c6',
    'specification/json-schemas/lib/constraints/number.json': '9478cd10295099a96dd4db8f89cb320c2396b9e7c9f7154c547fb7e926f9303f',
    'specification/json-schemas/lib/constraints/boolean.json': 'bf8c11ac37d051ce2eb191698c24ebfbb3913ba45b5691fd76bcdc8eca2c87a6',
    'specification/docs/Specification.md': '818fac93554f362f2e6789df241baccb1bdef13ec894837f4f9544f50848ccf1',
    'typescript-definitions/src/apis/graphicsAPI.ts': '631d8216df527290418c35d0c4934461e1ffe189f12965109e9c32c792f591e1',
    'typescript-definitions/src/definitions/types.ts': 'c5a7ae9d98a724cdbf57bc54330b24e6c178c5788948f78e2347007ce065b10f',
    'typescript-definitions/src/main.ts': '5e34b830800c7fe40b53da65a3ec237b06ce056419c11d11fcafb7e0af7fe84e',
  },
} as const;

/** The envelope version this build reads. */
export const TYPED_VERSION = 1;

/** Nesting a schema or a value may have; one more is refused, never followed. */
export const TYPED_MAX_DEPTH = 16;
/** Schema nodes one manifest (data and every action) may declare. */
export const TYPED_MAX_SCHEMA_NODES = 2000;
/** Value nodes one envelope may carry. */
export const TYPED_MAX_VALUE_NODES = 10000;

type Json = Record<string, unknown>;

/** An own enumerable property, whatever its name: `__proto__` included, which plain assignment
 *  would hand to the prototype setter and so drop. */
function put<T>(target: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
}

const isRecord = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const own = (o: object, key: string) => Object.prototype.hasOwnProperty.call(o, key);

// ── Descriptors ──────────────────────────────────────────────────────────────────────────────

export type TypedKind = 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array' | 'unsupported';

/** One schema node, read. `path` is where its value sits (`teams[].score`, '' for the root). */
export interface TypedNode {
  path: string;
  type: TypedKind;
  title?: string;
  gddType?: string;
  hidden?: true;
  /** A `file-path` GDD type: the value names an asset. Its identity is the string, not a picture. */
  asset?: true;
  /** A GDD colour: its exact pattern, checked without running the package's expression. */
  colour?: 'rrggbb' | 'rrggbbaa';
  default?: JsonValue;
  enum?: (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  /** An object's properties in declaration order. */
  properties?: { key: string; required: boolean; node: TypedNode }[];
  /** An object that takes no key it does not declare (`additionalProperties: false`). */
  closed?: true;
  items?: TypedNode;
  /** Why this node is not carried (type `unsupported`). Its value is kept, never edited. */
  unsupported?: string[];
}

/** Something a schema declares that this reader does not carry, at its exact schema path. */
export interface TypedNote {
  at: string;
  reason: string;
}

export interface TypedAction {
  id: string;
  name: string;
  /** The argument schema, or null for an action that takes none (`schema` null or absent). */
  args: TypedNode | null;
}

export interface OgrafDescription {
  standard: string;
  /** The content hash of the manifest's `schema` as declared (canonical JSON), or null without one. */
  schema: string | null;
  /** The data schema, or null when the manifest declares none. */
  fields: TypedNode | null;
  actions: TypedAction[];
  notes: TypedNote[];
}

/**
 * JSON Schema 2020-12's assertion and applicator keywords this reader does not carry: each is a note
 * and makes its node unsupported, since judging a value without it would accept what the Graphic
 * refuses. Any other keyword this reader does not use is an annotation, as the standard's own
 * examples write them (`label`, `order`): it changes no value and is left alone.
 */
const NOT_CARRIED = new Set([
  'allOf', 'anyOf', 'oneOf', 'not', 'if', 'then', 'else', 'dependentSchemas', 'dependentRequired',
  'prefixItems', 'contains', 'minContains', 'maxContains', 'uniqueItems', 'unevaluatedItems',
  'patternProperties', 'propertyNames', 'unevaluatedProperties', 'minProperties', 'maxProperties',
  'const', '$ref', '$dynamicRef', '$recursiveRef',
]);

const TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array']);
const COLOUR: Record<string, { pattern: string; colour: 'rrggbb' | 'rrggbbaa' }> = {
  'color-rrggbb': { pattern: '^#[0-9a-f]{6}$', colour: 'rrggbb' },
  'color-rrggbbaa': { pattern: '^#[0-9a-f]{8}$', colour: 'rrggbbaa' },
};
/** Our own expression for each colour, never the package's. */
const COLOUR_TEST = { rrggbb: /^#[0-9a-f]{6}$/, rrggbbaa: /^#[0-9a-f]{8}$/ };

const isFiniteNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** The GDD type's family, down its own prefix as the standard asks (`file-path/video-path`). */
function gddFamily(gddType: string): string {
  if (COLOUR[gddType]) return gddType;
  return gddType === 'file-path' || gddType.startsWith('file-path/') ? 'file-path' : gddType;
}

interface Budget { nodes: number }

function readNode(raw: unknown, at: string, path: string, depth: number, budget: Budget, notes: TypedNote[]): TypedNode {
  const unsupported = (reason: string): TypedNode => {
    notes.push({ at, reason });
    return { path, type: 'unsupported', unsupported: [reason] };
  };
  if (++budget.nodes > TYPED_MAX_SCHEMA_NODES) return unsupported(`more than ${TYPED_MAX_SCHEMA_NODES} schema nodes`);
  if (depth > TYPED_MAX_DEPTH) return unsupported(`nested deeper than ${TYPED_MAX_DEPTH}`);
  if (!isRecord(raw)) return unsupported('not a schema object');
  const type = raw.type;
  if (typeof type !== 'string' || !TYPES.has(type)) return unsupported('a GDD node needs one type of boolean, string, number, integer, array or object');
  const reasons: string[] = [];
  const note = (key: string, reason: string) => {
    notes.push({ at: `${at}.${key}`, reason });
    reasons.push(`${key}: ${reason}`);
  };
  for (const key of Object.keys(raw)) {
    if (NOT_CARRIED.has(key)) note(key, 'this keyword is not supported');
  }
  const node: TypedNode = { path, type: type as TypedKind };
  if (typeof raw.title === 'string') node.title = raw.title;
  if (raw.hidden === true) node.hidden = true;
  if (typeof raw.gddType === 'string') {
    node.gddType = raw.gddType;
    const family = gddFamily(raw.gddType);
    if (family === 'file-path' && type === 'string') node.asset = true;
    const colour = COLOUR[family];
    if (colour && type === 'string') node.colour = colour.colour;
  }
  // A package's pattern is never run: only the GDD colour patterns, checked by our own expression.
  if (own(raw, 'pattern') && !(node.colour && raw.pattern === COLOUR[node.gddType ?? '']?.pattern)) note('pattern', 'only the GDD colour patterns are supported');
  const numeric = type === 'number' || type === 'integer';
  for (const key of ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf'] as const) {
    if (!numeric || !own(raw, key)) continue;
    const v = raw[key];
    if (!isFiniteNumber(v) || (key === 'multipleOf' && v <= 0)) note(key, 'must be a finite number' + (key === 'multipleOf' ? ' above 0' : ''));
    else node[key] = v;
  }
  for (const [key, applies] of [['minLength', type === 'string'], ['maxLength', type === 'string'], ['minItems', type === 'array'], ['maxItems', type === 'array']] as const) {
    if (!own(raw, key) || !applies) continue;
    if (!isCount(raw[key])) note(key, 'must be a whole number of at least 0');
    else node[key] = raw[key] as number;
  }
  if (own(raw, 'enum')) {
    const values = raw.enum;
    const scalar = type === 'string' || numeric || type === 'boolean';
    if (!scalar || !Array.isArray(values) || values.length === 0 || values.length > TYPED_MAX_SCHEMA_NODES) note('enum', 'only a non-empty list of values of the node’s own type is supported');
    else if (!values.every((v) => matchesType(type as TypedKind, v))) note('enum', `every value must be a ${type}`);
    else node.enum = values.slice() as (string | number | boolean)[];
  }
  if (type === 'object') {
    const props = raw.properties;
    if (!isRecord(props)) note('properties', 'an object node needs its properties');
    const required = raw.required;
    let wanted = new Set<string>();
    if (own(raw, 'required')) {
      if (!Array.isArray(required) || !required.every((k) => typeof k === 'string')) note('required', 'must be a list of property names');
      else wanted = new Set(required as string[]);
    }
    // Closed (`false`) or open (`true`, absent); a schema for the other keys is not carried.
    if (own(raw, 'additionalProperties')) {
      if (raw.additionalProperties === false) node.closed = true;
      else if (raw.additionalProperties !== true) note('additionalProperties', 'only true or false is supported');
    }
    const keys = isRecord(props) ? Object.keys(props) : [];
    for (const key of wanted) if (!isRecord(props) || !own(props, key)) note('required', `"${key}" is not a declared property`);
    node.properties = keys.map((key) => ({
      key,
      required: wanted.has(key),
      node: readNode((props as Json)[key], `${at}.properties.${key}`, path ? `${path}.${key}` : key, depth + 1, budget, notes),
    }));
  }
  if (type === 'array') {
    if (!own(raw, 'items')) note('items', 'an array node needs its items');
    else node.items = readNode(raw.items, `${at}.items`, `${path}[]`, depth + 1, budget, notes);
  }
  if (reasons.length) return { path, type: 'unsupported', unsupported: reasons };
  if (own(raw, 'default')) {
    const fault = readJson(raw.default, TYPED_MAX_DEPTH - depth);
    const errors = fault ? [{ at: path, reason: fault }] : validateTyped(node, raw.default);
    if (errors.length) {
      notes.push({ at: `${at}.default`, reason: `the default does not fit: ${errors[0].reason}` });
      return { path, type: 'unsupported', unsupported: [`default: the default does not fit`] };
    }
    node.default = raw.default as JsonValue;
  }
  return node;
}

/** Read one manifest's data and action schemas against the pinned standard. Never throws; a
 *  manifest of another revision is read the same way, and its notes say what is not carried. */
export function describeOgraf(manifest: unknown): OgrafDescription {
  const notes: TypedNote[] = [];
  const budget: Budget = { nodes: 0 };
  const out: OgrafDescription = { standard: OGRAF_STANDARD.commit, schema: null, fields: null, actions: [], notes };
  if (!isRecord(manifest)) {
    notes.push({ at: '', reason: 'not a manifest object' });
    return out;
  }
  if (own(manifest, 'schema')) {
    const fault = readJson(manifest.schema, TYPED_MAX_DEPTH * 3);
    if (fault) notes.push({ at: 'schema', reason: fault });
    else {
      out.schema = contentHash(canonicalJson(manifest.schema as JsonValue));
      out.fields = readNode(manifest.schema, 'schema', '', 0, budget, notes);
      if (out.fields.type !== 'object' && out.fields.type !== 'unsupported') {
        notes.push({ at: 'schema.type', reason: 'a Graphic’s data schema is an object' });
        out.fields = { path: '', type: 'unsupported', unsupported: ['type: a Graphic’s data schema is an object'] };
      }
    }
  }
  const actions = manifest.customActions;
  if (own(manifest, 'customActions') && !Array.isArray(actions)) notes.push({ at: 'customActions', reason: 'must be a list' });
  if (Array.isArray(actions)) {
    const seen = new Set<string>();
    actions.slice(0, TYPED_MAX_SCHEMA_NODES).forEach((raw, index) => {
      const at = `customActions[${index}]`;
      if (!isRecord(raw) || typeof raw.id !== 'string' || !raw.id) {
        notes.push({ at, reason: 'an action needs an id' });
        return;
      }
      if (seen.has(raw.id)) {
        notes.push({ at: `${at}.id`, reason: `"${raw.id}" is declared twice` });
        return;
      }
      seen.add(raw.id);
      const name = typeof raw.name === 'string' && raw.name ? raw.name : raw.id;
      let args: TypedNode | null = null;
      if (own(raw, 'schema') && raw.schema !== null) {
        const fault = readJson(raw.schema, TYPED_MAX_DEPTH * 3);
        args = fault ? { path: '', type: 'unsupported', unsupported: [fault] } : readNode(raw.schema, `${at}.schema`, '', 0, budget, notes);
        if (fault) notes.push({ at: `${at}.schema`, reason: fault });
      }
      out.actions.push({ id: raw.id, name, args });
    });
  }
  return out;
}

// ── Validation ───────────────────────────────────────────────────────────────────────────────

/** A value's failure at its own path (`teams[2].score`; '' is the whole value). */
export interface TypedError {
  at: string;
  reason: string;
}

function matchesType(type: TypedKind, v: unknown): boolean {
  if (type === 'string') return typeof v === 'string';
  if (type === 'number') return isFiniteNumber(v);
  if (type === 'integer') return isFiniteNumber(v) && Number.isInteger(v);
  if (type === 'boolean') return typeof v === 'boolean';
  if (type === 'object') return isRecord(v);
  if (type === 'array') return Array.isArray(v);
  return true;
}

const kindWord = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'a list' : typeof v === 'object' ? 'an object' : `a ${typeof v}`);

/** Whether `v` is a multiple of `step`, tolerant of binary rounding only (0.3 of 0.1): a few
 *  units in the last place of the quotient, never a fraction a large quotient would hide. */
function multipleOf(v: number, step: number): boolean {
  const q = v / step;
  return Math.abs(q - Math.round(q)) <= 4 * Number.EPSILON * Math.max(1, Math.abs(q));
}

/**
 * Validate a value against its descriptor. An `unsupported` node accepts any JSON value and keeps
 * it; extra object keys are allowed unless the object is closed, as in JSON Schema. Each node is visited once, so the cost is
 * the value's size (bounded by `readJson` before it gets here).
 */
export function validateTyped(node: TypedNode, value: unknown, at = ''): TypedError[] {
  const errors: TypedError[] = [];
  walkValue(node, value, at, errors);
  return errors;
}

function walkValue(node: TypedNode, v: unknown, at: string, errors: TypedError[]): void {
  if (node.type === 'unsupported') return;
  if (!matchesType(node.type, v)) {
    errors.push({ at, reason: `${kindWord(v)} is not a ${node.type === 'integer' ? 'whole number' : node.type}` });
    return;
  }
  if (node.enum && !enumSet(node).has(v as string | number | boolean)) {
    errors.push({ at, reason: `${JSON.stringify(v)} is not one of the declared values` });
    return;
  }
  if (typeof v === 'number') {
    if (node.minimum !== undefined && v < node.minimum) errors.push({ at, reason: `below the minimum ${node.minimum}` });
    if (node.maximum !== undefined && v > node.maximum) errors.push({ at, reason: `above the maximum ${node.maximum}` });
    if (node.exclusiveMinimum !== undefined && v <= node.exclusiveMinimum) errors.push({ at, reason: `not above ${node.exclusiveMinimum}` });
    if (node.exclusiveMaximum !== undefined && v >= node.exclusiveMaximum) errors.push({ at, reason: `not below ${node.exclusiveMaximum}` });
    if (node.multipleOf !== undefined && !multipleOf(v, node.multipleOf)) errors.push({ at, reason: `not a multiple of ${node.multipleOf}` });
  }
  if (typeof v === 'string') {
    // Code points, as JSON Schema counts them.
    const length = node.minLength !== undefined || node.maxLength !== undefined ? Array.from(v).length : 0;
    if (node.minLength !== undefined && length < node.minLength) errors.push({ at, reason: `shorter than ${node.minLength} characters` });
    if (node.maxLength !== undefined && length > node.maxLength) errors.push({ at, reason: `longer than ${node.maxLength} characters` });
    if (node.colour && !COLOUR_TEST[node.colour].test(v)) errors.push({ at, reason: `not a #${node.colour} colour` });
  }
  if (Array.isArray(v)) {
    if (node.minItems !== undefined && v.length < node.minItems) errors.push({ at, reason: `fewer than ${node.minItems} items` });
    if (node.maxItems !== undefined && v.length > node.maxItems) errors.push({ at, reason: `more than ${node.maxItems} items` });
    if (node.items) v.forEach((item, i) => walkValue(node.items as TypedNode, item, `${at}[${i}]`, errors));
  }
  if (isRecord(v) && node.properties) {
    if (node.closed) {
      const declared = declaredKeys(node);
      for (const key of Object.keys(v)) if (!declared.has(key)) errors.push({ at: at ? `${at}.${key}` : key, reason: 'not a declared property' });
    }
    for (const { key, required, node: child } of node.properties) {
      const childAt = at ? `${at}.${key}` : key;
      // Missing and null are two things: missing is allowed unless required, null never is.
      if (!own(v, key)) {
        if (required) errors.push({ at: childAt, reason: 'required' });
        continue;
      }
      walkValue(child, v[key], childAt, errors);
    }
  }
}

/** A closed object's declared keys as a set, made once per node, not once per value. */
const declaredSets = new WeakMap<TypedNode, Set<string>>();
function declaredKeys(node: TypedNode): Set<string> {
  let set = declaredSets.get(node);
  if (!set) declaredSets.set(node, (set = new Set((node.properties ?? []).map((p) => p.key))));
  return set;
}

/** A node's declared values as a set, made once per node: a long list is not searched per value. */
const enumSets = new WeakMap<TypedNode, Set<unknown>>();
function enumSet(node: TypedNode): Set<unknown> {
  let set = enumSets.get(node);
  if (!set) enumSets.set(node, (set = new Set(node.enum)));
  return set;
}

/** Validate a custom action's arguments: none for an action that takes none. */
export function validateActionArgs(action: TypedAction, args: unknown): TypedError[] {
  if (!action.args) return args === undefined ? [] : [{ at: '', reason: `"${action.id}" takes no arguments` }];
  if (args === undefined) return [{ at: '', reason: `"${action.id}" needs its arguments` }];
  const fault = readJson(args, TYPED_MAX_DEPTH);
  return fault ? [{ at: '', reason: fault }] : validateTyped(action.args, args);
}

// ── JSON, bounded ────────────────────────────────────────────────────────────────────────────

/**
 * Why `value` is not plain bounded JSON, or null: only null, booleans, finite numbers, strings,
 * arrays and plain objects, at most `depth` deep and `TYPED_MAX_VALUE_NODES` nodes, each visited
 * once. Iterative, so a hostile nesting cannot overflow the stack before its depth is refused.
 */
export function readJson(value: unknown, depth = TYPED_MAX_DEPTH): string | null {
  const stack: [unknown, number][] = [[value, 0]];
  let nodes = 0;
  while (stack.length) {
    const [v, d] = stack.pop() as [unknown, number];
    if (++nodes > TYPED_MAX_VALUE_NODES) return `more than ${TYPED_MAX_VALUE_NODES} values`;
    if (v === null || typeof v === 'string' || typeof v === 'boolean') continue;
    if (typeof v === 'number') {
      if (!Number.isFinite(v)) return 'a number that is not finite';
      continue;
    }
    if (typeof v !== 'object') return `${typeof v} is not JSON`;
    if (d >= depth) return `nested deeper than ${depth}`;
    if (Array.isArray(v)) {
      for (const item of v) stack.push([item, d + 1]);
      continue;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return 'not a plain object';
    for (const key of Object.keys(v)) stack.push([(v as Json)[key], d + 1]);
  }
  return null;
}

/** JSON with every object's keys sorted: one text per value, whatever order it was built in.
 *  Only for values `readJson` accepted. */
export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

// ── The envelope ─────────────────────────────────────────────────────────────────────────────

/** A cue's typed values, outside its native `values`. */
export interface TypedValues {
  v: typeof TYPED_VERSION;
  kind: 'values';
  /** `OGRAF_STANDARD.commit`. */
  standard: string;
  /** `describeOgraf(manifest).schema`: the schema the values were made for. */
  schema: string;
  values: { [key: string]: JsonValue };
}

/** A custom action's typed arguments, the same envelope for a press. */
export interface TypedActionCall {
  v: typeof TYPED_VERSION;
  kind: 'action';
  standard: string;
  schema: string;
  action: string;
  args?: JsonValue;
}

export type TypedEnvelope = TypedValues | TypedActionCall;

export type TypedRead =
  | { status: 'absent' }
  | { status: 'ok'; envelope: TypedEnvelope }
  | { status: 'read-only'; reason: string };

const VALUES_KEYS = new Set(['v', 'kind', 'standard', 'schema', 'values']);
const ACTION_KEYS = new Set(['v', 'kind', 'standard', 'schema', 'action', 'args']);
const LATER = 'was saved by a later version of NoaCG';
const OTHER_STANDARD = 'was made for another OGraf revision';
const UNREADABLE = 'cannot be read';

/** Read an envelope as stored or as it arrived. Never throws; `undefined` is absent. */
export function readTypedEnvelope(raw: unknown): TypedRead {
  if (raw === undefined) return { status: 'absent' };
  if (!isRecord(raw)) return { status: 'read-only', reason: UNREADABLE };
  const v = raw.v;
  if (typeof v === 'number' && Number.isInteger(v) && v > TYPED_VERSION) return { status: 'read-only', reason: LATER };
  if (v !== TYPED_VERSION) return { status: 'read-only', reason: UNREADABLE };
  if (raw.standard !== OGRAF_STANDARD.commit) return { status: 'read-only', reason: OTHER_STANDARD };
  if (typeof raw.schema !== 'string' || !raw.schema) return { status: 'read-only', reason: UNREADABLE };
  if (raw.kind === 'values') {
    if (Object.keys(raw).some((k) => !VALUES_KEYS.has(k))) return { status: 'read-only', reason: UNREADABLE };
    if (!isRecord(raw.values) || readJson(raw.values)) return { status: 'read-only', reason: UNREADABLE };
    return { status: 'ok', envelope: raw as unknown as TypedValues };
  }
  if (raw.kind === 'action') {
    if (Object.keys(raw).some((k) => !ACTION_KEYS.has(k))) return { status: 'read-only', reason: UNREADABLE };
    if (typeof raw.action !== 'string' || !raw.action) return { status: 'read-only', reason: UNREADABLE };
    if (own(raw, 'args') && readJson(raw.args)) return { status: 'read-only', reason: UNREADABLE };
    return { status: 'ok', envelope: raw as unknown as TypedActionCall };
  }
  return { status: 'read-only', reason: UNREADABLE };
}

/** A cue's typed data: values only. An action envelope on a cue is malformed, so read-only. */
function readCueTyped(cue: { typed?: unknown }): TypedRead {
  const read = readTypedEnvelope(cue.typed);
  return read.status === 'ok' && read.envelope.kind !== 'values' ? { status: 'read-only', reason: UNREADABLE } : read;
}

/** A values envelope this build reads, or null (absent, an action, or read-only). */
export function typedValuesOf(raw: unknown): TypedValues | null {
  const read = readTypedEnvelope(raw);
  return read.status === 'ok' && read.envelope.kind === 'values' ? read.envelope : null;
}

/** Whether a cue's typed data is one this build cannot read: the whole cue is then read-only. */
export function typedReadOnly(cue: { typed?: unknown }): boolean {
  return readCueTyped(cue).status === 'read-only';
}

/**
 * Why a LIVE PRESS (an event, a ±, a Snap) may not go to a layer airing this cue, or null. Typed
 * data airs through Take and ✎ Update only (`typedForSend`); a figure counted or read from a typed
 * cue's native strings would air something the cue does not hold, and typed actions are E2's and
 * E6.2's. A pinned block presses here too.
 */
export function typedSendRefusal(cue: { typed?: unknown }): string | null {
  const read = readCueTyped(cue);
  if (read.status === 'absent') return null;
  if (read.status === 'read-only') return readOnlyWords(read.reason);
  return 'Live controls do not reach typed data yet.';
}

const readOnlyWords = (reason: string) => `This cue’s typed data ${reason}, so it is read-only here.`;

/**
 * THE OUTPUT'S READER: null for a native message (no `typed` member), which goes on exactly as it
 * came; the values of a readable values envelope on an `update`, which this output renders as they
 * are; a reason for any other envelope, which it neither renders nor turns into strings. The native
 * members beside it (`data`, `appearance`) are not read here.
 */
export function readTypedWire(msg: unknown): { values: TypedValues['values'] } | { reason: string } | null {
  if (!isRecord(msg) || !own(msg, 'typed')) return null;
  const read = readTypedEnvelope(msg.typed);
  if (read.status === 'absent') return null;
  if (read.status !== 'ok') return { reason: `This output cannot read this command’s data (it ${read.reason}): reload this output.` };
  if (read.envelope.kind === 'values' && msg.t === 'update') return { values: read.envelope.values };
  return { reason: 'This output cannot show typed data yet: reload this output.' };
}

/** What an output keeps of typed data, graphic by graphic (src/output/main.ts). */
export interface TypedOutputState {
  /** Graphics refused, with the reason (E1.1's hold). */
  held: Map<string, string>;
  /** Graphics whose data on air came from an envelope: their data is the envelope's, not strings. */
  airing: Set<string>;
}

/** What the output does with one command: refused, applied as it came, applied with typed values
 *  in place of its native data, or applied without its data (`dropData`). `changed`: the held set
 *  moved, which the READY line shows. */
export type TypedGate =
  | { apply: false; changed: boolean }
  | { apply: true; changed: boolean; values?: TypedValues['values']; dropData?: true };

/**
 * THE OUTPUT'S GATE, one command at a time. A readable values envelope on an `update` airs its
 * values and marks the graphic typed. Any other envelope is refused and holds its graphic (E1.1):
 * while held, only a `stop` and a native `update` (which gives it its data again and lifts the
 * hold) reach it, so a Take's `play` after its refused `update` never airs the previous cue's
 * values. On a typed graphic, a native `update` a data road wrote (`src`: the API, a feed, the
 * tick) is applied WITHOUT its data: those are bound fields resolved to native text, which would
 * replace typed values with strings, and typed bound values reach air with the next ✎ Update. An
 * operator page's native `update` (no `src`: a native cue taken on that layer) replaces the typed
 * data and ends it.
 */
export function typedOutputGate(state: TypedOutputState, graphic: string, msg: unknown): TypedGate {
  const read = readTypedWire(msg);
  if (read && 'reason' in read) {
    const changed = state.held.get(graphic) !== read.reason;
    state.held.set(graphic, read.reason);
    state.airing.delete(graphic);
    return { apply: false, changed };
  }
  if (read) {
    const changed = state.held.delete(graphic);
    state.airing.add(graphic);
    return { apply: true, changed, values: read.values };
  }
  const verb = isRecord(msg) ? msg.t : undefined;
  if (state.held.has(graphic)) {
    if (verb !== 'update') return { apply: verb === 'stop', changed: false };
    state.held.delete(graphic);
    return { apply: true, changed: true };
  }
  if (verb === 'update' && state.airing.has(graphic)) {
    if (isRecord(msg) && own(msg, 'src')) return { apply: true, changed: false, dropData: true };
    state.airing.delete(graphic);
  }
  return { apply: true, changed: false };
}

// ── The write doors ──────────────────────────────────────────────────────────────────────────

/** The parts of a production record the typed gate reads. */
export interface TypedRecord {
  cues?: { id: string; typed?: unknown }[];
}

export interface TypedKept {
  cues: Map<string, { bytes: string; whole: boolean }>;
  /** Every cue the record held: a copy is a cue that was not one of them. */
  ids: Set<string>;
}

/** What a write must keep: each cue's envelope, and a read-only cue's every byte. */
export function typedKeep(show: TypedRecord): TypedKept | null {
  const cues = new Map<string, { bytes: string; whole: boolean }>();
  for (const cue of show.cues ?? []) {
    if (cue.typed === undefined) continue;
    const whole = typedReadOnly(cue);
    cues.set(cue.id, { bytes: JSON.stringify(whole ? cue : cue.typed), whole });
  }
  return cues.size ? { cues, ids: new Set((show.cues ?? []).map((c) => c.id)) } : null;
}

export const TYPED_KEPT = 'This production has typed cues this version cannot change, so the edit was not saved.';

/**
 * THE TYPED GATE AT THE WRITE DOORS (precedent ./profile.ts `readShowProfile`, enforced like
 * ./productionData.ts `selectionFrozen`): model/shows.ts `patchShowChecked` (both of its writes)
 * and ./rundownHistory.ts `replaceRundown` ask it. A write is refused whole when it would change a
 * cue's envelope, change or remove a read-only cue in any byte, or give a cue an envelope it did not
 * have, with three exceptions: the writer's own cues (`write`, cue id to the exact envelope bytes it
 * writes, null for none: model/shows.ts `setCueTyped`), a cue an undo brings back (`restored`),
 * whose bytes are the record's own from before, and a new cue whose envelope is byte for byte one
 * this record already held (a copy, which carries data the writer made). A read-only cue is never
 * the writer's.
 */
export function typedFrozen(
  before: TypedKept | null,
  after: TypedRecord,
  restored: ReadonlySet<string> = new Set(),
  write: ReadonlyMap<string, string | null> = new Map(),
): string | null {
  const now = new Map((after.cues ?? []).map((c) => [c.id, c] as const));
  for (const [id, bytes] of write) {
    const cue = now.get(id);
    if (!cue || before?.cues.get(id)?.whole || (cue.typed === undefined ? null : JSON.stringify(cue.typed)) !== bytes) return TYPED_KEPT;
  }
  const held = new Set<string>();
  for (const [id, kept] of before?.cues ?? []) {
    if (!kept.whole) held.add(kept.bytes);
    if (write.has(id)) continue;
    const cue = now.get(id);
    if (!cue) {
      if (kept.whole) return TYPED_KEPT;
      continue;
    }
    if (JSON.stringify(kept.whole ? cue : cue.typed) !== kept.bytes) return TYPED_KEPT;
  }
  for (const cue of after.cues ?? []) {
    if (cue.typed === undefined || before?.cues.has(cue.id) || restored.has(cue.id) || write.has(cue.id)) continue;
    if (before?.ids.has(cue.id) || typedReadOnly(cue) || !held.has(JSON.stringify(cue.typed))) return TYPED_KEPT;
  }
  return null;
}

// ── Migration ────────────────────────────────────────────────────────────────────────────────

/** What a migration did, in an order that does not depend on how the input was built. */
export interface TypedReceipt {
  v: typeof TYPED_VERSION;
  standard: string;
  schema: string | null;
  /** The content hash of the native values read (canonical JSON). */
  input: string;
  /** The content hash of the typed values written, or null when nothing was written. */
  output: string | null;
  /** Fields read into a typed value, sorted. */
  converted: string[];
  /** Fields kept as their native string: a key the schema does not declare, or an unsupported node. */
  kept: string[];
  /** Why the migration wrote nothing, field by field, sorted by field. */
  refused: TypedError[];
}

const sortedErrors = (errors: TypedError[]) => errors.slice().sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.reason < b.reason ? -1 : a.reason > b.reason ? 1 : 0));

/** A native string as its node's typed value, or why not. Read by the declared type only, and
 *  only when writing it back gives the same string: nothing is guessed, nothing is lost. */
function fromNative(node: TypedNode, text: string): { value: JsonValue } | { reason: string } {
  if (node.type === 'string') return { value: text };
  if (node.type === 'number' || node.type === 'integer') {
    const n = text.trim() === text && text !== '' ? Number(text) : NaN;
    if (!Number.isFinite(n) || String(n) !== text) return { reason: `"${text}" is not a ${node.type === 'integer' ? 'whole number' : 'number'} written plainly` };
    return { value: n };
  }
  if (node.type === 'boolean') {
    if (text === 'true' || text === 'false') return { value: text === 'true' };
    return { reason: `"${text}" is neither true nor false` };
  }
  // An object or a list travels on the native wire as its JSON text.
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { reason: 'not JSON text' };
  }
  const fault = readJson(parsed);
  if (fault) return { reason: fault };
  if (JSON.stringify(parsed) !== text) return { reason: 'not JSON written compactly' };
  return { value: parsed as JsonValue };
}

/** A typed value as the native wire's string. */
function toNative(value: JsonValue): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

/**
 * MIGRATE a cue's native strings to typed values through its Graphic's described schema: each
 * declared field by its declared type, a key the schema does not declare and an unsupported
 * field kept as their string. Every string must come back from `nativeOf` byte for byte, and the
 * result must validate whole, or nothing is written and the receipt says why. Deterministic: the
 * same inputs give the same envelope and receipt, whatever order they were built in.
 */
export function migrateToTyped(description: OgrafDescription, native: Record<string, string>): { envelope: TypedValues | null; receipt: TypedReceipt } {
  const input = contentHash(canonicalJson(native));
  const receipt: TypedReceipt = { v: TYPED_VERSION, standard: OGRAF_STANDARD.commit, schema: description.schema, input, output: null, converted: [], kept: [], refused: [] };
  const fields = description.fields;
  if (!fields || !description.schema || fields.type !== 'object' || !fields.properties) {
    receipt.refused.push({ at: '', reason: fields?.type === 'unsupported' ? 'the Graphic’s data schema is not supported' : 'the Graphic declares no data schema' });
    return { envelope: null, receipt };
  }
  const declared = new Map(fields.properties.map((p) => [p.key, p.node] as const));
  const values: { [key: string]: JsonValue } = {};
  for (const key of Object.keys(native).sort()) {
    const text = native[key];
    const node = declared.get(key);
    if (typeof text !== 'string') {
      receipt.refused.push({ at: key, reason: 'not a native string' });
      continue;
    }
    if (!node || node.type === 'unsupported') {
      put(values, key, text);
      receipt.kept.push(key);
      continue;
    }
    const read = fromNative(node, text);
    if ('reason' in read) receipt.refused.push({ at: key, reason: read.reason });
    else {
      put(values, key, read.value);
      receipt.converted.push(key);
    }
  }
  if (!receipt.refused.length) {
    // A kept string of a declared node is not judged: an unsupported node accepts what it has.
    receipt.refused.push(...validateTyped(fields, values));
    // Each field fits on its own; the whole must fit the envelope its reader accepts.
    const fault = readJson(values);
    if (fault) receipt.refused.push({ at: '', reason: fault });
  }
  if (receipt.refused.length) {
    receipt.refused = sortedErrors(receipt.refused);
    return { envelope: null, receipt };
  }
  const envelope: TypedValues = { v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema: description.schema, values };
  receipt.output = contentHash(canonicalJson(values));
  return { envelope, receipt };
}

/** The native strings a typed envelope stands for: the way back, the inverse of `migrateToTyped`. */
export function nativeOf(envelope: TypedValues): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(envelope.values).sort()) put(out, key, toNative(envelope.values[key]));
  return out;
}

// ── The writer (E1.2a) ───────────────────────────────────────────────────────────────────────

/** The declaration's version this build reads. */
export const DECLARED_VERSION = 1;

/**
 * A GRAPHIC'S OGRAF DECLARATION, on its template (`SpxTemplate.ograf`): the manifest of the package
 * it was imported from, kept whole as its JSON and never rewritten, for its schema and its actions.
 * Its own `v`. Only a stranger's manifest within this reader's bounds is kept
 * (model/importTemplate.ts); E3 adds the package's own bytes.
 */
export interface OgrafDeclared {
  v: typeof DECLARED_VERSION;
  manifest: { [key: string]: JsonValue };
}

export type DeclaredRead =
  | { status: 'absent' }
  /** `fields` is the data schema when it is an object this reader carries, else null: the graphic
   *  then takes no typed data. */
  | { status: 'ok'; description: OgrafDescription; fields: TypedNode | null }
  | { status: 'read-only'; reason: string };

const DECLARED_KEYS = new Set(['v', 'manifest']);
/** Each declaration is described once: every render and every press asks. */
const declaredReads = new WeakMap<object, DeclaredRead>();

/** Read a graphic's declaration as stored. Never throws; `undefined` is absent. */
export function readOgrafDeclared(raw: unknown): DeclaredRead {
  if (raw === undefined) return { status: 'absent' };
  if (!isRecord(raw)) return { status: 'read-only', reason: UNREADABLE };
  const known = declaredReads.get(raw);
  if (known) return known;
  let read: DeclaredRead;
  const v = raw.v;
  if (typeof v === 'number' && Number.isInteger(v) && v > DECLARED_VERSION) read = { status: 'read-only', reason: LATER };
  else if (v !== DECLARED_VERSION || Object.keys(raw).some((k) => !DECLARED_KEYS.has(k)) || !isRecord(raw.manifest) || readJson(raw.manifest, TYPED_MAX_DEPTH * 3)) read = { status: 'read-only', reason: UNREADABLE };
  else {
    const description = describeOgraf(raw.manifest);
    const fields = description.schema && description.fields?.type === 'object' && description.fields.properties ? description.fields : null;
    read = { status: 'ok', description, fields };
  }
  declaredReads.set(raw, read);
  return read;
}

/** Why `envelope` is not a cue's typed data for this declaration, or null: readable, made for this
 *  schema, and valid against it whole. */
export function typedValuesFault(declared: DeclaredRead, envelope: unknown): string | null {
  if (declared.status !== 'ok' || !declared.fields) return 'This cue’s graphic takes no typed data.';
  const read = readTypedEnvelope(envelope);
  if (read.status !== 'ok' || read.envelope.kind !== 'values') return 'This typed data cannot be read.';
  if (read.envelope.schema !== declared.description.schema) return 'This typed data was made for another version of its graphic.';
  const error = validateTyped(declared.fields, read.envelope.values)[0];
  return error ? `${error.at || 'The data'}: ${error.reason}.` : null;
}

/**
 * A graphic's fields as its published panel carries them (control/hostedControl.ts
 * `buildPanelSpec`): a field its OGraf declaration names is marked `typed`, so the source route
 * writes a source's value there as the JSON it is (api/_lib/dataTick.ts `descriptorsOf`,
 * control/sourceMapping.ts `projectSource`). Every other graphic's fields go as they are.
 */
export function typedPublishedFields<F extends { field: string }>(fields: F[], ograf: unknown): (F | (F & { typed: true }))[] {
  const declared = readOgrafDeclared(ograf);
  if (declared.status !== 'ok' || !declared.fields) return fields;
  const keys = new Set((declared.fields.properties ?? []).map((p) => p.key));
  return fields.map((f) => (keys.has(f.field) ? { ...f, typed: true as const } : f));
}

/** The longest typed member one command may carry, as UTF-8 JSON: the size a source report's row
 *  keeps to (0101's 64 KiB), so a typed command is never the one row far larger than the rest. */
export const TYPED_MAX_SEND_BYTES = 65536;


/**
 * THE TYPED TARGET ADAPTER, the page's half (E1.2a; the route's is control/sourceMapping.ts
 * `projectSource`): a value from the production tree as a typed field's value, or why not. The
 * value is taken as the JSON it is, never read from text, and must fit the field's declared node.
 * A field whose node this reader does not carry keeps the value it has: nothing from outside
 * replaces it unjudged.
 */
export function typedTargetValue(node: TypedNode, value: unknown): { value: JsonValue } | { reason: string } {
  if (node.type === 'unsupported') return { reason: 'its declared type is not one this version reads' };
  const fault = readJson(value);
  if (fault) return { reason: fault };
  const error = validateTyped(node, value)[0];
  return error ? { reason: error.at ? `${error.at} ${error.reason}` : error.reason } : { value: value as JsonValue };
}

/** What a Take or an Update of one cue sends for its typed data. */
export type TypedSend =
  | { status: 'none' }
  | { status: 'ok'; typed: TypedValues }
  | { status: 'refused'; reason: string };

/**
 * THE SEND (E1.2a): the envelope a Take or an Update of this cue carries, or why nothing may go.
 * `bound` is each bound field's value as the TYPED TARGET ADAPTER read it from the production tree
 * (control/sourceMapping.ts `typedTargetValue`): a value, or a reason, or absent for a path that
 * holds nothing yet, where the cue's own value stays (a missing path writes nothing). The cue's
 * values with the bound ones over them must validate whole against the graphic's schema and fit
 * one command; otherwise nothing is dispatched and the cue's stored data is untouched.
 */
export function typedForSend(
  cue: { typed?: unknown },
  declared: DeclaredRead,
  bound: ReadonlyMap<string, { value: JsonValue } | { reason: string }> = new Map(),
): TypedSend {
  const read = readCueTyped(cue);
  if (read.status === 'absent') return { status: 'none' };
  if (read.status === 'read-only') return { status: 'refused', reason: readOnlyWords(read.reason) };
  const envelope = read.envelope as TypedValues;
  if (declared.status !== 'ok' || !declared.fields) return { status: 'refused', reason: 'This cue’s graphic takes no typed data.' };
  const values: TypedValues['values'] = {};
  for (const key of Object.keys(envelope.values)) put(values, key, envelope.values[key]);
  for (const [key, got] of bound) {
    if ('reason' in got) return { status: 'refused', reason: `${key}: ${got.reason}.` };
    put(values, key, got.value);
  }
  const typed: TypedValues = { v: TYPED_VERSION, kind: 'values', standard: OGRAF_STANDARD.commit, schema: envelope.schema, values };
  const whole = typedValuesFault(declared, typed);
  if (whole) return { status: 'refused', reason: whole };
  if (new TextEncoder().encode(JSON.stringify(typed)).length > TYPED_MAX_SEND_BYTES) return { status: 'refused', reason: `This cue’s typed data is larger than one command takes (${TYPED_MAX_SEND_BYTES / 1024} KiB).` };
  return { status: 'ok', typed };
}

/** The envelope version an output reads, advertised in its Presence entry (control/livePath.ts
 *  `LiveEntry.typed`). An output that says none, or less, is sent no envelope. */
export const TYPED_READER = TYPED_VERSION;

/** What the capability check reads of one Presence entry. */
export interface TypedPeer {
  kind: string;
  name?: string;
  engine?: string;
  typed?: number;
}

/**
 * THE OUTPUTS' CAPABILITY (E1.2a): why a published production's page may not send an envelope now,
 * or null. Every output it sees must say it reads this version; one that does not (an older build)
 * would refuse it, or worse, apply the native members beside it. While its Presence is not joined
 * the page cannot see its outputs, so nothing typed goes. An unpublished production has no output.
 */
export function typedOutputsRefusal(published: boolean, status: string, peers: readonly TypedPeer[]): string | null {
  if (!published) return null;
  if (status !== 'joined') return 'Typed data waits until this page can see its outputs.';
  const old = peers.filter((p) => p.kind === 'output' && !(typeof p.typed === 'number' && p.typed >= TYPED_READER));
  if (!old.length) return null;
  const names = old.map((p) => p.name || p.engine || 'an output');
  return names.length === 1 ? `Reload ${names[0]}: it cannot read typed data yet.` : `Reload ${names.length} outputs (${names.slice(0, 3).join(', ')}): they cannot read typed data yet.`;
}
