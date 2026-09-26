# The 2026-09-05 read: fifty handoffs, and where each recurring mistake went

Moved here verbatim from docs/MISTAKE_TRIGGERS.md on 2026-09-26, when that document kept only the routing.

The three hooks that landed on 2026-09-05 were picked from evidence, not from a brainstorm: every
entry in `.agent-workflows/orchestrator/incidents.md` and every handoff from 2026-09-01 to
2026-09-05, fifty files, grouped by shape and counted. The count is how many handoffs carry the
same mistake. The point of keeping the table is the ROUTING, so the next reader does not re-derive
it: most of what recurs is not a hook, and saying which home it has is the answer.

| Recurring mistake | Handoffs | Home | Why there |
|---|---|---|---|
| A follow-up push cancels the earlier CI run and plans only its own delta; the new run reports green having skipped every shard | 16 | **RETIRED 2026-09-06 in the workflow** - `ci.yml` plans every branch push from the merge-base with `main`, so the replacement covers what the cancelled push run owed. The warn hook stayed, belt-and-braces, and now carries the cancelled-DISPATCH case instead | routed here as a hook because a workflow fix looked out of reach, and it was not; see the 2026-09-16 note below the table |
| Push and dispatch in one command, a coin flip over which run survives | 4 | **hook, deny** (`guard-command.mjs`) | exact in the command text, and the sanctioned shape is two commands |
| `preview_start` from a linked worktree serves a sibling checkout's page | 4 | **hook, deny** (`guard-preview.mjs`) | one stat decides it, the wrong page renders fine, and the shell guard's message never reaches a session that is not typing a shell command |
| A wave prompt naming a path that does not exist | 2 | **hook, deny** (`guard-agent-launch.mjs`) | exact, and the second half of the plan gate: the prompt a session is handed is a different file from the plan that was checked |
| "A green run is not a verdict until you read WHICH JOBS RAN" | 19 | contract | whether the colour was believed is invisible to any call; the push notice names the command at the moment a run is replaced, which is as close as a mechanism gets. Since 2026-09-06 a skipped shard is the plan being believed rather than a hole, so the job list is read to check the plan, not to catch a cancellation |
| A local full suite from a worktree before landing | 8 | hook-shaped, unbuilt (above) | needs the matcher measured; today a memory entry, the wrong home |
| An edit to a file another live row holds, or beyond the row's `TOUCHES` | 12 | queue-time gate (`merge-order.mjs`) + contract | a per-edit hook fails test 2: the fact is every other worktree's diff, and a git call across all of them on every `Edit` is the cost the doc forbids |
| A new spec that is not in `FOCUS` or the map never runs on the gate it was written for | 3 | build gate, unbuilt - `docs/backlog/unmapped-spec-never-runs-on-its-gate.md` | the fact is the state of two files against a directory, which is a tree, not a call |
| Ending a turn on a wait nothing will wake | 6 | built (`stop-wait.mjs`) | the 2026-09-04 widening, its false positive on quoted text, and the two 2026-09-16 misses below all stay with that hook |
| A dev server left running is adopted by the suite | 3 | built (`guard-command.mjs` port check) | the 2026-09-05 case was a server killed mid-leg, which no call shows |
| A handoff deletion list that was wrong | 5 | built (`handoff-trace.mjs`) | |
| The instruction chains at their byte ceiling | 9 | built (`check:shared-instructions`) | |
| The row's premise was wrong, the bug did not reproduce | 9 | nothing | content of a correctly shaped prompt; the fix is the "reproduce first" step, which is a contract line where the work happens |

Two things the read taught about the METHOD, worth more than any row. First, the first real event
fed to the push notice was silent, and correctly so: the sha it named had two runs, the cancelled
push run and the green dispatch that cancelled it, and the rule as first written read only the
newest. The fix was the rule, not the plumbing - one finished run for the old tip is enough,
whichever it was - and it was found by feeding a REAL cancelled run from `gh run list`, not by
reasoning about the regex. Second, the fan-out entry above was measured by the row that was going to
build it, twice, with opposite results - and the first measurement alone would have landed as a
refutation of a sentence four contracts state. One observation is not a rule in either direction;
the standard this file sets for a hook, the real case AND the must-not-fire case, applies to a
refutation too.

**A third thing, learned on 2026-09-16 by the row that re-opened the table's first line.** That
mistake was routed here to a warn hook because a workflow fix looked out of reach. It was fixed in
the workflow on 2026-09-06 anyway: `ci.yml` now measures every branch push from the merge-base with
`main`, so a cancelled predecessor's delta is covered by construction and the hook became
belt-and-braces. The prose did not follow. Ten days later `docs/VERIFICATION.md`,
`docs/WORKFLOW_ARCHITECTURE.md`, two backlog files and the hook's own header still described the
retired mechanism as current, and a wave row was planned off that prose to build a fix that
existed - one that would have made the shipped behaviour narrower, since it proposed applying the
merge-base only when no finished run existed for `before`. The row that catches this is the one
that reproduces first, which is why that step is a contract line and not advice. The routing
lesson is the harder one: **a mistake's entry in this table records where the answer went, and the
answer can move.** When a fix lands upstream of a hook, the hook's header, the contract prose and
the backlog file are all now wrong, and nothing in this repository fails when they are. The table's
"the row's premise was wrong" line counts nine handoffs to 2026-09-05; this is another, and the
first where the premise came from the repository's own documentation rather than from a misreading
of the code. That is the worse kind, because the documentation is what a planner reads.

**A fourth thing, learned on 2026-09-16 from two rows the stop-wait hook did not catch.** Row SC
stopped at 13:31:30Z on "The waiter will wake me when the exit line lands", and row SE stopped at
15:32:46Z on a background watcher. Both had the "never end a turn waiting" line in their prompts;
both were recovered only because a person was awake. The two misses had DIFFERENT causes, and
finding that out took minutes because the detector is a pure function that can be fed a real
sentence: SC's words matched no pattern, SE's matched two. So SE was never a detector problem at
all. The hook had fired on SE ninety seconds earlier, correctly, and gone silent on the second wait
because it bailed on `stop_hook_active` - the flag Claude Code sets while a session is continuing
BECAUSE a stop hook blocked it, which does not clear when the session goes back to work. **The
guard was a one-shot.** It is now a budget of three refusals counted per session, which does the
flag's only real job, breaking a loop, with a number instead of a cliff.

Two lessons that outlive this hook. First, **a guard that fires once is a guard that a habit
outlasts**, and every blocking hook should be asked how many times it can fire before the harness's
own loop-breaker silences it. Second, the delivery half was measured rather than argued: a wave row
is a SUBAGENT, so `SubagentStop` carries that row's own `last_assistant_message`, exit 2 blocks that
row's stop, and the row gets another turn with the message in it. That was established by launching
a throwaway subagent that ended a turn on a real background task, twice, and reading the payloads -
about four minutes, against a reading of the code that would have been a guess either way.
