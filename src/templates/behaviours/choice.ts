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
//
// A STARTING OPTION (svg-template-library TL5, an alert level's resting level): where the designer
// drew exactly one option visible, the binding names it `initial`, and the choice starts there and
// is never empty - no "none" state, no empty value, every option a button. Without it the choice
// starts empty, as every choice made before did.

import type { BehaviourRecipe, RecipeContext } from './recipe';
import { withRepaint } from './recipe';

const ROLE = 'option';
const FIELD = 'state';

/** The row the choice starts on, or null for the empty start. */
function initialOf(ctx: RecipeContext): string | null {
  const key = ctx.options.initial;
  return typeof key === 'string' && ctx.rows.includes(key) ? key : null;
}

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
      value: initialOf(ctx)?.toLowerCase() ?? '',
      options: [
        ...(initialOf(ctx) ? [] : [{ label: '-', value: '' }]),
        ...ctx.rows.map((key) => ({ label: ctx.label(ROLE, key), value: key.toLowerCase() })),
      ],
      // A row pick over the choice's own rows: "picked" holds on the option the value names, so
      // ONE rule paints every option and a second choice on the graphic cannot cross-light it.
      spec: { kind: 'row-pick', rows: ctx.ns(ROLE), ...(initialOf(ctx) ? { start: initialOf(ctx) as string } : {}) },
    },
  ],
  machine: (ctx) => {
    const start = initialOf(ctx);
    return withRepaint({
      parallel: [
        {
          id: ctx.nsId('group'),
          initial: start ? start.toLowerCase() : 'none',
          states: [
            ...(start ? [] : [{ id: 'none', name: `${ctx.name}: none`, timeline: null, edges: [] }]),
            ...ctx.rows.map((key) => ({
              id: key.toLowerCase(),
              name: `${ctx.name}: ${ctx.label(ROLE, key)}`,
              timeline: null,
              // Reachable from every OTHER option and from none - never from itself, which is
              // what greys the button for the option already showing. The STARTING option is the
              // exception: data alone can show another option while the machine stays on the start
              // (data never moves the machine), so its button must stay live to bring it back.
              edges: [
                ...(start ? [] : ['none']),
                ...ctx.rows.filter((k) => k !== key || k === start).map((k) => k.toLowerCase()),
              ].map((from) => ({
                from,
                to: key.toLowerCase(),
                trigger: 'operator' as const,
                event: ctx.nsId(key.toLowerCase()),
              })),
            })),
          ],
        },
      ],
    });
  },
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
