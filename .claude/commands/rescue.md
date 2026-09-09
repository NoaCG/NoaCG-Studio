---
description: Delegate to Codex safely - launches the job detached from this session, then polls it, because a job that dies otherwise reports as running forever
argument-hint: '[--write] [--model <model|spark>] [--effort <none|minimal|low|medium|high|xhigh>] [--resume|--fresh] <what Codex should investigate, solve, or continue>'
allowed-tools: Bash, PowerShell
---

Raw user request:
$ARGUMENTS

## Why this command exists, not `/codex:rescue` directly

`/codex:rescue` forwards to a subagent, and the Codex launcher then runs inside that subagent's
Bash call. `detached: true` does not save it: on Windows that breaks the console, not the parent
link `taskkill /T` walks, so for the ~2 s the launcher needs to reach the broker handshake the
Codex worker is a reachable descendant of the subagent. The first delegation trial died in exactly
that window, and `/codex:status` went on reporting it as `running` for hours because nothing
checked whether the pid still existed
(all three defects are written out in `scripts/codex-rescue.mjs`'s header, and were measured again
in this repo: the plugin's spawn survives 2 heartbeats after its caller is killed, the relayed one
runs on indefinitely).

`scripts/codex-rescue.mjs` is the fix and this command is its adapter. The plugin's companion
script is still the engine - the wrapper only launches it detached through a relay, reconciles pid
liveness against job status, and cancels with argv that no shell can rewrite.

## Procedure

1. **Launch.** One Bash call, from this session - never through a subagent, whose lifetime is the
   whole problem:

   `node scripts/codex-rescue.mjs launch "<the task>"`

   Pass the request through as-is, minus routing flags. `--model`, `--effort`, `--resume` and
   `--fresh` forward to Codex. **A launch that names no `--effort` runs at the wrapper's
   `DEFAULT_EFFORT`, which is `medium`** under the owner's 2026-09-09 ruling and is reviewed on
   2026-09-16; read the constant in `scripts/codex-rescue.mjs`, because this line said `high` for
   a week after the code stopped agreeing and sent one measurement down the wrong path. Pass a
   lower effort deliberately, for mechanical retrieval only. `--model` now has something to point
   at: the CLI's own default is `gpt-6-astra`, and `gpt-5.6-sol` still works when named
   (`scripts/harness-capabilities.json`, `codex-one-model-on-the-subscription`).
   **The run is read-only unless you pass `--write`** - the delegate
   edits files only when the request actually asks for edits. It prints JSON with a `jobId`. If no
   job id comes back, stop and report what it said - do not retry silently, and do not launch a
   second job.

2. **Tell the user you are polling**, once, early. Then poll:

   `node scripts/codex-rescue.mjs poll <jobId> --timeout-seconds 240`

   It returns as soon as the job finishes, is found dead, or stalls, so it does not burn a tool
   call per sample. Exit codes: `0` completed, `1` failed/cancelled/dead, `2` stalled (no log line
   for 5 minutes), `3` still running - poll again. Keep polling on `3`.

3. **A dead or stalled job is a result, not a reason to wait.** On exit `1` the wrapper has
   already recorded why - quote its line. On exit `2` say the job appears hung and quote the last
   log line. Never launch a duplicate as a workaround.

4. **Report the result in full.** `node scripts/codex-rescue.mjs result <jobId>` - present the
   verdict, summary, findings and file paths at full fidelity, not paraphrased.

5. **Verify independently.** The delegate reports on the sites it was given, so checking that it
   did what it was told cannot catch a wrong site list - re-derive the receipt from scratch
   instead. That is the finding the first trial nearly shipped a bug over.

## Also available

- `node scripts/codex-rescue.mjs status --all` - every job in this workspace, reconciled.
- `node scripts/codex-rescue.mjs cancel <jobId>` - kills the worker and records it. Refuses if the
  pid now belongs to a different process.
- `node scripts/codex-rescue.mjs reap --all-workspaces` - clears jobs left marked running by a
  session that died. Run it if `/codex:status` shows something implausibly long-lived.

## Rules

- Never route the launch through a subagent, and never fall back to the plugin's foreground path:
  those are the two ways this has already failed.
- The launch returning is proof the job was queued, nothing more. Steps 2-4 confirm it.
- Do not send Codex a task whose specification is the whole job. A line-addressed edit costs more
  to specify than to do; delegate work where the spec is short and the doing is long.
