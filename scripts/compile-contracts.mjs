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
  compileOutputs, findDuplicates, GENERATED_MARKER, kernelBudget, loadRules,
  NESTED_ATTRIBUTES, NESTED_CONTRACT, OUTPUT_DIR, reportOutputs, ruleHomes,
} from './contracts-lib.mjs';
import { DRIVER_NAME, SKIP_INSTALL_ENV, install as installMergeDriver, isInstalled } from './contracts-merge-driver.mjs';
import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LABEL = '[compile-contracts]';

/**
 * Everything the store says the generated tree should be, plus every problem found on the way.
 * The outputs are rendered even when there are problems, so a caller that forgets to look at
 * `problems` cannot hand `write()` an empty map and erase the compiled tree.
 */
export function plan(root = ROOT) {
  const { rules, problems, treeUnknown } = loadRules(root);
  for (const pair of findDuplicates(rules)) {
    problems.push(
      `${pair.a} and ${pair.b} read as the same rule (similarity ${pair.score.toFixed(2)}) - ` +
        'keep one, and mark the other `status: retired` with `supersedes:` on the survivor',
    );
  }
  const owned = ownedDirectories(root);
  const outputs = compileOutputs(rules, owned);
  problems.push(...kernelBudget(outputs).problems);
  return { rules, problems, outputs, owned, treeUnknown };
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

/**
 * Directories the walk never enters - none holds a contract, and the first two are enormous. A
 * `.tmp-` directory is scratch that another process made and is about to delete
 * (`scripts/api-runtime-build.mjs` makes one per API compile, several per test run), so it is
 * skipped by name as well.
 */
const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'playwright-report', 'test-results']);
const isScratch = (name) => name.startsWith('.tmp-');

/**
 * Every nested `AGENTS.md` in the tree, repo-relative and posix.
 *
 * A DIRECTORY THAT VANISHES MID-WALK IS SKIPPED, NOT FATAL. The walk lists a directory and then
 * reads each child, and anything else running in the checkout can delete a child in between.
 * On 2026-09-10 the compile inside the merge driver's unit test died on CI (run 34537651787) with
 * its reason thrown away, and main went red on it. Walking the checkout while other processes
 * create and delete `.tmp-` directories reproduces that death: `ENOENT: scandir`, twice in ten
 * compiles. A directory that no longer exists holds no contract anybody will load. The ROOT
 * vanishing is still an error. `readdir` is a parameter so the test can make a directory vanish
 * on cue instead of racing for it.
 */
export function contractsUnder(root, dir = '', out = [], readdir = readdirSync) {
  let entries;
  try {
    entries = readdir(path.join(root, dir), { withFileTypes: true });
  } catch (error) {
    if (dir !== '' && error?.code === 'ENOENT') return out;
    throw error;
  }
  for (const entry of entries) {
    const rel = dir ? `${dir}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (!SKIP.has(entry.name) && !isScratch(entry.name)) contractsUnder(root, rel, out, readdir);
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

/**
 * A plan that owns directories and produces a contract for NONE of them.
 *
 * `nestedContracts` only yields a directory that has at least one ACTIVE rule, so a store that
 * comes back empty or half-read renders no nested contract at all - and every owned directory's
 * `AGENTS.md` and `.gitattributes` then answer `staleOutputs`' question with "no longer produced".
 * That is how this repository's own contracts deleted themselves twice on 2026-09-23, in two
 * worktrees, while nine directories were still plainly owned: the marker the compiler resolves
 * ownership by lives in the very files it removed, so one bad read takes the set and the next
 * compile cannot tell the set was ever there. Nothing committed them, but a session running
 * `git add -A` in that window would have landed the deletion of the whole rule store.
 *
 * TWO OR MORE OWNED DIRECTORIES IS THE TEST, and the number is doing real work. Retiring the last
 * rule of ONE area is ordinary: its contract is stale and must go, which is exactly what
 * `staleOutputs` is for, and a tree with a single owned directory cannot tell that apart from the
 * failure. Several areas falling silent in the same breath cannot happen a rule at a time - every
 * kernel rule would have to leave at once - so it is the read, not the store. Refuse, say what was
 * resolved, and let a person look. `contractsUnder` already treats a vanished ROOT the same way,
 * for the same reason: a compile of nothing must never be read as "nothing belongs here".
 */
export function degeneratePlan(outputs, owned) {
  if (owned.size < 2) return false;
  for (const dir of owned) {
    if (outputs.has(dir === '' ? NESTED_CONTRACT : `${dir}/${NESTED_CONTRACT}`)) return false;
  }
  return true;
}

/** The message both the write path and `--check` print, so they cannot describe this differently. */
export function degenerateReason(rules, owned) {
  return (
    `${LABEL} REFUSED: ${owned.size} directory(ies) carry the compiler's marker and the store ` +
    `rendered a contract for none of them (${rules.length} rule(s) loaded). Something is wrong ` +
    'with the READ, not with the tree: nothing is written and nothing is deleted. Check that ' +
    '`contracts/rules/` is intact and that no other process is rewriting it, then run again.'
  );
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

/**
 * How many generated files one compile may remove before it has to be a person's decision.
 *
 * A real removal is small and deliberate: an area migrates away, or its last rule leaves, and that
 * is one or two files. Seventeen at once is the failure this ceiling exists for, and it holds
 * whatever the cause - a failed `git ls-files`, a half-read store, a caller passing a fixture plan
 * against the real checkout. The number is deliberately just above what an honest change needs, so
 * a legitimate larger removal says so with `--prune` and is visible in the command that ran.
 */
export const MAX_DELETIONS = 4;

export function write(outputs, root = ROOT, owned = new Set(), { prune = false } = {}) {
  // The guards sit HERE rather than only in `main`, because the deletions that started this were
  // made by a caller inside a test rather than by the command line.
  if (degeneratePlan(outputs, owned)) throw new Error(degenerateReason([], owned));
  const stale = staleOutputs(outputs, root, owned);
  if (!prune && stale.length > MAX_DELETIONS) {
    throw new Error(
      `${LABEL} REFUSED: this compile would delete ${stale.length} generated file(s), more than the ` +
        `${MAX_DELETIONS} an ordinary change removes. Nothing was written and nothing was deleted. ` +
        `If the removal is real, run \`npm run contracts:compile -- --prune\`. Files: ${stale.join(', ')}`,
    );
  }
  for (const [rel, content] of outputs) {
    const file = path.join(root, rel);
    // A file whose bytes are already right is left alone. `writeFileSync` truncates before it
    // writes, so rewriting an identical file still leaves a moment in which a concurrent reader
    // finds it empty - and the merge driver's test regenerates every contract in the real
    // checkout while the build's other tests are reading them.
    if (existsSync(file) && readFileSync(file, 'utf8') === content) continue;
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content, 'utf8');
  }
  for (const rel of stale) unlinkSync(path.join(root, rel));
}

function main() {
  const args = process.argv.slice(2);
  const { rules, problems, outputs, owned, treeUnknown } = plan();
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

  // Before anything reads the tree as an instruction to change it. `--report` is exempt: it only
  // prints, and a degenerate plan is exactly the thing somebody would run `--report` to look at.
  // A TREE THE COMPILER COULD NOT READ DECIDES NOTHING. `git ls-files` failing inside a checkout
  // makes every rule look like it matches no file, which is the read that ends in the compiler
  // deleting the contracts it owns. `--report` only prints, so it is exempt.
  if (!args.includes('--report') && treeUnknown) {
    console.error(
      `${LABEL} REFUSED: \`git ls-files\` failed in this checkout, so the file tree is unknown and ` +
        'every rule would look like it matches nothing. Nothing was written and nothing was deleted. ' +
        'Run it again where git works.',
    );
    process.exit(1);
  }

  if (!args.includes('--report') && degeneratePlan(outputs, owned)) {
    console.error(degenerateReason(rules, owned));
    process.exit(1);
  }

  if (args.includes('--report')) {
    for (const { file, bytes } of reportOutputs(outputs)) console.log(`${String(bytes).padStart(7)}  ${file}`);
    const kernel = kernelBudget(outputs);
    console.log(`${LABEL} ${rules.length} rule(s), ${outputs.size - 1} generated contract file(s); kernel ${kernel.bytes} of ${kernel.max} bytes`);
    // A rule Codex cannot reach. Claude Code loads it from .claude/rules/ whatever happens, but
    // Codex reads AGENTS.md files, so a rule whose area has not migrated reaches Codex only
    // through that area's remaining prose - which is fine mid-migration and invisible without
    // this line. Reported, never refused: during phase 2b it is true of almost every rule.
    const homeless = rules.filter((r) => r.status === 'active' && !r.carried && ruleHomes(r.scope, owned).length === 0);
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
      // Reported, never failed. A merge driver that is missing or stale costs nothing on a runner
      // that never resolves a conflict; it costs a person their next merge of a generated
      // contract. `isInstalled` compares the command, not just the key, so this also catches the
      // absolute path an older version of the driver left behind.
      if (!isInstalled()) console.log(`${LABEL} note: the ${DRIVER_NAME} merge driver is not registered in this clone, or is registered with a stale command - run \`npm run contracts:compile\` to set it.`);
      return;
    }
    console.error(`${LABEL} the generated contracts are stale. Run \`npm run contracts:compile\` and commit the result.`);
    for (const rel of changed) console.error(`  - differs: ${rel}`);
    for (const rel of stale) console.error(`  - no longer produced: ${rel}`);
    process.exit(1);
  }
  write(outputs, ROOT, owned, { prune: args.includes('--prune') });
  // Registered here rather than by a setup step nobody runs: this is the command every session
  // already runs after touching a rule, git config is per clone so a fresh checkout has it
  // missing, and registering it again costs two `git config` writes.
  //
  // Unconditionally, and that is the point. The previous version asked `isInstalled()` first,
  // which read presence alone, so the absolute worktree path an early checkout registered stood
  // untouched after that worktree was deleted - dead for weeks with nothing said.
  //
  // The exception is the merge driver's own child process, which sets SKIP_INSTALL_ENV: a merge
  // is in progress, every worktree of the clone shares the `.git/config` this would write, and a
  // driver that is running is a driver that is already registered.
  if (process.env[SKIP_INSTALL_ENV] !== '1' && !installMergeDriver()) {
    console.log(`${LABEL} note: could not register merge.${DRIVER_NAME}.driver in this clone.`);
  }
  console.log(`${LABEL} wrote ${outputs.size} file(s) from ${rules.length} rule(s)`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
