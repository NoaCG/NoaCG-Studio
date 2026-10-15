// UserPromptSubmit gate for the run wake-up's firings (scripts/run-wake.mjs). Every 30 minutes the
// `noacg-run-wake` scheduled task starts a session whose only job is one check, and the model call
// is the whole cost of that firing. Nearly every firing finds the run alive, so this hook runs the
// check itself, before the prompt reaches the model, and blocks the prompt when there is nothing to
// do (alive, unknown, waiting): such a firing spends no tokens. Otherwise it hands the model the
// check's output, so the firing acts on it without running it again.
//
// Only a prompt that is wholly the scheduled task's own envelope, `<scheduled-task name="noacg-run-wake"
// ...>` to `</scheduled-task>`, is gated (a prompt quoting the tag is not); every other prompt passes untouched, and run-wake.mjs is imported only for that one. FAILS
// OPEN: when the check throws, the prompt goes through and the firing runs the check as before.

import { readHookInput } from './lib.mjs';

const FIRING = /^\s*<scheduled-task name="noacg-run-wake"[^>]*>[\s\S]*<\/scheduled-task>\s*$/;

const input = await readHookInput();
if (!input || !FIRING.test(String(input.prompt ?? ''))) process.exit(0);

let wake;
let lines;
try {
  wake = await import('../run-wake.mjs');
  lines = wake.runCheck();
} catch {
  process.exit(0);
}
const output = lines.join('\n');
const blocked = wake.QUIET_VERDICTS.includes(output.split(':', 1)[0]);
process.stdout.write(JSON.stringify(blocked
  ? { decision: 'block', reason: output }
  : { hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: `Output of node scripts/run-wake.mjs check, already run for this firing:\n${output}` } }));
