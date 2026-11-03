import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  APPROVED_MODEL_CATALOG,
  FUNDED_ROUTE_PRICE_CEILING,
  FUNDED_ROUTE_PROVIDER,
  approvedModelEntry,
  approvedModelPrices,
  approvedModelRoute,
  approvedTextRoute,
  fundedModelRoute,
  fundedRoutePrice,
  modelRouteKey,
} from './aiModelCatalog.js';
import {
  AI_TASK_IDS,
  IMPORT_ANALYSIS_TASK_ID,
  LITE_TASK_ID,
  SVG_INTERPRETATION_TASK_ID,
  importAnalysisTaskProfile,
  liteTaskProfile,
  svgInterpretationTaskProfile,
  taskConfigured,
  taskProfile,
  type TaskProfile,
} from './aiTaskRegistry.js';
import { liteProfile, liteProfileConfigured } from './aiLiteProfile.js';
import { importAnalysisProfile } from './aiImportAnalysisProfile.js';
import { svgInterpretationProfile } from './aiSvgInterpretationProfile.js';

const ENV = [
  'AI_LITE_ENABLED',
  'AI_LITE_PRIMARY_PROVIDER',
  'AI_LITE_PRIMARY_MODEL',
  'AI_LITE_FALLBACK_PROVIDER',
  'AI_LITE_FALLBACK_MODEL',
  'AI_LITE_GATEWAY_PROVIDERS',
  'AI_LITE_PRICING_JSON',
  'AI_LITE_PROMPT_VERSION',
  'AI_LITE_SKIN_ENABLED',
  'AI_LITE_REQUIRE_ZDR',
  'AI_TASK_IMPORT_ANALYSIS_ENABLED',
  'AI_IMPORT_ANALYSIS_PROVIDER',
  'AI_IMPORT_ANALYSIS_MODEL',
  'AI_IMPORT_ANALYSIS_GATEWAY_PROVIDERS',
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

test('the registry re-expresses Lite as the lite-design-spec task profile', () => {
  process.env.AI_LITE_PROMPT_VERSION = 'lite-test-v9';
  const task = taskProfile(LITE_TASK_ID);
  assert.equal(task.taskId, 'lite-design-spec');
  assert.equal(task.enabled, false); // AI_LITE_ENABLED defaults off - fail closed.
  assert.deepEqual(task.tiers, ['free']);
  assert.deepEqual(task.schema, { id: 'lite-ready-decision', version: 'lite-test-v9' });
  assert.deepEqual(task.ledger, { kind: 'ai_generations', profile: 'lite' });
  assert.equal(task.maxAttempts, 2);
  assert.equal(task.retryLimit, 0);
  assert.equal(task.limits.maxImages, 0);
  assert.equal(task.limits.maxImageResolution, null);
  assert.deepEqual(task.routePolicy.primary, { provider: 'vercel', model: 'google/gemini-2.5-flash-lite' });
  assert.deepEqual(task.routePolicy.fallbacks, [{ provider: 'vercel', model: 'google/gemini-2.5-flash-lite' }]);

  // The skin experiment widens the structured contract, and the schema ref says so.
  process.env.AI_LITE_SKIN_ENABLED = '1';
  assert.equal(taskProfile(LITE_TASK_ID).schema.id, 'lite-ready-decision-skin');
});

test('the configured default routes pass the registry gate', () => {
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  const task = liteTaskProfile();
  assert.equal(taskConfigured(task), true);

  // Without the OpenRouter endpoint allowlist the route config half fails closed,
  // exactly as liteProfileConfigured always has.
  delete process.env.AI_LITE_GATEWAY_PROVIDERS;
  assert.equal(taskConfigured(liteTaskProfile()), false);
});

test('a free-tier route outside the approved catalog fails closed even when priced', () => {
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_PRIMARY_PROVIDER = 'vercel';
  process.env.AI_LITE_PRIMARY_MODEL = 'vendor/unapproved-model';
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    'vercel:vendor/unapproved-model': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  });
  const profile = liteProfile();
  // The pricing override satisfies the pre-registry check - the catalog is what refuses.
  assert.equal(liteProfileConfigured(profile), true);
  assert.equal(taskConfigured(liteTaskProfile(profile)), false);
});

test('BYO/paid tiers are not catalog-gated; free and anonymous are', () => {
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_PRIMARY_PROVIDER = 'vercel';
  process.env.AI_LITE_PRIMARY_MODEL = 'vendor/unapproved-model';
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    'vercel:vendor/unapproved-model': { inputPerMillion: 0.1, outputPerMillion: 0.4 },
  });
  const base = liteTaskProfile();
  const withTiers = (tiers: TaskProfile['tiers']): TaskProfile => ({ ...base, tiers });
  assert.equal(taskConfigured(withTiers(['byo'])), true);
  assert.equal(taskConfigured(withTiers(['paid'])), true);
  assert.equal(taskConfigured(withTiers(['free'])), false);
  assert.equal(taskConfigured(withTiers(['anonymous'])), false);
  // A mixed tier set still carries managed free spend, so the catalog still gates it.
  assert.equal(taskConfigured(withTiers(['free', 'byo'])), false);
});

test('free-tier route policy defaults to zero-data-retention routing', () => {
  // Stage 2 doctrine (plan §9): ZDR is the DEFAULT for every free task route. Turning
  // it off is an explicit, audited, per-task server decision - never a default.
  const task = liteTaskProfile();
  assert.ok(task.tiers.includes('free'));
  assert.equal(task.routePolicy.requireZdr, true);
  process.env.AI_LITE_REQUIRE_ZDR = '0';
  assert.equal(liteTaskProfile().routePolicy.requireZdr, false); // explicit opt-out honored
});

test('the imported-graphic-analysis task is off by default and fails closed', () => {
  const task = taskProfile(IMPORT_ANALYSIS_TASK_ID);
  assert.equal(task.taskId, 'imported-graphic-analysis');
  assert.equal(task.enabled, false); // AI_TASK_IMPORT_ANALYSIS_ENABLED defaults off.
  assert.deepEqual(task.tiers, ['free']);
  assert.equal(task.routePolicy.requireZdr, true);
  // The ratified decision 3 quota surface: one image, downscaled to at most 1920x1080.
  assert.equal(task.limits.maxImages, 1);
  assert.deepEqual(task.limits.maxImageResolution, { width: 1920, height: 1080 });
  assert.deepEqual(task.ledger, { kind: 'ai_generations', profile: 'import-analysis' });
  // No gateway provider allowlist configured: closed.
  assert.equal(taskConfigured(task), false);

  process.env.AI_TASK_IMPORT_ANALYSIS_ENABLED = '1';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider'; // the shared fallback list
  const configured = taskProfile(IMPORT_ANALYSIS_TASK_ID);
  assert.equal(configured.enabled, true);
  assert.equal(taskConfigured(configured), true); // default route is a catalog vision entry

  // A route outside the approved catalog fails closed - no env can whitelist it.
  process.env.AI_IMPORT_ANALYSIS_PROVIDER = 'vercel';
  process.env.AI_IMPORT_ANALYSIS_MODEL = 'vendor/unapproved-vision-model';
  assert.equal(taskConfigured(importAnalysisTaskProfile()), false);
});

test('openWeights is preference metadata, never an approval gate', () => {
  const proprietary = approvedModelEntry({ provider: 'vercel', model: 'google/gemini-2.5-flash-lite' });
  assert.ok(proprietary);
  assert.equal(proprietary.openWeights, false);
  // A closed-weight entry is approved all the same (ratified plan §15 decision 1).
  assert.equal(approvedModelRoute(proprietary.route), true);

  const open = approvedModelEntry({ provider: 'vercel', model: 'alibaba/qwen3-coder-next' });
  assert.ok(open);
  assert.equal(open.openWeights, true);
  assert.equal(approvedModelRoute(open.route), true);

  assert.equal(approvedModelRoute({ provider: 'vercel', model: 'vendor/unapproved-model' }), false);
});

test('every catalog entry is complete enough for the free-route policy to price it', () => {
  assert.ok(APPROVED_MODEL_CATALOG.length > 0);
  for (const entry of APPROVED_MODEL_CATALOG) {
    // Scoped to TEXT entries, and that is not a loosening. A registered task sends a text
    // request and reads a structured answer; an image route cannot do either, which is why
    // routeConfigured() refuses one outright rather than asking about this capability.
    if (entry.outputs === 'text') {
      assert.ok(entry.capabilities.structuredOutput, `${entry.route.model} must decode structured output`);
    }
    assert.ok(entry.capabilities.contextWindow > 0);
    assert.ok(entry.price.inputPerMillion >= 0 && entry.price.outputPerMillion >= 0);
    assert.ok(entry.notes.length > 0);
    // `zdrAvailable` means something different than it did under OpenRouter - there it was a
    // per-endpoint fact we audited into this table, here it records that a real ZDR-requesting
    // call was made and served (docs/MODEL_ROUTE_AUDITS.md, 2026-08-07). Asserting it stays
    // meaningful: every catalogued route has been verified, and the gateway itself refuses a
    // ZDR request no provider satisfies, so a lapse surfaces as an outage rather than as a
    // quiet privacy regression.
    assert.ok(entry.zdrAvailable, `${entry.route.model} must have a recorded ZDR verification`);
  }
});

test('every TEXT catalog entry could serve a NoaCG-funded route (plan §15 decision 5)', () => {
  // The catalog IS the free tier's menu, so an entry that decision 5 forbids has no
  // business in it. This is the test that fails when someone adds an Anthropic/OpenAI
  // entry or a model the project cannot afford to subsidize.
  const text = APPROVED_MODEL_CATALOG.filter((entry) => entry.outputs === 'text');
  assert.ok(text.length > 0);
  for (const entry of APPROVED_MODEL_CATALOG) {
    assert.equal(
      entry.route.provider,
      FUNDED_ROUTE_PROVIDER,
      `${entry.route.model}: NoaCG-funded routes go through OpenRouter; OpenAI/Anthropic are BYO-key only`,
    );
  }
  for (const entry of text) {
    assert.equal(
      fundedRoutePrice(entry.price),
      true,
      `${entry.route.model} costs more than the funded-route ceiling`,
    );
    assert.equal(fundedModelRoute(entry.route), true);
  }
});

test('a catalogued IMAGE route cannot be pointed at a registered task', () => {
  // The Pro concept route is audited and approved, which used to be the whole gate. It is
  // still not something Lite may serve: the funded-route ceiling measures text tokens and
  // says nothing about the `image_output` price that dominates an image model's bill, and the
  // task would fail on its first structured-output read anyway. Both refusals are asserted,
  // because either one alone would let an env edit through.
  const image = { provider: 'vercel' as const, model: 'google/gemini-3.1-flash-image' };
  assert.equal(approvedModelRoute(image), true, 'the audit did approve this route');
  assert.equal(approvedTextRoute(image), false);
  assert.equal(fundedModelRoute(image), false);

  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  process.env.AI_LITE_PRIMARY_PROVIDER = 'vercel';
  process.env.AI_LITE_PRIMARY_MODEL = 'google/gemini-3.1-flash-image';
  assert.equal(taskConfigured(liteTaskProfile()), false);
});

test('the funded-route ceiling admits cheap models and refuses flagship pricing', () => {
  assert.equal(fundedRoutePrice({ inputPerMillion: 0.1, outputPerMillion: 0.4 }), true);
  // Exactly at the ceiling is still funded; a hair over on EITHER axis is not.
  assert.equal(fundedRoutePrice({ ...FUNDED_ROUTE_PRICE_CEILING }), true);
  assert.equal(
    fundedRoutePrice({
      inputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion + 0.01,
      outputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion,
    }),
    false,
  );
  assert.equal(
    fundedRoutePrice({
      inputPerMillion: FUNDED_ROUTE_PRICE_CEILING.inputPerMillion,
      outputPerMillion: FUNDED_ROUTE_PRICE_CEILING.outputPerMillion + 0.01,
    }),
    false,
  );
  // Sonnet-class proprietary pricing, the case the ceiling exists to refuse.
  assert.equal(fundedRoutePrice({ inputPerMillion: 3, outputPerMillion: 15 }), false);
  // An unapproved route is never funded, whatever it costs.
  assert.equal(fundedModelRoute({ provider: 'vercel', model: 'vendor/unapproved-model' }), false);
});

test('an env price override above the ceiling fails the free tier closed', () => {
  process.env.AI_LITE_ENABLED = '1';
  process.env.AI_LITE_GATEWAY_PROVIDERS = 'audited/provider';
  assert.equal(taskConfigured(liteTaskProfile()), true);

  // The route stays catalog-approved; only its declared price moves. The gate prices
  // against the task's OWN table, so this must refuse rather than trust the snapshot.
  const primaryKey = modelRouteKey({ provider: 'vercel', model: 'google/gemini-2.5-flash-lite' });
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    [primaryKey]: { inputPerMillion: 3, outputPerMillion: 15 },
  });
  const overpriced = liteTaskProfile();
  assert.equal(approvedModelRoute(overpriced.routePolicy.primary), true);
  assert.equal(taskConfigured(overpriced), false);

  // BYO/paid spend is the caller's own money, so the ceiling does not apply there.
  assert.equal(taskConfigured({ ...overpriced, tiers: ['byo'] }), true);
});

test('the Lite price table is the catalog snapshot plus explicit env overrides', () => {
  const profile = liteProfile();
  for (const [key, price] of Object.entries(approvedModelPrices())) {
    assert.deepEqual(profile.prices[key], price, `${key} price mirrors the catalog`);
  }
  process.env.AI_LITE_PRICING_JSON = JSON.stringify({
    [modelRouteKey({ provider: 'vercel', model: 'google/gemini-2.5-flash-lite' })]:
      { inputPerMillion: 0.2, outputPerMillion: 0.8 },
  });
  const overridden = liteProfile();
  assert.deepEqual(
    overridden.prices['vercel:google/gemini-2.5-flash-lite'],
    { inputPerMillion: 0.2, outputPerMillion: 0.8 },
  );
});

// ---- Row 37: credentials, bounds and independence (docs/work-specs/jev-svg-import/evidence/phase-37.md) ----

/** Sets `values` for the length of `run`, then puts every name back as it was. */
function withEnv(values: Record<string, string | undefined>, run: () => void): void {
  const before = Object.keys(values).map((name) => [name, process.env[name]] as const);
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  try {
    run();
  } finally {
    for (const [name, value] of before) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

const SENTINEL = 'sentinel-credential-0f3a9c';
const CREDENTIAL_ENV = [
  'AI_GATEWAY_API_KEY',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'GOOGLE_API_KEY',
  'HF_TOKEN',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'AI_KEY_ENCRYPTION_SECRET',
  'IP_HASH_SALT',
];
const ALL_ON = {
  AI_LITE_ENABLED: '1',
  AI_TASK_IMPORT_ANALYSIS_ENABLED: '1',
  AI_TASK_SVG_INTERPRETATION_ENABLED: '1',
  AI_SVG_INTERPRETATION_GATEWAY_PROVIDERS: 'typesafe-ai',
};

test('no task profile carries a credential, whatever the environment holds', () => {
  withEnv({ ...Object.fromEntries(CREDENTIAL_ENV.map((name) => [name, SENTINEL])), ...ALL_ON }, () => {
    for (const id of AI_TASK_IDS) {
      assert.ok(!JSON.stringify(taskProfile(id)).includes(SENTINEL), `${id}: the profile names routes and limits, never a key`);
    }
    for (const [label, profile] of [['svg', svgInterpretationProfile()], ['import-analysis', importAnalysisProfile()]] as const) {
      assert.ok(!JSON.stringify(profile).includes(SENTINEL), label);
    }
  });
});

test('the SVG task\'s bounds and route cannot be widened from the environment', () => {
  withEnv({
    ...ALL_ON,
    AI_SVG_INTERPRETATION_MAX_COST_USD: '100',
    AI_SVG_INTERPRETATION_TIMEOUT_MS: '999999',
    AI_SVG_INTERPRETATION_REQUIRE_ZDR: 'false',
  }, () => {
    const task = taskProfile(SVG_INTERPRETATION_TASK_ID);
    assert.ok(task.routePolicy.maxProviderCostUsd <= 0.01, 'the cost ceiling is clamped');
    assert.ok(task.timeoutMs <= 60_000, 'the timeout is clamped');
    assert.deepEqual([task.maxAttempts, task.retryLimit, task.routePolicy.fallbacks], [2, 1, []], 'two attempts, no cascade');
    assert.equal(task.routePolicy.requireZdr, true);
    assert.equal(task.limits.maxImages, 0, 'no preview image');
    assert.equal(taskConfigured(task), true, 'the pinned route on the gateway, priced and allowed');
  });
  // A direct provider for the pinned model, or a name the catalog does not list: refused.
  for (const [provider, model] of [['anthropic', 'typesafe-ai/jev-1.14.0'], ['openai', 'typesafe-ai/jev-1.14.0'], ['vercel', 'typesafe-ai/jev-1.15.0'], ['vercel', 'anthropic/claude-haiku-4.5']]) {
    withEnv({ ...ALL_ON, AI_SVG_INTERPRETATION_PROVIDER: provider, AI_SVG_INTERPRETATION_MODEL: model }, () => {
      assert.equal(taskConfigured(svgInterpretationTaskProfile()), false, `${provider}:${model}`);
    });
  }
  // No provider allowed: not configured, rather than sent to whoever serves the model.
  withEnv({ ...ALL_ON, AI_SVG_INTERPRETATION_GATEWAY_PROVIDERS: ' , ' }, () => {
    assert.equal(taskConfigured(svgInterpretationTaskProfile()), false);
  });
});

test('the SVG task adds no allowance and leaves graphic analysis as configured, on or off', () => {
  let off: TaskProfile | undefined;
  withEnv({ AI_TASK_IMPORT_ANALYSIS_ENABLED: '1', AI_TASK_SVG_INTERPRETATION_ENABLED: undefined }, () => {
    off = importAnalysisTaskProfile();
  });
  for (const svg of [ALL_ON, { ...ALL_ON, AI_SVG_INTERPRETATION_MODEL: 'typesafe-ai/jev', AI_SVG_INTERPRETATION_MAX_COST_USD: '0.01' }]) {
    withEnv({ ...svg, AI_TASK_IMPORT_ANALYSIS_ENABLED: '1' }, () => {
      assert.deepEqual(importAnalysisTaskProfile(), off, 'the image-analysis task does not move with the SVG task');
      const ours = svgInterpretationProfile();
      const shared = importAnalysisProfile();
      // One allowance: the same quotas, concurrency and fleet spend as graphic analysis, booked
      // in the same ledger profile, so turning the SVG task on can never add budget.
      for (const key of ['dailyStarts', 'monthlyStarts', 'dailySuccesses', 'monthlySuccesses', 'maxConcurrentPerUser', 'maxConcurrentFleet', 'dailyFleetSpendUsd'] as const) {
        assert.equal(ours[key], shared[key], key);
      }
      assert.equal(ours.id, 'import-analysis');
      assert.deepEqual(taskProfile(SVG_INTERPRETATION_TASK_ID).ledger, { kind: 'ai_generations', profile: 'import-analysis' });
    });
  }
});
