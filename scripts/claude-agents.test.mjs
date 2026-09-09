// The third liveness signal's arithmetic, pinned. Nothing here spawns the real command: what is
// worth testing is how the answer is READ, and what happens on every machine where it does not
// come back at all.

import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  agentsCapability,
  buildIndex,
  claudeCandidates,
  describeLiveness,
  isUnder,
  livenessFor,
  normalisePath,
  parseAgents,
  readInventory,
  resolveClaude,
  sessionIdFromTranscript,
} from './claude-agents.mjs';

const rows = [
  { pid: 1, cwd: 'C:\\repo\\worktrees\\a', kind: 'interactive', sessionId: 'aaa', name: 'a-1' },
  { pid: 2, cwd: 'C:\\repo\\worktrees\\b', kind: 'background', sessionId: 'bbb', status: 'waiting', waitingFor: 'a permission prompt' },
];
const index = buildIndex(rows);

test('a JSON array is read, and anything else is "the command did not answer"', () => {
  assert.deepEqual(parseAgents('[]'), []);
  assert.equal(parseAgents('[]').length, 0);
  assert.equal(parseAgents(JSON.stringify(rows)).length, 2);

  // A launcher printing a warning before or after the payload must not lose the payload.
  assert.equal(parseAgents(`warning: something\n${JSON.stringify(rows)}\n`).length, 2);

  // An empty array and an unreadable one mean opposite things, so only one of them parses.
  for (const bad of ['', '   ', 'not json', '{"rows":[]}', '[', 'null']) {
    assert.equal(parseAgents(bad), null, `${JSON.stringify(bad)} is not an inventory`);
  }
});

test('capability is read off the rows, never assumed from a version', () => {
  assert.deepEqual(agentsCapability(rows), { rows: 2, status: true, waitingFor: true });
  assert.deepEqual(agentsCapability([rows[0]]), { rows: 1, status: false, waitingFor: false });
  assert.deepEqual(agentsCapability(null), { rows: 0, status: false, waitingFor: false });
});

test('a transcript path resolves to the session that owns the PROCESS', () => {
  assert.equal(sessionIdFromTranscript('/home/.claude/projects/C--repo/aaa.jsonl'), 'aaa');
  // A subagent has no process of its own, so it resolves to its parent - which is the thing that
  // can be alive or not.
  assert.equal(sessionIdFromTranscript('/home/.claude/projects/C--repo/aaa/subagents/worker.jsonl'), 'aaa');
  assert.equal(sessionIdFromTranscript('C:\\x\\.claude\\projects\\p\\aaa\\subagents\\w.jsonl'), 'aaa');
  assert.equal(sessionIdFromTranscript('not-a-transcript'), null);
  assert.equal(sessionIdFromTranscript(''), null);
  assert.equal(sessionIdFromTranscript(null), null);
});

test('a session id matches, and so does a working directory or one inside it', () => {
  assert.equal(livenessFor({ sessionId: 'aaa' }, index).verdict, 'live');
  assert.equal(livenessFor({ cwd: 'C:/repo/worktrees/a' }, index).verdict, 'live');
  assert.equal(livenessFor({ cwd: 'C:\\repo\\worktrees\\a\\' }, index).verdict, 'live');
  assert.equal(livenessFor({ sessionId: 'zzz', cwd: 'C:/repo/worktrees/z' }, index).verdict, 'absent');
});

test('a session inside a directory holds it; a merely similar name does not', () => {
  // The direction that matters to the cleanup guard: a session that changed into `src/` still
  // holds the worktree above it, so the worktree is never read as nobody's.
  const deep = buildIndex([{ pid: 3, cwd: 'C:/repo/wt/a/src/components', sessionId: 'ccc' }]);
  assert.equal(livenessFor({ cwd: 'C:/repo/wt/a' }, deep).verdict, 'live');
  // A string prefix is not a parent directory, and this is the pair that proves the separator
  // is being required rather than assumed.
  assert.equal(livenessFor({ cwd: 'C:/repo/wt/ab' }, deep).verdict, 'absent');
});

test('an unavailable or empty inventory is UNKNOWN, never "nothing is running"', () => {
  // The distinction that decides whether a report is allowed to say a session is gone.
  assert.equal(livenessFor({ sessionId: 'aaa' }, index, { available: false }).verdict, 'unknown');
  assert.equal(livenessFor({ sessionId: 'aaa' }, buildIndex([])).verdict, 'unknown');
  assert.equal(livenessFor({ sessionId: 'aaa' }, null).verdict, 'unknown');
});

test('the printed clause never claims a session died', () => {
  const live = describeLiveness(livenessFor({ sessionId: 'bbb' }, index));
  assert.match(live, /pid 2/);
  assert.match(live, /waiting: a permission prompt/, 'a status and its reason are both worth printing');
  assert.match(describeLiveness(livenessFor({ sessionId: 'aaa' }, index)), /^its process is running \(pid 1\)$/);

  for (const clause of [
    describeLiveness(livenessFor({ sessionId: 'zzz' }, index)),
    describeLiveness(livenessFor({ sessionId: 'zzz' }, index, { available: false })),
  ]) {
    assert.doesNotMatch(clause, /died|crashed|dead/i);
  }
});

test('paths are compared one way, whatever the platform spelled them', () => {
  assert.equal(normalisePath('C:\\Repo\\A\\'), normalisePath('c:/repo/a'));
  assert.equal(normalisePath(''), null);
  assert.equal(normalisePath(null), null);
});

test('a directory belongs to a repo whatever the platform spelled it, and a sibling does not', () => {
  const root = 'C:/claude/NoaCG-Studio';
  assert.equal(isUnder('c:\\claude\\noacg-studio\\.claude\\worktrees\\x', root), true);
  assert.equal(isUnder('C:/claude/NoaCG-Studio/', root), true);
  // The boundary is a `/`, so the sibling checkout that shares a prefix is a different repo.
  assert.equal(isUnder('C:/claude/NoaCG-Studio-old/scripts', root), false);
  assert.equal(isUnder('C:/claude/other', root), false);
  // Nothing in, nothing out: a row with no cwd is never counted as this repo's.
  assert.equal(isUnder('', root), false);
  assert.equal(isUnder(null, root), false);
  assert.equal(isUnder('C:/claude/NoaCG-Studio', null), false);
});

test('a real executable anywhere on PATH beats a launcher anywhere on it', () => {
  const env = { PATH: ['C:\\npm', 'C:\\native'].join(';') };
  const candidates = claudeCandidates({ env, platform: 'win32' });
  const shellFree = candidates.filter((entry) => !entry.shell).map((entry) => entry.command);
  assert.deepEqual(shellFree, ['C:\\npm\\claude.exe', 'C:\\native\\claude.exe']);
  // Node refuses to spawn a .cmd without a shell, so those candidates carry the flag that says so.
  assert.ok(candidates.some((entry) => entry.command.endsWith('claude.cmd') && entry.shell === true));

  // The joiner follows the platform ARGUMENT, so this is the same answer under a Linux runner.
  const posix = claudeCandidates({ env: { PATH: '/usr/bin:/opt/bin' }, platform: 'linux' });
  assert.deepEqual(posix.map((entry) => entry.command), [path.posix.join('/usr/bin', 'claude'), path.posix.join('/opt/bin', 'claude')]);

  assert.deepEqual(claudeCandidates({ env: { CLAUDE_BIN: '/x/claude' } }), [{ command: '/x/claude', shell: false }]);
});

test('every way the command can fail answers "unavailable", never an empty inventory', () => {
  const resolve = () => ({ command: 'claude', shell: false });
  const cases = [
    [{ status: 1, stderr: 'unknown command\n' }, /inventory command failed: unknown command/],
    [{ status: 0, stdout: 'not json' }, /did not answer with a JSON array/],
    [{ signal: 'SIGTERM', status: null }, /did not finish within/],
    [{ error: new Error('ENOENT') }, /could not run the inventory: ENOENT/],
  ];
  for (const [result, expected] of cases) {
    const read = readInventory({ resolve, run: () => result });
    assert.equal(read.available, false);
    assert.deepEqual(read.rows, []);
    assert.match(read.why, expected);
  }

  const thrown = readInventory({ resolve, run: () => { throw new Error('spawn blew up'); } });
  assert.equal(thrown.available, false);
  assert.match(thrown.why, /spawn blew up/);

  // No executable at all is the ordinary case on a machine without Claude Code, and it is a
  // reason rather than a crash.
  const missing = readInventory({ resolve: () => null });
  assert.equal(missing.available, false);
  assert.match(missing.why, /no Claude Code executable on PATH/);

  // And the success path returns the rows untouched.
  const ok = readInventory({ resolve, run: () => ({ status: 0, stdout: JSON.stringify(rows) }) });
  assert.equal(ok.available, true);
  assert.equal(ok.rows.length, 2);
  assert.equal(ok.capability.status, true);
});

test('resolveClaude takes the first candidate that exists', () => {
  const env = { PATH: 'C:\\npm;C:\\native' };
  const found = resolveClaude({ env, platform: 'win32', exists: (p) => p === 'C:\\native\\claude.exe' });
  assert.deepEqual(found, { command: 'C:\\native\\claude.exe', shell: false });
  assert.equal(resolveClaude({ env, platform: 'win32', exists: () => false }), null);
});
