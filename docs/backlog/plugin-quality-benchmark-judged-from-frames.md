# A recurring plugin benchmark that judges taste and operability from frames, per opt-in arm

**Filed:** 2026-10-02. **Source:** measurement, the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`). **Re-sorted:** 2026-10-02
against D1. The arms are the default skill and its two opt-in tools. **First full run:**
2026-10-02, receipt `docs/research/plugin-benchmark-2026-10-02/README.md`. **Owner:** an
orchestrator benchmark row, which spends a session per cell. `needs-owner: harness` for the
one-time terminal login below. Spec: `docs/work-specs/plugin-design-quality/spec.md` AC-10.
GOALS outcome 2 names "the recurring novel-brief benchmark" as part of done for this phase.

## Why

A clean validate says a graphic plays. It says nothing about whether the graphic looks premium
or is quick to operate. Under D1 the default look is the frontier model's own, so the benchmark
is how anyone learns whether that default holds the bar, and whether each opt-in tool does what
it claims when asked and nothing when not.

## The first run (2026-10-02)

Six briefs by three arms gave 18 cells, each built by a fresh session, walked in the studio and
judged by two reviewers that built nothing (one of them blind to the arm).

- **Default:** 2 of 6 would air on a paid channel, 4 borderline, none fail.
- **Critique:** best variant in 4 of 6 briefs. One regression: it added a quiz path that clips a
  long question, and validate passed it.
- **Guidelines:** followed faithfully, 0 of 6 "yes", last in 4 of 6.
- **Opt-in routing:** clean in all 18 cells.
- **Operability:** fails for action-heavy graphics in every arm, because of the control panel
  model. The receipt ranks the causes.

## When it next runs

**The next run is due when the plugin skill's next minor version (0.8.0) is cut, or on
2026-11-02, whichever comes first.** It also runs once the operator-page change
(live actions first, AC-5/AC-6; built 2026-10-02 as slice 4 of `docs/research/control-surfaces-review-2026-10-02/`) lands, because that is
the first change expected to move the operability verdict. Each run does the following:

- Keeps the six briefs, so runs can be compared.
- Adds one brief nobody has seen, so the set stays novel.
- Reruns all three arms with the same harness, prompt and rubric.
- Records totals that can be compared with the first run's (premium yes/borderline/no per arm,
  rank, operable pass, opt-in hygiene).

The orchestrator that cuts the 0.8.0 release, or the one that plans the week of 2026-11-02, puts
the run in a wave row.

## How to run it

The harness is `docs/research/plugin-benchmark-2026-10-02/harness/`: the briefs, the builder
prompt, the per-cell collector and studio walk, the transcript scan for opened files, the blind
review preparation and the rubric. Its README's Method section is the procedure.

The first run took about four hours of sequential builder time and about 3.6M builder tokens,
plus two review sessions. Cells run one at a time (one browser job per machine).

**Prerequisite (needs the owner, once):** terminal Claude Code is not logged in on the owner's
machine (`claude auth status` returns `loggedIn: false`; the desktop app holds the login). Until
one `claude login` in a terminal, the planned `claude -p --plugin-dir cli/plugin` stranger run
fails, and the subagent method stands in, with its limits stated in each receipt. Codex is
logged in on this machine and could run the same cells with `codex exec`. The first run did not
use Codex.

## Evidence

- The first run's receipt and reviews: `docs/research/plugin-benchmark-2026-10-02/`.
- The 2026-10-02 walk: `docs/research/plugin-graphics-quality-2026-10-02/README.md`.
- The D1 single-run arms: `docs/work-specs/plugin-design-quality/evidence/2026-10-02-d1-fresh-brief-runs.md`.
