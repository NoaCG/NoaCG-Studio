// The decisions of .github/workflows/release-companion.yml: does this run release the Companion
// module, may these notes go on the Release page, and is this .tgz what Companion imports.
//
//   node scripts/companion-release.mjs decide          write release=, dry_run= and version= for the
//                                                      workflow (GITHUB_OUTPUT), or refuse
//   node scripts/companion-release.mjs notes           print the Release page, or exit 1 when the
//                                                      version's notes are not fit
//   node scripts/companion-release.mjs verify <dir>    exit 1 unless <dir>, the unpacked .tgz, is a
//                                                      module Companion can import at that version
//
// This lives outside companion-module/ because that folder is copied into Bitfocus's repository
// for publishing, and these are this repository's release rules. The rules of the notes are the
// CLI's and the Bridge's (cli/scripts/release-notes.mjs), read from companion-module/CHANGELOG.md.

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { newestVersionIn, problemsWith, sectionOf } from '../cli/scripts/release-notes.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHANGELOG = 'companion-module/CHANGELOG.md';
const MODULE_ID = 'noacg-studio';
export const TAG_PREFIX = 'companion-v';

/**
 * Pure: what one workflow run does. `dryRun` is true unless a real release was decided, so an
 * event nobody thought of can never publish. A refusal says why a run that asked to publish must
 * not, and fails the workflow.
 *
 * @param {{ event: string, ref: string, version: string, released: boolean, onMain: boolean, dispatchDryRun?: boolean }} run
 * @returns {{ release: boolean, dryRun: boolean, why: string, refusal?: string }}
 */
export function decideRelease({ event, ref, version, released, onMain, dispatchDryRun = true }) {
  const rehearsal = (why) => ({ release: true, dryRun: true, why });
  const nothing = (why) => ({ release: false, dryRun: true, why });
  const refused = (refusal) => ({ release: false, dryRun: true, why: refusal, refusal });
  const real = () => ({ release: true, dryRun: false, why: `Module ${version} is not released yet, so this run releases it.` });
  const askedToPublish = () => {
    if (!onMain) return refused('this commit is not on main. Land it first; landing a new version releases it.');
    if (released) return refused(`module ${version} is already on the Releases page. Move the version in companion-module/package.json and write its section in ${CHANGELOG}.`);
    return real();
  };

  if (event === 'pull_request') return rehearsal('A pull request rehearses the release.');
  if (event === 'workflow_dispatch') {
    return dispatchDryRun ? rehearsal('A manual dry run.') : askedToPublish();
  }
  if (event !== 'push') return nothing(`A ${event} event does not release the module.`);
  if (ref === 'refs/heads/main') {
    return released ? nothing(`Module ${version} is already on the Releases page.`) : real();
  }
  if (ref.startsWith(`refs/tags/${TAG_PREFIX}`)) {
    const tag = ref.slice('refs/tags/'.length);
    if (tag !== `${TAG_PREFIX}${version}`) return refused(`tag ${tag} names another version than companion-module/package.json's ${version}.`);
    return askedToPublish();
  }
  return nothing(`A push to ${ref} does not release the module.`);
}

/** Pure: why this changelog cannot release this version - an empty list when it can. The version
 *  and its newest notes are one decision, and `## Unreleased` is not a version. */
export function notesProblems(changelog, version) {
  const problems = problemsWith(sectionOf(changelog, version), version, CHANGELOG);
  const newest = newestVersionIn(changelog);
  if (newest !== version) {
    problems.push(`companion-module/package.json's version is ${version}, but the newest section of ${CHANGELOG} is ${newest} - move them together`);
  }
  return problems;
}

/** Pure: the Release page, for somebody who arrives from the Releases list. */
export function releasePage(changes) {
  return `The module that runs a NoaCG Studio production from a Stream Deck or any surface Bitfocus Companion supports.

## What changed

${changes}

## Install

Download the \`.tgz\` below. In Companion 4.3 or later, open **Modules**, press **Import module package** and choose the file. Then publish the production once and pair it from its page: **Setup**, **Stream Deck panel…**, **Pair a panel**.

Setup steps: https://noacg.studio/downloads#companion-setup
`;
}

/** Why this unpacked package is not one Companion imports at this version - an empty list when it
 *  is. The shape is what `companion-module-build` writes and Companion's Modules page has imported
 *  (docs/work-specs/playout-companion-qualification/evidence/h0-1-package-guide-relay.md): one
 *  folder named for the module, with the tool's placeholders in the manifest filled in. */
export function packageProblems(dir, version) {
  const root = path.join(dir, MODULE_ID);
  const problems = [];
  for (const file of ['main.js', 'package.json', 'LICENSE', 'companion/manifest.json', 'companion/HELP.md']) {
    if (!existsSync(path.join(root, file))) problems.push(`the package has no ${MODULE_ID}/${file}`);
  }
  if (problems.length > 0) return problems;
  const manifest = JSON.parse(readFileSync(path.join(root, 'companion/manifest.json'), 'utf8'));
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (manifest.id !== MODULE_ID) problems.push(`the manifest's id is ${manifest.id}, not ${MODULE_ID}`);
  if (manifest.version !== version) problems.push(`the manifest says version ${manifest.version}, not ${version}`);
  if (pkg.version !== version) problems.push(`the packaged package.json says version ${pkg.version}, not ${version}`);
  if ((manifest.runtime?.apiVersion ?? '0.0.0') === '0.0.0') problems.push(`the manifest's runtime.apiVersion is the placeholder 0.0.0`);
  if (manifest.runtime?.entrypoint !== '../main.js') problems.push(`the manifest's entrypoint is ${manifest.runtime?.entrypoint}, not ../main.js`);
  return problems;
}

function moduleVersion() {
  return JSON.parse(readFileSync(path.join(ROOT, 'companion-module/package.json'), 'utf8')).version;
}

function succeeds(command, args) {
  return spawnSync(command, args, { cwd: ROOT, stdio: 'ignore', windowsHide: true }).status === 0;
}

function decide() {
  const version = moduleVersion();
  const decision = decideRelease({
    event: process.env.GITHUB_EVENT_NAME ?? '',
    ref: process.env.GITHUB_REF ?? '',
    version,
    released: succeeds('gh', ['release', 'view', `${TAG_PREFIX}${version}`, '--json', 'tagName']),
    onMain: succeeds('git', ['merge-base', '--is-ancestor', 'HEAD', 'origin/main']),
    dispatchDryRun: process.env.DISPATCH_DRY_RUN !== 'false',
  });
  console.log(decision.why);
  if (decision.refusal) {
    console.error(`::error title=Refused::${decision.refusal}`);
    return 1;
  }
  appendFileSync(process.env.GITHUB_OUTPUT, `release=${decision.release}\ndry_run=${decision.dryRun}\nversion=${version}\n`);
  return 0;
}

function main([command, argument]) {
  const known = command === 'decide' || command === 'notes' || (command === 'verify' && argument);
  if (!known) {
    console.error('usage: companion-release.mjs decide | notes | verify <dir>');
    return 2;
  }
  if (command === 'decide') return decide();
  const version = moduleVersion();
  if (command === 'verify') {
    const problems = packageProblems(argument, version);
    for (const problem of problems) console.error(`  - ${problem}`);
    if (problems.length === 0) console.log(`companion-release: the package is module ${version}, in the shape Companion imports.`);
    return problems.length === 0 ? 0 : 1;
  }
  const changelog = readFileSync(path.join(ROOT, CHANGELOG), 'utf8');
  const problems = notesProblems(changelog, version);
  if (problems.length > 0) {
    console.error(`companion-release: module ${version} cannot be released with these notes:`);
    for (const problem of problems) console.error(`  - ${problem}`);
    return 1;
  }
  console.log(releasePage(sectionOf(changelog, version)));
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
