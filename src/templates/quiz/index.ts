// The quiz catalog: game-show question graphics, family-consistent with the rest of the
// package (docs/DESIGN_LANGUAGE.md §8). Continue (next()) reveals the correct answer.

import type { TemplateVariant } from '../../model/wizard';
import { qz01 } from './qz01';
import { qz02 } from './qz02';
import { qz03 } from './qz03';
import { qz04 } from './qz04';
import { qz05 } from './qz05';
import { qz06 } from './qz06';
import { qz07 } from './qz07';
import { qz08 } from './qz08';
import { qz09 } from './qz09';
import { qz10 } from './qz10';
import { qz11 } from './qz11';
import { qz12 } from './qz12';
import { qz13 } from './qz13';
import { qz14 } from './qz14';
import { qz15 } from './qz15';

// Four-answer boards first (the classic), then the three- and two-answer ones, then the three
// SHOW boards whose answer count is a field (types/quizShow.ts). All fifteen are the same
// assembler — see quiz/shared.ts.
export const QUIZ: TemplateVariant[] = [
  qz01, // Arena Quiz — sport leaning card (sibling lt05/lt06)
  qz02, // House Quiz — noacg void card, amber accent (sibling lt11)
  qz03, // Frost Quiz — glass frosted card (sibling lt08)
  qz04, // Clean Quiz — minimal quiet card (sibling lt01)
  qz09, // Volt Triple — sport, three tall rows
  qz10, // House Triple — noacg, three tall rows
  qz11, // Frost Triple — glass, three tall chips
  qz12, // Clean Triple — minimal, three hairline-split rows
  qz05, // Arena Split — sport, two equal slabs
  qz06, // House Split — noacg, two equal blocks
  qz07, // Frost Split — glass, two equal blocks
  qz08, // Clean Split — minimal, two halves and a hairline
  qz13, // Sticker Quiz — neo-brutal labels in a two-by-two grid (sibling sb26/lt68)
  qz14, // Showtime Quiz — marquee plaque over pill answers (sibling sb27/lt69)
  qz15, // Arcade Quiz — pixel-cornered neon screen (sibling sb28/lt70)
];

export function quizById(id: string): TemplateVariant | undefined {
  return QUIZ.find((v) => v.id === id);
}
