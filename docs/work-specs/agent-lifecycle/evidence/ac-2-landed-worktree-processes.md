# AC-2: removing a landed worktree closes everything running from it

Recorded by the implementing row (branch `claude/e-lifecycle-cleanup`), 2026-10-09, on Windows 10.

## What was run

- `node --test scripts/worktree-unattended.test.mjs`, test "AC-2: landing a worktree closes the dev
  server, the shell loop and the test browser running from it". It builds a real repository with a
  bare origin, makes an `agent-*` worktree, lands its branch the way the merge queue does, and
  marks it quiet for 30 hours. It then starts, with the worktree as their working directory and
  their parent gone (as an agent leaves them):
  - a dev server (`node`, an HTTP server listening),
  - a shell loop (`C:\Program Files\Git\bin\bash.exe -c "while true; do sleep 1; done"`),
  - a test browser (Playwright's real `chrome-headless-shell.exe --headless`, with its helper
    processes).
  It runs the unattended sweep with the real process listing and closing.
- `node --test scripts/agent-processes.test.mjs` - the judgement on a fake process table shaped
  like this machine's: the agent's loop, dev server and test browser close, roots first; the
  session itself, its MCP server and the browser that server drives, the job queue runner, the
  owner's terminal and OBS are kept, and anything kept leaves the worktree (and its processes) in
  place.
- Mutation check: with the closing step stubbed out, the same integration test fails with
  `in use by a running process - left in place (... Permission denied)` - the locked folder this
  criterion removes.

## Observed

The sweep removed the worktree, `held` and `errors` were empty (no locked folder), it reported at
least three closed processes in `last.json`, and afterwards no process whose command line carries
the fixture's marker was running.

## Limitations

- Off Windows nothing is listed and the removal behaves as before (the unattended sweep only runs
  on Windows).
- A process whose working directory cannot be read (elevated, another user, 32-bit) is attributed
  by its command line or its parent; one attributed nowhere is not closed, and Windows refusing the
  rename still keeps the worktree.
- Dev servers started through the desktop app's preview tools run under the app itself and are
  kept as the owner's application.
