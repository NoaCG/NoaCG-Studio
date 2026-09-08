# Every gate now says how much it looked at, and zero is a failure

Branch `claude/f-gates-that-measure-nothing`, from `origin/main` at `032678a2`. The enumeration -
every gate, validator and compiler step in the tree, with the one question put to each - is
`docs/metrics/2026-09-08-gates-that-measure-nothing.md`. Read that first if you only read one thing;
this file is what changed and what is left.

The night of 2026-09-08 found three mechanisms passing while measuring nothing, independently of
each other. `type-floor.mjs` read its floors by a regex over a constant PR #131 had moved. A rule
declaring `fires: test:<spec>` was treated as carried by a mechanism that never printed it. A
contract marker was satisfied by an incident write-up quoting it. Same shape three times, and each
one was found by a person reading a log.

## The count

138 gates that `scripts/gates.mjs` discovers (34 check entry files, 104 test files), plus three
catalog gates the discovery cannot see, two compiler steps and 17 validators.

Of the 34 check entry files: **8 red** on an empty subject, **21 green**, **5 declared reporters**
that cannot fail at all. Only three gates in the whole tree carried a non-emptiness assertion
before this branch - `check-workflows.mjs`, `cli/scripts/build-skill.mjs`, and the three catalog
gates repaired the same night. Where a gate was red it was almost always red by accident: a
committed baseline compared in both directions happens to force a comparison against a non-empty
set. That is a side effect of the baseline design, not a floor anybody chose.

The sharpest ones, in the order I would defend fixing them:

- **`check-retired-names`** is blind on both axes, and it is the build-tier gate whose whole subject
  is the second of the three defects. `"retired": []` validates; a renamed `.agent-workflows/`
  leaves it reporting OK over a surface it no longer reads.
- **`check-contract-evidence`** goes green on an empty subject *and prints the command that banks
  the emptiness into its baseline* - `Bank it: node scripts/check-contract-evidence.mjs --write`.
- **`check-client-secrets`** manufactures its own empty set: `files()` swallows a failed directory
  read with a bare `catch { return []; }`, so moving `src/` printed
  `Client secret scan OK (src, e2e, scripts, docs)`, naming the directories it had not read.
- **`check-model-ids`** resolves the ids it checks by a regex over source text, guarding a failure
  that only shows in production.
- **`test:e2e:affected`** fails toward `mode: none` if one name in `SUITE_CRITICAL_SCRIPTS` moves,
  and the file records that having happened on 2026-08-06.

**The gate that audits gates could not see the three gates that broke.** `type-floor.mjs`,
`overflow-sweep.mjs` and `field-coverage.mjs` are invoked straight from two workflows as
`node scripts/type-floor.mjs`, so they are not `check:`/`test:` scripts, `gates.mjs` never discovers
them, and `check:gate-coverage` never audits them.

## What was built

`scripts/measured.mjs` and three enforcement points around it, all beside `scripts/gates.mjs` where
the discovery they judge lives.

1. **In the gate.** `measured(n, subject)` prints `[measured] N subject` and exits 1 when the count
   is zero, whoever ran the gate - the build, a workflow, or a person at a prompt. That placement is
   deliberate and it is the finding above: a rule enforced only by the runner would not have covered
   `type-floor.mjs`. `measured.optional(n, subject, why)` is the escape hatch, and `why` must be a
   sentence of at least 20 characters saying when zero is honest.
2. **In the runner.** `scripts/gates.mjs` hands each check a receipt file and refuses a check that
   exits 0 having reported nothing at all. That is the case only the runner can see - the call was
   deleted, or its code path stopped being reached.
3. **In the audit.** `check:gate-coverage` refuses a gate that neither reaches for the helper nor
   declares `// measures: none - <why>` in its header, with the same reason rule `gate: none`
   already has. This is the half that makes the FIFTH blind gate fail to land rather than pass.

Plus the same question asked of the 104 test files, which the mechanism above cannot reach: a test
file whose cases come from a resolved list registers ZERO tests when that list resolves to nothing,
and `node --test` then reports the FILE as one passing test and exits 0. `scripts/gates-test-count.mjs`
is a `node --test` reporter that counts each file's tests beside the reporter a person reads;
`runTests` refuses a file that registered none, and refuses an empty test glob, which it used to
answer with `return 0`.

The build's log now reads
`[gates] check:retired-names ok (0.4s) - 891 instruction files, 6 retired mechanisms`, and ends with
`[gates] 100 test file(s) ran 1325 test(s)`.

**One thing I got wrong and caught before pushing.** `measured()` wrote its line to stdout. A gate's
stdout can be DATA: `.github/workflows/ci.yml` runs `PLAN="$(node scripts/e2e-affected.mjs --json
--all)"` and hands the result to `JSON.parse`, and half a dozen gates have a `--json` mode. That
would have broken every CI plan step - a worse bug than the one the helper exists to prevent. The
line goes to stderr; the runner reads the receipt file, never the text.

## Every gate that was green is now red on an empty subject

All 34 check entry files report, plus the three catalog gates. Two of them declare
`measures: none - <why>` instead, and both are honest: `check-line-endings` looks for a
disagreement between two git reads rather than measuring a population, so empty IS the healthy
state; `test:e2e:queued` reports whether a browser-driving run is in flight, where zero is the
answer that grants permission.

Two gates got an explicit refusal rather than only a count, because their emptiness has two
different meanings. `check-owner-queue` and `owner-receipts` both resolved their subject by a
directory path and returned `[]` for "missing" and "drained" alike. The directory being gone is now
a refusal that names the path and the consequence; the item count is `measured.optional`, because a
drained queue is honest.

**What the counting does NOT cover, and I want this said plainly.** `measured` closes the half where
the SET empties. The half that actually broke on 2026-09-08 was the other one: `type-floor` had 502
subjects and its THRESHOLD was `undefined`, so `px < undefined` was false for every element.
Counting subjects would not have caught that; `if (!(FLOOR.default > 0))` did. Three gates still
have a threshold that can silently empty, filed as
`docs/backlog/a-gates-threshold-table-can-empty-without-the-gate-noticing.md`. The fourth instance
of that family IS fixed here: `check-shared-instructions` had four tables keyed by workflow NAME and
consulted as `TABLE.get(name)`, so renaming `orchestrator.md` would have dropped its critical
markers, its 200-line core limit and its 640-byte common-path budget in one edit while the gate
printed OK. Every key of those tables must now name a workflow that exists.

## The `fires:` drop, which is the same shape one layer up

Row A found that a rule declaring `fires: test:<spec>` vanishes from every loaded surface. The
compiler read `rule.carried = existsSync(mechanism)` - "a file with that name exists" - as "that
file prints this rule", and a carried rule is omitted from the directory contract and from
`.claude/rules/` on exactly that understanding. It is the same defect: an unproven lookup read as
success. It needed its own fix rather than the `measured` contract, because the subject here is one
rule rather than a set.

`carried` is now PROVEN: the mechanism's source must contain `rules.text('<id>')`.
`scripts/rules.mjs` gained that accessor (and stopped running `main()` on import, which it had been
doing). `npm run learn` refuses a `fires:` whose mechanism does not carry the sentence, so the
footgun cannot be reloaded.

One rule in the store was carried - `landing/retire-mechanism-same-change-replaces-naming`,
`fires: gate:check-retired-names` - and `check-retired-names.mjs` did not contain its sentence
anywhere. It does now, printed on the failure path where a person needs it. The compiled contracts
are byte-identical, because that rule was already omitted; what changed is that the omission is now
earned.

## The negative test

`scripts/check-contract-evidence.mjs` resolves the contracts it measures with
`trackedPaths(root).filter((f) => /(^|\/)(AGENTS|CLAUDE)\.md$/.test(f))`. Breaking that regex is
exactly what PR #131 did to `type-floor`: the subject moved and the resolver did not.

| what was run | exit |
|---|---|
| `main`'s version of the gate, with the regex broken to `\.mdx$` | **0** |
| `npm run build` on this branch, same break | **1** |
| `npm run build` on this branch, break reverted | **0** |

`main`'s version did not merely pass. It printed the 43 contracts whose evidence had "improved"
from N to 0, then `Bank it: node scripts/check-contract-evidence.mjs --write`, then
`OK - 0 evidence line(s) across 0 contract(s), none new`, and exited 0. Following its own advice
would have written the emptiness into the baseline permanently.

On this branch the same break gives:

```
[measured] 0 contracts measured

MEASURED NOTHING: this gate resolved 0 contracts measured, so it would have passed without looking at anything.
Something the gate resolves its subject by has moved: a constant, a file name, a marker string, a glob, or a directory that is now empty.
Fix the resolution rather than the count. If zero is genuinely honest here, say so in the code with `measured.optional(n, subject, why)`.

[gates] check:contract-evidence FAILED (exit 1, 0.1s)
...
[gates] 1 check(s) failed: check:contract-evidence - tests not run
```

The break was applied and reverted in the working tree, never committed.

## What is left

- `docs/backlog/catalog-gates-do-not-assert-they-measured-an-element.md` - the three catalog gates
  refuse an empty target list but not an empty MEASUREMENT. If every frame rendered blank without
  throwing, all three print PASS over 502 variants. Not fixed here because verifying a browser gate
  needs a live dev server and Chromium, and an unverified repair to those three is how the original
  defect was written.
- `docs/backlog/a-gates-threshold-table-can-empty-without-the-gate-noticing.md` - the other half,
  above.
- `docs/backlog/validators-that-are-silent-when-they-measure-nothing.md` - 15 of the 17 modules
  under `src/validation` return an empty finding list when their subject fails to resolve, which is
  what a clean graphic returns. `readiness.ts` is the counter-example and the model. Includes the
  one rule written down and enforced nowhere: `plateLegibility.ts` has no importer under `src/`.
- **`scripts/migration-drift.mjs` has a live crash on its empty path.**
  `if (local.length === 0) return { status: 'skipped', ... }` returns an object with no `staging`
  key, and the printer then reads `.status` off `undefined`. `post-land.yml` runs it as
  `|| true`, so nobody would see it. The `measured(local.length, ...)` call now exits before that
  line is reached, which hides the crash rather than fixing it - it comes back the moment anybody
  relaxes that to `measured.optional`.
- **`check:ograf-schema` reports no measurement on its network-outage path**, where it prints
  "NOT CHECKED" and exits 0. It is a `workflow` gate, so the runner's "exited 0 having reported
  nothing" rule never judges it - but that is where the rule would fire if it ever did.
- **`scripts/run-ai-gateway-tests.mjs` keeps two hand-maintained parallel lists** of 22 sources and
  22 emitted paths with nothing tying them together. A file added to one and not the other still
  compiles-and-never-runs.
- `check:advisors` exits 1 against the live project: six findings are not in
  `supabase/advisor-baseline.json`, four of them
  `authenticated_security_definer_function_executable` on the new team RPCs (`is_team_member`,
  `team_join`, `team_production_save`, `team_rotate_code`) plus two `unindexed_foreign_keys` on
  `team_productions`. Pre-existing, unrelated to this branch, and somebody has to decide whether
  they are real rather than bank them.

## Pointers

- `scripts/measured.mjs` - the helper, and the three incidents in its header.
- `scripts/gates.mjs` - the runner and audit halves; `measuresNothing()` is the one reader of the
  exemption, so the two cannot disagree about who is exempt.
- `scripts/gates-test-count.mjs` - the `node --test` reporter.
- `scripts/measured.test.mjs` - the mechanism pinned by SPAWNING, because what is asserted is an
  exit code and a receipt file; an in-process assertion would pass for a helper that returned an
  error and left the gate green.
- `docs/metrics/2026-09-08-gates-that-measure-nothing.md` - the enumeration.
- `docs/WORKFLOW_ARCHITECTURE.md` §5.1 for the rule, §5.3 for the corrected `fires:` sentence.
