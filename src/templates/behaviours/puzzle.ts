// THE PUZZLE BOARD: a phrase over tiles, letters revealed as they are called
// (docs/SVG_BEHAVIOUR_SHOWS.md, the Wheel of Fortune board).
//
// EVERY TILE'S TRUTH IS DERIVED FROM ONE TYPED FIELD, character by character, by the runtime's
// `puzzle` kind: the phrase is laid over the tiles in row order, a tile whose character is a
// space (or past the phrase's end) stays blank, one whose letter is in the revealed field shows
// it, and punctuation is never hidden. The operator types the phrase before the take; the
// revealed letters are a line list the board reads as a set of characters, so a controller with
// nothing but fields still runs the whole board by writing to it (the vote's rule: bars move on
// data). Solve is a step on the default path, so Continue reaches it too, and it shows every used
// tile whatever has been revealed.
//
// REVEALING A LETTER IS ONE PRESS. "Reveal letter" carries `add` - the list twin of `adjust`
// (docs/SVG_BEHAVIOUR_PLAN.md §13): the surface appends the Guess box to the revealed list and
// the whole list rides the event, so the letter lands exactly when the machine accepts the press
// and the operator's own box moves with the board. "Take back a letter" is its honest inverse.
// Both are self-transitions on a `letters` group of one state rather than arrows on the main
// path, because re-entering the entrance state would replay the entrance; the group exists to
// carry the press and repaint, nothing more.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const PHRASE = 'phrase';
const REVEALED = 'revealed';
const GUESS = 'guess';
const SOLVE_EVENT = 'solve';
const NEW_EVENT = 'newPuzzle';
const REVEAL_EVENT = 'revealLetter';
const UNREVEAL_EVENT = 'takeBackLetter';

function puzzleMachine(): TypeMachine {
  const op = (event: string) => ({ from: 'live', to: 'live', trigger: 'operator' as const, event });
  return withRepaint({
    main: {
      // The walk's own arrow, named for the press; Continue on a bare playout server still walks it.
      pathEvents: [SOLVE_EVENT],
      // …and the way back for the next puzzle, which also clears the letters (the control's set).
      edges: [{ from: { waypoint: 1 }, to: { waypoint: 0 }, trigger: 'operator', event: NEW_EVENT }],
    },
    parallel: [
      {
        id: 'letters',
        initial: 'live',
        states: [{ id: 'live', name: 'Letters', timeline: null, edges: [op(REVEAL_EVENT), op(UNREVEAL_EVENT)] }],
      },
    ],
  });
}

const puzzleControls = (): TypeControlEvent[] => [
  { event: REVEAL_EVENT, label: 'Reveal letter', section: 'Letters', order: 1, add: { [REVEALED]: GUESS } },
  { event: UNREVEAL_EVENT, label: 'Take back a letter', section: 'Letters', order: 2, remove: { [REVEALED]: GUESS } },
  { event: SOLVE_EVENT, label: 'Solve', section: 'Puzzle', order: 10 },
  { event: NEW_EVENT, label: 'New puzzle', section: 'Puzzle', order: 11, destructive: true, set: { [REVEALED]: '', [GUESS]: '' } },
];

export const puzzleRecipe: BehaviourRecipe = {
  id: 'puzzle',
  name: 'Puzzle board',
  description: 'A phrase over the tiles you drew; letters appear as you reveal them, and Solve shows the rest.',
  category: 'quiz',
  defaultZone: 'mid-center',
  rows: rowsOf('puzzle'),
  roles: rolesOf('puzzle'),
  fields: () => [
    { key: PHRASE, label: 'Puzzle', kind: 'text', value: '' },
    // A line list, so Reveal letter can add to it; typed on one line ("RSTLNE") it still reads,
    // because the puzzle kind asks whether a character is anywhere in the text.
    { key: REVEALED, label: 'Revealed letters', kind: 'lines', value: '' },
    { key: GUESS, label: 'Guess', kind: 'text', value: '' },
  ],
  path: () => ({ entrance: 'Puzzle', steps: [{ name: 'Solved', duration: 0.45 }] }),
  machine: puzzleMachine,
  controls: puzzleControls,
  paint: () => [
    { write: 'tile', rows: 'tile', from: `${PHRASE}:letter` },
    { look: 'tile', rows: 'tile', when: { facts: [`${PHRASE}:shown`] } },
    { look: 'tile', rows: 'tile', when: { state: ['main/solved'], facts: [`${PHRASE}:used`] } },
    { look: 'tile.used', rows: 'tile', when: { facts: [`${PHRASE}:used`] } },
    { look: 'solved', when: { state: ['main/solved'] }, enter: 'pop' },
  ],
  // The phrase's kind names the revealed field, which is minted beside it - so it is declared
  // here, after both ids exist, rather than on the field.
  artworkKinds: (ctx) => {
    const phrase = ctx.fieldId(PHRASE);
    return phrase ? { [phrase]: { kind: 'puzzle', rows: 'tile', revealed: ctx.fieldId(REVEALED) ?? undefined } } : {};
  },
};
