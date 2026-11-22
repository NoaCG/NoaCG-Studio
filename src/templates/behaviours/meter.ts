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

/** Does the meter draw tiers? Without, it is exactly the meter it was. */
const hasTiers = (ctx: RecipeContext): boolean => ctx.rows.length > 0;

/** The drawn tiers as the box's lines: `Label | figure` per tier, one line per row so line n
 *  stays row n. A tier drawn without a Threshold has no figure, so it is never reached; its line
 *  still ends in a bar sign where the label holds one, or the label would be split at it. A tier
 *  drawn with no text at all is named for its row (`Tier 2`), never dropped. */
function drawnMilestones(ctx: RecipeContext): string {
  return ctx.rows
    .map((key) => {
      const label = ctx.drawn('tier', key).trim() || ctx.label('tier', key);
      const figure = ctx.drawn('tier.figure', key).trim();
      return figure ? `${label} | ${figure}` : label.includes('|') ? `${label} |` : label;
    })
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
    ...(hasTiers(ctx)
      ? [{ key: 'milestones', label: 'Milestones', kind: 'lines' as const, value: drawnMilestones(ctx), spec: { kind: 'list' as const, rows: 'tier', of: 'current' } }]
      : []),
  ],
  path: () => ({ entrance: 'On air' }),
  machine: () => ({}),
  controls: () => [],
  paint: (ctx) => [
    { gauge: 'bar', from: 'current:fraction' },
    { write: 'percent', from: 'current:percent' },
    ...(hasTiers(ctx)
      ? [
          { write: 'tier', rows: 'tier', from: 'milestones:label' },
          { write: 'tier.figure', rows: 'tier', from: 'milestones:amount' },
          // A readout shows only while its line has something to write, so it never keeps an
          // old label or figure (a readout with nothing to say is left as it was).
          { look: 'tier', rows: 'tier', when: { facts: ['milestones:has-label'] } },
          { look: 'tier.figure', rows: 'tier', when: { facts: ['milestones:has-amount'] } },
          { look: 'tier.row', rows: 'tier', when: { facts: ['milestones:listed'] } },
          { look: 'tier.reached', rows: 'tier', when: { facts: ['milestones:reached'] } },
          { gauge: 'tier.bar', rows: 'tier', from: 'milestones:span' },
        ]
      : []),
  ],
  artworkKinds: (ctx) => {
    const current = ctx.fieldId('current');
    const target = ctx.fieldId('target');
    return current ? { [current]: { kind: 'fraction', total: target ?? undefined } } : {};
  },
};
