---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "`noacg login --name My Laptop` stores the key as \"My\"; `noacg pack --name My Pack out.json` names the pack \"My\" and treats \"Pack\" as a package to bundle; `noacg caspar play` ignores a word it was not expecting."
serves: NOW
size: small
touches: cli/src/commands/pack.ts, cli/src/output.ts
needs-owner: none
---

# `pack` still takes an unquoted flag value and drops the rest of it

**Two of the three are FIXED and this file's title outlived them.** `claude/ae-cli-0-3-1` closed
`login` and `caspar` in 0.3.1, verified on `main` at `4f95444b`: `cli/src/commands/login.ts:127`
calls `refuseStrayArgs(args, 0, '--name "My Laptop"')`, and `cli/src/commands/caspar.ts:488-491`
defines `refuseStrayCasparArgs`, which the switch at `:494-520` calls from `agent`, `status`, `play`
and `stop`. **`send` still does not call it, deliberately** - its words ARE the AMCP command
(`:503-507`), which is the exception `refuseStrayArgs`'s own doc comment records.

**`pack` is the only verb left unguarded**, and it is the one the file below calls the worst of the
three. The counts and line numbers throughout were re-derived on 2026-09-10; the file had said eight
of thirteen verbs were unguarded, which was true when it was filed and is a release out of date. The
slug is kept because other files point at it.

**Filed:** 2026-09-09. **Source:** two of the eight findings a mis-scoped review left addressed to
nobody, listed in `git show a2ab4097:docs/handoffs/2026-09-09-j-one-date-for-the-push.md` under
"Eight findings addressed to nobody". That row verified none of them, because they were another
branch's diff; they were re-derived against `cli/` here, and the re-derivation turned up a third
verb the finding had not named.

**Not taken on the night it was filed** because `claude/ae-cli-0-3-1` held `cli/` that evening. That
branch fixed `login` and `caspar`; see the note under the title. Whoever takes `pack` should do it in
the same pass as `cli-defects-a-review-found-after-its-branch-had-landed.md`, which carries five more
findings in the same files, including the one that says `docs/AGENT_CLI.md` currently calls this
grammar complete.

The 2026-09-09 time-to-air walk found this class of defect on `scaffold` and it was fixed there:
`refuseStrayArgs` in `cli/src/output.ts:139` refuses a word left outside a verb's flags. **Counted on
2026-09-10, after 0.3.1: thirteen of the fourteen verbs in `COMMANDS` (`cli/src/index.ts:66-80`) now
refuse a stray word** - twelve through `refuseStrayArgs` and `caspar` through `refuseStray` directly.
`pack` is the one that does not, and it is the one that reads a string flag out of the same argv as
its positionals, so it is the one that can still swallow half a value.

## Why

An unquoted `--name` with a space in it is the mistake people actually make, and every surviving
case fails silently rather than loudly.

**`pack` is the worst of the three, because the dropped word is not dropped.** `inputs` is
`args._.slice(1)` and `name` is `flagString(args, 'name')` (`cli/src/commands/pack.ts:11-16`), so
`noacg pack --name My Pack out.json` calls the pack "My" *and* hands "Pack" to the bundler as a
package path. The verb fails on a file that does not exist, with an error naming a word the user
thinks is part of a title.

**`login` is the most durable.** `flagString` returns one token
(`cli/src/output.ts:52-56`), so `noacg login --name My Laptop` sends `name=My` to the consent page,
and "My" is what the user sees in Settings > Account > Agent access weeks later when they come back
to revoke the right key. "Laptop" goes without a word, and the success line prints
`Logged in to ... as "My"`, which reads like a confirmation rather than a truncation.

**`caspar play` is the smallest but sits on the on-air path.** It requires `--url` and throws a
`UsageError` without one (`cli/src/commands/caspar.ts:510-511`), so there is no silent wrong-target
play. What it does swallow is a word past its flags - `noacg caspar play --url http://host/out 1`
plays the URL and never mentions the `1` the operator meant as a channel - and a `--url` whose value
was not quoted is truncated at the first space and sent to CasparCG verbatim.

## What it would take

**Only `pack` is left.** It takes any number of packages, so it cannot use the guard as written and
needs its own sentence: refuse an input path that does not exist before bundling, and say that an
unquoted `--name` is the usual cause.

The two that are done are worth reading before writing that sentence. `login` took no positional
argument, so `refuseStrayArgs(args, 0, '--name "My Laptop"')` beside its `flagString` call was the
whole fix (`cli/src/commands/login.ts:127`). `caspar` was the judgement call, and it was settled by
giving the sub-commands their own helper rather than by widening the guard's `0 | 1`:
`refuseStrayCasparArgs` (`cli/src/commands/caspar.ts:488-491`) is called from `agent`, `status`,
`play` and `stop`, and `send` is left out because its words ARE the AMCP command.

The fix wants a case in `cli/test/`, since the failure mode is a silent success and nothing else
would catch a regression.

## Evidence

- `cli/src/output.ts:108-141` - `refuseStray` and `refuseStrayArgs`, and the doc comment naming
  `pack` and `caspar send` as what deliberately does not call the second one. The comment records
  what the original defect cost: a graphic quietly called "Football" in its `<title>`, its SPX
  description and its file names.
- `cli/src/output.ts:52-56` - `flagString` returns the last token of the flag, never the rest of
  the line.
- `cli/src/commands/pack.ts:11-16` - `inputs` and `name` read from the same argv.
- `cli/src/commands/login.ts:138-167` - the `--name` read, the consent URL it builds, and the
  success line that prints the truncated name back.
- `cli/src/commands/caspar.ts:494-520` - the sub-command switch; `--url` is read at `:510-511`.
- `docs/AGENT_CLI.md`, "Time to air, measured" - the walk that found the original.
