# Phase cf06: the production-controls flakes (#1946, #1778)

Plan run #1967 (cicd-followup), phase cf06. Builder session on branch
`claude/plan-cicd-followup-cf06-build`, from `main` at 531f856e.

Both flakes are in `e2e/production-controls.spec.ts` (a `// focus` spec, critical
`production-playout`). They are different tests with different causes, fixed in one PR because
each fix is a few lines in the same file and they share the trial setup.

## Repeat-count brief

This section is the phase's written brief for both counts, committed on its own before either
post-fix repeat run starts (acceptance (b)).

**Conditions, both trials.** `endurance.yml` on this branch, one `ubuntu-latest` runner, the
offline suite's config (`playwright.config.ts`, which runs CI with `workers: 1`, as every offline
CI shard does), retries off, the one test named by `--grep`, through `scripts/configured-trial.mjs`
(its offline mode). The spec is offline: no backend runs.

**Pre-fix measurement: neither reproduced on a CI runner.** The unchanged spec, at `7fe654f9`:

| Test | Run | Result |
| --- | --- | --- |
| #1946 "Adjust moves a lower third…" | [41617460243](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41617460243) | 150 of 150 passed (19.1 min) |
| #1778 "Setup ▾ Look turns a production look on and off…" | [41617475701](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41617475701) | 150 of 150 passed (25.8 min) |

So each rate is the one from CI history since the report (the acceptance's rule when it was not
reproduced). Neither spec was ever quarantined. The history is `ci.yml` on every push to `main`
(each runs the whole offline suite, `E2E n/15 (full)`, so this test once per run), plus the one
CI run that reported each failure. Of the 8 failed main runs since 2026-10-27, none had a failure
annotation naming `production-controls.spec.ts` (their annotations read, 7 E2E jobs), and a
fail-then-pass on main would have put the spec in `e2e/quarantine.json`, which never held it.
The 300 trial passes above are left out of the rates on purpose: counting them would lower each
rate and so the count. Both races were reproduced by fault injection instead (section (a)).

| Flake | CI history since the report | Runs | Failed | Rate |
| --- | --- | --- | --- | --- |
| #1946 | PR #1943's run [41364022731](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41364022731) (2026-11-01T23:50Z), then the 37 completed main push runs from then to 2026-11-03T09:57Z, all passing it | 38 | 1 | 2.6% |
| #1778 | PR #1919's run [41320269865](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41320269865) attempt 1 (the one CI occurrence; the others were local), then the 118 completed main push runs from the report (2026-10-27T19:50Z) to 2026-11-03T09:57Z, all passing it | 119 | 1 | 0.84% |

**Arithmetic.** N must satisfy 1 - (1 - r)^N >= 0.95, so N >= ln(0.05) / ln(1 - r).

- #1946, r = 1/38 = 0.0263: -2.9957 / ln(0.9737) = -2.9957 / -0.02667 = 112.3, so N >= 113.
  **N = 150** (`npm run trial:controls-adjust-measure`) gives 1 - 0.9737^150 = 0.982.
- #1778, r = 1/119 = 0.0084: -2.9957 / ln(0.9916) = -2.9957 / -0.008439 = 355.0, so N >= 355.
  **N = 360** (`npm run trial:controls-look-on-off`) gives 1 - 0.9916^360 = 0.952. At the measured
  10.3 s a run, 360 runs take about 62 minutes, inside the trial's 75-minute cap.

**Pass condition, both.** All N runs pass with zero failures, and exactly N ran
(`scripts/configured-trial.mjs`: retries are off, so a fail-then-pass cannot hide; a run cut off
by the cap fails).

## (a) Reproduced or explained, and the root-cause fixes

### #1946: the page's own clock was never frozen

**The signature.** PR #1943's run 41364022731 (E2E 6/15): `the measurement rendered the page`,
expected false, received true, at `production-controls.spec.ts:2375`.

**What the assertion means.** The test opens the Adjust block on a paused clock and watches the
production page's root with a `MutationObserver`. The measurement's answer redraws the block
(it subscribes to `session.geometry` itself), and a page render publishes `data-renders` on the
root. The test fails when one batch of DOM mutations holds both. That reads a render committed
WITH the measurement's redraw as a render the measurement caused. It is only true while nothing
else can render the page in that moment.

**The cause.** Something else can. `ProductionPage` re-renders itself once a second for its
header clock (`setInterval(() => setNow(Date.now()), 1000)`, started when the page mounts; the
readiness view reads `now`). The test first touches Playwright's clock with `pauseAt`, after the
page is up, and a clock installed that late fakes only the timers made after it. So the header
clock's interval stayed a REAL timer: it kept firing every real second while the test believed
time was frozen, and each tick after a `runFor` had moved the fake `Date` changed `now` and
rendered the page. A tick still waiting to render when the measurement's answer arrived could
commit with the block's redraw (the block reads its store part through `useSyncExternalStore`,
and React renders the pending page update in the same pass), which is the injection's result
below. On a loaded runner the
tick's render waits longer, which is why it showed on CI and not here (10 of 10 passed locally
before the fix).

**Not a product defect.** The measurement does not render the page: the block's comment and
`src/components/home/AGENTS.md` ("typing a value never renders the page") hold, and the mutation
test below shows the assertion still catches a page render the measurement causes. The header
clock's once-a-second render is designed (the readiness view needs `now`), and no rule says the
page never renders on a timer. Nothing on PREVIEW or PROGRAM changed. So the fix is in the test.

**Reproduced by fault injection** (e2e/AGENTS.md: a race you cannot reproduce is injected, not
repeated harder). A temporary patch made the header clock tick every 1 ms instead of 1000 ms, so
a real tick is always close to the measurement's answer:

| Spec | Result with the injection |
| --- | --- |
| Unchanged | 4 of 6 failed: `Error: the measurement rendered the page`, Expected false, Received true, at `production-controls.spec.ts:2375:70` (the reported line) |

**The fix.** Two parts, both waiting on observable state:

1. `page.clock.install()` before the page boots, as `e2e/playout-air-contract.spec.ts` does for
   its render counts, so every timer the page starts is Playwright's and stops when the clock is
   paused. No real-time render remains.
2. With every timer fake, the header clock still ticks once a second of fake time, and a tick
   inside the measurement's window would be the same coincidence. So after pausing, the test
   waits until the page has stopped rendering (300 ms of real time with no change to
   `data-renders`), then steps the fake clock 20 ms at a time until the page renders (one tick,
   at most a second), and opens the block right after it. The measurement then takes 411 ms of
   fake time (160 + 249 + 2), and the next tick is more than 900 ms off (the render can show one
   20 ms step late).

The assertion itself is unchanged. No timeout, retry or sleep was added; the 300 ms poll is a
settle check on `data-renders`, like the one in `playout-air-contract.spec.ts`.

**Mutation test.** With the fix, a patch making `useDrawnDraft` render the page on every
geometry change (the defect the assertion exists for): 4 of 4 failed at `the measurement
rendered the page`. With the fix and no patch: passes (local runs below).

### #1778: the seed was lost by the reload

**The signature.** `locator.selectOption: Test timeout of 110000ms exceeded`, "did not find some
options", at `look-brand` `selectOption({ label: 'Autumn Quiz' })` (reported at :2755/:2756;
local runs on PR #1776 and #1793, and CI run 41320269865 attempt 1 on PR #1919, E2E 3/15).

**The cause.** The seed writes the second cue and the captured look (`spx-gfx-shows`) and then
the saved brand (`addLook`, `spx-gfx-looks`) and reloads at once. A durable write is accepted at
once and lands in IndexedDB a moment later (`src/model/durableStore.ts`); a reload in between
aborts what has not committed, and the last write is the one most likely lost. The panel lists
saved brands with `loadLooks()`, so a lost `addLook` shows exactly as a missing option, much
later in the test. This is the trap e2e/AGENTS.md names ("a spec that saves off the UI and then
reloads must WAIT for the disk"), as #1778's reporter suspected.

**Not a product defect.** The writes are made off the UI by the test, and every product surface
that reports a save awaits `commitDurableWrites()` first
(`components/never-report-save-storage-layer-has`). Nothing told a user a save landed.

**Reproduced by fault injection.** A temporary patch in `durableStore.ts` held any IndexedDB
write of the looks key for 1.5 s before opening its transaction:

| Spec | Result with the injection |
| --- | --- |
| Unchanged | 2 of 2 failed: `locator.selectOption: Test timeout of 110000ms exceeded`, "did not find some options", at the `look-brand` select (line 2777 in that file: the reported line plus the lines this PR adds above it) |
| Fixed | 6 of 6 passed (the three Look tests, twice each) |

**The fix.** `await settleDurableWrites(page)` before the reload, in this test and in its two
siblings that seed and reload the same way (`Setup ▾ Look works on a production with no captured
look and no saved brand` and `the Type row reads a look's imported face in effect`), as #1778
suggested. The helper waits for every queued write to reach IndexedDB and fails loudly if one was
refused.

### Not a backend stack or port collision

The spec is offline (`playwright.config.ts`, no Supabase), so no backend stack starts.

## (b) Stability under CI conditions

The brief above was pushed in its own commit (`595730d4`) and in PR #2016's description before
either run, and both runs are of that commit, which holds the fix (`f44f9dd2`) unchanged:

| Test | Run | Result |
| --- | --- | --- |
| #1778 Look on and off | [41624077600](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41624077600) | **360 of 360 passed, 0 failed, exactly 360 ran, verdict PASS** (49.9 min, 1 worker) |
| #1946 Adjust measurement | [41624097354](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41624097354) | **150 of 150 passed, 0 failed, exactly 150 ran, verdict PASS** (29.5 min, 1 worker) |

The Adjust run is slower than its pre-fix run (29.5 against 19.1 min) because the test now steps
the fake clock up to a second, 20 ms at a time, before measuring.

Like cf05's trials, these run the one test alone, not after its shard's neighbours. Neither
flake reproduced on a CI runner before the fix, so these runs meet the count but cannot by
themselves tell the fixed test from the unfixed one; the fault injections in (a) are what show
each race closed.

Neither spec is in `e2e/quarantine.json` on main, so no quarantine is released, and nothing
contains a recurrence: if either test fails and then passes on one commit on main, `ci.yml` puts
the spec straight back through the documented route.

## (c) The incident records

cf01 cross-linked #1946 and #1778 (comments 6575552060 and 6575552614) but wrote no incident
record on either, because neither spec was ever quarantined. So the brief's "recorded on both
issues by cf01" did not hold, and this phase wrote the records itself: #1946 comment 6602044035
and #1778 comment 6602046990. Each carries owner (`miwco`, the weekly owner session as backup),
impact (critical `production-playout` focus test; failures seen; 0 merge-queue failures since
2026-10-27, from the job annotations of every failed `merge_group` CI run), repair date
2026-11-04 (this phase's window, so no later than any other incident's date, as a critical
test's must be) and restoration criteria (the fix lands through the merge queue and the post-fix
repeat run passes its count with zero failures).

Neither spec is in `e2e/quarantine.json`, so no quarantine is released, by hand or otherwise. Each
issue closes when this fix lands: a commit on the branch carries `Closes #1946` and
`Closes #1778`. If either test fails and then passes on one commit on main again, `ci.yml` puts
the spec straight back through the documented route.

## Verification

- Local, cloud worker, job queue, 2 workers, retries 0: the four changed tests, 5 times each,
  20 of 20 passed. Before the fix, the Adjust test alone 10 of 10. Fault injections and mutation
  test as in (a), each reverted before commit.
- `npm run gates -- run --changed origin/main`: 14 gates, 44 tests, all pass. `eslint` on the
  spec clean, `tsc --noEmit` clean, `check-e2e-protection --changed origin/main` OK.
- Not run locally: the whole spec file (the job queue allows one broader job per source state, and
  it went to the targeted run). CI runs it: PR run 41624463710 on `d36a8dc7`, CI gate green, the
  offline subset (77 specs, `production-controls.spec.ts` among them) and the configured whole set
  (69 specs, since `package.json` changed), configured verdict green.
- GitHub API: 26 calls for the CI history pass (main push runs, failed jobs, annotations,
  merge-group failures), inside the 100-call bound.

## Phase notes

- **Previous verified main SHA:** 531f856e13379ccffe8edc2df381cf6c2503f393.
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It restores the late clock, the
  three unsettled reloads and removes the two trial scripts; no data, workflow or quarantine state
  to undo.
- **Decisions:**
  - Two test fixes, no product change: the injections show each signature comes from the test's
    own setup, and the product keeps its rules in both (section (a)).
  - #1946 keeps its assertion and fixes what it depends on (a frozen page) instead of loosening it
    to a count or dropping it; the mutation test shows it still catches the defect it guards.
  - #1778's two sibling tests get the same settle, since they seed and reload the same way.
  - The trials reuse `endurance.yml` and the offline mode of `scripts/configured-trial.mjs`, with
    one npm script each.
- **Traps:**
  - A Playwright clock first touched by `pauseAt` (or `runFor`) fakes only the timers made after
    it. A test that means "every timer is frozen" installs it before the page boots.
  - Even fully faked, a page timer that renders (the header clock) can fall in a measurement's
    window. Start the window right after its tick.
  - `jobs.mjs add` refuses a dirty tree and a second broader job for one source state; commit a
    local WIP for each injection, and reset it after.
