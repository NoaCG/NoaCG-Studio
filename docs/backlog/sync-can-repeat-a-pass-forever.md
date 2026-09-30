---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "Library sync can re-pull the same records on every pass forever: tombstones whose server timestamp is newer than their body's, and records that do not fit a localStorage fallback."
serves: NOW
size: small
touches: src/backend/syncController.ts, src/backend/storage.ts, src/backend/supabaseProvider.ts, src/model/library.ts, src/model/shows.ts
needs-owner: none
---

# Library sync can repeat a pass forever

**Filed:** 2026-09-30, from the Chrome memory-crash investigation (the pull is now one write per
kind, but these two loops were found while measuring it).

## Why

Each loop never crashes, but it rewrites the whole library every few seconds for as long as a
tab is open: about 15 MB of IndexedDB writes per second on a 27 MB account, a sync chip that never
settles, and database reads on every pass.

- **Old tombstones.** The local purge drops a tombstone by its BODY's `updatedAt`
  (`purgeOldGraphicTombstones`, `purgeOldShowTombstones`, called from `syncController.ts`), while
  the server purge uses the row's `updated_at` column (`supabaseProvider.ts` `purgeTombstones`).
  A tombstone whose body is older than 90 days but whose row was touched recently is purged
  locally, pulled again (the server still has it), and purged again, every pass. Measured on a
  preview branch: 27 passes in 90 s. The owner's account has no such tombstone today (checked
  read-only on 2026-09-30: every tombstone's two timestamps agree).
- **A localStorage fallback that is full.** When IndexedDB is unavailable the durable store falls
  back to localStorage; a pulled record that does not fit fails silently (`saveAll` returns an
  error string that `upsertGraphic` ignores), so every pass pulls it again. Measured: 279 body
  requests and 329 MB downloaded in 3 minutes.

## What it would take

- Purge local tombstones on the same basis as the server, or never re-pull a tombstone the local
  side has already purged.
- Make `LocalStorageProvider.put` reject when the save fails (`putMany` already does), so the
  failure is counted and reported instead of silently retried.
- A test for each: a stale-bodied tombstone settles in one pass; a full store reports the failure.

## Evidence

- The reproduction scripts and results of 2026-09-30 in that session's scratchpad (`mem/`):
  `v2-fix-*` (the loop) and the first runs (the localStorage fallback).
