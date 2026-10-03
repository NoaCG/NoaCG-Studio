---
v: 2
source: agent
kind: finding
raised: 2026-10-03
state: unstarted
---
# A seeded production's reload lands on the wizard under load

**Filed:** 2026-10-03, from the flaky-tests row. **Source:** measurement.

## Why

`e2e/bridge-connect.spec.ts` cost rows CY, DB and DA time on 2026-10-02/03. One of its flakes (the
`/status` count in the setup-pull test, CI run 37088343750) was already fixed by 61392fee2. This
is the one left, and it is either a test seeding race or a boot route race in the product: a page
reloaded on `#/production/<id>` that opens the first-visit wizard instead would be a real bug.

## What was seen

`npx playwright test e2e/bridge-connect.spec.ts --repeat-each 10 --workers 4` on 579d12bc4 (a
busy machine): 5 failures in 410, every one in `seededPublishedProduction`, at
`expect(page.getByTestId('production-page')).toBeVisible()` right after `page.reload()`:
"the production's Playout dialog puts its output on air" (2), "a paired Bridge that is not running
turns the header status red" (2), "a production that is not started cannot be put on air" (1).

The failure screenshot is the first-visit wizard over Home, and the wizard's "Run the show" card
offers "Evening News": the seeded production was saved and survived the reload. The startup wizard
is only shown on the bare `''` route (src/App.tsx, `decideBootRoute` and the routed-wizard
effect), so the reloaded document most likely did not carry `#/production/<id>`.

Not reproduced since, on unchanged code: 365 runs of the same spec at `--workers 2` (the whole
file 5 times, and the three failing tests 40 times each with traces on), and 120 runs of a copy of
the helper that logged every `pushState`, `replaceState` and `hashchange` across the reload, with
and without the seeded Bridge settings. The worker count was capped at 2 for the machine's memory,
which may be what keeps it from reproducing.

## What it would take

Run the whole file at 4 workers with `--trace retain-on-failure` on a machine that can take it,
and read the failing trace's URL history: which write removed the hash, and when. Candidates read
in the code and not confirmed: a URL write from the first-visit boot effect (`App.tsx`, guarded by
`bootMayRewriteUrl`, which reads the live hash), and a reload the dev server itself issues
(Vite's full reload after a dependency re-optimisation) that started on the old URL.
