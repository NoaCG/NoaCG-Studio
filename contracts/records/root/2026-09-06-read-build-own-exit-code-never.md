# root/read-build-own-exit-code-never

Rule: `root/read-build-own-exit-code-never`. Recorded 2026-09-06 on `claude/learn-build-exit` at acb863c1.

On 2026-09-06 three builds in the phase 2a worktrees were verified with `npm run build 2>&1 | tail -3`, which exits with tail's status. One of those branches was queued with a failing `check:copy` (the template contract's em-dashes counted as new under a path the baseline had never seen); a review caught it before CI did, and the queued pull request had to be cancelled, fixed and queued again.
