// The wizard's working state (the "draft"): every choice the user makes across the steps.
// null means "use the variant's tasteful default" — draftToOptions() maps the draft onto
// WizardOptions, and resolveOptions() (model/wizard.ts) fills the rest.
//
// This file is the SHARED part of the draft: the WizardDraft record itself, its patch and
// merge, the project-format helpers, and the two mappers every capability calls
// (draftToOptions, buildDraftTemplate). The template road's own pieces live in ./template.ts
// and the Import-graphic road's behind ../import (its own index); ../draft.ts re-exports all
// three.

import type { AssetFile, SpxTemplate } from '../../../model/types';
import {
  DEFAULT_GRAPHICS_FORMAT,
  resolutionForSelection,
  type ProjectFormatSelection,
  type Resolution,
} from '../../../model/projectFormat';
import { getCssVariable, setCssVariable } from '../../../model/cssVars';
import { FONTS, fontStack } from '../../../model/fonts';
import { anyPresetById, type AnimPhase } from '../../../blocks/presetRegistry';
import { parseAnimData } from '../../../blocks/animData';
import { writeAnimData } from '../../../templates/shared/animRuntime';
import { applyPresetData, presetDonor } from '../../../blocks/presetApply';
import type { MotionPresetId } from '../../../blocks/motionPresets';
import { resolveEasing } from '../../../model/easings';
import type {
  AnimPresetId,
  AnimSpeed,
  DesignArt,
  ExtraFieldSpec,
  LineSpec,
  Palette,
  AssemblerId,
  TemplateVariant,
  WizardOptions,
  Zone9,
} from '../../../model/wizard';
import { paletteById } from '../../../model/wizard';
import type { EasingId } from '../../../model/easings';
import { ensureFontFace, fontByStack, type CustomFont } from '../../../model/fonts';
import type { SvgImportResult } from '../../../assets/svgImport';
import type { ProjectLegibility } from '../../../model/designRules';
import { draftFormatSelection } from './format';
import { brandMarkFor, withUniversalMotion } from './template';
import {
  hiddenSvgLayers,
  pollDrivenLayers,
  svgBehaviourOption,
  svgExtrasOptions,
  svgGrowthOptions,
  withDesignFieldSpecs,
  withEraseSeedFields,
  withStretchDemoLine,
  withSvgOutlineFields,
  type DesignEraseState,
  type DesignFieldSpec,
  type SvgBehaviourDraft,
  type SvgExtraDraft,
  type SvgFieldDraft,
  type SvgFontDraft,
  type SvgImageDraft,
  type SvgOutlineDraft,
  type SvgStretchDraft,
} from '../import';

export interface WizardDraft {
  /** What the finished graphic is CALLED (the Finish step). Empty = fall back to the design's
   *  own catalog name, which is what every project was called before this step existed. It
   *  matters most on the export branch: the name slugs the zip AND, for the SPX and CasparCG
   *  targets, the template FOLDER and FILE inside it — the name the operator reads in the
   *  playout server. Shipping `hairline/hairline.html` is the reason this field exists. */
  name: string;
  category: AssemblerId | null;
  variantId: string | null;
  aspectId: ProjectFormatSelection['aspectId'];
  resolutionId: ProjectFormatSelection['resolutionId'];
  fps: number;
  /** Session-only signal used when switching into video: untouched graphics defaults become
   * the video defaults, while an explicit choice is carried across creation routes. */
  formatTouched: boolean;
  lines: LineSpec[];
  /**
   * Extra definition-only fields. The wizard UI no longer offers these (the generated
   * design can't adapt to them yet — fields are added post-create via the Data tab + AI
   * editing), but the data model stays so WizardOptions.extraFields and future custom
   * fields keep working. Always [] from the wizard.
   */
  extraFields: ExtraFieldSpec[];
  /**
   * The graphic TYPE's setup values, by its own logical field keys (`{ correctAnswer: 'C' }`).
   * What a design SAYS is `lines`; this is the rest of what it is - which answer is correct,
   * the club colours, how long the countdown runs. Only a type-compiled design has any (see
   * `setupFields`), and every value is clamped at compile, so an untouched draft is `{}` and
   * changes nothing.
   */
  content: Record<string, string>;
  /**
   * Answers to the picked design's declared `styleChoices` (model/wizard.ts), by key. A design
   * decision the DESIGN owns and the user picks - cr01's role-or-name emphasis is the first.
   * Untouched is `{}` and changes nothing, and an answer the picked design does not offer is
   * dropped at resolve, so switching designs mid-wizard cannot carry a stale one across.
   */
  styleChoices: Record<string, string>;
  paletteId: string | null;
  /** User-defined colors (takes precedence over paletteId when set). */
  customPalette: Palette | null;
  /** Direct `:root` variable overrides beyond the four palette roles - the wizard's "All
   *  design colors" rows (docs/GOALS_ARCHIVE.md "Student release" step 5). Applied AFTER the variant
   *  builds, through the same setCssVariable patch the Style panel writes post-create, so
   *  every design color is editable without the editor. Keyed by var name (no `--`). */
  cssVarOverrides: Record<string, string>;
  /** 'custom' selects the imported font; a bundled id or null otherwise. */
  fontId: string | null;
  /** The user's imported font, kept even while a bundled font is selected. */
  customFont: CustomFont | null;
  sizeScale: number;
  /** Text-only size multiplier (--type-scale) on top of the whole-graphic sizeScale. */
  typeScale: number;
  zone: Zone9 | null;
  nudge: { x: number; y: number };
  animation: {
    /** The entrance preset (and the exit too while outPresetId is null). */
    presetId: AnimPresetId | null;
    /** A different exit preset, or null = the exit matches the entrance. */
    outPresetId: AnimPresetId | null;
    /** What a preset click changes: both phases (default), entrance, or exit. */
    direction: AnimPhase;
    /** The UNIVERSAL in/out motion (blocks/motionPresets.ts), per phase - the imported-design
     *  flow's Animation step picks these instead of the category's four whole-unit presets.
     *  null = undecided: the phase takes the mapped whole-unit default (see universalPick), or
     *  keeps its category preset when that one is not a whole-unit motion (the SVG layer
     *  stagger). Written at build through the same engine the control page uses after. */
    motionIn: MotionPresetId | null;
    motionOut: MotionPresetId | null;
    speed: AnimSpeed;
    easing: EasingId;
    /** SPX multi-step reveal. `null` = the user has not decided, so the picked design's own
     *  answer stands (`TemplateVariant.defaultSteps`) — the same "undecided" shape `zone` and
     *  `logoEnabled` use. A process card or a checklist is stepped by construction; a name
     *  strap is not, and a hard `false` here would have overridden every design that knows. */
    steps: boolean | null;
  };
  /** Images dropped in via the "Import graphics" entry (stored as data-URL assets). */
  importedImages: AssetFile[];
  /**
   * THE CHOSEN BRAND'S MARK, kept apart from the user's own pictures.
   *
   * It lived in `importedImages` for one evening and that was wrong twice over. Those images
   * are the wizard's word for "artwork the person brought": the Import walk's raster drop
   * writes the dropped file there and reads `[0]` back as the artwork, Browse re-ranks
   * logo-capable designs first when the list is non-empty, and the Import step's Next unlocks
   * on it - so a brand quietly answered three questions nobody had asked it. Worse, the raster
   * drop's own patch sets `importedImages` and a brand patch spread after it replaced the
   * artwork with the mark, leaving `designArt` pointing at a file the template no longer
   * bundled.
   *
   * As its own field it is one fact in one place, and `draftToOptions` decides per design
   * whether the mark travels at all.
   */
  brandLogo: AssetFile | null;
  /** Which imported image goes into the variant's logo slot (relative assets/ path). */
  logoAssetPath: string | null;
  /** The Fields step's logo toggle on an 'optional'-logo variant; null = undecided
   *  (falls back to "a logo image was provided"). */
  logoEnabled: boolean | null;
  /** The artwork the graphic IS, in the Import Graphic flow (measured at import). */
  designArt: DesignArt | null;
  /** The untouched upload, kept so an erase re-runs from clean pixels (never compounds). */
  designOriginal: AssetFile | null;
  /** The applied baked-text erases (Prepare step), in the order they were marked; [] = none.
   *  A design usually has more than one piece of baked text — a name AND a title, a scoreline
   *  AND a clock — so each marked region is its own erase, and each seeds its own field(s). */
  designErases: DesignEraseState[];
  /** The user's declared answer that the artwork's baked text is INTENTIONAL (a wordmark, a
   *  deliberate slogan) — or that there is none. It lives on the draft rather than in the
   *  Prepare step's state so the answer survives leaving the step: Prepare stops re-proposing
   *  and the Text step's still-baked note stands down. Cleared by a fresh drop and by
   *  answering "yes, mark it". */
  designKeepBakedText: boolean;
  /** The Text step's placed fields (Import Graphic). Ordered; each becomes a real placed
   *  field at build, AFTER the erase-seeded ones. */
  designFields: DesignFieldSpec[];
  /** The imported SVG (the SVG road, docs/SVG_IMPORT_PLAN.md): sanitized + inventoried at
   *  drop, width/height already fitted to the frame. null outside svg mode. */
  designSvg: SvgImportResult | null;
  /** The mapping step's working state, one row per detected text layer: which become
   *  operator fields, and their edited labels/samples. Initialized from the inventory
   *  (all ON — or only the `f:`-prefixed ones when any layer opted in by name). */
  svgFields: SvgFieldDraft[];
  /** The mapping step's picture rows, one per `<image>` layer: OFF by default (most
   *  pictures inside a design are the artwork, not a slot), ON = a filelist field whose
   *  value swaps the node's href. */
  svgImages: SvgImageDraft[];
  /** The mapping step's outlined-text rows, one per glyph-shaped group: OFF by default,
   *  ON = the group is hidden and a placed HTML field stands in for it (plan §1.A). */
  svgOutlines: SvgOutlineDraft[];
  /** The BEHAVIOUR bound to the artwork, or null for the ordinary in/out graphic the importer
   *  has always produced. Proposed from the layer names at drop, and freely re-picked. */
  svgBehaviour: SvgBehaviourDraft | null;
  /** The SWITCHES and CHOICES on the artwork's hidden layers (docs/SVG_BEHAVIOUR_PLAN.md §7c),
   *  one entry per layer the reader gave a use. Proposed from `show:` / `choice:` names at
   *  drop; every hidden layer no recipe claimed is offered the same two answers in the step. */
  svgExtras: SvgExtraDraft[];
  /** Does the graphic HUG its text — one rectangle widening so a longer value fits at full
   *  size (plan §3)? Off is the graphic that declares a STAGE, which is every board and
   *  every scorebug; on is the lower third whose banner is as wide as the name on it. */
  svgStretch: SvgStretchDraft;
  /** Per referenced font family: how it resolves. Bundled faces auto-match by name at drop;
   *  the mapping step offers the Google fetch or an upload for the rest. An entry with
   *  neither source is UNRESOLVED — created anyway, with a warning. */
  svgFonts: SvgFontDraft[];
  /** The project's legibility settings (model/designRules.ts): viewing target + the two
   *  size-floor toggles. PROJECT METADATA, never template CSS — draftToOptions does not read
   *  it; the create paths land it on the store, which persists it with the project. An
   *  untouched draft is `{}` and serializes to nothing. */
  legibility: ProjectLegibility;
}

/** A draft update: top-level fields replace; `animation` and `nudge` deep-merge. */
export type DraftPatch = Partial<Omit<WizardDraft, 'animation' | 'nudge'>> & {
  animation?: Partial<WizardDraft['animation']>;
  nudge?: Partial<WizardDraft['nudge']>;
};

/** Merge a patch into the draft (nested animation/nudge merge instead of replace). */
export function mergeDraft(draft: WizardDraft, patch: DraftPatch): WizardDraft {
  return {
    ...draft,
    ...patch,
    animation: patch.animation ? { ...draft.animation, ...patch.animation } : draft.animation,
    nudge: patch.nudge ? { ...draft.nudge, ...patch.nudge } : draft.nudge,
  };
}

export function initialDraft(): WizardDraft {
  return {
    name: '',
    category: null,
    variantId: null,
    ...DEFAULT_GRAPHICS_FORMAT,
    formatTouched: false,
    lines: [],
    extraFields: [],
    content: {},
    styleChoices: {},
    paletteId: null,
    customPalette: null,
    cssVarOverrides: {},
    fontId: null,
    customFont: null,
    sizeScale: 1,
    typeScale: 1,
    zone: null,
    nudge: { x: 0, y: 0 },
    animation: { presetId: null, outPresetId: null, direction: 'both', motionIn: null, motionOut: null, speed: 1, easing: 'auto', steps: null },
    importedImages: [],
    brandLogo: null,
    logoAssetPath: null,
    logoEnabled: null,
    designArt: null,
    designOriginal: null,
    designErases: [],
    designKeepBakedText: false,
    designFields: [],
    designSvg: null,
    svgFields: [],
    svgImages: [],
    svgOutlines: [],
    svgBehaviour: null,
    svgExtras: [],
    svgStretch: { on: false, shapeId: null },
    svgFonts: [],
    legibility: {},
  };
}

export function draftResolution(draft: WizardDraft): Resolution {
  return resolutionForSelection(draftFormatSelection(draft));
}

/** Map the draft onto WizardOptions (nulls fall back to the variant's defaults). */
export function draftToOptions(variant: TemplateVariant, draft: WizardDraft): WizardOptions {
  const mark = brandMarkFor(variant, draft);
  // The mark rides with the user's own pictures only where it is actually going to be used, so
  // a design that cannot show it never bundles its bytes into the template or the export.
  const images = mark
    ? [...draft.importedImages.filter((a) => a.path !== mark.path), mark]
    : draft.importedImages;
  return {
    resolution: draftResolution(draft),
    fps: draft.fps,
    // An imported design owns its lines OUTRIGHT — the wizard creates it BARE (fields are
    // added in the editor's Data tab), so its empty array must reach the assembler as-is.
    // Everywhere else an empty draft means "not decided yet" and falls back to suggestions.
    lines:
      variant.category === 'imported-design'
        ? draft.lines
        : draft.lines.length > 0
          ? draft.lines
          : undefined,
    extraFields: draft.extraFields.length > 0 ? draft.extraFields : undefined,
    content: Object.keys(draft.content).length > 0 ? draft.content : undefined,
    styleChoices: Object.keys(draft.styleChoices).length > 0 ? draft.styleChoices : undefined,
    palette: draft.customPalette ?? (draft.paletteId ? paletteById(draft.paletteId) : undefined),
    fontId: draft.fontId && draft.fontId !== 'custom' ? draft.fontId : undefined,
    customFont: draft.fontId === 'custom' && draft.customFont ? draft.customFont : undefined,
    sizeScale: draft.sizeScale,
    typeScale: draft.typeScale,
    zone: draft.zone ?? undefined,
    nudge: draft.nudge,
    animation: {
      presetId: draft.animation.presetId ?? variant.animationPresets[0],
      speed: draft.animation.speed,
      easing: draft.animation.easing,
      // null = undecided; resolveOptions then uses the variant's own `defaultSteps`.
      steps: draft.animation.steps ?? undefined,
    },
    importedImages: images.length > 0 ? images : undefined,
    // THE BRAND'S MARK LEADS while a brand is chosen (docs/BRAND_PLAN.md decision 2), and the
    // person's own picture is still sitting in `logoAssetPath` underneath it - so clearing the
    // brand gives that picture straight back, with nothing to restore and nothing to guess.
    logoAssetPath: variant.logo !== 'none' ? mark?.path ?? draft.logoAssetPath ?? undefined : undefined,
    // null = the user hasn't decided; resolveOptions then falls back to "an image exists" -
    // which a brand's mark now is, so a design declaring `defaultLogo: false` cannot silently
    // swallow it.
    logoEnabled: draft.logoEnabled ?? (mark ? true : undefined),
    designArt: draft.designArt ?? undefined,
    designSvg: draft.designSvg
      ? {
          markup: draft.designSvg.markup,
          width: draft.designSvg.width,
          height: draft.designSvg.height,
          // A layer a POLL drives is a display target, not an operator field: the round writes
          // its wording, its figure and its count, and a second writer on the same node would
          // have the operator watching their typing be overwritten. Dropped HERE rather than by
          // unticking the row in the step, because the field ids are positions in exactly this
          // list — filtering it is the one place where the numbering, the markup binding and the
          // control page cannot disagree about which layers are fields.
          fields: draft.svgFields
            .filter((f) => f.on && !pollDrivenLayers(draft.svgBehaviour).has(f.candidateId))
            .map((f) => ({
              candidateId: f.candidateId,
              title: f.title.trim() || 'Text',
              sample: f.sample,
              numeric: f.numeric,
              countdown: f.kind === 'countdown',
              // Both ABSENT unless set, for the same reason `hidden` is: an untouched import
              // must build the bytes it built before the alignment grid existed.
              ...(f.align ? { align: f.align } : {}),
              ...(f.keepNudge ? { nudge: true } : {}),
            })),
          images: draft.svgImages
            .filter((f) => f.on)
            .map((f) => ({ candidateId: f.candidateId, title: f.title.trim() || 'Picture' })),
          // Only a MEASURED outline can be replaced: its field needs the box, and hiding the
          // shapes without a stand-in would simply lose the designer's text.
          outlines: draft.svgOutlines
            .filter((f) => f.on && f.box)
            .map((f) => ({ candidateId: f.candidateId })),
          // The layers the author said to take OFF the artwork. Left ABSENT where nobody said
          // so, rather than emitted empty: an untouched import must build the same bytes it
          // built before the question existed.
          hidden: hiddenSvgLayers(draft),
          behaviour: svgBehaviourOption(draft) ?? undefined,
          extras: svgExtrasOptions(draft),
          // A growth rule travels only when it is both ON and pointed at a shape that still
          // exists: a half-answered picker must never become a graphic that resizes at random.
          growth: svgGrowthOptions(draft),
          fonts: draft.svgFonts.map((f) => ({
            family: f.family,
            fontId: f.fontId ?? undefined,
            customFont: f.customFont ?? undefined,
          })),
        }
      : undefined,
  };
}

/** The graphic's name: what the Finish step was given, else the design's own catalog name
 *  (which is what a project was called before that step existed). */
export function draftName(variant: TemplateVariant, draft: WizardDraft): string {
  return draft.name.trim() || variant.name;
}

/**
 * Build the draft's real template. `variant.create` emits the animation data with the entrance
 * preset driving both phases; when the draft mixes a different exit in, that exit is applied
 * onto the Out step with the same generator the Inspector's Animations tab uses — so the wizard
 * preview and the created project are always the exact same code.
 */
export function buildDraftTemplate(
  variant: TemplateVariant,
  draft: WizardDraft,
  // The wizard PREVIEW passes stretchDemo; create() never does — see withStretchDemoLine.
  // `previewMarkers` rides the same way: the mapping step's hover highlight needs a handle on
  // the layer a row means, and only the preview carries the fit runtime (plan §6a step 1).
  opts: { stretchDemo?: boolean; previewMarkers?: boolean } = {},
): SpxTemplate {
  let template = variant.create({ ...draftToOptions(variant, draft), previewMarkers: opts.previewMarkers });
  // The name rides the built template, so it reaches the editor's topbar, the Save dialog's
  // prefill, and the export slug through ONE path rather than being applied per branch.
  const named = draftName(variant, draft);
  if (named !== template.name) template = { ...template, name: named };
  let css = template.css;
  if (draft.fontId) {
    const stack = draft.fontId === 'custom' && draft.customFont 
      ? `"${draft.customFont.family}"`
      : (draft.fontId ? fontStack(FONTS.find(f => f.id === draft.fontId)!) : '');
    if (stack) {
      const fontVars = ['font-body', 'font-numeric', 'font-label', 'font-kicker'];
      for (const v of fontVars) {
        if (getCssVariable(css, v) !== null && !(v in draft.cssVarOverrides)) {
          css = setCssVariable(css, v, stack);
        }
      }
    }
  }

  const overridden = Object.entries(draft.cssVarOverrides);
  if (overridden.length > 0 || draft.fontId) {
    // Only vars the built design DECLARES: switching designs mid-wizard must not graft the
    // previous design's variable names onto one that never reads them.
    for (const [name, value] of overridden) {
      if (getCssVariable(css, name) === null) continue;
      css = setCssVariable(css, name, value);
      // An override may point a variable at a TYPEFACE (the kicker face, the numeric face).
      // Setting the variable is only half of that: the face's bytes have to ship too, or the
      // export references a font file nothing wrote and `font-display: swap` hides it until
      // playout (model/fonts.ts ensureFontFace).
      css = ensureFontFace(css, fontByStack(value), `--${name} points at this face.`);
    }
    template = { ...template, css };
  }
  if (variant.category === 'imported-design') {
    template = withEraseSeedFields(template, draft);
    template = withSvgOutlineFields(template, draft, opts.previewMarkers);
    template = withDesignFieldSpecs(template, draft);
    if (opts.stretchDemo) template = withStretchDemoLine(template, draft);
  }
  const inId = draft.animation.presetId ?? variant.animationPresets[0];
  const outId = draft.animation.outPresetId;
  if (outId && outId !== inId) {
    const outPreset = anyPresetById(outId);
    const easeOut = resolveEasing(draft.animation.easing, outPreset.autoEase).easeOut;
    const data = parseAnimData(template.js);
    // No data block (a hand-written variant) — nothing to mix onto.
    const donor = data && presetDonor(template, data, outId, { easeOut });
    const mixed = data && donor && applyPresetData(data, donor, 'out', 'all');
    const js = mixed && writeAnimData(template.js, mixed);
    if (js) template = { ...template, js };
  }
  return withUniversalMotion(template, draft, variant);
}
