# landing/generated-file-merges-cleanly-still-comes

Rule: `landing/generated-file-merges-cleanly-still-comes`. Recorded 2026-09-07 on `claude/two-row-set-recipe-fcbe5e` at 7e7c6370.

2026-09-07 on a branch open while the contract migration landed on main: both sides had regenerated contracts/index.md and src/templates/AGENTS.md. git merge origin/main reported no conflict, and forty-five lines of main's new rules were missing from the merged index. npm run contracts:compile restored all 350 rules. Nothing in the build would have caught it, because the compiled files are not checked back against the rule store.
