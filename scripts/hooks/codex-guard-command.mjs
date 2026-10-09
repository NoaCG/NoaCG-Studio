// PreToolUse guard for Codex's shell tool, wired in `.codex/hooks.json`: a polling loop with no
// time limit is refused, with the same words the Claude Code guard (guard-command.mjs) uses.
//
// Only that one rule, deliberately. docs/work-specs/agent-lifecycle/spec.md point 18 asks whether
// Codex can run the endless-wait check; it can, since Codex hooks take the same event shape
// (`tool_input.command`). The rest of guard-command.mjs assumes Claude Code (dev servers go through
// its preview tools, for one), so running it whole would refuse Codex work it was never written for.
//
// THE REFUSAL IS JSON ON STDOUT, not exit 2. Codex documents both, but on Codex CLI 0.163 on
// Windows a hook that exits 2 with its reason on stderr was run and then ignored: the command ran.
// `permissionDecision: "deny"` blocked it and showed the reason (2026-10-09, `codex exec`).
//
// Codex skips a project hook until it is trusted: run `/hooks` in Codex once and trust this one.

import { readHookInput } from './lib.mjs';
import { endlessWait, endlessWaitRefusal } from '../command-match.mjs';

const input = await readHookInput();
const command = input?.tool_input?.command;
const wait = typeof command === 'string' ? endlessWait(command) : null;
if (wait) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: endlessWaitRefusal(wait) },
  }));
}
process.exit(0);
