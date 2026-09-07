# wizard/give-only-step-whose-left-pane

Rule: `wizard/give-only-step-whose-left-pane`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

The SVG mapping step wore it and its left pane is a form: the preview went to about 275 pixels wide on the step where the reader decides whether their text fits. Without it the preview is 614x345 on a 1366x768 laptop, four times the area. The Import flow Text step is a canvas and needs it, or the placement canvas drops under the 700px floor e2e/import-graphic.spec.ts holds. See docs/SVG_IMPORT_PLAN.md section 6a step 1.
