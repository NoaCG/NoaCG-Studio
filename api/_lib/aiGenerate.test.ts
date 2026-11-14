import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import generate from '../ai/generate.js';
import { executeGatewayRequest, GatewayError } from './aiGateway.js';
import { studioEditorErrorMessage } from './aiEditorPolicy.js';
import { gatewayLedgerConfigured, gatewayLedgerEntry } from './aiGatewayLedger.js';
import { aiGenerateRateLimitCaps } from './rateLimit.js';
import { userAiKeysCookie } from './aiCredentials.js';
import type { AiGatewayRequestBody, ModelResult } from '../../src/ai/modelTypes.js';

const ENV = [
  'AI_GENERATE_RATE_WINDOW_SEC',
  'AI_GENERATE_RATE_MAX',
  'ANTHROPIC_API_KEY',
  'SUPABASE_URL',
  'VITE_SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'VITE_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'IP_HASH_SALT',
  'AI_GATEWAY_API_KEY',
  'AI_KEY_ENCRYPTION_SECRET',
  'VITE_AI_PROVIDER',
  'VITE_AI_MODEL',
  'VITE_AI_FALLBACKS',
] as const;
const original = new Map(ENV.map((name) => [name, process.env[name]]));

beforeEach(() => {
  for (const name of ENV) delete process.env[name];
});

afterEach(() => {
  for (const name of ENV) {
    const value = original.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

let requestCounter = 0;

/** Each call site gets its own client IP so tests never share a rate-limit bucket. */
function gatewayRequest(ip: string, body?: unknown): Request {
  return new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': ip },
    body: JSON.stringify(body ?? {
      route: { provider: 'anthropic', model: 'claude-sonnet-5' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
    }),
  });
}

function uniqueIp(): string {
  requestCounter += 1;
  return `203.0.113.${requestCounter}`;
}

test('gateway rate limit caps read env overrides and default to 60/minute', () => {
  const defaults = aiGenerateRateLimitCaps();
  assert.equal(defaults.windowMs, 60_000);
  assert.equal(defaults.max, 60);

  process.env.AI_GENERATE_RATE_WINDOW_SEC = '10';
  process.env.AI_GENERATE_RATE_MAX = '5';
  const configured = aiGenerateRateLimitCaps();
  assert.equal(configured.windowMs, 10_000);
  assert.equal(configured.max, 5);
});

test('the gateway refuses a hammering client with 429 + Retry-After before reading the body', async () => {
  process.env.AI_GENERATE_RATE_MAX = '2';
  const ip = uniqueIp();

  // Within the cap the guard stays out of the way (no key configured -> 412, not 429).
  const first = await generate.fetch(gatewayRequest(ip));
  assert.equal(first.status, 412);
  const second = await generate.fetch(gatewayRequest(ip));
  assert.equal(second.status, 412);

  const refused = await generate.fetch(gatewayRequest(ip));
  assert.equal(refused.status, 429);
  assert.ok(Number(refused.headers.get('retry-after')) >= 1);
  const refusedBody = await refused.json() as { error: { code: string; retryable: boolean } };
  assert.equal(refusedBody.error.code, 'rate_limited');
  assert.equal(refusedBody.error.retryable, true);

  // A different client is unaffected.
  const other = await generate.fetch(gatewayRequest(uniqueIp()));
  assert.equal(other.status, 412);
});

test('a video-tagged call from a caller the server cannot recognise is NOT refused', async () => {
  // The ai.video gate binds recognised accounts only. With no backend configured every
  // caller resolves the ANONYMOUS defaults - which set ai.video false - so a gate keyed on
  // the resolved answer alone would take account-free BYO video away from every self-hosted
  // instance. 412 (no key configured) is the pre-existing answer and must stay it.
  const request = new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': uniqueIp(), authorization: 'Bearer stale-or-unverifiable' },
    body: JSON.stringify({
      route: { provider: 'anthropic', model: 'claude-sonnet-5' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
      surface: 'video',
    }),
  });
  const response = await generate.fetch(request);
  assert.equal(response.status, 412);
});

test('a pro-tagged call follows the same recognised-account-only gate as video', async () => {
  // Same posture as the video test above: with no backend configured the caller cannot be
  // recognised, so the ai.pro gate must not fire - 412 (no key) is the pre-existing answer.
  const request = new Request('https://noacg.test/api/ai/generate', {
    method: 'POST',
    headers: { 'x-forwarded-for': uniqueIp(), authorization: 'Bearer stale-or-unverifiable' },
    body: JSON.stringify({
      route: { provider: 'vercel', model: 'vendor/image-model' },
      request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }], expect: 'image' },
      surface: 'pro',
    }),
  });
  const response = await generate.fetch(request);
  assert.equal(response.status, 412);
});

test('an unknown surface is refused outright rather than downgraded to the ungated path', async () => {
  const response = await generate.fetch(gatewayRequest(uniqueIp(), {
    route: { provider: 'anthropic', model: 'claude-sonnet-5' },
    request: { system: 'You are a test.', messages: [{ role: 'user', content: 'hi' }] },
    surface: 'not-a-surface',
  }));
  assert.equal(response.status, 400);
  const body = await response.json() as { error: { code: string } };
  assert.equal(body.error.code, 'invalid_request');
});

const LEDGER_BODY: AiGatewayRequestBody = {
  route: { provider: 'anthropic', model: 'claude-sonnet-5' },
  request: { system: 'You are a test.', messages: [{ role: 'user', content: 'secret prompt text' }] },
};

test('the ledger entry is content-free accounting: route, key source, usage, outcome - never text', () => {
  const result: ModelResult = {
    output: 'secret generated output',
    provider: 'vercel',
    model: 'z-ai/glm-5',
    attempts: [
      { route: { provider: 'anthropic', model: 'claude-sonnet-5' }, attempts: 2 },
      { route: { provider: 'vercel', model: 'z-ai/glm-5' }, attempts: 1 },
    ],
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140,
      cachedInputTokens: 25,
      reasoningTokens: 5,
      estimatedCost: { amount: 0.0031, currency: 'USD', source: 'provider' },
    },
  };
  const entry = gatewayLedgerEntry({
    userId: 'user-1',
    ipHash: 'ip-hash-1',
    body: { ...LEDGER_BODY, fallbacks: [{ provider: 'vercel', model: 'z-ai/glm-5' }] },
    userKeys: { vercel: 'sk-user-key' },
    result,
  });

  // The executed route is charged, and the user's own key marks it 'byo'.
  assert.equal(entry.task, 'byo-generate');
  assert.equal(entry.provider, 'vercel');
  assert.equal(entry.model, 'z-ai/glm-5');
  assert.equal(entry.keySource, 'byo');
  assert.equal(entry.outcome, 'ok');
  assert.equal(entry.attemptCount, 3);
  assert.equal(entry.inputTokens, 100);
  assert.equal(entry.outputTokens, 40);
  assert.equal(entry.cachedInputTokens, 25);
  assert.equal(entry.reasoningTokens, 5);
  assert.equal(entry.providerCostUsd, 0.0031);

  // Content-free by construction: exactly these fields, nothing that could carry
  // prompts, messages, or generated output.
  assert.deepEqual(Object.keys(entry).sort(), [
    'attemptCount', 'cachedInputTokens', 'inputTokens', 'ipHash', 'keySource', 'model',
    'outcome', 'outputTokens', 'provider', 'providerCostUsd', 'reasoningTokens', 'task', 'userId',
  ]);
  const serialized = JSON.stringify(entry);
  assert.ok(!serialized.includes('secret prompt text'));
  assert.ok(!serialized.includes('secret generated output'));
});

test('a pro-tagged execution ledgers as pro-generate so gateway accounting can tell it apart', () => {
  const entry = gatewayLedgerEntry({
    userId: null,
    ipHash: 'ip-hash-pro',
    body: { ...LEDGER_BODY, surface: 'pro' },
    userKeys: {},
    errorCode: 'missing_key',
  });
  assert.equal(entry.task, 'pro-generate');
});

test('a failed execution ledgers the primary route with zero usage and the error code', () => {
  const entry = gatewayLedgerEntry({
    userId: null,
    ipHash: 'ip-hash-2',
    body: LEDGER_BODY,
    userKeys: {},
    errorCode: 'missing_key',
  });
  assert.equal(entry.provider, 'anthropic');
  assert.equal(entry.model, 'claude-sonnet-5');
  assert.equal(entry.keySource, 'managed');
  assert.equal(entry.outcome, 'missing_key');
  assert.equal(entry.attemptCount, 0);
  assert.equal(entry.inputTokens, 0);
  assert.equal(entry.providerCostUsd, 0);
});

test('the gateway ledger requires the Supabase URL and secret key', () => {
  assert.equal(gatewayLedgerConfigured(), false);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  assert.equal(gatewayLedgerConfigured(), false);
  process.env.SUPABASE_SECRET_KEY = 'server-secret';
  assert.equal(gatewayLedgerConfigured(), true);
});

// ── the Pro surface's routing policy, on the REAL endpoint ───────────────────────────────
//
// `surfaceRoutePolicy` is unit-tested as a pure function in aiGateway.test.ts. That proves it
// RETURNS the right object and nothing more; these prove the endpoint actually attaches it to
// the request that leaves the process, which is the only version of the claim /admin makes.
//
// It matters because the claim is a privacy one. docs/MODEL_ROUTE_AUDITS.md records that
// google/gemini-3.1-flash-image is ZDR-servable on exactly one of its two endpoints, and the
// Models page prints "audited: yes" on the strength of it. If the directives silently stopped
// being sent, the badge would keep saying yes while the concept prompt - a named person and
// their role, on a real lower third - went to whichever endpoint was cheapest.
//
// What these CANNOT prove: that OpenRouter accepts the combination. That needs a real call and
// real money; this is the half that is free and belongs in the build gate.

/** A 1x1 PNG as a data URL - the smallest thing parseImageDataUrl() accepts. */
const PIXEL_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

/** Drive the real handler with a captured fetch, and hand back the JSON body it sent. */
async function capturePayload(body: unknown, headers: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const realFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = (async (_input: unknown, init?: { body?: unknown }) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    // A real image answer: the Pro concept call sets expect:'image', and the adapter refuses
    // a text-only reply as malformed - so a stub returning text would test the retry path
    // rather than the routing directives.
    return new Response(JSON.stringify({
      choices: [{ message: { content: null, images: [{ image_url: { url: PIXEL_PNG } }] } }],
      usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0 },
    }), { headers: { 'content-type': 'application/json' } });
  }) as typeof globalThis.fetch;
  try {
    const response = await generate.fetch(new Request('https://noacg.test/api/ai/generate', {
      method: 'POST',
      headers: { 'x-forwarded-for': uniqueIp(), ...headers },
      body: JSON.stringify(body),
    }));
    assert.equal(response.status, 200, 'the captured call should have succeeded');
  } finally {
    globalThis.fetch = realFetch;
  }
  return sent;
}

const PRO_CALL = {
  route: { provider: 'vercel', model: 'google/gemini-3.1-flash-image' },
  request: { system: 'You generate concepts.', messages: [{ role: 'user', content: 'a lower third' }], expect: 'image' },
  surface: 'pro',
};

test('a managed Pro call leaves the process asking for zero data retention', async () => {
  process.env.AI_GATEWAY_API_KEY = 'test-managed-key';
  const sent = await capturePayload(PRO_CALL);

  const options = sent.providerOptions as Record<string, unknown> | undefined;
  const gateway = options?.gateway as Record<string, unknown> | undefined;
  assert.ok(gateway, 'the Pro surface must attach a gateway routing block');
  assert.equal(gateway.zeroDataRetention, true);
  // The gateway serves a ZDR request only from providers under a verified ZDR agreement, so
  // "deny collection" and "no silent fallback off the audited endpoint" are properties of the
  // route it picks - there is nothing left to pin, which is why those keys are gone.
  assert.equal(gateway.sort, 'cost');
  assert.deepEqual(gateway.tags, ['surface:pro']);
  // An empty allowlist would read as "no provider permitted" and refuse every route.
  assert.equal('only' in gateway, false);
});

test('an untagged call is unchanged - the policy is opt-in per surface', async () => {
  // The mutation guard for the test above: if `providerOptions` appeared on every managed call, the
  // assertions there would pass for a reason that has nothing to do with the Pro surface.
  process.env.AI_GATEWAY_API_KEY = 'test-managed-key';
  const sent = await capturePayload({ ...PRO_CALL, surface: undefined });
  assert.equal('providerOptions' in sent, false, 'an untagged call must carry no routing directives');
});

test('a BYO Pro call is NOT policied - a user key is not ours to route', async () => {
  // The line api/ai/generate.ts already draws for the disabled-route switch: somebody spending
  // their own money on a model they chose does not get our routing opinions attached.
  process.env.AI_KEY_ENCRYPTION_SECRET = 'a'.repeat(64);
  process.env.AI_GATEWAY_API_KEY = 'test-managed-key';
  const cookie = userAiKeysCookie(
    new Request('https://noacg.test/api/ai/credentials', { headers: { origin: 'https://noacg.test' } }),
    { vercel: 'user-supplied-key' },
    null,
  ).split(';')[0];

  const sent = await capturePayload(PRO_CALL, { cookie });
  assert.equal('providerOptions' in sent, false, 'a BYO call must not carry our routing directives');
});

for (const authorization of [null, 'Bearer stale-or-unverifiable']) test('generic managed editor gateway requires recognised hosted auth: ' + String(authorization), async () => {
  process.env.SUPABASE_URL = 'https://isolated-auth.test';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  process.env.ANTHROPIC_API_KEY = 'managed-test-key';
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async input => { calls.push(String(input)); throw Error('No network is allowed in this auth refusal fixture.'); }) as typeof globalThis.fetch;
  try {
    const response = await generate.fetch(new Request('https://noacg.test/api/ai/generate', {
      method: 'POST', headers: { 'x-forwarded-for': uniqueIp(), ...(authorization ? { authorization } : {}) },
      body: JSON.stringify(LEDGER_BODY),
    }));
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { error: { code: string } }).error.code, 'authentication_required');
    assert.deepEqual(calls, [], 'unrecognised managed traffic must not reach a provider or ledger');
  } finally { globalThis.fetch = realFetch; }
});

test('generic editor BYOK uses the anonymous owners sealed key with hosted backend configured', async () => {
  // Isolated transport/auth fixture only: no live hosted account or provider is claimed.
  process.env.SUPABASE_URL = 'https://isolated-auth.test';
  process.env.SUPABASE_ANON_KEY = 'public-test-key';
  process.env.ANTHROPIC_API_KEY = 'managed-test-key';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'b'.repeat(64);
  const cookie = userAiKeysCookie(new Request('https://noacg.test/api/ai/credentials'), { anthropic: 'caller-owned-test-key' }, null).split(';')[0];
  const realFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input, init) => {
    calls.push(String(input));
    assert.equal(String(input), 'https://api.anthropic.com/v1/messages');
    assert.equal(new Headers(init?.headers).get('x-api-key'), 'caller-owned-test-key');
    return Response.json({ content: [{ type: 'text', text: 'A bounded answer' }], stop_reason: 'end_turn', usage: { input_tokens: 2, output_tokens: 3 } });
  }) as typeof globalThis.fetch;
  try {
    const response = await generate.fetch(new Request('https://noacg.test/api/ai/generate', {
      method: 'POST', headers: { 'x-forwarded-for': uniqueIp(), cookie }, body: JSON.stringify(LEDGER_BODY),
    }));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { output: string }).output, 'A bounded answer');
    assert.equal(calls.length, 1, 'BYOK must neither verify an absent account nor spend the managed key');
  } finally { globalThis.fetch = realFetch; }
});


for (const tool of ['editor_help', 'editor_proposal']) test('Studio ' + tool + ' ignores browser routing and personal-key cookies', async () => {
  process.env.VITE_AI_PROVIDER = 'anthropic'; process.env.VITE_AI_MODEL = 'claude-sonnet-5';
  process.env.ANTHROPIC_API_KEY = 'managed-test-key';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'editor-test-encryption-secret-at-least-32';
  const cookie = userAiKeysCookie(new Request('https://noacg.test'), { anthropic: 'personal-test-key' }, null);
  const originalFetch = globalThis.fetch;
  const calls: { key: string | null; body: Record<string, unknown> }[] = [];
  globalThis.fetch = async (_input, init) => {
    calls.push({ key: new Headers(init?.headers).get('x-api-key'), body: JSON.parse(String(init?.body)) });
    return new Response(JSON.stringify({ content: [{ type: 'tool_use', id: 'tool-test', name: tool, input: { answer: 'Managed answer' } }],
      usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200 });
  };
  try {
    const req = new Request('https://noacg.test/api/ai/generate', { method: 'POST',
      headers: { cookie, 'x-forwarded-for': uniqueIp() }, body: JSON.stringify({
        surface: 'editor', route: { provider: 'openai', model: 'personal-model' }, fallbacks: [{ provider: 'google', model: 'personal-fallback' }],
        request: { system: 'Bounded editor test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
          model: 'override', modelRole: 'fast', temperature: 1.7, seed: 12345,
          structuredOutput: { name: tool, description: 'Test', schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'], additionalProperties: false } } },
      }) });
    const res = await generate.fetch(req); assert.equal(res.status, 200);
    const result = await res.json() as ModelResult;
    assert.equal(result.provider, 'anthropic'); assert.equal(result.model, 'claude-sonnet-5');
    assert.equal(calls.length, 1); assert.equal(calls[0].key, 'managed-test-key');
    assert.equal(calls[0].body.model, 'claude-sonnet-5');
    assert.equal(calls[0].body.temperature, undefined); assert.equal(calls[0].body.seed, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('Studio assistant refuses a missing managed credential instead of charging a personal key', async () => {
  process.env.VITE_AI_PROVIDER = 'anthropic'; process.env.VITE_AI_MODEL = 'claude-sonnet-5';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'editor-test-encryption-secret-at-least-32';
  const cookie = userAiKeysCookie(new Request('https://noacg.test'), { anthropic: 'personal-test-key' }, null);
  const req = gatewayRequest(uniqueIp(), { surface: 'editor', request: { system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
    structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } } } });
  req.headers.set('cookie', cookie);
  const res = await generate.fetch(req); assert.equal(res.status, 412);
  const body = await res.json() as { error: { code: string; message: string } };
  assert.equal(body.error.code, 'missing_key'); assert.match(body.error.message, /Studio editor assistant is unavailable/);
  assert.doesNotMatch(body.error.message, /own.*key|settings/i);
});


test('Studio managed gateway preserves the existing retention policy on the wire', async () => {
  process.env.AI_GATEWAY_API_KEY = 'managed-test-key';
  const realFetch = globalThis.fetch;
  let sent: Record<string, unknown> = {};
  globalThis.fetch = async (_input, init) => {
    sent = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: '{"answer":"Managed help"}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1 } });
  };
  try {
    const response = await generate.fetch(gatewayRequest(uniqueIp(), { surface: 'editor', request: {
      system: 'Bounded test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
      structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object', properties: { answer: { type: 'string' } }, required: ['answer'] } },
    } }));
    assert.equal(response.status, 200); assert.equal(sent.model, 'alibaba/qwen3-coder-next');
    const gateway = (sent.providerOptions as { gateway: Record<string, unknown> }).gateway;
    assert.equal(gateway.zeroDataRetention, true); assert.equal(gateway.disallowPromptTraining, true);
    assert.deepEqual(gateway.tags, ['surface:editor']);
  } finally { globalThis.fetch = realFetch; }
});

for (const authorization of [null, 'Bearer stale-or-unverifiable']) test('Studio assistant keeps hosted authentication: ' + String(authorization), async () => {
  process.env.SUPABASE_URL = 'https://isolated-auth.test'; process.env.SUPABASE_ANON_KEY = 'public-test-key';
  process.env.VITE_AI_PROVIDER = 'anthropic'; process.env.VITE_AI_MODEL = 'claude-sonnet-5'; process.env.ANTHROPIC_API_KEY = 'managed-test-key';
  process.env.AI_KEY_ENCRYPTION_SECRET = 'editor-test-encryption-secret-at-least-32';
  const cookie = userAiKeysCookie(new Request('https://noacg.test'), { anthropic: 'personal-test-key' }, null);
  const req = gatewayRequest(uniqueIp(), { surface: 'editor', request: { system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
    structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } } } });
  req.headers.set('cookie', cookie); if (authorization) req.headers.set('authorization', authorization);
  const res = await generate.fetch(req); assert.equal(res.status, 401);
  assert.equal((await res.json() as { error: { code: string } }).error.code, 'authentication_required');
});

for (const [name, change] of [['token ceiling', { maxTokens: 26001 }], ['unstructured output', { structuredOutput: undefined }], ['foreign tool', { structuredOutput: { name: 'image_generation' } }]] as [string, Record<string, unknown>][])
  test('Studio assistant refuses ' + name + ' before provider execution', async () => {
    const res = await generate.fetch(gatewayRequest(uniqueIp(), { surface: 'editor', request: {
      system: 'Bounded test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
      structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } }, ...change,
    } }));
    assert.equal(res.status, 400); assert.equal((await res.json() as { error: { code: string } }).error.code, 'invalid_request');
  });

// Studio owns these settings: a caller cannot repair a managed route or token budget.
for (const surface of ['editor', undefined] as const) {
  for (const status of [400, 404]) test('managed failure ownership: model rejection ' + status + ' / ' + String(surface), async () => {
    process.env.VITE_AI_PROVIDER = 'anthropic'; process.env.VITE_AI_MODEL = 'managed-model';
    process.env.ANTHROPIC_API_KEY = 'managed-test-key';
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response('This model is no longer available to new users.', { status });
    try {
      const response = await generate.fetch(gatewayRequest(uniqueIp(), { surface,
        route: { provider: 'anthropic', model: 'personal-model' }, request: {
          system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
          structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } },
        } }));
      assert.equal(response.status, 502);
      const { error } = await response.json() as { error: { code: string; message: string; retryable: boolean } };
      assert.equal(error.code, 'provider_rejected'); assert.equal(error.retryable, false);
      if (surface === 'editor') assert.equal(error.message, 'The Studio editor assistant is unavailable. Manual editing is available.');
      else assert.match(error.message, /Pick a newer model from the list/);
    } finally { globalThis.fetch = realFetch; }
  });

  test('managed failure ownership: truncated response / ' + String(surface), async () => {
    process.env.AI_GATEWAY_API_KEY = 'managed-test-key';
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: '{' }, finish_reason: 'length' }],
      usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.001 } });
    try {
      const response = await generate.fetch(gatewayRequest(uniqueIp(), { surface,
        route: { provider: 'vercel', model: 'personal-model' }, request: {
          system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
          structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } },
        } }));
      assert.equal(response.status, 502);
      const { error } = await response.json() as { error: { code: string; message: string; retryable: boolean } };
      assert.equal(error.code, 'malformed_response'); assert.equal(error.retryable, false);
      if (surface === 'editor') {
        assert.match(error.message, /Studio editor assistant/); assert.match(error.message, /simpler request/);
        assert.doesNotMatch(error.message, /outputBudget|src\/|Raise/);
      } else assert.match(error.message, /Raise.*budget/);
    } finally { globalThis.fetch = realFetch; }
  });
}

test('managed failure ownership: invalid deployment model retains the route bound without personal setup', async () => {
  process.env.VITE_AI_PROVIDER = 'anthropic'; process.env.VITE_AI_MODEL = 'x'.repeat(161);
  const realFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('must not send'); };
  try {
    const response = await generate.fetch(gatewayRequest(uniqueIp(), { surface: 'editor', request: {
      system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
      structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } },
    } }));
    assert.equal(response.status, 400); assert.equal(calls, 0);
    assert.deepEqual((await response.json() as { error: unknown }).error, { code: 'invalid_request',
      message: 'The Studio editor assistant is unavailable. Manual editing is available.', retryable: false });
  } finally { globalThis.fetch = realFetch; }
});

test('managed failure ownership: presentation preserves served usage and the content-free ledger', async () => {
  const body: AiGatewayRequestBody = { surface: 'editor', route: { provider: 'anthropic', model: 'claude-sonnet-5-5' }, request: {
    system: 'Test', messages: [{ role: 'user', content: 'Help' }], maxTokens: 100,
    structuredOutput: { name: 'editor_help', description: 'Test', schema: { type: 'object' } },
  } };
  await assert.rejects(executeGatewayRequest(body, { keyFor: async () => 'fixture-key', fetchImpl: async () =>
    Response.json({ content: [{ type: 'text', text: '{' }], stop_reason: 'max_tokens',
      usage: { input_tokens: 10, output_tokens: 5 } }) }), (error: unknown) => {
    assert.ok(error instanceof GatewayError); assert.equal(error.code, 'malformed_response');
    assert.equal(error.status, 502); assert.equal(error.retryable, false);
    const usage = error.servedUsage; assert.ok(usage); assert.equal(usage.totalTokens, 15);
    const entry = () => gatewayLedgerEntry({ userId: null, ipHash: 'fixture', body, userKeys: {},
      errorCode: error.code, servedUsage: error.servedUsage });
    const before = entry(); const originalMessage = error.message;
    assert.match(studioEditorErrorMessage(error), /simpler request/);
    assert.equal(error.message, originalMessage); assert.equal(error.servedUsage, usage);
    assert.deepEqual(entry(), before); assert.equal(before.inputTokens, 10); assert.equal(before.outputTokens, 5);
    return true;
  });
});
