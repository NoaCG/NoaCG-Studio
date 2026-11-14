// Browser client for the server-side model gateway. It deliberately contains no provider
// credentials and exposes the same structured/text call shape the existing harness uses.

import { getAccessToken } from '../backend/auth';
import { defaultModelForProvider, loadAiSettings } from './settings';
import {
  ModelGatewayError,
  type AiGatewayErrorBody,
  type AiGatewayRequestBody,
  type AiGatewayResponseBody,
  type AiGatewaySurface,
  type ModelContentBlock,
  type ModelRequest,
  type ModelResult,
  type ModelRoute,
  type StructuredOutput,
} from './modelTypes';

export type ContentBlock = ModelContentBlock;

export interface ModelTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface GatewayModelRequest extends Omit<ModelRequest, 'structuredOutput'> {
  /** Compatibility shape used by the established harness's forced structured calls. */
  tool?: ModelTool;
  /** The product surface this call belongs to, when the server gates that surface. Callers
   *  never set it by hand: `src/ai/video/videoGateway.ts` and `src/ai/pro/proGateway.ts`
   *  and the Studio editor helper below fill it in, so a new gated call cannot forget it. */
  surface?: AiGatewaySurface;
  /** The hosted NoaCG Pro reservation paying for this call (src/ai/pro/session.ts). Absent on
   *  a bring-your-own-key run, which spends the caller's own money and needs no allowance. */
  proGenerationId?: string;
  /** Pin the FULL route for this call, bypassing the session's provider/model AND its
   *  fallbacks. For calls whose modality the session route cannot serve (an image
   *  generation on a text session model), where a settings fallback would be a silent
   *  route change into the wrong capability. */
  route?: ModelRoute;
}

export async function callModelDetailed(request: GatewayModelRequest): Promise<ModelResult> {
  const settings = loadAiSettings();
  const model = request.model
    ?? (request.modelRole === 'fast' ? defaultModelForProvider(settings.provider, 'fast') : settings.model)
    ?? settings.model;
  const structuredOutput: StructuredOutput | undefined = request.tool
    ? {
        name: request.tool.name,
        description: request.tool.description,
        schema: request.tool.input_schema,
      }
    : undefined;
  const {
    tool: _tool,
    model: _model,
    modelRole: _modelRole,
    surface,
    proGenerationId,
    route: pinnedRoute,
    ...providerNeutralRequest
  } = request;
  const route = pinnedRoute ?? { provider: settings.provider, model };
  const body: AiGatewayRequestBody = {
    request: {
      ...providerNeutralRequest,
      ...(settings.temperature !== null && route.provider === 'vercel'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && route.provider === 'vercel'
        ? { seed: settings.seed }
        : {}),
      ...(settings.temperature !== null && route.provider === 'huggingface'
        ? { temperature: settings.temperature }
        : {}),
      ...(settings.seed !== null && route.provider === 'huggingface'
        ? { seed: settings.seed }
        : {}),
      ...(structuredOutput ? { structuredOutput } : {}),
    },
    route,
    // A pinned route means exactly that route: the session's fallbacks belong to the
    // session model, not to a call that pinned a different capability.
    ...(!pinnedRoute && settings.fallbacks.length ? { fallbacks: settings.fallbacks } : {}),
    ...(surface ? { surface } : {}),
    ...(proGenerationId ? { proGenerationId } : {}),
  };
  return sendModelRequest(body);
}

/** Studio supplies the editor assistant. This path never loads personal AI preferences. */
export function callStudioEditorModelDetailed(request: GatewayModelRequest): Promise<ModelResult> {
  return sendModelRequest({
    surface: 'editor',
    request: {
      system: request.system, messages: request.messages, maxTokens: request.maxTokens,
      ...(request.tool ? { structuredOutput: { name: request.tool.name, description: request.tool.description, schema: request.tool.input_schema } } : {}),
    },
  });
}

async function sendModelRequest(body: unknown): Promise<ModelResult> {
  const token = await getAccessToken();
  const response = await fetch('/api/ai/generate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as AiGatewayErrorBody | null;
    // A TYPED refusal: `code` and `retryable` survive to the caller, so a retry decision can
    // branch on what the server actually said rather than on prose (modelTypes.ts). A response
    // with no parseable body never came from the gateway's own vocabulary (a platform 502/503
    // serves HTML), so it is classified by status: a 5xx is the outage shape and retryable, a
    // 4xx is a durable refusal.
    throw new ModelGatewayError(
      error?.error.code ?? (response.status >= 500 ? 'unavailable' : 'invalid_request'),
      error?.error.message ?? 'The AI request failed.',
      error?.error.retryable ?? response.status >= 500,
      response.status,
    );
  }
  return response.json() as Promise<AiGatewayResponseBody>;
}

export async function callModel(request: GatewayModelRequest): Promise<unknown> {
  return (await callModelDetailed(request)).output;
}
