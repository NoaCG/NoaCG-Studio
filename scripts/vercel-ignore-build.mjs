// Vercel's ignoreCommand (vercel.json): exit 0 SKIPS the build, exit 1 BUILDS.
//
// Why this exists: many worktree branches are active at once, and every push used to spend
// a Vercel build on a preview nobody asked for - burning build minutes, emitting failure
// emails, and drowning the one deployment that matters (production from main) in noise.
// CI already builds and tests every branch, so previews are opt-in:
//
//   - any branch other than main builds only when its head commit message contains "[preview]".
//   - main builds when the commit can change what production serves - see below.
//   - outside Vercel (env absent) or on any error: build. Failing open can only cost a
//     build; failing closed could silently stop production.
//
// MAIN IS NO LONGER UNCONDITIONAL, and that is the expensive half. Measured over the
// 2026-08-08..2026-09-07 billing cycle: 719 pushes to main, 9.31K build CPU minutes, $32.39
// against a $20 credit - and 48% of those pushes touched only documentation, contracts,
// workflow tooling or tests, rebuilding a byte-identical site each time. So main asks
// scripts/deploy-affecting-paths.mjs whether anything in the range can reach the artifact.
//
// THE RANGE IS THE DELICATE PART. VERCEL_GIT_PREVIOUS_SHA is the last SUCCESSFUL deployment for
// this project and branch, which is exactly right: skipping a commit leaves that marker where it
// was, so the next push measures from the last thing actually built and a skipped change is
// re-considered rather than forgotten. Vercel clones shallowly, so the diff can be unreadable;
// we deepen once, and if it still cannot be read we build. Every unknown here builds.
//
// Behavior documented in docs/DEPLOYMENT.md.
import { execFileSync } from 'node:child_process';

import { affectsDeployment, changedFiles } from './deploy-affecting-paths.mjs';

const BUILD = 1;
const SKIP = 0;

function build(reason) {
  console.log(`[ignore-build] building: ${reason}`);
  process.exit(BUILD);
}

function skip(reason) {
  console.log(`[ignore-build] skipping: ${reason}`);
  process.exit(SKIP);
}

const ref = process.env.VERCEL_GIT_COMMIT_REF;
const message = process.env.VERCEL_GIT_COMMIT_MESSAGE ?? '';
const sha = process.env.VERCEL_GIT_COMMIT_SHA ?? 'HEAD';
const previous = process.env.VERCEL_GIT_PREVIOUS_SHA;

if (!ref) build('no VERCEL_GIT_COMMIT_REF (not Vercel?)');
if (ref !== 'main') {
  if (message.includes('[preview]')) build(`preview requested for branch "${ref}"`);
  skip(`preview for branch "${ref}" (no [preview] in the commit message)`);
}

// main from here down.
if (!previous) build('main, and no VERCEL_GIT_PREVIOUS_SHA to measure against');

let files = changedFiles(previous, sha);
if (files === null) {
  // Shallow clone: pull down enough history for the diff, then ask once more.
  try {
    execFileSync('git', ['fetch', '--deepen=100'], { stdio: 'ignore' });
  } catch {
    // Nothing to do - the retry below decides.
  }
  files = changedFiles(previous, sha);
}

if (files === null) build(`main, and ${previous.slice(0, 7)}..${sha.slice(0, 7)} is unreadable here`);
if (files.length === 0) build(`main, and the range is empty (redeploy of ${sha.slice(0, 7)})`);

const affecting = files.filter((f) => affectsDeployment(f));
if (affecting.length > 0) {
  build(
    `main, ${affecting.length} of ${files.length} file(s) since the last deployment are deploy-affecting (${affecting.slice(0, 5).join(', ')}${affecting.length > 5 ? ', …' : ''})`,
  );
}
skip(
  `main at ${sha.slice(0, 7)} - all ${files.length} file(s) since the last deployment are docs, contracts, tooling or tests, so production already serves this artifact`,
);
