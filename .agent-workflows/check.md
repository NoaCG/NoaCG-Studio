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
on; a BACKGROUND fan-out is not, because in a launched session the completion notification goes
to the launcher and never arrives. So no phase here requires a fan-out - every one has a path
that completes in one context, and phase 5 says out loud which path each leg took. A gate that
cannot run where the work happens is not a gate.

This workflow edits the working tree of the current feature branch and nothing else. It never
merges, pushes, or touches `main` in any way - if invoked while sitting on `main`, branch
first before changing anything, exactly as the repo's Git rules require.

## 1. Scope - compute once, reuse in every phase

- The scope is what this branch changed: `git diff $(git merge-base main HEAD)` plus any
  uncommitted changes (`git status --porcelain=v1`). Compute it once; all three phases work
  from this same changed set. Do not review or simplify code the branch did not touch.
- **Run every scope command INSIDE this worktree, with its absolute path**, and record the
  branch name (`git rev-parse --abbrev-ref HEAD`) and the merge-base sha alongside the file
  list. Several worktrees of this repo are normally live at once, and a tool that resolves
  paths from the session's own directory rather than from this worktree silently answers for
  somebody else's branch. That is not hypothetical: the review phase reviewed a different
  worktree's branch three separate times on 2026-08-29.
- If the diff is empty and the working tree is clean, report "nothing to check" and stop.
- Before editing, read the nested `AGENTS.md` contracts covering the touched areas - review
  findings are judged against them, and a "simplification" that violates one is a bug.

## 2. Review - bugs first

Goal: find and fix real defects in the changed code before polishing it.

- Run the tool's dedicated code-review capability over this branch's diff (Claude Code: the
  code-review skill, invoked with the branch name and an EXPLICIT level - `high` is the right
  default here; Codex: its review mode). **Always name the level.** Claude Code's skill reuses
  the last level typed when none is given, so a bare invocation can silently inherit `ultra`,
  which is a cloud multi-agent run that reports back out of band. Never ask for `ultra` from
  this workflow.
- **A DELEGATED PASS COUNTS ONLY IF ITS RESULT COMES BACK INTO THIS CONVERSATION.** Invoke the
  capability, then decide from *what came back*, not from what kind of session you think you
  are in. **Findings, or an explicit clean result, mean the pass ran**: scope-check it (next
  bullet), act on it, mode `delegated`. **Anything else means it did NOT run** - do the leg
  yourself, here, over the angles below, mode `inline`. The three shapes to expect:
  - **Instructions telling you to fan out into background agents and wait for them.** You are
    the one who would do the work; the angles they name are the angles to cover inline.
  - **An agent name, a job id, or a promise of a later completion notification.** Waiting will
    not make it run - **never wait on a completion notification here.** In a session that was
    itself launched by another session, those notifications route to the LAUNCHER and never
    arrive (`.agent-workflows/orchestrator/launch.md`, paid for twice).
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
- **CHECK THE REVIEW'S OUTPUT AGAINST THE SCOPE FROM PHASE 1 BEFORE ACTING ON ANY OF IT.** A
  review names the branch and the files it read; if that branch is not this worktree's branch,
  or the files are not in phase 1's changed set, **discard the whole review** and redo the
  phase by hand over `git diff <merge-base>...HEAD` in this worktree. A review that silently
  reviews a different branch is worse than no review - it spends the session's attention on
  somebody else's diff and reports this branch as clean. This happened three times on
  2026-08-29 (`docs/handoffs/2026-08-29-dd-svg-fitting-two.md`); a delegated review inherits
  the delegating tool's directory, not this worktree's.
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
  came back but failed the phase-1 scope check, so it was thrown away and redone by hand - the
  2026-08-29 failure, which `delegated` would hide) and `not run`, with the reason for any
  `not run`. A check carrying a `not run` leg has not passed, and says so. This is the same rule
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
  model, effort }, simplify: {...}, verify: {...} }, verdict, at }` - `reviewedSha` is the EXACT
  commit the check ran on, and any commit after it invalidates the stamp (re-run or honestly
  re-stamp what was re-checked). Overwrite the branch's previous stamp; the file is per-machine
  state like the job store, never committed.
- Then **stop**. Landing is the queue's: `/queue-merge` reads this stamp (`scripts/jobs.mjs
  add-merge` refuses a tip the stamp does not cover), so the stamp is what lets the branch queue.
