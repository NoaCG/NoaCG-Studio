# AC-9: a failed check repairs once, then stops and asks

Recorded by the implementing row (branch `claude/j-plan-run`), 2026-10-09, on Windows 10, from
Claude Code, against an isolated wave store.

## What was run

- `node --test scripts/plan-run.test.mjs`: after one failed check `next` says `launch repair`;
  after a second, `next` says `stop`, a further repair or the next phase is refused, and once
  `stop` is recorded the run stays stopped until the owner's answer is recorded as `answered`,
  which allows exactly one more repair.
- A real `/plan-run` on a throwaway one-phase plan whose acceptance cannot be met (a file equal to
  its own SHA-256 digest, judged by a fixed `verify.mjs`). Same setup as AC-8: a Claude Code
  subagent coordinator, fresh `wave-row` builder, checker and repair sessions one at a time, a
  scratch repository landing by fast-forward, a scratch wave store.

## Observed

The run's wave file:

```
## Steps
- 13:17:52Z phase 1 build claude/plan-fail-p1-build wt/claude-plan-fail-p1-build
- 13:19:46Z phase 1 landed 548c9be (acceptance not met: verify.mjs FAIL, no answer.txt; notes only)
- 13:20:01Z phase 1 check claude/plan-fail-p1-check wt/claude-plan-fail-p1-check
- 13:21:50Z phase 1 fail landed d22e740: no answer.txt, verify.mjs prints FAIL (goal is a SHA-256 fixed point, infeasible); ...
- 13:22:00Z phase 1 repair claude/plan-fail-p1-repair wt/claude-plan-fail-p1-repair
- 13:23:11Z phase 1 landed 03e0a64 (acceptance not met: verify.mjs FAIL, no answer.txt; notes only)
- 13:23:24Z phase 1 check claude/plan-fail-p1-check-2 wt/claude-plan-fail-p1-check-2 (second check, after repair)
- 13:25:07Z phase 1 fail landed b12dac7: still no answer.txt, verify.mjs FAIL; ...
- 13:25:15Z phase 1 stop check failed again after the repair: the goal (a file equal to its own SHA-256) cannot be built; owner must change the goal or the oracle

## Report
Needs you: phase 1 cannot pass as written. ... Recommended: answer.txt holds the SHA-256 of a stated input file, and verify.mjs exits non-zero on FAIL.
- Stopped at phase 1 at 16:25 Helsinki: the check failed again after its one repair.
```

The coordinator's `next` calls answered `launch build`, `launch check`, `launch repair`,
`launch check`, `stop phase 1: its check failed again after a repair`, then `stopped`. Exactly
one repair session ran. The coordinator ended with one question for the owner and its
recommendation, and the report says why the run stopped.

## Limitations

- The phone notification was not sent: in this test the coordinator was a subagent told the owner
  could not be reached. `PushNotification` was available to it. A real coordinator is the main
  session, which sends it as `.agent-workflows/plan-run.md` says. From Codex the question goes in
  the coordinator's thread (AC-13).
- The second check needed a branch name the procedure did not give; the procedure now says `-2`.
