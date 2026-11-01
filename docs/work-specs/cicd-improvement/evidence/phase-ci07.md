# Phase ci07: critical and shared sets, quarantine incidents, the miss audit

Row ci07 of the [cicd-improvement spec](../spec.md) (P2; AC-3 and AC-4 inventory). Built
2026-11-01 by the ci07 builder (Claude Code Cloud worker of plan run #1842) from `main` at
`fb15e6b8f6358ef8b0fad080cf71552b4da37187` (ci18 merge).

## Rules

Three rule families, written before the code. Each line has one test named after it
(`Rule K1: ...` and so on) and each test fails when its line is broken (mutation-checked, section 5).

**Contract map and critical set (K).**

- K1. A spec is a critical journey only through a `// critical: <contract>[, <contract>]` line in
  its own leading header. A malformed line, or a contract id the map does not define, fails the build.
- K2. Every critical journey is also in the shared-change set (`// focus`). A critical spec without
  it fails the build, so every escalation (broad file, CORE, unmapped path, stale map) still plans
  every critical journey and the critical set never shrinks what ci04 pinned.
- K3. Each of the six D2 contracts names its faithful layers and at least one existing check for
  each. A named check missing from disk fails the build, so a mapped check cannot be deleted
  without changing the map in the same pull request.
- K4. Each contract has at least one critical journey, or a backend exception naming the
  configured specs that carry it, where they run and why the offline set cannot. A configured
  spec named there must exist. An exception removes no test.
- K5. The critical set's measured minutes are reported against the 5-minute target from the
  durations table. An unmeasured member is reported as unmeasured, never as 0, and the target
  never removes a member.

**Quarantine incidents (Q).**

- Q1. Every quarantined spec is an incident: severity `critical` for a critical journey, `affected`
  for every other spec (the planner selects it for the changes its header or a central rule maps,
  and the full run on main is what it protected).
- Q2. An incident has an owner (the plan's recorded owner in `scripts/growth-ceilings.json`), a
  repair due date (critical: 7 days after it entered; affected: 14, the existing stale bound) and
  a stated coverage gap (the contracts it served, or its covers). Past its due date it reads `overdue`.
- Q3. The quarantine run on every push to main keeps the incidents in one rolling issue, opened
  when the first incident exists and closed only when the store holds none. A store or issue it
  cannot read never closes the issue.
- Q4. A plan that selects a quarantined spec (offline or configured) states it on that run as a
  coverage gap naming its severity, and adds no retry and no nonblocking run counted as a pass.
- Q5. While a critical incident is open, or any incident is overdue, the miss audit reports
  `blocked` and never `clean`, whatever its miss count.

**Miss audit and resets (A).**

- A1. A red full run on main is replayed against the ORIGINAL selection of every candidate
  culprit landing (each landing since the previous completed full run): the plan its merge-group
  CI run printed (`plan: {...}` in the plan job's log), not today's planner.
- A2. Per failing spec: `full` when a candidate's plan ran everything; `selected` when a candidate's
  plan selected it; `quarantined` (a coverage gap, Q) when a plan left it out as quarantined;
  `miss` when every candidate's plan was read and none selected it; `unknown` when none selected
  it and a plan could not be read. A spec the quarantine store knows from the window keeps its
  verdict and is marked `flake` for investigation, never dropped.
- A3. A red configured-suite run on main is replayed the same way against the configured manifest
  in that printed plan. A culprit whose plan carries no manifest (it landed before ci06) is
  `no-selection`: no pre-merge configured check existed, so it is listed and never `selected`.
- A4. A first-parent landing on main is an audit reset when its diff touches selector code
  (`SELECTION_CODE`), adds or removes a `// focus` or `// critical:` header line in a spec, or one
  of its commits carries a `Selection-audit-reset: <reason>` trailer. The reset names its class
  and files or reason.
- A5. The audit reports the latest reset (commit, time, reason) and the days since it. Its status
  is `clean` only with no miss, no unknown and nothing blocking (Q5); the day count is reported,
  never read as qualification.
