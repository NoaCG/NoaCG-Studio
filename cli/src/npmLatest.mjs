// "Is this copy behind npm's latest?" - ONE implementation, for both entrances.
//
// The comparison started life inside cli/plugin-mcp/mcp-server.mjs (the optional MCP plugin's
// launcher), which is the entrance we recommend LEAST. `noacg doctor` - the command the README's
// setup prompt tells every agent to run - said nothing. Rather than write a second copy with its
// own timeout and its own idea of the cache format, the logic lives here and the launcher gets a
// GENERATED copy beside it (cli/scripts/build-skill.mjs writes cli/plugin-mcp/npm-latest.mjs from
// this file, and `--check` fails if the two drift).
//
// Why a copy rather than an import: the launcher checks a CLI that may be years old, so the
// checker has to be the component that is current. It resolves an installed @noacg/cli and imports
// its dist/index.js; if it imported this module from that same resolved copy, a stale 0.2.0 - the
// exact case worth warning about - would not carry the file, and the warning would vanish for the
// only people who need it. The launcher therefore ships its own copy of the text.
//
// This file is plain ESM on node builtins only: it is copied verbatim into a folder that has no
// node_modules and no build step, so it can never import anything from the CLI.

import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const REGISTRY_LATEST_URL = 'https://registry.npmjs.org/@noacg/cli/latest';
export const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // once a day is enough to catch a stale machine
export const REGISTRY_TIMEOUT_MS = 1500; // never let a slow network add real time to a session start

/**
 * Where the cached `latest` lives: one path per machine by default, so every process that asks
 * shares one registry read. An explicit override exists solely so a diagnostic run
 * (https://github.com/NoaCG/NoaCG-Studio/blob/1a017c93652405537d8d2d327c6d6ccaed4fe935/docs/acceptance/owner-queue/2026-09-16-se-stale-global-cli-warns.md) can plant a fake `latest` without
 * touching the real cache every other session on the box reads. Read per call rather than at
 * module load, so a test can set it around one invocation.
 * @returns {string}
 */
export function latestVersionCacheFile() {
  return process.env.NOACG_CLI_LATEST_CACHE_FILE
    || path.join(os.tmpdir(), 'noacg-cli-latest-version.json');
}

/**
 * npm's current `latest` for `@noacg/cli`, cached on disk for a day so a version check costs a
 * network round trip once per machine per day rather than once per session. Returns null on any
 * failure (offline, slow, cache unreadable) - a version check must never block startup, and
 * silence is always better than a staleness claim that could be wrong.
 * @returns {Promise<string | null>}
 */
export async function fetchLatestVersion() {
  const cacheFile = latestVersionCacheFile();
  try {
    const cached = JSON.parse(readFileSync(cacheFile, 'utf8'));
    if (Date.now() - cached.checkedAt < VERSION_CACHE_TTL_MS) return cached.latest;
  } catch {
    // No cache yet, or it is unreadable - fetch below.
  }

  let timeout;
  try {
    const controller = new AbortController();
    timeout = setTimeout(() => controller.abort(), REGISTRY_TIMEOUT_MS);
    const res = await fetch(REGISTRY_LATEST_URL, { signal: controller.signal });
    if (!res.ok) return null;
    const { version } = await res.json();
    try {
      // Several processes on one machine (a normal state in this repo's own multi-worktree
      // workflow) can race past the TTL check together and all land here at once. Write-then-rename
      // makes each write atomic, so a reader never sees a torn write from another process - only
      // ever one writer's complete JSON or another's, never a mix of both.
      const tmp = `${cacheFile}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify({ latest: version, checkedAt: Date.now() }));
      renameSync(tmp, cacheFile);
    } catch {
      // A machine where the temp dir cannot be written still gets the warning, just every session.
    }
    return version ?? null;
  } catch {
    return null; // offline or slow - silence, not a stale-version warning that could be wrong.
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Is `version` strictly behind `other`, comparing major.minor.patch numerically? Returns false
 * when either side cannot be read as a semver triple, so an unreadable version can never produce
 * an "update me" line: unknown is not the same as behind.
 * @param {string | null | undefined} version
 * @param {string | null | undefined} other
 * @returns {boolean}
 */
export function isBehind(version, other) {
  const triple = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v ?? ''));
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
  };
  const a = triple(version);
  const b = triple(other);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}
