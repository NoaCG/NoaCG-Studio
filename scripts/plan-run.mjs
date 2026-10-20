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
// Events, per phase and in order: build -> landed -> check -> pass. A `fail` names its kind in its
// detail: `fail product:` (the phase misses its outcome) gets one repair -> landed -> check;
// `fail blocked:` (a prerequisite or the infrastructure failed) runs the check again without a
// repair. A second product or blocked fail is diagnosed (owner decision 2026-10-20): one fresh
// deciding agent, independent of everyone who built, repaired or checked the phase, records
// `diagnose` with exactly one decision, `repair:` (one last scoped repair), `check:` (one more
// check after a blocked prerequisite recovered) or `stop:` (the owner decides); a failure after a
// diagnosed repair or check stops the run. One diagnosis per phase; no limit resets. The pass or fail
// detail is the checker's findings: `next` carries them to the next build or repair, and tells the
// last phase's check, or a check after a fail, to land the notes. `resume` notes that an interrupted
// step's session was started again in its own worktree (in a project, the replacement worker's actor
// receipt, which then owns the in-flight step) and `paused` that a running step was
// checkpointed at the block's end. Pause stops admission until an explicit reconciled resume;
// neither counts as another phase launch. `stop` may also
// end any step that met a decision the owner reserves, and `answered` (his answer) lets the stopped
// step go on, with one more repair or check if it stopped on failed checks. Once the middle phase of
// a plan of four or more has passed, `next` asks once for the `## Midpoint retro` before it goes on.

import { appendFileSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectBoundary, readProject } from './project-authorization.mjs';

export const EVENTS = Object.freeze(['build', 'landed', 'check', 'pass', 'fail', 'repair', 'resume', 'paused', 'stop', 'answered', 'diagnose']);

/** A failed check gets this many repairs before the run stops at it. */
const REPAIRS = 1;

/** A `fail` detail starts with its kind. */
const FAIL_KIND = /^(product|blocked):/i;
const BLOCKED = /^blocked:/i;
const DECISION = /^(repair|check|stop):\s*(\S.*)$/i;

/** A diagnosis: a project's JSON receipt `{actor, decision, reason}`, else `<decision>: <reason>`. */
export function diagnosisOf(detail = '') {
  let decision, reason;
  try { ({ decision, reason } = JSON.parse(detail)); } catch { [, decision, reason] = DECISION.exec(detail.trim()) ?? []; }
  decision = typeof decision === 'string' ? decision.toLowerCase() : '';
  return ['repair', 'check', 'stop'].includes(decision) && typeof reason === 'string' && reason.trim() ? { decision, reason: reason.trim() } : null;
}

const actorOf = (detail) => { try { const { actor } = JSON.parse(detail); return typeof actor === 'string' && actor.trim() ? actor : null; } catch { return null; } };

/** Who built, repaired and checked one phase, counting replacements (`resume`) in the step they took over. */
function phaseActors(steps) {
  const builders = new Set(), checkers = new Set();
  let current = null, checker = null;
  for (const step of steps) {
    if (['build', 'repair', 'check'].includes(step.event)) current = step.event;
    const actor = ['build', 'repair', 'check', 'resume'].includes(step.event) && actorOf(step.detail);
    if (!actor || !current) continue;
    if (current === 'check') { checkers.add(actor); checker = actor; } else builders.add(actor);
  }
  return { builders, checkers, checker };
}

/** `next` says closing this long before the window ends. */
const CLOSING_MS = 45 * 60_000;

/**
 * A line `recordStep` wrote. Anchored on its ISO time so a note elsewhere in the wave file, such as
 * a retro bullet "- Pace: phase 1 build+check took ~2h", is never read as a step (#1280).
 */
const STEP_LINE = /^- (\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z) phase (\d+) (\w+)(?: (.*))?$/;

/** The phases the coordinator copied from the plan: the numbered list under `## Phases`. */
export function readPhases(text) {
  const section = /^## Phases[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'))?.[1] ?? '';
  return [...section.matchAll(/^\d+\.\s+(.+)$/gm)].map((match) => match[1].trim());
}

/** Every recorded step, in the order written. */
export function readSteps(text) {
  return text.replace(/\r\n/g, '\n').split('\n').map((line) => STEP_LINE.exec(line)).filter(Boolean)
    .map(([, at, phase, event, detail = '']) => ({ at, phase: Number(phase), event, detail: detail.trim() }))
    .filter((step) => EVENTS.includes(step.event));
}

/**
 * Fold one phase's events into where it stands. `expect` lists the events that may come next;
 * `waiting` is the launched step whose result is still out, with what it was launched with.
 */
function phaseState(steps) {
  let state = 'new';
  let fails = 0;
  let blocked = 0;
  let before = null;
  let waiting = null;
  let diagnosis = null;
  // A diagnosed repair or check is one more than the limit allows, once.
  const limit = (decision) => REPAIRS + (diagnosis?.decision === decision ? 1 : 0);
  for (const step of steps) {
    if (step.event === 'paused') continue;
    if (step.event === 'resume') {
      // The replacement now owns the in-flight step; nothing is launched or counted again.
      if (waiting && step.detail) waiting = { ...waiting, detail: step.detail };
      continue;
    }
    if (step.event === 'diagnose') diagnosis = diagnosisOf(step.detail) ?? { decision: 'stop', reason: step.detail };
    if (step.event === 'stop' || (step.event === 'diagnose' && diagnosis.decision === 'stop')) {
      before = state;
      state = 'stopped';
      continue;
    }
    if (step.event === 'diagnose') continue;
    if (step.event === 'answered') {
      state = before ?? 'new';
      if (state === 'failed' && fails > limit('repair')) fails = limit('repair');
      if (state === 'built' && blocked > limit('check')) blocked = limit('check');
      continue;
    }
    if (step.event === 'build' || step.event === 'repair' || step.event === 'check') waiting = step;
    state = { build: 'building', repair: 'repairing', landed: 'built', check: 'checking', pass: 'passed', fail: 'failed' }[step.event];
    // A blocked check is not the phase's fault: it goes back to built and the check runs again.
    if (step.event === 'fail' && BLOCKED.test(step.detail)) {
      state = 'built';
      blocked += 1;
    } else if (step.event === 'fail') fails += 1;
    if (step.event === 'landed' || step.event === 'pass' || step.event === 'fail') waiting = null;
  }
  // Past its limit, a phase is diagnosed once; after the diagnosis it stops.
  const spent = diagnosis ? [] : ['diagnose'];
  const expect = {
    new: ['build'],
    building: ['landed'],
    repairing: ['landed'],
    built: blocked > limit('check') ? spent : ['check'],
    checking: ['pass', 'fail'],
    failed: fails > limit('repair') ? spent : ['repair'],
    stopped: ['answered'],
    passed: [],
  }[state];
  return { state, fails, blocked, expect, waiting, diagnosis };
}

/** The detail of the last `event` line recorded for `phase`, or undefined when there is none or it is empty. */
function lastDetail(steps, phase, event) {
  return steps.filter((step) => step.phase === phase && step.event === event).at(-1)?.detail || undefined;
}

function windowEnd(text) {
  return Date.parse(/^Window ends: (\S+)\s*$/m.exec(text)?.[1] ?? '');
}

/**
 * The one next step for the run in `text` at `now`:
 *   { action: 'launch', phase, step, carry?, notes? }   start a fresh session for build, check or repair, after
 *                                      `record`; `carry` is the findings the worker takes along (the previous
 *                                      phase's pass for a build, this phase's fail for a repair), `notes` says
 *                                      a check lands the plan's notes ('final phase' or 'second check')
 *   { action: 'wait', phase, step, launched }   a launched step's result is out (resume it if its session is gone)
 *   { action: 'retro', phase, why }    the middle phase passed: write `## Midpoint retro`, then ask again
 *   { action: 'diagnose', phase, why } a second failed or blocked check: one fresh deciding agent records `diagnose`
 *   { action: 'stop', phase, why }     a failure after the diagnosed repair or check: record `stop`, ask the owner, report
 *   { action: 'stopped', phase, why }  stopped and waiting for the owner's answer
 *   { action: 'done' | 'time-limit' | 'no-phases', why }
 * In the window's last 45 minutes a launch, wait or retro also carries `closingMinutes`, the whole minutes left.
 */
export function nextStep(text, now = Date.now()) {
  let project;
  try {
    project = readProject(text, now);
    const boundary = project && projectBoundary(project, now);
    if (boundary) return boundary;
  } catch (error) { return { action: 'blocked', why: error.message }; }
  const control = readSteps(text).filter((step) => ['paused', 'resume'].includes(step.event)).at(-1);
  if (control?.event === 'paused') return { action: 'paused', phase: control.phase, why: control.detail || 'explicit resume and reconciliation required' };
  const next = stepFor(text, now);
  const left = (project?.block ? Date.parse(project.block.deadline) : windowEnd(text)) - now;
  const closing = ['launch', 'wait', 'retro'].includes(next.action) && left > 0 && left <= CLOSING_MS;
  return closing ? { ...next, closingMinutes: Math.ceil(left / 60_000) } : next;
}

export function phasePosition(text, now = Date.now()) { return stepFor(text, now); }

function stepFor(text, now) {
  const phases = readPhases(text);
  if (phases.length === 0) return { action: 'no-phases', why: 'copy the plan\'s phases into the wave file under "## Phases" first' };
  const steps = readSteps(text);
  for (let phase = 1; phase <= phases.length; phase += 1) {
    const { state, expect, waiting, diagnosis } = phaseState(steps.filter((step) => step.phase === phase));
    if (state === 'passed') continue;
    if (state === 'stopped') return { action: 'stopped', phase, why: 'stopped; the owner\'s answer is recorded as `answered`' };
    if (expect.includes('diagnose')) {
      return { action: 'diagnose', phase, why: `${state === 'built' ? 'its check was blocked twice' : 'its check failed again after a repair'}: one fresh agent, independent of the phase's builders, repairers and checkers, records diagnose ${state === 'built' ? 'check' : 'repair'}: or stop: with its reason` };
    }
    if (expect.length === 0) {
      return { action: 'stop', phase, why: state === 'built' ? 'its check was blocked again after the diagnosis' : 'its check failed again after the diagnosed repair' };
    }
    if (expect.includes('landed') || expect.includes('pass')) {
      return { action: 'wait', phase, step: waiting?.event ?? expect[0], launched: waiting?.detail ?? '' };
    }
    const end = windowEnd(text);
    if (!Number.isNaN(end) && now >= end) return { action: 'time-limit', phase, why: `the window ended at ${new Date(end).toISOString()}` };
    // Nothing is in flight and the window is open. The one midpoint retro comes before the next launch.
    const middle = Math.floor(phases.length / 2);
    if (phases.length >= 4 && phase > middle && !/^## Midpoint retro\b/m.test(text.replace(/\r\n/g, '\n'))) {
      return { action: 'retro', phase: middle, why: 'the middle phase passed: write ## Midpoint retro (orchestrator.md step 6, at most five lines), then run next again' };
    }
    const launch = { action: 'launch', phase, step: expect[0] };
    let carry = launch.step === 'build' ? lastDetail(steps, phase - 1, 'pass') : launch.step === 'repair' ? lastDetail(steps, phase, 'fail') : undefined;
    // The diagnosed repair takes the deciding agent's scope along, until a later failure replaces it.
    const own = steps.filter((step) => step.phase === phase);
    if (launch.step === 'repair' && diagnosis?.decision === 'repair' && own.findLastIndex((s) => s.event === 'diagnose') > own.findLastIndex((s) => s.event === 'fail')) {
      carry = `${carry ?? ''} (diagnosis: ${diagnosis.reason})`.trim();
    }
    if (carry) launch.carry = carry;
    if (launch.step === 'check' && phase === phases.length) launch.notes = 'final phase';
    else if (launch.step === 'check' && steps.some((step) => step.phase === phase && step.event === 'fail')) launch.notes = 'second check';
    return launch;
  }
  return { action: 'done', why: `all ${phases.length} phases built, landed and checked` };
}

/** Is `event` for `phase` the one the ledger expects now? Returns a refusal string, or null. */
export function refuseStep(text, phase, event, detail = '') {
  if (!EVENTS.includes(event)) return `the event must be one of ${EVENTS.join(', ')}, got "${event}"`;
  if (event === 'fail' && !FAIL_KIND.test(detail)) {
    return 'a fail names its kind: the detail starts with "product:" (the phase misses its outcome, so repair) or "blocked:" (a prerequisite failed, so check again)';
  }
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
  if (event === 'diagnose' && expect.includes('diagnose')) {
    const allowed = state === 'built' ? ['check', 'stop'] : ['repair', 'stop'];
    const diagnosis = diagnosisOf(detail);
    if (!diagnosis) return 'a diagnosis records one decision and its reason: "repair: ...", "check: ..." or "stop: ..." (a project: JSON {"actor","decision","reason"})';
    return allowed.includes(diagnosis.decision) ? null : `phase ${phase} ${state === 'built' ? 'was blocked' : 'failed'}, so its diagnosis is ${allowed.join(' or ')}, not ${diagnosis.decision}`;
  }
  if (event === 'resume' || event === 'paused') {
    const paused = steps.filter((step) => ['paused', 'resume'].includes(step.event)).at(-1)?.event === 'paused';
    return (event === 'paused' && state !== 'passed') || (event === 'resume' && paused && detail.trim())
      || (event === 'resume' && ['building', 'repairing', 'checking'].includes(state)) ? null
      : `nothing in phase ${phase} is running to be ${event === 'resume' ? 'resumed' : 'paused'} (${state})`;
  }
  if (event === 'stop') return state === 'passed' || state === 'stopped' ? `phase ${phase} is ${state}` : null;
  if (expect.includes(event)) return null;
  if (state === 'passed') return `phase ${phase} is passed and done`;
  const launches = ['build', 'check', 'repair'];
  const already = launches.includes(event) && state !== 'new' ? ' It is already launched: resume it instead of launching it again.' : '';
  return `phase ${phase} is ${state}; the next event is ${expect.join(' or ') || 'stop'}, not ${event}.${already}`;
}

/** Append the step to the wave file, or return why not. */
export function withLedgerLock(file, operation) {
  const lock = `${realpathSync(file)}.admission`;
  try { mkdirSync(lock); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    return { refusal: 'Ledger admission is busy or interrupted; reconcile its owner-pid before retrying' };
  }
  try {
    writeFileSync(path.join(lock, 'owner-pid'), String(process.pid));
    return operation();
  } finally { rmSync(lock, { recursive: true }); }
}

export function recordStep(file, phase, event, detail = '', now = Date.now(), { supervised = false } = {}) {
  return withLedgerLock(file, () => recordLocked(file, phase, event, detail, now, supervised));
}

function recordLocked(file, phase, event, detail, now, supervised) {
  const text = readFileSync(file, 'utf8');
  if (/[\r\n]/.test(detail)) return { refusal: 'A recorded event must be one line' };
  let project;
  try { project = readProject(text, now); } catch (error) { return { refusal: error.message }; }
  if (project && !supervised) return { refusal: 'Project phase admission requires run-supervisor record and its current block authority' };
  if (project && event === 'paused') return { refusal: 'Use supervisor pause/start-block for project control' };
  const refusal = refuseStep(text, phase, event, detail);
  if (refusal) return { refusal };
  if (['build', 'check', 'repair'].includes(event)) {
    const next = nextStep(text, now);
    if (next.action !== 'launch' || next.phase !== phase || next.step !== event) return { refusal: `Ledger refuses launch: ${next.action}` };
  }
  if (project && ['build', 'repair', 'check', 'pass', 'resume', 'diagnose'].includes(event)) {
    let receipt;
    try { receipt = JSON.parse(detail); } catch { return { refusal: 'Project launch/verdict/handoff requires a JSON actor/evidence receipt' }; }
    if (typeof receipt.actor !== 'string' || !receipt.actor.trim()) return { refusal: 'Independent actor identity required' };
    const steps = readSteps(text).filter((step) => step.phase === phase);
    const { builders, checkers, checker } = phaseActors(steps);
    const checking = event === 'check' || (event === 'resume' && phaseState(steps).waiting?.event === 'check');
    if (checking && builders.has(receipt.actor)) return { refusal: 'Checker must be independent of every builder/repairer' };
    if (event === 'diagnose' && (builders.has(receipt.actor) || checkers.has(receipt.actor))) return { refusal: 'The deciding agent must be independent of every builder, repairer and checker of the phase' };
    if (event === 'pass') {
      const acceptance = project.phases[phase - 1];
      if (checker !== receipt.actor || !Array.isArray(receipt.evidence) || receipt.evidence.length !== acceptance.acceptance.length
          || acceptance.acceptance.some((criterion) => !receipt.evidence.some((e) => e.criterion === criterion
            && typeof e.evidence === 'string' && e.evidence.trim() && e.environment === acceptance.environment))) return { refusal: 'PASS needs the latest independent checker\'s evidence for every criterion in its required environment' };
      // The check may start at the merge; PASS waits until every exact-merge check is green.
      if (typeof receipt.mergeChecks !== 'string' || !receipt.mergeChecks.trim()) return { refusal: 'PASS needs mergeChecks: evidence that every required check on the exact merge SHA is green' };
    }
  }
  const line = `- ${new Date(now).toISOString()} phase ${phase} ${event}${detail ? ` ${detail}` : ''}`;
  appendFileSync(file, `${text.endsWith('\n') ? '' : '\n'}${line}\n`, 'utf8');
  return { line };
}

const USAGE = `Usage: node scripts/plan-run.mjs next <wave file>
       node scripts/plan-run.mjs record <wave file> <phase> <${EVENTS.join('|')}> [detail]`;

function describe(next) {
  const lines = [];
  if (next.action === 'launch') {
    lines.push(`launch ${next.step} phase ${next.phase}${next.notes ? ` (land notes: ${next.notes})` : ''}`);
    if (next.carry) lines.push(`  carry: ${next.carry}`);
  } else if (next.action === 'wait') lines.push(`wait ${next.step} phase ${next.phase}${next.launched ? ` (${next.launched})` : ''}`);
  else if (['retro', 'stop', 'stopped'].includes(next.action)) lines.push(`${next.action} phase ${next.phase}: ${next.why}`);
  else lines.push(`${next.action}: ${next.why}`);
  if (next.closingMinutes !== undefined) {
    lines.push(`window ends in ${next.closingMinutes} min: launch only a step that lands before then, else checkpoint and record paused`);
  }
  return lines.join('\n');
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
