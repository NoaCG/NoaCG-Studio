---
kind: walk
date: 2026-09-10
---
# A published Take takes half a second to reach the screen. Unpublished it takes 30 ms

Yesterday's round answered half of your lag report: on the app we ship, an **unpublished**
production answers Take in about 30 ms. This round measured the other half, which had never been
tested - a production that has been **published**. It is much worse than expected, and it is not
your laptop, your network, or the graphics.

**Measured on the built app, against the real backend, five rounds each, both halves in the same
browser in the same minute:**

| | press to picture |
|---|---|
| Take, **published** | **515 ms** |
| Out, **published** | **397 ms** |
| Take, same production **unpublished** | **30 ms** |
| Out, same production **unpublished** | **32 ms** |

That is seventeen times slower, and half a second is well past the point where a Take stops feeling
like it belongs to your finger. It is what you described on 2026-09-05.

**Where the time goes.** On a published production your verbs do not touch your own monitor at all.
They go to the server, and every screen - yours, the other operators', and the **output page the
audience sees** - moves only when the row comes back. The server accepts the command in about 120
ms. The row then takes another 220-350 ms to come back. That second half is the problem, and it is
not ours: it is the delivery mechanism we chose. Measured from a plain script with no browser, from
an empty browser page, and from the real dashboard, it is always the same shape - **either about 130
ms or about 600 ms**, unpredictably.

**Air is late too, not just your monitor.** This is the part that matters most. Because the output
page follows the same road, what the audience sees is also up to half a second behind your press.

## The route, under a minute

```
node scripts/playout-wire-probe.mjs
```

Fifteen seconds, no browser, nothing to set up. **Run it on the venue's wifi on Saturday before the
rehearsal** - it creates one throwaway production, presses the same commands a Take sends, and
deletes it again.

**What to look at.** The `fanout` column and the median under it. About 30 ms goes on top of that
for the picture. If you want to feel it rather than read it, open a production with a few cues,
press Take, then press **Start production** to publish it and press Take again - that is the 30 ms
and the 515 ms, back to back.

## What to do about Saturday, and what we are doing after it

**For the rehearsal: run it unpublished if you can.** Unpublished, every verb is local and instant.
You need publishing only for the output URL and for other people's phones - if the rehearsal needs
either, it needs publishing, and half a second is what it costs today.

**The fix is a transport change, and it is measured, not guessed.** Supabase has a second channel
for exactly this kind of message, and the same test on it gives **50 ms, every single time, with no
slow mode at all**. So a verb should go out twice from one press: once on the fast channel, which is
what moves every picture, and once into the durable log exactly as now, which stays the thing that is
right and that a renderer joining late catches up from. That fixes air as well as your monitor.

It is written up with the design settled, including the trap - a command that arrives on both roads
must play once, and a graphic played twice looks identical to one played once, so this is a change
that needs its own test against a real backend. It is deliberately **not** being made two days
before your rehearsal.

Branch `claude/bj-published-path-lag`.
