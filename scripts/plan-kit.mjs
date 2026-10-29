#!/usr/bin/env node
// THE PLAN RUN'S KIT - its state, its brief templates and the briefs it sent, beside the wave file.
//
//   node scripts/plan-kit.mjs init <wave> <state.json>          # create the kit (plan-create does this once)
//   node scripts/plan-kit.mjs brief <wave> <build|repair|check|fix> <phase id | row | issue> [KEY=value ...]
//   node scripts/plan-kit.mjs heartbeat <wave>                  # the run issue's heartbeat comment body
//   node scripts/plan-kit.mjs checkin <wave>                    # when the next check-in is due, and why
//
// WHY A FILE AND A RENDERER. The production-page run (#1553, retro 2026-10-29) kept its state in a
// 6 KB trigger prompt that every update resent, edited its heartbeat by line number with sed, and
// pasted the same traps into fifty briefs until they drifted. Here the state is one small JSON file,
// the briefs and the heartbeat are rendered from it and from the ledger, and a placeholder left
// unfilled is refused rather than sent. The kit folder rides in the recovery checkpoint
// (run-recovery.mjs), so every recorded event pushes it and `run-supervisor continue` restores it.
//
// The kit is `<wave without .md>.kit/`: `state.json`, `templates/<kind>.tmpl` (copied from
// docs/plan-runs/templates/ by init, then tailored by the coordinator if the plan needs it) and
// `briefs/` (each brief as sent). The repository is public: nothing in the kit is a credential.
import { randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nextStep, phasePosition, readPhases } from './plan-run.mjs';
import { instant, phaseRow, readProject } from './project-authorization.mjs';
import { kitDir } from './run-recovery.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const TRAPS = 'docs/plan-runs/known-traps.md';
const TEMPLATES = path.join(ROOT, 'docs', 'plan-runs', 'templates');
export const KINDS = Object.freeze(['build', 'repair', 'check', 'fix']);
const MINUTE = 60_000;
const nonempty = (s) => typeof s === 'string' && s.trim().length > 0;
const sha = (s) => /^[a-f0-9]{40}$/.test(s ?? '');
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
// An optional field left empty disappears with the space before it.
const EMPTY = '';

/** state.json, the run's one small state file. Unknown fields are the coordinator's to use. */
export function checkState(state) {
  const missing = [
    ['version 1', state?.version === 1],
    ['project (plan-<plan>-<date>)', /^plan-[a-z0-9-]+$/.test(state?.project ?? '')],
    ['plan', nonempty(state?.plan)],
    ['issue (the run issue number)', Number.isSafeInteger(state?.issue) && state.issue > 0],
    ['coordinator.session', nonempty(state?.coordinator?.session)],
    ['coordinator.return (how a worker sends its receipt back)', nonempty(state?.coordinator?.return)],
    ['coordinator.environment', nonempty(state?.coordinator?.environment)],
    ['authorization.line (the owner\'s words, verbatim)', nonempty(state?.authorization?.line)],
    ['authorization.deadline (ISO with offset)', Number.isFinite(instant(state?.authorization?.deadline))],
  ].filter(([, ok]) => !ok).map(([what]) => what);
  if (missing.length) throw Error(`state.json needs ${missing.join(', ')}`);
  return state;
}

export const readState = (wave) => checkState(JSON.parse(readFileSync(path.join(kitDir(wave), 'state.json'), 'utf8')));

/** Create the kit beside the wave: state.json and the base brief templates. Never overwrites. */
export function initKit(wave, state) {
  checkState(state);
  const kit = kitDir(wave);
  if (existsSync(path.join(kit, 'state.json'))) throw Error(`${kit} already holds a state.json: edit it, never start a second kit`);
  mkdirSync(path.join(kit, 'templates'), { recursive: true });
  mkdirSync(path.join(kit, 'briefs'), { recursive: true });
  for (const kind of KINDS) {
    const target = path.join(kit, 'templates', `${kind}.tmpl`);
    if (!existsSync(target)) copyFileSync(path.join(TEMPLATES, `${kind}.tmpl`), target);
  }
  writeFileSync(path.join(kit, 'state.json'), `${JSON.stringify(state, null, 2)}\n`, { flag: 'wx' });
  return { kit, templates: KINDS.map((kind) => path.join(kit, 'templates', `${kind}.tmpl`)) };
}

function phaseOf(project, target) {
  if (!project) throw Error('A phase brief needs a continuing project: its phases carry the acceptance and environment');
  return project.phases[phaseRow(project.phases, target) - 1];
}

function parentOf(merge) {
  try { return execFileSync('git', ['rev-parse', `${merge}^1`], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }).trim(); } catch { return undefined; }
}

/**
 * Render one brief from the kit's template: run fields from state.json, phase fields from the
 * project (or the issue for a fix), the rest from `values` (KEY=value on the command line, which
 * may also override any field). Refuses a missing required value or any placeholder left over,
 * then saves the brief in the kit's briefs/ folder and returns it.
 */
export function renderBrief(wave, kind, target, values = {}, { nonce = randomBytes(2).toString('hex') } = {}) {
  if (!KINDS.includes(kind)) throw Error(`A brief is one of ${KINDS.join(', ')}, not "${kind}"`);
  const state = readState(wave), text = readFileSync(wave, 'utf8');
  const fields = {
    PLAN: state.plan, PROJECT: state.project, ISSUE: String(state.issue), COORDINATOR: state.coordinator.session,
    RETURN: state.coordinator.return, ENVIRONMENT: state.coordinator.environment, DEADLINE: state.authorization.deadline,
    TRAPS, PLAN_READ: state.brief?.read || EMPTY, PLAN_RULES: state.brief?.rules || 'none beyond the traps file',
    GOAL: EMPTY, READ: EMPTY, NOTES: 'none', CARRY: 'none',
  };
  const prefix = `${state.branchPrefix || 'claude'}/plan-${state.plan}`;
  if (kind === 'fix') {
    if (!/^\d+$/.test(target)) throw Error('A fix brief names its issue number');
    Object.assign(fields, { N: target, SLUG: `fix-${target}`, BRANCH: `${prefix}-fix-${target}` });
  } else {
    const phase = phaseOf(readProject(text), target), brief = phase.brief ?? {};
    Object.assign(fields, {
      PHASE: phase.id, TITLE: phase.title, PHASE_ENV: phase.environment, SPEC: phase.spec ?? state.spec ?? 'the plan\'s spec',
      SLUG: slug(phase.id), BRANCH: `${prefix}-${slug(phase.id)}-${kind}`,
      ACCEPTANCE: phase.acceptance.map((c, i) => `        (${String.fromCharCode(97 + i)}) "${c}"`).join('\n'),
      EVIDENCE: phase.acceptance.map((c) => JSON.stringify({ criterion: c, environment: phase.environment, evidence: '...' })).join(','),
      GOAL: brief.goal || EMPTY, READ: brief.read || EMPTY, TOUCHES: brief.touches || 'what the phase needs and nothing else',
      CHECKS: brief.checks || 'every criterion above, each with evidence of your own', NOTES: brief.notes || 'none',
    });
    if (kind === 'check') {
      fields.NOTES = 'Open no PR.';
      if (values.MERGE && sha(values.MERGE)) {
        fields.SHORT = values.MERGE.slice(0, 7);
        fields.PARENT = parentOf(values.MERGE);
      }
    }
  }
  fields.NONCE = `${fields.SLUG}-${kind[0]}-${nonce}`;
  Object.assign(fields, values);
  const required = { build: ['SOURCE'], repair: ['SOURCE', 'CARRY'], fix: ['SOURCE', 'TITLE'], check: ['MERGE', 'PARENT', 'PR'] }[kind];
  const wrong = required.filter((key) => !nonempty(fields[key]) || fields[key] === 'none' || (['SOURCE', 'MERGE', 'PARENT'].includes(key) && !sha(fields[key])));
  if (wrong.length) throw Error(`A ${kind} brief needs ${wrong.join(', ')} (KEY=value; SOURCE, MERGE and PARENT are full 40-hex SHAs)`);
  const template = readFileSync(path.join(kitDir(wave), 'templates', `${kind}.tmpl`), 'utf8');
  const out = template.replace(/@([A-Z_]+)@/g, (match, key) => fields[key] ?? match).replace(/ ?/g, '');
  const left = [...new Set(out.match(/@[A-Z_]+@/g) ?? [])];
  if (left.length) throw Error(`The ${kind} template has placeholders nothing fills: ${left.join(', ')}`);
  const file = path.join(kitDir(wave), 'briefs', `${fields.SLUG}-${kind}-${fields.NONCE}.txt`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, out, { flag: 'wx' });
  return { text: out, file, nonce: fields.NONCE, branch: fields.BRANCH };
}

/**
 * When the coordinator's next check-in is due. It follows what the run waits on rather than a
 * fixed half hour: a CI or endurance run's ETA, a worker's idle threshold, a long fallback while
 * the owner's answer is owed, and none at all once the owner holds the hand-over or the run ended.
 * Never past the open block's end (renew it then) or the project deadline.
 */
export function checkin(next, state, project, now = Date.now()) {
  const none = (why) => ({ at: null, why });
  const due = (ms, why) => {
    let at = now + Math.max(0, ms), reason = why;
    const block = project?.block && project.status === 'active' ? instant(project.block.deadline) : NaN;
    if (Number.isFinite(block) && at > block) { at = block; reason = `the block ends then: renew it (${why})`; }
    const end = instant(project?.authorization?.deadline ?? state?.authorization?.deadline);
    if (Number.isFinite(end) && at > end) at = end;
    return { at: new Date(at).toISOString(), minutes: Math.round((at - now) / MINUTE), why: reason };
  };
  switch (next.action) {
    case 'done': case 'finished': case 'cancelled': case 'expired': case 'time-limit':
      return none('the run ended: keep no check-in');
    case 'owner': return none('the owner holds the hand-over and his report wakes the session: keep no check-in');
    case 'stopped': return due(6 * 60 * MINUTE, 'the owner\'s answer is owed; a long fallback only');
    case 'paused': return project?.status === 'active' ? due(0, 'the block ended: renew it now') : none('paused by the owner: keep no check-in');
    case 'blocked': return due(60 * MINUTE, 'the ledger could not be read: reconcile it');
    case 'wait': {
      const eta = instant(state?.waitingOn?.eta ?? '');
      if (Number.isFinite(eta)) return due(Math.max(eta + 5 * MINUTE - now, 10 * MINUTE), `waiting on ${state.waitingOn.what ?? 'a run'}, due ${state.waitingOn.eta}`);
      return due(30 * MINUTE, 'waiting on a worker: its idle threshold');
    }
    default: return due(0, `${next.action} is due: act on it now`);
  }
}

const list = (items, show) => (Array.isArray(items) && items.length ? items.map((item) => `- ${show(item)}`).join('\n') : '- nothing');

/** The heartbeat comment, rendered from state.json and the ledger: post it, never edit it by hand. */
export function heartbeat(wave, now = Date.now()) {
  const state = readState(wave), text = readFileSync(wave, 'utf8');
  let project = null;
  try { project = readProject(text, now); } catch { /* next says blocked */ }
  const next = nextStep(text, now), total = readPhases(text).length;
  const position = phasePosition(text, now);
  const passed = position.action === 'done' ? total : Math.max(0, (position.phase ?? 1) - 1);
  const due = checkin(next, state, project, now);
  const step = [next.action, next.step, next.phase && `phase ${next.phase}`, next.id && `(${next.id})`].filter(Boolean).join(' ');
  const block = project?.block && project.status === 'active' ? `block ${project.block.epoch} ends ${project.block.deadline}` : `no open block (${project?.status ?? 'no project'})`;
  return [
    `<!-- noacg:plan-run-heartbeat ${state.project} -->`,
    `**Plan run \`${state.project}\`**, updated ${new Date(now).toISOString()}`,
    '',
    `- **Next:** ${step}${next.why ? `: ${next.why}` : ''}`,
    `- **Phases passed:** ${passed} of ${total}`,
    `- **Window:** ${block}; the run ends ${state.authorization.deadline}`,
    `- **Waiting on:** ${state.waitingOn?.what ? `${state.waitingOn.what}${state.waitingOn.eta ? `, due ${state.waitingOn.eta}` : ''}` : 'nothing outside the ledger'}`,
    `- **Next check-in:** ${due.at ? `${due.at} (${due.why})` : `none (${due.why})`}`,
    '',
    '**In flight**',
    list(state.inFlight, (w) => [w.phase && `phase ${w.phase}`, w.step, w.pr && `PR #${w.pr}`, w.session, w.note].filter(Boolean).join(', ')),
    '',
    '**Owner**',
    list(state.owner, (item) => (typeof item === 'string' ? item : [item.what, item.where].filter(Boolean).join(': '))),
    '',
  ].join('\n');
}

const USAGE = `Usage: node scripts/plan-kit.mjs init <wave> <state.json>
       node scripts/plan-kit.mjs brief <wave> <${KINDS.join('|')}> <phase id | row | issue> [KEY=value ...]
       node scripts/plan-kit.mjs heartbeat <wave>
       node scripts/plan-kit.mjs checkin <wave>`;

export function main(argv = process.argv.slice(2)) {
  const [command, wave, ...rest] = argv;
  try {
    if (command === 'init' && wave && rest[0]) {
      process.stdout.write(`${JSON.stringify(initKit(wave, JSON.parse(readFileSync(rest[0], 'utf8'))))}\n`); return 0;
    }
    if (command === 'brief' && wave && rest.length >= 2) {
      const [kind, target, ...pairs] = rest;
      const values = Object.fromEntries(pairs.map((pair) => {
        const at = pair.indexOf('=');
        if (at < 1) throw Error(`"${pair}" is not KEY=value`);
        return [pair.slice(0, at), pair.slice(at + 1)];
      }));
      const brief = renderBrief(wave, kind, target, values);
      process.stdout.write(`${brief.text}\n--- saved ${brief.file}; nonce ${brief.nonce}; branch ${brief.branch}\n`); return 0;
    }
    if (command === 'heartbeat' && wave) { process.stdout.write(heartbeat(wave)); return 0; }
    if (command === 'checkin' && wave) {
      const text = readFileSync(wave, 'utf8');
      let project = null;
      try { project = readProject(text); } catch { /* next says blocked */ }
      process.stdout.write(`${JSON.stringify(checkin(nextStep(text), readState(wave), project))}\n`); return 0;
    }
  } catch (error) { process.stderr.write(`plan-kit: ${error.message}\n`); return 1; }
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main();
