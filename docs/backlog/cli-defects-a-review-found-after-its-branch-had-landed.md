---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "Four verbs that take a path tell an operator to delete the word they should have quoted; the fitted types table's width budget can go negative; `mcp.ts` and `output.ts` both export a `refuseStray`; and two sentences in AGENT_CLI.md describe behaviour the code does not have."
serves: NOW
size: standard
touches: cli/src/output.ts, cli/src/commands/types.ts, cli/src/mcp.ts, docs/AGENT_CLI.md
needs-owner: none
---

# Five `cli/` defects a review found after the branch that could have fixed them had landed

**Filed:** 2026-09-10. **Source:** three handoffs from the night of 2026-09-09, all now deleted -
`git show 4f95444b:docs/handoffs/2026-09-09-ah-publish-0-3-1.md` ("Five findings about code that is
already on main"), `…-ae-cli-0-3-1.md` (the review's fifth finding) and `…-av-reap-at-delegation-end.md`
(the name collision). Every claim below was re-derived against the working tree on 2026-09-10 and the
line numbers are today's, not the ones the handoffs quoted.

## Why

Three separate reviews on the night of 2026-09-09 found real defects in `cli/`, and every one of
them arrived after `claude/ae-cli-0-3-1` had merged as pull request 203. There was no branch left to
relay them to, so three sessions each wrote them into their own handoff and moved on. Two of the
five are defects in shipped code that a user meets on the command line, and none of them was
findable by anything but reading last night's handoffs.

The cluster is filed as one item because it is one afternoon's work in one package, not five
independent ideas, and because splitting it would produce four files nobody would pick up alone.

## The five, each re-derived

**1. Four verbs give the wrong advice for the mistake they exist to catch.** `refuseStrayArgs(args, 1)`
is called with no `example` by `docs.ts:28`, `inspect.ts:34`, `screenshot.ts:27` and `validate.ts:89`.
With no example, `refuseStray` (`cli/src/output.ts:115-117`) prints "Everything this verb takes is a
flag, so drop the word or hand it to the flag it belongs to." All four take a positional AND have
flags whose values hold spaces. The concrete case is `noacg screenshot ./g --out C:\My Shots\frame.png`
typed unquoted - exactly what the guard is for - and the operator is told to delete the word rather
than quote the path. AE's fix was right for `caspar`, whose flags genuinely cannot hold a space
(`caspar.ts:488-491` says so); it needs scoping to the `allowed === 0` verbs.

**2. The types table's width budget is not floored.** `cli/src/commands/types.ts:43` -
`let remaining = terminalWidth - natural[0] - natural[4] - 8` - with `terminalWidth` clamped to
60-200 at `:42`. A long enough type id drives `remaining` negative, and the floor computed from it
one line later (`Math.min(12, Math.floor(remaining / pending.length))`) goes with it. The comment
above that line acknowledges that fixed ids are never cut; it does not say the line then exceeds the
terminal, which is the guarantee `docs/AGENT_CLI.md` advertises. The longest id today is
`event-notification` at 18 characters, which fits at 60 columns with zero slack - so the next longer
id breaks it. AE reported this and left it deliberately; AH's measurement of where the slack runs out
is what makes it actionable.

**3. `cli/src/mcp.ts:117` defines a local `refuseStray` that collides by name with the exported one
in `output.ts:108`** - and `mcp.ts:33` imports `refuseStrayArgs` from that same module, so both names
are in scope in one file meaning two different things. It is a rename and nothing more.

**4. `docs/AGENT_CLI.md:333` says "the grammar today is complete".** It is not: `pack` still reads
`--name` and its positionals from the same argv, so `noacg pack --name My Pack out.json` names the
pack "My" and hands "Pack" to the bundler. The sentence lists `pack` as a "deliberate exception",
which is true about its arity and false about the bug -
`three-cli-verbs-still-swallow-an-unquoted-flag-value.md` is the open item, and this sentence is what
stops a reader finding it.

**5. `docs/AGENT_CLI.md:345` says "the widest line is exactly the terminal width at 40, 60, 80, 100,
120, 160, 200 and 400 columns".** False at both ends, because `types.ts:42` clamps to 60-200. The
branch's own test asserts that the 40-column output equals the 60-column output.

## What it would take

Items 3, 4 and 5 are minutes each. Item 1 is a scoping change to `refuseStrayArgs` plus a case per
verb in `cli/test/`, since the failure mode is a silent success. Item 2 needs one clamp and a test at
a long synthetic id, and a decision about what the table does when the budget really is impossible -
truncating the id is not available, because a truncated id cannot be pasted into `--type`, which is
why that column is protected in the first place.

Do them in one pass over `cli/`, and check the remaining guardless verbs while you are there rather
than filing this a third time.

## Evidence

Three claims about `cli/` were also passed on UNVERIFIED by row AS, from a review pass it discarded
for scoping itself against a stale local `main`. Two of the three restate items 1 and 2 above and are
now verified by this file. The third is unconfirmed and is recorded here rather than lost:
`cli/src/commands/caspar.ts:489-490`, the claim that the comment there is wrong to assert that no
flag on any `caspar` sub-command takes a value that can hold a space. The comment does say that, so
the claim names the right line; whether it is wrong I did not establish, and the only candidate is
`--url`, whose value cannot hold an unencoded space in the first place. Reproduce before acting.
