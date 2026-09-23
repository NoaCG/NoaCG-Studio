---
v: 2
source: derived
kind: finding
raised: 2026-09-23
state: unstarted
found: "seventeen generated files (the root AGENTS.md, the eight nested AGENTS.md and their .gitattributes) were deleted on disk in every worktree of this clone at once on 2026-09-23 around 10:03, and again in four of six local builds in this worktree between 10:03 and 10:19; the only code that deletes them is the compiler's stale-output sweep, and the trigger was not isolated"
---
# Generated contracts vanish from every worktree, and the build then refuses itself

**What happened.** At session start on 2026-09-23 every worktree of this clone listed the same
seventeen tracked files as deleted on disk: `AGENTS.md`, and under `src/`, `src/ai/`,
`src/blocks/`, `src/components/`, `src/components/wizard/`, `src/model/`, `src/templates/` and
`src/templates/versus/` both `AGENTS.md` and `.gitattributes`. Those are exactly the nested
contracts the compiler owns (nine directories, the root having a hand-written `.gitattributes`
of its own). With them gone `npm run build` refuses: `check:contracts` measures "0 directories
the compiler owns", and `check:contract-freshness` and `check:contract-evidence` die on the
missing root file. `git checkout --` of the seventeen paths restores them.

**What was measured.** In this worktree the files were present at the start of one build and
gone by its test phase, in four of six full builds between 10:03 and 10:19. Running
`scripts/contracts-merge-driver.test.mjs` on its own deleted them four times in a row, and then
never again; every single test of that file, every pair of it with another contracts test, a
direct run of the merge driver, a write-mode compile with the driver's environment, and a
compile with `GIT_DIR` pointed at an empty repository all left the files alone once the
window had passed. A full build with the compiler's stale sweep instrumented to log every
deletion ran green and logged only the fixture deletions the compiler's own test makes. No
global git config, no `core.hooksPath`, no installed git hook. The nightly full suite went
red on main at 07f422408 at about the same time (#379).

**What it must be.** The only code that unlinks a nested contract is `staleOutputs` in
`scripts/compile-contracts.mjs`, run by `write()`: a directory the marker says is owned, whose
contract the plan did not render. `nestedContracts` renders a directory only when at least one
active rule resolves to it, so a compile whose loaded rules resolve to none of the nine
directories deletes all seventeen. Something runs such a compile against real worktrees, and
across all of them at once, which no test fixture and no single worktree's build explains; the
one thing every worktree shares is `.git`, and a merge driver git runs from a worktree top is
the one compile git itself starts.

## Why

A build that deletes the contracts it is about to check turns every session's gate red at
once, and a session that does not know the shape spends its day on it. The nightly is red
now, and the next landing lands over a checkout that may be missing its root contract.

## What a fix needs

1. Reproduce under the build's own concurrency: `node scripts/gates.mjs run` repeatedly while
   another worktree runs its build, with the stale sweep logging process, argv, cwd and git
   environment (the patch is one `appendFileSync` in `write()`, used here and reverted).
2. Whatever the trigger, `write()` should refuse to delete a nested contract when the plan
   rendered none at all: a compile that owns nine directories and renders zero is a compile
   that could not see, not a store that emptied. The same shape as `measured(0, ...)`.
