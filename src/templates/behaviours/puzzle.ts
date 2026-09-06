// THE PUZZLE BOARD: a phrase over tiles, letters revealed as they are called
// (docs/SVG_BEHAVIOUR_SHOWS.md, the Wheel of Fortune board).
//
// EVERY TILE'S TRUTH IS DERIVED FROM ONE TYPED FIELD, character by character, by the runtime's
// `puzzle` kind: the phrase is laid over the tiles in row order, a tile whose character is a
// space (or past the phrase's end) stays blank, one whose letter is in the revealed field shows
// it, and punctuation is never hidden. The operator types the phrase before the take and adds
// letters to "Revealed letters" as the contestants call them - a data write, which is the
// vote's rule (bars move on data) and the reason a controller with nothing but fields runs the
// whole board. Solve is a step on the default path, so Continue reaches it too, and it shows
// every used tile whatever has been revealed.
//
// What the recipe cannot offer is a "Reveal R" BUTTON: adding a letter to the revealed field is
// an append, and no control carries one (payload rides a field as it reads, adjust moves a
// number, set writes a constant). Recorded in docs/SVG_BEHAVIOUR_PLAN.md §13 rather than worked
// around here with an event that mutates a field from inside the template.

import type { BehaviourRecipe } from './recipe';
import { rolesOf, rowsOf } from './recipe';

const PHRASE = 'phrase';
const REVEALED = 'revealed';
const SOLVE_EVENT = 'solve';
const NEW_EVENT = 'newPuzzle';

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
    { key: REVEALED, label: 'Revealed letters', kind: 'text', value: '' },
  ],
  path: () => ({ entrance: 'Puzzle', steps: [{ name: 'Solved', duration: 0.45 }] }),
  machine: () => ({
    main: {
      // The walk's own arrow, named for the press; Continue on a bare playout server still walks it.
      pathEvents: [SOLVE_EVENT],
      // …and the way back for the next puzzle, which also clears the letters (the control's set).
      edges: [{ from: { waypoint: 1 }, to: { waypoint: 0 }, trigger: 'operator', event: NEW_EVENT }],
    },
  }),
  controls: () => [
    { event: SOLVE_EVENT, label: 'Solve', section: 'Puzzle', order: 1 },
    { event: NEW_EVENT, label: 'New puzzle', section: 'Puzzle', order: 2, destructive: true, set: { [REVEALED]: '' } },
  ],
  paint: () => [
    { write: 'tile.letter', rows: 'tile', from: `${PHRASE}:letter` },
    { look: 'tile.letter', rows: 'tile', when: { facts: [`${PHRASE}:shown`] } },
    { look: 'tile.letter', rows: 'tile', when: { state: ['main/solved'], facts: [`${PHRASE}:used`] } },
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
