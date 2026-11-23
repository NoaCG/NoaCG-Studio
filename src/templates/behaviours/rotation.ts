// THE ROTATION: drawn slides that take turns on their own (svg-template-library TL6: a rotating
// ticker, a sponsor rotation, a notice in two languages).
//
// THE BUILT-INS' MACHINE, ON ARTWORK. The ticker, the sponsor rotation and the two-language notice
// in the catalog are one shape (types/ticker.ts, types/identityBugs.ts, types/publicNotice.ts):
// the graphic arrives on its first item, a timer moves it on, Hold freezes what is showing and
// Resume moves on again. Here each item is a SLIDE the designer drew, a group shown while the
// machine is on it, so the whole behaviour is the machine's shape and the looks that follow it:
// no runtime word, no field the template writes (a timer never changes what an operator reads,
// types/AGENTS.md). Texts and pictures inside a slide are the artwork's own fields.
//
// ONE STATE PER SLIDE, and one HELD state per slide. A timer arrow leaves a counting slide for the
// next, the last for the first; Hold enters the held twin, which has no timer, so nothing re-arms
// it (the built-in sponsor rotation's `held`); Resume leaves it for the next slide, as the
// built-in notice resumes on the language that was not frozen. Next slide moves on at once and
// keeps counting, or, from a held slide, stays held on the next one.
//
// WRITTEN OUT, NOT FILTERED FROM A CATALOG MACHINE (behaviours/AGENTS.md asks for reuse where it
// fits): the built-in ticker and sponsor rotation keep their item as runtime data advanced by a
// call of their own (`tickerShowNext`, `sponsorShowNext`), which no imported runtime has, and the
// two-language notice is written for exactly two. Drawn slides need a state each instead.
//
// THE SLIDES ARE MAIN-PATH BRANCHES, as the built-ins' are: a timer arms only where a state's
// entry timeline settles, and the take is what plays the entrance. A rule naming the entrance
// waypoint shows slide 1 from the take.

import type { PaintRule } from '../../blocks/behaviourData';
import type { TypeBranch, TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

/** How long each slide holds before the next takes over (speed-relative seconds): the built-in
 *  sponsor rotation's six, which reads as deliberate and lets a notice line be read. */
const HOLD = 6;
const ENTRANCE = 'Rotating';
/** The entrance waypoint's state, as the machine names a step (its name, slugified). Written out
 *  rather than imported: templates/ takes nothing new from blocks/. */
const ENTRANCE_STATE = 'main/rotating';
const SKIP = 'skip';
const HOLD_EVENT = 'hold';
const RESUME = 'resume';

const counting = (key: string): string => `slide${key}`;
const held = (key: string): string => `held${key}`;

export const rotationRecipe: BehaviourRecipe = {
  id: 'rotation',
  name: 'Slideshow',
  description: 'Drawn slides that take turns on their own, every six seconds; Hold keeps one up.',
  category: 'ticker',
  defaultZone: 'bottom-center',
  rows: rowsOf('rotation'),
  roles: rolesOf('rotation'),
  fields: () => [],
  path: () => ({ entrance: ENTRANCE }),
  machine: (ctx: RecipeContext): TypeMachine => {
    const keys = ctx.rows;
    const op = (from: string | { waypoint: number }, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
    const branches: TypeBranch[] = [];
    keys.forEach((key, i) => {
      const prev = keys[(i + keys.length - 1) % keys.length];
      // Slide 2 is also where the take moves on to: slide 1 is up from the entrance itself.
      const fromTake = i === 1;
      branches.push({
        id: counting(key),
        name: `${ctx.label('slide', key)} on`,
        timeline: null,
        edges: [
          ...(fromTake ? [{ from: { waypoint: 0 }, to: counting(key), trigger: 'timer' as const, after: HOLD }] : []),
          { from: counting(prev), to: counting(key), trigger: 'timer' as const, after: HOLD },
          ...(fromTake ? [op({ waypoint: 0 }, counting(key), SKIP)] : []),
          op(counting(prev), counting(key), SKIP),
          op(held(prev), counting(key), RESUME),
        ],
      });
      branches.push({
        id: held(key),
        name: `${ctx.label('slide', key)} held`,
        timeline: null,
        edges: [
          ...(i === 0 ? [op({ waypoint: 0 }, held(key), HOLD_EVENT)] : []),
          op(counting(key), held(key), HOLD_EVENT),
          op(held(prev), held(key), SKIP),
        ],
      });
    });
    return withRepaint({ main: { branches } });
  },
  controls: (): TypeControlEvent[] => [
    { event: HOLD_EVENT, label: 'Hold', section: 'Rotation', order: 1 },
    { event: RESUME, label: 'Resume', section: 'Rotation', order: 2 },
    { event: SKIP, label: 'Next slide', section: 'Rotation', order: 3 },
  ],
  paint: (ctx): PaintRule[] =>
    ctx.rows.map((key, i): PaintRule => ({
      look: 'slide',
      row: key,
      when: { state: [...(i === 0 ? [ENTRANCE_STATE] : []), `main/${counting(key)}`, `main/${held(key)}`] },
    })),
};
