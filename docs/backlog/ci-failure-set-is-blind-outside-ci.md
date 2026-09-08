# `ci-failure-set.mjs` names nothing outside CI, and says `unknown` instead of saying why

**Filed:** 2026-09-08. **Source:** weekly quality review - the review's own tooling failed under it.

## Why

`node scripts/ci-failure-set.mjs --run <id>` is the repo's answer to "what actually broke", and from
a laptop it answers `unknown  something this gate could not name - open the run` for **every run,
every time, whether or not anything failed**.

`fetchFailureSet` reads the repository from `process.env.GH_REPO` and returns the empty set when it
is unset:

```js
if (!runId || !repo) return { items: [], hash: 'unknown', cancelled: [], exhausted: false };
```

Every workflow that calls it sets `GH_REPO: ${{ github.repository }}`, so the landing gate and the
alarm step work correctly. Nothing sets it for a person, and the CLI entry point at the bottom of
the file never derives it from the checkout - which it could, from `git remote` or from
`gh repo view`, the same `gh` this script already shells out to.

**The failure is silent and wears the costume of a real verdict.** `unknown` is load-bearing on
purpose - the header explains that an unclassifiable run must speak up rather than be swallowed -
so a caller cannot tell "I asked GitHub and the annotations named nothing" from "I never asked".
This review ran the command against all eleven of the week's failed runs and got eleven `unknown`s,
and had it stopped there it would have reported that CI failed eleven times for reasons the repo
cannot name. With `GH_REPO=NoaCG/NoaCG-Studio` prefixed, the same eleven commands named a spec file
or a job in **all eleven** cases:

| run | with `GH_REPO` |
|---|---|
| 34154123981 | `e2e/import-svg.spec.ts` |
| 34118491800 | `job: Build` |
| 34100940586 | `job: Build` |
| 34017244542 | `job: Factory gates` |
| 34011000541 | `e2e/wizard-filters.spec.ts` |
| 34005995391 | `e2e/import-svg.spec.ts`, `e2e/wizard-filters.spec.ts` |
| 34004845215 | `e2e/wizard-filters.spec.ts` |
| 33981270369 | `job: Build` |
| 33980943970 | `e2e/import-svg.spec.ts` |
| 33973821562 | `e2e/catalog-baseline.spec.ts`, `e2e/import-svg-corpus.spec.ts`, `e2e/import-svg.spec.ts`, `job: Catalog calibration gate` |
| 33884687221 | `job: Build` |

The cost is not a broken gate. It is that the one command a session reaches for when main is red
tells it, convincingly, that the repo has no idea - so the session opens the run in a browser and
reads a shard log, which is the whole thing this script exists to replace.

## What it would take

Under a session.

1. In the CLI block at the bottom, fall back to the checkout's own remote when `GH_REPO` is unset -
   `gh repo view --json nameWithOwner` costs one call and needs no new dependency. Leave
   `fetchFailureSet`'s signature alone so the workflow callers and the tests are untouched.
2. When the repository still cannot be determined, print that fact. `unknown` must keep meaning
   "GitHub was asked and named nothing"; "I could not ask" is a different sentence and deserves its
   own.

**What could break:** nothing in CI, where `GH_REPO` is always set and the new branch never runs. A
test in `scripts/ci-failure-set.test.mjs` that pins the empty-repo return value would need its
intent restated. Proof it did not break: the existing `node --test` file passes, and the eleven runs
above name the same items with and without `GH_REPO` in the environment.

## Evidence

- `scripts/ci-failure-set.mjs`, `fetchFailureSet` - the `!repo` early return, and the CLI block that
  calls it with no repo argument.
- `grep -rn GH_REPO .github/workflows/` - eleven call sites, every one of them setting it.
- The table above, measured 2026-09-08 against the eleven CI runs that failed between 2026-09-04
  and 2026-09-08.

## Trend

- 2026-09-08: 11 of 11 of the week's failed runs answered `unknown` from a laptop; 11 of 11 named
  correctly with `GH_REPO` set.
