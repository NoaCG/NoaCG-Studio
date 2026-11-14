// Studio editor calls use the deployment's managed route, never a browser-selected payer.
import { isAiProviderId, outputBudget } from '../../src/ai/modelTypes.js';
import { GatewayError } from './aiGateway.js';

const EDITOR_UNAVAILABLE = 'The Studio editor assistant is unavailable. Manual editing is available.';

/** Only presentation changes; the original failure still owns accounting and retry semantics. */
export function studioEditorErrorMessage(error: GatewayError): string {
  if (error.code === 'missing_key' || error.code === 'provider_rejected') return EDITOR_UNAVAILABLE;
  if (error.code === 'malformed_response') {
    return 'The Studio editor assistant could not complete the response. Try a simpler request or use manual editing.';
  }
  return error.message;
}

export function studioEditorBody(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const body = value as Record<string, unknown>;
  if (body.surface !== 'editor') return value;
  const provider = (process.env.VITE_AI_PROVIDER ?? '').trim() || 'vercel';
  const model = (process.env.VITE_AI_MODEL ?? '').trim() || (provider === 'vercel' ? 'alibaba/qwen3-coder-next' : '');
  if (!isAiProviderId(provider) || !model) {
    throw new GatewayError('unavailable', EDITOR_UNAVAILABLE, 503, false);
  }
  // The shared route validator has this same bound; this setting belongs to Studio.
  if (model.length > 160) throw new GatewayError('invalid_request', EDITOR_UNAVAILABLE, 400, false);
  const request = body.request && typeof body.request === 'object' && !Array.isArray(body.request)
    ? body.request as Record<string, unknown> : {};
  const structured = request.structuredOutput as { name?: unknown } | undefined;
  if (!structured || !['editor_help', 'editor_proposal'].includes(String(structured.name))
    || typeof request.maxTokens !== 'number' || request.maxTokens > outputBudget(2000)) {
    throw new GatewayError('invalid_request', 'The editor assistant request is invalid.', 400, false);
  }
  // Allowlist the request too: model, sampling, fallback and reservation overrides are not
  // editor inputs. The common validator still checks every allowed field and token bound.
  return { surface: 'editor', route: { provider, model }, request: {
    system: request.system, messages: request.messages, maxTokens: request.maxTokens,
    structuredOutput: request.structuredOutput,
  } };
}
