# Harness verdict measurement tables for 2026-09-09

This file supplies measurement tables and provenance for the harness verdict. It was produced by a
Codex delegation on 2026-09-09. Sources read: `codex-spec-tables.md`,
`scripts/delegation-outcome.mjs`, `scripts/harness-usage.mjs`, `./.hu.txt`,
`C:/Users/ahonemi/.noacg/delegation-outcomes.jsonl`, `C:/Users/ahonemi/.noacg/agy-usage.jsonl`, and
the Codex rollout JSONL files under `C:/Users/ahonemi/.codex/sessions/` and
`C:/Users/ahonemi/.codex/archived_sessions/`. Read-only PowerShell and inline Node.js calculations
read these files. The figures use a fresh `npm.cmd run harness:usage` report ending
2026-09-09T20:25:55.094Z, rather than the supplied capture. The initial `npm run harness:usage`
invocation was blocked by PowerShell execution policy; the `.cmd` invocation succeeded. A final
`git status --short` checked the working tree. Ledger tables include all lines at their read time,
with each ledger's endpoint stated below; they are not restricted to the usage report's cutoff.

## Table 1 - Codex consumption, all time and last 24 hours

Source: the fresh usage command and its rollout sources named above. Both rows end at
2026-09-09T20:25:55.094Z; the 24-hour row begins at 2026-09-08T20:25:55.094Z. All time means the
available rollout history through that cutoff. The calculations use the meter's session
deduplication and positive cumulative-token deltas; the 24-hour row also uses its
file-modification-time filter. Sessions without a positive token delta do not count.

| Window | Sessions | Turns | Total tokens | Cached share of input | Output tokens |
| --- | --- | --- | --- | --- | --- |
| All available history | 120 | 18,865 | 2,546,063,689 | 95.8749% (2,433,559,168 / 2,538,265,258) | 7,798,431 |
| Last 24 hours | 19 | 89 | 5,386,958 | 88.0614% (4,711,552 / 5,350,302) | 36,656 |

**Editor's note, added on review.** The 24-hour row comes from `npm run harness:usage` and stands.
The all-time row does not: the meter only reports 24 hours, so this row was produced by an ad-hoc
re-implementation of the meter's aggregation. An independent pass over the same 152 rollout files
gives 133 sessions, 19,198 turns and 2,810,646,662 tokens - a 10 percent spread. Nothing in the
verdict depends on this row; do not quote it until the two derivations are reconciled. The
ambiguity was mine: the heading I specified said "all time" while the body asked for a 24-hour row
only.

```text
  Rate limits, as of 2026-09-09T20:25:46.193Z (plan: plus) - a SNAPSHOT, not a sum:
    5-hour window     41% used  [300 min]  resets 2026-09-10T00:34:51.000Z (in 4h 9m)
    weekly window     27% used  [10080 min]  resets 2026-09-15T20:20:21.000Z (in 143h 54m)
```

A rate-limit snapshot is not a sum of consumption across sessions.

## Table 2 - Every task on the outcome ledger

Source: `C:/Users/ahonemi/.noacg/delegation-outcomes.jsonl`. Non-null labels collapse with the last
line winning, the first timestamp retained, and any recorded landed sha preserved. Null labels
remain separate tasks. The vocabulary and legacy handling follow `scripts/delegation-outcome.mjs`:
legacy `firstPass: true` means `clean`; legacy `firstPass: false` without an outcome remains
unclassified. Missing fields are `not recorded`; a missing landed sha is a dash. Dates are UTC.

| Date | Wave and letter | Task class | Harness | Model | Effort | Outcome | Cause | Defects | Retries | Redone-by | Landed sha |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-01 | 2026-09-01 / B | comprehension | antigravity | gemini-3.7-flash-high | high | not recorded | not recorded | 4 | 1 | claude-opus-5 | - |
| 2026-09-02 | 2026-09-02-q / Q | bug-fix-specced | codex | gpt-5.6-sol | high | clean | not recorded | 0 | 0 | not recorded | 02a4f722 |
| 2026-09-02 | 2026-09-02-q / Q | doc-edit | antigravity | gemini-3.7-flash-high | high | not recorded | not recorded | 0 | 1 | not recorded | f796282f |
| 2026-09-02 | 2026-09-02-q / Q | fixture-generation | antigravity | gemini-3.7-flash-high | high | not recorded | not recorded | 4 | 0 | claude-opus-5 | ef6f6c40 |
| 2026-09-02 | 2026-09-02-q / Q | fixture-generation | antigravity | claude-sonnet-4-6 | not recorded | not recorded | not recorded | 3 | 1 | claude-opus-5 | ef6f6c40 |
| 2026-09-02 | 2026-09-02 / B | spec-build | claude | claude-opus-5 | high | not recorded | not recorded | 2 | 0 | not recorded | - |
| 2026-09-02 | 2026-09-02-night / F | script-to-spec | antigravity | claude-sonnet-4-6 | not recorded | not recorded | not recorded | 0 | 1 | claude-opus-5 | - |
| 2026-09-02 | 2026-09-02-night / F | script-to-spec | antigravity | claude-sonnet-4-6 | not recorded | not recorded | not recorded | 0 | 1 | claude-opus-5 | - |
| 2026-09-02 | 2026-09-02-night / G | doc-sweep | antigravity | claude-opus-4-6-thinking | not recorded | not recorded | not recorded | 1 | 0 | claude-opus-5 | - |
| 2026-09-03 | 2026-09-03 / E | comprehension | antigravity | gemini-3.8-flash-high | not recorded | not recorded | not recorded | not recorded | 1 | not recorded | - |
| 2026-09-03 | 2026-09-03 / E | comprehension | antigravity | gemini-3.8-flash-high | not recorded | not recorded | not recorded | 1 | not recorded | claude-opus-5 | - |
| 2026-09-03 | 2026-09-03 / H | instrument-design | claude | claude-opus-5 | high | repaired | worker | 2 | not recorded | claude-opus-5 | - |
| 2026-09-03 | 2026-09-04 / F | doc-sweep | codex | gpt-5.6-sol | high | repaired | worker | 17 | not recorded | claude-opus-5 | - |
| 2026-09-04 | 2026-09-04 / H | comprehension | antigravity | gemini-3.7-flash-high | not recorded | repaired | worker | 2 | 1 | not recorded | - |
| 2026-09-04 | 2026-09-04 / H | comprehension | antigravity | claude-sonnet-4-6 | not recorded | repaired | worker | 3 | 0 | not recorded | - |
| 2026-09-04 | 2026-09-04 / D | feature-build | codex | gpt-5.6-sol | high | repaired | prompt | 0 | 0 | claude-opus-5 | - |
| 2026-09-04 | 2026-09-04 / L | spec-build | codex | gpt-5.6-sol | high | repaired | prompt | 4 | not recorded | claude-opus-5 | - |
| 2026-09-04 | 2026-09-05 / H | spec-build | codex | gpt-5.6-sol | high | repaired | prompt | 1 | not recorded | claude-opus-5 | - |
| 2026-09-04 | not recorded / I | comprehension | antigravity | gemini-3.7-flash-high | high | reviewed | not recorded | not recorded | 1 | not recorded | - |
| 2026-09-09 | 2026-09-09-day / F | refactor | codex | gpt-6-astra | high | unusable | prompt | not recorded | not recorded | not recorded | - |
| 2026-09-09 | 2026-09-09-day / F | refactor | codex | gpt-6-astra | high | unusable | prompt | not recorded | 1 | not recorded | - |
| 2026-09-09 | 2026-09-09-day / F | refactor | codex | gpt-6-astra | high | repaired | worker | 0 | 2 | claude-opus-5 | 593479ac |
| 2026-09-09 | 2026-09-09 / H | doc-sweep | codex | gpt-6-astra | medium | repaired | prompt | not recorded | not recorded | opus | - |
| 2026-09-09 | 2026-09-09 / J | doc-sweep | codex | gpt-6-astra | medium | repaired | prompt | 3 | 0 | claude | a87ae75d |
| 2026-09-09 | 2026-09-09-night / AD | doc-sweep | antigravity | gemini-3.7-flash-high | not recorded | unusable | prompt | not recorded | not recorded | not recorded | - |

Total: 25 tasks from 25 ledger lines. Oldest line: 2026-09-01T14:39:16.763Z; newest line:
2026-09-09T20:27:00.889Z. The ledger includes reviewed tasks performed by the delegating harness
itself, as well as delegations.

## Table 3 - Derived rates and their limits

| Measure | Count or calculation | What it is not evidence about |
| --- | --- | --- |
| Outcome: clean | 1 | Not a pool-specific quality rate. |
| Outcome: reviewed | 1 | Not a pool-specific quality rate. |
| Outcome: repaired | 10 | Not a pool-specific quality rate. |
| Outcome: unusable | 3 | Not a pool-specific quality rate. |
| Outcome: not recorded | 10 | Unclassified legacy rows do not establish acceptance or failure. |
| Cause: worker | 5 | Recorded attribution, not a general model ranking. |
| Cause: prompt | 8 | Evidence about the delegating session, not the pool. |
| Cause: capacity | 0 | Availability, not either party's work quality. |
| Cause: not recorded | 12 | Includes accepted rows and unclassified legacy rows. |
| Accepted among worker-attributable or accepted rows | 2 accepted / 7 eligible = 28.57% | Not an acceptance rate over all tasks or any individual pool. |
| Excluded because cause is prompt | 8 | Evidence about the delegating session, not the pool. |
| Excluded because cause is capacity | 0 | Not evidence of worker quality. |
| Excluded because outcome is not recorded | 10 | Not evidence of rejection. |
| Tasks with a recorded landed sha | 6 | Not all work that actually landed; missing backfills remain missing. |

The accepted calculation rests on 7 rows from table 2; it is a descriptive rate for those recorded
rows, not evidence of a population-wide or pool-specific rate. Accepted means clean or reviewed.
Only rows whose cause is worker or whose outcome is accepted enter the denominator.

## Table 4 - Throughput per task with recorded measurements

Source: the collapsed outcome-ledger tasks in table 2 with non-null `wallMs` or `specBytes`.
Wall-clock minutes equal `wallMs / 60000`, rounded to three decimal places. Missing measurements and
outcomes are `not recorded`.

| Date | Letter | Task class | Spec bytes | Wall-clock minutes | Outcome |
| --- | --- | --- | --- | --- | --- |
| 2026-09-02 | Q | bug-fix-specced | 4,065 | 9.000 | clean |
| 2026-09-02 | Q | doc-edit | 2,100 | 1.250 | not recorded |
| 2026-09-02 | Q | fixture-generation | 6,553 | 2.217 | not recorded |
| 2026-09-02 | Q | fixture-generation | 7,400 | 2.750 | not recorded |
| 2026-09-02 | F | script-to-spec | 4,400 | 1.881 | not recorded |
| 2026-09-02 | F | script-to-spec | 5,100 | 1.874 | not recorded |
| 2026-09-02 | G | doc-sweep | 14,998 | 7.751 | not recorded |
| 2026-09-03 | E | comprehension | not recorded | 0.708 | not recorded |
| 2026-09-03 | E | comprehension | not recorded | 0.880 | not recorded |
| 2026-09-03 | F | doc-sweep | 10,423 | not recorded | repaired |
| 2026-09-04 | H | comprehension | not recorded | 3.333 | repaired |
| 2026-09-04 | D | feature-build | 9,555 | 9.000 | repaired |
| 2026-09-04 | L | spec-build | 14,804 | not recorded | repaired |
| 2026-09-04 | H | spec-build | 6,476 | 8.667 | repaired |
| 2026-09-04 | I | comprehension | not recorded | 4.346 | reviewed |
| 2026-09-09 | H | doc-sweep | 3,240 | 22.000 | repaired |
| 2026-09-09 | AD | doc-sweep | not recorded | 0.147 | unusable |

15 of 25 total tasks recorded a wall clock at all; throughput claims are limited to that subset.

## Table 5 - Antigravity usage from its own ledger

Source: every line in `C:/Users/ahonemi/.noacg/agy-usage.jsonl`, with no time filter. Calls count
lines; failed calls have `ok: false`. Model families identify the Gemini and Claude/GPT pools; pool
membership is derived from the recorded model. Wall-clock seconds sum `durationSeconds` and are
rounded to three decimal places. Token counts sum the corresponding `usage` fields.

| Model | Pool | Calls | Failed calls | Total wall-clock seconds | Input tokens | Output tokens | Thinking tokens | Cache-read tokens |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| claude-opus-4-6-thinking | antigravity-claude-gpt | 1 | 0 | 465.032 | 75,786 | 28,272 | 0 | 0 |
| claude-sonnet-4-6 | antigravity-claude-gpt | 7 | 2 | 824.237 | 371,874 | 34,109 | 0 | 942,366 |
| gemini-3.1-pro-high | antigravity-gemini | 5 | 2 | 746.725 | 688,143 | 38,415 | 32,149 | 3,565,054 |
| gemini-3.7-flash-high | antigravity-gemini | 17 | 5 | 1310.757 | 2,358,954 | 334,609 | 262,102 | 23,357,913 |
| gemini-3.8-flash-high | antigravity-gemini | 4 | 2 | 187.613 | 332,274 | 38,837 | 33,484 | 1,150,123 |
| Total | All recorded pools | 34 | 11 | 3534.364 | 3,827,031 | 474,242 | 327,735 | 29,015,456 |

Agy's own `total_tokens` is input plus output only; the input, output, thinking and cache-read
counts must not be added together.

First ledger line: 2026-08-30T11:12:41.421Z; last ledger line: 2026-09-09T20:25:33.033Z. Calls
outside this ledger are not recoverable from it, and remaining quota is not recorded.

## Table 6 - Counts and exact sources

| Fact | Exact file or command |
| --- | --- |
| Installed Claude Code: 2.1.263 | `npm.cmd run harness:usage`, report ending 2026-09-09T20:25:55.094Z |
| Installed Codex: 0.154.0-alpha.11 | `npm.cmd run harness:usage`, report ending 2026-09-09T20:25:55.094Z |
| Installed Antigravity: 1.1.28 | `npm.cmd run harness:usage`, report ending 2026-09-09T20:25:55.094Z |
| Codex sessions in the last 24 hours: 19 | `npm.cmd run harness:usage`, 2026-09-08T20:25:55.094Z through 2026-09-09T20:25:55.094Z |
| Tasks on the outcome ledger: 25 | `C:/Users/ahonemi/.noacg/delegation-outcomes.jsonl`, collapsed by non-null label |
| Agy calls on the usage ledger: 34 | `C:/Users/ahonemi/.noacg/agy-usage.jsonl`, all lines |
