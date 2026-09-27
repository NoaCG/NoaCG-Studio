# Two control surfaces can hold different quiz answer keys

**Filed:** 2026-09-26. **Source:** handoff of `claude/u-quiz-live-consistency` (2026-09-22,
commit `4b9f0139`), re-checked against the tree on 2026-09-26. Narrowed on 2026-09-27, when
`claude/e-quiz-score-predictable` served the other two questions this file held: both answer
models stay, named by the pick section's heading ("Pick, then lock" or "Pick, one press",
`src/templates/types/answerBoard.ts`), and a quiz saved before `4b9f0139` gets the answer key on
Reveal through the control model's re-derive ledger (`src/control/controlUpgrades.ts`).

## Why

Outcome 4 in `docs/GOALS.md` asks for one consistent control model that behaves predictably on
any graphic. This is the remaining place where the quiz controls behave in a way an operator
cannot predict from what is on screen: the operator presses the right button and air shows
something else.

## What it would take

Reveal carries the key from the cue it was pressed on. If a second operator corrects the key on
the hosted control page and presses Update, the dashboard's cue still holds the old key, and a
Reveal pressed there sends it again. Select has the same shape. The real fix is for a cue editor to
follow another surface's staged edits, which is a control-layer change in
`src/control/hostedControl.ts` and the two sending pages.

## Evidence

- `4b9f0139`: the reveal control on `answerBoard.ts` and `quizShow.ts` carries `correctAnswer` as its
  payload; `e2e/quiz-live-consistency.spec.ts` pins the live key, the saved-before-the-fix key and
  both answer models.
- The cross-device hold-back is a separate, stated limit in
  `docs/backlog/playout-lag-when-working-the-queue.md`.
