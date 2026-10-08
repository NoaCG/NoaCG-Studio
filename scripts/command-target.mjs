// WHICH CHECKOUT DOES THIS SHELL COMMAND ACT ON? - the one place that decides.
//
// WHY IT EXISTS. Several worktrees of this repo are normally live at once, each with its OWN dev
// port, its own dist/ and its own branch. Anything that judges a command - the guard hook above
// all - has to answer that question about the checkout the command TARGETS, and the session's own
// directory is not that answer. Four separate defects on 2026-08-29 were the same mistake:
//
//   - `npm run test:e2e:integration:queued` was refused four times because the guard checked port
//     5174, the MAIN checkout's port, while the run it was about to allow would have used 5202,
//     this worktree's (https://github.com/NoaCG/NoaCG-Studio/blob/0eec5a83382bfa79c8593939690fa86de12372db/docs/handoffs/2026-08-29-cc-playout-polish.md). A session whose own
//     directory is the main checkout gets that refusal for as long as anybody has a dev server up
//     there, which is most of the time.
//   - the code-review skill reviewed a DIFFERENT worktree's branch three times, reporting findings
//     about somebody else's diff (https://github.com/NoaCG/NoaCG-Studio/blob/0eec5a83382bfa79c8593939690fa86de12372db/docs/handoffs/2026-08-29-dd-svg-fitting-two.md).
//   - `preview_start` serves whichever checkout the session sits in, so a sweep needing a dev
//     server could not be run from a session sitting elsewhere.
//
// Only the first is fixed by code alone; what they share is a tool reading the session's cwd where
// it meant the target's root. `scripts/hooks/session-start.mjs` already resolves the checkout the
// right way and comments that it is "correct per-worktree"; this module is that answer made
// reusable, and made to honour what the command itself says about where it will run.
//
// THE RULE, in order of authority:
//   1. an explicit `cd` / `pushd` / `Set-Location` chain in the command, resolved segment by
//      segment - `cd <worktree> && npm run test:e2e` acts on <worktree>, whatever the session's
//      own directory is;
//   2. an absolute path the command names for the thing it runs - `node C:/…/wt/scripts/l3-sweep.mjs`,
//      `npm --prefix C:/…/wt run x`, `--config C:/…/wt/playwright.config.ts`;
//   3. the base directory it was asked about (the session's cwd), which is right whenever the
//      command says nothing.
//
// The result is then turned into a CHECKOUT ROOT by git itself, so a path anywhere inside a
// worktree resolves to that worktree and a path outside every checkout resolves to nothing.

import { spawnSync } from 'node:child_process';
import { startableSegments } from './command-match.mjs';

// PATHS ARE HANDLED AS TEXT, NOT THROUGH `node:path`. What this module parses is a COMMAND LINE,
// and the paths inside one are written in whatever convention the machine that typed it uses -
// `C:/claude/...` and `C:\claude\...` here. `node:path` answers for the platform it is RUNNING on,
// so `isAbsolute('C:/repo')` is false on Linux and `dirname('C:\\a\\b')` is `.` there. That is
// invisible on this machine and fails in CI, which is where these tests actually run. Everything
// below is therefore textual over a forward-slash normalisation, and gives the same answer on
// either platform for either convention.

/** Forward slashes, no trailing separator - the shape every comparison here expects. */
export function normalizeDir(path) {
  return String(path).replaceAll('\\', '/').replace(/\/+$/, '');
}

/** Absolute in EITHER convention: `/usr/x`, `C:/x`, `C:\x`, `\\server\share`. */
function isAbsolutePath(path) {
  const p = String(path);
  return /^[A-Za-z]:[\\/]/.test(p) || /^[\\/]/.test(p);
}

/** The parent of a normalised path, textually - `C:/a/b/c.mjs` -> `C:/a/b`. */
function parentDir(path) {
  const p = normalizeDir(path);
  const cut = p.lastIndexOf('/');
  return cut <= 0 ? p : p.slice(0, cut);
}

/**
 * `base` with `rel` applied, resolving `.` and `..` textually. Used instead of `path.resolve`,
 * which would anchor a Windows-shaped base to the running process's cwd on Linux.
 */
function joinDir(base, rel) {
  if (isAbsolutePath(rel)) return normalizeDir(rel);
  const parts = normalizeDir(base).split('/');
  for (const piece of normalizeDir(rel).split('/')) {
    if (piece === '' || piece === '.') continue;
    if (piece === '..') {
      if (parts.length > 1) parts.pop();
      continue;
    }
    parts.push(piece);
  }
  return parts.join('/');
}

function unquote(value) {
  return value.replace(/^(['"])(.*)\1$/s, '$2');
}

/**
 * The directory a `cd`-shaped segment moves to, or null when the segment is not one (or is a
 * spelling we deliberately do not follow, like a bare `cd` or `cd -`).
 *
 * PowerShell's `Set-Location` and its `-Path` parameter are handled because that is this
 * machine's shell; `pushd` because it is what a script generator reaches for.
 */
export function changesDirTo(segment) {
  const match = /^(?:cd|chdir|pushd|Set-Location|sl)\s+(.+)$/i.exec(segment.trim());
  if (!match) return null;
  const rest = match[1].trim().replace(/^-(?:Path|LiteralPath)\s+/i, '');
  // A quoted path is ONE argument even though it holds spaces, so the quotes are read before the
  // split rather than after it - `cd "C:/path with spaces/wt"` is an ordinary shape on Windows.
  const first = /^(['"])(.*?)\1/.exec(rest);
  const target = first ? first[2] : unquote(rest.split(/\s+/)[0] ?? '');
  if (!target || target === '-' || target.startsWith('-')) return null;
  return target;
}

/**
 * An absolute checkout path the segment names for the thing it is about to run.
 *
 * Only ABSOLUTE paths count. A relative one adds nothing - it resolves against the same cwd we
 * already have - and treating it as a target would turn `node scripts/l3-sweep.mjs` into a claim
 * about a directory the command never mentioned.
 */
function namedPathIn(segment) {
  const prefix = /(?:^|\s)--prefix[=\s]+("[^"]*"|'[^']*'|\S+)/.exec(segment);
  if (prefix) {
    const path = unquote(prefix[1]);
    if (isAbsolutePath(path)) return normalizeDir(path);
  }
  // `node <abs>/scripts/<name>.mjs` - the script's own checkout is two levels up from the file.
  const script = /(?:^|\s)((?:[A-Za-z]:[\\/]|\/)[^\s"';|&]*[\\/]scripts[\\/][\w.-]+\.mjs)/.exec(segment);
  if (script) return parentDir(parentDir(script[1]));
  // `playwright test --config <abs>/playwright.<name>.config.ts` - the config sits at the root.
  const config = /--config[=\s]+("[^"]*"|'[^']*'|\S+)/.exec(segment);
  if (config) {
    const path = unquote(config[1]);
    if (isAbsolutePath(path)) return parentDir(path);
  }
  return null;
}

/**
 * The directory this command's work would run in, given the directory it was typed in.
 *
 * Answered off the STARTABLE segments (`command-match.mjs`), so a queued payload's own pieces
 * are read as the arguments they are rather than as invocations naming a target.
 */
export function targetDir(text, baseDir) {
  let cwd = normalizeDir(baseDir);
  for (const segment of startableSegments(text)) {
    const moved = changesDirTo(segment);
    if (moved !== null) {
      cwd = joinDir(cwd, moved);
      continue;
    }
    const named = namedPathIn(segment);
    if (named !== null) return named;
  }
  return cwd;
}

/**
 * The checkout root containing `dir`, per git, or null when there is none (or git cannot say).
 *
 * `--show-toplevel` answers with the WORKTREE's root inside a linked worktree, which is exactly
 * the distinction every caller here needs; nothing else git prints makes that split.
 */
export function checkoutRoot(dir) {
  if (!dir) return null;
  const res = spawnSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], {
    encoding: 'utf8',
    windowsHide: true,
  });
  if (res.status !== 0 || typeof res.stdout !== 'string') return null;
  const root = res.stdout.trim();
  return root ? normalizeDir(root) : null;
}

/**
 * The checkout this command acts on: its target's root, falling back to the base directory's own
 * root when the target is not inside a checkout (a `cd` into a temp folder, a path that does not
 * exist yet). Null only when neither is a git checkout at all.
 */
export function commandCheckout(text, baseDir) {
  return checkoutRoot(targetDir(text, baseDir)) ?? checkoutRoot(baseDir);
}

/**
 * A DEV_PORT the command sets for itself, in the three spellings this repo's two shells use.
 *
 * `DEV_PORT=n` overrides every other resolution (scripts/dev-port.mjs), so a judgement about
 * which port a command will use has to read it. It is taken from the RAW text rather than from a
 * segment, because the segmenter strips exactly this prefix before matching invocations.
 */
export function devPortOverride(text) {
  const match =
    /(?:^|[\s;&|])(?:set\s+)?DEV_PORT\s*=\s*(\d{2,5})\b/.exec(text) ??
    /\$env:DEV_PORT\s*=\s*["']?(\d{2,5})["']?/.exec(text);
  if (!match) return null;
  const port = Number(match[1]);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : null;
}
