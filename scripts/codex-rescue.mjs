#!/usr/bin/env node
// THE CODEX DELEGATION CHANNEL - launch, watch, cancel and reap Codex background jobs.
//
//   node scripts/codex-rescue.mjs launch "<prompt>" [--write] [--model m] [--effort e] [--resume]
//   node scripts/codex-rescue.mjs status [<jobId>] [--all] [--json]
//   node scripts/codex-rescue.mjs poll <jobId> [--timeout-seconds 240]
//   node scripts/codex-rescue.mjs result <jobId> [--json]
//   node scripts/codex-rescue.mjs cancel <jobId>
//   node scripts/codex-rescue.mjs reap [--all-workspaces]   clear jobs whose process died, and
//                                                           close the process family of every
//                                                           delegation that has finished with it
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
//   4. THE TREE OUTLIVED THE DELEGATION - found 2026-09-09, eleven days later, and the most
//      expensive of the four. A FINISHED delegation left its whole process family resident: a
//      broker, a `codex.js app-server`, a `codex.exe` and their MCP servers, about 450 MB each.
//      Measured that evening: 30 node processes and 1.4 GB belonging to three delegations that
//      had ended 6, 8 and 13 hours earlier, on a laptop whose job queue stops starting work
//      below a 4 GB floor. Nothing collected them because nothing knew what to collect - the
//      plugin's job record nulls the pid the moment a job completes, the family's parent links
//      are severed within seconds of the launch, and defect 1's fix deliberately cuts the last
//      live chain from this shell. `recordOwnership` writes each pid down WITH the time it
//      started, while the links are still there; `reapTrees` asks the broker to shut down and
//      then closes what the record still recognises. The record is the only thing standing
//      between a reap and the owner's own desktop Codex app, whose processes are severed in
//      exactly the same way and look identical.
//
// The arithmetic - which jobs are dead, what to kill, how to orphan a launch, which trees are
// orphaned - is pure and unit tested in codex-rescue.test.mjs and e2e-runs.test.mjs. This file is
// the part that talks to the OS and to the plugin.

import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { allProcesses, descendantsOf, orphanedCodexTrees } from './e2e-runs.mjs';

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

/** The broker: the one process in the family whose command line names the workspace it serves. */
export const BROKER_COMMAND = /app-server-broker\.mjs\b[^\n]*\bserve\b/;

/**
 * The workspace a broker was started for, out of its own command line.
 *
 * Read as everything between `--cwd` and the flag after it rather than as one whitespace-free
 * token: the plugin does not quote this argument, and a checkout path with a space in it would
 * otherwise come back cut in half - the same trap `rootOfCommand` documents in e2e-runs.mjs.
 */
export function workspaceOfBroker(command = '') {
  const paired = /--cwd\s+(.*?)\s+--(?:pid-file|log-file|endpoint)\b/.exec(command);
  const trailing = /--cwd\s+(.+?)\s*$/.exec(command);
  const found = (paired ?? trailing)?.[1];
  return found ? found.replace(/^"|"$/g, '') : null;
}

/** What a recorded process is, for a report a person reads. Never used to decide anything. */
export function labelProcess(command = '', name = '') {
  if (BROKER_COMMAND.test(command)) return 'the broker';
  if (/^codex\.exe$/i.test(name)) return 'codex.exe';
  if (/[/\\]codex\.js["']?\s+app-server/.test(command)) return 'the codex app-server';
  if (/[/\\]codex["']?\s+app-server\b/.test(command)) return 'the shell that starts codex';
  if (/mcp[/\\]+.*server\.mjs|@playwright[/\\]+mcp|mcp\.js/.test(command)) return 'an MCP server';
  if (/npx-cli\.js/.test(command)) return 'an npx shim for an MCP server';
  return name || 'a process this delegation started';
}

/**
 * WHEN TO LOOK AT THE PROCESS TABLE WHILE A DELEGATION IS STARTING.
 *
 * The family is not born all at once and it does not stay connected: measured on this machine,
 * the broker and its app-server start in the same second, the MCP servers arrive one to three
 * seconds later, and by the time anybody asks, half of them have dead parents - the broker starts
 * its app-server through a shell, and that shell exits. A snapshot is only worth taking while the
 * links are still there, and reading the whole table costs a PowerShell process, so the schedule
 * backs off instead of polling: often enough to catch the family being built, rarely enough that
 * a long launch does not spend its life enumerating processes.
 */
export const SNAPSHOT_AT_MS = [0, 1_000, 2_500, 5_000, 10_000, 20_000, 40_000];

/** The next snapshot due at `elapsed`, or null when the schedule has nothing left to say. */
export function snapshotDue(elapsedMs, taken) {
  const next = SNAPSHOT_AT_MS[taken];
  return next === undefined ? false : elapsedMs >= next;
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

// ── The process family a delegation owns ─────────────────────────────────────────────────────────
//
// Defect 4. Written beside the plugin's own `state.json` and `broker.json`, in the same job store,
// because a record that lives anywhere else is a second thing to keep in step with the jobs.

/** The ownership record, beside the plugin's `state.json` in the workspace's job store. */
const OWNERSHIP_FILE = 'owned-tree.json';

/**
 * The record's format version. Additive optional fields never bump it. A bump ships with its
 * migration; an unknown version degrades to READ-ONLY, and read-only here means the tree is never
 * a candidate - a record this code cannot read is not a proof of anything, and the whole point of
 * the record is that nothing is killed without one.
 */
const OWNERSHIP_VERSION = 1;

/**
 * How long a family gets to close itself after its broker has been asked to shut down.
 *
 * The broker's own path is: end the app-server's stdin, wait 50 ms, then tree-kill it; the
 * app-server's MCP servers then see their stdin close and exit in turn. That is a chain of small
 * timeouts rather than one, so the window has to cover the whole chain and no more - five seconds
 * is several times the measured teardown, and it is spent only when a tree is actually being
 * collected. Anything still alive at the end is closed from the record instead.
 */
export const GRACE_MS = 5_000;

/** The broker session the plugin records per workspace: its endpoint, its pid, its files. */
function brokerSession(dir) {
  const file = path.join(dir, 'broker.json');
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** The ownership record for one workspace, or null when there is none this code can read. */
export function readOwnership(dir) {
  const file = path.join(dir, OWNERSHIP_FILE);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed?.version === OWNERSHIP_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * What is still ours, out of what we knew and what we just saw.
 *
 * Two rules, and both of them only ever SHRINK the record. A process that has exited can never be
 * killed again, so it leaves. A pid whose start time no longer matches is a different process
 * wearing the same number, so it leaves too - carrying it forward is precisely how a record turns
 * into a licence to kill a stranger.
 */
export function mergeOwned(previous = [], observed = [], live = new Map()) {
  const out = new Map();
  for (const entry of [...previous, ...observed]) {
    if (!Number.isFinite(entry?.pid) || !Number.isFinite(entry?.createdMs)) continue;
    const now = live.get(entry.pid);
    if (!now || now.createdMs !== entry.createdMs) continue;
    out.set(`${entry.pid}:${entry.createdMs}`, {
      pid: entry.pid,
      createdMs: entry.createdMs,
      what: entry.what ?? labelProcess(now.command, now.name),
    });
  }
  return [...out.values()].sort((left, right) => left.createdMs - right.createdMs);
}

/**
 * Write down what this workspace's delegation is running: every pid WITH the time it started.
 *
 * Called while the launch is still happening and again on every poll, because the family is built
 * over the first seconds and its parent links are cut soon after (see `SNAPSHOT_AT_MS`). What is
 * seen while the links are alive stays in the record after they are gone, and that is the entire
 * mechanism - the record outlives the tree walk that produced it.
 *
 * Returns the record, or null when there is nothing to record: no broker yet, a process table
 * this platform cannot read (POSIX returns none, honestly, rather than guessing), or a broker pid
 * that does not look like a broker - which means the plugin's note is stale and a reused pid was
 * one step away from entering the record.
 */
export function recordOwnership(dir, { table = allProcesses(), jobIds = [], now = () => new Date().toISOString() } = {}) {
  if (table.length === 0) return null;
  const session = brokerSession(dir);
  const brokerPid = Number(session?.pid);
  if (!Number.isFinite(brokerPid)) return null;
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const broker = byPid.get(brokerPid);
  if (!broker || !BROKER_COMMAND.test(broker.command)) return null;

  const observed = [broker, ...descendantsOf([brokerPid], table)].map((p) => ({
    pid: p.pid,
    createdMs: p.createdMs,
    what: labelProcess(p.command, p.name),
  }));
  const previous = readOwnership(dir);
  const self = byPid.get(process.pid);
  const record = {
    version: OWNERSHIP_VERSION,
    workspace: workspaceOfBroker(broker.command) ?? previous?.workspace ?? dir,
    stateDir: dir,
    endpoint: session.endpoint ?? previous?.endpoint ?? null,
    broker: { pid: brokerPid, createdMs: broker.createdMs },
    // Only ever consulted for a record that names NO delegation - a launch that never got a job
    // id back. A finished session is not evidence about a running delegation: this wrapper
    // detaches the launch on purpose so the work survives the session that asked for it.
    launcher: previous?.launcher ?? (self ? { pid: self.pid, createdMs: self.createdMs } : null),
    jobs: [...new Set([...(previous?.jobs ?? []), ...jobIds])],
    recordedAt: now(),
    owned: mergeOwned(previous?.owned, observed, byPid),
  };
  writeFileSync(path.join(dir, OWNERSHIP_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

/**
 * How long a launch keeps looking for the family it just asked for.
 *
 * A JOB ID IS NOT A FAMILY. Measured on this machine: the launcher answers with the job still
 * `queued`, and the broker is only started when the job actually begins - so the record written
 * at the moment the id arrives names nothing at all, which is what happened on the first live
 * run of this code. Twenty seconds covers the ordinary queue wait without holding the caller up
 * when nothing is coming; a delegation that waits longer than that is recorded by the first poll
 * instead, and the family's links were measured still intact minutes later.
 */
const RECORD_WINDOW_MS = 20_000;

/** Write the record for a launch, waiting for the broker the job will be served by. */
async function recordLaunchedTree(dir, jobId) {
  const deadline = Date.now() + RECORD_WINDOW_MS;
  let first = null;
  while (Date.now() < deadline) {
    // Reading the process table costs a PowerShell process, so it is only read once there is a
    // broker to look for.
    if (existsSync(path.join(dir, 'broker.json'))) {
      const record = recordOwnership(dir, { jobIds: [jobId] });
      // Twice: the first record catches the broker, the second the MCP servers it starts a
      // second or two later, while every link is still there to be walked.
      if (record && first) return record;
      if (record) first = record;
    }
    await new Promise((resolve) => setTimeout(resolve, first ? 2_000 : 500));
  }
  return first;
}

/**
 * Forget a record that no longer names anything of ours, so the store does not fill up with dead
 * pids - and so a recycled one stops being reported for ever.
 *
 * IT ASKS THE SAME QUESTION THE DETECTOR DOES, not "is that pid alive". Measured on 2026-09-09,
 * 22 seconds after a cancelled delegation: one recorded MCP server's number had been handed to
 * `svchost.exe`. By liveness that record would have looked half-alive for as long as that service
 * ran; by identity it is what it is, which is over.
 */
export function forgetOwnership(dir, table = allProcesses()) {
  const record = readOwnership(dir);
  if (!record || table.length === 0) return false;
  const byPid = new Map(table.map((p) => [p.pid, p]));
  const stillOurs = (record.owned ?? []).some((entry) => byPid.get(entry.pid)?.createdMs === entry.createdMs);
  if (stillOurs) return false;
  rmSync(path.join(dir, OWNERSHIP_FILE), { force: true });
  return true;
}

/**
 * Give up on a launch that never produced a delegation, so its broker stops being protected by
 * the "somebody is still launching" clause. Refuses to touch a record that names a job: a
 * delegation that exists is judged by its own outcome, never by who is waiting for it.
 */
export function abandonLaunch(dir) {
  const record = readOwnership(dir);
  if (!record || (record.jobs ?? []).length > 0) return null;
  const abandoned = { ...record, launcher: null, abandonedAt: new Date().toISOString() };
  writeFileSync(path.join(dir, OWNERSHIP_FILE), `${JSON.stringify(abandoned, null, 2)}\n`, 'utf8');
  return abandoned;
}

/**
 * A recorder that respects `SNAPSHOT_AT_MS`: call `note()` as often as you like and it reads the
 * process table only when the schedule says a snapshot is due.
 */
export function ownershipRecorder(dir, { started = Date.now(), jobIds = [] } = {}) {
  let taken = 0;
  const ids = new Set(jobIds);
  return {
    add: (id) => id && ids.add(id),
    note() {
      if (!existsSync(dir) || !snapshotDue(Date.now() - started, taken)) return null;
      taken += 1;
      try {
        return recordOwnership(dir, { jobIds: [...ids] });
      } catch {
        // Recording is never allowed to break a launch. A missing record costs memory later; a
        // launch that throws here costs the delegation itself.
        return null;
      }
    },
  };
}

/**
 * Every root the plugin keeps job state under, so a delegation started under a different
 * environment is still found. `CLAUDE_PLUGIN_DATA` is set inside a Claude Code session and unset
 * in a plain shell, and the two point at different directories - the leaked trees measured on
 * 2026-09-09 lived under the first while a sweep run from a terminal looked only at the second.
 */
export function stateRoots() {
  const roots = [path.join(tmpdir(), 'codex-companion')];
  if (process.env.CLAUDE_PLUGIN_DATA) roots.unshift(path.join(process.env.CLAUDE_PLUGIN_DATA, 'state'));
  // A plugin's data directory is named after the plugin, and this machine has carried two of
  // them (`codex-inline`, then `codex-openai-codex`). Whatever the env says today, every sibling
  // state root is still a place a delegation can be recorded in.
  const pluginData = path.join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.claude', 'plugins', 'data');
  if (existsSync(pluginData)) {
    for (const entry of readdirSync(pluginData, { withFileTypes: true })) {
      if (entry.isDirectory()) roots.push(path.join(pluginData, entry.name, 'state'));
    }
  }
  return [...new Set(roots)].filter((root) => existsSync(root));
}

/** Every workspace the plugin has state for, so a job orphaned in a closed session is still found. */
function allStateDirs() {
  return stateRoots().flatMap((root) => readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name)));
}

/**
 * What the orphan detector judges: one record per workspace that has an ownership record, with
 * every delegation in that workspace and whether it has reached an outcome.
 *
 * The job statuses are read from the plugin's own state and RECONCILED first, so a delegation
 * whose process is gone counts as finished rather than holding its family for ever.
 */
export function delegationRecords() {
  const records = [];
  for (const dir of allStateDirs()) {
    const owned = readOwnership(dir);
    if (!owned) continue;
    let jobs;
    try {
      jobs = reconciledJobs(dir).map((job) => ({ id: job.id, finished: TERMINAL.has(job.status) }));
    } catch {
      // A job store this wrapper cannot read (a future version, a half-written file) is not a
      // licence to close anything: an unreadable status is treated as work in progress.
      jobs = [{ id: '<unreadable job state>', finished: false }];
    }
    records.push({ ...owned, jobs });
  }
  return records;
}

/** `pipe:\\.\pipe\x` and `unix:/tmp/x` both address a socket; strip the scheme and connect. */
export function endpointPath(endpoint) {
  return typeof endpoint === 'string' ? endpoint.replace(/^(pipe|unix):/, '') : null;
}

/**
 * Ask a broker to close itself the way the plugin does - `broker/shutdown` over its own endpoint.
 *
 * This is the graceful half, and it is worth more than politeness: the broker holds a live handle
 * to the `codex.js app-server` it started, so it can close the one link in the family that no
 * outside walk can follow any more. Nothing here fails loudly - a broker that has already gone,
 * or never listened, is exactly the case the kill below covers.
 */
export function brokerShutdown(endpoint, timeoutMs = GRACE_MS) {
  const target = endpointPath(endpoint);
  if (!target) return Promise.resolve('no endpoint recorded');
  return new Promise((resolve) => {
    const socket = net.createConnection({ path: target });
    const finish = (outcome) => { socket.destroy(); resolve(outcome); };
    const timer = setTimeout(() => finish('no answer'), timeoutMs);
    timer.unref?.();
    socket.setEncoding('utf8');
    socket.on('connect', () => socket.write(`${JSON.stringify({ id: 1, method: 'broker/shutdown', params: {} })}\n`));
    socket.on('data', () => { clearTimeout(timer); finish('shut itself down'); });
    socket.on('error', (error) => { clearTimeout(timer); finish(`endpoint gone (${error.code ?? 'error'})`); });
    socket.on('close', () => { clearTimeout(timer); resolve('endpoint closed'); });
  });
}

/** Wait for pids to go, up to `ms`. Signal 0 only - cheap, and identity is re-checked after. */
async function waitForExit(pids, ms) {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!pids.some((pid) => processAlive(pid))) return true;
    await new Promise((done) => setTimeout(done, 250));
  }
  return false;
}

/**
 * Collect the process families of delegations that are over. The graceful ask first, then the
 * recorded remainder.
 *
 * THE ORDER IS THE SAFETY ARGUMENT. The tree is proved orphaned from the record BEFORE anything
 * is asked to stop, and proved AGAIN from a freshly read process table after the grace window,
 * so every pid that is finally killed has had its start time checked against the record within
 * milliseconds. Anything that fails either check is kept and named. Nothing is matched by
 * executable name, nothing is killed on a pattern, and a process belonging to the owner's desktop
 * Codex app is refused by `orphanedCodexTrees` even if a record somehow names it.
 */
export async function reapTrees({ log = console.log } = {}) {
  const records = delegationRecords();
  const table = allProcesses();
  const before = orphanedCodexTrees(table, records);
  const collecting = before.filter((tree) => tree.kill.length > 0);
  const kept = before.flatMap((tree) => tree.kept);
  if (collecting.length === 0) {
    // Nothing to close, but a record whose family has gone some other way - a cancel that took
    // the tree with it, a machine that was restarted - is finished with, and saying so here is
    // what stops every later sweep re-reading it.
    for (const tree of before) if (tree.stateDir) forgetOwnership(tree.stateDir, table);
    return { closed: 0, trees: [], kept };
  }

  for (const tree of collecting) {
    const said = await brokerShutdown(tree.endpoint);
    const quiet = await waitForExit(tree.kill.map((p) => p.pid), GRACE_MS);
    log(`  ${tree.workspace}: asked the broker to shut down - ${said}${quiet ? ', and the family went with it' : ''}`);
  }

  // Re-derive from the machine as it is NOW: the graceful step has changed it, and every kill
  // below is allowed by a record that was checked against this table, not the earlier one.
  const after = orphanedCodexTrees(allProcesses(), records);
  let closed = 0;
  for (const tree of after) {
    for (const target of tree.kill) {
      const plan = killPlan(target.pid);
      const run = spawnSync(plan.command, plan.args, { encoding: 'utf8', shell: false, windowsHide: true });
      if (run.status === 0) closed += 1;
      log(`    closed pid ${target.pid} (${target.what})${run.status === 0 ? '' : ` - taskkill said: ${(run.stderr || run.stdout || '').trim()}`}`);
    }
    // A record that names nothing of ours any more has nothing left to say, and leaving it behind
    // would have every later sweep re-read a list of dead pids.
    if (tree.stateDir) forgetOwnership(tree.stateDir);
  }
  return { closed, trees: collecting, kept: [...kept, ...after.flatMap((tree) => tree.kept)] };
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

  // Collect whatever the last delegation left behind before starting another family. A launch is
  // the one moment this wrapper is certainly running, so it is where an orchestrator that died
  // mid-flight gets cleaned up after - see `reap`. It reports to stderr because stdout is the
  // launch's JSON and callers parse it.
  const dir = await stateDir(cwd);
  await reapTrees({ log: (line) => process.stderr.write(`${line}\n`) });

  const scriptArgs = [
    'task', '--background', '--json', '--cwd', cwd, '--prompt-file', promptFile, ...flags,
  ];
  const relay = spawn(
    process.execPath,
    relayArgs({ self: fileURLToPath(import.meta.url), script: companionScript(), outFile, scriptArgs }),
    { cwd, detached: true, stdio: 'ignore', windowsHide: true },
  );
  relay.unref();

  // The family is built during this wait, and its parent links are cut during it too, so this is
  // the only window in which some of it can be seen at all (`SNAPSHOT_AT_MS`).
  const recorder = ownershipRecorder(dir);
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    recorder.note();
    if (existsSync(outFile)) {
      const raw = readFileSync(outFile, 'utf8');
      const start = raw.indexOf('{');
      const end = raw.lastIndexOf('}');
      if (start !== -1 && end > start) {
        try {
          const payload = JSON.parse(raw.slice(start, end + 1));
          if (payload.jobId) {
            // Not `recorder.note()`: the schedule may not be due, and a record that does not name
            // the delegation can never be judged finished later.
            await recordLaunchedTree(dir, payload.jobId);
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
  // THE LAUNCH TIMED OUT, which is the leak nobody sees: a broker may well be running, and no job
  // id ever came back to name it. Saying so in the record is what lets it be collected - until
  // then the sweep keeps the tree, because a launcher that is still alive may yet be starting
  // something. This process has just stopped waiting, so it is no longer that launcher.
  abandonLaunch(dir);
  await reapTrees({ log: (line) => process.stderr.write(`${line}\n`) });
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
  // A second delegation in the same workspace adds MCP servers to the SAME `codex.exe` minutes
  // after the launch window closed (measured: two jobs 100 s apart, one family), so the record
  // keeps being brought up to date for as long as anybody is watching.
  const recorder = ownershipRecorder(dir);

  for (;;) {
    recorder.note();
    const job = findJob(newestFirst(reconciledJobs(dir)), reference);
    if (TERMINAL.has(job.status)) {
      console.log(summarize(job));
      // SUCCESS AND FAILURE ARE THE SAME EXIT HERE. A completed delegation leaves exactly the
      // family a failed one does, and the leak measured on 2026-09-09 was three COMPLETED jobs.
      await reportReap(await reapTrees());
      return job.status === 'completed' ? 0 : 1;
    }
    // A STALL AND A POLL TIMEOUT REAP NOTHING, deliberately. Both mean "no outcome yet", and a
    // model can think for five minutes without writing a log line. The delegation is detached on
    // purpose so it survives the session watching it; killing it here would destroy work that is
    // still running, to save memory it is still using.
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
  // Cancelling used to kill the worker and leave the family: the taskkill above walks a parent
  // chain that was severed seconds after the launch, so it reached one process out of ten.
  await reportReap(await reapTrees());
  return 0;
}

/**
 * Clear the job records a dead process left behind, and collect the process families that
 * delegations have finished with.
 *
 * THIS IS WHAT MAKES THE RECORD WORTH WRITING. Reaping on the way out of a delegation covers the
 * ordinary exits; an orchestrator that is killed between the two has no way to clean up after
 * itself, and only the record on disk can finish the job. So `launch` runs this first, every
 * time: whatever the last run failed to collect is collected before the next family is started.
 */
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
  await reportReap(await reapTrees());
  return 0;
}

/** What a reap did, in the lines the row's TRAPS ask for: what closed, and what stayed and why. */
async function reportReap(result) {
  if (!result) return;
  if (result.closed > 0) {
    console.log(`Closed ${result.closed} process(es) from ${result.trees.length} finished delegation tree(s).`);
  } else if (result.trees.length > 0) {
    console.log(`${result.trees.length} finished delegation tree(s) closed themselves when the broker shut down.`);
  }
  for (const { pid, why } of result.kept) console.log(`  kept pid ${pid} - ${why}`);
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
