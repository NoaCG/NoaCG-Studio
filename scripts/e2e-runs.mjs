// gate: none - lists and waits for this machine's browser jobs, the queue wrapper; meaningless on a runner
// guards: scripts/command-match.mjs
//
// WHO ELSE IS RUNNING PLAYWRIGHT RIGHT NOW - across every checkout of this repo on this machine.
//
// WHY THIS EXISTS. Several worktrees are normally live at once (scripts/worktree-activity.mjs
// exists for exactly that), and each one's Playwright config asks for 4 workers. Two sessions
// deciding to run their suites in the same minute therefore asks the box for EIGHT parallel
// browser workers plus two Vite servers - measured on a Ryzen 7 5800H / 16 GB laptop as 34
// live `chrome-headless-shell` processes, 93% CPU and under 2 GB of free RAM. Neither run is
// wrong; the collision is. Nobody chose it, and nobody could see it: each session only knows
// about its own checkout, and the dev-port registry deliberately keeps them off each other's
// ports, so the usual "port is busy" signal never fires.
//
// WHAT THIS IS NOT. It is not a lock file. A lock has to be released, and the thing holding it
// is a shell command that can be killed, time out, or be interrupted mid-run - so a stale lock
// would block every future run until someone deleted it by hand. Instead we ask the OS what is
// actually running. That answer is self-cleaning by construction: a killed run stops being
// reported the moment its process is gone.
//
// WHAT COUNTS AS A RUN. The top-level Playwright CLI (`@playwright/test/cli.js test ...`), one
// per run, whatever config or spec list it was given. Worker processes and browser shells are
// deliberately NOT counted: they are children of that CLI, so counting them would report one
// run many times, and a lingering browser without its CLI is an orphan (see --orphans), not a
// run in progress.
//
// CLI:
//   node scripts/e2e-runs.mjs            list active runs; exit 1 if any, 0 if none
//   node scripts/e2e-runs.mjs --json     the same as one machine-readable object
//   node scripts/e2e-runs.mjs --wait     block until no run is active, then exit 0
//   node scripts/e2e-runs.mjs --orphans  list browser/worker processes and DEV SERVERS with no
//                                        live CLI to belong to
//   node scripts/e2e-runs.mjs --kill-orphans   close them, freeing the RAM and the e2e port

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SWEEP_SCRIPTS } from './command-match.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Absolute path with forward slashes, so paths compare across Windows/posix spellings. */
function normalize(path) {
  return resolve(path).replaceAll('\\', '/');
}

/** Case-insensitive checkout-path equality (Windows filesystems are case-insensitive). */
export function sameRoot(a, b) {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/**
 * Every node process on this machine, as `{ pid, command, startedAt }`.
 *
 * Node has no portable process list, so this shells out. Windows is the primary platform here
 * and `Get-CimInstance` is the only reliable source of a full command line on it (`tasklist`
 * truncates and `wmic` is deprecated); everything else gets `ps`. A failure returns an EMPTY
 * list, which makes every caller fail OPEN - a guard that cannot see the machine must not be
 * able to block a legitimate test run.
 */
export function nodeProcesses() {
  return process.platform === 'win32' ? windowsNodeProcesses() : posixNodeProcesses();
}

function windowsNodeProcesses() {
  // ConvertTo-Json collapses a single result to an object rather than an array, so force one.
  const script =
    "@(Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | " +
    'Select-Object ProcessId,ParentProcessId,CommandLine,CreationDate) | ConvertTo-Json -Depth 3 -Compress';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  let rows;
  try {
    rows = JSON.parse(res.stdout);
  } catch {
    return [];
  }
  return (Array.isArray(rows) ? rows : [rows])
    .filter((r) => typeof r?.CommandLine === 'string')
    .map((r) => ({
      pid: Number(r.ProcessId),
      ppid: Number(r.ParentProcessId),
      command: r.CommandLine,
      // CIM dates arrive as \/Date(1754472000000)\/ through ConvertTo-Json.
      startedAt: msFromCimDate(r.CreationDate),
    }));
}

function msFromCimDate(value) {
  const match = typeof value === 'string' ? /\/Date\((\d+)\)\//.exec(value) : null;
  return match ? Number(match[1]) : null;
}

function posixNodeProcesses() {
  const res = spawnSync('ps', ['-eo', 'pid=,ppid=,etimes=,args='], { encoding: 'utf8' });
  if (res.status !== 0 || !res.stdout) return [];
  return res.stdout
    .split('\n')
    .map((line) => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/.exec(line))
    .filter(Boolean)
    .filter(([, , , , args]) => /(^|[/\\])node(\.exe)?\s/.test(`${args} `))
    .map(([, pid, ppid, etimes, args]) => ({
      pid: Number(pid),
      ppid: Number(ppid),
      command: args,
      startedAt: Date.now() - Number(etimes) * 1000,
    }));
}

/**
 * EVERY process on this machine, as `{ pid, ppid, name, command }` - not only node ones.
 *
 * `nodeProcesses` is enough to find runs, because a run IS a node process. Finding whether a dev
 * server still has an OWNER is not: its chain runs through `cmd.exe` shims, so a node-only table
 * shows a broken chain for a perfectly healthy server. Only the orphan check needs this, and it
 * is a rare manual command, so the heavier query costs nothing that matters.
 *
 * Windows only, like `browserShells` - and for the same reason. On POSIX an orphaned process is
 * REPARENTED to init rather than left with a dead parent, so "the chain ended in a dead parent"
 * never fires there and would quietly report nothing. Returning an empty table says that
 * honestly instead of guessing.
 */
export function allProcesses() {
  if (process.platform !== 'win32') return [];
  const script =
    '@(Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine) | ' +
    'ConvertTo-Json -Depth 3 -Compress';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  try {
    const rows = JSON.parse(res.stdout);
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      pid: Number(r.ProcessId),
      ppid: Number(r.ParentProcessId),
      name: String(r.Name ?? ''),
      command: typeof r.CommandLine === 'string' ? r.CommandLine : '',
    }));
  } catch {
    return [];
  }
}

/** The top-level Playwright test CLI - one process per run, whatever config it was handed. */
const RUNNER = /@playwright[/\\]+test[/\\]+cli\.js["']?\s+.*\btest\b/;

/**
 * A running catalog sweep or bench - the other things in this repo that drive a real browser,
 * and therefore compete for the same memory an e2e run needs. The suite is not only in
 * competition with ITSELF: a sweep and a Playwright run are the same workload wearing different
 * names, a dev server plus a pile of headless Chromium, on a box measured to run out of memory
 * at around six browser workers.
 *
 * The list of scripts comes from `scripts/command-match.mjs`, which the guard hook also uses to
 * recognise the COMMAND that starts one. Two copies of that fact would drift, and a sweep known
 * to one side and not the other is a silent hole - refused when you try to start it while the
 * detector calls the machine idle, or the reverse.
 */
const SWEEP = new RegExp(`scripts[/\\\\]+(${SWEEP_SCRIPTS})\\.mjs`);

/** A worker or browser spawned BY a run. Never counted as a run; used only by --orphans. */
const WORKER = /playwright[/\\]+lib[/\\]+worker[/\\]+workerProcessEntry\.js/;

/**
 * The checkout a Playwright process belongs to: everything left of its `node_modules`. That is
 * the one path present in every spelling of the invocation (`npx`, an `.bin` shim, a direct
 * `node ...cli.js`), so it identifies the checkout without parsing arguments.
 *
 * IT IS NOT ALWAYS THE WORKTREE THE RUN BELONGS TO. A linked worktree usually has no
 * node_modules of its own, so its runs resolve the MAIN checkout's Playwright and are
 * attributed there. That is the honest answer to "whose node_modules is this" and the wrong
 * answer to "whose run is this" - a caller that needs the second one identifies itself by
 * process ancestry instead (`selfAndAncestors`).
 */
export function rootOfCommand(command) {
  // Split into ARGUMENTS first, then look inside one, rather than running a regex across the
  // whole command line. A single regex cannot get this right: a checkout path may contain
  // spaces (so whitespace cannot bound the match), but if the pattern is allowed to cross
  // whitespace it will happily span two unrelated arguments and glue them into a path that
  // never existed - observed producing `.../sleeper.mjs 60000 C:/claude/NoaCG-Studio` from a
  // command line whose real root was the second of those. Quoting is what actually resolves
  // the ambiguity, and quoting is a property of the argument, not of the character stream.
  for (const arg of splitArgs(command)) {
    const at = arg.toLowerCase().indexOf('node_modules');
    if (at <= 0) continue; // absent, or the argument IS node_modules with no root before it
    const root = arg.slice(0, at).replace(/[\\/]+$/, '');
    if (root) return normalize(root);
  }
  return null;
}

/**
 * A command line's arguments. Quoted runs stay whole (so a path with spaces survives); anything
 * else splits on whitespace. This is not a full shell parser and does not need to be - it only
 * has to keep one filesystem path from bleeding into the next.
 */
function splitArgs(command) {
  return command.match(/"[^"]*"|'[^']*'|\S+/g)?.map((arg) => arg.replace(/^["']|["']$/g, '')) ?? [];
}

/** What is running, so a refusal names the job rather than only reporting that one exists. */
function labelOf(command) {
  const sweep = SWEEP.exec(command);
  if (sweep) return `${sweep[1]} sweep`;
  if (/playwright\.catalog\.config/.test(command)) return 'catalog calibration gate';
  if (/playwright\.live\.config/.test(command)) return 'configured/live suite';
  const specs = command.match(/[\w-]+\.spec\.ts/g);
  if (specs) return `${specs.length} spec file${specs.length === 1 ? '' : 's'}`;
  return 'full offline suite';
}

/**
 * The checkout a SWEEP belongs to. A sweep is invoked as `node scripts/l3-sweep.mjs`, usually
 * with a relative path and no `node_modules` anywhere in the command line, so `rootOfCommand`
 * cannot see it. Its working directory is the checkout instead - which the command line does
 * not carry, so an absolute script path is the only case we can attribute confidently.
 * Everything else is reported against the repo it must belong to, since only a checkout of this
 * repo has these scripts at all.
 */
function rootOfSweep(command, fallbackRoot) {
  for (const arg of splitArgs(command)) {
    if (!SWEEP.test(arg)) continue;
    const at = arg.toLowerCase().lastIndexOf('/scripts/');
    const winAt = arg.toLowerCase().lastIndexOf('\\scripts\\');
    const cut = Math.max(at, winAt);
    if (cut > 0) return normalize(arg.slice(0, cut));
  }
  return fallbackRoot;
}

/**
 * A pid and every process above it, as a Set - "which running processes am I part of".
 *
 * THE ROOT IS NOT ALWAYS ENOUGH TO RECOGNISE YOUR OWN RUN. `rootOfCommand` reads the checkout
 * out of the path in front of `node_modules`, and a LINKED WORKTREE normally has no
 * node_modules of its own: `npx playwright` there resolves the MAIN checkout's copy, so the
 * run's command line names the main checkout while its cwd is the worktree. `exclude` then
 * never matches, the guard sees the run as somebody else's, and every worktree suite queues
 * behind ITSELF for the full 30-minute cap before starting anyway. Ancestry is the identity
 * that survives that, because it is a fact about processes rather than about paths.
 *
 * A process list that cannot be read (the fail-open case) yields just the pid itself.
 */
export function selfAndAncestors(pid = process.pid, processes = nodeProcesses()) {
  const parentOf = new Map(processes.map((p) => [p.pid, p.ppid]));
  const chain = new Set([pid]);
  for (let at = parentOf.get(pid); at && !chain.has(at); at = parentOf.get(at)) chain.add(at);
  return chain;
}

/**
 * Browser-driving work active anywhere on this machine, longest-running first: Playwright runs
 * AND the catalog sweeps and benches, which cost the same memory under a different name.
 *
 * `exclude` drops work belonging to that checkout - pass your own root to ask "is anyone ELSE
 * running?", omit it to ask "is anything running at all?". `excludePids` drops work by PROCESS
 * IDENTITY instead, which is what a caller running INSIDE the run must use (see
 * `selfAndAncestors`).
 *
 * A sweep whose checkout cannot be read from its command line (the usual case - it is launched
 * as `node scripts/l3-sweep.mjs` from inside the checkout, and a working directory does not
 * appear in a command line) is attributed to `unattributableRoot`. That defaults to a sentinel
 * rather than to the caller's own root, because guessing "it's mine" would make `exclude` hide
 * it, and a sweep you cannot see is exactly the one that overloads the machine.
 */
export function activeRuns({ exclude, excludePids, unattributableRoot = '<unknown checkout>' } = {}) {
  return nodeProcesses()
    .filter((p) => RUNNER.test(p.command) || SWEEP.test(p.command))
    .map((p) => ({
      pid: p.pid,
      root: RUNNER.test(p.command) ? rootOfCommand(p.command) : rootOfSweep(p.command, unattributableRoot),
      label: labelOf(p.command),
      // A SWEEP never queues behind anything; only a Playwright run has a globalSetup that
      // waits. `blockingRuns` needs to tell the two apart, and `startedAt` is how two runs
      // that can both be waiting decide which of them goes first.
      kind: RUNNER.test(p.command) ? 'run' : 'sweep',
      startedAt: p.startedAt ?? null,
      elapsedMin: p.startedAt ? Math.round(((Date.now() - p.startedAt) / 60_000) * 10) / 10 : null,
    }))
    .filter((r) => !excludePids?.has(r.pid))
    .filter((r) => r.root && !(exclude && sameRoot(r.root, exclude)))
    .sort((a, b) => (b.elapsedMin ?? 0) - (a.elapsedMin ?? 0));
}

/**
 * Two Playwright runs started within this many milliseconds count as having started TOGETHER,
 * and the tie is settled by pid instead of by clock.
 *
 * The slack is not cosmetic. On POSIX `startedAt` is derived from `ps -o etimes`, which reports
 * ELAPSED WHOLE SECONDS - so the same process yields a value that wobbles by up to a second
 * depending on when the table was read, and two runs comparing each other a few seconds apart
 * must still reach the SAME verdict or they both stall again. Pid is stable, unique, and
 * available on every platform, which is all a tiebreak has to be.
 */
const SIMULTANEOUS_MS = 2_000;

/**
 * How long `--wait` will block before giving up.
 *
 * Matched to `QUEUE_TIMEOUT_MS` in e2e/_offline-guard.ts, which caps the OTHER waiter for this
 * same resource. That one has had a cap since 2026-08-21; this one did not, and the difference
 * is the single most expensive thing about the old queueing (docs/JOB_RUNNER_PLAN.md).
 */
const WAIT_CAP_SECONDS = 30 * 60;

/**
 * Which of `runs` a WAITING run must actually yield to.
 *
 * THE STALL THIS EXISTS TO PREVENT. A Playwright CLI that is sitting in its globalSetup waiting
 * looks exactly like one that is driving a browser - same process, same command line - because
 * this module reads the OS process table rather than any state a run publishes about itself. So
 * two runs started in the same second each saw the other as active work and queued behind it,
 * and neither could ever be the one that finished: both sat there until the 30-minute cap in
 * e2e/_offline-guard.ts let them through. Measured on 2026-08-21 - two worktrees, both idle at
 * ~2 s of CPU sixteen minutes in, and killing either one released the other within seconds.
 *
 * THE RULE. Runs are ordered by when they started, ties broken by pid, and a run yields only to
 * those AHEAD of it. That is a total order every run computes identically from the same process
 * table, so exactly one of any simultaneous set proceeds and the rest queue behind it in a
 * stable FIFO - no lock file, nothing to release, nothing to go stale, which is the property
 * this module is built on (see the header).
 *
 * A SWEEP is always yielded to, whenever it started: a sweep has no globalSetup and never waits
 * for anybody, so it can only ever be real work in progress.
 */
export function blockingRuns(runs, self) {
  return runs.filter((r) => {
    if (r.kind !== 'run') return true; // a sweep or bench: always real work
    if (r.pid === self.pid) return false;
    const known = typeof r.startedAt === 'number' && typeof self.startedAt === 'number';
    // An unreadable start time on either side falls back to the pid order alone. Both runs see
    // the same pair of values, so they still agree on who goes first - which is the only
    // property that matters here.
    if (!known || Math.abs(r.startedAt - self.startedAt) <= SIMULTANEOUS_MS) return r.pid < self.pid;
    return r.startedAt < self.startedAt;
  });
}

/**
 * This run's own identity for `blockingRuns`: the pid and start time of the Playwright CLI in
 * our own process chain.
 *
 * globalSetup does not necessarily run IN the CLI process, so `process.pid` is not reliably the
 * one other checkouts can see. The CLI is whichever of our ancestors the runner pattern matches;
 * failing that we fall back to this process, which still gives a stable, unique pid - the part
 * the tiebreak actually depends on.
 */
export function selfRun(pids = selfAndAncestors(), processes = nodeProcesses()) {
  const cli = processes.find((p) => pids.has(p.pid) && RUNNER.test(p.command));
  if (cli) return { pid: cli.pid, startedAt: cli.startedAt ?? null };
  const own = processes.find((p) => p.pid === process.pid);
  return { pid: process.pid, startedAt: own?.startedAt ?? null };
}

/** One human-readable line per active run. */
export function describeRuns(runs) {
  return runs
    .map((r) => `  - ${r.root} (pid ${r.pid}, ${r.label}${r.elapsedMin === null ? '' : `, ${r.elapsedMin} min in`})`)
    .join('\n');
}

/** The Vite dev server, however it was launched (`npx vite`, the `.bin` shim, a direct node call). */
const DEV_SERVER = /node_modules[/\\]+(?:\.bin[/\\]+\.{2}[/\\]+)?vite[/\\]+bin[/\\]+vite\.js/;

/**
 * A process that can only ever be part of a dev server's LAUNCH CHAIN, never its owner: the
 * `npm run dev` supervisor and the `cmd /c vite` shim git-bash and npm put in between. Anything
 * else the chain reaches - a terminal, explorer.exe, a service - is a real owner.
 */
const LAUNCH_CHAIN = /^(node|npm|cmd|bash|sh)(\.exe)?$/i;

/**
 * Is this dev server's launch chain ORPHANED - has it no living owner outside itself?
 *
 * Playwright starts the dev server as a child of its own CLI (playwright.config.ts `webServer`),
 * through `npm run dev` and a `cmd /c` shim. Killing the CLI - which is what a session does to a
 * stuck run - leaves that whole chain alive and listening, so `taskkill /PID <cli>` frees nothing.
 * Walking UP from the server tells the two cases apart, measured on this machine with one of each
 * running side by side: the leftover's chain broke three hops up AT ITS OWN `npm run dev`, whose
 * parent (the killed CLI) was gone, while a live session's server ran six hops up to
 * `explorer.exe`. So the test is not a hop count - it is whether the walk ever reaches a process
 * that is not itself part of the launch chain.
 */
function chainIsOrphaned(server, byPid) {
  const seen = new Set([server.pid]);
  for (let at = byPid.get(server.ppid); ; ) {
    if (!at) return { orphaned: true, chain: [...seen] }; // ended in a dead parent: nothing owns it
    if (!LAUNCH_CHAIN.test(at.name)) return { orphaned: false, chain: [] }; // terminal/desktop/service
    if (seen.has(at.pid)) return { orphaned: true, chain: [...seen] }; // recycled pid made a loop
    seen.add(at.pid);
    at = byPid.get(at.ppid);
  }
}

/**
 * Dev servers belonging to THIS repository - the main checkout or any worktree under it - whose
 * launch chain has no living owner. Pure over an injected process table so it can be tested
 * against real tables captured from both cases.
 */
export function orphanedDevServers(processes, root = repoRoot) {
  const byPid = new Map(processes.map((p) => [p.pid, p]));
  const repo = normalize(root).toLowerCase();
  return processes
    .filter((p) => DEV_SERVER.test(p.command))
    .map((p) => ({ ...p, root: rootOfCommand(p.command) }))
    // Only ever this repo's own checkouts. An unrelated Vite project on the same machine is
    // nobody's business here, and a worktree lives UNDER the repo root.
    .filter((p) => {
      const at = p.root?.toLowerCase();
      return !!at && (at === repo || at.startsWith(`${repo}/`));
    })
    // `chain` is the server and the launch-chain processes above it, children first. Killing the
    // server alone frees the port but leaves its `npm run dev` and `cmd /c` shims resident, and
    // those are exactly as unowned as the server was.
    .map((p) => ({ pid: p.pid, root: p.root, ...chainIsOrphaned(p, byPid) }))
    .filter((p) => p.orphaned)
    .map((p) => ({ pid: p.pid, root: p.root, chain: p.chain }));
}

/**
 * Playwright workers, browser shells, and DEV SERVERS with no live CLI to belong to - what a
 * killed or crashed run leaves behind. The workers and shells hold real RAM; the dev server
 * holds this checkout's e2e PORT, which is worse than wasteful - the guard hook refuses every
 * following run until somebody finds and kills it by hand.
 */
export function orphanProcesses() {
  const runsExist = nodeProcesses().some((p) => RUNNER.test(p.command));
  const workers = nodeProcesses().filter((p) => WORKER.test(p.command));
  const shells = browserShells();
  const servers = orphanedDevServers(allProcesses());
  return runsExist ? { workers: [], shells: [], servers: [] } : { workers, shells, servers };
}

function browserShells() {
  if (process.platform !== 'win32') return [];
  const script =
    "@(Get-Process -Name chrome-headless-shell -ErrorAction SilentlyContinue | " +
    'Select-Object Id,@{n="Mb";e={[int]($_.WorkingSet64/1MB)}}) | ConvertTo-Json -Compress';
  const res = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0 || !res.stdout?.trim()) return [];
  try {
    const rows = JSON.parse(res.stdout);
    return (Array.isArray(rows) ? rows : [rows]).map((r) => ({ pid: r.Id, mb: r.Mb }));
  } catch {
    return [];
  }
}

// ── CLI ─────────────────────────────────────────────────────────────────────

if (process.argv[1] && normalize(process.argv[1]) === normalize(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);

  if (args.includes('--orphans')) {
    const { workers, shells, servers } = orphanProcesses();
    const mb = shells.reduce((sum, s) => sum + s.mb, 0);
    if (workers.length === 0 && shells.length === 0 && servers.length === 0) {
      console.log('No orphaned Playwright processes - nothing is holding RAM or a port between runs.');
      process.exit(0);
    }
    const serverLines = servers.map((s) => `\n  - dev server pid ${s.pid} for ${s.root}`).join('');
    console.log(
      `Orphaned from a killed or crashed run: ${workers.length} worker process(es), ` +
        `${shells.length} browser shell(s) holding ~${mb} MB, and ${servers.length} dev server(s).` +
        serverLines +
        '\nNo Playwright CLI is running, so nothing will reap these. ' +
        'A dev server left here also holds its checkout\'s e2e PORT, which is what makes the next ' +
        'run refuse to start. Close them with:\n' +
        '  node scripts/e2e-runs.mjs --kill-orphans',
    );
    process.exit(1);
  }

  if (args.includes('--kill-orphans')) {
    const { workers, shells, servers } = orphanProcesses();
    if (workers.length === 0 && shells.length === 0 && servers.length === 0) {
      console.log('Nothing to clean up.');
      process.exit(0);
    }
    // Only ever reached when NO Playwright CLI is running, so none of these can belong to a
    // live run - that check is the whole safety argument for killing anything here. A dev
    // server clears a second bar on top of it: its launch chain has no living owner either,
    // so it is not somebody's `npm run dev` or a preview the tools started.
    let killed = 0;
    // A server's CHAIN goes children-first, so the shims cannot outlive what they were shimming.
    const targets = [...workers, ...shells, ...servers.flatMap((s) => s.chain.map((pid) => ({ pid })))];
    for (const p of targets) {
      try {
        process.kill(p.pid);
        killed++;
      } catch {
        // Already gone, or not ours to signal. Either way there is nothing to report.
      }
    }
    const ports = servers.length ? `, freeing ${servers.length} checkout's e2e port` : '';
    console.log(`Closed ${killed} orphaned process(es)${ports}.`);
    process.exit(0);
  }

  const wait = args.includes('--wait');
  const asJson = args.includes('--json');
  const mine = args.includes('--all') ? undefined : repoRoot;

  let runs = activeRuns({ exclude: mine });

  if (wait) {
    let waited = 0;
    while (runs.length > 0) {
      if (waited === 0) {
        console.log(`Waiting for ${runs.length} browser-driving job(s) to finish:\n${describeRuns(runs)}`);
      } else if (waited % 60 === 0) {
        console.log(`  still waiting (${waited / 60} min)...`);
      }
      // THE CAP. This loop used to have none, while the OTHER waiter for the same resource -
      // `waitForOtherRuns` in e2e/_offline-guard.ts - has had a 30-minute one since 2026-08-21.
      // Unbounded, it outlives the shell that started it (an agent's tool call is killed at
      // 600 s), so the run never starts and nothing anywhere says so: the session sees a timed
      // out command and the queue sees a run that never existed. A wait that cannot end is
      // indistinguishable from a wait that has died, which is the whole problem.
      if (waited >= WAIT_CAP_SECONDS) {
        console.error(
          `Gave up waiting after ${WAIT_CAP_SECONDS / 60} min. Still active:\n${describeRuns(runs)}\n` +
            'Nothing was started. Enqueue the work instead of waiting for it, and it will run when a ' +
            'slot frees:\n  node scripts/jobs.mjs add "<the command>"\n' +
            '(docs/JOB_RUNNER_PLAN.md; `node scripts/jobs.mjs` shows the queue.)',
        );
        process.exit(1);
      }
      await new Promise((done) => setTimeout(done, 5_000));
      waited += 5;
      runs = activeRuns({ exclude: mine });
    }
    if (waited > 0) console.log(`Clear after ${Math.round(waited / 6) / 10} min.`);
    process.exit(0);
  }

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ runs, count: runs.length })}\n`);
    process.exit(runs.length > 0 ? 1 : 0);
  }

  if (runs.length === 0) {
    console.log('No suite, sweep or bench is running in any other checkout of this repo.');
    process.exit(0);
  }
  console.log(`${runs.length} browser-driving job(s) active:\n${describeRuns(runs)}`);
  process.exit(1);
}
