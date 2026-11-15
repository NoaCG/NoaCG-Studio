# V6 shared-file dependency diagnosis

PR #2573 remains open and mergeable at c9cc86820d755082cbcf574313ec6ce2c569189e, with CI gate and Reviewed failed. GitHub Actions run 43655807619, job 132634034173, checked out test merge d3d2e29dcdedc9874974142640c7edf68d3012eb. The review job 132633936800 lacked the exact noacg/reviewed status.

The failed imported-SVG quiz test enters a longer question and presses Update. The recorded Playwright trace shows the input and click executed, and the screenshot shows Studio's rundown-changed warning with the old value in both the editor and output. #2573 changes draft and undo handling through ProductionPage.tsx and useRundownHistory.ts.

I ran the one existing browser test unchanged through the shared Windows queue. Exact CI test merge d3d2e29d reproduced the same assertion at e2e/import-svg-behaviour.spec.ts:3120 in local j-5273, exit 1. Its first parent e3bd018edadeaa1253976e9626b33567cd6152bc passed in j-5274, exit 0. Both used the same lockfile and exact test command. Earlier history records a quarantine that has since ended. No evidence justifies changing quarantine or the test. The defect follows #2573 in this control.

Artifacts are local in C:/claude/Temp/vmix-state-1108/diagnostic-2573-ci-43655807619. No source changes, pushes or other run operations. The live-publishing plan #2361 still owns #2573 and has no posted release of ProductionPage.tsx. V6 stays checkpointed at 29b3fdbf, awaiting that allocation.
