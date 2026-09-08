# root/treat-worktree-cleanup-mechanism-permission-worktree

Rule: `root/treat-worktree-cleanup-mechanism-permission-worktree`. Recorded 2026-09-07 on `claude/root-contract-migration` at 39835021.

Owner, 2026-08-30. A clean git status does not mean a worktree is disposable, because ignored files are invisible to git and die with the folder. Full contract in .agent-workflows/cleanup-worktrees.md; the script is dry-run by default.
