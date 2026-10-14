# wizard/hold-import-images-continuation-old-importstep

Rule: `wizard/hold-import-images-continuation-old-importstep`. Recorded 2026-09-24 on `claude/a-close-old-editor` at 2ef023324.

Superseded on 2026-09-24 by row A of the night wave: the rule it replaces opened with 'make blank a setup step', and the Blank step is deleted along with every door to the old code editor (goal 3). The step-index clauses still hold and are carried over unchanged.

## Recorded 2026-10-14 on `claude/plan-wizard-shell-p9-build` at c65781a3f.

Retired in the close-out (S7) of docs/work-specs/wizard-structure/spec.md, section 7. No step index is computed in the shell any more: every walk is data with a `StepId` per step (`src/components/wizard/shell/walks.ts`, the template and kit walks in `src/components/wizard/template/walk.ts`), and `scripts/wizard-walks.test.mjs` pins each walk's step ids, titles, Animation and Finish indices (the images walk is start, images, template, fields, style, animation, finish) and compares every moved rule with the old shell's expressions over every walk and step.
