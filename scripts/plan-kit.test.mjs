// gate: build
// guards: scripts/plan-kit.mjs, docs/plan-runs/templates/**, docs/plan-runs/known-traps.md
// The run kit: briefs are rendered from state.json and the project, never hand-edited, and a value
// left out is refused before a worker sees it; the heartbeat and the next check-in follow what the
// run actually waits on.
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { checkin, heartbeat, initKit, renderBrief, TRAPS } from './plan-kit.mjs';
import { kitDir } from './run-recovery.mjs';
import { openWave } from './wave-plan-store.mjs';
import { openStore, recordRun, registerRun, updateRun } from './run-supervisor.mjs';
import { readProject, writeProject } from './project-authorization.mjs';

const NOW = Date.parse('2026-10-29T12:00:00Z');
const HOUR = 3_600_000, MINUTE = 60_000;
const iso = (time) => new Date(time).toISOString();
const SOURCE = 'a'.repeat(40), MERGE = 'b'.repeat(40), PARENT = 'c'.repeat(40);

const project = () => ({ version: 1, id: 'plan-fixture-2026-10-29', ownership: 'local-single-owner', status: 'paused',
  authorization: { source: 'owner fixture', scope: 'two fixture phases', permissionPolicy: 'fixture only', startedAt: iso(NOW), deadline: iso(NOW + 72 * HOUR) },
  phases: [
    { id: 'E1', title: 'Phase E1: Build the thing', dependsOn: [], acceptance: ['E1 AC-1 the thing works', 'E1 AC-2 its docs say so'],
      environment: 'CA: a qualified cloud worker plus GitHub Actions', spec: 'docs/work-specs/fixture/spec.md',
      brief: { goal: 'Keep the old path working.', read: 'docs/fixture-notes.md;', checks: 'Walk the thing end to end.' } },
    { id: 'S', title: 'Phase S: The studio walk', dependsOn: ['E1'], acceptance: ['S AC-1 real outputs'], environment: 'OW: the owner\'s studio' },
  ] });
const state = () => ({ version: 1, project: 'plan-fixture-2026-10-29', plan: 'fixture', issue: 42,
  coordinator: { session: 'session_coord', environment: 'env_fixture', return: 'send it to the coordinator with send_message (session_id session_coord)' },
  authorization: { line: 'Run the fixture plan until Friday.', deadline: iso(NOW + 72 * HOUR) },
  brief: { read: 'docs/fixture-plan.md;', rules: 'The fixture switch stays off.' } });

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'plan-kit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const p = project();
  const { file } = openWave({ date: '2026-10-29', kind: 'plan-fixture', until: p.authorization.deadline, project: p, dir, now: NOW });
  initKit(file, state());
  return { dir, file };
}

test('a build brief is the template filled from the kit and the phase, saved in the kit, linking the traps file', (t) => {
  const { file } = fixture(t);
  const brief = renderBrief(file, 'build', 'E1', { SOURCE }, { nonce: '0001' });
  assert.equal(brief.branch, 'claude/plan-fixture-e1-build');
  assert.equal(brief.nonce, 'e1-b-0001');
  assert.doesNotMatch(brief.text, /@[A-Z_]+@/);
  assert.match(brief.text, /PHASE {3}E1: Phase E1: Build the thing/);
  assert.match(brief.text, /\(a\) "E1 AC-1 the thing works"\n {8}\(b\) "E1 AC-2 its docs say so"/);
  assert.match(brief.text, /Keep the old path working\./);
  assert.match(brief.text, new RegExp(`and ${TRAPS} in full`));
  assert.match(brief.text, /The fixture switch stays off\./);
  assert.match(brief.text, /Authorized window ends 2026-11-01T12:00:00.000Z/);
  assert.equal(readFileSync(brief.file, 'utf8'), brief.text);
  // An empty optional field leaves no double space behind.
  assert.doesNotMatch(renderBrief(file, 'build', '2', { SOURCE }).text, /READ {4}AGENTS\.md; docs\/GOALS\.md; [^\n]* {2}/);
});

test('a check brief carries every criterion verbatim into its receipt skeleton', (t) => {
  const { file } = fixture(t);
  const brief = renderBrief(file, 'check', 'E1', { MERGE, PARENT, PR: '1800' });
  assert.match(brief.text, /claude\/check-bbbbbbb at b{40}/);
  assert.match(brief.text, /"criterion":"E1 AC-1 the thing works","environment":"CA: a qualified cloud worker plus GitHub Actions"/);
  assert.match(brief.text, /"criterion":"E1 AC-2 its docs say so"/);
  assert.match(brief.text, /PROVE {3}Walk the thing end to end\./);
  assert.match(brief.text, /NOTES {3}Open no PR\./);
});

test('a missing source, merge, repair finding or fix title, or a stray placeholder, is refused before anything is saved', (t) => {
  const { file } = fixture(t);
  assert.throws(() => renderBrief(file, 'build', 'E1'), /needs SOURCE/);
  assert.throws(() => renderBrief(file, 'build', 'E1', { SOURCE: 'main' }), /needs SOURCE/);
  assert.throws(() => renderBrief(file, 'check', 'E1', { MERGE, PR: '7' }), /needs PARENT/);
  assert.throws(() => renderBrief(file, 'repair', 'E1', { SOURCE }), /needs CARRY/);
  assert.throws(() => renderBrief(file, 'fix', '1797', { SOURCE }), /needs TITLE/);
  assert.throws(() => renderBrief(file, 'build', 'E9', { SOURCE }), /No phase "E9"/);
  const fix = renderBrief(file, 'fix', '1797', { SOURCE, TITLE: 'A value applied during a reload can miss the output' });
  assert.equal(fix.branch, 'claude/plan-fixture-fix-1797');
  const template = path.join(kitDir(file), 'templates', 'build.tmpl');
  writeFileSync(template, `${readFileSync(template, 'utf8')}\nALSO @UNKNOWN@`);
  assert.throws(() => renderBrief(file, 'build', 'E1', { SOURCE }, { nonce: 'ffff' }), /placeholders nothing fills: @UNKNOWN@/);
  assert.equal(existsSync(path.join(kitDir(file), 'briefs', 'e1-build-e1-b-ffff.txt')), false);
});

test('init makes one kit and refuses a second; state.json needs the owner\'s words and a coordinator', (t) => {
  const { file } = fixture(t);
  assert.throws(() => initKit(file, state()), /already holds a state\.json/);
  const other = path.join(path.dirname(file), 'other.md');
  writeFileSync(other, '');
  assert.throws(() => initKit(other, { ...state(), authorization: { deadline: iso(NOW) } }), /authorization\.line/);
  assert.throws(() => initKit(other, { ...state(), coordinator: {} }), /coordinator\.session, coordinator\.return/);
});

test('the next check-in follows what the run waits on, never past the block or the deadline', () => {
  const p = { ...project(), status: 'active', block: { id: 'b', owner: 'o', epoch: 1, startedAt: iso(NOW), deadline: iso(NOW + 4 * HOUR) } };
  const s = state();
  assert.deepEqual(checkin({ action: 'wait' }, s, p, NOW), { at: iso(NOW + 30 * MINUTE), minutes: 30, why: 'waiting on a worker: its idle threshold' });
  const endurance = checkin({ action: 'wait' }, { ...s, waitingOn: { what: 'the endurance run', eta: iso(NOW + 70 * MINUTE) } }, p, NOW);
  assert.equal(endurance.minutes, 75);
  assert.match(endurance.why, /endurance run/);
  assert.equal(checkin({ action: 'wait' }, { ...s, waitingOn: { what: 'CI', eta: iso(NOW + MINUTE) } }, p, NOW).minutes, 10);
  assert.equal(checkin({ action: 'owner' }, s, p, NOW).at, null);
  assert.equal(checkin({ action: 'done' }, s, p, NOW).at, null);
  assert.equal(checkin({ action: 'paused' }, s, { ...p, status: 'paused' }, NOW).at, null);
  assert.equal(checkin({ action: 'paused' }, s, p, NOW).minutes, 0);
  const owed = checkin({ action: 'stopped' }, s, p, NOW);
  assert.equal(owed.at, iso(NOW + 4 * HOUR));
  assert.match(owed.why, /block ends then: renew it/);
  assert.equal(checkin({ action: 'stopped' }, s, { ...p, block: { ...p.block, deadline: iso(NOW + 72 * HOUR) } }, NOW + 70 * HOUR).at, p.authorization.deadline);
});

test('the heartbeat is rendered from state.json and the ledger', (t) => {
  const { dir, file } = fixture(t);
  // Closed before the fixture's folder is removed: Windows keeps an open database locked.
  const db = openStore(path.join(dir, 'control.sqlite'));
  try {
  const p = readProject(readFileSync(file, 'utf8'), NOW);
  registerRun(db, { version: 1, id: p.id, kind: 'plan', wave: file, authorization: p.authorization, adapter: { command: process.execPath, args: [], cwd: dir },
    packet: { objective: 'fixture', acceptance: ['both phases PASS'], nextAction: 'go', phase: 1, tasks: [], decisions: [], constraints: [], files: [], workspace: {}, commits: [], verification: [], blockers: [], evidence: [] } }, NOW);
  updateRun(db, p.id, 'start-block', { owner: 'coordinator', deadline: iso(NOW + 4 * HOUR), evidence: 'fixture' }, NOW);
  recordRun(db, p.id, 1, 'build', '{"actor":"builder-e1"}', { now: NOW, authority: readProject(readFileSync(file, 'utf8'), NOW).block });
  const kit = kitDir(file), s = JSON.parse(readFileSync(path.join(kit, 'state.json'), 'utf8'));
  writeFileSync(path.join(kit, 'state.json'), JSON.stringify({ ...s, inFlight: [{ phase: 'E1', step: 'build', pr: 1800, session: 'session_b' }], owner: ['Bring the Stream Deck to S'] }));
  const body = heartbeat(file, NOW + MINUTE);
  assert.match(body, /^<!-- noacg:plan-run-heartbeat plan-fixture-2026-10-29 -->/);
  assert.match(body, /\*\*Next:\*\* wait build phase 1 \(E1\)/);
  assert.match(body, /\*\*Phases passed:\*\* 0 of 2/);
  assert.match(body, /block 1 ends 2026-10-29T16:00:00/);
  assert.match(body, /\*\*Next check-in:\*\* 2026-10-29T12:31:00.000Z \(waiting on a worker: its idle threshold\)/);
  assert.match(body, /- phase E1, build, PR #1800, session_b/);
  assert.match(body, /- Bring the Stream Deck to S/);
  } finally { db.close(); }
});

test('completion authority schedules after the target but keeps worker briefs bounded by the block', (t) => {
  const { file } = fixture(t), text = readFileSync(file, 'utf8'), p = readProject(text, NOW);
  const later = NOW + 80 * HOUR;
  p.authorization.standing = { untilComplete: 'Continue this scope until complete.' };
  p.status = 'active';
  p.block = { id: 'later-block', owner: 'same-owner', epoch: 2, startedAt: iso(later), deadline: iso(later + HOUR) };
  writeFileSync(file, writeProject(text, p));
  const due = checkin({ action: 'wait' }, state(), p, later);
  assert.equal(due.at, iso(later + 30 * MINUTE));
  assert.equal(checkin({ action: 'wait' }, { ...state(), waitingOn: { eta: iso(later + 4 * HOUR) } }, p, later).at, p.block.deadline);
  assert.equal(checkin({ action: 'paused' }, state(), { ...p, status: 'paused' }, later).at, null);
  const brief = renderBrief(file, 'build', 'E1', { SOURCE });
  assert.ok(brief.text.includes(`Authorized window ends ${p.block.deadline}`));
  assert.throws(() => renderBrief(file, 'build', 'E1', { SOURCE, DEADLINE: iso(later + 48 * HOUR) }), /cannot override/);
  const body = heartbeat(file, later);
  assert.match(body, /planning target .*continue until complete/);
  assert.doesNotMatch(body, /the run ends/);
});
