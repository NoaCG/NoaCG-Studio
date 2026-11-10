# components/hold-preview-program-too-long-reports

Rule: `components/hold-preview-program-too-long-reports`. Recorded 2026-11-10 on `claude/plan-live-publishing-1-build` at e6be4cf.

The hosted control page is retired by docs/work-specs/retire-hosted-control/spec.md; the production page keeps previewOverflow and programOverflow apart (ProductionPage.tsx noteMachineState and setPreviewOverflow).

Why a rule rather than a fix, a mechanism or a check: The trap stands on the production page; only the hosted control page it was scoped to is retired, so it is rescoped rather than dropped.
