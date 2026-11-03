# Phase 33: Run bounded development evaluation

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-7: "Fair deterministic/Jev/eligible-challenger and relevant-vision comparison, frozen
  scoring/configuration, untouched holdout results, cumulative paid spend and an explicit
  limited-go (named families) or no-go verdict; no consequential-error increase in any family,
  with one pre-registered primary candidate and the non-blind regression slice reported
  separately."
- Row 33: "Use only development designs through the trusted main Actions harness; dispatch a
  branch containing configuration JSON read as data. No harness/adapter source tuning in this
  row. Compare declared configurations within the cumulative $2 development/$5 total cap and log
  each batch in row evidence. Freeze the pre-registered structured Jev primary and at most two
  reporting-only candidates plus established baselines, with immutable prompt/route/scorer/adapter
  hashes. A necessary code fix lands through its owning row on main before more evaluation; do not
  execute it from the tuning branch."

This row makes the first paid calls, on development designs only, and freezes the configuration
row 34 uses. It changes `evaluation/prompts.json` and these notes only. The holdout was never read
or decoded. The development result is indicative; the verdict belongs to row 34.

## Pinned main

Worktree from `531f856e13379ccffe8edc2df381cf6c2503f393`; `origin/main` at
`4130a081f35f70e4d05dff3b314863127aec465b` (PR #2018, the harness fix for #2017) was merged in
before the freeze, and the freeze ran on it. Previous verified main: `4130a081`.
Revert this row after it lands with `git revert -m 1 <merge sha>`; the Actions ledger and the
freeze it records are not undone by a revert (they live in the protected workflow's artifacts).

## Configuration

Trimmed from row 32's seven arms to five:

| id | kind | model | role |
| --- | --- | --- | --- |
| `deterministic` | deterministic | (the wizard's own draft) | established baseline |
| `jev-structured` | decision | `typesafe-ai/jev-1.14.0` | pre-registered primary |
| `elephant` | decision | `baseten/elephant-1` | reporting only |
| `haiku` | chat | `anthropic/claude-haiku-5.5` | reporting only |
| `gemini-vision` | vision | `google/gemini-2.5-flash-lite` | established baseline (image task) |

- **Dropped `jev-preview`.** Jev with pixels is unqualified (#2006); the harness never sends it,
  so it could only report "not sent".
- **Elephant-1 kept** as the one other decision model: the same `/v1/evaluate` contract, so it
  is the closest like-for-like comparison with the primary.
- **Haiku 5.5 kept, GPT-6 Luna dropped.** One language-model comparator is enough to show
  whether a general model beats the decision models; Luna is a reasoning model whose billed
  tokens a byte-per-token bound may not cover (row 32 Known limits), and an over-bound receipt
  suspends the run. Both list the same price.
- Prompts, questions and threshold unchanged from row 32 at this point.

## Prices, rechecked

Free listing `GET /v1/models`, 2026-11-03, before the first paid batch. Per million tokens:
Jev 1.14 $0.042 input, $0 output, context 32,000; Elephant-1 $0.035, $0, 16,384; Haiku 5.5
$0.10, $0.50; Gemini 2.5 Flash Lite $0.10, $0.40. All equal `ROUTES` in the harness. Haiku and
Luna list a 10% higher regional (`us`) price; the harness pins no region, and the byte-per-token
bound leaves far more slack than 10%.

## Batch log

Every run is a `workflow_dispatch` of `jev-svg-eval.yml` on main, dispatched by the coordinator
(evaluation-environment.md: routine dispatch is the coordinator's), never by this builder.

1. **Dry run**, run `41619506329` (run number 1, attempt 1), main `531f856e`, configuration
   `3017a8a3` (`prompts.json` SHA-256 `0afa4a96f1190290d378eed856573642edec533aa0063f78bd70e19b087d6228`),
   regression on. Mock gateway, no key (`AI_GATEWAY_API_KEY` empty in the log). 90 scored rows
   (18 designs by 5 arms) and 100 regression rows; not stopped; verdict `no-go (indicative only)`
   from random mock answers, as expected. The same command locally: 37 batches, priced maximum
   $0.22 for the whole run, 244 planned attempts, mock settled spend $0.016. Ledger artifact
   `jev-svg-eval-dry-run-ledger` (kept apart from the chain).
2. **Baseline**, run `41619730746` (run number 2), `development` with `establish_baseline`, calls
   no model. The original baseline, from its ledger artifact `jev-svg-eval-ledger` (expires
   2027-02-01): balance $6.936136654, lifetime used $48.063863346 (sum $55.00, the same as
   readiness on 29 October and 3 November, so no top-up), read 2026-11-03T10:30:14Z; main
   `531f856e13379ccffe8edc2df381cf6c2503f393`; workflow ref
   `NoaCG/NoaCG-Studio/.github/workflows/jev-svg-eval.yml@refs/heads/main`; environment
   `jev-svg-evaluation`; harness manifest SHA-256
   `77879807cc2b2922b8c4780c690ba6d4c89ba772210442a6c457190e260f842b` (229 files); Node v24.22.1,
   runner image 20261026.180.1. No batches. The run numbers 1 and 2 confirm GitHub numbers this
   workflow's runs in order (a row 32 Known limit).
3. **First paid batch**, run `41620061986`, configuration `7671ef75` (deterministic and
   `jev-structured` only, prompts as row 32), continuing ledger `41619730746`. Six batches of
   three designs, 18 attempts (one per request, no retry), no suspension, about 2 minutes in all.

   | batch | balance before | balance after | priced max | gateway-reported | settled |
   | --- | --- | --- | --- | --- | --- |
   | 0 | 6.936136654 | 6.935791744 | 0.000707952 | 0.000119910 | 0.000344910 |
   | 1 | 6.935791744 | 6.935363044 | 0.001222788 | 0.000203700 | 0.000428700 |
   | 2 | 6.935363044 | 6.935022418 | 0.000695604 | 0.000115626 | 0.000340626 |
   | 3 | 6.935022418 | 6.934607788 | 0.001139544 | 0.000189630 | 0.000414630 |
   | 4 | 6.934607788 | 6.934199878 | 0.001096536 | 0.000182910 | 0.000407910 |
   | 5 | 6.934199878 | 6.933786886 | 0.001114764 | 0.000187992 | 0.000412992 |

   Settled $0.002349768 (balance drop and lifetime-usage rise agree). Every settled cost is within
   its priced maximum (the closest is 49% of it).
4. **Tuning run 1**, run `41620813617`, configuration `6f97fcfd` (primary only; the four behaviour
   questions reworded to name the structure of each family and what is not it). Six batches,
   18 attempts, no suspension. Balance 6.933786886 to 6.931347910; settled $0.002438976 (priced
   maximum $0.006769). Every batch again debited exactly $0.000225 above the reported cost.
5. **Tuning run 2**, run `41621404623`, configuration `d55cce03` (tune 1 plus one sentence in every
   question: judge by layout, names can be generic or misleading). Six batches, 18 attempts, no
   suspension. Balance 6.931347910 to 6.928781674; settled $0.002566236 (priced maximum
   $0.007961). Fee again $0.000225 per batch.
6. **Full development comparison**, run `41621970771`, configuration `a41861d2` (prompts.json
   SHA-256 `b2609a84eabe9f45658764ac8e30ff52c24ba26bab16f98d7744230c7464a4a7`, the committed
   file), all five arms plus the 51-file slice. 37 batches (ledger indexes 18 to 54), 122
   attempts against 244 planned (no retries), no suspension, harness step 12 minutes 15 seconds.
   Balance 6.928781674 to 6.907668391; settled $0.021113283 against a priced maximum of $0.2271.

   | arm | batches | attempts | reported | settled | largest share of its priced maximum |
   | --- | --- | --- | --- | --- | --- |
   | jev-structured | 6 | 18 | 0.001089 | 0.002439 | 43% |
   | elephant | 6 | 18 | 0.000882 | 0.002232 | 48% |
   | haiku | 6 | 18 | 0.008330 | 0.009680 | 12% |
   | gemini-vision | 18 | 18 | 0 | 0 | 0% (all refused, below) |
   | jev-structured, 51-file slice | 1 | 50 | 0.003013 | 0.006763 | 40% |

   Jev's costs and token counts repeat tune 1's run (run 4) exactly, batch for batch, so it was
   sent the same input; its answers did not repeat (below). The fixed $0.000075 per request
   shows on every arm that was served (Elephant and Haiku too, and 50 times on the slice), so it is a gateway fee per request,
   not a `/v1/evaluate` one (#2015).

   **Every Gemini vision request was refused** (`provider_rejected`, one attempt each, nothing
   billed), so every image row fell back to the deterministic proposal and scores the same as
   it. The harness records no HTTP status or error body for a refusal, so the cause cannot be
   read from the run. A fix is harness or route code, not configuration, so this row does not
   make it: reported to the coordinator, who filed #2017 and gave the fix to its own builder on
   main before any further evaluation.

   Regression slice: 50 of 51 read (`geometry-unescaped-ampersand` refused by the importer, as
   in row 32); deterministic matches the sidecar's text-field count on 50 of 50, Jev on 41 of 50.

7. **Reconcile accepting the reviewed harness change**, run `41630691746`, main
   `4130a081f35f70e4d05dff3b314863127aec465b` (PR #2018 for #2017: a refused attempt now records
   its HTTP status, error type and gateway code; request shape unchanged). Accepted manifest
   `341b82e787694a80b3658d61911aa211906b28dc284577905e44e59219b739db` after 55 batches. Balance
   6.907668391, lifetime used 48.092331609, the same as run 6's last receipt; no new money.
8. **Vision run**, run `41630941605`, configuration `f8aa571c` (deterministic, the primary, which
   the schema requires, and `gemini-vision`; prompts as committed). 24 batches, 36 attempts, no
   suspension. Balance 6.907668391 to 6.905229415; settled $0.002438976, all Jev's (priced
   maximum $0.1120). **All 18 image requests refused again**, each with the same record:
   `{"attempt": 1, "status": 400, "type": "AI_APICallError", "code": null}`. A 400 with no
   gateway code is not a refused model or key (404 or 401/403) and not one of the gateway's
   classified provider-policy refusals, so it points at the request as the provider receives it.
   Jev in this run: 65 / 21, lower third and quiz worse. The coordinator decided to record the
   image arm as refused, a stated gap, and to freeze the five-arm configuration unchanged so row
   34 reports the arm as refused instead of dropping it; the 400 itself is #2022.
9. **Pre-freeze dry run**, run `41634521453`, main `4130a081` (the freeze's commit),
   configuration `a41861d2`, regression on. Mock only, passed.
10. **Freeze**, run `41634756346`, `reconcile` with `freeze` on main `4130a081`, after 79 batches.
    Balance 6.905229415, lifetime used 48.094770585 (no change since run 8; arrived $0). The
    ledger records the reason and `frozen`: configuration SHA-256
    `b2609a84eabe9f45658764ac8e30ff52c24ba26bab16f98d7744230c7464a4a7` at configuration commit
    `a41861d21be5c13d2e0a8344644ea50606e2463d`, harness manifest
    `341b82e787694a80b3658d61911aa211906b28dc284577905e44e59219b739db`. Ledger artifact
    `jev-svg-eval-ledger` of that run, kept to 2027-02-01: row 34 continues from run
    `41634756346`.

Indicative development result for the primary against deterministic (18 designs; corrections
plus decisions / consequential errors, summed; strata with a consequential increase):

| configuration | deterministic | jev-structured | strata worse |
| --- | --- | --- | --- |
| row 32 prompts (run 3) | 53 / 19 | 65 / 25 | lower third, scoreboard, quiz, credits |
| tune 1 (run 4) | 53 / 19 | 65 / 20 | quiz |
| tune 2 (run 5) | 53 / 19 | 61 / 20 | scoreboard, quiz |

Full comparison (run 6, tune 1), all arms, same measure:

| arm | corrections + decisions | consequential | strata with a consequential increase |
| --- | --- | --- | --- |
| deterministic | 53 | 19 | (baseline) |
| jev-structured (primary) | 67 | 20 | lower third, quiz |
| elephant | 60 | 15 | none |
| haiku | 45 | 9 | none |
| gemini-vision | 53 | 19 | none (every request refused, so these are deterministic's) |

Indicative only, on 18 development designs used for tuning; the verdict belongs to row 34.

**Jev is not repeatable at this threshold.** Runs 4 and 6 sent Jev byte-identical input (equal
token counts on every design), yet its decisions differ on 6 of the 18 designs (lower-third-2,
scoreboard-2, scoreboard-3, credits-3, score-clock-1, score-clock-3): a few probabilities sit
near 0.5. Run 4 totalled 65 / 20 with quiz worse; run 6 totals 67 / 20 with lower third and quiz
worse. So the differences between the three prompt versions are within one run's noise, and
the choice of tune 1 rests on the pre-written rule, not on a measured improvement. Row 34's
single holdout run carries the same noise; its report should say so.

By the rule above, **tune 1 is chosen** (one stratum worse against two). Its questions go into
the committed `prompts.json` with all five arms (behaviour questions changed, field question,
criteria, chat system and threshold as row 32).

## Frozen for row 34

- Configuration: `docs/work-specs/jev-svg-import/evaluation/prompts.json` as this PR lands it
  (git blob `34ad88f0`, the same bytes as configuration commit `a41861d2`), SHA-256
  `b2609a84eabe9f45658764ac8e30ff52c24ba26bab16f98d7744230c7464a4a7`. Primary `jev-structured`
  (`typesafe-ai/jev-1.14.0`, decision, no pixels); reporting challengers `elephant` and `haiku`;
  baselines `deterministic` and `gemini-vision`, with the models in the Configuration table above.
  Threshold 0.5. Prompts are the tune 1 behaviour questions and row 32's field question,
  criteria and chat system.
- Scoring `jev-svg-score/1` (row 32, unchanged).
- Harness manifest `341b82e787694a80b3658d61911aa211906b28dc284577905e44e59219b739db` (229 files,
  main `4130a081`). Among them: `scripts/jev-svg-eval.mjs` `f732660e…8928f`, the decision adapter
  `api/_lib/aiDecisionGateway.ts` `ca71a3a2…16a1`, the chat adapter `api/_lib/aiGateway.ts`
  `35abef85…f82`, the routes and prices `api/_lib/aiModelCatalog.ts` `f96962bd…6fb`,
  `src/ai/svgInterpretation/questions.ts` `89d09be3…aa9d`, `evidence.ts` `631d46ec…2a92`, the
  workflow `bc3e2e6f…ec6f`, the development labels `49813b69…815f`. The full list is in each run's
  report and in the ledger.
- Any change on main to a file in the manifest before row 34 refuses the holdout until a reviewed
  `accept_manifest` reconcile and a new freeze (row 32's protection, intended).

## Decisions

- **Choice between tune 1 and tune 2, written before tune 2's result was read** (run
  `41621404623`, dispatched 2026-11-03T10:42Z). Development designs only, primary against
  deterministic: (1) fewer strata with a consequential-error increase; then (2) fewer
  consequential errors in all; then (3) fewer corrections plus decisions; then (4) tune 1, the
  shorter wording. No third tuning round: two rounds on 18 designs is already as far as this
  corpus supports tuning without fitting it. The winner goes into one full development
  comparison (all five arms and the 51-file slice) and is then frozen unchanged.

- **Elephant-1 and Haiku 5.5 as the two reporting challengers** (above), chosen before any paid
  call. Both show no stratum worse in development; that does not make either a candidate. The
  pre-registered rule lets only structured Jev decide, and a challenger is never chosen after
  results are seen.
- **The first paid batch was the primary alone** (six batches, $0.006 worst case), to see the
  real reply shape, settle time and receipts before spending on the other arms.
- **Spend order kept the holdout's room.** After row 33 the attempt count must leave the
  holdout's 144 planned attempts and its $3 partition untouched; see Spend below.
- **Answers to row 31's open point** (the `/v1/evaluate` reply shape): every Jev and Elephant
  answer passed the adapter's strict check, so the reply names the exact pinned model (no
  `route_changed`), answers each question once with its type, and reports usage per request
  (input and output tokens, output priced $0). The gateway's reported cost is input tokens times
  the listed price, billed per request, not per question, plus the fixed fee of #2015. Settling a
  batch took two readings (about 15 seconds); a full development run takes about 12 minutes.

## Spend

The development partition only. Holdout spend is $0, and the holdout was never read.

| run | mode | settled USD | attempts |
| --- | --- | --- | --- |
| 41619506329 | dry-run (mock) | 0 | 0 real |
| 41619730746 | baseline | 0 | 0 |
| 41620061986 | development | 0.002349768 | 18 |
| 41620813617 | development | 0.002438976 | 18 |
| 41621404623 | development | 0.002566236 | 18 |
| 41621970771 | development | 0.021113283 | 122 |
| 41630691746 | reconcile (accept manifest) | 0 | 0 |
| 41630941605 | development | 0.002438976 | 36 |
| 41634521453 | dry-run (mock) | 0 | 0 real |
| 41634756346 | reconcile (freeze) | 0 | 0 |
| total | | 0.030907239 | 212 of 500 |

Balance 6.936136654 at the baseline, 6.905229415 at the freeze; the drop ($0.030907239) equals the
summed receipts, so no other consumer spent on the shared balance during the row. Left for row
34: $1.969 of the development partition, the whole $3 holdout partition, 288 attempts (the holdout
plans at most 144).

## Open points and where they go

- **Stated gap in AC-7's relevant-vision comparison.** The image arm (`gemini-vision`, the
  existing import-analysis route) was refused on all 18 requests in runs `41621970771` and
  `41630941605`: HTTP 400, `AI_APICallError`, no gateway code, cause not established. #2017
  (closed by PR #2018) made the harness record that; #2022 (P1) owns the 400 and whether
  production image analysis is affected. The arm stays in the frozen configuration, so row 34
  reports it as refused. If #2022 is fixed before row 34, using the image arm needs a reviewed
  harness change, `accept_manifest` and a new freeze, which the coordinator decides.
- **#2015** (rows 31 and 35): a fixed gateway fee per request that the reported cost leaves out.
- **Row 34**: Jev's answers vary between runs on identical input, so its single holdout run
  carries that noise; report it beside the verdict.

## Traps

- An Actions artifact download link is signed and short-lived: fetch it, use it at once, and
  never print or store it. A link fetched for one artifact can fail authentication for the next
  minute's download; fetch a fresh one.
- The push hook reads `<sha>:refs/heads/<branch>` as a possible write to `main`. Point a local
  branch at the commit and push `refs/heads/<branch>:refs/heads/<branch>`.
- `prompts.json` on the configuration branch and on this PR's branch must be byte-identical for
  the frozen hash to describe what lands: compare the blob ids (`git rev-parse <ref>:<path>`).
