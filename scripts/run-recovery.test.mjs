// gate: build
// guards: scripts/run-recovery.mjs, scripts/run-supervisor.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { devNull, tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { continueProject, main, openStore, recordRun, registerRun, tickRun, updateRun } from './run-supervisor.mjs';
import { publishRun, recoveryGit, restoredObservation, restoreRun } from './run-recovery.mjs';
import { readProject, writeProject } from './project-authorization.mjs';
import { nextStep } from './plan-run.mjs';

// Defense in depth: every child git process is restricted to the temporary file remote.
process.env.GIT_ALLOW_PROTOCOL = 'file';

const hash = (s) => createHash('sha256').update(s).digest('hex');
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }).trim();
const docFor = (db) => JSON.parse(db.prepare('SELECT doc FROM runs').get().doc);
const remoteUrl = 'https://github.com/NoaCG/recovery-test.git';

function fixture(t, adapterArgs = ['-e', ''], prepareSource = () => {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'noacg-recovery-'));
  const dbs = [];
  t.after(() => { for (const d of dbs) { try { d.close(); } catch { /* The loss test may already have closed this handle. */ } } rmSync(root, { recursive: true, force: true }); });
  const remote = path.join(root, 'remote.git'), source = path.join(root, 'source');
  git(root, 'init', '--bare', remote);
  git(root, 'init', '-b', 'codex/test', source);
  const configure = (repo) => {
    git(repo, 'config', 'user.name', 'Recovery Test'); git(repo, 'config', 'user.email', 'recovery@example.test');
    // Exercise real git transport/CAS without an external account or test-only production path.
    git(repo, 'config', `url.${remote}.insteadOf`, remoteUrl);
  };
  configure(source); git(source, 'remote', 'add', 'origin', remoteUrl);
  writeFileSync(path.join(source, 'spec.md'), 'Accept recovery after filesystem loss.\n');
  writeFileSync(path.join(source, 'evidence.md'), 'Owned evidence.\n');
  git(source, 'add', '.'); git(source, 'commit', '-m', 'Prepared source'); git(source, 'push', '-u', 'origin', 'codex/test');
  const revision = git(source, 'rev-parse', 'HEAD');
  const now = Date.now(), startedAt = new Date(now).toISOString(), deadline = new Date(now + 7_200_000).toISOString();
  const wave = path.join(root, 'wave.md');
  writeFileSync(wave, `# Plan run\nWindow starts: ${startedAt}\nWindow ends: ${deadline}\n\n## Phases\n1. Restore and check\n`);
  const recovery = { repository: source, remote: 'origin', repositoryFullName: 'NoaCG/recovery-test' };
  const manifest = { version: 1, id: 'restoration-test', kind: 'plan', wave, recovery,
    authorization: { source: 'test authorization', scope: 'inert recovery test', permissionPolicy: 'test adapter only', startedAt, deadline },
    adapter: { command: process.execPath, args: adapterArgs, cwd: source },
    packet: { objective: 'Restore owned work', acceptance: ['No duplicate dispatch'], phase: 1, tasks: [], decisions: [], constraints: [], files: [],
      workspace: { branch: 'codex/test', worktree: source }, commits: [revision], verification: [], blockers: [], evidence: ['evidence.md'], nextAction: 'Reconcile native and GitHub state',
      recovery: { branch: 'codex/test', revision,
        spec: { path: 'spec.md', sha256: hash(readFileSync(path.join(source, 'spec.md'))) },
        evidence: [{ path: 'evidence.md', sha256: hash(readFileSync(path.join(source, 'evidence.md'))) }],
        native: { provider: 'codex', sessionId: 'native-owner', environmentId: 'original-environment', policySha256: hash('original policy') },
        repairOwners: [{ prNumber: 42, commentId: 123, sessionId: 'native-owner', headSha: revision }] } } };
  // A fault-injection hook: `fault(args, call)` may throw instead of, or after, calling git.
  let fault = null;
  const transport = (cwd, args, input) => {
    const call = () => recoveryGit(cwd, args, input);
    const result = fault ? fault(args, call) : call();
    // The file-only transport stands in for this exact configured repository. Other
    // effective destinations remain unchanged, so forks/mirrors must still be rejected.
    return args[0] === 'remote' && args[1] === 'get-url'
      ? result.split('\n').map((url) => url === remote ? remoteUrl : url).join('\n') : result;
  };
  const open = (name) => { const db = openStore(path.join(root, name), { recoveryGit: transport }); dbs.push(db); return db; };
  const db = open('control.sqlite');
  prepareSource({ source, remote, root, manifest, wave, now });
  registerRun(db, manifest, now);
  let clones = 0;
  const bootstrap = () => {
    const repo = path.join(root, `bootstrap-${clones += 1}`);
    git(root, 'init', repo); configure(repo); git(repo, 'remote', 'add', 'origin', remoteUrl);
    return repo;
  };
  const restore = (clock = now) => {
    const repository = bootstrap(), database = path.join(root, `fresh-${dbs.length}.sqlite`), fresh = open(path.basename(database));
    const config = { ...recovery, repository, id: manifest.id, worktree: path.join(root, `restored-${dbs.length}`), wave: path.join(root, `ledger-${dbs.length}.md`),
      adapter: { command: process.execPath, args: ['-e', ''], cwd: repository } };
    return { db: fresh, database, config, result: restoreRun(fresh, config, clock) };
  };
  return { root, remote, source, manifest, db, now, restore, open, transport, bootstrap, inject: (hook) => { fault = hook; } };
}

function receipt(doc, now) {
  const r = doc.packet.recovery;
  return { checkpoint: doc.restoration.checkpoint, evidence: 'fresh native and GitHub read-back',
    native: { ...r.native, revision: r.revision, observedAt: new Date(now).toISOString(), evidence: 'native inspection', state: 'idle', pendingTurn: false },
    github: r.repairOwners.map((o) => ({ ...o, repositoryFullName: doc.manifest.recovery.repositoryFullName, ownerSessionId: o.sessionId, state: 'open', observedAt: new Date(now).toISOString(), evidence: 'PR and owner comment reads' })) };
}

const HOUR = 3_600_000;
const blockOf = (wave) => readProject(readFileSync(wave, 'utf8')).block;
const ledgerAt = (f) => JSON.parse(git(f.remote, 'show', `refs/noacg-recovery/${f.manifest.id}:checkpoint.json`)).ledger;

/** A 72-hour project named as `continue` finds it; `open` starts a block on the original host,
 * `inFlight` also records a build there. */
function projectFixture(t, { open = true, inFlight = false, id = 'plan-fixture-2030-01-01' } = {}) {
  const f = fixture(t, ['-e', ''], ({ manifest, wave, now }) => {
    manifest.id = id;
    manifest.authorization.deadline = new Date(now + 72 * HOUR).toISOString();
    const project = { version: 1, id: manifest.id, ownership: 'local-single-owner', authorization: manifest.authorization,
      status: 'paused', reason: 'restore fixture only', phases: [{ id: 'restore', title: 'Restore and check', dependsOn: [], acceptance: ['restore verified'], environment: 'controlled-fixture' }] };
    writeFileSync(wave, writeProject(readFileSync(wave, 'utf8').replace(/^Window ends: .+$/m, `Window ends: ${manifest.authorization.deadline}`), project));
  });
  if (open) updateRun(f.db, f.manifest.id, 'start-block', { owner: 'session-a', deadline: new Date(f.now + 12 * HOUR).toISOString(), evidence: 'fixture block' }, f.now);
  if (inFlight) recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: f.now, authority: blockOf(f.manifest.wave) });
  // A new session typing the same /plan-run line: its own clone and an empty state root.
  f.continueAs = (owner, now = f.now + 1000) => continueProject(path.join(f.root, `state-${owner}`),
    { plan: 'fixture', owner, ...f.manifest.recovery, repository: f.bootstrap() }, { now, recoveryGit: f.transport });
  return f;
}

test('multi-day project restoration preserves authorization and continues under a new block', async (t) => {
  const f = projectFixture(t, { open: false }), clock = f.now + 25 * HOUR;
  const restored = f.restore(clock);
  const doc = docFor(restored.db), project = readProject(readFileSync(restored.config.wave, 'utf8'));
  assert.equal(doc.manifest.authorization.deadline, f.manifest.authorization.deadline);
  assert.equal(project.id, f.manifest.id);
  assert.equal(project.authorization.deadline, f.manifest.authorization.deadline);
  assert.equal((await tickRun(restored.db, f.manifest.id, { now: () => clock, invoke() { assert.fail('a project tick launches nothing'); } })).verdict, 'paused');
  updateRun(restored.db, f.manifest.id, 'start-block', { owner: 'session-b', deadline: new Date(clock + HOUR).toISOString(), evidence: 'restored' }, clock);
  recordRun(restored.db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: clock, authority: blockOf(restored.config.wave) });
  assert.match(ledgerAt(f), /phase 1 build/);
});

test('a stopped coordinator\'s project continues in a new session after full filesystem loss, waiting on its in-flight step', (t) => {
  const f = projectFixture(t, { inFlight: true }), oldBlock = blockOf(f.manifest.wave);
  f.db.close(); rmSync(f.source, { recursive: true, force: true }); rmSync(f.manifest.wave); rmSync(path.join(f.root, 'control.sqlite'));
  const continued = f.continueAs('session-b');
  assert.equal(continued.verdict, 'continued');
  assert.equal(continued.id, f.manifest.id);
  assert.equal(continued.block.epoch, oldBlock.epoch + 1);
  assert.match(readFileSync(continued.wave, 'utf8'), /phase 1 build \{"actor":"builder"\}/);
  // The in-flight build is waited on and reconciled, never relaunched.
  assert.equal(continued.next.action, 'wait');
  const db = f.open(path.relative(f.root, continued.db));
  assert.throws(() => recordRun(db, f.manifest.id, 1, 'build', '{"actor":"second-builder"}', { now: f.now + 1000, authority: continued.block }), /already launched/);
  recordRun(db, f.manifest.id, 1, 'landed', 'merged', { now: f.now + 1000, authority: continued.block });
  assert.match(ledgerAt(f), /phase 1 build[\s\S]*phase 1 landed merged/);
});

test('a cloud checkout whose remote spells the repository in another case still continues the project', (t) => {
  // Claude cloud clones https://github.com/NoaCG/noacg-studio: GitHub names are case-insensitive.
  const f = projectFixture(t);
  const continued = continueProject(path.join(f.root, 'state-cloud'), { plan: 'fixture', owner: 'cloud', ...f.manifest.recovery,
    repositoryFullName: f.manifest.recovery.repositoryFullName.toLowerCase(), repository: f.bootstrap() }, { now: f.now + 1000, recoveryGit: f.transport });
  assert.equal(continued.verdict, 'continued');
  assert.equal(remoteLedger(f).doc.manifest.recovery.repositoryFullName, f.manifest.recovery.repositoryFullName);
});

test('the older coordinator is superseded: its record, next and tick are refused and launch nothing', async (t) => {
  const f = projectFixture(t), oldBlock = blockOf(f.manifest.wave), before = readFileSync(f.manifest.wave, 'utf8');
  assert.equal(f.continueAs('session-b').verdict, 'continued');
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"stale-builder"}', { now: f.now + 1000, authority: oldBlock }), /^Error: superseded: another coordinator continued this project; stop$/);
  assert.equal(readFileSync(f.manifest.wave, 'utf8'), before);
  const tick = await tickRun(f.db, f.manifest.id, { now: () => f.now + 1000, invoke() { assert.fail('superseded coordinator launches nothing'); } });
  assert.equal(tick.verdict, 'superseded');
  assert.equal(await main(['next', path.join(f.root, 'control.sqlite'), f.manifest.id], { recoveryGit: f.transport }), 1);
  // A third session takes over from the second the same way.
  const second = f.continueAs('session-b'), third = f.continueAs('session-c');
  assert.equal(third.block.epoch, second.block.epoch + 1);
  const stale = f.open(path.relative(f.root, second.db));
  assert.throws(() => recordRun(stale, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: f.now + 1000, authority: second.block }), /superseded/);
});

test('continue answers open when the plan has no active project; cancelled and expired stay terminal', (t) => {
  const f = projectFixture(t);
  assert.equal(f.continueAs('session-b', Date.parse(f.manifest.authorization.deadline)).verdict, 'open');
  updateRun(f.db, f.manifest.id, 'cancel', 'owner cancels the fixture', f.now);
  const answer = f.continueAs('session-c');
  assert.equal(answer.verdict, 'open');
  assert.deepEqual(readdirSync(path.join(f.root, 'state-session-c')), []);
  // Another plan whose name starts with this one's is never continued in its place.
  assert.equal(projectFixture(t, { id: 'plan-fixture-v2-2030-01-01' }).continueAs('session-d').verdict, 'open');
});

test('a network failure after the restore claimed the project says to run continue again, which then succeeds', (t) => {
  const f = projectFixture(t), ref = `refs/noacg-recovery/${f.manifest.id}`;
  let failNext = true;
  const flaky = (cwd, args, input) => {
    if (failNext && args[0] === 'ls-remote' && args[2] === ref) { failNext = false; throw new Error('Could not resolve host: github.com'); }
    return f.transport(cwd, args, input);
  };
  assert.throws(() => continueProject(path.join(f.root, 'state-flaky'), { plan: 'fixture', owner: 'session-b', ...f.manifest.recovery, repository: f.bootstrap() },
    { now: f.now + 1000, recoveryGit: flaky }), /Could not resolve host[\s\S]*run continue again/);
  assert.equal(f.continueAs('session-b').verdict, 'continued');
});

test('a continued project with a recorded wait is owned by the new session, which resolves it and opens its block', (t) => {
  const f = projectFixture(t);
  updateRun(f.db, f.manifest.id, 'wait', { kind: 'owner', reason: 'owner decides the next phase', until: null }, f.now);
  const blocked = f.continueAs('session-b');
  assert.equal(blocked.verdict, 'blocked');
  assert.match(blocked.why, /blocked prerequisite/);
  const db = f.open(path.relative(f.root, blocked.db)), at = f.now + 1000;
  assert.throws(() => updateRun(f.db, f.manifest.id, 'clear-wait', 'stale session answer', at), /superseded/);
  updateRun(db, f.manifest.id, 'clear-wait', 'owner answered in session B', at);
  updateRun(db, f.manifest.id, 'start-block', { owner: 'session-b', deadline: new Date(at + HOUR).toISOString(), evidence: 'wait resolved' }, at);
  recordRun(db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: at, authority: blockOf(blocked.wave) });
});

const pushes = (args) => args[0] === 'push';
const remoteLedger = (f) => JSON.parse(git(f.remote, 'show', `refs/noacg-recovery/${f.manifest.id}:checkpoint.json`));

test('a refused checkpoint publication leaves the ledger and the store as they were, so a retry works', (t) => {
  const f = projectFixture(t), block = blockOf(f.manifest.wave), before = readFileSync(f.manifest.wave, 'utf8');
  f.inject((args, call) => { if (pushes(args)) throw new Error('remote: rejected'); return call(); });
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: f.now, authority: block }), /publication unresolved/);
  assert.equal(readFileSync(f.manifest.wave, 'utf8'), before);
  assert.throws(() => updateRun(f.db, f.manifest.id, 'pause', 'end of block', f.now), /publication unresolved/);
  assert.equal(readFileSync(f.manifest.wave, 'utf8'), before);
  f.inject(null);
  // Neither the ledger nor the project state disagrees with the store: the same step is admitted.
  assert.equal(nextStep(readFileSync(f.manifest.wave, 'utf8'), f.now).action, 'launch');
  recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: f.now, authority: block });
  updateRun(f.db, f.manifest.id, 'pause', 'end of block', f.now);
  assert.equal(remoteLedger(f).ledger.match(/phase 1 build/g).length, 1);
  assert.equal(readProject(remoteLedger(f).ledger, f.now).status, 'paused');
});

test('a push accepted after the network failed is adopted as this store\'s own transition, never as superseded', (t) => {
  const f = projectFixture(t), block = blockOf(f.manifest.wave);
  // The push lands, then the network goes: neither the push result nor a read-back arrives.
  let down = false;
  f.inject((args, call) => {
    if (down && args[0] === 'ls-remote') throw new Error('Could not resolve host: github.com');
    if (pushes(args)) { call(); down = true; throw new Error('Connection reset'); }
    return call();
  });
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"builder"}', { now: f.now, authority: block }), /Could not resolve host/);
  assert.doesNotMatch(readFileSync(f.manifest.wave, 'utf8'), /phase 1 build/);
  assert.match(remoteLedger(f).ledger, /phase 1 build/);
  f.inject(null);
  // The next operation adopts it: the build is recorded once and waited on, not launched again.
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'build', '{"actor":"builder-2"}', { now: f.now, authority: block }), /already launched/);
  assert.equal(readFileSync(f.manifest.wave, 'utf8'), remoteLedger(f).ledger);
  recordRun(f.db, f.manifest.id, 1, 'landed', 'merge observed', { now: f.now, authority: block });
  // The same for a project update: an accepted pause is adopted with its project state.
  down = false;
  f.inject((args, call) => {
    if (down && args[0] === 'ls-remote') throw new Error('Could not resolve host: github.com');
    if (pushes(args)) { call(); down = true; throw new Error('Connection reset'); }
    return call();
  });
  assert.throws(() => updateRun(f.db, f.manifest.id, 'pause', 'end of block', f.now), /Could not resolve host/);
  f.inject(null);
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'check', '{"actor":"checker"}', { now: f.now, authority: block }), /refuses work: paused/);
  assert.equal(readFileSync(f.manifest.wave, 'utf8'), remoteLedger(f).ledger);
  // Another session's continuation is still superseding.
  assert.equal(f.continueAs('session-b').verdict, 'continued');
  assert.throws(() => recordRun(f.db, f.manifest.id, 1, 'check', '{"actor":"checker"}', { now: f.now, authority: block }), /superseded/);
});

test('whole source/store/ledger loss restores pinned code, hashes, waits and unresolved exact request without replay', async (t) => {
  const f = fixture(t), operations = [];
  await tickRun(f.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => {
    operations.push(r.operation); return r.operation === 'inspect' ? { state: 'gone' } : { state: 'unknown' };
  } });
  const original = docFor(f.db);
  assert.ok(original.pending.requestSha256);
  updateRun(f.db, f.manifest.id, 'wait', { kind: 'dependency', reason: 'waiting for owned result', until: null });
  const ledger = readFileSync(f.manifest.wave, 'utf8');
  f.db.close(); rmSync(f.source, { recursive: true, force: true }); rmSync(f.manifest.wave); rmSync(path.join(f.root, 'control.sqlite'));
  const restored = f.restore();
  assert.equal(git(restored.config.worktree, 'rev-parse', 'HEAD'), original.packet.recovery.revision);
  assert.equal(readFileSync(restored.config.wave, 'utf8'), ledger);
  let doc = docFor(restored.db);
  assert.deepEqual(doc.manifest.authorization, original.manifest.authorization);
  assert.deepEqual(doc.pending, original.pending);
  assert.equal(doc.wait.kind, 'dependency');
  assert.deepEqual(doc.packet.recovery.repairOwners, original.packet.recovery.repairOwners);
  let calls = [];
  assert.equal((await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => { calls.push(r.operation); return { state: 'unknown' }; } })).verdict, 'unknown');
  assert.deepEqual(calls, ['restore']);
  const proof = receipt(doc, f.now);
  assert.equal((await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async () => proof })).verdict, 'waiting');
  updateRun(restored.db, f.manifest.id, 'clear-wait', 'dependency result inspected');
  calls = [];
  assert.equal((await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => {
    calls.push(r.operation); assert.equal(r.actionId, original.pending.id); assert.equal(r.requestSha256, original.pending.requestSha256); return { state: 'unknown' };
  } })).verdict, 'unknown');
  assert.deepEqual(calls, ['reconcile']);
});

test('replacement generation rejects stale host writes and no external delivery follows publication failure', async (t) => {
  const f = fixture(t); f.restore();
  assert.throws(() => publishRun(f.db, f.manifest.id), /superseded/);
  let called = 0;
  assert.equal((await tickRun(f.db, f.manifest.id, { invoke: async () => { called++; } })).verdict, 'superseded');
  assert.equal(called, 0);
  assert.throws(() => updateRun(f.db, f.manifest.id, 'checkpoint', { ...docFor(f.db).packet, phase: 2 }), /superseded/);
  assert.equal(docFor(f.db).packet.phase, 1);
});

test('terminal and expired restores never invoke native adapters or extend authorization', async (t) => {
  const f = fixture(t); updateRun(f.db, f.manifest.id, 'finish');
  const finished = f.restore();
  assert.equal((await tickRun(finished.db, f.manifest.id, { invoke: async () => { throw new Error('must not call'); } })).verdict, 'finished');
  const g = fixture(t), end = Date.parse(g.manifest.authorization.deadline), expired = g.restore(end);
  assert.equal(docFor(expired.db).manifest.authorization.deadline, g.manifest.authorization.deadline);
  assert.equal((await tickRun(expired.db, g.manifest.id, { now: () => end, invoke: async () => { throw new Error('must not call'); } })).verdict, 'expired');
});

test('missing, stale, wrong-policy or mismatched GitHub owner read-back cannot unlock a restored run', (t) => {
  const f = fixture(t), restored = f.restore(), doc = docFor(restored.db), good = receipt(doc, f.now);
  assert.equal(restoredObservation(doc, good, f.now), true);
  for (const mutate of [
    (p) => { p.native.policySha256 = hash('broader'); }, (p) => { p.native.pendingTurn = true; },
    (p) => { p.native.observedAt = new Date(f.now - 31_000).toISOString(); },
    (p) => { p.github = []; }, (p) => { p.github[0].ownerSessionId = 'another owner'; },
    (p) => { p.github[0].headSha = 'f'.repeat(40); }, (p) => { p.github[0].repositoryFullName = 'Other/repository'; },
    (p) => { p.checkpoint = 'wrong-checkpoint'; },
  ]) { const bad = structuredClone(good); mutate(bad); assert.equal(restoredObservation(doc, bad, f.now), false); }
});

test('hash mismatch, unpushed source and changed authorization cannot become durable checkpoints', (t) => {
  const f = fixture(t), packet = docFor(f.db).packet;
  for (const mutate of [
    (p) => { p.recovery.spec.sha256 = '0'.repeat(64); },
    (p) => { p.recovery.evidence[0].sha256 = '0'.repeat(64); },
    (p) => { p.recovery.revision = 'f'.repeat(40); },
    (p) => { p.recovery.native.policySha256 = hash('broader policy'); },
    (p) => { p.recovery.native.sessionId = 'another-owner'; },
  ]) { const bad = structuredClone(packet); mutate(bad); assert.throws(() => updateRun(f.db, f.manifest.id, 'checkpoint', bad)); }
  writeFileSync(f.manifest.wave, readFileSync(f.manifest.wave, 'utf8').replace(f.manifest.authorization.deadline, new Date(f.now + 12_000_000).toISOString()));
  assert.throws(() => publishRun(f.db, f.manifest.id), /authorization differs/);
});

test('restore refuses existing worktree and restores retained source after its branch is deleted', (t) => {
  const f = fixture(t), restored = f.restore();
  assert.throws(() => restoreRun(restored.db, restored.config), /empty run store/);
  git(f.source, 'push', 'origin', '--delete', 'codex/test');
  const recovered = f.restore();
  assert.equal(git(recovered.config.worktree, 'rev-parse', 'HEAD'), f.manifest.packet.recovery.revision);
  assert.ok(existsSync(f.source));
});

test('database reset during restoration can reuse only its own unchanged prepared files', (t) => {
  const f = fixture(t), first = f.restore(), replacement = f.open('reset.sqlite');
  restoreRun(replacement, first.config, f.now);
  assert.equal(docFor(replacement).restoration.reconciled, false);
  const another = f.open('reset-again.sqlite');
  writeFileSync(path.join(first.config.worktree, 'uncommitted.txt'), 'must be preserved');
  assert.throws(() => restoreRun(another, first.config, f.now), /Prepared worktree changed/);
  assert.equal(readFileSync(path.join(first.config.worktree, 'uncommitted.txt'), 'utf8'), 'must be preserved');
});

test('a later database reset reuses current published progress rather than the initial preparation hash', async (t) => {
  const f = fixture(t), first = f.restore();
  assert.equal(await main(['record', first.database, f.manifest.id, '1', 'build', 'resumed-worker'], { recoveryGit: f.transport }), 0);
  const replacement = f.open('after-progress.sqlite');
  restoreRun(replacement, first.config, f.now);
  assert.match(readFileSync(first.config.wave, 'utf8'), /phase 1 build resumed-worker/);
  assert.equal(docFor(replacement).restoration.reconciled, false);
});

test('restored accepted delivery reconciles the original worker and never launches a replacement', async (t) => {
  const f = fixture(t);
  await tickRun(f.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => r.operation === 'inspect'
    ? { state: 'gone' } : { state: 'delivered', workerId: 'accepted-worker' } });
  const restored = f.restore(), doc = docFor(restored.db), calls = [];
  const result = await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => {
    calls.push(r.operation);
    if (r.operation === 'restore') return receipt(doc, f.now);
    return r.operation === 'reconcile' ? { state: 'delivered', workerId: 'accepted-worker' } : { state: 'running', workerId: 'accepted-worker' };
  } });
  assert.equal(result.verdict, 'alive'); assert.deepEqual(calls, ['restore', 'reconcile', 'inspect']);
  assert.equal(docFor(restored.db).pending, null);
});

test('phase records publish their ledger before the command acknowledges success', async (t) => {
  const f = fixture(t);
  assert.equal(await main(['record', path.join(f.root, 'control.sqlite'), f.manifest.id, '1', 'build', 'worker-1'], { recoveryGit: f.transport }), 0);
  const restored = f.restore();
  assert.match(readFileSync(restored.config.wave, 'utf8'), /phase 1 build worker-1/);
});

test('restoration retains native permission waits and never dispatches before the original window', async (t) => {
  const f = fixture(t), restored = f.restore(), doc = docFor(restored.db), calls = [];
  const proof = receipt(doc, f.now);
  proof.native = { ...proof.native, state: 'waiting', wait: { kind: 'permission', reason: 'original pending approval', until: null } };
  const result = await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => {
    calls.push(r.operation); return r.operation === 'restore' ? proof : { state: 'gone' };
  } });
  assert.equal(result.verdict, 'waiting'); assert.deepEqual(calls, ['restore']);
  const g = fixture(t), early = g.restore(g.now - 1000);
  assert.equal((await tickRun(early.db, g.manifest.id, { now: () => g.now - 1000, invoke: async () => { throw new Error('must not inspect before start'); } })).verdict, 'waiting');
});

test('unknown policy remains null in durable storage and cannot unlock dispatch', async (t) => {
  const f = fixture(t), packet = structuredClone(docFor(f.db).packet);
  packet.recovery.native.policySha256 = null;
  updateRun(f.db, f.manifest.id, 'checkpoint', packet);
  const calls = [];
  assert.equal((await tickRun(f.db, f.manifest.id, { invoke: async (_, request) => {
    calls.push(request.operation); return request.operation === 'inspect' ? { state: 'gone' } : { state: 'delivered', workerId: 'must-not-launch' };
  } })).verdict, 'unknown');
  assert.deepEqual(calls, []);
  const restored = f.restore(), doc = docFor(restored.db);
  assert.equal(doc.packet.recovery.native.policySha256, null);
  assert.equal(restoredObservation(doc, receipt(doc, f.now), f.now), false);
});

test('resume automatically reconstructs an absent database directory but cannot bypass native read-back', async (t) => {
  const f = fixture(t), original = f.restore(), database = path.join(f.root, 'lost-state', 'control.sqlite');
  const configFile = path.join(f.root, 'bootstrap.json'); writeFileSync(configFile, JSON.stringify(original.config));
  assert.equal(await main(['resume', database, configFile], { recoveryGit: f.transport }), 0);
  const recovered = openStore(database);
  try { assert.equal(docFor(recovered).restoration.reconciled, false); } finally { recovered.close(); }
});

test('a durable phase update invalidates an already inspecting local tick before delivery', async (t) => {
  const f = fixture(t); let deliveries = 0;
  const result = await tickRun(f.db, f.manifest.id, { invoke: async (_, request) => {
    if (request.operation === 'inspect') {
      assert.equal(await main(['record', path.join(f.root, 'control.sqlite'), f.manifest.id, '1', 'build', 'owned-worker'], { recoveryGit: f.transport }), 0);
      return { state: 'gone' };
    }
    deliveries++; return { state: 'delivered', workerId: 'must-not-launch' };
  } });
  assert.equal(result.verdict, 'unknown'); assert.match(result.why, /Lease lost/); assert.equal(deliveries, 0);
});

test('durable checkpoints omit adapter configuration while preserving local credentials', (t) => {
  const sentinel = 'private-adapter-argument-sentinel', f = fixture(t, ['--access-token', sentinel]);
  const raw = git(f.remote, 'show', `refs/noacg-recovery/${f.manifest.id}:checkpoint.json`);
  assert.ok(!raw.includes(sentinel)); assert.equal(JSON.parse(raw).doc.manifest.adapter, undefined);
  assert.deepEqual(docFor(f.db).manifest.adapter.args, ['--access-token', sentinel]);
  // Checkpoints are not branches: branch-driven deploys and CI never see them.
  assert.equal(git(f.remote, 'for-each-ref', '--format=%(refname)', 'refs/heads/noacg-recovery/'), '');
  assert.match(git(f.remote, 'rev-parse', `refs/noacg-recovery/${f.manifest.id}`), /^[a-f0-9]{40}$/);
});

test('recovery commits have a machine identity even when the host has none', (t) => {
  const previousGlobal = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = devNull;
  t.after(() => { if (previousGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = previousGlobal; });
  const f = fixture(t);
  git(f.source, 'config', '--unset', 'user.name'); git(f.source, 'config', '--unset', 'user.email');
  updateRun(f.db, f.manifest.id, 'wait', { kind: 'dependency', reason: 'persist without host identity', until: null });
  const identity = git(f.remote, 'show', '-s', '--format=%an <%ae> / %cn <%ce>', `refs/noacg-recovery/${f.manifest.id}`);
  assert.equal(identity, 'NoaCG Recovery <noacg-recovery@users.noreply.github.com> / NoaCG Recovery <noacg-recovery@users.noreply.github.com>');
});

test('separate and multiple effective push destinations are rejected before any checkpoint export', (t) => {
  for (const multiple of [false, true]) {
    let fork;
    assert.throws(() => fixture(t, ['-e', ''], ({ source, root }) => {
      fork = path.join(root, 'fork.git');
      const forkUrl = 'https://github.com/Other/fork.git';
      git(root, 'init', '--bare', fork);
      git(source, 'config', `url.${fork}.insteadOf`, forkUrl);
      if (multiple) git(source, 'config', '--add', 'remote.origin.pushurl', remoteUrl);
      git(source, 'config', '--add', 'remote.origin.pushurl', forkUrl);
    }), /effective.*destination/);
    assert.equal(git(fork, 'for-each-ref', '--format=%(refname)', 'refs/noacg-recovery/'), '');
  }
});

test('a missing replacement adapter cannot create files or claim a new remote generation', (t) => {
  const f = fixture(t), ref = `refs/noacg-recovery/${f.manifest.id}`;
  const before = git(f.remote, 'rev-parse', ref);
  for (const field of ['command', 'cwd']) {
    const db = f.open(`invalid-${field}.sqlite`), worktree = path.join(f.root, `invalid-${field}`);
    assert.throws(() => restoreRun(db, { ...f.manifest.recovery, id: f.manifest.id, worktree,
      wave: `${worktree}.md`, adapter: { ...f.manifest.adapter, [field]: path.join(f.root, 'does-not-exist') } }, f.now));
    assert.equal(git(f.remote, 'rev-parse', ref), before); assert.equal(existsSync(worktree), false);
  }
});

test('only exact final non-delivery can rebuild an intent for the restored worktree', async (t) => {
  const f = fixture(t);
  await tickRun(f.db, f.manifest.id, { now: () => f.now, invoke: async (_, r) => r.operation === 'inspect' ? { state: 'gone' } : { state: 'unknown' } });
  const original = docFor(f.db), restored = f.restore(), clock = f.now + 61_000;
  let doc = docFor(restored.db), deliveries = [];
  const partial = await tickRun(restored.db, f.manifest.id, { now: () => clock, invoke: async (_, r) => {
    if (r.operation === 'restore') return receipt(doc, clock);
    if (r.operation === 'reconcile') return { state: 'absent' };
    if (r.operation === 'inspect') return { state: 'gone' };
    deliveries.push(r); return { state: 'delivered', workerId: 'must-not-launch' };
  } });
  assert.equal(partial.verdict, 'unknown'); assert.deepEqual(deliveries, []);
  doc = docFor(restored.db);
  const r = original.pending.packet.recovery;
  const proof = { ...r.native, revision: r.revision, actionId: original.pending.id, requestSha256: original.pending.requestSha256,
    state: 'absent', authoritative: true, final: true, evidence: 'authoritative final native non-delivery' };
  const resumed = await tickRun(restored.db, f.manifest.id, { now: () => clock, invoke: async (_, request) => {
    if (request.operation === 'restore') return receipt(doc, clock);
    if (request.operation === 'reconcile') return proof;
    if (request.operation === 'inspect') return { state: 'gone' };
    deliveries.push(request); return { state: 'delivered', workerId: 'new-owner-turn' };
  } });
  assert.equal(resumed.verdict, 'resumed'); assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].packet.workspace.worktree, restored.config.worktree);
  assert.notEqual(deliveries[0].actionId, original.pending.id);
  assert.notEqual(deliveries[0].requestSha256, original.pending.requestSha256);
  assert.equal(docFor(restored.db).pending.attempts, original.pending.attempts + 1);
});

test('automatic adapter observations cannot export auxiliary token or raw-response fields', async (t) => {
  const sentinel = 'private-adapter-response-sentinel', f = fixture(t);
  await tickRun(f.db, f.manifest.id, { invoke: async (_, r) => r.operation === 'inspect' ? { state: 'gone' }
    : { state: 'delivered', workerId: 'owned-worker', token: sentinel, rawProviderResponse: { secret: sentinel } } });
  assert.deepEqual(docFor(f.db).pending.receipt, { state: 'delivered', workerId: 'owned-worker' });
  let raw = git(f.remote, 'show', `refs/noacg-recovery/${f.manifest.id}:checkpoint.json`);
  assert.ok(!raw.includes(sentinel));
  const legacy = docFor(f.db);
  legacy.pending.packet.restoredGithub = [{ ...receipt({ ...legacy, restoration: { checkpoint: 'test' } }, f.now).github[0], token: sentinel }];
  legacy.pending.requestSha256 = hash(JSON.stringify({ actionId: legacy.pending.id, authorization: legacy.manifest.authorization, packet: legacy.pending.packet }));
  f.db.prepare('UPDATE runs SET doc=? WHERE id=?').run(JSON.stringify(legacy), f.manifest.id);
  assert.throws(() => publishRun(f.db, f.manifest.id), /Pending request contains auxiliary adapter fields/);
  const restored = f.restore(), doc = docFor(restored.db), proof = receipt(doc, f.now);
  proof.github[0].rawProviderResponse = { token: sentinel };
  proof.native = { ...proof.native, state: 'waiting', wait: { kind: 'permission', reason: 'same approval', until: null, token: sentinel } };
  assert.equal((await tickRun(restored.db, f.manifest.id, { now: () => f.now, invoke: async () => proof })).verdict, 'waiting');
  raw = git(f.remote, 'show', `refs/noacg-recovery/${f.manifest.id}:checkpoint.json`);
  assert.ok(!raw.includes(sentinel));
  const g = fixture(t);
  await tickRun(g.db, g.manifest.id, { invoke: async () => ({ state: 'waiting',
    wait: { kind: 'dependency', reason: 'same dependency', until: null, rawProviderResponse: { token: sentinel } } }) });
  updateRun(g.db, g.manifest.id, 'clear-wait', 'dependency inspected');
  await tickRun(g.db, g.manifest.id, { now: () => g.now, invoke: async (_, r) => r.operation === 'inspect' ? { state: 'gone' } : { state: 'unknown' } });
  await tickRun(g.db, g.manifest.id, { now: () => g.now + 61_000, invoke: async (_, r) => r.operation === 'reconcile'
    ? { state: 'delivered', workerId: 'second-worker', rawProviderResponse: { token: sentinel } } : { state: 'running', workerId: 'second-worker' } });
  const ref = `refs/noacg-recovery/${g.manifest.id}`;
  for (const commit of git(g.remote, 'log', '--format=%H', ref, '--', 'checkpoint.json').split('\n')) {
    assert.ok(!git(g.remote, 'show', `${commit}:checkpoint.json`).includes(sentinel));
  }
});
