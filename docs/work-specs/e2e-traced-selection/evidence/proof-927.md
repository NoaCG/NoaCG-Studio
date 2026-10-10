# AC-5: the traced map selects the spec #927 broke

Command, from the repository root with `origin/main` at 732b5cad7:

    node docs/work-specs/e2e-traced-selection/evidence/replay.mjs scripts/e2e-traced.json 150

`replay.mjs` rebuilds the curated coverage from the spec headers AT #927's merge (6dd97b7d5, before
4a9e01e02 hand-added `svg.ts` to `editor-fidelity-trim.spec.ts`), plans #927's changed files with
today's planner, once without the map and once with `scripts/e2e-traced.json` (nightly run
38050437755).

#927 changed: `.github/workflows/fit-sweep.yml`, `e2e/catalog-baseline.json`,
`e2e/import-svg-corpus.spec.ts`, `e2e/import-svg.spec.ts`, `scripts/fit-sweep-verdict.mjs`,
`scripts/fit-sweep-verdict.test.mjs`, `scripts/svg-import-sweep.mjs`,
`src/templates/importedDesign/AGENTS.md`, `src/templates/importedDesign/svg.ts`.

| | plan | selects `editor-fidelity-trim.spec.ts` |
|---|---|---|
| curated headers at #927 (what CI ran) | subset, 60 specs | no |
| the same headers plus the traced map | subset, 70 specs | **yes** |

Same result with sprint focus on and off. The map's entry for `src/templates/importedDesign/svg.ts`
names 26 specs, `editor-fidelity-trim.spec.ts` among them; the file is not broad (26 of 229). The
ten specs the map added: dashboard-operator-walk, editor-drawing-task, **editor-fidelity-trim**,
editor-out, import-graphic, import-svg-centred-title, import-svg-credits, motion-presets,
score-tracker-moments, svg-examples.

The unit test `the traced map adds the spec a covers header missed - the #927 shape`
(scripts/e2e-traced.test.mjs) pins the same shape without depending on a night's map.

## What the union costs, same run

Replayed over the 150 first-parent landings to `origin/main`, today's headers, sprint focus on (as
ci.yml plans), measured minutes from `scripts/e2e-durations.json`:

| variant | none | subset | focus-escalated | median min | p75 min | p90 min | total min | landings that grew |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| curated | 67 | 29 | 54 | 1.0 | 65.3 | 75.9 | 4915 | 0 |
| union, broad>0.5 keep covers (chosen) | 67 | 29 | 54 | 1.1 | 69.0 | 97.6 | 5555 | 39 |
| union, broad>0.5 escalate like core | 67 | 14 | 69 | 2.5 | 74.2 | 101.8 | 6152 | 44 |
| union, no broad rule | 67 | 29 | 54 | 2.5 | 134.8 | 136.7 | 8102 | 54 |

Focus set: 76 specs, 64.3 min; full suite 139.0 min. Specs per file in the map: p50 44, p75 68,
p90 167, max 181; 276 files are over half the suite and 289 over a third, so the 0.5 line sits in a
gap. Limitation: the replay uses today's headers for every landing, so it measures what the map
adds to today's selection, not what each landing ran at the time.
