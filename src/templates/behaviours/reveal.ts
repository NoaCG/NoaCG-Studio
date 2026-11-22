// THE REVEAL: text the operator typed, sealed until one press shows it
// (docs/SVG_BEHAVIOUR_SHOWS.md, the Price Is Right's actual retail price; the owner's rule for
// reveal cards: taken on air hidden, ONE Reveal press fires the moment).
//
// No switch can do this, and that is the reason it is a recipe: a switch shows a layer the
// designer drew, and hidden text is never a field, so the price the operator TYPES has nowhere
// to hide. Here the drawn text is a write target the recipe's own field fills, shown only from
// the Revealed step on, and the cover the designer drew shows while the walk is still sealed.
// The reveal is the walk's own arrow named for the press, so Continue on a bare playout server
// reveals it too, and the button is the same arrow with a label.
//
// A CELEBRATION (svg-template-library TL5: the winner card's and the award reveal's moment after
// the result): where the designer drew one, Celebrate shows it and Settle puts it away. It rides a
// parallel group of its own, so the walk is untouched and a board without one compiles exactly as
// before.

import type { TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe } from './recipe';
import { rolesOf, withRepaint } from './recipe';

const SECRET = 'secret';
const REVEAL_EVENT = 'reveal';
const CELEBRATION = 'celebration';
const PARTY = 'celebration';

/** The celebration's group: calm, or on from Celebrate until Settle. */
const PARTY_MACHINE: TypeMachine = withRepaint({
  parallel: [
    {
      id: PARTY,
      initial: 'calm',
      states: [
        { id: 'calm', name: 'Settled', timeline: null, edges: [{ from: 'on', to: 'calm', trigger: 'operator', event: 'settle' }] },
        { id: 'on', name: 'Celebrating', timeline: null, edges: [{ from: 'calm', to: 'on', trigger: 'operator', event: 'celebrate' }] },
      ],
    },
  ],
});

export const revealRecipe: BehaviourRecipe = {
  id: 'reveal',
  name: 'Reveal',
  description: 'Text you type stays sealed behind the cover you drew until one press reveals it.',
  category: 'reveal',
  defaultZone: 'mid-center',
  roles: rolesOf('reveal'),
  fields: () => [{ key: SECRET, label: 'The reveal', kind: 'text', value: '' }],
  path: () => ({ entrance: 'Sealed', steps: [{ name: 'Revealed', duration: 0.45 }] }),
  machine: (ctx) => ({
    main: { pathEvents: [REVEAL_EVENT] },
    ...(ctx.bound(CELEBRATION) ? { parallel: PARTY_MACHINE.parallel } : {}),
  }),
  controls: (ctx) => [
    { event: REVEAL_EVENT, label: 'Reveal', section: 'Reveal', order: 1 },
    ...(ctx.bound(CELEBRATION)
      ? [
          { event: 'celebrate', label: 'Celebrate', section: 'Reveal', order: 2 },
          { event: 'settle', label: 'Settle', section: 'Reveal', order: 3 },
        ]
      : []),
  ],
  paint: (ctx) => [
    { write: SECRET, from: `${SECRET}:text` },
    { look: SECRET, when: { state: ['main/revealed'] }, enter: 'pop' },
    { look: 'cover', when: { state: ['main/sealed'] } },
    ...(ctx.bound(CELEBRATION) ? [{ look: CELEBRATION, when: { state: [`${PARTY}/on`] }, enter: 'pop' as const }] : []),
  ],
};
