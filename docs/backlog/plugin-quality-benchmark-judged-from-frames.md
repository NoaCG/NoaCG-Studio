# A recurring plugin benchmark that judges taste and operability from frames, per opt-in arm

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`). **Re-sorted:** 2026-10-02
against D1: rewritten. The arms are now the default skill and its two opt-in tools, not "default
versus design notes". **Owner:** an orchestrator benchmark row (it spends a session per cell);
`needs-owner: harness` for the one-time terminal login below. Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-10. GOALS outcome 2 names "the recurring
novel-brief benchmark" as part of done for this phase.

## Why

A clean validate says a graphic plays; it says nothing about whether it looks premium or is quick
to operate. Under D1 the default look is the frontier model's own, so the benchmark is how anyone
learns whether that default holds the bar, and whether each opt-in tool does what it claims when
asked and nothing when not. The D1 row ran one fresh brief per arm as a first check
(`docs/work-specs/plugin-design-quality/evidence/2026-10-02-d1-fresh-brief-runs.md`); one run per
arm cannot be told apart from noise.

## What it would take

- Reuse `docs/research/plugin-graphics-quality-2026-10-02/harness/`: the briefs, the studio walk
  (`walk-studio.mjs`, Import -> production -> Playout, page and PROGRAM shots per step).
- Six briefs (the four plus a ticker and a full-frame result board), three arms (default,
  "critique and improve" asked for on the default arm's package, guidelines switched on), one
  fresh session per brief per arm, one at a time.
- A reviewer who did not build them judges from frames and panel shots with a written rubric
  (premium: would it air on a paid channel; operable: every live action reachable without
  scrolling or typing a label; opt-in: did the arm change what it claims to, and did the default
  arm open neither opt-in file), recorded per brief in the receipt.
- **Prerequisite (needs the owner, once):** terminal Claude Code is not logged in on the owner's
  machine (`claude auth status` -> `loggedIn: false`; the desktop app holds the login), so the
  planned `claude -p --plugin-dir cli/plugin` stranger run fails with "OAuth session expired". One
  `claude login` in a terminal makes the true stranger run possible; until then the subagent method
  the research documents stands in, with its limits stated. Codex is logged in on this machine and
  can run the same cells with `codex exec`.

## Evidence

Research README: method, limits, the four judgements and the ranked failures; the D1 receipt
above for the three single-run arms and the four Codex switch probes.
