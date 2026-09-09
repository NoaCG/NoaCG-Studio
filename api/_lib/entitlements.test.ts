// Tests for the pure entitlement contract (src/entitlements/contract.ts).
//
// The first test is the one that matters most: an instance with no plans, no assignments
// and no grants must resolve to EXACTLY the behaviour the product shipped with. Rolling
// out entitlements is not allowed to restrict anyone, and "every number inherits" is the
// mechanism - if that pin ever fails, someone has hard-coded a limit into a default.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ANONYMOUS_PLAN,
  DEFAULT_SIGNED_IN_PLAN,
  FEATURE_KEYS,
  FEATURE_LABELS,
  LIMIT_KEYS,
  LIMIT_LABELS,
  OBSERVE_ONLY_LIMITS,
  allows,
  enforceableLimit,
  isFeatureKey,
  isLimitKey,
  resolveEntitlement,
  type Entitlement,
  type GrantShape,
  type PlanShape,
} from '../../src/entitlements/contract.js';

import { RENDER_CONFIG, RENDER_LIMITS, allowedFormats, resolveTier, storedRenderTier, validateRenderRequest } from '../../src/render/limits.js';
import { applyEntitlementToLiteProfile, emailDomain, gatedFeature, surfaceRefused } from './entitlements.js';
import { liteProfile } from './aiLiteProfile.js';

const NOW = '2026-07-29T12:00:00.000Z';

function grant(overrides: Partial<GrantShape>): GrantShape {
  return {
    id: 'g1',
    kind: 'feature',
    key: 'ai.lite',
    value: true,
    startsAt: null,
    expiresAt: null,
    revokedAt: null,
    reason: '',
    ...overrides,
  };
}

function bare(userId: string | null) {
  return { userId, accountState: 'active' as const, plan: null, grants: [], now: NOW };
}

test('no plan, no grants: every limit inherits, so nothing is restricted', () => {
  for (const userId of [null, 'user-1']) {
    const resolved = resolveEntitlement(bare(userId));
    for (const key of LIMIT_KEYS) {
      assert.equal(resolved.limits[key].value, null, `${key} must inherit when nothing sets it`);
      assert.equal(resolved.limits[key].source, 'default');
    }
    assert.equal(resolved.renderFormats.value, null);
  }
});

test('the defaults reproduce the shipped tiers', () => {
  const anon = resolveEntitlement(bare(null));
  assert.equal(anon.renderTier.value, 'anonymous');
  assert.equal(anon.planKey, ANONYMOUS_PLAN.key);
  assert.equal(allows(anon, 'render.cloud'), true, 'anonymous cloud rendering has always worked');
  assert.equal(allows(anon, 'sync.cloud'), false);
  assert.equal(allows(anon, 'ai.lite'), false);

  const user = resolveEntitlement(bare('user-1'));
  assert.equal(user.renderTier.value, 'free');
  assert.equal(user.planKey, DEFAULT_SIGNED_IN_PLAN.key);
  for (const key of ['ai.lite', 'sync.cloud', 'community.publish', 'control.hosted'] as const) {
    assert.equal(allows(user, key), true, `${key} is on for a signed-in user today`);
  }
  assert.equal(allows(user, 'templates.internal'), false);
});

test('an assigned plan overrides the default and says so', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'templates.beta': true, 'community.publish': false },
    limits: { aiDailyStarts: 50 },
    renderTier: 'granted',
    renderFormats: ['mp4', 'prores4444'],
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), plan });

  assert.equal(allows(resolved, 'templates.beta'), true);
  assert.equal(resolved.features['templates.beta'].source, 'plan');
  assert.equal(resolved.features['templates.beta'].sourceLabel, 'Plan: Studio');
  assert.equal(allows(resolved, 'community.publish'), false);
  assert.equal(resolved.limits.aiDailyStarts.value, 50);
  assert.equal(resolved.limits.aiDailyStarts.source, 'plan');
  assert.equal(resolved.renderTier.value, 'granted');
  assert.deepEqual(resolved.renderFormats.value, ['mp4', 'prores4444']);

  // A key the plan does not mention still falls through to the default.
  assert.equal(resolved.features['sync.cloud'].source, 'default');
  assert.equal(resolved.limits.aiMonthlyStarts.value, null);
});

test('a temporary grant outranks the plan and carries its expiry', () => {
  const plan: PlanShape = {
    key: 'basic',
    name: 'Basic',
    features: { 'ai.video': false },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ key: 'ai.video', expiresAt: '2026-08-05T00:00:00.000Z', reason: 'trial' })],
  });

  assert.equal(allows(resolved, 'ai.video'), true);
  assert.equal(resolved.features['ai.video'].source, 'grant');
  assert.equal(resolved.features['ai.video'].expiresAt, '2026-08-05T00:00:00.000Z');
  assert.match(resolved.features['ai.video'].sourceLabel, /trial/);
});

test('a permanent override outranks a temporary grant', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    grants: [
      grant({ id: 'a', key: 'ai.lite', value: true, expiresAt: '2026-08-05T00:00:00.000Z' }),
      grant({ id: 'b', key: 'ai.lite', value: false, reason: 'abuse' }),
    ],
  });
  assert.equal(allows(resolved, 'ai.lite'), false);
  assert.equal(resolved.features['ai.lite'].source, 'override');
  assert.equal(resolved.features['ai.lite'].expiresAt, null);
});

test('expired, future, revoked and malformed grants do not apply', () => {
  const cases: Partial<GrantShape>[] = [
    { expiresAt: '2026-07-01T00:00:00.000Z' },
    { startsAt: '2026-12-01T00:00:00.000Z' },
    { revokedAt: '2026-07-02T00:00:00.000Z' },
    { expiresAt: 'not-a-date' },
    { startsAt: 'not-a-date' },
  ];
  for (const overrides of cases) {
    const resolved = resolveEntitlement({
      ...bare('user-1'),
      plan: { key: 'p', name: 'P', features: { 'ai.video': false }, limits: {}, renderTier: 'free', renderFormats: null },
      grants: [grant({ key: 'ai.video', value: true, ...overrides })],
    });
    assert.equal(allows(resolved, 'ai.video'), false, JSON.stringify(overrides));
  }
});

test('a quota grant replaces the plan number, including clearing it', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiDailyStarts: 5 },
    renderTier: 'free',
    renderFormats: null,
  };
  const raised = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ kind: 'quota', key: 'aiDailyStarts', value: 500, reason: 'launch week' })],
  });
  assert.equal(raised.limits.aiDailyStarts.value, 500);
  assert.equal(raised.limits.aiDailyStarts.source, 'override');

  const cleared = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ kind: 'quota', key: 'aiDailyStarts', value: null })],
  });
  assert.equal(cleared.limits.aiDailyStarts.value, null, 'null clears back to inherit');
});

test('a grant of the wrong shape for its kind is ignored', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    grants: [
      grant({ kind: 'feature', key: 'ai.lite', value: 7 as unknown as boolean }),
      grant({ id: 'q', kind: 'quota', key: 'aiDailyStarts', value: true as unknown as number }),
    ],
  });
  assert.equal(resolved.features['ai.lite'].source, 'default');
  assert.equal(resolved.limits.aiDailyStarts.source, 'default');
});

test('suspension denies every feature but keeps the plan visible', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'templates.beta': true },
    limits: { aiDailyStarts: 50 },
    renderTier: 'granted',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), accountState: 'suspended', plan });

  for (const key of FEATURE_KEYS) {
    assert.equal(resolved.features[key].value, false, `${key} must be denied while suspended`);
    assert.equal(resolved.features[key].source, 'suspended');
  }
  assert.equal(resolved.planName, 'Studio', 'the plan stays visible for reactivation');
  assert.equal(resolved.limits.aiDailyStarts.value, 50);
  assert.equal(resolved.renderTier.value, 'anonymous');
});

test('a suspended account is not rescued by a grant', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    accountState: 'suspended',
    grants: [grant({ key: 'ai.lite', value: true })],
  });
  assert.equal(allows(resolved, 'ai.lite'), false);
});

test('anonymous callers ignore plans and grants entirely', () => {
  const resolved = resolveEntitlement({
    ...bare(null),
    plan: { key: 'studio', name: 'Studio', features: { 'sync.cloud': true }, limits: {}, renderTier: 'granted', renderFormats: null },
    grants: [grant({ key: 'sync.cloud', value: true })],
  });
  assert.equal(allows(resolved, 'sync.cloud'), false);
  assert.equal(resolved.renderTier.value, 'anonymous');
});

test('the legacy env override widens AI access without taking anything away', () => {
  const widened = resolveEntitlement({ ...bare('user-1'), envOverride: true });
  assert.equal(widened.features['ai.lite'].source, 'default', 'already allowed, so no relabelling');

  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: { 'ai.lite': false, 'community.publish': false },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const overridden = resolveEntitlement({ ...bare('user-1'), plan, envOverride: true });
  assert.equal(allows(overridden, 'ai.lite'), true);
  assert.equal(overridden.features['ai.lite'].source, 'env-override');
  assert.equal(allows(overridden, 'community.publish'), false, 'the env list is an AI escape hatch only');
});

test('observe-only limits never become enforceable', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { storageBytes: 1_000, projects: 1, aiDailyStarts: 9 },
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), plan });

  assert.equal(resolved.limits.storageBytes.value, 1_000, 'still displayed');
  assert.equal(enforceableLimit(resolved, 'storageBytes'), null);
  assert.equal(enforceableLimit(resolved, 'projects'), null);
  assert.equal(enforceableLimit(resolved, 'aiDailyStarts'), 9);
  for (const key of OBSERVE_ONLY_LIMITS) assert.ok(isLimitKey(key));
});

test('the render tier still resolves to today\'s answer when no plan names one', () => {
  assert.equal(resolveTier(false), 'anonymous');
  assert.equal(resolveTier(true), 'free');
  assert.equal(resolveTier(false, undefined), 'anonymous');
  assert.equal(resolveTier(true, undefined), 'free');
  // What the resolver returns with nothing configured, fed straight back in.
  assert.equal(resolveTier(true, resolveEntitlement(bare('user-1')).renderTier.value), 'free');
  assert.equal(resolveTier(false, resolveEntitlement(bare(null)).renderTier.value), 'anonymous');
});

test('a plan can move the render tier, but only to one that exists', () => {
  assert.equal(resolveTier(true, 'granted'), 'granted');
  assert.equal(resolveTier(true, 'anonymous'), 'anonymous');
  // 'granted' was called 'paid' until migration 0055. A plan row an admin set before that keeps
  // the caps it was set up to give rather than silently narrowing to free.
  assert.equal(resolveTier(true, 'paid'), 'granted');
  // A plan naming a tier the code does not have must not fail the request and must not be
  // read as the most generous one.
  for (const bogus of ['enterprise', 'PAID', '', 'free ']) {
    assert.equal(resolveTier(true, bogus), 'free', bogus);
  }
  // An anonymous caller has no plan to honour, whatever gets passed.
  assert.equal(resolveTier(false, 'granted'), 'anonymous');
});

test('a tier name read back out of storage never lands as undefined caps', () => {
  // Every tier this build has reads back as itself.
  for (const tier of ['anonymous', 'free', 'granted'] as const) {
    assert.equal(storedRenderTier(tier), tier);
  }
  // A render_jobs row written before migration 0055 says 'paid'. It meant the caps now called
  // 'granted', and it is read as those.
  assert.equal(storedRenderTier('paid'), 'granted');
  // Anything else is a name this build cannot honour, and saying so is the caller's cue to pick
  // its own fallback rather than indexing the cap tables with it.
  // 'constructor' and 'toString' are in the list because the value is untrusted text out of the
  // database: a lookup written as an object index would answer those with an Object property
  // rather than with null, and the caller would go on to index the cap tables with a function.
  for (const unknown of ['enterprise', 'PAID', '', 'constructor', 'toString', null, undefined]) {
    assert.equal(storedRenderTier(unknown), null, String(unknown));
  }
  // The reason this matters: both tables are indexed BY the tier, and a miss is a NaN expiry
  // rather than a caught error (api/_lib/reconcile.ts, api/_lib/renderRoutes/complete.ts).
  for (const tier of ['anonymous', 'free', 'granted'] as const) {
    assert.equal(typeof RENDER_CONFIG.outputTtlMs[tier], 'number', tier);
    assert.ok(RENDER_LIMITS[tier], tier);
  }
});

test('a suspended account drops to the anonymous render tier', () => {
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    accountState: 'suspended',
    plan: { key: 'p', name: 'P', features: {}, limits: {}, renderTier: 'granted', renderFormats: null },
  });
  assert.equal(resolveTier(true, resolved.renderTier.value), 'anonymous');
  assert.equal(allows(resolved, 'render.cloud'), false);
});

test('with no plan configured the Lite profile comes back untouched', () => {
  const base = liteProfile();
  const applied = applyEntitlementToLiteProfile(base, resolveEntitlement(bare('user-1')));
  assert.deepEqual(applied, base, 'inheriting must be a no-op, not a rewrite with equal values');
});

test('a plan moves only the five AI allowances, never the routing', () => {
  const base = liteProfile();
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: {},
    limits: {
      aiDailyStarts: 40,
      aiMonthlyStarts: 400,
      aiDailySuccesses: 20,
      aiMonthlySuccesses: 200,
      aiUserConcurrency: 3,
    },
    renderTier: 'granted',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(base, resolveEntitlement({ ...bare('user-1'), plan }));

  assert.equal(applied.dailyStarts, 40);
  assert.equal(applied.monthlyStarts, 400);
  assert.equal(applied.dailySuccesses, 20);
  assert.equal(applied.monthlySuccesses, 200);
  assert.equal(applied.maxConcurrentPerUser, 3);

  // A plan is not a way around the audited model catalog or the deployment's cost ceilings.
  assert.deepEqual(applied.primary, base.primary);
  assert.deepEqual(applied.fallback, base.fallback);
  assert.equal(applied.promptVersion, base.promptVersion);
  assert.equal(applied.maxProviderCostUsd, base.maxProviderCostUsd);
  assert.equal(applied.dailyFleetSpendUsd, base.dailyFleetSpendUsd);
  assert.equal(applied.maxConcurrentFleet, base.maxConcurrentFleet);
  assert.equal(applied.outputTokens, base.outputTokens);
});

test('a plan cannot set per-user concurrency to zero and silently break every reservation', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiUserConcurrency: 0 },
    renderTier: 'free',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(liteProfile(), resolveEntitlement({ ...bare('user-1'), plan }));
  assert.equal(applied.maxConcurrentPerUser, 1);
});

test('a quota grant reaches the Lite profile with the plan overridden', () => {
  const plan: PlanShape = {
    key: 'p',
    name: 'P',
    features: {},
    limits: { aiDailySuccesses: 2 },
    renderTier: 'free',
    renderFormats: null,
  };
  const applied = applyEntitlementToLiteProfile(
    liteProfile(),
    resolveEntitlement({
      ...bare('user-1'),
      plan,
      grants: [grant({ kind: 'quota', key: 'aiDailySuccesses', value: 25, reason: 'support case' })],
    }),
  );
  assert.equal(applied.dailySuccesses, 25);
});

test('an instance-wide kill switch beats a plan, a grant AND a manual override', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: { 'ai.lite': true },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const resolved = resolveEntitlement({
    ...bare('user-1'),
    plan,
    grants: [grant({ key: 'ai.lite', value: true, reason: 'vip' })],
    disabledFeatures: ['ai.lite'],
  });
  assert.equal(allows(resolved, 'ai.lite'), false, 'a switch a manual override defeats is not a switch');
  assert.equal(resolved.features['ai.lite'].source, 'disabled');
  // Only the named feature goes down.
  assert.equal(allows(resolved, 'sync.cloud'), true);
});

test('the kill switch reaches anonymous visitors too', () => {
  const resolved = resolveEntitlement({ ...bare(null), disabledFeatures: ['render.cloud'] });
  assert.equal(allows(resolved, 'render.cloud'), false);
  assert.equal(resolved.features['render.cloud'].source, 'disabled');
});

test('with no plan the allowed formats are exactly the tier\'s', () => {
  for (const tier of ['anonymous', 'free', 'granted'] as const) {
    assert.deepEqual(allowedFormats(tier), RENDER_LIMITS[tier].formats);
    assert.deepEqual(allowedFormats(tier, null), RENDER_LIMITS[tier].formats);
    assert.deepEqual(allowedFormats(tier, []), RENDER_LIMITS[tier].formats);
  }
});

test('a plan replaces the format list, and may grant one its tier lacks', () => {
  // ProRes is not in the anonymous tier; a plan naming it grants it. Formats and caps are
  // orthogonal - granting ProRes must not also grant 4K, which the other checks still enforce.
  assert.deepEqual(allowedFormats('anonymous', ['prores4444']), ['prores4444']);
  assert.deepEqual(allowedFormats('free', ['mp4']), ['mp4'], 'a plan can also narrow');
});

test('a plan naming only unknown formats falls back instead of refusing everything', () => {
  // A stale or mistyped plan row must cost one format, never the whole feature.
  assert.deepEqual(allowedFormats('free', ['h265', 'gif']), RENDER_LIMITS.free.formats);
  assert.deepEqual(allowedFormats('free', ['mp4', 'nonsense']), ['mp4'], 'the known ones still count');
});

test('the render request check honours the plan\'s formats end to end', () => {
  const manifest = {
    kind: 'remotion' as const,
    width: 1920,
    height: 1080,
    fps: 30,
    scale: 1,
    durationInFrames: 150,
    output: { format: 'prores4444' as const },
  };
  // Free tier allows prores today, so the baseline passes.
  assert.deepEqual(validateRenderRequest(manifest, 'free'), []);
  // A plan that narrows to mp4 refuses it, and says so as a plan matter rather than a sign-in one.
  const narrowed = validateRenderRequest(manifest, 'free', ['mp4']);
  assert.equal(narrowed.length, 1);
  assert.equal(narrowed[0].code, 'format-tier');
  // And a plan that grants it on the anonymous tier passes the FORMAT check.
  assert.equal(
    validateRenderRequest(manifest, 'anonymous', ['prores4444']).some((issue) => issue.code.startsWith('format')),
    false,
  );
});

test('a suspended account cannot render a format its plan granted', () => {
  const plan: PlanShape = {
    key: 'studio',
    name: 'Studio',
    features: {},
    limits: {},
    renderTier: 'granted',
    renderFormats: ['prores4444'],
  };
  const resolved = resolveEntitlement({ ...bare('user-1'), accountState: 'suspended', plan });
  // Suspension drops the tier to anonymous, and render.cloud is denied outright - the format
  // list surviving is harmless because the feature gate refuses before it is ever consulted.
  assert.equal(allows(resolved, 'render.cloud'), false);
  assert.equal(resolveTier(true, resolved.renderTier.value), 'anonymous');
});

test('account-free BYO stays allowed by default, because a gate now enforces it', () => {
  // api/ai/generate.ts refuses a BYO request whose account denies ai.byo-key. That gate is
  // only safe while the ANONYMOUS default allows it: flipping this to false would silently
  // break every self-hosted and signed-out bring-your-own-key user, and the gate would
  // faithfully enforce the breakage. This is the pin that catches such a flip.
  assert.equal(allows(resolveEntitlement(bare(null)), 'ai.byo-key'), true);
  assert.equal(allows(resolveEntitlement(bare('user-1')), 'ai.byo-key'), true);
});

test('the feature keys the server gates on are all on by default for a signed-in user', () => {
  // Each of these has an enforcing call site now (docs/ADMIN.md, the enforcement table). If a
  // default here turns false, the feature stops for everyone rather than for a plan that
  // withdrew it - which is a product decision, not a default to drift into.
  const user = resolveEntitlement(bare('user-1'));
  for (const key of ['ai.lite', 'ai.import-analysis', 'ai.byo-key', 'render.cloud'] as const) {
    assert.equal(allows(user, key), true, `${key} must stay on by default`);
  }
});

test('the key guards reject unknown strings', () => {
  assert.equal(isFeatureKey('ai.lite'), true);
  assert.equal(isFeatureKey('editor.open'), false, 'the free core has no gate key');
  assert.equal(isLimitKey('aiDailyStarts'), true);
  assert.equal(isLimitKey('nonsense'), false);
});

test('every key carries a label and a default in both built-in plans', () => {
  for (const key of FEATURE_KEYS) {
    assert.ok(FEATURE_LABELS[key], `${key} needs a label for the admin UI`);
    assert.ok(key in DEFAULT_SIGNED_IN_PLAN.features, `${key} needs a signed-in default`);
    assert.ok(key in ANONYMOUS_PLAN.features, `${key} needs an anonymous default`);
  }
  for (const key of LIMIT_KEYS) {
    assert.ok(LIMIT_LABELS[key], `${key} needs a label for the admin UI`);
    assert.ok(key in DEFAULT_SIGNED_IN_PLAN.limits, `${key} needs a signed-in default`);
  }
});

// ── the gateway surface gate ───────────────────────────────────────────────────────────
//
// The refusal itself, which until now nothing executed. The handler path needs a verified
// Supabase token to reach, so only its no-op half (an unrecognised caller is NOT refused)
// was covered; these drive the decision directly.

/** A recognised signed-in caller whose plan withholds one feature. */
function withheld(feature: 'ai.video'): Entitlement {
  return resolveEntitlement({
    userId: 'user-1',
    accountState: 'active',
    plan: { key: 'p', name: 'No video', features: { [feature]: false }, limits: {}, renderTier: 'free', renderFormats: null },
    grants: [],
    now: NOW,
  });
}

test('a gateway surface maps to exactly one feature key, and no surface gates nothing', () => {
  assert.equal(gatedFeature('video'), 'ai.video');
  // The general harness - the SPX coder, brainstorm, a bare prompt - is deliberately ungated.
  assert.equal(gatedFeature(undefined), null);
});

test('a recognised account whose plan withholds ai.video is refused', () => {
  assert.equal(surfaceRefused('ai.video', true, withheld('ai.video')), true);
});

test('a recognised account with the default plan is not refused', () => {
  const resolved = resolveEntitlement(bare('user-1'));
  assert.equal(allows(resolved, 'ai.video'), true, 'the signed-in default must still allow video');
  assert.equal(surfaceRefused('ai.video', true, resolved), false);
});

test('suspension and the instance-wide kill switch both reach the surface gate', () => {
  const suspended = resolveEntitlement({ ...bare('user-1'), accountState: 'suspended' });
  assert.equal(surfaceRefused('ai.video', true, suspended), true);

  // The kill switch must win even over a permanent manual override - that is the whole point
  // of a switch reached for during an incident.
  const overridden = resolveEntitlement({
    ...bare('user-1'),
    grants: [grant({ key: 'ai.video', value: true, reason: 'override' })],
    disabledFeatures: ['ai.video'],
  });
  assert.equal(surfaceRefused('ai.video', true, overridden), true);
});

test('an UNRECOGNISED caller is never refused, whatever the resolved answer says', () => {
  // THE NEUTRALITY PIN. An anonymous caller resolves ANONYMOUS_PLAN, which sets ai.video
  // false - so a gate keyed on the resolved answer alone would take video away from
  // account-free BYO and from every self-hosted instance with no auth configured. Both work
  // today; entitlements may not quietly restrict anybody.
  const anonymous = resolveEntitlement(bare(null));
  assert.equal(allows(anonymous, 'ai.video'), false, 'the anonymous default carries no account feature');
  assert.equal(surfaceRefused('ai.video', false, anonymous), false);

  // Not even a suspended account's own resolved entitlement refuses when the caller was not
  // recognised - "recognised" is the gate, not a shortcut for "presented a token".
  const suspended = resolveEntitlement({ ...bare('user-1'), accountState: 'suspended' });
  assert.equal(surfaceRefused('ai.video', false, suspended), false);
});

test('same-rank grants are last-wins, so the loader must hand them over ordered', () => {
  // The coupling this pins: `resolveEntitlement` sorts only by RANK (temporary before
  // permanent) and Array.sort is stable, so two grants of equal rank naming one key resolve by
  // ARRIVAL ORDER. That makes the loader's `ORDER BY created_at` part of the access rule rather
  // than a tidiness detail - unordered, Postgres may return the pair either way round and the
  // same account resolves differently on two consecutive requests.
  //
  // 0021 makes the pair unreachable for new rows; this stays because a database that has not
  // had it applied yet must still answer the same way twice.
  const older = grant({ id: 'g-old', key: 'community.publish', value: false, reason: 'abuse' });
  const newer = grant({ id: 'g-new', key: 'community.publish', value: true, reason: 'appeal upheld' });

  const ascending = resolveEntitlement({ ...bare('user-1'), grants: [older, newer] });
  assert.equal(allows(ascending, 'community.publish'), true, 'the most recent decision must win');
  assert.match(ascending.features['community.publish'].sourceLabel, /appeal upheld/);

  // Reversed input reverses the answer - which is precisely why the order is not optional.
  const descending = resolveEntitlement({ ...bare('user-1'), grants: [newer, older] });
  assert.equal(allows(descending, 'community.publish'), false);
});

// ── the email-domain plan (migration 0045) ───────────────────────────────────────────────
//
// The mechanism exists because `user_plans` and `user_grants` are both keyed on `user_id`, so
// neither can authorize somebody who has not signed up yet - which is the whole population a
// cohort is made of. What is pinned here is the PARSING half (pure, and where a wrong answer
// silently widens access) plus the precedence claim the feature rests on. The database half -
// normalization, one-domain-one-plan - is exercised by migration 0045's own self-check.

test('an email domain is read strictly, so a malformed address matches no plan', () => {
  assert.equal(emailDomain('student@arcada.fi'), 'arcada.fi');
  assert.equal(emailDomain('  Student@Arcada.FI  '), 'arcada.fi', 'case and padding are not identity');
  assert.equal(emailDomain('first.last+tag@arcada.fi'), 'arcada.fi');

  // Every one of these must be null. A domain guess that is WRONG hands a stranger a plan.
  for (const bad of [
    null, undefined, '', 'arcada.fi', '@arcada.fi', 'student@', 'student@@arcada.fi',
    'a@b@arcada.fi', 'student@arcada', 'student@.fi', 'student@arcada.', 'student@.',
  ]) {
    assert.equal(emailDomain(bad), null, `${JSON.stringify(bad)} must not resolve to a domain`);
  }
});

test('a domain plan is an ASSIGNED plan, so a grant and an override still outrank it', () => {
  // The load side puts the domain plan in the same slot an explicit assignment uses, which is
  // the whole safety argument: a domain widens WHO gets a plan, never what a plan outranks.
  // If that ever stopped being true, a domain could quietly defeat a deliberate per-user deny.
  const domainPlan: PlanShape = {
    key: 'arcada',
    name: 'Arcada',
    features: { 'ai.pro': true },
    limits: {},
    renderTier: 'free',
    renderFormats: null,
  };
  const onPlan = resolveEntitlement({ ...bare('user-1'), plan: domainPlan });
  assert.equal(allows(onPlan, 'ai.pro'), true);
  assert.equal(onPlan.features['ai.pro'].source, 'plan');

  const denied = resolveEntitlement({
    ...bare('user-1'),
    plan: domainPlan,
    grants: [grant({ key: 'ai.pro', value: false, reason: 'misuse' })],
  });
  assert.equal(allows(denied, 'ai.pro'), false, 'a per-user deny must beat the domain plan');

  // And suspension still short-circuits everything, domain plan or not.
  const suspended = resolveEntitlement({ ...bare('user-1'), plan: domainPlan, accountState: 'suspended' });
  assert.equal(allows(suspended, 'ai.pro'), false);
});

test('closing ai.pro on the default plan denies it, which is what makes the domain the door', () => {
  // Today's production shape and the change it needs, together. The seeded `free` plan omits
  // `ai.pro` entirely, so it falls through to DEFAULT_SIGNED_IN_PLAN - where it is TRUE. That
  // is why switching hosted Pro on without closing the default would hand it to everybody.
  const seeded: PlanShape = {
    key: 'free', name: 'Free', features: {}, limits: {}, renderTier: 'free', renderFormats: null,
  };
  assert.equal(allows(resolveEntitlement({ ...bare('user-1'), plan: seeded }), 'ai.pro'), true,
    'an omitted key inherits the built-in default, which allows Pro');

  const closed: PlanShape = { ...seeded, features: { 'ai.pro': false } };
  assert.equal(allows(resolveEntitlement({ ...bare('user-1'), plan: closed }), 'ai.pro'), false);
});
