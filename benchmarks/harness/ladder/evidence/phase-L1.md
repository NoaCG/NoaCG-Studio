# L1 evidence: the model ladder

Phase 2 of `docs/work-specs/harness-ladder/spec.md` (AC-4, AC-8). Subscription only; no credit.
No brief text is in this file or beside it: the eight ladder briefs open in memory from H8's
sealed file, and only ids, types and the judge's answers are committed.

## Fixed before the first rung's first session

- **The briefs and their order** (D4, D5): `RUNG_ORDER` in `benchmarks/harness/lib/ladder.mjs`,
  the same on every rung. The screen is the first four, two dense boards and two others:
  `boxing-night-matchup`, `collegiate-cs2-scorebug`, `charity-stream-alerts`,
  `film-fest-nominee-reveal`; then `hockey-club-match-board`, `volleyball-set-board`,
  `school-quiz-secret-pick`, `ski-sprint-timing-tower`.
- **The counting** (H8's, `benchmarks/harness/evidence/phase-8.md`): usable is delivered (a ladder
  hand-in without `record --review` is not), the bench's validator clean, the save door's shape
  check passed, no missing action after the readings, and the ladder judge's single airable with no
  basic visible mistake. A gate flag the single does not also name is read against the operator
  surface as H8's ruling says, in the rung's `readings.json`; the tally lists such flags.
- **The cost**: Claude Code's notional `total_cost_usd` of every session that ran (failed and
  stopped ones included) over the usable graphics; an estimate (D2).
- **The screen** (D5): three of the first four not usable, or, with the four judged, no usable
  graphic or more than $2.00 notional per usable, ends the rung.
- **The match** (D6): all eight run, at least 7 usable, at most $1.00 per usable, median wall at
  most 600 s, and every reviewed frame opened in at least 7 sessions. The first rung that matches
  wins and the ladder stops.
- `RUNG_RULE` and `tallyRung` hold these lines; `node scripts/harness-bench.mjs --tally <rung dir>`
  prints them from the cells and the judge's answers.
- **How a rung runs**: `--build L1 --arms subscription --model <id> --effort <level> --stage
  rung-<model>-<effort> --lanes 2 --out C:/claude/noacg-bench-archive/harness-ladder-L1/<rung>`,
  the screen's four first, judged with `--judge <dir> --delivered-only --concurrency 2`, then the
  other four into the same directory. Each rung's committed evidence is `benchmarks/harness/
  ladder/L1/<rung>/`: every `cell.json`, `judgements.jsonl`, `tally.json`, and `readings.json`
  when it has one.
- **A rubber stamp** is a delivered graphic whose review said `ok` to every frame and that the
  judge failed; counted per rung (L0's carry: the gate cannot tell a look from a stamp).

## The rungs

### Rung 1: Haiku 5.5 `high` (`claude-haiku-5-5`)

**Hypothesis**, committed before its first session: Haiku delivers some of the eight, since L0's
proof delivered a lower third in 315 s for $0.60 with every frame opened, but the dense boards
(four or more actions, long values, two sides) break it: either it runs out of the 20 minutes or
it hands in a board the judge fails, with every verdict `ok`. Expected: the screen ends the rung
on "not usable" (three of the first four), with at least one rubber stamp. What would refute it:
two or more usable in the screen at at most $2.00 per usable.

**Result: screened out on "not usable"; the hypothesis held.** Sessions 12:38Z to 12:56Z, two at
a time. 3 delivered, 1 usable of 4, $2.13 notional ($2.13 per usable, also over the $2.00 line),
median wall 502.5 s, frames opened 119 of 161 reviewed (every one in 1 session). Two rubber
stamps. Evidence: `benchmarks/harness/ladder/L1/haiku-5-5-high/`.

| brief | outcome | single | basic mistakes | usable | notional | wall s | opened/reviewed | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| boxing-night-matchup | delivered | not airable | empty-or-broken (2), text-over-text; the judge also names `select` and `lock` showing nothing | no | $0.44 | 485 | 18/57 | yes |
| collegiate-cs2-scorebug | failed: said NOT READY (no logos supplied, an Out frame it would not air), `record --review` refused with that frame open | - | - | no | $0.66 | 520 | - | |
| charity-stream-alerts | delivered | not airable (no hard defect: the resting state is a wide dark bar with the text crammed left) | - | no | $0.65 | 536 | 61/64 | yes |
| film-fest-nominee-reveal | delivered | airable | - | yes | $0.39 | 264 | 40/40 | |

What the judge failed: on the matchup, the brief's own sample values show no boxer at all, and two
actions change nothing on screen, which the bench's action gate (it reads the operator surface,
not the pixels) passed; Haiku opened 18 of its 57 frames and set all 57 to `ok`. On the alerts it
opened 61 of 64 and still passed a design the judge would not air: looking is not judging. Its one
honest refusal (the scorebug) cost a graphic: the review gate refuses an open frame, and Haiku
did not fix it in time.

### Rung 2: Sonnet 5.5 `medium` (`claude-sonnet-5-5`)

**Hypothesis**, committed before its first session: Sonnet at `medium` delivers more of the
dense boards than Haiku (H7: Sonnet at `high` delivered 5 of 5 tuning briefs at $0.47), but its
H7 failure, basic visible mistakes it did not see, survives the forced look at a lower effort.
Expected: it passes the screen's cost line (under $2.00 per usable) but not D6: at most 5 of 8
usable, so no match. What would refute it: 7 or more of 8 usable at at most $1.00 each.
