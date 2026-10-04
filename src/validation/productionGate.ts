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

export interface ProductionGateFailure {
  /** The pool graphic's name (the operator-facing label). */
  name: string;
  errors: ValidationIssue[];
}

/** Every pool graphic that would be refused at the boundary, with why. Empty = may go to air. */
export function productionGateFailures(
  graphics: readonly SavedGraphic[],
  library: GraphicDoc[],
): ProductionGateFailure[] {
  const failures: ProductionGateFailure[] = [];
  for (const g of graphics) {
    const result = publishGate(templateForSavedGraphic(g, library),true);
    if (!result.ok) failures.push({ name: g.name, errors: result.errors });
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
  const lead = `"${first.name}" failed validation: ${first.errors[0]?.message ?? 'unknown error'}`;
  const more = failures.length > 1 ? ` (and ${failures.length - 1} more graphic${failures.length > 2 ? 's' : ''})` : '';
  return `${lead}${more}. Fix it in the editor before putting this production on air.`;
}

/** Throw unless every pool graphic passes - the one call the publish and export paths make. */
export function assertProductionGate(graphics: readonly SavedGraphic[], library: GraphicDoc[]): void {
  const failures = productionGateFailures(graphics, library);
  if (failures.length) throw new ProductionGateError(failures);
}
