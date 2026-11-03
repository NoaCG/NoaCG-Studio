# Phase 34: Evaluate the holdout and decide limited go or no go

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-7: "Fair deterministic/Jev/eligible-challenger and relevant-vision comparison, frozen
  scoring/configuration, untouched holdout results, cumulative paid spend and an explicit
  limited-go (named families) or no-go verdict; no consequential-error increase in any family,
  with one pre-registered primary candidate and the non-blind regression slice reported
  separately."
- Row 34: "Before unsealing, verify archive digest, all 18 SVG/label member hashes and frozen
  configuration/scorer hashes against the pre-tuning manifest. Evaluate once with the
  pre-registered primary and reporting-only comparators; include the 51-file non-blind regression
  slice separately. Any family consequential-error increase or accepted invalid reference/critical
  intent error means no go. Otherwise name only qualifying families; never full go. Record useful
  setups, corrections, latency, billing and image comparison. No-go keeps the model route off and
  continues all remaining rows; no tuning on exposed holdout."

This row ran the single holdout evaluation and records it. It changes these notes only; no
product source, harness, configuration or test changed. This builder never dispatched a run and
never read holdout content: it read the runs' logs, `report.json` and ledger artifacts, which
carry scores, digests and receipts, not design bytes or labels.

## Verdict

**No go.** The model route stays off.

The pre-registered primary, structured Jev 1.14 (`jev-structured`), has more consequential errors
than deterministic matching in two of the six strata on the held-out designs: **quiz** (0 to 5)
and **credits** (3 to 6). Under the decision rule, an increase in any stratum means no go, so
no family is named. The harness reached this verdict itself (`verdictApplies: true`, reasons
`consequential-increase:quiz`, `consequential-increase:credits`), and the per-design table below
confirms it by hand.

- No arm proposed an invalid layer reference (`invalidRefs` 0 in all 90 rows).
- The critical intent errors the scorer can see are invented behaviour families. Jev invented
  families on `credits-1` (one), `credits-2` (two) and `quiz-3` (one), and on `quiz-2` it bound
  four decoys as live fields. These errors are counted in the consequential totals above. Nothing
  was "accepted", because no user acts in the evaluation. Each proposal is scored as if accepted,
  which is the stricter reading.
- Scoreboard alone would pass the family test: two of its three designs need fewer corrections
  plus decisions (`scoreboard-2` 0 against 1, `scoreboard-3` 5 against 6), and consequential
  errors are equal (4 against 4). The rule's any-stratum clause still makes the whole verdict no
  go, and this note does not turn that into a partial go.
- This is a completed evaluation verdict on an 18-design synthetic, single-author holdout. It
  says nothing about model quality in general (spec, Corpus and evaluation gate).

## Before unsealing

1. **The frozen harness moved, so it was re-accepted before the holdout.** The harness's own
   `freezeManifest` (reader graph plus server graph), run locally, reproduces row 33's frozen
   manifest `341b82e787694a80b3658d61911aa211906b28dc284577905e44e59219b739db` exactly at
   `4130a081`. At main `2dcadaf7eaa9d8b638b86f914b7e31aae5079321` it gives
   `516dcef08fc4ad6d309b405a5fda8ab7a166fa18ee257421782c471816224062`. The file list is the same
   229 files, and the only file that differs is `package-lock.json`, changed by commit `4bc351d2`
   (the render Sandbox migration, `@vercel/sandbox` 1.6.0 to 3.9.1). Every lockfile change is
   under the `@vercel/sandbox` subtree, and nothing in the evaluation graph imports that package.
   The holdout gate would have refused (`harness-not-frozen`) before decoding. The builder stopped
   and reported this before any holdout dispatch.
2. **Coordinator decision**: re-freeze the identical configuration after this harness-irrelevant
   lockfile change, with no tuning and the holdout untouched. The coordinator checked it
   independently. Reconcile run `41643035479` (main `2dcadaf7`, `accept_manifest` and `freeze`,
   configuration `a41861d2`, continuing `41634756346`) succeeded, with new money $0. Its ledger,
   read by this builder, records the frozen configuration `b2609a84…a4a7` at commit
   `a41861d21be5c13d2e0a8344644ea50606e2463d` and the manifest `516dcef0…6062`. The balance was
   6.905229415 and lifetime used 48.094770585, the same as at row 33's freeze.
3. **Dry run** `41643365934` (run number 12, attempt 1, main `2dcadaf7`, mock gateway, no key):
   configuration `b2609a84`, manifest `516dcef0…6062`, 90 scored rows (18 development designs by
   5 arms), 36 batches, 144 planned attempts, priced maximum $0.210188826, not stopped, no design
   refused.
4. Before each request the builder checked that `origin/main` was still `2dcadaf7` and that no
   run of `jev-svg-eval.yml` was in flight. The coordinator checked both again before each
   dispatch.
5. **In the holdout run itself**, before decoding: the chain check passed (`lost: []`), and
   `holdout-gate` returned `{"ok":true}`, which means a freeze is recorded, the configuration
   SHA-256 equals the frozen one, the harness manifest (which carries the scorer
   `jev-svg-score/1`, the primary and the 229 file hashes) equals the frozen and accepted one,
   there are at most two reporting challengers, there is no regression slice, and the holdout was
   not consumed. After decoding, the harness's `openHoldout` checks, and refuses on any mismatch:
   - the archive SHA-256 against `holdout_zip_sha256` `93d8531d…53eaf3` in
     `preparation/corpus-receipt.json`;
   - `SHA256SUMS` against the tree hash `fb156e4a…aa1c`;
   - every member against its listed digest, with no unlisted or missing member and regular
     files only;
   - the labels file against `eec1eca4…9ffd`;
   - the 18 designs against their labelled digests.

   The run scored all 18 (`refusedDesigns: []`), so every check passed.

## The holdout run

Run `41643649692`: run number 13, attempt 1, `workflow_dispatch` on main `2dcadaf7`, mode
`holdout`, `configuration_ref` `a41861d21be5c13d2e0a8344644ea50606e2463d`, `receipts_run_id`
`41643035479`, regression off. Dispatched by the coordinator. Job `evaluate` succeeded from
13:21:45Z to 13:33:52Z. The harness step took 11 minutes 3 seconds, most of it settle waits. Node
v24.22.1, runner image 20261026.180.1. Artifacts: `jev-svg-eval-report` and `jev-svg-eval-ledger`
(id 13233764337), both kept to 2027-02-01.

There was one evaluation and no re-run. The holdout is now consumed: the harness refuses any
later holdout run or freeze, and from now on these designs are regression evidence only.

### Per stratum

Corrections plus decisions / consequential errors, summed over each stratum's three designs:

| stratum | deterministic | jev-structured (primary) | elephant | haiku | gemini-vision |
| --- | --- | --- | --- | --- | --- |
| lower third | 3 / 3 | 3 / 3 | 2 / 2 | 1 / 1 | 3 / 3 |
| scoreboard | 9 / 4 | 7 / 4 | 13 / 4 | 7 / 2 | 9 / 4 |
| clock | 7 / 4 | 9 / 4 | 9 / 3 | 9 / 4 | 7 / 4 |
| quiz | 9 / 0 | **13 / 5** | 14 / 0 | 8 / 0 | 9 / 0 |
| credits | 9 / 3 | **14 / 6** | 10 / 3 | 8 / 2 | 9 / 3 |
| score-clock | 11 / 3 | 12 / 3 | 25 / 2 | 6 / 0 | 11 / 3 |
| total | 48 / 17 | 58 / 25 | 73 / 14 | 39 / 9 | 48 / 17 |

Only the primary decides. Elephant and Haiku are reporting-only and were chosen before any paid
call. Haiku's lower numbers make it neither a candidate nor a go: the pre-registered rule allows
no choice after the holdout is seen (spec, pre-registered decision rule).

### Per design

The same measure, for every held-out design and arm:

| design | deterministic | jev-structured | elephant | haiku | gemini-vision |
| --- | --- | --- | --- | --- | --- |
| `lower-third-1` | 2 / 2 | 2 / 2 | 2 / 2 | 1 / 1 | 2 / 2 |
| `lower-third-2` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| `lower-third-3` | 1 / 1 | 1 / 1 | 0 / 0 | 0 / 0 | 1 / 1 |
| `scoreboard-1` | 2 / 1 | 2 / 1 | 5 / 1 | 0 / 0 | 2 / 1 |
| `scoreboard-2` | 1 / 0 | 0 / 0 | 2 / 0 | 3 / 0 | 1 / 0 |
| `scoreboard-3` | 6 / 3 | 5 / 3 | 6 / 3 | 4 / 2 | 6 / 3 |
| `clock-1` | 3 / 2 | 4 / 2 | 4 / 2 | 4 / 2 | 3 / 2 |
| `clock-2` | 4 / 2 | 5 / 2 | 5 / 1 | 5 / 2 | 4 / 2 |
| `clock-3` | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 | 0 / 0 |
| `quiz-1` | 3 / 0 | 2 / 0 | 3 / 0 | 2 / 0 | 3 / 0 |
| `quiz-2` | 4 / 0 | 7 / 4 | 8 / 0 | 3 / 0 | 4 / 0 |
| `quiz-3` | 2 / 0 | 4 / 1 | 3 / 0 | 3 / 0 | 2 / 0 |
| `credits-1` | 3 / 1 | 6 / 2 | 3 / 1 | 2 / 0 | 3 / 1 |
| `credits-2` | 2 / 0 | 4 / 2 | 3 / 0 | 2 / 0 | 2 / 0 |
| `credits-3` | 4 / 2 | 4 / 2 | 4 / 2 | 4 / 2 | 4 / 2 |
| `score-clock-1` | 4 / 1 | 4 / 1 | 8 / 0 | 2 / 0 | 4 / 1 |
| `score-clock-2` | 3 / 1 | 2 / 1 | 8 / 1 | 1 / 0 | 3 / 1 |
| `score-clock-3` | 4 / 1 | 6 / 1 | 9 / 1 | 3 / 0 | 4 / 1 |

Where Jev differs from deterministic, the score components are:

- quiz: `quiz-2` bound four decoys as live fields; `quiz-3` invented a clock family and missed
  the quiz family; `quiz-1` found the quiz family that deterministic misses.
- credits: `credits-1` missed two expected fields and invented a quiz family; `credits-2`
  invented scoreboard and clock families.
- clock: on `clock-1` and `clock-2`, Jev dropped the clock family that deterministic finds.
- score-clock: on `score-clock-3`, Jev missed one expected field and both families.
- Gains: on `scoreboard-2`, `scoreboard-3` and `score-clock-2`, Jev found a family that
  deterministic misses.

### Useful setups, corrections, latency

| arm | complete setups (no correction, no consequential error) | requests | median / max latency per request | input / output tokens |
| --- | --- | --- | --- | --- |
| deterministic | 3 of 18 | 0 | (no call) | 0 |
| jev-structured | 4 of 18 | 18 | 192 ms / 412 ms | 25,343 / 3,060 |
| elephant | 3 of 18 | 18 | 251 ms / 507 ms | 24,698 / 157 |
| haiku | 8 of 18 | 18 | 4,401 ms / 5,752 ms | 36,677 / 10,755 |
| gemini-vision | 3 of 18 (deterministic's) | 18 | 412 ms / 1,016 ms (refusals) | not billed |

- Latency is the harness's per-request `ms`, measured from send to answer. The harness step's 11
  minutes are almost all the two-reading balance settle per batch.
- Each design's languages, from the deterministic rows: English 12, German 2, Ukrainian 2,
  French 1, Norwegian 1.
- Every request was a single attempt: no retry, no unknown bill, no fallback except the image
  arm's.
- Decisions count the label's unresolved intents. No arm decides intent, because the questions
  never ask it, so decisions are equal across arms on each design.

### Image comparison: refused, a stated gap

All 18 `gemini-vision` requests were refused, each recorded as `{"attempt": 1, "status": 400,
"type": "AI_APICallError", "code": null}` and classified "The AI provider rejected the request."
Nothing was billed. Each image row fell back to the deterministic proposal, so its scores are
deterministic's, not a vision result. This is the same refusal as row 33's runs `41621970771` and
`41630941605`, and it is owned by #2022, which is open. AC-7's relevant-vision comparison is
therefore a stated gap, not a measured comparison. Jev with pixels (#2006) and Jev without pixels
as separate arms were not run: Jev with pixels is unqualified, and the harness never sends it. So
the comparison that isolates what pixels contribute is also a stated gap.

## Non-blind regression slice (reported separately)

Run `41621970771`, row 33's full development comparison, measured the 51-file slice on this exact
frozen configuration (`a41861d2`, `b2609a84`). It ran on harness manifest `77879807…`. That
harness differs from the frozen `516dcef0…` only in two ways: the refusal recording of PR #2018
(request shape unchanged) and the lockfile change above. Neither touches the slice's reader or
scoring.

- 50 of 51 files read. `geometry-unescaped-ampersand` is refused by the importer, as in rows 32
  and 33.
- The scorer checks only whether the number of text fields turned on equals the sidecar's
  expected count. Deterministic matches on 50 of 50, `jev-structured` on 41 of 50.
- The slice is not independent holdout and does not enter the verdict.

The holdout workflow refuses the slice on the holdout budget. A new development run would have
measured only the same configuration again, and Jev's answers vary between identical runs (see
Known limits), so a second measurement adds noise, not evidence. No run was requested, and none
was spent.

## Billing

Ledger of run `41643649692`: 115 batches in all. This run added 36 (indexes 79 to 114, every one
in the `holdout` partition): 72 attempts of 144 planned, no suspension and no unknown charge.

| arm | batches | attempts | priced maximum | gateway-reported | settled | largest share of its priced maximum |
| --- | --- | --- | --- | --- | --- | --- |
| jev-structured | 6 | 18 | 0.006675984 | 0.001064406 | 0.002414406 | 44% |
| elephant | 6 | 18 | 0.005553240 | 0.000864430 | 0.002214430 | 50% |
| haiku | 6 | 18 | 0.092254000 | 0.009045200 | 0.010395200 | 13% |
| gemini-vision | 18 | 18 | 0.105264000 | 0 | 0 | 0% (all refused) |
| total | 36 | 72 | 0.209747224 | 0.010974036 | 0.015024036 | |

- Balance 6.905229415 to 6.890205379, and lifetime used 48.094770585 to 48.109794621. The
  balance drop, the usage rise and the summed receipts all equal $0.015024036, so no other
  consumer spent during the run and no new money arrived.
- Settled minus reported is $0.00405 = 54 served requests × $0.000075, the per-request gateway
  fee of #2015, again on every served arm.
- Spend by stratum, as reported cost by arm in USD, all well under a cent:

  | stratum | jev-structured | elephant | haiku |
  | --- | --- | --- | --- |
  | lower third | 0.000145 | 0.000116 | 0.001151 |
  | scoreboard | 0.000181 | 0.000147 | 0.001663 |
  | clock | 0.000121 | 0.000096 | 0.001063 |
  | quiz | 0.000204 | 0.000166 | 0.001472 |
  | credits | 0.000210 | 0.000172 | 0.001906 |
  | score-clock | 0.000204 | 0.000167 | 0.001790 |

  By language: English 0.007363, Ukrainian 0.001409, German 0.000990, Norwegian 0.000668,
  French 0.000544.

| partition | settled USD | cap |
| --- | --- | --- |
| development (rows 33 and 34; row 34 added none) | 0.030907239 | 2 |
| holdout (this run only) | 0.015024036 | 3 |
| cumulative | 0.045931275 | 5 |

The cumulative total is 284 of 500 attempts. The original baseline (run `41619730746`, balance
6.936136654) was never reset. No top-up happened, and no paid call was made outside
`jev-svg-eval.yml`. The ledger chain, newest first: `41643649692` (holdout), `41643035479`
(re-freeze), `41634756346` (row 33's freeze).

## What changes for the remaining rows

Under this no-go:

- **Row 35** keeps the model route disabled. It verifies deterministic behaviour with a stubbed
  model and mocks, with no new paid call. The existing vision flow stays as it is.
- **Row 36** walks all five families through deterministic proposals only. The no-go path must
  be complete, and model proposals are not shown.
- **Row 37** qualifies privacy and service-failure behaviour with the route off: model-disabled
  import and compiled playout keep working.
- **Rows 38 to 40** continue unchanged. Row 39 may reuse these held-out designs as regression
  evidence, never as a fresh blind benchmark. Row 40's release kit marks the model route
  unqualified and records the total spend above.

Under a limited go (not the outcome), row 35 would have admitted only the named families, and
rows 36 and 37 would have covered model proposals for those families alone.

## Decisions

- **Stop before the holdout on any manifest change.** A manifest change refuses the holdout
  before decoding, and the refusal would be safe, but it would add a run to the chain. More
  importantly, accepting a changed harness is the coordinator's call, not a builder's. The local
  reproduction of the old manifest at `4130a081` showed that the method matched before the
  difference was trusted.
- **Re-freeze rather than wait for main to settle.** That was the coordinator's decision, above.
  The only difference was the lockfile's Sandbox subtree, outside the evaluated code. The
  configuration bytes and the scorer did not change.
- **Regression slice from run `41621970771`, not a new run.** The reasons are above: the same
  frozen configuration, no reader or scorer difference, and no new information from another
  noisy measurement.
- **The verdict applies the rule literally.** Scoreboard's passing family test is reported, not
  promoted to a limited go.

## Known limits

- **Jev is not repeatable at the 0.5 threshold.** In row 33, byte-identical inputs gave different
  decisions on 6 of 18 development designs. A single holdout run carries that noise. The rule
  was applied to that one run, as pre-registered, and this note claims no statistical
  significance for the quiz and credits increases.
- **One prompt sentence was fitted to development design `lower-third-1`** (row 33), a documented
  limit. On the holdout, Jev's lower-third results equal deterministic's.
- **The vision comparison is missing**: every image request was refused (#2022), and the
  with/without-pixels Jev comparison was not run (#2006).
- **The per-request gateway fee** (#2015) is not in the reported cost. The receipts settle it
  from the balance.
- **The corpus is synthetic and single-author.** It supports a pilot verdict only, not exporter
  provenance or a population accuracy claim.

## Phase notes

- Worktree from `origin/main` `2dcadaf7eaa9d8b638b86f914b7e31aae5079321` (PR #2025). Previous
  verified main: that SHA. Every evaluation run of this row ran on it.
- Revert this row after it lands with `git revert -m 1 <merge sha>`. A revert removes these notes
  only. It does not undo the holdout run, its spend, the re-freeze or the ledger, which live in the
  protected workflow's artifacts, and the holdout stays consumed.

## Traps

- **Main moves under a freeze.** Any merge that touches a frozen file, including the lockfile from
  unrelated dependency work, refuses the holdout until a reconcile with `accept_manifest` and a
  new freeze. Compute `freezeManifest` locally at both commits before asking for a dispatch.
  Run it with `node_modules` linked into a scratch worktree, and remove that link afterwards (a
  `node_modules/` ignore pattern does not match a symlink).
- **A green holdout job is not a verdict.** Read `verdictApplies`, `stopped` and `refusedDesigns`
  in `report.json`. A refused design or a metering stop is no go by the rule, whatever the job's
  colour.
- **The report's `spend` block is cumulative across the ledger.** Take this run's spend from its
  own batches (`runId`) or from the balance drop.
