// THE STANDINGS: a ranking that sorts itself (docs/backlog/graphics-need-their-own-logic.md, level
// 1 - the owner's "a ranking that would also reorder the names and the position number just by
// adding or subtracting points").
//
// THE ROWS MOVE; THE WORDS STAY THEIRS. A row is a competitor's name and their points, both the
// operator's own fields, drawn in the row's starting place. When the points change, every row's
// layers travel into the slot its place in the table gives it - the runtime's `rank` kind orders
// the rows and a PLACE rule moves them - so the operator's box for a competitor is still that
// competitor's box after they have overtaken three others. Swapping the WORDS between slots
// instead would leave every box on the control page naming somebody else.
//
// THE POSITION NUMBERS STAY IN THEIR SLOTS. A `Position 1` drawn in the top row is the top slot's
// number whoever sits there, so it never moves: it is written with the place of whoever now does,
// which is its own drawn number until two rows tie (1, 2, 2, 4). A plate drawn behind each row
// (`Row 1`) travels with the row; a stripe the designer drew for the SLOT stays where it is.
//
// THE ORDER IS DATA, NOT A STATE. One `standings` group of one state carries the presses and the
// repaint, exactly as the bingo board's does; a controller that can only write fields reorders the
// table by writing the points, and a snap puts every row back in its slot from the figures alone.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const upEvent = (row: number): string => `up${row + 1}`;
const downEvent = (row: number): string => `down${row + 1}`;
const RESET_EVENT = 'resetPoints';

function rankingMachine(ctx: RecipeContext): TypeMachine {
  const op = (event: string) => ({ from: 'live', to: 'live', trigger: 'operator' as const, event });
  const events = [...ctx.rows.flatMap((_, i) => [upEvent(i), downEvent(i)]), RESET_EVENT];
  return withRepaint({
    parallel: [
      {
        id: 'standings',
        initial: 'live',
        // Every press re-enters the one state: the payload lands, and the repaint that follows
        // moves the rows. No state per order - six rows would be 720 of them.
        states: [{ id: 'live', name: 'Standings', timeline: null, edges: events.map(op) }],
      },
    ],
  });
}

function rankingControls(ctx: RecipeContext): TypeControlEvent[] {
  const perRow = ctx.rows.flatMap((key, i): TypeControlEvent[] => {
    // ONE SECTION PER COMPETITOR, under the name the designer drew for that row - the score
    // tracker's layout, because a ranking is operated the same way.
    const section = ctx.label('competitor', key);
    const points = ctx.fieldKey('points', key);
    if (!points) return [];
    return [
      { event: upEvent(i), label: '+1', section, order: i * 2 + 1, adjust: { [points]: 1 } },
      { event: downEvent(i), label: '−1', section, order: i * 2 + 2, adjust: { [points]: -1 } },
    ];
  });
  const zero = Object.fromEntries(ctx.rows.flatMap((key) => {
    const points = ctx.fieldKey('points', key);
    return points ? [[points, '0']] : [];
  }));
  return [
    ...perRow,
    // Zero, never the figures the designer drew: sample points show what the table looks like
    // mid-season, they do not say where a new round starts.
    { event: RESET_EVENT, label: 'Reset points', section: 'Standings', order: 900, destructive: true, set: zero },
  ];
}

export const rankingRecipe: BehaviourRecipe = {
  id: 'ranking',
  name: 'Standings',
  description: 'A ranking that sorts itself: change the points and the rows move to their new places.',
  category: 'scoreboard',
  defaultZone: 'mid-center',
  rows: rowsOf('ranking'),
  roles: rolesOf('ranking'),
  options: [
    {
      key: 'lowestFirst',
      label: 'Lowest first',
      hint: 'For times and golf scores: the smallest figure takes first place.',
      default: false,
    },
  ],
  fields: () => [],
  path: () => ({ entrance: 'Standings' }),
  machine: rankingMachine,
  controls: rankingControls,
  paint: () => [
    // The name, the points and any plate drawn behind the row travel together; the name marks
    // where each slot is.
    { place: 'competitor', rows: 'competitor', from: 'points:slot', anchor: 'competitor' },
    { place: 'points', rows: 'competitor', from: 'points:slot', anchor: 'competitor' },
    { place: 'plate', rows: 'competitor', from: 'points:slot', anchor: 'competitor' },
    { write: 'position', rows: 'competitor', from: 'points:slot-place' },
  ],
  // Every row's points are ONE standings: the same spec on each, so any one of them can say where
  // every row stands.
  artworkKinds: (ctx) => Object.fromEntries(ctx.rows.flatMap((key) => {
    const id = ctx.fieldId('points', key);
    return id
      ? [[id, { kind: 'rank', rows: 'competitor', role: 'points', ...(ctx.options.lowestFirst ? { order: 'asc' } : {}) }]]
      : [];
  })),
};
