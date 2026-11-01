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
  board with one state before the reveal, `selected`. Reveal correct (`judge`) leaves it for the
  reveal, and so does Next, an arrow this row ADDS (see Decisions). The `locked` and `sealed` states, the `lock` and `revealChoice` events and
  buttons, and the Locked in look are not in its machine, controls or paint table. The pick's
  heading reads "Pick, then reveal".
- `src/components/wizard/import/BehaviourSection.tsx`: a "No lock at all" checkbox beside the
  quiz's options. Ticked, it writes `{ lock: false, noLock: true }`, clears the timed reveal and
  hides the lock option, the timed-reveal option and the Locked in picker, and switches off the
  text rows drawn inside the Locked in layer. Unticked, it removes
  `noLock` and leaves the optional-lock board with both options and the picker in view.
- `e2e/import-svg-behaviour.spec.ts`: one journey, on a copy of the sample quiz whose lock layer
  is left visible. Tick No lock, the three controls are gone, the cue has no Lock it in or Reveal
  choice, the drawn lock is hidden from the start and never shows, the pick moves B to D, Reveal
  correct paints the key (C) correct and the rest wrong, and on a second Take Next leaves a pick
  for the reveal.

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
- `e2e/import-svg-behaviour.spec.ts` through the job queue: 40/40 on the first commit (j-0001).
  After the review fixes, 39/40 (j-0002): the new journey still asserted the old bound lock
  layer, which the fix now clears. With that assertion corrected, every quiz test in the spec
  passed, 11/11 (j-0003). The other 29 tests do not touch the quiz and passed in j-0002.
- After the first /so round (below), the journey also presses Next from a pick on a second
  Take, and the badge check that could not fail was dropped: quiz tests 11/11 (j-0004).
  Mutation check: with the Next arrow removed from `quiz.ts`, the journey fails at the Next
  press (j-0005); the probe commit was dropped, never pushed.
- After the Codex round (below), on a copy of the sample with its lock layer visible: quiz tests
  10/11 (j-0006), the journey picking the answer key by its old field id (the visible lock's
  text is now a field, so the key moved to f6); corrected, 11/11 (j-0007).
- With the untick step added after /so 2: quiz tests 11/11 (j-0008).
- With the lock words switched off after /so 3: quiz tests 11/11 (j-0009); mutation j-0010
  fails as expected.
- Not done: a manual walk of the wizard in a browser with a screenshot. The e2e journey drives
  the same flow through the real UI.
- Not run here: the broad affected selection (`src/templates/**` maps to most of the e2e tree)
  and the configured suite. They run in CI on the PR. `e2e/import-svg.spec.ts` is quarantined
  (#1879, #1915) and is not this run's.

## Review rounds

In order. Every round's result belongs to the head named.

1. Codex on `3343dc5` (on PR open), P2: unbinding the Locked in layer left lock artwork drawn
   visible on air for good. Product defect; family: what a no-Lock board does with the moment it
   removed. Fixed in `16d07cd` and `4b45621` by keeping the binding, with the journey on a copy
   of the sample whose lock layer is visible.
2. /so 1, session `session_017SdbwRKWDSULfSmTWBDXLw`, on `3343dc5`: AGREE, A-, nothing blocking.
   Fixed in `c1b3745`: the Next arrow from the pick had no test (faulty evidence claim); the
   LOCKED IN check passed whatever happened (faulty test expectation). Left: the byte harness is
   not committed (row 15 owns `scripts/quiz-no-lock.test.mjs`).
3. Codex on `559f034` (on request): clean.
4. /so 2, session `session_017SdbwPXQ2MqyHe6zSQFrG1`, on `559f034`: AGREE WITH CORRECTIONS, A-,
   nothing blocking. Fixed in `4cb740e`: the untick claim had no check; the journey now
   unticks No lock, sees the optional-lock board with its Locked in layer still picked, and ticks
   it again. Argued, not changed: on visible lock artwork its words ("LOCKED IN") are an operator
   field.
5. /so 3, session `session_017SdbwQrYjWdNF9XK5a8z3K`, on `43ba298`: AGREE, A-, nothing blocking.
   The LOCKED IN field came back: two successive rounds on one family (obsolete controls on a
   no-Lock board), so it was reassessed before any patch. Reassessed: on this board that field
   edits a drawing nobody sees, which is an obsolete control, and round 2's argument (it is the
   mapping step's general rule) answered the wording, not the intent. Fixed in `4768f31`: ticking
   No lock switches off the text rows drawn inside the Locked in layer; they stay in the text
   list to tick again. The journey checks no "Locked in" field reaches the cue; with the switch
   removed it fails at that line (mutation, j-0010, probe dropped). Also from round 3: the Next
   arrow is now named as an addition (What landed, Decisions), and the latent refusal of
   `noLock` with `autoReveal` (reachable only by hand-edited data today) is left for row 15's
   test.
6. Codex on `43ba298` (on request), P1: `quiz.ts` imported a type from `src/blocks/`, which the
   templates layer must not add (`src/templates/AGENTS.md`). Rule break, not a behaviour defect.
   Fixed in `8dd4074`: the look-rule type is read off `BehaviourRecipe['paint']`. Type-only; the
   byte comparison was re-run and all seven saved shapes still equal main.

## Decisions

- **The variant is a flag the compiler does not fill, not a declared option.** The compiler
  fills every declared option's default into the emitted table, so declaring `noLock` would have
  written `noLock: false` into every saved quiz's bytes. Only a board that chose it carries the
  key. It is stored with `lock: false` so that anything reading only `lock` still sees a board
  that does not require one.
- **A checkbox, not a three-way control.** The existing "Require lock" checkbox and its tests stay
  as they are. The new choice sits beside it and hides what it makes meaningless, as the wizard
  hides controls that cannot change the graphic.
- **Next leaves the pick: the one arrow this row adds rather than removes.** On a board with a
  lock, Next rejoins the walk from `locked`. With no lock, a playout server's Continue after a
  pick would otherwise stop, so the same rejoin leaves `selected`.
- **The Locked in layer stays bound.** It is the drawing of a moment a no-Lock board never
  reaches, so no rule shows it and it stays hidden on air, even when the designer left it
  visible. An earlier commit cleared the binding on tick; that left visible lock artwork on air
  for good (review round 1 above), so it was reverted. The picker stays hidden because the
  lock is not a moment of this board; unticking No lock shows it again.
- **The no-Lock machine and paint are derived from the lock board's**, filtered, not written a
  second time, so the two variants cannot drift.

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
