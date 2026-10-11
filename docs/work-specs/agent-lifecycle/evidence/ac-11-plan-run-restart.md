# AC-11: a plan run continues after a restart without repeating anything

Recorded by the implementing row (branch `claude/j-plan-run`), 2026-10-09, on Windows 10, from
Claude Code, against an isolated wave store.

## What was run

- `node --test scripts/plan-run.test.mjs`: with phase 1 passed and phase 2's build recorded, a
  coordinator reading only the file is told `wait build phase 2` with the recorded branch and
  worktree; a second `build` for phase 2 is refused ("already launched: resume it"), as is any
  step for passed phase 1; `resume` is accepted and changes nothing else.
- The AC-8 run, interrupted for real: coordinator 1 ran phase 1 (build, landed, check, pass),
  recorded phase 2's build and created its worktree, then stopped without launching the builder,
  as a closed computer would leave it. Coordinator 2, a fresh session told only that the run had
  been interrupted, started the same run again.

## Observed

- Coordinator 2 reopened the run with the same date and plan
  (`wave-plan-store.mjs --open 2026-10-09 plan-proof`), which returned the existing wave file.
- `next` said `wait build phase 2`. It found the branch without commits and nothing landed,
  recorded `resume`, and started a fresh session in the same worktree on the same branch. It did
  not create a second branch or re-run phase 1.
- It then ran phase 2's landing and check and all of phase 3 to `done`. All eight `record`
  calls it made were accepted; the wave file holds exactly one `build` per phase and one `check`
  per phase (AC-8 evidence lists the lines).

## Limitations

- The interruption was simulated by instructing coordinator 1 to stop, not by closing the
  machine, so a builder session killed mid-commit was not tried. The ledger treats both alike: the
  step is in flight until `landed` is recorded.
- From Codex: see AC-13.
