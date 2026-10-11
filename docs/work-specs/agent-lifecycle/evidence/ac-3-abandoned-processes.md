# AC-3: abandoned processes close after an hour, and exempt ones do not

Recorded by the implementing row (branch `claude/e-lifecycle-cleanup`), 2026-10-09, on Windows 10.

## What was run

- `node --test scripts/worktree-unattended.test.mjs`, test "AC-3: an abandoned shell loop closes
  after a quiet hour, and an exempt process of the same age stays". Real processes in a real
  worktree, their parent gone: a loop, and a stand-in for the job queue runner (its command line
  carries `scripts/jobs.mjs --runner`). First the step runs at the real time: nothing closes. Then
  the unattended sweep runs with the clock moved forward two hours: the loop is closed, the runner
  is still running, the worktree stays, and `last.json` names exactly the loop.
- `node --test scripts/agent-processes.test.mjs`, the AC-3 tests on a fake process table: with the
  clock two hours on and the worktree quiet, the 14-hour-style `bash -c "until docker info; ..."`
  loop (and the young `sleep` inside it), the dev server, the test browser and an orphaned server
  close; the merge/job queue runner, the session's MCP server, the session itself and an owner
  application (OBS) of the same age stay. A worktree that is not quiet, a tree younger than an hour,
  a quiet check that throws, and a session still working from another checkout keep everything. A
  Codex `bash -lc` loop is judged as a command and closes the same way.
- Quiet is an hour without a Claude Code transcript, a Codex session log or a git HEAD move in the
  checkout; each of those that cannot be read answers "not quiet" (tested).

## Observed

All pass (`npm run gates -- run --changed origin/main`: 133 pass, 0 fail).

## Limitations

- The live run used Node stand-ins for the loop and the runner; a real Git Bash loop and real
  Chrome were closed in the AC-2 run.
- The exemption list (`EXEMPT` in `scripts/agent-processes.mjs`) is matched by executable name and
  command line. An owner application not on the list is still kept unless an agent's shell started
  it in an agent worktree.
- Codex coverage rests on reading Codex's process tree and its session logs on this machine; AC-13
  checks it end to end from Codex.
