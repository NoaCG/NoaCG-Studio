---
v: 1
scope: scripts/cleanup-worktrees.mjs, .agent-workflows/cleanup-worktrees.md, scripts/worktree-cleanup-lib.mjs
kind: rule
fires: contract
status: active
since: 2026-09-07
record: contracts/records/root/2026-09-07-treat-worktree-cleanup-mechanism-permission-worktree.md
---
Treat worktree cleanup as a MECHANISM, not a permission: a worktree and its branch may go once every commit on the branch is an ancestor of a freshly fetched `origin/main` - not a clean tree, not "the session is finished". A worktree with NO branch is refused by its own rule. Classify ignored files before deleting: rebuildable output goes, a secret goes unread, and anything unrebuildable is archived outside the repo and verified file by file first.
