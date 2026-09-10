#!/usr/bin/env node
// REFILL A TUTORIAL PACK'S FRAMES from the walk that already tests that road.
//
//   npm run tutorial:shots -- first-graphic
//   npm run queue -- "npm run tutorial:shots -- first-graphic"     # on a RAM-bound laptop
//
// A tutorial pack (docs/tutorials/) is a spoken script, an instruction sheet and one screenshot
// per step. The screenshots are the half that rots: a PNG cannot fail a build, so a hand-taken
// folder quietly ends up teaching a screen that no longer exists. So they are captured by an
// end-to-end walk that has to pass anyway - when the road changes shape the walk goes red, and
// re-shooting the frames is part of that same fix.
//
// This file is one thing only: the table below, plus the env var and the Playwright invocation
// that go with a row of it. The capture itself is `tutorialShot` in e2e/_svg-import.ts, and it is
// a no-op unless NOACG_TUTORIAL_SHOTS names a directory - so the suite pays nothing for it on
// every other run.
//
// It exists rather than a line in each pack's README because `VAR=x npx playwright test …` is not
// a command this repository's owner can paste: the laptop runs PowerShell, the job queue spawns
// through cmd.exe, and CI is Linux. One npm script works in all three.
//
// It drives Playwright, which registers the run with the machine-wide e2e ticket
// (e2e/globalSetup via scripts/e2e-runs.mjs), so it serialises behind any other browser work by
// itself. Do not add it to SWEEP_SCRIPTS: that list is for scripts that launch Chromium on their
// own and are therefore invisible to that ticket.

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ONE ROW PER PACK: which walk shoots it, and how to run just that walk.
 *
 * `grep` is a Playwright `-g` pattern, so it must match exactly one test. Keep it to a distinctive
 * fragment of the test title rather than the whole title: the titles carry punctuation that means
 * something to a regex, and a second matching test would double-shoot the folder in an order
 * nobody chose.
 */
const PACKS = {
  'first-graphic': {
    spec: 'import-svg-behaviour',
    grep: 'a numeric layer is a',
    // Twelve beats, plus the two extra frames of the Fields step, which is taller than the window.
    steps: 14,
  },
};

const name = process.argv[2];
if (!name || !PACKS[name]) {
  console.error(`Usage: npm run tutorial:shots -- <pack>\nPacks: ${Object.keys(PACKS).join(', ')}`);
  process.exit(2);
}

const pack = PACKS[name];
const packDir = join(ROOT, 'docs', 'tutorials', name);
if (!existsSync(packDir)) {
  console.error(`No pack at docs/tutorials/${name} - the frames belong beside the script that names them.`);
  process.exit(2);
}

const frames = join(packDir, 'frames');
mkdirSync(frames, { recursive: true });

console.log(`Shooting docs/tutorials/${name}/frames from ${pack.spec} ("${pack.grep}")…`);

// PLAYWRIGHT'S OWN CLI, RUN BY THIS NODE, rather than `npx playwright`. Node 20 and later refuse
// to spawn a `.cmd` shim without `shell: true` (the CVE-2024-27980 fix), so `npx.cmd` dies with
// `spawn EINVAL` on Windows, and turning the shell on to get round that would put the frames path
// through cmd.exe quoting. `createRequire` also resolves correctly from a LINKED WORKTREE, whose
// node_modules is the primary checkout's.
const playwrightCli = createRequire(import.meta.url).resolve('@playwright/test/cli');

const child = spawn(
  process.execPath,
  [playwrightCli, 'test', pack.spec, '-g', pack.grep],
  { cwd: ROOT, stdio: 'inherit', env: { ...process.env, NOACG_TUTORIAL_SHOTS: frames } },
);

child.on('exit', (code) => {
  // Count what landed either way. A green walk that wrote nothing means the capture calls moved
  // out of the helpers, and a red one that wrote eight frames says WHERE the road broke - which
  // is more useful than the exit code on its own.
  const got = existsSync(frames) ? readdirSync(frames).filter((f) => f.endsWith('.png')) : [];
  console.log(`\n${got.length} of ${pack.steps} frames in docs/tutorials/${name}/frames`);
  if (got.length < pack.steps) {
    console.log(`Missing: the walk stopped at ${got.sort().at(-1) ?? 'the first step'}.`);
  }
  if (code === 0 && got.length < pack.steps) {
    console.error('The walk passed and the frames are short - check that tutorialShot still runs on this road.');
    process.exit(1);
  }
  process.exit(code ?? 1);
});
