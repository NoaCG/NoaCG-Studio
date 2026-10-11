# AC-10: a plan run and a wave exclude each other

Recorded by the implementing row (branch `claude/j-plan-run`), 2026-10-09, on Windows 10.

## What was run

- **Live store** (the machine's real wave store, `.git/noacg-jobs/wave-plans`), 2026-10-09 16:01
  Helsinki, while the 2026-10-09 day wave was open (window to 2026-10-10T06:00+03:00):
  - `node scripts/wave-plan-store.mjs --open 2026-10-09 plan-editor --until 2026-10-09T23:00:00+03:00`
    exited 1: `another wave or plan run is open (no report yet): ...\2026-10-09-day-wave-plan.local.md.
    One at a time: finish or report it first.`
  - `node scripts/wave-plan-store.mjs --open 2026-10-09 plan-editor --until 2026-10-11T06:00:00+03:00`
    exited 1: `a wave runs at most 24 hours from its start (2026-10-09T13:01:22.323Z), and
    2026-10-11T06:00:00+03:00 is later than that`.
  - `--list` afterwards showed no plan-run file: a refusal writes nothing.
- **Isolated stores** (`node --test scripts/wave-plan-store.test.mjs`, each test in its own temp
  store): a plan run open refuses a night wave; a night wave open refuses a plan run; a plan run
  asked for more than 24 hours is refused; the plan-run filename is `<date>-plan-<plan>-wave-plan.local.md`
  and a kind outside `day`, `night`, `plan-<name>` is refused. 13 of 13 pass.

## Observed

Both directions refuse through the one open-wave check (`openWaves`), since a plan run is a wave
file of the kind `plan-<plan>` in the same store. The 24-hour ceiling is the same check as a wave's.

## Limitations

- "A wave refused while a plan run is open" was proved in an isolated store only: opening a real
  plan run in the live store was itself refused, because this day wave was open.
- As for waves, a plan-run file nobody has written to for six hours stops counting as open.
