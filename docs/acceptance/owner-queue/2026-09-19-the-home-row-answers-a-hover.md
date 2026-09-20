---
kind: walk
date: 2026-09-19
because: taste
serves: now
---
# The Home row on the wizard's first screen answers a hover like the cards do

## Before

On the wizard's entry step every creation card answered a hover with an amber border, a lighter
`--bg-2` fill and a 2px lift. The **Home** row above them answered with a grey border nudge
(`--border` to `--border-strong`), no fill change and no movement, and its transition listed
`border-color` alone. Measured under the pointer: border `rgb(51,57,74)`, background unchanged at
`rgb(18,20,26)`.

That made it the only hover in the wizard breaking the shell's own rule - the "ONE AMBER ANSWER FOR
THE WIZARD'S OWN CHROME" note in `wizard-and-dialogs.css`, which even this row's own two shortcut
buttons keep. The row's body button had deliberately given its border, fill and lift up to the row
so the three controls read as one object, and nothing had taken over answering for it.

## After

Hovering the body of the Home row turns its border amber and fills it `--bg-2`, the same two
properties and the same 0.14s as a creation card.

Two deliberate limits:

- **No lift.** `translateY(-2px)` says "a card you pick up". On a 1180x72 shelf it reads as the
  whole band twitching, and the pointer is often over a shortcut when it fires, so the button you
  are about to click would move under the cursor.
- **Only the body asks for it.** Over "Graphics" or "Productions" the row keeps its old grey and
  only the shortcut goes amber. A hover says what a click will do; an amber row wrapped around an
  amber button is two highlights for one target and neither owns the click.

Keyboard focus now gets the same answer. There is no project-wide `focus-visible` rule, so tabbing
to the body drew the browser's ring around the inner 948px button - which exposed exactly the
nested-card shape the row's design exists to hide. The ring is routed to the row's own border and
fill instead; the two shortcuts keep their own rings, which is right for a discrete button.

The resting state is untouched, so Home is still not the action the step recommends. Only the
answer was unified, never the weighting.

## Route (under a minute)

1. `npm run dev`, open `/app`. The wizard's entry step is the first screen.
2. The **Home** row only appears when there is saved work. If it is missing, make any graphic
   first (Start from a template, pick anything, Finish), then press **+ New graphic**.
3. Hover the left part of the Home row - the ⌂ glyph, "Home", or its grey line.
   - **Before:** a faint grey border, nothing else.
   - **Now:** amber border and a lighter fill, matching the cards below it. No lift.
4. Slide across to **Graphics** or **Productions** without leaving the row: the row drops back to
   grey and only the button you are on goes amber.
5. Press Tab until the Home body takes focus: the row lights the same way, with no ring around an
   inner box.

## What I saw when I did this myself

Driven in the running app at 1366x768, computed styles read under a real pointer. Over the body:
border `rgb(246,166,35)`, background `rgb(20,25,34)`. Over the "Graphics" shortcut: row back to
`rgb(51,57,74)` on `rgb(18,20,26)` with the button itself at `rgb(246,166,35)`. Resting:
`rgb(38,47,60)`.

I tried the lift before deciding against it, and the reason held up on screen rather than only in
argument: the two shortcut buttons ride inside the row, so the row rising takes them with it.

## What I decided, and what is left for your eye

- **The lift is withheld.** The cards keep theirs. If you would rather the row match them to the
  last property, it is one line back.
- **Hovering a shortcut leaves the row grey** rather than lighting both. That is the call about
  which of two nested targets a highlight belongs to.

## What changed

`src/styles/wizard-entry.css`: one `:has()` rule carries the amber answer for both `:hover` and
`:focus-visible` on the body button, the plain `:hover` keeps the grey for the shortcut case, and
the rule that drops the inner ring sits behind `:has()` too - so where `:has()` is unsupported the
browser's own ring stays rather than a keyboard user being left with no indicator at all. The
reasoning is commented there. `e2e/wizard-entry-fit.spec.ts` pins all four states against the
cards' own answer rather than a colour literal.
