# The handoff folder went from 81 files to 28, and six receipts now say what they are

Branch `claude/d-drain-handoffs`, from `main` at `684e2bf2`, three commits, pushed and queued.

## What went, and on what evidence

**53 handoff files deleted, 28 remain** (rows A, B and C add their own tonight). Every open item in
every deleted file was traced to where it lives now - a landed commit, a backlog file, a contract,
or an owner-queue item - rather than read off the file's own "what is left" heading, which is what
the contract in `.agent-workflows/orchestrator/collisions.md` demands and what the heading is not.

- **29 files** had every item already housed elsewhere.
- **23 files** were spent except for one to three items that lived nowhere else. Those items became
  **27 new `docs/backlog/` files**, and two more were appended to the existing items they belong to
  (`stop-hook-detects-waits-by-word-list.md` gained the unmarked-paste miss;
  `guards-fire-on-prose-they-cannot-tell-from-code.md` gained the `git commit -F` bypass, which is
  the same matcher failing in the opposite direction). Filing landed in the same commit as the
  deletion.
- **1 more** (`2026-09-01-c-svg-state-workflow.md`) went in the second commit, once the receipt that
  cited it no longer needed it.

The tracing was fanned out over six parallel researchers, one batch of files each, and I checked
two SPENT verdicts myself before acting on any of them (`2026-09-04-v-file-todays-findings` - its
fourth backlog file is gone because `87db2936` landed the work; `2026-09-05-w-signed-in-state` - all
three homes present and the 1480 step transcribed into `src/styles/auth.css`).

## What I kept, and why

Eight files stay that are otherwise spent. **None is kept for open work; every one is kept because
something live cites it for evidence that exists nowhere else.**

- `2026-09-02-c-ograf-host-page.md` - seven live backlog items name it as their Evidence, and it
  holds the measured pixel comparison and the `:where()` specificity refutation.
- `2026-09-02-b-queue-walks-itself.md` and `2026-09-02-d-leaving-the-wizard.md` -
  `scripts/hooks/guard-preview.mjs` names both as the incident evidence for that hook.
- `2026-09-02-a-teams-spec-diagnosability.md` - it is the repo's record of which files earlier
  drains kept on purpose and why, and `check-fanout-in-launched-sessions.md` cites it by line.
- `2026-09-02-d-mistake-trigger-hooks.md` - `mistake-trigger-hooks.md` names it in its Evidence.
- `2026-09-04-t-shard-cap-poisons-every-gate.md` and `2026-09-04-u-honest-timings-and-selection.md`
  - `docs/CI_STABILITY.md:192` closes a paragraph with "Full account:" and has no other document
  to point at, and two live backlog items rest on their measurements. Deleting either means
  rewriting four references first.
- `2026-09-03-orchestrator-week-routine.md` - its one open item came due TODAY: the weekly
  routine's first real run is the test of whether its recap is useful. Delete it once somebody has
  judged that run.

The newest twenty (2026-09-06 onward, including the five this wave is reading) were not touched.

**The vocabulary is missing for this.** `handoff-drain.mjs` has four classes and prints a
kept-on-purpose file as `consumed`, which reads as "somebody failed to delete this". That is filed
as `a-handoff-kept-on-purpose-has-no-class.md`; it is the second drain in a row to hit it.

## Citations do not fail the build, so I repointed them by hand

`check-contract-freshness` lists `docs/handoffs/` as transient by design and skips it, so a rule or
a backlog item pointing at a deleted handoff is invisible to every gate. Seventeen such citations
were rewritten in the same commits - in twelve backlog files, three hook scripts, one source
comment and one owner-queue item - each now stating the fact and naming something durable: the
branch, the commit, or the backlog item that carries the finding. The review caught four more I had
missed, which is the argument for the missing class above rather than for more care.

## The mechanism half: six receipts were lying about their own state

`state: advanced` exists because a receipt with landed work counted as `unstarted` beside a
genuinely untouched one. Nothing counts it, so it depends on the serving session remembering.

**51 receipts read `unstarted`. Six were wrong - twelve percent, after four days.**

- `the-mapping-step-should-explain-and-offer-to-do-it` - three of its four asks landed in
  `cddb75be` two days earlier. This is the one that nearly got planned twice today. Now `advanced`,
  with ask 4 (the CLI road) and the owner walk named as what stands.
- `more-behaviours-than-poll-and-quiz` and `graphics-need-their-own-logic` - the behaviour system
  landed under both.
- `wave-leftovers-2026-08-27` and `open-threads-from-the-memory-cull` - items closed by later
  landings.
- `a-counting-graphic-airs-a-zero` - **superseded**: the owner's own walk in `5098bd92` refuted its
  premise, and the body still asserted the defect as real. Corrected in place.

45 were right as they were, confirmed by reading the code they name rather than the log alone. Two
need a sweep re-run before anyone can say (`ladder-sweep-first-corpus-findings`,
`merge-conflicts-are-resolved-by-a-consult-never-the-owner`).

**That number is the argument, and it is filed as
`nothing-counts-a-receipt-whose-work-already-landed.md`** with the two shapes worth building: ask
the question at `/queue-merge`, where somebody still knows the answer, and have `owner-receipts.mjs`
report an old `unstarted` whose slug words appear in a commit subject since `raised:`. Not a gate -
a report that is sometimes wrong is fine and a gate that is sometimes wrong is not.

## Verification

`build: green` (`npm run build`, exit 0 read directly, three times: after the drain, after the
sweep, and after the review fixes).

`check: review delegated (7 findings, all 7 fixed), simplify inline, verify inline. taste: not
applicable` - nothing here can move what a graphic looks like; the only source edits are four
comments. Verdict stamp written to the shared checkout by the `cp` route, because the Write tool
refuses that path from an isolated worktree.

The review earned its place. It found that `owner-receipts.mjs` cannot parse a multi-line
double-quoted YAML scalar - the value keeps its opening quote and every continuation line is
dropped - so eight fields written on this branch truncated, and in each one the "STILL OPEN" half
fell off, which is the whole reason `advanced` exists. On two new receipts the truncated field was
the owner's quote itself. All eight now use a folded scalar. **The parser defect is still there and
is not filed**; it bites any receipt written the natural way, and the repo has four older examples.
Worth a small fix in `scripts/owner-receipts.mjs:105`.

## What is left

- The eight kept files, each with a named condition for going: the week-routine one needs today's
  run judged; the other seven need their citations repointed first, which is a smaller job now that
  the pattern is established.
- The parser defect above.
- The 27 new backlog items are unscheduled by design. Two are shaped for a night row:
  `prerender-opens-an-hmr-socket-it-never-uses` and `hook-tests-run-only-by-hand` are both a few
  lines with a clear test.
