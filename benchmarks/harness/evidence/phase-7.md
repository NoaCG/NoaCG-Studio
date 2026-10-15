# H7 evidence: tuning round 3, Sonnet 5.5 on the configuration that won

Phase 8 of `docs/work-specs/noacg-harness/spec.md` (AC-6, AC-16, AC-17, sections 3.8, 5.1, 5.2,
5.5, decision 5, D6), built 2026-10-15 on `origin/main` `1d3aade23`, on the bench workspace's key.

## Before the first session

Written and committed before any H7 session was created (5.1, AC-6).

- **The variable: the model** (3.8, 5.1 "Tuning round 3"). Round 2 was the critic, so round 3 is
  Sonnet 5.5 (`claude-sonnet-5-5`) on the configuration that won after round 2: agent
  `agent_0183yBA1miijGFNvm5bkMv6B` **v6** (the lock's version: no critic, `multiagent` null, the
  15-line plumbing prompt, skill `skver_01KXt4Xf4msx422tocc44dmh`, bundle `7f130e3e...`) with the
  CLI of this checkout (the #1246 fix included). Nothing else changes.
- **How the model changes.** A per-session override of the synced v6 (`agent_with_overrides`, as
  H3 ran Haiku), `--model claude-sonnet-5-5 --effort high`, so the agent stays on Opus until the
  winner is decided. The override replaces the model object in full; `--effort high` names the
  effort the Opus configuration runs at. Sonnet 5.5's default is also `high`, but its levels are
  recalibrated, so "the same effort" is the same setting, not the same depth. DECIDED: `high`, the
  closest one-variable reading. Revert: `--effort medium` in another round.
  The run's server check reads v6 back before it uploads anything (the H6 repair); no
  `--agent-version` is passed, since that skips the check.
- **Briefs.** The same five v1 library briefs as H5 and H6: `news-lower-third`,
  `school-scoreboard`, `lecture-countdown`, `live-vote`, `debate-clock`.
- **Reference.** The August A cells, re-captured at $0 into the same run directory
  (`--arms managed-agents,august`), so every pair is judged on one capture.
- **Session budget.** 224 cents, `agent.md`'s, as every Opus session of H5 and the H6 control ran.
  The wall's margin is the reserve's `o` (39); no `--critic-cents`, since there is no second
  thread.
- **Ceiling.** $15 (1,500 cents), `--ceiling-cents 1500`. The worst case, five sessions at their
  cap plus the margin, is 5 x 263 = $13.15, so all five are admitted. The $46.60 exam reserve is
  out of reach.
- **Hypothesis.** Sonnet 5.5 on v6 holds the bar Opus set on the tuning set, at a lower cost per
  accepted graphic: every graphic delivered validator-clean within 224 cents, no basic visual
  defect, no missing action, the frozen judge preferring August A on no more than 2 briefs.
  Expected: about $0.55 to $0.90 a session (half Opus's input and output prices, the same $0.20
  cache-read price, which is a large share of a session), and a wall time near Opus's.
- **What Sonnet is measured against: the Opus estimate of H6.** Five of five accepted, $6.00, **$1.20
  per accepted graphic**, the judge preferring the harness 3, tie 1, August 1 (H5's four briefs the
  fix did not touch and the H6 control on the live vote).
- **Signal, and how each figure is counted (fixed now, before any result).** As H5 and H6 counted,
  so the rounds compare:
  - per cell: outcome, validator errors, list cost, the bench's wall seconds, model requests,
    images read, the largest single request, any request whose cache read falls short of the
    previous request's context (a lapse), and the longest gap between requests;
  - **missing actions**: H5's mechanical gate with the alias and word rule;
  - **basic visual defects**: the frozen judge's single judgement, its `basicMistakes` other than
    `missing-action`;
  - **the live vote's five-option state** (#1251, outside every frame of the matrix): the delivered
    live vote re-shot from its zip with five options and a `33.33` leader, as the H6 check re-shot
    the Opus control (which held). A clipped or overlapping line there counts as a basic visual
    defect for the match below, since the Opus winner was checked in the same state;
  - **the verdict against the reference**: the frozen judge, pairwise against August A in both
    orders, an order flip a tie. Before any pair is judged, each pair's two `coverage.json` Update
    ops are compared; where they updated different kinds of field, each arm is re-shot with the
    other's Update and the re-shot frames decide a defect there (`instruments.md` entries 9, 11);
  - **accepted** = delivered, validator clean, no missing action, judged airable alone with no basic
    visual defect; **cost per accepted graphic** = the round's credit over its accepted graphics;
  - **median wall time** of the five sessions against 600 s, and each session against its budget.
- **What the signal decides: the winner** (decision 5: the cheapest model the judge rates as
  matching wins). **Sonnet matches** when all of these hold on the five briefs, 4.5's pass rule
  scaled to the round:
  - at least 4 of 5 accepted (within one graphic of Opus's 5);
  - no basic visual defect and no missing action in any delivered graphic;
  - August A preferred on at most 2 of 5 pairs (Opus's 1 plus one, and no more than half), ties
    not preferred;
  - median wall time at most 600 s, and no accepted graphic over 224 cents.
  **Sonnet wins** if it matches and its cost per accepted graphic is below Opus's $1.20; **else
  Opus 5.5 on v6 wins.** Haiku 5.5 is not measured in this plan: 3.8 runs it only after Sonnet
  matched and when the money fits, and H7 is the ladder's last round, so it is recorded as the
  next rung for a later plan, not run.
- **The stop rule's reading (5.5), stated before any spend.** Progress in this round = a cost per
  accepted graphic below $1.20 with August preferred on no more than 1, or August preferred on
  fewer than 1. DECIDED: **H6 counted as progress**, so H7 without progress is the first round
  without it and the stop rule does not fire across H5 to H7; H8 then runs the winner. Reasons:
  5.5 measures a round's progress "as cost per accepted graphic or the judge's verdict on the
  tuning set", and the configuration that won H6 moved both ($1.56 to $1.20, August 2 to 1); the
  H6 check found that arithmetic valid. And the rule exists so that "a third idea is not tried on
  hope": H7 is the ladder's last rung and the exam is the test, not another idea. The strict
  reading (H6's variable, the critic, made no progress) would make a no-progress H7 the second in a
  row and stop the run before H8. Revert: if the owner reads it strictly and H7 shows no progress,
  H8 waits for the owner's decision.
- **After the round** (5.2, the H6 carry): `--reserve --by H7` for the winner. If Sonnet: `m` the
  mean of its five sessions, `B` = round-up(1.5 m), `o` its largest request (raised for a lapse if
  one shows), and `agent.md` moved to Sonnet 5.5 at `high` with that `B`, re-synced and read back.
  If Opus: `B` 194 and `o` 39 stand, and `agent.md`'s budget goes from 224 to 194, so an exam
  session's cap is the `B` the reserve holds. Either way the time is re-checked against 600 s.

The round stops where it is if the ledger refuses a session, and a session that fails is read for
its cause before it is counted against the model.

## Outcome

**Sonnet 5.5 does not match; Opus 5.5 stays the winner and runs the exam.** Five Sonnet sessions
delivered five validator-clean graphics with every needed action for **$2.36** of the $15
ceiling, median **419 s**, none near the 224-cent budget. But the frozen judge called three of
them not airable on basic visual defects (the debate clock, the live vote, the scoreboard), so
Sonnet accepted **2 of 5** at **$1.18 per accepted graphic**, against Opus's 5 of 5 at $1.20. The
judge preferred the harness 3, August 2, tie 0. The match rule fails on two of its lines (at least
4 accepted, no basic defect), so by the rule fixed above **Opus 5.5 wins**.

The hypothesis, part by part: every graphic delivered validator-clean within 224 cents (held); no
basic visual defect (did not hold: three graphics); no missing action (held); August preferred on
no more than 2 (held, 2); a lower cost per accepted graphic (two cents lower on two accepted
graphics, which the match rule never reaches); about $0.55 to $0.90 a session (lower: $0.35 to
$0.60).

## The sessions

Through `scripts/harness-bench.mjs --build H7 --arms managed-agents,august --briefs
news-lower-third,school-scoreboard,lecture-countdown,live-vote,debate-clock --model
claude-sonnet-5-5 --effort high --ceiling-cents 1500`, agent v6, budget 224 cents, one at a time.
The section above was committed at 13:36:09Z (`cd4904409`) and was on GitHub by 13:36:21Z (draft
PR #1257 opened on it); the first session was created at 13:36:41Z. Figures from each session's
own events (`evidence/phase-7/<cell>/trace.json` and `cell.json`).

| brief | session | list cost | wall | requests | tool calls | images | largest request | min cache read | longest gap | bridge ready |
|---|---|---|---|---|---|---|---|---|---|---|
| news-lower-third | `sesn_01GSzT1tikvuVa5S1xkQQTzV` | $0.35 | 447 s | 17 | 22 | 8 | $0.0561 | 99.927% | **295.8 s** | 346.1 s |
| school-scoreboard | `sesn_01N1HVncsudCTn4S5sgdw1Ss` | $0.53 | 365 s | 19 | 27 | 9 | **$0.0914** | 99.927% | 47.0 s | 37.6 s |
| lecture-countdown | `sesn_01PEuWQMpwf5oUvpkoCC8EdD` | $0.53 | 419 s | 21 | 29 | 8 | $0.0815 | 99.927% | 91.2 s | 38.7 s |
| live-vote | `sesn_01Jo54zF3jpZUpNHthoZKcbo` | $0.60 | 602 s | 27 | 37 | 10 | $0.0598 | 99.927% | **296.4 s** | not printed |
| debate-clock | `sesn_01Homrtvc2dMWUjzQ5yt1tfQ` | $0.35 | 264 s | 17 | 23 | 7 | $0.0481 | 99.928% | 37.7 s | 36.5 s |

Total $2.36, mean $0.47, median wall 419 s (create to cleanup), slowest 602 s. Cleanup: every
session 404 on a free read after the run, and the workspace's file list empty.

- **Sonnet 5.5's cache read is $0.10 a million, not $0.20.** Priced at the table's $0.20, every
  session came out 7 to 15 cents over its own `usage.list_cost`; at $0.10 all five match to the
  cent. `benchmarks/harness/lib/trace.mjs` now says $0.10, and the traces above are recomputed.
- **No cache lapse**: each follow-on request read at least 99.927% of the previous context. Two
  came close: in `news-lower-third` and `live-vote` the plumbing prompt's certificate command hung
  until the tool's 295 s timeout, and the next request started 296 s later, four seconds inside
  the cache's five minutes. Each agent then imported the certificates again by hand;
  `news-lower-third`'s `certutil -A ... </dev/null` returned 0 for all four at once. No Opus
  session of H5 or H6 (nine) hung on that line. The hang is also the 346 s `bridge ready` and most
  of the live vote's 602 s.
- **How Sonnet looked.** It read 7 to 10 images a session, and of the 23 to 69 coverage frames it
  read 0 to 6 by name (the countdown none: it read one contact sheet it built and its own shots;
  Opus in H5: 10 to 23 images, mostly contact sheets of every frame). Every session's last message
  said the coverage frames had been checked. The defects were
  in frames it had: the debate clock's cut numeral in `long-video.jpg`, which it read, and the live
  vote's settled Update in `update-01500ms.jpg`, of which it read only the 300 ms frame.

## The verdict

Frozen judge `claude-fable-5-1` (fingerprint `60bfb08e18a4`), every cell's full matrix, answers in
`evidence/phase-7/judgements.jsonl`. Update ops compared and the live vote's five-option state
re-shot first (`instruments.md` entry 16): nothing hides in a state either arm was not put in.

| brief | Sonnet alone | August A alone | pair (both orders) |
|---|---|---|---|
| news-lower-third | airable, high | airable | **harness**, medium |
| school-scoreboard | **not airable**, medium: AWAY cut mid-Take; on clear, GOAL flashes beside the side that did not score | not airable (no flag, clear or final) | **harness**, high |
| lecture-countdown | airable, high | not airable (no pause or resume) | **harness**, high |
| live-vote | **not airable**, high: after the Update the leading label sits on its bar | airable | **August**, medium |
| debate-clock | **not airable**, high: the opposition numeral cut by its mask and on its label; an empty box in the header | airable | **August**, high |

- **Basic visual defects** (the judge's singles): **3 graphics**. I looked at each frame named:
  `debate-clock` `sample-video.jpg` and `long-video.jpg` (the right-hand `300` cut at the bottom,
  on "SECONDS LEFT"; an empty outlined box beside the round title), `live-vote`
  `update-01500ms.jpg` (the label's second line on the bar), `school-scoreboard`
  `event-clearflag-after-goala-00120ms.jpg` (GOAL beside HOME 1 and AWAY 0). The validator was
  silent on all three (`instruments.md` entries 13 to 15, issue #1259).
- **Missing actions** (the mechanical gate): 0. August A: the scoreboard misses `flag`,
  `clearFlag`, `final` and the countdown `pause`, `resume`, as in H5.
- **Accepted**: **2 of 5** (news lower third, lecture countdown). **Cost per accepted graphic:
  $1.18** ($2.36 / 2).
- **Order flips**: 0 of 5 pairs.
- **Median wall**: 419 s against 600 s; no session near its budget.
- **Judging**: 20 answered `claude -p` calls (10 single, 10 pair orders), **$68.76** notional on
  the subscription, no pause, $0 credit.

## What it decides

- **The winner: Opus 5.5 at effort `high` on the no-critic configuration** (decision 5, 3.8).
  Sonnet fails the match rule on accepted graphics (2 against at least 4) and on basic defects
  (3 against none). Haiku 5.5 is not measured: 3.8 runs it only after Sonnet matched.
- **No progress this round, and the stop rule does not fire** (5.5, read as fixed above). August is
  preferred on 2 briefs against the Opus estimate's 1, so H7 made no progress. With H6 counted as
  progress, this is the first round without it, and H7 is the ladder's last: tuning ends, and H8
  runs the winner. Under the strict reading it would be the second round in a row and H8 would
  wait for the owner; that reading was set aside before any spend (above).
- **The reserve stands** (5.2): `--reserve --by H7 --budget-cents 194 --overshoot-cents 39`, `R`
  **$46.60**, `T` = $100 - $21.34 - $46.60 = **$32.06**. `B` and `o` are H5's, from six Opus
  graphics: no Opus session ran in H7, and H6's one larger request came from the critic wait the
  winner never has. Time: Opus's median 337 s (H5) against 600 s.
- **Agent v7** (`agent_0183yBA1miijGFNvm5bkMv6B`, hash `b1cf0534...`), the configuration H8 runs:
  - DECIDED: `metadata.session_budget_cents` **194**, from 224, so an exam session's cap is the `B`
    the reserve holds (20 x (194 + 39)); every Opus graphic of H5 and the H6 control cost at most
    189. Revert: set 224 in `agent.md`, re-sync, and `--reserve --by H7 --budget-cents 224
    --overshoot-cents 39` (`R` $52.60).
  - DECIDED: the plumbing prompt's certificate import reads `</dev/null`, so a certutil that waits
    for input fails at once instead of holding the session for five minutes. Measured above: two
    of five Sonnet sessions hung 295 s on that line, and the agent's own `</dev/null` run imported
    all four certificates. It is plumbing, not design guidance (AC-16), and the prompt stays 15
    lines. Revert: drop ` </dev/null` from that line in `agent.md` and re-sync.
  - Read back from the server after the sync: v7, `multiagent` null, model `claude-opus-5-5` effort
    `high`, metadata `session_budget_cents` 194, the 15-line prompt with the guard, skill
    `skver_01KXt4Xf4msx422tocc44dmh` (bundle `7f130e3e...`). The next plan: everything `keep`.

## What changed in the repository

- `benchmarks/harness/lib/trace.mjs`: Sonnet 5.5's cache-read price, $0.10.
- `agents/noacg-harness/agent.md` and `claude-lock.bench.json`: v7 (above).
- `benchmarks/harness/ledger.json`: five sessions ($2.36), five $0 reference entries, the reserve
  re-recorded by H7, H7 closed.
- `benchmarks/harness/evidence/instruments.md`: entries 13 to 16.
- `evidence/phase-7/`: each cell's `cell.json`, `trace.json`, `stress.json`, and the judge's
  answers. Frames, packages, raw events and re-shots stay in `%TEMP%\noacg-harness\H7-round3` on
  this machine.
- No `cli/`, `cli/skill/`, `src/` or `api/` change.

## Checks run

`NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs --control` before the first session,
run directly after building `cli/`: CONTROL PASSED at $0. `harness-agent-sync --workspace bench`
before the round: all `keep`, compared with the server. `node --test scripts/harness-bench.test.mjs`
38 of 38 after the price change. Not checked: the Console's workspace usage against the ledger's
$21.34 (the owner's glance, asked in the pull request).
