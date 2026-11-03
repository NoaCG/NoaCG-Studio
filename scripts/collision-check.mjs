#!/usr/bin/env node
// THE COLLISION CHECK - would this unit edit what a running row is already editing?
//
//   node scripts/collision-check.mjs --owns "src/components/home/, src/model/shows.ts" [--specs "library.spec.ts"]
//   node scripts/collision-check.mjs --plan <wave-plan.local.md> --letter H
//   node scripts/collision-check.mjs ... --branch claude/h-thing   # ignore the candidate's own branch
//   node scripts/collision-check.mjs ... --json
//
// WHY. The plan-time collision pass compares FORECASTS: what each row said it would touch. On
// 2026-09-04 row C's forecast named three files and its diff touched none of them, so two rows
// waited 79 minutes on a collision that did not exist while the real neighbour (drawnState.ts)
// went unnoticed. The refilling loop launches units all night, long after the plan was written,
// so it checks a candidate against what the running rows have ACTUALLY changed - the committed
// and uncommitted files in every live worktree and every branch ahead of main
// (`worktree-activity.mjs`) - and against the e2e specs that cover those files
// (`e2e-affected.mjs`), because two rows that change one user-visible flow share its tests
// whatever their file lists say.
//
// Verdict: exit 0 CLEAR, exit 1 COLLIDES (with which branch, on which files and which specs).
// A side whose coverage plan is `full` (a core file, or an unmapped one) is reported as a
// CAUTION rather than a collision: "everything" intersecting "everything" is not information.
// This script decides nothing about whether to launch; the loop reads the verdict.

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { planFor } from './e2e-affected.mjs';
import { scanActivity } from './worktree-activity.mjs';
import { parsePromptBlocks } from './wave-plan-check.mjs';

/** `OWNS` entries: paths (a directory ends with `/`, a glob carries `*`) split from `specs:`. */
export function parseOwns(line) {
  const text = String(line ?? '').replace(/^OWNS\s+/i, '').replace(/`/g, '');
  const [filesPart, specsPart = ''] = text.split(/\bspecs?:\s*/i);
  const split = (part) => part.split(/[,;]/).map((entry) => entry.trim()).filter(Boolean).filter((entry) => !/\s/.test(entry));
  return { files: split(filesPart), specs: split(specsPart).map((spec) => spec.replace(/^e2e\//, '')) };
}

function normalise(file) {
  return String(file).replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
}

/** Does `file` fall under one of the owned patterns? Directory prefix, `*` glob, or equality. */
export function matchesOwned(file, patterns) {
  const target = normalise(file);
  return patterns.some((raw) => {
    const pattern = normalise(raw).replace(/\s*\(new\)$/, '');
    if (pattern.endsWith('/')) return target.startsWith(pattern);
    if (pattern.includes('*')) {
      const regex = new RegExp(`^${pattern.split('*').map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
      return regex.test(target);
    }
    return target === pattern;
  });
}

/**
 * A row's covering specs: what its files select, without the critical journeys every product change
 * also runs (cicd-followup cf12). Those ten are planned for every product row, so they are no row's
 * territory; counting them would make every pair of product rows collide.
 */
const territory = (files) => planFor(files, { critical: [] });

/**
 * The verdict, pure. `entries` are `{ name, branch, files }` from the activity scan;
 * `coverage(files)` returns `{ mode, specs }` (e2e-affected's `planFor`).
 */
export function collisions({ files, specs = [], branch = null }, entries, coverage = territory) {
  const own = coverage(files.filter((file) => !file.includes('*') && !file.endsWith('/')));
  const ownSpecs = new Set([...own.specs, ...specs].map((spec) => spec.replace(/^e2e\//, '')));
  const hits = [];
  const cautions = [];
  for (const entry of entries) {
    if (branch && entry.branch === branch) continue;
    const label = entry.branch ?? entry.name ?? 'a detached worktree';
    const sharedFiles = entry.files.filter((file) => matchesOwned(file, files));
    const theirs = coverage(entry.files);
    const sharedSpecs = theirs.specs.filter((spec) => ownSpecs.has(spec));
    if (sharedFiles.length || sharedSpecs.length) {
      hits.push({ branch: label, files: sharedFiles, specs: sharedSpecs });
    } else if (own.mode === 'full' || theirs.mode === 'full') {
      cautions.push({ branch: label, reason: own.mode === 'full' ? 'the candidate touches a core or unmapped file, so its covering specs are "everything"' : `${label} touches a core or unmapped file, so its covering specs are "everything"` });
    }
  }
  return { clear: hits.length === 0, hits, cautions, ownSpecs: [...ownSpecs].sort(), ownMode: own.mode };
}

export function formatVerdict(candidate, verdict) {
  const lines = [];
  if (verdict.clear) lines.push(`CLEAR - nothing live edits ${candidate.files.join(', ') || 'these files'} or their covering specs (${verdict.ownSpecs.join(', ') || 'none mapped'}).`);
  else {
    lines.push(`COLLIDES - ${verdict.hits.length} live branch(es) share this unit's territory:`);
    for (const hit of verdict.hits) {
      lines.push(`  ${hit.branch}: files ${hit.files.join(', ') || '-'}; specs ${hit.specs.join(', ') || '-'}`);
    }
    lines.push('  Chain the unit behind that branch, or give it a different territory. Never launch it beside them.');
  }
  for (const caution of verdict.cautions) lines.push(`  caution: ${caution.reason}`);
  return lines.join('\n');
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

export async function main(argv = process.argv.slice(2), { cwd = process.cwd() } = {}) {
  let candidate;
  const plan = argValue(argv, '--plan');
  const letter = argValue(argv, '--letter');
  if (plan && letter) {
    const file = path.resolve(plan);
    if (!existsSync(file)) {
      process.stderr.write(`collision-check: no plan at ${file}\n`);
      return 2;
    }
    const block = parsePromptBlocks(readFileSync(file, 'utf8')).get(letter);
    const ownsLine = block?.lines.find((line) => /^\s*(OWNS|TOUCHES)\b/.test(line));
    if (!ownsLine) {
      process.stderr.write(`collision-check: SESSION ${letter} has no OWNS line in ${path.basename(file)}\n`);
      return 2;
    }
    candidate = parseOwns(ownsLine.replace(/^\s*TOUCHES/, 'OWNS'));
    const branchLine = block.lines.find((line) => /^\s*BRANCH\b/.test(line));
    candidate.branch = argValue(argv, '--branch') ?? branchLine?.trim().split(/\s+/)[1] ?? null;
  } else if (argValue(argv, '--owns')) {
    candidate = parseOwns(argValue(argv, '--owns'));
    candidate.specs = [...candidate.specs, ...parseOwns(`specs: ${argValue(argv, '--specs') ?? ''}`).specs];
    candidate.branch = argValue(argv, '--branch') ?? null;
  } else {
    process.stdout.write('Usage: node scripts/collision-check.mjs (--owns "<paths>" [--specs "<specs>"] | --plan <path> --letter <L>) [--branch <own>] [--json]\n');
    return 2;
  }
  const activity = await scanActivity(cwd);
  const entries = [
    ...activity.worktrees.map((entry) => ({ name: entry.name, branch: entry.branch, files: entry.files })),
    ...activity.branches.map((entry) => ({ name: entry.branch, branch: entry.branch, files: entry.files })),
  ];
  const verdict = collisions(candidate, entries);
  if (argv.includes('--json')) process.stdout.write(`${JSON.stringify({ candidate, ...verdict }, null, 2)}\n`);
  else process.stdout.write(`${formatVerdict(candidate, verdict)}\n`);
  return verdict.clear ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code), (error) => {
    process.stderr.write(`collision-check: ${error.message}\n`);
    process.exit(2);
  });
}
