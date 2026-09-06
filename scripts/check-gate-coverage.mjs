#!/usr/bin/env node
// EVERY GATE HAS A HOME THAT RUNS IT, AND THIS IS WHAT KEEPS IT THAT WAY.
//
//   node scripts/check-gate-coverage.mjs      # part of `npm run build`
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
// meeting it, and the check that found it takes 27 seconds. The row's own handoff had already
// named the gap in prose ("One line in `ci.yml` beside `check:catalog-emit` closes it") and
// prose is what it stayed.
//
// THE RULE. A gate-shaped script is covered when `npm run build` runs it, or a workflow names
// it, or this file exempts it BY NAME WITH A REASON. There is no fourth way, and the exemption
// list is checked against reality in both directions: an exemption for a script that no longer
// exists, or that has since been wired up, is itself a failure. A list nobody prunes is how the
// last one rotted.
//
// Deliberately not clever about it. It reads text and looks for the script's name and its
// `scripts/*.mjs` entry points; it does not parse YAML or resolve shell. A gate invoked by some
// route this cannot see is an exemption with a reason, which is cheap and leaves a record.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** A script whose name starts with one of these is a promise that something runs it. */
export const GATE_PREFIXES = ['check:', 'test:'];

/**
 * Gates that nothing automatic runs, and why that is the right answer for each.
 *
 * A REASON IS NOT OPTIONAL. The point of the list is that the next reader can tell a deliberate
 * choice from an oversight without going and asking, so "not wired yet" is not a reason - it is
 * the defect this file exists to catch.
 */
export const EXEMPT = {
  'test:e2e:queued': 'the queue wrapper - waits for this machine\'s one browser slot, meaningless on a runner',
  'test:e2e:affected:queued': 'queue wrapper, as above',
  'test:e2e:focus:queued': 'queue wrapper, as above',
  'test:e2e:integration:queued': 'queue wrapper, as above',
  'test:e2e:live:queued': 'queue wrapper around the live suite, which needs a hosted deployment',
  'test:e2e:runs': 'reports which browser jobs are running on this machine; not a gate at all',
  'check:catalog-cost': 'REPORTS and never gates, by its own header - a number to read before agreeing to more designs',
  'check:e2e-durations': 'the --check half only reports drift; record:e2e-durations is what changes the table',
  'check:freshness': 'REPORTS weekly and is deliberately not a gate (docs/STACK_FRESHNESS.md)',
  'check:advisors': 'reads the live Supabase project, so it needs credentials no runner holds',
};

const ENTRY_POINT = new RegExp('scripts/[A-Za-z0-9_.-]+(?:/[A-Za-z0-9_.-]+)*\\.mjs', 'g');

/** Every `scripts/*.mjs` file a command line would execute. */
export function entryPointsOf(command) {
  return [...new Set(command.match(ENTRY_POINT) ?? [])];
}

/**
 * The gate-shaped script names, in package.json order.
 * @param {Record<string, string>} scripts
 */
export function gateNames(scripts) {
  return Object.keys(scripts).filter((name) => GATE_PREFIXES.some((p) => name.startsWith(p)));
}

/**
 * @param {{ scripts: Record<string, string>, workflowText: string, exempt?: Record<string, string> }} input
 * @returns {string[]} one line per problem, empty when every gate has a home
 */
export function auditGateCoverage({ scripts, workflowText, exempt = EXEMPT }) {
  const problems = [];
  const build = scripts.build ?? '';
  const names = gateNames(scripts);

  const coverageOf = (name) => {
    const command = scripts[name];
    const entries = entryPointsOf(command);
    if (entries.length > 0 && entries.every((e) => build.includes(e))) return 'npm run build';
    if (workflowText.includes(`npm run ${name}`)) return 'a workflow, by name';
    if (entries.length > 0 && entries.every((e) => workflowText.includes(e))) {
      return `a workflow, via ${entries.join(' + ')}`;
    }
    return null;
  };

  for (const name of names) {
    if (coverageOf(name)) continue;
    if (Object.prototype.hasOwnProperty.call(exempt, name)) {
      if (!exempt[name] || exempt[name].trim() === '') {
        problems.push(`"${name}" is exempt with an empty reason - say why nothing runs it, or wire it up`);
      }
      continue;
    }
    problems.push(
      `"${name}" is run by nothing: not by \`npm run build\`, not by any workflow. ` +
        'Add it to a CI job, or add it to EXEMPT in scripts/check-gate-coverage.mjs with the reason.',
    );
  }

  // The list stays honest in the other direction too, or it rots into decoration.
  for (const name of Object.keys(exempt)) {
    if (!Object.prototype.hasOwnProperty.call(scripts, name)) {
      problems.push(`EXEMPT names "${name}", which is not a script in package.json any more - delete the entry`);
      continue;
    }
    const where = coverageOf(name);
    if (where) problems.push(`EXEMPT names "${name}", but ${where} runs it now - delete the entry`);
  }

  return problems;
}

function main() {
  const scripts = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8')).scripts ?? {};
  const dir = path.join(ROOT, '.github', 'workflows');
  const workflowText = readdirSync(dir)
    .filter((name) => name.endsWith('.yml'))
    .map((name) => readFileSync(path.join(dir, name), 'utf8'))
    .join('\n');

  const problems = auditGateCoverage({ scripts, workflowText });
  if (problems.length > 0) {
    console.error(`\ncheck-gate-coverage: ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error('');
    return 1;
  }

  const total = gateNames(scripts).length;
  console.log(`check-gate-coverage: OK - ${total} gate(s), ${Object.keys(EXEMPT).length} exempt with a reason.`);
  return 0;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) process.exit(main());
