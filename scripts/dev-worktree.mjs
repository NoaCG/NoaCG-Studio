// START THE DEV SERVER FOR *THIS* CHECKOUT - the sanctioned path in a linked worktree.
//
// WHY THIS EXISTS. `npm run dev` is refused by scripts/hooks/guard-command.mjs, and the
// alternative that refusal used to name - `preview_start {name: "dev"}` - does not reach a
// linked worktree. Measured 2026-09-01 from `.claude/worktrees/agent-a32e0b6091a2fe4bb`
// (reserved port 5256), one call, three different checkouts in the answer:
//
//   - it spawned `npm run dev` with cwd `.claude/worktrees/new-session-64a3f6` - the LAUNCHING
//     session's checkout, not the one the work is in;
//   - it reported `port: 5174` - the PRIMARY checkout's number, from neither of the above;
//   - Vite actually bound 5240 - the reservation of the checkout it was spawned in, because
//     vite.config.ts resolves the port from its own location and that part is correct;
//   - nothing ever answered on the reported port, so the harness reaped the server about two
//     minutes later. Net result: no server at all, and the only URL the session was handed
//     pointed at a checkout it was not working in.
//
// So a worktree session had no correct way to drive its own build: the guard refused the direct
// route and the sanctioned route served somebody else's tree. That is the "green gate on the
// wrong tree" shape the root AGENTS.md calls worse than a red one, and it has already been paid
// for - the 2026-08-29 SVG import sweep measured main's importer rather than the branch's and
// said so in its own report (docs/backlog/svg-import-sweep-findings.md).
//
// WHAT KEEPS THE REFUSAL HONEST. The guard refuses hand-started servers for a real reason:
// Playwright runs with `reuseExistingServer: true`, so a stray server on a checkout's port is
// silently adopted along with whatever env it was started with. This script does not widen that
// rule, it is the rule made mechanical:
//
//   - the checkout is resolved from THIS FILE's location, never `process.cwd()`, so the copy
//     that ships in a worktree can only ever serve that worktree;
//   - the port is that checkout's RESERVATION (scripts/dev-port.mjs) - the same number Vite,
//     both Playwright configs, the guard hook and every dev script derive, with no second
//     source of it;
//   - it REFUSES when that port is already busy, which is the actual hazard the guard names.
//
// The only server it can start is therefore on the port that checkout already owns, serving the
// tree the work is in. It is NOT the suite's server: `playwright.config.ts` pins the backend and
// AI vars empty for its own, and this one carries the ambient `.env`, which is exactly why the
// two must never be confused for each other (see the mutual exclusion below). It runs in the
// FOREGROUND so
// the shell that started it owns it (background it with the tool's own backgrounding, then stop
// it by stopping that task).
//
// STOPPING THE SHELL TASK DOES NOT ALWAYS TAKE VITE WITH IT. An interrupt is forwarded (the
// signal handlers below), but a hard kill of the wrapper on Windows leaves the grandchild
// running and holding the port. It spawns the real `vite/bin/vite.js` so that leftover is at
// least VISIBLE to `node scripts/e2e-runs.mjs --orphans` like any other.
//
// THAT LIST IS A PLACE TO LOOK, NOT A VERDICT, and this script must not pretend otherwise:
//   - a LIVE server can appear in it. `chainIsOrphaned` asks whether the launch chain above the
//     process still exists, and a backgrounded shell task whose launcher has since exited has no
//     living chain even while the server is serving. Measured both ways on 2026-09-01: from this
//     session's own backgrounding a healthy server was correctly absent from the list, and from
//     a forked review session a healthy server was reported as orphaned.
//   - the checkout it names can be wrong. `rootOfCommand` reads the path in front of
//     `node_modules`, and a linked worktree with no node_modules of its own resolves the primary
//     checkout's Vite - so the server is attributed to the primary checkout, which is that
//     function's own documented behaviour rather than something to fix here.
//   - `--orphans` run from the PRIMARY checkout covers every worktree under it, so a kill there
//     is not scoped to the caller.
// Together that is why the busy-port message below says look, identify, and only then close -
// telling anyone to reach for `--kill-orphans` on a port they cannot attribute would contradict
// the very rule this file is about.
//
// A RUNNING SERVER BLOCKS THIS CHECKOUT'S E2E RUNS, deliberately: the guard hook's port check
// refuses them while the port is taken, because Playwright would adopt this server and its
// ambient .env instead of starting one with the offline-pinned vars its config sets. So a sweep
// and a suite in the same checkout are mutually exclusive - stop this before running specs.
//
// `--preview` SERVES `dist/` INSTEAD OF THE SOURCE, and it is not a convenience. Any measurement
// of how the app FEELS is worthless taken against the dev server: React's development JSX runtime
// (`jsxDEV`, with its stack capture per element) plus StrictMode's double render dominate every
// profile of this app - 70 to 130 ms of it per second and a half in the production dashboard, on
// a page where nothing has been pressed. Measured 2026-09-10 while chasing the operator's playout
// lag, where the first profile said "React" and meant "React in dev mode". The shipped bundle has
// neither. So a latency number that is going to be shown to anybody has to come from here, and
// this mode exists so that getting one does not mean hand-starting a server the guard refuses.
//
// It refuses on the same busy port for the same reason, and it serves the SAME checkout - so
// nothing about the argument above is weakened. Run `npm run build` first; `vite preview` on a
// stale or missing `dist/` serves a stale or missing app and says nothing about it.
//
// IT SERVES NO `/api`, AND THAT FAILS QUIETLY. All six API plugins (`renderDevPlugin`,
// `aiDevPlugin`, `eventsDevPlugin`, `adminDevPlugin`, `meDevPlugin`, `dataDevPlugin`) implement
// `configureServer` and nothing else, so `vite preview` never installs them. A request to
// `/api/me/entitlement` or `/api/render` then does not 404 - the SPA fallback answers it with
// `index.html` and a 200, the caller's `response.json()` throws, and a caller that degrades on
// error (myEntitlement.ts does) reports its default as though the server had said so. Nothing
// anywhere says the handler was missing. So this mode is right for measuring how the shipped
// bundle BEHAVES and wrong for reproducing anything that crosses `/api`; for those, use the dev
// server. The startup line below says so every time, because a caveat only in a header is one
// nobody reads at the moment it matters.
//
// CLI:
//   node scripts/dev-worktree.mjs        start the server for this checkout (npm run dev:worktree)
//   node scripts/dev-worktree.mjs --preview  serve the BUILT dist/ on the same port
//   node scripts/dev-worktree.mjs --print  print where it WOULD serve, start nothing

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { devPorts, writeLaunchConfig } from './dev-port.mjs';
import { isPortBusy } from './port-probe.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

const record = devPorts();
const url = `http://localhost:${record.port}`;
const servesBuild = process.argv.includes('--preview');

/** The lines every path prints: which tree, which port, and what to hand a sweep. */
function where() {
  return [
    `Checkout:  ${record.root}`,
    `Dev port:  ${record.port} (${record.source})`,
    `Serving:   ${servesBuild ? 'dist/ - the BUILT app (run `npm run build` first)' : 'src/ - the dev server'}`,
    `App:       ${url}/app`,
    `Sweeps:    --base ${url}   (e.g. node scripts/svg-import-sweep.mjs --base ${url})`,
    ...(servesBuild
      ? [
          '',
          'NO /api IN THIS MODE. The API plugins are dev-server only, so `vite preview` serves',
          'index.html with a 200 for every /api/* request instead of 404ing. Render, AI, events,',
          'admin, /api/me and /api/data all fail silently here - use the plain dev server for',
          'anything that crosses them. This mode is for how the SHIPPED bundle behaves.',
        ]
      : []),
  ].join('\n');
}

if (process.argv.includes('--print')) {
  console.log(where());
  process.exit(0);
}

// Before the port probe and before anything is printed: refusing after announcing a URL reads as
// a server that started and then died.
if (servesBuild && !existsSync(join(repoRoot, 'dist', 'index.html'))) {
  console.error(`No built app at ${join(repoRoot, 'dist')} - run \`npm run build\` in this checkout first.`);
  process.exit(1);
}

// The reservation is this checkout's identity, so a busy port is never "just pick another one":
// Playwright, the sweeps and the guard hook all expect the server on THIS number. Something else
// being there means either a second server for this checkout or a stale one carrying somebody
// else's env - the exact condition the e2e trap needs, and the one thing that must stop us.
if (await isPortBusy(record.port, 750)) {
  console.error(
    `Port ${record.port} is already busy - that is this checkout's reserved dev port, so ` +
      'something is already serving (or squatting) the number every other tool here expects.\n' +
      `  ${record.root}\n` +
      `If it is your own server, it is already the right one - use ${url}/app.\n` +
      'To find out whose it is:\n' +
      '  node scripts/dev-port.mjs --list     who holds which reservation\n' +
      '  node scripts/e2e-runs.mjs --orphans  what has no living launcher\n' +
      'IDENTIFY IT BEFORE CLOSING ANYTHING. A healthy server can appear in --orphans (a ' +
      'backgrounded shell whose launcher has exited leaves no live chain), and the checkout it ' +
      'names is the one whose node_modules supplied Vite, which in a worktree is often the ' +
      'primary checkout. `--kill-orphans` acts on all of them at once. On Windows, ' +
      `\`netstat -ano | findstr :${record.port}\` then \`tasklist /fi "pid eq <pid>"\` says who is ` +
      'actually holding the port.\n' +
      'If you cannot attribute it, do not kill it - move this checkout instead with ' +
      '`node scripts/dev-port.mjs --release` (docs/DEV_PORTS.md "Troubleshooting").',
  );
  process.exit(1);
}

// Keep the generated preview config in step with the reservation. Harmless when it is already
// current (the writer is change-only), and it costs nothing to leave the file truthful.
writeLaunchConfig();

// Resolve Vite rather than hardcoding `<repoRoot>/node_modules`: a linked worktree may have no
// node_modules of its own and resolve every dependency by walking up to the primary checkout's.
// Which copy of the BINARY runs does not affect which tree is served - Vite's cwd decides that,
// and that is repoRoot below - but a hardcoded path would fail on a checkout where nothing is
// actually missing (the same trap scripts/check-workflows.mjs records).
let viteBin;
try {
  viteBin = join(dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
} catch {
  console.error('Could not resolve Vite. Run `npm install` in this checkout first.');
  process.exit(1);
}

console.log(`${where()}\n`);

// Spawn the bin with THIS Node rather than through npm: one fewer shim in the launch chain, and
// the command line then carries `vite/bin/vite.js`, which is what `e2e-runs.mjs --orphans`
// recognises a dev server by.
//
// CI=1 is this repo's own switch for "do not pop a browser window" - vite.config.ts reads it for
// exactly one thing, `server.open` - and a server started from a tool call must not steal the
// desktop. An explicitly set CI is left alone.
// `preview` takes the port explicitly: vite.config.ts pins `server.port` for the dev server and
// says nothing about the preview one, and a preview server on a number nobody else derives would
// break the single-source-of-port rule this file is built on.
const viteArgs = servesBuild ? ['preview', '--port', String(record.port), '--strictPort'] : [];
const child = spawn(process.execPath, [viteBin, ...viteArgs], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: { ...process.env, CI: process.env.CI ?? '1' },
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(signal ? 1 : (code ?? 0)));
