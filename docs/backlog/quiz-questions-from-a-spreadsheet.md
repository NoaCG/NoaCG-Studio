---
v: 2
source: owner
kind: ask
raised: 2026-09-19
state: unstarted
asked: "if we had all the questions and answer options in an Excel file or something similar, it would be very nice if you could just upload that. The graphics would be imported to the playout system automatically. We could implement that later. For example that sounds like a perfect thing that our CLI tool could just do straight from Codex or Claude Code."
serves: P7
size: standard
touches: cli/, src/templates/types/quizShow.ts
needs-owner: none
---

# Fill a quiz show's rundown from a spreadsheet of questions

**Filed:** 2026-09-19. **Source:** owner, while scoping the quiz show board (`types/quizShow.ts`).

## Why

The quiz show board holds ONE question. The owner ruled that on purpose: nobody knows every
question while building the graphic in the wizard, so the operator creates the board once and
duplicates it in the rundown, one copy per question. That is right for ten questions typed by
hand. For a real show the questions already exist in a spreadsheet, and retyping fifty rows of
five cells each is where mistakes get on air.

## What it would take

A row of the sheet is already the board's data: question, up to four answers, the correct
letter. The answer count follows from how many answer cells are filled, which is exactly what
the board's `answerCount` field carries.

- The CLI is the owner's suggested door: read a `.xlsx` or `.csv`, and for each row add a copy
  of the saved quiz graphic to a production's rundown with its fields set. An agent in Codex or
  Claude Code can then do it from a sentence.
- Check what the production Data tab already covers before building anything. It holds a
  dataset whose rows load into the draft with Next (`e2e/quiz-pilot.spec.ts` runs a question
  bank that way), so the missing piece may only be the file import into that dataset, plus
  `answerCount` derived from the filled cells.

## Evidence

The owner's words are in the receipt above. `e2e/quiz-pilot.spec.ts` shows the existing question
bank on the production Data tab.
