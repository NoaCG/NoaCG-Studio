# root/land-through-run-session-owns-branch

Rule: `root/land-through-run-session-owns-branch`. Recorded 2026-09-07 on `claude/root-contract-migration` at 39835021.

Landing is serialized, not permissioned (owner, 2026-08-25). The command merges nothing itself: it pushes, opens the pull request with auto-merge on, and GitHub queue lands it once the required checks pass. No laptop is in the path and the ruleset lets nothing but the queue write main. The procedure is .agent-workflows/queue-merge.md.
