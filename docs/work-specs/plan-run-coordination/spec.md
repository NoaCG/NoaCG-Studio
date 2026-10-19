# Plan run: fewer landings, a binary check, and windows that survive the day

Current project authorization/pause semantics supersede this historical window design:
see [continuing preparation](../continuing-plan-preparation/spec.md) and its runbook.
The original below remains historical evidence; ordinary waves keep their limits.

Authority: owner, 2026-10-11, after the guided-mod run (`/plan-run guided-mod`, wave file
`2026-10-11-plan-guided-mod`): improve the skill from that run's evidence, in proportion to it.

## Why

The guided-mod run built four phases in 6 h 15 min and left `main` green, but its shape cost time
and attention that the plan's work did not need:

- **Eleven landings for four phases.** Five of them were checker-notes pull requests (#1002, #1008,
  #1013, #1019, #1022), each a docs-only change that waited 7 to 10 minutes in the merge queue and
  started a full CI run on `main` that the next landing cancelled. The two red-on-main alarms of
  the day (#1020, #1028) fired on the `main` runs those two notes landings started: the cause was a
  stale durations table (#1027), not the notes, but each landing is one more full run to go wrong.
- **A PASS with blockers.** The phase 4 check passed "with one thing to fix before the owner's
  walk" and three smaller findings; the coordinator then launched a follow-up outside the ledger
  (#1024). A verdict that needs repairs before the user outcome holds is a FAIL with a repair path,
  not a PASS with homework.
- **Windows and restarts.** `wave-plan-store.mjs --open` with a new `--until` on the same date
  silently keeps the morning's window, so `next` answers `time-limit` for a run the owner just
  re-authorised (reproduced); a finished morning report lets a wave open beside the continuing plan
  run; a new date for the same plan starts an empty ledger. Nothing wakes the coordinator before the
  deadline, and nothing records a safe stop.

## Goal

One coordinator runs a prepared plan through a window of up to 24 hours: it launches fresh builders
and independent checkers, routes repairs, and advances phase by phase. A four-phase plan without
repairs makes five landings (four implementation pull requests and one final notes pull request).
A check is PASS or FAIL on the phase's stated user outcome. The run stops safely at its deadline,
continues after a laptop interruption or under a new window the same day, and never duplicates a
worker or loses a finding.

## Non-goals

- No change to the merge queue, `/check`, `/queue-merge` or the orchestrator.
- No cloud ledger or new infrastructure; the cloud assessment is a report, not a build.
- No retrospective per phase; one midpoint and one final.
- No new document for a lesson: the procedure is edited within its 90-line cap.

## Key decisions

1. **Findings travel in the ledger, then in the next worker's pull request.** The checker returns
   PASS or FAIL and its findings in its final report; the coordinator records them as the `pass` or
   `fail` line's detail. `plan-run.mjs next` prints them (`carry:`) with the next `launch build` or
   `launch repair`, and the brief tells that worker to add them under the plan's `## Phase notes`.
   Only the last phase's checker, and a second check after a repair, land a notes pull request
   (`next` says `land notes`). A finding is never lost: the wave file lives outside any checkout.
2. **FAIL has a kind.** The `fail` detail starts with `product:` (the phase does not deliver its
   outcome: repair) or `blocked:` (a prerequisite or infrastructure failure: the coordinator clears
   the obstacle, or `stop`s to ask, then the check runs again, once). Missing evidence for a required
   criterion is FAIL. "PASS, but fix these first" does not exist.
3. **The deadline is a wake-up, not a guess.** From 45 minutes before the window ends, every `next`
   answer ends with the minutes left; a one-shot wake-up is armed at that mark. The coordinator
   launches only a step that lands in time, otherwise checkpoints: workers commit and push what they
   have, queued pull requests are left to GitHub, and `paused <what remains>` is recorded.
4. **A new `--until` is a new window; the same `--until` is a restart.** The store rewrites the
   window lines, measures the 24-hour ceiling from the new start, and demotes earlier `## Report`
   headings so the run counts as open again. A new date for a plan whose run is not done is refused
   with the file to reopen.
5. **One midpoint retro, one final.** For a plan of four or more phases `next` says `retro` once,
   when the middle phase has passed and the file has no `## Midpoint retro`; the final retro is the
   report's.
6. **Policy stays explicit.** Builders and checkers run as `wave-row` (Opus, high effort); the
   coordinator stays thin on any model; workflow fan-out (`ultracode`) only when the owner's run
   prompt says so.

## Acceptance criteria

### AC-1: Four phases, five landings
A simulated four-phase run without repairs records build, landed, check, pass per phase; `next`
tells only the fourth check to land notes, and prints the previous check's findings with each
`launch build` from phase 2 on. Unit test.

### AC-2: A blocker is a FAIL with the right recovery
`fail product:` leads to `launch repair` carrying the findings; `fail blocked:` leads to `launch
check` again without a repair; a second `blocked` stops the run; a `fail` without a kind is refused.
Unit test.

### AC-3: Findings survive a restart
After `pass` with findings and a restart, a coordinator reading only the file is told the same
`carry:` text. Unit test.

### AC-4: The deadline prepares, then stops safely
Within 45 minutes of the window end `next` still names the step and adds the minutes left; at the
end it launches nothing and waits for launched steps; `paused` is accepted on a running step and
changes nothing else. Unit test.

### AC-5: A new window the same day, a restart in the window
Reopening with a new `--until` rewrites the window, enforces 24 hours from the new start, keeps the
ledger, and makes a wave refuse again; the same `--until` resumes; a new date for an unfinished plan
is refused naming the file. Unit tests, written to reproduce the defects first.

### AC-6: One midpoint retro
On a four-phase plan `next` says `retro` once after phase 2 passed and never after the heading
exists; a three-phase plan never asks. Unit test.

### AC-7: The procedure fits its cap
`.agent-workflows/plan-run.md` is at most 90 lines with its pinned markers;
`node scripts/check-shared-instructions.mjs` passes; the Codex skill repeats nothing stale.

### AC-8: Landed and green
This work lands through `/check` and `/queue-merge`; `main` is green after it.

### AC-9: Cloud assessed and tried
A written assessment of a plan run without the laptop, and the smallest end-to-end cloud trial that
existing access allows, with what it proved and what remains unproven.
