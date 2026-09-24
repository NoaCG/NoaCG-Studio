---
kind: walk
date: 2026-09-24
because: direction
serves: now
---
# The hosted control page now greys » Next and names what ✎ Update keeps, like the dashboard

The in-app production dashboard already grey `» Next` on a graphic's last step and names the
states `✎ Update` would keep on a reveal (`docs/handoffs/2026-09-21-g2-dashboard-demo-defects.md`).
The hosted page - the one an operator opens on a second device with no login, at
`<app-url>?control=<slug>` - carried the same two verbs but not the same answers. It now asks the
same two functions (`canAdvance` and `movedStateNames`, `src/control/controlModel.ts`) the
dashboard asks.

## The route, under a minute

The hosted page needs a published production and a configured backend, so this walk is the
in-app equivalent that exercises the same computation (the hosted page reads its own copy of the
identical machine data - see `e2e/hosted-control.spec.ts` for the offline pin of the wiring
itself).

1. Open a production that holds the imported quiz (`docs/svg-samples/quiz-board.svg`) and take it.
2. Select answer, lock it in, reveal correct.
3. On the HOSTED control page for the same production (`?control=<slug>`, needs a publish and a
   configured backend), select the same quiz cue and hover `» Next`.
4. Type a new question into the on-air quiz cue on the hosted page. Read the note beside the cue
   name, then hover `✎ Update`.

## What to look at

- On the hosted page, `» Next` is grey once the quiz is on its Reveal, and its tooltip says the
  graphic is on its last step - the same tooltip the in-app dashboard shows.
- The note under the hosted cue names Reveal as the state `✎ Update` keeps and points at
  `⟳ Re-take`, and `✎ Update`'s own tooltip reads "Sends the values. Stays on Reveal."
