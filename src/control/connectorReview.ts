// THE CONNECT REVIEW FOR A CONNECTOR (docs/work-specs/playout-api-mapping/spec.md, E5.2): what a
// JSON sample offers a graphic's fields, and the one write a confirmation makes.
//
// A sample is read for the review only (the agent's `op: "sample"`, or the hosted fetcher for a
// public endpoint) and never applied: the review evaluates it with the one shared evaluator
// (./sourceMapping.ts `projectSource`) for the PREVIEW monitor, exactly as the route will evaluate
// the provider's answers once the mapping is saved.
//
// Ordinary operation needs no path syntax: every value in the sample is offered under its own
// words ("home score"), a list of records to a list field with its columns picked from the
// records' keys, and the C1/C5 matcher (model/productionData `proposeMapping`) proposes a match
// per field, a key naming the field first. The confirmation persists a v 1 recipe in the
// source's `config.mapping`, rebuilt from known keys only and let through only when
// `readSourceRecipe` reads it, so no other key (a token, say) can sit in a show or an export.
//
// Pure: no DOM, no storage. The write itself is model/shows.ts `connectConnectorSource`, which
// fences it on the configuration this review read. scripts/connector-review.test.mjs drives it.

import { mappingEntries, proposeMapping, sourcePaths, sourcePrefix, withBindings, type BindingEntry, type MappingRow, type OfferedValue, type ProductionBindings, type RecipeList, type RecipeValue, type SourceRecipe } from '../model/productionData.ts';
import { isObject, readExternalRegistration, SEGMENT, type SourceListAdapter } from './externalSource.ts';
import { MAX_SEGMENTS, readSourceRecipe, scalarText } from './sourceMapping.ts';
/** How much of a sample is offered, so a hostile one costs a bounded walk. */
export const MAX_OFFERS = 200;
export const MAX_COLLECTIONS = 20;
const MAX_VISITS = 20_000;

/** How many cells a row of each list carries (control/contentFormats.ts grammars). */
export const LIST_CELLS: Record<SourceListAdapter, number> = { lines: 1, schedule: 2, credits: 2 };

/** A list of records in the sample: offered to a list field, its columns picked from `keys`. */
export interface JsonCollection {
  /** The bound path, `external.<id>.<from>`. */
  path: string;
  from: string;
  label: string;
  /** The first record's keys holding a text, a number or true/false, in order. */
  keys: string[];
  /** The record key: a key every record carries with a value no other record has, or null. */
  id: string | null;
}

export interface JsonOffers {
  scalars: OfferedValue[];
  collections: JsonCollection[];
}

const words = (keys: string[]) => keys.join(' ').replace(/[_-]+/g, ' ').trim();

/** The record key of a list: `id` or `key` when unique, else the first unique key, else none. */
function recordKey(items: Record<string, unknown>[], keys: string[]): string | null {
  const unique = (key: string) => {
    const seen = new Set<unknown>();
    for (const item of items) {
      const v = item[key];
      if ((typeof v !== 'string' && (typeof v !== 'number' || !Number.isFinite(v))) || seen.has(v)) return false;
      seen.add(v);
    }
    return true;
  };
  const preferred = keys.filter((k) => /^(id|key)$/i.test(k));
  return [...preferred, ...keys.filter((k) => !preferred.includes(k))].find(unique) ?? null;
}

/**
 * What a sample offers, under its own words: every text, number or true/false value (a key that
 * names a field, `f0`, is that field's stable key), and every list of records. Values inside a
 * list are not offered one by one: a list is read whole, by its columns. Bounded: at most
 * MAX_OFFERS values and MAX_COLLECTIONS lists, as deep as a recipe path reads (MAX_SEGMENTS keys), and a walk of at most MAX_VISITS
 * values, so a hostile sample costs a bounded walk.
 */
export function jsonOffers(sourceId: string, sample: unknown): JsonOffers {
  const prefix = sourcePrefix(sourceId, 'external');
  const scalars: OfferedValue[] = [];
  const collections: JsonCollection[] = [];
  let visits = 0;
  const walk = (value: Record<string, unknown>, keys: string[]) => {
    for (const [key, child] of Object.entries(value)) {
      if ((visits += 1) > MAX_VISITS || scalars.length >= MAX_OFFERS) return;
      if (!SEGMENT.test(key)) continue;
      const at = [...keys, key];
      const from = at.join('.');
      const text = scalarText(child);
      if (text !== null) {
        scalars.push({ path: `${prefix}.${from}`, label: words(at), sample: text, ...(/^f\d+$/.test(key) ? { key } : {}) });
      } else if (Array.isArray(child)) {
        if (collections.length >= MAX_COLLECTIONS || child.length === 0 || !child.every(isObject)) continue;
        visits += child.length;
        const items = child as Record<string, unknown>[];
        const fields = Object.keys(items[0]).filter((k) => SEGMENT.test(k) && scalarText(items[0][k]) !== null);
        if (fields.length > 0) collections.push({ path: `${prefix}.${from}`, from, label: words(at), keys: fields, id: recordKey(items, fields) });
      } else if (isObject(child) && at.length < MAX_SEGMENTS) {
        walk(child, at);
      }
    }
  };
  if (isObject(sample)) walk(sample, []);
  // Each is called by the fewest trailing keys no other value shares ("home score", not "match
  // home score"), so the matcher finds a field titled with those words.
  const named = (paths: string[]) => {
    const keys = paths.map((p) => p.split('.').slice(2));
    // How many values end in each run of trailing keys, counted once.
    const ends = new Map<string, number>();
    for (const k of keys) for (let n = 1; n <= k.length; n += 1) ends.set(k.slice(-n).join('.'), (ends.get(k.slice(-n).join('.')) ?? 0) + 1);
    return keys.map((k) => {
      for (let n = 1; n < k.length; n += 1) if (ends.get(k.slice(-n).join('.')) === 1) return words(k.slice(-n));
      return words(k);
    });
  };
  named(scalars.map((s) => s.path)).forEach((label, i) => (scalars[i].label = label));
  named(collections.map((c) => c.path)).forEach((label, i) => (collections[i].label = label));
  return { scalars, collections };
}

/** The columns a list field reads by default: the record's keys after its record key, as many as
 *  a row of the list carries (the record key itself when there are not enough). */
export function defaultColumns(collection: JsonCollection, adapter: SourceListAdapter): string[] {
  const rest = collection.keys.filter((k) => k !== collection.id);
  const keys = rest.length >= LIST_CELLS[adapter] ? rest : collection.keys;
  return keys.slice(0, LIST_CELLS[adapter]);
}

/**
 * The columns a list field reads: the operator's pick, else what the source already reads for
 * this leaf from this list (a reconnect keeps them), else the defaults.
 */
export function columnsFor(
  collection: JsonCollection,
  adapter: SourceListAdapter,
  picked: string[] | undefined,
  stored: SourceRecipe['outputs'][string] | undefined,
): string[] {
  if (picked) return picked;
  if (stored && 'columns' in stored && stored.from === collection.from && stored.columns.length === LIST_CELLS[adapter]) return stored.columns.map((c) => c.from);
  return defaultColumns(collection, adapter);
}

/**
 * The review's proposal, field by field: a list field (`adapters` names its list) is matched
 * against the sample's lists, every other field against its values. `holds` says whether a field
 * can take a value's text (a number field does not take "abc"); `refuses` names a field prepared
 * messages use. Rows come back in the fields' order.
 */
export function proposeConnector(
  fields: { key: string; label: string }[],
  offers: JsonOffers,
  current: Record<string, string>,
  adapters: Record<string, SourceListAdapter>,
  refuses: (fieldId: string) => boolean,
  holds: (fieldId: string, text: string) => boolean,
): MappingRow[] {
  const lists = fields.filter((f) => adapters[f.key]);
  const values = fields.filter((f) => !adapters[f.key]);
  const listOffers: OfferedValue[] = offers.collections.map((c) => ({ path: c.path, label: c.label, sample: '' }));
  const rows = new Map<string, MappingRow>();
  for (const row of proposeMapping(values, offers.scalars, current, refuses, holds)) rows.set(row.fieldId, row);
  for (const row of proposeMapping(lists, listOffers, current, refuses)) rows.set(row.fieldId, row);
  // A single list in the sample is the list field's one candidate, whatever it is called.
  for (const f of lists) {
    const row = rows.get(f.key)!;
    if (row.status === 'unmatched' && offers.collections.length === 1) rows.set(f.key, { ...row, status: 'name', path: offers.collections[0].path, candidates: [offers.collections[0].path] });
  }
  return fields.map((f) => rows.get(f.key)!);
}

/** A connector source's record, as the review reads it and as the write leaves it. */
export interface ConnectorSource {
  id: string;
  kind: 'external';
  label: string;
  config: { v: 1; configRevision: number; endpoint: string; lists?: Record<string, SourceListAdapter>; mapping?: SourceRecipe };
  paused?: boolean;
}

export type ConnectorPlan =
  | {
      /** The record to write: a reused source's configuration replaced, a new one added. */
      source: ConnectorSource;
      entries: BindingEntry[];
      /** The reused source's configuration as read (JSON), which the write is fenced on; null for a new one. */
      fence: string | null;
      /** The bindings as the write would leave them, for the preview. */
      bindings: ProductionBindings;
    }
  | { error: string };

/**
 * The one write a confirmation makes: the reviewed mapping's bindings and the recipe for every
 * leaf of the source still bound after them. This graphic's leaves read what the review chose (a
 * value its own path, a list its columns and record key); another graphic's keep their output as
 * stored. A reused source keeps its config revision, so the recipe is stamped with it; a new one
 * starts at 1. The configuration is rebuilt from known keys only and the recipe let through only
 * when `readSourceRecipe` reads it.
 */
export function connectorPlan(o: {
  graphic: string;
  bindings: ProductionBindings | undefined;
  /** The source as stored (reused), or the new one's id, label and endpoint. */
  source: { id: string; label: string; endpoint?: string; config?: unknown; paused?: boolean };
  rows: MappingRow[];
  choices: Record<string, string | null>;
  collections: JsonCollection[];
  adapters: Record<string, SourceListAdapter>;
  columns: Record<string, string[]>;
}): ConnectorPlan {
  const { id } = o.source;
  // A reused source is read the way the route reads it; a new one starts at config revision 1.
  const reused = o.source.config === undefined ? null : readExternalRegistration({ id, kind: 'external', config: o.source.config });
  if (reused && !reused.ok) return { error: 'This connector has no configuration this build reads.' };
  const stored = reused?.ok ? reused.registration : null;
  const configRevision = stored ? stored.configRevision : 1;
  const prefix = `${sourcePrefix(id, 'external')}.`;
  const entries = mappingEntries(o.graphic, o.rows, o.choices);
  const after = withBindings(o.bindings ?? {}, entries, () => false).bindings;
  const bound = new Set(sourcePaths(after, id).map((p) => p.path.slice(prefix.length)));

  // What the source already holds, for the leaves another graphic still reads.
  const before = stored ? readSourceRecipe(stored.mapping, id, configRevision) : null;
  const outputs: Record<string, RecipeValue | RecipeList> = {};
  const lists: Record<string, SourceListAdapter> = {};
  if (before?.status === 'ok') for (const [leaf, out] of Object.entries(before.recipe.outputs)) if (bound.has(leaf)) outputs[leaf] = out;
  for (const [leaf, adapter] of Object.entries(stored?.lists ?? {})) if (bound.has(leaf)) lists[leaf] = adapter;

  const byPath = new Map(o.collections.map((c) => [c.path, c]));
  const mine = sourcePaths(after, id).filter((p) => p.graphic === o.graphic);
  for (const { fieldId, path } of mine) {
    const leaf = path.slice(prefix.length);
    const adapter = o.adapters[fieldId];
    const collection = byPath.get(path);
    if (adapter && collection) {
      const columns = columnsFor(collection, adapter, o.columns[fieldId], before?.status === 'ok' ? before.recipe.outputs[leaf] : undefined);
      outputs[leaf] = { from: collection.from, ...(collection.id ? { id: collection.id } : {}), columns: columns.map((from) => ({ from })) };
      lists[leaf] = adapter;
    } else if (!adapter) {
      outputs[leaf] = { from: leaf };
      delete lists[leaf];
    }
  }

  const recipe: SourceRecipe | undefined = Object.keys(outputs).length > 0 ? { v: 1, sourceId: id, configRevision, outputs } : undefined;
  const read = readSourceRecipe(recipe, id, configRevision);
  if (read.status === 'invalid' || read.status === 'read-only') return { error: `This mapping cannot be saved: ${read.status === 'invalid' ? read.error : 'a later version'}.` };
  const config: ConnectorSource['config'] = {
    v: 1,
    configRevision,
    endpoint: stored ? stored.endpoint : (o.source.endpoint ?? ''),
    ...(Object.keys(lists).length > 0 ? { lists } : {}),
    ...(recipe ? { mapping: recipe } : {}),
  };
  return {
    source: { id, kind: 'external', label: o.source.label, config, ...(o.source.paused ? { paused: true } : {}) },
    entries,
    fence: stored ? JSON.stringify(o.source.config) : null,
    bindings: after,
  };
}

/** Bound paths of this source a new sample no longer carries: the mapping needs repair. They keep
 *  their binding (and their field its last value) until the operator picks another. */
export function needsRepair(current: Record<string, string>, sourceId: string, offers: JsonOffers): Set<string> {
  const prefix = `${sourcePrefix(sourceId, 'external')}.`;
  const offered = new Set([...offers.scalars.map((s) => s.path), ...offers.collections.map((c) => c.path)]);
  return new Set(Object.entries(current).filter(([, path]) => path.startsWith(prefix) && !offered.has(path)).map(([fieldId]) => fieldId));
}


// ── Reading a sample ───────────────────────────────────────────────────────────────────────────

/** How long the review waits on an agent's sample, and how often it asks whether it came. The
 *  agent hears the ask at its next claim renewal or report, within about 15 seconds. */
export const SAMPLE_WAIT_MS = 45_000;
export const SAMPLE_POLL_MS = 1_500;

export type SampleRead = { ok: true; sample: unknown; via: 'agent' | 'hosted' } | { ok: false; error: string; fix: string };

type Fetcher = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; json: () => Promise<unknown> }>;

const failed = (error: string, fix: string): SampleRead => ({ ok: false, error, fix });
const OFFLINE = failed('NoaCG could not be reached', 'Check this computer is online.');

/**
 * One sample for the review, never applied. A registered source of a published production (`key`
 * and `sourceId`) is asked through `/api/data/source`: when an agent holds it, the agent reads the
 * provider with its own credential and the review waits for what it posts (the browser never holds
 * the provider's credential). Otherwise (no agent, or any refusal of the source), and for a new
 * endpoint, the hosted fetcher reads the public address (`/api/data/feed?as=json`, the feed reader's guard). `wait` is the timer.
 */
export async function readConnectorSample(o: {
  fetcher: Fetcher;
  endpoint: string;
  key?: string | null;
  sourceId?: string | null;
  wait: (ms: number) => Promise<void>;
  now: () => number;
  signal?: AbortSignal;
}): Promise<SampleRead> {
  const answer = async (url: string, init?: Parameters<Fetcher>[1]): Promise<{ status: number; body: Record<string, unknown> } | null> => {
    try {
      const response = await o.fetcher(url, { ...init, signal: o.signal });
      const body = await response.json().catch(() => ({}));
      return { status: response.status, body: isObject(body) ? body : {} };
    } catch {
      return null;
    }
  };
  if (o.key && o.sourceId) {
    const ask = (asked: string | null) =>
      answer('/api/data/source', {
        method: 'POST',
        headers: { authorization: `Bearer ${o.key}`, 'content-type': 'application/json' },
        body: JSON.stringify({ v: 1, op: 'sample', sourceId: o.sourceId, ...(asked ? { asked } : {}) }),
      });
    const first = await ask(null);
    if (!first) return OFFLINE;
    if (first.body.waiting === true && typeof first.body.asked === 'string') {
      const until = o.now() + SAMPLE_WAIT_MS;
      while (o.now() < until && !o.signal?.aborted) {
        await o.wait(SAMPLE_POLL_MS);
        if (o.signal?.aborted) break;
        const next = await ask(first.body.asked);
        if (!next) return OFFLINE;
        if (next.body.ok === true) return { ok: true, sample: next.body.sample, via: 'agent' };
        if (next.body.waiting !== true) break;
      }
      return failed('its agent did not answer', 'Check the agent is running, then read again.');
    }
    // No agent holds it, or the production cannot use its record yet (not synced, say): the
    // public address is read the hosted way, which needs nothing of the production.
  }
  if (o.signal?.aborted) return OFFLINE;
  const hosted = await answer(`/api/data/feed?as=json&url=${encodeURIComponent(o.endpoint)}`);
  if (!hosted) return OFFLINE;
  if (hosted.status === 429) return failed('too many reads from this computer', 'Read again in a moment.');
  if (hosted.body.ok === true) return { ok: true, sample: hosted.body.sample, via: 'hosted' };
  return failed(typeof hosted.body.error === 'string' ? hosted.body.error : `NoaCG answered ${hosted.status}`, typeof hosted.body.fix === 'string' ? hosted.body.fix : 'Read again in a moment.');
}
