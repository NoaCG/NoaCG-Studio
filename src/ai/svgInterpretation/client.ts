// Browser client for the SVG interpretation task (docs/work-specs/jev-svg-import/spec.md, row 35,
// AC-5 and AC-6). The server route is api/_lib/svgInterpretation/analyze.ts.
//
// NOT OFFERED. Row 34's verdict was no go, so the route refuses every request and no surface calls
// this client: nothing here is a switch, a setting or copy. It exists so the whole path (evidence,
// request, answer, proposal, the draft's own door) is built and proved with a stubbed model, and
// a later qualified verdict only has to connect an opt-in to it.
//
// THREE STEPS, each a plain function:
//
//   - `svgPreparationEvidence`: the bounded inventory of one imported SVG, read from its own
//     sanitized markup mounted off screen. The artwork's words go only with `includeText: true`.
//   - `requestSvgInterpretation`: one opt-in request, with its own idempotency key, a timeout
//     and the caller's cancel. It never throws: any refusal, failure, timeout or cancel answers
//     `fallback: 'deterministic'`, and the import keeps what it has.
//   - `svgProposalWithReading`: the answer laid onto the draft's own proposal
//     (`svgProposalOfDraft`), changing only whether an asked text layer is a field. The draft
//     applies the result through `svgDraftWithProposal`, which refuses a stale revision and keeps
//     every correction, so a late answer can never undo an edit.

import { getAccessToken } from '../../backend/auth';
import type { SvgImportResult } from '../../assets/svgImport';
import { svgSourceRevision, type SvgProposal } from './contract.ts';
import { buildSvgEvidence, readSvgLayers, type SvgDecisionEvidence } from './evidence.ts';

export const SVG_INTERPRETATION_URL = '/api/ai/tasks/svg-interpretation';

/** Longer than the server's two attempts at their longest, so the server settles first. */
export const SVG_PREPARATION_TIMEOUT_MS = 130_000;

/** What the server read: per asked text layer, whether it is an operator field. */
export interface SvgInterpretationReading {
  generationId: string;
  sourceRevision: string;
  fields: Record<string, boolean>;
  families: string[];
  notAsked: string[];
}

export type SvgPreparationFailure = 'cancelled' | 'timeout' | 'refused' | 'unavailable' | 'malformed';

export type SvgPreparationResult =
  | { ok: true; reading: SvgInterpretationReading }
  | {
      ok: false;
      /** Always: the import keeps its deterministic result. */
      fallback: 'deterministic';
      reason: SvgPreparationFailure;
      /** The server's stable code, when it answered one. */
      code?: string;
      /** The server said a later try may succeed. */
      retryable?: boolean;
    };

/** The evidence for one imported SVG. Browser only: the boxes need a layout. */
export function svgPreparationEvidence(
  svg: Pick<SvgImportResult, 'markup' | 'width' | 'height'>,
  consent: { includeText: boolean },
): SvgDecisionEvidence {
  const stage = document.createElement('div');
  stage.setAttribute('aria-hidden', 'true');
  stage.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none;';
  // The reader's own sanitized markup, the same string the mapping step renders.
  stage.innerHTML = svg.markup;
  document.body.appendChild(stage);
  try {
    const root = stage.querySelector('svg');
    const layers = root ? readSvgLayers(root) : [];
    return buildSvgEvidence(
      { sourceRevision: svgSourceRevision(svg.markup), width: svg.width, height: svg.height, layers },
      { includeText: consent.includeText === true },
    );
  } finally {
    stage.remove();
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === 'string');

/** The 200 answer, or null when it is not one: nothing unexpected travels further. */
function readingOf(value: unknown): SvgInterpretationReading | null {
  if (!isRecord(value) || !isRecord(value.fields)) return null;
  const { generationId, sourceRevision, fields, families, notAsked } = value;
  if (typeof generationId !== 'string' || typeof sourceRevision !== 'string') return null;
  if (!Object.values(fields).every((v) => typeof v === 'boolean') || !strings(families) || !strings(notAsked)) return null;
  return { generationId, sourceRevision, fields: { ...fields } as Record<string, boolean>, families: [...families], notAsked: [...notAsked] };
}

export async function requestSvgInterpretation(
  evidence: SvgDecisionEvidence,
  options: { includeText: boolean; signal?: AbortSignal; timeoutMs?: number; fetchImpl?: typeof fetch },
): Promise<SvgPreparationResult> {
  const fail = (reason: SvgPreparationFailure, code?: string, retryable?: boolean): SvgPreparationResult =>
    ({ ok: false, fallback: 'deterministic', reason, ...(code ? { code } : {}), ...(retryable ? { retryable } : {}) });
  if (options.signal?.aborted) return fail('cancelled');
  const controller = new AbortController();
  let timedOut = false;
  const cancel = () => controller.abort();
  options.signal?.addEventListener('abort', cancel, { once: true });
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? SVG_PREPARATION_TIMEOUT_MS);
  try {
    const token = await getAccessToken();
    const response = await (options.fetchImpl ?? fetch)(SVG_INTERPRETATION_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      // A new key per request: a user's retry is a new request (phase-31, documented limit).
      body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), evidence, includeText: options.includeText === true }),
      signal: controller.signal,
    });
    const body: unknown = await response.json().catch(() => null);
    if (controller.signal.aborted) return fail(timedOut ? 'timeout' : 'cancelled');
    if (!response.ok) {
      const error = isRecord(body) && isRecord(body.error) ? body.error : {};
      const code = typeof error.code === 'string' ? error.code : undefined;
      return fail(response.status >= 500 ? 'unavailable' : 'refused', code, error.retryable === true);
    }
    const reading = readingOf(body);
    if (!reading) return fail('malformed');
    // An answer about other artwork than was asked is no answer.
    if (reading.sourceRevision !== evidence.sourceRevision) return fail('malformed');
    return { ok: true, reading };
  } catch {
    return fail(controller.signal.aborted ? (timedOut ? 'timeout' : 'cancelled') : 'unavailable');
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', cancel);
  }
}

/**
 * The reading laid onto the draft's own proposal: an asked text layer's `on` follows the answer,
 * and everything else stays as the base says. A layer a behaviour picks keeps the base decision,
 * so the answer cannot contradict the draft's own behaviour into a refusal. Refused as `stale`
 * when the base was made from other artwork than the reading.
 */
export function svgProposalWithReading(
  base: SvgProposal,
  reading: SvgInterpretationReading,
): { ok: true; proposal: SvgProposal; changed: string[] } | { ok: false; reason: 'stale' } {
  if (base.sourceRevision !== reading.sourceRevision) return { ok: false, reason: 'stale' };
  const picked = new Set(base.components.flatMap((c) => c.picks.map((p) => p.layer)));
  const changed: string[] = [];
  const fields = base.fields.map((f) => {
    const answer = reading.fields[f.layer];
    if (typeof answer !== 'boolean' || picked.has(f.layer) || answer === f.on) return f;
    changed.push(f.layer);
    return { ...f, on: answer };
  });
  return { ok: true, proposal: { ...base, fields }, changed };
}
