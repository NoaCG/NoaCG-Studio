#!/usr/bin/env node
// Opt-in recovery control. With a recovery ref, any session can continue a project (`continue`)
// and the coordinator it replaced is refused as superseded. No model client or scheduler here.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { nextStep, recordStep, withLedgerLock } from './plan-run.mjs';
import { MAX_WINDOW_MS, REPORT_HEADING, WINDOW_END } from './wave-plan-store.mjs';
import { activeProject, assertCurrent, deliveredReceipt as deliveryReceipt, githubObservations, publishRun, recoveryGit, recoveryTables, restoredObservation, restoreRun } from './run-recovery.mjs';
import { repoFromRemote } from './ci-failure-set.mjs';
import { reconcileNative } from './native-recovery-contract.mjs';
import { DAY_MS, digest, immutableProject, projectBoundary, readProject, validateAuthorization, writeProject } from './project-authorization.mjs';
import { changeProject, checkBlock, checkedProject, checkpointReceipt, hasInFlight } from './project-control.mjs';

export const PACKET_BYTES = 16 * 1024;
const LEASE_MS = 60_000;
const ADAPTER_MS = 10_000;
const WAIT_KINDS = ['owner', 'permission', 'dependency', 'usage', 'transient'];
const windowStart = (text) => Date.parse(/^Window starts: (\S+)/m.exec(text)?.[1] ?? '');
const hash = (text) => createHash('sha256').update(text).digest('hex');
const required = (s) => typeof s === 'string' && s.trim().length > 0;
const iso = (s) => {
  if (typeof s !== 'string' || !/^\d{4}-\d\d-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(s) || !Number.isFinite(Date.parse(s))) return false;
  const date = s.slice(0, 10);
  return new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date;
};
const canonical = (s) => {
  const p = realpathSync(s);
  return process.platform === 'win32' ? p.toLowerCase() : p;
};

export function validatePacket(packet) {
  if (!packet || !required(packet.objective) || !Array.isArray(packet.acceptance) || !packet.acceptance.length
      || packet.acceptance.some((s) => !required(s)) || !required(packet.nextAction)) {
    throw new Error('Packet needs objective, acceptance and nextAction');
  }
  for (const key of ['phase', 'tasks', 'decisions', 'constraints', 'files', 'workspace', 'commits', 'verification', 'blockers', 'evidence']) {
    if (packet[key] === undefined) throw new Error(`Packet needs ${key}`);
  }
  if (Buffer.byteLength(JSON.stringify(packet)) > PACKET_BYTES) throw new Error('Recovery packet exceeds 16 KiB; use evidence references');
}

function validateWait(wait) {
  if (!wait || !WAIT_KINDS.includes(wait.kind) || !required(wait.reason)
      || (wait.until !== null && !iso(wait.until))) throw new Error('Wait needs kind, reason and until (ISO or null)');
  if (wait.kind === 'transient' && wait.until === null) throw new Error('Transient wait needs a retry time');
  return { kind: wait.kind, reason: wait.reason, until: wait.until };
}

/** SQLite serializes claims, not agent work. Keep it on a local disk, never a shared network FS. */
export function openStore(file, { recoveryGit } = {}) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS runs (id TEXT PRIMARY KEY, wave TEXT UNIQUE NOT NULL,
      doc TEXT NOT NULL, owner TEXT, leaseUntil INTEGER NOT NULL DEFAULT 0, epoch INTEGER NOT NULL DEFAULT 0);`);
  recoveryTables(db, recoveryGit);
  return db;
}

function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}

function rowFor(db, id) {
  const row = db.prepare('SELECT * FROM runs WHERE id=?').get(id);
  if (!row) throw new Error(`Unknown run ${id}`);
  return { ...row, doc: JSON.parse(row.doc) };
}

export function registerRun(db, manifest, now = Date.now()) {
  if (manifest.version !== 1 || !/^[a-zA-Z0-9_-]+$/.test(manifest.id ?? '') || !['plan', 'wave'].includes(manifest.kind)) {
    throw new Error('Manifest needs version 1, a stable id and plan|wave kind');
  }
  const auth = manifest.authorization;
  if (!auth || !required(auth.source) || !required(auth.scope) || !required(auth.permissionPolicy)
      || !iso(auth.startedAt) || !iso(auth.deadline)) throw new Error('Explicit authorization and permission policy required');
  const { start, end } = validateAuthorization(auth, { now, kind: manifest.kind });
  validatePacket(manifest.packet);
  if (!path.isAbsolute(manifest.wave) || !path.isAbsolute(manifest.adapter?.command ?? '')
      || !path.isAbsolute(manifest.adapter?.cwd ?? '') || !Array.isArray(manifest.adapter.args)
      || manifest.adapter.args.some((s) => typeof s !== 'string') || /\.(?:cmd|bat|ps1)$/i.test(manifest.adapter.command)) {
    throw new Error('Adapter needs an absolute executable, cwd and literal args; no shell launcher');
  }
  const normalized = { ...manifest, wave: canonical(manifest.wave), adapter: {
    ...manifest.adapter, command: realpathSync(manifest.adapter.command), cwd: realpathSync(manifest.adapter.cwd),
  } };
  const text = readFileSync(normalized.wave, 'utf8');
  const project = readProject(text, now);
  if (end - start > MAX_WINDOW_MS && !project) throw Error('Multi-day plans require explicit continuing project metadata');
  if (project && (manifest.kind !== 'plan' || project.id !== manifest.id || JSON.stringify(project.authorization) !== JSON.stringify(auth))) throw Error('Manifest differs from original project authorization');
  if (windowStart(text) !== start || Date.parse(WINDOW_END.exec(text)?.[2] ?? '') !== end) throw new Error('Wave window differs from authorization');
  if (REPORT_HEADING.test(text)) throw new Error('Wave already reported');
  return transaction(db, () => {
    if (project) {
      const store = canonical(db.prepare('PRAGMA database_list').all().find((row) => row.name === 'main').file);
      const locked = withLedgerLock(normalized.wave, () => {
        const current = readProject(readFileSync(normalized.wave, 'utf8'), now);
        if (current.authorityStore && current.authorityStore !== store) throw Error('Project already bound to another authoritative local store');
        if (readFileSync(normalized.wave, 'utf8') !== text) throw Error('Project changed during registration; reconcile');
        project.authorityStore = store;
        writeFileSync(normalized.wave, writeProject(text, project));
        return {};
      });
      if (locked.refusal) throw Error(locked.refusal);
    }
    const old = db.prepare('SELECT doc FROM runs WHERE id=?').get(normalized.id);
    if (old) {
      if (JSON.stringify(JSON.parse(old.doc).manifest) !== JSON.stringify(normalized)) throw new Error('Run already registered; authorization and adapter are immutable');
      return JSON.parse(old.doc);
    }
    const doc = { manifest: normalized, status: 'active', packet: normalized.packet, wait: null, pending: null, sequence: 0 };
    if (project) { doc.projectAuthorization = immutableProject(project); doc.projectState = digest(project); }
    db.prepare('INSERT INTO runs(id,wave,doc) VALUES(?,?,?)').run(normalized.id, normalized.wave, JSON.stringify(doc));
    publishRun(db, normalized.id);
    return doc;
  });
}

/** Explicit operator/coordinator updates fence any in-flight tick; they never renew authorization. */
export function updateRun(db, id, operation, value, now = Date.now()) {
  return transaction(db, () => {
    const { doc } = rowFor(db, id);
    if (doc.status !== 'active') throw new Error('Terminal run cannot be reopened');
    assertCurrent(db, id, doc); // A superseded coordinator changes nothing, not even its own ledger.
    const text = readFileSync(doc.manifest.wave, 'utf8');
    const project = checkedProject(doc, text, now);
    if (operation === 'wait') doc.wait = validateWait(value);
    else if (operation === 'clear-wait') {
      if (!required(value)) throw new Error('Clearing a wait needs evidence or the owner answer');
      doc.wait = null; doc.waitResolution = value;
    } else if (operation === 'checkpoint') {
      validatePacket(value);
      if (value.objective !== doc.manifest.packet.objective || JSON.stringify(value.acceptance) !== JSON.stringify(doc.manifest.packet.acceptance)) {
        throw new Error('Checkpoint cannot change the authorized objective or acceptance');
      }
      doc.packet = value;
    } else if (project && ['start-block', 'pause', 'finish', 'cancel'].includes(operation)) { /* handled under the ledger lock below */ }
    else if (['finish', 'cancel'].includes(operation)) doc.status = operation === 'finish' ? 'finished' : 'cancelled';
    else throw new Error('Unknown update');
    if (project) {
      const locked = withLedgerLock(doc.manifest.wave, () => {
        if (readFileSync(doc.manifest.wave, 'utf8') !== text) throw Error('Ledger changed; reconcile before updating project');
        const changed = changeProject(doc, project, text, operation, value, now);
        writeFileSync(doc.manifest.wave, changed);
        return {};
      });
      if (locked.refusal) throw Error(locked.refusal);
    }
    db.prepare('UPDATE runs SET doc=?,owner=NULL,leaseUntil=0,epoch=epoch+1 WHERE id=?').run(JSON.stringify(doc), id);
    publishRun(db, id);
    return doc;
  });
}

/** One supported phase admission path; SQLite plus the ledger lock serialize local callers. */
export function recordRun(db, id, phase, event, detail = '', { now = Date.now(), authority } = {}) {
  return transaction(db, () => {
    const row = rowFor(db, id), { doc } = row;
    if (doc.status !== 'active') throw Error('Terminal run cannot record another phase');
    // A superseded coordinator is refused here, before it writes the ledger or launches anything.
    assertCurrent(db, id, doc);
    const text = readFileSync(doc.manifest.wave, 'utf8');
    const project = checkedProject(doc, text, now);
    if (project) {
      checkBlock(project, authority, now);
      if (doc.wait || doc.pending || row.owner) throw Error('Reconcile blocked prerequisite, active lease or uncertain action before phase admission');
    }
    const result = recordStep(doc.manifest.wave, phase, event, detail, now, { supervised: Boolean(project) });
    if (result.refusal) throw Error(result.refusal);
    db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0,epoch=epoch+1 WHERE id=?').run(id);
    publishRun(db, id);
    return result;
  });
}

function acquire(db, id, now) {
  return transaction(db, () => {
    const row = rowFor(db, id);
    if (row.leaseUntil > now && row.owner) return null;
    const token = randomUUID(), epoch = row.epoch + 1, until = now + LEASE_MS;
    db.prepare('UPDATE runs SET owner=?,leaseUntil=?,epoch=? WHERE id=?').run(token, until, epoch, id);
    return { id, token, epoch, until, doc: row.doc };
  });
}

function save(db, claim, now) {
  transaction(db, () => {
    const result = db.prepare('UPDATE runs SET doc=? WHERE id=? AND owner=? AND epoch=? AND leaseUntil>?')
      .run(JSON.stringify(claim.doc), claim.id, claim.token, claim.epoch, now);
    if (result.changes !== 1) throw new Error('Lease lost; reconcile instead of acting');
    publishRun(db, claim.id);
  });
}

/** The host adapter must durably deduplicate actionId and preserve permissionPolicy.
 * inspect: running(workerId) | gone | unknown | waiting(wait)
 * reconcile: delivered(workerId) | absent | unknown
 * deliver: delivered(workerId) | not-delivered | unknown
 * All three are deterministic; deliver only accepts/enqueues work, never waits for its completion.
 * Durable runs require exact native binding/hash/evidence and authoritative final non-delivery
 * for an absent intent, using reconcileNative's receipt shape. Empty catalogs are not absence.
 */
export function callAdapter(adapter, request) {
  return new Promise((resolve, reject) => {
    const child = spawn(adapter.command, adapter.args, { cwd: adapter.cwd, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] });
    let output = '', settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true; clearTimeout(timer);
      if (error) reject(error); else resolve(result);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error('Adapter timed out; delivery is unknown')); }, ADAPTER_MS);
    child.on('error', (error) => finish(error));
    child.stdin.on('error', (error) => finish(error));
    child.stdout.on('data', (chunk) => {
      output += chunk;
      if (Buffer.byteLength(output) > 64 * 1024) { child.kill(); finish(new Error('Adapter output exceeds 64 KiB')); }
    });
    child.on('close', (code) => {
      if (code !== 0) return finish(new Error('Adapter failed; delivery is unknown'));
      try { finish(null, JSON.parse(output)); } catch { finish(new Error('Adapter returned invalid JSON')); }
    });
    child.stdin.end(JSON.stringify(request));
  });
}

export async function tickRun(db, id, { now = Date.now, invoke = callAdapter } = {}) {
  const claim = acquire(db, id, now());
  if (!claim) return { verdict: 'leased' };
  const { doc } = claim, { manifest } = doc;
  const result = (verdict, why) => ({ verdict, why, run: id, actionId: doc.pending?.id ?? null });
  const deliveryPacket = () => {
    const text = readFileSync(manifest.wave, 'utf8');
    const packet = doc.pending?.packet ?? { ...doc.packet, ledger: manifest.kind === 'plan' ? nextStep(text, now()) : { action: 'reconcile-wave', evidence: manifest.wave }, waveSha256: hash(text) };
    validatePacket(packet); // The ledger's carry can be large too; bound the actual payload.
    return packet;
  };
  const ask = (operation) => {
    const packet = operation === 'deliver' ? deliveryPacket() : null;
    return invoke(manifest.adapter, {
      operation, runId: id, authorization: manifest.authorization, wave: manifest.wave,
      ...(doc.projectState ? { workBlock: readProject(readFileSync(manifest.wave, 'utf8'), now()).block,
        checkpointReason: nextStep(readFileSync(manifest.wave, 'utf8'), now()).why } : {}),
      actionId: doc.pending?.id ?? null, fence: claim.epoch, leaseUntil: claim.until,
      ...(doc.pending?.requestSha256 ? { requestSha256: doc.pending.requestSha256 } : {}),
      ...(operation === 'restore' ? { restoration: doc.restoration, recovery: doc.packet.recovery } : {}),
      ...(packet ? { packet } : {}),
    });
  };
  try {
    if (doc.status !== 'active') {
      if (doc.status === 'cancelled' && doc.projectState) {
        const text = readFileSync(manifest.wave, 'utf8');
        checkedProject(doc, text, now());
        if (hasInFlight(text) && !doc.pauseReceipt) {
          const receipt = await ask('checkpoint');
          if (!checkpointReceipt(doc, receipt, text)) return result('cancelled', 'Launches stopped; in-flight checkpoint remains unacknowledged');
          save(db, claim, now());
        }
      }
      return result(doc.status);
    }
    assertCurrent(db, id, doc); // Stops a superseded coordinator.
    const text = readFileSync(manifest.wave, 'utf8');
    const project = checkedProject(doc, text, now());
    if (project && projectBoundary(project, now())) {
      const boundary = projectBoundary(project, now());
      if (hasInFlight(text) && !doc.pauseReceipt) {
        const receipt = await ask('checkpoint');
        if (!checkpointReceipt(doc, receipt, text)) return result('unknown', 'Checkpoint acknowledgement required; launch authority remains stopped');
        save(db, claim, now());
      }
      return result(boundary.action, boundary.why);
    }
    // A project's phases are admitted only by record; a tick never launches project work.
    if (project) return result('unknown', 'Active project: admit phases with record and follow next; tick launches nothing');
    if (REPORT_HEADING.test(text)) {
      doc.status = 'finished'; save(db, claim, now()); return result('finished', 'wave report');
    }
    if (now() >= Date.parse(manifest.authorization.deadline)) { doc.status = 'expired'; save(db, claim, now()); return result('expired'); }
    if (now() < Date.parse(manifest.authorization.startedAt)) return result('waiting', 'original authorization has not started');
    if (windowStart(text) !== Date.parse(manifest.authorization.startedAt)
        || Date.parse(WINDOW_END.exec(text)?.[2] ?? '') !== Date.parse(manifest.authorization.deadline)) {
      return result('unknown', 'wave authorization changed; explicit reauthorization is not implemented in this slice');
    }
    // Reconcile a replacement host before handling waits, unresolved sends or dispatch.
    // The CAS publication invalidates a prior host's next checkpoint; it is not a native lock.
    if (manifest.recovery) {
      publishRun(db, id);
      if (['sessionId', 'environmentId', 'policySha256'].some((key) => !required(doc.packet.recovery.native[key]))) {
        return result('unknown', 'native identity or effective policy is unavailable');
      }
      if (doc.restoration && !doc.restoration.reconciled) {
        const receipt = await ask('restore');
        if (!restoredObservation(doc, receipt, now())) return result('unknown', 'restored native/GitHub state needs exact reconciliation');
        doc.restoration.reconciled = true;
        doc.restoration.evidence = receipt.evidence;
        if (receipt.native.state === 'waiting') doc.wait = validateWait(receipt.native.wait);
        doc.packet.restoredGithub = githubObservations(receipt.github);
        validatePacket(doc.packet);
        save(db, claim, now());
      }
    }
    if (doc.wait) {
      if (['owner', 'permission', 'dependency'].includes(doc.wait.kind) || doc.wait.until === null || now() < Date.parse(doc.wait.until)) return result('waiting', doc.wait.reason);
      doc.wait = null; save(db, claim, now());
    }
    if (doc.pending) {
      const receipt = await ask('reconcile');
      if (receipt?.state === 'delivered') { doc.pending.receipt = deliveryReceipt(receipt); save(db, claim, now()); }
      else if (doc.pending.receipt) return result('unknown', 'pending delivery needs reconciliation');
      else if (manifest.recovery) {
        const r = doc.pending.packet.recovery;
        const intent = { provider: r.native.provider, sessionId: r.native.sessionId, environmentId: r.native.environmentId,
          policySha256: r.native.policySha256, revision: r.revision, actionId: doc.pending.id, requestSha256: doc.pending.requestSha256 };
        const observation = { ...receipt, state: receipt?.state === 'absent' ? 'not-delivered' : receipt?.state,
          nativeId: receipt?.nativeId ?? receipt?.workerId };
        if (reconcileNative(intent, observation).state !== 'not-delivered') return result('unknown', 'exact authoritative final non-delivery required');
        const context = { ...doc.pending.packet }; delete context.ledger; delete context.waveSha256;
        if (JSON.stringify(context) !== JSON.stringify(doc.packet) || doc.pending.packet.waveSha256 !== hash(readFileSync(manifest.wave, 'utf8'))) {
          // A final rejection permits a new request for the replacement paths. Keep the
          // original intent in checkpoint history and preserve its bounded retry budget.
          doc.previousIntent = { ...intent, state: 'not-delivered', authoritative: true, final: true, evidence: receipt.evidence };
          doc.retryBudget = { attempts: doc.pending.attempts, retryAt: doc.pending.retryAt };
          doc.pending = null; save(db, claim, now());
        }
      } else if (receipt?.state !== 'absent') return result('unknown', 'pending delivery needs reconciliation');
    }
    let observed = await ask('inspect');
    if (observed?.state === 'waiting') {
      validateWait(observed.wait);
      if (observed.wait.kind === 'usage' && observed.wait.until !== null && now() >= Date.parse(observed.wait.until)) {
        // A quota-limited process may still exist; the reset authorizes its next turn.
        observed = { state: 'gone' };
      } else {
        doc.wait = validateWait(observed.wait); save(db, claim, now());
        return result('waiting', doc.wait.reason);
      }
    }
    if (observed?.state === 'running') {
      if (!required(observed.workerId)) throw new Error('Running observation needs workerId');
      if (doc.pending?.receipt && doc.pending.receipt.workerId !== observed.workerId) return result('unknown', 'worker identity differs from delivery');
      doc.pending = null; delete doc.retryBudget; save(db, claim, now()); return result('alive');
    }
    if (observed?.state !== 'gone') return result('unknown', 'coordinator absence is unproven');
    if (doc.pending?.receipt) { doc.pending = null; save(db, claim, now()); }
    if (!doc.pending) {
      doc.sequence += 1;
      doc.pending = { id: `${id}:${doc.sequence}`, attempts: doc.retryBudget?.attempts ?? 0, retryAt: doc.retryBudget?.retryAt ?? 0 };
      delete doc.retryBudget;
      if (manifest.recovery) {
        doc.pending.packet = deliveryPacket();
        doc.pending.requestSha256 = hash(JSON.stringify({ actionId: doc.pending.id, authorization: manifest.authorization, packet: doc.pending.packet }));
      }
      save(db, claim, now()); // Intent is durable before anything external happens.
    }
    if (doc.pending.attempts >= 3) return result('blocked', 'three delivery attempts; explicit reconciliation required');
    if (doc.pending.retryAt > now()) return result('waiting', 'delivery backoff');
    // Re-read terminal facts and fence immediately before dispatch. Adapters must enforce the
    // deadline and stable action ID too, including if this process is suspended after this check.
    if (now() >= Date.parse(manifest.authorization.deadline)) return result('expired');
    if (REPORT_HEADING.test(readFileSync(manifest.wave, 'utf8'))) return result('finished');
    doc.pending.attempts += 1;
    doc.pending.retryAt = now() + 30_000 * 2 ** (doc.pending.attempts - 1);
    save(db, claim, now());
    const delivered = await ask('deliver');
    if (delivered?.state === 'delivered') {
      doc.pending.receipt = deliveryReceipt(delivered); save(db, claim, now());
      return result('resumed', 'accepted by adapter; reconcile workers before launching');
    }
    if (delivered?.state === 'not-delivered') return result('waiting', 'confirmed non-delivery; bounded backoff');
    return result('unknown', 'delivery outcome is unknown');
  } catch (error) {
    return result(error.code === 'SUPERSEDED' ? 'superseded' : 'unknown', error.message);
  } finally {
    db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0 WHERE id=? AND owner=? AND epoch=?').run(id, claim.token, claim.epoch);
  }
}

/** Continue the plan's active project from its shared recovery ref in a fresh state directory
 * under `root`. The new block takes over from whichever coordinator ran it before; that
 * coordinator's next record, tick or next is refused as superseded. Answers `open` when the
 * plan has no active project yet. */
export function continueProject(root, { plan, owner, ...recovery }, { now = Date.now(), recoveryGit: transport } = {}) {
  if (!required(owner)) throw new Error('Continue needs an owner label for the new block');
  // Short names: the worktree holds the whole repository, and Windows paths stop at 260 characters.
  const dir = path.join(path.resolve(root), randomUUID().slice(0, 8));
  mkdirSync(dir, { recursive: true });
  const dbFile = path.join(dir, 'control.sqlite'), wave = path.join(dir, 'wave.md'), worktree = path.join(dir, 'src');
  let db = openStore(dbFile, { recoveryGit: transport });
  try {
    const id = activeProject(db, recovery, plan, now);
    if (!id) {
      db.close(); db = null; rmSync(dir, { recursive: true, force: true });
      return { verdict: 'open', why: `no active ${plan} project: open, register and start-block it` };
    }
    // The original adapter is never exported; this one answers every native request with unknown.
    const adapter = { command: process.execPath, args: ['-e', 'process.stdout.write(\'{"state":"unknown"}\')'], cwd: dir };
    const { checkpoint } = restoreRun(db, { ...recovery, id, worktree, wave, adapter }, now);
    const project = readProject(readFileSync(wave, 'utf8'), now);
    if (!project) throw new Error('Recovery checkpoint holds no continuing project');
    const deadline = Math.min(now + DAY_MS, Date.parse(project.authorization.deadline));
    const where = { id, db: dbFile, wave, worktree };
    try {
      updateRun(db, id, 'start-block', { owner, deadline: new Date(deadline).toISOString(), evidence: `continued from recovery checkpoint ${checkpoint}` }, now);
    } catch (error) {
      // This store already owns the project (the restore claimed it); resolve, then start-block.
      return { verdict: 'blocked', why: error.message, ...where, next: nextStep(readFileSync(wave, 'utf8'), now) };
    }
    const text = readFileSync(wave, 'utf8');
    return { verdict: 'continued', ...where, block: readProject(text, now).block, next: nextStep(text, now) };
  } finally { db?.close(); }
}

/** The checkout's own GitHub repository, as `continue` uses it from the command line. */
function localRecovery() {
  const repository = recoveryGit(process.cwd(), ['rev-parse', '--show-toplevel']);
  const url = recoveryGit(repository, ['remote', 'get-url', 'origin']);
  return { repository: path.resolve(repository), remote: 'origin', repositoryFullName: repoFromRemote(url) };
}

export async function main(args = process.argv.slice(2), options = {}) {
  const [command, file, id, value] = args;
  if (!file || !['register', 'restore', 'resume', 'continue', 'next', 'record', 'tick', 'status', 'wait', 'clear-wait', 'checkpoint', 'start-block', 'pause', 'finish', 'cancel'].includes(command)) {
    process.stderr.write('Usage: run-supervisor.mjs continue <state-root> <plan> <owner> | register <db> <manifest.json> | restore|resume <db> <config.json> | next <db> <id> | record <db> <id> <phase> <event> [detail] [--authority <block.json>] | tick|status <db> [id] | wait|checkpoint|start-block <db> <id> <json> | clear-wait|pause|cancel <db> <id> <evidence> | finish <db> <id>\n'); return 2;
  }
  let db;
  try {
    if (command === 'continue') {
      process.stdout.write(`${JSON.stringify(continueProject(file, { plan: id, owner: value, ...localRecovery() }, options))}\n`); return 0;
    }
    if (['restore', 'resume'].includes(command)) mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    db = openStore(file, options);
    let output;
    if (command === 'register') output = registerRun(db, JSON.parse(readFileSync(id, 'utf8')));
    else if (command === 'next') {
      const { doc } = rowFor(db, id);
      assertCurrent(db, id, doc);
      output = nextStep(readFileSync(doc.manifest.wave, 'utf8'));
    }
    else if (command === 'restore') output = restoreRun(db, JSON.parse(readFileSync(id, 'utf8')));
    else if (command === 'resume') {
      const config = JSON.parse(readFileSync(id, 'utf8'));
      if (!db.prepare('SELECT id FROM runs').get()) restoreRun(db, config);
      const { doc } = rowFor(db, config.id);
      if (doc.manifest.recovery?.repositoryFullName !== config.repositoryFullName) throw new Error('Resume repository differs');
      output = await tickRun(db, config.id);
    }
    else if (command === 'record') {
      const at = args.indexOf('--authority');
      const authority = at < 0 ? undefined : JSON.parse(readFileSync(args[at + 1], 'utf8'));
      output = recordRun(db, id, Number(value), args[4], args.slice(5, at < 0 ? undefined : at).join(' '), { authority });
    }
    else if (command === 'tick' || command === 'status') {
      const ids = id ? [id] : db.prepare('SELECT id FROM runs ORDER BY id').all().map((row) => row.id);
      output = [];
      for (const key of ids) output.push(command === 'tick' ? await tickRun(db, key) : rowFor(db, key));
    } else output = updateRun(db, id, command, ['wait', 'checkpoint', 'start-block'].includes(command) ? JSON.parse(readFileSync(value, 'utf8')) : value);
    process.stdout.write(`${JSON.stringify(output)}\n`); return 0;
  } catch (error) { process.stderr.write(`run-supervisor: ${error.message}\n`); return 1; }
  finally { db?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
