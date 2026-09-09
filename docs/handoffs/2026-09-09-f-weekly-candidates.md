# F - the weekly review's candidate rows now reach a wave, or something says they did not

Branch `claude/f-weekly-candidates-reach-a-wave`, queued. Row F of the 2026-09-09 day wave, from
`docs/backlog/the-weekly-recap-reaches-no-wave-and-nothing-notices.md`, which this row resolves and
deletes.

## Reproduced first, from a linked worktree

`node scripts/alignment-answers.mjs`, run in this worktree before anything was changed:

```
No weekly owner session file in docs/handoffs/ - nothing to record.
{ "source": null, "open": [], "pending": [], "recorded": [] }
```

while `C:\claude\NoaCG-Studio\docs\handoffs\2026-09-08-orchestrator-week.local.md` existed, 12414
bytes, written 09:59 on 2026-09-08. That is the whole defect in two outputs: the file is there and
the reader says it is not.

## The directory fix

`.agent-workflows/orchestrator-week.md:162` writes the weekly file to the primary checkout by
absolute path and `.gitignore:237` keeps it out of git, so no linked worktree ever has a copy.
`alignmentState()` resolved `docs/handoffs/` under the checkout the script sits in, and
`orchestrator-home.mjs` pins every orchestrator session to `.claude/worktrees/orchestrator`. So the
refusal shipped on 2026-09-08 to replace somebody remembering ran, every morning, against an empty
folder.

`scripts/primary-checkout.mjs` is the new resolution: a linked worktree's `.git` is a pointer file,
two `dirname` calls off it give the common git directory, and its parent is the primary checkout.
No subprocess - this runs inside a plan check and a CLI, and `spawnSync('git')` costs more than the
question is worth. With no `.git` at all it answers the root it was asked about, so a test's
temporary directory and a tarball behave the same. The repo has three other resolutions of this
fact; the module's header says why each stays (`dev-port.mjs` normalises for the port registry and
sits on a hook that runs for every shell command, and the two orchestrator scripts already have a
git process in hand). New callers belong in the new module.

`weeklyDir()` in `alignment-answers.mjs` uses it. **The rulings side deliberately still reads the
current checkout**: `docs/OWNER_RULINGS.md` is tracked, and the branch that records a ruling has it
in its own working tree and nowhere else, so reading rulings from the primary checkout would keep
the refusal firing until the branch landed - the moment it is no longer needed. Two roots, one
comment saying so, one test pinning both halves.

**Proof from a linked worktree**, which is the only proof that counts here:

```
$ node scripts/alignment-answers.mjs                       # in .claude/worktrees/agent-a0f12e6d0e5ef90da
Alignment answers from docs/handoffs/2026-09-08-orchestrator-week.local.md
  (in C:\claude\NoaCG-Studio\docs\handoffs):
  Nothing open and nothing unrecorded.
```

Nothing open is honest: that review asked no alignment question (`grep -c ALIGN- ` returns 0), which
is why the file's `source` line rather than its verdict is the evidence. The repeatable version is
`scripts/alignment-answers.test.mjs`, "the weekly file is read from the primary checkout while the
rulings come from this one" - it builds a primary checkout with a `.git` directory and a linked
worktree with a `.git` pointer file, and asserts the read reaches across.

## The plan-check rule, and the test that pins both directions

`scripts/weekly-candidates.mjs` gives every candidate row an id, `WEEK-<the file's date>-<n>`,
counted over the file's `GOAL` lines in order. **No new syntax for the weekly workflow to remember,
and it works on files written before the check existed** - including the 2026-09-08 one that started
this. A plan owes each row one line under `## Weekly review`:

```
- planned: WEEK-2026-09-08-1 -> row F
- deferred: WEEK-2026-09-08-2 - the walk rewrite needs the route grouping first
- rejected: WEEK-2026-09-08-3 - landed on 2026-09-09 as claude/x-capability-reprobe
```

All three classes pass. A `planned` line must name a row the wave table actually has; a `deferred`
or `rejected` line must carry a reason. Silence fails. The window is the seven days after the
review, measured from the plan's own filename, so the reminder repeats while the review is current
and stops by itself - no expiry policy, and no cross-plan state to keep.

Both directions are pinned twice, at the unit level in `scripts/weekly-candidates.test.mjs`
("SILENCE FAILS and a refusal with a reason PASSES", plus "a refusal with no reason behind it is not
a refusal") and at the check level in `scripts/wave-plan-check.test.mjs`. And end to end against the
real files, from this worktree:

```
$ node scripts/weekly-candidates.mjs
weekly recap: 2026-09-08-orchestrator-week.local.md proposes 3 candidate row(s) ...
Against 2026-09-08-night-wave-plan.local.md:
  UNCLASSIFIED  WEEK-2026-09-08-1  the wave plan outlives its worktree
  UNCLASSIFIED  WEEK-2026-09-08-2  one walk covers a route, not an item
  UNCLASSIFIED  WEEK-2026-09-08-3  capability observations are re-probed on a clock
```

and with a copy of that plan carrying a `## Weekly review` section, the two classified rows pass and
the one deferred without a reason is the only thing still owed.

Three implementation calls worth arguing with. **Ids are POSITIONAL** - `WEEK-<date>-<n>` over the
file's GOAL lines - which means a review re-run on the same date that reorders a row moves every
later id, and a plan that already classified one would bind its reason to a different candidate. A
content hash would be immune and unreadable. I kept the positional form because the id is typed into
a plan by a person, because it says which week and which row at a glance, and because it matches the
one other id family here (`ALIGN-<date>-<n>`); what keeps the weakness visible is that every report
and every refusal prints the row's TITLE beside its id, so a moved reason reads as wrong the first
time anybody looks. The trade is written beside the code, not left to be rediscovered.

**Every `GOAL` line in the file counts**, not only
those under an "Improve" heading: anchoring on the heading would be more precise and would fail
silently the first time a session numbered or renamed the section, and a silent miss is the defect
this whole row exists to end. A false positive costs a plan one sentence; a false negative costs a
row. And **the heading is `## Weekly review`, not `## Weekly candidates`**, because
`scripts/candidates.mjs:44` opens the night refill loop's table at the first heading containing
"candidates" - a section named that way would have swallowed the loop's list and left it with
nothing to launch. That is written in the comment beside the regex.

## The drain filter: it stays, and the new rule covers it

The backlog item called dropping `handoff-drain.mjs`'s `.local.md` filter "the cheaper half, worth
doing whether or not the check lands". I decided against it, and wrote the reason into the code.

The drain's four classes are a question about **deleting** a file - consumed, spent and owner files
are deleted by exactly one wave row. The two `.local.md` files on this machine are the only ones
nothing may delete: the weekly recap is overwritten weekly by a routine and is the record the review
reads back, and a wave plan is the only copy of a wave's routing. Listing them would ask a planner a
deletion question about files that are not his to delete, and a plausible `spent` would destroy the
routine's own record. Meanwhile the obligation the recap really carries - whether its rows reached a
wave - is a different question, and one line cannot answer both. So: one file, one question, in the
place that asks it.

## The absent-file case, which is the judgement I was asked for

**It passes, and it is never silent.** The plan check prints one line on every run, green or red,
naming the directory it searched and what it found there:

```
weekly recap: nothing owed - no <date>-orchestrator-week.local.md in C:\...\docs\handoffs (searched ...)
weekly recap: 2026-09-08-orchestrator-week.local.md proposes 3 candidate row(s) ...
```

Refusing a plan over a gitignored, per-machine file is not an option: on any other checkout that is
a refusal for a reason the person cannot inspect. But a silent pass is exactly how this class of
thing rots, and this repository has the receipt - the alignment refusal returned `{ source: null }`
for a week and printed the same sentence it prints when there is genuinely nothing to record. The
line in the middle is the one thing that separates them. `alignment-answers.mjs` now prints the
directory too, for the same reason.

**What it costs.** One more line of output on every plan check, including clean ones, which is real
noise in a place that is read fast. And it buys less than it looks like: the line proves which
folder was searched, not that the folder was the right one. If the weekly file ever moves again, the
line will confidently name the wrong directory - it just names it out loud, which is the difference
between a five-minute fix and another week. I would take the same trade again, and I would not
extend it to a refusal.

The alternative I rejected: refusing when the file is absent AND this machine has one somewhere.
That is a cleverer rule with a worse failure mode - it would fire on a machine whose layout differs
from this one, over a file that is not in git, and no reading of the repository would explain why.

## What is left

- The wrapped-answer truncation in the same file is still open and is not mine:
  `docs/backlog/a-wrapped-owner-answer-is-recorded-truncated.md`. Its line citations into
  `alignment-answers.mjs` moved when this landed and I updated them in the same commit.
- No `docs/acceptance/owner-queue/` file. Nothing here is observable in the product - it is a gate
  and two CLIs. `npm run weekly:candidates` is the route for anyone who wants to see it work.
- The next `/orchestrator` will be refused until its plan says something about
  `WEEK-2026-09-08-1..3`. Two of the three have in fact landed since (rows W and X on 2026-09-09),
  so the honest lines are two rejections naming those branches and one decision about the third.
  **That refusal is the row working, not a regression.**

## What `/check` found, and what it changed

**review: delegated** (code-review, `high`, scope-checked against this branch and merge-base
`18bc401b`). Seven findings, six fixed, one accepted with the reason written beside the code.

The one that mattered was in the new resolver. It took two `dirname`s off any `gitdir:` pointer, and
a `--separate-git-dir` clone and a submodule carry the same pointer while its target IS the
repository's git directory - so both would have resolved two levels above the truth and reported "no
weekly file" from a folder that never held one, which is the failure the module exists to prevent
wearing a hat. Git writes a `commondir` file inside a linked worktree's admin directory and nowhere
else, so reading it tells the shapes apart exactly. `scripts/primary-checkout.test.mjs` now pins all
five: a directory `.git`, a linked worktree, a relative pointer, a pointer with no `commondir`, and
no `.git` at all. The two test helpers gained the `commondir` file, which also makes them faithful
to what git actually creates rather than to what my parser happened to accept.

Also fixed: `--plan` with no argument resolved to the repo root and died with an EISDIR stack trace;
an undated plan bypassed the window and made every row mandatory; a review outside the window
printed every row as `UNCLASSIFIED` under a closing line saying everything was accounted for. And
the contract regained the `## Weekly review` heading in the core's list of sections the check reads
by name - I had cut it to fit the budget, and the reviewer was right that a planner writing a plan
from the contract would then be refused for a section nothing told them to write. It fits now
because the same clause names the two scripts instead of restating the classes their refusals
already spell out.

Accepted, not fixed: the positional-id weakness above.

**Reported, not fixed - a pre-existing bug outside this diff.** `scripts/dev-port.mjs`'s own
`gitCommonDir()` has exactly the two-`dirname` shape the review found in mine, so on a
`--separate-git-dir` clone the port registry would be written outside the repository. Nothing on
this machine is such a clone, so nothing is broken today. It belongs in its own change, and its own
change should probably delete the copy in favour of `scripts/primary-checkout.mjs`.

**simplify: inline.** The skill returned fan-out instructions rather than a result, so per
`check.md`'s four-branch rule the leg ran here. Four angles, four fixes: a redundant ternary before
an early return, an unreachable fallback string in `summaryLine`, a nested ternary flattened to
if/else, and `alignmentState` resolving the primary checkout once per call instead of once per file.
Reuse considered and declined twice, both noted in the code: `daysSince` from `owner-receipts.mjs`
clamps at zero and so cannot say that a review is NEWER than the plan reading it, and a shared
"classified section" parser for `## Handoffs` and `## Weekly review` would take three regex
parameters to save twelve lines, which is the clever form rather than the obvious one.

**taste: not applicable.** Nothing here can move what a graphic looks like - it is a path resolver,
a gate and two CLIs.

## Verification

- `npm run build > log 2>&1; echo $?` -> `0`, run twice: before `/check` (1425 tests) and after
  (1433 tests, 1432 passed, 0 failed, 1 pre-existing skip). Every new test ran inside the build.
- `npm run test:e2e:affected` not run and not required: no product code changed. The diff is
  `scripts/`, `docs/`, `.agent-workflows/` and one `package.json` line.
- `node scripts/check-shared-instructions.mjs` -> core 199/200, common path **640/640**. The always
  loaded orchestrator path was at exactly its ceiling before this branch and is at exactly its
  ceiling after: the contract change is net zero lines, paid for by replacing the prose obligation
  ("the weekly file's candidate rows are frontier input") with the command that counts it. The rule
  itself lives in a script, which is the whole argument of the backlog item it came from.
- `node scripts/gates.mjs audit` -> OK, 35 checks and 110 test files.
- check: run. `review: delegated`, `simplify: inline`, `verify: inline`, verdict pass; the stamp is
  at `<git-common-dir>/noacg-jobs/checks/claude-f-weekly-candidates-reach-a-wave.json`.
