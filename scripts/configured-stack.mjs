#!/usr/bin/env node
// The configured suite's local Supabase stack: allocate, start, prove ready, and take down (cf04, #1865, #1829).
//
//   node scripts/configured-stack.mjs up   [--owner <id>] [--exclude studio,edge-runtime]
//   node scripts/configured-stack.mjs down [--owner <id>]   (also the stacks of <id>/<anything>)
//
// WHY. `supabase start` publishes fixed host ports (54320-54329 by default), and they sit inside the
// kernel's ephemeral range (net.ipv4.ip_local_port_range, 32768-60999 on ubuntu-latest). Any
// outbound connection the kernel autobinds - the image pulls `supabase start` runs itself, the
// cache downloads before it - can be given 54322 as its source port, and while that socket lives
// (or sits in TIME_WAIT for 60 s after it closes) Docker cannot bind the port: "failed to bind host
// port 0.0.0.0:54322/tcp: address already in use", on a fresh runner with no other stack on it
// (runs 41224338003 and 41542753257; phase-cf04.md has the diagnosis). Starting again three seconds
// later fails the same way, so the old bounded retry did not fix it.
//
// WHAT THIS DOES INSTEAD.
//   - Allocation: each stack claims a slot k (an atomic mkdir under CLAIMS_ROOT), whose ten-port
//     block is the default block plus 100 k. The block is first reserved
//     (net.ipv4.ip_local_reserved_ports: the kernel then never autobinds it), then checked: a
//     block any socket already uses, in any state, is given back and the next slot is tried. The
//     holder is printed, never killed.
//   - Isolation: the slot's stack runs from its own copy of supabase/ with its own project_id
//     (container, volume and network names) and its own ports, so two stacks on one host share
//     nothing. SUPABASE_WORKDIR points every later `supabase` call of the job at it.
//   - Readiness: after the start returns, the project's containers are all running, publish only
//     the slot's ports, and the API answers through the gateway. One check, no polling: `supabase
//     start` has already waited for the health checks.
//   - No retry: a failed start prints the ports' holders and the project's containers, and fails.
//   - Cleanup: `down` (a step with `if: always()`, so it runs after a failure or a cancellation)
//     stops every stack this owner claimed, then proves nothing is left: no container, volume or
//     network of the project, no process of ours, no socket listening on or owned on the block,
//     and each port binds. An ownerless TIME_WAIT socket left on the block is counted, not ignored:
//     it can block Docker's bind for 60 s, so allocation skips a block that has one. Only then are the reservation and the claim given back.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const CLAIMS_ROOT = '/tmp/noacg-configured-stacks';
export const BASE_PORT = 54320; // the CLI's default block: shadow 54320 ... pooler 54329, every port set in it
export const SLOTS = 10;
export const RESERVED = '/proc/sys/net/ipv4/ip_local_reserved_ports';
const PROJECT_LABEL = 'com.supabase.cli.project';

/** The ten-port block of slot k, and the port each published service takes in it. */
export function slotPorts(slot) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS) throw new Error(`slot ${slot} is outside 0..${SLOTS - 1}`);
  const b = BASE_PORT + 100 * slot;
  return {
    first: b, last: b + 9,
    shadow: b, api: b + 1, db: b + 2, studio: b + 3, inbucket: b + 4, smtp: b + 5, pop3: b + 6,
    analytics: b + 7, vector: b + 8, pooler: b + 9,
  };
}

export function projectIdOf(slot) {
  return `noacg-studio-s${slot}`;
}

/**
 * Set `key = value` in TOML table `table`, editing the line when the table has the key, adding it
 * under the table's header when it does not, and appending the table when the file has none.
 * Only for the flat tables config.toml uses; `table` '' is the top level.
 */
export function setTomlKey(text, table, key, value) {
  const lines = text.split('\n');
  const literal = typeof value === 'string' ? JSON.stringify(value) : String(value);
  const isHeader = (l) => /^\s*\[\[?[^\]]+\]\]?\s*(#.*)?$/.test(l);
  let start = 0;
  if (table !== '') {
    start = lines.findIndex((l) => l.trim().replace(/\s*#.*$/, '') === `[${table}]`);
    if (start === -1) return `${text.replace(/\n*$/, '\n')}\n[${table}]\n${key} = ${literal}\n`;
    start += 1;
  }
  let end = lines.findIndex((l, i) => i >= start && isHeader(l));
  if (end === -1) end = lines.length;
  const keyRe = new RegExp(`^\\s*${key}\\s*=`);
  for (let i = start; i < end; i++) {
    if (keyRe.test(lines[i])) { lines[i] = `${key} = ${literal}`; return lines.join('\n'); }
  }
  lines.splice(start, 0, `${key} = ${literal}`);
  return lines.join('\n');
}

/** config.toml for one slot: its project_id and every port the CLI publishes, from the block. */
export function slotConfig(text, slot) {
  const p = slotPorts(slot);
  let out = setTomlKey(text, '', 'project_id', projectIdOf(slot));
  for (const [table, key, value] of [
    ['api', 'port', p.api], ['db', 'port', p.db], ['db', 'shadow_port', p.shadow],
    ['db.pooler', 'port', p.pooler], ['studio', 'port', p.studio],
    // smtp_port and pop3_port stay unset: set, the CLI would publish them. Unset, they are not, and
    // ready() fails any port a container publishes outside the block.
    ['inbucket', 'port', p.inbucket],
    ['analytics', 'port', p.analytics], ['analytics', 'vector_port', p.vector],
  ]) out = setTomlKey(out, table, key, value);
  return out;
}

/** Parse "a-b,c" (the reserved-ports sysctl) into [from, to] ranges. */
export function parseRanges(text) {
  return text.trim().split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
    const [a, b = a] = s.split('-').map(Number);
    return [a, b];
  });
}

/**
 * The reserved-ports value with every slot block replaced by the claimed ones: other reservations
 * are kept, the blocks of slots nobody claims are given back.
 */
export function reservedValue(current, claimedSlots) {
  const lo = BASE_PORT, hi = slotPorts(SLOTS - 1).last;
  const ports = new Set();
  for (const [a, b] of parseRanges(current)) for (let x = a; x <= b; x++) if (x < lo || x > hi || ((x - lo) % 100) > 9) ports.add(x);
  for (const s of claimedSlots) { const p = slotPorts(s); for (let x = p.first; x <= p.last; x++) ports.add(x); }
  const sorted = [...ports].sort((a, b) => a - b);
  const out = [];
  for (const x of sorted) {
    const last = out[out.length - 1];
    if (last && x === last[1] + 1) last[1] = x; else out.push([x, x]);
  }
  return out.map(([a, b]) => (a === b ? `${a}` : `${a}-${b}`)).join(',');
}

/** The lines of `ss -Htan[p]` whose LOCAL port is in [first, last]: any state, any family. */
export function socketsOn(ssOutput, first, last) {
  return ssOutput.split('\n').filter((line) => {
    const cols = line.trim().split(/\s+/);
    if (cols.length < 5) return false;
    const port = Number(cols[3].slice(cols[3].lastIndexOf(':') + 1));
    return port >= first && port <= last;
  });
}

/** A socket that holds a port: one listening, or one a process still owns. TIME_WAIT has no owner. */
export function holding(lines) {
  return lines.filter((l) => /^LISTEN\b/.test(l.trim()) || /users:\(/.test(l));
}

// --- the host side -------------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', ...opts, windowsHide: true });
  return { code: r.status ?? 1, out: r.stdout ?? '', err: (r.stderr ?? '') + (r.error ? String(r.error) : '') };
}
/** Every TCP socket on the host, with its owner. A failed read throws: an empty answer would read as "free". */
function ss() {
  const r = run('sudo', ['-n', 'ss', '-Htanp']);
  if (r.code !== 0) throw new Error(`sudo -n ss -Htanp failed (${r.code}): ${r.err.trim()}`);
  return r.out;
}

function claimedSlots(root = CLAIMS_ROOT) {
  if (!existsSync(root)) return [];
  return readdirSync(root).map((n) => /^slot-(\d+)$/.exec(n)).filter(Boolean).map((m) => Number(m[1]));
}

/** Rewrite the reservation from the claims, serialised across stacks by flock(1). */
function syncReservations() {
  const self = fileURLToPath(import.meta.url);
  const r = run('flock', ['-w', '60', join(CLAIMS_ROOT, '.lock'), process.execPath, self, '_sync']);
  if (r.code !== 0) throw new Error(`could not update ${RESERVED}: ${r.err.trim() || r.out.trim()}`);
}

function writeReservations() {
  const value = reservedValue(readFileSync(RESERVED, 'utf8'), claimedSlots());
  const r = run('sudo', ['-n', 'tee', RESERVED], { input: `${value}\n` });
  if (r.code !== 0) throw new Error(`sudo tee ${RESERVED} failed: ${r.err.trim()}`);
  const now = readFileSync(RESERVED, 'utf8').trim();
  if (now !== value) throw new Error(`${RESERVED} reads "${now}" after writing "${value}"`);
}

export function defaultOwner() {
  const { RUNNER_NAME, GITHUB_RUN_ID, GITHUB_RUN_ATTEMPT, GITHUB_JOB } = process.env;
  if (!GITHUB_RUN_ID) throw new Error('outside GitHub Actions, pass --owner <id>');
  return `${RUNNER_NAME ?? 'runner'}:${GITHUB_RUN_ID}:${GITHUB_RUN_ATTEMPT ?? '1'}:${GITHUB_JOB ?? 'job'}`;
}

function exportEnv(pairs) {
  for (const [k, v] of Object.entries(pairs)) console.log(`${k}=${v}`);
  if (process.env.GITHUB_ENV) appendFileSync(process.env.GITHUB_ENV, Object.entries(pairs).map(([k, v]) => `${k}=${v}\n`).join(''));
}

function diagnose(p, projectId) {
  console.log(`--- sockets on ports ${p.first}-${p.last} (sudo ss -tanp) ---`);
  console.log(socketsOn(ss(), p.first, p.last).join('\n') || '(none)');
  console.log(`--- containers of ${projectId} ---`);
  console.log(run('docker', ['ps', '-a', '--filter', `label=${PROJECT_LABEL}=${projectId}`, '--format', '{{.Names}}\t{{.Status}}\t{{.Ports}}']).out || '(none)');
}

/** Claim, reserve and check a slot; returns its state, or throws when no slot is free. */
function allocate(owner) {
  mkdirSync(CLAIMS_ROOT, { recursive: true });
  console.log(`ephemeral range (ip_local_port_range): ${readFileSync('/proc/sys/net/ipv4/ip_local_port_range', 'utf8').trim()}`);
  for (let slot = 0; slot < SLOTS; slot++) {
    const dir = join(CLAIMS_ROOT, `slot-${slot}`);
    const p = slotPorts(slot);
    const state = { owner, slot, projectId: projectIdOf(slot), ports: p, workdir: dir, claimedAt: new Date().toISOString() };
    // The claim and its state appear together: written aside, then renamed onto the slot's name,
    // which fails while another claim (never empty) holds it. No claim exists without its owner.
    const draft = join(CLAIMS_ROOT, `.draft-${process.pid}-${slot}`);
    rmSync(draft, { recursive: true, force: true });
    mkdirSync(draft);
    writeFileSync(join(draft, 'state.json'), JSON.stringify(state, null, 2));
    try { renameSync(draft, dir); } catch (e) {
      rmSync(draft, { recursive: true, force: true });
      if (e.code === 'ENOTEMPTY' || e.code === 'EEXIST') continue;
      throw e;
    }
    syncReservations();
    // Checked AFTER the reservation, so no autobind can take a port between the check and the start.
    const used = socketsOn(ss(), p.first, p.last);
    if (used.length === 0) return state;
    console.log(`::warning title=Ports ${p.first}-${p.last} in use::slot ${slot} skipped, its ports are already used by:%0A${used.join('%0A')}`);
    rmSync(dir, { recursive: true, force: true });
    syncReservations();
  }
  throw new Error(`no free slot: all ${SLOTS} blocks from ${BASE_PORT} are claimed or in use`);
}

function stackEnv(workdir) {
  return { ...process.env, SUPABASE_WORKDIR: workdir };
}

/** `supabase status -o json` of the stack in `workdir`. */
export function stackStatus(workdir) {
  const r = run('supabase', ['status', '-o', 'json'], { env: stackEnv(workdir) });
  if (r.code !== 0) throw new Error(`supabase status failed: ${r.err.trim()}`);
  const at = r.out.indexOf('{');
  if (at === -1) throw new Error(`supabase status printed no JSON: ${r.out.trim().slice(0, 200)}`);
  return JSON.parse(r.out.slice(at));
}

/** Every claim on the host with its state. */
export function readClaims(root = CLAIMS_ROOT) {
  return claimedSlots(root).flatMap((s) => {
    try {
      return [JSON.parse(readFileSync(join(root, `slot-${s}`, 'state.json'), 'utf8'))];
    } catch (e) {
      if (e.code === 'ENOENT') return []; // released by its own stack while this listed the slots
      throw e;
    }
  });
}

/** One readiness check after `supabase start` returned. Throws with what is not ready. */
async function ready(state) {
  const { ports: p, projectId } = state;
  const rows = run('docker', ['ps', '-a', '--filter', `label=${PROJECT_LABEL}=${projectId}`, '--format', '{{.Names}}|{{.State}}|{{.Ports}}|{{.Image}}']).out.trim().split('\n').filter(Boolean);
  if (rows.length === 0) throw new Error(`no container carries ${PROJECT_LABEL}=${projectId}`);
  const problems = [];
  const published = new Set();
  for (const row of rows) {
    const [name, st, ports] = row.split('|');
    if (st !== 'running') problems.push(`${name} is ${st}`);
    for (const m of (ports ?? '').matchAll(/:(\d+)->/g)) published.add(Number(m[1]));
  }
  for (const port of published) if (port < p.first || port > p.last) problems.push(`a container of ${projectId} publishes ${port}, outside its block ${p.first}-${p.last}`);
  for (const port of [p.api, p.db]) if (!published.has(port)) problems.push(`nothing publishes ${port}`);
  const pinned = realtimeImageProblem(rows);
  if (pinned) problems.push(pinned);
  const status = stackStatus(state.workdir);
  if (!String(status.API_URL ?? '').endsWith(`:${p.api}`)) problems.push(`supabase status reports API_URL ${status.API_URL}, not port ${p.api}`);
  try {
    const res = await fetch(`${status.API_URL}/rest/v1/`, { headers: { apikey: status.ANON_KEY } });
    if (res.status !== 200) problems.push(`the API gateway answered ${res.status} on /rest/v1/`);
    const auth = await fetch(`${status.API_URL}/auth/v1/health`, { headers: { apikey: status.ANON_KEY } });
    if (auth.status !== 200) problems.push(`auth answered ${auth.status} on /auth/v1/health`);
  } catch (e) {
    problems.push(`the API at ${status.API_URL} did not answer: ${e.message}`);
  }
  if (problems.length) throw new Error(problems.join('; '));
  return { containers: rows.length, published: [...published].sort() };
}

/**
 * THE REALTIME IMAGE, pinned on its own (issue #2204). The pinned CLI (2.111.0) starts Realtime
 * v2.120.3, whose partition upkeep runs `ALTER TABLE realtime.messages_<day> OWNER TO ...` on every
 * partition, today's included, whenever a tenant connects. That takes an ACCESS EXCLUSIVE lock on
 * the partition a broadcast writes to, which would make `realtime.send` in control_events_frame
 * (0071, 250 ms) drop a frame: one known source of the lost frames #2204 is about, not a proven
 * one. Realtime v2.145.1 alters only partitions it creates (supabase/realtime#2374). The CLI reads
 * `.temp/realtime-version` to replace that one image, so the rest of the stack stays on the CLI's
 * versions. CI only: a developer's own `supabase start` keeps the CLI's Realtime. Remove this when
 * the CLI pin reaches 2.122.1, which ships Realtime v2.147.1 itself (docs/STACK_FRESHNESS.md).
 */
export const REALTIME_VERSION = 'v2.147.1';

/** Why the stack's Realtime container is not the pinned image, or null when it is. `rows` are
 *  `docker ps` lines, `name|state|ports|image`. */
export function realtimeImageProblem(rows) {
  const realtime = rows.map((r) => r.split('|')).filter(([name]) => /realtime/.test(name));
  if (realtime.length === 0) return 'no Realtime container is running';
  const wrong = realtime.find(([, , , image]) => !String(image ?? '').endsWith(`:${REALTIME_VERSION}`));
  return wrong ? `${wrong[0]} runs ${wrong[3]}, not Realtime ${REALTIME_VERSION}` : null;
}

/** Write the image overrides the CLI reads from `<supabase dir>/.temp`. */
export function pinImages(supabaseDir) {
  mkdirSync(join(supabaseDir, '.temp'), { recursive: true });
  writeFileSync(join(supabaseDir, '.temp', 'realtime-version'), REALTIME_VERSION);
}

async function up(args) {
  const owner = args.owner ?? defaultOwner();
  const exclude = args.exclude ?? 'studio,edge-runtime';
  const source = resolve(args.source ?? 'supabase');
  const state = allocate(owner);
  const { slot, projectId, ports: p, workdir } = state;
  cpSync(source, join(workdir, 'supabase'), { recursive: true });
  writeFileSync(join(workdir, 'supabase', 'config.toml'), slotConfig(readFileSync(join(source, 'config.toml'), 'utf8'), slot));
  pinImages(join(workdir, 'supabase'));
  // Before the start, so a later step (and `down`) reaches this stack even if the start fails.
  exportEnv({ SUPABASE_WORKDIR: workdir, NOACG_STACK_PROJECT: projectId, NOACG_STACK_SLOT: String(slot) });
  console.log(`::notice title=Local stack slot ${slot}::project ${projectId}, ports ${p.first}-${p.last} reserved and free, owner ${owner}`);
  const start = spawnSync('supabase', ['start', '-x', exclude], { stdio: 'inherit', windowsHide: true, env: stackEnv(workdir) });
  if (start.status !== 0) {
    diagnose(p, projectId);
    throw new Error(`supabase start failed (exit ${start.status ?? start.signal}); not retried - the diagnosis is above, and the cleanup step takes the stack down`);
  }
  const r = await ready(state);
  console.log(`Local stack ${projectId} ready: ${r.containers} containers running, publishing ${r.published.join(', ')}.`);
}

/** The pids from `pid` up to init: never ours to stop, whatever their environment holds. */
function ancestors(pid) {
  const out = new Set();
  for (let p = pid; p > 1 && !out.has(p);) {
    out.add(p);
    try { p = Number(/^\d+ \(.*\) \S (\d+)/s.exec(readFileSync(`/proc/${p}/stat`, 'utf8'))[1]); } catch { break; }
  }
  return out;
}

/**
 * This stack's own CLI processes: a `supabase` process whose environment points at this stack's
 * workdir. The name matters: SUPABASE_WORKDIR is in the job's environment, so every later step's
 * shell carries it too (run 41602754978 stopped its own teardown step on that).
 */
export function isStackProcess(comm, environ, workdir) {
  return comm.trim() === 'supabase' && environ.split('\0').includes(`SUPABASE_WORKDIR=${workdir}`);
}

function ourProcesses(workdir) {
  const skip = ancestors(process.pid);
  const ours = [];
  for (const pid of readdirSync('/proc').filter((n) => /^\d+$/.test(n)).map(Number)) {
    if (skip.has(pid)) continue;
    try {
      if (isStackProcess(readFileSync(`/proc/${pid}/comm`, 'utf8'), readFileSync(`/proc/${pid}/environ`, 'utf8'), workdir)) ours.push(pid);
    } catch { /* another user's process, or gone: not ours */ }
  }
  return ours;
}

function bindable(port) {
  return new Promise((done) => {
    const s = net.createServer();
    s.once('error', (e) => done(e.code));
    s.listen({ port, host: '0.0.0.0' }, () => s.close(() => done(true)));
  });
}

/** Take one claimed stack down and prove it gone; returns the problems found. */
async function teardown(state) {
  const { projectId, ports: p, workdir, slot } = state;
  const problems = [];
  // Our own CLI processes only (a start cut off by a cancellation): matched by this stack's workdir.
  for (const pid of ourProcesses(workdir)) {
    console.log(`stopping our leftover process ${pid} (${readFileSync(`/proc/${pid}/cmdline`, 'utf8').replaceAll('\0', ' ').trim()})`);
    try { process.kill(pid, 'SIGTERM'); } catch { /* already gone */ }
  }
  // Until they have exited (observable in /proc), at most 15 s; one still there is reported below.
  for (const until = Date.now() + 15_000; ourProcesses(workdir).length && Date.now() < until;) await new Promise((r) => setTimeout(r, 200));
  const stop = run('supabase', ['stop', '--no-backup'], { env: stackEnv(workdir) });
  console.log(stop.out.trim(), stop.err.trim());
  // What the CLI could not remove, removed by this project's label - never anything else.
  const label = `label=${PROJECT_LABEL}=${projectId}`;
  // A query that fails proves nothing: it is a problem, so the claim is kept, never read as "none left".
  const left = (kind) => {
    const r = run('docker', [kind, 'ls', ...(kind === 'container' ? ['-a'] : []), '-q', '--filter', label]);
    if (r.code !== 0) { problems.push(`docker ${kind} ls failed (${r.code}): ${r.err.trim()}`); return []; }
    return r.out.trim().split('\n').filter(Boolean);
  };
  for (const [kind, remove] of [['container', ['rm', '-f', '-v']], ['volume', ['volume', 'rm', '-f']], ['network', ['network', 'rm']]]) {
    const ids = left(kind);
    if (ids.length) run('docker', [...remove, ...ids]);
  }
  for (const kind of ['container', 'volume', 'network']) {
    const n = left(kind).length;
    if (n) problems.push(`${n} ${kind}(s) of ${projectId} remain`);
  }
  const all = run('docker', ['ps', '-a', '--format', '{{.Names}}']);
  if (all.code !== 0) problems.push(`docker ps failed (${all.code}): ${all.err.trim()}`);
  const named = all.out.split('\n').filter((n) => n.endsWith(`_${projectId}`));
  if (named.length) problems.push(`containers named for ${projectId} remain: ${named.join(', ')}`);
  const procs = ourProcesses(workdir);
  if (procs.length) problems.push(`processes of this stack remain: ${procs.join(', ')}`);
  const sockets = socketsOn(ss(), p.first, p.last);
  const held = holding(sockets);
  if (held.length) problems.push(`ports still held:\n${held.join('\n')}`);
  for (let port = p.first; port <= p.last; port++) {
    const b = await bindable(port);
    if (b !== true) problems.push(`port ${port} does not bind (${b})`);
  }
  if (problems.length === 0) {
    rmSync(workdir, { recursive: true, force: true });
    syncReservations();
    console.log(`::notice title=Local stack slot ${slot} cleaned up::${projectId}: 0 containers, 0 volumes, 0 networks, no process; ports ${p.first}-${p.last} not held and each binds; ${sockets.length - held.length} ownerless TIME_WAIT socket(s) left (a new allocation skips a block until they expire); reservation and claim released.`);
  }
  return problems;
}

async function down(args) {
  const owner = args.owner ?? defaultOwner();
  const mine = readClaims().filter((st) => st.owner === owner || st.owner.startsWith(`${owner}/`));
  if (mine.length === 0) { console.log(`No local stack was claimed by ${owner}; nothing to clean up.`); return; }
  const problems = [];
  for (const st of mine) problems.push(...(await teardown(st)).map((x) => `slot ${st.slot}: ${x}`));
  if (problems.length) throw new Error(`cleanup is not complete:\n${problems.join('\n')}`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[++i];
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);
  const commands = { up, down, _sync: writeReservations };
  if (!Object.hasOwn(commands, cmd)) {
    console.error('usage: configured-stack.mjs up|down [--owner <id>]');
    process.exit(2);
  }
  Promise.resolve(commands[cmd](args)).catch((e) => {
    console.log(`::error title=Local stack ${cmd} failed::${String(e.message).replaceAll('\n', '%0A')}`);
    process.exit(1);
  });
}
