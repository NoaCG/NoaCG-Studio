# H6 evidence: tuning round 2, the fresh-eyes critic

Phase 7 of `docs/work-specs/noacg-harness/spec.md` (AC-6, AC-16, AC-17, sections 3.4, 3.8, 5.1,
5.2, 5.5), built 2026-10-15 on `origin/main` `384f0eff2`, on the bench workspace's key.

## Before the first session

Written and committed before any H6 session was created (5.1, AC-6).

- **The variable: the critic** (3.8). H5 delivered one basic visual defect (the live vote's rows
  overlap after an Update to long options), so round 2 measures the fresh-eyes critic of 3.4 on
  the same five briefs and the same model. Nothing else about the author changes.
- **Issue #1246 decided: fixed before the round, with a control.** Without it the critic could not
  have seen H5's defect: in the container the author's `noacg coverage` runs without the brief's
  stress values and grew a `Label | value` line at its number (`52 Yes`), so no frame the author
  or a critic gets shows a long option. A critic that missed the live vote would have measured the
  matrix, not the critic. The fix (`fc693944f`) grows the label, to at least 32 characters, and
  keeps the value. Measured at $0 with the fixed CLI: the H5 live-vote package's own Update frame
  now shows every option wrapping (before: three one-line rows), and the shipped poll scaffold's
  long frames show long options with its panel growing. Because the fix changes what the author
  sees too, one variable per round needs a control on the new CLI:
  - The fix changes coverage only for a lines field with `|`. Among H5's ten cells only the two
    live-vote packages have one (each cell's `coverage.json` read): for the other four briefs
    H5's sessions see the same matrix under either CLI and stay the no-critic arm.
  - **Control:** agent v3 (H5's configuration exactly: no critic, the H5 skill version) on the new
    CLI, on `live-vote` only, budget 224 cents. It says what the fix alone does to H5's defect.
  - After the round, every critic-arm package is read for a `|` lines field; one outside
    `live-vote` is named here, since its author saw a matrix H5's did not.
- **Configuration.** Agent `agent_0183yBA1miijGFNvm5bkMv6B` **v4**: v3's model (Opus 5.5, effort
  `high`), toolset and plumbing prompt, plus one prompt line (ask the `critic` agent after the
  coverage, fix what the frames confirm, validate and record again; 16 of 25 lines) and the
  `multiagent` block of D4 (the critic the only predefined subagent; inline agents, workflows and
  the advisor off). The critic: `agent_01HSHf5nbrnRVkTx591MJNJj` v1 (`agents/noacg-harness/critic.md`),
  Opus 5.5 at `high`, the same container and skill, no write or edit tool, a 5-line plumbing prompt
  that points at the skill. The skill version `skver_01KYSyzgjnYhPv8QF7rEXUjT` adds "The fresh-eyes
  review" to `references/critique.md` (six pass-or-fail inspection questions with the frame named,
  replacing that file's own auto-fit and operability questions); `SKILL.md` keeps it opt-in, so the
  author is not told to read it. The CLI tarball of this checkout, with the #1246 fix. One session
  at a time.
- **Briefs.** The same five v1 library briefs as H5: `news-lower-third`, `school-scoreboard`,
  `lecture-countdown`, `live-vote`, `debate-clock`.
- **Reference.** The August A cells, re-captured at $0 into the same run directory
  (`--arms managed-agents,august`), so every pair is judged on one capture.
- **Session budget.** DECIDED: 300 cents for a critic session, the 224 of `agent.md` plus 76 for the
  critic's thread, because a session budget is one cap shared by every thread, and H5's dearest
  author ($1.89) plus a critic reading 30 to 70 frames would otherwise stop at 224 for the budget
  rather than for anything the critic did. The author's own room is H5's; no H5 session came near
  224. The control runs at 224. Revert: `--budget-cents 224`.
- **Hypothesis.** With the critic, no delivered graphic has a basic visual defect or a missing
  action, and the frozen judge prefers August A on fewer briefs than H5's 2. Expected: the critic
  costs 30 to 70 cents a graphic and adds one to three minutes.
- **Ceiling.** $15 (1,500 cents) for the round, critic cells and control together, by the ledger's
  `usage.list_cost` sum, passed as `--ceiling-cents 1500`; the wall's margin is the reserve's `o`
  (39) and `--critic-cents 22` for the second thread. Expected about $10 (H5's mean $1.25 plus the
  critic, five times, and the control at about $1.15). The worst case of six sessions at their caps
  is over the ceiling, so the wall refuses a session that the ceiling cannot cover: critic cells run
  first, the control last. The $46.60 exam reserve is out of reach.
- **Signal, and how each figure is counted (fixed now, before any result).** As H5 counted, so the
  rounds compare:
  - per cell: outcome, validator errors, the session's list cost and the critic thread's own,
    the bench's wall seconds, model requests and images read per thread, each thread's largest
    request, and any request whose cache read falls short of the previous request's context;
  - what the critic did: asked or not, how many times, each finding and whether the author changed
    the package for it, and any finding the picture does not bear out;
  - **missing actions**: H5's mechanical gate with the alias and word rule;
  - **basic visual defects**: the frozen judge's single judgement, `basicMistakes` other than
    `missing-action`;
  - **the verdict against the reference**: the frozen judge, pairwise against August A in both
    orders, an order flip a tie. Before any pair is judged, each pair's two `coverage.json` Update
    ops are compared; where they updated different kinds of field, each arm is re-shot with the
    other's Update and the re-shot frames are what decide a defect there (`instruments.md` entry 9);
  - **accepted** = delivered, validator clean, no missing action, judged airable alone with no basic
    visual defect; **cost per accepted graphic** = the critic arm's credit over its accepted
    graphics, against H5's **$1.56**;
  - **median wall time** of the five critic sessions against 600 s;
  - the control: its single judgement, defects and missing actions, and what its own coverage
    showed.
- **What the signal decides** (3.4, 5.5):
  - **The critic stays** only if the critic arm delivers fewer graphics with a basic defect or a
    missing action than H5 (1) **and** its cost per accepted graphic is at most H5's $1.56. Fewer
    defects at a higher cost per accepted graphic drops it: that is "a cost that rises more than it
    saves". If the control alone already clears the live vote, the critic's live-vote result counts
    for the fix, not for the critic.
  - **Progress for the stop rule** (two rounds in a row without it stop the run): a lower cost per
    accepted graphic than $1.56, or the judge preferring August A on fewer briefs than 2.
  - **H7's rung** (3.8, 5.1): Sonnet 5.5 on the configuration that won (v4 with the critic if it
    stays, else v3's configuration with the fixed CLI).
  - If the critic stays: `--reserve --by H6` with `m` re-measured over both threads, the critic's
    share its largest request, and the time re-checked against 600 s. If it is dropped, the reserve
    stands.

## During the round: two briefs cut to keep the control

Written after the first critic session and before any further session was created.

- **The first critic session reached its 300-cent cap.** `news-lower-third` (`sesn_01AmXzxaKVhdWgF2HpPNkHFX`):
  $3.04, 666 s, not ready (`budget_reached`). The critic thread alone cost **$1.68** (35 requests,
  43 images, 403 s): it read the frames one by one, as the review asks, and shot nine frames of its
  own. The author waited 350 s for its answer, past the cache's five minutes, and its next request
  rewrote the whole context ($0.41, the round's largest so far). The critic would air the graphic for
  the brief's values and raised three design findings, which the author was repairing when the cap
  stopped it.
- **What that settles, and what it does not.** The critic's thread alone costs more than H5's whole
  cost per accepted graphic ($1.56), so the rule fixed above drops this critic whatever the other
  briefs show. What is still open is the question the round exists for: does it catch the basic
  defect H5 shipped, and does the coverage fix alone already catch it.
- DECIDED: run the critic on `live-vote` and finish `school-scoreboard` (its session was already
  working), skip `lecture-countdown` and `debate-clock` in the critic arm, and keep the control.
  Run as planned, four capped critic sessions would have left the ceiling unable to admit the
  control, and the live-vote reading would be uninterpretable without it. The run was stopped
  while the scoreboard session worked (stopping between sessions could have created one untracked)
  and resumed with `--adopt`, which takes over that session instead of creating it again. Revert:
  `--build H6 --briefs lecture-countdown,debate-clock` with the same flags, within what the ceiling
  then admits.

## Outcome

**The critic is dropped; the coverage fix carried the round.** Three critic sessions all stopped at
their 300-cent cap, so the critic arm delivered nothing it would call ready: it has no cost per
accepted graphic to set against H5's $1.56, and the rule fixed before the round drops it. The
graphics it left were good: the frozen judge called all three airable with no basic mistake and no
missing action, preferred them to August A on two briefs and tied the third. The no-critic control
on the fixed CLI delivered the live vote for **$0.91** in 265 s, airable with no defect, preferred
to August A and to the critic arm's live vote. H5's one defect is gone, and the control shows the
fix removed it, not the critic. **$10.08** of the $15 ceiling.

The hypothesis, part by part: no delivered graphic has a basic defect or a missing action (held for
what was judged, but the critic arm delivered nothing); the judge prefers August A on fewer than 2
briefs (held: 0 of the 3 judged); the critic costs 30 to 70 cents and adds one to three minutes (did
not hold: $1.31 to $1.68 and four to seven minutes, with the author idle while it worked).

## The sessions

Through `scripts/harness-bench.mjs --build H6`, one at a time: critic sessions on agent v4 at 300
cents, the control on v3 at 224. Figures from each thread's own events (`evidence/phase-6/<cell>/`
`trace.json`, whose `threads` hold the critic's).

| cell | session | list cost (critic) | wall | idle at | critic asked / answered | requests author + critic | images author + critic | largest request author / critic | min cache read author / critic | longest gap author |
|---|---|---|---|---|---|---|---|---|---|---|
| news-lower-third | `sesn_01AmXzxaKVhdWgF2HpPNkHFX` | $3.04 ($1.68) | 666 s | 641 s, `budget_reached` | 198 s / 594 s | 25 + 35 | 6 + 43 | **$0.4105** / $0.1171 | **0** (one lapse) / 99.933% | **350 s** |
| school-scoreboard | `sesn_01Ccy1tC9AveD9cotErFmeNL` | $3.01 ($1.31) | 935 s | 885 s, `budget_reached` | 542 s / never | 36 + 31 | 17 + 94 | $0.1501 / $0.0968 | 99.959% / 99.936% | 59 s |
| live-vote | `sesn_01A9izerMfy6r4kAVYWgaDBQ` | $3.12 ($1.39) | 705 s | 678 s, `budget_reached` | 385 s / 651 s | 37 + 25 | 21 + 40 | $0.1419 / $0.1345 | 99.959% / 99.935% | 289 s |
| live-vote, control (v3) | `sesn_01Y8aPDLThzBv1Di459FWMJL` | $0.91 | 265 s | 242 s, `end_turn` | - | 21 | 12 | $0.1058 | 99.927% | 28 s |

- **Where the money went.** The critic threads cost $4.38 of the arm's $9.17 (48%). Each read the
  frames one by one, as the review asks, and two shot frames of their own (nine on the news lower
  third, more on the live vote). Each author thread cost $1.36 to $1.73, more than its H5 session
  ($0.99, $1.33, $1.15): it waited, then read the critic's long answer into a large context.
- **The one cache lapse.** The news lower third's author waited 350 s for the critic, past the
  cache's five minutes, and its next request rewrote its whole context: **$0.41**, above the
  reserve's `o` of $0.39. The live vote's author waited 289 s, 11 s inside the lifetime. Both come
  from waiting on the critic, which the winning configuration never does, so `o` stays (below).
- **What the critic found.** News lower third: it would air the graphic for the brief's values and
  raised three design findings (the panel keeps its full width after a wrap); the author was
  repairing them at the cap. Scoreboard: the budget stopped the critic before it answered (94
  images read). Live vote: one blocker, the LEADING chip clipped to "LEADINC" with five options and a
  decimal leader, a state no frame of the matrix shows; re-shot from the delivered zip, it is real
  (`instruments.md` entry 12, issue #1251). The answer arrived 27 s before the cap. No finding was
  contradicted by its picture.
- The scoreboard's wall counts from its creation: the run was stopped and resumed around it
  (above). Cleanup: every session and its outputs gone (`cleanup gone` in each cell). No package
  outside `live-vote` has a `|` lines field, so the fix changed no other brief's matrix.

## The verdict

Frozen judge `claude-fable-5-1` (fingerprint `60bfb08e18a4`), every cell's full matrix, answers in
`evidence/phase-6/judgements.jsonl`. Update ops compared first (`instruments.md` entry 11): no
defect hides in a state either arm was not put in.

| brief | harness alone | August A alone | pair (both orders) |
|---|---|---|---|
| news-lower-third (critic) | airable | airable | **tie** (each order preferred the first shown: a flip) |
| school-scoreboard (critic) | airable | not airable (no flag, clear or final) | **harness**, high |
| live-vote (critic) | airable | airable | **harness**, medium |
| live-vote (control) | airable | airable | **harness**, medium |
| live-vote, critic against control | | | **control**, medium, both orders |

- **Basic visual defects** (the judge's singles): 0 in all four harness cells. **Missing actions**
  (the mechanical gate): 0; August A's scoreboard misses `flag`, `clearFlag`, `final`, as in H5.
- **Accepted**: critic arm **0 of 3** (all not ready at the cap); control **1 of 1**.
- **Median wall**: critic arm **705 s**, over the 600 s target; control 265 s.
- **Judging**: 17 answered `claude -p` calls (7 single, 10 pair orders), **$50.90** notional on the
  subscription, no pause, $0 credit.

## What it decides

- **The critic stays off** (3.4): it removed no defect the fix did not, and its thread alone cost
  more than H5's whole cost per accepted graphic. `agent.md` and `critique.md` (both copies) are back
  to their H5 text, since the fresh-eyes review earned nothing that ships (AC-16), and `critic.md` is
  removed; the sync made **v5**, whose definition hashes as v3's (`c47526c8...`), with a new skill
  version of the same bytes. The CLI fix stays, on its measurement above. Revert: re-apply the
  critic commit (`c9f1a27f7`) and re-sync.
- **Progress, for the stop rule (5.5): yes, from the fix, not the critic.** The configuration that
  won is H5's with the fixed CLI. Its tuning-set estimate is H5's four sessions on the briefs the fix
  does not touch plus the control: **5 of 5 accepted, $6.00, $1.20 per accepted graphic** (against
  $1.56), the judge preferring August A on **1** brief (the debate clock, H5's answer) against 2. One
  live-vote sample carries the change; the count of rounds without progress does not start here, and
  if H7 shows none, it is one.
- **H7's rung** (3.8, 5.1): **Sonnet 5.5 on agent v5** (no critic, the fixed CLI), the same five
  briefs and the same August A reference, run as `--model claude-sonnet-5-5` on the synced agent.
  Its signal is measured against that Opus estimate ($1.20; harness 3, tie 1, August 1).
- **The reserve stands** (5.2): the critic is not kept, so there is no critic share. `m` stays H5's
  $1.29 and `o` $0.39, since the one larger request came from the critic wait; H7 sets `B` and `o`
  for the winner anyway. `T` = $100 - $18.98 - $46.60 = **$34.42**: one $15 round (H7) and $19.42
  over.

## What changed in the repository

- `cli/src/coverage.ts`: a `Label | value` line grows its label (#1246), with its test.
- `scripts/harness-agent-sync.mjs`, `benchmarks/harness/lib/agent-def.mjs`: an agent may list
  subagent files beside it; the sync creates each before the agent and pins its version (D4), and
  drops one the agent no longer lists from the lock.
- `benchmarks/harness/lib/arms.mjs`: each child thread's events, usage and largest request kept
  beside its session. `scripts/harness-bench.mjs`: `--agent-version` (a round's control as its own
  arm) and `--adopt` (take over a session a stopped run left working).
- `agents/noacg-harness/claude-lock.bench.json`: v5. The critic's definition and its skill text were
  on the branch for the round and are back to H5's.
- `benchmarks/harness/ledger.json`: four sessions ($10.08), three $0 reference entries, H6 closed.
- `evidence/phase-6/`: each cell's `cell.json`, `trace.json`, `stress.json`, and the judge's answers.
  Frames, packages, raw events and re-shots stay in `%TEMP%\noacg-harness\H6-round2` on this machine.

## Checks run

`node --test scripts/harness-bench.test.mjs` 36 of 36; `node --test cli/test/coverage.test.mjs` 9 of
9; eslint clean on the changed scripts; `NOACG_URL=https://noacg.studio node scripts/harness-bench.mjs
--control` before the first session: CONTROL PASSED at $0; `harness-agent-sync --workspace bench`:
v4 read back with the critic pinned and v3 with no `multiagent`, then v5. Not checked: the Console's
workspace usage against the ledger's $18.98 (the owner's glance, asked in the pull request).
