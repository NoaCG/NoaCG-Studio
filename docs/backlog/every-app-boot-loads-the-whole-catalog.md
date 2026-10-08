# Every /app boot loads the whole template catalog

**Filed:** 2026-10-08. **Source:** measurement, while fixing the `wizard-entry-fit.spec.ts` blank-page flake (`claude/o-copy-test-scope`)

## Why
A cold `/app` boot imports `src/templates/catalog.ts` statically through `App.tsx ->
CreationWizard.tsx`, so it loads about 650 template modules that the Entry step, Home and the
production page never use. Under the dev server that is more than half of every boot's module
requests, and it is what makes cold boots slow enough to flake: six boots that start together take
7.1 s at the median to show the wizard, where one alone takes 2.1 s. Every spec that waits on the 7 s
`expect` default after a `goto('/app')` (22 spec files assert `creation-wizard` that way) carries
the same exposure that `wizard-entry-fit.spec.ts` had. In production the same modules are bundled,
so the cost there is bytes parsed before first paint rather than requests; that side is unmeasured.

## What it would take
Load the catalog when a step that lists designs first needs it (Browse, the kit picker, the AI step's
exemplars) rather than with the wizard module, with a loading state on those steps. The other
static importers outside `src/templates/` (`git grep -l "templates/catalog" -- src`) need the same
check, since any one of them left eager keeps the whole graph in the boot. Wizard work, so it should
not run beside a wizard row.

## Evidence
`e2e` boot probe, 2026-10-08, dev server, this laptop: one cold boot fetches 1,225 modules, 654 of
them under `/src/templates/`; 1,170 load after `App.tsx` is requested. Wizard visible after: 2.1 s
alone; 7.1 s median / 7.7 s max with six concurrent boots; 7.2 s median / 13.0 s max with four
cores busy; 27 s median / 34 s max with ten. Durable-store hydration took under 10 ms in every run
and never degraded, so the time is module loading. The static graph from `src/App.tsx` is 1,198
modules, 653 of them templates.
