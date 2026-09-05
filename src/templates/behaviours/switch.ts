// THE SWITCH: a hidden layer becomes a Show / Hide pair (docs/SVG_BEHAVIOUR_PLAN.md §7c).
//
// The universal floor. An award card's winner name, a sponsor tag, a map's region highlight, a
// lineup's formation overlay - none of these is a behaviour anybody will write a recipe for, and
// all of them are a layer that is either up or not. The designer hides it and names it `show:X`,
// or ticks "a switch" beside it in the mapping step, and the operator gets Show X and Hide X.
//
// It is an INSTANCED recipe: a graphic may carry any number, each with its own name, so every
// role, field, group and event is namespaced by the instance (`ctx.ns`). That is also the first
// COMPOSITION: two switches, or a switch beside a quiz, are two parallel groups and two disjoint
// role sets, which the machine has always allowed and the binding never did.
//
// THE LOOK BINDS TO A FIELD, NOT TO THE STATE (docs/OGRAF_STATE_IN_FIELDS.md): the fact an
// operator sees rides a reported `select` field the button SETS, so a controller that can only
// send data - every OGraf host - shows or hides the layer by writing "on". The group exists for
// greying and for the animated change; the button's `set` keeps the two in step.

import type { BehaviourRecipe, RecipeContext } from './recipe';
import { withRepaint } from './recipe';

const ROLE = 'on';
const FIELD = 'state';

export const switchRecipe: BehaviourRecipe = {
  id: 'switch',
  name: 'Switch',
  description: 'A drawn layer the operator shows and hides.',
  category: 'imported-design',
  defaultZone: 'mid-center',
  instanced: true,
  roles: [{ id: ROLE, label: 'Shown', kind: 'layer', paint: ['look'], pool: 'drawn', required: true, words: /^$/ }],
  fields: (ctx: RecipeContext) => [
    {
      key: ctx.ns(FIELD),
      label: ctx.name,
      kind: 'select',
      value: 'off',
      options: [
        { label: 'Hidden', value: 'off' },
        { label: 'Shown', value: 'on' },
      ],
      spec: { kind: 'select' },
    },
  ],
  machine: (ctx) =>
    withRepaint({
      parallel: [
        {
          id: ctx.ns('group'),
          initial: 'off',
          states: [
            { id: 'off', name: `${ctx.name} hidden`, timeline: null, edges: [{ from: 'on', to: 'off', trigger: 'operator', event: ctx.ns('hide') }] },
            { id: 'on', name: `${ctx.name} shown`, timeline: null, edges: [{ from: 'off', to: 'on', trigger: 'operator', event: ctx.ns('show') }] },
          ],
        },
      ],
    }),
  controls: (ctx) => [
    { event: ctx.ns('show'), label: `Show ${ctx.name}`, section: 'Switches', set: { [ctx.ns(FIELD)]: 'on' } },
    { event: ctx.ns('hide'), label: `Hide ${ctx.name}`, section: 'Switches', set: { [ctx.ns(FIELD)]: 'off' } },
  ],
  paint: (ctx) => [{ look: ctx.ns(ROLE), when: { facts: [`${ctx.ns(FIELD)}:is:on`] } }],
};
