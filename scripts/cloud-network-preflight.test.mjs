// guards: .agent-workflows/cloud-delegate.md, contracts/rules/root/work-feature-branch-own-worktree-made.md
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { diagnosis, main, preflight, PROBE_TIMEOUT_MS } from './cloud-network-preflight.mjs';

const gitPass = { status: 0, stdout: `${'a'.repeat(40)}\trefs/heads/main\n` };
const apiPass = { status: 0, stdout: '0\n' };

test('qualifies Git and Actions independently, with read-only commands, bounded time and no prompts', () => {
  const calls = [];
  const results = preflight({
    env: { HTTPS_PROXY: 'http://proxy:8080', GIT_TERMINAL_PROMPT: '1' },
    run(command, args, options) {
      calls.push({ command, args, options });
      return command === 'git' ? gitPass : apiPass;
    },
  });
  assert.ok(results.every(({ ok }) => ok));
  assert.deepEqual(calls.map(({ command }) => command), ['git', 'gh']);
  assert.deepEqual(calls[0].args, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']);
  assert.ok(calls[1].args.includes('GET'));
  assert.ok(calls[1].args.includes('repos/NoaCG/NoaCG-Studio/actions/runs?per_page=1'));
  for (const { options } of calls) {
    assert.equal(options.cwd, fileURLToPath(new URL('..', import.meta.url)));
    assert.equal(options.timeout, PROBE_TIMEOUT_MS);
    assert.ok(options.timeout <= 6000);
    assert.equal(options.killSignal, 'SIGKILL');
    assert.equal(options.env.HTTPS_PROXY, 'http://proxy:8080');
    assert.equal(options.env.GIT_TERMINAL_PROMPT, '0');
    assert.equal(options.env.GCM_INTERACTIVE, 'never');
    assert.equal(options.env.GH_PROMPT_DISABLED, '1');
  }
});

test('a sandbox or proxy failure does not prevent qualifying the separate Actions API path', () => {
  for (const failure of [
    { status: 128, stderr: "fatal: Failed to connect to proxy port 8080 after 0 ms: Could not connect to server" },
    { status: null, error: { code: 'EPERM' } },
  ]) {
    const results = preflight({ run: (command) => command === 'git' ? failure : apiPass });
    assert.equal(results[0].ok, false);
    assert.match(results[0].detail, /shell.*network permission/);
    assert.doesNotMatch(results[0].detail, /authentication/);
    assert.equal(results[1].ok, true);
  }
});

test('a successful Git read does not hide an API denial or missing gh', () => {
  for (const failure of [{ status: 1, stderr: 'gh: Not Found (HTTP 404)' }, { error: { code: 'ENOENT' } }]) {
    const results = preflight({ run: (command) => command === 'git' ? gitPass : failure });
    assert.equal(results[0].ok, true);
    assert.equal(results[1].ok, false);
    assert.match(results[1].detail, /access:|tool missing:/);
  }
});

test('empty or malformed successful responses cannot claim readiness', () => {
  for (const stdout of ['', 'null', 'login required']) {
    assert.ok(preflight({ run: () => ({ status: 0, stdout }) }).every(({ ok }) => !ok));
  }
  const wrongBranch = preflight({ run: (command) => command === 'git'
    ? { status: 0, stdout: `${'a'.repeat(40)}\trefs/heads/other\n` } : apiPass });
  assert.equal(wrongBranch[0].ok, false);
});

test('timeouts, thrown permission errors and interrupted reads stay unqualified', () => {
  const timeout = preflight({ run: () => ({ error: { code: 'ETIMEDOUT' }, status: null, signal: 'SIGKILL' }) });
  assert.ok(timeout.every(({ ok, detail }) => !ok && detail.startsWith('timeout:')));
  const denied = preflight({ run: () => { throw Object.assign(new Error('private detail'), { code: 'EACCES' }); } });
  assert.ok(denied.every(({ ok, detail }) => !ok && detail.startsWith('permission:')));
  assert.ok(preflight({ run: () => ({ status: null, signal: 'SIGTERM' }) }).every(({ ok }) => !ok));
});

test('proxy policy denial is not reported as a disconnected GitHub account', () => {
  assert.match(diagnosis({ stderr: 'CONNECT tunnel failed, response 403' }), /^proxy:/);
  assert.match(diagnosis({ stderr: 'gh: Forbidden (HTTP 403)' }), /^access:/);
  assert.match(diagnosis({ stderr: 'gh: Bad credentials (HTTP 401)' }), /^authentication:/);
  assert.match(diagnosis({ stderr: 'Could not resolve host: github.com' }), /^transport:/);
});

test('CLI output redacts raw responses and exception messages and fails when either read fails', (t) => {
  const lines = [];
  t.mock.method(console, 'log', (line) => lines.push(line));
  const secret = 'credential-canary-DO-NOT-PRINT';
  assert.equal(main({ run: (command) => command === 'git' ? gitPass : {
    status: 1, stdout: secret, stderr: `gh: Forbidden (HTTP 403) https://example.invalid/?token=${secret}`,
  } }), 1);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /PASS/);
  assert.match(lines[1], /FAIL - access:/);
  assert.ok(!lines.join('\n').includes(secret));
  lines.length = 0;
  assert.equal(main({ run: () => { throw new Error(secret); } }), 1);
  assert.ok(!lines.join('\n').includes(secret));
  assert.equal(main({ run: (command) => command === 'git' ? gitPass : apiPass }), 0);
});
