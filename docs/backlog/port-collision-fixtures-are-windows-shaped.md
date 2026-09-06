---
v: 2
source: derived
kind: finding
raised: 2026-09-06
state: unstarted
found: "`scripts/port-registry.test.mjs` proves its collision regression with two REAL Windows
  worktree paths, and `preferredSlot` hashes them through `resolve()`. Off Windows those strings
  are relative, so the hash is taken over CWD + the fixture and the two paths collide only by
  luck of the runner's working directory."
---
# The port-registry collision fixtures only mean what they say on Windows

## Why

The fixture is the good kind: `COLLIDING_A` and `COLLIDING_B` are the two worktree paths that
actually collided on the owner's laptop, kept so a future change to the hash cannot quietly
un-cover the case. The assertion that guards it reads
`preferredPort(COLLIDING_A) === preferredPort(COLLIDING_B)`, with the message
`fixture is no longer a collision`.

`preferredSlot` hashes `normalizeRoot(root)`, and `normalizeRoot` runs `resolve()`. On Windows
`C:/claude/...` is already absolute, so the hash is over the real path and the test means what it
says. On Linux the same string is RELATIVE: the hash is taken over
`/home/runner/work/NoaCG-Studio/NoaCG-Studio/C:/claude/...`, a different string, and whether those
two still land in the same slot is an accident of the runner's working directory.

It passes today. It passed on the first GitHub run of this file, 2026-09-06. That is the problem -
a green that does not mean the thing the message claims, and a red one day that sends the reader
looking for a broken hash rather than a moved checkout.

## What it would take

Decide which of these the test is for, because they are different tests:

1. **The hash is stable and these two real paths collide.** Then the fixtures must not go through
   `resolve()` - hash the literal strings, and the case is platform-independent because it is
   about the STRINGS, not about any filesystem.
2. **Allocation behaves correctly when two roots collide.** Then the fixtures do not need to be
   real paths at all - any two strings that hash alike on the current platform will do, and they
   can be derived at test time.

(1) is what the comment says the case is for, and it is the cheaper change: hashing a literal
needs no filesystem at all.

## Evidence

Found by giving `npm run test:ports` its first CI home (`check:gate-coverage`, 2026-09-06). The
run failed on a sibling assertion in the same file for the same root cause - a ticket compared
against the raw Windows fixture rather than the normalized root - which is fixed. This one was
green in the same run, and is filed rather than fixed because it is a question about what the
test means, not a defect with one right answer.
