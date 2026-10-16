// PreToolUse guard for Codex's shell tool, wired in `.codex/hooks.json`: a polling loop with no
// time limit is refused, and so is a command that reads or prints a .env file's values (#1281),
// with the same words the Claude Code guard (guard-command.mjs) uses.
//
// Only those two rules, deliberately. docs/work-specs/agent-lifecycle/spec.md point 18 asks whether
// Codex can run the endless-wait check; it can, since Codex hooks take the same event shape
// (`tool_input.command`). The .env rule matters even more here, because Codex reads every file
// through its shell. The rest of guard-command.mjs assumes Claude Code (dev servers go through its
// preview tools, for one), so running it whole would refuse Codex work it was never written for.
//
// THE REFUSAL IS JSON ON STDOUT, not exit 2. Codex documents both, but on Codex CLI 0.163 on
// Windows a hook that exits 2 with its reason on stderr was run and then ignored: the command ran.
// `permissionDecision: "deny"` blocked it and showed the reason (2026-10-09, `codex exec`).
//
// Codex skips a project hook until it is trusted: run `/hooks` in Codex once and trust this one.

import { readHookInput } from './lib.mjs';
import { envSecretsRefusal, showsEnvSecrets } from './env-secrets.mjs';
import { endlessWait, endlessWaitRefusal } from '../command-match.mjs';

const input = await readHookInput();
const command = input?.tool_input?.command;
let refusal = null;
if (typeof command === 'string') {
  const secretRead = showsEnvSecrets(command, typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd());
  const wait = !secretRead && endlessWait(command);
  refusal = secretRead ? envSecretsRefusal(secretRead) : wait ? endlessWaitRefusal(wait) : null;
}
if (refusal) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: refusal },
  }));
}
process.exit(0);
