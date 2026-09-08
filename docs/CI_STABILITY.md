# CI stability - why the same things keep breaking, and what stops each one

The owner's question, 2026-08-29: *"I feel like we are fixing things and then they break again
almost every day. How can we establish a workflow so I don't receive emails every day?"*

This file answers it as a **classification with a mechanism per class**, so the next red run can be
put in a box that already has an owner and a fix, instead of being investigated from scratch. It is
about the SHAPE of the failures. `docs/VERIFICATION.md` §"What a red run means, and what actually
emails" holds the complementary fact - which runs actually reach the inbox - and is not repeated
here.

**Measured 2026-08-15 to 2026-08-29** (14 days, 1245 runs, 204 non-green: 92 `failure`, 112
`cancelled`). Reproduction commands are at the bottom.

## The finding that reframes the question

**Main went red 40 times, for 14 distinct reasons.** One defect accounts for 27 of the 40:
`e2e/anim-engine.spec.ts:656` was red on `main` for about **35 hours** across 25 CI runs and 2
nightlies (2026-08-27 08:39 to 2026-08-28 19:43), always the same assertion at
`anim-engine.spec.ts:716` with the same diff - `ig01`/`ig04`/`ig05` reading a `0` stat instead of
the data.

That is the daily email, and it is not "things breaking again every day". It is **one thing broken
once, re-reported 27 times, because landings kept arriving onto a red `main`.** Each landing pushes
`main`, each push starts a CI run, each run fails the same way, and each failure is a separate
`CheckSuite` email. `ci.yml` deliberately sets `cancel-in-progress: false` for `main`, so unlike a
feature branch nothing collapses those runs into one.

The corollary matters as much: **the other 148 non-green runs cannot email about `main` at all.**
93 are silent cancels (a cancelled run never emails), and the 52 feature-branch failures are an
author's own push telling them their own push is red.

## The classes

Ordered by how much of the inbox each one explains.

### 1. REAL-REGRESSION - 55 runs, 34 on `main`

A genuine defect. Correct to email; a person must act. The problem is never the first email, it is
the 26 after it.

**Mechanism (landed):** none needed for detection - the gate already works.

**Mechanism (LANDED 2026-08-30, RETIRED 2026-09-08): *the landing queue refused to land onto a red
`main`.*** `scripts/main-health.mjs` read `main`'s own recent `ci.yml` runs and the laptop lander
consulted it before touching anything, refusing with `main is red on <spec> since <time> - N
consecutive red runs` and the way out. It was a **refusal kind of its own** (exit 4), so
`npm run jobs` printed "main itself is red - fix main first" rather than a generic refusal: five
landings queued against a red `main` all stopped with the same line, which is how a person saw the
fault was upstream of all five. It was deliberately **not** a deferral like exit 3 - a red `main` is
fixed by a person, and a job cycling in the queue would hide the fault it just detected.

Three things it would not do, each a way this gate could have made the queue worse than the noise:
no completed run, an unreachable `gh`, or a run still in flight all **proceeded** (no answer is
never red); a `cancelled` run was never read as a verdict (`docs/VERIFICATION.md`); and the branch's
own green gate on the integrated sha was unchanged. The one escape was `--onto-red-main`, because
otherwise the branch that FIXES `main` is the one branch the gate can never let land.

**Why it went.** GitHub's merge queue lands every branch now (`contracts/retired.json`), and it
gates each group on that group's own run rather than on `main`'s last one - so a branch queued
behind a red `main` is judged on the tree it would create, which is the question the refusal was
approximating. The 27 emails this gate was built to stop are held by the alarm below, which dedupes
by WHAT is failing and reports each distinct fault once.

**Mechanism (LANDED 2026-08-30): *a red-main run withholds its rolling-issue comment when the
failing spec set is unchanged.*** `scripts/ci-failure-set.mjs` builds the set from the run's own
check **annotations** - Playwright's `github` reporter already puts the failing spec there - and
`scripts/red-main-issue.mjs` decides what to say. The old rule keyed on the COMMIT, and every
landing is a new commit, which is the entire reason one defect was reported 27 times.

The receipt, measured on the three consecutive red `main` runs of 2026-08-28 (33195106665,
33198360101, 33205116363 - three different commits): all three hash to `025ffbf39dcb`,
`e2e/anim-engine.spec.ts`. Under the old rule, three comments; under the new one, one.

What it will not do is go quiet on anything new: a set that has not been reported always comments
(**including a new spec appearing beside a familiar one** - that is a different set), and a set the
gate could not identify hashes to `unknown`, which is never equal to anything, including another
`unknown`. Only the LATEST reported set dedups, so a failure that returns after something else was
reported is news again. The run still goes red and the commit status is still red; only the
notification is withheld, and a withheld comment prints a `::notice` in the run so the choice is
visible rather than silent. It does not touch `CheckSuite` email, which GitHub sends per run - see
"What would actually empty the inbox" below, point 3.

One trap, caught only by running it against a real red run: Playwright also emits **`Slow Test`
warning** annotations (path `[chromium] > e2e/ai.spec.ts` on run 33205116363) and a run-summary
notice. Counting those would put a timing-dependent member in the set, so the hash would differ on
most runs and nothing would ever dedup - the fix would look installed while doing nothing. Only
`annotation_level: failure` counts, and `scripts/ci-failure-set.test.mjs` pins that case.

**Two sessions arrived at the same two lessons independently on 2026-08-29, which is why both are
worth trusting.** The class 5 work below reached for annotations for the same reason this mechanism
is built on them - same error text byte-for-byte, about 1/50 the cost, already structured - so
"Reproducing this" now recommends them over `--log-failed`. And its hardest-won measurement rule,
*grep for the failure marker rather than the file name*, is the identical mistake in another
costume: a `[107/119] … spec.ts:389` PROGRESS line for a test that PASSED is exactly as misleading
as a `Slow Test` warning annotation, and counting it once put three passing line numbers in this
file as three separate flakes. **Whatever the source, filter to the failures before you count.**

One reconciliation worth stating, because it cuts the other way for the two mechanisms. Class 5
found that re-running a run's failed jobs flips the RUN's conclusion to `success`, which hides flake
receipts from a `conclusion=failure` sweep. Gate 1 reads that same field and **wants** exactly that
behaviour: `gh run list` reports each run at its latest attempt, so a red run someone re-ran green
reads as green, which is the right answer to "is `main` green *now*". The two uses are consistent -
a historical sweep must walk the attempts, a live health check must not.

**A sub-shape worth naming: THE GATE ITSELF BROKE (2026-09-08).** Every class above assumes the
gate works and the code does not. The nightly's `catalog-gates` job went red with all 504 designs
fine: `scripts/type-floor.mjs` read its floors by running a **regex over the declaration** in
`src/validation/typeFloor.ts`, that file became a re-export when the numbers moved to
`src/model/designRules.ts`, the regex matched nothing, and the script threw at module load. Nothing
was measured that night, and the run said "red" in exactly the tone it uses for a real finding.

Two things made it expensive out of proportion to the fix, and both are mechanisms rather than
opinions:

- **A gate must read its subject the way the product does.** The script drove a live dev server
  already, and three sibling scripts already import a `/src/*.ts` module through it - so parsing the
  source text was a second reading of a shape that only ever had one owner. It now imports the
  module, and the numbers can move again behind that name without the gate noticing. A gate that
  parses is a gate that a refactor can silently disarm.
- **A job that runs N tools must say WHICH one failed.** The step ran five scripts under
  `|| status=1` and exited once at the bottom; four printed PASS *after* the one that died. Naming
  the failure took a stack-trace grep through ~900 log lines, because a gate that fails by
  CRASHING prints no report of its own. Each gate now prints `GATE PASS/FAIL - <name>` and the step
  ends with `CATALOG GATES FAILED: <names>`.

The reason it survived the landing at all: this tier runs nightly and **the merge queue gates on
`ci.yml` alone**, which is the same gap the weekly audit sits in (`docs/STACK_FRESHNESS.md`).
Breakage here is invisible to landing by design; the alarm is the only reader, so it has to be
legible.

### 2. CANCELLED-BY-PUSH - 99 runs, 93 on feature branches

`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}` collapsing a branch's older run when a
newer push arrives, plus 16 runs superseded while still queued (`jobs: []`).

**Emails: none.** Working as designed, and the largest single slice of the dashboard. Its only cost
is that a cancelled run leaves no per-commit verdict.

**Mechanism: none wanted.** The one trap is reading a cancelled run as a verdict - covered in
`docs/VERIFICATION.md` ("A GREEN run is not one either until you read WHICH JOBS RAN").

### 3. MISSED-BASELINE - 17 runs, 9 days, 14 branches, **0 on `main`**

Almost always `e2e/catalog-baseline.spec.ts:65` - "every catalog variant emits byte-identical code"
- failing because a deliberate source change moved the emitted code and the baseline was not
re-recorded in the same commit range.

This class never reaches `main`, so it costs the author an email and a re-run, not the owner. It is
the most *preventable* class in the list: the failure message already names the fix
(`UPDATE_CATALOG_BASELINE=1`), so the gap is knowing to run the gate **before** pushing.

**Mechanism (landed elsewhere, 2026-08-29):** `npm run catalog:affected` names the designs a change
can move and prints the gates already scoped to them - the whole point being that the check is now
a minute rather than a quarter of an hour, so there is no longer a reason to skip it.
**Mechanism (PROPOSED):** *a pre-push reminder rather than a gate.* When the staged diff touches a
file that owns a baseline (`src/templates/**`, `src/templates/importedDesign/**`, anything under
`scripts/*-baseline.json`'s inputs), print the re-record command. A reminder, not a refusal - a
gate here would block the legitimate case where the baseline move IS the change.

### 4. SHARD-TIMEOUT - 12 runs, and already closed

Jobs stopping at exactly their `timeout-minutes` with `##[error]The operation was canceled.` All 12
sit in one 2026-08-15 to 2026-08-19 cluster, and every one hung inside
`npm exec playwright install-deps chromium`.

**This was never a timeout-budget problem** - raising `timeout-minutes` would have made those runs
slower, not greener. The cluster stops dead once `.github/actions/playwright-chromium` began caching
the browser binary. **Closed; no mechanism owed.** The standing rule that a job stopping AT its own
limit is not a verdict (`docs/VERIFICATION.md`) still holds for the next one.

#### Reopened 2026-09-04, different cause: an uneven split, not a suite that got too big

Measured over the **30 `ci.yml` runs on `main` from 2026-09-02 23:06 to 2026-09-04 02:23**:
26 settled (all `success`), **4 cancelled - every one of them a shard killed at the E2E job's
20-minute cap, none superseded by concurrency** (`main` sets `cancel-in-progress: false`, so on
this branch a cancel can only mean a job ran out of clock).

Per-shard mean wall clock on the 26 green runs, from Playwright's own count-based `--shard=i/n`:

| shard | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|
| mean min | 8.8 | **14.6** | 10.1 | 12.5 | 11.0 | 11.1 | 13.0 | 12.3 | 12.4 |
| worst green | 11.1 | **17.4** | 16.5 | 15.9 | 13.2 | 14.8 | 15.5 | 13.0 | 13.3 |
| runs at the cap | 0 | 3 | 0 | **4** | 0 | 2 | 3 | 3 | 2 |

A **1.66x spread with nothing wrong**: shard 2 sat at 14.6 minutes against the 20-minute cap while
shard 1 idled at 8.8. Ordinary runner variance on top of that is what tipped four runs over.

**CAPACITY WAS NEVER THE PROBLEM, and it is worth stating plainly because it is the tempting
diagnosis.** Nine runners at a 20-minute cap is a 180-minute budget; the suite measures **99.7
minutes**, so it uses 55% of it and a perfectly balanced set of nine shards would run 11.1 minutes
each. There is no shard-count shortage to fix, and adding runners would have papered over the real
fault while spending money. What did not fit was the WORST shard, and only because the split was
lopsided.

Two things had drifted underneath, and neither was visible:

- **The suite grew 49% in two weeks** - 66.9 measured minutes on 2026-08-20, 99.7 on 2026-09-04 -
  while `scripts/e2e-durations.json` still described the old one. 16 of 147 spec files had no entry
  at all. `check:e2e-durations` reported this correctly every week inside `check:freshness`, which
  is a REPORT and not a gate, so nobody acted on it.
- **`shardsFor` is capped at 9**, so the growth changed no arithmetic anywhere: the plan asked for
  the same nine runners and each simply got more work. The stale table therefore did **not** cause
  these cancellations - nothing consumed per-file durations for assignment, because Playwright was
  doing the splitting by test count. It would have caused them from now on, which is why the table
  was re-recorded before the packer was allowed to use it: `counting-settle.spec.ts` (4.96 min, the
  heaviest file in the repo) and `import-svg-corpus.spec.ts` (3.36 min, fourth) were both missing,
  and would have been packed at the 0.51-minute median.

**The fix is bin-packing, not a bigger budget and not more runners** (`packShards`,
`scripts/e2e-affected.mjs`). CI now hands each runner an explicit spec-file list packed by measured
duration; the nine bins come out at 11.05-11.11 min against a balanced 11.08, a **1.005 spread**,
which turns shard 2's 2.6 minutes of headroom into about eight. `timeout-minutes` stays at 20 for
the reason it always did - a loose budget stops the timeout distinguishing a hung shard from a busy
one - and `MAX_SHARDS` stays at 9, because the arithmetic above says it is not the constraint.

**What made this expensive was not the lost minutes.** A cancelled job makes the whole RUN
cancelled, and three instruments read that differently: the red-main gate called it red and opened
issue #52 naming a failure that did not exist, `main-health.mjs` skipped past 29 of them and quoted
a verdict from 2026-08-05, and two landings (rows F and D) died at the queue's 45-minute cap after
a cancelled run escalated them to a full suite. Full account:
`docs/handoffs/2026-09-04-t-shard-cap-poisons-every-gate.md`.

### 5. FLAKY-SPEC - one proven flake (already fixed) and one regression wearing a flake's name

Proven means: red, then green on the **same SHA** after a re-run. Anything without that re-run is
not proven and is not in this class.

Both rows were worked on 2026-08-29. **One is a real, properly-proven flake that had already been
fixed inside the measurement window; the other was never a flake at all.** Neither is owed an owner.

| Spec, by TITLE | Occurrences | What it actually was | Outcome |
|---|---:|---|---|
| `local-relay` - "a reloaded browser source reads the log from where it left off" | 6 | **a real flake** - two distinct assertions, 4 with same-SHA re-run-green receipts | both causes fixed in-window (`7447ea9c`, `f193f969`); fix mutation-tested 2026-08-29 |
| `flows` - "wizard: steps mode reveals lines on Next" | 4 | **a deterministic regression** (the spec named a retired design) | fixed by `d6ee4d3b`, ~3 h after it began |
| `production-controls.spec.ts:262` | 1 | one occurrence, no receipt | never a flake claim; left alone |

**The one line-number claim that was wrong.** The original table said the "neighbours at `:389`,
`:396` and `:413` each failed once too, which reads as one instability rather than four specs". They
never failed. Across every failed-job annotation in the window, the only `local-relay.spec.ts` lines
that ever appear as failures are **`:330`** (the test declaration, 18x), **`:390`** (5x) and
**`:359`** (1x). `:389`, `:396` and `:413` are *progress* lines - `[107/119] … e2e/local-relay.spec.ts:389:1 › a baseline that describes a log which no longer exists is thrown away`
- for the NEXT test in the file, which passed every time; its declaration line drifted 389 -> 396 ->
413 as the test above it grew. Someone grepped the log for `local-relay.spec.ts:` and counted
progress lines as failures. **Grep for the failure marker, not for the file name**, and key a row by
its test TITLE - a line number is not an identity in a file that was edited four times in a fortnight.

#### `local-relay` - a real flake, two causes, both already fixed, one reproduced on purpose

Six occurrences, all inside a single **14-hour cluster** (2026-08-24 16:04Z to 2026-08-25 05:58Z)
across six unrelated branches, none before or after. Two distinct assertions, not one:

- **1x at `:359`** - `expect(baseline.data.f1, …).toBe('89')`: `Expected "89" / Received "88"`. The
  baseline is written on a debounce, so "the key exists" was true before the bumped score reached it.
  Fixed by **`7447ea9c`** - fifteen minutes after the only occurrence.
- **5x at `:390`** - `expect(reads[0]).toBe(play!.id - 1)`: `Expected: 4 / Received: 7`, byte-identical
  every time. The document still on screen polls every 400 ms with its own cursor, and one of its
  polls was recorded as the reloaded document's boot read. Fixed by **`f193f969`**, which separates
  the two by the receiver's single boot `/relay/ping`. (The neighbouring
  `expect(reads.length).toBeGreaterThan(0)` passed every time: the source *did* read the log, it just
  started at the wrong row. An offset bug, never a "never read" bug.)

**This row met the admission rule, and a `conclusion=failure` sweep cannot see that.** Four of the six
sit in runs whose FINAL conclusion is `success`: attempt 1 failed on the relay shard, the failed jobs
were re-run on the same SHA, and they went green. Re-running flips the *run's* conclusion, so the
strongest receipts in the file are invisible to the obvious query - they are only reachable through
`actions/runs/<id>/attempts/<n>/jobs`. That is now in "Reproducing this", because a first pass at this
section missed all four and briefly concluded the opposite.

**Reproduced, rather than assumed.** 15 repeat runs of the current spec under contention are green,
which on this laptop proves nothing (`e2e/AGENTS.md`: a race is fault-injected, never repeated
harder). So the fix was mutation-tested instead: restoring the pre-`f193f969` recorder - and keeping
the deliberate 600 ms pre-reload wait - fails **`Expected: 4 / Received: 7`** at `expect(reads[0])`,
the same assertion and the same two numbers CI reported on 2026-08-24. That makes the ping filter
demonstrably load-bearing rather than decorative, and closes the row.

#### `flows` "steps mode reveals lines on Next" - not a flake, a retired design

All four failures are `locator.click: Test timeout of 60000ms exceeded`, and none of them is in the
test's body. The stack lands in the shared helper - `pickDesign` (`e2e/_browse.ts`), which fills the
Browse search box and clicks the first card matching the name - on the test's very FIRST line. The
name it asked for was `Soft Stack`, and **`12206f5c` had retired that design ~3.5 hours earlier**.
The click then waited a full minute for a card that no longer existed.

Checked at each failing SHA, not inferred: all four ask for `Soft Stack`, all four have `12206f5c`
as an ancestor, and none of them contains **`d6ee4d3b`** ("Point the steps-mode flow at a design that
still exists"), which repointed the spec at `Stack Three` and ended the failures. The "single
40-minute window across three unrelated branches" was not an infrastructure blip wearing a spec's
name - it was three branches that had all taken the retirement and not yet the fix. It is the same
one-bug-reported-N-times shape this file diagnoses for `anim-engine` in its opening section, and it
was missed here because a click timeout in a shared helper looks like flakiness from the outside.

The call log is the confirming detail: it has exactly one line, `waiting for
locator('.wz-variant').filter({ hasText: 'Soft Stack' }).first()`, with no "resolved to N elements"
and no visibility or scroll step. The locator never matched anything for the full 60 s, while the
`fill()` on the search box one line above it succeeded. The box worked; the catalog had no such card.

**Two runs look like same-SHA green receipts for this row and are not.** Both `main` shas
(`cb868669`, `faba904c`) have a `success` run ~8 minutes before the failure, which reads as a
red/green pair on one commit - the strongest flake evidence there is. Neither one ran this spec.
Both are `(subset)` plans on OTHER branches, and `flows.spec.ts` is absent from the plan's own spec
list; no shard log in either mentions `flows.spec.ts:81`. This is the trap the root `AGENTS.md`
states as "a GREEN run is not one either until you read WHICH JOBS RAN", and it is worth naming here
because it points the wrong way: believing those two receipts turns a fixed regression back into an
unfixed flake and invites a rewrite of a spec that is fine.

20 repeat runs of the current spec are green, as expected for a defect that was fixed by a commit.
**Nothing in the spec was changed**, which is the correct outcome for a row that was never a flake.

**A retirement is a rename with no compiler behind it.** Retiring a catalog design orphans every spec
that names it, and the spec keeps compiling and only fails at runtime, a minute at a time. That is a
cheap gate for whoever next retires one: grep `e2e/` for the design's name in the same commit.

**Three specs named as suspects in the task brief were checked and cleared:**
`e2e/anim-engine.spec.ts:656` is **not flaky** - it is the deterministic regression above, 27
identical failures fixed by a commit. `e2e/student-rehearsal.spec.ts:110` and
`e2e/video-project.spec.ts:314` have **zero appearances** in the window.

#### The video specs - a real flake, reproduced locally and fixed at the shell

Reported 2026-08-29 off `claude/p-ai-door-copy`, a copy-only branch: two runs of the unchanged
`e2e/video-project.spec.ts` + `e2e/video-hyperframes.spec.ts` produced three DIFFERENT failures,
which is the signature of a missing wait rather than a defect. Consistent with the sweep above -
these never reached CI's window; they are a laptop-visible race.

Reproduced on the first attempt (`--repeat-each=3`, 1 of 3): `scrubbing seeks the composition
deterministically`, failing on `getByTitle('Play')` with the failure snapshot showing the transport
reading `⏸` and the scrubber at frame 45 - **the player was running.** The cause is one gap, not
three: the assistant reply says the AI result was APPLIED, and the debounced preview reload that
mounts it has not started yet. Every reading taken in that gap is about to be undone, because the
reload ends in `autoplay`. The spec had read the transport as paused - correctly - skipped its
conditional pause click, and the reload autoplayed before the next line, leaving it waiting on a
Play button the player would never show again. The reload-restore failures are the same gap after
`page.reload()`, where the boot also has to hydrate the durable slot it picks the video shell from.

**Fixed at the shell, not in the specs' budgets.** `VideoPlayerFrame` now stamps
`data-player-pending`/`data-player-rev`, the readiness signal `PreviewFrame` has always had for SPX,
and `e2e/_video.ts` gained `awaitVideoPreview` / `reloadVideoShell`. No assertion was softened and
no timeout was raised. Mutation-tested by breaking the signal: the fixed spec then fails inside
`awaitVideoPreview` rather than passing vacuously. 9 consecutive repeats of both files (198 tests)
green afterwards. **Closed** - do not re-open these titles without a fresh reproduction.

**Mechanism.** This table used to be the mechanism, with three rules: a flake is entered only with
a **re-run-green receipt on the same SHA**, keyed by test title, and only after checking that no fix
has already landed. Nothing read the table, so the rules were a person's to remember. They are now
`ci.yml`'s: a red `main` or merge-group run re-runs its failed spec files once on the same commit,
a fail-then-pass IS the receipt, and the gate writes the spec into **`e2e/quarantine.json`** through
the merge queue (`scripts/e2e-quarantine.mjs`; `docs/VERIFICATION.md` "A red main answers itself
first"). A quarantined spec leaves the blocking shards, runs in `quarantine.yml` on every push to
`main`, and comes back after `RELEASE_AFTER` consecutive passes - never by being forgotten. This table stays as the
history of the rows worked by hand. **Do not fix a flaky spec without reproducing it first** - a
spec fix without a reproduction is exactly the recurring-breakage pattern this file exists to end,
and on this evidence the more common failure is softening an assertion that was telling the truth.

### 6. SELF-REQUESTED / CONFIG-GAP - 10 runs

`workflow_dispatch` runs failing because someone is iterating on the workflow itself (8, one
branch), or because repository secrets are absent (2 on `main`:
`Missing repository secret(s): E2E_EMAIL E2E_PASSWORD VITE_SUPABASE_URL …`).

**Emails: yes, and correctly** - the run is the reply to a question a person typed. This is not
inbox noise; it is the answer.

**Mechanism:** the secret-shaped half is worth one line of prevention - a dispatch that cannot
possibly pass should say so in its first step rather than after setup. Already the case in
`configured-suite.yml`.

**The branch guard on issue steps: CLOSED.** This file claimed `configured-suite.yml` still lacked
`github.ref == 'refs/heads/main'` on its issue steps - the gap that put seven identical comments on
issue #38. **It was already fixed** in `13f057fa`, "Stop the configured suite alarming from feature
branches", before this file was written; the proposal was stale on arrival. Checking the code
rather than the description found two SIBLINGS that still had the hole, and those are now guarded
too (2026-08-30): **`hosted-latency.yml`** (which the `configured-suite.yml` comment names as
sharing its verdict implementation, and which shared the bug with it) and **`nightly.yml`**. All
three now read `github.event_name == 'schedule' || github.ref == 'refs/heads/main'` on both the
file/update and the close step - a rolling alarm is a statement about `main`, so a
`workflow_dispatch` from a branch being debugged must be able to neither raise it nor withdraw it.

**`weekly-audit.yml` joined them on 2026-09-08, and the way its exemption failed is the
interesting part.** It was left unguarded on the reasoning that its alarm is "about the
repository", which a branch dispatch does not misstate. The failure is not spam - it is the
opposite. Dispatched from the branch that FIXED the browserslist advisory, which is the likeliest
branch anyone runs it from, the run is green, so the CLOSE step fires and posts "Audit green again
at `<a branch sha>`" against an alarm that is still true of `main`. **The exemption was argued from
the alarm's SUBJECT and the hole was in its verb.** Raising and withdrawing want the same guard,
because a withdrawal is a claim about `main` whatever the run was measuring.

Still unguarded, deliberately: `nightly-drift.yml` (its alarm is about the schedule itself, not
about code on a branch) and `deploy-verify.yml` (about production, which a branch dispatch does not
misstate - and which has no green-on-a-branch shape, because it reads what is deployed). Revisit if
one of them ever closes something a branch cannot speak for.

### 7. INFRA - 6 runs

`429 Too Many Requests` downloading an action, a `fetch failed` in a build-stage node test, Vercel
deployment drift (`Production serves <sha>, but main reached <sha> over 90 minutes ago`), and one
**damaged run** (`E2E plan` finished its steps and is still reported `cancelled`; `specs` never set,
downstream skipped, gate red).

**Mechanism: re-run once, then look.** The damaged shape has no verdict at all - check `jobs: []`
or a missing job output before treating one as red (`docs/VERIFICATION.md`, "Ways a run reports
something other than its verdict").

### 8. BY-DESIGN-ALARM - 1 run

`nightly-drift` going red on purpose because a schedule had not fired in 26 hours. Correct, and the
repeat comment is already withheld while the red is not.

## Two reports checked and NOT acted on, with the receipts

Both arrived from a sibling session on 2026-08-29 as CI friction. Both were checked against the
code rather than fixed on the description, and neither turned out to be what it looked like. They
are written down because the next person will hit them and reach for the same wrong fix.

**"A markdown-only branch was classified behaviour-changing and ran the full suite."** It was not,
and it does not. `IGNORE` in `scripts/e2e-affected.mjs` has carried `/\.md$/` and `/^docs\//` for
some time, and `planFor` is exported and pure, so the claim is directly checkable:

```bash
node -e "const {planFor}=await import('./scripts/e2e-affected.mjs');
  console.log(planFor(['src/components/AGENTS.md','e2e/AGENTS.md','src/ai/AGENTS.md']))" --input-type=module
# -> { mode: 'none', specs: [], catalog: false, unmapped: [], focusApplied: false }
```

Ten `.md` files under `src/` and `e2e/` select **`none`** - no shards at all. **Adding a
"`.md` never counts as behaviour" rule would have changed nothing**, and would have been a fix
credited for someone else's cause. Two things really do escalate a diff that looks documentation-
shaped, and either one explains the report: a **CORE** file such as `package.json`, and a script on
the short `SUITE_CRITICAL_SCRIPTS` list (`dev-port`, `e2e-affected`, `e2e-workers`, `e2e-runs`,
`port-registry`, `e2e-lists`, the dev plugins) - everything else under `scripts/` is ignored
wholesale. This branch escalated for exactly those two reasons and was right to.

The likelier real cause of the refused landing is the other half of that report: **a mode-`none`
run runs no specs, and a cancelled run has no verdict at all.** Both read as "green-ish" from a
distance and neither is a verdict - the trap `docs/VERIFICATION.md` states as "a GREEN run is not
one either until you read WHICH JOBS RAN". Check `mode` and the job list before concluding the
mapper misclassified anything.

**"The worktree-isolation guard refuses bounded `until … do sleep; done` waits."** True, and **not
this repo's code.** The refusal ("this command is too complex to verify that it stays inside the
worktree") comes from the agent harness's worktree isolation, not from
`scripts/hooks/guard-command.mjs` - it fires with no `cd`, no git, and `gh -R` fully qualified, and
this session hit the same wall on an unrelated heredoc. Nothing in the repo can relax it. The
workaround is the one the sibling session found: **put the loop in a file and run the file.** Note
also that a poll loop over the JOB QUEUE is refused separately and deliberately by `pollsQueue`
(`scripts/command-match.mjs`) - that one is ours, it is about not sitting on a wait the shell tool
will outlive, and `node scripts/jobs.mjs wait <id>` is the sanctioned bounded form.

## What would actually empty the inbox

In order of leverage, measured against the 40 emailing `main` failures:

1. **Stop landing onto a red `main`** (LANDED 2026-08-30, class 1). Would have removed 26 of 40 -
   two thirds of the owner's CI email - without changing a single test.
2. ~~**Own the two real flakes** (class 5). 11 occurrences~~ - **closed 2026-08-29, with nothing left
   to own.** The relay row was a real flake, correctly admitted: six occurrences, two distinct
   assertions, four carrying same-SHA re-run-green receipts - and both causes had already been fixed
   inside the measurement window (`7447ea9c`, `f193f969`), which nobody had checked. The wizard row
   was never a flake but a deterministic regression from a retired design, fixed by `d6ee4d3b`. No
   assertion was softened and no spec rewritten. The residue is a MEASUREMENT rule, now in class 5
   and in "Reproducing this": sweep `run_attempt>1` runs too, grep for the failure marker rather than
   the file name, and check for an existing fix before opening a row.
3. **A GitHub notification setting, which only the owner can change** (see the owner-queue item
   `2026-08-29-ci-email-is-one-bug-27-times.md`). The repo cannot suppress `ci_activity` mail: every
   email in the window was GitHub telling the owner a run *they* triggered went red. Turning that
   off and relying on the rolling red-main issue requires the owner to be **watching the repository
   for Issues**. Two steps, both in the GitHub web UI, and nothing in the repo can do either:

   - **Turn the noise off:** github.com/settings/notifications -> Actions -> uncheck email, or set
     it to "Only notify for failed workflows **that I trigger**"... which is what it already is, and
     is exactly why the landings mailed. Unchecking email is the step that helps.
   - **Keep the signal on:** on the repository, Watch -> Custom -> tick **Issues**. This is what
     makes the rolling red-main issue reach him. **Do not do the first without the second.**

   *Correction to an earlier version of this file:* it claimed `gh api
   repos/{owner}/{repo}/subscription` answering 404 proved bot-filed issues reach nobody. That 404
   is ambiguous - the CLI token lacks the `notifications` scope and says so on the next line - so
   the subscription state is simply unknown from here. The Watch menu is the place to read it.

Nothing on that list is a test fix, which is the point. **The daily email was one bug reported 27
times, not 27 bugs.**

## What landed on 2026-08-30, in one place

| Gate | Where | Refuses / withholds |
|---|---|---|
| Never land onto a red `main` | RETIRED 2026-09-08 with the laptop lander that asked. A red `main` answers itself now: `ci.yml` re-runs the failed specs, quarantines a flake and reverts a batch that stays red | nothing refuses; the alarm below is what says `main` is red |
| Say each distinct failure once | `scripts/ci-failure-set.mjs` + `scripts/red-main-issue.mjs`, called by `ci.yml` | withholds only a byte-identical repeat of the latest reported set |
| A branch cannot raise a `main` alarm | `hosted-latency.yml`, `nightly.yml` (and `configured-suite.yml` since `13f057fa`) | issue steps scoped to `schedule` or `refs/heads/main` |

Unit-tested in `scripts/ci-failure-set.test.mjs` and `scripts/red-main-issue.test.mjs`, both in the
`npm run build` gate.

## Reproducing this

```bash
# The inventory. `gh run list` caps at 1000 per query - stitch windows and dedupe by databaseId.
# SLICE THE DATES EXPLICITLY. `--paginate` with an open-ended `created>=<DATE>` silently TRUNCATES:
# measured 2026-08-29, it returned 82 of ~100 failed runs and stopped dead at 08-19, dropping the
# whole tail. It reports no error and the short answer looks complete.
for slice in 2026-08-15..2026-08-19 2026-08-20..2026-08-24 2026-08-25..2026-08-29; do
  gh api --paginate "repos/{owner}/{repo}/actions/runs?created=$slice&per_page=100" \
    --jq '.workflow_runs[] | "\(.created_at)\t\(.conclusion)\t\(.name)\t\(.event)\t\(.head_branch)\t\(.id)\t\(.run_attempt)"'
done

# Which job and which step failed, per run - cheap, and enough to classify most runs.
gh api repos/{owner}/{repo}/actions/runs/<id>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | .name + " :: " +
        ([.steps[]? | select(.conclusion=="failure") | .name] | join(","))'

# The failing spec. Prefer ANNOTATIONS over the log: same error text byte-for-byte (cross-checked
# against `--log-failed` on two runs), at roughly 1/50 the cost, already structured.
gh api repos/{owner}/{repo}/check-runs/<job_id>/annotations \
  --jq '.[] | "\(.annotation_level) \(.path):\(.start_line) :: \(.message)"'
# `gh run view <id> --log-failed` still works when you want the whole shard; grep it, never read it.
# GREP FOR THE FAILURE MARKER (`  N) [chromium]`), never for the bare spec FILENAME: the log also
# carries a `[107/119] … spec.ts:NNN` PROGRESS line for every test that PASSED, and counting those
# is how three passing line numbers were once entered in this file as three separate flakes.
```

**A `conclusion=failure` sweep misses proven flakes BY CONSTRUCTION**, and they are the ones worth
finding. Re-running a run's failed jobs flips the RUN's conclusion to `success`, so the strongest
receipts - red then green on one SHA - are invisible to it. Four of the six occurrences behind this
file's own relay row live in runs whose final conclusion is `success`. Walk the re-run runs too:

```bash
# Every attempt of every run with more than one, including runs that finished green.
gh api repos/{owner}/{repo}/actions/runs/<id>/attempts/<n>/jobs \
  --jq '.jobs[] | select(.conclusion=="failure") | "\(.id)\t\(.name)"'

# Flake proof: red on attempt 1, green on the final conclusion, same SHA.
gh api repos/{owner}/{repo}/actions/runs/<id>/attempts/1 --jq '.conclusion'
```

**And a same-SHA green is only a receipt if it RAN the spec.** Two runs looked like red/green pairs
for the wizard row and were `(subset)` plans on other branches that never ran that file at all -
check the `E2E plan` job's spec list, or grep the shard logs for the spec, before believing one
(`docs/VERIFICATION.md`, "a GREEN run is not one either until you read WHICH JOBS RAN").

A cancelled run that never started is `jobs: []`; a cancelled run that was superseded mid-flight has
jobs. The two mean different things and only the second cost any runner time.
