# Two spellings of one checkout path let two landings share a tree

**Filed:** 2026-09-08. **Source:** the 2026-09-04 refusals-say-why session (handoff since drained)

## Why
A merge rewrites the working tree of the checkout it runs in, so the scheduler refuses to run one
beside anything in that same checkout. It decides sameness with `sharesCheckout`
(`scripts/jobs-store.mjs:453`), which lowercases two raw strings - so `C:\wt\x` and `c:/wt/x` are
not the same checkout and both jobs are allowed to start. The guard's whole promise is structural,
that two merges never overlap, and this is the one input that defeats it silently: nothing goes
red, the tree just moves under a running job.

## What it would take
Use `samePath` (`scripts/jobs-store.mjs:633`), which already normalises separators, case and a
trailing slash, and is what the refusal reader beside it uses. One-line change plus a
`scripts/jobs-store.test.mjs` case pinning the mixed-separator pair.

## Evidence
Reported 2026-09-04 and untouched since: `git log -S sharesCheckout -- scripts/jobs-store.mjs`
returns only `9537349d` (2026-08-25).
