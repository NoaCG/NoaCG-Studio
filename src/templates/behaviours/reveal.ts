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

import type { BehaviourRecipe } from './recipe';
import { rolesOf } from './recipe';

const SECRET = 'secret';
const REVEAL_EVENT = 'reveal';

export const revealRecipe: BehaviourRecipe = {
  id: 'reveal',
  name: 'Reveal',
  description: 'Text you type stays sealed behind the cover you drew until one press reveals it.',
  category: 'reveal',
  defaultZone: 'mid-center',
  roles: rolesOf('reveal'),
  fields: () => [{ key: SECRET, label: 'The reveal', kind: 'text', value: '' }],
  path: () => ({ entrance: 'Sealed', steps: [{ name: 'Revealed', duration: 0.45 }] }),
  machine: () => ({ main: { pathEvents: [REVEAL_EVENT] } }),
  controls: () => [{ event: REVEAL_EVENT, label: 'Reveal', section: 'Reveal', order: 1 }],
  paint: () => [
    { write: SECRET, from: `${SECRET}:text` },
    { look: SECRET, when: { state: ['main/revealed'] }, enter: 'pop' },
    { look: 'cover', when: { state: ['main/sealed'] } },
  ],
};
