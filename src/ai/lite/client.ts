import { getAccessToken } from '../../backend/auth';
import { probeMark } from '../../assets/assetInfo';
import type { DesignSpec } from '../designSpec';
import type { GenerateContext } from '../provider';
import { markShapeFromAspect } from './types';
import type {
  LiteMarkDescriptor,
  LiteCategoryAlternative,
  LiteGenerationRequest,
  LiteGenerationResult,
  LiteOutcomeRequest,
  LiteStatusResponse,
  LiteUnsupportedCode,
} from './types';

interface LiteApiError {
  error?: { code?: string; message?: string; retryable?: boolean };
}

export class LiteRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.code = code;
    this.retryable = retryable;
  }
}

export class LiteUnsupportedError extends Error {
  readonly code: LiteUnsupportedCode;
  readonly suggestedBrief?: string;
  readonly categoryChoices?: LiteCategoryAlternative[];

  constructor(
    code: LiteUnsupportedCode,
    message: string,
    suggestedBrief?: string,
    categoryChoices?: LiteCategoryAlternative[],
  ) {
    super(message);
    this.code = code;
    this.suggestedBrief = suggestedBrief;
    this.categoryChoices = categoryChoices;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  };
}

async function checkedJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => null) as LiteApiError | null;
    const code = body?.error?.code ?? 'generation_failed';
    throw new LiteRequestError(
      code,
      code === 'shared_capacity' || code === 'fleet_capacity'
        ? 'Create with AI is temporarily busy. Please try again in a moment.'
        : body?.error?.message ?? 'Create with AI could not complete the request.',
      body?.error?.retryable ?? false,
    );
  }
  return response.json() as Promise<T>;
}

export async function loadLiteStatus(): Promise<LiteStatusResponse> {
  const token = await getAccessToken();
  const response = await fetch('/api/ai/lite/status', {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return checkedJson<LiteStatusResponse>(response);
}

/**
 * Measure the user's mark, if there is exactly one. Returns null on anything unreadable, which
 * is the pre-2026-08-09 behaviour exactly: the server still gets `hasLogo` and the model still
 * gets "there is a logo", just without the three facts that let it choose a chassis that can
 * actually carry it (`docs/AI_LITE_PLAN.md` §7.5).
 *
 * The 0.35 / 0.65 cut is deliberately WIDE of the middle. It only has to separate a knockout
 * mark from a dark-ink one, and a mark whose ink averages mid-grey has no honest answer - so it
 * gets none, and the model is told the shape without being told a tone that might be wrong.
 */
async function describeMark(context: GenerateContext): Promise<LiteMarkDescriptor | null> {
  if (context.images.length !== 1) return null;
  const probe = await probeMark(context.images[0]);
  if (!probe) return null;
  const ink = probe.inkLuminance >= 0.65 ? 'light' : probe.inkLuminance <= 0.35 ? 'dark' : undefined;
  return {
    shape: markShapeFromAspect(probe.aspect),
    backing: probe.backing,
    ...(probe.backing === 'transparent' && ink ? { ink } : {}),
  };
}

export async function generateLiteDesign(
  prompt: string,
  context: GenerateContext,
  priorSpec?: DesignSpec,
): Promise<LiteGenerationResult> {
  const request: LiteGenerationRequest = {
    idempotencyKey: crypto.randomUUID(),
    prompt,
    generationSpec: context.spec
      ? {
          version: 1,
          category: context.spec.category,
          fields: context.spec.fields.map(({ label, kind, description, example }) => ({
            label,
            kind,
            description,
            example,
          })),
          styleNotes: context.spec.styleNotes,
          mood: context.spec.mood,
          avoidNotes: context.spec.avoidNotes,
          brandColors: context.spec.brandColors,
          animation: context.spec.animation as unknown as Record<string, unknown>,
        }
      : null,
    priorSpec: priorSpec as unknown as LiteGenerationRequest['priorSpec'],
    conversation: context.conversation?.map((turn) => ({ role: turn.role, content: turn.text })),
    palette: context.palette,
    primaryFont: context.customFont
      ? { family: context.customFont.family, uploaded: true }
      : context.spec?.fonts?.primary?.fontId
        ? { family: context.spec.fonts.primary.fontId, uploaded: false }
        : null,
    hasLogo: context.images.length === 1,
    mark: await describeMark(context),
    // ProjectFormatPreset has creation-only ID/capability fields. The managed contract is
    // deliberately narrower and server-authoritative: only authored dimensions cross it.
    resolution: { width: context.resolution.width, height: context.resolution.height },
    fps: context.fps,
  };
  const response = await fetch('/api/ai/lite/generations', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(request),
  });
  const result = await checkedJson<LiteGenerationResult>(response);
  if (result.decision.status === 'unsupported') {
    throw new LiteUnsupportedError(
      result.decision.code,
      result.decision.message,
      result.decision.suggestedBrief,
      result.decision.categoryChoices,
    );
  }
  return result;
}

export async function recordLiteOutcome(request: LiteOutcomeRequest): Promise<void> {
  const response = await fetch('/api/ai/lite/outcome', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(request),
  });
  await checkedJson(response);
}
