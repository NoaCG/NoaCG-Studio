#!/usr/bin/env node
// THE CODEX DELEGATION CHANNEL - launch, watch, cancel and reap Codex background jobs.
//
//   node scripts/codex-rescue.mjs launch "<prompt>" [--write] [--model m] [--effort e] [--resume]
//   node scripts/codex-rescue.mjs status [<jobId>] [--all] [--json]
//   node scripts/codex-rescue.mjs poll <jobId> [--timeout-seconds 240]
//   node scripts/codex-rescue.mjs result <jobId> [--json]
//   node scripts/codex-rescue.mjs cancel <jobId>
//   node scripts/codex-rescue.mjs reap [--all-workspaces] [--workspace <path>]
//                                       clear jobs whose process died, and close the process
//                                       family of every delegation that has finished with it -
//                                       `--workspace` narrows that to one checkout's delegations,
//                                       which is what a worktree removal asks for
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
//      AND A DELEGATION LAUNCHED BEFORE THAT FIX EXISTED HAS NO RECORD AT ALL - measured
//      2026-09-10, hours after the fix landed, with free RAM still under 2 GB. Two families,
//      537 MB, left by delegations that finished at 23:22 and 23:23 the night before. Both were
//      launched through this wrapper, from worktrees whose checkouts were forked before defect
//      4's fix merged, so nothing ever wrote the record every later sweep needs. There is no
//      version of this that a better call site fixes: with no record there is no candidate.
//      `adoptableBrokers` covers it, and it is allowed to because it never kills anything - it
//      asks the plugin's own broker, over the endpoint the plugin itself wrote down, to close
//      the family it still holds a live handle to. The desktop app has no broker and no job
//      store, so it cannot be reached this way even in principle.

// So a reap now has two halves, and confusing them is the one way this file becomes dangerous:
// the RECORD decides every kill and always will, while the broker's ENDPOINT decides the
// graceful ask and needs no record.
//
// The arithmetic - which jobs are dead, what to kill, how to orphan a launch, which trees are
// orphaned, which brokers may be asked - is pure and unit tested in codex-rescue.test.mjs and
// e2e-runs.test.mjs. This file is the part that talks to the OS and to the plugin.

import { spawn, spawnSync } from 'node:child_process';
import {
  closeSync, existsSync, mkdtempSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync,
} from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  allProcesses, descendantsOf, orphanedCodexTrees, underDesktopCodex, withinRoot,
} from './e2e-runs.mjs';

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

/**
 * THE USAGE LIMIT READS AS A CRASH, AND IS NOT ONE. When Codex runs out of its account's usage
 * mid-job, the plugin records the job `failed/failed`, the same words it uses for a worker that
 * died - but the work may be finished. Row CF, 2026-09-10, job task-mtw1bety-31w06y: Codex had
 * already reported the full build green, hit its 5-hour limit during one last build, and `poll`
 * said failed/failed over a tree that was complete and correct. The only place the difference is
 * written down is the job's own log, whose last error line read
 * `Codex error: You’ve hit your usage limit. ... try again at 4:05 AM.`
 *
 * Returns that line from the log's tail, without its timestamp, or null. Only a line Codex marks
 * as its own error counts, so a job whose OUTPUT merely talks about usage limits is not misread.
 */
export function usageLimitLine(logText) {
  const lines = String(logText ?? '').split(/\r?\n/);
  for (let index = lines.length - 1; index >= Math.max(0, lines.length - USAGE_LIMIT_TAIL_LINES); index -= 1) {
    if (/\bCodex error:.*\busage limit\b/i.test(lines[index])) return lines[index].replace(/^\[[^\]]*\]\s*/, '').trim();
  }
  return null;
}

/** How far back from the end of a log the usage-limit error is looked for. It is the last word. */
const USAGE_LIMIT_TAIL_LINES = 40;

/** The usage-limit line of a job's log, or null when there is no log or no such line. */
function usageLimitIn(logFile) {
  if (!logFile || !existsSync(logFile)) return null;
  return usageLimitLine(readFileSync(logFile, 'utf8'));
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
  // Bounded by the NEXT FLAG, whichever it is, or by the end of the line. Naming the flags the
  // plugin emits today (`--pid-file`, `--log-file`, `--endpoint`) would read one new flag as part
  // of the path, and a workspace that is really `C:/…/worktree --new-flag value` matches no
  // worktree - so every scoped reap would silently skip that family and call it not busy.
  const found = /--cwd\s+(.*?)(?:\s+--[a-z]|\s*$)/.exec(command)?.[1];
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

/**
 * And once the family is built, a slow heartbeat for as long as anybody is watching.
 *
 * A SECOND DELEGATION IN THE SAME WORKSPACE ADDS TO THE SAME FAMILY, minutes later - measured,
 * two jobs 100 s apart sharing one `codex.exe` and one broker. The backoff above is spent inside
 * the first forty seconds, so without this the record would stop growing exactly where the
 * comment on the poll recorder says it keeps up. A minute apart costs one process listing per
 * minute of watching.
 */
export const SNAPSHOT_TAIL_MS = 60_000;

/** Is a snapshot due - on the backoff while it lasts, on the heartbeat afterwards? */
export function snapshotDue(elapsedMs, taken, sinceLastMs = Infinity) {
  const next = SNAPSHOT_AT_MS[taken];
  return next === undefined ? sinceLastMs >= SNAPSHOT_TAIL_MS : elapsedMs >= next;
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
    return {
      ...merged,
      logIdleSeconds: logIdleSeconds(merged.logFile),
      // Only a failed job is asked: a running one has not stopped, and a completed one did not fail.
      usageLimit: merged.status === 'failed' ? usageLimitIn(merged.logFile) : null,
    };
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

/** A process table by pid - the lookup every identity check in this section starts from. */
function indexByPid(table) {
  return new Map(table.map((entry) => [entry.pid, entry]));
}

/** The ownership record on disk. One writer, so a reader never meets half a shape. */
function writeOwnership(dir, record) {
  writeFileSync(path.join(dir, OWNERSHIP_FILE), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return record;
}

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
  const byPid = indexByPid(table);
  const previous = readOwnership(dir);
  const session = brokerSession(dir);
  const brokerPid = Number(session?.pid);
  const claimed = Number.isFinite(brokerPid) ? byPid.get(brokerPid) : null;
  // The broker is identified TWICE: the plugin's note says which pid, and the process itself has
  // to look like a broker. A pid alone would let a reused number into the record, and the record
  // is what every later kill is allowed by.
  const broker = claimed && BROKER_COMMAND.test(claimed.command) ? claimed : null;

  // EVERY ROOT, NOT JUST THE BROKER. The broker is the first thing recorded and often the first
  // thing to exit - it is what a graceful shutdown closes - and expanding only from it would
  // leave the app-server and its MCP servers, the expensive half, unrecorded the moment the
  // broker was gone. Growing from everything already recorded keeps the family in the record
  // even after its root has left it.
  const roots = broker ? [broker] : [];
  for (const entry of previous?.owned ?? []) {
    const live = byPid.get(entry.pid);
    if (live && live.createdMs === entry.createdMs && live !== broker) roots.push(live);
  }
  if (roots.length === 0) return null;

  const observed = [...roots, ...descendantsOf(roots.map((p) => p.pid), table)].map((p) => ({
    pid: p.pid,
    createdMs: p.createdMs,
    what: labelProcess(p.command, p.name),
  }));
  const self = byPid.get(process.pid);
  const record = {
    version: OWNERSHIP_VERSION,
    // Null rather than the state directory when the broker's command line does not say: a record
    // whose workspace is a temp path can never match a worktree-scoped sweep, so guessing one
    // would quietly put that family out of every scoped reap's reach.
    workspace: (broker && workspaceOfBroker(broker.command)) ?? previous?.workspace ?? null,
    stateDir: dir,
    endpoint: session?.endpoint ?? previous?.endpoint ?? null,
    broker: broker ? { pid: brokerPid, createdMs: broker.createdMs } : previous?.broker ?? null,
    // Only ever consulted for a record that names NO delegation - a launch that never got a job
    // id back. A finished session is not evidence about a running delegation: this wrapper
    // detaches the launch on purpose so the work survives the session that asked for it.
    //
    // An EXPLICIT null is a decision (`abandonLaunch`) and is kept; a missing field is not.
    launcher: previous && 'launcher' in previous
      ? previous.launcher
      : (self ? { pid: self.pid, createdMs: self.createdMs } : null),
    jobs: [...new Set([...(previous?.jobs ?? []), ...jobIds])],
    recordedAt: now(),
    owned: mergeOwned(previous?.owned, observed, byPid),
  };
  return writeOwnership(dir, record);
}

/**
 * How long a launch keeps looking for the family it just asked for before handing the job id
 * back and leaving the rest to the poll.
 *
 * A JOB ID IS NOT A FAMILY. Measured on this machine: the launcher answers with the job still
 * `queued`, and the broker is only started when the job actually begins - so the record written
 * at the moment the id arrives names nothing at all, which is what the first live run of this
 * code did. Ten seconds covered every launch measured here (the broker appeared within five),
 * and it is a CAP, not a wait: the loop leaves as soon as it has the family. A job that queues
 * for longer than that is recorded by the first poll instead, and the family's links were
 * measured still intact minutes later - so the caller is not made to sit through somebody
 * else's delegation to buy something the next command gets for free.
 */
const RECORD_WINDOW_MS = 10_000;

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
      if (record) {
        if (first) return record;
        first = record;
      }
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
  const byPid = indexByPid(table);
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
  return writeOwnership(dir, { ...record, launcher: null, abandonedAt: new Date().toISOString() });
}

/**
 * A recorder that respects the snapshot schedule: call `note()` as often as you like and it reads
 * the process table only when `SNAPSHOT_AT_MS` - or, past it, the `SNAPSHOT_TAIL_MS` heartbeat -
 * says a snapshot is due.
 */
export function ownershipRecorder(dir, { started = Date.now(), jobIds = [] } = {}) {
  let taken = 0;
  let lastAt = -Infinity;
  const ids = new Set(jobIds);
  return {
    add: (id) => id && ids.add(id),
    note() {
      if (!snapshotDue(Date.now() - started, taken, Date.now() - lastAt)) return null;
      // NOTHING TO RECORD IS ANSWERED FROM DISK, not from the process table. Reading the table
      // costs a PowerShell process every time, and until the job leaves the queue there is no
      // broker and no record - which is the majority of the calls on this path, on the machine
      // this whole mechanism exists to keep memory free on.
      if (!existsSync(path.join(dir, 'broker.json')) && !readOwnership(dir)) return null;
      taken += 1;
      lastAt = Date.now();
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
  for (const entry of dirEntries(pluginData)) {
    if (entry.isDirectory()) roots.push(path.join(pluginData, entry.name, 'state'));
  }
  return [...new Set(roots)].filter((root) => existsSync(root));
}

/**
 * A directory's entries, or none.
 *
 * These directories belong to another program, on a machine where sessions come and go: one can
 * be deleted between the `existsSync` and the read, or refuse a read outright. THE QUEUE RUNNER
 * CALLS ALL OF THIS from its poll loop, and a scheduler that dies because somebody else's
 * temporary directory moved is a worse failure than the memory this reclaims.
 */
function dirEntries(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Every workspace the plugin has state for, so a job orphaned in a closed session is still found. */
function allStateDirs() {
  return stateRoots().flatMap((root) => dirEntries(root)
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(root, entry.name)));
}

/**
 * Has this job reached an outcome? Both walkers below ask it, and both ask it the same way: the
 * plugin's status, corrected in memory by `reconcileJob` so a job whose worker is gone counts as
 * over rather than holding its family for ever. The verdict is deliberately not persisted here -
 * see the note on `delegationRecords` about two processes writing one `state.json`.
 */
function jobIsOver(job) {
  return TERMINAL.has(reconcileJob(job)?.status ?? job.status);
}

/**
 * What the orphan detector judges: one record per workspace that has an ownership record, with
 * every delegation in that workspace and whether it has reached an outcome.
 *
 * The job statuses are read from the plugin's own state and reconciled IN MEMORY, so a delegation
 * whose process is gone counts as finished rather than holding its family for ever.
 *
 * READ-ONLY, DELIBERATELY. `reconciledJobs` persists what it works out, and this function is
 * called from the QUEUE RUNNER's poll loop as well as from here - two unlocked read-modify-writes
 * of the same `state.json`, from two processes, is a lost update or a half-written file. The
 * commands that own a job (`status`, `poll`, `cancel`, `reap`) still persist their verdict; a
 * sweep only needs to know, not to say.
 */
export function delegationRecords() {
  const records = [];
  for (const dir of allStateDirs()) {
    const owned = readOwnership(dir);
    if (!owned) continue;
    let jobs;
    try {
      jobs = readState(dir).jobs.map((job) => ({ id: job.id, finished: jobIsOver(job) }));
    } catch {
      // A job store this wrapper cannot read (a future version, a half-written file) is not a
      // licence to close anything: an unreadable status is treated as work in progress.
      jobs = [{ id: '<unreadable job state>', finished: false }];
    }
    records.push({ ...owned, jobs });
  }
  return records;
}

/**
 * Delegations that are over, whose broker is still listening, and which NO ownership record
 * claims - the leak a better call site cannot reach.
 *
 * The record is written by the launch, so a delegation launched from a checkout that predates
 * `recordOwnership` has none, and neither has one whose launch was killed before the first
 * snapshot. Either way the sweep sees no candidate and the family runs until the machine is
 * restarted. Measured 2026-09-10: two such families, 537 MB, hours after the reaper had landed.
 *
 * WHAT MAKES THIS SAFE IS THAT IT PRODUCES NO KILL LIST. The caller may do exactly one thing with
 * the answer - ask that broker to shut down over its own endpoint - and the broker then closes
 * the family through the live handle it holds, which is the one link no outside walk can follow.
 * Nothing is matched by executable name, nothing is signalled, and the failure mode of getting
 * this wrong is a stranger's socket refusing a connection rather than a stranger's process dying.
 *
 * The four conditions, each of which is a way of being sure the broker is ours to ask:
 *
 *   1. THE PLUGIN WROTE THE ENDPOINT DOWN, in its own `broker.json`, in its own job store. That
 *      file is the self-identifying record here, and it is why no ownership record is needed.
 *   2. THE PID IS STILL A BROKER. `broker.json` outlives the process it names, so the pid alone
 *      would let a recycled number be addressed; the command line has to say `app-server-broker`
 *      as well. (The endpoint would refuse a stranger anyway - this refuses it one step earlier.)
 *   3. THE WORK IS OVER. Every job in that workspace has reached an outcome, and there is at
 *      least one - a workspace with no job yet is mid-launch, and the launch is about to need
 *      that broker.
 *   4. IT IS NOT THE DESKTOP CODEX APP. It cannot be - the app runs no broker and keeps no job
 *      store here - and the check costs nothing, so the promise in defect 4 stays absolute
 *      rather than merely true today.
 */
export function adoptableBrokers(processes, sessions = []) {
  const byPid = indexByPid(processes);
  const out = [];
  for (const session of sessions) {
    if (!endpointPath(session?.endpoint)) continue;
    const jobs = session.jobs ?? [];
    if (jobs.length === 0 || jobs.some((over) => !over)) continue;
    const live = byPid.get(Number(session.brokerPid));
    if (!live || !BROKER_COMMAND.test(live.command ?? '')) continue;
    if (underDesktopCodex(live.pid, processes)) continue;
    out.push({
      stateDir: session.stateDir ?? null,
      endpoint: session.endpoint,
      // From the BROKER's command line, falling back to what the jobs say: the state directory's
      // name is a hash of the workspace and cannot be turned back into a path, and a workspace
      // this sweep guesses wrong is one a scoped reap silently skips.
      workspace: workspaceOfBroker(live.command) ?? session.workspace ?? '<unknown workspace>',
      pid: live.pid,
    });
  }
  return out;
}

/**
 * The other half of the same question, and the one a caller ABOUT TO DELETE A DIRECTORY needs:
 * unrecorded delegations that have NOT finished.
 *
 * `delegationRecords` answers "is anything still working here" from the ownership record, so it
 * cannot see a workspace that has none - and a scoped reap then exits 0, which a worktree removal
 * reads as "nothing is running here" and deletes the directory a `codex.exe` is standing in. The
 * same launches that leak a family are the ones that leak this answer, so both are fixed here.
 *
 * NO BROKER CHECK, DELIBERATELY, and this is the one place in the file that leans the other way.
 * Everything that KILLS demands proof; this only refuses, so it takes the plugin's word. The job
 * statuses have already been reconciled against the OS - a job whose worker is gone reads as
 * failed - so what is left unfinished is work the plugin still believes in, and "I am not sure"
 * has to mean "keep the worktree".
 */
export function unrecordedWorking(sessions = []) {
  return sessions
    .filter((session) => (session?.jobs ?? []).some((over) => !over))
    .map((session) => ({ stateDir: session.stateDir ?? null, workspace: session.workspace ?? null }));
}

/**
 * The disk half of `adoptableBrokers`: every workspace whose broker the ownership record does not
 * claim, with its jobs reduced to "is it over".
 *
 * Read-only for the same reason `delegationRecords` is - `reconcileJob` is consulted in memory
 * and its verdict is not persisted, because the queue runner reads this store from another
 * process and two unlocked read-modify-writes of one `state.json` lose an update.
 */
function unclaimedSessions() {
  const sessions = [];
  for (const dir of allStateDirs()) {
    // A record beats this path in both directions: it can prove a kill, and it is written by the
    // launch that is still going, so overriding it here would close a family mid-delegation.
    if (readOwnership(dir)) continue;
    const session = brokerSession(dir);
    if (!session) continue;
    try {
      const jobs = readState(dir).jobs;
      sessions.push({
        stateDir: dir,
        endpoint: session.endpoint ?? null,
        brokerPid: Number(session.pid),
        // The plugin stamps every job with the directory the launch was made in, which is the
        // only place a workspace can be read from when the broker process has already gone -
        // the state directory's own name is a hash, and a hash does not come back.
        workspace: jobs.find((job) => job.workspaceRoot)?.workspaceRoot ?? null,
        jobs: jobs.map(jobIsOver),
      });
    } catch {
      // A job store this wrapper cannot read says nothing about whether the work is over, and
      // "nothing is over" is the direction that leaves a delegation running.
    }
  }
  return sessions;
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

/**
 * Is a delegation in this sweep's scope still working?
 *
 * The detector already knows - it is why the tree was kept - and this is the one thing it knows
 * that a caller ABOUT TO DELETE THAT DIRECTORY cannot afford to miss. A worktree removal reads it
 * and stands down; nothing else in this file consults it.
 */
function stillWorking(trees) {
  return trees.some((tree) => (tree.unfinished ?? 0) > 0);
}

/** One line per kept pid, whichever pass reported it: the same tree is judged twice per reap. */
function namedOnce(trees) {
  const byPid = new Map();
  for (const tree of trees) for (const entry of tree.kept) byPid.set(entry.pid, entry);
  return [...byPid.values()];
}

/**
 * Add the family a reap has just resolved to the record, so what is about to be closed is
 * written down before anything is closed. Needs no broker: the entries have already been proved
 * against this table by the detector.
 */
function rememberExpanded(dir, entries, table) {
  const record = readOwnership(dir);
  if (!record) return;
  const byPid = indexByPid(table);
  const owned = mergeOwned(record.owned, entries.map((entry) => ({
    pid: entry.pid,
    createdMs: entry.createdMs,
    what: entry.what,
  })), byPid);
  writeOwnership(dir, { ...record, owned });
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
 *
 * `workspace` narrows the sweep to the delegations of ONE checkout, which is what a worktree
 * removal needs: that worktree's family is about to lose the directory it is running in, and
 * nobody else's is any of its business. A delegation launched from a SUBDIRECTORY of it counts -
 * the recorded workspace is the directory the launch was made in, so `<worktree>/cli` is this
 * worktree's delegation and an equality test would quietly leave it running.
 *
 * `busy` in the result says a delegation in scope has NOT finished, which is the one thing a
 * caller about to delete that directory has to know. It is answered from the records AND from the
 * workspaces no record claims, because a delegation the sweep cannot see is exactly the one whose
 * absence would read as an empty directory.
 */
export async function reapTrees({ log = console.log, workspace = null } = {}) {
  const records = delegationRecords()
    .filter((record) => !workspace || withinRoot(record.workspace, workspace));

  // THE UNCLAIMED WORKSPACES GO FIRST, and they are the whole reason a reap is worth running on
  // a machine that has been delegating for longer than this file has existed. They own no kill
  // list (`adoptableBrokers` cannot produce one), so all that happens here is the ask.
  // `unclaimedBusy` is the same blind spot seen from the other side: a RUNNING delegation with no
  // record, which the records below cannot see either, and which a worktree removal must not read
  // as an empty directory.
  let table = allProcesses();
  const { tried, closed: unrecordedClosed, busy: unclaimedBusy } =
    await askUnclaimedBrokers({ log, workspace, table });
  // A broker that was asked to close may have taken a dozen processes with it, so the records
  // below are judged against the machine as it is AFTER the ask, never the table it was planned
  // from. Only re-read when something was actually asked: this runs in front of every launch,
  // and a process listing costs a PowerShell process.
  if (tried > 0) table = allProcesses();

  const before = orphanedCodexTrees(table, records);
  const collecting = before.filter((tree) => tree.kill.length > 0);
  if (collecting.length === 0) {
    // Nothing to close, but a record whose family has gone some other way - a cancel that took
    // the tree with it, a machine that was restarted - is finished with, and saying so here is
    // what stops every later sweep re-reading it.
    for (const tree of before) if (tree.stateDir) forgetOwnership(tree.stateDir, table);
    return {
      closed: 0,
      unrecordedClosed,
      trees: [],
      kept: namedOnce(before),
      busy: unclaimedBusy || stillWorking(before),
    };
  }

  // WRITE THE FAMILY DOWN BEFORE CLOSING ANY OF IT. The kill list is wider than the record - it
  // includes everything running below what was recorded - and the broker is usually the first to
  // go. If the reap stopped here, or the broker exited on its own before the next sweep, a
  // record still naming only the broker would be forgotten as dead while the app-server and its
  // MCP servers, the expensive half, went on running with nothing left that could ever claim
  // them. Recording the expansion first is what keeps that from becoming permanent.
  for (const tree of collecting) if (tree.stateDir) rememberExpanded(tree.stateDir, tree.kill, table);

  // Every broker is asked at once. Sequentially, a machine with three leaked families - the
  // number measured on 2026-09-09 - would put half a minute in front of the launch that swept it.
  await Promise.all(collecting.map(async (tree) => {
    const said = await brokerShutdown(tree.endpoint);
    const quiet = await waitForExit(tree.kill.map((p) => p.pid), GRACE_MS);
    log(`  ${tree.workspace}: asked the broker to shut down - ${said}${quiet ? ', and the family went with it' : ''}`);
  }));

  // Re-derive from the machine as it is NOW: the graceful step has changed it, and every kill
  // below is allowed by a record that was checked against this table, not the earlier one.
  const settled = allProcesses();
  const after = orphanedCodexTrees(settled, records);
  let closed = 0;
  let refused = 0;
  for (const tree of after) {
    for (const target of tree.kill) {
      const plan = killPlan(target.pid);
      const run = spawnSync(plan.command, plan.args, { encoding: 'utf8', shell: false, windowsHide: true });
      if (run.status === 0) {
        closed += 1;
        log(`    closed pid ${target.pid} (${target.what})`);
      } else {
        refused += 1;
        log(`    could NOT close pid ${target.pid} (${target.what}) - taskkill said: ${(run.stderr || run.stdout || '').trim()}`);
      }
    }
  }
  // One table read for the whole loop: `forgetOwnership` would otherwise enumerate the machine
  // again per tree, and the kills above have already happened.
  const settledAfterKills = closed > 0 ? allProcesses() : settled;
  for (const tree of after) if (tree.stateDir) forgetOwnership(tree.stateDir, settledAfterKills);
  return {
    closed,
    refused,
    unrecordedClosed,
    trees: collecting,
    kept: namedOnce([...before, ...after]),
    busy: unclaimedBusy || stillWorking(after),
  };
}

/**
 * Everything the ownership record cannot answer for: ask the brokers whose delegations are over
 * to close themselves, and report whether an unrecorded delegation is still working in scope.
 *
 * The counterpart to the record-driven half above, and deliberately the smaller of the two: it
 * asks, waits, and reports. It never kills. If a broker will not go, its family stays and the
 * line says so - which is the honest answer, because without a record there is nothing here that
 * could prove which app-server belonged to it.
 *
 * `tried` is how many brokers were addressed, which is what tells the caller its process table is
 * now stale; `closed` is how many actually went, so a report can tell "asked and nothing
 * happened" from "asked and the memory came back"; `busy` is the refusal a worktree removal reads.
 */
async function askUnclaimedBrokers({ log = console.log, workspace = null, table = [] } = {}) {
  const unclaimed = unclaimedSessions();
  const inScope = (session) => !workspace || withinRoot(session.workspace, workspace);

  const working = unrecordedWorking(unclaimed).filter(inScope);
  for (const session of working) {
    log(`  ${session.workspace ?? session.stateDir}: a delegation with no ownership record has `
      + 'not finished - nothing here is closed, and this workspace counts as busy');
  }
  const busy = working.length > 0;

  const sessions = adoptableBrokers(table, unclaimed).filter(inScope);
  if (sessions.length === 0) return { tried: 0, closed: 0, busy };

  // All at once, for the same reason the record-driven shutdowns are: this runs in front of every
  // launch, and a machine carrying several of these would otherwise put a grace window per family
  // between the caller and its delegation.
  const went = await Promise.all(sessions.map(async (session) => {
    const said = await brokerShutdown(session.endpoint);
    const gone = await waitForExit([session.pid], GRACE_MS);
    log(`  ${session.workspace}: no ownership record, every delegation finished - asked its `
      + `broker (pid ${session.pid}) to shut down: ${said}`
      + `${gone ? ', and it did' : ', but it is still running - it will be asked again next time'}`);
    return gone ? 1 : 0;
  }));
  return { tried: sessions.length, closed: went.reduce((total, one) => total + one, 0), busy };
}

// ── Commands ─────────────────────────────────────────────────────────────────────────────────────

const TERMINAL = new Set(['completed', 'failed', 'cancelled']);

function summarize(job) {
  // `failed/rate-limited` rather than the plugin's `failed/failed`, which reads as a crash.
  const bits = [`${job.id}  ${job.status}/${job.usageLimit ? 'rate-limited' : (job.phase ?? '-')}`];
  if (job.pid) bits.push(`pid ${job.pid}`);
  if (job.deadPid) bits.push(`dead pid ${job.deadPid}`);
  if (job.logIdleSeconds != null && ACTIVE.has(job.status)) {
    bits.push(`log idle ${job.logIdleSeconds}s${job.logIdleSeconds >= STALL_SECONDS ? ' (STALLED)' : ''}`);
  }
  if (job.usageLimit) {
    bits.push(`Codex ran out of usage, which is not a crash: the work may be complete, so check the tree before believing "failed". ${job.usageLimit}`);
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
            // the delegation can never be judged finished later. Wrapped, because a delegation
            // that is already RUNNING must never be lost to a bookkeeping error - an unreported
            // job id is a leak this code cannot even see, which is the defect it exists to fix.
            try {
              await recordLaunchedTree(dir, payload.jobId);
            } catch (error) {
              process.stderr.write(`Could not record the delegation's process family: ${error.message}\n`);
            }
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
      reportReap(await reapTrees());
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
  reportReap(await reapTrees());
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
  const workspace = reapWorkspace(argv);

  // CLEARING STALE JOB RECORDS NEEDS THE PLUGIN; COLLECTING PROCESSES DOES NOT. They are reported
  // together because a person running `reap` wants both, but a machine without the plugin
  // installed - or with a job store this wrapper cannot read - must still be able to close the
  // processes a delegation left behind. So the first half is allowed to fail on its own.
  try {
    // The workspace named on the command line, when there is one: a reap run from the primary
    // checkout ON BEHALF of a worktree must clear THAT worktree's job records, not its own.
    const dirs = argv.includes('--all-workspaces') ? allStateDirs() : [await stateDir(workspace ?? cwd)];
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
  } catch (error) {
    console.log(`Could not read the Codex job records (${error.message}); collecting processes anyway.`);
  }
  const result = await reapTrees({ workspace });
  reportReap(result);
  // EXIT 3 IS "THE WORKSPACE YOU ASKED ABOUT IS STILL WORKING", and it exists for one caller: a
  // worktree removal asks before deleting the directory a delegation is running in. Nothing was
  // wrong, so it is not a failure; nothing is finished either, so it is not a plain success. Only
  // a SCOPED reap can say it - an unscoped sweep finding somebody else's delegation running is
  // the ordinary state of the machine, and a person running `reap` should not read that as an
  // error.
  return workspace && result.busy ? 3 : 0;
}

/**
 * The `--workspace` path, checked rather than taken.
 *
 * A flag standing in for the value is the failure that matters: `reap --workspace
 * --all-workspaces` would otherwise scope the sweep to a directory called `--all-workspaces`,
 * match no record, and report a quiet, complete-looking nothing - which is exactly what a worktree
 * removal would read as "nothing left running here".
 */
export function reapWorkspace(argv) {
  const at = argv.indexOf('--workspace');
  if (at === -1) return null;
  const value = argv[at + 1];
  if (!value || value.startsWith('--')) throw new Error('--workspace needs a path (got none)');
  if (argv.includes('--all-workspaces')) {
    throw new Error('--workspace and --all-workspaces contradict each other; pass one');
  }
  return value;
}

/** What a reap did: what closed, what would not close, and what stayed and why. */
function reportReap(result) {
  if (!result) return;
  const { closed = 0, refused = 0, unrecordedClosed = 0, trees = [], kept = [] } = result;
  if (unrecordedClosed > 0) {
    console.log(
      `${unrecordedClosed} unrecorded delegation broker(s) shut themselves down and took their families with them.`,
    );
  }
  if (closed > 0 || refused > 0) {
    const stubborn = refused > 0 ? `, and ${refused} would not close` : '';
    console.log(`Closed ${closed} process(es) from ${trees.length} finished delegation tree(s)${stubborn}.`);
  } else if (trees.length > 0) {
    console.log(`${trees.length} finished delegation tree(s) closed themselves when the broker shut down.`);
  }
  for (const { pid, why } of kept) console.log(`  kept pid ${pid} - ${why}`);
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
