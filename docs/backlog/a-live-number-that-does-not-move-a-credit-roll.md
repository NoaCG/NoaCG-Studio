---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "the production dashboard offers a credits roll's Scroll speed (%) in its ± LIVE NUMBERS
  row, which says one press changes the figure on the live graphic, and for that field it does
  not: the roll keeps the pace it was taken at"
size: small
touches: src/templates/endCredits/creditsMotion.ts, src/templates/endCredits/shared.ts
---
# A live number that does not move a credit roll

**Filed:** 2026-09-09. **Source:** measurement, while giving the tickers the same field.

## Why

`ProductionPage.tsx` builds its ± LIVE NUMBERS row from the template alone - every operator-visible
`number` field that no event carries as payload - and states plainly that one press "changes the
figure on the live graphic and keeps this cue in step, no Update needed". That is true of a score
and a goal total, because `update()` writes the value and the graphic draws it.

It is not true of a speed. `creditsSpeed()` is read inside `creditsRoll()` / `creditsCrawl()` /
`creditsPages()`, which run once at `play()`, so a new percentage arriving through `update()` sits
in the holder and changes nothing. The operator presses **+** on a roll that is on air and watches
it keep the old pace. A control that does nothing is the failure the field was added to prevent,
and here the surface is the one asserting it works.

Twelve credits designs have this today (everything except the static board).

## What it would take

The same shape the tickers just got, which is about fifteen lines. `creditsMotion.ts` keeps a
handle on whatever the live builder returned and the speed it was built at, and a
`creditsApplySpeed()` sets `timeScale(creditsMotionSpeed() / builtAt)` on it; the credits runtime's
`update()` calls it after rebuilding the rows. A timeScale rather than a rebuild is the point: a
rebuild would honour the number and snap a half-finished roll back to its start, which is worse
than ignoring it.

One thing needs deciding that the ticker did not: a roll has an END BEAT, so scaling the timeline
mid-roll also scales the closing mark's arrival. That is probably right (a faster roll should reach
its mark sooner) but it is a judgement, not a copy of the ticker.

## Evidence

The ticker side, measured in Chromium on the generated tk01 with real GSAP: 139.8 px/s at 100%,
560.8 px/s the instant `update({f2:'400'})` reaches the running strip, 69.9 px/s at 50%, with no
restart. `scripts/ticker-speed.test.mjs` pins the ratios. The credits path has no equivalent
because there is nothing to measure: the tween's duration never changes after `play()`.
