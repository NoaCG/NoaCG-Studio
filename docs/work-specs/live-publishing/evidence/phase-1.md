# Phase 1 evidence: retire the hosted control page

Acceptance: `docs/work-specs/retire-hosted-control/spec.md` AC-1 to AC-5. Base:
`origin/main` e6be4cf3dcbcb103a7ea0372d30d0505845a8ba8. Hardware checks: none in this phase.

| Criterion | Proof | Result |
|---|---|---|
| AC-1 an old control link opens the production | `e2e/configured/operator-outage-not-unpublished.spec.ts`, test "an old control link opens its production…": a signed-in member lands on `#/production/<id>` with the query gone; a signed-out visitor in a fresh browser lands on the production page's "Sign in to open this production" | CI configured selection on the PR head (see the PR) |
| AC-2 a dead link says so, an outage keeps retrying | same test: an unknown slug shows "This link no longer works" with "Go to NoaCG Studio"; with the resolve answered by the 2026-09-29 503 the card stays "Waiting for the server" through at least three refused resolves and a page-long observer never sees the dead words; offline, `e2e/shows.spec.ts` "offline: an old control link says it no longer works" | offline: local queue run; configured: CI |
| AC-3 no surface offers the control link | `e2e/publish-output-setup.spec.ts` (Links has two rows, no `control-url`), `e2e/production-persistence.spec.ts`; copy edits in `docs.html`, `accountCopy.ts`, `companion-module/companion/HELP.md`, `ProductionsSection.tsx`, `entitlements/contract.ts` | local queue run |
| AC-4 the hosted code is gone | `HostedControlPage.tsx`, `control-page.css` and its import, `HostedCueAdjust.tsx`, `ownStaged.ts` (and its Node test), hosted-only rules in `playout-dashboard.css`, `controlPageUrl`, `stageHostedData`, the `controlUrl` prop; five rules retired with `npm run learn --supersedes` (two rescoped to the production page, three replaced by one "one operator surface" rule); scripts and design docs updated. `npx tsc --noEmit -p tsconfig.json` clean; `grep -rn HostedControlPage src api` finds nothing | local |
| AC-5 the production page is unchanged | production page diff is the Links wiring only (`ProductionPage.tsx` three lines, `ProductionLinks.tsx`, `useProductionPublish.ts` copy-kind type); CSS: only selectors naming hosted-only classes removed, `.playout-dashboard:not(.hosted-dashboard) .pd-header .pd-target` kept as `.playout-dashboard .pd-header .pd-target` (no other `.pd-target` rule exists, so the cascade is the same); the retargeted configured specs drive two production pages on one production through Take, Next, Out and All out | CI offline and configured runs on the PR head |

## Local checks

- `npx tsc --noEmit -p tsconfig.json`: pass.
- `npx eslint` on every changed TypeScript and script file: pass.
- `npm run gates -- run --changed origin/main`: pass (15 test files, 276 tests, every check ok).

## Not checked here

- The configured specs could not run in the cloud worker: the local Supabase stack's images come
  from a host the worker's proxy refuses. They run in the PR's CI selection instead.
