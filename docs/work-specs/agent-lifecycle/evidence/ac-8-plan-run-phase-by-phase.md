# AC-8: a plan run moves phase by phase with a separate check

Recorded by the implementing row (branch `claude/j-plan-run`), 2026-10-09, on Windows 10, from
Claude Code, against an isolated wave store.

## What was run

- `node --test scripts/plan-run.test.mjs` (7 pass): three phases recorded build, landed, check,
  pass in order; a step of phase n+1 is refused until phase n's check passed, at every point of
  phase n; `next` reports `done` after the last phase; once the window has passed, `next` launches
  nothing new but still waits for a launched step.
- A real `/plan-run` on a throwaway three-phase plan (a greeting file, a line counter, a second
  line), each phase with written acceptance:
  - The coordinator was a Claude Code subagent given `.agent-workflows/plan-run.md` and test
    overrides. The plan lived in a scratch git repository with no remote; its `main` played
    `origin/main`, and "landing" was `git merge --ff-only` there instead of the merge queue, so no
    pull request was opened. The wave store was a scratch directory (`NOACG_JOBS_DIR`).
  - Every builder and checker was a separate fresh `wave-row` session given only its brief, each in
    its own worktree on `claude/plan-proof-p<n>-<build|check>`, one at a time.
  - The run was interrupted after recording phase 2's build (see AC-11) and finished by a second,
    fresh coordinator.

## Observed

The run's wave file (worktree paths shortened to `<scratch>`):

```
## Phases
1. Greeting file - acceptance under "## Phase 1 - Greeting file" in PLAN.md
2. Line counter - acceptance under "## Phase 2 - Line counter" in PLAN.md
3. Second line - acceptance under "## Phase 3 - Second line" in PLAN.md

## Steps
- 13:03:19Z phase 1 build branch claude/plan-proof-p1-build worktree <scratch>/claude-plan-proof-p1-build
- 13:04:29Z phase 1 landed dd645b5
- 13:04:34Z phase 1 check branch claude/plan-proof-p1-check worktree <scratch>/claude-plan-proof-p1-check
- 13:07:09Z phase 1 pass notes 270d486; greet.txt is exactly hello+LF; ... phase 2 counter should tolerate CRLF
- 13:07:16Z phase 2 build branch claude/plan-proof-p2-build worktree <scratch>/claude-plan-proof-p2-build
- 13:09:28Z phase 2 resume build session gone after restart; fresh session in branch claude/plan-proof-p2-build ...
- 13:11:11Z phase 2 landed ea64929
- 13:11:21Z phase 2 check branch claude/plan-proof-p2-check worktree <scratch>/claude-plan-proof-p2-check
- 13:13:03Z phase 2 pass notes ef95e5d; count.mjs prints 1, also on a CRLF clone; ...
- 13:13:15Z phase 3 build branch claude/plan-proof-p3-build worktree <scratch>/claude-plan-proof-p3-build
- 13:14:29Z phase 3 landed 2b96871
- 13:14:42Z phase 3 check branch claude/plan-proof-p3-check worktree <scratch>/claude-plan-proof-p3-check
- 13:16:10Z phase 3 pass notes af92609; greet.txt is hello+world, count.mjs prints 2; ...

## Report
- Phase 1 Greeting file: landed dd645b5, check PASS (notes 270d486).
- Phase 2 Line counter: build interrupted by the restart, resumed in the same worktree; landed ea64929, check PASS (notes ef95e5d).
- Phase 3 Second line: landed 2b96871, check PASS (notes af92609). count.mjs prints 2.
- Stopped at: end of plan, all 3 phases built, landed and checked, well inside the 21:00 window.
```

Each phase's build landed before its check launched, each check ran in a different session from
the build, and no phase started before the previous check passed. The builder added the next
phase's notes to the plan in its own commit, and the checker added its findings (a CRLF trap
found in phase 1 reached phase 2's builder, which handled it). The final `next` printed
`done: all 3 phases built, landed and checked`.

## Limitations

- Landing was a local fast-forward, not the merge queue, and the checker tested the scratch
  repository's `main`, not production. The merge queue path is the one waves already use.
- Sessions were launched blocking from a subagent coordinator; a real coordinator is the main
  session launching background `wave-row` agents.
- The time-limit ending is proven by the unit test only.
- From Codex: see AC-13.
