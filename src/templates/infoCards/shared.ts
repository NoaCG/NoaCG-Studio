// Info-card scaffolding — the category-generic assembler bound to the info-card contract:
// class prefix "info-card", a wider auto-fit cap (cards carry more text than straps), and the
// card root comment. Cards default to centered/right zones and read as the SIBLINGS of
// their lower-third counterparts (docs/DESIGN_LANGUAGE.md §8).
//
// Structure contract:
//   <div class="info-card">            root — positioned by zone; opacity:0 until play()
//     [<div class="info-card-accent">] optional accent shape
//     <div class="info-card-box">      the panel; presets animate this
//       <div class="info-card-mask"><span id="f0" class="info-card-name">…</span></div>
//       <div class="info-card-mask"><span id="f1" class="info-card-title">…</span></div>
//       <div class="info-card-mask"><span id="f2" class="info-card-extra">…</span></div>
//     </div>
//   </div>

import type { SpxTemplate, Resolution } from '../../model/types';
import type { ResolvedOptions } from '../../model/wizard';
import {
  assembleStandard,
  lineClassFor,
  lineMasksFor,
  makeDefineVariant,
  type CategorySpec,
  type StandardDesign,
  type StandardMeta,
} from '../shared/standard';

export type CardDesign = StandardDesign;
export type CardMeta = StandardMeta;

const CARD_CATEGORY: CategorySpec = {
  type: 'info-card',
  prefix: 'info-card',
  rootComment: 'Info card. Hidden until play(); positioned by the .info-card rule in the CSS.',
  // Cards may be wider than lower thirds: up to 56% of frame width inside safe areas.
  maxTextWidth: (res: Resolution) =>
    Math.round(Math.min(res.width * 0.56, res.width - 2 * (res.width * 0.0625))),
  // The LAST category to flip (docs/STATE_MACHINE_SCHEMA.md): info cards are the standard
  // contract's other line-based family, so they convert exactly like lower thirds — steps and
  // all. They flipped last only because they hosted the classic strip's spec suite, which now
  // runs against a SAVED legacy template instead (the case the strip actually still serves).
  dataRegion: true,
};

export function cardLineClass(index: number): string {
  return lineClassFor('info-card', index);
}

export function cardLineMasks(o: ResolvedOptions, indent = '      '): string {
  return lineMasksFor('info-card', o, indent);
}

export function assembleInfoCard(meta: CardMeta, design: CardDesign, o: ResolvedOptions): SpxTemplate {
  return assembleStandard(CARD_CATEGORY, meta, design, o);
}

/** The authoring API for info-card variant modules. */
export const defineCardVariant = makeDefineVariant(CARD_CATEGORY);
