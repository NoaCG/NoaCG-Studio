# Three quiz control questions the live answer-key fix left open

**Filed:** 2026-09-26. **Source:** handoff of `claude/u-quiz-live-consistency` (2026-09-22,
commit `4b9f0139`), re-checked against the tree on 2026-09-26.

## Why

Outcome 4 in `docs/GOALS.md` asks for one consistent control model that behaves predictably on
any graphic. The fix that made Reveal carry the answer key (`4b9f0139`) closed the defect it was
for, and named three places where the quiz controls still behave in a way an operator cannot
predict from what is on screen. None is a crash; each is a moment where the operator presses the
right button and air shows something else, or where two quizzes that look alike ask for different
presses.

## What it would take

1. **One answer model, or two on purpose.** A quiz either takes per-letter picks (one press, no
   lock) or select-plus-lock (two presses, with a lock beat). Which one a board gets depends on the
   family it was drawn into, which the operator cannot see. Decide whether both stay, and if so
   make the difference visible on the control panel; if not, pick one and migrate the other family.
2. **A saved graphic keeps its old buttons.** A control list's payload is compiled into the
   template when it is built, so a quiz saved before `4b9f0139` still has a Reveal that carries no
   key. There is no path that re-derives a saved graphic's machine metadata from its type. Either a
   versioned migration of that metadata on load, or a re-derive when a production installs the
   graphic.
3. **Two surfaces can hold different keys.** Reveal carries the key from the cue it was pressed on.
   If a second operator corrects the key on the hosted control page and presses Update, the
   dashboard's cue still holds the old key, and a Reveal pressed there sends it again. Select has
   the same shape. The real fix is for a cue editor to follow another surface's staged edits, which
   is a control-layer change.

## Evidence

- `4b9f0139`: the reveal control on `answerBoard.ts` and `quizShow.ts` carries `correctAnswer` as its
  payload; `e2e/quiz-live-consistency.spec.ts` pins the live key and both answer models.
- The cross-device hold-back is a separate, stated limit in
  `docs/backlog/playout-lag-when-working-the-queue.md`.
