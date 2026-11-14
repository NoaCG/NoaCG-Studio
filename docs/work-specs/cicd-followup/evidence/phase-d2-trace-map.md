# Step d2: the traced spec map on the e2e build

Plan run #1967, land-trim-3, PR #2530. The coordinator accepted three conditions in place of
"superset per spec in one run", which no two runs meet, dev against dev included:

- (a) Per spec, the build map loses no more than the dev map loses night to night.
- (b) On real diffs, selection never shrinks.
- (c) Every lost file is explained by its class.

## Runs

Both runs are full nightlies of the same code, traced.

| Run | Server | Head | Specs complete | Spec-file pairs |
| --- | --- | --- | --- | --- |
| 43544308030 | e2e build | 72a379f | 247 | 129,921 |
| 43544312687 | dev server | 0e710d0 (72a379f with the nightly on dev) | 247 | 123,337 |

The comparison base is main's committed map, from the dev nightly of c92910f4 (2026-11-13).
The 5 specs that did not complete in both runs are left out: 4 failed on the build, before the
fixes in c7d2d19, and 1 failed on dev.

## (a) Per-spec loss

| Comparison | Specs losing a file | Files lost | Specs gaining | Files gained |
| --- | --- | --- | --- | --- |
| build run against dev run, same code | 13 | 29 | 215 | 6,613 |
| dev run against main's dev map, one night apart | 19 | 222 | - | - |

(a) holds in total: 29 files in 13 specs against 222 files in 19 specs. It does not hold spec by spec. For 12 of the 13 specs that lose files on the build, the same spec loses nothing dev against dev. Examples: pasteboard loses 4, production-chat-intake 5, production-pack 4. The dev-against-dev baseline also compares two different nights, so code changes are mixed into its drift, which is why the guard compares one commit only. Those losses are in classes the dev runs show on other specs: the per-worker cache, timing, and late calls. Condition (c) explains each one. This total reading is what the coordinator accepted.

Specs with any loss: build-run losses against the dev run, and dev-run losses against main's map.

| Spec | Build vs dev | Dev vs dev |
| --- | --- | --- |
| editor-arrangement.spec.ts | 1 | 0 |
| editor-drawing-persistence.spec.ts | 1 | 0 |
| editor-folders-bins.spec.ts | 0 | 1 |
| editor-groups.spec.ts | 0 | 1 |
| editor-images.spec.ts | 0 | 1 |
| flows.spec.ts | 1 | 0 |
| google-fonts.spec.ts | 1 | 0 |
| import-analysis.spec.ts | 1 | 0 |
| import-prepare.spec.ts | 0 | 1 |
| inspector.spec.ts | 0 | 37 |
| lite-line-content.spec.ts | 0 | 22 |
| local-relay.spec.ts | 2 | 0 |
| network-resilience.spec.ts | 0 | 1 |
| no-old-editor.spec.ts | 0 | 1 |
| panel-production-page.spec.ts | 4 | 0 |
| pasteboard.spec.ts | 4 | 0 |
| playout-air-contract.spec.ts | 0 | 1 |
| playout-clock.spec.ts | 0 | 33 |
| playout-cues.spec.ts | 0 | 37 |
| playout-drills.spec.ts | 0 | 37 |
| playout-sequence.spec.ts | 0 | 37 |
| production-api-mapping.spec.ts | 0 | 1 |
| production-chat-intake.spec.ts | 5 | 0 |
| production-gate.spec.ts | 1 | 3 |
| production-pack.spec.ts | 4 | 0 |
| production-views.spec.ts | 0 | 1 |
| productions.spec.ts | 0 | 3 |
| publish-drift.spec.ts | 3 | 0 |
| quiz-pilot.spec.ts | 0 | 1 |
| template-insert.spec.ts | 0 | 3 |
| wizard-brand.spec.ts | 1 | 0 |

## (c) The 29 files the build run lost, by class

| Files | Losses | Class |
| --- | --- | --- |
| src/components/wizard/draft/{template,format}.ts, src/format/formatCode.ts, src/templates/catalog.ts | 20 | The per-worker template cache in e2e/_create.ts. The first test in a worker builds the template through the wizard code, and later tests reuse it, so which spec "runs" these files depends on worker order. The dev-against-dev comparison loses the same files. |
| src/preview/previewProtocol.ts | 3 | Timing. The dev-against-dev comparison loses it too. |
| src/validation/markLegibility.ts, src/templates/audience/{audiencePresets,familyCss}.ts | 3 | The minifier inlined these small functions into their callers. Fixed: the e2e build has no compress pass (ff4d266). A local re-trace of flows and production-chat-intake no longer loses them. |
| src/model/types.ts (graphicKindLabel), src/model/deviceIds.ts, src/preview/frameGraphic.ts | 3 | A late background call that had not run when the test ended, on a faster build. Re-traced locally after the compress fix: the source map attributes each function correctly, and they did not run before the test ended. |

The build map also counts every component (.tsx) in a chunk the page loaded. The dev server
counts those on load, because React Refresh runs a function in each one. Without this rule the
build map was narrower for component files: on qz01, 329 files against 435, with 316 shared.
That narrower map is recorded as a candidate for cf18 and is not adopted.

## (b) Selection on real diffs

Both maps are merged over the same previous map, as the nightly merges them, and handed to
the planner (scripts/e2e-affected.mjs planFor).

- **8 recent merged PRs** (2519, 2500, 2497, 2493, 2490, 2488, 2468, 2458), plus a component-only
  diff made of 2519's five .tsx files: each plans the full suite with either map.
- **The 56 changed src files of those PRs, one at a time:** 54 select the same specs, 2 select more,
  0 select fewer.
- **All 250 src files changed by the 121 merges since 2026-11-10, one at a time,** using
  d2-selection-guard.mjs: 0 select fewer specs on the build map.

### The guard after the switch

`d2-selection-guard.mjs` re-runs (b) on one commit. It takes a build nightly and a dev-server
nightly of that commit (`nightly.yml` input `dev_server`) and plans that week's merged diffs
with both maps. Comparing maps from different nights would mix up the tracing method with code
changes. For example, between the two dev nightlies before the switch, src/control/liveData.ts
went from 126 specs to 85.

The guard runs after each of the first two nightlies on main after the merge. If it exits 1,
that is an alarm to the owner and a revert candidate for #2530.

## Test time

| Nightly | Server | Tests | Test-min | Wall (min) |
| --- | --- | --- | --- | --- |
| 43381484230 (c92910f4, 2026-11-13) | dev server | 2,589 | 186.5 | 18.2 |
| 43544308030 (72a379f) | e2e build, 26 specs on dev | 2,666 | 129.1 | 12.6 |

Test-min is the sum of test durations from the nightly report. In run 43544308030, 25.1
test-min came from the dev project.
