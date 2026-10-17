# Codebase health: preserve responsibilities without new size gates

**Prepared for `/plan-run codebase-health`, 2026-10-15.** Research baseline: main
`50ce0911d9f37f5d1116e51a1cb34541ed03aef5` (commit time 06:38:54 UTC / 09:38:54 Europe/Kyiv).
The owner subsequently authorized preparing the command registration for later use. No phase
has started; a future invocation with an owner-supplied window authorizes the documentation run.
Product changes, new size policies and an agent-signal trial remain outside scope.

## Recommendation

Add no automated mechanism now. Use the existing architecture and review process to make the
responsibility owner explicit when a real maintenance change needs it; keep a small, manual,
revision-pinned receipt to check whether that helps. Keep the two existing wizard budgets pending
concrete evidence of harmful friction, as the owner decided in this research session. Do not add
ProductionPage, `model/shows.ts`, or any other file to a size policy.

The production-page refactor is **not complete on this main**. Earlier extractions landed, and
later reliability work reused some extracted logic, but the fourteen-phase spec still has empty
phase notes, no review, no production-page budget, and no planned session core. The owner confirmed
this pinned main as the baseline after this discrepancy was reported. Do not describe the wizard
close-out as production-page completion. Reconcile the existing production plan before its next
run; this health plan neither resumes nor duplicates it.

`model/shows.ts` is a separate maintenance concern, not automatically another refactor: it combines
persisted shapes, the shared write envelope and many domain mutators. Preserve that single write
owner. Its growth includes useful validation and error propagation; a line-driven split could
reintroduce inconsistent writes. No extraction is proposed without a concrete change proving a
better seam.

## Owner requirements and authority

Source: owner message in this session, 2026-10-15: “Research and prepare a NoaCG codebase-health
work spec. Do not implement the proposed guardrails or launch an automated execution run.”
The same message authorizes research and spec preparation only, requires an isolated worktree,
and reserves implementation approval until after review. This is not approval of the proposals.

- Recheck current main, history coverage, production-page progress, safeguards and concurrent work.
- No new hard ceiling or blocking size policy; an arbitrary number must not block a valuable change.
- Recommend the smallest demonstrated maintenance benefit, including rejection of mechanisms.
- Owner decides policy exceptions and unresolved tradeoffs. No unattended policy decisions here.
- Defer an agent-health-signal trial until evidence demonstrates need.
- Eventual execution uses `/plan-run` with its existing automatic phase continuation and independent
  checks. No registration, launch or scheduling before an explicit owner green light; no second
  scheduler or execution ledger. Authorized windows remain at most 24 hours.
- Change documents only in this task. Keep customer, partner and event names out of artifacts.

Research-stage owner answers in this session:

1. “Use pinned main as the baseline” after being shown the incomplete production-page evidence.
2. “Keep existing budgets pending evidence” after being offered unchanged wizard budgets versus a
   proposed reporting-only replacement. This preserves existing budgets, authorizes no new one,
   and is not a run authorization.

Later preparation authorization, same session: “Can you prepare it so I can just use the `plan run`
command? What should I avoid running at the same time?” This supersedes the earlier restriction
on preparing and landing the registration only. It authorizes making this documented plan
invocable, not starting phases, supplying a window, or deciding the production-plan size policy.
The initial research receipts remain historical; [registration receipt](evidence/registration.md)
records this preparation separately.

## Observed facts

Evidence and reproducible commands: [research receipt](evidence/research.md),
[measurements](evidence/measurements.json). Numbers are observations, never pass/fail thresholds.

### Current state and overlap

| Area | Observed on pinned main | Consequence |
|---|---|---|
| Production page | 5,699 lines; old extraction #473 moved rundown, monitors, server editor and server playout pieces; #1057 subsequently adds recovery/publish fixes | Reuse the existing refactor; its original 5,676-line baseline is stale |
| Fourteen-phase production plan | Only its planning landing in path history; phase notes empty; phase-1 named browser specs and phase-2 session modules absent; `work.json.review` null | No phase acceptance/completion claim; recheck prerequisites and later partial reuse, not a blind restart |
| File budgets | Two entries: CreationWizard 1,419/1,419; AiStep 1,659/1,659; no legacy file currently present | Wizard plans own the current entries; production D8 describes an uninstalled budget |
| Budget gate | Build gate, per-file JSON plus legacy support, duplicate/missing entries fail; increases prevented by review convention, not comparison with base | Neither an architectural test nor a mechanical monotonic ratchet |
| Wizard work | S8 and A5 receipts exist; extraction and instruction scoping have landed | Reuse the existing S9 revisit of ordinary maintenance; do not reopen these plans or create competing ownership |
| Architecture | Runtime-cycle and domain-edge checks; wizard import/template seam rules; components have broad allowed imports, seams partly reviewed | Existing checks can protect real boundaries, but cannot detect every misplaced responsibility inside a permitted domain |
| API scope | dependency-cruiser intentionally includes `src/` only | API, worker and host need their own dependency model; do not expand this graph opportunistically |
| Instructions | Audit and actual-load probe already exist; issue #805 covers the broader follow-up | Do not invent another audit, instruction pack, or agent-signal system |
| Concurrent work | Open PR snapshot: #1137/#1157 concern a configured late-send test; #1074 concerns E2E durations. Production spec #766 remains open; vMix and other registered plans also share playout concerns | This is repository visibility, not proof that other machines/runs are idle; reserve overlapping files before any future work |

### Hotspots: size, integrated change and growth together

Window: `(2026-09-15T06:38:54Z, 2026-10-15T06:38:54Z]`. Each first-parent change counts once;
branch commits are not double-counted. The 14-day column uses the same end. Physical LF-normalized
lines include comments and blanks. The receipt defines scope, exclusions, dates and move handling.

| Path | Start → end lines | Net | Integrations, 30d / 14d |
|---|---:|---:|---:|
| `src/components/home/ProductionPage.tsx` | 2,699 → 5,699 | +3,000 | 70 / 28 |
| `src/styles/playout-dashboard.css` | 1,363 → 2,770 | +1,407 | 40 / 16 |
| `src/components/HostedControlPage.tsx` | 1,156 → 2,149 | +993 | 36 / 15 |
| `src/control/hostedControl.ts` | 1,090 → 2,124 | +1,034 | 36 / 15 |
| `src/components/wizard/CreationWizard.tsx` | 2,466 → 1,419 | −1,047 | 33 / 21 |
| `src/model/shows.ts` | 921 → 1,923 | +1,002 | 22 / 12 |
| `src/export/targets/ograf.ts` | 1,462 → 2,246 | +784 | 12 / 10 |
| `src/components/canvas/CanvasInteraction.tsx` | 2,240 → 2,240 | 0 | 0 / 0 |

The current AiStep path looks like +1,659 new lines in a path-only report. Following the old
`steps/AiStep.tsx` and new `ai/AiStep.tsx` paths gives 2,133 → 1,659, **−474**, across nine
integrations including the move and shim removal. Likewise newly extracted `CueRundown.tsx`
(1,162 lines, 24 integrations) is not 1,162 lines of new architectural debt. Static tables and
unchanged legacy files also invalidate “large means unhealthy.” No composite risk score is used.

### What the growth means

The purposive diff sample in the receipt establishes mixed causes; it does not classify all 70
page changes or prove that growth caused defects.

- **Responsibilities accumulating in a screen:** Bridge setup, folders and timed-cue orchestration
  added substantial page logic. The existing production plan already assigns those responsibilities
  to testable control modules. This supports that plan's boundary work, not another size policy.
- **Justified fixes:** the +2-line Take/Out fix and +19-line late-send notice repair alter existing
  command handling; #1057 adds only +23 page lines while sharing recovery folds. Forcing unrelated
  extraction into these fixes would enlarge their review and rollback scope.
- **Temporary migration/glue:** callbacks and adapters in the production plan are deliberately
  transitional and have named removal phases. A report should name the destination and removal
  phase, not treat temporary wiring as permanent debt or silently excuse indefinite duplication.
- **Model cohesion with a pressure point:** 18 of 22 `shows.ts` integrations also changed the page.
  Some co-change is expected persisted-feature wiring. Folder algorithms already live in
  `showFolders.ts`; history, clipboard and published-record logic have separate modules. Keep
  pure rules there and keep timestamps, personal/team routing, tombstones and durability in the
  shared persistence path. A second write envelope would be a regression despite smaller files.
- **Wizard reduction with remaining coupling:** existing metrics identify the shell's import
  handler ladder and Skip gating as remaining shared responsibilities. The reported co-change
  windows largely predate the split; they cannot yet demonstrate its long-term effect. Wizard S9
  already calls for reconsideration after 2–4 weeks of ordinary work; coordinate with that existing
  follow-up rather than add a reporting cadence.

### Budget value and likely friction

Historical replay reads the budget and target file from the **same historical main tree**.
Across 73 integration snapshots since introduction there were no over-budget or missing-file
states. Budgets did not increase, including the AiStep move. CreationWizard nevertheless grew
2,485 → 2,516 inside an allowance of 2,601 before its next extraction. AiStep briefly measured
1,940 under a still-2,152 budget before the next reduction. Headroom is not a boundary guarantee.

For comparison only, flagging every positive-net integration against its immediate parent's size
would flag 63/70 page changes, 21/22 model changes and 20/33 wizard-shell changes. This is an
independent-change counterfactual, not a simulated sequence after rejected commits. It includes
useful fixes and features; it supplies **likely friction**, not evidence of actual delay, safety,
quality, or what engineers would have written under enforcement. Successful main history omits
rejected/unmerged attempts. There is insufficient ordinary post-split history to infer effectiveness.

Keep existing budgets pending evidence. If a necessary fix would breach one, present that actual
diff, why its responsibility belongs there, alternatives and urgency to the owner; do not pad,
compress, perform unrelated extraction, or silently raise/bypass the budget. Recommend an explicit
exception or policy revision only on that concrete evidence. This research authorizes neither.

## Derived recommendations and alternatives

| Mechanism | Benefit | Cost / limit | Disposition |
|---|---|---|---|
| Clarify owner, public seam and allowed wiring in existing architecture/plan docs | Directs the next change to a testable responsibility and avoids duplicate state owners | Docs can drift; must match imports and actual writes | Smallest proposed intervention; edit existing documentation, not a new agent rule |
| Actionable feedback in existing review | Names the misplaced behavior, intended module, behavior proof and smallest repair | Reviewer effort; judgment remains necessary | Use for actual responsibility violations; line count alone is not actionable |
| Existing domain, cycle and seam checks | Deterministic checks of established architectural decisions | Broad component allowance and intra-module responsibility remain invisible | Reuse; add no new rule without an observed violation and an agreed boundary |
| Manual trend receipt using existing Git/metrics commands | Surfaces regrowth, moves and co-change without blocking useful work | Small review cost, no automatic prevention; misleading if window is mostly migration | One bounded follow-up after ordinary work; no bot, schedule or mandatory per-PR report |
| Existing per-file budgets | Catches simple length regrowth during a split | Can block valuable in-place fixes; misses responsibility leakage and growth inside headroom | Retain only the existing two, per owner decision; do not expand or mechanically harden |
| Global line/byte limits, zero-growth ratchet, pre-edit hook | Easy to count and explain | False positives, formatting incentives, more context and urgent-fix friction | Reject |
| New generic agent instruction / agent-health signal | Might expose repeated misplacement if existing review misses it | Unproven value, instruction and review noise; duplicates #805 | Defer; no trial design or launch |
| Immediate `shows.ts` decomposition | Could isolate some pure transformations | Import churn, cyclic types and duplicated persistence ownership; no demonstrated need for a wholesale split | Reject for now; a future concrete maintenance need may justify one seam |
| No further intervention | No process or runtime cost | Responsibility drift still relies on existing review | Valid close-out if follow-up adds no useful information |

A useful review comment identifies a behavior and destination, e.g. “This recovery fold already
belongs to `control/outputRecovery.ts`; reuse it and prove the raced-response behavior there.”
“This file grew” is only a prompt to inspect. A callback wiring an existing module is allowed to
grow when that is the clearest implementation. Ownership here means module/state responsibility,
not a new mandatory reviewer, CODEOWNERS rule, or assigned person.

## Start and concurrent work

After this registration lands on main, use:

```text
/plan-run codebase-health until <YYYY-MM-DD HH:MM Europe/Kyiv>
```

Codex also accepts `$plan-run`. Give an explicit end time no more than 24 hours away. Invoking
the command authorizes only the three documentation/evidence phases below for that window.
Registration itself creates no wave, worker, heartbeat or wake task. Use the existing plan-run
continuation and wake mechanism only when the owner actually starts the run.

| Other work | Coordination requirement | Reason |
|---|---|---|
| Another `codebase-health` run | Never overlap | Same spec, evidence and phase notes |
| Any wave | Do not run alongside it | Existing plan-run rule: a wave runs alone |
| `production-page` | Run sequentially by default; finish or pause its active phase first | Phase 1 writes its spec/digest; both may write architecture; older acceptance/budget language needs owner resolution |
| `wizard-shell`, `svg-import-engine`, `noacg-harness` | Serialize phases that write `docs/ARCHITECTURE.md`; other disjoint phases can coexist | Their published plans name that shared document; wizard evidence also has its existing S9 revisit |
| `wizard-ai`, `vmix`, `editor`, `guided-mod`, `ci-plan`, `remote-mcp`, other work | May coexist only after checking the actual phase file allocation | Shared subject matter or files read by this plan are not by themselves write conflicts; architecture/plan edits still need one writer |

Before launch and every phase, fetch main, read existing run/wave records and PR allocations on
the executing machine, and reserve the actual write paths listed below. A repository PR snapshot
cannot establish that another machine is idle. Wait for a conflicting writer; do not cancel,
retarget or alter another run. Read product code at pinned revisions so ongoing disjoint code
changes do not make a receipt ambiguous. No new lock manager or coordination ledger.

## Phases

1. Phase 1 — reconcile ownership and the production-plan handoff (AC-6).
2. Phase 2 — apply the boundary map to real maintenance evidence (AC-7).
3. Phase 3 — record maintenance value and stop or retain the practice (AC-8).

These phases implement the **documentation and existing-review recommendation only**, after the
owner invokes the command with a window. They are not tasks in `work.json`. No new product code,
gates, budgets, agent instructions or separate automation is proposed. A later extraction or check
requires its own concrete evidence and owner review;
these phases cannot expand themselves to create it.

**Launch prerequisites:** this spec and registration landed on main, the owner's command with an
explicit window of at most 24 hours, and a fresh-main overlap check. `work.json.authority` records
agreed preparation/scope only; it is not an open run or permission to start autonomously. The
coordinator records build/check/repair/stop state only in existing plan/wave records. Advance
automatically only after an independent check passes within the window. Stop and ask for reserved
policy decisions; do not decide them unattended. Every phase adds its findings to `## Phase notes`
and keeps this spec's digest in `work.json` current, clearing stale review under existing conventions.

### Phase 1 — Reconcile ownership and the production-plan handoff

- **Depends on:** the owner's bounded invocation; current production-plan coordinator/file
  allocation reconciled. It need not wait for all fourteen phases, but must not edit shared plan
  or architecture files concurrently. A production run already owning them takes precedence.
- **Affected files:** `docs/ARCHITECTURE.md`,
  `docs/work-specs/production-page-refactor/spec.md` and its `work.json` digest if changed;
  this spec's `## Phase notes`. Do not edit the production plan's owner decisions or mark its
  acceptance satisfied. A stale review must be cleared under existing work-spec conventions.
- **Outcome:** distinguish current from planned owners for screen wiring, live state, command
  decisions and persistence; cite landed reuse from #1057. Reconcile the unimplemented D8 budget
  requirement with the owner's no-new-ceilings requirement **before** any production run relies on
  it. Proposed resolution: remove that uninstalled size obligation and express maintenance proof
  through existing ownership/behavior acceptance; owner must approve the exact plan change.
- **Acceptance:** every named current module exists at the new pin; every planned module is labeled
  planned; one current and one intended owner for each responsibility; no duplicate implementation
  work; no numeric replacement gate. Original behavioral protections remain intact.
- **Verification:** independent source/import and plan comparison; work-spec digest/status; targeted
  changed-file gates. No browser/build for a documentation-only handoff.
- **Rollback/coordination:** revert only this phase's documentation commit, preserving any later
  owner ruling; do not revert another plan's code or blindly restore superseded policy. Pause the
  conflicting production phase if the handoff is rejected.

### Phase 2 — Apply the boundary map to real maintenance evidence

- **Depends on:** Phase 1 checked; actual maintenance diffs available at the refreshed main. Use
  already-landed work or independently authorized work; never invent product changes to feed this
  phase. If only migration work exists, record insufficient evidence and close this phase honestly.
- **Affected files:** this spec's phase notes and `evidence/maintenance-review.md`; optionally the
  existing model/domain paragraph in `docs/ARCHITECTURE.md` for a proven clarification. Production
  code, tests and budgets are read-only in this plan.
- **Scope:** inspect changes to `ProductionPage.tsx`, its actual extracted modules,
  `CreationWizard.tsx` and its shell/capabilities, and `model/shows.ts` with `showFolders.ts`,
  `cueClipboard.ts`, `rundownHistory.ts`, `publishedRecord.ts` and the durable/team write seams.
- **Acceptance:** for each selected real change record intent, state/write owner, necessary wiring,
  test owner, any avoidable collateral edits, and useful review action or “no action.” Include a
  justified growing fix and an extraction/move example. Explain whether `shows.ts` has a specific
  independent seam problem; “leave intact” is acceptable. No comment demands size reduction alone.
- **Verification:** independent diff review against pinned parents and existing behavior-test
  inventory (`show-folders.test.mjs`, `rundown-history.test.mjs`, `published-record.test.mjs`, plus
  the affected journeys). This phase checks evidence; it does not claim to rerun production flows.
- **Rollback/coordination:** remove a misleading receipt/clarification in a docs-only revert. Any
  actual product repair belongs to its owning plan and requires that plan's verification. No
  duplicate review bot, new instruction, or unsolicited messages to other project participants.

### Phase 3 — Record maintenance value and stop or retain the practice

- **Depends on:** Phase 2 checked; coordinate wizard evidence with its existing S9 revisit, reusing
  its receipt if available. This is not a second reporting cadence. Lack of ordinary post-refactor
  evidence is a valid result; it
  cannot extend the run, schedule another run, or create a new task automatically.
- **Affected files:** one dated `docs/metrics/<date>-codebase-health.md`, this spec's phase notes and
  evidence receipt. No update to the shared metrics baseline; no scheduler/ledger/code changes.
- **Acceptance:** reproduce size/frequency/growth with pinned history and move handling; distinguish
  ordinary work from migration; report concrete helpful review actions, avoided duplicate ownership,
  collateral-edit burden and actual budget friction if any. State uncertainty and discard the
  practice if it merely restates counts or adds noise. Do not set a numeric success threshold.
- **Verification:** independent reproduction of the sample and arithmetic, targeted document gates,
  and privacy review. Recommend retention, revision or no mechanism from observed maintenance value.
- **Rollback/coordination:** remove the reporting practice with no product rollback. Owner decides
  any budget exception or new policy. Preserve historical receipts as observations, not current
  instructions; final report names unverified outcomes and existing plan dependencies.

## Future evidence needed for an agent-signal trial

Consider a small trial only if real, repeated maintenance cases show agents placing responsibility
in the wrong owner despite an accurate, available boundary and existing review/checks; the error
causes identifiable rework, missed behavior coverage or conflicting ownership; and simpler remedies
(clarify the seam, fix its API, improve an existing check) have been tried or ruled out with reasons.
Separate agent-caused mistakes from transient migrations, stale docs and unavailable instructions.

A proposal must identify a decision the signal would change, evidence existing mechanisms missed,
and how benefit and review burden could be observed using sanitized existing receipts/transcripts.
Consult the existing instruction audit/load evidence and #805 first. File growth, instruction byte
counts, one failure or an agent's self-rating alone are insufficient. Only then ask the owner whether
a trial is worth designing. No questionnaire, telemetry pipeline, scoring formula, new instruction,
trial run or recurring collection is designed or launched here.

## Unresolved owner decisions and evidence limits

Preparation and registration are authorized; no execution window has been supplied and no phase
has started. A future bounded invocation authorizes the three documentation phases. The owner
still decides the exact production-plan D8/AC-11 reconciliation before that plan runs.
Answered 2026-10-17: the owner dropped D8's page limit and AC-11's line count, keeping the
compiled rule (production plan D8, AC-11).
Recommendation: accept responsibility/behavior proof and omit the uninstalled size gate. Existing
wizard budgets stay unchanged by the explicit answer above; a future exception requires its actual
case. The implementation window is not supplied. These are approval boundaries, not open executions.

Ordinary post-split maintenance value, blocked-branch friction, actual cross-machine run occupancy,
full production behavior and live hardware performance are unverified. The measured history and
selected diffs do not prove regression safety, defect causation, or long-term architectural quality.

## Acceptance inventory

AC-1 through AC-5 cover research and command preparation. AC-6 through AC-8 are the phase
acceptance inventory for future execution. No criterion or ledger status opens a run.

### AC-1: Authority and current state are explicit

A reviewer can locate the research-only owner source, both follow-up answers, pinned main, current
production/wizard outcomes, existing budgets and coordination limits without mistaking plans for code.
Layer: document/source review; evidence: `evidence/research.md` and this spec.

### AC-2: Hotspots and friction can be re-derived

A reviewer can reproduce the history window, line/count semantics, baseline, move adjustment and
budget replay, and can distinguish likely friction from actual delay or safety claims.
Layer: read-only Git arithmetic; evidence: `evidence/measurements.json`, `evidence/research.md`.

### AC-3: Recommendations follow responsibility evidence

A reviewer sees justified growth, misplaced-responsibility candidates, temporary migration context,
`shows.ts`'s separate concern, alternative costs, rejection criteria and the deferred-signal rationale.
Layer: sampled diff/source review; evidence: `evidence/research.md` and this spec.

### AC-4: The future plan is bounded and reviewable

Each proposed phase specifies dependencies, affected files, acceptance, verification, rollback and
coordination; uses existing continuation; and cannot authorize code, ceilings or an agent trial.
Layer: document/workflow comparison; evidence: `evidence/verification.md`.

### AC-5: Preparation registers the command without starting it

The preparation changes only this work-spec directory and the existing runnable-plan mapping in
`.agent-workflows/plan-run.md`. No product, gate, budget or agent-rule changes. Ledger v2 has a
matching digest, accurately bounded authority, no execution state and no claim of completed phases.
The registration maps `codebase-health` to this spec through the existing shared workflow; no new
scheduler, window, wave or worker is created. Artifacts omit customer, partner and event names.
Layer: Git scope, registration lookup, JSON/digest, link and content review;
evidence: `evidence/registration.md` (initial research checks: `evidence/verification.md`).

### AC-6: The ownership handoff is current and policy remains owner-controlled

Phase 1's acceptance and verification above pass on an independently checked main revision.
Current/planned ownership is explicit, overlapping writers are reconciled, and behavior protections
remain intact. The exact D8/AC-11 decision has owner evidence before any policy text changes;
without that answer, stop the affected phase and ask. No size gate is installed by this plan.
Layer: independent source/plan comparison and targeted document checks; future receipt:
`evidence/phase-1.md`, plus Phase notes.

### AC-7: Maintenance feedback identifies behavior ownership rather than a size target

Phase 2's acceptance and verification above pass. The receipt includes justified growth and a
move/extraction, distinguishes ordinary work from migration, and explains the separate model
concern. Every suggested action identifies responsibility and its existing proof location;
no-action or insufficient new evidence is an explicit, supported outcome.
Layer: independent diff and test-inventory review; future receipt: `evidence/maintenance-review.md`.

### AC-8: Close-out measures value and leaves no unapproved continuation

Phase 3's acceptance and verification above pass. Pinned arithmetic is reproducible, available
wizard S9 evidence is reused, and recommendations distinguish observed maintenance value from
unknowns. No new numeric threshold, trial, recurring collection or follow-up run is created.
Layer: independent reproduction and document review; future receipt: `evidence/phase-3.md` and
the phase's dated metrics document.

## Phase notes

Registration prepared at the owner's request after research. No phase has started; no window,
worker or wake task is open. Phase checks and the production-plan policy decision remain unverified.
