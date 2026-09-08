# The Stop hook does not catch a turn ending on the session's own background jobs

**Filed:** 2026-09-02. **Source:** measurement - three of five launched rows in the 2026-09-02 day
wave (its live-run handoff has since been drained)

**Updated the same evening, and the update is the finding: a prompt line does not fix this.**
Rows A and C stopped this way in the first cohort. The second cohort's prompts therefore carried
the strongest text warning available - naming the failure, naming both earlier rows, and quoting
the cost - and row F stopped exactly the same way anyway: *"I'll wait for the background CI poll
to complete before proceeding to queue the merge."* Three of five rows, with the third one warned
explicitly. **That settles the choice between the two options below in favour of the structural
one**; widening a matcher is still text, and text has now failed with a running start.

## Why

**A wave session that ends its turn waiting for something that cannot wake it is a session that
never finishes and never says why.** `scripts/hooks/stop-wait.mjs` exists to refuse exactly that
turn. On 2026-09-02 it did not fire on either occurrence, and both prompts also carried the rule in
text, so the hook channel and the text channel failed together.

Cost, measured: roughly 40 minutes of dead wall clock per occurrence. The only thing that recovered
either row was the orchestrator session being awake to read `npm run jobs`, notice the branch said
`not queued`, and send a message. **In a night wave nobody would have found it until morning**, and
the wave's whole promise is that it lands without a person.

This is not the fan-out case. The existing prompt rule and `launch.md` both cover a session waiting
on its own SUBAGENTS' completion notifications, which route to the orchestrator instead. These two
rows were waiting on their own background **Bash** jobs - `run_in_background` shell work, and in one
case two of them at once - which no existing rule names.

## What it would take

The two observed turn-endings, quoted:

- row A: *"Both still running. I'll wait for their notifications rather than polling."*
- row C: *"Both background jobs (the three-test run and the build gate) will wake me when they
  finish... Nothing else is independent of their verdicts right now, so I am waiting on those two."*
- row F, whose prompt named this failure and both rows above: *"I'll wait for the background CI
  poll to complete before proceeding to queue the merge."*

All three are terminal-state text, not tool calls, which is the likely reason the matcher missed
them:
the existing patterns look for a waiting COMMAND, and these turns ended on a waiting SENTENCE with
the jobs already launched in earlier turns. Two directions, and the second is the safer one:

1. Widen the matcher to the sentence shape. Cheap, and the same trap as every text matcher - it
   will miss the next phrasing. **Row F is the argument against stopping here**: the three
   sentences above share no useful phrase beyond "wait", and "wait" alone over-refuses.
2. **Make it structural, which the evidence now points to**: refuse a stop while the session still
   owns a live background task it has not read to a verdict. The harness knows what background
   tasks a session started; the hook does not have to infer intent from prose. This is the version
   that cannot be phrased around, and the only one a warned session cannot walk past.

Either way, pin BOTH directions in the hook's tests - the turn that must be refused and the turn
that must pass - because a Stop hook that over-refuses blocks every session on the machine.

## Evidence

The 2026-09-02 live-run handoff, "What caused friction" finding 1, drained 2026-09-08. The wave's
own heartbeat with timestamps is in the orchestrator home at
`docs/handoffs/2026-09-02-day-wave-plan.local.md` (gitignored). The hook is
`scripts/hooks/stop-wait.mjs`, its matcher lives with the others in `scripts/command-match.mjs`,
and `docs/MISTAKE_TRIGGERS.md` (landed the same day) is the rule for deciding whether a lesson
should be a hook at all - this one already is a hook, so the question is only its shape.
