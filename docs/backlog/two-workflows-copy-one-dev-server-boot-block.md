# Two workflows carry the same dev-server boot block by copy

**Filed:** 2026-09-08. **Source:** the 2026-09-04 cloud-and-browser-slot session (handoff since
drained)

## Why
`catalog-gates.yml` boots its dev server with a block copied verbatim from `nightly.yml`:
background `npm run dev`, a trap to kill it, `dev-port.mjs`, a 60-second curl poll on `/app`, and
a named failure. Both run the same rendered catalog sweeps, so a change to how the server is
started or waited for has to be made twice, and the second copy is the one that gets forgotten. It
was left as a copy deliberately, because fixing it meant editing `nightly.yml`, which that row did
not own.

## What it would take
A composite action under `.github/actions/` - the repo already uses one for `node-modules` -
taking the readiness path and the timeout, called from both workflows. Prove it by dispatching
both once: a workflow edit no run has executed is not verified.

## Evidence
`.github/workflows/catalog-gates.yml:334-350` against `.github/workflows/nightly.yml:130-145`.
