# The orchestrator, run in Codex, 2026-09-10

**Who this is for:** the owner, who asked on 5 September to "check that the orchestrator works as
well in Codex as in Claude because I will be using that when we run out of usage." This is the
first time anyone has actually run it there and compared the result. Until tonight the differences
were documented and never measured.

**The short answer.** Codex plans well. It produced a complete seven-section night plan on the same
inputs, honoured every Codex carve-out the contract already carries, and asked the owner nothing.
What it cannot do is the second half of the job: it cannot launch a row, and it cannot write the
plan into the durable store. On a night the owner is asleep, a Codex orchestrator produces a
document and stops. The contract does not say so, and that silence is the finding.

Its plan also carries four defects the Claude plan does not, and the gate that catches them never
ran. That one is our fault rather than the harness's - the gate is reachable from inside Codex, and
this row assumed it was not until the review caught me.

## Method

Both plans were made for the same wave, at the same repository commit `0634d6bd`, against the same
window `2026-09-11T03:00:00Z`, within about ten minutes of each other.

- **The Claude side already existed** and cost this measurement nothing: the live 2026-09-10 night
  wave plan, written by a `/orchestrator` session at 23:00 Helsinki and held in the wave-plan store.
- **The Codex side** was delegated from this session through `scripts/codex-rescue.mjs`, model
  `gpt-5.6-sol`, effort `high`, with its workdir set to this row's worktree. The spec told it to
  invoke its own `$orchestrator` skill and follow `.agent-workflows/orchestrator.md` in full, gave
  it the owner's invocation as pasted input, and forbade four things out loud: launch nothing, queue
  nothing, commit nothing, touch no other worktree. The wave-plan store was declared off limits for
  reading as well as writing, so the delegate could not see the Claude plan it was being compared
  against.
- **Both plans were then scored by the same gate.** `checkPlan()` from
  `scripts/wave-plan-check.mjs` is pure and exported, so it was run over both documents with
  identical inputs - the same handoff list, the same owner receipts, the same weekly candidates.
  That turns "the plans differ" into a number instead of a reading.

The Codex session ran 44 turns and 5.6 M tokens over about eight minutes of wall clock. **Its plan
is committed as `docs/metrics/2026-09-10-orchestrator-in-codex-plan.md`, unedited below a six-line
provenance header**, so every quote below can be checked and the diff re-derived without re-spending
a Codex window. The header does not change the score: 3 rows and 4 problems with it and without it.

### What this measurement is not

Say these out loud, because each of them limits what the numbers below are worth.

- **The row set was leaked.** The Claude wave had already created the branches
  `claude/ca-deck-and-demo-doc`, `claude/cb-queue-drain-four-reasons` and
  `claude/cc-validate-project-format` before the delegate ran, and its plan says it read them off
  `git`. So the fact that both planners landed on the same three letters with the same names is
  **not** independent agreement. What each row's prompt then SAYS is independent: the delegate never
  saw a line of the Claude prompts.
- **Two steps were forbidden by me, not by the harness.** The delegate could not run
  `orchestrator-home.mjs` (constraint 4) or `wave-plan-check.mjs` (the store was off limits). The
  first is unreachable in Codex anyway, for the reason in finding 2, though tonight's run does not
  prove that on its own. The second is NOT - see the correction under finding 2 - so the four
  defects in the Codex plan are partly my constraint's doing and not only the harness's.
- **The write half of the workflow was never exercised.** A read-only delegation cannot write the
  wave-state file, record a launch, or append a heartbeat, so those arms were read rather than run.
- **The effort was not the owner's.** This ran at `--effort high`. His own
  `~/.codex/config.toml` sets `model_reasoning_effort = "low"`, and the config decides it silently.
  A plan written at low effort is a different experiment that nobody has run.
- **N of 1.** One night, one planner, one model, one wave. Nothing below is a rate.

## What the gate says

Same function, same inputs, two documents.

| | rows | problems |
| --- | --- | --- |
| Claude `/orchestrator` | 4 | **0** |
| Codex `$orchestrator` | 3 | **4** |

All four Codex problems are the same defect in three rows: the `POOL` cell carries a justifying
clause, and the check parses that cell as a comma-separated pool list.

```
row CA: POOL "fallback codex - bounded cross-file artifact work with a visual acceptance
        checklist" is not one of opus, fable, sonnet, agy-gemini, agy-claude-gpt, codex
row CB: POOL "fallback agy-gemini after enumeration - long" is not one of ...
row CB: POOL "rule-bound document triage" is not one of ...
row CC: POOL "fallback opus - reproduce-first implementation with a narrow acceptance test" is
        not one of ...
```

`orchestrator/routing.md` is explicit that the clause belongs on the `MODEL` line, not in the
`POOL` cell, so this is a planner slip rather than a contract hole - and a gate exists for exactly
it. What makes it worth writing down is that the gate never ran: see finding 2, and the correction
under it, which is that it could have.

## The differences, and what each one is

Thirteen differences, classified. Five are gaps in the shared contract, one is an omission in the
Codex adapter, and seven are harmless - three of those being carve-outs the contract already
carries, behaving exactly as written.

### Gaps in the shared contract - five

**1. The core says this session launches its own rows, and in Codex it cannot.** The always-loaded
core states it flatly: *"This session LAUNCHES its own rows (`launch.md`) - the user pastes nothing
and starts nothing."* There is no Agent tool in Codex, so that is false there, and the sentence sits
in the core where it fires before `launch.md` is ever read. The delegate handled it as well as it
could - its plan ends *"Launch status for this measurement: not launched"* - but a Codex plan is a
set of prompts somebody has to paste, and the file the planner is reading tells him he pastes
nothing. `night.md` carves out the Monitor and `report.md` carves out the morning report; nothing
carves out the launch, which is the larger of the three.

**2. The wave-state file cannot be written from Codex.** The store is
`C:\claude\NoaCG-Studio\.git\noacg-jobs\wave-plans\`, under the PRIMARY checkout's git directory.
A Codex session's write sandbox is `[workdir, /tmp, $TMPDIR]`. From the orchestrator's own home, or
from any worktree, the store is outside it. The one place it is inside is the main checkout - which
core exception 4 forbids the orchestrator from occupying, because *"the main checkout belongs to the
landing queue"*. So core exception 3, which exists because *"a plan printed only in chat dies with
this session while the user is asleep"*, describes the only kind of plan Codex can make unless it
writes one into the checkout it is standing in. This is structural rather than incidental, which is
why it is the harder of the two to answer even though finding 1 is the one to answer first.

**The gate, though, is reachable, and I got this wrong the first time.** `wave-plan-check.mjs`'s
CLI refuses a plan outside the store, so the obvious conclusion is that a Codex plan cannot be
scored - and that conclusion is false. `checkPlan()` is exported and pure, its inputs all come from
the repository root, and this row scored both documents by importing it. So the four defects above
went ungated by habit rather than by necessity: a twenty-line runner catches every one of them
inside the sandbox. That is now written into the Codex adapter, and it is the cheapest of tonight's
fixes.

**3. `gh` cannot run, and section 3 has no other instrument.** The delegate's plan reports the
GitHub query *"failed at the sandbox network boundary"* and correctly refuses to call `main` red or
green on a stale local file's authority. But the core's section 3 says a landing refusal *"is on the
pull request (`gh pr view <n>`)"*, and `grounding.md` tells the session to re-check the morning
verdict with `gh run view <id> --json jobs`. Neither is available. The behaviour Codex chose -
report it unchecked - is right, and the contract never says to.

**4. The prompt block has no slot for the delegation instructions `routing.md` requires.**
`routing.md` step 3 demands that a delegated row's prompt declare the delegate's tool set, give the
worktree's absolute paths, enumerate the files and write the acceptance conditions first.
`prompts.md`'s block template has no line for any of it. The two planners invented two different
placements: Codex minted a `DELEGATE` line in every block, Claude folded it into `POOL` plus the
`DO` steps. Two planners independently inventing a placement is the signature of a missing slot.

**5. The `MODEL` line means two different things.** Claude wrote `MODEL opus high`, a rung
`launch.md` maps to an agent definition. Codex wrote `MODEL agy-gemini / gemini-3.7-flash-high`. In
Codex there is no agent definition and no Agent tool, so a rung names nothing; the prompt's reader
is a session the owner opened by hand. Downstream of finding 1, and it disappears when finding 1 is
answered.

### The adapter - one omission, and no defect of the kind expected

I looked for the case where the adapter's own text sends Codex wrong, and there isn't one:
`.agents/skills/orchestrator/SKILL.md` is eleven lines of pointer. Its problem is the opposite. It
says *"Nothing here overrides it"* and then says nothing at all, which forecloses the one file in
the repository that knows it is the Codex side. Every harness fact therefore has to live in the
shared core or a shared module, which is why the core carries none of them.

That is the one thing this row could fix without touching a file another session owns tonight, and
it is fixed. `.agents/skills/orchestrator/SKILL.md` now names the four mechanisms the procedure
assumes and routes each to the arm that already exists; the `$o` alias points at that one file
rather than repeating it, so the two can never drift into describing different harnesses. Both
still override no judgement and stay inside the 25-line wrapper cap the shared-instructions check
enforces, and the orchestrator common path is untouched at 640/640.

**The defect this row was told to look for did not happen.** The assignment predicted that a Codex
night plan with follow-on rows would be an adapter defect. It has none.

### Harmless - seven

Three of these are carve-outs the contract already carries, and they held.

- **No follow-ons, no refill.** `night.md`: *"In Codex there is no Monitor, so a night wave there is
  planned with no follow-on rows and no refill at all."* The Codex plan's section 5 opens *"Start
  now: CA, CB, CC. No follow-ons. No refill."* Honoured exactly.
- **The morning report.** `report.md` requires a Codex plan's section 7 to say in one line where the
  report comes from. It says *"re-invoke the orchestrator after 2026-09-11T03:00:00Z; Codex has no
  Monitor and this plan has no follow-on or refill."* Honoured exactly.
- **It asked the owner nothing.** There is no `AskUserQuestion` in Codex and no PreToolUse hook to
  guard the 5 September question rule, so the contract line stands alone there. Section 6 of the
  Codex plan: *"No open question passes the ask-test."* It held. Once.
- **Section 4 is more thorough in Codex, not less.** The core says section 4 owes a reason PER
  receipt. Codex wrote a line for each of about thirty-five standing asks; the Claude plan grouped
  them and gave individual reasons for three. Codex is closer to the letter of the rule.
- **Row CA's pool is swapped.** Codex sent it to `agy-gemini` with `codex` as fallback; Claude did
  the reverse. Both are defensible on the same capacity snapshot.
- **`TOUCHES` is more concrete in Codex.** Where Claude wrote *"the load and save sites it finds"*,
  Codex enumerated `src/model/project.ts`, `src/store/templateStore.ts`, `src/store/saveActions.ts`.
  It spent source reads to get there; `TOUCHES` is a forecast, so either is legitimate.
- **Cosmetics.** Different title, `Pools at plan time:` before `Window ends:` rather than after, and
  a provenance line Codex added on its own (*"Plan made from 0634d6bd at 2026-09-10T20:12:14Z"*)
  that the contract does not ask for and that is a small improvement.

## What the documented gaps actually cost

The four known gaps were written down on 5 September without anybody measuring what they do. Now:

- **No Monitor** costs the least of the four, because the carve-out is written and the planner
  obeyed it. A Codex night plan is smaller on purpose: three rows instead of four, no candidate
  refill loop, no follow-on chain. The work does not vanish, it moves into the next invocation.
- **No `AskUserQuestion`** cost nothing on this run. The rule is text and the text worked. One
  observation is not a mechanism, and if it ever fails the next step is the Codex `notify` hook.
- **No Agent tool** costs the most, and it is not really about the tool. It is that a Codex wave
  needs a person to start every row, so the unattended night the whole orchestration exists to
  produce is not available in Codex at all. That is worth the owner knowing before the allowance
  runs out, because it is not what "works as well in Codex" would lead him to expect.
- **A different notify mechanism** was not reachable tonight; nothing here measured it.

And one nobody had listed: **the sandbox**. No network, and writes confined to the directory the
session was started in. It is what takes the durable plan away. It looked like it took the plan
check too, and that turned out to be a habit rather than a wall - which is worth remembering next
time a harness limit looks total.

## Cost

The Codex 5-hour window read 1% used at 20:05 UTC, when the delegate wrote its snapshot line, and
42% at 20:25. Three other rows were delegating into the same subscription over that period, and
this session's was one of the two largest of fifteen, so an orchestrator plan in Codex is on the
order of fifteen to twenty points of a five-hour window. It is not free, and it is not the cheap
fallback the word "fallback" suggests.

## What I would do next

- **Answer finding 1 first**, because it is the one that changes what the owner can expect on a
  night he is asleep, and it is one sentence in the core with an arm on it.
- **Then finding 2**, which needs a decision rather than a patch: either the store moves somewhere
  a Codex session can reach, or `wave-plan-check.mjs` grows a mode that scores a plan in the
  workdir and says in its verdict that the plan is not durable yet. The second is smaller and does
  not move a file the whole orchestration depends on.
- **Findings 4 and 5 are cheap** and can travel with any wave that touches `prompts.md`.
- **Re-run this at `--effort low`**, which is what the owner's own machine will actually do.
