---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "Four verbs that take a path tell an operator to delete the word they should have quoted; the fitted types table exceeds the terminal from a 27-character type id; `mcp.ts` and `output.ts` both name a `refuseStray`; and two sentences in AGENT_CLI.md describe behaviour the code does not have."
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

**The shape is worth more than the five defects.** `.agent-workflows/check.md` says findings about
another branch's files are relayed to the session that owns it, and none of these could be: the
session was over. A finding about a branch that has ALREADY LANDED has no relay target and no
default home, so it lands wherever its finder happens to be writing - which on 2026-09-09 was three
separate handoffs, all of them deleted the next day. That is the mechanism to fix, and this file is
the workaround.

## The five, each re-derived

**1. Four verbs give the wrong advice for the mistake they exist to catch.** `refuseStrayArgs(args, 1)`
is called with no `example` by `docs.ts:28`, `inspect.ts:34`, `screenshot.ts:27` and `validate.ts:89`.
With no example, `refuseStray` (`cli/src/output.ts:115-117`) prints "Everything this verb takes is a
flag, so drop the word or hand it to the flag it belongs to." All four take a positional, so that
sentence is false for all four. The concrete case is
`noacg screenshot ./g --out C:\My Shots\frame.png` typed unquoted - exactly what the guard is for -
and the operator is told to delete the word rather than quote the path.

**The obvious fix does not cover two of them, and this is where the work is.** Scoping the
no-example advice to the `allowed === 0` verbs fixes `screenshot` (`--out`) and `validate`
(`--screenshots`), which have a space-holding flag to point at. `docs` and `inspect` have no flag at
all - neither file calls `flagString`, `flagBool` or `flagNumber` - so there is nothing to quote and
no example to give. They need a third sentence: this verb takes one argument and you gave it two.
AE's fix was right for `caspar`, whose flags genuinely cannot hold a space (`caspar.ts:489-490` says
so).

**2. The fitted types table exceeds the terminal from a 27-character type id.** Measured on
2026-09-10 by porting the allocator at `cli/src/commands/types.ts:39-70` and running it at 60
columns, which is the narrow clamp (`:42` clamps to 60-200):

| type id | allocated widths | line |
|---|---|---|
| 18 (`event-notification`, today's longest) | 18, 9, 9, 9, 7 | 60 |
| 26 | 26, 6, 6, 7, 7 | 60 |
| **27** | 27, 6, 6, 7, 7 | **61** |
| 46 | 46, 6, 6, 7, 7 | 80 |

**The mechanism is not the negative budget**, which is the reading AH's handoff recorded and which
this file said until the review corrected it. `remaining` at `:43` only goes negative at 46
characters. What actually overflows at 27 is the three header floors - `fields` 6, `events` 6,
`designs` 7, nineteen columns - exceeding the eighteen the id has left. The comment above `:47`
acknowledges that fixed ids are never cut; it does not say the line then exceeds the terminal, which
is the guarantee `docs/AGENT_CLI.md` advertises. Nine characters of headroom is more than the
handoff believed, and it is still one id away from being spent.

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

Items 3, 4 and 5 are minutes each. Item 1 is a third advice sentence plus a case per verb in
`cli/test/`, since the failure mode is a silent success. Item 2 needs a test at a 27-character
synthetic id and a decision about what the table does when the headers no longer fit - truncating the
id is not available, because a truncated id cannot be pasted into `--type`, which is why that column
is protected in the first place; dropping a header's floor is the other lever.

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
