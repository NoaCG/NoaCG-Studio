// THE BINGO CALLER BOARD: every number on a grid, lit as it is called, the newest one ringed
// and written large (docs/SVG_BEHAVIOUR_SHOWS.md §4g, the caller's board a bingo night keeps on
// screen; docs/SVG_BEHAVIOUR_PLAN.md §2c's `row-set` kind, proven on artwork here).
//
// WHAT HAS BEEN CALLED IS ONE LIST FIELD, a number per line in the order they were called, read
// by the runtime's `row-set` kind: a tile lights while its key is on the list (`listed`), the
// newest line's tile wears the ring (`last`), and the readouts derive the count and the last
// number from the same field. No state per number, no state per call - a controller that can
// only write fields runs the whole board by writing the list, and the `board` group of one state
// exists only to carry the three presses and repaint.
//
// CALLING A NUMBER IS ONE PRESS. "Call it" carries `add` - the list twin of `adjust`: the surface
// appends the Number to call box to the list and the whole list rides the event, so the tile
// lights exactly when the machine accepts the press and the operator's own box moves with the
// board. "Take back" is the honest inverse for a wrong call, and New game clears both boxes.
//
// THE NUMERALS ARE THE STUDENT'S OWN DRAWING. A tile's figure is a `write` role deriving the row's
// own key, so a layer named `Number 7` is stamped and written by the board rather than arriving
// as one of twenty-five operator fields to untick - the import trap the top ten walked into
// (docs/backlog/decorative-numerals-arrive-as-fields.md). An unnamed numeral still does.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const NUMBERS = 'numbers';
const CALL = 'call';
const CALL_EVENT = 'call';
const TAKE_BACK_EVENT = 'takeBack';
const NEW_GAME_EVENT = 'newGame';

function bingoMachine(): TypeMachine {
  const op = (event: string) => ({ from: 'live', to: 'live', trigger: 'operator' as const, event });
  return withRepaint({
    parallel: [
      {
        id: 'board',
        initial: 'live',
        // Every press re-enters the one state, which lands the press's list before the repaint
        // asks which tiles are lit and replays the newest tile's pop.
        states: [{ id: 'live', name: 'Board', timeline: null, edges: [op(CALL_EVENT), op(TAKE_BACK_EVENT), op(NEW_GAME_EVENT)] }],
      },
    ],
  });
}

const bingoControls = (): TypeControlEvent[] => [
  { event: CALL_EVENT, label: 'Call it', section: 'Calls', order: 1, add: { [NUMBERS]: CALL } },
  { event: TAKE_BACK_EVENT, label: 'Take back', section: 'Calls', order: 2, remove: { [NUMBERS]: CALL } },
  { event: NEW_GAME_EVENT, label: 'New game', section: 'Board', order: 900, destructive: true, set: { [NUMBERS]: '', [CALL]: '' } },
];

export const bingoRecipe: BehaviourRecipe = {
  id: 'bingo',
  name: 'Bingo caller',
  description: 'Every number you drew lights as it is called; the newest is ringed and written large.',
  category: 'quiz',
  defaultZone: 'mid-center',
  rows: rowsOf('bingo'),
  roles: rolesOf('bingo'),
  fields: () => [
    { key: NUMBERS, label: 'Called numbers', kind: 'lines', value: '', spec: { kind: 'row-set', rows: 'called' } },
    // A number, so the caller's box has + and - beside it; it is what Call it reads.
    { key: CALL, label: 'Number to call', kind: 'number', value: '' },
  ],
  path: () => ({ entrance: 'Board' }),
  machine: bingoMachine,
  controls: bingoControls,
  paint: () => [
    { write: 'number', rows: 'called', from: `${NUMBERS}:key` },
    { look: 'called', rows: 'called', when: { facts: [`${NUMBERS}:listed`] }, enter: 'pop' },
    { look: 'called.last', rows: 'called', when: { facts: [`${NUMBERS}:last`] }, enter: 'pop' },
    // The big number is a look as well as a readout: hidden until the first call, hidden again
    // after New game, because a readout with nothing to say is left as drawn.
    { write: 'latest', from: `${NUMBERS}:last` },
    { look: 'latest', when: { facts: [`${NUMBERS}:any`] }, enter: 'pop' },
    { write: 'tally', from: `${NUMBERS}:count` },
  ],
};
