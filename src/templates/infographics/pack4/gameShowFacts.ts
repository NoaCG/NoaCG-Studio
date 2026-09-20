// The key-facts board in the three GAME-SHOW families (sticker, showtime, arcade): a show's
// "how to play" card - a heading over one "term | explanation" row per line.
//
// The four pack looks build this board from a parameterised skin (boards.ts). These three do not
// fit that parameter - their panels are a tilted paper label, a marquee plaque with bulbs and a
// two-layer pixel frame, none of which is a padding-and-radius variation - so each design brings
// its own stylesheet and shares everything that is CONTRACT: the markup, the two fields, and the
// rebuildInfographic() runtime that renders the rows from the hidden source.

import type { ResolvedOptions } from '../../../model/wizard';
import type { IgDesign } from '../shared';
import { boardFields, boardHtml } from './boards';
import { factRowsRuntimeJs } from './listRuntimes';

/** The starting content the three designs are drawn around: a quiz show's rules. */
export const GAME_SHOW_FACTS_SAMPLES = {
  facts:
    'Ten questions | One point for every correct answer\n' +
    'No conferring | The first answer you say is the one that counts\n' +
    'Tie-break | The closest guess takes the round',
  heading: 'HOW TO PLAY',
};

/** Assemble the board from a design's own stylesheet. `stageWidth` is the design's to add. */
export function buildGameShowFacts(o: ResolvedOptions, css: string): Omit<IgDesign, 'stageWidth'> {
  const { fields, rowsText, headingText } = boardFields(o, 'Facts', 'Heading');
  return {
    html: boardHtml(
      'Key facts: a heading over one "term | explanation" row per line.',
      headingText,
      rowsText,
      'facts',
    ),
    css,
    fields,
    // rebuildInfographic(): render the fact rows from the hidden #f0 source. Shared by every
    // design of this type - see listRuntimes.ts.
    runtimeExtraJs: factRowsRuntimeJs(),
  };
}
