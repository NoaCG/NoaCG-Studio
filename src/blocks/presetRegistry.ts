// THE PRESET LIBRARY — every category's motion presets, in one lookup, plus the one way to
// emit a preset's region for a given template.
//
// This is what is left of the old animPatch.ts after Phase 8 (docs/STATE_MACHINE_SCHEMA.md). That
// module was the marked region's literal PATCHER: it spliced phases, swapped presets, and set
// the knob variables in place. Nothing writes legacy regions any more — every category creates
// as a NOACG_ANIM data block, and motion is edited as DATA (blocks/animEdit.ts) — so the
// patchers are gone and only the library survives.
//
// The preset EMITTERS themselves are still load-bearing, and are still the ONE source of the
// catalog's choreography: blocks/presetApply.ts derives a preset's keyframes by emitting its
// region against a scratch copy of the template and converting it through the parity-proven
// importer. Emit here, convert there — no preset's taste is written down twice.

import { ANIM_PRESETS, type AnimPreset } from '../templates/lowerThirds/animPresets';
import { CREDITS_PRESETS } from '../templates/endCredits/creditsPresets';
import { TICKER_PRESETS } from '../templates/tickers/tickerPresets';
import { SS_PRESETS } from '../templates/startingSoon/ssPresets';
import { GT_PRESETS } from '../templates/gameTimers/gtPresets';
import { IG_PRESETS } from '../templates/infographics/igPresets';
import { VS_PRESETS } from '../templates/versus/vsPresets';
import { QUIZ_PRESETS } from '../templates/quiz/quizPresets';
import { COMP_PRESETS } from '../templates/competition/compPresets';
import { POLL_PRESETS } from '../templates/poll/pollPresets';
import { AUDIENCE_PRESETS } from '../templates/audience/audiencePresets';
import { DESIGN_PRESETS } from '../templates/importedDesign/designPresets';
import { FRAME_PRESETS } from '../templates/frames/framePresets';
import { TRANSITION_PRESETS } from '../templates/transitions/transitionPresets';
import type { AnimPresetId } from '../model/wizard';
import type { SpxTemplate } from '../model/types';
import { countLines, detectPrefix, svgFieldSelectors, svgLayerSelectors } from '../model/structure';

/**
 * The presets a template can be RE-POINTED at after creation - the post-creation pickers'
 * list. Applying a preset rewrites the animation DATA and nothing else, so a STRUCTURAL preset
 * (one whose behaviour also lives in create-time code outside the marked region) is withheld:
 * swapping it in would leave the data and that code disagreeing and the graphic silently inert.
 * The wizard picks from the variant's own `animationPresets` at create time, where the
 * assembler emits the matching runtime, so a structural preset is still fully reachable there.
 */
export function swappablePresetsForType(type: SpxTemplate['type']): AnimPreset[] {
  return presetsForType(type).filter((p) => !p.structural);
}

/** The same list narrowed to THIS graphic: what it can be re-pointed at, minus anything that
 *  could not move it (`presetMovesSomething`). Every post-creation picker asks here rather than
 *  pairing the two calls itself, so the two surfaces cannot end up offering different lists. */
export function swappablePresetsForTemplate(template: SpxTemplate): AnimPreset[] {
  return swappablePresetsForType(template.type).filter((p) => presetMovesSomething(template.html, p.id));
}

/** Every preset that applies to a template, by its category - the complete list. */
export function presetsForType(type: SpxTemplate['type']): AnimPreset[] {
  if (type === 'end-credits') return CREDITS_PRESETS;
  if (type === 'ticker') return TICKER_PRESETS;
  if (type === 'starting-soon') return SS_PRESETS;
  if (type === 'countdown') return GT_PRESETS;
  if (type === 'infographic') return IG_PRESETS;
  if (type === 'fullscreen') return VS_PRESETS;
  if (type === 'quiz') return QUIZ_PRESETS;
  // A frame is chrome around a picture and a transition covers the whole frame: neither is
  // driven by the box/line choreography the standard bank writes, so each has its own.
  if (type === 'frame') return FRAME_PRESETS;
  if (type === 'transition') return TRANSITION_PRESETS;
  // The competition pack's four categories share ONE prefix-parameterized bank, so a scorebug
  // and an award reveal move by the same vocabulary (templates/competition/compPresets.ts).
  if (type === 'esports-score' || type === 'matchup' || type === 'results-board' || type === 'reveal') {
    return COMP_PRESETS;
  }
  if (type === 'poll') return POLL_PRESETS;
  if (type === 'audience') return AUDIENCE_PRESETS;
  // An imported design is one picture: only the whole-unit presets suit it. The line presets
  // would stagger #fN out of masks the artwork was drawn around (templates/importedDesign).
  if (type === 'imported-design') return DESIGN_PRESETS;
  return ANIM_PRESETS;
}

/**
 * Every preset in the product, one list, EACH FAMILY EXACTLY ONCE. The wizard's Animation step
 * reads it too (a variant lists which ones suit it) — kept HERE so a new preset family is
 * registered in exactly one place; a second copy silently renders an empty picker for whatever
 * it forgot.
 *
 * It is a SET, not a concatenation, and the difference is visible: six families (starting
 * soon, game timers, infographics, versus, quiz, imported design) were spread twice while the
 * second block was being extended with poll and audience, so every design in those categories
 * offered each of its presets as two identical cards in the wizard — React's duplicate-key
 * warning was the only thing saying so. `e2e/anim-engine.spec.ts` now fails on a repeated id.
 */
export const ALL_PRESETS = [
  ...ANIM_PRESETS, ...CREDITS_PRESETS, ...TICKER_PRESETS,
  ...SS_PRESETS, ...GT_PRESETS, ...IG_PRESETS, ...VS_PRESETS, ...QUIZ_PRESETS, ...DESIGN_PRESETS,
  ...FRAME_PRESETS, ...TRANSITION_PRESETS,
  ...COMP_PRESETS, ...POLL_PRESETS, ...AUDIENCE_PRESETS,
];

/** Look up a preset across every category's library. */
export function anyPresetById(id: AnimPresetId): AnimPreset {
  const p = ALL_PRESETS.find((x) => x.id === id);
  if (!p) throw new Error(`Unknown animation preset: ${id}`);
  return p;
}

/** Which half of a graphic's motion an action targets: the entrance, the exit, or both. */
export type AnimPhase = 'in' | 'out' | 'both';

/**
 * Can this preset move anything on THIS design? A picker asks before it offers a card.
 *
 * OFFER ONLY WHAT CAN CHANGE THE GRAPHIC IN FRONT OF YOU (owner on the Style step,
 * 2026-08-28; again on the import walk, 2026-09-03 - "it would be nice if we wouldn't offer
 * things that don't do anything"). A preset whose choreography targets structure the artwork
 * does not have degrades to an honest whole-unit fade instead of crashing, which is the right
 * answer at play time and the wrong one in a picker: the card promises motion, the graphic
 * performs a fade, and the reader learns that our controls are decorative.
 *
 * Asked of the MARKUP, never of the category - the same shape as `cssPaintsWith`, which asks
 * the stylesheet before the Style step offers a colour role. It reads `svgLayerSelectors`, the
 * function `emitPresetRegion` hands the emitter as `cfg.layers`, so the offer and the emitted
 * choreography can never disagree about what is there.
 *
 * Conservative by the same rule as `cssPaintsWith`: unknown answers YES. Only presets with a
 * declared structural precondition are withheld; a preset that merely animates a part some
 * designs lack still moves the whole unit, so it stays offered.
 */
export function presetMovesSomething(html: string, presetId: AnimPresetId): boolean {
  // The per-layer stagger is the one preset today whose whole promise is structure: with no
  // named top-level layers in the artwork it emits the whole-unit fade and nothing staggers
  // (templates/importedDesign/designPresets.ts, `design-stagger`). Figma's frame export is the
  // common case - one unnamed <g> wrapping everything, so zero layers.
  if (presetId === 'design-stagger') return svgLayerSelectors(html).length > 0;
  return true;
}

/**
 * Emit a preset's marked region FOR this template — the structure facts (prefix, line count,
 * accent, bars) read off its HTML, so the emitted choreography targets the elements that are
 * actually there. Returns null for a template outside the standard structure contract.
 *
 * Two callers, one shape: presetApply derives keyframes from this (emit → import → lift the
 * tracks), and the legacy timeline's "start over" writes it, converted, over an unconvertible
 * hand-written region. Steps are always OFF: a press's choreography belongs to the target's own
 * reveal steps, not to the donor's.
 */
/**
 * The `<prefix>-*` class tokens a template's HTML actually carries — `PresetConfig.parts`.
 *
 * Derived from the markup rather than from a category list, for the same reason `detectPrefix`
 * is: the emitted code is the source of truth, so a preset asking "does this design have a
 * kicker" gets its answer from the design, whether it came from the catalog, an import, or a
 * user's own edit.
 */
function optionalParts(html: string, prefix: string): string[] {
  const found = new Set<string>();
  for (const [, token] of html.matchAll(new RegExp(`\\b(${prefix}-[a-z0-9-]+)\\b`, 'g'))) found.add(token);
  return [...found].sort();
}

export function emitPresetRegion(
  template: SpxTemplate,
  presetId: AnimPresetId,
  opts?: { speed?: number; easeIn?: string; easeOut?: string },
): string | null {
  const prefix = detectPrefix(template.html);
  if (!prefix) return null;
  const preset = anyPresetById(presetId);
  return preset.emit({
    prefix,
    lineCount: Math.max(1, countLines(template.html)),
    hasAccent: template.html.includes(`${prefix}-accent`),
    hasBars: template.html.includes(`${prefix}-bar-fill`),
    // The optional parts this design actually draws — read off the HTML, the same way
    // hasAccent and hasBars are, so a re-applied preset animates what is there and nothing else.
    parts: optionalParts(template.html, prefix),
    // An imported SVG's own top-level layers (empty for everything else) — the per-layer
    // stagger's targets, read the same way the SVG assembler read them at create.
    layers: svgLayerSelectors(template.html),
    fields: svgFieldSelectors(template.html),
    steps: false,
    stepOutsideParts: [],
    speed: opts?.speed ?? 1,
    easeIn: opts?.easeIn ?? preset.autoEase.easeIn,
    easeOut: opts?.easeOut ?? preset.autoEase.easeOut,
  });
}
