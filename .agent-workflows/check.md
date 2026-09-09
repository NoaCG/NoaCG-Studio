# check - review, simplify, then verify the current branch

Shared canonical procedure for the `check` workflow - invoked as `/check` in Claude Code,
`$check` in Codex.

One command that runs the pre-merge quality chain over the work on the current feature branch:
a bug-hunting code review, a behavior-preserving simplification pass, and the repo's
verification gate. The order and the single verification run at the end are deliberate:
review comes before simplify so the pass doesn't polish code a bug fix is about to rewrite,
and the build/e2e gate runs once over the final state instead of after every phase.

An optional argument narrows the focus (a path, an area, a concern); with no argument the
scope is the whole branch diff.

**This workflow runs anywhere the work does**, including inside a session that was launched by
another session and so must not spawn background subagents of its own. The line that matters is
not "does this delegate" but **where the result comes back**: a BLOCKING delegation that hands
its result straight back in the tool result is fine everywhere, because nothing has to be waited
on; a BACKGROUND fan-out is not, because its completion notification goes to whoever is inside a turn
when it fires - and a session that has fanned out has nothing left to do but end its turn, so the
report lands in that session's LAUNCHER instead (re-measured 2026-09-09 on 2.1.263 - see phase 2).
So no phase here requires a fan-out - every one has a path
that completes in one context, and phase 5 says out loud which path each leg took. A gate that
cannot run where the work happens is not a gate.

This workflow edits the working tree of the current feature branch and nothing else. It never
merges, pushes, or touches `main` in any way - if invoked while sitting on `main`, branch
first before changing anything, exactly as the repo's Git rules require.

## 1. Scope - computed once, by one command

- **`node scripts/review-request.mjs`.** It fetches, takes the merge base against `origin/main`,
  and prints the branch, that base sha and every file this branch changed, committed and
  uncommitted. All three phases work from that one set; do not review or simplify code the branch
  did not touch. Read the changed code itself IN THIS WORKTREE with
  `git diff $(git merge-base origin/main HEAD)`, which diffs the merge base against the WORKING
  TREE, so uncommitted content is in what you read.
- **The base and the file list are never yours to recompute.** The script binds its git to the
  worktree that CONTAINS it rather than to the caller's directory, and takes the base from
  `origin/main` rather than the local `main` branch the merge queue no longer moves - and it
  refuses outright rather than falling back to a ref that is neither. Those two mistakes cost ten
  delegated review passes between 2026-08-29 and 2026-09-09, every one discarded and redone by
  hand; `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` itemises them.
- If it reports nothing to review, report "nothing to check" and stop.
- Before editing, read the nested `AGENTS.md` contracts covering the touched areas - review
  findings are judged against them, and a "simplification" that violates one is a bug.

## 2. Review - bugs first

Goal: find and fix real defects in the changed code before polishing it.

- Run the tool's dedicated code-review capability (Claude Code: the code-review skill; Codex: its
  review mode), invoked with **exactly what `scripts/review-request.mjs` printed** - the file list
  and the base sha, never the branch name alone. A branch name is not a scope; it is an instruction
  to go and derive one, and the delegate derives it from the local ref this machine stopped moving.
  Measured 2026-09-09 on a branch that had changed one file: the two bases answered 1 file and 72.
  The request carries the level and what to do on disagreement too, so nothing is left to compose.
- **A DELEGATED PASS COUNTS ONLY IF ITS RESULT COMES BACK INTO THIS CONVERSATION.** Invoke the
  capability, then decide from *what came back*, not from what kind of session you think you
  are in. **Findings, or an explicit clean result, mean the pass ran**: scope-check it (next
  bullet), act on it, mode `delegated`. **Anything else means it did NOT run** - do the leg
  yourself, here, over the angles below, mode `inline`. The three shapes to expect:
  - **Instructions telling you to fan out into background agents and wait for them.** You are
    the one who would do the work; the angles they name are the angles to cover inline.
  - **An agent name, a job id, or a promise of a later completion notification.** Waiting will
    not make it run - **never wait on a completion notification here.** The routing was re-measured
    on 2.1.263 (2026-09-09) and it is not a simple yes or no:

    > **A subagent's completion notification goes to whoever is inside a turn when it fires.** If
    > the launched session is still in a turn, it arrives there, carrying the subagent's result
    > text verbatim (two probes). **If that session has ENDED its turn to wait, the notification
    > goes to its LAUNCHER instead** - measured by a controlled probe that spawned one background
    > subagent and ended its turn immediately: the notification arrived in the launcher, and the
    > marker file proved the subagent had run.

    **A fan-out is always the second case**, because a session that has spawned agents and has
    nothing else to do ends its turn - which is why waiting never works. It is not that the
    notification is lost; it is delivered to somebody else. Sixteen such reports have been seen
    straying to a launcher: seven from one row on 2026-09-08, eight from another on 2026-09-09,
    plus the deliberate probe.

    So the rule stands, and so does the older reason, for fan-outs specifically. What was wrong
    was stating it as a property of launched sessions in general. **Keep collecting results from
    files** - and if you are the launcher and a stray report arrives, it belongs to the row that
    spawned it: relay it with `scripts/relay.mjs`, do not act on it here.
  - **No such capability, or it errors out.** Review the diff directly for correctness, edge
    cases, race conditions, and violations of the binding contracts in the relevant `AGENTS.md`
    and docs. There is always an inline path; `not run` is for a leg genuinely blocked, never
    for a missing tool.
  Deciding from the return value is what makes this hold: a rule that asks the caller to work
  out whether it is a wave session, a subagent or an interactive one gets answered wrong, and on
  2026-08-29 three sessions answered it three different ways. **Invoke first, classify second** -
  the mode is observed, never assumed. Seen on 2026-08-30 from inside a wave session, as what to
  expect rather than permission to skip the invocation: code-review forked and handed its
  findings back, so it ran; simplify returned fan-out instructions, so phase 3 went inline.
  Either can change with any release.
- **SCOPE-CHECK THE REVIEW BEFORE BELIEVING ONE WORD OF IT, and say in the handoff that you
  did.** Write down the branch, the base sha and the file list the review says it read, run
  `git diff --name-only $(git merge-base origin/main HEAD)..HEAD` in this worktree, add anything
  `git status --porcelain=v1` reports uncommitted - the review reads the working tree too - and
  compare the two lists. It matches only if the review's branch is this worktree's and every file
  it reviewed is in that list. One command, and it catches a failure that is silent in the BAD
  direction: a branch looks like it changed MORE than it did, so its real diff reads as clean.
  Phase 1 now hands the scope over rather than leaving it to be derived, which is what removes the
  delegate's chance to be wrong - this comparison stays because it is what CAUGHT all ten, and a
  fix upstream of a detector never retires the detector.
- **A pass that will not say what it scoped fails this check exactly like a mismatch.** Derive
  its file list from the paths its findings name when it has findings; a pass reporting CLEAN
  with no branch, no base sha and no file list leaves nothing to compare, and that is the shape
  of the silent failure itself. Unfalsifiable is not the same as trustworthy.
- **A pass that REFUSES because the handed scope and its own view disagree has not run** - take the
  leg inline and say why. The request tells the delegate to stop and print both lists rather than
  quietly review what it thinks changed, so a refusal is the request working, not the row failing.
- **On any mismatch, discard the WHOLE pass** - not just the findings that fell outside - redo
  the review by hand over that same diff, and report `review: discarded+inline` with BOTH
  scopes, the sha the review used and this branch's merge base. **Discard it as a VERDICT, not as
  reading matter** - discarded means you may no longer say this branch was reviewed, never that the
  text goes in the bin unread. Any finding that does land inside the real diff is checked against
  the code like any other before the redo: on 2026-09-09 row AT's mis-scoped pass carried three
  in-scope findings, two of them genuine and high severity, and binning the pass would have shipped
  both. Findings about another branch's files are relayed, per the next bullet. Ten mis-scoped
  passes across eight rows and two causes, itemised with their shas in
  `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`. The reviewing tool is a
  built-in with no file in this repository, so noticing is the half this repository owns.
- Findings about another branch's files are that branch's business: report them to the session
  that owns it, and never fix them here.
- **Review the diff against what was ASKED as well as for bugs**, and keep the two apart: does
  the change make the prompt's GOAL true and serve its WHY, what was asked and not built, what
  was built and nobody asked for. A diff can be clean and wrong (the 2026-08-26 vanity rename
  followed its instruction to the letter and broke the install path), and a bug review has no
  reason to notice. **A delegated artifact is verified only when the gate that CONSUMES it has
  run** - on 2026-09-02 six fixtures passed every mechanical acceptance condition and half were
  wrong on the one judgement field, caught only by the corpus spec that reads them.
- Verify every finding against the actual surrounding code before acting on it - a plausible
  finding is not a confirmed one, and fixing a non-bug introduces churn at best.
- Fix confirmed defects now, in the changed code. A real pre-existing bug outside the diff is
  reported, not silently fixed - it belongs in its own change.

## 3. Simplify - a behavior-preserving quality pass

Goal: leave the changed code simpler than the review left it, without changing what it does.

- **Invoke** the tool's dedicated simplification skill (Claude Code: the simplify skill) over
  the same diff, then classify what came back by **phase 2's four-branch rule**, unchanged: a
  result you can use is `delegated`; fan-out instructions, a bare job id, or no such skill all
  mean the pass has not run, so do it inline over the angles below. Do not spawn anything to
  get around this, and do not skip the invocation and assert a mode - the mode is measured, and
  its whole job is to be true. Check any delegated output against phase 1's scope the same way
  the review is checked - the same wrong-worktree failure applies to any delegated pass.
- The angles, delegated or inline: reuse of existing helpers instead of new near-duplicates,
  dead or unreachable code, needless indirection or abstraction, and comment/naming/idiom drift
  from the surrounding house style.
- Behavior-preserving only. A cleanup that would ripple into unchanged code stays a report,
  not an edit.
- If neither review nor simplify changed anything, say so - verification below still runs,
  because the branch itself has unverified changes.

## 4. Verify - once, at the end

- `npm run build` (typecheck + lint + build) - the CI gate. The tree stays lint-clean; fix
  findings properly rather than adding eslint-disable comments.
- If product code changed, `npm run test:e2e:affected` - it maps the changed files to their
  covering specs and raises the catalog tripwire itself when relevant. **If the branch has
  taken `main` in since it was last verified, use `npm run test:e2e:integration` instead**: the
  default base is then `main` itself, so a plain affected run covers only the branch's own files
  and everything main brought in goes unchecked. A clean merge is not proof the combined state
  holds (`docs/VERIFICATION.md`).
- If the behavior is observable in the browser, observe it per the root `AGENTS.md` - never
  mark the check done on a green build alone.
- **If the change moves what a GRAPHIC looks like - a design file, the shared template
  machinery, the SVG import road, the fit or alignment code - render it and LOOK at it:**
  `npm run queue -- "node scripts/taste-frame-review.mjs --affected"` (browser work, so it is
  queued; `node scripts/jobs.mjs log <job>` names the frames), then open every frame and answer
  `docs/VISUAL_TASTE_REVIEW.md` in writing - that file owns the questions, the failing examples
  and what a NO means. Every source-level gate passes a visibly broken graphic, so the answer is
  read off the picture, never off the code. `--affected` refuses a shared-machinery change rather
  than rendering the whole catalog (name the designs you changed with `--only`), and an imported
  design is looked at through `scripts/svg-import-sweep.mjs --shots`.
- On a failure: fix, re-run the failing gate, and finish with a full green pass. If a fix
  would exceed this workflow's scope, stop and report the failure honestly instead.

## 5. Commit and report

- If the check produced changes and verification is green, commit them to the **feature
  branch** with a message that explains the actual change and reads as human-written - no
  chat/session language, no agent or AI mentions, never a `Co-Authored-By` trailer.
- Report per phase: what review found and fixed, what simplify changed (or that nothing
  needed it), which verification gates ran and their results, and anything deferred as
  out of scope.
- **Name each review leg's MODE, and never report a leg that did not run as one that passed.**
  Say `review: <mode>` and `simplify: <mode>`, drawn from `delegated` (a delegated pass returned
  its result and was used), `inline` (done in this context), `discarded+inline` (a delegated pass
  came back but failed phase 2's scope check, so it was thrown away and redone by hand, and it
  carries both scopes) and `not run`, with the reason for any `not run`. A check carrying a
  `not run` leg has not passed, and says so. This is the same rule
  the landing queue follows when it refuses loudly instead of reporting a merge it did not make:
  a weaker check reported as a full one is worse than an honest gap, because it is the version
  that survives into the record. `/check` is permanent for night sessions on these terms, so a
  silent fallback also destroys the evidence that earned it.
- **Say `taste: answered` or `taste: not applicable`** in the same report. `answered` carries
  every NO with what was seen and what was done about it; `not applicable` means nothing in the
  change can move what a graphic looks like, and says so. A graphic change whose report carries
  neither has not been checked.
- **Write the verdict stamp** - the machine-readable copy of the mode lines, so the landing path
  can eventually see review the way it sees CI (`docs/ORCHESTRATION_NEXT.md` §5). One JSON file
  at `<git-common-dir>/noacg-jobs/checks/<branch-with-slashes-as-dashes>.json`:
  `{ v: 1, branch, mergeBase, reviewedSha, files, legs: { review: { mode, findings, fixed,
  model, effort }, simplify: {...}, verify: {...} }, verdict, at }` - `branch`, `mergeBase` and
  `files` come out of `node scripts/review-request.mjs --json`, so the stamp records the scope the
  review was actually handed rather than a retyped copy. `reviewedSha` is the EXACT
  commit the check ran on, and any commit after it invalidates the stamp (re-run or honestly
  re-stamp what was re-checked). Overwrite the branch's previous stamp; the file is per-machine
  state like the job store, never committed.
- Then **stop**. Landing is serialized, not permissioned: when the work this check covers is
  finished, the `queue-merge` workflow hands the branch to the landing queue, which lands it
  one branch at a time. The queue reads this stamp (`scripts/jobs.mjs add-merge` refuses a tip
  the stamp does not cover), so the stamp is what lets the branch queue. Never merge into
  `main` by hand.
