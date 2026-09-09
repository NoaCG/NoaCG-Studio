// Which CHECKOUT a running Playwright process belongs to. This is the load-bearing part of the
// cross-worktree guard: `activeRuns({ exclude: me })` uses it to decide whether a run is someone
// else's, so getting it wrong fails in both directions - attribute my own run elsewhere and the
// queue waits for me to finish before letting me start, attribute someone else's to me and the
// collision the guard exists to prevent goes through unnoticed.
//
// Every "real" case below is a command line copied verbatim from `Get-CimInstance Win32_Process`
// on this machine while suites were actually running.
//
// The cases are split by platform, because the root is normalised with `path.resolve` and that
// is platform-specific by design: on Linux a Windows path is not absolute, so resolve() prepends
// the cwd and `C:\claude\NoaCG-Studio` comes back as `<cwd>/C:/claude/NoaCG-Studio`. That is
// correct - and irrelevant, because rootOfCommand only ever sees command lines produced by the
// platform it is running on. Asserting a Windows shape on ubuntu tests nothing real and fails.
// The ARGUMENT-SPLITTING cases, which are the actual logic, are platform-neutral and always run.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ancestorsOf,
  blockingRuns,
  descendantsOf,
  orphanedCodexTrees,
  orphanedDevServers,
  rootOfCommand,
  sameRoot,
  selfAndAncestors,
  underDesktopCodex,
  withinRoot,
} from './e2e-runs.mjs';

const onlyWindows = { skip: process.platform !== 'win32' };
const onlyPosix = { skip: process.platform === 'win32' };

test('the main checkout, launched through the .bin shim', onlyWindows, () => {
  const cmd = '"node"   "C:\\claude\\NoaCG-Studio\\node_modules\\.bin\\\\..\\@playwright\\test\\cli.js" test advanced-mode.spec.ts';
  assert.equal(rootOfCommand(cmd), 'C:/claude/NoaCG-Studio');
});

test('a linked worktree, launched with an absolute node path', onlyWindows, () => {
  const cmd =
    '"C:\\Program Files\\nodejs\\node.exe" C:\\claude\\NoaCG-Studio\\.claude\\worktrees\\creative-vocabulary-test-ff7b6d\\node_modules\\playwright\\lib\\worker\\workerProcessEntry.js';
  assert.equal(
    rootOfCommand(cmd),
    'C:/claude/NoaCG-Studio/.claude/worktrees/creative-vocabulary-test-ff7b6d',
  );
});

test('the node interpreter\'s own path is never mistaken for the checkout', onlyWindows, () => {
  // "C:\Program Files\nodejs\node.exe" comes FIRST and contains no node_modules, so the scan
  // has to walk past it rather than anchor on the first drive letter it sees.
  const cmd = '"C:\\Program Files\\nodejs\\node.exe" C:\\repo\\node_modules\\@playwright\\test\\cli.js test';
  assert.equal(rootOfCommand(cmd), 'C:/repo');
});

test('a checkout path containing spaces survives, because it is quoted', onlyWindows, () => {
  const cmd = '"node" "C:\\Users\\First Last\\My Repo\\node_modules\\@playwright\\test\\cli.js" test';
  assert.equal(rootOfCommand(cmd), 'C:/Users/First Last/My Repo');
});

test('a posix invocation resolves too', onlyPosix, () => {
  assert.equal(
    rootOfCommand('/usr/bin/node /home/dev/proj/node_modules/@playwright/test/cli.js test'),
    '/home/dev/proj',
  );
});

// ── Platform-neutral: the argument splitting itself, which is the actual logic ──────────────
// Asserted on the SHAPE of the answer rather than on an absolute path, so the same assertions
// hold wherever they run. This is the regression the rewrite exists for, so it must not be a
// case that silently skips on the platform CI happens to use.

test('a path is never glued across two separate arguments', () => {
  // The bug this replaced: a regex allowed to cross whitespace produced
  // ".../sleeper.mjs 60000 C:/claude/NoaCG-Studio" - two unrelated arguments as one path.
  const root = rootOfCommand(
    'node /tmp/sleeper.mjs 60000 /srv/checkout/node_modules/@playwright/test/cli.js test',
  );
  assert.ok(root, 'a root should be found');
  assert.ok(root.endsWith('/srv/checkout'), `expected the checkout argument, got ${root}`);
  assert.ok(!root.includes('sleeper'), `a preceding argument leaked into the path: ${root}`);
  assert.ok(!root.includes('60000'), `a preceding argument leaked into the path: ${root}`);
});

test('the argument before the checkout never contributes, even when it looks like a path', () => {
  const root = rootOfCommand('/usr/bin/node /opt/tools/runner.mjs /srv/checkout/node_modules/x/cli.js test');
  assert.ok(root.endsWith('/srv/checkout'), `got ${root}`);
  assert.ok(!root.includes('runner.mjs'), `got ${root}`);
});

test('a command with no node_modules has no root, rather than a wrong one', () => {
  // Returning null means the process is IGNORED. That is the safe direction for a non-run;
  // inventing a root would put a phantom checkout in the guard's refusal message.
  assert.equal(rootOfCommand('node scripts/dev-port.mjs'), null);
  assert.equal(rootOfCommand(''), null);
  // node_modules with nothing before it is not a checkout either.
  assert.equal(rootOfCommand('node node_modules/@playwright/test/cli.js test'), null);
});

// ── Identifying your OWN run when the root cannot ───────────────────────────────────────────
// A linked worktree has no node_modules, so `npx playwright` there runs the MAIN checkout's CLI
// and rootOfCommand attributes the run to the main checkout. `exclude: <worktree>` then never
// matches its own run, and the queue in e2e/_offline-guard.ts waits out its whole 30-minute cap
// behind the very process doing the waiting. Ancestry is what survives that.

test('a worktree run really does resolve to the MAIN checkout (the reason ancestry exists)', () => {
  const cmd = '"node" "/repo/node_modules/.bin/../@playwright/test/cli.js" test some.spec.ts';
  const root = rootOfCommand(cmd);
  assert.ok(root.endsWith('/repo'), `got ${root}`);
  assert.ok(!sameRoot(root, '/repo/.claude/worktrees/feature-x'), 'the worktree is not its own root here');
});

test('selfAndAncestors walks the parent chain', () => {
  const procs = [
    { pid: 40, ppid: 30, command: 'node cli.js test' },
    { pid: 30, ppid: 20, command: 'node npx-cli.js' },
    { pid: 20, ppid: 1, command: 'node shell' },
    { pid: 99, ppid: 1, command: 'node unrelated' },
  ];
  assert.deepEqual([...selfAndAncestors(40, procs)], [40, 30, 20, 1]);
  assert.ok(!selfAndAncestors(40, procs).has(99));
});

test('selfAndAncestors terminates on a cycle and on an unknown pid', () => {
  // A recycled pid can make the table describe a loop; the walk must not hang on it.
  const cyclic = [
    { pid: 7, ppid: 8, command: 'node a' },
    { pid: 8, ppid: 7, command: 'node b' },
  ];
  assert.deepEqual([...selfAndAncestors(7, cyclic)], [7, 8]);
  assert.deepEqual([...selfAndAncestors(1234, [])], [1234]);
});

test('roots compare case-insensitively and across slash spellings', onlyWindows, () => {
  // Windows is case-insensitive and the same checkout gets spelled both ways by different
  // launchers; if these did not compare equal, a run would never be recognised as its own.
  assert.ok(sameRoot('C:\\claude\\NoaCG-Studio', 'c:/claude/noacg-studio'));
  assert.ok(!sameRoot('C:/claude/NoaCG-Studio', 'C:/claude/NoaCG-Studio/.claude/worktrees/x'));
});

// ── WHO GOES FIRST when two runs start together ──
// A Playwright CLI sitting in its globalSetup WAITING looks exactly like one driving a browser,
// so before `blockingRuns` two simultaneous starts each queued behind the other and both sat out
// the 30-minute cap. The property every case below defends is the same one: whatever the pair,
// the two runs must reach OPPOSITE verdicts, computed independently from the same table.

/** Both sides of a pair, judged the way each one's own globalSetup would. */
function verdicts(runs) {
  return runs.map((self) => blockingRuns(runs, self).length === 0);
}

test('two runs started in the same second: exactly one proceeds', () => {
  const t = 1_700_000_000_000;
  const runs = [
    { pid: 200, kind: 'run', startedAt: t },
    { pid: 100, kind: 'run', startedAt: t },
  ];
  assert.deepEqual(verdicts(runs), [false, true], 'the lower pid goes first, the other waits');
});

test('an earlier run is yielded to whatever the pids say', () => {
  const t = 1_700_000_000_000;
  // The lower pid started LATER here, so a pid-only rule would let the newcomer barge in front
  // of work already under way.
  const runs = [
    { pid: 100, kind: 'run', startedAt: t + 60_000 },
    { pid: 200, kind: 'run', startedAt: t },
  ];
  assert.deepEqual(verdicts(runs), [false, true]);
});

test('starts within the POSIX rounding window count as simultaneous', () => {
  // `ps -o etimes` reports whole elapsed SECONDS, so the same process yields a startedAt that
  // wobbles by up to a second depending on when the table was read. Without the slack the two
  // sides could disagree about who started first and stall again.
  const t = 1_700_000_000_000;
  const runs = [
    { pid: 300, kind: 'run', startedAt: t + 1_400 },
    { pid: 150, kind: 'run', startedAt: t },
  ];
  assert.deepEqual(verdicts(runs), [false, true], 'settled by pid, not by the wobbling clock');
});

test('an unreadable start time still yields a decision, and the same one on both sides', () => {
  const runs = [
    { pid: 900, kind: 'run', startedAt: null },
    { pid: 800, kind: 'run', startedAt: 1_700_000_000_000 },
  ];
  assert.deepEqual(verdicts(runs), [false, true]);
});

test('a sweep is always yielded to, however late it started', () => {
  // A sweep has no globalSetup and never waits for anyone, so it can only ever be real work in
  // progress - ordering it against a run would starve the run for no reason.
  const t = 1_700_000_000_000;
  const sweep = { pid: 999, kind: 'sweep', startedAt: t + 600_000 };
  const self = { pid: 1, startedAt: t };
  assert.deepEqual(blockingRuns([sweep], self), [sweep]);
});

test('three simultaneous runs queue in a stable order rather than all proceeding', () => {
  const t = 1_700_000_000_000;
  const runs = [
    { pid: 30, kind: 'run', startedAt: t },
    { pid: 10, kind: 'run', startedAt: t },
    { pid: 20, kind: 'run', startedAt: t },
  ];
  assert.deepEqual(verdicts(runs), [false, true, false], 'exactly one proceeds');
  // And the queue behind it is FIFO by the same order, so nobody is starved.
  assert.equal(blockingRuns(runs, runs[0]).length, 2, 'pid 30 waits for both');
  assert.equal(blockingRuns(runs, runs[2]).length, 1, 'pid 20 waits only for pid 10');
});

test('a run never blocks on itself', () => {
  const self = { pid: 42, kind: 'run', startedAt: 1_700_000_000_000 };
  assert.deepEqual(blockingRuns([self], self), []);
});

// ── THE DEV SERVER A KILLED RUN LEAVES BEHIND ──
// Playwright starts the dev server as a child of its own CLI, through an npm script and a
// `cmd /c` shim, so killing the CLI frees the RAM and leaves the PORT held - and the guard hook
// then refuses every following run until somebody finds it by hand. The tables below are the
// shape captured from this machine with one leftover and one live server side by side: the
// leftover's chain broke at its own npm supervisor, the live one ran up to explorer.exe.

const REPO = 'C:/claude/NoaCG-Studio';
const viteCmd = (root) => `"node" "${root}\\node_modules\\.bin\\\\..\\vite\\bin\\vite.js"`;
const NPM_SUPERVISOR = '"node" "npm-cli.js" ' + 'run ' + 'dev';

/** server -> cmd shim -> the npm supervisor -> whatever owned the run. */
function serverTree({ pid, root, ownerPid, extra = [] }) {
  return [
    { pid, ppid: pid + 1, name: 'node.exe', command: viteCmd(root) },
    { pid: pid + 1, ppid: pid + 2, name: 'cmd.exe', command: 'cmd.exe /d /s /c vite' },
    { pid: pid + 2, ppid: ownerPid, name: 'node.exe', command: NPM_SUPERVISOR },
    ...extra,
  ];
}

test('a dev server whose launch chain lost its owner is an orphan', () => {
  // ownerPid 900 is the killed Playwright CLI: absent from the table.
  const procs = serverTree({ pid: 100, root: `${REPO}\\.claude\\worktrees\\feature-x`, ownerPid: 900 });
  const found = orphanedDevServers(procs, REPO);
  assert.equal(found.length, 1);
  assert.equal(found[0].pid, 100);
  // The shims are as unowned as the server, so they are reaped with it - children first.
  assert.deepEqual(found[0].chain, [100, 101, 102]);
});

test('a dev server still owned by a live session is left alone', () => {
  // The same tree, but the chain runs up into a real desktop session rather than ending nowhere.
  const procs = serverTree({
    pid: 200,
    root: `${REPO}\\.claude\\worktrees\\feature-y`,
    ownerPid: 800,
    extra: [{ pid: 800, ppid: 4, name: 'explorer.exe', command: 'C:\\Windows\\Explorer.EXE' }],
  });
  assert.deepEqual(orphanedDevServers(procs, REPO), []);
});

test('an unrelated Vite project on the same machine is nobody else\'s business', () => {
  const procs = serverTree({ pid: 300, root: 'C:\\work\\some-other-app', ownerPid: 900 });
  assert.deepEqual(orphanedDevServers(procs, REPO), []);
});

test('the MAIN checkout\'s own server counts, not just a worktree\'s', () => {
  const procs = serverTree({ pid: 400, root: REPO.replaceAll('/', '\\'), ownerPid: 900 });
  assert.equal(orphanedDevServers(procs, REPO).length, 1);
});

test('a recycled pid that makes the chain loop does not hang the walk', () => {
  const procs = [
    { pid: 500, ppid: 501, name: 'node.exe', command: viteCmd(`${REPO}\\.claude\\worktrees\\z`) },
    { pid: 501, ppid: 502, name: 'cmd.exe', command: 'cmd.exe /d /s /c vite' },
    { pid: 502, ppid: 501, name: 'node.exe', command: NPM_SUPERVISOR },
  ];
  assert.equal(orphanedDevServers(procs, REPO).length, 1);
});

test('an empty process table reports nothing rather than guessing', () => {
  // The POSIX case and the "could not read the machine" case both land here; every caller of
  // this module fails OPEN by design.
  assert.deepEqual(orphanedDevServers([], REPO), []);
});

// ── A CODEX DELEGATION'S PROCESS FAMILY ──
//
// This detector KILLS PROCESSES on the machine the owner is working on, so the cases below are
// the guard - the prose in e2e-runs.mjs is not. Every pid and command line here was captured with
// `Get-CimInstance Win32_Process` on 2026-09-09, from the three delegation families that had been
// leaking all day and from the owner's own desktop Codex app running beside them. The start times
// are the measured ones expressed as offsets from a round base, because their exact values mean
// nothing and their ORDER and equality mean everything.
//
// The two shapes that must never be confused are both here, and they look alike on purpose: the
// plugin's `codex.exe` and the desktop app's `codex.exe` differ only in where they live, and both
// families run MCP servers whose parents are already dead.

const T = 1_788_960_000_000;
const at = (seconds) => T + Math.round(seconds * 1000);

const NODE = '"C:\\Program Files\\nodejs\\node.exe"';
const BROKER_CMD =
  `${NODE} C:\\Users\\me\\.claude\\plugins\\cache\\openai-codex\\codex\\1.0.6\\scripts\\app-server-broker.mjs `
  + 'serve --endpoint pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server '
  + '--cwd C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5 '
  + '--pid-file C:\\Users\\me\\AppData\\Local\\Temp\\cxc-qFSQuA\\broker.pid';

/**
 * The plugin's family, exactly as it was found: the broker's own parent gone, the app-server cut
 * off from the broker by the shell that started it, and only `codex.exe` and its MCP server still
 * connected to anything.
 */
const PLUGIN_FAMILY = [
  { pid: 17376, ppid: 17764, name: 'node.exe', command: BROKER_CMD, createdMs: at(0) },
  { pid: 5320, ppid: 34364, name: 'node.exe', command: `${NODE} C:\\Users\\me\\AppData\\Roaming\\npm/node_modules/@openai/codex/bin/codex.js app-server`, createdMs: at(0.3) },
  { pid: 31132, ppid: 5320, name: 'codex.exe', command: 'C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\@openai\\codex\\node_modules\\@openai\\codex-win32-x64\\vendor\\x86_64-pc-windows-msvc\\bin\\codex.exe app-server', createdMs: at(0.6) },
  { pid: 26952, ppid: 31132, name: 'node.exe', command: `${NODE} ./mcp/server.mjs`, createdMs: at(2) },
  { pid: 30928, ppid: 36352, name: 'node.exe', command: '"node" "C:\\Users\\me\\AppData\\Local\\npm-cache\\_npx\\9833c18b2d85bc59\\node_modules\\.bin\\\\..\\@playwright\\mcp\\cli.js"', createdMs: at(2.4) },
];

/** The owner's desktop Codex app, and the MCP server it is running. Never a candidate. */
const DESKTOP_FAMILY = [
  { pid: 6120, ppid: 4, name: 'explorer.exe', command: 'C:\\Windows\\Explorer.EXE', createdMs: at(-600) },
  { pid: 25708, ppid: 6120, name: 'ChatGPT.exe', command: '"C:\\Program Files\\WindowsApps\\OpenAI.Codex_26.901.6511.0_x64__2p2nqsd0c76g0\\app\\ChatGPT.exe"', createdMs: at(-300) },
  { pid: 20136, ppid: 25708, name: 'codex.exe', command: 'C:\\Users\\me\\AppData\\Local\\OpenAI\\Codex\\bin\\8e5b6932251c2c1c\\codex.exe -c features.code_mode_host=true app-server', createdMs: at(-290) },
  { pid: 10476, ppid: 20136, name: 'node.exe', command: `${NODE} ./mcp/server.mjs`, createdMs: at(-280) },
];

const MACHINE = [...PLUGIN_FAMILY, ...DESKTOP_FAMILY];

/** What the launch wrote down: the broker and the app-server, recorded while the link was alive. */
function record({ jobs = [{ id: 'task-mtu4yl9y-g6jc21', finished: true }], owned, launcher = null } = {}) {
  return {
    workspace: 'C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5',
    endpoint: 'pipe:\\\\.\\pipe\\cxc-qFSQuA-codex-app-server',
    jobs,
    launcher,
    owned: owned ?? [
      { pid: 17376, createdMs: at(0), what: 'the broker' },
      { pid: 5320, createdMs: at(0.3), what: 'the codex app-server' },
    ],
  };
}

const killed = (trees) => trees.flatMap((tree) => tree.kill.map((p) => p.pid));

test('a finished delegation gives up the tree it recorded, and everything below it', () => {
  const [tree] = orphanedCodexTrees(MACHINE, [record()]);
  // 31132 and 26952 were never recorded: they are reached as living descendants of the recorded
  // app-server, which is the only way MCP servers started after the last snapshot are collected.
  assert.deepEqual(new Set(tree.kill.map((p) => p.pid)), new Set([17376, 5320, 31132, 26952]));
  assert.equal(tree.waiting, null);
  // Youngest first: a parent is never signalled before the children it started.
  assert.deepEqual(tree.kill.map((p) => p.pid), [26952, 31132, 5320, 17376]);
});

test('one unfinished delegation keeps the whole family, and says so for each pid', () => {
  // One broker serves every delegation in a workspace - measured, two jobs 100 s apart sharing
  // one codex.exe - so a single job still running holds all of it.
  const [tree] = orphanedCodexTrees(MACHINE, [record({
    jobs: [{ id: 'done', finished: true }, { id: 'running', finished: false }],
  })]);
  assert.deepEqual(tree.kill, []);
  assert.deepEqual(new Set(tree.kept.map((k) => k.pid)), new Set([17376, 5320, 31132, 26952]));
  assert.match(tree.kept[0].why, /have not finished/);
});

test('a recorded pid that now belongs to something else is kept, never killed', () => {
  // THE REASON THE RECORD CARRIES A START TIME. Windows hands a dead process's number to the next
  // one that asks, and hours pass between the recording and the sweep.
  const [tree] = orphanedCodexTrees(MACHINE, [record({
    owned: [{ pid: 17376, createdMs: at(-99), what: 'the broker' }],
  })]);
  assert.deepEqual(tree.kill, []);
  assert.equal(tree.kept.length, 1);
  assert.match(tree.kept[0].why, /pid was reused/);
});

test('a record that names the desktop Codex app is refused, delegation finished or not', () => {
  // The guard that matters most. A record can only name these pids if something has gone wrong,
  // which is exactly when it must hold: closing them closes the application he works in.
  const trees = orphanedCodexTrees(MACHINE, [record({
    owned: [
      { pid: 10476, createdMs: at(-280), what: 'an MCP server' },
      { pid: 20136, createdMs: at(-290), what: 'codex.exe' },
      { pid: 25708, createdMs: at(-300), what: 'the app itself' },
    ],
  })]);
  assert.deepEqual(killed(trees), []);
  for (const kept of trees[0].kept) assert.match(kept.why, /desktop Codex app/);
});

test('the desktop app is recognised from any depth, and the plugin\'s codex.exe is not', () => {
  assert.equal(underDesktopCodex(10476, MACHINE), true, 'an MCP server three levels down');
  assert.equal(underDesktopCodex(20136, MACHINE), true, 'its own codex.exe, by path');
  assert.equal(underDesktopCodex(25708, MACHINE), true, 'the application itself');
  assert.equal(underDesktopCodex(31132, MACHINE), false, 'the plugin\'s codex.exe is a different binary');
  assert.equal(underDesktopCodex(26952, MACHINE), false, 'and so is the MCP server under it');
  assert.equal(underDesktopCodex(99999, MACHINE), false, 'a pid that is not there at all');
});

test('a pid reused as a "parent" does not attach one family to another', () => {
  // 5320 died and its number went to a process that started later; the table still says the
  // app-server's parent is 5320. Following that link would walk from the desktop app's tree into
  // the plugin's, in either direction.
  const table = [
    { pid: 5320, ppid: 25708, name: 'node.exe', command: 'something else entirely', createdMs: at(60) },
    ...PLUGIN_FAMILY.filter((p) => p.pid !== 5320),
    ...DESKTOP_FAMILY,
  ];
  assert.deepEqual(ancestorsOf(31132, table).map((p) => p.pid), [], 'the walk up stops at the impostor');
  assert.deepEqual(descendantsOf([5320], table).map((p) => p.pid), [], 'and so does the walk down');
});

test('nothing is a candidate without a record, and a record proves nothing without a table', () => {
  assert.deepEqual(orphanedCodexTrees(MACHINE, []), [], 'no record, no candidate');
  assert.deepEqual(killed(orphanedCodexTrees([], [record()])), [], 'no table, no candidate');
});

test('a launch that never registered a delegation is kept until its launcher gives up', () => {
  const owned = [{ pid: 17376, createdMs: at(0), what: 'the broker' }];
  const stillLaunching = record({ jobs: [], owned, launcher: { pid: 6120, createdMs: at(-600) } });
  assert.deepEqual(killed(orphanedCodexTrees(MACHINE, [stillLaunching])), [], 'somebody is still waiting for it');
  const abandoned = record({ jobs: [], owned, launcher: null });
  assert.deepEqual(killed(orphanedCodexTrees(MACHINE, [abandoned])), [17376], 'the launch timed out');
});

test('a delegation launched from a subdirectory still belongs to its worktree', () => {
  // The recorded workspace is the directory the launch was MADE in, not one that was chosen, so
  // `/rescue` run from `<worktree>/cli` records that. A worktree-scoped sweep that compared paths
  // for equality would leave exactly the family whose directory is about to be deleted.
  const worktree = 'C:/claude/NoaCG-Studio/.claude/worktrees/agent-a9ad096b88a1d4eb5';
  assert.equal(withinRoot(worktree, worktree), true);
  assert.equal(withinRoot(`${worktree}/cli`, worktree), true);
  assert.equal(withinRoot(worktree.replaceAll('/', '\\'), worktree), true, 'either spelling of the same path');
  assert.equal(withinRoot(`${worktree}-2`, worktree), false, 'a sibling is not inside it');
  assert.equal(withinRoot('C:/claude/NoaCG-Studio', worktree), false, 'and neither is its parent');
  assert.equal(withinRoot(null, worktree), false);
});

test('an unfinished delegation is COUNTED, so a caller can act on it without reading prose', () => {
  const [busy] = orphanedCodexTrees(MACHINE, [record({
    jobs: [{ id: 'done', finished: true }, { id: 'running', finished: false }],
  })]);
  assert.equal(busy.unfinished, 1, 'what a worktree removal reads before deleting the directory');
  const [idle] = orphanedCodexTrees(MACHINE, [record()]);
  assert.equal(idle.unfinished, 0);
});

test('a process that has already exited is neither killed nor reported as kept', () => {
  const [tree] = orphanedCodexTrees(MACHINE, [record({
    owned: [{ pid: 424242, createdMs: at(0), what: 'the broker' }],
  })]);
  assert.deepEqual(tree.kill, []);
  assert.deepEqual(tree.kept, []);
});
