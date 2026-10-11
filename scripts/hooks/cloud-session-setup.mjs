// SessionStart hook: make a fresh checkout able to build before the first command, so no session
// spends its first minutes rediscovering the same gaps. Steps 0 and 1 run everywhere - a fresh cloud
// container and a fresh local worktree alike (the desktop app creates one per scheduled run and per
// worktree session, with no node_modules); steps 2 to 4 only in the cloud (`CLAUDE_CODE_REMOTE=true`).
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
//   3. GITHUB ACCESS. A cloud container reaches GitHub only through the claude.ai GitHub
//      connection, and on 2026-09-28 it lapsed: push, fetch and the GitHub tools all failed with
//      "could not read Username for 'https://github.com'", and a finished row sat unlanded until
//      the owner reconnected. `git ls-remote --heads origin main` (read-only; the repository is
//      private, so reading it needs the connection too) runs first in this hook, with prompts off
//      and a 6-second cap, on every SessionStart (a resume or compact re-probes too; it costs
//      about a second). A refusal prints a banner the session must relay to the owner before
//      anything else; a timeout, proxy, DNS or server failure says it is the network instead;
//      success prints nothing. Neither a credential nor git's own text is ever echoed - only a
//      fixed label. A start hook cannot catch a lapse DURING the session: the orchestrator's
//      watch loop should re-run that probe before launching a row or queueing a landing.
//
//   4. A STALE LOCAL MAIN. A fresh cloud clone can carry a local `main` that is not an ancestor of
//      origin/main - diverged history from whatever the container was cut from, or history a
//      shallow clone cut off. Measured 2026-09-29 in a shallow clone: local main had no merge base
//      with origin/main, `mainRef` therefore answered `main`, and `/check` refused to scope a
//      review. Nothing but the merge queue lands on `main`, so such a ref holds no one's work: it
//      is moved, ref alone and with no checkout, to origin/main's own tip (fetched with prompts
//      off and capped, only when the copy on disk does not already contain it). That lands
//      nothing; it realigns the local ref with what already landed. The old commit is printed so
//      it can be found again. Only when local `main` exists, no worktree has it checked out, and
//      it is NOT an ancestor of origin/main. A `main` that is merely behind is left as it is
//      (`mainRef` already answers origin/main for it), and so is one strictly AHEAD, whose extra
//      commits may be someone's work. Any git failure prints one line and moves nothing.
//
//   5. Nothing else.
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
  const top = hook.cwd ? spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: hook.cwd, encoding: 'utf8', windowsHide: true }) : null;
  const root = top?.status === 0 ? top.stdout.trim() : fallbackRoot;
  const git = (...args) => spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
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

export const GITHUB_PROBE_TIMEOUT_MS = 6000;
const RECONNECT_URL = 'https://claude.ai/connect-github';

/**
 * What git's error text means, in order, as fixed labels - the label is printed, never the text.
 * Account refusals first, then the network, then this checkout's own setup. The egress proxy's own
 * refusal ("CONNECT tunnel failed, response 403", measured 2026-09-28) is a blocked route, not a
 * refused account, and a bare 403 is left unclassified: the git proxy answers 403 to policy
 * refusals too.
 */
const SIGNS = [
  [/could not read (Username|Password)/i, 'auth', 'GitHub asked for credentials git does not have: "could not read Username"'],
  [/not connected a GitHub account/i, 'auth', 'the session owner has no connected GitHub account'],
  [/Authentication failed|Invalid username or (password|token)|error: 401\b|Permission denied \(publickey\)/i, 'auth', 'GitHub refused the credentials'],
  [/CONNECT tunnel failed|from proxy after CONNECT|Proxy CONNECT aborted/i, 'network', 'the proxy refused or dropped the connection'],
  [/Could not resolve (host|proxy)/i, 'network', 'github.com did not resolve'],
  [/error: 5\d\d\b/i, 'network', 'GitHub answered with a server error'],
  [/Failed to connect|Connection (refused|reset|timed out)|Operation timed out|RPC failed|early EOF|hung up|Empty reply|not closed cleanly|recv error|transfer closed|SSL/i, 'network', 'the connection to github.com failed'],
  [/does not appear to be a git repository|No such remote|not a git repository/i, 'local', "this checkout's origin is not a remote the check can reach"],
];

export const MAIN_FETCH_TIMEOUT_MS = 30000;

/** One git command in `root`, prompts off and killed at the cap; a non-zero exit is returned, not thrown. */
function runGit(root, args, timeout = MAIN_FETCH_TIMEOUT_MS) {
  return spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGKILL',
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never' },
    windowsHide: true,
  });
}

/** `git ls-remote` against origin. Replaced in tests. */
const lsRemoteOrigin = (root, timeout) => runGit(root, ['ls-remote', '--heads', 'origin', 'main'], timeout);

/**
 * Step 3: one line about GitHub access, empty when it works. Never throws.
 * @param {string} root the checkout whose `origin` is probed
 * @param {{ probe?: (root: string, timeout: number) => { status: number | null, stderr?: string, error?: { code?: string } }, timeoutMs?: number }} [options]
 */
export function githubAccessLine(root, { probe = lsRemoteOrigin, timeoutMs = GITHUB_PROBE_TIMEOUT_MS } = {}) {
  let res;
  try {
    res = probe(root, timeoutMs);
  } catch (error) {
    res = { status: null, error };
  }
  if (res.status === 0) return '';
  const unreachable = (why) => `GITHUB UNREACHABLE - ${why}; that looks like the network, not a disconnected account.`
    + ' Push, pull requests and landing may fail. Re-run `git ls-remote origin main` before relying on GitHub,'
    + ` and if it still fails, tell the owner FIRST, before any other work (and reconnect at ${RECONNECT_URL} if it turns out to be the account).`;
  const couldNotRun = (why) => `GitHub check could not run (${why}); it says nothing about the GitHub connection.`;
  if (res.error?.code === 'ETIMEDOUT') return unreachable(`\`git ls-remote origin\` did not answer within ${timeoutMs / 1000} s`);
  if (res.error) return couldNotRun('git did not start');
  const [, kind, why] = SIGNS.find(([sign]) => sign.test(res.stderr ?? '')) ?? [];
  if (kind === 'local') return couldNotRun(why);
  if (kind === 'network') return unreachable(why);
  if (kind === 'auth') {
    return `GITHUB NOT CONNECTED - push, pull requests and landing will fail (${why}). Reconnect at ${RECONNECT_URL} before starting work.`
      + ' Tell the owner this FIRST, as the opening line of your first reply, before any other work.';
  }
  return `GITHUB CHECK FAILED - \`git ls-remote origin\` exited ${res.status ?? 'abnormally'} for a reason this check does not recognise (neither a clear refusal nor a clear network error).`
    + ` Push and landing may fail: tell the owner FIRST, before any other work, and suggest reconnecting at ${RECONNECT_URL}.`;
}

/**
 * Step 4: move a local `main` that is not an ancestor of origin/main to origin/main, by ref alone.
 * Returns one line to print, empty when there was nothing to do. Never throws.
 * @param {string} root the checkout whose repository holds `main`
 * @param {{ git?: (root: string, args: string[]) => { status: number | null, stdout?: string } }} [options]
 */
export function realignStaleMain(root, { git = runGit } = {}) {
  const couldNot = (what) => `Main: could not ${what}, so local main was left as it is. Compare against origin/main, not main.`;
  try {
    const read = (...args) => {
      const res = git(root, args);
      return res.status === 0 ? (res.stdout ?? '').trim() : null;
    };
    const was = read('rev-parse', '--verify', '--quiet', 'refs/heads/main^{commit}');
    if (!was) return ''; // no local main: nothing to be stale
    const worktrees = read('worktree', 'list', '--porcelain');
    if (worktrees === null) return couldNot('list the worktrees');
    // A checked-out main belongs to that checkout (the primary one runs the merge queue).
    if (worktrees.split('\n').some((line) => line.trim() === 'branch refs/heads/main')) return '';
    const originMain = () => read('rev-parse', '--verify', '--quiet', 'refs/remotes/origin/main^{commit}');
    const contains = (older, newer) => git(root, ['merge-base', '--is-ancestor', older, newer]).status;
    // origin/main only moves forward, so a main the copy on disk already contains needs no fetch.
    const known = originMain();
    if (known && contains(was, known) === 0) return '';
    // An explicit refspec, so a clone whose fetch refspec leaves main out still updates origin/main.
    if (git(root, ['fetch', '--quiet', '--no-tags', 'origin', '+refs/heads/main:refs/remotes/origin/main']).status !== 0) {
      return couldNot('fetch origin/main');
    }
    const target = originMain();
    if (!target) return couldNot('read origin/main');
    const ancestor = contains(was, target);
    if (ancestor === 0) return ''; // equal or merely behind: not this step's to move
    if (ancestor !== 1) return couldNot('compare main with origin/main');
    // Strictly AHEAD of origin/main means commits on top of it that never landed: someone's work.
    if (contains(target, was) === 0) {
      return `Main: local main at ${was.slice(0, 8)} holds commits origin/main does not, so it was left as it is. Compare against origin/main, not main, and move that work to a branch.`;
    }
    // update-ref checks the old value itself, so a concurrent move is refused rather than overwritten.
    if (git(root, ['update-ref', '-m', 'cloud-session-setup: realign stale main to origin/main', 'refs/heads/main', target, was]).status !== 0) {
      return couldNot('move main');
    }
    return `Main: local main was at ${was.slice(0, 8)}, which this clone cannot show is an ancestor of origin/main, and was moved to origin/main at ${target.slice(0, 8)} (the old commit stays in main's reflog).`;
  } catch {
    return couldNot('run git');
  }
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
    ? spawnSync('npm ci --no-audit --no-fund', { cwd: dir, stdio: 'ignore', shell: true, windowsHide: true })
    : spawnSync('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir, stdio: 'ignore', windowsHide: true });
  console.log(
    run.status === 0
      ? `Setup: installed ${label} dependencies (npm ci).`
      : `Setup: npm ci in ${label} FAILED (exit ${run.status}) - run it by hand before building.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  // The checkout this hook ships in - the settings start it from the current checkout's top level.
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
  const cloud = process.env.CLAUDE_CODE_REMOTE === 'true';
  // First in this hook's output; a sibling hook may still print above it, so the banner itself
  // tells the session to relay it first.
  const github = cloud ? githubAccessLine(root) : '';
  if (github) console.log(github);
  // A person running this by hand has no hook event to pipe in; waiting on the terminal would hang.
  const fresh = freshen(root, (process.stdin.isTTY ? null : await readHookInput()) ?? {});
  if (fresh.line) console.log(fresh.line);
  installIfMissing(root, 'root', { force: fresh.lockMoved });
  if (cloud) {
    installIfMissing(join(root, 'cli'), 'cli/');
    const main = realignStaleMain(root);
    if (main) console.log(main);
    const linked = aliasPinnedChromium(BROWSERS_DIR, pinnedRevisions(root));
    if (linked.length > 0) {
      console.log(`Cloud setup: Playwright's pinned Chromium pointed at the image's build (${linked.join(', ')}).`);
    }
  }
}
