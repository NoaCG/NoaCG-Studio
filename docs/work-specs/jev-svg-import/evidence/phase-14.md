# Phase 14: Implement the true no-Lock quiz variant

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-12: "True no-Lock variant removes obsolete controls/paths, handles sealed selection/timers
  and preserves saved quiz behavior."
- Row 14: "Remove unused Lock state/actions/transitions only for the new variant. Preserve the
  existing optional-Lock behavior for saved graphics and operator-supplied correct answers."

Row 15 qualifies the quiz (sealed selection, reselection, reveal, the five-second timer, the
fresh-context rehearsal). This row builds the variant only.

## Pinned main

Worktree from `043fcccb08313e321dbfe6ef1c633f37d98a8eaf` (row 13, PR #1916). Previous verified
main for this plan: that SHA. Push CI, configured-suite, Post-landing and Quarantine all succeeded
on it.

## What landed

- `src/templates/behaviours/quiz.ts`: a quiz whose options carry `noLock: true` compiles to a
  board with one state before the reveal, `selected`. Reveal correct (`judge`) and Next leave it
  for the reveal. The `locked` and `sealed` states, the `lock` and `revealChoice` events and
  buttons, and the Locked in look are not in its machine, controls or paint table. The pick's
  heading reads "Pick, then reveal".
- `src/components/wizard/import/BehaviourSection.tsx`: a "No lock at all" checkbox beside the
  quiz's options. Ticked, it writes `{ lock: false, noLock: true }`, clears the timed reveal and
  hides the lock option, the timed-reveal option and the Locked in picker. Unticked, it removes
  `noLock` and leaves the optional-lock board.
- `e2e/import-svg-behaviour.spec.ts`: one journey. Tick No lock, the three controls are gone, the
  cue has no Lock it in or Reveal choice, the pick moves B to D, the drawn lock never shows, and
  Reveal correct paints the key (C) correct and the rest wrong.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Removes obsolete controls/paths, only in the new variant | Compiled no-Lock type: one branch `selected` with edges `select`, `select`, `judge`, `next`; buttons `select`, `judge` (and the `audience` entry every quiz carries, which has no arrow and is not shown); paint without `locked`; no `locked`, `sealed` or `revealChoice` anywhere in its machine or table. The e2e journey checks the same on the cue and the Program monitor |
| Handles sealed selection | The sealed state is a lock state (lock from the question with the pick hidden), so the variant has none. A hidden pick stays possible as data: the Selected answer field can be set without pressing Select, and Reveal correct is legal from the question as on every quiz. Row 15 exercises it |
| Handles timers | The five-second timer leaves `locked`. Moving it onto the pick would change when a board reveals itself, so the pair is refused rather than resolved quietly: the wizard clears and hides the timed reveal when No lock is ticked, and the compiler throws a named error for `noLock` with `autoReveal: true` |
| Preserves saved quiz behaviour | Byte comparison below: all seven saved option shapes compile byte-identical to main. The existing lock and optional-lock e2e tests pass unchanged |
| Operator-supplied correct answers | Unchanged: Reveal correct still carries `correctAnswer` as its payload, and the e2e journey sets the key in the cue before Take |

**Byte comparison.** A scratch harness (not committed; `scripts/quiz-no-lock.test.mjs` is row
15's file) bundled `compileBinding` from main and from this branch and compiled one four-answer
quiz with a bound locked layer under each saved option shape: none, `{}`, `{lock:true}`,
`{lock:false}`, `{autoReveal:true}`, `{lock:false,autoReveal:true}`,
`{lock:true,autoReveal:false}`. For each it compared the CSS, owned fields, HTML, runtime JS,
steps and the full graphic type. All seven were identical. Only `{lock:false,noLock:true}`
differed (56,883 bytes on main, where the flag meant nothing, against 55,717 here).

## Verification on this worker

- `npx tsc --noEmit -p .`: pass. `npx eslint` on the three changed files: pass.
- `npm run gates -- run --changed origin/main`: pass.
- `node scripts/check-catalog-emit.mjs`: PASS, 528 designs equal to baseline.
- `node scripts/check-e2e-protection.mjs --changed origin/main`: OK.
- `e2e/import-svg-behaviour.spec.ts` through the job queue (job j-0001): see the PR for the
  final count.
- Not run here: the broad affected selection (`src/templates/**` maps to most of the e2e tree)
  and the configured suite. They run in CI on the PR. `e2e/import-svg.spec.ts` is quarantined
  (#1879, #1915) and is not this run's.

## Decisions

- **The variant is a flag the compiler does not fill, not a declared option.** The compiler
  fills every declared option's default into the emitted table, so declaring `noLock` would have
  written `noLock: false` into every saved quiz's bytes. Only a board that chose it carries the
  key. It is stored with `lock: false` so that anything reading only `lock` still sees a board
  that does not require one.
- **A checkbox, not a three-way control.** The existing "Require lock" checkbox and its tests stay
  as they are. The new choice sits beside it and hides what it makes meaningless, as the wizard
  hides controls that cannot change the graphic.
- **Next leaves the pick.** On a board with a lock, Next rejoins the walk from `locked`. With no
  lock, a playout server's Continue after a pick would otherwise stop, so the same rejoin leaves
  `selected`.
- **A bound Locked in layer stays bound.** On a no-Lock board no rule shows it, so the drawn layer
  stays hidden. Unticking No lock gives the binding back.

## Follow-ups and reads

- #1917 (P3, create): the proposal route (`apply.ts`, `draft.ts` `svgComponentOf`) cannot propose
  or report a no-Lock quiz. An author's ticked No lock survives an apply. Outside this row's files.
- #1833 (question fit after attaching the quiz) read as row 13 asked: it is about text fit, which
  this row does not touch.
- #1897 (export window slow under load): not seen in this row's run.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-14-build')"

No saved graphic carries `noLock` before this lands, so a revert leaves saved quizzes as they
were. A quiz saved with No lock after landing would compile as the optional-lock board once
reverted.
