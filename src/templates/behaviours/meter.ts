// THE METER: a bar toward a target (docs/BEHAVIOUR_SURVEY.md §3, "progress bar toward a target" -
// the catalog's goal meters are the same graphic on a design we drew).
//
// A fundraiser's total, a signature count, a stage's progress. The designer draws the bar at its
// FULL length - the vote board's model, a gauge with no moments - and two owned number fields
// carry the current figure and the target, so both are ± steppers on every control surface with
// nothing declared. The runtime's `fraction` kind derives current over target, clamped, and a
// percent readout writes it where the designer drew one. No machine: a meter changes because its
// DATA changes, which is the catalog goal meter's own argument.

import type { BehaviourRecipe } from './recipe';
import { rolesOf } from './recipe';

export const meterRecipe: BehaviourRecipe = {
  id: 'meter',
  name: 'Meter',
  description: 'A bar that fills toward a target as the figure the operator types goes up.',
  category: 'infographic',
  defaultZone: 'mid-center',
  roles: rolesOf('meter'),
  fields: () => [
    { key: 'current', label: 'Current', kind: 'number', value: '0' },
    { key: 'target', label: 'Target', kind: 'number', value: '100' },
  ],
  path: () => ({ entrance: 'On air' }),
  machine: () => ({}),
  controls: () => [],
  paint: () => [
    { gauge: 'bar', from: 'current:fraction' },
    { write: 'percent', from: 'current:percent' },
  ],
  artworkKinds: (ctx) => {
    const current = ctx.fieldId('current');
    const target = ctx.fieldId('target');
    return current ? { [current]: { kind: 'fraction', total: target ?? undefined } } : {};
  },
};
