#!/usr/bin/env node
// Compile the rule store into the loaded contracts (docs/WORKFLOW_ARCHITECTURE.md §5.3).
//
//   node scripts/compile-contracts.mjs            # write .claude/rules/*.md and contracts/index.md
//   node scripts/compile-contracts.mjs --check    # part of `npm run build`: fail if they are stale
//   node scripts/compile-contracts.mjs --report   # bytes per generated file
//
// The generated files are committed, because both harnesses read them from the checkout, and
// they are refused for hand edits (scripts/hooks/guard-edit.mjs). A conflict in one is resolved
// by regenerating, never by merging text. The check fails on: a rule file that does not parse,
// a rule whose text carries evidence, a `fires:` naming a mechanism that is not there, two active
// rules that read as one rule, and a generated file that differs from what the store says.
//
// Phase 0 (2026-09-06) produces ONLY this layer. The hand-written AGENTS.md files stay until
// each area migrates (phase 2b); scripts/check-contract-evidence.mjs keeps them from growing
// evidence in the meantime.

import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileOutputs, findDuplicates, loadRules, OUTPUT_DIR, reportOutputs,
} from './contracts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[compile-contracts]';

/**
 * Everything the store says the generated tree should be, plus every problem found on the way.
 * The outputs are rendered even when there are problems, so a caller that forgets to look at
 * `problems` cannot hand `write()` an empty map and erase the compiled tree.
 */
export function plan(root = ROOT) {
  const { rules, problems } = loadRules(root);
  for (const pair of findDuplicates(rules)) {
    problems.push(
      `${pair.a} and ${pair.b} read as the same rule (similarity ${pair.score.toFixed(2)}) - ` +
        'keep one, and mark the other `status: retired` with `supersedes:` on the survivor',
    );
  }
  return { rules, problems, outputs: compileOutputs(rules) };
}

/** Generated files on disk that the store no longer produces. */
function staleOutputs(outputs, root) {
  const dir = path.join(root, OUTPUT_DIR);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => `${OUTPUT_DIR}/${name}`)
    .filter((rel) => !outputs.has(rel));
}

/** The files whose content on disk differs from the plan (LF-normalised), and the stale ones. */
export function drift(outputs, root = ROOT) {
  const changed = [];
  for (const [rel, content] of outputs) {
    const file = path.join(root, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content) changed.push(rel);
  }
  return { changed, stale: staleOutputs(outputs, root) };
}

export function write(outputs, root = ROOT) {
  for (const [rel, content] of outputs) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  for (const rel of staleOutputs(outputs, root)) unlinkSync(path.join(root, rel));
}

function main() {
  const args = process.argv.slice(2);
  const { rules, problems, outputs } = plan();
  if (problems.length > 0) {
    console.error(`${LABEL} ${problems.length} problem(s) in ${rules.length} rule file(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (args.includes('--report')) {
    for (const { file, bytes } of reportOutputs(outputs)) console.log(`${String(bytes).padStart(7)}  ${file}`);
    console.log(`${LABEL} ${rules.length} rule(s), ${outputs.size - 1} generated contract file(s)`);
    return;
  }
  if (args.includes('--check')) {
    const { changed, stale } = drift(outputs);
    if (changed.length === 0 && stale.length === 0) {
      console.log(`${LABEL} OK - ${rules.length} rule(s), ${outputs.size - 1} generated file(s) current`);
      return;
    }
    console.error(`${LABEL} the generated contracts are stale. Run \`npm run contracts:compile\` and commit the result.`);
    for (const rel of changed) console.error(`  - differs: ${rel}`);
    for (const rel of stale) console.error(`  - no longer produced: ${rel}`);
    process.exit(1);
  }
  write(outputs);
  console.log(`${LABEL} wrote ${outputs.size} file(s) from ${rules.length} rule(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
