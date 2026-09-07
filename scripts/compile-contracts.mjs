#!/usr/bin/env node
// gate: build
// guards: contracts/**, .claude/rules/**
//
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
  compileOutputs, findDuplicates, GENERATED_MARKER, globDirectory, kernelBudget, loadRules,
  NESTED_ATTRIBUTES, NESTED_CONTRACT, OUTPUT_DIR, reportOutputs,
} from './contracts-lib.mjs';
import { DRIVER_NAME, install as installMergeDriver, isInstalled } from './contracts-merge-driver.mjs';

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
  const owned = ownedDirectories(root, candidateDirectories(rules));
  const outputs = compileOutputs(rules, owned);
  problems.push(...kernelBudget(outputs).problems);
  return { rules, problems, outputs, owned };
}

/**
 * The directories whose `AGENTS.md` the compiler writes.
 *
 * A directory is owned once its contract carries the generated marker - which is what MIGRATING
 * an area does: the row replaces the hand-written file with a generated one, and from then on the
 * compiler keeps it true. There is no second registry saying which areas are done, because a
 * registry and the files would eventually disagree and the files are the thing that gets loaded.
 *
 * A directory that has rules and no `AGENTS.md` at all is owned too - there is nothing to clobber
 * - which is how a brand-new area gets its first contract without a migration step.
 */
export function ownedDirectories(root, dirs) {
  const owned = new Set();
  for (const dir of dirs) {
    const file = path.join(root, dir, NESTED_CONTRACT);
    if (!existsSync(file) || readFileSync(file, 'utf8').includes(GENERATED_MARKER)) owned.add(dir);
  }
  return owned;
}

/** Every directory a rule's scope points at, and their ancestors - the only ones worth asking about. */
function candidateDirectories(rules) {
  const dirs = new Set();
  for (const rule of rules) {
    if (rule.status !== 'active') continue;
    for (const glob of rule.scope) {
      let dir = globDirectory(glob);
      while (dir !== '') {
        dirs.add(dir);
        dir = dir.split('/').slice(0, -1).join('/');
      }
    }
  }
  return [...dirs];
}

/**
 * Generated files on disk that the store no longer produces.
 *
 * Two kinds, found two ways. Under `.claude/rules/` every `.md` is generated, so the directory
 * listing is the answer. A nested `AGENTS.md` sits among hand-written ones, so the only safe test
 * is the marker in the file itself - and it is the same test `ownedDirectories` uses, so a file
 * the compiler stopped producing is exactly a file it would still claim to own.
 */
function staleOutputs(outputs, root, owned = new Set()) {
  const stale = [];
  const dir = path.join(root, OUTPUT_DIR);
  if (existsSync(dir)) {
    stale.push(...readdirSync(dir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => `${OUTPUT_DIR}/${name}`)
      .filter((rel) => !outputs.has(rel)));
  }
  for (const ownedDir of owned) {
    for (const name of [NESTED_CONTRACT, NESTED_ATTRIBUTES]) {
      const rel = `${ownedDir}/${name}`;
      if (outputs.has(rel)) continue;
      const file = path.join(root, rel);
      if (existsSync(file) && readFileSync(file, 'utf8').includes(GENERATED_MARKER)) stale.push(rel);
    }
  }
  return stale.sort();
}

/** The files whose content on disk differs from the plan (LF-normalised), and the stale ones. */
export function drift(outputs, root = ROOT, owned = new Set()) {
  const changed = [];
  for (const [rel, content] of outputs) {
    const file = path.join(root, rel);
    const current = existsSync(file) ? readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : null;
    if (current !== content) changed.push(rel);
  }
  return { changed, stale: staleOutputs(outputs, root, owned) };
}

export function write(outputs, root = ROOT, owned = new Set()) {
  for (const [rel, content] of outputs) {
    const file = path.join(root, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  for (const rel of staleOutputs(outputs, root, owned)) unlinkSync(path.join(root, rel));
}

function main() {
  const args = process.argv.slice(2);
  const { rules, problems, outputs, owned } = plan();
  if (problems.length > 0) {
    console.error(`${LABEL} ${problems.length} problem(s) in ${rules.length} rule file(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (args.includes('--report')) {
    for (const { file, bytes } of reportOutputs(outputs)) console.log(`${String(bytes).padStart(7)}  ${file}`);
    const kernel = kernelBudget(outputs);
    console.log(`${LABEL} ${rules.length} rule(s), ${outputs.size - 1} generated contract file(s); kernel ${kernel.bytes} of ${kernel.max} bytes`);
    return;
  }
  if (args.includes('--check')) {
    const { changed, stale } = drift(outputs, ROOT, owned);
    if (changed.length === 0 && stale.length === 0) {
      console.log(`${LABEL} OK - ${rules.length} rule(s), ${outputs.size - 1} generated file(s) current`);
      // Reported, never failed. A missing merge driver costs nothing on a runner that never
      // resolves a conflict; it costs a person their next merge of a generated contract.
      if (!isInstalled()) console.log(`${LABEL} note: the ${DRIVER_NAME} merge driver is not registered in this clone - run \`npm run contracts:compile\` to register it.`);
      return;
    }
    console.error(`${LABEL} the generated contracts are stale. Run \`npm run contracts:compile\` and commit the result.`);
    for (const rel of changed) console.error(`  - differs: ${rel}`);
    for (const rel of stale) console.error(`  - no longer produced: ${rel}`);
    process.exit(1);
  }
  write(outputs, ROOT, owned);
  // Registered here rather than by a setup step nobody runs: this is the command every session
  // already runs after touching a rule, git config is per clone so a fresh checkout has it
  // missing, and registering it twice costs one `git config` write.
  if (!isInstalled()) installMergeDriver();
  console.log(`${LABEL} wrote ${outputs.size} file(s) from ${rules.length} rule(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
