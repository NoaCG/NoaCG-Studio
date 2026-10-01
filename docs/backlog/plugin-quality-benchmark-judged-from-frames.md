# A recurring plugin benchmark that judges taste and operability from frames

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-10. GOALS outcome 2 names "the recurring
novel-brief benchmark" as part of done for this phase.

## Why

A clean validate says a graphic plays; it says nothing about whether it looks premium or is quick
to operate. All four graphics of 2026-10-02 validated clean and two of them look ordinary. Without
a repeatable judged run, changes to the skill (`plugin-skill-has-no-design-pass.md`) cannot be told
apart from noise, and the `design-notes.md` arm `docs/AGENT_CLI.md` promised has never been run.

## What it would take

- Reuse `docs/research/plugin-graphics-quality-2026-10-02/harness/`: the briefs, the studio walk
  (`walk-studio.mjs`, Import -> production -> Playout, page and PROGRAM shots per step).
- Six briefs (the four plus two new kinds, a ticker and a full-frame result board), two arms
  (default skill, `design-notes.md` on), one fresh session per brief per arm, one at a time.
- A reviewer who did not build them judges from frames and panel shots with a written rubric
  (premium: would it air on a paid channel; operable: every live action reachable without
  scrolling or typing a label), recorded per brief in the receipt.
- **Prerequisite (needs the owner, once):** terminal Claude Code is not logged in on the owner's
  machine (`claude auth status` -> `loggedIn: false`; the desktop app holds the login), so the
  planned `claude -p --plugin-dir cli/plugin` stranger run fails with "OAuth session expired". One
  `claude login` in a terminal makes the true stranger run possible; until then the subagent method
  the research documents stands in, with its limits stated.

## Evidence

Research README: method, limits, the four judgements and the ranked failures.
