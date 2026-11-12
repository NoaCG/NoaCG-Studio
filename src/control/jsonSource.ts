// A PUBLIC JSON ADDRESS READ BY NOACG (docs/work-specs/obs-scenes/spec.md, OS5a; AC-9, rules R1 to
// R18 in its phase notes): a connector source whose registration carries `read: { everyMs }`.
//
// NoaCG's server reads the address through the guarded fetch and keeps one shared read per address
// (api/_lib/feedFetch.ts `readCachedJson`, fetched at most every 9 s from the read that asked, for
// every reader); the
// page asks it through `/api/data/json` at the source's own interval while it holds the source's
// lease, and the server tick reads it when no page does (api/_lib/dataTick.ts). Everything else is
// the Sheet reader's (./sheetSource.ts): the lease, Pause, the diff against what the source last
// wrote, three missed reads to stale, and an answer arriving after a Pause or a handover writing
// nothing. A good read is ONE snapshot: the payload is evaluated once by the shared evaluator
// (./sourceMapping.ts `projectSource`, the connector's lists and recipe included) for the paths bound
// at that moment, and every changed path goes in one write.
//
// The reader is generic on purpose (R11): a read hands the parsed payload to `project`, so a later
// adapter can turn the payload into its own shape before the evaluator, without a second reader.
//
// Pure and Node-importable: scripts/json-source.test.mjs drives it with a fake fetch and clock.

import { createSheetReader, leaseOf, type ProjectedRead, type SourceProject, type SheetFetch, type SheetReader, type SheetReaderOptions, type SourceRead } from './sheetSource.js';
import { canonicalJson, type ExternalRegistration, type JsonValue, type RegistrationRead } from './externalSource.js';
import { projectSource } from './sourceMapping.js';
import { adaptBracket, CURRENT_MEMORY_KEY, currentMemoryText, type CurrentMemory, forFields, pickOf, readCurrentMemory, readSourceAdapter, type MatchChoice } from './bracketAdapter.js';
import { sourcePrefix } from '../model/productionData.js';
import type { FieldDescriptor } from '../model/fieldModel';

/** No source reads more often than this, wherever it is read (spec D4). */
export const JSON_FLOOR_MS = 10_000;
/** A longer interval is read this often anyway. */
export const JSON_MAX_EVERY_MS = 60 * 60_000;
/** What the review offers. */
export const JSON_DEFAULT_EVERY_MS = 30_000;
/** The page renews its claim at least this often, inside the published row's one-minute lease. */
export const JSON_RENEW_MS = 20_000;
/** How long the page waits for the route: its own 10-second read, or another instance's first
 *  read it waits out, plus the database. A read later than this is late, and writes nothing. */
export const JSON_ROUTE_TIMEOUT_MS = 25_000;

const RETRY_FIX = 'Reading carries on by itself.';

/** A source's interval as it is read: between the floor and the hour. */
export const jsonEveryMs = (everyMs: number): number => Math.min(JSON_MAX_EVERY_MS, Math.max(JSON_FLOOR_MS, Math.round(everyMs)));

/** A JSON reader's cadence, as the Sheet reader takes it, and the lease that follows from it. */
export function jsonCadence(everyMs: number): { everyMs: number; renewMs: number; timeoutMs: number } {
  const every = jsonEveryMs(everyMs);
  return { everyMs: every, renewMs: Math.min(every, JSON_RENEW_MS), timeoutMs: JSON_ROUTE_TIMEOUT_MS };
}
export const jsonLeaseMs = (everyMs: number): number => leaseOf(jsonCadence(everyMs));

/** The route that reads a JSON address for the page. */
export const jsonRouteUrl = (address: string): string => `/api/data/json?url=${encodeURIComponent(address)}`;

/** Ask the route for an address once: the parsed payload, or the failure with its fix. */
export async function readJsonRoute(fetcher: SheetFetch, address: string, signal: AbortSignal): Promise<SourceRead> {
  let text: string;
  let status: number;
  try {
    const response = await fetcher(jsonRouteUrl(address), { signal });
    status = response.status;
    text = await response.text();
  } catch {
    if (signal.aborted) return { ok: false, error: 'the address did not answer in time', fix: RETRY_FIX };
    return { ok: false, error: 'can’t reach NoaCG to read the address (offline?)', fix: 'Check this computer is online.' };
  }
  if (status === 429) return { ok: false, error: 'too many reads from this computer', fix: RETRY_FIX };
  let answer: { ok?: unknown; payload?: unknown; error?: unknown; fix?: unknown };
  try {
    answer = JSON.parse(text);
  } catch {
    return { ok: false, error: `NoaCG’s reader answered ${status}`, fix: RETRY_FIX };
  }
  if (answer && answer.ok === true && 'payload' in answer) return { ok: true, payload: answer.payload };
  return {
    ok: false,
    error: typeof answer?.error === 'string' ? answer.error : `NoaCG’s reader answered ${status}`,
    fix: typeof answer?.fix === 'string' ? answer.fix : RETRY_FIX,
  };
}

/** A short fingerprint of a payload's canonical JSON (cyrb53): whether the content changed, kept
 *  on the lease row instead of the payload itself. Not a security hash. */
export function jsonFingerprint(payload: unknown): string {
  const text = canonicalJson(payload as JsonValue);
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return `json:${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
}

/** With no memory (a fresh tree, or an older build held the lease), what the bound `current`
 *  paths last showed stands in for it, when they name a match (B12 amended). */
function shownCurrent(previous: Readonly<Record<string, string>>, at: string): CurrentMemory | null {
  const matchId = previous[`${at}matchId`];
  if (!matchId) return null;
  const name = (side: string) => (previous[`${at}${side}.name`] ? previous[`${at}${side}.name`] : null);
  return { matchId, a: name('a'), b: name('b') };
}

/** At most this many of an adapter's report lines go on the line (B15). */
export const ADAPTER_REPORT_LINES = 5;

/** At most this many matches are offered to the picker. */
export const MAX_CHOICES = 200;

/**
 * One payload for a source's bound paths, by the shared evaluator: text only (R14). A path only
 * typed fields read, a collection recipe's leaf and anything the evaluator holds write nothing,
 * and each is said plainly. A source with an adapter (OS5b) turns the payload through it first;
 * `current` is the operator's pick and what this source last wrote (its memory with it), given by
 * an open page only: without it nothing under `current` is said (B13).
 */
export function projectJson(o: {
  sourceId: string;
  payload: unknown;
  bindings: Record<string, Record<string, string>> | undefined;
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  /** The registration as `readExternalRegistration` reads it: one it cannot use writes nothing and
   *  says why, on the page and the tick alike. */
  registration: RegistrationRead;
  /** Whether a collection recipe of the production reads this source. */
  collections?: boolean;
  current?: { pick: unknown; previous: Readonly<Record<string, string>> };
}): ProjectedRead {
  const fingerprint = jsonFingerprint(o.payload);
  if (!o.registration.ok) return { writes: {}, problems: [`the source cannot be used (${o.registration.error}), so every value holds`], fingerprint };
  const registration: Pick<ExternalRegistration, 'lists' | 'mapping' | 'configRevision' | 'adapter'> = o.registration.registration;
  let payload: unknown = o.payload;
  const said: string[] = [];
  let memory: ProjectedRead['memory'];
  let choices: MatchChoice[] | undefined;
  const adapter = readSourceAdapter(registration.adapter);
  if (adapter.status === 'invalid' || adapter.status === 'read-only') {
    const why = adapter.status === 'invalid' ? adapter.error : `the adapter is version ${adapter.version}; this build reads version 1, so it is held read-only`;
    return { writes: {}, problems: [`the adapter cannot be used (${why}), so every value holds`], fingerprint };
  }
  if (adapter.status === 'ok') {
    const at = `${sourcePrefix(o.sourceId, 'external')}.current.`;
    const adapted = adaptBracket(o.payload, adapter.adapter, o.current ? { pick: pickOf(o.current.pick), memory: readCurrentMemory(o.current.previous) ?? shownCurrent(o.current.previous, at) } : undefined);
    if ('problem' in adapted) return { writes: {}, problems: [`the bracket cannot be read (${adapted.problem}), so every value holds`], fingerprint };
    payload = forFields(adapted.output);
    // A pick needs a match id the rows give (B5 amended).
    if (adapter.adapter.fields.match) choices = adapted.matches.slice(0, MAX_CHOICES);
    said.push(...adapted.report.slice(0, ADAPTER_REPORT_LINES));
    if (adapted.report.length > ADAPTER_REPORT_LINES) said.push(`and ${adapted.report.length - ADAPTER_REPORT_LINES} more in the rows`);
    if (adapted.current) {
      if (adapted.current.held) said.push(`the current match is held: ${adapted.current.held}, so it keeps its values`);
      memory = { [CURRENT_MEMORY_KEY]: adapted.current.memory ? currentMemoryText(adapted.current.memory) : null };
    }
  }
  const p = projectSource({
    sourceId: o.sourceId,
    payload,
    bindings: o.bindings,
    fieldsOf: o.fieldsOf,
    lists: registration.lists,
    mapping: registration.mapping,
    configRevision: registration.configRevision,
  });
  const prefix = `${sourcePrefix(o.sourceId, 'external')}.`;
  // The operator's pick is never the source's (B11), and `current` holds by leaving its leaves out.
  const own = (leaf: string) => adapter.status === 'ok' && (leaf === 'currentMatchId' || leaf === 'current' || leaf.startsWith('current.'));
  const problems: string[] = [...said];
  if (p.held) problems.push(`the mapping cannot be used (${p.held.error}), so every value holds`);
  else {
    for (const leaf of p.missing) if (!own(leaf)) problems.push(`${leaf} is not in the JSON, so it keeps its value`);
    for (const leaf of p.unfit) {
      problems.push(p.problems[leaf] ? `${leaf}: ${p.problems[leaf]}, so it keeps its value` : `${leaf} holds a value not every field connected to it can show, so it keeps its value`);
    }
    for (const path of Object.keys(p.typedWrites)) problems.push(`${path.slice(prefix.length)} feeds a field that takes typed values, which only an agent writes, so it keeps its value`);
  }
  if (o.collections) problems.push('its collection cards are filled by an agent only, so they keep their values');
  return { writes: p.writes, problems, fingerprint, ...(memory ? { memory } : {}), ...(choices ? { choices } : {}) };
}

/** The browser reader of one JSON source: the Sheet reader's machinery with this read and cadence. */
export function createJsonReader(
  o: Omit<SheetReaderOptions, 'link' | 'read' | 'everyMs' | 'renewMs' | 'timeoutMs' | 'shape' | 'project' | 'inbox'> & {
    url: string;
    everyMs: number;
    project: SourceProject;
  },
): SheetReader {
  return createSheetReader({
    ...o,
    ...jsonCadence(o.everyMs),
    // Never read as rows: the payload goes to `project`.
    shape: 'values',
    read: (signal) => readJsonRoute(o.io.fetch, o.url, signal),
  });
}

/** Whether a collection recipe of the production reads this source (R14): a NoaCG read does not
 *  write its leaf, so the review offers no `read` for it. */
export const collectionReads = (collections: readonly unknown[] | undefined, sourceId: string): boolean =>
  (collections ?? []).some((c) => typeof c === 'object' && c !== null && (c as { sourceId?: unknown }).sourceId === sourceId);
