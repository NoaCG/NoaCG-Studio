#!/usr/bin/env node
// gate: build
// guards: scripts/**, cli/**
//
// A SCRIPT MAY NOT ASK "HAS THIS LANDED?" OF THE LOCAL `main` BRANCH.
//
//   node scripts/check-landed-ref.mjs        # part of `npm run build`, through scripts/gates.mjs
//
// WHY. `git fetch` moves `origin/main`; it does not move the local `main` branch. Every landing
// used to fast-forward the primary checkout, so the two agreed and it did not matter which one a
// script read. GitHub's merge queue runs on GitHub and touches nothing here: the local ref stopped
// moving the moment the last hand-merge did, and the lag only grows. `scripts/main-ref.mjs` is the
// one answer to the question and carries the full account of what the wrong one has cost.
//
// FOUR SCRIPTS WERE FIXED ONE AT A TIME - `merge-order`, `cleanup-worktrees`' report,
// `worktree-activity`, `jobs` - and on 2026-09-09 two rows that had never spoken hit the fifth
// within hours of each other: `owner-receipts.mjs --serves` told a branch it had closed a receipt
// it never opened and edited five more, because all six had landed days earlier. A sweep found
// that fifth one. A sweep does not find the sixth, which is what this file is for.
//
// WHAT IT REFUSES. A quoted string in `scripts/` or `cli/` that hands the bare name `main` to git
// as a REVISION. Two shapes, because those are the two the defect has actually taken here:
//
//   - a range or path suffix inside the literal: `main...${branch}`, 'main..HEAD', `main:${file}`,
//     'main^', 'main~2' - git reads all of these as revisions and nothing else does;
//   - the exact literal 'main' in an argv, on the hit line or within the two lines ABOVE it,
//     alongside a revision-consuming git verb (`rev-parse`, `merge-base`, `rev-list`, `log`,
//     `diff`, `show`, `--contains`, `--merged`, …). That is the `gitRead([...args, 'main'])` shape
//     the receipts bug was written in, where the verb sits in the argv built on the line before.
//
// Both shapes also read `refs/heads/main`, which is the same branch spelled in full - except in a
// fetch or push REFSPEC (`+refs/heads/main:refs/remotes/origin/main`), which names main on the
// SERVER and is the line that keeps `origin/main` fresh.
//
// A comparison - `branch === 'main'` - is never a hit. Asking whether the CURRENT branch is called
// main is a different question with no stale answer, and it is the commonest use of the word here.
//
// WHAT IT CANNOT SEE, stated because a gate that hides its blind spots is worse than none:
//   - an ABSENT ref. `git log --format=… -- docs/backlog` with no revision walks HEAD, which on a
//     feature branch stops at the fork point. `closedReceipts` had exactly that bug and no
//     scanner can catch it, because there is no token to match. Only a reader finds those, and one
//     did: `docs/backlog/the-weekly-report-walks-head-not-what-landed.md`.
//   - a ref built at a distance: `const ref = 'main'` twenty lines above the git call.
//   - `merge`, `rebase`, `checkout`, `switch` and `reset`, deliberately left out of the verb list.
//     They take a revision, but naming the local branch to them is usually the point - `git merge
//     main` integrates the branch you have - so including them would flag correct code and teach
//     the next reader to skim the failures.
//   - `.md` workflows and `.github/` YAML. The workflows in `.github/` were swept by hand on
//     2026-09-09 and every one of them already reads `origin/main` or `github.ref`; CI checks out
//     fresh, so a stale local ref cannot arise there.
//
// EXEMPTIONS carry a reason and are checked: an entry that matches nothing is a failure, so a
// stale exemption cannot outlive the line it was written for.
//
// It fails CLOSED, naming the file, the line, the literal and what to do instead.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { repositoryFiles } from './gates.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** The source this gate reads: shipped scripts, not their tests. */
export const SCANNED = /^(scripts|cli)\/.*\.(mjs|js|cjs|ts)$/;

/**
 * Tests are exempt as a class. They BUILD their own repositories with `git init -b main` and no
 * remote at all, so a local `main` is the only truthful ref inside a fixture, and a `merge-base`
 * against it is the assertion rather than the bug.
 */
export const IS_TEST = /\.test\.(mjs|js|cjs|ts)$/;

/**
 * This file, which must be able to QUOTE the patterns and exemptions it judges - the same reason
 * `check-retired-names.mjs` does not scan `contracts/records/`. It is safe to skip because it
 * issues no git command of its own: its only git is `repositoryFiles()`, which asks for the file
 * list and never for a revision.
 */
const SELF = 'scripts/check-landed-ref.mjs';

/** A single- double- or back-quoted literal, escapes tolerated, on one line. */
const LITERAL = /(['"`])((?:[^'"`\\\n]|\\.)*?)\1/g;

/**
 * `main` carrying a suffix only git reads: `main...`, `main..`, `main:path`, `main^`, `main~2`.
 * `refs/heads/main` counts - it is the same local branch spelled in full - while `origin/main` and
 * any other path ending in the word do not.
 */
const REVISION_SUFFIX = /(?:^|[^\w./-]|\brefs\/heads\/)main(\.\.\.?|:\S|\^|~\d)/;

/** The whole literal is the bare name, in either spelling of the local branch. */
const BARE = /^(refs\/heads\/)?main$/;

/** A git subcommand or flag that takes a revision. Searched over the hit line and the two above it. */
const REVISION_VERB = /(merge-base|rev-parse|rev-list|cat-file|ls-tree|describe|--contains|--merged|--is-ancestor|['"](log|diff|show)['"])/;

/** The literal is being compared, not passed: `branch === 'main'`. Never a revision. */
const COMPARISON = /(===?|!==?)\s*$/;

/**
 * A fetch or push REFSPEC, which is the opposite of this bug: `+refs/heads/main:refs/remotes/…`
 * names main ON THE SERVER, and it is the line that keeps `origin/main` fresh in the first place.
 * A refspec is recognisable because it maps one ref onto another, and `:refs/` occurs nowhere
 * else - a revision-and-path like `main:docs/backlog/x.md` never has it.
 */
const REFSPEC = /^\+|:refs\//;

/** How many lines above the hit are searched for the verb, because an argv is often split. */
const WINDOW = 2;

/**
 * The uses that are RIGHT, each with the reason it is right. Keyed `path:line-content-fragment`
 * so a line that moves still matches and a line that CHANGES does not.
 *
 * Nothing about `cleanup-worktrees.mjs` appears here: it names both refs and requires containment
 * in each independently, which is a different question ("is this work backed up off this
 * machine?") whose wrong answer deletes work. It never hands a bare `main` to git as a revision,
 * so this gate has nothing to say about it - see the header of `scripts/main-ref.mjs`.
 */
export const ALLOWED = [
  {
    file: 'scripts/worktree-activity.mjs',
    fragment: "'rev-parse', '--verify', '--quiet', 'main'",
    why: 'asks only whether a local `main` BRANCH EXISTS, to decide whether a comparison is possible at all. It reads the landed ref through `mainRef` on the very next line.',
  },
];

/** Every revision-shaped use of the bare local `main` in one file, with the line and the text. */
export function findBareMainRevisions(rel, text) {
  const lines = text.split('\n');
  const found = [];
  lines.forEach((line, index) => {
    // A comment explaining the bug must be able to name it.
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
    // Only the bare-name shape needs the surrounding lines, and it is by far the rarer of the two,
    // so the window is joined on demand rather than for all ~70,000 lines the gate reads.
    const nearVerb = () => REVISION_VERB.test(lines.slice(Math.max(0, index - WINDOW), index + 1).join('\n'));
    let match;
    LITERAL.lastIndex = 0;
    while ((match = LITERAL.exec(line))) {
      const body = match[2];
      if (REFSPEC.test(body)) continue;
      let shape = null;
      if (REVISION_SUFFIX.test(body)) shape = 'a revision range or path';
      else if (BARE.test(body) && !COMPARISON.test(line.slice(0, match.index)) && nearVerb()) shape = 'a bare revision in a git argv';
      if (shape) found.push({ file: rel, line: index + 1, text: line.trim(), literal: match[0], shape });
    }
  });
  return found;
}

/** Split the findings into the exempt and the refused, and report an exemption that matched nothing. */
export function judge(found, allowed = ALLOWED) {
  const used = new Set();
  const problems = [];
  for (const hit of found) {
    const exemption = allowed.find((entry) => entry.file === hit.file && hit.text.includes(entry.fragment));
    if (exemption) used.add(exemption);
    else problems.push(hit);
  }
  const stale = allowed.filter((entry) => !used.has(entry));
  return { problems, exempt: found.length - problems.length, stale };
}

function main() {
  // `repositoryFiles` lists what git TRACKS, so a script deleted from the working tree but not yet
  // staged is still named. Reading it would throw and the build would die with a stack trace
  // instead of a verdict - `check-retired-names.mjs` guards the same case for the same reason.
  const files = repositoryFiles().filter(
    (f) => SCANNED.test(f) && !IS_TEST.test(f) && f !== SELF && existsSync(path.join(ROOT, f)),
  );
  // Zero files means the layout moved and this gate is scanning nothing at all.
  measured(files.length, 'scripts scanned for a bare local `main` revision');

  const found = files.flatMap((rel) => findBareMainRevisions(rel, readFileSync(path.join(ROOT, rel), 'utf8')));
  const { problems, exempt, stale } = judge(found);

  if (stale.length > 0) {
    console.error(`\ncheck-landed-ref: ${stale.length} exemption(s) in ALLOWED match nothing any more:\n`);
    for (const entry of stale) console.error(`  - ${entry.file}: ${entry.fragment}`);
    console.error('\nThe line they excused has moved or been fixed. Delete the entry.\n');
    return 1;
  }

  if (problems.length > 0) {
    console.error(`\ncheck-landed-ref: ${problems.length} script(s) name the local \`main\` branch as a git revision:\n`);
    for (const hit of problems) {
      console.error(`  ${hit.file}:${hit.line}  ${hit.shape}`);
      console.error(`    ${hit.text}`);
    }
    console.error(
      '\nThe local `main` branch stopped moving when landings moved to GitHub\'s merge queue, so it\n' +
        'answers a question about a repository that no longer exists. Import `mainRef` from\n' +
        '`scripts/main-ref.mjs` and ask it which ref means landed - `jobs.mjs`, `merge-order.mjs`,\n' +
        '`worktree-activity.mjs` and `owner-receipts.mjs` all do.\n' +
        'If the bare ref is genuinely the right question here, add it to ALLOWED with the reason.\n',
    );
    return 1;
  }

  console.log(
    `check-landed-ref: OK - ${files.length} script(s) scanned, ` +
      `${exempt} deliberate use(s) of the bare local ref, 0 stale reads.`,
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main());
