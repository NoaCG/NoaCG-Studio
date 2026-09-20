---
v: 2
source: derived
kind: finding
raised: 2026-09-20
state: unstarted
found: "The hosted cold-boot specs still hang for their entire test timeout and pass on retry. A staleness window in the production page was found and guarded, but it was NOT shown to be the cause, so issue #341 is still open."
serves: NOW
size: medium
touches: e2e/configured/relay-cold-boot.spec.ts, src/components/home/ProductionPage.tsx, src/control/hostedControl.ts
needs-owner: none
---

# The hosted cold-boot specs still stick for their whole timeout

**Filed:** 2026-09-20, replacing the earlier finding of the same day, which was closed on a
diagnosis that did not survive being tested.

## Why

It is the only thing keeping issue #341 open, and every red run costs whoever reads it the work
of telling it apart from a real regression.

## Where it stands

**The symptom** is unchanged and well measured. `relay-cold-boot.spec.ts:31` hangs for its whole
300-second budget on a disabled `verb-out`, then passes in ~28 seconds on the retry; latency is
normal throughout (154-194 ms against a ~207 ms baseline); the dashboard's DOM at the moment of
failure reads `PROGRAM — ON AIR nothing on air` with every verb but Take greyed, while the
server's `live_cue` holds the take. Three occurrences across two scheduled runs and one on
demand.

**What was tried and did not pan out** is written up in
`docs/research/take-clobbered-by-the-boot-resolve-2026-09-20.md`. A staleness window in the
production page's boot resolve was found, guarded, and then could NOT be made to produce the
symptom: a spec that delayed the resolve by 8 seconds and pressed Take inside that window passed
against the unguarded code. The guard was kept as hardening; the spec was removed rather than
left on main pinning nothing.

## What it would take

Start by testing the assumption that investigation rested on and never checked: that the take's
own rows, returning through the log, are dropped by `applyCommand`'s `claim()` dedupe and so
cannot restore the live-cue marker. The delayed-resolve experiment suggests they are NOT dropped
and the page heals itself. If that is right, the hosted failure is the log not delivering at all,
which points at `followControlLog` and its polling fallback rather than at the dashboard's state.

The cheapest instrument is the one the code already has and no spec reads: `followControlLog`
reports channel join status separately through `onStatus` and `onCommandStatus`
(`src/control/hostedControl.ts`) so a surface can say "not joined - polling". Capturing those in
the hosted specs would answer in one line whether the channel ever joined, which is the question
every one of these 300-second hangs leaves open.

## Cost of the loop, so it is not rediscovered

This cannot be reproduced on a laptop: the configured suite needs a Supabase stack, Docker was
not running, and the only local credentials point at the PRODUCTION project, which this suite
must never touch. Each attempt is a CI round trip of roughly six minutes:

    gh workflow run configured-suite.yml --ref <branch>

Note that `configured-suite.yml` runs on push to `main` only, so a pull request does NOT execute
these specs - a change to `e2e/configured/**` is unverified until it either lands or is
dispatched on its branch like this.
