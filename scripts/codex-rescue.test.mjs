// The guard on the Codex delegation channel is these cases, not the prose in codex-rescue.mjs.
//
// Each defect the first delegation trial found (2026-08-29; all three are described in the header
// of codex-rescue.mjs, which is where the record lives now that the trial's handoff is swept) was
// invisible: a killed job that still read as running, a cancel that could not kill, a launch that
// died with its caller. None of them announce themselves, so each one is pinned here as the shape
// that has to hold - the two that matter most are the ones a regression would make silent again:
//
//   - a pid that is GONE must flip the job to a recorded outcome, and a pid that is ALIVE must
//     never be touched (pids are reused; a false "dead" is worse than a stale "running");
//   - nothing this file plans may pass through a shell, because Git Bash is $SHELL on this
//     machine and MSYS rewrites every argument that starts with a slash.
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  imageNamePlan,
  killPlan,
  parseRelayArgs,
  pickPluginVersion,
  processAlive,
  reconcileJob,
  relayArgs,
  splitOwnArgs,
} from './codex-rescue.mjs';

// ── Defect 2: a killed job must stop reading as running ──────────────────────────────────────────

const nowIso = () => '2026-08-30T00:00:00.000Z';
const gone = () => false;
const alive = () => true;

test('a running job whose pid is gone is recorded as dead', () => {
  const patch = reconcileJob({ id: 'task-1', status: 'running', phase: 'starting', pid: 39112 }, { alive: gone, nowIso });
  assert.equal(patch.status, 'failed');
  assert.equal(patch.phase, 'dead');
  assert.equal(patch.pid, null);
  assert.equal(patch.deadPid, 39112);
  assert.equal(patch.completedAt, nowIso());
  assert.match(patch.errorMessage, /39112 is gone/);
});

test('a queued job whose pid is gone is dead too - it died before it ever ran', () => {
  const patch = reconcileJob({ id: 'task-1', status: 'queued', pid: 4242 }, { alive: gone, nowIso });
  assert.equal(patch.status, 'failed');
  assert.equal(patch.deadPid, 4242);
});

test('a live pid is never touched, however long it has been running', () => {
  assert.equal(reconcileJob({ id: 'task-1', status: 'running', pid: 39112 }, { alive, nowIso }), null);
});

test('a finished job is never rewritten, even though its pid is gone by definition', () => {
  for (const status of ['completed', 'failed', 'cancelled']) {
    assert.equal(reconcileJob({ id: 'task-1', status, pid: 39112 }, { alive: gone, nowIso }), null);
  }
});

test('a job with no pid yet is left alone rather than declared dead', () => {
  for (const pid of [null, undefined, 0, -1, 'x']) {
    assert.equal(reconcileJob({ id: 'task-1', status: 'running', pid }, { alive: gone, nowIso }), null);
  }
});

test('EPERM means the process exists and is not ours to signal, so it counts as alive', () => {
  const eperm = () => { const error = new Error('nope'); error.code = 'EPERM'; throw error; };
  const esrch = () => { const error = new Error('gone'); error.code = 'ESRCH'; throw error; };
  assert.equal(processAlive(1, eperm), true);
  assert.equal(processAlive(1, esrch), false);
  assert.equal(processAlive(1, () => undefined), true);
});

// ── Defect 3: the kill must not travel through a shell ───────────────────────────────────────────

test('taskkill gets /PID as its own argument, so MSYS has no command line to rewrite', () => {
  const plan = killPlan(39112, 'win32');
  assert.deepEqual(plan.args, ['/PID', '39112', '/T', '/F']);
  assert.match(plan.command, /taskkill(\.exe)?$/i);
  // The whole defect was `/PID` becoming a path. It must never be concatenated into one string.
  assert.ok(!plan.args.some((arg) => arg.includes(' ')));
});

test('tasklist gets its filter as one argument, for the same reason', () => {
  assert.deepEqual(imageNamePlan(39112, 'win32').args, ['/FI', 'PID eq 39112', '/FO', 'CSV', '/NH']);
  assert.equal(imageNamePlan(39112, 'linux'), null);
});

test('posix kills the process group instead', () => {
  assert.deepEqual(killPlan(4242, 'linux'), { command: 'kill', args: ['-TERM', '-4242'] });
});

// ── Defect 1: the launch must outlive the caller ─────────────────────────────────────────────────

test('the relay carries the launcher argv through argv, never through a command line', () => {
  const argv = relayArgs({
    self: 'C:\\repo\\scripts\\codex-rescue.mjs',
    script: 'C:\\p\\codex-companion.mjs',
    outFile: 'C:\\tmp\\out.json',
    scriptArgs: ['task', '--background', '--prompt-file', 'C:\\tmp\\a b\\prompt.txt'],
  });
  assert.deepEqual(argv.slice(0, 6), [
    'C:\\repo\\scripts\\codex-rescue.mjs', 'relay',
    '--relay-out', 'C:\\tmp\\out.json',
    '--relay-script', 'C:\\p\\codex-companion.mjs',
  ]);
  // A path with a space survives because nothing ever joins these into a string.
  assert.deepEqual(argv.slice(6), ['--', 'task', '--background', '--prompt-file', 'C:\\tmp\\a b\\prompt.txt']);
});

test('the relay reads back exactly what it was given, with -- separating the two halves', () => {
  const parsed = parseRelayArgs(relayArgs({
    self: 'self.mjs', script: 'companion.mjs', outFile: 'out.json',
    scriptArgs: ['task', '--relay-out', 'a-value-that-looks-like-our-own-flag'],
  }).slice(1));
  assert.equal(parsed.outFile, 'out.json');
  assert.equal(parsed.script, 'companion.mjs');
  // The forwarded half is taken verbatim after `--`, so a task argument can never be read as ours.
  assert.deepEqual(parsed.scriptArgs, ['task', '--relay-out', 'a-value-that-looks-like-our-own-flag']);
});

test('a relay argv with no forwarded half forwards nothing rather than guessing', () => {
  assert.deepEqual(parseRelayArgs(['relay', '--relay-out', 'o']), {
    outFile: 'o', script: null, scriptArgs: [],
  });
});

test('a forwarded --cwd stays forwarded - only the one before `--` is ours', () => {
  const forwarded = ['--', 'task', '--background', '--cwd', 'C:\\repo', '--prompt-file', 'p.txt'];
  // Ours is absent: the whole forwarded half must survive untouched, including its own --cwd.
  assert.deepEqual(splitOwnArgs(['--relay-out', 'o', ...forwarded], 'C:\\fallback'), {
    cwd: 'C:\\fallback',
    argv: ['--relay-out', 'o', ...forwarded],
  });
  // Ours is present: it is consumed, and the forwarded half is still untouched.
  assert.deepEqual(splitOwnArgs(['--cwd', 'C:\\mine', '--relay-out', 'o', ...forwarded], 'C:\\fallback'), {
    cwd: 'C:\\mine',
    argv: ['--relay-out', 'o', ...forwarded],
  });
});

// ── Picking the plugin: an upgrade must be followed without editing anything ─────────────────────

test('the highest semver plugin version wins, and numbers compare as numbers', () => {
  assert.equal(pickPluginVersion(['1.0.6', '1.0.10', '0.9.9']), '1.0.10');
  assert.equal(pickPluginVersion(['2.0.0', '10.0.0']), '10.0.0');
  assert.equal(pickPluginVersion(['1.0.6', 'node_modules', '.DS_Store']), '1.0.6');
  assert.equal(pickPluginVersion(['not-a-version']), null);
  assert.equal(pickPluginVersion([]), null);
});

// ── The reasoning-effort floor: a launch that names no effort carries the norm ───────────────────

test('a launch with no --effort is given the default effort explicitly', async () => {
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags, text } = launchPlan(['--write', 'fix', 'the', 'thing']);
  assert.deepEqual(flags, ['--write', '--effort', DEFAULT_EFFORT]);
  assert.equal(text, 'fix the thing');
});

test('an explicit --effort always wins over the default, even a lower one', async () => {
  const { launchPlan } = await import('./codex-rescue.mjs');
  const { flags } = launchPlan(['--effort', 'low', 'list', 'the', 'sites']);
  assert.deepEqual(flags, ['--effort', 'low']);
});

test('the default effort is the owner-ruled setting, not the machine config', async () => {
  const { DEFAULT_EFFORT, DEFAULT_EFFORT_REVIEW_ON } = await import('./codex-rescue.mjs');
  // medium until 2026-09-16 by the 2026-09-09 ruling; high is the standing norm it returns to.
  assert.equal(DEFAULT_EFFORT, 'medium');
  // low is never the default, whatever the machine config drifted to - that is the one thing this
  // constant exists to stop, and it is the shape the defect actually took on 2026-08-30.
  assert.notEqual(DEFAULT_EFFORT, 'low');

  // A trial without an expiry is just a new default. The date is asserted so that a session
  // reading this after it passes is TOLD to go and settle it from the delegation ledger rather
  // than inheriting a week-long experiment as policy.
  assert.match(DEFAULT_EFFORT_REVIEW_ON, /^\d{4}-\d{2}-\d{2}$/);
  const due = Date.parse(`${DEFAULT_EFFORT_REVIEW_ON}T00:00:00Z`);
  assert.ok(
    Date.now() < due || DEFAULT_EFFORT === 'high',
    `the ${DEFAULT_EFFORT} default was a trial due for review on ${DEFAULT_EFFORT_REVIEW_ON}: `
      + 'read npm run harness:usage for what the week measured, then either extend it with that '
      + 'evidence and move the date, or set DEFAULT_EFFORT back to high',
  );
});

test('--resume still maps to --resume-last and --model is still forwarded beside the default', async () => {
  // Reads DEFAULT_EFFORT rather than restating it: this case is about the FLAGS being forwarded,
  // and spelling the value here made it fail for an unrelated reason the day the default moved.
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags } = launchPlan(['--resume', '--model', 'gpt-5.6-sol']);
  assert.deepEqual(flags, ['--resume-last', '--model', 'gpt-5.6-sol', '--effort', DEFAULT_EFFORT]);
});

test('the = spelling of a valued flag is a flag, never prompt text', async () => {
  const { launchPlan, DEFAULT_EFFORT } = await import('./codex-rescue.mjs');
  const { flags, text } = launchPlan(['--effort=low', 'list', 'the', 'exports']);
  assert.deepEqual(flags, ['--effort', 'low']);
  assert.equal(text, 'list the exports');
  const model = launchPlan(['--model=gpt-5.6-sol', 'x']);
  assert.deepEqual(model.flags, ['--model', 'gpt-5.6-sol', '--effort', DEFAULT_EFFORT]);
});

test('a valued flag with no value is refused, not spawned as undefined', async () => {
  const { launchPlan } = await import('./codex-rescue.mjs');
  assert.throws(() => launchPlan(['do', 'the', 'thing', '--effort']), /--effort needs a value/);
  assert.throws(() => launchPlan(['--model=', 'x']), /--model needs a value/);
});

// ── Defect 4: the family a delegation leaves behind ──────────────────────────────────────────────
//
// The kill decision itself is pinned in e2e-runs.test.mjs, beside the detector. What is pinned
// here is the RECORD that decision reads: it may only ever shrink, it may never carry a pid
// forward once the machine has stopped agreeing that pid is the same process, and a version this
// code does not know must make the whole record unusable rather than half-usable.

const brokerLine =
  '"C:\\Program Files\\nodejs\\node.exe" C:\\Users\\me\\.claude\\plugins\\cache\\openai-codex\\codex\\1.0.6'
  + '\\scripts\\app-server-broker.mjs serve --endpoint pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server'
  + ' --cwd C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5'
  + ' --pid-file C:\\Users\\me\\AppData\\Local\\Temp\\cxc-qFSQuA\\broker.pid';

test('the broker is recognised by its own command line, and the desktop app is not', async () => {
  const { BROKER_COMMAND } = await import('./codex-rescue.mjs');
  assert.ok(BROKER_COMMAND.test(brokerLine));
  assert.equal(
    BROKER_COMMAND.test('C:\\Users\\me\\AppData\\Local\\OpenAI\\Codex\\bin\\8e5b69\\codex.exe app-server'),
    false,
  );
});

test('the workspace comes out of the broker\'s command line, spaces and all', async () => {
  const { workspaceOfBroker } = await import('./codex-rescue.mjs');
  assert.equal(
    workspaceOfBroker(brokerLine),
    'C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5',
  );
  // The plugin does not quote this argument, so a checkout with a space in it is only readable
  // because the flag AFTER it bounds the match - the trap rootOfCommand documents next door.
  assert.equal(
    workspaceOfBroker('node broker.mjs serve --cwd C:/My Work/repo --pid-file C:/t/broker.pid'),
    'C:/My Work/repo',
  );
  assert.equal(workspaceOfBroker('node broker.mjs serve'), null);
});

test('the ownership record only ever shrinks', async () => {
  const { mergeOwned } = await import('./codex-rescue.mjs');
  const live = new Map([
    [10, { pid: 10, createdMs: 1000, name: 'node.exe', command: 'the broker' }],
    [20, { pid: 20, createdMs: 9999, name: 'node.exe', command: 'a stranger' }],
  ]);
  const previous = [
    { pid: 10, createdMs: 1000, what: 'the broker' },           // still itself
    { pid: 20, createdMs: 2000, what: 'the codex app-server' }, // pid reused: dropped
    { pid: 30, createdMs: 3000, what: 'an MCP server' },        // exited: dropped
  ];
  const observed = [{ pid: 10, createdMs: 1000, what: 'the broker' }];
  assert.deepEqual(mergeOwned(previous, observed, live), [{ pid: 10, createdMs: 1000, what: 'the broker' }]);
});

test('a newly seen process joins the record, oldest first', async () => {
  const { mergeOwned } = await import('./codex-rescue.mjs');
  const live = new Map([
    [10, { pid: 10, createdMs: 1000, name: 'node.exe', command: 'x' }],
    [11, { pid: 11, createdMs: 1400, name: 'node.exe', command: 'x' }],
  ]);
  const merged = mergeOwned(
    [{ pid: 11, createdMs: 1400, what: 'an MCP server' }],
    [{ pid: 10, createdMs: 1000, what: 'the broker' }],
    live,
  );
  assert.deepEqual(merged.map((entry) => entry.pid), [10, 11]);
});

test('an entry with no start time is not an identity, so it is dropped', async () => {
  const { mergeOwned } = await import('./codex-rescue.mjs');
  const live = new Map([[10, { pid: 10, createdMs: null, name: 'node.exe', command: 'x' }]]);
  assert.deepEqual(mergeOwned([{ pid: 10, createdMs: null, what: '?' }], [], live), []);
});

test('the snapshot schedule brackets the seconds a family is built in, then beats slowly', async () => {
  const { snapshotDue, SNAPSHOT_AT_MS, SNAPSHOT_TAIL_MS } = await import('./codex-rescue.mjs');
  assert.equal(snapshotDue(0, 0), true, 'the first look is immediate');
  assert.equal(snapshotDue(500, 1), false, 'the second is not due yet');
  assert.equal(snapshotDue(1_200, 1), true);
  // Past the backoff the record still has to keep up - a second delegation joins the same family
  // minutes later - but a minute apart, not on every poll.
  const past = SNAPSHOT_AT_MS.length;
  assert.equal(snapshotDue(10 * 60_000, past, 10_000), false, 'ten seconds after the last look is too soon');
  assert.equal(snapshotDue(10 * 60_000, past, SNAPSHOT_TAIL_MS), true);
});

test('an ownership record this code cannot read is not a proof of anything', async () => {
  const { readOwnership } = await import('./codex-rescue.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'codex-owned-'));
  const file = join(dir, 'owned-tree.json');
  writeFileSync(file, JSON.stringify({ version: 1, owned: [{ pid: 1, createdMs: 2 }] }), 'utf8');
  assert.equal(readOwnership(dir).owned.length, 1);
  // A version from the future degrades to read-only, and read-only here means "not a candidate".
  writeFileSync(file, JSON.stringify({ version: 2, owned: [{ pid: 1, createdMs: 2 }] }), 'utf8');
  assert.equal(readOwnership(dir), null);
  writeFileSync(file, '{ half a file', 'utf8');
  assert.equal(readOwnership(dir), null);
});

test('the record keeps growing from what is left of the family when the broker has gone', async () => {
  // THE BROKER IS THE FIRST THING RECORDED AND USUALLY THE FIRST TO EXIT - a graceful shutdown
  // closes it by name. If the record could only grow from the broker, the app-server and its MCP
  // servers, which are the expensive half, would stop being recorded the moment it left, and a
  // sweep would then read a record of one dead pid, forget it, and leave 450 MB nothing can ever
  // claim again.
  const { recordOwnership } = await import('./codex-rescue.mjs');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'codex-grow-'));
  writeFileSync(join(dir, 'owned-tree.json'), JSON.stringify({
    version: 1,
    jobs: ['task-one'],
    launcher: null,
    owned: [{ pid: 5320, createdMs: 300, what: 'the codex app-server' }],
  }), 'utf8');

  // No broker.json at all: the broker is gone, and what it started is not.
  const table = [
    { pid: 5320, ppid: 1, name: 'node.exe', command: '"node" C:/npm/@openai/codex/bin/codex.js app-server', createdMs: 300 },
    { pid: 31132, ppid: 5320, name: 'codex.exe', command: 'C:/npm/codex.exe app-server', createdMs: 600 },
    { pid: 26952, ppid: 31132, name: 'node.exe', command: '"node" ./mcp/server.mjs', createdMs: 2_000 },
  ];
  const record = recordOwnership(dir, { table, now: () => 'T' });
  assert.deepEqual(record.owned.map((entry) => entry.pid), [5320, 31132, 26952]);
  assert.equal(record.launcher, null, 'an abandoned launch stays abandoned when the record is rewritten');
  assert.equal(record.broker, null);
});

test('with no broker and nothing recorded there is nothing to write down', async () => {
  const { recordOwnership } = await import('./codex-rescue.mjs');
  const { mkdtempSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'codex-empty-'));
  assert.equal(recordOwnership(dir, { table: [{ pid: 1, ppid: 0, name: 'x.exe', command: 'x', createdMs: 1 }] }), null);
  assert.equal(recordOwnership(dir, { table: [] }), null, 'and a table that could not be read records nothing');
});

test('a record is finished with when the machine stops recognising any of it', async () => {
  // MEASURED, 22 SECONDS AFTER A CANCELLED DELEGATION: one recorded MCP server's pid had already
  // been handed to `svchost.exe`. By liveness that record looks half-alive for as long as the
  // service runs, and every sweep re-reads it; by identity it is over, which it is.
  const { forgetOwnership, readOwnership } = await import('./codex-rescue.mjs');
  const { existsSync, mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const dir = mkdtempSync(join(tmpdir(), 'codex-forget-'));
  const write = () => writeFileSync(
    join(dir, 'owned-tree.json'),
    JSON.stringify({ version: 1, owned: [{ pid: 32196, createdMs: 1788985273109, what: 'an MCP server' }] }),
    'utf8',
  );

  write();
  const recycled = [{ pid: 32196, ppid: 4, name: 'svchost.exe', command: 'svchost.exe -k netsvcs', createdMs: 1788985295221 }];
  assert.equal(forgetOwnership(dir, recycled), true);
  assert.equal(existsSync(join(dir, 'owned-tree.json')), false);

  write();
  const ours = [{ pid: 32196, ppid: 4, name: 'node.exe', command: 'x', createdMs: 1788985273109 }];
  assert.equal(forgetOwnership(dir, ours), false, 'still running: the record is still needed');
  // A process table that could not be read is not evidence that anything ended.
  assert.equal(forgetOwnership(dir, []), false);
  assert.ok(readOwnership(dir));
});

// ── The delegations no record claims ─────────────────────────────────────────────────────────────
//
// A launch made from a checkout older than `recordOwnership` writes no record, so every later
// sweep sees no candidate and the family runs until the machine is restarted - measured
// 2026-09-10, two families and 537 MB, hours after the reaper itself had landed. `adoptableBrokers`
// is the answer and it is a DIFFERENT KIND of answer: it may only ever produce an ask, never a
// kill, because the thing that licenses a kill is exactly what is missing here.

/** The broker's own pid entry, as the process table has it. */
const brokerProcess = { pid: 30668, ppid: 30404, name: 'node.exe', command: brokerLine, createdMs: 1788985322424 };

/** The owner's desktop Codex app: no broker, no job store, and never a candidate. */
const desktopApp = [
  { pid: 25708, ppid: 6120, name: 'ChatGPT.exe', command: '"C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.901.6511.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"', createdMs: 1788900000000 },
  { pid: 20136, ppid: 25708, name: 'codex.exe', command: 'C:\\Users\\me\\AppData\\Local\\OpenAI\\Codex\\bin\\8e5b6932251c2c1c\\codex.exe -c features.code_mode_host=true app-server', createdMs: 1788900001000 },
];

const TABLE = [brokerProcess, ...desktopApp];

/** One workspace's `broker.json` plus the finished-state of its jobs, the way disk hands it over. */
function session(overrides = {}) {
  return {
    stateDir: 'C:/Users/me/.claude/plugins/data/codex-openai-codex/state/agent-a9ad-06a7',
    endpoint: 'pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server',
    brokerPid: 30668,
    jobs: [true],
    ...overrides,
  };
}

test('a finished delegation with no record is adopted by its broker, not by a pattern', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  const [found] = adoptableBrokers(TABLE, [session()]);
  assert.equal(found.pid, 30668);
  assert.equal(found.endpoint, 'pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server');
  // The workspace comes from the BROKER's command line: the state directory's name is a hash and
  // cannot be turned back into a path, so a scoped reap would silently skip a guessed one.
  assert.equal(found.workspace, 'C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5');
});

test('an adopted broker carries no kill list, and there is nowhere to put one', async () => {
  // THE SAFETY ARGUMENT IS STRUCTURAL, not a rule somebody has to keep. Without a record there is
  // no proof of which process belongs to this delegation, so the only thing this may return is an
  // address to ask - and a shape with no `kill` in it cannot grow one by accident.
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  const [found] = adoptableBrokers(TABLE, [session()]);
  assert.deepEqual(Object.keys(found).sort(), ['endpoint', 'pid', 'stateDir', 'workspace']);
});

test('one unfinished delegation keeps its broker, which is about to be needed', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  // One broker serves every delegation in a workspace, so a single job still running holds it.
  assert.deepEqual(adoptableBrokers(TABLE, [session({ jobs: [true, false] })]), []);
});

test('a workspace with no delegation yet is mid-launch, and its broker is left alone', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  // The broker is started when the job begins, so the seconds between the two look exactly like a
  // finished workspace - except that no job has ever finished there, which is what says so.
  assert.deepEqual(adoptableBrokers(TABLE, [session({ jobs: [] })]), []);
});

test('a broker.json whose pid now belongs to something else addresses nothing', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  // `broker.json` outlives the process it names by days - sixteen of them were on this machine -
  // so the pid has to still be running the broker, not merely still be a pid.
  const recycled = [{ pid: 30668, ppid: 4, name: 'svchost.exe', command: 'svchost.exe -k netsvcs', createdMs: 1788999999999 }];
  assert.deepEqual(adoptableBrokers(recycled, [session()]), []);
  assert.deepEqual(adoptableBrokers([], [session()]), [], 'a table that could not be read proves nothing');
});

test('a session with no endpoint is not adoptable, because there is nothing to ask', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  assert.deepEqual(adoptableBrokers(TABLE, [session({ endpoint: null })]), []);
  assert.deepEqual(adoptableBrokers(TABLE, []), []);
});

test('the desktop Codex app is refused here too, record or no record', async () => {
  const { adoptableBrokers } = await import('./codex-rescue.mjs');
  // It cannot reach this point - the app runs no broker and keeps no job store - but the promise
  // in defect 4 is absolute rather than true-for-now, so the check is made anyway.
  const underApp = [{ ...brokerProcess, pid: 31000, ppid: 20136 }, ...desktopApp];
  assert.deepEqual(adoptableBrokers(underApp, [session({ brokerPid: 31000 })]), []);
});

test('a scoped reap will not take a flag for a path', async () => {
  // `reap --workspace --all-workspaces` would otherwise scope the sweep to a directory named
  // `--all-workspaces`, match nothing, and report a quiet complete-looking nothing - which the
  // worktree removal that asked would read as "no delegation is running here".
  const { reapWorkspace } = await import('./codex-rescue.mjs');
  assert.equal(reapWorkspace(['--workspace', 'C:/claude/x']), 'C:/claude/x');
  assert.equal(reapWorkspace([]), null);
  assert.throws(() => reapWorkspace(['--workspace']), /needs a path/);
  assert.throws(() => reapWorkspace(['--workspace', '--all-workspaces']), /needs a path/);
  assert.throws(
    () => reapWorkspace(['--workspace', 'C:/claude/x', '--all-workspaces']),
    /contradict each other/,
  );
});

test('an endpoint is a socket path once its scheme is off', async () => {
  const { endpointPath } = await import('./codex-rescue.mjs');
  assert.equal(
    endpointPath('pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server'),
    '\\\\.\\pipe\\cxc-qFSQuA-codex-app-server',
  );
  assert.equal(endpointPath('unix:/tmp/cxc/sock'), '/tmp/cxc/sock');
  assert.equal(endpointPath(null), null);
});

test('a recorded process is described by what it is, for the report a person reads', async () => {
  const { labelProcess } = await import('./codex-rescue.mjs');
  assert.equal(labelProcess(brokerLine, 'node.exe'), 'the broker');
  assert.equal(
    labelProcess('"node" C:/npm/node_modules/@openai/codex/bin/codex.js app-server', 'node.exe'),
    'the codex app-server',
  );
  assert.equal(labelProcess('"node" ./mcp/server.mjs', 'node.exe'), 'an MCP server');
  // The shell in between wears the same words as the binary it is about to start, so the process
  // NAME settles which of the two this is.
  assert.equal(
    labelProcess('C:\\Program Files\\Git\\usr\\bin\\sh.exe /c/Users/me/AppData/Roaming/npm/codex app-server', 'sh.exe'),
    'the shell that starts codex',
  );
  assert.equal(labelProcess('C:\\npm\\...\\bin\\codex.exe app-server', 'codex.exe'), 'codex.exe');
  assert.equal(labelProcess('something unfamiliar', 'node.exe'), 'node.exe');
});
