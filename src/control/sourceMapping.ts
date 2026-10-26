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
// the rule the Sheet reader already applies). E5.1's recipes are below, then E7.1's keyed selectors.
//
// ES2020 library surface, no DOM; `api/` imports it as `../../src/control/sourceMapping.js`.
// scripts/source-mapping.test.mjs drives it.

import { fillList, valueFor } from './contentFormats.js';
import { atPath, isObject, PATH, SEGMENT, type JsonValue, type SourceListAdapter } from './externalSource.js';
import {
  RECIPE_VERSION,
  SELECTION_VERSION,
  sourcePaths,
  sourcePrefix,
  type CollectionRecipe,
  type CueSelection,
  type RecipeFormat,
  type RecipeList,
  type RecipeValue,
  type SourceRecipe,
} from '../model/productionData.js';
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

/** A string, a finite number or a boolean as its text; null for anything else. */
export const scalarText = (value: unknown): string | null => {
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
export const MAX_SEGMENTS = 8;
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
        // A value the formatter rounds to zero is zero: never "-0.0". Compared with the formatter's
        // own text, so its rounding decides, not another one's.
        const negativeZero = nf.format(-0);
        fn = (n) => {
          const text = nf.format(n);
          return text === negativeZero ? nf.format(0) : text;
        };
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
  // A leaf registered as a list is written only through its list's grammar: a single value there
  // would skip it (a schedule line with no "|" airs nothing).
  if (!('columns' in output)) return adapter ? { problem: `this leaf is a ${adapter} list, so its output needs columns` } : cellOf(output, value, format);
  if (!adapter) return { problem: 'no list adapter is registered for this leaf' };
  const read = recipeItems(output, value);
  if ('problem' in read) return read;
  // The separators each list's own grammar splits a line on (contentFormats.ts; credits reads both).
  const separators: [string, string][] = adapter === 'lines' ? [['\t', 'a tab']] : adapter === 'schedule' ? [['|', '|']] : [['\t', 'a tab'], ['|', '|']];
  const rows: string[][] = [];
  for (const item of read.items) {
    const row: string[] = [];
    for (const column of output.columns) {
      const cell = cellOf(column, atPath(item, column.from), format);
      if ('problem' in cell) return cell;
      // A cell holding the list's own separator would split into another cell.
      const split = separators.find(([separator]) => cell.text.includes(separator));
      if (split) return { problem: `${column.from} holds ${split[1]}, which the list reads as a new cell` };
      row.push(cell.text);
    }
    rows.push(row);
  }
  // The destination's own rules: a row the native list would mark is not written.
  const fill = fillList({ adapter, main: 'text' }, rows);
  // The native list drops a first row that reads as its pasted header ("Time | Programme") and
  // blank rows at either end. A recipe's rows are records: one dropped is a record lost, so hold.
  if (fill.rows.length !== rows.length) return { problem: 'a record reads as the list\'s header or as a blank row at its end, which the list would drop' };
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
  /** The production's published collection recipes (`Show.collections`, E7.2b), as stored. */
  collections?: unknown;
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
  // Every bound path of the source counts for clashes, the bare `external.<id>` too (as 0102 counts it).
  const bound = new Set(
    Object.values(o.bindings ?? {})
      .flatMap((fields) => (isObject(fields) ? Object.values(fields) : []))
      .filter((p): p is string => typeof p === 'string' && (p === prefix.slice(0, -1) || p.startsWith(prefix))),
  );
  projectCollections(o.collections, o.sourceId, o.payload, bound, { writes, missing, hold });
  return { writes, missing, unfit, problems, provenance: { sourceId: o.sourceId, recipe: recipe ? { v: RECIPE_VERSION, configRevision: recipe.configRevision } : null } };
}

// ── E7.2b: a collection through the source route ─────────────────────────────────────────────
//
// A live candidate's collection is read by the page from the tree, at `external.<source>.<from>`
// (below), and no field binds that leaf: the cue's selection, not a shared binding, reads it. So
// the route writes each published collection recipe's leaf of this source as the JSON text of the
// payload's object there, one accepted revision whole, and migration 0102 lets exactly those
// leaves through beside the bound ones. Nothing here makes an update row: an unbound leaf moves
// the tree only, so outputs keep receiving resolved values only. What no page could read (not a
// record, no revision, no items, too many, too long) is held here instead of written; a schema
// revision the recipe was not mapped for is written, and each page holds its cards with that
// reason. A leaf above or below a bound path or another collection's leaf is never written: text
// there would replace the subtree, or land inside text.

/** At most this many published recipes are read; a longer list holds every collection leaf. */
export const MAX_PUBLISHED_COLLECTIONS = 64;

function projectCollections(
  raw: unknown,
  sourceId: string,
  payload: unknown,
  bound: ReadonlySet<string>,
  out: { writes: Record<string, string>; missing: string[]; hold: (leaf: string, problem: string) => void },
): void {
  if (raw === undefined || raw === null) return;
  const prefix = `${sourcePrefix(sourceId, 'external')}.`;
  if (!Array.isArray(raw) || raw.length > MAX_PUBLISHED_COLLECTIONS) {
    // Not a leaf (a path cannot hold brackets), so it cannot be mistaken for one.
    out.hold('[collections]', `the production's collections are not a list of at most ${MAX_PUBLISHED_COLLECTIONS}`);
    return;
  }
  const leaves = new Set<string>();
  // Every v 1 recipe of this source with a path counts for clashes, as migration 0102 counts them,
  // even one this build cannot use; only a usable one is written.
  const named: string[] = [];
  for (const entry of raw) {
    // Another source's recipe is never read whole.
    if (!isObject(entry) || entry.sourceId !== sourceId) continue;
    if (entry.v === SELECTION_VERSION && recipePath(entry.from)) named.push(entry.from);
    const read = readCollectionRecipe(entry);
    if (read.status === 'ok') leaves.add(read.recipe.from);
  }
  // A leaf equal to, above or below a bound path or another collection's leaf is never written.
  const taken = [...[...bound].filter((p) => p.startsWith(prefix)).map((p) => p.slice(prefix.length)), ...named];
  // A binding of the whole source sits above every leaf.
  const whole = bound.has(prefix.slice(0, -1));
  const clashes = (leaf: string) => whole || taken.some((other) => (other !== leaf && (other.startsWith(`${leaf}.`) || leaf.startsWith(`${other}.`))) || bound.has(prefix + leaf));
  for (const leaf of [...leaves].sort()) {
    if (clashes(leaf)) continue;
    const value = isObject(payload) ? atPath(payload as JsonValue, leaf) : undefined;
    if (value === undefined) {
      out.missing.push(leaf);
      continue;
    }
    const shape = collectionShape(value);
    if ('reason' in shape) {
      out.hold(leaf, shape.reason);
      continue;
    }
    const text = JSON.stringify(value);
    if (text.length > MAX_COLLECTION_TEXT) {
      out.hold(leaf, `the collection is longer than ${MAX_COLLECTION_TEXT} characters`);
      continue;
    }
    out.writes[prefix + leaf] = text;
  }
}

// ── E7.1: keyed selectors ────────────────────────────────────────────────────────────────────
//
// A cue of a shared card shows ONE entity of a collection, named by its stable key (district plus
// candidate), never by its row: a reordered ranking, or a candidate number another district also
// uses, cannot move it (docs/work-specs/playout-election-package/spec.md, "Selection contract").
// The shared part is the collection recipe (`Show.collections`), the cue's own part its selector
// (`ShowCue.selection`); neither is a shared binding, and nothing here writes the tree.
//
// The collection sits in the production tree at `external.<source>.<from>` as one accepted source
// revision, `{schemaRevision, revision, items}` (or that object as JSON text, which is how a
// source writes a value today). Every field of one card is resolved from that one revision and
// that one record, so a card can never mix two candidates or two revisions. The rules, each one
// red in scripts/keyed-selection.test.mjs when removed:
//   - two items sharing a key invalidate the whole selection: no item is picked between them;
//   - an item without a key part, or a collection that is not one, holds every card;
//   - a key the revision does not hold (an unknown B, a deleted person, a valid empty list) is
//     missing: never another entity's values, never a last good copy of another;
//   - a required field (no fallback) the record lacks invalidates the whole candidate; an optional
//     one takes its declared fallback; every value must pass its field as any value does.
// What a page does with a hold (a card not ready to Take, an aired card that keeps its picture
// with an off-air warning) is control/selectionAir.ts.

// The selector's bounds, each pinned at its edge by scripts/keyed-selection.test.mjs.
const MAX_KEY_PARTS = 4;
const MAX_ITEMS = 5000;
/** A collection that arrives as JSON text is parsed only up to this many characters. */
const MAX_COLLECTION_TEXT = 512 * 1024;
const MAX_KEY_TEXT = 64;

export type CollectionRead =
  | { status: 'ok'; recipe: CollectionRecipe }
  /** A later version: kept as it is, never evaluated. */
  | { status: 'read-only'; version: number }
  | { status: 'invalid'; error: string };

/** Read one collection recipe, or say why it cannot be used. Never throws. */
export function readCollectionRecipe(raw: unknown): CollectionRead {
  const no = (error: string): CollectionRead => ({ status: 'invalid', error });
  if (!isObject(raw)) return no('the collection is not a recipe');
  if (typeof raw.v === 'number' && raw.v > SELECTION_VERSION) return { status: 'read-only', version: raw.v };
  if (raw.v !== SELECTION_VERSION) return no('the collection has no version');
  if (!onlyKeys(raw, ['v', 'id', 'sourceId', 'schemaRevision', 'graphic', 'from', 'key', 'fields'])) {
    return no('the collection has v, id, sourceId, schemaRevision, graphic, from, key and fields only');
  }
  if (typeof raw.id !== 'string' || raw.id === '' || raw.id.length > MAX_KEY_TEXT) return no('the collection has no id');
  if (typeof raw.sourceId !== 'string' || !SEGMENT.test(raw.sourceId)) return no('the collection names no source');
  if (typeof raw.schemaRevision !== 'number' || !Number.isInteger(raw.schemaRevision) || raw.schemaRevision < 0) return no('the collection has no schema revision');
  if (typeof raw.graphic !== 'string' || raw.graphic === '') return no('the collection names no graphic');
  if (!recipePath(raw.from)) return no(`the collection reads a dotted path of at most ${MAX_SEGMENTS} keys`);
  const key = raw.key;
  if (!Array.isArray(key) || key.length < 1 || key.length > MAX_KEY_PARTS || !key.every(recipePath)) return no(`the collection's key is 1 to ${MAX_KEY_PARTS} dotted paths`);
  if (new Set(key).size !== key.length) return no('the collection names a key path twice');
  const fields = raw.fields;
  if (!isObject(fields)) return no('the collection maps no fields');
  const ids = Object.keys(fields);
  if (ids.length < 1 || ids.length > MAX_OUTPUTS) return no(`the collection maps 1 to ${MAX_OUTPUTS} fields`);
  for (const id of ids) {
    const error = valueError(fields[id], `field ${id}`);
    if (error) return no(error);
  }
  return { status: 'ok', recipe: raw as unknown as CollectionRecipe };
}

export type SelectionGate =
  | { status: 'none' }
  | { status: 'ok'; selection: CueSelection; recipe: CollectionRecipe; entity: string }
  /** A selector or a recipe of a later version: the cue is read-only, its record kept byte for byte. */
  | { status: 'read-only'; reason: string }
  /** A selector this build reads but cannot use: not ready, its record kept all the same. */
  | { status: 'invalid'; reason: string };

/** One entity's key as one comparable text: 7 and "7" stay two keys. */
export const entityOf = (key: readonly (string | number)[]): string => JSON.stringify(key);

const keyPart = (value: unknown): value is string | number =>
  (typeof value === 'string' && value !== '' && value.length <= MAX_KEY_TEXT) || (typeof value === 'number' && Number.isFinite(value));

/**
 * THE READ GATE (spec, "Read gate first"): what one cue's selection is to this build. `graphic` is
 * the cue's pool graphic name and `bindings` the production's shared bindings: a mapped field that
 * also follows a shared value would let that value overwrite the cue's candidate, so it is refused.
 */
export function selectionGate(
  cue: { selection?: unknown },
  collections: readonly unknown[] | undefined,
  graphic: string | null,
  bindings: Record<string, Record<string, string>> | undefined,
): SelectionGate {
  const raw = cue.selection;
  if (raw === undefined) return { status: 'none' };
  const later = 'This cue’s live candidate was set up by a later version of NoaCG, so it is read-only here.';
  const no = (reason: string): SelectionGate => ({ status: 'invalid', reason: `This cue’s live candidate cannot be used: ${reason}.` });
  if (!isObject(raw)) return no('its selection is not a record');
  if (typeof raw.v === 'number' && raw.v > SELECTION_VERSION) return { status: 'read-only', reason: later };
  if (raw.v !== SELECTION_VERSION || !onlyKeys(raw, ['v', 'recipe', 'key'])) return no('its selection is not one this version reads');
  const found = (collections ?? []).find((r) => isObject(r) && r.id === raw.recipe);
  if (found === undefined) return no('it names a collection this production does not have');
  const read = readCollectionRecipe(found);
  if (read.status === 'read-only') return { status: 'read-only', reason: later };
  if (read.status === 'invalid') return no(read.error);
  const recipe = read.recipe;
  if (recipe.graphic !== graphic) return no('its collection was made for another graphic');
  const key = raw.key;
  if (!Array.isArray(key) || key.length !== recipe.key.length || !key.every(keyPart)) return no(`its key needs ${recipe.key.length} parts (${recipe.key.join(', ')})`);
  const shared = bindings?.[graphic] ?? {};
  const bound = Object.keys(recipe.fields).find((id) => hasOwn(shared, id));
  if (bound) return no(`field ${bound} also follows a shared value`);
  return { status: 'ok', selection: raw as unknown as CueSelection, recipe, entity: entityOf(key as (string | number)[]) };
}

/** The last few collections read from text, so every card resolved from one tree parses each once. */
const parsedTexts = new Map<string, unknown>();
function parsedText(text: string): unknown {
  if (!parsedTexts.has(text)) {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      value = undefined;
    }
    if (parsedTexts.size >= 4) parsedTexts.delete(parsedTexts.keys().next().value as string);
    parsedTexts.set(text, value);
  }
  return parsedTexts.get(text);
}

export type SelectionResolve =
  | { status: 'ok'; revision: number; entity: string; values: Record<string, string> }
  /**
   * Nothing to show for this entity in what the tree holds now, and why:
   * - `collection`: no usable revision (not arrived, malformed, another schema, duplicate keys);
   * - `missing`: the revision is valid and does not hold this key (an unknown B, a deleted
   *   person, a valid empty list);
   * - `partial`: the record lacks a required value, or a value its field cannot hold.
   * `revision` is the revision judged, null when there is none.
   */
  | { status: 'hold'; why: 'collection' | 'missing' | 'partial'; reason: string; revision: number | null };

/** One revision of a recipe's collection as the tree holds it now, or why there is none. */
function readCollection(recipe: CollectionRecipe, tree: unknown): { revision: number; items: unknown[] } | { why: 'collection'; reason: string; revision: number | null } {
  const hold = (reason: string, revision: number | null) => ({ why: 'collection' as const, reason, revision });
  let value: unknown = isObject(tree) ? atPath(tree as JsonValue, `${sourcePrefix(recipe.sourceId, 'external')}.${recipe.from}`) : undefined;
  if (value === undefined) return hold('the collection has not arrived', null);
  if (typeof value === 'string') {
    if (value.length > MAX_COLLECTION_TEXT) return hold(`the collection is longer than ${MAX_COLLECTION_TEXT} characters`, null);
    value = parsedText(value);
    if (value === undefined) return hold('the collection is not JSON', null);
  }
  const shape = collectionShape(value, recipe.schemaRevision);
  return 'reason' in shape ? hold(shape.reason, shape.revision) : shape;
}

/** One revision of a collection as a value, or why no page can use it: the page's read and the
 *  source route's write (which passes no schema revision) judge it with this one function. */
function collectionShape(value: unknown, schemaRevision?: number): { revision: number; items: unknown[] } | { reason: string; revision: number | null } {
  if (!isObject(value)) return { reason: 'the collection is not a record', revision: null };
  const revision = value.revision;
  if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) return { reason: 'the collection has no revision', revision: null };
  if (schemaRevision !== undefined && value.schemaRevision !== schemaRevision) {
    return { reason: `the collection is schema revision ${JSON.stringify(value.schemaRevision)}, and its fields were mapped for ${schemaRevision}`, revision };
  }
  const items = value.items;
  if (!Array.isArray(items)) return { reason: 'the collection has no items', revision };
  if (items.length > MAX_ITEMS) return { reason: `the collection has more than ${MAX_ITEMS} items`, revision };
  return { revision, items };
}

/**
 * Resolve every mapped field of ONE entity from ONE accepted revision. `fields` are the graphic's
 * fields as the reader sees them, null when it has none. Pure; linear in the collection's size.
 */
export function resolveSelection(o: { recipe: CollectionRecipe; tree: unknown; key: readonly (string | number)[]; fields: FieldDescriptor[] | null }): SelectionResolve {
  const { recipe } = o;
  const hold = (why: 'collection' | 'missing' | 'partial', reason: string, revision: number | null): SelectionResolve => ({ status: 'hold', why, reason, revision });
  const read = readCollection(recipe, o.tree);
  if ('why' in read) return hold(read.why, read.reason, read.revision);
  const { revision, items } = read;
  const wanted = entityOf(o.key);
  let picked: Record<string, JsonValue> | null = null;
  const seen = new Set<string>();
  for (const item of items) {
    if (!isObject(item)) return hold('collection', 'an item of the collection is not a record', revision);
    const parts: (string | number)[] = [];
    for (const path of recipe.key) {
      const part = atPath(item as JsonValue, path);
      if (!keyPart(part)) return hold('collection', `an item of the collection has no ${path}`, revision);
      parts.push(part);
    }
    const entity = entityOf(parts);
    if (seen.has(entity)) return hold('collection', `two items share the key ${recipe.key.map((p, i) => `${p} ${JSON.stringify(parts[i])}`).join(', ')}`, revision);
    seen.add(entity);
    if (entity === wanted) picked = item as Record<string, JsonValue>;
  }
  const named = recipe.key.map((p, i) => `${p} ${JSON.stringify(o.key[i])}`).join(', ');
  if (!picked) return hold('missing', items.length === 0 ? `revision ${revision} holds no candidates` : `revision ${revision} has no ${named}`, revision);
  if (!o.fields) return hold('partial', 'the graphic has no fields', revision);
  const format = formatters();
  const values: Record<string, string> = {};
  for (const [id, spec] of Object.entries(recipe.fields)) {
    const field = o.fields.find((f) => f.key === id);
    if (!field) return hold('partial', `the graphic has no field ${id}`, revision);
    const cell = cellOf(spec, atPath(picked, spec.from), format);
    if ('problem' in cell) return hold('partial', `${named}: ${cell.problem}`, revision);
    const text = valueFor(field, cell.text);
    if (text === null) return hold('partial', `${named}: ${spec.from} does not fit field ${id}`, revision);
    values[id] = text;
  }
  return { status: 'ok', revision, entity: wanted, values };
}

// THE WRITER (E7.2a): what the production page offers a candidate cue, and the check every write
// of a selection passes (model/shows.ts `setCueSelection`, `setShowSelections` run it inside their
// write, on the record each of their two doors writes).

/**
 * Why `cue` may not be written with the selection it now carries, or null. Only a record the read
 * gate takes as usable (`selectionGate`), and only one whose collection names an entity by at least
 * two parts: a candidate number alone is the same in every district, and the reader takes a
 * one-part key, so the writer is where it is refused.
 */
export function selectionWriteError(
  cue: { selection?: unknown },
  collections: readonly unknown[] | undefined,
  graphic: string | null,
  bindings: Record<string, Record<string, string>> | undefined,
): string | null {
  const gate = selectionGate(cue, collections, graphic, bindings);
  if (gate.status === 'none') return 'This cue has no live candidate to save.';
  if (gate.status !== 'ok') return gate.reason;
  if (gate.recipe.key.length < 2) return 'A live candidate is named by its district and its candidate number, and this collection names it by one key.';
  return null;
}

/** Key order as a person reads it: numbers by value (2 before 10), text by its characters, a
 *  number before a text in the same place. */
function byKey(a: readonly (string | number)[], b: readonly (string | number)[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === y) continue;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    if (typeof x !== typeof y) return typeof x === 'number' ? -1 : 1;
    return (x as string) < (y as string) ? -1 : 1;
  }
  return a.length - b.length;
}

/** `selectionWriteError` as the writer's doors ask it (model/shows.ts `SelectionCheck`): on the
 *  record being written, for one of its cues, by the cue's pool graphic name. */
export const selectionCheck = (
  record: { graphics: readonly { id: string; name: string }[]; collections?: readonly unknown[]; bindings?: Record<string, Record<string, string>> },
  cue: { sourceId: string; selection?: unknown },
): string | null => selectionWriteError(cue, record.collections, record.graphics.find((g) => g.id === cue.sourceId)?.name ?? null, record.bindings);

export interface CollectionEntity {
  key: (string | number)[];
  /** The record's first mapped value, as text: the person, for a candidate card. */
  label: string;
}

/**
 * The entities one revision of `recipe`'s collection holds, in key order (never ranking order, so a
 * list a ranking reorders does not move under the operator's pointer), or why there are none. An
 * item without its key parts, or two sharing a key, make the list unusable, as they make
 * `resolveSelection` hold. Linear in the collection's size, sorted after.
 */
export function collectionEntities(recipe: CollectionRecipe, tree: unknown): { entities: CollectionEntity[] } | { problem: string } {
  const read = readCollection(recipe, tree);
  if ('why' in read) return { problem: read.reason };
  const first = Object.values(recipe.fields)[0]?.from;
  const seen = new Set<string>();
  const entities: (CollectionEntity & { entity: string })[] = [];
  for (const item of read.items) {
    if (!isObject(item)) return { problem: 'an item of the collection is not a record' };
    const key: (string | number)[] = [];
    for (const path of recipe.key) {
      const part = atPath(item as JsonValue, path);
      if (!keyPart(part)) return { problem: `an item of the collection has no ${path}` };
      key.push(part);
    }
    const entity = entityOf(key);
    if (seen.has(entity)) return { problem: 'two items share one key' };
    seen.add(entity);
    const shown = first === undefined ? undefined : atPath(item as JsonValue, first);
    entities.push({ key, entity, label: typeof shown === 'string' || typeof shown === 'number' ? String(shown) : '' });
  }
  entities.sort((a, b) => byKey(a.key, b.key));
  return { entities: entities.map(({ key, label }) => ({ key, label })) };
}
