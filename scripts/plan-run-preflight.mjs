#!/usr/bin/env node
// Qualification only: run in separate shell calls, then in a fresh worker. This process cannot
// observe a tool's pre-execution approval wait, grant permission, or prove a future wake.
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { executionProfile } from './execution-profile.mjs';
import { diagnosis, preflight as networkPreflight, PROBE_TIMEOUT_MS } from './cloud-network-preflight.mjs';
import { nextStep } from './plan-run.mjs';
import { WINDOW_END } from './wave-plan-store.mjs';
import { DAY_MS, projectBoundary, readProject } from './project-authorization.mjs';

export { PROBE_TIMEOUT_MS };
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ISO_OFFSET = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;
const runCommand = (command, args, options) => spawnSync(command, args, { ...options, windowsHide: true });
const PERMISSION = ['EPERM', 'EACCES'];
const CAPACITY = ['ENOSPC', 'ENOMEM', 'EAGAIN', 'EMFILE', 'ENFILE'];
const CHILD = `
const fs = require('node:fs'), file = process.argv[1];
try {
  fs.writeFileSync(file, 'workspace-child-ok', { flag: 'wx' });
  if (fs.readFileSync(file, 'utf8') !== 'workspace-child-ok') process.exitCode = 1;
} catch (error) {
  process.stderr.write(${JSON.stringify(PERMISSION)}.includes(error.code) ? 'workspace-permission'
    : ${JSON.stringify(CAPACITY)}.includes(error.code) ? 'workspace-capacity' : 'workspace-io');
  process.exitCode = 1;
}
if (!process.exitCode) process.stdout.write('workspace-child-ok');
`;

function workspaceDiagnosis(result) {
  const marker = String(result.stderr ?? '').trim();
  if (PERMISSION.includes(result.error?.code) || marker === 'workspace-permission') {
    return 'permission: subprocess or workspace access denied; inspect the tool execution policy and worktree access';
  }
  if (CAPACITY.includes(result.error?.code) || marker === 'workspace-capacity') {
    return 'capacity: subprocess or workspace resources unavailable; checkpoint without a product repair';
  }
  return diagnosis(result);
}

/** No persistent state: the existing wave file remains the receipt/launch ledger. */
export function preflight({ context, until, wave, continuation = 'active-owner', cwd = ROOT, now,
  run = runCommand, env = process.env } = {}) {
  const started = now ?? Date.now();
  const profile = executionProfile({ env });
  const validContext = ['coordinator', 'worker'].includes(context);
  const receipt = { at: new Date(started).toISOString(), context: validContext ? context : null, site: profile.kind,
    scope: 'this invocation only', ok: false, checks: [], qualificationGaps: [
      'native Codex child launch/environment mapping', 'observed native wake/bootstrap after host loss',
      'acceptance-side stale-owner fencing and remote handoff',
    ] };
  const block = (detail) => {
    receipt.checks.push({ name: 'Run window', ok: false, category: 'infrastructure', detail });
    return receipt;
  };
  if (!validContext || Boolean(until) === Boolean(wave)) {
    return block('supply coordinator or worker and exactly one of --until or --wave');
  }
  if (continuation !== 'active-owner') return block('native recovery/remote handoff unqualified: require supported acceptance-side fencing and owner read-back; checkpoint and stop');
  let text;
  if (wave) {
    try { text = readFileSync(wave, 'utf8'); }
    catch { return block('wave unreadable: reconcile the existing run before launching'); }
    until = WINDOW_END.exec(text)?.[2];
  }
  const end = ISO_OFFSET.test(until ?? '') ? Date.parse(until) : NaN;
  const start = text ? Date.parse(/^Window starts: (\S+)/m.exec(text)?.[1] ?? '') : started;
  let project;
  try { project = text && readProject(text, started); }
  catch (error) { return block(error.message); }
  if (!Number.isFinite(end) || !Number.isFinite(start)) {
    return block('invalid window: require an explicit finite deadline with offset');
  }
  if (started >= end) return block('window expired: checkpoint; only the owner can authorize a new window');
  if (end <= start || (!project && end - start > DAY_MS) || start > started) {
    return block('invalid window: require a started window of at most 24 hours');
  }
  if (project && projectBoundary(project, started)) return block(`project refuses work: ${projectBoundary(project, started).action}`);
  if (text && !['launch', 'wait', 'retro'].includes(nextStep(text, started).action)) {
    return block('ledger refuses work: reconcile its next step before launching');
  }
  let child;
  const probeFile = path.join(cwd, `.plan-run-probe-${randomUUID()}`);
  try {
    child = run(process.execPath, ['-e', CHILD, probeFile], { cwd, encoding: 'utf8',
      timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL', maxBuffer: 64 * 1024,
      windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GH_PROMPT_DISABLED: '1' } });
  } catch (error) { child = { error }; }
  finally {
    // The parent also cleans after a killed/timed-out child. Never recurse or touch other files.
    try { rmSync(probeFile, { force: true }); }
    catch (error) { child = { error }; }
  }
  const ok = !child.error && child.status === 0 && String(child.stdout ?? '').trim() === 'workspace-child-ok';
  const detail = ok ? 'subprocess and disposable workspace IO passed' : workspaceDiagnosis(child);
  receipt.checks.push({ name: 'Workspace child', ok,
    category: detail.startsWith('capacity:') ? 'capacity' : 'infrastructure', detail });
  receipt.checks.push(...networkPreflight({ cwd, run, env }).map((check) => ({ ...check, category: 'infrastructure' })));
  if ((now ?? Date.now()) >= end) return block('window expired during probes: checkpoint without launching');
  receipt.ok = receipt.checks.every((check) => check.ok);
  return receipt;
}

export function main(argv = process.argv.slice(2), { print = console.log, ...options } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.slice(2);
    if (!['context', 'until', 'wave', 'continuation'].includes(key) || argv[i] !== `--${key}` || !argv[i + 1]
      || Object.hasOwn(args, key)) {
      print('Usage: node scripts/plan-run-preflight.mjs --context coordinator|worker --until <ISO with offset> | --wave <existing file>');
      return 2;
    }
    args[key] = argv[i + 1];
  }
  const result = preflight({ ...options, ...args });
  print(JSON.stringify(result));
  return result.ok ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
