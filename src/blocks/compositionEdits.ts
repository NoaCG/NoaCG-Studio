import type { SpxTemplate } from '../model/types';
import { compositionPlacementRule, readCompositionPlacement, type CompositionValues } from '../model/compositionPlacement';
import { compositionSource } from './compositionSource';
export type { CompositionValues } from '../model/compositionPlacement';

function inspectComposition(template: SpxTemplate) {
  const placement = readCompositionPlacement(template.css, template.resolution);
  compositionSource(template, placement.css);
  return placement;
}
export function compositionValues(template: SpxTemplate): CompositionValues { return inspectComposition(template).values; }

/** A pure source patch; the session owns revision checks, atomic apply and Undo. */
export function editComposition(template: SpxTemplate, patch: Partial<CompositionValues>): SpxTemplate {
  if (!Object.keys(patch).length || Object.keys(patch).some(key => !['x', 'y', 'scale'].includes(key))) throw new Error('Provide a graphic position or scale.');
  const { css, values } = inspectComposition(template);
  return { ...template, css: css + compositionPlacementRule({ ...values, ...patch }, template.resolution) };
}
