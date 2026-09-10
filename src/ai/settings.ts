// Browser-safe AI routing preferences. API keys never enter this module or localStorage:
// managed keys stay in server environment variables, while optional user keys are sealed
// by /api/ai/credentials into an HttpOnly cookie.

import { getAccessToken } from '../backend/auth';
import {
  AI_PROVIDER_IDS,
  isAiProviderId,
  type AiGatewayErrorBody,
  type AiProviderId,
  type ModelRoute,
} from './modelTypes';
// The graphic-type ids alone, from the module that carries no catalog behind it. `graphics.ts`
// pulls in three composers and their category assemblers, which is a large thing for a
// preferences file every surface loads to import for a list of four strings.
import { PRO_PACKAGE_IDS, type ProGraphicId } from './pro/language/structure';

const STORAGE_KEY = 'spx-gfx-ai';

export interface AiModelOption {
  provider: AiProviderId;
  id: string;
  label: string;
  blurb: string;
  role?: 'default' | 'fast';
}

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  blurb: string;
  /** What this provider CALLS the credential it issues. Hugging Face issues user access
   *  TOKENS and has no such thing as an API key, so a surface asking for a "Hugging Face key"
   *  is asking for something that does not exist - the user then looks for it, does not find
   *  it, and reasonably concludes the integration is broken. Defaults to 'key'. */
  credential?: 'key' | 'token';
}

/**
 * THE BRING-YOUR-OWN-KEY PROVIDERS - the whole user-facing provider vocabulary.
 *
 * Deliberately a SUBSET of `AI_PROVIDER_IDS`: `vercel` is the managed transport NoaCG funds
 * its own tiers through, never a choice a user makes (see modelTypes.ts). The two lists are
 * separate on purpose - collapsing them either offers our plumbing as a product or breaks
 * every managed route.
 */
export const AI_PROVIDERS: AiProviderOption[] = [
  { id: 'openai', label: 'OpenAI', blurb: 'GPT models on your own OpenAI key. Your key pays for every generation.' },
  { id: 'anthropic', label: 'Anthropic', blurb: 'Claude models on your own Anthropic key. Your key pays for every generation.' },
  { id: 'google', label: 'Google', blurb: 'Gemini models on your own Google AI key. Your key pays for every generation.' },
  {
    id: 'huggingface',
    label: 'Hugging Face',
    blurb: 'Open-weight models through Hugging Face Inference Providers, on your own access token.',
    credential: 'token',
  },
];

/** The word a provider uses for its own credential, for any surface that has to name it. */
export function credentialNoun(provider: AiProviderId): 'key' | 'token' {
  return AI_PROVIDERS.find((option) => option.id === provider)?.credential ?? 'key';
}

export const BYOK_PROVIDER_IDS: AiProviderId[] = AI_PROVIDERS.map((provider) => provider.id);

/** Whether a route is one a USER can be asked to choose and pay for. */
export function isByokProvider(provider: AiProviderId): boolean {
  return BYOK_PROVIDER_IDS.includes(provider);
}

/** The bring-your-own-key surface's own default route. Separate from `DEFAULT_PROVIDER`
 *  below, which is the MANAGED transport: a tier whose whole promise is "your key" must
 *  never resolve to the key NoaCG pays for. */
export const DEFAULT_BYOK_PROVIDER: AiProviderId = 'openai';

/** Central model catalog. The rest of NoaCG only stores opaque provider/model routes. */
export const AI_MODELS: AiModelOption[] = [
  {
    provider: 'anthropic',
    id: 'claude-sonnet-5',
    label: 'Claude Sonnet 5',
    blurb: 'Recommended Claude route for design and code.',
    role: 'default',
  },
  {
    provider: 'anthropic',
    id: 'claude-opus-4-8',
    label: 'Claude Opus 4.8',
    blurb: 'Maximum Claude quality; slower and more expensive.',
  },
  {
    provider: 'anthropic',
    id: 'claude-haiku-4-5-20251001',
    label: 'Claude Haiku 4.5',
    blurb: 'Fast Claude route for lightweight planning stages.',
    role: 'fast',
  },
  {
    provider: 'openai',
    // Tiered exactly like the gateway entry below, and dead in the same way: the direct API
    // lists gpt-5.6-luna / -sol / -terra and no bare `gpt-5.6`. Luna is the cost-efficient tier
    // - the cheapest suggestion for a route the user pays for with their own key.
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    blurb: 'OpenAI Responses API route for design and code.',
    role: 'default',
  },
  {
    provider: 'vercel',
    id: 'alibaba/qwen3-coder-next',
    label: 'Qwen3 Coder Next',
    blurb: 'Open-weight default route for design and code.',
    role: 'default',
  },
  {
    provider: 'vercel',
    id: 'alibaba/qwen-3-30b',
    label: 'Qwen3 30B',
    blurb: 'Fast, cheap open-weight route for structured planning stages.',
    role: 'fast',
  },
  {
    provider: 'vercel',
    // GPT-5.6 ships as named tiers rather than one id - luna (fast, cost-efficient), terra
    // (balanced), sol (flagship). A bare `openai/gpt-5.6` has never existed on any gateway, so
    // picking it returned a provider error; scripts/check-model-ids.mjs catches that class
    // against the live listing.
    id: 'openai/gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    blurb: 'Proprietary route; any supported model id can be entered.',
  },
  {
    provider: 'google',
    // Verified callable on a fresh Google key 2026-08-14. Do NOT put a 2.5-series id here: the
    // listing still advertises them and they answer 404 "no longer available to new users",
    // which is exactly the trap a fallback suggestion must not walk someone into.
    id: 'gemini-3.1-flash-lite',
    label: 'Gemini 3.1 Flash Lite',
    blurb: 'Fallback suggestion when live Google discovery is unavailable.',
    role: 'default',
  },
  {
    provider: 'huggingface',
    id: 'openai/gpt-oss-120b',
    label: 'GPT-OSS 120B via Hugging Face',
    blurb: 'Fallback suggestion when live Hugging Face discovery is unavailable.',
    role: 'default',
  },
];

/** Persisted Create-with-AI execution ids.
 *
 *  `lite` and `pro` are read-only history. They must stay in this union so old
 *  `spx-gfx-ai` values can be recognized and migrated on read, but new settings never write
 *  either id. `null` now means the hosted path and `custom` remains the user's own account. */
export const AI_TIERS = ['lite', 'pro', 'custom'] as const;
export type AiTier = (typeof AI_TIERS)[number];

export function isAiTier(value: unknown): value is AiTier {
  return typeof value === 'string' && (AI_TIERS as readonly string[]).includes(value);
}

/**
 * NOTE FOR ANYONE LOOKING FOR A PRO FLAG HERE: there isn't one, and there must not be.
 *
 * NoaCG Pro is offered by the SERVER or not at all - `GET /api/ai/pro-status` answers whether
 * hosted Pro is available to this visitor (`AI_PRO_ENABLED`, their entitlement, their
 * allowance), and AiStep additionally requires a configured backend, because that route
 * reserves and settles per account. A client flag beside a server answer is two switches for
 * one door: a deployment then meters Pro while showing no door, or shows one it will refuse.
 *
 * The wizard door is closed even when this status endpoint reports availability. The status
 * and pipeline remain in place for the measured comparison recorded in
 * docs/backlog/one-noacg-ai-harness-not-lite-and-pro.md.
 */

export interface AiSettings {
  provider: AiProviderId;
  model: string;
  /** The execution route: null = hosted, custom = the user's own account. Historical lite and
   *  pro ids are accepted only so loadAiSettings can migrate them on read. */
  tier: AiTier | null;
  /** Explicitly ordered routes only. No entry means no cross-provider fallback. */
  fallbacks: ModelRoute[];
  /** Non-secret availability cache populated by /api/ai/config or a successful key save. */
  configuredProviders: AiProviderId[];
  keyStorageAvailable: boolean | null;
  /**
   * Generate through the NoaCG harness (DesignSpec routing, grounded assembly, runtime
   * bench and alternatives) rather than the plain one-shot path.
   */
  useHarness: boolean;
  /** Optional provider sampling controls, primarily used by the versioned benchmark. */
  temperature: number | null;
  seed: number | null;
  /** The NoaCG Pro concept-image model (a gateway image-output model id). Non-secret,
   *  like every route preference here; null = not chosen yet. */
  proImageModel: string | null;
  /**
   * WHICH GRAPHICS A PRO GENERATION MAKES (docs/NOACG_PRO_PLAN.md §15.9).
   *
   * Pro's promise is a package - a lower third, a sponsor bug and a countdown that visibly
   * belong to each other - and the whole package costs ONE model call, because only the design
   * LANGUAGE is paid for and composing each graphic is deterministic. So the default is the
   * whole set rather than one graphic with the rest opt-in: a tier whose differentiator is
   * buried behind a checkbox nobody ticks is a tier nobody buys.
   *
   * An empty list is read as "the whole package" rather than "nothing", so a stored value from
   * before this existed - and a user who unticks everything - both get a graphic instead of a
   * silent no-op. Order is always `PRO_GRAPHIC_IDS`, never the order they were ticked in: the
   * first member is the one the step previews and refines, and that must not move under a
   * click on a checkbox further down.
   */
  proPackage: ProGraphicId[];
}

export interface AiProviderStatus {
  id: AiProviderId;
  userKey: boolean;
  managedKey: boolean;
  available: boolean;
  requiresSignIn: boolean;
}

export interface AiConfiguration {
  keyStorageAvailable: boolean;
  providers: AiProviderStatus[];
}

// The silent default - what an unset VITE_AI_PROVIDER resolves to - is an OPEN model on the
// MANAGED transport, by policy: expensive proprietary routes (Claude, GPT) are chosen
// deliberately (saved settings, env, or the picker), never because an environment variable is
// missing. This is the harness's fallback route, NOT a user-facing choice - the bring-your-own-key
// surface resolves through DEFAULT_BYOK_PROVIDER instead.
export const DEFAULT_PROVIDER: AiProviderId = 'vercel';
export const DEFAULT_MODEL = 'alibaba/qwen3-coder-next';

function env(name: string): string {
  return String((import.meta.env as Record<string, unknown>)[name] ?? '');
}

export function modelsForProvider(provider: AiProviderId): AiModelOption[] {
  return AI_MODELS.filter((model) => model.provider === provider);
}

export function defaultModelForProvider(provider: AiProviderId, role: 'default' | 'fast' = 'default'): string {
  const models = modelsForProvider(provider);
  return models.find((model) => model.role === role)?.id
    ?? models.find((model) => model.role === 'default')?.id
    ?? models[0]?.id
    ?? '';
}

function validRoutes(value: unknown): ModelRoute[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((route): route is Record<string, unknown> => Boolean(route) && typeof route === 'object' && !Array.isArray(route))
    .filter((route) => isAiProviderId(route.provider) && typeof route.model === 'string' && Boolean(route.model.trim()))
    .slice(0, 3)
    .map((route) => ({ provider: route.provider as AiProviderId, model: String(route.model).trim() }));
}

function envRoutes(): ModelRoute[] {
  try {
    return validRoutes(JSON.parse(env('VITE_AI_FALLBACKS') || '[]'));
  } catch {
    return [];
  }
}

function validProviders(value: unknown): AiProviderId[] {
  if (!Array.isArray(value)) return [];
  return AI_PROVIDER_IDS.filter((provider) => value.includes(provider));
}

function readSaved(): Record<string, unknown> {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const saved = parsed as Record<string, unknown>;
    // One-way security migration: old releases stored the raw Anthropic key here. Never
    // retransmit it implicitly; erase it and ask the user to enter it into secure storage.
    if ('apiKey' in saved || 'proxyUrl' in saved) {
      delete saved.apiKey;
      delete saved.proxyUrl;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
    }
    return saved;
  } catch {
    return {};
  }
}

/** Load only non-secret routing and availability preferences. */
export function loadAiSettings(): AiSettings {
  const saved = readSaved();
  const envProvider = env('VITE_AI_PROVIDER');
  const provider = isAiProviderId(saved.provider)
    ? saved.provider
    : isAiProviderId(envProvider)
      ? envProvider
      : DEFAULT_PROVIDER;
  const model = typeof saved.model === 'string' && saved.model.trim()
    ? saved.model.trim()
    : env('VITE_AI_MODEL') || defaultModelForProvider(provider) || DEFAULT_MODEL;
  // Historical managed ids now resolve to the single hosted path. Preserve `custom`, whose
  // meaning has not changed, and normalize every other stored value to the hosted null id.
  const tier: AiTier | null = saved.tier === 'custom' ? 'custom' : null;
  return {
    provider,
    model,
    tier,
    fallbacks: 'fallbacks' in saved ? validRoutes(saved.fallbacks) : envRoutes(),
    configuredProviders: validProviders(saved.configuredProviders),
    keyStorageAvailable: typeof saved.keyStorageAvailable === 'boolean' ? saved.keyStorageAvailable : null,
    useHarness: typeof saved.useHarness === 'boolean' ? saved.useHarness : true,
    temperature:
      typeof saved.temperature === 'number' && Number.isFinite(saved.temperature)
        ? Math.min(2, Math.max(0, saved.temperature))
        : null,
    seed:
      typeof saved.seed === 'number' && Number.isSafeInteger(saved.seed)
        ? saved.seed
        : null,
    proImageModel: typeof saved.proImageModel === 'string' && saved.proImageModel.trim()
      ? saved.proImageModel.trim().slice(0, 160)
      : null,
    proPackage: proPackageFrom(saved.proPackage),
  };
}

/**
 * The stored package, normalized: PACKAGE ids only, always in the package's declared order, and
 * an empty result read as the WHOLE package.
 *
 * The order is not cosmetic - the first member is the graphic the step previews and refines -
 * and reading empty as everything is what keeps a stored value written before this field
 * existed, or a user who unticks the last box, from producing a generation that makes nothing.
 *
 * It filters against `PRO_PACKAGE_IDS`, not every id the composer knows: a type that composes
 * but has not passed its owner read (`readyForPackage`, pro/language/graphics.ts) must not enter
 * anyone's stored package - and when such a type later ships, this same filter is what makes a
 * stored value from before that day simply not name it yet.
 */
function proPackageFrom(value: unknown): ProGraphicId[] {
  const asked = Array.isArray(value) ? value : [];
  const kept = PRO_PACKAGE_IDS.filter((id) => asked.includes(id));
  return kept.length ? kept : [...PRO_PACKAGE_IDS];
}

export function saveAiSettings(patch: Partial<AiSettings>): void {
  const current = loadAiSettings();
  const provider = patch.provider ?? current.provider;
  const providerChanged = provider !== current.provider;
  const merged: AiSettings = {
    ...current,
    ...patch,
    provider,
    model: patch.model ?? (providerChanged ? defaultModelForProvider(provider) : current.model),
    fallbacks: validRoutes(patch.fallbacks ?? current.fallbacks),
    configuredProviders: validProviders(patch.configuredProviders ?? current.configuredProviders),
    // Normalized on the way IN as well as on the way out, for the same reason the two lists
    // above are: a caller unticking the last box would otherwise persist an empty array that
    // only the reader repairs, so the stored value and the loaded one would disagree.
    proPackage: proPackageFrom(patch.proPackage ?? current.proPackage),
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Storage full or unavailable. These are non-secret provider/model PREFERENCES; losing one
    // costs a re-pick, while throwing here would take down whichever surface saved them (the
    // prefs.ts case, measured 2026-08-06 - a full quota unmounted the whole app).
  }
}

export function aiConfigured(settings: AiSettings = loadAiSettings()): boolean {
  return settings.configuredProviders.includes(settings.provider);
}

async function gatewayHeaders(): Promise<Record<string, string>> {
  const token = await getAccessToken();
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function refreshAiConfiguration(): Promise<AiConfiguration> {
  const response = await fetch('/api/ai/config', { headers: await gatewayHeaders() });
  if (!response.ok) throw new Error('Could not read AI provider configuration.');
  const config = await response.json() as AiConfiguration;
  const available = config.providers.filter((provider) => provider.available).map((provider) => provider.id);
  saveAiSettings({ configuredProviders: available, keyStorageAvailable: config.keyStorageAvailable });
  return config;
}

async function credentialRequest(method: 'PUT' | 'DELETE', provider: AiProviderId, key?: string): Promise<void> {
  const response = await fetch('/api/ai/credentials', {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, ...(key ? { key } : {}) }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as AiGatewayErrorBody | null;
    throw new Error(body?.error.message ?? 'Could not update the provider key.');
  }
}

export async function saveUserAiKey(provider: AiProviderId, key: string): Promise<void> {
  await credentialRequest('PUT', provider, key.trim());
  const current = loadAiSettings();
  saveAiSettings({
    configuredProviders: validProviders([...current.configuredProviders, provider]),
    keyStorageAvailable: true,
  });
}

export async function deleteUserAiKey(provider: AiProviderId): Promise<void> {
  await credentialRequest('DELETE', provider);
  await refreshAiConfiguration();
}
