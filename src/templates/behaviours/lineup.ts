// THE LINEUP: who is on now, who has been on, who is still to come (docs/SVG_BEHAVIOUR_SHOWS.md,
// the desk show's "tonight" card; docs/SVG_BEHAVIOUR_PLAN.md §9f with the verb it lacked).
//
// WHO IS ON IS DATA: one number field, `On now`, read by the runtime's `row-pick` kind, so the
// lit row binds to the field (a controller writes "2" and guest two lights) and the two ORDER
// facts the kind exposes - `before` the pick, `after` it - are what dim the guests already
// done, with no state per guest describing the same thing twice. The group that does exist is
// for the buttons: a state per guest lets the structural guard grey Next on the last one and
// Back on the first, while the press itself rides `adjust` on the field, the score's `+1`.
// The nearly machineless graphic §9f asked the system to admit is what this is.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const NOW = 'now';
const NEXT_EVENT = 'nextGuest';
const BACK_EVENT = 'previousGuest';
const CLEAR_EVENT = 'nobodyOn';
const guestEvent = (key: string): string => `guest${key}`;
const NONE = 'none';
const stateOf = (key: string): string => `g${key}`;

function lineupMachine(ctx: RecipeContext): TypeMachine {
  const op = (from: string, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
  const all = [NONE, ...ctx.rows.map(stateOf)];
  return withRepaint({
    parallel: [
      {
        id: 'lineup',
        initial: NONE,
        states: [
          {
            id: NONE,
            name: 'Nobody on',
            timeline: null,
            edges: [op(stateOf(ctx.rows[0]), NONE, BACK_EVENT), ...ctx.rows.map((key) => op(stateOf(key), NONE, CLEAR_EVENT))],
          },
          ...ctx.rows.map((key, i) => ({
            id: stateOf(key),
            name: `${ctx.label('guest', key)} on`,
            timeline: null,
            edges: [
              op(i === 0 ? NONE : stateOf(ctx.rows[i - 1]), stateOf(key), NEXT_EVENT),
              ...(i + 1 < ctx.rows.length ? [op(stateOf(ctx.rows[i + 1]), stateOf(key), BACK_EVENT)] : []),
              // Straight to this guest from anywhere else - never from itself, which greys the
              // button for the guest already on.
              ...all.filter((s) => s !== stateOf(key)).map((s) => op(s, stateOf(key), guestEvent(key))),
            ],
          })),
        ],
      },
    ],
  });
}

function lineupControls(ctx: RecipeContext): TypeControlEvent[] {
  return [
    { event: NEXT_EVENT, label: 'Next guest', section: 'Lineup', order: 1, adjust: { [NOW]: 1 } },
    { event: BACK_EVENT, label: 'Previous guest', section: 'Lineup', order: 2, adjust: { [NOW]: -1 } },
    ...ctx.rows.map((key, i): TypeControlEvent => ({
      event: guestEvent(key),
      label: ctx.label('guest', key),
      section: 'Straight to',
      order: 10 + i,
      set: { [NOW]: key },
    })),
    { event: CLEAR_EVENT, label: 'Nobody on', section: 'Lineup', order: 900, set: { [NOW]: '0' } },
  ];
}

export const lineupRecipe: BehaviourRecipe = {
  id: 'lineup',
  name: 'Lineup',
  description: 'The guest who is on now lit, the ones already on dimmed, and Next moves along the list.',
  category: 'info-card',
  defaultZone: 'mid-center',
  rows: rowsOf('lineup'),
  roles: rolesOf('lineup'),
  // A NUMBER, so Next and Back can ride `adjust`; the row-pick kind reads it as the row key, and
  // 0 names nobody, which is the honest state of a card just taken to air.
  fields: () => [{ key: NOW, label: 'On now', kind: 'number', value: '0', spec: { kind: 'row-pick', rows: 'guest' } }],
  path: () => ({ entrance: 'Tonight' }),
  machine: lineupMachine,
  controls: lineupControls,
  paint: () => [
    { look: 'guest.now', rows: 'guest', when: { facts: [`${NOW}:picked`] }, enter: 'pop' },
    { look: 'guest.done', rows: 'guest', when: { facts: [`${NOW}:before`] } },
  ],
};
