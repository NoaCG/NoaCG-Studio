---
v: 2
source: owner
kind: ask
raised: 2026-08-28
state: advanced
note: >-
  End credits landed on claude/d-scroll-speed-and-through: every credits design with motion emits
  an operator speed field (number, percent, default 100), and the roll and the crawl run the list
  all the way off the frame with the logo/year arriving afterwards as its own beat. TICKERS ARE
  NOT DONE - tk* designs still have no speed field. The run-through half does not apply to them (a
  marquee is endless by contract), so what is left is the field alone: append one last field in
  src/templates/tickers/shared.ts and multiply tickerMarquee()'s 140 px/s and tickerFlipCycle()'s
  hold by it, exactly as creditsMotion.ts does.
asked: "anything with scrolling graphics should have a speed setting in the control panel, and the scroll runs all the way through by default"
---
# Scrolling graphics: operator speed, and scroll-all-the-way-through

Owner walk 2026-08-28, on end credits (the paste field itself accepted: "the fields work
great"). Two requirements for ANYTHING that scrolls - all end credits included:

1. **Speed is an operator control.** "Anything with scrolling graphics should have a speed
   setting in the control panel."
2. **Scroll all the way through, as the DEFAULT.** Today the roll ends with the last names on
   screen and the logo held in the middle. Instead: the scroll runs fully off screen; then,
   optionally, the logo or an end text comes in as its own later beat. "You have the scroll
   part go to the end, and then, if you want, you can have the logo or some other text come
   in later."

Owner notes this shades into fully custom graphics (future); for now exactly these two.
Belongs to the credits proving round (first of the class, next wave) - it amends the credits
operator story: paste one list, separator splits role/name, operator speed, scrolls fully
through by default, optional end beat.

## What is left (2026-09-06)

The tickers. They are a different case for requirement 2 and the same case for requirement 1:

- `ticker-marquee` travels `repeat: -1` and never ends, so "runs all the way through" has no
  meaning there - the strip runs while the show continues and is taken off by `stop()`. Same for
  `ticker-flip`, which cycles items forever. There is no closing mark to arrive after either.
- The SPEED field does apply, and is the same small patch as the credits one: one appended
  `number` field with a hidden `.noacg-data-source` holder, read by a `tickerSpeed()` beside
  `motionSpeed()` in `src/templates/tickers/tickerMotion.ts`, multiplied into the 140 px/s marquee
  rate and the 3.2 s flip hold. Left out of the credits change only because that branch owned
  `src/templates/endCredits/` and nothing else.
