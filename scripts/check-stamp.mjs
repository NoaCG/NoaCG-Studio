#!/usr/bin/env node
// THE `/check` VERDICT STAMP - written by a command, not by hand.
//
//   node scripts/check-stamp.mjs --review inline:1/1 --simplify inline:1/1 --verify inline
//   node scripts/check-stamp.mjs --review delegated:3/2 --simplify "not run" --verify inline
//   node scripts/check-stamp.mjs ... --json     # print the stamp instead of only its path
//
// WHY THIS EXISTS, and why it is a script rather than another paragraph in the workflow.
//
// `.agent-workflows/check.md` ends by telling the session to write one JSON file into the shared
// job store: the branch, the merge base, the sha that was reviewed, the file list, and one entry
// per leg saying whether that leg actually ran. `scripts/jobs.mjs add-merge` reads it and refuses a
// tip the stamp does not cover, so this file is what lets a finished branch queue at all.
//
// It was the only step in the whole chain with no command behind it. Every session invented its
// own way to write it - an inline `node -e`, a heredoc through python, a copy from a scratch file -
// which cost three things at once. The shape drifted, because a JSON object retyped out of a
// paragraph is retyped differently every time (18 of the 68 stamps on this machine on 2026-09-06
// held an abbreviated sha, which `stampGap` had to be taught to accept). The scope was retyped
// too, when `review-request.mjs --json` already knew it. And an ad-hoc interpreter call writing
// into `.git/` is the shape a sandbox refuses: on 2026-09-10 a finished, verified branch could not
// be queued at all until a person copied the file in by hand - the work was done and the landing
// was blocked on the one step in the chain nobody had ever automated.
//
// THE VERDICT IS DERIVED, NEVER DECLARED. check.md is explicit that "a check carrying a `not run`
// leg has not passed, and says so", and that is exactly the sentence a session under pressure
// writes `pass` over. So the verdict is computed from the legs and there is no flag to raise it:
// a `not run` leg makes the verdict `fail`, full stop. `--fail` records a check that ran and did
// not pass; nothing records one that did not run and did.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { jobsDir, stampGap } from './jobs-store.mjs';

// The worktree this file belongs to, never `process.cwd()`. Several worktrees of this repository
// are normally live at once, and a stamp answered for whichever directory a session happened to be
// sitting in would name another branch's sha - the same failure `review-request.mjs` resolves the
// same way, for the same reason.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The leg modes check.md defines. Anything else is a typo, and a typo must not become a verdict. */
export const MODES = Object.freeze(['delegated', 'inline', 'discarded+inline', 'not run']);

/** The three legs, in the order check.md reports them. */
export const LEGS = Object.freeze(['review', 'simplify', 'verify']);

/**
 * One leg, from `<mode>` or `<mode>:<findings>/<fixed>`.
 *
 * The counts are optional to type because `verify` rarely has any and a session should not have to
 * write `:0/0` to say so. They are not optional in the stamp: absent counts read as zero findings,
 * which is a claim, so it is recorded as one.
 *
 * `not-run` and `not_run` are accepted for `not run`, because the alternative to accepting them is
 * a session mistyping the one mode that must never be silently dropped.
 *
 * @returns {{mode: string, findings: number, fixed: number}}
 */
export function parseLeg(value, leg = 'leg') {
  const text = String(value ?? '').trim();
  if (!text) throw new Error(`--${leg} needs a mode (${MODES.join(' | ')})`);
  const [rawMode, counts] = splitOnce(text, ':');
  const mode = rawMode.trim().toLowerCase().replace(/[-_\s]+/g, ' ');
  if (!MODES.includes(mode)) {
    throw new Error(`--${leg} mode "${rawMode.trim()}" is not one of: ${MODES.join(' | ')}`);
  }
  if (counts === null) return { mode, findings: 0, fixed: 0 };
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(counts.trim());
  if (!match) throw new Error(`--${leg} counts "${counts.trim()}" must read <findings>/<fixed>, e.g. 3/2`);
  const findings = Number(match[1]);
  const fixed = Number(match[2]);
  if (fixed > findings) {
    throw new Error(`--${leg} says ${fixed} fixed of ${findings} found - fixed cannot exceed findings`);
  }
  return { mode, findings, fixed };
}

/** `a:b:c` -> `['a', 'b:c']`, and `a` -> `['a', null]`. */
function splitOnce(text, separator) {
  const at = text.indexOf(separator);
  return at === -1 ? [text, null] : [text.slice(0, at), text.slice(at + separator.length)];
}

/**
 * The verdict, from the legs alone.
 *
 * A leg that did not run is the whole reason this is computed rather than passed in. check.md:
 * "a weaker check reported as a full one is worse than an honest gap, because it is the version
 * that survives into the record."
 */
export function deriveVerdict(legs, { failed = false } = {}) {
  const notRun = LEGS.filter((name) => legs[name]?.mode === 'not run');
  if (notRun.length) return { verdict: 'fail', why: `${notRun.join(' and ')} did not run` };
  if (failed) return { verdict: 'fail', why: 'reported as failing with --fail' };
  return { verdict: 'pass', why: null };
}

/** The stamp object, in the shape check.md documents and `jobs-store` reads. */
export function buildStamp({ scope, reviewedSha, legs, verdict, model = null, effort = null, at }) {
  const leg = (entry) => ({
    mode: entry.mode,
    findings: entry.findings,
    fixed: entry.fixed,
    ...(model ? { model } : {}),
    ...(effort ? { effort } : {}),
  });
  return {
    v: 1,
    branch: scope.branch,
    mergeBase: scope.mergeBase,
    reviewedSha,
    files: scope.files,
    legs: Object.fromEntries(LEGS.map((name) => [name, leg(legs[name])])),
    verdict,
    at,
  };
}

/** Where this branch's stamp goes - the same name `jobs-store.readReviewStamp` opens. */
export function stampPath(dir, branch) {
  return path.join(dir, 'checks', `${String(branch).replaceAll('/', '-')}.json`);
}

function git(args) {
  const run = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${(run.stderr || '').trim()}`);
  return run.stdout.trim();
}

/**
 * The scope the review was handed, from the one command that computes it.
 *
 * Read rather than retyped, so the stamp cannot disagree with what the review was actually given -
 * which is the only reason to record the scope in the stamp at all.
 */
function readScope() {
  const run = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'review-request.mjs'), '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (run.status !== 0) throw new Error(`review-request.mjs --json failed: ${(run.stderr || '').trim()}`);
  const scope = JSON.parse(run.stdout);
  if (!scope.branch || !scope.mergeBase) throw new Error('review-request.mjs --json returned no branch or merge base');
  return scope;
}

/**
 * TRACKED changes in the working tree - the ones that would make this stamp a lie.
 *
 * A stamp says "this sha was checked". Uncommitted tracked changes mean the checked state is not
 * the committed state, and the session's next commit moves the tip and invalidates the stamp in
 * any case. Untracked files are left alone: a scratch file beside the work is not a change to it.
 */
export function trackedChanges(status) {
  return String(status ?? '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line && !line.startsWith('??'));
}

function flag(argv, name) {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? null : argv[at + 1] ?? '';
}

export function main(argv = process.argv.slice(2)) {
  try {
    const legs = {
      review: parseLeg(flag(argv, 'review') ?? 'inline', 'review'),
      simplify: parseLeg(flag(argv, 'simplify') ?? 'inline', 'simplify'),
      verify: parseLeg(flag(argv, 'verify') ?? 'inline', 'verify'),
    };
    const dirty = trackedChanges(git(['status', '--porcelain=v1']));
    if (dirty.length) {
      console.error(`Not stamping: ${dirty.length} tracked change(s) are uncommitted, so the sha this`);
      console.error('stamp would name does not hold what was checked. Commit them, then run this again.\n');
      for (const line of dirty.slice(0, 10)) console.error(`  ${line}`);
      if (dirty.length > 10) console.error(`  ... and ${dirty.length - 10} more`);
      return 1;
    }

    const scope = readScope();
    const reviewedSha = git(['rev-parse', 'HEAD']);
    const { verdict, why } = deriveVerdict(legs, { failed: argv.includes('--fail') });
    const stamp = buildStamp({
      scope,
      reviewedSha,
      legs,
      verdict,
      model: flag(argv, 'model') ?? process.env.NOACG_CHECK_MODEL ?? null,
      effort: flag(argv, 'effort'),
      at: new Date().toISOString(),
    });

    // WRITE NOTHING THE QUEUE WOULD REJECT. `stampGap` is what `add-merge` runs against this file,
    // so running it here turns an unusable stamp into an error now rather than a refusal later,
    // when the session that could have explained it has ended.
    const gap = stampGap(stamp, reviewedSha);
    if (gap && verdict === 'pass') {
      throw new Error(`refusing to write a stamp the landing queue would reject: ${gap}`);
    }

    const dir = jobsDir();
    if (!dir) throw new Error('no git checkout, so there is no job store to write into');
    const file = stampPath(dir, scope.branch);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(stamp, null, 2)}\n`);

    if (argv.includes('--json')) console.log(JSON.stringify(stamp, null, 2));
    else {
      console.log(`Stamped ${scope.branch} at ${reviewedSha.slice(0, 8)}: ${verdict.toUpperCase()}${why ? ` - ${why}` : ''}`);
      for (const name of LEGS) {
        const entry = stamp.legs[name];
        const counts = entry.findings || entry.fixed ? `  ${entry.fixed}/${entry.findings} fixed` : '';
        console.log(`  ${name.padEnd(9)} ${entry.mode}${counts}`);
      }
      console.log(`  ${scope.files.length} file(s) against ${scope.mergeBase.slice(0, 8)}`);
      console.log(`  -> ${file}`);
    }
    // A failing verdict is REPORTED, not thrown: the stamp is the honest record of a check that did
    // not pass, and writing it is the right outcome. The exit code is what a caller reads.
    return verdict === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(`check-stamp: ${error.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main());
}
