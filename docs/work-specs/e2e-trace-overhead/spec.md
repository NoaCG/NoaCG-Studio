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
