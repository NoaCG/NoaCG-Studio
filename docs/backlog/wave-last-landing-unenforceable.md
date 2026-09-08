# `MINTS: LAST landing` is a comment - nothing can honour it

**Filed:** 2026-09-02. **Source:** measurement - the 2026-09-02 day wave (its live-run handoff has
since been drained)

## Why

**The wave contract mints a slot that no mechanism reads, so a plan can be correct and still not
happen.** On 2026-09-02 row D was the designated LAST landing - it tightens refusals every session
on the machine meets, so anything landing after it meets rules its prompt was not written against.
D queued FIRST, while row C was still working.

D did not disobey. Its prompt said both *"you are this wave's designated LAST landing"* and, from
the standard QUEUE block, *"queue when your own work is finished"*. **Those two instructions cannot
both be obeyed by whichever session finishes first.** The only way to hold a queue slot is to end a
turn waiting for other branches to land, and `scripts/hooks/stop-wait.mjs` refuses exactly that.
So the rule is not merely unenforced, it is in direct conflict with a hook the same system runs.

The gap was covered by hand: the orchestrator messaged C with what had tightened and confirmed the
`:queued` script forms stayed exempt. That is a human-shaped relay, and removing those is the whole
reason the wave machinery exists. Unattended, nothing would have relayed anything.

Nothing was at risk this time - the practical exposure was small because C used the `:queued`
forms, which D had deliberately kept exempt. The cost of getting it wrong is a sibling's red build
that reads as their own fault, which is the failure the rule was written after.

## What it would take

Two honest resolutions. The contract should pick one rather than keep minting a slot nothing reads.

1. **Teach the landing queue a per-wave order.** `scripts/auto-merge.mjs` currently takes no
   ordering input from the plan; the queue is the only actor that CAN serialize, since it already
   drains one branch at a time. A `--after <branch>` or a plan-supplied rank would make the slot
   real, and a session could then queue at its true end and let the queue hold it. This is the
   version that matches how the rest of the system works: landing is serialized, not permissioned.
2. **Stop writing it.** If a gate genuinely must land alone, the existing rule already covers it -
   `A GATE LANDS ALONE` means its own wave. "Land last within a shared wave" would then be an
   ordinary sibling-integration problem, solved by every session integrating `main` before its
   gate, which they already do.

Option 1 is the better fit and is not large; option 2 is honest and free. What must not survive is
the current state, where the plan check accepts the slot, the planner writes it, and no code reads
it.

**These two items are coupled, so decide them together.**
`docs/backlog/stop-hook-background-wait-gap.md` proposes making the Stop hook structural - refuse a
stop while the session still owns a live background task it has not read to a verdict. That is the
right fix for its own problem and it makes holding a queue slot *more* impossible, not less. Which
means option 2 above becomes the only remaining escape unless the queue learns an order first.

## Evidence

The 2026-09-02 live-run handoff, "What caused friction" finding 3, drained 2026-09-08. The wave's
heartbeat with timestamps is in the orchestrator home at
`docs/handoffs/2026-09-02-day-wave-plan.local.md` (gitignored). The rule lives in
`.agent-workflows/orchestrator.md` ("The rules that are never module-deep") and in
`.agent-workflows/orchestrator/collisions.md`; the conflicting instruction is the QUEUE block in
`.agent-workflows/orchestrator/prompts.md`; the hook that makes holding impossible is
`scripts/hooks/stop-wait.mjs`. `scripts/wave-plan-check.mjs` validates that a slot is not minted
twice, which is what makes the slot look enforced when it is not.
