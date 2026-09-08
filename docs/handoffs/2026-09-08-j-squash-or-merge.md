# Session J - squash, or the merge commit we have

**Branch:** `claude/j-squash-or-merge`, two commits on `b119dbdd`. Reviewed sha `8c2898ea`,
stamped, queued. Three files: `scripts/landing-ruleset.mjs`, its test, and
`.agent-workflows/queue-merge.md`.

## The decision

**The merge commit stays. The written reason was wrong and has been replaced.**

Nothing was applied to GitHub, and **no apply command is owed**: the live ruleset already holds
`merge_method: MERGE`, so this branch changes only the argument, the test that pins it, and the
document a session reads. `npm run land:ruleset` now says so in one line, and confirms it against
ruleset 22389043 as of tonight.

## The argument

### The reason that was there is false

`scripts/landing-ruleset.mjs:41` said "a merge commit keeps every landed commit as it was verified;
squashing would rewrite what CI saw". The queue re-runs `ci.yml` on the merge group - every landing
tonight has a `merge_group` run on `gh-readonly-queue/main/pr-N-<sha>`, checked with
`gh run list --workflow ci.yml`. So `CI gate` judges the TREE of a temporary merge of `main` and the
queued pull requests. Squash and merge both land exactly that tree; squash discards commit objects,
not bytes. The risk the comment described does not exist.

### The fork-point planner does not decide this, and I measured it

The row expected `scripts/e2e-affected.mjs` to be the piece that changes meaning under squash. It is
not. I built the same history twice - landed once with merge commits, once with squashes - and ran
the real exported `integrationBase`, `branchBase` and `changedFilesSince` against both:

| | merge | squash |
| --- | --- | --- |
| `integrationBase` equals the true fork point | yes | yes |
| files planned after taking `main` in | `src/c.ts`, `src/mine.ts`, `src/mine2.ts`, `src/mine3.ts` | identical |
| branch cut from a landing that merged nothing | `null`, plans its own file only | identical |

Under merge, the stop-line at `e2e-affected.mjs:1163` ("a merge already on main is not this
branch's integration") is what stops the walk inheriting somebody else's fork point - the
run-32301201748 failure. Under squash that line never fires, because `main` carries no merge commits
to trip over, so the walk returns `null` for the same reason and gets the same answer. The planner
would be marginally SIMPLER under squash. It is not an argument either way.

The experiment is at
`C:\Users\ahonemi\AppData\Local\Temp\claude\C--claude-NoaCG-Studio--claude-worktrees-noacg-pro-harness-continue-3583ad\989f5107-aed9-4721-a6ff-4189765ba059\scratchpad\forkpoint-experiment.mjs`
(scratch, not committed - it imports the real modules by absolute path).

### What actually decides it: four scripts define "landed" as commit containment

Only a merge commit makes a branch's commits reachable from `main`. Under squash they never are,
and the tree-equality fallback stops matching the moment the next landing moves `main` - which in a
wave is minutes.

| script | what it reads | under MERGE | under SQUASH |
| --- | --- | --- | --- |
| `cleanup-worktrees.mjs:268` `containedIn` | `rev-list --count <branch> --not origin/main` | 0 after landing, so the worktree and branch are reclaimed | never 0; `possiblySquashMerged` (`git diff --quiet origin/main <branch>`) also misses once main moves, so every landed branch goes to a report-only pile and **no worktree is ever reclaimed** - about a gigabyte each, on a RAM- and disk-bound laptop |
| `jobs.mjs:771` and `:1308` | `rev-list --count origin/main..<ref>` | landed branches vanish from `npm run jobs` | every landed branch reads as ahead of main forever, so the tick fills with finished work; `queue-merge.md` leans on this directly ("a landing that SUCCEEDED makes its branch vanish from this listing") |
| `merge-order.mjs:141` and `:352` | `rev-list --count main..<branch>`, and `merge-base --is-ancestor a b` for `markStacked` | a landed parent leaves the ranking and its hold lifts | landed branches stay ranked and impose conflicts on live ones, and a stacked child is held by a parent that already landed - **the 2026-09-08 drop shape** |
| `worktree-activity.mjs:98,139,145` | `<landedRef>..<branch>`, `branch --no-merged <landedRef>` | a session's landed work stops counting | it counts forever |

Which ref differs: the first two resolve `origin/main`, `merge-order` still counts against the local
`main`. The argument holds for either, because both only advance by ancestry.

That last row is the one that matters most. `docs/backlog/a-stacked-branch-queues-its-parents-commits.md`
designs the fix for the worst live landing bug as a stacked pull request whose base is the parent:
the queue lands the parent, GitHub retargets the child, the child re-runs. Under squash the retarget
happens and `markStacked` still says "contains `<parent>`", so the designed fix has no way to signal
that it completed.

### What squash would have bought, honestly

Two real things. `revert-landing.mjs` would emit `git revert <sha>` instead of `git revert -m 1
<sha>` - reverting a merge is the git footgun where re-landing afterwards needs the revert reverted
first. And the owner's "agent fixup commits not surviving forever" is exactly what squash buys.

Neither pays for the table above, and the second is largely already had: `git log --first-parent`
shows one line per landing, which is what `revert-landing.mjs`, `deploy-affecting-paths.mjs` and
`red-main-issue.mjs` all read. The first is bounded - `batchCommits` reads `parents.length > 1` off
the actual commit, so it already handles both shapes and needs no change either way.

One script does break under squash and it is not in the row's list:
`scripts/metrics/conflict-trace.mjs:38` reads `git log --merges --cc origin/main` to count how often
a landing needed a conflict resolved. It sees the sessions' own integration merges, which reach main
only inside a landed branch's history. Under squash it would silently report zero conflicts forever.

## The landing path is simpler by one thing

`npm run land:ruleset` now **answers its own question**. It used to print the ruleset's id and then
dump the wanted JSON, leaving a person to compare two structures by eye - and the summary it printed
came from the list endpoint, which carries no `rules` at all, so the merge method was never on
screen to compare against. It now reads the detail endpoint and prints either one line ("GitHub
matches this file on every field it sets") or a named line per difference, exits non-zero on drift,
and prints the JSON payload for a manual `PUT` when there is any.

The comparison is generic over everything `desiredRuleset` sets rather than a list of interesting
fields, and sorts lists first. Both were review findings on my own first draft, and both were real:
the eight-field version reported a clean match while the ref exclude list, the target, the check
timeout, both batch sizes and the strict policy all differed, and the unsorted version reported
drift on a correct ruleset that GitHub returned in another order.

## What I got wrong, and what caught it

My first commit added `scripts/landing-ruleset.test.mjs` to `test:landing-gates`, claiming the test
ran nowhere. **It already ran.** `scripts/gates.mjs` globs `scripts/**/*.test.mjs` and runs it in
the build tier, so it has gated every `npm run build` since the file existed - my grep looked for
the filename in `package.json` and the workflows and missed a runtime glob. The second commit
reverts that and says so in the test's header, because that hand-written list is what the glob
exists to keep short. `/check`'s delegated review found it; I would not have.

## Deferred, with the shape of the fix

- **`owner-preflight.mjs` cannot see the merge method** (`gather()`, lines 124-137). It does the
  same list -> find-by-name -> detail walk, hardcodes the ruleset name and the two check contexts
  that `landing-ruleset.mjs` already exports, and checks `enforcement` and `merge_queue`'s presence
  but never `merge_method`. So if GitHub is flipped to SQUASH, `npm run check:owner-setup` reports
  OK while `npm run land:ruleset` reports DRIFT - two checkers over one state that can disagree. The
  fix is one import: have `owner-preflight` call `rulesetFacts`/`rulesetDrift` and add a
  `merge-method` fact. **Not done tonight because `owner-preflight.mjs` is gate-shaped and row F is
  sweeping gate-shaped scripts** - a collision costs the wave more than the fix is worth.
- **Nothing schedules `land:ruleset`.** It exits non-zero on drift now, so it can be consumed, but
  no workflow, routine or gate runs it. A weekly routine is the natural home (the freshness rule
  says drive by TIME, not by commit).
- **A rule worth recording with `npm run learn`**: a test file in no hand-written runner is not
  evidence it does not run - check the glob-based discovery first. Left undone deliberately: `learn`
  regenerates the compiled `.claude/rules/` files that every session's chain loads, and the
  `landing/generated-file-merges-cleanly-still-comes` trap is about exactly that file class merging
  wrong mid-wave.

## Pointers

- The argument lives on the `merge_method` parameter, `scripts/landing-ruleset.mjs:39-66`. The
  document points at it and deliberately does not restate it.
- `.agent-workflows/queue-merge.md` section 3 says the question is settled, what it costs a session
  (fixup commits stay; a revert needs `-m 1`), and that `land:ruleset` checks GitHub still agrees.
- `docs/AGENT_WORKFLOWS.md` needed no change - it covers permissions and workflow mechanics and
  says nothing about the merge method. `docs/BRANCHING_AND_LANDING.md`'s "Nothing but the queue
  writes `main`" bullet is the one other place a sentence would fit, left alone for the same
  collision reason as `owner-preflight`.
