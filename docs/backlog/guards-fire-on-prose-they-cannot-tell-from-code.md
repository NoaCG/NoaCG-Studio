---
serves: mistake-trigger-hooks
size: small
touches: scripts/hooks/guard-command.mjs, scripts/hooks/guard-agent-launch.mjs, scripts/command-match.mjs
needs-owner: none
---
# Two guards refused correct commands because prose mentioned the thing they guard

**Filed:** 2026-09-05. **Source:** measurement - both fired on the orchestrator session within one
afternoon, on the day the second of them landed.

## Why

The mistake-trigger hooks work: they fire at the tool call, which is the whole point of moving a
rule out of prose. What they cannot yet do is tell code from writing ABOUT code, and both failures
had the same shape.

**`guard-command.mjs` refused a relay write.** The command was
`node scripts/relay.mjs write --branch <b> "<a long message>"` - not a commit at all. The message
text quoted the commit-message style rules, so the commit-message matcher fired on an argument and
the call was blocked. The workaround was to reword a message, which is the wrong thing to have to
do; a session relaying a review should not have to avoid the vocabulary of the thing it relays.

**`guard-agent-launch.mjs` refused a legitimate Agent launch.** It checks every path-shaped token
on a `READ` or `TOUCHES` line against the launching checkout and `origin/main`. The row being
launched was adopting another branch's worktree, so two files it needed existed on that branch and
in that worktree - real, present, correct - and in neither of the two places the guard looks. The
workaround was to move the paths off the key lines into prose, which defeats the check for those
paths entirely.

A guard that is worked around is worse than one that does not exist, because the workaround is
invisible in the next reader's diff.

## What it would take

They are two instances of one question - *what is this token actually part of?* - and want two
different answers:

1. **`guard-command`**: the commit-message matcher should read the message of an actual commit
   invocation, not any quoted string on any command line. `command-match.mjs` already parses git
   invocations; the matcher should ask that parse for the `-m` value of a `git commit` rather than
   scanning the raw line. A sibling finding on the same day (relayed to that row) shows
   `pushesAndDispatches` has the identical bug: it matched `gh workflow run` inside a quoted echo.
2. **`guard-agent-launch`**: when a prompt names the branch or worktree it adopts, resolve paths
   against THAT branch as well as the launching checkout and `origin/main`. The prompt already
   states it; the guard just does not read it.

The same matcher fails in the opposite direction, and the same fix closes it: `git commit -F <file>`
bypasses the commit-message style scan entirely, because the scan reads the raw command text
(`scripts/hooks/guard-command.mjs:23,160-190`) and a message in a file is not on the line. So the
guard refuses a message that is only quoted and passes one that is really being committed. Asking
the git parse for the message rather than scanning the line answers both. (Found 2026-09-05,
carried here when that handoff was drained.)

## Evidence

- The relay refusal, verbatim: *"Blocked: this commit command trips the commit-message style rules
  ... mentions Claude"*, on a `node scripts/relay.mjs write` call.
- The launch refusal, verbatim: *"READ names docs/handoffs/2026-09-05-s-more-behaviours.md"* and
  *"READ names src/templates/importedDesign/timerBehaviour.ts"* - both present on
  `claude/s-more-behaviours`, which is where the launched row was told to work.
- The `pushesAndDispatches` quoted-string reproduction is in the same day's review reports.
