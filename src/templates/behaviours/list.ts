// THE STEPPED LIST: entries revealed one per Next press (docs/SVG_BEHAVIOUR_SHOWS.md, the
// late-night top ten; the owner's rule for lists is "rows pasted as one field, NEXT reveals row
// by row", docs/OWNER_RULINGS.md).
//
// THE WHOLE BEHAVIOUR IS THE DEFAULT PATH. One step per entry, spliced onto the walk in reveal
// order, so SPX's Continue, CasparCG's NEXT, OGraf's steps and the app's own Next all drive it
// with no event of this recipe's own - challenge brief C7's contract with something to paint per
// step. Each entry's look is a rule for THAT ROW naming every step from its own onward (the
// table's `row` key), which is what keeps number ten up while nine, eight and the rest arrive;
// the mark is the same rule narrowed to the one step. No machine is declared: the derived walk
// is exactly right, and the plan's rule is to persist one only when it is wrong.
//
// The entries are one field, a line per number - line 1 is number 1 - written into the layers
// the designer drew; the option decides whether the walk runs from the last number down (the
// top-ten shape, on by default) or from the first up (an agenda).

import { slugify } from '../../blocks/animMachine';
import type { PaintRule } from '../../blocks/behaviourData';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf } from './recipe';

const ITEMS = 'items';

/** The row keys in the order they are revealed. */
function revealOrder(ctx: RecipeContext): string[] {
  return ctx.options.countdown === false ? [...ctx.rows] : [...ctx.rows].reverse();
}

/** The step a row is revealed on, named for what the state chip reads. */
const stepName = (key: string): string => `Number ${key}`;
const stateOf = (key: string): string => `main/${slugify(stepName(key))}`;

export const listRecipe: BehaviourRecipe = {
  id: 'list',
  name: 'Stepped list',
  description: 'Entries revealed one per Next press, from the last number down to one.',
  category: 'infographic',
  defaultZone: 'mid-center',
  rows: rowsOf('list'),
  roles: rolesOf('list'),
  options: [
    { key: 'countdown', label: 'Reveal from the last number down to 1', hint: 'Off, and the list reveals from 1 upwards.', default: true },
  ],
  fields: () => [{ key: ITEMS, label: 'Entries', kind: 'lines', value: '', spec: { kind: 'list', rows: 'item' } }],
  path: (ctx) => ({
    entrance: 'Title',
    steps: revealOrder(ctx).map((key) => ({ name: stepName(key), duration: 0.45 })),
  }),
  machine: () => ({}),
  controls: () => [],
  paint: (ctx): PaintRule[] => {
    const order = revealOrder(ctx);
    return [
      { write: 'item', rows: 'item', from: `${ITEMS}:label` },
      // Every entry from its own step on: a different state list per row, hence a rule per row.
      ...order.map((key, i): PaintRule => ({ look: 'item', row: key, when: { state: order.slice(i).map(stateOf) }, enter: 'pop' })),
      ...order.map((key): PaintRule => ({ look: 'item.mark', row: key, when: { state: [stateOf(key)] }, enter: 'pop' })),
    ];
  },
};
