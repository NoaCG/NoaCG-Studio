# Phase 15: Qualify quiz timing and hidden-selection behavior

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-12: "True no-Lock variant removes obsolete controls/paths, handles sealed selection/timers
  and preserves saved quiz behavior."
- AC-22: "In a fresh browser context reopen a saved imported quiz, select the true no-Lock
  profile, save, and operate Select→Reveal→Reset through the normal UI without code. Keep
  question/answer fields, source styling and matching animation targets; remove obsolete Lock
  control/state/timer paths only in that variant. Standard saved quizzes keep their behavior.
  Test reset from every reachable state and invalid Reveal. A fresh context is a task rehearsal,
  not a measured novice-user study."
- Row 15: "Exercise sealed selection, reselection, reveal, five-second timer origin,
  correct/incorrect, replay and reset. Resolve unsupported no-Lock/auto-reveal combinations
  explicitly instead of moving timers silently. [...] The second-author path is an e2e assertion
  in this row, not another implementation project."

## Pinned main

Worktree from `d7b4927b87f037a74411883b69a6282b780b9c19`. Previous verified main for this plan:
that SHA. Push CI, configured-suite, Post-landing and Quarantine all succeeded on it.

## Rules

Observable lines; `scripts/quiz-no-lock.test.mjs` names them.

- Q1 A saved quiz (any options without `noLock`) keeps its lock, its hidden-pick seal, its
  buttons, its Locked in look and its compiled bytes.
- Q2 The five-second timer starts at the lock with the pick showing (`locked`): one timer
  arrow, from `locked`, after 5 seconds. Nothing else is timed: a pick, a sealed answer and the
  question never reveal by themselves. Reset out of the lock stops the timer.
- Q3 The no-Lock quiz has no lock or seal state, no Lock it in or Reveal choice button, no
  Locked in look and no timer. A pick goes to the reveal by Reveal correct or Next.
- Q4 No lock with the timed reveal is refused by name, never resolved by moving the timer.
- Q5 No lock keeps the answer key and pick fields at their ids and stamps the same layers.

## What landed

No product source changed. This row is tests and notes.

- `scripts/quiz-no-lock.test.mjs` (new, Node, no browser): bundles the compiler with rolldown
  and compiles a four-answer quiz with every moment bound.
  - The seven saved option shapes (none, `{}`, lock true, lock false, autoReveal, lock false
    with autoReveal, lock true with autoReveal false) against SHA-256 pins of each compiled
    part: the behaviour table, the graphic type (machine, controls, fields), the default path,
    the owned fields, their markup and the layer stamps. The pins were taken on main at
    `043fcccb` (before row 14) and on this branch; they are equal on both. `QUIZ_SRC=<tree>/src/`
    runs the same test against another tree, which is how that was checked.
  - A hand-written edge list per profile (lock required, lock optional, timed, lock optional
    and timed, no lock, no lock with the timed reveal off), so a re-pinned regression still
    fails on the rules.
  - Q2 to Q5 as their own tests.
- `e2e/import-svg-behaviour.spec.ts`, two journeys:
  - **The standard quiz qualified** (timed reveal on): the hidden pick set as data (nothing
    painted), the seal from the question (Select greyed), no timer from the seal over 6.5 s,
    Reveal choice showing the pick and starting the timer (the reveal comes no sooner than
    4.5 s after), a wrong pick revealed (B picked, C the key), every press greyed after the
    reveal, reselection B to D, Reveal choice greyed outside the seal, reset out of the lock
    leaving the question for 6.5 s with nothing lit, a right pick revealed by the operator
    before the timer, and replay (Out, Take) from a clean question with the key kept. Reset
    (Recovery, Back to start) from the question, the seal, the reveal, the pick and the lock.
  - **The second author** (AC-22): the first author imports the quiz (with its lock drawing
    visible, so its words are field F1) into a production and sets the key C in the cue. A new
    browser context made from the first one's saved storage opens that production, sees the
    standard quiz with Lock it in and the key C, then reopens the quiz through Import, ticks
    No lock (Require lock and the timed reveal disappear), and finishes it under the same name
    into the same production. One graphic of that name remains; its fields, every drawn
    element's styling and role stamp, and every animation step's targets equal the first
    author's. The cue keeps the key C in F6 and has no Lock it in or Reveal choice; Recovery
    offers no Locked state. Take, Select, Reveal correct (C correct, the rest wrong, the drawn
    lock hidden), Reveal correct and Select greyed after the reveal, and reset from the
    question, the pick and the reveal.

## Evidence per criterion

| Criterion | Evidence |
|---|---|
| Sealed selection | Standard journey: hidden pick as data, Lock from the question gives "Locked, choice hidden" with the lock look and no pick look; Select greyed; Reveal choice shows the pick. No-Lock board: no seal (node Q3, edge list) |
| Reselection | Standard journey B then D; second-author journey picks B after a reset |
| Reveal, correct and incorrect | Standard journey: wrong pick (B vs C) by the timer, right pick (C) by the operator; second-author journey reveals C with B wrong |
| Five-second timer origin | Node: one timer arrow in any quiz, `locked -timer5-> reveal`. Journey: no reveal from the seal past 6.5 s; reveal at least 4.5 s after Reveal choice; reset from the lock stops it |
| No-Lock and auto-reveal | Refused, not moved: the compiler throws `Behaviour: a quiz without a lock has no automatic reveal (the timer starts at the lock).` for every shape carrying both (node Q4); the wizard clears and hides the timed reveal when No lock is ticked (second-author journey, and row 14's journey), so an author cannot build the pair; no no-Lock machine has a timer (node Q2) |
| Replay | Standard journey: Out and Take start from a clean question with the key kept |
| Reset from every reachable state | Standard: question, sealed, reveal, selected, locked. No-Lock: question, selected, reveal |
| Invalid Reveal | Standard: after the reveal, Reveal correct, Lock it in, Reveal choice and Select are greyed; Reveal choice greyed on a pick. No-Lock: Reveal correct and Select greyed after the reveal |
| Fresh context, reopen, No lock, save, Select→Reveal→Reset | Second-author journey |
| Keep fields, styling, animation targets | Second-author journey compares the saved graphic before and after; node Q5 |
| Obsolete Lock paths only in the variant | Node edge lists and Q3; second-author journey (no lock button or snap state) |
| Standard saved quizzes keep their behaviour | Node pins (seven shapes); standard journey; second-author journey sees the first author's quiz with its lock |

## Verification on this worker

- `node --test scripts/quiz-no-lock.test.mjs`: 17/17. The same file with
  `QUIZ_SRC` set to a checkout of `043fcccb` (main before row 14): the seven saved-shape pins and
  the four lock-board edge lists pass; the no-Lock tests fail there, as they must (the variant
  does not exist). Mutation: a four- or two-second timer fails five tests.
- `npx tsc --noEmit -p .`, `npx eslint` on the two changed code files: pass.
- `npm run gates -- run --changed origin/main`: pass. `node scripts/check-e2e-protection.mjs
  --changed origin/main`: OK (both journeys set 100 s, under the 120 s ceiling).
- The two journeys through the job queue. First runs failed on test faults, not product ones:
  the hidden pick sits under the cue's Advanced section (j-0001); the second context read the
  cue before its save had landed (j-0001, the journey now waits for the record); Back to start
  goes to Off, not to the question, so the reset is Back to start then Re-take (j-0002); the
  replay revealed without the lock its board requires (j-0003). Then both passed (j-0004).
- Mutations, each probe commit dropped and never pushed: a two-second timer fails the standard
  journey at the timer line, revealed after 3.3 s (j-0005). Keeping the `locked` state on the
  no-Lock board fails the second-author journey at the snap list (j-0007) and three node tests.
  Removing only the Lock button from the no-Lock control filter changed nothing on screen
  (j-0006): the cue draws a button only for an event some arrow carries, so the machine, not the
  control list, is what hides it.
- Whole `e2e/import-svg-behaviour.spec.ts` on the final source: 42/42 (j-0008).
- Not run here: the configured suite (CI selects it from the PR) and a production build (no
  build input changed). Not done: a manual browser walk with a screenshot; the journeys drive the
  same UI.

## Decisions

- **"Reopen" is the Import road.** A saved graphic keeps no wizard draft, and no editor surface
  changes a behaviour, so the normal UI way to revise a saved quiz's profile is to drop the same
  artwork again and finish under the same name into the same production. That saves over the
  library record and keeps the pool entry's id, so the cues keep their values. Re-import
  preservation of corrections is AC-15's (rows 25 and 26), not this row's.
- **A fresh context is the first author's saved storage in a new browser context**
  (`storageState` with IndexedDB), offline. The configured spec stays as it is: a signed-in
  second account would test sharing, which AC-22 does not ask for.
- **The pins cover what the quiz writes; the shared runtime is checked for identity, not
  pinned.** The paint runtime and look CSS are one string for every recipe, so the test asserts
  each quiz emits exactly that string. Pinning them here would make every runtime change in
  another row fail this file.
- **No product change.** Every behaviour the row names already held on main; nothing failed to
  reproduce, so no source change was made.

## Follow-ups and reads

- #1917 (the proposal route cannot propose the true no-Lock quiz): the row text does not require
  it, so it stays open.
- Known limit carried from row 14: unticking No lock restores the earlier options only within
  one visit to the mapping step.

## Revert

On a fresh branch from `origin/main`, landed through the merge queue:

    git revert -m 1 "$(git log origin/main --merges --format=%H -1 --grep='claude/plan-jev-svg-import-15-build')"

Tests and notes only; a revert changes no graphic.
