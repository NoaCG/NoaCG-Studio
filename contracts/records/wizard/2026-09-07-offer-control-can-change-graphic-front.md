# wizard/offer-control-can-change-graphic-front

Rule: `wizard/offer-control-can-change-graphic-front`. Recorded 2026-09-07 on `claude/wizard-rules` at 32e60266.

Owner, 2026-08-28 on palettes and 2026-09-03 on the import walk: do not offer things that do nothing. A greyed control teaches people the feature is broken rather than absent.

## Recorded 2026-10-14 on `claude/plan-wizard-shell-p9-build` at c65781a3f.

The close-out (S7) of docs/work-specs/wizard-structure/spec.md corrected the named mechanism in place: S3 replaced `BRAND_MODES` with a `brand` flag on each walk step, which `offersBrand` in `src/components/wizard/shell/walks.ts` reads. The demand is unchanged, so the rule keeps its id, which `src/components/wizard/import/MapSvgFieldsStep.tsx`, `src/components/wizard/import/mapSvgFields.css`, `e2e/import-svg.spec.ts` and `docs/TEXT_BOX_BINDING.md` cite.
