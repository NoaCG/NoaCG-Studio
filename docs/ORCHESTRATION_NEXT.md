# The next orchestration architecture

**RATIFIED with corrections by the owner, 2026-09-01.** The core stands as recommended: Opus as
the persistent authoritative master, Fable as a bounded senior consultant, mechanics externalized
but never authority, no second orchestrator. The owner's corrections are folded into the sections
below, the largest being §4: Antigravity has TWO usage pools (Gemini, and a separate Claude/GPT
pool - both largely unused, both reachable through the same `agy` CLI), Codex is
availability-routed rather than the default bulk channel, and Opus is explicitly a major
implementation pool as well as the master. Where a correction conflicted with measured reality,
the conflict is recorded in place rather than smoothed over.

Originally written 2026-09-01 from an investigation of the
orchestration machinery as it actually stands - the orchestrator contract
(`.agent-workflows/orchestrator.md`), the job runner (`scripts/jobs.mjs`, `scripts/jobs-store.mjs`),
the landing path (`scripts/auto-merge.mjs`, `scripts/merge-order.mjs`,
`scripts/safe-merge-preflight.mjs`), the delegation channels (`scripts/codex-rescue.mjs`,
`scripts/agy-run.mjs`, `docs/HARNESS_ROUTING.md`), the verification stack
(`.agent-workflows/check.md`, `.agent-workflows/so.md`, `docs/VERIFICATION.md`, `ci.yml`), the
2026-08-30 wave's handoffs, and the harness facts of Claude Code itself (subagent lifecycle,
scheduling, quota visibility). Every claim below traces to one of those; nothing is designed from
assumption. The owner ratifies or vetoes; nothing here starts on its own.

The question it answers: how to complete more verified, autonomous work across all available
subscriptions while one persistent orchestrator stays in authoritative control.

## 1. The verdict on the master: Opus stays, Fable consults

**The persistent orchestrator should be `opus high`, and this is not close.**

- **The persistent session's tokens are mostly mechanical.** A wave runs 10-20 M tokens/hour,
  almost all cache reads (`docs/HARNESS_ROUTING.md`); the orchestrator itself spends its window on
  state reads, watch ticks, and all-day questions. Fable is roughly twice Opus per token, so a
  Fable master doubles the cost of exactly the tokens that need the least judgement.
- **The contract has already converted most orchestration judgement into procedure.** Fill order,
  letter discipline, the collision classes, the queue policy, the ask-test, the model ladder -
  "every wave improves this file" means each lesson becomes a rule a competent model follows. That
  accumulation is what makes Opus sufficient; a smarter master mostly re-derives what the contract
  already states.
- **A smarter master gains no authority.** The two hard edges - widening the permission posture and
  overruling a merge-safety verdict - are enforced by the harness, not by the model
  (`orchestrator.md`, "the two hard edges"). Fable would be refused at exactly the same points.
- **The recorded orchestration failures were not reasoning failures.** The three stranded branches
  came from two orchestrators overlapping on shared prose (memory `one-orchestrator-at-a-time`);
  the most repeated 2026-08-30 defect was sessions ending while believing a watcher would wake
  them; landings failed on stale pins and dirty trees. Mechanisms fix these. A more expensive
  master would have watched the same failures happen.
- **Fable capacity is the scarcest reasoning pool.** Spending it on residency starves the uses
  where it has real leverage - and the master must stay on one model all session, so the choice is
  total, not per-moment. (Mid-session `/model` switching does preserve context but invalidates the
  prompt cache; the one-model rule stands for a different reason than impossibility.)

**Where Fable earns its cost** - bounded, stateless-in, verdict-out engagements:

1. **Wave-plan review.** Before a big or night wave launches, a fresh Fable session (the `so`
   shape: read-only, repo state only, one verbatim verdict) reads the wave-state file,
   `merge-order.mjs` output and `worktree-activity.mjs` output, and answers: collisions missed,
   scope wrong, work not serving `## NOW`. One engagement per wave that matters. The historical
   plan failures - four of six sessions serving parked goals, a missed shared-slot collision - are
   exactly what a cold senior read catches.
2. **`fable high` wave rows** for direction-turning work, as the ladder already says: difficult
   architecture, design judgement, high-risk decisions, debugging that survived two genuine
   attempts, conflicting evidence.
   *Superseded 2026-09-26: Fable no longer implements or owns a row. Such rows run on Opus and
   consult `design-consult`; see `docs/HARNESS_ROUTING.md`, "Fable: consult only".*
3. **Escalation reviewer** for the highest-risk diffs (section 5's ladder).
4. **The weekly coherence session** - judgement-dense, bounded, and the place where "the agents
   getting dumber" is actually diagnosed.

The discipline that keeps this cheap without making anyone reluctant: **Opus and scripts gather,
Fable decides.** A Fable engagement starts when the evidence is already collected and ends when the
verdict is delivered. One consult costs a rounding error against a wave's token flow - never skip a
warranted one to save tokens. The waste to prevent is residency and volume, not frequency.

**Judge Fable's usefulness over meaningful engagements, never by verdict statistics** (owner,
2026-09-01). A run of `AGREE` verdicts does not demote the consult - agreement on plans that were
in fact sound is the instrument working. What counts is whether, across the engagements that
mattered, it caught consequential mistakes, improved important decisions, or prevented expensive
wrong turns. Do not be afraid to use it when getting something right genuinely matters.

## 2. What must remain inside the persistent session

The master holds **authority and judgement, never memory**. Durable state already lives in files by
contract (the wave-state file, handoffs, the owner queue, the job store - "a continuation prompt
printed only in chat does not exist"), which is also what makes context compaction survivable.
Keep that. What cannot leave the session:

- **Wave planning and prompt authorship** - the collision pass over TOUCHES/MINTS, scarce-slot
  allocation, the pushback section, sizing to the window.
- **Launch and hold decisions**, including follow-on and continuation launches. The trigger check
  is deterministic; the decision to launch, and the safety classifier that guards it, ride the
  session.
- **Collision rulings** - which version wins when two branches touch one file. A merge cannot
  decide this; the 2026-08-30 docs-map incident is the proof.
- **Handling refusals.** Everything `auto-merge.mjs` refuses - `caution`/`hold` verdicts, integration
  conflicts, red-vs-damaged CI, red main, stale pins - is refused *to a judgement*, and that
  judgement is the master's (or a session it assigns).
- **The ask-test and the alignment questionnaire** - deciding what is genuinely the owner's.
- **The morning report** - synthesis for a non-technical reader.
- **The contract's own evolution** under its carve-out.

## 3. What moves out, and how

Most of the machinery is already outside the session, and the landing path is the existence proof
that the pattern works: a deterministic executor with a strict refusal protocol (`auto-merge.mjs`
retries nothing but `main-moved`; everything ambiguous stops loudly), serialized by the job runner,
with the LLM consuming refusals rather than performing merges. **Apply the same pattern to
observation.** Do not build a second orchestrator; scripts do not forget their role, cannot widen
their scope, and are not one more thing to supervise.

Already external and correct: landing and its serialization, CI and the preflight's mechanical
judgement of CI evidence, RAM reclaim, port reservation, stall detection
(`blocked-sessions.mjs`), collision input (`worktree-activity.mjs`), merge ordering
(`merge-order.mjs`), the morning CI verdict (a scheduled task writing a `.local.md`), and spend
metering (`harness-usage.mjs` plus the agy ledger).

**To move next, in order of leverage:**

1. **`scripts/wave-tick.mjs` - the watch tick as one command.** Today a tick is several tool calls
   the master runs and parses (`git fetch`, per-branch ancestor checks, `npm run jobs`,
   `blocked-sessions.mjs`, the heartbeat append). One script does all of it, appends the heartbeat
   line to the wave-state file itself, and prints only the DELTA since the last tick: branches
   newly landed, jobs newly refused (and which of the kinds), sessions newly waiting, follow-on
   triggers now true. A no-event tick prints one line. The master's loop stays (self-paced
   `/loop`, additive-never-load-bearing, exactly as contracted) but a tick shrinks to one call and
   a short read. Authority does not move; token cost does.
   *Not* a cron job: scheduled tasks spawn fresh sessions, which is right for independent reports
   (the morning CI verdict) and wrong for wave supervision - a fresh session has no plan context
   and no authority, and becomes the fragile second orchestrator this design refuses.
2. **A review verdict artifact** (section 5) - moves review bookkeeping out of self-reported prose
   and gives the landing path something to check.
3. **A delegation outcome ledger** (section 6) - moves routing evidence out of files that get
   swept. The 2026-08-30 SVG trial's full grading table (18/18 usable, 4.48 M tokens) survives
   only in git history because its handoff was consumed; that loss class ends.
4. **Allowlist entries for the delegation and metering commands** (`scripts/codex-rescue.mjs`,
   `npm run agy`, `npm run harness:usage`) in the tracked `.claude/settings.json`, reasoned
   per-entry as the permissions doctrine requires. Today every delegated launch is a permission
   prompt, against the standing rule that a wave must never depend on one being answered.
5. **The ended-expecting-a-watcher gap** (the most repeated 2026-08-30 failure; candidate row 2 in
   memory). Two halves: prompts already carry QUEUE-as-last-action; the mechanism is DETECTION
   FROM OUTSIDE - `wave-tick.mjs` reports "branch green and clean, session idle, nothing queued"
   as a delta event, and the existing SessionStart notice covers the session's own next start. An
   in-session Stop hook was considered and rejected: it fires at every turn end (warning on every
   mid-work pause once a step is committed - noise that trains everyone to ignore it) and a
   crashed session never fires it at all. A warning, not a gate; visibility is what was missing.

**Heartbeat on a cheaper model is the wrong rung.** Cheaper than an Opus tick is a script tick; a
Sonnet/Haiku watcher session would cost more than the script, could still misread, and adds a
supervisee. Cheap Claude models keep their existing role - read fan-outs inside sessions - and the
routine-status role goes to the tick script's output, not to a model at all.

## 4. The worker pools

Rewritten 2026-09-01 to the owner's ruling: **route by actual available pool capacity as well as
by capability.** The fact that changed the picture: **Antigravity carries TWO separate usage
pools** - one for Gemini models, one for Claude/GPT models - and the owner barely uses either
outside NoaCG, so both hold paid-for capacity that otherwise idles. `agy models` confirms the
second pool is reachable through the same CLI: `claude-sonnet-4-6`, `claude-opus-4-6-thinking`
and `gpt-oss-120b-medium` sit beside the Gemini Flash/Pro tiers, and `agy-run.mjs` already takes
any pinned `--model`, so no new channel is needed - only routing, grading and pool attribution.
Native Codex is the opposite case: the owner uses it heavily elsewhere (96 M tokens on another
project in one recent 72-hour stretch), so its NoaCG capacity is volatile and some days near
zero. The objective is not emptying meters - it is productive use of capacity already paid for,
and never spending a scarce pool on work an abundant one could do equally well.

**Antigravity Gemini - aggressive, and graduating from reads to volume.** Reads now:
cross-file comprehension, corpus sweeps, site-finding, long-doc summarization, bounded artifacts
judged before use - `gemini-3.7-flash-high`, always through `npm run agy` (the ledger is the only
record that exists), always absolute paths, never trivia (the ~18 K input floor per call makes
microscopic tasks net-negative; give it tasks substantial enough to justify delegation). Writes:
**test Flash High as a high-volume worker on simple, well-scoped, low-risk coding tasks, starting
with the writing head-to-head - and graduate quickly.** Do not assume its diffs are good before
measuring (they never have been), but do not leave it read-only indefinitely either: a
`(harness, model, task-class)` pair with a run of accepted outcomes in the ledger moves into
normal high-volume use. The measured hazards stand: half of all calls so far billed and returned
nothing (auto-denied tools or the print timeout), and wrong-checkout reads from linked worktrees
without absolute paths.

**Antigravity Claude/GPT - the second unused pool, to be exploited deliberately.** Same wrapper,
same rules, separate meter (per the owner; no headless quota surface can confirm the split, so
the ledger records pool per call and the evidence accrues either way). Start with one graded
delegation experiment - a well-specified mechanical write on `claude-sonnet-4-6` or
`claude-opus-4-6-thinking` - and route real volume by its results. When a model here can do the
work reliably, **prefer this pool over spending scarce native Codex capacity.**

**Native Codex - excellent, and availability-routed, never structural.** The delegation grades
stand: strong on work that is long to do and short to specify, and it refused a bad instruction
because the spec demanded proof - keep that spec discipline. But: **no wave may structurally
depend on Codex being available**; the plan reads the newest rate-limit snapshot
(`npm run harness:usage`) at plan time, treats availability as three-valued - headroom / low /
UNKNOWN (the snapshot only exists when Codex itself recently ran, and the newest one on record
reports no percentages at all) - and routes unknown like low; every Codex row names a fallback
pool; and there is **no percentage pacing target** - when capacity is there and the task suits
it, use it freely, and when meaningful verified work genuinely exhausts the subscription, that is
a reason to upgrade it, not a routing failure. Two mechanism gaps to close: `codex-rescue.mjs`
injects no default effort (the owner's "high is the norm" ruling lives in one laptop's config
file that nothing checks), and the wrapper's job JSON carries no token counts (the rollout files
do - the ledger reader covers it).

**Claude/Opus - the master AND a major implementation pool.** Claude Code Max capacity is
substantial, and the owner is explicit: do not over-optimize away from Opus. `opus high` (or
`medium` for settled work) stays the default wave-row tier; there is no requirement to push
routine work down to Sonnet because it is cheaper - Sonnet takes rows that are genuinely
mechanical, as the ladder already provides. The principle: **avoid wasting Opus on work that
should not require an LLM at all; do not avoid Opus on useful engineering work merely because a
cheaper model exists.** Complexity invented to save Opus tokens is itself the waste.

**Every pool shares the non-negotiables:** nothing external owns landing, gating, merging,
repo-contract judgement, design taste, or migrations; every delegated result passes the
verification ladder before it lands; every delegation goes through its wrapper so the spend and
the outcome are recorded.

## 5. Verification: layered by risk, recorded by artifact

The gap the verification investigation found: the machine-checkable half is genuinely independent
(CI on the integrated sha; the preflight refusing to take a green tick at face value; the catalog
gates measuring rendered output), but the judgement half is mostly **the worker session reviewing
itself** - `/check` runs in the worker's own context, its review leg silently degrades to `inline`
(same session grading its own diff) whenever the skill returns fan-out instructions, and the only
record of which happened is a self-reported prose line. Nothing in the landing path checks that
review happened at all. That was tolerable when every worker was an Opus session under the full
contract; it does not survive cheap-worker diversity.

**The ladder, cheapest first, escalating on risk - never on ritual:**

0. **The spec demands proof.** Delegation specs require the worker to verify from read-back state,
   not from what it was handed. Measured to work: it is what made Codex refuse a corrupt fixture.
1. **Deterministic gates, unchanged.** `npm run build`, the affected/integration e2e plan, the
   catalog gates when touched, CI green on the integrated sha - the queue already enforces the
   last. Independent of every worker by construction.
2. **Independent review scaled by risk.** `/check` stays the per-branch chain, with one change of
   spine: a diff from a cheap or external worker must not accept `inline` as its review mode - the
   review leg runs in a context that did not write the diff (the delegating Claude session
   re-deriving counts; so does a fresh reviewer). Low-risk mechanical diffs: Opus review is
   enough. Contracts, migrations, export formats, the state-machine schema, the control layer,
   security surfaces, repeated failures, conflicting evidence: a fresh independent session, Fable
   where the decision turns the day.
3. **Re-derivation, spent where it still earns.** Today's rule - re-derive every delegated result
   from scratch - is the right default for a new (harness, task-class) pair and is also why
   delegation currently saves less than it should: the verification is paid on Claude's meter.
   Relax it per pair, on ledger evidence only (section 6): a pair with a run of accepted outcomes
   moves to targeted verification (spot re-derivation plus the deterministic gates); any defect
   drops it straight back. The run must be over rows ATTRIBUTABLE to the worker - a row that
   failed on our own invocation is evidence about us and counts neither way (`harness-usage.mjs`
   does that exclusion). This is the single biggest throughput lever in the whole design.
4. **A verdict artifact, and the landing path reads it.** `/check` (and any independent review)
   writes a small machine-readable stamp - branch, merge-base sha, **the exact reviewed HEAD
   sha**, changed-file list, per-leg mode (`delegated`/`inline`/`discarded+inline`/`not run`),
   findings/fixed counts, reviewer model and effort. **Any commit after the reviewed sha
   invalidates the stamp** - the same discipline as the queue's commit pin. The technique for
   judging a stale-but-maybe-still-covering stamp exists already: `classifyEmptyPlan` re-runs the
   planner over a delta to decide whether an empty CI plan was legitimate - the same shape
   answers "does the recorded review still cover HEAD", and anything it cannot prove inert means
   re-review. In a later phase, `auto-merge.mjs` gains a review-coverage refusal kind beside its
   existing ones, and review stops being a thing sessions remember to do honestly and becomes a
   thing the landing path can see. `/so`'s four verdicts (`AGREE`/`AGREE WITH
   CORRECTIONS`/`DISAGREE`/`CANNOT JUDGE`) become routable the same way instead of dying in a
   chat window. **The stamp shape (v1):** one JSON file per branch at
   `<git-common-dir>/noacg-jobs/checks/<branch-with-slashes-as-dashes>.json` - per-machine state
   beside the job store, never committed:
   `{ v: 1, branch, mergeBase, reviewedSha, files: [...], legs: { review: { mode, findings,
   fixed, model, effort }, simplify: { ... }, verify: { ... } }, verdict, at }`.
   **Inspection is not authority:** a reviewer - fresh session, cheap model, Fable - inspects a
   diff and writes a verdict; the persistent master interprets exceptions and decides what
   proceeds. Writing a stamp makes nobody a second orchestrator.

Occasional double- and triple-checking of consequential work is explicitly in-policy (the owner
has said so); what the ladder forbids is *uniform* duplication. The escalation triggers are risk
class, first-time task class, conflicting evidence, and repeated failure - not model brand in
either direction: Opus/Codex output does not skip layer 1-2 because the model is strong, and a
Flash diff does not automatically summon Fable.

## 6. Routing on outcomes instead of impressions

`docs/HARNESS_ROUTING.md` already holds the doctrine ("an entry with no evidence behind it is an
opinion") and the orchestrator contract already mandates grading every delegated row. What is
missing is machine readability and durability: grades live in prose, some only in handoffs that
get consumed, and no label ties a ledger line to the task it paid for.

**One writer, one shape:** `~/.noacg/delegation-outcomes.jsonl` - beside the agy ledger, outside
the repo for the same reasons (per-machine, survives worktrees, no append conflicts). One line per
delegated or reviewed row: timestamp, wave letter, task class, harness, **pool** (the two
Antigravity pools kept distinct from native Codex and from Claude), model, reasoning effort, spec
bytes, wall clock, usage on that harness's own meter (unsummed, per that harness's own counting),
**outcome** (clean / reviewed / repaired / unusable) and **cause** (worker / prompt / capacity),
review findings, defects, retries, **redone-by** (which model had to repair the work, if any), and
the **final landed sha**. Writers: the delegating session (a small helper
script, so the format cannot drift), and later the verdict artifacts. Reader: `harness-usage.mjs`
grows a summarizer - acceptance rate and cost per (harness, pool, task class) - which the
orchestrator reads at plan time alongside the usage report. `HARNESS_ROUTING.md` stays the
judgement layer on top; the ledger is what stops it being archaeology.

**The metric is verified useful work produced per scarce capacity consumed** - never raw token
counts compared across providers, which measure different things counted differently. Routing
follows the evidence over the static beliefs: if Flash proves excellent for a task class, it gets
heavy use; if a "cheap" route keeps generating retries and review work, it stops being treated as
cheap; if Opus keeps handling a class correctly and Claude capacity is ample, Opus keeps it.

The same plan-time read covers capacity: Codex 5-hour and weekly percentages when a snapshot
exists (three-valued - headroom / low / UNKNOWN, since the snapshot only appears when Codex
itself recently ran), agy spend (tokens only - neither Antigravity pool publishes an allowance),
Claude tokens by project (its own window percentage is not readable anywhere, so the master plans
against dollar-weighted model choice rather than a gauge that does not exist).

## 7. The architecture in one paragraph, and the experiment

**The master plans and judges; scripts observe and execute; workers build; verification is layered
and recorded; the ledger routes the next wave.** No new daemons, no standing coordinator sessions,
no second orchestrator - the merge/landing coordinator, heartbeat substrate, verification chain
and capacity meter all exist today in embryo and get strengthened, not duplicated.

**Phase 1 - mechanisms (one branch, ordinary session):** `wave-tick.mjs` - including the
green-but-unqueued detection, which lives HERE rather than in a Stop hook (a Stop hook fires at
every turn end, so it would warn on every mid-work pause once a step is committed, and a crashed
session never fires it; the tick sees the same state from outside without either failure);
`agy-run.mjs` gains `--mode plan` as the read-only default, an explicit `--write`, and a required
`--label`; `codex-rescue.mjs` gains the default effort floor; allowlist entries for delegation
and metering commands; the outcome-ledger writer and the `harness-usage` summarizer; the verdict
stamp defined and written by `/check` as a convention.

**Phase 2 - the experiment (the next night wave), sized to actually learn something:** master
`opus high`, launched headless-first (auth verified at plan time - subagent workers die with the
master, headless ones survive it); one bounded Fable plan review before launch where the wave
warrants it; **Opus High/Medium carrying substantial implementation rows** (the master model and
the default worker model are separate decisions - Opus is both); **Flash High given enough real
work to judge** - suitable read fan-outs AND the writing head-to-head plus deliberately chosen
simple write tasks, independently verified; **one graded agy-Claude/GPT delegation** from the
second pool; **Codex rows where the plan-time snapshot shows headroom and the task suits it**,
each with a named fallback pool; stronger independent verification on every new
(harness, model, task-class) pair. The experiment must not be so cautious it fails to test
meaningful delegation - and the landing and verification standards do not bend to make the
numbers look better.

**Phase 3 - only after evidence:** the auto-merge review-coverage refusal kind; per-pair
relaxation of re-derivation; revisiting the soft one-orchestrator rule once file territories make
two waves collision-free.

**Evidence that decides what happens next:**

- Orchestrator tokens per watch tick, before and after `wave-tick.mjs` (from `harness-usage` by
  project).
- The Fable consult's record over meaningful engagements: consequential mistakes caught,
  important decisions improved, expensive wrong turns prevented - never a count of `AGREE`
  verdicts. A `DISAGREE` that proved right remains the one signal that would argue for moving
  Fable closer to the master role.
- First-pass rate and verified cost per (harness, pool, task class) from the ledger - the input
  to graduating Flash and the second Antigravity pool into volume, to relaxing re-derivation,
  and the honest answer to "are we getting our money's worth".
- The Codex availability snapshot at plan time and wave end, and how often rows fell to their
  fallback - the test of availability-routing, replacing any percentage target.
- Landing-friction vitals (refusals and re-queues per wave, already section 7 of the report) and
  defects that escaped to main (`docs/CI_STABILITY.md` classes) - the proof that speed did not
  buy regressions.
