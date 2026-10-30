// ARCHIVE-BEFORE-DELETE for worktree cleanup: the half of the mechanism that lets a machine,
// rather than a person, decide a finished worktree is disposable.
//
// WHY THIS EXISTS. `git status --porcelain` - the clean-tree test every deletion guard relies
// on - says nothing about ignored files, and `git worktree remove` deletes them anyway. Most
// ignored content is rebuildable (`node_modules/`, `dist/`) and some is a secret the repo can
// hand out again (`.env`), but a third kind is neither: bench rounds that cost real money,
// generated galleries, eval results. Two paid rounds have already been destroyed by ordinary
// worktree cleanup (see the archive's own README). Losing those is exactly the risk that used
// to be answered by "a human starts every cleanup"; this module answers it instead.
//
// THE VERIFY IS THE POINT, NOT THE COPY. A partial copy nobody checked is worse than no copy,
// because it reads as a safe round and nothing ever looks again. So the copy is proven before
// the caller is allowed to delete anything:
//   1. the recursive FILE COUNT matches, and
//   2. every relative path matches, and
//   3. every file's BYTE SIZE matches at that path, and
//   4. SHA-256 contents and link targets match, and the source remains unchanged.
// Any disagreement returns `ok: false` and the caller must refuse the removal. There is no
// flag that overrides a failed verification - an archive nobody checked is not an archive.
//
// WHERE IT WRITES. C:/claude/noacg-archives, outside the repo, override with
// NOACG_CLEANUP_ARCHIVE. That folder is the GENERAL archive; the two round-shaped archives on
// this machine (noacg-bench-archive, noacg-lite-eval-archive) are indexed by ROUND, one dated
// folder per deliberate paid run, and dropping whatever ignored content a worktree happened to
// hold into them would corrupt that index. Worktree cleanup archives leftovers, not rounds.
//
// The source is never modified, never moved and never deleted here. Deleting is the caller's
// step, and only after this module says the copy is provably complete.

import { createHash } from 'node:crypto';
import { closeSync, cpSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readSync, readdirSync, readlinkSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

/** Environment override for the archive root, so nothing about the location is hardcoded. */
export const ARCHIVE_ROOT_ENV = 'NOACG_CLEANUP_ARCHIVE';

/**
 * The general (non-round) archive. Outside the repo on purpose. `C:/claude/...` is not an
 * absolute path to POSIX `resolve`, which would quietly create a directory literally named `C:`
 * inside whatever checkout ran, so the default is per-platform.
 */
export const DEFAULT_ARCHIVE_ROOT =
  process.platform === 'win32' ? 'C:/claude/noacg-archives' : join(homedir(), 'noacg-archives');

/**
 * Paths that are SECRETS: never read, never printed, never copied, never archived.
 *
 * This list lives HERE, in the module that does the copying, because it is the code that could
 * violate the rule. It is matched against every path inside a directory being archived, not only
 * against the ignored entry's own name: `git status --ignored=matching` collapses an ignored
 * directory to one line, so a `.env` inside `bench-out/` is never named by git at all and would
 * otherwise ride along in the copy.
 */
export const SECRET_PATTERNS = [
  /(^|\/)\.env($|\.)/i, // .env, .env.local, .env.bench.local
  /(^|\/)\.mcp\.json$/i,
  /(^|\/)\.npmrc$/i,
  /(^|\/)\.netrc$/i,
  /(^|\/)\.lite-token$/i, // .gitignore: "a real bearer token, never committed"
  /(^|\/)\.vercel($|\/)/i, // project + org ids
  /(^|\/)[^/]+\.pem$/i,
  /(^|\/)[^/]+\.key$/i,
  /(^|\/)id_(rsa|ed25519)/i,
];

export function isSecretPath(path) {
  return SECRET_PATTERNS.some((pattern) => pattern.test(path));
}

/** Everything this mechanism writes lives under one subfolder, never loose in the root. */
export const ARCHIVE_SUBDIR = 'worktree-cleanup';

/**
 * Above this, an unattended run refuses and reports instead of copying. Not a safety rule - a
 * politeness one: an autonomous sweep that silently copies gigabytes is indistinguishable from
 * a hung sweep, and the human it would have to wait for is the one this exists to stop needing.
 */
export const ARCHIVE_BYTES_CEILING = 2 * 1024 * 1024 * 1024;

export function archiveRoot({ env = process.env } = {}) {
  const configured = env[ARCHIVE_ROOT_ENV];
  return normalizePath(configured && configured.trim() ? configured.trim() : DEFAULT_ARCHIVE_ROOT);
}

function normalizePath(path) {
  return resolve(path).replaceAll('\\', '/');
}

/** Today, as the archive's dated folder name. */
export function archiveDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Every entry under `target`, as `{ path, bytes, kind }` with forward-slashed paths relative to
 * it, sorted. A single FILE returns one entry named `''` - the ignored entries git reports are a
 * mix of files (`.env`, `dev-bench.log`) and directories (`lite-eval-out/`), and both have to
 * compare the same way on both sides of the copy.
 *
 * Symlinks and Windows junctions are LISTED (`kind: 'link'`, zero bytes) rather than followed or
 * skipped. Following them would double-count bytes or leave the tree entirely; skipping them
 * made both sides of the proof blind to the same thing, so a copy that turned a link into files -
 * or lost one - verified clean. npm workspaces and `npm link` create these routinely.
 */
export function walkFiles(target, { hashContents = false } = {}) {
  let root;
  try {
    root = lstatSync(target);
  } catch {
    return null; // vanished or unreadable - the caller turns this into a refusal
  }
  if (root.isSymbolicLink()) {
    try { return [{ path: '', bytes: 0, kind: 'link', target: readlinkSync(target) }]; } catch { return null; }
  }
  if (!root.isDirectory()) {
    if (!root.isFile() || (hashContents && isSecretPath(target.replaceAll('\\', '/')))) return null;
    const digest = hashContents ? hashFile(target) : null;
    return hashContents && !digest ? null : [{ path: '', bytes: root.size, kind: 'file', ...(hashContents ? { sha256: digest } : {}) }];
  }

  const files = [];
  const stack = [target];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const path = relative(target, full).split(sep).join('/');
      if (entry.isSymbolicLink()) {
        try { files.push({ path, bytes: 0, kind: 'link', target: readlinkSync(full) }); } catch { return null; }
      } else if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        let stat;
        try {
          stat = statSync(full);
        } catch {
          return null;
        }
        files.push({ path, bytes: stat.size, kind: 'file' });
      }
    }
  }
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  // Inspect the entire name set before opening any content. A newly appeared secret
  // refuses verification instead of being read for a hash or copied into a receipt.
  if (hashContents) {
    if (files.some((file) => isSecretPath(file.path))) return null;
    for (const file of files) {
      if (file.kind !== 'file') continue;
      file.sha256 = hashFile(join(target, file.path));
      if (!file.sha256) return null;
    }
  }
  return files;
}

/** Bounded-memory content proof; a file modified while being read cannot verify. */
function hashFile(path) {
  let fd;
  try {
    const before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink()) return null;
    fd = openSync(path, 'r');
    const opened = fstatSync(fd);
    if (opened.ino !== before.ino || opened.dev !== before.dev) return null;
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let bytes;
    while ((bytes = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, bytes));
    const after = fstatSync(fd);
    const current = lstatSync(path);
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs ||
        current.ino !== before.ino || current.dev !== before.dev || current.size !== before.size ||
        current.mtimeMs !== before.mtimeMs || current.ctimeMs !== before.ctimeMs) return null;
    return hash.digest('hex');
  } catch { return null; } finally { if (fd !== undefined) closeSync(fd); }
}

/** The *.json / *.jsonl half of a file list - the irreplaceable records, as opposed to frames. */
export function structuredFiles(files) {
  return files.filter((file) => /\.(json|jsonl)$/i.test(file.path));
}

function totalBytes(files) {
  return files.reduce((sum, file) => sum + file.bytes, 0);
}

/**
 * The folder a worktree gets inside the archive: its basename plus a short hash of its FULL
 * path, because two checkouts can hold worktrees with the same basename and the archive must
 * never merge two different worktrees' output into one folder.
 */
export function worktreeLabel(worktreePath) {
  const full = normalizePath(worktreePath);
  const name = (basename(full) || 'worktree').replace(/[^a-z0-9_.-]+/gi, '-');
  let hash = 5381;
  for (let i = 0; i < full.length; i += 1) hash = ((hash * 33) ^ full.toLowerCase().charCodeAt(i)) >>> 0;
  return `${name}-${hash.toString(36).padStart(7, '0').slice(-7)}`;
}

/**
 * Plan the archiving of one worktree's non-rebuildable ignored content.
 *
 * `entries` are the classified VALUABLE paths (never secrets - a secret is deleted where it
 * lies and copying one would only spread it). Returns
 * `{ ok, refuse, destination, items, files, bytes }`; `ok: false` means the caller must not
 * remove the worktree.
 */
export function planArchive({
  worktreePath,
  entries,
  root = archiveRoot(),
  date = archiveDate(),
  ceiling = ARCHIVE_BYTES_CEILING,
  exists = existsSync,
} = {}) {
  const destination = join(root, ARCHIVE_SUBDIR, date, worktreeLabel(worktreePath)).replaceAll('\\', '/');
  const plan = { ok: true, refuse: null, destination, items: [], files: 0, bytes: 0 };
  if (!entries || entries.length === 0) return { ...plan, destination: null };

  for (const entry of entries) {
    const relativePath = String(entry.path ?? entry).replace(/\/+$/, '');
    const source = join(worktreePath, relativePath);
    const files = walkFiles(source);
    if (files === null) {
      return {
        ...plan,
        ok: false,
        refuse: `${relativePath} could not be read, so its copy could never be proven complete`,
      };
    }
    // git collapses an ignored DIRECTORY to a single porcelain line, so this is the only place a
    // secret buried inside one is ever seen. Refusing beats filtering: a filtered copy is no
    // longer comparable to its source, and the whole guarantee here is that the copy is provable.
    const secret = files.find((file) => isSecretPath(file.path ? `${relativePath}/${file.path}` : relativePath));
    if (secret) {
      return {
        ...plan,
        ok: false,
        refuse:
          `${relativePath} contains what looks like a secret (${secret.path || relativePath}) - ` +
          'archiving it would copy the secret out of the repo, so this worktree needs a person',
      };
    }
    plan.items.push({
      path: relativePath,
      source: normalizePath(source),
      destination: join(destination, relativePath).replaceAll('\\', '/'),
      files: files.length,
      bytes: totalBytes(files),
    });
  }

  if (exists(destination)) {
    // Never overwrite - but "it already exists" is not automatically a refusal. A verified copy
    // whose `git worktree remove` then failed, or a run killed between the two, leaves a folder
    // that is byte-identical to the source; refusing that forever turned one busy folder into a
    // permanent human decision. So the existing copy is PROVEN instead, exactly as a fresh one
    // would be, and only a copy that does not match is refused.
    const mismatch = verifyExisting(plan);
    if (mismatch) {
      return {
        ...plan,
        ok: false,
        refuse:
          `${destination} already exists and is not a faithful copy (${mismatch}) - an archived ` +
          'folder is never overwritten',
      };
    }
    plan.alreadyArchived = true;
  }

  plan.files = plan.items.reduce((sum, item) => sum + item.files, 0);
  plan.bytes = plan.items.reduce((sum, item) => sum + item.bytes, 0);

  if (plan.bytes > ceiling) {
    return {
      ...plan,
      ok: false,
      refuse:
        `${formatBytes(plan.bytes)} of unrecoverable output is more than an unattended run ` +
        `copies (ceiling ${formatBytes(ceiling)}) - archive it deliberately, then rerun`,
    };
  }
  return plan;
}

/**
 * Execute an archive plan and PROVE the copy, item by item. Returns
 * `{ ok, reason, destination, files, bytes, verified }`. The source is untouched either way,
 * so a refusal costs nothing but a rerun.
 */
export function archiveAndVerify(plan, { copy = cpSync, makeDir = mkdirSync, quarantine = quarantinePartial } = {}) {
  const done = { ok: false, reason: null, destination: plan.destination, files: 0, bytes: 0, verified: [], reused: false };
  if (!plan.ok) {
    done.reason = plan.refuse ?? 'the archive plan was refused';
    return done;
  }
  if (plan.items.length === 0) {
    done.ok = true;
    return done;
  }

  const fail = (reason) => {
    // Never delete: the half-copy is quarantined under a name no later plan can pick, so the
    // evidence survives AND the next run is not blocked by a folder it cannot tell from a good
    // archive. If even that fails, say so - the operator has to know the name is now taken.
    const moved = quarantine(plan.destination);
    done.reason = moved.ok
      ? `${reason}${moved.to ? ` (the partial copy is at ${moved.to})` : ''}`
      : `${reason}; the partial copy at ${plan.destination} could not be set aside (${moved.why})`;
    return done;
  };

  for (const item of plan.items) {
    const before = walkFiles(item.source, { hashContents: true });
    if (before === null) return fail(`${item.path} became unreadable before it was copied`);

    if (!plan.alreadyArchived) {
      try {
        makeDir(dirname(item.destination), { recursive: true });
        copy(item.source, item.destination, { recursive: true, verbatimSymlinks: true });
      } catch (error) {
        return fail(`copying ${item.path} failed: ${error?.message ?? error}`);
      }
    }

    const after = walkFiles(item.destination, { hashContents: true });
    if (after === null) return fail(`${item.path} was copied but the archived copy cannot be read back`);
    const mismatch = compareTrees(before, after);
    // The source is still there. Nothing may be deleted on the strength of this copy.
    if (mismatch) return fail(`${item.path} did not archive faithfully: ${mismatch}`);

    const stable = walkFiles(item.source, { hashContents: true });
    if (stable === null || compareTrees(before, stable)) return fail(`${item.path}: source changed during copying - nothing removed`);

    done.verified.push({
      path: item.path,
      destination: item.destination,
      files: after.length,
      bytes: totalBytes(after),
      structured: structuredFiles(after).length,
      algorithm: 'sha256',
    });
    done.files += after.length;
    done.bytes += totalBytes(after);
  }

  done.ok = true;
  done.reused = Boolean(plan.alreadyArchived);
  return done;
}

/** Move a failed copy aside under a name no plan will generate. Never deletes anything. */
function quarantinePartial(destination) {
  if (!destination || !existsSync(destination)) return { ok: true, to: null };
  const to = `${destination}.unverified-${Date.now().toString(36)}`;
  try {
    renameSync(destination, to);
    return { ok: true, to };
  } catch (error) {
    return { ok: false, to: null, why: error?.message ?? String(error) };
  }
}

/** Why an EXISTING destination is not already a faithful copy of the plan's sources, or null. */
function verifyExisting(plan) {
  for (const item of plan.items) {
    const before = walkFiles(item.source, { hashContents: true });
    const after = walkFiles(item.destination, { hashContents: true });
    if (before === null) return `${item.path} could not be read`;
    if (after === null) return `${item.path} is missing from it`;
    const mismatch = compareTrees(before, after);
    if (mismatch) return `${item.path}: ${mismatch}`;
    const stable = walkFiles(item.source, { hashContents: true });
    if (stable === null || compareTrees(before, stable)) return `${item.path}: source changed during verification`;
  }
  return null;
}

/**
 * Why two file lists are not the same tree, or null when they are. Counts first (the cheapest
 * and commonest failure), then paths, then per-file kinds, sizes, link targets and SHA-256 contents.
 */
export function compareTrees(source, archived) {
  if (source.length !== archived.length) {
    return `${source.length} file(s) in the source, ${archived.length} archived`;
  }
  for (let i = 0; i < source.length; i += 1) {
    if (source[i].path !== archived[i].path) {
      return `path ${source[i].path || '(the file itself)'} is missing from the archive`;
    }
    if ((source[i].kind ?? 'file') !== (archived[i].kind ?? 'file')) {
      return `${source[i].path || '(the file itself)'} is a ${source[i].kind} in the source and a ${archived[i].kind} archived`;
    }
    if (source[i].target !== archived[i].target) return `${source[i].path || '(the link itself)'} has a different link target`;
    if (source[i].sha256 !== archived[i].sha256) return `${source[i].path || '(the file itself)'} content differs (SHA-256)`;
    if (source[i].bytes !== archived[i].bytes) {
      return `${source[i].path || '(the file itself)'} is ${source[i].bytes} bytes in the source and ${archived[i].bytes} archived`;
    }
  }
  const from = totalBytes(source);
  const to = totalBytes(archived);
  if (from !== to) return `${from} bytes in the source, ${to} archived`;
  return null;
}


/** Human-readable byte count for the reports. */
export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)}${units[unit]}`;
}
