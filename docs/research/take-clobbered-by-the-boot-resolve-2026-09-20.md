# A take undone by the production page's own boot resolve

Investigated 2026-09-20. **The window described here is real in the code and is now guarded. It
was NOT shown to be the cause of the hosted `relay-cold-boot` failures, and two attempts to
reproduce it failed.** Read the last section before treating the flake as fixed.

## What was seen

`e2e/configured/relay-cold-boot.spec.ts` hung for its entire 300-second budget on a disabled
`verb-out`, then passed in 28 seconds on the retry. Two other specs failed the same way in the
2026-09-20 scheduled run. Round-trip latency was 154-194 ms throughout, against a documented
~207 ms baseline, so this was never general slowness.

The failure artifact records the dashboard's own DOM at the moment it gave up:

- `PROGRAM — ON AIR nothing on air`
- the machine-state chip reading `not on air`
- `Out`, `Update`, `Re-take` and `All out` all `[disabled]`, with only `TAKE` live

So the dashboard believed nothing was on air. The spec had already asserted, over the wire, that
the server's `live_cue` held the take, and the board had already applied `play` from the log. The
disagreement was local to the page. That much is established.

## The window in the code

`src/components/home/ProductionPage.tsx` keeps `liveCue`, a map of which cue is on air per
graphic. Every verb but Take is gated on it. It moves in two ways: the boot effect seeds it
wholesale from `controlShowBySlug`, and this operator's own verbs move single entries.

The seed sits behind an `await`. A Take pressed while that round trip is in flight moves the map
first, and the answer then lands carrying the picture from before the press and replaces it. That
is a genuine staleness hole: a wholesale overwrite applied without checking whether the thing it
overwrites moved while the request was out.

It is now guarded. `liveCueMoves` counts local moves of the map; the effect reads it before its
`await` and seeds only if it has not moved since. The replace is skipped outright rather than
merged, because the wire's map is a snapshot rather than a diff - merging would put a layer the
operator had just taken OFF back on air.

## What could NOT be shown

**The guard is hardening. It is not a demonstrated fix for the hosted flake.**

A spec was written to pin it and then removed, because it passed against the unguarded code twice
and so pinned nothing:

1. **Holding the resolve open** with an unresolved promise. Vacuous for a reason worth recording:
   a request held that long fails, `controlShowBySlug` answers `null` on any error
   (`src/control/hostedControl.ts:515`), and the effect already bails on null before it can
   clobber anything. Holding it exercises the one path that was never in danger.
2. **Delaying the resolve by 8 seconds** so it succeeds but late, with an assertion proving the
   interception really happened. The interception was confirmed (`delayed === 1`) and Take was
   pressed inside the window - and `Out` was still enabled afterwards, with the guard removed.

So the unguarded code recovered on its own in the configured tier. The likeliest explanation is
that something restores the marker that this investigation assumed could not: the take's rows
returning through the log and `applyCommand`, whose `claim()` dedupe was assumed to drop them.
Whoever picks this up should check that assumption first - it is the load-bearing one, and it is
the one that was never tested.

Which leaves the hosted failure unexplained. If the page recovers from a clobber via the log,
then what the hosted runs show is the log NOT DELIVERING, and that is a different investigation
from this one.

## Cost, so the next session does not repeat it

Neither reproduction could be run on a laptop: the configured suite needs a Supabase stack,
Docker was not running, and the only local credentials point at the PRODUCTION project, which
this suite must never touch. Each attempt was therefore a CI round trip of about six minutes via
`gh workflow run configured-suite.yml --ref <branch>`, which is the cheapest loop available and
worth knowing about.
