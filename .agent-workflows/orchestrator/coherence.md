# Keeping the work - and this system - coherent

## Big projects are phased, never one-shotted

Use `specs.md` for the compact spec, acceptance ledger and convergence check. Existing goals
and programme authority remain canonical; no second constitution or retrospective spec project.

Owner, 2026-08-28, for the big roads ahead (the editor, the desktop client, broadcast-scale
control): *"they can't be one-shotted… planned out step by step and implemented with care, one
thing at a time"* - and *"we are not in a hurry. Enterprise software takes years."* The rules:

- **The owner understands it BEFORE it is built.** A big project starts with a DESIGN PICTURE the
  owner can see - the actual screens, menus and flows that will exist, end to end - and he
  ratifies that picture once. *"If I do not 100% understand what we are building then the agent
  might not either."*
- **The agent says what it does not understand.** Uncertainty is stated, never smoothed over with
  confidence - a double-check question in the plan costs a sentence; a confidently wrong phase
  costs the phase. This is not approval-gating: once the picture is ratified, phases run WITHOUT
  per-step human checks.
- **Phases chain automatically.** Each phase is its own session-sized step with its own
  verification and definition of done; the next phase starts from the landed handoff plus a
  fresh-eyes check of what the previous phase built (`night.md`, continuations). The timeline
  lives in the project's plan doc, and the wave loop or the next plan triggers the next phase - a
  human appears at phase boundaries only when the plan names a decision that is genuinely his.
- **Work smart, keep the end game in mind.** A phase that serves the deadline but bends the
  ratified picture gets flagged, not silently shipped.
- **The direction is `docs/GOALS.md`**: each outcome's desired state, its done criteria for this
  phase and the evidence rungs. A big project serves an outcome, and its plan doc carries the
  phases. Never mark a capability complete because its implementation exists - a claim advances
  only when its evidence rung is satisfied.

## The coherence cadence

**A growing project rots its own context, and rot reads as the agents getting dumber.** The model
does not degrade; the written surface does - stale docs teach wrong things, contracts drift apart,
the big picture smears across files until no session can hold it. The standing defences are
structural (the instruction-chain byte RATCHET that only tightens, handoffs consumed not
collected, backlog items that graduate or die, memory entries with exit conditions, and this
system's own 200-line gate, and since 2026-09-16 `check:goals-budget`, which reads GOALS.md's cap
out of GOALS.md's own opening sentence) - but defences that only fire locally miss global drift.
GOALS.md's budget belonged in that list only in INTENTION for three rounds: nothing measured it, so
the file drifted over and was pulled back by hand whenever a coherence round happened to look, four
times in six weeks. The gate is what closed it; the ROUNDS did not, and a coherence round is the
wrong instrument for a rule that can be counted. **Quote the measurement, never the number** - a
line count written into prose is stale within days, which this sentence proved by carrying 419 into
2026-09-02.

So roughly **weekly, one wave carries a COHERENCE SESSION** - fresh context, no other task:

1. **The cold-read test, first and most important:** answer, from root `AGENTS.md` +
   `docs/GOALS.md` alone, what this product is, what the current push is, and what is deliberately
   parked. Every place the answer came out wrong or slow is a doc defect to fix. **Slow counts as
   wrong**: an internal doc earns its length by what a cold reader can act on, and the public-docs
   voice rule (`src/docs/AGENTS.md` "The voice") is the standard here too, one rule short of its
   em-dash gate. Contracts keep their reasoning density, because the reason is what stops the rule
   being re-litigated - but a paragraph that argues with itself, or a section nobody can summarise
   after reading it once, is the same defect as a stale claim and is fixed the same way.
2. Contradictions between contracts (nested AGENTS.md vs root, docs vs code) - fix or file.
3. Docs nothing references and references to nothing - delete or repair; git is the archive.
4. The byte ratchet: tighten `project_doc_max_bytes` where headroom allows. It only moves down.
5. GOALS drift: do the `(now)` outcomes and their current states still match what waves built? Report the gap - the owner
   rules on direction.

Its output is small diffs plus a one-page verdict in its handoff. When no wave has carried one for
over a week, the next plan says so in section 4. Its sibling for the orchestration system itself -
spend, decisions, the skill's own commits - is the weekly `orchestrator-week` workflow.

## Applying a wave's lesson to this system

The principle is in the core ("Learning, without growing the rules"). Learning is continuous, and
it is not adding rules:

- **Record** a meaningful failure or surprising outcome as an observation:
  `npm run learn -- --area orchestrator --evidence "..."`. Records are never loaded automatically.
  `incidents.md` is the frozen history of earlier lessons; new evidence goes to the records.
- **Pattern or one-off?** One ordinary mistake stays evidence. An expensive, repeated or systemic
  failure justifies acting at once.
- **Act in this order**, below, and verify that the change actually prevents the failure.
- **Retire** lessons, workarounds and rules whose reason no longer exists.
- **Synthesize, do not reread.** The weekly session reads the observations recorded since last
  week (`contracts/records/**/*-observed-*`) for recurring patterns and picks at most a few fixes;
  a wave never rereads the whole archive.
- **Measure by outcomes**: repeated failures, stranded branches, open handoffs at the end of a wave
  against its start, wasted work, and verification gaps - never the number of rules.

This is the order of preference when the lesson is an orchestration lesson - a collision class the plan missed, a report section that failed its reader,
a rule that was ambiguous under pressure. Product lessons are not this: they go to the taste rubric
via the owner's rulings, to `docs/backlog/`, or to a prompt. The test: would the fix change what a
SESSION builds, or how a WAVE is planned? Only the second belongs here.

0. **Fix the cause**, or improve the default or the workflow, when that removes the failure.
1. **A hook**, where the mistake has a tool shape - it fires at the call, whether or not anyone
   read a contract (`scripts/hooks/`, `docs/AGENT_WORKFLOWS.md`). A hook that can false-positive is
   a warning; a refusal needs an exact test. A hook reaches Claude Code only; a lesson Codex needs
   too goes in a script, gate or test instead.
2. **A script or a test**, where the fact can be measured or a script's claim can be pinned - the
   tick, the drain, the plan check, the receipts. A contract sentence about what a script does, or
   a number written into prose, is a cache of the instrument; cite the instrument and its test
   instead. Six such caches went false within a week of the split (`incidents.md`, "the four
   cached facts of 2026-09-02").
3. **Durable state**, where a decision must outlive the session that made it - the wave-state file,
   a receipt, a ledger line.
4. **Text, last, and by MOVING, never by adding.** Text changes only for a judgement the master
   itself has to make. The lesson edits the module that owns the rule, its evidence goes to the
   records (`npm run learn`), and a new rule names what it replaced
   or shrank - budget-neutral by default, and the report says so when nothing could be cut. The
   core changes only for a rule that fires before its module loads, and only against its gate.
   The gate counts the core and the common path; the branch modules (`night`, `recovery`, this
   file, `incidents`) it does not, so their only counterweight is this rule and the coherence
   session reading them cold. Always-loaded text comes only when the lesson applies broadly and nothing cheaper can enforce it.

`npm run check:shared-instructions` fails on a core over 200 lines, on a common path over its
budget, on a module nothing links to, on a link to a module that does not exist, and on an
`npm run` script the contract names that `package.json` does not have. Orphans, dead links and
stale commands are how a modular system rots into a single file with extra steps.
