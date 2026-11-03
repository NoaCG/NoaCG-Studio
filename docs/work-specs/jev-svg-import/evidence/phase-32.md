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

## Rules (M1 to M12 and C1 to C6, each pinned by a test in `scripts/jev-svg-eval.test.mjs`)

1. **M1** The configuration is data under a closed schema: fixed keys, at most 16 KiB, instructions
   that are plain lines with no URL, markup, template or code syntax (`{layer}` is the one
   placeholder), models only from the admitted, priced route list with a matching kind, the
   primary fixed to structured Jev 1.14 (`typesafe-ai/jev-1.14.0`, decision, no pixels), and the
   id `deterministic` reserved for the deterministic arm.
2. **M2** A dispatch's ref is resolved once to a commit; only `prompts.json` at that commit is read,
   with `git fetch` and `git cat-file`. The branch is never checked out, imported or run.
3. **M3** Frozen: the scoring version, the primary, and a manifest of SHA-256 hashes of every
   source the run executes: the harness scripts, the compiled server graph as the api build emits
   it, the browser reader's bundled graph, the composite actions, the lockfile and the labels
   (about 230 files). The Node version and runner image are recorded, not frozen. The decision
   prices in the harness must equal the server's audited prices or nothing runs.
4. **M4** The baseline dispatch records the original balance (balance, lifetime usage, run id, main
   SHA, workflow ref, environment, manifest, runtime) and calls no model. Each batch receipt
   records the balance before and after, its debit and settled cost. A dry run's ledger is
   uploaded under another name and refused by a paid run and by reconcile.
5. **M5** Spent is the largest of the balance drop, the lifetime-usage rise and the settled
   receipts, so other consumers' spend counts. A batch is admitted only if its priced maximum fits
   both the remaining $5 and its partition ($2 development, $3 holdout).
6. **M6** At most two attempts per logical request (the harness caps the adapter's `maxAttempts`
   at 2 whatever the plan says) and 500 in all. An unpriced request is refused. A request is
   priced from the bytes it actually sends (system, messages, output schema; the picture as image
   tokens). An image request is a batch of one, since its image price is a bound, not a bill.
7. **M7** New money stops paid calls: a balance above the newest reading on record (the last
   receipt, or a reconciliation made after it), lifetime usage below it, or balance plus usage
   above the baseline's sum (a top-up hidden by concurrent spend).
8. **M8** A batch's receipt is written before its first call. A batch without a closing reading,
   an unsettled reading, a cost past the priced maximum, or more attempts than planned suspends
   every later batch until `reconcile` runs with a written reason. Reconciliation closes a missing
   receipt at its priced maximum, records new money as acknowledged (never moving the baseline),
   and may accept a new harness manifest when a reviewed fix landed on main through its owning row.
9. **M9** A closing reading counts only when two readings agree and already show the spend the
   provider reported for answered calls.
10. **M10** Evidence passes the server's `svgEvidenceRefusal`; text only with `includeText === true`.
    Questions name only reader-made ids (`t3`), never anything the artwork says, and stay within the
    adapter's 32-question bound; any layer not asked about keeps the deterministic decision.
11. **M11** Provider calls are strictly serial (a wrapper refuses a second call in flight). Every
    body pins zero data retention, no prompt training and the route's own providers, with no
    fallback model list. A refused or failed request falls back to the deterministic proposal.
12. **M12** Scoring and the decision rule, below.

The chain across runs (`checkChain`, fed by the workflow from the Actions API; each run is titled
with its mode). This is the corrected model from the repeated-family reassessment (below):

- **C1** The chain's unit is a run attempt: every non-dry mode refuses `GITHUB_RUN_ATTEMPT` other
  than 1, in the chain step and in the harness. The run list counts every attempt
  (`jobs?filter=all`), so a refused re-run cannot hide its first attempt. Run numbers before this
  one must have no gap: a deleted run cannot hide a lost run or an opened holdout.
- **C2** A run is lost when it is development, holdout or reconcile, an attempt started its harness
  or reconcile step, and it left no ledger. Any lost run after the newest ledger refuses every
  later paid run and every freeze until one reconcile names exactly all of them. Every other paid
  or reconcile run must name the newest ledger's run.
- **C3** A lost run is charged, since the newest reading, the larger of the balance drop and the
  lifetime-usage rise, to the partition of its recorded mode, never a typed one (a reconcile
  spends nothing and is charged nothing). Its attempts are the one typed number, read by a person
  from the gateway's records.
- **C4** The baseline is its own development dispatch (`establish_baseline`), which calls no model,
  allowed only while no ledger exists. A lost baseline dispatch spent nothing and is simply
  dispatched again.
- **C5** The holdout's gate runs before the secret is decoded: a freeze recorded in the ledger by
  `reconcile` + `freeze`, and this configuration and harness exactly the frozen ones. The holdout
  is consumed once any run started decoding it: from then on holdout mode and any freeze are
  refused. The challenger limit knows baselines by kind and model.
- **C6** One unknown-bill rule for every arm: a sent attempt that may have been billed (a 2xx, a 408,
  a 5xx, no response) whose bill was not read is charged its worst case and recorded. It does not
  suspend: the batch's settled closing reading reconciles it before the next batch, and the
  settled cost keeps the larger of that charge and the debit.

## Scoring (frozen, `jev-svg-score/1`)

Labels' anchors are reconciled to the reader's layer ids through element paths on the sanitized
markup (the method of `scripts/jev-svg-baseline.test.mjs`). Per design and arm:

- corrections: expected fields left off, decoys left on, behaviour families missed or invented,
  plus anchors the reader offers no layer for (the same for every arm);
- decisions: the label's unresolved intents (no arm decides intent: questions never ask it);
- consequential errors: a decoy bound as a live field, an invented behaviour family, a field on a
  layer the inventory does not have.

Behaviour families are scoreboard, clock, quiz and credits; a lower third is no behaviour.
Decision rule (primary against deterministic only), as the spec words it: no go on any invalid
reference, an unusable primary, or a consequential-error increase in any stratum (summed over its
designs); otherwise a family qualifies when at least two of its designs need fewer corrections
plus decisions and none of its designs increases consequential errors. A run that metering
stopped, in which the reader refused a labelled design, or in which any primary answer never
came (not admitted, outage, refusal), is no go:
a deterministic stand-in is never scored as the model's.
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
  merge commit; the baseline dispatch writes it (`GITHUB_SHA`), the workflow ref and the manifest
  into the ledger before any paid batch, and every later run refuses a harness whose manifest
  differs unless a reconcile accepted a reviewed change.
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

## Rules found after coding

From the `/check` review (delegated, 10 findings, 9 fixed, 1 a documentation mismatch):

- The receipt chain could fork (a stale `receipts_run_id`) or restart (a second
  `establish_baseline`): the workflow now finds the newest ledger itself (M4).
- After a reconciliation, a later receipt is the comparison point for new money (M7).
- A chat or image refusal before inference was charged as an unknown bill, which would suspend
  the run; the harness now reads each attempt's HTTP status (M6). The image request was priced
  from the wrong bytes; it is now priced from what it sends (M6).
- A layer outside the questions (never in the evidence) lost its deterministic decision; any
  unasked layer now keeps it (M10). Names are bounded in UTF-16 units, as the server counts
  them. Text line counts read relative `dy` lines.
- The configuration step printed nothing when it refused; it now prints the reason.
From the PR bot review of `d996455` (three findings, all fixed): the baseline id is reserved for
the deterministic arm; a run metering stopped is no go; the freeze manifest covers the reader's
whole import graph (the 51-file harness page, `svgImport.ts`, the wizard draft and every module
they load, about 200 files) plus the harness scripts, lockfile and labels.

From the PR bot review of `dd5193c` (three findings, all fixed): a holdout run could start a
fresh chain and skip the freeze; a design the reader refused dropped out of the verdict; a first
paid run lost before its ledger left no way to continue.

From the first `/so` (`session_017SdbwNtTXQYJjQnVa24wVG`, B+ on `d996455`, 2 blocking, 5
non-blocking, all addressed): a lost runner could reset or fork the chain (M13); a run with a
missing primary answer could still qualify a family (M12); the challenger limit trusted names
(M13); one retried 5xx suspended a run (M9); the holdout freeze was a typed input (M13); the
freeze missed `contract.ts` and `aiModelCatalog.ts`; the baseline did not store the workflow ref.

From the second `/so` (`session_017SdbwPUKVTgH9GBgsnBG8M`, B on `dd5193c`, 2 blocking, 4
non-blocking): a re-run attempt skipped its own first attempt; the holdout could be re-frozen and
re-run after it stopped early; a typed partition could move a lost holdout's spend; lost spend
counted only the balance drop; the server freeze missed imported modules; unknown bills were
flagged differently per arm.

That made two successive rounds on one missing rule (the chain across runs), so patching stopped
and a fresh read-only reassessment (`session_017SdbwRE14vBg7MZ9kniiW3`) challenged a written rule
model first. It agreed with corrections, all taken: count every attempt; detect deleted runs by
run-number gaps; gate the holdout before the secret is decoded and consume it at decoding; charge a
lost reconcile nothing; freeze the composite actions and record the runtime; an unknown bill is
charged, not suspended (the settled reading reconciles it); and make the baseline its own no-spend
dispatch, which removed the typed lost spend entirely. That model is C1 to C6 above.

- Not changed: the decision rule's no go is the per-stratum sum, as the spec words it; a single
  harmed design stops its family from qualifying. The notes and docstring said "or design" and
  were corrected.

## Verification

- `node --test scripts/jev-svg-eval.test.mjs`: 30 of 30 pass (mocked fetch and git only; the
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

## Known limits

- A paid run whose harness fails before writing its ledger (for example a configuration refused
  at start) reads as lost: a reconcile naming it, with zero attempts, closes it. Safe, and rare.
- A lost run's attempt count is typed by a person from the gateway's records (C3). The attempt
  cap is 500 and a development run makes about 140, so a wrong count cannot quietly approach it.
- The run-number gap check assumes GitHub numbers every run of this workflow in order; one run on
  the protected environment in row 33 confirms it.
- The Node patch version and runner image are recorded in the ledger and report, not frozen.
- The freeze covers the reader's graph and the lockfile, so a change on main to the importer or a
  dependency between rows 33 and 34 refuses the holdout until row 33's freeze is redone. That is
  the intended protection against comparing two instruments.
- Whether a byte per token bounds Jev's and GPT-6 Luna's billing (reasoning included) is checked by
  row 33's first settled receipts against their priced maximums; an over-bound receipt suspends.

## Traps

- `actions/upload-artifact` paths in `RUNNER_TEMP` cannot be tested with `hashFiles` (it only sees
  the workspace); the upload steps use `if-no-files-found: ignore` instead.
- The `windows-hide` gate requires `windowsHide: true` on every `execFileSync`, test files included.
- Commit messages in this repository carry no co-author trailer (a hook refuses them).
