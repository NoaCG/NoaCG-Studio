# A spec that fails on four different commits is invisible to every detector we have

**Filed:** 2026-09-08. **Source:** weekly quality review (measurement).

## Why

The repo has exactly one mechanical flake detector, and it only sees one shape of flake.
`scripts/e2e-quarantine.mjs` admits a spec on a **fail-then-pass receipt on the same sha** - CI
re-runs a red main run's failed specs on that commit, and a green second attempt is the proof. That
rule is right, it is honest, and it replaced a hand-kept table nobody read.

It cannot see the other shape. A spec that fails once on each of several different commits produces
no same-sha pair, so it never enters quarantine, never appears in `e2e/quarantine.json` (currently
`{}`, empty), and turns up in no report. The only thing that looks for it is a human running this
weekly review, and the recipe for doing so is prose in `docs/CI_STABILITY.md`.

**This week it found one.** Crossing the failure sets of every CI run between 2026-09-04 and
2026-09-08:

| spec | runs | distinct shas | branches |
|---|---|---|---|
| `e2e/import-svg.spec.ts` | 4 | 4 | `claude/two-row-set-recipe`, `claude/phone-work-session-arxjzr`, `claude/new-session-54bf87`, **`main`** |
| `e2e/wizard-filters.spec.ts` | 3 | 3 | all `claude/phone-work-session-arxjzr` |

`wizard-filters` is one branch failing its own tests three times, which is a branch doing its job.
`import-svg` is four different commits on four different lines of work, one of them main, and inside
it one single test failed on two of them:

> `svg import: the too-long mode answers the same however the reader got there`
> (run 33980943970 on `main`, run 34005995391 on `claude/phone-work-session-arxjzr`)

Two different shas, one test. That is either a flake or a defect that two branches independently
tripped, and by the repo's own standard - *"a spec that fails in several runs on different shas is
worth a branch; a spec that failed once is noise"* - it earns one either way. Nothing raised it. The
quarantine could not, because there was never a same-sha pair to see.

The cost is that this class is found weekly at best, by hand, and only when somebody runs a review
that GitHub's UI does not support. Between reviews it presents as unrelated red runs on unrelated
branches, each of which the branch owner reasonably reads as their own fault.

## What it would take

A session, and most of the parts already exist.

- `mainPushRuns()` and `fetchFailureSet()` in `scripts/ci-failure-set.mjs` already produce a
  per-run, per-spec set keyed by the repo-relative spec path - the same identity string the
  quarantine uses. A `--sweep <n>` mode that walks the last n runs, groups by item, and reports
  every item appearing on **two or more distinct `head_sha` values** is a small amount of new code
  over machinery that is already tested.
- Fix `docs/backlog/ci-failure-set-is-blind-outside-ci.md` first, or the sweep will report an empty
  world from anywhere but a workflow.
- **Where it reports is the real decision, not the query.** `weekly-audit.yml` already runs on a
  schedule and already files and closes an issue; that is the cheapest home and the one that does
  not add a new alarm channel. Do not make it a blocking gate: a cross-sha repeat is evidence for a
  human, not a verdict about the commit under test.

**What could break:** nothing in the landing path - this reads history and writes a report. The
failure mode to watch is noise. A threshold of two shas over a few days will name `job: Build`
constantly, because unrelated branches break the build for unrelated reasons; the sweep should
report spec items and job items separately, or filter to `e2e/` paths. Proof it works: run it over
2026-09-04..2026-09-08 and check it names `import-svg.spec.ts` and does **not** name
`wizard-filters.spec.ts`, whose three failures share one branch.

## Evidence

- `e2e/quarantine.json` on 2026-09-08: `"specs": {}`, `"released": {}` - nothing has ever entered.
- The failure sets of all eleven failed runs in the window, via
  `GH_REPO=NoaCG/NoaCG-Studio node scripts/ci-failure-set.mjs --run <id>`.
- Check-run annotations naming the individual test, for runs 33980943970 and 34005995391.
- `docs/CI_STABILITY.md`, the `gh api` recipes near the end - the manual version of this sweep,
  written down and run by nobody on a schedule.

## Trend

- 2026-09-08: 1 spec failing across 4 distinct shas (`e2e/import-svg.spec.ts`), 0 entries in
  quarantine, 0 automatic detectors of the class.
