// THE KIT PLAN - what "build the whole set" is, as data.
//
// A kit is BUILT THE MOMENT IT STARTS: every graphic the user ticked is created straight away
// in the kit's own Style, so the set is complete from the first screen and the user can finish
// without touching anything. Editing is then free rather than a walk - the kit's Finish step is
// the hub, any graphic opens from it, the tray jumps between them, and the ordinary
// Fields/Style/Animation steps configure whichever one is open. Each graphic keeps its OWN
// draft, so going back to one restores exactly what was chosen for it.
//
// The functions below are pure, so the transforms that build, re-shape and restyle a set of N
// graphics can be read and reasoned about without the wizard around them.
//
// THE STYLE TRANSFORM IS THE :root STYLE CONTRACT, nothing else (non-negotiables 1 and 5).
// "Apply this Style to all" re-runs `variant.create(options)` for each other design with the
// source graphic's palette, typeface, size knobs, declared-variable overrides and motion choice -
// the same options a user would have picked by hand on those steps. Nothing is patched onto
// emitted CSS after the fact, and a design that does not declare a variable simply does not
// receive it (buildDraftTemplate already skips those). See `kitLookPatch` for what does not travel.

import type { SpxTemplate } from '../../model/types';
import type { AnimPresetId, TemplateVariant } from '../../model/wizard';
import { paletteById } from '../../model/wizard';
import type { KitItem } from '../../templates/kit';
import type { TemplatePack } from '../../templates/packs';
import { buildDraftTemplate, initialDraft, mergeDraft, type DraftPatch, type WizardDraft } from './draft';

/** The kit being built, from the moment the Kit step's Next is taken. */
export interface KitPlan {
  pack: TemplatePack;
  /** The chosen contents, in the picker's offer order - the kit's starter first. Each item
   *  carries its picker key, so "which graphics are still wanted" is answerable by key. */
  items: KitItem[];
  /** Which item the Fields/Style/Animation steps are editing. The hub leaves it where it was,
   *  so a rail click back into Fields reopens the graphic last worked on. */
  current: number;
  /** Each graphic's own wizard answers, index-parallel to `items`. Re-opening a graphic loads
   *  this, which is what makes going back to one lossless. */
  drafts: WizardDraft[];
  /** Each graphic's code, index-parallel to `items`. Always complete: the set is built up front. */
  built: SpxTemplate[];
  /** The draft whose Style was last applied across the kit, if any. A graphic ADDED afterwards
   *  arrives in that Style, because the user already said this is what the kit looks like. */
  sharedLook: WizardDraft | null;
  /** True once any graphic has been opened for editing or a Style applied across the set -
   *  the fact a "switch to another kit?" confirmation has to weigh. */
  edited: boolean;
}

/** The kit's own name, and the production's default name. */
export function kitName(plan: KitPlan): string {
  return plan.pack.name;
}

/** The picker keys the plan was built from, in item order. */
export function kitKeys(plan: KitPlan): string[] {
  return plan.items.map((item) => item.key);
}

/**
 * THE STYLE, as a draft patch: everything one graphic decided that is a property of the SHOW
 * rather than of that one design.
 *
 * What travels: the palette (named or custom), the direct `:root` variable overrides, the
 * typeface (bundled or imported), the brand's mark, both size knobs, and the motion choice.
 *
 * What deliberately does NOT: `lines` (a scorebug's fields are not a strap's), `zone`/`nudge`
 * (a corner bug and a full-frame card do not share a placement), `logoEnabled` (a capability
 * of the design, not a look) and the graphic's NAME.
 *
 * The motion preset is carried only where the target design DECLARES it
 * (`variant.animationPresets` - what its own Animation step would have offered). A preset id
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
 * The kit's palette for ONE of its designs: the kit's `paletteId` where that palette is drawn
 * for the design's family (`Palette.styleTags`), and nothing otherwise. An off-family extra -
 * a glass strap in a minimal kit's library - keeps its own default, because Porcelain's light
 * paper panel on a frosted strap is a mistake rather than a look.
 */
export function kitPaletteFor(pack: TemplatePack, variant: TemplateVariant): string | undefined {
  if (!pack.paletteId) return undefined;
  return paletteById(pack.paletteId).styleTags.includes(variant.styleTag) ? pack.paletteId : undefined;
}

/**
 * The draft one kit graphic is configured from: the project format (a property of the whole
 * production), the design's own suggested lines, and then up to three look sources applied in
 * order of how deliberately they were chosen.
 *
 * **The order is the whole contract.** `packPaletteId` is the kit's curated taste pick, so it
 * loses to anything the user said. `brand` is the BRAND chosen in the footer - an explicit ask,
 * and the one the production-context open selects by itself, so it outranks the kit. `look` is
 * a Style the user applied across the kit, and it wins because it is the most recent deliberate
 * choice.
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

/** One new graphic of the kit, drafted and built. The ordinary `buildDraftTemplate` every
 *  other wizard door calls, so a kit graphic and a hand-made one are the same code. */
function newKitGraphic(
  pack: TemplatePack,
  item: KitItem,
  base: WizardDraft,
  brand: DraftPatch | null,
  sharedLook: WizardDraft | null,
): { draft: WizardDraft; built: SpxTemplate } {
  const draft = kitItemDraft(base, item.variant, {
    packPaletteId: kitPaletteFor(pack, item.variant),
    brand,
    look: sharedLook ? kitLookPatch(sharedLook, item.variant) : null,
  });
  return { draft, built: buildDraftTemplate(item.variant, draft) };
}

/**
 * THE WHOLE KIT, built now: every chosen graphic in the kit's own Style (its palette where the
 * palette is drawn for the design) and the footer's brand when one is chosen. Deterministic
 * and synchronous.
 */
export function buildKit(
  pack: TemplatePack,
  items: KitItem[],
  base: WizardDraft,
  brand: DraftPatch | null,
): KitPlan {
  const made = items.map((item) => newKitGraphic(pack, item, base, brand, null));
  return {
    pack,
    items,
    current: 0,
    drafts: made.map((m) => m.draft),
    built: made.map((m) => m.built),
    sharedLook: null,
    edited: false,
  };
}

/**
 * The kit after its CONTENTS changed (the user went back to the Kit step and ticked or unticked
 * graphics). Every graphic still wanted keeps its draft and its code exactly as edited; a new
 * one is built in the kit's Style - or in the Style last applied across the kit - and a removed
 * one is dropped. The open graphic stays open when it survived, else the hub starts from the
 * first.
 */
export function reconcileKit(
  plan: KitPlan,
  items: KitItem[],
  base: WizardDraft,
  brand: DraftPatch | null,
): KitPlan {
  const byKey = new Map(plan.items.map((item, i) => [item.key, i]));
  const drafts: WizardDraft[] = [];
  const built: SpxTemplate[] = [];
  for (const item of items) {
    const kept = byKey.get(item.key);
    if (kept !== undefined) {
      drafts.push(plan.drafts[kept]);
      built.push(plan.built[kept]);
    } else {
      const made = newKitGraphic(plan.pack, item, base, brand, plan.sharedLook);
      drafts.push(made.draft);
      built.push(made.built);
    }
  }
  const openKey = plan.items[plan.current]?.key;
  const current = Math.max(0, items.findIndex((item) => item.key === openKey));
  return { ...plan, items, drafts, built, current };
}

/**
 * Record the graphic being edited: its draft as it stands now, and the code built from that
 * draft (never from a preview that may be a render behind).
 */
export function commitKitGraphic(plan: KitPlan, draft: WizardDraft): KitPlan {
  const i = plan.current;
  const item = plan.items[i];
  if (!item || draft.variantId !== item.variant.id) return plan;
  return {
    ...plan,
    drafts: plan.drafts.map((d, j) => (j === i ? draft : d)),
    built: plan.built.map((t, j) => (j === i ? buildDraftTemplate(item.variant, draft) : t)),
    edited: true,
  };
}

/**
 * "APPLY THIS STYLE TO ALL": every OTHER graphic takes the source's Style through
 * `kitLookPatch` and is rebuilt; its text, placement and name stay. The source itself is the
 * caller's to commit first. Each graphic can still be customised on its own afterwards - this
 * is a one-off transform, not a lock.
 */
export function applyStyleToKit(plan: KitPlan, source: WizardDraft): KitPlan {
  const drafts = plan.drafts.map((d, i) =>
    i === plan.current ? d : mergeDraft(d, kitLookPatch(source, plan.items[i].variant)),
  );
  return {
    ...plan,
    drafts,
    built: plan.built.map((t, i) => (i === plan.current ? t : buildDraftTemplate(plan.items[i].variant, drafts[i]))),
    sharedLook: source,
    edited: true,
  };
}

/**
 * The footer's brand, applied to EVERY graphic of the set - not only the one on screen. A brand
 * writes the same four fields on every draft (wizard/draft `brandPatch`), so re-applying it is
 * a plain merge and a rebuild.
 */
export function rebrandKit(plan: KitPlan, brandFields: DraftPatch): KitPlan {
  const drafts = plan.drafts.map((d) => mergeDraft(d, brandFields));
  return {
    ...plan,
    drafts,
    built: drafts.map((d, i) => buildDraftTemplate(plan.items[i].variant, d)),
  };
}
