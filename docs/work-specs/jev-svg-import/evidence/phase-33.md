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

## Decisions

## Traps
