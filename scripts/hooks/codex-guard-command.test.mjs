// The Codex command guard: Codex's real PreToolUse event shape into the real hook, and the wiring in
// `.codex/hooks.json`, since a hook nothing routes to refuses nothing. Codex reads the refusal from
// a JSON `permissionDecision` on stdout (exit 2 was ignored on Windows), so that is what is read here.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const GUARD = fileURLToPath(new URL('./codex-guard-command.mjs', import.meta.url));
const codexShell = (command) => ({
  session_id: 's', turn_id: 't', hook_event_name: 'PreToolUse', cwd: process.cwd(), model: 'm',
  tool_name: 'Bash', tool_use_id: 'u', tool_input: { command },
});

/** Run the hook on one event; returns its exit code and its decision, or null when it allowed. */
function decide(event) {
  const run = spawnSync(process.execPath, [GUARD], {
    input: typeof event === 'string' ? event : JSON.stringify(event), encoding: 'utf8', windowsHide: true,
  });
  return { status: run.status, decision: run.stdout ? JSON.parse(run.stdout).hookSpecificOutput : null };
}

test('a polling loop with no time limit is denied, and the reason says how to add one', () => {
  for (const command of ['until docker info >/dev/null 2>&1; do sleep 5; done', 'while (-not (Test-Path ready)) { Start-Sleep 5 }']) {
    const { status, decision } = decide(codexShell(command));
    assert.equal(status, 0);
    assert.equal(decision?.permissionDecision, 'deny', `${command} was allowed`);
    assert.equal(decision.hookEventName, 'PreToolUse');
    assert.match(decision.permissionDecisionReason, /no time limit/);
    assert.match(decision.permissionDecisionReason, /timeout 600 bash -c/);
  }
  assert.equal(decide(codexShell("timeout 7200 bash -c 'until docker info; do sleep 5; done'")).decision?.permissionDecision, 'deny');
});

test('a bounded wait, an ordinary command and an unreadable event pass', () => {
  for (const event of [codexShell("timeout 600 bash -c 'until docker info; do sleep 5; done'"), codexShell('git status'), 'not json', { tool_name: 'apply_patch', tool_input: {} }]) {
    assert.deepEqual(decide(event), { status: 0, decision: null });
  }
});

test('.codex/hooks.json routes Codex shell calls to this hook', () => {
  const config = JSON.parse(readFileSync(new URL('../../.codex/hooks.json', import.meta.url), 'utf8'));
  const entry = config.hooks.PreToolUse.find((row) => new RegExp(row.matcher).test('Bash'));
  assert.ok(entry, 'no PreToolUse matcher for Bash');
  assert.ok(entry.hooks.some((hook) => hook.command.includes('scripts/hooks/codex-guard-command.mjs')));
});
