---
v: 2
source: derived
kind: finding
raised: 2026-09-30
state: unstarted
found: "Vercel Skew Protection is on for the project, but the Vite build never sends the deployment id, so a page that loads a chunk after a deploy gets a 404."
serves: NOW
size: small
touches: vite.config.ts, src/output/main.ts
needs-owner: none
---

# Vite assets are requested without Vercel Skew Protection's deployment id

**Filed:** 2026-09-30, from research §11.2 rule 6 and the row B hand-back of the Phase 6 night.

## Why

An old deployment's hashed assets answer 404 on `noacg.studio` and 200 with `?dpl=<deployment
id>` (research §5.5, measured 2026-09-29): Skew Protection is active but Vite is not a supported
framework, so nothing adds the id. #558 made the `/output` renderer recover from a failed
supabase-js chunk by reloading itself once it can reach its own page, but the page's own main
script has the same exposure and nothing can recover it, because no code runs. Every open page
that lazily loads a chunk after a deploy is exposed the same way.

## What it would take

- Add the deployment id to built asset URLs (`VERCEL_DEPLOYMENT_ID` at build time, a `?dpl=`
  query or the `x-deployment-id` header through a small loader), per Vercel's Skew Protection docs
  for unsupported frameworks.
- A check that an old deployment's chunk URL, as the built HTML references it, answers 200.

## Evidence

- `docs/PLAYOUT_ISOLATION_RESEARCH.md` §5.5 and §11.2 rule 6.
- #558's hand-back: "the page's own main script has the same deploy-race exposure and nothing can
  recover it".
