// The LIBRARY -> AIR gate, at production grain (docs/AGENT_SAVE.md "The boundary gates").
//
// A library record is allowed to be a broken draft - the editor saves half-finished work, and
// an agent's save door stores a record the server never executed. What may NOT happen is a
// broken graphic reaching a renderer somebody else is pointing a camera at: the hosted publish
// (control/hostedControl.ts publishControlShow) and every production export
// (export/showExport.ts) run THIS before they do anything, and the production export dialog
// shows the same verdict the builder will enforce, so "the button was enabled but the build
// refused" cannot happen.
//
// Product promise, stated once: an invalid graphic cannot publish or export. The gate is
// `publishGate` per pool graphic over the LIVE library template (what actually ships), the
// same gate the community door and the bridge's validator run - one gate, several doors.

import { templateForSavedGraphic, type GraphicDoc } from '../model/library';
import type { SavedGraphic } from '../model/packets';
import { publishGate } from './publishGate';
import type { ValidationIssue } from './validateTemplate';
import type { SpxTemplate } from '../model/types';
import { FOREIGN_NOT_PLAYABLE, foreignExportRefusal, isForeignGraphic } from '../model/foreignPackage';

/** Early rundown admission and publication use the same production eligibility. */
export function validateProductionTemplate(template: SpxTemplate) {
  return publishGate(template, true);
}

export interface ProductionGateFailure {
  /** The pool graphic's name (the operator-facing label). */
  name: string;
  errors: ValidationIssue[];
}

/** Where the production is going: published to air, or exported to a target by its id. */
export type ProductionDoor = 'publish' | string;

/** Every pool graphic that would be refused at the boundary, with why. Empty = may go to air.
 *  A stranger's OGraf package (model/foreignPackage.ts) passes its record's gate, but it leaves
 *  only by the OGraf target and does not publish yet (its outputs are E3.2a's), so `door` says
 *  which way this production is going. */
export function productionGateFailures(
  graphics: readonly SavedGraphic[],
  library: GraphicDoc[],
  door?: ProductionDoor,
): ProductionGateFailure[] {
  const failures: ProductionGateFailure[] = [];
  for (const g of graphics) {
    const template = templateForSavedGraphic(g, library);
    const result = validateProductionTemplate(template);
    if (!result.ok) failures.push({ name: g.name, errors: result.errors });
    else if (door && door !== 'ograf' && isForeignGraphic(template)) {
      const message = door === 'publish' ? `${FOREIGN_NOT_PLAYABLE} Remove it from the production to publish.` : foreignExportRefusal(g.name);
      failures.push({ name: g.name, errors: [{ rule: 'foreign-package', message }] });
    }
  }
  return failures;
}

/** The refusal, in the words the production page and the export dialog show. */
export class ProductionGateError extends Error {
  constructor(readonly failures: ProductionGateFailure[]) {
    super(describeProductionGate(failures));
    this.name = 'ProductionGateError';
  }
}

export function describeProductionGate(failures: ProductionGateFailure[]): string {
  const first = failures[0];
  if (!first) return '';
  const more = failures.length > 1 ? ` (and ${failures.length - 1} more graphic${failures.length > 2 ? 's' : ''})` : '';
  // A stranger's package has no editor to fix it in: its own words say what to do.
  if (first.errors[0]?.rule === 'foreign-package') return `"${first.name}": ${first.errors[0].message}${more}`;
  const lead = `"${first.name}" failed validation: ${first.errors[0]?.message ?? 'unknown error'}`;
  return `${lead}${more}. Fix it in the editor before putting this production on air.`;
}

/** Throw unless every pool graphic passes - the one call the publish and export paths make. */
export function assertProductionGate(graphics: readonly SavedGraphic[], library: GraphicDoc[], door?: ProductionDoor): void {
  const failures = productionGateFailures(graphics, library, door);
  if (failures.length) throw new ProductionGateError(failures);
}
