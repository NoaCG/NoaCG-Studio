// gate: build
// guards: scripts/project-authorization.mjs, scripts/project-control.mjs, scripts/plan-run.mjs, scripts/wave-plan-store.mjs, scripts/run-supervisor.mjs, scripts/run-recovery.mjs, scripts/plan-run-preflight.mjs, scripts/run-wake.mjs
// measures: none - deterministic control protocol, no provider qualification
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openWave } from './wave-plan-store.mjs';
import { nextStep, recordStep, readSteps } from './plan-run.mjs';
import { openStore, phaseNumber, recordRun, registerRun, renewBlock, tickRun, updateRun } from './run-supervisor.mjs';
import { digest, readProject, validateAuthorization, writeProject } from './project-authorization.mjs';
import { preflight } from './plan-run-preflight.mjs';
import { holdable, wakeVerdict, writeWake } from './run-wake.mjs';

const NOW = Date.parse('2026-10-19T12:00:00Z');
const iso = (time) => new Date(time).toISOString();
const HOUR = 3_600_000;
const MERGE = { mergeSha: 'b'.repeat(40) };
const authorization = () => ({ source: 'owner fixture only', scope: 'two generic fixture phases',
  permissionPolicy: 'controlled adapters only', startedAt: iso(NOW), deadline: iso(NOW + 72 * HOUR) });
const project = () => ({ version: 1, id: 'fixture-project', ownership: 'local-single-owner',
  authorization: authorization(), status: 'paused', phases: [
    { id: 'prepare', title: 'Prepare generic input', dependsOn: [], acceptance: ['input accepted'], environment: 'qualified-cloud' },
    { id: 'accept', title: 'Check generic output', dependsOn: ['prepare'], acceptance: ['output accepted'], environment: 'specified-device' },
  ] });
function fixture(t, edit = (p) => p) {
  const dir = mkdtempSync(path.join(tmpdir(), 'continuing-project-'));
  const p = edit(project());
  const opened = openWave({ date: '2026-10-19', kind: 'plan-fixture', until: p.authorization.deadline, project: p, dir, now: NOW });
  assert.equal(opened.refusal, undefined);
  const dbPath = path.join(dir, 'control.sqlite'), db = openStore(dbPath);
  const packet = { objective: 'Generic fixture', acceptance: ['both phases PASS'], nextAction: 'Reconcile', phase: 1,
    tasks: [], decisions: [], constraints: [], files: [], workspace: {}, commits: [], verification: [], blockers: [], evidence: [] };
  const manifest = { version: 1, id: p.id, kind: 'plan', wave: opened.file, authorization: p.authorization,
    packet, adapter: { command: process.execPath, args: [], cwd: dir } };
  registerRun(db, manifest, NOW);
  t.after(() => { db.close(); rmSync(dir, { recursive: true, force: true }); });
  const text = () => readFileSync(opened.file, 'utf8');
  const current = () => readProject(text(), NOW);
  const start = (at = NOW, owner = 'coordinator-1') => {
    updateRun(db, p.id, 'start-block', { owner, deadline: iso(at + HOUR), evidence: 'same local host, worker and actions reconciled' }, at);
    return current().block;
  };
  const record = (phase, event, receipt = {}, at = NOW, authority = current().block) => recordRun(db, p.id, phase, event,
    typeof receipt === 'string' ? receipt : JSON.stringify(receipt), { now: at, authority });
  return { dir, dbPath, db, p, manifest, file: opened.file, text, current, start, record };
}
const networkPass = (command) => ({ status: 0, stdout: command === 'git' ? `${'a'.repeat(40)}\trefs/heads/main\n` : command === 'gh' ? '12\n' : 'workspace-child-ok' });
function finishPhase(f, phase, at = NOW) {
  f.record(phase, 'build', { actor: `builder-${phase}` }, at);
  f.record(phase, 'landed', MERGE, at);
  f.record(phase, 'check', { actor: `checker-${phase}` }, at);
  f.record(phase, 'pass', passReceipt(f, phase, `checker-${phase}`), at);
}
function passReceipt(f, phase, actor) {
  const criterion = f.p.phases[phase - 1];
  return { actor, findings: 'carry forward', mergeSha: MERGE.mergeSha, mergeChecks: 'every required check green on the fixture merge SHA',
    evidence: criterion.acceptance.map((c) => ({ criterion: c, evidence: 'controlled fixture receipt', environment: criterion.environment })) };
}

test('explicit 72-hour authorization passes store, supervisor and preflight; ordinary waves keep 24 hours', (t) => {
  const f = fixture(t);
  assert.equal(nextStep(f.text(), NOW).action, 'paused');
  f.start();
  assert.equal(preflight({ context: 'coordinator', wave: f.file, now: NOW, run: networkPass }).ok, true);
  assert.match(openWave({ date: '2026-10-19', kind: 'day', until: f.p.authorization.deadline, dir: f.dir, now: NOW }).refusal, /24 hours/);
  for (const patch of [{ source: '' }, { scope: '' }, { deadline: 'forever' }, { deadline: iso(NOW) }, { startedAt: '2026-02-30T12:00:00Z' }]) {
    assert.throws(() => validateAuthorization({ ...authorization(), ...patch }, { now: NOW }));
  }
  assert.throws(() => validateAuthorization(authorization(), { now: NOW + 72 * HOUR }), /expired/);
});

test('a multi-day rehearsal pauses between phases, restarts without renewal and preserves findings', (t) => {
  const f = fixture(t);
  f.start(); finishPhase(f, 1);
  const before = readSteps(f.text());
  updateRun(f.db, f.p.id, 'pause', 'end first short block', NOW + 30 * 60_000);
  assert.equal(nextStep(f.text(), NOW).action, 'paused');
  assert.throws(() => f.record(2, 'build', { actor: 'builder-2' }), /paused/);
  const reopened = openWave({ date: '2026-10-19', kind: 'plan-fixture', until: f.p.authorization.deadline, dir: f.dir, now: NOW + 25 * HOUR });
  assert.equal(reopened.file, f.file);
  const other = openStore(f.dbPath);
  try {
    assert.equal(registerRun(other, f.manifest, NOW + 25 * HOUR).manifest.id, f.p.id);
    assert.throws(() => registerRun(other, { ...f.manifest, authorization: { ...f.p.authorization, deadline: iso(NOW + 80 * HOUR) } }, NOW + 25 * HOUR));
  } finally { other.close(); }
  f.start(NOW + 25 * HOUR);
  assert.match(nextStep(f.text(), NOW + 25 * HOUR).carry, /carry forward/);
  assert.deepEqual(readSteps(f.text()), before);
  finishPhase(f, 2, NOW + 25 * HOUR);
  updateRun(f.db, f.p.id, 'finish', '', NOW + 25 * HOUR);
  assert.equal(f.current().status, 'finished');
  assert.equal(f.current().authorization.deadline, authorization().deadline);
});

test('pause in flight asks the worker to checkpoint; the next block waits on it and repair history survives', async (t) => {
  const f = fixture(t); f.start();
  f.record(1, 'build', { actor: 'builder' }); f.record(1, 'landed', MERGE); f.record(1, 'check', { actor: 'checker' });
  f.record(1, 'fail', 'product: retain these findings');
  f.record(1, 'repair', { actor: 'repairer' });
  updateRun(f.db, f.p.id, 'pause', 'checkpoint in-flight worker', NOW);
  let deliveries = 0;
  const invoke = async (_adapter, request) => {
    if (request.operation === 'deliver') deliveries += 1;
    return { state: 'checkpointed', phase: 1, step: 'repair', blockId: request.workBlock.id, evidence: 'controlled worker checkpoint' };
  };
  assert.equal((await tickRun(f.db, f.p.id, { now: () => NOW, invoke })).verdict, 'paused');
  f.start(NOW + HOUR);
  assert.equal(nextStep(f.text(), NOW + HOUR).action, 'wait');
  assert.throws(() => f.record(1, 'repair', { actor: 'second-repairer' }, NOW + HOUR), /already launched/);
  f.record(1, 'landed', MERGE, NOW + HOUR);
  f.record(1, 'check', { actor: 'new-checker' }, NOW + HOUR);
  f.record(1, 'fail', 'product: second failure retained', NOW + HOUR);
  assert.equal(nextStep(f.text(), NOW + HOUR).action, 'diagnose');
  assert.equal(readSteps(f.text()).filter((s) => s.event === 'repair').length, 1);
  assert.equal(deliveries, 0);
});

test('stale owners, duplicate phases, omitted acceptance and builder-as-checker fail closed', (t) => {
  const f = fixture(t), old = f.start();
  assert.throws(() => f.start(NOW, 'competitor'), /already owns/);
  assert.match(recordStep(f.file, 1, 'build', '{}', NOW).refusal, /run-supervisor/);
  assert.throws(() => f.record(1, 'build', { actor: 'builder' }, NOW, { ...old, epoch: old.epoch - 1 }), /Stale/);
  f.record(1, 'build', { actor: 'builder' });
  assert.throws(() => f.record(1, 'build', { actor: 'competitor' }), /already launched/);
  f.record(1, 'landed', MERGE);
  assert.throws(() => f.record(1, 'check', { actor: 'builder' }), /independent/);
  f.record(1, 'check', { actor: 'checker' });
  assert.throws(() => f.record(1, 'pass', { actor: 'checker', evidence: [] }), /every criterion/);
  assert.throws(() => updateRun(f.db, f.p.id, 'finish', '', NOW), /every required phase/);
});

test('a replacement worker takes over its in-flight step through a fenced handoff and can finish it', (t) => {
  const f = fixture(t), authority = f.start();
  assert.throws(() => f.record(1, 'resume', { actor: 'early' }), /nothing in phase 1 is running/);
  f.record(1, 'build', { actor: 'builder-a' });
  // The idle builder is stopped; its replacement records itself before it is launched.
  assert.throws(() => f.record(1, 'resume', 'not a receipt'), /JSON actor/);
  assert.throws(() => f.record(1, 'resume', { actor: 'builder-b' }, NOW, { ...authority, epoch: authority.epoch - 1 }), /Stale/);
  f.record(1, 'resume', { actor: 'builder-b', branch: 'claude/p1-build' });
  assert.deepEqual(nextStep(f.text(), NOW), { action: 'wait', phase: 1, step: 'build', launched: '{"actor":"builder-b","branch":"claude/p1-build"}', id: 'prepare', title: 'Prepare generic input' });
  assert.throws(() => f.record(1, 'landed', 'merge observed'), /mergeSha/);
  assert.throws(() => f.record(1, 'landed', { mergeSha: 'abc123' }), /mergeSha/);
  f.record(1, 'landed', MERGE);
  // Every builder, original or replacement, is excluded from checking.
  for (const actor of ['builder-a', 'builder-b']) assert.throws(() => f.record(1, 'check', { actor }), /independent/);
  f.record(1, 'check', { actor: 'checker-a' });
  assert.throws(() => f.record(1, 'resume', { actor: 'builder-b' }), /independent/);
  f.record(1, 'resume', { actor: 'checker-b' });
  // PASS comes from the checker that now owns the check, and it waits for the exact-merge checks.
  assert.throws(() => f.record(1, 'pass', passReceipt(f, 1, 'checker-a')), /latest independent checker/);
  const { mergeChecks, ...early } = passReceipt(f, 1, 'checker-b');
  assert.ok(mergeChecks);
  assert.throws(() => f.record(1, 'pass', early), /mergeChecks/);
  assert.throws(() => f.record(1, 'pass', { ...passReceipt(f, 1, 'checker-b'), mergeSha: 'c'.repeat(40) }), /merge SHA the phase landed/);
  f.record(1, 'pass', passReceipt(f, 1, 'checker-b'));
  assert.deepEqual(readSteps(f.text()).map((s) => s.event), ['build', 'resume', 'landed', 'check', 'resume', 'pass']);
  assert.throws(() => f.record(1, 'resume', { actor: 'late' }), /nothing in phase 1 is running/);
  assert.equal(nextStep(f.text(), NOW).action, 'launch');
});

test('a second failure is diagnosed by an agent independent of everyone who worked on the phase', (t) => {
  const f = fixture(t); f.start();
  f.record(1, 'build', { actor: 'builder' }); f.record(1, 'landed', MERGE); f.record(1, 'check', { actor: 'checker' });
  f.record(1, 'fail', 'product: first');
  f.record(1, 'repair', { actor: 'repairer' }); f.record(1, 'landed', MERGE); f.record(1, 'check', { actor: 'checker-2' });
  f.record(1, 'fail', 'product: second');
  assert.equal(nextStep(f.text(), NOW).action, 'diagnose');
  for (const actor of ['builder', 'repairer', 'checker', 'checker-2']) {
    assert.throws(() => f.record(1, 'diagnose', { actor, decision: 'repair', reason: 'scope the fix' }), /deciding agent must be independent/);
  }
  assert.throws(() => f.record(1, 'diagnose', { actor: 'decider', decision: 'check', reason: 'rerun' }), /repair or stop/);
  assert.throws(() => f.record(1, 'diagnose', { actor: 'decider', decision: 'repair' }), /decision and its reason/);
  f.record(1, 'diagnose', { actor: 'decider', decision: 'repair', reason: 'the fixture input is parsed twice; fix only the parser' });
  assert.deepEqual(nextStep(f.text(), NOW), { action: 'launch', phase: 1, step: 'repair', carry: 'product: second (diagnosis: the fixture input is parsed twice; fix only the parser)', id: 'prepare', title: 'Prepare generic input' });
  f.record(1, 'repair', { actor: 'repairer-2' }); f.record(1, 'landed', MERGE); f.record(1, 'check', { actor: 'checker-3' });
  f.record(1, 'fail', 'product: third');
  assert.equal(nextStep(f.text(), NOW).action, 'stop');
  assert.throws(() => f.record(1, 'diagnose', { actor: 'decider-2', decision: 'repair', reason: 'again' }), /next event is stop/);
});

test('block end, cancellation and expiry stop launches and wakes', async (t) => {
  const f = fixture(t); f.start();
  assert.equal(nextStep(f.text(), NOW + HOUR).action, 'paused');
  assert.ok(holdable(f.text(), NOW + HOUR).why);
  const armed = writeWake(f.text(), { host: 'fixture', session: 'fixture', resume: '/never-run' });
  assert.equal(wakeVerdict({ text: armed, now: NOW + HOUR, inventory() { assert.fail('paused wake must not inspect or resume'); } }).verdict, 'over');
  assert.equal((await tickRun(f.db, f.p.id, { now: () => NOW, invoke() { assert.fail('no native substitution'); } })).verdict, 'unknown');
  assert.throws(() => f.record(1, 'build', { actor: 'builder' }, NOW + 72 * HOUR), /expired/);
  updateRun(f.db, f.p.id, 'cancel', 'owner cancellation fixture', NOW);
  assert.equal(nextStep(f.text(), NOW).action, 'cancelled');
  assert.throws(() => f.start(), /Terminal/);
  assert.equal(preflight({ context: 'coordinator', wave: f.file, now: NOW, run() { assert.fail('cancelled'); } }).ok, false);
});

test('uncertain accepted action is retained across restart and prohibits replay or block renewal', (t) => {
  const f = fixture(t); f.start();
  const row = f.db.prepare('SELECT doc FROM runs WHERE id=?').get(f.p.id), doc = JSON.parse(row.doc);
  doc.pending = { id: `${f.p.id}:1`, attempts: 1, retryAt: NOW, receipt: null, requestSha256: digest('accepted but ack lost') };
  f.db.prepare('UPDATE runs SET doc=? WHERE id=?').run(JSON.stringify(doc), f.p.id);
  updateRun(f.db, f.p.id, 'pause', 'reconcile original action', NOW);
  assert.throws(() => f.start(NOW + HOUR), /Uncertain external action/);
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT doc FROM runs WHERE id=?').get(f.p.id).doc).pending, doc.pending);
});

test('another database cannot acquire the same project, and missing or changed metadata fails closed', (t) => {
  const f = fixture(t), other = openStore(path.join(f.dir, 'competitor.sqlite'));
  try { assert.throws(() => registerRun(other, f.manifest, NOW), /another authoritative local store/); }
  finally { other.close(); }
  const authority = f.start();
  const original = f.text();
  for (const changed of [original.replace(/^Project: .+\n/m, ''), original.replace('Prepare generic input', 'Wrong phase')]) {
    writeFileSync(f.file, changed);
    assert.throws(() => f.record(1, 'build', { actor: 'builder' }, NOW, authority), /metadata missing|phase set/);
  }
  writeFileSync(f.file, original);
});

test('acknowledgement lost after phase acceptance never duplicates the controlled worker', (t) => {
  const f = fixture(t); f.start();
  const accepted = new Map();
  const controlledDispatch = () => {
    f.record(1, 'build', { actor: 'builder', actionId: 'stable-fixture-action' });
    accepted.set('stable-fixture-action', 'controlled-worker');
    throw Error('acknowledgement lost after acceptance');
  };
  assert.throws(controlledDispatch, /acknowledgement lost/);
  const restarted = openStore(f.dbPath);
  try {
    assert.equal(registerRun(restarted, f.manifest, NOW).manifest.id, f.p.id);
    assert.equal(nextStep(f.text(), NOW).action, 'wait');
    assert.throws(controlledDispatch, /already launched/);
    assert.equal(accepted.size, 1);
    assert.equal(readSteps(f.text()).filter((s) => s.event === 'build').length, 1);
  } finally { restarted.close(); }
});

test('mismatching checkpoint acknowledgement is not accepted; cancellation checkpoints the original worker', async (t) => {
  const f = fixture(t); f.start(); f.record(1, 'build', { actor: 'builder' });
  updateRun(f.db, f.p.id, 'pause', 'pause fixture', NOW);
  const bad = await tickRun(f.db, f.p.id, { now: () => NOW, invoke: async () => ({ state: 'checkpointed', phase: 1, step: 'build', blockId: 'wrong-block', evidence: 'wrong target' }) });
  assert.equal(bad.verdict, 'unknown');
  assert.equal(JSON.parse(f.db.prepare('SELECT doc FROM runs').get().doc).pauseReceipt, undefined);
  updateRun(f.db, f.p.id, 'cancel', 'owner cancels fixture', NOW);
  const operations = [];
  const cancelled = await tickRun(f.db, f.p.id, { now: () => NOW, invoke: async (_, request) => {
    operations.push(request.operation);
    return { state: 'checkpointed', phase: 1, step: 'build', blockId: request.workBlock.id, evidence: 'original worker stopped' };
  } });
  assert.equal(cancelled.verdict, 'cancelled');
  assert.deepEqual(operations, ['checkpoint']);
  assert.throws(() => f.start(), /Terminal/);
});

test('competing processes admit exactly one phase through the existing SQLite authority', async (t) => {
  const f = fixture(t), authority = f.start();
  const request = path.join(f.dir, 'authority.json'); writeFileSync(request, JSON.stringify(authority));
  const cli = async (actor) => {
    const child = spawn(process.execPath, ['scripts/run-supervisor.mjs', 'record', f.dbPath, f.p.id, '1', 'build', JSON.stringify({ actor }), '--authority', request], { cwd: path.resolve(import.meta.dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let output = ''; child.stdout.on('data', (s) => { output += s; }); child.stderr.on('data', (s) => { output += s; });
    return { code: (await once(child, 'close'))[0], output };
  };
  // CLI uses real time, so this fixture's one-hour block is set relative to the real clock.
  const p = f.current(); p.authorization.startedAt = iso(Date.now() - 1000); p.authorization.deadline = iso(Date.now() + 72 * HOUR);
  p.block.startedAt = iso(Date.now() - 1000); p.block.deadline = iso(Date.now() + HOUR);
  let text = f.text().replace(/^Window starts: .+$/m, `Window starts: ${p.authorization.startedAt}`).replace(/^Window ends: .+$/m, `Window ends: ${p.authorization.deadline}`);
  writeFileSync(f.file, writeProject(text, p));
  const row = JSON.parse(f.db.prepare('SELECT doc FROM runs WHERE id=?').get(f.p.id).doc);
  row.manifest.authorization = p.authorization;
  const { immutableProject } = await import('./project-authorization.mjs');
  row.projectAuthorization = immutableProject(p); row.projectState = digest(p);
  f.db.prepare('UPDATE runs SET doc=? WHERE id=?').run(JSON.stringify(row), f.p.id);
  const results = await Promise.all([cli('caller-a'), cli('caller-b')]);
  assert.deepEqual(results.map((r) => r.code).sort(), [0, 1], JSON.stringify(results));
  assert.equal(readSteps(f.text()).filter((s) => s.event === 'build').length, 1);
});

test('an owner phase is handed over, never launched, and its build is recorded when he starts', (t) => {
  const f = fixture(t, (p) => { p.phases[1].environment = "OW: the owner's laptop and the real studio"; return p; });
  f.start(); finishPhase(f, 1);
  const owed = nextStep(f.text(), NOW);
  assert.deepEqual([owed.action, owed.phase, owed.step, owed.id, owed.launched], ['owner', 2, 'build', 'accept', undefined]);
  assert.match(owed.why, /hand-over/);
  // The coordinator waits on him: its quiet session is alive, not stopped, and still qualifies.
  const armed = writeWake(f.text(), { host: 'fixture', session: 'coordinator', resume: '/never-run' });
  const wake = wakeVerdict({ text: armed, now: NOW, stopped: () => ({ resetsAt: null }),
    inventory: { available: true, rows: [{ sessionId: 'coordinator', pid: 100 }] } });
  assert.deepEqual([wake.verdict, wake.why], ['alive', "session coordinator is waiting on the owner's phase 2"]);
  assert.equal(preflight({ context: 'coordinator', wave: f.file, now: NOW, run: networkPass }).ok, true);
  f.record(2, 'build', { actor: 'owner', handover: 'issue comment' });
  assert.deepEqual([nextStep(f.text(), NOW).action, nextStep(f.text(), NOW).launched], ['owner', '{"actor":"owner","handover":"issue comment"}']);
  assert.throws(() => f.record(2, 'build', { actor: 'owner' }), /already launched/);
  f.record(2, 'landed', MERGE);
  assert.equal(nextStep(f.text(), NOW).action, 'launch');
  f.record(2, 'check', { actor: 'checker-2' });
  f.record(2, 'pass', passReceipt(f, 2, 'checker-2'));
  assert.equal(nextStep(f.text(), NOW).action, 'done');
});

test('a phase is named by its row or its project id, never by a guess', (t) => {
  const f = fixture(t);
  assert.equal(phaseNumber(f.db, f.p.id, '2'), 2);
  assert.equal(phaseNumber(f.db, f.p.id, 'accept'), 2);
  assert.throws(() => phaseNumber(f.db, f.p.id, 'E9'), /No phase "E9"/);
  // A number that is one phase's id and another's row is refused, never guessed.
  const numeric = fixture(t, (p) => { p.phases[0].id = '2'; p.phases[1].dependsOn = ['2']; return p; });
  assert.throws(() => phaseNumber(numeric.db, numeric.p.id, '2'), /Ambiguous phase "2": it is the id of row 1 and also row 2/);
  assert.equal(phaseNumber(numeric.db, numeric.p.id, 'accept'), 2);
});

test('remaining-work numeric phase IDs resolve unless an existing row conflicts', (t) => {
  const numbered = (ids) => fixture(t, (p) => {
    p.phases.forEach((phase, index) => {
      phase.id = ids[index];
      phase.dependsOn = index ? [ids[index - 1]] : [];
    });
    return p;
  });
  const remaining = numbered(['51', '52']);
  assert.equal(phaseNumber(remaining.db, remaining.p.id, '51'), 1);
  assert.equal(phaseNumber(remaining.db, remaining.p.id, '52'), 2);
  // Preserve the documented row-number fallback; do not migrate existing project identities.
  assert.equal(phaseNumber(remaining.db, remaining.p.id, '2'), 2);
  assert.throws(() => phaseNumber(remaining.db, remaining.p.id, '53'), /No phase "53"/);
  assert.throws(() => phaseNumber(remaining.db, remaining.p.id, '0'), /No phase "0"/);
  const matching = numbered(['1', '2']);
  assert.equal(phaseNumber(matching.db, matching.p.id, '1'), 1);
  assert.equal(phaseNumber(matching.db, matching.p.id, '2'), 2);
  const collision = numbered(['2', '1']);
  assert.throws(() => phaseNumber(collision.db, collision.p.id, '2'), /Ambiguous phase/);
});

test("a block renews only under the owner's standing permission, only after it ended, never after his pause", (t) => {
  const plain = fixture(t);
  plain.start();
  assert.throws(() => renewBlock(plain.db, plain.p.id, NOW + 2 * HOUR), /no standing permission/);
  const words = 'open the next block yourself every day until the deadline';
  const f = fixture(t, (p) => { p.authorization.standing = { blockRenewal: words }; return p; });
  const first = f.start();
  assert.deepEqual(renewBlock(f.db, f.p.id, NOW + 30 * 60_000), { renewed: false, block: first });
  const renewed = renewBlock(f.db, f.p.id, NOW + 2 * HOUR);
  assert.equal(renewed.renewed, true);
  assert.equal(renewed.block.epoch, first.epoch + 1);
  assert.equal(renewed.block.owner, first.owner);
  assert.equal(Date.parse(renewed.block.deadline), NOW + 26 * HOUR);
  assert.match(f.current().reason, /standing permission: open the next block yourself/);
  // The last block ends with the project, never past it.
  const late = renewBlock(f.db, f.p.id, NOW + 60 * HOUR);
  assert.equal(Date.parse(late.block.deadline), Date.parse(f.p.authorization.deadline));
  updateRun(f.db, f.p.id, 'pause', 'owner paused the run', NOW + 61 * HOUR);
  assert.throws(() => renewBlock(f.db, f.p.id, NOW + 62 * HOUR), /only the owner resumes it/);
  assert.throws(() => validateAuthorization({ ...authorization(), standing: { blockRenewal: '' } }, { now: NOW }), /owner's words/);
});
