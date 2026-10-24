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
// the rule the Sheet reader already applies). E5.1 adds recipes and E7.1 keyed selectors here.
//
// ES2020 library surface, no DOM; `api/` imports it as `../../src/control/sourceMapping.js`.
// scripts/source-mapping.test.mjs drives it.

import { fillList, valueFor } from './contentFormats.js';
import { atPath, isObject, type JsonValue, type SourceListAdapter } from './externalSource.js';
import { sourcePaths, sourcePrefix } from '../model/productionData.js';
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

export interface SourceProjection {
  /** Bound path -> the text it now holds, for every bound path the payload gives a value. */
  writes: Record<string, string>;
  /** Bound leaves the payload does not carry: they keep their value. */
  missing: string[];
  /** Bound leaves whose value is not one, or that their fields cannot all hold: they keep theirs. */
  unfit: string[];
}

/**
 * Evaluate one source's payload for the production's bindings. `fieldsOf` answers a graphic's
 * fields as the reader sees them, or null when it has none. Pure; linear in the payload's size.
 */
export function projectSource(o: {
  sourceId: string;
  payload: unknown;
  bindings: Record<string, Record<string, string>> | undefined;
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  lists?: Readonly<Record<string, SourceListAdapter>>;
}): SourceProjection {
  const prefix = `${sourcePrefix(o.sourceId, 'external')}.`;
  const paths = [...new Set(sourcePaths(o.bindings, o.sourceId).map((p) => p.path).filter((p) => p.startsWith(prefix) && p.length > prefix.length))].sort();
  const writes: Record<string, string> = {};
  const missing: string[] = [];
  const unfit: string[] = [];
  for (const path of paths) {
    const leaf = path.slice(prefix.length);
    const value = atPath(o.payload as JsonValue, leaf);
    if (value === undefined) {
      missing.push(leaf);
      continue;
    }
    const adapter = o.lists && Object.prototype.hasOwnProperty.call(o.lists, leaf) ? o.lists[leaf] : undefined;
    const text = leafText(value, adapter);
    const result = text === null ? null : pathValue(connectedFields(o.bindings, path, o.fieldsOf), text);
    if (result === null) unfit.push(leaf);
    else writes[path] = result;
  }
  return { writes, missing, unfit };
}
