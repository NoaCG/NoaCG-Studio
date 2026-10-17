# L2 evidence: teaching Sonnet 5.5 `high`

Phase 3 of `docs/work-specs/harness-ladder/spec.md` (AC-4, AC-8). Subscription only; no credit.
No brief text is in this file or beside it: the eight ladder briefs open in memory from H8's
sealed file, the 16 tuning briefs are the committed bank, and only ids, types and the judge's
answers are committed.

## Fixed before the baseline's first session

- **The taught rung** (D7 as applied by the L1 repair): Sonnet 5.5 `high` (`claude-sonnet-5-5`,
  `--effort high`), 2 of its first 4 usable in L1.
- **The baseline is the skill and CLI as L1 ran them**: nothing in `cli/skill` or `cli/src` has
  changed since L1's Sonnet `high` rung (`git log e7a5f4d80..905fabec1 -- cli/skill cli/src` is
  empty). So the baseline on the eight is L1's four screen cells, with their three readings each,
  plus the other four run now: `hockey-club-match-board`, `volleyball-set-board`,
  `school-quiz-secret-pick`, `ski-sprint-timing-tower`. On the 16 tuning briefs it is all 16, in
  the bank's order.
- **The counting** is L1's, with D8 as amended: three readings a delivered graphic by the frozen
  Opus ladder judge (lock `9fa9d7e3ac9b`), usable on at least 2 of 3 airable readings with no basic
  visible mistake and no missing operator action after the readings; the cost is Claude Code's
  notional `total_cost_usd` of every session that ran, per usable graphic.
- **What decides**: D6's four lines on the eight (at least 7 usable, at most $1.00 per usable,
  median wall at most 600 s, every reviewed frame opened in at least 7 sessions). The 16 tuning
  briefs are reported with the same figures; they check that a round's change does not overfit the
  eight, and have no match line of their own.
- **How it runs**: `--build L2 --arms subscription --model claude-sonnet-5-5 --effort high
  --stage baseline --lanes 2 --out C:/claude/noacg-bench-archive/harness-ladder-L2/baseline`, the
  four ladder briefs first and then the 16 tuning briefs, judged with `--judge <dir>
  --delivered-only --concurrency 2`. L1's four screen cells and their readings are copied into the
  same directory, so `--tally <dir>` gives the eight and `--tally <dir> --order tuning` the 16.
  The committed evidence is `benchmarks/harness/ladder/L2/baseline/`.
- **Expected**, from L1: about half usable on the eight, at about $1.90 a session notional and
  about $3.75 per usable, every reviewed frame opened; the failures are design calls the look did
  not make (empty sample state, actions that change nothing on screen, faint or colliding text)
  and rubber stamps.
