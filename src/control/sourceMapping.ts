// THE ONE SHARED EVALUATOR (docs/work-specs/playout-external-connectors/spec.md, "One shared
// evaluator", phase E4.2): how a source's typed JSON becomes the strings the production tree and
// its native field adapters already understand. The browser reader, the C2 server tick and the
// `/api/data/source` route all resolve a value here, so a value reads the same wherever it is read.
//
// E4.2 holds the IDENTITY projection only. A bound path `external.<id>.<leaf>` reads `<leaf>`
// (dotted object keys) in the payload:
//   - a string, a finite number or a boolean is its own text;
//   - a list is rows through one of the existing list adapters (./contentFormats.ts), named per
//     leaf by the source's registration (`lists`): an item is one cell, a list of scalars is a row
//     of cells, a record is its values in order. A valid empty list writes "" (it clears the field);
//   - anything else (an object, null, a list with no adapter, an item that is not flat) is not a
//     value: the path writes nothing and the field keeps its last good value.
// Then every field bound to that path must accept one and the same form of the text (`pathValue`,
// the rule the Sheet reader already applies). E5.1's recipes are below; E7.1 adds keyed selectors.
//
// ES2020 library surface, no DOM; `api/` imports it as `../../src/control/sourceMapping.js`.
// scripts/source-mapping.test.mjs drives it.

import { fillList, valueFor } from './contentFormats.js';
import { atPath, isObject, PATH, type JsonValue, type SourceListAdapter } from './externalSource.js';
import { RECIPE_VERSION, sourcePaths, sourcePrefix, type RecipeFormat, type RecipeList, type RecipeValue, type SourceRecipe } from '../model/productionData.js';
import type { FieldDescriptor } from '../model/fieldModel';

/**
 * The one value a path writes for every field connected to it, or null. A path is one value in
 * the tree, so when its fields need different forms of the text (a toggle's "1" and a caption's
 * "TRUE"), no single value is right for both and the value is held and reported, never decided by
 * whichever field happens to come last.
 */
export function pathValue(fields: FieldDescriptor[], text: string): string | null {
  const forms = new Set(fields.map((d) => valueFor(d, text)));
  if (forms.has(null) || forms.size > 1) return null;
  return forms.size === 1 ? [...forms][0] : text;
}

/**
 * Every field connected to one path, across the production's graphics. `fieldsOf` answers a pool
 * graphic's fields as the editor draws them (its library version), or null when it has none. The
 * readers, the Connect review and the route all ask this, so they agree on what a value becomes.
 */
export function connectedFields(
  bindings: Record<string, Record<string, string>> | undefined,
  path: string,
  fieldsOf: (graphic: string) => FieldDescriptor[] | null,
): FieldDescriptor[] {
  const out: FieldDescriptor[] = [];
  for (const [graphic, fields] of Object.entries(bindings ?? {})) {
    const ids = Object.keys(fields).filter((fieldId) => fields[fieldId] === path);
    if (ids.length === 0) continue;
    const declared = fieldsOf(graphic) ?? [];
    for (const id of ids) {
      const d = declared.find((f) => f.key === id);
      if (d) out.push(d);
    }
  }
  return out;
}

const scalarText = (value: unknown): string | null => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
};

/** A list item as a row of cells, or null when it is not flat. */
function rowOf(item: unknown): string[] | null {
  const one = scalarText(item);
  if (one !== null) return [one];
  const cells = Array.isArray(item) ? item : isObject(item) ? Object.values(item) : null;
  if (!cells) return null;
  const out: string[] = [];
  for (const cell of cells) {
    const text = scalarText(cell);
    if (text === null) return null;
    out.push(text);
  }
  return out;
}

/** One leaf's value as text before the fields judge it, or null when it is not a value. */
function leafText(value: unknown, adapter: SourceListAdapter | undefined): string | null {
  if (!Array.isArray(value)) return scalarText(value);
  if (!adapter) return null;
  const rows: string[][] = [];
  for (const item of value) {
    const row = rowOf(item);
    if (row === null) return null;
    rows.push(row);
  }
  return fillList({ adapter, main: 'text' }, rows).values.text ?? '';
}

// ── E5.1: the versioned recipe ───────────────────────────────────────────────────────────────
//
// A connector source may carry a declarative recipe (`config.mapping`, productionData
// `SourceRecipe`). A bound leaf the recipe names reads what the recipe says instead of its own
// path; every other bound leaf keeps the identity projection above, so a source with no recipe
// evaluates exactly as before. The steps are fixed and few, in this order: an item identity, one
// equality filter, one sort with the identity as its tie-break, a row limit, then each row's
// cells, each with an optional number or date format and a fallback for a missing or null value.
// No expression, no general path language: a path is dotted object keys.
//
// Typed until the cell: a filter compares typed values (1 is not "1"), a number format takes a
// number only and a date format a time that states its zone, so nothing is guessed from text. The
// result then passes the destination before it is written: a list through its registered native
// adapter, every row of which must fit, and the text through every connected field (`pathValue`).
// Anything that fails holds the leaf's last good value and names what to correct (`problems`);
// a recipe that is invalid, made for another source or config revision, or of a later version
// evaluates nothing at all, so no leaf of the source is written from half a recipe.

// The recipe's bounds. Each is pinned at its edge by scripts/source-mapping.test.mjs.
const MAX_OUTPUTS = 32;
const MAX_COLUMNS = 8;
const MAX_LIMIT = 500;
const MAX_SEGMENTS = 8;
const MAX_DECIMALS = 6;
const MAX_TEXT = 200;
const LOCALE = /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-[A-Z]{2})?$/;
const SHOWS = new Set(['date', 'time', 'datetime']);
// A time that states its zone: a time without one would read in the machine's own zone.
const INSTANT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|([+-])(\d{2}):(\d{2}))$/;

export type RecipeRead =
  | { status: 'none' }
  | { status: 'ok'; recipe: SourceRecipe }
  /** A later version: kept as it is, never evaluated. */
  | { status: 'read-only'; version: number }
  | { status: 'invalid'; error: string };

const hasOwn = (o: object, key: string): boolean => Object.prototype.hasOwnProperty.call(o, key);
const onlyKeys = (o: Record<string, unknown>, keys: string[]): boolean => Object.keys(o).every((k) => keys.includes(k));
const recipePath = (value: unknown): value is string =>
  typeof value === 'string' && PATH.test(value) && value.split('.').length <= MAX_SEGMENTS;
const shortText = (value: unknown): value is string => typeof value === 'string' && value.length <= MAX_TEXT;

// What the runtime formats does not change while it runs: each answer is asked once.
const verdicts = new Map<string, boolean>();
const once = (key: string, ask: () => boolean): boolean => {
  const cached = verdicts.get(key);
  if (cached !== undefined) return cached;
  const known = ask();
  if (verdicts.size < 256) verdicts.set(key, known); // a hostile recipe cannot grow it without end
  return known;
};

function supportedLocale(locale: unknown, kind: 'number' | 'date'): boolean {
  if (typeof locale !== 'string' || !LOCALE.test(locale)) return false;
  // A locale this runtime cannot format would quietly format in another: refuse it instead.
  return once(`${kind}:${locale}`, () =>
    (kind === 'number' ? Intl.NumberFormat.supportedLocalesOf([locale]) : Intl.DateTimeFormat.supportedLocalesOf([locale])).length === 1,
  );
}

function knownZone(zone: unknown): boolean {
  if (typeof zone !== 'string' || zone.length > 64) return false;
  return once(`zone:${zone}`, () => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  });
}

function formatError(f: unknown): string | null {
  if (!isObject(f)) return 'a format is an object';
  if (f.kind !== 'number' && f.kind !== 'date') return 'a format kind is number or date';
  if (!onlyKeys(f, f.kind === 'number' ? ['kind', 'locale', 'decimals'] : ['kind', 'locale', 'timeZone', 'show'])) {
    return f.kind === 'number' ? 'a number format has kind, locale and decimals only' : 'a date format has kind, locale, timeZone and show only';
  }
  if (!supportedLocale(f.locale, f.kind)) return `a ${f.kind} format needs a locale this build formats, like fi-FI (not ${JSON.stringify(f.locale)})`;
  if (f.kind === 'number') {
    const d = f.decimals;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > MAX_DECIMALS) return `decimals is a whole number from 0 to ${MAX_DECIMALS}`;
    return null;
  }
  if (!knownZone(f.timeZone)) return `a date format needs a known time zone, like Europe/Helsinki (not ${JSON.stringify(f.timeZone)})`;
  if (typeof f.show !== 'string' || !SHOWS.has(f.show)) return 'show is date, time or datetime';
  return null;
}

function valueError(v: unknown, where: string): string | null {
  if (!isObject(v) || !onlyKeys(v, ['from', 'format', 'fallback'])) return `${where} has from, format and fallback only`;
  if (!recipePath(v.from)) return `${where} reads a dotted path of at most ${MAX_SEGMENTS} keys`;
  if (v.fallback !== undefined && !shortText(v.fallback)) return `${where}'s fallback is text of at most ${MAX_TEXT} characters`;
  if (v.format !== undefined) {
    const error = formatError(v.format);
    if (error) return `${where}: ${error}`;
  }
  return null;
}

function listError(l: Record<string, unknown>, where: string): string | null {
  if (!onlyKeys(l, ['from', 'id', 'where', 'sort', 'limit', 'columns'])) return `${where} has from, id, where, sort, limit and columns only`;
  if (!recipePath(l.from)) return `${where} reads a dotted path of at most ${MAX_SEGMENTS} keys`;
  if (l.id !== undefined && !recipePath(l.id)) return `${where}'s id is a dotted path`;
  if (l.where !== undefined) {
    const w = l.where;
    if (!isObject(w) || !onlyKeys(w, ['path', 'equals']) || !recipePath(w.path)) return `${where} filters on one path that equals one value`;
    const e = w.equals;
    const literal = shortText(e) || typeof e === 'boolean' || (typeof e === 'number' && Number.isFinite(e));
    if (!literal) return `${where}'s filter value is text, a number or true/false`;
  }
  if (l.sort !== undefined) {
    const s = l.sort;
    if (!isObject(s) || !onlyKeys(s, ['by', 'order']) || !recipePath(s.by) || (s.order !== 'asc' && s.order !== 'desc')) return `${where} sorts by one path, asc or desc`;
    if (l.id === undefined) return `${where} sorts only with an id to break ties`;
  }
  if (l.limit !== undefined && (typeof l.limit !== 'number' || !Number.isInteger(l.limit) || l.limit < 1 || l.limit > MAX_LIMIT)) {
    return `${where}'s limit is a whole number from 1 to ${MAX_LIMIT}`;
  }
  if (!Array.isArray(l.columns) || l.columns.length < 1 || l.columns.length > MAX_COLUMNS) return `${where} has 1 to ${MAX_COLUMNS} columns`;
  for (let i = 0; i < l.columns.length; i += 1) {
    const error = valueError(l.columns[i], `${where} column ${i + 1}`);
    if (error) return error;
  }
  return null;
}

/**
 * Read a source's recipe for this source at this config revision, or say why it cannot be used.
 * Never throws. No recipe is `none` (the identity projection); a later `v` is `read-only`.
 */
export function readSourceRecipe(raw: unknown, sourceId: string, configRevision: number | undefined): RecipeRead {
  // A cleared recipe (null) is no recipe, like an absent one.
  if (raw === undefined || raw === null) return { status: 'none' };
  const no = (error: string): RecipeRead => ({ status: 'invalid', error });
  if (!isObject(raw)) return no('the mapping is not a recipe');
  if (typeof raw.v === 'number' && raw.v > RECIPE_VERSION) return { status: 'read-only', version: raw.v };
  if (raw.v !== RECIPE_VERSION) return no('the mapping has no version');
  if (!onlyKeys(raw, ['v', 'sourceId', 'configRevision', 'outputs'])) return no('the mapping has v, sourceId, configRevision and outputs only');
  if (raw.sourceId !== sourceId) return no('the mapping was made for another source: connect it to this one again');
  if (raw.configRevision !== configRevision) return no(`the mapping was made for config revision ${String(raw.configRevision)}, not ${String(configRevision)}: review it again`);
  const outputs = raw.outputs;
  if (!isObject(outputs)) return no('the mapping has no outputs');
  const leaves = Object.keys(outputs);
  if (leaves.length < 1 || leaves.length > MAX_OUTPUTS) return no(`the mapping has 1 to ${MAX_OUTPUTS} outputs`);
  for (const leaf of leaves) {
    if (!recipePath(leaf)) return no(`output ${JSON.stringify(leaf)} is not a dotted path of at most ${MAX_SEGMENTS} keys`);
    const output = outputs[leaf];
    const error = isObject(output) && 'columns' in output ? listError(output, `output ${leaf}`) : valueError(output, `output ${leaf}`);
    if (error) return no(error);
  }
  return { status: 'ok', recipe: raw as unknown as SourceRecipe };
}

type Cell = { text: string } | { problem: string };

/** One evaluation's formatters, made once per format rather than once per cell. */
function formatters(): (format: RecipeFormat) => (value: number) => string {
  // Keyed by the recipe's own format object, which stays the same for the whole evaluation.
  const made = new WeakMap<RecipeFormat, (value: number) => string>();
  return (format) => {
    let fn = made.get(format);
    if (!fn) {
      if (format.kind === 'number') {
        const nf = new Intl.NumberFormat(format.locale, { minimumFractionDigits: format.decimals, maximumFractionDigits: format.decimals });
        // A value that rounds to zero is zero: never "-0.0".
        fn = (n) => nf.format(Number(n.toFixed(format.decimals)) === 0 ? 0 : n);
      } else {
        const date = format.show !== 'time' ? { year: 'numeric', month: '2-digit', day: '2-digit' } as const : {};
        const time = format.show !== 'date' ? { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' } as const : {};
        const df = new Intl.DateTimeFormat(format.locale, { timeZone: format.timeZone, ...date, ...time });
        fn = (ms) => df.format(ms);
      }
      made.set(format, fn);
    }
    return fn;
  };
}

/** A time that states its zone, as epoch milliseconds; else NaN. A number is not a time: seconds
 *  or milliseconds would be a guess. A date
 *  that does not exist (30 February) is not a time: `Date.parse` would roll it into March. */
function instant(value: JsonValue): number {
  const m = typeof value === 'string' ? INSTANT.exec(value) : null;
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1, 6).map(Number);
  const s = m[6] === undefined ? 0 : Number(m[6]);
  // Fractions of a second are read but not kept: no format shows them.
  const at = new Date(Date.UTC(2000, mo - 1, d, h, mi, s));
  at.setUTCFullYear(y, mo - 1, d); // Date.UTC alone reads years 0 to 99 as 1900 to 1999
  const exists =
    at.getUTCFullYear() === y && at.getUTCMonth() === mo - 1 && at.getUTCDate() === d && at.getUTCHours() === h && at.getUTCMinutes() === mi && at.getUTCSeconds() === s;
  const [oh, om] = m[8] === undefined ? [0, 0] : [Number(m[9]), Number(m[10])];
  if (!exists || oh > 14 || om > 59) return NaN;
  return at.getTime() - (m[8] === '-' ? -1 : 1) * (oh * 60 + om) * 60_000;
}

function cellOf(spec: RecipeValue, value: JsonValue | undefined, format: ReturnType<typeof formatters>): Cell {
  // Zero, false and "" are values; only a value that is not there, or null, takes the fallback.
  if (value === undefined || value === null) return spec.fallback !== undefined ? { text: spec.fallback } : { problem: `${spec.from} has no value` };
  if (!spec.format) {
    const text = scalarText(value);
    return text === null ? { problem: `${spec.from} is not text, a number or true/false` } : { text };
  }
  if (spec.format.kind === 'number') {
    return typeof value === 'number' && Number.isFinite(value) ? { text: format(spec.format)(value) } : { problem: `${spec.from} is not a number` };
  }
  const ms = instant(value);
  return Number.isNaN(ms) ? { problem: `${spec.from} is not a time with its zone` } : { text: format(spec.format)(ms) };
}

type Key = string | number | boolean;
const keyOf = (value: JsonValue | undefined): Key | null =>
  typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : null;
const compareKeys = (a: Key, b: Key): number => {
  if (typeof a !== typeof b) return typeof a < typeof b ? -1 : 1;
  return a < b ? -1 : a > b ? 1 : 0;
};

/**
 * A collection's items as the recipe orders them: every item a record, the identity unique, the
 * filter, then the sort (ties by identity, always ascending), then the limit. E7.1's keyed
 * selector reads the same items by identity.
 */
export function recipeItems(list: RecipeList, collection: JsonValue): { items: Record<string, JsonValue>[] } | { problem: string } {
  if (!Array.isArray(collection)) return { problem: `${list.from} is not a list` };
  const ids = new Map<Record<string, JsonValue>, Key>(); // for the sort's tie-break
  const seen = new Set<Key>(); // 1 and "1" stay two ids
  for (const item of collection) {
    if (!isObject(item)) return { problem: `an item of ${list.from} is not a record` };
    if (list.id === undefined) continue;
    const id = atPath(item, list.id);
    if (typeof id !== 'string' && (typeof id !== 'number' || !Number.isFinite(id))) return { problem: `an item of ${list.from} has no ${list.id}` };
    if (seen.has(id)) return { problem: `two items of ${list.from} share the ${list.id} ${JSON.stringify(id)}` };
    seen.add(id);
    if (list.sort) ids.set(item as Record<string, JsonValue>, id);
  }
  let items = collection as Record<string, JsonValue>[];
  const where = list.where;
  if (where) {
    const kinds = new Set<string>();
    let present = false;
    items = items.filter((item) => {
      const at = atPath(item, where.path);
      if (at !== undefined) present = true;
      if (at !== undefined && at !== null) kinds.add(typeof at);
      return at === where.equals;
    });
    // Nothing matches because no item carries the path any more, or its values are of another kind
    // (7 against "7"): the provider changed its schema, which is a correction to make, not an
    // empty list to air.
    if (items.length === 0 && collection.length > 0 && !present) return { problem: `no item of ${list.from} has ${where.path} to filter on` };
    if (items.length === 0 && kinds.size > 0 && !kinds.has(typeof where.equals)) {
      return { problem: `${where.path} is ${[...kinds].join(' or ')}, but the filter's value is a ${typeof where.equals}` };
    }
  }
  const sort = list.sort;
  if (sort) {
    const keyed: { item: Record<string, JsonValue>; key: Key; id: Key }[] = [];
    let type: string | null = null;
    for (const item of items) {
      const key = keyOf(atPath(item, sort.by));
      if (key === null) return { problem: `an item of ${list.from} has no ${sort.by} to sort by` };
      if (type !== null && typeof key !== type) return { problem: `${sort.by} mixes kinds of value, so it has no order` };
      type = typeof key;
      keyed.push({ item, key, id: ids.get(item)! });
    }
    const dir = sort.order === 'desc' ? -1 : 1;
    keyed.sort((a, b) => dir * compareKeys(a.key, b.key) || compareKeys(a.id, b.id));
    items = keyed.map((k) => k.item);
  }
  if (list.limit !== undefined) items = items.slice(0, list.limit);
  return { items };
}

/** One recipe output as the text its leaf writes, before the fields judge it. */
function outputText(
  output: RecipeValue | RecipeList,
  value: JsonValue,
  adapter: SourceListAdapter | undefined,
  format: ReturnType<typeof formatters>,
): Cell {
  if (!('columns' in output)) return cellOf(output, value, format);
  if (!adapter) return { problem: 'no list adapter is registered for this leaf' };
  const read = recipeItems(output, value);
  if ('problem' in read) return read;
  const [separator, named] = adapter === 'lines' ? ['\t', 'a tab'] : ['|', '|'];
  const rows: string[][] = [];
  for (const item of read.items) {
    const row: string[] = [];
    for (const column of output.columns) {
      const cell = cellOf(column, atPath(item, column.from), format);
      if ('problem' in cell) return cell;
      // A cell holding the list's own separator would split into another cell.
      if (cell.text.includes(separator)) return { problem: `${column.from} holds ${named}, which the list reads as a new cell` };
      row.push(cell.text);
    }
    rows.push(row);
  }
  // The destination's own rules: a row the native list would mark is not written.
  const fill = fillList({ adapter, main: 'text' }, rows);
  const bad = fill.rows.find((r) => r.problem);
  if (bad) return { problem: `${JSON.stringify(bad.text)}: ${bad.problem}` };
  return { text: fill.values.text ?? '' };
}

export interface SourceProjection {
  /** Bound path -> the text it now holds, for every bound path the payload gives a value. */
  writes: Record<string, string>;
  /** Bound leaves the payload does not carry: they keep their value. */
  missing: string[];
  /** Bound leaves whose value is not one, or that their fields cannot all hold: they keep theirs. */
  unfit: string[];
  /** For a recipe output that holds, what to correct, by leaf. */
  problems: Record<string, string>;
  /** Set when the recipe evaluated nothing (a later version, or one that cannot be used): every
   *  bound leaf of the source keeps its last good value. */
  held?: { readOnly: boolean; error: string };
  /** Where the writes come from: the source, and the recipe (null: the identity projection). */
  provenance: { sourceId: string; recipe: { v: 1; configRevision: number } | null };
}

/**
 * Evaluate one source's payload for the production's bindings. `fieldsOf` answers a graphic's
 * fields as the reader sees them, or null when it has none. `mapping` is the registration's
 * recipe as stored (read here) and `configRevision` the registration's. Pure; linear in the
 * payload's size apart from one sort per sorted output.
 */
export function projectSource(o: {
  sourceId: string;
  payload: unknown;
  bindings: Record<string, Record<string, string>> | undefined;
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  lists?: Readonly<Record<string, SourceListAdapter>>;
  mapping?: unknown;
  configRevision?: number;
}): SourceProjection {
  const prefix = `${sourcePrefix(o.sourceId, 'external')}.`;
  const paths = [...new Set(sourcePaths(o.bindings, o.sourceId).map((p) => p.path).filter((p) => p.startsWith(prefix) && p.length > prefix.length))].sort();
  const writes: Record<string, string> = {};
  const missing: string[] = [];
  const unfit: string[] = [];
  const problems: Record<string, string> = {};
  const hold = (leaf: string, problem: string) => {
    problems[leaf] = problem;
    unfit.push(leaf);
  };
  const read = readSourceRecipe(o.mapping, o.sourceId, o.configRevision);
  if (read.status === 'read-only' || read.status === 'invalid') {
    const error = read.status === 'invalid' ? read.error : `the mapping is version ${read.version}; this build reads version ${RECIPE_VERSION}, so it is held read-only`;
    return { writes, missing, unfit: paths.map((p) => p.slice(prefix.length)), problems, held: { readOnly: read.status === 'read-only', error }, provenance: { sourceId: o.sourceId, recipe: null } };
  }
  const recipe = read.status === 'ok' ? read.recipe : null;
  const format = formatters();
  for (const path of paths) {
    const leaf = path.slice(prefix.length);
    const adapter = o.lists && hasOwn(o.lists, leaf) ? o.lists[leaf] : undefined;
    const output = recipe && hasOwn(recipe.outputs, leaf) ? recipe.outputs[leaf] : undefined;
    let text: string | null;
    if (output) {
      if (!isObject(o.payload)) {
        hold(leaf, 'the payload is not a JSON object');
        continue;
      }
      const value = atPath(o.payload as JsonValue, output.from);
      if (value === undefined && ('columns' in output || output.fallback === undefined)) {
        missing.push(leaf);
        continue;
      }
      const cell = outputText(output, value as JsonValue, adapter, format);
      if ('problem' in cell) {
        hold(leaf, cell.problem);
        continue;
      }
      text = cell.text;
    } else {
      const value = atPath(o.payload as JsonValue, leaf);
      if (value === undefined) {
        missing.push(leaf);
        continue;
      }
      text = leafText(value, adapter);
    }
    const result = text === null ? null : pathValue(connectedFields(o.bindings, path, o.fieldsOf), text);
    if (result === null && output) hold(leaf, 'the connected fields cannot all hold this value');
    else if (result === null) unfit.push(leaf);
    else writes[path] = result;
  }
  return { writes, missing, unfit, problems, provenance: { sourceId: o.sourceId, recipe: recipe ? { v: RECIPE_VERSION, configRevision: recipe.configRevision } : null } };
}
