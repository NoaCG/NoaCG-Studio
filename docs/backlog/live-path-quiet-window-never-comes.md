---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "Production always has renderers heartbeating, so a live-path migration held for a quiet window may never apply by itself."
serves: NOW
size: small
touches: scripts/db-push.mjs, .github/workflows/post-land.yml, supabase/AGENTS.md
needs-owner: none
---

# The quiet window for live-path migrations may never come

**Filed:** 2026-09-30, by the Phase 6 night session.

## Why

The live-path class (#555, `supabase/AGENTS.md` "Live-path migrations wait for a quiet window")
applies a held migration at the first landing that finds no renderer heartbeat
(`control_shows.output_seen_at`) in the last ten minutes. On the night of 2026-09-29/30 every
post-land run found three productions heartbeating (`51a333e0-…`, `01ee7b29-…`, `beb593c2-…`),
so 0068 was held on production at 03:59, 04:01 and 04:04 UTC and applied only on staging. A
browser source or CasparCG layer left open between shows heartbeats around the clock, so on a
project with a few such outputs the window never opens. After a day the hold turns post-land red,
which reaches the owner, but the migration still waits for someone to run
`npm run db:push -- --live 0068`.

## What it would take (a decision first)

- Keep it: an owner applies held live-path migrations by hand at a moment they judge safe. Simple,
  and the alarm already says when.
- Or narrow "live": a production counts as live only if it also sent a command in the last N
  minutes (idle renderers left open do not block), with the hold still honouring an explicit
  `--live`.
- Or add a nightly `schedule:` to post-land so a quiet night-time window is tried without waiting
  for a landing (the db-push author's suggestion); this does not help while renderers stay open.

## Evidence

- post-land runs 36666845396, 36667009334, 36667217725 on 2026-09-30: "Quiet window on
  kprolrchuldgfrzspthy: 3 production(s) had a renderer heartbeat in the last 10 minutes … HELD:
  0068_live_topic_presence.sql".
