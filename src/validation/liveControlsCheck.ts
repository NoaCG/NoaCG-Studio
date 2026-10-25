// `controls-missing-live` (docs/work-specs/pinned-live-controls/spec.md AC-9): a live operation the
// graphic DECLARES and leaves unmet. Only on that evidence: a number or a few-option field with no
// control is preparation by design (a quiz show's Answers shown, a clock's duration) and numbers
// already get their stepper, so a field alone is never a finding. A warning, never a block.
//
// Types only, so Node reads this file directly (cli/test/unit.test.mjs).

import type { AnimMachine } from '../blocks/animData';
import type { ValidationIssue } from './validateTemplate';

export const CONTROLS_MISSING_LIVE = 'controls-missing-live';

export function missingLiveControls(machine: AnimMachine, fieldIds: ReadonlySet<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const declared = new Set((machine.controls ?? []).map((c) => c.event));
  const reported = new Set<string>();
  for (const group of machine.groups) {
    for (const t of group.transitions) {
      // `next` is the transport's own Next, never a declared button.
      if (t.trigger !== 'operator' || !t.event || t.event === 'next' || declared.has(t.event) || reported.has(t.event)) continue;
      reported.add(t.event);
      issues.push({
        rule: CONTROLS_MISSING_LIVE,
        message: `The machine has an operator arrow "${t.event}" but no machine.controls entry for it: give it a label and the field it sets, adjusts or carries.`,
      });
    }
  }
  for (const control of machine.controls ?? []) {
    for (const [verb, keys] of [['sets', control.set], ['adjusts', control.adjust]] as const) {
      for (const key of Object.keys(keys ?? {})) {
        if (!fieldIds.has(key)) issues.push({ rule: CONTROLS_MISSING_LIVE, message: `Machine controls: "${control.event}" ${verb} "${key}", but no field has that id.` });
      }
    }
  }
  return issues;
}
