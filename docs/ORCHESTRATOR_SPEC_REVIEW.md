# Orchestrator evolution: preserve execution, strengthen intent and completion

Reviewed 2026-09-14. Scope: the owner's attached architecture brief, preserved under
`work-specs/orchestrator/owner-intent.md`. This is an implementation review, not an instruction to
activate a product programme. The implementation details and remaining proof limits are below.

## Decision

Keep NoaCG's orchestration and landing system. Add a conditional spec-to-wave/evidence link,
replace the instruction to make assignments big, and make worker returns artifact-first. No
Symphony deployment, Spec Kit installation, new tracker, constitution, background daemon or
retroactive spec conversion is justified. The main missing layer is semantic continuity across
deliveries, not scheduling.

Owner requirement: retain autonomous waves on Codex and Claude Code while preserving intent and
measuring completion against behaviour. Derived design: two small feature artifacts plus a
read-only validator integrated into the current wave check. Evidence/rationale: the source and
invariant maps below. This design is reversible without changing any existing job-store format.

## Current system: mechanism, failure prevented, invariant

Read current code and shared workflows first; older review documents are evidence, not present
capability claims. In particular, the 2026-09-05 CLI-auth observations are not current host facts.

| Behaviour | Current implementation / evidence | Failure prevented and decision |
|---|---|---|
| Continuous waves | `orchestrator/night.md`, `wave-watch.mjs`, `ci-watch.mjs`, `wave-tick.mjs`, `candidates.mjs`, `wave-horizon.mjs` | Initial cohort completion must not end a useful authorized window. Keep event/delta observations, candidate refill and fixed deadline. |
| Dependency-aware concurrency | `orchestrator/collisions.md`, `collision-check.mjs`, `worktree-activity.mjs`, `merge-order.mjs`, `candidates.mjs` | Disjoint filenames can still collide semantically or mint the same scarce slot. Preserve TOUCHES/MINTS, three-way merge evidence, explicit chained starts and browser serialization. |
| Stalled/dead worker recovery | `blocked-sessions.mjs`, `claude-agents.mjs`, `orchestrator/hosts.md`, `claude-run.mjs`, `resume-dispatch.mjs` | No new commit is not death; missing from Claude inventory is not absent from Codex. Keep UNKNOWN ownership and accepted claims through ambiguous failures. Never adopt Symphony's timer-based kill as a generic cross-host rule. |
| Starvation pressure | `owner-receipts.mjs`, `handoff-drain.mjs`, `weekly-candidates.mjs`, `wave-plan-check.mjs`, `candidates.mjs` | Old asks must stay visible; a held head candidate must not block an eligible smaller one. Keep age/accounting and ordered fall-through. There is no proof of mathematically bounded starvation under sustained higher-priority input; do not claim one or add an aging scheduler without evidence. |
| Durable state and handoffs | `wave-plan-store.mjs`, `wave-launch.mjs`, `relay.mjs`, `handoff-drain.mjs`, `orchestrator/grounding.md` | Worktree deletion or compaction must not erase active launches, deadlines or unconsumed results. Keep the external wave store and branch-owned committed handoffs; new feature records describe outcome, never duplicate live process ownership. |
| Landing visibility / recovery | `jobs-store.mjs`, `landings.mjs`, `ci-watch.mjs`, `queue-pr.mjs`, `orchestrator/report.md` | A queued job is not landed; empty branches are trivially ancestors; missing notifications must not hide refusals. Preserve transition-based landing events, refusal kinds and re-arm/reconcile procedures. |
| Serialized landing | `queue-merge.md`, `auto-merge.mjs`, `queue-pr.mjs`, `hooks/frozen-branch.mjs` | Green code does not imply the author finished; later commits invalidate a pinned landing. Keep branch-owner declaration, CI and GitHub merge queue authority. |
| Owner boundaries | `GOALS.md`, `NORTH_STAR_2027.md`, `PROGRAMMES.md`, `OWNER_RULINGS.md`, owner receipt/answer checks | Discoveries must not activate parked goals; an unperformed owner walk must not stop unrelated work. Preserve source authority and the existing evidence ladder. |
| Context bounds | `orchestrator/grounding.md`, module routing, `check-shared-instructions.mjs` | Re-reading every incident and full document consumes the coordinator. Keep staged reads and measured common-path/instruction-chain gates. |

The existing phasing rule is good: the owner ratifies the design picture, then phases run
autonomously. Its weak join was `prompts.md`: "should be big", CORE/TAIL cuts and a final QUEUE
could produce useful partial work with no durable acceptance inventory. `wave-plan-check` checked
dispatch shape, not that the parent retained every requirement. This review adds that join.

## External study and choices

### Symphony

Symphony separates repo policy, coordination, workspaces, execution and tracker adapters. Its
attempt success is distinct from issue completion; normal exits can schedule continuation and
reconciliation refreshes eligibility. NoaCG already has counterparts for these ideas, with more
specific landing and owner-boundary rules. Adopt the distinction between attempt, task and parent
completion; retain local claim/recovery semantics. Its documented startup cleanup by terminal
tracker state is insufficient for NoaCG's ancestry and unrebuildable-file safeguards.
Source: [Symphony specification](https://github.com/openai/symphony/blob/main/SPEC.md), especially
sections 3, 7-9 and 17. Read on 2026-09-14; draft v1, not a frozen standard.

Actual component reuse: no drop-in component earns its integration cost here. The reference
implementation uses Elixir/OTP supervision and a Codex client, while this repository uses Node
instruments and native runtime supervision. Reusing its supervisor would create a second owner
of retries/workspaces. Its conformance scenarios are useful review inputs without copying code.
Sources: [reference implementation](https://github.com/openai/symphony/tree/main/elixir),
[implementation README](https://github.com/openai/symphony/blob/main/elixir/README.md).

Codex-specific: the stdio JSON-RPC client launches an app-server, initializes a session and uses
thread/turn methods, sandbox policy and native tool bindings. That client cannot drive Claude Code
unchanged. Provider-neutral: spec identity, task dependencies, attempt receipts, evidence and
landing. Keep native Codex agent/wait/heartbeat routes and Claude Agent/Monitor/background routes
behind `hosts.md`, preserving their different lifetimes. Do not force one protocol on both.
Source: [actual AppServer client](https://github.com/openai/symphony/blob/main/elixir/lib/symphony_elixir/codex/app_server.ex).

### Spec Kit

The current complex-feature guide recommends bounded invocations first, delegation where useful,
and child specs only when lighter boundaries fail. Its spec-of-specs procedure uses a shallow
roadmap with stable slice IDs and bidirectional parent links; it requires no new extension.
Adopt bounded tasks and explicit parent coverage. Adapt the roadmap to the existing programme or
project plan instead of adding another global roadmap. Reject a mandatory full command pipeline
for routine maintenance. Sources: [complex features](https://github.com/github/spec-kit/blob/main/docs/concepts/complex-features.md),
[spec of specs](https://github.com/github/spec-kit/blob/main/docs/concepts/spec-of-specs.md).

The current convergence command evaluates present implementation against feature artifacts and
appends gap tasks without rewriting the spec, plan or existing tasks. Adapt that review loop with
real behavioural evidence and a conservative revision freshness check. Plans/handoffs remain
subordinate to owner intent in NoaCG; an implementation sketch cannot become product authority.
The validator cannot supply the semantic review itself. Source:
[converge command](https://github.com/github/spec-kit/blob/main/templates/commands/converge.md).

### OpenAI harness engineering

Adopt the repository as durable knowledge, brief maps with retrieval, executable invariants and
observable behaviour. NoaCG already has modular workflows, generated contracts, browser evidence
and CI. Do not build another control panel, observability stack or instruction encyclopedia.
The relevant improvement is that a fresh worker can reconstruct its obligation from the feature
record and current code. Source: [harness engineering](https://openai.com/index/harness-engineering/).

### Anthropic context and long-running harnesses

Context is finite: use selective retrieval, durable notes and compact delegate results rather
than streaming investigations into the master. Source:
[effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).

Incremental sessions need clear feature obligations and clean recoverable artifacts; substantial
progress is not completion. Keep NoaCG worktrees, verified commits and handoffs as the initializer/
continuation mechanism instead of introducing another universal initializer agent. Source:
[effective long-running harnesses](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

Fresh contexts and separate evaluation address context anxiety and optimistic self-grading, but
reset cost and benefit depend on the model. The later harness report itself simplifies the
pipeline for a stronger model while retaining QA, which still catches missing core interactions.
Use milestone-based fresh contexts when useful, not compulsory resets every N tokens or a new
planner/builder/evaluator service for every fix. Source:
[long-running application harness design](https://www.anthropic.com/engineering/harness-design-long-running-apps).

## Small implementation and operating model

1. For substantial new intent, write/review a compact spec with stable AC headings and authority
   references. Existing explicit approval counts. New product direction gets owner steering here,
   before implementation, while independent approved rows proceed.
2. Use `work.json` strictly for criterion acceptance and evidence. Bounded units, sizes, dependencies
   and lifecycle stay in existing plans/waves/jobs. The spec contains behaviour, never scheduling.
   A parent integration scenario stays open even if every child shipped its local feature.
3. `SPEC <record> AC-1,AC-2` is optional on the existing prompt, required by workflow for new
   substantial implementation with `SIZE small|standard`. Wave checks validate scope; existing
   candidates/launch controls decide eligibility. Future-dependent rows stay legal. Classification is a
   planner judgment, not a keyword heuristic pretending to understand task size.
4. Workers preserve findings and receipt files, return a short coordination result, and checkpoint
   unresolved IDs before context pressure. A fresh worker starts only after ownership is settled.
5. After each worker finishes, review behaviour against criteria, plan bounded gap work, and repeat.
   The checker distinguishes open records from evidence-complete records; it never interprets a
   process exit as behaviour. Evidence rungs and parent completion still require honest review.
6. Land verified independent slices through the existing queue. Consolidate parallel evidence
   in one assigned row rather than racing on a shared JSON file. The parent remains open when
   unfinished, and resumes under the same original intent in later authorized waves.

The parser reads one acceptance record and one spec plus referenced receipts. It does not load every spec,
run evidence commands, scan transcripts, launch providers, alter deadlines, rewrite goals or
write a second task database. Version 1 migrates on read to v2 without promoting old task flags;
unknown versions fail read-only. The wave tick observes parent acceptance separately from branch
landing using an additive observation field; execution authority is unchanged. Shared thin adapters
reach the same procedure on both runtimes.

## Removed, simplified, or deliberately left alone

- Removed "should be big" and replaced vague tail-cut completion with a bounded observable stop.
- Replaced the blanket claim that subagent notifications never reach their caller with a durable
  artifact return rule. The existing host-specific receipts and relay determine delivery.
- Replaced handoff-WHY verbatim inheritance with a check against active spec/owner authority.
- Added no always-loaded deep module: the measured core stays 199/200 lines; common planning path
  stays at 629/640 after the acceptance-only clarification. This is measured overhead, not a reduction in
  whole-session tokens. Host modules and actual tool output still contribute to real context.
- Kept relay, recovery, claim guards, candidate ordering, serialized browser jobs and queue
  watchers. Native capability does not justify deletion until a same-invariant live trial passes.
- Do not migrate the generated root instruction corpus in this change. Its 72 KB deepest chains
  have an explicit owner follow-up, [issue #805](https://github.com/NoaCG/NoaCG-Studio/issues/805), with
  compiler/ratchet safeguards that a quick rewrite risks. This pilot does not close that concern.

## Verification and rollout limits

The executable tests exercise actual temporary Git repositories and receipt files: a valid
record, lost acceptance IDs, v1 on-read migration, draft scope/large-wave refusal, incomplete
reviews, altered receipts, changed code, untracked code, invalid revisions, malformed records,
both pool labels and legacy waves. They test state/exit behaviour, not only instruction markers.
The build already discovers `scripts/**/*.test.mjs`; no new CI service or package is required.

Passing these tests does not prove a production save workflow, a whole overnight shift, lower
decision-error rates or live runtime parity. Existing transport/recovery regression tests protect
the untouched machinery. A rollout sample should record on each host: task receipt length, bytes
retrieved at restart, retained AC IDs, gaps found after a claimed slice completion, and useful
work resumed without duplicate ownership. Compare with a similar prior wave; do not infer token
savings from the core file alone. No paid probe or unattended wave is started by this review.

Exercise on the selected standing browser-holder recovery request through the real Orchestrator.
If review bookkeeping dominates,
keep one spec and consolidate acceptance rather than adding child specs. If scope checking
is bypassed in a real launch, integrate it with that exact native launch adapter after a
reproduction; do not claim this increment is an unbypassable execution guard. A verifier can also
mislabel size or evidence: semantic review and owner feedback remain necessary.
