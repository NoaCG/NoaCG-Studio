// THE CHOICE: a set of mutually exclusive looks of one thing (docs/SVG_BEHAVIOUR_PLAN.md §7c).
//
// A status bug that is live, replay or standby; an election board's counted checkpoints; a
// weather card's day. The designer draws one hidden layer per option and names them
// `choice:Status/Live`, `choice:Status/Replay`, ... - or picks "part of a choice" beside each in
// the mapping step - and the operator gets one button per option with the current one greyed.
//
// Like the switch it is INSTANCED and its options are the recipe's ROWS, keyed by the option's own
// name, so `rows` in the table reads `["LIVE", "REPLAY", "STANDBY"]` and each look is stamped
// `choice.status.option/LIVE`. Exactly one option shows at a time, or none: the reported field
// starts empty, which is the honest state of a bug nobody has set yet.
//
// The look binds to the reported field, as the switch's does, for the same wire reason.

import type { BehaviourRecipe, RecipeContext } from './recipe';
import { withRepaint } from './recipe';

const ROLE = 'option';
const FIELD = 'state';

export const choiceRecipe: BehaviourRecipe = {
  id: 'choice',
  name: 'Choice',
  description: 'One of several drawn looks, chosen by the operator.',
  category: 'imported-design',
  defaultZone: 'mid-center',
  instanced: true,
  rows: { role: ROLE, keys: 'numbers', min: 2, max: 12 },
  roles: [{ id: ROLE, label: 'Option', kind: 'layer', paint: ['look'], perRow: true, pool: 'drawn', required: true, words: /^$/ }],
  fields: (ctx: RecipeContext) => [
    {
      key: ctx.ns(FIELD),
      label: ctx.name,
      kind: 'select',
      value: '',
      options: [{ label: '—', value: '' }, ...ctx.rows.map((key) => ({ label: ctx.label(ROLE, key), value: key.toLowerCase() }))],
      // A row pick over the choice's own rows: "picked" holds on the option the value names, so
      // ONE rule paints every option and a second choice on the graphic cannot cross-light it.
      spec: { kind: 'row-pick', rows: ctx.ns(ROLE) },
    },
  ],
  machine: (ctx) =>
    withRepaint({
      parallel: [
        {
          id: ctx.nsId('group'),
          initial: 'none',
          states: [
            { id: 'none', name: `${ctx.name}: none`, timeline: null, edges: [] },
            ...ctx.rows.map((key) => ({
              id: key.toLowerCase(),
              name: `${ctx.name}: ${ctx.label(ROLE, key)}`,
              timeline: null,
              // Reachable from every OTHER option and from none - never from itself, which is
              // what greys the button for the option already showing.
              edges: ['none', ...ctx.rows.filter((k) => k !== key).map((k) => k.toLowerCase())].map((from) => ({
                from,
                to: key.toLowerCase(),
                trigger: 'operator' as const,
                event: ctx.nsId(key.toLowerCase()),
              })),
            })),
          ],
        },
      ],
    }),
  controls: (ctx) =>
    ctx.rows.map((key, i) => ({
      event: ctx.nsId(key.toLowerCase()),
      label: ctx.label(ROLE, key),
      section: ctx.name,
      order: i + 1,
      set: { [ctx.ns(FIELD)]: key.toLowerCase() },
    })),
  paint: (ctx) => [{ look: ctx.ns(ROLE), rows: ctx.ns(ROLE), when: { facts: [`${ctx.ns(FIELD)}:picked`] } }],
};
