---
v: 2
kind: handoff
date: 2026-09-09
branch: claude/ab-reap-codex-delegation-tree
row: AB
---
# AB - a delegation's process tree dies with the delegation

**Done and queued.** A Codex delegation now writes down the processes it starts, with the time
each one started, and closes them when the delegation is over - on completion, on failure, on
cancellation, on a launch that timed out, and at the start of the next launch, which is what
covers an orchestrator that was killed before it could clean up after itself. The owner's own
desktop Codex application is out of reach by construction and by an asserted guard, and every
process the sweep will not close is named with the reason it stays.

## The root cause, which is not what it looks like

A finished delegation left its whole family resident: a broker, a `codex.js app-server`, a
`codex.exe` and their MCP servers, about 450 MB per delegation. Nothing collected them because
nothing could know what to collect, and three separate facts have to line up before that makes
sense:

1. **The job record erases the evidence on success.** The plugin sets a job's `pid` to `null` the
   moment it completes. Read live: the two leaked trees' jobs said `completed`, `pid: null`, with
   their families still running eight and thirteen hours later.
2. **The family's parent links are cut within seconds.** The broker starts its app-server through
   a shell (`shell: process.env.SHELL`, Git Bash here), and that shell exits. Measured on both
   leaked trees: the broker's own parent was gone, and so were the parents of the app-server, of
   the security MCP server and of both halves of the `npx @playwright/mcp` pair. Walking down from
   what we launched finds a fraction of the family.
3. **Inference is not available, and this is the part that decides the design.** The owner's
   DESKTOP Codex app runs an identical-looking set of MCP servers with identically dead parents -
   measured, six of its eight node processes were severed the same way. Anything that killed "what
   looks orphaned" would close the application he works in.

So ownership is RECORDED, never inferred. The launch writes each pid down with its start time
while the links are still there, and the record outlives the walk that produced it.

## What changed

- **`scripts/codex-rescue.mjs:425` `recordOwnership`** writes `owned-tree.json` beside the
  plugin's own `state.json`, version 1: the broker's `(pid, createdMs)`, the endpoint, the jobs it
  serves, and every process found below what is already recorded. It grows from EVERY recorded
  root, not just the broker - the broker is the first thing to exit, and a record that could only
  grow from it would lose the expensive half the moment it went.
- **`scripts/codex-rescue.mjs:492` `recordLaunchedTree`** waits up to ten seconds for the broker
  the job will be served by, because the launcher answers while the job is still `queued` and the
  broker does not exist yet. It records twice, two seconds apart: the first pass catches the
  broker, the second the MCP servers it starts. `ownershipRecorder` (`:547`) keeps the record
  current over every poll, on a backoff and then a one-minute heartbeat, because a second
  delegation joins the SAME family minutes later.
- **`scripts/e2e-runs.mjs:566` `orphanedCodexTrees`** is the named detector, beside
  `orphanedDevServers`. A family may be closed only when every delegation in its workspace has
  reached an outcome AND the machine still agrees each recorded pid is the same process - same
  pid, same start time. Anything else is kept and named. `allProcesses` (`:132`) now carries
  `createdMs`, which is the other half of a process's identity.
- **`scripts/e2e-runs.mjs:514` `underDesktopCodex`** is the hard guard: `ChatGPT.exe`, and the
  `codex.exe` the desktop app runs out of `AppData\Local\OpenAI\Codex\bin`, matched by PATH so it
  cannot be confused with the plugin's `codex.exe` under `AppData\Roaming\npm`. It is asserted on
  every candidate, recorded or reached as a descendant. `runtimes\cua_node` is deliberately NOT in
  the pattern: that runtime is shared, and the plugin's own delegations run MCP servers out of it.
- **`scripts/codex-rescue.mjs:723` `reapTrees`** proves the tree from the record, writes the
  expanded family back into the record, asks every broker to shut down over its own endpoint
  (concurrently - three leaked families sequentially would put half a minute in front of a
  launch), waits `GRACE_MS` (`:353`, five seconds), then RE-PROVES from a freshly read process
  table and closes what is still recognised. `forgetOwnership` (`:521`) then drops a record the
  machine no longer recognises.
- **Wired into all four exits**: `poll` on a terminal status (`:975`), `cancel` (`:1048`), the
  launch timeout via `abandonLaunch` (`:536`, called at `:908`), and `launch`'s own opening sweep
  (`:859`).
- **Handles**: the relay's output file descriptor was already closed at the spawn; the shutdown
  socket is destroyed on every path and its timeout is unref'd, so no command holds the process
  open - every one of them exits within seconds, `reap` in 1.5 s. The launch's scratch directory
  (the prompt file) is deliberately NOT deleted: the job can still be `queued` when the launcher
  returns, and the companion reads that file when the job actually starts.
- **`scripts/ram-reclaim.mjs:44`** adds `orphaned-codex-delegation-tree` to `RECLAIMABLE`, and
  **`scripts/jobs.mjs:1169`** feeds the same proved pids to the starved-queue reclaimer through
  the classifier that already fails closed.

## Measured, on this machine

| | processes | resident |
|---|---|---|
| baseline, no delegation | 9 | 540 MB |
| one delegation running | 30 | 1239 MB |
| after it completed, nobody polling (the leak) | 30 | 1239 MB |
| after `poll` reached the outcome | 9 | 540 MB |

The reap takes 1.5 s and, in every live run, closed ZERO processes by force: asking the broker to
shut down collapsed the whole family, which is why the graceful step leads. Free memory went
4832 MB -> 5156 MB on the first collection.

The evening's original find was 47 node processes holding 2.3 GB, of which three abandoned
delegation trees. Two of those were still there when this row started and were read in detail;
something on the machine collected them around 22:53, so the verification below reproduces the
leak deliberately rather than relying on them.

## What the tests cover

Fixtures are real: every pid and command line in them was captured with `Get-CimInstance
Win32_Process` from the leaked families and from the desktop app running beside them.

- `scripts/e2e-runs.test.mjs` - a finished delegation gives up its recorded tree and everything
  below it, youngest first; one unfinished delegation keeps the whole family and says so per pid;
  a recorded pid whose start time no longer matches is kept, never killed; **a record that names
  the desktop Codex app is refused whatever the delegation says**, and the app is recognised from
  any depth while the plugin's `codex.exe` is not; a pid reused as a "parent" does not attach one
  family to another in either direction; no record means no candidate, and no process table means
  no candidate.
- `scripts/codex-rescue.test.mjs` - the record only ever shrinks; an entry with no start time is
  not an identity; a record whose version this code does not know is unusable rather than
  half-usable; the record keeps growing from what is left when the broker has gone; a record is
  finished with when the machine stops recognising it; the broker's workspace parses out of an
  unquoted `--cwd` with spaces in it.
- **The unexpected-termination case was verified live, not just in a test**: a delegation was
  launched, allowed to complete, and deliberately never polled - the family stayed (30 processes,
  1239 MB, the leak reproduced) - and the NEXT launch's opening sweep collected it before starting
  its own. Cancellation was verified the same way, mid-flight.

## The pid-reuse hazard, observed rather than argued

Twenty-two seconds after a cancelled delegation, one recorded MCP server's pid had been handed to
`svchost.exe`. The detector refused it - `kept pid 32196 - pid was reused - it is now svchost.exe,
started later than the one we launched` - which is exactly what the recorded start time is for.
Without it, the reap would have issued `taskkill /T /F` against a Windows service host. It also
forced a fix: a record is finished with when the machine stops RECOGNISING it, not when its pids
stop responding, or that record would have looked half-alive for as long as that service ran.

## Windows Job Objects: investigated, and deliberately not built

Node exposes no Job Object API - not in `child_process`, not through `detached` or `windowsHide` -
so kill-on-close would need a native helper or a PowerShell P/Invoke. **It should not be built
anyway, and the reason is not the missing binding.** A job object with
`JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE` kills the tree when the last HANDLE closes, so the handle
holder would have to be the launching session - and this wrapper detaches its launch on purpose
(defect 1 in `codex-rescue.mjs`) precisely so a delegation SURVIVES the session that asked for it.
Kill-on-close would end every delegation the moment its session closed, which is the opposite of
what the channel is for. Two further problems make it moot: the processes would have to be
assigned at creation, and we do not create them - the plugin's companion does, through a shell.
The recorded-identity sweep is the fallback named in the row, and it is sufficient.

## Everything still alive at the end, and why it stays

- **The owner's desktop Codex app: 9 `ChatGPT.exe`, `codex.exe` pid 20136 and its six MCP
  servers.** Never a candidate - nothing recorded them, and the guard refuses them by path even if
  something did. All nine `ChatGPT.exe` processes still carry their original 21:14 start times.
- **Two other sessions' brokers and families (started 23:22:02 and 23:23:47).** They were launched
  by the code on `main`, so no ownership record exists for them and the detector fails closed:
  no record, no candidate. Their next launch, once this lands, records and collects them. Nothing
  in this change reaches back to a family started before it.
- **Other sessions' tooling** - `wave-watch.mjs`, `ci-watch.mjs`, an `npm ci`, a `prerender.mjs`,
  a `dist/main.js`. Not delegation processes at all; nothing here looks at them.

## Check

- `review: delegated` - the code-review skill returned findings and named this branch, base
  `a2ab4097`, and exactly the six files `git diff --name-only` reports, with a clean working tree;
  scope checked and matched. Ten findings, all confirmed against the code and fixed in `00599ebe`:
  the record-only-grows-from-the-broker hole (the one that would have made a leak permanent), the
  queue runner writing to the plugin's `state.json` from its poll loop and dying on a state
  directory that moved, sequential broker shutdowns, a twenty-second launch stall, a snapshot
  schedule that stopped where its comment said it kept going, a process table read on every tick,
  a kill that logged as a success when it failed, a doubled kept line, a redundant table read, and
  an abandoned launch that could be un-abandoned by a concurrent poll.
- `simplify: inline` - the skill returned fan-out instructions, so the leg ran here: an
  `indexByPid` helper for the four hand-rolled pid maps, one `writeOwnership` for the three
  hand-rolled record writes, and two clearer control-flow forms.
- `verify: npm run build` green (exit 0, read from the build's own exit code), 72 unit tests
  across the three touched test files, plus the live end-to-end runs above. CI green on
  `b8b1e1f5` with every job run - Build, Factory gates, all nine E2E shards, CI gate.
- `taste: not applicable` - nothing here can move what a graphic looks like.

## What is left

Nothing blocking. Two things a later row could take:

- The session-start hook reports orphaned Playwright workers and browser shells to a human; it
  does not yet report orphaned delegation families. `orphanProcesses` returns them now, so it is a
  display change.
- `docs/backlog/ram-reclaimer.md` still describes the reclaimer as covering half the problem. The
  delegation half is now covered; the watchdogs it names are still a manual job.
