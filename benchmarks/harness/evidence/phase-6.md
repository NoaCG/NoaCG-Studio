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
