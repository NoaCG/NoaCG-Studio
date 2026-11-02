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
import type { TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, withRepaint } from './recipe';

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
/** The layouts and playbacks a credits list in the artwork's own styling can take
 *  (DesignSvgCredits), spelt as the proposal contract's credits intent spells them. */
export const CREDITS_LAYOUTS = ['role-above', 'role-beside'] as const;
export const CREDITS_PLAYBACKS = ['static', 'roll', 'cards'] as const;
/** Timed cards: the hold an author may state, in seconds. Below two a card cannot be read;
 *  past a minute the operator's Next is the honest control. */
export const CREDITS_CARD_SECONDS = { min: 2, max: 60 } as const;
/** Cards only: the operator's Card time field (blank: Next card only), the Next card event, and
 *  the engine call its press runs. */
export const CREDITS_CARD_TIME_KEY = 'cardTime';
export const CREDITS_NEXT_EVENT = 'nextCard';
export const CREDITS_NEXT_CALL = 'noacgCreditsNext';

const isCards = (ctx: RecipeContext) => ctx.credits?.playback === 'cards';

// Next card is a press on a parallel group of ONE state (the puzzle's Reveal letter): re-entering
// the entrance would replay it. Off air, and on the last card, the engine ignores it.
function cardsMachine(): TypeMachine {
  return withRepaint(
    {
      parallel: [
        {
          id: 'cards',
          initial: 'live',
          states: [
            {
              id: 'live',
              name: 'Cards',
              timeline: { name: 'Cards', duration: 0.2, ease: 'out', calls: [{ time: 0, call: CREDITS_NEXT_CALL }], layers: {} },
              edges: [{ from: 'live', to: 'live', trigger: 'operator', event: CREDITS_NEXT_EVENT }],
            },
          ],
        },
      ],
    },
    [CREDITS_NEXT_CALL],
  );
}

export const creditsRecipe: BehaviourRecipe = {
  id: CREDITS_RECIPE_ID,
  name: 'Credits roll',
  description: 'Your original text scrolls from below the frame until it clears the top on Take.',
  category: 'end-credits',
  defaultZone: 'mid-center',
  roles: rolesOf(CREDITS_RECIPE_ID),
  // A still page does not move, so it has no Scroll speed to offer; cards offer their Card time
  // instead, the author's to start with, blank for Next card only.
  fields: (ctx) =>
    ctx.credits?.playback === 'static'
      ? []
      : isCards(ctx)
        ? [{ key: CREDITS_CARD_TIME_KEY, label: 'Card time (s)', kind: 'number', value: ctx.credits?.advance === undefined ? '' : String(ctx.credits.advance) }]
        : [{ key: CREDITS_SPEED_KEY, label: SPEED_FIELD_TITLES.scroll, kind: 'number', value: CREDITS_SPEED_DEFAULT }],
  // The artwork engine waits for the current entrance to settle before measuring the roll.
  // The recipe only names the call; old editable rolls keep their original immediate take.
  path: () => ({ entrance: 'Rolling', entranceCalls: [CREDITS_ROLL_CALL] }),
  machine: (ctx) => (isCards(ctx) ? cardsMachine() : {}),
  controls: (ctx) => (isCards(ctx) ? [{ event: CREDITS_NEXT_EVENT, label: 'Next card', section: 'Credits', order: 1 }] : []),
  paint: () => [],
};
