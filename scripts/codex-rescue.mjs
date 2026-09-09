#!/usr/bin/env node
// THE CODEX DELEGATION CHANNEL - launch, watch, cancel and reap Codex background jobs.
//
//   node scripts/codex-rescue.mjs launch "<prompt>" [--write] [--model m] [--effort e] [--resume]
//   node scripts/codex-rescue.mjs status [<jobId>] [--all] [--json]
//   node scripts/codex-rescue.mjs poll <jobId> [--timeout-seconds 240]
//   node scripts/codex-rescue.mjs result <jobId> [--json]
//   node scripts/codex-rescue.mjs cancel <jobId>
//   node scripts/codex-rescue.mjs reap [--all-workspaces]
//
// WHY THIS EXISTS. The Codex plugin's own companion script is the engine and stays the engine -
// this wrapper never reimplements a task run. It exists because the CHANNEL around that engine
// failed three ways in the first delegation trial (2026-08-29), and every one of them is
// invisible from the plugin's status API. The three are written out here rather than cited,
// because the trial's own handoff was a working note and has been swept:
//
//   1. THE LAUNCH DIED WITH ITS CALLER. `/rescue` forwarded to a subagent, so the launcher ran
//      inside that subagent's Bash call. The plugin spawns its worker with `detached: true`,
//      which on Windows does NOT break the parent link a `taskkill /T` walks - it only breaks the
//      console. For the ~1-2 s the launcher is still alive, the worker is a reachable descendant
//      of the caller, so a kill landing in that window takes the worker with it. The trial's job
//      died 2.4 s in, mid broker handshake. Two changes close it: the launch happens in the
//      session that asked for it (no subagent lifetime to inherit), and `launchPlan` ORPHANS the
//      launcher through `start`, whose cmd exits at once - after which no tree walk from this
//      shell can reach anything Codex is running.
//   2. A DEAD JOB REPORTED AS RUNNING, FOREVER. Nothing reconciled pid liveness against job
//      status, so a killed job and a slow one were indistinguishable - strictly worse than a
//      visible foreground death, because it presents as patient work. `reconcileJob` marks a job
//      failed once its pid is gone, and `status`/`poll`/`reap` persist that verdict.
//   3. CANCEL COULD NOT KILL ANYTHING ON WINDOWS. The plugin runs `taskkill` through
//      `shell: process.env.SHELL`, which here is Git Bash, and MSYS path conversion rewrites
//      `/PID` into `C:/Program Files/Git/PID`. Every cancel ended in
//      `ERROR: Invalid argument/option`. `killPlan` passes argv straight to the executable with
//      no shell, so there is nothing to rewrite.
//
// The arithmetic - which jobs are dead, what to kill, how to orphan a launch - is pure and unit
// tested in codex-rescue.test.mjs. This file is the part that talks to the OS and to the plugin.

import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, statSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** Where the plugin keeps its versioned copies. Overridable so the test never needs a real one. */
const PLUGIN_CACHE = path.join(
  process.env.USERPROFILE ?? process.env.HOME ?? '',
  '.claude', 'plugins', 'cache', 'openai-codex', 'codex',
);
/** A job that never writes a log line for this long is reported as stalled, not silently awaited. */
export const STALL_SECONDS = 300;
/** Statuses the plugin uses for work that has not reached an outcome yet. */
const ACTIVE = new Set(['queued', 'running']);

// ── Pure decisions ───────────────────────────────────────────────────────────────────────────────

/** Highest semver directory name, so a plugin upgrade is picked up without editing anything. */
export function pickPluginVersion(names) {
  const parsed = names
    .map((name) => ({ name, parts: /^(\d+)\.(\d+)\.(\d+)$/.exec(name) }))
    .filter((entry) => entry.parts)
    .map((entry) => ({ name: entry.name, key: entry.parts.slice(1, 4).map(Number) }));
  if (!parsed.length) return null;
  parsed.sort((left, right) => {
    for (let index = 0; index < 3; index += 1) {
      if (left.key[index] !== right.key[index]) return right.key[index] - left.key[index];
    }
    return 0;
  });
  return parsed[0].name;
}

/** True unless the OS says the process is gone. EPERM means it exists and is not ours to signal. */
export function processAlive(pid, kill = process.kill.bind(process)) {
  try {
    kill(pid, 0);
    return true;
  } catch (error) {
    return error?.code === 'EPERM';
  }
}

/**
 * Defect 2. A job whose pid no longer exists did not finish - it was killed or it crashed past
 * the plugin's own error handling, which is exactly the case that never records an outcome.
 * Returns the patch that makes that visible, or null to leave the job alone.
 *
 * Only a MISSING pid is evidence. A live pid is never read as proof the job is healthy (pids are
 * reused), so the worst this can do is leave a stale job looking active - never the reverse.
 */
export function reconcileJob(job, { alive = processAlive, nowIso = () => new Date().toISOString() } = {}) {
  if (!ACTIVE.has(job.status)) return null;
  const pid = Number(job.pid);
  if (!Number.isFinite(pid) || pid <= 0) return null;
  if (alive(pid)) return null;
  return {
    id: job.id,
    status: 'failed',
    phase: 'dead',
    pid: null,
    deadPid: pid,
    completedAt: nowIso(),
    errorMessage:
      `Process ${pid} is gone while the job was still marked ${job.status}. The Codex worker was `
      + 'killed or crashed without recording an outcome.',
  };
}

/**
 * Defect 3. Argv straight to the executable, never through a shell: Git Bash is this machine's
 * $SHELL, and MSYS rewrites any argument that looks like a path - which `/PID` and `/T` do.
 */
export function killPlan(pid, platform = process.platform) {
  if (platform === 'win32') {
    const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
    const exe = path.join(system32, 'taskkill.exe');
    return { command: existsSync(exe) ? exe : 'taskkill', args: ['/PID', String(pid), '/T', '/F'] };
  }
  return { command: 'kill', args: ['-TERM', `-${pid}`] };
}

/** Same reasoning as killPlan: the /FI filter would be mangled by a shell too. */
export function imageNamePlan(pid, platform = process.platform) {
  if (platform !== 'win32') return null;
  const system32 = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32');
  const exe = path.join(system32, 'tasklist.exe');
  return {
    command: existsSync(exe) ? exe : 'tasklist',
    args: ['/FI', `PID eq ${pid}`, '/FO', 'CSV', '/NH'],
  };
}

/**
 * Defect 1. Orphan the launcher so nothing Codex runs is ever a descendant of this shell.
 *
 * `detached: true` is not enough on Windows: it breaks the console, not the parent link that
 * `taskkill /T` walks. The launcher needs ~2 s to reach the broker handshake - the exact window
 * the trial's job was killed in - and for all of it the worker is a reachable descendant of
 * whatever called us.
 *
 * So the launch goes through a RELAY: this script re-invokes itself, the relay spawns the real
 * launcher detached and exits within milliseconds, and from then on there is no live chain from
 * this shell to anything Codex is doing. The relay owns the launcher's stdout too, which is where
 * the job id comes from - a shell redirect would not survive the hop, and `cmd /c start` was
 * measured writing an empty file for exactly that reason.
 */
export function relayArgs({ self, script, outFile, scriptArgs }) {
  return [self, 'relay', '--relay-out', outFile, '--relay-script', script, '--', ...scriptArgs];
}

/** The relay's own argv, split back into what it must open and what it must forward. */
export function parseRelayArgs(argv) {
  const separator = argv.indexOf('--');
  const head = separator === -1 ? argv : argv.slice(0, separator);
  const read = (flag) => {
    const index = head.indexOf(flag);
    return index === -1 ? null : head[index + 1];
  };
  return {
    outFile: read('--relay-out'),
    script: read('--relay-script'),
    scriptArgs: separator === -1 ? [] : argv.slice(separator + 1),
  };
}

/** Seconds since a job last wrote a log line, so a hang is reported instead of awaited forever. */
export function logIdleSeconds(logFile, nowMs = Date.now()) {
  if (!logFile || !existsSync(logFile)) return null;
  return Math.max(0, Math.round((nowMs - statSync(logFile).mtimeMs) / 1000));
}

// ── The plugin, and its on-disk job state ────────────────────────────────────────────────────────

function pluginRoot() {
  if (!existsSync(PLUGIN_CACHE)) {
    throw new Error(`Codex plugin not installed at ${PLUGIN_CACHE}. Run /codex:setup.`);
  }
  const version = pickPluginVersion(readdirSync(PLUGIN_CACHE));
  if (!version) throw new Error(`No versioned Codex plugin under ${PLUGIN_CACHE}. Run /codex:setup.`);
  return path.join(PLUGIN_CACHE, version);
}

function companionScript() {
  return path.join(pluginRoot(), 'scripts', 'codex-companion.mjs');
}

/**
 * The job state lives in the plugin's own directory layout, keyed by workspace. Its path helper is
 * imported rather than reimplemented - a second copy of that derivation would drift silently and
 * then read an empty job list, which looks exactly like "no jobs".
 */
async function stateDir(cwd) {
  const module = await import(pathToFileURL(path.join(pluginRoot(), 'scripts', 'lib', 'state.mjs')).href);
  return module.resolveStateDir(cwd);
}

/** Read the workspace's job table. The on-disk shape is version 1; anything else is not ours. */
function readState(dir) {
  const file = path.join(dir, 'state.json');
  if (!existsSync(file)) return { version: 1, config: {}, jobs: [] };
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (parsed.version !== 1) {
    throw new Error(`Codex job state at ${file} is version ${parsed.version}; this wrapper knows version 1.`);
  }
  return { ...parsed, jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [] };
}

/** Patch one job in both places the plugin keeps it, so neither view can contradict the other. */
function persistPatch(dir, patch) {
  const stateFile = path.join(dir, 'state.json');
  const state = readState(dir);
  const index = state.jobs.findIndex((job) => job.id === patch.id);
  if (index === -1) return;
  state.jobs[index] = { ...state.jobs[index], ...patch, updatedAt: new Date().toISOString() };
  writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, 'utf8');

  const jobFile = path.join(dir, 'jobs', `${patch.id}.json`);
  if (existsSync(jobFile)) {
    const stored = JSON.parse(readFileSync(jobFile, 'utf8'));
    writeFileSync(jobFile, `${JSON.stringify({ ...stored, ...patch }, null, 2)}\n`, 'utf8');
  }
}

/** Every job in a workspace, reconciled against the OS before anybody is told what it is doing. */
function reconciledJobs(dir) {
  const jobs = readState(dir).jobs;
  return jobs.map((job) => {
    const patch = reconcileJob(job);
    if (patch) persistPatch(dir, patch);
    const merged = patch ? { ...job, ...patch } : job;
    return { ...merged, logIdleSeconds: logIdleSeconds(merged.logFile) };
  });
}

function findJob(jobs, reference) {
  if (!reference) return jobs[0] ?? null;
  const exact = jobs.find((job) => job.id === reference);
  if (exact) return exact;
  const prefixed = jobs.filter((job) => job.id.startsWith(reference));
  if (prefixed.length === 1) return prefixed[0];
  if (prefixed.length > 1) throw new Error(`Job reference "${reference}" is ambiguous.`);
  throw new Error(`No job found for "${reference}".`);
}

function newestFirst(jobs) {
  return [...jobs].sort((left, right) => String(right.updatedAt ?? '').localeCompare(String(left.updatedAt ?? '')));
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function summarize(job) {
  const bits = [`${job.id}  ${job.status}/${job.phase ?? '-'}`];
  if (job.pid) bits.push(`pid ${job.pid}`);
  if (job.deadPid) bits.push(`dead pid ${job.deadPid}`);
  if (job.logIdleSeconds != null && ACTIVE.has(job.status)) {
    bits.push(`log idle ${job.logIdleSeconds}s${job.logIdleSeconds >= STALL_SECONDS ? ' (STALLED)' : ''}`);
  }
  if (job.errorMessage) bits.push(job.errorMessage);
  return bits.join('  ');
}

// The owner's reasoning-effort floor (2026-08-30 ruling, mechanism added 2026-09-01): high is
// the norm, medium the floor, low only for mechanical retrieval. The ruling used to live only in
// one laptop's ~/.codex/config.toml, which nothing checks and no other machine shares - so a
// launch that names no effort now carries the norm explicitly instead of inheriting whatever the
// machine happens to say. An explicit --effort always wins; this is a default, not a clamp.
//
// MEDIUM UNTIL 2026-09-16, by the owner's ruling of 2026-09-09: spend the Codex subscription hard
// this week on `gpt-6-astra`, the CLI's new default model, and take the throughput medium buys.
// This is not a relaxation of the floor - medium IS the floor the same owner set, chosen
// deliberately rather than drifted into, and low remains reserved for mechanical retrieval.
//
// IT HAS AN EXPIRY BECAUSE A TRIAL WITHOUT ONE IS JUST A NEW DEFAULT. What the week is meant to
// answer is whether astra at medium is worth more than the previous model at high, and the
// delegation ledger already records what settles it: model, effort, outcome and cause per task
// class (`npm run harness:usage`, `scripts/delegation-outcome.mjs`). On or after the date above,
// read the ledger and either extend this with the evidence or put it back to `high`.
//
// Nothing here pins the MODEL: `--model` is forwarded when a caller names one, and with none the
// CLI uses its own default, which is `gpt-6-astra` as of 0.154.0-alpha.6.
export const DEFAULT_EFFORT = 'medium';
export const DEFAULT_EFFORT_REVIEW_ON = '2026-09-16';

/** Pure half of launch(): split argv into forwarded flags and the prompt, injecting the effort
 *  default when the caller named none. Exported so the default is pinned by a test. Both flag
 *  spellings are recognised - `--effort low` AND `--effort=low` - because the `=` form silently
 *  becoming prompt text meant a deliberate low-effort launch ran at the injected high AND leaked
 *  the flag into the model's input. A valued flag with no value is refused for the same reason:
 *  `undefined` in the argv array kills the spawn with a TypeError long after the mistake. */
export function launchPlan(argv) {
  const flags = [];
  const prompt = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const valued = /^(--model|--effort)(=(.*))?$/.exec(token);
    if (token === '--write' || token === '--fresh') flags.push(token);
    else if (token === '--resume') flags.push('--resume-last');
    else if (valued) {
      const value = valued[2] !== undefined ? valued[3] : argv[(index += 1)];
      if (value === undefined || value === '') {
        throw new Error(`${valued[1]} needs a value (got none)`);
      }
      flags.push(valued[1], value);
    } else prompt.push(token);
  }
  if (!flags.includes('--effort')) flags.push('--effort', DEFAULT_EFFORT);
  return { flags, text: prompt.join(' ').trim() };
}

async function launch(argv, cwd) {
  const { flags, text } = launchPlan(argv);
  if (!text && !flags.includes('--resume-last')) {
    throw new Error('Give the Codex task a prompt, or pass --resume to continue the last one.');
  }

  // The prompt goes through a file, not a command line: it is routinely kilobytes of spec, and a
  // quoting mistake there is a silently truncated task rather than an error.
  const scratch = mkdtempSync(path.join(tmpdir(), 'codex-rescue-'));
  const promptFile = path.join(scratch, 'prompt.txt');
  const outFile = path.join(scratch, 'launch.json');
  writeFileSync(promptFile, text, 'utf8');

  const scriptArgs = [
    'task', '--background', '--json', '--cwd', cwd, '--prompt-file', promptFile, ...flags,
  ];
  const relay = spawn(
    process.execPath,
    relayArgs({ self: fileURLToPath(import.meta.url), script: companionScript(), outFile, scriptArgs }),
    { cwd, detached: true, stdio: 'ignore', windowsHide: true },
  );
  relay.unref();

  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (existsSync(outFile)) {
      const raw = readFileSync(outFile, 'utf8');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          const payload = JSON.parse(raw.slice(start, end + 1));
          if (payload.jobId) {
            console.log(JSON.stringify({ ...payload, promptBytes: Buffer.byteLength(text) }, null, 2));
            return 0;
          }
        } catch {
          // The launcher is still writing; fall through and look again.
        }
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Codex launcher wrote no job id within 60 s. Its output: ${
    existsSync(outFile) ? readFileSync(outFile, 'utf8').trim() || '(empty)' : '(no file)'}`);
}

/**
 * The middle of the relay: spawn the real launcher, hand it the output file, and get out of the
 * way at once. Every millisecond this process stays alive is a millisecond the launcher is still
 * reachable from the caller's process tree, so it does exactly this and exits.
 */
function relay(argv, cwd) {
  const { outFile, script, scriptArgs } = parseRelayArgs(argv);
  const handle = openSync(outFile, 'w');
  const child = spawn(process.execPath, [script, ...scriptArgs], {
    cwd,
    detached: true,
    stdio: ['ignore', handle, handle],
    windowsHide: true,
  });
  child.unref();
  closeSync(handle);
  return 0;
}

async function status(argv, cwd) {
  const json = argv.includes('--json');
  const all = argv.includes('--all');
  const reference = argv.find((token) => !token.startsWith('--')) ?? '';
  const jobs = newestFirst(reconciledJobs(await stateDir(cwd)));

  if (reference) {
    const job = findJob(jobs, reference);
    console.log(json ? JSON.stringify({ job }, null, 2) : summarize(job));
    return 0;
  }
  const shown = all ? jobs : jobs.filter((job) => ACTIVE.has(job.status)).concat(jobs.filter((job) => !ACTIVE.has(job.status)).slice(0, 3));
  console.log(json ? JSON.stringify({ jobs: shown }, null, 2) : (shown.map(summarize).join('\n') || 'No Codex jobs in this workspace.'));
  return 0;
}

/**
 * Poll inside ONE process instead of one shell call per sample: the caller's tool call has a hard
 * time cap, and a long poll spread over many calls is where a job stops being watched at all.
 * Returns as soon as the job reaches an outcome, is found dead, or stalls.
 */
async function poll(argv, cwd) {
  const timeoutIndex = argv.indexOf('--timeout-seconds');
  const timeoutSeconds = timeoutIndex === -1 ? 240 : Number(argv[timeoutIndex + 1]);
  const positional = timeoutIndex === -1
    ? argv
    : [...argv.slice(0, timeoutIndex), ...argv.slice(timeoutIndex + 2)];
  const reference = positional.find((token) => !token.startsWith('--')) ?? '';
  const dir = await stateDir(cwd);
  const deadline = Date.now() + timeoutSeconds * 1000;

  for (;;) {
    const job = findJob(newestFirst(reconciledJobs(dir)), reference);
    if (TERMINAL.has(job.status)) {
      console.log(summarize(job));
      return job.status === 'completed' ? 0 : 1;
    }
    if (job.logIdleSeconds != null && job.logIdleSeconds >= STALL_SECONDS) {
      console.log(`${summarize(job)}\nStalled: no log line for ${job.logIdleSeconds}s. Not waiting further.`);
      return 2;
    }
    if (Date.now() >= deadline) {
      console.log(`${summarize(job)}\nStill running after ${timeoutSeconds}s. Poll again.`);
      return 3;
    }
    await new Promise((resolve) => setTimeout(resolve, 10_000));
  }
}

function result(argv, cwd) {
  const reference = argv.find((token) => !token.startsWith('--')) ?? '';
  const args = ['result', ...(reference ? [reference] : []), '--cwd', cwd, ...(argv.includes('--json') ? ['--json'] : [])];
  const run = spawnSync(process.execPath, [companionScript(), ...args], { encoding: 'utf8', shell: false });
  if (run.stdout) process.stdout.write(run.stdout);
  if (run.status !== 0 && run.stderr) process.stderr.write(run.stderr);
  return run.status ?? 1;
}

/** Refuse to signal a pid that is no longer the job's process - pids are reused. */
function imageName(pid) {
  const plan = imageNamePlan(pid);
  if (!plan) return null;
  const run = spawnSync(plan.command, plan.args, { encoding: 'utf8', shell: false, windowsHide: true });
  const match = /^"([^"]+)"/.exec((run.stdout ?? '').trim());
  return match ? match[1] : null;
}

async function cancel(argv, cwd) {
  const reference = argv.find((token) => !token.startsWith('--')) ?? '';
  const dir = await stateDir(cwd);
  const job = findJob(newestFirst(reconciledJobs(dir)), reference);

  if (!ACTIVE.has(job.status)) {
    console.log(`${job.id} is already ${job.status}; nothing to cancel.`);
    return 0;
  }

  const pid = Number(job.pid);
  let killed = 'no live pid recorded';
  if (Number.isFinite(pid) && pid > 0 && processAlive(pid)) {
    const image = imageName(pid);
    if (image && !/^node(\.exe)?$/i.test(image)) {
      throw new Error(
        `Refusing to kill pid ${pid}: it is ${image}, not the Codex worker. The pid was reused. `
        + 'Run `reap` to clear the stale record instead.',
      );
    }
    const plan = killPlan(pid);
    const run = spawnSync(plan.command, plan.args, { encoding: 'utf8', shell: false, windowsHide: true });
    killed = run.status === 0 ? `killed pid ${pid}` : `taskkill said: ${(run.stderr || run.stdout || '').trim()}`;
  }

  persistPatch(dir, {
    id: job.id,
    status: 'cancelled',
    phase: 'cancelled',
    pid: null,
    completedAt: new Date().toISOString(),
    errorMessage: 'Cancelled by user.',
  });
  console.log(`${job.id} cancelled (${killed}).`);
  return 0;
}

/** Every workspace the plugin has state for, so a job orphaned in a closed session is still found. */
function allStateDirs() {
  const root = process.env.CLAUDE_PLUGIN_DATA
    ? path.join(process.env.CLAUDE_PLUGIN_DATA, 'state')
    : path.join(tmpdir(), 'codex-companion');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name));
}

async function reap(argv, cwd) {
  const dirs = argv.includes('--all-workspaces') ? allStateDirs() : [await stateDir(cwd)];
  const cleared = [];
  for (const dir of dirs) {
    if (!existsSync(path.join(dir, 'state.json'))) continue;
    for (const job of readState(dir).jobs) {
      const patch = reconcileJob(job);
      if (!patch) continue;
      persistPatch(dir, patch);
      cleared.push(`${job.id}  ${job.status} -> failed/dead  (pid ${patch.deadPid} gone)  ${path.basename(dir)}`);
    }
  }
  console.log(cleared.length ? cleared.join('\n') : 'No stale Codex jobs found.');
  return 0;
}

// ── Entry ────────────────────────────────────────────────────────────────────────────────────────

const HANDLERS = { launch, relay, status, poll, result, cancel, reap };

/**
 * `--cwd` is ours only BEFORE a `--`. Everything after it belongs to the command being forwarded,
 * and the relay forwards a `--cwd` of its own - reading that one as ours would silently strip the
 * workspace the Codex job was meant to run in.
 */
export function splitOwnArgs(rest, fallbackCwd) {
  const end = rest.indexOf('--');
  const ours = end === -1 ? rest : rest.slice(0, end);
  const cwdIndex = ours.indexOf('--cwd');
  if (cwdIndex === -1) return { cwd: fallbackCwd, argv: rest };
  return {
    cwd: rest[cwdIndex + 1],
    argv: [...rest.slice(0, cwdIndex), ...rest.slice(cwdIndex + 2)],
  };
}

async function main() {
  const [subcommand, ...rest] = process.argv.slice(2);
  const { cwd, argv } = splitOwnArgs(rest, process.cwd());

  const handler = HANDLERS[subcommand];
  if (!handler) {
    console.error(`Usage: node scripts/codex-rescue.mjs <${Object.keys(HANDLERS).join('|')}> [...]`);
    return 64;
  }
  return (await handler(argv, cwd)) ?? 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().then(
    (code) => { process.exitCode = code; },
    (error) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
