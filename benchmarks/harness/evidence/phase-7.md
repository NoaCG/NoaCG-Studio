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
