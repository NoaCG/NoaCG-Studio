// Paid AI requests fail CLOSED when the /admin switches or the account's plan cannot be read
// (#2034). Every paid route is driven through its real handler against a fake database and a
// stubbed model: nothing here reaches a network, a provider or a real ledger.
//
// For each route and each lookup, a failed read refuses with zero paid work - no ledger call
// (reservation, judge booking, Pro admission) and no model request - and an eligible request with
// readable settings and plan still goes through, with the daily caps applying as before.

import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import analyze from './importAnalysis/analyze.js';
import liteGenerations from './lite/generations.js';
import liteJudge from './lite/judge.js';
import proGenerations from './pro/generations.js';
import generate from '../ai/generate.js';
import { resolveProGate } from './pro/gate.js';
import { getLiteGenerationStore } from './aiLiteStore.js';
import { resetAdminDb } from './adminAuth.js';
import { resetSystemSettingsCache, systemSettings } from './systemSettings.js';
import { loadEntitlementRows, resolvePaidAiAccess, resolveUserEntitlement } from './entitlements.js';
import { liteProfile } from './aiLiteProfile.js';
import { proProfile } from './aiProProfile.js';
import { importAnalysisProfile } from './aiImportAnalysisProfile.js';
import { resetTaskRateLimitForTests } from './aiLiteRateLimit.js';
import { allows } from '../../src/entitlements/contract.js';
import { IMPORT_ANALYSIS_GRAPHIC_TYPES } from '../../src/ai/importAnalysis/contract.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

const DB = 'http://db.test';
/** A fresh account per test, so one test's bookings never count against another's caps. */
let users = 0;
let USER = '';
const TOKEN = `e30.${Buffer.from(JSON.stringify({ sub: 'signed-in', session_id: 's-1' })).toString('base64url')}.c2ln`;
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

/** The account reads one request makes. Each can be made to fail on its own. */
const ACCOUNT_READS = ['user_accounts', 'user_plans', 'user_grants', 'auth.users', 'plan_email_domains'] as const;
type AccountRead = (typeof ACCOUNT_READS)[number];

interface FakeDb {
  /** 'error': the query answers a database error; 'throw': the request itself fails. */
  settings: 'ok' | 'error' | 'throw';
  failAccount?: AccountRead;
  disabledRoutes?: string[];
  plan?: { features?: Record<string, boolean>; limits?: Record<string, number> };
  suspended?: boolean;
}

let db: FakeDb = { settings: 'ok' };
let modelAnswer: () => unknown = () => ({ text: 'ok' });
const sent = { model: [] as string[], other: [] as string[] };

const user = () => ({ id: USER, aud: 'authenticated', role: 'authenticated', email: 'someone@example.com', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' });

function dbError(table: string): Response {
  return Response.json({ code: '42501', message: `permission denied for table ${table}` }, { status: 403 });
}

function completion(output: unknown): Response {
  const text = typeof output === 'string' ? output : JSON.stringify(output);
  return Response.json({
    choices: [{
      message: { content: text, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'emit', arguments: text } }] },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0.0001 },
  });
}

// One stable stub for the whole file: the Supabase clients capture `fetch` when they are built.
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = input instanceof Request ? input.url : String(input);
  if (!url.startsWith(DB)) {
    sent.model.push(url);
    return completion(modelAnswer());
  }
  const path = url.slice(DB.length);
  if (path.startsWith('/auth/v1/user')) return Response.json(user());
  const fail = (read: AccountRead | 'system_settings') => {
    if (read === 'system_settings' ? db.settings === 'throw' : false) throw new TypeError('fetch failed');
    return dbError(read);
  };
  if (path.startsWith('/auth/v1/admin/users/')) return db.failAccount === 'auth.users' ? fail('auth.users') : Response.json(user());
  if (path.startsWith('/rest/v1/system_settings')) {
    if (db.settings !== 'ok') return fail('system_settings');
    return Response.json(db.disabledRoutes ? [{ key: 'disabled_routes', value: db.disabledRoutes }] : []);
  }
  for (const table of ACCOUNT_READS) {
    if (path.startsWith(`/rest/v1/${table}`)) {
      if (db.failAccount === table) return fail(table);
      if (table === 'user_accounts' && db.suspended) return Response.json([{ state: 'suspended' }]);
      if (table === 'user_plans' && db.plan) {
        return Response.json([{
          expires_at: null,
          plans: { key: 'test', name: 'Test', features: db.plan.features ?? {}, limits: db.plan.limits ?? {}, render_tier: 'free', render_formats: null },
        }]);
      }
      return Response.json([]);
    }
  }
  // The gateway's content-free accounting row (ai_gateway_requests) and anything else.
  sent.other.push(path.split('?')[0]);
  return Response.json([], { status: 201 });
}) as typeof fetch;

const ENV: Record<string, string> = {
  SUPABASE_URL: DB,
  SUPABASE_ANON_KEY: 'anon-test-key',
  SUPABASE_SECRET_KEY: 'test-service-key-never-leaves',
  IP_HASH_SALT: 'test-salt-0123456789abcdef',
  AI_LITE_EVAL_MEMORY_LEDGER: '1',
  AI_GATEWAY_API_KEY: 'test-managed-key',
  AI_LITE_GATEWAY_PROVIDERS: 'audited/provider',
  AI_PRO_GATEWAY_PROVIDERS: 'vertex',
  AI_TASK_IMPORT_ANALYSIS_ENABLED: '1',
  AI_LITE_ENABLED: '1',
  AI_LITE_JUDGE_ENABLED: '1',
  AI_PRO_ENABLED: '1',
};
const saved = new Map(Object.keys(ENV).map((name) => [name, process.env[name]]));

/** Every call the ledger store receives - reservation, judge booking, Pro admission, update. */
const ledger: string[] = [];
let storeWrapped = false;

beforeEach(async () => {
  Object.assign(process.env, ENV);
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  USER = `0b0c0d0e-0000-4000-8000-${String((users += 1)).padStart(12, '0')}`;
  db = { settings: 'ok' };
  modelAnswer = () => ({ text: 'ok' });
  sent.model.length = 0;
  sent.other.length = 0;
  ledger.length = 0;
  resetSystemSettingsCache();
  resetAdminDb();
  resetTaskRateLimitForTests();
  if (!storeWrapped) {
    const store = await getLiteGenerationStore();
    const proto = Object.getPrototypeOf(store) as Record<string, unknown>;
    for (const name of Object.getOwnPropertyNames(proto)) {
      const method = proto[name];
      if (name === 'constructor' || typeof method !== 'function') continue;
      (store as unknown as Record<string, unknown>)[name] = (...args: unknown[]) => {
        ledger.push(name);
        return (method as (...a: unknown[]) => unknown).apply(store, args);
      };
    }
    storeWrapped = true;
  }
});

afterEach(() => {
  for (const [name, value] of saved) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  resetSystemSettingsCache();
});

let counter = 0;
const ip = () => `203.0.113.${(counter += 1) % 250}`;
const key = (label: string) => `${label}-${String((counter += 1)).padStart(12, '0')}-key`;

function post(url: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`https://noacg.test${url}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${TOKEN}`, 'x-forwarded-for': ip(), ...headers },
    body: JSON.stringify(body),
  });
}

/** Every way a lookup can fail: the settings read (an error answer, a dead connection), and
 *  each account read on its own. */
const FAILURES: Array<[string, FakeDb]> = [
  ['the settings read answers an error', { settings: 'error' }],
  ['the settings read cannot connect', { settings: 'throw' }],
  ...ACCOUNT_READS.map((read): [string, FakeDb] => [`the ${read} read fails`, { settings: 'ok', failAccount: read }]),
];

async function assertRefusedWithNothingPaid(response: Response, label: string, retryable = true): Promise<void> {
  const body = await response.json() as { error: { code: string; message: string; retryable: boolean } };
  assert.equal(response.status, 503, `${label}: ${JSON.stringify(body)}`);
  assert.match(body.error.message, /temporarily unavailable|currently unavailable/, label);
  assert.equal(body.error.retryable, retryable, label);
  assert.deepEqual(ledger, [], `${label}: no ledger call`);
  assert.deepEqual(sent.model, [], `${label}: no model request`);
}

// ── the seam itself ──────────────────────────────────────────────────────────────────────

test('the strict reader names the read that failed; the fail-open readers keep their defaults', async () => {
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    const access = await resolvePaidAiAccess(USER);
    assert.deepEqual(access, { ok: false, failed: failure.settings === 'ok' ? 'account' : 'settings' }, label);
    // Non-paid reads are unchanged: empty settings and the default plan, never a throw.
    assert.deepEqual((await systemSettings()).disabledRoutes, [], label);
    assert.equal(allows(await resolveUserEntitlement(USER), 'ai.lite'), true, label);
    assert.equal((await loadEntitlementRows(USER)).accountState, 'active', label);
  }
  db = { settings: 'ok', suspended: true, disabledRoutes: ['vercel:some/model'] };
  resetSystemSettingsCache();
  const read = await resolvePaidAiAccess(USER);
  assert.ok(read.ok);
  assert.deepEqual(read.settings.disabledRoutes, ['vercel:some/model']);
  assert.equal(allows(read.entitlement, 'ai.lite'), false, 'a readable suspension still refuses');
});

// ── image analysis (/api/ai/tasks/import-analysis) ──────────────────────────────────────

const analysisRequest = () => ({
  idempotencyKey: key('analysis'),
  image: { mediaType: 'image/png', base64: PNG, width: 64, height: 64 },
});
const analysisOutput = () => ({
  version: 1, graphicType: IMPORT_ANALYSIS_GRAPHIC_TYPES[0], graphicTypeConfidence: 0.9, canvas: { aspect: 1.78 }, regions: [], warnings: [],
});

test('image analysis refuses on every failed lookup with nothing booked or sent', async () => {
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    await assertRefusedWithNothingPaid(await analyze.fetch(post('/api/ai/tasks/import-analysis', analysisRequest())), label);
  }
});

test('image analysis: an eligible request succeeds, and the switches and caps still apply', async () => {
  modelAnswer = analysisOutput;
  const ok = await analyze.fetch(post('/api/ai/tasks/import-analysis', analysisRequest()));
  assert.equal(ok.status, 200, await ok.clone().text());
  assert.equal((await ok.json() as { analysis: { version: number } }).analysis.version, 1);
  assert.equal(sent.model.length, 1);
  assert.ok(ledger.includes('reserve'));

  // A readable kill switch and a readable plan still refuse, as before.
  const route = importAnalysisProfile().route;
  db = { settings: 'ok', disabledRoutes: [`${route.provider}:${route.model}`] };
  resetSystemSettingsCache();
  assert.equal((await analyze.fetch(post('/api/ai/tasks/import-analysis', analysisRequest()))).status, 503);
  db = { settings: 'ok', plan: { features: { 'ai.import-analysis': false } } };
  resetSystemSettingsCache();
  assert.equal((await analyze.fetch(post('/api/ai/tasks/import-analysis', analysisRequest()))).status, 403);
  assert.equal(sent.model.length, 1, 'neither refusal called the model');

  // The daily cap: one start allowed, the second refused by the ledger before the model.
  db = { settings: 'ok' };
  resetSystemSettingsCache();
  process.env.AI_IMPORT_ANALYSIS_DAILY_STARTS = '1';
  try {
    // The success above was this user's one start today, so the cap is reached.
    const first = await analyze.fetch(post('/api/ai/tasks/import-analysis', analysisRequest()));
    assert.equal(first.status, 429, await first.clone().text());
    assert.equal((await first.json() as { error: { code: string } }).error.code, 'allowance_exhausted');
    assert.equal(sent.model.length, 1, 'the capped request never reached the model');
  } finally {
    delete process.env.AI_IMPORT_ANALYSIS_DAILY_STARTS;
  }
});

// ── NoaCG Lite generation (/api/ai/lite/generations) ────────────────────────────────────

const liteRequest = () => ({
  idempotencyKey: key('lite'),
  prompt: 'A lower third for a news anchor called Ada Lovelace',
  resolution: { width: 1920, height: 1080 },
  fps: 50,
});

test('Lite generation refuses on every failed lookup with nothing booked or sent', async () => {
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    await assertRefusedWithNothingPaid(await liteGenerations.fetch(post('/api/ai/lite/generations', liteRequest())), label);
  }
});

test('Lite generation: an eligible request books and calls the model, and the plan cap still applies', async () => {
  // The stub's answer is not a usable Lite design, so the generation itself fails after the
  // paid call; what this pins is that the strict reads let an eligible request through.
  const eligible = await liteGenerations.fetch(post('/api/ai/lite/generations', liteRequest()));
  assert.notEqual(eligible.status, 503, await eligible.clone().text());
  assert.ok(ledger.includes('reserve'), 'the eligible request was booked');
  assert.ok(sent.model.length >= 1, 'and reached the model');

  // A plan's daily cap still reaches the reservation through the strict read.
  ledger.length = 0;
  sent.model.length = 0;
  db = { settings: 'ok', plan: { limits: { aiDailyStarts: 0 } } };
  resetSystemSettingsCache();
  const capped = await liteGenerations.fetch(post('/api/ai/lite/generations', liteRequest()));
  assert.equal(capped.status, 429, await capped.clone().text());
  assert.equal((await capped.json() as { error: { code: string } }).error.code, 'allowance_exhausted');
  assert.deepEqual(sent.model, [], 'the capped request never reached the model');

  // A readable suspension and a readable kill switch on both routes still refuse.
  db = { settings: 'ok', suspended: true };
  resetSystemSettingsCache();
  assert.equal((await liteGenerations.fetch(post('/api/ai/lite/generations', liteRequest()))).status, 403);
  const profile = liteProfile();
  const off = (route: ModelRoute) => `${route.provider}:${route.model}`;
  db = { settings: 'ok', disabledRoutes: [off(profile.primary), off(profile.fallback)] };
  resetSystemSettingsCache();
  assert.equal((await liteGenerations.fetch(post('/api/ai/lite/generations', liteRequest()))).status, 503);
  assert.deepEqual(sent.model, []);
});

// ── the Lite skin judge (/api/ai/lite/judge) ────────────────────────────────────────────

async function liveGeneration(): Promise<string> {
  const store = await getLiteGenerationStore();
  const reservation = await store.reserve({
    userId: USER, ipHash: 'test-ip-hash', idempotencyKey: key('judge-gen'), requestedCategory: null, now: Date.now(), profile: liteProfile(),
  });
  assert.equal(reservation.status, 'created');
  if (reservation.status !== 'created') throw new Error('unreachable');
  ledger.length = 0;
  return reservation.record.id;
}

const judgeRequest = (generationId: string) => ({
  generationId,
  brief: 'A calm news lower third',
  skinSummary: 'navy panel, white type',
  imageBase64: `iVBORw0KGgo${'A'.repeat(117)}`,
});
const judgement = { legibility: 5, textIntegrity: 5, hierarchy: 4, briefFit: 4, strapShape: 4, reason: 'Clean and readable.' };

test('the Lite judge refuses on every failed lookup with nothing booked or sent', async () => {
  const generationId = await liveGeneration();
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    await assertRefusedWithNothingPaid(await liteJudge.fetch(post('/api/ai/lite/judge', judgeRequest(generationId))), label);
  }
});

test('the Lite judge: an eligible request is judged, and the per-generation cap still applies', async () => {
  process.env.AI_LITE_JUDGE_MAX_PER_GENERATION = '1';
  try {
    const generationId = await liveGeneration();
    modelAnswer = () => judgement;
    const ok = await liteJudge.fetch(post('/api/ai/lite/judge', judgeRequest(generationId)));
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal((await ok.json() as { scores: { legibility: number } }).scores.legibility, 5);
    assert.deepEqual([ledger.includes('reserveJudge'), sent.model.length], [true, 1]);

    const again = await liteJudge.fetch(post('/api/ai/lite/judge', judgeRequest(generationId)));
    assert.notEqual(again.status, 200, 'the cap of one judgement per generation still holds');
    assert.equal(sent.model.length, 1, 'the capped call never reached the model');
  } finally {
    delete process.env.AI_LITE_JUDGE_MAX_PER_GENERATION;
  }
});

// ── hosted NoaCG Pro: the reservation (/api/ai/pro) and its managed calls (/api/ai/generate) ──

test('the Pro gate and reservation refuse on every failed lookup with nothing booked', async () => {
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    const gate = await resolveProGate(post('/api/ai/pro', {}));
    assert.deepEqual([gate.available, gate.reason], [false, 'disabled'], label);
    await assertRefusedWithNothingPaid(await proGenerations.fetch(post('/api/ai/pro', { idempotencyKey: key('pro') })), label);
  }
});

async function proReservation(): Promise<string> {
  const response = await proGenerations.fetch(post('/api/ai/pro', { idempotencyKey: key('pro') }));
  assert.equal(response.status, 201, await response.clone().text());
  return (await response.json() as { generationId: string }).generationId;
}

const proCall = (proGenerationId: string) => ({
  route: proProfile().routes[0],
  request: { system: 'You generate concepts.', messages: [{ role: 'user', content: 'a lower third' }] },
  surface: 'pro',
  proGenerationId,
});

test('a managed Pro call refuses on every failed lookup before its admission and the model', async () => {
  const generationId = await proReservation();
  for (const [label, failure] of FAILURES) {
    db = failure;
    resetSystemSettingsCache();
    ledger.length = 0;
    await assertRefusedWithNothingPaid(await generate.fetch(post('/api/ai/generate', proCall(generationId))), label);
  }
});

test('hosted Pro: an eligible reservation and call succeed, and the daily cap still applies', async () => {
  process.env.AI_PRO_DAILY_STARTS = '1';
  try {
    const generationId = await proReservation();
    assert.ok(ledger.length > 0, 'the reservation was booked');
    const call = await generate.fetch(post('/api/ai/generate', proCall(generationId)));
    assert.equal(call.status, 200, await call.clone().text());
    assert.ok(ledger.includes('admitProCall'));
    assert.equal(sent.model.length, 1);

    const capped = await proGenerations.fetch(post('/api/ai/pro', { idempotencyKey: key('pro') }));
    assert.equal(capped.status, 429, await capped.clone().text());
    assert.equal((await capped.json() as { error: { code: string } }).error.code, 'allowance_exhausted');
  } finally {
    delete process.env.AI_PRO_DAILY_STARTS;
  }
});

// ── the managed proxy's untagged traffic (/api/ai/generate) ──────────────────────────────

const managedCall = () => ({
  route: { provider: 'vercel', model: 'openai/gpt-5-mini' },
  request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
});

test('an untagged managed call refuses when the switches cannot be read, and runs when they can', async () => {
  {
    for (const settings of ['error', 'throw'] as const) {
      db = { settings };
      resetSystemSettingsCache();
      const refused = await generate.fetch(post('/api/ai/generate', managedCall()));
      assert.equal(refused.status, 503, settings);
      assert.deepEqual(sent.model, [], `${settings}: no model request`);
      // Only the content-free accounting row, which records the refusal itself.
      assert.ok(sent.other.every((path) => path === '/rest/v1/ai_gateway_requests'), sent.other.join());
    }
    db = { settings: 'ok' };
    resetSystemSettingsCache();
    const ok = await generate.fetch(post('/api/ai/generate', managedCall()));
    assert.equal(ok.status, 200, await ok.clone().text());
    assert.equal(sent.model.length, 1);
  }
});
