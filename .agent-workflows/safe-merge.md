# safe-merge - land one branch on main by hand, when the queue cannot

**This is the break-glass procedure, not the way work lands.** Work reaches `main` through the
landing queue: a session declares its branch finished with the queue-merge workflow, and the
queue runs THIS procedure's mechanical path for it (`scripts/auto-merge.mjs` and
`scripts/safe-merge-preflight.mjs`), one branch at a time, gated on CI. Between 2026-07-27 and
2026-08-25 this workflow ran 217 times; since the queue landed on 2026-08-25 it has run zero,
and that is the correct number.

Read this file when the queue itself cannot do the job: the runner is dead, a landing refuses
for a reason a person has to judge, or `main` is in a state the automation will not touch. Then
follow it in full.

Shared canonical procedure for the `safe-merge` workflow - `/safe-merge` in Claude Code,
`$safe-merge` in Codex. Cross-references use plain names ("the cleanup-worktrees workflow").

Do NOT print git commands for the user to run - execute each phase, report what you find, and
stop whenever reality disagrees with the happy path.

Branch to merge: the invocation argument, if any. With none, drain the queue: rank every branch
ahead of `main` with `merge-order.mjs` and land the `clear` ones in that order, one at a time,
stopping at the first failure and reporting what is left.

## When this may run

Landing is serialized, not permissioned (root `AGENTS.md`, "Git"). Nobody waits on an approval;
what a run waits on is the other branches. Running this workflow by hand puts a landing OUTSIDE
that serialization - it is still safe, because `--ff-only` and the Phase 4 re-check cannot be
talked out of, but it races every queued branch, and that is how five landings in a hundred
minutes each cost a full re-verification. So the normal answer to "land this" is
`npm run queue:merge`, and this file is what a person reads when that has already failed.

**The user starts every run, explicitly.** The Claude adapter keeps
`disable-model-invocation: true` and the shared-instruction gate enforces it, so the model cannot
invoke this as a tool of its own accord. One thing counts as a real invocation: the user typing
the command (`/safe-merge`, `$safe-merge`). No other workflow offers this one as a pick any more -
the planning workflow offers queueing instead - so there is no second door to honour. Never infer
an invocation from a request to inspect or discuss a merge, or from work merely looking finished.

**Unattended landing is what the queue already does**, and the owner's condition for it was that
it stay visible - "it just needs to be clear that something is merging". `npm run jobs` and the
SessionStart summary are what make it visible. This procedure stays attended: a person read it
because something needed judging, and that person sees it through.

Whoever starts the run, a **`caution` or `hold`** verdict stops and asks. Those are the cases that
historically went wrong - a stacked branch jumping its ancestor, two branches minting one
migration number, a rename over another branch's edits.

Never enqueue anything PAST `main` here: `npm publish`, production migrations and anything
costing money stay owner-triggered, because a later commit cannot take them back.

## Repo layout

- `main` is normally checked out at the repo root (`C:\claude\NoaCG-Studio`) - but never ASSUME
  it; read `git worktree list` every run.
- Feature worktrees usually live under `.claude/worktrees/<name>` on `claude/*` or `codex/*`
  branches. Paths and prefixes are never safety signals.
- **The gate is CI green on exactly the commit being promoted** (`ci.yml` triggers on every
  branch push); the local `npm run build` + `npm run test:e2e:integration:queued` pair is the
  fallback. Whichever route runs, BOTH halves are required - typecheck/lint AND e2e. `build`
  alone is not a gate: on 2026-07-30 four template packs landed in a row that each passed it and
  left `main` red for two hours on `catalog-baseline.spec.ts`.
- Standing permission exists to push verified work to `origin/main`, and to push the source
  branch to `origin` so CI can verify it (a plain push, never `--force`).

## Hard safety rules (never break these, even if asked mid-flow)

- Never `push --force`, never `reset --hard`, never delete a branch that isn't fully merged.
- The source must resolve to one exact local branch (`refs/heads/<branch>`), must not be `main`,
  and must be checked out in at most one worktree. Never accept a remote ref, revision
  expression, tag, detached commit, or argument beginning with `-`.
- Update `main` only with `git pull --ff-only`; the final merge is `git merge --ff-only`. Git
  itself must refuse any unexpected non-fast-forward.
- **`MAIN_SYNC`** - local `main` vs `origin/main` before the merge:
  - **Diverged**: hard STOP. Show both sides and let the user decide.
  - **Ahead only**: STOP and require explicit confirmation - the final push would also publish
    those pre-existing local commits, not just the branch.
- Never stash or discard uncommitted changes without asking. Never merge with a dirty source or
  target worktree.
- If a merge hits conflicts you are not confident resolving, `git merge --abort` and report the
  conflicting files rather than guessing.
- Never touch other worktrees' work: merge only the ONE branch, never `checkout`/`switch`/
  `restore` across worktrees, never run `reset`/`clean`/`checkout -- .` in any checkout.
- **Never delete a branch,** and never remove a worktree you did not create in this run. Cleanup
  belongs to the cleanup-worktrees workflow. The single exception is a TEMPORARY worktree this run
  created (identified by the `safe-merge-` prefix AND by having been created in this run - a
  pre-existing folder with that prefix belongs to someone else) - removed in Phase 5, never with
  `--force`, never any other.

## Phase 1 - Assess (reads only)

**Run the checks rather than narrating them:**

    node scripts/safe-merge-preflight.mjs --branch <branch>

It settles the whole assessment in about two seconds - worktree resolution, both trees'
cleanliness, `MAIN_SYNC`, branch-name validation, the merge preview via `git merge-tree`, and the
merge-order verdict - printing every condition PASS/FAIL with the value it found and exiting
non-zero when a blocking one fails. It only reads (its one write-shaped command is `git fetch`,
which touches no working tree and no branch history). **Paste its output.** A condition that was
checked and one that was merely claimed must never again look the same in a report.
`--skip-order` drops the ranking, `--no-fetch` the fetch.

The judgement calls stay here: whether a `hold` should be waved through, whether a conflict is
mechanically resolvable, and in Phase 3 whether a red CI run is a verdict or a damaged run.

The preflight previews the merge with `git merge-base` + `git merge-tree`. **Never use
`git merge --no-commit` as a preview** - it changes the index and the working tree, which is
exactly what an assessment phase must not do.

**Two states the preflight reports that need a decision before Phase 2:**

- **The source branch has no worktree.** Normal here, not an error - a closed session leaves its
  branch behind. Phase 2 creates a temporary one.
- **`main` is checked out nowhere.** Do not assume any checkout is on it. If the root is on a
  detached HEAD that is clean and holds no unreferenced work, Phase 2 reattaches it with
  `node scripts/reattach-main.mjs <root>`, which re-verifies safety itself and declines rather
  than guessing. If the root is on the SOURCE branch, leave it - Phase 4 step 3 reattaches it
  after verification. If neither applies, Phase 2 creates `safe-merge-main`.

Report the plan before changing anything: source -> `main`, commit count, predicted conflicts,
the merge-order verdict verbatim, any worktree Phase 2 will create, and which gate will run.

## Phase 2 - Prepare (update main, then integrate it INTO the branch)

Order matters: main only ever receives an already-tested branch. Conflicts are resolved and
tests run on the BRANCH, never on main.

1. Create any temporary worktree Phase 1 identified (`git worktree add
   .claude/worktrees/safe-merge-<slug> <branch>`, and/or `safe-merge-main main`), or reattach the
   root. "Source worktree" and "the main worktree" mean those from here on. Do not `npm install`
   yet - that happens in step 5, once the branch holds the manifest the gate will use.
2. Re-check both worktrees with `git status --porcelain`. Stop if either became dirty since the
   assessment. A fresh worktree reports clean because `node_modules/` is gitignored; anything
   else means something is wrong.
3. Update main: `git pull --ff-only origin main` in the main worktree. When main has no worktree
   because the root carries the source branch, update the ref in place with
   `git fetch origin main:main` - git refuses that unless it fast-forwards, the same guarantee
   without needing a checkout. Record `INTEGRATED_MAIN_SHA = git rev-parse main`.
4. In the SOURCE worktree: `git merge main`.
5. If step 1 created a worktree, `npm install` in it NOW - after the merge, so the install
   matches the manifest the gate runs under. Resolve step 4's conflicts first; installing against
   a half-merged `package.json` proves nothing.

## Phase 3 - Verify (on the branch, main untouched)

1. Resolve any conflicts carefully. Only what is mechanically obvious; for anything semantic,
   stop and show the hunks. Not confidently resolvable -> `git merge --abort` and report.
   Complete the merge commit before continuing; never verify a half-finished merge.
2. Pin it: `VERIFIED_SHA = git rev-parse <branch>`, and state it. The exact commit that passes
   verification must be the exact commit that becomes `main`.
3. **Route A - CI (prefer this).** CI runs strictly more than a laptop can - build, the affected
   plan sharded across up to nine runners, the factory gates, the catalog tripwire - on a clean
   checkout, in about ten minutes, free (the repo is public).

       git push origin <branch>
       gh run watch --exit-status $(gh run list --branch <branch> --commit <VERIFIED_SHA> \
         --limit 1 --json databaseId --jq '.[0].databaseId')

   Then **have the preflight read the run** rather than eyeballing it:

       node scripts/safe-merge-preflight.mjs --branch <branch> --phase 3 --verified-sha <VERIFIED_SHA>

   It requires the run's head sha to be **exactly** `VERIFIED_SHA` (Phase 2 made a new commit, so
   an earlier run proves nothing about the tree being promoted), its conclusion to be `success`,
   and the `CI gate` job itself green. It also applies the two conditions that decide whether a
   green tick is EVIDENCE at all: whether the e2e shards actually ran, and whether any job is
   damaged rather than failing.

   **A run that skipped every shard is settled by computation, not prose.** The preflight runs the
   affected planner itself on the promoted commit, so the two causes of `mode: none` stop looking
   alike: it passes when the branch diffs to nothing behavioural against `main`, or when an
   earlier green run on this history did run shards and everything changed since plans `none` too.
   It blocks otherwise - the case that used to reach `main` on a sentence, because a second push
   cancels the run in flight and plans only itself while the tick stays green. Force a real run
   instead of arguing: `gh workflow run ci.yml --ref <branch>`.

   **A damaged run is not a red run - it is NO run.** It carries no verdict, so there is nothing
   to fix; fall through to Route B and say so in the report, naming the run, the damaged job and
   the incident. How to tell damage from failure is in `docs/VERIFICATION.md`. Do not sit and
   re-run into an outage: one free retry, and if it also queues without starting, that is
   confirmation.

4. **Route B - locally, when CI is unavailable or you need an answer without pushing.** Both of:
   - `npm run build` - typecheck, lint, bundle.
   - `npm run test:e2e:integration:queued` - the affected plan based at the FORK POINT, not at
     `main`. Phase 2 just merged main in, so a plain affected run would cover only the branch's
     own files and everything main brought in would go unverified. **A clean merge says two diffs
     did not touch the same lines, never that the combined state holds** - which is the whole
     question this phase exists to answer. For a branch that has NOT taken main in,
     `npm run test:e2e:focus:queued` is the same thing and still correct.

   Run it even when the change looks harmless: "it's only templates" is exactly the branch that
   went red, and the script decides what "affected" means. It reports and skips cleanly when the
   diff touches nothing the suite covers, so a docs-only branch costs seconds.

   **Citing a run you already did this session** instead of re-running is allowed only when ALL
   hold, and say which run and when it finished: it was an `affected`/`focus`/`queued` form and
   finished GREEN; same worktree; ran on exactly `VERIFIED_SHA`, AFTER the Phase 2 merge; nothing
   moved, installed or edited since; and `INTEGRATED_MAIN_SHA` still equals `origin/main`. If you
   cannot positively confirm every one, run it again - "I think that run was after the merge" is
   exactly the shape of an assumption that turns out wrong.

5. Anything red on either route is fix-or-abort. A fix is a new commit, so re-record
   `VERIFIED_SHA` and re-verify. Then confirm the source worktree is clean and the branch still
   points at `VERIFIED_SHA`.

## Phase 4 - Re-check main, fast-forward, push

Immediately before merging - main may have moved while you verified. **Run the checks:**

    node scripts/safe-merge-preflight.mjs --branch <branch> --phase 4 \
      --verified-sha <VERIFIED_SHA> --integrated-main-sha <INTEGRATED_MAIN_SHA>

It confirms both worktrees still clean, `<branch>` still at `VERIFIED_SHA`, local `main` still
equal to `origin/main`, `origin/main` still equal to `INTEGRATED_MAIN_SHA`, and the merge still a
fast-forward. Paste the output.

1. **Non-zero exit means main moved: STOP, do not merge.** Return to Phase 2, integrate the new
   main, re-verify (new `VERIFIED_SHA`), then repeat this phase. This is the check that makes
   concurrent merges safe rather than merely discouraged.
2. If the root has been carrying the source branch, reattach it now - verification is done, so
   the branch no longer needs a working tree and `main` does:
   `node scripts/reattach-main.mjs --from-branch <branch> <root>`. It re-verifies every condition
   and switches only if they all hold; if it declines, STOP and report what it said.
3. `git merge --ff-only <branch>` from the main worktree. Git refuses if it is not a
   fast-forward; if it fails, STOP and report. A healthy run fast-forwards cleanly.
4. Confirm `git rev-parse main` equals `VERIFIED_SHA`. Do not push otherwise.
5. `git push origin main` (standing permission).

## Phase 5 - Finish

1. Confirm containment: `git branch --merged main` includes `<branch>`.
2. Remove every temporary worktree THIS run created, and only those - leaving one behind turns a
   merge into litter the next session mistakes for live work:

       git worktree remove .claude/worktrees/safe-merge-<slug>
       git worktree remove .claude/worktrees/safe-merge-main
       node scripts/dev-port.mjs --prune

   Run each line only for a worktree this run actually created. The prune only clears tickets
   whose worktree is gone, so it is safe unconditionally. Never `--force`: if a removal refuses,
   say so and leave it for the cleanup-worktrees workflow rather than overriding a refusal you did
   not diagnose. **Remove ONLY the worktrees this run created, and never the branch.** On Windows
   a removal routinely half-succeeds - git deregisters the worktree and then reports
   `Permission denied`, leaving an EMPTY directory. That is the known OS lock, not a refusal to
   override; `session-start.mjs` sweeps those anyway.
3. Do NOT remove any other worktree or delete the branch, and do not offer to.
4. Report: merged commits, verified sha now on `main`, which gate ran and its result, push
   result, temporary worktrees created and removed. If the queue had more `clear` branches,
   continue with the next one; if it stopped on a `caution`/`hold`, name the branch and why.
