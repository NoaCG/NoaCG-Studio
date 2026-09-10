// The ONE grounded compile pipeline, shared by production and the Lite benchmark.
//
// NoaCG Lite's model call happens server-side (/api/ai/lite/generations); everything after
// the returned DesignSpec is deterministic browser code. Production (claudeProvider's
// grounded path) and the evaluation runners (scripts/ai-lite-*.mjs, loaded through the dev
// server) must compile a spec through the IDENTICAL sequence, or benchmark results stop
// describing the product. That is why the sequence lives here once and both sides import it:
// a benchmark-only compile path is the drift this module exists to make impossible.
// scripts/ai-lite-bench.test.mjs pins that claudeProvider has no second copy.

import { specToTemplate, type AssembleOptions, type DesignSpec } from '../designSpec';
import { applyDesignAdjustments } from '../designAdjust';
import { applyPolish } from '../polish';
import { applySpecLocks, applySpecOutPreset } from '../spec/specDesign';
import { demoteSpecFields, ensureSpecFonts } from '../spec/specValidate';
import { withSafetyChecks } from '../safety';
import { mergeAssetIntegrity } from '../assetIntegrity';
import {
  LITE_CATALOG,
  LITE_SINGLE_LINE_ROLES,
  liteSkinPatchErrors,
  liteTextHasVisibleGlyph,
  sanitizeLiteSkinPatch,
} from './contract';
import type { LiteDesignSpec, LiteLowerThirdLineRole, LiteSkinPatch } from './types';
import type { GenerateContext, SpxValidator } from '../provider';
import type { AiDiversity } from '../telemetry';
import type { SpxTemplate } from '../../model/types';
import { ltc01 } from '../../templates/lowerThirds/skinCanvas';
import type { ValidationResult } from '../../validation/validateTemplate';
import { validateTemplate } from '../../validation/validateTemplate';
import { typeFloorFor } from '../../validation/typeFloor';
import { benchTemplateRuntime, mergeResults } from '../../validation/runtimeBench';

export interface GroundedAssembly {
  template: SpxTemplate;
  /** What was actually used after clamping — telemetry's diversity record. */
  diversity: AiDiversity;
}

/**
 * Spec → template, exactly as production assembles it: real catalog assemblers, then the
 * spec's compositional parameters as deterministic overrides, then the user's own decisions
 * (uploaded fonts grounded as embedded assets, an explicit exit preset as real keyframes).
 */
export function assembleGroundedTemplate(
  spec: DesignSpec,
  ctx?: GenerateContext,
  /** Assembly policy — the skin canvas chassis override, and whether the chassis keeps the
   *  zone it was drawn for (the harness opts in; Lite does not — see AssembleOptions). */
  options?: AssembleOptions,
): GroundedAssembly {
  const assembled = specToTemplate(spec, ctx, options);
  const template = applySpecOutPreset(
    ensureSpecFonts(applyDesignAdjustments(assembled.template, spec), ctx?.spec),
    ctx?.spec,
  );
  return { template, diversity: assembled.diversity };
}

/**
 * The validator the app injects for AI results (AiStep): static validation + the live
 * runtime bench, wrapped in the safety screen and the as-is screen. Benchmark runs wire this
 * same composition, so "machine-valid" means the same thing in a report as it does in the
 * product.
 *
 * `protectedAssets` are the uploads the user marked "use it as it is" (model/imagePurpose.ts).
 * Passing none — every caller that has no uploads, and every benchmark run — costs one
 * comparison and changes nothing.
 */
/**
 * The extra bench questions only a caller holding a DESIGN DECISION can answer. Every one of
 * them is off by default, so a caller that passes none gets exactly the behaviour that shipped
 * before they existed. They are an options object rather than three more positional arguments
 * because they arrive together, from one place: `claudeProvider.liteValidator`.
 */
export interface ProductionBenchOptions {
  /** Field ids that carry IDENTITY and must not wrap - see `singleLineIdentityFields`. Empty
   *  for every caller that has no spec to read roles from, which is today's behaviour exactly. */
  singleLineFields?: readonly string[];
  /** Category whose type floor the RENDERED result is held to. Null keeps today's behaviour
   *  for every caller that has no category to read - the floor is opt-in, like the wrap check. */
  typeFloorCategory?: string | null;
  /** Drive every field to a sentinel and re-read the frame: which declared fields reach no
   *  pixels. It walks the machine's states as well as the settled default path, so a graphic
   *  with branches is a fair subject (validation/fieldPaint.ts). Still opt-in: a hand-written
   *  template may hide whatever it likes, and only a caller that OWNS the design can say a
   *  dark field is a defect. */
  fieldPaints?: boolean;
}

export function productionSpxValidator(
  source?: SpxTemplate | null,
  protectedAssets: string[] = [],
  bench: ProductionBenchOptions = {},
): SpxValidator {
  const base: SpxValidator = async (t) =>
    mergeResults(validateTemplate(t), await benchTemplateRuntime(t, {
      singleLineFields: bench.singleLineFields ?? [],
      ...(bench.typeFloorCategory ? { typeFloorPx: typeFloorFor(bench.typeFloorCategory) } : {}),
      ...(bench.fieldPaints ? { fieldPaints: true } : {}),
    }));
  const safe = withSafetyChecks(base, source ?? null);
  if (!protectedAssets.length) return safe;
  return async (t) => mergeAssetIntegrity(await safe(t), t, protectedAssets);
}

/**
 * Which of the assembled template's fields must render on one line, read off the spec's own
 * declared line ROLES (`LITE_SINGLE_LINE_ROLES`).
 *
 * The mapping is positional because the assemblers are: `spec.lines[i]` becomes the i-th
 * text-bearing DataField, which is the same binding `applySpecLocks` and the digest rely on. It
 * is derived from the ASSEMBLED template rather than assumed to be `f0`/`f1`, so a design whose
 * first field is a logo slot still lines up.
 */
export function singleLineIdentityFields(spec: DesignSpec, template: SpxTemplate): string[] {
  const textFields = template.fields.filter((f) => f.ftype === 'textfield' || f.ftype === 'textarea');
  // `role` is required on a LITE decision's lines and simply absent on a harness DesignSpec, so
  // it is read as optional rather than cast across: an absent role means "not a Lite result",
  // and the check then declares no fields and changes nothing. Widening DesignSpec to carry a
  // Lite-only field would be the other way to type this, and it would put a server contract's
  // vocabulary into the shared spec every other path also compiles.
  const roles = (Array.isArray(spec.lines) ? spec.lines : []) as readonly { role?: string }[];
  return textFields
    .filter((_f, i) => LITE_SINGLE_LINE_ROLES.has(roles[i]?.role as LiteLowerThirdLineRole))
    .map((f) => f.field);
}

/**
 * A Lite decision's server-validated spec, normalized the way liteGroundedResult does it
 * before assembly: catalog fit and no flourish are re-pinned (defense in depth over the
 * server's own semantic validation) and the user's structured setup wins via applySpecLocks.
 */
export function normalizeLiteSpec(raw: DesignSpec, userSpec?: GenerateContext['spec']): DesignSpec {
  return applySpecLocks(
    {
      ...raw,
      fit: 'catalog',
      flourish: null,
      lines: Array.isArray(raw.lines) ? raw.lines : [],
    } as DesignSpec,
    userSpec,
  );
}

// ── The skin path (skeleton + skin, revert on any failure) ───────────────────

/** The block heading the skin's override CSS lands under (the polish gate writes it). */
export const LITE_SKIN_MARKER =
  '/* ── Create with AI skin (AI-authored look — same contracts as the design CSS above) ── */';

export interface LiteSkinnedAssembly {
  template: SpxTemplate;
  validation: ValidationResult;
  diversity: AiDiversity;
}

/** Why a skin did not land — the eval's denominator for "how often do skins survive". */
export type LiteSkinRejection = 'patch' | 'gate' | 'validation';

export interface LiteSkinAttempt {
  assembly: LiteSkinnedAssembly | null;
  rejection?: LiteSkinRejection;
  /** The failing validation's rule codes when rejection === 'validation'. */
  rejectionRules?: string[];
}

/**
 * Try the skeleton-plus-skin assembly: compile the neutral Skin Canvas chassis through the
 * ordinary grounded sequence, apply the skin through the polish gate, validate. Any wall
 * tripping — an illegal patch, a gate rejection, or a failing validation — returns a null
 * assembly WITH the stage that refused it, and the caller REVERTS to the spec's own house
 * chassis. A skin can decline to land, but it can never make a Lite result worse.
 */
export async function attemptLiteSkinDetailed(
  spec: DesignSpec,
  skin: LiteSkinPatch,
  ctx: GenerateContext | undefined,
  validate: SpxValidator,
): Promise<LiteSkinAttempt> {
  // Sanitize again before the gate: the server already did, but this path also serves
  // benchmark runners and any future caller, and the strip is idempotent.
  const { patch } = sanitizeLiteSkinPatch(skin);
  if (!String(patch.css ?? '').trim() || liteSkinPatchErrors(patch).length) {
    return { assembly: null, rejection: 'patch' };
  }
  const { template, diversity } = assembleGroundedTemplate(spec, ctx, { variantOverride: ltc01 });
  const skinned = applyPolish(template, patch, LITE_SKIN_MARKER);
  if (!skinned) return { assembly: null, rejection: 'gate' };
  const validation = demoteSpecFields(await validate(skinned));
  return validation.ok
    ? { assembly: { template: skinned, validation, diversity } }
    : { assembly: null, rejection: 'validation', rejectionRules: validation.errors.map((e) => e.rule) };
}

/** The assembly-or-null shape the provider consumes (revert stays silent in production). */
export async function attemptLiteSkin(
  spec: DesignSpec,
  skin: LiteSkinPatch,
  ctx: GenerateContext | undefined,
  validate: SpxValidator,
): Promise<LiteSkinnedAssembly | null> {
  return (await attemptLiteSkinDetailed(spec, skin, ctx, validate)).assembly;
}

export interface LiteCompileResult {
  spec: DesignSpec;
  template: SpxTemplate;
  validation: ValidationResult;
  diversity: AiDiversity;
  /** True when the result is the skinned canvas; false = the spec's house chassis. */
  skinApplied: boolean;
  /** What happened to the skin: applied, no skin on the decision, or the revert's stage. */
  skinOutcome: 'applied' | 'none' | `rejected-${LiteSkinRejection}`;
  /** The failing validation's rule codes when skinOutcome === 'rejected-validation'. */
  skinRejectionRules?: string[];
  holdFindings: LiteHoldFinding[];
  attemptedVariantIds: string[];
}

export type LiteHoldFinding =
  | 'generic-default-panel'
  | 'weak-brief-fit'
  | 'overflow'
  | 'poor-contrast'
  | 'empty-field-sample';

/** Deterministic hold-frame verdict. Runtime findings own visible geometry and contrast; the
 * semantic checks catch a technically valid but generic or reference-mismatched adaptation. */
export function liteHoldFrameFindings(
  spec: DesignSpec,
  validation: ValidationResult,
  skinApplied = false,
): LiteHoldFinding[] {
  const findings = new Set<LiteHoldFinding>();
  const rules = [...validation.errors, ...validation.warnings].map((finding) => finding.rule.toLowerCase());
  if (rules.some((rule) => /overflow|outside|clip|line-wrap/.test(rule))) findings.add('overflow');
  if (rules.some((rule) => /contrast/.test(rule))) findings.add('poor-contrast');
  const lite = spec as unknown as Partial<LiteDesignSpec>;
  if (lite.lines?.some((line) => !liteTextHasVisibleGlyph(line.sample))) {
    findings.add('empty-field-sample');
  }
  if (!lite.styleIntent) return [...findings];
  const chosen = LITE_CATALOG.find((entry) => entry.variantId === spec.variantId);
  if (chosen) {
    const intent = lite.styleIntent;
    const matched = (Object.keys(intent) as (keyof typeof intent)[])
      .filter((axis) => (chosen.styleSignals[axis] as readonly string[]).includes(intent[axis] as string));
    if (matched.length < 2) findings.add('weak-brief-fit');
  }
  if (!skinApplied) {
    const treatmentCount = [spec.palette, spec.fontId, spec.typography, spec.shape, spec.density, spec.motionCharacter]
      .filter(Boolean).length;
    const distinctive = lite.styleIntent.era !== 'contemporary'
      || !['flat', 'screen'].includes(lite.styleIntent.material)
      || !['none', 'clean'].includes(lite.styleIntent.texture)
      || ['luxurious', 'playful', 'dramatic', 'technical'].includes(lite.styleIntent.mood);
    if (distinctive && treatmentCount < 2) findings.add('generic-default-panel');
  }
  return [...findings];
}

/**
 * The full deterministic half of a Lite generation: normalize, assemble, validate. This is
 * what the calibration, regression, and evaluation runners call — one function, the same
 * one production is built from. No repair loop by design: a grounded assembly failing its
 * own bench is a platform bug worth surfacing (src/ai/AGENTS.md).
 */
export async function compileLiteDecision(
  raw: DesignSpec,
  ctx: GenerateContext,
  /** A skin riding the decision: tried first, reverting to the house chassis on failure. */
  skin?: LiteSkinPatch,
): Promise<LiteCompileResult> {
  const spec = normalizeLiteSpec(raw, ctx.spec);
  const primaryVariantId = spec.variantId;
  if (!primaryVariantId) throw new Error('Create with AI returned no reference chassis.');
  let skinOutcome: LiteCompileResult['skinOutcome'] = 'none';
  let skinRejectionRules: string[] | undefined;
  if (skin) {
    const attempt = await attemptLiteSkinDetailed(spec, skin, ctx, productionSpxValidator());
    if (attempt.assembly) {
      const holdFindings = liteHoldFrameFindings(spec, attempt.assembly.validation, true);
      if (!holdFindings.length) {
        return {
          spec, ...attempt.assembly, skinApplied: true, skinOutcome: 'applied',
          holdFindings, attemptedVariantIds: [primaryVariantId],
        };
      }
    }
    skinOutcome = `rejected-${attempt.rejection ?? 'patch'}`;
    skinRejectionRules = attempt.rejectionRules;
  }
  // `keepChassisZone` mirrors production's `liteGroundedResult` exactly - the benchmark and the
  // product must not compile a spec differently, which is this module's whole reason to exist.
  const fallbackIds = ((raw as unknown as Partial<LiteDesignSpec>).fallbackVariantIds ?? [])
    .filter((id) => id !== primaryVariantId);
  const candidateIds = [primaryVariantId, ...fallbackIds];
  let last: Omit<LiteCompileResult, 'attemptedVariantIds'> | null = null;
  const attemptedVariantIds: string[] = [];
  for (const variantId of candidateIds) {
    const candidate = { ...spec, variantId };
    attemptedVariantIds.push(variantId);
    const { template, diversity } = assembleGroundedTemplate(candidate, ctx, { keepChassisZone: true });
    const validation = demoteSpecFields(
      await productionSpxValidator(null, [], {
        singleLineFields: singleLineIdentityFields(candidate, template),
        typeFloorCategory: candidate.category ?? null,
        fieldPaints: true,
      })(template),
    );
    const holdFindings = liteHoldFrameFindings(candidate, validation);
    last = {
      spec: candidate, template, validation, diversity,
      skinApplied: false, skinOutcome, holdFindings,
      ...(skinRejectionRules ? { skinRejectionRules } : {}),
    };
    if (validation.ok && !holdFindings.length) break;
  }
  if (!last) throw new Error('Create with AI has no reference chassis to compile.');
  if (last.holdFindings.length) {
    last.validation = {
      ...last.validation,
      ok: false,
      errors: [
        ...last.validation.errors,
        ...last.holdFindings.map((finding) => ({
          rule: `lite-hold-${finding}`,
          message: `The rendered hold frame failed Create with AI's ${finding} check.`,
        })),
      ],
    };
  }
  return { ...last, attemptedVariantIds };
}
