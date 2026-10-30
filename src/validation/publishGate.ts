// THE PUBLISH GATE - the ONE pure function that decides whether a template may leave the
// author's own editor for somewhere it will be trusted: a community pack, a hosted
// production (publish), a production export, the agent save door's re-gate on open. It
// composes the two automated checks - validateTemplate (SPX-contract correctness) and
// templateBench (share-safety) - into a single pass/fail with a merged issue list.
//
// It began life as src/community/gate.ts (Era 5.5, the closed gallery's publish/import gate),
// and moved here when it became the LIBRARY->AIR gate too (docs/AGENT_SAVE.md): the hosted
// publish path (control/hostedControl.ts) and the production exporter (export/showExport.ts)
// run it, and a processing domain reaching into the community feature for its gate read wrong.
//
// Why templateBench's unsafe-JS findings are ERRORS rather than warnings: with no reviewer
// downstream, a warning is a note nobody reads. It is a screen, not a sandbox (a determined
// author can evade a regex), so it does not make importing a stranger's template safe on its
// own - it makes publishing hostile code deliberate rather than accidental, and it stops the
// four opt-in blocks (live data, show chat, remote/hosted control) being shared pointing at the
// author's own backend.

import { validateTemplate, type ValidationIssue, type ValidationResult } from './validateTemplate';
import { runBench } from './templateBench';
import type { SpxTemplate } from '../model/types';
import { foreignRefusal, isForeignGraphic, readForeignPackage } from '../model/foreignPackage';

// A shared template must be fully self-contained: no external dependency (the offline-first
// pillar) and no reference to an asset the package doesn't carry. validateTemplate treats these
// as warnings for the general export path; for sharing and for air they block. `.supabase.co`
// refs are already exempted inside validateTemplate, so an opt-in realtime block still passes.
const PROMOTE_TO_ERROR = new Set(['external-dependency', 'missing-asset']);

/** Run the full automated gate over a template. `ok` is true only when nothing blocks. */
export function publishGate(template: SpxTemplate, production = false, runtimeError?: string | null): ValidationResult {
  // A stranger's OGraf package has no NoaCG code to check: its gate is its own record, read, and
  // its bytes, verified wherever they are used (model/foreignPackage.ts).
  if (isForeignGraphic(template)) {
    const read = readForeignPackage(template);
    return read.status === 'ok'
      ? { ok: true, errors: [], warnings: [] }
      : { ok: false, errors: [{ rule: 'foreign-package', message: foreignRefusal(template.name, read.status === 'read-only' ? read.reason : 'is not an OGraf package') }], warnings: [] };
  }
  const base = validateTemplate(template, { runtimeError });
  const bench = runBench(template,production);

  const errors: ValidationIssue[] = [...base.errors, ...bench.errors];
  const warnings: ValidationIssue[] = [];
  for (const issue of [...base.warnings, ...bench.warnings]) {
    if (PROMOTE_TO_ERROR.has(issue.rule)) errors.push(issue);
    else warnings.push(issue);
  }

  return { ok: errors.length === 0, errors, warnings };
}
