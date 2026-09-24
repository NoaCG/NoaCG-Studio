// THE CREDITS ROLL: one pasted list rolls through the frame, bottom to top (docs/END_CREDITS.md;
// the owner's standing rule that a credit list is ONE field, never a field per name, because
// nobody knows in advance how many names a show has).
//
// The recipe declares two things about the artwork: the text layer named Credits, which is the
// operator's field AND the sample the two looks are copied from, and an optional Credits box the
// roll runs inside. Everything that moves lives in the assembler's own engine
// (templates/importedDesign/creditsRoll.ts), the same posture as the countdown's clock engine: a
// recipe emits no JavaScript, and a roll is playout motion rather than a paint rule. The take
// starts the roll through the entrance's own call, so SPX, CasparCG, OGraf and the dashboard all
// roll it the same way; the pace is the operator's, through the one owned field.

import { SPEED_FIELD_TITLES } from '../meta';
import type { BehaviourRecipe } from './recipe';
import { rolesOf } from './recipe';

export const CREDITS_RECIPE_ID = 'credits';
/** The field role the Credits text binds as, and the owned speed field's key - both read back
 *  out of the emitted NOACG_BEHAVIOUR table by the roll engine, so the ids are never retyped. */
export const CREDITS_FIELD_ROLE = 'credits';
export const CREDITS_BOX_ROLE = 'box';
export const CREDITS_SPEED_KEY = 'scrollSpeed';
/** The operator's pace, as a percentage of the authored one - the catalog's convention, and
 *  the same clamp (10-400) the catalog roll keeps so a roll always finishes. */
export const CREDITS_SPEED_DEFAULT = '100';
/** What the roll engine is called; the entrance fires it by name. */
export const CREDITS_ROLL_CALL = 'noacgCreditsRoll';

export const creditsRecipe: BehaviourRecipe = {
  id: CREDITS_RECIPE_ID,
  name: 'Credits roll',
  description: 'One pasted list rolls from the bottom of the frame to the top on Take, in the looks you drew.',
  category: 'end-credits',
  defaultZone: 'mid-center',
  roles: rolesOf(CREDITS_RECIPE_ID),
  fields: () => [{ key: CREDITS_SPEED_KEY, label: SPEED_FIELD_TITLES.scroll, kind: 'number', value: CREDITS_SPEED_DEFAULT }],
  // The entrance IS the roll: its call starts the travel the moment the graphic is taken. No
  // extra step and no machine of its own - Out is the only other verb a credit roll has.
  path: () => ({ entrance: 'Rolling', entranceCalls: [CREDITS_ROLL_CALL] }),
  machine: () => ({}),
  controls: () => [],
  paint: () => [],
};
