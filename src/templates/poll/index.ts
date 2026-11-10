// The live-vote catalog: the poll as it HAPPENS — voting open, voting closed, the result, the
// call. Family-consistent with the rest of the package (docs/DESIGN_LANGUAGE.md §8).
//
// Not to be confused with the `poll` GRAPHIC TYPE in the infographic category (ig02/ig11/ig12/
// ig13), which is the finished result chart: one look, no arc, no winner. These boards carry the
// vote itself, which is why they have states and it does not.

import type { TemplateVariant } from '../../model/wizard';
import { pl01 } from './pl01';
import { pl02 } from './pl02';
import { pl03 } from './pl03';
import { pl04 } from './pl04';
import { pl05 } from './pl05';
import { RESULT_BOARDS_CATALOG } from './results';

export const POLLS: TemplateVariant[] = [
  pl01, // House Vote — noacg void panel, amber edge (sibling lt11)
  pl02, // Volt Vote — sport results-night slab (sibling lt06)
  pl03, // Frost Vote — glass frosted card (sibling lt08)
  pl04, // Clean Vote — minimal quiet card (sibling lt01)
  // Appended AFTER pl01, deliberately: resolvePack takes the FIRST design of a family, so the
  // house KIT keeps pl01 and this one is reached through Browse.
  pl05, // Floor Vote — noacg wide bottom band, horizontal rows (sibling lt11)
  // The result boards (pl06..pl14): bars across, bars up and a donut, each full screen, as a
  // lower third and at the side, with the Figures choice (results.ts).
  ...RESULT_BOARDS_CATALOG,
];

export function pollById(id: string): TemplateVariant | undefined {
  return POLLS.find((v) => v.id === id);
}
