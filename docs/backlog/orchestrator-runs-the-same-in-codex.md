---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
asked: "we should also check that the orchestrator works as well in Codex as in Claude because I will be using that when we run out of usage"
serves: H0
size: standard
touches: .agent-workflows/orchestrator.md, .agent-workflows/orchestrator/prompts.md, .agent-workflows/orchestrator/routing.md, scripts/wave-plan-store.mjs, scripts/wave-plan-check.mjs
covered-by: scripts/check-shared-instructions.mjs, scripts/wave-plan-check.test.mjs, docs/metrics/2026-09-10-orchestrator-in-codex.md
needs-owner: none
note: >-
  2026-09-10 ran the comparison the ask is about. Codex $orchestrator planned tonight's own night
  wave from the same commit, window and inputs as the live Claude plan; both were scored by the
  same exported checkPlan() - Claude 4 rows / 0 problems, Codex 3 rows / 4 problems. The method,
  the thirteen differences and their classification are in
  docs/metrics/2026-09-10-orchestrator-in-codex.md. Both Codex adapters now name the four
  mechanisms the shared procedure assumes. Five gaps in the shared contract are written out below
  and NOT applied - that file belonged to another session that night.
---
# The orchestrator produces the same plan in Codex as in Claude Code

**Filed:** 2026-09-05. **Source:** owner ruling (`docs/OWNER_RULINGS.md`, owner-decisions-2026-09-05).

## Why

When Claude usage runs out the owner switches to Codex, and the orchestrator is the session he
starts first. Today the Codex adapter (`.agents/skills/orchestrator/SKILL.md`) points at the same
`.agent-workflows/orchestrator.md`, and `check-shared-instructions` proves the pair exists and the
modules link - but nothing has ever RUN a wave plan in Codex and compared it. The known gaps are
documented, not measured: no Monitor (so no watch loop, no refill, follow-ons collapsed into
prompts), no `AskUserQuestion` hook (so the 2026-09-05 question rule is the contract line alone),
no `Agent` tool (so rows are pasted prompts, not launched subagents), and a different notify
mechanism. A plan that quietly differs on a night he is asleep is the failure to rule out.

## What it would take

- Run `$orchestrator` in Codex against the same repository state as a Claude `/orchestrator`
  day plan (same `origin/main` sha, same handoffs), both as dry plans nobody launches. Compare
  the seven sections, the wave table, the candidate list, and whether `wave-plan-check.mjs`
  passes both.
- List every step in `orchestrator.md` and its modules that names a Claude-only tool (Monitor,
  Agent, AskUserQuestion, spawn_task) and confirm each has its Codex arm written out, or write it.
- The question rule: Codex has no PreToolUse hook, so the root `AGENTS.md` line is the guard;
  test it by giving a Codex session a prompt that invites a design question and reading what it
  does. If it asks anyway, the Codex `notify` hook or a wrapper is the next mechanism.
- Record the differences in `docs/AGENT_CLI.md` or the orchestrator's Codex section, and file
  an incident for any step where the Codex plan would have gone wrong unattended.

## Evidence

`node scripts/check-shared-instructions.mjs` on 2026-09-05: 16 Claude/Codex workflow pairs OK,
orchestrator core 198/200, common path 640/640. `night.md` already carves out the Codex night
("no follow-on rows and no refill at all"). No recorded Codex-run wave plan exists in
`docs/handoffs/`.

## What 2026-09-09 settled, and what it did not

**Still unstarted.** Nobody has run `$orchestrator` in Codex and compared the plan, which is the
whole of this item. The harness verdict that night
(`docs/metrics/2026-09-09-harness-verdict.md`) measured the delegation CHANNEL, not the
orchestrator running inside Codex, so none of the four comparisons above is done.

Three findings do change how the test should be set up when someone runs it:

- **A Codex session can only write where it is standing.** Its sandbox is `workspace-write
  [workdir, /tmp, $TMPDIR]`, printed in its own startup banner. So the comparison must start the
  Codex orchestrator FROM the checkout whose plan it is writing, and the dry plan it produces has
  to land in that same tree or in temp. This also means the Codex arm of any step that creates a
  worktree cannot work the way the Claude arm does, which is a real difference to write out rather
  than a bug to fix.
- **The plan file is the only artifact that can cross.** Because rows cannot be launched as
  subagents in Codex, a Codex wave plan is a document. That makes the comparison easy - diff the
  seven sections and run `wave-plan-check.mjs` over both - and it makes the follow-on and refill
  arms untestable by observation, so they must be read rather than run.
- **A Codex session costs memory on this laptop, not seconds.** Each invocation leaves about four
  node processes and 195 MB resident. An orchestrator session in Codex is long-lived, so whoever
  runs this should watch the process count while it runs, and reap afterwards.

**And one thing to check while you are there,** because it is cheap and nobody has: the owner's own
Codex runs at `model_reasoning_effort = "low"` from `~/.codex/config.toml`. An orchestrator plan
written at low effort is not the same experiment as one written at high, and the config decides it
silently.

## What 2026-09-10 settled, and what is left

**The comparison has been run.** `docs/metrics/2026-09-10-orchestrator-in-codex.md` carries the
method, the thirteen differences with their classification, and the limits. Codex `$orchestrator`
produced a complete seven-section night plan on the same commit, the same window and the same
inputs as the live Claude plan, and both were scored by the same exported `checkPlan()`: Claude 4
rows and 0 problems, Codex 3 rows and 4 problems, all four the same `POOL`-cell slip.

Settled:

- The three Codex carve-outs the contract already carries all held - no follow-on rows, no refill,
  the morning-report line in section 7, and no question put to the owner.
- The predicted adapter defect did not exist. Both adapters were eleven lines of pointer that named
  no harness fact at all; they now name the four the procedure assumes, inside the 25-line wrapper
  cap, with the common path unchanged at 640/640.
- The effort question is still open: this ran at `high`, and the owner's machine runs `low`.

**Five gaps in the shared contract remain, and this row deliberately did not apply them** because
the orchestrator session owned `.agent-workflows/orchestrator.md` and its module directory that
night. In priority order, with the evidence in the metrics file:

1. **The wave-state store is unreachable from Codex.** It lives under the primary checkout's
   `.git`, Codex writes only inside its own workdir, and core exception 4 forbids the orchestrator
   from standing in the main checkout. So the durable plan and `wave-plan-check.mjs` are both
   unavailable - which is why the four defects above went ungated. This one needs a decision, not
   a wording fix.
2. **The core states "this session LAUNCHES its own rows" with no Codex arm**, in the always-loaded
   core, where it fires before `launch.md` loads.
3. **`gh` cannot run in the Codex sandbox**, and section 3 plus `grounding.md` name it as the only
   instrument for a landing refusal and the morning CI verdict.
4. **`prompts.md`'s block template has no slot for the delegation content `routing.md` step 3
   requires**, so the two planners invented two different placements for it.
5. **The `MODEL` line names a rung that means nothing in Codex**, where there is no agent
   definition to map it to. Downstream of 2.

Note for whoever takes these: the core is at 199/200 lines and the common path at 640/640, so none
of them has room to be answered by adding a paragraph.
