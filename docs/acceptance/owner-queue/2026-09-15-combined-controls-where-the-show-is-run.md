---
kind: walk
date: 2026-09-15
because: taste
serves: now
---
# The combined control, on the page the show is actually run from

One press, several rows, some of them later - now on the hosted control page, which is the surface
you will be holding on 2026-10-20. Same button, same ticks, same countdown, same
cancel as the in-app page: one component draws it and one resolver decides what it sends, so the
two cannot drift into two behaviours.

The exported offline package deliberately does not get it. Where a production has combined
controls it now says so in one line instead of quietly missing the buttons.

## Route A, the hosted page - needs the cloud, about two minutes

Signed in, from this feature worktree with `npm run dev`:

1. Home -> **Productions** -> **Import pack** -> pick
   `e2e/fixtures/agent-made/elamani-biisi.noacgpack.json`. You land on the production page.
2. **CONTROLS** -> **+ Combined control**, name it `Reveal + points`. First step: *Act on*
   `Votes board`, *Control* `Song Reveal performer`, **+ Add step**. Second step: *Act on*
   `Totals board`, *Control* `Panelist 1 +1`, **after `5` s**, **+ Add step**.
3. **Publish** the production, then open its `?control=` link - a phone is the honest test, and
   a second browser window is the quick one.
4. On the hosted page: **⟳ TAKE** the first cue, click the second cue, **⟳ TAKE** it, click back
   to the first.

### What to look at

- **Under the ⚡ block, below the graphic's own sections, a `Combined` heading** with the button
  in it. Before you took anything it was greyed, and its hover named the FIRST step and why it
  could not go - never the later ones, because a walk's later steps are illegal at the moment its
  first one is pressed.
- **Press it once.** The reveal goes at once; the button then wears the amber accent and counts
  `5 · 4 · 3`; five seconds later the point lands on the other board. Open **Activity**: one row
  per step, in order, on the same log every Take lands on, attributed like everything else.
- **Press the countdown while it runs**, or press ■ Out. The tail never goes and the feed says
  how many steps did not. This is the half that has to work under pressure.
- **Now open the same link in a second window and try it as two operators.** The countdown runs
  only in the tab that pressed - the wait lives there, nothing is retried elsewhere - but every
  row it sends lands in both feeds and both monitors. Bump the score on the second window while
  the first is still counting down: when the step fires it carries that figure plus one, because
  it reads the WIRE at the moment it fires rather than what was on screen when you pressed.
- **Reload the page mid-countdown.** The unsent tail is gone, by design, and the button's hover
  says so. That is the cost §6d accepted instead of building persistence, and it is the one thing
  here I would change if you want it changed - it is expensive to add later.

## Route B, the exported package - offline, under a minute

On the same production, with the combined control composed: **Export** -> the local-control
(HTML overlay) package, unzip it, open `controller.html`, click a cue.

Where the `Combined` section sits on the two hosted pages you get one line:

> This production's combined controls run from its hosted control page

and nothing else of it - no button, no countdown, no tick. The package carries a single boolean:
not the control's name, not its steps, not its timings. That is your 2026-09-15 ruling held at the
one place it needed holding, and it is honest degradation rather than the silence a production got
before, where the buttons it had composed were simply absent and nothing said why.

The graphic's own ⚡ actions and the production's ARRANGE are untouched in that package. Those are
presentation of what the graphic itself declares, so they still render on all three surfaces.

## What is not proved by a green gate

The hosted page cannot be mounted by the offline test suite at all - it needs a configured
backend - so the merge gate pins its RESOLUTION over the published bytes (the wire baseline, the
dropped step, the greying) and not its buttons. Route A above is the buttons. The exported line is
pinned end to end, package and page.
