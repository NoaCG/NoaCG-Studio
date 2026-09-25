// Shared harness for the hook tests: spawn the REAL hook file with one event on stdin, and read
// the wiring in .claude/settings.json.
//
// Spawning rather than importing is deliberate and is what docs/MISTAKE_TRIGGERS.md asks for. A
// hook reads stdin at module top level, so importing one to test it hangs; and spawning covers the
// stdin plumbing, the matcher and the message a session actually sees, rather than a pure function
// the hook might never reach. Exit 2 is the blocking code (`deny` / `warn` in lib.mjs); exit 0 is
// "nothing to say".
//
// The wiring check exists because a hook nothing routes to is not a guard, and it fails silently:
// every call sails through and the tests still pass, because they invoke the file directly. It is
// the one assertion that reads the configuration rather than the behaviour, so it is the one that
// notices a matcher edited, a path renamed, or the two drifting apart.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const SETTINGS = fileURLToPath(new URL('../../.claude/settings.json', import.meta.url));

/** Pipe one hook event into the real hook at `hookUrl` and report its exit code and message. */
export function runHook(hookUrl, event, env = {}, { cwd = process.cwd() } = {}) {
  const result = spawnSync(process.execPath, [fileURLToPath(hookUrl)], {
    input: typeof event === 'string' ? event : JSON.stringify(event),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd,
  });
  return { status: result.status, message: result.stderr ?? '' };
}

/**
 * Is `command` wired to run on `matcher` under `eventName` in the tracked settings? Returns a
 * reason string when it is not, so the assertion can say which half is missing.
 */
export function wiringProblem(eventName, matcher, command) {
  const settings = JSON.parse(readFileSync(SETTINGS, 'utf8'));
  const entry = (settings.hooks?.[eventName] ?? []).find((row) => row.matcher === matcher);
  if (!entry) return `no ${eventName} matcher for ${matcher} in .claude/settings.json`;
  // Settings spell the script from the project root (`node "$CLAUDE_PROJECT_DIR/scripts/hooks/x.mjs"`)
  // so a session whose working directory drifted into a subfolder still finds it; the tests name the
  // plain relative form.
  const plain = (c) => c.replace(/^node "\$CLAUDE_PROJECT_DIR\/(.+)"$/, 'node $1');
  if (!entry.hooks.some((h) => plain(h.command) === command)) return `the ${matcher} matcher exists but does not run ${command}`;
  return null;
}
