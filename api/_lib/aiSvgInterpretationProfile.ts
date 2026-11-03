// Server-owned configuration and data policy for the SVG interpretation task
// (docs/work-specs/jev-svg-import/spec.md, "AI route and data policy", row 31, AC-6). Same posture
// as aiImportAnalysisProfile.ts: route, price, privacy policy, quotas and the kill switch are
// private server configuration; the browser sees availability and allowance only.
//
// OFF BY DEFAULT, and it stays off until the row 34 verdict: AI_TASK_SVG_INTERPRETATION_ENABLED
// unset means `enabled: false`, so the registry gate and the decision adapter refuse before any
// request is built. The existing route kill switch (system_settings.disabled_routes) is a second,
// independent stop on the same route.
//
// ONE ALLOWANCE WITH GRAPHIC ANALYSIS. Interpreting an imported SVG is the second kind of imported
// graphic analysis, so it books against the existing `import-analysis` ledger profile and its
// quotas, read from importAnalysisProfile() rather than copied. The ledger's profile column admits
// no new value without a migration, and this plan adds none.
//
// WHAT MAY LEAVE THE SERVER. The default evidence is a bounded inventory: layer ids, names,
// hierarchy, geometry, and the SHAPE of text (characters and lines). The artwork's actual text
// goes only with the request's explicit include-text consent; a rendered preview never goes in
// this row. Names and text are DATA: they sit in `state` as JSON values, and the questions'
// instructions are built by the server, never from anything the artwork says.

import type { GatewayRoutingPolicy, ModelPrice } from './aiGateway.js';
import { decisionModelPrices, modelRouteKey } from './aiModelCatalog.js';
import { boolEnv, envRoute, intEnv, numberEnv } from './aiLiteProfile.js';
import { importAnalysisProfile } from './aiImportAnalysisProfile.js';
import type { LedgerQuotaProfile } from './aiLiteStore.js';
import type { ModelRoute } from '../../src/ai/modelTypes.js';

export const SVG_INTERPRETATION_PROMPT_VERSION = 'svg-interpretation-v1';

/** The bounds a decision request is held to before it is sent. The request bound sits well
 *  inside the primary candidate's 32,000-token context: a token is at least one byte of the
 *  serialized request, so bytes bound tokens from above. */
export const SVG_DECISION_LIMITS = {
  layers: 300,
  idChars: 64,
  nameChars: 64,
  textChars: 200,
  depth: 16,
  questions: 32,
  questionKeyChars: 48,
  instructionChars: 400,
  options: 12,
  optionKeyChars: 32,
  criterionChars: 160,
  requestBytes: 24_000,
} as const;

export interface SvgInterpretationProfile extends LedgerQuotaProfile {
  id: 'import-analysis';
  enabled: boolean;
  route: ModelRoute;
  prices: Record<string, ModelPrice>;
  gatewayProviders: string[];
  /** Always true here, with no setting to turn it off: the candidates' ZDR is a listing claim no
   *  real call has verified, so the request directive is the only guarantee and must not lapse. */
  requireZdr: true;
  /** Two attempts per logical request, never more (spec, "Ceiling"). */
  maxAttempts: 2;
  timeoutMs: number;
}

function providerSlugs(): string[] {
  // Its own allowlist only. Lite's list names the providers of its text routes; falling back to
  // it would exclude the decision model's provider and fail every call as route_not_permitted.
  return (process.env.AI_SVG_INTERPRETATION_GATEWAY_PROVIDERS ?? '')
    .split(',').map((value) => value.trim()).filter(Boolean).slice(0, 8);
}

export function svgInterpretationProfile(): SvgInterpretationProfile {
  const allowance = importAnalysisProfile();
  return {
    id: 'import-analysis',
    enabled: boolEnv('AI_TASK_SVG_INTERPRETATION_ENABLED'),
    promptVersion: SVG_INTERPRETATION_PROMPT_VERSION,
    route: envRoute(
      process.env.AI_SVG_INTERPRETATION_PROVIDER,
      process.env.AI_SVG_INTERPRETATION_MODEL,
      { provider: 'vercel', model: 'typesafe-ai/jev-1.14.0' },
    ),
    // The audited decision-candidate snapshot only, no override: an unlisted or unpriced route
    // fails closed at the registry gate and again in the adapter.
    prices: decisionModelPrices(),
    gatewayProviders: providerSlugs(),
    requireZdr: true,
    // One request is at most 24,000 input tokens at $0.042 per million: about $0.001 an attempt.
    // The ceiling is two such attempts with a little room, and the adapter refuses a request
    // whose priced worst case does not fit under it.
    maxProviderCostUsd: numberEnv('AI_SVG_INTERPRETATION_MAX_COST_USD', 0.0025, 0.0001, 0.01),
    maxAttempts: 2,
    timeoutMs: intEnv('AI_SVG_INTERPRETATION_TIMEOUT_MS', 15_000, 2000, 60_000),
    dailyStarts: allowance.dailyStarts,
    monthlyStarts: allowance.monthlyStarts,
    dailySuccesses: allowance.dailySuccesses,
    monthlySuccesses: allowance.monthlySuccesses,
    maxConcurrentPerUser: allowance.maxConcurrentPerUser,
    maxConcurrentFleet: allowance.maxConcurrentFleet,
    dailyFleetSpendUsd: allowance.dailyFleetSpendUsd,
    expiryMs: allowance.expiryMs,
  };
}

/** The gateway routing directives for a decision call: no training, ZDR when required, the
 *  audited providers only, tagged for spend. No `models` list: decision fallbacks would rerun the
 *  request on another model, which is the automatic cascade the spec forbids. Undefined when the
 *  route is unpriced or no provider is allowed, which the caller treats as not configured. */
export function svgInterpretationPolicy(profile: SvgInterpretationProfile): GatewayRoutingPolicy | undefined {
  if (profile.route.provider !== 'vercel') return undefined;
  if (!profile.prices[modelRouteKey(profile.route)]) return undefined;
  if (profile.gatewayProviders.length === 0) return undefined;
  return {
    zeroDataRetention: profile.requireZdr,
    disallowPromptTraining: true,
    only: profile.gatewayProviders,
    tags: ['surface:svg-interpretation'],
  };
}

// ---- The evidence a request may carry ----

export type SvgEvidenceLayerKind = 'text' | 'image' | 'shape' | 'group';

export interface SvgEvidenceLayer {
  id: string;
  kind: SvgEvidenceLayerKind;
  name?: string;
  parent?: string;
  /** x, y, width, height in the artwork's own units. */
  box: [number, number, number, number];
  /** Text layers: how long the text is and how many lines it draws. */
  chars?: number;
  lines?: number;
  /** Text layers, and only with the include-text consent. */
  text?: string;
}

export interface SvgDecisionEvidence {
  sourceRevision: string;
  canvas: { width: number; height: number };
  layers: SvgEvidenceLayer[];
}

export interface SvgEvidenceConsent {
  /** The user explicitly chose to send the artwork's text for this request. */
  includeText: boolean;
}

const KINDS: readonly SvgEvidenceLayerKind[] = ['text', 'image', 'shape', 'group'];
const LAYER_KEYS = ['id', 'kind', 'name', 'parent', 'box', 'chars', 'lines', 'text'];
/** Control and format characters (bidi overrides, zero-width marks) and line separators: a name
 *  or a text value is one plain line, so it reads as it renders and cannot hide anything. */
export const UNPLAIN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const REVISION = /^sha256:[0-9a-f]{64}$/;

export const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown, max: number) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max;
export const plain = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max && !UNPLAIN.test(v);

/**
 * Is this the evidence the policy lets leave the server? All or nothing, and it names only a
 * rule, never a value, so a refusal cannot carry the artwork's words anywhere. A key outside the
 * shape is refused rather than dropped: a preview image, a file, a URL or a note has no place
 * here, whatever it is called.
 */
export function svgEvidenceRefusal(state: unknown, consent: SvgEvidenceConsent): string | null {
  if (!isRecord(state)) return 'evidence-shape';
  if (Object.keys(state).some((key) => !['sourceRevision', 'canvas', 'layers'].includes(key))) return 'evidence-key';
  if (typeof state.sourceRevision !== 'string' || !REVISION.test(state.sourceRevision)) return 'evidence-revision';
  const canvas = state.canvas;
  if (!isRecord(canvas) || Object.keys(canvas).some((key) => key !== 'width' && key !== 'height')
    || !finite(canvas.width) || !finite(canvas.height) || canvas.width <= 0 || canvas.height <= 0) return 'evidence-canvas';
  if (!Array.isArray(state.layers) || state.layers.length > SVG_DECISION_LIMITS.layers) return 'evidence-layers';
  const ids = new Set<string>();
  const parents = new Map<string, string | undefined>();
  for (const layer of state.layers) {
    if (!isRecord(layer) || Object.keys(layer).some((key) => !LAYER_KEYS.includes(key))) return 'evidence-key';
    if (!plain(layer.id, SVG_DECISION_LIMITS.idChars) || ids.has(layer.id)) return 'evidence-id';
    ids.add(layer.id);
    if (!KINDS.includes(layer.kind as SvgEvidenceLayerKind)) return 'evidence-kind';
    if (layer.name !== undefined && !plain(layer.name, SVG_DECISION_LIMITS.nameChars)) return 'evidence-name';
    if (layer.parent !== undefined && !plain(layer.parent, SVG_DECISION_LIMITS.idChars)) return 'evidence-parent';
    parents.set(layer.id, layer.parent as string | undefined);
    if (!Array.isArray(layer.box) || layer.box.length !== 4 || !layer.box.every(finite)) return 'evidence-box';
    const isText = layer.kind === 'text';
    if (layer.chars !== undefined && (!isText || !count(layer.chars, 100_000))) return 'evidence-text-shape';
    if (layer.lines !== undefined && (!isText || !count(layer.lines, 10_000))) return 'evidence-text-shape';
    if (layer.text !== undefined) {
      // Only an explicit `true` is the choice: a string or a number is not consent.
      if (consent.includeText !== true) return 'text-without-consent';
      if (!isText || !plain(layer.text, SVG_DECISION_LIMITS.textChars)) return 'evidence-text';
    }
  }
  // Hierarchy: every parent is a listed group, and following parents ends within the depth limit
  // (which also refuses a cycle).
  const groups = new Set((state.layers as SvgEvidenceLayer[]).filter((l) => l.kind === 'group').map((l) => l.id));
  for (const [id, parent] of parents) {
    if (parent === undefined) continue;
    if (!groups.has(parent)) return 'evidence-parent';
    let at: string | undefined = id;
    for (let depth = 0; at !== undefined; depth++) {
      if (depth > SVG_DECISION_LIMITS.depth) return 'evidence-depth';
      at = parents.get(at);
    }
  }
  return null;
}
