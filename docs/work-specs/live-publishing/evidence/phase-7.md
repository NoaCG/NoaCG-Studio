# Phase 7 evidence: only what changed, each image once

Design: `designs/G4.md` (graded A by an independent /so; PR #2525). Acceptance: the design's grade,
and AC-5. Everything else below is measured and reported, not phase 7 acceptance.

## Judging rules, fixed before any result was read

- **AC-5** (G4 section 11): on the automatic path, a 2 kB cue edit's save and publish together send
  and receive under 20 kB in the counted families (preflights included), the same image is never
  uploaded twice, a design update sends one part, and the parts path leaves the row, the record and
  every output exactly as the whole path would (R23). The configured check asserts each.
- **AC-4 on the large fixture (reported):** the same rule phase 6 used on the typical fixture. The
  pooled p95 difference of Take timing (automatic updates on minus off) over all pairs, interleaved
  on then off, passes at 50 ms or less. Bootstrap range, per-pair values and slow-Take counts are
  reported beside it. Production build with the harness hooks, local stack, test `autopublish`,
  `MEASURE_EDIT=cues`, 5 s edit pace, one output, unthrottled, parts on for both sides.
- **The loop where every edit changes content (reported):** the same pairs with `MEASURE_EDIT=labels`,
  so every save changes what the outputs show and every publish sends a new head.
- **#2509 (reported):** the large fixture at a 1 s edit pace, parts on: publishes made, the newest
  save published at the end or not, and Take p95.
- **D1 (reported):** a Take of a brand-new graphic on the large fixture, throttled (`MEASURE_NET=slow`),
  edit to output holding it, against the 5 s ceiling; phase 6 read 30 to 33 s whole.
