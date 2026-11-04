// POST /api/ai/tasks/import-analysis - the imported-graphic-analysis task
// (docs/AI_PLATFORM_PLAN.md §6, docs/AI_TASK_REGISTRY.md). One server-owned vision call
// over the user's downscaled artwork; the browser supplies no model, route, prompt, or
// policy - only the image and optional instructions. The result is PROPOSAL-ONLY: the
// browser normalizes it deterministically and the user applies what they accept through
// the manual pipeline's own transforms. Nothing is stored: the image is analyzed and
// dropped; the ledger row is content-free accounting.
//
// Same trust ladder as /api/ai/lite/generations: flag (default OFF) -> registry gate
// (catalog-approved route, fail closed) -> durable ledger -> managed key -> per-IP burst
// -> sign-in -> validated body -> cost ceiling -> atomic quota reservation -> the call.

import { bearerToken, ipHash, json, methodGuard, readJson } from '../http.js';
import { verifyUser } from '../auth.js';
import { managedAiKey } from '../aiCredentials.js';
import { estimateModelCost, executeGatewayRequest, GatewayError } from '../aiGateway.js';
import { liteError } from '../aiLiteHttp.js';
import {
  importAnalysisPolicy,
  importAnalysisPrice,
  importAnalysisProfile,
  type ImportAnalysisProfile,
} from '../aiImportAnalysisProfile.js';
import { IMPORT_ANALYSIS_TASK_ID, importAnalysisTaskProfile, taskConfigured } from '../aiTaskRegistry.js';
import { admitTaskIp } from '../aiLiteRateLimit.js';
import { resolvePaidAiAccess } from '../entitlements.js';
import { allows } from '../../../src/entitlements/contract.js';
import { routeDisabled } from '../systemSettings.js';
import {
  getLiteGenerationStore,
  liteLedgerConfigured,
  modelResultPatch,
  type LiteGenerationRecord,
  type LiteReservation,
} from '../aiLiteStore.js';
import { importAnalysisModelRequest } from './request.js';
import {
  IMPORT_ANALYSIS_LIMITS,
  importAnalysisImageSizeOk,
  type ImportAnalysisRequest,
  type ImportAnalysisResult,
  type ImportedGraphicAnalysisV1,
} from '../../../src/ai/importAnalysis/contract.js';
import type { ModelResult } from '../../../src/ai/modelTypes.js';

const MAX_BODY_BYTES = IMPORT_ANALYSIS_LIMITS.imageBase64Chars + 16_000;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9_-]{15,127}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
// Stable base64 prefixes of the two accepted encodings (the judge endpoint's pattern).
const PNG_BASE64_PREFIX = 'iVBORw0KGgo';
const JPEG_BASE64_PREFIX = '/9j/';

function recordType(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object expected');
  return value as Record<string, unknown>;
}

function validateRequest(value: unknown): ImportAnalysisRequest {
  const body = recordType(value);
  const allowed = new Set(['idempotencyKey', 'image', 'instructions']);
  if (!Object.keys(body).every((key) => allowed.has(key))) throw new Error('unknown field');
  if (typeof body.idempotencyKey !== 'string' || !IDEMPOTENCY.test(body.idempotencyKey)) throw new Error('idempotency');
  if (body.instructions !== undefined) {
    if (typeof body.instructions !== 'string' || body.instructions.length > IMPORT_ANALYSIS_LIMITS.instructionChars) {
      throw new Error('instructions');
    }
  }
  const image = recordType(body.image);
  if (!['base64', 'mediaType', 'width', 'height'].every((key) => key in image)) throw new Error('image');
  if (!Object.keys(image).every((key) => ['base64', 'mediaType', 'width', 'height'].includes(key))) throw new Error('image');
  if (image.mediaType !== 'image/png' && image.mediaType !== 'image/jpeg') throw new Error('media type');
  if (
    typeof image.base64 !== 'string'
    || image.base64.length < 64
    || image.base64.length > IMPORT_ANALYSIS_LIMITS.imageBase64Chars
    || !BASE64.test(image.base64)
    || !image.base64.startsWith(image.mediaType === 'image/png' ? PNG_BASE64_PREFIX : JPEG_BASE64_PREFIX)
  ) throw new Error('image data');
  // The shared predicate, so the endpoint and the browser's downscaler cannot disagree
  // about what fits (contract.ts explains why it is pixels, not per-axis).
  if (!importAnalysisImageSizeOk(Number(image.width), Number(image.height))) throw new Error('image size');
  return body as unknown as ImportAnalysisRequest;
}

function reservationError(reservation: Exclude<LiteReservation, { status: 'created' }>): Response {
  if (reservation.status === 'duplicate') {
    return liteError('duplicate_request', 'This analysis request was already processed.', 409);
  }
  if (reservation.status === 'user-concurrency') {
    return liteError('already_running', 'Finish the current analysis before starting another.', 409, true);
  }
  if (reservation.status === 'fleet-concurrency' || reservation.status === 'fleet-spend') {
    return liteError('fleet_capacity', 'Graphic analysis has reached its current shared capacity. Try again later.', 503, true);
  }
  return liteError('allowance_exhausted', 'Your current analysis allowance has been used.', 429);
}

function withConfiguredCost(result: ModelResult, profile: ImportAnalysisProfile): ModelResult {
  if (result.usage.estimatedCost) return result;
  const amount = estimateModelCost(
    { provider: result.provider, model: result.model },
    result.usage.inputTokens,
    result.usage.outputTokens,
    importAnalysisPrice(profile) ?? undefined,
  );
  return amount === null
    ? result
    : { ...result, usage: { ...result.usage, estimatedCost: { amount, currency: 'USD', source: 'configured' } } };
}

async function failRecord(record: LiteGenerationRecord | null, reason: string, result?: ModelResult): Promise<void> {
  if (!record) return;
  await (await getLiteGenerationStore()).update(record.id, {
    ...(result ? modelResultPatch(result) : {}),
    status: 'failed',
    rejectionReason: reason.slice(0, 80),
  }).catch(() => null);
}

export default {
  async fetch(req: Request): Promise<Response> {
    const guard = methodGuard(req, 'POST');
    if (guard) return guard;

    const profile = importAnalysisProfile();
    if (!profile.enabled) {
      return liteError('profile_disabled', 'Graphic analysis is currently unavailable.', 503, true);
    }
    if (!taskConfigured(importAnalysisTaskProfile(profile)) || !liteLedgerConfigured()) {
      return liteError('profile_not_configured', 'Graphic analysis is not fully configured.', 503);
    }
    if (!managedAiKey(profile.route.provider)) {
      return liteError('profile_not_configured', 'Graphic analysis has no configured managed route.', 503);
    }
    const gateway = importAnalysisPolicy(profile);
    if (profile.route.provider === 'vercel' && !gateway) {
      return liteError('profile_not_configured', 'Graphic analysis is not fully configured.', 503);
    }
    const callerIpHash = ipHash(req);
    const admission = admitTaskIp(IMPORT_ANALYSIS_TASK_ID, callerIpHash);
    if (!admission.allowed) {
      return liteError('rate_limited', 'Too many analysis requests from this network. Try again shortly.', 429, true, {
        'retry-after': String(admission.retryAfterSeconds),
      });
    }
    const user = await verifyUser(bearerToken(req));
    if (!user) return liteError('authentication_required', 'Sign in to analyze a graphic with AI.', 401);

    // The entitlement gate, and the kill switch on the route it would use. Both were missing:
    // an admin could disable graphic analysis, or switch off the model serving it, and this
    // endpoint went on spending money. A switch that does not stop the spend is not a switch.
    // Both read strictly: an unreadable switch or plan refuses here, before any booking (#2034).
    const access = await resolvePaidAiAccess(user.userId);
    if (!access.ok) {
      return liteError('profile_not_configured', 'Graphic analysis is temporarily unavailable. Try again shortly.', 503, true);
    }
    if (!allows(access.entitlement, 'ai.import-analysis')) {
      return liteError('profile_disabled', 'Graphic analysis is not available for this account.', 403);
    }
    if (routeDisabled(access.settings, profile.route)) {
      return liteError('profile_not_configured', 'Graphic analysis has no available model route.', 503, true);
    }

    let request: ImportAnalysisRequest;
    try {
      request = validateRequest(await readJson<unknown>(req, MAX_BODY_BYTES));
    } catch {
      return liteError('invalid_request', 'The analysis request exceeds its supported size or shape.', 400);
    }

    const worstCase = estimateModelCost(
      profile.route,
      profile.estimatedInputTokens,
      profile.outputTokens,
      importAnalysisPrice(profile) ?? undefined,
    );
    if (worstCase === null || worstCase > profile.maxProviderCostUsd) {
      return liteError('cost_ceiling', 'The configured analysis route exceeds the per-request cost ceiling.', 503);
    }

    const store = await getLiteGenerationStore();
    const reservation = await store.reserve({
      userId: user.userId,
      ipHash: callerIpHash,
      idempotencyKey: request.idempotencyKey,
      requestedCategory: null,
      now: Date.now(),
      profile,
    });
    if (reservation.status !== 'created') return reservationError(reservation);
    let record: LiteGenerationRecord | null = reservation.record;
    record = await store.update(record.id, { status: 'model_running' });

    let accounted: ModelResult | undefined;
    try {
      const result = withConfiguredCost(await executeGatewayRequest(
        {
          request: importAnalysisModelRequest(request, profile),
          route: profile.route,
        },
        { keyFor: async (provider) => managedAiKey(provider) },
        {
          maxAttempts: profile.maxAttempts,
          retryLimit: 1,
          timeoutMs: profile.timeoutMs,
          ...(gateway ? { gateway } : {}),
        },
      ), profile);
      accounted = result;
      const actualCost = result.usage.estimatedCost?.amount ?? 0;
      if (actualCost > profile.maxProviderCostUsd) {
        await store.update(record?.id ?? '', {
          ...modelResultPatch(result),
          status: 'failed',
          rejectionReason: 'cost_ceiling',
        });
        return liteError('cost_ceiling', 'This analysis exceeded its cost ceiling and was stopped.', 503);
      }
      // The gateway revalidated the output against IMPORT_ANALYSIS_OUTPUT's schema, so
      // this cast is the schema's own guarantee; deterministic clamping/px conversion
      // is the browser normalizer's job (src/ai/importAnalysis/normalize.ts).
      const analysis = result.output as unknown as ImportedGraphicAnalysisV1;
      record = await store.update(record?.id ?? '', {
        ...modelResultPatch(result),
        status: 'usable',
        resolvedCategory: analysis.graphicType,
      });
      if (!record) return liteError('generation_failed', 'The analysis outcome could not be persisted.', 500);
      const response: ImportAnalysisResult = {
        analysisId: record.id,
        analysis,
        usage: result.usage,
        expiresAt: new Date(record.expiresAt).toISOString(),
      };
      return json(response);
    } catch (error) {
      await failRecord(record, error instanceof GatewayError ? error.code : 'internal', accounted);
      if (error instanceof GatewayError) {
        if (error.code === 'rate_limited' || error.code === 'unavailable' || error.code === 'timeout') {
          return liteError('provider_unavailable', error.message, error.status, true);
        }
        return liteError('generation_failed', error.message, error.status, false);
      }
      return liteError('generation_failed', 'The graphic could not be analyzed.', 500);
    }
  },
};
