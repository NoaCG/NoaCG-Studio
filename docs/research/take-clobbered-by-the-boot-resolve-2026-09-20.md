# A take undone by the production page's own boot resolve

Investigated 2026-09-20. Closes `docs/backlog/cold-boot-specs-stick-for-the-whole-timeout-then-pass-on-retry.md`,
which recorded the symptom before the cause was known.

## What was seen

`e2e/configured/relay-cold-boot.spec.ts` hung for its entire 300-second budget on a disabled
`verb-out`, then passed in 28 seconds on the retry. Two other specs failed the same way in the
2026-09-20 scheduled run. Round-trip latency was measured at 154-194 ms throughout, against a
documented ~207 ms baseline, so this was never general slowness.

## What settled it

The failure artifact, not the log. Playwright's page snapshot records the dashboard's own DOM at
the moment it gave up:

- `PROGRAM — ON AIR nothing on air`
- the machine-state chip reading `not on air`
- `Out`, `Update`, `Re-take` and `All out` all `[disabled]`, with only `TAKE` live

So the dashboard believed nothing was on air. The spec had already asserted, over the wire, that
the server's `live_cue` held the take, and the board had already applied `play` from the log. The
disagreement was local to the page.

## The mechanism

`src/components/home/ProductionPage.tsx` keeps `liveCue`, a map of which cue is on air per
graphic. Every verb but Take is gated on it. It moves in exactly two ways: the boot effect seeds
it wholesale from `controlShowBySlug`, and this operator's own verbs move single entries.

The seed is behind an `await`. A Take pressed while that round trip is in flight moves the map
first; the answer then lands carrying the picture from before the press and replaces it. Nothing
recovers it:

- The follower's rows reach `applyCommand`, which claims each message once. These were already
  claimed at send time through `applyHere`, so the row that would restore the marker is dropped
  as a duplicate - correct for its own purpose, fatal here.
- `onRow` never writes `liveCue` itself; it moves the PROGRAM monitor and the machine state.
- The effect re-runs only on `show?.id`, so nothing re-resolves.

The page stays wrong until it is reloaded. In a control room that means: take a cue shortly after
opening a production, and the dashboard goes blind to what is on air, with no way to take it off.

Only the hosted tier ever saw it, which is what that tier is for. The window is the round trip -
about a millisecond against a local stack, ~170 ms from a runner to hosted staging.

## The fix

`liveCueMoves`, a counter bumped by every local move of the map. The boot effect reads it before
its `await` and seeds only if it has not moved since. A wholesale replace is skipped outright
rather than merged: the wire's map is a snapshot, not a diff, so merging would put a layer this
operator had just taken OFF back on air. What is given up is the seeding of layers another
operator drove, and the follower's rows carry those anyway.

`e2e/configured/take-during-boot-resolve.spec.ts` pins it by holding the resolve open with
`page.route`, pressing Take while it is in flight, then releasing it - deterministic on both
tiers rather than dependent on a real round trip.

## What is not established

The fix was verified by the offline dashboard suite (84 passed), the build and lint. It was NOT
reproduced on a laptop: the configured suite needs a Supabase stack, Docker was not running on
this machine, and the only local credentials point at the PRODUCTION project, which this suite
must never touch. The new spec's first real execution is CI's configured-suite against a local
stack, and the hosted tier's next scheduled run on the Wednesday after 2026-09-20 is what will
say whether `relay-cold-boot` stops timing out.

The 2026-09-20 backlog file also raised the possibility that the retry was passing on the failed
attempt's leftover control-log rows. That is not what was happening - the retry gets a fresh
production with its own slug - but the question was reasonable from the log alone and is recorded
here as answered rather than dropped.
