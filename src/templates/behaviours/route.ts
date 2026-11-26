// THE ROUTE: stops on a track, Next and Back (docs/work-specs/route-behaviour/spec.md). A show
// that travels: a station map on a rail, the evening's stops, a tour. The route sits at its start
// when the graphic is taken; each Next reaches the next stop, the travelled track draws itself in
// to it and the stop then fills in; Back runs it the other way.
//
// WHERE THE ROUTE IS, IS DATA, the lineup's shape (lineup.ts): one number field, `At stop`, read
// by the `row-pick` kind, 0 naming the start, so a controller can set it by number. A stop is
// REACHED when it is the pick or before it - two rules on one look, since a look shows when any
// rule holds. The group of states exists for the buttons alone: Next greys on the last stop and
// Back on the start. No per-stop buttons and no "nobody on": the owner asked for names, Next and
// Back, and nothing else.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const AT = 'at';
const NEXT_EVENT = 'nextStop';
const BACK_EVENT = 'previousStop';
const START = 'start';
const stateOf = (key: string): string => `s${key}`;

function routeMachine(ctx: RecipeContext): TypeMachine {
  const op = (from: string, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
  return withRepaint({
    parallel: [
      {
        id: 'route',
        initial: START,
        states: [
          { id: START, name: 'At the start', timeline: null, edges: [op(stateOf(ctx.rows[0]), START, BACK_EVENT)] },
          ...ctx.rows.map((key, i) => ({
            id: stateOf(key),
            name: `At ${ctx.label('stop', key)}`,
            timeline: null,
            edges: [
              op(i === 0 ? START : stateOf(ctx.rows[i - 1]), stateOf(key), NEXT_EVENT),
              ...(i + 1 < ctx.rows.length ? [op(stateOf(ctx.rows[i + 1]), stateOf(key), BACK_EVENT)] : []),
            ],
          })),
        ],
      },
    ],
  });
}

function routeControls(): TypeControlEvent[] {
  return [
    { event: NEXT_EVENT, label: 'Next stop', section: 'Route', order: 1, adjust: { [AT]: 1 } },
    { event: BACK_EVENT, label: 'Previous stop', section: 'Route', order: 2, adjust: { [AT]: -1 } },
  ];
}

export const routeRecipe: BehaviourRecipe = {
  id: 'route',
  name: 'Route',
  description: 'Stops on a track: Next draws the track on to the next stop, Back takes it back.',
  category: 'info-card',
  defaultZone: 'mid-right',
  rows: rowsOf('route'),
  roles: rolesOf('route'),
  fields: () => [{ key: AT, label: 'At stop', kind: 'number', value: '0', spec: { kind: 'row-pick', rows: 'stop' } }],
  path: () => ({ entrance: 'Route' }),
  machine: routeMachine,
  controls: routeControls,
  paint: () => [
    { look: 'stop.track', rows: 'stop', when: { facts: [`${AT}:picked`] }, enter: 'draw' },
    { look: 'stop.track', rows: 'stop', when: { facts: [`${AT}:before`] }, enter: 'draw' },
    { look: 'stop.reached', rows: 'stop', when: { facts: [`${AT}:picked`] }, enter: 'pop' },
    { look: 'stop.reached', rows: 'stop', when: { facts: [`${AT}:before`] } },
    { look: 'stop.here', rows: 'stop', when: { facts: [`${AT}:picked`] }, enter: 'pop' },
  ],
};
