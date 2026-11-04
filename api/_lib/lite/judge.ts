// The skin VISION JUDGE endpoint: one server-owned, cost-capped vision call scoring a
// rendered hold frame on legibility / hierarchy / brief-fit / strap-shape. The caller
// (the eval rig today; the app once an in-app capture path exists) reverts to the house
// chassis below the threshold. Same trust posture as /api/ai/lite/generations: the
// browser supplies no model, route, prompt, or policy - only the frame and its context.
// Nothing is stored: the screenshot is judged and dropped; only the judge's provider
// cost is added to the generation's ledger row so the fleet spend ceiling stays honest.

import { bearerToken, ipHash, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { managedAiKey } from '../aiCredentials.js';
import { executeGatewayRequest, GatewayError, usageCostUsd, withTokenCost, worstAttemptCostUsd } from '../aiGateway.js';
import { liteError } from '../aiLiteHttp.js';
import {
  liteJudgeConfigured,
  liteJudgePolicy,
  liteProfile,
  routePrice,
} from '../aiLiteProfile.js';
import { admitTaskIp } from '../aiLiteRateLimit.js';
import { resolvePaidAiAccess } from '../entitlements.js';
import { allows } from '../../../src/entitlements/contract.js';
import { routeDisabled } from '../systemSettings.js';
import { LITE_TASK_ID } from '../aiTaskRegistry.js';
import { approvedModelRoute } from '../aiModelCatalog.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../aiLiteStore.js';
import type { LiteJudgeReservation } from '../aiLiteStore.js';
import {
  LITE_JUDGE_LIMITS,
  LITE_JUDGE_OUTPUT,
  liteJudgeSystemPrompt,
  liteJudgeVerdict,
  validateLiteJudgeScores,
} from '../../../src/ai/lite/contract.js';
import type { LiteSkinJudgeRequest, LiteSkinJudgeResult } from '../../../src/ai/lite/types.js';

// The image ceiling plus room for the three small text fields and JSON syntax (base64
// needs no escaping, so the overhead is bounded by briefChars + summaryChars + the id).
// The total stays far below the ~4.5 MB serverless request-body limit on purpose: this
// route's own 400 should be what an oversized frame meets, not an opaque platform 413.
const MAX_BODY_BYTES = LITE_JUDGE_LIMITS.imageBase64Chars + 16_000;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// Every PNG starts with the same 8 signature bytes; base64 keeps them a stable prefix.
const PNG_BASE64_PREFIX = 'iVBORw0KGgo';

function validateJudgeRequest(value: unknown): LiteSkinJudgeRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
  const body = value as Record<string, unknown>;
  const allowed = new Set(['generationId', 'brief', 'skinSummary', 'imageBase64']);
  if (!Object.keys(body).every((key) => allowed.has(key))) throw new Error('unknown field');
  if (typeof body.generationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.generationId)) throw new Error('generation id');
  if (typeof body.brief !== 'string' || !body.brief.trim() || body.brief.length > LITE_JUDGE_LIMITS.briefChars) {
    throw new Error('brief');
  }
  if (
    typeof body.skinSummary !== 'string'
    || !body.skinSummary.trim()
    || body.skinSummary.length > LITE_JUDGE_LIMITS.summaryChars
  ) throw new Error('skin summary');
  if (
    typeof body.imageBase64 !== 'string'
    || body.imageBase64.length < 100
    || body.imageBase64.length > LITE_JUDGE_LIMITS.imageBase64Chars
    || !body.imageBase64.startsWith(PNG_BASE64_PREFIX)
    || !BASE64.test(body.imageBase64)
  ) throw new Error('image');
  return {
    generationId: body.generationId,
    brief: body.brief.trim(),
    skinSummary: body.skinSummary.trim(),
    imageBase64: body.imageBase64,
  };
}

/** The judge's admission failures, in the generation endpoint's own error vocabulary. */
function judgeReservationError(reservation: Exclude<LiteJudgeReservation, { status: 'created' }>): Response {
  if (reservation.status === 'expired') {
    return liteError('not_found', 'This generation is no longer available to judge.', 404);
  }
  if (reservation.status === 'judge-limit') {
    return liteError('allowance_exhausted', 'This generation has used its skin judgements.', 429);
  }
  if (reservation.status === 'fleet-spend') {
    return liteError('fleet_capacity', 'NoaCG Lite has reached its current shared capacity. Try again later.', 503, true);
  }
  return liteError('not_found', 'The generation to judge does not exist.', 404);
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    const profile = liteProfile();
    if (!profile.enabled) return liteError('profile_disabled', 'NoaCG Lite is currently unavailable.', 503, true);
    // The judge spends managed free-tier money, so its route is catalog-gated exactly
    // like the generation routes (aiTaskRegistry fail-closed doctrine).
    if (
      !liteJudgeConfigured(profile)
      || !approvedModelRoute(profile.judgeRoute)
      || !liteLedgerConfigured()
      || !managedAiKey(profile.judgeRoute.provider)
    ) {
      return liteError('profile_not_configured', 'The Lite skin judge is not enabled on this server.', 503);
    }
    const admission = admitTaskIp(LITE_TASK_ID, ipHash(req));
    if (!admission.allowed) {
      return liteError('rate_limited', 'Too many Lite requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to use NoaCG Lite.', 401);

    // The judge is a SECOND paid call on the same generation, so it needs the same two gates
    // the generation itself passes: the account's entitlement, and the kill switch on the
    // route it would use. It had neither - an admin could disable Lite, or switch off the
    // judge's model after a cost spike, and this endpoint kept spending.
    // Both read strictly: an unreadable switch or plan refuses here, before any booking (#2034).
    const access = await resolvePaidAiAccess(user.userId);
    if (!access.ok) {
      return liteError('profile_not_configured', 'The Lite skin judge is temporarily unavailable. Try again shortly.', 503, true);
    }
    if (!allows(access.entitlement, 'ai.lite')) {
      return liteError('profile_disabled', 'NoaCG Lite is not available for this account.', 403);
    }
    if (routeDisabled(access.settings, profile.judgeRoute)) {
      return liteError('profile_not_configured', 'The Lite skin judge has no available model route.', 503, true);
    }

    let request: LiteSkinJudgeRequest;
    try {
      request = validateJudgeRequest(await readJson<unknown>(req, MAX_BODY_BYTES));
    } catch {
      return liteError('invalid_request', 'The judge request exceeds its supported size or shape.', 400);
    }

    const price = routePrice(profile, profile.judgeRoute) ?? undefined;
    // The worst case includes the gateway's per-request fee (#2015).
    const worstCase = worstAttemptCostUsd(
      profile.judgeRoute,
      profile.judgeEstimatedInputTokens,
      profile.judgeOutputTokens,
      price,
      liteJudgePolicy(profile),
    );
    if (worstCase === null || worstCase > profile.judgeMaxCostUsd) {
      return liteError('cost_ceiling', 'The configured judge route exceeds its cost ceiling.', 503);
    }
    const gateway = liteJudgePolicy(profile);
    if (profile.judgeRoute.provider === 'vercel' && !gateway) {
      return liteError('profile_not_configured', 'The Lite skin judge is not enabled on this server.', 503);
    }

    // The judge is a SECOND paid call, so it passes admission of its own - the generation
    // it rides on was admitted once, for one generation. Ownership, liveness, the
    // per-generation cap and the daily fleet spend ceiling are decided atomically here,
    // and the worst-case cost is booked before a cent is spent. Everything above this
    // point is free server-side configuration, so nothing is booked for a request that
    // could never have run.
    const store = await getLiteGenerationStore();
    const reservation = await store.reserveJudge({
      generationId: request.generationId,
      userId: user.userId,
      now: Date.now(),
      profile,
    });
    if (reservation.status !== 'created') return judgeReservationError(reservation);

    try {
      const result = await executeGatewayRequest(
        {
          request: {
            system: liteJudgeSystemPrompt(profile.promptVersion),
            messages: [{
              role: 'user',
              content: [
                { type: 'text', text: JSON.stringify({ brief: request.brief, claimedTreatment: request.skinSummary }) },
                { type: 'image', source: { type: 'base64', media_type: 'image/png', data: request.imageBase64 } },
              ],
            }],
            maxTokens: profile.judgeOutputTokens,
            structuredOutput: LITE_JUDGE_OUTPUT,
          },
          route: profile.judgeRoute,
        },
        { keyFor: async (provider) => managedAiKey(provider) },
        {
          maxAttempts: 2,
          retryLimit: 1,
          timeoutMs: profile.timeoutMs,
          timeoutCostFor: () => worstCase,
          ...(gateway ? { gateway } : {}),
        },
      );
      // Tokens (reported, else priced) plus the request fee, counted once.
      const usage = withTokenCost(result.usage, profile.judgeRoute, price);
      const costUsd = usageCostUsd(usage);
      // Settle the booked worst case down (or up) to what the provider actually charged.
      // Best-effort: a settle failure leaves the booking standing, which over-counts the
      // fleet spend - the safe direction - and must never void a paid judgement. A run
      // that throws before here keeps its booking for the same reason.
      await store.settleJudgeCost(request.generationId, costUsd - profile.judgeMaxCostUsd).catch(() => null);
      if (costUsd > profile.judgeMaxCostUsd) {
        return liteError('cost_ceiling', 'This judge call exceeded its cost ceiling and was discarded.', 503);
      }
      const parsed = validateLiteJudgeScores(result.output);
      if (!parsed) {
        return liteError('generation_failed', 'The judge did not return a usable judgement.', 422);
      }
      const response: LiteSkinJudgeResult = {
        verdict: liteJudgeVerdict(parsed.scores, profile.judgeThreshold),
        scores: parsed.scores,
        reason: parsed.reason,
        threshold: profile.judgeThreshold,
        usage,
      };
      return json(response);
    } catch (error) {
      // Failed attempts can cost more than the original booking (#2114). Retain that
      // conservative booking when the known aggregate is smaller or unavailable; only
      // add the excess, atomically, so another judgement's booking cannot be overwritten.
      const extraCost = Math.max(0,
        usageCostUsd(error instanceof GatewayError ? error.servedUsage : undefined) - profile.judgeMaxCostUsd);
      if (extraCost > 0) await store.settleJudgeCost(request.generationId, extraCost).catch(() => null);
      if (error instanceof GatewayError) {
        return error.code === 'rate_limited' || error.code === 'unavailable' || error.code === 'timeout'
          ? liteError('provider_unavailable', error.message, error.status, true)
          : liteError('generation_failed', error.message, error.status, false);
      }
      return liteError('generation_failed', 'The Lite skin judge could not complete.', 500);
    }
  },
};
