# catalog-cost's unit test runs the whole cost measurement inside every build

**Filed:** 2026-10-08. **Source:** traced while explaining why `scripts/catalog-cost.test.mjs`
failed with a dev-port error on 2026-10-08 (`docs/research/worktree-lifecycle-2026-10-08.md`).

## Why

`scripts/catalog-cost.test.mjs` tests pure arithmetic and two regular expressions, yet takes
17.8 s on this machine. `scripts/catalog-cost.mjs` ends with `process.exitCode = await main();`
and no CLI guard, so importing it for its constants RUNS the measurement: it loads
`scripts/prerender.mjs`, which starts a Vite server through `vite.config.ts`, and renders the
catalog. That happens in every `npm run build`, for every branch, and it is why the test reached
the dev-port registry at all. It also sets `process.exitCode` from a measurement inside a test
process, so a measurement failure could surface as a unit-test failure.

## What it would take

Guard the CLI the way the other scripts do (`if (process.argv[1] && resolve(process.argv[1]) ===
fileURLToPath(import.meta.url))`), then confirm the test file drops to well under a second and
`npm run check:catalog-cost` still prints the same report.

## Evidence

- `DEV_PORT=5999 node --test scripts/catalog-cost.test.mjs`: 17.8 s, and a module-load trace shows
  `catalog-cost.mjs` -> `prerender.mjs` -> a temporary `vite.config.ts` bundle.
- The incident and the port fix: `docs/work-specs/worktree-lifecycle/spec.md`.
