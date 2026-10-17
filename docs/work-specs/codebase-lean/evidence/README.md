# Evidence and reproduction

Audit date: 2026-10-17. Source pin: `3010e41134f1e3a6ebf3933582eb9b7e52055241`.
Branch: `codex/codebase-lean-research`; isolated worktree: `/workspace/codebase-lean`.
The source checkout was clean and origin/main matched the pin when first fetched.
The current spec incorporates the owner's later #800 decision and an admin assessment at
`ea71261c9`; the original inventory is deliberately not presented as a fresh current-main count. All authored
changes are under `docs/work-specs/codebase-lean/`; no production or user data was inspected.

## Read this first

- [audit.md](audit.md): pinned ownership/data analysis; current scope is in spec.md.
- [second-opinion-response.md](second-opinion-response.md): corrections, accepted subject policy and current concurrency.
- [admin-audit.md](admin-audit.md): admin weight, shipped assets and simpler reporting options.
- [removal-manifest.json](removal-manifest.json): exact proposed whole files and partial scopes.
- [measurements.json](measurements.json): physical-line totals and offline timing provenance.
- [forecast.json](forecast.json): non-overlapping scenarios and the report's own footprint.
- [test-maintenance-draft.md](test-maintenance-draft.md): withdrawal of broad drafts and the per-removal procedure; no active allowances.
- [verification.md](verification.md): what passed, what was checked manually and what is unknown.

## Complete inventories

TSV files are UTF-8, one row per item. Array-valued cells are JSON; paths and line numbers
refer to the source pin, not a later implementation commit.

| File | What it proves, and its limit |
|---|---|
| source-files.tsv | Every src code file, lines, live entry path or unreachable classification; includes type edges, not a tree-shaken byte claim |
| import-edges.tsv | Resolved static/type/literal-dynamic/URL/string/CSS edges across tracked code; comments are not imports |
| entrypoints.json | HTML/server/build roots and all 319 nonliteral import expressions; none of the latter is in src; external bench/test loaders were reviewed |
| knip.json, knip-results.json | Pinned Knip configuration/output: 68 unused files, 566 exports and 351 types in 339 issue-bearing files; not approved deletions |
| store-fields.tsv | Every TemplateState member and field-name occurrences in live modules that mention templateStore; conservative lexical evidence, not alias/dataflow proof |
| flags.tsv | Client environment selectors and reachability; does not inspect secret values or prove deployed flags unused |
| test-files.tsv | All 297 E2E specs and 308 Node test files, layer, size, declaration/helper-skip counts, headers, imports and behavior summary |
| test-cases.tsv | All 6,061 static test declarations, title/expression and line range; generated runtime expansion is not counted |
| retired-test-cases.json | 474 helper-skipped declarations and their direct/local-helper chain; not a retirement verdict |
| skip-sites.tsv | Explicit E2E/Node skip calls/options, including credential, platform, selected-catalog and missing-fixture conditions; these are not all retired behavior |
| tooling.tsv | All 648 script implementation/test files, machine/config/import/document references; literal references are signals, not actual execution history |
| gates-build.tsv, gates-factory.tsv | Existing gate runner's own discovery; proves tests without package.json commands can still run |
| docs.tsv | All 615 Markdown docs, physical lines, incoming references and instruction citations; history classification alone does not authorize removal |
| assets.tsv | All 89 src/assets and public files, byte size and textual/import references; composed or external URLs require manual review |
| old-editor-references.tsv | Source/test/tool/doc/instruction mentions that must be reconciled; frozen contracts/records excluded from active cleanup |
| ci-baseline.json | Read-only GitHub job metadata from run 39000659873; build timing, no inferred per-case timing |

## Reproduce

Use a clean checkout of the pinned source, with the repository's locked dependencies installed,
and copy this evidence script/config into the same relative directory. The inventory reads the
pinned tracked path list and the checkout's file contents, so **the source checkout must match
the pin**. It writes evidence only; it never deletes source or runs tests. Output outside the
source pin, including this report, is excluded from its baseline totals.

```sh
node docs/work-specs/codebase-lean/evidence/inventory.mjs
npx --yes knip@5.88.1 --config docs/work-specs/codebase-lean/evidence/knip.json --include files,exports,types --reporter json --no-progress --no-config-hints --no-exit-code > /tmp/noacg-knip.raw
node scripts/gates.mjs list --json
node scripts/gates.mjs list --gate factory --json
```

Knip loads repository plugins; the Playwright config prints a worker-selection line before
the JSON. `knip-results.json` contains the JSON object only. Knip was installed through npx's
cache; package.json and lockfiles did not change. A second file-graph check used the already
installed dependency-cruiser 18.1.0:

```sh
node_modules/.bin/depcruise --no-config --include-only '^src/' --ts-config tsconfig.json --output-type json src > /tmp/noacg-depgraph.json
```

The TypeScript inventory additionally models HTML roots, CSS and string paths. The only
file-set differences from Knip are the hand-verified Vite SSR catalogIndexBuild loader and
the ambient vite-env.d.ts input. Raw tools do not decide retirement.

Durations are copied by key from `scripts/e2e-durations.json`; sums include only table entries.
Its six run IDs, percentile, source SHA and date are in measurements.json. No stale or missing
spec receives a guessed median. GitHub job metadata was read with `gh api .../actions/runs/
39000659873/jobs --paginate`. `gh run view ... --log` was denied at the results-receiver host;
the denial was not retried through another route. No per-test log timing is claimed.

Review the curated manifest and subject dispositions after regeneration: they express decisions beyond the raw
inventory. Recount file lines, declaration spans and duration keys before a deletion PR.
Report scenarios exclude additions that do not yet exist; actual net code and CI savings must
be recorded after each small landing. Do not run a full local suite to produce those numbers.

The inventory classifications review-helper-skipped-file and review-helper-skipped-cases
identify subjects requiring review, not deletion permission. They replace the original broad
delete-retired heuristic labels. Retained live subjects are resolved through #800. Admin JSON
receipts are separate current-main/public-asset observations.
