// THE WORD CLOUD: the words a Word question gathered, sized by how many sent each
// (svg-template-library TL6; the built-in House Word Cloud, templates/audience/wordCloud.ts).
//
// The designer draws the cloud: one `Word n` text layer per slot, the most-sent word's slot first
// (usually the middle, and the largest), each drawn at the size the most-sent word should have and
// with a sample as wide as the slot may get. Staging writes the cue's `Words` (`word | count`
// lines, most first, control/wordStaging.ts) and its `Question`, found by TITLE, so the Words box
// is named exactly that and the question is the artwork's own `Question` text.
//
// The runtime's `word-counts` kind fills slot n with line n and weighs it against the others; the
// write's `size` draws it between half and all of its drawn size and keeps it inside its sample
// (behaviourRuntime.ts). A slot without a line hides. No machine: a cloud comes on and goes off.
//
// Words STARTS with the drawn samples at equal counts, so a take with nothing staged shows the drawing.

import type { PaintRule } from '../../blocks/behaviourData';
import type { BehaviourRecipe } from './recipe';
import { rolesOf, rowsOf } from './recipe';

const WORDS = 'words';

export const wordCloudRecipe: BehaviourRecipe = {
  id: 'wordcloud',
  name: 'Word cloud',
  description: 'The staged words in the slots you drew, the most-sent largest; a slot with no word hides.',
  category: 'infographic',
  defaultZone: 'mid-center',
  rows: rowsOf('wordcloud'),
  roles: rolesOf('wordcloud'),
  fields: (ctx) => [
    {
      key: WORDS,
      // The feature contract's title (model/wordCloud.ts `wordCloudFields`): never translated.
      label: 'Words',
      kind: 'lines',
      // Equal counts, so every drawn word keeps its drawn size; a slot drawn empty keeps its place.
      value: ctx.rows.map((key) => `${ctx.drawn('word', key).trim() || `Word ${key}`} | 1`).join('\n'),
      spec: { kind: 'word-counts', rows: 'word' },
    },
  ],
  path: () => ({ entrance: 'Words' }),
  machine: () => ({}),
  controls: () => [],
  paint: (): PaintRule[] => [
    { look: 'word', rows: 'word', when: { facts: [`${WORDS}:listed`] } },
    { write: 'word', rows: 'word', from: `${WORDS}:label`, size: `${WORDS}:weight` },
  ],
};
