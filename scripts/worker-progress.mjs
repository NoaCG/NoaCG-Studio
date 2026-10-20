#!/usr/bin/env node
// Is a launched worker making progress? Liveness checks (a heartbeat, a session that still
// answers) cannot tell a working session from a stuck one, so this looks at what work leaves
// behind: the last commit on its branch, its PR and CI run updates, and optionally a session log
// the coordinator names. Read-only; the coordinator decides whether to nudge or relaunch.
//
//   node scripts/worker-progress.mjs --branch <branch> [--pr <number>] [--log <file>] [--idle-minutes 30]
//
// Prints { state: progressing | idle | unknown, lastActivity, idleMinutes, sources } and exits
// 0 when progressing, 1 when idle, 2 when nothing could be read.
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IDLE_MINUTES = 30;

/** The newest activity decides; no readable source is unknown, never idle. */
export function progress(sources, now = Date.now(), idleMinutes = IDLE_MINUTES) {
  const times = sources.map((s) => Date.parse(s.at)).filter(Number.isFinite);
  if (!times.length) return { state: 'unknown', lastActivity: null, idleMinutes: null, sources };
  const last = Math.max(...times), idle = Math.max(0, Math.floor((now - last) / 60_000));
  return { state: idle >= idleMinutes ? 'idle' : 'progressing', lastActivity: new Date(last).toISOString(), idleMinutes: idle, sources };
}

/** Each source that answers contributes its time; one that fails is left out. */
export function observe({ branch, pr, log }, run = (command, args) => spawnSync(command, args, { encoding: 'utf8', timeout: 30_000, windowsHide: true })) {
  const read = (command, args) => {
    const result = run(command, args);
    return result.status === 0 ? String(result.stdout).trim() : '';
  };
  const sources = [];
  const add = (source, at) => { if (at) sources.push({ source, at }); };
  if (branch) {
    if (run('git', ['fetch', '--no-tags', '--quiet', 'origin', branch]).status === 0) add('commit', read('git', ['log', '-1', '--format=%cI', 'FETCH_HEAD']));
    add('ci', read('gh', ['run', 'list', '--branch', branch, '--limit', '1', '--json', 'updatedAt', '--jq', '.[0].updatedAt // empty']));
  }
  if (pr) add('pr', read('gh', ['pr', 'view', String(pr), '--json', 'updatedAt', '--jq', '.updatedAt']));
  if (log) { try { add('log', statSync(log).mtime.toISOString()); } catch { /* A missing log is not activity. */ } }
  return sources;
}

export function main(argv = process.argv.slice(2), { now = Date.now(), run, print = console.log } = {}) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, '');
    if (!['branch', 'pr', 'log', 'idle-minutes'].includes(key) || !argv[i + 1]) {
      print('Usage: node scripts/worker-progress.mjs --branch <branch> [--pr <number>] [--log <file>] [--idle-minutes 30]');
      return 2;
    }
    args[key] = argv[i + 1];
  }
  const result = progress(observe(args, run), now, Number(args['idle-minutes'] ?? IDLE_MINUTES));
  print(JSON.stringify(result));
  return { progressing: 0, idle: 1, unknown: 2 }[result.state];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
