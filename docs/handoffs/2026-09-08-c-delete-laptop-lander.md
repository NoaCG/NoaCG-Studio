# Session C - delete the laptop lander

**Branch:** `claude/c-delete-laptop-lander`, seven commits on `684e2bf2`. Reviewed sha
`b98046ce`, stamped, queued.

## What landed

**The three community health files pass `check:tree-shape`.** `CODE_OF_CONDUCT.md`,
`CONTRIBUTING.md` and `SECURITY.md` are in `ALLOWED_ROOT_ENTRIES` with a comment saying why the
root is the only location that works. PR #102 (`claude/oss-community-files`) is untouched and
re-queues once this lands; its backlog file records the decision.

**`scripts/auto-merge.mjs`, `scripts/safe-merge-preflight.mjs` and `scripts/main-health.mjs` are
gone**, with their tests, the four temporary-worktree tests in `worktree-safety.test.mjs`, the
`test:auto-merge` and `check:main-health` package scripts, and both allowlist entries. `add-merge`
now REFUSES `--after`, `--accept`, `--attempts`, `--cap` and `--onto-red-main` rather than naming
them as ignored: each was a person's judgement about a gate that no longer exists, and a command
that reads as though it waived something and did not is the worse failure - which is the argument
`requeue` next door already makes about its own flags.

**No module needed to be invented for the surviving helpers.** The backlog said `jobs.mjs` and
`jobs-store.mjs` needed `parseWorktrees`, `selectCiRun`, `onlyMainIntegrationsBetween` and the
cancelled-run readers moved somewhere named for what they do. Measured, only ONE crossed the line:
`jobs.mjs` imported `onlyMainIntegrationsBetween`, and the pin decision below deleted the reason it
was imported. Nothing else in the repo referenced any of them.

## The two decisions the row asked for

### `main-health.mjs`: deleted, not kept

Its own header says why it existed: the laptop lander gated on the INTEGRATED sha, so it never
asked about `main` itself, and one red `main` on 2026-08-27 produced 27 emails. Every reader is
gone or replaced. No workflow runs it - `ci.yml`, `configured-suite.yml` and `hosted-latency.yml`
name it in COMMENTS only, which is what made it look load-bearing. `scripts/red-main-issue.mjs`
files the alarm from `ci.yml` and dedupes by WHAT is failing, `scripts/ci-watch.mjs` is the
session-facing watch (its own header says main-health only answered when a landing asked, and
nothing asked on the session's behalf), and GitHub's merge queue gates each group on that group's
own run - which is the question the red-main refusal was approximating. `docs/CI_STABILITY.md` now
marks that gate retired with this reasoning rather than listing it as live.

### The `--expect-sha` pin: WRITE it, and delete the carve-out

The row offered two ways. I took neither cleanly, and the argument is in `238cf465`.

Writing it, because the question the pin asks is still worth asking locally. `requeue` is the one
landing verb a session may run without going past the `/check` stamp gate - it re-runs a
declaration rather than making one - and the pin is the only thing stopping it re-running that
declaration over commits nobody declared. Nothing wrote the pin after the queue moved to GitHub, so
`declaredCommitOf` found none, and every reader answered null. `add-merge` writes
`--expect-sha <tip>`, and `land-watch.mjs` verifies it against the pull request's head on its first
tick. GitHub refuses the same pull request anyway - `noacg/reviewed` is a required check posted on
the exact tip and a commit status cannot follow a new commit - so this only turns "some check went
missing" into a sentence naming what happened.

Deleting the carve-out, because that half really is the lander's. The pin used to be allowed to
MOVE, over commits provably the previous landing's own integration of `main`, because the laptop
lander merged `main` in and pushed the result before it gated - so its own first attempt moved the
tip out from under the pin (j-0519). GitHub's merge queue builds its temporary merge on GitHub and
never writes the branch, so any movement now is a session's own push, which is exactly what the pin
exists to refuse. That took `onlyMainIntegrationsBetween` out of the queue and with it the retry
budget's "a budget spent by a bug is not a budget" carve-out, which existed only for movement the
queue made itself. A stale pin is a verdict now, retried never, and its recovery names `/check` and
`queue:merge` rather than `requeue`, which would refuse on the same pin.

## The other claim: the owner-receipt refusal

`servesVerdict` was called only from the retired preflight, so nothing has enforced it since
2026-09-06. It is in `cmdAddMerge` beside the other two refusals that mean "this branch is not
finished" - unread relay mail, a missing `/check` stamp. It fails open on a diff git cannot answer,
and it checks only THIS worktree's branch: `receiptsFor` reads the working tree, which is the
branch's shelf only while that branch is checked out here. Queueing someone else's branch prints
which question it did not ask. Proved by claiming a receipt for this branch without touching it -
it refuses, names the four one-line ways to answer, and exits before pushing.

## Verification

`npm run build` green (exit 0, read from the build's own exit code) after every commit. Hook and
command-shape tests run by name: `frozen-branch`, `guard-agent-launch`, `guard-preview`,
`guard-question`, `spawn-task-guard`, `command-match`, `command-target` - 81 pass. `jobs-store`,
`wave-tick`, `night-report`, `land-watch`, `worktree-safety`, `check-line-endings` all pass.

CI on `15af806e`: **all nine E2E shards ran and passed**, plus Factory gates, Build, E2E plan,
Combined E2E report and CI gate. `Reviewed` and `Vercel accepted the commit` skipped, as they do
before queueing. That run covers `ci.yml` parsing after the comment rewrite. `configured-suite.yml`
and `hosted-latency.yml` do not run on a branch, so they are unproved by execution - but every
workflow edit on this branch is inside a comment, verified by a diff filter that finds no changed
line outside `#`. `b98046ce` (the reviewed tip, two doc/simplify commits later) was pushed and its
run was still going when this was written.

`/check`: **review: delegated** (8 findings, 6 fixed - the scope check passed, it named this branch
and these files), **simplify: inline** (the skill returned fan-out instructions, so per
`.agent-workflows/check.md` the pass had not run; 2 findings, both fixed), **verify: inline**.
**taste: not applicable** - nothing here can move what a graphic looks like.

The review's six fixed findings are in `5e509a4e` and `b98046ce`: `docs/VERIFICATION.md` sent a
reader to the deleted preflight to settle a CI verdict and credited the lander with the migration
push; `docs/CI_STABILITY.md` listed the red-main refusal as live with `--onto-red-main` as its
escape; `contracts/retired.json` said the flags were named as ignored, and carved
`safe-merge-preflight` out of its own pattern by lookahead so an instruction naming a deleted script
passed the gate built to catch that; `retryLandingFor` would have copied a pre-cutover command
verbatim and spent a serialised slot on a module-not-found (366 such records are inside the
14-day retention); and the receipt gate read the wrong worktree's shelf.

## What is left, and why

**The queue's refusal vocabulary is still the lander's.** Filed as
`docs/backlog/the-queues-refusal-vocabulary-is-the-landers.md`. `REFUSAL_MARKER` is literally
`auto-merge REFUSAL-KIND:`, and `ORDER_BLOCKED_REFUSAL` and `SHARDS_SKIPPED_REFUSAL` name gates the
merge queue does not have. Only the pin classifier can still fire. It is filed rather than fixed
because their retry paths are live code with measured reasons - the twelve-hour ordering hold, the
one full-suite dispatch - so unwinding them changes how the queue RECOVERS, not what a thing is
called. That wants its own row. Nothing lies meanwhile: an unrecognised refusal gets the generic
sentence, and old records on disk still carry these kinds.

**Six backlog rows still name a deleted script.** Two whose whole premise was a landing refusing on
this machine are closed with the deletion. The rest need a read, not a sweep, and the filed row
lists them: `merge-conflicts-are-resolved-by-a-consult-never-the-owner` is an OWNER ask whose
`touches:`/`covered-by:` point at deleted files but whose ask stands - do not delete it;
`cloud-sessions-for-stateless-rows` cites the temporary-worktree machinery as already built, and it
is not; `one-gh-run-list-helper` counts six private `gh run list` copies, three of which went with
the lander. `check-retired-names` cannot see any of this - `docs/` is deliberately outside the files
it scans, which is the same blind spot that let the scripts sit on disk for two days.

**Comments naming the lander outside the row's files** were left where they are plainly historical
(`alarm-issues.mjs`, `red-main-issue.mjs`, `migration-drift.mjs`, `supabase-projects.mjs`,
`command-match.mjs`, `blocked-sessions.mjs`). Every one that PRINTED to a person, or read as a live
mechanism inside the queue, the hooks or the three workflows, was corrected.

## Pointers

- The pin, end to end: `scripts/jobs.mjs` `cmdAddMerge`, `scripts/land-watch.mjs` `watchVerdict`,
  `scripts/jobs-store.mjs` `declaredCommitOf` / `repinnedCommand` / `requeueDecision`.
- The receipt gate: `scripts/jobs.mjs` `refuseUnansweredReceipts`, over
  `scripts/owner-receipts.mjs` `servesVerdict`.
- Why `main-health` went: `scripts/ci-watch.mjs` and `scripts/red-main-issue.mjs` headers, and the
  rewritten section in `docs/CI_STABILITY.md`.
