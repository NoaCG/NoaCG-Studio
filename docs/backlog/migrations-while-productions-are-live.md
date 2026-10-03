---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: advanced
note: "owner decided 2026-10-02 and ruled again 2026-10-03 (both below); the design spec docs/work-specs/live-safe-migrations/spec.md was amended to the 2026-10-03 ruling and widened to every update NoaCG ships; the build is next and nothing is built yet. Until it lands, db-push still holds live-path files on renderer heartbeats."
serves: NOW
size: large
asked: "long term a safer migration strategy so playout can stay live during updates, or migrations in maintenance windows; a future scaling problem (paraphrase)"
---
# Migrations while productions are live

**Filed:** 2026-10-01. **Source:** the owner's studio-day feedback.

## Why

Productions will soon be on air at any hour. A schema change on the live path can hurt a show
without losing anything (`supabase/AGENTS.md`, "Live-path migrations wait for a quiet window"), and
the quiet window may never come (`live-path-quiet-window-never-comes.md`: renderers heartbeat
around the clock; 0072 was held for most of a day for a renderer nobody was watching).

## What it would take

Choose between a scheduled maintenance window (announced, with outputs told to expect it), or
making every live-path change provably harmless while live (expand and contract in separate
landings, old and new functions side by side as Phase 6 already does). Either way, decide what a
renderer nobody is watching counts as.

## Decision (owner, 2026-10-02)

Automatic, with no approval needed in the normal case. The requirement is stronger than "wait until
nobody is live": **updating NoaCG must not be able to interrupt anybody using Playout**, and the owner
must never have to coordinate a maintenance window.

1. A normal deployment applies, by itself, only migrations that are safe on a live production
   database and stay compatible with the code and the outputs that are running right then.
2. Removing or renaming anything happens only in a later cleanup migration, once no current code
   or output version depends on it.
3. A cleanup that could still affect active playout also waits, by itself, for verified quiet.
   (Replaced by the ruling of 2026-10-03 below: nothing waits for quiet.)
4. A manual emergency override is allowed; it is never the normal path.

Neither "additive is always safe" nor "no output reporting means safe to remove" may be the only
guarantee: the design has to make normal updates and live playout coexist. Next: a design spec
(how a migration declares and proves it is live-safe, how running outputs and older pages are
known not to depend on what a cleanup removes, what verified quiet means given renderers that
heartbeat around the clock, and the override), then a build.

## Ruling (owner, 2026-10-03)

> Perfect if we don't have to wait for a quiet moment ... Half a second lag I'm sure anyone can
> handle. But this matters for all website/db updates. Nothing should ruin a show.

Given after post-land run 37104930020 held 0074 for one renderer heartbeat. No update waits for a
quiet moment and no user presses a rehearsal or live button; an update may delay a live action by
at most half a second and retries later when it cannot; a removal waits only for the proof that
nothing running depends on it; the same applies to web deploys and client updates.

## Spec

[`work-specs/live-safe-migrations/spec.md`](../work-specs/live-safe-migrations/spec.md), amended to
the ruling above: three declared kinds of live-path migration (add, change, cleanup), a 500 ms
stall budget each file proves by its own timeouts (at most 200 ms of lock wait and hold together, under
the live functions' own 250 ms lock timeouts), concurrent index builds and batched backfills, a
client registry that a cleanup's dependency proof reads, no quiet gate at all, held files that no
longer block later ones, a recorded override, and the same guarantee for web deploys (pinned assets through Vercel Skew Protection, routes and paths that only
grow, no reload on air) and for the Bridge, CLI and Companion module. Its acceptance criteria are
the build's.

## Evidence

0072 was held from 2026-10-01 02:16 UTC and applied by hand with `--live` that evening, with one
production still reporting a renderer heartbeat.
