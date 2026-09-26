// Each checkout of this repository keeps its own `noacg login`.
//
// The CLI keeps its scoped agent key in one per-user file, so on a machine running several
// sessions at once a row that ran `noacg logout` (or logged in again) silently ended or replaced
// the key every sibling row and the owner's own terminal were using. The CLI reads
// NOACG_CREDENTIALS_DIR for where to keep the key (cli/src/config.ts credentialsDir); this sets it,
// for every Bash command a Claude Code session runs, to `.noacg/` at the root of the checkout the
// command runs in (gitignored). A value already in the environment wins; outside a Claude Code
// session nothing changes.
//
// HOW. A SessionStart hook may write shell lines to $CLAUDE_ENV_FILE, and Claude Code sources them
// before each Bash command. The line resolves the checkout AT COMMAND TIME rather than baking in
// the session's own: a wave row is a subagent that shares its launcher's session environment but
// runs in a worktree of its own, and a path fixed at session start would put every row back in
// one store. The Bash tool only - the PowerShell tool does not read the file, so an agent that
// logs in there still uses the per-user store (docs/AGENT_CLI.md).

import { writeFileSync } from 'node:fs';

export const CLI_CREDENTIALS_ENV = [
  '# noacg CLI: this checkout keeps its own login (scripts/hooks/cli-credentials-env.mjs)',
  'if [ -z "${NOACG_CREDENTIALS_DIR:-}" ] && __noacg_root="$(git rev-parse --show-toplevel 2>/dev/null)" && [ -n "$__noacg_root" ]; then export NOACG_CREDENTIALS_DIR="$__noacg_root/.noacg"; fi; unset __noacg_root',
  '',
].join('\n');

/** Write the line into the session's env file. Returns whether there was a file to write. */
export function writeCliCredentialsEnv(envFile = process.env.CLAUDE_ENV_FILE) {
  if (!envFile) return false;
  writeFileSync(envFile, CLI_CREDENTIALS_ENV);
  return true;
}
