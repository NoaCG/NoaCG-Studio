---
kind: walk
date: 2026-09-22
because: direction
serves: now
---
# Friday polish: Reveal choice, the empty activity log, and the wizard's dashes

The rehearsal walk on 2026-09-21 left three things a student would stumble on. All three are
changed here.

- **Reveal choice is explained, not hidden.** It is a real button: it belongs to the hidden-pick
  road, where you lock the answer without showing it and reveal the pick as its own moment. So it
  stays on the dashboard, greyed out on the normal road. The docs' quiz Buttons list now has a
  paragraph that says when it lights up and what it does. Hovering any greyed-out action now says
  "Reveal choice does nothing from where the graphic is now, so it is greyed out" instead of the
  machine's event id ("revealChoice has no arrow out of the current state").
- **The empty activity log says why.** A production that is not published keeps its log in the
  tab, so after a reload the list is empty. Row C pinned that a reload brings nothing back on air,
  so I kept the log the same way and changed its empty line to: "Every Take, Update, Next and Out
  lands here. This production is not published, so the list starts empty each time the page
  opens." A published production keeps the old line, since its log comes back from the server.
- **No em dashes left in the wizard.** Every one in the wizard's own text is gone, rewritten as
  plain sentences. The two you named now read "Add to the production and go live" and "Auto
  (recommended)". The Entry cards read "Pick a design, one graphic or the whole kit a show needs
  in one look. Then choose..." and "Bring your own artwork, no AI. ...". The "not on air" tooltip
  on the dashboard's actions lost its dash too.

## The route, under a minute

1. Open https://noacg.studio/docs.html#quiz-run and read the paragraph under the four quiz
   buttons. It should say when Reveal choice lights up.
2. Open a production that has the quiz (the Friday Quiz, or any production with an imported
   `quiz.svg`). Take the quiz and hover the greyed-out **Reveal choice**. The tooltip should be
   the plain sentence above.
3. Reload the page and open **Activity** under the controls. It should say the production is not
   published, so the list starts empty.
4. Press **+ New graphic** and look at the Entry cards. Then walk to the Animation step and open
   the easing list (it should read "Auto (recommended)"), and on to Finish ("Add to the production
   and go live").

## What to look at

Whether the Reveal choice paragraph reads clearly to a student who has never heard of a hidden
pick. If it still confuses, the other choice is to take the button off the dashboard for every
quiz, which also removes the hidden-pick road.
