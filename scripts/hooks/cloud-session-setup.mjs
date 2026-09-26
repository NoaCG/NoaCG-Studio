// SessionStart hook: make a fresh checkout able to build before the first command, so no session
// spends its first minutes rediscovering the same gaps. Steps 0 and 1 run everywhere - a fresh cloud
// container and a fresh local worktree alike (the desktop app creates one per scheduled run and per
// worktree session, with no node_modules); step 2 only in the cloud (`CLAUDE_CODE_REMOTE=true`).
//
//   0. FRESHNESS. The desktop app cuts a new worktree from ITS last fetch of main, which can be a
//      landing or more behind (measured 2026-09-26: a scheduled run started on 07352ec8 three
//      minutes after 63406104 landed). A worktree that is behind, clean, and has no commits of its
//      own is fast-forwarded to origin/main here, before any tool runs. Measured on 2026-09-26 with
//      a session started 24 commits behind: folder guidance (nested CLAUDE.md/AGENTS.md and
//      .claude/rules) is read from disk when a file is read, so it arrives current; the ROOT
//      CLAUDE.md/AGENTS.md was read at launch, before any hook, so it is stale in context and is
//      re-printed below when it changed. What still comes from the starting commit is what the
//      client read at launch: this session's hooks, permissions and skill list. Never the primary
//      checkout (the merge queue runs there), never a detached HEAD, a dirty tree or a branch with
//      its own commits - those are only reported. It runs before step 1 so the install reads the
//      lockfile it will build with.
//
//   1. DEPENDENCIES. The container is a fresh clone with no node_modules, at the root or in cli/,
//      and `npm run build` cannot start without them. `npm ci` from the lockfile, only when a
//      tree is missing - the container is cached after this hook finishes, so the next session
//      finds them and this step costs nothing. `npm ci` rather than `npm install`, because an
//      install may rewrite package-lock.json and leave every session a dirty tree to explain.
//
//   2. THE PINNED CHROMIUM. The repository pins a Playwright whose Chromium build can be newer
//      than the one baked into the cloud image (/opt/pw-browsers), and `playwright install` is
//      not an option there (no download, by the environment's own rule). Measured 2026-09-23:
//      Playwright wanted build 1228 and the image had 1194, so every browser spec died at launch
//      with "Executable doesn't exist". The image's build drives the suite fine, so the pinned
//      path is made to point at it: the directory Playwright looks for is created with links to
//      the image's files, under the executable names the newer layout expects. A real install of
//      the pinned build, whenever the image has one, is left alone.
//
//   3. Nothing else.
//
// Everything here is idempotent and prints one line per thing it changed; SessionStart output
// becomes part of the session's context, so a quiet run means there was nothing to do.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readHookInput } from './lib.mjs';

const BROWSERS_DIR = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

/**
 * The two Chromium builds Playwright launches, with where each keeps its executable: the layout
 * of the newer builds the repository pins, and the older layout the cloud image ships. Every other
 * file in the old folder is linked across unchanged.
 */
export const CHROMIUM_LAYOUTS = [
  {
    name: 'chromium',
    folder: 'chromium',
    newDir: 'chrome-linux64',
    newExe: 'chrome',
    oldDir: 'chrome-linux',
    oldExe: 'chrome',
  },
  {
    name: 'chromium-headless-shell',
    folder: 'chromium_headless_shell',
    newDir: 'chrome-headless-shell-linux64',
    newExe: 'chrome-headless-shell',
    oldDir: 'chrome-linux',
    oldExe: 'headless_shell',
  },
];

/** The build numbers the installed Playwright wants, by browser name, read from its own table. */
export function pinnedRevisions(root) {
  const table = join(root, 'node_modules', 'playwright-core', 'browsers.json');
  if (!existsSync(table)) return {};
  const { browsers } = JSON.parse(readFileSync(table, 'utf8'));
  return Object.fromEntries(browsers.map((b) => [b.name, b.revision]));
}

/**
 * Point each missing pinned build at the newest build the image does have. Returns what it
 * linked, as `folder-wanted -> folder-used`; an empty list means nothing was missing or there was
 * nothing to point at.
 */
export function aliasPinnedChromium(browsersDir, revisions) {
  if (!existsSync(browsersDir)) return [];
  const linked = [];
  for (const layout of CHROMIUM_LAYOUTS) {
    const wanted = revisions[layout.name];
    if (!wanted) continue;
    const target = join(browsersDir, `${layout.folder}-${wanted}`);
    if (existsSync(join(target, layout.newDir, layout.newExe))) continue;
    // The newest older build that ships the old layout.
    const source = readdirSync(browsersDir)
      .map((entry) => ({ entry, rev: Number(entry.slice(layout.folder.length + 1)) }))
      .filter(({ entry, rev }) => entry.startsWith(`${layout.folder}-`) && Number.isInteger(rev) && String(rev) !== wanted)
      .filter(({ entry }) => existsSync(join(browsersDir, entry, layout.oldDir, layout.oldExe)))
      .sort((a, b) => b.rev - a.rev)[0];
    if (!source) continue;
    const from = join(browsersDir, source.entry, layout.oldDir);
    const into = join(target, layout.newDir);
    mkdirSync(into, { recursive: true });
    for (const file of readdirSync(from)) {
      if (!existsSync(join(into, file))) symlinkSync(join(from, file), join(into, file));
    }
    if (!existsSync(join(into, layout.newExe))) symlinkSync(join(from, layout.oldExe), join(into, layout.newExe));
    // Playwright reads these two markers as "this build is installed and its libraries checked".
    for (const marker of ['INSTALLATION_COMPLETE', 'DEPENDENCIES_VALIDATED']) {
      const src = join(browsersDir, source.entry, marker);
      if (existsSync(src) && !existsSync(join(target, marker))) symlinkSync(src, join(target, marker));
    }
    linked.push(`${layout.folder}-${wanted} -> ${source.entry}`);
  }
  return linked;
}

/**
 * Step 0: fast-forward a fresh worktree to origin/main when that is unambiguously safe.
 * Returns one line to print (empty when there was nothing to say) and whether the lockfile moved.
 * @param {string} fallbackRoot the checkout this hook ships in, used when the input names no cwd
 * @param {{ source?: string, cwd?: string }} [hook] the SessionStart input; only a fresh
 *   `startup` is touched, and the checkout is the session's own (its cwd's top level)
 */
export function freshen(fallbackRoot, hook = {}) {
  const quiet = { line: '', lockMoved: false };
  // A resumed or compacted session is mid-work; moving its tree under it would surprise it.
  if (hook.source && hook.source !== 'startup') return quiet;
  const top = hook.cwd ? spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: hook.cwd, encoding: 'utf8' }) : null;
  const root = top?.status === 0 ? top.stdout.trim() : fallbackRoot;
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  const read = (...args) => {
    const res = git(...args);
    return res.status === 0 ? res.stdout.trim() : null;
  };
  const gitDir = read('rev-parse', '--absolute-git-dir');
  const commonDir = read('rev-parse', '--git-common-dir');
  // The primary checkout (its git dir IS the common dir) belongs to the merge queue.
  if (!gitDir || !commonDir || resolve(gitDir) === resolve(root, commonDir)) return quiet;
  const branch = read('symbolic-ref', '--quiet', '--short', 'HEAD');
  if (!branch) return quiet; // a detached HEAD is pinned on purpose
  if (git('fetch', '--quiet', 'origin', 'main').status !== 0) {
    return { line: 'Freshness: could not fetch origin/main, so this checkout may be behind it. Fetch and compare before relying on it.', lockMoved: false };
  }
  const start = read('rev-parse', 'HEAD');
  const behind = Number(read('rev-list', '--count', 'HEAD..origin/main') ?? 0);
  if (!start || behind === 0) return quiet;
  const own = Number(read('rev-list', '--count', 'origin/main..HEAD') ?? 0);
  const dirty = read('status', '--porcelain', '--untracked-files=no') !== '';
  if (own > 0 || dirty) {
    return {
      line: `Freshness: ${branch} is ${behind} commit(s) behind origin/main and holds its own work, so it was left as it is. Merge origin/main before relying on this checkout's instructions.`,
      lockMoved: false,
    };
  }
  const lockBefore = read('rev-parse', 'HEAD:package-lock.json');
  if (git('merge', '--ff-only', '--quiet', 'origin/main').status !== 0) {
    return { line: `Freshness: ${branch} is ${behind} commit(s) behind origin/main and the fast-forward failed. Merge origin/main by hand before starting work.`, lockMoved: false };
  }
  const now = read('rev-parse', 'HEAD') ?? '';
  let line = `Freshness: this worktree started ${behind} commit(s) behind origin/main at ${start.slice(0, 8)} and was fast-forwarded to ${now.slice(0, 8)}.`;
  // The client read the root CLAUDE.md and AGENTS.md at launch, BEFORE this hook ran (measured:
  // a fast-forwarded session still quoted the old root rules), so those two alone are stale in
  // context. Folder guidance loads when a file is read and is already current. Print the current
  // root contract, which is small by design, so the session works from it.
  if (git('diff', '--quiet', start, 'HEAD', '--', 'AGENTS.md', 'CLAUDE.md').status !== 0) {
    line += '\nThe root AGENTS.md changed since that commit, and the copy in your startup instructions is the OLD one.'
      + ' The current root AGENTS.md follows. It REPLACES the startup copy for this whole session:\n\n'
      + readFileSync(join(root, 'AGENTS.md'), 'utf8').trim();
  }
  return { line, lockMoved: read('rev-parse', 'HEAD:package-lock.json') !== lockBefore };
}

/**
 * `npm ci` in `dir` when it has a lockfile and no FINISHED install, or when `force` says the
 * lockfile just changed under an existing install. npm writes node_modules/.package-lock.json
 * last, so an install that died part way leaves a node_modules without it and the next session
 * start tries again (`npm ci` clears the partial tree itself).
 */
function installIfMissing(dir, label, { force = false } = {}) {
  if (!existsSync(join(dir, 'package-lock.json'))) return;
  if (!force && existsSync(join(dir, 'node_modules', '.package-lock.json'))) return;
  // npm is a .cmd file on Windows, which only a shell can start - given one fixed command string,
  // so no argument is ever concatenated into a shell line.
  const run = process.platform === 'win32'
    ? spawnSync('npm ci --no-audit --no-fund', { cwd: dir, stdio: 'ignore', shell: true })
    : spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'ignore' });
  console.log(
    run.status === 0
      ? `Setup: installed ${label} dependencies (npm ci).`
      : `Setup: npm ci in ${label} FAILED (exit ${run.status}) - run it by hand before building.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The checkout this hook ships in - the settings start it from the current checkout's top level.
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  // A person running this by hand has no hook event to pipe in; waiting on the terminal would hang.
  const fresh = freshen(root, (process.stdin.isTTY ? null : await readHookInput()) ?? {});
  if (fresh.line) console.log(fresh.line);
  installIfMissing(root, 'root', { force: fresh.lockMoved });
  if (process.env.CLAUDE_CODE_REMOTE === 'true') {
    installIfMissing(join(root, 'cli'), 'cli/');
    const linked = aliasPinnedChromium(BROWSERS_DIR, pinnedRevisions(root));
    if (linked.length > 0) {
      console.log(`Cloud setup: Playwright's pinned Chromium pointed at the image's build (${linked.join(', ')}).`);
    }
  }
}
