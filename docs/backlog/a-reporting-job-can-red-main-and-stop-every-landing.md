# A reporting job that tests nothing can red main and stop every landing on the machine

**Filed:** 2026-09-05. **Source:** measurement, while queueing an unrelated branch.

## Why

On 2026-09-05 `main` was red, and every landing on the machine was refused with *"main is red on a
failure this gate could not name"*. Nothing was wrong with `main`. Run 33967372686 had passed
Factory gates, Build, the Catalog calibration gate, **all nine full E2E shards** and the `CI gate`
job itself. The only failure was **Combined E2E report**, and its cause was one line:

```
npm error network Invalid response body while trying to fetch
https://registry.npmjs.org/@playwright%2ftest: read ECONNRESET
```

That job's own comment in `.github/workflows/ci.yml` says it "tests nothing". So a transient npm
registry blip in a job that tests nothing set the run's conclusion to failure, which the landing
gate reads as a red main, which stopped every queued branch until somebody noticed and re-ran it.
The cost is not the failed report - nobody needed it - it is that the queue is serialized, so one
stalled landing holds the rest behind it.

This is the same failure shape `docs/CI_STABILITY.md` was written about, arriving from the
opposite direction: not a real defect repeating under new shas, but no defect at all wearing a red
run's clothes.

## What it would take

`.github/workflows/ci.yml`, the `Combined E2E report` job, around line 630:

```yaml
- name: Merge shard reports
  run: npx --yes "@playwright/test@${{ steps.playwright-version.outputs.version }}" merge-reports --reporter=html ./all-blob-reports
```

Two candidate fixes, and the choice is a real one:

1. **Let it fail without failing the run** - `continue-on-error: true` on the step or the job. It
   matches what the job is for: the merged HTML report is a convenience artifact, and losing it
   costs a reader one click into the per-shard reports. This is the smaller change and it closes
   the whole class, including whatever the next transient turns out to be.
2. **Retry the fetch.** Narrower, keeps the artifact, and does nothing about the next non-gate job
   that learns to fail.

Worth checking alongside: whether the landing gate should read the **`CI gate` job's** conclusion
rather than the RUN's. `CI gate` succeeded in this very run, so a gate keyed on it would have been
right while the run-level read was wrong. That is the deeper fix and it belongs to whoever owns
`scripts/auto-merge.mjs`'s CI reading - it is not obviously safe, because a run can fail in ways
that never reach that job at all.

Do not simply delete the job. The merged report is what makes a nine-shard failure readable.

## Evidence

- Run https://github.com/NoaCG/NoaCG-Studio/actions/runs/33967372686 - `Combined E2E report`
  the only failure, `CI gate` and all nine full shards green.
- `gh run rerun <id> --failed` cleared it with no code change, which is what confirms the cause
  was the network rather than the tree.
- The refusal text is `auto-merge.mjs`'s: "main is red on a failure this gate could not name" -
  the gate itself says it could not attribute the failure, which is the tell.
