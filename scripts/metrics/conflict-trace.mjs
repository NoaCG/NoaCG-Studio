#!/usr/bin/env node
// Where merges actually needed a resolution (docs/WORKFLOW_ARCHITECTURE.md §1.4).
//
//   npm run metrics:conflicts                # last 45 days
//   npm run metrics:conflicts -- --days 30
//
// A merge commit region that matches NEITHER parent is the trace of a real conflict resolution
// (`git show --cc` prints such files as `diff --cc <file>`). Files that merged cleanly leave no
// trace, so this counts what cost somebody a decision, not what merely changed. Landings here are
// fast-forwards, so the trace lives in the "Merge branch 'main' into <branch>" commits; every
// merge commit reachable from main in the window is read.

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

export function classify(file) {
  if (file === 'package.json' || file === 'package-lock.json') return 'package';
  if (/\.(json)$/.test(file) && /baseline/.test(file)) return 'baseline';
  if (/(^|\/)(AGENTS|CLAUDE)\.md$/.test(file) || file.startsWith('contracts/')) return 'contract';
  if (file.endsWith('.md')) return 'doc';
  if (/\.(ts|tsx|mjs|js|css|yml|yaml|html|sql)$/.test(file)) return 'code';
  return 'other';
}

function main() {
  const args = process.argv.slice(2);
  const days = args.includes('--days') ? Number(args[args.indexOf('--days') + 1]) : 45;
  // One git call for the whole window: each merge prints its own `@@<sha>` line followed by the
  // `diff --cc` headers of the files that needed a resolution. One spawn per merge cost about 33 s
  // over a 45-day window; this takes under a second.
  const stream = git(['log', '--merges', `--since=${days}.days`, '--cc', '--format=@@%H', 'origin/main']);
  const merges = [];
  let current = null;
  for (const line of stream.split('\n')) {
    // A combined-diff hunk header also starts with `@@` (`@@@ -1,3 -1,3 +1,3 @@@`); only a bare sha
    // after the marker is a merge boundary.
    if (/^@@[0-9a-f]{40}$/.test(line)) {
      current = { sha: line.slice(2), files: [] };
      merges.push(current);
    } else if (current && line.startsWith('diff --cc ')) current.files.push(line.slice('diff --cc '.length));
  }
  const perFile = new Map();
  const perClass = new Map();
  let withConflict = 0;
  const shape = { codeOnly: 0, mdOnly: 0, both: 0 };
  for (const { files } of merges) {
    if (files.length === 0) continue;
    withConflict += 1;
    let code = false;
    let md = false;
    for (const f of files) {
      perFile.set(f, (perFile.get(f) ?? 0) + 1);
      const cls = classify(f);
      perClass.set(cls, (perClass.get(cls) ?? 0) + 1);
      if (cls === 'code') code = true;
      if (cls === 'contract' || cls === 'doc') md = true;
    }
    if (code && md) shape.both += 1;
    else if (code) shape.codeOnly += 1;
    else if (md) shape.mdOnly += 1;
  }
  console.log(`[metrics:conflicts] last ${days} days: ${merges.length} merge commits, ${withConflict} with a resolution (${merges.length ? ((100 * withConflict) / merges.length).toFixed(1) : 0}%)`);
  console.log(`  shape per merge: code-only ${shape.codeOnly}, md-only ${shape.mdOnly}, both ${shape.both}`);
  console.log('  file entries by class:');
  for (const [cls, n] of [...perClass.entries()].sort((a, b) => b[1] - a[1])) console.log(`    ${String(n).padStart(5)}  ${cls}`);
  console.log('  most-resolved files:');
  for (const [f, n] of [...perFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${String(n).padStart(5)}  ${f}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
