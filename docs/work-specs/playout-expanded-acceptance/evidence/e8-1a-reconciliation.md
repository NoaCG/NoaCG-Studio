# E8.1a and E8.2: reconciliation of every required criterion, and the verdict on the agent evidence

Row 43 of the production-page run (E8.1a, project phase 48) wrote this record as E8 AC-1's
software part; row 45 (E8.2, project phase 50) brought it up to date through phase 49 and added
the verdict below. It lists every required criterion of the parent baseline phases, Q's records,
the data, Sheet and audience records, and the child specs (H0, E1 to E8, L1, L2), each with the
evidence that passed it or an open finding. It is not E8's final verdict: the final owner block
(H0.2 and S) adds the physical receipts and closes AC-1 in S's `final-acceptance.md`. Nothing
that only H0.2 or S can pass is counted as passed here.

## E8.2: the verdict on the agent evidence (row 45)

**Every required criterion an agent can pass has criterion-level evidence or an explicit open
finding, through phase 49.** Rows 1 to 44 are 49 project phases with 49 `phase <n> pass` entries
in the run's ledger, each the independent checker's verdict on its merge SHA with a per-criterion
evidence list (the table at the end). Row 45's own criteria (E8 AC-1's agent part, AC-3's kit,
AC-4) are this row's merge and its checker's entry; they cannot cite themselves here.

- **What is owed, and never counted as passed.** H0.2: H0 AC-1's guide walk on the archive
  actually installed, H0 AC-4, E6 AC-4 and the deck's end of L1 AC-8. S: parent AC-14's real
  outputs, data AC-16's actual outputs, E3 AC-2 and E7 AC-4 on the real studio, E8 AC-2's and
  AC-3's physical part (the 30-minute dress rehearsal with L1 AC-11's quiz-and-score case and L2
  AC-11's adjustment case), the physical checks of #1618, #1657 and #1746, and E8 AC-1's final
  reconciliation with H0.2's and S's receipts. Provider qualification: the official election
  feed, a separate verdict, never simulated.
- **The classes stay apart** (table below): software rehearsal (SW), Q's dated provider records,
  laptop scratch walks (LW, non-gating, each bound to its SHA, none on the final candidate), trial
  kits (KT: four landed, none run; a trial's result is reported, never required), real-studio
  outputs (RS: none yet) and provider qualification (PQ: none). Session success, a green group or
  a package build is not counted as evidence: each pass cites the checker's entry and its runs.
- **Reuse for rows 43 to 45.** Rows 43 and 44 passed on `132bd5b` and `f0adf9b`. `main` at
  `c6fc146` differs from `f0adf9b` only in `docs/work-specs/cicd-improvement/` and
  `.agent-workflows/plan-run.md`, which no criterion depends on, so every SW criterion's evidence
  carries to it under parent §6. Row 45 changes documents, plus the Companion module's `HELP.md`
  and its guide test (a wrong step found while checking the runbook): that touches no `src/`,
  `e2e/`, `scripts/` or `package.json`, so nothing SW goes stale; it does touch H0 AC-1's guide,
  whose walk is H0.2's anyway.
- **The Companion archive** (O-3): 0.2.0 was built and hashed on this row's worker, imported into
  a scratch Companion 5.1.0 and listed at that version
  ([`e8-2-guide-check.md`](e8-2-guide-check.md)). The build is not byte-reproducible, so H0.2
  must still build, hash and record the archive it installs from the final candidate.
- **Open findings** that no criterion's text fails but an operator must know are in the
  [capability matrix](../capability-matrix.md) with what to do meanwhile; the runbook repeats the
  ones that change what is on air. The three the owner named (#1795, #1797, #1798) are open on
  `c6fc146` and listed there.
- **AC-3's kit** is [`trial-kit.md`](trial-kit.md), with L1 AC-11's two-graphic task (task 6)
  and L2 AC-11's adjustment task (task 7), on the owner list (#1553). **AC-4** is the
  [runbook](../runbook.md) and the [matrix](../capability-matrix.md), checked against the build in
  [`e8-2-guide-check.md`](e8-2-guide-check.md).

## Sources and candidate

- **Candidate:** `main` at `3b871c3dd994d3a096210d3d22672d9552272ef4` (rows 1 to 42 landed, then
  two quarantine-list PRs, #1788 and #1789), plus this row's merge. On `3b871c3`: CI push
  [40667727844](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40667727844) success,
  configured-suite [40667728066](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40667728066)
  success, Quarantine 40667727951 success (it runs the two quarantined specs, `import-svg` and
  `rundown-history`, on every push), Post-landing 40667728080 success.
- **E8.2's update:** `main` at `c6fc146b8807f629645c980d75fa53735dd0453d` (row 43 landed as `132bd5b`, then the owner's fixes #1794, #1792 and #1793, row 44 as
  `f0adf9b`, then #1799). On `f0adf9b`: CI
  [40745259392](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40745259392) success,
  configured-suite [40745259430](https://github.com/NoaCG/NoaCG-Studio/actions/runs/40745259430)
  success; the product code of `c6fc146` is identical. The ledger was read at
  `dcf2f4742564b0b01f2bf36b35a92d0814623aaa` (rows 43 and 44 below).
- **Checker verdicts:** the run ledger on `claude/noacg-recovery/plan-production-page-2026-10-21`
  at `8a4e7680dc0b0a1785f8566bd813ec66da04a00b` (`ledger.md`, its `phase <n> pass` entries). Each
  entry is the independent checker's verdict on the merge SHA, with a per-criterion `evidence`
  list naming the commands, tests, mutations and run ids. Those lists are the criterion-level
  receipts this record cites; they are not restated here. Every gating criterion of rows 1 to 42
  has exactly one such entry (47 phases, 47 PASS entries; 7 rows passed on a later check after a
  scoped repair: six on the second, row 32a on the third).
- **Runs:** the CI and configured-suite runs of each merge SHA were read from the Actions API for
  this record, not copied from the phase notes.
- **Phase notes** (`../../production-page-refactor/evidence/phase-notes.md`) are the builders'
  side. They were not used as evidence of a pass.

## Evidence classes

| Class | What it is | Who ran it | Gating |
| --- | --- | --- | --- |
| SW | Software rehearsal: Node tests, browser and configured e2e, package builds, checker probes, on a cloud worker and in GitHub Actions | builders, then the independent checker on the merge SHA | yes (environment CA) |
| Q | Agent-run provider records: real Google Sheets, YouTube and public feeds, measured once | the Q worker, accepted by the checker of the phase each gates | yes, for its phase |
| LW | Laptop scratch walks and speed benches on the owner's Windows laptop | the laptop helper | no (parent §9.1) |
| KT | Trial kits for unaided participants | landed by builders; run by the owner when he can | the kit's presence gates; the trial's result never does (owner, 2026-10-20, D) |
| RS | Real-studio outputs, the physical deck and the dress rehearsal | the owner, in H0.2 and S | the final owner block only |
| PQ | Provider qualification (official election feed, licensed feeds) | nobody yet | a separate verdict, never simulated |

## Reuse decision

The rule is parent §6 ("Revalidation"): a later change to `src/`, `e2e/`, `scripts/` or
`package.json` invalidates earlier evidence, and the rows it reaches run again. Every row after
row 1 changed those paths, so a criterion is reused here only on the dependency it has:

1. **SW criteria held by tests.** Reused. The behaviour is pinned by tests that still exist and ran
   green in the full required suites on the candidate (the runs above) and run again on this
   row's merge. A criterion's one-off probes (a checker's mutation, a timing, a local repeat) stay
   attributed to their merge SHA and are not re-run; what carries forward is the test.
2. **SW criteria with a one-time artefact** (a package build, an archive hash, a committed
   fixture). Reused only where the artefact's inputs are byte-identical on the candidate; see
   "Packages and hashes". Where they changed, the criterion is marked stale.
3. **Q records.** Their material inputs are the provider's behaviour and the reader's cadence.
   The cadence is unchanged on the candidate (`SHEET_READ_MS = 5_000` in
   `src/control/sheetSource.ts`; the tick's `maxDuration` 30 and `* * * * *` cron in
   `vercel.json`, which the tick cost estimate assumed). Reused as dated provider measurements of
   2026-10-20. They are not provider qualification.
4. **LW receipts.** Bound to their merge SHA. Every one predates rows 33 to 42, which changed
   `src/output/` (912 lines since `0ca7742`), the page and `src/control/`, and the Companion
   module (0.1.2 to 0.2.0). They stay valid as what they were (non-gating, on their SHA); none is
   reused for the final candidate, and S's real-studio walk supersedes them.
5. **KT.** A kit is reused while the build it names still offers its tasks; trial results are
   reported as run, never required.
6. **RS and PQ.** Nothing exists yet. Owed, never substituted.


## Criteria

Status words: **passed (SW)** means every gating part landed and passed its checker, held by
tests on the candidate; **part owed** names who owes the rest; **open** is a finding below. Row
numbers are `extensions.md`'s; the receipts are the ledger entries of those rows (table at the
end).

### Parent baseline (`production-page-refactor/spec.md`)

| AC | Evidence (rows) | Class | Status |
| --- | --- | --- | --- |
| AC-1 safety net | 3 | SW; LW perf baselines on `0ca7742` | passed (SW) |
| AC-2 identical behaviour | 4, 5, 15 to 25 | SW | passed (SW) |
| AC-3 core in Node | 4, 17, 18, 20, 22, 23, 24 | SW | passed (SW) |
| AC-4 command contracts | 21 (cancellation), 22 (seed, claim, restore), 23 (all rows) | SW | passed (SW) |
| AC-5 one owner for liveCue | 22 | SW | passed (SW) |
| AC-6 infrastructure tested | 4, 18, 20, 22, 24 | SW | passed (SW) |
| AC-7 UI fresh | 24 | SW | passed (SW) |
| AC-8 phase fences | every baseline row | SW | passed (SW) |
| AC-9 performance | 24 render targets (SW, gating); repeats on 22, 24, 25 within §7 (`perf/phase-*-repeat.md`) | SW + LW | passed as specified; see O-1 |
| AC-10 evidence before landing | every row (phase notes, ledger, stamp) | SW | passed (SW) |
| AC-11 guardrail | 25 | SW | passed (SW) |
| AC-12 docs follow code | 25 | SW | passed (SW) |
| AC-13 hosted reuse | 22 | SW | passed (SW) |
| AC-14 completion names the unverified | 25 software half (`rehearsal-automated.md`, data AC-16 reconciliation) | SW + LW | part owed: S (`final-acceptance.md`, real outputs); see O-2 |
| AC-15 suspected defects | 3 (S1, S3; repair P1R) | SW | passed (SW) |

### Q records (`data-sources/evidence/`, measured 2026-10-20 on `cc3500f2`, landed in #1557)

| Record | Gates | Accepted by | Status |
| --- | --- | --- | --- |
| `sheet-latency.md` (slowest 1,011 ms of 20) | C1b | row 7 | passed (Q), dated |
| `sheet-endurance.md` (720 of 720 reads 200) | C1b | row 7 | passed (Q), dated |
| `tick-cost-estimate.md` | C2 | row 9 (second check, after repair #1592) | passed (Q), dated; the tick switch stays OFF |
| `youtube.md` (comments and live halves) | C3 | row 10 | passed (Q), dated |
| `feeds.md` (five fixtures) | C4 | row 11 | passed (Q), dated |

### Data sources (`data-sources/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 7 | passed (SW) |
| AC-2 | 6 adapter half, 7 Sheet half | passed (SW) |
| AC-3 | 7 local half, 9 published, 12 | passed (SW) |
| AC-4 | 6 | passed (SW) |
| AC-5 | 11 | passed (SW) |
| AC-6 | 11 | passed (SW) |
| AC-7 | 12 | passed (SW) |
| AC-8 | 7, 12 | passed (SW) |
| AC-9 | 8, 13 | passed (SW) |
| AC-10 | 1 structural half, 7 inbox half, 10 | passed (SW) |
| AC-11 | 7, 9, 11 | passed (SW) |
| AC-12 | 6 fixture test, 7 connection half, 9 | passed (SW) |
| AC-13 | 6 starter half, 7 mapping half, 8 real Sheet | passed (SW); row 8's real-Sheet receipt is Q-like provider evidence, dated |
| AC-14 trial kit | 14 (`evidence/trial-kit.md`) | kit landed (KT); trial results reported as run |
| AC-15 | 1, 10 | passed (SW) |
| AC-16 main routes | 13 status presentation, 14 software half (`evidence/rehearsal.md`), 25 reconciliation; LW `c7-casparcg-obs-walk.md` on `44bfa89`, `row-25-casparcg-obs-walk.md` on `dda88db` | part owed: S (actual outputs) |

### Sheet data flow (`sheet-data-flow/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 7 stub, 8 real Sheet | passed (SW) |
| AC-2 | 7 | passed (SW) |
| AC-3 | 7 local half and Q latency, 8 local program, 9 published | passed (SW) |
| AC-4 | 9 | passed (SW); the tick runs only when its switch is on, which stays OFF |
| AC-5 | 7 browser-lease half, 9 | passed (SW) |
| AC-6 | 7, 9 | passed (SW) |
| AC-7 | 7 local half, 9 | passed (SW) |
| AC-8 | 7 | passed (SW) |
| AC-9 | 8 | passed (SW) |
| AC-10 | 13 | passed (SW) |
| AC-11 | 10 | passed (SW) |
| AC-12 trial kit | 14 | kit landed (KT) |

### Audience flow (`audience-flow/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1, AC-2, AC-3, AC-6 | 1 | passed (SW) |
| AC-4 | 10 | passed (SW) |
| AC-5 published flow walked | 14 | passed (SW) |
| AC-7 trial kit | 14 (kit); the paste pilot is an owner-list item (`evidence/trial-paste.md` only if he runs it) | kit landed (KT) |
| AC-8 | 1 paste half, 10 | passed (SW) |
| AC-9 | 10, 14 | passed (SW) |

### H0, Companion qualification (`playout-companion-qualification/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 archive installs from the guide | 2 packaging and guide portion (`noacg-studio-0.1.2.tgz` in a real Companion 5.1.0 container; the checker's build on the merge SHA `995272d` hashed sha256 `a8740f46…a7084c`, the builder's on `2a89eb41d` `9914d383…f500ce6`: the archive build is not byte-reproducible); LW `h0-1-companion.md` on `995272d`; 45: 0.2.0 built and imported into Companion 5.1.0, the guide's Setup step corrected | part owed: H0.2 (the owner's guide walk on the archive it installs); see O-3 |
| AC-2 actions and feedback on the real route | 2 | passed (SW) for the 0.1.2 module; held for 0.2.0 by the module's tests (O-3) |
| AC-3 ownership and credentials | 2 | passed (SW) |
| AC-4 physical deck and outputs | none | owed: H0.2 |

### E1, typed OGraf contracts (`playout-ograf-contract/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 33 | passed (SW) |
| AC-2 | 35 persistence, binding, command log; 36 output replay, baseline, renderer | passed (SW) for what it names; #1760 (a bound typed value follows on air only at Update) is a limit to state in E8.2's matrix, see O-4 |
| AC-3 | 33 model and read gate, 35 wire, 36 mixed-version outputs | passed (SW); #1770 open, see O-4 |
| AC-4 | 33 model and read gate, 35 runtime | passed (SW) |

### E2, typed OGraf controls (`playout-ograf-controls/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 37 | passed (SW) |
| AC-2, AC-3 | 38 (pinned program-instance controls and replacement, L1) | passed (SW) |
| AC-4 | 37, 38 | passed (SW) |

### E3, foreign OGraf in the rundown (`playout-ograf-rundown/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 39 | passed (SW) |
| AC-2 | 40 configured browser outputs | part owed: S (CasparCG/Bridge and OBS); the laptop walk the row names was not run, see O-5 |
| AC-3 | 41 (with L2 AC-10's foreign case) | passed (SW); #1784 item 1 closed by this row, item 2 open (display only) |

### E4, trusted JSON acquisition (`playout-external-connectors/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 26 cloud-worker part (replay server, `endurance.yml` smoke), 27 installed agent | passed (SW) |
| AC-2, AC-3, AC-4 | 27 (migration 0101) | passed (SW) |

### E5, sample-based API mapping (`playout-api-mapping/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 29 | passed (SW); #1690 (a raw path in the repair state) is a wording defect against its intent, see O-6 |
| AC-2 | 28 | passed (SW) |
| AC-3 | 29 | passed (SW); #1691 open, see O-6 |
| AC-4 | 28 automated, 29 | passed (SW) |

### E6, declared actions through Companion (`playout-companion-actions/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 to AC-3 | 34 native and typed descriptors, 42 through the module, native and foreign | passed (SW), with the verification row's fallback: no headless Companion run qualified on a cloud machine, so module tests, package, relay contract and the configured walk; module tests run in no workflow (#1758), see O-3 |
| AC-4 physical custom buttons | 42 kit (`evidence/trial-kit.md`) | owed: H0.2 |

### E7, election graphics and live candidates (`playout-election-package/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 | 31 | passed (SW); #1726 open (label after a pick, card's synthetic label), see O-7 |
| AC-2, AC-3 | 30 (second check after repair #1704) | passed (SW); #1714 and #1698 open, see O-7 |
| AC-4 | 32 software and replay grade; LW `row-32-election-casparcg-obs-walk.md` on `9866960` | part owed: S (the real studio); the official feed is PQ, a separate verdict |

### E8, final expanded acceptance (`playout-expanded-acceptance/spec.md`)

| AC | Evidence | Status |
| --- | --- | --- |
| AC-1 | 43 (software reconciliation), 45 (the verdict above) | agent part: row 45's merge and checker; part owed: S (final reconciliation with H0.2's and S's receipts) |
| AC-2 | 43 cross-feature cases (below), 44 endurance (`e8-1b-endurance.md`, run 40728515115) | passed (SW); open findings #1797, #1798 (O-9); part owed: S (the dress rehearsal's failures) |
| AC-3 | 45 (`trial-kit.md`) | kit: row 45's merge and checker (KT); owed: S (physical part) |
| AC-4 | 45 (`../runbook.md`, `../capability-matrix.md`, `e8-2-guide-check.md`) | row 45's merge and checker |

### L1, pinned live controls (`pinned-live-controls/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 to AC-7, AC-9, AC-10 | 32a (third check, after repairs #1730 and #1731) | passed (SW) |
| AC-8 the deck reaches pinned controls | 42 (its ledger entry carries the L1 AC-8 line: pinned presets, invocable only); row 34 built the target kind, which its entry checks under E6 AC-1 to AC-3, not as L1 AC-8 | passed (SW) through the module; the deck itself is H0.2 |
| AC-11 two-graphic show, timed | 45 kit task 6 (`trial-kit.md`) | kit landed (KT); owed: S (quiz-and-score case) |
| the cross-feature cases L1 assigns to E8.1a | this row | see below |

### L2, playout adjustments (`playout-adjustments/spec.md`)

| AC | Evidence (rows) | Status |
| --- | --- | --- |
| AC-1 to AC-4, AC-8 | 32b | passed (SW); #1733 open (glyph, install line, nudge dead zone), see O-8 |
| AC-5 | 32d | passed (SW); #1754 and #1755 open, see O-8 |
| AC-6 | 32d per graphic and cue, 38a production look | passed (SW); #1777 and #1778 open, see O-8 |
| AC-7 | 38a | passed (SW) |
| AC-9 | 32b renderer half, 32c receivers and exports | passed (SW); the exported-overlay laptop walk row 32c names was not run, see O-5 |
| AC-10 | 32b unchanged production, 32c those targets, 32d imported SVG and agent-made, 41 foreign | passed (SW) |
| AC-11 the adjustments run from one screen | 45 kit task 7 (`trial-kit.md`) | kit landed (KT); owed: S (adjustment case) |


## Owed to later rows and the owner block (never passed here)

| Owner | What it owes |
| --- | --- |
| E8.1b (row 44) | delivered: passed on `f0adf9b` (run 40728515115) |
| E8.2 (row 45) | delivered by this update: the verdict, the kit, the runbook and the matrix |
| H0.2 (row 46) | H0 AC-1's guide walk on the archive actually shipped (built and hashed from the final candidate), H0 AC-4, E6 AC-4, the operator's buttons on the deck (L1 AC-8's physical end) |
| S (row 47) | parent AC-14's real outputs and `final-acceptance.md`; data AC-16's actual outputs; E3 AC-2, E7 AC-4 and E8 AC-3's physical part (the 30-minute dress rehearsal, with L1 AC-11's quiz-and-score case and L2 AC-11's adjustment case); the physical checks of #1618, #1657 and #1746; E8 AC-1's final reconciliation including H0.2's and S's receipts |
| PQ | the official Finnish/Yle election feed (access, licence, schema, rate): a separate qualification verdict; the programme can finish with it stated as unqualified |

## Open findings

- **O-1, performance on the extension candidate.** Parent §7's comparison rule was met at every
  repeat it names (rows 22, 24, 25, the last on `dda88db`). Rows 26 to 42 changed the page,
  `src/control/` and `src/output/`, and no speed bench has run since. Not a breach of AC-9 as
  written; the extension-era figures are E8.1b's, and a laptop repeat on the final candidate is a
  non-gating item for the laptop helper.
- **O-2, the automated rehearsal predates the extensions.** `rehearsal-automated.md` (row 25) and
  `rehearsal.md` (row 14) name candidates before rows 26 to 42. Their specs still run in the
  required suites on the candidate, so the software routes hold; the laptop walks they cite do not
  cover the extensions. S's final acceptance reconciles them against the final candidate.
- **O-3, the Companion archive and module evidence.** H0.1's archive is `noacg-studio-0.1.2.tgz`
  (the checker's build on `995272d`: sha256
  `a8740f4632b0edda85dd2a1709e50ab4114a747aad7e831e83739e5ba6a7084c`; the builder's on
  `2a89eb41d` was `9914d38334e091a76bc114583747cbce5b8eba209b4356a4c4797fa87f500ce6`, so the build
  is not byte-reproducible and a hash names one build, not the source); the module is now
  0.2.0 (`companion-module/` tree `02bf90f9213ad07f7c35703e59491524307ded45`), built and tested
  by row 42's checker but with no recorded archive hash and no real Companion run. The module's
  73 tests run in no GitHub workflow (#1758). Stale for H0 AC-1; the archive H0.2 installs must be
  built and hashed on the final candidate, and E8.2's verdict should name that. **E8.2:** 0.2.0
  built on `c6fc146` (sha256 `983fd6c3…cccbfff5`), imported into a scratch Companion 5.1.0 and
  listed at 0.2.0; rebuilt with the corrected `HELP.md` (sha256 `3a9a43de…6f79502e`). The guide's
  step 1 named a Setup item, **Panel**, that has read **Stream Deck panel…** since row 38a; fixed,
  with a test that reads the menu (`e8-2-guide-check.md`). The verdict names the rest: H0.2 builds
  and hashes the archive it installs.
- **O-4, typed and foreign limits.** #1760: a source moving a typed (foreign) cue's bound value
  reaches air at the next Update, not by itself (a native cue follows within a second). #1769: a
  PROGRAM monitor can miss the typed values of a graphic no report banks (air right). #1770: an
  output bundle from before E1.2b reboots a typed report to defaults. #1775 (numbered as in the issue):
  E3.2a wired part of item 1 (» Next steps a package) and item 3 (declared actions as ⚡ buttons,
  confirmed by the output's answer); item 1's Back, Goto and skip controls and item 2's `step`
  command row (a migration) stay open; item 4 (calls on a replaced instance reading `gone`) is not
  verified here. The row 40 and 41 notes number these differently. None fails a checked criterion's text; each
  is a limit E8.2's capability matrix must state, and #1770 is a rollback caveat for the runbook.
- **O-5, laptop walks not run.** Row 32c's walk of one exported overlay and row 40's scratch
  CasparCG/Bridge and OBS walk have no receipt in `../../production-page-refactor/evidence/local/`.
  Non-gating; S covers the real outputs.
- **O-6, data mapping.** #1691 (P2): saving the Connect review over a stale or invalid stored
  recipe re-stamps it and drops outputs other graphics added; E5 AC-3 holds for readable recipes
  only. #1690: the repair state shows a raw data path, against E5 AC-1's intent. #1679: a changed
  mapping of an already written field waits for the provider's next change. #1734: a source only
  its agent can reach cannot be registered from Connect data. #1737 (P2): published
  `collections` have no byte cap, against E4 AC-1's "bounded"; E8.1b's fixture should stay well
  inside it. Open; not fixed here (each needs a design or a migration outside this row).
- **O-7, live candidates and markers.** #1714, #1698 (recovery after a reload or a late commit,
  both fail safe), #1713, #1719, #1721 (a marker or monitor that can disagree with air on the
  hosted page's fast road, after an expired first resolve, or on protocol 1), #1726 (a cue label
  after a pick; the candidate card has no synthetic label of its own, which E7 asks for). Open;
  #1719 and #1726 touch what an operator or viewer reads and belong in E8.2's verdict.
- **O-8, adjustments.** #1733, #1754, #1755, #1777, #1778: small or edge cases left by L2's rows,
  none failing a checked criterion's text. #1777 (a reloaded output in the fallback face after
  a replaced look and a Publish) is a runbook caveat.
- **O-9, the endurance hour's findings (row 44).** #1797: a value applied during a controller
  reload missed the output until the next update (once in 18 reloads over three hours; the next
  value reached air 6.6 s later, inside the 10 s ceiling). #1798: the output page's heap rises
  about 10 KB a minute, repeatably, cause not found (inside the hour's thresholds; row 44's
  checker called it a judgement call). Neither fails E8 AC-2 as written; both are on-air limits in
  the matrix and the runbook. A run longer than an hour is not measured. #1802 (filed during row
  45 as #1797's follow-up): a frame lost at any other moment, with no later row, waits for the
  output's 30 s poll; open, in the matrix and the runbook.
- **O-10, the owner's on-air fixes (2026-10-28).** Three defects outside the phase rows were fixed
  and landed through the merge queue: #1618 (a results board taken again draws no rows;
  `55f98f9`, PR #1793), #1657 (the CasparCG output comes back by itself after a server restart;
  `e5d28ef`, PR #1792) and #1746 (saved graphics' Š, Ž and bold; `e375917`, PR #1794). Each is
  fixed in software with its own tests and its physical check owed to S. #1795 (an exported
  results board played outside `/output`) is #1618's open follow-up, read from the code and not
  yet reproduced. E8.1a did not list these; this update does.

### The follow-up issues the brief names

| Issue | Affects | Classification |
| --- | --- | --- |
| #1679 | E5 freshness | O-6, open |
| #1690 | E5 AC-1 intent | O-6, open |
| #1691 | E5 AC-3 | O-6, open finding |
| #1698 | E7 AC-3 recovery | O-7, open |
| #1713 | hosted marker | O-7, open; no criterion's text |
| #1714 | E7 AC-2 | O-7, open |
| #1719 | PROGRAM monitor truth | O-7, open |
| #1721 | marker on protocol 1 | O-7, open; no criterion's text |
| #1726 | E7 AC-1, AC-4 labelling | O-7, open |
| #1733 | L2 "Finding it" | O-8, open; no gated criterion |
| #1734 | E4/E7 operator flow | O-6, open; runbook |
| #1737 | E4 AC-1 bounded | O-6, open finding |
| #1754 | L2 AC-5 edge | O-8, open |
| #1755 | L2 AC-5, AC-6 edge | O-8, open |
| #1758 | E6 evidence durability | O-3, open |
| #1760 | E1 AC-2 live follow | O-4, open; matrix limit |
| #1769 | E1 monitor | O-4, open |
| #1770 | E1 AC-3 rollback | O-4, open; runbook |
| #1771 | output recovery tests | test gap; behaviour correct; no criterion |
| #1775 | foreign step controls | O-4; Next and declared actions wired by E3.2a; Back/Goto/skip (item 1) and the `step` row (item 2) open, item 4 unverified; matrix limit |
| #1777 | L2 AC-6 edge | O-8, open; runbook |
| #1778 | e2e seed settling | test hygiene; no criterion |
| #1784 | E3 AC-3, L2 AC-10 | item 1 closed by this row (below); item 2 open, display only |
| #1795 | no criterion; on air for exported boards | O-10, open; matrix and runbook |
| #1797 | E8 AC-2 (passes as written) | O-9, open; matrix and runbook |
| #1802 | no criterion; on air, #1797's follow-up | O-9, open; matrix and runbook |
| #1798 | E8 AC-2 (passes as written) | O-9, open; matrix and runbook |
| #1618, #1657, #1746 | parent AC-14, data AC-16 on real outputs | O-10, fixed in software; physical check owed to S |
| #1567, #1572, #885, #1671, #1347, #1048, #1063, #775, #758, #779 | older open on-air defects, filed before the extension rows | no gated criterion's text; listed in the matrix with what to do meanwhile |

## E8 AC-2, the cross-feature cases (this row)

Each named case has a test that joins the features; each went red under the mutation listed.

| Case | Test | Mutation that turns it red |
| --- | --- | --- |
| A pinned foreign graphic (E3 with L1) | `scripts/graphic-verbs.test.mjs` "a pinned imported OGraf package: …" | `liveSelection` taking the first cue; the typed-airing guard off; a package Take reading ✓ |
| A pinned graphic bound to a source (C1 with L1) | same file, "a pinned graphic bound to a source: …" | the bound press ignoring the tree; the data dispatch also sending `play` |
| An adjusted cue bound to a source (L2.1 with C1) | same file, "a source moving an adjusted cue on air …" | the data dispatch carrying an identity appearance |
| A pinned adjusted graphic (L1 with L2.1) | same file, "a pinned press on an adjusted graphic …" | `liveSelection` taking the first cue |
| An activated look over a pinned graphic (L2.3 with L1, and E3) | same file, "a production look sent over a pinned press …"; `scripts/cue-adjust.test.mjs` "an active look reaches a native graphic and never an imported OGraf package …" and "the look a production turns on is never handed to an imported OGraf package …" | the look send not waiting behind a live press; the package style guard removed; `lookForOf` handing the look to a package |
| A bound cue with a cue-level typeface (L2.2, L2.3 with C1) | `scripts/cue-adjust.test.mjs` "a bound cue with its own typeface under an active look …" | the look's face overriding the cue's |

AC-2's other clauses were already covered on main and are reused (class SW, re-proven by the
candidate's runs):

| Clause | Tests |
| --- | --- |
| Foreign typed actions through the negotiated guarded route, unknown legality, preview/program targeting | `scripts/panel-feedback.test.mjs` (never greyed by a machine; a key drawn on another instance refused), `scripts/graphic-verbs.test.mjs` (declared actions on the program instance, replacement mid-wait), `e2e/configured/panel-graphic-actions.spec.ts` (a real foreign rundown cue through the relay). A departure from the clause's wording: a foreign package has no preview instance (E3.2a, PREVIEW says it plays on the outputs only), so "preview/program targeting" is met as the program-instance check |
| A quiz reveal leaves its clock running | `e2e/production-data.spec.ts` "a quiz revealed beside a running clock: …" |
| Data arrival never Takes | `e2e/production-data.spec.ts` (same test, and the on-air updates without a new entrance), `e2e/configured/election-selection.spec.ts` AC-3, `scripts/data-pause.test.mjs`, `scripts/production-data-session.test.mjs`, and the bound-pinned case above |
| Groups expose collision and partial failure | `scripts/folder-playout.test.mjs`, `e2e/playout-folders.spec.ts`, `e2e/configured/ograf-rundown.spec.ts` |
| Last-confirmed monitors become visibly stale on loss | `scripts/playout-status.test.mjs`, `e2e/production-controls.spec.ts` "… a lost connection dims PROGRAM (C6)" |

The fixes this row made, both for "an imported OGraf package takes place and size alone": the
page's guard moved from `ProductionPage.tsx`'s `adjustStateOf` into `cueAdjustState`
(`src/control/adjustGeometry.ts`), which reads the graphic's template, so a cue's own typeface
never resolves for a package (before, removing the page's guard left every test green, #1784
item 1); and `lookForOf` (`src/control/productionLook.ts`) hands no look to a package, so Publish
no longer gives the hosted page a look for one (found by this row's review; the output's own
frame-only guard already kept it off air), and Setup › Look's reach count (`lookReach`) counts a
package as untouched. A hosted-page cue record carrying a typeface for a
package is still resolved there, since that fold has no template to read; the output drops it.

## Packages and hashes on the candidate

| Package | Identity on `3b871c3` | Last receipt | Reuse |
| --- | --- | --- | --- |
| Election rehearsal pack | `public/packs/election-rehearsal.noacgpack.json` sha256 `a51b45aef4dd2149c8794b7b2040f13cc10998152be66afb01552698802340be`; `packs/election-rehearsal/` tree `0864ae01bda99bf1066dd2c2d58081a6c28d119d` | row 32 (`9866960`), the same first 16 hex | identical since; reused |
| Foreign OGraf library fixtures | `e2e/fixtures/ograf-library/` tree `4b4010e5ae7b68421d2861d1d372d3ad70bac901` (every file's sha256 pinned by its Node test) | rows 39 to 42 | reused while the pinned test is green |
| E6 fixture package | `e2e/fixtures/foreign-ograf/` tree `44f5d3fb8e9cb1e32de8def7f387bd2c04fd7999` | row 42 | reused |
| Companion module | `companion-module/` tree `02bf90f9213ad07f7c35703e59491524307ded45`, version 0.2.0 | archive hash only for 0.1.2 (row 2) | stale, O-3 |

Output, provider and environment: hosted outputs follow `main`'s deploys (deploy-verify on each
merge, in the ledger's merge checks); providers as dated in Q; the cloud environment
`env_017nuiDZBW9smUNLdWVQK8cf`; no real-studio output version is recorded yet (S).

## Rows 1 to 44: landings, checkers and runs

| Row | Phase | Merge (PR) | Checker, ledger PASS (UTC) | CI / configured-suite on the merge SHA | Checker receipt |
|---|---|---|---|---|---|
| 1 | C0 | `046a74598` (#1556, #1558) | `p1-pp-p1c2-8d14`, 2026-10-20T23:54 | CI 39514060703 success; configured 39514060726 success | ledger entry |
| 2 | H0.1 | `995272d56` (#1561) | `p2-pp-p2c-6a2e`, 2026-10-21T02:29 | CI 39528119418 success; configured 39528119481 success | ledger entry |
| 3 | 1 | `0ca774269` (#1568) | `p3-pp-p3c-4b18`, 2026-10-21T05:35 | CI 39546128004 success; configured 39546128052 success | ledger entry |
| 4 | 2+7 | `7ac4b2215` (#1573) | `p4-pp-p4c-9e27`, 2026-10-21T08:47 | CI 39566951392 success; configured 39566951258 success | ledger entry |
| 5 | 13a | `66c5f8194` (#1575) | `p5-pp-p5c-fccc`, 2026-10-21T10:18 | CI 39578305204 success; configured 39578305182 success | ledger entry |
| 6 | C1a | `1e81bfed1` (#1576) | `p6-pp-p6c-ab4a`, 2026-10-21T11:42 | CI 39589210133 success; configured 39589210136 success | ledger entry |
| 7 | C1b | `ebbdc78f1` (#1578) | `p7-pp-p7c-f327`, 2026-10-21T14:45 | CI 39613771037 success; configured 39613771110 success | ledger entry |
| 8 | C1c | `63edc790b` (#1585) | `p8-pp-p8c-c7d7`, 2026-10-21T17:06 | CI 39634815438 success; configured 39634815347 success | ledger entry |
| 9 | C2 | `4890bbdfd` (#1591, #1592) | `p9-pp-p9c2-3761`, 2026-10-21T23:33 | CI 39690179182 success; configured 39690179226 success | ledger entry |
| 10 | C3 | `570da40a4` (#1593, #1594) | `p10-pp-p10c2-5440`, 2026-10-22T05:09 | CI 39711172027 success; configured 39722586834 success (dispatch), 39711172079 cancelled; the push configured run failed only agent-access.spec.ts:757 (rolling issue #1596, a spec C3 does not touch), its second attempt failed it again and hit the 40 min cap; the checker passed it under decision 18 on the dispatch green on the merge SHA | ledger entry |
| 11 | C4 | `503b02997` (#1599, #1601) | `p11-pp-p11c2-29d7`, 2026-10-22T08:43 | CI 39745490839 success; configured 39745490725 success | ledger entry |
| 12 | C5 | `7057915b4` (#1604) | `p12-pp-p12c-18ae`, 2026-10-22T11:20 | CI 39764904993 success; configured 39764904953 success | ledger entry |
| 13 | C6 | `f9c9c26de` (#1607, #1610) | `p13-pp-p13c2-1c97`, 2026-10-22T19:03 | CI 39830841575 success; configured 39830841658 success | ledger entry |
| 14 | C7 | `44bfa8955` (#1615) | `p14-pp-p14c-dbbb`, 2026-10-23T03:41 | CI 39857536681 success; configured 39857536582 success | ledger entry |
| 15 | 3 | `799924c32` (#1620) | `p15-pp-p15c-657b`, 2026-10-23T05:19 | CI 39899718033 success; configured 39899717992 success | ledger entry |
| 16 | 4 | `ab9b5e485` (#1623) | `p16-pp-p16c-fb73`, 2026-10-23T07:26 | CI 39913149399 success; configured 39913149457 success | ledger entry |
| 17 | 5 | `fe95daa9b` (#1626) | `p17-pp-p17c-bf3b`, 2026-10-23T08:55 | CI 39923317845 success; configured 39923317904 success | ledger entry |
| 18 | 6 | `325c2462b` (#1627) | `p18-pp-p18c-6c7c`, 2026-10-23T10:54 | CI 39937167538 success; configured 39937167816 success | ledger entry |
| 19 | 8 | `dedd45768` (#1631) | `p19-pp-p19c-1b6a`, 2026-10-23T12:40 | CI 39949920559 failure; configured 39949920297 success; CI red only on import-svg:1578, same-commit retry green (checker) | ledger entry |
| 20 | 9 | `919fbc9b7` (#1634) | `p20-pp-p20c-966c`, 2026-10-23T14:35 | CI 39964759151 failure; configured 39964759153 success; CI red only on wizard-shell:443 resource flake, retry green, quarantined #1635; merge_group 39963321868 green | ledger entry |
| 21 | 10 | `40a92d5d7` (#1636) | `p21-pp-p21c-148a`, 2026-10-23T16:09 | CI 39978578948 success; configured 39978578748 success | ledger entry |
| 22 | 11 | `08389cfc1` (#1639) | `p22-pp-p22c-8afb`, 2026-10-23T18:44 | CI 40000577873 success; configured 40000577510 success | ledger entry |
| 23 | 12 | `69cefde1b` (#1644) | `p23-pp-p23c-43de`, 2026-10-23T22:41 | CI 40030601097 success; configured 40030601080 success | ledger entry |
| 24 | 13b | `a56e14119` (#1648) | `p24-pp-p24c-c25a`, 2026-10-24T04:41 | CI 40060994421 success; configured 40060994406 success | ledger entry |
| 25 | 14 | `dda88db51` (#1653) | `p25-pp-p25c-176f`, 2026-10-24T06:47 | CI 40068906021 success; configured 40068905966 success | ledger entry |
| 26 | E4.1 | `b085a1451` (#1655) | `p26-pp-p26c-c09d`, 2026-10-24T08:22 | CI 40075444094 success; configured 40075443993 success | ledger entry |
| 27 | E4.2 | `029a114bf` (#1658) | `p27-pp-p27c-8b6f`, 2026-10-24T13:11 | CI 40093685216 success; configured 40093685213 cancelled; configured cancelled at the 40 min cap 124/130 with no failure; the next main commit (`6949fdcf5`, PR #1665, differing only in `cli/package.json` and its changelog) green in 40094380185; rolling issue #1667 | ledger entry |
| 28 | E5.1 | `8bdec0692` (#1670) | `p28-pp-p28c-b64f`, 2026-10-24T16:36 | CI 40109269990 success; configured 40109269976 success | ledger entry |
| 29 | E5.2 | `89abb9eeb` (#1680) | `p29-pp-p29c-99e9`, 2026-10-24T19:53 | CI 40126091878 success (dispatch), 40125446630 cancelled; configured 40125446575 success; push CI cancelled; dispatch on the merge SHA green | ledger entry |
| 30 | E7.1 | `8ebb429b4` (#1695, #1704) | `p30-pp-p30c2-1f82`, 2026-10-25T06:31 | CI 40166932892 success; configured 40166932918 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1704#issuecomment-6394229525) |
| 31 | E7.2a | `3295c9cf1` (#1724) | `p31-pp-p31c-c9a2`, 2026-10-25T13:23 | CI 40195784457 success; configured 40195784477 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1724#issuecomment-6398187648) |
| 32a | L1 | `e07a5d8f7` (#1728, #1730, #1731) | `p32-pp-p32c3-b8df`, 2026-10-25T23:34 | CI 40243461705 success; configured 40243461679 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1731#issuecomment-6404939122) |
| 32b | L2.1 | `87c95f158` (#1732) | `p33-pp-p33c-9007`, 2026-10-26T03:28 | CI 40262481505 success; configured 40262481644 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1732#issuecomment-6407553637) |
| 32 | E7.2b | `9866960cb` (#1735) | `p34-pp-p34c-e679`, 2026-10-26T07:10 | CI 40281001978 success; configured 40281001994 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1735#issuecomment-6410331062) |
| 32c | L2.1b | `1dcf26dc9` (#1740) | `p35-pp-p35c-c501`, 2026-10-26T10:08 | CI 40302896428 success; configured 40302896279 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1740#issuecomment-6413401169) |
| 32d | L2.2 | `42c48f95f` (#1753) | `p36-pp-p36c-6580`, 2026-10-26T17:23 | CI 40364795529 success; configured 40364795490 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1753#issuecomment-6422743451) |
| 33 | E1.1 | `a9356fb7e` (#1756) | `p37-pp-p37c-0d67`, 2026-10-26T19:11 | CI 40382043321 success; configured 40382043283 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1756#issuecomment-6424996626) |
| 34 | E6.1 | `a5360d4c5` (#1757) | `p38-pp-p38c-5e21`, 2026-10-26T21:17 | CI 40400474943 success; configured 40400474947 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1757#issuecomment-6427528910) |
| 35 | E1.2a | `c614500fb` (#1763) | `p39-pp-p39c-4d2a`, 2026-10-27T06:26 | CI 40458529409 success; configured 40458529397 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1763#issuecomment-6435325604) |
| 36 | E1.2b | `0897d097f` (#1765) | `p40-pp-p40c-7b19`, 2026-10-27T09:08 | CI 40476286065 success; configured 40476286073 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1765#issuecomment-6437894282) |
| 37 | E2.1 | `55621f973` (#1772) | `p41-pp-p41c-3e8d`, 2026-10-27T12:29 | CI 40501378385 failure; configured 40501378422 success; CI red only from quarantined import-svg, retry job 122186353343 green (checker) | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1772#issuecomment-6441881105) |
| 38 | E2.2 | `d9c29b9ea` (#1774) | `p42-pp-p42c-9a27`, 2026-10-27T15:05 | CI 40522413204 success; configured 40522413219 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1774#issuecomment-6445503274) |
| 38a | L2.3 | `8057a51f6` (#1776) | `p43-pp-p43c-5b18`, 2026-10-27T19:51 | CI 40569021431 success; configured 40569021396 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1776#issuecomment-6452018182) |
| 39 | E3.1 | `302d565be` (#1779) | `p44-pp-p44c-2f6d`, 2026-10-28T00:21 | CI 40606317754 success; configured 40606317710 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1779#issuecomment-6457241262) |
| 40 | E3.2a | `373d89667` (#1780) | `p45-pp-p45c-6a3e`, 2026-10-28T03:19 | CI 40624330559 success; configured 40624330563 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1780#issuecomment-6459768936) |
| 41 | E3.2b | `660a404d7` (#1781) | `p46-pp-p46c-cba4`, 2026-10-28T08:03 | CI 40651918059 success; configured 40651918160 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1781#issuecomment-6463855205) |
| 42 | E6.2 | `ae887d254` (#1786) | `p47-pp-p47c-9846`, 2026-10-28T10:09 | CI 40667808475 success (dispatch), 40663901817 cancelled; configured 40663901945 success; push CI red only on rundown-history:276 (released flake), its re-run cancelled as superseded, stand-in dispatch 40667808475 on the merge SHA green | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1786#issuecomment-6466198696) |
| 43 | E8.1a | `132bd5b68` (#1790) | `p48-pp-p48c-2d38`, 2026-10-28T12:08 | CI 40680316527 success; configured 40680316462 success | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1790#issuecomment-6468565947) |
| 44 | E8.1b | `f0adf9b5f` (#1791) | `p49-pp-p49c-13e0`, 2026-10-28T18:45 | CI 40745259392 success; configured 40745259430 success; endurance 40728515115 on `e71ff75` reused under §6 (the diff to the merge is evidence only) | [PR comment](https://github.com/NoaCG/NoaCG-Studio/pull/1791#issuecomment-6477585287) |

The ledger entry of each row carries the per-criterion evidence; a PR comment link is given where the checker posted one. Rows 43 and 44 were added by E8.2 from the ledger at `dcf2f474`.
