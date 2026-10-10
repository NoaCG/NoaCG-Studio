// Frame scaffolding. A FRAME is the one thing in the catalog that is not a panel of words: it
// is the chrome AROUND a picture — a webcam surround, a two-up interview, a split screen, a
// screen-share with a presenter inset. docs/PACK_TAXONOMY.md's gap list called it "arguably a
// new category rather than a type", and this is why: every other category owns a box that
// holds its own content, and a frame owns a HOLE that holds someone else's.
//
// Consequences of that, all deliberate:
//  - the graphic covers the whole canvas (like versus cards) and its interior stays fully
//    transparent — the vision mixer's picture is what the viewer sees through it;
//  - nothing in it is clickable or paintable over the picture: `pointer-events: none` on the
//    stage, and no fills inside a window, ever;
//  - the DESIGN owns its SPX fields, like infographics and versus do, because a single-camera
//    frame carries two lines and a split screen carries four. A fixed line contract would make
//    half the designs lie about their own shape.
//
// Structure contract (the frame presets rely on it):
//   <div class="frame">                    root — covers the canvas; opacity:0 until play()
//     <div class="frame-box">              the full-frame stage; presets animate this
//       <div class="frame-window">…</div>   one per camera hole — the DRAWN EDGE only
//       <div class="frame-plate">           one per nameplate
//         <div class="frame-mask"><span id="f0" class="frame-name">…</span></div>
//         <div class="frame-mask"><span id="f1" class="frame-role">…</span></div>
//       </div>
//     </div>
//   </div>
//
// A split design carries several `.frame-window` / `.frame-plate` elements under the SAME
// classes, so one preset drives one camera or four without knowing how many there are. The
// trade that comes with it: a repeated class is not a unique selector, so an individual window
// is not its own registry part (model/structure.ts requires single-match selectors). The root,
// the stage and every text line are parts, which is what the timeline and the canvas need.
//
// THE PLACEMENT RULE, and it is a real one: the window rectangles are where the SWITCHER must
// put its sources. A frame is a promise about geometry, so each design states its window
// positions in plain numbers in its own header — otherwise an operator has to measure the
// graphic to use it. Those numbers are the design's 1920 × 1080 layout at `--scale: 1`; a
// smaller output resolution scales them proportionally (`--scale` folds the resolution in), and
// turning the SIZE knob down moves the windows deliberately, so the stated geometry is the
// default geometry rather than a fixed one.
//
// A TRANSITION makes the opposite choice for the opposite reason: its covering surfaces are
// measured in PERCENT of the stage, because a cover that shrank with the size knob would leave
// picture showing and expose the cut it exists to hide (src/templates/transitions/).

import type { SpxField, SpxTemplate } from '../../model/types';
import { definitionScriptBlock } from '../../model/spxDefinition';
import { resolveEasing } from '../../model/easings';
import {
  resolveOptions,
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
import { framePresetById } from './framePresets';
import { resolveTokens, type ThemeTokens, type TokenOverrides } from '../../model/themeTokens';

export interface FrameDesign {
  /** Inner HTML of .frame — must contain .frame-box holding at least one .frame-window and
   *  one .frame-plate whose lines are `.frame-mask > span#fN`. */
  html: string;
  /** Variant CSS (window edges, plates, type). Colors via the :root vars only. */
  css: string;
  /** The design's own SPX fields — a frame's field count follows its camera count. */
  fields: SpxField[];
  /**
   * Where this design disagrees with its style family's shape tokens
   * (model/themeTokens.ts). Every entry is conformance debt - DESIGN_LANGUAGE §8's rule is
   * "reuse the exact token values, don't improvise new ones per category".
   */
  tokens?: TokenOverrides;
}

export interface FrameMeta {
  name: string;
  description: string;
  /** SPX UI color label, "1".."7". */
  uicolor: string;
}

/** Build the complete frame SpxTemplate. */
export function assembleFrame(
  meta: FrameMeta,
  design: FrameDesign,
  o: ResolvedOptions,
  /** Refine the converted animation data — the seam a graphic TYPE injects its machine
   *  through (see shared/standard.ts composeRefine for the ordering rule). */
  refine?: (data: AnimData) => AnimData,
  /** The design's resolved SHAPE tokens (model/themeTokens.ts), resolved by the caller
   *  because the family lives on the VARIANT and this function only sees the design. */
  tokens?: ThemeTokens,
): SpxTemplate {
  const font = resolveHeadingFont(o); // imported font wins over the bundled set
  const scale = computeScale(o);
  // A frame is a surround, not a reveal sequence: every part of it arrives together.
  const settings = baseSettings(meta, o, { steps: '1' });

  const html = documentHtml({
    title: meta.name,
    definitionBlock: definitionScriptBlock(settings, design.fields),
    body: `  <!-- Camera frame — chrome around the picture. The window interiors stay transparent. -->
  <div class="frame">
${design.html}
  </div>`,
  });

  const css = `/* ${meta.name} — generated by NoaCG Studio. Edit freely: this file is yours. */

${rootVarsCss(o, font.stack, scale, { tokens, consumerCss: design.css })}

${font.face}

${resetCanvasCss(o.resolution)}

/* ── Root position — a frame covers the whole canvas. ── */
.frame {
  position: absolute;
${zoneCssText(o.zone, o.nudge, o.resolution)}
  width: ${o.resolution.width}px;   /* the surround covers the whole frame… */
  height: ${o.resolution.height}px;  /* …edge to edge */
  opacity: 0;                      /* hidden until play() runs the entrance */
}

/* ── The stage: everything is drawn on it, and nothing on it is ever solid over the
      picture. pointer-events stays off so an overlay in a browser source never eats a
      click meant for whatever is behind it. ── */
.frame-box {
  position: relative;              /* the windows and plates are placed against this stage */
  width: 100%;                     /* fills the canvas… */
  height: 100%;                    /* …both ways */
  pointer-events: none;            /* chrome never intercepts anything */
  will-change: transform, opacity; /* hint the browser: this element animates */
}

/* ── A camera window: a DRAWN EDGE around a transparent hole. It must never take a
      background — the picture behind it is the point of the graphic. ── */
.frame-window {
  position: absolute;              /* each window states its own rectangle */
  background: transparent;         /* the hole — never fill this */
  will-change: transform, opacity; /* the edge animates in */
}

/* ── Auto-fit for the nameplate lines: they wrap inside their plate instead of growing. ── */
.frame-mask {
  overflow: hidden;                /* lines animate in from behind this mask */
}
.frame-mask > span {
  display: inline-block;           /* so the line can move inside its mask */
  overflow-wrap: break-word;       /* break very long unbroken names */
  text-wrap: balance;              /* wrapped rows get even lengths */
}

/* ── Design ── */
${design.css}
`;

  const preset = framePresetById(o.animation.presetId);
  // 'auto' uses the preset's hand-tuned ease pair; a named easing preset overrides both phases.
  const ease = resolveEasing(o.animation.easing, preset.autoEase);
  const cfg: PresetConfig = {
    prefix: 'frame',
    // Only the TEXT fields are lines the preset staggers — a frame has no image fields today,
    // but counting the visible ones keeps that true if one ever gains a logo slot.
    lineCount: design.fields.filter((f) => f.ftype === 'textfield').length,
    hasAccent: false,
    steps: false, // a surround arrives as one object — nothing is revealed on Continue
    speed: o.animation.speed,
    easeIn: ease.easeIn,
    easeOut: ease.easeOut,
  };

  const js = runtimeJs(meta.name, preset.emit(cfg));

  // Timeline v2: frames create as animation data blocks like every other category.
  return convertToDataRegion(
    {
      name: meta.name,
      type: 'frame',
      resolution: o.resolution,
      fps: o.fps,
      html,
      css,
      js,
      fields: design.fields,
      settings,
      assets: [...o.importedImages, ...(o.customFont ? [o.customFont.asset] : [])],
      layers: design.fields
        .filter((f) => f.ftype === 'textfield')
        .map((f) => ({
          id: f.field,
          type: 'text' as const,
          label: f.title,
          fieldId: f.field,
          text: f.value,
          styles: {},
        })),
    },
    refine,
  );
}

/** The authoring API for frame variant modules. */
export function defineFrameVariant(
  spec: Omit<TemplateVariant, 'create'>,
  meta: FrameMeta,
  buildDesign: (o: ResolvedOptions) => FrameDesign,
  /** Optional animation-data refinement (a graphic type's machine rides in here). */
  refine?: (o: ResolvedOptions) => ((data: AnimData) => AnimData) | undefined,
): TemplateVariant {
  const variant: TemplateVariant = {
    ...spec,
    create(options?: WizardOptions) {
      const o = resolveOptions(variant, options);
      const design = buildDesign(o);
      const tokens = resolveTokens(spec.styleTag, design.tokens);
      return assembleFrame(meta, design, o, refine?.(o), tokens);
    },
  };
  return variant;
}
