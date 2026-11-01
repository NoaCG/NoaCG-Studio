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

## 1. What changed

| Piece | Where | What it does |
| --- | --- | --- |
| Contract map | `scripts/e2e-contracts.mjs` | The six D2 contracts: proof, defect classes, faithful layers, existing checks per layer, cadence, detection, disclosed gaps, and the one backend exception. Its audit is the build refusal for Rules K1 to K4. |
| Critical journeys | `// critical: <contract>` in ten offline spec headers, read by `scripts/e2e-lists.mjs` | The critical set, distinct from the shared-change set (`// focus`, 77 specs) and inside it. |
| Quarantine incidents | `scripts/e2e-quarantine.mjs incidents`, a step in `quarantine.yml`, a line in ci.yml's plan step | Every quarantined spec as an owned incident with a repair date and its coverage gap, in one rolling issue; every run whose plan selects a quarantined spec says so. |
| Miss audit | `scripts/e2e-selection-misses.mjs` (weekly-audit.yml, unchanged step) | Red full runs on main, offline and configured, replayed against each candidate culprit's original merge-group plan; flakes kept and marked; the latest audit reset read from git; status `clean`, `misses` or `blocked`. |
| Tests | `scripts/e2e-contracts.test.mjs`, `e2e-quarantine.test.mjs`, `e2e-selection-misses.test.mjs` | One test per Rule line, named after it. |

## 2. The contract map and the two sets (acceptance a)

| Contract | Faithful layers | Critical journeys (offline, every escalation) | Other checks named |
| --- | --- | --- | --- |
| Site entry and creation | browser, deployed | `flows`, `project` | `wizard-finish`, `deploy-verify.yml` (the served build) |
| Edit, save and reopen | node, browser, configured | `production-persistence`, `storage-full`, `cross-tab` | `team-save.test`, `store-part.test`, configured `sync-one-pass-per-edit` |
| Production and playout | node, browser, configured | `production-controls`, `playout-drills` | `take-blockers.test`, `playout-session.test`, `productions`, configured `playout-resolve-race`, `take-behind-out`, `playout-switch-mid-flight` |
| Export portability | node, artifact, catalog | `exports` | `ograf-steps.test`, `ograf-conformance`, `spx-operator`, catalog `ograf-parity` |
| Graphics runtime | node, browser, catalog | `snap-recovery`, `offline` | `bundled-font-glyphs.test`, `output-font-hold`, catalog `catalog-bench`, `long-value-containment`, `stage-fit-honesty` |
| Access and durability | node, configured | none: **backend exception** | `definer-grants.test`, `client-grants-migration.test`, configured `connector-grants`, `account`, `shared-lab-computer`, `output-url-cannot-push`, `panel-lease`, `hosted-control-recovery` |

- **Two sets.** Critical journeys: 10 specs, **4.61 measured test-minutes** against the 5-minute
  target (durations table of 2026-10-19, which is stale, #1847; every member is measured). The
  shared-change set stays the 77 `// focus` specs, about 53 minutes, and still is what every
  escalation plans. Every critical journey is in it (K2), so a broad file plans every critical
  journey and nothing ci04 pinned shrinks.
- **Backend exception.** Access and durability is proved only against a real isolated database
  (grants, row-level security, leases, recovery). It runs selected on triggered PRs (ci06) and in
  full on every landing; the merge group is exempt (#1846). No test was removed or moved to meet
  the 5-minute target, and the target removes nothing (K5).
- **Not activated here.** The critical set selects nothing new: the planner plans exactly what it
  planned before (D2's "runs for every product change" is a selection widening with its own cost,
  left to a later decision: #1895). Disclosed limits: physical playout
  devices, vendor builds of third-party hosts, every design, font, viewport and browser.

## 3. Quarantine incidents (acceptance b)

- Every quarantined spec is an incident (Q1), not only critical ones: every offline spec is
  selected by some change through its header or a central rule, so each one is "currently affected"
  protection; a `covers: none` spec is still a full-run check the gate stopped reading. Critical
  journeys get a 7-day repair bound, others the existing 14 days (Q2). The owner is the plan's
  recorded owner in `growth-ceilings.json` (the coordinator until ci17 hands off), the same owner
  ci18's alarms use.
- The three live entries, read 2026-11-01, are treated as they are, not rewritten:
  `configured/late-send-abandoned` (affected, since 2026-10-28, repair due 2026-11-11, #1805),
  `configured/production-data-key-tick` (affected, since 2026-10-31, due 2026-11-14, #1874 via
  PR #1877) and `import-svg` (affected, since 2026-10-31, due 2026-11-14). None is critical.
  Open bot PR #1834 (`import-svg-corpus`) becomes an affected incident when it lands; nothing here
  edits `e2e/quarantine.json`.
- No silent replacement: a plan that selects a quarantined spec prints a `Coverage gap` warning and
  summary line on that run (Q4). The quarantine run on main still blocks nothing and is never
  counted as protection; nothing adds a retry.
- Counted under AC-4 and AC-8: the miss audit lists a quarantined spec its culprit's plan left out
  as `quarantined`, and reports `blocked` while a critical incident is open or any is overdue
  (Q5), which is what ci15 and ci16 read before any narrowing or expansion. The incident issue is
  the owned, dated action the AC-8 report names.

## 4. The miss audit and the reset (acceptance c)
