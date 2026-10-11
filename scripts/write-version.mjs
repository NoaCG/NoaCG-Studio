// Writes dist/version.json - the deployed-commit marker.
//
// This is what ties a running deployment back to the exact commit it was built from:
// the deploy-verify workflow (.github/workflows/deploy-verify.yml) fetches
// https://<production>/version.json and compares `commit` against the git history, so a
// production deploy that silently stops updating becomes a red workflow run and a tracking
// issue instead of a discovery weeks later (docs/DEPLOYMENT.md).
//
// On Vercel the commit arrives in the build env (VERCEL_GIT_COMMIT_SHA/REF); a local build
// asks git. Runs at the end of `npm run build`, after prerender has finished shaping dist/.
//
// `commit` alone answers "what was built", not "is production current" - since the build skip
// (scripts/vercel-ignore-build.mjs) landed, a docs-only push to main is deliberately not built,
// so an unequal `commit` against the tip of main is usually correct and occasionally an incident.
// Telling those apart used to mean diffing two commits against the deploy-affecting path list by
// hand. `lastDeployAffectingCommit` and `deployedCommitIsCurrent` below answer it directly, read
// from the same list (scripts/deploy-affecting-paths.mjs) the skip and the drift check already
// share - a stamp computed from its own idea of what counts would be a fourth opinion, and the
// header of that file explains why there must not be one.

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { lastAffectingCommit } from './deploy-affecting-paths.mjs';

const fromGit = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', windowsHide: true }).trim();
  } catch {
    return null;
  }
};

const commit = process.env.VERCEL_GIT_COMMIT_SHA || fromGit('rev-parse HEAD') || 'unknown';
const ref = process.env.VERCEL_GIT_COMMIT_REF || fromGit('rev-parse --abbrev-ref HEAD') || 'unknown';

// The newest commit, at or before this build's commit, that can change what production serves.
// `lastAffectingCommit` throws on a missing `.git` directory (no history to walk at all), and
// returns null itself - without throwing - when a shallow checkout's truncated history runs out
// before finding one. Both mean "cannot tell", so they are kept apart from a real answer rather
// than folded into a guessed `false`.
let lastDeployAffectingCommit = null;
try {
  lastDeployAffectingCommit = lastAffectingCommit(commit);
} catch {
  // already null
}

// null when it could not be determined at all - never a claimed `true` built on a guess.
// Equality, not reachability: `lastDeployAffectingCommit` is always an ancestor-or-self of
// `commit` (the walk starts at `commit`), so a looser "commit descends from it" check would be
// true by construction and never say anything. The rare case this reads `false` for a build that
// is arguably still fully current is a build whose own triggering commit is not itself
// deploy-affecting but an earlier commit in the same unbuilt range is (e.g. a docs-only push that
// a cancelled-and-superseded build folds an affecting commit into) - `commit` then differs from
// `lastDeployAffectingCommit` while still containing it. That reads as "not current" here on
// purpose: this field is a strict, conservative signal about THIS build's own commit, not a
// substitute for deploy-verify.yml's live drift check, which already handles reachability against
// whatever production is actually serving.
const deployedCommitIsCurrent =
  lastDeployAffectingCommit === null ? null : commit === lastDeployAffectingCommit;

const dist = resolve(process.cwd(), 'dist');
mkdirSync(dist, { recursive: true });
writeFileSync(
  resolve(dist, 'version.json'),
  JSON.stringify(
    { commit, ref, builtAt: new Date().toISOString(), lastDeployAffectingCommit, deployedCommitIsCurrent },
    null,
    2,
  ) + '\n',
);
console.log(
  `[write-version] dist/version.json -> ${ref}@${commit.slice(0, 10)} (current: ${deployedCommitIsCurrent ?? 'unknown'})`,
);
