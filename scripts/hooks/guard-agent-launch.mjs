// PreToolUse guard for the Agent tool: a launch whose prompt names, on its TOUCHES or READ line,
// a path that does not exist is refused, with the offending entries quoted back.
//
// WHY A HOOK. On 2026-09-01 a row was launched on a plausible path nobody had grepped - the
// prompt named the images step beside the SVG drop zone - and ran on it ("the row that named the
// wrong step", .agent-workflows/orchestrator/incidents.md). On 2026-09-05 dictation lost a letter
// and a row's TOUCHES line went to the wrong file (the row that landed as `e6bdabce`; its handoff
// was drained on 2026-09-08).
// `scripts/wave-plan-check.mjs` checks the PLAN's table for exactly this and both prompts were
// wrong anyway: the plan is one file and the prompt a session is handed is another, edited after
// the check or launched by hand. TOUCHES is also what the collision pass reasons from, so two rows
// called disjoint on a path that does not exist were never analysed at all. The launch is the last
// moment the path can be caught before a session spends its first half hour on it.
//
// EXACT, so it refuses (docs/MISTAKE_TRIGGERS.md "Refuse or warn"): a relative path whose first
// segment the checkout HAS, and which exists neither in the launching checkout nor on
// `origin/main` nor as a gitignored file. Each clause is a false refusal that review found before
// it landed (2026-09-05): prose has slashes too (`Take/Update/Out`, `and/or`, `I/O`), so a token
// is a path claim only if its first segment is a directory of this checkout; a launcher whose tree
// is behind main must not refuse a file main has; and a generated or gitignored file
// (`.claude/launch.json`, `docs/handoffs/*.local.md`) is on origin/main never and in this tree
// only sometimes. `(new` exempts an entry, as in the plan check; MINTS names what the row creates
// and is cut off the TOUCHES line; a bare basename, an absolute path, `~` and a URL are never
// probed - `promptPathProblems` and `pathProbe` in scripts/wave-plan-check.mjs say why each.
//
// FAILS OPEN on anything it cannot read, and on a git that cannot answer. `origin/main` is
// resolved first; if git cannot say what main holds, the second look this guard promises is not
// available, and a guard that cannot tell must not refuse - so it stands down rather than judging
// on the filesystem alone. Review found the first cut treating "git could not answer" as "absent",
// which is a refusal, against the doc's own rule.
//
// COST. A prompt with no TOUCHES or READ key line is answered by one regex before anything is
// imported: measured 2026-09-05, median of five, 56 ms against 42 ms bare node (the first cut
// imported the plan-check chain unconditionally and cost 66 ms). A wave prompt whose paths all
// exist costs 102 ms - the `origin/main` resolution plus the chain - and a path missing locally
// adds one to two git calls, the rare case.
//
// NOTHING IS EXPORTED. A hook reads stdin at module top level, so importing one to test it hangs;
// guard-agent-launch.test.mjs spawns this file with real event JSON, and the parser it relies on
// is tested where it lives, in wave-plan-check.test.mjs.

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readHookInput, deny, gitOutput } from './lib.mjs';

const input = await readHookInput();
if (!input || !input.tool_input || typeof input.tool_input !== 'object') process.exit(0);

// The prompt is the field the Agent tool carries the task in; `instructions` is read too, for a
// launch shape that puts the row there.
const text = [input.tool_input.prompt, input.tool_input.instructions]
  .filter((field) => typeof field === 'string')
  .join('\n');
// The cheap gate: no key line, nothing to probe, and the parser's module chain stays unloaded.
if (!/^[^\S\r\n]*(?:TOUCHES|READ)\b/m.test(text)) process.exit(0);

const cwd = typeof input.cwd === 'string' && input.cwd ? input.cwd : process.cwd();
// The second look needs a main to look at. Without one this guard cannot keep its promise, so it
// says nothing rather than judging on half the facts.
if (gitOutput(cwd, ['rev-parse', '--verify', '--quiet', 'origin/main']) === null) process.exit(0);

const { promptPathProblems } = await import('../wave-plan-check.mjs');

const exists = (rel) =>
  existsSync(resolve(cwd, rel)) ||
  gitOutput(cwd, ['cat-file', '-e', `origin/main:${rel}`]) !== null ||
  // Gitignored means generated or local: on origin/main never, here only sometimes, and not this
  // guard's to judge. `check-ignore -q` exits 0 exactly when the path is ignored.
  gitOutput(cwd, ['check-ignore', '-q', rel]) !== null;

const problems = promptPathProblems(text, exists);
if (problems.length === 0) process.exit(0);

const named = problems.map((p) => `  ${p.key} names ${p.token}`).join('\n');
deny(
  'Blocked: this Agent launch names a path that does not exist, and the row would start on it:\n' +
    `${named}\n` +
    `Neither the launching checkout (${cwd}) nor origin/main has it. A row launched on a plausible ` +
    'path runs on it: on 2026-09-01 a prompt named the images step beside the SVG drop zone and ' +
    'nobody had grepped ("the row that named the wrong step", .agent-workflows/orchestrator/' +
    "incidents.md); on 2026-09-05 dictation lost a letter and sent a row's TOUCHES to the wrong " +
    "file. `node scripts/wave-plan-check.mjs` checks the plan's table; this is the prompt itself, " +
    'which is what the session will read.\n' +
    'Fix the path (grep for the basename - the right name is usually a letter away), or mark the ' +
    'entry `(new)` if the row creates it, then launch again.\n' +
    'Guard: scripts/hooks/guard-agent-launch.mjs.',
);
