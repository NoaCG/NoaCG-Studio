#!/usr/bin/env node
// All the folder guidance for some paths - the on-demand half of the compiled contracts.
//
//   npm run rules -- src/components/wizard/steps/BrowseStep.tsx e2e/wizard-filters.spec.ts
//   npm run rules -- --area wizard
//
// Claude Code loads folder guidance by itself when it reads a file (.claude/rules/ and the
// folder CLAUDE.md wrappers). Codex loads AGENTS.md files only from the root down to where it
// started, so a Codex session started at the root runs this before editing, as the root contract
// tells it to - measured on 2026-09-26: it does, once, with every file it plans to touch.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GENERATED_MARKER, parseRule, RULES_DIR, rulesFor } from './contracts-lib.mjs';

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

/**
 * The store PARSED but not validated. `loadRules` also checks every scope against the file tree,
 * which takes about fifteen seconds - longer than a Codex shell command is given - and a lookup
 * only needs each rule's text and scope; `npm run check:contracts` is the validation.
 */
function parsedRules(root = ROOT) {
  const dir = path.join(root, RULES_DIR);
  return readdirSync(dir, { recursive: true })
    .filter((f) => String(f).endsWith('.md'))
    .map((f) => parseRule(`${RULES_DIR}/${String(f).replaceAll('\\', '/')}`, readFileSync(path.join(dir, String(f)), 'utf8')).rule)
    .filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  const rules = parsedRules();
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
  const relPaths = args.map((file) => path.relative(ROOT, path.resolve(file)).replaceAll('\\', '/'));
  for (const { contract, text } of folderContracts(relPaths)) console.log(`===== ${contract}\n\n${text}\n`);
  const selected = relPaths.flatMap((rel) => rulesFor(rules, rel)).filter((r) => !(r.scope.length === 1 && r.scope[0] === '**'));
  const unique = [...new Map(selected.map((r) => [r.id, r])).values()];
  if (unique.length > 0) console.log('===== rules scoped to these paths\n');
  for (const rule of unique) {
    console.log(`- ${rule.kind} \`${rule.id}\` (${rule.fires}): ${rule.body.replace(/\s*\n\s*/g, ' ')}`);
  }
  console.log('\n[rules] this is all the folder guidance for these paths; the folder AGENTS.md files add nothing to it.');
}

// Only when a person runs it. `text()` above is imported by the gates that carry a rule, and an
// import must not print the whole contract as a side effect.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
