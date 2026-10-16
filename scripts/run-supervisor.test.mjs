// gate: build
// guards: scripts/run-supervisor.mjs
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { openStore, PACKET_BYTES, registerRun, tickRun, updateRun, validatePacket } from './run-supervisor.mjs';

const SCRIPT = fileURLToPath(new URL('./run-supervisor.mjs', import.meta.url));
const packet = () => ({ objective: 'Finish the prepared plan', acceptance: ['Every phase independently checked'],
  phase: 1, tasks: ['build recorded; reconcile its worker'], decisions: [], constraints: ['Only prepared phases'],
  files: ['docs/work-specs/example/spec.md'], workspace: { branch: 'test/phase-1', worktree: 'reconstruct from origin' },
  commits: [], verification: ['not yet checked'], blockers: [], nextAction: 'Reconcile phase 1 worker and GitHub before launching', evidence: ['wave file'] });

// An inert provider with a durable action journal. It spends no model tokens and owns only test
// processes. Its action-ID deduplication is an adapter contract, not a property of real providers.
const ADAPTER = `
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let input=''; for await (const chunk of process.stdin) input+=chunk;
const request=JSON.parse(input);
const db=new DatabaseSync('provider.sqlite');
db.exec('PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS actions(id TEXT PRIMARY KEY,worker TEXT,state TEXT)');
let result;
if(request.operation==='inspect') {
  let owner; try { owner=JSON.parse(readFileSync('worker.json')); } catch {}
  let live=false; try { if(owner) { process.kill(owner.pid,0); live=true; } } catch {}
  result=live?{state:'running',workerId:owner.workerId}:{state:'gone'};
} else if(request.operation==='reconcile') {
  const row=db.prepare('SELECT worker,state FROM actions WHERE id=?').get(request.actionId);
  result=row?(row.state==='delivered'?{state:'delivered',workerId:row.worker}:{state:'unknown'}):{state:'absent'};
} else if(request.operation==='deliver') {
  if(Date.now()>=Date.parse(request.authorization.deadline)||Date.now()>=request.leaseUntil) throw new Error('expired');
  db.exec('BEGIN IMMEDIATE');
  const old=db.prepare('SELECT worker,state FROM actions WHERE id=?').get(request.actionId);
  if(old) { db.exec('COMMIT'); result=old.state==='delivered'?{state:'delivered',workerId:old.worker}:{state:'unknown'}; }
  else {
    const workerId=request.actionId;
    db.prepare('INSERT INTO actions VALUES(?,?,?)').run(request.actionId,workerId,'prepared');
    db.exec('COMMIT'); // An uncertain provider launch remains unknown and can never spawn twice.
    const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{detached:true,windowsHide:true,stdio:'ignore'});
    child.unref();
    writeFileSync('worker.json',JSON.stringify({pid:child.pid,workerId}));
    db.prepare('UPDATE actions SET state=? WHERE id=?').run('delivered',request.actionId);
    writeFileSync('delivered-packet.json',JSON.stringify(request));
    result={state:'delivered',workerId};
    if(existsSync('crash-supervisor')) { unlinkSync('crash-supervisor'); process.kill(process.ppid,'SIGKILL'); }
  }
}
db.close(); process.stdout.write(JSON.stringify(result));
`;

function fixture(t) {
  const dir = mkdtempSync(path.join(tmpdir(), 'noacg-supervisor-'));
  const wave = path.join(dir, 'wave.md'), database = path.join(dir, 'control.sqlite');
  const now = Date.now(), deadline = new Date(now + 7_200_000).toISOString();
  writeFileSync(wave, `# Plan run\nWindow starts: ${new Date(now).toISOString()}\nWindow ends: ${deadline}\n\n## Phases\n1. Prepared phase; acceptance in spec\n`);
  writeFileSync(path.join(dir, 'adapter.mjs'), ADAPTER);
  const manifest = { version: 1, id: 'test-run', kind: 'plan', wave,
    authorization: { source: 'test fixture', scope: 'prepared test phase only', permissionPolicy: 'inert Node test processes only', startedAt: new Date(now).toISOString(), deadline },
    adapter: { command: process.execPath, args: [path.join(dir, 'adapter.mjs')], cwd: dir }, packet: packet() };
  const db = openStore(database);
  registerRun(db, manifest, now);
  t.after(() => {
    try { const owner = JSON.parse(readFileSync(path.join(dir, 'worker.json'))); process.kill(owner.pid, 'SIGKILL'); } catch {}
    db.close();
    // dir comes only from mkdtemp under the platform temp directory.
    assert.equal(path.dirname(path.resolve(dir)), path.resolve(tmpdir()));
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  return { dir, wave, database, manifest, db, now };
}

async function cli(database, command = 'tick') {
  const child = spawn(process.execPath, [SCRIPT, command, database], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '', err = '';
  child.stdout.on('data', (s) => { out += s; }); child.stderr.on('data', (s) => { err += s; });
  const [code, signal] = await once(child, 'close');
  return { code, signal, out, err, result: out.trim() ? JSON.parse(out) : null };
}

function actionCount(dir) {
  const db = openStore(path.join(dir, 'provider.sqlite'));
  try { return db.prepare('SELECT COUNT(*) AS count FROM actions').get().count; } finally { db.close(); }
}

test('quiet live coordinator, killed coordinator, restarted supervisor, simultaneous and duplicate wakes', async (t) => {
  const f = fixture(t);
  const coordinator = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { windowsHide: true, stdio: 'ignore' });
  await once(coordinator, 'spawn');
  writeFileSync(path.join(f.dir, 'worker.json'), JSON.stringify({ pid: coordinator.pid, workerId: 'original' }));
  const healthyStart = performance.now();
  assert.equal((await cli(f.database)).result[0].verdict, 'alive');
  const healthyMs = performance.now() - healthyStart;
  const exited = once(coordinator, 'exit'); coordinator.kill('SIGKILL'); await exited;
  const recoveryStart = performance.now();
  const wakes = await Promise.all([cli(f.database), cli(f.database)]);
  assert.equal(wakes.filter((r) => r.result[0].verdict === 'resumed').length, 1);
  assert.equal(actionCount(f.dir), 1);
  assert.equal((await cli(f.database)).result[0].verdict, 'alive');
  const request = JSON.parse(readFileSync(path.join(f.dir, 'delivered-packet.json')));
  assert.deepEqual(request.authorization, f.manifest.authorization);
  assert.equal(request.packet.ledger.action, 'launch');
  assert.equal(request.packet.objective, f.manifest.packet.objective);
  assert.equal(request.packet.ledger.phase, 1);
  assert.ok(!JSON.stringify(request).includes('transcript'));
  t.diagnostic(JSON.stringify({ healthyMs, recoveryAndDuplicateMs: performance.now() - recoveryStart, packetBytes: Buffer.byteLength(JSON.stringify(request.packet)), modelCalls: 0 }));
});

test('supervisor killed after external success reconciles receipt after lease expiry without redelivery', async (t) => {
  const f = fixture(t);
  writeFileSync(path.join(f.dir, 'crash-supervisor'), 'once');
  const crashed = await cli(f.database);
  assert.notEqual(crashed.code, 0);
  assert.equal(actionCount(f.dir), 1);
  const before = JSON.parse(f.db.prepare('SELECT doc FROM runs').get().doc);
  assert.equal(before.pending.receipt, undefined);
  assert.equal((await tickRun(f.db, 'test-run')).verdict, 'leased');
  // Advance the deterministic clock past the abandoned lease; no wall-clock inactivity heuristic.
  assert.equal((await tickRun(f.db, 'test-run', { now: () => f.now + 61_000 })).verdict, 'alive');
  assert.equal(actionCount(f.dir), 1);
});

test('owner, permission and dependency waits need explicit answers; usage waits honor their reset', async (t) => {
  const f = fixture(t); let calls = 0;
  const invoke = async (_, request) => { calls += 1; return request.operation === 'inspect' ? { state: 'gone' } : { state: 'delivered', workerId: 'new' }; };
  for (const kind of ['owner', 'permission', 'dependency']) {
    updateRun(f.db, 'test-run', 'wait', { kind, reason: 'explicit prerequisite', until: new Date(f.now - 1).toISOString() });
    assert.equal((await tickRun(f.db, 'test-run', { invoke })).verdict, 'waiting');
    assert.equal(calls, 0);
    updateRun(f.db, 'test-run', 'clear-wait', 'prerequisite resolved');
  }
  const until = new Date(f.now + 3600_000).toISOString();
  const wait = { kind: 'usage', reason: 'subscription reset', until };
  updateRun(f.db, 'test-run', 'wait', wait);
  assert.equal((await tickRun(f.db, 'test-run', { now: () => f.now, invoke })).verdict, 'waiting');
  assert.equal(calls, 0);
  const resetAdapter = async (_, request) => request.operation === 'inspect'
    ? { state: 'waiting', wait } : { state: 'delivered', workerId: 'same-coordinator-next-turn' };
  assert.equal((await tickRun(f.db, 'test-run', { now: () => Date.parse(until), invoke: resetAdapter })).verdict, 'resumed');
});

test('usage wait without a reset stays waiting; a healthy long command never uses transcript age', async (t) => {
  const f = fixture(t);
  const wait = { kind: 'usage', reason: 'unknown reset', until: null };
  assert.equal((await tickRun(f.db, 'test-run', { invoke: async () => ({ state: 'waiting', wait }) })).verdict, 'waiting');
  assert.equal((await tickRun(f.db, 'test-run', { invoke: async () => { throw new Error('must not call'); } })).verdict, 'waiting');
});

for (const terminal of ['finish', 'cancel', 'report', 'expiry']) test(`${terminal} never restarts`, async (t) => {
  const f = fixture(t);
  if (terminal === 'report') writeFileSync(f.wave, `${readFileSync(f.wave, 'utf8')}\n## Report\nDone\n`);
  else if (terminal !== 'expiry') updateRun(f.db, 'test-run', terminal);
  const expected = { finish: 'finished', cancel: 'cancelled', report: 'finished', expiry: 'expired' }[terminal];
  const options = { now: () => terminal === 'expiry' ? f.now + 7_200_000 : Date.now(), invoke: async () => { throw new Error('must not call'); } };
  assert.equal((await tickRun(f.db, 'test-run', options)).verdict, expected);
  assert.equal((await tickRun(f.db, 'test-run', options)).verdict, expected);
});

test('confirmed non-delivery has bounded backoff and one stable action; unknown delivery blocks', async (t) => {
  const f = fixture(t); let clock = f.now, delivered = 0;
  const invoke = async (_, request) => {
    if (request.operation === 'inspect') return { state: 'gone' };
    if (request.operation === 'reconcile') return { state: 'absent' };
    delivered += 1; return { state: 'not-delivered' };
  };
  const opts = { now: () => clock, invoke };
  const first = await tickRun(f.db, 'test-run', opts);
  assert.equal(first.verdict, 'waiting');
  assert.equal((await tickRun(f.db, 'test-run', opts)).verdict, 'waiting'); assert.equal(delivered, 1);
  for (let i = 0; i < 2; i += 1) { clock += 120_000; assert.equal((await tickRun(f.db, 'test-run', opts)).actionId, first.actionId); }
  clock += 120_000;
  assert.equal((await tickRun(f.db, 'test-run', opts)).verdict, 'blocked'); assert.equal(delivered, 3);
  assert.equal((await tickRun(f.db, 'test-run', { ...opts, invoke: async () => ({ state: 'unknown' }) })).verdict, 'unknown');
  assert.equal(delivered, 3);
});

test('invalid receipts and a replaced lease cannot write state or deliver', async (t) => {
  const f = fixture(t); let delivered = 0;
  const invoke = async (_, request) => {
    if (request.operation === 'inspect') {
      updateRun(f.db, 'test-run', 'wait', { kind: 'owner', reason: 'new owner fenced old tick', until: null });
      return { state: 'gone' };
    }
    delivered += 1; return { state: 'delivered' };
  };
  assert.match((await tickRun(f.db, 'test-run', { invoke })).why, /Lease lost/);
  assert.equal(delivered, 0);
  updateRun(f.db, 'test-run', 'clear-wait', 'owner answered');
  assert.match((await tickRun(f.db, 'test-run', { invoke: async (_, request) => request.operation === 'inspect' ? { state: 'gone' } : { state: 'delivered' } })).why, /workerId/);
});

test('bounded checkpoints preserve authorization, phase progress, and immutable registration', (t) => {
  const f = fixture(t);
  assert.throws(() => registerRun(f.db, { ...f.manifest, authorization: { ...f.manifest.authorization, deadline: new Date(f.now + MAX_SAFE_WINDOW).toISOString() } }), /24 hours/);
  assert.throws(() => registerRun(f.db, { ...f.manifest, authorization: { ...f.manifest.authorization, permissionPolicy: 'broader' } }), /immutable/);
  assert.throws(() => registerRun(f.db, { ...f.manifest, id: 'other', authorization: { ...f.manifest.authorization, startedAt: new Date(f.now - 1000).toISOString() } }), /window differs/);
  assert.throws(() => validatePacket({ ...packet(), decisions: ['x'.repeat(PACKET_BYTES)] }), /16 KiB/);
  assert.throws(() => updateRun(f.db, 'test-run', 'checkpoint', { ...packet(), objective: 'different goal' }), /authorized/);
  assert.throws(() => updateRun(f.db, 'test-run', 'wait', { kind: 'usage', reason: 'bad date', until: '2026-02-30T10:00:00Z' }), /Wait needs/);
  const next = { ...packet(), phase: 2, commits: ['verified-sha'], verification: ['phase 1 passed'], nextAction: 'Build phase 2' };
  assert.equal(updateRun(f.db, 'test-run', 'checkpoint', next).packet.phase, 2);
  assert.deepEqual(JSON.parse(f.db.prepare('SELECT doc FROM runs').get().doc).manifest.authorization, f.manifest.authorization);
  assert.ok(existsSync(f.database));
});

test('an edited wave window cannot renew a registered run', async (t) => {
  const f = fixture(t);
  writeFileSync(f.wave, readFileSync(f.wave, 'utf8').replace(f.manifest.authorization.startedAt, new Date(f.now - 1000).toISOString()));
  assert.match((await tickRun(f.db, 'test-run', { invoke: async () => { throw new Error('must not call'); } })).why, /authorization changed/);
});

test('a degraded first run does not prevent another run from being inspected', async (t) => {
  const f = fixture(t);
  const wave = path.join(f.dir, 'second.md'); writeFileSync(wave, readFileSync(f.wave));
  registerRun(f.db, { ...f.manifest, id: 'second', wave, kind: 'wave' });
  const seen = [];
  const invoke = async (_, request) => {
    seen.push(request.runId);
    return request.runId === 'test-run' ? { state: 'unknown' } : { state: 'running', workerId: 'second-worker' };
  };
  assert.equal((await tickRun(f.db, 'test-run', { invoke })).verdict, 'unknown');
  assert.equal((await tickRun(f.db, 'second', { invoke })).verdict, 'alive');
  assert.deepEqual(seen, ['test-run', 'second']);
});

test('a large ledger carry cannot exceed the recovery packet bound', async (t) => {
  const f = fixture(t); let deliveries = 0;
  writeFileSync(f.wave, `${readFileSync(f.wave, 'utf8')}2. Next phase\n\n- ${new Date(f.now).toISOString()} phase 1 build b\n- ${new Date(f.now).toISOString()} phase 1 landed sha\n- ${new Date(f.now).toISOString()} phase 1 check c\n- ${new Date(f.now).toISOString()} phase 1 pass ${'x'.repeat(PACKET_BYTES)}\n`);
  const result = await tickRun(f.db, 'test-run', { invoke: async (_, request) => {
    if (request.operation === 'inspect') return { state: 'gone' };
    deliveries += 1; return { state: 'delivered', workerId: 'new' };
  } });
  assert.match(result.why, /16 KiB/); assert.equal(deliveries, 0);
});
const MAX_SAFE_WINDOW = 25 * 3600_000;
