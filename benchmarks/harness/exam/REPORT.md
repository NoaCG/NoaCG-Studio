# The held-out exam (H8): report

`docs/work-specs/noacg-harness/spec.md` sections 4.4 to 4.6, AC-7. Agent v7 as tuned (Opus 5.5 at
effort `high`, no critic, a 194-cent session budget, the skill of `@noacg/cli` 0.11.0) against
Claude Code with the published plugin on the same model, on the 20 sealed briefs, run on
2026-10-15. How every figure is counted was fixed before the first session
(`evidence/phase-8.md`); the per-session figures are there too.

## Verdict: not decided yet

**The exam has not passed and has not missed: its judging is paused.** Every session ran and
every graphic is captured, but the frozen judge (`claude-fable-5-1`) answered 26 calls and was
then refused by the subscription's own seven-day Fable cap until **2026-10-20 05:00 UTC**. The
judge is frozen (4.3), so no other model takes its place, and nothing moves to the credit. 18
single judgements and 6 pairs remain; the verdict is computed when they are answered.

Where it stands on 4.5's four lines, read as written:

| 4.5 line | so far | what the remaining judgements decide |
|---|---|---|
| usable delivery within one graphic of Claude Code's | harness at most 12 usable (8 sessions stopped at the budget); Claude Code 6 judged usable, 2 judged not, 12 unjudged | holds only if at least 5 of Claude Code's 12 unjudged graphics fail |
| zero basic visible mistakes and zero missing actions in the delivered graphics | 0 in the 6 judged harness graphics; no missing action in any of its 12 | the other 6 harness graphics' singles |
| Claude Code preferred in at most 10 of 20 pairs | **10 already**: 2 judged, 8 where only Claude Code delivered; harness 3, tie 1 | fails if Claude Code wins any of the 6 unjudged pairs |
| median wall at most 10 minutes, no accepted graphic over the budget | median 527 s; no accepted graphic over 194 cents | settled |

So the exam passes only if the harness wins or ties all six remaining pairs and Claude Code
fails on at least five of its twelve unjudged graphics. The plain reading: **the harness
delivered 12 of 20**, because 8 sessions ran out of the 194-cent budget while still working,
and that alone puts the exam close to a miss.

## The numbers so far (4.4)

Out of 20 requests each, Wilson 95% intervals. "Usable" and the defect counts cover only what the
judge has read.

| | harness | Claude Code |
|---|---|---|
| delivered | 12 (39% to 78%) | 20 (84% to 100%) |
| not ready at the session budget | 8 | none (no budget) |
| usable, judged so far | 6 (14% to 52%) | 6 (14% to 52%) |
| delivered with a basic visual defect, of those judged | 0 of 6 | 1 of 8 (community bug: 3 defects) |
| delivered with a functional failure | 1 of 12: an event that did not move the machine | 7 of 20: 5 with a missing action by the gate (one read as offered under other names), 3 with an unmoved event |
| validator errors | 0 | 0 |
| preferred in its pair | 3 (5% to 36%) | 10 (30% to 70%), 8 of them by delivery |
| tie (order flip) | 1 (1% to 24%) | |
| cost | $33.34 credit, $1.67 a session; $5.56 per usable graphic so far | $45.22 notional on the subscription, $2.26 a session |
| wall time, median / 90th percentile | 527 s / 744 s; 7 of 20 over ten minutes | 453.5 s / 595 s; 2 of 20 over ten minutes |

Order flips: 1 of the 6 judged pairs (the Spanish flood alert), against the more than 5 that
would make the exam inconclusive.

The missing-action gate alone (without reading Claude Code's bilingual notice's `holdFi` and
`holdSv` as its two language actions, `evidence/instruments.md` entry 18) gives Claude Code 5
usable so far instead of 6; nothing else moves.

### Per brief

| brief | type | harness | Claude Code | pair |
|---|---|---|---|---|
| alumni-hall-of-fame-reveal | award-reveal | delivered, not yet judged; `settle` did not move the machine | delivered, not yet judged; same | not yet judged |
| borga-bilingual-notice | public-notice | usable | usable; `lang1`/`lang2` offered as `holdFi`/`holdSv` | harness |
| boxing-night-matchup | matchup | not ready (budget) | not yet judged; gate: `select` | Claude Code, by delivery |
| charity-stream-alerts | event-notification | not yet judged | not yet judged | not yet judged |
| collegiate-cs2-scorebug | esports-score | not ready (budget) | usable | Claude Code, by delivery |
| community-tv-station-bug | station-bug | usable | not airable, 3 basic mistakes | harness |
| film-fest-nominee-reveal | nominee-reveal | usable | usable | Claude Code |
| fun-run-sponsor-rotation | sponsor-rotator | usable | usable | Claude Code |
| hockey-club-match-board | match-board | not ready (budget) | usable | Claude Code, by delivery |
| library-conference-now-next | now-next | not yet judged | not yet judged | not yet judged |
| parish-prayer-request | community-request | not yet judged | not yet judged | not yet judged |
| school-auction-board | typeless | not ready (budget) | not yet judged; `sold` did not move the machine | Claude Code, by delivery |
| school-quiz-secret-pick | quiz-board | not yet judged | not yet judged | not yet judged |
| school-table-tennis-bracket | bracket | not ready (budget) | not yet judged; gate: `advance` | Claude Code, by delivery |
| ski-sprint-timing-tower | timing-tower | usable | not airable | harness |
| spanish-news-flood-alert | alert-level | usable | usable | tie (order flip) |
| volleyball-set-board | typeless | not ready (budget) | not yet judged; gate: `undoPoint`, `endSet` | Claude Code, by delivery |
| welsh-chapel-reading | statement-card | not yet judged | not yet judged | not yet judged |
| womens-derby-head-to-head | head-to-head | not ready (budget) | not yet judged; gate: `highlight` | Claude Code, by delivery |
| youth-game-show-podiums | podium-score | not ready (budget) | not yet judged; gate: `spotlight`; `resume` did not move the machine | Claude Code, by delivery |

### What the budget stops say

The reserve's `B` (194 cents, 1.5 times H5's mean on the five v1 briefs) sat 5 cents above the
dearest tuning graphic. On the exam's briefs, several with 8 to 12 fields and up to 16 buttons,
the twelve delivered sessions cost $0.92 to $1.87, and the eight capped ones were still
revising when they reached the cap. Each handed in a validator-clean interim record; they were
stopped by money, not by an error. A product budget has to be set from briefs as dense as these,
whatever the judge says next.

## Spend (4.4's last line)

From `benchmarks/harness/ledger.json`, list price, credit:

| stage | model | sessions | credit |
|---|---|---|---|
| H3 feasibility | Haiku 5.5, Opus 5.5 | 6 | $2.66 |
| H5 tuning round 1 | Opus 5.5 | 5 | $6.24 |
| H6 tuning round 2 (critic, control) | Opus 5.5 | 4 | $10.08 |
| H7 tuning round 3 | Sonnet 5.5 | 5 | $2.36 |
| H8 exam | Opus 5.5 | 20 | $33.34 |
| **total** | | 40 | **$54.68** of $100 |

The exam spent $33.34 of its $46.60 reserve; $13.26 of it stays held, and $32.06 is left for
everything else. Per usable harness graphic across the whole plan: computed once the exam's
usable count is final. Subscription, notional: the exam's reference arm $45.22, its judge
$124.62 so far (26 calls, about $4.80 a call).

## The owner gallery (4.6)

Built once the judge has answered, from the ten pairs the rule in `evidence/phase-8.md` picks:
`benchmarks/harness/exam/gallery/review.html` on this machine, never committed.

## What twenty briefs can show

This is a pilot: a 10 of 20 split carries an interval of roughly 30% to 70%. A pass would earn
the owner-only launch, not a claim of broad reliability.
