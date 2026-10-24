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
import { feedNetwork, readFeed, supabaseFeedStore, type FeedIo } from '../_lib/feedFetch.js';
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
import { parseSourceEnvelope, readExternalRegistration, SOURCE_BODY_BYTES, SOURCE_LEASE_MS } from '../../src/control/externalSource.js';
import { projectSource } from '../../src/control/sourceMapping.js';

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
  const address = new URL(req.url).searchParams.get('url');
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

/** A source refusal's HTTP status (migration 0101's codes). Everything is refused before writing. */
const SOURCE_REFUSALS: Record<string, { status: number; message: string }> = {
  gone: { status: 404, message: 'This production has no connector source with that id. Connect it first.' },
  unsupported: { status: 422, message: 'This source is a later version than this server reads, so it is held read-only.' },
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
    const headers = answer.refused === 'too_soon' || answer.refused === 'budget' ? retryAfter(Math.max(1, Math.ceil(Number(answer.retryMs ?? 5000) / 1000))) : {};
    return json({ ok: false, ...answer, message: known.message }, known.status, headers);
  };

  try {
    if (envelope.op !== 'report') {
      const answer = await rpc<Record<string, unknown>>('control_source_claim_by_key', {
        p_key: key,
        p_source: envelope.sourceId,
        p_config_revision: envelope.configRevision,
        p_claim: envelope.claim,
        p_ttl_ms: envelope.op === 'release' ? 0 : SOURCE_LEASE_MS,
      });
      if (typeof answer.refused === 'string') return refused(answer as { refused: string });
      if (answer.held) return json({ ok: false, held: true, owner: answer.owner, message: 'Another agent holds this source. Try again once its claim has lapsed.' }, 409);
      return json(answer);
    }

    const { acquisition } = envelope;
    let writes: Record<string, string> = {};
    let missing: string[] = [];
    let unfit: string[] = [];
    if (acquisition.status === 'changed') {
      const context = await rpc<{ entry: unknown; bindings: Record<string, Record<string, string>>; fields: Record<string, PanelField[]> } | null>(
        'control_source_context_by_key',
        { p_key: key, p_source: envelope.sourceId },
      );
      if (!context) return apiError('unauthorized', 'Unknown data key.', 401);
      // A registration this build cannot read is refused here, before a revision could be accepted
      // with nothing applied. A missing one is the database's to answer (`gone` also takes the fence).
      // No in-process budget here: the database counts this source's ROWS against the shared budget,
      // and a refused report (paused, too soon, an old claim) must not spend /patch's requests.
      const registration = readExternalRegistration(context.entry);
      if (context.entry && !registration.ok) {
        return json({ ok: false, refused: registration.readOnly ? 'unsupported' : 'registration', message: registration.error }, 422);
      }
      const lists = registration.ok ? registration.registration.lists : undefined;
      ({ writes, missing, unfit } = projectSource({
        sourceId: envelope.sourceId,
        payload: acquisition.payload,
        bindings: context.bindings,
        fieldsOf: (graphic) => (context.fields[graphic] ? descriptorsOf(context.fields[graphic]) : null),
        lists,
      }));
    }
    const answer = await rpc<Record<string, unknown>>('control_source_report_by_key', {
      p_key: key,
      p_source: envelope.sourceId,
      p_report: { ...acquisition, claim: envelope.claim },
      p_writes: writes,
    });
    if (typeof answer.refused === 'string') return refused(answer as { refused: string });
    return json({ ...answer, ...(acquisition.status === 'changed' ? { missing, unfit } : {}) });
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
