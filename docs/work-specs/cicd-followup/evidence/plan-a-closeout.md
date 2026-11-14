# Plan A close-out: the browser suite on the e2e build

Plan run #1967, owner step 5 (PRIORITY CHANGE 2026-11-12), land-trim-3. The goal was to cut the
full browser suite from 185.7 to at most 150 test-minutes by 2026-12-15. Plan A runs the suite
against a production-style e2e build (`vite build --mode e2e`, served by `vite preview`)
instead of the Vite dev server. The owner approved "C then A". C (bundledDev) was measured and
rejected, because `/src` imports fail under it.

## Totals

| Run | Server | Tests | Test-min | Wall (min) |
| --- | --- | --- | --- | --- |
| Nightly 43381484230 (c92910f4, 2026-11-13), the baseline | dev server | 2,589 | 186.5 | 18.2 |
| Nightly 43548883139 (#2530 at 275aa5d), green | e2e build, 29 specs on the dev server | 2,666 | 128.3 | 13.2 |

The suite saves 58.2 test-min (31%), and the target of at most 150 is met. 26.5 of the 128.3
test-min ran in the dev project. A fresh context boots in about 0.5 s on the build, against
about 1.6 s on the dev server.

## What landed

| PR | Step | What |
| --- | --- | --- |
| #2505 | before A | bootstrapGraphic builds each template once per worker |
| #2513 | (a) | one door, `__noacgImport`, from the specs to the app's own modules, and the e2e build's registry |
| #2514 | (b) | `vite preview` serves the api/ routes the dev server serves |
| #2522, #2524, #2526, #2527 | (c) | the specs and helpers reach app modules through the door, in four batches; a plain in-page `/src` import is refused |
| #2529 | (d1) | a mode-only build switch (closes an env-var path that could ship the registry in prod), the test seams on the build, a door on every page, and a dist check that the prod build carries none of it |
| #2530 | (d2) | CI runs the suite on the build; the specs that need the dev server run in a dev project; the traced spec map is read through the build's source maps |

## What stayed on the dev server, and why

Each spec says so on its first line, `// runs on: dev server - <why>`, and
`check:e2e-dev-server` refuses a spec that needs the dev server without saying so. All
assertions are unchanged.

| Spec | Why |
| --- | --- |
| canvas-guides.spec.ts | opens the /e2e/fixtures page that imports the component by its /src URL |
| creative-routing.spec.ts | imports the pilot brief bank from /benchmarks, which the build does not serve |
| foreign-ograf-sandbox.spec.ts | its harness pages import /src modules as scripts, which the build does not serve |
| import-canvas.spec.ts | races the Prepare step's asynchronous baked-text scan (its `if (await ask.count()) await ask.click()`), which the build's speed exposes; kept here until #2536 fixes it |
| jev-svg-preparation.spec.ts | checks the env object the dev server injects into each module; the build inlines it |
| network-resilience.spec.ts | blocks /src/main.tsx to make the app bundle fail, a URL only the dev server has |
| no-old-editor.spec.ts | blocks /src/main.tsx to make the app bundle fail, a URL only the dev server has |
| ograf-library.spec.ts | its harness page imports /src modules as scripts, which the build does not serve |
| output-boot-resilience.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| output-debate-clock.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| output-first-paint.spec.ts | swaps the /output boot script for a harness that imports /src modules |
| output-font-hold.spec.ts | swaps the /output boot script for a harness that imports /src modules |
| output-prepare.spec.ts | swaps src/backend/config.ts to stand in a backend, and rewrites the /output boot script |
| output-ready.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| output-scene-link.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| output-typed-recovery.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| overlay-layers.spec.ts | reads the layer scale from Vite's per-file source stylesheets, which the build bundles |
| playout-adjust.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| playout-feedback-health.spec.ts | reads source modules by their /src URL |
| production-controls.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| production-data.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| publish-output-setup.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| rundown-history.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| studio-evening-reliability.spec.ts | swaps src/backend/config.ts to stand in a backend, and reads a source module by its /src URL |
| studio-feedback.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| studio-release-completion.spec.ts | swaps src/backend/config.ts over the network to stand in a backend |
| sync-dot.spec.ts | swaps src/backend/config.ts and useTeamsAvailable.ts over the network |
| sync.spec.ts | imports fresh module copies (?t=), which only the dev server serves |
| wizard-logo.spec.ts | imports fresh module copies (a cache-busting suffix), which only the dev server serves |

Converting the 19 backend-config swaps to a runtime seam would move them to the build and save
roughly 8 test-min more. The coordinator kept them on the dev server to keep spec edits low. That
conversion is a later option.

## Open

- **#2536 (P2, area: e2e).** import-canvas races the Prepare step's asynchronous baked-text scan,
  and the build's speed exposes the race. It stays on the dev server until the spec settles on the
  step's real end states.
- **The selection guard (`d2-selection-guard.mjs`).** The coordinator runs it after the first two
  nightlies on main after the switch (scheduled for 2026-11-14 and 2026-11-15, 09:00Z). Each run
  compares a build nightly against a dev-server nightly of the same commit. If a file selects fewer
  specs, that is an alarm to the owner and a revert candidate for #2530.
- **Duration weights.** The PR that carries this file re-records them from main's first three green
  full runs on the build (43552605380, 43560650900, 43569321859; 18c0c25f and later), and no
  dev-server run is mixed in. `--record` now takes several run ids for that. The table goes from
  197.3 to 131.2 table-min. Two quarantined specs (editor-projects, output-debate-clock) ran in none
  of those runs, so the planner counts them at the median until they return.

## Candidate for cf18: the narrower traced map

On the build, the trace can say which functions actually ran. The dev server also counts every
loaded component file, because React Refresh runs a function in each one. A map built from only
the functions that ran is narrower: on quiz-live-consistency qz01 it holds 329 files against 435,
with 316 shared, and every one of the 119 files it drops is a .tsx component. #2530 does not adopt
it. That build map adds every component in a loaded chunk, so it keeps the dev semantics.

Adopting the narrower map is a selection change. Its own reviewed decision belongs to cf18. The
evidence for it is phase-d2-trace-map.md and the qz01 comparison above. The switch itself is
`componentsOf` in scripts/e2e-build-sources.mjs.
