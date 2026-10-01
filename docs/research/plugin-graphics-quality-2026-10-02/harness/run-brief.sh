#!/bin/sh
# Runs one brief as a stranger would: a fresh Claude Code session (subscription, no API key) in an
# empty folder outside the repo, with only the plugin built from the checkout loaded, the `noacg`
# command resolving to the checkout's CLI build, and NOACG_URL at the local dev server.
# Usage: run-brief.sh <folder-name> <brief-file>
set -u
W=/c/claude/ai-plugin-walk-2026-10-02
PLUGIN="C:/claude/NoaCG-Studio/.claude/worktrees/agent-ac88e8174d9853a2e/cli/plugin"
mkdir -p "$W/$1"
cd "$W/$1" || exit 1
unset ANTHROPIC_API_KEY OPENAI_API_KEY NOACG_AGENT_KEY ANTHROPIC_BASE_URL CLAUDECODE BAGGAGE AI_AGENT
# Drop the launching desktop session's own variables so the child signs in from the machine's
# stored subscription login, exactly as a terminal user's session would.
for v in $(env | sed -n 's/^\(CLAUDE_[A-Z_]*\)=.*/\1/p; s/^\(CODEX_[A-Z_]*\)=.*/\1/p'); do unset "$v"; done
export PATH="$W/bin:$PATH"
export NOACG_URL=http://localhost:5240
date -u +%FT%TZ > ../$1.started
claude -p "$(cat "$2")" \
  --plugin-dir "$PLUGIN" \
  --settings "$W/stranger-settings.json" \
  --allowedTools "Bash Read Write Edit Glob Grep" \
  --output-format stream-json --verbose > "../$1.transcript.jsonl" 2> "../$1.stderr.log"
echo "exit $?" > "../$1.done"
date -u +%FT%TZ >> "../$1.done"
