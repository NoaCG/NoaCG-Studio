# 2026-09-11 - the transcript liveness signal is blind during a pending tool call

Branch `claude/night-transcript-liveness`, one follow-up to
`docs/handoffs/2026-09-11-ci-before-the-break.md` (pull request 251, landed as `dbcc88b9`). The
revised session prompt added item 6e after 251 was queued, and a queued branch is frozen, so it
lands on its own.

## What changed

`.agent-workflows/orchestrator/night.md`, where the night loop names its three liveness signals,
now says that the transcript signal cannot see a session that is inside one long tool call. A
silent transcript whose last tool call has no result is a call still running, not a dead session.
On 2026-09-11 the loop called row CA dead after two quiet hours while CA sat inside a single
browser call, and CA came back hours later and landed the deck as pull request 250.

## What is left, and why

The sentence tells a reader what to check; nothing checks it mechanically yet.
`scripts/session-liveness.mjs` still decides from the newest transcript mtime against an idle
window whose default is 120 minutes, which is exactly the two quiet hours that marked CA dead. The
code that would fix it already exists: `waitingOn()` in `scripts/blocked-sessions.mjs` finds every
tool call with no result yet, batched calls included. Treating a transcript that `waitingOn()`
reports a pending call for as live, whatever its age, is the mechanism, and it belongs to whoever
next touches the liveness reading. night.md is not an every-plan module, so this sentence spends
no common-path budget; `node scripts/check-shared-instructions.mjs` still reports 640/640.

Nothing here needs the owner.
