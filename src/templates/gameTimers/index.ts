// The game-timer catalog: four game-show countdown clocks, family-consistent with the
// rest of the package (docs/DESIGN_LANGUAGE.md §8) — built on the shared clock runtime.

import type { TemplateVariant } from '../../model/wizard';
import { gt01 } from './gt01';
import { gt02 } from './gt02';
import { gt03 } from './gt03';
import { gt04 } from './gt04';
import { gt05 } from './gt05';
import { gt06 } from './gt06';
import { gt07 } from './gt07';
import { gt08 } from './gt08';
import { gt09 } from './gt09';

export const GAME_TIMERS: TemplateVariant[] = [
  gt01, // game-show countdown #1 (style family + lower-third sibling noted in gt01.ts)
  gt02, // game-show countdown #2 (style family + lower-third sibling noted in gt02.ts)
  gt03, // game-show countdown #3 — the playful badge clock (kids' show, exuberant)
  gt04, // game-show countdown #4 — the composed stage-ring clock (kids' show, controlled)
  gt05, // House Countdown — noacg, amber bar + void panel (sibling lt11 House Strap)
  gt06, // Frost Countdown — glass, frosted card + accent-ringed clock pill (sibling lt08 / ss03)
  gt07, // Sticker Clock - paper label, ink title strip, heavy clock (sibling lt68)
  gt08, // Showtime Clock - marquee pill, clock in a ringed well (sibling lt69)
  gt09, // Arcade Clock - pixel-cornered neon panel, glowing clock (sibling lt70)
];

export function gameTimerVariantById(id: string): TemplateVariant | undefined {
  return GAME_TIMERS.find((v) => v.id === id);
}
