// What agents leave running is closed; what anybody else runs is not. docs/work-specs/agent-lifecycle
// AC-2 (a landed worktree's processes close with it) and AC-3 (abandoned processes close after a
// quiet hour, exempt ones never), judged against fake process tables shaped like this machine's.
// The real-process halves of both scenarios are in worktree-unattended.test.mjs.

import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  abandonedProcesses,
  closeAbandonedProcesses,
  closeProcesses,
  closeWorktreeProcesses,
  EXEMPT,
  judgeProcesses,
  listProcesses,
  recentCodexSessions,
  worktreeProcesses,
  worktreeQuiet,
} from './agent-processes.mjs';

const PRIMARY = 'C:/repo';
const W = 'C:/repo/.claude/worktrees/agent-1';
const OTHER = 'C:/repo/.claude/worktrees/agent-2';
const ROOTS = [PRIMARY, W, OTHER];
const T0 = Date.parse('2026-10-09T00:00:00Z');
const HOUR = 60 * 60_000;
const SWEEP = 9999; // the sweep's own pid, in no tree below

const CLI = 'C:\\Users\\o\\AppData\\Roaming\\Claude\\claude-code\\2.1.293\\claude.exe';
const DESKTOP = 'C:\\Program Files\\WindowsApps\\Claude_2.26454.2.0_x64__pzs8sxrjxfjjc\\app\\Claude.exe';
const PW_CHROME = 'C:\\Users\\o\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win\\chrome.exe';

function proc(pid, ppid, name, { cwd = null, command = name, createdMs = T0, exe = null } = {}) {
  return { pid, ppid, name, cwd, command, createdMs, exe };
}

/** One machine: a desktop session in W with a loop, a dev server, a test browser and its MCP server. */
function machine() {
  return [
    proc(4, 0, 'System'),
    proc(1000, 999, 'explorer.exe', { createdMs: T0 - 10 * HOUR }),
    proc(1100, 1000, 'Claude.exe', { exe: DESKTOP, command: `"${DESKTOP}"`, createdMs: T0 - 9 * HOUR }),
    proc(1200, 1100, 'claude.exe', { exe: CLI, command: `${CLI} --output-format stream-json`, cwd: W, createdMs: T0 - 5 }),
    // The 14-hour loop, run through the Bash tool, and the sleep it is in right now.
    proc(1210, 1200, 'bash.exe', { cwd: W, command: '"C:\\Program Files\\Git\\bin\\bash.exe" -c "until docker info; do sleep 5; done"' }),
    proc(1211, 1210, 'sleep.exe', { cwd: W, command: 'sleep 5', createdMs: T0 + 2 * HOUR - 3000 }),
    // The session's MCP server, and the browser it drives: the session's own.
    proc(1220, 1200, 'node.exe', { cwd: W, command: 'node C:\\Users\\o\\npm-cache\\_npx\\x\\node_modules\\@playwright\\mcp\\cli.js' }),
    proc(1221, 1220, 'chrome.exe', { exe: PW_CHROME, command: `"${PW_CHROME}" --headless` }),
    // A dev server and a test browser the agent started, the browser in a folder of its own.
    proc(1230, 1200, 'bash.exe', { cwd: W, command: 'bash.exe -c "npm run dev:worktree"' }),
    proc(1231, 1230, 'node.exe', { cwd: W, command: 'node C:\\repo\\node_modules\\vite\\bin\\vite.js' }),
    proc(1240, 1231, 'chrome-headless-shell.exe', { cwd: 'C:\\Users\\o\\AppData\\Local\\ms-playwright', command: 'chrome-headless-shell.exe --headless' }),
    // The job queue runner, orphaned by the command that started it, running from W.
    proc(1300, 1299, 'node.exe', { cwd: W, command: 'node scripts/jobs.mjs --runner' }),
    // The owner's own terminal in W, and OBS started from it.
    proc(1400, 1000, 'WindowsTerminal.exe', { createdMs: T0 - 8 * HOUR }),
    proc(1401, 1400, 'powershell.exe', { cwd: W, command: 'powershell.exe' }),
    proc(1500, 1210, 'obs64.exe', { cwd: W, command: 'obs64.exe' }),
    // A server whose starter is gone, in an agent worktree.
    proc(1600, 1599, 'node.exe', { cwd: W, command: 'node server.js' }),
    // An agent's process in the primary checkout, and an orphan there.
    proc(1700, 1200, 'bash.exe', { cwd: PRIMARY, command: 'bash.exe -c "sleep 1800"' }),
    proc(1710, 1709, 'node.exe', { cwd: PRIMARY, command: 'node tool.js' }),
    // A "parent" that started AFTER its child holds a dead parent's reused pid.
    proc(1800, 1801, 'node.exe', { cwd: OTHER, command: 'node left.js' }),
    proc(1801, 1200, 'bash.exe', { cwd: OTHER, command: 'bash.exe -c "echo"', createdMs: T0 + HOUR }),
  ];
}

const pids = (entries) => entries.map((e) => e.pid).sort((a, b) => a - b);

test('AC-2: everything an agent started in a worktree is closed with it, roots first', () => {
  const { close, keep } = worktreeProcesses(machine(), W, { roots: ROOTS, self: SWEEP });
  assert.deepEqual(pids(close), [1210, 1211, 1230, 1231, 1240, 1600]);
  assert.ok(close.findIndex((e) => e.pid === 1210) < close.findIndex((e) => e.pid === 1211), 'a loop goes before its child');
  const why = Object.fromEntries(keep.map((e) => [e.pid, e.why]));
  assert.match(why[1200], /session itself/);
  assert.match(why[1220], /MCP servers/);
  assert.match(why[1221], /MCP servers/, 'a browser an MCP server drives belongs to the session');
  assert.match(why[1300], /job queue runners/);
  assert.match(why[1401], /owner's own applications/);
  assert.match(why[1500], /owner's own applications/, 'OBS is the owner\'s even when an agent shell started it');
});

test('AC-2: a worktree only agents used has nothing kept, so it can go', () => {
  const table = machine().filter((p) => ![1200, 1220, 1221, 1300, 1401, 1500].includes(p.pid) || p.pid === 1200);
  // The session itself sits in the primary checkout here, as an orchestrator does.
  const moved = table.map((p) => (p.pid === 1200 ? { ...p, cwd: PRIMARY } : p));
  const { close, keep } = worktreeProcesses(moved, W, { roots: ROOTS, self: SWEEP });
  assert.deepEqual(keep, []);
  assert.deepEqual(pids(close), [1210, 1211, 1230, 1231, 1240, 1600]);
});

test('AC-3: after a quiet hour the loop goes; the queue runner, an MCP server and an owner app of the same age stay', () => {
  const asked = [];
  const quiet = (home) => {
    asked.push(home);
    return { quiet: home === W };
  };
  const closed = abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet });
  // The young sleep goes with its old loop: the age that counts is the tree's.
  assert.deepEqual(pids(closed), [1210, 1211, 1230, 1231, 1240, 1600]);
  for (const exempt of [1200, 1220, 1221, 1300, 1401, 1500]) assert.ok(!pids(closed).includes(exempt), `${exempt} was closed`);
  assert.equal(new Set(asked).size, asked.length, 'each checkout is asked once');
});

test('AC-3: a worktree that is not quiet, or a tree younger than an hour, keeps everything', () => {
  assert.deepEqual(abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet: () => ({ quiet: false }) }), []);
  assert.deepEqual(abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 50 * 60_000, quiet: () => ({ quiet: true }) }), []);
  const throwing = () => {
    throw new Error('transcripts unreadable');
  };
  assert.deepEqual(abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet: throwing }), []);
});

test('AC-3: in the shared primary checkout an agent\'s process can go, an orphan cannot', () => {
  const closed = pids(abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet: () => ({ quiet: true }) }));
  assert.ok(closed.includes(1700));
  assert.ok(!closed.includes(1710));
});

test('AC-3: a process stays while the session that started it is still working elsewhere', () => {
  // The session works from W; its `sleep 1800` runs in the quiet primary checkout.
  const closed = pids(abandonedProcesses(machine(), { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet: (home) => ({ quiet: home === PRIMARY }) }));
  assert.ok(!closed.includes(1700));
});

test('a Codex `bash -lc` loop is a command, not a session\'s own shell, and is aged as one', () => {
  const codex = proc(3000, 1000, 'codex.exe', { cwd: W, createdMs: T0 - HOUR });
  const loop = proc(3001, 3000, 'bash.exe', { cwd: W, command: 'bash -lc "until docker info; do sleep 5; done"' });
  const sleep = proc(3002, 3001, 'sleep.exe', { cwd: W, createdMs: T0 + 2 * HOUR - 1000 });
  const judged = judgeProcesses([...machine(), codex, loop, sleep], { roots: ROOTS, self: SWEEP });
  assert.equal(judged.get(3001).verdict, 'agent');
  assert.equal(judged.get(3002).root.pid, 3001);
  const closed = pids(abandonedProcesses([...machine(), codex, loop, sleep], { roots: ROOTS, self: SWEEP, now: T0 + 2 * HOUR, quiet: () => ({ quiet: true }) }));
  assert.ok(closed.includes(3001) && closed.includes(3002));
});

test('the owner\'s terminal beside the session the sweep runs in is not the sweep\'s own line', () => {
  // The owner runs the session in one terminal tab and a dev server in another, both in W.
  const table = [
    proc(1000, 999, 'explorer.exe', { createdMs: T0 - 10 * HOUR }),
    proc(4000, 1000, 'WindowsTerminal.exe', { createdMs: T0 - 9 * HOUR }),
    proc(4001, 4000, 'powershell.exe', { cwd: W, command: 'powershell.exe' }),
    proc(4002, 4001, 'node.exe', { cwd: W, command: 'node cli.js', exe: 'C:\\nodejs\\node.exe' }),
    { ...proc(4003, 4002, 'node.exe', { cwd: W }), command: 'node C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js' },
    proc(4004, 4003, 'bash.exe', { cwd: W, command: 'bash -c "node scripts/cleanup-worktrees.mjs --self --apply"' }),
    proc(4005, 4004, 'node.exe', { cwd: W, command: 'node scripts/cleanup-worktrees.mjs --self --apply' }),
    proc(4006, 4003, 'node.exe', { cwd: W, command: 'node mcp-server.js' }),
    proc(4007, 4003, 'bash.exe', { cwd: W, command: 'bash -c "npm run dev:worktree"' }),
    proc(4010, 4000, 'powershell.exe', { cwd: W, command: 'powershell.exe' }),
    proc(4011, 4010, 'node.exe', { cwd: W, command: 'node vite' }),
  ];
  const judged = judgeProcesses(table, { roots: ROOTS, self: 4005 });
  assert.equal(judged.get(4010).verdict, 'keep');
  assert.equal(judged.get(4011).verdict, 'keep');
  assert.equal(judged.get(4006).verdict, 'self', 'its own MCP server does not refuse a self cleanup');
  assert.equal(judged.get(4007).verdict, 'agent', 'what it started still goes');
  const { close, keep } = worktreeProcesses(table, W, { roots: ROOTS, self: 4005 });
  assert.deepEqual(pids(close), [4007]);
  assert.deepEqual(pids(keep), [4010, 4011]);
});

test('a reused parent pid is not followed, and the sweep never judges its own line', () => {
  const judged = judgeProcesses(machine(), { roots: ROOTS, self: SWEEP });
  assert.equal(judged.get(1800).verdict, 'orphan');
  const fromLoop = judgeProcesses(machine(), { roots: ROOTS, self: 1210 });
  assert.equal(fromLoop.get(1210).verdict, 'self');
  assert.equal(fromLoop.get(1211).verdict, 'self');
  assert.equal(fromLoop.get(1200).verdict, 'self', 'the session the sweep runs in is its own line');
  assert.equal(fromLoop.get(1230).verdict, 'agent', "the session's other commands are judged as usual");
});

test('a session\'s persistent shell stays; what runs inside it is an agent\'s', () => {
  const nodeService = { ...proc(2000, 1100, 'claude.exe', { exe: DESKTOP }), command: `"${DESKTOP}" --type=utility --utility-sub-type=node.mojom.NodeService` };
  const table = [
    ...machine(),
    nodeService,
    proc(2001, 2000, 'powershell.exe', { cwd: W, command: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe' }),
    proc(2002, 2001, 'node.exe', { cwd: W, command: 'node watch.js' }),
  ];
  const judged = judgeProcesses(table, { roots: ROOTS, self: SWEEP });
  assert.equal(judged.get(2001).verdict, 'keep');
  assert.equal(judged.get(2002).verdict, 'agent');
  assert.equal(judged.get(2002).root.pid, 2002);
});

test('the exemption list is short and written down', () => {
  assert.deepEqual(EXEMPT.map((entry) => entry.id), ['queue-runners', 'orchestration', 'worktree-sweep', 'owner-apps']);
  for (const entry of EXEMPT) assert.ok(entry.why.length > 10, `${entry.id} says why`);
  const owner = EXEMPT.find((entry) => entry.id === 'owner-apps');
  for (const name of ['chrome.exe', 'obs64.exe', 'vMix64.exe', 'CasparCG.exe', 'Companion.exe', 'Code.exe', 'WindowsTerminal.exe']) {
    assert.ok(owner.match({ name, command: name, exe: `C:\\Program Files\\x\\${name}` }), name);
  }
  assert.ok(!owner.match({ name: 'chrome.exe', exe: PW_CHROME, command: PW_CHROME }), 'a Playwright browser is not the owner\'s');
});

test('a process list that could not be read never reads as nothing running', () => {
  const failed = () => ({ ok: false, supported: true, processes: [], why: 'could not list processes: timed out' });
  const removal = closeWorktreeProcesses(W, { roots: ROOTS, list: failed, close: () => assert.fail('closed blind') });
  assert.equal(removal.ok, false);
  assert.match(removal.why, /timed out/);
  const sweep = closeAbandonedProcesses({ roots: ROOTS, list: failed, close: () => assert.fail('closed blind') });
  assert.equal(sweep.ok, false);
  assert.deepEqual(sweep.closed, []);
  const elsewhere = closeWorktreeProcesses(W, { roots: ROOTS, list: () => listProcesses({ platform: 'linux' }) });
  assert.deepEqual([elsewhere.ok, elsewhere.supported], [true, false], 'off Windows the removal goes on as before');
  const broken = listProcesses({ platform: 'win32', run: () => ({ status: 0, stdout: '[]', stderr: '' }) });
  assert.equal(broken.ok, false, 'an empty machine is a broken answer');
});

test('the removal step closes, and keeps the worktree when something is kept or a close fails', () => {
  const list = () => ({ ok: true, supported: true, processes: machine() });
  const asked = [];
  const close = (entries) => {
    asked.push(...entries.map((e) => e.pid));
    return { closed: entries, failed: [] };
  };
  const kept = closeWorktreeProcesses(W, { roots: ROOTS, self: SWEEP, list, close });
  assert.equal(kept.ok, false);
  assert.match(kept.why, /^in use by /);
  assert.deepEqual(asked, [], 'while somebody is in it, nothing of theirs is closed');
  const free = closeWorktreeProcesses(W, { roots: ROOTS, self: SWEEP, list: () => ({ ok: true, processes: machine().filter((p) => p.cwd !== W || [1210, 1230, 1600].includes(p.pid)) }), close });
  assert.equal(free.ok, true, free.why);
  assert.deepEqual(asked, [1210, 1230, 1600]);
  const failing = closeWorktreeProcesses(OTHER, {
    roots: ROOTS,
    self: SWEEP,
    list,
    close: (entries) => ({ closed: [], failed: entries.map((e) => ({ ...e, result: 'denied' })) }),
  });
  assert.equal(failing.ok, false);
  assert.match(failing.why, /could not close/);
  assert.deepEqual(closeProcesses([{ pid: 5, name: 'x' }], { platform: 'win32' }).failed.map((e) => e.pid), [5], 'no start time, no kill');
});

test('a Codex session working in a worktree keeps it from being quiet', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'noacg-codex-sessions-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const day = join(root, 'sessions', '2026', '10', '09');
  mkdirSync(day, { recursive: true });
  mkdirSync(join(root, 'projects'));
  const file = join(day, 'rollout-1.jsonl');
  // The first line carries the session's instructions, so it is long: 23 KB measured here.
  const instructions = 'x'.repeat(40_000);
  writeFileSync(file, `${JSON.stringify({ type: 'session_meta', payload: { instructions, cwd: W.replaceAll('/', '\\') } })}\n{"type":"x"}\n`);
  const now = Date.now();
  const sessions = recentCodexSessions({ root: join(root, 'sessions'), now });
  assert.deepEqual(sessions.map((s) => s.cwd), [W.replaceAll('/', '\\')]);
  const options = { now, liveness: { root: join(root, 'projects') }, gitActivity: () => now - 2 * HOUR };
  assert.equal(worktreeQuiet(W, { ...options, codexSessions: sessions }).quiet, false);
  assert.equal(worktreeQuiet(OTHER, { ...options, codexSessions: sessions }).quiet, true);

  const old = (now - 2 * HOUR) / 1000;
  utimesSync(file, old, old);
  assert.deepEqual(recentCodexSessions({ root: join(root, 'sessions'), now }), []);
  assert.equal(worktreeQuiet(W, { ...options, gitActivity: () => now - 10 * 60_000, codexSessions: [] }).quiet, false, 'a HEAD that moved holds it');

  // Every signal that cannot be read answers "not quiet".
  const quietGit = { ...options, gitActivity: () => now - 2 * HOUR, codexSessions: [] };
  assert.equal(worktreeQuiet(W, quietGit).quiet, true);
  assert.equal(worktreeQuiet(W, { ...quietGit, gitActivity: () => null }).quiet, false, 'unreadable git activity');
  assert.equal(worktreeQuiet(W, { ...quietGit, liveness: { root: join(root, 'missing') } }).quiet, false, 'no transcripts to read');
  assert.equal(worktreeQuiet(W, { ...quietGit, codexSessions: [{ cwd: null, mtimeMs: now }] }).quiet, false, 'a recent Codex log with no readable cwd');
});

test('on Windows the list carries each process\'s working directory', { skip: process.platform !== 'win32' && 'Windows only' }, () => {
  const listed = listProcesses();
  assert.equal(listed.ok, true, listed.why);
  const me = listed.processes.find((p) => p.pid === process.pid);
  assert.ok(me, 'this process is in the list');
  assert.equal(me.cwd.replace(/[\\/]+$/, '').toLowerCase(), process.cwd().replace(/[\\/]+$/, '').toLowerCase());
  assert.ok(Number.isFinite(me.createdMs));
});
