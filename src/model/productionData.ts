// PRODUCTION DATA - the production-scoped tree of live values its graphics read from
// (docs/PRODUCTION_DATA_PLAN.md). This module is the whole semantic contract, and it is PURE:
// it imports nothing, touches no DOM and no storage, so `scripts/production-data.test.mjs` can
// transpile this one file and assert the merge/resolve/diff rules directly - and so a future
// server-side ingress can compile the same source rather than growing a second opinion.
//
// The three rules that matter, all enforced here rather than remembered by callers:
//
// 1. A WRITE IS ABSOLUTE STATE, never intent. `mergePatch` is RFC 7386 JSON Merge Patch:
//    objects merge, `null` deletes a key, arrays replace wholesale. Nothing in this file can
//    express "+1", so a retried write cannot corrupt a value - an operator's +1 button reads
//    the current value and writes the result.
// 2. A BINDING RESOLVES TO ORDINARY FIELD VALUES. `resolveBindings` turns paths into the same
//    `{ fN: "4" }` shape every operator surface already sends, so the template stays a plain
//    field-driven SPX graphic and an export keeps working with no feed at all.
// 3. A MISSING PATH WRITES NOTHING. Blanking a live scorebug because a feed dropped a key is
//    worse than showing the last good value - freeze is not-writing (docs/CLOUD_PLAYOUT.md §7).

/** JSON, the whole value space. No schema, no declared types - see the plan's §2.2. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

/** graphic name -> field id (`f1`) -> production-data path (`match.home.score`). */
export type ProductionBindings = Record<string, Record<string, string>>;

/** What one graphic should be showing: field id -> the string its field takes. */
export type ResolvedValues = Record<string, Record<string, string>>;

/** A bindable leaf of the tree - what the binding picker offers. */
export interface DataLeaf {
  path: string;
  value: JsonValue;
  /** The string this leaf would write into a field (never null - unformattable leaves are
   *  not leaves; see `isLeafValue`). */
  text: string;
}

// ── Paths ───────────────────────────────────────────────────────────────────
// One grammar: dot segments, numeric segments indexing arrays. `match.home.score`,
// `drivers.0.gap`. Deliberately no bracket alternative - two spellings of one path is two
// things to keep in step in the UI, the tests and (later) the SQL.

/** Split a path, or null when it is malformed (empty, or carrying an empty segment). */
export function parsePath(path: string): string[] | null {
  if (typeof path !== 'string') return null;
  const trimmed = path.trim();
  if (trimmed === '') return null;
  const parts = trimmed.split('.');
  if (parts.some((p) => p.trim() === '')) return null;
  return parts.map((p) => p.trim());
}

const isIndex = (segment: string): boolean => /^\d+$/.test(segment);

const isPlainObject = (v: unknown): v is JsonObject =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value at a path, or undefined when any step of the walk is missing. */
export function getPath(data: JsonValue | undefined, path: string): JsonValue | undefined {
  const parts = parsePath(path);
  if (!parts) return undefined;
  let cursor: JsonValue | undefined = data;
  for (const part of parts) {
    if (Array.isArray(cursor)) {
      if (!isIndex(part)) return undefined;
      cursor = cursor[Number(part)];
    } else if (isPlainObject(cursor)) {
      cursor = cursor[part];
    } else {
      return undefined;
    }
    if (cursor === undefined) return undefined;
  }
  return cursor;
}

/**
 * Set a path IMMUTABLY, creating the missing objects on the way down.
 *
 * This is the surface an editor uses (typing into one row of the playground). It exists beside
 * `mergePatch` rather than being expressed through it because merge-patch cannot address an
 * ARRAY ELEMENT at all - `{"drivers":{"0":...}}` would replace the array with an object. A
 * numeric segment against an existing array therefore edits that array in place here, which is
 * the behaviour a row editor has to have. On the wire the same edit costs a whole-array patch;
 * that limit is inherent to RFC 7386 and is recorded in the plan rather than worked around.
 */
export function setPath(data: JsonObject, path: string, value: JsonValue): JsonObject {
  const parts = parsePath(path);
  if (!parts) return data;

  const write = (node: JsonValue | undefined, depth: number): JsonValue => {
    const part = parts[depth];
    const last = depth === parts.length - 1;
    if (Array.isArray(node) && isIndex(part)) {
      const next = node.slice();
      next[Number(part)] = last ? value : write(next[Number(part)], depth + 1);
      return next;
    }
    const base: JsonObject = isPlainObject(node) ? { ...node } : {};
    base[part] = last ? value : write(base[part], depth + 1);
    return base;
  };

  const result = write(data, 0);
  return isPlainObject(result) ? result : data;
}

/** Remove a path IMMUTABLY. A path that is not there leaves the tree untouched. */
export function deletePath(data: JsonObject, path: string): JsonObject {
  const parts = parsePath(path);
  if (!parts) return data;

  const drop = (node: JsonValue | undefined, depth: number): JsonValue | undefined => {
    const part = parts[depth];
    const last = depth === parts.length - 1;
    if (Array.isArray(node) && isIndex(part)) {
      const index = Number(part);
      if (index >= node.length) return node;
      const next = node.slice();
      if (last) next.splice(index, 1);
      else {
        const child = drop(next[index], depth + 1);
        if (child === undefined) return node;
        next[index] = child;
      }
      return next;
    }
    if (!isPlainObject(node) || !(part in node)) return node;
    const next: JsonObject = { ...node };
    if (last) {
      delete next[part];
      return next;
    }
    const child = drop(next[part], depth + 1);
    if (child === undefined) return node;
    next[part] = child;
    return next;
  };

  const result = drop(data, 0);
  return isPlainObject(result) ? result : data;
}

/** The merge patch that writes one path - what a path edit becomes ON THE WIRE.
 *  Returns null for a path carrying an array index, which merge-patch cannot express. */
export function patchForPath(path: string, value: JsonValue): JsonObject | null {
  const parts = parsePath(path);
  if (!parts || parts.some(isIndex)) return null;
  let node: JsonValue = value;
  for (let i = parts.length - 1; i >= 0; i -= 1) node = { [parts[i]]: node };
  return node as JsonObject;
}

// ── The write model ─────────────────────────────────────────────────────────

/**
 * RFC 7386 JSON Merge Patch, applied immutably.
 *
 * - a patch that is not an object REPLACES the target (that is what makes arrays replace
 *   wholesale, which is the RFC's own answer and the one this project wants: no invented
 *   array-element semantics)
 * - a `null` VALUE deletes its key
 * - everything else merges recursively
 *
 * The plpgsql twin planned for the hosted path (docs/PRODUCTION_DATA_PLAN.md §4) must satisfy
 * the same cases; `scripts/production-data.test.mjs` holds the shared conformance table so the
 * two cannot drift silently.
 */
export function mergePatch(target: JsonValue | undefined, patch: JsonValue): JsonValue {
  if (!isPlainObject(patch)) return patch;
  const base: JsonObject = isPlainObject(target) ? { ...target } : {};
  for (const key of Object.keys(patch)) {
    const value = patch[key];
    if (value === null) delete base[key];
    else base[key] = mergePatch(base[key], value);
  }
  return base;
}

/**
 * The merge patch that turns `before` into `after` EXACTLY - including the removals.
 *
 * A merge patch can only say what it names, so "replace the whole tree" (Reset to seed, Clear,
 * applying an edited Raw JSON) is not expressible as the new tree alone: every key the new tree
 * DROPPED would silently survive. This walks both sides and emits an explicit `null` for each
 * one, which is the RFC's delete.
 *
 * It exists because the hosted write path only accepts patches (the merge has to be atomic with
 * the row lock - docs/PRODUCTION_DATA_PLAN.md §4), so a surface that replaces a tree has to say
 * so in that vocabulary rather than reaching past it.
 */
export function replacementPatch(before: JsonValue | undefined, after: JsonObject): JsonObject {
  const out: JsonObject = {};
  const prev = isPlainObject(before) ? before : {};
  for (const key of Object.keys(prev)) {
    if (!(key in after)) out[key] = null;
  }
  for (const key of Object.keys(after)) {
    const next = after[key];
    const old = prev[key];
    if (isPlainObject(next) && isPlainObject(old)) {
      const nested = replacementPatch(old, next);
      // An unchanged branch contributes nothing - the patch stays as small as the change.
      if (Object.keys(nested).length > 0) out[key] = nested;
    } else if (JSON.stringify(old) !== JSON.stringify(next)) {
      out[key] = next;
    }
  }
  return out;
}

/** `mergePatch` at the tree's root, where the result is always an object. */
export function applyPatch(data: JsonObject, patch: JsonObject): JsonObject {
  const merged = mergePatch(data, patch);
  return isPlainObject(merged) ? merged : {};
}

// ── The binding boundary ────────────────────────────────────────────────────

/** True for the values a field can actually take: a scalar, or an array of scalars. */
function isLeafValue(v: JsonValue | undefined): boolean {
  if (v === null || v === undefined) return false;
  if (Array.isArray(v)) return v.length > 0 && v.every((e) => typeof e === 'string' || typeof e === 'number' || typeof e === 'boolean');
  return typeof v !== 'object';
}

/**
 * The string a value writes into an SPX field, or null when it writes NOTHING.
 *
 * Numbers and booleans stringify plainly - thousands separators, decimals and numerals are the
 * template's business, where that formatting already lives, and a second opinion here would
 * fight it. An array of scalars joins with newlines, which is exactly what a `lines`/textarea
 * field is (a ticker binds to `headlines`). Objects and arrays of objects are not values a
 * field can hold: bind a deeper path.
 */
export function formatValue(v: JsonValue | undefined): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : null;
  if (Array.isArray(v)) return isLeafValue(v) ? v.map((e) => String(e)).join('\n') : null;
  return null;
}

/** Every bindable leaf, depth-first, in tree order - the binding picker's list. */
export function flattenLeaves(data: JsonValue | undefined, prefix = ''): DataLeaf[] {
  const out: DataLeaf[] = [];
  const walk = (node: JsonValue | undefined, path: string): void => {
    if (isLeafValue(node)) {
      const text = formatValue(node);
      if (text !== null && path !== '') out.push({ path, value: node as JsonValue, text });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, path === '' ? String(i) : `${path}.${i}`));
      return;
    }
    if (isPlainObject(node)) {
      for (const key of Object.keys(node)) walk(node[key], path === '' ? key : `${path}.${key}`);
    }
  };
  walk(data, prefix);
  return out;
}

/**
 * Resolve every binding against the current tree.
 *
 * A path that is missing, or holds something a field cannot take, contributes NOTHING - the
 * field keeps whatever it last had. That is rule 3 at the top of this file, and it is why the
 * return type carries no "cleared" notion at all: there is nowhere to express one.
 */
export function resolveBindings(data: JsonObject, bindings: ProductionBindings | undefined): ResolvedValues {
  const out: ResolvedValues = {};
  if (!bindings) return out;
  for (const graphic of Object.keys(bindings)) {
    const fields = bindings[graphic];
    if (!fields) continue;
    const values: Record<string, string> = {};
    for (const fieldId of Object.keys(fields)) {
      const text = formatValue(getPath(data, fields[fieldId]));
      if (text !== null) values[fieldId] = text;
    }
    if (Object.keys(values).length > 0) out[graphic] = values;
  }
  return out;
}

/**
 * What actually has to go on the wire: only the fields whose STRING changed, only on the
 * graphics that carry them.
 *
 * This is not an optimisation. The command log caps a production at 50 commands per 5 seconds
 * (migration 0008), and every row is also a Realtime fan-out to the renderer and every open
 * operator page - so a tree with one moving value must cost one row, not one per bound graphic
 * per tick. A value that DISAPPEARED is absent from the result for the same reason it is absent
 * from `resolveBindings`: nothing is written, so nothing goes blank.
 */
export function diffResolved(previous: ResolvedValues, next: ResolvedValues): ResolvedValues {
  const out: ResolvedValues = {};
  for (const graphic of Object.keys(next)) {
    const before = previous[graphic] ?? {};
    const after = next[graphic];
    const changed: Record<string, string> = {};
    for (const fieldId of Object.keys(after)) {
      if (before[fieldId] !== after[fieldId]) changed[fieldId] = after[fieldId];
    }
    if (Object.keys(changed).length > 0) out[graphic] = changed;
  }
  return out;
}

// ── Authoring helpers ───────────────────────────────────────────────────────

/** Compare like an operator reads: case, spaces and punctuation are not the difference. */
const normalize = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '');

/**
 * Every leaf path a field TITLE could mean.
 *
 * Matches the last segment of a leaf path, or the whole path with its dots ignored, so
 * "Score A" finds `match.home.scoreA` and "match.clock" finds itself. `suggestPath` and the
 * bindings table both need this list: the table also has to name what an ambiguous title
 * matched, not just refuse to guess.
 */
export function matchTitle(title: string, leaves: DataLeaf[]): string[] {
  const want = normalize(title);
  if (want === '') return [];
  const hits: string[] = [];
  for (const leaf of leaves) {
    const parts = leaf.path.split('.');
    const last = normalize(parts[parts.length - 1]);
    if (last === want || normalize(leaf.path) === want) hits.push(leaf.path);
  }
  return hits;
}

/**
 * The path a field TITLE probably means, or null.
 *
 * TWO matches return null and bind nothing: this is the API's `ambiguous` doctrine
 * (docs/DATA_API.md) - a guess that is wrong half the time is worse than an empty row the
 * operator fills in once.
 */
export function suggestPath(title: string, leaves: DataLeaf[]): string | null {
  const hits = matchTitle(title, leaves);
  return hits.length === 1 ? hits[0] : null;
}

// ── The press boundary: a control surface writing BACK into the tree ─────────
//
// `formatValue` above is the one direction production data used to need - the tree resolves
// into field strings and the graphics follow. A ± press or an event's `adjust` on a BOUND field
// goes the other way (docs/PRODUCTION_DATA_PLAN.md §2.9, Phase 3): the operator's press moves
// the shared value, and every graphic bound to it follows through the ordinary diff. The three
// functions below are the whole of that direction, and they are here, pure, because both
// dashboards have to agree on them.

/** What a press is doing, for the one case the leaf cannot answer: it is not there yet. */
export type PressVerb = 'adjust' | 'list' | 'set';

/**
 * Read a press's new value back into the type the leaf ALREADY HAD.
 *
 * The press computes a STRING, because that is what a field holds and what `adjustedValue`,
 * `addedValue` and a control's declared `set` all produce. The tree is JSON, so something has
 * to decide which JSON value that string becomes - and the answer that keeps a feed and an
 * operator writing the same production is: whatever type is already there.
 *
 * Without this a scoreboard's `{"score": 4}`, bumped once by the operator, becomes
 * `{"score": "5"}`. The graphic looks identical (`formatValue` stringifies either), and the
 * feed writing `score` as a number next tick flips it back - so the tree's own shape depends on
 * who wrote last. A list is the sharper case: a `lines` field renders `["a","b"]` as two lines,
 * so writing the joined text back would replace the array with one string and every future
 * consumer of that path would see a different shape.
 *
 * This is NOT `reparseLeaf`, which reads the type out of the TEXT (`parseLiteral`) because its
 * caller is a value box where the operator is saying what they mean. A press says nothing about
 * type: the type is already known, and guessing from the text would turn a jersey number
 * `"07"` into the number 7.
 *
 * A leaf that is not there yet has no type to keep, so the VERB decides: `adjust` is arithmetic
 * and starts a number, `add`/`remove` keep a list, and anything else starts a string.
 */
export function retypeLeaf(previous: JsonValue | undefined, text: string, verb: PressVerb = 'set'): JsonValue {
  // AN EMPTY LIST IS STILL A LIST, and `isLeafValue` deliberately says no to one: an empty array
  // writes NOTHING into a field (`formatValue` answers null for it), which is what stops a board
  // going blank. Leaning on it here read that "no" as "not an array" and turned the FIRST press on
  // an empty list into a string - a bingo board's `called` went from `[]` to `"K7"`, and every
  // press after that appended to a string. Empty is exactly the state a list starts a show in.
  if (Array.isArray(previous) && (previous.length === 0 || isLeafValue(previous))) {
    const like = previous[0];
    return text === '' ? [] : text.split('\n').map((line) => retypeScalar(like, line));
  }
  if (previous === undefined || previous === null) {
    if (verb === 'adjust') return Number.isFinite(Number(text)) ? Number(text) : text;
    if (verb === 'list') return text === '' ? [] : text.split('\n');
    return text;
  }
  return retypeScalar(previous, text);
}

/** One scalar, in the type its predecessor had. An unparseable number stays the text rather
 *  than becoming `NaN`, which is not JSON at all. */
function retypeScalar(previous: JsonValue | undefined, text: string): JsonValue {
  if (typeof previous === 'number') return Number.isFinite(Number(text)) ? Number(text) : text;
  if (typeof previous === 'boolean') return text === 'true';
  return text;
}

/** One field's press, resolved to where it lands in the tree and what it says there. */
export interface TreeWrite {
  /** The production-data path the field is bound to. */
  path: string;
  /** The ABSOLUTE value the press computed, as a string (plan §2.5 - never a delta). */
  text: string;
  /** Which press this was, so a path that does not exist yet starts life the right type. */
  verb: PressVerb;
}

/**
 * Apply a press's tree writes, in order, keeping each leaf's type.
 *
 * `setPath` rather than `patchForPath` on purpose: a binding may name an array element
 * (`drivers.0.gap` is the plan's own example) and merge-patch cannot address one at all -
 * `patchForPath` answers null for exactly that reason. Walking the tree here and letting
 * `replacementPatch` say the difference on the wire costs a whole-array patch for an indexed
 * binding and works for every binding; refusing indexed paths at the press would be a stepper
 * that silently does nothing on a legitimate binding.
 *
 * IN ORDER matters: one batch can move the same path twice, and the second write has to land on
 * the first one's value.
 */
export function withTreeWrites(tree: JsonObject, writes: TreeWrite[]): JsonObject {
  let out = tree;
  for (const write of writes) {
    out = setPath(out, write.path, retypeLeaf(getPath(out, write.path), write.text, write.verb));
  }
  return out;
}

/**
 * Split what a press MOVED by whether this production has bound the field.
 *
 * The one rule both dashboards read, because the question
 * "does this +1 write a field or the shared value" must have exactly one answer per production.
 * A bound key leaves the field road entirely - it does not ride the event's payload, it is not
 * mirrored into the cue, and it is not staged - because a bound field is never a cue value
 * (plan §2.7). An unbound key is untouched, which is what keeps every graphic that binds
 * nothing behaving exactly as it did.
 */
export function splitBoundWrites(
  values: Record<string, string>,
  paths: Record<string, string> | undefined,
  verbOf: (field: string) => PressVerb,
): { fields: Record<string, string>; tree: TreeWrite[] } {
  const fields: Record<string, string> = {};
  const tree: TreeWrite[] = [];
  for (const [field, text] of Object.entries(values)) {
    const path = paths && Object.prototype.hasOwnProperty.call(paths, field) ? paths[field] : undefined;
    if (path) tree.push({ path, text, verb: verbOf(field) });
    else fields[field] = text;
  }
  return { fields, tree };
}

/**
 * Read one typed literal the way the playground's value box means it: `4` is a number, `true`
 * a boolean, `[1,2]` / `{"a":1}` real JSON, and anything else the text itself. A quoted string
 * is how an operator says "the TEXT four", which is why `"4"` survives as a string.
 */
export function parseLiteral(text: string): JsonValue {
  const t = text.trim();
  if (t === '') return '';
  if (t === 'true') return true;
  if (t === 'false') return false;
  if (t === 'null') return null;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(t)) return Number(t);
  if (t.startsWith('[') || t.startsWith('{') || (t.startsWith('"') && t.endsWith('"'))) {
    try {
      return JSON.parse(t) as JsonValue;
    } catch {
      return text;
    }
  }
  return text;
}

/**
 * Read an edited value back IN THE TYPE IT ALREADY HAD.
 *
 * `parseLiteral` alone is not enough for a LIST: an array of scalars renders as newline-joined
 * text (that is what a `lines` field takes), so typing in that box would otherwise turn
 * `["a","b"]` into the single string `"a\nb"` — the graphic would look identical while the type
 * changed underneath every future consumer. A value that WAS a list stays a list, split back on
 * its newlines, each element read the same way any other value is.
 */
export function reparseLeaf(previous: JsonValue | undefined, text: string): JsonValue {
  if (Array.isArray(previous) && isLeafValue(previous)) {
    return text === '' ? [] : text.split('\n').map((line) => parseLiteral(line));
  }
  return parseLiteral(text);
}

/** Parse a whole tree from the raw JSON view. Anything that is not an object is refused. */
export function parseDataTree(text: string): { data: JsonObject | null; error: string | null } {
  const t = text.trim();
  if (t === '') return { data: {}, error: null };
  let parsed: unknown;
  try {
    parsed = JSON.parse(t);
  } catch (e) {
    return { data: null, error: (e as Error).message };
  }
  if (!isPlainObject(parsed)) return { data: null, error: 'Production data must be a JSON object at the top level.' };
  return { data: parsed, error: null };
}

// ── Connecting a graphic: one reviewed write of its bindings ────────────────
//
// "Connect data…" (docs/work-specs/data-sources/spec.md, "Whole-graphic matching") PROPOSES a
// mapping for every field of one graphic, the operator reviews it, and one confirmation writes
// it. Nothing here applies anything by itself: a source's arrival never binds a field.

/** A data source's paths: everything under `sheet.<id>`, `feed.<id>` for a news feed, or
 *  `external.<id>` for a connector (control/sheetSource.ts, control/feedSource.ts and the
 *  `/api/data/source` route through control/sourceMapping.ts write them). */
export const sourcePrefix = (sourceId: string, kind: 'sheet' | 'feed' | 'external'): string => `${kind}.${sourceId}`;

const SOURCE_KINDS = ['sheet', 'feed', 'external'] as const;

/** Whether a connected path is one this source writes. Source ids are unique, so the id decides. */
export const isSourcePath = (sourceId: string, path: string): boolean => SOURCE_KINDS.some((kind) => path.startsWith(`${sourcePrefix(sourceId, kind)}.`));

/** The source a connected path follows, or null for a path no source writes. */
export const sourceIdOf = (path: string | undefined): string | null => {
  const [kind, id] = path?.split('.') ?? [];
  return (SOURCE_KINDS as readonly string[]).includes(kind) ? id || null : null;
};

/** A connector source registered by a later build (`config.v` above 1), or carrying a recipe of a
 *  later version (`config.mapping.v` above 1): kept as it is, held read-only, never applied or
 *  edited (src/model/shows.ts `patchShowSource`; the route refuses the first as unsupported and
 *  the evaluator writes nothing from the second). */
export const externalReadOnly = (source: { kind: string; config?: unknown }): boolean => {
  const config = source.config as { v?: unknown; mapping?: { v?: unknown } | null } | undefined;
  const later = (v: unknown, current: number) => typeof v === 'number' && v > current;
  // Only a later version: a malformed record stays editable (the route refuses it either way).
  return source.kind === 'external' && (later(config?.v, 1) || later(config?.mapping?.v, RECIPE_VERSION));
};

// A connector's MAPPING RECIPE (docs/work-specs/playout-api-mapping/spec.md, E5.1): the declarative
// shape persisted in `Show.sources[].config.mapping`, additive optional (no migration). It names
// which payload value each bound leaf `external.<id>.<leaf>` reads and the few bounded steps it
// goes through. It holds paths, literals and locales only: no credential, no expression. Read and
// judged by control/sourceMapping.ts `readSourceRecipe`; a later `v` is kept and never evaluated.

/** A finite number with a fixed count of decimals, or a time, in an explicit locale and zone. */
export type RecipeFormat =
  | { kind: 'number'; locale: string; decimals: number }
  | { kind: 'date'; locale: string; timeZone: string; show: 'date' | 'time' | 'datetime' };

/** One value: the dotted path it reads, an optional format, and the text a missing or null value
 *  writes instead (zero, false and "" are values). */
export interface RecipeValue {
  from: string;
  format?: RecipeFormat;
  fallback?: string;
}

/** A collection: its items' identity, one equality filter, one sort (ties broken by `id`), a row
 *  limit, then each row's cells in order, written through the leaf's registered list adapter. */
export interface RecipeList {
  from: string;
  id?: string;
  where?: { path: string; equals: string | number | boolean };
  sort?: { by: string; order: 'asc' | 'desc' };
  limit?: number;
  columns: RecipeValue[];
}

/** The recipe format this build reads; a later one is kept and never evaluated. */
export const RECIPE_VERSION = 1;

export interface SourceRecipe {
  v: typeof RECIPE_VERSION;
  /** The source and config revision it was made for: a recipe copied onto another source, or one
   *  older than its source's configuration, evaluates nothing until it is rebound. */
  sourceId: string;
  configRevision: number;
  /** Bound leaf -> what it reads. A bound leaf with no output reads its own path (identity). */
  outputs: Record<string, RecipeValue | RecipeList>;
}

/** Every connected path that follows this source, across the production's graphics. */
export function sourcePaths(bindings: ProductionBindings | undefined, sourceId: string): { graphic: string; fieldId: string; path: string }[] {
  const out: { graphic: string; fieldId: string; path: string }[] = [];
  for (const [graphic, fields] of Object.entries(bindings ?? {})) {
    for (const [fieldId, path] of Object.entries(fields)) if (isSourcePath(sourceId, path)) out.push({ graphic, fieldId, path });
  }
  return out;
}

/** One binding write: a path to set, or `null` to unbind. */
export interface BindingEntry {
  graphic: string;
  fieldId: string;
  path: string | null;
}

/**
 * THE ONE BINDING WRITE. Every door that binds a field - the Advanced rows, Bind all by title,
 * Connect data and its field repair - goes through this, so the refusal cannot be bypassed:
 * `refuses` names a field that may not take a path (a field prepared messages use; model/shows.ts
 * decides which). Unbinding is always allowed. Returns the same object when nothing changed.
 */
export function withBindings(
  bindings: ProductionBindings,
  entries: BindingEntry[],
  refuses: (graphic: string, fieldId: string) => boolean,
): { bindings: ProductionBindings; refused: BindingEntry[] } {
  let out = bindings;
  const refused: BindingEntry[] = [];
  for (const entry of entries) {
    const path = entry.path?.trim() ?? '';
    if (path !== '' && refuses(entry.graphic, entry.fieldId)) {
      refused.push(entry);
      continue;
    }
    const current = out[entry.graphic]?.[entry.fieldId];
    if ((current ?? '') === path) continue;
    const forGraphic = { ...(out[entry.graphic] ?? {}) };
    if (path !== '') forGraphic[entry.fieldId] = path;
    else delete forGraphic[entry.fieldId];
    out = { ...out };
    if (Object.keys(forGraphic).length > 0) out[entry.graphic] = forGraphic;
    else delete out[entry.graphic];
  }
  return { bindings: out, refused };
}

/** A value a source offers a graphic: its path, what the operator reads it as, a sample, and the
 *  field it was made for when the source says so (a list adapter's field, a template's Field ID). */
export interface OfferedValue {
  path: string;
  label: string;
  sample: string;
  key?: string;
}

/**
 * A field's proposed connection, as the review shows it.
 *
 * - `key`        the source names this field (a Field ID row, a list adapter's own field)
 * - `name`       the one value whose name matches the field's title
 * - `ambiguous`  several names match: nothing is guessed, the operator picks
 * - `unmatched`  nothing matches
 * - `refused`    prepared messages use this field, so it never follows live data
 */
export interface MappingRow {
  fieldId: string;
  label: string;
  status: 'key' | 'name' | 'ambiguous' | 'unmatched' | 'refused';
  /** The proposed path, or null. */
  path: string | null;
  candidates: string[];
  /** What the field is bound to now, if anything. A different binding is replaced only when the
   *  operator says so. */
  current: string | null;
}

/**
 * Propose a whole graphic's mapping from one source's values: a supplied key first, otherwise a
 * unique name match (`matchTitle`, the rule Bind all by title uses), never across sources and
 * never a guess between two.
 */
export function proposeMapping(
  fields: { key: string; label: string }[],
  offered: OfferedValue[],
  current: Record<string, string>,
  refuses: (fieldId: string) => boolean,
  holds: (fieldId: string, text: string) => boolean = () => true,
): MappingRow[] {
  const leaves: DataLeaf[] = offered.map((o) => ({ path: o.path, value: o.sample, text: o.sample }));
  const byLabel = (title: string): string[] => {
    const want = normalize(title);
    const named = want === '' ? [] : offered.filter((o) => normalize(o.label) === want).map((o) => o.path);
    return [...new Set([...named, ...matchTitle(title, leaves)])];
  };
  return fields.map((field) => {
    const base = { fieldId: field.key, label: field.label, current: current[field.key] ?? null };
    if (refuses(field.key)) return { ...base, status: 'refused', path: null, candidates: [] };
    // A value the field cannot hold is never proposed: a number field does not take "abc".
    const fits = offered.filter((o) => holds(field.key, o.sample));
    const keyed = fits.find((o) => o.key === field.key);
    if (keyed) return { ...base, status: 'key', path: keyed.path, candidates: [keyed.path] };
    const hits = byLabel(field.label).filter((path) => fits.some((o) => o.path === path));
    if (hits.length === 1) return { ...base, status: 'name', path: hits[0], candidates: hits };
    return { ...base, status: hits.length > 1 ? 'ambiguous' : 'unmatched', path: null, candidates: hits };
  });
}

/** The path a reviewed field ends on: the operator's choice, else what it is bound to now (a
 *  different binding is replaced only by a choice), else the proposal. */
export function chosenPath(row: MappingRow, choices: Record<string, string | null>): string | null {
  return Object.prototype.hasOwnProperty.call(choices, row.fieldId) ? choices[row.fieldId] : row.current ?? row.path;
}

/**
 * The bindings one confirmation writes for one graphic: each field's chosen path where it differs
 * from what is bound now. `choices` holds the operator's review (field -> path, or null for "not
 * connected"); a field it does not name keeps the proposal, except that a field already bound
 * elsewhere keeps its binding until the operator chooses to replace it. Refused fields never bind.
 */
export function mappingEntries(graphic: string, rows: MappingRow[], choices: Record<string, string | null>): BindingEntry[] {
  const out: BindingEntry[] = [];
  for (const row of rows) {
    if (row.status === 'refused') continue;
    const chosen = chosenPath(row, choices);
    if (chosen === row.current) continue;
    out.push({ graphic, fieldId: row.fieldId, path: chosen ?? null });
  }
  return out;
}

// A LIVE CANDIDATE SELECTION (docs/work-specs/playout-election-package/spec.md, E7.1): one cue of a
// shared card shows one entity of a source's collection, picked by its stable key, never by its
// row. Two additive optional records, each with its own `v`, so adding them never bumps
// `Show.version`:
//   - `Show.collections[]`, the SHARED collection recipe: the source, its schema revision, the
//     collection leaf, the key paths that together name one entity (district plus candidate), and
//     which record value each field of the graphic shows;
//   - `ShowCue.selection`, the CUE-OWNED selector: the recipe and the entity's key.
// Read and judged by control/sourceMapping.ts (`selectionGate`, `resolveSelection`). E7.1 lands the
// reader and the refusal only: nothing in this build writes either record, and the two write
// doors of model/shows.ts keep both byte for byte (`selectionFrozen`).

/** The collection recipe and the cue selector format this build reads. */
export const SELECTION_VERSION = 1;

export interface CollectionRecipe {
  v: typeof SELECTION_VERSION;
  id: string;
  /** The connector source whose tree namespace holds the collection. */
  sourceId: string;
  /** The schema revision the field map was made for: a collection of another one holds. */
  schemaRevision: number;
  /** The pool graphic (its name, the wire key) whose cues select from it. */
  graphic: string;
  /** The leaf under `external.<sourceId>.` holding `{schemaRevision, revision, items}`. */
  from: string;
  /** The dotted paths that together name one entity, in order: ["district", "candidate"]. */
  key: string[];
  /** Field id -> the record value it shows. A field with no fallback is required. */
  fields: Record<string, RecipeValue>;
}

export interface CueSelection {
  v: typeof SELECTION_VERSION;
  /** The collection recipe's id. */
  recipe: string;
  /** The entity's key, one part per recipe key path. */
  key: (string | number)[];
}

const laterThan = (v: unknown, current: number) => typeof v === 'number' && v > current;

/**
 * Whether a cue's selection is one this build cannot read: the selector or the recipe it names is
 * of a later version. Such a cue is read-only: no Take, Update or edit, and every byte kept. Only
 * a later version: a malformed one is refused by the reader instead, its bytes kept all the same.
 */
export function selectionReadOnly(cue: { selection?: unknown }, collections: readonly unknown[] | undefined): boolean {
  const selection = cue.selection as { v?: unknown; recipe?: unknown } | undefined;
  if (selection === undefined) return false;
  if (laterThan(selection?.v, SELECTION_VERSION)) return true;
  const recipe = (collections ?? []).find((r) => (r as { id?: unknown } | null)?.id === selection?.recipe) as { v?: unknown } | undefined;
  return laterThan(recipe?.v, SELECTION_VERSION);
}

/** The fields a cue's selection shows (its recipe's field map), whatever their state. */
export function selectedFields(cue: { selection?: unknown }, collections: readonly unknown[] | undefined): string[] {
  const selection = cue.selection as { recipe?: unknown } | undefined;
  if (selection === undefined) return [];
  const recipe = (collections ?? []).find((r) => (r as { id?: unknown } | null)?.id === selection?.recipe) as { fields?: unknown } | undefined;
  return recipe && typeof recipe.fields === 'object' && recipe.fields !== null ? Object.keys(recipe.fields) : [];
}

/** Every field some collection recipe maps, per graphic: none of them may also follow a shared
 *  binding, or a shared value would overwrite the cue's own candidate. */
export function collectionFields(collections: readonly unknown[] | undefined, graphic: string): Set<string> {
  const out = new Set<string>();
  for (const r of collections ?? []) {
    const recipe = r as { graphic?: unknown; fields?: unknown } | null;
    if (recipe?.graphic === graphic && typeof recipe.fields === 'object' && recipe.fields !== null) for (const k of Object.keys(recipe.fields)) out.add(k);
  }
  return out;
}

/** The parts of a production record the selection gate reads. */
export interface SelectionRecord {
  cues?: { id: string; selection?: unknown }[];
  collections?: readonly unknown[];
}

/**
 * THE SELECTION READ GATE AT THE WRITE DOORS (E7.1, precedent model/shows.ts `setShowProfile`):
 * model/shows.ts `patchShowChecked` (both of its writes) and ./rundownHistory.ts `replaceRundown`
 * (a personal or a team undo) ask it. This build reads
 * live candidate selections and writes none, so a write that would change one is refused whole:
 * the collection recipes stay byte for byte, every surviving cue keeps its selection as it was, a
 * cue of a later version (`selectionReadOnly`) keeps every byte and is not removed, and no cue
 * gains a selection (a copy of one would need the writer, E7.2a) except one an undo brings back
 * from the history (`restored`), whose bytes are the record's own from before. `before` is `selectionKeep`'s
 * answer for the record before the write. Left to a surface, the first older page to save the
 * production would flatten a selection into the cue's prepared values.
 */
export function selectionKeep(show: SelectionRecord): { collections: string; cues: Map<string, { bytes: string; whole: boolean }> } | null {
  const cues = new Map<string, { bytes: string; whole: boolean }>();
  for (const cue of show.cues ?? []) {
    if (cue.selection === undefined) continue;
    const whole = selectionReadOnly(cue, show.collections);
    cues.set(cue.id, { bytes: JSON.stringify(whole ? cue : cue.selection), whole });
  }
  if (cues.size === 0 && show.collections === undefined) return null;
  return { collections: JSON.stringify(show.collections ?? null), cues };
}

const SELECTION_KEPT = 'This production has live candidate cues this version cannot change, so the edit was not saved.';

export function selectionFrozen(before: ReturnType<typeof selectionKeep>, after: SelectionRecord, restored: ReadonlySet<string> = new Set()): string | null {
  if (!before) return (after.collections !== undefined || (after.cues ?? []).some((c) => c.selection !== undefined && !restored.has(c.id))) ? SELECTION_KEPT : null;
  if (JSON.stringify(after.collections ?? null) !== before.collections) return SELECTION_KEPT;
  const now = new Map((after.cues ?? []).map((c) => [c.id, c] as const));
  for (const [id, kept] of before.cues) {
    const cue = now.get(id);
    if (!cue) {
      if (kept.whole) return SELECTION_KEPT;
      continue;
    }
    if (JSON.stringify(kept.whole ? cue : cue.selection) !== kept.bytes) return SELECTION_KEPT;
  }
  for (const cue of after.cues ?? []) if (cue.selection !== undefined && !before.cues.has(cue.id) && !restored.has(cue.id)) return SELECTION_KEPT;
  return null;
}
