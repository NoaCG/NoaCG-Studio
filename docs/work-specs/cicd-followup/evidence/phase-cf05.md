# Phase cf05: the production-chat-intake and production-data flakes (#1924, #1603)

Plan run #1967 (cicd-followup), phase cf05. Builder session on branch
`claude/plan-cicd-followup-cf05-build`, from `main` at ea0eaa11.

## Repeat-count brief (written and pushed before the repeat runs)

This section is the phase's written brief for both counts, committed on its own before either
repeat run starts (acceptance (b)).

**Conditions, both trials.** `endurance.yml` on this branch, one `ubuntu-latest` runner, the
offline suite's config (`playwright.config.ts`, which runs CI with `workers: 1`, as every offline
CI shard does), retries off, the one test named by `--grep`, through `scripts/configured-trial.mjs`
(its offline mode, from cf08). Both specs are offline: no backend runs.

### #1603, production-data "Connect closes only once the save landed"

**Pre-fix failure rate.** Measured, so the history rate is not used.

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| Measured before the fix: the unchanged spec and helper on a CI runner, retries off ([41579824448](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41579824448), `trial:data-connect-save` at `b12ae614`) | 200 | 18 | 9.0% |
| For reference, CI history since the quarantine: `noacg/quarantine/e2e/production-data.spec.ts` on main, 2026-11-01 to its release | 21 | 0 | 0% |

**Repeat count.** N = 100 (`npm run trial:data-connect-save`).

**Arithmetic.** N must satisfy 1 - (1 - r)^N >= 0.95, so N >= ln(0.05) / ln(1 - r).
At r = 18/200 = 0.09: -2.9957 / ln(0.91) = -2.9957 / -0.0943 = 31.8, so N >= 32.
N = 100 gives 1 - 0.91^100 = 0.99992.

### #1924, production-chat-intake "YouTube comments: one press brings the newest 100"

**Pre-fix failure rate.** Not reproduced on a CI runner: 150 of 150 passed
([41579837751](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41579837751),
`trial:chat-intake-newest-100` at `b12ae614`). So the rate is the one from CI history since the
report (the acceptance's rule when it was not reproduced):

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| CI history since the report: the failing run on main that reported it (8e84002d, [41336665950](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41336665950)), then `noacg/quarantine/e2e/production-chat-intake.spec.ts` on every main commit it ran on until its release (21 commits, 2026-11-01T18:49Z to 2026-11-02T10:36Z, all success) | 22 | 1 | 4.5% |

The 150 trial passes are left out of that rate on purpose: counting them would lower the rate and
so the count. The race was reproduced by fault injection instead (section (a)).

**Repeat count.** N = 100 (`npm run trial:chat-intake-newest-100`).

**Arithmetic.** At r = 1/22 = 0.0455: -2.9957 / ln(0.9545) = -2.9957 / -0.0465 = 64.4, so
N >= 65. N = 100 gives 1 - 0.9545^100 = 0.9905.

**Pass condition, both.** All 100 runs pass with zero failures, and exactly 100 ran
(`scripts/configured-trial.mjs`: retries are off, so a fail-then-pass cannot hide).

## (a) Reproduced or explained, and the root-cause fixes

The two flakes have separate causes, both in what the tests waited on. Neither shows the
product breaking a documented rule. One PR, because both fixes are a few lines of test code and
share the trial setup.

### #1924: a wait that had already passed

**The signature.** Run 41336665950 (8e84002d): `expect(calls.commentThreads).toBe(2)` received 1
at `production-chat-intake.spec.ts:264`, with the rows already at 100 and the detail reading
"0 new of the newest 100".

**The cause.** The detail after the first fetch reads "100 new of the newest 100 at <time>", and
that text *contains* "0 new of the newest 100". So the line before the count,
`toContainText('0 new of the newest 100')`, passed at once on the first fetch's text, before
the refresh's call had reached the route. The count was read whenever the refresh happened to be
slower than one assertion. The route counts a call before it answers, so once the refresh's
own answer is on screen the count is 2. The product did what it says.

**Reproduced by fault injection** (e2e/AGENTS.md: a race you cannot reproduce is injected, not
repeated harder). A temporary init script delayed the page's `commentThreads` fetch by 500 ms:

| Spec | Result with the delay |
| --- | --- |
| Unchanged | failed: `expect(received).toBe(expected)`, Expected 2, Received 1, at the `toBe(2)` line (the original line 264 plus the 9 injected lines) |
| Fixed | passed |

The injection, added at the top of the test and removed before commit:

```ts
await page.context().addInitScript(() => {
  const real = window.fetch;
  window.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes('commentThreads')) await new Promise((r) => setTimeout(r, 500));
    return real(input, init);
  }) as typeof fetch;
});
```

On a CI runner the unchanged test passed 150 of 150 (41579837751): the window is one assertion
wide, so it is rare, as its history says (1 in 22). So for #1924 the repeat run in (b) meets the
acceptance's count but cannot by itself tell the fixed test from the unfixed one; the injected
delay above is what shows the fix closes the race.

**The fix.** Both waits on that detail now require the text to start with the count,
`toHaveText(/^0 new of the newest 100\b/)`, which the first fetch's text cannot satisfy. The
assertion that the second call happens (`toBe(2)`) is unchanged. No timeout, retry or sleep.

### #1603: a stray autosave the setup left pending

**The signature.** The "Could not save" dialog's backdrop intercepts the second Connect click
until the 120 s timeout (#1603; quarantine run 41359365006).

**Reproduced.** On the cloud machine 4 of the 4 runs that finished failed (`--repeat-each 6`, 5
minute cap); on a CI runner 18 of 200 failed (41579824448). All 18 CI failures are the storage
alert's backdrop over `cue-connect-confirm`: 17 at the second Connect click (line 2189), 1 at
the first (line 2185).

**Which write it was.** A diagnostic run logged every IndexedDB put with its stack and every
`spx-storage-error` the app announced (temporary edits, removed before commit). Inside the
storage-full window the refused writes were Connect's own `spx-gfx-shows` write (claimed by
Connect, shown as "Not saved", as the save rule requires) and a `spx-gfx-project` write from
`templateStore.ts`'s debounced autosave. The announced, unclaimed failure was always that
autosave. A further run logged when the autosave was scheduled: by `bootstrapGraphic`'s
`applyTemplate` in the test setup, 800 ms before it fired.

`bootstrapGraphic` (`e2e/_create.ts`) writes the working slot itself, to be durable before a
reload, but it left the store's own 800 ms timer pending. That timer then wrote the same
document again at an arbitrary moment in the test. This test reaches its storage-full window
within about 800 ms of the setup, so on a fast machine the duplicate write lands inside it.
When the alert appeared before the first click, the autosave had landed between `fillStorage` and
that click.

**Not a product defect.** The save rule ("never report a save the storage layer has not agreed
to") held throughout: Connect claimed its own refusal and kept the review open, and the refused
autosave was a different document's write, which the app announced, as
`model/durable-write-confirmed-after-call-returns` and
`components/background-write-reports-nothing-may-skip` require for an unclaimed background
failure. Claiming that failure under Connect, or suppressing it, would hide a real refused
write, which is what the rule forbids. So there is no product fix to make. The extra write came
from the test helper.

**Departure from the incident record.** cf01's record on #1603 (comment 6575544970) expected a
product fix, "because the failure breaks the save rule". The evidence above shows it does not,
so this is a test fix. The acceptance's own condition ("a wait or dialog dismissal in the test
does not count as the fix when the failure shows product behaviour that breaks a documented
rule") does not apply, and the fix is neither a wait nor a dismissal: it removes the stray write.

**The fix.** `bootstrapGraphic` calls the store's `flushPendingProject()` instead of its own
`saveProject`. That writes the same pending autosave at once and takes the timer down, so no
write is left to land later in any spec that uses the helper. The test also now asserts that no
`storage-alert` is showing after Connect's claimed refusal. It is a snapshot: a refused write
that lands a moment after the assertion still slips past it and is caught only by the second
click. But a write already announced by then fails with a clear line instead of a 120 s click
timeout (the mutation run below failed there 3 times of 4).

**Mutation test.** With the old helper and the new test: 4 of 4 failed, 3 at the new
`storage-alert` assertion and 1 at the click. With the fix: 8 of 8 passed locally
(`--repeat-each 8`).

### Not a backend stack or port collision (#1865, #1829)

Both specs are offline (`playwright.config.ts`, no Supabase): no backend stack starts, so a
stack or port collision cannot be the cause. The setup fix for those stays with cf04.

## (b) Stability under CI conditions

The brief above was pushed in its own commit (`86e89812`) before either run, and both runs are of
that commit, which holds the fix (`2af95242`) unchanged:

| Test | Run | Result |
| --- | --- | --- |
| #1603 Connect save | [41589179967](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41589179967) | **100 of 100 passed, 0 failed, exactly 100 ran, verdict PASS** (8.7 min, 1 worker). The same runner and test failed 18 of 200 before the fix. |
| #1924 newest 100 | [41589183520](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41589183520) | **100 of 100 passed, 0 failed, exactly 100 ran, verdict PASS** (22.3 min, 1 worker) |

Like cf07's trial, these run the one test alone, not after its shard's neighbours.

Neither spec is in `e2e/quarantine.json` on main: production-chat-intake left it in #1968 and
production-data by the automatic release route (20 consecutive passes), both before this phase.
So no quarantine is released here, by hand or otherwise, and nothing contains a recurrence: if
either test fails and then passes on one commit on main again, `ci.yml` puts it straight back
through the documented route.

## (c) The incident records

#1924 and #1603 each carry owner (`miwco`, the weekly owner session as backup), impact, repair
date (2026-11-15) and restoration criteria from cf01 (comments 6575543132 and 6575544970). This
phase adds a comment to each with the root cause, this PR and the repeat run. Both specs have
already left quarantine by the documented route, so each issue closes when this fix lands: the
fix commit carries `Closes #1924` and `Closes #1603`.

## Phase notes

- **Previous verified main SHA:** ea0eaa119e891def97d6db15151a644280613e74 (CI gate and the
  four configured shards green on it).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It restores the helper's own
  save beside the pending timer, the two substring waits and the trial scripts; no data,
  workflow or quarantine state to undo.
- **Decisions:**
  - Two test fixes, no product change: the trials and diagnostics show the product keeping its
    rules in both failures (section (a)). For #1603 this departs from cf01's restoration
    criteria, which assumed a product fix; the reason is above.
  - #1603 is fixed in the shared helper, not in the one test. The stray write comes from
    `bootstrapGraphic`, so every spec that uses it could meet it; a wait in this test alone
    would leave the cause in place. `flushPendingProject` is the store's own export for writing
    the pending autosave now, so the helper writes the payload the product would.
  - One PR for both, since each fix is a few lines and they share the trial route.
  - The trials reuse cf07's `endurance.yml` and cf08's offline mode of
    `scripts/configured-trial.mjs`, with one npm script each. The pre-fix measurement ran
    through the same scripts at a higher count, then the brief set N = 100 for both.
  - N = 100, above the 32 and 65 the rates need, so each run means the same with margin.
- **Traps:**
  - "100 new of the newest 100" contains "0 new of the newest 100": a substring wait on a
    count can pass on a larger count. Anchor the number.
  - A helper that saves directly beside a debounced autosave leaves the timer running; flush it.
  - The local browser run goes through `node scripts/jobs.mjs add ... --cap 5`; a direct
    `npx playwright test` is refused on a cloud worker.
  - The CI history pass made 108 GitHub API calls, over the 100-call bound: a stray duplicate
    statuses call per commit in the loop. The results were not affected.
