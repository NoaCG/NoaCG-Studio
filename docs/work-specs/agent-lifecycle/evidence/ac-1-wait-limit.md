# AC-1: a wait with no limit is refused, and one that runs out wakes its agent

Recorded by the implementing row (branch `claude/e-lifecycle-cleanup`), 2026-10-09, on Windows 10.

## What was run

- `node --test scripts/hooks/guard-command.test.mjs` - the real `guard-command.mjs` hook, fed real
  PreToolUse events:
  - `until docker info >/dev/null 2>&1; do sleep 5; done`, as a foreground and as a
    `run_in_background` Bash command, and the PowerShell `while (-not (Test-Path ready)) { Start-Sleep 5 }`:
    each refused with exit 2, and the message says "no time limit" and shows
    `timeout 600 bash -c '...'` and the PowerShell deadline form.
  - `timeout 7200 bash -c 'until docker info; do sleep 5; done'`: refused (one wait is at most an hour).
  - `timeout 2 bash -c 'until noacg-not-a-command >/dev/null 2>&1; do sleep 1; done'` (the same loop,
    the command never succeeding, as with Docker stopped): allowed by the hook, then run for real
    through Git Bash. It exited 124 after about 2 seconds. That exit is what the session is told.
- `node --test scripts/command-match.test.mjs` - `endlessWait` on the refused shapes above plus
  `bash -c "until ..."`, `for ((;;))`, a timeout on a different command, and a loop that only echoes
  the word "seconds"; and on the shapes that must pass: bounded by `timeout`, by a counter (`i++`,
  `n=$((n-1))`, `i=$((i+5))`), by a PowerShell deadline, `while read` loops, a loop inside a
  commit message or a grep pattern, a loop written into a file through a here-document.
- Mutation check: without the guard rule the hook test fails (the endless wait is allowed).

## Observed

All of the above pass (`npm run gates -- run --changed origin/main`: 133 pass, 0 fail).

## Limitations

- The guard is a Claude Code PreToolUse hook. Whether Codex can run the same check is AC-13's
  question; `endlessWait` in `scripts/command-match.mjs` is a pure function any harness can call.
- It reads command text. A loop hidden in a script file the command runs is not seen.
