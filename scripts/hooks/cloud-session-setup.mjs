// SessionStart hook: make a fresh checkout able to build before the first command, so no session
// spends its first minutes rediscovering the same gaps. Step 1 runs everywhere - a fresh cloud
// container and a fresh local worktree alike (the desktop app creates one per scheduled run and per
// worktree session, with no node_modules); step 2 only in the cloud (`CLAUDE_CODE_REMOTE=true`).
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

/** `npm ci` in `dir` when it has a lockfile and no node_modules yet. */
function installIfMissing(dir, label) {
  if (!existsSync(join(dir, 'package-lock.json')) || existsSync(join(dir, 'node_modules'))) return;
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
  installIfMissing(root, 'root');
  if (process.env.CLAUDE_CODE_REMOTE === 'true') {
    installIfMissing(join(root, 'cli'), 'cli/');
    const linked = aliasPinnedChromium(BROWSERS_DIR, pinnedRevisions(root));
    if (linked.length > 0) {
      console.log(`Cloud setup: Playwright's pinned Chromium pointed at the image's build (${linked.join(', ')}).`);
    }
  }
}
