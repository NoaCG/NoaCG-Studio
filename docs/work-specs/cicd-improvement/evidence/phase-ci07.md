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
- Q5. While any incident is open, the miss audit reports `blocked` and never `clean`, whatever its
  miss count: affected narrowing and expansion wait until the protection is back in the blocking
  gate (runbook, "Audit reset and coverage rules"). Corrected after review; the first wording
  blocked only critical or overdue incidents.

**Miss audit and resets (A).**

- A1. A red full run on main is replayed against the ORIGINAL selection of every candidate
  culprit landing (each landing since the previous completed full run): the plan its merge-group
  CI run printed (`plan: {...}` in the plan job's log), not today's planner.
- A2. Offline, the NEWEST candidate's plan decides alone: its merge group's tree is the failing
  commit, so an older candidate that ran the spec and passed explains nothing. Its answer, first
  match: `quarantined` (a coverage gap, Q), `full`, `selected`, else `miss`; an unread plan is
  `unknown`. Every candidate's answer is kept on the row. A spec the quarantine store knows from
  the window keeps its verdict and is marked `flake` for investigation, never dropped. Corrected
  after review; the first wording took `selected` from any candidate.
- A3. A red configured-suite run on main is replayed against the configured manifest printed by
  the culprit's PULL REQUEST run on its head (the landing's second parent), because the merge group
  skips the configured job. Each candidate was checked only on its own pull request tree, so the
  verdict is `selected` only when every candidate selected the spec; one that left it out makes a
  `miss`; then `unknown`, then `no-selection` (a culprit that landed before ci06 carries no
  manifest: no pre-merge configured check existed), then `quarantined`.
- A4. A first-parent landing on main is an audit reset when its diff touches selector code
  (`SELECTION_CODE`), adds or removes a `// focus` or `// critical:` header line in a spec, or one
  of its commits carries a `Selection-audit-reset: <reason>` trailer. The reset names its class
  and files or reason.
- A5. The audit reports the latest reset (commit, time, reason) and the days since it. Its status
  is `clean` only with no miss, no unknown and nothing blocking (Q5); the day count is reported,
  never read as qualification.

### Rules found after coding

The `/check` review, the PR's automated review and the first `/so` (section 6) found these; each is
folded into the line it belongs to and tested:

- A2 (first `/so`): the newest candidate decides an offline verdict; configured needs every candidate.
- Q5 (first `/so`): any open incident blocks, not only critical or overdue ones.
- A3 (PR review): a configured run merges its verdict log's full failure set with its annotations,
  which stop at a few specs.
- Q3 (PR review): the incident report reads the store strictly, so a missing store throws instead
  of reading as "no incident" and closing the issue.

- A2: a full plan still leaves quarantined specs out of its shards, so `quarantined` is read before
  `full`.
- A1 and A2: an API read that fails throws (`ghStrict`), so an unread run list or failure set is
  `unknown`, never "nothing red"; an unread failure set does not reset what was already failing;
  runs from two days before the window are read as context, so the first judged run is not charged
  with failures it inherited or given a candidate range it cannot know.
- A3: configured failures are judged against the pull request's run, not the merge group's plan.
- A4: `SELECTION_CODE` holds only files that decide selection (the quarantine split is in the
  planner; critical membership is the header lines).
- Q3 and Q4: a report never blocks: the plan step states gaps even when the incidents cannot be
  read, and the incidents step in `quarantine.yml` cannot skip the quarantined-spec runs.

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
  as `quarantined`, and reports `blocked` while any incident is open (Q5), which is what ci15 and
  ci16 read before any narrowing or expansion. With today's three incidents the audit reads
  `blocked`. The incident issue is
  the owned, dated action the AC-8 report names.

## 4. The miss audit and the reset (acceptance c)

### The latest audit reset

`node scripts/e2e-selection-misses.mjs resets --ref origin/main` at this row's base reads:
**`26095c826f1a0ee910d17070d42026a841b9f284`, 2026-10-31T21:15:44Z (ci06 merge), reason
`selector code: scripts/e2e-affected.mjs, scripts/e2e-lists.mjs`.** ci18 (`fb15e6b8`) touched no
selector code or membership line.

**This row's own merge is the next reset:** it changes `scripts/e2e-lists.mjs` (header
interpretation) and adds ten `// critical:` lines (critical/shared membership). The tool reads it
from git once it lands, so the two-week comparison starts at this PR's merge commit; the checker
confirms it with the same command on `main`.

### Replay of existing full-main failures

Every red full run on `main` from 2026-09-20 to 2026-11-01 (42 days: `ci.yml` and
`configured-suite.yml` push runs), replayed with the final code in 2-day passes of at most 100 API
calls, then 1-day re-passes where a pass spent its budget (2,100 calls in all). **Every row, with
its run, culprits and each culprit plan's answer, is in
[phase-ci07-replay.json](phase-ci07-replay.json).** 185 failing items:

| Workflow | Verdict | Items |
| --- | --- | ---: |
| ci.yml | miss, flake-marked | 35 |
| ci.yml | miss, not flake-marked | 10 |
| ci.yml | selected by the newest culprit's plan, flake-marked | 4 |
| ci.yml | not-a-spec (Build, Factory gates, a lost shard, the retry job) | 17 |
| configured-suite.yml | no-selection (culprit landed before ci06: no pre-merge configured check existed) | 73 |
| configured-suite.yml | miss | 1 |
| configured-suite.yml | not-a-spec | 11 |
| configured-suite.yml | unknown (budget spent, see below) | 34 |

**The misses:**

- **35 flake-marked**: the quarantine store records the spec (by file name) entering or leaving
  with a fail-then-pass on one commit inside the pass's window. That record is per spec, not per
  run, so it classes them; it does not prove each one. The diffs sampled (b5652ae6, 0df77f74,
  af39c249, 081b42af..a1c9efb5, ec723a49) are docs, plan or quarantine-only landings that cannot
  reach the spec. They are the quarantine's coverage gaps that ci07 now makes incidents, not
  selection misses; a per-run proof of each is not claimed.
- **4 of the 10 unmarked are flakes the window's flake set missed**: `editor-arrangement` (76afb8cb)
  and `editor-groups` (742a5a65) were quarantined and released before their window,
  `import-svg-corpus` (0df77f74, a docs landing) is the fail-then-pass bot PR #1834 is quarantining,
  and `video-hyperframes` (a2523f82 `.gitignore`, aa2717b3 docs) failed on landings that cannot
  reach it.
- **6 of the 10 are real selection misses, all corrected before the latest reset**:
  `editor-fidelity-trim` at 5619f765..45ec97b2 (#927, the miss the old weekly audit found) and at
  14c0a5a5 (`svgFit.js`), `public-chrome-baseline` at 20367f21 (a `docs/whats-new` page) and at
  20bda886..7c59efcb (`docs.html`), `downloads` at 92c8a616 (`index.html`) and
  `editor-cli-round-trip` at 7009ebbb..84a10763 (`src/model/importTemplate.ts`). Today's planner
  selects each for its culprit's files (`planFor` on the same files), so each mapping was corrected
  after the miss, before 26095c82.
- **The configured miss**: `connector-grants` at run 41247602152. The newest culprit d06974d3 is a
  quarantine-only landing that left it out; the run also lost a shard (118 of 133 tests, #1865), and
  every configured run on main after it is green. Infrastructure, not selection.
- **The 4 flake-marked `selected`**: run before merge on the failing tree by the newest culprit's
  plan and passed there; flakes, not misses. (Under the first, wrong attribution rule 7 items read
  `selected`; the 3 with several candidates are misses under the corrected A2 and are flake-marked.)

**No unexplained offline miss in the replayed window.** That is necessary, not proof of
completeness; the full runs on `main` stay. Limits, stated: the **34 configured `unknown` items**
are from 2026-10-03 to 2026-10-05, when the configured suite was red on 17 runs in a day and the
passes ran out of calls reading their logs. They landed before ci06, so no pre-merge configured
check existed and none could read `selected`, but they are left unread rather than called
`no-selection`. A red run's failing specs come from check annotations and, for configured runs,
the verdict log; a failure that names nothing is `not-a-spec`. Job logs expire after 90 days.

### Continuing comparison

The weekly-audit step now runs this audit every week on the last 7 days: offline and configured
red runs against their culprits' original plans, the latest reset and the days since it, and the
quarantine incidents, with status `clean`, `misses` or `blocked`. That is the paired comparison
AC-4 asks for over at least two weeks after the last reset; ci15 reads it. No duplicate shadow
run was added.

## 5. Mutation check

Each Rule line broken alone in the code, with its tests run: all 27 mutations fail their named
test. The list, with the exact replacement for each, is
[phase-ci07-mutations.json](phase-ci07-mutations.json), so a reviewer can re-apply any of them.

## 6. Verification

- `/check`: the review returned 10 findings, all confirmed and fixed (section "Rules found after
  coding"; the evidence gaps it found are this section and the ones above). Simplify (four
  reviewers): one strict `gh` reader in `ci-failure-set.mjs` instead of a copy, the backend
  exception derived from its configured checks, one `unknown` state, the durations table's own
  reader, one git helper, the configured log read only when annotations named no spec, the plan
  step skipping its gap check when nothing is quarantined. Skipped, with reasons: one shared
  rolling-issue helper for `stale` and `incidents` (it would change the existing stale issue's
  search and wording, outside this row), folding the stale issue into the incident issue (removes
  an existing alarm), `mainPushRuns` for the run list (it has no window or pagination), batching
  git calls in `latestReset` (it stops at the first reset, a few landings back).
- `node --test` over the selector, quarantine, contract, capacity and failure-set tests: all pass.
- `npm run gates -- run --changed origin/main`: all pass (one `windowsHide` finding fixed first).
- `npx eslint scripts/ --max-warnings 0`, `node scripts/check-workflows.mjs` (24 valid),
  `node scripts/check-e2e-protection.mjs --changed origin/main` (10 header edits, no protection
  removed): clean.
- No browser suite run here: the spec edits are header comments, and CI's plan for this PR runs
  the specs it selects (it changes `e2e-lists.mjs` and ci.yml, so the shared-change set and the
  whole configured set).

## 7. Phase notes

- Previous verified main: `fb15e6b8f6358ef8b0fad080cf71552b4da37187` (ci18 merge).
- Revert: `git revert -m 1 <this PR's merge commit>`, landed through `/queue-merge`. It removes
  the critical lines, the contract map, the incident issue step, the coverage-gap line and the
  audit changes together. The revert also changes `e2e-lists.mjs`, so it is itself a reset.
- Decisions: critical membership lives in each spec's header, the contract map in one module
  (the build refuses a mapped check that leaves the disk); the critical set selects nothing new
  (#1895); every quarantined spec is an incident, critical ones on a 7-day bound; the incident owner
  is the plan's recorded owner; original plans come from CI logs, not today's planner; resets are
  read from git, with a commit trailer for the classes files cannot show.
- Traps for later rows: a PR that corrects a mapping after a miss must carry a
  `Selection-audit-reset: <reason>` trailer in one of its commits, or the audit will not see the
  reset. Job logs expire after 90 days, so an original plan older than that reads `unknown`.
  ci08 to ci10 changing `// focus` or `// critical:` lines, or selector code, reset the window.
  `scripts/e2e-traced.json`, `e2e/quarantine.json` and `scripts/e2e-durations.json` are untouched
  (bot PRs #1840, #1834, #1503).
