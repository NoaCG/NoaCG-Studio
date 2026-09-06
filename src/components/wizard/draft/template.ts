// The TEMPLATE road's part of the draft (docs/WORKFLOW_ARCHITECTURE.md §5.5): the brand
// chooser's patches over the catalog palettes, and the universal in/out motion the Animation
// step writes onto a built design. The WizardDraft record itself is ./core.ts.

import type { AssetFile, SpxTemplate } from '../../../model/types';
import { parseAnimData } from '../../../blocks/animData';
import { writeAnimData } from '../../../templates/shared/animRuntime';
import {
  applyMotionPreset,
  motionPresetById,
  motionTargets,
  type MotionPick,
  type MotionPresetId,
} from '../../../blocks/motionPresets';
import { resolveEasing } from '../../../model/easings';
import type { AnimPresetId, TemplateVariant } from '../../../model/wizard';
import { PALETTES } from '../../../model/wizard';
import type { DraftPatch, WizardDraft } from './core';

/**
 * The chosen brand's mark, IF this design is one it should reach - otherwise null.
 *
 * Two designs are refused, and both refusals are the same rule read twice. A design with
 * `logo: 'none'` drew no slot, and nothing invents one (decision 2). A design with
 * `imageSlot: 'picture'` drew a slot for CONTENT rather than for a mark - `ls41`'s round
 * presenter avatar, `ls25`'s square cover artwork (model/wizard.ts) - and dropping a channel
 * mark into a headshot is the one outcome worse than dropping none: the operator's own file is
 * replaced by something they never chose. A picture slot is still filled by an image the person
 * imported themselves, because they picked it.
 */
export function brandMarkFor(variant: TemplateVariant, draft: WizardDraft): AssetFile | null {
  if (!draft.brandLogo) return null;
  if (variant.logo === 'none' || variant.imageSlot === 'picture') return null;
  return draft.brandLogo;
}

/**
 * The DraftPatch that applies a chosen BRAND to the draft (the wizard footer's brand chooser).
 *
 * Colour, typeface, and the brand's mark as `brandLogo` - which is a fact about the BRAND, not
 * about what the person imported, and is why it has a field of its own (see `WizardDraft`).
 * Whether that mark reaches the graphic is `draftToOptions`'s decision, per design.
 */
export function brandPatch(brand: import('../../../model/brand').ProjectBrand): DraftPatch {
  // ANYTHING THE CATALOG CANNOT NAME TRAVELS AS A CUSTOM PALETTE. A look CAPTURED off a
  // template (model/packets.ts captureLookFromTemplate) is minted with id 'captured', not
  // 'custom' - and `draftToOptions` resolves a non-custom palette through `paletteById`,
  // which knows neither id. Keying only on the literal 'custom' therefore sent 'captured'
  // down the lookup path, where `paletteById` SUBSTITUTES `PALETTES[0]` for anything it does
  // not recognise rather than admitting the miss - so the whole captured palette was replaced
  // by NoaCG Amber, silently. A graphic added through a production's "＋ New graphic for this
  // production…" door therefore came out in catalog colours beside the production it was
  // supposed to match, with only the typeface carrying. Measured on the Uutishuone pack:
  // production accent #6C4CF1, the new graphic emitted #f6a623.
  //
  // Membership, not the resolver: `paletteById` is total by design and can never report a
  // miss, so asking it whether an id is known is asking a question it cannot answer.
  const known = PALETTES.some((p) => p.id === brand.palette.id);
  return {
    customPalette: known ? null : brand.palette,
    paletteId: known ? brand.palette.id : null,
    fontId: brand.customFont ? 'custom' : brand.fontId,
    customFont: brand.customFont,
    brandLogo: brand.logo ?? null,
  };
}

/**
 * The DraftPatch that takes a brand back OFF the draft - the chooser moving to None, or to a
 * different brand (in which case this runs first and `brandPatch` writes the new one over it).
 *
 * Colour and typeface are cleared outright, as the old toggle did. The mark needs no unwinding
 * at all: it never entered `importedImages` or `logoAssetPath`, so dropping `brandLogo` leaves
 * whatever picture the person imported themselves exactly where it was, still chosen. That is
 * the whole reason the mark is a field of its own.
 */
export function brandClearPatch(): DraftPatch {
  return { paletteId: null, customPalette: null, fontId: null, customFont: null, brandLogo: null };
}

/**
 * The whole-unit category presets an imported design creates from, and the universal motion
 * each one IS. The wizard's Animation step shows the universal bank for that category (ten
 * cards instead of four), so a design that has not picked one still has to land on the same
 * data the card it shows lit would write - otherwise the control page, reading the data back,
 * would light nothing for a graphic the wizard said was "Fade".
 */
const WHOLE_UNIT_AS_UNIVERSAL: Partial<Record<AnimPresetId, MotionPresetId>> = {
  'design-fade': 'fade',
  'design-slide': 'rise',
  'design-pop': 'pop',
  'design-blur': 'blur',
};

/** A category preset the universal bank stands in for (the Animation step hides its card). */
export function isWholeUnitPreset(id: AnimPresetId): boolean {
  return WHOLE_UNIT_AS_UNIVERSAL[id] !== undefined;
}

/**
 * Whether a design's Animation step can offer the universal bank (blocks/motionPresets.ts)
 * BESIDE its category's own choreographies.
 *
 * Asked of the BUILT TEMPLATE, not of the category. The universal bank's promise is structural
 * - it moves the root's drawn children as one unit - so the honest question is whether this
 * design has such a unit, which only the emitted markup and its data block can answer. That is
 * also why it is now every category's question rather than the imported design's: an imported
 * design was never special here, it was only the first one asked (the ten motions were already
 * proven to apply and read back on every catalog category that carries a data block -
 * e2e/motion-presets.spec.ts). A hand-written variant with no data block, or a design whose
 * root draws nothing directly, answers false and keeps its own cards alone.
 */
export function usesUniversalMotion(template: SpxTemplate | null): boolean {
  if (!template) return false;
  const data = parseAnimData(template.js);
  return !!data && motionTargets(template, data).length > 0;
}

/** The universal motion each phase of the draft resolves to: the explicit pick, else the
 *  mapped whole-unit default; undefined keeps the category preset (the SVG layer stagger). */
export function universalPick(draft: WizardDraft, variant: TemplateVariant): MotionPick {
  const inId = draft.animation.presetId ?? variant.animationPresets[0];
  const outId = draft.animation.outPresetId ?? inId;
  const pick: MotionPick = {};
  const mIn = draft.animation.motionIn ?? WHOLE_UNIT_AS_UNIVERSAL[inId];
  const mOut = draft.animation.motionOut ?? WHOLE_UNIT_AS_UNIVERSAL[outId];
  if (mIn) pick.in = mIn;
  if (mOut) pick.out = mOut;
  return pick;
}

/** Write the draft's universal motion onto the built template - the same engine the control
 *  page applies after creation, so the wizard preview, the created graphic and the picker
 *  that reads it back agree by construction. */
export function withUniversalMotion(template: SpxTemplate, draft: WizardDraft, variant: TemplateVariant): SpxTemplate {
  // No structural gate here: `pick` is empty unless a universal card was actually clicked (or
  // the design's own default maps to one), and applyMotionPreset already answers null for a
  // template with no unit to move. Asking usesUniversalMotion again would only parse the same
  // data block a second time to reach the same conclusion.
  const pick = universalPick(draft, variant);
  if (!pick.in && !pick.out) return template;
  const data = parseAnimData(template.js);
  if (!data) return template;
  // 'auto' keeps each motion's tuned curve; a named easing overrides both phases, as it
  // does for the category presets.
  const tuned = (id: MotionPresetId) => {
    const m = motionPresetById(id);
    return { easeIn: m.in.ease, easeOut: m.out.ease };
  };
  const eases = {
    easeIn: pick.in ? resolveEasing(draft.animation.easing, tuned(pick.in)).easeIn : undefined,
    easeOut: pick.out ? resolveEasing(draft.animation.easing, tuned(pick.out)).easeOut : undefined,
  };
  const next = applyMotionPreset(template, data, pick, eases);
  const js = next && writeAnimData(template.js, next);
  return js ? { ...template, js } : template;
}
