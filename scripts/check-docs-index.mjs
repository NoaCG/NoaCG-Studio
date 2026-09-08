#!/usr/bin/env node
// gate: build
// guards: docs/**, README.md
//
// THE docs/README.md MAP IS COMPLETE, AND THIS IS WHAT KEEPS IT THAT WAY.
//
//   node scripts/check-docs-index.mjs        # part of `npm run build`
//
// `docs/README.md` calls itself "the map of this directory", and a session reads it to find out
// whether a subject is already written down. On 2026-08-30 it carried 59 rows for 110 files, and
// said nothing about the gap - so a missing row read as "no doc exists", and the session either
// re-derived something already measured or wrote a second doc on the same subject. Two docs on
// one subject is how contracts start contradicting each other. A warning in the header would
// only stop the wrong inference; a list is the instrument, and a list nothing watches drifts
// back within a month, which is how it drifted this far.
//
// Three rules, and each fails CLOSED - the check names the files and exits non-zero:
//
//  1. MISSING - a top-level `docs/*.md` with no row. The map claims completeness, so this is
//     the rule the map is about. Subdirectories are deliberately exempt: `backlog/` has its own
//     README contract, `handoffs/` is one file per session and `acceptance/owner-queue/` is
//     transient by design. They are described as directories in the README instead.
//  2. ORPHANED - a row naming a file that is not there. A rename leaves one behind pointing at
//     nothing, which is worse than no row: it sends a reader after a file that moved.
//  3. DUPLICATED - the same file named by two rows. This is the merge hazard specifically:
//     two branches adding a row for the same doc in different sections merge CLEANLY and leave
//     the map self-contradictory, with nothing to notice it.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** True only when this file was RUN, not imported - the same guard the other checks carry. */
const isEntrypoint =
  Boolean(process.argv[1]) &&
  resolve(process.argv[1]).replaceAll('\\', '/').toLowerCase() ===
    resolve(fileURLToPath(import.meta.url)).replaceAll('\\', '/').toLowerCase();

/**
 * Every doc named by a table row, in order, as written.
 *
 * Anchored at the start of a line and at the first cell, so a doc MENTIONED in another row's
 * prose is not counted. That distinction is the whole measurement: a substring search over the
 * README counts prose mentions and reports the map as far more complete than it is.
 *
 * @param {string} readme  the text of docs/README.md
 * @returns {string[]} paths relative to docs/, e.g. 'OGRAF.md', 'acceptance/OWNER_QUEUE.md'
 */
export function indexedDocs(readme) {
  return [...readme.matchAll(/^\|\s*`([A-Za-z0-9_./-]+\.md)`/gm)].map((m) => m[1]);
}

/**
 * The three findings, as data - so the rules are testable without a docs/ directory.
 *
 * @param {string[]} docFiles  top-level docs/*.md names, README.md excluded
 * @param {string[]} allDocPaths  every .md path under docs/, relative to docs/
 * @param {string} readme
 * @returns {{ missing: string[], orphaned: string[], duplicated: string[] }}
 */
export function auditDocsIndex(docFiles, allDocPaths, readme) {
  const rows = indexedDocs(readme);
  const present = new Set(allDocPaths);
  // How many rows name each doc: one pass answers both "is it indexed" and "is it indexed
  // twice", so the two questions cannot disagree about what the rows say.
  const rowCount = new Map();
  for (const row of rows) rowCount.set(row, (rowCount.get(row) ?? 0) + 1);
  const named = [...rowCount.keys()];
  return {
    missing: docFiles.filter((f) => !rowCount.has(f)),
    orphaned: named.filter((r) => !present.has(r)),
    duplicated: named.filter((r) => rowCount.get(r) > 1),
  };
}

/**
 * Every .md under docs/ that a COMMIT would carry, relative to docs/, forward slashes.
 *
 * GIT is asked, not the filesystem, so this verdict is the same on a laptop as on CI's clean
 * checkout. Reading the directory instead made the two disagree in both directions: a scratch
 * note left at `docs/NOTES.md` failed the local build as a missing doc, and the obvious remedy -
 * commit the row, the file being untracked - then failed CI as a row naming a file that is not
 * there. A gate whose two failure modes point at each other teaches people to ignore it.
 *
 * `--cached` is what is committed; `--others --exclude-standard` adds files not yet staged but
 * on their way in, so a doc written in this session counts before `git add`. Ignored files are
 * excluded, which is the escape hatch for a genuine scratch note: gitignore it.
 */
function allDocPaths() {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '--', 'docs'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return [
    ...new Set(
      out
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l.endsWith('.md'))
        .map((l) => l.replace(/\\/g, '/').replace(/^docs\//, '')),
    ),
  ];
}

/** A literal backtick. Named, because the fix lines below quote markdown that is full of them. */
const BT = '`';

function main() {
  const readme = readFileSync(resolve(ROOT, 'docs/README.md'), 'utf8');
  const paths = allDocPaths();
  const topLevel = paths.filter((p) => !p.includes('/') && p !== 'README.md');
  const { missing, orphaned, duplicated } = auditDocsIndex(topLevel, paths, readme);
  // Both sides of the comparison report, because either can empty on its own: a docs/ read that
  // stopped matching would leave nothing to look for, and a README table that stopped parsing
  // would leave nothing to look in - and either one alone still reads as a clean pass.
  measured(topLevel.length, 'top-level docs');
  measured(indexedDocs(readme).length, 'docs/README.md index rows');

  // A gate that fails closed is only as good as what it tells the person who trips it, and the
  // likeliest way to trip THIS one is a merge that brings in a doc written on another branch -
  // where the person reading the failure did not write the file and has no idea what to say
  // about it. So each finding prints the exact line to paste and where to paste it, not just a
  // rule that was broken.
  const report = (label, list, why, fix) => {
    if (list.length === 0) return false;
    console.error(`\ncheck-docs-index: ${list.length} ${label}`);
    for (const f of list) console.error(`  - docs/${f}\n${fix(f)}`);
    console.error(`  ${why}`);
    return true;
  };
  const bad = [
    report('doc(s) with no row in docs/README.md', missing,
      'Pick the section by what the doc IS today - read its header. A finished plan belongs under rationale/historical, not active plans. A scratch note that should not be indexed belongs in .gitignore or in a subdirectory instead; never commit a row for a file you are not committing.',
      (f) => `      add a row to docs/README.md, under "Binding contracts" / "Active plans" / "Rationale / historical":\n        | ${BT}${f}${BT} | <one line: what it is the contract for, or its status> |`),
    report('row(s) naming a file that is not there', orphaned,
      'A row pointing at nothing is worse than no row: it sends a reader after a file that moved.',
      (f) => `      the row starting  | ${BT}${f}${BT} |  in docs/README.md names a file that does not exist - point it at the new path, or delete the row.`),
    report('doc(s) named by more than one row', duplicated,
      'Two rows for one doc merge cleanly and leave the map self-contradictory, which is why this is checked rather than trusted.',
      (f) => `      docs/README.md has more than one row starting  | ${BT}${f}${BT} |  - keep the one in the right section and delete the rest.`),
  ].some(Boolean);

  if (bad) {
    console.error(`\ncheck-docs-index: FAILED. ${topLevel.length} top-level docs, ${indexedDocs(readme).length} rows in docs/README.md.\n`);
    return 1;
  }
  // "top-level" is load-bearing, not padding. There are far more .md files under docs/ than
  // there are rows, because the subdirectories are exempt by design - and a success line that
  // claimed all of them would invite exactly the wrong inference this gate exists to prevent:
  // that a `docs/backlog/*.md` absent from the tables is a doc that does not exist.
  console.log(
    `check-docs-index: OK - all ${topLevel.length} top-level docs in docs/ have exactly one row in docs/README.md (subdirectories are exempt).`,
  );
  return 0;
}

if (isEntrypoint) process.exit(main());
