# H5 evidence: tuning round 1, the August reproduction

Phase 6 of `docs/work-specs/noacg-harness/spec.md` (AC-6, AC-16, AC-17, sections 3.8, 5.1, 5.5),
built 2026-10-15 on `origin/main` `7b25eb2a8`, on the bench workspace's key.

## Before the first session

Written and committed before any H5 session was created (5.1, AC-6).

- **Configuration.** Agent `agent_0183yBA1miijGFNvm5bkMv6B` v3 as synced (Opus 5.5, effort
  `high`, the 15-line plumbing prompt, the `noacg-graphic` skill as published at
  `skver_01X2F1VAisMcvT5tj1ZDFHpj`, no critic, web tools off), the CLI tarball of this checkout
  (with `coverage` and `record`), the session budget 224 cents from `agent.md`, the wall's margin
  the reserve's `o` of 22 cents. One session at a time.
- **Briefs.** The five library briefs of `benchmarks/agent/v1/briefs.json`, as
  `tuning/briefs.json` carries them: `news-lower-third`, `school-scoreboard`,
  `lecture-countdown`, `live-vote`, `debate-clock` (`third-party-ograf` stays out, 4.2).
- **Reference.** The August round's arm A cells of the same five briefs
  (`agent-round-2026-08-22/cells/<brief>.A`), re-captured at $0 by the bench's new `august` arm
  through the same record, coverage, validate and inspect as the harness's cells. DECIDED: arm A
  (contract-only skill, free design) because it is the configuration the August verdict kept as
  the skill's default, and one reference cell a brief keeps the subscription judging to 5 pairs.
  Revert: `--build H5 --arms august --august-config <B..E>` into the same run directory and
  judge again ($0 credit; B ran 3 of the 5 briefs, C 4, D and E 5).
- **Hypothesis.** Reproduced in the container, the August loop on Opus 5.5 delivers all five
  graphics validator-clean within the session budget, and the frozen judge does not prefer the
  August Claude Code graphic on more than half of the five briefs. Expected from August and H3:
  the missing-action fault line repeats on at least one typed-action brief.
- **Ceiling.** $15 (1,500 cents) of credit for the round, by the ledger's `usage.list_cost` sum,
  passed as `--ceiling-cents 1500`. Worst case 5 x (224 + 22) = $12.30. The wall keeps the $49.20
  exam reserve out of reach. Never topped up.
- **Signal, and how each figure is counted (fixed now, before any result):**
  - per harness cell: outcome (delivered, not ready, failed), the validator's errors, list cost,
    the bench's wall seconds, model requests, images read, the largest single request, and any
    request whose cache read falls short of the previous request's context (a lapse);
  - **missing actions**: the mechanical gate of 3.6 on `noacg inspect`'s buttons, with H1's alias
    trap handled first: an action is offered by an event of its name (any case), an
    `expect.aliases` name (`school-scoreboard`: the type's `goal` press is the brief's `flag`), or
    an event holding the action's words whole (`switchSpeaker` offers `switch`), and an event that
    is exactly another needed action counts only for that one (`clearFlag` is not a flag).
    Pinned in `scripts/harness-bench.test.mjs`; the same rule counts the reference;
  - **basic visual defects**: the frozen judge's single judgement of each delivered graphic, its
    `basicMistakes` other than `missing-action` (counted mechanically above). A defect the judge
    places only in a count-up frame shot before it settled is checked against the settled frame
    and logged in `instruments.md` (entry 1) before it is counted;
  - **the verdict against the reference**: the frozen judge, pairwise, harness against August A on
    each brief, in both orders; an answer that flips with the order is a tie. Reported as
    harness preferred, tie, August preferred;
  - **accepted** = delivered, validator clean, no missing action, judged airable alone with no
    basic visual defect; **cost per accepted graphic** = the round's credit over accepted ones;
  - **median wall time** of the five sessions against 600 s;
  - **the contact sheets** (H3's carry): whether each agent read coverage frames one by one or as
    sheets it built, and whether the judge found a defect in a frame the agent saw only on a sheet.
- **What the signal decides.** H6's variable, by 3.8's rule: **the critic** on the same briefs and
  model if any harness graphic has a basic visual defect or a missing action; **else Sonnet 5.5**
  on this configuration. Before H6 spends, `--reserve --by H5` with `m` the mean of H3's and H5's
  Opus graphic sessions and `o` raised to the largest request if any exceeds 22 cents or a lapse
  shows. The stop rule of 5.5 (two rounds in a row without progress) cannot fire on the first
  round; H5 is the baseline H6 is measured against. The round stops where it is if the ledger
  refuses a session, and a session that fails is read for its cause before it is counted
  against the model.
