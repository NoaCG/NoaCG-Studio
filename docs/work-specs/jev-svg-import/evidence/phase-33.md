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

Worktree from `531f856e13379ccffe8edc2df381cf6c2503f393`. Previous verified main: that SHA.
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
| total so far | | 0.028468263 | 176 of 500 |

Balance 6.936136654 at the baseline, 6.907668391 after run 6; the drop equals the summed
receipts, so no other consumer spent on the shared balance during the row.

## Open points and where they go

- **#2017** (coordinator, fix builder): the image arm was refused on every request; the harness
  needs to record a refused attempt's HTTP status and gateway error code, and fix the cause if
  it is the request shape. This row then accepts the reviewed harness change by reconcile, runs
  the image arm once, and freezes; if the provider refuses this model for this key, the image arm
  is a recorded gap.
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
