import { useEffect, useMemo, useRef, useState } from 'react';
import { getAiProvider } from '../../../ai';
import { brainstorm, type ChatMessage } from '../../../ai/brainstorm';
import {
  EXAMPLE_PROMPTS,
  LITE_EXAMPLE_PROMPTS,
  PRO_EXAMPLE_PROMPTS,
} from '../../../ai/examplePrompts';
import {
  AI_PROVIDERS,
  DEFAULT_BYOK_PROVIDER,
  aiConfigured,
  isByokProvider,
  loadAiSettings,
  saveAiSettings,
  type AiTier,
} from '../../../ai/settings';
import type { AiPath, AiTemplateChange, GenerateContext, GenerateOptions, SpxValidator } from '../../../ai/provider';
import type { DesignSpec } from '../../../ai/designSpec';
import { clearStagedSelection, facetsOf, stageSelection } from '../../../ai/preferences';
import { AI_CATEGORIES, aiCategoryForAssemblerId } from '../../../ai/spec/categories';
import { variantById } from '../../../templates/catalog';
import type { TemplateVariant } from '../../../model/wizard';
import { mergeSafety } from '../../../ai/safety';
import { assembleGroundedTemplate, productionSpxValidator } from '../../../ai/lite/pipeline';
import { benchStructuralIntent } from '../../../validation/structuralIntentCheck';
import { demoteSpecFields, withSpecChecks } from '../../../ai/spec/specValidate';
import { PRO_STANDARD_ROUTES } from '../../../ai/pro/contract';
import {
  generateProGraphic,
  type ProGenerateResult,
  type ProMark,
  type ProStage,
} from '../../../ai/pro/language/pipeline';
import { proRuleCodes, validateProLanguage } from '../../../ai/pro/language/gate';
import {
  composeGraphic,
  namedPackage,
  packageLines,
  PRO_GRAPHICS,
  PRO_PACKAGE_LIST,
  type ProGraphicId,
  type ProPackageMember,
} from '../../../ai/pro/language/graphics';
import { loadProStatus, openProSession, reportProOutcome } from '../../../ai/pro/session';
import { isBackendConfigured } from '../../../backend/config';
import type { ProStatusResponse } from '../../../ai/pro/types';
import {
  PRO_SUPPORTED_CATEGORIES,
  proBrandPalette,
  proLines,
  proMarkDescriptor,
  standardProLanguageBrief,
} from '../../../ai/pro/brief';
import { probeMark } from '../../../assets/assetInfo';
import {
  emptyGenerationSpec,
  loadSpecDraft,
  saveSpecDraft,
  specIsEmpty,
  type AiCategoryId,
  type GenerationSpec,
} from '../../../model/generationSpec';
import { useAuthState } from '../../auth/useAuthState';
import SignInPrompt from '../../auth/SignInPrompt';
import AiProviderSettings from '../../AiProviderSettings';
import AgentRouteCard from './ai/AgentRouteCard';
import { fileToDataUrl, uniqueAssetPath } from '../../../assets/assetUtils';
import { extractBrandColors, paletteFromAccent, type BrandColor } from '../../../assets/paletteExtract';
import {
  importTemplateFile,
  isTemplateFile,
  type AuthoredFormatDetection,
} from '../../../model/importTemplate';
import { loadLooks } from '../../../model/packets';
import {
  guessPurpose,
  isReferencePurpose,
  splitByPurpose,
  type PurposedImage,
} from '../../../model/imagePurpose';
import { UploadCard } from './ai/UploadCard';
import type { AssetFile, SpxTemplate } from '../../../model/types';
import {
  resolutionForSelection,
  type ProjectFormatSelection,
} from '../../../model/projectFormat';
import type { AiThread, AiThreadMessage } from '../../../model/aiThread';
import type { Palette } from '../../../model/wizard';
import { validateTemplate, type ValidationResult } from '../../../validation/validateTemplate';
import { readinessRows, unclaimedFindings } from '../../../validation/readiness';
import { formatDuration, formatTokens, hasTokenCounts, lastRun, runCost, runExpectation, type RunCost } from '../../../ai/runStats';
import MiniPreview from '../MiniPreview';
import SectionHead from '../SectionHead';
import ProjectFormatPicker from '../../ProjectFormatPicker';
import ViewingControls from '../ViewingControls';
import { resolveLegibility, type ProjectLegibility, type ResolvedLegibility } from '../../../model/designRules';
import MoreControlPanel from './ai/MoreControlPanel';
import { GenerationRating } from '../../feedback/GenerationRating';
import { LITE_AI_CATEGORIES } from '../../../ai/lite/contract';
import { LiteUnsupportedError, loadLiteStatus, recordLiteOutcome } from '../../../ai/lite/client';
import type { LiteStatusResponse } from '../../../ai/lite/types';

interface Props {
  format: ProjectFormatSelection;
  onFormat: (format: ProjectFormatSelection) => void;
  /** The project's legibility settings (viewing target + the two size-floor toggles,
   *  model/designRules.ts) — project metadata the wizard persists with the creation. Every
   *  generation resolves them into the request's context. */
  legibility: ProjectLegibility;
  onLegibility: (legibility: ProjectLegibility) => void;
  /** Brand colors to honor (when "Use current project's colors & typeface" is on and a brand exists). */
  brandPalette: Palette | null;
  /** The current AI result shown in the live preview (null until the first generation). */
  result: SpxTemplate | null;
  /** `spec` is the structured setup the result was generated under (null = prompt-only) —
   *  the wizard saves it with the created project. `path` is the pipeline provenance (the
   *  wizard's activation event distinguishes a Pro-tier create from a standard one). */
  onResult: (
    template: SpxTemplate | null,
    valid: boolean,
    spec?: GenerationSpec | null,
    generationId?: string,
    path?: AiPath | null,
    /**
     * The whole PACKAGE this result belongs to, LEADING with `template` (§15.9) - a Pro
     * generation renders one design language as every graphic type the user asked for, from the
     * one paid call. Null on every other path and on a package of one, so "is this a set?" is
     * answered by the presence of a second member rather than by the tier.
     */
    pack?: SpxTemplate[] | null,
  ) => void;
  /** The conversation as it stands (talk turns only), reported on every change so the created
   *  project can carry the reasoning that produced it (persisted as GraphicDoc.aiThread). Fires
   *  independently of onResult so talk added AFTER the last result, before Create, is caught. */
  onThread: (thread: AiThread | null) => void;
  /** Byte-faithful open of a dropped .html/.zip template — no AI, applies and closes. */
  onOpenImported: (template: SpxTemplate) => void;
  /** Continue into the catalog flow designing AROUND the dropped images (no AI needed). */
  onUseTemplates: (images: AssetFile[]) => void;
}

/** How each harness route is presented on the result card. */
function routeLabel(path: AiPath | null): string | null {
  switch (path) {
    case 'grounded':
      return '▤ Adapted from a proven catalog design — editable everywhere, exactly like wizard output.';
    case 'grounded+polish':
      return '▤ A proven catalog design, adapted, plus a bounded custom flourish.';
    case 'grounded+skin':
      return '▤ Deterministic canvas structure with an AI-designed look.';
    case 'custom':
      return '✦ Custom build — exercised end to end in the live playout bench.';
    case 'pro':
      return '✧ Art-directed design, delivered as ordinary editable layers.';
    default:
      return null;
  }
}

/** The same route, as one glyph for a picker card. */
const routeMark = (path: AiPath | undefined): string =>
  path === 'custom' ? '✦' : path === 'pro' ? '✧' : '▤';

/**
 * WHICH proven design this result was adapted from - the honest half of the promise
 * (docs/ADAPT_FIRST_PLAN.md §3, Stage U). A result that says only "built on the catalog"
 * cannot be checked; naming the design lets the user open that design in Browse and see for
 * themselves what changed. Null on a free-form or Pro result, which started from no design.
 */
/**
 * The paths whose template really IS `spec.variantId` assembled. 'stub' is the offline
 * provider's own grounded assembly, so it earns the same treatment. Deliberately NOT
 * 'grounded+skin': that path assembles the neutral canvas chassis (`ltc01`) while carrying the
 * house spec, so naming the spec's design would credit a design the user is not looking at.
 * 'custom', 'raw' and 'pro' started from no catalog design at all.
 */
const ADAPTED_PATHS: AiPath[] = ['grounded', 'grounded+polish', 'stub'];
const isAdapted = (change: AiTemplateChange | undefined): boolean =>
  Boolean(change?.path && ADAPTED_PATHS.includes(change.path));

function adaptedFrom(change: AiTemplateChange | undefined): string | null {
  if (!isAdapted(change)) return null;
  const variant = change?.spec?.variantId ? variantById(change.spec.variantId) : undefined;
  return variant ? `Adapted from “${variant.name}” — a ${variant.styleTag} ${variant.category.replace(/-/g, ' ')}.` : null;
}

/** The retrieved designs behind a result, resolved to real variants. A catalog id that no
 *  longer resolves is dropped rather than rendered as a dead card.
 *
 *  Gated on the ADAPTED paths, not merely on a shortlist being present: retrieval runs before
 *  the design stage decides, so a free-form alternative under auto->adapt legitimately carries
 *  the shortlist it was chosen against. Offering the swap there would replace the model's own
 *  code with a catalog assembly while the card still read "custom-generated code". */
function shortlistOf(change: AiTemplateChange | undefined): TemplateVariant[] {
  if (!isAdapted(change) || !change?.shortlist?.length || !change.spec) return [];
  return change.shortlist.map((id) => variantById(id)).filter((v): v is TemplateVariant => Boolean(v));
}

/** The Pro pipeline's stage names, in the busy line's voice (docs/NOACG_PRO_PLAN.md §15). */
const PRO_STAGE_LABELS: Record<ProStage, string> = {
  design: 'Designing the on-air look…',
  compose: 'Building the graphic in it…',
  validate: 'Validating and testing playout…',
};

/**
 * The execution tiers as the settings panel offers them.
 *
 * A tier describes an OUTCOME, never the machinery that produces it: the managed tiers name no
 * vendor, no model and no transport, so replacing the engine behind one costs no copy and
 * misleads nobody in the meantime (owner, 2026-08-14). Only the bring-your-own-key tier names
 * vendors, because there the vendor IS the decision the user is making.
 *
 * `custom` keeps its stored id - see AI_TIERS in src/ai/settings.ts.
 */
const TIER_OPTIONS: { id: AiTier; name: string; hint: string }[] = [
  { id: 'lite', name: 'NoaCG Lite', hint: 'Included free — one excellent editable graphic per request, nothing to configure.' },
  // Pro's hint says nothing about whose key pays because the answer is never the user's: a
  // NoaCG tier runs on NoaCG's own service or it is not offered at all. It names the PACKAGE
  // (§15.9) because that is the tier's stated promise and the thing Lite structurally cannot
  // do - and it names an OUTCOME, never a mechanism, so replacing the engine costs no copy.
  {
    id: 'pro',
    name: 'NoaCG Pro',
    hint: 'An on-air look designed for your channel — and every graphic below built in it, '
      + 'so they belong together. Nothing to configure.',
  },
  {
    id: 'custom',
    name: 'Bring your own key',
    // The last clause is the steer at the KEY MOMENT itself: the full case for the agent route
    // sits at the top of the step (AgentRouteCard), and the sheet's pointer is right above this
    // picker, so here one sentence is enough. Loud where the decision is made, quiet where the
    // key is typed - an interstitial in front of the field would be the brush-off the receipt
    // warns against.
    // "Account" rather than "key": Hugging Face issues tokens, not keys (credentialNoun), and
    // the field below this picker is labelled with each provider's own word.
    hint: 'Run it on your own account with OpenAI, Anthropic, Google or Hugging Face: any model that provider offers, at that provider’s prices. If you have Claude Code or Codex, you do not need this.',
  },
];

/**
 * ONE transcript for the whole step: what the user said, what the AI said back, and every
 * set of directions it produced. `past` turns are earlier generations — they stay restorable,
 * so exploring a second idea never costs you the first one.
 */
type TalkTurn = { kind: 'you'; text: string; attached: number } | { kind: 'ai'; text: string };
type PastTurn = {
  kind: 'past';
  changes: AiTemplateChange[];
  originals: AiTemplateChange[];
  selected: number;
};
type Turn = TalkTurn | PastTurn;

/**
 * How many talk turns travel with a request. The whole conversation is the brief, but an
 * unbounded transcript would grow the design-stage prompt without bound — and the last
 * exchanges are where the decisions actually live.
 */
const CONVERSATION_TURNS = 10;

/**
 * The example briefs this step offers, by tier.
 *
 * ALL THREE BANKS LIVE IN `src/ai/examplePrompts.ts`, and this step only chooses between them.
 * A local copy of Lite's used to live here and it is exactly what that arrangement costs: the
 * banks were rewritten to each tier's stated promise and VERIFIED BY GENERATING THEM
 * (src/ai/AGENTS.md, 2026-08-15), and Lite's improved set reached nobody, because the step was
 * still reading its own stale array. A brief that reads well and renders as something else is
 * the defect those rules exist to stop; a brief nothing renders at all is worse.
 */
function briefsForTier(lite: boolean, pro: boolean) {
  if (pro) return PRO_EXAMPLE_PROMPTS;
  if (lite) return LITE_EXAMPLE_PROMPTS;
  return EXAMPLE_PROMPTS;
}

/**
 * The design decisions behind one direction, in the user's words. The whole point of the
 * three alternatives is that they differ in REAL decisions (composition, density, weight,
 * shape) — a card that showed only a name would hide exactly what the choice is about.
 *
 * Returned as separate terms, not one joined string: a term must wrap as a WHOLE. Joined,
 * a narrow card broke "center-aligned" across two lines at its own hyphen.
 */
function designWords(alt: AiTemplateChange): string[] {
  const spec = alt.spec;
  if (!spec) return [];
  return [
    spec.density,
    spec.typography?.headingWeight,
    spec.alignment ? `${spec.alignment}-aligned` : null,
    spec.shape?.panel && spec.shape.panel !== 'none' ? `${spec.shape.panel} panel` : null,
  ].filter((w): w is string => Boolean(w));
}

/**
 * Step 1 (Create-with-AI mode) — the merged create/import step: describe what you need,
 * drop in a logo, brand stills, or an existing .html / SPX template to convert. Every AI
 * result runs the full harness (validation + the live runtime bench); the no-AI import
 * ("Open as code") stays one click away and never gates on sign-in.
 */
export default function AiStep({
  format,
  onFormat,
  legibility,
  onLegibility,
  brandPalette,
  result,
  onResult,
  onThread,
  onOpenImported,
  onUseTemplates,
}: Props) {
  const resolution = resolutionForSelection(format);
  const fps = format.fps;
  const { needsSignIn } = useAuthState();
  // undefined = still resolving; null = no Lite on this server (offline builds, errors).
  const [liteStatus, setLiteStatus] = useState<LiteStatusResponse | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void loadLiteStatus()
      .then((status) => {
        if (alive) setLiteStatus(status);
      })
      .catch(() => {
        if (alive) setLiteStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [needsSignIn]);
  // undefined = still resolving; null = no hosted Pro on this server.
  const [proStatus, setProStatus] = useState<ProStatusResponse | null | undefined>(undefined);
  /**
   * WHICH GRAPHICS THIS PRO GENERATION MAKES (§15.9). Persisted like every other AI preference,
   * normalized by `loadAiSettings` so it is always in package order and never empty.
   *
   * The FIRST member is the primary: the graphic the live preview shows, the one a refinement
   * would act on, and the one the wizard treats as the project when the package is a set of one.
   */
  const [proPackage, setProPackage] = useState<ProGraphicId[]>(() => loadAiSettings().proPackage);
  const primaryGraphic = proPackage[0] ?? 'lower-third';
  /** Members the platform's own gate refused, named so a short package is never a silent one. */
  const [proDropped, setProDropped] = useState<string[]>([]);
  useEffect(() => {
    let alive = true;
    void loadProStatus()
      .then((status) => {
        if (alive) setProStatus(status);
      })
      .catch(() => {
        if (alive) setProStatus(null);
      });
    return () => {
      alive = false;
    };
  }, [needsSignIn]);
  const [settings, setSettings] = useState(loadAiSettings);
  // THE EXECUTION TIER. Lite and Pro are managed experiences of the SAME creation workflow;
  // 'custom' is the bring-your-own-key surface. The saved preference wins where it is
  // honourable: a saved tier this build does not offer falls back rather than failing, and no
  // saved choice resolves to Lite when the server offers it (the historical default) else BYO
  // key. A tier that is merely OFF is never listed as unavailable either - see the render.
  const liteOffered = Boolean(liteStatus?.enabled);
  // HOSTED PRO IS THE ONLY PRO (owner, 2026-08-14). A NoaCG tier runs on NoaCG's own service or
  // it is not offered - it never asks a customer for a key to reach our own models. So the tier
  // appears on exactly two conditions, both of which have to be true at once: the SERVER says
  // hosted Pro is available to this visitor (`AI_PRO_ENABLED` plus their entitlement and
  // allowance), and this deployment actually carries the backend that route is metered through.
  // The second is not belt-and-braces: hosted Pro reserves and settles per account, so a build
  // with no backend cannot run it however the status answers.
  const proHosted = Boolean(proStatus?.available);
  const proOffered = proHosted && isBackendConfigured();
  const fallbackTier: AiTier = liteOffered ? 'lite' : 'custom';
  const tier: AiTier =
    settings.tier === 'lite'
      ? liteOffered ? 'lite' : fallbackTier
      : settings.tier === 'pro'
        ? proOffered ? 'pro' : fallbackTier
        : settings.tier ?? fallbackTier;
  const liteMode = tier === 'lite';
  const proMode = tier === 'pro';
  const liteActive = liteMode && Boolean(liteStatus?.available);
  const tierOptions = TIER_OPTIONS.filter((option) => option.id !== 'pro' || proOffered);

  // THE BYO-KEY TIER RUNS ON A KEY THE USER OWNS. The saved route can point at the managed
  // transport (it is the harness default, and every bench sets it), which would spend NoaCG's
  // own credential under a tier whose whole promise is the opposite - so entering this tier
  // moves the route onto a real bring-your-own-key provider. Saving also re-picks that
  // provider's default model (saveAiSettings), so no gateway model id is left behind in the box.
  useEffect(() => {
    if (tier !== 'custom' || isByokProvider(settings.provider)) return;
    // A provider this visitor already has a key for beats the bare default: they configured it
    // for exactly this.
    const configured = settings.configuredProviders.find(isByokProvider);
    saveAiSettings({ provider: configured ?? DEFAULT_BYOK_PROVIDER });
    setSettings(loadAiSettings());
  }, [tier, settings.provider, settings.configuredProviders]);

  /* The one-line read-back beside the ⚙ button (re-design/handoff.md §3a): which tier is
     running and, on the tier where models are the user's own, what it will call. A managed
     tier deliberately names no model — that is the point of it. */
  const settingsSummary =
    tier === 'lite' ? 'NoaCG Lite · included'
    : tier === 'pro' ? 'NoaCG Pro · included'
    : [
        AI_PROVIDERS.find((provider) => provider.id === settings.provider)?.label ?? settings.provider,
        settings.model,
      ].filter(Boolean).join(' · ');
  const aiReady = liteMode ? liteActive : proMode ? true : aiConfigured(settings);
  // Opens itself ONCE, after the tier is known: a custom-tier visitor with no provider
  // configured needs the setup in front of them, a Lite visitor does not.
  const [showSettings, setShowSettings] = useState(false);
  const settingsAutoOpened = useRef(false);
  // THE AGENT ROUTE (steps/ai/AgentRouteCard.tsx): the user's own coding agent is the PREFERRED
  // way to make graphics with NoaCG, said at the top of the step before any tier and any key.
  // The card is one line until asked; it opens by itself on exactly the condition below, where
  // the key field is about to be on screen, and the settings sheet's pointer opens it too.
  const [agentRouteOpen, setAgentRouteOpen] = useState(false);
  const agentRouteRef = useRef<HTMLDivElement>(null);
  // A reveal is a nonce, not a boolean, so a second "Show me" on an already-open card still
  // scrolls - and the scroll runs in an effect AFTER the body has rendered, aligned to the
  // card's top, so the commands land in view rather than the one-line card being centred and
  // the body it exists to show cut off below the fold.
  const [agentRouteReveal, setAgentRouteReveal] = useState(0);
  const revealAgentRoute = () => {
    setAgentRouteOpen(true);
    setAgentRouteReveal((n) => n + 1);
  };
  useEffect(() => {
    if (agentRouteReveal > 0) agentRouteRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [agentRouteReveal]);

  useEffect(() => {
    if (liteStatus === undefined || settingsAutoOpened.current) return;
    settingsAutoOpened.current = true;
    if (!liteStatus?.enabled && loadAiSettings().tier !== 'pro' && !aiConfigured()) {
      setShowSettings(true);
      setAgentRouteOpen(true);
    }
  }, [liteStatus]);
  const [prompt, setPrompt] = useState('');
  // ONE list of uploads, each carrying what it is FOR (model/imagePurpose.ts). The step used
  // to keep two: everything dropped here became a bundled asset, and the only way to say
  // "this is a reference" was a second uploader buried in the More-control accordion. Two
  // uploaders for one gesture is what made the whole thing feel narrow.
  const [uploads, setUploads] = useState<PurposedImage[]>([]);
  const { assets: images, references, fixedPaths } = useMemo(() => splitByPurpose(uploads), [uploads]);
  // The structured setup ("More control"): persisted as a cross-session draft so closing
  // the wizard never loses it; an empty spec injects nothing anywhere.
  const [spec, setSpec] = useState<GenerationSpec>(() => loadSpecDraft() ?? emptyGenerationSpec());
  const [moreOpen, setMoreOpen] = useState(() => !specIsEmpty(loadSpecDraft()));
  useEffect(() => saveSpecDraft(spec), [spec]);
  useEffect(() => {
    if (!liteMode) return;
    if (spec.category !== 'auto' && !LITE_AI_CATEGORIES.some((category) => category === spec.category)) {
      setSpec((current) => ({ ...current, category: 'auto', categoryInferred: false }));
    }
    // Lite takes no reference material at all, so a purpose it cannot honour is dropped
    // rather than silently ignored.
    setUploads((current) =>
      current.some((u) => isReferencePurpose(u.purpose))
        ? current.filter((u) => !isReferencePurpose(u.purpose))
        : current,
    );
  }, [liteMode, spec.category]);
  // The Pro tier's v1 pipeline compiles lower thirds only - a category it cannot carry
  // resets to 'auto' (the Lite pattern) rather than being silently reinterpreted.
  useEffect(() => {
    if (!proMode) return;
    if (spec.category !== 'auto' && !(PRO_SUPPORTED_CATEGORIES as readonly string[]).includes(spec.category)) {
      setSpec((current) => ({ ...current, category: 'auto', categoryInferred: false }));
    }
  }, [proMode, spec.category]);
  const activeSpec = specIsEmpty(spec) ? null : spec;
  const [imported, setImported] = useState<{
    fileName: string;
    template: SpxTemplate;
    detection: AuthoredFormatDetection;
    confirmed: boolean;
  } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  // Harness provenance for the result card + the spec that produced a grounded result
  // (passed back on refine so "warmer colours" re-assembles instead of editing code).
  const [lastPath, setLastPath] = useState<AiPath | null>(null);
  const [lastSpec, setLastSpec] = useState<DesignSpec | null>(null);
  // The Pro concept + editability report behind each pro-path template, keyed by the
  // template OBJECT so an archived then restored result still shows its own concept.
  const proDetails = useRef(new WeakMap<SpxTemplate, ProGenerateResult>());
  /**
   * THE REST OF THE PACKAGE, keyed by the graphic the step previews (§15.9).
   *
   * A WeakMap for the same reason `proDetails` is one: `turns` keeps earlier generations whole
   * and "↩ Bring back" restores them, so a package has to travel with ITS OWN result rather
   * than in a piece of state the next generation overwrites. The entry always LEADS with the
   * previewed graphic, so `pack[0] === result` and a consumer never has to merge two lists.
   */
  const proPack = useRef(new WeakMap<SpxTemplate, ProPackageMember[]>());
  // Harness mode: the generated directions (one, or the harness's three) + which one is
  // picked (the pick is staged as preference data and committed when the project is actually
  // created). The list SURVIVES a refinement — refining replaces only the picked entry, so
  // the other directions stay one click away instead of being lost to a wording change.
  const [alternatives, setAlternatives] = useState<AiTemplateChange[]>([]);
  // Each direction as it was FIRST generated: the restore point behind "↺ Undo refinements",
  // and the population a preference pick was actually chosen FROM.
  const [originals, setOriginals] = useState<AiTemplateChange[]>([]);
  const [selected, setSelected] = useState(0);
  // An example brief is armed before it replaces a brief the user already wrote (the
  // two-step pattern used for every other destructive click in the app).
  const [armedExample, setArmedExample] = useState<string | null>(null);
  // What the run that produced the current result actually cost. Read from telemetry after
  // each run rather than threaded back through the provider — the provider is UI-free.
  const [spent, setSpent] = useState<RunCost | null>(null);
  // BRAND. Colours read out of the uploaded artwork (deterministic, no model call) and the
  // looks already saved in this install — both PROPOSE, and land on `spec.brandColors`,
  // which is the existing lock the assembler already honours over anything the AI picks.
  const [extracted, setExtracted] = useState<BrandColor[]>([]);
  const looks = useMemo(() => loadLooks(), []);
  useEffect(() => {
    // The first upload of ANY purpose. Colour is the one thing every purpose can give: a
    // mood board exists to be read for its palette, and reading only the bundled assets meant
    // the picture chosen precisely for its colours was the one the brand strip ignored.
    const first = uploads[0]?.asset;
    if (!first || typeof first.data !== 'string') {
      setExtracted([]);
      return;
    }
    let alive = true;
    void extractBrandColors(first.data).then((colors) => {
      if (alive) setExtracted(colors);
    });
    return () => {
      alive = false;
    };
  }, [uploads]);
  const fileInput = useRef<HTMLInputElement>(null);
  // THE THREAD: talk and generations in one transcript. The brainstorm used to be a separate
  // panel producing a string the user copied into the prompt box — two chat-shaped surfaces
  // that could not see each other, neither of which the generator ever read.
  const [turns, setTurns] = useState<Turn[]>([]);
  const [chatBusy, setChatBusy] = useState(false);
  const [latestBrief, setLatestBrief] = useState<string | null>(null);

  /** What the model is told the conversation was: the talk turns, bounded, oldest first. */
  const conversation = (): ChatMessage[] =>
    turns
      .filter((t): t is TalkTurn => t.kind === 'you' || t.kind === 'ai')
      .slice(-CONVERSATION_TURNS)
      .map((t) => ({ role: t.kind === 'you' ? 'user' : 'assistant', text: t.text }));

  const say = (turn: Turn) => setTurns((prev) => [...prev, turn]);

  // Report the conversation up whenever it changes, so the created project carries it (persisted
  // as GraphicDoc.aiThread). Only the talk turns travel — the `past` generation snapshots are a
  // wizard-session affordance the editor cannot show, and would be heavy to persist (aiThread.ts).
  useEffect(() => {
    const messages: AiThreadMessage[] = turns
      .filter((t): t is TalkTurn => t.kind === 'you' || t.kind === 'ai')
      .map((t) => ({ role: t.kind === 'you' ? 'user' : 'assistant', text: t.text }));
    onThread(messages.length ? { version: 1, messages } : null);
  }, [turns, onThread]);

  /** Move the current result into the transcript before a new one takes its place. */
  const archiveCurrent = () => {
    if (!alternatives.length) return;
    const generationId = alternatives[selected]?.generationId;
    if (generationId) {
      void recordLiteOutcome({
        generationId,
        action: 'discarded',
        discardReason: 'regenerated',
      }).catch(() => undefined);
    }
    say({ kind: 'past', changes: alternatives, originals, selected });
  };

  const sendChat = async () => {
    const text = prompt.trim();
    if (!text || chatBusy || busy) return;
    const history: ChatMessage[] = [...conversation(), { role: 'user', text }];
    say({ kind: 'you', text, attached: 0 });
    setPrompt('');
    setChatBusy(true);
    setError(null);
    try {
      const { reply, brief } = await brainstorm(history);
      say({ kind: 'ai', text: reply });
      if (brief) setLatestBrief(brief);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setTurns((prev) => prev.slice(0, -1)); // the failed turn goes back into the box
      setPrompt(text);
    } finally {
      setChatBusy(false);
    }
  };

  const saveSetting = (patch: Parameters<typeof saveAiSettings>[0]) => {
    saveAiSettings(patch);
    setSettings(loadAiSettings());
  };

  // One drop zone, three inputs: images become generation assets, an .html/.zip becomes
  // an imported template (deterministic parse first — the AI only ever sees parsed code).
  const addFiles = async (files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const list = Array.from(files);
    const templateFile = list.find(isTemplateFile);
    if (templateFile) {
      try {
        const parsed = await importTemplateFile(templateFile);
        setImported({
          fileName: templateFile.name,
          template: parsed.template,
          detection: parsed.detection,
          confirmed: parsed.detection.certain,
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    }
    const next = [...uploads];
    const paths = () => next.map((u) => u.asset);
    for (const file of list) {
      if (!file.type.startsWith('image/')) continue;
      if (liteMode && (liteStatus?.limits.logos ?? 0) < 1) {
        setError('The lower-third quality release does not accept image uploads yet.');
        return;
      }
      if (liteMode && next.length >= (liteStatus?.limits.logos ?? 0)) {
        setError('NoaCG Lite accepts only the configured number of compatible logo uploads.');
        break;
      }
      if (liteMode && file.size > (liteStatus?.limits.logoBytes ?? 2_000_000)) {
        setError('The NoaCG Lite logo limit is 2 MB.');
        continue;
      }
      const asset = { path: uniqueAssetPath(file.name, paths()), data: await fileToDataUrl(file) };
      // The guess is a PRESELECT, not a decision: it is shown on the card and one click
      // changes it. Lite has only one legal purpose, so nothing is guessed there.
      const purpose = liteMode ? 'asset' : await guessPurpose(asset);
      next.push({ asset, purpose, ...(purpose === 'asset' ? { binding: 'swappable' as const } : {}) });
    }
    if (next.length !== uploads.length) setUploads(next);
  };

  // The harness's injected validation pipeline (static rules + the live runtime bench,
  // wrapped in the safety screen) comes from lite/pipeline.productionSpxValidator — the ONE
  // composition, shared with the Lite benchmark runners. The safety screen sits INSIDE the
  // injected validator on purpose: the bench executes the result the moment it lands, so a
  // finding has to reach the provider's repair loop rather than a review step the code has
  // already run past. `imported` is the source for a convert, so a template that already
  // called fetch() before the AI touched it is not reported as something the AI introduced.
  // The structured setup adds its own checks on top (requested fields present, fonts used).
  // Every "use it as it is" upload is protected: the as-is screen rides inside the injected
  // validator so a tinted or cropped mark reaches the repair loop, not just the result card.
  const safeValidate: SpxValidator = productionSpxValidator(
    imported?.template ?? null,
    images.map((a) => a.path),
  );
  const validate: SpxValidator = withSpecChecks(safeValidate, activeSpec) ?? safeValidate;

  const showChange = (change: AiTemplateChange) => {
    // Screened here as well as inside the injected validator, because `generateRaw` (the harness
    // OFF path) validates itself and never runs ours — this is the one place every path passes
    // through on its way to the user.
    const v = mergeSafety(change.validation ?? validateTemplate(change.template), change.template, imported?.template);
    setSummary(change.summary);
    setValidation(v);
    setLastPath(change.path ?? null);
    setLastSpec(change.spec ?? null);
    // The package rides the RESULT, read back out of the WeakMap the Pro run filled - so a
    // restored past generation hands the wizard its own set rather than the newest one's.
    onResult(
      change.template,
      v.ok,
      activeSpec,
      change.generationId,
      change.path ?? null,
      proPack.current.get(change.template)?.map((member) => member.template) ?? null,
    );
    return v;
  };

  /**
   * The actuals for the run that just finished, read off the telemetry ring the provider
   * already writes. Called after a RUN, never from showChange — picking a different
   * alternative costs nothing, and attributing the run's tokens to that click would be a
   * quiet lie about what the user just spent.
   */
  const recordSpend = () => {
    const record = lastRun();
    setSpent(record ? runCost(record) : null);
  };

  /**
   * Stage the current pick for preference learning.
   *
   * The CHOSEN facets are the direction as it stands NOW — a refinement is part of what the
   * user settled on, and clearing the stage on every refine meant the most engaged users
   * (pick a direction, improve it, create it) trained the model with nothing at all. The
   * SHOWN population stays the ORIGINALS, because that is the choice they actually faced.
   * A single result is not a choice, so it stages nothing: counting it would score every
   * facet as picked 100% of the times it was shown.
   */
  const stagePick = (chosen: AiTemplateChange, shown: AiTemplateChange[]) => {
    if (shown.length < 2) {
      clearStagedSelection();
      return;
    }
    stageSelection(
      facetsOf(chosen.spec, chosen.path),
      shown.map((alt) => facetsOf(alt.spec, alt.path)),
    );
  };

  /** A whole-result run (convert / raw generate): one direction, replacing whatever stood. */
  const run = async (fn: (options: GenerateOptions) => Promise<AiTemplateChange>, label: string) => {
    setBusy(label);
    setError(null);
    try {
      const change = await fn({
        validate,
        // The structural-satisfaction check (docs/CREATIVE_MODE_PLAN.md §8): browser-only,
        // so it is injected like the bench; the provider runs it on CREATE-routed results.
        structuralCheck: benchStructuralIntent,
        onProgress: (stage) => setBusy(stage),
        ...(liteActive ? { profile: 'lite' as const } : {}),
      });
      setAlternatives([change]);
      setOriginals([change]);
      setSelected(0);
      clearStagedSelection();
      showChange(change);
      recordSpend();
    } catch (e) {
      setError(
        e instanceof LiteUnsupportedError && e.suggestedBrief
          ? `${e.message} Try: ${e.suggestedBrief}`
          : e instanceof Error
            ? e.message
            : String(e),
      );
    } finally {
      setBusy(null);
    }
  };

  /** Show direction `i` in the preview + stage the pick as preference data. */
  const selectAlternative = (i: number) => {
    setSelected(i);
    showChange(alternatives[i]);
    stagePick(alternatives[i], originals);
  };

  /**
   * Re-assemble the selected direction on a DIFFERENT design from the shortlist it was chosen
   * from — deterministically, with no model call and no cost. Everything the design stage
   * decided (lines, palette, typography, density, motion, shape) is in the spec and applies to
   * the new chassis exactly as it did to the old one; only the proven design underneath swaps.
   *
   * That is what makes the promise checkable rather than a slogan: the user sees the designs
   * the AI chose between and can overrule the choice without paying for another generation.
   *
   * No structural KIND check is needed here, unlike a generation: every design on the shortlist
   * satisfies the anchor the brief resolved to, by construction (src/ai/retrieval.ts), so a
   * swap inside it cannot produce the wrong kind of graphic.
   */
  const rebuildOnChassis = async (variantId: string) => {
    const current = alternatives[selected];
    if (!current?.spec || current.spec.variantId === variantId) return;
    setBusy('Rebuilding on that design…');
    try {
      const spec: DesignSpec = { ...current.spec, variantId };
      const { template } = assembleGroundedTemplate(spec, contextFor(), { keepChassisZone: true });
      const change: AiTemplateChange = {
        ...current,
        template,
        spec,
        // A plain grounded assembly is what this now IS. Spreading `current` would carry a
        // 'grounded+polish' path onto a template the polish pass never touched, so the card
        // would keep promising "plus a bounded custom flourish" for a flourish that is gone.
        path: 'grounded',
        validation: demoteSpecFields(await validate(template)),
      };
      setAlternatives(alternatives.map((alt, i) => (i === selected ? change : alt)));
      showChange(change);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  // Exact brand colours from the setup win over the project-brand toggle; the setup's
  // uploaded primary font rides as the wizard-style custom font.
  const specPalette: Palette | null = spec.brandColors
    ? { id: 'ai-user-brand', name: 'Brand colors', styleTags: ['noacg'], ...spec.brandColors }
    : null;
  /** `seed` = "three more like this": the direction whose spirit the new ones should keep. */
  const contextFor = (seed?: DesignSpec): GenerateContext => {
    // An existing imported template is the exception to new-project format selection.
    // Once its format is detected or explicitly confirmed, conversion and later refinement
    // stay pinned to that authored canvas instead of silently adopting the picker defaults.
    const authoredResolution = imported?.confirmed ? imported.template.resolution : resolution;
    const authoredFps = imported?.confirmed ? imported.template.fps : fps;
    return {
      images: liteActive ? images.slice(0, 1) : images,
      references: !liteActive && references.length ? references : undefined,
      ...(fixedPaths.length && !liteActive ? { fixedAssetPaths: fixedPaths } : {}),
      palette: specPalette ?? brandPalette,
      customFont: spec.fonts?.primary?.customFont,
      spec: activeSpec,
      conversation: turns.length ? conversation() : undefined,
      ...(seed ? { seed } : {}),
      // The project's legibility settings, resolved: the provider renders them as the
      // design-rules block on the user message (model/designRules.ts, one module zero drift).
      legibility: resolveLegibility(legibility),
      resolution: authoredResolution,
      fps: authoredFps,
    };
  };

  /** The brief a Generate press acts on: what is typed, else what the talk arrived at. */
  const briefNow = (): string => prompt.trim() || latestBrief || '';

  /** What the LAST generation's context carried, stamped on the result card
   *  (`data-legibility`) so a spec can pin that the wizard's toggles reach the request
   *  without spending a token — the offline stub receives the identical context. */
  const [lastLegibility, setLastLegibility] = useState<string | null>(null);
  const legibilityStamp = (l: ResolvedLegibility): string =>
    `${l.floorsBlocking ? l.mode : 'relaxed'}:${l.target.profile}`;

  /** Take a colour as the brand accent; the rest of the system follows the house neutrals. */
  const applyAccent = (hex: string) => setSpec({ ...spec, brandColors: paletteFromAccent(hex) });

  /** Apply a saved look: its exact palette, and its font when it carries one. */
  const applySavedLook = (id: string) => {
    const look = looks.find((l) => l.id === id);
    if (!look) return;
    const p = look.brand.palette;
    const font = look.brand.customFont
      ? { customFont: look.brand.customFont }
      : look.brand.fontId
        ? { fontId: look.brand.fontId }
        : null;
    setSpec({
      ...spec,
      brandColors: { accent: p.accent, text: p.text, textDim: p.textDim, panel: p.panel },
      ...(font ? { fonts: { ...spec.fonts, primary: { ...spec.fonts?.primary, ...font } } } : {}),
    });
  };

  const generate = async (seed?: DesignSpec) => {
    const brief = briefNow();
    // ARCHIVE FIRST, then record the request. The transcript is chronological: the result
    // standing now happened BEFORE the thing that replaces it, and appending the new turn
    // first put the request above the result it superseded.
    archiveCurrent();
    // Say what was asked for even when the box was empty and the brief came out of the
    // talk — otherwise a generation leaves no trace of what it was asked to make.
    const asked = prompt.trim() || (seed ? 'More directions like the one I picked.' : brief);
    if (asked) say({ kind: 'you', text: asked, attached: uploads.length });
    setPrompt('');
    setArmedExample(null);
    const context = contextFor(seed);
    setLastLegibility(context.legibility ? legibilityStamp(context.legibility) : null);
    // Conversion always runs the validated conversion flow; plain generation branches on
    // the harness switch: OFF = the default one-shot (statically validated, no repair
    // loop), ON = three harness alternatives with the live bench injected.
    if (imported) {
      if (!imported.confirmed) {
        setError('Confirm the imported template project format before opening or converting it.');
        return;
      }
      if (liteActive) {
        setError('NoaCG Lite does not convert imported templates. Open it as code, or remove it and describe one new lower third.');
        return;
      }
      if (proMode) {
        setError('NoaCG Pro designs a new look and its package of graphics; it does not convert imported templates. Open it as code, or switch the AI tier to “Bring your own key” to convert it.');
        return;
      }
      void run(
        (options) => getAiProvider().convertImport(brief, imported.template, context, options),
        'Converting your template…',
      );
      return;
    }
    if (proMode) {
      // THE PRO TIER: the same brief, mapped deterministically onto the DESIGN-LANGUAGE call
      // (src/ai/pro/brief.ts) and run on the standard route - a normal Pro user never picks
      // models. The model decides the look; the platform composes the graphic through the
      // catalog's own assembler (docs/NOACG_PRO_PLAN.md §15, §16).
      // Spec-field findings demote to warnings: Pro is a fixed lower-third contract with no
      // repair loop, the grounded-assembly rule (src/ai/spec/specValidate.ts).
      const proValidate: SpxValidator = async (t) => demoteSpecFields(await validate(t));
      void run(async (options) => {
        // THE USER'S OWN MARK, measured before anything is sent. Two unrelated things read the
        // probe and both need it before the model answers: the brief describes the ink in
        // content-free words, and the composer decides afterwards whether that ink can read on
        // the panel the language chose (`markFieldFor`). The pixels never leave the machine.
        const asIs = uploads.find((upload) => upload.purpose === 'asset') ?? null;
        const probe = asIs ? await probeMark(asIs.asset) : null;
        const mark: ProMark | null = asIs
          ? {
            assetPath: asIs.asset.path,
            images: [asIs.asset],
            ...(probe
              ? {
                inkLuminance: probe.inkLuminance,
                inkSpread: probe.inkSpread,
                backing: probe.backing === 'own-field' ? 'own-field' as const : 'transparent' as const,
              }
              : {}),
          }
          : null;
        // HOSTED PRO opens a reservation first: one allowance slot, one cost ceiling, covering
        // every model call the generation makes. There is no second path any more - the tier is
        // only offered where this reservation can be made (see `proOffered`), which is what
        // makes "no key to supply" true rather than merely written.
        const session = await openProSession();
        let designed: ProGenerateResult;
        try {
          designed = await generateProGraphic(
            {
              language: standardProLanguageBrief(brief, activeSpec, probe ? proMarkDescriptor(probe) : null),
              // The PRIMARY graphic - the one previewed and refined. Every other member of the
              // package is composed from the same language below, for no extra call.
              graphic: primaryGraphic,
              lines: primaryGraphic === 'lower-third'
                ? proLines(activeSpec)
                : packageLines(primaryGraphic, {
                  name: proLines(activeSpec)[0]?.sample ?? '',
                  title: proLines(activeSpec)[1]?.sample ?? '',
                  channel: null,
                }),
              mark,
              // The customer's stated colours are the PLATFORM's to apply, never the model's to
              // return - the rule Lite has carried since 2026-08-13 (src/ai/pro/brief.ts).
              brandPalette: proBrandPalette(activeSpec),
              resolution,
              fps,
            },
            PRO_STANDARD_ROUTES.language,
            {
              session,
              validate: proValidate,
              onStage: (stage: ProStage) => options.onProgress?.(PRO_STAGE_LABELS[stage]),
            },
          );
        } catch (error) {
          // The spend is already recorded server-side; what the ledger cannot see from there
          // is that the generation produced nothing usable. Report it and re-throw so the
          // user still sees the failure.
          await reportProOutcome(session, 'failed', { reason: 'generation_failed' });
          throw error;
        }
        proDetails.current.set(designed.template, designed);

        // ── THE REST OF THE PACKAGE (docs/NOACG_PRO_PLAN.md §15.9) ──────────────────────────
        //
        // The model call above is the ONLY paid step. Every other graphic in the package is
        // composed from the SAME design language, deterministically and for zero tokens, which
        // is why the default is the whole set: a package costs what one graphic costs.
        //
        // Each member goes through the SAME gate the primary did (`validateProLanguage`, the one
        // seam) rather than being trusted because the composer wrote it. Nothing the model
        // returns can make the code invalid, so a member that fails IS a platform bug - and the
        // honest answer is to drop that member and say so, never to fail the generation the user
        // already paid for or to ship a graphic no gate passed.
        const members: ProPackageMember[] = [{ id: primaryGraphic, template: designed.template }];
        const dropped: string[] = [];
        for (const spec of PRO_PACKAGE_LIST) {
          if (spec.id === primaryGraphic || !proPackage.includes(spec.id)) continue;
          const lines = packageLines(spec.id, {
            name: proLines(activeSpec)[0]?.sample ?? '',
            title: proLines(activeSpec)[1]?.sample ?? '',
            // The channel's name is not a fact this step holds - the brief is prose and parsing
            // it is exactly the guessing this tier removed - so the bug keeps its own default
            // caption, which is an ordinary operator field the user can type over.
            channel: null,
          });
          const composed = composeGraphic(spec.id, designed.language, {
            lines,
            ...(spec.takesMark && mark ? { logo: mark } : {}),
            ...(proBrandPalette(activeSpec) ? { brandPalette: proBrandPalette(activeSpec) } : {}),
            resolution,
            fps,
          });
          const memberVerdict = await validateProLanguage(composed, designed.fallbacks, proValidate);
          if (memberVerdict && !memberVerdict.ok) {
            dropped.push(spec.label);
            continue;
          }
          members.push({ id: spec.id, template: composed.template });
        }
        // NAMED FOR WHAT EACH ONE IS (`namedPackage`, graphics.ts). The rule lives there rather
        // than here because it is only testable where it can be REACHED: the Pro door exists on
        // a configured deployment and nowhere else, so a rule buried in this component would be
        // pinned by a suite CI never runs.
        proPack.current.set(designed.template, namedPackage(members, designed.language.name));
        setProDropped(dropped);
        // THE LEDGER GETS THE WARNINGS TOO (`proRuleCodes`, src/ai/pro/language/gate.ts). Sending
        // errors alone is the §16 hole from the other side: a graphic the platform quietly
        // repaired wrote an EMPTY `validation_rule_codes` beside a `usable` status, so no row
        // could tell a clean generation from a rescued one.
        await reportProOutcome(
          session,
          designed.validation && !designed.validation.ok ? 'failed' : 'usable',
          {
            ...(designed.validation && !designed.validation.ok ? { reason: 'platform_validation' } : {}),
            ruleCodes: proRuleCodes(designed.validation),
          },
        );
        const change: AiTemplateChange = {
          template: designed.template,
          summary: `${designed.language.name}: ${designed.language.rationale}`,
          path: 'pro',
          ...(designed.validation ? { validation: designed.validation } : {}),
        };
        return change;
      }, PRO_STAGE_LABELS.design).then(() => {
        if (proHosted) void loadProStatus().then(setProStatus).catch(() => undefined);
      });
      return;
    }
    if (liteActive) {
      void run(
        (options) => getAiProvider('lite').generate(brief, context, options),
        'Creating one NoaCG Lite graphic…',
      ).then(() => {
        void loadLiteStatus().then(setLiteStatus).catch(() => undefined);
      });
      return;
    }
    if (!settings.useHarness) {
      void run(
        (options) => getAiProvider().generateRaw(brief, context, { onProgress: options.onProgress }),
        'Generating…',
      );
      return;
    }
    void (async () => {
      setBusy(seed ? 'Designing three more in that spirit…' : 'Designing three directions…');
      setError(null);
      try {
        const list = await getAiProvider().generateAlternatives(brief, context, {
          validate,
          structuralCheck: benchStructuralIntent,
          onProgress: (stage) => setBusy(stage),
        });
        if (!list.length) return;
        setAlternatives(list);
        setOriginals(list);
        // Start on the first option that passes; the pick is the user's to change.
        const first = Math.max(0, list.findIndex((alt) => alt.validation?.ok ?? false));
        setSelected(first);
        showChange(list[first]);
        stagePick(list[first], list);
        recordSpend();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    })();
  };

  /** Bring an earlier generation back as the current result; the displaced one is kept. */
  const restore = (index: number) => {
    const turn = turns[index];
    if (turn?.kind !== 'past' || busy) return;
    archiveCurrent();
    setTurns((prev) => prev.filter((_, i) => i !== index));
    setAlternatives(turn.changes);
    setOriginals(turn.originals);
    setSelected(turn.selected);
    showChange(turn.changes[turn.selected]);
    stagePick(turn.changes[turn.selected], turn.originals);
  };

  /**
   * One refinement turn on the PICKED direction. It replaces that entry in place — the other
   * directions keep their own designs and stay pickable — and re-stages the pick, so
   * improving a direction before creating it still trains the preference data.
   *
   * `useSpec` chooses the level: a wording refinement of a still-house-shaped result refines
   * at SPEC level (it re-assembles deterministically, src/ai/CLAUDE.md), while a fix works on
   * the emitted CODE, because that is what the findings are about.
   */
  const applyRefinement = (instruction: string, useSpec: boolean, label: string) => {
    if (!result) return;
    void (async () => {
      setBusy(label);
      setError(null);
      try {
        const change = await getAiProvider(liteActive ? 'lite' : undefined).modify(instruction, result, contextFor(), {
          validate,
          onProgress: (stage) => setBusy(stage),
          ...(liteActive ? { profile: 'lite' as const } : {}),
          ...(useSpec && lastSpec ? { spec: lastSpec } : {}),
        });
        setAlternatives(alternatives.map((alt, i) => (i === selected ? change : alt)));
        showChange(change);
        stagePick(change, originals);
        recordSpend();
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(null);
      }
    })();
  };

  const refineNow = () => {
    const p = prompt.trim();
    if (!p) return;
    say({ kind: 'you', text: p, attached: uploads.length });
    setPrompt('');
    setArmedExample(null);
    applyRefinement(p, true, 'Refining…');
  };

  /**
   * User-pressed repair on a failing result: the exact validator findings go back as the
   * instruction. This is NOT an automatic repair loop on grounded assemblies — one of those
   * failing its own bench is a platform bug worth surfacing (src/ai/CLAUDE.md) — it is a
   * button, so the user decides whether to spend a call rather than reading raw findings
   * they have no way to act on.
   */
  const fixNow = () => {
    if (!validation || validation.ok) return;
    const findings = validation.errors.map((e) => `- ${e.message}`).join('\n');
    applyRefinement(
      `The template fails these checks. Fix every one of them and change nothing else about ` +
        `the design:\n${findings}`,
      false,
      'Fixing the findings…',
    );
  };

  /** Undo every refinement of the picked direction, back to what the AI first proposed. */
  const revertNow = () => {
    const original = originals[selected];
    if (!original) return;
    setAlternatives(alternatives.map((alt, i) => (i === selected ? original : alt)));
    showChange(original);
    stagePick(original, originals);
  };

  const refined = Boolean(originals[selected]) && alternatives[selected] !== originals[selected];

  return (
    <div>
      {/* THE STEP OPENS BY SAYING IT IS STILL IN TESTING (owner, 2026-08-29 - the same fact
          the Entry card leads with, said once more where the reader is about to spend a
          generation). It reuses the step's OWN convention rather than adding a second notice
          pattern: SectionHead's summary is the one always-visible line, and the ⓘ holds the
          rest (GOALS goal 4). The tier paragraph that used to sit under this heading moved
          into the ⓘ with it - that is exactly the move the convention prescribes, and it is
          why the caution costs this step no height. */}
      <div className="panel-section">
        <SectionHead
          title={liteMode ? 'NoaCG Lite' : proMode ? 'NoaCG Pro' : 'Create with AI'}
          summary={<span className="wz-testing-note">Still in testing - results vary</span>}
          testid="ai-testing-why"
        >
          <p>
            This door is still in a testing phase. What comes back varies from one brief to the
            next: some land close to finished, others come back plainer than a catalog design.
            What does <strong>not</strong> vary is whether it works - every result is validated
            and exercised in a live playout test before you can create it, so a broken graphic
            never reaches air. If you need a settled result today, start from a template or
            import your own artwork instead.
          </p>
          <p>
            {liteMode
              ? 'Included for free users. This quality release concentrates on one excellent editable lower third, then validates and exercises it in the live playout bench. Other graphic types are explained instead of being forced into a poor design.'
              : proMode
                ? 'An on-air look designed for your channel, and every graphic of the package below built in it — one generation, a set that visibly belongs together. Each lands as ordinary editable code with live text fields, real shapes, deterministic motion and every export target, checked in the live playout bench first.'
                : 'Describe what you need, and optionally add artwork or an existing template. Every result is validated and exercised in a live playout test before you can create it, and lands as clean, editable code.'}
          </p>
        </SectionHead>
        {/* Before the drop zone, the brief, the tiers and any key: the preferred route is the
            first thing the step says after its caution. Never gated on an account - a visitor
            with no account is exactly who owns a better road than the one that asks for one. */}
        <AgentRouteCard
          ref={agentRouteRef}
          open={agentRouteOpen}
          onToggle={setAgentRouteOpen}
          hostedOffered={liteOffered || proOffered}
        />
        {liteMode && liteStatus?.allowance && (
          <p className="hint" data-testid="lite-allowance">
            {liteStatus.allowance.dailySuccessesRemaining} successful generation(s) left today ·{' '}
            {liteStatus.allowance.monthlySuccessesRemaining} this month
          </p>
        )}
      </div>

      <ProjectFormatPicker
        value={format}
        onChange={onFormat}
        idPrefix="ai-format"
        description="This resolution and frame rate are fixed before the first generation. AI cannot override them."
      />

      {/* The legibility settings ride EVERY generation's context as the design-rules prompt
          block, and persist with the created project — same shared control the Style step
          renders on the catalog walk. */}
      <ViewingControls value={legibility} onChange={onLegibility} />

      {/* The drop zone (images + existing templates). Never gated: the no-AI import lives here. */}
      <div
        className={`wz-drop ${dragOver ? 'over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); void addFiles(e.dataTransfer.files); }}
        onClick={() => fileInput.current?.click()}
        role="button"
        tabIndex={0}
      >
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.html,.htm,.zip"
          multiple
          style={{ display: 'none' }}
          onChange={(e) => { void addFiles(e.target.files); e.target.value = ''; }}
        />
        <strong>{liteMode ? 'Drop an existing template to open as code' : 'Drop pictures or an existing template here'}</strong>
        <span className="hint">
          {liteMode ? (
            <>Image input is paused while Lite concentrates on lower-third quality. Existing <code className="inline">.html</code> or <code className="inline">.zip</code> templates can still be opened unchanged.</>
          ) : (
            <>A logo to place, a design to follow, a mood board, or a shot of the real background —
              you say what each one is for after dropping it. An{' '}
              <code className="inline">.html</code> file or an SPX-style <code className="inline">.zip</code>{' '}
              can be opened as code unchanged, or converted to house standards with AI.</>
          )}
        </span>
      </div>

      {imported && (
        <div className="change-preview" style={{ marginTop: 10 }}>
          <strong>{imported.template.name}</strong>
          <span className="hint" style={{ marginLeft: 8 }}>{imported.fileName} — existing template</span>
          <p className="hint" style={{ marginTop: 6 }}>
            <b>Open as code</b> keeps it byte-for-byte (validate and re-export it as SPX /
            CasparCG / OGraf).
            {!liteMode && <> Or describe what to change and <b>Convert</b> brings it to the house standards with AI.</>}
          </p>
          <div data-testid="import-format-detection">
            {imported.detection.messages.map((message) => (
              <p className="hint" key={message} style={{ margin: '3px 0' }}>{message}</p>
            ))}
            {imported.confirmed ? (
              <p className="status-ok" style={{ margin: '6px 0' }}>
                Authored project format: {imported.template.resolution.width}×
                {imported.template.resolution.height} · {imported.template.fps} fps
              </p>
            ) : (
              <>
                <p className="status-bad" style={{ margin: '6px 0' }}>
                  The authored format is uncertain. NoaCG will not assume or rewrite it.
                </p>
                <button
                  data-testid="confirm-import-format"
                  onClick={() => {
                    const chosenResolution = resolutionForSelection(format);
                    setImported({
                      ...imported,
                      template: {
                        ...imported.template,
                        resolution: chosenResolution,
                        fps: format.fps,
                      },
                      confirmed: true,
                    });
                  }}
                >
                  Use selected project format ({resolution.width}×{resolution.height} · {fps} fps)
                </button>
              </>
            )}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button
              className="primary"
              disabled={!imported.confirmed}
              onClick={() => onOpenImported(imported.template)}
            >
              ‹› Open as code (no AI)
            </button>
            <button onClick={() => setImported(null)}>✕ Remove</button>
          </div>
        </div>
      )}

      {uploads.length > 0 && (
        <div className="wz-uploads" data-testid="ai-uploads">
          {uploads.map((item) => (
            <UploadCard
              key={item.asset.path}
              item={item}
              // Lite has exactly one legal purpose, so offering four would be a lie.
              choosable={!liteMode}
              onChange={(patch) =>
                setUploads((current) =>
                  current.map((u) => (u.asset.path === item.asset.path ? { ...u, ...patch } : u)),
                )
              }
              onRemove={() =>
                setUploads((current) => current.filter((u) => u.asset.path !== item.asset.path))
              }
            />
          ))}
          {proMode && (
            <p className="hint" data-testid="pro-upload-note">
              An as-is mark is seated in the design and its shape and ink are measured, so the
              look is chosen around it. Style references do not steer the design yet — colours
              read from your image can be applied as the exact brand accent below.
            </p>
          )}
          {images.length > 0 && (
            <button
              onClick={() => onUseTemplates(images)}
              title="Skip the AI: pick a catalog design with a logo slot and your first image pre-placed"
            >
              ▤ Design around these with a catalog template ›
            </button>
          )}
        </div>
      )}

      {needsSignIn ? (
        // Hosted mode, no account: AI is an account feature — but only the AI. The import
        // above (Open as code) and the catalog continuation stay fully open.
        //
        // This copy is the product's whole answer to a student who has no account, since
        // anonymous Lite stays off: it names the FREE ACCOUNT as the thing that unlocks AI,
        // and offers making one beside signing in. "Sign in" alone told them to do something
        // they cannot do.
        <div style={{ marginTop: 12 }}>
          <SignInPrompt
            offerSignUp
            feature={liteMode ? 'NoaCG Lite' : proMode ? 'NoaCG Pro' : 'Create with AI'}
            reason={liteMode
              ? 'Create with AI needs a free NoaCG account — it comes with the included NoaCG Lite allowance for common editable graphics.'
              : 'Create with AI needs a free NoaCG account. It costs nothing, and you get a validated, editable template.'}
          />
        </div>
      ) : (
        <>
          {liteMode && !liteActive && (
            <p className="status-bad" style={{ marginTop: 10 }}>
              NoaCG Lite is temporarily unavailable. Existing templates and the normal editor still work.
            </p>
          )}
          {/* THE THREAD: talk turns and earlier generations, oldest first. */}
          {turns.length > 0 && (
            <div className="ai-thread" data-testid="ai-thread">
              {turns.map((turn, i) =>
                turn.kind === 'past' ? (
                  <div key={i} className="ai-past" data-testid="ai-past">
                    <div className="ai-past-shots">
                      {turn.changes.map((alt, k) => (
                        <span
                          key={k}
                          className={`ai-past-shot ${k === turn.selected ? 'picked' : ''}`}
                          title={alt.template.name}
                        >
                          <MiniPreview template={alt.template} />
                        </span>
                      ))}
                    </div>
                    <div className="ai-past-foot">
                      <span className="hint">
                        {turn.changes.length > 1
                          ? `${turn.changes.length} directions — you had "${turn.changes[turn.selected].template.name}" picked`
                          : turn.changes[turn.selected].template.name}
                      </span>
                      <button onClick={() => restore(i)} disabled={!!busy}>
                        ↩ Bring back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div key={i} className={`ai-msg ${turn.kind === 'you' ? 'user' : 'assistant'}`}>
                    <span>
                      {turn.text}
                      {turn.kind === 'you' && turn.attached > 0 && (
                        <em className="ai-attached"> — with {turn.attached} image(s)</em>
                      )}
                    </span>
                  </div>
                ),
              )}
              {chatBusy && <p className="hint">⏳ Thinking…</p>}
              {/* What a Generate press would act on, while that is still the next move. Once
                  a result exists the brief has been consumed and the request is a turn in
                  the thread above — repeating it here would just be a second copy. */}
              {latestBrief && !chatBusy && !busy && !result && (
                <div className="ai-brief">
                  <span className="hint">Brief so far: {latestBrief}</span>
                  <button onClick={() => setPrompt(latestBrief)}>Edit it</button>
                </div>
              )}
            </div>
          )}

          {/* Example briefs: show the range (most have no starting template) + teach the shape.
              They belong to the empty state — once there is a thread they are noise. */}
          {turns.length === 0 && (
          <div className="row wrap" style={{ marginTop: 12, marginBottom: 6, gap: 6 }}>
            {/* EACH TIER GETS THE BRIEFS ITS ENGINE CAN ANSWER (src/ai/examplePrompts.ts).
                Pro shared Lite's while both were lower-third-first, and that stopped being
                true when Pro started deciding a design LANGUAGE: a Lite brief describes one
                strap, where a Pro brief has to describe a look a whole channel is built in.
                The banks live together in one file so a tier's examples cannot drift from
                what its engine is measured against. */}
            {briefsForTier(liteMode, proMode).map((ex) => {
              // A brief the user wrote themselves is real work; replacing it takes two clicks.
              const examples = briefsForTier(liteMode, proMode);
              const dirty = Boolean(prompt.trim()) && !examples.some((e) => e.prompt === prompt);
              const armed = armedExample === ex.label;
              return (
                <button
                  key={ex.label}
                  className={`wz-example ${armed ? 'armed' : ''}`}
                  title={ex.prompt}
                  onClick={() => {
                    if (dirty && !armed) {
                      setArmedExample(ex.label);
                      return;
                    }
                    setPrompt(ex.prompt);
                    setArmedExample(null);
                  }}
                  disabled={!!busy}
                >
                  {armed ? 'Replace your brief?' : ex.label}
                </button>
              );
            })}
          </div>
          )}

          {/* ONE composer for the whole step. What it does depends on where you are: with no
              result it describes the graphic, with one it refines it — and either way the
              same box can be talked into instead of generated from. */}
          <textarea
            rows={result ? 3 : 4}
            placeholder={
              result && !proMode
                ? 'Refine it — e.g. "bigger name, move it bottom-left, calmer entrance"'
                : imported
                  ? 'e.g. "Keep the layout but bring it to our look: darker panel, our amber accent, calmer entrance."'
                  : liteMode
                    ? 'e.g. "A calm university lower third for speaker name and academic role. Editorial, spacious, accessible, with a restrained entrance."'
                    : proMode
                      ? 'e.g. "Public-broadcast election night: calm, authoritative, deep blue with a thin gold rule."'
                      : 'e.g. "An election results lower third for channel A7: candidate name, party, and a\nvote percentage that counts up. Dark, serious, uses our logo as a small badge on the left."'
            }
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              setArmedExample(null); // typing is the clearest "no, keep mine"
            }}
            disabled={!!busy}
          />

          {turns.length === 0 && !liteMode && (
            <p className="hint" style={{ marginTop: 6 }}>
              Not sure yet? Describe the show or the moment ("halftime of a local derby, we need
              something for substitutions") and press <b>Talk it through</b> — the conversation
              travels with the brief when you generate.
            </p>
          )}

          {/* BRAND: colours read out of the uploaded artwork, and the looks already saved.
              Both only PROPOSE — the machine cannot tell whether the red in a crest is the
              identity or the shirt behind it, so the pick stays the user's. */}
          {(extracted.length > 0 || looks.length > 0) && (
            <div className="ai-brand" data-testid="ai-brand">
              {extracted.length > 0 && (
                <div className="ai-brand-row">
                  <span className="hint">Colours in your image:</span>
                  {extracted.map((c) => (
                    <button
                      key={c.hex}
                      className={`ai-swatch ${spec.brandColors?.accent === c.hex ? 'picked' : ''}`}
                      style={{ background: c.hex }}
                      data-swatch={c.hex}
                      aria-label={`Use ${c.hex} as the brand accent`}
                      title={`${c.hex} — ${Math.round(c.share * 100)}% of the image`}
                      onClick={() => applyAccent(c.hex)}
                      disabled={!!busy}
                    />
                  ))}
                </div>
              )}
              {looks.length > 0 && (
                <div className="ai-brand-row">
                  {/* COLOURS ONLY, and the label says so. Everywhere else a chosen brand also
                      carries its typeface and its logo; this strip writes `spec.brandColors` and
                      nothing more, so naming it "a brand" without the qualifier would promise
                      the AI door something it does not do yet (docs/BRAND_PLAN.md §5). */}
                  <span className="hint">Or a brand&rsquo;s colors:</span>
                  <select
                    aria-label="Brand colors"
                    value=""
                    onChange={(e) => applySavedLook(e.target.value)}
                    disabled={!!busy}
                  >
                    <option value="">Pick a brand…</option>
                    {looks.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}
              {spec.brandColors && (
                <div className="ai-brand-row">
                  <span className="hint">
                    Brand accent <code className="inline">{spec.brandColors.accent}</code> — the AI
                    must use it exactly.
                  </span>
                  <button onClick={() => setSpec({ ...spec, brandColors: null })} disabled={!!busy}>
                    Clear
                  </button>
                </div>
              )}
            </div>
          )}

          {brandPalette && !spec.brandColors && (
            <p className="hint" style={{ marginTop: 6 }}>
              Using this project's brand colors (accent {brandPalette.accent}) — toggle "Match current
              project" below to let the AI pick its own.
            </p>
          )}

          <div className="row wrap" style={{ marginTop: 10, alignItems: 'center' }}>
            {/* With a result standing, the typed text is a REFINEMENT of it — that is the
                primary move, and starting over is the deliberate one beside it. */}
            {result && !imported && !proMode ? (
              <button
                className="primary"
                disabled={!!busy || !aiReady || !prompt.trim()}
                onClick={refineNow}
              >
                Refine
              </button>
            ) : (
              <button
                className="primary"
                disabled={
                  !!busy
                  || !aiReady
                  || (!briefNow() && !imported)
                  || ((liteMode || proMode) && Boolean(imported))
                  || (Boolean(imported) && !imported?.confirmed)
                }
                onClick={() => void generate()}
              >
                {imported && !liteMode && !proMode
                  ? 'Convert with AI'
                  : result
                    ? proMode ? 'Generate a new design' : 'Create another'
                    : 'Create'}
              </button>
            )}
            {!liteMode && (
              <button
                disabled={chatBusy || !!busy || !prompt.trim() || !aiConfigured(settings)}
                onClick={() => void sendChat()}
                data-testid="ai-talk"
                title="Think it through with the AI first - the conversation travels with the brief when you generate."
              >
                🗨 Talk it through
              </button>
            )}
            {!liteMode && (
              <button
                disabled={!!busy}
                onClick={() => fileInput.current?.click()}
                data-testid="ai-attach"
                title="Attach an image to this turn — it is bundled with the result, not just described."
              >
                📎 Attach
              </button>
            )}
            {result && !imported && !proMode && (
              <button disabled={!!busy || !aiReady || !briefNow()} onClick={() => void generate()}>
                ↻ Start over
              </button>
            )}
            {tier === 'custom' && result && !imported && alternatives[selected]?.spec && settings.useHarness && (
              <button
                disabled={!!busy || !aiConfigured(settings)}
                data-testid="ai-more-like"
                onClick={() => void generate(alternatives[selected].spec)}
                title="Three new directions in the spirit of the one you picked."
              >
                ✦ 3 more like this
              </button>
            )}
            {tier === 'custom' && !imported && (
              <label
                className="wz-match"
                title="On: three design directions built on the catalog design system, each exercised in a live playout test, learning from your picks. Off: one quick draft — the model's own take, checked but never played."
              >
                <input
                  type="checkbox"
                  checked={settings.useHarness}
                  onChange={(e) => saveSetting({ useHarness: e.target.checked })}
                  disabled={!!busy}
                />
                Design 3 options and test them live
              </label>
            )}
            {!imported && (
              <button
                onClick={() => setMoreOpen((o) => !o)}
                data-testid="more-control-toggle"
                title="Optional structured setup: category, data fields, references, fonts, animation — better, more predictable results, especially on smaller models."
              >
                {moreOpen ? '▾' : '▸'} More control{activeSpec ? ' ●' : ''}
              </button>
            )}
            {/* Always offered: the settings panel is where the execution TIER is chosen,
                so a Lite or Pro user has to be able to reach it too. The button carries a
                one-line read-back of what is configured (handoff §3a), so the common case
                needs no click at all. */}
            <div className="ai-settings-host">
              <button onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings}>
                ⚙ AI settings
              </button>
              {/* What it currently resolves to, so the common case needs no click at all. */}
              <span className="ai-settings-summary">{settingsSummary}</span>
            </div>
          </div>

          {/* What a run like this has cost lately. Shown only once this browser has done
              enough of them to have an answer — a first-time user gets no number rather
              than an invented one. Tokens and seconds, never money: prices are not in this
              codebase and a stale figure presented as cost would be believed. */}
          {tier === 'custom' && (() => {
            const expected = runExpectation(imported ? 'convert' : 'generate', settings.useHarness);
            if (!expected || busy) return null;
            return (
              <p className="hint" style={{ marginTop: 6 }} data-testid="ai-expectation">
                Typically ~{formatDuration(expected.ms)}
                {hasTokenCounts(expected) && (
                  <> and ~{formatTokens(expected.inputTokens)} in / {formatTokens(expected.outputTokens)} out</>
                )}
                {settings.useHarness ? ' for all three options' : ''} — median of your last{' '}
                {expected.runs} runs.
              </p>
            );
          })()}

          {moreOpen && !imported && (
            <MoreControlPanel
              spec={spec}
              onSpec={setSpec}
              // Reference images are uploaded ONCE, in the drop zone above, where every other
              // picture arrives. This panel only reports what is attached.
              uploads={uploads}
              disabled={!!busy}
              allowUploads={!liteMode}
              // Pro v1 compiles lower thirds carrying name + title + an optional logo
              // slot, so the category list and the field budget say so up front.
              allowedCategories={liteMode ? LITE_AI_CATEGORIES : proMode ? PRO_SUPPORTED_CATEGORIES : undefined}
              maxFields={liteMode ? liteStatus?.limits.fields ?? 8 : proMode ? 3 : undefined}
            />
          )}

          {/* An in-flow sheet, NOT a popover, though the reference draws one: it opens
              ITSELF whenever nothing is configured - which is exactly when Generate, Attach
              and More control are all live and waiting - so a floating sheet would cover the
              controls it exists to make work. Measured, as two Pro specs deadlocking:
              Playwright will not dispatch a click through a covering element, so the press
              that would dismiss it never arrives. Making it float means restructuring the
              step around it. */}
          {showSettings && (
            <div
              className="panel-section ai-settings-sheet"
              data-testid="ai-settings"
            >
              <div className="wz-header ai-settings-head">
                <h2>AI settings</h2>
                <button className="gallery-close" onClick={() => setShowSettings(false)} title="Close">✕</button>
              </div>
              {/* THE EXECUTION TIER. Lite and Pro are managed experiences of this same
                  creation workflow — no model picking, and no mechanism named; the BYO-key
                  tier is the deliberate route where provider, key, and models are the user's
                  own. A tier this build does not offer is ABSENT, not greyed: an unbuilt door
                  described in the present tense is the defect this panel just fixed. */}
              {/* FIRST in the sheet, above every tier: the route that needs no tier and no key.
                  A pointer rather than a second copy of the card, so there is one place the
                  commands live and this line only reveals it. */}
              <p className="hint ai-agent-pointer" data-testid="ai-agent-pointer">
                Have Claude Code or Codex? Your own agent is the preferred route, and it needs no
                tier and no key.{' '}
                <button type="button" className="link-btn" onClick={revealAgentRoute}>Show me ›</button>
              </p>
              <div className="ai-tier" role="radiogroup" aria-label="AI tier" data-testid="ai-tier">
                {tierOptions.map((option) => {
                  const unavailable = option.id === 'lite' && !liteOffered;
                  return (
                    <label
                      key={option.id}
                      className={`ai-tier-option ${tier === option.id ? 'selected' : ''}`}
                      data-testid={`ai-tier-${option.id}`}
                    >
                      <input
                        type="radio"
                        name="ai-tier"
                        checked={tier === option.id}
                        disabled={!!busy || unavailable}
                        onChange={() => saveSetting({ tier: option.id })}
                      />
                      <span className="ai-tier-body">
                        <strong>{option.name}</strong>
                        <span className="hint">
                          {unavailable ? 'Not offered by this server.' : option.hint}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
              {/* Pro has NO chooser at all — no provider, no model, no key. The copy states the
                  outcome and stops there, so replacing what runs underneath costs no wording
                  and promises nothing about how it is done. */}
              {proMode && (
                <div style={{ marginTop: 10 }} data-testid="ai-pro-settings">
                  {/* Nothing to choose, know, or supply — no provider, no model, no key. The
                      allowance read-back is the only thing worth showing, because it is the one
                      limit the user can actually run into. The tier is not offered at all where
                      that is not true, so there is no second branch here asking for a key. */}
                  <p className="hint" data-testid="ai-pro-hosted-note">
                    NoaCG Pro runs on NoaCG&apos;s own service — there is nothing to configure and
                    no key to supply. It picks its own model, and the real cost of each
                    generation is shown on the result.
                    {proStatus?.allowance
                      // THE SMALLER OF THE TWO, because the allowance is two counters and a user
                      // meets whichever runs out first. Measured 2026-08-15: the panel read
                      // "1 generation(s) left today" from the STARTS counter while the SUCCESSES
                      // counter was already spent, so Create came back disabled under a sentence
                      // promising another go - the exact drift api/_lib/lite/status.ts warns
                      // about, arriving on the read-back side instead of the gate side.
                      ? ` ${Math.min(
                        proStatus.allowance.dailyStartsRemaining,
                        proStatus.allowance.dailySuccessesRemaining,
                      )} generation(s) left today,
                          ${Math.min(
                        proStatus.allowance.monthlyStartsRemaining,
                        proStatus.allowance.monthlySuccessesRemaining,
                      )} this month.`
                      : ''}
                  </p>
                  {/* ── THE PACKAGE (docs/NOACG_PRO_PLAN.md §15.9) ─────────────────────────
                      This is the ONE thing a Pro user chooses, and it is here rather than
                      beside the prompt because it is a property of the RUN, like the tier
                      itself, not part of the brief. Every box is ticked by default: the whole
                      package costs exactly one model call, so the only reason to untick one is
                      that the show does not need that graphic.
                      The LAST tick cannot be removed - a generation that makes nothing is not
                      a choice anyone means to express - so the sole remaining box is disabled
                      rather than silently re-added on the next load. */}
                  <fieldset className="ai-pro-package" data-testid="pro-package">
                    <legend className="dlg-caption">What this makes</legend>
                    {PRO_PACKAGE_LIST.map((spec) => {
                      const on = proPackage.includes(spec.id);
                      const onlyOne = on && proPackage.length === 1;
                      return (
                        <label
                          key={spec.id}
                          className="dlg-check"
                          data-testid={`pro-package-${spec.id}`}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!!busy || onlyOne}
                            onChange={() => {
                              // Rebuilt from the canonical ORDER rather than by pushing onto the
                              // end: the first member is the graphic the step previews, and a
                              // tick further down the list must not move it.
                              const next = PRO_PACKAGE_LIST
                                .map((s) => s.id)
                                .filter((id) => (id === spec.id ? !on : proPackage.includes(id)));
                              setProPackage(next);
                              saveAiSettings({ proPackage: next });
                            }}
                          />
                          <span>
                            <strong>{spec.label}</strong>
                            <span className="hint">
                              {spec.id === primaryGraphic
                                ? 'Shown in the preview, and the one a refinement changes.'
                                : 'Composed from the same design language — no extra generation.'}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                    <p className="hint">
                      One generation, {proPackage.length === 1 ? 'one graphic' : `${proPackage.length} graphics`}
                      {proPackage.length > 1
                        ? ' that belong to each other. Only the design language is generated; the platform composes each graphic from it.'
                        : '.'}
                    </p>
                  </fieldset>
                </div>
              )}
              {tier === 'custom' && (
                <div style={{ marginTop: 10 }}>
                  {/* The tier's promise IS the key, so the managed route is not on offer here. */}
                  <AiProviderSettings settings={settings} onChange={saveSetting} allowManaged={false} />
                </div>
              )}
            </div>
          )}


          {busy && <p className="hint" style={{ marginTop: 10 }}>⏳ {busy}</p>}
          {error && <p className="status-bad" style={{ marginTop: 10 }}>✗ {error}</p>}

          {alternatives.length > 1 && !busy && (
            // The three directions as they actually LOOK. They differ in real decisions —
            // chassis, composition, typography, density, motion — and a list of names showed
            // none of it, so the choice was made blind on the one thing that matters.
            <div className="wz-alt-grid" data-testid="ai-alternatives">
              {alternatives.map((alt, i) => (
                <button
                  key={i}
                  className={`wz-variant wz-alt ${i === selected ? 'selected' : ''}`}
                  data-alt={i + 1}
                  aria-pressed={i === selected}
                  title={alt.summary ?? alt.template.name}
                  onClick={() => selectAlternative(i)}
                >
                  <MiniPreview template={alt.template} />
                  <div className="wz-variant-cap">
                    <span className="wz-alt-name">
                      <span className="wz-alt-route mono" aria-hidden="true">{routeMark(alt.path)}</span>
                      {/* The name needs its own box to ellipsize: a bare text node inside a
                          flex container is an anonymous item, which text-overflow cannot
                          reach — so a long name was cut mid-letter with no "…". */}
                      <span className="wz-alt-title">{alt.template.name}</span>
                    </span>
                    {/* Deliberately NOT .status-ok/.status-bad: those name the verdict on the
                        CURRENT result, and a step showing three cards plus a verdict must not
                        have four elements answering to the same words. */}
                    <span
                      className={`wz-alt-mark ${alt.validation?.ok ? 'ok' : 'bad'}`}
                      title={alt.validation?.ok ? 'Passes every check' : 'Some checks are failing'}
                    >
                      {alt.validation?.ok ? '✓' : '✗'}
                    </span>
                  </div>
                  {designWords(alt).length > 0 && (
                    <span className="wz-alt-words">
                      {designWords(alt).map((word) => (
                        <span key={word} className="wz-alt-word">{word}</span>
                      ))}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          {result && !busy && (
            <div className="change-preview" style={{ marginTop: 10 }} data-legibility={lastLegibility ?? undefined}>
              <strong>{result.name}</strong>
              {summary && <p style={{ marginTop: 6 }}>{summary}</p>}
              {adaptedFrom(alternatives[selected]) && (
                <p className="hint" style={{ marginTop: 4 }} data-testid="ai-adapted-from">
                  {adaptedFrom(alternatives[selected])}
                </p>
              )}
              {/* The proven designs this result was chosen FROM (src/ai/retrieval.ts). Shown
                  because "adapted from a proven design" is a claim, and a claim whose
                  alternatives the user can see — and swap onto — is checkable. The swap is
                  deterministic: no model call, no cost, everything the brief decided carried
                  over onto the other design. */}
              {shortlistOf(alternatives[selected]).length > 1 && !busy && (
                <div className="wz-shortlist" data-testid="ai-shortlist">
                  <p className="hint" style={{ marginTop: 8 }}>
                    Chosen from {shortlistOf(alternatives[selected]).length} proven designs for this brief — pick another to
                    rebuild on it, free.
                  </p>
                  <div className="wz-shortlist-grid">
                    {shortlistOf(alternatives[selected]).map((variant) => {
                      const current = variant.id === alternatives[selected]?.spec?.variantId;
                      return (
                        <button
                          key={variant.id}
                          className={`wz-variant wz-shortlist-card ${current ? 'selected' : ''}`}
                          data-variant={variant.id}
                          aria-pressed={current}
                          title={variant.description}
                          onClick={() => void rebuildOnChassis(variant.id)}
                        >
                          <MiniPreview variant={variant} />
                          {/* The NAME gets the whole caption. A style-family tag beside it read
                              well on a Browse tile, where it is also a filter facet — here it
                              took a third of a 132px card and clipped "Scripture Reading" and
                              "House Handle" to nothing useful, to name something the picture
                              above it already shows. */}
                          <div className="wz-variant-cap">
                            <span className="wz-alt-title">{variant.name}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {routeLabel(lastPath) && <p className="hint" style={{ marginTop: 4 }}>{routeLabel(lastPath)}</p>}
              {/* The Pro result's own story: the DESIGN LANGUAGE the model decided, and every
                  place the platform decided something for it. There is no concept image to show
                  any more - the graphic IS the answer, rendered live above this card, and the
                  picture the old engine displayed was the one thing it could not keep (§16). */}
              {lastPath === 'pro' && (() => {
                const pro = proDetails.current.get(result);
                if (!pro) return null;
                const swatches: [string, string][] = [
                  ['accent', pro.language.palette.accent],
                  ['panel', pro.language.palette.panel],
                  ['text', pro.language.palette.text],
                  ['supporting', pro.language.palette.textDim],
                ];
                return (
                  <div className="wz-pro-concept" style={{ marginTop: 8 }} data-testid="pro-report">
                    {/* The RATIONALE is not repeated here: it is already the result summary one
                        line above, which is the slot every path writes its reasoning into. */}
                    {/* `wrap`, because this row carries a model-chosen NAME beside four swatches
                        and three enum words - a long look name on a narrow step would otherwise
                        push the palette off the card. */}
                    <div className="row wrap" style={{ gap: 6, alignItems: 'center' }} data-testid="pro-palette">
                      <strong style={{ marginRight: 2 }}>{pro.language.name}</strong>
                      {swatches.map(([role, hex]) => (
                        <span
                          key={role}
                          title={`${role} ${hex}`}
                          style={{
                            width: 18, height: 18, borderRadius: 4, background: hex,
                            border: '1px solid rgba(255,255,255,0.2)', display: 'inline-block',
                          }}
                        />
                      ))}
                      <span className="hint">
                        {pro.language.typography.fontId} · {pro.language.density} · {pro.language.motion.character}
                      </span>
                    </div>
                    {/* WHAT THE PLATFORM DECIDED, said out loud. A repair the user cannot see is
                        a promise nobody can check (the Lite brand rule), and these are the same
                        divergences the ledger row now carries as `pro-` codes. */}
                    <ul className="hint" data-testid="pro-outcomes">
                      {pro.notes.map((note, index) => (
                        <li key={index}>{note}</li>
                      ))}
                    </ul>
                    {/* ── THE PACKAGE, as it actually looks (§15.9) ──────────────────────────
                        A list of names cannot answer the only question a package raises - do
                        these belong to each other - so the members are rendered, small, beside
                        the primary the preview shows large. Same reasoning as the kit Finish
                        step's thumbnail grid, one surface earlier: the claim is checkable here,
                        before anything is created. */}
                    {(() => {
                      const pack = proPack.current.get(result) ?? [];
                      if (pack.length < 2) return null;
                      return (
                        <div className="wz-kit-built-wrap" data-testid="pro-package-built">
                          <p className="hint">
                            The whole package, from this one design language:
                          </p>
                          <ul className="wz-kit-built">
                            {pack.map((member, index) => (
                              <li key={`${member.id}-${index}`} className="wz-kit-built-cell">
                                <MiniPreview template={member.template} lazy />
                                <span className="wz-kit-built-name">{PRO_GRAPHICS[member.id].label}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      );
                    })()}
                    {proDropped.length > 0 && (
                      // A short package is never a SILENT one. The composer cannot emit invalid
                      // code, so a member the gate refused is a platform defect worth naming
                      // rather than a graphic to quietly leave out of the set.
                      <p className="hint status-bad" data-testid="pro-package-dropped">
                        ⚠ {proDropped.join(' and ')} did not pass the platform&apos;s own checks and
                        {proDropped.length === 1 ? ' is' : ' are'} not in this set.
                      </p>
                    )}
                    {pro.fallbacks.length > 0 && (
                      <p className="hint" data-testid="pro-warning">
                        ⚠ {pro.fallbacks.length} design decision(s) came back unreadable and fell
                        back to the house look.
                      </p>
                    )}
                    <p className="hint">
                      Designed by {pro.model}
                      {pro.costUsd > 0 ? ` · $${pro.costUsd.toFixed(4)}` : ''}
                    </p>
                  </div>
                );
              })()}
              {lastSpec && (!activeSpec || activeSpec.category === 'auto') && (
                // The category the AI inferred — surfaced as EDITABLE metadata, never a
                // silent decision. Changing it pins the next generation.
                <p className="hint" style={{ marginTop: 4 }}>
                  Detected category:{' '}
                  <select
                    aria-label="Detected graphic category"
                    value={aiCategoryForAssemblerId(lastSpec.category)?.id ?? ''}
                    onChange={(e) => {
                      const id = e.target.value as AiCategoryId | '';
                      if (!id) return;
                      setSpec({ ...spec, category: id, categoryInferred: true });
                      setMoreOpen(true);
                    }}
                    disabled={!!busy}
                  >
                    <option value="" disabled>—</option>
                    {AI_CATEGORIES.filter((category) => !liteMode || LITE_AI_CATEGORIES.includes(category.id as never)).map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>{' '}
                  — change it to pin the next Generate.
                </p>
              )}
              <p className={validation?.ok ? 'status-ok' : 'status-bad'} style={{ marginTop: 6 }}>
                {validation?.ok
                  ? lastPath === 'raw'
                    ? '✓ Passes validation — press Play in the preview, then Create project.'
                    : '✓ Passes validation and the live playout test — press Play in the preview, then Create project.'
                  : `✗ ${validation?.errors.length} check(s) failing — refine or regenerate.`}
              </p>
              {/* ON-AIR READINESS: the checks that already ran, grouped into what an
                  operator cares about. It adds no checks — it reports the findings the
                  bench and the validator produced, which is what lets a row say "not
                  tested" honestly when the live bench was never part of this result. */}
              {validation && (
                <div className="ai-ready" data-testid="ai-readiness">
                  {readinessRows(validation, lastPath !== 'raw' && lastPath !== null).map((row) => (
                    <div key={row.id} className={`ai-ready-row ${row.state}`} data-ready-row={row.id}>
                      <span className="ai-ready-mark" aria-hidden="true">
                        {row.state === 'pass' ? '✓' : row.state === 'warn' ? '⚠' : row.state === 'fail' ? '✗' : '·'}
                      </span>
                      <span className="ai-ready-label">
                        {row.label}
                        {row.state === 'untested' && <em> — not played, so not tested</em>}
                      </span>
                      {row.messages.length > 0 && (
                        <ul className="ai-ready-notes">
                          {row.messages.map((m, i) => (
                            <li key={i}>{m}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                  {unclaimedFindings(validation).map((f, i) => {
                    // An unclaimed ERROR is still an error: the row that shows it says so.
                    // Painting every unrowed finding as a warning is how a blocking defect
                    // reads as advice - the shape of the §16 failure, one layer up.
                    const blocking = validation.errors.includes(f);
                    return (
                      <div key={`x${i}`} className={`ai-ready-row ${blocking ? 'fail' : 'warn'}`}>
                        <span className="ai-ready-mark" aria-hidden="true">{blocking ? '✗' : '⚠'}</span>
                        <span className="ai-ready-label">{f.message}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {validation && !validation.ok && tier === 'custom' && (
                // The findings are the app's words, not the user's job to translate —
                // one press sends them back as the instruction.
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="primary" data-testid="ai-fix" onClick={fixNow}>
                    ⟳ Fix these
                  </button>
                  <span className="hint">Sends the failing checks back to the AI to repair.</span>
                </div>
              )}
              {validation && !validation.ok && liteMode && (
                <p className="hint" style={{ marginTop: 8 }}>
                  This is a NoaCG platform failure, so Lite will not spend another model call trying to rewrite generated code.
                </p>
              )}
              {validation && !validation.ok && proMode && (
                <p className="hint" style={{ marginTop: 8 }}>
                  NoaCG builds this graphic deterministically, so a failing check here is a NoaCG
                  platform defect — generate a new design rather than spending repair calls.
                </p>
              )}
              {spent && (
                <p className="hint" style={{ marginTop: 6 }} data-testid="ai-spent">
                  This run: {formatDuration(spent.ms)}
                  {hasTokenCounts(spent) && (
                    <>
                      , {formatTokens(spent.inputTokens)} tokens in / {formatTokens(spent.outputTokens)} out
                    </>
                  )}
                  .
                </p>
              )}
              {refined && (
                // A refinement is a bet: it may be worse than what the AI first proposed, and
                // regenerating would return three DIFFERENT designs rather than this one.
                <div className="row" style={{ marginTop: 8 }}>
                  <button data-testid="ai-revert" onClick={revertNow}>↺ Undo refinements</button>
                  <span className="hint">Back to this direction as it was first designed.</span>
                </div>
              )}
              {/* LAST on the card, and nothing depends on it. Create project, Refine and
                  Regenerate are all reachable without touching it - a rating standing between
                  somebody and their finished graphic is a toll, and a toll collects resentment
                  rather than data. */}
              <GenerationRating
                generationId={alternatives[selected]?.generationId}
                tier={tier}
                // The chassis the harness actually assembled, off the returned DesignSpec -
                // not the one the setup panel asked for. A grounded result can clamp an
                // out-of-range chassis to the nearest legal one, and a rating filed against
                // the request rather than the result would point at the wrong design.
                variantId={alternatives[selected]?.spec?.variantId}
              />
            </div>
          )}
        </>
      )}

    </div>
  );
}
