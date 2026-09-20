# TC - is the agent door usable by a stranger

Branch `claude/tc-agent-door-audit`. Worktree `agent-a59f3d208f704738b`.

## The answer, and where it lives

`docs/AGENT_DOOR_AUDIT.md`, indexed in `docs/README.md` under Binding contracts as a DATED
measurement rather than a standing contract. Route for the owner:
`docs/acceptance/owner-queue/2026-09-16-tc-agent-door-audit.md`.

**The verdict.** Yes for Yle and yes for students on the road this is strongest on - two commands and
sixteen seconds to install, one sentence to a broadcast-credible graphic, 8.4 s from `save` to that
graphic readable on a public output URL - provided the marketplace-add line is treated as step one
and this laptop's own plugin is updated. The one thing I would not promise a
stranger is that they can hand over their own SVG through an agent.

Everything in the file was run tonight on this laptop against the published 0.3.3. Three things are
marked UNVERIFIED and are listed at the top of the file rather than buried.

## What is left, and why

**The one thing genuinely open: does a Codex SESSION follow the skill?** The install and the load are
proven (`codex plugin marketplace add` / `codex plugin add` both work verbatim from the README, the
skill and its five references land on disk, and the machine's real Codex home already holds 0.3.3 -
current, where Claude Code's is 0.2.0). Two bounded attempts through the rescue workflow never
reached a Codex turn:

1. `401 Unauthorized` - my fault, I had pointed `CODEX_HOME` at the isolated profile I installed into,
   which has no credentials.
2. Against the real authenticated home: `exec_command failed: CreateProcess { message:
   "Rejected(\"Failed to create unified exec process: CreateProcessWithLogonW failed: 267\")" }`,
   10.7 s, no turn. 267 is `ERROR_DIRECTORY`; the probe was told to create its own scratch cwd and
   something about that path or the sandbox refused it.

**Codex capacity never refused anything** - neither failure was a quota message, and zero Codex model
tokens were spent. Whoever picks this up: run it from an EXISTING directory rather than one the
probe creates, and do not override `CODEX_HOME`. It is a ten-minute question, not a row.

**`/plugin` panel and hosted Create-with-AI** stay unwitnessed by design - no terminal, and no API
money respectively.

## Evidence and traps that are in no repo file

**The SSH failure I nearly filed as a defect.** `claude plugin marketplace add NoaCG/NoaCG-Studio`
failed for me with `SSH host key is not in your known_hosts file` on the first try, and I was one
edit away from filing it. It reproduces deterministically when `CLAUDE_CONFIG_DIR` is a very long
path (my scratchpad, ~190 chars) and never at a normal one - four fresh short-path configs, four
clean runs printing `SSH not configured, cloning via HTTPS`. A normal `~/.claude` is unaffected. The
audit records it as an artefact so nobody re-finds it; what IS real at a long path is
`fatal: ... Filename too long`, because `core.longpaths` is not set on this machine.

**The grep that lied to me.** I first "confirmed" the skill mentions SVG once using
`grep -niE "svg|existing (image|graphic|design)|import"` - the hit was on `import`, not `svg`. The
correct number is zero (`grep -ci svg` -> 0). The code review caught it. If you check a "the doc
never says X" claim, grep for X alone.

**`scripts/save-to-air-bench.mjs` runs the CHECKOUT's `cli/dist`, not the published CLI.** A fresh
worktree has neither `node_modules` nor `dist`, so the first queued run (`j-1223`) died with
`Cannot find module …\cli\dist\index.js` after already cleaning the account. `npm --prefix cli
install && npm --prefix cli run build` first. It also needs `.env` with `E2E_EMAIL` / `E2E_PASSWORD`
in the worktree it runs from; **I copied the primary checkout's `.env` into this worktree and left
it there** (gitignored, `.gitignore:219`). Delete it when this worktree is removed.

**It waited 19 minutes for a turn** behind another session's browser job (`j-1225`). One browser job
per machine, working as intended - but budget for it if anyone plans to re-measure to a deadline.

**Scratch state I created.** Removed: `~/.claude-tcaudit`, `~/.claude-tcaudit2`, `~/.claude-tca3..5`.
Left behind because a Codex process holds its sqlite files open: `C:\Users\ahonemi\tc-codexhome`
(an isolated Codex home with the plugin installed) - harmless, delete it when nothing holds it.
Also `C:\Users\ahonemi\tc-work` (scaffolds, screenshots, the MCP probe scripts, build logs).
**The machine's real Claude Code and Codex configs were never modified** - `claude plugin list` still
reports 0.2.0, deliberately.

## Anything needing the owner

**One question, and it is his because it needs his account.** `claude plugin install noacg` fails on
a clean machine: Claude Code ships with no marketplaces configured, so the marketplace-add line is
mandatory. Making the bare command work means being listed in `anthropics/claude-plugins-official`,
which is a pull request from an account. `needs: account`. Nothing else in this audit needs him.

**One thing to do to this laptop**, not a question: it loads plugin **0.2.0** from
a marketplace checkout last refreshed 2026-08-28, still pinned to the pre-rename `miwco/NoaCG-Studio`
(GitHub 301s it). One command - `claude plugin marketplace update noacg-studio`. I did not run it:
it would swap the skill text under sessions working tonight.

## Defects filed

Three, each with the smallest fix named in the file itself:

- `docs/backlog/the-legibility-check-cannot-see-a-slab-painted-on-a-pseudo-element.md` - the shipped
  sb01 scoreboard is warned twice about text sitting on a slab it plainly sits on, because
  `resolveBacking` (`src/validation/readabilityCheck.ts:136-148`) walks real DOM ancestors and never
  asks `getComputedStyle` for `::before`. Smallest fix: read the pseudo-elements when the element's
  own background is transparent.
- `docs/backlog/nothing-tells-a-user-their-installed-noacg-plugin-is-stale.md` - and the review
  widened it: the npm-`latest` comparison exists ONLY in `cli/plugin-mcp/mcp-server.mjs:156-161`, so
  a plain terminal user gets no staleness warning for the CLI either. Smallest fix: a row in
  `noacg doctor`.
- `docs/backlog/the-agent-door-has-no-answer-for-here-is-my-svg.md` - no import verb, and the skill
  never says the word SVG, so an agent handed artwork will redraw it, which is exactly what the
  studio's verbatim import path exists to prevent. Smallest fix is text in `SKILL.md`, not a verb.

Nothing was fixed in code. No broken link or wrong command turned up - every documented command ran
as written, once `--out` is included, which the audit's table now does.

## One thing I deliberately did not touch

A gap list elsewhere still read "standalone `validate ./sb --screenshots ./shots` still has not
been run on its own". It has now, cleanly, and `docs/AGENT_DOOR_AUDIT.md` says so - but that
document had produced two merge conflicts between rows this week and this branch did not own it.

## `/check`

`review: delegated` (12 findings, 12 fixed). Scope handed from `node scripts/review-request.mjs`:
branch `claude/tc-agent-door-audit`, base `20d4b094b0a63be2269739025093e6c7eacee1db`, 6 files. The
review reported that same base and that same file list, and I scope-checked it against
`git diff --name-only <base>..HEAD` plus `git status --porcelain=v1` - matched exactly, clean tree.

It was worth the wait and I would not have caught most of it. Every finding was verified against the
code before acting: the SVG grep was wrong (above); "twenty-three seconds" reconciled with no reading
of my own table (it is twenty); my OBS-and-students worry was unsupported, because
`engineSupport.ts:172-180` puts a CURRENT OBS at Chromium 127 and only an "OBS not updated since
2023" at 103; `resolveBacking` is at :136 not :137; the backlog item pointed a fixer at
`css/template.css`, which is a scaffolded output path, not `src/templates/scoreboards/sb01.ts:77`;
the scaffold row omitted its required `--out` while the same file claimed every documented command
ran as written; the MCP comparison said "the same verbs" when `MCP_COMMANDS` (`cli/src/mcp.ts:40`)
exposes seven; and my context numbers silently disagreed with `docs/AGENT_CLI.md`'s (151 tok /
2,434 chars / 590 tok against my 132 and 2,489 / 622) - now acknowledged in the file instead of
contradicted, with a note that somebody should re-measure that table once.

`simplify: inline` - the skill returned fan-out instructions (launch four background agents), which
this workflow counts as not run, so the pass was done here: removed internal orchestration language
from an owner-facing document ("the finding the row asked for", a session letter used as a source,
"the row allowed one") and one double space.

`verify: inline` - `npm run build > <log> 2>&1; echo $?` read from its own exit code, not a
pipeline's. `npm ci` was needed first (fresh worktree, no `node_modules`). First run exit 0, 1789
tests / 1788 pass / 0 fail / 1 skipped - but that run started before my last edits, so it was re-run
over the final tree. Also run individually against the final content, all exit 0:
`check-owner-queue`, `check-docs-index`, `owner-receipts --check`, `check-line-endings`,
`check-copy`, `check-tree-shape`, `check-contract-citations`. `check-copy` matters here more than
usual: it is the gate that catches machine-written prose, and this branch is nothing but prose.

`taste: not applicable` - six markdown files; nothing here can move what a graphic looks like.
