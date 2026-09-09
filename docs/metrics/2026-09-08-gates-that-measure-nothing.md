# Every gate in the tree, asked whether it could pass while measuring nothing

Measured 2026-09-08 on `claude/f-gates-that-measure-nothing`, from `origin/main` at `032678a2`.

One question was put to every gate, validator and compiler step in the tree:

> If the thing this gate resolves its SUBJECT by disappeared tomorrow - the constant moved, the
> file was renamed, the marker string changed, the glob stopped matching, the directory emptied,
> the optional lookup returned undefined - would it exit **red**, or would it exit **green**
> having measured nothing?

The night that prompted this found the same shape three times independently. `type-floor.mjs` read
its floors with a regex over `src/validation/typeFloor.ts`; PR #131 moved the constant, the regex
matched nothing, and 502 variants went unmeasured while the alarm blamed the catalog. A rule
declaring `fires: test:<spec>` vanished from every loaded surface because the compiler read
"the named mechanism exists" as "the mechanism carries the sentence". A `check:contract-evidence`
marker was satisfied by an incident write-up quoting it. In all three the gate resolved its
subject by a name and read the empty result as success.

**The population.** 138 gates that `scripts/gates.mjs` discovers - 34 check entry files and 104
test files - plus three catalog gates the discovery cannot see, two compiler steps, and 17
validators under `src/validation`.

## The count

| | red | green | reporter, cannot fail |
|---|---|---|---|
| check entry files (34) | 8 | 21 | 5 |
| catalog gates (3) | 3 on the target list, 0 on the measurement | - | - |
| compiler steps (2) | 1 | 1 | - |
| validators (17) | 2 | 15 | - |
| test files (104) | 0 | 104, as a class | - |

Not one gate in the tree contained a non-emptiness assertion of the form
`if (files.length === 0) throw` before this row, with three exceptions: `check-workflows.mjs`
("a run that validates nothing must say so loudly rather than exit 0"), `cli/scripts/build-skill.mjs`,
and the three catalog gates repaired the same night. Where a gate was red it was almost always red
by accident - a committed baseline compared in both directions happens to force a comparison
against a non-empty set, which is a side effect of the baseline design rather than a floor anybody
chose.

## Check entry files

`subject resolved by` names the expression whose emptiness the verdict turns on.

| gate | subject resolved by | empty -> | fixed |
|---|---|---|---|
| `check:shared-instructions` | `findFilesNamed(ROOT, 'AGENTS.md')`, and four tables keyed by workflow NAME (`CRITICAL_WORKFLOW_MARKERS.get(name) ?? []`) | **green** for the name-keyed tables: rename `orchestrator.md` and its markers, its 200-line core limit and its common-path budget all drop silently | reports contracts and workflow definitions, AND every key of the four tables must name a workflow that exists |
| `check:tree-shape` | `git ls-files -z` | **green** - a permit list, never a require list | reports tracked paths |
| `check:line-endings` | the disagreement between `git status` and `git diff` | **green, and correctly so** - it detects a positive condition, so empty IS the healthy state | `measures: none` |
| `check:contract-freshness` | `files.filter(isInstructionFile)`, a prefix predicate imported from `check-retired-names.mjs` | **green** - prints `0 contract file(s), every referenced script, doc and path exists` | reports contract files |
| `check:contract-citations` | `ruleIds()` returns empty sets when `contracts/rules` is gone; `resolveContract` answers null and the caller `continue`s | **green twice** - an empty `areas` skips every citation in the repository | reports rule ids and files scanned |
| `check:workflows` | `readdirSync('.github/workflows')` | **red** - the one gate that already asserted it | reports workflow files |
| `check:docs-index` | a regex over `docs/README.md`'s table, against `git ls-files -- docs` | **red** - saved by comparing two sides, so a dead regex makes every doc "missing" | reports both sides |
| `check:client-secrets` | four hardcoded directory names, walked behind `try { … } catch { return []; }` | **green, and it manufactures the empty set itself** - move `src/` and it prints `Client secret scan OK (src, e2e, scripts, docs)`, naming the directories it did not read | reports files scanned |
| `check:skill` | the marketplace entry, the skill source, the version | **red** - it measures the subject and its complement | reports skill files |
| `check:gate-coverage` | `check:`/`test:` prefixes over package.json, and `globSync('scripts/**/*.test.mjs')` | **red for checks** (the audit measures the complement), **green for tests** - and `runTests` opened `if (files.length === 0) return 0;` | reports gates audited; the empty test glob is now a problem |
| `check:vercel-config` | `config.rewrites`, `config.redirects`, and `if (!config.cleanUrls) return [];` | **green** - one boolean decides whether the second half measures anything at all | reports route rules |
| `check:behaviour-docs` | `Object.entries(words)` from `words.json` | **green** - `{}` renders the doc unchanged, so its tables are pinned to nothing | reports behaviour words |
| `check:function-budget` | `walk(api/)` filtered by a hardcoded extension whitelist | **green**, benignly - it is a ceiling, so zero is under the cap; the live hazard is the whitelist, not the count | reports functions |
| `check:api-route-depth` | `/(['"\`])(\/api\/[^'"\`\n]*)\1/g` over `src/` | **green on the client half** - route through a base-URL constant and it certifies routing over zero paths | reports both sides |
| `check:client-neutral` | `git ls-files -- ...SCANNED`, a hardcoded path list | **green** - `git ls-files -- src/gone` exits 0 with no output, so a moved directory leaves the gate silent | reports files scanned |
| `check:copy` | the same path list, against `scripts/copy-baseline.json` | **red** - the two-way baseline is the non-emptiness assertion; `readBaseline()`'s `catch { return {}; }` is the residual hole | reports both sides |
| `check:preview-serialization` | `moduleScopeNames(text)`, three `^`-anchored regexes over source | **green, and it is the threshold side** - an incomplete table makes `if (!bound.has(...)) continue` skip every real violation | reports files scanned |
| `check:catalog-emit` | `window.NOACG_CATALOG.CATALOG`, against `e2e/catalog-baseline.json` | **red on a full run** (whole-set key comparison); **green if the baseline file is renamed** - a missing baseline is a bootstrap, and it re-records and exits 0 | reports variants and baseline entries |
| `check:catalog-cost` | `loadCatalogEntries()` | **green by design** - `gate: none`, returns 0 unconditionally; with zero entries it prints `design 1 costs NaN ms` | reports designs |
| `check:vendored` | three regexes over vendored banners | **red** - "A present file with no banner is a fault … it means the upstream layout moved and this row has quietly stopped measuring anything" | reports libraries |
| `check:models` | `/\b(?:model\|id):\s*'…'/g` over `src/ai`, `api/_lib` | **green** - switch to double quotes or a `const MODEL =` indirection and it checks zero ids against four live listings | reports pinned ids |
| `check:ograf-schema` | `*.ograf.json` by suffix - exactly ONE file in the tree | **split**: the digest half is red, the corpus and the whole mutation battery are green on an empty corpus | reports schema files and manifests |
| `check:advisors` | `body.lints ?? []` from the Management API | **green** - a reshaped response absorbs into `?? []`, prints `0 advisor findings`, exit 0 | reports findings and baseline |
| `check:freshness` | `readdirSync(e2e).filter(f => f.endsWith('.spec.ts'))` | **green** - "Deliberately exit 0 either way", a declared reporter | reports spec files |
| `test:e2e:affected` | `SUITE_CRITICAL_SCRIPTS`, a hand-written name alternation inside a wholesale `scripts/` ignore | **green** - rename `dev-port.mjs` and the plan is `none`, the shards are skipped, the gate is green having run nothing. The file records this having happened on 2026-08-06 | reports spec files on disk |
| `test:e2e:queued` | running processes matching `SWEEP_SCRIPTS` | **green, by design** - fails open on purpose; zero is the answer that grants permission | `measures: none` |
| `check:owner-setup` | a hardcoded row table against `gh` output | **green** - a report, never a gate, and it says so | reports rows |
| `test:ai-gateway` | two hardcoded parallel lists of 22 paths | **red** in every direction its subject can move | reports test files |
| `check:migration-drift` | `readdirSync(supabase/migrations)` inside `catch { return []; }` | **green by contract, and it CRASHES**: the empty path returns an object with no `staging` key and the printer dereferences it | reports migrations; the crash is filed |
| `check:owner-receipts` | `readdirSync('docs/backlog')` behind `if (!existsSync(dir)) return [];` | **green** - rename the directory and it reports OK forever | missing directory now refuses; count is `optional` |
| `check:owner-queue` | `readdirSync('docs/acceptance/owner-queue')` | **green** - a missing directory printed `OK … (nothing queued)` | missing directory now refuses; count is `optional` |
| `check:contracts` | `loadRules()`, and `ownedDirectories()` by the `GENERATED_MARKER` string | **red on the rules** (generated output is compared to disk); **green on the owned set** - change the marker and every nested contract silently stops being maintained while `--check` says "current" | reports rules and owned directories |
| `check:contract-evidence` | `trackedPaths().filter(/(AGENTS\|CLAUDE)\.md$/)` | **green, and it volunteers to make itself permanent**: an empty subject prints `Bank it:` with the `--write` command that would zero the baseline | reports contracts measured |
| `check:retired-names` | six directory prefixes, and `contracts/retired.json` | **green on both axes** - `"retired": []` validates, and a renamed `.agent-workflows/` leaves it reporting OK over a surface it no longer reads. This is the build-tier gate whose whole subject is the second defect of the three | reports instruction files and retired mechanisms |

## The three catalog gates the discovery cannot see

`type-floor.mjs`, `overflow-sweep.mjs` and `field-coverage.mjs` are invoked straight from
`nightly.yml` and `catalog-gates.yml` as `node scripts/type-floor.mjs`. They are not `check:` or
`test:` scripts, so `scripts/gates.mjs` never discovers them and `check:gate-coverage` never
audits them - **the gate that audits gates could not see the three gates that broke.** That is why
the measurement rule is enforced inside `scripts/measured.mjs` rather than only in the runner: a
gate protects itself whoever runs it.

All three now refuse an empty target list (`process.exit(2)`), which was the 2026-09-08 repair.
The residual hole is shared and is NOT fixed here: none of them asserts that a single element was
ever examined. A catalog that rendered blank without throwing would print
`PASS - no text renders under its category floor` over 502 empty frames. Filed as
`docs/backlog/catalog-gates-do-not-assert-they-measured-an-element.md`.

## The compiler

`compile-contracts.mjs --check` is **red** on an empty rule store, because it compares generated
output against disk rather than scanning for problems - the generated files would differ and it
would fail. It is **green** on an empty `owned` set, and that is the `fires:` defect's sibling:
`ownedDirectories()` finds a directory by the `GENERATED_MARKER` string inside its `AGENTS.md`, so
changing that string empties the set, every nested contract stops being regenerated, `staleOutputs`
only looks inside `owned` and therefore finds nothing stale, and `--check` prints
`OK - N rule(s), M generated file(s) current`.

`contracts-lib.mjs` carries the `fires:` defect itself. `rule.carried = Boolean(mechanism &&
existsSync(...))` reads "a file with that name exists" as "that file prints this rule", and a
carried rule is omitted from every loaded surface. One rule in the store is carried today -
`landing/retire-mechanism-same-change-replaces-naming`, `fires: gate:check-retired-names` - and
`check-retired-names.mjs` did not contain its sentence anywhere. Fixed in this branch: `carried`
now requires the mechanism to contain `rules.text('<id>')`, `scripts/rules.mjs` gained that
accessor, and `check-retired-names.mjs` prints the rule through it.

## The validators

Fifteen of seventeen are green on a missing subject, and most say so in their own comments -
"unknown is a legitimate answer", "this instrument stays silent". That is defensible per validator
and indefensible in aggregate, because no caller can tell "measured, clean" from "measured
nothing". The five worth naming:

- **`designRules.ts`**: `PROFILE_MULTIPLIER[target.profile]` comes from a persisted OPTIONAL field.
  An unknown profile id makes the multiplier undefined, `hardPx` NaN, and `fontPx < NaN` false for
  every text on every graphic. This is `px < undefined` one layer down from the original defect.
- **`validateTemplate.ts`**: the literal `'var NOACG_ANIM'` gates roughly 120 lines of animation
  rules, and the same literal exists in four independent places (the emitter, this gate,
  `runtimeBench.ts`, `animData.ts`). Changing the emitter to `const NOACG_ANIM` disarms two gates
  at once and reports zero findings.
- **`engineSupport.ts`** and **`templateBench.ts`**: both iterate a registry (`ENGINE_FEATURES`,
  `UNSAFE_JS`). A row dropped from either stops being enforced, and an empty `ENGINE_FEATURES`
  would certify every template for CasparCG 2.3 while printing "Renders on every supported playout
  engine."
- **`plateLegibility.ts`**: a rule written down and enforced nowhere. Nothing under `src/` imports
  it; its only consumer is a spike script no workflow runs.
- **`readiness.ts`** is the counter-example and the model: `unclaimedFindings` surfaces any finding
  no row claims, and a `live` row reports `untested` rather than `pass` when the bench did not run.

Filed as `docs/backlog/validators-that-are-silent-when-they-measure-nothing.md`. They are a
different layer from the gates - a validator returns findings to a caller rather than an exit code
- so the `measured()` contract does not fit them as written.

## Test files

All 104 share one shape and none was individually blind on inspection. The class hazard is that a
test file whose cases come from a resolved list registers ZERO tests when that list resolves to
nothing, and `node --test` then reports the FILE as one passing test and exits 0. Verified on Node
24.13.0: a file with `for (const n of []) test(...)` prints `ok 2 - none.test.mjs` and the run
exits 0. `runTests` now counts each file's tests through a `node --test` reporter and refuses a
file that registered none.

## What was built

`scripts/measured.mjs`, and three enforcement points around it:

1. **In the gate.** `measured(n, subject)` prints `[measured] N subject` and exits 1 on zero,
   whoever ran the gate - the build, a workflow, or a person. `measured.optional(n, subject, why)`
   is the escape hatch, and `why` must be a sentence.
2. **In the runner.** `scripts/gates.mjs` gives each check a receipt file and refuses a check that
   exits 0 having reported nothing at all. That is the case only the runner can see: the call was
   deleted, or its code path stopped being reached.
3. **In the audit.** `check:gate-coverage` refuses a gate that neither reaches for the helper nor
   declares `// measures: none - <why>` in its header, so the next blind gate cannot land.

Plus `runTests` refusing a test file that registered no tests, and refusing an empty test glob.

## What a review of it found, the next day

Four reviews read the mechanism above on 2026-09-09 and found three holes in it, each of the same
species it was built to catch: the empty-glob refusal tested the tier's literal NAME rather than
its population, so every tier but `build` accepted zero test files; the runner and the audit read
the `measures: none - <why>` exemption with two different thresholds, and the weaker one was in
force wherever a workflow runs a gate directly; and the audit's static half was a substring test
that a sentence about the helper, in a comment, satisfied. All three are closed, with a negative
test each, in `scripts/measured.test.mjs`. What no static reading can prove - that a `measured`
call is REACHED - is now written out over `judgeMeasurement` in `scripts/gates.mjs` rather than
implied to be covered. See `docs/handoffs/2026-09-09-y-measured-holes.md`.
