# dev-port resolves the shared git directory by guessing, and three copies do it

**Filed:** 2026-09-09. **Source:** the `/check` review of `claude/f-weekly-candidates-reach-a-wave`,
which found the same defect in that branch's new code and fixed it there.

## Why

`scripts/dev-port.mjs`'s `gitCommonDir()` (line 63) reads `<repoRoot>/.git` and, when it is a
pointer file, takes two `dirname` calls off the `gitdir:` target. That is right for a linked
worktree, whose pointer names `<common>/worktrees/<name>`, and wrong for the two other layouts that
produce the identical pointer: a `--separate-git-dir` clone and a submodule, where the target IS the
repository's git directory. On either, the answer lands two levels above the truth.

That answer is load-bearing. `registryDir()` builds the dev-port registry path from it, and
`scripts/jobs-store.mjs` imports the same function for the job queue and, through
`wave-plan-store.mjs`, for the wave-plan store - the durable home the plans were moved to on
2026-09-08 precisely because a worktree is not durable. All three would be written outside the
repository, where nothing prunes them and nothing else looks.

Nothing on this machine is such a clone, so **nothing is broken today**. It is filed rather than
fixed because it sits outside the diff the review was reading, and `dev-port.mjs` is imported by a
hook that runs on every shell command in every session on this machine - a mistake there is a
machine-wide outage, which is not a thing to slip into somebody else's branch.

The second half of the Why is the duplication. Four modules now resolve this same fact.

## What it would take

`scripts/primary-checkout.mjs` already does it correctly: git writes a `commondir` file inside a
linked worktree's admin directory and nowhere else, so reading it tells the three shapes apart
exactly rather than guessing from the path. `scripts/primary-checkout.test.mjs` pins all five cases
(a directory `.git`, a linked worktree, a relative pointer, a pointer with no `commondir`, no `.git`
at all).

- Delegate `dev-port.mjs`'s `gitCommonDir()` to it. `normalizeRoot(gitCommonDir(repoRoot))` keeps the
  normalisation the port registry compares paths with, so the body becomes one line.
- Verify with `npm run build` and `npm run test:ports`, and read `node scripts/dev-port.mjs --json`
  before and after: this checkout's port must be identical.
- Then decide about the other two. `scripts/orchestrator-week.mjs` and `scripts/orchestrator-home.mjs`
  each spawn git for it, and both already have a git process in hand for a worktree list they need
  anyway - which is why `primary-checkout.mjs`'s header says they stay. That argument is worth
  re-testing once the fs-only version is the one everything else uses.

Small: one function body, one import, and a judgement about two more.

## Evidence

- `scripts/dev-port.mjs:63-76` - the two `dirname` calls, and the comment above them describing only
  the linked-worktree case.
- `scripts/dev-port.mjs:79-82` (`registryDir`), `scripts/jobs-store.mjs` (the `gitCommonDir` import),
  `scripts/wave-plan-store.mjs` - what reads the answer.
- `scripts/primary-checkout.mjs` and its test - the correct resolution, landed 2026-09-09.
- The `/check` review of `claude/f-weekly-candidates-reach-a-wave` is where this was reported
  rather than fixed; its handoff was drained on 2026-09-09 and prints from
  `git show 64ad2f68:docs/handoffs/2026-09-09-f-weekly-candidates.md`, section "What `/check`
  found". The reasoning in the Why above is that report in full.
- The same guess has a second observable consequence, measured on 2026-09-02 while probing the
  mistake-trigger hooks: because `gitCommonDir()` closes over the MODULE's own location rather than
  the command's, a hook file executed by absolute path from another checkout reads that other
  checkout's job queue. Harmless in normal use, where a session runs its own checkout's hooks.
