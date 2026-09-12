#!/usr/bin/env node
// One guarded dispatch for a saved bounded-production-pilot. No provider is called by validation.
// Usage: node scripts/resume-dispatch.mjs --state <absolute.json> -- <executable> <args...>
// The caller chooses the command and must use its bounded, permission-preserving harness adapter.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { workspace } from './claude-run.mjs';

function utc(value, name) {
  // Never let a shell turn a JSON string into a local DateTime. Reject dates without a zone,
  // offsets and normalized invalid dates rather than guessing what the saved deadline meant.
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) {
    throw new Error(`${name} must be an explicit UTC timestamp ending in Z`);
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().replace('.000Z', 'Z') !== value.replace('.000Z', 'Z')) {
    throw new Error(`Invalid ${name}`);
  }
  return ms;
}

export function validateResume(state, now = Date.now()) {
  if (state.version !== 1 || state.kind !== 'bounded-production-pilot') throw new Error('Unsupported resume state');
  if (state.phase !== 'awaiting_resume' || state.resumeCount !== 0 || state.refill?.launchCount !== 0 || state.refill.status !== 'pending') {
    throw new Error('Resume already claimed or not pending; reconcile instead of retrying');
  }
  const originalStart = utc(state.startedAt, 'startedAt');
  const originalEnd = utc(state.deadline, 'deadline');
  let start = originalStart;
  let end = originalEnd;
  if (state.continuation !== undefined) {
    const c = state.continuation;
    if (!c || typeof c.authorizedBy !== 'string' || !c.authorizedBy.trim()) throw new Error('Continuation needs recorded user authorization');
    start = utc(c.startedAt, 'continuation.startedAt');
    end = utc(c.deadline, 'continuation.deadline');
    if (start < originalEnd) throw new Error('Continuation cannot replace a still-open original window');
  }
  if (originalEnd <= originalStart || originalEnd - originalStart > 86_400_000 || end <= start || end - start > 86_400_000) {
    throw new Error('Window must be positive and at most 24 hours');
  }
  if (!Number.isFinite(now) || now < start || now >= end) throw new Error('Resume window is not open');
  return end;
}

function save(file, state) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    renameSync(temporary, file);
  } catch (error) {
    // Preserve the original write failure. A leftover temporary file is not an accepted claim.
    try { unlinkSync(temporary); } catch { /* Cleanup must not hide the failed state write. */ }
    throw error;
  }
}

export async function resumeDispatch(stateFile, command, args = [], dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const writeState = dependencies.writeState ?? save;
  if (!path.isAbsolute(stateFile) || typeof command !== 'string' || !command.trim() || !Array.isArray(args) || args.some((arg) => typeof arg !== 'string')) {
    throw new Error('Absolute --state path and an executable with literal arguments are required');
  }
  // Canonicalize aliases before locking. Keep an accepted claim even after completion or a crash:
  // neither an absent PID nor a failed spawn authorizes a second paid attempt.
  const file = realpathSync(stateFile);
  const lock = `${file}.dispatch-lock`;
  writeFileSync(lock, JSON.stringify({ supervisorPid: process.pid, claimedAt: new Date(now()).toISOString() }), { flag: 'wx', mode: 0o600 });
  let claimed = false;
  let output;
  try {
    const state = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    const deadline = validateResume(state, now());
    const info = workspace(state.worktree);
    if (!info.linkedWorktree || !info.branch || ['main', 'master'].includes(info.branch) || info.branch !== state.branch) {
      throw new Error('Saved branch must match a dedicated feature worktree');
    }
    output = openSync(`${file}.dispatch.log`, 'wx', 0o600);
    state.phase = 'reviewing';
    state.resumeCount = 1;
    state.resumedAt = new Date(now()).toISOString();
    Object.assign(state.refill, {
      launchCount: 1, status: 'launching', supervisorPid: process.pid,
      command, args, logFile: `${file}.dispatch.log`,
    });
    // A write may fail after replacing the file. Retain ownership on any uncertain write.
    claimed = true;
    writeState(file, state);
    if (now() >= deadline) {
      state.phase = 'resume_expired';
      state.refill.status = 'not_launched';
      writeState(file, state);
      throw new Error('Resume window expired before dispatch');
    }
    const child = (dependencies.launch ?? spawn)(command, args, {
      cwd: info.cwd, shell: false, windowsHide: true, stdio: ['ignore', output, output],
    });
    return await new Promise((resolve, reject) => {
      let persistenceError;
      let spawnFailed = false;
      child.once('spawn', () => {
        state.refill.childPid = child.pid;
        state.refill.status = 'running';
        try { writeState(file, state); } catch (error) { persistenceError = error; }
      });
      child.once('error', (error) => {
        spawnFailed = true;
        state.refill.status = 'spawn_failed';
        state.refill.error = error.message;
        state.phase = 'resume_failed';
        try { writeState(file, state); } catch (writeError) { reject(writeError); return; }
        reject(error);
      });
      child.once('close', (exitCode, signal) => {
        if (spawnFailed) return; // Node emits close after an unsuccessful spawn too.
        if (persistenceError) { reject(persistenceError); return; }
        // Transport completion is never a successful review. The coordinator must read the log.
        state.phase = 'awaiting_result_review';
        Object.assign(state.refill, { status: 'exited', exitCode, signal, endedAt: new Date(now()).toISOString() });
        try { writeState(file, state); resolve(state); } catch (error) { reject(error); }
      });
    });
  } finally {
    if (output !== undefined) closeSync(output);
    if (!claimed) unlinkSync(lock);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [flag, file, separator, command, ...args] = process.argv.slice(2);
  try {
    if (flag !== '--state' || separator !== '--') throw new Error('Usage: --state <absolute.json> -- <executable> <args...>');
    const state = await resumeDispatch(file, command, args);
    console.log(JSON.stringify({ phase: state.phase, refill: state.refill }));
    process.exitCode = state.refill.exitCode === 0 ? 0 : 1;
  } catch (error) {
    console.error(`resume-dispatch: ${error.message}. Do not dispatch separately or remove an accepted claim without reconciliation.`);
    process.exitCode = 1;
  }
}
