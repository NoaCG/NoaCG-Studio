---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: unstarted
asked: "we should also check that the orchestrator works as well in Codex as in Claude because I will be using that when we run out of usage"
serves: H0
size: standard
touches: .agents/skills/orchestrator/SKILL.md, .agents/skills/o/SKILL.md, .agent-workflows/orchestrator.md, .agent-workflows/orchestrator/night.md, docs/handoffs/
covered-by: scripts/check-shared-instructions.mjs, scripts/wave-plan-check.test.mjs
needs-owner: none
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
