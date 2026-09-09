# A launched session gets either a shallow check or one the orchestrator has to relay by hand

**Filed:** 2026-09-02. **Source:** measurement - the 2026-09-02 day wave (its live-run handoff has
since been drained)

## Why

**`.agent-workflows/check.md`'s inline fallback works. What it cannot do is make the deep pass
reachable.** Three launched rows ran `/check` on the same day and got two different gates.

Rows A and D followed the workflow exactly: the simplify skill returned fan-out instructions, they
classified that as "the pass has not run" per check.md's four-branch rule, did the angles inline,
and reported `simplify: inline`. That is the contract working, and their reports are honest.

Row C's legs fanned out anyway - seven angles - and **every one of their completion notifications
arrived at the orchestrator session instead of at C**. About 25 findings, including two regressions
the change had introduced and would otherwise have shipped: a `document.body` remap that split one
measurement across two coordinate frames, and child-combinator rules silently matching nothing
because `_load` wraps the markup in a holder div, with the new fixture pinning the wrong output as
correct. Relaying them took six messages, and each needed a scope ruling C could not make for
itself because several findings sat outside its `TOUCHES` set.

So the shape of the problem is not dishonest reporting. It is that **the thorough pass exists, it
is much better than the inline one, and the only thing that delivered it was a human-shaped session
being awake to receive six reports and adjudicate them.** Unattended, C would have gone inline like
A and D and shipped two regressions. check.md is right that a gate which cannot run where the work
happens is not a gate; the corollary is that a gate which only runs well when somebody is watching
is not one either.

## What it would take

In the order they should be considered:

1. **Make the legs collect through FILES at agreed paths** instead of completion notifications.
   `.agent-workflows/orchestrator/prompts.md` already requires exactly this of any prompt that
   sanctions a fan-out - *"collect results via FILES at agreed paths, never wait on
   notifications"* - and `/check` is a fan-out that no prompt sanctioned, so the rule was never
   applied to it. Smallest change, and it makes the deep pass available to a launched session
   without anyone relaying anything.
2. **Route a subagent's completion back to the session that spawned it** when that session is
   itself a subagent. Harness behaviour rather than repo code, so this is a report, not a task -
   but it is the version that needs no discipline from any prompt.
3. **Have the skill say what it did.** "Fanned out, N angles, results at `<path>`" is actionable;
   returning instructions that a careful session correctly reads as "did not run" costs that
   session the deep pass every time.

Nothing here asks check.md to change its classification rule. That rule is what kept A's and D's
reports truthful, and it should stay.

## Evidence

The 2026-09-02 live-run handoff, "What caused friction" finding 2, drained 2026-09-08. The six
relays and the rulings taken on each are in the orchestrator home's
`docs/handoffs/2026-09-02-day-wave-plan.local.md` (gitignored).

Verified by reading three 2026-09-02 handoffs rather than by recollection, and their wording is
quoted here because all three were drained on 2026-09-09. Rows A (teams spec diagnosability) and D
(mistake-trigger hooks) both reported `simplify: inline`, each giving check.md's own reason - "the
skill returned fan-out instructions, which in a launched session means it did not run". Row C
(OGraf host page) reported `simplify: delegated (relayed)`, which is the counter-example: it is
delegated only because the orchestrator relayed the result back. The earlier
`2026-09-02-orchestrator-review.md` reported both legs inline for the same reason as A and D. The
files themselves print from `git show 91496ca2:docs/handoffs/2026-09-02-a-teams-spec-diagnosability.md`,
`git show 11c86fe7:docs/handoffs/2026-09-02-d-mistake-trigger-hooks.md` and
`git show 592891dc:docs/handoffs/2026-09-02-c-ograf-host-page.md`.

The rule that already exists but was never applied to `/check` is the last bullet of "The line
rules" in `.agent-workflows/orchestrator/prompts.md`; the notification-routing behaviour is stated
in `.agent-workflows/orchestrator/launch.md` and again in `check.md`'s own phase 2.

**Confirmed again, 2026-09-04, at larger scale.** Row C's `/check` fanned out to eight review
legs, and every completion notification again routed to the launching orchestrator session
instead of to C - C ended a turn waiting for results that were never going to arrive there and had
to be resumed; all eight were relayed by hand, same as the six on 2026-09-02. This is not an
occasional stray: it is every leg, every time, so `/check` inside a launched wave row currently has
no result channel of its own - the gap is structural, not a one-off from a busy day. Eighteen rows
have now also reported the simplify leg returning fan-out instructions and running inline instead
(the A/D pattern above), at a volume nobody has costed against the fix in item 1.
