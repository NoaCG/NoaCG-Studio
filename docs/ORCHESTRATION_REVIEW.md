# The orchestrator reviewed with fresh eyes - 2026-09-02

An independent read of the modular orchestrator contract (`.agent-workflows/orchestrator.md` and
its nine modules), one day after the split landed. Written by a session that did not perform the
split. Phase A below was written BEFORE the comparative study in Phase B and before any edit, and
it is not revised afterwards; later phases append to this file rather than amend it.

The two false statements that motivated this review were already known when it started: a landing
check that returns true for a branch with no commits (`night.md`, fixed by row K), and a line count
that was stale on the day it was written (`coherence.md`, fixed by row M). Both are prose restating
what a mechanism or a measurement already knows. Phase A hunts for more of that class.

## Phase A - the verdict, before anything else

### The cold-read test, from the core alone

Answered from `orchestrator.md` (170 lines) without opening a module:

| Question | Answer from the core | Verdict |
|---|---|---|
| What may the master do | plan; edit its own contract; write the wave-state file; keep its home; launch a follow-on it planned | clear (lines 13-47) |
| What may it never do | merge, push, commit, build, test, edit product code, touch another worktree | clear, and stated three times (the opening section, "No exception touches landing", and four bullets of the closing "Rules") |
| What an invocation produces | seven sections in order | clear |
| How a wave is built | fill order for capacity, one row per session, order-free, big multi-step prompts | adequate; cohorts and sizing are a module away, correctly |
| Collisions and resources | five one-line rules plus a pointer to `collisions.md` | clear |
| How workers and models are routed | **not answerable.** The word appears once, inside the routing-table row for `prompts.md` ("the model ladder, delegation and harness routing"). No rule in the core says routing is a decision the plan makes | **defect** - a plan can omit it without breaking any stated rule, which is what the 2026-09-01 night wave did (ten rows, all Opus) |
| Verification and landing | QUEUE is mandatory and last; `check` is a named specialist workflow; section 3 reports the queue's verdict words | clear |
| An unattended night | enter the watch loop after section 6; 24-hour ceiling; "everything marked *night* is mandatory" | clear as a pointer; only one thing is actually marked *night* |
| Where to go for a branch | the routing table | clear, with two weak rows (below) |

Slow counts as wrong, and two things are slow. Section numbers are used as vocabulary across the
whole system ("a section-4 pushback, a section-6 line", "section 2's collision instrument"), so a
reader inside any module has to hold the core's numbering to decode a sentence. And the closing
"Rules" section is the opening section again in different words; a reader checks whether it adds
an exception and it does not.

Two routing rows have weak triggers. `coherence.md` is reached by three unrelated events
("phasing a big project; the weekly coherence session; applying a wave's lesson to this system"),
so a session applying a lesson does not know it is the same module as project phasing.
`prompts.md` is loaded to write section 5, but the routing decision it contains is not named as a
step in the core, so nothing tells the planner that writing prompts includes choosing pools.

### The modularization, judged by path context rather than corpus size

Line counts measured today (`wc -l`): core 170; `grounding` 66, `collisions` 138, `pushback` 28,
`prompts` 188, `night` 146, `report` 51, `recovery` 82, `coherence` 91, `incidents` 173. Total
1133, against 924 before the split.

What a real run actually loads:

| Path | Files the contract itself requires | Lines |
|---|---|---|
| any plan (sections 1-6) | core + grounding + collisions + pushback + prompts, and report.md for its one-line placeholder | 590 (641 with report) |
| night wave | the above + night + report | 787 |
| night wave with one recovery and one incident lookup | + recovery + incidents | 1042 |
| a worker-routing decision | prompts (188) -> `docs/ORCHESTRATION_NEXT.md` section 4 (~60) -> `docs/HARNESS_ROUTING.md`, whose table says "read with the last two entries" (~270 of 1285 lines) | ~520 for one decision |
| a follow-on or continuation | night.md alone | 146 |
| a stale or contradictory handoff | the show-ref check in grounding, "Consuming the handoff folder" in collisions, and the consumed/spent/deferred rule in the core | ~40 relevant lines across three files |
| a landing refusal | report.md section 5, then the `queue-merge` workflow | 5 + 164, correctly specialist |

So the verdict on progressive disclosure is split. **The rare half of the system is disclosed
well**: `night`, `recovery`, `coherence` and `incidents` (492 lines, 43% of the corpus) are read
only when their branch fires, and `incidents.md` is a genuine improvement - evidence left the rules
and the rules got shorter. **The common half is not disclosed at all**: every invocation writes
sections 1-5, so `grounding`, `collisions`, `pushback` and `prompts` (420 lines) load every time.
The always-loaded context of a plan is about 590 lines, not 170. That is a 36% cut against 924,
which is real, but the modularization handoff's "82% cut" measures the core and calls it the
always-loaded context, which it is not.

Splitting the common path into four files also cost something: they cross-reference each other
(`collisions` cites `prompts`' confirmation pass, `prompts` cites section 2, `pushback` cites
`grounding` and `collisions`), and two rules live in two of them because each half thought the
other might not be loaded (the handoff classification in core and `collisions`; the confirmation
pass in `collisions` and `prompts`).

The core restates more than the two rules the handoff admits to. Counted: order-free/no WAIT, no
user step, WHY is a target, THE WHY MUST BE TRUE, multi-step assignment, every pasted task gets a
prompt, a finished session leaves nothing running, a chat-only continuation does not exist,
handoffs are consumed, one browser job, the owner queue is a record, and the four closing Rules -
each also stated in the module that owns it. The gate does not force this: a pinned marker is
satisfied anywhere across core and modules. They were kept on the reasoning that they "fire while
writing sections 1-5", but `prompts.md` is loaded to write section 5 anyway, so the copies buy
nothing and cost the core about 35 lines of its 200.

### False and cached facts, beyond the two already known

Every claim below was checked against the repository or a command run today.

1. **`incidents.md`, "the file that reached 924 lines": "gated all three properties in
   `npm run check:workflows`".** Wrong script. `check:workflows` validates GitHub Actions YAML;
   the modular gate is `check:shared-instructions`. Same class as the stale line count: written
   from memory the day the gate was built.
2. **`grounding.md`, the landing path: "`auto-merge` ... refuses any branch with NO WORKTREE -
   verify both at plan time".** False since the temporary-worktree carve-out landed
   (`scripts/auto-merge.mjs` line 245, "NO WORKTREE IS NOT A REFUSAL ANY MORE").
   `queue-merge.md` says the opposite and is right. A planner following `grounding.md` would hold
   a closed session's branch for no reason. [`docs/backlog/auto-merge-needs-the-temporary-worktree.md`](https://github.com/NoaCG/NoaCG-Studio/blob/e1f3d37d3a866c751a0c067fb95032e7f099c5eb/docs/backlog/auto-merge-needs-the-temporary-worktree.md)
   is the same fact one step staler: it asks for what already exists.
3. **The wave-state file is not what the core says it is.** Exception 3 says it holds "the wave
   table and every prompt verbatim at wave start, one heartbeat line per watch tick, nothing
   else". Both 2026-09-01 files hold candidate rows, an unplanned-row justification, corrections
   to what the owner was told, and standing rulings, and `wave-tick.mjs` writes the heartbeat
   itself. The practice is better than the rule (that free text is the only receipt of the night)
   and the rule should follow it. Worse, the file's ADDRESS is ambiguous: the day wave and the
   night wave of 2026-09-01 both used `2026-09-01-wave-plan.local.md`, in two different checkouts,
   and the plan handed to a fresh session was named `2026-09-01-night-wave.local.md`, which
   `wave-tick.mjs`'s `newestWavePlan` filter (`includes('wave-plan')`) would never find.
4. **The home is not where the state lives.** Exception 4 and `grounding.md` say every later
   command runs from `.claude/worktrees/orchestrator`. The night session that used the rebuilt
   contract ran from a branch worktree, its wave-state file and tick heartbeats went there, and
   the home sits at a commit behind `origin/main` between invocations. Not a false sentence, but
   a rule the first real run did not follow, which is the same failure as a false sentence.
5. **`night.md`, the watch loop: "the built-in `/loop` with no interval".** In both observed
   night waves the loop died: 2026-08-30 after tick 8 (about six hours dark), 2026-09-01 between
   ticks 22 and 23 (4h57m dark, the 02:18 wakeup never fired). The contract's "additive, never
   load-bearing" rule is what saved both nights, and it is right. But the assumption that a
   self-paced loop stays awake is empirically wrong half the time, and each morning reports it as
   a defect rather than the system having a fallback.
6. **`prompts.md` carries provider economics as contract text**: which Codex model the
   subscription exposes, which Antigravity model is the default, that two pools exist. True today;
   all three changed within the last four days; none of them is a judgement the master needs, and
   `docs/HARNESS_ROUTING.md` plus the ledgers are the source.
7. **`grounding.md`, "The foreground-wait guard can false-positive on a loop shape beside a queue
   read".** The matcher was rewritten to test per shell segment (`scripts/command-match.mjs`,
   `pollsQueue`) after that report; whether the exact shape still fires is untested either way.
   A contract sentence about a guard's behaviour is a cache of the guard's tests. Cite the test.
8. **`orchestrator.md` line 51: "A `*.local.md` there was written by a machine (the morning CI
   verdict)".** `docs/ROUTINES.md` lists three routines and none writes a morning CI verdict;
   `docs/ORCHESTRATION_NEXT.md` section 3 lists the verdict as already external. Whether such a
   scheduled task exists on this machine is checked in Phase C; either the sentence or the
   routines doc is wrong.

Four of the eight are the same shape as the two known ones: prose describing what a script does or
what a number was. The environment answered every one of them in under a minute.

### What improved

- Evidence separated from rules (`incidents.md`); the rules read faster and a rule-changer can
  still find the story.
- `recovery.md` is new, correct in its split on "has it landed", and safe inside the contract.
- The gate is real and was negative-tested: core over limit, orphan module, dead link.
- The routing table is an honest index of the rare half.
- The rare half (night, recovery, coherence, incidents) is only read when it fires.

### What worsened

- Total contract text grew by 209 lines, and the always-loaded path is about 590 lines, not 170.
- The core spends about 35 lines restating module rules, and its closing Rules section restates
  its own opening.
- Four common-path modules cross-reference each other and hold two rules twice.
- A routing decision runs a three-file pointer chain ending in an append-only file that asks to
  be read from the end.

### What is overcomplicated

- Section numbers as system-wide vocabulary.
- The wave-state file rule versus its practice, and its ambiguous name.
- `prompts.md` holds three different phases (writing, routing, confirming) with routing buried at
  line 146 of 188.

### What I would undo

Nothing structurally. Re-merging the files would cost churn for no context gain, and the rare half
is well placed. What I would stop is the accounting: the core is not the always-loaded context, and
gating 200 lines of core while 420 lines load beside it every time is measuring the wrong thing.
The number to gate is the common path. The number to shrink is the same.

### The one architectural sentence

The modularization is a real improvement to the rare half and an accounting change to the common
half, with four more cached facts of the known class found in one afternoon. The design is right;
the measurement and the fact discipline are not yet.

## Phase B - Pocock's skills as a second lens

Read after Phase A was written: `writing-for-agents` and its mechanics file, `wayfinder`,
`to-tickets`, `code-review`, `handoff`, `diagnosing-bugs`, `implement`, and the README's split
between user-invoked orchestration and model-invoked discipline. The question was never "how do
we copy this"; it was which of his findings about agent attention expose variance or waste here.

### Where the modules sit on his information hierarchy

His ladder is in-file step, in-file reference, disclosed reference; his disclosure test is
branching (inline what every branch needs, push behind a pointer what only some branches reach);
his other cut is by sequence, keeping later steps out of view so the current one gets its legwork.

| Module | Every branch needs it? | His verdict | Ours |
|---|---|---|---|
| `grounding`, `collisions`, `pushback`, `prompts` | yes, every plan | not disclosure by branch; but a legitimate split BY SEQUENCE - the plan is a recipe (ground, form, check, push back, write, confirm) and keeping the later steps out of view is his cure for premature completion | keep the split, stop calling it disclosure, gate the SUM as the honest always-loaded number |
| `night`, `report`, `recovery` | no - a branch | disclosed reference behind a pointer, correctly | keep |
| `coherence` | no | disclosed, but its pointer names three unrelated triggers | sharpen the pointer |
| `incidents` | no | disclosed reference; exactly his "the reason behind a choice" that a cache is allowed to hold | keep, append-only |
| provider facts in `prompts` | no | a cache of the environment (`agy models`, `harness:usage`, the ledgers) - stale by construction | move to the evidence file and the meter |

So Phase A's accounting stands and gains one nuance: the four-way split of the common path is a
sequence split, whose benefit is attention per step rather than tokens, and the total still needs
gating.

### Context pointers

Audited every row of the routing table against his three rules (front-load the leading word, one
trigger per branch, cut identity the body carries):

- `grounding` "first, before any other read" - good.
- `collisions` "writing section 2: TOUCHES overlap, scarce slots, cohorts, RAM, launch paths and
  classifier refusals, the two append-only files" - a table of contents, not a trigger; the
  trigger is "writing the collision pass". Trim.
- `prompts` "writing section 5: the prompt block, the model ladder, delegation and harness
  routing, the confirmation pass" - hides the routing decision inside a list. Routing needs its own
  row and its own leading word, because it is the step that was skipped.
- `night` - good. `report` - good. `recovery` - good.
- `coherence` "phasing a big project; the weekly coherence session; applying a wave's lesson to
  this system" - three triggers, only the second is what the module is for. The first belongs to
  `docs/PROGRAMMES.md`, which the module already says; the third is the self-improvement rule and
  belongs in the core as one sentence.
- `incidents` - good.

Chains: a routing decision walks `prompts` -> `ORCHESTRATION_NEXT` section 4 -> `HARNESS_ROUTING`
from the end. Replace with one module that states the judgement and points at the meter and the
ledger for the numbers.

### Index, not store

The core is already close to his map: destination (the push), the fill order, the seven outputs,
the routing table. What it also is, and should not be, is a second store of module rules. The
control plane reads: authority -> ground -> form the wave -> route -> supervise -> verify and land
-> report, and every rule that is not needed before its module loads leaves the core.

### Frontier and fog

Tested against the existing rules. **Frontier** ("actionable now") retires three statements of the
same triple - a row's why traces to the push or an active programme or an owner ask, its files are
free, and it waits on no human - which today appear as the fill order in the core, "waiting on the
owner disqualifies" in `night.md`, and the backlog README's drain order. Adopted, defined once in
the core, used in `night.md` for continuations. **Fog** is not adopted: `docs/PROGRAMMES.md`
already names IDEA and DESIGN states, and a synonym beside them is jargon.

### Positive rules and leading words

The authority boundary keeps its negatives; they are the hard guardrail. Elsewhere the closing
Rules section (four negatives restating the opening) goes, and "Landing authority belongs to the
queue" replaces the scattered "never merge" clauses. Section numbers as vocabulary are replaced by
the sections' names where the modules are edited anyway.

### Completion criteria

| Phase | Today | Observable definition of done after this pass |
|---|---|---|
| grounding | "then always - the cheap set" | every listed command has been run this invocation and the plan-time state is written into the wave-state file |
| collision pass | "do a deliberate pass" | every pair of rows is either disjoint in TOUCHES and MINTS or carries a ruling; `wave-plan-check` refuses a duplicate MINT |
| routing | absent | every row carries a POOL with a one-clause reason; a non-Claude pool names its fallback and its verification; `wave-plan-check` refuses a row without one |
| wave readiness | the confirmation pass, prose | `node scripts/wave-plan-check.mjs` passes on the wave-state file |
| worker completion | QUEUE last | a check stamp for the reviewed sha, a handoff file, one queue job; the Stop hook refuses a turn that ends on a wait |
| handoff draining | consumed/spent/deferred, prose | `node scripts/handoff-drain.mjs` names nothing unclassified |
| watch loop | tick, read, launch, no-op | unchanged; `wave-tick.mjs` is the criterion |
| report | nine items | nine items plus the spend and receipt lines, each from a named command |

### Sediment and no-ops

Sentence by sentence over the core: the closing Rules; "the reason is legibility, not caution";
the second half of exception 4 (why the main checkout is unsafe, already the incident and the
hook's message); "Nothing pasted is dropped silently" (a no-op given the fill order plus the
pushback rule). Over `prompts.md`: the provider facts, the Codex-is-not-a-peer paragraph (true,
but a fact about a harness, so it moves to the routing module as one line).

### Handoffs

His rule is that a handoff carries only what canonical artifacts cannot. Our wave handoffs run
7-13 KB with "what landed" narrative that git and the check stamp already hold. The template a
wave prompt asks for becomes: what is left and why; new evidence and traps that exist in no repo
file; owner action; pointers to commits, the stamp and the owner-queue item; "what landed" as one
line of commit pointers. Recovery when the session disappears is unchanged, because the why and
the pointers are what a fresh session needs and the diff is in git.

### The two-axis review

His `code-review` separates standards (built safely and well) from spec (built the right thing)
and never reranks across them. Our `check` reviews for bugs, simplifies, verifies; the spec axis is
delegated to the worker's own self-check against GOAL. Evidence of a gap, three times: the vanity
rename (spec followed to the letter, function broken), the 2026-09-02 delegation trial (every
mechanical acceptance condition passed, the one judgement field half wrong, caught only by the gate
that consumes the artifact), and row C's review on 2026-09-01 finding two false claims in a design
doc that a bug review has no reason to look for. The proportionate change is one angle added to the
review leg of `check`, not a second agent: does the diff make the GOAL true and serve the WHY, what
was asked and not built, what was built and not asked, and for a delegated artifact, has the thing
that consumes it read it.

### Bug discipline

His `diagnosing-bugs` makes the feedback loop the deliverable, with a completion criterion a reader
can test (one command that goes red). Ours is one clause, "reproduce before fixing", plus the
owner's global rule, and sessions do reproduce first (the poll, the pin-stale hook and the
`jobs.mjs` defect all opened with a reproduction). What is missing is the minimise step and the
regression seam. Recommendation, not built here: a reusable `diagnose` workflow whose definition
of done is a red-capable command, which the orchestrator names in the DO line of any bug row.
It is a specialist discipline, so it belongs beside `check` and `so`, never in the core.

### The three lessons taken

1. The environment is the source of truth and a document that restates it is a cache. Four of the
   six false facts found this week were caches.
2. Every phase ends on a completion criterion a reader can test. "Consider", "do a pass" and
   "check" are where the 2026-09-01 planner errors lived.
3. A pointer's wording, not its target, decides whether the material is reached. Routing was a
   perfect module behind a pointer that never named it.

### The three NoaCG-specific ideas kept against his design

1. **A persistent authoritative master with a written boundary.** His skills are one-session
   tools with a human at the keyboard; ours runs eight hours unattended, so the authority boundary
   and its four exceptions stay in the always-loaded core, negatives and all.
2. **Durable state outside the session.** His handoff lives in the OS temp directory; ours is the
   wave-state file, the handoff files, the job store, the ledgers and the tick log, because the
   session that planned the night is routinely dead by morning.
3. **Mechanisms before prose.** His repository is prose all the way down. Ours converts a recurring
   failure into a hook, a script or a test, and the contract only keeps the judgement.

## Phase C - the supporting workflows

`check`: one angle added (above). The stamp shape is unchanged.

`handoff`: the wave-handoff template asked for in a prompt's QUEUE line is now delta-oriented
(above). The `handoff` workflow itself already says "point, don't reprint" and needs no change.

The morning CI verdict: the core says a machine writes it into `docs/handoffs/`. The scheduled task
exists (`nightly-ci-morning-report`) and writes `ci-morning-report.local.md` into the PRIMARY
checkout's `docs/handoffs/`, which is gitignored, so the orchestrator's home never contains it.
`docs/ROUTINES.md` also omits that task and two others on this machine. Both fixed in this pass:
the grounding module names where the file actually is, and the routines doc lists what runs.

The watch loop: dead in both observed nights. The wave lands anyway by design. A dead-man tick (a
scheduled task running `wave-tick.mjs` every half hour while a fresh wave plan exists, observation
only, no authority) would keep the event log complete through a dead loop. Recommended, not built:
it is a per-machine scheduled task, and the owner installs those.

## Phase D - the six ratified corrections, and where each one lives

None of the six grew the core for its own sake; the core went from 170 to 176 lines and the
common path from about 590 to 589 after the launch-time sections left the collision pass.

| Correction | Layer | What exists now |
|---|---|---|
| 1. Never wait on something that cannot wake you | hook | `scripts/hooks/stop-wait.mjs` on `Stop` and `SubagentStop`: a turn whose last message declares a wait on a CI run, a landing, a job or a watcher is refused with the three things to do instead; silent after `/queue-merge` and on every ordinary turn end. Pure half and tests in `scripts/stop-wait.mjs`. One line in the prompt's QUEUE block names the rule the hook enforces |
| 2. SPEND in the report | report module | `report.md` item 7: `npm run harness:usage -- --wave` pasted as it prints - harnesses that ran, Codex window snapshot, Antigravity calls and failures, the delegation outcomes table per pool and task class. The meter already refuses to sum across providers |
| 3. Handoff draining | script + plan check | `scripts/handoff-drain.mjs` reads the `## Handoffs` section of the newest wave plan and prints every handoff file as consumed, spent, deferred, owner or UNCLASSIFIED with its age; `wave-plan-check` refuses a plan while any file is unclassified; the SessionStart hook prints the drain in the orchestrator home |
| 4. Routing is a checked step | module + plan check | `routing.md` (64 lines) is the judgement: the pool vocabulary, the step, its definition of done; the provider facts left the contract for `docs/HARNESS_ROUTING.md` and the meter. The wave table gained a POOL column, the plan a `Pools at plan time:` line, and `wave-plan-check` refuses a row without a pool or a non-Claude pool without a fallback |
| 5. THE RECEIPT | durable state + build gate | front matter on a `docs/backlog/` file (`source`, `raised`, `state`, `asked`, plus `branch` or `note` where the state demands it); `scripts/owner-receipts.mjs` lists them unstarted and oldest first, `--check` runs in `npm run build`, `--closed` reads landed receipts back out of git; the plan check refuses a plan that never mentions an unstarted one; the core says an ask a wave does not start becomes a receipt in one row's first commit |
| 6. Recover the unfiled owner items | files | 25 receipts: 20 existing owner-credited backlog files given front matter from their own quoted words, and 5 new files for asks no tracked file held - `agents-md-byte-headroom`, `git-push-allow-hook` (parked: the classifier), `growth-rule-geometry-and-purpose`, `mistake-trigger-hooks`, `ograf-host-page-restyle`. Two graduated files deleted (`one-prompt-agent-bootstrap`, landed 2026-08-28; `auto-merge-needs-the-temporary-worktree`, the mechanism exists). Two planned-and-never-run rows filed as ordinary backlog items because their source was a session, not the owner |

The brief spoke of ten owner items. The evidence held more: every owner-credited backlog file was
an unfiled ask in the sense that mattered (no state, no age, no place a plan had to look), so all
were given receipts rather than a chosen ten. Nothing was filed without a quoted or dated source.

`scripts/wave-plan-check.mjs` is the one new mechanism the brief did not name. It exists because
corrections 3, 4 and 5 each needed "the plan must" to mean something observable, and one check over
the wave-state file was cheaper and more honest than three prose rules. It also carries the
confirmation pass's mechanical half (every TOUCHES path exists) and the letter and QUEUE rules.

## Phase E - what changed in the architecture, and what did not

Kept: one authoritative orchestrator; the four exceptions; the seven sections; the module set;
the marker gate. Changed: the core is an index again (its closing Rules section and eleven
restated module rules are gone; "Landing authority belongs to the queue" replaces the scattered
never-merge clauses); the frontier is defined once and used by the continuation rule; routing and
launching are modules of their own; the wave-state file is named `<date>-<day|night>-wave-plan`
so two waves in one day cannot share a name; the self-improvement rule reads "Every wave improves
the orchestration system" with the order hook, script or test, durable state, text; and the gate
measures the common path and refuses stale `npm run` names.

Not changed, deliberately: `docs/ORCHESTRATION_NEXT.md` (ratified); the check stamp shape; the
adapters; `recovery.md`; the incidents file except for one corrected script name and five new
dated entries.

## Phase F - the behavioural evaluation

Eight scenarios, each run twice as a read-only planning dry run by an Opus subagent in this
repository: once against the contract snapshot taken before any edit, once against the rewritten
contract. A separate grader read each plan against the scenario's assertions (nine shared, two to
four scenario-specific) and checked factual claims against git. The runs, plans, wave-state files
and grades are in the session's scratch workspace (`orchestrator-workspace/iteration-1`); the
numbers below are copied from its `benchmark.md`. Python is not installed on this machine, so the
skill-creator's aggregation and viewer scripts could not run and a node script built the same
schema.

| Scenario | rewritten | before |
|---|---|---|
| normal day wave | 10/11 | 6/11 |
| unattended night wave | 11/12 | 7/12 |
| collision on shared slots | 12/12 | 9/12 |
| stale, contradictory handoff | 10/11 | 7/11 |
| messy owner input (parked, money, taste) | 12/13 | 10/13 |
| Codex unknown, Antigravity abundant | 12/13 | 8/13 |
| caution verdict and a classifier refusal | 12/12 | 7/12 |
| follow-on and continuation at 02:10 | 10/12 | 7/12 |

Mean pass rate 0.93 (sd 0.05) against 0.63 (sd 0.08). Mean cost per plan rose from about 175 K
to 192 K tokens (+9%) and from 10 to 12 minutes; the difference is the three new read-only commands
and the plan check, which every rewritten-contract run ran and passed.

**What discriminated.** Three assertions went from 0 of 8 to 8 of 8 and are the new mechanisms
doing their job: every handoff classified with a trace, the unstarted owner receipts surfaced by
slug, and a capacity snapshot plus a correctly named wave-state file. Two more moved without a new
mechanism behind them: every row naming its pool (6 to 8 of 8) and no WAIT line (7 to 8 of 8).
The old contract also produced one wave-state file that was a stub pointing back at the chat
output, and one plan with an untraced "spent" handoff - the two failures the receipt and the drain
exist to end.

**What did not change.** The authority boundary held in all sixteen runs; every prompt ended on
QUEUE in all sixteen; the caution verdict was reported and never merged, and the classifier-refused
row was held with its full prompt, under both contracts. Both contracts verified the fictional
branches with git and wrote no prompt from them, and both decided the taste question rather than
asking it. Those were never the weak points.

**Where the rewritten contract missed, honestly.**

- The scenario assumed the derived field count had landed because a commit title says so; both
  contracts read the code, found the type still permits a hand-typed count, and planned the
  remaining half. The assertion was too strong, and the plans were defensible. A cheap check is
  still worth having - `git log -i --grep` on a pasted ask's key words - and it is now one line
  in `grounding.md`.
- One run kept a comprehension audit on Opus against the routing file's own row, citing the
  ledger's single failed first pass on that class and the input floor. That is the contract
  routing on evidence rather than on a table, which is what it says to do; the ledger is one
  sample deep, and the next graded delegation settles it.
- One run raised the owner's "sonnet level" dropdown fix to Opus with a reason. Allowed by the
  floor rule; worth watching, because an owner's routing hint is evidence too.
- A tick loaded the pushback module it did not need, and a day plan loaded the launch module
  before the plan check had passed. The launch row's pointer now says "only after the plan check
  passes".
- The 700-line assertion was written for a day plan; night runs legitimately load `night.md`.

**What the evaluation found beyond its assertions.** Running the old contract from a worktree
that was being committed underneath it made every one of those runs report a tree that moved
mid-plan - the hazard the home worktree exists to remove, and a fair reminder that the dry run
skipped the home script. And one old-contract run was refused by the foreground-wait guard for a
bounded `for` loop beside a single queue read: the exact false positive whose warning sentence
Phase A had judged "settled by the guard's tests". It was not settled. The matcher now treats a
bounded `for ... in` loop as what it is, with the shape pinned in `command-match.test.mjs`, and
the incidents entry records the correction. Phase A's item 7 stands as written, with this
paragraph as its correction: the sentence was true, and the right answer was still a mechanism.

Three assertions were non-discriminating (SESSION/QUEUE format, the WAIT line, and the
"additive, never load-bearing" wording) and one was wrong (the field count); the next iteration
drops or rewrites them. Cost is the number to watch: a plan that reads 9% more to be checkable is
a fair trade once, and a trend is not.

## The verdict

**Keep the modular architecture, revised.** The split is right and the rare half is well
disclosed. What needed revising was the accounting (the common path, now measured and gated at
640 lines), the fact discipline (six caches found in two days, now four mechanisms and a gate
rule), and the missing step (routing). The core is an index again, and every phase has a
definition of done a script can refuse.

**Three lessons taken from Pocock.**

1. The environment is the source of truth; a document that restates it is a cache with a
   half-life measured in days here.
2. A phase without a checkable completion criterion is where the errors live - "do a pass" is
   not a verdict, `wave-plan-check` is.
3. A pointer's wording decides whether its module is reached. Routing was a good module nobody
   loaded, because the row that named it was a table of contents.

**Three NoaCG ideas kept against his design.**

1. A persistent, authoritative master with a written boundary and four bounded exceptions -
   because the master runs unattended and the harness, not the model, holds the hard edges.
2. Durable state outside any session: the wave-state file, the receipts, the ledgers, the tick
   log - because the session that planned the night is routinely dead by morning.
3. Mechanisms before prose: hooks, scripts, tests and state carry the lessons; the contract
   keeps only the judgement.

**What to measure over the next week.**

- The gate's common-path line at each landing of the contract, against 640: it should fall, not
  hold.
- `node scripts/owner-receipts.mjs`: the count of unstarted receipts older than seven days, and
  whether any plan's section 4 fails to name one (the plan check makes the second a refusal).
- `node scripts/handoff-drain.mjs` after each wave: zero UNCLASSIFIED before the plan ships, and
  the age of the oldest deferred file.
- The `Pools at plan time` line and the delegation-outcomes table per wave: rows off Opus per
  wave, first-pass rate per pool and task class, and how often a Codex row fell to its fallback.
- Stop-hook fires per wave, read from any session that continued after a refused stop, against
  the zero green-but-unqueued branches `wave-tick.mjs` should now report.
- Landing friction as the report already counts it: refusals and re-queues per wave, and the
  hours between a wave's last landing and its morning report.
- Whether the watch loop dies again, and for how long, from the heartbeat gaps - the case for
  the dead-man tick is made or dropped by that number.

---

# The live-wave review - 2026-09-03 evening

The first review with real waves behind it: the night wave of 2026-09-02 (eight planned rows, two
unplanned) and the day wave of 2026-09-03 (six planned, three added). Measured from the two
wave-state files, the per-row handoffs, the job store and tick log, both ledgers under `~/.noacg/`,
and `harness-usage` over the 48 hours to 2026-09-03T13:13Z. Cursor's public pstack (the
`poteto-mode` skill and its playbooks, read from `cursor/plugins` at HEAD) was the external
comparison. Nothing below is inferred from a worker's own claim.

## Live-wave findings

**Every row landed; the machinery held.** Eighteen rows, eighteen ancestors of `main`. `/check`
ran on every one. The night loop stayed alive for fifteen ticks after dying in both earlier
nights. Landing friction was low except for one collision: rows C and D both edited
`e2e/student-rehearsal.spec.ts`, which neither `TOUCHES` set named, and spent three hours in a
symmetric queue deadlock that a tenth session had to resolve by hand (the `collisions.md` rule for
it already existed).

**Delegation bought nothing.** Eight Antigravity calls across both waves: four returned nothing,
one docs draft needed seven of twelve passages repaired plus three factual corrections, three
were usable reads. Delegated code shipped: zero lines. The ledger blames our invocations for
seven of eleven rows (plan mode on a writing task, main-checkout paths, an undeclared tool set, a
rejected flag, a directory walk). Codex ran one task in 48 hours - 2 M tokens, a landed bug fix -
and was routed to by neither wave.

**The owner was asked 27 things; 16 of them an agent should have decided.** Six of the eleven
genuine ones were taste, two publishing or money, two his own machine, one the contract's install
rule. The sixteen included a delta-E threshold ("a taste call"), a banner placement ("wants a
design answer"), five AGENTS.md cuts to ratify, and the byte-reserve number the owner then
rejected as "exactly the kind of literalism we need to remove".

**Instructions that existed and did not fire, counted:** the `preview_start` wrong-checkout trap
three times (`docs/DEV_PORTS.md` names it); the read-which-CI-jobs-ran trap three times (root
`AGENTS.md` rule 4, once by the session that had just filed it); the chip rule, read and agreed
with and not applied; the shared-spec collision, one level over from the written case; the
prompt's `BRANCH` line, which nothing applies; the four agent rung definitions, invisible to the
session that launched the rows; the delegation path rule, half-followed. And the `/check`
simplify leg returned fan-out instructions in all eighteen rows, so it ran inline every time.

**Where Claude capacity went, 48 hours:** 161 sessions, 12,382 requests (10,079 from launched
rows), 2.70 billion tokens - Opus 2.40 B, Fable 0.24 B (9%), Sonnet 0.05 B. Nearly all of it is
cache reads: a launched row averages about 200 K tokens of context per request and the master
about 275 K, so a single wave row costs 80-180 M tokens and a night's master 175 M. Neither
plan recorded a compaction or a context figure; the master's own spend is 21-31% of its tree.

**Dates did gate.** The night plan held every OGraf row with "P6 is AUTHORIZED but goes ACTIVE on
2026-09-12; not tonight" while slots were free.

## Subscription economy

**Claude is the scarce pool and the two waves used only Claude for implementation.** Codex sat at
64% of its weekly window with 88 hours to reset; the night plan called it "the reserve" and spent
it on nothing, and the day plan copied Codex's two percentages into a sentence about Claude - the
harness that publishes none - and then wrote "not a wave peer". One Codex task moved the weekly
meter one point, so the headroom that week was roughly 25-35 tasks of that size: the same
work as two to four wave rows per day, each of which would have cost Claude 80-180 M tokens.
That is the one lever large enough to move a 45%-in-two-days weekly meter; no context trimming
comes close.

**Antigravity's numbers understate it**, because the failures were ours. Where the prompt was
right (the ticker sweep retry, the 3.7/3.8 recheck, the fixture corpus) the pools performed; where
it was wrong they billed and returned nothing. Cheap generation followed by expensive repair was
real for the docs rewrite and the fixtures, so artifact generation stays graded by the gate that
consumes it. Fable at 9% of tokens went to the row the night turned on and to reviews, which is
the intended shape.

**The routing policy from here** (recorded as the owner's 2026-09-03 rulings in
`docs/OWNER_RULINGS.md` and carried by `routing.md`): Codex is the second implementation pool by
default, GPT Sol on high, one fallback per row, the snapshot deciding how many rows and never
whether; Antigravity takes bounded artifacts, sweeps and specced writes with the preflight guarding
the door; Opus keeps judgement, landing and the engineering it is good at; Fable keeps the row the
day turns on. Whether a Codex upgrade would buy throughput is answerable only after a week of
waves that actually route to it: the test is the weekly meter reaching its ceiling on rows that
landed, not on rows that were planned.

## Pstack verdict

| Idea | Verdict | Why, in one line |
|---|---|---|
| Ceremony threshold (one strong session instead of a program) | Experiment | The master's own spend is 21-31% of its tree; a day with three or fewer frontier rows should be run once as one owner session and its verified rows per Claude token compared |
| Pilot before scale on a new (harness, model, task-class) | Already have | The delegation trial and the ledger's under-three-rows-is-an-anecdote rule are that; the preflight makes the pilot cheaper |
| Rolling frontier, refill as children finish | Already have | Cohorts with `START on slot free`, launched by the loop; no blocking batches |
| Completion draining, no deep review in a drain | Experiment | The master reads every launched row's final message inline; measure its context per request before and after rows are told to keep the final message to the handoff pointer |
| Brief template with a sampled audit | Already have / Reject | The prompt block, the confirmation pass and the plan check cover the template; a sampled audit per wave is ceremony with no measured failure behind it |
| Durable recovery from state, not transcripts | Already have | Wave-state file, tick log, job store, handoffs, receipts; the one defect found is the day plan's heartbeat clock drifting hours from the job store |
| Liveness, retry by failure mode, zombie reconciliation | Adopt later | Three liveness signals exist; retry-by-mode (smaller scope on a cap, different model on a tool error, two retries then abandon) belongs in `recovery.md` when a retry loop is actually observed |
| Verifier on a different model family, ledger keyed by head SHA | Already have | The stamp keys the reviewed SHA; `so` is the different-model verdict for big calls; blanket cross-model verification is rejected as uniform duplication |
| Blinded evals | Adopt now | Done here: two Opus sessions, sanitized directories, one organic routing prompt, old module against new; the old one left Codex idle "because the 2026-09-01 ruling puts Codex last", the new one routed the specced build to Codex with a fallback and used every pool. One sample each, graded by the reviewer, so a discrimination and not a rate |
| Decision trail TSV | Reject | Duplicates the wave-state file, the handoffs and the alignment questionnaire; the questionnaire already asks every decision taken on the owner's behalf back |
| Continuous harvest | Already have | Every row queues itself; day rows landed 0-15 minutes after queueing; the night's three-hour wait was the collision, not the harvest policy |
| Sub-coordinators | Reject | The master is a token cost, not a throughput bottleneck |
| Derived human status page | Experiment | The morning report is derived by hand from commands; a one-screen `status` derived from the receipts, the drain, the queue and the ledger is worth one row when the owner asks to see less bookkeeping |
| `figure-it-out` bespoke playbooks | Reject | A wave prompt is the playbook; a second layer of phases would cost every row context |
| `reflect` into skill edits | Already have, stronger | The mechanism ladder puts a lesson into a hook, script, test or state before text; pstack routes lessons into prose |

## Autonomy and memory

**Three mechanisms landed, no new prose on the common path.** The agy wrapper refuses the four
exact invocation shapes before a call is spent. `scripts/harness-capabilities.json` pins each tool
observation to the build it was measured on, and `harness:usage` prints the ones the installed
build has not been seen to back (it found one on its first run). `wave-plan-check` prints economy
notes: a Claude percentage that cannot exist, and Codex headroom no row draws on. The common path
is 640/640 after the routing module moved text out to make room.

**The owner-question rate is the next target, and it is not a text problem.** Sixteen of
twenty-seven were the machine's to decide, and the core already says so. Two shapes account for
most of them: a session treating a measurable question as taste (a threshold, a placement, a
number), and a session filing a deviation as a ratification. The first is answered by the
prototype rule the pstack skill states well - if the answer is observable by running something,
run it - and belongs as one clause in `prompts.md` when a line is freed, not as a paragraph. The
second already has its rule and its incident; what will move it is the alignment questionnaire
being read as a score: the report counts (a) against (b), and a wave that asks more (b) than (a)
has a defect to name.

**Knowledge that did not fire has a shape, and two of the shapes are hooks.** `preview_start` from
a linked worktree is a tool call whose arguments and cwd decide it; the read-which-jobs-ran trap
is a script over the run id. Both are filed below as next mechanisms. What stays prose is only
what needs judgement: intent over the letter, when a detail binds, what a row may decide alone.

## Next proof

The next real wave routes every row that is long to do and short to specify to Codex on GPT Sol
high, through the rescue workflow from an owning Claude row, each with a fallback, and lands them
through the queue like any other row. The morning report then shows two numbers side by side:
Claude tokens per landed row, and rows landed. The wave has proven the lever if the first falls
while the second holds, and if the preflight's `ours` column reads zero on every delegation. Until
that wave runs, every economy claim above is a plan.
