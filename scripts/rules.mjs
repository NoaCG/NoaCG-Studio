#!/usr/bin/env node
// All the folder guidance for some paths - the on-demand half of the compiled contracts.
//
//   npm run rules -- src/components/wizard/steps/BrowseStep.tsx e2e/wizard-filters.spec.ts
//   npm run rules -- --area wizard
//   npm run rules -- --loaded src/templates/tickers/AGENTS.md src/templates/tickers/tk01.ts
//
// Claude Code loads folder guidance by itself when it reads a file (.claude/rules/ and the
// folder CLAUDE.md wrappers). Codex loads AGENTS.md files only from the root down to where it
// started, so a Codex session started at the root runs this before editing, as the root contract
// tells it to - measured on 2026-09-26: it does, once, with every file it plans to touch.

import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_MARKER, parseRules, RULES_DIR, rulesFor, validateAgainstTree } from './contracts-lib.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * ONE RULE'S SENTENCE, for the mechanism that carries it.
 *
 * A rule whose `fires:` names a hook, a gate or a spec is CARRIED: the compiler omits it from
 * every loaded contract, because the mechanism is supposed to say it at the moment it matters.
 * That only works if the mechanism actually prints the sentence, and until 2026-09-08 nothing
 * checked - so four rules were deleted from every surface by a `fires:` line and reappeared
 * nowhere. `scripts/contracts-lib.mjs` now proves the claim by looking for this call in the
 * mechanism's source, which is why the id goes in as a literal.
 *
 * Throws on an unknown id rather than returning an empty string: a gate printing nothing where
 * its rule should be is the failure this exists to prevent.
 *
 * Reads the one file the id names rather than the whole store: loading and validating every rule
 * takes seconds, and a hook calls this on every matching tool call.
 */
export function text(id) {
  const file = path.join(ROOT, RULES_DIR, `${id}.md`);
  if (!existsSync(file)) throw new Error(`[rules] no rule \`${id}\` in the store - the mechanism names a rule that is not there`);
  const body = readFileSync(file, 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/^---\n[\s\S]*?\n---\n/, '');
  return body.trim().replace(/\s*\n\s*/g, ' ');
}

/**
 * The hand-written folder contracts on the way from the root down to each path, in order and
 * once each. The root is left out (every session already has it) and so are generated contracts
 * (their rules are what `rulesFor` prints). Codex reads a folder's AGENTS.md only when it STARTS
 * in that folder, so for a session started at the root this is how a folder contract reaches it.
 */
export function folderContracts(relPaths, root = ROOT) {
  const seen = new Set();
  const out = [];
  for (const rel of relPaths) {
    const full = path.join(root, rel);
    const dir = existsSync(full) && statSync(full).isDirectory() ? rel : path.dirname(rel);
    const parts = dir.split(/[\\/]/).filter((p) => p && p !== '.');
    for (let i = 1; i <= parts.length; i += 1) {
      const contract = path.posix.join(...parts.slice(0, i), 'AGENTS.md');
      if (seen.has(contract)) continue;
      seen.add(contract);
      const file = path.join(root, contract);
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
      if (!text.includes(GENERATED_MARKER)) out.push({ contract, text: text.trim() });
    }
  }
  return out;
}

/** Explicit native loads, not guessed from cwd: a session can change its shell directory. */
export function loadedGuidance(files, root = ROOT) {
  const contracts = new Set();
  const ids = new Set();
  for (const file of files) {
    const rel = path.relative(root, path.resolve(root, file)).replaceAll('\\', '/');
    if (rel === '..' || rel.startsWith('../') || path.isAbsolute(rel)
      || !['AGENTS.md', 'AGENTS.override.md'].includes(path.basename(rel))) {
      throw new Error(`[rules] --loaded must name an instruction file inside this checkout: ${file}`);
    }
    // Fail on a typo instead of silently claiming to have deduplicated a missing file.
    const body = readFileSync(path.join(root, rel), 'utf8');
    contracts.add(rel);
    if (body.includes(GENERATED_MARKER)) {
      for (const match of body.matchAll(/^- \*\*\w+\*\* `([^`]+)`:/gm)) ids.add(match[1]);
    }
  }
  return { contracts, ids };
}

/** Keep sibling/file-scoped rules even when another rule in the same area was loaded. */
export function missingRules(rules, relPaths, loaded, root = ROOT) {
  const selected = relPaths.flatMap((rel) => rulesFor(rules, rel))
    .filter((r) => !(r.scope.length === 1 && r.scope[0] === '**') && !loaded.ids.has(r.id));
  return [...new Map(selected.map((r) => [r.id, r])).values()].filter((rule) => {
    // Use the compiler's carrier proof. An unproven carrier must not hide its sentence.
    validateAgainstTree(rule, root);
    return !rule.carried;
  });
}

function main() {
  const args = [];
  const loadedFiles = [];
  const input = process.argv.slice(2);
  const from = process.env.INIT_CWD || process.cwd();
  for (let i = 0; i < input.length; i += 1) {
    if (input[i] !== '--loaded') args.push(input[i]);
    else {
      if (!input[i + 1] || input[i + 1].startsWith('--')) throw new Error('[rules] --loaded needs an AGENTS.md path');
      loadedFiles.push(path.resolve(from, input[++i]));
    }
  }
  if (args.length === 0) {
    console.error('Usage: npm run rules -- [--loaded <AGENTS.md>] <files>   or   npm run rules -- --area <area>');
    process.exit(1);
  }
  // Parsed, not validated (`loadRules` takes about fifteen seconds, longer than a Codex shell
  // command is given).
  const rules = parseRules(ROOT);
  const areaIndex = args.indexOf('--area');
  if (areaIndex >= 0) {
    for (const rule of rules.filter((r) => r.status === 'active' && r.area === args[areaIndex + 1])) {
      console.log(`- ${rule.kind} \`${rule.id}\` (${rule.fires}): ${rule.body.replace(/\s*\n\s*/g, ' ')}`);
    }
    return;
  }
  // A path lookup is the complete folder guidance for those files, so a session reads nothing
  // else to get it: the hand-written folder contracts first, then the scoped rules - minus the
  // `**` rules, which already arrived with the root AGENTS.md.
  // `npm run` moves to the package root, so a relative path is resolved from where the caller
  // typed it (INIT_CWD), and a path outside this checkout has no folder guidance here.
  const relPaths = [];
  for (const file of args) {
    const rel = path.relative(ROOT, path.resolve(from, file));
    if (rel.startsWith('..') || path.isAbsolute(rel)) console.error(`[rules] ${file} is outside this checkout - skipped`);
    else relPaths.push(rel.replaceAll('\\', '/'));
  }
  const loaded = loadedGuidance(loadedFiles);
  for (const { contract, text } of folderContracts(relPaths)) {
    if (!loaded.contracts.has(contract)) console.log(`===== ${contract}\n\n${text}\n`);
  }
  const unique = missingRules(rules, relPaths, loaded);
  if (unique.length > 0) console.log('===== rules scoped to these paths\n');
  for (const rule of unique) {
    console.log(`- ${rule.kind} \`${rule.id}\` (${rule.fires}): ${rule.body.replace(/\s*\n\s*/g, ' ')}`);
  }
  console.log('\n[rules] folder guidance complete with the declared native loads; proven carried rules stay with their checks.');
}

// Only when a person runs it. `text()` above is imported by the gates that carry a rule, and an
// import must not print the whole contract as a side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
