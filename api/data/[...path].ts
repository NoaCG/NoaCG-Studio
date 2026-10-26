// THE PRODUCTION DATA API - the server-side ingress for automated data into live graphics
// (docs/DATA_API.md; the design constraint it implements is docs/CLOUD_PLAYOUT.md §7).
//
// A connector is a PRODUCER NEXT TO THE OPERATOR, never a second path into the renderer:
// this route turns { values by label } into an ordinary `update` row in the same command log
// every operator surface writes, via control_data_send (control_send's ingest twin) - so
// ordering against operator commands is the log's own, the renderer stays dumb, and "manual
// override" is the operator simply out-writing the feed. Credentials stay here: the caller
// holds a per-production data key (migration 0047), the service-role key never leaves the
// server, and the key is honoured only by the two service-role RPCs, which write nothing but
// update rows - update-only is enforced in the database, not by this file's good manners.
// The in-process gates below are PRE-FILTERS that keep abuse cheap; the DB-side ingest
// budget (25 of any 5 s window, the operator keeping the rest) is the global authority.
//
// The catch-all routes exactly ONE segment on this deployment (scripts/check-api-route-depth
// .mjs - measured, not inferred), so every verb lives one segment deep: /api/data/update
// today, siblings later at no function cost. Function 11 of the 12 budget. `/api/data/tick` is the
// server tick (data-sources C2), the one-minute cron's target: vercel.json gives this function
// `maxDuration` 30 for it. `/api/data/feed` is the public news feed reader (data-sources C4,
// api/_lib/feedFetch.ts): no key, guarded by address, size, time and a per-client limit.
// `/api/data/source` is the trusted JSON agent's door (docs/work-specs/playout-external-connectors,
// E4.2): the data key, a versioned envelope, C2's lease and the fenced apply of migration 0101.

import { apiError, bearerToken, json, methodGuard, readJson } from '../_lib/http.js';
import { checkDataIngestBudget, checkDataIpRateLimit, checkFeedIpRateLimit } from '../_lib/rateLimit.js';
import { FEED_TIMEOUT_MS, feedNetwork, guardedFetch, normalizeFeedAddress, readFeed, supabaseFeedStore, type FeedIo, type GuardedRead } from '../_lib/feedFetch.js';
import {
  dataApiConfigured,
  mapLabelsToFields,
  parseDataPatch,
  parseDataUpdate,
  patchProductionData,
  productionForDataKey,
  readProductionData,
  resolveTargetGraphic,
  sendDataUpdate,
} from '../_lib/dataIngest.js';
import { adminConfigured, adminDb } from '../_lib/adminAuth.js';
import { dataTickOn } from '../_lib/systemSettings.js';
import { cappedFetch, cronAuthorized, descriptorsOf, runDataTick, TICK_OWNER, type DueSource, type PanelField } from '../_lib/dataTick.js';
import { parseSourceEnvelope, readExternalRegistration, SOURCE_BODY_BYTES, SOURCE_LEASE_MS, type SourceEnvelope } from '../../src/control/externalSource.js';
import { projectSource } from '../../src/control/sourceMapping.js';
import { sourcePrefix } from '../../src/model/productionData.js';

/** Field values, not uploads: a whole scoreboard of labels fits in a few hundred bytes. */
const MAX_BODY_BYTES = 16_384;

const retryAfter = (sec: number): Record<string, string> => ({ 'retry-after': String(sec) });

/** What a held write answers beside `paused: true` (0100): the operator paused Another system. */
const HELD_MESSAGE = 'Held: this production has paused Another system. Resume sends the latest values once.';

async function update(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'POST');
  if (guard) return guard;

  const ipGate = checkDataIpRateLimit(req);
  if (ipGate) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, retryAfter(ipGate.retryAfterSec));

  const key = bearerToken(req);
  if (!key) return apiError('unauthorized', 'Send the production data key as a Bearer token.', 401);
  if (!dataApiConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);

  let body: unknown;
  try {
    body = await readJson(req, MAX_BODY_BYTES);
  } catch (error) {
    const code = (error as { code?: string }).code === 'too_large' ? 'too_large' : 'invalid';
    return apiError(code, code === 'too_large' ? 'Request body too large.' : 'The body must be JSON.', code === 'too_large' ? 413 : 400);
  }
  const parsed = parseDataUpdate(body);
  if (!parsed.ok) return apiError('invalid', parsed.error, 400);

  let production;
  try {
    production = await productionForDataKey(key);
  } catch (error) {
    // A transient DB fault must answer in the documented JSON shape, not as the platform's
    // plain-text invocation failure (the dev middleware would mask the difference).
    console.error('Data key resolve failed:', error instanceof Error ? error.message : error);
    return apiError('internal', 'The production could not be resolved.', 500);
  }
  if (!production) return apiError('unauthorized', 'Unknown data key.', 401);

  const budget = checkDataIngestBudget(production.id);
  if (budget) {
    return apiError(
      'rate_limited',
      'This production\'s data budget is spent for the moment - the operator keeps priority.',
      429,
      {},
      retryAfter(budget.retryAfterSec),
    );
  }

  const target = resolveTargetGraphic(production.panel, production.cues, parsed.req);
  if (!target.ok) return apiError('invalid', target.error, 400);

  const mapped = mapLabelsToFields(target.graphic.fields ?? [], parsed.req.values);
  if (Object.keys(mapped.data).length === 0) {
    return apiError('invalid', 'No value matched a field label on that graphic.', 400, {
      issues: [...mapped.ignored.map((l) => `no field labelled "${l}"`), ...mapped.ambiguous.map((l) => `"${l}" is ambiguous`)],
    });
  }

  let event: number | null;
  try {
    event = await sendDataUpdate(key, target.graphic.name, mapped.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // control_data_send's own refusals, translated honestly rather than as a 500.
    if (message.includes('data budget')) return apiError('rate_limited', 'This production\'s data budget is spent for the moment - the operator keeps priority.', 429, {}, retryAfter(5));
    if (message.includes('too many commands')) return apiError('rate_limited', 'The production\'s command log is saturated - slow down.', 429, {}, retryAfter(5));
    if (message.includes('switched off')) return apiError('unauthorized', 'Hosted control is switched off for this production.', 403);
    if (message.includes('unknown data key')) return apiError('unauthorized', 'Unknown data key.', 401);
    console.error('Data update failed:', message);
    return apiError('internal', 'The update could not be written.', 500);
  }

  return json({
    ok: true,
    event,
    graphic: target.graphic.name,
    applied: mapped.data,
    ignored: mapped.ignored,
    ambiguous: mapped.ambiguous,
    // Paused: kept, newest per field, and sent once by Resume (0100).
    ...(event === null ? { paused: true, message: HELD_MESSAGE } : {}),
  });
}

/**
 * PATCH the production's DATA TREE - the verb a feed should reach for.
 *
 * `/update` above addresses a GRAPHIC by name and its fields by label, so the caller has to
 * know the production's rundown. This one addresses the DATA: write `match.home.score` and
 * every field bound to that path follows, on whichever graphics happen to exist. The merge,
 * the binding resolution, the diff and the rate gates all happen inside one locked
 * transaction in the database (migration 0048) - see api/_lib/dataIngest.ts.
 *
 * Named `/data/patch` rather than served as `PATCH /api/data` because the catch-all routes
 * exactly ONE segment on this deployment (scripts/check-api-route-depth.mjs - measured, not
 * inferred). It accepts PATCH and POST: the semantics are a merge patch either way, and a
 * connector behind a proxy that eats PATCH should not be stuck.
 */
async function patch(req: Request): Promise<Response> {
  if (req.method !== 'PATCH' && req.method !== 'POST') {
    return apiError('invalid', 'Use PATCH (or POST) to write production data.', 405);
  }

  const ipGate = checkDataIpRateLimit(req);
  if (ipGate) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, retryAfter(ipGate.retryAfterSec));

  const key = bearerToken(req);
  if (!key) return apiError('unauthorized', 'Send the production data key as a Bearer token.', 401);
  if (!dataApiConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);

  let body: unknown;
  try {
    body = await readJson(req, MAX_BODY_BYTES);
  } catch (error) {
    const code = (error as { code?: string }).code === 'too_large' ? 'too_large' : 'invalid';
    return apiError(code, code === 'too_large' ? 'Request body too large.' : 'The body must be JSON.', code === 'too_large' ? 413 : 400);
  }
  const parsed = parseDataPatch(body);
  if (!parsed.ok) return apiError('invalid', parsed.error, 400);

  // The per-production budget is enforced in the DATABASE (it is the global authority); this
  // in-process gate is the same cheap pre-filter /update uses. It needs the production id,
  // which only the key resolves, so it runs after the key is known.
  let production;
  try {
    production = await productionForDataKey(key);
  } catch (error) {
    console.error('Data key resolve failed:', error instanceof Error ? error.message : error);
    return apiError('internal', 'The production could not be resolved.', 500);
  }
  if (!production) return apiError('unauthorized', 'Unknown data key.', 401);

  const budget = checkDataIngestBudget(production.id);
  if (budget) {
    return apiError('rate_limited', "This production's data budget is spent for the moment - the operator keeps priority.", 429, {}, retryAfter(budget.retryAfterSec));
  }

  try {
    const result = await patchProductionData(key, parsed.patch);
    // Paused: the tree took the patch and nothing aired; Resume sends what changed (0100).
    return json({ ok: true, data: result.data, writes: result.writes, ...(result.paused ? { paused: true, message: HELD_MESSAGE } : {}) });
  } catch (error) {
    return patchFailure(error);
  }
}

/** READ the production's current tree - what an integrator asks after a restart or a partition
 *  instead of blindly pushing a whole snapshot. Idempotent, so it carries no ingest budget;
 *  the IP pre-filter still applies. */
async function state(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'GET');
  if (guard) return guard;

  const ipGate = checkDataIpRateLimit(req);
  if (ipGate) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, retryAfter(ipGate.retryAfterSec));

  const key = bearerToken(req);
  if (!key) return apiError('unauthorized', 'Send the production data key as a Bearer token.', 401);
  if (!dataApiConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);

  try {
    const current = await readProductionData(key);
    if (!current) return apiError('unauthorized', 'Unknown data key.', 401);
    return json({ ok: true, data: current.data, bindings: current.bindings });
  } catch (error) {
    console.error('Data read failed:', error instanceof Error ? error.message : error);
    return apiError('internal', 'The production data could not be read.', 500);
  }
}

/** control_data_patch's own refusals, translated honestly rather than as a 500. */
function patchFailure(error: unknown): Response {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes('data budget')) return apiError('rate_limited', "This production's data budget is spent for the moment - the operator keeps priority.", 429, {}, retryAfter(5));
  if (message.includes('too many commands')) return apiError('rate_limited', "The production's command log is saturated - slow down.", 429, {}, retryAfter(5));
  if (message.includes('switched off')) return apiError('unauthorized', 'Hosted control is switched off for this production.', 403);
  if (message.includes('unknown data key')) return apiError('unauthorized', 'Unknown data key.', 401);
  if (message.includes('not a data patch')) return apiError('invalid', 'The body must be a JSON object of production data.', 400);
  console.error('Data patch failed:', message);
  return apiError('internal', 'The patch could not be written.', 500);
}

/**
 * THE SERVER TICK (api/_lib/dataTick.ts): GET from the project's one-minute cron. Without the
 * exact `Bearer <CRON_SECRET>` it answers 401 before it reads or writes anything, so a caller
 * outside cannot write to the database. With it and the switch off (or unreadable) it answers at
 * once and records nothing; on, it reads the due sources and records the run.
 */
async function tick(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'GET');
  if (guard) return guard;
  if (!cronAuthorized(req)) return apiError('unauthorized', 'bad cron secret', 401);
  if (!adminConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);
  if (!(await dataTickOn())) return json({ ok: true, on: false });
  const db = await adminDb();
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  };
  try {
    const run = await runDataTick({
      now: Date.now,
      due: (limit) => rpc<DueSource[]>('control_data_tick_due', { p_limit: limit }),
      lease: (slug, source, claim, ttlMs) =>
        rpc('control_source_lease', { p_slug: slug, p_source: source, p_owner: TICK_OWNER, p_claim: claim, p_ttl_ms: ttlMs }),
      commit: (slug, source, claim, writes, state) =>
        rpc('control_source_tick_commit', { p_slug: slug, p_source: source, p_claim: claim, p_writes: writes, p_state: state }),
      record: (startedAt, durationMs, sources) =>
        rpc('control_data_tick_record', { p_started: new Date(startedAt).toISOString(), p_duration_ms: durationMs, p_sources: sources }),
      fetch: cappedFetch(fetch),
      feed: async (address, signal) => readFeed(address, await feedIo(), { wait: signal, cut: signal }),
      setTimer: (run, ms) => setTimeout(run, ms),
      clearTimer: (timer) => clearTimeout(timer as ReturnType<typeof setTimeout>),
    });
    return json({ ok: true, on: true, durationMs: run.durationMs, sources: run.sources });
  } catch (error) {
    console.error('Data tick failed:', error instanceof Error ? error.message : error);
    return apiError('internal', 'The tick could not run.', 500);
  }
}

async function feedIo(): Promise<FeedIo> {
  return {
    net: feedNetwork.current,
    store: supabaseFeedStore(await adminDb()),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  };
}

/**
 * THE NEWS FEED READER: GET `/api/data/feed?url=<address>`, public. Answers the newest headlines
 * as plain text, from the shared cache or one guarded read (api/_lib/feedFetch.ts), or the
 * failure with its fix and, when there are any, the last good headlines.
 */
async function feed(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'GET');
  if (guard) return guard;
  const gate = checkFeedIpRateLimit(req);
  if (gate) return apiError('rate_limited', 'Too many feed reads - slow down.', 429, {}, retryAfter(gate.retryAfterSec));
  const params = new URL(req.url).searchParams;
  const address = params.get('url');
  if (params.get('as') === 'json') return jsonSample(address ?? '', req.signal);
  if (!address) return json({ ok: false, error: 'no feed address', fix: 'Paste the feed’s address.', failingSince: null }, 400);
  if (!adminConfigured()) return apiError('unavailable', 'The feed reader is not configured on this deployment.', 503);
  try {
    const answer = await readFeed(address, await feedIo(), { wait: req.signal });
    if (answer.ok) return json(answer);
    const { status, ...body } = answer;
    return json(body, status);
  } catch (error) {
    console.error('Feed read failed:', error instanceof Error ? error.message : error);
    return json({ ok: false, error: 'the feed reader could not read its cache', fix: 'Reading carries on by itself.', failingSince: null }, 500);
  }
}

/**
 * A PUBLIC JSON ENDPOINT'S SAMPLE for the Connect review (docs/work-specs/playout-api-mapping/
 * spec.md, E5.2): GET `/api/data/feed?as=json&url=<address>`, one read under the feed reader's own
 * guard (C4: public addresses only, every redirect checked, 10 seconds, the per-client limit) and
 * the source route's 256 KiB, answered as parsed JSON. Never cached, stored or applied, and no
 * credential is ever sent: an endpoint that needs one is read by its agent (op `sample` above).
 */
async function jsonSample(text: string, outer: AbortSignal): Promise<Response> {
  const normal = normalizeFeedAddress(text);
  if ('error' in normal) return json({ ok: false, error: 'that is not a web address', fix: 'Paste the address that answers JSON.' }, 400);
  // The read ends at 10 seconds, or when the page that asked goes away.
  const controller = new AbortController();
  const stop = () => controller.abort();
  const timer = setTimeout(stop, FEED_TIMEOUT_MS);
  outer.addEventListener('abort', stop, { once: true });
  let read: Awaited<ReturnType<typeof guardedFetch>>;
  try {
    read = await guardedFetch(normal.url, { etag: null, lastModified: null }, feedNetwork.current, controller.signal, Date.now, JSON_SAMPLE_READ);
  } finally {
    clearTimeout(timer);
    outer.removeEventListener('abort', stop);
  }
  const words = (t: string) => t.replace(/\bthe feed\b/g, 'the address').replace(/feed’s/g, 'endpoint’s');
  if (read.kind !== 'body') {
    if (read.kind === 'not-modified') return json({ ok: false, error: 'the address answered without a body', fix: 'Try again in a moment.' }, 502);
    if (read.status === 401 || read.status === 403) return json({ ok: false, error: 'the address needs a credential', fix: 'Its agent reads it: register it, start its agent, then read it again.' }, 502);
    if (read.tooLarge) return json({ ok: false, error: read.error, fix: read.fix }, 413);
    return json({ ok: false, error: words(read.error), fix: words(read.fix) }, read.refused ? 422 : 502);
  }
  try {
    return json({ ok: true, sample: JSON.parse(read.text) as unknown });
  } catch {
    return json({ ok: false, error: 'the address does not answer JSON', fix: 'Check the address.' }, 422);
  }
}

/** The JSON sample's read: JSON asked for, and the source route's own 256 KiB. */
const JSON_SAMPLE_READ: GuardedRead = {
  accept: 'application/json',
  maxBytes: SOURCE_BODY_BYTES,
  tooLarge: { error: 'the answer is over 256 KiB', fix: 'Use an address that answers only what the graphics use.' },
};

/** A source refusal's HTTP status (migration 0101's codes). Everything is refused before writing. */
const SOURCE_REFUSALS: Record<string, { status: number; message: string }> = {
  gone: { status: 404, message: 'This production has no connector source with that id. Connect it first.' },
  unsupported: { status: 422, message: 'This source is a later version than this server reads, so it is held read-only.' },
  registration: { status: 422, message: 'The production\'s record of this source cannot be used (its lists or endpoint). Nothing is applied.' },
  local_refused: { status: 422, message: 'A local destination is set in the agent\'s own configuration, never in the production.' },
  config: { status: 409, message: 'The production holds another configuration revision for this source. Update the agent\'s configuration.' },
  moved: { status: 409, message: 'This agent no longer holds the source. Claim it again.' },
  epoch: { status: 409, message: 'This agent\'s claim is older than the current one. Claim it again.' },
  old_revision: { status: 409, message: 'The production already holds this revision or a newer one.' },
  paused: { status: 409, message: 'The source is paused in the production. Nothing is applied; Resume takes the latest revision.' },
  too_soon: { status: 429, message: 'One revision per source every 5 seconds.' },
  too_large: { status: 413, message: 'The payload is over 256 KiB. Send only the fields the graphics use.' },
  row_too_large: { status: 413, message: 'One graphic\'s update would be over 64 KiB, so the revision is refused.' },
  budget: { status: 429, message: "This production's data budget cannot take this revision now - the operator keeps priority." },
};

/**
 * THE TRUSTED JSON AGENT'S DOOR: POST `/api/data/source` with the production data key and a
 * versioned envelope (src/control/externalSource.ts `parseSourceEnvelope`): `claim` takes the
 * registered source through C2's lease and answers the owner epoch and the revision to continue
 * from; `report` hands over one read, a changed payload evaluated here by the shared evaluator
 * (src/control/sourceMapping.ts) and applied, fenced, by the database (migration 0101); `release`
 * lets the lease go. Not a second patch door: only the registered source's own paths move, and
 * nothing here can take, continue, reset or clear a graphic.
 */
async function source(req: Request): Promise<Response> {
  const guard = methodGuard(req, 'POST');
  if (guard) return guard;
  const ipGate = checkDataIpRateLimit(req);
  if (ipGate) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, retryAfter(ipGate.retryAfterSec));
  const key = bearerToken(req);
  if (!key) return apiError('unauthorized', 'Send the production data key as a Bearer token.', 401);
  if (!dataApiConfigured() || !adminConfigured()) return apiError('unavailable', 'The data API is not configured on this deployment.', 503);

  let body: unknown;
  try {
    body = await readJson(req, SOURCE_BODY_BYTES);
  } catch (error) {
    const tooLarge = (error as { code?: string }).code === 'too_large';
    return apiError(tooLarge ? 'too_large' : 'invalid', tooLarge ? 'Request body over 256 KiB.' : 'The body must be JSON.', tooLarge ? 413 : 400);
  }
  const parsed = parseSourceEnvelope(body);
  if (!parsed.ok) return apiError('invalid', parsed.error, parsed.unsupported ? 422 : 400);
  const envelope = parsed.envelope;

  const db = await adminDb();
  const rpc = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    const { data, error } = await db.rpc(name, args);
    if (error) throw new Error(error.message);
    return data as T;
  };
  const refused = (answer: { refused: string } & Record<string, unknown>): Response => {
    const known = SOURCE_REFUSALS[answer.refused] ?? { status: 409, message: 'Refused.' };
    const headers = known.status === 429 ? retryAfter(Math.max(1, Math.ceil(Number(answer.retryMs ?? 5000) / 1000))) : {};
    return json({ ok: false, ...answer, message: known.message }, known.status, headers);
  };

  try {
    if (envelope.op === 'sample') return await sample(envelope, key, db, rpc, refused);
    if (envelope.op !== 'report') {
      // Whether the page waits on a sample is asked beside the claim, not after it.
      const [answer, wanted] = await Promise.all([
        rpc<Record<string, unknown>>('control_source_claim_by_key', {
          p_key: key,
          p_source: envelope.sourceId,
          p_config_revision: envelope.configRevision,
          p_claim: envelope.claim,
          p_ttl_ms: envelope.op === 'release' ? 0 : SOURCE_LEASE_MS,
        }),
        envelope.op === 'claim' ? sampleWanted(db, key, envelope.sourceId) : false,
      ]);
      if (typeof answer.refused === 'string') return refused(answer as { refused: string });
      if (answer.held) return json({ ok: false, held: true, owner: answer.owner, message: 'Another agent holds this source. Try again once its claim has lapsed.' }, 409);
      // The page asked for a sample: the agent reads one and posts it (op `sample`).
      return json(wanted ? { ...answer, sample: true } : answer);
    }

    const { acquisition } = envelope;
    let projection: ReturnType<typeof projectSource> | null = null;
    // A changed report is evaluated as sent; an unchanged one against the accepted payload again, so
    // a field bound since that revision is filled (the database writes only paths never written).
    if (acquisition.status === 'changed' || acquisition.status === 'unchanged') {
      const context = await rpc<{ entry: unknown; payload: unknown; bindings: Record<string, Record<string, string>>; fields: Record<string, PanelField[]>; collections?: unknown } | null>(
        'control_source_context_by_key',
        { p_key: key, p_source: envelope.sourceId },
      );
      if (!context) return apiError('unauthorized', 'Unknown data key.', 401);
      // The database judges the registration (an unusable one refuses the report with nothing
      // written); the evaluator only needs its lists. No in-process budget here: the database counts
      // this source's ROWS against the shared budget, and a refused report must not spend /patch's.
      const read = readExternalRegistration(context.entry);
      const registration = read.ok ? read.registration : undefined;
      projection = projectSource({
        sourceId: envelope.sourceId,
        payload: acquisition.status === 'changed' ? acquisition.payload : context.payload,
        bindings: context.bindings,
        fieldsOf: (graphic) => (context.fields[graphic] ? descriptorsOf(context.fields[graphic]) : null),
        lists: registration?.lists,
        mapping: registration?.mapping,
        configRevision: registration?.configRevision,
        // E7.2b: the published collection recipes' leaves of this source (migration 0102; an
        // instance without it answers none, and only bound leaves are written, as before).
        collections: context.collections,
      });
    }
    const report = (writes: Record<string, unknown>) =>
      rpc<Record<string, unknown>>('control_source_report_by_key', {
        p_key: key,
        p_source: envelope.sourceId,
        p_report: { ...acquisition, claim: envelope.claim },
        p_writes: writes,
      });
    const typedPaths = Object.keys(projection?.typedWrites ?? {});
    const [answer, wanted] = await Promise.all([
      report({ ...projection?.typedWrites, ...projection?.writes }).catch((error: unknown) => {
        // E1.2a: a database before 0104 takes text only and refuses the whole report for a typed
        // value. The text goes on as before; the typed values wait, and the agent is told so.
        const message = error instanceof Error ? error.message : String(error);
        if (!projection || typedPaths.length === 0 || !message.includes('not a source report')) throw error;
        const prefix = `${sourcePrefix(envelope.sourceId, 'external')}.`;
        for (const path of typedPaths) {
          const leaf = path.slice(prefix.length);
          projection.problems[leaf] = TYPED_WAITS;
          projection.unfit.push(leaf);
        }
        return report(projection.writes);
      }),
      sampleWanted(db, key, envelope.sourceId),
    ]);
    if (typeof answer.refused === 'string') return refused(answer as { refused: string });
    if (wanted) answer.sample = true;
    if (!projection) return json(answer);
    // What the agent reports back to whoever runs it: a recipe that holds the whole source on every
    // report, and for a changed one what held, what to correct, and from where.
    const { missing, unfit, problems, held, provenance } = projection;
    const why = held ? { held } : {};
    return json(acquisition.status === 'changed' ? { ...answer, missing, unfit, problems, ...why, provenance } : { ...answer, ...why });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('unknown data key')) return apiError('unauthorized', 'Unknown data key.', 401);
    if (message.includes('switched off')) return apiError('unauthorized', 'Hosted control is switched off for this production.', 403);
    if (message.includes('too many commands')) return apiError('rate_limited', "The production's command log is saturated - slow down.", 429, {}, retryAfter(5));
    if (message.includes('data budget')) return refused({ refused: 'budget' });
    if (message.includes('not a source report')) return apiError('invalid', 'The report does not fit what the source registered.', 400);
    console.error('Data source failed:', message);
    return apiError('internal', 'The source could not be written.', 500);
  }
}

// ── A SAMPLE FOR THE CONNECT REVIEW (docs/work-specs/playout-api-mapping/spec.md, E5.2) ────────
//
// The page asks; the agent holding the source's claim reads the provider once with its own
// credential and posts what it would send; the page reads it. The sample is kept beside the
// source's own snapshot, in a row of `production_source_snapshots` under `<id>.sample`: an id no
// source can have (a source id has no dot), so the fence, the context and the claim, which all
// read the source's own row, never see it, and nothing evaluates or applies it. No migration: the
// table is service role only and its rows go with their production.

/** What a typed value says while the database takes only text (before migration 0104). */
const TYPED_WAITS = 'the database did not take typed values: it may need a NoaCG server update';

/** An ask older than this is not waited on any more: the page reads through the hosted fetcher. */
const SAMPLE_WAIT_MS = 60_000;
const sampleRowId = (sourceId: string) => `${sourceId}.sample`;

type Db = Awaited<ReturnType<typeof adminDb>>;
type SampleStatus = { asked?: string; sampledAt?: string };

async function showForKey(db: Db, key: string): Promise<string | null> {
  const { data, error } = await db.from('control_shows').select('id').eq('data_key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { id: string } | null)?.id ?? null;
}


async function sampleRow(db: Db, showId: string, sourceId: string): Promise<{ payload: unknown; status: SampleStatus } | null> {
  const { data, error } = await db.from('production_source_snapshots').select('payload, status').eq('show_id', showId).eq('source_id', sampleRowId(sourceId)).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as { payload: unknown; status: SampleStatus } | null) ?? null;
}

const pending = (status: SampleStatus | undefined, now: number): boolean =>
  Boolean(status?.asked && !status.sampledAt && now - Date.parse(status.asked) < SAMPLE_WAIT_MS);

/** Whether the page waits on a sample of this source: told to the agent with its claim or report.
 *  Best effort: a lookup that fails answers no, and never fails the claim or report beside it. */
async function sampleWanted(db: Db, key: string, sourceId: string): Promise<boolean> {
  try {
    const showId = await showForKey(db, key);
    return showId !== null && pending((await sampleRow(db, showId, sourceId))?.status, Date.now());
  } catch {
    return false;
  }
}

async function sample(
  envelope: Extract<SourceEnvelope, { op: 'sample' }>,
  key: string,
  db: Db,
  rpc: <T>(name: string, args: Record<string, unknown>) => Promise<T>,
  refused: (answer: { refused: string } & Record<string, unknown>) => Response,
): Promise<Response> {
  // The page's ask and read also need the registration: looked up beside the production.
  const [showId, context] = await Promise.all([
    showForKey(db, key),
    'claim' in envelope ? null : rpc<{ entry: unknown } | null>('control_source_context_by_key', { p_key: key, p_source: envelope.sourceId }),
  ]);
  if (!showId) return apiError('unauthorized', 'Unknown data key.', 401);
  const now = Date.now();
  const write = async (payload: unknown, status: SampleStatus) => {
    const { error } = await db.from('production_source_snapshots').upsert({
      show_id: showId,
      source_id: sampleRowId(envelope.sourceId),
      payload,
      byte_size: payload === null ? 0 : JSON.stringify(payload).length,
      status,
      status_at: new Date(now).toISOString(),
    });
    if (error) throw new Error(error.message);
  };

  if ('claim' in envelope) {
    // The agent's post: only under the claim that holds the source now, read and not renewed (a
    // renewal of a lapsed lease would hand out a new claim nobody holds), and only to an ask.
    const [holds, row] = await Promise.all([liveClaim(db, showId, envelope.sourceId, now, envelope.claim), sampleRow(db, showId, envelope.sourceId)]);
    if (!holds) return refused({ refused: 'moved' });
    if (!pending(row?.status, now)) return json({ ok: false, refused: 'not_asked', message: 'Nobody is waiting on a sample of this source.' }, 409);
    await write(envelope.sample, { asked: row!.status.asked, sampledAt: new Date(now).toISOString() });
    return json({ ok: true });
  }

  if (!context) return apiError('unauthorized', 'Unknown data key.', 401);
  const read = readExternalRegistration(context.entry);
  if (!read.ok) return refused({ refused: read.readOnly ? 'unsupported' : context.entry ? 'registration' : 'gone' });

  if (envelope.asked !== null) {
    // The page reads what its ask brought: the sample, or still waiting, or given up.
    const row = await sampleRow(db, showId, envelope.sourceId);
    if (row?.status.asked !== envelope.asked) return json({ ok: false, waiting: false });
    if (row.status.sampledAt) return json({ ok: true, sample: row.payload, sampledAt: row.status.sampledAt });
    return json({ ok: false, waiting: pending(row.status, now) });
  }

  // A new ask, kept only while an agent holds the source: without one the page reads the hosted way.
  const [held, open] = await Promise.all([liveClaim(db, showId, envelope.sourceId, now), sampleRow(db, showId, envelope.sourceId)]);
  if (!held) return json({ ok: false, agent: false });
  // An ask still waiting is shared: a second review waits on the same sample, never cancels the first.
  if (open && pending(open.status, now)) return json({ ok: false, waiting: true, asked: open.status.asked });
  const asked = new Date(now).toISOString();
  await write(null, { asked });
  return json({ ok: false, waiting: true, asked });
}

/** Whether an agent holds the source's lease now (and, given one, under this claim). */
async function liveClaim(db: Db, showId: string, sourceId: string, now: number, claim?: string): Promise<boolean> {
  const { data, error } = await db.from('control_source_reads').select('owner, claim, lease_until').eq('show_id', showId).eq('source_id', sourceId).maybeSingle();
  if (error) throw new Error(error.message);
  const lease = data as { owner: string | null; claim: string | null; lease_until: string } | null;
  return lease?.owner === 'agent' && Date.parse(lease.lease_until) > now && (claim === undefined || lease.claim === claim);
}

interface Handler {
  fetch(req: Request): Promise<Response>;
}

const ROUTES: Record<string, Handler> = {
  update: { fetch: update },
  patch: { fetch: patch },
  state: { fetch: state },
  tick: { fetch: tick },
  feed: { fetch: feed },
  source: { fetch: source },
};

export default {
  async fetch(req: Request): Promise<Response> {
    const path = new URL(req.url).pathname.replace(/^\/api\/data\/?/, '').split('/')[0];
    const handler = ROUTES[path];
    return handler ? handler.fetch(req) : apiError('not_found', 'Not found', 404);
  },
};
