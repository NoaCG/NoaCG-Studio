// `npm run dev:bench` - the dev server the video bench drives, wrapped so that when it dies
// it leaves a trace.
//
// Why the wrapper exists: during a 42-generation bench pass this server vanished twice,
// mid-run, taking a brief's worth of paid generations with it. Both times the process was
// simply gone - `ERR_CONNECTION_REFUSED`, no entry left in the preview harness, no logs - so
// there was nothing to diagnose from. A dev server that dies unattended is only debuggable if
// something recorded how it went, and the exit code or signal is the whole question: a signal
// means something outside reaped it, a non-zero code with "heap out of memory" means Vite ran
// out of room, and a clean 0 means it was asked to stop.
//
// Output is passed through UNCHANGED so the preview harness still reads Vite's ready banner
// and port the way it always has; the log file is a copy, never a replacement.
//
// Three things get recorded, because they fail in different ways:
//   - Vite's own stdout/stderr, streamed as it arrives. A crash that PRINTS (V8's "FATAL
//     ERROR: ... heap out of memory" goes to stderr) lands here even if nothing else runs.
//   - the exit code/signal, when the wrapper gets to see it.
//   - a heartbeat, because often it does NOT. Windows has no real SIGTERM: a supervisor
//     stop is a TerminateProcess, the handlers below never fire, and the log simply stops.
//     Verified here - stopping the server through the preview harness wrote no exit line at
//     all. So the heartbeat is what distinguishes the two cases that matter: a log ending
//     with a crash message means Vite died of something it could describe, and a log ending
//     at a heartbeat means it was killed from outside without a word.

import { spawn } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const LOG = join(root, 'dev-bench.log');
const stamp = () => new Date().toISOString();

// appendFileSync, not a write stream. A stream BUFFERS, and the failure being investigated
// kills the process outright - measured here: with a stream, every heartbeat written before a
// preview-harness stop was lost with the buffer, so the log showed only the startup line and
// proved nothing. A synchronous append is on disk before the next line runs. The volume is a
// dev server's own output, so the cost does not matter.
const log = (text) => {
  try {
    appendFileSync(LOG, text);
  } catch {
    // Logging must never take the dev server down with it.
  }
};

log(`\n=== ${stamp()} dev:bench starting (pid ${process.pid}) ===\n`);

// RESOLVE vite, never assume it sits in this checkout's own node_modules. A linked worktree
// under .claude/worktrees/ usually has an EMPTY local node_modules and resolves everything by
// walking up to the primary checkout's - which is why `npm run build` and the e2e suite work
// there while a hardcoded `<root>/node_modules/vite/bin/vite.js` throws MODULE_NOT_FOUND.
// That is a bad place to fail: dev:bench is the server the paid video bench drives, so the
// break surfaces immediately before a run that costs real money.
//
// Resolve via `vite/package.json` and read `bin.vite` from it, rather than resolving the bin
// path directly: Vite 8's "exports" map does not expose ./bin/vite.js, so asking for it throws
// ERR_PACKAGE_PATH_NOT_EXPORTED. ./package.json IS exported, and the bin field is where the
// real path lives anyway, so this keeps working if the layout moves again.
const require = createRequire(import.meta.url);
const vitePkgPath = require.resolve('vite/package.json');
const viteBin = join(dirname(vitePkgPath), require(vitePkgPath).bin.vite);

// `--import` preloads the bench dispatcher into the Vite process, which is where the api/
// handlers run and therefore where the outbound model call is made. It raises undici's 300 s
// header timeout - a limit no calling code can see, and the one that reported the Phase 0
// round's minutes-long reasoning calls as "the AI provider could not be reached"
// (scripts/bench-dispatcher.mjs). Bench server only; `npm run dev` is untouched.
const dispatcher = join(root, 'scripts', 'bench-dispatcher.mjs');
const child = spawn(process.execPath, ['--import', pathToFileURL(dispatcher).href, viteBin, '--mode', 'bench'], {
  cwd: root,
  stdio: ['inherit', 'pipe', 'pipe'],
  windowsHide: true,
});

for (const [stream, out] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  stream.on('data', (chunk) => {
    out.write(chunk); // the harness parses this - it must look exactly as it did before
    log(chunk);
  });
}

// Bracket the time of death for the case where nothing else gets to speak. One line a minute
// is a few kB over a long bench pass, and it is the difference between "it died around here"
// and no information at all.
const heartbeat = setInterval(() => {
  log(`--- ${stamp()} alive ---\n`);
}, 60_000);
heartbeat.unref();

// The line that will explain the next disappearance, when the wrapper survives to write it.
child.on('exit', (code, signal) => {
  clearInterval(heartbeat);
  log(`=== ${stamp()} vite exited code=${code} signal=${signal} ===\n`);
  process.exit(code ?? 1);
});
child.on('error', (e) => {
  clearInterval(heartbeat);
  log(`=== ${stamp()} vite failed to start: ${e.message} ===\n`);
  process.exit(1);
});

// Forward the signals a supervisor would use, so a deliberate stop exits cleanly and is
// recorded as such rather than looking like the crash this wrapper is here to catch.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    log(`=== ${stamp()} wrapper received ${sig}, stopping vite ===\n`);
    child.kill(sig);
  });
}
