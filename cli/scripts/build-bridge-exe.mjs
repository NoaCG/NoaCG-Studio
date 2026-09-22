// Build NoaCG-Bridge.exe: `noacg bridge` as one Windows executable with Node inside
// (docs/BRIDGE.md §6). Run from cli/ after `npm run build`:
//
//   node scripts/build-bridge-exe.mjs            # dist-exe/NoaCG-Bridge.exe + .sha256
//   node scripts/build-bridge-exe.mjs --no-check # skip the start-and-ask-/health proof
//
// HOW. Node's single executable application support (node --experimental-sea-config): esbuild
// bundles src/playoutEntry.ts and everything it reaches into ONE CommonJS file, Node turns that
// into a preparation blob, the running node.exe is copied, and postject injects the blob into
// the copy. The result starts like any exe and runs the bundle. Only the bridge entry is
// bundled, so playwright-core and the MCP SDK never enter the file.
//
// WHAT IS PROVEN before this script reports success: the exe is started on a free port with
// --no-open --quiet, GET /health answers as NoaCG Bridge with the version this package.json
// carries, and the process is stopped. A build that produces a file which does not start is
// refused here rather than discovered by the person who downloaded it.
//
// Not done here: code signing. The copied node.exe's own signature is invalidated by the
// injection, and SmartScreen shows "Windows protected your PC" for an unsigned download
// (More info -> Run anyway). Signing needs an identity the project has to buy.

import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const outDir = path.join(root, 'dist-exe');
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
const check = !process.argv.includes('--no-check');
const exeName = process.platform === 'win32' ? 'NoaCG-Bridge.exe' : 'noacg-bridge';

function step(name, fn) {
  process.stdout.write(`[bridge-exe] ${name}\n`);
  return fn();
}

function run(cmd, args, opts = {}) {
  // No shell: `process.execPath` lives under "Program Files", and a shell would split it at
  // the space. Every command here is an absolute path to an executable or a script file.
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: root, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} exited ${r.status}`);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

// 1. One CommonJS file. `process.env.NOACG_BRIDGE_VERSION` is baked in because the bundle has
//    no package.json beside it to read its version from (src/config.ts reads this first).
const bundle = path.join(outDir, 'bridge.cjs');
step('bundle src/playoutEntry.ts with esbuild', () => {
  const esbuild = require('esbuild');
  esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'playoutEntry.ts')],
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    outfile: bundle,
    define: { 'process.env.NOACG_BRIDGE_VERSION': JSON.stringify(pkg.version) },
    banner: { js: `// NoaCG Bridge ${pkg.version} - built from @noacg/cli. Source: https://github.com/NoaCG/NoaCG-Studio/tree/main/cli` },
    logLevel: 'warning',
  });
});

// 2. The preparation blob.
const seaConfig = path.join(outDir, 'sea-config.json');
const blob = path.join(outDir, 'bridge.blob');
step('write the single-executable blob', () => {
  writeFileSync(
    seaConfig,
    JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true }, null, 2),
  );
  run(process.execPath, ['--experimental-sea-config', seaConfig]);
});

// 3. A copy of this node, with the blob injected.
const exe = path.join(outDir, exeName);
step(`copy ${path.basename(process.execPath)} and inject the blob`, () => {
  copyFileSync(process.execPath, exe);
  const postject = require.resolve('postject/dist/cli.js');
  run(process.execPath, [
    postject,
    exe,
    'NODE_SEA_BLOB',
    blob,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
    ...(process.platform === 'darwin' ? ['--macho-segment-name', 'NODE_SEA'] : []),
  ]);
});

// 4. Its checksum, beside it, for the download page.
const sha = createHash('sha256').update(readFileSync(exe)).digest('hex');
writeFileSync(`${exe}.sha256`, `${sha}  ${exeName}\n`);

// 5. Prove it starts and answers as itself.
if (check) {
  await step('start the exe and ask /health', async () => {
    const port = 48000 + Math.floor(Math.random() * 1000);
    const child = spawn(exe, ['--no-open', '--quiet', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (c) => (stderr += c.toString()));
    try {
      let health = null;
      for (let i = 0; i < 40 && !health; i++) {
        await new Promise((r) => setTimeout(r, 250));
        try {
          const res = await fetch(`http://127.0.0.1:${port}/health`);
          health = await res.json();
        } catch {
          // Not up yet.
        }
      }
      if (!health) throw new Error(`the exe never answered /health on ${port}${stderr ? `\n${stderr}` : ''}`);
      if (health.agent !== 'noacg-bridge' || health.version !== pkg.version) {
        throw new Error(`/health answered ${JSON.stringify(health)}, expected agent noacg-bridge version ${pkg.version}`);
      }
      process.stdout.write(`[bridge-exe] /health: ${JSON.stringify(health)}\n`);
    } finally {
      child.kill();
    }
  });
}

for (const f of [bundle, blob, seaConfig]) if (existsSync(f)) rmSync(f);
const mb = (readFileSync(exe).length / 1024 / 1024).toFixed(1);
process.stdout.write(`[bridge-exe] ${path.relative(root, exe)} (${mb} MB, sha256 ${sha.slice(0, 12)}…) - NoaCG Bridge ${pkg.version}\n`);
