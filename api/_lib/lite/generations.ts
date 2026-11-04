import { bearerToken, ipHash, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { managedAiKey } from '../aiCredentials.js';
import {
  executeGatewayRequest,
  GatewayError,
  sumUsage,
  usageCostUsd,
  withTokenCost,
  worstAttemptCostUsd,
  type GatewayExecutionPolicy,
} from '../aiGateway.js';
import { liteError } from '../aiLiteHttp.js';
import {
  liteGatewayPolicy,
  liteProfile,
  liteProfileForUser,
  routePrice,
} from '../aiLiteProfile.js';
import {
  admitTaskIp,
  jitteredCapacityDelay,
  liteCapacityRetryPlan,
} from '../aiLiteRateLimit.js';
import { applyEntitlementToLiteProfile, resolvePaidAiAccess } from '../entitlements.js';
import { allows } from '../../../src/entitlements/contract.js';
import { routeDisabled } from '../systemSettings.js';
import { LITE_TASK_ID, liteTaskProfile, taskConfigured } from '../aiTaskRegistry.js';
import {
  getLiteGenerationStore,
  liteLedgerConfigured,
  modelResultPatch,
  type LiteGenerationRecord,
  type LiteGenerationStore,
  type LiteReservation,
} from '../aiLiteStore.js';
import {
  LITE_AI_CATEGORIES,
  deterministicUnsupportedDecision,
  liteReadyOutputFor,
  liteRepairInstructions,
  liteRequestText,
  liteSystemPrompt,
  retrieveLiteReferenceSet,
  validateLiteDecision,
} from '../../../src/ai/lite/contract.js';
import type { LiteGenerationRequest, LiteGenerationResult } from '../../../src/ai/lite/types.js';
import type { ModelResult, ModelRoute, ModelUsage } from '../../../src/ai/modelTypes.js';
import { validateProjectFormat } from '../../../src/model/projectFormat.js';

const MAX_BODY_BYTES = 32_000;
const ALLOWED_CATEGORY = new Set<string>(['auto', ...LITE_AI_CATEGORIES]);
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const MARK_SHAPES = new Set<string>(['portrait', 'square', 'wordmark', 'rail']);

function recordType(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
  return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const set = new Set(allowed);
  return Object.keys(value).every((key) => set.has(key));
}

function validateRequest(value: unknown, profile: ReturnType<typeof liteProfile>): LiteGenerationRequest {
  const body = recordType(value);
  if (!onlyKeys(body, [
    'idempotencyKey', 'prompt', 'generationSpec', 'priorSpec', 'conversation',
    'palette', 'primaryFont', 'hasLogo', 'mark', 'resolution', 'fps',
  ])) throw new Error('unknown field');
  if (typeof body.idempotencyKey !== 'string' || !IDEMPOTENCY.test(body.idempotencyKey)) throw new Error('idempotency');
  if (typeof body.prompt !== 'string' || !body.prompt.trim() || body.prompt.length > profile.limits.promptCharacters) {
    throw new Error('prompt');
  }
  const resolution = recordType(body.resolution);
  if (!onlyKeys(resolution, ['width', 'height'])) throw new Error('resolution');
  if (!Number.isInteger(resolution.width) || !Number.isInteger(resolution.height)) {
    throw new Error('resolution');
  }
  if (
    validateProjectFormat(
      { width: Number(resolution.width), height: Number(resolution.height) },
      Number(body.fps),
    ).length > 0
  ) throw new Error('project format');
  if (body.generationSpec !== undefined && body.generationSpec !== null) {
    const spec = recordType(body.generationSpec);
    if (!onlyKeys(spec, [
      'version', 'category', 'fields', 'styleNotes', 'mood', 'avoidNotes',
      'brandColors', 'animation',
    ])) throw new Error('generation spec');
    if (spec.version !== 1 || typeof spec.category !== 'string' || !ALLOWED_CATEGORY.has(spec.category)) {
      throw new Error('generation spec');
    }
    if (!Array.isArray(spec.fields) || spec.fields.length > profile.limits.fields) throw new Error('fields');
    for (const field of spec.fields) {
      const item = recordType(field);
      if (!onlyKeys(item, ['label', 'kind', 'description', 'example'])) throw new Error('field');
      if (typeof item.label !== 'string' || !item.label.trim() || item.label.length > 80) throw new Error('field label');
      if (typeof item.example === 'string' && item.example.length > 500) throw new Error('field example');
    }
  }
  if (body.conversation !== undefined) {
    if (!Array.isArray(body.conversation) || body.conversation.length > profile.limits.conversationTurns) {
      throw new Error('conversation');
    }
    let characters = 0;
    for (const turn of body.conversation) {
      const item = recordType(turn);
      if (!onlyKeys(item, ['role', 'content'])) throw new Error('conversation');
      if ((item.role !== 'user' && item.role !== 'assistant') || typeof item.content !== 'string') throw new Error('conversation');
      characters += item.content.length;
    }
    if (characters > profile.limits.conversationCharacters) throw new Error('conversation length');
  }
  if (body.hasLogo !== undefined && typeof body.hasLogo !== 'boolean') throw new Error('logo');
  if (body.hasLogo === true && profile.limits.logos < 1) throw new Error('logo unsupported');
  // The mark DESCRIPTOR (src/ai/lite/types.ts): three enumerated facts the browser measured off
  // the upload. Content-free by construction - no bytes, no name, no dimensions - and validated
  // as strictly as everything else here, because it reaches the prompt.
  if (body.mark !== undefined && body.mark !== null) {
    const mark = recordType(body.mark);
    if (!onlyKeys(mark, ['shape', 'backing', 'ink'])) throw new Error('mark');
    if (!MARK_SHAPES.has(String(mark.shape))) throw new Error('mark shape');
    if (mark.backing !== 'own-field' && mark.backing !== 'transparent') throw new Error('mark backing');
    if (mark.ink !== undefined && mark.ink !== 'light' && mark.ink !== 'dark') throw new Error('mark ink');
    if (profile.limits.logos < 1) throw new Error('logo unsupported');
  }
  if (body.palette !== undefined && body.palette !== null) {
    const palette = recordType(body.palette);
    if (!onlyKeys(palette, ['accent', 'text', 'textDim', 'panel'])) throw new Error('palette');
    if (!['accent', 'text', 'textDim', 'panel'].every((key) =>
      typeof palette[key] === 'string' && String(palette[key]).length <= 80
    )) throw new Error('palette');
  }
  if (body.primaryFont !== undefined && body.primaryFont !== null) {
    const font = recordType(body.primaryFont);
    if (!onlyKeys(font, ['family', 'uploaded'])) throw new Error('font');
    if (typeof font.family !== 'string' || font.family.length > 120 || typeof font.uploaded !== 'boolean') throw new Error('font');
  }
  if (body.priorSpec !== undefined) {
    const prior = recordType(body.priorSpec);
    if (!onlyKeys(prior, [
      'fit', 'reason', 'name', 'summary', 'category', 'variantId', 'lines',
      'intent', 'extraFields', 'useLogoSlot', 'zone', 'paletteId', 'palette', 'fontId',
      'sizeScale', 'animation', 'motionCharacter', 'typography', 'density',
      'alignment', 'shape', 'flourish',
    ])) throw new Error('prior spec');
    if (prior.fit !== 'catalog' || typeof prior.variantId !== 'string') throw new Error('prior spec');
  }
  return {
    ...(body as unknown as LiteGenerationRequest),
    prompt: body.prompt.trim(),
    resolution: { width: Number(resolution.width), height: Number(resolution.height) },
    fps: Number(body.fps),
  };
}

function policyFor(
  profile: ReturnType<typeof liteProfile>,
  route: ModelRoute,
  maxAttempts: number,
): GatewayExecutionPolicy {
  const gatewayRoute = route.provider === 'vercel'
    ? route
    : [profile.primary, profile.fallback].find((candidate) => candidate.provider === 'vercel');
  const gateway = gatewayRoute ? liteGatewayPolicy(profile, gatewayRoute) : undefined;
  if (gatewayRoute && !gateway) throw new Error('The gateway routing policy is not configured.');
  return {
    maxAttempts,
    retryLimit: 0,
    timeoutMs: profile.timeoutMs,
    ...(gateway ? { gateway } : {}),
  };
}

function zeroUsage(): ModelUsage {
  return { inputTokens: 0, outputTokens: 0, totalTokens: 0 };
}

function aggregateResults(first: ModelResult, second: ModelResult): ModelResult {
  return {
    ...second,
    attempts: [...first.attempts, ...second.attempts],
    usage: sumUsage([first.usage, second.usage]),
  };
}

function withProfileCost(result: ModelResult, profile: ReturnType<typeof liteProfile>): ModelResult {
  const route = { provider: result.provider, model: result.model };
  return { ...result, usage: withTokenCost(result.usage, route, routePrice(profile, route)) };
}

export function reservationError(reservation: Exclude<LiteReservation, { status: 'created' }>): Response {
  if (reservation.status === 'duplicate') {
    return liteError('duplicate_request', 'This generation request was already processed.', 409);
  }
  if (reservation.status === 'user-concurrency') {
    return liteError('already_running', 'Finish the current Lite generation before starting another.', 409, true);
  }
  if (reservation.status === 'fleet-concurrency') {
    return liteError('shared_capacity', 'NoaCG Lite is temporarily busy. Please try again in a moment.', 503, true);
  }
  if (reservation.status === 'fleet-spend') {
    return liteError('fleet_spend_ceiling', 'NoaCG Lite is temporarily unavailable.', 503, false);
  }
  return liteError('allowance_exhausted', 'Your current NoaCG Lite allowance has been used.', 429);
}

export function gatewayResponse(error: GatewayError): Response {
  if (error.code === 'rate_limited') {
    return liteError('provider_rate_limited', 'NoaCG Lite\'s provider is temporarily busy.', error.status, true);
  }
  if (error.code === 'unavailable' || error.code === 'timeout') {
    return liteError('provider_unavailable', error.message, error.status, true);
  }
  return liteError('generation_failed', error.message, error.status, false);
}

interface CapacityRetryDependencies {
  now(): number;
  random(): number;
  sleep(ms: number): Promise<void>;
}

const CAPACITY_RETRY_DEFAULTS: CapacityRetryDependencies = {
  now: () => Date.now(),
  random: () => Math.random(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

/** Retry only the shared fleet slot. A quota, user overlap, spend ceiling, or duplicate
 * is a durable answer and returns immediately. Every observation carries the identical
 * user/idempotency context, so only the successful reservation can consume a start. */
export async function reserveLiteCapacity(
  store: LiteGenerationStore,
  input: Parameters<LiteGenerationStore['reserve']>[0],
  plan: ReturnType<typeof liteCapacityRetryPlan>,
  dependencies: CapacityRetryDependencies = CAPACITY_RETRY_DEFAULTS,
): Promise<LiteReservation> {
  for (let attempt = 0; attempt < plan.maxAttempts; attempt += 1) {
    const reservation = await store.reserve({ ...input, now: dependencies.now() });
    if (reservation.status !== 'fleet-concurrency' || attempt === plan.maxAttempts - 1) {
      return reservation;
    }
    await dependencies.sleep(jitteredCapacityDelay(plan.retrySpacingMs, dependencies.random));
  }
  throw new Error('Lite capacity retry exhausted without a reservation result.');
}

/**
 * What a failed generation records. Two shapes, because a failure either has an accounted model
 * result or it does not:
 *
 * - WITH a result, the real model, tokens and cost are known and win.
 * - WITHOUT one, the provider threw before producing anything accountable. That branch used to
 *   write the reason and NOTHING else, which is why 23 of the first 43 production failures carried
 *   a null model: the ledger recorded that something failed without ever recording WHAT, and no
 *   amount of querying could attribute them to a route. So name the route that was dispatched to.
 *
 * Naming the primary route is honest rather than a guess: `executeGatewayRequest` walks
 * `[primary, ...fallbacks]` and throws only once every one of them is exhausted, so a failure
 * reaching here is one where the primary route provably failed.
 *
 * The cost stays the conservative worst case the reservation booked (`maxProviderCostUsd`) - with
 * no usage report there is nothing to reconcile it against, and over-booking the fleet's daily
 * budget is the safe direction to be wrong in.
 */
export function failurePatch(input: {
  reason: string;
  result?: ModelResult;
  conservativeCostUsd?: number;
  attemptedRoute?: { provider: string; model: string };
}): Partial<LiteGenerationRecord> {
  const { reason, result, conservativeCostUsd, attemptedRoute } = input;
  return {
    ...(result ? modelResultPatch(result) : {}),
    ...(!result && conservativeCostUsd ? { providerCostUsd: conservativeCostUsd } : {}),
    ...(!result && attemptedRoute
      ? { provider: attemptedRoute.provider, model: attemptedRoute.model }
      : {}),
    status: 'failed',
    rejectionReason: reason.slice(0, 80),
  };
}

async function failRecord(
  record: LiteGenerationRecord | null,
  reason: string,
  result?: ModelResult,
  conservativeCostUsd?: number,
  attemptedRoute?: { provider: string; model: string },
): Promise<void> {
  if (!record) return;
  await (await getLiteGenerationStore()).update(
    record.id,
    failurePatch({ reason, result, conservativeCostUsd, attemptedRoute }),
  );
}

function internalFailureCode(error: unknown): string {
  if (!(error instanceof Error)) return 'internal';
  if (error.message.startsWith('Lite generation update failed:')) return 'ledger_update';
  if (error.message.startsWith('Lite generation lookup failed:')) return 'ledger_lookup';
  if (error.message.startsWith('Lite quality-prior lookup failed:')) return 'quality_prior_lookup';
  return 'internal';
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    let profile = liteProfile();
    if (!profile.enabled) return liteError('profile_disabled', 'NoaCG Lite is currently unavailable.', 503, true);
    // The registry gate: route config + the approved-route catalog, failing closed.
    if (!taskConfigured(liteTaskProfile(profile)) || !liteLedgerConfigured()) {
      return liteError('profile_not_configured', 'NoaCG Lite is not fully configured.', 503);
    }
    if (![profile.primary, profile.fallback].every((route) => Boolean(managedAiKey(route.provider)))) {
      return liteError('profile_not_configured', 'NoaCG Lite has no configured managed route.', 503);
    }
    const callerIpHash = ipHash(req);
    const admission = admitTaskIp(LITE_TASK_ID, callerIpHash);
    if (!admission.allowed) {
      return liteError('rate_limited', 'Too many Lite requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to use NoaCG Lite.', 401);
    // Legacy env list first, then the entitlement: an explicit plan number or a per-user
    // override is a deliberate decision and outranks the blanket development bump.
    profile = liteProfileForUser(profile, user.userId);
    // The plan and the switches read strictly: a failed read refuses here, before any booking,
    // rather than resolving the default plan and empty switches (#2034).
    const access = await resolvePaidAiAccess(user.userId);
    if (!access.ok) {
      return liteError('profile_not_configured', 'NoaCG Lite is temporarily unavailable. Try again shortly.', 503, true);
    }
    if (!allows(access.entitlement, 'ai.lite')) {
      return liteError('profile_disabled', 'NoaCG Lite is not available for this account.', 403);
    }
    profile = applyEntitlementToLiteProfile(profile, access.entitlement);

    // A route switched off from the admin surface stays off: the reason to disable a route is
    // that its output is wrong or its cost has spiked, and serving it anyway is exactly the
    // outcome the switch prevents.
    const system = access.settings;
    if (routeDisabled(system, profile.primary) && routeDisabled(system, profile.fallback)) {
      return liteError('profile_not_configured', 'NoaCG Lite has no available model route.', 503, true);
    }

    let request: LiteGenerationRequest;
    try {
      request = validateRequest(await readJson<unknown>(req, MAX_BODY_BYTES), profile);
    } catch {
      return liteError('invalid_request', 'The Lite request exceeds its supported size or shape.', 400);
    }

    const unsupported = deterministicUnsupportedDecision(request);
    if (unsupported) {
      const result: LiteGenerationResult = {
        generationId: `unsupported-${crypto.randomUUID()}`,
        decision: unsupported,
        usage: zeroUsage(),
        attemptCount: 0,
        repairCount: 0,
        expiresAt: new Date(Date.now() + profile.expiryMs).toISOString(),
      };
      return json(result);
    }

    // Each worst case includes the gateway's per-request fee (#2015).
    const worstPrimary = worstAttemptCostUsd(
      profile.primary,
      profile.estimatedInputTokens,
      profile.outputTokens,
      routePrice(profile, profile.primary) ?? undefined,
      liteGatewayPolicy(profile, profile.primary),
    );
    const worstFallback = worstAttemptCostUsd(
      profile.fallback,
      profile.estimatedInputTokens,
      profile.outputTokens,
      routePrice(profile, profile.fallback) ?? undefined,
      liteGatewayPolicy(profile, profile.fallback),
    );
    if (worstPrimary === null || worstFallback === null || worstPrimary + worstFallback > profile.maxProviderCostUsd) {
      return liteError('cost_ceiling', 'The configured Lite routes exceed the per-request cost ceiling.', 503);
    }

    const store = await getLiteGenerationStore();
    const now = Date.now();
    const requestedCategory = request.generationSpec?.category;
    const capacityPlan = liteCapacityRetryPlan(
      profile.maxConcurrentFleet,
      profile.maxAttempts,
      profile.timeoutMs,
    );
    const reservation = await reserveLiteCapacity(store, {
      userId: user.userId,
      ipHash: callerIpHash,
      idempotencyKey: request.idempotencyKey,
      requestedCategory: requestedCategory && requestedCategory !== 'auto' ? requestedCategory : null,
      now,
      profile: { ...profile, expiryMs: capacityPlan.activeLeaseMs },
    }, capacityPlan);
    if (reservation.status !== 'created') return reservationError(reservation);
    let record: LiteGenerationRecord | null = reservation.record;
    record = await store.update(record.id, { status: 'model_running' });
    const qualityPriors = await store.qualityPriors({
      now,
      windowDays: profile.qualityPriorWindowDays,
      minSamples: profile.qualityPriorMinSamples,
    }).catch(() => []);
    const references = retrieveLiteReferenceSet(request);
    const trustedSystemPrompt = liteSystemPrompt(profile.promptVersion, qualityPriors, {
      skin: profile.skinEnabled,
      references: references.entries,
      manualCategory: requestedCategory ?? null,
    });
    const structuredOutput = liteReadyOutputFor(references.entries, { skin: profile.skinEnabled });

    const modelRequest = {
      system: trustedSystemPrompt,
      messages: [{ role: 'user' as const, content: liteRequestText(request) }],
      maxTokens: profile.outputTokens,
      structuredOutput,
      cacheSystem: true,
    };

    let accountedResult: ModelResult | undefined;
    try {
      let modelResult = withProfileCost(await executeGatewayRequest(
        { request: modelRequest, route: profile.primary, fallbacks: [profile.fallback] },
        { keyFor: async (provider) => managedAiKey(provider) },
        policyFor(profile, profile.primary, profile.maxAttempts),
      ), profile);
      accountedResult = modelResult;
      let semantic = validateLiteDecision(modelResult.output, request, profile.limits.fields, {
        skin: profile.skinEnabled,
      });
      const usedAttempts = modelResult.attempts.reduce((sum, item) => sum + item.attempts, 0);

      if (!semantic.decision && usedAttempts < profile.maxAttempts) {
        const repairRoute = { provider: modelResult.provider, model: modelResult.model };
        const repair = withProfileCost(await executeGatewayRequest(
          {
            request: {
              system: trustedSystemPrompt,
              messages: [{
                role: 'user',
                // The instructions, not just the verdicts: a code names what was wrong,
                // never what to change, and a model handed only codes re-emits the same
                // decision (measured - the repair round bought nothing). Saying the
                // previous answer was REJECTED and that an identical one fails again is
                // part of the fix: without it the model treats this as a re-ask.
                content: JSON.stringify({
                  task: 'Your previous decision was REJECTED. Apply every listed fix and return the corrected decision. Returning the same values again fails again.',
                  fixes: liteRepairInstructions(semantic.errors),
                  ruleErrors: semantic.errors,
                  rejectedDecision: modelResult.output,
                  request: JSON.parse(liteRequestText(request)),
                }),
              }],
              maxTokens: profile.repairOutputTokens,
              structuredOutput,
              cacheSystem: true,
            },
            route: repairRoute,
          },
          { keyFor: async (provider) => managedAiKey(provider) },
          policyFor(profile, repairRoute, profile.maxAttempts - usedAttempts),
        ), profile);
        modelResult = aggregateResults(modelResult, repair);
        accountedResult = modelResult;
        semantic = validateLiteDecision(repair.output, request, profile.limits.fields, {
          skin: profile.skinEnabled,
        });
        record = await store.update(record?.id ?? '', { repairCount: 1 });
      }

      if (!semantic.decision) {
        await failRecord(record, semantic.errors.join(','), modelResult);
        return liteError('generation_failed', 'Lite could not produce a usable design decision for this brief.', 422);
      }
      const actualCost = usageCostUsd(modelResult.usage);
      if (actualCost > profile.maxProviderCostUsd) {
        await store.update(record?.id ?? '', { ...modelResultPatch(modelResult), status: 'failed', rejectionReason: 'cost_ceiling' });
        return liteError('cost_ceiling', 'This Lite generation exceeded its cost ceiling and was stopped.', 503);
      }
      const resolvedCategory = semantic.decision.status === 'ready'
        ? semantic.decision.spec.category
        : null;
      const resolvedVariantId = semantic.decision.status === 'ready'
        ? semantic.decision.spec.variantId
        : null;
      const intentKind = semantic.decision.status === 'ready'
        ? semantic.decision.spec.intent.kind
        : null;
      record = await store.update(record?.id ?? '', {
        ...modelResultPatch(modelResult),
        status: semantic.decision.status === 'ready' ? 'spec_ready' : 'unsupported',
        resolvedCategory,
        resolvedVariantId,
        intentKind,
        // What the platform had to repair to honour this request - a brand palette restored
        // over the model's version, a furniture colour clamped, a mark's chassis re-picked.
        // Discarding it made brand fidelity unmeasurable in production: the promise is
        // "exactly the brand's colours", and a silent repair is how that claim goes wrong
        // without anyone counting (docs/AI_LITE_BRAND_PLAN.md §3.2). Capped like the rule
        // codes beside it, because both are written from a model-shaped response.
        adjustments: (semantic.adjustments ?? []).slice(0, 30),
        rejectionReason: semantic.decision.status === 'unsupported' ? semantic.decision.code : null,
        expiresAt: Date.now() + capacityPlan.activeLeaseMs,
      });
      if (!record) return liteError('generation_failed', 'Lite could not persist the generation outcome.', 500);
      const result: LiteGenerationResult = {
        generationId: record.id,
        decision: semantic.decision,
        usage: modelResult.usage,
        attemptCount: record.attemptCount,
        repairCount: record.repairCount,
        expiresAt: new Date(record.expiresAt).toISOString(),
      };
      return json(result);
    } catch (error) {
      await failRecord(
        record,
        error instanceof GatewayError ? error.code : internalFailureCode(error),
        accountedResult,
        accountedResult ? undefined : profile.maxProviderCostUsd,
        accountedResult ? undefined : profile.primary,
      );
      return error instanceof GatewayError
        ? gatewayResponse(error)
        : liteError('generation_failed', 'NoaCG Lite could not complete this generation.', 500);
    }
  },
};
