#!/usr/bin/env node
// THE PLAN RUN'S STEP LEDGER - what a `/plan-run` coordinator does next, from its wave file alone.
//
//   node scripts/plan-run.mjs next <wave file>                          # the one next step
//   node scripts/plan-run.mjs record <wave file> <phase> <event> [detail]  # log a step; refuses a wrong one
//
// The wave file is the one `wave-plan-store.mjs --open <date> plan-<plan>` opened. The coordinator
// copies the plan's phases into it once, as a numbered list under `## Phases`, and records every
// launch and result here as one line: `- <time> phase <n> <event> <detail>`.
//
// WHY CODE and not a paragraph in the procedure. The run's two promises are order and no repeats:
// no phase starts before the previous one's check passed, a failed check gets one repair and the
// second failure stops the run, and a coordinator restarted after the computer was closed continues
// from the next unfinished step and launches nothing twice. A coordinator reading its own notes
// after a restart is exactly the reader that gets those wrong, so the ledger refuses an event that
// is not the expected next one, and `next` answers from the ledger rather than from memory.
//
// Events, per phase and in order: build -> landed -> check -> pass, or fail -> repair -> landed ->
// check -> pass, or a second fail -> stop. `resume` notes that an interrupted step's session was
// started again in its own worktree; it never counts as a launch. `stop` may also end any step
// that met a decision the owner reserves, and `answered` (his answer) lets the stopped step go on,
// with one more repair if it stopped on failed checks.

import { appendFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EVENTS = Object.freeze(['build', 'landed', 'check', 'pass', 'fail', 'repair', 'resume', 'stop', 'answered']);

/** A failed check gets this many repairs before the run stops at it. */
const REPAIRS = 1;

const STEP_LINE = /^- (\S+) phase (\d+) (\w+)\b ?(.*)$/;

/** The phases the coordinator copied from the plan: the numbered list under `## Phases`. */
export function readPhases(text) {
  const section = /^## Phases[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
  return [...section.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
}

/** Every recorded step, in the order written. */
export function readSteps(text) {
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => STEP_LINE.exec(line)).filter(Boolean)
    .map(([, at, phase, event, detail]) => ({ at, phase: Number(phase), event, detail: detail.trim() }))
    .filter((step) => EVENTS.includes(step.event));
}

/**
 * Fold one phase's events into where it stands. `expect` lists the events that may come next;
 * `waiting` is the launched step whose result is still out, with what it was launched with.
 */
function phaseState(steps) {
  let state = 'new';
  let fails = 0;
  let before = null;
  let waiting = null;
  for (const step of steps) {
    if (step.event === 'resume') continue;
    if (step.event === 'stop') {
      before = state;
      state = 'stopped';
      continue;
    }
    if (step.event === 'answered') {
      state = before ?? 'new';
      if (state === 'failed' && fails > REPAIRS) fails = REPAIRS;
      continue;
    }
    if (step.event === 'build' || step.event === 'repair' || step.event === 'check') waiting = step;
    state = { build: 'building', repair: 'repairing', landed: 'built', check: 'checking', pass: 'passed', fail: 'failed' }[step.event];
    if (step.event === 'fail') fails += 1;
    if (step.event === 'landed' || step.event === 'pass' || step.event === 'fail') waiting = null;
  }
  const expect = {
    new: ['build'],
    building: ['landed'],
    repairing: ['landed'],
    built: ['check'],
    checking: ['pass', 'fail'],
    failed: fails > REPAIRS ? [] : ['repair'],
    stopped: ['answered'],
    passed: [],
  }[state];
  return { state, fails, expect, waiting };
}

/**
 * The one next step for the run in `text` at `now`:
 *   { action: 'launch', phase, step }   start a fresh session for build, check or repair, after `record`
 *   { action: 'wait', phase, step, launched }   a launched step's result is out (resume it if its session is gone)
 *   { action: 'stop', phase, why }     a second failed check: record `stop`, ask the owner, report
 *   { action: 'stopped', phase, why }  stopped and waiting for the owner's answer
 *   { action: 'done' | 'time-limit' | 'no-phases', why }
 */
export function nextStep(text, now = Date.now()) {
  const phases = readPhases(text);
  if (phases.length === 0) return { action: 'no-phases', why: 'copy the plan\'s phases into the wave file under "## Phases" first' };
  const steps = readSteps(text);
  for (let phase = 1; phase <= phases.length; phase += 1) {
    const { state, expect, waiting } = phaseState(steps.filter((step) => step.phase === phase));
    if (state === 'passed') continue;
    if (state === 'stopped') return { action: 'stopped', phase, why: 'stopped; the owner\'s answer is recorded as `answered`' };
    if (expect.length === 0) return { action: 'stop', phase, why: 'its check failed again after a repair' };
    if (expect.includes('landed') || expect.includes('pass')) {
      return { action: 'wait', phase, step: waiting?.event ?? expect[0], launched: waiting?.detail ?? '' };
    }
    const end = Date.parse(/^Window ends: (\S+)\s*$/m.exec(text)?.[1] ?? '');
    if (!Number.isNaN(end) && now >= end) return { action: 'time-limit', phase, why: `the window ended at ${new Date(end).toISOString()}` };
    return { action: 'launch', phase, step: expect[0] };
  }
  return { action: 'done', why: `all ${phases.length} phases built, landed and checked` };
}

/** Is `event` for `phase` the one the ledger expects now? Returns a refusal string, or null. */
export function refuseStep(text, phase, event) {
  if (!EVENTS.includes(event)) return `the event must be one of ${EVENTS.join(', ')}, got "${event}"`;
  const phases = readPhases(text);
  if (!Number.isInteger(phase) || phase < 1 || phase > phases.length) {
    return `phase must be 1 to ${phases.length} (the "## Phases" list), got "${phase}"`;
  }
  const steps = readSteps(text);
  for (let earlier = 1; earlier < phase; earlier += 1) {
    if (phaseState(steps.filter((step) => step.phase === earlier)).state !== 'passed') {
      return `phase ${earlier} has not passed its check, so phase ${phase} cannot start`;
    }
  }
  const { state, expect } = phaseState(steps.filter((step) => step.phase === phase));
  if (event === 'resume') {
    return ['building', 'repairing', 'checking'].includes(state) ? null : `nothing in phase ${phase} is waiting to be resumed (${state})`;
  }
  if (event === 'stop') return state === 'passed' || state === 'stopped' ? `phase ${phase} is ${state}` : null;
  if (expect.includes(event)) return null;
  if (state === 'passed') return `phase ${phase} is passed and done`;
  const launches = ['build', 'check', 'repair'];
  const already = launches.includes(event) && state !== 'new' ? ' It is already launched: resume it instead of launching it again.' : '';
  return `phase ${phase} is ${state}; the next event is ${expect.join(' or ') || 'stop'}, not ${event}.${already}`;
}

/** Append the step to the wave file, or return why not. */
export function recordStep(file, phase, event, detail = '', now = Date.now()) {
  const text = readFileSync(file, 'utf8');
  const refusal = refuseStep(text, phase, event);
  if (refusal) return { refusal };
  const line = `- ${new Date(now).toISOString()} phase ${phase} ${event}${detail ? ` ${detail}` : ''}`;
  appendFileSync(file, `${text.endsWith('\n') ? '' : '\n'}${line}\n`, 'utf8');
  return { line };
}

const USAGE = `Usage: node scripts/plan-run.mjs next <wave file>
       node scripts/plan-run.mjs record <wave file> <phase> <${EVENTS.join('|')}> [detail]`;

function describe(next) {
  if (next.action === 'launch') return `launch ${next.step} phase ${next.phase}`;
  if (next.action === 'wait') return `wait ${next.step} phase ${next.phase}${next.launched ? ` (${next.launched})` : ''}`;
  if (next.action === 'stop' || next.action === 'stopped') return `${next.action} phase ${next.phase}: ${next.why}`;
  return `${next.action}: ${next.why}`;
}

export function main(argv = process.argv.slice(2)) {
  const [command, file, phase, event, ...detail] = argv;
  if (command === 'next' && file) {
    process.stdout.write(`${describe(nextStep(readFileSync(file, 'utf8')))}\n`);
    return 0;
  }
  if (command === 'record' && file && phase && event) {
    const recorded = recordStep(file, Number(phase), event, detail.join(' '));
    if (recorded.refusal) {
      process.stderr.write(`plan-run: ${recorded.refusal}\n`);
      return 1;
    }
    process.stdout.write(`${recorded.line}\n`);
    return 0;
  }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
