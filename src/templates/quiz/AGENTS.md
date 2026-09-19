# src/templates/quiz - the answer boards

Loaded alongside the root `AGENTS.md` and `src/templates/AGENTS.md` when working in this
directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it directly).
Keep it accurate.

Split out of `src/templates/AGENTS.md` on 2026-08-22, which keeps the catalog-wide rules and
the category index. Add a RULE here; leave the reasoning in the code's own comments.

## quiz/ - qz01…qz15

qz01…qz15 (prefix 'quiz'; f0 question, f1…fn options, hidden correct-answer and
selected-answer dropdowns after them).

DATA BLOCKS via convertToDataRegion + a refinement (docs/TIMELINE_V2_PLAN.md §3c): the
Continue reveal is a real middle step that CALLS revealAnswer() (adds
.quiz-correct/.quiz-dim + pops the winner;
update() clears the reveal). Each answer ROW carries `quiz-option` (the shared look) AND
`quiz-option-N` (its own animation identity) - the entrance staggers them, and a stagger
lives in the keyframe model as per-row start times, which one class matching several elements
cannot carry. The numbered rows are registry parts, labelled by their field ("Answer B").
**The ROW COUNT is a parameter** (`QuizContent.answers.length` - 2, 3 or 4): a true/false
board, a three-way and the classic four-answer board are the same graphic with a different
number of rows, so the letter alphabet, the two hidden field ids and the preset's row list all
derive from it, and n = 4 derives exactly the strings the four-answer board always emitted
(byte identity, pinned by the catalog baseline). `assertRowsMatchAnswers` throws when a design
draws the wrong number of rows - the one thing the assembler cannot derive from the design, and
silent in every other check. All three boards share ONE machine (types/answerBoard.ts): because
the pick is DATA, halving the rows changes no state at all.

**qz13-qz15 are the SHOW boards** (types/quizShow.ts; sticker, showtime and arcade), and they
are the same assembler with three `QuizContent` flags. `variableAnswers` adds an "Answers shown"
dropdown after the other hidden sources: the markup always draws four rows, `applyAnswerCount()`
hides the ones past the count with `quiz-option-off`, and the root carries `data-answers="N"` for
a layout that depends on it (qz13's third label runs full width at 3). The panel keeps its stage
width at every count. **An unused row is parked out of the flow and invisible, never
`display: none`**: the stage fit calibrates every line from its own laid-out box, and a row with
no box came back from a later question fitted into nothing. For the same reason
`applyAnswerCount()` lets go of the panel's reserved height when the count CHANGES, because that
reserve is a floor and a board going from four answers to two kept a four-answer panel.
`showBoardRowsHtml()` in shared.ts is the one place the row markup is written. `audience: false` and `lock: false` take the audience chips and the lock
moment OUT of the emitted runtime, because a function no arrow can ever call reads as though it
works. Absent, all three flags emit what the classic boards always did, byte for byte.
**A show board's state is never colour alone and a dimmed row keeps its ground**
(docs/DESIGN_LANGUAGE.md section 8): each row wraps its content in `.quiz-face`, which is what
gets pressed, ringed, flooded or faded, because the presets own the row's transform and opacity.
