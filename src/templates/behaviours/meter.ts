// THE METER: a bar toward a target (docs/BEHAVIOUR_SURVEY.md §3, "progress bar toward a target" -
// the catalog's goal meters are the same graphic on a design we drew).
//
// A fundraiser's total, a signature count, a stage's progress. The designer draws the bar at its
// FULL length - the vote board's model, a gauge with no moments - and two owned number fields
// carry the current figure and the target, so both are ± steppers on every control surface with
// nothing declared. The runtime's `fraction` kind derives current over target, clamped, and a
// percent readout writes it where the designer drew one. No machine: a meter changes because its
// DATA changes, which is the catalog goal meter's own argument.
//
// TIERS (svg-template-library TL5, the built-in milestone track, Rules M1-M5): a meter may draw a
// row of tiers. Their lines ride one owned `Milestones` field, `Warm-up | 5000` per line (the
// built-in's wire), read by the runtime's `list` kind against Current: line n names tier n, its
// Reached look lights once Current is at or past its figure, and its Segment fills from the tier
// before to this one, so segments drawn end to end run the line from node to node. A tier the
// box has no line for hides. The box starts with the tiers as the designer drew them, so a take
// with nothing typed shows the drawing. A meter with no tiers is exactly the meter it was.

import type { BehaviourRecipe, RecipeContext, RecipeField } from './recipe';
import { rolesOf, rowsOf } from './recipe';

const TIER = 'tier';

/** The drawn tiers as the box's lines: `Label | figure` per drawn tier, in row order. A tier
 *  drawn without a Threshold is its label alone, which the runtime reads as never reached. */
function drawnMilestones(ctx: RecipeContext): string {
  return ctx.rows
    .map((key) => {
      const label = ctx.drawn('tier', key).trim();
      const figure = ctx.drawn('tier.figure', key).trim();
      return figure ? `${label} | ${figure}` : label;
    })
    .filter((line) => line !== '')
    .join('\n');
}

export const meterRecipe: BehaviourRecipe = {
  id: 'meter',
  name: 'Goal meter',
  description: 'A bar that fills toward a target as the figure the operator types goes up.',
  category: 'infographic',
  defaultZone: 'mid-center',
  rows: rowsOf('meter'),
  roles: rolesOf('meter'),
  fields: (ctx): RecipeField[] => [
    { key: 'current', label: 'Current', kind: 'number', value: '0' },
    { key: 'target', label: 'Target', kind: 'number', value: '100' },
    // Made after Current and Target, so their ids never move when tiers are drawn.
    ...(ctx.rows.length > 0
      ? [{ key: 'milestones', label: 'Milestones', kind: 'lines' as const, value: drawnMilestones(ctx), spec: { kind: 'list' as const, rows: TIER, of: 'current' } }]
      : []),
  ],
  path: () => ({ entrance: 'On air' }),
  machine: () => ({}),
  controls: () => [],
  paint: (ctx) => [
    { gauge: 'bar', from: 'current:fraction' },
    { write: 'percent', from: 'current:percent' },
    ...(ctx.rows.length > 0
      ? [
          { write: TIER, rows: TIER, from: 'milestones:label' },
          { write: 'tier.figure', rows: TIER, from: 'milestones:amount' },
          { look: TIER, rows: TIER, when: { facts: ['milestones:listed'] } },
          { look: 'tier.figure', rows: TIER, when: { facts: ['milestones:listed'] } },
          { look: 'tier.row', rows: TIER, when: { facts: ['milestones:listed'] } },
          { look: 'tier.reached', rows: TIER, when: { facts: ['milestones:reached'] } },
          { gauge: 'tier.bar', rows: TIER, from: 'milestones:span' },
        ]
      : []),
  ],
  artworkKinds: (ctx) => {
    const current = ctx.fieldId('current');
    const target = ctx.fieldId('target');
    return current ? { [current]: { kind: 'fraction', total: target ?? undefined } } : {};
  },
};
