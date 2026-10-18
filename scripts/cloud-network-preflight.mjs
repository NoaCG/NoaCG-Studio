#!/usr/bin/env node
// Read-only startup qualification for the managed shell, not a build gate: an offline build
// must not need GitHub. The always-loaded cloud rule routes Codex here with network permission.
// Git and Actions API reads are independent; neither proves that writes or a durable wake work.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const PROBE_TIMEOUT_MS = 6000;
const PROBES = [
  { name: 'Git origin/main', command: 'git', args: ['ls-remote', '--exit-code', 'origin', 'refs/heads/main'],
    valid: (stdout) => /^[a-f\d]{40}\s+refs\/heads\/main\s*$/.test(stdout) },
  { name: 'GitHub Actions API', command: 'gh',
    args: ['api', '--hostname', 'github.com', '--method', 'GET',
      'repos/NoaCG/NoaCG-Studio/actions/runs?per_page=1', '--jq', '.total_count'],
    valid: (stdout) => /^\d+\s*$/.test(stdout) },
];

/** Inspect errors privately. Raw stdout/stderr may contain credentials or signed URLs. */
export function diagnosis(result) {
  const code = result.error?.code;
  const stderr = String(result.stderr ?? '');
  if (code === 'ETIMEDOUT') return 'timeout: the command did not finish within its limit';
  if (code === 'ENOENT') return 'tool missing: the executable could not start';
  if (['EPERM', 'EACCES'].includes(code) || /Operation not permitted|permission denied.*socket/i.test(stderr)) {
    return 'permission: check the shell tool network permission before diagnosing GitHub';
  }
  if (/Failed to connect to proxy|Could not resolve proxy|proxy.*(?:refused|unreachable)|CONNECT tunnel failed|Proxy CONNECT aborted/i.test(stderr)) {
    return 'proxy: check shell network permission, then proxy reachability and destination policy';
  }
  if (/Authentication failed|Invalid username or (?:password|token)|could not read (?:Username|Password)|HTTP 401\b|gh auth login/i.test(stderr)) {
    return 'authentication: the CLI could not authenticate; connector access is separate';
  }
  if (/HTTP (?:403|404)\b|not allowed|denied by.*policy/i.test(stderr)) {
    return 'access: check destination policy and repository or Actions permissions';
  }
  if (/Could not resolve host|Failed to connect|Connection (?:refused|reset|timed out)|SSL|TLS|HTTP 5\d\d\b/i.test(stderr)) {
    return 'transport: check DNS, proxy, TLS and service availability';
  }
  return 'unqualified: check the command locally without exposing credentials or raw logs';
}

/** Both reads run even if one fails; process.cwd() never selects a sibling's repository. */
export function preflight({ cwd = ROOT, run = spawnSync, env = process.env } = {}) {
  return PROBES.map(({ name, command, args, valid }) => {
    let result;
    try {
      result = run(command, args, {
        cwd, encoding: 'utf8', timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL',
        maxBuffer: 64 * 1024, windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' },
      });
    } catch (error) {
      result = { error };
    }
    const ok = !result.error && result.status === 0 && valid(String(result.stdout ?? '').trim());
    return { name, ok, detail: ok ? 'read passed' : diagnosis(result) };
  });
}

export function main(options) {
  const results = preflight(options);
  for (const { name, ok, detail } of results) {
    console.log(`[cloud-network] ${name}: ${ok ? 'PASS' : 'FAIL'} - ${detail}`);
  }
  return results.every(({ ok }) => ok) ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
