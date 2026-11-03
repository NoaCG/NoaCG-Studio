# Phase 32: Build the comparison and metering harness

Run `plan-jev-svg-import-2026-10-31` (issue #1850). Acceptance subset, verbatim:

- AC-6: "Correct decision adapter and explicit consent boundary; server-only credentials;
  request/token/attempt/cost bounds; validated provider policy; deterministic fallback."
- AC-7: "Fair deterministic/Jev/eligible-challenger and relevant-vision comparison, frozen
  scoring/configuration, untouched holdout results, cumulative paid spend and an explicit
  limited-go (named families) or no-go verdict; no consequential-error increase in any family,
  with one pre-registered primary candidate and the non-blind regression slice reported
  separately."
- Row 32: "Dry-run deterministic/Jev/eligible-challenger and qualified-image comparison. Workflow
  and harness execute from main; fetch only schema-validated prompts.json from an immutable input
  branch SHA as data, never branch code with secrets. Freeze scoring and primary structured Jev
  candidate. Prove serialized concurrency, original balance baseline/each-batch debit, bounded
  maximum batch cost, settled costs, cumulative/partition/attempt limits, top-up detection and
  missing-receipt refusal using mocks. No new durable-reservation subsystem. Record the main
  workflow SHA and protected environment before paid admission."

This row builds the harness and proves it with mocks. It makes no paid call, no authenticated
gateway call (the free, unauthenticated model listing only), no migration, and never reads the
holdout secret. AC-7's verdict itself belongs to rows 33 and 34.

## Pinned main

Worktree from `0a99d37cfd5ac533e7580a495b81d81f699d0e0e` (PR #2002, row 31). Previous verified
main: that SHA. Revert this row after it lands with `git revert -m 1 <merge sha>`.

## What was built

- `.github/workflows/jev-svg-eval.yml`: manual (`workflow_dispatch`) only, runs only from `main`
  (job `if` plus a step that checks `github.workflow_ref`), environment `jev-svg-evaluation`,
  concurrency group `jev-svg-evaluation` with `cancel-in-progress: false`. Modes: `dry-run`
  (mocks, no secret), `development` and `holdout` (paid), `reconcile` (reads the balance, sends
  nothing). The key goes to the harness step only in the paid modes; the holdout secret only to
  the decode step, only in `holdout` mode. Ledger and report are kept as 90-day artifacts.
- `scripts/jev-svg-eval.mjs`: configuration validation and fetch, freeze manifest, the receipt
  ledger, pricing, the arms, scoring and the decision rule, the holdout opener, the browser reader
  and the dry-run mock gateway.
- `src/ai/svgInterpretation/evidence.ts`: the bounded evidence (reader-made ids, names, hierarchy,
  boxes, text shape; text only with the explicit choice), plus the browser reader of a mounted SVG.
- `src/ai/svgInterpretation/questions.ts`: the server's own questions from the frozen templates
  and reader-made ids, and the mapping of answers to a proposal.
- `docs/work-specs/jev-svg-import/evaluation/prompts.json`: the configuration rows 33 tunes.

## Rules (M1 to M12, each pinned by a test in `scripts/jev-svg-eval.test.mjs`)

1. **M1** The configuration is data under a closed schema: fixed keys, at most 16 KiB, instructions
   that are plain lines with no URL, markup, template or code syntax (`{layer}` is the one
   placeholder), models only from the admitted, priced route list with a matching kind, and the
   primary fixed to structured Jev 1.14 (`typesafe-ai/jev-1.14.0`, decision, no pixels).
2. **M2** A dispatch's ref is resolved once to a commit; only `prompts.json` at that commit is read,
   with `git fetch` and `git cat-file`. The branch is never checked out, imported or run.
3. **M3** Frozen: the scoring version, the primary, and a manifest of SHA-256 hashes of every
   source that decides a result (harness, evidence, questions, decision and chat adapters, the
   image task contract, the workflow). The decision prices in the harness must equal the server's
   audited prices or nothing runs.
4. **M4** The first paid run records the original balance baseline (balance, lifetime usage, run
   id, main SHA, environment, manifest). It is never reset: a ledger exists, so
   `--establish-baseline` is refused; a dry-run or local ledger never continues into a paid run.
   Each batch receipt records the balance before and after, its debit and settled cost.
5. **M5** Spent is the largest of the balance drop, the lifetime-usage rise and the settled
   receipts, so other consumers' spend counts. A batch is admitted only if its priced maximum fits
   both the remaining $5 and its partition ($2 development, $3 holdout).
6. **M6** At most two attempts per logical request (the harness caps the adapter's `maxAttempts`
   at 2 whatever the plan says) and 500 in all. An unpriced request is refused. An image request
   is a batch of one, since its image price is a bound, not a bill.
7. **M7** New money stops paid calls: a balance above the last receipt, lifetime usage below it,
   or balance plus usage above the baseline's sum (a top-up hidden by concurrent spend).
8. **M8** A batch's receipt is written before its first call. A batch without a closing reading
   (a crash, a lost run), an unsettled reading, a cost past the priced maximum, more attempts than
   planned, or a charge whose bill is unknown suspends every later batch until `reconcile` runs
   with a written reason. Reconciliation closes a missing receipt at its priced maximum, records
   new money as acknowledged (never moving the baseline), and may accept a new harness manifest
   when a reviewed fix landed on main through its owning row.
9. **M9** A closing reading counts only when two readings agree and already show the spend the
   provider reported.
10. **M10** Evidence passes the server's `svgEvidenceRefusal`; text only with `includeText === true`.
    Questions name only reader-made ids (`t3`), never anything the artwork says, and stay within the
    adapter's 32-question bound; text layers past it keep the deterministic decision.
11. **M11** Provider calls are strictly serial (a wrapper refuses a second call in flight). Every
    body pins zero data retention, no prompt training and the route's own providers, with no
    fallback model list. A refused or failed request falls back to the deterministic proposal.
12. **M12** Scoring and the decision rule, below.

## Scoring (frozen, `jev-svg-score/1`)

Labels' anchors are reconciled to the reader's layer ids through element paths on the sanitized
markup (the method of `scripts/jev-svg-baseline.test.mjs`). Per design and arm:

- corrections: expected fields left off, decoys left on, behaviour families missed or invented,
  plus anchors the reader offers no layer for (the same for every arm);
- decisions: the label's unresolved intents (no arm decides intent: questions never ask it);
- consequential errors: a decoy bound as a live field, an invented behaviour family, a field on a
  layer the inventory does not have.

Behaviour families are scoreboard, clock, quiz and credits; a lower third is no behaviour.
Decision rule (primary against deterministic only): no go on any invalid reference, an unusable
primary, or a consequential-error increase in any stratum or design; otherwise a family
qualifies when at least two of its designs need fewer corrections plus decisions and none harms.
Only `limited-go` with named families or `no-go`. The verdict applies to the holdout run only; the
development report marks it indicative.

The image task proposes rectangles: each text region is mapped to the text layer it overlaps most
(IoU of normalized boxes at least 0.1). Its categories cannot say clock, quiz or credits, which
the report states (`notExpressible`) instead of counting it as a like-for-like answer. The 51-file
slice is scored only by its sidecars' text-field counts and reported apart.

## Recorded before paid admission

- Protected environment: `jev-svg-evaluation` (repository `NoaCG/NoaCG-Studio`, main only, per
  `preparation/evaluation-environment.md` and readiness run 41182891906).
- Workflow: `.github/workflows/jev-svg-eval.yml` on `main`. The main workflow SHA is this PR's
  merge commit; the first paid run writes it (`GITHUB_SHA`) and the workflow ref into the ledger
  baseline, and every later run refuses a harness whose manifest differs.
- Freeze manifest at the reviewed head (`node scripts/jev-svg-eval.mjs freeze`): see the PR body
  for the final values; row 33 reads them from the baseline it writes.
- Configuration: `prompts.json` SHA-256 `77abac7b0bcd987142fecc97d3cdc8e5fadf68d38d6a1fff99039814c9446f71`.
- Prices: the free listing (`GET /v1/models`) on 2026-11-03: Jev 1.14 $0.042/M input, Elephant-1
  $0.035/M, Haiku 5.5 $0.10/$0.50, GPT-6 Luna $0.10/$0.50, Gemini 2.5 Flash Lite $0.10/$0.40. Row 33
  rechecks before its first batch.

## Decisions

- **One harness file, plain receipts.** The ledger is a JSON file passed from run to run as an
  artifact; no service, database or scheduler. A run takes the previous run's ledger by run id,
  and the workflow checks that run is this workflow on main.
- **The dry run meters too**, against a mock balance, so the same admission and receipt code runs
  in the dry run as in a paid run.
- **Jev with pixels is unqualified.** The listing tags Jev 1.14 `vision`, but how `/v1/evaluate`
  takes an image is not documented in what row 31 read. The arm is declared and reported as
  `preview-unqualified`, never sent (`DECISION_PREVIEW_QUALIFIED = false`).
- **Language comparators are current models**: Haiku 5.5 and GPT-6 Luna (ordinary, not batch, fast
  or decisions). The existing vision baseline is the import-analysis route, Gemini 2.5 Flash Lite.
- **Worst-case pricing**: each attempt is priced from its serialized bytes (a token is at least one
  byte) plus framing, the full output budget, and 8,000 tokens per image; a request at two
  attempts. Ceilings of the 18-design development run are a few cents.
- **The deterministic arm** is the wizard's own draft through the 51-file harness page
  (`recordInPage`): its fields turned on, and the family its behaviour proposal names.

## Verification

- `node --test scripts/jev-svg-eval.test.mjs`: 22 of 22 pass (mocked fetch and git only; the
  server modules compiled from this checkout).
- Mutations, each failing at least one test: removing the hidden top-up check, the two-attempt cap,
  the partition cap, the missing-receipt check, the over-bound suspension, the two-reading settle
  rule, or making a batch's calls parallel. A no-op change failed none.
- Dry run, locally, through the real reader in Chromium: 18 development designs by 7 arms (126
  scored rows) plus the 51-file slice (50 read; `geometry-unescaped-ampersand` is refused by the
  importer as before): 43 batches, every receipt settled within its priced maximum, 140 mock
  attempts, mock spend $0.02. Verdict reported `no-go (indicative only)`, as expected from random
  mock answers.
- A paid mode given the dry run's ledger refuses before any network call.
- `npm run gates -- run --changed origin/main`, eslint and `tsc --noEmit` clean.

## Traps

- `actions/upload-artifact` paths in `RUNNER_TEMP` cannot be tested with `hashFiles` (it only sees
  the workspace); the upload steps use `if-no-files-found: ignore` instead.
- The `windows-hide` gate requires `windowsHide: true` on every `execFileSync`, test files included.
- Commit messages in this repository carry no co-author trailer (a hook refuses them).
