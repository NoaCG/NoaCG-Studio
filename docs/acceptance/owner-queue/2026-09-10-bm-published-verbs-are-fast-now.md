---
kind: agent
date: 2026-09-10
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

Sixteen presses on the wire, before and after. The item asks nothing; it reports a fix to a lag
the owner reported, and the probe re-derives it in thirty seconds.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# A published Take is fast now, and so is air

Yesterday's note said a published Take took 515 ms to reach the screen and a published Out 397 ms,
against 30 ms for the same production unpublished. This is the fix for that, and it is measured.

**On the wire, sixteen presses, this laptop, this afternoon:**

| what a second screen waits | before | after |
|---|---|---|
| Take | 131 ms, with one press in four at **404-637 ms** | **51 ms**, every single press between 48 and 59 |
| Out | 138 ms, same slow mode | **52 ms**, same |

About 30 ms of drawing goes on top of both, so a published Take now airs in about **80 ms** on
every screen that is not the one you pressed. **On the screen you pressed it is instant** - your own
PROGRAM monitor no longer waits for the server at all, which it used to do on every single verb.

The number that matters most is not the median, it is the spread. The old road has two modes and
picks one unpredictably, so one Take in four was more than half a second late with nothing to
explain it. The new one did not do that once in sixteen presses.

## What changed, in one paragraph

A verb now leaves your press twice: on a fast channel that moves every picture, and into the durable
log exactly as before, which is still the thing that is RIGHT - recovery, the activity log and a
renderer that joins late all read that and nothing else. Each command carries an id your browser
mints, so whichever copy arrives first is the one that plays and the second is recognised and
dropped. That last part is the whole risk: a graphic played twice looks identical to one played
once, so it now has its own test against the real backend, and that test was deliberately broken
first to prove it fails (it reads `Expected: "1" Received: "2"`).

## The route, under a minute

```
node scripts/playout-wire-probe.mjs
```

Thirty seconds, no browser, nothing to set up. It creates one throwaway production, presses the
same commands a Take and an Out send, and deletes it again. **Run it on the venue's wifi before the
rehearsal** and compare the two columns there.

**What to look at.** The `fastMs` column against the `slowMs` column: the first is what the picture
waits for now, the second is what it waited for before, for the same press a millisecond apart. If
you want to feel it rather than read it, open a production with a few cues, press Take, then press
**Start production** to publish it and press Take again. Those used to be 30 ms and 515 ms; they
should now feel like the same press.

## What I would still watch on the night

**If the fast channel cannot get through, nothing breaks - it goes back to being as slow as it was
yesterday.** The log is still written and every screen still follows it, so a venue that blocks or
throttles the channel costs you the improvement and nothing else. Worth knowing so you can tell the
difference between "slow again" and "broken".

**One thing genuinely changed shape.** If a verb reaches the screens and the log then refuses it
(the command-rate limit, or the network dropping at exactly that moment), the picture has moved and
nothing recorded it. The dashboard now says exactly that instead of "Take failed", because those
are different sentences and you would act differently on each. You should not see it; if you do, the
honest reading is "press it again".

## Consolidated 2026-09-10 - and the item this replaces was actively misleading

`2026-09-10-bj-published-take-is-half-a-second.md` measured the lag (Take 515 ms published, 30 ms
unpublished) and told the owner what to do about Saturday:

> **For the rehearsal: run it unpublished if you can.** Unpublished, every verb is local and
> instant.

That advice was true for about six hours and is wrong now: a published Take reaches a second screen
in 51 ms and airs in about 80 ms, and this item is the fix that made it so. Leaving both on the
queue would have handed him a measurement and its own contradiction in the same list, so bj is
folded in here and deleted. Its numbers survive above as the "before" column, and its handoff,
`docs/handoffs/2026-09-10-bj-published-path-lag.md`, still cites it by filename - that citation
resolves through this item and through the Dropped log in `docs/acceptance/OWNER_QUEUE.md`.

The one thing bj said that this item does not repeat: on the old road the shape was **either about
130 ms or about 600 ms, unpredictably**, measured three ways - a plain script with no browser, an
empty browser page, and the real dashboard. That two-mode behaviour is what made one press in four
late with nothing to explain it, and it is why the spread rather than the median is the number to
read.
