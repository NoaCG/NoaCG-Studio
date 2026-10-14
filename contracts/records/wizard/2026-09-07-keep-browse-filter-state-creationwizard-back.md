# wizard/keep-browse-filter-state-creationwizard-back

Rule: `wizard/keep-browse-filter-state-creationwizard-back`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

Two chip clicks in one batch overwrite each other when the setter takes a value rather than an updater.

## Recorded 2026-10-14 on `claude/plan-wizard-shell-p9-build` at c65781a3f.

Retired in the close-out (S7) of docs/work-specs/wizard-structure/spec.md, section 7. The trap is structure now: the Browse filters are a field of the walk record that `src/components/wizard/shell/walkState.ts` owns in one `useReducer`, no step move touches them, and the shell passes `onFilters` as a `SetStateAction` dispatcher that sends `{ type: 'filters', update }`. `scripts/wizard-walk-state.test.mjs` ('filters compose as functional updates') pins the composition, and the held-walk journey in `e2e/wizard-draft-guard.spec.ts` returns with the filters intact. The rule also named a home the state left in S5.
