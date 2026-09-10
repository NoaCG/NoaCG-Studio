---
kind: agent
date: 2026-09-10
---
## Re-kinded to `agent`, 2026-09-10 - the four reasons drain

The item says so itself: 'Nothing needs you. This is a fix to something we shipped the same day,
not a decision waiting on you.' The route is drivable in a second browser window.

It stays here until an agent drives the route below and records what it saw. Its original
text follows, unchanged; the re-kinding rules are in `docs/acceptance/OWNER_QUEUE.md`.

# An output URL renders the show and cannot operate it - 2026-09-10

**What changed.** This morning's speed fix gave a published verb a second road: a realtime
broadcast that every screen applies the moment it lands, which is what took a Take from half a
second to about a tenth. It shipped on a PUBLIC channel whose address anyone holding the output URL
could work out, so a link that was only ever meant to render the show could push a `play` or a
`stop` onto every screen in the building. It never reached the log and never left a record, which
is exactly what made it worth fixing before Saturday: the damage was a graphic appearing or
vanishing mid-programme with nothing to explain it.

The commands now travel on a private channel that only the database writes to. Sending one still
needs the control link, the same as it always did to write the log. Reading is unchanged: whoever
you give the output URL to still renders everything.

## The route, under a minute

1. Open a production and press **Publish**. The links popover gives you the CONTROL link and the
   OUTPUT link.
2. Put the OUTPUT link in a second browser window (or in OBS, or in the venue's playout machine).
3. Press **Take** on the desk. It should be on the output window about as fast as it is on your own
   monitor - a tenth of a second rather than the half second you reported.
4. Press **Out**, then **Take** again a few times. Every press should land once, at the same speed,
   with no press that mysteriously takes half a second longer than its neighbours.

**What to look at.** Speed, and that nothing plays twice. The security half cannot be seen by
hand - proving it takes a spec that forges a command, and
`e2e/configured/output-url-cannot-push.spec.ts` is that spec: it holds only the output link, pushes
a play on every channel it can reach, and requires the renderer's entrance count not to move. It
was run against this morning's code first and the graphic PLAYED, which is how we know the test is
measuring something real.

**Measured, if you want the numbers** (`node scripts/playout-wire-probe.mjs --takes 16`, thirty
seconds, no browser, and worth running on the venue's wifi): a Take reaches a second screen in a
median of 87 ms, worst 215 ms. The durable log road, which is what everything used before this
week, was 131 ms with the odd press landing at 650 ms or worse. The public channel this replaced
was 51 ms; the boundary cost about 35 ms, and it is the difference between a link you can hand
around a room and one you cannot.

**Nothing needs you.** This is a fix to something we shipped the same day, not a decision waiting
on you. The one thing worth knowing before Saturday's rehearsal: the output link is now safe to hand
to anybody who needs to see the show. The control link is still the one that operates it, so treat
that one the way you would a key.
