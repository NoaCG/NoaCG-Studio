#!/usr/bin/env node
// gate: build
// guards: package.json, scripts/**, cli/scripts/**, .github/workflows/**
//
// EVERY GATE DECLARES WHERE IT RUNS AND WHAT IT GUARDS, AND THIS IS WHAT KEEPS IT TRUE.
//
//   node scripts/check-gate-coverage.mjs      # part of `npm run build`, through scripts/gates.mjs
//
// A `check:*` or `test:*` script in package.json is a promise: somebody wrote a rule down and
// made it executable. The promise is worth nothing if the only thing that ever runs it is a
// person who remembers to type it.
//
// WHAT IT COST. On 2026-09-06 a nine-row orchestrator wave landed RED. `test:use-case-search`
// held the one rule that would have caught it - an occasion must not widen a word that already
// names one shelf - and it ran in NO workflow at all, because it needs Chromium and so sits
// outside `npm run build`. The row that wrote it was a cloud container with no browser budget,
// so it never ran there either. Nine hours passed between the defect being written and CI
// meeting it, and the check that found it takes 27 seconds.
//
// THE FIRST VERSION asked "does the build line, or a workflow, or an exemption name this gate?"
// and that question had one cheap answer: make the build line longer. The line became the most
// conflicted thing in the repository (docs/WORKFLOW_ARCHITECTURE.md §1.4). THE QUESTION IS NOW
// INVERTED: each gate says in its own header where it runs and which paths it guards,
// scripts/gates.mjs discovers the gates from those headers, and this check is its `audit` - the
// rules are in that file, beside the discovery they judge.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { audit } from './gates.mjs';
import { measured } from './measured.mjs';

function main() {
  const { problems, checks, tests } = audit();
  // The set this audit judged. Zero means the discovery stopped finding gates, not that every
  // gate is well formed.
  measured(checks.length + tests.length, 'gates audited');
  if (problems.length > 0) {
    console.error(`\ncheck-gate-coverage: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    return 1;
  }
  const tiers = {};
  for (const g of [...checks, ...tests]) tiers[g.header.gate] = (tiers[g.header.gate] ?? 0) + 1;
  console.log(`check-gate-coverage: OK - ${checks.length} check(s) and ${tests.length} test file(s) declare their tier and guards (${Object.entries(tiers).map(([k, v]) => `${k} ${v}`).join(', ')}).`);
  return 0;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(main());
