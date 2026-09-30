---
v: 2
source: owner
kind: finding
raised: 2026-09-30
state: unstarted
found: "On the studio laptop, pressing Next on a quiz graphic went straight to its last state (the reveal) instead of stepping through its states."
size: small
needs-owner: none
---

# Next on a quiz jumps to the last step

## Why

The owner pressed Next on a multi-step quiz graphic during the 2026-09-30 studio test, through
NoaCG Bridge and CasparCG, and it went straight to the reveal. His shows drive quizzes with their
own buttons, so it does not block him, but Next should step through a graphic's states one press at
a time, as it does for other multi-step graphics.

## What it would take

- Reproduce with the quiz he used (ask which one, or try the catalog quizzes) on the production
  page and on a CasparCG output; find whether the graphic, the Next verb or the new numbered command
  path (Phase 6 Step 2) is skipping steps.
- A spec that presses Next through every step of a quiz.
