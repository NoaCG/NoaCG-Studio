# components/run-every-show-production-page-operator

Rule: `components/run-every-show-production-page-operator`. Recorded 2026-11-10 on `claude/plan-live-publishing-1-build` at e6be4cf.

docs/work-specs/retire-hosted-control/spec.md: the hosted control page and its tests are removed, ?control=<slug> becomes a redirect, and O3 says no-account operating, if it ever comes, is a mode of the production page.

Why a rule rather than a fix, a mechanism or a check: The owner retired the second operator page (issue #2301, decisions O1 to O3); without a rule the next change could grow a second surface back.
