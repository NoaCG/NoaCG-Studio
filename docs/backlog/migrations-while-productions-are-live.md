---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: unstarted
note: "owner decided 2026-10-02: automatic, expand and contract, never interrupting live playout; needs a design spec before any build (Decision below). Until production starts the week of 2026-10-05, migrations may still be pushed immediately."
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
4. A manual emergency override is allowed; it is never the normal path.

Neither "additive is always safe" nor "no output reporting means safe to remove" may be the only
guarantee: the design has to make normal updates and live playout coexist. Next: a design spec
(how a migration declares and proves it is live-safe, how running outputs and older pages are
known not to depend on what a cleanup removes, what verified quiet means given renderers that
heartbeat around the clock, and the override), then a build.

## Evidence

0072 was held from 2026-10-01 02:16 UTC and applied by hand with `--live` that evening, with one
production still reporting a renderer heartbeat.
