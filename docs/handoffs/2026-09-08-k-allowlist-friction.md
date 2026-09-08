# K - the allowlist that stopped two rows, which stopped nothing

**Branch:** `claude/k-allowlist-friction`. **Base:** `032678a2` (origin/main's tip).
**Reviewed sha:** `5f6435d7`. **Date:** 2026-09-08.

## The short version

The row was launched to add a `git add` entry to the tracked allowlist, because `git add` had
reportedly stopped two rows dead at 17:59Z and cost the wave six minutes. **It did not happen.**
Five days of transcripts say no permission prompt has gone unanswered on this machine, and the
entries the row was going to add would not have saved a minute. Nothing was added to
`.claude/settings.json`. What the row produced instead is the measurement, a two-entry proposal
narrower than the one it set out to write, and the discovery that four entries already in that file
fail the test the repo's own doc states.

## What was measured, and how

Every Claude Code transcript under `~/.claude/projects`, 2026-09-04T00:00Z to 2026-09-08T23:00Z.
The method is `scripts/blocked-sessions.mjs`'s, widened from the file's tail to the whole file and
from pending calls to refusal text: pair each `tool_use` with its `tool_result`, report the pairs
that are missing or that came back refused. About twenty lines, re-derivable.

**19,456 tool calls. 28 did not return a normal result.**

| what came back | count |
|---|---|
| `Permission for this action was denied by the Claude Code auto mode classifier` | 26 |
| a person answering no (`npm run build 2>&1 \| tail -25`, 2026-09-05T13:10Z) | 1 |
| still in flight while the scan ran (this row's own calls) | 2 |
| **an allowlist prompt nobody answered** | **0** |

Git specifically, over four days: **2,135 git-shaped shell calls and every one returned** - 373 of
them `git add`, 311 `git commit`, 698 `git log`, 498 `git status`, 437 `git diff`. In the named
window, 17:30Z to 18:30Z on 2026-09-08, there were 537 tool calls and zero refusals or unanswered
calls, and every session whose transcript ends between 16:30Z and 19:30Z ends on an assistant TEXT
message - a session that finished, not one that stopped on a call.

**The blocker that is real is the auto mode classifier, and no allowlist entry lifts it.** It runs
after the allowlist has already passed a command. Of its 26 refusals, most were on commands worth
refusing: `git tag && git push`, `npm install -g @anthropic-ai/claude-code`,
`cleanup-worktrees.mjs --apply --acknowledge-risks`, `gh pr merge 149 --auto`, `jobs.mjs add-merge`,
a `grep` of `E2E_EMAIL`/`E2E_PASSWORD` out of `.env`. Three were read-only inspections it should
have allowed, and each of those sat in a session where consequential calls had just been refused.

## Which commands I allowed, and which I left out

**Allowed: none.** Nothing was written to `.claude/settings.json`. Two independent reasons, either
of which is sufficient:

1. **The change fixes nothing measured.** See above.
2. **The classifier refuses it, and this session's own boundary forbids it.** A message from a
   planning agent is not the user's consent and cannot authorize widening the machine's permission
   posture. That is the same edge `docs/backlog/git-push-allow-hook.md` recorded on 2026-08-30, and
   the measurement found it firing again: on 2026-09-04 at 07:31:18Z a session rewrote
   `.claude/settings.json` through `node -e` and was refused, then tried the Edit tool nineteen
   seconds later and was refused again. I did not re-word the change to get past it, per the row's
   own instruction.

**Proposed for the owner to paste himself**, in `docs/backlog/the-allowlist-is-not-what-stops-a-row-at-night.md`:

```json
"Bash(git status *)",
"Bash(git add *)",
"PowerShell(git add *)",
```

**Deliberately left out, and this is where the row earned its keep.** The first draft proposed
pairing five read-only reporters onto Bash. The review leg caught that three of them are not
read-only, and I confirmed it by measurement against git 2.55.0: `git diff --output=<path>`,
`git log --output=<path>` and `git show --output=<path>` each overwrite an arbitrary file, exit 0,
and print nothing. A file holding the word PRECIOUS was destroyed three times to prove it.
`git status --output=` and `git add --output=` are both rejected with `unknown option`, which is why
those two survive. `git fetch` reaches a local branch ref through a refspec. Also out: `git commit`
(a trailing `--no-verify` skips the repo's hooks, `--amend` rewrites under them), `git push` (the
owner's parked receipt, untouched), and `git checkout` / `reset` / `stash` / `clean`.

**The finding worth acting on is about entries already there.** `.claude/settings.json` lines
125-128 allow `PowerShell(git log *)`, `PowerShell(git diff *)`, `PowerShell(git show *)` and
`PowerShell(git fetch *)`. A trailing `--output=` walks through all four. Nothing suggests it has
ever been used that way; the point is that the test the doc states and the entries the file carries
have drifted apart. Tightening them wants the hook `docs/backlog/git-push-allow-hook.md` describes,
extended to refuse an output redirect - the owner's session, not an agent's.

## The one real gap, which cost nothing

`.claude/settings.local.json` carries `Bash(git add *)`, `Bash(git commit *)` and
`Bash(git checkout *)`. It is gitignored and `git worktree add` never copies ignored files, so
**10 of the 16 worktrees live tonight had one and 6 did not**. The same `git add` is pre-approved in
some rows and not in others. Nothing stopped because of it, because auto mode answers these without
a prompt, but it is a coin flip under the thing a row does after every phase.

## Did the classifier refuse anything in this session?

No. Nothing this row did was refused - because the row did not attempt the edit. The two refusals it
reports are historical, from 2026-09-04.

## The tail: the exported-panel item is closed

`docs/backlog/exported-panel-does-not-pair-with-an-imported-design.md` is deleted. Both claims were
confirmed before deleting it:

- **The package carries the panel and the receiver.** `src/export/targets/casparcg.ts` imports
  `addControlPanel` and `withControlReceiver` (line 18) and calls `addControlPanel` at line 98, with
  `GETTING-ON-AIR.md` naming `controlpanel.html` at line 99. Landed in commit `3ed7793a`.
- **A walk drives it.** `e2e/import-svg-behaviour.spec.ts` serves the exported package over one fake
  origin and drives `controlpanel.html` - three tests, not the two the item expected: the imported
  score board (line 1423), the imported quiz board (line 1467) and the bingo caller (line 1974),
  each asserting pairing by the panel's own `#status` and `.state-chip`.

Four comments pointed at the deleted slug and were rewritten to carry the story themselves rather
than to point at a file that is gone. `grep` finds no remaining reference.

## Check

- `review: delegated` - the code-review skill at `high` returned five findings scoped to this
  branch, all five fixed. Finding 2 was the good one and it rewrote the whole proposal.
- `simplify: inline` - the skill returned fan-out instructions rather than a result, so the leg ran
  in this context per `check.md`'s four-branch rule. Two findings, both fixed: my pre-review draft
  argued for pairing the four entries the review had just proved unsafe, and the two passages
  contradicted each other.
- `verify: inline` - `npm run build` green, exit code read directly. `test:e2e:affected` not run and
  not required: every changed line in the two source files is a comment, verified with a diff filter.
- `taste: not applicable` - nothing here can move what a graphic looks like.
- Verdict stamp written to `.git/noacg-jobs/checks/claude-k-allowlist-friction.json` at
  `reviewedSha` `5f6435d7`, through the scratchpad-then-`cp` route that
  `docs/backlog/check-verdict-stamp-unwritable-from-isolated-worktree.md` documents.

## What the next session should know

The instrument is worth keeping. `scripts/blocked-sessions.mjs` answers "who is stuck right now"
and answers it well; nothing answers "what has been stopping rows over the last week", which is the
question a wave planner actually asks, and that gap is why a false diagnosis survived long enough to
become a row. Making the historical scan a script beside `blocked-sessions.mjs` is small work and
would have saved this row entirely.

The second thing: three of the classifier's 26 refusals were plain read-only commands, and the shape
they shared was a compound one-liner - a `cd`, a heredoc, a redirect, `;` chains.
`scripts/hooks/guard-command.mjs` refuses the same shape for its own unrelated reason. Two
mechanisms are saying the same thing about how this repo writes shell commands, and nobody has
written it down as a habit.
