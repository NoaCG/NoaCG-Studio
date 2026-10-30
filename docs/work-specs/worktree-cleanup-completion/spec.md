# Finished-work cleanup

## Why

The existing unattended sweep protects valuable work but leaves newer agent branch conventions and Codex worktree completion outside its automatic path. Global marketplace staging is separate from project worktrees. Archive verification currently checks file names and sizes without proving content equality.

## Goal

Release disposable storage after finished work while retaining source, paid evaluation evidence, credentials, active chats and installed runtimes. Reuse the current session/landing sweep and supported Codex archiving.

## Non-goals

No expiration of durable archives, personal media or arbitrary old folders. No deletion of unique, dirty, locked or detached worktrees. No new scheduler, paid service, runner change or vendor configuration change.

## Decisions

- Keep the existing worktree idle windows and containment checks.
- Verify archived file contents with SHA-256 and link targets, including retries and changes during copying. Never read secrets to do so.
- Let the landing ledger establish ownership of newer branches only inside the existing Claude worktree root; a branch prefix alone does not establish ownership.
- Complete each finished session's own worktree cleanup after exact-merge post-landing checks. Use the supported Codex archive tool for attached managed worktrees; preserve valuable ignored output before archiving. A continuing research chat stays open.
- Add a conservative marketplace-staging cleanup to the existing sweep. Restrict it to old, clean, ordinary Git clones under Codex's known staging directory, with a remote-backed commit, no ignored/untracked content, no live path reference and a successful Windows move before removal. Retain unclassified/partial copies. A failure must preserve the original or its recoverable parked path and be reported.
- Keep explicit receipts for applied cleanup. No periodic expiration of the NoaCG archives.

## Acceptance

1. Same-size corruption, source changes during copying and mismatched link targets fail verification and prevent worktree removal.
2. Unique commits, secrets, dirty/locked worktrees, active jobs and protected infrastructure remain protected.
3. A landed, idle agent-owned branch outside the old namespace can release its worktree without authorizing arbitrary similarly named branches.
4. Eligible old staging clones are reclaimed by the existing sweep; dirty, unique, ignored-content, symlink, busy, recent and partial folders remain.
5. Workflow instructions make cleanup a normal final action after repair ownership ends, with app ownership and ignored-file preservation respected.
6. Local verification is targeted; full checks run in GitHub Actions and the change lands only through queue-merge.

Observed activation blocker: an unrelated untracked error.log in primary prevents the old sweep from refreshing local main. Permit only a tracked-clean fast-forward, preserving unrelated untracked files and using Git's --no-overwrite-ignore refusal for collisions. Test both safe progress and preservation of colliding local files.
