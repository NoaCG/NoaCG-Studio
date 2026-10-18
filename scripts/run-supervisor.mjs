#!/usr/bin/env node
// Opt-in, single-host recovery control. No model client and no scheduler are installed here.
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { nextStep, recordStep } from './plan-run.mjs';
import { MAX_WINDOW_MS, REPORT_HEADING, WINDOW_END } from './wave-plan-store.mjs';
import { deliveredReceipt as deliveryReceipt, githubObservations, publishRun, recoveryTables, restoredObservation, restoreRun } from './run-recovery.mjs';
import { reconcileNative } from './native-recovery-contract.mjs';

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
  const start = Date.parse(auth.startedAt), end = Date.parse(auth.deadline);
  if (start > now || end <= now || end <= start || end - start > MAX_WINDOW_MS) throw new Error('Authorized window must be open and at most 24 hours');
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
  if (windowStart(text) !== start || Date.parse(WINDOW_END.exec(text)?.[2] ?? '') !== end) throw new Error('Wave window differs from authorization');
  if (REPORT_HEADING.test(text)) throw new Error('Wave already reported');
  return transaction(db, () => {
    const old = db.prepare('SELECT doc FROM runs WHERE id=?').get(normalized.id);
    if (old) {
      if (JSON.stringify(JSON.parse(old.doc).manifest) !== JSON.stringify(normalized)) throw new Error('Run already registered; authorization and adapter are immutable');
      return JSON.parse(old.doc);
    }
    const doc = { manifest: normalized, status: 'active', packet: normalized.packet, wait: null, pending: null, sequence: 0 };
    db.prepare('INSERT INTO runs(id,wave,doc) VALUES(?,?,?)').run(normalized.id, normalized.wave, JSON.stringify(doc));
    publishRun(db, normalized.id);
    return doc;
  });
}

/** Explicit operator/coordinator updates fence any in-flight tick; they never renew authorization. */
export function updateRun(db, id, operation, value) {
  return transaction(db, () => {
    const { doc } = rowFor(db, id);
    if (doc.status !== 'active') throw new Error('Terminal run cannot be reopened');
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
    } else if (['finish', 'cancel'].includes(operation)) doc.status = operation === 'finish' ? 'finished' : 'cancelled';
    else throw new Error('Unknown update');
    db.prepare('UPDATE runs SET doc=?,owner=NULL,leaseUntil=0,epoch=epoch+1 WHERE id=?').run(JSON.stringify(doc), id);
    publishRun(db, id);
    return doc;
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
      actionId: doc.pending?.id ?? null, fence: claim.epoch, leaseUntil: claim.until,
      ...(doc.pending?.requestSha256 ? { requestSha256: doc.pending.requestSha256 } : {}),
      ...(operation === 'restore' ? { restoration: doc.restoration, recovery: doc.packet.recovery } : {}),
      ...(packet ? { packet } : {}),
    });
  };
  try {
    if (doc.status !== 'active') return result(doc.status);
    const text = readFileSync(manifest.wave, 'utf8');
    if (REPORT_HEADING.test(text)) { doc.status = 'finished'; save(db, claim, now()); return result('finished', 'wave report'); }
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
    return result('unknown', error.message);
  } finally {
    db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0 WHERE id=? AND owner=? AND epoch=?').run(id, claim.token, claim.epoch);
  }
}

export async function main(args = process.argv.slice(2), options = {}) {
  const [command, file, id, value] = args;
  if (!file || !['register', 'restore', 'resume', 'record', 'tick', 'status', 'wait', 'clear-wait', 'checkpoint', 'finish', 'cancel'].includes(command)) {
    process.stderr.write('Usage: run-supervisor.mjs register <db> <manifest.json> | restore|resume <db> <config.json> | record <db> <id> <phase> <event> [detail] | tick|status <db> [id] | wait|checkpoint <db> <id> <json> | clear-wait <db> <id> <evidence> | finish|cancel <db> <id>\n'); return 2;
  }
  let db;
  try {
    if (['restore', 'resume'].includes(command)) mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    db = openStore(file, options);
    let output;
    if (command === 'register') output = registerRun(db, JSON.parse(readFileSync(id, 'utf8')));
    else if (command === 'restore') output = restoreRun(db, JSON.parse(readFileSync(id, 'utf8')));
    else if (command === 'resume') {
      const config = JSON.parse(readFileSync(id, 'utf8'));
      if (!db.prepare('SELECT id FROM runs').get()) restoreRun(db, config);
      const { doc } = rowFor(db, config.id);
      if (doc.manifest.recovery?.repositoryFullName !== config.repositoryFullName) throw new Error('Resume repository differs');
      output = await tickRun(db, config.id);
    }
    else if (command === 'record') output = transaction(db, () => {
      const { doc } = rowFor(db, id);
      if (doc.status !== 'active') throw new Error('Terminal run cannot record another phase');
      const result = recordStep(doc.manifest.wave, Number(value), args[4], args.slice(5).join(' '));
      if (result.refusal) throw new Error(result.refusal);
      db.prepare('UPDATE runs SET owner=NULL,leaseUntil=0,epoch=epoch+1 WHERE id=?').run(id);
      publishRun(db, id);
      return result;
    });
    else if (command === 'tick' || command === 'status') {
      const ids = id ? [id] : db.prepare('SELECT id FROM runs ORDER BY id').all().map((row) => row.id);
      output = [];
      for (const key of ids) output.push(command === 'tick' ? await tickRun(db, key) : rowFor(db, key));
    } else output = updateRun(db, id, command, ['wait', 'checkpoint'].includes(command) ? JSON.parse(readFileSync(value, 'utf8')) : value);
    process.stdout.write(`${JSON.stringify(output)}\n`); return 0;
  } catch (error) { process.stderr.write(`run-supervisor: ${error.message}\n`); return 1; }
  finally { db?.close(); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = await main();
