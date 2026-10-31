# Phase ci03: candidate dispatches and source identity

Row ci03 of the [cicd-improvement spec](../spec.md) (P1a; AC-6 scheduling). Prepared 2026-10-31
by the ci03 builder (Claude Code Cloud worker of plan run #1842) from `main` at
`1fcbb1f393c53f7bad5c39254469b6e065a8dd8b`. It verifies what PR #1816 landed and changes only the
two gaps that remained. AC-6 as a whole stays open: its selected PR gate is ci06 and its cohort
is ci14.

## 1. What PR #1816 already does, verified

`configured-suite.yml` at the source SHA:

| Property | Verified by | Result |
| --- | --- | --- |
| A landing (push on `main`) gets a group per commit, so per-landing full backend validation keeps one verdict per landing | the concurrency expression; 27 push runs from 2026-10-29 13:49 to 2026-10-31 11:40, none cancelled | holds, unchanged |
| A dispatch on a branch gets that branch's group | expression; 12 dispatch runs in the same window on six branches | holds, unchanged |
| `cancel-in-progress: false` | workflow text | holds, unchanged |
| Every job checks out `github.sha`, fixed when the dispatch event is created | the three `actions/checkout@v5` steps carry no `ref:` | holds; now pinned by a test |
| Cross-branch cancellation stopped | dispatches before #1816 (2026-10-28 08:46 to 2026-10-29 13:49): 41, of which 28 cancelled. After: 12, of which 3 cancelled, all on their own branch | holds |

The three cancellations after #1816, read from their jobs:

| Run | Branch, commit | Jobs started | What cancelled it |
| --- | --- | --- | --- |
| 41195194922 | ci02 build, `1dc0a125` | 5 of 7 | not the group (it never cancels a started run): the branch owner, after pushing a newer head |
| 41195809538 | ci02 build, `137644fe` | 5 of 7 | same |
| 41197150230 | JEV build 2, `43a000d8` | none | the group: pending behind 41196943268, replaced 2 s after 41197443186 (`bec791a7`) was dispatched |

So the one remaining scheduling hazard among branches is the one #1816 left on purpose: a pending
run replaced by a newer dispatch on the same branch. It is not a fault while the newer head is
what needs the verdict, and it is a lost verdict when the older commit is still required.

## 2. The gaps that remained

1. **Schedules and main dispatches shared a group** (`'shared'`). GitHub keeps one pending run
   per group, so a pending cron run and a pending dispatch on `main` replaced each other. No main
   dispatch happened in the last 100 runs; the collision is in the expression, and the spec
   (D5) names it.
2. **No request-to-run identity.** A worker dispatched with `gh workflow run ... --ref <branch>`,
   which names a branch, not a commit, and found "its" run again by listing. Nothing refused a
   run on a commit the branch had moved to, two overlapping dispatches on one branch, or a
   replaced pending run; a coordinator compared `head_sha` by hand.

## 3. The change

- **Concurrency** (`configured-suite.yml`): the group is now
  `push → github.sha`, `workflow_dispatch → github.ref` (main included), anything else (the cron)
  `→ github.event_name`. The cron is alone; a main dispatch groups with main dispatches only; a
  branch dispatch and a landing are unchanged.
- **`scripts/candidate-dispatch.mjs`**, used by plan-run workers (known-traps "The configured
  suite"):
  - `dispatch --ref <branch> [--sha <commit>]` runs the existing observation advisory
    (`verification-dispatch.mjs`, still gating nothing), then refuses unless the branch head is
    that commit. It records the intent (repository, workflow, ref, commit, time, the dispatch
    runs already on that ref) **before** dispatching, then dispatches once with
    `return_run_details`.
  - The run ID GitHub returns is the only proof of identity (rules below). A returned run on
    another commit is `mismatch`, refused (exit 1). Without a returned ID the record never gives
    a verdict: no new run on the ref is `absent` until a complete listing five minutes on says
    `not-delivered`; any new run makes it `unproven`. Both take `--recover`, a fresh dispatch.
  - `reconcile <record> [--recover]` re-reads that identity and settles it: `running`,
    `verdict` (with conclusion), `superseded` (cancelled; the later runs on the same commit carry
    the verdict: failing if any failed, running while any runs, passing only if all passed), `cancelled` (stopped after its jobs started, so
    by a person or session: never recovered automatically), `recover` (cancelled while pending,
    nothing replaced it, the commit is still the head: `--recover` dispatches it again, once per
    record), or `obsolete` (the head moved; a
    verdict a checker still requires for that commit uses the existing exact-SHA check branch in
    `check.tmpl`). A `superseded` answer carries the replacement's conclusion once it finishes.
    Exit 0 only for a finished, passing run on the requested commit; 1 for a refusal or a
    failing verdict, the replacement's included; 2 when there is no verdict and something to
    do; 3 while the run or its replacement is still running. No script reads the exit code
    today; workers follow known-traps.

Not changed: `ci.yml` (ordinary PR cancellation and the merge-group group), the exact-SHA
recovery path, the push trigger, per-landing full backend validation, the observation-only
lookup and its runbook mode, worker full-backend dispatch policy (ci06 owns its replacement).

## 4. Acceptance

| Criterion | Evidence | Result |
| --- | --- | --- |
| (a) Three unrelated intended candidates have attributable run IDs and matching `head_sha` verdicts | Live trial, section 5: three open PR heads dispatched within 12 s, each with its returned run ID, its own commit and a green verdict; fixture with three branches | pass |
| (a) Schedules isolated from main dispatches | `candidate-dispatch.test.mjs` evaluates the workflow's own group expression for landings, the cron, a main dispatch and three branches: all distinct, cron = `configured-suite-schedule` | pass |
| (a) Required pending same-branch supersession has recovery | live: run 41200019293 replaced while pending by 41200054838; `reconcile` answered `superseded` by 41200054838 on the same commit. Fixture: `recover`, `--recover` once, refused the second time, `obsolete` after the head moved | pass |
| (a) Preserve `github.sha` checkout | test: no checkout step pins `ref:` | pass |
| (a) Refuse ambiguous or mismatched request-to-run evidence | fixtures: without a returned ID no run is adopted (`unproven`), even when the right run later appears beside another; ref moved between check and dispatch → `mismatch`; live: a stale `--sha` refused with nothing dispatched or recorded | pass |
| (b) Reconcile uncertain dispatches by recorded intent, ref, requested commit and run identity | fixtures: intent written before the POST; a lost acknowledgement is reconciled against the recorded ref, commit, time and prior runs to `absent`, `not-delivered` or `unproven`, never to an inferred run; `--recover` dispatches afresh once; a late original changes nothing; 422 recorded as refused | pass |
| (b) Preserve per-landing full backend validation and observation-only lookup | push groups per commit (test); observation runs before the POST and its failure does not block (test); live advisory printed `UNRESOLVED` and the dispatch proceeded | pass |
| (c) Reuse #1816's groups; verify same-branch replacement, schedule/main interaction, actual source identity; change only demonstrated gaps | sections 1 to 3 | pass |

Mutation check: restoring the old `'shared'` expression fails the concurrency test; removing
the commit comparison fails the mismatch test.

### Rules (found after coding)

Two successive review rounds (below) found variants of one missing rule, so a fresh read-only
reassessment of the rule model came before the repair. It agreed with corrections, all applied:

1. A run answers a dispatch only by proof: the run ID GitHub returned for it. Timing, ref and
   commit never stand in for it.
2. Exception, needed by same-branch supersession: a proved run that was cancelled takes its
   verdict from the later dispatch runs of the same workflow, ref and commit: failing if any of
   them failed, running while any runs, passing only if all passed, and only from a complete
   run listing (otherwise `unresolved`). The answer names them.
   That workflow's dispatch takes no inputs and checks out `github.sha`, so that verdict is about
   the commit. The helper therefore serves `configured-suite.yml` only (a test pins
   `workflow_dispatch: {}`), and a run of any other workflow never adopts another's verdict.
3. A run on another commit than requested is refused.
4. Without a returned ID the record never gives a verdict. With no new run on the ref it is
   `absent`, then `not-delivered` after a complete listing five minutes on; with any new run it
   is `unproven`. The way out is a fresh dispatch (`--recover`, once per record).
5. Nothing unproven is persisted, and a run that turns up late changes nothing.
6. Exit 0 only for a finished, passing run under rules 1 and 2.
7. Nothing is sent before its claim is on disk, created exclusively: a dispatch's intent record
   (which names the record it recovers, if any), and for `--recover` a claim on the old record.
   A concurrent caller, or a restart after the send, finds the claim and sends nothing. A
   recovery refused before anything was sent frees its claim.

Sweep of every path that sends an external request, against rule 7: `dispatch` (intent record
before the POST) and `--recover` (claim, then `dispatch`). The observation advisory and all
reconcile reads only read.

The reassessment rejected a request-ID workflow input echoed in the run title: it changes the
workflow for every event to solve what a fresh dispatch already solves.

## 5. Live trial (bounded: five dispatches, four full runs)

The dispatch API returned the run ID (`workflow_run_id`) every time, so the spec's "the dispatch
call currently returns no run ID" no longer holds; listing is only the fallback.

Three unrelated candidates, dispatched through the helper at 12:11:16 to 12:11:28 UTC. The two
others are open bot PRs (#1840, #1834) where no one dispatches this suite; a dispatch off `main`
writes no issue and no quarantine.

| Candidate | Requested commit | Run (returned ID) | Run `head_sha` | Verdict |
| --- | --- | --- | --- | --- |
| this PR's branch | `7111a18e` | 41199979934 | `7111a18e` | success (plan, 4 shards, verdict job all ran) |
| #1840 `bot/e2e-traced` | `3d03b88e` | 41199986962 | `3d03b88e` | success (plan, 4 shards, verdict job all ran) |
| #1834 `quarantine/enter-2026-10-30-20ab0166` | `ddf504da` | 41199994555 | `ddf504da` | success (plan, 4 shards, verdict job all ran) |

Same-branch replacement on this branch while 41199979934 ran: 41200019293 (pending) was
cancelled when 41200054838 was dispatched on the same commit; `reconcile` on the first record
said `superseded` by 41200054838, whose verdict is success with every job run. A dispatch with a stale `--sha`
(`1fcbb1f3`) was refused: nothing dispatched, nothing recorded.

All three were in progress together at 12:20 UTC; none cancelled another, and `reconcile` on each
record returned `verdict`, `success`, on its own requested commit. The trial used the helper at
`7111a18e`; later review commits changed how a cancelled run is read (section 3), not dispatch or
attribution, and the fixtures cover both.

Not exercised live: a schedule meeting a main dispatch (the new group takes effect only once
landed; the cron starts hours late and cannot be timed), a lost acknowledgement, and a genuine
ambiguity. These are fixtures.

## 6. Review rounds

| Round | Finding | Family | Class | Fix |
| --- | --- | --- | --- | --- |
| Codex on `1deedf58` (comment 4431729773) | reconciling a cancelled run whose same-commit replacement failed answered `superseded`, exit 0, so the failure hid behind the cancel | a superseded verdict must carry its replacement's outcome | product defect | `superseded` carries the replacement's conclusion and exit code; failing test first |
| Coordinator on `9dced3da` | a still-running run or replacement exited 0, which a reader could take as validated | pending evidence is never a pass | product defect | exit 0 only for a finished pass; 3 while running |
| Codex on `9dced3da` (comment 4431737832) | two dispatches of one commit in the same millisecond got one record name, and the second overwrote the first | run identity must be proved, not inferred | product defect | random suffix, created exclusively; failing test first |
| Codex on `a0371da1` (comment 4431748828) | after a lost acknowledgement, the first reconcile adopted a concurrent run on the same ref and kept it, so the real run's failure could be missed | run identity must be proved, not inferred (repeated family) | product defect | rules above: no inference at all without a returned ID; failing test first |
| Codex on `eec131b4` (comment 4431771414) | `--recover` sent its dispatch before recording the claim, so a restart or a concurrent caller could send a second full suite | run identity and delivery must be proved, not inferred (fourth round) | product defect | rule 7, swept across both send paths; restart and interleaving tests first |
| Codex on `f121a8db` (comment 4431789152) | with `--workflow ci.yml`, a cancelled full run could adopt a replacement's pass made with a narrower `diff_base` | a verdict is adopted only from the same check | product defect | serve `configured-suite.yml` only; other workflows never adopt; test pins its input-free dispatch |
| Fresh `/so` on `60d66b49` (grade B) | a cancelled run with several later runs on its commit took the newest, so a failure between them was hidden by a later pass | a failure on the commit is never hidden by a later pass | product defect | every later same-commit run counts: any failure fails it; test first. Non-blocking note taken: known-traps says an `attempt` above 1 is a re-run to read in full |
| Codex on `f3df92d4` (comment 4431892429) | the cancelled-run path ignored whether the run listing was complete, so past one page an earlier failure could drop out and the record pass | a failure on the commit is never hidden (same family as the row above) | product defect | no pass, and no `recover`, from an incomplete listing; a found failure still fails; 101-run test first |

## 7. Phase notes

- **Previous verified main:** `1fcbb1f393c53f7bad5c39254469b6e065a8dd8b` (#1852, ci02; its
  exact-merge CI, configured-suite, post-landing and quarantine runs are green).
- **Revert:** `git revert -m 1 <merge commit of this PR>`, landed through `/queue-merge`. It
  restores the shared cron/main group, removes the helper, its test, the known-traps lines, the
  runbook row and this file. Records the helper wrote stay in each worktree's git directory.
- **Decisions:**
  - Identity comes only from the dispatch's returned run ID, not from a new workflow input or
    from listing. That works on any branch whatever workflow file it carries, and needs no
    workflow change beyond the group. A lost acknowledgement costs at most one fresh dispatch.
  - A dispatch on `main` keeps one group with other main dispatches (serial, as before) and
    leaves the cron's; nothing else about main changes.
  - A cancelled run is followed to a newer run on the same commit before any recovery, so a
    double dispatch never costs a third run. Recovery happens only on request (`--recover`) and
    once per record: no automatic retry.
  - Five minutes settles absence: GitHub creates a dispatch run within seconds, and absence is
    believed only from a complete listing.
- **Traps:**
  - A cancelled run with started jobs was cancelled by a person or session, not by the group:
    `cancel-in-progress: false` never cancels a started run. Read the jobs before blaming
    supersession.
  - `run_started_at` equals `created_at` even for a run waiting in its group; it does not show
    when a run actually started.
  - Build branches are deleted after landing, so a finished phase's branch cannot be used to
    re-run its candidate; the exact-SHA check branch is the route.
