# plan-run - run a long plan phase by phase

Shared procedure: `/plan-run <plan> until <time>` in Claude Code, `$plan-run` in Codex; translate
`/check` and `/queue-merge` the same way. The owner names the plan and the time limit. Each phase is
built by one fresh session and checked by another, and the next phase starts only after the check
passed. Output: the plan's phases landed on `main`, checked, and a short report.

**Runnable plans** (a name here and nothing else):

- `editor`: `docs/EDITOR_REBUILD_PLAN.md`; its order and acceptance are in `docs/EDITOR_PLAN.md`.

## Boundaries

- **One plan run or one wave, never both.** Opening the run refuses while a wave is open, and a
  wave refuses while the run is open.
- **24 hours is the ceiling**; opening refuses a longer window.
- **Only phases written in the plan.** Refuse a plan whose next phases have no acceptance criteria;
  never invent a phase or build past the plan's end.
- **Only the merge queue writes `main`.** Sessions land themselves with `/queue-merge`.
- **The coordinator stays thin**: it reads the plan's phase list and short results, never code,
  and keeps its state in the wave file. All real work runs in fresh sessions.
- **Never touch another session's worktree**, and `docs/private/` stays private.

## 1. Start

- **The window** is what the owner names, in Helsinki time with its offset. Unstated: ask him.
- **Open the run**: `node scripts/wave-plan-store.mjs --open <date> plan-<plan> --until <iso>`. It
  prints the wave file. After a restart, open it again with the date the run started.
- **First open only**: `git fetch origin main`, read the plan's phases, acceptance and phase notes
  on `origin/main`, and copy the phases still to build, in order, as a numbered list under
  `## Phases` in the wave file, one line each with where its acceptance is.

## 2. The loop

`node scripts/plan-run.mjs next <wave file>` names the one next step, from the file alone. Before
launching a step, record it: `node scripts/plan-run.mjs record <wave file> <phase> <event> <detail>`
with the branch and worktree. The ledger refuses a step out of order or launched twice; a refusal
means launch nothing and run `next` again.

- **launch build** (or **repair**): a builder with the brief below, the repair one with the
  checker's findings. When its pull request merges, record the event `landed` with detail `#<n>`.
- **launch check**: a checker with the brief below, after the phase is on `main`. When its notes
  pull request merges, record `pass` or `fail` and its findings in one line.
- **wait**: the step is running. After a restart its session may be gone: a merged pull request is
  recorded as `landed`; a queued one is waited for; otherwise start a fresh session in the recorded
  worktree with the same brief, and record `resume`. Never a second branch for one step.
- **stop**: the check failed after a repair, or a step met a decision the owner reserves
  (`verify.md` step 5). Record `stop <why>`, ask him here at once with your recommendation and a
  phone notification, and do not continue the plan past that phase. Record his answer as
  `answered <answer>`, then run `next` again.
- **done** or **time-limit**: write the report.

Sessions, each in its own worktree on `<tool>/plan-<plan>-p<phase>-<build|check|repair>` (`-2` on
a second check):

- **Claude Code:** the Agent tool with `run_in_background`, agent `wave-row`. Each finished session
  wakes you; while you wait on a landing, a background `sleep 1800` is the fallback wake.
- **Codex:** `git worktree add -b <branch> <path> origin/main`, then `spawn_agent` without your
  context, that absolute path its only working directory; `wait_agent` with a timeout, and a
  30-minute thread heartbeat as the fallback wake. Ask the owner in this thread.

**The builder brief**: the row brief from `orchestrator.md` step 3, after these lines:

```
PHASE   <n> of <plan document>: <phase name>. Build it against its acceptance criteria and nothing
        else; read the plan's phase notes and the decisions it records first.
NOTES   In the same pull request, add the next phase's notes under the plan's `## Phase notes`:
        what changed that it must allow for, decisions taken, traps found, the check's findings.
```

**The checker brief**:

```
CHECK   Phase <n> of <plan document>: <phase name>. You did not build it. On current origin/main,
        do the phase's task the way a user would, check each acceptance criterion and the user
        outcome the plan states, and where the plan names reference products, do the same task
        there and compare. Change no product code. Add your findings under the plan's
        `## Phase notes` in a docs-only pull request, /check and /queue-merge it. Finish with one
        line, PASS or FAIL, then at most five lines of findings.
```

## 3. Report

At the end, write under `## Report` in the wave file and send it to the owner, at most 15 lines in
plain words: **Needs you** first (or "nothing"), then each phase with its pull requests and the
check's verdict, where and why the run stopped, and what was not checked.
