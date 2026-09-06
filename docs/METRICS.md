# Workflow metrics: the baseline and how to re-measure it

The targets in `docs/WORKFLOW_ARCHITECTURE.md` §9 are checkable only against a baseline taken
the same way. This file is that baseline, taken 2026-09-06 on `origin/main` at 296df0ef, and the
commands that reproduce each number. Re-run them, put the new column beside the old, and the
architecture either improved or it did not.

| Metric | 2026-09-06 | Target | Command |
|---|---|---|---|
| Queued to landed, median / p90 / max | 9 min / 79 min / 42 h | ≤ 10 / ≤ 20 min / ≤ 2 h | `npm run metrics:landing` |
| Landings per day | 16 median, 36 max | capacity ≥ 200 (phase 4 load test) | `npm run metrics:landing` |
| Red `main`, hours per 30 days | ~78 | ≤ 4 | `gh issue list --search '"CI is red on main" in:title' --state all --json createdAt,closedAt` |
| Runner minutes per 30 days | 113,685 (62 h/day) | ≤ 45,000 at the same landing rate | `npm run metrics:ci -- --limit 500` (sums job durations) |
| `main` runs re-running a sha already green on its branch | 496 of 512 | 0 | `npm run metrics:ci` |
| Branch run for one component | 19 to 28 runner-min, 4 to 7 shards | ≤ 12 runner-min, ≤ 2 shards | `npm run metrics:ci`, read per class |
| Cancelled `ci.yml` runs | 15% | n/a (selection from the merge-base) | `npm run metrics:ci` |
| Contract corpus | 108 files, 569,309 bytes | shrinking; hand-written files → 0 by phase 2b | `npm run metrics:contracts` |
| Root bytes × chains | 22,733 × 54 = 1,227,582 | ≤ 450,000 | `npm run metrics:contracts` |
| Tightest chain | `src/components/wizard` 101,636 bytes (~25k tokens) | ≤ 40,960 bytes loaded for any single file touch | `npm run metrics:contracts` |
| Compiled layer at launch | 0 bytes (store empty before phase 0) | ≤ 8,192 | `npm run metrics:contracts` |
| Evidence paragraphs in hand-written contracts | 50 files carry them (`scripts/contract-evidence-baseline.json`) | only ever down | `npm run check:contract-evidence` |
| Merges with a real conflict resolution, 45 days | 77 of 618 (12.5%) | ≤ 3% | `npm run metrics:conflicts` |
| Most-resolved files | `package.json` 15, `e2e/catalog-baseline.json` 12 | none above 2 | `npm run metrics:conflicts` |
| `build` line edits per 30 days | 66 | 0 | `git log --no-merges --since=30.days -G'"build": ' --format=%H origin/main -- package.json \| wc -l` |
| Import-only wizard commits forced into a giant (60 d) | 40% (51 of 129) | ≤ 10% | `npm run metrics:cochange` |
| Template-only wizard commits forced into a giant | 57% (36 of 63) | ≤ 10% | `npm run metrics:cochange` |
| AI-only wizard commits forced into a giant | 25% (13 of 51) | ≤ 10% | `npm run metrics:cochange` |

The co-change script counts `src/model/wizard.ts` among the giants and takes only the wizard's
own AI files as the AI capability, so its numbers sit above the audit's hand counts in
`WORKFLOW_ARCHITECTURE.md` §5.5 (37 / 43 / 4%); the script's definition is the one the targets
are measured against.
| Direct importers of `src/model/wizard.ts` | 621 (reverse closure 866 files) | file gone | `npx depcruise --config .dependency-cruiser.cjs --output-type json src` and count `resolved === 'src/model/wizard.ts'` |
| Files in the test map's `CORE` | 141 | ≤ 20 | classify `git ls-files` through `planFor` in `scripts/e2e-affected.mjs` |

Three numbers in the plan were measured with one-off scripts (the change-class table, the
sentence-level evidence split, the reverse closures); they are quoted in
`docs/WORKFLOW_ARCHITECTURE.md` §2 with the method and are not repeated by an npm script.
