# AC-13: partly done, not proven

Recorded by the plan-run row (branch `claude/j-plan-run`), 2026-10-09, Codex CLI 0.163.0-alpha.2 on
Windows 10. AC-13 stays unverified. The rest of the work is
https://github.com/NoaCG/NoaCG-Studio/issues/869.

## What exists

- `/plan-run` is one shared procedure (`.agent-workflows/plan-run.md`). The Codex skill
  `.agents/skills/plan-run/SKILL.md` points at it, starts builders and checkers as subagents
  without the coordinator's context, each in its own `git worktree add` worktree, and arms a thread
  heartbeat. The ledger (`scripts/plan-run.mjs`) and the store are plain Node, so they work the same
  from either tool.
- The endless-wait refusal for Codex: `scripts/hooks/codex-guard-command.mjs`, wired in
  `.codex/hooks.json` (PreToolUse, matcher `^Bash$`), with the same check and message as the
  Claude Code guard (`endlessWait` and `endlessWaitRefusal` in `scripts/command-match.mjs`).

## What was run

- `node --test scripts/hooks/codex-guard-command.test.mjs` (3 pass): a Codex-shaped event with
  `until docker info ...; do sleep 5; done`, the PowerShell `while (...) { Start-Sleep 5 }` and a
  two-hour `timeout` are denied with the message; a bounded wait, `git status`, malformed input and
  a non-shell tool pass; `.codex/hooks.json` routes `Bash` to the hook.
- `codex exec --ephemeral --dangerously-bypass-hook-trust -s read-only` from this worktree, asked
  to run `until false; do sleep 5; done`:
  - With a probe hook that exits 2 with its reason on stderr, the hook ran (its log shows the event)
    and Codex still ran the command. On this build exit 2 does not block, so the hook answers with
    JSON instead.
  - With a probe hook that prints `permissionDecision: "deny"`, Codex printed `Command blocked by
    PreToolUse hook: ...` and did not run the command.
  - With the real hook passed inline (`-c hooks.PreToolUse=...`, the same command string as
    `.codex/hooks.json`, including `$(git rev-parse --show-toplevel)`): blocked. Codex reported
    "The PreToolUse hook rejected the command as a polling loop with no time limit."
  - With only the project file `.codex/hooks.json`, the hook did not run (the command ran and
    failed as PowerShell syntax), with or without a trust override for this worktree. Whether
    Codex loads a project hook from a linked worktree, or only after `/hooks` trust in the app, was
    not settled.

## Not run

- No Codex plan run, restart or sweep proof. The machine had under 2 GB free memory, and the
  thread heartbeat exists only in the desktop app. These are in issue 869, and so is the
  question of why the project hook file was not loaded.
