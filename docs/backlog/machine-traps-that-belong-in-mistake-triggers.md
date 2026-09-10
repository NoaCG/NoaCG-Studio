# Machine traps that have cost real time and live only in a handoff

**Filed:** 2026-09-09, out of the drained handoff for `667ac776` (PR #122), whose author titled the
section holding them "Traps that exist in no repo file". He was right, and they are copied here
verbatim so the handoff could go. **Extended 2026-09-10** with six more, out of the 2026-09-09 wave's
handoffs; the file was called `three-machine-traps-…` until then and nothing cited it under that
name.

## Why

`docs/MISTAKE_TRIGGERS.md` exists because a lesson nobody can find is a lesson nobody has. These
cost a session each and are all still true of this laptop. They are recorded here rather than
straight into that file only because the rows that traced them own `docs/handoffs/` and
`docs/backlog/` and nothing else; moving them is a short edit for whoever picks this up.

**Bash `/tmp` and Python `/tmp` are different directories on this machine.** A heredoc that writes
`/tmp/x` from bash and reads it from python gets `FileNotFoundError`: bash resolves it inside its own
MSYS root, python resolves it as `C:\tmp`. Hand a file between the two through the session
scratchpad with a full Windows path.

**A `Monitor` grep over a build log needs anchored patterns.** `problems \(` and `refused:` both
match node-test NAMES in this repo's own suite - "...are both problems", "parseArgs ... refuses a
too-fast interval" - so a loose filter fires minutes before the build is anywhere near done. Anchor
on `^\[write-version\]` and `error TS[0-9]`.

**Two `npm run build` runs must never overlap.** Both write `dist/`, and the second one's version
stamp is what you end up reading. This is the same failure the root contract
`root/never-occupy-checkout-holds-feature-branch` describes for a shared checkout, arriving instead
through two sessions that each have their own worktree and share the output directory.

## Six more, from the wave of 2026-09-09

Same shape, same reason. Sources are named per group; all three source handoffs were deleted on
2026-09-10 and are at `git show 4f95444b:docs/handoffs/<name>`.

### Reading a build's own output (row AT, `2026-09-09-at-flakes-nobody-sees.md`)

**`npm run build` ran a STALE test-file list twice in a row.** Two consecutive builds reported
`node --test over 109 file(s)` while a newly created `scripts/*.test.mjs` existed on disk and
`node scripts/gates.mjs list --gate build` reported 110 including it, at the same moment. A third
build picked it up with no intervening change. There is no cache in `gates.mjs` - it is a plain
`globSync` - so this looks like a Windows directory-cache artifact. **Confirm a new test file ran by
NAME, not by the count.**

**`grep -c` on a build log answers 0 and means nothing.** These logs contain bytes that make grep
treat the file as binary, so a plain `grep -c` prints "Binary file matches" and answers 0, which
reads exactly like "your test did not run". Use `grep -a`.

**Git Bash mangles a POSIX path in an env value.** `GITHUB_WORKSPACE=/home/runner/... node ...`
arrives inside node as `C:/Program Files/Git/home/runner/...`. `MSYS_NO_PATHCONV=1
MSYS2_ENV_CONV_EXCL='*'` fixes it. Anything that reproduces a Linux runner's environment locally
hits this.

### Command shapes a worktree-isolated session cannot run (rows AC and AW)

All of these were refused and cost retries. They are refused by the harness guard, not by the shell,
and the refusal messages do not enumerate the shapes:

- `$(...)` command substitution near anything git-shaped, and any command combining `$(git ...)`
  with a pipe;
- `$((...))` arithmetic;
- a heredoc appended to a file with `>>` in a compound command, and a heredoc whose *content*
  contains the word `git`;
- `codex exec --skip-git-repo-check`, because the flag contains the word git.

Use plain separate commands, and `Edit` rather than `cat >>` to append to a tracked file. The
neighbouring case - the `/check` stamp, which is reachable only as a `Write` to the scratchpad
followed by a bare `cp` - is `check-verdict-stamp-unwritable-from-isolated-worktree.md`.

**`tasklist /FI` is rewritten by MSYS** into `C:/Program Files/Git/FI` and fails, exactly like the
`taskkill /PID` case. Do process work through the PowerShell tool, not through Bash. The mechanism is
written out at `scripts/codex-rescue.mjs:151` and `:162`; what is not written down is that it bites
anyone reading the process table by hand.

**The commit-message hook blocks any message mentioning Codex** unless `ALLOW_AI_MENTION=1` appears
in the command itself (`scripts/hooks/guard-command.mjs`). Correct, and not obvious from the error
the first time.

## What it would take

Read them, decide which belong in `docs/MISTAKE_TRIGGERS.md` as triggers - the build-overlap one and
the guard shapes both have a tool shape and could fire at the tool call rather than waiting to be
read, which is the standing ask in `docs/backlog/mistake-trigger-hooks.md` - and delete this file.
The rest are plain reference and want no mechanism.

## Evidence

The first three were measured on `claude/two-row-set-recipe-fcbe5e`, landed as `667ac776` (PR #122).
Repo-wide greps for each of the three during the 2026-09-09 drain returned nothing but the handoff
itself; the same greps on 2026-09-10 returned nothing but this file. The 2026-09-09 six were greped
the same way during that drain: `MSYS_NO_PATHCONV` and `grep -a` appeared only in row AT's handoff,
and the guard shapes appeared nowhere at all.
