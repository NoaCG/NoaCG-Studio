// The six designs the /ograf page offers, imported one by one instead of through the catalog.
//
// The catalog (templates/catalog.ts) is every design and the whole type registry, megabytes of
// code; this page shows six. Each entry is built exactly as the catalog builds it - a
// hand-written variant as it is, a type-promoted one compiled from its type - so a starter and
// the catalog design of the same name produce the same graphic. e2e/ograf-starters.spec.ts
// compares the two for every card, and fails when a card's name or design drifts from the catalog.

import type { TemplateVariant } from '../model/wizard';
import { lt01 } from '../templates/lowerThirds/lt01';
import { tk01 } from '../templates/tickers/tk01';
import { ig01 } from '../templates/infographics/ig01';
import { variantFromType, type GraphicType } from '../templates/types/graphicType';
import { sponsorBugType } from '../templates/types/bugs';
import { scoreboardType } from '../templates/types/scoreboard';
import { holdingScreenType } from '../templates/types/clocks';

function promoted(type: GraphicType, id: string): TemplateVariant | undefined {
  const design = type.designs.find((d) => d.id === id);
  return design && variantFromType(type, design);
}

/** Keyed by the catalog name each card carries in its data-starter attribute. */
export const STARTERS = new Map<string, TemplateVariant | undefined>([
  ['Hairline', lt01],
  ['Glass Mark', promoted(sponsorBugType, 'bug01')],
  ['News Strip', tk01],
  ['Match Strip', promoted(scoreboardType, 'sb01')],
  ['Big Stat', ig01],
  ['House Hold', promoted(holdingScreenType, 'ss04')],
]);
