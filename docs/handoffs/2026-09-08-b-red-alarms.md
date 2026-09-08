# The two red alarms: one broken gate, one unpatched advisory

Branch `claude/b-red-alarms`, from `origin/main` at `684e2bf2`. Five commits, each revertible on its
own. Issue #85 (nightly) and issue #112 (weekly audit) both have a named cause; **neither was a
threshold that wanted moving**, which was the cheap wrong answer available for both.

`check: review delegated, simplify inline, verify green, taste not applicable` — the full report is
at the end.

## #85 — the nightly. The GATE broke, not the catalog

**The triage on the issue was chasing the previous night's problem.** #85 has been red twice for
two different reasons. The E2E time-budget failure of 2026-09-07 was already fixed by PR #113,
which re-set the ceiling to 5,500 ms from the measured band. On the 2026-09-08 run
(`34187928432`) the budget passed and **`Combined nightly report` was green**; the only failing job
was `Type floor, overflow sweep and field coverage`. So the per-file duration diff the row was sent
to do had already been done and was not the live fault. I did not repeat it.

**Cause: `scripts/type-floor.mjs` crashed at module load, and measured nothing.** It read its
per-category floors with a regex over the `TYPE_FLOOR_PX` declaration in
`src/validation/typeFloor.ts`:

```js
const body = source.match(/TYPE_FLOOR_PX[^=]*=\s*{([^}]*)}/)?.[1];
```

PR #131 (the type-aware size floor) moved the numbers to `src/model/designRules.ts` and left
`typeFloor.ts` as a re-export. The regex matched nothing, `table.default` was undefined, and the
script threw `could not read TYPE_FLOOR_PX ... has its shape changed?`. Every design was fine; the
instrument was broken. Reproduced in one second locally before touching anything.

**Fix: the gate reads its subject the way the product does.** The script already drives a live dev
server, and three sibling scripts already `import()` a `/src/*.ts` module through it, so parsing
the source text was a second reading of a shape with one owner. It now imports
`src/validation/typeFloor.ts` — the name every caller uses, so the numbers can move again behind it
— and asks the module's own `typeFloorFor` for each category's floor, which also deletes this
script's private copy of the unknown-category fallback. The report line prints the table instead of
two hard-coded keys.

**Re-derived, not inferred:** `node scripts/type-floor.mjs` against a live dev server —
**502 variants, PASS, exit 0**, `floors: corner-bug 16 px · everything else 20 px`. The corner-bug
category alone was run first so the non-default floor path was exercised on its own (37 variants,
PASS).

### The same crash reddened a second workflow nobody had connected to it

`catalog-gates.yml` runs four of the same five scripts on its own daily schedule and went red on
`main` today at 15:20 UTC (run `34244064067`) with the identical stack trace. One defect, two
alarms. The script fix repairs both.

### Why finding this took a stack-trace grep, and what now prevents that

Both jobs ran their gates under `|| status=1` and exited once at the bottom. The four gates after
type-floor printed `PASS`, and **a gate that fails by CRASHING prints no report of its own** — so
the log's only evidence was a stack trace ~280 lines into a ~900-line file, under steps GitHub
renders as `UNKNOWN STEP`. Each gate in both workflows now prints `GATE PASS/FAIL - <name>` and the
step ends with `CATALOG GATES FAILED: <names>`.

## #112 — the weekly audit. One advisory, and it had a patch waiting

Of the four kinds the issue body lists it is only the first. I re-derived all four steps of run
`34119979095` locally on the current tree: `check:vendored` exit 0, `check:models` exit 0 (13 ids
against a live listing), `check:ograf-schema` exit 0, and `npm audit --audit-level=high` **exit 1
on a single finding**:

```
browserslist  <=4.28.6   high   fix available
  GHSA-c83g-rgw3-j3cx  unbounded memory growth (no cache eviction)
  GHSA-73wf-gq98-2v4g  prototype write via untrusted browserslist-stats.json
```

A transitive dev dependency of `@babel/helper-compilation-targets`, which declares `^4.24.0`, so the
patched **4.28.7 was already inside the range its parent asks for**. This is not the "report, never
auto-upgrade" case: that rule guards the pinned things (Remotion across three package files,
`@vercel/sandbox`, the es2017 target) and the staleness half. The audit row is the one **blocking**
row in `docs/STACK_FRESHNESS.md`, threshold `high` on purpose.

`npm update browserslist --package-lock-only` moved **six lockfile entries and nothing else** —
browserslist plus its own data packages (`baseline-browser-mapping`, `caniuse-lite`,
`electron-to-chromium`, `node-releases`, `update-browserslist-db`). `npm run build` green (the
check that matters — browserslist feeds autoprefixer), `npm audit --audit-level=high` now **0
vulnerabilities**. It is its own commit, `87fa9f69`, so it reverts alone — which is what the filed
backlog item asked for. That item is deleted in the landing commit per `docs/backlog/README.md`.

### The finding that came out of trying to close it

**`weekly-audit.yml` was the one rolling alarm whose issue steps were not branch-guarded.**
Dispatching it from this branch to prove the fix — the likeliest branch anyone would run it from —
would have made the run green, fired the close step, and posted *"Audit green again at `<a branch
sha>`"* on #112 while `main` was still red. `docs/CI_STABILITY.md` argued the exemption from what
the alarm is *about* ("the repository, which a branch dispatch does not misstate"); **the hole was
in its verb.** Withdrawing a claim about `main` needs the same guard as raising one. Both steps now
carry the same expression as the three siblings.

## What landed

| commit | what | reverts alone |
|---|---|---|
| `bd3040d8` | type-floor reads the module; nightly names each gate; `docs/CI_STABILITY.md` entry | yes |
| `87fa9f69` | browserslist lockfile bump | yes — lockfile only |
| `450fd4ee` | `docs/STACK_FRESHNESS.md`; backlog item deleted | yes |
| `88c61f5a` | weekly-audit branch guard; catalog-gates names each gate | yes |
| `ef0950ac` | the `/check` review's finding: the repaired gate must still fail loudly | yes |

## What the review caught, and why it mattered more than the original bug

The `/check` review found that **my fix had traded a loud failure for a silent one.** Removing the
regex removed its `throw`, and nothing replaced it. `typeFloorFor` returns
`(category && TYPE_FLOOR_PX[category]) || TYPE_FLOOR_PX.default`, so if `default` is ever renamed
or dropped every category without its own key resolves to `undefined`, `px < undefined` is false
for every element, and the gate prints PASS over 502 designs having measured none of them.

I did not take that on the argument. With `default` renamed to `defaultFloor` and the assert
disabled, `node scripts/type-floor.mjs lower-third --json` gave **101 variants, distinct floor
values: `undefined`**, and the run still printed *"PASS — no text renders under its category floor"*
at exit 0. With the assert in place the same tree exits 1 and names the file and the consequence.
Both temporary edits were reverted and the tree re-verified.

Worth keeping in mind beyond this file: **the failure mode of "read it from the product" is silent,
where the failure mode of "parse it" was loud.** The import is still the right call, but it needs
the assert to be as safe as what it replaced.

## Verification

- `npm run build` — exit 0, read from the build's own exit code, re-run after every edit including
  the last workflow change.
- `npm run check:workflows` — 14 validated, after both workflow edits.
- `node scripts/type-floor.mjs` — 502 variants, PASS, exit 0, against a live dev server.
- `npm audit --audit-level=high` — exit 0.
- `check:vendored`, `check:models`, `check:ograf-schema` — exit 0 each.
- **Nightly dispatched on the branch and read to a verdict: run `34255205300`.** The job that was
  failing, `Type floor, overflow sweep and field coverage`, is **green in 11.5 minutes** — against
  an 11.1-minute baseline measured on the last green nightly (`34012229991`, 2026-09-06), so the
  repaired gate costs what it always cost and the 45-minute job cap is not in play. Its log now
  reads:

  ```
  Type floor — 502 variants checked
    floors: corner-bug 16 px · everything else 20 px
  GATE PASS - type-floor
  GATE PASS - overflow-sweep
  GATE PASS - field-coverage
  GATE PASS - numerals
  GATE PASS - engine-floor
  CATALOG GATES: all five passed.
  ```

  The run's issue steps are branch-guarded, so it could neither raise nor withdraw #85.

## What remains, and why

1. **#112 stays OPEN on purpose.** The alarm is a statement about `main`, and `main` is red until
   this lands. The workflow closes it itself on the next green run — Monday 2026-09-14 06:00 UTC,
   or a `workflow_dispatch` on `main` sooner. The cause and the measurement are on the issue.
2. **#85 likewise self-closes** on the next green scheduled nightly (04:42 UTC-ish, 2026-09-09),
   which will be the first one to run a type-floor that works since 09-07.
3. **The E2E mean did NOT come back down, and that is new information.** The whole nightly ran
   green on this branch — all 12 jobs — and the budget reported:

   ```
   tests            1289
   mean per test    5.22 s   (ceiling 5.50 s)
   drift            29% above the 4.04 s baseline of 2026-07-31
   drift             9% above the 4.80 s baseline of 2026-09-07
   like-for-like    5.14 -> 5.23 s over 1280 tests in both runs (1.6% slower, 714 of them slower)
   ```

   **5.22 s is exactly the figure from the red night of 2026-09-07.** The triage on #85 read that
   night as "a genuine outlier, 3.8 standard deviations above the median, most likely the runner"
   and could not prove it from two samples. A third sample now sits on top of it, on different
   hardware at a different hour. That is weak evidence for a runner blip and good evidence that
   **the band has moved to ~5.2 and stayed there.** The re-set 5.50 s ceiling therefore has about
   5% headroom, not the 24% its predecessor was given.

   This is a trend to watch, not an alarm, and it should not be turned into one — but it is now a
   measurement rather than a suspicion, and it is nobody's item yet. The honest next step is a few
   more nights of the printed drift line before anyone touches the ceiling again.
4. **Neither of these alarms gates the merge queue, which reads `ci.yml` alone.** That is by design
   and is also why both survived every landing until somebody read them — six days for #112. Worth
   a deliberate decision rather than a drift; not one I took here.
5. **`e2e/lite-type-floor.spec.ts:21` still hand-copies the floor** — `const FLOOR_PX = 20; //
   lower-third, from src/validation/typeFloor.ts`. After this branch it is the **last** second
   reading of that number in the repo: `designAdjust.ts` and `bridgeApi.ts` both import
   `typeFloorFor`, and I checked the whole of `scripts/` — `type-floor.mjs` was the only other one,
   and it is the bug this branch fixed. Move the lower-third floor and that spec keeps asserting 20
   with nothing flagging it. The spec already imports from `src/`, so `typeFloorFor('lower-third')`
   closes it. Reported rather than fixed: it is outside this diff and belongs in its own change
   (`.agent-workflows/check.md`), and filed as `docs/backlog/the-last-hand-copied-type-floor.md`.
6. **The `gate()` shell helper is now duplicated in `nightly.yml` and `catalog-gates.yml`** — five
   gates and `$ONLY`-parameterised four. Deduping means a composite action or a runner script, and
   the repo has the precedent (`.github/actions/node-modules`). Left as a report because it would
   ripple past this diff, which the check workflow says stays a report.

## Pointers

- `scripts/type-floor.mjs` — the import is `window.__floor` beside the other module loads; the
  header says why parsing was wrong.
- `.github/workflows/nightly.yml` and `.github/workflows/catalog-gates.yml` — the `gate()` wrapper.
- `.github/workflows/weekly-audit.yml` — the two guarded `if:` expressions.
- `docs/CI_STABILITY.md` — class 1 gained "the gate itself broke"; class 6 corrects the
  weekly-audit exemption.
- `docs/STACK_FRESHNESS.md` — the browserslist write-up, and "check for an upgrade path before
  reaching for an override".

## The `/check` report

- **`review: delegated`.** The code-review skill was invoked at `high` naming this branch and
  handed its findings back into the session, so the pass ran. Scope-checked against phase 1
  (`claude/b-red-alarms`, merge-base `684e2bf2`, the eight changed files) before anything was acted
  on. One medium finding, fixed and measured (`ef0950ac`, section above). Three low: the nightly
  verdict label naming two of five gates (fixed in the same commit), the #112 withdrawal gap (item
  1 under "What remains"), and the hand-copied floor in `e2e/lite-type-floor.spec.ts` (outside the
  diff — filed, not fixed).
- **`simplify: inline`.** The simplify skill returned fan-out instructions rather than a result, so
  by `.agent-workflows/check.md`'s four-branch rule it did not run and the leg was done here, over
  its four angles. Reuse: the duplicated `gate()` helper, reported not fixed (it would ripple).
  Efficiency: folding the `FLOOR` read into the module-import `evaluate` saves one round trip in a
  script that then renders for five minutes — considered and skipped for readability. Altitude: the
  useful one — I checked whether the fix was a special case by grepping `scripts/` for any other
  constant pulled out of `src/` by regex, and there is none, so it closed the class rather than
  patching an instance. Simplification: one precision fix, a comment saying "wrong twice over"
  ahead of three reasons.
- **`verify: green`.** `npm run build` exit 0 (read from the build's own exit code) after every
  edit including the last; `npm run check:workflows` 14 validated; `node scripts/type-floor.mjs`
  green both scoped and over all 502 variants; `npm audit --audit-level=high` exit 0. No product
  code changed, so no affected-spec run was owed — and the branch got far more than that anyway:
  the dispatched nightly ran the **whole** E2E suite green on the commit that already carried the
  lockfile bump.
- **`taste: not applicable`.** Nothing here is a design file, shared template machinery, the SVG
  import road, or fit/alignment code. The one path by which a dependency bump could move pixels is
  autoprefixer's data, and that is covered on this branch by the catalog calibration tripwire and
  all eight E2E shards, green on the commit carrying the bump.
