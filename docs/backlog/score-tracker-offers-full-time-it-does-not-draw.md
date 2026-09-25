---
v: 2
source: derived
kind: finding
raised: 2026-09-25
state: unstarted
found: "an imported score tracker with no Full time layer still gets a Full time button on the dashboard, and pressing it changes the state to Final with nothing visible on air"
serves: NOW
size: small
touches: src/templates/behaviours/score.ts
covered-by: none
needs-owner: none
---

# The score tracker offers Full time on a board that draws no Full time

The classroom package's `score-tracker.svg` (docs/tutorials/classroom-package) has `Flash 1` and
`Flash 2` in its `Moments` layer and deliberately no `Full time`, to stay simple. NoaCG still
recognises it as a score tracker and the dashboard's BOARD row shows three buttons: Clear flash,
Full time and New game.

Measured on https://noacg.studio at commit 60b3e8d1 on 2026-09-25, logged out, 1366x768: after
Take, pressing Full time moved the graphic actions chip to "On air · No flag · Final", the +1
POINT flash went away, and nothing else changed on air. No layer carried the class
`imported-design-on`. A student who presses it sees a button that does nothing.

What to decide: offer Full time only when the artwork draws a moment for it (the same rule the
quiz follows for its states), or keep the button and say on it that this board has no Full time
look. The first is the one that matches "the graphic declared them" under CONTROLS.

Evidence: the row J live walk, `docs/handoffs/2026-09-24-j-classroom-live-walk.md`.
