// THE SKILL A RUN MEASURES (docs/work-specs/noacg-harness/spec.md AC-7, AC-16, the H7 repair).
//
// The lock's agent pins one Skills API version of cli/skill/noacg-graphic, the bytes tuning
// measured. The checkout's cli/skill is the product's, and other plans change it (PR #1258 did,
// between H7 and H8). A session sees the skill in three places: the version the agent pins on the
// server, `noacg docs <topic>` in the CLI it runs, and, for the reference arm, the plugin it loads.
// Once tuning is closed the exam runs the lock's bytes in all three, taken from git: the newest
// commit whose skill folder hashes to the lock's bundle.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pluginSkillFile } from '../../../cli/scripts/plugin-skill.mjs';
import { ROOT } from './cli.mjs';
import { examPending } from './ledger.mjs';

export const SKILL_DIR = 'cli/skill/noacg-graphic';
const SKILL_NAME = 'noacg-graphic';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const short = (hash) => hash.slice(0, 12);
/** build-skill writes every skill file with LF line ends. */
const lf = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

/** The Skills API bundle hash of a skill's files (`[{ path, bytes }]`, paths inside the skill
 *  folder), as `cli/scripts/build-skill.mjs --skills-api` writes it in bundle.json. */
export function bundleSha256(files) {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return sha(Buffer.from(sorted.map((f) => `${sha(f.bytes)}  ${SKILL_NAME}/${f.path}\n`).join('')));
}

/** A skill folder's files as they are on disk. */
export function readSkill(dir) {
  const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  return walk(dir).map((file) => ({ path: path.relative(dir, file).split(path.sep).join('/'), bytes: lf(readFileSync(file)) }));
}

function git(root, args, input) {
  const r = spawnSync('git', args, { cwd: root, input, encoding: 'buffer', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${String(r.stderr).trim()}`);
  return r.stdout;
}

/** The skill folder's files at `commit`, as `[{ path, blob }]`. */
function treeAt(root, commit, dir) {
  return git(root, ['ls-tree', '-r', '-z', commit, '--', dir]).toString('utf8').split('\0').filter(Boolean).map((line) => {
    const [meta, name] = line.split('\t');
    return { path: name.slice(dir.length + 1), blob: meta.split(' ')[2] };
  });
}

/** Each blob's bytes, LF ends, from one `git cat-file --batch`. */
function blobs(root, ids) {
  const bytes = new Map();
  if (!ids.length) return bytes;
  const out = git(root, ['cat-file', '--batch'], Buffer.from(`${ids.join('\n')}\n`));
  for (let at = 0; at < out.length; ) {
    const eol = out.indexOf(0x0a, at);
    const [id, , size] = out.subarray(at, eol).toString('utf8').split(' ');
    bytes.set(id, lf(out.subarray(eol + 1, eol + 1 + Number(size))));
    at = eol + 1 + Number(size) + 1;
  }
  return bytes;
}

/** The skill folder's files as `commit` holds them. */
export function skillAt(root, commit, dir = SKILL_DIR) {
  const tree = treeAt(root, commit, dir);
  const bytes = blobs(root, tree.map((f) => f.blob));
  return tree.map((f) => ({ path: f.path, bytes: bytes.get(f.blob) }));
}

/** The newest commit on `ref` whose skill folder is the bundle `bundle`, its files, and the commits
 *  since that changed the folder (`<sha> <subject>`); null when no commit holds it. */
export function findSkill(root, bundle, { ref = 'HEAD', dir = SKILL_DIR } = {}) {
  const commits = git(root, ['log', '--format=%H', ref, '--', dir]).toString('utf8').split('\n').filter(Boolean);
  const trees = commits.map((commit) => treeAt(root, commit, dir));
  const bytes = blobs(root, [...new Set(trees.flat().map((f) => f.blob))]);
  const found = trees.findIndex((tree) => bundleSha256(tree.map((f) => ({ path: f.path, bytes: bytes.get(f.blob) }))) === bundle);
  if (found < 0) return null;
  const commit = commits[found];
  const since = git(root, ['log', '--format=%h %s', `${commit}..${ref}`, '--', dir]).toString('utf8').split('\n').filter(Boolean);
  return { commit, files: trees[found].map((f) => ({ path: f.path, bytes: bytes.get(f.blob) })), since };
}

/** The topics `noacg docs` prints, from the CLI's source (cli/src/commands/docs.ts), which every
 *  build of the CLI a session runs is compiled from. */
export function docTopics(root = ROOT) {
  const m = /const TOPICS = \[([^\]]*)\]/.exec(readFileSync(path.join(root, 'cli', 'src', 'commands', 'docs.ts'), 'utf8'));
  const topics = m ? [...m[1].matchAll(/'([a-z-]+)'/g)].map((t) => t[1]) : [];
  if (!topics.length) throw new Error('no TOPICS list in cli/src/commands/docs.ts: the exam cannot tell what `noacg docs` prints');
  return topics;
}

/** Write a skill's files into `dir`, emptied first, each through `transform`. */
export function writeSkill(dir, files, transform = (file, bytes) => bytes) {
  rmSync(dir, { recursive: true, force: true });
  for (const f of files) {
    const target = path.join(dir, ...f.path.split('/'));
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, transform(f.path, f.bytes));
  }
  return dir;
}

/** The plugin the reference arm loads, holding `files` as its skill: the checkout's plugin (its
 *  manifests carry this CLI's version) with the skill copied in the way build-skill copies it. */
export function pinnedPlugin(dir, files, pluginDir = path.join(ROOT, 'cli', 'plugin')) {
  rmSync(dir, { recursive: true, force: true });
  cpSync(pluginDir, dir, { recursive: true });
  writeSkill(path.join(dir, 'skills', SKILL_NAME), files, pluginSkillFile);
  return dir;
}

/**
 * Which skill a `--build` of `phase` runs (AC-7, AC-16). `bundle` is the checkout's (bundle.json),
 * `tuned` what `findSkill` found for the lock's, `topics` what `noacg docs` prints.
 *
 * The same bytes as the lock's: `{ pinned: false }`, the run goes on. Different bytes: a tuning
 * round is refused, since it measures the skill it syncs. The exam (`examPending`) runs the lock's
 * skill as tuning chose it, `{ pinned: true, files }`, and is refused only where a session would
 * still meet the checkout's: `noacg docs` in the CLI it runs, or a CLI version other than the one
 * that skill's commands pin.
 */
export function examSkill({ ledger, phase, lock, bundle, tuned, topics }) {
  const want = lock.skill.bundleSha256;
  if (bundle.sha256 === want) return { pinned: false };
  const cause = !tuned ? 'no commit on this branch holds those bytes' : tuned.since.length ? `changed by ${tuned.since.join('; ')}` : 'changed in the working tree';
  const moved = `cli/skill/noacg-graphic is bundle ${short(bundle.sha256)}, not the ${short(want)} that agent v${lock.agent.version} pins (${cause})`;
  if (examPending(ledger) !== phase) return { refusal: `${moved}: a tuning round measures the skill it syncs, so sync it as the round's variable (node scripts/harness-agent-sync.mjs --workspace bench --apply) or restore cli/skill` };
  if (!tuned) return { refusal: `${moved}: the exam runs the skill the lock pins, and without its bytes it can neither tell what \`noacg docs\` would print nor build the reference arm's plugin. Run it from a checkout with the full history` };
  if (bundle.cliVersion !== lock.skill.cliVersion) return { refusal: `${moved}, and the CLI is v${bundle.cliVersion} where that skill's commands pin v${lock.skill.cliVersion}: a session would be told to fetch another CLI than the one it installs. Decide before the exam spends (the spec's H7 repair notes)` };
  const tunedSha = Object.fromEntries(tuned.files.map((f) => [f.path, sha(f.bytes)]));
  const checkoutSha = Object.fromEntries(bundle.files.map((f) => [f.path.slice(SKILL_NAME.length + 1), f.sha256]));
  const docs = topics.filter((t) => tunedSha[`references/${t}.md`] !== checkoutSha[`references/${t}.md`]);
  if (docs.length) return { refusal: `${moved}, and \`noacg docs ${docs.join(', ')}\` would print text tuning never saw: the sessions run this checkout's CLI, which prints the checkout's references. Pin those before the exam spends (the spec's H7 repair notes)` };
  return { pinned: true, files: tuned.files, note: `${moved}: ${phase} runs the lock's skill as tuned, from ${tuned.commit.slice(0, 9)}. Agent v${lock.agent.version} pins it on the server and the reference arm's plugin is built from it; H9 reconciles the product's skill with it` };
}
