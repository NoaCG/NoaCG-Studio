# Row S - the two alarms that mean nothing, and the one that misled the orchestrator

Branch `claude/s-loop-liveness-signals`, two commits on `e7eecdcf`.

The row asked for three defects fixed or explicitly refused with a reason, defaulting to refuted on
each. **One survived verification, one was refuted by measurement, and the third was real but not
the shape the prompt described.** The refuted one is the interesting result: implementing it as
written would have hidden three true alarms, one of them a landing that is still stuck.

## Claim 1 - `blocked-sessions.mjs` cannot be read as a live-session inventory: CONFIRMED

The prompt's reading is right, and the code says so plainly. A row exists only where `waitingOn`
finds a `tool_use` with no matching `tool_result` AND that call has been pending for `--minutes`
(`scripts/blocked-sessions.mjs`, the `if (!w) continue` / `if (waited < minutes) continue` pair). A
session that is working has results arriving, so it can never qualify. An empty list is silence
about every session, not an all-clear about any.

Demonstrated rather than argued: running it printed `No session has been waiting on a tool call for
30+ minutes.` while `claude-agents.mjs`, at the same moment, listed two live interactive sessions.
Neither appeared anywhere in the first output.

**What changed.** The header had carried this warning since the file was written and the reader
still went wrong, so a better warning was not the fix. The script now ANSWERS the other question:
every human invocation prints the harness's live-session inventory underneath the wait list, scoped
to this repo, with each row's `status` and `waitingFor` when the build publishes them. It states its
own limit too - the inventory never lists an Agent-tool subagent, a Codex session or another
machine - and points at night.md's three-signal test as the thing that actually decides.

`--json` is byte-for-byte unchanged, a top-level array. `wave-tick.mjs` parses it every tick and
refuses anything that is not an array, and `printLiveness` is never called on that path, so the
tick still spawns nothing on a quiet poll.

## Claim 2 - `ci-watch.mjs` alarms on a state every healthy branch passes through: REFUTED

The mechanism does not exist as described, and the measurement contradicts the conclusion.

- **The `Reviewed` job never runs on `push`.** `.github/workflows/ci.yml` line 207 gates it on
  `pull_request || merge_group || (workflow_dispatch && require_review)`. A branch that has pushed
  and has no pull request produces no `Reviewed` job at all, so the "window between push and queue"
  is not red - it has no such check in it.
- **A pull request exists only because `/queue-merge` opened one**, and `queueOnGitHub`
  (`scripts/jobs.mjs`) posts the `noacg/reviewed` status seconds after `pr create`, well before a
  runner picks the job up. Measured on the same wave: PRs 161 and 163 were opened and queued minutes
  apart on 2026-09-08 and **neither produced a `Reviewed` red**.
- **All three of that night's `Reviewed` reds were true.** The whole `ci-watch-events.log` is 12
  lines; three are `job: Reviewed`, all from 2026-09-08:
  - runs `34278428513` and `34280491861`, PR 102 `claude/oss-community-files` - auto-merge enabled
    `2026-09-07T08:30:28Z`, `land` label present, and the tip moved twice on 09-08 (`d500b651`, then
    `c68f2a92`) with no fresh stamp. Queued and unable to land. This is exactly the case
    `queue-merge.md` names under "a tip that moved after the declaration".
  - run `34281341883`, PR 162 `claude/p-handoff-drain` - the pull request was opened at 21:34:15
    with the generated body, and at 21:38 there was **no `noacg/reviewed` status on the tip at all**,
    no `land` label and no auto-merge. A `/queue-merge` that opened the pull request and stopped.

So the alarm was not noise; the orchestrator misread three true alarms as routine, which is the
mirror image of claim 1. **Suppressing a `Reviewed`-only red on an unqueued branch would have
hidden PR 162 entirely.** The row's step 4 asked for exactly that suppression, and I refused it.

**What changed instead.** The alarm is untouched - nothing is suppressed. The LINE is what was
wrong: `job: Reviewed` names a job and sends the reader to a dashboard. It now says which of the two
shapes it is, read off the pull request:

    no /check stamp on this tip and the pull request IS queued - it cannot land until its own
    session runs /check and queues again

    no /check stamp on this tip and the pull request was never queued - the queueing stopped
    after opening it

    no /check stamp on this tip - open the pull request for whether it is queued

The third is what a `merge_group` branch and a GitHub outage both get; a vague alarm is allowed, a
wrong one is not. Re-derived against the three real runs, and the separation held: PR 102 read as
queued-with-a-moved-tip, PR 162 as queueing-stopped. Re-derived again an hour later after somebody
queued PR 162, and its line moved to the queued sentence on its own - the probe tracks live state
rather than a cached guess.

## Claim 3 - `night.md` states what its liveness test can answer: REAL, and fixed

The three-signal test at "A BRANCH NOBODY CAN DECLARE" names the inventory, the branch tip's age and
the transcript mtime. `blocked-sessions.mjs` is not one of the three - but step 2 of the tick
discusses its output at length in liveness language ("a wait behind NO live process..."), which is
where the substitution was available. The contract was right and the reader was wrong, so what was
missing is a sentence saying which question each instrument answers.

**Traded text for text, as asked.** Added to step 2: a paragraph naming what `blocked-sessions.mjs`
and `claude-agents.mjs` each answer and that neither answers "is this row alive". Added to the
three-signal test: "`blocked-sessions.mjs` is not one of the three". Paid for by compressing three
passages:

- the "a wait is one of three things" paragraph, tightened without losing a clause;
- the EMPTY WORKTREE paragraph, from 8 lines to 5 - the row S anecdote keeps its facts (fully
  gated, `/check` in all four legs, handoff written, dead session in a worktree) and loses the
  restatement of why the rule exists, which the sentence above it already carries;
- the queue-repair paragraph, which loses "and is what to reach for interactively" - the command is
  printed right there, and the sentence's actual point is that the loop needs the wrapped form.

**night.md is 19564 bytes, from 19562.** Two bytes larger, which I am calling a wash rather than
claiming a saving.

## What the check found

`review: delegated` - the code-review skill ran at `high`, returned in scope (this branch, this
worktree, the four files), and found six things. All six were verified against the code and fixed:

1. **The queue probe read the wrong pull request.** `gh pr view <branch>` answers with a MERGED pull
   request when a branch has no open one, and nothing in this repo ever removes the `land` label -
   confirmed empirically against `claude/night-loop-repair-path`, merged as PR 155, which still
   carries it. The watch would have printed "it cannot land" about a pull request that landed, and
   for a closed-unmerged one it would have told the loop to re-queue something a person rejected.
   Now `pr list --head --base main --state open`, the form `jobs.mjs` and `queue-pr.mjs` already
   use, which also cannot read a numeric branch name as a pull request number.
2. **A comment I wrote was false, and excused a live bug.** It claimed the transcript-side prefix
   test compares strings the script produced itself; a transcript's `cwd` is written by the session
   that owns it. One lower-case drive letter would have dropped a genuinely blocked session and
   printed the false all-clear the file's own fallback comment forbids. Both sides now go through
   `isUnder`, which normalises each and requires a `/` on the boundary, so a sibling checkout at
   `NoaCG-Studio-old` stops counting as this repo.
3. The inventory listing now says how many rows it filtered out, so a mis-scoped filter cannot look
   like a quiet machine.
4. The stale comment above the row-annotating `inventoryIndex()` call now says why there are two
   readers and why the tick still pays nothing.
5. Rows print `status` and `waitingFor` - a listed session at its own unanswered prompt is live and
   stuck, not live and working, and that is the distinction the whole file is about.
6. The repo-scope predicate moved into `claude-agents.mjs`'s pure section as `isUnder`, with a test
   covering the drive-letter case and the sibling-prefix boundary.

`simplify: inline` - the simplify skill returned fan-out instructions, which under check.md's
four-branch rule means the pass did not run, so I did the four angles here. Four fixes: the
`status`/`waitingFor` guard was written four times and is now `sessionState`; `livenessFor` carried
a third copy of the containment test and uses `isUnder`; `describeFor` and `describeRun` each
re-derived "only Reviewed" and now share `isReviewedOnly`; two printed paragraphs matched the file's
one-`console.log`-per-line drift rather than its concatenated-block style.

`verify: inline` - `npm run build` exit 0 read from the build's own status, twice (before and after
the check). 1633 passing assertions, `fail 0` in both test legs, every gate green including
`check:line-endings`, `check:contracts` and `check:owner-queue`. No product code changed, so no
e2e leg. `taste: not applicable` - nothing here can move what a graphic looks like.

## Judgements taken, so they can be reverted

- **Refused the row's step 4 outright.** The measurement is above; the one-line version is that
  suppression would have cost a landing. If a future night measures a genuine flood of false
  `Reviewed` reds, the place to look is the race between `pr create` and the status post, and the
  fix there is a grace period on run age, not a queue-state filter.
- **No `docs/acceptance/owner-queue/` item.** The owner ruled on 2026-09-04 that a technical problem
  is never his, and the only reader of these two instruments is the night loop. An item asking him
  to look at a script's stdout would be the wrong list.
- **No `npm run learn` rule.** Both fixes are mechanisms in the code, and the one contract sentence
  that was missing went into `night.md` where its reader already looks. A rule saying "do not
  substitute one instrument for another" would be the paragraph the row asked me not to write.

## What is left

- **PR 102 `claude/oss-community-files` is still stuck and its session is gone.** Queued
  2026-09-07, tip moved twice on 09-08, no stamp on `c68f2a92`. It needs `/check` and a re-queue
  from a session that can declare it, or the night loop's own queueing path for a branch nobody can
  declare. The new ci-watch line now says this out loud on every poll.
- **Local `main` in the shared checkout is stale** - it sits at `03aa732d` while `origin/main` is at
  `2a0d4b85`. `git merge-base main HEAD` therefore answers with a base six landings old and reports
  38 files as "this branch's diff". I used `origin/main` throughout after a fetch. Worth a `git
  fetch` in whatever creates worktrees, because any check run against local `main` in that checkout
  reviews other rows' work as if it were its own.
- **`session-liveness.mjs` re-implements `blocked-sessions.mjs`'s transcript scan**, already filed
  in `docs/backlog/cleanup-worktrees-dedup-and-speed.md`. `isUnder` and `sessionState` shrink the
  gap slightly; the scan itself is still duplicated.

## Pointers

- The liveness note: `scripts/blocked-sessions.mjs`, `printLiveness` and `describeRow`, and the
  "WHAT THIS IS NOT" paragraph in the header.
- The shared path and status helpers: `scripts/claude-agents.mjs`, `isUnder` and `sessionState`,
  both in its "Pure decisions" half, tested in `scripts/claude-agents.test.mjs`.
- The review-check wording: `scripts/ci-watch.mjs`, `describeReviewedOnly` (which carries the
  measurement that refused the suppression), `isReviewedOnly`, `describeRun` and `fetchPr`.
- The contract change: `.agent-workflows/orchestrator/night.md`, watch-loop step 2 and the
  three-signal test.
