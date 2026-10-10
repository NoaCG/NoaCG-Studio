// The category-generic assembler: every "standard contract" category (lower thirds, info
// cards, …) is the same machine with a different class prefix + structure comment + width cap.
// A category module defines its CategorySpec once; variants stay tiny design builders.

import type { SpxField, SpxTemplate, TemplateType, Resolution } from '../../model/types';
import { definitionScriptBlock, replaceDefinitionInHtml } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';
import {
  fieldsFromOptions,
  resolveOptions,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeMaxTextWidth,
  computeScale,
  documentHtml,
  maxTextWidthCss,
  stageBoxCss,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  runtimeJs,
  zoneCssText,
} from './base';
import { applyLogoSlot, designHasLogoSlot } from './logoSlot';
import { stageExtraJs } from './stageFit';
import { presetById, type PresetConfig } from '../lowerThirds/animPresets';
import { importAnimData } from '../../blocks/animImport';
import type { AnimData } from '../../blocks/animData';
import { spxSteps } from '../../blocks/animMachine';
import { replaceRegionWithAnimData } from './animRuntime';

export interface StandardDesign {
  /** Inner HTML of the .<prefix> root (accent + box with masked lines). */
  html: string;
  /** Variant-specific CSS. All colors via the :root vars, sizes via calc(*var(--scale)). */
  css: string;
  /** Whether the design includes a .<prefix>-accent element. */
  hasAccent: boolean;
  /**
   * THE STAGE WIDTH, in px at 1080p: the room this design was drawn for (see
   * `stageBoxCss` in shared/base.ts for the whole contract).
   *
   * Declaring one turns the panel from a box that hugs the operator's text into a box the
   * text lives inside. Right for a BOARD - a card, a notice, a warning strip - which is on
   * air with different content all evening. Wrong for a NAMEPLATE, where a strap cut to the
   * guest's name IS the broadcast convention, so lower thirds, corner bugs and credits leave
   * it unset and keep hugging.
   */
  stageWidth?: number;
  /**
   * Fields the DESIGN owns beyond the wizard lines — e.g. an image field ("filelist")
   * bound to an <img id="fN"> logo slot. Appended after the line/extra fields.
   */
  extraFields?: SpxField[];
  /**
   * Set when steps mode (SPX Continue) is semantically meaningless for the design —
   * e.g. a versus card whose lines are simultaneous columns, not a reveal sequence.
   * The wizard's steps flag is then ignored for this variant.
   */
  disableSteps?: boolean;
  /**
   * Extra runtime JS the design owns (e.g. a live clock painter). Emitted BEFORE the
   * marked ANIMATION region — same doctrine as infographics — so the Motion panel can
   * never rewrite it. Any load-time DOM work in it must use the DOM-ready guard
   * (template.js loads in <head> in exported packages).
   */
  runtimeExtraJs?: string;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt — DESIGN_LANGUAGE §8's own rule
   * is "reuse the exact token values, don't improvise new ones per category" — so the goal
   * for this map is to be empty, and its size is the metric.
   */
  tokens?: TokenOverrides;
}

export interface StandardMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

export interface CategorySpec {
  type: TemplateType;
  /** Class prefix for the structure contract ('lower-third', 'info-card', …). */
  prefix: string;
  /** One-line body comment describing the root element. */
  rootComment: string;
  /** The auto-fit width cap for this category (cards may be wider than straps). */
  maxTextWidth?: (res: Resolution) => number;
  /** Timeline v2: emit the marked region as the NOACG_ANIM data block + interpreter
   *  instead of legacy choreography — categories flip one by one (lower thirds first).
   *  The preset still authors the motion; the parity-proven importer converts its emit. */
  dataRegion?: boolean;
}

/**
 * Timeline v2: convert a freshly assembled template's legacy ANIMATION region into the
 * NOACG_ANIM data block + interpreter (the golden parity harness pins the two as
 * identical). Only the marked region changes — category-owned runtime around it (score
 * pops, clock painters) is untouched. A conversion failure keeps the legacy emit:
 * never a broken template.
 *
 * `refine` is the seam for a step the legacy region cannot express. The importer builds a
 * middle step out of a » press (the old stepGroups block), so a category whose Continue does
 * something else — the quiz's answer reveal, which is a lifecycle CALL, not a reveal group —
 * has no legacy shape to be imported from. Rather than teach the legacy model a step kind
 * Phase 8 will delete, such a category authors that step directly as data here, on top of the
 * imported choreography.
 */
export function convertToDataRegion(
  template: SpxTemplate,
  refine?: (data: AnimData) => AnimData,
): SpxTemplate {
  const imported = importAnimData(template);
  const data = imported && refine ? refine(imported) : imported;
  const converted = data ? replaceRegionWithAnimData(template.js, data) : null;
  if (converted && data) {
    template.js = converted;
    // The SPX steps count is DERIVED — one rule, one function (blocks/animMachine spxSteps).
    // baseSettings has to guess it before the animation data exists (from the line count and
    // the steps flag); here the data is real, so this is where the guess becomes the truth.
    // A refine that adds or removes a step can therefore never ship a wrong count.
    const steps = String(spxSteps(data));
    if (template.settings.steps !== steps) {
      template.settings = { ...template.settings, steps };
      template.html = replaceDefinitionInHtml(template.html, template.settings, template.fields);
    }
  }
  return template;
}

/**
 * Compose refinements left to right. THE RULE: a refinement that adds or removes a STEP must
 * run before one that reads the step list — above all the machine compiler, which derives its
 * default path from the final steps and would otherwise bind a path of the wrong length.
 */
export function composeRefine(
  ...fns: Array<((data: AnimData) => AnimData) | undefined>
): ((data: AnimData) => AnimData) | undefined {
  const real = fns.filter((f): f is (data: AnimData) => AnimData => !!f);
  if (real.length === 0) return undefined;
  return (data) => real.reduce((acc, fn) => fn(acc), data);
}

/** Class name for the Nth line of a category (0 = heading/name, 1 = title/body, 2+ = extra). */
export function lineClassFor(prefix: string, index: number): string {
  return [`${prefix}-name`, `${prefix}-title`, `${prefix}-extra`][index] ?? `${prefix}-extra`;
}

/**
 * ONE mask-wrapped line with a class the DESIGN chose.
 *
 * `lineMasksFor` below walks the whole line list through the generic name/title/extra ladder,
 * which is right for a design whose lines are a heading and its body. It is wrong for a design
 * whose lines are semantically DIFFERENT things — a product name, its price, the struck-through
 * previous price, a promo code: those need their own classes to be styled apart, and the ladder
 * gives the third line and every line after it the same `-extra`. Composing the masks one at a
 * time is how such a design keeps the structure contract (a `<prefix>-mask` parent, so the line
 * is a real registry part with the mask reveal channel) while naming each line for what it is.
 *
 * The line is only emitted when the operator kept it: `o.lines` is what the wizard resolved, so
 * a design that offers five slots and is used with three must render three.
 */
export function maskLine(
  prefix: string,
  o: ResolvedOptions,
  index: number,
  cls: string,
  indent = '      ',
): string {
  const line = o.lines[index];
  if (!line) return '';
  return (
    `${indent}<!-- ${line.title} (f${index}) — SPX writes this field's value straight into the element. -->\n` +
    `${indent}<div class="${prefix}-mask"><span id="f${index}" class="${cls}">${line.sample}</span></div>`
  );
}

/** Join the emitted mask lines of `maskLine`, dropping the ones the options left out. */
export function maskLines(parts: string[]): string {
  return parts.filter((p) => p !== '').join('\n');
}

/**
 * The `fN` id of a design's OWN extra field (a product shot, a QR code, a sponsor slot).
 *
 * `assembleStandard` builds the field list as `fieldsFromOptions(o)` — the visible lines, then
 * the OPERATOR's extra fields — followed by `design.extraFields`. So a design's own field is
 * numbered after BOTH, and a design that counts only the lines silently claims an id the
 * operator's first extra field already has: two entries for one id, and the later one wins the
 * `getElementById` write. `applyLogoSlot` has always done this arithmetic; this is the same
 * rule, named, for designs that hand-author their own slot instead.
 *
 * `offset` is the index within the design's own extra fields (0 for a single slot; 0…n-1 for a
 * sponsor strip's row).
 */
export function designFieldId(o: ResolvedOptions, offset = 0): string {
  return `f${o.lines.length + o.extraFields.length + offset}`;
}

/** The mask-wrapped line elements (SPX writes straight into id="fN"). */
export function lineMasksFor(prefix: string, o: ResolvedOptions, indent = '      '): string {
  return o.lines
    .map(
      (line, i) =>
        `${indent}<!-- ${line.title} (f${i}) — SPX writes this field's value straight into the element. -->\n` +
        `${indent}<div class="${prefix}-mask"><span id="f${i}" class="${lineClassFor(prefix, i)}">${line.sample}</span></div>`,
    )
    .join('\n');
}

/** Build the complete SpxTemplate for a standard-contract category. */
export function assembleStandard(
  cat: CategorySpec,
  meta: StandardMeta,
  design: StandardDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const p = cat.prefix;
  // The declarative logo slot: an 'optional'-logo design that doesn't hand-author its own
  // slot gets the shared one (field + <img> + placeholder CSS) when the logo is enabled.
  if (o.logoEnabled && !designHasLogoSlot(design, p)) design = applyLogoSlot(design, p, o);
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const fields = [...fieldsFromOptions(o), ...(design.extraFields ?? [])];
  // A design may opt out of steps mode (see StandardDesign.disableSteps); SPX then
  // treats the graphic as single-step regardless of the wizard's steps flag.
  const settings = baseSettings(meta, o, design.disableSteps ? { steps: '1' } : undefined);
  const scale = computeScale(o);
  const maxTextWidth = (cat.maxTextWidth ?? computeMaxTextWidth)(o.resolution);

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- ${cat.rootComment} -->
  <div class="${p}">
${design.html}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) ── */
.${p} {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── ${design.stageWidth ? 'The stage: the panel keeps its own width and the text fits inside it.' : 'Auto-fit: the panel hugs its text and wraps instead of overflowing.'} ── */
.${p}-box {
${
    design.stageWidth
      ? stageBoxCss(o.resolution, design.stageWidth, o.zone, 'the room this graphic was drawn for')
      : '  width: fit-content;              /* the panel hugs the text */'
  }
  max-width: ${maxTextWidthCss(o.resolution, maxTextWidth)};  /* the wrap cap — follows --scale, stops at the safe area */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.${p}-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.${p}-mask > span {
  display: inline-block;           /* so the line can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken words */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

/* ── Design ── */
${design.css}
`;

  const preset = presetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const presetCfg: PresetConfig = {
    prefix: p,
    lineCount: o.lines.length,
    hasAccent: design.hasAccent,
    steps: o.animation.steps && o.lines.length > 1 && !design.disableSteps,
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  // Design-owned runtime (e.g. a live clock) lives OUTSIDE the marked ANIMATION region —
  // before it — so preset/steps swaps in the Motion panel can never rewrite it.
  const extraJs = stageExtraJs(design.stageWidth, p, design.runtimeExtraJs).trim() || undefined;
  const js = runtimeJs(
    meta.name,
    extraJs ? `${extraJs}\n\n${preset.emit(presetCfg)}` : preset.emit(presetCfg),
    !!design.stageWidth,
  );

  const template: SpxTemplate = {
    name: meta.name,
    type: cat.type,
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: o.lines.map((line, i) => ({
      id: `f${i}`,
      type: 'text' as const,
      label: line.title,
      fieldId: `f${i}`,
      text: line.sample,
      styles: {},
    })),
  };

  // Timeline v2 flip: categories convert one by one (see convertToDataRegion above).
  return cat.dataRegion ? convertToDataRegion(template, refine) : template;
}

/** The authoring factory: a category gets its own defineVariant with everything wired. */
export function makeDefineVariant(cat: CategorySpec) {
  return function defineVariant(
    spec: Omit<TemplateVariant, 'create'>,
    meta: StandardMeta,
    buildDesign: (o: ResolvedOptions) => StandardDesign,
    /** Optional animation-data refinement (a graphic type's machine rides in here). It is
     *  built per create() because a type's compiled machine depends on the resolved options. */
    refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
  ): TemplateVariant {
    const variant: TemplateVariant = {
      ...spec,
      create(options?: WizardOptions) {
        const o = resolveOptions(variant, options);
        const design = buildDesign(o);
        // The family lives on the variant, the overrides on the design — resolved here
        // because this is the only place that holds both.
        const tokens = resolveTokens(spec.styleTag, design.tokens);
        return assembleStandard(cat, meta, design, o, refine?.(o), tokens);
      },
    };
    return variant;
  };
}
