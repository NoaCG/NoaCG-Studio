// THE KIT PLAN — what "build the whole set" is, as data.
//
// A kit walks the SAME wizard steps a single graphic does; what it adds is a second axis of
// progress (which graphic of the set) and one decision a single graphic never has to make
// (does the first graphic's look carry to the rest). Both live here rather than in
// CreationWizard, so the transform that carries an identity across N graphics is a pure
// function that can be read, reasoned about and tested on its own.
//
// THE IDENTITY TRANSFORM IS THE :root STYLE CONTRACT, nothing else (non-negotiables 1 and 5).
// "Use this look for the other N" re-runs `variant.create(options)` for each remaining design
// with the first graphic's palette, typeface, size knobs, declared-variable overrides and
// motion choice — the same options a user would have picked by hand on those steps. There is
// no second store of "the kit's look", nothing is patched onto emitted CSS after the fact, and
// a design that does not declare a variable simply does not receive it (buildDraftTemplate
// already skips those). See `kitLookPatch` for the two things that deliberately do NOT travel.

import type { SpxTemplate } from '../../model/types';
import type { AnimPresetId, TemplateVariant } from '../../model/wizard';
import type { KitItem } from '../../templates/kit';
import type { TemplatePack } from '../../templates/packs';
import type { StyleTag } from '../../model/fonts';
import { buildDraftTemplate, initialDraft, mergeDraft, type DraftPatch, type WizardDraft } from './draft';

/** The kit being built, from the moment Browse's mode switch says "a whole kit". */
export interface KitPlan {
  pack: TemplatePack;
  family: StyleTag;
  /** The chosen contents, in the picker's offer order — the pack's curated order first. */
  items: KitItem[];
  /** The picker keys `items` was resolved from, so "is this still the same kit?" is answerable
   *  without re-resolving anything (`KitChoice.key`, src/templates/kit.ts). */
  keys: string[];
  /** Which item the wizard's steps are currently configuring. */
  current: number;
  /** The built template per item; `null` for one not reached yet. Index-parallel to `items`. */
  built: (SpxTemplate | null)[];
  /**
   * null = the look question has not been asked (the first graphic is still being made);
   * true = the first graphic's look was carried to the rest; false = walk each one.
   */
  propagate: boolean | null;
}

/** The kit's own name, and the production's default name. */
export function kitName(plan: KitPlan): string {
  return plan.pack.name;
}

/** Is every graphic in the set built? (The Finish step's precondition.) */
export function kitComplete(plan: KitPlan): boolean {
  return plan.built.every((t) => t !== null);
}

/**
 * THE IDENTITY, as a draft patch: everything the first graphic decided that is a property of
 * the SHOW rather than of that one design.
 *
 * What travels: the palette (named or custom), the direct `:root` variable overrides, the
 * typeface (bundled or imported), both size knobs, and the motion choice.
 *
 * What deliberately does NOT: `lines` (a scorebug's fields are not a strap's), `zone`/`nudge`
 * (a corner bug and a full-frame card do not share a placement), `logoEnabled` (a capability
 * of the design, not a look) and the graphic's NAME.
 *
 * The motion preset is carried only where the target design DECLARES it
 * (`variant.animationPresets` — what its own Animation step would have offered). A preset id
 * is not universal: `resolveOptions` passes one straight through to the assembler, so carrying
 * a lower third's `mask-wipe` onto a ticker would emit motion the design was never drawn for.
 * A design that does not declare it keeps its own tasteful default, which is the honest answer.
 */
export function kitLookPatch(source: WizardDraft, target: TemplateVariant): DraftPatch {
  const carries = (id: AnimPresetId | null): AnimPresetId | null =>
    id && target.animationPresets.includes(id) ? id : null;
  return {
    paletteId: source.paletteId,
    customPalette: source.customPalette,
    cssVarOverrides: source.cssVarOverrides,
    fontId: source.fontId,
    customFont: source.customFont,
    // The BRAND'S MARK is part of the look and travels with it, so every graphic of the set
    // carries it - not only the one that happened to be on screen when the brand was chosen.
    // `logoEnabled` still does not travel (a capability of the design, not a look): each
    // design's own slot decides whether there is anywhere to put it.
    brandLogo: source.brandLogo,
    sizeScale: source.sizeScale,
    typeScale: source.typeScale,
    animation: {
      presetId: carries(source.animation.presetId),
      outPresetId: carries(source.animation.outPresetId),
      direction: source.animation.direction,
      speed: source.animation.speed,
      easing: source.animation.easing,
      // `steps` stays the DESIGN's answer: a checklist is stepped by construction and a name
      // strap is not, so carrying one design's steps flag across a kit would break the other.
      steps: null,
    },
  };
}

/**
 * The draft one kit graphic is configured from: the project format (a property of the whole
 * production), the design's own suggested lines, and then up to three look sources applied in
 * order of how deliberately they were chosen.
 *
 * **The order is the whole contract.** `packPaletteId` is the pack's curated taste pick, so it
 * loses to anything the user said. `brand` is the BRAND chosen in the footer — an explicit
 * ask, and the one the production-context open selects by itself, so it outranks the pack. `look` is the first graphic's identity once the look question was answered
 * yes, and it wins because it is the most recent deliberate choice. Rebuilding from
 * `initialDraft()` without the middle one is what silently dropped the toggle on the kit path.
 */
export function kitItemDraft(
  base: WizardDraft,
  variant: TemplateVariant,
  opts: { packPaletteId?: string; brand?: DraftPatch | null; look?: DraftPatch | null } = {},
): WizardDraft {
  const fresh = initialDraft();
  return mergeDraft(
    {
      ...fresh,
      // The frame is authored once for the production, never per graphic.
      aspectId: base.aspectId,
      resolutionId: base.resolutionId,
      fps: base.fps,
      formatTouched: base.formatTouched,
    },
    {
      category: variant.category,
      variantId: variant.id,
      lines: variant.suggestedLines.map((l) => ({ ...l })),
      paletteId: opts.packPaletteId ?? null,
      ...(opts.brand ?? {}),
      ...(opts.look ?? {}),
    },
  );
}

/**
 * Build every graphic the set still needs, carrying the first one's identity. Deterministic
 * and synchronous: each is an ordinary `variant.create(options)` through `buildDraftTemplate`,
 * the same call every other wizard door makes.
 */
export function buildRemaining(plan: KitPlan, source: WizardDraft): (SpxTemplate | null)[] {
  return plan.items.map((item, i) => {
    if (plan.built[i]) return plan.built[i];
    return buildDraftTemplate(
      item.variant,
      // No `brand` here on purpose: `source` IS the first graphic's draft, which already had
      // the brand applied, and `kitLookPatch` carries its palette, typeface and mark forward.
      // Passing the brand again would be the same fact arriving twice by two routes.
      kitItemDraft(source, item.variant, {
        packPaletteId: plan.pack.paletteId,
        look: kitLookPatch(source, item.variant),
      }),
    );
  });
}
