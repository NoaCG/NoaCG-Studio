# Antigravity spend appendix for the 2026-09-09 harness verdict

This file is the Antigravity spend appendix for the 2026-09-09 harness verdict, produced by an Antigravity delegation on 2026-09-09 from C:/Users/ahonemi/.noacg/agy-usage.jsonl.

## Usage by model

| Model | Calls | Failed calls | Total wall-clock seconds | Input tokens | Output tokens | Thinking tokens | Cache-read tokens |
|---|---|---|---|---|---|---|---|
| gemini-3.1-pro-high | 5 | 1 | 746.7250754 | 688143 | 38415 | 32149 | 3565054 |
| gemini-3.7-flash-high | 16 | 1 | 1250.3434830 | 2300808 | 305651 | 235606 | 23198603 |
| gemini-3.8-flash-high | 4 | 0 | 187.6134609 | 332274 | 38837 | 33484 | 1150123 |
| claude-sonnet-4-6 | 7 | 2 | 824.2374461 | 371874 | 34109 | 0 | 942366 |
| claude-opus-4-6-thinking | 1 | 0 | 465.0316951 | 75786 | 28272 | 0 | 0 |
| Total | 33 | 4 | 3473.9511605 | 3768885 | 445284 | 301239 | 28856146 |

agy's own `total_tokens` field is input plus output only, so the four token columns must never be added into a single number.

**Editor's note, added on review.** The failed-call column undercounts, and the fault is the
spec's, not the worker's. My spec defined a failed call as one whose status is anything other than
success, which finds 4. The ledger's `ok` field finds 11, because seven runs return status SUCCESS
with an empty response and the wrapper records those as `ok: false`. The correct per-model failure
counts, over the 34 lines then on the ledger, are: gemini-3.1-pro-high 2, gemini-3.7-flash-high 5,
gemini-3.8-flash-high 2, claude-sonnet-4-6 2, claude-opus-4-6-thinking 0, total 11. Every other
number in both tables reproduces exactly against an independent pass.

## Usage by calendar day

| Date | Calls | Failed calls | Total wall-clock seconds |
|---|---|---|---|
| 2026-08-30 | 6 | 1 | 828.8800374 |
| 2026-09-01 | 2 | 0 | 248.6811389 |
| 2026-09-02 | 8 | 1 | 1064.4695706 |
| 2026-09-03 | 5 | 0 | 204.4723785 |
| 2026-09-04 | 7 | 1 | 1086.5806593 |
| 2026-09-08 | 3 | 1 | 29.4340528 |
| 2026-09-09 | 2 | 0 | 11.4333230 |

The first line UTC timestamp is 2026-08-30T11:12:41.421Z, the last line UTC timestamp is 2026-09-09T20:24:47.567Z, and the total number of lines read is 33.
Any field missing on a line is treated as zero.
