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
  compileOutputs, deepestOwner, findDuplicates, GENERATED_MARKER, kernelBudget, loadRules,
  NESTED_ATTRIBUTES, NESTED_CONTRACT, OUTPUT_DIR, reportOutputs, scopeOwner,
} from './contracts-lib.mjs';
import { DRIVER_NAME, install as installMergeDriver, isInstalled } from './contracts-merge-driver.mjs';
import { measured } from './measured.mjs';

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
  const owned = ownedDirectories(root);
  const outputs = compileOutputs(rules, owned);
  problems.push(...kernelBudget(outputs).problems);
  return { rules, problems, outputs, owned };
}

/**
 * The directories whose `AGENTS.md` the compiler writes: the ones already carrying its marker.
 *
 * MIGRATING an area is what puts the marker there - the row replaces the hand-written contract
 * with a generated one - and from then on the compiler keeps it true. There is no second registry
 * of finished areas, because a registry and the files would eventually disagree and the files are
 * what gets loaded.
 *
 * A directory with NO contract is deliberately NOT owned. Recording one rule about `src/store`
 * must not quietly invent `src/store/AGENTS.md`, and a rule spanning two areas must not invent
 * `src/AGENTS.md` in a position forty chains load from. A new area gets its contract by somebody
 * creating the file with the marker in it, which is one visible line in a diff. Until then the
 * rule still reaches Claude Code through `.claude/rules/`, and `--report` names it.
 *
 * Found by SCANNING rather than derived from the rules, because a directory whose last rule was
 * deleted has to stay owned - otherwise its generated contract is stranded on disk with nothing
 * left that would notice.
 */
export function ownedDirectories(root) {
  const owned = new Set();
  for (const file of contractsUnder(root)) {
    if (readFileSync(path.join(root, file), 'utf8').includes(GENERATED_MARKER)) {
      // `dirname` answers '.' for a file at the root; the scope vocabulary calls that ''.
      const dir = path.posix.dirname(file);
      owned.add(dir === '.' ? '' : dir);
    }
  }
  return owned;
}

/** Directories the walk never enters - none holds a contract, and the first two are enormous. */
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report', 'test-results']);

/** Every nested `AGENTS.md` in the tree, repo-relative and posix. */
function contractsUnder(root, dir = '', out = []) {
  for (const entry of readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name)) contractsUnder(root, rel, out);
    } else if (entry.name === NESTED_CONTRACT) out.push(rel);
  }
  return out;
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
      const rel = ownedDir === '' ? name : `${ownedDir}/${name}`;
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

  // WHAT THIS COMPILER ACTUALLY RESOLVED, on every path - the report, `--check` and the write.
  measured(rules.length, 'rules in the store');
  // The second count is the one that matters. `ownedDirectories` finds a directory by looking for
  // GENERATED_MARKER inside its AGENTS.md, so if that string ever changes, `owned` comes back
  // empty: `compileOutputs` then writes no nested contract, `staleOutputs` finds none to remove,
  // and `--check` reports "generated file(s) current" and exits 0 while every nested contract has
  // silently stopped being maintained. The marker is exactly the kind of resolution measured.mjs
  // exists for.
  measured(owned.size, 'directories the compiler owns');

  if (args.includes('--report')) {
    for (const { file, bytes } of reportOutputs(outputs)) console.log(`${String(bytes).padStart(7)}  ${file}`);
    const kernel = kernelBudget(outputs);
    console.log(`${LABEL} ${rules.length} rule(s), ${outputs.size - 1} generated contract file(s); kernel ${kernel.bytes} of ${kernel.max} bytes`);
    // A rule Codex cannot reach. Claude Code loads it from .claude/rules/ whatever happens, but
    // Codex reads AGENTS.md files, so a rule whose area has not migrated reaches Codex only
    // through that area's remaining prose - which is fine mid-migration and invisible without
    // this line. Reported, never refused: during phase 2b it is true of almost every rule.
    const homeless = rules.filter((r) => r.status === 'active' && !r.carried && !deepestOwner(scopeOwner(r.scope), owned));
    if (homeless.length > 0) {
      console.log(`${LABEL} ${homeless.length} rule(s) reach Codex only through prose, because no migrated directory owns them:`);
      for (const rule of homeless) console.log(`    ${rule.id}  (scope ${rule.scope.join(', ')})`);
    }
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
