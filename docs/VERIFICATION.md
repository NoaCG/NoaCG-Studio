# Verification - the full procedure

The root `AGENTS.md` carries the six rules. This file carries the detail behind them: which
suite to run, why the gate moved off the laptop, and what each catalog gate measures. Moved here
from `AGENTS.md` on 2026-08-08 to keep the always-loaded contract short; nothing was dropped.

## The build gate

`npm run build` (tsc + eslint + vite) after every change. The tree stays lint-clean: fix findings
properly rather than sprinkling eslint-disable comments.

Its first, fastest step is `node scripts/check-shared-instructions.mjs` - the drift guard for the
AGENTS.md/CLAUDE.md split and the `.agent-workflows/` shared-workflow pattern: it validates thin
imports, Claude commands, Codex skills under `.agents/skills/`, metadata, explicit-invocation
safety, referenced scripts, and the configured instruction-size budget. It self-discovers
`AGENTS.md` and shared workflow files, so a new nested area or shared command needs no separate
registration - only correct adapters. The complete maintenance contract is
`docs/AGENT_WORKFLOWS.md`.

Its second step, `scripts/check-workflows.mjs`, validates every `.github/workflows/*.yml` against
the GitHub Actions schema: a misspelled key, a wrong-typed value, a `needs:` naming a job that does
not exist - the last being exactly what editing the CI gate's dependency set can introduce. Never
wait for GitHub to catch it instead; during the 2026-08-06 outage two pushes produced no run at all.

**The gates are discovered, never listed.** The build line starts with `node scripts/gates.mjs
run`, which runs every `check:*` script whose entry file declares `// gate: build` in its header,
then one `node --test` over every `scripts/**/*.test.mjs` on disk that does not declare another
tier. A new test runs from the moment it exists; a new check needs a `check:*` script (so a person
can run it by name) and a header. The header is the registry:

```
// gate: build | factory | after-build | workflow <file.yml> | none - <why>
// guards: <glob>, <glob>, ...      the paths whose change this gate can catch
// needs: browser                   (a test) needs Chromium, so it runs in the factory tier
```

`factory` is ci.yml's Factory gates job (`node scripts/gates.mjs run --gate factory`: a browser,
servers, subprocesses); `after-build` is named on the build line after the bundle exists
(`check-line-endings` reads what the generators wrote); `workflow` names the workflow that runs
it; `none` carries the reason, and "not wired yet" is not one. A test's guards are the modules
it imports plus its sibling `<name>.mjs`, plus whatever the header adds; a test that reads
fixtures nothing imports (a migration's SQL, the catalog) says so.

`scripts/check-gate-coverage.mjs` audits the declarations rather than the build line: a missing
or unknown tier, a `workflow` that does not name the gate, a `none` without a reason, a guard
matching no file in the repository, and a `scripts/check-*.mjs` with no `check:` script all fail
the build. `node scripts/gates.mjs list [--gate <tier>] [--changed <ref>]` says what would run
and which gates a change reaches; the build still runs every gate in its tier, the declarations
are what a scoped tier (`docs/WORKFLOW_ARCHITECTURE.md` §5.1, T0) will select from.

**The incident it comes from.** On 2026-09-06 a nine-row wave landed red. `test:use-case-search`
held the rule that would have caught it, sat outside `npm run build` because it needs Chromium,
and was named by no workflow at all - so the cloud container that wrote it could not run it and
neither could CI. The spec that eventually failed takes 27 seconds. The first guard asked "does
the build line or a workflow name it?", and the cheap answer was always to make the build line
longer: it became the most conflicted line in the repository, edited in 66 commits in a month.
Now the gate says where it runs, in its own file, and the line never changes.

**A gate outside the build is normal and fine** - a browser, a server, a secret, or a second on
every laptop are all good reasons. What is not fine is a gate outside the build AND outside CI,
because that gate protects nothing while looking exactly like one that does.

There is **no application unit-test suite**; focused Node tests cover infrastructure scripts.
Verify product changes with `npm run build` plus in-browser checks; never mark work done on a green
build alone if the behaviour is observable.

## E2E is TIERED

`npm run test:e2e:affected` maps changed files to covering specs (`scripts/e2e-affected.mjs`) and
is both the inner loop AND what CI runs per change - except on **`main`, which always runs the FULL
suite** (a spec no change maps to is never selected, so it can sit red through green run after
green run - measured, eight of them), and NIGHTLY.

**During the student-release sprint, `npm run test:e2e:focus` is THE student-critical suite
command** (`--focus`, or `E2E_SPRINT_FOCUS=1`, which is what ci.yml sets): a core-file change runs
the focus set (`scripts/e2e-lists.mjs`, 34 specs) instead of all 103 files; the nightly still runs
everything and its verdict separates focus failures from paused-area drift. Prefer the npm script -
the env-var spelling cannot be baked into a package script, because Windows runs those through
`cmd.exe` where a `VAR=1 cmd` prefix is a syntax error, which is why every local run escalated to
103 files while CI quietly ran 34.

When you add a spec, add its mapping in the same commit, or it only ever runs at night. Bootstrap
non-wizard specs with `createProject` (`e2e/_create.ts`).

**A spec that enumerates the catalog must be selected by a `src/templates/` change**, and
`scripts/e2e-affected.test.mjs` pins that rule rather than trusting the list: it scans `e2e/` for
specs importing `CATALOG`, `TYPES`, `KITS` or `PACKS` and fails the build if the mapping misses
one. Six were missing until 2026-08-08, which is how `competition-pack.spec.ts` sat stale.

**Some behaviour has no offline spec at all, and the planner now SAYS so.** `e2e/configured/`
runs against a real backend and a throwaway account (`npm run test:e2e:live:queued`), so it can
neither run in CI nor be selected by the affected gate - which left hosted Pro's door, its
metering and its allowance read-back covered only by offline specs that pin their ABSENCE.
`CONFIGURED_TRIGGERS` (`scripts/e2e-lists.mjs`) names the files whose coverage lives there; a
change touching one prints a line telling you to run that suite. It is reported, never run:
starting it would bring up a dev server on the real `.env`, which is what the offline pin exists
to prevent.

**That suite now has its own nightly, `configured-suite.yml` (01:10 UTC), against a LOCAL Supabase
stack.** Per-change selection still cannot reach it, so nothing commit-driven ever will; a
schedule can. The job runs `supabase start` on the runner, applies the repository's own
migrations, mints a throwaway account, and runs the whole suite against that - then tears down
with the runner. It files its own rolling issue, separate from `nightly.yml`.

Two things that route buys, and one it costs:

- **No Supabase secret lives in GitHub.** The local stack's keys are the CLI's published shared
  defaults, read at runtime from `supabase status`. The repo is public and `.env` points at
  PRODUCTION, so the previous design had to withhold `SUPABASE_SERVICE_ROLE_KEY` and lost two
  specs to it; both are back, and `ALLOWED_SKIPS` is empty.
- **Nothing is written to production.** The suite creates and deletes real rows every run; they
  used to land in the owner's production project, against `playwright.live.config.ts`'s own
  advice.
- **It cannot see latency-shaped defects.** A local stack answers in ~1 ms where a hosted one
  answers in ~200 ms from a runner. The tombstone sync defect fixed on 2026-08-24 was invisible
  at 5 ms/request and failed six specs at 207 ms/request - **this job would not have caught it**.
  A green run here is not evidence that sync is fast enough anywhere real; that needs a hosted
  target or a deliberate delay.

**Its exit code is not its verdict, by construction.** Every spec calls
`test.skip(!haveCreds, …)`, so with the environment unset the run executes nothing and exits 0 -
a job checking only the exit code would be permanently, silently green, which is the exact hole
that let five specs sit on main unverified. The guards, in the order they fire:

1. the stack must come up (`supabase start`);
2. the applied migration count must equal the repository's, so a half-applied schema cannot pass
   as a product regression;
3. `supabase_realtime` must publish `chat_submissions` AND `control_events` - the four
   hosted-playout specs subscribe through `postgres_changes`, and no migration CREATES that
   publication (0003 and 0008 only add tables to it), so a missing one shows up as four 30-second
   timeouts that read like a renderer bug;
4. the test account must **authenticate**, not merely exist - one password grant turns twenty
   ambiguous UI timeouts into one unambiguous step;
5. the JSON report must show **nothing skipped and at least `MIN_TESTS` run**.

**A repeat of the same failure set posts nothing** (the `nightly.yml` amendment, ported here). The
run still fails and the rolling issue stays open - only the COMMENT is withheld, and GitHub mails
on comments rather than on an issue continuing to exist, so a known flake stops arriving every
morning while staying just as visible to anyone who looks. Two conditions keep that honest: the
set must be byte-identical to the one already reported (a new spec failing always posts, even
beside a familiar one), and there must be zero hard failures - only flakes are ever this quiet.
This is deliberately NOT the same as downgrading flaky to a warning: the verdict is unchanged,
each distinct problem is simply said once instead of nightly.

When the suite grows, raise `MIN_TESTS` in the same commit; a stale value only makes the guard
weaker. The run summary lists every test that actually executed - read that, not the exit code.

## A clean merge is not proof the integration worked

`git merge` decides whether two diffs touch the same LINES. It has no opinion about whether the
combined state still holds - and both sides are green by construction, each verified against a
tree that no longer exists. Adding designs on a branch while `main` moves underneath is a merge
git resolves perfectly into a tree whose tests are wrong.

The default affected base is `merge-base HEAD main`, which after `git merge main` IS `main` - so
the plan covers only the branch's own files and everything main just brought in is invisible.
**`npm run test:e2e:integration:queued`** moves the base back to the FORK POINT (the merge-base of
the merge's two parents), so the plan is the union of both sides' changes since they diverged.
`e2e-affected.mjs` also takes that base automatically when HEAD is itself a merge of main, because
that is exactly the moment someone is about to push an unverified combination; `--no-integration`
forces the plain branch-only diff.

It stays cheap: a wide diff escalates, and under sprint focus an escalation is the focus set, not
all 128 spec files. The order is **update from main -> verify the combined state -> fix -> push**,
and CI remains the final authority.

**CI asks the same question, since 2026-08-19.** It used to pass `github.event.before` as the base,
which switched integration off - so a merge commit's run diffed the pre-merge branch tip against the
merge and saw only the files `main` had brought in. Replaying the last 120 merge-of-main commits in
this repository through the planner from both bases, **71 (59%) would have been planned
differently**: 17 skipped the catalog calibration gate the combined tree needed, and 8 skipped E2E
entirely with `mode: none`, reporting green on a combination nothing had run. The plan job now
passes `--integration` alongside the base, so the fork point wins when there is a merge to integrate
and the given base is used untouched when there is not. That does not make the local run redundant -
it means a forgotten local run is no longer a silent hole.

## The pre-merge gate belongs to CI, not the laptop

`ci.yml` runs on every branch push and does strictly more than a local run can (build, the affected
plan sharded up to nine ways, the factory gates, the catalog tripwire when raised) in about ten
minutes, free, on a clean checkout. The safe-merge workflow's Phase 3 prefers a CI run green on
exactly the commit being promoted and falls back to the local pair only when there isn't one.

**The shard count follows measured minutes, not a file count** (`shardsFor` in
`scripts/e2e-affected.mjs`, table in `scripts/e2e-durations.json`): about three minutes of test
execution per runner, capped at nine. A full plan is 99.7 measured minutes and the cap holds it at
nine. What that replaced was a subset cap of four runners however big the subset was - and under
sprint focus plus the curated map a subset is routinely 70-100 of the 147 spec files, so run
32174589727 put 58.3 minutes of tests on four shards (14.6 min each) while the full run beside it
did 66.9 on nine (7.4 min each). Three minutes is set from what a shard now COSTS to add - about
one minute all in, against 3.5 before the browser-setup change below - so the target is a
consequence of that fix, not an independent guess.

**Since 2026-09-04 the table also decides shard BALANCE**, not only the runner count: `packShards`
bin-packs spec files by measured duration and CI hands each runner an explicit file list. A stale
entry therefore costs a lopsided shard - which is what killed four `main` runs at the 20-minute cap
(`docs/CI_STABILITY.md` §4) - where before it cost only the runner count, which the cap of nine
made moot. **It still cannot cost coverage**: the packer enumerates the suite from the `e2e/`
directory rather than from the table, so an unmeasured spec is packed at the median and never
dropped, the assignment asserts that its bins are exactly the suite, and the plan job prints a
warning naming every spec it had to guess at.
`npm run check:e2e-durations` reports drift, and **`npm run record:e2e-durations` re-records the
whole table** - it picks the newest green FULL run of ci.yml on `main`, downloads its shard blob
reports, merges them and rewrites the file, stamping which run it came from. Pass a run id
(`npm run record:e2e-durations -- <run-id>`) to use a particular one. A run whose shards are not all
`(full)`, or that is missing a shard, is REFUSED rather than recorded: it measured a subset, and
writing that would drop every spec it skipped back to the median. Blob artifacts expire after seven
days, so re-record from a recent run. Re-record whenever `check:e2e-durations` reports unmeasured
specs - an unmeasured spec counts as the median, so the table decays as the suite grows.

A shard that stops AT its 20-minute `timeout-minutes` is not a verdict on the change. Playwright
shards by test COUNT, not by measured time, so the spread between the fastest and slowest shard is
real and moves with the file list: on run 32178282707 the eight shards ran 7.4 to 14.2 minutes on
identical work, and across 33 full runs the slowest shard averaged 12.7 minutes against a
perfectly-balanced 9.9 - about half of that gap runner-to-runner variance rather than the split.
Re-run the unchanged SHA before bisecting. The fix for a shard creeping toward its budget is a
SHARD, never a looser timeout - a budget raised to accommodate the slowest healthy shard no longer
distinguishes it from a hung one.

**Setup is the other half of a shard's clock, and it is shared.** `.github/actions/playwright-chromium`
is the one place the browser cache and its apt call live, for the nine shards and both gate jobs.
Until 2026-08-19 it reconciled system dependencies on every job, cache hit or miss: measured over 60
runs that was 3.15 minutes of the composite on a cache hit, of which the cache restore was 3 seconds
and apt was the rest - cut off at its own 180-second bound, installing fonts nothing here reads. It
is now tied to the browser cache miss, and the same action measures 0.03-0.10 minutes on a hit.

**And since 2026-09-04 the plan CARRIES that other half rather than assuming it away.** The table
measures test execution; a runner also checks out, installs, starts Playwright and boots a dev
server, and until then no number anywhere held that term. It was not small. Over the 90 E2E shard
jobs of the ten runs to 2026-09-04 08:43, `npm ci` alone averaged **6.4 minutes**, median 6.1, p90
10.1, against a 20-minute cap - and it was variance, not workload: inside run 33854844447, same
lockfile and same restored npm cache, one shard installed 304 packages in 8 seconds and another
took 10 minutes for the same 304. It was paid twice per job, because the root `postinstall` builds
`player-host/`, whose own `npm ci` runs on a fresh runner too. That is what killed the first
bin-packed run: shard 8 was 10.05 minutes of install plus 10.02 of tests, shard 5 was 10.07 plus
9.95, and both were carrying only 9.8 measured minutes of the 11 the packer planned for.

Two things changed. `.github/actions/node-modules` caches `node_modules` keyed on the manifests and
lockfiles, so on a hit npm is not invoked and the registry is not in a capped job's critical path;
the key hashes `package.json` as well as the lockfile, so the one check `npm ci` performs beyond
installing - refusing when the two disagree - still happens on any manifest edit. And
`scripts/e2e-durations.json` can now carry an `overhead` block recorded from the same run as the
per-spec minutes: `jobMinutes` (the p90 of job wall clock minus the test step, at the p90 because a
cap kills the WORST shard) and `testFactor` (the shard steps over the table's own total).
`budgetMinutes` turns those into how much a shard can carry and still fit, `shardsFor` sizes against
that as well as against the throughput target, and the plan job emits a warning naming the predicted
minutes when a shard is planned too close to the cap. A plan that cannot fit now says so before it
starts instead of arriving as a cancelled shard.

**It ships WITHOUT a recorded overhead, and that is deliberate.** Every measurement in reach on
2026-09-04 came from runs that paid the uncached install the same change removes - 6.6 minutes at
the p90 - and carrying it forward would have made a brand-new instrument raise a permanent alarm
about a configuration that no longer exists. So `DEFAULT_OVERHEAD` (1 minute a job, factor 1.05,
built from the cache-hit step costs) stands in, `check:e2e-durations` says in words that the figures
are defaults, and **the first honest reading has to be recorded from a green FULL run on `main` with
the cache in place**: `npm run record:e2e-durations`.

**A GREEN run is not a verdict either, until you have read which jobs actually ran.** For an
ordinary push the plan's base is still `github.event.before` - the PREVIOUS PUSH - and the
concurrency group cancels the in-flight run on every new push to a branch. (The `--integration`
fix above changes what a MERGE COMMIT is planned from; it does not change which commit an
ordinary push diffs against.) So: push the change, then push a doc line two minutes later, and
the second run plans only that doc line - `plan: {"mode":"none","specs":[],"catalog":false}`,
every shard and the catalog tripwire SKIPPED, the run green on build and the factory gates alone -
while the run that would have covered the change was cancelled before it finished. Nothing ever
gated the change, and the tick says otherwise. Measured 2026-08-19 on
`claude/catalog-names-stat-list-97cbd3`: three pushes in nine minutes, two cancelled, the survivor
green with four of eight jobs skipped - on a branch whose whole subject was the catalog, which is
the one thing `e2e/catalog-baseline.spec.ts` only ever checks in CI.

```bash
gh run view <id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'
```

Skipped shards on a change that touches specs or the catalog mean the run answered a smaller
question than you asked. Ask for the whole one: `gh workflow run ci.yml --ref <branch>`. A
dispatched run has no `event.before`, finds no diff base, and escalates to the FULL suite by
design. (A pull request does the same through `PR_BASE`, which is why a PR's run is trustworthy
where a rapid second push's is not.)

## One browser-driving job per MACHINE, not per worktree

A suite, a catalog sweep and a bench are the same workload under different names - a dev server
plus a pile of headless Chromium - and several worktrees are normally live. Two starting in the
same minute asks a 16 GB laptop for double everything: measured at 59 live
`chrome-headless-shell` processes, 10.9 GB held by the test tree and available RAM down to 35 MB,
at which point every other app is being paged out.

The guard hook refuses the second job and names the checkout holding the first
(`scripts/e2e-runs.mjs`, which scans processes rather than keeping a lock file, so there is nothing
stale to clear), and `e2e/_offline-guard.ts` WAITS instead - the universal net, since a hook only
sees tool calls, never your terminal. Use the **`:queued`** form of any e2e script to wait rather
than fail, `node scripts/e2e-runs.mjs --all` to see what is running, and `--orphans` /
`--kill-orphans` to reap browsers a killed run left behind. `NOACG_ALLOW_PARALLEL_E2E=1` in the
command overrides.

**A killed run leaves its DEV SERVER behind, and that one holds a port rather than just RAM.**
Playwright starts the server as a child of its own CLI (`webServer`), through an npm script and a
`cmd /c` shim, so killing the CLI - which is what you do to a stuck run - frees the CLI and leaves
the chain listening. The guard hook then refuses every following run on this checkout's port, and
there is nothing left to stop it FROM. `--orphans` reports those servers and `--kill-orphans`
closes the whole chain, freeing the port. What makes it safe to kill is the same bar the browser
shells clear plus one more: no Playwright CLI is running anywhere, AND the server's launch chain
has no living owner outside itself - so a `dev` server you started, or one the preview tools own,
is never touched. Windows only, like the browser-shell reaper: on POSIX an orphan is reparented to
init instead of left with a dead parent, so the signal does not exist and the check reports
nothing rather than guessing.

**Two runs that start in the same second do not both wait.** A run sitting in its globalSetup is
indistinguishable in the process table from one driving a browser, so each used to queue behind
the other and both sat out the 30-minute cap - two worktrees, both idle at ~2 s of CPU sixteen
minutes in, and killing either one released the other within seconds (2026-08-21). `blockingRuns`
(`scripts/e2e-runs.mjs`) now orders runs by start time, ties broken by pid, and a run yields only
to those ahead of it: one starts, the rest queue behind it in a stable FIFO. A SWEEP is always
yielded to - it has no globalSetup and never waits for anyone, so it can only be work in progress.

Anything the named list misses is absorbed by the worker ladder (`scripts/e2e-workers.mjs`): it
reads FREE MEMORY at start and takes fewer workers when something heavy is already resident, which
is why the local worker count is not a constant.

**Better than waiting: enqueue.** `npm run queue -- "<command>"` returns a job id immediately and
one runner per machine drains the queue - one job by day, two between 00:00 and 07:00, never two
merges, and nothing below a free-RAM floor (`NOACG_JOBS_FREE_MB` retunes it). `npm run jobs` shows
what is running and the REASON each waiting job is waiting, which is the thing none of the
mechanisms above ever reported: "correctly queued behind a long suite" and "died ten minutes ago"
used to look identical from outside. Every job carries a 45-minute cap and is killed as a whole
process TREE on expiry, so a wedged run cannot hold a slot the way an orphaned bench used to.

Keep using the `:queued` scripts when you need the verdict in this session - a gate cannot take a
job id for an answer - but know that `--wait` now gives up after 30 minutes rather than never.
Unbounded, it outlived the shell that started it (an agent's tool call dies at 600 s), so the run
never started and nothing said so. Full account and the remaining rollout: `docs/JOB_RUNNER_PLAN.md`.

**Every limit above is a statement about ONE MACHINE, so ask which machine you are on:**

```bash
node scripts/agent-isolation.mjs                  # where am I running, and on what evidence
node scripts/agent-isolation.mjs --expect remote  # exit 1 if the launch asked for remote and got local
```

It decides from the two facts git never clones - the landing queue inside `.git` and the count of
sibling worktrees - rather than from the hostname, because the question is not what the machine is
CALLED but whether you are sharing its RAM and its one browser slot. Run it as a row's first step
whenever the launch asked for anything other than a plain local worktree. As of 2026-09-04 the
Agent tool's `isolation: "remote"` is accepted, reported successful and runs here anyway; that
probe is the only thing that says so (`docs/backlog/cloud-sessions-for-stateless-rows.md`).

## Every gate here runs a DEV SERVER, so minification is unmeasured

`playwright.config.ts`, `playwright.live.config.ts` and `playwright.catalog.config.ts` all start
Vite in dev mode, and every fast path below serves source modules too. Nothing in this repo
observes the bundle a user gets. That is a deliberate trade - dev is faster and serves real
source - but it leaves one blind spot, and it is a total one: **a green suite says nothing about
anything that depends on the TEXT of a function.**

`.toString()`, `Function.prototype.name`, `constructor.name` as a key, a stack-trace read, a class
name used as a discriminator - all of these mean one thing under `npm run dev` and another after
`vite build` renames every identifier. The blind spot cost a week on 2026-08-27: the editor
composes its preview document by serializing `runSimCommand` into it with `.toString()`, the
minifier renamed the two helpers that function calls, and every command the editor sent the stage
threw `ReferenceError` into a silent `catch`. Blank canvas, dead Play button, on the deployed site
only. Nine e2e specs covered that path and all of them passed.

Two habits, both cheap:

- **A symptom that appears only on https://noacg.studio is a bundle question until proven
  otherwise.** Fetch the shipped chunk (`curl https://noacg.studio/app`, follow the `/assets/*.js`
  it names) and read the code that actually runs. That measurement takes a minute and is the one
  that ends these.
- **Anything text-of-a-function shaped needs a check on the ARTIFACT, not a spec.**
  `scripts/check-preview-serialization.mjs` is the worked example: it refuses the source pattern
  outright, because no spec could ever reach the failure.

## Logic checks without UI (fast path)

Vite serves source modules, so in a browser context you can
`await import('/src/blocks/registry.ts?t=' + Date.now())`, apply blocks to
`createBlankTemplate(...)`, run `validateTemplate`, and load `composeDocument(tpl)` into a hidden
iframe to call `update()/play()/stop()`; store state via `useTemplateStore.getState()`.

## Template catalog sweep

Every instrument below needs a dev server **for the checkout you are measuring**, and in a linked
worktree that means `npm run dev:worktree` - `preview_start` serves a different tree and says
nothing about it, which is how one sweep measured `main` instead of its branch
(`docs/DEV_PORTS.md`, "Starting a dev server").

`node scripts/l3-sweep.mjs <shots-dir> <category>` (dev server must be running; any
`AssemblerId` - `lower-third`, `info-card`, `end-credits`, `ticker`, `quiz`, `poll`,
`audience`, …) validates every variant × preset × easing. Run it for the affected category after
template changes. A category whose contract differs from the standard one gets its own branch in
the script rather than a waiver (audience and quiz each have one).

## Visual acceptance is a PACK, and it is not a gate

A gate answers "did this break". It cannot answer "is this any good", and a surface nobody has
looked at is the failure mode green gates are blindest to. Where a change needs a person's eyes,
the evidence is a **visual acceptance pack**: screenshots of the REAL running app, with the exact
route and sequence written down so the read can be repeated by hand
(`docs/INTERACTIVE_PLAYOUT_PLAN.md`, "Verification contract").

Two artifact builders exist for that, and neither asserts anything - both are browser-driving
work, both are in `SWEEP_SCRIPTS`, and the machine's one-job rule applies to them exactly as it
applies to a sweep:

- `node scripts/acceptance-shots.mjs <out-dir>` builds the SPX/CasparCG acceptance fixture end to
  end and exports the packages for the manual playout test (`docs/ACCEPTANCE_SPX_CASPARCG.md`).
- `node scripts/acceptance-pack.mjs` builds **`docs/acceptance/owner-pack/`** - the standing pack
  for every read the repo records as OWED, one page, each frame captioned with the question it is
  asking and nothing else. Its dashboard frames carry geometry read off the live document at
  capture time. **A pack asks; it never answers**, and where a frame cannot answer the question
  beside it (an offline checkout has no published join page and no minted capability links) it
  says so on the frame rather than standing in for one. The pack is committed, unlike a sweep's
  output: four docs point at it as the thing that settles a read, and a picture only this machine
  can see settles nothing.

  **A backend-only surface can still be photographed, and the rig is worth copying.** The pack's
  `hosted` section builds the ORDINARY production bundle with `VITE_SUPABASE_URL` pointed at a
  stub origin (`isBackendConfigured` reads BUILD env, so no page-side shim can reach it), serves
  the built tree to the browser out of memory through `page.route`, and answers the migration's
  RPCs from memory using the production's OWN `buildPanelSpec`/`buildOutputPayload`. Only the
  transport is fake. Its limit is worth knowing before copying it: anything driven through
  Supabase REALTIME does not move, because the log follower tail-fills only on a `SUBSCRIBED`
  channel - so the page is captured OPENING onto the state under test rather than driven into it.

  **Every frame pictures the tree it was built from, so a pack has a staleness contract too.**
  The pack's own README maps each section to the files that make it stale; a branch landing on one
  of them means re-running that section, not reading a picture of a tree that no longer exists.

## Looking at the graphic is a step, not a courtesy

A gate answers "did this break" and a pack answers "is this any good" once the owner has read it.
Between the two sat a gap: nothing made a session render its own graphic and look at it before he
did. **A change that moves what a graphic looks like now renders it and answers
`docs/VISUAL_TASTE_REVIEW.md`** - that file owns the questions, the owner's words behind them, the
calibration against frames he judged, and why it is a question a session answers rather than a
gate. The frames come from `scripts/taste-frame-review.mjs` (`--affected` reads the same plan
`catalog:affected` does; `--only` names designs; an import is rendered through
`scripts/svg-import-sweep.mjs --shots`), which is browser work and goes through the queue. It
fires in `/check` phase 4, and the report says `taste: answered` or `taste: not applicable`.

## The five catalog quality gates

### Start by asking WHICH designs the change can move

The gates below MEASURE a rendered graphic, one page at a time, over 500+ designs, and the catalog
only grows. A change that touched one lower third does not need the other 503 re-measured, and
paying for them anyway is what the owner asked us to stop doing (2026-08-28: any template change
"takes a lot of effort from the computer and everything else"). So the procedure starts here:

```bash
npm run catalog:affected      # WHICH designs, and the exact battery for this change
```

It prints one of three verdicts, derived from the diff:

- **nothing** - the change cannot move a catalog measurement. No catalog run at all.
- **a slice** - the changed files are design files, and it names the designs they declare - plus
  every design that IMPORTS them, because designs share bodies (`tickers/tk07.ts` calls
  `houseWire` out of `tk05.ts` as its whole `create`, so editing tk05 moves eight designs). Every
  gate below takes `--only <ids>`, and the catalog specs take `NOACG_ONLY_DESIGNS=<ids>` plus
  `NOACG_ONLY_CATEGORIES=<categories>`; the command list it prints already carries them. An id the
  catalog does not ship is REFUSED rather than quietly sweeping nothing - on the script side by
  `scripts/catalog-scope.mjs`, on the spec side by `e2e/catalog/scope-guard.spec.ts`.
- **the whole catalog** - something shared changed. A category's `shared.ts`, a preset bank, the
  type registry, fonts, the theme tokens, `src/blocks/`, the `:root` contract, a gate script or a
  baseline: all of them reach every design, so all of them escalate. So does any file it cannot
  attribute to named designs. Like `e2e-affected`, it fails toward measuring MORE - naming too
  FEW designs is the one failure mode with no alarm attached, and `scripts/catalog-affected.test.mjs`
  pins that direction.

**Scoping changes WHERE and HOW MUCH, never WHAT.** A scoped run applies the same floors, the same
tolerances and the same baseline rows to fewer designs.

**WHAT STILL RUNS UNSCOPED, EXACTLY** - neither CI nor the nightly sets a scope, but they do not
run the same things, and it matters which:

| | `check:catalog-emit` | the calibration tripwire | the four sweeps |
|---|---|---|---|
| **CI**, when the plan raises the catalog flag | yes | yes | **no** |
| **Nightly**, unconditionally | yes | yes | yes |

So a scoped local run of `type-floor`, `overflow-sweep`, `field-coverage` or `numerals` is covered
by the NIGHTLY and by nothing sooner - up to a day. That is the same exposure the old rule had
(those four never ran on CI either), but it is the reason to run the affected slice rather than
skip the sweeps entirely.

### Run the battery on GitHub instead of on the laptop

`.github/workflows/catalog-gates.yml` runs exactly the battery `npm run catalog:affected` prints -
the emit gate, the four sweeps and the catalog specs - scoped to the same designs, on a runner:

```bash
gh workflow run catalog-gates.yml --ref <branch>                        # derive the plan from the branch diff
gh workflow run catalog-gates.yml --ref <branch> -f designs=lt01,tk05   # or name the designs
gh workflow run catalog-gates.yml --ref <branch> -f designs=all         # or force the whole catalog
```

**Prefer it over the local `:queued` form whenever you do not need the verdict inside this
session.** Four of the six gates are browser-driving jobs on the machine-wide list, so running them
here costs the one slot every other worktree is also waiting for - and the sweeps are tens of
minutes each. A runner shares none of that, and the plan is derived by the same script, so the two
answers cannot differ.

**Keep the local run when you need the answer NOW** - a gate cannot take a run id for an answer any
more than it can take a job id - and when you are iterating on a design and would otherwise push
five times to watch five runs.

**What it does not cover.** It skips the plan's step 3 (`l3-sweep`, which writes screenshots and
asserts nothing - a picture only a runner sees settles nothing) and `engine-floor`, which the
nightly runs and the plan does not name. Its render-baseline comparison is win32-only and therefore
inert on a runner, so `e2e/catalog-baseline.spec.ts`'s FRAME half still only ever runs locally. And
a red run files no issue: it fails, and the nightly owns the rolling issue for these gates rather
than opening a second one about the same fault. **`workflow_dispatch` only works once the file is on
the default branch**, so this is a tool for a branch cut from a `main` that already has it, never
for proving a change to the workflow itself.

**Its base is the plain merge-base with `main`, which is the narrow one after a merge.** Once the
branch has taken `main` in, that base IS main's tip, so a shared-machinery change that landed while
the branch was open is invisible to the plan - the same trap `integrationBase` exists for on the
e2e side, which `catalog-affected.mjs` has no equivalent of. After merging `main` in, pass the fork
point yourself: `gh workflow run catalog-gates.yml --ref <branch> -f base=<fork-point-sha>`.

Its own schedule (11:50 UTC, so about 13:00-15:20 UTC once GitHub's delay is paid) plans from its
last green SCHEDULED run on `main` and narrows the up-to-a-day exposure named above. A day on which
nothing catalog-shaped landed plans `none` and runs nothing. **That schedule is not on
`nightly-drift.yml`'s watch list**, so a cron that quietly stops firing would say nothing - the
nightly remains the tier guaranteed to run these gates, and this one is best-effort until it is
watched.

### The cheap gate, before any of the five

```bash
npm run check:catalog-emit            # ~3 s for the whole catalog, no dev server
node scripts/check-catalog-emit.mjs --only lt01,lt02
```

**"No dev server" is not "no browser", and the difference cost a red CI job on 2026-09-05.** This
check launches headless Chromium (`scripts/catalog-emit.mjs`, `chromium.launch()`); what it does
without is a dev SERVER, because it bundles the catalog and evaluates it in a blank page. So it
cannot go in `npm run build`: the Build job on CI installs no Playwright browsers, and adding it
there failed with `Executable doesn't exist` while passing on every laptop that has them. It was
tried, reverted the same day, and this paragraph is the reason not to try it again.

The gap that made it tempting is real and stays open: a change to a shared template file can pass
`npm run build`, be committed and queued, and only then turn CI red on a baseline nobody
re-recorded. **`npm run catalog:affected` is what closes it** - it reads the diff, names this check
first, and takes three seconds to run. The contract already opens with it (`src/templates/AGENTS.md`);
it needs following rather than automating into a job that cannot host it.

This answers the three questions in `e2e/catalog-baseline.spec.ts` that are about TEXT rather than
about layout - every design's emitted html/css/js against `e2e/catalog-baseline.json`, the
hidden-data-holder rule, and the name collisions - by bundling the catalog with Rolldown and
creating every design on a blank Chromium page. No Vite, no `/app`, no iframe per design.

It still opens a browser, and that is not an oversight: creating a design PARSES the html it just
emitted (`blocks/presetRegistry.ts` -> `model/structure.ts`, `new DOMParser()`), so all 504 designs
fail in bare Node with `ReferenceError: DOMParser is not defined`. A blank page is the honest
minimum. It is deliberately NOT on the machine-wide browser-job list (`SWEEP_SCRIPTS`): it holds
one blank tab for about three seconds, and parking that behind a live suite for half an hour would
teach everyone to route around the guard.

### The five

Run after any catalog-wide change, scoped by the plan above where the plan named a slice:

- `node scripts/type-floor.mjs` fails on any text under its category size floor.
- `node scripts/overflow-sweep.mjs --baseline` fails on any box that newly escapes the 1920x1080
  frame or clips its own content, diffing against `scripts/overflow-baseline.json` (~200 variants
  clip by design - reveal masks, ticker/crawl scroll - so it is a diff gate, re-recorded with
  `--update-baseline` on a deliberate look change). **`--with-images` adds a second pass with a
  mark in every image field**, recorded as `<id>@image` in the same baseline: a logo is the one
  operator action that can spend a strap's remaining width (+35% on lt54,
  `docs/ADAPT_FIRST_PLAN.md` §1.5) and every gate here otherwise runs on the EMPTY build.
  Re-record with `--update-baseline --with-images`; the script refuses a bare re-record once image
  rows exist, because that would silently retire half the gate.
- `npm run test:e2e:catalog` (the calibration tripwire in `e2e/catalog/catalog-bench.spec.ts`) is
  the ONLY gate that catches a design growing past its width budget - it doubles every text value.
  Excluded from the default `npm run test:e2e` suite: benching every catalog variant across every
  category is the single heaviest thing here, and (like the two gates above) it only needs to run
  when the catalog or `src/validation/runtimeBench.ts` actually changed.
- `node scripts/field-coverage.mjs` is about DATA: it drives every data field to a sentinel
  through `update()` and re-reads the screen, so anything that did not move is not
  operator-reachable (an `id="fN"` scan cannot see a standings row, ticker item or credits line,
  which a runtime BUILDS from one `lines` field).
- `node scripts/numerals.mjs` is about MOVEMENT: it substitutes every digit in turn and measures,
  failing any live number whose box changes width (DESIGN_LANGUAGE §1) - `tabular-nums` is a NO-OP
  on six of the seventeen bundled faces, so grepping for it would have passed every jiggling
  scoreboard. `--fonts` re-measures the registry's `tabularFigures` flags.

**ADDING OR CHANGING A DESIGN ALSO MOVES THREE BASELINES, AND ONLY ONE OF THEM IS ABOVE.**
`e2e/catalog-baseline.spec.ts` pins the SET of catalog variants, each one's emitted code
byte-for-byte, and (on win32) its rendered frame - so nine added designs fail it until it is
re-recorded, in a diff that should be purely additive:

```bash
UPDATE_CATALOG_BASELINE=1 UPDATE_RENDER_BASELINE=1 npx playwright test e2e/catalog-baseline.spec.ts
```

**That spec is NOT in `playwright.catalog.config.ts`**, which is the trap: the five gates above
can all pass, the whole `npm run test:e2e:catalog` suite can pass, and CI's full plan still goes
red on the baseline - as it did on 2026-08-19, after four green local catalog runs on a
nine-design branch. `npm run test:e2e:focus:queued` covers it locally; CI's plan always does.
Read the diff before committing it: ids ADDED and nothing existing changed is the healthy shape,
and an existing id whose code or frame moved is a real change in a design nobody edited. The one
line that always moves is `recorded` at the top of `e2e/catalog-render-baseline.json` - the day
that file was taken, which the failure message prints back when the fingerprints disagree.

`node scripts/engine-floor.mjs` is about the PLAYOUT BROWSER: what CSS/JS an older engine silently
drops, per design and per declaration (`--engine casparcg-24`, `--chromium 80`, `--fail` to gate).
It shares its scanner with the export screen's Playout-compatibility section
(`src/validation/engineSupport.ts`), so gate and warning cannot disagree, and it REPORTS at exit 0 -
a standing account (179 of 430 designs at the Chromium 88 bar) rather than a line the catalog
currently holds.

**The doctrine these share:** they MEASURE the rendered graphic rather than grepping the source,
because every source check here would have passed a catalog that was visibly broken. Each script
documents its own exemptions, with the reason written beside them.

**None of the five is left to memory:** `npm run test:e2e:affected` raises the tripwire
automatically when relevant and CI runs it on that flag, and the NIGHTLY sweep runs all five
unconditionally - so an unrun catalog gate is caught by morning rather than never.

**And the scoped local run never becomes the only run.** Nothing on a schedule sets a scope: an
unset `NOACG_ONLY_DESIGNS` means everything, and a baseline re-record refuses outright while a
scope is set (a baseline is a claim about every row in it). Which schedule covers which gate is
the table under "Start by asking WHICH designs" above - CI carries the emit gate and the tripwire,
the nightly carries all five.

## Migrations reach production through a guard, not through a human

`npm run db:push` applies every pending migration to the hosted project and needs nobody's
permission. What a human used to be asked for was a judgement about RISK, so `scripts/db-push.mjs`
makes that judgement on the statements: grants, policies, additive columns/tables/indexes,
functions and backfills apply; a DROP, TRUNCATE, DELETE FROM, column-type change, RENAME,
`disable row level security`, `owner to`, `alter database`, a REVOKE on an object the same migration
did not create - or any statement shape it does not recognise, because it fails CLOSED - stops and
reports. That refusal is answered per version (`npm run db:push -- --allow 0052`), never in bulk.
The classifier is the guard, and `scripts/db-push.test.mjs` is where it is held: the dangerous
shapes are fixtures, and every migration in the repo is classified so the recognised set cannot
quietly stop covering what this project writes.

Two things make the result evidence rather than a claim. It refuses to push onto a DRIFTED ledger -
a version that is not four digits, or one with no file on disk, means something applied a migration
by a route that is not `db push` (supabase/AGENTS.md) - and it snapshots the grant matrix, columns,
policies and ledger before and after, printing the difference. For a grants-only migration the
expected diff is a named set of privileges and exactly one ledger row; anything else is a finding.

**Nothing triggers it by hand any more.** `.github/workflows/post-land.yml` calls the push on every
push to `main` - the moment a new migration exists and nothing has applied it, on a
runner holding the `production` environment's token, with nobody watching. It asks the drift check
rather than diffing the branch, so it also catches a migration that landed earlier and was never
applied, which is the case the manual step kept losing. A push that refuses does NOT fail the
landing: the merge already happened, the refusal is reported, and nothing in the push can turn a
landing that happened into one that did not. `--no-db-push` opts a machine out.

The drift check stays, because a migration can still reach `main` without going through the queue on
this machine: the safe-merge preflight REPORTS whether either hosted project is behind, and
`npm run check:migration-drift` runs the same check alone. `0051_client_table_grants` sat unapplied on production for hours on
2026-08-25, past a green CI run and a green nightly, and was found only because somebody ran
`supabase migration list` for an unrelated reason - the delay that rule bought was not caution, it
was how one safe change becomes a compound one.

Advisory, never blocking - a laptop without the token, or without a network, gets a note rather
than a refusal. It is deliberately **not** a CI job: the ledger lives in
`supabase_migrations.schema_migrations`, which PostgREST does not expose, so reading it remotely
needs the Supabase MANAGEMENT API and an ACCOUNT-WIDE personal access token - one that enumerates
every organisation and project, and whose API deletes them. This repository is public, so that
token stays out of Actions and the check runs locally, where it already lives in `.env`.

It reads the production ref from `VITE_SUPABASE_URL`, never from `supabase/.temp/`: that is the
CLI's per-checkout LINK state, and a worktree linked to a staging project would otherwise make the
check answer confidently about the wrong database.

**`noacg-staging` goes through the same two mechanisms**, since 2026-09-02. The drift check reports
both refs (production from `VITE_SUPABASE_URL`, staging declared in `scripts/supabase-projects.mjs`
because nothing in the app derives it), and the landing runner pushes both - production first, so a
staging failure never stands between a landing and the database with users on it. `npm run db:push
-- --ref <ref>` is the by-hand form; the flag exists because `VAR=x npm run …` is a shell-ism
PowerShell does not have, and this runs on a Windows laptop.

**Why it needed a mechanism.** Staging was current only while somebody remembered to push it. On
2026-09-02 the teams migrations 0053/0054 had been on `main` for a day, `hosted-latency` went red on
`PGRST205 Could not find the table 'public.teams'`, and the alarm was indistinguishable from the
hosted-only latency regression that job exists to catch. 2026-08-26 had already shown the mirror
image: **staging catching UP can turn a job red too**, when a probe or a spec leans on a privilege a
migration is about to take away. Both directions used to surface only as a scheduled run going red
up to twelve hours later. When one still does, read both ledgers before believing either diagnosis -
`npm run check:migration-drift` answers for both at once, or by hand:

```bash
node -e 'fetch("https://api.supabase.com/v1/projects/<ref>/database/query",{method:"POST",
  headers:{Authorization:`Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,"Content-Type":"application/json"},
  body:JSON.stringify({query:"select version from supabase_migrations.schema_migrations order by version"})
}).then(r=>r.json()).then(v=>console.log(v.length,v.at(-1)))'
```

## Freshness is TIME-driven, never commit-driven

`docs/STACK_FRESHNESS.md` owns this. `npm run check:freshness` is not in the build gate, because
its answer changes when upstream publishes. It runs weekly in `weekly-audit.yml` and REPORTS -
nothing auto-upgrades, since Remotion's three-file exact pin and the es2017 output floor can both
be broken by a bump that passes every check.

## Ways a run reports something other than its verdict

Four of these have each cost a session, and all four read as green.

**`gh run watch --exit-status` lies.** On 2026-08-23, mid-safe-merge, it exited **0** on a run
whose conclusion was `failure` - two E2E shards red, `CI gate` red. Its own printed output showed
`X CI gate`; only the exit code said green. Settle a CI verdict with the jobs list, never the exit
code:

```bash
gh run view <id> --json jobs -q '.jobs[] | "\(.conclusion)\t\(.name)"'
```

and read the job list yourself. The two checks a green tick hides are made by eye now that the
landing preflight that made them is retired: whether the shards actually ran, and whether a failing
job is damaged rather than failing. Both are described just below.

**A damaged run is not a red run - it is NO run.** GitHub Actions can return `failure` with none
of this repository's code having executed, and the two are indistinguishable in `gh run list`.

```bash
gh api repos/{owner}/{repo}/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | select(.conclusion != "success")
        | {name, conclusion, steps: [.steps[] | {name, conclusion}]}'
```

A failing job is damaged when it shows any of: `steps: []` (killed while queued, never started);
a single failed step of `Set up job` (runner acquisition failed, before checkout); `cancelled` on
a job nobody cancelled, especially several in the same second (a whole-run kill, not independent
timeouts); or a wall time far past its own `timeout-minutes` - that clock only runs while a job is
EXECUTING, so it cannot cut short a job stuck in the queue, and the reported start time is when it
entered the queue rather than when it ran. Corroborate with
`curl -s https://www.githubstatus.com/api/v2/status.json`. Degraded Actions is not rare: on
2026-08-06 a critical incident ran over five hours and produced three damaged runs here, two on
`main`, which filed the rolling red-main issue against a commit that had passed every code-testing
job twice. A damaged run carries no verdict, so it is not fix-or-abort and there is nothing to
fix - fall back to the local gate and say so explicitly, naming the run, the damaged job and the
incident, so the landing is never later mistaken for one that ignored a red gate. One free retry;
if it also queues without starting, that is confirmation, not a reason to keep waiting.

**A pipe masks the exit code.** `npm run test:e2e:affected 2>&1 | tail -30` reports the TAIL's
status, so a failing suite exits 0 - and grepping the tail for "passed" compounds it, because
Playwright prints the failed-test LIST above the "N passed" summary. On 2026-08-05 that produced a
false "350 green" report; a review workflow caught it, not the gate. Redirect to a file and echo
the code explicitly - `cmd > log 2>&1; echo "EXIT: $?"` - then read the log's failure list, never a
grepped summary. **And the echo becomes the next lie:** a background-task notification reports the
whole compound command's status, which is the `echo`'s, i.e. always 0. A queued run notified
"completed (exit code 0)" while Playwright had failed 2 of 13. A notification's exit code is never
a verdict for a compound command - open the log.

**Never hand-roll a poll loop to wait for a run.** Use the command that EXITS on the condition,
backgrounded, so it notifies once: `gh run watch --exit-status <run-id>` (with `gh`'s own `--jq`
flag, which does not need the jq binary). On 2026-08-21 a hand-rolled loop shelled out to `jq`,
which was not installed; `jq: command not found` went to stderr, stderr landed in the output file
WITHOUT raising a notification, the comparison never matched, and a green run sat unreported for
26 minutes while the owner waited on a safe-merge. Three monitors died that way in one session. jq
is installed now, which is the smaller half of the lesson: a silent wait loop reads as "still
running" forever, so wait on something that exits.

## A schedule that never fires reads exactly like a healthy one

A workflow whose cron has never once produced a run looks, on the Actions dashboard and in
`gh run list`, exactly like a workflow that is running fine - because the runs are all there.
They were just all typed by hand.

**configured-suite, measured 2026-08-25.** Its cron landed on `main` on 2026-08-24 at 14:55 UTC
and, by the time this was checked, had produced **zero** runs. All 16 were `workflow_dispatch`,
several of them green, so the suite read as thoroughly exercised while the nightly signal it
exists to BE had never fired once. The surfaces with no nightly verdict for those two days were
the authenticated ones - account, community, moderation, the Pro wizard and the four
hosted-playout walks the 2026-09-12 production is judged on.

```bash
gh run list --workflow=configured-suite.yml --event=schedule --limit 30   # empty
```

**What that check cost, and what it ruled out.** Every cheap cause was eliminated with API calls,
in this order - run them in this order on any workflow whose cron looks dead:

| Check | Command | Answer here |
|---|---|---|
| Is the schedule disabled? | `gh api repos/:owner/:repo/actions/workflows --jq '.workflows[] \| "\(.state)\t\(.path)"'` | `active` - not `disabled_inactivity` |
| Is this a fork? (forks never run `schedule`) | `gh api repos/:owner/:repo --jq .fork` | `false` |
| Is the file on the default branch, and since when? | `git log origin/main -- .github/workflows/<f>.yml` | since 2026-08-24 14:55 UTC |
| Does repo-level scheduling work at all? | `gh run list --workflow=nightly.yml --event=schedule` | yes - fired 01:54 UTC that same night |
| Did a concurrency group hold the slot? | compare `createdAt`/`updatedAt` of every run against the cron time | no - the group was free 01:03-03:58 UTC |
| Is the `on:` block shaped like one that works? | diff against `nightly.yml` | identical shape |

**Nothing was changed on that evidence, and that is deliberate.** One missed cycle on a
ten-hour-old schedule is not proof of a broken cron: GitHub delays scheduled runs under load and
**drops them outright** - `nightly.yml` ran its 00:20 UTC cron at 01:54 that same night, 94
minutes late, and this repo has separately recorded a 23:43 cron running at 01:11. Moving the
cron would also have re-registered the schedule and destroyed the one clean data point the next
cycle gives. The falsifiable prediction is on the record instead: **if the 2026-08-26 01:10 UTC
cycle also produces no run, the schedule itself is at fault and not GitHub's queue.**

**Never dispatch a workflow to "check whether its cron works".** A `workflow_dispatch` proves the
specs pass; it can never prove the schedule fires, and it fills the run list with green so the
absence stops being visible. Dispatching is precisely what masked this one for two days.

**The mechanism, so this cannot go quiet again.** `nightly-drift.yml` now carries a second job,
"Did the configured suite run on its schedule?", built on the same rolling-issue pattern as the
nightly's - **but filtered to `--event=schedule`**, because an unfiltered check would have been
closed by any one of those 16 dispatches and would have lied in exactly the way it exists to
prevent. Same 26-hour window, so one dropped GitHub slot closes itself and a genuinely dead cron
does not.

### The repo's secret list is a signal too

Four repository secrets were deleted on 2026-08-25: **`E2E_EMAIL`, `E2E_PASSWORD`,
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`**. No workflow or composite action read any of
them - `configured-suite.yml` sets `E2E_EMAIL`/`E2E_PASSWORD` to the local stack's own literals
and derives the two `VITE_*` values from `supabase status`, and the only secrets referenced
anywhere are the three `STAGING_*`. `E2E_PASSWORD` was a live production login sitting in the
secret list of a **public** repository with nothing consuming it.

```bash
grep -rhoE 'secrets\.[A-Za-z0-9_]+' .github/ | sort -u   # the only true list of what is READ
grep -rnE 'toJSON\(secrets|secrets\[' .github/           # and the dynamic forms that grep misses
```

Both, plus the environment and Dependabot scopes (`gh api
repos/:owner/:repo/environments/<name>/secrets`, `gh secret list --app dependabot`), before
deleting anything. The values survive in Supabase and in `.env`, so this is recoverable.
**Deleting a secret is not rotating a credential** - the production login those two named still
exists and should be rotated or removed at the source if it is not wanted.

## The affected mapper's one failure mode has no alarm

`scripts/e2e-affected.mjs` is safe because it fails TOWARD running more specs. An entry that runs
FEWER is therefore the one mistake nothing reports. It has happened twice:

- `src/assets/` maps to a fixed six-spec list written for asset HELPERS (`eraseRegion`,
  `assetInfo`, `lottieSupport`). But `src/assets/gsap.min.js` is the ANIMATION ENGINE, inlined
  into every preview and every export - so upgrading GSAP selected those six specs and never
  `anim-engine.spec.ts`, the one pinning editor-against-runtime motion parity. Fixed in `b250f2c`
  by naming the file in `CORE`. **Generalise: a shared foundation living in a folder whose rule
  was written for helpers gets silently under-covered. Ask what a file IS, not where it sits.**
- 12 AI specs sat red on `main` unnoticed when the Finish step's "Open in the editor" door became
  Advanced-only and `ai.spec.ts`, `ai-lite.spec.ts` and `adapt-first.spec.ts` were missed in the
  migration to `enableAdvancedMode`. They waited 60 s on a button that no longer rendered.

Mutation-test a mapping change in both directions before committing it - a guard that can be added
wrong and still look fine is exactly the kind that is.

## The runtime bench measures paint, not layout

`runtimeBench.overlapIssues` pairs LEAVES, and a leaf owns a text node - a PANEL owns none, so a
panel was never in a pair and text could vanish under one completely with every geometry check
passing. Closed by `src/validation/occlusion.ts` + `bench-occluded` (`9044899c`), which hit-tests
with `elementsFromPoint` rather than deriving paint order, and reads 0 of 502 shipped designs at
default values and 0 of 502 with every text doubled - which is what makes an error band affordable.

**Both calibration runs found bugs in the PROBE, not in the catalog**, and both were the same
mistake: measuring something other than what is on screen.

- Ten shipped tickers read 13-100% covered, because a crawling item passes under the fixed label
  every lap. Fixed by taking the bench's own `dynamicsRoots`.
- es02 read 16.3% under stress because **`Range.getClientRects()` reports LAYOUT rects, and layout
  does not stop at a clip.** The doubled name laid out to x=974 while its box ended at 698; those
  glyphs are never painted. Fixed by cutting line boxes down by every clipping ancestor.

Before believing any measurement of the rendered frame, check the instrument against a screenshot.

## What a red run means, and what actually emails

The rule this repo wants is **red means a person must act**. Everything else on the Actions
dashboard is bookkeeping. This section is the checkable list the next GitHub email can be held
against, and the measurement behind it.

**`docs/CI_STABILITY.md` is the other half**: which failures RECUR and what mechanism stops each
class, measured over 2026-08-15 to 2026-08-29. Read it before treating a red run as new work - most
of them are not. Its headline corrects the framing this section was written under: over that window
`main` went red 40 times for **14 distinct reasons**, and one defect
(`e2e/anim-engine.spec.ts:656`, red for ~35 hours) accounts for 27 of them, because landings kept
arriving onto a red `main` and `main` alone runs with `cancel-in-progress: false`.

**Measured 2026-08-22 00:00 to 2026-08-25 21:00 UTC** (3.9 days, 59 non-success runs).

### A red main answers itself first: second run, quarantine, revert

Since phase 1c of `docs/WORKFLOW_ARCHITECTURE.md` a red `main` run is not a person's job until
three mechanisms have had their turn, all in `ci.yml`:

1. **The second run.** When the E2E shards fail on `main` or in the merge group, the `E2E retry`
   job reads the failed spec FILES off the shards' blob reports (`scripts/e2e-retry.mjs`) and runs
   exactly those once more on the same commit. Fail-then-pass: the gate passes, with a warning
   naming the specs. Fail-then-fail: the run is red as before. Three things make the retry refuse
   instead, and the run stays red on each: fewer reports than shards (a shard died before
   Playwright reported, so its files never ran), no failing spec in the reports (the failure was
   not a test), and a failing spec the change itself edits (that flake is the change's, bounced
   to its author, never quarantined on a second run).
2. **The quarantine.** A fail-then-pass is the receipt a flake needs, and the `After the gate`
   job writes it: the specs go into `e2e/quarantine.json` on a branch off `origin/main`, queued
   through the merge queue like any landing (`scripts/e2e-quarantine.mjs enter --queue`). From
   the next landing on, the planner keeps them out of the blocking shards, and `quarantine.yml`
   runs each one on every push to `main` in its own job, posting the verdict as the commit
   status `noacg/quarantine/<spec>`; its `Quarantine release` job reads those statuses newest
   first and queues the release after `RELEASE_AFTER` consecutive passes. A spec leaves
   quarantine by passing, never by being forgotten; a spec the change edits stays in the
   blocking plan, so the fix for a flake is tested. `npm run quarantine list` shows what is in.
3. **The revert.** On a `main` push whose failure survived the second run (the retry re-ran the
   specs and they failed) or was never a spec (a red build is deterministic), and whose last
   `main` commit WITH a verdict was green, the `After the gate` job reverts everything since that
   commit - every first-parent commit, newest first - on `revert/<sha7>` and queues it
   (`scripts/revert-landing.mjs`). The last verdict, not the previous push: a superseded `main`
   run cancels itself and two landings a minute apart finish in either order, so the range may
   hold several landings and the pull request lists every one. The red-main issue names the
   pull request, and the next green `main` run closes the issue. `shouldRevert` in
   `scripts/red-main-issue.mjs` is the rule; a `main` that was already red, a retry that re-ran
   nothing, a conflicting revert, and a run with no verdict are each written into the issue as
   the reason nothing was reverted.

What still reaches a person: a failure that survives the second run on a `main` that was already
red, a revert that conflicts, a spec the change itself made flaky, and every quarantine entry
(the pull request is the record). The mechanical landings carry `noacg/reviewed` posted by the
mechanism, and its description says `mechanical: ...` rather than claiming a review; they ask
for their branch run by dispatch with `require_review`, because a push made with the workflow
token starts no run. They need the organisation to let Actions open pull requests
(`scripts/landing-ruleset.mjs --apply` sets it, with an owner's `admin:org` login); until it is
set, the branch is pushed, `gh pr create` is refused, and the next run retries.

### A CANCELLED run does not email. Only a FAILURE does.

This was assumed the other way round for a while, and it is worth settling because it changes
which fixes are worth making. Ground truth is the notification inbox, not the run list:

```bash
gh api --paginate "notifications?all=true&per_page=100&since=<ISO>" \
  --jq '.[] | select(.repository.full_name=="<owner>/<repo>")
        | "\(.updated_at)\t\(.subject.type)\t\(.subject.title)"'
```

Over the window that returned **35 `CheckSuite` threads**. Every one of them matches, to within
about twenty seconds, either a run whose conclusion was `failure` (30) or the failed **attempt 1**
of a run that a re-run later turned green (5). **None of the 29 `cancelled` runs produced a thread
at all** - including the three on `main`. A run cancelled by concurrency is silent.

The five re-run cases are worth knowing separately, because the run reads `success` afterwards and
the email is left with nothing to point at:

```bash
gh api repos/{owner}/{repo}/actions/runs/<id>/attempts/1 --jq '.conclusion'
```

### An issue COMMENT emails; an issue staying open does not

Notification *threads* collapse to one per issue, so the inbox can be worse than a thread count
suggests: GitHub mails a **subscriber** for every comment. Over the window that was **9 issues
opened and 17 comments** on top of the 35 run failures, and **seven of those 17 comments were the
same sentence** ("Still red.") on issue #38, one per `workflow_dispatch` while a branch iterated on
a broken workflow.

That asymmetry is why every rolling alarm here withholds a repeat of an identical finding while
keeping the run red: a red tick costs nobody an email once it has been reported, and a comment
costs a subscriber one every time. See `nightly-drift.yml`'s header, and commit 1e05894e for
`configured-suite` and `nightly`.

**Correction, measured 2026-08-26: on THIS account those issue comments cost nothing.** The
original figure ("about 61 emails, of which 26 were issue traffic") was inferred from the issue
timeline, not read out of the inbox - the only thing actually counted there was the 35 `CheckSuite`
threads. Read out of the inbox instead, the last 48 hours contain **five rolling issues opened and
five comments, and zero `Issue` notification threads**. Widening the query to 2026-08-20 returns
exactly one, whose `reason` is `comment` - an issue the owner had themselves replied to. The repo
carries no watch subscription (`gh api repos/{owner}/{repo}/subscription` is a 404), so an issue
filed and commented by `github-actions[bot]` reaches nobody until a human joins the thread.

Two things follow, and they point in opposite directions. The withheld-repeat work was still right
- it keeps a rolling issue readable, and it protects anyone who *does* subscribe - but it bought
this inbox nothing, so it is not where the remaining noise is. And the inbox is simpler than the
dashboard suggests: **every email in the window was a `ci_activity` `CheckSuite` thread**, which is
GitHub telling the owner that a run *they* triggered went red. There is no second source to chase.

### The classes

| Class | What it is | Emails | Verdict |
|---|---|---|---|
| **Real failure** | CI red on a branch (12) or on `main` (4); `nightly` red (2); `deploy-verify` red (1) | yes, once per run | correct - a person must act |
| **By-design alarm** | `nightly-drift` red while its rolling issue is open (1) | yes, once per firing, twice a day | correct; the repeat COMMENT is now withheld, the red is not |
| **Self-requested** | `workflow_dispatch` failing while somebody iterates on it (10) | yes | correct - the person who typed it asked for exactly this answer. It is not inbox noise; it is the reply |
| **Flake** | attempt 1 red, re-run green (5) | yes | red without an action. Only fixable by fixing the flake |
| **Superseded, mid-run** | branch push cancels its predecessor, `cancel-in-progress: true` (26) | **no** | deliberate - saves runner slots, tells nobody |
| **Superseded, never started** | `main` run cancelled while queued, `jobs: []` (3) | **no** | costs a per-commit verdict, nothing else - see the concurrency comment in `ci.yml` |
| **Exhausted** | a job killed at its own `timeout-minutes`, recorded as `cancelled` (4 of the 30 `main` runs to 2026-09-04) | **no** | no verdict, and NOT a fault. `main` sets `cancel-in-progress: false`, so a cancel there can only mean this. The gate says "ran out of time" and files nothing; the fix is to make the shards fit, and `docs/CI_STABILITY.md` §4 carries the measurement |

Two shapes that look like classes and are not. A **damaged** run (see "Ways a run reports
something other than its verdict" above) reports `failure` and emails like one, but carries no
verdict; check `jobs: []` before treating one as red. And a rolling alarm filed by a run on a
**feature branch** is a false alarm about `main`. That is where issue #38's seven identical comments
came from, and the guard is now on every alarm that speaks about `main`: `ci.yml`,
`configured-suite.yml` (since `13f057fa`), and `hosted-latency.yml` + `nightly.yml` (since
2026-08-30) all scope their file/update AND close steps to
`github.event_name == 'schedule' || github.ref == 'refs/heads/main'`. `nightly-drift.yml`,
`deploy-verify.yml` and `weekly-audit.yml` are unguarded on purpose - their alarms are about the
schedule, production and the repository, none of which a branch dispatch misstates
(`docs/CI_STABILITY.md` class 6).

### The last 48 hours, and which causes are now closed

**Measured 2026-08-24 20:00 to 2026-08-26 20:00 UTC**: 307 runs - 243 green, 35 cancelled, 25
failed, 4 still queued. The inbox holds **27 `CheckSuite` threads**, and they reconcile exactly:
25 failures plus the failed **attempt 1** of two runs a re-run turned green
(`claude/svg-vertical-growth`, `claude/configured-alarm-no-repeat`). None of the 35 cancelled runs
produced a thread, which is the 2026-08-25 finding holding at a larger sample.

Every emailed failure, by cause:

| Emails | Cause | Class | Status |
|---:|---|---|---|
| 8 | `configured-suite` dispatched over and over on `claude/configured-suite-no-service-role` (7) and once on `main`, while that branch removed the service-role key from the workflow | self-requested | **closed** - the branch landed; `configured-suite` has been green since, and `nightly-drift` confirmed the schedule firing again at 2026-08-26 20:03 |
| 12 | `CI` red on a feature branch - 4 with `Build` (typecheck + lint) red, the rest E2E shards | real failure, on the author's own push | correct by design; nothing to close |
| 3 | `CI` red on `main`, all E2E shards (2026-08-24 20:48, 08-25 07:20, 08-25 10:02) | real failure | **closed** - filed as #40, #42, #43 and each fixed the same day |
| 1 | `nightly-drift` red: the configured suite was not running on its schedule (2026-08-25 18:57) | by-design alarm | **closed** - #44, closed 2026-08-26 07:09 |
| 1 | `hosted-latency` red: the latency probe answered `42501 permission denied for table documents` (2026-08-26 03:37) | **misleading** - read as a hosted regression, was neither | **closed by this commit**; #45 was the open issue |

The `hosted-latency` one is the only entry that was not what it looked like, and it is worth the
detail because the obvious diagnosis was wrong twice over. The suspicion was staging schema drift:
0051 and 0052 had landed on production the day before, staging is kept current by hand, and the job
went red on the first scheduled run afterwards. Checked rather than assumed - both projects'
ledgers hold all 52 migrations and their `anon`/`authenticated` grant matrices are identical, so
**staging was not behind; it had just caught up.** The probe queried `public.documents` with only
the anon API key, which worked solely through the bootstrap grant 0052 deliberately revokes. Its
one healthy reading (~245 ms, run 32852705499) was taken while staging was still two migrations
behind. The probe now carries the signed-in JWT the job already mints, and the first run of the
fixed workflow was green for a reason rather than merely green: 35 passed, clean verdict, and a
real **~335 ms/request** off a query that returned a row (33009345645).

**That resets the latency baseline, and the step is not a slowdown.** ~245 ms was an anon request
with no JWT - no token verification, and the RLS predicate evaluated against no user. ~335 ms is a
signed-in read of a real row. The request changed, not the database. The workflow's step summary
says so on every run; compare only readings from 2026-08-26 onward, and do not draw the eventual
threshold across the join.

Read against the classes above, the standing shape of this inbox is: **~13 emails a day, all of
them `ci_activity`, and about half of them a person's own branch telling them their own push is
red.** The remaining reducible noise is flakes (2 in 48 hours) and repeated dispatches on a branch
being iterated - not issue traffic, which costs this account nothing.

### Reproducing the inventory

```bash
gh api --paginate "repos/{owner}/{repo}/actions/runs?created=>=<DATE>&per_page=100" \
  --jq '.workflow_runs[] | select(.conclusion != "success" and .conclusion != "skipped")
        | "\(.updated_at)\t\(.conclusion)\t\(.name)\tev=\(.event)\tbr=\(.head_branch)\tid=\(.id)"'
# then, per cancelled run, tell a mid-run cancel from one that never started:
gh api repos/{owner}/{repo}/actions/runs/<id>/jobs --jq '[.jobs[]] | length'
```

Three more, each of which changed a conclusion above rather than decorating it:

```bash
# WHY each thread was sent. If every reason is ci_activity there is no second source to chase.
gh api --paginate "notifications?all=true&per_page=100&since=<ISO>" \
  --jq '.[] | select(.repository.full_name=="{owner}/{repo}") | .reason' | sort | uniq -c

# Whether issue traffic can email this account at ALL. A 404 means no watch subscription, so a
# bot-filed rolling issue notifies nobody until a human replies to it.
gh api repos/{owner}/{repo}/subscription --jq '{subscribed,ignored,reason}'

# The threads a run list cannot show: attempt 1 of a run that a re-run turned green.
gh api --paginate "repos/{owner}/{repo}/actions/runs?created=>=<DATE>&per_page=100" \
  --jq '.workflow_runs[] | select(.run_attempt > 1)
        | "\(.created_at)\t\(.name)\tbr=\(.head_branch)\tfinal=\(.conclusion)"'
```
