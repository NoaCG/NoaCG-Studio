// Versus scaffolding. A versus card is a FULL-FRAME match-up graphic: two team columns
// slide in from their own edges and meet around a big center VS mark, with the event/date
// line beneath. Every variant carries five FIXED data fields (the wizard's line editor
// feeds the three text ones; the two logos are design-owned image fields):
//   f0 "Team A" (name) · f1 "Team B" (name) · f2 "Event / date" (one line)
//   f3 "Team A logo" · f4 "Team B logo" (SPX "filelist" image fields -> <img id="fN">)
//
// Structure contract (self-assembled, like scoreboards):
//   <div class="versus">                        root - zone positioned; opacity:0 until play()
//     <div class="versus-box">                  the full-frame stage; presets fade this up first
//       ...design-owned mood layers (glow, rays, vignette - static paint)...
//       <div class="versus-side versus-side-a"> team A column - slides in from the LEFT edge
//         <div class="versus-logo">             logo slot: <img id="f3"> over a placeholder mark
//         <div class="versus-mask"><span id="f0" class="versus-name">...</span></div>
//       </div>
//       <div class="versus-center">             the VS mark - pops at the collision point
//       <div class="versus-side versus-side-b"> team B column - mirrors in from the RIGHT edge
//       <div class="versus-bottom">             the event/date line (#f2 in its mask)
//       [<div class="versus-accent">]           the design's one accent flourish (presets FADE it)
//     </div>
//   </div>
//
// LAYOUT SAFETY (the runtime bench doubles every text value and feeds 60-char team names):
// each side column owns 40% of the frame and its name mask clips at the column edge, so the
// two sides and the reserved center corridor (the middle 20%, where the VS mark lives) can
// never collide, however long the operator's team names run. Long names wrap to more rows
// inside their column instead of growing sideways.
//
// Steps are meaningless here - both sides are simultaneous columns, not a reveal sequence -
// so every variant plays as a single step (settings steps '1', no revealNextStep).

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
  type LineSpec,
  type ResolvedOptions,
  type TemplateVariant,
  type WizardOptions,
} from '../../model/wizard';
import {
  baseSettings,
  computeScale,
  documentHtml,
  resetCanvasCss,
  resolveHeadingFont,
  rootVarsCss,
  runtimeJs,
  zoneCssText,
} from '../shared/base';
import type { AnimData } from '../../blocks/animData';
import { convertToDataRegion } from '../shared/standard';
import type { PresetConfig } from '../lowerThirds/animPresets';
import { versusPresetById } from './vsPresets';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface VsDesign {
  /**
   * Inner HTML of .versus - must contain .versus-box holding .versus-side-a / .versus-side-b
   * (each with a .versus-logo image slot and a .versus-mask > span#f0/#f1 name),
   * .versus-center (the VS mark) and .versus-bottom (with the .versus-mask > span#f2 event
   * line). Presets only ever tween those five contract elements plus .versus-accent.
   */
  html: string;
  /** Variant CSS (mood layers, logos, names, the VS mark, the event line). Colors via :root vars only. */
  css: string;
  /** Whether the design includes a .versus-accent flourish (presets fade it in on the impact). */
  hasAccent: boolean;
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface VsMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

/** Fallback lines when the wizard passes fewer than three (titles keep the fixed contract). */
const VS_FALLBACK: LineSpec[] = [
  { title: 'Team A', sample: 'HOME' },
  { title: 'Team B', sample: 'AWAY' },
  { title: 'Event / date', sample: 'MATCH NIGHT · SATURDAY 20:00' },
];

/** The three text lines with every gap filled - one source for fields AND design samples. */
export function versusLines(o: ResolvedOptions): { teamA: LineSpec; teamB: LineSpec; event: LineSpec } {
  const line = (i: number): LineSpec => ({
    title: o.lines[i]?.title || VS_FALLBACK[i].title,
    sample: o.lines[i]?.sample || VS_FALLBACK[i].sample,
  });
  return { teamA: line(0), teamB: line(1), event: line(2) };
}

/** Build the complete versus SpxTemplate. */
export function assembleVersus(meta: VsMeta, design: VsDesign, o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts). Resolved by the caller,
   *  because the family lives on the VARIANT (styleTag) and this function only sees the
   *  design. Absent = emit no token lines, which is what every template did before they
   *  existed. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  const lines = versusLines(o);
  // An imported logo (the wizard's import-graphics flow) lands in the home slot (f3).
  const logoPath = o.logoAssetPath ?? '';

  const fields: SpxField[] = [
    { field: 'f0', ftype: 'textfield', title: lines.teamA.title, value: lines.teamA.sample },
    { field: 'f1', ftype: 'textfield', title: lines.teamB.title, value: lines.teamB.sample },
    { field: 'f2', ftype: 'textfield', title: lines.event.title, value: lines.event.sample },
    { field: 'f3', ftype: 'filelist', title: 'Team A logo', value: logoPath, assetfolder: './images/', extension: 'png' },
    { field: 'f4', ftype: 'filelist', title: 'Team B logo', value: '', assetfolder: './images/', extension: 'png' },
  ];

  const settings = baseSettings(meta, o, { steps: '1' }); // both sides enter together - no steps

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, fields),
    body: `  <!-- Versus card root — two team columns meet around the center VS mark. -->
  <div class="versus">
${design.html}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position (anchor zone) — the card is a full-frame graphic. ── */
.versus {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  width: ${o.resolution.width}px;   /* the card covers the whole frame… */
  height: ${o.resolution.height}px;  /* …edge to edge */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── The match-up geometry: two 40% side columns and a reserved center corridor. ── */
.versus-box {
  position: relative;              /* the stage every layer is placed on */
  width: 100%;                     /* fills the frame… */
  height: 100%;                    /* …both ways */
  overflow: hidden;                /* the sides start OFF the frame — nothing paints outside it */
  will-change: transform, opacity; /* hint the browser: this element animates */
}
.versus-side {
  position: absolute;              /* each column owns its side of the frame */
  top: 0;                          /* full height, top… */
  bottom: 0;                       /* …to bottom */
  width: 40%;                      /* two 40% columns — the middle 20% stays the VS corridor */
  display: flex;                   /* logo above name… */
  flex-direction: column;          /* …stacked as one column */
  align-items: center;             /* both centered on the column's axis */
  justify-content: center;         /* vertically centered in the frame */
  gap: calc(30px * var(--scale));  /* air between the logo and the name */
  padding: 0 calc(34px * var(--scale));  /* the column's inner side margins */
  will-change: transform, opacity; /* the columns slide in from the edges */
}
.versus-side-a { left: 0; }        /* team A owns the left 40% */
.versus-side-b { right: 0; }       /* team B mirrors on the right 40% */
.versus-center {
  position: absolute;              /* a full-frame wrapper: scaling it pivots on the frame center */
  inset: 0;                        /* edge to edge */
  display: flex;                   /* centers the VS mark… */
  align-items: center;             /* …vertically… */
  justify-content: center;         /* …and horizontally */
  pointer-events: none;            /* the wrapper never blocks anything beneath */
  will-change: transform, opacity; /* the VS pops in at the collision */
}
.versus-bottom {
  position: absolute;              /* pinned across the bottom of the frame */
  left: 0;                         /* full width, left… */
  right: 0;                        /* …to right */
  bottom: 0;                       /* anchored to the bottom — wrapped text grows upward */
  display: flex;                   /* the event line (and any design chrome)… */
  flex-direction: column;          /* …stack as one column */
  align-items: center;             /* centered on the frame's axis */
  will-change: transform, opacity; /* the event line rises in last */
}

/* ── Auto-fit: names wrap inside their column and never invade the VS corridor. ── */
.versus-mask {
  overflow: hidden;                /* lines can reveal from behind this mask */
  max-width: min(calc(640px * var(--scale)), 100%);  /* the wrap cap — clipped at the column edge */
}
.versus-mask > span {
  display: inline-block;           /* so the line can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken team names */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

/* ── Design ── */
${design.css}
`;

  const preset = versusPresetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'versus',
    lineCount: 3, // f0 team A · f1 team B · f2 event line (f3/f4 are the logo slots)
    hasAccent: design.hasAccent,
    steps: false, // both sides are simultaneous — a versus card never steps
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = runtimeJs(meta.name, preset.emit(cfg));

  // Timeline v2: versus cards create as animation data blocks. Only the marked region
  // converts — the standard runtime around it stays byte-identical.
  return convertToDataRegion({
    name: meta.name,
    type: 'fullscreen',
    resolution: o.resolution,
    fps: o.fps,
    html,
    css,
    js,
    fields,
    settings,
    assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
    layers: fields
      .filter((f) => f.ftype === 'textfield')
      .map((f) => ({
        id: f.field,
        type: 'text' as const,
        label: f.title,
        fieldId: f.field,
        text: f.value,
        styles: {},
      })),
  }, refine);
}

/** The authoring API for versus variant modules. */
export function defineVersusVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: VsMeta,
  buildDesign: (o: ResolvedOptions) => VsDesign,
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
      return assembleVersus(meta, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}
