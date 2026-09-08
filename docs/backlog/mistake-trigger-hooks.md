---
v: 2
source: owner
kind: ask
raised: 2026-09-01
state: parked
note: "the launch-path hook landed 2026-09-05; the fan-out hook's premise was measured twice that day with opposite results, so what is left waits on a measurement that separates the two shapes"
asked: "we keep running into the same mistakes... why can't we find those when we need them? - a rule with a tool shape should fire at the tool call instead of relying on someone having read it"
---
# The mistake-trigger hook that is still unbuilt

**Filed:** 2026-09-02, from the 2026-09-01 night-wave plan (row E, never launched). **Source:**
owner, 2026-09-01. **Narrowed 2026-09-02** on `claude/d-mistake-trigger-hooks` and again
**2026-09-05** on `claude/r-mistake-triggers`, which read fifty handoffs and the incident file for
what actually recurs and built three hooks from that (`docs/MISTAKE_TRIGGERS.md`, "The 2026-09-05
read"). What is left is one item, and it changed shape.

## Why

A rule in a contract fires only if somebody reads the contract; a hook fires every time. On
2026-09-01 the `check` workflow already said a launched session must not spawn a background
fan-out, and session C spawned six anyway - twenty-one findings survived only because a human was
awake to relay them.

## What closed

- **`docs/MISTAKE_TRIGGERS.md`** says which lessons have a tool shape and become hooks, which
  belong in a build gate, which are judgements no mechanism can hold, and how a hook is verified.
- **The handoff hook** (2026-09-02): destroying a handoff that still lists open items with no
  wave-plan trace raises a notice.
- **The launch hook** (2026-09-05): `scripts/hooks/guard-agent-launch.mjs` refuses an Agent launch
  whose prompt's `TOUCHES` or `READ` line names a path that exists neither in the launching
  checkout nor on `origin/main` nor as a gitignored file, quoting the entry back. Parser in
  `scripts/wave-plan-check.mjs` (`promptPathProblems`, on the shared `pathProbe`), tested there; the
  hook is fed real events in `scripts/hooks/guard-agent-launch.test.mjs`.
- Two hooks this file never asked for but the evidence did, same day: the follow-up push that
  cancels an unfinished CI run (`warn-command.mjs`, 16 handoffs), with the push-and-dispatch pair
  refused in `guard-command.mjs`; and `preview_start {name}` from a linked worktree
  (`guard-preview.mjs`, 4 handoffs).

## What is left

**A turn that ends while a background Agent this session launched has not reported.** The
2026-09-02 shape - warn on any background fan-out from a launched session - rests on "a launched
session never receives its subagents' completion notifications", and on 2026-09-05 that was
measured twice from one launched row with opposite results. A background Explore agent the row
launched through the Agent tool reported back mid-turn, appended to the result of its next blocking
tool call. The eight review finders the code-review skill forked from the same row reported to the
orchestrator, none to the row, and reached it only through `scripts/relay.mjs`. Both fit a
narrower rule - a report can reach a launched session mid-turn and cannot reach one that has
stopped - but which the harness does for a given launch shape is not known, and a warn on every
background launch would fire on the shape that works.

So the moment both measurements allow is Stop, not the launch. The check: the transcript holds an
`Agent` tool use with `run_in_background` not false and no later `task-notification` carrying that
agent's id. The cost is one reason it waits: the launch can be far behind the tail
`scripts/stop-wait.mjs` reads, so this reads the whole transcript at every Stop. The other is the
missing measurement: launch a background agent from a launched row through the Agent tool and
through a forked skill, end the turn each time, and record where each report lands. Build on
`agent_id`, which every hook event inside a subagent carries, not on the transcript path. Test
against a real launched row, both directions, per `docs/MISTAKE_TRIGGERS.md`.

## Evidence

The night-wave plan of 2026-09-01 (row E, verbatim in the orchestrator home's
`docs/handoffs/2026-09-01-night-wave.local.md`);
the 2026-09-02 orchestration-guardrails handoff for the first three guardrails (drained
2026-09-08 - each guardrail's REASONING sits in its own hook header, but its 22-case
feed-a-real-event verification did not survive, and none of those three hooks has a test file:
`docs/backlog/hook-tests-run-only-by-hand.md`. `git show
b8d1f58f^:docs/handoffs/2026-09-02-h-orchestration-guardrails.md` prints the cases);
`docs/handoffs/2026-09-02-d-mistake-trigger-hooks.md` for the 2026-09-02 round; the 2026-09-05
mistake-triggers handoff for the two measurements that reshaped this item, restated in full above
(drained 2026-09-08).
