# `e2e-runs.mjs --orphans` cannot see a stray dev server, and the guard hook sends you to it

**Filed:** 2026-09-10. **Source:** measured twice while driving the real-CasparCG walk
(`docs/handoffs/2026-09-10-bh-caspar-real-server.md`).

## Why

Two repo mechanisms contradict each other, and the one that is wrong is the one you are told to
trust. A killed Playwright run leaves its `vite --port <livePort()> --strictPort` child alive
holding the port. The next Playwright invocation is refused by `scripts/hooks/guard-command.mjs`,
whose message names the remedy: "`node scripts/e2e-runs.mjs --orphans` says whether that is the
case, and `--kill-orphans` closes it". Both answer that there is nothing there, because they look
for **Playwright** processes and the survivor is **vite**.

So the session is stuck in a loop that reads as a broken guard: the hook says a server is holding
the port, the cleanup says no server is holding the port. The only way out is to go around both
and find the pid by hand. That is a five-minute detour for anyone who hits it, and it lands on the
sessions that had a browser run interrupted - which is the sessions already having a bad time.

## What it would take

Small. `--orphans` learns about the two ports this checkout owns (`devPort()` and `livePort()` in
`scripts/dev-port.mjs`), reports a listener on either that no live run owns, and closes it under
`--kill-orphans`.

The one care needed is the claim check: only take a process whose command line names **this
checkout's path and this checkout's port**. Servers in other worktrees live on their own ports and
the guard hook already calls them harmless; a cleanup that killed a neighbour's dev server would be
a worse bug than the one being fixed. Leave the hook's message alone - the fix is to make it true.

## Evidence

2026-09-10, worktree `.claude\worktrees\agent-aa65267b7ed99afcc`, live e2e port 5221. After a
Playwright run was stopped mid-test:

```
$ node scripts/e2e-runs.mjs --orphans
No orphaned Playwright processes - nothing is holding RAM or a port between runs.
$ node scripts/e2e-runs.mjs --kill-orphans
Nothing to clean up.
```

while the guard hook refused every `npx playwright test` with "something is already listening on
port 5221 - the live e2e port of the checkout this command runs in". `Get-NetTCPConnection
-LocalPort 5221 -State Listen` named the holder immediately:

```
node.exe  "…\agent-aa65267b7ed99afcc\node_modules\.bin\..\vite\bin\vite.js" --port 5221 --strictPort
```

It happened twice in the same session, so it is not a one-off race.
