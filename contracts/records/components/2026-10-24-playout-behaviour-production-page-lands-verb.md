# components/playout-behaviour-production-page-lands-verb

Rule: `components/playout-behaviour-production-page-lands-verb`. Recorded 2026-10-24 on `claude/plan-production-page-p25-build` at c4b6fa4.

Production-page refactor (docs/work-specs/production-page-refactor/spec.md AC-11, D8): phases 2 to 13b moved the verbs, refusals, air folds, Bridge polls, timed cues, folder runs and the draft out of ProductionPage.tsx into src/control/ modules held by playoutSession, each tested in Node. The owner dropped the line-count half of AC-11 on 2026-10-17 and kept this rule.

Why a rule rather than a fix, a mechanism or a check: No check can tell playout behaviour from view code inside a React file, and the owner withdrew the page's line budget, so where the code goes is the guard that stops the page regrowing.
