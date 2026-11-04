// The design-spec stage of the AI harness: the model emits a structured DESIGN SPEC (not
// code), and the platform assembles it through the real catalog assemblers — the same
// machine the wizard drives, so a grounded result is correct by construction and editable
// by every panel. The spec is also the ROUTER: `fit: 'custom'` sends briefs the catalog
// structurally can't carry to the free-form coder path.
//
// The spec deliberately carries real COMPOSITIONAL freedom (typography scale, density,
// alignment, shape language) beyond variant + palette — "same layout, different colours"
// is a named failure mode. Deterministic adjustments map those parameters onto the
// assembled code (src/ai/designAdjust.ts).

import type { ModelTool } from './modelGateway';
import type { GenerateContext } from './provider';
import {
  CATEGORIES,
  PALETTES,
  paletteById,
  resolveOptions,
  type AnimSpeed,
  type Palette,
  type AssemblerId,
  type TemplateVariant,
  type WizardOptions,
  type Zone9,
} from '../model/wizard';
import { EASINGS, type EasingId } from '../model/easings';
import { FONTS } from '../model/fonts';
import { CATALOG, variantById, variantsFor } from '../templates/catalog';
import type { SpxTemplate } from '../model/types';
import type { AiDiversity } from './telemetry';

// ── The spec ──────────────────────────────────────────────────────────────────

export interface SpecTypography {
  /** Heading:body size ratio (~1.4 quiet … ~2.4 dramatic). */
  scaleRatio?: number;
  /** Heading weight step. */
  headingWeight?: 'regular' | 'semibold' | 'bold' | 'black';
  /** Small-caps treatment of the kicker/label line, where the design has one. */
  kickerCase?: 'caps' | 'as-written';
  /** Letterspacing character. */
  tracking?: 'tight' | 'normal' | 'wide';
}

export interface SpecShape {
  corner?: 'sharp' | 'soft' | 'round';
  /** The accent element's form, where the design has one. */
  accentForm?: 'bar' | 'hairline' | 'block' | 'none';
  panel?: 'solid' | 'translucent' | 'outline' | 'none';
}

export interface DesignSpec {
  /** The route: 'catalog' when a listed design family carries the brief's STRUCTURE. */
  fit: 'catalog' | 'custom';
  /** One sentence: why this route (and this design family). */
  reason: string;
  name: string;
  summary: string;
  category: AssemblerId;
  /** The chassis (a catalog design id, e.g. "lt07") — a starting point, not a skin. */
  variantId?: string;
  /** The operator's visible text lines (1-3): label + realistic sample. */
  lines: { title: string; sample: string }[];
  /**
   * Values for the chassis's non-line fields, by the graphic TYPE's logical key - which answer
   * a quiz marks correct, how long a countdown runs, a live poll's options. Lines are what the
   * graphic SAYS; this is the rest of what makes it the graphic that was asked for, and without
   * it a generated quiz carries the right question and still marks the chassis's own default
   * row correct.
   *
   * A LIST of pairs rather than a map because it crosses a model boundary: a JSON Schema with
   * `additionalProperties: false` cannot describe an open key set, and the alternative - naming
   * every legal key of every type as a schema property - is a contract that has to be rewritten
   * for each category the profile widens to. `specToTemplate` folds it into the map
   * `WizardOptions.content` wants. Illegal keys and values are dropped at compile, never
   * refused: the platform owns correctness (model/wizard.ts).
   */
  content?: { key: string; value: string }[];
  extraFields?: { title: string; ftype: 'textfield' | 'textarea' | 'number' | 'filelist'; value: string }[];
  /** Place the first uploaded image into the design's logo slot. */
  useLogoSlot?: boolean;
  zone?: Zone9;
  /** A curated palette id — or a bespoke palette when the brief/references demand one. */
  paletteId?: string;
  palette?: { accent: string; text: string; textDim: string; panel: string };
  fontId?: string;
  /** Overall size (0.85 compact … 1.2 large). */
  sizeScale?: number;
  animation?: { presetId?: string; easing?: string; speed?: number; steps?: boolean };
  /** One line: how the motion should support the reading order. */
  motionCharacter?: string;
  // Compositional parameters — deterministic freedom beyond the chassis defaults.
  typography?: SpecTypography;
  density?: 'airy' | 'standard' | 'compact';
  alignment?: 'left' | 'center' | 'right';
  shape?: SpecShape;
  /**
   * When the user uploaded references: the underlying SYSTEM read from them — grid,
   * hierarchy, spacing rhythm, proportions, shape language, colour balance, density,
   * motion cues. References outweigh generic guidance.
   */
  referenceSystem?: string;
  /** A brief for the bounded polish pass — ONLY what the parameters above can't express. */
  flourish?: string | null;
}

// ── The forced tool ───────────────────────────────────────────────────────────

const ZONES: Zone9[] = [
  'top-left', 'top-center', 'top-right',
  'mid-left', 'mid-center', 'mid-right',
  'bottom-left', 'bottom-center', 'bottom-right',
];

const allVariantIds = (): string[] => Object.values(CATALOG).flatMap((list) => (list ?? []).map((v) => v.id));

/** The one spec schema, shared by the single-spec and three-alternatives tools. */
const SPEC_INPUT_SCHEMA: Record<string, unknown> = {
  type: 'object',
    required: ['fit', 'reason', 'name', 'summary', 'category', 'lines'],
    additionalProperties: false,
    properties: {
      fit: {
        type: 'string',
        enum: ['catalog', 'custom'],
        description:
          'catalog when a listed design family can carry the STRUCTURE of the brief — styling ' +
          'differences never disqualify (express them in the design parameters and flourish). ' +
          'custom when the brief calls for a structure or composition no listed family expresses ' +
          '(a novel layout, an unlisted graphic kind, a composition that would be forced into the ' +
          'wrong shape). custom is a genuine creative route, not a failure.',
      },
      reason: { type: 'string', description: 'One sentence: why this route and this design family.' },
      name: { type: 'string', description: 'Short template name, e.g. "Election Strap".' },
      summary: { type: 'string', description: 'One sentence describing the design for the user.' },
      category: { type: 'string', enum: CATEGORIES.map((c) => c.id) },
      variantId: {
        type: 'string',
        enum: allVariantIds(),
        description: 'REQUIRED when fit=catalog: the chassis design id from the catalog listing.',
      },
      lines: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        description: "The visible text lines: operator label + a realistic sample from the brief's world.",
        items: {
          type: 'object',
          required: ['title', 'sample'],
          additionalProperties: false,
          properties: { title: { type: 'string' }, sample: { type: 'string' } },
        },
      },
      extraFields: {
        type: 'array',
        maxItems: 4,
        description: 'Extra non-visual operator fields (a number, an image pick, long text).',
        items: {
          type: 'object',
          required: ['title', 'ftype', 'value'],
          additionalProperties: false,
          properties: {
            title: { type: 'string' },
            ftype: { type: 'string', enum: ['textfield', 'textarea', 'number', 'filelist'] },
            value: { type: 'string' },
          },
        },
      },
      useLogoSlot: { type: 'boolean', description: 'Place the first uploaded image into the logo slot.' },
      zone: { type: 'string', enum: ZONES },
      paletteId: { type: 'string', enum: PALETTES.map((p) => p.id) },
      palette: {
        type: 'object',
        description:
          'A bespoke palette when the brief or references demand exact colours (otherwise pick a paletteId). ' +
          'One accent + a neutral system; keep text contrast broadcast-safe.',
        required: ['accent', 'text', 'textDim', 'panel'],
        additionalProperties: false,
        properties: {
          accent: { type: 'string' }, text: { type: 'string' }, textDim: { type: 'string' }, panel: { type: 'string' },
        },
      },
      fontId: { type: 'string', enum: FONTS.map((f) => f.id) },
      sizeScale: {
        type: 'number',
        minimum: 0.85,
        maximum: 1.2,
        description: 'Overall size multiplier, 0.85 compact … 1.2 large.',
      },
      animation: {
        type: 'object',
        additionalProperties: false,
        properties: {
          presetId: { type: 'string', description: "One of the chassis's listed motion presets." },
          easing: { type: 'string', enum: [...EASINGS.map((e) => e.id as string), 'auto'] },
          // BOUNDS, NOT AN ENUM: Gemini refuses any enum that is not of type string ("For
          // schema with enum values, schema type should be STRING", #2022, #2077), and a user's
          // own Google key or a `google/*` gateway model receives this tool. specToTemplate
          // keeps only 0.75, 1 and 1.5 and drops anything else, so nothing is lost - the same
          // fix Lite's schema carries (src/ai/lite/contract.ts).
          speed: {
            type: 'number',
            minimum: 0.75,
            maximum: 1.5,
            description: 'Motion speed. Use exactly 0.75 (slower), 1 (default), or 1.5 (faster); any other value is ignored.',
          },
          steps: { type: 'boolean', description: 'Reveal further lines on the operator\'s Continue press.' },
        },
      },
      motionCharacter: { type: 'string', description: 'One line: how motion supports the reading order.' },
      typography: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // The range lives in the description and the clamp, NOT as `minimum`/`maximum` - the
          // gateway rejects an out-of-range number, and on a clamped field that spends one of
          // two attempts to achieve what the clamp does for free (lite/contract.ts carries the
          // full reasoning). The old wording also had the scale backwards: measured across the
          // six audited lower thirds, the designs author 2.0-2.85, so a LOW ratio is the
          // dramatic one - it enlarges the body line toward the heading, which
          // `applyDesignAdjustments` now caps at the authored size (docs/AI_LITE_PLAN.md §1a).
          scaleRatio: {
            type: 'number',
            description: 'Heading:body size ratio, 1.2-2.6 (values outside it clamp). The catalog '
              + 'authors 2.0-2.85; lower tightens the gap, and the body line is never enlarged '
              + 'past the size its design authored.',
          },
          headingWeight: { type: 'string', enum: ['regular', 'semibold', 'bold', 'black'] },
          kickerCase: { type: 'string', enum: ['caps', 'as-written'] },
          tracking: { type: 'string', enum: ['tight', 'normal', 'wide'] },
        },
      },
      density: { type: 'string', enum: ['airy', 'standard', 'compact'], description: 'Padding/spacing character.' },
      alignment: { type: 'string', enum: ['left', 'center', 'right'] },
      shape: {
        type: 'object',
        additionalProperties: false,
        properties: {
          corner: { type: 'string', enum: ['sharp', 'soft', 'round'] },
          accentForm: { type: 'string', enum: ['bar', 'hairline', 'block', 'none'] },
          panel: { type: 'string', enum: ['solid', 'translucent', 'outline', 'none'] },
        },
      },
      referenceSystem: {
        type: 'string',
        description:
          'Only when references were uploaded: the SYSTEM read from them (grid, hierarchy, spacing ' +
          'rhythm, proportions, shape language, colour balance, density, motion cues). References ' +
          'outweigh generic guidance — analyse the system, never copy surface details.',
      },
      flourish: {
        type: ['string', 'null'],
        description:
          'ONE visual signature for the polish pass, only when the parameters above cannot express ' +
          'the intent (a gradient edge, a slanted accent). null when they can.',
      },
    },
};

export const DESIGN_SPEC_TOOL: ModelTool = {
  name: 'emit_design_spec',
  description:
    'Return the design decision for the brief: the route (catalog chassis vs custom build) plus ' +
    'every design parameter. The platform assembles catalog specs deterministically.',
  input_schema: SPEC_INPUT_SCHEMA,
};

/** The harness generates THREE alternatives per brief — one call, three distinct directions. */
export const DESIGN_ALTERNATIVES_TOOL: ModelTool = {
  name: 'emit_design_alternatives',
  description:
    'Return THREE genuinely different design directions for the brief. Each is a complete design ' +
    'spec; they must differ in real decisions (chassis family, composition, typography, density, ' +
    'motion character, palette) — never one design with three tints. The platform assembles each.',
  input_schema: {
    type: 'object',
    required: ['alternatives'],
    additionalProperties: false,
    properties: {
      alternatives: {
        type: 'array',
        minItems: 3,
        maxItems: 3,
        items: SPEC_INPUT_SCHEMA,
      },
    },
  },
};

/**
 * Collapse `variantId`'s enum to the retrieved shortlist - the same schema-narrowing mechanism
 * `narrowFitTool` and `narrowedSpecTool` already use, so the model chooses WITHIN a decision the
 * platform made instead of being asked to re-make it. A listing the prompt shows and an enum the
 * schema allows must be the same set: shown-but-illegal is a chassis the model picks and
 * `resolveVariant` silently swaps, which is a wrong graphic delivered as a success.
 */
export function narrowVariantTool(base: ModelTool, ids: readonly string[]): ModelTool {
  if (!ids.length) return base;
  const tool = JSON.parse(JSON.stringify(base)) as ModelTool;
  const root = tool.input_schema as { properties?: Record<string, unknown> };
  const alts = root.properties?.alternatives as { items?: { properties?: Record<string, unknown> } } | undefined;
  const schemas = alts?.items?.properties ? [alts.items.properties] : root.properties ? [root.properties] : [];
  for (const props of schemas) {
    const variantProp = props.variantId as { enum?: string[] } | undefined;
    if (variantProp) variantProp.enum = [...ids];
  }
  return tool;
}

// ── The catalog digest (the spec prompt's world) ──────────────────────────────

/**
 * One compact listing of what the platform can assemble, for the system prompt.
 *
 * `only` is the RETRIEVED SHORTLIST (src/ai/retrieval.ts): the proven designs a brief was
 * matched to, in rank order. The full listing is 430 variants and ~20,300 tokens, and asking
 * the cheapest model in the product to find one design in it is the retrieval problem the
 * adapt-first pivot exists to fix (docs/ADAPT_FIRST_PLAN.md §1.4). Passing nothing keeps the
 * full listing byte-identical, which is what a CREATE-routed generation still gets.
 */
export function catalogDigest(only?: readonly TemplateVariant[]): string {
  const lines: string[] = [];
  const shortlist = only?.length ? only : null;
  if (shortlist) {
    lines.push(
      'These are the closest PROVEN designs for this brief, already ranked. Adapt one of them:',
      '',
    );
  }
  for (const cat of CATEGORIES) {
    const variants = (shortlist ?? variantsFor(cat.id)).filter((v) => v.category === cat.id);
    if (!variants.length) continue;
    lines.push(`### ${cat.name} (category: ${cat.id}) — ${cat.description}`);
    for (const v of variants) {
      const bits = [
        `${v.maxLines} line${v.maxLines > 1 ? 's' : ''}`,
        v.logo === 'built-in' ? 'logo slot (always)' : v.logo === 'optional' ? 'logo slot (optional)' : null,
        `motion: ${v.animationPresets.join(' | ')}`,
      ].filter(Boolean);
      lines.push(`- ${v.id} "${v.name}" [${v.styleTag}] — ${v.description} (${bits.join('; ')})`);
    }
  }
  lines.push(
    '',
    `Palettes: ${PALETTES.map((p) => `${p.id} (${p.name}: accent ${p.accent})`).join(', ')}.`,
    `Fonts: ${FONTS.map((f) => `${f.id} (${f.family} — ${f.blurb})`).join(', ')}.`,
    `Zones: ${ZONES.join(', ')}.`,
    `Easings: ${EASINGS.map((e) => e.id).join(', ')} (auto = the motion preset's hand-tuned pair).`,
  );
  return lines.join('\n');
}

// ── Deterministic assembly with clamps ────────────────────────────────────────

const clampNumber = (v: number | undefined, min: number, max: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : undefined;

/** A design can carry the user's logo when it has a slot built in, or offers one. */
const canTakeLogo = (v: TemplateVariant): boolean => v.logo !== 'none';

/** Pick the best chassis when the spec's variantId is missing or wrong (never fail). */
function resolveVariant(spec: DesignSpec, wantsLogo: boolean): TemplateVariant {
  const direct = spec.variantId ? variantById(spec.variantId) : undefined;
  if (direct && direct.category === spec.category) return direct;
  const pool = variantsFor(spec.category);
  const fallback = pool.length ? pool : variantsFor('lower-third');
  if (wantsLogo) {
    const withLogo = fallback.find(canTakeLogo);
    if (withLogo) return withLogo;
  }
  return direct ?? fallback[0];
}

export interface AssembledSpec {
  template: SpxTemplate;
  variant: TemplateVariant;
  /** What was actually used after clamping — telemetry's diversity record. */
  diversity: AiDiversity;
}

export interface AssembleOptions {
  /**
   * Assemble THIS variant instead of resolving one from the catalog — the Lite skin path's
   * seam: its neutral canvas chassis is deliberately not in the browse catalog.
   */
  variantOverride?: TemplateVariant;
  /**
   * **The chassis keeps the zone it was drawn for.** `spec.zone` is ignored and the design's
   * own `defaultZone` is used.
   *
   * Measured, not assumed (docs/ADAPT_FIRST_PLAN.md §1.1): across 89 catalog lower thirds the
   * rendered side agrees with the declared zone on 89 of 89, 88 sit in the bottom band, and 87
   * sit at exactly 119px from the bottom edge. The catalog ships left-, right- and centre-drawn
   * designs as SEPARATE members precisely because re-siding a strap means re-siding its accent
   * — `lowerThirds/index.ts` says so — so moving a design to a zone its author did not draw it
   * for is the "a lower third that anchors bottom-centre has stopped being one" defect the
   * 2026-08-02 review named. Placement is expressed by picking a differently-anchored member,
   * which retrieval now puts in front of the model, and by the Style panel afterwards.
   *
   * Off by default: NoaCG Lite is a versioned server-owned profile that carries this rule as a
   * prompt instruction and cannot change behaviour without a paid re-baseline (ADAPT_FIRST_PLAN
   * §6.2), so the harness opts in and Lite does not.
   */
  keepChassisZone?: boolean;
  /**
   * The legal `sizeScale` range. Defaults to the permissive one every caller has always had,
   * because the bounds belong to the SCHEMA the spec was authored against and there are two:
   * the harness's design tool says "0.85 compact … 1.2 large", NoaCG Lite's server-owned
   * contract declares 0.7–1.4 (`lite/contract.ts`). Clamping every caller to the harness's
   * numbers told the Lite model 1.35 was legal, accepted it in server validation, and then
   * discarded it at compile - the same shown-but-illegal mismatch `narrowVariantTool` exists
   * to prevent, one field over.
   */
  sizeScaleRange?: [number, number];
}

/**
 * Spec + context → a guaranteed-valid template through the REAL catalog assemblers.
 * Every out-of-range value CLAMPS to the nearest legal one instead of failing — the
 * platform owns correctness, the spec owns intent.
 */
export function specToTemplate(
  spec: DesignSpec,
  ctx?: GenerateContext,
  assembly?: AssembleOptions,
): AssembledSpec {
  const opts = assembly ?? {};
  const wantsLogo = Boolean(spec.useLogoSlot && ctx?.images?.length);
  const variant = opts.variantOverride ?? resolveVariant(spec, wantsLogo);

  // Palette precedence: the project brand (ctx) wins, then a bespoke spec palette, then a
  // curated palette id, then the chassis default (via resolveOptions).
  let palette: Palette | undefined = ctx?.palette ?? undefined;
  if (!palette && spec.palette) {
    palette = {
      id: 'ai-custom',
      name: 'Brief palette',
      styleTags: [variant.styleTag],
      accent: spec.palette.accent,
      text: spec.palette.text,
      textDim: spec.palette.textDim,
      panel: spec.palette.panel,
    };
  }
  if (!palette && spec.paletteId) palette = paletteById(spec.paletteId);

  const presetOk = spec.animation?.presetId && variant.animationPresets.includes(spec.animation.presetId as never);
  const easingOk = spec.animation?.easing && EASINGS.some((e) => e.id === spec.animation?.easing);
  const speed: AnimSpeed | undefined =
    spec.animation?.speed === 0.75 || spec.animation?.speed === 1.5 ? spec.animation.speed : spec.animation?.speed === 1 ? 1 : undefined;

  const lines = (spec.lines ?? [])
    .filter((l) => l && typeof l.title === 'string' && typeof l.sample === 'string' && l.title.trim())
    .slice(0, variant.maxLines);

  const options: WizardOptions = {
    resolution: ctx?.resolution,
    fps: ctx?.fps,
    lines: lines.length ? lines : undefined,
    extraFields: (spec.extraFields ?? []).filter((f) =>
      ['textfield', 'textarea', 'number', 'filelist'].includes(f.ftype),
    ),
    // The pairs become the map the assembler wants; a later pair wins, and the compile clamps
    // every value against the type's own declaration (a type-compiled chassis) or ignores the
    // whole map (a hand-written one, which declares no logical keys to write against).
    ...(spec.content?.length
      ? {
          content: Object.fromEntries(
            spec.content
              .filter((entry) => entry && typeof entry.key === 'string' && entry.key.trim())
              .map((entry) => [entry.key.trim(), typeof entry.value === 'string' ? entry.value : String(entry.value ?? '')]),
          ),
        }
      : {}),
    palette,
    fontId: FONTS.some((f) => f.id === spec.fontId) ? spec.fontId : undefined,
    // The user's uploaded font wins over any font id (WizardOptions' own precedence rule).
    customFont: ctx?.customFont,
    sizeScale: clampNumber(spec.sizeScale, ...(opts.sizeScaleRange ?? [0.7, 1.4])),
    zone: !opts.keepChassisZone && ZONES.includes(spec.zone as Zone9) ? spec.zone : undefined,
    animation: {
      ...(presetOk ? { presetId: spec.animation?.presetId as never } : {}),
      ...(easingOk ? { easing: spec.animation?.easing as EasingId } : {}),
      ...(speed ? { speed } : {}),
      ...(typeof spec.animation?.steps === 'boolean' ? { steps: spec.animation.steps } : {}),
    },
    importedImages: ctx?.images ?? [],
    // The logo capability decides what a spec's useLogoSlot can actually do: a 'built-in'
    // design always has its slot, an 'optional' one only emits it when enabled, and a
    // 'none' design gets neither (the image still rides along as a project asset).
    ...(wantsLogo && canTakeLogo(variant)
      ? {
          logoEnabled: true,
          logoAssetPath: ctx?.images[0]?.path,
        }
      : variant.logo === 'optional'
        ? { logoEnabled: false }
        : {}),
  };

  const template = variant.create(options);
  const named: SpxTemplate = spec.name ? { ...template, name: spec.name } : template;

  // Record what was ACTUALLY used (post-clamp) so diversity metrics reflect reality.
  const resolved = resolveOptions(variant, options);
  const diversity: AiDiversity = {
    variantId: variant.id,
    category: variant.category,
    presetId: resolved.animation.presetId,
    paletteId: resolved.palette.id,
    zone: resolved.zone,
    ...(spec.density ? { density: spec.density } : {}),
    ...(spec.typography
      ? {
          typography: [
            spec.typography.scaleRatio ? `ratio ${spec.typography.scaleRatio}` : null,
            spec.typography.headingWeight,
            spec.typography.tracking ? `${spec.typography.tracking} tracking` : null,
          ]
            .filter(Boolean)
            .join(', '),
        }
      : {}),
  };

  return { template: named, variant, diversity };
}
