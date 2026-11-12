// A PUBLIC JSON ADDRESS READ BY NOACG (docs/work-specs/obs-scenes/spec.md, OS5a; AC-9, rules R1 to
// R18 in its phase notes): a connector source whose registration carries `read: { everyMs }`.
//
// NoaCG's server reads the address through the guarded fetch and keeps one shared read per address
// (api/_lib/feedFetch.ts `readCachedJson`, never more often than every 10 s for every reader); the
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

import { createSheetReader, leaseOf, type ProjectedRead, type SheetFetch, type SheetReader, type SheetReaderOptions, type SourceRead } from './sheetSource.js';
import { canonicalJson, type ExternalRegistration, type JsonValue } from './externalSource.js';
import { projectSource } from './sourceMapping.js';
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

/**
 * One payload for a source's bound paths, by the shared evaluator: text only (R14). A path only
 * typed fields read, a collection recipe's leaf and anything the evaluator holds write nothing,
 * and each is said plainly.
 */
export function projectJson(o: {
  sourceId: string;
  payload: unknown;
  bindings: Record<string, Record<string, string>> | undefined;
  fieldsOf: (graphic: string) => FieldDescriptor[] | null;
  registration: Pick<ExternalRegistration, 'lists' | 'mapping' | 'configRevision'>;
  /** Whether a collection recipe of the production reads this source. */
  collections?: boolean;
}): ProjectedRead {
  const p = projectSource({
    sourceId: o.sourceId,
    payload: o.payload,
    bindings: o.bindings,
    fieldsOf: o.fieldsOf,
    lists: o.registration.lists,
    mapping: o.registration.mapping,
    configRevision: o.registration.configRevision,
  });
  const prefix = `${sourcePrefix(o.sourceId, 'external')}.`;
  const problems: string[] = [];
  if (p.held) problems.push(`the mapping cannot be used (${p.held.error}), so every value holds`);
  else {
    for (const leaf of p.missing) problems.push(`${leaf} is not in the JSON, so it keeps its value`);
    for (const leaf of p.unfit) {
      problems.push(p.problems[leaf] ? `${leaf}: ${p.problems[leaf]}, so it keeps its value` : `${leaf} holds a value not every field connected to it can show, so it keeps its value`);
    }
    for (const path of Object.keys(p.typedWrites)) problems.push(`${path.slice(prefix.length)} feeds a field that takes typed values, which only an agent writes, so it keeps its value`);
  }
  if (o.collections) problems.push('its collection cards are filled by an agent only, so they keep their values');
  return { writes: p.writes, problems, fingerprint: jsonFingerprint(o.payload) };
}

/** The browser reader of one JSON source: the Sheet reader's machinery with this read and cadence. */
export function createJsonReader(
  o: Omit<SheetReaderOptions, 'link' | 'read' | 'everyMs' | 'renewMs' | 'timeoutMs' | 'shape' | 'project' | 'inbox'> & {
    url: string;
    everyMs: number;
    project: (payload: unknown) => ProjectedRead;
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
