# AC-13: not proven in this record

Recorded by the plan-run row (branch `claude/j-plan-run`), 2026-10-09. AC-13 stays unverified,
and its remaining work is https://github.com/NoaCG/NoaCG-Studio/issues/869.

## What exists

- `/plan-run` is one shared procedure (`.agent-workflows/plan-run.md`). The Codex skill
  `.agents/skills/plan-run/SKILL.md` points at it, starts builders and checkers as subagents
  without the coordinator's context, each in its own `git worktree add` worktree, and arms a thread
  heartbeat. The ledger (`scripts/plan-run.mjs`) and the store are plain Node, so they work the same
  from either tool.

## What was found, not run

- Codex CLI 0.163.0-alpha.2 lists `hooks` as stable. Project PreToolUse hooks in `.codex/hooks.json`
  get `tool_name: "Bash"` and `tool_input.command`, and exit 2 blocks the call, as in Claude Code.
  So Codex can run the endless-wait check. Each hook needs trusting once (`/hooks`), and
  `codex exec --dangerously-bypass-hook-trust` covers a one-off proof. The check (`endlessWait`)
  arrives with #866, which was still in the landing queue, so no hook was added here.
- `spawn_agent` has `fork_context`, which defaults to not forking.
- The thread heartbeat (`automation_update`) is in the desktop app only, so `codex exec` cannot
  prove that wake-up.

## Not run

- No `codex exec` plan run, restart or sweep proof. The machine had under 1 GB free memory, and
  the hook depends on #866. Both are in issue 869.
