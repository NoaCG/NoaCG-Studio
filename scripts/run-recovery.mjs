// Git-backed checkpoints for run-supervisor. No scheduler or native launcher lives here.
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { accessSync, constants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { inspectNative } from './native-recovery-contract.mjs';
import { digest, immutableProject, readProject, validateAuthorization } from './project-authorization.mjs';
import { PLAN_RUN_KIND } from './wave-plan-store.mjs';

const sha = (text) => createHash('sha256').update(text).digest('hex');
const required = (s) => typeof s === 'string' && s.trim().length > 0;
const pick = (value, fields) => Object.fromEntries(fields.map((field) => [field, value[field]]));
const GITHUB_FIELDS = ['repositoryFullName', 'prNumber', 'headSha', 'ownerSessionId', 'commentId', 'state', 'observedAt', 'evidence'];
export const githubObservations = (rows) => rows.map((row) => pick(row, GITHUB_FIELDS));
export function deliveredReceipt(result) {
  if (result?.state !== 'delivered' || !required(result.workerId)) throw new Error('Delivery needs a stable workerId');
  return { state: 'delivered', workerId: result.workerId };
}
/** The remote checkpoint moved past this store: a newer coordinator owns the run. */
export const SUPERSEDED = 'superseded: another coordinator continued this project; stop';
const superseded = () => Object.assign(new Error(SUPERSEDED), { code: 'SUPERSEDED' });
const revision = (s) => /^[a-f0-9]{40}$/.test(s ?? '');
/** GitHub owner and repository names are case-insensitive; a cloud clone may lower-case them. */
export const sameRepository = (a, b) => typeof a === 'string' && typeof b === 'string' && a.toLowerCase() === b.toLowerCase();
const runId = (s) => /^[a-zA-Z0-9_-]+$/.test(s ?? '');
const COMMIT_IDENTITY = {
  GIT_AUTHOR_NAME: 'NoaCG Recovery', GIT_AUTHOR_EMAIL: 'noacg-recovery@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'NoaCG Recovery', GIT_COMMITTER_EMAIL: 'noacg-recovery@users.noreply.github.com',
};
export const recoveryGit = (cwd, args, input) => execFileSync('git', args, {
  cwd, input, encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024,
  stdio: ['pipe', 'pipe', 'pipe'],
  ...(args[0] === 'commit-tree' ? { env: { ...process.env, ...COMMIT_IDENTITY } } : {}),
  windowsHide: true,
}).trimEnd();
const transports = new WeakMap();
const canonicalPath = (file) => {
  const resolved = realpathSync(file);
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
};
// Outside refs/heads, so branch-driven integrations (deploy previews, push-triggered CI) never
// build a checkpoint: a checkpoint is published on every admission and holds no app source.
const RECOVERY_REFS = 'refs/noacg-recovery/';
const refFor = (id) => {
  if (!runId(id)) throw new Error('Invalid recovery run id');
  return `${RECOVERY_REFS}${id}`;
};
const remoteHead = (git, config, ref) => git(config.repository, ['ls-remote', config.remote, ref]).split(/\s+/)[0];
const safePath = (s) => required(s) && !s.startsWith('-') && !s.includes('\\') && !path.posix.isAbsolute(s)
  && s.split('/').every((part) => part && part !== '.' && part !== '..');

function settings(config, git) {
  if (!path.isAbsolute(config?.repository ?? '') || !/^[a-zA-Z0-9_-]+$/.test(config?.remote ?? '')
      || !/^[\w.-]+\/[\w.-]+$/.test(config?.repositoryFullName ?? '')) throw new Error('Recovery needs repository, named remote and repositoryFullName');
  // Do not store credentials or alternate hosting in the recovery document.
  const url = git(config.repository, ['config', '--get', `remote.${config.remote}.url`]);
  const escaped = config.repositoryFullName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const expected = new RegExp(`^(?:https://github\\.com/|git@github\\.com:)${escaped}(?:\\.git)?$`, 'i');
  if (!expected.test(url)) throw new Error('Recovery remote must be the existing GitHub repository');
  const destinations = [
    ...git(config.repository, ['remote', 'get-url', '--all', config.remote]).split('\n'),
    ...git(config.repository, ['remote', 'get-url', '--push', '--all', config.remote]).split('\n'),
  ];
  if (destinations.some((destination) => !expected.test(destination))) throw new Error('Recovery effective fetch/push destination differs from the existing repository');
  return config;
}

export function recoveryTables(db, transport = recoveryGit) {
  transports.set(db, transport);
  db.exec('CREATE TABLE IF NOT EXISTS recovery_heads (id TEXT PRIMARY KEY, sha TEXT NOT NULL)');
}

function validateState(doc, ledger) {
  const m = doc?.manifest, auth = m?.authorization;
  if (m?.version !== 1 || !runId(m.id) || !['plan', 'wave'].includes(m.kind)
      || !['active', 'finished', 'cancelled', 'expired'].includes(doc.status)
      || !Number.isSafeInteger(doc.sequence) || doc.sequence < 0 || !auth
      || !['source', 'scope', 'permissionPolicy'].every((key) => required(auth[key]))
      || !Number.isFinite(Date.parse(auth.startedAt)) || !Number.isFinite(Date.parse(auth.deadline))
      || Date.parse(auth.deadline) <= Date.parse(auth.startedAt)
      || (m.kind !== 'plan' && Date.parse(auth.deadline) - Date.parse(auth.startedAt) > 86_400_000)
      || !doc.packet || doc.packet.objective !== m.packet.objective
      || JSON.stringify(doc.packet.acceptance) !== JSON.stringify(m.packet.acceptance)) throw new Error('Invalid durable run state');
  validateAuthorization(auth, { now: Date.parse(auth.startedAt), kind: m.kind, open: false });
  const project = readProject(ledger, Date.parse(auth.startedAt));
  if (!project && (doc.projectState || doc.projectAuthorization)) throw Error('Recovery project metadata missing');
  if (project && (immutableProject(project) !== doc.projectAuthorization || digest(project) !== doc.projectState
      || project.id !== m.id || JSON.stringify(project.authorization) !== JSON.stringify(auth))) throw Error('Restored project authorization or state differs');
  if (!project && Date.parse(auth.deadline) - Date.parse(auth.startedAt) > 86_400_000) throw Error('Multi-day recovery requires explicit continuing project metadata');
  if (/^Window starts: (\S+)/m.exec(ledger)?.[1] !== auth.startedAt
      || /^Window ends: (\S+)/m.exec(ledger)?.[1] !== auth.deadline) throw new Error('Recovery ledger authorization differs');
  if (doc.pending && (doc.pending.id !== `${m.id}:${doc.sequence}` || !Number.isSafeInteger(doc.pending.attempts)
      || doc.pending.attempts < 0 || doc.pending.attempts > 3 || !Number.isFinite(doc.pending.retryAt))) throw new Error('Invalid unresolved delivery intent');
  if (doc.pending && (!doc.pending.packet || doc.pending.requestSha256 !== sha(JSON.stringify({
    actionId: doc.pending.id, authorization: auth, packet: doc.pending.packet,
  })))) throw new Error('Unresolved intent needs its exact persisted request hash');
  if (doc.pending?.packet?.restoredGithub?.some((row) => Object.keys(row).some((key) => !GITHUB_FIELDS.includes(key)))) {
    throw new Error('Pending request contains auxiliary adapter fields; reconcile without publishing or rewriting it');
  }
  if (doc.wait && (!['owner', 'permission', 'dependency', 'usage', 'transient'].includes(doc.wait.kind)
      || !required(doc.wait.reason) || (doc.wait.until !== null && !Number.isFinite(Date.parse(doc.wait.until))))) throw new Error('Invalid durable wait');
  const r = doc.packet.recovery;
  if (!r || !required(r.branch) || !revision(r.revision) || !safePath(r.spec?.path)
      || !/^[a-f0-9]{64}$/.test(r.spec.sha256 ?? '') || !Array.isArray(r.evidence)
      || r.evidence.some((e) => !safePath(e.path) || !/^[a-f0-9]{64}$/.test(e.sha256 ?? ''))
      || !['codex', 'claude'].includes(r.native?.provider)
      || !['sessionId', 'environmentId', 'policySha256'].every((key) => Object.hasOwn(r.native, key) && (r.native[key] === null || required(r.native[key])))
      || (r.native.policySha256 !== null && !/^[a-f0-9]{64}$/.test(r.native.policySha256))
      || !Array.isArray(r.repairOwners) || r.repairOwners.some((o) => !Number.isSafeInteger(o.prNumber) || o.prNumber <= 0
        || !Number.isSafeInteger(o.commentId) || o.commentId <= 0 || !required(o.sessionId) || !revision(o.headSha))) {
    throw new Error('Recovery packet needs pinned source, spec/evidence hashes, native binding and acknowledged PR owners');
  }
  const original = m.packet.recovery?.native;
  if (!original || ['provider', 'sessionId', 'environmentId', 'policySha256'].some((key) =>
    original[key] !== null && r.native[key] !== null && original[key] !== r.native[key])) {
    throw new Error('Checkpoint cannot change the original native owner or policy');
  }
  return r;
}

function verifySource(config, r, published, git) {
  git(config.repository, ['check-ref-format', `refs/heads/${r.branch}`]);
  if (r.branch === 'main' || r.branch.startsWith('noacg-recovery/')) throw new Error('Recovery source must be an owned feature branch');
  let retained = false;
  if (published) {
    try { git(config.repository, ['merge-base', '--is-ancestor', r.revision, published]); retained = true; } catch { /* New source must be pushed first. */ }
  }
  if (!retained) {
    const remote = git(config.repository, ['ls-remote', '--exit-code', config.remote, `refs/heads/${r.branch}`]).split(/\s+/)[0];
    if (remote !== r.revision) throw new Error('Push the exact owned source revision before checkpointing');
    git(config.repository, ['fetch', '--no-tags', config.remote, `refs/heads/${r.branch}`]);
  }
  for (const e of [r.spec, ...r.evidence]) {
    // Preserve the bytes, including the final newline, for hashing.
    const bytes = execFileSync('git', ['show', `${r.revision}:${e.path}`], { cwd: config.repository, timeout: 30_000, maxBuffer: 2 * 1024 * 1024, windowsHide: true });
    if (sha(bytes) !== e.sha256) throw new Error(`Recovery evidence hash differs: ${e.path}`);
  }
}

/** Publish before dispatch. A rejected/unknown push cannot authorize an external action. */
export function publishRun(db, id) {
  const git = transports.get(db) ?? recoveryGit;
  const row = db.prepare('SELECT doc FROM runs WHERE id=?').get(id);
  const doc = JSON.parse(row.doc), config = doc.manifest.recovery;
  if (!config) return;
  settings(config, git);
  const ledger = readFileSync(doc.manifest.wave, 'utf8'), r = validateState(doc, ledger);
  const worktree = doc.packet.workspace?.worktree;
  if (!path.isAbsolute(worktree ?? '') || git(worktree, ['rev-parse', 'HEAD']) !== r.revision
      || git(worktree, ['status', '--porcelain'])) throw new Error('Commit and push owned work before checkpointing; dirty files are not durable');
  const old = db.prepare('SELECT sha FROM recovery_heads WHERE id=?').get(id)?.sha ?? '';
  verifySource(config, r, old, git);
  // Adapter arguments may carry credentials. A replacement host supplies its own trusted
  // adapter; keep the entire original executable configuration in the local store only.
  const durableDoc = structuredClone(doc);
  delete durableDoc.manifest.adapter;
  if (durableDoc.pending?.receipt) durableDoc.pending.receipt = deliveredReceipt(durableDoc.pending.receipt);
  if (durableDoc.wait) durableDoc.wait = pick(durableDoc.wait, ['kind', 'reason', 'until']);
  for (const packet of [durableDoc.packet, durableDoc.manifest.packet]) {
    if (packet.restoredGithub) packet.restoredGithub = githubObservations(packet.restoredGithub);
  }
  const payload = JSON.stringify({ version: 1, doc: durableDoc, ledger });
  if (Buffer.byteLength(payload) > 256 * 1024) throw new Error('Recovery checkpoint exceeds 256 KiB; use committed evidence references');
  const ref = refFor(id);
  if (old && git(config.repository, ['show', `${old}:checkpoint.json`]) === payload) {
    if (remoteHead(git, config, ref) !== old) throw superseded();
    return old;
  }
  const blob = git(config.repository, ['hash-object', '-w', '--stdin'], payload);
  const tree = git(config.repository, ['mktree'], `100644 blob ${blob}\tcheckpoint.json\n`);
  // Keep the actual source tree reachable after its feature branch has been deleted.
  const commit = git(config.repository, ['commit-tree', tree, ...(old ? ['-p', old] : []), '-p', r.revision], `Recovery checkpoint ${id}\n`);
  try {
    git(config.repository, ['push', `--force-with-lease=${ref}:${old}`, config.remote, `${commit}:${ref}`]);
  } catch (error) {
    // Name git's own answer: a refused namespace and a lost connection need different fixes.
    const said = String(error.stderr || error.message).trim().split('\n').filter(Boolean).slice(-3).join(' | ').slice(0, 500);
    // A transport failure may follow acceptance. Reconcile this exact commit, never force.
    let accepted;
    try { accepted = remoteHead(git, config, ref); } catch (readBack) { throw new Error(`${readBack.message}; the push said (git: ${said})`, { cause: readBack }); }
    if (accepted !== commit) throw accepted === old ? new Error(`Recovery publication unresolved; retry before acting (git: ${said})`) : superseded();
  }
  db.prepare('INSERT INTO recovery_heads VALUES(?,?) ON CONFLICT(id) DO UPDATE SET sha=excluded.sha').run(id, commit);
  return commit;
}

/** A push the remote accepted after this store gave up on it (the network failed after
 * acceptance, so the transition was rolled back locally) is this store's own next checkpoint,
 * not another coordinator's: same restoration generation, parented on this store's head. Adopt
 * its ledger and state so the store and the remote agree again. Returns whether it adopted. */
export function adoptAccepted(db, id) {
  if (!JSON.parse(db.prepare('SELECT doc FROM runs WHERE id=?').get(id)?.doc ?? '{}').manifest?.recovery) return false;
  // Under the write lock, so another local process's publication in progress is never mistaken for a lost one.
  db.exec('BEGIN IMMEDIATE');
  try {
    const adopted = adoptLocked(db, id);
    db.exec('COMMIT');
    return adopted;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

function adoptLocked(db, id) {
  const doc = JSON.parse(db.prepare('SELECT doc FROM runs WHERE id=?').get(id).doc), config = doc.manifest.recovery;
  const git = transports.get(db) ?? recoveryGit, ref = refFor(id);
  const head = db.prepare('SELECT sha FROM recovery_heads WHERE id=?').get(id)?.sha;
  const remote = remoteHead(git, config, ref);
  if (!head || !revision(remote) || remote === head) return false;
  git(config.repository, ['fetch', '--no-tags', config.remote, ref]);
  if (git(config.repository, ['rev-list', '--parents', '-n', '1', remote]).split(' ')[1] !== head) return false;
  const snapshot = JSON.parse(git(config.repository, ['show', `${remote}:checkpoint.json`]));
  if (snapshot.version !== 1 || snapshot.doc?.manifest?.id !== id
      || snapshot.doc.restoration?.generation !== doc.restoration?.generation) return false;
  // Take the accepted ledger only over the one this store last published: a line recorded
  // locally since then (an unsupervised plan run) is kept, or refused if both changed.
  const published = JSON.parse(git(config.repository, ['show', `${head}:checkpoint.json`])).ledger;
  const local = readFileSync(doc.manifest.wave, 'utf8');
  if (snapshot.ledger !== published && local !== published) throw new Error(`The ledger changed locally after a checkpoint GitHub accepted unacknowledged; reconcile it with ${ref} before acting`);
  // The durable copy omits the local adapter and paths; this store's own manifest supplies them.
  const adopted = { ...snapshot.doc, manifest: doc.manifest, packet: { ...snapshot.doc.packet, workspace: doc.packet.workspace } };
  db.prepare('UPDATE runs SET doc=?,owner=NULL,leaseUntil=0,epoch=epoch+1 WHERE id=?').run(JSON.stringify(adopted), id);
  db.prepare('UPDATE recovery_heads SET sha=? WHERE id=?').run(remote, id);
  if (snapshot.ledger !== published) writeFileSync(doc.manifest.wave, snapshot.ledger);
  return true;
}

/** Read-only check before acting: a store whose last publication is no longer the remote
 * checkpoint has been superseded by a newer coordinator. Nothing is written or pushed. */
export function assertCurrent(db, id, doc) {
  const config = doc.manifest.recovery;
  if (!config) return;
  const head = db.prepare('SELECT sha FROM recovery_heads WHERE id=?').get(id)?.sha;
  if (remoteHead(transports.get(db) ?? recoveryGit, config, refFor(id)) !== head) throw superseded();
}

/** The id of the plan's one unexpired active project among the shared recovery refs, or null. */
export function activeProject(db, config, plan, now = Date.now()) {
  const git = transports.get(db) ?? recoveryGit;
  settings(config, git);
  if (!PLAN_RUN_KIND.test(`plan-${plan}`)) throw new Error(`"${plan}" is not a plan name (lowercase words joined by single dashes)`);
  // Project ids are plan-<plan>-<first date>; the date keeps plan "a" from matching plan "a-b".
  const prefix = `${RECOVERY_REFS}plan-${plan}-`;
  const own = (ref) => typeof ref === 'string' && ref.startsWith(prefix) && /^\d{4}-\d\d-\d\d$/.test(ref.slice(prefix.length));
  const refs = git(config.repository, ['ls-remote', config.remote, `${prefix}*`])
    .split('\n').map((line) => line.split(/\s+/)).filter(([, ref]) => own(ref));
  const active = refs.filter(([sha, ref]) => {
    git(config.repository, ['fetch', '--no-tags', config.remote, ref]);
    const { doc } = JSON.parse(git(config.repository, ['show', `${sha}:checkpoint.json`]));
    return doc?.manifest?.kind === 'plan' && doc.status === 'active' && now < Date.parse(doc.manifest.authorization.deadline);
  }).map(([, ref]) => ref.slice(RECOVERY_REFS.length));
  if (active.length > 1) throw new Error(`Several active ${plan} projects (${active.join(', ')}); finish or cancel all but one`);
  return active[0] ?? null;
}

/** Rebuild an empty local store and worktree from the latest remote checkpoint. Never dispatch. */
export function restoreRun(db, config, now = Date.now()) {
  const git = transports.get(db) ?? recoveryGit;
  settings(config, git);
  if (!runId(config.id) || !path.isAbsolute(config.worktree ?? '') || !path.isAbsolute(config.wave ?? '')
      || !path.isAbsolute(config.adapter?.command ?? '') || !path.isAbsolute(config.adapter?.cwd ?? '')
      || !Array.isArray(config.adapter.args) || config.adapter.args.some((s) => typeof s !== 'string')
      || /\.(?:cmd|bat|ps1)$/i.test(config.adapter.command)) throw new Error('Restore needs absolute worktree/ledger paths and an explicit local adapter');
  const adapter = { ...config.adapter, command: realpathSync(config.adapter.command), cwd: realpathSync(config.adapter.cwd) };
  if (!statSync(adapter.command).isFile() || !statSync(adapter.cwd).isDirectory()
      || /\.(?:cmd|bat|ps1)$/i.test(adapter.command)) throw new Error('Replacement adapter needs an executable file and working directory');
  accessSync(adapter.command, constants.X_OK);
  accessSync(adapter.cwd, constants.X_OK);
  config = { ...config, adapter };
  if (db.prepare('SELECT id FROM runs').get()) throw new Error('Restore requires an empty run store; never replace another owner');
  const ref = refFor(config.id);
  git(config.repository, ['fetch', '--no-tags', config.remote, ref]);
  const checkpoint = git(config.repository, ['rev-parse', 'FETCH_HEAD']);
  const raw = git(config.repository, ['show', `${checkpoint}:checkpoint.json`]);
  const snapshot = JSON.parse(raw), { doc, ledger } = snapshot;
  if (snapshot.version !== 1 || doc?.manifest?.id !== config.id
      || !sameRepository(doc.manifest.recovery?.repositoryFullName, config.repositoryFullName)) throw new Error('Recovery checkpoint identity differs');
  const r = validateState(doc, ledger);
  verifySource(config, r, checkpoint, git);
  mkdirSync(path.dirname(config.wave), { recursive: true });
  // A local preparation journal makes interrupted restoration repeatable without replacing
  // unrelated directories or changed local work. It contains no credentials or executable code.
  const journal = `${config.wave}.restore.json`;
  const prepared = JSON.stringify({ id: config.id, repositoryFullName: config.repositoryFullName,
    worktree: config.worktree, authorizationSha256: sha(JSON.stringify(doc.manifest.authorization)) });
  if (existsSync(journal)) {
    if (readFileSync(journal, 'utf8') !== prepared) throw new Error('Interrupted restoration identity differs');
  } else {
    if (existsSync(config.worktree) || existsSync(config.wave)) throw new Error('Restore needs unused worktree/ledger paths');
    writeFileSync(journal, prepared, { flag: 'wx', mode: 0o600 });
  }
  if (existsSync(config.worktree)) {
    if (canonicalPath(git(config.worktree, ['rev-parse', '--show-toplevel'])) !== canonicalPath(config.worktree)
        || git(config.worktree, ['rev-parse', 'HEAD']) !== r.revision || git(config.worktree, ['status', '--porcelain'])) throw new Error('Prepared worktree changed; preserve it and reconcile');
  } else git(config.repository, ['worktree', 'add', '--detach', config.worktree, r.revision]);
  if (existsSync(config.wave)) {
    if (readFileSync(config.wave, 'utf8') !== ledger) throw new Error('Prepared ledger changed; preserve it and reconcile');
  } else writeFileSync(config.wave, ledger, { flag: 'wx', mode: 0o600 });
  doc.manifest = { ...doc.manifest, wave: config.wave, adapter: config.adapter,
    recovery: { repository: config.repository, remote: config.remote, repositoryFullName: doc.manifest.recovery.repositoryFullName } };
  doc.packet.workspace = { ...doc.packet.workspace, worktree: config.worktree };
  // The block this store takes over: its first start-block may replace it while it is active.
  const supersedes = readProject(ledger, now)?.block?.id;
  doc.restoration = { checkpoint, generation: randomUUID(), reconciled: false, ...(supersedes ? { supersedes } : {}) };
  if (doc.status === 'active' && now >= Date.parse(doc.manifest.authorization.deadline)) doc.status = 'expired';
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO runs(id,wave,doc) VALUES(?,?,?)').run(config.id, config.wave, JSON.stringify(doc));
    db.prepare('INSERT INTO recovery_heads VALUES(?,?)').run(config.id, checkpoint);
    // Claim the next checkpoint generation before allowing ticks on this replacement host.
    publishRun(db, config.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return { id: config.id, status: doc.status, checkpoint, worktree: config.worktree, reconciliationRequired: true };
}

/** Read-only native and GitHub receipts must be fresh and match every saved owner. */
export function restoredObservation(doc, receipt, now) {
  const r = doc.packet.recovery;
  if (receipt?.checkpoint !== doc.restoration.checkpoint || !required(receipt.evidence)
      || !Array.isArray(receipt.github)) return false;
  const expected = { ...r.native, revision: r.revision };
  const inspected = inspectNative(expected, receipt.native, now);
  if (!['running', 'waiting', 'gone'].includes(inspected.state)) return false;
  for (const owner of r.repairOwners) {
    const current = receipt.github.filter((p) => p.prNumber === owner.prNumber);
    if (current.length !== 1) return false;
    const p = current[0], at = Date.parse(p.observedAt);
    if (!sameRepository(p.repositoryFullName, doc.manifest.recovery.repositoryFullName) || p.headSha !== owner.headSha
        || p.ownerSessionId !== owner.sessionId || p.commentId !== owner.commentId || !required(p.evidence)
        || !['open', 'closed', 'merged'].includes(p.state) || !Number.isFinite(at) || at > now || now - at > 30_000) return false;
  }
  return true;
}
