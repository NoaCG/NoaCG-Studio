# The mobile Home layout spec shows an empty library after its seed

**Filed:** 2026-10-03. **Source:** issues #664 and #676, investigated by the flaky-tests row; not
reproduced.

## Why

`e2e/layout.spec.ts:177` ("mobile: Home leads with Productions and a dashboard is two taps from
open") failed on main twice on 2026-10-03, both times in shard 2 of a full run (runs 37096120413
and 37118148332), after f5ad9e23 had already made it seed only once the store hydrated. Each red
cost a red main, and the spec was quarantined once before (#540).

## What it would take

Find why Home renders `Productions 0` and `Graphics 0` after a seed that `settleDurableWrites`
reported landed. Leads from the trace of run 37118148332 (artifact `test-results-2`):

- `page.goto('/app#/home')` after `page.goto('/app')` is a same-document fragment navigation: it
  took 4 ms and loaded nothing. So Home renders from the tab's in-memory mirror, never from a
  fresh read of IndexedDB. The seed's writes are not on screen and nothing reloads to show them.
- On that runner `/src/App.tsx` was still loading when the seed began; the app mounted around the
  time the seed finished (about 2.5 s later). Something that runs on a first-ever boot (the
  wizard-first route, `galleryOpen`'s initial value) may replace or hide the seeded library.
- No page reload, no console error and no duplicate module load appear in the trace.

A probe worth running first: read `loadShows()` and `loadGraphics()` in the page at the moment of
the failure, and read IndexedDB directly. Library in IndexedDB but not in the mirror points at the
boot; missing from both points at the seed. If the boot is the cause, a test-side fix is a real
`page.reload()` (or `goto('/app#/home')` from a different path) after the settle; if the boot can
drop a write, that is a product bug.

## Evidence

- Failure: `locator.boundingBox` waiting for `open-production` until the 60 s timeout; screenshot
  and page snapshot show the empty Home ("No productions yet", "Nothing saved yet").
- Not reproduced locally: no repeat run was made before the session ended.
