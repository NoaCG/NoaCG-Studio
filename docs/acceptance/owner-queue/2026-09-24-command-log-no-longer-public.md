---
kind: walk
date: 2026-09-24
because: scope
---
# The command log is no longer public

**Date:** 2026-09-24

## What changed

Anyone holding the site's public key could list every production's command log: the field values
sent to air, staged data that had not aired yet, and every production's id. On 2026-09-24,
before the fix, that read returned 1,402 rows across 13 productions on the live site. Now the log
answers only the production's owner and, on a team production, its current members. Renderers and
operator pages receive the log on a private channel that the database writes and a holder of the
link can read. It is also quicker. Measured from a signed-out reader on the live backend, a Take
reached another screen in a median of 193 ms on the new channel against 638 ms on the old one.

## The cost

- Graphics exported before 2026-08-05 carry an old built-in receiver that listens only on the
  closed road. They no longer react to Take and Out live. They still catch up each time they
  reconnect. Export them again to fix it, because new exports carry no built-in receiver.
- A renderer open in OBS or CasparCG that was last loaded before about 15:30 UTC on 2026-09-24,
  when the private channel went live, needs one reload. Until then it follows the log only through
  its 30-second safety poll.

## The route, under a minute

1. Open a production, press Start production, and open its Output link in a new tab.
2. Press Take on the dashboard. The graphic plays in the output tab within a moment.
3. Press Out. It leaves.

## What to look at

- That Take and Out on the output tab feel as quick as before, or quicker.
- If a venue machine still runs a renderer opened before this landed, reload it once.
