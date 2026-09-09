---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "`noacg login --name My Laptop` stores the key as \"My\"; `noacg caspar play` ignores a word it was not expecting."
serves: NOW
size: small
touches: cli/src/commands/login.ts, cli/src/commands/caspar.ts, cli/src/output.ts
needs-owner: none
---

# `login` and `caspar` still take an unquoted flag value and drop the rest of it

**Filed:** 2026-09-09. **Source:** two of the eight findings a mis-scoped review left addressed to
nobody, listed in `git show a2ab4097:docs/handoffs/2026-09-09-j-one-date-for-the-push.md` under
"Eight findings addressed to nobody". That row verified none of them, because they were another
branch's diff; both were re-derived against `cli/` here before filing, and both hold.

**Not taken on the night it was filed** because `claude/ae-cli-0-3-1` held `cli/` that evening.
Whoever picks this up should check whether that branch's own work already moved either verb.

The 2026-09-09 time-to-air walk found this class of defect on `scaffold` and it was fixed there:
`refuseStrayArgs` in `cli/src/output.ts:112` now refuses a word left outside a verb's flags, and
`scaffold`, `save`, `validate`, `inspect` and `screenshot` all call it. Two verbs do not, and both
can still swallow half a value.

## Why

An unquoted `--name` with a space in it is the mistake people actually make, and both surviving
cases fail silently rather than loudly.

`login` is the worse of the two, because what it names is durable and remote. `flagString` returns
one token (`cli/src/output.ts:52-56`), so `noacg login --name My Laptop` sends `name=My` to the
consent page, and "My" is what the user then sees in Settings > Account > Agent access when they
come back weeks later to revoke the right key. "Laptop" is dropped without a word. The verb's own
success line prints `Logged in to ... as "My"`, which reads like a confirmation rather than a
truncation.

`caspar play` is smaller but has the sharper edge: it is the on-air verb. It dispatches on
`args._[1]` (`cli/src/commands/caspar.ts:478-498`) and reads the arguments it expects, so a word
past those is neither used nor mentioned. An operator who mistypes a target gets the previous
target played, with a success exit code.

## What it would take

`login` is the easy half: it takes no positional argument at all, so `refuseStrayArgs(args, 0,
'--name "My Laptop"')` beside the existing `flagString` call is the whole fix.

`caspar` is a judgement call rather than a line, which is why `refuseStrayArgs`'s own doc comment
excludes it: the guard counts arguments after the verb, and `caspar` spends one on its sub-command
and a varying number after that. Either give each `case` in the switch its own arity, or widen the
guard to take a count rather than `0 | 1`. Deciding that is most of the work; `pack` has the same
shape and would want the same answer.

Whichever way it goes, the fix wants a case in `cli/test/` per verb, since the failure mode is a
silent success and nothing else would catch a regression.

## Evidence

- `cli/src/output.ts:100-121` - the guard, and the doc comment naming `pack` and `caspar` as the
  two verbs that deliberately do not call it. The comment records what the original defect cost:
  a graphic quietly called "Football" in its `<title>`, its SPX description and its file names.
- `cli/src/output.ts:52-56` - `flagString` returns the last token of the flag, never the rest of
  the line.
- `cli/src/commands/login.ts:138-167` - the `--name` read, the consent URL it builds, and the
  success line that prints the truncated name back.
- `cli/src/commands/caspar.ts:478-498` - the sub-command switch.
- `docs/AGENT_CLI.md`, "Time to air, measured" - the walk that found the original.
