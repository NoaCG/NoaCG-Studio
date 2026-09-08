# Three machine traps that have cost real time and live only in a handoff

**Filed:** 2026-09-09, out of the drained handoff for `667ac776` (PR #122), whose author titled the
section holding them "Traps that exist in no repo file". He was right, and they are copied here
verbatim so the handoff could go.

## Why

`docs/MISTAKE_TRIGGERS.md` exists because a lesson nobody can find is a lesson nobody has. These
three cost a session each and are all still true of this laptop. They are recorded here rather than
straight into that file only because the row that traced them owns `docs/handoffs/` and
`docs/backlog/` and nothing else; moving them is a five-minute edit for whoever picks this up.

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

## What it would take

Read the three, decide which belong in `docs/MISTAKE_TRIGGERS.md` as triggers - the build-overlap
one has a tool shape and could fire at the tool call rather than waiting to be read, which is the
standing ask in `docs/backlog/mistake-trigger-hooks.md` - and delete this file. The first two are
plain reference and want no mechanism.

## Evidence

Measured on `claude/two-row-set-recipe-fcbe5e`, landed as `667ac776` (PR #122). Repo-wide greps for
each of the three during the 2026-09-09 drain returned nothing but the handoff itself.
