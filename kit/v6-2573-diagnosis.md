# V6 shared-file dependency diagnosis

PR #2573 remains open and mergeable at c9cc86820d755082cbcf574313ec6ce2c569189e, with CI gate and Reviewed failed. GitHub Actions run 43655807619, job 132634034173, checked out test merge d3d2e29dcdedc9874974142640c7edf68d3012eb. The review job 132633936800 lacked the exact noacg/reviewed status.

The failed imported-SVG quiz test enters a longer question and presses Update. The recorded Playwright trace shows the input and click executed, and the screenshot shows Studio's rundown-changed warning with the old value in both the editor and output. #2573 changes draft and undo handling through ProductionPage.tsx and useRundownHistory.ts.

I ran the one existing browser test unchanged through the shared Windows queue. Exact CI test merge d3d2e29d reproduced the same assertion at e2e/import-svg-behaviour.spec.ts:3120 in local j-5273, exit 1. Its first parent e3bd018edadeaa1253976e9626b33567cd6152bc passed in j-5274, exit 0. Both used the same lockfile and exact test command. Earlier history records a quarantine that has since ended. No evidence justifies changing quarantine or the test. The defect follows #2573 in this control.

Artifacts are local in C:/claude/Temp/vmix-state-1108/diagnostic-2573-ci-43655807619. No source changes, pushes or other run operations. The live-publishing plan #2361 still owns #2573 and has no posted release of ProductionPage.tsx. V6 stays checkpointed at 29b3fdbf, awaiting that allocation.

## Verified handoff and independent checks

The owner authorized this session to take over the current PR only after confirming its writer had stopped. Both Claude sessions showed the weekly usage limit and no scheduled wake for this PR. The existing branch remains on GitHub at c9cc8682 and carries one acknowledged repair owner in comment 6899954398.

Local candidate 1a8881f9 passed the original quiz Update. A fresh full review found the queued wrong-cue overwrite and the team metadata race. Windows jobs j-5278 and j-5279 reproduced both. j-5280 reproduced a queued write after leaving the production. The next local candidate ee6ccf77 passed all 26 rundown checks and the quiz and storage-refusal checks (j-5284, j-5285). Its fresh review found a closing draft loss, lost team proof behind an ordinary in-flight save, and an ordinary personal write able to persist an earlier rejected draft. j-5286 reproduced the closing and personal failures. The third focused repair passed those and the team proof check in j-5288.

Current local candidate 493b45e6c65d32365e644630bb4b05db8d4e9cd8 is under a fresh full exact review. j-5289 also induced two opaque writes; production refused them, and the local test helper currently reports the deliberate refusal as unexpected. Preserve the exact red record and have the test claim and assert both refusals. j-5290 covers the original quiz Update and storage failure. Affected gates run in the exact LF checkout under the same diagnostic directory. The PR is still unqueued, V6's original head is parked, and no separate run or PR was started.

## Authoritative team retry checks

The independent review of 493b45e6 found team retry custody and receipt-less hide issues. Windows j-5291 reproduced both the ordinary edit returning to identical text and lost recovery when the team outbox refused. The corrected exact 35ec1ffb passed the 33 rundown journeys (j-5293), quiz and refusal (j-5294), 523 affected unit tests with the exact LF files, strict ESLint and TypeScript. Its fresh review isolated two remaining retry transitions. The next local candidate 3c498fb55eecd56687e132f6564fc2bb1d09b8fe retires consumed baselines on both CAS outcomes and checks both surviving draft endpoints before sending a newly connected field. The two tests failed on 35ec1ffb and passed with the correction. Current exact jobs j-5295 and j-5296 plus a fresh independent review are pending. The same remote PR stays at c9cc8682, unqueued. V6 stays parked on #2575.
