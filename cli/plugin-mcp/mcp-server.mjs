#!/usr/bin/env node
// The plugin's MCP entrance. It exists to run `noacg mcp` in ONE process.
//
// The plugin used to declare `npx -y @noacg/cli mcp`, and npx cannot do that job cheaply. It
// resolves the package, spawns the real binary with `stdio: 'inherit'`, and then stays alive for
// the whole session with nothing left to do but forward the child's exit code. Measured on
// 2026-09-02 (docs/backlog/cli-mcp-startup-weight.md): that launcher process holds ~85 MB of
// private bytes for hours, and npx adds roughly 1.5-4 s to every session start. Pinning the
// version does not help - the cost is npx's own machinery, not the "what is latest?" lookup.
// An MCP server declared by a plugin starts in EVERY session that has the plugin installed, so
// both costs are paid by people who never touch a NoaCG graphic that day.
//
// So: find the CLI, then `import` it here instead of spawning it. Same process, same stdio, no
// wrapper. The npx path stays as the LAST resort, because zero-install is a real feature - a
// fresh user with no global install must still get a working server, and for them this stays
// exactly as expensive as the plugin already was, never more.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// The plugin manifest is the reviewed version authority. Never resolve a floating npm version.
const REVIEWED = JSON.parse(readFileSync(new URL('./.claude-plugin/plugin.json', import.meta.url), 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(REVIEWED)) throw new Error('noacg-mcp has an invalid reviewed CLI version');
const INSTALL = `npm i -g @noacg/cli@${REVIEWED}`;
if (Number(process.versions.node.split('.')[0]) < 20) {
  process.stderr.write('[noacg] Node 20 or newer is required. Install Node with npm, then restart.\n');
  process.exit(1);
}

const BIN = 'noacg';
const ENTRY = path.join('@noacg', 'cli', 'dist', 'index.js');

/** Where npm puts a globally installed package, derived from the directory holding its shim:
 *  `<prefix>\node_modules\...` on Windows, `<prefix>/lib/node_modules/...` everywhere else. */
function globalEntries(binDir) {
  return [
    path.join(binDir, 'node_modules', ENTRY),
    path.join(binDir, '..', 'lib', 'node_modules', ENTRY),
  ];
}

/** npm's own npx entry, beside the running node binary - the same two layouts as above. */
function npxEntry() {
  const dir = path.dirname(process.execPath);
  return [
    path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ].find(existsSync) ?? null;
}

/** The CLI's entry file, or null to fall back to npx. The order is deliberate: an explicit
 *  override first (a checkout under development), then a normal resolve, then a global install. */
function resolveCli() {
  const override = process.env.NOACG_CLI;
  if (override) {
    if (!path.isAbsolute(override) || !existsSync(override)) {
      process.stderr.write('[noacg] NOACG_CLI must name an existing absolute development entry file. Fix or unset it.\n');
      process.exit(1);
    }
    return override;
  }

  try {
    return createRequire(import.meta.url).resolve('@noacg/cli/dist/index.js');
  } catch {
    // Not installed beside the plugin. Expected - the plugin ships no node_modules.
  }

  // The default `npm i -g` prefix sits beside the running node binary: two stats that hit for
  // most installs, before the PATH walk below spends up to three per entry.
  const beside = globalEntries(path.dirname(process.execPath)).find(existsSync);
  if (beside) return beside;

  const dirs = (process.env.PATH || process.env.Path || '').split(path.delimiter).filter(Boolean);
  for (const dir of dirs) {
    const shim = [BIN, `${BIN}.cmd`, `${BIN}.exe`].map((n) => path.join(dir, n)).find(existsSync);
    if (!shim) continue;
    try {
      // npm symlinks the shim straight at the entry file on Linux and macOS (realpathSync throws
      // when the target is gone, so a returned path exists).
      const real = realpathSync(shim);
      if (real.endsWith('.js')) return real;
    } catch {
      // A shim that cannot be resolved is not a reason to stop looking.
    }
    const entry = globalEntries(dir).find(existsSync);
    if (entry) return entry;
  }
  return null;
}

/** The version `entry` (`.../@noacg/cli/dist/index.js`) belongs to, read from that package's own
 *  `package.json`, or null if it cannot be read - never a reason to stop resolving the CLI. */
function readOwnVersion(entry) {
  try {
    const pkgPath = path.join(path.dirname(entry), '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.name === '@noacg/cli' ? pkg.version ?? null : null;
  } catch {
    return null;
  }
}

const extra = process.argv.slice(2);
const cli = resolveCli();

if (cli) {
  if (cli !== process.env.NOACG_CLI) {
    const ownVersion = readOwnVersion(cli);
    if (ownVersion !== REVIEWED) {
      process.stderr.write(`[noacg] installed CLI ${ownVersion ?? '(unknown)'} is incompatible with this reviewed plugin (${REVIEWED}). Run ${INSTALL}, then restart.\n`);
      process.exit(1);
    }
  } else {
    process.stderr.write(`[noacg] explicit NOACG_CLI development override: ${cli}; reviewed version ${REVIEWED} is bypassed.\n`);
  }
  // `dist/index.js` runs its own `main()` on import and reads `process.argv.slice(2)`, so hand it
  // the argv it would have had as a real command. One process from here on.
  process.argv = [process.execPath, cli, 'mcp', ...extra];
  await import(pathToFileURL(cli).href);
} else {
  // No installed copy. Say so on stderr - stdout belongs to the MCP protocol, and a stray line
  // there breaks the transport.
  process.stderr.write(
    `[noacg] @noacg/cli@${REVIEWED} is not installed; pinned npx downloads it from registry.npmjs.org.\n`
      + `[noacg] This costs an extra process. ${INSTALL} makes it a single process.\n`,
  );
  // Run npm's own npx entry IN THIS PROCESS rather than spawning the `npx` shim. Two reasons, both
  // load-bearing. Node has refused to spawn a `.cmd` without `shell: true` since the 2024
  // argument-injection fix, so `spawn('npx.cmd', ...)` dies immediately on Windows - measured here
  // before this was written. And spawning would make this launcher a THIRD process on the one path
  // that already had two, so the fresh-user case would get worse instead of staying level.
  const npxCli = npxEntry();
  if (!npxCli) {
    process.stderr.write(`[noacg] npx could not be found either. Install Node with npm, then run ${INSTALL}.\n`);
    process.exit(1);
  }
  process.argv = [process.execPath, npxCli, '-y', `@noacg/cli@${REVIEWED}`, 'mcp', ...extra];
  await import(pathToFileURL(npxCli).href);
}
