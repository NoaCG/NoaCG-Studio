// The established Creative AI harness (originally Claude-backed): prompt → complete SPX
// template through the selected model gateway route, validated before it can
// apply. The system prompt teaches the model this project's contracts (SPX runtime, :root
// style vars, marked ANIMATION region, auto-fit, teachable ES5) and shows a real catalog
// design's generated code as the canonical example — with the ANIMATION region in its
// AUTHORING shape (legacy GSAP builders), which every emit converts deterministically into
// the timeline-editable NOACG_ANIM data block through the same importer the wizard uses
// (convertEmittedRegion). Results run through the injected validation pipeline (static
// validateTemplate + the runtime bench when the caller provides one) with a bounded
// errors-back repair loop, RE-VALIDATED every round; anything still broken is surfaced to
// the user with its findings attached, never auto-applied.

import { callModel, callModelDetailed, type ModelTool, type ContentBlock } from './modelGateway';
import type {
  AiPath, AIProvider, AiTemplateChange, GenerateContext, GenerateOptions, SpxValidator,
} from './provider';
import { startAiRun, type AiRunKind, type AiRunRecorder } from './telemetry';
import { parseDefinition } from '../model/spxDefinition';
import { type SpxTemplate, type TemplateType, DEFAULT_SETTINGS } from '../model/types';
import { DEFAULT_GRAPHICS_FORMAT, DEFAULT_GRAPHICS_RESOLUTION } from '../model/projectFormat';
import { legibilityPromptBlock } from '../model/designRules';
import { parseDataUrl } from '../assets/assetUtils';
import type { ReferencePurpose } from '../model/imagePurpose';
import { validateTemplate, type ValidationResult } from '../validation/validateTemplate';
import { lt01 } from '../templates/lowerThirds/lt01';
import {
  catalogDigest,
  DESIGN_ALTERNATIVES_TOOL,
  DESIGN_SPEC_TOOL,
  narrowVariantTool,
  type AssembleOptions,
  type DesignSpec,
} from './designSpec';
import { FULL_CATALOG, shortlistFor, type Shortlist } from './retrieval';
import { aiCategoryById } from './spec/categories';
import { preferenceHint } from './preferences';
import {
  assembleGroundedTemplate,
  attemptLiteSkin,
  liteHoldFrameFindings,
  normalizeLiteSpec,
  productionSpxValidator,
  singleLineIdentityFields,
} from './lite/pipeline';
import { applyPolish, POLISH_TOOL, type PolishPatch } from './polish';
import { variantsFor } from '../templates/catalog';
import type { TemplateVariant } from '../model/wizard';
import { detectPrefix } from '../model/structure';
import { parseAnimData } from '../blocks/animData';
import { emitPresetRegion } from '../blocks/presetRegistry';
import { ANIMATION_MARK_OPEN } from '../templates/lowerThirds/animPresets';
import { convertToDataRegion } from '../templates/shared/standard';
import { specSections } from './spec/specPrompt';
import { applySpecLocks, applySpecOutPreset, narrowedSpecTool } from './spec/specDesign';
import { demoteSpecFields, ensureSpecFonts, withSpecChecks } from './spec/specValidate';
import { generateLiteDesign, LiteRequestError, recordLiteOutcome } from './lite/client';
import { findingsList, repairLoop } from './shared/repairLoop';
import {
  INTENT_TOOL,
  intentSystemPrompt,
  isIntentAnswer,
  narrowFitTool,
  normalizeIntent,
  routeIntent,
  STRUCTURAL_KIND_RULE,
  type GenerationMode,
  type RouteDecision,
  type StructuralIntent,
} from './structuralIntent';

// ── Structured output: the model must return the template via this tool ─────

export const TEMPLATE_TOOL: ModelTool = {
  name: 'emit_template',
  description: 'Return the complete SPX template as its three code files.',
  input_schema: {
    type: 'object',
    required: ['name', 'type', 'summary', 'html', 'css', 'js'],
    additionalProperties: false,
    properties: {
      name: { type: 'string', description: 'Short template name, e.g. "Neon Lower Third"' },
      type: {
        type: 'string',
        description: 'The closest graphic category',
        enum: ['lower-third', 'info-card', 'end-credits', 'ticker', 'fullscreen', 'bug', 'countdown', 'scoreboard', 'info-box', 'starting-soon', 'infographic', 'quiz', 'blank'],
      },
      summary: { type: 'string', description: 'One sentence describing the design for the user.' },
      html: { type: 'string', description: 'Complete index.html (doctype through </html>).' },
      css: { type: 'string', description: 'Complete template.css.' },
      js: { type: 'string', description: 'Complete template.js.' },
    },
  },
};

export interface EmittedTemplate {
  name: string;
  type: TemplateType;
  summary: string;
  html: string;
  css: string;
  js: string;
}

// ── The system prompts: contracts + taste-as-reasoning + one real example ────

// Taste is derived from the brief, never from a fixed aesthetic — shared by the design
// stage and the coder so both reason the same way.
const TASTE_REASONING = `## How to judge design (reason from the context, never from a house look)
Taste is not a fixed aesthetic. Derive it from the brief, the programme's genre, the
audience, and any references: clear hierarchy (what is read first, second, last),
intentional contrast, information density suited to the audience and reading distance,
strong typography, balanced spacing, coherent visual logic, motion that supports the
reading order, restraint where the content is serious, distinctiveness without
unnecessary decoration. A news lower third, an esports ranking, an election result, a
financial ticker, an entertainment graphic, and a children's programme each earn
DIFFERENT answers — density, weight, colour energy, motion speed. Never default to one
look; make every choice follow the programme.`;

/**
 * The canonical example with its ANIMATION region shown in the AUTHORING shape: the legacy
 * GSAP builders the category presets emit, not the NOACG_ANIM data block they convert into
 * at create. The coder writes this natural GSAP grammar — what models are actually good at —
 * and the platform converts the emit deterministically (convertEmittedRegion below), exactly
 * how every wizard category is built: the preset authors legacy choreography and
 * convertToDataRegion flips it. Falls back to the converted form when the variant's preset
 * can't emit for it (still a complete teacher, just data-shaped).
 */
function exampleWithAuthoringRegion(variant: TemplateVariant, presetId?: string): SpxTemplate {
  const tpl = variant.create();
  // When the user explicitly picked an entrance preset the variant knows, the worked example
  // shows THAT preset's authored choreography — the model studies the motion it must ship.
  const preset = presetId && variant.animationPresets.includes(presetId as never)
    ? (presetId as TemplateVariant['animationPresets'][number])
    : variant.animationPresets[0];
  const region = emitPresetRegion(tpl, preset);
  if (!region) return tpl;
  return { ...tpl, js: tpl.js.replace(/\/\* == ANIMATION[\s\S]*?== END ANIMATION == \*\//, () => region) };
}

function systemPrompt(exampleVariant: TemplateVariant = lt01, examplePresetId?: string): string {
  // The canonical example is REAL generated code — the same contracts the wizard writes.
  // The caller picks the nearest catalog design so a scoreboard brief studies a real
  // scoreboard's contracts, not always a lower third.
  return coderSystemPrompt(exampleWithAuthoringRegion(exampleVariant, examplePresetId));
}

/**
 * The coder's system prompt around ONE worked example. Split out of `systemPrompt` above so
 * the Creative Mode pilot's de-anchored arm can pass a NEUTRAL structural skeleton in the
 * example slot (plan §4, §8 arm B) — the A-vs-B comparison isolates the catalog example, so
 * the two arms must differ in the example and in nothing else. Pure extraction: the control
 * path still calls it with exactly the example it always built.
 */
export function coderSystemPrompt(example: SpxTemplate): string {
  return `You are the template generator inside NoaCG Studio — a tool that creates
broadcast graphics templates for SPX Graphics / CasparCG playout. You write COMPLETE, working,
marketplace-quality templates. The user is learning to code from what you write.

## The SPX contract (hard requirements)
- The HTML contains a <script> defining window.SPXGCTemplateDefinition with the playout settings
  and DataFields. Every data field is named f0, f1, … and maps to exactly one element with the
  same id (SPX writes the value into it). Input-only values live in hidden divs.
- Field types: textfield, textarea, number, and filelist for images (with
  "assetfolder": "./images/", "extension": "png"). Use dropdown ONLY for a genuinely
  constrained design choice. No color/checkbox fields.
- template.js defines global update(data) (data is a JSON string), play(), stop(), next().
  It loads in <head>, so any load-time DOM work needs a DOMContentLoaded guard.
- External references exactly like the example: js/gsap.min.js, css/template.css,
  js/template.js. GSAP is available as the global "gsap" — it is the ONLY library.
- Image values are relative paths (images/logo.png). Write them into <img> elements via the
  setFieldValue helper (copy it from the example verbatim).

## The structure contract (REQUIRED — this is how the app finds your design's parts)
Choose ONE short kebab-case PREFIX naming the design (the example uses "lower-third"; a
motorsport timing tower would use "timing-tower"). Then, exactly like the example:
- The root wrapper is <div class="PREFIX"> — absolutely positioned in a safe-area zone,
  starting at opacity: 0 (play() reveals it).
- Directly inside it, the stage/panel element is <div class="PREFIX-box">. That exact -box
  class, ALONE on the element (never "PREFIX-box something-else"), is what the editor
  searches for: WITHOUT IT the canvas, timeline and Style panel cannot identify a single
  part of the design, however good the rest of the code is.
- Every other class starts with the same prefix: PREFIX-title, PREFIX-row, PREFIX-logo, …
- Each visible text field sits in its OWN mask, and the mask class is exactly PREFIX-mask:
  <div class="PREFIX-mask"><span id="fN" class="PREFIX-name">…</span></div>, the mask
  overflow: hidden — that is what lets a line slide in from behind its own edge.
- A one-off accent flourish, when the design has one, is <div class="PREFIX-accent">.
Copy this skeleton from the example; only the prefix and what lives inside the box change.

## The house style contracts (keep AI output editable by the app's panels)
- ALL colors flow through :root vars: --accent, --text-color, --text-dim, --panel-bg,
  --font-heading, --scale, --type-scale. Zero hardcoded colors anywhere else in the CSS.
- ALL pixel sizes via calc(N * var(--scale)); font sizes additionally multiply by the
  text-only knob: font-size: calc(N * var(--scale) * var(--type-scale)).
- Text boxes hug their content (width: fit-content) with a max-width cap so long text wraps
  instead of overflowing.
- ALL animation lives between the EXACT markers (copy them character for character)
  ${ANIMATION_MARK_OPEN}
  and /* == END ANIMATION == */, in the AUTHORING shape the example shows: the three knob
  vars (var animSpeed / easeIn / easeOut) followed by buildInTimeline() and
  buildOutTimeline(), each building and returning one gsap.timeline(). After generation the
  platform CONVERTS this region into its timeline-editable keyframe-data form — the same
  converter every built-in design goes through — so stay inside the emitted grammar:
  - Only tl.set / tl.to / tl.fromTo with literal number/string values. Durations, staggers,
    and absolute positions are written as N / animSpeed; overlaps as '-=N'. The ease comes
    from the knob vars (the timeline defaults) or ONE quoted GSAP ease per tween.
  - NO DOM-measured values (scrollWidth, getBoundingClientRect), no nested gsap.timeline()
    inside a tween, no conditionals or helper functions inside the region. A region the
    converter cannot read still plays and exports, but its motion shows read-only on the
    visual timeline — keep it convertible.
  - buildInTimeline starts by revealing the CSS-hidden root (tl.set root { opacity: 1 });
    buildOutTimeline ends by hiding it again — exactly like the example. Entrances are
    fromTo tweens so replay is safe: play() after stop() must render correctly.
  When the template you are MODIFYING already carries the converted form (var NOACG_ANIM +
  its interpreter), keep that form: edit the keyframe DATA and leave the interpreter
  functions verbatim.
- Never put skew/rotation on an element a timeline tweens — paint it on a ::before layer.

## Layout safety (hard requirements — the #1 rejection reason)
- Text must NEVER overlap other text or UI elements unless deliberately layered on a panel
  behind it. Stack text with normal flow or flex column + gap — never absolutely position
  two siblings where they can collide. Distinct pieces of information get distinct space.
- Mentally render before emitting: once with the default field values, once with every text
  field twice as long. Nothing may collide, clip mid-word, or escape its panel.
- Labels never wrap mid-word: short caps labels get white-space: nowrap; label columns get
  a min-width that fits the longest label.
- Contrast is broadcast-grade: primary text reads clearly against what it actually sits on
  (aim ≥ 4.5:1); dim/secondary text stays ≥ 60% opacity white on dark panels; never accent
  text on accent background; text over a busy area gets a panel or shadow behind it.
- When the brief asks for a logo/image field, the empty state shows a visible placeholder
  mark (toggle it with the has-image pattern from the example) — never an invisible slot.

## Motion doctrine
- Entrances use Out-direction easings (power2.out/power3.out/expo.out; back.out for a snappy
  pop). Exits use In-direction and run FASTER than entrances. Entrances 0.5–1.4 s total —
  above ~0.9 s reads as deliberate broadcast pacing, so keep fast-feel graphics (stream
  overlays, alerts) at the low end. Staggers between elements 60–250 ms.
- Linear ("none") ONLY for continuous travel (tickers, rolls, timers, progress).
- Bounce/elastic only if the user asks for playful.

## Code style
- Write the SIMPLEST clear code that is correct. Prefer direct HTML, CSS, and JavaScript: a few
  obvious lines over a clever abstraction. A beginner should be able to find the piece that draws
  a thing and understand it without tracing through layers.
- Descriptive names (name the thing it is), simple top-to-bottom control flow, minimal
  indirection. Do NOT add helper functions, wrappers, config objects, generic patterns, or
  clever one-liners unless they clearly make the code simpler to read — usually they do not here.
- Teachable ES5 in template.js (var, function declarations), short useful comments that explain
  WHY (not that something changed). Rich but commented CSS. No frameworks, no build steps.

${TASTE_REASONING}

## The canonical example (REAL output of this tool — match its structure exactly)
=== index.html ===
${example.html}
=== template.css ===
${example.css}
=== template.js ===
${example.js}
=== end of example ===

Return the template ONLY via the emit_template tool.`;
}

/** The design-stage prompt: decide the route and every design parameter — no code.
 *
 *  `shortlist` is the retrieved set of proven designs (src/ai/retrieval.ts). Absent — which is
 *  every CREATE-routed generation — the prompt is byte-identical to the pre-retrieval one, so
 *  the frozen benchmark control stays frozen (src/ai/AGENTS.md, plan §8). */
function specSystemPrompt(shortlist?: Shortlist): string {
  const proven = shortlist && !shortlist.full && shortlist.variants.length ? shortlist.variants : undefined;
  return `You are the design director inside NoaCG Studio — a tool that creates broadcast
graphics templates. You do NOT write code here. You read the brief (and any attached
reference images) and return ONE design decision via the emit_design_spec tool.

${TASTE_REASONING}

## Routing (fit)
Choose "catalog" when a design family below carries the brief's STRUCTURE — the platform
then assembles a guaranteed-correct template from your parameters, and styling differences
(colour, typography, density, spacing, shape, motion character) are expressed through the
parameters and the flourish, never by rejecting the chassis. Choose "custom" when the brief
genuinely calls for a structure or composition no family expresses — a novel layout, an
unlisted graphic kind, a composition that would be forced into the wrong shape. Custom is a
real creative route; never cram a brief into an ill-fitting chassis, and never route to
custom just for a styling difference.

## Variety (a hard requirement)
Different briefs must produce visibly different designs. Choose the chassis, zone, motion,
typography, density, and palette from THIS brief's world — not the same safe family every
time. Fill lines[] with realistic samples from the brief's world, never lorem ipsum.

## References
When images are attached: a logo means brand colours and useLogoSlot where the design has a
slot; screenshots or style frames mean you read the SYSTEM behind them — grid, hierarchy,
spacing rhythm, proportions, shape language, colour balance, density, motion cues — into
referenceSystem, and let it drive your parameters. References outweigh every generic rule
above.

## What the platform can assemble
${catalogDigest(proven)}
${(() => {
    const hint = preferenceHint();
    return hint ? `\n## Aggregated user preferences\n${hint}\n` : '';
  })()}
Return the design ONLY via the requested tool.`;
}

// The default one-shot generation (harness OFF): the model's own take, told only the SPX
// format basics so the result runs in playout — no taste teaching, no worked example, no
// repair loop. The benchmark's raw arm showed these look strong; keeping this path pure is
// what makes the harness's value measurable (and its checkbox honest).
export const RAW_SYSTEM = `You make broadcast graphics as SPX / CasparCG HTML templates. Return the complete
template as three files via the emit_template tool.

Format basics (so it runs in playout):
- index.html defines window.SPXGCTemplateDefinition with DataFields named f0, f1, …; each field
  maps to one element with the same id. Field types: textfield, textarea, number, filelist (for
  images).
- template.js (loaded in <head>) defines global update(data /* a JSON string */), play(), stop(),
  next().
- External references are relative: css/template.css, js/template.js, js/gsap.min.js. GSAP is
  available as the global "gsap" (the only library). No CDN or absolute paths.
- Each tool field is the PURE contents of that one file: "html" is the full document
  (doctype…</html>, and the SPXGCTemplateDefinition <script> lives here); "css" is CSS only;
  "js" is JavaScript only — no <script> tags, no HTML.

Return ONLY via the emit_template tool.`;

// ── Building an SpxTemplate from the model's output ──────────────────────────

export function toTemplate(emitted: EmittedTemplate, ctx?: GenerateContext, base?: SpxTemplate): SpxTemplate {
  const parsed = parseDefinition(emitted.html);
  return {
    name: emitted.name || base?.name || 'AI template',
    type: emitted.type ?? base?.type ?? 'blank',
    resolution: ctx?.resolution ?? base?.resolution ?? DEFAULT_GRAPHICS_RESOLUTION,
    fps: ctx?.fps ?? base?.fps ?? DEFAULT_GRAPHICS_FORMAT.fps,
    html: emitted.html,
    css: emitted.css,
    js: emitted.js,
    fields: parsed?.fields ?? [],
    settings: parsed?.settings ?? { ...DEFAULT_SETTINGS, description: emitted.name },
    assets: [...(base?.assets ?? []), ...(ctx?.images ?? [])].filter(
      (a, i, all) => all.findIndex((b) => b.path === a.path) === i,
    ),
    layers: [],
  };
}

/** The runtime bench's house-editability rule (src/validation/runtimeBench.ts). Exported so
 *  a bench wrapper reproducing this path's repair policy reads the same constant rather than
 *  keeping a second copy of the string - a demotion the two disagree about would silently
 *  change how many repair rounds a measured round spent. */
export const EDITABILITY_RULE = 'bench-editability';

/**
 * Deterministic grounding of a free-form emit: the coder authors the ANIMATION region as
 * legacy GSAP builders (the shape the system prompt teaches — natural GSAP the model is
 * good at), and this converts a parseable region into the NOACG_ANIM data block through
 * the SAME importer every wizard category uses at create. An emit that already carries a
 * readable data block passes through untouched; a region the importer cannot read keeps
 * the model's own code — honest hand-crafted output the timeline renders read-only.
 * Exported for verification scripts (like plainGenerate below).
 */
export function convertEmittedRegion(template: SpxTemplate): SpxTemplate {
  if (parseAnimData(template.js)) return template;
  const originalJs = template.js;
  // The converter's writer splices on the exact house marker; a drifted parenthetical in
  // the model's open marker would silently block the swap, so canonicalize it first.
  template.js = template.js.replace(/\/\* == ANIMATION[^\n]*?== \*\//, () => ANIMATION_MARK_OPEN);
  convertToDataRegion(template);
  // Nothing gained (unparseable region): keep the model's code byte-identical.
  if (!parseAnimData(template.js)) template.js = originalJs;
  return template;
}

/**
 * Demote residual editability findings to warnings. After the deterministic conversion has
 * had its chance, an unconvertible region is honest hand-crafted code — the template still
 * plays and exports, the timeline just shows its motion read-only — so a working
 * off-catalog design must not be surfaced as a FAILURE over panel editability.
 */
function demoteEditability(v: ValidationResult): ValidationResult {
  const demoted = v.errors.filter((e) => e.rule === EDITABILITY_RULE);
  if (demoted.length === 0) return v;
  const errors = v.errors.filter((e) => e.rule !== EDITABILITY_RULE);
  return { ok: errors.length === 0, errors, warnings: [...v.warnings, ...demoted] };
}

/** Run the injected validation pipeline (static + runtime bench) or plain static validation. */
async function validateWith(
  template: SpxTemplate,
  options?: GenerateOptions,
  run?: AiRunRecorder,
): Promise<ValidationResult> {
  const t0 = Date.now();
  const result = options?.validate ? await options.validate(template) : validateTemplate(template);
  run?.stage('validate', t0);
  return result;
}

/**
 * Emit → validate → bounded errors-back repair. Every round is RE-VALIDATED (a repair that
 * comes back broken never masquerades as fixed); a result that still fails after the budget
 * is returned with its validation attached — surfaced to the user, never auto-applied.
 */
async function generateValidated(
  userContent: ContentBlock[],
  ctx?: GenerateContext,
  base?: SpxTemplate,
  options?: GenerateOptions,
  run?: AiRunRecorder,
  exampleVariant?: TemplateVariant,
): Promise<AiTemplateChange> {
  const system = systemPrompt(exampleVariant, ctx?.spec?.animation?.inPresetId);
  options?.onProgress?.('Writing the code…');
  let t0 = Date.now();
  // The system prompt is byte-identical across the emit and its repair rounds — one
  // prompt-cache breakpoint absorbs most of the loop's input cost.
  const first = await callModelDetailed({
    system,
    messages: [{ role: 'user', content: userContent }],
    tool: TEMPLATE_TOOL,
    cacheSystem: true,
  });
  run?.stage('coder', t0, first.model, first.usage);

  // Ground every emit the same way: region conversion, then the spec's deterministic
  // passes — uploaded fonts land as assets + @font-face whether or not the model wrote
  // them, and an explicit exit preset applies as a real keyframe swap where possible.
  const ground = (e: EmittedTemplate): SpxTemplate =>
    applySpecOutPreset(ensureSpecFonts(convertEmittedRegion(toTemplate(e, ctx, base)), ctx?.spec), ctx?.spec);

  // Editability stays a hard error only when the template being MODIFIED already carried a
  // readable data block — silently losing it would be a real regression the repair loop
  // must fight. Everywhere else (fresh custom builds, foreign imports, hand-written code)
  // a region the converter above couldn't read demotes to a warning at the end instead of
  // burning repair rounds on the one finding the model reliably fails; the findings still
  // ride along in a round a FUNCTIONAL error triggers (the shared loop hands reEmit the
  // FULL error list while `blocking` decides what forces a round).
  const editabilityBlocks = !!base && !!parseAnimData(base.js);

  const { emitted: result, validation: finalValidation } = await repairLoop<
    { emitted: EmittedTemplate; template: SpxTemplate },
    ValidationResult
  >({
    emitted: { emitted: first.output as EmittedTemplate, template: ground(first.output as EmittedTemplate) },
    validate: async (current) => {
      options?.onProgress?.('Testing it…');
      return validateWith(current.template, options, run);
    },
    blocking: (v) =>
      editabilityBlocks ? v.errors : v.errors.filter((e) => e.rule !== EDITABILITY_RULE),
    reEmit: async (findings, current, round) => {
      // Errors-back repair: the exact findings (validator rules + bench measurements) with
      // the full current code, forced back through the same tool.
      options?.onProgress?.(`Repairing (round ${round})…`);
      run?.repair();
      t0 = Date.now();
      const repair = await callModelDetailed({
        system,
        messages: [
          { role: 'user', content: userContent },
          { role: 'assistant', content: `I generated a template but it failed the platform's checks.` },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Your template failed these checks. Fix ALL of them and re-emit the complete template:
${findingsList(findings)}

=== index.html ===
${current.template.html}
=== template.css ===
${current.template.css}
=== template.js ===
${current.template.js}`,
              },
            ],
          },
        ],
        tool: TEMPLATE_TOOL,
        cacheSystem: true,
      });
      run?.stage(`repair-${round}`, t0, repair.model, repair.usage);
      const next = repair.output as EmittedTemplate;
      return { emitted: next, template: ground(next) };
    },
  });

  const validation = editabilityBlocks ? finalValidation : demoteEditability(finalValidation);
  return { summary: result.emitted.summary, template: result.template, path: 'custom', validation };
}

/** Telemetry wrapper: record the run whether it returns or throws. */
async function recorded(kind: AiRunKind, work: (run: AiRunRecorder) => Promise<AiTemplateChange>): Promise<AiTemplateChange> {
  const run = startAiRun(kind);
  try {
    const result = await work(run);
    if (result.path) run.route(result.path);
    run.finish(result.validation?.ok ?? true, result.validation?.errors.map((e) => e.rule));
    return result;
  } catch (e) {
    run.finish(false, ['exception']);
    throw e;
  }
}

// ── Prompt assembly ───────────────────────────────────────────────────────────

/** The short tag each reference carries in the manifest (model/imagePurpose.ts's words). */
const REFERENCE_TAG: Record<ReferencePurpose, string> = {
  layout: 'MAKE ONE LIKE THIS',
  mood: 'TAKE THE LOOK AND FEEL',
  plate: 'MAKE IT WORK OVER THIS',
};

/**
 * The attachment manifest plus one instruction block per purpose actually present.
 *
 * A picture's PURPOSE is the user's, not something to infer: a crest, a rival's strap, a
 * mood board and a studio plate are four different instructions, and two of them are
 * indistinguishable from pixels alone. So every attachment is numbered ONCE, in the exact
 * order imageBlocks sends them, and the blocks below explain what each tag means. The old
 * "the last N attachments are references" phrasing broke the moment a third kind existed.
 */
function attachmentSections(ctx: GenerateContext): string[] {
  const refs = ctx.references ?? [];
  if (!ctx.images.length && !refs.length) return [];
  const out: string[] = [];

  const manifest = [
    ...ctx.images.map((a, i) => {
      const fixed = ctx.fixedAssetPaths?.includes(a.path);
      return `  ${i + 1}. ${a.path} — USE AS IS${fixed ? ' (fixed, no operator field)' : ''}`;
    }),
    ...refs.map((r, i) => `  ${ctx.images.length + i + 1}. ${REFERENCE_TAG[r.use]}`),
  ];
  out.push(
    `The user attached ${manifest.length} picture(s), in this order, each with what it is FOR:\n` +
      manifest.join('\n'),
  );

  if (ctx.images.length) {
    const fixed = ctx.images.filter((a) => ctx.fixedAssetPaths?.includes(a.path));
    out.push(
      `USE AS IS — these are already bundled at the relative paths above; reference them exactly. ` +
        `Place them the way the brief implies (a mark → a logo slot with an <img id="fN"> image ` +
        `field; a full-frame still → background or featured media). They must appear EXACTLY as ` +
        `uploaded: no recolouring, tinting, CSS filter, crop, rounded corners, or non-uniform ` +
        `scale — a brand mark that has been "improved" is a broken brand mark. Scale them ` +
        `proportionally and position them freely. Their colours may still inform the palette.` +
        (fixed.length
          ? `\nMarked "fixed": ${fixed.map((a) => a.path).join(', ')} — this is permanent brand ` +
            `furniture, NOT content. Place it with a plain <img> and give it NO data field: the ` +
            `operator must not be offered a control that swaps it.`
          : ''),
    );
  }

  const has = (use: ReferencePurpose) => refs.some((r) => r.use === use);

  if (has('layout')) {
    out.push(
      `MAKE ONE LIKE THIS — read these for the COMPOSITION to follow: placement and zone, ` +
        `reading order and hierarchy, how many lines carry what, density, proportion rhythm, ` +
        `shape language, how motion enters. Follow those decisions closely. Never reproduce the ` +
        `artwork itself — not its wordmark, photography, illustration, exact colours or exact ` +
        `proportions; take the structure, leave the skin. The brief's words win wherever the two ` +
        `disagree. If one is a SKETCH or wireframe, read it as a DIAGRAM of what to build: its ` +
        `boxes and scrawls describe placement and nothing else, and its hand-drawn look is not a ` +
        `style to imitate.`,
    );
  }
  if (has('mood')) {
    out.push(
      `TAKE THE LOOK AND FEEL — read these for colour, mood, texture, weight and motion energy ` +
        `ONLY. Ignore their layout and composition entirely; they are not designs to follow and ` +
        `may not even be graphics. Never place them in the graphic.`,
    );
  }
  if (has('plate')) {
    out.push(
      `MAKE IT WORK OVER THIS — this is the REAL background the graphic will be shown over (a ` +
        `studio shot, a camera framing, a desk). It is never placed and never imitated: it is ` +
        `evidence about the picture underneath. Read where it is bright, busy or dark, and where ` +
        `faces and burned-in furniture sit, then make the graphic hold up over it — contrast, ` +
        `panel opacity, an edge or shadow that separates text from a restless background, and ` +
        `placement that does not cover what matters. Assume the plate is representative, not ` +
        `fixed: the shot will move, so do not rely on a gap that happens to be empty in it.`,
    );
  }
  return out;
}

export function contextText(prompt: string, ctx?: GenerateContext): string {
  const parts = [`Create a broadcast graphics template.\n\nUser brief: ${prompt}`];
  if (ctx) {
    parts.push(`Canvas: ${ctx.resolution.width}×${ctx.resolution.height} @ ${ctx.fps} fps.`);
    // The project's legibility settings, as prose GENERATED from the canonical rules module
    // (model/designRules.ts - one module, zero drift). Rides the USER message here, never a
    // system prompt; absent when the caller carries no settings, so bench controls and
    // callers that predate it are byte-identical.
    if (ctx.legibility) {
      parts.push(legibilityPromptBlock(ctx.legibility, ctx.resolution));
    }
    if (ctx.palette) {
      parts.push(
        `Brand colors (use EXACTLY these as the :root vars): --accent: ${ctx.palette.accent}; ` +
          `--text-color: ${ctx.palette.text}; --text-dim: ${ctx.palette.textDim}; --panel-bg: ${ctx.palette.panel}.`,
      );
    }
    parts.push(...attachmentSections(ctx));
    if (ctx.conversation?.length) {
      // The brief is the WHOLE conversation, not its last line. The caller bounds this.
      parts.push(
        `The brief above came out of this conversation (oldest first) — read it as part of the ` +
          `request, and honour anything agreed in it that the brief does not repeat:\n` +
          ctx.conversation.map((m) => `  ${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n'),
      );
    }
    if (ctx.seed) {
      parts.push(
        `THREE MORE LIKE THIS. The user picked this direction and wants more in its spirit — ` +
          `its design spec:\n${JSON.stringify(ctx.seed, null, 2)}\n` +
          `Keep what makes it work (its category, its typographic voice, its colour character) ` +
          `and vary everything else that is genuinely a choice: composition, chassis, density, ` +
          `shape language, motion. Do NOT return this design again, and do not return one design ` +
          `three times — the user has already seen this one and asked for alternatives to it.`,
      );
    }
    const sections = specSections(ctx.spec);
    if (sections) parts.push(sections);
  }
  return parts.join('\n\n');
}

export function imageBlocks(ctx?: GenerateContext): ContentBlock[] {
  if (!ctx) return [];
  const blocks: ContentBlock[] = [];
  // Assets first, references after — the manifest numbers them in exactly this order.
  for (const asset of [...ctx.images, ...(ctx.references ?? []).map((r) => r.asset)]) {
    if (typeof asset.data !== 'string') continue;
    const parsed = parseDataUrl(asset.data);
    if (parsed && parsed.mime.startsWith('image/') && parsed.mime !== 'image/svg+xml') {
      blocks.push({ type: 'image', source: { type: 'base64', media_type: parsed.mime, data: parsed.base64 } });
    }
  }
  return blocks;
}

// ── The provider ──────────────────────────────────────────────────────────────

/** The code-level modify content (shared by modifyAs and the spec-refine fallback). */
function modifyContent(prompt: string, template: SpxTemplate, ctx?: GenerateContext): ContentBlock[] {
  // Attachments come FIRST, exactly as they do on a fresh generation, so the vision blocks
  // and the text that numbers them agree.
  const attached = imageBlocks(ctx);
  const conversation = ctx?.conversation?.length
    ? `\n\nThe conversation this refinement belongs to (oldest first):\n` +
      ctx.conversation.map((m) => `  ${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n')
    : '';
  // The same manifest + per-purpose blocks a fresh generation gets: a picture attached
  // mid-conversation means exactly what it would have meant at the start.
  const sections = ctx ? attachmentSections(ctx) : [];
  const attachments = sections.length ? `\n\n${sections.join('\n\n')}` : '';
  const adopt = ctx?.images?.length
    ? `\nIf the request asks for one of them and the template does not use it yet, add it.`
    : '';
  return [
    ...attached,
    {
      type: 'text',
      text: `Modify the template below. Change ONLY what the request needs — keep everything else
(byte-identical where possible), including the user's own edits and comments.

Request: ${prompt}${conversation}${attachments}${adopt}

=== index.html ===
${template.html}
=== template.css ===
${template.css}
=== template.js ===
${template.js}`,
    },
  ];
}

/** The modify flow shared by modify/fix/makeSpxReady/convertImport (each records its own kind). */
function modifyAs(
  kind: AiRunKind,
  prompt: string,
  template: SpxTemplate,
  context?: GenerateContext,
  options?: GenerateOptions,
): Promise<AiTemplateChange> {
  // The context reaches `toTemplate` as well as the prompt, so an image attached to a
  // refinement is BUNDLED, not merely mentioned — a referenced-but-missing asset is the
  // dangling-reference defect class that ships broken exports.
  return recorded(kind, (run) =>
    generateValidated(modifyContent(prompt, template, context), context, template, options, run),
  );
}

/**
 * Spec-level refinement: when the template being modified came from a grounded spec (the
 * caller passed it back) and is still house-shaped, the refinement re-emits the SPEC and
 * re-assembles deterministically — "warmer colours, calmer entrance" never round-trips
 * code. Falls back to the code-level modify when the design stage fails or routes custom.
 */
async function specRefine(
  prompt: string,
  template: SpxTemplate,
  priorSpec: DesignSpec,
  context: GenerateContext | undefined,
  options: GenerateOptions | undefined,
  run: AiRunRecorder,
): Promise<AiTemplateChange> {
  options?.onProgress?.('Designing…');
  const conversation = context?.conversation?.length
    ? `\n\nThe conversation this refinement belongs to (oldest first):\n` +
      context.conversation.map((m) => `  ${m.role === 'user' ? 'User' : 'You'}: ${m.text}`).join('\n')
    : '';
  const attached = context?.images?.length
    ? `\n\nThe user attached ${context.images.length} image(s) with this request (above), ` +
      `available at:\n${context.images.map((a, i) => `  ${i + 1}. ${a.path}`).join('\n')}\n` +
      `A catalog design can carry a mark in its LOGO SLOT (set useLogoSlot). If the request ` +
      `needs the image somewhere a catalog design has no room for — a full-frame still, a ` +
      `background, featured media — route to custom rather than dropping it.`
    : '';
  // Retrieval, on a refinement (docs/ADAPT_FIRST_PLAN.md §3 Stage R). The structure is not in
  // doubt here - the spec being edited names its own category - so the anchor comes from the
  // spec rather than from an intent call, and no model is asked anything extra.
  //
  // The TERMS are the refinement request PLUS what the graphic already is: "warmer colours"
  // says nothing a design index can place, and searching on it alone would rank by catalog
  // order and offer a worse set than the one the user is already looking at.
  //
  // `keep` is what makes narrowing safe: the shortlist collapses the tool's `variantId` enum,
  // so the design in use has to be in it or the model literally cannot leave it alone.
  const shortlist = shortlistFor(
    [prompt, priorSpec.name, priorSpec.summary, ...(priorSpec.lines ?? []).map((l) => l.title)]
      .filter(Boolean)
      .join(' '),
    null,
    { anchor: `category:${priorSpec.category}`, keep: priorSpec.variantId },
  );
  try {
    const t0 = Date.now();
    const result = await callModelDetailed({
      system: specSystemPrompt(shortlist),
      messages: [
        {
          role: 'user',
          content: [
            ...imageBlocks(context),
            {
              type: 'text',
              text: `The user is refining an existing design. Its current design spec:
${JSON.stringify(priorSpec, null, 2)}

Refinement request: ${prompt}${conversation}${attached}

Return the FULL updated spec — carry forward everything the request does not change
(including the flourish). Route to custom ONLY if the request now needs a structure the
catalog cannot express.`,
            },
          ],
        },
      ],
      tool: shortlistTool(DESIGN_SPEC_TOOL, shortlist),
      maxTokens: 4000,
    });
    run.stage('design-spec', t0, result.model, result.usage);
    const spec = result.output as DesignSpec;
    if (!Array.isArray(spec.lines)) spec.lines = [];
    if (spec.fit === 'catalog') {
      return groundedResult(spec, contextFrom(template, context), options, run);
    }
  } catch {
    // The design stage failed — the code-level modify below still serves the request.
  }
  return generateValidated(modifyContent(prompt, template, context), context, template, options, run);
}

// ── The grounded pipeline: assemble → adjust → optional polish (revert on any failure) ──

/** Try the bounded polish pass; null = reverted (the caller keeps the assembled template). */
async function polishStage(
  template: SpxTemplate,
  spec: DesignSpec,
  options: GenerateOptions | undefined,
  run: AiRunRecorder,
): Promise<{ template: SpxTemplate; validation: ValidationResult } | null> {
  options?.onProgress?.('Polishing…');
  try {
    const t0 = Date.now();
    const result = await callModelDetailed({
      system:
        `You add ONE bounded visual flourish to an assembled broadcast graphics template in NoaCG Studio.\n\n` +
        `Hard rules: every colour flows through the :root vars (--accent, --text-color, --text-dim, ` +
        `--panel-bg); every size via calc(N * var(--scale)); never redeclare :root or @font-face; ` +
        `never touch JavaScript or the animation; keep the auto-fit behaviour (width: fit-content + ` +
        `max-width caps) intact; keep every field id exactly once and the mask structure when you ` +
        `return html. Touch ONLY what the flourish needs — the design is already sound.\n\n` +
        `Return the patch ONLY via the emit_polish tool.`,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Add this flourish to the template below.

Flourish: ${spec.flourish}
${spec.referenceSystem ? `Reference system (from the user's uploads): ${spec.referenceSystem}` : ''}

=== index.html ===
${template.html}
=== template.css ===
${template.css}`,
            },
          ],
        },
      ],
      tool: POLISH_TOOL,
      maxTokens: 8000,
    });
    run.stage('polish', t0, result.model, result.usage);
    const polished = applyPolish(template, result.output as PolishPatch);
    if (!polished) return null;
    options?.onProgress?.('Testing it…');
    const validation = await validateWith(polished, options, run);
    return validation.ok ? { template: polished, validation } : null;
  } catch {
    return null; // a polish failure never costs the user the assembled result
  }
}

/** Spec → assembled, adjusted, validated (and polished when the spec asks) result. */
async function groundedResult(
  spec: DesignSpec,
  ctx: GenerateContext | undefined,
  options: GenerateOptions | undefined,
  run: AiRunRecorder,
  /**
   * The adapt-first assembly policy (docs/ADAPT_FIRST_PLAN.md §3 Stage P + §6.2): the chassis
   * keeps the zone it was drawn for, and `sizeScale` clamps to the range this provider's own
   * design tool declares. **NoaCG Lite passes its own**, because it is a versioned server-owned
   * profile with a different declared range and a prompt that already carries the zone rule -
   * changing what it compiles needs a paid re-baseline. It reaches this function through
   * `liteGroundedResult`, which strips `profile`, so the policy has to be an argument: there is
   * nothing left here to detect Lite by.
   */
  assembly: AssembleOptions = { keepChassisZone: true, sizeScaleRange: [0.85, 1.2] },
): Promise<AiTemplateChange> {
  options?.onProgress?.('Assembling…');
  const t0 = Date.now();
  // The deterministic assembly sequence lives in lite/pipeline, shared verbatim with the
  // Lite benchmark runners — one compile path, so a benchmark result describes the product.
  const assembled = assembleGroundedTemplate(spec, ctx, assembly);
  let template = assembled.template;
  run.stage('assemble', t0);
  run.diversity(assembled.diversity);
  options?.onProgress?.('Testing it…');
  // No repair loop here: a grounded assembly failing its own bench is a platform bug
  // worth surfacing, not something a model round-trip should paper over. A user field a
  // FIXED-CONTRACT category cannot carry demotes to an honest warning (no loop to fight it).
  let validation = demoteSpecFields(await validateWith(template, options, run));
  let path: AiPath = 'grounded';
  if (spec.flourish && validation.ok) {
    const polished = await polishStage(template, spec, options, run);
    if (polished) {
      template = polished.template;
      validation = polished.validation;
      path = 'grounded+polish';
    }
  }
  return {
    summary: spec.summary || 'Built from the catalog design system.',
    template,
    path,
    validation,
    // The spec describes what was BUILT, not what was asked for: `pickVariant` clamps an
    // out-of-range or unknown chassis to the nearest legal one, so the model's `variantId`
    // can name a design that was never assembled. Reporting the resolved id is what lets the
    // satisfaction check ask an honest question, and it means a spec-level `modify` refines
    // the graphic the user is actually looking at.
    spec: { ...spec, variantId: assembled.diversity.variantId },
  };
}

/**
 * The validator a LITE result is held to.
 *
 * Lite validates under its own composition for the same reason it assembles under its own
 * policy: two of `productionSpxValidator`'s options can only be answered from the DECISION,
 * and the browser builds its injected validator (AiStep) long before a decision exists.
 * Which lines must hold ONE line comes from the spec's declared roles
 * (`singleLineIdentityFields`), and which category's type floor the ADJUSTED result is held
 * to comes from `spec.category`. Left unset, `bench-line-wrap` and `bench-type-floor` were
 * findings every Lite BENCHMARK measured and no user ever did - the benchmark reporting a
 * stricter gate than the product runs, which is the inversion docs/AI_LITE_PLAN.md §1b names.
 * Both are WARNINGS, so wiring them cannot fail a generation that used to pass; it only stops
 * the product being blind to what the rounds are scored on.
 *
 * The two arguments AiStep does supply are always empty on this path - Lite takes no uploads
 * (`limits.logos: 0`) and cannot convert an import - so composing from here loses nothing but
 * the structured setup's own checks, which are re-applied.
 */
function liteValidator(spec: DesignSpec, ctx: GenerateContext | undefined): SpxValidator {
  const base: SpxValidator = (template) => productionSpxValidator(null, [], {
    singleLineFields: singleLineIdentityFields(spec, template),
    typeFloorCategory: spec.category ?? null,
    // The third is not spec-derived and is here for a different reason: Lite is the one path
    // that gets NO structural check at all, because that check needs an intent and Lite runs
    // no intent stage. Without this, nothing anywhere asks whether a Lite graphic's fields
    // reach the screen - and the 2026-08-08 round produced a frame where one did not.
    fieldPaints: true,
  })(template);
  return withSpecChecks(base, ctx?.spec) ?? base;
}

async function liteGroundedResult(
  prompt: string,
  context: GenerateContext,
  options: GenerateOptions | undefined,
  run: AiRunRecorder,
  priorSpec?: DesignSpec,
): Promise<AiTemplateChange> {
  options?.onProgress?.('Create with AI is designing your graphic…');
  const started = Date.now();
  const generated = await generateLiteDesign(prompt, context, priorSpec);
  const decision = generated.decision;
  if (decision.status !== 'ready') throw new LiteRequestError('generation_failed', 'Create with AI returned no design.');
  run.stage('lite-design-spec', started, undefined, generated.usage);
  run.managed('lite', generated.generationId);
  const spec = normalizeLiteSpec(decision.spec as DesignSpec, context.spec);
  const assembledAt = Date.now();
  try {
    // A skin riding the decision is TRIED first: the neutral canvas chassis restyled by
    // the model's bounded CSS, through the polish gate and the full injected validator.
    // Any failure reverts silently to the spec's own house chassis below — a skin can
    // decline to land, but it can never cost the user a working result.
    let change: AiTemplateChange | null = null;
    if (decision.skin) {
      options?.onProgress?.('Painting the canvas…');
      const skinStarted = Date.now();
      const skinned = await attemptLiteSkin(spec, decision.skin, context, (t) => validateWith(t, options, run));
      run.stage('lite-skin', skinStarted);
      if (skinned && !liteHoldFrameFindings(spec, skinned.validation, true).length) {
        run.diversity(skinned.diversity);
        change = {
          summary: spec.summary || 'An AI-designed look on the NoaCG canvas.',
          template: skinned.template,
          path: 'grounded+skin',
          validation: skinned.validation,
          spec,
        };
      }
    }
    // Lite compiles under its OWN declared contract, not the harness's adapt-first policy: its
    // schema allows sizeScale 0.7–1.4 and its prompt already carries the bottom-zone rule, so
    // moving either is a behaviour change its versioned benchmark has to re-baseline first
    // (docs/ADAPT_FIRST_PLAN.md §6.2). `profile` is stripped above, so this must be explicit.
    const fallbackIds = ((decision.spec as { fallbackVariantIds?: string[] }).fallbackVariantIds ?? [])
      .filter((variantId) => variantId !== spec.variantId);
    for (const variantId of [spec.variantId, ...fallbackIds]) {
      const candidate = { ...spec, variantId };
      const compiled = await groundedResult(
        candidate,
        context,
        { ...options, profile: undefined, validate: liteValidator(candidate, context) },
        run,
        // The chassis keeps the zone it was measured in; the model selects among references
        // but never authors placement or a parallel scene model.
        { keepChassisZone: true },
      );
      change = compiled;
      const validation = compiled.validation ?? validateTemplate(compiled.template);
      if (validation.ok && !liteHoldFrameFindings(candidate, validation).length) break;
    }
    if (!change) throw new Error('Create with AI had no compatible reference chassis to compile.');
    const finalValidation = change.validation ?? validateTemplate(change.template);
    const finalHoldFindings = liteHoldFrameFindings(change.spec ?? spec, finalValidation, change.path === 'grounded+skin');
    if (finalHoldFindings.length) {
      change = {
        ...change,
        validation: {
          ...finalValidation,
          ok: false,
          errors: [
            ...finalValidation.errors,
            ...finalHoldFindings.map((finding) => ({
              rule: `lite-hold-${finding}`,
              message: `The rendered hold frame failed Create with AI's ${finding} check.`,
            })),
          ],
        },
      };
    }
    const ruleCodes = change.validation?.errors.map((error) => error.rule) ?? [];
    await recordLiteOutcome({
      generationId: generated.generationId,
      action: change.validation?.ok === false ? 'validation-failed' : 'usable',
      resolvedCategory: spec.category,
      validationRuleCodes: ruleCodes,
      runtimeMs: Date.now() - assembledAt,
    }).catch(() => undefined);
    return { ...change, generationId: generated.generationId };
  } catch (error) {
    await recordLiteOutcome({
      generationId: generated.generationId,
      action: 'validation-failed',
      resolvedCategory: spec.category,
      validationRuleCodes: ['platform_compile'],
      runtimeMs: Date.now() - assembledAt,
    }).catch(() => undefined);
    throw error;
  }
}

/** Rebuild a GenerateContext from a template being refined (its images ride its assets). */
function contextFrom(template: SpxTemplate, outer?: GenerateContext): GenerateContext {
  const own = template.assets.filter((a) => a.path.startsWith('images/'));
  // The template's own images PLUS whatever the turn attached, deduped by path: a
  // re-assembly that dropped the new attachment would answer a request it was never told
  // about, and one that dropped the template's own would lose the logo it already carries.
  const attached = (outer?.images ?? []).filter((a) => !own.some((b) => b.path === a.path));
  return {
    images: [...own, ...attached],
    references: outer?.references,
    palette: outer?.palette ?? null,
    customFont: outer?.customFont,
    spec: outer?.spec,
    conversation: outer?.conversation,
    resolution: template.resolution,
    fps: template.fps,
  };
}

// ── Phase-A routing (docs/CREATIVE_MODE_PLAN.md §2, §8) ──────────────────────
//
// The intent stage runs BEFORE the catalog-anchored design call, so an off-catalog brief
// can route to the custom path honestly instead of being forced into the nearest chassis
// (the F1/F2 failure). The custom CODER itself is the frozen benchmark control: its
// prompts, its catalog example, and designNotes() below stay byte-identical - routing
// changes WHICH briefs reach it, never what it is given.

interface RoutedIntent {
  intent: StructuralIntent | null;
  route: RouteDecision | null;
  /** The proven designs an ADAPT-routed brief is chosen from. FULL_CATALOG on every other
   *  route, which is what keeps a CREATE generation's prompt byte-identical. */
  shortlist: Shortlist;
}

/**
 * Retrieval for an ADAPT-routed brief (docs/ADAPT_FIRST_PLAN.md §3, Stage R). Deterministic
 * and free: the ranking is the Browse storefront's engine and the structural filter is the one
 * anchor table, both reading inputs the intent stage already produced.
 *
 * A CREATE route keeps the full digest deliberately — the frozen benchmark control must not
 * change what it is shown (src/ai/AGENTS.md, plan §8), and a brief no catalog structure carries
 * has nothing to be shortlisted from anyway.
 */
function retrieveShortlist(
  prompt: string,
  intent: StructuralIntent | null,
  route: RouteDecision | null,
  context?: GenerateContext,
): Shortlist {
  if (route?.route !== 'adapt') return FULL_CATALOG;
  // Explicit adapt skips the intent call, so the only structure known is one the user pinned
  // in the structured setup. Nothing pinned means nothing to retrieve within.
  const pinned = aiCategoryById(context?.spec?.category)?.templateCategory;
  return shortlistFor(prompt, intent, { anchor: pinned ? `category:${pinned}` : null });
}

/**
 * The intent stage + deterministic route decision. Explicit adapt skips the model call
 * entirely (a catalog customization keeps today's one-call economy); explicit create is
 * honoured even when the intent call fails; auto falls back to today's flow (route null)
 * on any failure - a routing stage must never kill a generation.
 */
async function intentAndRoute(
  prompt: string,
  userContent: ContentBlock[],
  mode: GenerationMode,
  run: AiRunRecorder,
  options?: GenerateOptions,
  context?: GenerateContext,
): Promise<RoutedIntent> {
  const routed = (intent: StructuralIntent | null, route: RouteDecision | null): RoutedIntent => ({
    intent,
    route,
    shortlist: retrieveShortlist(prompt, intent, route, context),
  });
  if (mode === 'adapt') {
    return routed(null, { mode, route: 'adapt', reason: 'Explicit adapt request.' });
  }
  let intent: StructuralIntent;
  try {
    options?.onProgress?.('Reading the brief…');
    const t0 = Date.now();
    const result = await callModelDetailed({
      system: intentSystemPrompt(),
      messages: [{ role: 'user', content: userContent }],
      tool: INTENT_TOOL,
      maxTokens: 2000,
      // Per-stage model binding (plan §4): the intent stage is a small forced structured
      // call, the shape cheap open models answer at parity — so it runs on the provider's
      // `role:'fast'` model rather than the session's design/code model. Every stage after
      // it keeps the session route. The routing bench pins its model explicitly instead,
      // because its whole job is to measure a NAMED candidate in this role.
      modelRole: 'fast',
    });
    run.stage('intent', t0, result.model, result.usage);
    // An answer that never addressed the intent tool must not be normalized: it would read
    // as low-confidence 'novel' and silently route a catalog brief to the coder.
    if (!isIntentAnswer(result.output)) throw new Error('The intent call answered with the wrong tool.');
    intent = normalizeIntent(result.output);
  } catch {
    // No intent. Explicit create still routes create; auto falls through to today's flow.
    return routed(null, mode === 'create' ? { mode, route: 'create', reason: 'Explicit create request.' } : null);
  }
  const route = routeIntent(intent, mode);
  const result = routed(intent, route);
  run.routing({
    mode,
    route: route.route,
    reason: route.reason,
    intentKind: intent.kind + (intent.typeId ? `:${intent.typeId}` : intent.families?.length ? `:${intent.families[0]}` : ''),
    confidence: intent.confidence,
    originalityRequested: intent.originalityRequested,
    ...(result.shortlist.full
      ? {}
      : {
          shortlist: {
            size: result.shortlist.variants.length,
            anchor: result.shortlist.anchor ?? undefined,
            reason: result.shortlist.reason,
          },
        }),
  });
  return result;
}

/** Collapse `variantId`'s enum to the retrieved shortlist, so the schema allows exactly the
 *  designs the prompt showed. Shown-but-illegal is a chassis the model picks and
 *  `resolveVariant` silently swaps for another - the wrong graphic delivered as a success. */
function shortlistTool(base: ModelTool, shortlist: Shortlist): ModelTool {
  if (shortlist.full || !shortlist.variants.length) return base;
  return narrowVariantTool(base, shortlist.variants.map((v) => v.id));
}

/** The routed fit narrowing: only an explicit adapt or a CREATE decision collapses the
 *  design tool's fit enum; an auto->adapt decision leaves the tool untouched so catalog
 *  briefs run today's flow byte-identically. */
function routedSpecTool(base: ModelTool, route: RouteDecision | null): ModelTool {
  if (route?.route === 'create') return narrowFitTool(base, 'custom');
  if (route?.route === 'adapt' && route.mode === 'adapt') return narrowFitTool(base, 'catalog');
  return base;
}

/** Append the injected structural-satisfaction check's findings to the final validation.
 *  PARTS findings land as WARNINGS (plan §8: they never enter the frozen control's repair
 *  rounds; rigs and future arms read them). KIND findings (rule 'structural-kind') land as
 *  ERRORS (owner decision 2026-07-31, AI_PLATFORM_PLAN §16.3): a grounded assembly of the
 *  wrong graphic - a technically valid lower third for a stinger brief - fails closed and
 *  is surfaced as a failure the user can refine or regenerate, never delivered as a
 *  success. Grounded assemblies have no repair loop, so blocking changes no repair rounds.
 *
 *  Runs on BOTH routed paths. It first shipped on the custom path alone, which left the
 *  benchmark's most common defect unmeasured: a catalog-routed brief that comes back as the
 *  wrong catalog member (a stinger assembled as a lower third) was never asked whether it
 *  was the graphic requested. `change.spec.variantId` is what makes that answerable, and it
 *  is passed ONLY for grounded results: a free-form result is not the variant its spec
 *  names (the coder never ran variant.create()), so kind-checking it against that id would
 *  be a confident finding on a measurement that never happened - the custom path is
 *  measured by parts. */
async function withStructuralFindings(
  change: AiTemplateChange,
  intent: StructuralIntent | null,
  options: GenerateOptions | undefined,
  run: AiRunRecorder,
): Promise<AiTemplateChange> {
  if (!intent || !options?.structuralCheck) return change;
  try {
    const t0 = Date.now();
    const grounded = Boolean(change.path?.startsWith('grounded'));
    const findings = await options.structuralCheck(
      change.template,
      intent,
      grounded ? change.spec?.variantId : undefined,
    );
    run.stage('structural-check', t0);
    if (!findings.length) return change;
    const kind = findings.filter((f) => f.rule === STRUCTURAL_KIND_RULE);
    const parts = findings.filter((f) => f.rule !== STRUCTURAL_KIND_RULE);
    const validation = change.validation ?? { ok: true, errors: [], warnings: [] };
    return {
      ...change,
      validation: {
        ...validation,
        ok: validation.ok && kind.length === 0,
        errors: [...validation.errors, ...kind],
        warnings: [...validation.warnings, ...parts],
      },
    };
  } catch {
    return change; // the check is advisory - a check failure never costs the result
  }
}

/** The design stage's decisions, carried into the free-form coder as plain direction. */
function designNotes(spec: DesignSpec): string {
  return [
    'Design direction (decided in the design stage — follow it):',
    `- ${spec.reason}`,
    spec.motionCharacter ? `- Motion: ${spec.motionCharacter}` : null,
    spec.referenceSystem ? `- Reference system (read from the uploads): ${spec.referenceSystem}` : null,
    spec.flourish ? `- Signature: ${spec.flourish}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export const claudeProvider: AIProvider = {
  async generate(prompt, context, options) {
    return recorded('generate', async (run) => {
      if (options?.profile === 'lite') {
        if (!context) throw new LiteRequestError('invalid_request', 'Create with AI needs a generation context.');
        return liteGroundedResult(prompt, context, options, run);
      }
      const userContent: ContentBlock[] = [
        ...imageBlocks(context),
        { type: 'text', text: contextText(prompt, context) },
      ];

      // Stage 0 — the request mode + intent routing (plan §2). Auto with a catalog-fit
      // brief leaves everything below byte-identical to the pre-routing flow; the stage
      // exists so an off-catalog brief (or an explicit create) reaches the custom path
      // without the catalog-anchored design call deciding against it.
      const mode: GenerationMode = options?.mode ?? 'auto';
      const { intent, route, shortlist } = await intentAndRoute(prompt, userContent, mode, run, options, context);

      // Stage 1 — the design spec (the design decision; also the router when routing
      // above was advisory). A stage failure must never kill the generation: fall through
      // to the free-form path with no spec.
      options?.onProgress?.('Designing…');
      let spec: DesignSpec | null = null;
      try {
        const t0 = Date.now();
        const result = await callModelDetailed({
          system: specSystemPrompt(shortlist),
          messages: [{ role: 'user', content: userContent }],
          // A pinned user category narrows the tool schema itself — the model can only
          // route within the decision. The routed fit narrows the same way (plan §2).
          tool: shortlistTool(routedSpecTool(narrowedSpecTool(DESIGN_SPEC_TOOL, context?.spec), route), shortlist),
          maxTokens: 4000,
        });
        run.stage('design-spec', t0, result.model, result.usage);
        spec = result.output as DesignSpec;
        if (!Array.isArray(spec.lines)) spec.lines = [];
        // The user's structured decisions overwrite the model's — deterministically.
        spec = applySpecLocks(spec, context?.spec);
      } catch {
        // No spec — the free-form path below still serves the brief.
      }

      const forceCustom = route?.route === 'create';
      if (spec && spec.fit === 'catalog' && !forceCustom) {
        // Stage 2 — deterministic assembly through the real catalog assemblers: correct
        // by construction, panel- and timeline-editable like any wizard output.
        const grounded = await groundedResult(spec, context, options, run);
        const annotatedGrounded = {
          ...grounded,
          ...(intent ? { intent } : {}),
          ...(route ? { routing: route } : {}),
            ...(shortlist.full ? {} : { shortlist: shortlist.variants.map((v) => v.id) }),
        };
        // The catalog path is checked too: assembly is correct BY CONSTRUCTION, which says
        // nothing about whether the right thing was constructed.
        return withStructuralFindings(annotatedGrounded, intent, options, run);
      }

      // Custom route — the free-form coder, studying the NEAREST catalog design as its
      // canonical example and carrying the design stage's direction. THE FROZEN CONTROL
      // (plan §8): its inputs are exactly the pre-routing ones — routing decides which
      // briefs arrive here, never what the coder is shown.
      const exampleVariant = spec ? variantsFor(spec.category)[0] : undefined;
      const content: ContentBlock[] = spec
        ? [...userContent, { type: 'text', text: designNotes(spec) }]
        : userContent;
      const change = await generateValidated(content, context, undefined, options, run, exampleVariant);
      const annotated = {
        ...change,
        ...(intent ? { intent } : {}),
        ...(route ? { routing: route } : {}),
        ...(shortlist.full ? {} : { shortlist: shortlist.variants.map((v) => v.id) }),
      };
      return withStructuralFindings(annotated, intent, options, run);
    });
  },

  async generateRaw(prompt, context, options) {
    if (options?.profile === 'lite') {
      throw new LiteRequestError('unsupported_operation', 'Create with AI does not generate unrestricted template code.');
    }
    return recorded('generate', async (run) => {
      options?.onProgress?.('Generating…');
      const t0 = Date.now();
      const result = await callModelDetailed({
        system: RAW_SYSTEM,
        messages: [
          { role: 'user', content: [...imageBlocks(context), { type: 'text', text: contextText(prompt, context) }] },
        ],
        tool: TEMPLATE_TOOL,
      });
      run.stage('raw', t0, result.model, result.usage);
      const emitted = result.output as EmittedTemplate;
      const template = toTemplate(emitted, context);
      // Static validation only, for honest display — no bench, no repair: this path IS the
      // baseline the harness gets measured against.
      return { summary: emitted.summary, template, path: 'raw', validation: validateTemplate(template) };
    });
  },

  async generateAlternatives(prompt, context, options) {
    if (options?.profile === 'lite') return [await this.generate(prompt, context, options)];
    const run = startAiRun('generate');
    try {
      const userContent: ContentBlock[] = [
        ...imageBlocks(context),
        { type: 'text', text: contextText(prompt, context) },
      ];

      // Stage 0 — the same mode + intent routing as generate() (plan §2): the alternatives
      // call is the product's default path, so honest routing has to live here too.
      const mode: GenerationMode = options?.mode ?? 'auto';
      const { intent, route, shortlist } = await intentAndRoute(prompt, userContent, mode, run, options, context);

      // ONE design-stage call returns three distinct directions; each assembles like a
      // single harness generation (grounded deterministically, or the validated custom path).
      options?.onProgress?.('Designing three directions…');
      let specs: DesignSpec[] = [];
      try {
        const t0 = Date.now();
        const result = await callModelDetailed({
          system: specSystemPrompt(shortlist),
          messages: [{ role: 'user', content: userContent }],
          tool: shortlistTool(routedSpecTool(narrowedSpecTool(DESIGN_ALTERNATIVES_TOOL, context?.spec), route), shortlist),
          maxTokens: 8000,
        });
        run.stage('design-alternatives', t0, result.model, result.usage);
        const output = result.output as { alternatives?: DesignSpec[] };
        specs = (Array.isArray(output.alternatives) ? output.alternatives : []).slice(0, 3);
        // Each direction stays free where the user left freedom; each is pinned where not.
        specs = specs.map((s) => applySpecLocks({ ...s, lines: Array.isArray(s.lines) ? s.lines : [] }, context?.spec));
      } catch {
        specs = [];
      }

      const results: AiTemplateChange[] = [];
      const forceCustom = route?.route === 'create';
      for (const [i, spec] of specs.entries()) {
        options?.onProgress?.(`Building option ${i + 1} of ${specs.length}…`);
        if (spec.fit === 'catalog' && !forceCustom) {
          const grounded = await groundedResult(spec, context, options, run);
          const annotatedGrounded = {
            ...grounded,
            ...(intent ? { intent } : {}),
            ...(route ? { routing: route } : {}),
            ...(shortlist.full ? {} : { shortlist: shortlist.variants.map((v) => v.id) }),
          };
          results.push(await withStructuralFindings(annotatedGrounded, intent, options, run));
        } else {
          const change = await generateValidated(
            [...userContent, { type: 'text', text: designNotes(spec) }],
            context,
            undefined,
            options,
            run,
            variantsFor(spec.category)[0],
          );
          const annotated = {
            ...change,
            spec,
            ...(intent ? { intent } : {}),
            ...(route ? { routing: route } : {}),
            ...(shortlist.full ? {} : { shortlist: shortlist.variants.map((v) => v.id) }),
          };
          results.push(await withStructuralFindings(annotated, intent, options, run));
        }
      }
      // The design stage failing (or returning nothing) must not kill the generation:
      // fall back to one full harness run so the user still gets a result.
      if (!results.length) results.push(await this.generate(prompt, context, options));

      run.finish(
        results.every((r) => r.validation?.ok ?? true),
        results.flatMap((r) => r.validation?.errors.map((e) => e.rule) ?? []),
      );
      return results;
    } catch (e) {
      run.finish(false, ['exception']);
      throw e;
    }
  },

  async modify(prompt, template, context, options) {
    if (options?.profile === 'lite') {
      if (!context || !options.spec || !detectPrefix(template.html) || !parseAnimData(template.js)) {
        throw new LiteRequestError(
          'unsupported_operation',
          'Create with AI can refine only a graphic it designed. Create a new graphic for a structural change.',
        );
      }
      return recorded('modify', (run) => liteGroundedResult(prompt, contextFrom(template, context), options, run, options.spec));
    }
    // A grounded result refines at SPEC level while it is still house-shaped; anything
    // else (foreign imports, hand-edited code, custom builds) refines at code level.
    // An image attached to this turn does NOT force the code level: the design stage sees
    // it and routes to custom itself when the catalog has nowhere to put it (a logo slot
    // takes a mark; a full-frame still does not).
    if (options?.spec && detectPrefix(template.html) && parseAnimData(template.js)) {
      const spec = options.spec;
      return recorded('modify', (run) => specRefine(prompt, template, spec, context, options, run));
    }
    return modifyAs('modify', prompt, template, context, options);
  },

  async explain(code) {
    const text = (await callModel({
      system:
        'You are a patient broadcast-graphics coding teacher inside NoaCG Studio. ' +
        'Explain the given template code for a beginner: what it does, section by section, short and concrete. Plain text.',
      messages: [{ role: 'user', content: [{ type: 'text', text: code }] }],
      maxTokens: 1500,
    })) as string;
    return text;
  },

  async fix(template, options) {
    if (options?.profile === 'lite') {
      throw new LiteRequestError('platform_validation', 'Create with AI failed validation. This is a NoaCG platform defect and is not repaired with generated code.');
    }
    const validation = validateTemplate(template);
    const problems = validation.ok
      ? 'No validator errors — review the template for runtime bugs (replay-safety, missing ids) and fix what you find.'
      : validation.errors.map((e) => `- ${e.rule}: ${e.message}`).join('\n');
    return modifyAs('fix', `Fix these validation problems:\n${problems}`, template, undefined, options);
  },

  async makeSpxReady(template, options) {
    if (options?.profile === 'lite') {
      throw new LiteRequestError('unsupported_operation', 'Create with AI does not rewrite existing template code.');
    }
    return modifyAs(
      'make-ready',
      'Make this template fully SPX-ready: a complete SPXGCTemplateDefinition matching the DOM ' +
        '(every fN has exactly one element), global update/play/stop/next functions, relative asset ' +
        'paths only, and the standard external references (css/template.css, js/gsap.min.js, js/template.js).',
      template,
      undefined,
      options,
    );
  },

  async convertImport(prompt, imported, context, options) {
    if (options?.profile === 'lite') {
      throw new LiteRequestError('unsupported_operation', 'Create with AI does not convert imported templates.');
    }
    const request = prompt.trim() || 'Bring it fully up to the house standards.';
    return modifyAs(
      'convert',
      `This template was IMPORTED from the user's existing file — keep what it gets right ` +
        `(its content, its design intent, its working markup), and convert the rest to this ` +
        `tool's contracts: SPXGCTemplateDefinition + fN field mapping, the :root style vars, ` +
        `the marked ANIMATION region as the NOACG_ANIM data block with the standard ` +
        `interpreter, and relative asset paths only.\n\nRequest: ${request}`,
      imported,
      // The imported template brings its OWN resolution and assets; the context contributes
      // the conversation and anything attached to the request.
      context && { ...context, resolution: imported.resolution, fps: imported.fps },
      options,
    );
  },
};

/**
 * The PRE-HARNESS generation path, exported for scripts/ai-compare.mjs only: the house
 * system prompt + the lt01 example + the validated repair loop, with NO design-spec stage.
 * The app never calls this — it is the benchmark's stage-ablation arm, kept so the
 * harness's added value stays measurable against the previous product.
 */
export async function plainGenerate(
  prompt: string,
  context?: GenerateContext,
  options?: GenerateOptions,
): Promise<AiTemplateChange> {
  return recorded('generate', (run) =>
    generateValidated(
      [...imageBlocks(context), { type: 'text', text: contextText(prompt, context) }],
      context,
      undefined,
      options,
      run,
    ),
  );
}
