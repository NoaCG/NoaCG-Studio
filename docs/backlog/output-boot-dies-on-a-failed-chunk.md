---
v: 2
source: derived
kind: finding
raised: 2026-09-29
state: unstarted
found: "The /output renderer caches a failed supabase-js import and never boots, and its 'Output not available' card is opaque rather than transparent."
serves: NOW
size: small
touches: src/backend/supabase.ts, src/output/main.ts, vite.config.ts
needs-owner: none
---

# The output renderer can die at boot on one failed chunk, and its error card is opaque

**Filed:** 2026-09-29. **Source:** Phase 6 playout research (`docs/PLAYOUT_ISOLATION_RESEARCH.md`
§5.6, §16).

## Why

The browser output is the one NoaCG page that sits on air unattended. Two small things make its
boot more fragile than it needs to be:

- **One lazy chunk, cached when it fails.** supabase-js reaches the output page through a dynamic
  import (`src/backend/supabase.ts:21`), and a rejected import is kept as the module's promise
  (`:12-14`). `controlOutputBySlug` then throws, `untilAnswered` does not catch a throw
  (`src/control/hostedControl.ts:656`), and `boot()` rejects with nothing catching it
  (`src/output/main.ts:467`). The page is transparent and dead until someone reloads the browser
  source. A deploy between the page's HTML and that chunk is enough: an old deployment's hashed
  assets answer 404 on `noacg.studio` (measured 2026-09-29), because Skew Protection is on but the
  Vite build never sends the deployment id.
- **An opaque card.** "Output not available" paints a full-frame `#0a0a0c` background
  (`main.ts:75-85`). The comment says it is never part of a live production's air, but a CasparCG
  layer or OBS source that reloads onto an unpublished production shows it on air.

## What it would take

- Bundle supabase-js into the output entry (it is needed at boot anyway), or retry the import and
  never cache a rejection; either way a failure retries like any other unanswered resolve.
- Paint the card transparent with visible text only under `&debug=1`, or keep it only for the
  missing-token case that can never be on air.
- A spec that 404s the chunk at boot, then lifts the block, and asserts the renderer comes up
  without a reload.

## Evidence

- Code as cited above.
- The chunk-failure run in `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.6.
