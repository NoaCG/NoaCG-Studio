// Build NoaCG-Bridge-<version>.exe: `noacg bridge` as one Windows executable with Node inside
// (docs/BRIDGE.md §6). Run from cli/ after `npm run build`:
//
//   node scripts/build-bridge-exe.mjs            # dist-exe/NoaCG-Bridge-<version>.exe + .sha256
//   node scripts/build-bridge-exe.mjs --no-check # skip the start-and-ask-/health proof
//
// THE AUDIO READER. NOACG_FFMPEG_DIR (or --ffmpeg-dir <dir>) names the output of
// cli/ffmpeg/build.sh for the exe's platform. Its ffmpeg and ffprobe go into the exe as
// single-executable assets with a manifest of their checksums (src/playout/audio/tools.ts), and
// the proof below then also measures a generated tone. Without one the exe is built with no audio
// reader, which a release refuses (--require-ffmpeg).
//
// HOW. Node's single executable application support (node --experimental-sea-config): esbuild
// bundles src/playoutEntry.ts and everything it reaches into ONE CommonJS file, Node turns that
// into a preparation blob, the running node.exe is copied, and postject injects the blob into
// the copy. The result starts like any exe and runs the bundle. Only the bridge entry is
// bundled, so playwright-core and the MCP SDK never enter the file.
//
// WHAT IS PROVEN before this script reports success: the exe is started on a free port with
// --no-open --quiet, GET /health answers as NoaCG Bridge with the Bridge version this
// package.json carries (`bridgeVersion`, its own line, not the CLI's `version`), and the process
// is stopped. A build that produces a file which does not start is
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
const version = pkg.bridgeVersion;
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) throw new Error(`cli/package.json has no bridgeVersion to build (got ${JSON.stringify(version)})`);
const check = !process.argv.includes('--no-check');
const flagValue = (name) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const ffmpegDir = flagValue('--ffmpeg-dir') ?? process.env.NOACG_FFMPEG_DIR;
if (process.argv.includes('--require-ffmpeg') && !ffmpegDir) throw new Error('--require-ffmpeg: set NOACG_FFMPEG_DIR or --ffmpeg-dir to the output of cli/ffmpeg/build.sh');
const programSuffix = process.platform === 'win32' ? '.exe' : '';
const exeName = process.platform === 'win32' ? `NoaCG-Bridge-${version}.exe` : 'noacg-bridge';

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
    define: { 'process.env.NOACG_BRIDGE_VERSION': JSON.stringify(version) },
    banner: { js: `// NoaCG Bridge ${version} - built from the @noacg/cli package. Source: https://github.com/NoaCG/NoaCG-Studio/tree/main/cli` },
    logLevel: 'warning',
  });
});

// 2. The preparation blob.
const seaConfig = path.join(outDir, 'sea-config.json');
const blob = path.join(outDir, 'bridge.blob');
step('write the single-executable blob', () => {
  const assets = {};
  if (ffmpegDir) {
    const files = {};
    for (const name of ['ffmpeg', 'ffprobe']) {
      const file = path.resolve(ffmpegDir, name + programSuffix);
      if (!existsSync(file)) throw new Error(`${file} is missing: build it with cli/ffmpeg/build.sh`);
      assets[`ffmpeg/${name}`] = file;
      files[name] = createHash('sha256').update(readFileSync(file)).digest('hex');
    }
    const built = readFileSync(path.resolve(ffmpegDir, 'BUILD.txt'), 'utf8');
    const manifest = path.join(outDir, 'ffmpeg-manifest.json');
    writeFileSync(manifest, JSON.stringify({ version: /^FFmpeg (\S+)/.exec(built)?.[1] ?? 'unknown', files }));
    assets['ffmpeg/manifest.json'] = manifest;
  }
  writeFileSync(
    seaConfig,
    JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }, null, 2),
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
      if (health.agent !== 'noacg-bridge' || health.version !== version) {
        throw new Error(`/health answered ${JSON.stringify(health)}, expected agent noacg-bridge version ${version}`);
      }
      process.stdout.write(`[bridge-exe] /health: ${JSON.stringify(health)}\n`);
    } finally {
      child.kill();
    }
  });
  if (ffmpegDir) {
    step('measure a tone with the embedded audio reader', () => {
      // A stereo 997 Hz tone at -23 dBFS reads -23.0 LUFS (EBU Tech 3341, case 1).
      const rate = 48000;
      const frames = rate * 2;
      const data = Buffer.alloc(frames * 8);
      for (let i = 0; i < frames; i++) {
        const v = 10 ** (-23 / 20) * Math.sin((2 * Math.PI * 997 * i) / rate);
        data.writeFloatLE(v, i * 8);
        data.writeFloatLE(v, i * 8 + 4);
      }
      const head = Buffer.alloc(44);
      head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVEfmt ', 8);
      head.writeUInt32LE(16, 16); head.writeUInt16LE(3, 20); head.writeUInt16LE(2, 22); head.writeUInt32LE(rate, 24);
      head.writeUInt32LE(rate * 8, 28); head.writeUInt16LE(8, 32); head.writeUInt16LE(32, 34); head.write('data', 36); head.writeUInt32LE(data.length, 40);
      const tone = path.join(outDir, 'tone-23.wav');
      writeFileSync(tone, Buffer.concat([head, data]));
      // A fresh cache folder, so the proof unpacks the programs as a first start would.
      const home = path.join(outDir, 'tools-home');
      const r = spawnSync(exe, ['--measure', tone], { encoding: 'utf8', env: { ...process.env, LOCALAPPDATA: home, XDG_CACHE_HOME: home, NOACG_FFMPEG_DIR: '' } });
      rmSync(tone, { force: true });
      rmSync(home, { recursive: true, force: true });
      const read = /^(-?[\d.]+) LUFS integrated, (-?[\d.]+) dBTP true peak/.exec(r.stdout ?? '');
      const near = (got, want, within) => got !== undefined && Math.abs(Number(got) - want) <= within;
      if (r.status !== 0 || !read || !near(read[1], -23, 0.1) || !near(read[2], -23, 0.2)) throw new Error(`--measure answered ${JSON.stringify(r.stdout || r.stderr)}, expected -23.0 LUFS (± 0.1) and -23.0 dBTP (± 0.2)`);
      process.stdout.write(`[bridge-exe] --measure: ${r.stdout}`);
    });
  }
}

for (const f of [bundle, blob, seaConfig, path.join(outDir, 'ffmpeg-manifest.json')]) if (existsSync(f)) rmSync(f);
const mb = (readFileSync(exe).length / 1024 / 1024).toFixed(1);
process.stdout.write(`[bridge-exe] ${path.relative(root, exe)} (${mb} MB, sha256 ${sha.slice(0, 12)}…) - NoaCG Bridge ${version}\n`);
