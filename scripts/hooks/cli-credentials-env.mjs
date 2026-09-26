// Each checkout of this repository keeps its own `noacg login` (why, and what is not covered:
// docs/AGENT_CLI.md, after the environment list).
//
// A SessionStart hook may write shell lines to $CLAUDE_ENV_FILE, and Claude Code sources them
// before each Bash command. These set NOACG_CREDENTIALS_DIR (cli/src/config.ts credentialsDir) to
// `.noacg/` at the root of the checkout the command starts in, resolved per command because a wave
// row is a subagent sharing its launcher's session environment from a worktree of its own. A value
// already set wins. The walk to the nearest `.git` is pure shell, because a `git rev-parse` would
// add about 40 ms to every Bash command on Windows (measured 2026-09-27); Git Bash hands $PWD's
// /c/... form to Windows programs as C:/.... The checkout counts only if it carries THIS file, so
// another repository, or a worktree on a branch older than this change (whose .gitignore does not
// cover .noacg/), keeps the per-user store. The test pins that the marker is this file's own path.

import { writeFileSync } from 'node:fs';

export const MARKER = 'scripts/hooks/cli-credentials-env.mjs';

export const CLI_CREDENTIALS_ENV = `# noacg CLI: this checkout keeps its own login (${MARKER})
if [ -z "\${NOACG_CREDENTIALS_DIR:-}" ]; then
  __noacg_d=$PWD
  while [ -n "$__noacg_d" ] && [ ! -e "$__noacg_d/.git" ]; do __noacg_d=\${__noacg_d%/*}; done
  if [ -n "$__noacg_d" ] && [ -e "$__noacg_d/${MARKER}" ]; then
    export NOACG_CREDENTIALS_DIR="$__noacg_d/.noacg"
  fi
  unset __noacg_d
fi
`;

/**
 * Write the lines into the session's env file. The file is this hook's own (Claude Code gives each
 * SessionStart hook one), so it is replaced rather than appended to: the hook runs again on resume
 * and compact. Returns whether there was a file to write.
 */
export function writeCliCredentialsEnv(envFile = process.env.CLAUDE_ENV_FILE) {
  if (!envFile) return false;
  writeFileSync(envFile, CLI_CREDENTIALS_ENV);
  return true;
}
