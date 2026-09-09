---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: >-
  `e2e/catalog-baseline.spec.ts` fails on main for 24 credits and ticker variants, and the
  affected-spec selection means CI has not run it since whatever broke it landed (2026-09-09)
serves: NOW
size: small
touches: e2e/catalog-baseline.spec.ts, e2e/catalog-baseline.json, src/templates
covered-by: e2e/catalog-baseline.spec.ts
needs-owner: none
---
# The catalog baseline has been red, and nothing has run it

**Filed:** 2026-09-09. **Source:** measured on session M's branch
(`claude/m-wizard-says-it-itself`), which ran `npm run test:e2e:affected` and got a failure it did
not cause.

## Why

"every catalog variant renders identically" fails with:

> The rendered look moved. A token substitution cannot do this - investigate before re-recording.

24 variants report `2 element(s) - #count, …>div.noacg-data-source[…]`: a `#count` node and a
`noacg-data-source` wrapper that the recorded baseline has no entry for. Every one is a credits
roll (`cr01`-`cr13`) or a ticker (`tk01`-`tk15`) - the two families whose last three commits were
the ticker speed work (`1a9269c0`, `ad963d10`, `4b6642e5`).

**It is not one branch's problem, and that is the finding.** It was reproduced at
`ffadb42e` - session M's own fork point, with that session's changes absent from the tree - and
nothing between `ffadb42e` and `c6417a1d` touches `e2e/catalog-baseline.json`,
`e2e/catalog-baseline.spec.ts` or `src/templates`. So it is red on current main.

Meanwhile CI is green, because the affected-spec selection only runs this spec when a change
touches the catalog. Nothing has for days. A baseline gate that runs only when its subject moves
cannot report that its subject already moved and broke it, so this can sit red indefinitely and
the next session to touch a template inherits a failure somebody else's commit caused. The spec's
own message - "investigate before re-recording" - is written for exactly the person who did the
breaking, and that person is long gone by the time it fires.

## What it would take

Two separate things, and only the first is about the failure.

1. Find out whether the `#count` / `noacg-data-source` pair is a deliberate addition that the
   baseline never got re-recorded for, or a real regression. `git log -S noacg-data-source` over
   `src/templates` is the first read. If deliberate, re-record with the reason in the commit
   message; if not, it is a rendering bug in every credits roll and every ticker.
2. Decide whether a BASELINE spec should be affected-gated at all. A baseline's job is to notice
   drift, and drift arrives from commits that do not look like they touch the thing. Running it
   unconditionally on main (or in the nightly, or in the post-landing job) is the shape that
   would have caught this the day it landed.

## Evidence

- Job j-0875 in the local queue: `npx playwright test e2e/catalog-baseline.spec.ts -g "every
  catalog variant renders identically"` run with the tree checked out at `ffadb42e`, failing with
  all 24 rows.
- The same 24 rows in job j-0871, `npm run test:e2e:affected` on session M's branch.
- CI run `34357223959` (`gh-readonly-queue/main/pr-193-…`) succeeded, which is what makes the
  affected-gating the interesting half rather than an aside.
