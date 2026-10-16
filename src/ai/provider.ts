// Creative AI provider interface. The app is built entirely against this interface so the
// model-gateway-backed harness and deterministic stub are interchangeable. AI output is always run through
// validation before it can be applied or exported — the platform owns the structure.

import type { AssetFile, Resolution, SpxTemplate, TemplateChange } from '../model/types';
import type { CustomFont } from '../model/fonts';
import type { Palette } from '../model/wizard';
import type { ValidationIssue, ValidationResult } from '../validation/validateTemplate';
import type { DesignSpec } from './designSpec';
import type { ChatMessage } from './brainstorm';
import type { GenerationSpec } from '../model/generationSpec';
import type { CreativeAiProfileId } from './lite/types';
import type { StyleReference } from '../model/imagePurpose';
import type { GenerationMode, RouteDecision, StructuralIntent } from '../model/structuralIntent';
import type { ResolvedLegibility } from '../model/designRules';

/** Extra inputs for generation: uploaded images (logo / still), brand colors, canvas. */
export interface GenerateContext {
  /** Uploaded images that APPEAR IN the graphic (logo, stills) — data-URL assets
   *  (paths like images/logo.png), bundled into the result. */
  images: AssetFile[];
  /** Images that only INFLUENCE the design, each carrying WHAT it influences (model/
   *  imagePurpose.ts): its composition, its colour and mood, or the real background the
   *  graphic must stay legible over. Vision input only — never bundled, never placed. */
  references?: StyleReference[];
  /** Subset of `images` the operator must get NO control for: fixed brand furniture rather
   *  than content. Every uploaded image used to become a swappable field, which put a
   *  channel bug in the control panel beside the guest's name. */
  fixedAssetPaths?: string[];
  /** Brand colors to honor (the project brand or a custom palette), if any. */
  palette: Palette | null;
  /** The user's uploaded primary font — embedded like a wizard font import. */
  customFont?: CustomFont;
  /** The user-authored structured setup (the "More control" panel), if any. */
  spec?: GenerationSpec | null;
  /**
   * The conversation that led here, oldest first: brainstorm turns and earlier refinement
   * instructions. A brief refined over three turns IS all three, and copying one summary
   * line out of a chat threw the rest away. BOUNDED BY THE CALLER — the provider trusts
   * what it is handed and never re-reads a whole session.
   */
  conversation?: ChatMessage[];
  /**
   * "Three more like this": the design spec of a direction the user liked. The design stage
   * keeps what makes it work and varies everything else — it is a starting point, never a
   * template to return three tints of.
   */
  seed?: DesignSpec;
  /**
   * The project's RESOLVED legibility settings (model/designRules.ts): viewing target,
   * standard/safe mode, and whether the size floors bind. `contextText` renders them as the
   * design-rules prompt block on the user message — generated from the canonical module, so
   * prompt and measurement cannot drift. Absent = no block (bench controls stay bit-stable).
   */
  legibility?: ResolvedLegibility;
  resolution: Resolution;
  fps: number;
}

/**
 * The injected validation pipeline (static validateTemplate + the runtime bench), bound by
 * the UI — the same seam the video harness uses (VideoValidator). The provider stays free of
 * DOM/iframe concerns; callers that can bench inject it, callers that can't simply don't.
 */
export type SpxValidator = (template: SpxTemplate) => Promise<ValidationResult>;

/**
 * The injected structural-satisfaction check (validation/structuralIntentCheck.ts): verify
 * the intent's required parts against the RENDERED template. Injected like SpxValidator -
 * it needs a live DOM, so the provider never imports it - and non-blocking by default: in
 * phase A its findings land as warnings on the final validation, never entering the frozen
 * control's repair rounds (docs/CREATIVE_MODE_PLAN.md §8).
 *
 * `variantId` is the grounded design stage's chosen chassis, and is what lets the check ask
 * whether the assembly is the KIND of graphic the brief asked for (a stinger brief that came
 * back as a lower third). A free-form result has no catalog variant and passes undefined.
 */
export type StructuralIntentChecker = (
  template: SpxTemplate,
  intent: StructuralIntent,
  variantId?: string,
) => Promise<ValidationIssue[]>;

/** Options every template-producing provider method accepts. */
export interface GenerateOptions {
  /** A server-owned product profile. Omitted preserves the existing BYO/provider flow. */
  profile?: CreativeAiProfileId;
  /**
   * How to generate (docs/CREATIVE_MODE_PLAN.md §2): 'adapt' = customize a catalog design,
   * 'create' = an original build, 'auto' (the default) = route on structural fit +
   * originality signals. An explicit mode is never overridden by routing.
   */
  mode?: GenerationMode;
  /** Validate candidates (and drive the repair loop). Falls back to static validation. */
  validate?: SpxValidator;
  /** Verify the routed intent's required parts against the rendered result (injected,
   *  browser-only, non-blocking - see StructuralIntentChecker). */
  structuralCheck?: StructuralIntentChecker;
  /** Stage announcements for the UI's busy line ("Designing…", "Testing it live…"). */
  onProgress?: (stage: string) => void;
  /**
   * For modify: the design spec that PRODUCED the template being modified (returned on a
   * grounded AiTemplateChange). When present and the template is still house-shaped, the
   * refinement happens at spec level — "warmer colours, calmer entrance" re-assembles
   * deterministically instead of round-tripping code.
   */
  spec?: DesignSpec;
}

/** Which pipeline produced a result — surfaced honestly in the UI and in telemetry.
 *  'raw' = the default one-shot generation (harness off). */
export type AiPath = 'grounded' | 'grounded+polish' | 'grounded+skin' | 'custom' | 'raw' | 'stub' | 'pro';

/** A template change with the harness's provenance attached. */
export interface AiTemplateChange extends TemplateChange {
  path?: AiPath;
  /** The final validation the harness ran (static + bench when injected). */
  validation?: ValidationResult;
  /** On grounded results: the design spec that produced the template (pass it back via
   *  GenerateOptions.spec so refinements can stay at spec level). */
  spec?: DesignSpec;
  /** Server ledger id for a managed generation. It is transient and never enters SpxTemplate. */
  generationId?: string;
  /** On a convert's result and its fixes: the imported template it was converted from, so a
   *  construct the user's own file already had is not reported as the AI's (`screenChange`).
   *  Absent on a freshly generated result, which has no source. */
  convertedFrom?: SpxTemplate;
  /** The structural analysis that routed this generation (the CREATE-boundary contract,
   *  docs/CREATIVE_MODE_PLAN.md §6) - recorded for rigs and future pipeline stages. */
  intent?: StructuralIntent;
  /** What the router decided and why - the routing benchmark reads this, never reconstructs it. */
  routing?: RouteDecision;
  /**
   * The PROVEN designs this result was chosen from (src/ai/retrieval.ts), catalog variant ids
   * in rank order. Present on an ADAPT-routed result and absent everywhere else, so its
   * presence is also the honest record of whether retrieval ran.
   *
   * It is on the change rather than only in telemetry because the user is shown it: "adapted
   * from a proven design" is a claim, and a claim the user can see the alternatives to - and
   * swap onto, deterministically - is the difference between a promise and a slogan.
   */
  shortlist?: string[];
}

export interface AIProvider {
  /** Create a new template from a natural-language prompt (+ optional images/brand). */
  generate(prompt: string, context?: GenerateContext, options?: GenerateOptions): Promise<AiTemplateChange>;
  /**
   * The DEFAULT generation (harness off): one model call, no design-spec stage, no bench
   * repair loop — the model's own take, statically validated for honest display. The
   * benchmark showed these look strong; the harness must EARN being switched on.
   */
  generateRaw(prompt: string, context?: GenerateContext, options?: GenerateOptions): Promise<AiTemplateChange>;
  /**
   * The harness path (harness on): THREE genuinely different design directions from one
   * design-stage call, each assembled/validated like generate(). The UI offers the pick;
   * the choice feeds aggregated preference data (src/ai/preferences.ts).
   */
  generateAlternatives(prompt: string, context?: GenerateContext, options?: GenerateOptions): Promise<AiTemplateChange[]>;
  /**
   * Modify the current template per a prompt. The context is what makes a refinement part of
   * a CONVERSATION rather than an isolated instruction: images attached mid-thread are
   * bundled into the result, and the transcript travels with the request.
   */
  modify(
    prompt: string,
    template: SpxTemplate,
    context?: GenerateContext,
    options?: GenerateOptions,
  ): Promise<AiTemplateChange>;
  /** Explain a piece of code (returns prose, no template change). */
  explain(code: string): Promise<string>;
  /** Attempt fixes for known validation problems. */
  fix(template: SpxTemplate, options?: GenerateOptions): Promise<AiTemplateChange>;
  /** Make the template more SPX-ready (definition, relative paths, runtime functions). */
  makeSpxReady(template: SpxTemplate, options?: GenerateOptions): Promise<AiTemplateChange>;
  /**
   * Convert an IMPORTED template per a prompt: keep what the user's file got right, bring
   * the rest to the house contracts. The import itself is always the deterministic parser
   * (model/importTemplate.ts) — the AI only ever sees the parsed template, never raw bytes.
   */
  convertImport(
    prompt: string,
    imported: SpxTemplate,
    context?: GenerateContext,
    options?: GenerateOptions,
  ): Promise<AiTemplateChange>;
}
