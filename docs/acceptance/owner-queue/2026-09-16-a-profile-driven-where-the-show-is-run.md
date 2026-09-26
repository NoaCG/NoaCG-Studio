---
kind: desktop
date: 2026-09-16
because: taste
serves: now
---
# Run a show from the hosted control page: would you trust it on air?

A production can now arrange its graphics' controls (order, a shown name, pinned and hidden under
a **More** drawer) and add a combined control: one press that sends several steps, one of them a
few seconds later, some offered as ticks the operator decides on the night. It works on the in-app
production page and on the hosted control page an operator opens from a phone. The hosted walk runs
in the configured suite on every landing (`e2e/configured/hosted-control-profile.spec.ts`), which is
green on `main`. Whether it feels right under pressure is yours.

## The route, about five minutes, signed in

1. /app, Home, **Productions**, **Import a package file…**, and pick the two-board pack in
   `e2e/fixtures/agent-made/`. You land on its production page with two cues.
2. Open **CONTROLS**. Pin one panelist's **+1**, hide **New game** under a new name, then add a
   **Combined control**: the votes board's **Reveal performer**, then two panelists' **+1** on the
   totals board, the first **after 5 s**, both **Ask, ticked**.
3. **Publish**, open the control link on your phone and the output link in a browser window.
   **Take** both cues from the phone, untick one panelist, and press the combined button. Press it
   again while it counts down.

**What to look at.** Whether the arranged block reads as the panel you would want under your hand,
whether the countdown and its cancel feel safe mid-show, and whether a greyed button's hover tells
you enough. A reload mid-countdown drops the unsent steps by design (the button says so); say if
that is not acceptable.

**On the machine with SPX, run step 3's output through SPX instead of a browser window.** In the
production's links, the **Template file** row's **Download** gives one `_output.html`; put it in
SPX's `ASSETS/templates`, add it to a rundown and press Play, then drive the show from the phone as
above. That is the door recommended for this show (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6h), and it
has never run on a real SPX: say whether SPX listed it, whether Play put the output up over clear
video, and whether the combined press moved the board inside SPX's output.
