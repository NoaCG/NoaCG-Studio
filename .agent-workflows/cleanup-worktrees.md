# cleanup-worktrees - bulk-clean stale worktrees safely

Shared canonical procedure for the `cleanup-worktrees` workflow - invoked as
`/cleanup-worktrees` in Claude Code, `$cleanup-worktrees` in Codex. Cross-references to other
workflows below use their plain names (e.g. "the queue-merge workflow"); translate as
`/queue-merge` in Claude Code, `$queue-merge` in Codex.

Clean up the leftovers from finished coding sessions: stale git worktrees, managed
`claude/*` / `codex/*` / `worktree-agent-*` local and GitHub branches that are already fully
merged and backed up, stale worktree metadata, and empty leftover worktree folders. Do NOT print git commands for the
user to run - drive the script yourself, read its output, and report conclusions.

This workflow deletes branches and worktrees, so it runs when it is **invoked by name** - as a
command, or as the last step of a session that has finished. Never infer invocation from a
request to inspect or discuss repository hygiene.

The executable safety gates live in `scripts/cleanup-worktrees.mjs` (dry-run by default,
`--apply` to act). It uses ancestry containment against a freshly fetched `origin/main` for
deletion decisions, archives anything unrebuildable before it removes the folder holding it, and
shares the empty-folder inspection/removal helpers with the SessionStart hook. Your job is to run
it, sanity-check its assessment, and apply only when the assessment is clean.

## Why this used to need a person, and what replaced it

Until 2026-08-30 only the user could start a cleanup. The reasoning was sound and is worth
keeping in front of you, because it is what the mechanism now has to cover: **a clean
`git status` does not mean a worktree is disposable.** Porcelain never mentions ignored files,
`git worktree remove` deletes them anyway, and a worktree can hold a bench round that cost real
money, a `.env`, or a gallery nothing can regenerate. A model that reads "clean" as "finished"
destroys those silently. Two paid rounds were lost exactly that way.

None of that is answered by asking a human for permission - it is answered by *knowing which
files are which*, which is now in code:

- **Eligibility is containment, and nothing else.** Every commit on the branch must be an
  ancestor of a **freshly fetched** `origin/main` (a fetch older than ten minutes refuses the
  whole assessment - containment measured against a stale ref is a claim about an older world).
  `git branch -d`, never `-D`, and `git worktree remove` without `--force`, remain the backstops
  git itself enforces.
- **Ignored content: three classes, three answers.** REBUILDABLE (`node_modules/`, `dist/`,
  caches) goes with the worktree. A SECRET (`.env` and friends) goes **unread** - never printed,
  logged, copied or archived - and only while the primary checkout still holds a file at the same
  path; a secret that exists nowhere else refuses the removal. Everything else is treated as
  VALUABLE: it is copied to the archive outside the repo, the copy is verified file by file and
  byte for byte, and only then may the worktree go. **A failed or unprovable copy refuses, and no
  flag overrides it** - an archive nobody checked is not an archive.
- **Nobody's floor is pulled out.** A worktree that is locked (how the harness marks an agent
  running right now), dirty, mid-rebase/bisect, or whose Claude Code session wrote a transcript
  turn in the last two hours is skipped and reported. That last signal does not see a Codex or
  plain-shell session, which is why it guards convenience only - **nothing here is what makes a
  deletion safe.** Containment is, and it fails closed.

The archive root is `C:/claude/noacg-archives` (`worktree-cleanup/<date>/<worktree>/`), override
with `NOACG_CLEANUP_ARCHIVE`; the idle window is `NOACG_CLEANUP_MIN_IDLE_MINUTES`. Deliberate
paid rounds still go to their own round-indexed archive through `npm run eval:archive` - this one
catches what a worktree happened to be holding when it died.

**What still stops and asks:** an unarchivable path, a lone secret, a worktree skipped for
uncommitted or unique work, a `main` ahead of `origin/main`, a non-empty leftover folder. Those
are decisions, not permissions.

## Why the BULK sweep runs from the primary checkout only

A worktree cannot delete the folder it is running inside. The bulk sweep must be run from a
fresh session in the **primary `main` checkout** (`C:\claude\NoaCG-Studio`). The script
enforces this and refuses to act from a linked worktree - if it reports that, stop and tell
the user to rerun from the primary checkout. Never work around it.

Note the asymmetry: the sweep RUNS there and never REMOVES it. The primary checkout is refused
with the hazard named, because the landing queue checks out, merges, builds and resets that
working tree during every integration.

## Cleaning up THIS worktree (`--self`)

Invoked from inside a linked worktree, this workflow cleans up that ONE worktree instead of
sweeping. It is the honest version of "a worktree cannot delete itself": measured on Windows,
`git worktree remove` driven from the primary deregisters the worktree and deletes every file,
failing only on the now-empty directory, which unlocks when the session exits and is swept by
the leftover-folder pass. So the session clears essentially all of itself.

    node scripts/cleanup-worktrees.mjs --self            # dry run, always first
    node scripts/cleanup-worktrees.mjs --self --apply    # archives, verifies, then removes

The dry run names every ignored path and which of the three classes it is in, and prints the
archive destination and the file count that will have to verify. Read it before applying: the
refusals are the interesting part, not the removals.

Then say plainly that this chat's working directory no longer exists, so no further commands
should run in it.

## What counts as safe (the script decides; these are the rules it applies)

- The ONLY trustworthy "safely merged" test is commit containment. Automatic deletion requires
  the ref to be contained in both local `main` and `origin/main`; branch names, `gone` upstream
  markers, tree similarity, and memory are never trusted.
- Containment is measured against a fetch **less than ten minutes old**. A stale one refuses the
  whole assessment rather than qualifying its verdicts.
- A worktree is removed only if its working tree is clean AND its branch is safely contained.
  Dirty, local-only, or unique-work worktrees are skipped and reported.
- **A worktree with NO branch is refused by its own rule**, never by the containment test. A
  detached worktree is either infrastructure - the permanent orchestrator worktree is detached at
  `origin/main`, because git will not let a second worktree hold `main` while the primary checkout
  has it - or somebody mid-investigation, and "its commit is already on main" is exactly the wrong
  reason to delete either. The primary checkout, anything holding `main`, and a named list of
  infrastructure worktrees go down the same path, from one predicate
  (`infrastructureReason`, `scripts/cleanup-worktrees.mjs`); adding the next one is a line there.
  The orchestrator's home is on that list BY NAME as well as by shape, taking the name from
  `scripts/orchestrator-home.mjs` so the two cannot drift: the branchless rule already covers it
  while it is detached, but a home that is only safe while it stays detached is one reattachment
  away from being swept.
- A worktree git reports as **locked** is skipped, never forced - that is how the harness marks
  an agent that is running right now. So is one part-way through a merge, rebase, cherry-pick or
  bisect (a bisect leaves a perfectly clean tree), and one whose Claude Code session wrote a
  transcript turn inside the idle window (two hours by default).
- Ignored content is classified before removal, never counted: rebuildable output goes, a secret
  goes unread while the primary checkout still has one, and anything else is archived outside the
  repo and verified file by file first. A lone secret, an unreadable path, or a copy that does
  not verify skips the worktree and is reported.
- Local branches: only safely contained branches in a MANAGED NAMESPACE are deleted (via
  `git branch -d`, never `-D`; git refuses an unmerged branch as a final backstop). `main` and
  the current branch are never touched. Other merged branches are reported, not deleted.
  The namespaces are `claude/*`, `codex/*` and `worktree-agent-*`, listed once in
  `MANAGED_BRANCH_PREFIXES` (`scripts/cleanup-worktrees.mjs`) - adding the next one is a line
  there. **The last of those is the ORCHESTRATOR's own litter**, and it is why the list is not
  just the two session prefixes: an agent launched into its own worktree gets
  `.claude/worktrees/agent-<id>` plus a `worktree-agent-<id>` branch alongside whatever `claude/*`
  branch the work was really on. The sweep removed those worktrees from the start and left the
  branches behind, so 48 of them had piled up by 2026-09-02 - every one contained in `main`, none
  ever pushed. A namespace the harness mints and never a person is ours to clean.
- GitHub branches: the same managed-prefix and dual-containment rules apply. A remote branch is
  deleted only after its worktree and same-named local branch are gone. The push carries an
  exact-head lease, so a branch that changed after assessment is refused rather than losing new
  work. Unmerged remote branches and branches still needed locally are reported, never deleted.
- A branch merged via "squash and merge" never passes the ancestry test (its commits aren't
  reachable from main), so it's caught separately: if its tree is already identical to main's,
  it's reported as a possible squash merge for manual review - never deleted automatically, since
  tree equality is a weaker signal than true ancestry.
- Empty leftover folders are swept; non-empty unregistered folders are reported for manual
  review, never auto-deleted. Locked/busy folders are reported to rerun later.

## Steps

1. **Run the dry run:** `node scripts/cleanup-worktrees.mjs`. The script refreshes
   `origin` before every assessment and again immediately before applying, and refuses cleanup
   if either fetch fails.
2. **Read and relay the plan.** Summarize what will be removed/deleted, **what is archived first
   and where**, what is skipped and why, every empty/non-empty/unreadable leftover folder, and any
   manual cleanup remaining. If the script refused (not the primary checkout on `main`, a stale
   fetch, missing refs, unreadable state), stop and report that - do not force anything.
3. **Auto-apply on a clean assessment.** If the plan shows only safe removals and skips with
   benign reasons, apply it without waiting:
   - `node scripts/cleanup-worktrees.mjs --apply`
   STOP and ask the user first only when the assessment surfaces a real risk:
   - local `main` is ahead of or diverged from `origin/main`;
   - a worktree is skipped for **uncommitted changes**, or for a **stopped merge, rebase,
     cherry-pick or bisect**;
   - a ref is contained only in local `main`, not `origin/main`;
   - a worktree holds output that **cannot be archived**, or a secret with no copy anywhere else;
   - a **non-empty leftover folder** was found (it may be live work);
   - an unreadable leftover folder was found;
   - anything the script could not classify.
   A worktree skipped as infrastructure (the primary checkout, one with no branch, one holding
   `main`), as locked, or for a live session is NOT a risk - it is "not today", and the script
   marks the difference itself rather than leaving it to prose.
   In those cases, report the specific item and let the user decide. If the user explicitly
   approves cleaning the independently safe items while leaving every risk untouched, run:
   - `node scripts/cleanup-worktrees.mjs --apply --acknowledge-risks`
4. **Report the outcome** from the `--apply` output: what was archived and where, what was
   deleted, what was skipped and why, and whether any manual cleanup remains. Do not claim
   success for items the script marked `[FAILED]`, `[NOT ARCHIVED]`, or left in "Manual cleanup
   remaining".

Hard rules (never break, even if asked mid-flow): never `git branch -D`, never
`git worktree remove --force`, never delete `main` or the current branch, never delete a remote
branch without an exact-head lease, never delete a non-empty folder, never remove a worktree
whose unrebuildable content has not archived AND verified, never read or copy the contents of a
secret, never run the sweep from a linked worktree.
