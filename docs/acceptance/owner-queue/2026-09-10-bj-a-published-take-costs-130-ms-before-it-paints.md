---
kind: walk
date: 2026-09-10
---
# A published Take waits 130 ms on the wire before the picture moves - and here is how to check that at the venue

Yesterday's round answered the local half of your lag report: on the app we ship, an **unpublished**
production answers Take in about 30 ms. This round measured the other half, the one that had never
been tested - a production that has been **published**.

It is slower, and the reason is deliberate. On a published production the verbs do not touch your
own PROGRAM monitor at all. They go to the server, and your monitor moves only when the row comes
back round over the live connection - the same row every other operator and the output page get.
That is what keeps two people driving one show from ever disagreeing, but it means your own screen
waits for a round trip that a local production does not.

**Measured from this laptop on 2026-09-10, against the real backend:**

| | |
|---|---|
| the Take command reaching the server and being accepted | **98 ms** |
| the row arriving back here, which is when your monitor may move | **131 ms** |
| the app then applying it and drawing the frame (measured yesterday) | about **30 ms** |
| **so: press to picture, published** | **about 160 ms** |
| the same press on an unpublished production | about **30 ms** |

160 ms is not broken, but it is the difference between the picture answering your finger and
answering a beat after it. **And it scales with the network you are on, not with anything we
control.** This laptop's round trip to the backend is about 36 ms today. On a venue's wifi at 150 ms
it would be roughly 350-450 ms to picture - which is exactly what you described on 2026-09-05.

Two things it is NOT, both tested rather than assumed: it does not get worse as the show goes on
(the same Take costs the same with an empty log and with 50,000 rows behind it), and it is not the
graphics or the dashboard, which are the 30 ms at the end.

## The route, under a minute

```
node scripts/playout-wire-probe.mjs
```

Fifteen seconds, no browser, nothing to set up. **Run it on the venue's wifi on Saturday, before the
rehearsal.** It creates one throwaway production, presses the same three commands a Take sends, and
deletes it again.

**What to look at.** The last two lines. `fanout` is how long your PROGRAM monitor will wait before
it moves, and about 30 ms goes on top of it for the picture. Under about 150 ms and a published
production will feel fine; several hundred and you will feel every Take, and the answer for that
night is to run the rehearsal **unpublished** unless you need the output URL or other people's
phones - unpublished, every verb is local and instant.

If a line says a take never came back over the live connection, that is the more serious reading:
the page then falls back to a poll that only runs every 30 seconds.

## What we are doing about it

The fix is to move the picture on the press and let the round trip confirm it, instead of waiting
for it. That is a real change with a real trap - applying locally *and* accepting the echo plays
every entrance twice, and a doubled entrance leaves no trace on screen - so it is written up with
the design settled rather than rushed in before Saturday. Nothing about Saturday depends on it:
unpublished is instant today, and published is 160 ms on a decent network.

Branch `claude/bj-published-path-lag`.
