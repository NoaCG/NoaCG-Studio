# Phase cf06: the production-controls flakes (#1946, #1778)

Plan run #1967 (cicd-followup), phase cf06. Builder session on branch
`claude/plan-cicd-followup-cf06-build`, from `main` at 531f856e.

Both flakes are in `e2e/production-controls.spec.ts` (a `// focus` spec, critical
`production-playout`). They are different tests with different causes, fixed in one PR because
each fix is a few lines in the same file and they share the trial setup.

## Repeat-count brief

REPEAT_BRIEF_PLACEHOLDER

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
rendered the page. React 19 renders pending default-lane updates together with the sync update
of the block's store subscription (`useSyncExternalStore`), so a tick that was still waiting to
render when the measurement's answer arrived committed in the same batch. On a loaded runner the
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
   fake time (150 + 10 + 249 + 2), and the next tick is at least 980 ms off.

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

STABILITY_PLACEHOLDER

## (c) The incident records

INCIDENT_PLACEHOLDER

## Verification

VERIFY_PLACEHOLDER

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
