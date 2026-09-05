// THE ALERT: a graphic that clears itself (docs/BEHAVIOUR_SURVEY.md §4, "alert queue with
// auto-dismiss"; the catalog's `transition` type is the same arc on a design we drew).
//
// A follower pop, a donation flash, a breaking strap that must not sit there - the owner's own
// story for alerts is "plays, holds briefly, self-outs" (docs/OWNER_RULINGS.md, operator-stories
// 2026-08-27). On imported artwork that is one TIMER arrow from the entrance to the exit, armed
// when the entrance settles, plus the manual version for an operator cutting to their own rhythm.
// No roles, no owned fields, no paint: the whole behaviour is the machine's shape, and a recipe
// with nothing to bind is still a recipe, because the alternative is a graphic the operator has
// to remember to take off.
//
// THE HOLD IS AUTHORED, NOT A FIELD. A timer arrow's length is fixed when its state is entered
// (docs/STATE_MACHINE_SCHEMA.md); a "timer arrow whose duration comes from a field" is the one
// mechanism the survey named as still missing, so the hold is the recipe's own eight seconds
// until that lands - stated here rather than pretended around.

import type { BehaviourRecipe } from './recipe';

/** How long the alert holds before clearing itself, in speed-relative seconds. */
const HOLD = 8;

export const alertRecipe: BehaviourRecipe = {
  id: 'alert',
  name: 'Alert',
  description: 'It plays, holds for eight seconds, and takes itself off - or Next takes it off sooner.',
  category: 'alert',
  defaultZone: 'top-center',
  roles: [],
  fields: () => [],
  path: () => ({ entrance: 'Showing' }),
  machine: () => ({
    main: {
      // The self-clear: from the entrance straight to the exit, whatever the step count resolves to.
      edges: [{ from: { waypoint: 0 }, to: { waypoint: -1 }, trigger: 'timer', after: HOLD }],
      // …and the manual version, so an operator can cut it early.
      exitOnNext: true,
    },
  }),
  controls: () => [],
  paint: () => [],
};
