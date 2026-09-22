// Configuration: where the deployment is, which browser to use, where the CLI keeps its files.
//
// Everything is an environment variable or a default - a CLI that a coding agent drives must be
// configurable without a prompt. NOACG_URL names the NoaCG deployment to drive (its /bridge page)
// and, later, to save into; it defaults to the hosted studio and takes a self-host or a local
// dev server just as well.

import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import path from 'node:path';

/** The deployment's origin, trailing slash stripped. */
export function noacgUrl(): string {
  const raw = process.env.NOACG_URL?.trim() || 'https://noacg.studio';
  return raw.replace(/\/+$/, '');
}

/** A Chromium executable to use instead of the system Chrome/Edge channel, when set. */
export function browserExecutable(): string | undefined {
  const raw = process.env.NOACG_BROWSER?.trim();
  return raw || undefined;
}

/**
 * The per-user config directory - where a later `noacg login` keeps its scoped key. Per OS
 * convention: %APPDATA%\noacg, ~/Library/Application Support/noacg, $XDG_CONFIG_HOME/noacg.
 */
export function configDir(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'noacg');
  }
  if (process.platform === 'darwin') {
    return path.join(homedir(), 'Library', 'Application Support', 'noacg');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'noacg');
}

/**
 * What `cliVersion()` answers when it cannot read its own package.json. It is a sentinel and not
 * a version this package ever had, so anything that COMPARES versions has to treat it as unknown
 * rather than as very old - `noacg doctor` would otherwise read it as "behind everything" and
 * print update instructions derived from a fallback constant.
 */
export const UNKNOWN_VERSION = '0.0.0';

/**
 * The CLI's own version, read from its package.json (dist/ sits beside it). Inside
 * NoaCG-Bridge.exe there is no package.json and no `import.meta.url` to resolve one from, so
 * the exe build bakes the version in as NOACG_BRIDGE_VERSION (cli/scripts/build-bridge-exe.mjs)
 * and that is read first.
 */
export function cliVersion(): string {
  const baked = process.env.NOACG_BRIDGE_VERSION?.trim();
  if (baked) return baked;
  try {
    const pkg = createRequire(import.meta.url)('../package.json') as { version?: string };
    return pkg.version ?? UNKNOWN_VERSION;
  } catch {
    return UNKNOWN_VERSION;
  }
}

/** The bridge protocol versions this CLI speaks (src/bridge/bridgeApi.ts BRIDGE_V). */
export const SUPPORTED_BRIDGE_V: readonly number[] = [1];
