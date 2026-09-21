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

**Already done, so do not rebuild it:** the join-status indicator. As of pull request 349
(2026-09-20) the production dashboard shows `○ not joined, polling` beside the SHOW chip whenever
the log's live channel has never joined, and nothing when it has. Because it is rendered TEXT, it
lands in Playwright's page snapshot, so the next hosted failure artifact answers "did the channel
ever join?" on its own. `e2e/configured/follow-status-is-visible.spec.ts` pins both halves.

**Next, in order:**

1. **Read the next red hosted artifact before doing anything else.** The scheduled run is Sunday
   and Wednesday, 02:40 UTC. If the snapshot shows `not joined, polling`, the channel never came
   up and the failure is the log not delivering - look at `followControlLog` and its 30-second
   poll. If it does NOT show, the channel joined and the dashboard still lost the marker, which
   points back at the page's own state.
2. **Test the assumption the first investigation rested on and never checked:** that the take's
   own rows, returning through the log, are dropped by `applyCommand`'s `claim()` dedupe and so
   cannot restore the live-cue marker. The delayed-resolve experiment suggests they are NOT
   dropped and the page heals itself.
3. **A cause-agnostic self-heal is on the table and not yet decided.** Re-reading the live-cue
   map from the server on the follower's existing 30-second tick would turn "wrong until someone
   reloads" into "wrong for at most half a minute", whatever the cause. It changes live playout
   behaviour, so it wants both database tiers green before it lands and a rehearsal after. It
   must reuse the boot resolve's staleness guard (`liveCueMoves`), or a periodic re-read races a
   press exactly the way the boot read did.

**Operator workaround meanwhile, which is sound:** if the dashboard says nothing is on air while a
graphic visibly is, reload the dashboard. A fresh page resolves `live_cue` from the server, and in
every recorded failure the server was right.

## Cost of the loop, so it is not rediscovered

This cannot be reproduced on a laptop: the configured suite needs a Supabase stack, Docker was
not running, and the only local credentials point at the PRODUCTION project, which this suite
must never touch. Each attempt is a CI round trip of roughly six minutes:

    gh workflow run configured-suite.yml --ref <branch>

Note that `configured-suite.yml` runs on push to `main` only, so a pull request does NOT execute
these specs - a change to `e2e/configured/**` is unverified until it either lands or is
dispatched on its branch like this.
