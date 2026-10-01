---
v: 2
source: owner
kind: ask
raised: 2026-10-01
state: unstarted
note: "until production starts the week of 2026-10-05, migrations may be pushed immediately (0072 was, with --live)"
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

## Evidence

0072 was held from 2026-10-01 02:16 UTC and applied by hand with `--live` that evening, with one
production still reporting a renderer heartbeat.
