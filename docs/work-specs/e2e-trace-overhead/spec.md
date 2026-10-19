# Reduce CI trace recording overhead

Scope: the separately reviewed runtime reduction authorized while completing editor repair
PR #1487 and acceptance issue #1466. The current capacity table estimates 210.3 minutes with
the repair's regression; the 2026-10-19 refresh proposal (#1503, run 39242322543) measures
231.3 minutes over six successful full main runs. Neither justifies raising the capacity line.
This change leaves the editor repair, Step 6 reservations and Phase 3 boundary intact.

## Change and acceptance

Playwright still executes every selected test with its existing assertions, real browser,
fresh context, waits, retries and limits. CI still records and retains a trace on failure,
and captures a failure screenshot. Disable only the trace recorder's DOM snapshots: serializing
the editor and srcdoc preview on each action costs time even when a passing trace is discarded.
Action/source/console history and the screenshot filmstrip remain available. Interactive DOM
replay and the recorder's network bodies are unavailable with snapshots off; a failed named
selection can be diagnosed with a temporary trace configuration enabling snapshots. This is a
diagnostic tradeoff, not a change to which checks run or what constitutes a pass.

Acceptance: preserve every test and assertion; demonstrate lower runtime with the same named
selection; inspect retained diagnostic artifacts; and read authoritative full CI before landing.
Do not change duration weights until optimized full CI supplies actual measurements. No tests
are dropped, skipped, renamed, moved or reclassified. No budget, gate, exception, timeout,
retry or concurrency change is included. The nightly's separate V8 coverage fixture is unchanged.

## Bounded comparison

The executing Codex cloud worker reports four CPUs and 16 GiB machine memory; ancestor cgroup
limits are unreadable. Browser ceiling two, comparison uses one worker. Both jobs use the
existing browser queue, cap five minutes, the same eight cases (four existing cases repeated
twice), and identical test/source bytes. The candidate uses an ignored configuration wrapper
that changes only trace snapshots, retaining every trace for artifact inspection. The normal
configuration continues to retain traces only on failure. Neither job is a full suite/build.

Selection: `e2e/save-transaction.spec.ts --grep "matrix refuse.retry: (topbar|save-as) / (L|K)$"
--workers=1 --repeat-each=2`, with list and JSON reporters.

| Measurement | Baseline, DOM snapshots on | Candidate, DOM snapshots off |
| --- | --- | --- |
| Queue job | j-0002 | j-0003 |
| Result | 8 passed, no skips/retries | 8 passed, no skips/retries |
| Summed test time | 150.426 s | 126.134 s |
| Whole job reported by Playwright | 174.192 s | 139.084 s |

The observed reduction is 16.1% in test time and 20.2% in wall time. All observations are kept,
including a 38.274-second candidate case; no outlier is removed. These are local measurements,
not a prediction that the whole Actions suite will fit. Full CI supplies that verdict.
Retained ZIPs were inspected: both have before/after action events, console records,
screencast frames and four source files. Baseline has frame snapshots and network bodies;
the candidate has no frame snapshots and an empty network stream, as the public option implies.
The regular failure screenshot setting remains `only-on-failure`.

The temporary wrapper, reports and trace ZIPs are ignored local evidence, not suite changes.
Review and simplification run inline under /check; there is no separate review tool exposed.
Targeted gates and the existing duration/capacity/planner checks verify configuration and
selection invariants. The full suite and production build remain exclusively in Actions.

## Complete optimized recording (2026-10-19)

PR #1504 landed through the merge queue as `76cae1a7b63c240a27877df8febaee400ed818cb`.
This follow-up records actual optimized runtimes; it does not change the trace policy again.
The three complete successful full CI runs below each carry all fifteen full offline shards.
The recorder refuses missing, failed or subset shards. The read-only probe also verifies
`src/`, `e2e/`, the Playwright config and package files against reviewed source
`299ee5fd9afe6a53695b245234cbef83882dc2d6`; the merge has identical bytes for those paths.

| Full run | Tested source | Result |
| --- | --- | --- |
| [39243785986](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39243785986) | `299ee5fd9` | All 15 full shards and CI passed |
| [39245690239](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39245690239) | `299ee5fd9` | All 15 full shards and CI passed |
| [39246625438](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39246625438) | `76cae1a7b` | Exact landing's 15 full shards and CI passed |

[Read-only recording 39248673346](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39248673346)
uses the existing `e2e-durations.mjs --record` and `slowRunnerMinutes` functions. Each file is
recorded at the existing 80th percentile across all three runs (the slowest observation for
three samples), not at the first run's faster 146.723-minute total. No failed observation was
re-run or omitted. The unqueued disposable branch `codex/probe-e2e-runtime-measure` has no PR;
its workflow only reads/merges reports and prints the table. It never executes a product test
or writes main. The table is copied from that output, not estimated by hand.

All 231 current files are measured, totaling **157.651 minutes**. The per-job overhead uses the
largest measured p90 and test factor, never below the previous table: **0.5 minutes**, **1.02**.
Thus the fixed thirteen-runner envelope shrinks from 213.921 to **210.294 minutes**, rather than
increasing. The 20-minute shard cap, three-minute margin, 85% warning and 95% hard line remain
unchanged. The hard line is now **199.779 minutes**. No runner or concurrency setting changes.

The prospective unchanged editor repair adds its new unmeasured regression at the ordinary
median, **0.371 minutes**: **158.022 minutes**, **75.14%** of the envelope, status **OK** without
an exception. New test runtime is still measured by its own CI. There is no test deletion,
rename, skip, relocation, reclassification, assertion change or maintenance entry here.
The eight stale duration entries disappear because those files were already retired by the
landed #800 cleanup; no test file changes in this follow-up. Proposal #1503 measured the older
trace profile and is not the source of these weights.

The controlled comparison above proves a runtime reduction from the trace option. These full
measurements establish the current suite's cost across runners; the difference from #1503's
older six-run aggregate is not attributed entirely to that one option. Recovered minutes stay
as headroom. This is a capacity receipt, not Phase 2 acceptance: #1466 remains open, the fresh
independent checker remains necessary, and Step 6/Phase 3 are not started.
