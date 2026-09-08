#!/usr/bin/env node
// gate: after-build
// guards: .gitattributes, scripts/**
//
// THE PHANTOM-DIRTY FILE, CAUGHT AND NAMED INSTEAD OF PUZZLED OVER.
//
//   node scripts/check-line-endings.mjs        # part of `npm run build`
//
// WHAT IT LOOKS FOR. A file `git status` calls MODIFIED that `git diff` does not mention at all.
// That is not a paradox and it is not a git bug: on a Windows checkout `core.autocrlf=true` writes
// the working copy with CRLF and caches that size in the index, while every generator in
// `scripts/` writes plain "\n". After the generator runs, the bytes on disk no longer match what
// the index recorded, so status marks the file dirty - and then `git diff` runs the content
// through the clean filter, gets back the very blob already stored, and reports nothing. Nothing
// changed; the file just looks changed. `git update-index --refresh` does not clear it. The fix is
// an `eol=lf` entry in `.gitattributes`, which makes checkout write what the generator writes.
//
// THE TWO SOURCES MUST BOTH BE READ, and the first version of this file read only one. It asked
// `git diff --numstat` for rows of `0 0` - modified, no lines changed - which is what a phantom
// sounds like and is not what it looks like: the clean filter means a phantom produces no numstat
// row whatsoever. Measured by manufacturing one (README.md rewritten with LF): ` M README.md` in
// status, an empty diff, and a gate that said everything was fine. The disagreement BETWEEN the
// two commands is the signal - neither one carries it alone.
//
// WHY IT IS A GATE. `merge-order.mjs` refuses to act on a dirty worktree, correctly - it cannot
// tell a phantom from real uncommitted work, and neither can a person reading `git status`. On
// 2026-08-21 that marked two branches NOT LANDABLE over zero changed lines and stopped a landing
// mid-flight. Queueing is no safer: the commit a phantom leaves out is the one the pull request
// was supposed to carry. `.gitattributes` fixes each case as it is
// found; this is what stops the list going stale, because a generator nobody thought to declare
// announces itself the first time somebody runs it.
//
// WHAT IT CANNOT SEE. A generator that has never been RUN in this checkout has left no phantom to
// find, so a new one still reaches `main` undeclared and surfaces later, on somebody's laptop, in
// the middle of a landing. This narrows that window rather than closing it. It is also silent on
// Linux, where `core.autocrlf` is off and the phenomenon does not exist - which is why it is a
// local gate that happens to run in CI, not a CI gate.
//
// IT CHANGES NOTHING. Two git reads, no writes.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * The phantom-dirty paths: modified according to `git status`, invisible to `git diff`.
 *
 * `status` is read in porcelain v1 form, whose second column is the WORKING TREE state - `M` for
 * a modified file, and that column alone, because a staged change (first column) has already been
 * accepted into the index and is not what makes a tree read dirty here.
 *
 * A path containing a space, a quote or a non-ASCII byte comes back C-quoted (`"src/a b.ts"`).
 * Both commands quote it the same way, so comparing the raw fields is exact; the quotes are
 * stripped only for the message a human reads.
 */
export function findPhantoms(porcelain, diffNames) {
  const changed = new Set(diffNames.split('\n').map((l) => l.trim()).filter(Boolean));
  const phantoms = [];
  for (const line of porcelain.split('\n')) {
    if (line.length < 4) continue;
    // Renames carry `old -> new`, and taking the whole field would compare a string
    // `git diff --name-only` never prints - it prints the DESTINATION alone. `R ` (a staged
    // rename with no further edit) is skipped by the column test below, but `RM` - the shape a
    // file move plus an in-place edit produces, which is every move commit this repo has ever
    // made - reaches here, so the arrow is stripped rather than compared.
    if (line[1] !== 'M') continue;
    const field = line.slice(3);
    const arrow = field.indexOf(' -> ');
    const path = arrow === -1 ? field : field.slice(arrow + 4);
    if (!changed.has(path)) phantoms.push(path);
  }
  return phantoms;
}

/** A C-quoted porcelain path as it reads on screen. Display only - never compared. */
export function unquote(path) {
  if (!path.startsWith('"') || !path.endsWith('"')) return path;
  return path.slice(1, -1).replace(/\\(.)/g, '$1');
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

function main() {
  const phantoms = findPhantoms(
    git(['status', '--porcelain']),
    // `--name-only` alone lists what the diff CAN see. A mode-only change is listed here too, so
    // it never reaches the phantom list - which is right, since a mode flip is a real change.
    git(['diff', '--name-only']),
  );
  if (phantoms.length === 0) {
    console.log('Line endings OK (nothing reads modified that `git diff` cannot see).');
    return 0;
  }
  console.error(
    `${phantoms.length} file(s) read as MODIFIED while \`git diff\` shows nothing - a generator\n` +
      'wrote LF where this checkout expects CRLF:\n',
  );
  for (const path of phantoms) console.error(`  ${unquote(path)}`);
  console.error(
    '\nThe tree is not really dirty, but every tool that asks "is this clean?" - merge-order and\n' +
      'your own `git status` included - will say it is. Declare each path in .gitattributes:\n\n' +
      '  <path> text eol=lf\n\n' +
      'then clear the phantom with `git checkout -- <path>`. If the file is NOT generated, work out\n' +
      'what rewrote it before adding an attribute that would hide the next one.',
  );
  return 1;
}

const isEntrypoint =
  Boolean(process.argv[1]) &&
  process.argv[1].replaceAll('\\', '/').toLowerCase().endsWith('check-line-endings.mjs');
if (isEntrypoint) process.exit(main());
