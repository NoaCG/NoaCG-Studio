#!/usr/bin/env node
/**
 * Cut a release of `@noacg/cli` — the preflight, the tag, and the proof it worked.
 *
 * WHY THIS EXISTS. The publish itself has never needed a human: there is no credential on any
 * machine, and `.github/workflows/release-cli.yml` mints a short-lived one from GitHub's OIDC
 * token. What the human step bought was supposed to be a second pair of eyes. On 2026-09-05 the
 * owner published 0.3.0 from his phone and said what that step actually was:
 *
 *   > Can you, in the future, consider doing this yourself because I didn't do any checks? I just
 *   > did what you told me.
 *
 * A human following an agent's instructions verifies nothing. So the click is replaced by the
 * checks it was standing in for — and they run on both sides of the publish, because the half
 * that matters is the second one. Every guard here also exists in the workflow; the point of
 * repeating them is that a local refusal costs nothing, while a workflow refusal costs a version
 * if it comes after the registry call. (docs/OWNER_RULINGS.md, owner-decisions-2026-09-05.)
 *
 * Usage:
 *   npm run release:cli              preflight, tag, push, watch, verify from the registry
 *   npm run release:cli -- --check   preflight only: say what would be released, touch nothing
 *   npm run release:cli -- --no-smoke  skip the post-publish `npx` install of the real package
 *   npm run release:cli -- --publisher-ok  release anyway when npm's trusted publisher looks stale
 *
 * The version comes from `cli/package.json` ON origin/main, never from the local tree: the thing
 * being released is a commit on main, and a worktree can be anywhere.
 */
import { execFileSync } from 'node:child_process';

// This script is the `fires:` mechanism for the repository-rename trap, so it says that rule where
// the rule applies rather than leaving it in a contract nobody reads at release time.
import * as rules from './rules.mjs';

const PKG = '@noacg/cli';
const args = process.argv.slice(2);
const checkOnly = args.includes('--check') || args.includes('--dry-run');
const smoke = !args.includes('--no-smoke');
const publisherOk = args.includes('--publisher-ok');

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts }).trim();

const git = (...a) => run('git', a);
const fail = (message, fix) => {
  console.error(`\nrelease:cli REFUSED — ${message}`);
  if (fix) console.error(`  ${fix}`);
  process.exitCode = 1;
  process.exit();
};

/**
 * Read a file as it exists on origin/main.
 *
 * `git show origin/main:path` is the obvious spelling and the wrong one here: on Windows the shell
 * layer rewrites an argument containing a colon and slashes as a path, and the command fails with
 * a confusing "ambiguous argument". Resolving the blob first has no such hazard on any platform.
 */
const readFromMain = (path) => {
  const line = git('ls-tree', 'origin/main', '--', path);
  if (!line) fail(`${path} does not exist on origin/main`);
  return git('cat-file', 'blob', line.split(/\s+/)[2]);
};

const json = (path) => JSON.parse(readFromMain(path));

console.log('Fetching origin/main and the tags…');
git('fetch', '--tags', 'origin', 'main');

// ---------------------------------------------------------------- the version, and who agrees

const version = json('cli/package.json').version;
const sha = git('rev-parse', 'origin/main');

/**
 * `cli/scripts/build-skill.mjs` stamps the version from cli/package.json onto every plugin
 * manifest and both marketplace entries, and the workflow refuses a tree where they disagree.
 * Checking it here turns a failed run into a sentence, and names WHICH file drifted — which is
 * the thing the workflow's own message cannot tell you without reading its log.
 */
const stamps = [
  ['cli/plugin/.claude-plugin/plugin.json', (d) => d.version],
  ['cli/plugin/.codex-plugin/plugin.json', (d) => d.version],
  ['cli/plugin-mcp/.claude-plugin/plugin.json', (d) => d.version],
  ['cli/plugin-mcp/.codex-plugin/plugin.json', (d) => d.version],
  ['.claude-plugin/marketplace.json', (d) => d.plugins.find((p) => p.name === 'noacg')?.version],
  ['.claude-plugin/marketplace.json', (d) => d.plugins.find((p) => p.name === 'noacg-mcp')?.version],
];
const drifted = stamps
  .map(([path, read]) => [path, read(json(path))])
  .filter(([, stamped]) => stamped !== version);
if (drifted.length) {
  fail(
    `cli/package.json says ${version} on main, but ${drifted.map(([p, v]) => `${p} says ${v}`).join('; ')}`,
    'Run `npm --prefix cli run build` on the release branch, commit, and land it before releasing.',
  );
}

// ---------------------------------------------------------------- is there anything to release

const registry = async (path) => {
  const res = await fetch(`https://registry.npmjs.org/${path}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${path}`);
  return res.json();
};

const published = await registry(encodeURIComponent(PKG));
const known = published ? Object.keys(published.versions) : [];

// ---------------------------------------------------------------- who npm will trust

/**
 * npm's trusted publishing matches a publish against a stored ORGANISATION OR USER, REPOSITORY and
 * WORKFLOW FILENAME. All three are exact and case-sensitive, and none of them can be read from
 * here: npm exposes the stored configuration only to an authenticated account owner, and this
 * script holds no credential by design.
 *
 * The comparison is still makeable, because the LAST published version's PROVENANCE is public and
 * names the repository and workflow npm accepted. So the question this asks is not "what does npm
 * hold" but the one that actually matters: is this repository, with this workflow file, the same
 * pair npm accepted last time?
 *
 * On 2026-09-09 it was not. The repository had moved from `miwco/NoaCG-Studio` to
 * `NoaCG/NoaCG-Studio` three days earlier, npm's stored copy did not follow, and the publish failed
 * with `E404 Not Found - PUT` on a package that plainly exists - a message naming neither the
 * repository nor the credential. Recreating the connection needs an interactive 2FA challenge, so
 * it is always the account owner's job and never same-session work. Asking here costs two seconds
 * and moves that discovery to BEFORE the tag exists.
 *
 * Renaming the WORKFLOW is the same failure and would slip past that comparison, because a stale
 * constant and the stale path in the last publish's provenance agree with each other. So the
 * constant is checked against the tree before it is trusted to say anything.
 */
const WORKFLOW = '.github/workflows/release-cli.yml';
const WORKFLOW_FILENAME = WORKFLOW.split('/').pop();
if (!git('ls-tree', 'origin/main', '--', WORKFLOW)) {
  fail(
    `${WORKFLOW} does not exist on origin/main, so this script cannot say which workflow npm must trust`,
    'If the release workflow was renamed, update WORKFLOW here and have the owner re-create npm\'s trusted publisher with the new filename.',
  );
}

/** The repository as GitHub names it TODAY. A local remote can still carry the pre-move name. */
const currentRepository = () => {
  try {
    const full = run('gh', ['api', 'repos/{owner}/{repo}', '--jq', '.full_name']);
    if (full) return { name: full, from: 'gh api' };
  } catch {
    // gh missing or not signed in - the remote is a worse answer, not no answer.
  }
  const url = git('remote', 'get-url', 'origin');
  const match = url.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? { name: match[1], from: 'origin remote' } : null;
};

/**
 * The repository and workflow a published version's provenance names, or null when it carries none.
 * 0.2.0 was hand-published without OIDC, so "no attestation" is a real answer here and must read as
 * "nothing to compare", never as "something is wrong".
 */
const provenanceOf = async (v) => {
  const doc = await registry(`-/npm/v1/attestations/${encodeURIComponent(`${PKG}@${v}`)}`);
  const slsa = doc?.attestations?.find((a) => a.predicateType?.startsWith('https://slsa.dev/provenance'));
  if (!slsa?.bundle?.dsseEnvelope?.payload) return null;
  const payload = JSON.parse(Buffer.from(slsa.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  const workflow = payload?.predicate?.buildDefinition?.externalParameters?.workflow;
  if (!workflow?.repository) return null;
  return { repository: new URL(workflow.repository).pathname.replace(/^\//, ''), path: workflow.path };
};

const here = currentRepository();
const lastPublished = published?.['dist-tags']?.latest;
// A registry hiccup must not stop a release: this is advisory data, and everything it could refuse
// the workflow refuses again. A MISMATCH is different - that is a real answer, and it refuses.
const lastProvenance = lastPublished ? await provenanceOf(lastPublished).catch(() => null) : null;

/**
 * Compared case-INSENSITIVELY, even though npm's own matching is case-sensitive. Both sides here
 * name the same repository, so a difference in case is this script reading two spellings of one
 * name - a lowercase `origin` remote clones the same repository GitHub calls `NoaCG/NoaCG-Studio` -
 * and refusing a release over that would be the false alarm this check exists to avoid.
 */
const sameName = (a, b) => a.toLowerCase() === b.toLowerCase();

let publisherLine;
if (!here) {
  publisherLine = 'npm publisher UNCHECKED - neither `gh` nor the origin remote named a GitHub repository.';
} else if (!lastProvenance) {
  const why = lastPublished ? `${PKG}@${lastPublished} carries no provenance` : 'no version is published yet';
  publisherLine = `npm must be holding ${here.name} + ${WORKFLOW_FILENAME} - nothing to compare it against, because ${why}.`;
} else {
  const drift = [];
  if (!sameName(lastProvenance.repository, here.name)) {
    drift.push(`npm last accepted ${lastProvenance.repository}, but this is ${here.name} (${here.from})`);
  }
  if (lastProvenance.path !== WORKFLOW) {
    drift.push(`npm last accepted the workflow ${lastProvenance.path}, but the release runs ${WORKFLOW}`);
  }
  if (drift.length > 0 && !publisherOk) {
    const [org, repo] = here.name.split('/');
    fail(
      `the trusted publisher npm holds looks stale - ${drift.join('; ')}`,
      `${rules.text('root/repository-rename-breaks-npm-trusted-publishing')}
  Ask the owner to delete and re-add the connection on npmjs.com (${PKG} -> Settings -> Trusted
  publishing) with organisation ${org}, repository ${repo}, workflow filename ${WORKFLOW_FILENAME},
  and allowed actions including the direct \`npm publish\`. Then release. Pass --publisher-ok if you
  already know npm is correct.`,
    );
  }
  publisherLine = drift.length > 0
    ? `npm's trusted publisher looks STALE, and --publisher-ok overrode the refusal: ${drift.join('; ')}.`
    : `npm's trusted publisher matches: ${here.name} + ${WORKFLOW_FILENAME}, the pair it accepted for ${PKG}@${lastPublished}.`;
}

console.log(`\n${publisherLine}`);

if (known.includes(version)) {
  fail(
    `${PKG}@${version} is already on the registry, and a version is never republished`,
    'Bump cli/package.json, run `npm --prefix cli run build`, and land that before releasing.',
  );
}

const tag = `cli-v${version}`;
if (git('tag', '-l', tag)) fail(`the tag ${tag} already exists locally`, `Delete it with \`git tag -d ${tag}\` if it is a leftover.`);
if (git('ls-remote', '--tags', 'origin', tag)) {
  fail(`the tag ${tag} already exists on origin`, 'Re-drive the existing run from the Actions tab instead of re-tagging.');
}

console.log(`\n${PKG}@${version}`);
console.log(`  commit   ${sha.slice(0, 10)} — ${git('log', '-1', '--format=%s', 'origin/main')}`);
console.log(`  stamps   all 6 agree`);
console.log(`  registry ${known.length ? `has ${known.join(', ')} — ${version} is free` : 'has no published version yet'}`);

if (checkOnly) {
  console.log('\n--check: nothing was tagged or pushed.');
  process.exit(0);
}

// ---------------------------------------------------------------- the publish

console.log(`\nTagging ${tag} at origin/main and pushing — this IS the publish.`);
git('tag', tag, sha);
try {
  git('push', 'origin', tag);
} catch (error) {
  // A tag left behind locally makes the next attempt refuse for the wrong reason.
  git('tag', '-d', tag);
  throw error;
}

console.log('Watching the release run…');
// `gh run watch` needs a run id, and the run does not exist the instant the tag lands. Ask for the
// tag's own run rather than the newest one: another workflow's run could otherwise be watched.
let runId = '';
for (let attempt = 0; attempt < 20 && !runId; attempt++) {
  runId = run('gh', [
    'run', 'list', '--workflow=release-cli.yml', '--limit', '5',
    '--json', 'databaseId,headBranch', '--jq', `[.[] | select(.headBranch == "${tag}")][0].databaseId // ""`,
  ]);
  if (!runId) await new Promise((resolve) => setTimeout(resolve, 3000));
}
if (!runId) fail('the tag was pushed but no run appeared for it', 'Check the Actions tab; the publish may still be running.');

try {
  execFileSync('gh', ['run', 'watch', runId, '--exit-status'], { stdio: 'inherit' });
} catch {
  fail(`the release run failed — gh run view ${runId} --log-failed`, 'The version was NOT published; fix and re-tag.');
}

// ---------------------------------------------------------------- the proof, from outside

/**
 * A green run is not a published package. The registry is the only authority on that, and it is
 * the check the owner did not have when he published 0.3.0 by hand.
 */
console.log('\nVerifying from the registry…');
const after = await registry(`${encodeURIComponent(PKG)}/${version}`);
if (!after || after.version !== version) fail(`the run was green but ${PKG}@${version} is not on the registry`);

const tags = await registry(`-/package/${encodeURIComponent(PKG)}/dist-tags`);
const provenance = Boolean(after.dist?.attestations?.provenance);
console.log(`  version      ${after.version}`);
console.log(`  latest tag   ${tags?.latest}${tags?.latest === version ? '' : '  <-- NOT this version'}`);
console.log(`  provenance   ${provenance ? 'signed, linked to the run' : 'MISSING'}`);
console.log(`  size         ${after.dist.unpackedSize} bytes across ${after.dist.fileCount} files`);
if (!provenance) console.log('  (a missing attestation means it published without OIDC — worth reading the run log)');

if (smoke) {
  // The last question nothing above answers: does the thing a user installs actually run?
  console.log('\nInstalling the published package and asking it its version…');
  const reported = run('npx', ['-y', `${PKG}@${version}`, '--version'], { shell: process.platform === 'win32' });
  if (reported !== version) fail(`the installed package reports ${reported}, not ${version}`);
  console.log(`  npx ${PKG}@${version} --version -> ${reported}`);
}

console.log(`\nReleased ${PKG}@${version}. https://www.npmjs.com/package/${PKG}/v/${version}`);
