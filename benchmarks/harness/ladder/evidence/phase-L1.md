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
  ladder/L1/<rung>/`: every `cells/<id>/cell.json`, `judgements.jsonl`, `tally.json`, the run's
  phase as `summary.json`, and `readings.json` when it has one (none did).
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

**Result: passed the screen, no match; the hypothesis held.** Screen 12:58Z to 13:03Z, the
other four 13:07Z to 13:27Z, two at a time. 8 delivered, 4 usable of 8, $10.96 notional ($2.74 per
usable), median wall 318 s, frames opened 363 of 507 reviewed (every one in 4 sessions). Four
rubber stamps. The screen: 2 not usable, $1.36 per usable, so the rung ran on; with two failed it
could no longer match, but L2's teaching rule counts usable of all eight. Evidence:
`benchmarks/harness/ladder/L1/sonnet-5-5-medium/`.

| brief | outcome | single | basic mistakes | usable | notional | wall s | opened/reviewed | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| boxing-night-matchup | delivered | not airable | empty-or-broken, text-over-text; the judge also names `select` and `lock` | no | $0.45 | 170 | 3/57 | yes |
| collegiate-cs2-scorebug | delivered | not airable | empty-or-broken (empty logo slots in the sample state) | no | $0.47 | 157 | 13/69 | yes |
| charity-stream-alerts | delivered | airable | - | yes | $1.17 | 215 | 64/64 | |
| film-fest-nominee-reveal | delivered | airable | - | yes | $0.64 | 246 | 15/40 | |
| hockey-club-match-board | delivered | not airable | unreadable-contrast (the white visitor crest on a near-white disc) | no | $2.74 | 631 | 81/81 | yes |
| volleyball-set-board | delivered | not airable | text-over-text (2: a wrapped Polish name's ogonek into the next line) | no | $1.82 | 390 | 69/69 | yes |
| school-quiz-secret-pick | delivered | airable | - | yes | $1.83 | 412 | 59/68 | |
| ski-sprint-timing-tower | delivered | airable | - | yes | $1.84 | 520 | 59/59 | |

The gate flagged `undoPoint` missing on the volleyball board and the judge did not name it; the
graphic is not airable on its own single, so the reading cannot change "usable" and is not made.
On the two simple-looking boards it opened 3 and 13 frames; on the two it opened in full (81 and
69), it still passed the defect the judge failed. The cost moved with the board, not the effort:
$0.45 for a three-minute board it barely looked at, $2.74 for the one it looked at in full.

### Rung 3: Sonnet 5.5 `high` (`claude-sonnet-5-5`)

**Hypothesis**, committed before its first session: `high` buys more looking and more fixing
than `medium`, so more usable boards, but it costs more per session than `medium`'s $1.37 mean,
which already put `medium` at $2.74 per usable. Expected: at most 5 of 8 usable and more than
$1.50 per usable, so no match, and possibly the screen's cost line. What would refute it: 7 of 8
usable at at most $1.00 each.

**Result: screened out on cost; the hypothesis held.** Sessions 13:30Z to 13:49Z, two at a time.
4 delivered, 2 usable of 4, $7.50 notional ($3.75 per usable, over the $2.00 line), median wall
457 s, frames opened 242 of 242 reviewed (every one in all 4 sessions). Two rubber stamps.
Evidence: `benchmarks/harness/ladder/L1/sonnet-5-5-high/`.

| brief | outcome | single | basic mistakes | usable | notional | wall s | opened/reviewed | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| boxing-night-matchup | delivered | not airable (the gym logos on large plates of their own; with long values the record line outgrows the names) | - | no | $2.16 | 568 | 57/57 | yes |
| collegiate-cs2-scorebug | delivered | not airable (no basic mistake; the logo treatment) | - | no | $2.89 | 781 | 81/81 | yes |
| charity-stream-alerts | delivered | airable | - | yes | $1.27 | 226 | 64/64 | |
| film-fest-nominee-reveal | delivered | airable | - | yes | $1.18 | 346 | 40/40 | |

At `high` Sonnet opened every frame it reviewed, and its matchup now shows the boxers with the
brief's own values and its winner steps work (the judge: "Select, lock and clear all work"; the
gate's `select` flag is one H8's reading would clear, but the graphic is not airable on its own
single). The look got complete and the boards still failed on design calls the judge makes and
the agent did not; the price of looking at every frame is the price that ended the rung.

### Rung 4: Opus 5.5 `low` (`claude-opus-5-5`)

**Hypothesis**, committed before its first session: Opus makes the better boards (in H8 every
graphic it delivered was usable), and `low` keeps the session short, but its token price is
higher than Sonnet's and the dense boards still take most of the work. Expected: it passes the
screen, delivers 5 to 7 usable of 8, and misses D6 on cost (more than $1.00 per usable). What
would refute it: a match (7 usable at at most $1.00), or a screen out on "not usable".

**Result: screened out on cost, earlier than predicted.** Sessions 13:52Z to 14:03Z, two at a
time. 3 delivered, 2 usable of 4, $6.60 notional ($3.30 per usable), median wall 245 s, frames
opened 81 of 230 reviewed (every one in 1 session). One rubber stamp. Neither refutation
happened, but the prediction that it passes the screen was wrong: the cost line ended it.
Evidence: `benchmarks/harness/ladder/L1/opus-5-5-low/`.

| brief | outcome | single | basic mistakes | usable | notional | wall s | opened/reviewed | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| boxing-night-matchup | delivered | not airable | empty-or-broken (4: select and lock never show a winner) | no | $1.49 | 282 | 3/57 | yes |
| collegiate-cs2-scorebug | not-ready: said NOT READY, "65 of 72 frames were marked `ok` without being opened", the look and logos unfinished | - | - | no | $0.48 | 111 | 6/69 | |
| charity-stream-alerts | delivered | airable | - | yes | $3.10 | 402 | 64/64, 2 fixed | |
| film-fest-nominee-reveal | delivered | airable | - | yes | $1.52 | 208 | 8/40, 11 fixed | |

Opus at `low` is the first rung to write `fixed:` verdicts (13 in two graphics), and the first to
say outright that it stamped frames it had not opened; it then handed in as not ready rather than
record a review it called false. It opened few frames where it did not fix anything.

### Rung 5: Opus 5.5 `medium` (`claude-opus-5-5`)

**Hypothesis**, committed before its first session: `medium` looks and fixes more than `low`, so
the quality is at least `low`'s, but every rung so far spent more than $1.50 a session on the
boards that pass, and Opus at `medium` spends more than at `low` ($1.65 a session). Expected:
screened out on cost (over $2.00 per usable). What would refute it: three or four usable in the
screen at at most $2.00 each, and then a match.

**Result: screened out on cost; the hypothesis held.** Sessions 14:07Z to 14:19Z, two at a time.
3 delivered, 2 usable of 4, $10.97 notional ($5.49 per usable), median wall 336.5 s, frames
opened 173 of 173 reviewed (every one in all 3 delivered sessions). One rubber stamp. Evidence:
`benchmarks/harness/ladder/L1/opus-5-5-medium/`.

| brief | outcome | single | basic mistakes | usable | notional | wall s | opened/reviewed | all ok, judge failed |
|---|---|---|---|---|---|---|---|---|
| boxing-night-matchup | failed: stopped after 6 minutes saying NOT READY, "not every coverage frame has been reviewed", no record | - | - | no | $2.28 | 361 | - | |
| collegiate-cs2-scorebug | delivered | not airable | empty-or-broken (the two logo spots empty discs with the brief's own values) | no | $3.37 | 398 | 69/69 | yes |
| charity-stream-alerts | delivered | airable | - | yes | $2.92 | 279 | 64/64 | |
| film-fest-nominee-reveal | delivered | airable | - | yes | $2.40 | 312 | 40/40 | |

## The curve: no rung matched

| rung | verdict | ran | delivered | usable | notional | per usable | median wall s | frames opened / reviewed (every one) | all ok, judge failed | qualifies for L2 (D7) |
|---|---|---|---|---|---|---|---|---|---|---|
| Haiku 5.5 `high` | screened out: not usable | 4 | 3 | 1 | $2.13 | $2.13 | 502.5 | 119/161 (1) | 2 | no (1 of first 4) |
| Sonnet 5.5 `medium` | no match | 8 | 8 | 4 | $10.96 | $2.74 | 318 | 363/507 (4) | 4 | **yes (4 of 8)** |
| Sonnet 5.5 `high` | screened out: cost | 4 | 4 | 2 | $7.50 | $3.75 | 457 | 242/242 (4) | 2 | yes (2 of first 4) |
| Opus 5.5 `low` | screened out: cost | 4 | 3 | 2 | $6.60 | $3.30 | 245 | 81/230 (1) | 1 | yes (2 of first 4) |
| Opus 5.5 `medium` | screened out: cost | 4 | 3 | 2 | $10.97 | $5.49 | 336.5 | 173/173 (3) | 1 | yes (2 of first 4) |

The two easy briefs of the screen (the alerts and the nominee reveal) were usable on every rung
but Haiku's alerts; the two dense boards of the screen (the matchup and the scorebug) were usable
on none. So every rung's screen came down to the price of the two that worked against the two
that did not. The cheap usable graphics were the simple ones (the nominee reveal for $0.39 on
Haiku, $0.64 on Sonnet `medium`); the two boards Sonnet `medium` made usable after the screen
(the quiz and the timing tower) cost $1.83 and $1.84 each. More effort bought more looking (Sonnet `high` and Opus `medium` opened
every frame) and not more usable boards.

Every figure above reproduces from the committed evidence: `node scripts/harness-bench.mjs
--tally benchmarks/harness/ladder/L1/<rung>` reads each rung's `cells/*/cell.json`,
`judgements.jsonl` and `summary.json` (its phase) and rewrites `tally.json` byte for byte (checked
on all five at commit time).
The judge's 21 singles cost $33.56 notional (Haiku 3, $4.10; Sonnet `medium` 8, $12.34; Sonnet
`high` 4, $7.30; Opus `low` 3, $4.67; Opus `medium` 3, $5.15), every one on the subscription,
`claude-opus-5-5` (`9fa9d7e3ac9b`), no pause. The 24 sessions cost $38.16 notional. Credit: $0;
the ledger stays at 5,468 cents spent with both holds intact.
