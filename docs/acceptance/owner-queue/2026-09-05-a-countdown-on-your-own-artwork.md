---
kind: agent
date: 2026-09-05
serves: now
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

All four of its picky calls are argued to a conventional answer inside the item itself - one Start
button because every consumer stopwatch says Start, ten seconds because a thirty-second warning on
a thirty-second question never warns, no paint on artwork nobody drew, and Pause legality read
from the states. Nothing is left but whether the countdown behaves as described, which an agent
drives.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# A countdown you can hold, on artwork you drew

You asked on 2026-09-03 for more behaviours than the quiz and the vote, and you named the method:
*"We just need to follow how other programs do them."* So seventeen products were read first
(`docs/BEHAVIOUR_SURVEY.md`), and a countdown is what came second in that table behind "it comes on
and off". The score tracker was third and had shipped two days earlier, so this is the next one.

Until now a clock layer on imported artwork started when you took the graphic and then could not
be touched at all. No hold, no restart, and no way for a drawing of yours to react to the time
running out.

**Route, under a minute:** `/app` -> **Import graphic** -> drop
`e2e/fixtures/svg-corpus/illustrator-question-timer-board.svg` -> **Next**. The "What it does"
section already says **Countdown**, with all four drawings picked. **Next**, **Next**, name it,
make a production, **Add**. Then press **Take** and watch it.

## What to look at

1. **It starts when you Take it**, and the bar under the clock drains with the digits. That is your
   own 2026-08-27 story for a timer, kept: the length is set beforehand, the take starts it, and at
   zero it holds at 0:00 until you take it out.
2. **Pause holds it, and your own TAUOLLA strip says so.** The clock stops where it is; Start picks
   it up from there rather than from the top.
3. **Reset puts it back to 5:00 and leaves it there**, not counting. That is the "3, 2, 1, go" road:
   Reset, then Start when the class is ready.
4. **The last stretch and the moment it runs out are your drawings.** Type `0.15` into the
   **Clock (minutes)** box, press **Update**, then **Start**: nine seconds is inside the warning
   threshold from the first tick, so the panel goes red immediately, and at zero the AIKA plate
   replaces it.
5. **The length is a field you can correct on air.** Change it mid-count and the clock re-arms
   without the graphic replaying its entrance.

## What is picky and yours to judge

- **One Start button, not a Start and a Resume.** Both mean go, and every consumer stopwatch says
  Start after a pause and after a reset - so there is one button, greyed while the clock is
  running. If you would rather read "Resume" after a pause, that is two buttons and a second arrow.
- **The warning is at ten seconds by default.** A thirty-second question with a thirty-second
  warning is never actually warning, which is why it is not thirty; there is a **Warn at (seconds)**
  box beside the length if a show wants otherwise.
- **A board with no held mark drawn shows nothing when you pause it.** The catalog countdown dims
  its own clock; we will not paint on artwork you drew. Worth knowing before somebody draws a timer
  and skips that layer.
- **Pause stays pressable at 0:00.** It shows the held mark over a stopped 0:00 and Reset clears
  it. The button legality is read from the states, and the states cannot see the clock.

## What it does NOT do, deliberately

**No "add a minute" to a running clock.** vMix and H2R both have it and it is a real need when a
segment overruns - but every cheap version puts a wrong number on air. Adding to the minutes field
re-arms the whole count, so +1 min on a clock reading 0:20 of 5:00 would show 6:00; moving the
deadline inside the graphic instead would air a count your own box no longer describes, and your
next Update would undo it. Filed with the reasoning rather than guessed at:
`docs/backlog/adjust-a-running-clock.md`.
