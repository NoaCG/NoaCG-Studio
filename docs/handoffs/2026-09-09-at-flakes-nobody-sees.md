# Row AT - the flakes nobody can see, and the tool that says "unknown"

**Branch:** `claude/at-flakes-nobody-sees`, queued. **Gate:** `npm run build` green on the final
state (exit code read directly, 110 test files, 1531 tests). CI run 34415175269 on `69207246` green,
and run 34416798882 on the tip `313a60e0` - **read its verdict before trusting this file's claim of
green.** In both, the E2E shards are SKIPPED by CI's own plan job because no product code changed,
so a green run here means Build, Factory gates, E2E plan and CI gate, and nothing about the suite.
**check: run in full** - `review: discarded+inline` (both scopes below), `simplify: inline`,
`verify: inline`, `taste: not applicable` - nothing here can move what a graphic looks like.
No e2e was run: the row forbade it, the machine is RAM-bound, and no product code changed.

## The decision the row asked for in writing, before anything was built

**Why a report and not a detector.** The quarantine admits a spec on a fail-then-pass receipt on the
same commit, and that receipt is proof about the CODE: the same tree produced both answers, so
something other than the tree decided the outcome. Cross-commit evidence cannot say that. "Failed on
four commits across four branches" is exactly as consistent with one real defect that four branches
independently tripped over as it is with a flake - and the 2026-09-08 measurement is the case in
point, since one of `import-svg`'s four failures was on `main` itself. Auto-quarantining on evidence
that weak buys a quiet week and pays for it invisibly: a quarantined spec leaves the blocking plan,
stops testing the thing it was written for, and comes back only after twenty consecutive passes that
nobody is waiting for. Nothing in the repo would report that the coverage had gone. So the
instrument reports and a person decides, and the report says so in its own text (there is a test
that fails if that sentence disappears, because the sentence is the design). The other two options
lost for concrete reasons rather than taste. **An observation file recording every red spec with its
sha** would put a second copy of GitHub's own history in the repo, written by a workflow on every
red, on a generated file that the landing traps already say merges cleanly and comes out wrong - and
the data is queryable from the API without it. **An admission in the doc** costs nothing and does
nothing: the by-hand recipe already sat in `docs/CI_STABILITY.md` and nobody ran it, which is the
whole finding.

**The two counting rules are where the judgement actually is.** Distinct commits, never runs - two
runs of one commit are a re-run, which is the quarantine's shape and not this one's. And two LINES
OF WORK, not two failures: `wizard-filters` failed three times on three commits of one branch in the
measured window, which is a branch failing its own tests in front of its own owner, while
`import-svg` crossed four branches that no single owner could see. Main counts as a line of work of
its own, because two reds on two commits of main are two independent landings with one symptom -
without that clause the strongest shape there is would be dropped for having one branch name.

## What landed, in four commits

1. **`ci-failure-set.mjs` names the repository from the checkout** - environment, then `gh repo
   view`, then the `origin` remote (which answers when `gh auth` has expired). `fetchFailureSet`'s
   signature is untouched, so every workflow caller is byte-for-byte as it was; only the CLI
   resolves. And every empty answer now carries a `reason`, so `no run id`, `no repository`, `GitHub
   listed no jobs`, `ran out of clock`, `only the derived gate failed` and `nothing failed` stopped
   being one sentence. A green run used to say "something this gate could not name".
2. **The configured suite annotates its failing specs.** This was not in the row's plan and it is
   the most valuable thing here after item 1 - see the next section.
3. **`scripts/ci-repeat-failures.mjs`**, the instrument, plus its tests, wired into
   `weekly-audit.yml` (report only, its own 6-minute timeout, `continue-on-error`) and pointed at
   from `docs/CI_STABILITY.md`. Both backlog files deleted.
4. **The pre-merge review's findings**, all five fixed - listed under "review" below.

## The row's step-2 acceptance could not be met as written, and why that turned out to matter

The row said: verify against run 34407579629, "it must name production-links.spec.ts". With the
repository resolved, that run answers `job: Configured E2E (authenticated, local Supabase)`. Not
`unknown` - but not the spec either, and **no amount of work on `ci-failure-set.mjs` could have made
it the spec.** The reason is one level up: `configured-suite.yml` runs Playwright with
`--reporter=list,json`, so the `github` reporter never runs, and the job's only annotations are
GitHub's `.github` placeholder and the line `0 failed, 1 flaky.` The failing spec existed only
inside the `configured-report` artifact.

**Adding Playwright's `github` reporter would not have fixed it either**, which is the part worth
carrying forward: a FLAKY test is `ok()` to that reporter, and this suite counts flaky as red on
purpose, so the exact case that made the row would still have produced no annotation. So
`scripts/configured-verdict.mjs` - which already reads the report and already knows which specs were
unclean - emits one `::error file=<spec>` per genuinely failed spec itself.

**The measurement that says this mattered more than the row knew.** The new report, run over the
seven days to 2026-09-09, put `job: Configured E2E (authenticated, local Supabase)` at the top of
its jobs section with **seven reds on seven distinct commits of `main`**, not one of them naming a
spec. That is the largest single source of unexplained red in the repo, it was structurally
un-nameable, and it will be nameable from the next configured red onwards.

**Re-derived rather than assumed:** the artifact from run 34407579629 was downloaded and fed through
the changed script, which emits
`::error file=e2e/configured/production-links.spec.ts,line=20,...` - and a test feeds that exact
annotation shape through `failureSet` to show the run would then have named the spec. Nothing here
was checked by re-reading the code.

## Traps and evidence that exist in no other repo file

- **The row's own verification target is a trap for the next reader.** `production-links.spec.ts:20`
  failed by TIMING OUT at 180s and then passed in 8.7s on retry #1. A three-minute hang followed by
  an eight-second pass is not an ordinary flake shape, and it is candidate AU's to understand. This
  row did not touch it and deliberately did not quarantine it.
- **A delegated code review mis-scoped itself for the fourth time here, in the same direction.** It
  reported reading 79 files and ~4.9k insertions against `main`; this branch's diff is 11 files
  against merge base `fe3e08c0`. It reviewed `cli/src/**`, `scripts/worktree-cleanup-lib.mjs` and
  `scripts/codex-rescue.mjs`, none of which this branch touches. The pass was discarded as a review
  of this branch and redone inline - **but three of its findings named files that ARE in this diff
  and two of those were real and high-severity**, so the discard rule was applied to the pass, not to
  the facts: each claim was verified against the code before being fixed. Discarding the findings
  unread would have shipped both holes.
- **One finding belongs to somebody else and was not acted on here:**
  `scripts/worktree-cleanup-lib.mjs:76` - `busy` is true only on exit code exactly `3`, so a reaper
  killed by its own 30s timeout (`status === null`) reads as not-busy and the caller goes on to
  `git worktree remove` a live session's directory. That file is not this branch's; whoever owns it
  should look, and "I could not find out" should be treated as busy.
- **`npm run build` ran a STALE test-file list twice in a row on this machine.** Two consecutive
  builds reported `node --test over 109 file(s)` while a newly created `scripts/*.test.mjs` existed
  on disk and `node scripts/gates.mjs list --gate build` reported 110 including it, at the same
  moment. A third build picked it up with no intervening change. There is no cache in `gates.mjs` -
  it is a plain `globSync` - so this looks like a Windows directory-cache artifact. **Confirm a new
  test file ran by NAME, not by the count**, and grep the build log with `grep -a`: these logs
  contain bytes that make grep treat them as binary, and a plain `grep -c` then prints "Binary file
  matches" and answers 0, which reads exactly like "your test did not run".
- **Git Bash mangles a POSIX path in an env value.** `GITHUB_WORKSPACE=/home/runner/... node ...`
  arrives inside node as `C:/Program Files/Git/home/runner/...`. This silently defeated the first
  attempt to re-derive the annotation path; `MSYS_NO_PATHCONV=1 MSYS2_ENV_CONV_EXCL='*'` fixes it.
  Anything that reproduces a Linux runner's environment locally will hit this.
- **The instrument's own blind spot, stated in its header:** a run whose failed jobs were re-run to
  green has conclusion `success`, so a `status=failure` sweep cannot see it.
  `docs/CI_STABILITY.md` measured the same hole in the by-hand version - four of six occurrences
  behind its own relay row live in runs that finished green. That shape is the quarantine's, so the
  two instruments are blind in opposite directions on purpose.

## What is left

- **Nobody has read a Monday report yet.** `weekly-audit.yml` runs at 06:00 UTC Monday; the first
  real one is 2026-09-15. Until then the only evidence the wiring works is that the script produces
  the right answer by hand. Worth one `workflow_dispatch` from `main` after this lands to see the
  step summary render, which also proves `checks: read` is sufficient - that permission is the one
  thing in this change that cannot be tested from a laptop.
- **`scripts/red-main-issue.mjs` does not pass `reason` through.** The rolling red-main issue the
  owner actually reads still says "something this gate could not name" where it could now say which
  emptiness it was. Left alone deliberately: it is outside this diff, its bodies are pinned by
  `scripts/red-main-issue.test.mjs`, and `planRedMainComment` already handles `exhausted` separately
  so the alarm is not blind today. It is a small, obvious next change.
- **`docs/backlog/the-configured-suite-has-no-quarantine.md` is now unblocked** and says so in its
  own text. It wanted the admission rule settled before deciding what a non-blocking tier carries;
  it is settled (same-sha stays the only admission, cross-commit is a report), and that tier can now
  name its specs, which anything built there needs.

## Pointers

- `scripts/ci-repeat-failures.mjs` - the instrument; its header carries the decision and the blind
  spot. `node scripts/ci-repeat-failures.mjs --since 2026-09-04 --until 2026-09-08 --workflows
  ci.yml` re-derives the measurement that motivated it: it names `import-svg.spec.ts` with four
  commits and does not name `wizard-filters.spec.ts`.
- `scripts/ci-failure-set.mjs` - `resolveRepo`, `WHY_EMPTY`, and `emptyReason` for the ordering rule
  (exhausted is tested before the derived gate, because a run out of clock usually has both).
- `scripts/configured-verdict.mjs` - `repoRelative` and the `reallyFailed` predicate, which is
  narrower than `isUnclean` on purpose.
- `docs/CI_STABILITY.md`, "Reproducing this" - the script now leads that section, with the by-hand
  recipe kept for what it cannot see.
