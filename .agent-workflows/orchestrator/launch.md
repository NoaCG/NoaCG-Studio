# Launching the rows - the Agent tool, the classifier, and permission prompts

Loaded when a wave's rows are launched, day or night - after the plan has passed
`node scripts/wave-plan-check.mjs`, never while it is being written. Done when every `START now`
row is running in its own worktree, every held row is in section 4 with its full prompt, and the
wave-state file says which is which.

**Launch directly; a chip only when the start IS the owner's decision.** `hosts.md` selects the
execution route. **In Claude Code the PRIMARY launch path is the Agent tool**, with its existing
definitions below. Native Codex uses its subagents or the authenticated Claude CLI, not those definitions.

**Record every launch**, initial rows and refills alike, with
`node scripts/wave-launch.mjs record --letter <L> --branch <branch> --size <small|standard|large>`.
It is one appended ledger line, and it is the only place a row's launch-to-queued time is written -
the number `wave-horizon.mjs` reads to decide whether another unit still fits the night. A launch
nobody records is a night the horizon cannot learn from, so the seed never improves.

**Claude's Agent tool CALL carries a model and no reasoning effort, but an agent DEFINITION carries
both**, so a row is launched by NAMING ITS AGENT rather than by naming a model and hoping the
effort follows. The rungs of the routing ladder live in `.claude/agents/`, one file each, carrying
the model, the effort and `isolation: worktree`:

| MODEL line | agent |
| --- | --- |
| `opus high` (the default) | `wave-row` |
| `opus xhigh` / `opus max` | `wave-row-deciding` |
| `sonnet` | `wave-row-mechanical` |
| `fable high` | `wave-row-design` |

A rung with no definition falls back to a plain model launch, which runs at the SESSION's effort
whatever the row promised - so a new rung is a new file, never a note in a prompt. Read the
frontmatter field list from the subagent docs rather than from here.

**Headless carries both on the command line**:
`claude -p --model <m> --effort <low|medium|high|xhigh|max>` - the fallback
for anything the definitions do not cover, once live CLI auth is verified that day, and only then
a chip or a user-started session.

**THREE THINGS THE PLAN ASKS FOR THAT THE LAUNCH DOES NOT APPLY.** All three fail silently, and in
each the row runs while the plan still reads as honoured. The first two were measured on
2026-09-03, the third on 2026-09-04.

- **The agent registry belongs to the LAUNCHING SESSION, not to the machine.** A session reads
  `.claude/agents/` from its own project root, so a session whose worktree predates the commit that
  added the rungs sees none of them and falls back to a plain model launch. The orchestrator's own
  launch did this. Its home being current is not enough - check the checkout it stands in.
- **`isolation: worktree` MINTS the branch name, and the row's `BRANCH` line changes nothing.** The
  Agent tool generates `worktree-agent-<id>`; no parameter sets it and no check compares the two,
  so two of four rows in this wave committed on the generated name. After the first commit
  `npm run jobs` and the morning report have already read the wrong name, so the row renames before
  it - the rule and its sharp edge are a DO-step line rule in `prompts.md`, because this module
  loads long after the prompt that has to carry it was written.
- **`isolation: remote` IS ACCEPTED AND RUNS ON THIS LAPTOP.** The call succeeds, the row works,
  and nothing anywhere says the isolation was dropped - so rows routed to "cloud" to spare the
  machine's RAM all land on it, and the wave hits the three-to-four session ceiling while the plan
  says it will not. **Do not plan capacity on remote isolation until the probe says otherwise.**
  A row that asks for it makes `node scripts/agent-isolation.mjs --expect remote` its first DO
  step: it exits 1 with `ISOLATION MISMATCH` when the request was dropped, which is also the
  reprobe that retires this bullet (`scripts/harness-capabilities.json`,
  `claude-remote-isolation-silently-runs-local`). Why cloud sessions are wanted at all, and the
  queue measurement saying the headroom is real: `docs/backlog/cloud-sessions-for-stateless-rows.md`.

**A ROW THAT ADOPTS AN EXISTING WORKTREE MUST NOT BE LAUNCHED WITH `isolation: worktree`.** The
harness mints the row a FRESH worktree and pins its Bash tool there, and that pin does not follow
file access: entering the target moves reads but leaves every command refused with "a
worktree-isolated agent's commands must run inside its worktree" - `git status`, the build, the
queued e2e script, the queue-merge itself. Worse, while its cwd sits in the target, EVERY Bash call
is refused including `cd` back out, and the row recovers only by re-entering its own worktree.
Launch an adopting row with its cwd pinned to the existing worktree and no isolation. Measured
2026-09-05 by a repair row that recovered and reported rather than thrashing.

**A LAUNCH CAN BE REFUSED BY THE SAFETY CLASSIFIER, and the row is then HELD, not dropped.** A
held row keeps its letter, its full prompt goes in the wave-state file and in section 4, and the
owner starts it in a session he opens. Never re-word a prompt to get it past the classifier. **The
same refusal covers messages, not just launches.** **These are the two hard edges of this
session's autonomy, and both are enforced by the harness rather than by this contract: widening
the machine's permission posture, and overruling a merge-safety verdict.** Treat a refusal as the
mechanism working. The item goes to the owner with the evidence and the one command that settles
it - never re-phrased, never routed around, and never handed to a different session in the hope
that it lands differently. Evidence: `incidents.md` "the two classifier refusals".

**Claude-launched rows can send their subagent notifications to the launcher when they end a turn.**
This measured Claude behavior is not a native Codex restriction. A Claude prompt sanctioning fan-out says:
collect results via FILES at agreed paths, never wait on notifications. **A stray report that
reaches the orchestrator is relayed with `node scripts/relay.mjs write --branch <branch> --from
<who>`**, which the owning branch's QUEUE step reads before it can land - `add-merge` refuses a
branch whose relay is unread. This is the channel the relay rule never had: on 2026-09-04 nine
stray reports had only the disabled `SendMessage` to travel by, so row K queued a proposal without
its own reviews and row J landed without its Codex review (`incidents.md`, the relay failure).

**Cross-session peer messaging is TRANSIENT and is never a wave's channel.** Messages do not
persist, and peers vanish - most of the ones a listing shows are already offline. Fine for a nudge
to a session known to be live; the durable channels stay the only source of truth (the handoff
file, the owner queue, the wave-state file).

A task chip is minted only when starting it is genuinely the owner's call: a Fable-tier task worth
hand-picking the model for, anything near real money, or a scope judgment. Chips are the owner's
control point, not the loop's queue. **A `PreToolUse` guard (`scripts/hooks/spawn-task-guard.mjs`)
refuses every chip that does not say so**, so a legitimate one carries an
`OWNER-DECISION: <the reason, in your own words>` line in the prompt or the tldr - a bare marker
and the angle-bracket placeholder are both refused. Everything else goes on this branch now, or
into `docs/backlog/`.

## Permission prompts

The plan has already been made inside the allowlist (`collisions.md`, "The machine's limits"); what
is left at launch is the other half: **a blocked session must be VISIBLE.** The watch loop asks the
transcripts, not the branch tips - see `night.md` for the signal and, just as binding, for what it
cannot tell you. When the owner asks whether anything is waiting on him right now, the question is
`node scripts/blocked-sessions.mjs --minutes 1`, never the 30-minute default that the unattended
loop needs.
